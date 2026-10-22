import os

WEB_DIRECTORY = "./web"

from .anima_prompt_director import AnimaPromptDirector
from .anima_character_extractor import AnimaCharacterExtractor
from .anima_resolution import AnimaResolutionSelector

from .h3_prompt_director import (
    H3PromptDirector,
    OllamaVRAMUnloader,
    H3CharacterSubjectManager,
    H3TimelineDirector,
)
from .h3_prompt_director_gui import (
    H3PromptDirectorGUI,
    H3MediaDispatcher,
    HKMC_ModelSelector,
)
from .h3_prompt_director_mv import H3PromptDirector_MV

from .save_audio_wav import SaveAudioWav
from .h3_pipe import ToH3Pipe, FromH3Pipe, FromH3MediaPipe
from .hkmc_clip_prompt_dispatcher import HKMCClipPromptDispatcher
from .hkmc_status_bomb import HKMCMasterBombSwitch, HKMCChildBombGate
from .hkmc_stream_av_to_latent import HKMC_H3StreamLiveExtensionAVToLatent
from .h3_design_director import H3DesignDirector
from .h3_hub_nodes import H3SeedHub, H3LatentLoader, H3LatentCacher

NODE_CLASS_MAPPINGS = {
    "AnimaPromptDirector": AnimaPromptDirector,
    "AnimaCharacterExtractor": AnimaCharacterExtractor,
    "AnimaResolutionSelector": AnimaResolutionSelector,
    "H3PromptDirector": H3PromptDirector,
    "H3MediaDispatcher": H3MediaDispatcher,
    "OllamaVRAMUnloader": OllamaVRAMUnloader,
    "H3CharacterSubjectManager": H3CharacterSubjectManager,
    "H3TimelineDirector": H3TimelineDirector,
    "H3PromptDirectorGUI": H3PromptDirectorGUI,
    "H3PromptDirector_MV": H3PromptDirector_MV,
    "HKMC_ModelSelector": HKMC_ModelSelector,
    "SaveAudioWav": SaveAudioWav,
    "ToH3Pipe": ToH3Pipe,
    "FromH3Pipe": FromH3Pipe,
    "FromH3MediaPipe": FromH3MediaPipe,
    "HKMCClipPromptDispatcher": HKMCClipPromptDispatcher,
    "HKMCMasterBombSwitch": HKMCMasterBombSwitch,
    "HKMCChildBombGate": HKMCChildBombGate,
    "HKMC_H3StreamLiveExtensionAVToLatent": HKMC_H3StreamLiveExtensionAVToLatent,
    "H3DesignDirector": H3DesignDirector,
    "H3SeedHub": H3SeedHub,
    "H3LatentLoader": H3LatentLoader,
    "H3LatentCacher": H3LatentCacher,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaPromptDirector": "Anima Prompt Director",
    "AnimaCharacterExtractor": "Anima Character Extractor",
    "AnimaResolutionSelector": "Anima Resolution Selector",
    "H3PromptDirector": "H3 Prompt Director",
    "H3MediaDispatcher": "H3 Media Dispatcher",
    "OllamaVRAMUnloader": "Ollama VRAM Unloader",
    "H3CharacterSubjectManager": "H3 Character Subject Manager",
    "H3TimelineDirector": "H3 Timeline Director",
    "H3PromptDirectorGUI": "H3promptDirector(GUI)",
    "H3PromptDirector_MV": "H3 Prompt Director (MV)",
    "HKMC_ModelSelector": "HKMC Model Selector",
    "SaveAudioWav": "Save Audio (WAV)",
    "ToH3Pipe": "To H3 Pipe",
    "FromH3Pipe": "From H3 Pipe",
    "FromH3MediaPipe": "From H3 Media Pipe",
    "HKMCClipPromptDispatcher": "HKMC Clip Prompt Dispatcher",
    "HKMCMasterBombSwitch": "HKMC Master Switch (親)",
    "HKMCChildBombGate": "HKMC Child Bomb (子)",
    "HKMC_H3StreamLiveExtensionAVToLatent": "HKMC H3 Stream AV Extensions (with Latent Out)",
    "H3DesignDirector": "H3 Design Director",
    "H3SeedHub": "H3 Seed Hub (Seed一括分配)",
    "H3LatentLoader": "H3 Latent Loader (自動復元)",
    "H3LatentCacher": "H3 Latent Cacher (自動保存)",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]