class AnyType(str):
    def __eq__(self, other):
        return True

    def __ne__(self, other):
        return False

    def __hash__(self):
        return hash("*")

ANY = AnyType("*")


class HKMCMasterBombSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "enabled": ("BOOLEAN", {"default": True, "description": "長尺生成マスターON/OFF"}),
                "value": ("INT", {"default": 1, "min": 0, "max": 64, "step": 1, "description": "クリップ数"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    # バックエンドの検証エラー(tuple index out of range)を防ぐため、最大64ピン分の出力を事前定義
    RETURN_TYPES = tuple(["HKMC_BOMB_SIG"] * 64)
    RETURN_NAMES = tuple([f"signal_out_{i+1}" if i > 0 else "signal_out" for i in range(64)])
    FUNCTION = "execute"
    CATEGORY = "HKMC/bomb"
    OUTPUT_NODE = False

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def execute(self, enabled, value, unique_id=None, **kwargs):
        signal = int(value) if enabled else 0
        # 定義した64ピンすべてに安全に同じシグナルを流す
        return tuple([signal] * 64)


class HKMCChildBombGate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "signal": ("HKMC_BOMB_SIG", {"description": "親からの制御シグナル"}),
                "clip_index": ("INT", {"default": 1, "min": 1, "max": 64, "step": 1, "description": "このクリップ番号(1〜6)"}),
                "action": (["mute", "bypass"], {"default": "mute", "description": "作動時の状態"}),
                "invert": ("BOOLEAN", {"default": False, "description": "Trueにすると作動時に解除(通常実行)し、非作動時にバイパス/ミュート"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    # 子ノードは出力を持たないため、完全にゼロとして定義
    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "HKMC/bomb"
    OUTPUT_NODE = False  # Play(実行)ボタンを削除

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def validate_inputs(self, *args, **kwargs):
        return True

    def execute(self, signal, clip_index, action, invert=False, unique_id=None, **kwargs):
        # 処理はJS側で行うため、Python側は何もしない
        return ()


NODE_CLASS_MAPPINGS = {
    "HKMCMasterBombSwitch": HKMCMasterBombSwitch,
    "HKMCChildBombGate": HKMCChildBombGate
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HKMCMasterBombSwitch": "HKMC Master Switch (親)",
    "HKMCChildBombGate": "HKMC Child Bomb (子)"
}