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
import scipy.io.wavfile as wavfile
from server import PromptServer
from aiohttp import web

# --- ヘルパー関数群 ---

def load_system_rules():
    rule_path = os.path.join(os.path.dirname(__file__), "rules.txt")
    if os.path.exists(rule_path):
        with open(rule_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def load_image_raw_tensor(filename):
    input_dir = folder_paths.get_input_directory()
    image_path = os.path.join(input_dir, filename)
    if not os.path.exists(image_path):
        return None
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)
    image_np = np.array(img.convert("RGB")).astype(np.float32) / 255.0
    return torch.from_numpy(image_np)[None,]

def load_video_tensor(filename):
    input_dir = folder_paths.get_input_directory()
    video_path = os.path.join(input_dir, filename)
    if not os.path.exists(video_path):
        return None
    cap = cv2.VideoCapture(video_path)
    frames = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(
            torch.from_numpy(
                cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            )
        )
    cap.release()
    return torch.stack(frames, dim=0) if frames else None

def load_audio_dict(filename):
    input_dir = folder_paths.get_input_directory()
    audio_path = os.path.join(input_dir, filename)
    if not os.path.exists(audio_path):
        return None
    try:
        sample_rate, data = wavfile.read(audio_path)
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            data = (data.astype(np.float32) - 128.0) / 128.0
        else:
            data = data.astype(np.float32)
        tensor = torch.from_numpy(data)
        if tensor.ndim == 1:
            tensor = tensor.unsqueeze(0)
        elif tensor.ndim == 2:
            tensor = tensor.t()
        return {"waveform": tensor.unsqueeze(0), "sample_rate": int(sample_rate)}
    except Exception:
        pass
    return None

def universal_resize(tensor, target_w, target_h, mode="crop", crop_pos="center"):
    if tensor is None:
        return torch.zeros((1, target_h, target_w, 3), dtype=torch.float32)
    b, h, w, c = tensor.shape
    if h == target_w and w == target_w:
        return tensor

    img = tensor.movedim(-1, 1)
    if mode == "stretch":
        img = F.interpolate(
            img, size=(target_h, target_w), mode="bilinear", align_corners=False
        )
        return img.movedim(1, -1)
    elif mode == "crop":
        scale = max(target_w / w, target_h / h)
        new_w, new_h = round(w * scale), round(h * scale)
        img = F.interpolate(
            img, size=(new_h, new_w), mode="bilinear", align_corners=False
        )
        diff_w = new_w - target_w
        diff_h = new_h - target_h
        if crop_pos == "top":
            sy, sx = 0, diff_w // 2
        elif crop_pos == "bottom":
            sy, sx = diff_h, diff_w // 2
        elif crop_pos == "left":
            sy, sx = diff_h // 2, 0
        elif crop_pos == "right":
            sy, sx = diff_h // 2, diff_w
        else:
            sy, sx = diff_h // 2, diff_w // 2
        img = img[:, :, sy : sy + target_h, sx : sx + target_w]
        return img.movedim(1, -1)
    elif mode == "pad":
        scale = min(target_w / w, target_h / h)
        new_w, new_h = round(w * scale), round(h * scale)
        img = F.interpolate(
            img, size=(new_h, new_w), mode="bilinear", align_corners=False
        )
        diff_w = target_w - new_w
        diff_h = target_h - new_h
        pad_left = diff_w // 2
        pad_right = diff_w - pad_left
        pad_top = diff_h // 2
        pad_bottom = diff_h - pad_top
        img = F.pad(
            img,
            (pad_left, pad_right, pad_top, pad_bottom),
            mode="constant",
            value=0.0,
        )
        return img.movedim(1, -1)
    return tensor

def process_video_tensor(tensor, target_w, target_h, mode="crop", crop_pos="center", min_frames=5):
    if tensor is None:
        return torch.zeros((min_frames, target_h, target_w, 3), dtype=torch.float32)
    resized_frames = universal_resize(
        tensor, target_w, target_h, mode=mode, crop_pos=crop_pos
    )
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
            try:
                s = float(val_str)
            except Exception:
                s = 0.0
        total_sec = m * 60 + s
        return f"{int(total_sec // 60)}:{total_sec % 60:04.1f}"

    for d in ["〜", "~", "-", "ー", "to"]:
        if d in t:
            parts = t.split(d, 1)
            return f"{parse_sec(parts[0])}-{parse_sec(parts[1])}"

    return t

def unload_ollama_vram(model_name):
    if not model_name:
        return
    url = "http://localhost:11434/api/generate"
    payload = {"model": model_name, "keep_alive": 0}
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception:
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
        if not name or name in ["None", "Custom Text", False]:
            return ""
        path = os.path.join(os.path.dirname(__file__), "characters", f"{name}.txt")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
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
        if not audio_ref or audio_ref not in [
            "None",
            "<Audio 0>",
            "<Audio 1>",
            "<Audio 2>",
        ]:
            audio_ref = "None"

        extra = kwargs.get(f"char{i}_extra", "").strip()
        pics_raw = kwargs.get(f"char{i}_pics", "")
        pic_tags = [p.strip() for p in pics_raw.split(",") if p.strip()]

        desc_parts = []
        base_text = read_char_txt(preset)
        if base_text:
            desc_parts.append(base_text)
        if extra:
            desc_parts.append(
                "[Extra Details - STRICTLY TRANSLATE INTO ENGLISH WITHOUT"
                f" INTERPRETATION]:\n{extra}"
            )

        subj_idx = len(subjects) + 1
        label = (
            name
            if name
            else (
                preset
                if preset not in ["None", "Custom Text"]
                else f"Character {i}"
            )
        )

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
            "extra": extra,
        }

        combined = "\n".join(desc_parts).strip()
        if combined or name:
            subjects.append(f"[Subject {subj_idx}: {label}]\n{combined}")

    char_description = process_wildcards("\n\n".join(subjects))

    shots = []
    ordered_dialogues = []

    for i in range(1, 5):
        if not kwargs.get(f"shot{i}_enabled", False):
            continue
        raw_time = kwargs.get(f"shot{i}_time", "").strip()
        norm_time = normalize_time_expression(raw_time)

        action = kwargs.get(f"shot{i}_action", "").strip()
        dialogue_raw = kwargs.get(f"shot{i}_dialogue", "").strip()
        speaker_choice = kwargs.get(f"shot{i}_speaker", "None")

        content = []
        if action:
            content.append(action)
        if dialogue_raw:
            lines = [l.strip() for l in dialogue_raw.split("\n") if l.strip()]
            for line in lines:
                dia = line
                # ユーザーが誤ってS1:などを手入力していても除去
                dia = re.sub(r"^S\d+:\s*", "", dia, flags=re.IGNORECASE)
                dia = re.sub(
                    r"^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*",
                    "",
                    dia,
                    flags=re.IGNORECASE,
                )
                dia = re.sub(
                    r"\s*(?:<\/d>|\[\/d\])?$", "", dia, flags=re.IGNORECASE
                ).strip().strip('"').strip("'")

                if dia:
                    # 話者が指定されている場合はプレフィックスを自動付与
                    if speaker_choice in ["S1", "S2", "S3"]:
                        formatted_line = f"{speaker_choice}: <d>[Japanese] {dia} </d>"
                    else:
                        formatted_line = f"<d>[Japanese] {dia} </d>"

                    content.append(formatted_line)
                    ordered_dialogues.append({
                        "shot": len(shots) + 1,
                        "speaker": speaker_choice if speaker_choice != "None" else f"S{i}",
                        "dialogue": dia,
                        "full": formatted_line,
                    })
        if content:
            shots.append(f"[Shot {len(shots) + 1} | {norm_time}]\n" + "\n".join(content))
    timeline_seq = "\n\n".join(shots)

    creative_mode = kwargs.get("creative_mode", "オフ")
    if creative_mode == "リッチ (小物・情景追加)":
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n- Act as a master anime"
            " scene director. ACTIVELY ENHANCE THE SCENE by adding fitting thematic"
            " props, background furniture, atmospheric lighting, and contextual"
            " environment elements that complement the scene.\n- **CRITICAL RULE:"
            " YOU MUST APPLY THIS ENHANCEMENT EXCLUSIVELY TO THE `summary:`"
            " SECTION. DO NOT TOUCH OTHER SECTIONS.**"
        )
    elif creative_mode == "控えめ (光・空気感)":
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n- Subtly enhance the"
            " atmosphere by adding cinematic lighting, time of day, and"
            " environmental ambiance (e.g., warm golden hour, gentle rim"
            " lighting).\n- **CRITICAL RULE: YOU MUST APPLY THIS ENHANCEMENT"
            " EXCLUSIVELY TO THE `summary:` SECTION. DO NOT TOUCH OTHER"
            " SECTIONS.**"
        )
    else:
        creative_instruction = (
            "\n[SCENE DIRECTION & ATMOSPHERE ENHANCEMENT]:\n- Strictly translate"
            " the situation faithfully without inventing unmentioned objects or"
            " extra atmospheric effects."
        )

    raw_rules = load_system_rules()
    sys_inst = raw_rules.format(
        creative_instruction=creative_instruction,
        char_description=char_description,
        situation=kwargs.get("situation", ""),
        timeline_seq=timeline_seq,
        quality_control=kwargs.get("quality_control", ""),
        ambient_sound=kwargs.get("ambient_sound", ""),
        bgm=kwargs.get("bgm", ""),
    )
    
    provider = kwargs.get("llm_provider", "Ollama (Local)")
    api_key = kwargs.get("llm_api_key", "")
    model_name = kwargs.get("llm_model", "").strip()
    temp = 0.7 if creative_mode != "オフ" else 0.3

    if provider == "Gemini (Cloud)":
        active_key = (
            api_key if api_key and api_key.strip() else os.getenv("GEMINI_API_KEY")
        )
        if not active_key:
            raise ValueError("Gemini API Keyが設定されていません。")
        genai.configure(api_key=active_key)
        model = genai.GenerativeModel(model_name or "gemini-2.5-flash")
        prompt_result = model.generate_content(sys_inst).text.strip()

    elif provider == "ChatGPT (OpenAI)":
        active_key = (
            api_key if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY")
        )
        if not active_key:
            raise ValueError("OpenAI API Keyが設定されていません。")
        client = OpenAI(api_key=active_key)
        response = client.chat.completions.create(
            model=model_name or "gpt-4o",
            messages=[{
                "role": "system",
                "content": (
                    "You are an expert prompt engineer specialized in the MiniMax"
                    " H3 video generation model."
                ),
            }, {"role": "user", "content": sys_inst}],
            temperature=temp,
        )
        prompt_result = response.choices[0].message.content.strip()

    elif provider == "Ollama (Local)":
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model_name or "qwen2.5:7b-instruct-q5_K_M",
            "prompt": sys_inst,
            "stream": False,
            "options": {"temperature": temp},
        }
        res = requests.post(url, json=payload, timeout=300)
        res.raise_for_status()
        prompt_result = res.json().get("response", "").strip()
        unload_ollama_vram(model_name or "qwen2.5:7b-instruct-q5_K_M")
    else:
        raise ValueError(f"未知のLLMプロバイダー: {provider}")

    # 1. タグ表記の揺らぎを修正
    prompt_result = re.sub(r"\[d\]\s*\[Japanese\]", r"<d>[Japanese]", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"\[d\]", r"<d>[Japanese] ", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"\[\/d\]", r"</d>", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"<d>\s*(?!\[Japanese\])", r"<d>[Japanese] ", prompt_result, flags=re.IGNORECASE)

    # 2. リップシンク構文の分離（TTS巻き込み誤読防止のため「speaking:」等を削り、前後に空行を確保）
    prompt_result = re.sub(
        r"[\s,]*(?:visibly opening and moving mouth.*?while (?:speaking|delivering line):?|speaking:|delivering line:?|saying:?)\s*(S\d+:\s*<d>\[Japanese\])",
        r".\n\n\1",
        prompt_result,
        flags=re.IGNORECASE
    )
    
    # セリフタグの直前に空行がない場合は挿入
    prompt_result = re.sub(
        r"(?<!\n)(S\d+:\s*<d>\[Japanese\])",
        r"\n\n\1",
        prompt_result
    )
    
    # セリフタグの直後に空行がない場合は挿入
    prompt_result = re.sub(
        r"(<\/d>)(?!\s*\n)",
        r"\1\n\n",
        prompt_result
    )

    # 3. LLMがセリフを秒数や英語に化けさせた場合、入力された純粋なセリフで順番通りに完全強制置換
    if ordered_dialogues:
        shot_dia_matches = list(re.finditer(r"(S\d+:\s*)?<d>\[Japanese\](.*?)<\/d>", prompt_result))
        for idx, item in enumerate(ordered_dialogues):
            if idx < len(shot_dia_matches):
                target_match = shot_dia_matches[idx]
                spk = item["speaker"]
                correct_dia = item["dialogue"]
                prefix = f"{spk}: " if spk != "None" else ""
                replacement = f"{prefix}<d>[Japanese] {correct_dia} </d>"
                prompt_result = prompt_result[:target_match.start()] + replacement + prompt_result[target_match.end():]
                # 置換によるインデックスずれを再取得
                shot_dia_matches = list(re.finditer(r"(S\d+:\s*)?<d>\[Japanese\](.*?)<\/d>", prompt_result))

    # 4. 余分なタグやプレフィックスのクレンジング
    prompt_result = re.sub(r"禁止事項(?:＆|&)?スタイル維持:?", "", prompt_result)
    prompt_result = re.sub(r"\[S\d+:?\]\s*", "", prompt_result)
    prompt_result = re.sub(
        r"(?im)^Reference sheets for\s+[\w\s]+\s+include\s+<Picture\s*\d+>.*$",
        "",
        prompt_result,
    )
    prompt_result = re.sub(
        r"(?im)^Vocal reference for\s+[\w\s]+\s+is\s+<Audio\s*\d+>.*$",
        "",
        prompt_result,
    )

    if "summary:" not in prompt_result.lower():
        prompt_result = re.sub(
            r"(\n\n)([^\n]+)(\n+retention_analysis:)",
            r"\1summary:\n\2\3",
            prompt_result,
            flags=re.IGNORECASE,
        )

    def clean_summary_content(match):
        body = match.group(2)
        body = re.sub(r"<d>.*?</d>", "", body, flags=re.DOTALL)
        body = re.sub(r"S\d+:.*?(?=\.|\n|$)", "", body)
        body = re.sub(r"[^.\n]*visibly open[^.\n]*\.", "", body, flags=re.IGNORECASE)
        body = re.sub(r"[^.\n]*while speaking:?[^.\n]*\.", "", body, flags=re.IGNORECASE)
        body = re.sub(r"[^.\n]*while delivering line:?[^.\n]*\.", "", body, flags=re.IGNORECASE)
        body = re.sub(r"Thematic props include.*?tank top.*?\.", "", body, flags=re.IGNORECASE)
        clean_text = "\n".join([line.strip() for line in body.splitlines() if line.strip()])
        return f"summary:\n{clean_text}\n\n"

    prompt_result = re.sub(
        r"(summary:\s*)(.*?)(?=\n\s*retention_analysis:)",
        clean_summary_content,
        prompt_result,
        flags=re.DOTALL | re.IGNORECASE,
    )
    prompt_result = re.sub(r"\[Subject\s*\d+:\s*([^\]]+)\]", r"\1", prompt_result)
    prompt_result = re.sub(r"\[S\d+:\s*([^\]]+)\]", r"\1", prompt_result)

    if shots:
        for idx, shot_text in enumerate(shots, start=1):
            time_tag_match = re.search(rf"\[Shot\s*{idx}\s*\|\s*[^\]]+\]", shot_text)
            if time_tag_match:
                time_header = time_tag_match.group(0)
                if f"[Shot {idx}" not in prompt_result:
                    spk_target = f"S{idx}:"
                    pattern = rf"(?:\n|\A)([^\n]*?{spk_target}\s*<d>)"
                    if re.search(pattern, prompt_result):
                        prompt_result = re.sub(pattern, rf"\n\n{time_header}\n\1", prompt_result, count=1)

    prompt_result = re.sub(r"(?<!<)\bPicture\s*(\d+)\b(?!>)", r"<Picture \1>", prompt_result)
    prompt_result = re.sub(r"(?<!<)\bAudio\s*(\d+)\b(?!>)", r"<Audio \1>", prompt_result)
    prompt_result = re.sub(r"(<\/d>)\s*\([^)]+\)", r"\1", prompt_result)
    prompt_result = re.sub(r"\bSX:\s*", "", prompt_result)

    # 5. キャラクター参照の注入
    for idx, refs in sorted(char_refs.items(), key=lambda x: x[0]):
        label = refs["label"]
        extra_text = refs.get("extra", "")

        ref_parts = []
        if refs["pics"]:
            ref_parts.append(f"Reference sheets for {label} include {refs['pics_str']}.")
        if refs["audio"] and refs["audio"] != "None":
            ref_parts.append(f"Vocal reference for {label} is {refs['audio']}.")
        ref_line = " ".join(ref_parts)

        subj_pat = rf"(\[Subject\s*{idx}\s*:[^\]]*\])(.*?)(?=\n\s*\[Subject|\n\n[a-z_]+:|\Z)"
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
            name_pat = rf"(?i)(?:\b{re.escape(label)}\b[\s\S]*?)(?=\n\s*(?:\[Subject|[A-Z][a-z]+|\n\n[a-z_]+:)|\Z)"
            name_match = re.search(name_pat, prompt_result)
            if name_match:
                body = name_match.group(0).strip()
                block = f"[Subject {idx}: {label}]\n{body}\n{ref_line}\n\n"
                prompt_result = prompt_result[:name_match.start()] + block + prompt_result[name_match.end():]

    prompt_result = re.sub(r"speaking with <Audio \d+>:\s*", "speaking: ", prompt_result)
    prompt_result = re.sub(r'"<([^>]+)>"', r'"\1"', prompt_result)
    prompt_result = re.sub(r"(?m)^\[Subject\s*\d+:[^\]]+\]\s*$(?=\n\s*\[Subject)", "", prompt_result)
    prompt_result = re.sub(r"^(summary:)\s*\n+", r"\1\n", prompt_result, flags=re.MULTILINE | re.IGNORECASE)
    prompt_result = re.sub(r"\n{3,}", "\n\n", prompt_result).strip()
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
        files = [
            f.replace(".txt", "") for f in os.listdir(char_dir) if f.endswith(".txt")
        ]
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
                "llm_provider": (
                    ["Ollama (Local)", "Gemini (Cloud)", "ChatGPT (OpenAI)"],
                    {"default": "Ollama (Local)"},
                ),
                "llm_api_key": ("STRING", {"default": ""}),
                "llm_model": ("STRING", {"default": ""}),
                "creative_mode": (
                    ["オフ", "控えめ (光・空気感)", "リッチ (小物・情景追加)"],
                    {"default": "オフ"},
                ),
                "situation": ("STRING", {"multiline": True, "default": ""}),
                "quality_control": ("STRING", {"multiline": True, "default": ""}),
                "ambient_sound": ("STRING", {"multiline": True, "default": ""}),
                "bgm": ("STRING", {"multiline": True, "default": ""}),
                "timeline_data": ("STRING", {"default": '{"items":[]}'}),
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
                "shot1_speaker": ("STRING", {"default": "S1"}),
                "shot1_dialogue": ("STRING", {"multiline": True, "default": ""}),
                "shot2_enabled": ("BOOLEAN", {"default": False}),
                "shot2_time": ("STRING", {"default": "3秒〜7秒"}),
                "shot2_action": ("STRING", {"multiline": True, "default": ""}),
                "shot2_speaker": ("STRING", {"default": "None"}),
                "shot2_dialogue": ("STRING", {"multiline": True, "default": ""}),
                "shot3_enabled": ("BOOLEAN", {"default": False}),
                "shot3_time": ("STRING", {"default": "7秒〜10秒"}),
                "shot3_action": ("STRING", {"multiline": True, "default": ""}),
                "shot3_speaker": ("STRING", {"default": "None"}),
                "shot3_dialogue": ("STRING", {"multiline": True, "default": ""}),
                "shot4_enabled": ("BOOLEAN", {"default": False}),
                "shot4_time": ("STRING", {"default": "10秒〜15秒"}),
                "shot4_action": ("STRING", {"multiline": True, "default": ""}),
                "shot4_speaker": ("STRING", {"default": "None"}),
                "shot4_dialogue": ("STRING", {"multiline": True, "default": ""}),
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
                unload_ollama_vram(
                    kwargs.get("llm_model") or "qwen2.5:7b-instruct-q5_K_M"
                )
        else:
            try:
                prompt_result = build_and_generate_prompt(kwargs)
            except Exception as e:
                prompt_result = f"Error during prompt generation: {e}"

        images, keyframes, videos, audios = {}, {}, {}, {}
        try:
            data = json.loads(kwargs.get("timeline_data", '{"items":[]}'))
            for item in data.get("items", []):
                val = item.get("value")
                mtype = item.get("laneType", item.get("type"))
                slot = item.get("slot", 0)
                if not val:
                    continue

                if mtype == "image":
                    t = load_image_raw_tensor(val)
                    if t is not None:
                        images[slot] = t
                elif mtype == "keyframe":
                    t = load_image_raw_tensor(val)
                    if t is not None:
                        keyframes[slot] = t
                elif mtype == "video":
                    v = load_video_tensor(val)
                    if v is not None:
                        videos[slot] = v
                elif mtype == "audio":
                    a = load_audio_dict(val)
                    if a is not None:
                        audios[slot] = a
        except Exception:
            pass

        media_bundle = {
            "images": images,
            "keyframes": keyframes,
            "videos": videos,
            "audios": audios,
        }

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
        "IMAGE", "IMAGE",
        "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE",
        "IMAGE", "IMAGE",
        "AUDIO", "AUDIO", "AUDIO",
    )
    RETURN_NAMES = (
        "first_frame", "last_frame",
        "ref_image_0", "ref_image_1", "ref_image_2", "ref_image_3", "ref_image_4", "ref_image_5", "ref_image_6", "ref_image_7", "ref_image_8",
        "ref_video_0", "ref_video_1",
        "ref_audio_0", "ref_audio_1", "ref_audio_2",
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
        keyframes = media_bundle.get("keyframes", {})
        videos = media_bundle.get("videos", {})
        audios = media_bundle.get("audios", {})

        first_frame = None
        if 0 in keyframes and keyframes[0] is not None:
            first_frame = universal_resize(
                keyframes[0], width, height, mode=fl2va_mode, crop_pos=fl2va_pos
            )

        last_frame = None
        if 1 in keyframes and keyframes[1] is not None:
            last_frame = universal_resize(
                keyframes[1], width, height, mode=fl2va_mode, crop_pos=fl2va_pos
            )

        ref_imgs = []
        for i in range(9):
            if i in images and images[i] is not None:
                ref_imgs.append(
                    universal_resize(
                        images[i], width, height, mode=ref2va_mode, crop_pos=ref2va_pos
                    )
                )
            else:
                ref_imgs.append(None)

        ref_video_0 = (
            process_video_tensor(
                videos.get(0), width, height, mode=v2v_mode, crop_pos=v2v_pos
            )
            if 0 in videos
            else None
        )
        ref_video_1 = (
            process_video_tensor(
                videos.get(1), width, height, mode=v2v_mode, crop_pos=v2v_pos
            )
            if 1 in videos
            else None
        )

        ref_audio_0 = audios.get(0)
        ref_audio_1 = audios.get(1)
        ref_audio_2 = audios.get(2)

        return (
            first_frame,
            last_frame,
            ref_imgs[0], ref_imgs[1], ref_imgs[2], ref_imgs[3], ref_imgs[4],
            ref_imgs[5], ref_imgs[6], ref_imgs[7], ref_imgs[8],
            ref_video_0, ref_video_1,
            ref_audio_0, ref_audio_1, ref_audio_2,
        )

class HKMC_ModelSelector:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": ("STRING", {"forceInput": True}),
                "ref2va_model": ("MODEL",),
                "fl2va_model": ("MODEL",),
                "hybrid_model": ("MODEL",),
            }
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("selected_model",)
    FUNCTION = "select_model"
    CATEGORY = "MiniMax_H3"

    def select_model(self, mode, ref2va_model, fl2va_model, hybrid_model):
        mode_clean = str(mode).strip().upper()
        if "FL2VA" in mode_clean or "I2VA" in mode_clean:
            chosen_model = fl2va_model
            mode_name = "FL2VA"
        elif "HYBRID" in mode_clean:
            chosen_model = hybrid_model
            mode_name = "Hybrid"
        else:
            chosen_model = ref2va_model
            mode_name = "REF2VA"

        return (chosen_model,)

NODE_CLASS_MAPPINGS = {
    "H3PromptDirectorGUI": H3PromptDirectorGUI,
    "H3MediaDispatcher": H3MediaDispatcher,
    "HKMC_ModelSelector": HKMC_ModelSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PromptDirectorGUI": "H3promptDirector(GUI)",
    "H3MediaDispatcher": "H3 Media Dispatcher",
    "HKMC_ModelSelector": "HKMC Model Selector",
}