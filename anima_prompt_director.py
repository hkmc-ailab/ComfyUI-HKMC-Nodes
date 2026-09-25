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
    def get_preset_files(cls, subfolder, prefix="Anima_"):
        base_dir = os.path.join(os.path.dirname(__file__), subfolder)
        os.makedirs(base_dir, exist_ok=True)
        
        files = []
        for f in os.listdir(base_dir):
            if f.endswith(".txt"):
                name = f[:-4]
                if not prefix:
                    if name.lower().startswith("anima_"):
                        files.append(name[6:])
                    elif name.lower().endswith("_anima"):
                        files.append(name[:-6])
                    else:
                        files.append(name)
                else:
                    if name.lower().startswith("anima_"):
                        files.append(name[6:])
                    elif name.lower().endswith("_anima"):
                        files.append(name[:-6])
                    
        files = sorted(list(set(files)))
        return ["None"] + files

    @classmethod
    def INPUT_TYPES(cls):
        char_list = cls.get_preset_files("characters", prefix="Anima_")
        neg_list = cls.get_preset_files("characters", prefix="")
        
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
                # ★ ラベルを「完全な後ろ姿」に変更
                "full_back_view": ("BOOLEAN", {"default": False, "label": "完全な後ろ姿"}),
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
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "STRING", "LLM_CONTEXT")
    RETURN_NAMES = ("MODEL", "CLIP", "positive", "negative", "final_negative_text", "llm_context")
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

    def parse_character_file(self, preset_name):
        if preset_name == "None":
            return {}
        
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        candidates = [
            f"Anima_{preset_name}.txt",
            f"anima_{preset_name}.txt",
            f"{preset_name}_Anima.txt",
            f"{preset_name}_anima.txt",
            f"{preset_name}.txt"
        ]
        
        target_path = None
        for cand in candidates:
            p = os.path.join(char_dir, cand)
            if os.path.exists(p):
                target_path = p
                break
                
        if not target_path:
            return {}

        with open(target_path, "r", encoding="utf-8") as f:
            content = f.read()

        sections = {}
        current_tag = "OTHER"
        for line in content.splitlines():
            line_s = line.strip()
            if not line_s:
                continue
            m = re.match(r"^\[([A-Z_\s]+)\]$", line_s)
            if m:
                current_tag = m.group(1).upper()
                sections[current_tag] = []
            else:
                sections.setdefault(current_tag, []).append(line_s)

        return {k: ", ".join(v) for k, v in sections.items()}

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

        try:
            if provider == "Gemini (Cloud)":
                key = api_key.strip() or os.getenv("GEMINI_API_KEY")
                if not key:
                    print("[AnimaPromptDirector] ERROR: GEMINI_API_KEY is missing!")
                    return user_text
                genai.configure(api_key=key)
                m = genai.GenerativeModel(model_name.strip() or "gemini-2.5-flash")
                return m.generate_content(f"{system_instruction}\n\nUser Input: {user_text}").text.strip()

            elif provider == "ChatGPT (OpenAI)":
                key = api_key.strip() or os.getenv("OPENAI_API_KEY")
                if not key:
                    print("[AnimaPromptDirector] ERROR: OPENAI_API_KEY is missing!")
                    return user_text
                client = OpenAI(api_key=key)
                res = client.chat.completions.create(
                    model=model_name.strip() or "gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": user_text}
                    ],
                    temperature=0.7 if creative_mode != "オフ" else 0.3
                )
                return res.choices[0].message.content.strip()

            elif provider == "Ollama (Local)":
                url = "http://localhost:11434/api/chat"
                payload = {
                    "model": model_name.strip() or "llama3",
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": user_text}
                    ],
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {
                        "temperature": 0.5,
                        "num_predict": 1500
                    }
                }
                print(f"[AnimaPromptDirector] Calling Ollama Chat API (Model: {model_name})... Waiting for response.")
                res = requests.post(url, json=payload, timeout=180)
                res.raise_for_status()
                ans = res.json().get("message", {}).get("content", "").strip()
                if ans:
                    print("[AnimaPromptDirector] Ollama Natural Language conversion successful.")
                    return ans
                return user_text
        except Exception as e:
            print(f"[AnimaPromptDirector] LLM Error (Provider: {provider}): {e}")
            return user_text

        return user_text

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
                          enable_negative, negative_preset, negative_prompt, lock_final_prompt, final_positive_prompt):

        if not enable_director:
            print("[AnimaPromptDirector] Node Bypassed (enable_director=OFF).")
            empty_cond = self.encode_text(clip, "")
            return {
                "ui": {"final_text": ["(Bypassed)"]},
                "result": (
                    model,
                    clip,
                    empty_cond,
                    empty_cond,
                    "",
                    {"provider": "None", "api_key": "", "model": ""}
                )
            }

        if lock_final_prompt and llm_provider == "Ollama (Local)":
            self.unload_ollama(llm_model)

        # --- 1. ネガティブ ---
        if enable_negative:
            neg_parts = []
            if negative_preset != "None":
                search_dirs = [
                    os.path.join(os.path.dirname(__file__), "negatives"),
                    os.path.join(os.path.dirname(__file__), "characters")
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

            # ★ 完全な後ろ姿ON時：振り返り・前向き要素をネガティブに自動追加
            if full_back_view:
                neg_parts.append("looking at viewer, facing front, front view, face, turning around, profile, side view")

            full_neg_text = ", ".join(neg_parts)
            clean_neg = self.clean_for_clip(full_neg_text)
            neg_conditioning = self.encode_text(clip, clean_neg)
        else:
            full_neg_text = ""
            neg_conditioning = self.encode_text(clip, "")

        # --- 2. ポジティブ ---
        if lock_final_prompt and final_positive_prompt.strip():
            structured_positive = self.resolve_wildcards(final_positive_prompt.strip())
        else:
            parsed = self.parse_character_file(character_preset)
            sections_list = []

            # (1) 品質 / トリガー
            if quality_prompt.strip():
                resolved_q = self.resolve_wildcards(quality_prompt.strip())
                # quality_promptに直書きされた目などの前面要素も後ろ姿時は除去
                resolved_q = self.filter_front_elements(resolved_q, is_back_view=full_back_view)
                clean_q = resolved_q.rstrip(" ,")
                if clean_q:
                    sections_list.append(("# --- QUALITY & BASE ---", clean_q))

            # (2) 構図 / 背景
            processed_scene = self.resolve_wildcards(scene_prompt.strip())
            if processed_scene:
                processed_scene = self.call_llm(
                    llm_provider, llm_api_key, llm_model, processed_scene, 
                    convert_all=False, creative_mode=creative_mode
                )
                clean_s = processed_scene.rstrip(" ,")
                sections_list.append(("# --- SHOT & SCENE ---", clean_s))

            # ★ 完全な後ろ姿ON時：決定打となる背面固定プロンプトを自動挿入
            if full_back_view:
                back_enforce = "completely from behind, full back view, facing away from camera, back of head, back to camera, unseen face, facing completely backwards"
                sections_list.append(("# --- POSE ENFORCEMENT ---", back_enforce))

            # (3) キャラクター各部位
            char_map = [
                (part_head, "# --- HEAD & FACE ---", ["HEAD", "FACE", "HAIR"]),
                (part_upper, "# --- UPPER BODY ---", ["UPPER", "BODY", "CHEST"]),
                (part_waist, "# --- WAIST & BELT ---", ["WAIST", "BELT"]),
                (part_lower, "# --- LOWER BODY ---", ["LOWER", "SKIRT", "PANTS"]),
                (part_legs, "# --- LEGS & FEET ---", ["LEGS", "FEET", "SHOES"])
            ]

            for enabled, header, tags in char_map:
                if enabled:
                    found_texts = [parsed[t] for t in tags if t in parsed and parsed[t]]
                    if found_texts:
                        part_text = ", ".join(found_texts).strip().rstrip(" ,")
                        part_text = self.filter_front_elements(part_text, is_back_view=full_back_view)
                        if part_text:
                            sections_list.append((header, part_text))

            # 全体自然言語化
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
                    # ★ ここに追加：LLMが勝手に作文した face や eyes などの単語を完全な後ろ姿時に再除去する
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
            structured_positive = "1girl"

        clip_pos_clean = self.clean_for_clip(structured_positive)
        pos_conditioning = self.encode_text(clip, clip_pos_clean)

        llm_context = {
            "provider": llm_provider,
            "api_key": llm_api_key.strip() or os.getenv("GEMINI_API_KEY", ""),
            "model": llm_model.strip() or "gemini-2.5-flash"
        }

        return {
            "ui": {"final_text": [structured_positive]},
            "result": (
                model,
                clip,
                pos_conditioning,
                neg_conditioning,
                full_neg_text,
                llm_context
            )
        }