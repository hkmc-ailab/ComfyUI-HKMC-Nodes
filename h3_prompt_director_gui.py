import os
import re
import json
import base64
import asyncio
import mimetypes
import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image, ImageOps
import cv2
import torchaudio
import requests
from openai import OpenAI
import folder_paths
import scipy.io.wavfile as wavfile
from server import PromptServer
from aiohttp import web

def get_refmod_files():
    models_dir = folder_paths.models_dir
    refmod_dir = os.path.join(models_dir, "refmods")
    os.makedirs(refmod_dir, exist_ok=True)
    
    files = []
    for root, _, filenames in os.walk(refmod_dir):
        for f in filenames:
            if f.endswith(".safetensors"):
                rel_path = os.path.relpath(os.path.join(root, f), refmod_dir)
                stem = rel_path[:-len(".safetensors")].replace("\\", "/")
                files.append(stem)
    files.sort()
    return ["None"] + files

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

def call_llm(sys_inst, provider, api_key, model_name, temp=0.7, audio_path=None):
    if provider == "Gemini (Cloud)":
        raw_key = api_key if (api_key and api_key.strip()) else (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "")
        active_key = raw_key.strip().strip('"').strip("'").strip()

        if not active_key:
            raise ValueError("Gemini API Key is missing. Please set it in the UI or as an environment variable (GEMINI_API_KEY or GOOGLE_API_KEY).")

        raw_model = model_name.strip() if model_name and model_name.strip() else "gemini-2.5-flash"
        clean_model = raw_model.replace("models/", "").strip()
        
        parts = [{"text": sys_inst}]
        if audio_path and os.path.exists(audio_path):
            try:
                guessed_mime, _ = mimetypes.guess_type(audio_path)
                audio_mime = guessed_mime or "audio/wav"
                with open(audio_path, "rb") as f:
                    raw_audio_bytes = f.read()
                b64_audio = base64.b64encode(raw_audio_bytes).decode("utf-8")
                parts.append({
                    "inline_data": {
                        "mime_type": audio_mime,
                        "data": b64_audio
                    }
                })
            except Exception as e:
                print(f"[H3 Prompt Director] 音声読み込みエラー: {e}")

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": temp}
        }

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": active_key
        }

        api_versions = ["v1beta", "v1"]
        last_res = None

        for ver in api_versions:
            url = f"https://generativelanguage.googleapis.com/{ver}/models/{clean_model}:generateContent"
            res = requests.post(url, headers=headers, json=payload, timeout=600)
            last_res = res

            if res.status_code == 200:
                try:
                    return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                except Exception as parse_e:
                    raise RuntimeError(f"Geminiレスポンス解析エラー: {parse_e}")
            elif res.status_code == 404:
                continue
            else:
                raise RuntimeError(f"Gemini API 認証・通信エラー ({res.status_code}): {res.text}")

        err_text = last_res.text if last_res is not None else "Not Found"
        raise RuntimeError(f"指定されたモデル名 '{clean_model}' は v1beta / v1 のいずれでも見つかりませんでした (404): {err_text}")

    elif provider == "ChatGPT (OpenAI)":
        active_key = (api_key.strip() if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY", "")).strip()
        if not active_key:
            raise ValueError("OpenAI API Keyが設定されていません。")
        client = OpenAI(api_key=active_key, timeout=600.0)
        response = client.chat.completions.create(
            model=model_name.strip() if model_name and model_name.strip() else "gpt-4o",
            messages=[{
                "role": "system",
                "content": "You are an expert translator and prompt engineer."
            }, {"role": "user", "content": sys_inst}],
            temperature=temp,
        )
        return (response.choices[0].message.content or "").strip()

    elif provider == "Ollama (Local)":
        target_model = model_name.strip() if model_name and model_name.strip() else "qwen2.5:7b-instruct-q5_K_M"
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": target_model,
            "prompt": sys_inst,
            "stream": False,
            "options": {"temperature": temp},
        }
        res = requests.post(url, json=payload, timeout=900)
        res.raise_for_status()
        prompt_result = res.json().get("response", "").strip()
        return prompt_result
    else:
        raise ValueError(f"未知のLLMプロバイダー: {provider}")

def translate_clip_texts(clips_dict, kwargs):
    if not clips_dict:
        return {}
        
    prompt_text = "Translate the following Japanese video generation prompts into English precisely.\n"
    prompt_text += "CRITICAL RULE 1: The translation MUST be 100% in English. NO Chinese. NO Japanese.\n"
    prompt_text += "CRITICAL RULE 2: DO NOT translate or modify any text inside <d>...</d> tags. Leave those tags and their exact contents completely untouched.\n"
    prompt_text += "CRITICAL RULE 3: DO NOT translate, modify, or remove any tags enclosed in <...> (such as <Subject 1>, <Subject 2>, <Audio 1>, <Picture 1>, etc.). Keep their exact format intact.\n"
    prompt_text += "CRITICAL RULE 4: Treat '<Subject X>' as the defined subject (person, object, or place) (like a person's name, e.g. 'Alice' or 'John') in the grammatical structure. Ensure standard English sentence syntax (e.g. '<Subject 1> turns around and looks at <Subject 2>'). DO NOT omit subjects or convert sentences into awkward sentence fragments.\n"
    prompt_text += "CRITICAL RULE 5: Output the translated texts wrapped in XML tags exactly corresponding to the input. Do not add any other text outside the XML tags.\n"
    prompt_text += "CRITICAL RULE 6: DO NOT summarize or shorten the descriptions. Translate EVERY detail, including lighting, atmosphere, character emotions, and camera movements faithfully.\n"
    prompt_text += "CRITICAL RULE 7: Keep any English instructions (such as 'CRITICAL: ...' or '[Shot X | ...]' or 'Do not continue...') exactly as they are. DO NOT translate or modify them.\n\n"
    
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

SILENT_SHOT_INSTRUCTION = (
    "No dialogue, speech, whispering, mumbling, babbling, laughter, giggling, "
    "humming, singing, grunts, acknowledgements, or other human vocal reactions "
    "from any character during this shot. No speech-related lip movements or lip "
    "synchronization. Facial expressions and physical actions remain exactly as "
    "specified; do not force a closed mouth when the action requires otherwise. "
    "Preserve the requested environmental sounds, sound effects, and music."
)


def silence_shot_text(action):
    """Speech instruction for a silent shot, with a conservative smile cue."""
    instruction = SILENT_SHOT_INSTRUCTION
    if re.search(r"\b(?:smile|smiles|smiling)\b|微笑|笑顔|にこり|ニコリ", action, re.IGNORECASE):
        instruction += " If smiling, show a gentle closed-mouth smile without laughter or vocalization."
    return "Speech: " + instruction


def convert_named_subjects(text, names):
    """Exact, silent replacement of explicit aliases; leaves existing tags untouched."""
    if not isinstance(text, str) or not isinstance(names, dict):
        return text if isinstance(text, str) else ""
    aliases = {}
    for key, raw in names.items():
        if not re.fullmatch(r"[1-5]", str(key)) or not isinstance(raw, str):
            continue
        name = raw.strip()
        if not name or re.fullmatch(r"<\s*Subject\s+[1-5]\s*>", name, re.I):
            continue
        aliases.setdefault(name, set()).add(int(key))
    unique = {name: next(iter(indices)) for name, indices in aliases.items() if len(indices) == 1}
    if not unique:
        return text
    alternatives = "|".join(re.escape(name) for name in sorted(unique, key=len, reverse=True))
    pat = re.compile(r"<[^>]*>|(?<![A-Za-z0-9_])(?:" + alternatives + r")(?![A-Za-z0-9_])")
    return pat.sub(lambda m: m.group(0) if m.group(0).startswith("<") else f"<Subject {unique[m.group(0)]}>", text)


@PromptServer.instance.routes.post("/h3/convert_subject_names")
async def handle_convert_subject_names(request):
    try:
        data = await request.json()
        converted = convert_named_subjects(data.get("text", ""), data.get("names", {}))
        return web.json_response({"text": converted})
    except Exception:
        return web.json_response({"text": ""})


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

    for i in range(1, 6):
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

        pic_tags = sorted({f"<Picture {int(n)}>" for n in re.findall(r"<Picture\s+([1-9])>", pics_raw or "", re.IGNORECASE)}, key=lambda tag: int(re.search(r"\d+", tag).group()))

        desc_parts = []
        base_text = read_char_txt(preset)
        if base_text:
            desc_parts.append(base_text)
        if extra:
            desc_parts.append(f"[Extra Details - STRICTLY TRANSLATE INTO ENGLISH WITHOUT INTERPRETATION]:\n{extra}")

        subj_idx = i
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
            subjects.append(f"<Subject {subj_idx}> name is {label}. {label} is {combined}" if combined else f"<Subject {subj_idx}> name is {label}.")

    for i in range(1, 6):
        if kwargs.get(f"char{i}_enabled", (i == 1)):
            continue
        manual = kwargs.get(f"subject_def_{i}", "").strip()
        if manual:
            manual = re.sub(r"^\s*(?:<\s*Subject\s*\d+\s*>|\[Subject\s*\d+[^]]*\])\s*", "", manual, flags=re.IGNORECASE)
            subjects.append(f"<Subject {i}> {manual}")

    scene_refs = {}
    for i in range(1, 6):
        if kwargs.get(f"char{i}_enabled", (i == 1)):
            continue
        if not kwargs.get(f"subject_def_{i}", "").strip():
            continue
        raw_pics = kwargs.get(f"subject_pics_{i}", "") or ""
        raw_audio = kwargs.get(f"subject_audio_{i}", "") or ""
        pic_nums = sorted({int(n) for n in re.findall(r"<Picture\s+([1-9])>", raw_pics, re.IGNORECASE)})
        audio_nums = sorted({int(n) for n in re.findall(r"<Audio\s+([1-3])>", raw_audio, re.IGNORECASE)})
        scene_refs[i] = (pic_nums, audio_nums)

    char_description = process_wildcards("\n\n".join(subjects))

    shots = []
    saved_dialogues = {}
    enabled_shot_count = 0
    silent_shot_count = 0

    shot_counter = 0
    for i in range(1, 5):
        if not kwargs.get(f"shot{i}_enabled", False):
            continue
        shot_counter += 1
        enabled_shot_count += 1

        raw_time = kwargs.get(f"shot{i}_time", "").strip()
        norm_time = normalize_time_expression(raw_time)

        action = kwargs.get(f"shot{i}_action", "").strip()
        dialogue_raw = kwargs.get(f"shot{i}_dialogue", "").strip()
        speaker_choice = kwargs.get(f"shot{i}_speaker", "None")

        content = []
        if action:
            content.append(f"Action/Camera: {action}")

        if speaker_choice in ("None", "セリフなし") or not dialogue_raw.strip():
            silent_shot_count += 1
            content.append(silence_shot_text(action))
        else:
            dia_lines = []
            lines = [l.strip() for l in dialogue_raw.split("\n") if l.strip()]
            for line in lines:
                dia = line
                dia = re.sub(r"^S\d+:\s*", "", dia, flags=re.IGNORECASE)
                dia = re.sub(r"^(?:<d>|\[d\])?(?:\s*\[Japanese\])?\s*", "", dia, flags=re.IGNORECASE)
                dia = re.sub(r"\s*(?:<\/d>|\[\/d\])?$", "", dia, flags=re.IGNORECASE).strip().strip('"').strip("'")
                if dia:
                    if speaker_choice.startswith("S") and speaker_choice[1:].isdigit():
                        dia_lines.append(f"{speaker_choice}: <d>[Japanese] {dia} </d>")
                    else:
                        dia_lines.append(f"<d>[Japanese] {dia} </d>")
            
            if dia_lines:
                saved_dialogues[shot_counter] = dia_lines
                if speaker_choice.startswith("S") and speaker_choice[1:].isdigit():
                    subj_num = speaker_choice[1:]
                    content.append(f"(Note for translation: Ensure <Subject {subj_num}> is described as visibly speaking/talking. DO NOT insert any <Audio> tags.)")
                else:
                    content.append(f"(Note for translation: Ensure the speaker is described as visibly speaking/talking. DO NOT insert any <Audio> tags.)")

        if content:
            shots.append(f"[Shot {shot_counter} | {norm_time}]\n" + "\n".join(content))
        else:
            shots.append(f"[Shot {shot_counter} | {norm_time}]\nAction/Camera: Continuous action.")

    timeline_seq = "\n\n".join(shots)
    shot_subject_tags = {}
    for shot_number, shot_body in enumerate(shots, 1):
        shot_subject_tags[shot_number] = set(re.findall(r"<Subject\s+([1-5])>", shot_body, re.I))
    timeline_seq = re.sub(
        r"<Subject\s+([1-5])>",
        lambda m: "H3SHOTSUBJECTTOKEN" + m.group(1) + "END",
        timeline_seq, flags=re.I,
    )

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
    if enabled_shot_count > 0 and silent_shot_count == enabled_shot_count:
        silent_summary = "\n[CRITICAL RULE]: All characters remain non-vocal throughout the entire video. Do not describe conversation, dialogue, or vocal reactions in the summary."
        silent_desc = "\n[CRITICAL RULE]: No character speaks or makes any vocal reaction. Preserve every specified action and facial expression; avoid speech-related mouth movements and lip synchronization."
        silent_sound = "\n[CRITICAL RULE]: No human speech or speech-like vocalizations of any kind. No intelligible or unintelligible words in any language. No dialogue, background chatter, whispering, muttering, babbling, singing, humming, or narration. Do not generate spontaneous voices or vocal sounds. Preserve explicitly requested non-vocal environmental sounds, sound effects, and music."

    summary_subject_roles = []
    for idx in range(1, 6):
        if kwargs.get(f"char{idx}_enabled", idx == 1):
            summary_subject_roles.append(f"<Subject {idx}>: character (available in the video; not necessarily visible in every shot)")
        elif kwargs.get(f"subject_def_{idx}", "").strip():
            role = kwargs.get(f"subject_kind_{idx}", "オブジェクト")
            if role not in ("人物", "背景", "オブジェクト"):
                role = "オブジェクト"
            summary_subject_roles.append(f"<Subject {idx}>: " + {"人物": "person", "背景": "background / potential setting", "オブジェクト": "object"}[role])
    summary_roles = "\n".join(summary_subject_roles) or "None"
    summary_story = kwargs.get("overall_story", "").strip()
    direct_picture = any(ref[0] for ref in scene_refs.values()) or any(ref["pics"] for ref in char_refs.values())
    direct_audio = any(ref[1] for ref in scene_refs.values()) or any(ref["audio"] for ref in char_refs.values())
    if direct_picture and direct_audio:
        summary_task_tag = "[reference generation + audio reference]"
    elif direct_picture:
        summary_task_tag = "[reference generation]"
    elif direct_audio:
        summary_task_tag = "[audio reference]"
    else:
        summary_task_tag = "" 

    raw_rules = load_system_rules(is_auto=False)

    summary_guard = (
        "\n[SUMMARY SOURCE PRIORITY - STRICT]: Use Overall Synopsis "
        "as the ONLY sources for summary events and environment. Subject Roles "
        "may identify relevant subjects. Movement & Timing is exclusively for "
        "detailed_description: never summarize its shots, camera moves, "
        "framing, zooms, dialogue, or emotions in summary. If Overall Synopsis "
        "is brief, keep summary brief; do not fill gaps from shot descriptions."
    )

    shot_tag_guard = (
        "\n[SHOT SUBJECT TAG PRESERVATION - STRICT]: In Movement & Timing, "
        "H3SHOTSUBJECTTOKEN1END through H3SHOTSUBJECTTOKEN5END are immutable "
        "Subject identifiers. In detailed_description, reproduce every token "
        "from each shot verbatim in THAT SAME shot; never replace a token "
        "with a name or English noun phrase, never move it to another shot, "
        "and never invent tokens absent from that shot. You may add a short "
        "English explanation after a token. These tokens are not for summary."
    )
    sys_inst = raw_rules.format(
        creative_instruction=creative_instruction + silent_summary + summary_guard + shot_tag_guard,
        char_description=char_description,
        situation="",
        overall_story=summary_story,
        summary_roles=summary_roles,
        summary_task_tag=summary_task_tag,
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
    prompt_result = re.sub(
        r"H3SHOTSUBJECTTOKEN([1-5])END",
        lambda m: f"<Subject {m.group(1)}>",
        prompt_result, flags=re.I,
    )

    stage_text = ""  
    story_text = summary_story
    explicit_tags = set(re.findall(r"<Subject\s+([1-5])>", stage_text + "\n" + story_text, re.I))

    def protect_subject_tags(value):
        return re.sub(r"<Subject\s+([1-5])>",
                      lambda m: "H3SUBJECTTOKEN" + m.group(1) + "END",
                      value, flags=re.I)

    protected_stage = protect_subject_tags(stage_text)
    protected_story = protect_subject_tags(story_text)
    summary_input = (
        "Translate the Japanese Stage and Overall Synopsis into ONE short natural "
        "English overview of the entire video. Do not include any shot details, "
        "camera directions, shot numbers, timestamps, dialogue, or invented events.\n"
        "IMPORTANT: H3SUBJECTTOKEN1END through H3SUBJECTTOKEN5END are immutable "
        "names of subjects, NOT words to translate or expand. Reproduce each "
        "token EXACTLY where its subject occurs. Never substitute a person's "
        "name or an object's description for a token.\n"
        "Do not include headings, task tags, markdown, or explanations.\n"
        "If the synopsis is brief, the output must be brief.\n"
        "Subject roles (context only; do not add missing subjects):\n"
        f"{summary_roles}\n"
        f"Stage: {protected_stage}\n"
        f"Overall Synopsis: {protected_story}\n"
    )
    def clean_summary_translation(raw):
        raw = re.sub(r"(?i)^\s*(?:summary\s*:\s*|\[reference generation(?: \+ audio reference)?\]\s*|\[audio reference\]\s*)+", "", raw.strip())
        return raw.strip("` \n")

    def restore_marker_variants(body):
        pattern = r"(?i)<?\bH3[\s_-]*SUBJECT[\s_-]*TOKEN[\s_-]*([1-5])[\s_-]*END\b>?"
        return re.sub(pattern, lambda m: f"H3SUBJECTTOKEN{m.group(1)}END", body)

    def summary_is_valid(body):
        found = set(re.findall(r"H3SUBJECTTOKEN([1-5])END", body))
        if not body or contains_japanese(body) or not explicit_tags.issubset(found):
            return False, "missing markers or untranslated Japanese"
        if re.search(r"(?i)\b(?:in the (?:first|second|third|next|final) shot|shot\s*\d+|camera pans?|camera zooms?|close[- ]up angle|full[- ]body angle)\b", body):
            return False, "shot-level details"
        if re.fullmatch(r"(?is)the video (?:features|shows|includes)\s+[\w\s,<>.]+", body) and not re.search(r"(?i)\b(?:walks?|arrives?|reaches?|enters?|leaves?|runs?|talks?|meets?|finds?|opens?|closes?|moves?|travels?|looks?|stands?|sits?|falls?|flies?|drives?|discovers?|approaches?)\b", body):
            return False, "subject list without synopsis"
        return True, "ok"

    summary_body = ""
    for attempt in range(4):
        if attempt < 2:
            request = summary_input + ("\nReturn only the English summary. Copy the marker names exactly; never expand them." if attempt else "")
        else:
            request = (
                "Translate the following Japanese setting and synopsis into one concise, "
                "natural English video summary. Keep EVERY literal <Subject N> reference "
                "as <Subject N>, including its number; do not replace it with a name "
                "or description. Translate WHOLE SENTENCES, not fragments. "
                "Do not mention shots, cameras, or events absent from the synopsis. "
                "Output only the English summary, without a heading.\n"
                f"Stage: {stage_text}\nOverall Synopsis: {story_text}\n"
            )
            if attempt == 3:
                request += "The last answer was invalid. Preserve the literal Subject references and the actions in the synopsis.\n"
        candidate = clean_summary_translation(call_llm(request, provider, api_key, model_name, temp=0.2))
        candidate = restore_marker_variants(candidate)
        candidate = protect_subject_tags(candidate)
        valid, reason = summary_is_valid(candidate)
        if valid:
            summary_body = candidate
            print(f"[H3 Prompt Director] summary accepted (attempt {attempt + 1}, whole sentence)")
            break
        print(f"[H3 Prompt Director] summary rejected (attempt {attempt + 1}/4): {reason}; draft={candidate[:250]!r}")

    if not summary_body:
        raise ValueError(
            "Summary whole-sentence translation failed after 4 attempts. "
            "Check the H3 Prompt Director console for rejected drafts and reasons."
        )

    summary_body = re.sub(
        r"H3SUBJECTTOKEN([1-5])END",
        lambda m: f"<Subject {m.group(1)}>", summary_body
    )
    summary_final = (summary_task_tag + " " if summary_task_tag else "") + summary_body
    section_pattern = r"(?ims)^(summary:)\s*.*?(?=^retention_analysis:)"
    if re.search(section_pattern, prompt_result):
        prompt_result = re.sub(section_pattern, lambda m: "summary:\n" + summary_final + "\n\n", prompt_result, count=1)
    else:
        print("[H3 Prompt Director] summary replacement skipped: section boundaries not found")

    prompt_result = re.sub(r"<\s*(?:subject|s)\s*:?\s*([1-5])\s*>",
                           lambda m: f"<Subject {m.group(1)}>", prompt_result, flags=re.IGNORECASE)
    prompt_result = re.sub(r"(?im)^\s*\[Subject\s*([1-5])\s*:\s*([^]\n]+)\]",
                           lambda m: f"<Subject {m.group(1)}> name is {m.group(2).strip()}.", prompt_result)

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
            shot_text = re.sub(
                r"(?im)^[ \t]*(?:Speech:[ \t]*)?(?:No dialogue|No speech|No character speaks|All characters remain non-vocal)\b[^\n]*\n?",
                "",
                shot_text,
            )
            shot_text = re.sub(
                r"(?im)^[ \t]*\(Note for translation:[^\n]*\)[ \t]*\n?",
                "",
                shot_text,
            ).rstrip()
            injected_dialogues = "\n" + "\n".join(dia_lines) + "\n\n"
            prompt_result = prompt_result[:start_idx] + shot_text + injected_dialogues + prompt_result[end_idx:]

    for idx, refs in sorted(char_refs.items(), key=lambda x: x[0]):
        label = refs["label"]
        
        ref_parts = []
        if refs["pics"]:
            ref_parts.append(f"Reference sheets for <Subject {idx}> include {refs['pics_str']}.")
        if refs["audio"] and refs["audio"] != "None":
            ref_parts.append(f"Vocal reference for <Subject {idx}> is {refs['audio']}.")
        ref_line = " ".join(ref_parts)
        if not ref_line:
            continue

        subj_pat = rf"(?im)(^<Subject\s+{idx}>[^\n]*(?:\n(?!\s*<Subject\s+\d+>|\s*summary:)[^\n]*)*)(?=\n\s*<Subject\s+\d+>|\n\s*summary:|\Z)"
        match = re.search(subj_pat, prompt_result)

        if match:
            block = match.group(1).rstrip()
            block = re.sub(
                r"(?im)^\s*(?:Reference sheets for|Vocal reference for|Audio references for)\s+[^\n]*$",
                "", block,
            ).rstrip()
            block = re.sub(
                r"(?i)\s+(?:Reference sheets for|Vocal reference for|Audio references for)\s+[^\n]*$",
                "", block,
            ).rstrip()
            prompt_result = prompt_result[:match.start()] + block + f"\n{ref_line}\n\n" + prompt_result[match.end():]

    for idx, refs in char_refs.items():
        if refs["pics"] or refs["audio"]:
            continue
        pat = rf"(?im)(^<Subject\s+{idx}>[^\n]*(?:\n(?!\s*<Subject\s+\d+>|\s*summary:)[^\n]*)*)(?=\n\s*<Subject\s+\d+>|\n\s*summary:|\Z)"
        match = re.search(pat, prompt_result)
        if match:
            block = re.sub(r"(?im)^\s*(?:Reference sheets for|Vocal reference for|Audio references for)\s+[^\n]*$", "", match.group(1)).rstrip()
            prompt_result = prompt_result[:match.start()] + block + prompt_result[match.end():]

    for idx, (pic_nums, audio_nums) in sorted(scene_refs.items()):
        lines = []
        if pic_nums:
            tags = [f"<Picture {n}>" for n in pic_nums]
            joined = tags[0] if len(tags) == 1 else ", ".join(tags[:-1]) + " and " + tags[-1]
            lines.append(f"Reference sheets for <Subject {idx}> include {joined}.")
        if audio_nums:
            tags = [f"<Audio {n}>" for n in audio_nums]
            joined = tags[0] if len(tags) == 1 else ", ".join(tags[:-1]) + " and " + tags[-1]
            lines.append(f"Audio references for <Subject {idx}> include {joined}.")
        if not lines:
            continue
        pat = rf"(?im)(^<Subject\s+{idx}>[^\n]*(?:\n(?!\s*<Subject\s+\d+>|\s*summary:)[^\n]*)*)(?=\n\s*<Subject\s+\d+>|\n\s*summary:|\Z)"
        match = re.search(pat, prompt_result)
        if match:
            block = match.group(1).rstrip()
            prompt_result = prompt_result[:match.start()] + block + "\n" + "\n".join(lines) + "\n\n" + prompt_result[match.end():]

    try:
        retention_choices = json.loads(kwargs.get("retention_choices_json", "{}") or "{}")
        if not isinstance(retention_choices, dict):
            retention_choices = {}
    except (ValueError, TypeError):
        retention_choices = {}
    visual_policies = {"fully_preserved", "partially_preserved", "weak_reference", "attribute_transfer"}
    audio_policies = {"fully_copy", "partially_copy", "reference", "weak_reference"}
    retention_lines = []
    for idx in range(1, 6):
        is_character = bool(kwargs.get(f"char{idx}_enabled", idx == 1))
        is_scene_subject = bool((kwargs.get(f"subject_def_{idx}", "") or "").strip())
        if not is_character and not is_scene_subject:
            continue
        if is_character:
            kind = "人物"
            picture_tags = list(char_refs.get(idx, {}).get("pics", []))
            audio_tag = char_refs.get(idx, {}).get("audio")
            audio_tags = [audio_tag] if audio_tag else []
        else:
            kind = kwargs.get(f"subject_kind_{idx}", "オブジェクト")
            if kind not in ("人物", "背景", "オブジェクト"):
                kind = "オブジェクト"
            picture_nums, audio_nums = scene_refs.get(idx, ([], []))
            picture_tags = [f"<Picture {n}>" for n in picture_nums]
            audio_tags = [f"<Audio {n}>" for n in audio_nums]
        default_policy = "partially_preserved" if kind == "背景" else "fully_preserved"
        policy = retention_choices.get(f"subject_{idx}", default_policy)
        if policy not in visual_policies:
            policy = default_policy
        guidance_by_kind = {
            "人物": {
                "fully_preserved": "Preserve the character's recognizable identity, facial features, hair, colors, outfit, and distinctive design consistently; allow intended poses, expressions, and camera angles.",
                "partially_preserved": "Retain the character's recognizable identity and defining facial, hair, and design features while allowing controlled changes to nonessential details, poses, and expressions.",
                "weak_reference": "Use the character's appearance and design as loose visual inspiration; substantial changes to nonessential features and styling are permitted.",
                "attribute_transfer": "Transfer only the specified character design attributes to the designated target; do not assume a target if none is selected.",
            },
            "背景": {
                "fully_preserved": "Preserve the setting's defining scenery, architecture, colors, and visual atmosphere consistently; allow camera movement and changes in viewpoint without changing the setting's identity.",
                "partially_preserved": "Retain the setting's characteristic scenery, colors, and atmosphere while allowing natural changes in composition, viewpoint, and visible surroundings.",
                "weak_reference": "Use the setting's colors and atmosphere as loose inspiration; the scenery, layout, and composition may change freely.",
                "attribute_transfer": "Transfer only the specified environmental visual attributes to the designated target; do not assume a target if none is selected.",
            },
            "オブジェクト": {
                "fully_preserved": "Preserve the object's recognizable shape, colors, materials, and distinctive design consistently; allow changes in position, orientation, and camera angle.",
                "partially_preserved": "Retain the object's recognizable shape and key design features while allowing controlled changes to minor details, placement, and orientation.",
                "weak_reference": "Use the object's design as loose inspiration; its shape, materials, details, and placement may vary.",
                "attribute_transfer": "Transfer only the specified object design attributes to the designated target; do not assume a target if none is selected.",
            },
        }
        guidance_by_policy = guidance_by_kind[kind]
        guidance = guidance_by_policy[policy]
        if policy == "attribute_transfer":
            target = retention_choices.get(f"target_{idx}", "")
            if target in [str(n) for n in range(1, 6) if n != idx and (kwargs.get(f"char{n}_enabled", n == 1) or (kwargs.get(f"subject_def_{n}", "") or "").strip())]:
                guidance = f"Transfer selected visual attributes from <Subject {idx}> to <Subject {target}>; preserve the target's other defining features."
            else:
                policy = default_policy
                guidance = guidance_by_policy[policy]
        source = ("Visual references: " + ", ".join(picture_tags) + ". " if picture_tags
                  else "Based on the written Subject definition (no direct picture reference selected). ")
        retention_lines.append(f"<Subject {idx}>: {policy} - {source}{guidance}")
        for audio_tag in audio_tags:
            audio_num = re.search(r"<Audio\s+(\d+)>", audio_tag, re.I)
            key = f"audio_{audio_num.group(1)}" if audio_num else ""
            audio_policy = retention_choices.get(key, "reference")
            if audio_policy not in audio_policies:
                audio_policy = "reference"
            audio_guidance = {
                "fully_copy": "Preserve the supplied audio recording as closely as possible.",
                "partially_copy": "Preserve selected aspects of the supplied audio while allowing changes.",
                "reference": "Use the supplied audio as a voice or sound-character reference; do not require verbatim copying.",
                "weak_reference": "Use the supplied audio only as loose inspiration for the sound character."
            }[audio_policy]
            retention_lines.append(f"Audio for <Subject {idx}> ({audio_tag}): {audio_policy} - {audio_guidance}")

    quality_text = str(kwargs.get("quality_control", "") or "").strip()
    if quality_text:
        global_constraint = quality_text
        if re.search(r"[\u3040-\u30ff\u3400-\u9fff]", quality_text):
            try:
                translated = call_llm(
                    "Translate the following Japanese video style constraints into concise English. "
                    "Keep every prohibition and requirement. Do not add new rules. "
                    "Keep <Subject N> and <Audio N> tags exactly as written. "
                    "Return only the translation.\n\n" + quality_text,
                    provider, api_key, model_name, 0.0
                )
                translated = str(translated or "").strip()
                if translated and not re.search(r"[\u3040-\u30ff\u3400-\u9fff]", translated):
                    global_constraint = translated
                else:
                    print("[H3 Prompt Director] Retention style translation incomplete; keeping original constraints")
            except Exception as exc:
                print(f"[H3 Prompt Director] Retention style translation failed; keeping original constraints: {exc}")
        retention_lines.append("Global style and prohibitions (user-defined): " + global_constraint)

    retention_body = "\n".join(retention_lines) if retention_lines else "N/A"
    retention_section = re.compile(
        r"(?ims)^(retention_analysis:)\s*.*?(?=^(?:detailed_description|overall_soundscape|non_diegetic_music):|\Z)"
    )
    if retention_section.search(prompt_result):
        prompt_result = retention_section.sub(
            lambda m: "retention_analysis:\n" + retention_body + "\n\n",
            prompt_result, count=1
        )
        print("[H3 Prompt Director] retention_analysis generated from Subject roles and selected direct references")
    else:
        print("[H3 Prompt Director] retention_analysis section not found; left output unchanged")

    def _format_output_shot_header(match):
        number = int(match.group(1))
        raw_range = match.group(2).strip()
        if number == 1:
            return "[Shot 1]"
        start = raw_range.split("-", 1)[0].strip()
        return f"[Shot {number}] At {start}," if start else f"[Shot {number}]"

    _detail_section = re.compile(
        r"(?ims)(^detailed_description:\s*\n)(.*?)(?=^(?:overall_soundscape|non_diegetic_music):|\Z)"
    )
    _shot_header = re.compile(r"(?m)^\[Shot\s+(\d+)\s*\|\s*([^]\n]+)\]")
    prompt_result = _detail_section.sub(
        lambda section: section.group(1) + _shot_header.sub(_format_output_shot_header, section.group(2)),
        prompt_result, count=1
    )

    shot_protected_lines = {}
    for shot_number, original in enumerate(shots, 1):
        shot_protected_lines[shot_number] = [
            line.strip() for line in original.splitlines()
            if line.strip().startswith("Speech:") or
            re.match(r"^S\d+:\s*<d>", line.strip())
        ]

        if saved_dialogues.get(shot_number):
            shot_protected_lines[shot_number] = list(saved_dialogues[shot_number])

    def _repair_shot_subjects(section):
        head, detail = section.group(1), section.group(2)
        header_pattern = re.compile(r"(?m)^\[Shot\s+(\d+)\](?:\s+At\s+[^\n]*)?")
        headers = list(header_pattern.finditer(detail))
        if not headers:
            return section.group(0)
        parts = []
        for pos, match in enumerate(headers):
            end = headers[pos + 1].start() if pos + 1 < len(headers) else len(detail)
            chunk = detail[match.start():end]
            shot_num = int(match.group(1))
            required = shot_subject_tags.get(shot_num, set())
            header = match.group(0)
            protected = shot_protected_lines.get(shot_num, [])

            def strip_control_lines(value):
                return "\n".join(line for line in value.splitlines()
                                 if not line.strip().startswith("Speech:")
                                 and not re.match(r"^S\d+:\s*", line.strip())
                                 and not re.search(r"<d>.*?</d>", line, re.I))

            def _remove_generated_silence_sentences(text):
                silence_sentence = re.compile(
                    r"(?i)(?<![\w])(?:no dialogue or speech(?:-related actions)?|"
                    r"no dialogue or speech-related actions|no spoken dialogue|"
                    r"no speech or dialogue|there is no dialogue|no dialogue is spoken)\s*[.!]?"
                )
                cleaned = silence_sentence.sub("", text)
                cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
                cleaned = re.sub(r"(?m)^[ \t]*[.!][ \t]*$", "", cleaned)
                return cleaned.strip()

            def rebuild(value):
                body = strip_control_lines(value[len(header):] if value.startswith(header) else value).strip()
                body = _remove_generated_silence_sentences(body)
                body = re.sub(r"(?m)^Referenced subjects in this shot:.*(?:\n|$)", "", body).strip()
                return header + "\n" + body + ("\n" if body else "") + ("\n".join(protected) + "\n" if protected else "")

            chunk = rebuild(chunk)
            present = set(re.findall(r"<Subject\s+([1-5])>", chunk, re.I))
            missing = sorted(required - present)
            if missing:
                prose = strip_control_lines(chunk[len(header):]).strip()
                request = (
                    "Revise ONLY this English camera/action narration. Restore each "
                    "missing literal <Subject N> tag INLINE at the noun phrase it "
                    "identifies (e.g. '<Subject 2>, a forest'). Keep events and "
                    "camera directions unchanged. Do not write a shot heading, "
                    "speech instructions, dialogue, or reference list. Output only "
                    "the revised action narration.\n"
                    f"Required subject tags: {', '.join('<Subject '+n+'>' for n in sorted(required))}\n"
                    f"Narration: {prose}"
                )
                try:
                    candidate = str(call_llm(request, provider, api_key, model_name, 0.0) or '').strip()
                    candidate = re.sub(r"H3SHOTSUBJECTTOKEN([1-5])END",
                                       lambda m: f"<Subject {m.group(1)}>", candidate, flags=re.I)
                    found = set(re.findall(r"<Subject\s+([1-5])>", candidate, re.I))
                    if required.issubset(found) and found.issubset(required) and not re.search(r"(?m)^\[Shot|^Referenced subjects", candidate):
                        chunk = rebuild(header + "\n" + candidate)
                except Exception as exc:
                    print(f"[H3 Prompt Director] shot {shot_num} tag repair failed: {exc}")

                still_missing = sorted(required - set(re.findall(r"<Subject\s+([1-5])>", chunk, re.I)))
                for number in still_missing:
                    kind = kwargs.get(f"subject_kind_{number}", "オブジェクト")
                    definition = kwargs.get(f"subject_def_{number}", "").lower()
                    if kind == "背景":
                        words = ["forest", "woods", "woodland", "landscape", "setting", "background", "city", "street", "room", "beach", "mountain", "sky", "garden"]
                    elif kind == "人物":
                        words = ["girl", "boy", "woman", "man", "person", "character", "child"]
                    else:
                        words = ["house", "building", "cabin", "home", "door", "car", "vehicle", "object", "tree", "sword", "book", "chair", "table"]
                    words = [word for _, word in sorted(enumerate(words), key=lambda item: (item[1] not in definition, item[0]))]
                    narration, sep, controls = chunk.partition("\nSpeech:")
                    if not sep:
                        speaker_match = re.search(r"(?m)^S\d+:\s*<d>", chunk)
                        if speaker_match:
                            narration, controls = chunk[:speaker_match.start()], chunk[speaker_match.start():]
                            sep = "\n"
                    replaced = False
                    for word in words:
                        pattern = re.compile(r"\b" + re.escape(word) + r"\b", re.I)
                        m = pattern.search(narration)
                        if m:
                            narration = narration[:m.start()] + f"<Subject {number}>, a " + narration[m.start():]
                            replaced = True
                            break
                    if not replaced:
                        narration = narration.rstrip() + f"\nReferenced subject: <Subject {number}>."
                    chunk = narration.rstrip() + (sep + controls if sep else "")
                    chunk = rebuild(chunk)
                print(f"[H3 Prompt Director] shot {shot_num}: checked source Subject tags and speech")
            parts.append(chunk.rstrip() + "\n\n")
        return head + detail[:headers[0].start()] + "".join(parts).rstrip() + "\n\n"

    prompt_result = _detail_section.sub(_repair_shot_subjects, prompt_result, count=1)

    prompt_result = re.sub(r"<\s*subject\s*:?\s*([1-5])\s*>",
                           lambda m: f"<Subject {m.group(1)}>", prompt_result, flags=re.IGNORECASE)
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
        duration = int(auto_data.get("duration", 5))
        
        clip_actual_duration = round(max(0, duration - 1.6), 1)
        total_duration = round(duration + (clip_actual_duration * clip_count), 1) if not no_clips else float(duration)
        
        char_list_str = []
        for i in range(1, 6):
            if data.get(f"char{i}_enabled", False):
                name = data.get(f"char{i}_name", "").strip()
                preset = data.get(f"char{i}_preset", "None")
                label = name if name else (preset if preset not in ["None", "Custom Text"] else f"Character {i}")
                char_list_str.append(f"S{i}: {label}")
        char_context = ", ".join(char_list_str)
        situation = "" 
        
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
        
        sys_prompt += f"[Scene Settings]\nCharacters: {char_context}\n"
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
        
        auto_text = await asyncio.to_thread(call_llm, sys_prompt, provider, api_key, model_name, 0.7)
        
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
        
        target_clip = str(data.get("target_clip", ""))
        base_locked = data.get("base_locked", False)
        
        prompt_result = None
        if (not target_clip or target_clip == "base") and not base_locked:
            prompt_result = await asyncio.to_thread(build_and_generate_prompt, data)
            if data.get("llm_provider") == "Ollama (Local)":
                await asyncio.to_thread(unload_ollama_vram, data.get("llm_model", "qwen2.5:7b-instruct-q5_K_M"))
        
        clip_prompts_out = {}
        clips_to_translate = {}
        clip_all_silent = {}
        
        for i in range(1, 11):
            if target_clip and target_clip != "base" and str(i) != target_clip:
                continue
                
            if data.get(f"c{i}_locked", False):
                continue
                
            if data.get(f"c{i}_enabled", False):
                clip_text_parts = []
                enabled_shot_count = 0
                silent_shot_count = 0
                
                for j in range(1, 5):
                    if data.get(f"c{i}_s{j}_enabled", False):
                        enabled_shot_count += 1
                        time_val = data.get(f"c{i}_s{j}_time", "").strip()
                        time_norm = normalize_time_expression(time_val)
                        action = data.get(f"c{i}_s{j}_action", "").strip()
                        dialogue = data.get(f"c{i}_s{j}_dialogue", "").strip()
                        speaker = data.get(f"c{i}_s{j}_speaker", "None")

                        shot_text = f"[Shot {j} | {time_norm}]\n{action}"
                        
                        if speaker in ("None", "セリフなし") or not dialogue.strip():
                            silent_shot_count += 1
                            shot_text += "\n" + silence_shot_text(action)
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
                
                clip_all_silent[i] = enabled_shot_count > 0 and silent_shot_count == enabled_shot_count
                txt = "\n\n".join(clip_text_parts)
                manual_prompt = data.get(f"c{i}_prompt", "").strip()
                if manual_prompt and not txt:
                    txt = manual_prompt

                if txt:
                    if enabled_shot_count > 0 and silent_shot_count == enabled_shot_count:
                        silent_clip_cmd = "Do not continue, extend, imitate, or infer any human voice or vocalization from the incoming audio context. All characters remain non-vocal throughout this continuation. No speech, dialogue, chatter, whispering, mumbling, babbling, laughter, giggling, humming, grunts, acknowledgements, or unintelligible vocal sounds. Preserve non-vocal ambience, sound effects, and music.\n\n"
                        txt = silent_clip_cmd + txt

                    if contains_japanese(txt):
                        clips_to_translate[i] = txt
                    else:
                        clip_prompts_out[i] = txt
                        
        if clips_to_translate:
            translated = await asyncio.to_thread(translate_clip_texts, clips_to_translate, data)
            for k, v in translated.items():
                clip_prompts_out[k] = v
            if data.get("llm_provider") == "Ollama (Local)":
                await asyncio.to_thread(unload_ollama_vram, data.get("llm_model", "qwen2.5:7b-instruct-q5_K_M"))
                
        final_clip_prompts = {}
        for i in range(1, 11):
            if target_clip and target_clip != "base" and str(i) != target_clip:
                continue
            if data.get(f"c{i}_locked", False):
                continue

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
                    if clip_all_silent.get(i, False):
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




from pathlib import Path as _IroPath
from uuid import uuid4 as _iro_uuid4
import shutil as _iro_shutil


_iro_module_dir = _IroPath(__file__).resolve().parent
_iro_hkmc_root = next((p for p in (_iro_module_dir, *_iro_module_dir.parents)
                       if "hkmc" in p.name.lower() and "node" in p.name.lower()), _iro_module_dir)
_IRO_WORKFLOW = _iro_hkmc_root / "workflow" / "irodori_tts.json"
_IRO_AUDIO_SUFFIXES = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"}


def _iro_workflow_nodes():
    with _IRO_WORKFLOW.open("r", encoding="utf-8") as fh:
        document = json.load(fh)
    nodes = {n["type"]: n for n in document["nodes"]}
    expected = ["kjranyone.IrodoriTTS.ModelLoader", "kjranyone.IrodoriTTS.ReferenceAudio",
                "kjranyone.IrodoriTTS.Sampler", "kjranyone.IrodoriTTS.VoiceDesignConfig", "SaveAudioWav"]
    absent = [name for name in expected if name not in nodes]
    if absent:
        raise ValueError("Irodori workflow nodes missing: " + ", ".join(absent))
    return nodes


def _iro_input_audio_files():
    root = _IroPath(folder_paths.get_input_directory())
    names = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in _IRO_AUDIO_SUFFIXES:
            names.append(path.relative_to(root).as_posix())
    return sorted(names)


def _iro_inputs(node):
    
    return dict(node.get("widgets_values_named") or {})


def _iro_safe_input_audio(name):
    root = _IroPath(folder_paths.get_input_directory()).resolve()
    file_path = (root / str(name)).resolve()
    if not file_path.is_relative_to(root) or not file_path.is_file() or file_path.suffix.lower() not in _IRO_AUDIO_SUFFIXES:
        raise ValueError("Irodori reference audio not found in ComfyUI/input: " + str(name))
    return file_path


@PromptServer.instance.routes.get("/h3/irodori/options")
async def h3_irodori_options(request):
    try:
        nodes = _iro_workflow_nodes()
        return web.json_response({
            "success": True,
            "models": folder_paths.get_filename_list("checkpoints"),
            "audio_files": _iro_input_audio_files(),
            "defaults": {
                "loader": _iro_inputs(nodes["kjranyone.IrodoriTTS.ModelLoader"]),
                "reference": _iro_inputs(nodes["kjranyone.IrodoriTTS.ReferenceAudio"]),
                "sampler": _iro_inputs(nodes["kjranyone.IrodoriTTS.Sampler"]),
                "voice_design": _iro_inputs(nodes["kjranyone.IrodoriTTS.VoiceDesignConfig"]),
            },
        })
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)}, status=400)


@PromptServer.instance.routes.post("/h3/irodori/prepare")
async def h3_irodori_prepare(request):
    """Turn the *stored* four-node UI workflow into a disposable ComfyUI API prompt.

    Only ModelLoader / ReferenceAudio / Sampler settings are user-adjustable.
    SaveAudioWav is an internal output sink; no separate workflow is opened.
    """
    try:
        data = await request.json()
        text = str(data.get("text", "")).strip()
        if not text or len(text) > 3000:
            raise ValueError("読み上げるセリフは1〜3000文字で指定してください。")
        nodes = _iro_workflow_nodes()
        loader = _iro_inputs(nodes["kjranyone.IrodoriTTS.ModelLoader"])
        reference = _iro_inputs(nodes["kjranyone.IrodoriTTS.ReferenceAudio"])
        sampler = _iro_inputs(nodes["kjranyone.IrodoriTTS.Sampler"])
        voice_design = _iro_inputs(nodes["kjranyone.IrodoriTTS.VoiceDesignConfig"])
        voice_design["caption"] = str(data.get("voice_design_caption", voice_design.get("caption", "")) or "").strip()
        if len(voice_design["caption"]) > 4000:
            raise ValueError("VoiceDesignの説明は4000文字以内にしてください。")
        voice_design["max_caption_len"] = int(voice_design.get("max_caption_len", 0) or 0)
        if not 0 <= voice_design["max_caption_len"] <= 4096:
            raise ValueError("VoiceDesignのmax_caption_lenが不正です。")

        model = str(data.get("model") or loader.get("model", ""))
        if model not in folder_paths.get_filename_list("checkpoints"):
            raise ValueError("モデルがcheckpointsフォルダにありません: " + model)
        loader["model"] = model
        for setting, allowed in {
            "model_device": ("cuda", "cpu"), "codec_device": ("cuda", "cpu"),
            "model_precision": ("fp32", "fp16", "bf16"),
            "codec_precision": ("fp32", "fp16", "bf16"),
            "runtime_cache_policy": ("offload_after_use", "keep_gpu", "unload_after_use"),
        }.items():
            if setting in data:
                value = str(data[setting])
                if value not in allowed:
                    raise ValueError(setting + " value is invalid")
                loader[setting] = value
        

        ref_file = str(data.get("reference_audio", reference.get("audio", "")) or "").strip()
        if ref_file:
            _iro_safe_input_audio(ref_file)
        reference["audio"] = ref_file
        reference["ref_latent"] = "None"
        reference["ref_normalize_db"] = max(-60.0, min(0.0, float(data.get("ref_normalize_db", reference.get("ref_normalize_db", -16.0)))))
        reference["max_ref_seconds"] = max(0.0, min(120.0, float(data.get("max_ref_seconds", reference.get("max_ref_seconds", 0.0)))))

        sampler["text"] = text
        sampler["seed"] = int(data.get("seed", sampler.get("seed", 0)))
        sampler["seconds"] = float(data.get("seconds", sampler.get("seconds", 0)))
        sampler["num_steps"] = int(data.get("num_steps", sampler.get("num_steps", 40)))
        sampler["batch_size"] = 1  
        if not (0 <= sampler["seed"] <= 2**63-1 and 0 <= sampler["seconds"] <= 120 and 1 <= sampler["num_steps"] <= 120):
            raise ValueError("Seed、秒数、Stepsの値を確認してください。")
        if "trim_tail" in data:
            sampler["trim_tail"] = bool(data["trim_tail"])

        
        
        loader_keys = ("model", "model_device", "model_precision", "codec_device", "codec_precision",
                       "enable_watermark", "enable_silentcipher", "compile_model", "compile_dynamic",
                       "runtime_cache_policy")
        ref_keys = ("audio", "ref_latent", "ref_normalize_db", "max_ref_seconds")
        sampler_keys = ("text", "seed", "seconds", "num_steps", "batch_size", "decode_mode",
                        "context_kv_cache", "max_text_len", "trim_tail")
        if not ref_file:
            ref_inputs = None
        else:
            ref_inputs = {key: reference[key] for key in ref_keys}
        sampler_inputs = {key: sampler[key] for key in sampler_keys}
        sampler_inputs["model_config"] = ["1", 0]
        sampler_inputs["voice_design_config"] = ["5", 0]
        if ref_inputs is not None:
            sampler_inputs["ref_config"] = ["3", 0]
        prefix = "h3_irodori/" + _iro_uuid4().hex
        prompt = {
            "1": {"class_type": "kjranyone.IrodoriTTS.ModelLoader", "inputs": {k: loader[k] for k in loader_keys}},
            "2": {"class_type": "kjranyone.IrodoriTTS.Sampler", "inputs": sampler_inputs},
            "4": {"class_type": "SaveAudioWav", "inputs": {"audio": ["2", 0], "filename_prefix": prefix}},
            "5": {"class_type": "kjranyone.IrodoriTTS.VoiceDesignConfig", "inputs": {"caption": voice_design["caption"], "max_caption_len": voice_design["max_caption_len"]}},
        }
        if ref_inputs is not None:
            prompt["3"] = {"class_type": "kjranyone.IrodoriTTS.ReferenceAudio", "inputs": ref_inputs}
        return web.json_response({"success": True, "prompt": prompt, "output_node": "4"})
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)}, status=400)


@PromptServer.instance.routes.post("/h3/irodori/attach")
async def h3_irodori_attach(request):
    """Make completed output WAV available to the existing HKMC AUDIO slots."""
    try:
        data = await request.json()
        basename = str(data.get("filename", ""))
        subfolder = str(data.get("subfolder", ""))
        file_type = str(data.get("type", "output"))
        if file_type != "output" or subfolder.replace("\\", "/").strip("/") != "h3_irodori":
            raise ValueError("Unexpected Irodori output directory")
        if not basename or basename != _IroPath(basename).name or not basename.lower().endswith(".wav"):
            raise ValueError("Unexpected Irodori output WAV filename")
        source_root = _IroPath(folder_paths.get_output_directory()).resolve()
        source = (source_root / "h3_irodori" / basename).resolve()
        if not source.is_relative_to(source_root) or not source.is_file():
            raise FileNotFoundError("Irodori output WAV not found")
        input_root = _IroPath(folder_paths.get_input_directory()).resolve()
        
        
        raw_name = str(data.get("name", "")).strip()
        if raw_name.lower().endswith(".wav"):
            raw_name = raw_name[:-4]
        safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", raw_name).strip(" .")
        if not safe_name or len(safe_name) > 80:
            raise ValueError("保存名は1〜80文字で入力してください。")
        if re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", safe_name, re.IGNORECASE):
            raise ValueError("Windowsの予約名は使えません。")
        dest_dir = input_root / "h3_irodori"
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        for number in range(1, 10000):
            suffix = "" if number == 1 else f"_{number}"
            dest = dest_dir / f"{safe_name}{suffix}.wav"
            try:
                with dest.open("xb") as output_f:
                    try:
                        with source.open("rb") as input_f:
                            _iro_shutil.copyfileobj(input_f, output_f)
                    except Exception:
                        output_f.close()
                        dest.unlink(missing_ok=True)
                        raise
                break
            except FileExistsError:
                continue
        else:
            raise ValueError("同名ファイルが多すぎます。別の名前を指定してください。")
        return web.json_response({"success": True, "input_name": "h3_irodori/" + dest.name})
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)}, status=400)



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
        refmod_list = get_refmod_files()
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
                "overall_story": ("STRING", {"multiline": True, "default": ""}),
                "subject_kind_1": (["人物", "背景", "オブジェクト"], {"default": "オブジェクト"}),
                "subject_kind_2": (["人物", "背景", "オブジェクト"], {"default": "オブジェクト"}),
                "subject_kind_3": (["人物", "背景", "オブジェクト"], {"default": "オブジェクト"}),
                "subject_kind_4": (["人物", "背景", "オブジェクト"], {"default": "オブジェクト"}),
                "subject_kind_5": (["人物", "背景", "オブジェクト"], {"default": "オブジェクト"}),

                "subject_def_1": ("STRING", {"multiline": True, "default": ""}),
                "subject_def_2": ("STRING", {"multiline": True, "default": ""}),
                "subject_def_3": ("STRING", {"multiline": True, "default": ""}),
                "subject_def_4": ("STRING", {"multiline": True, "default": ""}),
                "subject_def_5": ("STRING", {"multiline": True, "default": ""}),
                "subject_pics_1": ("STRING", {"default": ""}),
                "subject_audio_1": ("STRING", {"default": ""}),
                "subject_pics_2": ("STRING", {"default": ""}),
                "subject_audio_2": ("STRING", {"default": ""}),
                "subject_pics_3": ("STRING", {"default": ""}),
                "subject_audio_3": ("STRING", {"default": ""}),
                "subject_pics_4": ("STRING", {"default": ""}),
                "subject_audio_4": ("STRING", {"default": ""}),
                "subject_pics_5": ("STRING", {"default": ""}),
                "subject_audio_5": ("STRING", {"default": ""}),

                "quality_control": ("STRING", {"multiline": True, "default": ""}),
                "retention_choices_json": ("STRING", {"default": "{}"}),
                "ambient_sound": ("STRING", {"multiline": True, "default": ""}),
                "bgm": ("STRING", {"multiline": True, "default": ""}),
                "timeline_data": ("STRING", {"default": '{"items":[]}'}),
                "auto_data": ("STRING", {"default": '{"enabled":false, "overwrite":false, "noClips":false, "chars":["S1"], "duration":5, "clipCount":1, "story":""}'}),
                "clips_data_json": ("STRING", {"default": "{}"}),
                
                "char1_enabled": ("BOOLEAN", {"default": True}),
                "char1_preset": (char_list, {"default": "None"}),
                "char1_name": ("STRING", {"default": ""}),
                "char1_refmod": (refmod_list, {"default": "None"}),
                "char1_pics": ("STRING", {"default": ""}),
                "char1_audio": (audio_list, {"default": "None"}),
                "char1_extra": ("STRING", {"multiline": True, "default": ""}),
                "char2_enabled": ("BOOLEAN", {"default": False}),
                "char2_preset": (char_list, {"default": "None"}),
                "char2_name": ("STRING", {"default": ""}),
                "char2_refmod": (refmod_list, {"default": "None"}),
                "char2_pics": ("STRING", {"default": ""}),
                "char2_audio": (audio_list, {"default": "None"}),
                "char2_extra": ("STRING", {"multiline": True, "default": ""}),
                "char3_enabled": ("BOOLEAN", {"default": False}),
                "char3_preset": (char_list, {"default": "None"}),
                "char3_name": ("STRING", {"default": ""}),
                "char3_refmod": (refmod_list, {"default": "None"}),
                "char3_pics": ("STRING", {"default": ""}),
                "char3_audio": (audio_list, {"default": "None"}),
                "char3_extra": ("STRING", {"multiline": True, "default": ""}),
                "char4_enabled": ("BOOLEAN", {"default": False}),
                "char4_preset": (char_list, {"default": "None"}),
                "char4_name": ("STRING", {"default": ""}),
                "char4_refmod": (refmod_list, {"default": "None"}),
                "char4_pics": ("STRING", {"default": ""}),
                "char4_audio": (audio_list, {"default": "None"}),
                "char4_extra": ("STRING", {"multiline": True, "default": ""}),
                "char5_enabled": ("BOOLEAN", {"default": False}),
                "char5_preset": (char_list, {"default": "None"}),
                "char5_name": ("STRING", {"default": ""}),
                "char5_refmod": (refmod_list, {"default": "None"}),
                "char5_pics": ("STRING", {"default": ""}),
                "char5_audio": (audio_list, {"default": "None"}),
                "char5_extra": ("STRING", {"multiline": True, "default": ""}),
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
        
    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    RETURN_TYPES = ("STRING", "STRING", "H3_MEDIA_BUNDLE", "H3_CLIP_CONTROL")
    RETURN_NAMES = ("prompt", "clip_prompt", "media_bundle", "clip_control")
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
                    enabled_shot_count = 0
                    silent_shot_count = 0
                    
                    for j in range(1, 5):
                        if kwargs.get(f"c{i}_s{j}_enabled", False):
                            enabled_shot_count += 1
                            time_val = kwargs.get(f"c{i}_s{j}_time", "").strip()
                            time_norm = normalize_time_expression(time_val)
                            action = kwargs.get(f"c{i}_s{j}_action", "").strip()
                            dialogue = kwargs.get(f"c{i}_s{j}_dialogue", "").strip()
                            speaker = kwargs.get(f"c{i}_s{j}_speaker", "None")

                            shot_text = f"[Shot {j} | {time_norm}]\n{action}"
                            
                            if speaker in ("None", "セリフなし") or not dialogue.strip():
                                silent_shot_count += 1
                                shot_text += "\n" + silence_shot_text(action)
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
                        if enabled_shot_count > 0 and silent_shot_count == enabled_shot_count:
                            silent_clip_cmd = "Do not continue, extend, imitate, or infer any human voice or vocalization from the incoming audio context. All characters remain non-vocal throughout this continuation. No speech, dialogue, chatter, whispering, mumbling, babbling, laughter, giggling, humming, grunts, acknowledgements, or unintelligible vocal sounds. Preserve non-vocal ambience, sound effects, and music.\n\n"
                            txt = silent_clip_cmd + txt

                        if kwargs.get(f"c{i}_continue", True):
                            txt = "Continue the existing scene from the previous generated H3 clip with no cut, reset, or re-establishment. The incoming protected H3 audiovisual latent prefix is authoritative for current pose, motion, camera trajectory, facial state, lighting, environment, object state, voice, ambience, and timing. Connected reference images are optional; use them only to preserve stable subject identity and appearance beneath that incoming state.\n\n" + txt
                        if kwargs.get(f"c{i}_link_next", False):
                            if enabled_shot_count > 0 and silent_shot_count == enabled_shot_count:
                                txt += "\n\nContinue the exact motion and existing non-vocal environmental sound already in progress, then develop the next action naturally. Preserve the silence: do not add or continue any human voice or speech-like vocalization. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                            else:
                                txt += "\n\nContinue the exact motion and sound already in progress, then develop the next action naturally. [DESCRIBE WHAT HAPPENS NEXT; DO NOT RESTART FROM REST.]"
                        parsed[str(i)] = txt
            clip_prompt_json = json.dumps(parsed, ensure_ascii=False)

        images, keyframes, videos, audios = {}, {}, {}, {}
        drive_audio = None
        final_audio = None

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
                elif mtype in ["drive_audio", "lip_sync", "drive"]:
                    a = load_audio_dict(val)
                    if a is not None:
                        drive_audio = a
                elif mtype in ["final_audio", "bgm", "music", "song"]:
                    a = load_audio_dict(val)
                    if a is not None:
                        final_audio = a

            bgm_val = kwargs.get("bgm", "").strip()
            if final_audio is None and bgm_val:
                final_audio = load_audio_dict(bgm_val)

        except Exception as e:
            print(f"Error parsing timeline_data in H3PromptDirectorGUI: {e}")

        media_bundle = {
            "images": images,
            "keyframes": keyframes,
            "videos": videos,
            "audios": audios,
            "drive_audio": drive_audio,
            "final_audio": final_audio,
        }
        
        clips_data_json = kwargs.get("clips_data_json", "{}")
        try:
            clips_data = json.loads(clips_data_json)
        except:
            clips_data = {}

        clip_control = {
            "cache_settings": clips_data.get("cache_settings", {}),
            "prompts": parsed,
        }

        return (prompt_result, clip_prompt_json, media_bundle, clip_control)


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
        
        drive_audio = media_bundle.get("drive_audio")
        final_audio = media_bundle.get("final_audio")

        if drive_audio is None:
            drive_audio = audios.get(3)
        if final_audio is None:
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