import json

def format_directives(design_data_json):
    if not design_data_json:
        return ""
    try:
        data = json.loads(design_data_json) if isinstance(design_data_json, str) else design_data_json
    except Exception:
        data = {"low": [], "mid": [], "high": [], "transition": []}

    lines = ["[MUSIC VIDEO DYNAMIC DIRECTIVES]"]
    lines.append("STRICT RULE: Apply the following stylistic rules based on the audio energy level of each clip:")

    sections = [
        ("low", "LOW ENERGY (Quiet, Intro, Outro)"),
        ("mid", "MID ENERGY (Standard Vocal, Build-up)"),
        ("high", "HIGH ENERGY (Chorus, Climax, Drops)"),
        ("transition", "TRANSITION POINT (Beat Drop, Section Change)")
    ]

    has_any = False
    for key, label in sections:
        items = data.get(key, [])
        if items:
            has_any = True
            lines.append(f"\nWhen the audio energy is {label}:")
            for item in items:
                lines.append(f"- {item}")
    
    if not has_any:
        return ""

    return "\n".join(lines)


class H3DesignDirector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "design_data_json": ("STRING", {"default": '{"low":[],"mid":[],"high":[],"transition":[]}'}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("design_directives",)
    FUNCTION = "build_directives"
    CATEGORY = "MiniMax_H3"

    def build_directives(self, design_data_json):
        result = format_directives(design_data_json)
        return (result,)

NODE_CLASS_MAPPINGS = {
    "H3DesignDirector": H3DesignDirector
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "H3DesignDirector": "H3 Design Director"
}