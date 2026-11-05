import os
import re
import json
import requests
from openai import OpenAI
from server import PromptServer
from aiohttp import web

@PromptServer.instance.routes.post("/anima/save_character")
async def save_character_file(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        content = data.get("content", "").strip()

        if not filename:
            return web.json_response({"success": False, "error": "ファイル名が空です。"}, status=400)

        base_dir = os.path.join(os.path.dirname(__file__), "characters")
        os.makedirs(base_dir, exist_ok=True)

        clean_name = re.sub(r'[\\/*?:"<>|]', "", filename)
        if not clean_name.lower().endswith((".json", ".txt")):
            clean_name = f"{clean_name}.json"
        if clean_name in (".", "..") or not clean_name.strip(". "):
            return web.json_response({"success": False, "error": "ファイル名が無効です"}, status=400)

        file_path = os.path.join(base_dir, clean_name)
        if clean_name.lower().endswith(".json"):
            try:
                parsed = json.loads(content)
                if not isinstance(parsed, dict) or parsed.get("format") != "anima_character_v2" or not isinstance(parsed.get("tags"), list):
                    raise ValueError("v2プリセットではありません")
                if len(parsed["tags"]) > 1000:
                    raise ValueError("タグ数が上限を超えています")
                categories = {"identity", "face", "hair", "body", "upper", "waist", "lower", "legs", "hands", "accessories", "expression", "pose", "other"}
                for i, tag in enumerate(parsed["tags"]):
                    if not isinstance(tag, dict) or not isinstance(tag.get("text"), str) or not tag["text"].strip() or tag.get("category") not in categories:
                        raise ValueError(f"タグ {i + 1} の内容または分類が不正です")
            except (ValueError, TypeError, AttributeError) as exc:
                return web.json_response({"success": False, "error": f"JSON形式エラー: {exc}"}, status=400)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"[AnimaCharacterExtractor] Character preset saved: {file_path}")
        return web.json_response({"success": True, "path": file_path, "filename": clean_name})
    except Exception as e:
        print(f"[AnimaCharacterExtractor] Save Error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


class AnimaCharacterExtractor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "character_prompt": ("STRING", {"multiline": True, "default": "", "label": "ここにキャラクタープロンプトを入力"}),
                "llm_provider": (
                    ["Ollama (Local)", "Gemini (Cloud)", "ChatGPT (OpenAI)"],
                    {"default": "Ollama (Local)"},
                ),
                "llm_api_key": ("STRING", {"default": ""}),
                "llm_model": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("missing_prompt",)
    OUTPUT_NODE = True
    FUNCTION = "extract_and_format"
    CATEGORY = "Anima"

    def unload_ollama(self, model_name):
        if not model_name:
            return
        try:
            url = "http://localhost:11434/api/generate"
            payload = {"model": model_name, "keep_alive": 0}
            requests.post(url, json=payload, timeout=5)
            print(f"[AnimaCharacterExtractor] Ollama model '{model_name}' unloaded from VRAM.")
        except Exception:
            pass

    def call_llm(self, sys_inst, provider, api_key, model_name, temp=0.2):
        if provider == "Gemini (Cloud)":
            raw_key = api_key if (api_key and api_key.strip()) else (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "")
            active_key = raw_key.strip().strip('"').strip("'").strip()

            if not active_key:
                raise ValueError("Gemini API Key is missing. Please set it in LLM Settings or as an environment variable (GEMINI_API_KEY or GOOGLE_API_KEY).")

            raw_model = model_name.strip() if model_name and model_name.strip() else "gemini-2.5-flash"
            clean_model = raw_model.replace("models/", "").strip()
            
            payload = {
                "contents": [{"parts": [{"text": sys_inst}]}],
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
                model=model_name.strip() if model_name and model_name.strip() else "gpt-4o-mini",
                messages=[{
                    "role": "system",
                    "content": "You are an expert anime prompt categorizer."
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
            self.unload_ollama(target_model)
            return prompt_result
        else:
            raise ValueError(f"未知のLLMプロバイダー: {provider}")

    META = {"1girl", "1boy", "solo", "masterpiece", "best quality", "amazing quality", "absurdres", "highres", "newest", "anime style", "very aesthetic"}
    CATEGORIES = ("identity", "face", "hair", "body", "upper", "waist", "lower", "legs", "hands", "accessories", "expression", "pose", "other")

    def split_tags(self, prompt):
        return [tag.strip() for tag in re.split(r"[,、\n]+", prompt) if tag.strip()]

    def category_hint(self, tag):
        t = tag.lower()
        checks = (
            ("expression", r"smil|laugh|cry|angry|frown|blush|surpris|expression|tears|grin|smirk|jitome"),
            ("pose", r"looking at|looking away|looking back|pose|sitting|standing|kneeling|running|walking|arms raised|hand on|holding |pointing|waving|reaching"),
            ("hands", r"glove|mitten|finger|fingernail|nail polish|prosthetic hand|bare hands|handwear"),
            ("hair", r"hair|ponytail|twintail|braid|bangs|sidelock|ahoge|bun|fringe|hairclip|hairpin"),
            ("body", r"\b(?:inner ears?|outer ears?|ear tips?|raccoon ears?|fox ears?|cat ears?|wolf ears?|tail|fur|horns?)\b"),
            ("face", r"eye|iris|pupil|eyelash|eyebrow|freckle|mouth|lip|fang|tooth|nose|\bear\b|\bears\b|horn|face|cheek"),
            ("legs", r"boot|shoe|sock|stocking|thighhigh|footwear|barefoot|ankle|leg warmer"),
            ("lower", r"skirt|pants|trouser|shorts|jeans|underwear|panties|leggings"),
            ("waist", r"belt|waist|pouch|holster|sheath|hip|corset"),
            ("upper", r"shirt|blouse|dress|jacket|coat|cloak|cape|robe|hood|collar|sleeve|sweater|vest|armor|breastplate|turtleneck|uniform|top|bra|ribbon|bowtie|necktie|scarf|innerwear|plain clothes"),
            ("body", r"skin|tan|pale|dark complexion|body|build|breast|chest|shoulder|arm|muscle|slim|curvy|height|tail|wing"),
            ("accessories", r"necklace|pendant|earring|bracelet|ring|choker|weapon|dagger|sword|staff|hat|crown|goggles|kunai"),
            ("identity", r"girl|boy|woman|man|fox|wolf|cat|raccoon|elf|demon|human|adult|teen|child"),
        )
        if re.search(r"\b(?:kunai|dagger|sword|pouch|holster)\b.*\b(?:waist|belt|hip)\b|\b(?:waist|belt|hip)\b.*\b(?:kunai|dagger|sword|pouch|holster)\b", t):
            return "waist"
        for category, pattern in checks:
            if re.search(pattern, t):
                return category
        return "other"

    def parse_assignments(self, raw, count):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
        data = json.loads(raw)
        rows = data.get("assignments") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            raise ValueError("assignmentsが配列ではありません")
        mapping = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                idx = int(row.get("id"))
            except (ValueError, TypeError):
                continue
            category = row.get("category")
            if 0 <= idx < count and category in self.CATEGORIES:
                mapping[idx] = category
        return mapping

    def extract_and_format(self, character_prompt, llm_provider, llm_api_key, llm_model):
        if not character_prompt.strip():
            return {"ui": {"formatted_text": [""]}, "result": ("",)}
        all_tags = self.split_tags(character_prompt)
        source_tags = [t for t in all_tags if t.casefold() not in self.META]
        if not source_tags:
            return {"ui": {"formatted_text": [""]}, "result": ("キャラクター特徴タグがありません",)}
        instruction = (
            "Classify each anime character prompt tag by its numeric ID. "
            "Never rewrite tags. Return ONLY JSON in the exact shape "
            "{\"assignments\":[{\"id\":0,\"category\":\"hair\"}]}. "
            "Include every ID once. Allowed categories: " + ", ".join(self.CATEGORIES) + ". "
            "Use expression for facial emotion, pose for temporary gestures or gaze, "
            "hands for handwear, hair for hairstyles, face for facial features, "
            "upper/lower/waist/legs for clothing and body for physical attributes. "
            "Do not infer any details not in the input.\n" +
            "\n".join(f"{i}: {tag}" for i, tag in enumerate(source_tags))
        )
        mapping = {}
        warning = ""
        try:
            response = self.call_llm(instruction, llm_provider, llm_api_key, llm_model, temp=0)
            mapping = self.parse_assignments(response, len(source_tags))
        except Exception as exc:
            warning = f"LLM分類に失敗したためルールベースで補完: {exc}"
        records = []
        for i, tag in enumerate(source_tags):
            category = mapping.get(i) or self.category_hint(tag)
            records.append({"id": i, "text": tag, "category": category})
        result = {
            "format": "anima_character_v2", "version": 2,
            "tags": records,
            "original_prompt": character_prompt,
        }
        output = json.dumps(result, ensure_ascii=False, indent=2)
        status = f"保持タグ {len(records)}/{len(source_tags)}・LLM分類 {len(mapping)}/{len(source_tags)}"
        if warning:
            status += "\n" + warning
        return {"ui": {"formatted_text": [output]}, "result": (status,)}

NODE_CLASS_MAPPINGS = {
    "AnimaCharacterExtractor": AnimaCharacterExtractor
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaCharacterExtractor": "Anima Character Extractor"
}