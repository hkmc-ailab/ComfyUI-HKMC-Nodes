@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ========================================================
echo   HKMC-Nodes 必須ライブラリ 自動インストーラー
echo ========================================================
echo.

set "PYTHON_EXE="

:: 1. ComfyUI ポータブル版 (python_embeded) の探索（階層パターン網羅）
if exist "%~dp0..\..\python_embeded\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\python_embeded\python.exe"
) else if exist "%~dp0..\..\..\python_embeded\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\..\python_embeded\python.exe"
) else if exist "%~dp0..\..\..\..\python_embeded\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\..\..\python_embeded\python.exe"
)

:: 2. デスクトップ版 / 仮想環境 (.venv または venv) の探索
if not defined PYTHON_EXE (
    if exist "%~dp0..\..\..\.venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\..\.venv\Scripts\python.exe"
    ) else if exist "%~dp0..\..\..\venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\..\venv\Scripts\python.exe"
    ) else if exist "%~dp0..\..\..\..\.venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\..\..\.venv\Scripts\python.exe"
    ) else if exist "%~dp0..\..\..\..\venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\..\..\venv\Scripts\python.exe"
    ) else if exist "%~dp0..\..\.venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\.venv\Scripts\python.exe"
    ) else if exist "%~dp0..\..\venv\Scripts\python.exe" (
        set "PYTHON_EXE=%~dp0..\..\venv\Scripts\python.exe"
    )
)

:: Python が見つからなかった場合のエラー処理
if not defined PYTHON_EXE (
    echo [ERROR] ComfyUI の Python 環境が見つかりませんでした。
    echo 探索した環境: python_embeded, .venv, venv
    echo 手動で以下のコマンドを実行してください:
    echo   python -m pip install google-generativeai google-genai openai opencv-python scipy
    echo.
    pause
    exit /b 1
)
echo [OK] 検出した Python:
echo "!PYTHON_EXE!"
echo.

:: pip の自己更新（互換性・ wheel インストール失敗防止）
echo [1/2] pip を最新化しています...
"!PYTHON_EXE!" -m pip install --upgrade pip >nul 2>&1

:: 必須パッケージの直接インストール
echo [2/2] 必須パッケージ (google-genai, openai, opencv-python 等) をインストールしています...
echo.
"!PYTHON_EXE!" -m pip install google-generativeai google-genai openai opencv-python scipy
set "INSTALL_RESULT=!ERRORLEVEL!"

:: requirements.txt が存在する場合は追加でインストール
if exist "%~dp0requirements.txt" (
    echo.
    echo 追加の requirements.txt を適用しています...
    "!PYTHON_EXE!" -m pip install -r "%~dp0requirements.txt"
    if errorlevel 1 set "INSTALL_RESULT=1"
)

echo.
if "!INSTALL_RESULT!"=="0" (
    echo インストールが正常に完了しました！
) else (
    echo [ERROR] インストール中にエラーが発生しました。
    echo ログや上のエラーメッセージを確認してください。
)
echo.
pause