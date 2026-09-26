import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "Anima.CharacterExtractor",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AnimaCharacterExtractor") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }

                const node = this;

                // 1. 上段ウィジェット（入力欄）
                const inputWidget = node.widgets.find(w => w.name === "character_prompt");
                if (inputWidget) {
                    inputWidget.label = "ここにキャラクタープロンプトを入力";
                    if (inputWidget.inputEl) {
                        inputWidget.inputEl.placeholder = "ここにキャラクタープロンプトを入力";
                    }
                }

                // 2. 下段ウィジェット（出力プレビュー）
                const textWidget = ComfyWidgets["STRING"](
                    node,
                    "formatted_preview",
                    ["STRING", { multiline: true }],
                    app
                ).widget;

                textWidget.inputEl.readOnly = false;
                textWidget.inputEl.placeholder = "ノードを実行すると、ここに変換されたプロンプトが表示されます";
                node.resultWidget = textWidget;

                // 3. 保存ボタン
                node.saveBtn = node.addWidget("button", "💾 txtファイルとして保存", null, async () => {
                    const text = node.resultWidget ? node.resultWidget.value : "";
                    if (!text || !text.trim()) {
                        alert("保存するプロンプトがありません。まずはQueueを実行してください。");
                        return;
                    }

                    let filename = prompt(
                        "charactersフォルダに保存するファイル名を入力してください:\n必ずファイルの先頭にanima_と入力してください（例: anima_Jill.txt）",
                        "anima_●●●.txt"
                    );

                    if (!filename || !filename.trim()) return;

                    filename = filename.trim();
                    if (!filename.endsWith(".txt")) {
                        filename += ".txt";
                    }

                    try {
                        const response = await api.fetchApi("/anima/save_character", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ filename, content: text })
                        });

                        const res = await response.json();
                        if (res.success) {
                            alert(`✅ charactersフォルダに保存完了！\n\nファイル名: ${res.filename}\n\n※AnimaPromptDirectorからすぐに呼び出せます。`);
                        } else {
                            alert(`❌ 保存失敗: ${res.error}`);
                        }
                    } catch (err) {
                        alert(`❌ 通信エラー: ${err}`);
                    }
                });

                // --- リサイズ時の均等追従＆余白詰め処理 ---
                node.layoutWidgets = function () {
                    const minWidth = 380;
                    const minHeight = 440; // 重なり防止の最小高さ制限

                    // 最小サイズの強制
                    if (node.size[0] < minWidth) node.size[0] = minWidth;
                    if (node.size[1] < minHeight) node.size[1] = minHeight;

                    // ヘッダーやボタン、余白の計算
                    const headerHeight = 45; // ピンやタイトル部分
                    const buttonHeight = 32; // 保存ボタンの高さ
                    const gap = 10;          // 上段と下段の間の余白（半分に縮小）
                    const paddingBottom = 16;

                    // 利用可能な総高さを2等分
                    const availableHeight = node.size[1] - headerHeight - buttonHeight - gap - paddingBottom;
                    const halfHeight = Math.max(120, Math.floor(availableHeight / 2));

                    if (inputWidget && inputWidget.inputEl) {
                        inputWidget.inputEl.style.height = `${halfHeight}px`;
                    }
                    if (node.resultWidget && node.resultWidget.inputEl) {
                        node.resultWidget.inputEl.style.height = `${halfHeight}px`;
                        // 間の余白を詰める
                        node.resultWidget.inputEl.style.marginTop = "2px";
                    }
                };

                // リサイズ時に発火
                const origOnResize = node.onResize;
                node.onResize = function (size) {
                    if (origOnResize) origOnResize.apply(this, arguments);
                    node.layoutWidgets();
                };

                // 初期サイズ設定 (幅400px, 高さ520px)
                node.setSize([400, 520]);
                setTimeout(() => node.layoutWidgets(), 30);
            };

            // Queue実行後に下段テキストエリアへ反映
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) {
                    onExecuted.apply(this, arguments);
                }

                if (message && message.formatted_text && message.formatted_text[0]) {
                    const outputText = message.formatted_text[0];
                    if (this.resultWidget) {
                        this.resultWidget.value = outputText;
                        if (this.resultWidget.inputEl) {
                            this.resultWidget.inputEl.value = outputText;
                        }
                    }
                }
            };
        }
    }
});