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

def load_system_rules(is_auto=False):
    filename = "rules_auto.txt" if is_auto else "rules.txt"
    rule_path = os.path.join(os.path.dirname(__file__), filename)
    if os.path.exists(rule_path):
        with open(rule_path, "r", encoding="utf-8") as f:
            return f.read()
    fallback_path = os.path.join(os.path.dirname(__file__), "rules.txt")
    if os.path.exists(fallback_path):
        with open(fallback_path, "r", encoding="utf-8") as f:
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

def contains_japanese(text):
    return bool(re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', text))

def call_llm(sys_inst, provider, api_key, model_name, temp=0.7):
    if provider == "Gemini (Cloud)":
        active_key = api_key if api_key and api_key.strip() else os.getenv("GEMINI_API_KEY")
        if not active_key:
            raise ValueError("Gemini API Keyが設定されていません。")
        genai.configure(api_key=active_key)
        model = genai.GenerativeModel(model_name or "gemini-2.5-flash")
        return model.generate_content(sys_inst).text.strip()

    elif provider == "ChatGPT (OpenAI)":
        active_key = api_key if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY")
        if not active_key:
            raise ValueError("OpenAI API Keyが設定されていません。")
        client = OpenAI(api_key=active_key)
        response = client.chat.completions.create(
            model=model_name or "gpt-4o",
            messages=[{
                "role": "system",
                "content": "You are an expert translator and prompt engineer."
            }, {"role": "user", "content": sys_inst}],
            temperature=temp,
        )
        return response.choices[0].message.content.strip()

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
        return prompt_result
    else:
        raise ValueError(f"未知のLLMプロバイダー: {provider}")

def translate_clip_texts(clips_dict, kwargs):
    if not clips_dict:
        return {}
        
    prompt_text = "Translate the following Japanese video generation prompts into English precisely.\n"
    prompt_text += "CRITICAL RULE 1: The translation MUST be 100% in English. NO Chinese. NO Japanese.\n"
    prompt_text += "CRITICAL RULE 2: DO NOT translate or modify any text inside <d>...</d> tags. Leave those tags and their exact contents completely untouched.\n"
    prompt_text += "CRITICAL RULE 3: Output the translated texts wrapped in XML tags exactly corresponding to the input. Do not add any other text outside the XML tags.\n"
    prompt_text += "CRITICAL RULE 4: DO NOT summarize or shorten the descriptions. Translate EVERY detail, including lighting, atmosphere, character emotions, and camera movements faithfully.\n"
    prompt_text += "CRITICAL RULE 5: Keep any English instructions (such as 'CRITICAL: ...' or '[Shot X | ...]' or 'Do not continue...') exactly as they are. DO NOT translate or modify them.\n\n"
    
    for k, text in clips_dict.items():
        prompt_text += f"<clip_{k}>\n{text}\n</clip_{k}>\n\n"
        
    provider = kwargs.get("llm_provider", "Ollama (Local)")
    api_key = kwargs.get("llm_api_key", "")
    model_name = kwargs.get("llm_model", "").strip()
    
    try:
        result_text = call_llm(prompt_text, provider, api_key, model_name, temp=0.3)
    except Exception as e:
        print(f"Translation Error: {e}")
        return clips_dict
        
    translations = {}
    if result_text:
        for k in clips_dict.keys():
            m = re.search(fr"<clip_{k}>(.*?)</clip_{k}>", result_text, re.DOTALL | re.IGNORECASE)
            if m:
                t = m.group(1).strip()
                t = re.sub(r'^(Text|Clip\s*\d+|Translation):\s*', '', t, flags=re.IGNORECASE).strip()
                translations[k] = t
            else:
                translations[k] = clips_dict[k]
                
    return translations

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
        if not audio_ref or audio_ref not in ["None", "<Audio 1>", "<Audio 2>", "<Audio 3>"]:
            audio_ref = "None"

        extra = kwargs.get(f"char{i}_extra", "").strip()
        pics_raw = kwargs.get(f"char{i}_pics", "")
        
        def fix_pic_tag(tag_str):
            m = re.match(r"<Picture\s*(\d+)>", tag_str.strip(), re.IGNORECASE)
            if m:
                num = int(m.group(1))
                if num == 0:
                    num = 1
                return f"<Picture {num}>"
            return tag_str.strip()

        pic_tags = [fix_pic_tag(p) for p in pics_raw.split(",") if p.strip()]

        desc_parts = []
        base_text = read_char_txt(preset)
        if base_text:
            desc_parts.append(base_text)
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
            "extra": extra,
        }

        combined = "\n".join(desc_parts).strip()
        if combined or name:
            subjects.append(f"[Subject {subj_idx}: {label}]\n{combined}")

    char_description = process_wildcards("\n\n".join(subjects))

    shots = []
    saved_dialogues = {}
    
    has_silent_shot = False

    shot_counter = 0
    for i in range(1, 5):
        if not kwargs.get(f"shot{i}_enabled", False):
            continue
        shot_counter += 1

        raw_time = kwargs.get(f"shot{i}_time", "").strip()
        norm_time = normalize_time_expression(raw_time)

        action = kwargs.get(f"shot{i}_action", "").strip()
        dialogue_raw = kwargs.get(f"shot{i}_dialogue", "").strip()
        speaker_choice = kwargs.get(f"shot{i}_speaker", "None")

        content = []
        if action:
            content.append(f"Action/Camera: {action}")

        if speaker_choice == "None" or not dialogue_raw.strip():
            has_silent_shot = True
        else:
            dia_lines = []
            lines = [l.strip() for l in dialogue_raw.split("\n") if l.strip()]
            for line in lines:
                dia = line
                dia = re.sub(r"^S\d+:\s*", "", dia, flags=re.IGNORECASE)
                dia = re.sub(r"^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*", "", dia, flags=re.IGNORECASE)
                dia = re.sub(r"\s*(?:<\/d>|\[\/d\])?$", "", dia, flags=re.IGNORECASE).strip().strip('"').strip("'")

                if dia:
                    if speaker_choice in ["S1", "S2", "S3"]:
                        dia_lines.append(f"{speaker_choice}: <d>[Japanese] {dia} </d>")
                    else:
                        dia_lines.append(f"<d>[Japanese] {dia} </d>")
                    content.append(f"(Note for translation: Character {speaker_choice} is speaking here. Describe them visibly talking.)")
            saved_dialogues[shot_counter] = dia_lines

        if content:
            shots.append(f"[Shot {shot_counter} | {norm_time}]\n" + "\n".join(content))
        else:
            shots.append(f"[Shot {shot_counter} | {norm_time}]\nAction/Camera: Continuous action.")

    timeline_seq = "\n\n".join(shots)

    creative_mode = kwargs.get("creative_mode", "オフ")
    if creative_mode == "リッチ (小物・情景追加)":
        creative_instruction = "  Act as a master anime scene director. ACTIVELY ENHANCE THE SCENE by adding fitting thematic props, background elements, lighting, and environmental context to the summary based on the situation."
    elif creative_mode == "控えめ (光・空気感)":
        creative_instruction = "  Subtly enhance the atmosphere by adding cinematic lighting, time of day, and environmental ambiance (e.g., warm golden hour, gentle rim lighting) to the summary based on the situation."
    else:
        creative_instruction = "  Translate the situation faithfully and concisely into English without inventing unmentioned locations, objects, or extra context."

    silent_summary = ""
    silent_desc = ""
    silent_sound = ""
    if has_silent_shot:
        silent_summary = "\n[CRITICAL RULE]: The character remains silent throughout the entire video and never engages in verbal communication."
        silent_desc = "\n[CRITICAL RULE]: The character does not speak or attempt to vocalize. Her mouth remains naturally closed, with no speech-related mouth movements or lip synchronization."
        silent_sound = "\n[CRITICAL RULE]: No human speech or speech-like vocalizations of any kind. No intelligible or unintelligible words in any language. No dialogue, background chatter, whispering, muttering, babbling, singing, humming, or narration. Do not generate spontaneous voices or vocal sounds. Only the explicitly requested non-vocal environmental sounds may be heard."

    raw_rules = load_system_rules(is_auto=False)

    sys_inst = raw_rules.format(
        creative_instruction=creative_instruction + silent_summary,
        char_description=char_description,
        situation=kwargs.get("situation", ""),
        timeline_seq=silent_desc + "\n" + timeline_seq,
        quality_control=kwargs.get("quality_control", ""),
        ambient_sound=silent_sound + "\n" + kwargs.get("ambient_sound", ""),
        bgm=kwargs.get("bgm", ""),
    )
    
    provider = kwargs.get("llm_provider", "Ollama (Local)")
    api_key = kwargs.get("llm_api_key", "")
    model_name = kwargs.get("llm_model", "").strip()
    temp = 0.7 if creative_mode != "オフ" else 0.3

    prompt_result = call_llm(sys_inst, provider, api_key, model_name, temp)

    def fix_bracketed_subject(m):
        subj_num = m.group(1)
        name = m.group(2).strip()
        body = m.group(3).strip()
        return f"[Subject {subj_num}: {name}]\n{body}"

    prompt_result = re.sub(
        r"\[Subject\s*(\d+)\s*:\s*([^:\]\n]+)\s*:\s*([^\]]+)\]",
        fix_bracketed_subject,
        prompt_result,
        flags=re.IGNORECASE
    )

    prompt_result = re.sub(r"\[OUTPUT TEMPLATE - YOU MUST FILL THIS OUT EXACTLY IN ENGLISH\]\s*", "", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"-\s*Act as a master anime scene director[\s\S]*?(?=\n\s*retention_analysis:)", "", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"-\s*Subtly enhance the atmosphere[\s\S]*?(?=\n\s*retention_analysis:)", "", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"\[Subject\s*\d+:\s*CharacterName\]\s*", "", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"\[English translation[^\]]*\]\s*", "", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"(?im)^Vocal reference for\s+[\w\s]+\s+is\s+<Audio\s*\d+>.*$", "", prompt_result)
    prompt_result = re.sub(r"Action/Camera:\s*", "", prompt_result)
    prompt_result = re.sub(r"\[CRITICAL RULE\]:\s*", "", prompt_result, flags=re.IGNORECASE)

    for shot_idx, dia_lines in saved_dialogues.items():
        if not dia_lines:
            continue
            
        start_marker = f"[Shot {shot_idx}"
        start_idx = prompt_result.find(start_marker)
        
        if start_idx != -1:
            next_shot_idx = prompt_result.find(f"[Shot {shot_idx + 1}", start_idx)
            
            sec_positions = []
            for sec_name in ["overall_soundscape", "non_diegetic_music", "retention_analysis"]:
                m = re.search(rf"(?i)(\[{sec_name}\]|{sec_name}:)", prompt_result[start_idx:])
                if m:
                    sec_positions.append(start_idx + m.start())
            
            next_sec_idx = min(sec_positions) if sec_positions else len(prompt_result)
            end_idx = next_shot_idx if next_shot_idx != -1 else next_sec_idx

            shot_text = prompt_result[start_idx:end_idx].rstrip()
            injected_dialogues = "\n" + "\n".join(dia_lines) + "\n\n"
            prompt_result = prompt_result[:start_idx] + shot_text + injected_dialogues + prompt_result[end_idx:]

    for idx, refs in sorted(char_refs.items(), key=lambda x: x[0]):
        label = refs["label"]
        
        ref_parts = []
        if refs["pics"]:
            ref_parts.append(f"Reference sheets for {label} include {refs['pics_str']}.")
        if refs["audio"] and refs["audio"] != "None":
            ref_parts.append(f"Vocal reference for {label} is {refs['audio']}.")
        ref_line = " ".join(ref_parts)
        if not ref_line:
            continue

        subj_pat = rf"(?i)(\[Subject\s*{idx}:?[^\]]*\][\s\S]*?)(?=\n\s*\[Subject|\n\s*\[?summary\]?:|\Z)"
        match = re.search(subj_pat, prompt_result)

        if match:
            block = match.group(1).rstrip()
            prompt_result = prompt_result[:match.start()] + block + f"\n{ref_line}\n\n" + prompt_result[match.end():]

    prompt_result = re.sub(r"^(summary:)\s*\n+", r"\1\n", prompt_result, flags=re.MULTILINE | re.IGNORECASE)
    prompt_result = re.sub(r"\n{3,}", "\n\n", prompt_result).strip()

    return prompt_result


@PromptServer.instance.routes.post("/h3/generate_auto_scenario")
async def handle_generate_auto_scenario(request):
    try:
        data = await request.json()
        auto_data_str = data.get("auto_data", "{}")
        try:
            auto_data = json.loads(auto_data_str)
        except:
            auto_data = {}
            
        story = auto_data.get("story", "")
        clip_count = int(auto_data.get("clipCount", 1))
        no_clips = auto_data.get("noClips", False)
        duration = int(auto_data.get("duration", 5)) # デフォルト5秒
        
        clip_actual_duration = round(max(0, duration - 1.6), 1)
        total_duration = round(duration + (clip_actual_duration * clip_count), 1) if not no_clips else float(duration)
        
        char_list_str = []
        for i in range(1, 4):
            if data.get(f"char{i}_enabled", False):
                name = data.get(f"char{i}_name", "").strip()
                preset = data.get(f"char{i}_preset", "None")
                label = name if name else (preset if preset not in ["None", "Custom Text"] else f"Character {i}")
                char_list_str.append(f"S{i}: {label}")
        char_context = ", ".join(char_list_str)
        situation = data.get("situation", "")
        
        sys_prompt = "You are a master anime and film director. Based on the user's story, create a detailed, time-sequenced storyboard.\n"
        sys_prompt += "Write ALL text in JAPANESE.\n\n"
        sys_prompt += "【動画の時間とショット構成のルール】\n"
        sys_prompt += f"・1つの動画の長さは {duration}秒 です。\n"
        
        if no_clips:
            sys_prompt += f"・今回はクリップ生成なし（ベース生成のみ）のため、全体の長さは {total_duration}秒 です。\n"
            sys_prompt += f"・時間軸の最後は必ず 0:{duration:04.1f} で終わるように調整してください。\n"
        else:
            sys_prompt += f"・クリップ動画は前の動画と約1.6秒重なって結合されるため、クリップ1本あたりの進む時間は {clip_actual_duration}秒 です。\n"
            sys_prompt += f"・ベース動画 ＋ クリップ {clip_count}本 のため、物語全体の長さは 約{total_duration}秒 となります。\n"
            sys_prompt += f"・ベース動画の時間軸の最後は必ず 0:{duration:04.1f} で終わるようにしてください。\n"
            sys_prompt += f"・各クリップの時間軸の最後は必ず 0:{clip_actual_duration:04.1f} で終わるようにしてください。\n"
            
        sys_prompt += "・この全体の長さを考慮して、時間軸（秒数）に沿って展開を作ってください。\n"
        sys_prompt += "・1つの動画（ベースまたは各クリップ）は、長さに応じて最大4つまでの「ショット（カット）」に分割できます。\n"
        sys_prompt += "・5秒など短い場合は1〜2ショット、15秒など長い場合は3〜4ショットなど、時間を適切に使って描写してください。\n"
        sys_prompt += "・時間軸は必ずShot 1 ≦ Shot 2 ≦ Shot 3... のように時系列順にしてください。\n"
        sys_prompt += "・各ショットのアクションには、照明、空気感、感情などのリッチな情景描写を含めてください。要約は厳禁です。\n\n"
        
        sys_prompt += f"[Scene Settings]\nCharacters: {char_context}\nSituation: {situation}\n"
        sys_prompt += f"\n[User Story]\n{story}\n\n"
        
        sys_prompt += "[Output Format]\n"
        sys_prompt += "DO NOT use JSON. Use EXACTLY the following format with tags. DO NOT output any extra conversational text.\n\n"
        
        if no_clips:
            sys_prompt += f"===BASE===\n<Shot 1>\n[Time] 0:00.0-0:{duration:04.1f}\n[Action] (アクション描写)\n"
        else:
            sys_prompt += f"===BASE===\n<Shot 1>\n[Time] 0:00.0-0:02.5\n[Action] (アクション描写)\n<Shot 2>\n[Time] 0:02.5-0:{duration:04.1f}\n[Action] (アクション描写)\n\n"
            for i in range(1, clip_count + 1):
                sys_prompt += f"===CLIP {i}===\n<Shot 1>\n[Time] 0:00.0-0:02.0\n[Action] (アクション描写)\n<Shot 2>\n[Time] 0:02.0-0:{clip_actual_duration:04.1f}\n[Action] (アクション描写)\n\n"

        provider = data.get("llm_provider", "Ollama (Local)")
        api_key = data.get("llm_api_key", "")
        model_name = data.get("llm_model", "").strip()
        
        auto_text = call_llm(sys_prompt, provider, api_key, model_name, temp=0.7)
        
        scenario = {"base": {}, "clips": {}}
        current_video = None
        current_shot = None
        
        for line in auto_text.split('\n'):
            line_stripped = line.strip()
            if not line_stripped:
                continue
                
            if re.match(r"^={2,}\s*BASE\s*={2,}$", line_stripped, re.IGNORECASE):
                current_video = "base"
                continue
            
            m_clip = re.match(r"^={2,}\s*CLIP\s*(\d+)\s*={2,}$", line_stripped, re.IGNORECASE)
            if m_clip:
                clip_num = m_clip.group(1)
                current_video = f"clip_{clip_num}"
                scenario["clips"][clip_num] = {}
                continue
                
            m_shot = re.match(r"^<Shot\s*(\d+)>$", line_stripped, re.IGNORECASE)
            if m_shot:
                current_shot = int(m_shot.group(1))
                if current_video == "base":
                    scenario["base"][current_shot] = {"time": "", "action": ""}
                elif current_video and current_video.startswith("clip_"):
                    clip_num = current_video.split("_")[1]
                    scenario["clips"][clip_num][current_shot] = {"time": "", "action": ""}
                continue
                
            m_time = re.match(r"^\[Time\]\s*(.*)$", line_stripped, re.IGNORECASE)
            if m_time and current_video and current_shot:
                if current_video == "base":
                    scenario["base"][current_shot]["time"] = m_time.group(1).strip()
                elif current_video.startswith("clip_"):
                    clip_num = current_video.split("_")[1]
                    scenario["clips"][clip_num][current_shot]["time"] = m_time.group(1).strip()
                continue
                
            m_action = re.match(r"^\[Action\]\s*(.*)$", line_stripped, re.IGNORECASE)
            if m_action and current_video and current_shot:
                if current_video == "base":
                    scenario["base"][current_shot]["action"] = m_action.group(1).strip()
                elif current_video.startswith("clip_"):
                    clip_num = current_video.split("_")[1]
                    scenario["clips"][clip_num][current_shot]["action"] = m_action.group(1).strip()
                continue
                
            if current_video and current_shot:
                if current_video == "base" and "action" in scenario["base"][current_shot]:
                    scenario["base"][current_shot]["action"] += "\n" + line_stripped
                elif current_video.startswith("clip_"):
                    clip_num = current_video.split("_")[1]
                    if "action" in scenario["clips"][clip_num][current_shot]:
                        scenario["clips"][clip_num][current_shot]["action"] += "\n" + line_stripped

        return web.json_response({
            "success": True, 
            "base_shots": scenario.get("base", {}),
            "clips_data": scenario.get("clips", {})
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/h3/generate_prompt")
async def handle_generate_prompt(request):
    try:
        data = await request.json()
        
        prompt_result = build_and_generate_prompt(data)
        
        clip_prompts_out = {}
        clips_to_translate = {}
        
        for i in range(1, 11):
            if data.get(f"c{i}_enabled", False):
                clip_text_parts = []
                is_clip_silent = False # このクリップ全体でセリフなしかどうかのフラグ
                
                for j in range(1, 5):
                    if data.get(f"c{i}_s{j}_enabled", False):
                        time_val = data.get(f"c{i}_s{j}_time", "").strip()
                        time_norm = normalize_time_expression(time_val)
                        action = data.get(f"c{i}_s{j}_action", "").strip()
                        dialogue = data.get(f"c{i}_s{j}_dialogue", "").strip()
                        speaker = data.get(f"c{i}_s{j}_speaker", "None")

                        shot_text = f"[Shot {j} | {time_norm}]\n{action}"
                        
                        if speaker == "None" or not dialogue.strip():
                            is_clip_silent = True
                        else:
                            lines = [l.strip() for l in dialogue.split("\n") if l.strip()]
                            for line in lines:
                                dia = line
                                dia = re.sub(r"^S\d+:\s*", "", dia, flags=re.IGNORECASE)
                                dia = re.sub(r"^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*", "", dia, flags=re.IGNORECASE)
                                dia = re.sub(r"\s*(?:<\/d>|\[\/d\])?$", "", dia, flags=re.IGNORECASE).strip().strip('"').strip("'")
                                if dia:
                                    shot_text += f"\n{speaker}: <d>[Japanese] {dia} </d>"
                        clip_text_parts.append(shot_text)
                
                txt = "\n\n".join(clip_text_parts)
                manual_prompt = data.get(f"c{i}_prompt", "").strip()
                if manual_prompt and not txt:
                    txt = manual_prompt

                if txt:
                    if is_clip_silent:
                        silent_clip_cmd = "Do not continue, extend, imitate, or infer any human voice or vocalization from the incoming audio context. The character remains completely silent throughout this continuation. No speech, dialogue, chatter, whispering, mumbling, babbling, singing, or intelligible words in any language.\n\n"
                        txt = silent_clip_cmd + txt

                    if contains_japanese(txt):
                        clips_to_translate[i] = txt
                    else:
                        clip_prompts_out[i] = txt
                        
        if clips_to_translate:
            translated = translate_clip_texts(clips_to_translate, data)
            for k, v in translated.items():
                clip_prompts_out[k] = v
                
        final_clip_prompts = {}
        for i in range(1, 11):
            txt = clip_prompts_out.get(i, "").strip()
            if txt:
                auto_data_str = data.get("auto_data", "{}")
                try:
                    auto_data = json.loads(auto_data_str)
                except:
                    auto_data = {}

                if auto_data.get("enabled", False):
                    do_continue = True
                    link_next = True
                else:
                    do_continue = data.get(f"c{i}_continue", True)
                    link_next = data.get(f"c{i}_link_next", False)
                
                if do_continue:
                    txt = "Continue the existing scene from the previous generated H3 clip with no cut, reset, or re-establishment. The incoming protected H3 audiovisual latent prefix is authoritative for current pose, motion, camera trajectory, facial state, lighting, environment, object state, voice, ambience, and timing. Connected reference images are optional; use them only to preserve stable subject identity and appearance beneath that incoming state.\n\n" + txt
                
                if link_next:
                    if "completely silent" in txt:
                        txt += "\n\nContinue the exact motion and existing non-vocal environmental sound already in progress, then develop the next action naturally. Preserve the silence: do not add or continue any human voice or speech-like vocalization. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                    else:
                        txt += "\n\nContinue the exact motion and sound already in progress, then develop the next action naturally. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                    
                final_clip_prompts[str(i)] = txt
                
        return web.json_response({
            "success": True, 
            "prompt": prompt_result,
            "clip_prompts": final_clip_prompts
        })
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
        audio_list = ["None", "<Audio 1>", "<Audio 2>", "<Audio 3>"]

        inputs = {
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
                "auto_data": ("STRING", {"default": '{"enabled":false, "overwrite":false, "noClips":false, "chars":["S1"], "duration":5, "clipCount":1, "story":""}'}),
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
        
        for i in range(1, 11):
            inputs["required"][f"c{i}_enabled"] = ("BOOLEAN", {"default": False})
            inputs["required"][f"c{i}_continue"] = ("BOOLEAN", {"default": True})
            inputs["required"][f"c{i}_link_next"] = ("BOOLEAN", {"default": False})
            inputs["required"][f"c{i}_prompt"] = ("STRING", {"multiline": True, "default": ""})
            for j in range(1, 5):
                inputs["required"][f"c{i}_s{j}_enabled"] = ("BOOLEAN", {"default": (j == 1)})
                inputs["required"][f"c{i}_s{j}_time"] = ("STRING", {"default": "0秒〜3秒" if j==1 else ""})
                inputs["required"][f"c{i}_s{j}_action"] = ("STRING", {"multiline": True, "default": ""})
                inputs["required"][f"c{i}_s{j}_speaker"] = ("STRING", {"default": "S1" if j==1 else "None"})
                inputs["required"][f"c{i}_s{j}_dialogue"] = ("STRING", {"multiline": True, "default": ""})

        inputs["required"]["generated_clip_prompts"] = ("STRING", {"default": "{}"})

        return inputs

    RETURN_TYPES = ("STRING", "STRING", "H3_MEDIA_BUNDLE")
    RETURN_NAMES = ("prompt", "clip_prompt", "media_bundle")
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

        clip_prompt_json = kwargs.get("generated_clip_prompts", "{}")
        
        try:
            parsed = json.loads(clip_prompt_json)
        except:
            parsed = {}
            
        if not parsed:
            for i in range(1, 11):
                if kwargs.get(f"c{i}_enabled", False):
                    clip_text_parts = []
                    is_clip_silent = False
                    
                    for j in range(1, 5):
                        if kwargs.get(f"c{i}_s{j}_enabled", False):
                            time_val = kwargs.get(f"c{i}_s{j}_time", "").strip()
                            time_norm = normalize_time_expression(time_val)
                            action = kwargs.get(f"c{i}_s{j}_action", "").strip()
                            dialogue = kwargs.get(f"c{i}_s{j}_dialogue", "").strip()
                            speaker = kwargs.get(f"c{i}_s{j}_speaker", "None")

                            shot_text = f"[Shot {j} | {time_norm}]\n{action}"
                            
                            if speaker == "None" or not dialogue.strip():
                                is_clip_silent = True
                            else:
                                lines = [l.strip() for l in dialogue.split("\n") if l.strip()]
                                for line in lines:
                                    dia = line
                                    dia = re.sub(r"^S\d+:\s*", "", dia, flags=re.IGNORECASE)
                                    dia = re.sub(r"^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*", "", dia, flags=re.IGNORECASE)
                                    dia = re.sub(r"\s*(?:<\/d>|\[\/d\])?$", "", dia, flags=re.IGNORECASE).strip().strip('"').strip("'")
                                    if dia:
                                        shot_text += f"\n{speaker}: <d>[Japanese] {dia} </d>"
                            clip_text_parts.append(shot_text)
                    
                    txt = "\n\n".join(clip_text_parts)
                    manual_prompt = kwargs.get(f"c{i}_prompt", "").strip()
                    if manual_prompt and not txt:
                        txt = manual_prompt

                    if txt:
                        if is_clip_silent:
                            silent_clip_cmd = "Do not continue, extend, imitate, or infer any human voice or vocalization from the incoming audio context. The character remains completely silent throughout this continuation. No speech, dialogue, chatter, whispering, mumbling, babbling, singing, or intelligible words in any language.\n\n"
                            txt = silent_clip_cmd + txt

                        if kwargs.get(f"c{i}_continue", True):
                            txt = "Continue the existing scene from the previous generated H3 clip with no cut, reset, or re-establishment. The incoming protected H3 audiovisual latent prefix is authoritative for current pose, motion, camera trajectory, facial state, lighting, environment, object state, voice, ambience, and timing. Connected reference images are optional; use them only to preserve stable subject identity and appearance beneath that incoming state.\n\n" + txt
                        if kwargs.get(f"c{i}_link_next", False):
                            if is_clip_silent:
                                txt += "\n\nContinue the exact motion and existing non-vocal environmental sound already in progress, then develop the next action naturally. Preserve the silence: do not add or continue any human voice or speech-like vocalization. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                            else:
                                txt += "\n\nContinue the exact motion and sound already in progress, then develop the next action naturally. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                        parsed[str(i)] = txt
            clip_prompt_json = json.dumps(parsed, ensure_ascii=False)

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

        return (prompt_result, clip_prompt_json, media_bundle)


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
        "H3_MEDIA_PIPE",
        "IMAGE", "IMAGE",
        "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE",
        "IMAGE", "IMAGE",
        "AUDIO", "AUDIO", "AUDIO",
        "AUDIO", "AUDIO",
    )
    RETURN_NAMES = (
        "media_pipe",
        "first_frame", "last_frame",
        "ref_image_0", "ref_image_1", "ref_image_2", "ref_image_3", "ref_image_4", "ref_image_5", "ref_image_6", "ref_image_7", "ref_image_8",
        "ref_video_0", "ref_video_1",
        "ref_audio_0", "ref_audio_1", "ref_audio_2",
        "drive_audio", "final_audio",
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
        
        drive_audio = audios.get(3)
        final_audio = audios.get(4)

        raw_outputs = (
            first_frame,
            last_frame,
            ref_imgs[0], ref_imgs[1], ref_imgs[2], ref_imgs[3], ref_imgs[4],
            ref_imgs[5], ref_imgs[6], ref_imgs[7], ref_imgs[8],
            ref_video_0, ref_video_1,
            ref_audio_0, ref_audio_1, ref_audio_2,
            drive_audio, final_audio,
        )

        return (raw_outputs,) + raw_outputs

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