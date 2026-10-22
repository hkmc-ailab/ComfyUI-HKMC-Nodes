# h3_prompt_director_mv_20.py
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

OVERLAP_SEC = 1.625

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
    
_CJK_RE = re.compile(
    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]"
)

def contains_cjk(text):
    return bool(_CJK_RE.search(text or ""))

def sanitize_english_text(text):
    if not text:
        return ""
    replacements = {
        "（": "(", "）": ")", "【": "[", "】": "]",
        "「": '"', "」": '"', "『": '"', "』": '"',
        "、": ", ", "。": ". ", "：": ": ", "；": "; ",
        "！": "!", "？": "?", "〜": "~", "～": "~",
        " ": " "
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text.strip()

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
        res1 = requests.post(url_base, headers=headers_bearer, json=payload, timeout=600)
        if res1.status_code == 200:
            try:
                return res1.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception:
                pass

        headers_apikey = {
            "Content-Type": "application/json",
            "x-goog-api-key": active_key
        }
        res2 = requests.post(url_base, headers=headers_apikey, json=payload, timeout=600)
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
        client = OpenAI(api_key=active_key, timeout=600.0)
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
        res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=900)
        res.raise_for_status()
        return res.json().get("response", "").strip()
    return ""

def analyze_audio_wave(audio_path, clip_duration=10.0, max_clips=14):
    if not audio_path or not os.path.exists(audio_path):
        return "音声ファイルが未設定のため、曲の導入から展開、クライマックスへの自然な流れを想定して絵コンテを作成してください。", {}
    try:
        sr, data = wavfile.read(audio_path)
        if data.ndim > 1: data = data.mean(axis=1)
        data = data.astype(np.float32)
        max_val = np.max(np.abs(data)) or 1.0
        data /= max_val
        
        total_sec = len(data) / float(sr)
        step_sec = max(1.0, clip_duration - OVERLAP_SEC) if clip_duration > OVERLAP_SEC else clip_duration

        clip_rms_list = []
        clip_ranges = []

        for i in range(max_clips):
            start_sec = 0.0 if i == 0 else i * step_sec
            end_sec = start_sec + clip_duration
            if start_sec >= total_sec:
                break
            start_idx = int(start_sec * sr)
            end_idx = min(len(data), int(end_sec * sr))
            chunk = data[start_idx:end_idx]
            if len(chunk) == 0:
                break
            rms = float(np.sqrt(np.mean(chunk**2)))
            clip_rms_list.append(rms)
            clip_ranges.append((i, round(start_sec, 1), round(min(end_sec, total_sec), 1)))

        if not clip_rms_list:
            return "音声データが短すぎるため解析できませんでした。", {}

        q33 = np.percentile(clip_rms_list, 33.3)
        q66 = np.percentile(clip_rms_list, 66.6)

        diag_lines = []
        stats_dict = {}
        prev_tier = None
        
        for idx_in_list, (i, start_s, end_s) in enumerate(clip_ranges):
            rms = clip_rms_list[idx_in_list]
            if rms <= q33:
                tier = "LOW"
                energy_desc = "静寂・繊細な導入・ブレイク"
            elif rms <= q66:
                tier = "MID"
                energy_desc = "標準的なボーカル・リズム展開・進行"
            else:
                tier = "HIGH"
                energy_desc = "最大の盛り上がり・高音圧・クライマックス"
            
            is_transition = (prev_tier is not None and prev_tier != tier)
            stats_dict[str(i+1)] = {"tier": tier, "trans": bool(is_transition)}
            
            transition_tag = " ★ [TRANSITION POINT: 曲の展開・転調・セクション切り替え点]" if is_transition else ""
            diag_lines.append(f"- Clip {i+1} (約{start_s}s〜{end_s}s): 音響エネルギー = {tier} ({energy_desc}){transition_tag}")
            
            prev_tier = tier
            
        return "\n".join(diag_lines), stats_dict
    except Exception as e:
        return f"波形解析エラー: {e}", {}

def parse_design_directives_dict(raw_design_json):
    if not raw_design_json:
        return {"low": [], "mid": [], "high": [], "transition": []}
    try:
        d = json.loads(raw_design_json) if isinstance(raw_design_json, str) else raw_design_json
        if isinstance(d, dict):
            return {
                "low": d.get("low", []) or [],
                "mid": d.get("mid", []) or [],
                "high": d.get("high", []) or [],
                "transition": d.get("transition", []) or [],
            }
    except Exception:
        pass
    return {"low": [], "mid": [], "high": [], "transition": []}

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

        audio_diagnostic_text = ""
        ui_stats = {}
        if audio_full_path and os.path.exists(audio_full_path):
            audio_diagnostic_text, ui_stats = analyze_audio_wave(audio_full_path, clip_duration=clip_duration_sec)
        else:
            audio_diagnostic_text = "音声ファイルが未設定のため、曲の導入から展開、クライマックスへの自然な流れを想定して絵コンテを作成してください。"

        if use_gemini_audio:
            audio_instruction_section = f"""【音源ファイルの直接解析指示 ＆ クリップ時間枠・エネルギー診断】
添付されたオーディオファイルを直接耳で聴き、以下のクリップ時間枠および波形エネルギー診断（LOW / MID / HIGH と ★ TRANSITION POINT）と照らし合わせて解析してください。
- 各クリップの時間帯における「ボーカルの有無」「演奏の盛り上がり・転調」を正確に捉え、指定されたエネルギー帯および TRANSITION POINT の演出ルールを確実に反映させてください。

{audio_diagnostic_text}"""
        else:
            audio_instruction_section = f"""【楽曲の展開・エネルギー診断 (1クリップ基本尺 = {clip_duration_sec}秒 / オーバーラップ考慮済)】
{audio_diagnostic_text}"""

        raw_design_json = data.get("design_directives_json", "")
        d_dict = parse_design_directives_dict(raw_design_json)
        
        design_directives = ""
        d_lines = ["[MUSIC VIDEO DYNAMIC DIRECTIVES]"]
        d_lines.append("STRICT RULE: You MUST incorporate the following user-selected camera, framing, acting, and lighting directives into 'Shot 1' and '演出' according to the audio energy level and transition status of each clip:")
        
        sec_map = [
            ("low", "LOW (静寂・導入)"),
            ("mid", "MID (標準展開・平歌)"),
            ("high", "HIGH (サビ・最高潮)"),
            ("transition", "★ [TRANSITION POINT] (曲の展開・転調・セクション切り替え点)")
        ]
        
        has_items = False
        for k_sec, lbl_sec in sec_map:
            items = d_dict.get(k_sec, [])
            if items:
                has_items = True
                d_lines.append(f"\nWhen the clip is marked as {lbl_sec}:")
                for itm in items:
                    d_lines.append(f"- {itm}")
        
        if has_items:
            design_directives = "\n".join(d_lines)

        system_instruction = f"""あなたは映画やハイエンドMVを手掛けるプロの映像監督・シネマトグラファーです。
提示された【MV全体世界観】のシチュエーションを最大限に活かし、楽曲の展開に完全に同期した Clip 1〜14 の絵コンテを作成してください。

[最重要前提]
- 1クリップあたりの生成尺は【 {clip_duration_sec} 秒 】です。

{design_directives}

[ショット設計とワンカット原則]
- 1つのClipにつき、出力するShotは【Shot 1】の1つだけにしてください。1つのClip内で複数のShot（カット割り）を行うと映像破綻が起きるため、絶対に「Shot 2」以降は出力しないでください。
- Clipごとにカメラアングル、被写体との距離（寄り・引き）、画角をガラリと変え、全体を通して連続的で見応えのあるMVを構成してください。

[ループ・単調化の徹底防止ルール（最重要）]
- 同じ場所で同じポーズを保つ、ただ立ち尽くす、同じような歩行を続けるなどの「反復・ループ表現」を固く禁じます。
- クリップが進むにつれて「物語の進行」「被写体の感情の深化」「場所やライティングの推移」を必ず描き、シーンが停滞しないようにしてください。
- 直前のClipと同じカメラアングル（例: Low angleの連続など）を2回続けて使用してはいけません。

[楽曲展開点（TRANSITION POINT）でのダイナミック・トランジション原則]
- 音響エネルギー診断で「★ [TRANSITION POINT]」と記されているクリップは、Aメロ→Bメロ、Bメロ→サビ、間奏などの【楽曲の重要な節目】です。
- クリップ間の物理的・キャラクター的な連続性は完全に保ちつつ、カメラワークと被写体の運動量をこのタイミングで劇的に推移（Dynamic Transition）させてください。
  - 例: 直前までワイドショット（引き）で静かに佇んでいた場合、このクリップの冒頭でカメラが一気に前進（Dolly In）して顔や手元のアップへと滑らかに飛び込む。
  - 例: カメラの高さがアイレベルだった場合、ビートの展開に合わせて急激に煽り（Low angle）や回り込み（Arc）へとカメラ軌道を旋回させる。
  - 例: 背景の照明やエフェクト（スポットライト、スモーク、ストロボ）が曲の展開と同時に点灯・変化する。
- 同じ画角・同じテンポのカメラワークを維持したままセクションを跨ぐことを固く禁じます。

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

        return web.json_response({"success": True, "storyboard": result, "audio_stats": ui_stats})
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

        d_dict = parse_design_directives_dict(data.get("design_directives_json", ""))
        audio_stats = data.get("audio_stats", {}) or {}

        def get_clip_directive_hints(clip_idx):
            c_stat = audio_stats.get(str(clip_idx), {})
            tier_key = (c_stat.get("tier") or "").lower()
            is_trans = bool(c_stat.get("trans", False))
            hints = []
            if tier_key in ["low", "mid", "high"]:
                hints.extend(d_dict.get(tier_key, []))
            if is_trans:
                hints.extend(d_dict.get("transition", []))
            seen = set()
            unique_hints = []
            for h in hints:
                if h not in seen:
                    seen.add(h)
                    unique_hints.append(h)
            return unique_hints, is_trans

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
            return sanitize_english_text(text)

        characters = build_character_context(data)

        subject_definitions_text = (
            "\n\n".join(c[2] for c in characters)
            if characters
            else "[Subject 1: Performer]\nReference sheets for Performer include <Picture 1>."
        )

        raw_rules = load_rules_mv()

        texts_to_translate = {}
        for idx, _label, subject_text in characters:
            texts_to_translate[f"subject_{idx}"] = subject_text

        clips_actions_to_translate = {}

        global_summary_raw = apply_char_replacements(data.get("global_summary", "").strip())
        if global_summary_raw: texts_to_translate["g_sum"] = global_summary_raw

        global_retention_raw = apply_char_replacements(data.get("global_retention", "").strip())
        if global_retention_raw: texts_to_translate["g_ret"] = global_retention_raw

        for i in range(1, 15):
            if target_clip and str(i) != target_clip:
                continue

            if data.get(f"c{i}_enabled", False):
                if data.get(f"c{i}_locked", False):
                    continue

                sum_raw = apply_char_replacements(data.get(f"c{i}_summary", "").strip())
                ret_raw = apply_char_replacements(data.get(f"c{i}_retention", "").strip())
                amb_raw = apply_char_replacements(data.get(f"c{i}_ambient_sound", "").strip())
                
                if sum_raw: texts_to_translate[f"c_sum_{i}"] = sum_raw
                if ret_raw: texts_to_translate[f"c_ret_{i}"] = ret_raw
                if amb_raw: texts_to_translate[f"c_amb_{i}"] = amb_raw

                shot_parts = []
                clip_hints, is_trans_clip = get_clip_directive_hints(i)
                hints_str = " ".join(clip_hints)

                for j in range(1, 5):
                    if data.get(f"c{i}_s{j}_enabled", False):
                        action = apply_char_replacements(data.get(f"c{i}_s{j}_action", "").strip())
                        if action or hints_str:
                            combined_act = action
                            if j == 1 and hints_str:
                                combined_act = f"{action}\n[Stylistic Camera/Lighting Directives to weave naturally into this shot]: {hints_str}".strip()
                            shot_parts.append(f"<s{j}>\n{combined_act}\n</s{j}>")
                if shot_parts:
                    clips_actions_to_translate[i] = "\n".join(shot_parts)

        provider = data.get("llm_provider", "Ollama (Local)")
        api_key = data.get("llm_api_key", "").strip()
        model_name = data.get("llm_model", "").strip()

        translated_texts = {}
        if texts_to_translate:
            keys_list = list(texts_to_translate.keys())
            chunk_size = 8  

            for chunk_start in range(0, len(keys_list), chunk_size):
                sub_keys = keys_list[chunk_start:chunk_start + chunk_size]
                trans_inst = """You are a strict Japanese-to-English translation engine for cinematic video prompts.

CRITICAL RULES:
1. Translate every input value into natural, precise English.
2. NEVER leave Japanese or Chinese characters in the translated values.
3. If a character name is written in Japanese or Chinese, render it using Latin letters. Do not retain its original CJK characters.
4. Preserve the structure [Subject X: CharacterName].
5. Preserve structural tokens such as <Picture 1>, <Audio 1>, and <Subject 1> exactly when they are standalone reference tokens.
6. Do not translate or alter the XML wrapper tags used to identify each field. Output EVERY tag provided.
7. Preserve the original meaning and all important details. Do not summarize or omit content.
8. If the input is already English, preserve its meaning and wording.
9. Output ONLY the translated values inside their matching XML wrapper tags. No markdown, explanations, or extra text.

Input Texts:
"""
                for k in sub_keys:
                    trans_inst += f"<{k}>\n{texts_to_translate[k]}\n</{k}>\n\n"

                res_trans = await asyncio.to_thread(
                    call_llm,
                    trans_inst,
                    provider,
                    api_key,
                    model_name,
                    temp=0.2
                )

                for k in sub_keys:
                    m = re.search(
                        fr"<{k}>\s*(.*?)\s*</{k}>",
                        res_trans,
                        re.DOTALL | re.IGNORECASE
                    )
                    if m:
                        translated = sanitize_english_text(m.group(1).strip())
                        if contains_cjk(translated):
                            translated = re.sub(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]", "", translated).strip()
                        translated_texts[k] = translated
                    else:
                        translated_texts[k] = sanitize_english_text(texts_to_translate[k])

        if characters:
            subject_definitions_text = "\n\n".join(
                translated_texts.get(f"subject_{idx}", _subject_text)
                for idx, _label, _subject_text in characters
            )
        else:
            subject_definitions_text = (
                "[Subject 1: Performer]\n"
                "Reference sheets for Performer include <Picture 1>."
            )

        sys_context = raw_rules.format(
            char_description=subject_definitions_text,
            situation="",
            quality_control="",
            bgm=""
        )

        translated_shot_actions = {}
        if clips_actions_to_translate:
            clip_keys = list(clips_actions_to_translate.keys())
            action_chunk_size = 4
            for c_start in range(0, len(clip_keys), action_chunk_size):
                sub_clip_keys = clip_keys[c_start:c_start + action_chunk_size]
                prompt_instruction = sys_context + """

Task: Translate and cinematic-adapt the following action/camera instructions into fluent English.
If '[Stylistic Camera/Lighting Directives to weave naturally into this shot]' is provided inside a shot, seamlessly blend those camera, framing, acting, and lighting details into the single cohesive shot description without outputting the bracketed label itself.
STRICT RULE 1: DO NOT use markdown. You MUST wrap each translated action EXACTLY in the provided <clip_X><sY>...</sY></clip_X> tags. 
STRICT RULE 2: DO NOT output any Japanese or Chinese characters. Everything MUST be in English.

Input:
"""
                for k in sub_clip_keys:
                    prompt_instruction += f"<clip_{k}>\n{clips_actions_to_translate[k]}\n</clip_{k}>\n\n"

                result_text = await asyncio.to_thread(
                    call_llm,
                    prompt_instruction,
                    provider,
                    api_key,
                    model_name,
                    temp=0.2
                )

                for k in sub_clip_keys:
                    text = clips_actions_to_translate[k]
                    clip_m = re.search(
                        fr"<clip_{k}>\s*(.*?)\s*</clip_{k}>",
                        result_text,
                        re.DOTALL | re.IGNORECASE
                    )
                    translated_shot_actions[k] = {}
                    expected_shots = [int(n) for n in re.findall(r"<s(\d+)>", text)]

                    if clip_m:
                        clip_content = clip_m.group(1)
                        for j in expected_shots:
                            sm = re.search(
                                fr"<s{j}>\s*(.*?)\s*</s{j}>",
                                clip_content,
                                re.DOTALL | re.IGNORECASE
                            )
                            if sm:
                                act = sanitize_english_text(sm.group(1).strip())
                                translated_shot_actions[k][j] = act
                            else:
                                translated_shot_actions[k][j] = sanitize_english_text(text)
                    else:
                        for j in expected_shots:
                            translated_shot_actions[k][j] = sanitize_english_text(text)

        if provider == "Ollama (Local)" and (texts_to_translate or clips_actions_to_translate):
            await asyncio.to_thread(unload_ollama_vram, model_name or "qwen2.5:7b-instruct-q5_K_M")

        global_summary_en = translated_texts.get("g_sum", "")
        global_retention_en = translated_texts.get("g_ret", "")

        final_clip_prompts = {}
        for i in range(1, 15):
            if target_clip and str(i) != target_clip:
                continue

            if not data.get(f"c{i}_enabled", False):
                continue
                
            if data.get(f"c{i}_locked", False):
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
            _clip_hints, is_trans = get_clip_directive_hints(i)

            if do_continue and i > 1:
                if is_trans:
                    detailed_parts.append("[Shot 1] The performer motion, camera momentum, trajectory, lighting, and environmental state continue seamlessly from the preceding clip context without pause or jarring cut, while dynamically shifting the camera perspective, framing, and performance intensity in sync with the musical transition.")
                else:
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
                
                action_text = re.sub(
                    r"^\[Shot\s*\d+[^\]]*\]\s*",
                    "",
                    action_text
                ).strip()
                action_text = sanitize_english_text(action_text)

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

            full_prompt = sanitize_english_text(
                f"{sec_subject}\n\n"
                f"{sec_summary}\n\n"
                f"{sec_retention}\n\n"
                f"{sec_detailed}\n\n"
                f"{sec_soundscape}\n\n"
                f"{sec_music}"
            )

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
            },
            "optional": {
                "design_directives": ("STRING", {"forceInput": True}),
            }
        }
        inputs["required"]["clips_data_json"] = ("STRING", {"default": "{}"})
        inputs["required"]["generated_clip_prompts"] = ("STRING", {"default": "{}"})
        return inputs

    RETURN_TYPES = ("STRING", "H3_MEDIA_BUNDLE", "H3_CLIP_CONTROL")
    RETURN_NAMES = ("clip_prompt", "media_bundle", "clip_control")
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

        clips_data_json = kwargs.get("clips_data_json", "{}")
        try:
            clips_data = json.loads(clips_data_json)
        except Exception:
            clips_data = {}

        try:
            prompts_dict = json.loads(clip_prompt_json)
        except Exception:
            prompts_dict = {}

        clip_control = {
            "cache_settings": clips_data.get("cache_settings", {}),
            "prompts": prompts_dict,
        }

        return (clip_prompt_json, media_bundle, clip_control)

NODE_CLASS_MAPPINGS = {
    "H3PromptDirector_MV": H3PromptDirector_MV,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PromptDirector_MV": "H3 Prompt Director (MV)",
}