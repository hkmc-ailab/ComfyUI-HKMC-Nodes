import os
import re
import json
import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image, ImageOps
import cv2
import torchaudio
import requests
import google.generativeai as genai
from openai import OpenAI
import folder_paths
from server import PromptServer
from aiohttp import web

def load_image_raw_tensor(filename):
    input_dir = folder_paths.get_input_directory()
    image_path = os.path.join(input_dir, filename)
    if not os.path.exists(image_path): return None
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)
    image_np = np.array(img.convert("RGB")).astype(np.float32) / 255.0
    return torch.from_numpy(image_np)[None,]

def load_video_tensor(filename):
    input_dir = folder_paths.get_input_directory()
    video_path = os.path.join(input_dir, filename)
    if not os.path.exists(video_path): return None
    cap = cv2.VideoCapture(video_path)
    frames = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frames.append(torch.from_numpy(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0))
    cap.release()
    return torch.stack(frames, dim=0) if frames else None

import scipy.io.wavfile as wavfile
def load_audio_dict(filename):
    input_dir = folder_paths.get_input_directory()
    audio_path = os.path.join(input_dir, filename)
    if not os.path.exists(audio_path): return None
    try:
        sample_rate, data = wavfile.read(audio_path)
        if data.dtype == np.int16: data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32: data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8: data = (data.astype(np.float32) - 128.0) / 128.0
        else: data = data.astype(np.float32)
        tensor = torch.from_numpy(data)
        if tensor.ndim == 1: tensor = tensor.unsqueeze(0)
        elif tensor.ndim == 2: tensor = tensor.t()
        return {"waveform": tensor.unsqueeze(0), "sample_rate": int(sample_rate)}
    except:
        pass
    return None

def universal_resize(tensor, target_w, target_h, mode="crop", crop_pos="center"):
    if tensor is None:
        return torch.zeros((1, target_h, target_w, 3), dtype=torch.float32)
    b, h, w, c = tensor.shape
    if h == target_w and w == target_w: return tensor

    img = tensor.movedim(-1, 1)
    if mode == "stretch":
        img = F.interpolate(img, size=(target_h, target_w), mode="bilinear", align_corners=False)
        return img.movedim(1, -1)
    elif mode == "crop":
        scale = max(target_w / w, target_h / h)
        new_w, new_h = round(w * scale), round(h * scale)
        img = F.interpolate(img, size=(new_h, new_w), mode="bilinear", align_corners=False)
        diff_w = new_w - target_w
        diff_h = new_h - target_h
        if crop_pos == "top": sy, sx = 0, diff_w // 2
        elif crop_pos == "bottom": sy, sx = diff_h, diff_w // 2
        elif crop_pos == "left": sy, sx = diff_h // 2, 0
        elif crop_pos == "right": sy, sx = diff_h // 2, diff_w
        else: sy, sx = diff_h // 2, diff_w // 2
        img = img[:, :, sy:sy + target_h, sx:sx + target_w]
        return img.movedim(1, -1)
    elif mode == "pad":
        scale = min(target_w / w, target_h / h)
        new_w, new_h = round(w * scale), round(h * scale)
        img = F.interpolate(img, size=(new_h, new_w), mode="bilinear", align_corners=False)
        diff_w = target_w - new_w
        diff_h = target_h - new_h
        pad_left = diff_w // 2
        pad_right = diff_w - pad_left
        pad_top = diff_h // 2
        pad_bottom = diff_h - pad_top
        img = F.pad(img, (pad_left, pad_right, pad_top, pad_bottom), mode="constant", value=0.0)
        return img.movedim(1, -1)
    return tensor

def process_video_tensor(tensor, target_w, target_h, mode="crop", crop_pos="center", min_frames=5):
    if tensor is None:
        return torch.zeros((min_frames, target_h, target_w, 3), dtype=torch.float32)
    resized_frames = universal_resize(tensor, target_w, target_h, mode=mode, crop_pos=crop_pos)
    b, h, w, c = resized_frames.shape
    if b < min_frames:
        repeats = (min_frames + b - 1) // b
        resized_frames = resized_frames.repeat(repeats, 1, 1, 1)[:min_frames]
    return resized_frames

def normalize_time_expression(text):
    if not text or not text.strip():
        return "0:00.0-0:05.0"
    t = text.strip()

    def parse_sec(val_str):
        val_str = val_str.replace("秒", "").strip()
        m, s = 0, 0.0
        if "分" in val_str:
            parts = val_str.split("分")
            m = int(parts[0].strip() or 0)
            s = float(parts[1].strip() or 0.0)
        elif ":" in val_str:
            parts = val_str.split(":")
            m = int(parts[0].strip() or 0)
            s = float(parts[1].strip() or 0.0)
        else:
            try: s = float(val_str)
            except: s = 0.0
        total_sec = m * 60 + s
        return f"{int(total_sec // 60)}:{total_sec % 60:04.1f}"

    for d in ["〜", "~", "-", "ー", "to"]:
        if d in t:
            parts = t.split(d, 1)
            return f"{parse_sec(parts[0])}-{parse_sec(parts[1])}"
            
    return t

def unload_ollama_vram(model_name):
    if not model_name: return
    url = "http://localhost:11434/api/generate"
    payload = {"model": model_name, "keep_alive": 0}
    try:
        requests.post(url, json=payload, timeout=5)
    except:
        pass

def build_and_generate_prompt(kwargs):
    def process_wildcards(text):
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        def replace_match(match):
            char_name = match.group(1)
            file_path = os.path.join(char_dir, f"{char_name}.txt")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            return match.group(0)
        return re.sub(r"__([a-zA-Z0-9_-]+)__", replace_match, text)

    def read_char_txt(name):
        if not name or name in ["None", "Custom Text", False]: return ""
        path = os.path.join(os.path.dirname(__file__), "characters", f"{name}.txt")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f: return f.read().strip()
        return ""

    subjects = []
    char_refs = {}

    for i in range(1, 4):
        if not kwargs.get(f"char{i}_enabled", (i == 1)):
            continue
        preset = kwargs.get(f"char{i}_preset", "None")
        if not preset or preset not in H3PromptDirectorGUI.get_character_files():
            preset = "None"
            
        name = kwargs.get(f"char{i}_name", "").strip()
        audio_ref = kwargs.get(f"char{i}_audio", "None")
        if not audio_ref or audio_ref not in ["None", "<Audio 0>", "<Audio 1>", "<Audio 2>"]:
            audio_ref = "None"
            
        extra = kwargs.get(f"char{i}_extra", "").strip()
        
        pics_raw = kwargs.get(f"char{i}_pics", "")
        pic_tags = [p.strip() for p in pics_raw.split(",") if p.strip()]

        desc_parts = []
        base_text = read_char_txt(preset)
        if base_text: desc_parts.append(base_text)
        
        if extra: 
            desc_parts.append(f"[Extra Details - STRICTLY TRANSLATE INTO ENGLISH WITHOUT INTERPRETATION]:\n{extra}")

        subj_idx = len(subjects) + 1
        label = name if name else (preset if preset not in ["None", "Custom Text"] else f"Character {i}")
        
        pics_str = ""
        if pic_tags:
            if len(pic_tags) > 1:
                pics_str = ", ".join(pic_tags[:-1]) + f" and {pic_tags[-1]}"
            else:
                pics_str = pic_tags[0]

        char_refs[subj_idx] = {
            "label": label,
            "pics": pic_tags,
            "pics_str": pics_str,
            "audio": audio_ref if audio_ref != "None" else None,
            "extra": extra
        }
        
        # この時点ではPython文字列として追加し、LLMに渡す
        combined = "\n".join(desc_parts).strip()
        if combined or name:
            subjects.append(f"[Subject {subj_idx}: {label}]\n{combined}")
            
    char_description = process_wildcards("\n\n".join(subjects))

    shots = []
    ordered_dialogues = []

    for i in range(1, 5):
        if not kwargs.get(f"shot{i}_enabled", False): continue
        raw_time = kwargs.get(f"shot{i}_time", "").strip()
        norm_time = normalize_time_expression(raw_time)

        action = kwargs.get(f"shot{i}_action", "").strip()
        dialogue_raw = kwargs.get(f"shot{i}_dialogue", "").strip()
        
        content = []
        if action: content.append(action)
        if dialogue_raw:
            lines = [l.strip() for l in dialogue_raw.split("\n") if l.strip()]
            for line in lines:
                spk = f"S{i}"
                dia = line
                if ":" in line:
                    parts = line.split(":", 1)
                    parsed_spk = parts[0].strip()
                    if re.match(r"^S\d+$", parsed_spk, re.IGNORECASE):
                        spk = parsed_spk.upper()
                        dia = parts[1].strip()
                    else:
                        dia = parts[1].strip()
                
                dia = re.sub(r'^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*', '', dia, flags=re.IGNORECASE)
                dia = re.sub(r'\s*(?:<\/d>|\[\/d\])?$', '', dia, flags=re.IGNORECASE).strip().strip('"').strip("'")
                
                if dia:
                    formatted_line = f"{spk}: <d>[Japanese] {dia} </d>"
                    content.append(formatted_line)
                    ordered_dialogues.append({"shot": len(shots) + 1, "speaker": spk, "dialogue": dia, "full": formatted_line})
        if content:
            shots.append(f"[Shot {len(shots) + 1} | {norm_time}]\n" + "\n".join(content))
    timeline_seq = "\n\n".join(shots)

    creative_mode = kwargs.get("creative_mode", "オフ")
    if creative_mode == "リッチ (小物・情景追加)":
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n"
            "- Act as a master anime scene director. ACTIVELY ENHANCE THE SCENE by adding fitting thematic props, background furniture, atmospheric lighting, and contextual environment elements that complement the scene.\n"
            "- **CRITICAL RULE: YOU MUST APPLY THIS ENHANCEMENT EXCLUSIVELY TO THE `summary:` SECTION. DO NOT TOUCH OTHER SECTIONS.**"
        )
    elif creative_mode == "控えめ (光・空気感)":
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n"
            "- Subtly enhance the atmosphere by adding cinematic lighting, time of day, and environmental ambiance (e.g., warm golden hour, gentle rim lighting).\n"
            "- **CRITICAL RULE: YOU MUST APPLY THIS ENHANCEMENT EXCLUSIVELY TO THE `summary:` SECTION. DO NOT TOUCH OTHER SECTIONS.**"
        )
    else:
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n"
            "- Strictly translate the situation faithfully without inventing unmentioned objects or extra atmospheric effects."
        )

    sys_inst = f"""
You are an expert prompt engineer specialized in the MiniMax H3 video generation model.
Your task is to strictly convert the user's Japanese instructions into an English structured prompt.

[ABSOLUTE FORMAT RULES - ZERO TOLERANCE]
1. Output MUST be 100% English except for Japanese dialogue inside `<d>[Japanese] ... </d>`.
2. You MUST output ONLY the following 6 exact section headers in raw plain text, strictly in this order. Do NOT add any extra headers, symbols, or markdown blocks:
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:

3. [SECTION RULES - STRICT SEPARATION]
- `subject_definitions:`
  MUST define characters using EXACTLY the header `[Subject X: CharacterName]`.
  MUST contain ONLY the character's physical appearance, clothing, and the exact English translation of the user's "Extra Details".
  Do NOT arbitrarily interpret or summarize the Extra Details; translate them faithfully.
  MUST retain tags like `<Picture 0>` exactly as they are without translation.

- `summary:`
  MUST contain ONLY the translation and atmospheric direction of the scene (シチュエーション＆世界観).
  {creative_instruction}
  CRITICAL: DO NOT include dialogue tags (<d>...</d>), DO NOT include speaker tags (S1:, S2:), and DO NOT describe speech here. Speech belongs strictly in `detailed_description:`.

- `retention_analysis:`
  MUST contain ONLY the translation of the user's "Retention" (禁止事項＆スタイル維持) plus the default rule: "Strictly 2D flat cel-shaded anime style. No 3D CGI rendering, no glossy plastic skin."

- `detailed_description:`
  MUST include EVERY shot header from "Movement & Timing" exactly as given (e.g., `[Shot 1 | 0:00.0-0:04.0]`). NEVER omit shot headers.
  Format actions per shot as: "[CharacterName] visibly opening and moving mouth in natural anime lip-sync articulation while speaking: SX: <d>[Japanese] DialogueText </d>"
  DO NOT use `[Subject X: ...]` tags here; use plain character names.

- `overall_soundscape:`
  MUST contain ONLY the translation of the user's "Soundscape".

- `non_diegetic_music:`
  MUST contain ONLY the translation of the user's "Music".

[User Input]
Character Concept: {char_description}
Situation: {kwargs.get('situation', '')}
Movement & Timing: {timeline_seq}
Retention: {kwargs.get('quality_control', '')}
Soundscape: {kwargs.get('ambient_sound', '')}
Music: {kwargs.get('bgm', '')}
"""
    provider = kwargs.get("llm_provider", "Ollama (Local)")
    api_key = kwargs.get("llm_api_key", "")
    model_name = kwargs.get("llm_model", "").strip()

    temp = 0.7 if creative_mode != "オフ" else 0.3

    if provider == "Gemini (Cloud)":
        active_key = api_key if api_key and api_key.strip() else os.getenv("GEMINI_API_KEY")
        if not active_key: raise ValueError("Gemini API Keyが設定されていません。")
        genai.configure(api_key=active_key)
        model = genai.GenerativeModel(model_name or "gemini-2.5-flash")
        prompt_result = model.generate_content(sys_inst).text.strip()

    elif provider == "ChatGPT (OpenAI)":
        active_key = api_key if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY")
        if not active_key: raise ValueError("OpenAI API Keyが設定されていません。")
        client = OpenAI(api_key=active_key)
        response = client.chat.completions.create(
            model=model_name or "gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert prompt engineer specialized in the MiniMax H3 video generation model."},
                {"role": "user", "content": sys_inst}
            ],
            temperature=temp
        )
        prompt_result = response.choices[0].message.content.strip()

    elif provider == "Ollama (Local)":
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model_name or "qwen2.5:7b-instruct-q5_K_M",
            "prompt": sys_inst,
            "stream": False,
            "options": {"temperature": temp}
        }
        res = requests.post(url, json=payload, timeout=300)
        res.raise_for_status()
        prompt_result = res.json().get("response", "").strip()
        unload_ollama_vram(model_name or "qwen2.5:7b-instruct-q5_K_M")
    else:
        raise ValueError(f"未知のLLMプロバイダー: {provider}")

    prompt_result = re.sub(r'\[d\]\s*\[Japanese\]', r'<d>[Japanese]', prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r'\[d\]', r'<d>[Japanese] ', prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r'\[\/d\]', r'</d>', prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r'<d>\s*(?!\[Japanese\])', r'<d>[Japanese] ', prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(
        r'(?<!visibly opening and moving mouth in natural anime lip-sync articulation while speaking: )(?<!articulation while speaking: )(S\d+:\s*<d>\[Japanese\])',
        r'visibly opening and moving mouth in natural anime lip-sync articulation while speaking: \1',
        prompt_result
    )

    if ordered_dialogues:
        for item in ordered_dialogues:
            target_dia = item["dialogue"]
            speaker = item["speaker"]
            
            pattern_no_spk = rf'(?<!{speaker}:\s)<d>\[Japanese\]\s*{re.escape(target_dia)}\s*<\/d>'
            if re.search(pattern_no_spk, prompt_result):
                prompt_result = re.sub(pattern_no_spk, f'{speaker}: <d>[Japanese] {target_dia} </d>', prompt_result)

    prompt_result = re.sub(r'禁止事項(?:＆|&)?スタイル維持:?', '', prompt_result)
    prompt_result = re.sub(r'\[S\d+:?\]\s*', '', prompt_result)
    prompt_result = re.sub(r'(?im)^Reference sheets for\s+[\w\s]+\s+include\s+<Picture\s*\d+>.*$', '', prompt_result)
    prompt_result = re.sub(r'(?im)^Vocal reference for\s+[\w\s]+\s+is\s+<Audio\s*\d+>.*$', '', prompt_result)

    if "summary:" not in prompt_result.lower():
        prompt_result = re.sub(
            r'(\n\n)([^\n]+)(\n+retention_analysis:)',
            r'\1summary:\n\2\3',
            prompt_result,
            flags=re.IGNORECASE
        )

    def clean_summary_content(match):
        body = match.group(2)
        body = re.sub(r'<d>.*?</d>', '', body, flags=re.DOTALL)
        body = re.sub(r'S\d+:.*?(?=\.|\n|$)', '', body)
        body = re.sub(r'[^.\n]*visibly open[^.\n]*\.', '', body, flags=re.IGNORECASE)
        body = re.sub(r'[^.\n]*while speaking:?[^.\n]*\.', '', body, flags=re.IGNORECASE)
        body = re.sub(r'Thematic props include.*?tank top.*?\.', '', body, flags=re.IGNORECASE)
        clean_text = "\n".join([line.strip() for line in body.splitlines() if line.strip()])
        return f"summary:\n{clean_text}\n\n"
    
    prompt_result = re.sub(r'(summary:\s*)(.*?)(?=\n\s*retention_analysis:)', clean_summary_content, prompt_result, flags=re.DOTALL | re.IGNORECASE)
    prompt_result = re.sub(r'\[Subject\s*\d+:\s*([^\]]+)\]', r'\1', prompt_result)
    prompt_result = re.sub(r'\[S\d+:\s*([^\]]+)\]', r'\1', prompt_result)

    if shots:
        for idx, shot_text in enumerate(shots, start=1):
            time_tag_match = re.search(rf'\[Shot\s*{idx}\s*\|\s*[^\]]+\]', shot_text)
            if time_tag_match:
                time_header = time_tag_match.group(0)
                if f"[Shot {idx}" not in prompt_result:
                    spk_target = f"S{idx}:"
                    pattern = rf'(?:\n|\A)(?:([^\n:]+?visibly opening[^\n:]*speaking[^\n:]*:\s*{spk_target}))'
                    if re.search(pattern, prompt_result):
                        prompt_result = re.sub(pattern, rf'\n\n{time_header}\n\1', prompt_result, count=1)

    prompt_result = re.sub(r'(?<!<)\bPicture\s*(\d+)\b(?!>)', r'<Picture \1>', prompt_result)
    prompt_result = re.sub(r'(?<!<)\bAudio\s*(\d+)\b(?!>)', r'<Audio \1>', prompt_result)
    prompt_result = re.sub(r'(<\/d>)\s*\([^)]+\)', r'\1', prompt_result)
    prompt_result = re.sub(r'\bSX:\s*', '', prompt_result)

    for idx, refs in sorted(char_refs.items(), key=lambda x: x[0]):
        label = refs["label"]
        extra_text = refs.get("extra", "")
        
        ref_parts = []
        if refs["pics"]:
            ref_parts.append(f"Reference sheets for {label} include {refs['pics_str']}.")
        if refs["audio"] and refs["audio"] != "None":
            ref_parts.append(f"Vocal reference for {label} is {refs['audio']}.")
        ref_line = " ".join(ref_parts)

        subj_pat = rf'(\[Subject\s*{idx}\s*:[^\]]*\])(.*?)(?=\n\s*\[Subject|\n\n[a-z_]+:|\Z)'
        match = re.search(subj_pat, prompt_result, re.DOTALL | re.IGNORECASE)
        
        if match:
            header = f"[Subject {idx}: {label}]"
            body = match.group(2).strip()

            for p in refs["pics"]:
                if p in extra_text and p not in body:
                    body += f" {p} shows the same character's appearance and reference angles."

            new_body = f"{body}\n{ref_line}\n"
            prompt_result = prompt_result[:match.start()] + header + "\n" + new_body + prompt_result[match.end():]
        else:
            name_pat = rf'(?i)(?:\b{re.escape(label)}\b[\s\S]*?)(?=\n\s*(?:\[Subject|[A-Z][a-z]+|\n\n[a-z_]+:)|\Z)'
            name_match = re.search(name_pat, prompt_result)
            if name_match:
                body = name_match.group(0).strip()
                block = f"[Subject {idx}: {label}]\n{body}\n{ref_line}\n\n"
                prompt_result = prompt_result[:name_match.start()] + block + prompt_result[name_match.end():]
    prompt_result = re.sub(r'speaking with <Audio \d+>:\s*', 'speaking: ', prompt_result)
    prompt_result = re.sub(r'"<([^>]+)>"', r'"\1"', prompt_result)
    prompt_result = re.sub(r'(?m)^\[Subject\s*\d+:[^\]]+\]\s*$(?=\n\s*\[Subject)', '', prompt_result)
    prompt_result = re.sub(
        r'(?:,\s*speaking(?:[^\n:]*)?:?|,\s*delivering[^\n:]*:?|,\s*speaking the line:?)+\s*(visibly opening and moving mouth in natural anime lip-sync articulation while speaking:)',
        r', \1',
        prompt_result,
        flags=re.IGNORECASE
    )
    prompt_result = re.sub(r'^(summary:)\s*\n+', r'\1\n', prompt_result, flags=re.MULTILINE | re.IGNORECASE)
    prompt_result = re.sub(r'\n{3,}', '\n\n', prompt_result).strip()
    return prompt_result

@PromptServer.instance.routes.post("/h3/generate_prompt")
async def handle_generate_prompt(request):
    try:
        data = await request.json()
        result = build_and_generate_prompt(data)
        return web.json_response({"success": True, "prompt": result})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

class H3PromptDirectorGUI:
    @classmethod
    def get_character_files(cls):
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        os.makedirs(char_dir, exist_ok=True)
        files = [f.replace(".txt", "") for f in os.listdir(char_dir) if f.endswith(".txt")]
        files.sort()
        return ["None", "Custom Text"] + files

    @classmethod
    def INPUT_TYPES(cls):
        char_list = cls.get_character_files()
        audio_list = ["None", "<Audio 0>", "<Audio 1>", "<Audio 2>"]

        return {
            "required": {
                "use_custom_prompt": ("BOOLEAN", {"default": False}),
                "custom_prompt": ("STRING", {"multiline": True, "default": ""}),

                "llm_provider": (["Ollama (Local)", "Gemini (Cloud)", "ChatGPT (OpenAI)"], {"default": "Ollama (Local)"}),
                "llm_api_key": ("STRING", {"default": ""}),
                "llm_model": ("STRING", {"default": ""}),
                "creative_mode": (["オフ", "控えめ (光・空気感)", "リッチ (小物・情景追加)"], {"default": "オフ"}),
                
                "situation": ("STRING", {"multiline": True, "default": ""}),
                "quality_control": ("STRING", {"multiline": True, "default": ""}),
                "ambient_sound": ("STRING", {"multiline": True, "default": ""}),
                "bgm": ("STRING", {"multiline": True, "default": ""}),
                "timeline_data": ("STRING", {"default": "{\"items\":[]}"}),

                "char1_enabled": ("BOOLEAN", {"default": True}),
                "char1_preset": (char_list, {"default": "None"}),
                "char1_name": ("STRING", {"default": ""}),
                "char1_pics": ("STRING", {"default": ""}),
                "char1_audio": (audio_list, {"default": "None"}),
                "char1_extra": ("STRING", {"multiline": True, "default": ""}),

                "char2_enabled": ("BOOLEAN", {"default": False}),
                "char2_preset": (char_list, {"default": "None"}),
                "char2_name": ("STRING", {"default": ""}),
                "char2_pics": ("STRING", {"default": ""}),
                "char2_audio": (audio_list, {"default": "None"}),
                "char2_extra": ("STRING", {"multiline": True, "default": ""}),

                "char3_enabled": ("BOOLEAN", {"default": False}),
                "char3_preset": (char_list, {"default": "None"}),
                "char3_name": ("STRING", {"default": ""}),
                "char3_pics": ("STRING", {"default": ""}),
                "char3_audio": (audio_list, {"default": "None"}),
                "char3_extra": ("STRING", {"multiline": True, "default": ""}),

                "shot1_enabled": ("BOOLEAN", {"default": True}),
                "shot1_time": ("STRING", {"default": "0秒〜3秒"}),
                "shot1_action": ("STRING", {"multiline": True, "default": ""}),
                "shot1_dialogue": ("STRING", {"multiline": True, "default": "S1: "}),

                "shot2_enabled": ("BOOLEAN", {"default": False}),
                "shot2_time": ("STRING", {"default": "3秒〜7秒"}),
                "shot2_action": ("STRING", {"multiline": True, "default": ""}),
                "shot2_dialogue": ("STRING", {"multiline": True, "default": "S2: "}),

                "shot3_enabled": ("BOOLEAN", {"default": False}),
                "shot3_time": ("STRING", {"default": "7秒〜10秒"}),
                "shot3_action": ("STRING", {"multiline": True, "default": ""}),
                "shot3_dialogue": ("STRING", {"multiline": True, "default": "S3: "}),

                "shot4_enabled": ("BOOLEAN", {"default": False}),
                "shot4_time": ("STRING", {"default": "10秒〜15秒"}),
                "shot4_action": ("STRING", {"multiline": True, "default": ""}),
                "shot4_dialogue": ("STRING", {"multiline": True, "default": "S4: "}),
            }
        }

    RETURN_TYPES = ("STRING", "H3_MEDIA_BUNDLE")
    RETURN_NAMES = ("prompt", "media_bundle")
    FUNCTION = "process_studio"
    CATEGORY = "MiniMax_H3"

    def process_studio(self, **kwargs):
        use_custom = kwargs.get("use_custom_prompt", False)
        custom_txt = kwargs.get("custom_prompt", "").strip()

        if use_custom and custom_txt:
            prompt_result = custom_txt
            if kwargs.get("llm_provider") == "Ollama (Local)":
                unload_ollama_vram(kwargs.get("llm_model") or "qwen2.5:7b-instruct-q5_K_M")
        else:
            try:
                prompt_result = build_and_generate_prompt(kwargs)
            except Exception as e:
                prompt_result = f"Error during prompt generation: {e}"

        images, videos, audios = {}, {}, {}
        try:
            data = json.loads(kwargs.get("timeline_data", "{\"items\":[]}"))
            for item in data.get("items", []):
                val, mtype, slot = item.get("value"), item.get("laneType", item.get("type")), item.get("slot", 0)
                if not val: continue
                if mtype == "image":
                    t = load_image_raw_tensor(val)
                    if t is not None: images[slot] = t
                elif mtype == "video":
                    v = load_video_tensor(val)
                    if v is not None: videos[slot] = v
                elif mtype == "audio":
                    a = load_audio_dict(val)
                    if a is not None: audios[slot] = a
        except: pass
        media_bundle = {"images": images, "videos": videos, "audios": audios}

        return (prompt_result, media_bundle)

class H3MediaDispatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "media_bundle": ("H3_MEDIA_BUNDLE",),
                "width": ("INT", {"default": 1344, "min": 64, "max": 4096, "step": 32}),
                "height": ("INT", {"default": 768, "min": 64, "max": 4096, "step": 32}),
                "[FL2VA] リサイズ方式": (["crop", "pad", "stretch"], {"default": "crop"}),
                "[FL2VA] 基準位置": (["center", "top", "bottom", "left", "right"], {"default": "center"}),
                "[REF2VA] リサイズ方式": (["crop", "pad", "stretch"], {"default": "crop"}),
                "[REF2VA] 基準位置": (["center", "top", "bottom", "left", "right"], {"default": "center"}),
                "[V2V] リサイズ方式": (["crop", "pad", "stretch"], {"default": "crop"}),
                "[V2V] 基準位置": (["center", "top", "bottom", "left", "right"], {"default": "center"}),
            }
        }

    RETURN_TYPES = (
        "IMAGE", "IMAGE", "IMAGE", 
        "IMAGE", "IMAGE", 
        "AUDIO", "AUDIO", "AUDIO"
    )
    RETURN_NAMES = (
        "first_frame", "last_frame", "ref_images",
        "ref_video_0", "ref_video_1",
        "ref_audio_0", "ref_audio_1", "ref_audio_2"
    )
    FUNCTION = "dispatch_all"
    CATEGORY = "MiniMax_H3"

    def dispatch_all(self, media_bundle, width, height, **kwargs):
        fl2va_mode = kwargs.get("[FL2VA] リサイズ方式", "crop")
        fl2va_pos = kwargs.get("[FL2VA] 基準位置", "center")
        ref2va_mode = kwargs.get("[REF2VA] リサイズ方式", "crop")
        ref2va_pos = kwargs.get("[REF2VA] 基準位置", "center")
        v2v_mode = kwargs.get("[V2V] リサイズ方式", "crop")
        v2v_pos = kwargs.get("[V2V] 基準位置", "center")

        images = media_bundle.get("images", {})
        videos = media_bundle.get("videos", {})
        audios = media_bundle.get("audios", {})

        raw_0 = images.get(0)
        raw_1 = images.get(1, raw_0)
        first_frame = universal_resize(raw_0, width, height, mode=fl2va_mode, crop_pos=fl2va_pos)
        last_frame = universal_resize(raw_1, width, height, mode=fl2va_mode, crop_pos=fl2va_pos)

        batch_list = []
        dummy_canvas = torch.zeros((1, height, width, 3), dtype=torch.float32)
        for i in range(9):
            if i in images:
                batch_list.append(universal_resize(images[i], width, height, mode=ref2va_mode, crop_pos=ref2va_pos))
            else:
                batch_list.append(dummy_canvas)
        ref_images_batch = torch.cat(batch_list, dim=0)

        ref_video_0 = process_video_tensor(videos.get(0), width, height, mode=v2v_mode, crop_pos=v2v_pos)
        ref_video_1 = process_video_tensor(videos.get(1), width, height, mode=v2v_mode, crop_pos=v2v_pos)

        dummy_audio = {"waveform": torch.zeros((1, 2, 44100)), "sample_rate": 44100}
        ref_audio_0 = audios.get(0, dummy_audio)
        ref_audio_1 = audios.get(1, dummy_audio)
        ref_audio_2 = audios.get(2, dummy_audio)

        return (
            first_frame, last_frame, ref_images_batch,
            ref_video_0, ref_video_1,
            ref_audio_0, ref_audio_1, ref_audio_2
        )

NODE_CLASS_MAPPINGS = {
    "H3PromptDirectorGUI": H3PromptDirectorGUI,
    "H3MediaDispatcher": H3MediaDispatcher
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PromptDirectorGUI": "H3promptDirector(GUI)",
    "H3MediaDispatcher": "🔀 H3 Media Dispatcher"
}