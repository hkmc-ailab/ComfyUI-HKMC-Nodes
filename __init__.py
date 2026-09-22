import os

# --- H3関連ノードのインポート ---
from .h3_prompt_director import (
    H3PromptDirector, 
    H3MediaDispatcher, 
    OllamaVRAMUnloader,
    H3CharacterSubjectManager,
    H3TimelineDirector  
)

# --- Anima関連ノードのインポート ---
from .anima_resolution import AnimaResolutionSelector
from .anima_prompt_director import AnimaPromptDirector  # ★追記

# ノード内部識別IDの登録
NODE_CLASS_MAPPINGS = {
    "H3PromptDirector": H3PromptDirector,
    "H3MediaDispatcher": H3MediaDispatcher,
    "OllamaVRAMUnloader": OllamaVRAMUnloader,
    "H3CharacterSubjectManager": H3CharacterSubjectManager,
    "H3TimelineDirector": H3TimelineDirector,
    "AnimaResolutionSelector": AnimaResolutionSelector,
    "AnimaPromptDirector": AnimaPromptDirector,  # ★追記
}

# ComfyUI UI上の表示名設定
NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PromptDirector": "H3 Prompt Director",
    "H3MediaDispatcher": "H3 Media Dispatcher",
    "OllamaVRAMUnloader": "Ollama VRAM Unloader (H3)",
    "H3CharacterSubjectManager": "H3 Character Subject Manager",
    "H3TimelineDirector": "H3 Timeline Director",
    "AnimaResolutionSelector": "Anima Resolution Selector",
    "AnimaPromptDirector": "Anima Prompt Director",  # ★追記
}

# UIスクリプト配置ディレクトリ
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]