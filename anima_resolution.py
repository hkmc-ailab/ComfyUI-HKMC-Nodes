import json
import torch
from pathlib import Path

PRESET_FILE = Path(__file__).parent / "presets.json"

with open(PRESET_FILE, "r", encoding="utf-8-sig") as f:
    PRESETS = json.load(f)


class AnimaResolutionSelector:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Preset", "Custom"],),
                "preset": (list(PRESETS.keys()),),
                "custom_width": ("INT", {"default": 1024, "min": 64, "max": 16384}),
                "custom_height": ("INT", {"default": 1280, "min": 64, "max": 16384}),
                "hires_scale": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 8.0, "step": 0.05}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64}),
            }
        }

    RETURN_TYPES = ("INT", "INT", "INT", "INT", "LATENT", "STRING")
    RETURN_NAMES = ("width", "height", "hires_width", "hires_height", "latent", "info")

    FUNCTION = "calculate"
    CATEGORY = "Anima"

    def calculate(self, mode, preset, custom_width, custom_height, hires_scale, batch_size):

        if mode == "Preset":
            width, height = PRESETS[preset]
            source = preset
        else:
            width = custom_width
            height = custom_height
            source = "Custom"

        hires_width = round(width * hires_scale / 8) * 8
        hires_height = round(height * hires_scale / 8) * 8

        latent = {
            "samples": torch.zeros([batch_size, 4, height // 8, width // 8])
        }

        info = (
            f"Source: {source}\n"
            f"Base: {width} x {height}\n"
            f"Hires Scale: {hires_scale}\n"
            f"Hires: {hires_width} x {hires_height}\n"
            f"Batch Size: {batch_size}"
        )

        return (width, height, hires_width, hires_height, latent, info)


NODE_CLASS_MAPPINGS = {
    "AnimaResolutionSelector": AnimaResolutionSelector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaResolutionSelector": "Anima Resolution Selector"
}