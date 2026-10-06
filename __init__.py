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
from .save_audio_wav import SaveAudioWav
from .h3_pipe import ToH3Pipe, FromH3Pipe, FromH3MediaPipe
from .hkmc_group_switch import HKMCGroupSwitch

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
    "HKMC_ModelSelector": HKMC_ModelSelector,
    "SaveAudioWav": SaveAudioWav,
    "ToH3Pipe": ToH3Pipe,
    "FromH3Pipe": FromH3Pipe,
    "FromH3MediaPipe": FromH3MediaPipe,
    "HKMCGroupSwitch": HKMCGroupSwitch,
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
    "HKMC_ModelSelector": "HKMC Model Selector",
    "SaveAudioWav": "Save Audio (WAV)",
    "ToH3Pipe": "To H3 Pipe",
    "FromH3Pipe": "From H3 Pipe",
    "FromH3MediaPipe": "From H3 Media Pipe",
    "HKMCGroupSwitch": "HKMC Group Switch",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]