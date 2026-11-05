import os
import re
import json
import requests
import google.generativeai as genai
from openai import OpenAI
import nodes
from server import PromptServer
from aiohttp import web

@PromptServer.instance.routes.get("/anima/shot_angles")
async def get_shot_angles(request):
    base_dir = os.path.join(os.path.dirname(__file__), "presets")
    candidates = ["presets_shot_angles.json", "shot_angles.json"]
    for c in candidates:
        p = os.path.join(base_dir, c)
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return web.json_response(json.load(f))
            except Exception:
                pass
    return web.json_response({})

class AnimaPromptDirector:
    DEFAULT_BACK_FILTER = [
        "eye", "eyes", "pupil", "pupils", "iris", "eyeshadow", "eyelash", "eyelashes",
        "mouth", "lip", "lips", "teeth", "tongue", "nose", "blush", "forehead",
        "smile", "grin", "smirk", "frown", "expression", "looking at viewer", "looking away",
        "bangs", "sidelocks",
        "cleavage", "breast", "breasts", "navel", "collarbone", "collarbones",
        "pendant", "necklace", "necktie", "bowtie", "brooch"
    ]

    @classmethod
    def load_shot_angle_presets(cls):
        base_dir = os.path.join(os.path.dirname(__file__), "presets")
        os.makedirs(base_dir, exist_ok=True)
        json_path = os.path.join(base_dir, "shot_angles.json")
        
        default_data = {
            "shots": {
                "構図を選択...": "",
                "全身 (Full Body)": "full body",
                "広角/引き (Wide Shot)": "wide shot",
                "ニーアップ (Thigh-up)": "cowboy shot",
                "上半身 (Upper Body)": "upper body",
                "バストアップ (Bust Shot)": "bust shot, portrait",
                "クローズアップ (Close-up)": "close-up, face focus"
            },
            "angles": {
                "アングルを選択...": "",
                "正面 (Front View)": "front view",
                "煽り/見上げ (Low Angle)": "from below, looking up",
                "俯瞰/見下ろし (High Angle)": "from above, looking down",
                "斜め構図 (Dynamic Angle)": "dynamic angle, dutch angle",
                "横顔 (Side View)": "profile, from side",
                "後ろ姿 (Back View)": "from behind"
            }
        }
        
        if not os.path.exists(json_path):
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(default_data, f, ensure_ascii=False, indent=2)
            return default_data
            
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default_data

    @classmethod
    def load_back_view_filters(cls):
        base_dir = os.path.join(os.path.dirname(__file__), "presets")
        os.makedirs(base_dir, exist_ok=True)
        txt_path = os.path.join(base_dir, "filter_back_view.txt")

        if not os.path.exists(txt_path):
            try:
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write("# 後ろ姿（Back View）モード時に自動除外するキーワード一覧\n")
                    f.write("# 1行に1単語/フレーズを記述してください（#から始まる行はコメントです）\n\n")
                    for word in cls.DEFAULT_BACK_FILTER:
                        f.write(f"{word}\n")
                print(f"[AnimaPromptDirector] Created default back-view filter: {txt_path}")
            except Exception as e:
                print(f"[AnimaPromptDirector] Failed to create filter file: {e}")
                return cls.DEFAULT_BACK_FILTER

        filter_words = []
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_s = line.strip()
                    if line_s and not line_s.startswith("#"):
                        filter_words.append(line_s.lower())
            return filter_words if filter_words else cls.DEFAULT_BACK_FILTER
        except Exception as e:
            print(f"[AnimaPromptDirector] Error loading {txt_path}: {e}")
            return cls.DEFAULT_BACK_FILTER

    @classmethod
    def get_character_presets(cls):
        """Only validated Extractor v2 JSON files are character presets."""
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        os.makedirs(char_dir, exist_ok=True)
        result = set()
        for filename in os.listdir(char_dir):
            if not filename.lower().endswith(".json"):
                continue
            path = os.path.join(char_dir, filename)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                if not isinstance(data, dict) or data.get("format") != "anima_character_v2":
                    continue
                if not isinstance(data.get("tags"), list):
                    continue
                if not all(isinstance(t, dict) and isinstance(t.get("text"), str)
                           and isinstance(t.get("category"), str) for t in data["tags"]):
                    continue
            except (OSError, ValueError, UnicodeError):
                continue
            name = filename[:-5]
            if name.lower().startswith("anima_"):
                name = name[6:]
            result.add(name)
        return ["None"] + sorted(result, key=str.casefold)

    @classmethod
    def get_negative_presets(cls):
        """Negative TXT presets remain supported independently of character JSON."""
        negative_dir = os.path.join(os.path.dirname(__file__), "negatives")
        os.makedirs(negative_dir, exist_ok=True)
        names = set()
        for filename in os.listdir(negative_dir):
            if not filename.lower().endswith(".txt"):
                continue
            name = filename[:-4]
            if name.lower().startswith("anima_"):
                name = name[6:]
            names.add(name)
        return ["None"] + sorted(names, key=str.casefold)

    @classmethod
    def INPUT_TYPES(cls):
        char_list = cls.get_character_presets()
        neg_list = cls.get_negative_presets()
        
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "enable_director": ("BOOLEAN", {"default": True, "label_on": "ON (有効)", "label_off": "OFF (バイパス)", "label": "Director機能"}),
                "character_preset": (char_list, {"default": "None"}),
                "part_head": ("BOOLEAN", {"default": True}),
                "part_upper": ("BOOLEAN", {"default": True}),
                "part_waist": ("BOOLEAN", {"default": True}),
                "part_lower": ("BOOLEAN", {"default": True}),
                "part_legs": ("BOOLEAN", {"default": True}),
                "full_back_view": ("BOOLEAN", {"default": False, "label": "完全な後ろ姿"}),
                "shot_choice": (["全身", "膝上", "腰上", "上半身", "胸上", "顔"], {"default": "上半身"}),
                "angle_choice": (["正面", "横から", "斜め前", "斜め後ろ", "上から", "下から", "後ろから", "ダッチアングル", "逆さま", "真上", "真下"], {"default": "正面"}),
                "quality_prompt": ("STRING", {"multiline": True, "default": "__quality__, anime style, cel-shaded, crisp outlines"}),
                "scene_prompt": ("STRING", {"multiline": True, "default": ""}),
                
                "llm_provider": (["None (Raw Tag)", "Gemini (Cloud)", "ChatGPT (OpenAI)", "Ollama (Local)"], {"default": "None (Raw Tag)", "label": "[LLM] プロバイダー"}),
                "llm_api_key": ("STRING", {"default": "", "multiline": False, "label": "[LLM] API_Key"}),
                "llm_model": ("STRING", {"default": "gemini-2.5-flash", "multiline": False, "label": "[LLM] モデル名"}),
                "creative_mode": (["オフ", "控えめ (光・空気感)", "リッチ (小物・情景追加)"], {"default": "オフ", "label": "[LLM] 演出/あそび"}),
                "convert_all_to_natural": ("BOOLEAN", {"default": False, "label_on": "ON", "label_off": "OFF", "label": "全て自然言語に変換"}),
                
                "enable_negative": ("BOOLEAN", {"default": True, "label_on": "ON", "label_off": "OFF"}),
                "negative_preset": (neg_list, {"default": "None"}),
                "negative_prompt": ("STRING", {"multiline": True, "default": "worst quality, low quality, bad anatomy, blurry, 3d, realistic, watermark"}),
                
                "lock_final_prompt": ("BOOLEAN", {"default": False, "label_on": "Yes(LLM_VRAM解放)", "label_off": "No", "label": "最終プロンプトをロック"}),
                "final_positive_prompt": ("STRING", {"multiline": True, "default": ""}),
                "character_tag_selection": ("STRING", {"default": '{"version":1,"presets":{}}'}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("MODEL", "CLIP", "positive", "negative")
    OUTPUT_NODE = True
    FUNCTION = "direct_and_encode"
    CATEGORY = "Anima"

    def filter_front_elements(self, text, is_back_view=False):
        if not text:
            return ""

        if not is_back_view:
            return re.sub(r'!(.*?)!', r'\1', text)

        filter_words = self.load_back_view_filters()
        tags = [t.strip() for t in text.split(',') if t.strip()]
        filtered_tags = []

        for tag in tags:
            keep_match = re.match(r'^!(.*?)!$', tag)
            if keep_match:
                filtered_tags.append(keep_match.group(1).strip())
                continue

            tag_lower = tag.lower()
            should_exclude = False
            for fw in filter_words:
                pattern = r'\b' + re.escape(fw) + r'\b'
                if re.search(pattern, tag_lower):
                    print(f"[AnimaPromptDirector] [Back-View Filter] Removed: '{tag}' (Matched: '{fw}')")
                    should_exclude = True
                    break

            if not should_exclude:
                filtered_tags.append(tag)

        return ", ".join(filtered_tags)

    def resolve_wildcards(self, text):
        if not text:
            return ""

        presets_dir = os.path.join(os.path.dirname(__file__), "presets")

        def replace_match(match):
            filename = match.group(1).strip()
            txt_path = os.path.join(presets_dir, f"{filename}.txt")
            if os.path.exists(txt_path):
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [line.strip() for line in f.readlines() if line.strip() and not line.strip().startswith("#")]
                        loaded_text = ", ".join(lines)
                        print(f"[AnimaPromptDirector] Loaded Wildcard: __{filename}__ from {txt_path}")
                        return loaded_text
                except Exception as e:
                    print(f"[AnimaPromptDirector] Error loading wildcard file '{txt_path}': {e}")
                    return match.group(0)
            else:
                print(f"[AnimaPromptDirector] Wildcard file not found: {txt_path}")
                return match.group(0)

        return re.sub(r'__([a-zA-Z0-9_\-\.\s]+)__', replace_match, text)

    SHOT_TAGS = {
        "全身": "full body, entire figure visible, head to toe framing",
        "膝上": "knee-up shot, composition cropped at knees, head torso and upper legs visible",
        "腰上": "waist-up shot, composition cropped at waist, head and torso visible",
        "上半身": "upper-body portrait, head and upper torso visible, close framing",
        "胸上": "tight bust portrait, composition cropped at upper chest, head neck shoulders and upper chest visible only, face prominent in frame",
        "顔": "tight head-and-shoulders close-up, face filling most of frame, only head neck and top of shoulders visible, cropped at shoulders"
    }
    ANGLE_TAGS = {
        "正面": "front view, straight-on perspective",
        "横から": "side view, profile",
        "斜め前": "three-quarter front view",
        "斜め後ろ": "three-quarter rear view",
        "上から": "high angle, viewed from above",
        "下から": "low angle, viewed from below",
        "後ろから": "back view, viewed from behind",
        "ダッチアングル": "dutch angle, tilted composition",
        "逆さま": "upside-down composition, inverted orientation",
        "真上": "top-down view, bird's-eye view",
        "真下": "worm's-eye view, directly from below"
    }
    CHARACTER_CATEGORIES = {
        "identity", "face", "hair", "body", "upper", "waist", "lower",
        "legs", "hands", "accessories", "expression", "pose", "other"
    }

    def parse_character_file(self, preset_name):
        """Read only the v2 JSON saved by Anima Character Extractor."""
        if not preset_name or preset_name == "None":
            return []
        known = self.get_character_presets()
        if preset_name not in known:
            raise ValueError(f"キャラクターJSONが見つかりません: {preset_name}。charactersフォルダ内のJSONを確認してください。")
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        filenames = []
        for filename in os.listdir(char_dir):
            if not filename.lower().endswith(".json"):
                continue
            base = filename[:-5]
            display = base[6:] if base.lower().startswith("anima_") else base
            if display == preset_name:
                filenames.append(filename)
        if not filenames:
            raise ValueError(f"キャラクタープリセットがありません: {preset_name}")
        filenames.sort(key=lambda f: (not f.lower().startswith("anima_"), f.casefold()))
        path = os.path.join(char_dir, filenames[0])
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if data.get("format") != "anima_character_v2" or not isinstance(data.get("tags"), list):
            raise ValueError("Character Extractor v2 のJSON形式ではありません")
        result = []
        for record in data["tags"]:
            if not isinstance(record, dict):
                continue
            tag = record.get("text", "")
            category = str(record.get("category", "other")).lower()
            if not isinstance(tag, str) or not tag.strip():
                continue
            if category not in self.CHARACTER_CATEGORIES:
                category = "other"
            result.append({"text": tag.strip(), "category": category})
        return result

    @staticmethod
    def character_tag_key(index, text):
        return f"{index}:{text}"

    @staticmethod
    def disabled_character_keys(preset, selection_json):
        if not preset or preset == "None" or not selection_json:
            return set()
        try:
            data = json.loads(selection_json)
            if not isinstance(data, dict) or data.get("version") != 1:
                raise ValueError("キャラクタータグ選択のバージョンが不正です")
            presets = data.get("presets")
            if not isinstance(presets, dict):
                raise ValueError("キャラクタータグ選択の保存形式が不正です")
            values = presets.get(preset, [])
            if not isinstance(values, list):
                raise ValueError("キャラクタータグ選択の内容が不正です")
            return {key for key in values[:3000] if isinstance(key, str)}
        except (ValueError, TypeError) as exc:
            raise ValueError(f"キャラクタータグ選択データを確認してください: {exc}") from exc

    def select_character_tags(self, records, preset, selection_json):
        disabled = self.disabled_character_keys(preset, selection_json)
        selected = []
        seen = set()
        for index, record in enumerate(records):
            tag = record["text"].strip()
            if not tag or self.character_tag_key(index, tag) in disabled:
                continue
            normalized = tag.casefold()
            if normalized not in seen:
                seen.add(normalized)
                selected.append(tag)
        return selected

    def call_llm(self, provider, api_key, model_name, user_text, convert_all=False, creative_mode="オフ"):
        if provider == "None (Raw Tag)" or not user_text.strip():
            return user_text

        if convert_all:
            system_instruction = (
                "You are an expert anime prompt rewriter. "
                "Your task is to transform Danbooru-style comma-separated tags into fluent, highly descriptive, natural English sentences under each section.\n\n"
                "RULES:\n"
                "1. Keep every header (like '# --- UPPER BODY ---') EXACTLY as provided.\n"
                "2. Do NOT leave tags as a comma-separated list. Turn them into natural sentences.\n"
                "3. Do NOT add new unmentioned items. Only describe the given tags naturally.\n"
                "4. Output ONLY the headers and the rephrased sentences.\n\n"
                "EXAMPLE:\n"
                "Input:\n"
                "# --- UPPER BODY ---\n"
                "black tank top, bare shoulders, cybernetic arm, mechanical wires\n\n"
                "Output:\n"
                "# --- UPPER BODY ---\n"
                "She wears a fitted black ribbed tank top exposing her bare left shoulder, while her right arm is replaced with an intricate cybernetic prosthesis featuring exposed delicate wires."
            )
        else:
            if creative_mode == "リッチ (小物・情景追加)":
                flavor_rule = (
                    "Act as a master anime scene director. Translate the Japanese description into English tags/phrases, "
                    "and ACTIVELY ENHANCE THE SCENE by adding fitting thematic props, background furniture, atmospheric lighting, "
                    "and contextual environment elements that complement the scene (e.g., celestial globes, telescopes, scattered books, ancient charts for an academy). "
                    "DO NOT modify character design or outfits."
                )
            elif creative_mode == "控えめ (光・空気感)":
                flavor_rule = (
                    "Translate the Japanese description into English tags/phrases. Subtly enhance the atmosphere "
                    "by adding light, time of day, and environmental ambiance (e.g., warm golden hour, gentle lens flare, floating dust particles). "
                    "DO NOT add large physical objects and DO NOT modify character design."
                )
            else:
                flavor_rule = (
                    "Translate the Japanese description into highly effective English Danbooru/Anime tags strictly. "
                    "Translate actions, poses, and backgrounds accurately without inventing unmentioned objects."
                )

            system_instruction = (
                f"{flavor_rule}\n"
                "Use standard illustration tags (e.g., 'arms up', 'stretching arms'). "
                "Output ONLY comma-separated tags or short phrases without any explanation."
            )

        def invoke(instruction, source, attempt):
            if provider == "Gemini (Cloud)":
                key = api_key.strip() or os.getenv("GEMINI_API_KEY")
                if not key:
                    raise ValueError("GeminiのAPIキーが設定されていません。")
                genai.configure(api_key=key)
                model = genai.GenerativeModel(model_name.strip() or "gemini-2.5-flash")
                result = model.generate_content(f"{instruction}\n\nUser Input: {source}")
                return (getattr(result, "text", None) or "").strip()
            if provider == "ChatGPT (OpenAI)":
                key = api_key.strip() or os.getenv("OPENAI_API_KEY")
                if not key:
                    raise ValueError("OpenAIのAPIキーが設定されていません。")
                client = OpenAI(api_key=key, timeout=180.0)
                result = client.chat.completions.create(
                    model=model_name.strip() or "gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": instruction},
                        {"role": "user", "content": source},
                    ],
                    temperature=0.2 if attempt > 1 else (0.7 if creative_mode != "オフ" else 0.3),
                )
                return (result.choices[0].message.content or "").strip()
            if provider == "Ollama (Local)":
                target_model = model_name.strip() or "qwen3.5:9b"
                payload = {
                    "model": target_model,
                    "messages": [
                        {"role": "system", "content": instruction},
                        {"role": "user", "content": source},
                    ],
                    "think": False,
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {"temperature": 0.15 if attempt > 1 else 0.3, "num_predict": 1600},
                }
                print(f"[AnimaPromptDirector] Ollama /api/chat request: model={target_model}, attempt={attempt}, think=false")
                response = requests.post("http://localhost:11434/api/chat", json=payload, timeout=180)
                response.raise_for_status()
                data = response.json()
                message = data.get("message") or {}
                return (message.get("content") or "").strip()
            raise ValueError(f"サポートされていないLLMプロバイダー: {provider}")

        needs_translation = bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", user_text))
        for attempt in (1, 2):
            instruction = system_instruction
            source = user_text
            if attempt == 2:
                instruction += (
                    "\n\nCRITICAL OUTPUT VALIDATION: Respond entirely in English. "
                    "Do not repeat Japanese or Chinese characters from the input. "
                    "Do not echo the original input. Keep all described actions, poses, "
                    "expressions and scene elements. Output English image-generation tags only "
                    "unless the earlier section-format rule requires headings."
                )
            try:
                answer = invoke(instruction, source, attempt).strip()
            except Exception as exc:
                print(f"[AnimaPromptDirector] LLM request failed: provider={provider}, attempt={attempt}, error={exc}")
                raise RuntimeError(f"LLMとの通信に失敗しました（{provider}）: {exc}") from exc
            has_japanese = bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", answer))
            print(f"[AnimaPromptDirector] LLM response: attempt={attempt}, characters={len(answer)}, has_Japanese={has_japanese}")
            if answer and not has_japanese and (not needs_translation or answer.strip() != user_text.strip()):
                return answer
            if attempt == 1:
                print("[AnimaPromptDirector] LLM returned an empty or untranslated response; retrying with strict English instructions.")
        raise ValueError("LLMの応答が空、または日本語が未変換でした。モデルの英語変換結果を確認してください。")

    def unload_ollama(self, model_name):
        try:
            url = "http://localhost:11434/api/generate"
            payload = {
                "model": model_name.strip() or "llama3",
                "keep_alive": 0
            }
            requests.post(url, json=payload, timeout=5)
            print(f"[AnimaPromptDirector] Ollama model '{model_name}' unloaded from VRAM.")
        except Exception:
            pass

    def clean_for_clip(self, text):
        cleaned = re.sub(r'#.*', '', text)
        cleaned = cleaned.replace('\n', ' ')
        cleaned = re.sub(r',\s*,+', ',', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip(' ,')
        return cleaned

    def encode_text(self, clip, text):
        if not text or not text.strip():
            text = " "
        return nodes.CLIPTextEncode().encode(clip, text)[0]

    def direct_and_encode(self, model, clip, enable_director, character_preset,
                          part_head, part_upper, part_waist, part_lower, part_legs, full_back_view,
                          quality_prompt, scene_prompt, llm_provider, llm_api_key, llm_model, creative_mode, convert_all_to_natural,
                          enable_negative, negative_preset, negative_prompt, lock_final_prompt, final_positive_prompt, shot_choice="上半身", angle_choice="正面", preview_generation=False, character_tag_selection=""):

        enable_director = True
        enable_negative = True
        if llm_provider != "None (Raw Tag)" and not lock_final_prompt and not preview_generation:
            raise ValueError("［プロンプト］タブの［プロンプト生成］を押してからQueueしてください。")

        if lock_final_prompt and llm_provider == "Ollama (Local)":
            self.unload_ollama(llm_model)

        if llm_provider == "None (Raw Tag)":
            negative_preset = "None"
            full_back_view = False

        is_back_view = angle_choice in ("後ろから", "斜め後ろ") or full_back_view
        if enable_negative:
            neg_parts = []
            if negative_preset != "None":
                search_dirs = [
                    os.path.join(os.path.dirname(__file__), "negatives")
                ]
                candidates = [
                    f"Anima_{negative_preset}.txt",
                    f"anima_{negative_preset}.txt",
                    f"{negative_preset}_Anima.txt",
                    f"{negative_preset}_anima.txt",
                    f"{negative_preset}.txt"
                ]
                target_neg = None
                for d in search_dirs:
                    if not os.path.exists(d): continue
                    for cand in candidates:
                        p = os.path.join(d, cand)
                        if os.path.exists(p):
                            target_neg = p
                            break
                    if target_neg: break
                        
                if target_neg:
                    with open(target_neg, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        if content:
                            neg_parts.append(content)
                            print(f"[AnimaPromptDirector] Loaded Negative Preset: {target_neg}")

            if negative_prompt.strip():
                resolved_neg = self.resolve_wildcards(negative_prompt.strip())
                neg_parts.append(resolved_neg)

            if is_back_view:
                neg_parts.append("looking at viewer, facing front, front view, face, turning around, profile, side view")

            full_neg_text = ", ".join(neg_parts)
            clean_neg = self.clean_for_clip(full_neg_text)
            neg_conditioning = self.encode_text(clip, clean_neg)
        else:
            full_neg_text = ""
            neg_conditioning = self.encode_text(clip, "")

        if llm_provider == "None (Raw Tag)" or (lock_final_prompt and final_positive_prompt.strip()):
            structured_positive = self.resolve_wildcards(final_positive_prompt.strip())
        else:
            parsed = self.parse_character_file(character_preset)
            sections_list = []

            framing = self.SHOT_TAGS.get(shot_choice, self.SHOT_TAGS["上半身"])
            angle = self.ANGLE_TAGS.get(angle_choice, self.ANGLE_TAGS["正面"])
            sections_list.append(("# --- FRAMING & ANGLE ---", f"{framing}, {angle}"))
            if quality_prompt.strip():
                resolved_q = self.resolve_wildcards(quality_prompt.strip())
                resolved_q = self.filter_front_elements(resolved_q, is_back_view=is_back_view)
                clean_q = resolved_q.rstrip(" ,")
                if clean_q:
                    sections_list.append(("# --- QUALITY & BASE ---", clean_q))

            processed_scene = self.resolve_wildcards(scene_prompt.strip())
            if processed_scene:
                processed_scene = self.call_llm(
                    llm_provider, llm_api_key, llm_model, processed_scene, 
                    convert_all=False, creative_mode=creative_mode
                )
                clean_s = processed_scene.rstrip(" ,")
                sections_list.append(("# --- SHOT & SCENE ---", clean_s))

            if is_back_view:
                back_enforce = "completely from behind, back of head, unseen face, facing away"
                sections_list.append(("# --- POSE ENFORCEMENT ---", back_enforce))

            selected_tags = self.select_character_tags(parsed, character_preset, character_tag_selection)
            if selected_tags:
                sections_list.append(("# --- CHARACTER DESIGN (JSON PRESET) ---", ", ".join(selected_tags)))

            if convert_all_to_natural and llm_provider != "None (Raw Tag)":
                quality_section = [val for hdr, val in sections_list if hdr == "# --- QUALITY & BASE ---"]
                target_sections = [(hdr, val) for hdr, val in sections_list if hdr != "# --- QUALITY & BASE ---"]

                raw_combined = "\n\n".join([f"{hdr}\n{val}" for hdr, val in target_sections if val])
                natural_result = self.call_llm(
                    llm_provider, llm_api_key, llm_model, raw_combined, 
                    convert_all=True, creative_mode="オフ"
                )
                
                final_parts = []
                if quality_section and quality_section[0]:
                    final_parts.append(f"# --- QUALITY & BASE ---\n{quality_section[0]}")
                
                if natural_result and natural_result.strip():
                    if full_back_view:
                        natural_result = self.filter_front_elements(natural_result, is_back_view=True)
                    final_parts.append(natural_result.strip())
                else:
                    fallback_blocks = [f"{hdr}\n{val}," for hdr, val in target_sections if val]
                    final_parts.append("\n\n".join(fallback_blocks))
                
                structured_positive = "\n\n".join(final_parts)
            else:
                formatted_blocks = [f"{hdr}\n{val}," for hdr, val in sections_list if val]
                structured_positive = "\n\n".join(formatted_blocks)

        if not structured_positive.strip():
            structured_positive = " "

        clip_pos_clean = self.clean_for_clip(structured_positive)
        pos_conditioning = self.encode_text(clip, clip_pos_clean)

        return {
            "ui": {
                "final_text": [structured_positive],
                "positive_used": [clip_pos_clean],
                "negative_used": [clean_neg],
            },
            "result": (model, clip, pos_conditioning, neg_conditioning)
        }

@PromptServer.instance.routes.get("/anima/director/character_tags")
async def anima_director_character_tags(request):
    try:
        preset = str(request.query.get("preset", "None"))
        if len(preset) > 200:
            return web.json_response({"error": "プリセット名が長すぎます"}, status=400)
        director = AnimaPromptDirector()
        records = director.parse_character_file(preset)
        tags = [
            {
                "key": director.character_tag_key(index, item["text"]),
                "text": item["text"],
                "category": item["category"]
            }
            for index, item in enumerate(records)
        ]
        return web.json_response({"preset": preset, "tags": tags}, headers={"Cache-Control": "no-store"})
    except (ValueError, OSError, TypeError, json.JSONDecodeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)

@PromptServer.instance.routes.post("/anima/director/generate_prompt")
async def anima_generate_prompt(request):
    import asyncio
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            return web.json_response({"error": "Invalid request"}, status=400)
        request_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(payload.get("request_id", "")))[:48] or "no-id"
        print(f"[AnimaPromptDirector] Preview start: request_id={request_id}")
        definitions = AnimaPromptDirector.INPUT_TYPES()["required"]
        values = {}
        for name, spec in definitions.items():
            if name in ("model", "clip"):
                continue
            kind = spec[0]
            options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            default = options.get("default", kind[0] if isinstance(kind, list) else "")
            value = payload.get(name, default)
            if isinstance(kind, list):
                value = value if value in kind else default
            elif kind == "BOOLEAN":
                value = value is True
            elif kind == "STRING":
                value = str(value)[:200000 if name == "character_tag_selection" else 30000]
            values[name] = value
        values["enable_director"] = True
        values["enable_negative"] = True
        values["lock_final_prompt"] = False
        values["final_positive_prompt"] = ""
        if values["llm_provider"] == "None (Raw Tag)":
            values["convert_all_to_natural"] = False
        class Preview(AnimaPromptDirector):
            def encode_text(self, clip, text):
                return text
        def generate():
            result = Preview().direct_and_encode(model=None, clip=None, preview_generation=True, **values)
            return result["ui"]["final_text"][0], result["ui"]["negative_used"][0]
        positive, negative = await asyncio.to_thread(generate)
        print(f"[AnimaPromptDirector] Preview complete: request_id={request_id}, positive_characters={len(positive)}")
        return web.json_response({"positive": positive, "negative": negative, "request_id": request_id})
    except Exception as exc:
        print(f"[AnimaPromptDirector] Preview failed: {exc}")
        return web.json_response({"error": str(exc)}, status=500)
