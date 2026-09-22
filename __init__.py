import os
import shutil

# web拡張スクリプトの配置設定
EXTENSION_WEB_DIRS = {
    "HKMC_PromptDirector": os.path.join(os.path.dirname(__file__), "web")
}

from .anima_prompt_director import AnimaPromptDirector
from .h3_prompt_director import H3PromptDirector
from .anima_resolution import AnimaResolutionSelector

NODE_CLASS_MAPPINGS = {
    "AnimaPromptDirector": AnimaPromptDirector,
    "H3PromptDirector": H3PromptDirector,
    "AnimaResolutionSelector": AnimaResolutionSelector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaPromptDirector": "Anima Prompt Director",
    "H3PromptDirector": "H3 Prompt Director",
    "AnimaResolutionSelector": "Anima Resolution Selector"
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "EXTENSION_WEB_DIRS"]