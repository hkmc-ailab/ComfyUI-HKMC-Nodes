import os
import re
import requests
import google.generativeai as genai
from openai import OpenAI
from server import PromptServer
from aiohttp import web

# charactersフォルダへ保存するためのAPI
@PromptServer.instance.routes.post("/anima/save_character")
async def save_character_file(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        content = data.get("content", "").strip()

        if not filename:
            return web.json_response({"success": False, "error": "ファイル名が空です。"}, status=400)

        # HKMC-Nodes/characters フォルダをデフォルト保存先に指定
        base_dir = os.path.join(os.path.dirname(__file__), "characters")
        os.makedirs(base_dir, exist_ok=True)

        clean_name = re.sub(r'[\\/*?:"<>|]', "", filename)
        if not clean_name.lower().endswith(".txt"):
            clean_name = f"{clean_name}.txt"

        file_path = os.path.join(base_dir, clean_name)
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
                # AnimaPromptDirectorの出力ピン "llm_context" を接続
                "llm_context": ("LLM_CONTEXT",),
                "character_prompt": ("STRING", {"multiline": True, "default": "", "label": "ここにキャラクタープロンプトを入力"}),
            }
        }

    # ★ ShowTextへ不足タグを出力するピンを追加
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("missing_prompt",)
    OUTPUT_NODE = True
    FUNCTION = "extract_and_format"
    CATEGORY = "Anima"

    def unload_ollama(self, model_name):
        try:
            url = "http://localhost:11434/api/generate"
            payload = {
                "model": model_name.strip() or "llama3",
                "keep_alive": 0
            }
            requests.post(url, json=payload, timeout=5)
            print(f"[AnimaCharacterExtractor] Ollama model '{model_name}' unloaded from VRAM.")
        except Exception:
            pass

    def find_missing_tags(self, input_prompt, output_text):
        """元プロンプトと変換後を比較し、落ちたタグを抽出する"""
        if not input_prompt.strip() or not output_text.strip():
            return ""

        # 自動除外する一般的なメタタグ・品質タグ
        ignore_meta = {
            "1girl", "1boy", "solo", "anime style", "cel-shaded", "crisp outlines",
            "masterpiece", "best quality", "amazing quality", "very aesthetic",
            "absurdres", "newest", "highres", "official art", "depth of field",
            "score_9", "score_8", "score_7", "score_6", "score_5", "score_4", "score_3", "score_2", "score_1",
            "year 2024", "year 2025", "year 2026", "__quality__"
        }

        # カンマまたは改行でタグを分割
        raw_tags = re.split(r'[,、\n]+', input_prompt)
        cleaned_tags = []
        for t in raw_tags:
            # 括弧 ( ) [ ] や引用符を除去
            clean_t = re.sub(r'^[(\[\{<"\']+\vert{}[)\]\}>"\']+$', '', t.strip()).strip()
            # 重み係数 :1.2 等を除去
            clean_t = re.sub(r':\d+(\.\d+)?$', '', clean_t).strip()

            if not clean_t:
                continue
            if clean_t.lower() in ignore_meta:
                continue
            if clean_t not in cleaned_tags:
                cleaned_tags.append(clean_t)

        output_lower = output_text.lower()
        missing_list = []

        for tag in cleaned_tags:
            tag_lower = tag.lower()
            # 変換後のテキストに含まれていないタグを検出
            if tag_lower not in output_lower:
                missing_list.append(tag)

        if not missing_list:
            return "✅ 不足タグなし（すべて保持されています）"

        return ", ".join(missing_list)

    def extract_and_format(self, llm_context, character_prompt):
        if not character_prompt.strip():
            return {"ui": {"formatted_text": [""]}, "result": ("",)}

        provider = llm_context.get("provider", "None (Raw Tag)")
        api_key = llm_context.get("api_key", "")
        model_name = llm_context.get("model", "gemini-2.5-flash")

        system_instruction = (
            "You are a strict, exhaustive data-sorting engine for image prompts.\n"
            "Your ONLY task is to categorize EVERY character detail tag into the 5 body sections without losing ANY information.\n\n"
            "【CRITICAL RETENTION RULES - ZERO LOSS OF DETAIL】\n"
            "1. NEVER summarize, delete, or omit tags. Keep EVERY single piece of apparel, gear, and feature.\n"
            "2. Outerwear retention is MANDATORY: You MUST keep all cloaks, capes, hooded cloaks, robes, and ponchos. (e.g., 'deep green hooded cloak, green cloak' MUST be placed in [UPPER], even if innerwear is sleeveless).\n"
            "3. Handwear & Qualifiers: You MUST keep gloves (fingerless leather gloves), bare skin, and negative qualifiers ('no socks', 'barefoot').\n"
            "4. Drop ONLY non-character meta tags: count ('1girl', 'solo'), art style ('anime style'), and quality tags ('masterpiece', 'absurdres'). Keep everything else.\n\n"
            "【BODY PART MAPPING DEFINITIONS】\n"
            "- [HEAD]: Hair, face, eyes, gaze/expression (jitome), skin tone (tan, pale), ears/horns, headwear, neckwear (scarf, necklace).\n"
            "- [UPPER]: Torso build (curvy build, large breasts), outerwear (cloak, deep green hooded cloak, cape), tops (sleeveless turtleneck, shirts, cuirass, armor), arms, and hands/gloves (fingerless leather gloves, prosthetics).\n"
            "- [WAIST]: Belts, pouches (thigh pouch, several leather pouches), holsters, sheathed daggers/weapons.\n"
            "- [LOWER]: Shorts, pants, skirts, underwear.\n"
            "- [LEGS]: Boots, shoes, socks/stockings, and foot qualifiers ('tightly laced around ankles', 'no socks', 'barefoot').\n\n"
            "【OUTPUT FORMAT】\n"
            "[HEAD]\n"
            "(comma-separated tags)\n\n"
            "[UPPER]\n"
            "(comma-separated tags)\n\n"
            "[WAIST]\n"
            "(comma-separated tags)\n\n"
            "[LOWER]\n"
            "(comma-separated tags)\n\n"
            "[LEGS]\n"
            "(comma-separated tags)\n\n"
            "Output ONLY the 5 section headers and comma-separated tags. Do NOT output markdown code blocks (```) or greetings."
        )

        formatted_result = ""
        try:
            if provider == "Gemini (Cloud)":
                key = api_key.strip() or os.getenv("GEMINI_API_KEY")
                if not key:
                    return {"ui": {"formatted_text": ["ERROR: GEMINI_API_KEY が設定されていません。"]}, "result": ("",)}
                genai.configure(api_key=key)
                m = genai.GenerativeModel(model_name.strip() or "gemini-2.5-flash")
                formatted_result = m.generate_content(f"{system_instruction}\n\n入力プロンプト:\n{character_prompt}").text.strip()

            elif provider == "ChatGPT (OpenAI)":
                key = api_key.strip() or os.getenv("OPENAI_API_KEY")
                if not key:
                    return {"ui": {"formatted_text": ["ERROR: OPENAI_API_KEY が設定されていません。"]}, "result": ("",)}
                client = OpenAI(api_key=key)
                res = client.chat.completions.create(
                    model=model_name.strip() or "gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": character_prompt}
                    ],
                    temperature=0.2
                )
                formatted_result = res.choices[0].message.content.strip()

            elif provider == "Ollama (Local)":
                url = "http://localhost:11434/api/chat"
                payload = {
                    "model": model_name.strip() or "llama3",
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": character_prompt}
                    ],
                    "stream": False,
                    "options": {"temperature": 0.2}
                }
                res = requests.post(url, json=payload, timeout=120)
                res.raise_for_status()
                formatted_result = res.json().get("message", {}).get("content", "").strip()
                self.unload_ollama(model_name)

            else:
                formatted_result = "ERROR: Director側で有効なLLMプロバイダーが選択されていません。"

        except Exception as e:
            print(f"[AnimaCharacterExtractor] LLM Error: {e}")
            formatted_result = f"Error during LLM extraction: {e}"
            if provider == "Ollama (Local)":
                self.unload_ollama(model_name)

        formatted_result = re.sub(r'^```[a-zA-Z]*\n', '', formatted_result)
        formatted_result = re.sub(r'\n```$', '', formatted_result).strip()

        # ★ 元プロンプトと変換後の差分を計算
        missing_result = self.find_missing_tags(character_prompt, formatted_result)

        return {
            "ui": {"formatted_text": [formatted_result]},
            "result": (missing_result,)
        }