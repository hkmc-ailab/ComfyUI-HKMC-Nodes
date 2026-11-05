import os
import re
import json
import torch
import folder_paths
import nodes

class AnimaDatasetStacker:
    """
    LoRA / RefMod 用素材を連番生成する独立スタッカーノード
    後ろ姿・斜め後ろ時の肌色保護、振り向き・瞳の完全抑止、前後逆転防止を自動適用
    顔タブでの7種表情バリエーションに対応
    """

    ANGLES = [
        {"id": "front", "name": "正面", "tag": "front view, straight-on perspective, character facing forward", "is_back": False},
        {"id": "front_left", "name": "左斜前", "tag": "front three-quarter view, viewed from the character's front-left at 45 degrees, face visible", "is_back": False},
        {"id": "left", "name": "左向き", "tag": "left-facing side view, left profile, nose pointing left", "is_back": False},
        {"id": "back_left", "name": "左斜後", "tag": "rear three-quarter view, viewed from the character's back-left at 45 degrees, back of head and back visible", "is_back": True},
        {"id": "back", "name": "後ろ", "tag": "direct rear view, seen from behind, back of head and back visible", "is_back": True},
        {"id": "back_right", "name": "右斜後", "tag": "rear three-quarter view, viewed from the character's back-right at 45 degrees, back of head and back visible", "is_back": True},
        {"id": "right", "name": "右向き", "tag": "right-facing side view, right profile, nose pointing right", "is_back": False},
        {"id": "front_right", "name": "右斜前", "tag": "front three-quarter view, viewed from the character's front-right at 45 degrees, face visible", "is_back": False},
        {"id": "top", "name": "上から", "tag": "overhead view, seen from directly above, top-down perspective, bird's-eye view", "is_back": False},
        {"id": "bottom", "name": "下から", "tag": "worm's-eye view, seen from directly below, upward perspective, view from underneath", "is_back": False},
        {"id": "front_low", "name": "前斜下", "tag": "low-angle front view, upward perspective from the front", "is_back": False},
        {"id": "back_low", "name": "後斜下", "tag": "low-angle rear view, upward perspective from behind, rear of head and back visible", "is_back": True},
        {"id": "front_high", "name": "前斜上", "tag": "high-angle front view, downward perspective from the front", "is_back": False},
        {"id": "back_high", "name": "後斜上", "tag": "high-angle rear view, downward perspective from behind, rear of head and back visible", "is_back": True},
    ]

    SHOTS = {
        "full": {
            "name": "全身", 
            "tag": "full body", 
            "parts": {"head": True, "upper": True, "waist": True, "lower": True, "legs": True}
        },
        "upper": {
            "name": "上半身", 
            "tag": "upper body, cowboy shot", 
            "parts": {"head": True, "upper": True, "waist": True, "lower": False, "legs": False}
        },
        "face": {
            "name": "顔", 
            "tag": "tight head-and-shoulders close-up, face-dominant composition, framing strictly from the shoulders upward, only head neck and very top of shoulders visible, face filling most of the image, keep the exact garment type and neckline construction, preserve the original layering and sleeveless design, face dominant, shoulders cropped", 
            "parts": {"head": True, "upper": True, "waist": False, "lower": False, "legs": False}
        },
    }

    EXPRESSIONS = [
        {"id": "neutral", "name": "無表情", "tag": "expressionless, neutral expression, blank expression"},
        {"id": "smile", "name": "微笑み", "tag": "gentle smile, light smile, closed mouth, calm expression"},
        {"id": "laugh", "name": "笑い", "tag": "laughing, happy smile, open mouth, cheerful expression"},
        {"id": "cry", "name": "泣く", "tag": "crying, tears on face, weeping, sad expression"},
        {"id": "angry", "name": "怒る", "tag": "angry, angry expression, annoyed, furrowed brow"},
        {"id": "blush", "name": "赤面", "tag": "blushing, shy, embarrassed expression, flushed cheeks"},
        {"id": "surprised", "name": "驚く", "tag": "surprised, shock, wide eyes, slightly open mouth"},
    ]

    EXPRESSION_CONFLICT_FILTERS = [
        "smile", "smiling", "grin", "grinning", "smirk", "smirking", "laugh", "laughing", "cheerful",
        "cry", "crying", "tears", "weep", "weeping", "sad", "angry", "annoyed", "frown", "frowning",
        "blush", "blushing", "flushed", "shy", "embarrassed", "surprised", "shocked",
        "expressionless", "neutral expression", "blank expression"
    ]

    BACK_FILTERS = [
        "eye", "eyes", "pupil", "pupils", "iris", "mouth", "lip", "lips", "teeth", "tongue", "nose",
        "blush", "smile", "grin", "smirk", "expression", "looking at viewer", "looking away",
        "looking back", "looking over shoulder", "turning around", "head turned toward viewer",
        "front view", "facing front", "facing forward", "front-facing", "three-quarter front view",
        "visible face", "face visible", "eye contact", "bangs", "sidelocks", "cleavage", "breast",
        "breasts", "navel", "collarbone", "collarbones", "necklace", "pendant", "necktie", "bowtie"
    ]

    SKIN_KEYWORDS = [
        "sun-kissed tan skin", "sun-kissed skin", "light brown skin", "medium brown skin",
        "dark brown skin", "tanned skin", "dark skin", "brown skin", "olive skin",
        "light skin", "medium skin", "pale skin", "fair skin", "white skin", "tan skin",
        "skin tone", "skin color", "skin colour", "warm skin tone", "cool skin tone",
        "olive complexion", "pale complexion", "dark complexion", "fair complexion",
        "tan complexion", "tanned complexion", "tan", "tanned"
    ]

    @classmethod
    def get_character_files(cls):
        base_dir = os.path.join(os.path.dirname(__file__), "characters")
        os.makedirs(base_dir, exist_ok=True)
        files = []
        for f in os.listdir(base_dir):
            if f.endswith((".txt", ".json")):
                name = os.path.splitext(f)[0]
                if name.lower().startswith("anima_"):
                    files.append(name[6:])
                else:
                    files.append(name)
        return ["None"] + sorted(list(set(files)))

    @classmethod
    def INPUT_TYPES(cls):
        char_list = cls.get_character_files()
        
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "character_preset": (char_list, {"default": "None"}),
                "クオリティタグ、トリガーワード、ライティング等を入力": ("STRING", {"multiline": True, "default": ""}),
                "negative_prompt": ("STRING", {"multiline": True, "default": ""}),
                "current_index": ("INT", {"default": 0, "min": 0, "max": 999, "step": 1}),
                "selection_json": ("STRING", {"default": "{}", "multiline": False}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "positive", "negative", "prompt_text")
    FUNCTION = "generate_dataset_stack"
    CATEGORY = "Anima"

    def filter_back(self, text, is_back):
        if not is_back or not text:
            return text
        tags = [t.strip() for t in text.split(',') if t.strip()]
        filtered = []
        rescued_skins = []

        for tag in tags:
            tag_l = tag.lower()
            if any(re.search(r'\b' + re.escape(w) + r'\b', tag_l) for w in self.BACK_FILTERS):
                for sk in self.SKIN_KEYWORDS:
                    if re.search(r'\b' + re.escape(sk) + r'\b', tag_l):
                        if sk not in rescued_skins:
                            rescued_skins.append(sk)
                continue
            filtered.append(tag)

        if rescued_skins:
            filtered.extend(rescued_skins)
        unique_tags = []
        seen = set()
        for tag in filtered:
            key = tag.casefold()
            if key not in seen:
                seen.add(key)
                unique_tags.append(tag)

        return ", ".join(unique_tags)

    def filter_expression(self, text):
        if not text:
            return text
        tags = [t.strip() for t in text.split(',') if t.strip()]
        filtered = []
        for tag in tags:
            tag_l = tag.lower()
            if any(re.search(r'\b' + re.escape(w) + r'\b', tag_l) for w in self.EXPRESSION_CONFLICT_FILTERS):
                continue
            filtered.append(tag)
        return ", ".join(filtered)

    def parse_character(self, preset_name):
        if preset_name == "None":
            return {}
        char_dir = os.path.join(os.path.dirname(__file__), "characters")
        cands = [f"Anima_{preset_name}.json", f"anima_{preset_name}.json", f"{preset_name}.json", f"Anima_{preset_name}.txt", f"anima_{preset_name}.txt", f"{preset_name}.txt"]
        target = next((os.path.join(char_dir, c) for c in cands if os.path.exists(os.path.join(char_dir, c))), None)
        if not target:
            return {}
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        if target.lower().endswith(".json"):
            try:
                data = json.loads(content)
                if data.get("format") != "anima_character_v2":
                    raise ValueError("unsupported preset format")
                return {"__v2__": [row for row in data.get("tags", []) if isinstance(row, dict) and isinstance(row.get("text"), str)]}
            except (ValueError, TypeError, AttributeError) as exc:
                print(f"[AnimaDatasetStacker] Invalid preset {target}: {exc}")
                return {}
        sections = {}
        curr = "OTHER"
        for line in content.splitlines():
            ls = line.strip()
            if not ls: continue
            m = re.match(r"^\[([A-Z_\s]+)\]$", ls)
            if m:
                curr = m.group(1).upper()
                sections[curr] = []
            else:
                sections.setdefault(curr, []).append(ls)
        return {k: ", ".join(v) for k, v in sections.items()}

    @staticmethod
    def is_expression(tag):
        return bool(re.search(r"smil|laugh|cry|angry|frown|blush|surpris|expression|tears|grin|smirk|jitome", tag, re.I))

    @staticmethod
    def is_front_only(tag):
        return bool(re.search(r"\b(?:eyes?|iris|pupils?|mouth|lips?|teeth|tongue|nose|eyelashes|eyebrows|looking at viewer|looking back|looking over shoulder|cleavage|navel)\b", tag, re.I))

    @staticmethod
    def is_neckline(tag):
        return bool(re.search(r"^(?:[^,]*\b(?:collar|neckline|scarf|choker|neckwear|hood|shoulder|turtleneck|neck ribbon|bowtie|necktie)\b[^,]*)$", tag, re.I)) and not bool(re.search(r"blouse|shirt|dress|jacket|coat|corset|armor|sweater|robe|vest", tag, re.I))

    @staticmethod
    def is_head_body_trait(tag):
        return bool(re.search(r"skin|tan|pale|complexion|freckle", tag, re.I))

    @staticmethod
    def is_hand_or_arm_only(tag):
        return bool(re.search(r"\b(?:hands?|fingers?|gloves?|gauntlets?|wrists?|elbows?|forearms?|holding|gripping|arm pose)\b", tag, re.I)) and not bool(re.search(r"\b(?:sleeves?|sleeveless|no-sleeves|shoulders?|shirt|blouse|jacket|coat|robe|kimono|top|innerwear)\b", tag, re.I))

    @staticmethod
    def is_head_or_neck_accessory(tag):
        return bool(re.search(r"\b(?:ears?|ear tips?|horns?|headband|hairpin|hair ornament|hat|hood|mask|scarf|neck|collar|choker|ribbon|bowtie|necktie|earrings?|fur)\b", tag, re.I))

    def encode(self, clip, text):
        return nodes.CLIPTextEncode().encode(clip, text or " ")[0]

    def generate_dataset_stack(self, model, clip, character_preset, negative_prompt, current_index, selection_json, **kwargs):
        base_quality = kwargs.get("クオリティタグ、トリガーワード、ライティング等を入力", "").strip()

        try:
            sel = json.loads(selection_json)
        except Exception:
            sel = {}

        selected_tasks = []

        shot_sel = sel.get("full", {})
        for angle in self.ANGLES:
            if shot_sel.get(angle["id"], False):
                selected_tasks.append(("full", angle, None))

        shot_sel = sel.get("upper", {})
        for angle in self.ANGLES:
            if shot_sel.get(angle["id"], False):
                selected_tasks.append(("upper", angle, None))

        shot_sel = sel.get("face", {})
        expr_sel = sel.get("face_expressions", {})
        chosen_exprs = [e for e in self.EXPRESSIONS if expr_sel.get(e["id"], False)]

        for angle in self.ANGLES:
            if shot_sel.get(angle["id"], False):
                if chosen_exprs and not angle["is_back"]:
                    for expr in chosen_exprs:
                        selected_tasks.append(("face", angle, expr))
                else:
                    selected_tasks.append(("face", angle, None))

        if not selected_tasks:
            selected_tasks.append(("full", self.ANGLES[0], None))

        total_count = len(selected_tasks)
        parsed_char = self.parse_character(character_preset)

        def build_one(shot_key, angle_info, expr_info):
            is_back = angle_info["is_back"]
            shot_tag = ("tight rear head-and-shoulders close-up, framing strictly from the shoulders upward, back of head and nape visible, original outfit neckline and shoulder fabric preserved" if is_back and shot_key == "face" else self.SHOTS[shot_key]["tag"])
            parts = [base_quality, shot_tag, angle_info["tag"]]
            if expr_info and not is_back:
                parts.append(expr_info["tag"])
            if "__v2__" in parsed_char:
                categories = {
                    "full": {"identity", "face", "hair", "body", "upper", "waist", "lower", "legs", "hands", "accessories", "other"},
                    "upper": {"identity", "face", "hair", "body", "upper", "waist", "hands", "accessories", "other"},
                    "face": {"identity", "face", "hair", "body", "other", "waist", "lower"},
                }[shot_key]
                if shot_key == "face":
                    categories = categories | {"upper", "accessories"}
                for row in parsed_char["__v2__"]:
                    category = row.get("category", "other")
                    tag = row["text"].strip()
                    if not tag:
                        continue
                    if category not in categories:
                        continue
                    if category in ("expression", "pose"):
                        continue
                    if is_back and self.is_front_only(tag):
                        continue
                    if shot_key == "face" and category == "upper" and self.is_hand_or_arm_only(tag):
                        continue
                    if shot_key == "face" and category == "accessories" and not self.is_head_or_neck_accessory(tag):
                        continue
                    if shot_key == "face" and category == "body" and not (self.is_head_body_trait(tag) or re.search(r"ear|horn|fur", tag, re.I)):
                        continue
                    if shot_key == "face" and category == "lower" and not re.search(r"sleeve|top|innerwear|shirt|blouse|robe|jacket|kimono|ninja|uniform", tag, re.I):
                        continue
                    if shot_key == "face" and category == "waist" and not re.search(r"obi|sash|belt|waistband|kimono|ninja", tag, re.I):
                        continue
                    if shot_key == "face" and category == "other" and not re.search(r"ninja|uniform|kimono|clothes|clothing|outfit|style|sleeve|fabric|garment|traditional", tag, re.I):
                        continue
                    if shot_key == "face" and is_back and category == "body" and not re.search(r"ear|horn|fur|skin|hair", tag, re.I):
                        continue
                    parts.append(tag)
            else:
                char_map = [
                    (self.SHOTS[shot_key]["parts"]["head"], ["HEAD", "FACE", "HAIR"]),
                    (self.SHOTS[shot_key]["parts"]["upper"] and not (is_back and shot_key == "face"), ["UPPER", "BODY", "CHEST"]),
                    (self.SHOTS[shot_key]["parts"]["waist"] and not (is_back and shot_key == "face"), ["WAIST", "BELT"]),
                    (self.SHOTS[shot_key]["parts"]["lower"] and not (is_back and shot_key == "face"), ["LOWER", "SKIRT", "PANTS"]),
                    (self.SHOTS[shot_key]["parts"]["legs"] and not (is_back and shot_key == "face"), ["LEGS", "FEET", "SHOES"]),
                ]
                for enabled, keys in char_map:
                    if enabled:
                        for key in keys:
                            if key in parsed_char:
                                for tag in parsed_char[key].split(","):
                                    tag = tag.strip()
                                    if not tag:
                                        continue
                                    if expr_info and self.is_expression(tag):
                                                        continue
                                    if is_back and self.is_front_only(tag):
                                                        continue
                                    parts.append(tag)
            if is_back:
                parts.extend(["rear view", "character facing away from viewer", "back of head visible", "face occluded"])
            unique = []
            seen = set()
            for part in parts:
                for tag in part.split(","):
                    tag = tag.strip()
                    if tag and tag.casefold() not in seen:
                        seen.add(tag.casefold())
                        unique.append(tag)
            return ", ".join(unique)

        neg_parts = []
        if negative_prompt.strip():
            neg_parts.append(negative_prompt.strip())

        idx = current_index % total_count
        shot_key, angle_info, expr_info = selected_tasks[idx]
        is_back = angle_info["is_back"]

        if is_back:
            back_neg_blocks = (
                "looking back, looking over shoulder, head turned toward viewer, turning around, "
                "face visible, visible facial features, visible eyes, visible iris, visible pupils, "
                "front-facing head, three-quarter front view, front view, facing front, facing forward, "
                "looking at viewer, eye contact, eyelashes, eyebrows, nose, mouth, lips, teeth, smile, "
                "backward limbs, reversed hands, backward feet, twisted body"
            )
            neg_parts.append(back_neg_blocks)

        if shot_key == "face":
            neg_parts.append(
                "upper body shot, waist-up shot, medium shot, cowboy shot, full body, "
                "torso visible, chest visible, abdomen visible, waist visible, hips visible, "
                "legs visible, wide framing, zoomed out, extra clothing layers, redesigned outfit"
            )

        neg_parts.append("camera, camera lens, photography equipment")

        full_neg = ", ".join(neg_parts)
        pos_text = build_one(shot_key, angle_info, expr_info)
        return (model, clip, self.encode(clip, pos_text), self.encode(clip, full_neg), pos_text)


NODE_CLASS_MAPPINGS = {
    "AnimaDatasetStacker": AnimaDatasetStacker
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaDatasetStacker": "Anima Dataset Stacker"
}