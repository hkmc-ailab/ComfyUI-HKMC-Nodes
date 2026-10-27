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
        {"id": "front", "name": "正面", "tag": "front view, camera directly in front of the character, character facing the camera", "is_back": False},
        {"id": "front_left", "name": "左斜前", "tag": "front three-quarter view, camera in front of the character and 45 degrees to the character's left, face visible", "is_back": False},
        {"id": "left", "name": "左向き", "tag": "left-facing side view, camera at the character's left side, left profile, nose pointing left", "is_back": False},
        {"id": "back_left", "name": "左斜後", "tag": "rear three-quarter view, camera behind the character at 45 degrees to the character's left, back of head and back visible", "is_back": True},
        {"id": "back", "name": "後ろ", "tag": "direct rear view, camera directly behind the character, back of head and back visible", "is_back": True},
        {"id": "back_right", "name": "右斜後", "tag": "rear three-quarter view, camera behind the character at 45 degrees to the character's right, back of head and back visible", "is_back": True},
        {"id": "right", "name": "右向き", "tag": "right-facing side view, camera at the character's right side, right profile, nose pointing right", "is_back": False},
        {"id": "front_right", "name": "右斜前", "tag": "front three-quarter view, camera in front of the character and 45 degrees to the character's right, face visible", "is_back": False},
        {"id": "top", "name": "上から", "tag": "overhead view, camera directly above the character looking down, top-down view, bird's-eye view", "is_back": False},
        {"id": "bottom", "name": "下から", "tag": "worm's-eye view, camera directly below the character looking upward, view from underneath", "is_back": False},
        {"id": "front_low", "name": "前斜下", "tag": "low-angle front view, camera below and in front of the character looking upward", "is_back": False},
        {"id": "back_low", "name": "後斜下", "tag": "low-angle rear view, camera behind and below the character looking upward, rear of head and back visible", "is_back": True},
        {"id": "front_high", "name": "前斜上", "tag": "high-angle front view, camera above and in front of the character looking downward", "is_back": False},
        {"id": "back_high", "name": "後斜上", "tag": "high-angle rear view, camera above and behind the character looking downward, rear of head and back visible", "is_back": True},
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
            "tag": "extreme close-up, close-up face focus, detailed face portrait, face centered", 
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
        "front view", "facing front", "facing camera", "front-facing", "three-quarter front view",
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
            if f.endswith(".txt"):
                name = f[:-4]
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
        cands = [f"Anima_{preset_name}.txt", f"{preset_name}.txt"]
        target = next((os.path.join(char_dir, c) for c in cands if os.path.exists(os.path.join(char_dir, c))), None)
        if not target:
            return {}
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

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
            shot_info = self.SHOTS[shot_key]
            is_back = angle_info["is_back"]
            
            if is_back and shot_key == "face":
                shot_tag = "close-up of the back of the head, rear head close-up, hair silhouette and nape of neck visible"
            else:
                shot_tag = shot_info["tag"]

            parts = [base_quality, shot_tag, angle_info["tag"]]

            if expr_info and not is_back:
                parts.append(expr_info["tag"])

            char_map = [
                (shot_info["parts"]["head"], ["HEAD", "FACE", "HAIR"]),
                (shot_info["parts"]["upper"] and not (is_back and shot_key == "face"), ["UPPER", "BODY", "CHEST"]),
                (shot_info["parts"]["waist"] and not (is_back and shot_key == "face"), ["WAIST", "BELT"]),
                (shot_info["parts"]["lower"] and not (is_back and shot_key == "face"), ["LOWER", "SKIRT", "PANTS"]),
                (shot_info["parts"]["legs"] and not (is_back and shot_key == "face"), ["LEGS", "FEET", "SHOES"]),
            ]
            for enabled, tags in char_map:
                if enabled:
                    found = [parsed_char[t] for t in tags if t in parsed_char and parsed_char[t]]
                    if found:
                        tag_text = ", ".join(found)
                        if expr_info and not is_back:
                            tag_text = self.filter_expression(tag_text)
                        parts.append(tag_text)
            
            combined = ", ".join([p for p in parts if p.strip()])
            filtered = self.filter_back(combined, is_back)
            
            if is_back:
                filtered += (
                    ", rear view, camera behind the character, character facing away from the camera, "
                    "back of head visible, face turned completely away, facial features fully occluded, "
                    "no visible eyes, no visible irises, no visible pupils, no looking over shoulder"
                )
                combined_lower = combined.lower()

                if "tail" in combined_lower:
                    filtered += ", tail from lower back"

                if any(k in combined_lower for k in ["twintail", "twin tail", "two tails", "twin braid"]):
                    filtered += ", twintails from behind, two separate hair tails visible from behind"
                elif any(k in combined_lower for k in ["side ponytail", "side-ponytail", "side tail"]):
                    filtered += ", side ponytail visible from behind, hair gathered and tied to one side"
                elif any(k in combined_lower for k in ["ponytail", "pony tail", "tied back", "all back hair tied"]):
                    filtered += ", ponytail from behind, distinct ponytail hanging down the back, hair tie at back"
                elif any(k in combined_lower for k in ["hair bun", "buns", "chignon", "topknot"]):
                    filtered += ", hair bun at the back of head, bun visible from behind"
                elif any(k in combined_lower for k in ["braid", "braided", "plait"]):
                    filtered += ", single braid hanging down the back, visible braided texture from behind"
                elif any(k in combined_lower for k in ["half updo", "half-up", "half up"]):
                    filtered += ", half updo tied at the back, gathered upper hair with remaining hair flowing down"
                elif any(k in combined_lower for k in ["short hair", "pixie cut", "buzz cut"]) and "long" not in combined_lower:
                    filtered += ", short hair at the back, exposed nape of neck, short neckline hair"
            
            clean_text = re.sub(r'#.*', '', filtered).replace('\n', ' ')
            clean_text = re.sub(r',\s*,+', ',', clean_text).strip(' ,')
            return clean_text

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
                "front-facing head, three-quarter front view, front view, facing front, facing camera, "
                "looking at viewer, eye contact, eyelashes, eyebrows, nose, mouth, lips, teeth, smile, "
                "backward limbs, reversed hands, backward feet, twisted body"
            )
            neg_parts.append(back_neg_blocks)

        full_neg = ", ".join(neg_parts)
        neg_cond = self.encode(clip, full_neg)

        pos_text = build_one(shot_key, angle_info, expr_info)
        pos_cond = self.encode(clip, pos_text)

        return (model, clip, pos_cond, neg_cond, pos_text)

NODE_CLASS_MAPPINGS = {
    "AnimaDatasetStacker": AnimaDatasetStacker
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaDatasetStacker": "Anima Dataset Stacker"
}