import os
import re
import json
import base64
import asyncio
import mimetypes
import requests
import numpy as np
import scipy.io.wavfile as wavfile
import folder_paths
from server import PromptServer
from aiohttp import web

def load_rules_mv():
    rule_path = os.path.join(os.path.dirname(__file__), "rules_mv.txt")
    if os.path.exists(rule_path):
        with open(rule_path, "r", encoding="utf-8") as f:
            return f.read()
    fallback_path = os.path.join(os.path.dirname(__file__), "rules.txt")
    if os.path.exists(fallback_path):
        with open(fallback_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def unload_ollama_vram(model_name):
    if not model_name: return
    try:
        requests.post("http://localhost:11434/api/generate", json={"model": model_name, "keep_alive": 0}, timeout=5)
    except Exception:
        pass

def call_llm(sys_inst, provider, api_key, model_name, temp=0.7, audio_path=None):
    if provider == "Gemini (Cloud)":
        raw_key = api_key if (api_key and api_key.strip()) else (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "")
        active_key = raw_key.strip().strip('"').strip("'").strip()

        if active_key:
            masked = active_key[:4] + "..." + active_key[-4:] if len(active_key) > 8 else "***"
            source = "UI直接入力" if (api_key and api_key.strip()) else "環境変数"
            print(f"[H3 Prompt Director MV] Gemini APIキー使用中 ({source}): {masked} (文字数: {len(active_key)})")
        else:
            raise ValueError("Gemini API Key is missing. Please set it in the UI or as an environment variable (GEMINI_API_KEY or GOOGLE_API_KEY).")

        target_model = model_name.strip() if model_name and model_name.strip() else "gemini-3.8-flash"
        
        parts = [{"text": sys_inst}]
        raw_audio_bytes = None
        audio_mime = "audio/wav"
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
                print(f"[H3 Prompt Director MV] 音声読み込みエラー: {e}")

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": temp}
        }
        url_base = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent"

        headers_bearer = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {active_key}"
        }
        res1 = requests.post(url_base, headers=headers_bearer, json=payload, timeout=180)
        if res1.status_code == 200:
            try:
                return res1.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception:
                pass

        headers_apikey = {
            "Content-Type": "application/json",
            "x-goog-api-key": active_key
        }
        res2 = requests.post(url_base, headers=headers_apikey, json=payload, timeout=180)
        if res2.status_code == 200:
            try:
                return res2.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception:
                pass

        try:
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=active_key, transport="rest")
            g_model = legacy_genai.GenerativeModel(model_name=target_model, generation_config={"temperature": temp})
            contents_sdk = [sys_inst]
            if raw_audio_bytes:
                contents_sdk.append({"mime_type": audio_mime, "data": raw_audio_bytes})
            sdk_res = g_model.generate_content(contents_sdk)
            if getattr(sdk_res, "text", None):
                return sdk_res.text.strip()
        except Exception:
            pass

        err_detail = res1.text if res1.text else res2.text
        raise RuntimeError(f"Gemini API 認証エラー: {err_detail}")

    elif provider == "ChatGPT (OpenAI)":
        from openai import OpenAI
        active_key = (api_key.strip() if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY", "")).strip()
        if not active_key: raise ValueError("OpenAI API Key is missing.")
        client = OpenAI(api_key=active_key)
        res = client.chat.completions.create(
            model=model_name.strip() if model_name and model_name.strip() else "gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert music video director, cinematic DP, and storyboard artist."},
                {"role": "user", "content": sys_inst},
            ],
            temperature=temp,
        )
        return (res.choices[0].message.content or "").strip()
        
    elif provider == "Ollama (Local)":
        target_model = model_name.strip() if model_name and model_name.strip() else "qwen2.5:7b-instruct-q5_K_M"
        payload = {
            "model": target_model,
            "prompt": sys_inst,
            "stream": False,
            "options": {"temperature": temp},
        }
        res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=300)
        res.raise_for_status()
        return res.json().get("response", "").strip()
    return ""

def analyze_audio_wave(audio_path, clip_duration=5.0, max_clips=14):
    if not audio_path or not os.path.exists(audio_path):
        return "音声ファイルが未設定のため、曲の導入から展開、クライマックスへの自然な流れを想定して絵コンテを作成してください。"
    try:
        sr, data = wavfile.read(audio_path)
        if data.ndim > 1: data = data.mean(axis=1)
        data = data.astype(np.float32)
        max_val = np.max(np.abs(data)) or 1.0
        data /= max_val
        
        samples_per_clip = int(sr * clip_duration)
        diag_lines = []
        for i in range(max_clips):
            start = i * samples_per_clip
            end = start + samples_per_clip
            if start >= len(data): break
            chunk = data[start:end]
            rms = np.sqrt(np.mean(chunk**2))
            
            if rms < 0.05: energy = "静寂・ブレイク・余白"
            elif rms < 0.15: energy = "繊細な演奏・導入・抑えたパート"
            elif rms < 0.35: energy = "リズム展開・ビルドアップ・進行"
            else: energy = "最大の盛り上がり・高音圧・クライマックス"
                
            diag_lines.append(f"- Clip {i+1} (約{int(i*clip_duration)}s〜{int((i+1)*clip_duration)}s): 音響エネルギー = {energy}")
        return "\n".join(diag_lines)
    except Exception as e:
        return f"波形解析エラー: {e}"

def build_character_context(data):
    subjects = []
    char_dir = os.path.join(os.path.dirname(__file__), "characters")
    for i in range(1, 4):
        if not data.get(f"char{i}_enabled", (i == 1)): continue
        name = data.get(f"char{i}_name", "").strip()
        preset = data.get(f"char{i}_preset", "None")
        extra = data.get(f"char{i}_extra", "").strip()
        pics_raw = data.get(f"char{i}_pics", "")
        audio_ref = data.get(f"char{i}_audio", "None")
        
        label = name if name else (preset if preset not in ["None", "Custom Text"] else f"Character {i}")
        
        desc = ""
        if preset and preset not in ["None", "Custom Text"]:
            p_path = os.path.join(char_dir, f"{preset}.txt")
            if os.path.exists(p_path):
                with open(p_path, "r", encoding="utf-8") as f: desc = f.read().strip()
        if extra:
            desc = (desc + "\n" + extra).strip() if desc else extra
            
        pic_tags = [p.strip() for p in pics_raw.split(",") if p.strip()]
        pics_str = " and ".join(pic_tags) if pic_tags else ""

        subject_lines = [f"[Subject {i}: {label}]"]
        if desc: subject_lines.append(desc)
            
        ref_parts = []
        if pics_str: ref_parts.append(f"Reference sheets for {label} include {pics_str}.")
        if audio_ref and audio_ref != "None": ref_parts.append(f"Vocal reference for {label} is {audio_ref}.")
        if ref_parts: subject_lines.append(" ".join(ref_parts))

        subjects.append((i, label, "\n".join(subject_lines)))
    return subjects

def load_image_raw_tensor(filename):
    import torch
    from PIL import Image, ImageOps
    path = os.path.join(folder_paths.get_input_directory(), filename)
    if not os.path.exists(path): return None
    with Image.open(path) as source:
        img = ImageOps.exif_transpose(source).convert("RGB")
        array = np.asarray(img, dtype=np.float32) / 255.0
    return torch.from_numpy(array.copy())[None, ...]

def load_video_tensor(filename):
    import cv2
    import torch
    path = os.path.join(folder_paths.get_input_directory(), filename)
    if not os.path.exists(path): return None
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        cap.release()
        return None
    try:
        ok, frame = cap.read()
        if not ok or frame is None: return None
        height, width = frame.shape[:2]
        reported_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        initial_capacity = reported_count if 1 <= reported_count <= 12000 else 128
        buffer = np.empty((initial_capacity, height, width, 3), dtype=np.float32)
        count = 0
        while ok and frame is not None:
            if count >= buffer.shape[0]:
                grown = np.empty((max(count + 1, buffer.shape[0] * 2), height, width, 3), dtype=np.float32)
                grown[:count] = buffer[:count]
                buffer = grown
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            np.multiply(rgb, (1.0 / 255.0), out=buffer[count], casting="unsafe")
            count += 1
            ok, frame = cap.read()
        if count == 0: return None
        if count < buffer.shape[0]: buffer = buffer[:count].copy()
        return torch.from_numpy(buffer[:count])
    finally:
        cap.release()

def load_audio_dict(filename):
    import torch
    path = os.path.join(folder_paths.get_input_directory(), filename)
    if not os.path.exists(path): return None
    try:
        sr, data = wavfile.read(path)
        if data.dtype == np.int16: data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32: data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8: data = (data.astype(np.float32) - 128.0) / 128.0
        else: data = data.astype(np.float32, copy=False)
        tensor = torch.from_numpy(np.ascontiguousarray(data))
        if tensor.ndim == 1: tensor = tensor.unsqueeze(0)
        elif tensor.ndim == 2: tensor = tensor.t()
        return {"waveform": tensor.unsqueeze(0), "sample_rate": int(sr)}
    except Exception as exc:
        print(f"[H3 Prompt Director MV] Failed to load audio '{filename}': {exc}")
        return None

@PromptServer.instance.routes.post("/h3/generate_storyboard_mv")
async def handle_generate_storyboard_mv(request):
    try:
        data = await request.json()
        global_summary = data.get("global_summary", "").strip()
        global_retention = data.get("global_retention", "").strip()
        analysis_mode = data.get("audio_analysis_mode", "auto")
        
        clip_duration_sec = float(data.get("clip_duration_sec", 10.0))
        
        provider = data.get("llm_provider", "Ollama (Local)")
        api_key = data.get("llm_api_key", "").strip()
        model_name = data.get("llm_model", "").strip()

        audio_filename = None
        try:
            t_data = json.loads(data.get("timeline_data", '{"items":[]}'))
            for item in t_data.get("items", []):
                if item.get("laneType") == "audio" and item.get("slot") == 4:
                    audio_filename = item.get("value")
                    break
        except Exception:
            pass

        audio_full_path = os.path.join(folder_paths.get_input_directory(), audio_filename) if audio_filename else None

        use_gemini_audio = False
        if provider == "Gemini (Cloud)" and (analysis_mode in ["auto", "gemini_audio"]) and audio_full_path and os.path.exists(audio_full_path):
            use_gemini_audio = True

        audio_instruction_section = ""
        if use_gemini_audio:
            audio_instruction_section = f"""【音源ファイルの直接解析指示】
添付されたオーディオファイルを直接聴いて解析してください。
- 1クリップの長さは【約 {clip_duration_sec} 秒】です。
- 各クリップの時間帯における「ボーカルの有無」「演奏の盛り上がり（ビートの激しさ・静寂・転調）」を耳で正確に捉えてください。
- 音の静と動、緩急に合わせて、映像のスケール感や被写体の感情・カメラワークを連動させてください。"""
        else:
            audio_diagnostic_text = analyze_audio_wave(audio_full_path, clip_duration=clip_duration_sec)
            audio_instruction_section = f"""【楽曲の展開・エネルギー診断 (1クリップ = {clip_duration_sec}秒枠)】
{audio_diagnostic_text}"""

        system_instruction = f"""あなたは映画やハイエンドMVを手掛けるプロの映像監督・シネマトグラファーです。
提示された【MV全体世界観】のシチュエーションを最大限に活かし、楽曲の展開に完全に同期した Clip 1〜14 の絵コンテを作成してください。

[最重要前提]
- 1クリップあたりの生成尺は【 {clip_duration_sec} 秒 】です。

[ショット設計とワンカット原則]
- 1つのClipにつき、出力するShotは【Shot 1】の1つだけにしてください。1つのClip内で複数のShot（カット割り）を行うと映像破綻が起きるため、絶対に「Shot 2」以降は出力しないでください。
- Clipごとにカメラアングル、被写体との距離（寄り・引き）、画角をガラリと変え、全体を通して連続的で見応えのあるMVを構成してください。

[ループ・単調化の徹底防止ルール（最重要）]
- 同じ場所で同じポーズを保つ、ただ立ち尽くす、同じような歩行を続けるなどの「反復・ループ表現」を固く禁じます。
- クリップが進むにつれて「物語の進行」「被写体の感情の深化」「場所やライティングの推移」を必ず描き、シーンが停滞しないようにしてください。
- 直前のClipと同じカメラアングル（例: Low angleの連続など）を2回続けて使用してはいけません。

[構図・カメラワークの選択肢（楽曲と世界観に合わせて自由に選択）]
楽曲のテンポや感情の起伏に応じて、最も効果的な映画的カメラワークを選択してください。
- 被写体のスケールと空間性を見せるワイドショット（Extreme wide / Wide shot）
- 表情の機微や眼差しの緊張感を捉えるクローズアップ（Close-up / Extreme close-up）
- 迫力や心理的優位・緊張を表現するローアングル / ハイアングル
- 空間を立体的に見せるカメラ移動（Orbit tracking, Dolly in/out, Tracking shot）
- 心理的距離やドラマ性を強調するダッチアングル、過背ショット（Over-the-shoulder）、主観視点（POV）

[禁止事項]
- 「構図:」「動き:」などの独自項目を作らず、必ず「Shot 1:」の中にまとめて記述してください。
- 「音響エネルギー」「Aメロ」「サビ」などの用語を演出文に出力しないでください。
- 「リップシンク」「歌う」という単語は出力しないでください（口パクはユーザーが設定します）。

【MV全体世界観】
{global_summary}

【スタイル・クオリティ指示】
{global_retention}

{audio_instruction_section}

【出力フォーマット】
以下のフォーマットに従い、プレーンテキストの「日本語」で出力してください。Clip 1から14まで、楽曲の展開に合わせて全て出力してください。

[Clip 1]
演出: （楽曲の開始や導入に合わせた空気感、光、情景）
保持: （衣装、装飾、固有の特徴など維持すべき要素）
環境音: （シチュエーションに応じた環境音・衣擦れなど。不要な場合は「静寂」）
Shot 1: （[カメラ構図名]: 音楽の勢いに応じた具体的な被写体のアクションとカメラの動き）

[Clip 2]
演出: （楽曲の進行に合わせた展開や情景の変化）
保持: （表情、目線、動きの勢い）
環境音: （環境音または静寂）
Shot 1: （[カメラ構図名]: Clip 1とは異なる角度・距離からのカメラワークとアクション）

...（同様のフォーマットで Clip 14 まで作成）
"""
        result = await asyncio.to_thread(call_llm, system_instruction, provider, api_key, model_name, temp=0.7, audio_path=audio_full_path if use_gemini_audio else None)
        if provider == "Ollama (Local)":
            await asyncio.to_thread(unload_ollama_vram, model_name or "qwen2.5:7b-instruct-q5_K_M")

        return web.json_response({"success": True, "storyboard": result})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

@PromptServer.instance.routes.post("/h3/generate_prompt_mv")
async def handle_generate_prompt_mv(request):
    try:
        data = await request.json()
        
        target_clip = data.get("target_clip", None)
        if target_clip:
            target_clip = str(target_clip)

        compact_clip_state = data.get("clips_data_json", "{}")
        try:
            decoded_clip_state = json.loads(compact_clip_state) if isinstance(compact_clip_state, str) else compact_clip_state
            if isinstance(decoded_clip_state, dict):
                clip_values = decoded_clip_state.get("values", decoded_clip_state)
                if isinstance(clip_values, dict):
                    for field_name, field_value in clip_values.items():
                        if field_name not in data:
                            data[field_name] = field_value
        except Exception:
            pass

        char_replacements = {}
        for k in range(1, 4):
            if data.get(f"char{k}_enabled", (k == 1)):
                name = data.get(f"char{k}_name", "").strip()
                preset = data.get(f"char{k}_preset", "None")
                label = name if name else (preset if preset not in ["None", "Custom Text"] else "")
                if label:
                    char_replacements[label] = f"<Subject {k}>"

        def apply_char_replacements(text):
            if not text: return text
            for label, tag in char_replacements.items():
                pattern = re.compile(re.escape(label), re.IGNORECASE)
                text = pattern.sub(tag, text)
            text = re.sub(r"\[Shot\s*\d+\s*\|\s*[^\]]+\]", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\|\s*\d+:\d+(?:\.\d+)?", "", text)
            return text.strip()

        characters = build_character_context(data)
        subj_defs_lines = [c[2] for c in characters]
        subject_definitions_text = "\n\n".join(subj_defs_lines) if subj_defs_lines else "[Subject 1: Performer]\nReference sheets for Performer include <Picture 1>."
        
        raw_rules = load_rules_mv()
        sys_context = raw_rules.format(
            char_description=subject_definitions_text,
            situation="",
            quality_control="",
            bgm=""
        )

        texts_to_translate = {}
        clips_actions_to_translate = {}

        global_summary_raw = apply_char_replacements(data.get("global_summary", "").strip())
        if global_summary_raw: texts_to_translate["g_sum"] = global_summary_raw

        global_retention_raw = apply_char_replacements(data.get("global_retention", "").strip())
        if global_retention_raw: texts_to_translate["g_ret"] = global_retention_raw

        for i in range(1, 15):
            if target_clip and str(i) != target_clip:
                continue

            if data.get(f"c{i}_enabled", False):
                sum_raw = apply_char_replacements(data.get(f"c{i}_summary", "").strip())
                ret_raw = apply_char_replacements(data.get(f"c{i}_retention", "").strip())
                amb_raw = apply_char_replacements(data.get(f"c{i}_ambient_sound", "").strip())
                
                if sum_raw: texts_to_translate[f"c_sum_{i}"] = sum_raw
                if ret_raw: texts_to_translate[f"c_ret_{i}"] = ret_raw
                if amb_raw: texts_to_translate[f"c_amb_{i}"] = amb_raw

                shot_parts = []
                for j in range(1, 5):
                    if data.get(f"c{i}_s{j}_enabled", False):
                        action = apply_char_replacements(data.get(f"c{i}_s{j}_action", "").strip())
                        if action:
                            shot_parts.append(f"<s{j}>\n{action}\n</s{j}>")
                if shot_parts:
                    clips_actions_to_translate[i] = "\n".join(shot_parts)

        provider = data.get("llm_provider", "Ollama (Local)")
        api_key = data.get("llm_api_key", "").strip()
        model_name = data.get("llm_model", "").strip()

        translated_texts = {}
        if texts_to_translate:
            trans_inst = """You are an expert translator. Translate the following Japanese texts into concise cinematic English.
STRICT RULE 1: DO NOT use markdown. You MUST wrap each translation EXACTLY in the same XML tags as provided in the input. 
STRICT RULE 2: DO NOT output any Japanese or Chinese characters. If you see Japanese/Chinese text like "【画風・トーン】", translate it to "[Style & Tone]:".

Input Texts:
"""
            for k, text in texts_to_translate.items():
                trans_inst += f"<{k}>\n{text}\n</{k}>\n\n"
            try:
                res_trans = await asyncio.to_thread(call_llm, trans_inst, provider, api_key, model_name, temp=0.2)
                for k in texts_to_translate.keys():
                    m = re.search(fr"<{k}>\s*(.*?)\s*</{k}>", res_trans, re.DOTALL | re.IGNORECASE)
                    translated_texts[k] = m.group(1).strip() if m else texts_to_translate[k]
            except Exception as e:
                print(f"Translation error: {e}")
                translated_texts = texts_to_translate

        translated_shot_actions = {}
        if clips_actions_to_translate:
            prompt_instruction = sys_context + """

Task: Translate and cinematic-adapt the following action/camera instructions into English.
STRICT RULE 1: DO NOT use markdown. You MUST wrap each translated action EXACTLY in the provided <clip_X><sY>...</sY></clip_X> tags. 
STRICT RULE 2: DO NOT output any Japanese or Chinese characters. Everything MUST be in English.

Input:
"""
            for k, text in clips_actions_to_translate.items():
                prompt_instruction += f"<clip_{k}>\n{text}\n</clip_{k}>\n\n"
            try:
                result_text = await asyncio.to_thread(call_llm, prompt_instruction, provider, api_key, model_name, temp=0.2)
                for k in clips_actions_to_translate.keys():
                    translated_shot_actions[k] = {}
                    clip_m = re.search(fr"<clip_{k}>\s*(.*?)\s*</clip_{k}>", result_text, re.DOTALL | re.IGNORECASE)
                    clip_content = clip_m.group(1) if clip_m else clips_actions_to_translate[k]
                    for j in range(1, 5):
                        sm = re.search(fr"<s{j}>\s*(.*?)\s*</s{j}>", clip_content, re.DOTALL | re.IGNORECASE)
                        if sm:
                            translated_shot_actions[k][j] = sm.group(1).strip()
            except Exception as e:
                print(f"Action translation error: {e}")

        if provider == "Ollama (Local)" and (texts_to_translate or clips_actions_to_translate):
            await asyncio.to_thread(unload_ollama_vram, model_name or "qwen2.5:7b-instruct-q5_K_M")

        global_summary_en = translated_texts.get("g_sum", "")
        global_retention_en = translated_texts.get("g_ret", "")

        final_clip_prompts = {}
        for i in range(1, 15):
            # ▼ 単一クリップ指定がある場合、該当クリップ以外はプロンプト結合処理もスキップ
            if target_clip and str(i) != target_clip:
                continue

            if not data.get(f"c{i}_enabled", False):
                continue
                
            do_continue = data.get(f"c{i}_continue", (i > 1))
            link_next = data.get(f"c{i}_link_next", False)
            
            c_summary_en = translated_texts.get(f"c_sum_{i}", "")
            c_retention_en = translated_texts.get(f"c_ret_{i}", "")
            c_ambient_sound = translated_texts.get(f"c_amb_{i}", "Subtle natural ambient presence and air tone.")
            
            sec_subject = f"subject_definitions:\n{subject_definitions_text}"
            
            if do_continue and i > 1:
                summary_lead = "[reference generation] Continue the unbroken performance shot seamlessly without resetting the performer state or environment."
            else:
                summary_lead = "[reference generation] Begin the cinematic visual performance establishing the performer within the scene."
            
            combined_summary = f"{summary_lead} {global_summary_en} {c_summary_en}".strip()
            sec_summary = f"summary:\n{combined_summary}"
                
            if do_continue and i > 1:
                sec_retention = f"retention_analysis:\n<Subject 1> (appears throughout [Shot 1]): fully_preserved - retain facial identity, hair identity, physique, wardrobe, color palette, and key details while expression, framing, lighting, and movement follow the incoming continuation state."
            else:
                sec_retention = f"retention_analysis:\n<Subject 1> (appears throughout [Shot 1]): fully_preserved - preserve facial identity, hair identity, physique, wardrobe, color palette, and distinctive features while expression, pose, lighting, framing, and physical action follow the performance."
            
            if c_retention_en:
                sec_retention += f"\n{c_retention_en}"
            if global_retention_en:
                sec_retention += f"\nGlobal directives: {global_retention_en}"
                
            detailed_parts = []
            if do_continue and i > 1:
                detailed_parts.append("[Shot 1] The performer motion, camera momentum, trajectory, lighting, and environmental state continue seamlessly from the preceding clip context without pause or jarring transition.")
            else:
                detailed_parts.append("[Shot 1] Initiate the scene with dynamic, cinematic framing.")

            for j in range(1, 5):
                if not data.get(f"c{i}_s{j}_enabled", False):
                    continue
                
                action_text = ""
                if i in translated_shot_actions and j in translated_shot_actions[i]:
                    action_text = translated_shot_actions[i][j]
                else:
                    raw_action = apply_char_replacements(data.get(f"c{i}_s{j}_action", "").strip())
                    action_text = raw_action
                
                action_text = re.sub(r"^\[Shot\s*\d+[^\]]*\]\s*", "", action_text).strip()
                action_text = re.sub(r"[^\x00-\x7F]+", "", action_text).strip()

                shot_block = []
                if j > 1:
                    shot_block.append(f"[Shot {j}]")
                if action_text:
                    shot_block.append(f"Action/Camera: {action_text}")

                for char_idx in range(1, 4):
                    is_in = data.get(f"c{i}_s{j}_char{char_idx}_in", False)
                    is_sing = data.get(f"c{i}_s{j}_char{char_idx}_sing", False)
                    m_style = data.get(f"char{char_idx}_motion_style", "graceful")
                    
                    if is_in:
                        if is_sing:
                            if m_style == "graceful":
                                shot_block.append(f"<Subject {char_idx}> (S{char_idx}) visibly sings with distinct mouth and jaw motion in exact synchronization with the protected master-song audio, keeping an elegant posture.")
                            else:
                                shot_block.append(f"<Subject {char_idx}> (S{char_idx}) visibly sings with distinct mouth and jaw motion in exact synchronization with the protected master-song audio.")
                        else:
                            if m_style == "graceful":
                                shot_block.append(f"<Subject {char_idx}> (S{char_idx}) maintains a calm, composed presence with subtle physical nuances, keeping the mouth naturally closed without any singing motion.")
                            elif m_style == "energetic":
                                shot_block.append(f"<Subject {char_idx}> (S{char_idx}) moves dynamically with expressive physical energy aligned with the musical rhythm, keeping the mouth naturally closed without any singing motion.")
                            else:
                                shot_block.append(f"<Subject {char_idx}> (S{char_idx}) naturally moves and sways in rhythm with the music, keeping the mouth naturally closed without any singing motion.")

                if shot_block:
                    detailed_parts.append("\n".join(shot_block))

            if link_next:
                detailed_parts.append("Conclude while <Subject 1>'s body momentum and the camera movement remain actively in transit, ensuring unbroken momentum for the next clip.")
                
            sec_detailed = "detailed_description:\n" + "\n\n".join(detailed_parts)
            sec_soundscape = f"overall_soundscape:\n{c_ambient_sound}"
            sec_music = "non_diegetic_music:\nThe protected master-song audio drives the vocal expression and rhythmic momentum."

            full_prompt = f"{sec_subject}\n\n{sec_summary}\n\n{sec_retention}\n\n{sec_detailed}\n\n{sec_soundscape}\n\n{sec_music}"
            final_clip_prompts[str(i)] = full_prompt

        return web.json_response({"success": True, "clip_prompts": final_clip_prompts})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


class H3PromptDirector_MV:
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
        audio_list = ["None", "<Audio 1>", "<Audio 2>", "<Audio 3>"]
        inputs = {
            "required": {
                "llm_provider": (["Ollama (Local)", "Gemini (Cloud)", "ChatGPT (OpenAI)"], {"default": "Ollama (Local)"}),
                "llm_api_key": ("STRING", {"default": ""}),
                "llm_model": ("STRING", {"default": ""}),
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
            }
        }
        inputs["required"]["clips_data_json"] = ("STRING", {"default": "{}"})
        inputs["required"]["generated_clip_prompts"] = ("STRING", {"default": "{}"})
        return inputs

    RETURN_TYPES = ("STRING", "H3_MEDIA_BUNDLE")
    RETURN_NAMES = ("clip_prompt", "media_bundle")
    FUNCTION = "process_mv"
    CATEGORY = "MiniMax_H3"

    def process_mv(self, **kwargs):
        clip_prompt_json = kwargs.get("generated_clip_prompts", "{}")
        images, keyframes, videos, audios = {}, {}, {}, {}
        drive_audio, final_audio = None, None

        try:
            data = json.loads(kwargs.get("timeline_data", '{"items":[]}'))
            for item in data.get("items", []):
                val = item.get("value")
                mtype = item.get("laneType", item.get("type"))
                slot = item.get("slot", 0)
                if not val: continue

                if mtype == "image":
                    t = load_image_raw_tensor(val)
                    if t is not None: images[slot] = t
                elif mtype == "keyframe":
                    t = load_image_raw_tensor(val)
                    if t is not None: keyframes[slot] = t
                elif mtype == "video":
                    v = load_video_tensor(val)
                    if v is not None: videos[slot] = v
                elif mtype == "audio":
                    a = load_audio_dict(val)
                    if a is not None: audios[slot] = a
                elif mtype in ["drive_audio", "lip_sync", "drive"]:
                    a = load_audio_dict(val)
                    if a is not None: drive_audio = a
                elif mtype in ["final_audio", "bgm", "music", "song"]:
                    a = load_audio_dict(val)
                    if a is not None: final_audio = a
        except Exception as exc:
            pass

        media_bundle = {
            "images": images, "keyframes": keyframes, "videos": videos,
            "audios": audios, "drive_audio": drive_audio, "final_audio": final_audio,
        }
        return (clip_prompt_json, media_bundle)

NODE_CLASS_MAPPINGS = {
    "H3PromptDirector_MV": H3PromptDirector_MV,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PromptDirector_MV": "H3 Prompt Director (MV)",
}