import os
import random
import folder_paths
import torch

class H3MetaSeed(int):
    def __new__(cls, value, save_latent=False):
        obj = super().__new__(cls, value)
        obj.save_latent = save_latent
        return obj

class H3SeedHub:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"clip_control": ("H3_CLIP_CONTROL",)}}

    RETURN_TYPES = tuple(["INT"] * 64)
    RETURN_NAMES = tuple([f"seed_{i}" for i in range(1, 65)])
    FUNCTION = "dispatch"
    CATEGORY = "MiniMax_H3/Utilities"

    def dispatch(self, clip_control):
        settings = clip_control.get("cache_settings", {})
        out = []
        for i in range(1, 65):
            c_info = settings.get(str(i), {})
            seed_val = int(c_info.get("seed", -1))
            save_latent = bool(c_info.get("save_latent", False))
            
            if seed_val == -1:
                seed_val = random.randint(1, 1125899906842624)
                save_latent = False
                
            meta_seed = H3MetaSeed(seed_val, save_latent=save_latent)
            out.append(meta_seed)
        return tuple(out)

class H3LatentCacher:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"forceInput": True}),
                "clip_index": ("INT", {"default": 1, "min": 1, "max": 64}),
            },
            "optional": {
                "latent": ("LATENT", {"lazy": True}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "process"
    CATEGORY = "MiniMax_H3/Utilities"

    def check_lazy_status(self, seed, clip_index, latent=None):
        seed_val = int(seed)
        save_latent = getattr(seed, "save_latent", False)
        
        cache_dir = os.path.join(folder_paths.get_output_directory(), "h3_latents")
        file_path = os.path.join(cache_dir, f"clip{clip_index}_seed{seed_val}.pt")

        if save_latent and os.path.exists(file_path):
            return []
        
        return ["latent"]

    def process(self, seed, clip_index, latent=None):
        seed_val = int(seed)
        save_latent = getattr(seed, "save_latent", False)
        
        cache_dir = os.path.join(folder_paths.get_output_directory(), "h3_latents")
        os.makedirs(cache_dir, exist_ok=True)
        file_path = os.path.join(cache_dir, f"clip{clip_index}_seed{seed_val}.pt")

        if save_latent and os.path.exists(file_path):
            print(f"[H3 Latent Cacher] 🟢 Cache HIT for Clip {clip_index} (Seed: {seed_val}) - Sampler completely SKIPPED!")
            try:
                loaded_latent = torch.load(file_path, weights_only=False)
                return (loaded_latent, )
            except Exception as e:
                print(f"[H3 Latent Cacher] ⚠️ Failed to load cache: {e}")

        if latent is not None:
            if save_latent and not os.path.exists(file_path):
                try:
                    torch.save(latent, file_path)
                    print(f"[H3 Latent Cacher] 💾 Saved new cache for Clip {clip_index} (Seed: {seed_val})")
                except Exception as e:
                    print(f"[H3 Latent Cacher] ⚠️ Failed to save cache: {e}")
            return (latent, )

        return ({"samples": torch.zeros((1, 4, 8, 8))}, )

class H3LatentLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"seed": ("INT", {"forceInput": True}), "clip_index": ("INT", {"default": 1})}}
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "process"
    CATEGORY = "MiniMax_H3/Utilities"
    def process(self, seed, clip_index):
        return ({"samples": torch.zeros((1, 4, 8, 8))}, )

NODE_CLASS_MAPPINGS = {
    "H3SeedHub": H3SeedHub,
    "H3LatentCacher": H3LatentCacher,
    "H3LatentLoader": H3LatentLoader,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "H3SeedHub": "H3 Seed Hub (Seed一括分配)",
    "H3LatentCacher": "H3 Latent Cacher (自動キャッシュ＆スキップ)",
    "H3LatentLoader": "H3 Latent Loader (不要)",
}