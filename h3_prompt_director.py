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

# --- ヘルパー関数群 ---

def load_image_raw_tensor(filename):
    input_dir = folder_paths.get_input_directory()
    image_path = os.path.join(input_dir, filename)
    if not os.path.exists(image_path):
        return None
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)
    image = img.convert("RGB")
    image_np = np.array(image).astype(np.float32) / 255.0
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
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame = frame.astype(np.float32) / 255.0
        frames.append(torch.from_numpy(frame))
    cap.release()
    if not frames:
        return None
    return torch.stack(frames, dim=0)

import scipy.io.wavfile as wavfile

def load_audio_dict(filename):
    input_dir = folder_paths.get_input_directory()
    audio_path = os.path.join(input_dir, filename)
    if not os.path.exists(audio_path):
        print(f"[H3PromptDirector] File not found: {audio_path}")
        return None
    try:
        # torchcodec 依存を完全回避して安定して WAV を読み込む
        sample_rate, data = wavfile.read(audio_path)
        
        # 整数型(int16など)を float32 (-1.0 〜 1.0) に正規化
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            data = (data.astype(np.float32) - 128.0) / 128.0
        else:
            data = data.astype(np.float32)
            
        tensor = torch.from_numpy(data)
        
        # モノラル [N] の場合はステレオ [2, N] または [1, N] のチャンネル次元を持たせる
        if tensor.ndim == 1:
            tensor = tensor.unsqueeze(0)  # [1, N]
        elif tensor.ndim == 2:
            tensor = tensor.t()           # [C, N]
            
        # ComfyUIの仕様である [Batch, Channel, Samples] (3次元) に統一
        tensor = tensor.unsqueeze(0)      # [1, C, N]
        
        return {"waveform": tensor, "sample_rate": int(sample_rate)}
    except Exception as e:
        # 万が一のフォールバックとして torchaudio も試す
        try:
            waveform, sample_rate = torchaudio.load(audio_path)
            if waveform.ndim == 2:
                waveform = waveform.unsqueeze(0)
            return {"waveform": waveform, "sample_rate": sample_rate}
        except Exception as e2:
            print(f"[H3PromptDirector] Audio load error: {e} / {e2}")
            return None


def universal_resize(tensor, target_w, target_h, mode="crop", crop_pos="center"):
    if tensor is None:
        return torch.zeros((1, target_h, target_w, 3), dtype=torch.float32)
    
    b, h, w, c = tensor.shape
    if h == target_h and w == target_w:
        return tensor

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
        
        if crop_pos == "top":
            sy, sx = 0, diff_w // 2
        elif crop_pos == "bottom":
            sy, sx = diff_h, diff_w // 2
        elif crop_pos == "left":
            sy, sx = diff_h // 2, 0
        elif crop_pos == "right":
            sy, sx = diff_h // 2, diff_w
        else:  # center
            sy, sx = diff_h // 2, diff_w // 2
            
        img = img[:, :, sy:sy + target_h, sx:sx + target_w]
        return img.movedim(1, -1)

    elif mode == "pad":
        scale = min(target_w / w, target_h / h)
        new_w, new_h = round(w * scale), round(h * scale)
        img = F.interpolate(img, size=(new_h, new_w), mode="bilinear", align_corners=False)
        
        diff_w = target_w - new_w
        diff_h = target_h - new_h
        
        if crop_pos == "top":
            pad_top, pad_bottom = 0, diff_h
            pad_left = diff_w // 2
            pad_right = diff_w - pad_left
        elif crop_pos == "bottom":
            pad_top, pad_bottom = diff_h, 0
            pad_left = diff_w // 2
            pad_right = diff_w - pad_left
        elif crop_pos == "left":
            pad_left, pad_right = 0, diff_w
            pad_top = diff_h // 2
            pad_bottom = diff_h - pad_top
        elif crop_pos == "right":
            pad_left, pad_right = diff_w, 0
            pad_top = diff_h // 2
            pad_bottom = diff_h - pad_top
        else:  # center
            pad_left = diff_w // 2
            pad_right = diff_w - pad_left
            pad_top = diff_h // 2
            pad_bottom = diff_h - pad_top
            
        img = F.pad(img, (pad_left, pad_right, pad_top, pad_bottom), mode="constant", value=0.0)
        return img.movedim(1, -1)

    return tensor

def process_video_tensor(tensor, target_w, target_h, mode="crop", crop_pos="center", min_frames=5):
    """動画テンソルをリサイズし、最低5フレームを保証"""
    if tensor is None:
        return torch.zeros((min_frames, target_h, target_w, 3), dtype=torch.float32)
    
    resized_frames = universal_resize(tensor, target_w, target_h, mode=mode, crop_pos=crop_pos)
    b, h, w, c = resized_frames.shape
    if b < min_frames:
        repeats = (min_frames + b - 1) // b
        resized_frames = resized_frames.repeat(repeats, 1, 1, 1)[:min_frames]
    return resized_frames


# ==========================================
# ノード 1: H3PromptDirector
# ==========================================

class H3PromptDirector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # --- LLM 設定 ---
                "[LLM] プロバイダー": (["Gemini (Cloud)", "ChatGPT (OpenAI)", "Ollama (Local)"],),
                "[LLM] API_Key": ("STRING", {"default": "", "multiline": False}),
                "[LLM] モデル名": ("STRING", {"default": "gemini-3.6-flash", "multiline": False}),
                
                # --- キャラクター＆世界観定義 ---
                "[キャラクター] 特徴定義": ("STRING", {"multiline": True, "default": "__jill__"}),
                "[シーン] シチュエーション & リファレンス対応": ("STRING", {"multiline": True, "default": ""}),
                "[ボイス] セリフ & 声質指定": ("STRING", {"multiline": True, "default": ""}),
                
                # --- 演出・タイムライン・禁止事項 ---
                "[品質管理] 禁止事項 & スタイル維持": ("STRING", {"multiline": True, "default": "3D化しない。CGIレンダリング禁止。プラスチックのような光沢肌禁止。滑らかなグラデーション陰影禁止。フラットなアニメ塗り（セル画）を維持。"}),
                "[タイムライン] 時間軸の動き (秒数指定)": ("STRING", {"multiline": True, "default": ""}),
                "[環境音] Foley & アンビエント": ("STRING", {"multiline": True, "default": ""}),
                "[BGM] 劇伴音楽 (N/Aで無音)": ("STRING", {"multiline": True, "default": "N/A"}),
                
                # --- タイムラインデータ (非表示UI連携) ---
                "timeline_data": ("STRING", {"default": "{\"items\":[]}"}),
            }
        }

    RETURN_TYPES = ("STRING", "H3_MEDIA_BUNDLE")
    RETURN_NAMES = ("H3構造化プロンプト", "media_bundle")
    FUNCTION = "generate_all"
    CATEGORY = "MiniMax_H3"

    def process_wildcards(self, text):
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        def replace_match(match):
            char_name = match.group(1)
            file_path = os.path.join(char_dir, f"{char_name}.txt")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read().strip()
            return match.group(0)
        return re.sub(r"__([a-zA-Z0-9_-]+)__", replace_match, text)

    def generate_llm_prompt(self, provider, api_key, model_name, system_instruction):
        if provider == "Gemini (Cloud)":
            active_key = api_key if api_key and api_key.strip() else os.getenv("GEMINI_API_KEY")
            if not active_key:
                raise ValueError("Gemini API Keyが設定されていません。")
            genai.configure(api_key=active_key)
            model = genai.GenerativeModel(model_name.strip() or "gemini-3.6-flash")
            return model.generate_content(system_instruction).text.strip()

        elif provider == "ChatGPT (OpenAI)":
            active_key = api_key if api_key and api_key.strip() else os.getenv("OPENAI_API_KEY")
            if not active_key:
                raise ValueError("OpenAI API Keyが設定されていません。")
            client = OpenAI(api_key=active_key)
            response = client.chat.completions.create(
                model=model_name.strip() or "gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert prompt engineer specialized in the MiniMax H3 video generation model."},
                    {"role": "user", "content": system_instruction}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content.strip()

        elif provider == "Ollama (Local)":
            url = "http://localhost:11434/api/generate"
            payload = {"model": model_name.strip() or "llama3", "prompt": system_instruction, "stream": False}
            try:
                res = requests.post(url, json=payload, timeout=300)
                res.raise_for_status()
                return res.json().get("response", "").strip()
            except Exception as e:
                raise RuntimeError(f"Ollamaエラー: {str(e)}")
        else:
            raise ValueError(f"未知のLLMプロバイダー: {provider}")

    def generate_all(self, timeline_data="{\"items\":[]}", **kwargs):
        provider = kwargs.get("[LLM] プロバイダー", kwargs.get("LLMプロバイダー", "Ollama (Local)"))
        api_key = kwargs.get("[LLM] API_Key", kwargs.get("API_Key", ""))
        model_name = kwargs.get("[LLM] モデル名", kwargs.get("モデル名", "qwen2.5:7b-instruct-q5_K_M"))

        キャラクターの特徴 = kwargs.get(
            "[キャラクター] 特徴定義", 
            kwargs.get("キャラクターの特徴 (例: __jill__ / 髪型, 服装, 特徴)", "")
        )
        シチュエーション = kwargs.get(
            "[シーン] シチュエーション & リファレンス対応", 
            kwargs.get("シチュエーション (例: 放課後の夕暮れの教室で...)", "")
        )
        セリフ_ボイス = kwargs.get(
            "[ボイス] セリフ & 声質指定", 
            kwargs.get("セリフ / ボイス (例: 「ねえ, ずっとこうしていよ…」)", "")
        )
        禁止事項 = kwargs.get(
            "[品質管理] 禁止事項 & スタイル維持", 
            kwargs.get("禁止事項 (例: 3D化しない, 崩れない, 服装変化なし)", "")
        )
        時間軸の動き = kwargs.get(
            "[タイムライン] 時間軸の動き (秒数指定)", 
            kwargs.get("時間軸の動き (例: 0〜2秒:外を向く / 2〜4秒:振り向き微笑む)", "")
        )
        環境音 = kwargs.get(
            "[環境音] Foley & アンビエント", 
            kwargs.get("環境音 (例: セミの声, カーテンの擦れ音, 遠くの電車)", "")
        )
        BGM = kwargs.get(
            "[BGM] 劇伴音楽 (N/Aで無音)", 
            kwargs.get("BGM (例: 切ないピアノソロ, スローテンポ / N/A)", "")
        )

        char_description = self.process_wildcards(キャラクターの特徴)

        system_instruction = f"""
You are an expert prompt engineer specialized in the MiniMax H3 video generation model (REF2VA mode).
Convert the following Japanese user instructions into a fluent, high-precision, authentic 2D anime-style English structured prompt.

[STRICT RULES]
1. Output MUST be 100% English. NO Chinese characters anywhere.
2. Output ONLY the 6 section headers below in raw plain text (no markdown blocks).
3. [MULTIPLE CHARACTERS & FIXATION - CRITICAL]:
   - You MUST deeply analyze the "Character Concept" input and translate ALL specific details accurately. DO NOT summarize, shorten, or invent details.
   - Format each character under their respective tag inside `subject_definitions`, e.g., `[Subject 1: Name]`.
   - At the end of EACH character's block, summarize their specific reference sheets.
   - IF Franc is present: Her mechanical prosthetic arms MUST be COMPLETELY CONCEALED beneath long loose jacket sleeves. ONLY her metallic hands/fingers extend from the cuffs.
4. [TIMELINE & LIP-SYNC STRICT RULES - ABSOLUTE ZERO TOLERANCE]:
   - NEVER drop, omit, summarize, or rephrase dialogue into actions (e.g., NEVER replace a line with "asking a question" or "says something").
   - If dialogue lines exist in "Movement & Timing", preserve them verbatim inside `<d>[Japanese] ... </d>`.
- For ANY speaking character, you MUST use this structure:
     "[Character] (position) turns to face [Partner] (position), visibly opening and moving her/his mouth in natural anime lip-sync articulation while speaking with <Audio X>: S1: <d>[Japanese] セリフ </d>"
5. [DETAILED DESCRIPTION CONSTRAINTS]:
   - `detailed_description` MUST focus strictly on movement, camera framing, facial expressions, and lip-sync articulation. Never re-describe clothing.
   - [ACTIONS & EMOTIONS RETENTION - CRITICAL]: You MUST accurately preserve ALL physical gestures (e.g., raising an arm/hand, pointing, tilting head) and facial emotions (e.g., smiling, grinning, relaxed, surprised) specified in "Movement & Timing". NEVER omit or summarize away character gestures and smiles.
6. [PROHIBITIONS]:
   - Under `retention_analysis`, always enforce: "Strictly 2D flat cel-shaded anime style. No 3D CGI rendering, no glossy plastic skin."

[AUDIO REFERENCE RULES]:
- If <Audio 0>, <Audio 1>, or <Audio 2> are mentioned, explicitly specify them in `subject_definitions` and `detailed_description` as the character's vocal reference.

[FEW-SHOT EXAMPLE]
User Input:
- Character Concept: 
  [Subject 1: CharacterA] appearance details... Reference sheets include <Picture 0>.
  [Subject 2: CharacterB] appearance details... Reference sheets include <Picture 1>.
- Situation: CharacterA and CharacterB in the room.
- Dialogue: N/A
- Movement & Timing: 
  [Shot 1 | 0:00-0:03.0] CharacterA speaks. S1: <d>[Japanese] 入力されたセリフA </d>
  [Shot 2 | 0:03.0-0:06.0] CharacterB replies. S2: <d>[Japanese] 入力されたセリフB </d>
Output:
subject_definitions:
[Subject 1: CharacterA]
(Appearance of CharacterA)
Reference sheets for CharacterA include <Picture 0>.

[Subject 2: CharacterB]
(Appearance of CharacterB)
Reference sheets for CharacterB include <Picture 1>.

summary:
CharacterA (left) and CharacterB (right) in the room.
retention_analysis:
Strictly 2D flat cel-shaded anime style. No 3D CGI rendering. Maintain positions: CharacterA on left, CharacterB on right.
detailed_description:
[Shot 1 | 0:00-0:03.0]
CharacterA (left) turns to face CharacterB (right), visibly opening and moving mouth in natural anime lip-sync articulation while speaking: S1: <d>[Japanese] 入力されたセリフA </d>

[Shot 2 | 0:03.0-0:06.0]
CharacterB (right) answers, visibly opening and moving mouth in natural anime lip-sync articulation while speaking: S2: <d>[Japanese] 入力されたセリフB </d>

overall_soundscape:
Room ambience.
non_diegetic_music:
N/A

[User Input Notes] (PROCESS THIS EXACTLY AS PROVIDED. DO NOT TRUNCATE.)
Character Concept: {char_description}
Situation & Media References: {シチュエーション}
Dialogue / Voice: {セリフ_ボイス}
Movement & Timing: {時間軸の動き}
Retention / Prohibition: {禁止事項}
Soundscape: {環境音}
Music: {BGM}
"""
        prompt_result = self.generate_llm_prompt(provider, api_key, model_name, system_instruction)

        orig_dialogues = re.findall(r'<d>\[Japanese\]\s*(.*?)\s*<\/d>', 時間軸の動き, re.DOTALL)
        if orig_dialogues:
            dialogue_queue = [d.strip() for d in orig_dialogues if d.strip()]
            def replace_in_order(match):
                if dialogue_queue:
                    return f"<d>[Japanese] {dialogue_queue.pop(0)} </d>"
                return match.group(0)
            prompt_result = re.sub(r'<d>\[Japanese\]\s*.*?\s*<\/d>', replace_in_order, prompt_result, flags=re.DOTALL)

        prompt_result = re.sub(r'"<([^>]+)>"', r'"\1"', prompt_result)
        prompt_result = re.sub(r'("[\u3040-\u30ff\u4e00-\u9fff][^"\n]*")\s*[-–—]\s*"[^"\n]*"', r'\1', prompt_result)
        prompt_result = re.sub(r'("[\u3040-\u30ff\u4e00-\u9fff][^"\n]*")\s*[-–—]\s*[A-Za-z0-9\s,\.\'!?]+', r'\1', prompt_result)

        image_dict = {}
        video_dict = {}
        audio_dict = {}

        try:
            data = json.loads(timeline_data)
            items = data.get("items", [])
            items.sort(key=lambda x: x.get("slot", 0))

            for item in items:
                val = item.get("value")
                media_type = item.get("laneType") or item.get("type")
                slot = item.get("slot", 0)
                if not val:
                    continue

                if media_type == "image":
                    t = load_image_raw_tensor(val)
                    if t is not None:
                        image_dict[slot] = t
                elif media_type == "video":
                    v = load_video_tensor(val)
                    if v is not None:
                        video_dict[slot] = v
                elif media_type == "audio":
                    a = load_audio_dict(val)
                    if a is not None:
                        audio_dict[slot] = a

        except Exception as e:
            print(f"[H3PromptDirector] Loading warning: {e}")

        media_bundle = {
            "images": image_dict,
            "videos": video_dict,
            "audios": audio_dict
        }

        return (prompt_result, media_bundle)


# ==========================================
# ノード 2: H3MediaDispatcher（3系統リサイズ対応）
# ==========================================

class H3MediaDispatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "media_bundle": ("H3_MEDIA_BUNDLE",),
                "width": ("INT", {"default": 1344, "min": 64, "max": 4096, "step": 32}),
                "height": ("INT", {"default": 768, "min": 64, "max": 4096, "step": 32}),
                
                # --- FL2VA (first / last frame) 設定 ---
                "[FL2VA] リサイズ方式": (["crop", "pad", "stretch"], {"default": "crop"}),
                "[FL2VA] 基準位置": (["center", "top", "bottom", "left", "right"], {"default": "center"}),
                
                # --- REF2VA (ref_images 0-8) 設定 ---
                "[REF2VA] リサイズ方式": (["crop", "pad", "stretch"], {"default": "crop"}),
                "[REF2VA] 基準位置": (["center", "top", "bottom", "left", "right"], {"default": "center"}),
                
                # --- V2V (ref_video 0-1) 設定 ---
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

        # 1. FL2VA用 (first_frame / last_frame)
        raw_0 = images.get(0)
        raw_1 = images.get(1, raw_0)
        first_frame = universal_resize(raw_0, width, height, mode=fl2va_mode, crop_pos=fl2va_pos)
        last_frame = universal_resize(raw_1, width, height, mode=fl2va_mode, crop_pos=fl2va_pos)

        # 2. REF2VA用 (ref_images バッチ 0〜8)
        batch_list = []
        dummy_canvas = torch.zeros((1, height, width, 3), dtype=torch.float32)
        for i in range(9):
            if i in images:
                batch_list.append(universal_resize(images[i], width, height, mode=ref2va_mode, crop_pos=ref2va_pos))
            else:
                batch_list.append(dummy_canvas)
        ref_images_batch = torch.cat(batch_list, dim=0)

        # 3. V2V用 (ref_video_0, ref_video_1) - リサイズ ＆ 最低5フレーム保証
        ref_video_0 = process_video_tensor(videos.get(0), width, height, mode=v2v_mode, crop_pos=v2v_pos)
        ref_video_1 = process_video_tensor(videos.get(1), width, height, mode=v2v_mode, crop_pos=v2v_pos)

        # 4. 音声 (0〜2)
        dummy_audio = {"waveform": torch.zeros((1, 2, 44100)), "sample_rate": 44100}
        ref_audio_0 = audios.get(0, dummy_audio)
        ref_audio_1 = audios.get(1, dummy_audio)
        ref_audio_2 = audios.get(2, dummy_audio)

        return (
            first_frame, last_frame, ref_images_batch,
            ref_video_0, ref_video_1,
            ref_audio_0, ref_audio_1, ref_audio_2
        )


class OllamaVRAMUnloader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
                "model_name": ("STRING", {"default": "qwen2.5:7b-instruct-q5_K_M"}),
            }
        }
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("H3構造化プロンプト",)
    FUNCTION = "unload_and_pass"
    CATEGORY = "MiniMax_H3"

    def unload_and_pass(self, text, model_name):
        url = "http://localhost:11434/api/generate"
        payload = {"model": model_name, "keep_alive": 0}
        try:
            requests.post(url, json=payload, timeout=5)
        except Exception:
            pass
        return (text,)
        
# ==========================================
# ノード 3: H3CharacterSubjectManager (複数キャラ管理)
# ==========================================

class H3CharacterSubjectManager:
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
                # --- キャラクター 1 ---
                "キャラ1 プリセット": (char_list, {"default": "None"}),
                "キャラ1 名前": ("STRING", {"default": "Franc", "multiline": False}),
                "キャラ1 音声リファレンス": (audio_list, {"default": "None"}),
                "キャラ1 追記": ("STRING", {"multiline": True, "default": ""}),
                
                # --- キャラクター 2 ---
                "キャラ2 プリセット": (char_list, {"default": "None"}),
                "キャラ2 名前": ("STRING", {"default": "", "multiline": False}),
                "キャラ2 音声リファレンス": (audio_list, {"default": "None"}),
                "キャラ2 追記": ("STRING", {"multiline": True, "default": ""}),
                
                # --- キャラクター 3 ---
                "キャラ3 プリセット": (char_list, {"default": "None"}),
                "キャラ3 名前": ("STRING", {"default": "", "multiline": False}),
                "キャラ3 音声リファレンス": (audio_list, {"default": "None"}),
                "キャラ3 追記": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("subject_definitions_text",)
    FUNCTION = "build_subjects"
    CATEGORY = "MiniMax_H3"

    def read_character_txt(self, name):
        if name in ["None", "Custom Text"]:
            return ""
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        path = os.path.join(char_dir, f"{name}.txt")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        return ""

    def build_subjects(self, **kwargs):
        subjects = []

        for i in range(1, 4):
            preset = kwargs.get(f"キャラ{i}_プリセット", kwargs.get(f"キャラ{i} プリセット", "None"))
            name = kwargs.get(f"キャラ{i}_名前/識別子", kwargs.get(f"キャラ{i} 名前", "")).strip()
            audio_ref = kwargs.get(f"キャラ{i}_音声リファレンス", kwargs.get(f"キャラ{i} 音声リファレンス", "None"))
            custom_text = kwargs.get(f"キャラ{i}_追記・独自特徴", kwargs.get(f"キャラ{i} 追記", "")).strip()

            base_text = self.read_character_txt(preset)
            full_desc_parts = []
            
            if base_text:
                full_desc_parts.append(base_text)
            if custom_text:
                full_desc_parts.append(custom_text)
            
            if audio_ref != "None":
                full_desc_parts.append(f"Vocal reference for this character is {audio_ref}.")

            combined_desc = "\n".join(full_desc_parts).strip()

            if preset != "None" or combined_desc:
                label_name = name if name else (preset if preset not in ["None", "Custom Text"] else f"Character {i}")
                block = f"[Subject {len(subjects) + 1}: {label_name}]\n{combined_desc}"
                subjects.append(block)

        result_text = "\n\n".join(subjects)
        return (result_text,)
        
# ==========================================
# ノード 4: H3TimelineDirector (マルチショット・時間軸管理)
# ==========================================

class H3TimelineDirector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # --- Shot 1 ---
                "ショット1_有効": ("BOOLEAN", {"default": True}),
                "ショット1_タイム (例: 0:00-0:03.0)": ("STRING", {"default": "0:00-0:03.0"}),
                "ショット1_アクション/構図": ("STRING", {"multiline": True, "default": ""}),
                "ショット1_セリフ (例: S1: セリフ)": ("STRING", {"multiline": True, "default": "S1: "}),
                
                # --- Shot 2 ---
                "ショット2_有効": ("BOOLEAN", {"default": False}),
                "ショット2_タイム (例: 0:03.0-0:08.0)": ("STRING", {"default": "0:03.0-0:08.0"}),
                "ショット2_アクション/構図": ("STRING", {"multiline": True, "default": ""}),
                "ショット2_セリフ": ("STRING", {"multiline": True, "default": "S2: "}),

                # --- Shot 3 ---
                "ショット3_有効": ("BOOLEAN", {"default": False}),
                "ショット3_タイム (例: 0:08.0-0:11.5)": ("STRING", {"default": "0:08.0-0:11.5"}),
                "ショット3_アクション/構図": ("STRING", {"multiline": True, "default": ""}),
                "ショット3_セリフ": ("STRING", {"multiline": True, "default": ""}),

                # --- Shot 4 ---
                "ショット4_有効": ("BOOLEAN", {"default": False}),
                "ショット4_タイム (例: 0:11.5-0:15.0)": ("STRING", {"default": "0:11.5-0:15.0"}),
                "ショット4_アクション/構図": ("STRING", {"multiline": True, "default": ""}),
                "ショット4_セリフ": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("timeline_sequence_text",)
    FUNCTION = "build_timeline"
    CATEGORY = "MiniMax_H3"

    def format_dialogue(self, text):
        if not text or not text.strip():
            return ""
        lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
        formatted_lines = []
        for line in lines:
            if ":" in line:
                speaker, dialogue = line.split(":", 1)
                dialogue = dialogue.strip().strip('"').strip("'")
                formatted_lines.append(f"{speaker.strip()}: <d>[Japanese] {dialogue} </d>")
            else:
                dialogue = line.strip().strip('"').strip("'")
                formatted_lines.append(f"<d>[Japanese] {dialogue} </d>")
        return "\n".join(formatted_lines)

    def build_timeline(self, **kwargs):
        shots = []
        for i in range(1, 5):
            enabled = kwargs.get(f"ショット{i}_有効", False)
            if not enabled:
                continue

            time_range = kwargs.get(f"ショット{i}_タイム (例: 0:00-0:03.0)", "").strip()
            action = kwargs.get(f"ショット{i}_アクション/構図", "").strip()
            
            # FIX: ショット1のみ特殊なキー名になっているのを確実に拾う
            if i == 1:
                dialogue_raw = kwargs.get("ショット1_セリフ (例: S1: セリフ)", "").strip()
            else:
                dialogue_raw = kwargs.get(f"ショット{i}_セリフ", "").strip()

            shot_content = []
            if action:
                shot_content.append(action)
            
            formatted_dialogue = self.format_dialogue(dialogue_raw)
            if formatted_dialogue:
                shot_content.append(formatted_dialogue)

            if shot_content:
                header = f"[Shot {len(shots) + 1} | {time_range}]"
                body = "\n".join(shot_content)
                shots.append(f"{header}\n{body}")

        result_text = "\n\n".join(shots)
        return (result_text,)