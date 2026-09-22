import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function installStyles() {
    if (document.getElementById("h3-director-styles")) return;
    const style = document.createElement("style");
    style.id = "h3-director-styles";
    style.textContent = `
        .h3-sections {
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 100%;
            box-sizing: border-box;
            padding: 4px 0 12px 0;
        }
        .h3-lane-block {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
        }
        .h3-section-title {
            font-size: 11px;
            font-weight: bold;
            color: #8fa3b2;
            padding-left: 2px;
            line-height: 1.4;
        }
        .h3-input-header {
            font-size: 11px;
            font-weight: bold;
            color: #8fa3b2;
            padding-left: 2px;
            margin-top: 8px;
            margin-bottom: 2px;
            line-height: 1.3;
            pointer-events: none;
            user-select: none;
        }
        .h3-section-sub {
            font-size: 9px;
            font-weight: normal;
            color: #6a8093;
            margin-left: 4px;
        }
        .h3-lane {
            display: flex;
            gap: 6px;
            padding: 6px;
            background: #0e141a;
            border: 1px solid #2d3b48;
            border-radius: 6px;
            overflow-x: auto;
            width: 100%;
            min-height: 102px;
            align-items: center;
            box-sizing: border-box;
        }
        .h3-slot {
            position: relative;
            flex: 0 0 76px;
            width: 76px;
            height: 86px;
            border-radius: 4px;
            background: rgba(255,255,255,0.03);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            overflow: hidden;
            box-sizing: border-box;
        }
        .h3-slot.image-slot {
            border: 1px dashed #3a75a4;
            background: rgba(40, 100, 160, 0.06);
        }
        .h3-slot.image-slot .h3-slot-add { color: #5bb3f5; }
        .h3-slot.image-slot.occupied {
            border: 1px solid #5bb3f5;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }
        .h3-slot.video-slot {
            border: 1px dashed #6a4c82;
            background: rgba(80, 40, 90, 0.06);
        }
        .h3-slot.video-slot .h3-slot-add { color: #d8aef5; }
        .h3-slot.video-slot.occupied {
            border: 1px solid #b887d8;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }
        .h3-slot.audio-slot {
            border: 1px dashed #3b7560;
            background: rgba(40, 90, 70, 0.06);
        }
        .h3-slot.audio-slot .h3-slot-add { color: #7ecf9d; }
        .h3-slot.audio-slot.occupied {
            border: 1px solid #7ecf9d;
            background: #1e3b2f;
            justify-content: flex-start;
            padding-top: 8px;
        }
        .h3-slot-add {
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            line-height: 1;
        }
        .h3-slot-badge {
            position: absolute;
            top: 2px;
            left: 2px;
            background: rgba(0, 0, 0, 0.65);
            color: #a1b5c4;
            font-size: 8px;
            padding: 1px 3px;
            border-radius: 2px;
            pointer-events: none;
            z-index: 1;
        }
        .h3-audio-icon {
            font-size: 20px;
            margin-bottom: 2px;
            pointer-events: none;
        }
        .h3-audio-name {
            font-size: 8px;
            color: #dbe7f0;
            padding: 0 3px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
            text-align: center;
            pointer-events: none;
        }
        .h3-slot-tag-btn {
            position: absolute;
            bottom: 2px;
            left: 2px;
            right: 2px;
            background: rgba(13, 22, 30, 0.88);
            border: 1px solid #4a9cd6;
            color: #dbe7f0;
            font-size: 9px;
            border-radius: 3px;
            padding: 2px 0;
            cursor: pointer;
            text-align: center;
            line-height: 12px;
            z-index: 2;
        }
        .h3-slot.image-slot .h3-slot-tag-btn { border-color: #5bb3f5; }
        .h3-slot.video-slot .h3-slot-tag-btn { border-color: #b887d8; }
        .h3-slot.audio-slot .h3-slot-tag-btn { border-color: #7ecf9d; }
        .h3-slot-tag-btn:hover { background: #1e4563; }
        .h3-slot-del-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(180, 40, 40, 0.85);
            border: none;
            color: #fff;
            width: 15px;
            height: 15px;
            font-size: 10px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            z-index: 2;
        }
        .h3-slot-del-btn:hover { background: #d32f2f; }
    `;
    document.head.appendChild(style);
}

// 汎用の Picture タグ挿入バー生成ヘルパー
function attachPictureTagBar(node, targetWidgetFinder, defaultHeight = 650) {
    let lastFocusedInput = null;

    setTimeout(() => {
        if (node.widgets) {
            node.widgets.forEach(w => {
                if (w.inputEl) {
                    w.inputEl.addEventListener("focus", () => {
                        lastFocusedInput = w.inputEl;
                    });
                }
            });
        }
    }, 100);

    const insertTag = (tag) => {
        let target = lastFocusedInput;
        if (!target && node.widgets) {
            const defW = targetWidgetFinder(node.widgets);
            if (defW) target = defW.inputEl;
        }

        if (target) {
            const start = target.selectionStart || target.value.length;
            const end = target.selectionEnd || target.value.length;
            const text = target.value;
            target.value = text.substring(0, start) + tag + text.substring(end);
            target.selectionStart = target.selectionEnd = start + tag.length;
            target.focus();

            const widget = node.widgets.find(w => w.inputEl === target);
            if (widget) {
                widget.value = target.value;
                if (widget.callback) widget.callback(widget.value);
            }
        }
    };

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";
    container.style.padding = "6px 4px 8px 4px";
    container.style.width = "100%";
    container.style.boxSizing = "border-box";

    const title = document.createElement("div");
    title.textContent = "画像リファレンスタグ挿入 (フォーカス中の入力欄に追加)";
    title.style.fontSize = "11px";
    title.style.fontWeight = "bold";
    title.style.color = "#8fa3b2";

    const btnRow = document.createElement("div");
    btnRow.style.display = "grid";
    btnRow.style.gridTemplateColumns = "repeat(9, 1fr)";
    btnRow.style.gap = "4px";
    btnRow.style.width = "100%";

    for (let i = 0; i < 9; i++) {
        const btn = document.createElement("button");
        btn.textContent = `+P${i}`;
        btn.title = `<Picture ${i}> を挿入`;
        btn.style.background = "rgba(40, 100, 160, 0.2)";
        btn.style.border = "1px solid #3a75a4";
        btn.style.color = "#5bb3f5";
        btn.style.fontSize = "10px";
        btn.style.fontWeight = "bold";
        btn.style.borderRadius = "4px";
        btn.style.padding = "4px 0";
        btn.style.cursor = "pointer";
        btn.style.textAlign = "center";

        btn.onmouseover = () => {
            btn.style.background = "#1e4563";
            btn.style.borderColor = "#5bb3f5";
        };
        btn.onmouseout = () => {
            btn.style.background = "rgba(40, 100, 160, 0.2)";
            btn.style.borderColor = "#3a75a4";
        };

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            insertTag(`<Picture ${i}>`);
        };

        btnRow.appendChild(btn);
    }

    container.append(title, btnRow);

    if (node.addDOMWidget) {
        const dom = node.addDOMWidget("picture_tag_bar", "custom", container, {
            serialize: false,
            hideOnZoom: false,
            getHeight: () => 65
        });
        dom.computeSize = () => [Math.max(380, (node.size && node.size[0]) || 400), 65];
    }

    setTimeout(() => {
        const currentW = (node.size && node.size[0]) || 400;
        const currentH = (node.size && node.size[1]) || defaultHeight;
        node.setSize([currentW, Math.max(currentH, defaultHeight)]);
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    }, 100);
}

// 拡張の登録
app.registerExtension({
    name: "H3PromptDirector.SuiteExtensions",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // --- 1. H3PromptDirector の拡張 ---
        if (nodeData.name === "H3PromptDirector") {
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origNodeCreated) origNodeCreated.apply(this, arguments);
                const node = this;
                installStyles();

                let timelineWidget = node.widgets ? node.widgets.find(w => w.name === "timeline_data") : null;
                if (!timelineWidget) {
                    timelineWidget = node.addWidget("string", "timeline_data", '{"items":[]}', () => {}, { serialize: true });
                }
                timelineWidget.type = "hidden";
                timelineWidget.computeSize = () => [0, -4];
                timelineWidget.draw = function() {};

                let state = { items: [] };
                try {
                    if (timelineWidget && timelineWidget.value) state = JSON.parse(timelineWidget.value);
                } catch(e) {}

                const origConfigure = node.onConfigure;
                node.onConfigure = function(info) {
                    const res = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                    try {
                        if (timelineWidget && timelineWidget.value) {
                            state = JSON.parse(timelineWidget.value);
                            render();
                        }
                    } catch(e) {}
                    return res;
                };

                let lastFocusedWidget = null;
                setTimeout(() => {
                    if (node.widgets) {
                        node.widgets.forEach(w => {
                            if (w.inputEl) {
                                w.inputEl.addEventListener("focus", () => { lastFocusedWidget = w; });
                            }
                        });
                    }
                }, 100);

                const insertText = (textToInsert) => {
                    let target = lastFocusedWidget;
                    if (!target || !target.inputEl) {
                        target = node.widgets.find(w => w.name && w.name.includes("シチュエーション"));
                    }
                    if (target && target.inputEl) {
                        const el = target.inputEl;
                        const start = el.selectionStart || 0;
                        const end = el.selectionEnd || 0;
                        el.value = el.value.substring(0, start) + textToInsert + el.value.substring(end);
                        el.selectionStart = el.selectionEnd = start + textToInsert.length;
                        el.focus();
                        target.value = el.value;
                        if (target.callback) target.callback(target.value);
                    }
                };

                async function upload(file) {
                    const form = new FormData();
                    form.append("image", file, file.name);
                    form.append("type", "input");
                    const res = await api.fetchApi("/upload/image", { method: "POST", body: form });
                    const json = await res.json();
                    return json.name;
                }

                const wrapper = document.createElement("div");
                wrapper.className = "h3-sections";

                const imgBlock = document.createElement("div");
                imgBlock.className = "h3-lane-block";
                const imgTitle = document.createElement("div");
                imgTitle.className = "h3-section-title";
                imgTitle.innerHTML = `リファレンス画像 <span class="h3-section-sub">(REF2VA: Picture 0-8 / FL2VA: Picture 0-1)</span>`;
                const imgLane = document.createElement("div");
                imgLane.className = "h3-lane";
                imgBlock.append(imgTitle, imgLane);

                const vidBlock = document.createElement("div");
                vidBlock.className = "h3-lane-block";
                const vidTitle = document.createElement("div");
                vidTitle.className = "h3-section-title";
                vidTitle.innerHTML = `リファレンス映像 <span class="h3-section-sub">(Video 0-1)</span>`;
                const vidLane = document.createElement("div");
                vidLane.className = "h3-lane";
                vidBlock.append(vidTitle, vidLane);

                const audBlock = document.createElement("div");
                audBlock.className = "h3-lane-block";
                const audTitle = document.createElement("div");
                audTitle.className = "h3-section-title";
                audTitle.innerHTML = `リファレンス音声 <span class="h3-section-sub">(Audio 0-2)</span>`;
                const audLane = document.createElement("div");
                audLane.className = "h3-lane";
                audBlock.append(audTitle, audLane);

                wrapper.append(imgBlock, vidBlock, audBlock);

                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.hidden = true;
                let activeConfig = null;

                fileInput.onchange = async () => {
                    if (fileInput.files.length > 0 && activeConfig) {
                        const file = fileInput.files[0];
                        const name = await upload(file);
                        const { type, index } = activeConfig;
                        state.items = state.items.filter(it => !(it.laneType === type && it.slot === index));
                        state.items.push({ type: type, value: name, slot: index, laneType: type });
                        saveAndRender();
                    }
                };

                const saveAndRender = () => {
                    if (timelineWidget) {
                        timelineWidget.value = JSON.stringify(state);
                        if (timelineWidget.callback) timelineWidget.callback(timelineWidget.value);
                    }
                    render();
                };

                const render = () => {
                    imgLane.replaceChildren();
                    vidLane.replaceChildren();
                    audLane.replaceChildren();

                    for (let i = 0; i < 9; i++) {
                        buildSlot(imgLane, "image", i, `Picture ${i}`, "image/*");
                    }
                    for (let i = 0; i < 2; i++) {
                        buildSlot(vidLane, "video", i, `Video ${i}`, "video/*");
                    }
                    for (let i = 0; i < 3; i++) {
                        buildSlot(audLane, "audio", i, `Audio ${i}`, "audio/*");
                    }
                };

                const buildSlot = (laneEl, laneType, slotIdx, tagName, acceptTypes) => {
                    const slot = document.createElement("div");
                    slot.className = `h3-slot ${laneType}-slot`;

                    const item = state.items.find(it => (it.laneType || it.type) === laneType && it.slot === slotIdx);

                    const badge = document.createElement("span");
                    badge.className = "h3-slot-badge";
                    badge.textContent = `#${slotIdx}`;
                    slot.appendChild(badge);

                    if (item && item.value) {
                        slot.classList.add("occupied");
                        if (laneType !== "audio") {
                            slot.style.backgroundImage = `url('/view?filename=${encodeURIComponent(item.value)}&type=input')`;
                        } else {
                            const icon = document.createElement("div");
                            icon.className = "h3-audio-icon";
                            icon.textContent = "🎵";
                            const nameEl = document.createElement("div");
                            nameEl.className = "h3-audio-name";
                            nameEl.textContent = item.value.split("/").pop();
                            slot.append(icon, nameEl);
                        }

                        const btn = document.createElement("button");
                        btn.className = "h3-slot-tag-btn";
                        btn.textContent = `+ ${tagName}`;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            insertText(`<${tagName}>`);
                        };
                        slot.appendChild(btn);

                        const del = document.createElement("button");
                        del.className = "h3-slot-del-btn";
                        del.textContent = "×";
                        del.onclick = (e) => {
                            e.stopPropagation();
                            state.items = state.items.filter(it => !((it.laneType || it.type) === laneType && it.slot === slotIdx));
                            saveAndRender();
                        };
                        slot.appendChild(del);
                    } else {
                        const add = document.createElement("div");
                        add.className = "h3-slot-add";
                        add.textContent = "+";
                        slot.appendChild(add);

                        slot.onclick = () => {
                            activeConfig = { type: laneType, index: slotIdx };
                            fileInput.accept = acceptTypes;
                            fileInput.click();
                        };
                    }

                    slot.ondragover = (e) => e.preventDefault();
                    slot.ondrop = async (e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files.length > 0) {
                            const file = e.dataTransfer.files[0];
                            const name = await upload(file);
                            state.items = state.items.filter(it => !((it.laneType || it.type) === laneType && it.slot === slotIdx));
                            state.items.push({ type: laneType, value: name, slot: slotIdx, laneType: laneType });
                            saveAndRender();
                        }
                    };

                    laneEl.appendChild(slot);
                };

                if (node.addDOMWidget) {
                    const dom = node.addDOMWidget("media_lane_3tier", "custom", wrapper, {
                        serialize: false,
                        hideOnZoom: false,
                        getHeight: () => 420
                    });
                    dom.computeSize = () => [Math.max(420, (node.size && node.size[0]) || 440), 420];
                }

                render();
            };
        }

        // --- 2. H3CharacterSubjectManager の拡張 ---
        if (nodeData.name === "H3CharacterSubjectManager") {
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origNodeCreated) origNodeCreated.apply(this, arguments);
                attachPictureTagBar(this, (widgets) => widgets.find(w => w.name && w.name.includes("キャラ1_追記")), 500);
            };
        }

        // --- 3. H3TimelineDirector の拡張 ---
        if (nodeData.name === "H3TimelineDirector") {
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origNodeCreated) origNodeCreated.apply(this, arguments);
                attachPictureTagBar(this, (widgets) => widgets.find(w => w.name && w.name.includes("ショット1_アクション")), 680);
            };
        }
    }
});