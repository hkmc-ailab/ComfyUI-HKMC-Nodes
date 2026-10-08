import json

class HKMCClipPromptDispatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip_prompt": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = tuple(["STRING"] * 10)
    RETURN_NAMES = tuple([f"prompt_c{i}" for i in range(1, 11)])
    FUNCTION = "dispatch"
    CATEGORY = "HKMC/utils"

    def dispatch(self, clip_prompt):
        prompts = {str(i): "" for i in range(1, 11)}
        try:
            if clip_prompt and clip_prompt.strip():
                data = json.loads(clip_prompt)
                for k, v in data.items():
                    if k in prompts:
                        prompts[k] = v
        except Exception as e:
            print(f"[HKMC Clip Prompt Dispatcher] JSON Parse Error: {e}")
            
        return tuple(prompts[str(i)] for i in range(1, 11))

NODE_CLASS_MAPPINGS = {
    "HKMCClipPromptDispatcher": HKMCClipPromptDispatcher
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "HKMCClipPromptDispatcher": "HKMC Clip Prompt Dispatcher"
}