import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function installStudioStyles() {
    if (document.getElementById("h3-studio-styles")) return;
    const style = document.createElement("style");
    style.id = "h3-studio-styles";
    style.textContent = `
        .h3-studio-container {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            background: #000000;
            color: #dbe0e6;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            border-radius: 8px;
            overflow: hidden;
            position: relative;
        }
        .h3-tab-bar {
            display: flex;
            background: #000000;
            border-bottom: 1px solid #282828;
            padding: 6px 8px 0 8px;
            gap: 6px;
            flex-shrink: 0;
            overflow-x: hidden;
        }
        .h3-tab-btn {
            background: #141416;
            border: 1px solid #24262b;
            border-bottom: none;
            color: #666a73;
            padding: 6px 14px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px 6px 0 0;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            white-space: nowrap;
        }
        .h3-tab-btn:hover {
            color: #ffffff;
            background: #22252a;
            border-color: #383c44;
        }
        .h3-tab-btn.active {
            color: #ffffff;
            background: #2c2f36;
            border-color: #4a4f5a;
        }
        
        .h3-top-toggle-bar {
            display: flex;
            gap: 6px;
            background: transparent;
            padding: 2px 0 6px 0;
            border: none;
            margin-bottom: 4px;
        }
        .h3-toggle-chip {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: #202020;
            border: 1px solid #383838;
            border-radius: 8px;
            padding: 6px 0;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #dbe0e6;
            user-select: none;
            transition: border-color 0.1s;
        }
        .h3-toggle-chip:hover {
            border-color: #555555;
        }
        .h3-toggle-chip.active {
            background: #202020;
            border: 1px solid #383838;
            color: #dbe0e6;
        }
        .h3-toggle-chip input[type="checkbox"],
        .h3-toggle-chip input[type="radio"] {
            cursor: pointer;
            margin: 0;
            pointer-events: none;
        }

        .h3-dialogue-block {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .h3-dialogue-label {
            font-size: 10px;
            color: #9aa0a6;
            font-weight: bold;
        }
        .h3-speaker-bar {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .h3-speaker-chip {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: #181818;
            border: 1px solid #333333;
            border-radius: 6px;
            padding: 4px 0;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            color: #8b949e;
            user-select: none;
            transition: all 0.12s;
        }
        .h3-speaker-chip:hover {
            border-color: #555555;
            color: #ffffff;
        }
        .h3-speaker-chip.active {
            background: #007acc;
            border-color: #5bb3f5;
            color: #ffffff;
            font-weight: bold;
        }

        .h3-tab-content {
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1 1 auto;
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
            background: #000000;
        }
        .h3-char-card {
            background: transparent;
            border: 1px solid #555860;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-sizing: border-box;
        }
        .h3-char-title {
            font-size: 12px;
            font-weight: bold;
            color: #ffffff;
            border: none;
            padding-left: 2px;
            margin-top: 2px;
        }
        .h3-field-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .h3-field-row label {
            font-size: 10px;
            color: #9aa0a6;
            font-weight: bold;
        }

        .h3-pic-check-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .h3-pic-check-grid {
            display: grid;
            grid-template-columns: repeat(9, 1fr);
            gap: 4px;
        }
        .h3-pic-check-item {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #202020;
            border: 1px solid #383838;
            border-radius: 6px;
            padding: 6px 0;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #9aa0a6;
            user-select: none;
            transition: all 0.15s;
        }
        .h3-pic-check-item:hover {
            border-color: #555555;
            color: #ffffff;
        }
        .h3-pic-check-item.checked {
            background: #007acc;
            border-color: #5bb3f5;
            color: #ffffff;
            font-weight: bold;
        }

        .h3-btn-gen-prompt {
            background: #007acc;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #ffffff;
            font-size: 13px;
            font-weight: bold;
            padding: 10px 16px;
            border-radius: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: background 0.15s, transform 0.05s;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        .h3-btn-gen-prompt:hover { background: #0088e6; }
        .h3-btn-gen-prompt:active { transform: scale(0.99); }
        .h3-btn-gen-prompt:disabled { background: #2b2b2b; color: #6e7681; cursor: not-allowed; }

        .h3-use-prompt-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #202020;
            border: 1px solid #383838;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            cursor: pointer;
            user-select: none;
        }
        .h3-use-prompt-banner input { width: 15px; height: 15px; cursor: pointer; }
        .h3-use-prompt-text { font-weight: bold; color: #ffffff; }
        .h3-use-prompt-sub { font-size: 10px; color: #9aa0a6; margin-left: 4px; }

        .h3-prompt-textarea {
            width: 100%;
            height: 380px;
            background: #202020;
            border: 1px solid #383838;
            border-radius: 8px;
            color: #dbe0e6;
            font-family: Consolas, "Courier New", monospace;
            font-size: 11px;
            line-height: 1.45;
            padding: 10px;
            box-sizing: border-box;
            resize: vertical;
            outline: none;
        }
        .h3-prompt-textarea:focus { border-color: #6e7681; }

        .h3-time-picker-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: transparent;
            padding: 2px 0;
            border: none;
        }
        .h3-time-picker-label { font-size: 10px; color: #9aa0a6; font-weight: bold; }
        .h3-time-picker-inputs { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #dbe0e6; flex-wrap: wrap; }
        .h3-time-group { display: inline-flex; align-items: center; gap: 2px; background: #202020; padding: 3px 6px; border-radius: 8px; border: 1px solid #383838; }
        .h3-time-num { width: 34px; background: #181818; border: 1px solid #383838; color: #ffffff; text-align: center; font-size: 12px; font-weight: bold; border-radius: 4px; padding: 2px 0; outline: none; }
        .h3-time-num.dec { width: 26px; }
        .h3-time-sep { color: #dbe0e6; font-weight: bold; padding: 0 4px; }

        .h3-fixed-media-area {
            display: flex;
            flex-direction: column;
            background: #000000;
            border-top: 1px solid #282828;
            flex-shrink: 0;
            box-sizing: border-box;
            position: relative;
        }
        .h3-media-resizer-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1px 10px;
            background: #141416;
            border-bottom: 1px solid #24262b;
            cursor: row-resize;
            user-select: none;
            height: 18px;
            box-sizing: border-box;
        }
        .h3-media-resizer-bar:hover { background: #1c1d21; }
        .h3-media-header-title {
            font-size: 10px;
            font-weight: bold;
            color: #dbe0e6;
            letter-spacing: 0.5px;
            pointer-events: none;
        }
        .h3-media-drag-handle {
            font-size: 14px;
            font-weight: bold;
            color: #666a73;
            letter-spacing: 2px;
            pointer-events: none;
            line-height: 1;
        }
        .h3-media-toggle-btn {
            font-size: 10px;
            font-weight: bold;
            color: #ffffff;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
        }
        .h3-media-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
            box-sizing: border-box;
            background: #000000;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: 480px;
            min-height: 100px;
        }
        .h3-media-body.collapsed {
            display: none;
        }
        .h3-lane-block {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
            background: transparent;
            border: 1px solid #555860;
            border-radius: 8px;
            padding: 8px 10px 10px 10px;
            box-sizing: border-box;
        }
        .h3-section-title {
            font-size: 11px;
            font-weight: bold;
            color: #ffffff;
            padding-left: 2px;
        }
        .h3-section-sub {
            font-size: 9px;
            font-weight: normal;
            color: #8b949e;
            margin-left: 4px;
        }
        .h3-lane {
            display: flex;
            gap: 6px;
            padding: 2px 0 0 0;
            background: transparent;
            border: none;
            overflow-x: auto;
            width: 100%;
            min-height: 80px;
            align-items: center;
            box-sizing: border-box;
        }
        
        .h3-slot {
            position: relative;
            flex: 0 0 68px;
            width: 68px;
            height: 76px;
            border-radius: 8px;
            background: #202020;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            overflow: hidden;
            box-sizing: border-box;
        }
        .h3-slot.image-slot,
        .h3-slot.keyframe-slot {
            border: 1px dashed #3a75a4;
        }
        .h3-slot.image-slot.occupied,
        .h3-slot.keyframe-slot.occupied {
            border: 1px solid #5bb3f5;
            background-size: cover;
            background-position: center;
        }
        .h3-slot.video-slot {
            border: 1px dashed #6a4c82;
        }
        .h3-slot.video-slot.occupied {
            border: 1px solid #b887d8;
            background-size: cover;
            background-position: center;
        }
        .h3-slot.audio-slot {
            border: 1px dashed #3b7560;
        }
        .h3-slot.audio-slot.occupied {
            border: 1px solid #7ecf9d;
            background: #202020;
            justify-content: flex-start;
            padding-top: 6px;
        }
        .h3-slot-add {
            font-size: 20px;
            font-weight: bold;
            pointer-events: none;
            line-height: 1;
        }
        .h3-slot-badge {
            position: absolute;
            top: 2px;
            left: 2px;
            background: rgba(0,0,0,0.7);
            font-size: 8px;
            padding: 1px 3px;
            border-radius: 3px;
            z-index: 1;
            pointer-events: none;
            color: #dbe0e6;
        }
        .h3-audio-icon {
            font-size: 18px;
            margin-bottom: 2px;
            pointer-events: none;
        }
        .h3-audio-name {
            font-size: 8px;
            color: #dbe0e6;
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
            background: rgba(0, 0, 0, 0.75);
            border: 1px solid #444c56;
            color: #dbe0e6;
            font-size: 9px;
            border-radius: 4px;
            padding: 1px 0;
            cursor: pointer;
            text-align: center;
            line-height: 12px;
            z-index: 2;
        }
        .h3-slot-tag-btn:hover { background: #383838; }
        .h3-slot-del-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(180, 40, 40, 0.85);
            color: #fff;
            width: 14px; height: 14px;
            border-radius: 50%;
            border: none;
            font-size: 9px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
        }
        .h3-slot-del-btn:hover { background: #d32f2f; }
        
        .h3-clip-result-title {
            font-size: 11px;
            font-weight: bold;
            color: #ffffff;
            margin-top: 8px;
        }
        .h3-clip-result-text {
            width: 100%;
            min-height: 40px;
            background: #181818;
            border: 1px solid #383838;
            border-radius: 8px;
            color: #dbe0e6;
            font-size: 10px;
            padding: 8px;
            box-sizing: border-box;
            white-space: pre-wrap;
            word-break: break-all;
        }
    `;
    document.head.appendChild(style);
}

app.registerExtension({
    name: "MiniMax.H3PromptDirectorGUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "H3PromptDirectorGUI") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                const node = this;
                installStudioStyles();

                const wMap = {};
                node.widgets.forEach(w => {
                    wMap[w.name] = w;
                    w.draw = function () {};
                    // 【安定版の処理】LiteGraphのマージンを相殺する
                    w.computeSize = () => [0, -4];
                    if (w.inputEl) w.inputEl.style.display = "none";
                });

                for (let i = 1; i <= 3; i++) {
                    if (wMap[`char${i}_enabled`] && wMap[`char${i}_enabled`].value === undefined) {
                        wMap[`char${i}_enabled`].value = (i === 1);
                    }
                }
                for (let i = 1; i <= 4; i++) {
                    if (wMap[`shot${i}_enabled`] && wMap[`shot${i}_enabled`].value === undefined) {
                        wMap[`shot${i}_enabled`].value = (i === 1);
                    }
                }
                for (let i = 1; i <= 10; i++) {
                    if (wMap[`c${i}_enabled`] && wMap[`c${i}_enabled`].value === undefined) {
                        wMap[`c${i}_enabled`].value = false;
                    }
                }

                const charEnabledState = {};
                for(let i=1; i<=3; i++) charEnabledState[i] = wMap[`char${i}_enabled`] ? !!wMap[`char${i}_enabled`].value : (i===1);

                const shotEnabledState = {};
                for(let i=1; i<=4; i++) shotEnabledState[i] = wMap[`shot${i}_enabled`] ? !!wMap[`shot${i}_enabled`].value : (i===1);

                const clipEnabledState = {};
                for(let i=1; i<=10; i++) clipEnabledState[i] = wMap[`c${i}_enabled`] ? !!wMap[`c${i}_enabled`].value : false;

                let activeTab = "cast";
                let lastFocusedInput = null;
                let isMediaCollapsed = false;
                let mediaBodyHeight = 340;

                let state = { items: [] };
                try {
                    if (wMap["timeline_data"] && wMap["timeline_data"].value) {
                        state = JSON.parse(wMap["timeline_data"].value);
                    }
                } catch (e) {}

                const root = document.createElement("div");
                root.className = "h3-studio-container";

                // GUI全体を少し上へ移動
                const GUI_Y_OFFSET = -14;
                root.style.transform = `translateY(${GUI_Y_OFFSET}px)`;

                const tabBar = document.createElement("div");
                tabBar.className = "h3-tab-bar";

                const tabs = [
                    { id: "cast", label: "キャラクター設定" },
                    { id: "timeline", label: "⏱タイムライン" },
                    { id: "scene", label: "演出＆メディア" },
                    { id: "clip", label: "クリップ" },
                    { id: "llm", label: "LLM設定" },
                    { id: "prompt", label: "プロンプト生成" }
                ];

                const tabButtons = {};
                tabs.forEach(t => {
                    const btn = document.createElement("button");
                    btn.className = `h3-tab-btn ${t.id === activeTab ? "active" : ""}`;
                    btn.textContent = t.label;
                    btn.onclick = () => {
                        activeTab = t.id;
                        Object.values(tabButtons).forEach(b => b.classList.remove("active"));
                        btn.classList.add("active");
                        
                        if (activeTab === "llm" || activeTab === "prompt") {
                            fixedMediaArea.style.display = "none";
                        } else {
                            fixedMediaArea.style.display = "flex";
                        }
                        renderTabContent();
                    };
                    tabButtons[t.id] = btn;
                    tabBar.appendChild(btn);
                });

                const contentArea = document.createElement("div");
                contentArea.className = "h3-tab-content";

                const fixedMediaArea = document.createElement("div");
                fixedMediaArea.className = "h3-fixed-media-area";

                const mediaResizerBar = document.createElement("div");
                mediaResizerBar.className = "h3-media-resizer-bar";

                const mediaTitle = document.createElement("div");
                mediaTitle.className = "h3-media-header-title";
                mediaTitle.textContent = "［メディアボックス］";

                const dragHandle = document.createElement("div");
                dragHandle.className = "h3-media-drag-handle";
                dragHandle.textContent = "⋯";

                const toggleBtn = document.createElement("div");
                toggleBtn.className = "h3-media-toggle-btn";
                toggleBtn.textContent = "▼";

                mediaResizerBar.append(mediaTitle, dragHandle, toggleBtn);

                const mediaBody = document.createElement("div");
                mediaBody.className = "h3-media-body";
                mediaBody.style.height = `${mediaBodyHeight}px`;

                let isDragging = false;
                let startY = 0;
                let startHeight = 0;

                mediaResizerBar.onmousedown = (e) => {
                    if (e.target === toggleBtn) return;
                    isDragging = true;
                    startY = e.clientY;
                    startHeight = mediaBody.offsetHeight;
                    if (isMediaCollapsed) {
                        isMediaCollapsed = false;
                        mediaBody.classList.remove("collapsed");
                        toggleBtn.textContent = "▼";
                    }
                    e.preventDefault();

                    const onMouseMove = (ev) => {
                        if (!isDragging) return;
                        const deltaY = startY - ev.clientY;
                        let newH = startHeight + deltaY;
                        if (newH < 80) newH = 80;
                        if (newH > 520) newH = 520;
                        mediaBodyHeight = newH;
                        mediaBody.style.height = `${newH}px`;
                    };

                    const onMouseUp = () => {
                        isDragging = false;
                        window.removeEventListener("mousemove", onMouseMove);
                        window.removeEventListener("mouseup", onMouseUp);
                    };

                    window.addEventListener("mousemove", onMouseMove);
                    window.addEventListener("mouseup", onMouseUp);
                };

                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    isMediaCollapsed = !isMediaCollapsed;
                    if (isMediaCollapsed) {
                        mediaBody.classList.add("collapsed");
                        toggleBtn.textContent = "▲";
                    } else {
                        mediaBody.classList.remove("collapsed");
                        mediaBody.style.height = `${mediaBodyHeight}px`;
                        toggleBtn.textContent = "▼";
                    }
                };

                fixedMediaArea.append(mediaResizerBar, mediaBody);
                root.append(tabBar, contentArea, fixedMediaArea);

                const insertTagToFocusOrScene = (tag) => {
                    let target = lastFocusedInput;
                    if (!target) {
                        const ta = contentArea.querySelector("textarea");
                        if (target === null && ta) target = ta;
                    }
                    if (target) {
                        const start = target.selectionStart || target.value.length;
                        const end = target.selectionEnd || target.value.length;
                        target.value = target.value.substring(0, start) + tag + target.value.substring(end);
                        target.selectionStart = target.selectionEnd = start + tag.length;
                        target.focus();
                        target.dispatchEvent(new Event("input"));
                    }
                };

                const bindInput = (wName, label, isMultiline = false, placeholder = "") => {
                    const w = wMap[wName];
                    if (!w) return document.createElement("div");
                    const row = document.createElement("div");
                    row.className = "h3-field-row";
                    
                    if (label) {
                        const lbl = document.createElement("label");
                        lbl.textContent = label;
                        row.appendChild(lbl);
                    }

                    let el;
                    if (w.type === "combo") {
                        el = document.createElement("select");
                        el.style.background = "#202020";
                        el.style.color = "#ffffff";
                        el.style.border = "1px solid #383838";
                        el.style.padding = "6px 8px";
                        el.style.borderRadius = "8px";
                        el.style.outline = "none";
                        (w.options?.values || []).forEach(opt => {
                            const optEl = document.createElement("option");
                            optEl.value = opt;
                            optEl.textContent = opt;
                            if (opt === w.value) optEl.selected = true;
                            el.appendChild(optEl);
                        });
                        el.onchange = () => {
                            w.value = el.value;
                            if (w.callback) w.callback(el.value);
                        };
                    } else if (isMultiline) {
                        el = document.createElement("textarea");
                        el.style.background = "#202020";
                        el.style.color = "#ffffff";
                        el.style.border = "1px solid #383838";
                        el.style.padding = "8px";
                        el.style.borderRadius = "8px";
                        el.style.minHeight = "64px";
                        el.style.outline = "none";
                        el.placeholder = placeholder;
                        el.value = w.value !== undefined ? w.value : "";
                        el.oninput = () => {
                            w.value = el.value;
                            if (w.callback) w.callback(el.value);
                        };
                        el.onfocus = () => { lastFocusedInput = el; };
                    } else {
                        el = document.createElement("input");
                        el.type = typeof w.value === "number" ? "number" : "text";
                        el.style.background = "#202020";
                        el.style.color = "#ffffff";
                        el.style.border = "1px solid #383838";
                        el.style.padding = "6px 8px";
                        el.style.borderRadius = "8px";
                        el.style.outline = "none";
                        el.placeholder = placeholder;
                        el.value = w.value !== undefined ? w.value : "";
                        el.oninput = () => {
                            w.value = el.type === "number" ? parseFloat(el.value) : el.value;
                            if (w.callback) w.callback(w.value);
                        };
                        el.onfocus = () => { lastFocusedInput = el; };
                    }
                    row.appendChild(el);
                    return row;
                };

                const createDialogueWithSpeaker = (shotIndex) => {
                    const block = document.createElement("div");
                    block.className = "h3-dialogue-block";

                    const lbl = document.createElement("div");
                    lbl.className = "h3-dialogue-label";
                    lbl.textContent = "セリフ";
                    block.appendChild(lbl);

                    const bar = document.createElement("div");
                    bar.className = "h3-speaker-bar";

                    const spkWidget = wMap[`shot${shotIndex}_speaker`];
                    const options = [
                        { label: "なし", value: "None" },
                        { label: "キャラ1 (S1)", value: "S1" },
                        { label: "キャラ2 (S2)", value: "S2" },
                        { label: "キャラ3 (S3)", value: "S3" }
                    ];

                    const chips = [];
                    const curVal = spkWidget && spkWidget.value !== undefined ? spkWidget.value : (shotIndex === 1 ? "S1" : "None");

                    options.forEach(opt => {
                        const chip = document.createElement("div");
                        chip.className = `h3-speaker-chip ${curVal === opt.value ? "active" : ""}`;
                        chip.textContent = opt.label;

                        chip.onclick = () => {
                            chips.forEach(c => c.classList.remove("active"));
                            chip.classList.add("active");
                            if (spkWidget) {
                                spkWidget.value = opt.value;
                                if (spkWidget.callback) spkWidget.callback(opt.value);
                            }
                        };
                        chips.push(chip);
                        bar.appendChild(chip);
                    });
                    block.appendChild(bar);

                    const diaWidget = wMap[`shot${shotIndex}_dialogue`];
                    const ta = document.createElement("textarea");
                    ta.style.background = "#202020";
                    ta.style.color = "#ffffff";
                    ta.style.border = "1px solid #383838";
                    ta.style.padding = "8px";
                    ta.style.borderRadius = "8px";
                    ta.style.minHeight = "64px";
                    ta.style.outline = "none";
                    ta.placeholder = "セリフのみを入力 (話者は上のボタンで選択)";
                    ta.value = diaWidget && diaWidget.value !== undefined ? diaWidget.value : "";
                    ta.oninput = () => {
                        if (diaWidget) {
                            diaWidget.value = ta.value;
                            if (diaWidget.callback) diaWidget.callback(ta.value);
                        }
                    };
                    ta.onfocus = () => { lastFocusedInput = ta; };
                    block.appendChild(ta);

                    return block;
                };

                const createTimePicker = (shotIndex) => {
                    const w = wMap[`shot${shotIndex}_time`];
                    const wrapper = document.createElement("div");
                    wrapper.className = "h3-time-picker-row";

                    const label = document.createElement("div");
                    label.className = "h3-time-picker-label";
                    label.textContent = "タイム指定";

                    const inputsDiv = document.createElement("div");
                    inputsDiv.className = "h3-time-picker-inputs";

                    let sM = 0, sS = 0, sMs = 0;
                    let eM = 0, eS = (shotIndex === 1 ? 3 : shotIndex * 3), eMs = 0;

                    if (w && w.value) {
                        try {
                            const match = String(w.value).match(/(\d+):(\d+)(?:\.(\d+))?-(\d+):(\d+)(?:\.(\d+))?/);
                            if (match) {
                                sM = parseInt(match[1]) || 0;
                                sS = parseInt(match[2]) || 0;
                                sMs = parseInt(match[3]) || 0;
                                eM = parseInt(match[4]) || 0;
                                eS = parseInt(match[5]) || 0;
                                eMs = parseInt(match[6]) || 0;
                            }
                        } catch (err) {}
                    }

                    const createNumInput = (val, max, isDec = false) => {
                        const inp = document.createElement("input");
                        inp.type = "number";
                        inp.min = "0";
                        inp.max = max.toString();
                        inp.value = val;
                        inp.className = `h3-time-num ${isDec ? "dec" : ""}`;
                        return inp;
                    };

                    const inSm = createNumInput(sM, 59);
                    const inSs = createNumInput(sS, 59);
                    const inSms = createNumInput(sMs, 9, true);

                    const inEm = createNumInput(eM, 59);
                    const inEs = createNumInput(eS, 59);
                    const inEms = createNumInput(eMs, 9, true);

                    const syncToWidget = () => {
                        const smVal = parseInt(inSm.value) || 0;
                        const ssVal = String(parseInt(inSm.value) || 0).padStart(2, "0");
                        const smsVal = parseInt(inSms.value) || 0;

                        const emVal = parseInt(inEm.value) || 0;
                        const esVal = String(parseInt(inEs.value) || 0).padStart(2, "0");
                        const emsVal = parseInt(inEms.value) || 0;

                        const formatted = `${smVal}:${ssVal}.${smsVal}-${emVal}:${esVal}.${emsVal}`;
                        if (w) {
                            w.value = formatted;
                            if (w.callback) w.callback(w.value);
                        }
                    };

                    [inSm, inSs, inSms, inEm, inEs, inEms].forEach(inp => {
                        inp.oninput = syncToWidget;
                    });

                    const startGroup = document.createElement("div");
                    startGroup.className = "h3-time-group";
                    startGroup.append(
                        inSm, document.createTextNode("分"),
                        inSs, document.createTextNode("秒."),
                        inSms
                    );

                    const sep = document.createElement("span");
                    sep.className = "h3-time-sep";
                    sep.textContent = "〜";

                    const endGroup = document.createElement("div");
                    endGroup.className = "h3-time-group";
                    endGroup.append(
                        inEm, document.createTextNode("分"),
                        inEs, document.createTextNode("秒."),
                        inEms
                    );

                    inputsDiv.append(startGroup, sep, endGroup);
                    wrapper.append(label, inputsDiv);

                    syncToWidget();
                    return wrapper;
                };

                const createPicCheckboxGroup = (charIndex) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = "h3-pic-check-row";
                    
                    const label = document.createElement("label");
                    label.textContent = "キャラクター画像 (P0〜P8 参照指定)";
                    label.style.fontSize = "10px";
                    label.style.color = "#9aa0a6";
                    label.style.fontWeight = "bold";

                    const grid = document.createElement("div");
                    grid.className = "h3-pic-check-grid";

                    const picsWidget = wMap[`char${charIndex}_pics`];
                    
                    let rawVal = "";
                    if (picsWidget && picsWidget.value !== undefined && picsWidget.value !== null) {
                        rawVal = String(picsWidget.value);
                    }
                    let currentPics = rawVal ? rawVal.split(",").map(p => p.trim()).filter(Boolean) : [];

                    for (let p = 0; p < 9; p++) {
                        const item = document.createElement("div");
                        const tag = `<Picture ${p}>`;
                        const isChecked = currentPics.includes(tag);

                        item.className = `h3-pic-check-item ${isChecked ? "checked" : ""}`;
                        item.textContent = `P${p}`;

                        item.onclick = (e) => {
                            e.stopPropagation();
                            if (!picsWidget) return;

                            if (!item.classList.contains("checked")) {
                                item.classList.add("checked");
                                if (!currentPics.includes(tag)) currentPics.push(tag);
                            } else {
                                item.classList.remove("checked");
                                currentPics = currentPics.filter(t => t !== tag);
                            }

                            currentPics.sort();
                            picsWidget.value = currentPics.join(", ");
                            if (picsWidget.callback) picsWidget.callback(picsWidget.value);
                        };

                        grid.appendChild(item);
                    }

                    wrapper.append(label, grid);
                    return wrapper;
                };

                const renderTabContent = () => {
                    contentArea.replaceChildren();

                    if (activeTab === "cast") {
                        const toggleBar = document.createElement("div");
                        toggleBar.className = "h3-top-toggle-bar";

                        const charCards = {};

                        for (let i = 1; i <= 3; i++) {
                            const isChecked = !!charEnabledState[i];

                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            
                            const chk = document.createElement("input");
                            chk.type = "checkbox";
                            chk.checked = isChecked;

                            const span = document.createElement("span");
                            span.textContent = `キャラクター${i}`;

                            chip.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                charEnabledState[i] = !charEnabledState[i];
                                const active = charEnabledState[i];

                                chip.className = `h3-toggle-chip ${active ? "active" : ""}`;
                                chk.checked = active;

                                if (wMap[`char${i}_enabled`]) {
                                    wMap[`char${i}_enabled`].value = active;
                                    if (wMap[`char${i}_enabled`].callback) wMap[`char${i}_enabled`].callback(active);
                                }

                                if (charCards[i]) {
                                    charCards[i].style.display = active ? "flex" : "none";
                                }
                            };

                            chip.append(chk, span);
                            toggleBar.appendChild(chip);
                        }
                        contentArea.appendChild(toggleBar);

                        for (let i = 1; i <= 3; i++) {
                            const card = document.createElement("div");
                            card.className = "h3-char-card";
                            card.style.display = charEnabledState[i] ? "flex" : "none";

                            const title = document.createElement("div");
                            title.className = "h3-char-title";
                            title.textContent = `キャラクター ${i}`;

                            const nameRow = bindInput(`char${i}_name`, "キャラクター名", false, "キャラクター名を英語で入力");
                            const presetRow = bindInput(`char${i}_preset`, "プリセット");
                            const picRow = createPicCheckboxGroup(i);
                            const voiceRow = bindInput(`char${i}_audio`, "ボイスリファレンス");
                            const extraRow = bindInput(`char${i}_extra`, "特徴定義・追記", true, "キャラクターの特徴や追加の特徴を入力");

                            card.append(title, nameRow, presetRow, picRow, voiceRow, extraRow);
                            contentArea.appendChild(card);
                            charCards[i] = card;
                        }

                    } else if (activeTab === "timeline") {
                        const toggleBar = document.createElement("div");
                        toggleBar.className = "h3-top-toggle-bar";

                        const shotCards = {};

                        for (let i = 1; i <= 4; i++) {
                            const isChecked = !!shotEnabledState[i];

                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;

                            const chk = document.createElement("input");
                            chk.type = "checkbox";
                            chk.checked = isChecked;

                            const span = document.createElement("span");
                            span.textContent = `ショット${i}`;

                            chip.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                shotEnabledState[i] = !shotEnabledState[i];
                                const active = shotEnabledState[i];

                                chip.className = `h3-toggle-chip ${active ? "active" : ""}`;
                                chk.checked = active;

                                if (wMap[`shot${i}_enabled`]) {
                                    wMap[`shot${i}_enabled`].value = active;
                                    if (wMap[`shot${i}_enabled`].callback) wMap[`shot${i}_enabled`].callback(active);
                                }

                                if (shotCards[i]) {
                                    shotCards[i].style.display = active ? "flex" : "none";
                                }
                            };

                            chip.append(chk, span);
                            toggleBar.appendChild(chip);
                        }
                        contentArea.appendChild(toggleBar);

                        for (let i = 1; i <= 4; i++) {
                            const card = document.createElement("div");
                            card.className = "h3-char-card";
                            card.style.display = shotEnabledState[i] ? "flex" : "none";

                            const title = document.createElement("div");
                            title.className = "h3-char-title";
                            title.textContent = `ショット ${i}`;

                            const timeRow = createTimePicker(i);
                            const actionRow = bindInput(`shot${i}_action`, "アクション / 構図", true, `ショット${i}_アクション/構図`);
                            const diaBlock = createDialogueWithSpeaker(i);

                            card.append(title, timeRow, actionRow, diaBlock);
                            contentArea.appendChild(card);
                            shotCards[i] = card;
                        }

                    } else if (activeTab === "scene") {
                        contentArea.append(
                            bindInput("situation", "シチュエーション＆世界観", true, "舞台の場所、時間帯、天候、シーン全体の状況や空気感を入力"),
                            bindInput("quality_control", "禁止事項＆スタイル維持", true, "崩れ防止、画風維持、3D化禁止などのネガティブ・クオリティ指示を入力"),
                            bindInput("ambient_sound", "環境音 (Foley)", false, "足音、風の音、ドアの開閉音、雨音などの環境音・効果音を入力"),
                            bindInput("bgm", "BGM (劇伴音楽)", false, "N/AでBGM無し（曲調やジャンルを指定する場合はここに入力）")
                        );

                    } else if (activeTab === "clip") {
                        const toggleBar = document.createElement("div");
                        toggleBar.className = "h3-top-toggle-bar";
                        toggleBar.style.flexWrap = "wrap";
                        toggleBar.style.marginBottom = "8px";

                        const clipCards = {};

                        for (let i = 1; i <= 10; i++) {
                            const isChecked = !!clipEnabledState[i];
                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            chip.style.flex = "1 0 18%";
                            
                            const chk = document.createElement("input");
                            chk.type = "checkbox";
                            chk.checked = isChecked;

                            const span = document.createElement("span");
                            span.textContent = `C${i}`;

                            chip.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clipEnabledState[i] = !clipEnabledState[i];
                                const active = clipEnabledState[i];

                                chip.className = `h3-toggle-chip ${active ? "active" : ""}`;
                                chk.checked = active;

                                if (wMap[`c${i}_enabled`]) {
                                    wMap[`c${i}_enabled`].value = active;
                                    if (wMap[`c${i}_enabled`].callback) wMap[`c${i}_enabled`].callback(active);
                                }

                                if (clipCards[i]) {
                                    clipCards[i].style.display = active ? "flex" : "none";
                                }
                            };

                            chip.append(chk, span);
                            toggleBar.appendChild(chip);
                        }
                        contentArea.appendChild(toggleBar);

                        for (let i = 1; i <= 10; i++) {
                            const card = document.createElement("div");
                            card.className = "h3-char-card";
                            card.style.display = clipEnabledState[i] ? "flex" : "none";

                            const titleBar = document.createElement("div");
                            titleBar.style.display = "flex";
                            titleBar.style.alignItems = "center";
                            titleBar.style.gap = "8px";

                            const title = document.createElement("div");
                            title.className = "h3-char-title";
                            title.textContent = `クリップ ${i}`;

                            const contWidget = wMap[`c${i}_continue`];
                            const contLabel = document.createElement("label");
                            contLabel.style.fontSize = "11px";
                            contLabel.style.color = "#dbe0e6";
                            contLabel.style.display = "flex";
                            contLabel.style.alignItems = "center";
                            contLabel.style.gap = "4px";
                            contLabel.style.cursor = "pointer";

                            const contChk = document.createElement("input");
                            contChk.type = "checkbox";
                            contChk.checked = contWidget ? !!contWidget.value : true;
                            contChk.onchange = () => {
                                if (contWidget) {
                                    contWidget.value = contChk.checked;
                                    if (contWidget.callback) contWidget.callback(contChk.checked);
                                }
                            };
                            contLabel.append(contChk, document.createTextNode("前回の動画の続きを生成する"));

                            titleBar.append(title, contLabel);

                            const promptRow = bindInput(`c${i}_prompt`, null, true, "ここに日本語でプロンプトの指示を記入してください");

                            card.append(titleBar, promptRow);
                            contentArea.appendChild(card);
                            clipCards[i] = card;
                        }

                    } else if (activeTab === "llm") {
                        const titleLLM = document.createElement("div");
                        titleLLM.className = "h3-char-title";
                        titleLLM.textContent = "LLM連携設定";

                        contentArea.append(
                            titleLLM,
                            bindInput("llm_provider", "プロバイダの選択"),
                            bindInput("llm_api_key", "APIキー (Windows環境変数登録済みの場合は空欄可)"),
                            bindInput("llm_model", "モデル名 (例: gemini-2.5-flash, qwen2.5:7b-instruct-q5_K_M)"),
                            bindInput("creative_mode", "[LLM] 演出/あそび (光・空気感・情景の自動補完)")
                        );

                    } else if (activeTab === "prompt") {
                        const titlePrompt = document.createElement("div");
                        titlePrompt.className = "h3-char-title";
                        titlePrompt.textContent = "MiniMax H3 構造化プロンプト生成";

                        const genBtn = document.createElement("button");
                        genBtn.className = "h3-btn-gen-prompt";
                        genBtn.innerHTML = `<span>▶ プロンプト生成を実行</span>`;

                        const ta = document.createElement("textarea");
                        ta.className = "h3-prompt-textarea";
                        ta.placeholder = "［▶ プロンプト生成を実行］ボタンを押すと、入力項目をもとにLLMが構築したMiniMax H3専用プロンプトがここに出力されます。\n出力された内容は自由に直接編集・追記できます。";
                        
                        const customWidget = wMap["custom_prompt"];
                        if (customWidget && customWidget.value) {
                            ta.value = customWidget.value;
                        }

                        ta.oninput = () => {
                            if (customWidget) {
                                customWidget.value = ta.value;
                                if (customWidget.callback) customWidget.callback(ta.value);
                            }
                        };

                        const useWidget = wMap["use_custom_prompt"];
                        const banner = document.createElement("div");
                        banner.className = "h3-use-prompt-banner";

                        const chk = document.createElement("input");
                        chk.type = "checkbox";
                        chk.checked = useWidget ? !!useWidget.value : false;

                        const txtGroup = document.createElement("div");
                        txtGroup.innerHTML = `<span class="h3-use-prompt-text">このプロンプトで動画を生成する</span><span class="h3-use-prompt-sub">(生成時にLLMを実行せずこのプロンプトを使用 / OllamaはVRAM解放)</span>`;

                        banner.onclick = (e) => {
                            if (e.target !== chk) chk.checked = !chk.checked;
                            if (useWidget) {
                                useWidget.value = chk.checked;
                                if (useWidget.callback) useWidget.callback(chk.checked);
                            }
                        };

                        banner.append(chk, txtGroup);

                        const clipResContainer = document.createElement("div");
                        clipResContainer.style.display = "flex";
                        clipResContainer.style.flexDirection = "column";
                        clipResContainer.style.gap = "4px";

                        const updateClipResultsUI = (clipData) => {
                            clipResContainer.replaceChildren();
                            if (!clipData || Object.keys(clipData).length === 0) return;
                            
                            for (let i = 1; i <= 10; i++) {
                                if (clipData[i]) {
                                    const t = document.createElement("div");
                                    t.className = "h3-clip-result-title";
                                    t.textContent = `クリップ ${i}`;
                                    
                                    const box = document.createElement("div");
                                    box.className = "h3-clip-result-text";
                                    box.textContent = clipData[i];
                                    
                                    clipResContainer.append(t, box);
                                }
                            }
                        };

                        const genClipWidget = wMap["generated_clip_prompts"];
                        if (genClipWidget && genClipWidget.value) {
                            try {
                                updateClipResultsUI(JSON.parse(genClipWidget.value));
                            } catch(e){}
                        }

                        genBtn.onclick = async () => {
                            genBtn.disabled = true;
                            genBtn.innerHTML = `<span>⏳ プロンプト構築中... (LLM通信中)</span>`;

                            const payload = {};
                            node.widgets.forEach(w => {
                                payload[w.name] = w.value;
                            });

                            for (let i = 1; i <= 3; i++) payload[`char${i}_enabled`] = charEnabledState[i];
                            for (let i = 1; i <= 4; i++) payload[`shot${i}_enabled`] = shotEnabledState[i];
                            for (let i = 1; i <= 10; i++) payload[`c${i}_enabled`] = clipEnabledState[i];

                            try {
                                const res = await api.fetchApi("/h3/generate_prompt", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(payload)
                                });
                                const data = await res.json();
                                if (data.success) {
                                    if (data.prompt) {
                                        ta.value = data.prompt;
                                        if (customWidget) {
                                            customWidget.value = data.prompt;
                                            if (customWidget.callback) customWidget.callback(data.prompt);
                                        }
                                    }
                                    if (data.clip_prompts) {
                                        const strData = JSON.stringify(data.clip_prompts);
                                        if (genClipWidget) {
                                            genClipWidget.value = strData;
                                            if (genClipWidget.callback) genClipWidget.callback(strData);
                                        }
                                        updateClipResultsUI(data.clip_prompts);
                                    }

                                    chk.checked = true;
                                    if (useWidget) {
                                        useWidget.value = true;
                                        if (useWidget.callback) useWidget.callback(true);
                                    }
                                } else {
                                    alert("プロンプト生成エラー: " + (data.error || "不明なエラー"));
                                }
                            } catch (err) {
                                alert("通信エラー: " + err.message);
                            } finally {
                                genBtn.disabled = false;
                                genBtn.innerHTML = `<span>▶ プロンプト生成を実行</span>`;
                            }
                        };

                        contentArea.append(titlePrompt, genBtn, banner, ta, clipResContainer);
                    }
                };

                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.hidden = true;
                let activeSlotConfig = null;

                fileInput.onchange = async () => {
                    if (fileInput.files.length > 0 && activeSlotConfig) {
                        const file = fileInput.files[0];
                        const form = new FormData();
                        form.append("image", file, file.name);
                        form.append("type", "input");
                        const res = await api.fetchApi("/upload/image", { method: "POST", body: form });
                        const json = await res.json();
                        const { type, index } = activeSlotConfig;
                        state.items = state.items.filter(it => !((it.laneType || it.type) === type && it.slot === index));
                        state.items.push({ type: type, value: json.name, slot: index, laneType: type });
                        if (wMap["timeline_data"]) {
                            wMap["timeline_data"].value = JSON.stringify(state);
                            if (wMap["timeline_data"].callback) wMap["timeline_data"].callback(wMap["timeline_data"].value);
                        }
                        renderFixedMediaLanes();
                    }
                };

                const buildSlot = (laneEl, laneType, slotIdx, tagName, acceptTypes, badgeText = null, isKeyframe = false) => {
                    const slot = document.createElement("div");
                    const slotClass = isKeyframe ? "keyframe-slot" : `${laneType}-slot`;
                    slot.className = `h3-slot ${slotClass}`;

                    const item = state.items.find(it => (it.laneType || it.type) === laneType && it.slot === slotIdx);

                    const badge = document.createElement("span");
                    badge.className = "h3-slot-badge";
                    badge.textContent = badgeText !== null ? badgeText : `#${slotIdx}`;
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

                        if (tagName) {
                            const btn = document.createElement("button");
                            btn.className = "h3-slot-tag-btn";
                            btn.textContent = `+ ${tagName}`;
                            btn.onclick = (e) => {
                                e.stopPropagation();
                                insertTagToFocusOrScene(`<${tagName}>`);
                            };
                            slot.appendChild(btn);
                        }

                        const del = document.createElement("button");
                        del.className = "h3-slot-del-btn";
                        del.textContent = "×";
                        del.onclick = (e) => {
                            e.stopPropagation();
                            state.items = state.items.filter(it => !((it.laneType || it.type) === laneType && it.slot === slotIdx));
                            if (wMap["timeline_data"]) {
                                wMap["timeline_data"].value = JSON.stringify(state);
                                if (wMap["timeline_data"].callback) wMap["timeline_data"].callback(wMap["timeline_data"].value);
                            }
                            renderFixedMediaLanes();
                        };
                        slot.appendChild(del);
                    } else {
                        const add = document.createElement("div");
                        add.className = "h3-slot-add";
                        add.textContent = "+";
                        slot.appendChild(add);

                        slot.onclick = () => {
                            activeSlotConfig = { type: laneType, index: slotIdx };
                            fileInput.accept = acceptTypes;
                            fileInput.click();
                        };
                    }

                    slot.ondragover = (e) => e.preventDefault();
                    slot.ondrop = async (e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files.length > 0) {
                            const file = e.dataTransfer.files[0];
                            const form = new FormData();
                            form.append("image", file, file.name);
                            form.append("type", "input");
                            const res = await api.fetchApi("/upload/image", { method: "POST", body: form });
                            const json = await res.json();
                            state.items = state.items.filter(it => !((it.laneType || it.type) === laneType && it.slot === slotIdx));
                            state.items.push({ type: laneType, value: json.name, slot: slotIdx, laneType: laneType });
                            if (wMap["timeline_data"]) {
                                wMap["timeline_data"].value = JSON.stringify(state);
                                if (wMap["timeline_data"].callback) wMap["timeline_data"].callback(wMap["timeline_data"].value);
                            }
                            renderFixedMediaLanes();
                        }
                    };

                    laneEl.appendChild(slot);
                };

                const renderFixedMediaLanes = () => {
                    mediaBody.replaceChildren();

                    const imgBlock = document.createElement("div");
                    imgBlock.className = "h3-lane-block";
                    imgBlock.innerHTML = `<div class="h3-section-title">リファレンス画像 <span class="h3-section-sub">(Picture 0-8)</span></div>`;
                    const imgLane = document.createElement("div");
                    imgLane.className = "h3-lane";
                    imgBlock.appendChild(imgLane);
                    for (let i = 0; i < 9; i++) {
                        buildSlot(imgLane, "image", i, `Picture ${i}`, "image/*");
                    }

                    const kfBlock = document.createElement("div");
                    kfBlock.className = "h3-lane-block";
                    kfBlock.innerHTML = `<div class="h3-section-title">キーフレーム画像 <span class="h3-section-sub">(First Frame / Last Frame)</span></div>`;
                    const kfLane = document.createElement("div");
                    kfLane.className = "h3-lane";
                    kfBlock.appendChild(kfLane);
                    buildSlot(kfLane, "keyframe", 0, null, "image/*", "開始", true);
                    buildSlot(kfLane, "keyframe", 1, null, "image/*", "終了", true);

                    const vidBlock = document.createElement("div");
                    vidBlock.className = "h3-lane-block";
                    vidBlock.innerHTML = `<div class="h3-section-title">リファレンス映像 <span class="h3-section-sub">(Video 0-1)</span></div>`;
                    const vidLane = document.createElement("div");
                    vidLane.className = "h3-lane";
                    vidBlock.appendChild(vidLane);
                    for (let i = 0; i < 2; i++) {
                        buildSlot(vidLane, "video", i, `Video ${i}`, "video/*");
                    }

                    const audBlock = document.createElement("div");
                    audBlock.className = "h3-lane-block";
                    audBlock.innerHTML = `<div class="h3-section-title">リファレンス音声 <span class="h3-section-sub">(Audio 0-2)</span></div>`;
                    const audLane = document.createElement("div");
                    audLane.className = "h3-lane";
                    audBlock.appendChild(audLane);
                    for (let i = 0; i < 3; i++) {
                        buildSlot(audLane, "audio", i, `Audio ${i}`, "audio/*");
                    }

                    mediaBody.append(imgBlock, kfBlock, vidBlock, audBlock);
                };

                // 【安定版の処理】DOMの追加 (余白などの計算を標準のLiteGraphに任せる)
                if (node.addDOMWidget) {
                    node.addDOMWidget("studio_console_ui", "custom", root, {
                        serialize: false,
                        hideOnZoom: false,
                        getHeight: () => 820
                    });
                }

                // 【安定版の処理】ノードの初期サイズ
                node.setSize([720, 905]);

                // 【安定版の処理】リサイズ時の幅・高さ制御
                const onResize = node.onResize;
                node.onResize = function (size) {
                    if (size[0] < 720) size[0] = 720;
                    if (size[1] < 905) size[1] = 905;
                    
                    if (root) {
                        root.style.width = (size[0] - 20) + "px";
                        root.style.height = (size[1] - 85) + "px"; 
                    }
                    
                    if (onResize) onResize.apply(this, arguments);
                };

                renderTabContent();
                renderFixedMediaLanes();

                const onConfigure = node.onConfigure;
                node.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    for (let i = 1; i <= 3; i++) {
                        if (wMap[`char${i}_enabled`]) charEnabledState[i] = !!wMap[`char${i}_enabled`].value;
                    }
                    for (let i = 1; i <= 4; i++) {
                        if (wMap[`shot${i}_enabled`]) shotEnabledState[i] = !!wMap[`shot${i}_enabled`].value;
                    }
                    for (let i = 1; i <= 10; i++) {
                        if (wMap[`c${i}_enabled`]) clipEnabledState[i] = !!wMap[`c${i}_enabled`].value;
                    }
                    try {
                        if (wMap["timeline_data"] && wMap["timeline_data"].value) {
                            state = JSON.parse(wMap["timeline_data"].value);
                        }
                    } catch (e) {}
                    renderTabContent();
                    renderFixedMediaLanes();
                    
                    // 【安定版の処理】ロード後のサイズ修復
                    if (node.size[0] < 720 || node.size[1] < 905) {
                        node.setSize([Math.max(720, node.size[0]), Math.max(905, node.size[1])]);
                    }
                    if (root) {
                        root.style.width = (node.size[0] - 20) + "px";
                        root.style.height = (node.size[1] - 60) + "px";
                    }
                };
            };
        }
    }
});