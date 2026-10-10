class ToH3Pipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "audio_vae": ("VAE",),
                "sampler": ("SAMPLER",),
                "sigmas": ("SIGMAS",),
                "width": ("INT", {"default": 1344, "min": 64, "max": 4096, "step": 32}),
                "height": ("INT", {"default": 768, "min": 64, "max": 4096, "step": 32}),
                "length": ("INT", {"default": 124, "min": 5, "max": 4096, "step": 17}),
            }
        }

    RETURN_TYPES = ("H3_PIPE",)
    RETURN_NAMES = ("h3_pipe",)
    FUNCTION = "pack_pipe"
    CATEGORY = "HKMC/H3_Pipe"

    def pack_pipe(self, model, clip, vae, audio_vae, sampler, sigmas, width, height, length):
        pipe = (model, clip, vae, audio_vae, sampler, sigmas, width, height, length)
        return (pipe,)


class FromH3Pipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "h3_pipe": ("H3_PIPE",),
            }
        }

    RETURN_TYPES = (
        "H3_PIPE",
        "MODEL",
        "CLIP",
        "VAE",
        "VAE",
        "SAMPLER",
        "SIGMAS",
        "INT",
        "INT",
        "INT",
    )
    RETURN_NAMES = (
        "h3_pipe",
        "model",
        "clip",
        "vae",
        "audio_vae",
        "sampler",
        "sigmas",
        "width",
        "height",
        "length",
    )
    FUNCTION = "unpack_pipe"
    CATEGORY = "HKMC/H3_Pipe"

    def unpack_pipe(self, h3_pipe):
        model, clip, vae, audio_vae, sampler, sigmas, width, height, length = h3_pipe
        return (
            h3_pipe,
            model,
            clip,
            vae,
            audio_vae,
            sampler,
            sigmas,
            width,
            height,
            length,
        )


class FromH3MediaPipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "media_pipe": ("H3_MEDIA_PIPE",),
            }
        }

    RETURN_TYPES = (
        "H3_MEDIA_PIPE",
        "IMAGE", "IMAGE",
        "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE",
        "IMAGE", "IMAGE",
        "AUDIO", "AUDIO", "AUDIO",
        "AUDIO", "AUDIO", # 追加: drive_audio, final_audio
    )
    RETURN_NAMES = (
        "media_pipe",
        "first_frame", "last_frame",
        "ref_image_0", "ref_image_1", "ref_image_2", "ref_image_3", "ref_image_4", "ref_image_5", "ref_image_6", "ref_image_7", "ref_image_8",
        "ref_video_0", "ref_video_1",
        "ref_audio_0", "ref_audio_1", "ref_audio_2",
        "drive_audio", "final_audio", # 追加
    )
    FUNCTION = "unpack_media_pipe"
    CATEGORY = "HKMC/H3_Pipe"

    def unpack_media_pipe(self, media_pipe):
        return (media_pipe,) + media_pipe


NODE_CLASS_MAPPINGS = {
    "ToH3Pipe": ToH3Pipe,
    "FromH3Pipe": FromH3Pipe,
    "FromH3MediaPipe": FromH3MediaPipe,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ToH3Pipe": "To H3 Pipe",
    "FromH3Pipe": "From H3 Pipe",
    "FromH3MediaPipe": "From H3 Media Pipe",
}