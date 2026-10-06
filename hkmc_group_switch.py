class HKMCGroupSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "enabled": (
                    "BOOLEAN",
                    {"default": True, "description": "Master toggle to activate or deactivate the switch."},
                ),
                "trigger_on": (
                    ["true \u2192 active", "false \u2192 active"],
                    {"default": "true \u2192 active", "description": "Define if the switch is active when the boolean is True or False."},
                ),
                "action": (
                    ["mute", "bypass"],
                    {"default": "mute", "description": "Choose whether to Mute (stop execution) or Bypass (pass through) targets."},
                ),
                "title_pattern": (
                    "STRING",
                    {"default": "■クリップ生成", "multiline": False, "description": "Target group title substring to match."},
                ),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("enabled_out",)
    FUNCTION = "execute"
    CATEGORY = "HKMC/utils"
    OUTPUT_NODE = False

    def execute(self, enabled, trigger_on, action, title_pattern, unique_id=None, **kwargs):
        return (bool(enabled),)

NODE_CLASS_MAPPINGS = {
    "HKMCGroupSwitch": HKMCGroupSwitch
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "HKMCGroupSwitch": "HKMC Group Switch"
}