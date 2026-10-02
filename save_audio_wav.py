import os
import torchaudio
import folder_paths

class SaveAudioWav:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "filename_prefix": ("STRING", {"default": "audio/ComfyUI"}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save_audio"
    OUTPUT_NODE = True
    CATEGORY = "audio"

    def save_audio(self, audio, filename_prefix="audio/ComfyUI"):
        full_output_folder, filename, counter, subfolder, filename_prefix = \
            folder_paths.get_save_image_path(filename_prefix, self.output_dir)

        results = list()
        waveform = audio["waveform"]
        sample_rate = audio["sample_rate"]

        if waveform.dim() == 3:
            for batch_num in range(waveform.shape[0]):
                single_wave = waveform[batch_num].cpu()
                file_name = f"{filename}_{counter:05}_.wav"
                file_path = os.path.join(full_output_folder, file_name)
                
                torchaudio.save(file_path, single_wave, sample_rate, encoding="PCM_S", bits_per_sample=16)
                
                results.append({
                    "filename": file_name,
                    "subfolder": subfolder,
                    "type": self.type
                })
                counter += 1
        else:
            single_wave = waveform.cpu()
            file_name = f"{filename}_{counter:05}_.wav"
            file_path = os.path.join(full_output_folder, file_name)
            torchaudio.save(file_path, single_wave, sample_rate, encoding="PCM_S", bits_per_sample=16)
            results.append({
                "filename": file_name,
                "subfolder": subfolder,
                "type": self.type
            })

        return {"ui": {"audio": results}}

NODE_CLASS_MAPPINGS = {
    "SaveAudioWav": SaveAudioWav
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveAudioWav": "Save Audio (WAV)"
}