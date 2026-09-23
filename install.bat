@echo off
chcp 65001 > nul
echo ========================================================
echo   HKMC-Nodes 必須ライブラリ 自動インストーラー
echo ========================================================
echo.

:: 1. Comfy-Desktop (デスクトップ版) の Python を自動探索
set "PYTHON_EXE="

:: 現在の階層から上位を辿って .venv を探す
pushd "%~dp0..\..\..\.venv\Scripts" 2>nul
if exist "python.exe" (
    set "PYTHON_EXE=%CD%\python.exe"
)
popd

:: 2. ポータブル版 (python_embeded) の自動探索
if not defined PYTHON_EXE (
    pushd "%~dp0..\..\..\python_embeded" 2>nul
    if exist "python.exe" (
        set "PYTHON_EXE=%CD%\python.exe"
    )
    popd
)

:: 3. どちらも見つからない場合はシステムの標準 python をフォールバック
if not defined PYTHON_EXE (
    set "PYTHON_EXE=python"
)

echo 使用する Python: %PYTHON_EXE%
echo.
echo 必要なパッケージ (google-generativeai, openai 等) をインストールしています...
echo.

"%PYTHON_EXE%" -m pip install -r "%~dp0requirements.txt"

echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo   インストールが正常に完了しました！
    echo   ComfyUI を起動（または再起動）してください。
    echo ========================================================
) else (
    echo ========================================================
    echo   エラーが発生しました。
    echo ========================================================
)
echo.
pause