import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "HKMC.AnimaPromptDirectorUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AnimaPromptDirector") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const parts = [
                    { label: "頭/顔/髪", name: "part_head" },
                    { label: "上半身", name: "part_upper" },
                    { label: "腰", name: "part_waist" },
                    { label: "下半身", name: "part_lower" },
                    { label: "脚/足", name: "part_legs" }
                ];

                // 1. 元のLiteGraphトグルを完全に不可視化
                parts.forEach(p => {
                    const w = this.widgets.find(widget => widget.name === p.name);
                    if (w) {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.draw = function () {};
                    }
                });

                // 2. 部位チェックボックスUIの構築
                const container = document.createElement("div");
                container.style.display = "flex";
                container.style.justifyContent = "space-between";
                container.style.alignItems = "center";
                container.style.padding = "6px 10px";
                container.style.margin = "4px 0";
                container.style.backgroundColor = "#181818";
                container.style.borderRadius = "6px";
                container.style.border = "1px solid #333";
                container.style.fontSize = "11px";
                container.style.color = "#eee";
                container.style.boxSizing = "border-box";

                const checkboxElements = {};

                parts.forEach(p => {
                    const w = this.widgets.find(widget => widget.name === p.name);
                    const label = document.createElement("label");
                    label.style.display = "inline-flex";
                    label.style.alignItems = "center";
                    label.style.gap = "3px";
                    label.style.cursor = "pointer";

                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = w ? Boolean(w.value) : true;
                    cb.style.cursor = "pointer";

                    checkboxElements[p.name] = cb;

                    cb.addEventListener("change", (e) => {
                        if (w) {
                            w.value = e.target.checked;
                            if (this.onWidgetChanged) {
                                this.onWidgetChanged(w.name, w.value, !w.value, w);
                            }
                            if (w.callback) {
                                w.callback(w.value, app.canvas, this, [0, 0], e);
                            }
                            app.graph.setDirtyCanvas(true, true);
                        }
                    });

                    label.appendChild(document.createTextNode(p.label));
                    label.appendChild(cb);
                    container.appendChild(label);
                });

                this._syncPartCheckboxes = () => {
                    parts.forEach(p => {
                        const w = this.widgets.find(widget => widget.name === p.name);
                        if (w && checkboxElements[p.name]) {
                            checkboxElements[p.name].checked = Boolean(w.value);
                        }
                    });
                };

                const customWidget = this.addDOMWidget("part_checkboxes_row", "custom", container, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => 36
                });

                const labelMap = {
                    "llm_provider": "[LLM] プロバイダー",
                    "llm_api_key": "[LLM] API_Key",
                    "llm_model": "[LLM] モデル名",
                    "creative_mode": "[LLM] 演出/あそび",
                    "convert_all_to_natural": "全て自然言語に変換",
                    "lock_final_prompt": "最終プロンプトをロック"
                };

                for (const [key, text] of Object.entries(labelMap)) {
                    const w = this.widgets.find(widget => widget.name === key);
                    if (w) {
                        w.label = text;
                    }
                }

                // 3. 構図・アングルの横並びプルダウンUIの構築（JSON連携）
                const shotAngleContainer = document.createElement("div");
                shotAngleContainer.style.display = "flex";
                shotAngleContainer.style.gap = "6px";
                shotAngleContainer.style.margin = "4px 0";
                shotAngleContainer.style.boxSizing = "border-box";

                const createDropdown = (placeholderText) => {
                    const sel = document.createElement("select");
                    sel.style.flex = "1";
                    sel.style.height = "26px";
                    sel.style.backgroundColor = "#222";
                    sel.style.color = "#ccc";
                    sel.style.border = "1px solid #444";
                    sel.style.borderRadius = "4px";
                    sel.style.fontSize = "11px";
                    sel.style.padding = "2px 4px";
                    sel.style.outline = "none";
                    sel.style.cursor = "pointer";
                    return sel;
                };

                const shotSelect = createDropdown("構図 (Shot)");
                const angleSelect = createDropdown("視点 (Angle)");

                // タグを quality_prompt の末尾に追記する共通関数
                const appendTagToQuality = (tag) => {
                    if (!tag) return;
                    const qWidget = this.widgets.find(w => w.name === "quality_prompt");
                    if (!qWidget) return;

                    let currentVal = (qWidget.value || "").trim();
                    // 既に含まれている場合は重複挿入しない
                    const regex = new RegExp(`(^|[,\\s])${tag.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}([,\\s]|$)`, 'i');
                    if (regex.test(currentVal)) {
                        return;
                    }

                    if (currentVal.endsWith(",")) {
                        currentVal = currentVal.slice(0, -1).trim();
                    }
                    qWidget.value = currentVal ? `${currentVal}, ${tag}` : tag;
                    
                    if (qWidget.inputEl) {
                        qWidget.inputEl.value = qWidget.value;
                    }
                    if (this.onWidgetChanged) {
                        this.onWidgetChanged(qWidget.name, qWidget.value, "", qWidget);
                    }
                    app.graph.setDirtyCanvas(true, true);
                };

                // presets/shot_angles.json の読み込みとプルダウン生成
                const defaultPresets = {
                    shots: {
                        "構図を選択...": "",
                        "全身 (Full Body)": "full body",
                        "広角/引き (Wide Shot)": "wide shot",
                        "ニーアップ (Thigh-up)": "cowboy shot",
                        "上半身 (Upper Body)": "upper body",
                        "バストアップ (Bust Shot)": "bust shot, portrait",
                        "クローズアップ (Close-up)": "close-up, face focus"
                    },
                    angles: {
                        "アングルを選択...": "",
                        "正面 (Front View)": "front view",
                        "煽り/見上げ (Low Angle)": "from below, looking up",
                        "俯瞰/見下ろし (High Angle)": "from above, looking down",
                        "斜め構図 (Dynamic Angle)": "dynamic angle, dutch angle",
                        "横顔 (Side View)": "profile, from side",
                        "後ろ姿 (Back View)": "from behind"
                    }
                };

                const populateOptions = (presets) => {
                    shotSelect.innerHTML = "";
                    for (const [title, tag] of Object.entries(presets.shots || {})) {
                        const opt = document.createElement("option");
                        opt.value = tag;
                        opt.textContent = title;
                        shotSelect.appendChild(opt);
                    }
                    angleSelect.innerHTML = "";
                    for (const [title, tag] of Object.entries(presets.angles || {})) {
                        const opt = document.createElement("option");
                        opt.value = tag;
                        opt.textContent = title;
                        angleSelect.appendChild(opt);
                    }
                };

                populateOptions(defaultPresets);

                // 外部JSONの動的フェッチ
                fetch("/anima/shot_angles")
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data && (data.shots || data.angles)) {
                            populateOptions(data);
                        }
                    })
                    .catch(err => {
                        console.error("[AnimaPromptDirector] Failed to load shot_angles preset:", err);
                    });

                shotSelect.addEventListener("change", (e) => {
                    appendTagToQuality(e.target.value);
                    e.target.selectedIndex = 0; // 選択後に先頭へ戻す
                });

                angleSelect.addEventListener("change", (e) => {
                    appendTagToQuality(e.target.value);
                    e.target.selectedIndex = 0; // 次の選択のために先頭へ戻す
                });

                shotAngleContainer.appendChild(shotSelect);
                shotAngleContainer.appendChild(angleSelect);

                const shotAngleWidget = this.addDOMWidget("shot_angle_row", "custom", shotAngleContainer, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => 30
                });

                // ウィジェットの配置順序を調整: character_preset の直下に挿入
                if (this.widgets) {
                    const charIdx = this.widgets.findIndex(w => w.name === "character_preset");
                    const cbIdx = this.widgets.indexOf(customWidget);
                    if (charIdx !== -1 && cbIdx !== -1) {
                        this.widgets.splice(cbIdx, 1);
                        this.widgets.splice(charIdx + 1, 0, customWidget);
                    }
                    const newCbIdx = this.widgets.indexOf(customWidget);
                    const saIdx = this.widgets.indexOf(shotAngleWidget);
                    if (newCbIdx !== -1 && saIdx !== -1) {
                        this.widgets.splice(saIdx, 1);
                        this.widgets.splice(newCbIdx + 1, 0, shotAngleWidget);
                    }
                }

                // 4. final_positive_prompt の表示とノード下部スペーサー
                const finalWidget = this.widgets.find(w => w.name === "final_positive_prompt");
                if (finalWidget) {
                    finalWidget.computeSize = (width) => [width || 420, 180];
                }

                const applyLayout = () => {
                    if (finalWidget && finalWidget.inputEl) {
                        finalWidget.inputEl.style.height = "180px";
                        finalWidget.inputEl.style.minHeight = "180px";
                        finalWidget.inputEl.style.maxHeight = "180px";
                        finalWidget.inputEl.style.boxSizing = "border-box";
                    }
                    const currentW = Math.max((this.size && this.size[0]) || 420, 420);
                    this.size[0] = currentW;
                    this.size[1] = Math.max((this.size && this.size[1]) || 0, 850);
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                };

                if (!this.widgets.find(w => w.name === "bottom_padding_spacer")) {
                    const spacerDiv = document.createElement("div");
                    spacerDiv.style.height = "20px";
                    spacerDiv.style.width = "100%";
                    spacerDiv.style.pointerEvents = "none";
                    
                    const spacer = this.addDOMWidget("bottom_padding_spacer", "custom", spacerDiv, {
                        serialize: false,
                        hideOnZoom: false,
                        getHeight: () => 20
                    });
                    spacer.computeSize = () => [420, 20];
                }

                setTimeout(applyLayout, 150);
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                const res = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this._syncPartCheckboxes) {
                        this._syncPartCheckboxes();
                    }
                    const finalWidget = this.widgets ? this.widgets.find(w => w.name === "final_positive_prompt") : null;
                    if (finalWidget && finalWidget.inputEl) {
                        finalWidget.inputEl.style.height = "180px";
                        finalWidget.inputEl.style.minHeight = "180px";
                        finalWidget.inputEl.style.maxHeight = "180px";
                        finalWidget.inputEl.style.boxSizing = "border-box";
                    }
                    const currentW = Math.max((this.size && this.size[0]) || 420, 420);
                    this.size[0] = currentW;
                    this.size[1] = Math.max((this.size && this.size[1]) || 0, 850);
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                }, 100);
                return res;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);
                if (message && message.final_text) {
                    const finalWidget = this.widgets.find(w => w.name === "final_positive_prompt");
                    const lockWidget = this.widgets.find(w => w.name === "lock_final_prompt");
                    if (finalWidget && (!lockWidget || !lockWidget.value)) {
                        finalWidget.value = message.final_text[0];
                    }
                }
            };
        }
    }
});