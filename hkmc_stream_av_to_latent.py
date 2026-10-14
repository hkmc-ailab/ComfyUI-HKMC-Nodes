"""
HKMC Latent AV Merger
Replaces the heavyweight decoding/VHS encoding with a pure Latent-space concatenator.
Fixed clean 10 extension inputs (no flickering on load).
Licensed under Apache-2.0
"""

import logging
import torch
import comfy.nested_tensor
import nodes

_LOG = logging.getLogger("HKMC_Nodes.latent_merge")

FPS = 24.0
AUDIO_HZ = 40.0
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)

def _pixel_frames(latent_t):
    return sum(FRAME_PER_TOKEN[k % 5] for k in range(int(latent_t)))

def _streams_from_latent(latent):
    samples = latent["samples"]
    if hasattr(samples, "unbind"):
        parts = list(samples.unbind())
    elif isinstance(samples, (tuple, list)):
        parts = list(samples)
    else:
        raise ValueError("HKMC_Node: expected a MiniMax H3 AV latent")
    
    video, audio = parts[0], parts[1]
    if video.ndim == 4:
        video = video.unsqueeze(0)
    if audio.ndim == 3:
        audio = audio.unsqueeze(0)
    return video, audio

def largest_h3_video_run(frames):
    runs = [5 + 17 * i for i in range(100)]
    valid_runs = [r for r in runs if r <= frames]
    return max(valid_runs) if valid_runs else 0

def is_exact_av_boundary(run):
    return run in [39, 90, 141, 192, 243, 294, 345, 396, 447, 498, 549, 600]

def _snap_context_length(requested, available, target_frames):
    cap = min(int(requested), int(available), int(target_frames))
    run = largest_h3_video_run(cap)
    while run >= 5 and not is_exact_av_boundary(run):
        run = largest_h3_video_run(run - 1)
    if run < 39:
        _LOG.warning(f"HKMC_Node: Warning: Available context {run} is below 39 frames. Forcing 39.")
        run = 39 
    return run

def _get_multiref_node_class():
    target_node_name = "MiniMaxH3StreamLiveExtensionAVToVHS"
    if target_node_name not in nodes.NODE_CLASS_MAPPINGS:
        raise RuntimeError(f"HKMC_Node: 本家のノード '{target_node_name}' が見つかりません。")
    return nodes.NODE_CLASS_MAPPINGS[target_node_name]

BaseClass = _get_multiref_node_class()

class HKMC_H3StreamLiveExtensionAVToLatent(BaseClass):
    """
    Pure Latent-space merger for MiniMax H3 AV extensions.
    Skips decoding and VHS output entirely.
    Fixed clean 10 extension inputs.
    """
    MAX_EXTENSIONS = 10

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "video_vae": ("VAE",),
            "audio_vae": ("VAE",),
            "start_mode": ("STRING", {"forceInput": True}),
            "context_frames": ("INT", {"default": 39, "min": 5, "max": 999}),
            "video_overlap_frames": ("INT", {"default": 39}),
            "source_fps": ("FLOAT", {"default": 24.0}),
            "crop": (["disabled", "center"], {"default": "disabled"}),
        }

        optional = {
            "starter_latent": ("LATENT", {"lazy": True}),
            "source_frames": ("IMAGE", {"lazy": True}),
            "source_audio": ("AUDIO", {"lazy": True}),
            "preview_gate": ("VHS_FILENAMES", {"lazy": True}),
            "active_extensions": ("INT", {"forceInput": True}),
        }

        for i in range(1, cls.MAX_EXTENSIONS + 1):
            optional[f"extension_{i}"] = ("LATENT", {"lazy": True})

        return {
            "required": required,
            "optional": optional,
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("VHS_FILENAMES", "LATENT", "AUDIO")
    RETURN_NAMES = ("Filenames", "merged_latent", "merged_audio")
    FUNCTION = "merge_latents"
    CATEGORY = "MiniMax_H3/HKMC"

    def check_lazy_status(self, *args, **kwargs):
        needed = []
        if "preview_gate" in kwargs and kwargs["preview_gate"] is None:
            return ["preview_gate"]

        if "starter_latent" in kwargs and kwargs["starter_latent"] is None:
            needed.append("starter_latent")

        for i in range(1, self.MAX_EXTENSIONS + 1):
            name = f"extension_{i}"
            if name in kwargs and kwargs[name] is None:
                needed.append(name)
        return needed

    def merge_latents(
        self,
        video_vae,
        audio_vae,
        start_mode,
        context_frames=39,
        video_overlap_frames=39,
        source_fps=24.0,
        crop="disabled",
        source_frames=None,
        source_audio=None,
        starter_latent=None,
        preview_gate=None,
        active_extensions=None,
        **kwargs
    ):
        if starter_latent is None:
            raise ValueError("HKMC_Node: starter_latent (ベース生成) が接続されていません。")

        extension_latents = []
        for i in range(1, self.MAX_EXTENSIONS + 1):
            name = f"extension_{i}"
            if name in kwargs and kwargs[name] is not None:
                extension_latents.append(kwargs[name])

        if not extension_latents:
            _LOG.warning("HKMC_Node: クリップが1つも届いていません。ベースのLatentをそのまま返します。")
            return ([], starter_latent, None)

        _LOG.info(f"HKMC_Node: ベース生成と {len(extension_latents)} 個のクリップをLatent空間で結合します...")

        base_video, base_audio = _streams_from_latent(starter_latent)
        merged_video = base_video.clone()
        merged_audio = base_audio.clone()

        current_frames = _pixel_frames(int(merged_video.shape[2]))

        for i, ext_latent in enumerate(extension_latents):
            ext_video, ext_audio = _streams_from_latent(ext_latent)
            ext_frames = _pixel_frames(int(ext_video.shape[2]))
            
            n = _snap_context_length(context_frames, current_frames, ext_frames)

            video_steps = 2 + 5 * ((n - 5) // 17)
            audio_steps = int(round(n / FPS * AUDIO_HZ))

            tail_video = ext_video[:, :, video_steps:, :, :]
            tail_audio = ext_audio[:, :, :, audio_steps:]

            merged_video = torch.cat([merged_video, tail_video], dim=2)
            merged_audio = torch.cat([merged_audio, tail_audio], dim=3)

            current_frames += (ext_frames - n)

        final_latent = starter_latent.copy()
        final_latent["samples"] = comfy.nested_tensor.NestedTensor((merged_video, merged_audio))

        video_mask = torch.zeros(
            (1, 1, int(merged_video.shape[2]), int(merged_video.shape[3]), int(merged_video.shape[4])),
            device=merged_video.device, dtype=torch.float32
        )
        audio_mask = torch.zeros(
            (1, 1, int(merged_audio.shape[2]), int(merged_audio.shape[3])),
            device=merged_audio.device, dtype=torch.float32
        )
        final_latent["noise_mask"] = comfy.nested_tensor.NestedTensor((video_mask, audio_mask))

        _LOG.info(f"HKMC_Node: 長尺Latentの結合に成功しました。総フレーム数: {current_frames}")
        
        return ([], final_latent, None)

NODE_CLASS_MAPPINGS = {
    "HKMC_H3StreamLiveExtensionAVToLatent": HKMC_H3StreamLiveExtensionAVToLatent,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "HKMC_H3StreamLiveExtensionAVToLatent": "HKMC H3 Latent AV Merger",
}