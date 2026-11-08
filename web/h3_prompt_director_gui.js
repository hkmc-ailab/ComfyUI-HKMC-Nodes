import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function h3ParseClipSettings(value) {
    try {
        const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

if (!window._h3_gui_queue_hooked) {
    window._h3_gui_queue_hooked = true;
    const origToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function () {
        const res = await origToPrompt.apply(this, arguments);
        const p = res.output;
        let needsUiUpdate = false;

        for (const [id, node] of Object.entries(p)) {
            if (node.class_type === "H3PromptDirector_MV" || node.class_type === "H3PromptDirectorGUI") {
                let jsonStr = node.inputs["clips_data_json"];
                if (jsonStr) {
                    try {
                        let data = h3ParseClipSettings(jsonStr);
                        if (!data.cache_settings) data.cache_settings = {};
                        
                        let hasChanged = false;
                        for (let i = 1; i <= 14; i++) {
                            if (!data.cache_settings[i]) continue;
                            
                            if (data.cache_settings[i].seed === -1) {
                                let newSeed = Math.floor(Math.random() * 1125899906842624) + 1;
                                data.cache_settings[i].seed = newSeed;
                                data.cache_settings[i].last_seed = newSeed;
                                hasChanged = true;
                                
                                const gNode = app.graph.getNodeById(Number(id));
                                if (gNode) {
                                    const w = gNode.widgets?.find(w => w.name === "clips_data_json");
                                    if (w) {
                                        let wData = h3ParseClipSettings(w.value);
                                        if (!wData.cache_settings) wData.cache_settings = {};
                                        if (!wData.cache_settings[i]) wData.cache_settings[i] = { seed: -1, save_latent: false };
                                        wData.cache_settings[i].last_seed = newSeed;
                                        w.value = JSON.stringify(wData);
                                        needsUiUpdate = true;
                                    }
                                }
                            } else {
                                data.cache_settings[i].last_seed = data.cache_settings[i].seed;
                                const gNode = app.graph.getNodeById(Number(id));
                                if (gNode) {
                                    const w = gNode.widgets?.find(w => w.name === "clips_data_json");
                                    if (w) {
                                        let wData = h3ParseClipSettings(w.value);
                                        if (!wData.cache_settings) wData.cache_settings = {};
                                        if (!wData.cache_settings[i]) wData.cache_settings[i] = { seed: -1, save_latent: false };
                                        wData.cache_settings[i].last_seed = data.cache_settings[i].seed;
                                        w.value = JSON.stringify(wData);
                                        needsUiUpdate = true;
                                    }
                                }
                            }
                        }
                        if (hasChanged) {
                            node.inputs["clips_data_json"] = JSON.stringify(data);
                        }
                    } catch(e) { console.error(e); }
                }
            }
        }
        
        if (needsUiUpdate) {
            document.dispatchEvent(new CustomEvent("h3_seeds_updated"));
        }
        
        return res;
    };
}

const H3_RESET_SECTIONS = [
    { id: "cast", label: "キャラクター設定" },
    { id: "timeline", label: "タイムライン" },
    { id: "scene", label: "演出" },
    { id: "clip", label: "クリップ" },
    { id: "auto", label: "おまかせ" },
    { id: "prompt", label: "プロンプト生成" }
];

function h3ResetFieldNames(selected) {
    const names = new Set();
    const add = (...fields) => fields.forEach(field => names.add(field));
    if (selected.cast) {
        for (let i = 1; i <= 5; i++) {
            for (const field of ["enabled", "preset", "name", "refmod", "pics", "audio", "extra"])
                add(`char${i}_${field}`);
        }
        add("timeline_data");
    }
    if (selected.timeline) {
        for (let i = 1; i <= 4; i++) {
            for (const field of ["enabled", "time", "action", "speaker", "dialogue"])
                add(`shot${i}_${field}`);
        }
    }
    if (selected.scene) {
        add("situation", "overall_story", "quality_control", "retention_choices_json", "ambient_sound", "bgm");
        for (let i = 1; i <= 5; i++) {
            for (const field of ["kind", "def", "pics", "audio"])
                add(`subject_${field}_${i}`);
        }
    }
    if (selected.clip) {
        for (let i = 1; i <= 10; i++) {
            for (const field of ["enabled", "continue", "link_next", "prompt"])
                add(`c${i}_${field}`);
            for (let j = 1; j <= 4; j++) {
                for (const field of ["enabled", "time", "action", "speaker", "dialogue"])
                    add(`c${i}_s${j}_${field}`);
            }
        }
    }
    if (selected.auto) add("auto_data");
    if (selected.prompt) add("use_custom_prompt", "custom_prompt", "generated_clip_prompts");
    return [...names];
}

function h3ResetSelectedWidgets(wMap, freshValues, selected) {
    const clone = value => {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return value; }
    };
    for (const name of h3ResetFieldNames(selected)) {
        if (!wMap[name] || !Object.prototype.hasOwnProperty.call(freshValues, name)) continue;
        wMap[name].value = clone(freshValues[name]);
    }
    if ((selected.clip || selected.prompt) && wMap.clips_data_json) {
        const data = h3ParseClipSettings(wMap.clips_data_json.value);
        const defaults = h3ParseClipSettings(freshValues.clips_data_json);
        const resetKey = key => {
            if (Object.prototype.hasOwnProperty.call(defaults, key)) data[key] = clone(defaults[key]);
            else delete data[key];
        };
        if (selected.clip) {
            resetKey("cache_settings");
            for (let i = 1; i <= 10; i++) resetKey(`c${i}_locked`);
        }
        if (selected.prompt) resetKey("base_locked");
        wMap.clips_data_json.value = JSON.stringify(data);
        if (wMap.clips_data_json.callback) wMap.clips_data_json.callback(wMap.clips_data_json.value);
    }
}

function syncRefModRemote(slotIndex, modName) {
    if (!app.graph) return;

    const allNodes = [];
    const traverseGraph = (g) => {
        if (!g || !g._nodes) return;
        g._nodes.forEach(node => {
            allNodes.push(node);
            if (node.subgraph) {
                traverseGraph(node.subgraph);
            }
        });
    };
    traverseGraph(app.graph);

    const targetNode = allNodes.find(n => n.type === "MiniMaxH3RefModsLoader");
    if (!targetNode) {
        console.warn("[HKMC Remote] MiniMaxH3RefModsLoader が見つかりませんでした。");
        return;
    }

    const targetWidgetName = `mod_${slotIndex}`;
    const targetWidget = targetNode.widgets?.find(w => w.name === targetWidgetName);

    if (targetWidget) {
        const valToSet = (modName === "None" || !modName) ? "(none)" : modName;

        if (targetWidget.options?.values?.includes(valToSet)) {
            targetWidget.value = valToSet;
            if (targetWidget.callback) {
                targetWidget.callback(valToSet);
            }
            targetNode.setDirtyCanvas(true, true);
            console.log(`[HKMC Remote] 遠隔反映成功: ${targetWidgetName} -> ${valToSet}`);
        } else {
            console.warn(`[HKMC Remote] 選択肢に ${valToSet} が存在しません。`);
        }
    }
}

const h3BackgroundRoots = new Set();
let h3BackgroundTimer = null;
let h3BackgroundRequestRunning = false;
let h3BackgroundCurrentUrl = "";

function h3ApplyBackground(root, url) {
    root.classList.toggle("h3-has-background", !!url);
    if (url) root.style.setProperty("--h3-background-image", `url("${url}")`);
    else root.style.removeProperty("--h3-background-image");
}

async function h3RefreshBackground() {
    if (!h3BackgroundRoots.size || h3BackgroundRequestRunning) return;
    h3BackgroundRequestRunning = true;
    try {
        const response = await api.fetchApi("/h3/node_background/status", { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json();
        const version = typeof status.version === "string" && /^\d+-\d+$/.test(status.version)
            ? status.version : "";
        const url = status.enabled && version
            ? `/h3/node_background?v=${encodeURIComponent(version)}` : "";
        if (url === h3BackgroundCurrentUrl) return;
        h3BackgroundCurrentUrl = url;
        for (const root of h3BackgroundRoots) h3ApplyBackground(root, url);
    } catch (_) {
    } finally {
        h3BackgroundRequestRunning = false;
    }
}

function h3SubscribeBackground(root) {
    h3BackgroundRoots.add(root);
    h3ApplyBackground(root, h3BackgroundCurrentUrl);
    h3RefreshBackground();
    if (h3BackgroundTimer === null) h3BackgroundTimer = setInterval(h3RefreshBackground, 8000);
}

function h3UnsubscribeBackground(root) {
    h3BackgroundRoots.delete(root);
    if (!h3BackgroundRoots.size && h3BackgroundTimer !== null) {
        clearInterval(h3BackgroundTimer);
        h3BackgroundTimer = null;
    }
}

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
        .h3-studio-container.h3-has-background::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: var(--h3-background-image);
            background-size: cover;
            background-position: center center;
            background-repeat: no-repeat;
            opacity: 0.38;
            pointer-events: none;
            z-index: 0;
        }
        .h3-studio-container > * {
            position: relative;
            z-index: 1;
        }
        .h3-studio-container.h3-has-background .h3-tab-bar,
        .h3-studio-container.h3-has-background .h3-tab-content,
        .h3-studio-container.h3-has-background .h3-fixed-media-area,
        .h3-studio-container.h3-has-background .h3-media-body {
            background: transparent;
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
            background: #007acc;
            border-color: #5bb3f5;
            color: #ffffff;
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
        /* Collapsible widgets: applies to Timeline, Scene and Clip only. */
        .h3-collapse-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-height: 25px;
        }
        .h3-collapse-header > .h3-char-title,
        .h3-collapse-header > label {
            min-width: 0;
            flex: 1 1 auto;
        }
        .h3-collapse-toggle {
            display: inline-flex;
            justify-content: center;
            align-items: center;
            flex: 0 0 27px;
            width: 27px;
            height: 25px;
            padding: 0;
            margin-left: auto;
            border: 1px solid #454a50;
            border-radius: 6px;
            background: #22262b;
            color: #e9edf3;
            font-size: 13px;
            font-weight: bold;
            line-height: 1;
            cursor: pointer;
        }
        .h3-collapse-toggle:hover {
            background: #303943;
            border-color: #5bb3f5;
        }
        .h3-collapse-toggle:focus-visible {
            outline: 2px solid #5bb3f5;
            outline-offset: 2px;
        }
        .h3-collapse-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
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
        .h3-guided-card {
            font-size: 11px;
            line-height: 1.5;
        }
        .h3-guided-intro {
            font-size: 10px;
            line-height: 1.6;
            color: #9aa0a6;
        }
        .h3-guided-settings label {
            font-size: 10px;
            font-weight: 600;
            color: #aeb7c2;
        }
        .h3-guided-section-label {
            font-size: 11px;
            font-weight: 600;
            color: #dbe0e6;
        }
        .h3-guided-hint {
            font-size: 9px;
            font-weight: 400;
            color: #8b949e;
        }
        .h3-guided-drafts {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .h3-guided-shot-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .h3-guided-shot-label {
            font-size: 10px;
            font-weight: 400;
            color: #9aa0a6;
        }
        .h3-guided-shot-number {
            font-size: 11px;
            font-weight: 700;
            color: #dbe0e6;
        }
        .h3-guided-step-title {
            display: flex;
            align-items: baseline;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #dbe0e6;
        }
        .h3-guided-step-detail {
            font-size: 10px;
            font-weight: 600;
            color: #aeb7c2;
        }
        .h3-guided-field-label {
            font-size: 10px;
            font-weight: 600;
            color: #9aa0a6;
        }
        .h3-guided-card select,
        .h3-guided-card input,
        .h3-guided-card textarea {
            font-size: 11px;
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
            flex-shrink: 0;
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
            flex-shrink: 0;
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
            flex-shrink: 0;
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
        
        .h3-clip-results-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1 1 auto;
            overflow-y: auto;
            padding-right: 4px;
        }
        .h3-clip-results-container::-webkit-scrollbar {
            width: 6px;
        }
        .h3-clip-results-container::-webkit-scrollbar-thumb {
            background: #383838;
            border-radius: 3px;
        }
        .h3-clip-result-title {
            font-size: 11px;
            font-weight: bold;
            color: #ffffff;
            margin-top: 4px;
            flex-shrink: 0;
        }
        .h3-clip-result-textarea {
            width: 100%;
            min-height: 120px;
            background: #181818;
            border: 1px solid #383838;
            border-radius: 8px;
            color: #dbe0e6;
            font-family: Consolas, "Courier New", monospace;
            font-size: 11px;
            line-height: 1.45;
            padding: 8px;
            box-sizing: border-box;
            resize: vertical;
            outline: none;
            flex-shrink: 0;
        }
        .h3-clip-result-textarea:focus {
            border-color: #6e7681;
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
        .h3-tag-btn-bar {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 4px 0 2px 0;
            flex-wrap: wrap;
        }
        .h3-tag-btn {
            background: #18191c;
            border: 1px solid #333842;
            color: #8bb4dc;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 7px;
            border-radius: 4px;
            cursor: pointer;
            user-select: none;
            transition: all 0.12s;
            line-height: 1.2;
        }
        .h3-tag-btn:hover {
            background: #232834;
            border-color: #5bb3f5;
            color: #ffffff;
        }
        .h3-tag-btn.audio-tag {
            color: #7ecf9d;
            border-color: #2b4535;
        }
        .h3-tag-btn.audio-tag:hover {
            border-color: #7ecf9d;
            background: #1e3327;
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
                const H3_MIN_WIDTH = 850;
                const H3_MIN_HEIGHT = 1110;
                let h3Disposed = false;
                let h3SeedRefreshPending = false;
                let h3SeedRefreshFrame = null;
                let h3DragCleanup = null;

                const wMap = {};
                (node.widgets || []).forEach(w => {
                    wMap[w.name] = w;
                    w.draw = function () {};
                    w.computeSize = () => [0, -4];
                    if (w.inputEl) w.inputEl.style.display = "none";
                });

                let clipData = h3ParseClipSettings(wMap["clips_data_json"]?.value);

                const saveClipData = () => {
                    if (wMap["clips_data_json"]) {
                        wMap["clips_data_json"].value = JSON.stringify(clipData);
                        if (wMap["clips_data_json"].callback) wMap["clips_data_json"].callback(wMap["clips_data_json"].value);
                    }
                };
                const retentionRead = () => {
                    try { return JSON.parse(wMap.retention_choices_json?.value || "{}"); }
                    catch (_) { return {}; }
                };
                const retentionWrite = (data) => {
                    const w = wMap.retention_choices_json;
                    if (w) { w.value = JSON.stringify(data); if (w.callback) w.callback(w.value); }
                };
                const createRetentionSettings = () => {
                    const panel = document.createElement("div");
                    panel.className = "h3-char-card";
                    panel.style.marginTop = "8px";
                    const heading = document.createElement("div");
                    heading.className = "h3-char-title";
                    heading.textContent = "参照要素の保持設定（retention_analysis）";
                    panel.appendChild(heading);
                    const note = document.createElement("div");
                    note.style.cssText = "font-size:11px;color:#b7c0ca;line-height:1.6;margin-bottom:8px;";
                    note.textContent = "人物・物の外見や背景の特徴をどの程度引き継ぐか選びます。動きやカメラ角度は固定されません。禁止事項＆スタイル維持の入力も別途反映されます。";
                    panel.appendChild(note);
                    const data = retentionRead();
                    const visual = [
                        ["fully_preserved", "完全に維持（顔・形・色などを保つ）"],
                        ["partially_preserved", "特徴を維持（構図・景色は変化可）"],
                        ["weak_reference", "雰囲気だけ参考（自由度高め）"],
                        ["attribute_transfer", "特徴を別の要素へ転用（転用先指定）"]
                    ];
                    const audio = [
                        ["fully_copy", "音声をそのまま保持"],
                        ["partially_copy", "音声の一部を保持"],
                        ["reference", "声質・音の特徴を参考"],
                        ["weak_reference", "音の雰囲気だけ参考"]
                    ];
                    const addChoice = (title, key, choices, defaultValue, targets) => {
                        const row = document.createElement("div");
                        row.style.cssText = "padding:7px 0;border-top:1px solid #343434;display:flex;flex-direction:column;gap:4px;";
                        const label = document.createElement("label");
                        label.style.cssText = "font-size:12px;color:#e5e5e5;";
                        label.textContent = title;
                        const select = document.createElement("select");
                        select.style.cssText = "width:100%;background:#252525;color:#eee;border:1px solid #555;border-radius:5px;padding:6px;";
                        for (const [value, text] of choices) {
                            const opt = document.createElement("option"); opt.value = value; opt.textContent = text; select.appendChild(opt);
                        }
                        select.value = choices.some(x => x[0] === data[key]) ? data[key] : defaultValue;
                        const targetSelect = document.createElement("select");
                        targetSelect.style.cssText = select.style.cssText;
                        if (targets) {
                            const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "転用先を選択"; targetSelect.appendChild(placeholder);
                            for (const t of targets) { const opt = document.createElement("option"); opt.value = String(t); opt.textContent = `S${t} へ転用`; targetSelect.appendChild(opt); }
                            targetSelect.value = data[key.replace("subject_", "target_")] || "";
                            targetSelect.onchange = () => { const d = retentionRead(); d[key.replace("subject_", "target_")] = targetSelect.value; retentionWrite(d); };
                            const updateTarget = () => { targetSelect.style.display = select.value === "attribute_transfer" ? "block" : "none"; };
                            select.addEventListener("change", updateTarget);
                            updateTarget();
                        }
                        select.onchange = () => { const d = retentionRead(); d[key] = select.value; retentionWrite(d); };
                        row.append(label, select);
                        if (targets) row.appendChild(targetSelect);
                        panel.appendChild(row);
                    };
                    const activeSubjects = [];
                    for (let i = 1; i <= 5; i++) {
                        if (charEnabledState[i] || String(wMap[`subject_def_${i}`]?.value || "").trim()) activeSubjects.push(i);
                    }
                    for (const i of activeSubjects) {
                        const isChar = !!charEnabledState[i];
                        const kind = isChar ? "人物" : (wMap[`subject_kind_${i}`]?.value || "オブジェクト");
                        const name = isChar ? (wMap[`char${i}_name`]?.value || "キャラクター") : (String(wMap[`subject_def_${i}`]?.value || "").slice(0, 28));
                        addChoice(`S${i}［${kind}］ ${name}`, `subject_${i}`, visual,
                            kind === "背景" ? "partially_preserved" : "fully_preserved", activeSubjects.filter(n => n !== i));
                    }
                    const audioSet = new Set();
                    for (const i of activeSubjects) {
                        const raw = charEnabledState[i] ? String(wMap[`char${i}_audio`]?.value || "") : String(wMap[`subject_audio_${i}`]?.value || "");
                        for (const match of raw.matchAll(/<Audio\s+([1-3])>/gi)) audioSet.add(match[1]);
                    }
                    for (const n of [...audioSet].sort()) addChoice(`A${n}［参照音声］`, `audio_${n}`, audio, "reference");
                    if (!activeSubjects.length) {
                        const empty = document.createElement("div"); empty.textContent = "定義済みの要素はありません。"; panel.appendChild(empty);
                    }
                    return panel;
                };
                const getV = (key, def) => {
                    clipData = h3ParseClipSettings(clipData);
                    return clipData[key] !== undefined ? clipData[key] : def;
                };
                const setV = (key, val) => {
                    clipData = h3ParseClipSettings(clipData);
                    clipData[key] = val;
                    saveClipData();
                };


                for (let i = 1; i <= 5; i++) {
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
                    for (let j = 1; j <= 4; j++) {
                        if (wMap[`c${i}_s${j}_enabled`] && wMap[`c${i}_s${j}_enabled`].value === undefined) {
                            wMap[`c${i}_s${j}_enabled`].value = (j === 1);
                        }
                    }
                }
                
                if (wMap["auto_data"] && wMap["auto_data"].value === undefined) {
                    wMap["auto_data"].value = "{}";
                }

                const h3ResetSelection = Object.fromEntries(H3_RESET_SECTIONS.map(section => [section.id, true]));

                const h3FreshWidgetValues = {};
                for (const [name, widget] of Object.entries(wMap)) {
                    const value = widget.value;
                    if (value !== undefined) {
                        try { h3FreshWidgetValues[name] = JSON.parse(JSON.stringify(value)); }
                        catch (_) { h3FreshWidgetValues[name] = value; }
                    }
                }

                const charEnabledState = {};
                for(let i=1; i<=5; i++) charEnabledState[i] = wMap[`char${i}_enabled`] ? !!wMap[`char${i}_enabled`].value : (i===1);

                const shotEnabledState = {};
                for(let i=1; i<=4; i++) shotEnabledState[i] = wMap[`shot${i}_enabled`] ? !!wMap[`shot${i}_enabled`].value : (i===1);

                const clipEnabledState = {};
                for(let i=1; i<=10; i++) clipEnabledState[i] = wMap[`c${i}_enabled`] ? !!wMap[`c${i}_enabled`].value : false;

                const clipShotEnabledState = {};
                for(let i=1; i<=10; i++) {
                    clipShotEnabledState[i] = {};
                    for(let j=1; j<=4; j++) {
                        clipShotEnabledState[i][j] = wMap[`c${i}_s${j}_enabled`] ? !!wMap[`c${i}_s${j}_enabled`].value : (j===1);
                    }
                }

                let autoState = {
                    enabled: false,
                    directorMode: "detailed",
                    overwrite: false,
                    noClips: false,
                    duration: 5,
                    clipCount: 1,
                    story: ""
                };
                try {
                    const savedAuto = JSON.parse(wMap["auto_data"].value);
                    if (Object.keys(savedAuto).length > 0) {
                        autoState = { ...autoState, ...savedAuto };
                    }
                } catch(e){}

                const saveAutoState = () => {
                    if (wMap["auto_data"]) {
                        wMap["auto_data"].value = JSON.stringify(autoState);
                    }
                };

                if (!autoState.uiCollapsed || typeof autoState.uiCollapsed !== "object" ||
                    Array.isArray(autoState.uiCollapsed)) autoState.uiCollapsed = {};

                const makeCollapsible = (card, key, heading = null) => {
                    const header = document.createElement("div");
                    header.className = "h3-collapse-header";
                    let title = heading;
                    if (!title) {
                        title = Array.from(card.children).find(child => child.classList?.contains("h3-char-title"));
                    }
                    if (title) {
                        title.remove();
                        header.appendChild(title);
                    }
                    const toggle = document.createElement("button");
                    toggle.type = "button";
                    toggle.className = "h3-collapse-toggle";
                    const body = document.createElement("div");
                    body.className = "h3-collapse-body";
                    body.id = `h3-fold-${node.id}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                    while (card.firstChild) body.appendChild(card.firstChild);
                    header.appendChild(toggle);
                    card.append(header, body);
                    const setCollapsed = (collapsed, store = true) => {
                        body.style.display = collapsed ? "none" : "flex";
                        toggle.textContent = collapsed ? "▼" : "▲";
                        toggle.setAttribute("aria-expanded", String(!collapsed));
                        toggle.setAttribute("aria-label", `${title?.textContent?.trim() || key}を${collapsed ? "開く" : "閉じる"}`);
                        toggle.title = collapsed ? "開く" : "閉じる";
                        if (store) {
                            autoState.uiCollapsed[key] = collapsed;
                            saveAutoState();
                        }
                    };
                    toggle.setAttribute("aria-controls", body.id);
                    toggle.onclick = (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setCollapsed(body.style.display !== "none");
                    };
                    const initiallyCollapsed = Object.prototype.hasOwnProperty.call(autoState.uiCollapsed, key)
                        ? autoState.uiCollapsed[key] === true : key === "timeline-ai-revision";
                    setCollapsed(initiallyCollapsed, false);
                    return { header, body, toggle, setCollapsed };
                };

                const sceneFieldCard = (widgetName, label, multiline, placeholder) => {
                    const row = bindInput(widgetName, label, multiline, placeholder);
                    const card = document.createElement("div");
                    card.className = "h3-char-card";
                    const title = row.querySelector(":scope > label");
                    card.appendChild(row);
                    makeCollapsible(card, `scene-${widgetName}`, title);
                    return card;
                };

                let activeTab = "cast";
                let activeClipTab = 1;
                let lastFocusedInput = null;
                let isMediaCollapsed = false;
                let mediaBodyHeight = 340;

                let state = { items: [] };
                try {
                    if (wMap["timeline_data"] && wMap["timeline_data"].value) {
                        state = JSON.parse(wMap["timeline_data"].value);
                    }
                } catch (e) {}
                
                const onH3SeedsUpdated = () => {
                    if (h3Disposed || h3SeedRefreshPending) return;
                    h3SeedRefreshPending = true;
                    h3SeedRefreshFrame = requestAnimationFrame(() => {
                        h3SeedRefreshPending = false;
                        h3SeedRefreshFrame = null;
                        if (h3Disposed) return;
                        clipData = h3ParseClipSettings(wMap["clips_data_json"]?.value);
                        if (activeTab === "cache") renderTabContent();
                    });
                };
                document.addEventListener("h3_seeds_updated", onH3SeedsUpdated);

                const root = document.createElement("div");
                root.className = "h3-studio-container";
                h3SubscribeBackground(root);

                const GUI_Y_OFFSET = -14;
                root.style.transform = `translateY(${GUI_Y_OFFSET}px)`;

                const tabBar = document.createElement("div");
                tabBar.className = "h3-tab-bar";

                const tabs = [
                    { id: "cast", label: "キャラクター設定" },
                    { id: "timeline", label: "タイムライン" },
                    { id: "scene", label: "演出" },
                    { id: "clip", label: "クリップ" },
                    { id: "auto", label: "おまかせ" },
                    { id: "llm", label: "LLM設定" },
                    { id: "irodori", label: "Irodori-TTS" },
                    { id: "prompt", label: "プロンプト生成" },
                    { id: "cache", label: "管理" }
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
                        
                        if (activeTab === "llm" || activeTab === "irodori" || activeTab === "prompt" || activeTab === "cache") {
                            fixedMediaArea.style.display = "none";
                        } else {
                            fixedMediaArea.style.display = "flex";
                        }
                        renderTabContent();
                        
                        if (node.size[0] < H3_MIN_WIDTH) {
                            node.size[0] = H3_MIN_WIDTH;
                            node.setDirtyCanvas(true, true);
                        }
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
                        if (h3DragCleanup) h3DragCleanup();
                    };

                    if (h3DragCleanup) h3DragCleanup();
                    h3DragCleanup = () => {
                        window.removeEventListener("mousemove", onMouseMove);
                        window.removeEventListener("mouseup", onMouseUp);
                        h3DragCleanup = null;
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

                const convertSubjectNamesInTextarea = async (ta) => {
                    if (!ta || ta.isComposing) return;
                    const original = ta.value;
                    const names = {};
                    for (let i = 1; i <= 5; i++) {
                        names[i] = String(charEnabledState[i]
                            ? (wMap[`char${i}_name`]?.value || "")
                            : (wMap[`subject_def_${i}`]?.value || "")).trim();
                    }
                    try {
                        const response = await api.fetchApi("/h3/convert_subject_names", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: original, names })
                        });
                        if (!response.ok) return;
                        const result = await response.json();
                        if (ta.value !== original || typeof result.text !== "string" || result.text === original) return;
                        const oldStart = ta.selectionStart, oldEnd = ta.selectionEnd;
                        ta.value = result.text;
                        ta.dispatchEvent(new Event("input", { bubbles: true }));
                        ta.focus();
                        ta.setSelectionRange(Math.min(result.text.length, oldStart), Math.min(result.text.length, oldEnd));
                    } catch (_) {  }
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
                    const chipConfig = {
                        overall_story: [5, 0],
                        quality_control: [5, 3],
                        ambient_sound: [0, 3],
                        bgm: [0, 3]
                    };
                    if (chipConfig[wName] && (el.tagName === "TEXTAREA" || el.type === "text")) {
                        const [subjects, audios] = chipConfig[wName];
                        const bar = document.createElement("div");
                        bar.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:3px 0 6px;";
                        let savedStart = String(el.value).length;
                        let savedEnd = savedStart;
                        const rememberCaret = () => {
                            if (typeof el.selectionStart === "number") {
                                savedStart = el.selectionStart;
                                savedEnd = el.selectionEnd;
                            }
                        };
                        el.addEventListener("click", rememberCaret);
                        el.addEventListener("keyup", rememberCaret);
                        el.addEventListener("select", rememberCaret);
                        el.addEventListener("blur", rememberCaret);
                        const addChip = (prefix, n, tag, color) => {
                            const button = document.createElement("button");
                            button.type = "button";
                            button.textContent = `${prefix}${n}`;
                            button.title = `カーソル位置に ${tag} を挿入`;
                            button.style.cssText = `font-size:10px;padding:3px 7px;border-radius:5px;border:1px solid #555;background:#242424;color:${color};cursor:pointer;`;
                            button.addEventListener("mousedown", e => e.preventDefault());
                            button.addEventListener("click", () => {
                                if (el.isComposing || composing) return;
                                const start = document.activeElement === el ? el.selectionStart : savedStart;
                                const end = document.activeElement === el ? el.selectionEnd : savedEnd;
                                const a = Math.max(0, Math.min(start ?? el.value.length, el.value.length));
                                const b = Math.max(a, Math.min(end ?? a, el.value.length));
                                el.value = el.value.slice(0, a) + tag + el.value.slice(b);
                                const pos = a + tag.length;
                                el.focus();
                                el.setSelectionRange(pos, pos);
                                savedStart = savedEnd = pos;
                                el.dispatchEvent(new Event("input", { bubbles: true }));
                            });
                            bar.appendChild(button);
                        };
                        let composing = false;
                        el.addEventListener("compositionstart", () => { composing = true; });
                        el.addEventListener("compositionend", () => { composing = false; rememberCaret(); });
                        for (let n = 1; n <= subjects; n++) addChip("S", n, `<Subject ${n}>`, "#a6caff");
                        if (subjects && audios) {
                            const sep = document.createElement("span");
                            sep.textContent = "│";
                            sep.style.color = "#666";
                            bar.appendChild(sep);
                        }
                        for (let n = 1; n <= audios; n++) addChip("A", n, `<Audio ${n}>`, "#89d9ac");
                        if (wName === "overall_story") {
                            const convertBtn = document.createElement("button");
                            convertBtn.type = "button";
                            convertBtn.className = "h3-tag-btn";
                            convertBtn.textContent = "コード変換";
                            convertBtn.title = "定義した名前を <Subject X> に変換";
                            convertBtn.style.marginLeft = "auto";
                            convertBtn.addEventListener("mousedown", e => e.preventDefault());
                            convertBtn.onclick = e => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!composing) convertSubjectNamesInTextarea(el);
                            };
                            bar.appendChild(convertBtn);
                        }
                        row.appendChild(bar);
                    }
                    row.appendChild(el);
                    return row;
                };

                const createTimePicker = (prefix, defaultEndSec) => {
                    const w = wMap[`${prefix}_time`];
                    const wrapper = document.createElement("div");
                    wrapper.className = "h3-time-picker-row";

                    const label = document.createElement("div");
                    label.className = "h3-time-picker-label";
                    label.textContent = "タイム指定";

                    const inputsDiv = document.createElement("div");
                    inputsDiv.className = "h3-time-picker-inputs";

                    let sM = 0, sS = 0, sMs = 0;
                    let eM = 0, eS = defaultEndSec, eMs = 0;

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
                        const ssVal = String(parseInt(inSs.value) || 0).padStart(2, "0");
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

                const createQuickTagButtons = (actionRow, prefix) => {
                    const bar = document.createElement("div");
                    bar.className = "h3-tag-btn-bar";
                    const ta = actionRow.querySelector("textarea");
                    const w = wMap[`${prefix}_action`];
                    let savedStart = ta?.value.length || 0;
                    let savedEnd = savedStart;
                    let composing = false;
                    const rememberCaret = () => {
                        if (ta && typeof ta.selectionStart === "number") {
                            savedStart = ta.selectionStart;
                            savedEnd = ta.selectionEnd;
                        }
                    };
                    if (ta) {
                        ta.addEventListener("click", rememberCaret);
                        ta.addEventListener("keyup", rememberCaret);
                        ta.addEventListener("select", rememberCaret);
                        ta.addEventListener("blur", rememberCaret);
                        ta.addEventListener("compositionstart", () => { composing = true; });
                        ta.addEventListener("compositionend", () => { composing = false; rememberCaret(); });
                    }
                    const insertTag = (tag) => {
                        if (!ta || composing) return;
                        const start = document.activeElement === ta ? ta.selectionStart : savedStart;
                        const end = document.activeElement === ta ? ta.selectionEnd : savedEnd;
                        const a = Math.max(0, Math.min(start ?? ta.value.length, ta.value.length));
                        const b = Math.max(a, Math.min(end ?? a, ta.value.length));
                        ta.value = ta.value.slice(0, a) + tag + ta.value.slice(b);
                        const pos = a + tag.length;
                        ta.focus();
                        ta.setSelectionRange(pos, pos);
                        savedStart = savedEnd = pos;
                        ta.dispatchEvent(new Event("input", { bubbles: true }));
                    };
                    for (let s = 1; s <= 5; s++) {
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = "h3-tag-btn";
                        btn.textContent = `S${s}`;
                        btn.title = `<Subject ${s}> をカーソル位置に挿入`;
                        btn.addEventListener("mousedown", e => e.preventDefault());
                        btn.onclick = e => { e.preventDefault(); e.stopPropagation(); insertTag(`<Subject ${s}>`); };
                        bar.appendChild(btn);
                    }
                    for (let a = 1; a <= 3; a++) {
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = "h3-tag-btn audio-tag";
                        btn.textContent = `A${a}`;
                        btn.title = `<Audio ${a}> をカーソル位置に挿入`;
                        btn.addEventListener("mousedown", e => e.preventDefault());
                        btn.onclick = e => { e.preventDefault(); e.stopPropagation(); insertTag(`<Audio ${a}>`); };
                        bar.appendChild(btn);
                    }

                    const convertBtn = document.createElement("button");
                    convertBtn.type = "button";
                    convertBtn.className = "h3-tag-btn";
                    convertBtn.textContent = "コード変換";
                    convertBtn.title = "定義した名前を <Subject X> に置換（完全一致のみ）";
                    convertBtn.style.marginLeft = "auto";
                    convertBtn.addEventListener("mousedown", e => e.preventDefault());
                    convertBtn.onclick = e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!composing) convertSubjectNamesInTextarea(ta);
                    };
                    bar.appendChild(convertBtn);
                    return bar;
                };

                const createDialogueWithSpeaker = (prefix, defaultSpeaker) => {
                    const block = document.createElement("div");
                    block.className = "h3-dialogue-block";

                    const lbl = document.createElement("div");
                    lbl.className = "h3-dialogue-label";
                    lbl.textContent = "セリフ";
                    block.appendChild(lbl);

                    const bar = document.createElement("div");
                    bar.className = "h3-speaker-bar";

                    const spkWidget = wMap[`${prefix}_speaker`];
                    const options = [
                        { label: "なし", value: "None" },
                        { label: "キャラ1 (S1)", value: "S1" },
                        { label: "キャラ2 (S2)", value: "S2" },
                        { label: "キャラ3 (S3)", value: "S3" },
                        { label: "キャラ4 (S4)", value: "S4" },
                        { label: "キャラ5 (S5)", value: "S5" }
                    ];

                    const chips = [];
                    const curVal = spkWidget && spkWidget.value !== undefined ? spkWidget.value : defaultSpeaker;

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

                    const diaWidget = wMap[`${prefix}_dialogue`];
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

                const createPicCheckboxGroup = (charIndex) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = "h3-pic-check-row";
                    
                    const label = document.createElement("label");
                    label.textContent = "キャラクター画像 (P1〜P9 参照指定)";
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

                    for (let p = 1; p <= 9; p++) {
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

                const directorFields = [
                    ['size','ショットサイズ',['おまかせ','ロング','ミディアム','クローズアップ','極端なアップ']],
                    ['angle','カメラアングル',['おまかせ','アイレベル','ローアングル','ハイアングル','俯瞰']],
                    ['orientation','被写体の向き',['おまかせ','正面','横向き','背面','斜め']],
                    ['action','動作',['原案のまま','おまかせ']],
                    ['expression','表情',['おまかせ','笑顔','真剣','驚き','悲しみ','無表情']],
                    ['gaze','視線',['おまかせ','前方','相手','カメラ','遠方','下方']],
                    ['camera','カメラワーク',['おまかせ','固定','パン','追従','旋回','ドリーイン','ドリーアウト']],
                    ['dialogue','セリフ',['セリフなし','原案に記載','おまかせ（セリフ追加なし）']],
                    ['extra','追加演出',['追加なし','おまかせ']]
                ];
                const ensureDirector = () => {
                    if (!autoState.guided || !Array.isArray(autoState.guided.shots)) {
                        autoState.guided = {story:'', count:4, duration:15, shot:0, field:0,
                            shots:Array.from({length:4},()=>({story:'', choices:{}, notes:{}}))};
                    }
                    while (autoState.guided.shots.length < 4) autoState.guided.shots.push({story:'',choices:{},notes:{}});
                    autoState.guided.count = Math.max(1, Math.min(4, Number(autoState.guided.count)||4));
                    autoState.guided.shot = Math.max(0, Math.min(autoState.guided.count-1, Number(autoState.guided.shot)||0));
                    autoState.guided.field = Math.max(0, Math.min(8, Number(autoState.guided.field)||0));
                    for (const shot of autoState.guided.shots) { shot.choices ||= {}; shot.notes ||= {}; }
                    return autoState.guided;
                };
                let pendingDirectorPatch = null;
                let directorHistory = [];
                let promptCheckState = null;
                const promptCheckFingerprint = () => JSON.stringify({
                    story:String(wMap.overall_story?.value||''),
                    shots:directorSnapshot(),
                    subjects:Array.from({length:5},(_,i)=>{const n=i+1;return [
                        !!charEnabledState[n],wMap[`char${n}_name`]?.value||'',
                        wMap[`char${n}_preset`]?.value||'',wMap[`char${n}_extra`]?.value||'',
                        wMap[`subject_def_${n}`]?.value||'',wMap[`subject_kind_${n}`]?.value||''];}),
                    quality:wMap.quality_control?.value||'',creative:wMap.creative_mode?.value||'',
                    sound:wMap.ambient_sound?.value||'',music:wMap.bgm?.value||''
                });
                const setDirectorWidget = (name, value) => {
                    const w = wMap[name]; if (!w) return;
                    w.value = value; if (w.callback) w.callback(value);
                };
                const getDirectorNames = () => {
                    const names = {};
                    for (let i=1; i<=5; i++) {
                        const raw = String(charEnabledState[i] ? (wMap[`char${i}_name`]?.value||'') : (wMap[`subject_def_${i}`]?.value||'')).trim();
                        if (raw) names[i] = raw;
                    }
                    return names;
                };
                const directorConvert = async (text) => {
                    const res = await api.fetchApi('/h3/convert_subject_names', {method:'POST',
                        headers:{'Content-Type':'application/json'},body:JSON.stringify({text,names:getDirectorNames()})});
                    if (!res.ok) throw Error('Subjectコード変換に失敗しました');
                    const obj = await res.json();
                    if (typeof obj.text !== 'string') throw Error('Subjectコード変換の応答が不正です');
                    return obj.text;
                };
                const directorSnapshot = () => Array.from({length:4},(_,i)=>{
                    const n=i+1;
                    return {enabled:!!wMap[`shot${n}_enabled`]?.value,
                        time:String(wMap[`shot${n}_time`]?.value||''),
                        action:String(wMap[`shot${n}_action`]?.value||''),
                        dialogue:String(wMap[`shot${n}_dialogue`]?.value||''),
                        speaker:String(wMap[`shot${n}_speaker`]?.value||'None')};
                });
                const directorApplySnapshot = (shots) => {
                    shots.forEach((s,i)=>{const n=i+1;
                        for(const field of ['enabled','time','action','dialogue','speaker']) {
                            setDirectorWidget(`shot${n}_${field}`,s[field]);
                        }
                        shotEnabledState[n]=!!s.enabled;
                    });
                };
                const directorRequest = async (url, payload) => {
                    const settings = {};
                    for(const k of ['llm_provider','llm_api_key','llm_model']) settings[k]=wMap[k]?.value||'';
                    const controller = new AbortController();
                    const timer = setTimeout(()=>controller.abort(),600000);
                    try {
                        const res=await api.fetchApi(url,{method:'POST',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({...settings,...payload}),signal:controller.signal});
                        const result=await res.json();
                        if (!res.ok || !result.success) throw Error(result.error||`HTTP ${res.status}`);
                        return result;
                    } finally {clearTimeout(timer);}
                };
                const directorElement = (tag,text='',cls='') => {
                    const el=document.createElement(tag); el.textContent=text; if(cls)el.className=cls; return el;
                };
                const directorButton = (label, handler) => {
                    const btn=directorElement('button',label,'h3-btn-gen-prompt');
                    btn.type='button'; btn.style.cssText='font-size:11px;padding:7px 12px;flex:1;';
                    btn.onclick=handler; return btn;
                };
                const directorTextArea = (value, placeholder, change, rows=3) => {
                    const ta=document.createElement('textarea');ta.className='h3-prompt-textarea';
                    ta.style.height=`${Math.max(68,rows*26)}px`;ta.value=value||'';ta.placeholder=placeholder;
                    ta.oninput=()=>change(ta.value);return ta;
                };
                const renderGuidedDirector = (host) => {
                    const d=ensureDirector();
                    const card=directorElement('div','','h3-char-card h3-guided-card');
                    card.appendChild(directorElement('div','詳細な構想を考案｜ベース動画専用','h3-char-title'));
                    card.appendChild(directorElement('div','ショット原案と9項目をもとに、LLMが時系列・視点を統合した撮影文章を考案。クリップは変更しません。','h3-guided-intro'));
                    const settings=directorElement('div');settings.className='h3-guided-settings';settings.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
                    for (const [key,label,min,max] of [['count','ショット数',1,4],['duration','動画の秒数',1,15]]) {
                        const lbl=directorElement('label',label+' ');
                        const inp=document.createElement('input');inp.type='number';inp.min=min;inp.max=max;inp.step='1';
                        inp.value=d[key];inp.style.cssText='width:55px;background:#222;color:white;border:1px solid #555;border-radius:4px;padding:3px 4px;';
                        inp.onchange=()=>{d[key]=Math.max(min,Math.min(max,parseInt(inp.value)||max));saveAutoState();renderTabContent();};
                        lbl.appendChild(inp);settings.appendChild(lbl);
                    }
                    card.appendChild(settings);
                    const synopsisHead=directorElement('div');
                    synopsisHead.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;';
                    const synopsisTitle=directorElement('label','','h3-guided-section-label');
                    synopsisTitle.appendChild(directorElement('span','全体のあらすじ'));
                    synopsisTitle.appendChild(directorElement('span','（生成時に［演出］のsummaryへ反映）','h3-guided-hint'));
                    const splitBtn=directorButton('✨ 自動ショット構成',async()=>{
                        const currentStory=String(d.story||'').trim();
                        if(!currentStory){alert('全体のあらすじを先に入力してください。');return;}
                        const oldCount=d.count;
                        const previous=d.shots.slice(0,oldCount).map(x=>x.story);
                        if(previous.some(x=>x.trim()) && !confirm('ショット1〜'+oldCount+'の「このショットで起こる出来事」を置き換えます。9項目の演出設定は保持します。続けますか？'))return;
                        splitBtn.disabled=true;splitBtn.textContent='⏳ ショット分割中...';
                        try{
                            const result=await directorRequest('/h3/auto_split_story',{
                                story:currentStory,shot_count:oldCount,names:getDirectorNames()});
                            if(d.story.trim()!==currentStory || d.count!==oldCount ||
                                d.shots.slice(0,oldCount).some((x,i)=>x.story!==previous[i])){
                                alert('LLM処理中にあらすじかショット欄が変更されました。結果を反映せずキャンセルしました。');return;
                            }
                            if(!Array.isArray(result.shots)||result.shots.length!==oldCount||
                               result.shots.some(x=>typeof x!=='string'||!x.trim()))throw Error('ショット構成の返答が不正です');
                            result.shots.forEach((story,i)=>{d.shots[i].story=story;});
                            saveAutoState();renderTabContent();
                        }catch(err){alert('自動ショット構成エラー: '+err.message);}
                        finally{splitBtn.disabled=false;splitBtn.textContent='✨ 自動ショット構成';}
                    });
                    splitBtn.style.cssText='flex:0 0 auto;font-size:10px;padding:6px 10px;';
                    synopsisHead.append(synopsisTitle,splitBtn);
                    card.appendChild(synopsisHead);
                    card.appendChild(directorTextArea(d.story,'動画全体で何が起こるか',v=>{d.story=v;saveAutoState();},2));
                    const drafts=directorElement('div','','h3-guided-drafts');
                    for(let i=0;i<d.count;i++){
                        const shotField=directorElement('div','','h3-guided-shot-field');
                        const shotLabel=directorElement('label','','h3-guided-shot-label');
                        shotLabel.appendChild(directorElement('span',`ショット${i+1}`,'h3-guided-shot-number'));
                        shotLabel.appendChild(directorElement('span','：このショットで起こる出来事（必須）'));
                        shotField.appendChild(shotLabel);
                        shotField.appendChild(directorTextArea(d.shots[i].story,'登場人物・動作・出来事・必要なセリフなど',v=>{d.shots[i].story=v;saveAutoState();},2));
                        drafts.appendChild(shotField);
                    }
                    card.appendChild(drafts);
                    const step=d.shots[d.shot];const [field,title,options]=directorFields[d.field];
                    const stepBox=directorElement('div');stepBox.style.cssText='border:1px solid #42658b;padding:10px;border-radius:8px;display:flex;flex-direction:column;gap:7px;';
                    const stepHeading=directorElement('div','','h3-guided-step-title');
                    stepHeading.appendChild(directorElement('span',`ショット${d.shot+1}/${d.count}`));
                    stepHeading.appendChild(directorElement('span',`設定 ${d.field+1}/9：${title}`,'h3-guided-step-detail'));
                    stepBox.appendChild(stepHeading);
                    const select=document.createElement('select'); select.style.cssText='padding:7px;background:#222;color:#eee;border:1px solid #555;border-radius:6px;';
                    for(const opt of options){const el=document.createElement('option');el.value=opt;el.textContent=opt;select.appendChild(el);}
                    const selected=step.choices[field]||options[0];
                    if(!options.includes(selected)){const custom=document.createElement('option');custom.value=selected;custom.textContent=selected;select.appendChild(custom);}
                    select.value=selected;
                    select.onchange=()=>{step.choices[field]=select.value;saveAutoState();};
                    stepBox.appendChild(select);
                    const extraLabel=directorElement('label','','h3-guided-field-label');
                    extraLabel.appendChild(directorElement('span','自由入力・追記'));
                    extraLabel.appendChild(directorElement('span','（選択肢と併用可）','h3-guided-hint'));
                    stepBox.appendChild(extraLabel);
                    stepBox.appendChild(directorTextArea(step.notes[field]||'','例：旋回しつつ顔を捉える。別の演出項目もここに追記可能',v=>{step.notes[field]=v;saveAutoState();},2));
                    const nav=directorElement('div');nav.style.cssText='display:flex;gap:6px;';
                    nav.appendChild(directorButton('← 戻る',()=>{if(d.field>0)d.field--;else if(d.shot>0){d.shot--;d.field=8;}saveAutoState();renderTabContent();}));
                    nav.appendChild(directorButton('次へ →',()=>{if(d.field<8)d.field++;else if(d.shot<d.count-1){d.shot++;d.field=0;}saveAutoState();renderTabContent();}));
                    nav.appendChild(directorButton('次のショットへ',()=>{if(d.shot<d.count-1){d.shot++;d.field=0;}saveAutoState();renderTabContent();}));
                    stepBox.appendChild(nav);card.appendChild(stepBox);
                    const generate=directorButton('▶ ここまでで全ショットを構成',async()=>{
                        if(d.shots.slice(0,d.count).some(s=>!s.story.trim())){alert('すべてのショットの出来事を入力してください。');return;}
                        if(!confirm('ベース動画の現在のショットを上書きします。クリップは変更しません。続けますか？'))return;
                        generate.disabled=true;generate.textContent='⏳ 構成を生成中...';
                        try{
                            const result=await directorRequest('/h3/interactive_base_generate',{
                                story:d.story,shot_count:d.count,duration:d.duration,shots:d.shots.slice(0,d.count),names:getDirectorNames()});
                            const old=directorSnapshot(),updated=old.map(s=>({...s}));
                            for(let i=0;i<4;i++){
                                if(i>=d.count){updated[i].enabled=false;continue;}
                                const s=result.shots[i];const start=d.duration*i/d.count,end=d.duration*(i+1)/d.count;
                                const fmt=n=>`0:${n.toFixed(1).padStart(4,'0')}`;
                                updated[i]={enabled:true,time:`${fmt(start)}-${fmt(end)}`,
                                    action:await directorConvert(s.action),dialogue:s.dialogue||'',speaker:s.speaker||'None'};
                            }
                            const rawSynopsis = d.story.trim() || d.shots.slice(0,d.count).map(x=>x.story.trim()).join('。');
                            const synopsis = await directorConvert(rawSynopsis);
                            directorHistory.push(old);if(directorHistory.length>20)directorHistory.shift();
                            setDirectorWidget('overall_story', synopsis);
                            directorApplySnapshot(updated);
                            const warning = result.warning ? `\n演出上の注意：${result.warning}` : '';
                            alert('ベース動画と［演出］の全体のあらすじへ反映しました。タイムラインを確認してください。'+warning);
                            activeTab='timeline';Object.values(tabButtons).forEach(b=>b.classList.remove('active'));
                            tabButtons.timeline.classList.add('active');renderTabContent();
                        }catch(err){alert('詳細な構想の考案エラー: '+err.message);generate.disabled=false;generate.textContent='▶ ここまでで全ショットを構成';}
                    });
                    card.appendChild(generate);host.appendChild(card);
                };
                const renderDirectorRevision = (host) => {
                    const card=directorElement('div','','h3-char-card');
                    card.appendChild(directorElement('div','AI部分修正｜ショットの演出を考案・改稿','h3-char-title'));
                    card.appendChild(directorElement('div','既存の出来事を保ちながら、アングル・カメラワーク・モーションを日本語のショット文章に具体化します。セリフや時間は変更しません。','h3-guided-intro'));
                    const target=document.createElement('select');target.style.cssText='background:#222;color:#eee;padding:6px;border:1px solid #555;';
                    for(const [value,name] of [['auto','自動判定'],['1','ショット1'],['2','ショット2'],['3','ショット3'],['4','ショット4']]) {
                        const opt=document.createElement('option');opt.value=value;opt.textContent=name;target.appendChild(opt);
                    }
                    target.value = autoState.revisionTarget || 'auto';
                    target.onchange = () => {autoState.revisionTarget = target.value;saveAutoState();};
                    card.appendChild(target);
                    const ta=directorTextArea(autoState.revisionInstruction || '',
                        '例：もっとスタイリッシュに。ミディアム→顔のアップ→走り去る背中のロングショットのように、カメラと動きを加えて。',
                        v=>{autoState.revisionInstruction=v;saveAutoState();},4);
                    card.appendChild(ta);
                    const actions=directorElement('div');actions.style.cssText='display:flex;gap:6px;';
                    const propose=directorButton('変更案を作成',async()=>{
                        if(!ta.value.trim()){alert('修正したい内容を入力してください。');return;}
                        propose.disabled=true;propose.textContent='⏳ 修正案を考えています...';
                        try{
                            const before=directorSnapshot();
                            if(target.value!=='auto' && !before[Number(target.value)-1]?.enabled) {
                                throw Error('指定したショットが無効です。タイムラインで有効にしてください。');
                            }
                            const res=await directorRequest('/h3/interactive_base_revise',{
                                shots:before,target:target.value,instruction:ta.value,
                                names:getDirectorNames(),overall_story:String(wMap.overall_story?.value||'')});
                            const changes=[];
                            for(const c of res.changes){changes.push({...c,value:c.field==='action'?await directorConvert(c.value):c.value});}
                            pendingDirectorPatch={before,changes,warning:res.warning||''};
                            showPreview();
                        }catch(e){alert('AI部分修正エラー: '+e.message);}
                        finally{propose.disabled=false;propose.textContent='変更案を作成';}
                    });
                    actions.appendChild(propose);
                    actions.appendChild(directorButton('元に戻す',()=>{
                        if(!directorHistory.length){alert('このセッションに戻せる履歴はありません。');return;}
                        if(!confirm('直前のタイムライン状態に戻しますか？'))return;
                        directorApplySnapshot(directorHistory.pop());pendingDirectorPatch=null;renderTabContent();
                    }));
                    card.appendChild(actions);
                    const preview=directorElement('div');preview.style.cssText='display:flex;flex-direction:column;gap:8px;white-space:pre-wrap;overflow-wrap:anywhere;';
                    card.appendChild(preview);
                    const showPreview=()=>{
                        preview.replaceChildren();
                        if(!pendingDirectorPatch)return;
                        if(!pendingDirectorPatch.changes.length){preview.appendChild(directorElement('div','変更対象が見つかりませんでした。指示を具体的にしてください。'));return;}
                        preview.appendChild(directorElement('div','変更前 → 変更後（承認するまでタイムラインは変わりません）'));
                        if (pendingDirectorPatch.warning) preview.appendChild(directorElement('div',`注意：${pendingDirectorPatch.warning}`,'h3-guided-intro'));
                        for(const c of pendingDirectorPatch.changes){
                            const n=directorElement('div',`ショット${c.shot} / ${c.field}\n【変更前】${pendingDirectorPatch.before[c.shot-1][c.field]}\n【変更後】${c.value}`);
                            n.style.cssText='background:#1b1d22;border:1px solid #444;padding:8px;border-radius:6px;font-size:11px;';preview.appendChild(n);
                        }
                        const row=directorElement('div');row.style.cssText='display:flex;gap:6px;';
                        row.appendChild(directorButton('✓ 変更を反映',()=>{
                            if(JSON.stringify(directorSnapshot())!==JSON.stringify(pendingDirectorPatch.before)){
                                alert('変更案の作成後にタイムラインが変化しました。再度変更案を作成してください。');pendingDirectorPatch=null;showPreview();return;
                            }
                            const next=pendingDirectorPatch.before.map(s=>({...s}));
                            for(const c of pendingDirectorPatch.changes)next[c.shot-1][c.field]=c.value;
                            directorHistory.push(pendingDirectorPatch.before);if(directorHistory.length>20)directorHistory.shift();
                            directorApplySnapshot(next);pendingDirectorPatch=null;renderTabContent();
                        }));
                        row.appendChild(directorButton('キャンセル',()=>{pendingDirectorPatch=null;showPreview();}));
                        preview.appendChild(row);
                    };
                    showPreview();
                    makeCollapsible(card, "timeline-ai-revision");
                    host.appendChild(card);
                };

                const renderTabContent = () => {
                    contentArea.replaceChildren();

                    if (activeTab === "cast") {
                        const toggleBar = document.createElement("div");
                        toggleBar.className = "h3-top-toggle-bar";

                        const charCards = {};
                        const refmodSelects = {};

                        for (let i = 1; i <= 5; i++) {
                            const isChecked = !!charEnabledState[i];

                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            
                            const chk = document.createElement("input");
                            chk.type = "checkbox";
                            chk.checked = isChecked;

                            const span = document.createElement("span");
                            span.textContent = `キャラ${i} (S${i})`;

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

                                if (!active) {
                                    if (wMap[`char${i}_refmod`]) {
                                        wMap[`char${i}_refmod`].value = "None";
                                        if (wMap[`char${i}_refmod`].callback) wMap[`char${i}_refmod`].callback("None");
                                    }
                                    if (refmodSelects[i]) {
                                        refmodSelects[i].value = "None";
                                    }
                                    syncRefModRemote(i, "None");
                                }

                                if (charCards[i]) {
                                    charCards[i].style.display = active ? "flex" : "none";
                                }
                            };

                            chip.append(chk, span);
                            toggleBar.appendChild(chip);
                        }
                        contentArea.appendChild(toggleBar);

                        for (let i = 1; i <= 5; i++) {
                            const card = document.createElement("div");
                            card.className = "h3-char-card";
                            card.style.display = charEnabledState[i] ? "flex" : "none";

                            const title = document.createElement("div");
                            title.className = "h3-char-title";
                            title.textContent = `キャラクター${i} (S${i})`;

                            const nameRow = bindInput(`char${i}_name`, "キャラクター名", false, "キャラクター名を英語で入力");
                            const presetRow = bindInput(`char${i}_preset`, "プリセット");
                            const refmodRow = bindInput(`char${i}_refmod`, "RefMod");
                            const refmodSelect = refmodRow.querySelector("select");
                            if (refmodSelect) {
                                refmodSelects[i] = refmodSelect;
                                refmodSelect.addEventListener("change", (e) => {
                                    syncRefModRemote(i, e.target.value);
                                });
                            }
                            const picRow = createPicCheckboxGroup(i);
                            const voiceRow = bindInput(`char${i}_audio`, "ボイスリファレンス");
                            const extraRow = bindInput(`char${i}_extra`, "特徴定義・追記", true, "キャラクターの特徴や追加の特徴を入力");

                            card.append(title, nameRow, presetRow, refmodRow, picRow, voiceRow, extraRow);
                            contentArea.appendChild(card);
                            charCards[i] = card;
                        }

                    } else if (activeTab === "timeline") {
                        renderDirectorRevision(contentArea);
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

                            const timeRow = createTimePicker(`shot${i}`, i===1 ? 3 : i*3);
                            const actionRow = bindInput(`shot${i}_action`, "アクション / 構図", true, `ショット${i}_アクション/構図`);
                            const tagBar = createQuickTagButtons(actionRow, `shot${i}`);
                            const diaBlock = createDialogueWithSpeaker(`shot${i}`, i===1 ? "S1" : "None");

                            card.append(title, timeRow, tagBar, actionRow, diaBlock);
                            makeCollapsible(card, `timeline-shot-${i}`);
                            contentArea.appendChild(card);
                            shotCards[i] = card;
                        }

                    } else if (activeTab === "scene") {
                        const subjectBox = document.createElement("div");
                        subjectBox.className = "h3-char-card";
                        const subjectTitle = document.createElement("div");
                        subjectTitle.className = "h3-char-title";
                        subjectTitle.textContent = "主題定義（subject_definitions）";
                        subjectBox.appendChild(subjectTitle);
                        for (let i = 1; i <= 5; i++) {
                            const locked = !!charEnabledState[i];
                            const row = document.createElement("div");
                            row.className = "h3-field-row";
                            const header = document.createElement("div");
                            header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;";
                            const label = document.createElement("label");
                            label.textContent = `S${i} ${locked ? "🔒 キャラクター設定で使用中" : "自由入力（空欄なら定義なし）"}`;
                            header.appendChild(label);
                            const kindWidget = wMap[`subject_kind_${i}`];
                            const kindSelect = document.createElement("select");
                            kindSelect.title = "Subjectの種類";
                            kindSelect.style.cssText = "font-size:11px;padding:2px 4px;border-radius:4px;background:#252525;color:#eee;border:1px solid #555;";
                            for (const kind of ["人物", "背景", "オブジェクト"]) {
                                const opt = document.createElement("option");
                                opt.value = kind; opt.textContent = kind;
                                kindSelect.appendChild(opt);
                            }
                            kindSelect.value = locked ? "人物" : (kindWidget?.value || "オブジェクト");
                            kindSelect.disabled = locked;
                            kindSelect.onchange = () => {
                                if (kindWidget) { kindWidget.value = kindSelect.value; if (kindWidget.callback) kindWidget.callback(kindWidget.value); }
                            };
                            header.appendChild(kindSelect);
                            if (!locked) {
                                const mediaButtons = document.createElement("div");
                                mediaButtons.style.cssText = "display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end;";
                                const makeButtons = (kind, count, prefix, tagName, activeColor) => {
                                    const widget = wMap[`subject_${kind}_${i}`];
                                    const selected = new Set((String(widget?.value || "").match(new RegExp(`<${tagName}\\s+\\d+>`, "gi")) || []).map(s => s.toLowerCase()));
                                    for (let n = 1; n <= count; n++) {
                                        const tag = `<${tagName} ${n}>`;
                                        const btn = document.createElement("button");
                                        btn.type = "button";
                                        btn.textContent = `${prefix}${n}`;
                                        btn.title = tag;
                                        btn.style.cssText = "font-size:9px;padding:2px 4px;border-radius:4px;cursor:pointer;min-width:23px;line-height:1.4;";
                                        const refresh = () => {
                                            const on = selected.has(tag.toLowerCase());
                                            btn.style.background = on ? activeColor : "#242424";
                                            btn.style.color = on ? "#fff" : "#aab0b9";
                                            btn.style.border = on ? "1px solid #8bb4dc" : "1px solid #444";
                                        };
                                        refresh();
                                        btn.onclick = (e) => {
                                            e.stopPropagation();
                                            if (!widget) return;
                                            const key = tag.toLowerCase();
                                            if (selected.has(key)) selected.delete(key); else selected.add(key);
                                            widget.value = Array.from(selected).map(t => {
                                                const m = t.match(/(\d+)/);
                                                return `<${tagName} ${m[1]}>`;
                                            }).sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).join(", ");
                                            if (widget.callback) widget.callback(widget.value);
                                            refresh();
                                        };
                                        mediaButtons.appendChild(btn);
                                    }
                                };
                                makeButtons("pics", 9, "P", "Picture", "#1769aa");
                                const separator = document.createElement("span");
                                separator.textContent = "│";
                                separator.style.color = "#666";
                                mediaButtons.appendChild(separator);
                                makeButtons("audio", 3, "A", "Audio", "#176c4b");
                                header.appendChild(mediaButtons);
                            }
                            const input = document.createElement("textarea");
                            input.rows = 1;
                            input.className = "h3-prompt-textarea";
                            input.style.height = "34px";
                            input.style.minHeight = "34px";
                            input.style.resize = "none";
                            input.style.overflowY = "hidden";
                            input.disabled = locked;
                            if (locked) {
                                const name = wMap[`char${i}_name`]?.value?.trim() || `キャラ${i}`;
                                input.value = `S${i}は${name}で定義されています。`;
                                input.style.opacity = "0.55";
                            } else {
                                input.value = wMap[`subject_def_${i}`]?.value || "";
                                input.placeholder = "例：木々に囲まれた古い木造小屋";
                                input.oninput = () => {
                                    const w = wMap[`subject_def_${i}`];
                                    if (w) { w.value = input.value; if (w.callback) w.callback(w.value); }
                                };
                            }
                            row.append(header, input);
                            subjectBox.appendChild(row);
                        }
                        makeCollapsible(subjectBox, "scene-subject-definitions");
                        const retentionCard = createRetentionSettings();
                        makeCollapsible(retentionCard, "scene-retention-settings");
                        contentArea.append(
                            subjectBox,
                            sceneFieldCard("overall_story", "全体のあらすじ（summary）", true, "場所・時間帯・登場人物・出来事・物語の流れを日本語で入力（LLMが英訳）"),
                            sceneFieldCard("quality_control", "禁止事項＆スタイル維持（retention_analysis）", true, "崩れ防止、画風維持、3D化禁止などのネガティブ・クオリティ指示を入力"),
                            retentionCard,
                            sceneFieldCard("ambient_sound", "環境音 (overall_soundscape)", false, "足音、風の音、ドアの開閉音、雨音などの環境音・効果音を入力"),
                            sceneFieldCard("bgm", "BGM (non_diegetic_music)", false, "N/AでBGM無し（曲調やジャンルを指定する場合はここに入力）")
                        );

                    } else if (activeTab === "clip") {
                        const clipGrid = document.createElement("div");
                        clipGrid.style.display = "grid";
                        clipGrid.style.gridTemplateColumns = "repeat(5, 1fr)";
                        clipGrid.style.gap = "6px";
                        clipGrid.style.marginBottom = "8px";

                        for (let i = 1; i <= 10; i++) {
                            const isEnabled = wMap[`c${i}_enabled`] && !!wMap[`c${i}_enabled`].value;
                            let indicator = isEnabled ? "🟢" : "⚫";
                            if (getV(`c${i}_locked`, false)) indicator += "🔒";
                            
                            const btn = document.createElement("div");
                            btn.innerHTML = `<span style="font-size:8px; margin-right:4px; pointer-events:none;">${indicator}</span>C${i}`;
                            
                            const isActive = (activeClipTab === i);
                            btn.className = `h3-toggle-chip ${isActive ? "active" : ""}`;
                            if(isActive) {
                                btn.style.borderColor = "#5bb3f5";
                                btn.style.color = "#ffffff";
                            }
                            
                            btn.onclick = () => {
                                activeClipTab = i;
                                renderTabContent();
                            };
                            clipGrid.appendChild(btn);
                        }
                        contentArea.appendChild(clipGrid);

                        const activeClipCard = document.createElement("div");
                        activeClipCard.className = "h3-char-card";
                        activeClipCard.style.display = "flex";
                        activeClipCard.style.flexDirection = "column";

                        const titleBar = document.createElement("div");
                        titleBar.style.display = "flex";
                        titleBar.style.alignItems = "center";
                        titleBar.style.gap = "12px";
                        titleBar.style.marginBottom = "8px";
                        titleBar.style.flexWrap = "wrap";

                        const title = document.createElement("div");
                        title.className = "h3-char-title";
                        title.textContent = `クリップ ${activeClipTab}`;

                        const lockLabel = document.createElement("label");
                        lockLabel.style.cssText = "display:flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#ffcc00; cursor:pointer;";
                        const lockChk = document.createElement("input");
                        lockChk.type = "checkbox";
                        lockChk.checked = getV(`c${activeClipTab}_locked`, false);
                        lockLabel.append(lockChk, document.createTextNode("🔒 プロンプトをロック"));

                        lockChk.onchange = () => {
                            setV(`c${activeClipTab}_locked`, lockChk.checked);
                            renderTabContent();
                        };

                        const enWidget = wMap[`c${activeClipTab}_enabled`];
                        const enLabel = document.createElement("label");
                        enLabel.style.fontSize = "11px";
                        enLabel.style.color = "#ffffff";
                        enLabel.style.fontWeight = "bold";
                        enLabel.style.display = "flex";
                        enLabel.style.alignItems = "center";
                        enLabel.style.gap = "4px";
                        enLabel.style.cursor = "pointer";
                        const enChk = document.createElement("input");
                        enChk.type = "checkbox";
                        enChk.checked = enWidget ? !!enWidget.value : false;
                        enChk.onchange = () => {
                            if (enWidget) {
                                enWidget.value = enChk.checked;
                                if (enWidget.callback) enWidget.callback(enChk.checked);
                            }
                            renderTabContent();
                        };
                        enLabel.append(enChk, document.createTextNode("このクリップを有効にする"));

                        const contWidget = wMap[`c${activeClipTab}_continue`];
                        const contLabel = document.createElement("label");
                        contLabel.style.fontSize = "10px";
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

                        const linkWidget = wMap[`c${activeClipTab}_link_next`];
                        const linkLabel = document.createElement("label");
                        linkLabel.style.fontSize = "10px";
                        linkLabel.style.color = "#dbe0e6";
                        linkLabel.style.display = "flex";
                        linkLabel.style.alignItems = "center";
                        linkLabel.style.gap = "4px";
                        linkLabel.style.cursor = "pointer";
                        const linkChk = document.createElement("input");
                        linkChk.type = "checkbox";
                        linkChk.checked = linkWidget ? !!linkWidget.value : false;
                        linkChk.onchange = () => {
                            if (linkWidget) {
                                linkWidget.value = linkChk.checked;
                                if (linkWidget.callback) linkWidget.callback(linkChk.checked);
                            }
                        };
                        linkLabel.append(linkChk, document.createTextNode("今回の動画を次に繋げる"));

                        titleBar.append(title, lockLabel, enLabel, contLabel, linkLabel);
                        activeClipCard.appendChild(titleBar);

                        const editorContainer = document.createElement("div");
                        editorContainer.style.display = "flex";
                        editorContainer.style.flexDirection = "column";

                        if (getV(`c${activeClipTab}_locked`, false)) {
                            editorContainer.style.opacity = "0.4";
                            editorContainer.style.pointerEvents = "none";
                        }

                        const shotToggleBar = document.createElement("div");
                        shotToggleBar.className = "h3-top-toggle-bar";
                        
                        for (let j = 1; j <= 4; j++) {
                            const isChecked = !!clipShotEnabledState[activeClipTab][j];
                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            
                            const chk = document.createElement("input");
                            chk.type = "checkbox";
                            chk.checked = isChecked;

                            const span = document.createElement("span");
                            span.textContent = `ショット${j}`;

                            chip.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clipShotEnabledState[activeClipTab][j] = !clipShotEnabledState[activeClipTab][j];
                                const active = clipShotEnabledState[activeClipTab][j];

                                chip.className = `h3-toggle-chip ${active ? "active" : ""}`;
                                chk.checked = active;

                                if (wMap[`c${activeClipTab}_s${j}_enabled`]) {
                                    wMap[`c${activeClipTab}_s${j}_enabled`].value = active;
                                    if (wMap[`c${activeClipTab}_s${j}_enabled`].callback) wMap[`c${activeClipTab}_s${j}_enabled`].callback(active);
                                }
                                renderTabContent();
                            };

                            chip.append(chk, span);
                            shotToggleBar.appendChild(chip);
                        }
                        editorContainer.appendChild(shotToggleBar);

                        for (let j = 1; j <= 4; j++) {
                            if (!clipShotEnabledState[activeClipTab][j]) continue;

                            const card = document.createElement("div");
                            card.className = "h3-char-card";
                            card.style.background = "#070709";
                            card.style.border = "1px solid #383838";
                            card.style.marginTop = "4px";

                            const cardTitle = document.createElement("div");
                            cardTitle.className = "h3-char-title";
                            cardTitle.textContent = `ショット ${j}`;

                            const timeRow = createTimePicker(`c${activeClipTab}_s${j}`, j===1 ? 3 : j*3);
                            const actionRow = bindInput(`c${activeClipTab}_s${j}_action`, "アクション / 構図", true, `ショット${j}_アクション/構図`);
                            const tagBar = createQuickTagButtons(actionRow, `c${activeClipTab}_s${j}`);
                            const diaBlock = createDialogueWithSpeaker(`c${activeClipTab}_s${j}`, j===1 ? "S1" : "None");

                            card.append(cardTitle, timeRow, tagBar, actionRow, diaBlock);
                            makeCollapsible(card, `clip-${activeClipTab}-shot-${j}`);
                            editorContainer.appendChild(card);
                        }

                        activeClipCard.appendChild(editorContainer);
                        makeCollapsible(activeClipCard, `clip-${activeClipTab}-editor`, titleBar);
                        titleBar.style.marginBottom = "0";
                        titleBar.style.flex = "1 1 auto";
                        contentArea.appendChild(activeClipCard);

                    } else if (activeTab === "auto") {
                        const mode = autoState.directorMode === "bulk" ? "bulk" : "detailed";
                        const switcher = document.createElement("div");
                        switcher.className = "h3-char-card";
                        switcher.style.cssText += "gap:9px;";
                        const switchTitle = directorElement("div", "考案方式を選択", "h3-char-title");
                        const radioBar = document.createElement("div");
                        radioBar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
                        for (const [value, label] of [
                            ["detailed", "詳細な構想を考案"],
                            ["bulk", "原案を基に一括考案"]
                        ]) {
                            const option = document.createElement("label");
                            option.style.cssText = `display:flex;align-items:center;justify-content:center;gap:7px;flex:1 1 185px;min-height:34px;padding:7px 10px;box-sizing:border-box;border-radius:7px;cursor:pointer;font-size:11px;font-weight:600;border:1px solid ${mode === value ? "#5bb3f5" : "#383838"};background:${mode === value ? "#173854" : "#202020"};color:${mode === value ? "#fff" : "#aeb7c2"};`;
                            const radio = document.createElement("input");
                            radio.type = "radio";
                            radio.name = `h3-auto-mode-${node.id}`;
                            radio.value = value;
                            radio.checked = mode === value;
                            radio.style.cssText = "margin:0;accent-color:#007acc;";
                            radio.onchange = () => {
                                if (!radio.checked) return;
                                autoState.directorMode = value;
                                saveAutoState();
                                renderTabContent();
                            };
                            option.append(radio, document.createTextNode(label));
                            radioBar.appendChild(option);
                        }
                        switcher.append(switchTitle, radioBar);
                        contentArea.appendChild(switcher);
                        if (mode === "detailed") {
                            renderGuidedDirector(contentArea);
                            return;
                        }
                        const autoCard1 = document.createElement("div");
                        autoCard1.className = "h3-char-card";
                        
                        const execBtn = document.createElement("button");
                        execBtn.className = "h3-btn-gen-prompt";
                        execBtn.innerHTML = `<span>▶ おまかせシナリオを考案して各タブに適用</span>`;
                        
                        const warn = document.createElement("div");
                        warn.style.fontSize = "9px";
                        warn.style.color = "#ff6b6b";
                        warn.style.marginTop = "8px";
                        warn.style.marginBottom = "8px";
                        warn.style.marginLeft = "4px";
                        warn.textContent = "※必ず先にキャラクター設定と演出を設定してください。";

                        const lblOw = document.createElement("label");
                        lblOw.style.fontSize = "11px";
                        lblOw.style.color = "#dbe0e6";
                        lblOw.style.display = "flex";
                        lblOw.style.alignItems = "center";
                        lblOw.style.gap = "6px";
                        lblOw.style.cursor = "pointer";
                        const chkOw = document.createElement("input");
                        chkOw.type = "checkbox";
                        chkOw.checked = autoState.overwrite;
                        chkOw.onchange = () => {
                            autoState.overwrite = chkOw.checked;
                            bulkStatus.textContent = "";
                            saveAutoState();
                        };
                        lblOw.append(chkOw, document.createTextNode("現在の入力内容を上書きすることを許可する (必須)"));

                        const bulkStatus = document.createElement("div");
                        bulkStatus.style.cssText = "font-size:10px;line-height:1.5;color:#aeb7c2;min-height:15px;white-space:pre-wrap;";
                        bulkStatus.setAttribute("role", "status");
                        autoCard1.append(execBtn, warn, lblOw, bulkStatus);

                        const autoCard3 = document.createElement("div");
                        autoCard3.className = "h3-char-card";
                        
                        const ccTitleBar = document.createElement("div");
                        ccTitleBar.style.display = "flex";
                        ccTitleBar.style.justifyContent = "space-between";
                        ccTitleBar.style.alignItems = "center";
                        
                        const ccTitle = document.createElement("div");
                        ccTitle.className = "h3-char-title";
                        ccTitle.textContent = "クリップ数の指定 (1〜10)";
                        
                        const lblNoClip = document.createElement("label");
                        lblNoClip.style.fontSize = "11px";
                        lblNoClip.style.color = "#dbe0e6";
                        lblNoClip.style.display = "flex";
                        lblNoClip.style.alignItems = "center";
                        lblNoClip.style.gap = "6px";
                        lblNoClip.style.cursor = "pointer";
                        const chkNoClip = document.createElement("input");
                        chkNoClip.type = "checkbox";
                        chkNoClip.checked = autoState.noClips;
                        chkNoClip.onchange = () => {
                            autoState.noClips = chkNoClip.checked;
                            saveAutoState();
                            renderTabContent();
                        };
                        lblNoClip.append(chkNoClip, document.createTextNode("クリップ生成をしない（ベース生成のみ）"));
                        
                        ccTitleBar.append(ccTitle, lblNoClip);
                        
                        const ccGrid = document.createElement("div");
                        ccGrid.className = "h3-pic-check-grid";
                        ccGrid.style.gridTemplateColumns = "repeat(10, 1fr)";
                        if (autoState.noClips) {
                            ccGrid.style.opacity = "0.3";
                            ccGrid.style.pointerEvents = "none";
                        }
                        
                        for(let i=1; i<=10; i++) {
                            const cbtn = document.createElement("div");
                            const isChecked = (autoState.clipCount === i);
                            cbtn.className = `h3-pic-check-item ${isChecked ? "checked" : ""}`;
                            cbtn.textContent = i;
                            cbtn.onclick = () => {
                                if (autoState.noClips) return;
                                autoState.clipCount = i;
                                saveAutoState();
                                renderTabContent();
                            };
                            ccGrid.appendChild(cbtn);
                        }

                        const durationRow = document.createElement("div");
                        durationRow.style.display = "flex";
                        durationRow.style.alignItems = "center";
                        durationRow.style.gap = "8px";
                        durationRow.style.marginTop = "12px";

                        const durLabel = document.createElement("div");
                        durLabel.style.fontSize = "11px";
                        durLabel.style.fontWeight = "bold";
                        durLabel.style.color = "#ffffff";
                        durLabel.textContent = "1生成あたりの動画の長さの目安:";

                        const durInput = document.createElement("input");
                        durInput.type = "number";
                        durInput.min = "1";
                        durInput.max = "15";
                        durInput.value = autoState.duration || 5;
                        durInput.style.width = "40px";
                        durInput.style.background = "#181818";
                        durInput.style.color = "#ffffff";
                        durInput.style.border = "1px solid #383838";
                        durInput.style.borderRadius = "4px";
                        durInput.style.textAlign = "center";
                        durInput.style.fontSize = "11px";
                        durInput.onchange = () => {
                            let val = parseInt(durInput.value);
                            if(isNaN(val) || val < 1) val = 1;
                            if(val > 15) val = 15;
                            durInput.value = val;
                            autoState.duration = val;
                            saveAutoState();
                        };

                        const durUnit = document.createElement("span");
                        durUnit.style.fontSize = "10px";
                        durUnit.style.color = "#9aa0a6";
                        durUnit.textContent = "秒 (最大15秒)";

                        durationRow.append(durLabel, durInput, durUnit);
                        
                        autoCard3.append(ccTitleBar, ccGrid, durationRow);

                        const autoCard4 = document.createElement("div");
                        autoCard4.className = "h3-char-card";
                        const storyTitle = document.createElement("div");
                        storyTitle.className = "h3-char-title";
                        storyTitle.textContent = "物語・あらすじ・シチュエーション入力";
                        
                        const storyTa = document.createElement("textarea");
                        storyTa.className = "h3-prompt-textarea";
                        storyTa.style.height = "160px";
                        storyTa.placeholder = "大まかなストーリーやキャラクターの行動を書いてください。";
                        storyTa.value = autoState.story;
                        storyTa.oninput = () => {
                            autoState.story = storyTa.value;
                            saveAutoState();
                        };
                        
                        autoCard4.append(storyTitle, storyTa);
                        contentArea.append(autoCard1, autoCard3, autoCard4);

                        execBtn.onclick = async () => {
                            if (!autoState.overwrite) {
                                bulkStatus.textContent = "先に『現在の入力内容を上書きすることを許可する』にチェックしてください。";
                                bulkStatus.style.color = "#ff9b9b";
                                chkOw.focus();
                                return;
                            }
                            if (!String(autoState.story || "").trim()) {
                                bulkStatus.textContent = "『物語・あらすじ・シチュエーション入力』が空です。原案を入力してください。";
                                bulkStatus.style.color = "#ff9b9b";
                                storyTa.focus();
                                return;
                            }
                            execBtn.disabled = true;
                            execBtn.textContent = "⏳ シナリオ考案中... (LLM通信中)";
                            bulkStatus.textContent = "LLMでショットを考案しています。完了後、タイムラインへ反映します。";
                            bulkStatus.style.color = "#aeb7c2";
                            saveAutoState();
                            const payload = {};
                            (node.widgets || []).forEach(w => { payload[w.name] = w.value; });
                            payload.auto_data = JSON.stringify(autoState);
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 600000);
                            try {
                                const res = await api.fetchApi("/h3/generate_auto_scenario", {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(payload), signal: controller.signal
                                });
                                const data = await res.json();
                                if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
                                const baseCount = Object.values(data.base_shots || {}).filter(s => s && String(s.action || "").trim()).length;
                                const clipData = data.clips_data || {};
                                if (baseCount === 0) throw new Error("ベース動画のショットが0件です。LLM応答を確認してください。");
                                if (!autoState.noClips) {
                                    const missing = Array.from({length:autoState.clipCount},(_,k)=>k+1)
                                        .filter(i => !Object.values(clipData[i] || {}).some(s=>s && String(s.action || "").trim()));
                                    if (missing.length) throw new Error(`クリップ${missing.join("、")}のショットがありません。`);
                                }
                                bulkStatus.textContent = `考案完了：ベース${baseCount}ショット。設定へ反映しています。`;
                                if (data.base_shots) {
                                    for (let j = 1; j <= 4; j++) {
                                        const shotData = data.base_shots[j];
                                        if (shotData) {
                                            if (wMap[`shot${j}_enabled`]) { wMap[`shot${j}_enabled`].value = true; if(wMap[`shot${j}_enabled`].callback) wMap[`shot${j}_enabled`].callback(true); }
                                            if (wMap[`shot${j}_time`]) { wMap[`shot${j}_time`].value = shotData.time; if(wMap[`shot${j}_time`].callback) wMap[`shot${j}_time`].callback(shotData.time); }
                                            if (wMap[`shot${j}_action`]) { wMap[`shot${j}_action`].value = shotData.action; if(wMap[`shot${j}_action`].callback) wMap[`shot${j}_action`].callback(shotData.action); }
                                            if (wMap[`shot${j}_dialogue`]) { wMap[`shot${j}_dialogue`].value = ""; if(wMap[`shot${j}_dialogue`].callback) wMap[`shot${j}_dialogue`].callback(""); }
                                            if (wMap[`shot${j}_speaker`]) { wMap[`shot${j}_speaker`].value = "None"; if(wMap[`shot${j}_speaker`].callback) wMap[`shot${j}_speaker`].callback("None"); }
                                        } else {
                                            if (wMap[`shot${j}_enabled`]) { wMap[`shot${j}_enabled`].value = false; if(wMap[`shot${j}_enabled`].callback) wMap[`shot${j}_enabled`].callback(false); }
                                        }
                                    }
                                }
                                
                                if (autoState.noClips) {
                                    for(let i=1; i<=10; i++) {
                                        if(wMap[`c${i}_enabled`]){ wMap[`c${i}_enabled`].value = false; if(wMap[`c${i}_enabled`].callback) wMap[`c${i}_enabled`].callback(false); }
                                    }
                                } else {
                                    for (let i = 1; i <= 10; i++) {
                                        if (i <= autoState.clipCount && data.clips_data[i]) {
                                            if(wMap[`c${i}_enabled`]){ wMap[`c${i}_enabled`].value = true; if(wMap[`c${i}_enabled`].callback) wMap[`c${i}_enabled`].callback(true); }
                                            
                                            for (let j = 1; j <= 4; j++) {
                                                const shotData = data.clips_data[i][j];
                                                if (shotData) {
                                                    if(wMap[`c${i}_s${j}_enabled`]){ wMap[`c${i}_s${j}_enabled`].value = true; if(wMap[`c${i}_s${j}_enabled`].callback) wMap[`c${i}_s${j}_enabled`].callback(true); }
                                                    if(wMap[`c${i}_s${j}_time`]){ wMap[`c${i}_s${j}_time`].value = shotData.time; if(wMap[`c${i}_s${j}_time`].callback) wMap[`c${i}_s${j}_time`].callback(shotData.time); }
                                                    if(wMap[`c${i}_s${j}_action`]){ wMap[`c${i}_s${j}_action`].value = shotData.action; if(wMap[`c${i}_s${j}_action`].callback) wMap[`c${i}_s${j}_action`].callback(shotData.action); }
                                                    if(wMap[`c${i}_s${j}_dialogue`]){ wMap[`c${i}_s${j}_dialogue`].value = ""; if(wMap[`c${i}_s${j}_dialogue`].callback) wMap[`c${i}_s${j}_dialogue`].callback(""); }
                                                    if(wMap[`c${i}_s${j}_speaker`]){ wMap[`c${i}_s${j}_speaker`].value = "None"; if(wMap[`c${i}_s${j}_speaker`].callback) wMap[`c${i}_s${j}_speaker`].callback("None"); }
                                                } else {
                                                    if(wMap[`c${i}_s${j}_enabled`]){ wMap[`c${i}_s${j}_enabled`].value = false; if(wMap[`c${i}_s${j}_enabled`].callback) wMap[`c${i}_s${j}_enabled`].callback(false); }
                                                }
                                            }
                                        } else {
                                            if(wMap[`c${i}_enabled`]){ wMap[`c${i}_enabled`].value = false; if(wMap[`c${i}_enabled`].callback) wMap[`c${i}_enabled`].callback(false); }
                                        }
                                    }
                                }

                                alert("シナリオが各タブに適用されました！\n内容を確認・修正してから「プロンプト生成」タブで実行してください。");
                                
                                activeTab = "timeline";
                                Object.values(tabButtons).forEach(b => b.classList.remove("active"));
                                tabButtons["timeline"].classList.add("active");
                                fixedMediaArea.style.display = "flex";
                                
                                if (node.onConfigure) {
                                    node.onConfigure();
                                } else {
                                    renderTabContent();
                                }

                            } catch (err) {
                                bulkStatus.textContent = `シナリオ考案エラー：${err.message}`;
                                bulkStatus.style.color = "#ff9b9b";
                            } finally {
                                clearTimeout(timeoutId);
                                execBtn.disabled = false;
                                execBtn.textContent = "▶ おまかせシナリオを考案して各タブに適用";
                            }
                        };


                    } else if (activeTab === "irodori") {
                        const card = document.createElement("div");
                        card.className = "h3-char-card";
                        contentArea.appendChild(card);
                        const title = document.createElement("div");
                        title.className = "h3-char-title";
                        title.textContent = "Irodori-TTS｜音声リファレンス生成";
                        card.appendChild(title);
                        const settings = getV("irodori_tts", {});
                        const makeRow = (labelText, element) => {
                            const row = document.createElement("div");
                            row.className = "h3-field-row";
                            const label = document.createElement("label");
                            label.textContent = labelText;
                            row.append(label, element);
                            card.appendChild(row);
                            return element;
                        };
                        const styleControl = el => {
                            el.style.cssText = "width:100%;box-sizing:border-box;background:#202020;color:#eee;border:1px solid #4a4a4a;border-radius:6px;padding:8px;font-size:12px;";
                            return el;
                        };
                        const makeSelect = (value, options) => {
                            const el = styleControl(document.createElement("select"));
                            for (const [id, text] of options) {
                                const option = document.createElement("option");
                                option.value = id; option.textContent = text;
                                el.appendChild(option);
                            }
                            el.value = String(value ?? "");
                            return el;
                        };
                        const makeNumber = (value, min, max, step = 1) => {
                            const el = styleControl(document.createElement("input"));
                            el.type = "number"; el.min = min; el.max = max; el.step = step;
                            el.value = value;
                            return el;
                        };
                        const store = (key, value) => {
                            const d = { ...getV("irodori_tts", {}), [key]: value };
                            setV("irodori_tts", d);
                        };
                        const modelSelect = makeSelect(settings.model || "", []);
                        makeRow("モデルを読み込む｜参照先：📁ComfyUI/models/checkpoints", modelSelect);
                        modelSelect.onchange = () => store("model", modelSelect.value);
                        const sources = [["manual", "手動入力"]];
                        for (let s = 1; s <= 4; s++) {
                            const w = wMap[`shot${s}_dialogue`];
                            if (shotEnabledState[s] && String(w?.value || "").trim()) {
                                sources.push([`shot${s}`, `演出 ショット${s}｜${String(w.value).slice(0, 42)}`]);
                            }
                        }
                        for (let c = 1; c <= 10; c++) {
                            if (!clipEnabledState[c]) continue;
                            for (let s = 1; s <= 4; s++) {
                                const w = wMap[`c${c}_s${s}_dialogue`];
                                if (clipShotEnabledState[c][s] && String(w?.value || "").trim()) {
                                    sources.push([`c${c}_s${s}`, `クリップ${c} ショット${s}｜${String(w.value).slice(0, 34)}`]);
                                }
                            }
                        }
                        const selectedSource = sources.some(([id]) => id === settings.source) ? settings.source : (sources[1]?.[0] || "manual");
                        const sourceSelect = makeSelect(selectedSource, sources);
                        makeRow("セリフの取得元", sourceSelect);
                        const readSource = sourceId => {
                            if (sourceId === "manual") return null;
                            return String(wMap[`${sourceId}_dialogue`]?.value || "");
                        };
                        const textBox = styleControl(document.createElement("textarea"));
                        textBox.rows = 3; textBox.style.resize = "vertical";
                        textBox.placeholder = "Irodoriに読み上げさせるセリフ（H3側と同じ内容がおすすめ）";
                        textBox.value = readSource(selectedSource) ?? (settings.text || "");
                        makeRow("読み上げテキスト", textBox);
                        sourceSelect.onchange = () => {
                            store("source", sourceSelect.value);
                            const fromSource = readSource(sourceSelect.value);
                            if (fromSource !== null) textBox.value = fromSource;
                        };
                        textBox.oninput = () => {
                            store("text", textBox.value);
                            if (sourceSelect.value !== "manual") {
                                sourceSelect.value = "manual";
                                store("source", "manual");
                            }
                        };
                        const voiceDesign = styleControl(document.createElement("textarea"));
                        voiceDesign.rows = 2;
                        voiceDesign.style.resize = "vertical";
                        voiceDesign.placeholder = "声質・話速・感情・話し方などを指定";
                        voiceDesign.value = settings.voice_design_caption ?? "";
                        makeRow("ボイスデザイン｜声質", voiceDesign);
                        voiceDesign.oninput = () => store("voice_design_caption", voiceDesign.value);
                        const refSelect = makeSelect(settings.reference_audio || "", []);
                        makeRow("音声リファレンス｜参照先：📁ComfyUI/input", refSelect);
                        refSelect.onchange = () => store("reference_audio", refSelect.value);
                        const refNorm = makeNumber(settings.ref_normalize_db ?? -16, -60, 0);
                        makeRow("音声リファレンス｜音量 (dB)", refNorm);
                        refNorm.onchange = () => store("ref_normalize_db", Number(refNorm.value));
                        const maxRef = makeNumber(settings.max_ref_seconds ?? 0, 0, 120, 0.5);
                        makeRow("音声リファレンス｜参照音声の最大秒数（0=既定）", maxRef);
                        maxRef.onchange = () => store("max_ref_seconds", Number(maxRef.value));
                        const steps = makeNumber(settings.num_steps ?? 40, 1, 120);
                        makeRow("Sampler｜Steps", steps);
                        steps.onchange = () => store("num_steps", Number(steps.value));
                        const seed = makeNumber(settings.seed ?? 0, 0, 9223372036854775807);
                        makeRow("Sampler｜Seed", seed);
                        seed.onchange = () => store("seed", Math.floor(Number(seed.value)));
                        const autoSeed = document.createElement("input");
                        autoSeed.type = "checkbox";
                        autoSeed.checked = settings.randomize_seed ?? true;
                        autoSeed.onchange = () => store("randomize_seed", autoSeed.checked);
                        const autoSeedLabel = document.createElement("label");
                        autoSeedLabel.style.cssText = "display:flex;align-items:center;gap:8px;color:#eee;font-size:12px;";
                        autoSeedLabel.append(autoSeed, document.createTextNode("再生成ごとにSeedを変更（オフで固定Seed）"));
                        card.appendChild(autoSeedLabel);
                        const seconds = makeNumber(settings.seconds ?? 0, 0, 120, 0.5);
                        makeRow("Sampler｜秒数（0=自動）", seconds);
                        seconds.onchange = () => store("seconds", Number(seconds.value));
                        const trim = document.createElement("input");
                        trim.type = "checkbox"; trim.checked = settings.trim_tail ?? true;
                        trim.onchange = () => store("trim_tail", trim.checked);
                        const trimLabel = document.createElement("label");
                        trimLabel.style.cssText = "display:flex;align-items:center;gap:8px;color:#eee;font-size:12px;";
                        trimLabel.append(trim, document.createTextNode("Sampler｜末尾の無音を除去"));
                        card.appendChild(trimLabel);

                        const status = document.createElement("div");
                        status.style.cssText = "font-size:12px;color:#aab7c4;min-height:20px;white-space:pre-wrap;";
                        card.appendChild(status);
                        const gen = document.createElement("button");
                        gen.className = "h3-btn-gen-prompt";
                        gen.textContent = "🎙 音声生成";
                        card.appendChild(gen);

                        const previewPanel = document.createElement("div");
                        previewPanel.style.cssText = "display:none;flex-direction:column;gap:10px;border:1px solid #4a4a4a;border-radius:8px;padding:12px;background:#17191b;";
                        card.appendChild(previewPanel);
                        const previewHeading = document.createElement("div");
                        previewHeading.className = "h3-char-title";
                        previewHeading.textContent = "生成音声のプレビュー";
                        previewPanel.appendChild(previewHeading);
                        const preview = document.createElement("audio");
                        preview.controls = true;
                        preview.preload = "metadata";
                        preview.style.cssText = "width:100%;";
                        previewPanel.appendChild(preview);
                        const volumeRow = document.createElement("div");
                        volumeRow.style.cssText = "display:flex;align-items:center;gap:10px;font-size:12px;color:#dbe0e6;";
                        const volumeLabel = document.createElement("span");
                        volumeLabel.textContent = "🔊 試聴音量";
                        const volume = document.createElement("input");
                        volume.type = "range";
                        volume.min = "0"; volume.max = "100"; volume.step = "1";
                        volume.value = String(settings.preview_volume ?? 80);
                        volume.style.cssText = "flex:1;min-width:0;accent-color:#007acc;";
                        const volumeValue = document.createElement("span");
                        volumeValue.style.minWidth = "38px";
                        const updateVolume = () => {
                            const v = Math.max(0, Math.min(100, Number(volume.value) || 0));
                            preview.volume = v / 100;
                            volumeValue.textContent = `${v}%`;
                        };
                        updateVolume();
                        volume.oninput = () => { updateVolume(); store("preview_volume", Number(volume.value)); };
                        volumeRow.append(volumeLabel, volume, volumeValue);
                        previewPanel.appendChild(volumeRow);
                        const saveSection = document.createElement("div");
                        saveSection.style.cssText = "display:flex;flex-direction:column;gap:9px;border-top:1px solid #383c40;padding-top:12px;";
                        previewPanel.appendChild(saveSection);
                        const saveHeading = document.createElement("div");
                        saveHeading.className = "h3-char-title";
                        saveHeading.textContent = "気に入ったらスロットへ保存";
                        saveSection.appendChild(saveHeading);
                        const nameInput = styleControl(document.createElement("input"));
                        nameInput.type = "text"; nameInput.maxLength = 80;
                        nameInput.placeholder = "";
                        nameInput.value = settings.save_name || "";
                        nameInput.oninput = () => store("save_name", nameInput.value);
                        const nameLabel = document.createElement("label");
                        nameLabel.textContent = "保存ファイル名（.wavは自動付与）｜保存先：📁ComfyUI/input/h3_irodori";
                        const nameRow = document.createElement("div");
                        nameRow.className = "h3-field-row";
                        nameRow.append(nameLabel, nameInput);
                        saveSection.appendChild(nameRow);
                        const voiceOptions = [["None", "話者を自動設定しない"]];
                        for (let i = 1; i <= 5; i++) {
                            voiceOptions.push([`S${i}`, `S${i}：${wMap[`char${i}_name`]?.value || "キャラクター"}`]);
                        }
                        const guessSpeaker = () => String(wMap[`${sourceSelect.value}_speaker`]?.value || "None");
                        const speakerSelect = makeSelect(settings.speaker || guessSpeaker(), voiceOptions);
                        const spRow = document.createElement("div");
                        spRow.className = "h3-field-row";
                        const spLabel = document.createElement("label");
                        spLabel.textContent = "H3の話者（保存時にAudioタグを割り当て）";
                        spRow.append(spLabel, speakerSelect);
                        saveSection.appendChild(spRow);
                        speakerSelect.onchange = () => store("speaker", speakerSelect.value);
                        const targetSlot = makeSelect(settings.slot ?? 0, [[0,"A1"],[1,"A2"],[2,"A3"]]);
                        const slotRow = document.createElement("div");
                        slotRow.className = "h3-field-row";
                        const slotLabel = document.createElement("label");
                        slotLabel.textContent = "保存先";
                        slotRow.append(slotLabel, targetSlot);
                        saveSection.appendChild(slotRow);
                        targetSlot.onchange = () => store("slot", Number(targetSlot.value));

                        const saveBtn = document.createElement("button");
                        saveBtn.className = "h3-btn-gen-prompt";
                        saveBtn.textContent = "💾 スロットへ保存";
                        saveSection.appendChild(saveBtn);
                        const savedStatus = document.createElement("div");
                        savedStatus.style.cssText = "font-size:12px;color:#aab7c4;white-space:pre-wrap;";
                        saveSection.appendChild(savedStatus);
                        const normalizeTake = take => {
                            if (!take || typeof take !== "object") return null;
                            if (take.type !== "output" || take.subfolder !== "h3_irodori" || !String(take.filename || "").toLowerCase().endsWith(".wav")) return null;
                            return {filename:take.filename, subfolder:take.subfolder, type:"output"};
                        };
                        let pendingTake = normalizeTake(settings.pending_audio);
                        const setPreview = take => {
                            pendingTake = normalizeTake(take);
                            if (!pendingTake) {
                                preview.pause(); preview.removeAttribute("src"); preview.load();
                                previewPanel.style.display = "none";
                                return;
                            }
                            preview.src = `/view?filename=${encodeURIComponent(pendingTake.filename)}&subfolder=${encodeURIComponent(pendingTake.subfolder)}&type=output`;
                            preview.volume = Number(volume.value) / 100;
                            previewPanel.style.display = "flex";
                        };
                        setPreview(pendingTake);
                        const fillSelect = (el, items, chosen) => {
                            el.replaceChildren();
                            for (const [id, label] of items) {
                                const opt = document.createElement("option");
                                opt.value = id; opt.textContent = label; el.appendChild(opt);
                            }
                            if (items.some(([id]) => id === chosen)) el.value = chosen;
                            else if (items.length) el.value = items[0][0];
                        };
                        let optionsReady = false;
                        (async () => {
                            try {
                                const resp = await api.fetchApi("/h3/irodori/options");
                                const data = await resp.json();
                                if (!resp.ok || !data.success) throw new Error(data.error || "設定を取得できません");
                                if (!card.isConnected) return;
                                fillSelect(modelSelect, (data.models || []).map(x => [x,x]), settings.model || data.defaults.loader.model);
                                if (settings.voice_design_caption === undefined && !voiceDesign.value) {
                                    voiceDesign.value = data.defaults.voice_design?.caption || "";
                                }
                                fillSelect(refSelect, (data.audio_files || []).map(x => [x,x]), settings.reference_audio || data.defaults.reference.audio);
                                const refNone = document.createElement("option");
                                refNone.value = ""; refNone.textContent = "参照なし"; refSelect.prepend(refNone);
                                if (!refSelect.value) refSelect.value = "";
                                optionsReady = true;
                                status.textContent = pendingTake ? "前回生成した音声をプレビューできます。" : "準備完了。音声生成 → 試聴 → 名前を付けて保存、の順で操作できます。";
                            } catch (e) { status.textContent = "初期化エラー: " + e.message; }
                        })();
                        gen.onclick = async () => {
                            if (!optionsReady) { status.textContent = "Irodori設定を読み込み中です"; return; }
                            const text = String(textBox.value).trim();
                            if (!text) { status.textContent = "セリフを入力してね。"; return; }
                            gen.disabled = true;
                            saveBtn.disabled = true;
                            const oldText = gen.textContent;
                            gen.textContent = "生成中…";
                            try {
                                const requestBody = {
                                    text, model: modelSelect.value, voice_design_caption: voiceDesign.value, reference_audio: refSelect.value,
                                    ref_normalize_db: Number(refNorm.value), max_ref_seconds: Number(maxRef.value),
                                    num_steps: Number(steps.value),
                                    seed: autoSeed.checked ? Math.floor(Math.random() * 9007199254740990) + 1 : Math.floor(Number(seed.value)),
                                    seconds: Number(seconds.value), trim_tail: trim.checked
                                };
                                const prep = await api.fetchApi("/h3/irodori/prepare", {
                                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(requestBody)
                                });
                                const prepared = await prep.json();
                                if (!prep.ok || !prepared.success) throw new Error(prepared.error || "音声ワークフローの準備に失敗");
                                status.textContent = "ComfyUIのキューに登録しています…";
                                const queued = await api.fetchApi("/prompt", {
                                    method: "POST", headers: {"Content-Type": "application/json"},
                                    body: JSON.stringify({prompt: prepared.prompt, client_id: api.clientId})
                                });
                                const queuedJson = await queued.json();
                                if (!queued.ok || !queuedJson.prompt_id) {
                                    const nodeErrors = JSON.stringify(queuedJson.node_errors || {});
                                    throw new Error((queuedJson.error || "キュー登録失敗") + " " + nodeErrors);
                                }
                                const promptId = queuedJson.prompt_id;
                                const run = async () => {
                                    const historyRes = await api.fetchApi(`/history/${encodeURIComponent(promptId)}`);
                                    if (!historyRes.ok) throw new Error("生成履歴の取得に失敗");
                                    const history = await historyRes.json();
                                    return history[promptId] || null;
                                };
                                let record = null;
                                for (let attempt = 0; attempt < 600; attempt++) {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    record = await run();
                                    if (record) break;
                                    if (attempt % 5 === 0) status.textContent = `音声を生成中… (${Math.floor((attempt + 1) / 60)}分${(attempt + 1) % 60}秒)`;
                                }
                                if (!record) throw new Error("音声生成の確認がタイムアウトしました。ComfyUIの履歴を確認してください。");
                                if (record.status?.status_str === "error" || record.status?.completed === false) {
                                    const errors = (record.status?.messages || []).filter(x => x[0] === "execution_error");
                                    throw new Error(JSON.stringify(errors).slice(0, 700) || "Irodoriの生成が失敗しました");
                                }
                                const saved = record.outputs?.[prepared.output_node]?.audio?.[0];
                                if (!saved) throw new Error("SaveAudioWavのWAV出力が履歴にありません。生成ログを確認してください。");
                                const take = normalizeTake(saved);
                                if (!take) throw new Error("生成音声のファイル情報が正しくありません。");
                                const oldSettings = getV("irodori_tts", {});
                                setV("irodori_tts", {...oldSettings, ...requestBody,
                                    seed:Math.floor(Number(seed.value)), last_generated_seed:requestBody.seed,
                                    source:sourceSelect.value, pending_audio:take, pending_text:text});
                                if (!card.isConnected) return;
                                setPreview(take);
                                savedStatus.textContent = "";
                                status.textContent = "音声生成完了！試聴して気に入らなければ再度［音声生成］を押してね。";
                            } catch (e) {
                                console.error("[HKMC Irodori]", e);
                                status.textContent = "エラー: " + e.message;
                            } finally {
                                gen.disabled = false;
                                saveBtn.disabled = false;
                                gen.textContent = oldText;
                            }
                        };
                        saveBtn.onclick = async () => {
                            if (!pendingTake) { savedStatus.textContent = "先に音声を生成してください。"; return; }
                            const name = nameInput.value.trim();
                            if (!name) { savedStatus.textContent = "保存する名前を入力してね。"; nameInput.focus(); return; }
                            const slot = Number(targetSlot.value);
                            if (![0, 1, 2].includes(slot)) { savedStatus.textContent = "A1〜A3を選んでね。"; return; }
                            gen.disabled = true;
                            saveBtn.disabled = true;
                            try {
                                const response = await api.fetchApi("/h3/irodori/attach", {
                                    method:"POST", headers:{"Content-Type":"application/json"},
                                    body:JSON.stringify({...pendingTake, name})
                                });
                                const imported = await response.json();
                                if (!response.ok || !imported.success) throw new Error(imported.error || "音声の保存に失敗しました");
                                if (!Array.isArray(state.items)) state.items = [];
                                state.items = state.items.filter(it => !((it.laneType || it.type) === "audio" && Number(it.slot) === slot));
                                state.items.push({type:"audio",laneType:"audio",slot,value:imported.input_name});
                                const timeline = wMap.timeline_data;
                                if (timeline) { timeline.value = JSON.stringify(state); if (timeline.callback) timeline.callback(timeline.value); }
                                const match = /^S([1-5])$/.exec(speakerSelect.value);
                                if (match) {
                                    const target = wMap[`char${match[1]}_audio`];
                                    if (target) { target.value = `<Audio ${slot+1}>`; if (target.callback) target.callback(target.value); }
                                }
                                const oldSettings = getV("irodori_tts", {});
                                setV("irodori_tts", {...oldSettings, save_name:name, speaker:speakerSelect.value,
                                    slot, last_audio:imported.input_name, saved_take_filename:pendingTake.filename});
                                renderFixedMediaLanes();
                                savedStatus.textContent = `保存完了！ ${imported.input_name} → A${slot+1}`;
                                status.textContent = "保存完了。引き続き再生成・試聴もできます。";
                            } catch(e) {
                                console.error("[HKMC Irodori]", e);
                                savedStatus.textContent = "保存エラー: " + e.message;
                            } finally {
                                gen.disabled = false;
                                saveBtn.disabled = false;
                            }
                        };
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
                        titlePrompt.innerHTML = `MiniMax H3 構造化プロンプト生成 <span style="color:gray; font-size:smaller; font-weight:normal;">(タブを切り替えると生成が中断されます)</span>`;

                        const genBtn = document.createElement("button");
                        genBtn.id = "main-gen-btn";
                        genBtn.className = "h3-btn-gen-prompt";
                        genBtn.innerHTML = `<span>▶ 全てのプロンプトを構築・翻訳 (ロック中クリップは除外)</span>`;

                        const useWidget = wMap["use_custom_prompt"];
                        const banner = document.createElement("div");
                        banner.className = "h3-use-prompt-banner";

                        const chkUse = document.createElement("input");
                        chkUse.type = "checkbox";
                        chkUse.checked = useWidget ? !!useWidget.value : false;

                        const txtGroup = document.createElement("div");
                        txtGroup.innerHTML = `<span class="h3-use-prompt-text">このプロンプトで動画を生成する</span><span class="h3-use-prompt-sub">(生成時にLLMを実行せずこのプロンプトを使用 / OllamaはVRAM解放)</span>`;

                        banner.onclick = (e) => {
                            if (e.target !== chkUse) chkUse.checked = !chkUse.checked;
                            if (useWidget) {
                                useWidget.value = chkUse.checked;
                                if (useWidget.callback) useWidget.callback(chkUse.checked);
                            }
                        };
                        banner.append(chkUse, txtGroup);

                        const baseHeader = document.createElement("div");
                        baseHeader.style.cssText = "display:flex; justify-content:space-between; align-items:flex-end; margin-top:12px;";
                        
                        const baseTitleBox = document.createElement("div");
                        baseTitleBox.style.cssText = "display:flex; align-items:center; gap:12px;";
                        
                        const baseTitle = document.createElement("div");
                        baseTitle.className = "h3-clip-result-title";
                        baseTitle.style.marginTop = "0";
                        baseTitle.textContent = "ベースプロンプト";

                        const baseLockLbl = document.createElement("label");
                        baseLockLbl.style.cssText = "display:flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#ffcc00; cursor:pointer;";
                        const baseLockChk = document.createElement("input");
                        baseLockChk.type = "checkbox";
                        baseLockChk.checked = getV("base_locked", false);
                        baseLockLbl.append(baseLockChk, document.createTextNode("🔒 ロック"));

                        baseTitleBox.append(baseTitle, baseLockLbl);

                        const baseSingleBtn = document.createElement("button");
                        baseSingleBtn.textContent = "［このベースプロンプトのみ構築・翻訳］";
                        baseSingleBtn.style.cssText = "background:#1e2430; border:1px solid #324765; color:#5bb3f5; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:4px; cursor:pointer; transition:all 0.1s;";
                        baseSingleBtn.onmouseenter = () => { baseSingleBtn.style.background = "#2b3446"; };
                        baseSingleBtn.onmouseleave = () => { baseSingleBtn.style.background = "#1e2430"; };
                        
                        baseHeader.append(baseTitleBox, baseSingleBtn);

                        const ta = document.createElement("textarea");
                        ta.className = "h3-prompt-textarea";
                        ta.placeholder = "［▶ プロンプト生成を実行］ボタンを押すと、入力項目をもとにLLMが構築したMiniMax H3専用プロンプトがここに出力されます。\n出力された内容は自由に直接編集・追記できます。";
                        
                        const customWidget = wMap["custom_prompt"];
                        if (customWidget && customWidget.value) {
                            ta.value = customWidget.value;
                        }

                        ta.oninput = () => {
                            if (promptCheckState && promptCheckState.text !== ta.value) {
                                promptCheckState = null;
                                if (typeof renderPromptCheck === 'function') renderPromptCheck();
                            }
                            if (customWidget) {
                                customWidget.value = ta.value;
                                if (customWidget.callback) customWidget.callback(ta.value);
                            }
                        };

                        const inspectorPanel = document.createElement('div');
                        inspectorPanel.style.cssText = 'display:flex;flex-direction:column;gap:9px;';
                        const inspectorActions = document.createElement('div');
                        inspectorActions.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
                        const inspectorBtn = directorButton('🔎 プロンプトをチェック',async()=>{
                            if(!ta.value.trim()){alert('ベースプロンプトを生成するか入力してください。');return;}
                            const examinedText=ta.value;
                            const examinedFingerprint=promptCheckFingerprint();
                            inspectorBtn.disabled=true;inspectorBtn.textContent='⏳ LLMが検査中...';
                            try{
                                const sourceSubjects=[];
                                for(let i=1;i<=5;i++){
                                    if(charEnabledState[i]){
                                        sourceSubjects.push({slot:i,kind:'人物',name:String(wMap[`char${i}_name`]?.value||''),
                                            preset:String(wMap[`char${i}_preset`]?.value||''),
                                            extra:String(wMap[`char${i}_extra`]?.value||'')});
                                    }else if(String(wMap[`subject_def_${i}`]?.value||'').trim()){
                                        sourceSubjects.push({slot:i,kind:String(wMap[`subject_kind_${i}`]?.value||'オブジェクト'),
                                            definition:String(wMap[`subject_def_${i}`]?.value||'')});
                                    }
                                }
                                const source={
                                    overall_story:String(wMap.overall_story?.value||''),
                                    shots:directorSnapshot().map((x,i)=>({...x,shot:i+1})).filter(x=>x.enabled),
                                    subjects:sourceSubjects,
                                    quality_control:String(wMap.quality_control?.value||''),
                                    creative_mode:String(wMap.creative_mode?.value||'オフ'),
                                    ambient_sound:String(wMap.ambient_sound?.value||''),
                                    bgm:String(wMap.bgm?.value||'')
                                };
                                const result=await directorRequest('/h3/check_generated_prompt',{
                                    prompt:examinedText,source});
                                if(ta.value!==examinedText || promptCheckFingerprint()!==examinedFingerprint){
                                    alert('検査中にプロンプトか元の指定が変更されました。古いチェック結果は表示しません。');return;
                                }
                                const reviewIssues=Array.isArray(result.issues)?result.issues:[];
                                const hasHighlights=reviewIssues.some(x=>Number.isInteger(x.start)&&x.start>=0);
                                promptCheckState={text:examinedText,sourceFingerprint:examinedFingerprint,
                                    issues:reviewIssues,summary:result.summary||'',
                                    rejectedCount:Number(result.rejected_count)||0,preview:hasHighlights};
                                renderPromptCheck();
                                inspectorResult.scrollIntoView({behavior:'smooth',block:'nearest'});
                            }catch(err){alert('プロンプトチェックエラー: '+err.message);}
                            finally{inspectorBtn.disabled=false;inspectorBtn.textContent='🔎 プロンプトをチェック';}
                        });
                        inspectorBtn.style.cssText='flex:0 0 auto;font-size:11px;padding:7px 12px;';
                        const inspectorHint=directorElement('span','検査結果と赤字の確認表示のみ・本文は自動修正しません','');
                        inspectorHint.style.cssText='font-size:10px;color:#9aa0a6;';
                        inspectorActions.append(inspectorBtn,inspectorHint);
                        const inspectorResult=document.createElement('div');
                        inspectorResult.style.cssText='display:flex;flex-direction:column;gap:9px;';
                        inspectorPanel.append(inspectorActions,inspectorResult);
                        const renderPromptCheck=()=>{
                            inspectorResult.replaceChildren();
                            ta.style.display='block';
                            const state=promptCheckState;
                            if(!state || state.text!==ta.value || state.sourceFingerprint!==promptCheckFingerprint()){
                                if(state)promptCheckState=null;
                                return;
                            }
                            const toolbar=document.createElement('div');
                            toolbar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
                            const locatedCount=state.issues.filter(x=>Number.isInteger(x.start)&&x.start>=0).length;
                            const unlocatedCount=state.issues.length-locatedCount;
                            const status=directorElement('div',state.issues.length?
                                `✅ 根拠確認済み｜要確認 ${state.issues.filter(x=>x.severity==='warning').length}件 / 改善提案 ${state.issues.filter(x=>x.severity!=='warning').length}件 / 赤字・オレンジ表示 ${locatedCount}件`:
                                '✅ チェック完了｜根拠を確認できる問題は検出されませんでした（指摘0件）');
                            status.style.cssText='font-size:11px;font-weight:bold;color:#e2e8f0;';
                            const toggle=directorButton(state.preview?'✏️ 編集に戻る':'🔴 赤字付きで確認',()=>{
                                state.preview=!state.preview;renderPromptCheck();
                            });
                            toggle.style.cssText='flex:0 0 auto;font-size:10px;padding:6px 10px;';
                            toggle.style.display=locatedCount?'block':'none';
                            toolbar.append(status,toggle);inspectorResult.appendChild(toolbar);
                            if(unlocatedCount){
                                const notice=directorElement('div',
                                    `※ ${unlocatedCount}件の指摘は、LLMの引用を原文と照合できなかったため赤字表示していません。下の指摘一覧で確認できます。`);
                                notice.style.cssText='font-size:10px;color:#ffc477;white-space:pre-wrap;';
                                inspectorResult.appendChild(notice);
                            }
                            if(state.rejectedCount){
                                const dismissed=directorElement('div',
                                    `🛡 原文による裏付けが取れなかったLLMの指摘 ${state.rejectedCount}件は採用していません。`);
                                dismissed.style.cssText='font-size:10px;color:#a7b3c0;white-space:pre-wrap;';
                                inspectorResult.appendChild(dismissed);
                            }
                            if(state.preview&&locatedCount){
                                const note=directorElement('div','🔎 赤字・オレンジ色は注意箇所です。下の指摘をクリックすると該当箇所に移動します。編集する際は［編集に戻る］を押してください。');
                                note.style.cssText='font-size:10px;color:#b4bac5;';
                                inspectorResult.appendChild(note);
                            }
                            if(state.summary){
                                const desc=directorElement('div',state.summary);
                                desc.style.cssText='font-size:11px;color:#b8c2cc;white-space:pre-wrap;';
                                inspectorResult.appendChild(desc);
                            }
                            let annotated=null;
                            const marked=new Map();
                            const drawAnnotated=()=>{
                                if(!state.preview)return;
                                ta.style.display='none';
                                annotated=document.createElement('div');
                                annotated.className='h3-prompt-textarea';
                                annotated.style.cssText+='height:380px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;';
                                annotated.setAttribute('role','region');
                                annotated.setAttribute('aria-label','注意箇所を赤字で示したプロンプト（読み取り専用）');
                                let pos=0;
                                const spans=[];
                                state.issues.forEach((issue,index)=>{
                                    spans.push({...issue,index,role:'main'});
                                    const ev=issue.evidence;
                                    if(ev && ev.scope==='prompt' && Number.isInteger(ev.start) && Number.isInteger(ev.end)){
                                        spans.push({start:ev.start,end:ev.end,quote:ev.quote,index,
                                            severity:issue.severity,message:issue.message,role:'support'});
                                    }
                                });
                                const verified=spans.filter(x=>Number.isInteger(x.start)&&Number.isInteger(x.end)&&
                                    x.start>=0&&x.end<=state.text.length&&x.end>x.start&&
                                    state.text.slice(x.start,x.end)===x.quote)
                                    .sort((a,b)=>a.start-b.start||b.end-a.end||
                                        (a.role==='main'?-1:1));
                                for(const item of verified){
                                    if(item.start<pos)continue;
                                    annotated.appendChild(document.createTextNode(state.text.slice(pos,item.start)));
                                    const mark=document.createElement('span');
                                    mark.textContent=state.text.slice(item.start,item.end);
                                    mark.style.cssText=`color:${item.severity==='warning'?'#ff6b6b':'#ffba65'};font-weight:bold;text-decoration:underline;text-decoration-color:currentColor;`;
                                    mark.title=(item.role==='support'?'比較根拠：':'指摘箇所：')+item.message;
                                    mark.dataset.h3ReviewMarker=String(item.index);
                                    mark.dataset.h3ReviewRole=item.role;
                                    annotated.appendChild(mark);
                                    if(item.role==='main' || !marked.has(item.index))marked.set(item.index,mark);
                                    pos=item.end;
                                }
                                annotated.appendChild(document.createTextNode(state.text.slice(pos)));
                                inspectorResult.appendChild(annotated);
                            };
                            drawAnnotated();
                            if(!state.issues.length)return;
                            const list=directorElement('div');
                            list.style.cssText='display:flex;flex-direction:column;gap:7px;';
                            state.issues.forEach((issue,index)=>{
                                const item=directorElement('div');
                                item.style.cssText=`border:1px solid ${issue.severity==='warning'?'#854242':'#65573c'};background:#16191e;border-radius:7px;padding:9px;display:flex;flex-direction:column;gap:5px;cursor:pointer;`;
                                const heading=directorElement('div',`${issue.severity==='warning'?'⚠ 要確認':'ℹ 改善提案'}｜${issue.category||'表現'}`);
                                heading.style.cssText=`font-weight:bold;color:${issue.severity==='warning'?'#ff7878':'#ffc477'};font-size:11px;`;
                                const message=directorElement('div',issue.message||'');
                                message.style.cssText='font-size:11px;color:#e0e0e0;white-space:pre-wrap;';
                                item.append(heading,message);
                                const primary=directorElement('div','📍 指摘箇所（プロンプト原文）：'+(issue.quote||''));
                                primary.style.cssText='font-size:10px;color:#ffd4d4;white-space:pre-wrap;overflow-wrap:anywhere;';
                                item.appendChild(primary);
                                const evidence=issue.evidence;
                                if(evidence && evidence.quote){
                                    const evidenceLabel=evidence.scope==='user'?'ユーザー指定の根拠':'比較対象（プロンプト原文）';
                                    const support=directorElement('div',`📎 ${evidenceLabel}：${evidence.quote}`);
                                    support.style.cssText='font-size:10px;color:#b5d5f6;white-space:pre-wrap;overflow-wrap:anywhere;';
                                    item.appendChild(support);
                                }
                                if(issue.suggestion){
                                    const suggestion=directorElement('div','参考：'+issue.suggestion);
                                    suggestion.style.cssText='font-size:10px;color:#a7b3c0;white-space:pre-wrap;';
                                    item.appendChild(suggestion);
                                }
                                if(Number.isInteger(issue.start)&&issue.start>=0){
                                    item.title='クリックで該当するプロンプト部分へ移動';
                                    item.onclick=()=>{
                                        state.preview=true;
                                        renderPromptCheck();
                                        const target=inspectorResult.querySelectorAll('[data-h3-review-marker]');
                                        const found=Array.from(target).find(x=>Number(x.dataset.h3ReviewMarker)===index&&
                                            x.dataset.h3ReviewRole==='main')||
                                            Array.from(target).find(x=>Number(x.dataset.h3ReviewMarker)===index);
                                        if(found)found.scrollIntoView({behavior:'smooth',block:'center'});
                                    };
                                }else{
                                    item.style.cursor='default';
                                    item.title='指摘は有効ですが、原文位置は特定できませんでした';
                                    const noMark=directorElement('div','※原文位置を特定できなかったため、赤字表示はありません。');
                                    noMark.style.cssText='font-size:10px;color:#ffc477;';
                                    item.appendChild(noMark);
                                }
                                list.appendChild(item);
                            });
                            inspectorResult.appendChild(list);
                        };
                        const applyBaseLockState = () => {
                            if (baseLockChk.checked) {
                                ta.readOnly = true; ta.style.opacity = "0.5"; ta.style.pointerEvents = "none";
                                baseSingleBtn.style.display = "none";
                                baseTitle.textContent = "ベースプロンプト (🔒 ロック中)";
                                baseTitle.style.color = "#8b949e";
                            } else {
                                ta.readOnly = false; ta.style.opacity = "1"; ta.style.pointerEvents = "auto";
                                baseSingleBtn.style.display = "block";
                                baseTitle.textContent = "ベースプロンプト (直接編集可能)";
                                baseTitle.style.color = "#ffffff";
                            }
                        };
                        applyBaseLockState();
                        
                        baseLockChk.onchange = () => {
                            setV("base_locked", baseLockChk.checked);
                            applyBaseLockState();
                        };

                        baseSingleBtn.onclick = async () => {
                            baseSingleBtn.disabled = true; 
                            baseSingleBtn.textContent = "⏳ 構築中...";
                            
                            const payload = { target_clip: "base" };
                            (node.widgets || []).forEach(w => { payload[w.name] = w.value; });
                            try {
                                const parsed = h3ParseClipSettings(wMap["clips_data_json"].value);
                                Object.assign(payload, parsed);
                            } catch(e) {}
                            
                            const originalLock = payload.base_locked;
                            payload.base_locked = false;

                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 600000);

                                const res = await fetch("/h3/generate_prompt", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(payload),
                                    signal: controller.signal
                                });
                                clearTimeout(timeoutId);

                                const data = await res.json();
                                if (data.success && data.prompt) {
                                    ta.value = data.prompt;
                                    ta.oninput();
                                    promptCheckState=null;renderPromptCheck();
                                } else { 
                                    alert("プロンプト生成エラー: " + (data.error || "不明なエラー")); 
                                }
                            } catch (err) { 
                                alert("通信エラー: " + err.message); 
                            } finally { 
                                baseSingleBtn.disabled = false; 
                                baseSingleBtn.textContent = "［このベースプロンプトのみ構築・翻訳］"; 
                                if (originalLock) setV("base_locked", true);
                            }
                        };


                        const clipResContainer = document.createElement("div");
                        clipResContainer.className = "h3-clip-results-container";
                        const genClipWidget = wMap["generated_clip_prompts"];

                        const updateClipResultsUI = () => {
                            clipResContainer.replaceChildren();
                            let cd = {};
                            try { cd = JSON.parse(genClipWidget.value || "{}"); } catch(e){}
                            
                            for (let i = 1; i <= 10; i++) {
                                if (wMap[`c${i}_enabled`] && wMap[`c${i}_enabled`].value) {
                                    const headerBar = document.createElement("div");
                                    headerBar.style.cssText = "display:flex; justify-content:space-between; align-items:flex-end; margin-top:4px;";
                                    
                                    const titleBlock = document.createElement("div");
                                    titleBlock.style.cssText = "display:flex; align-items:center; gap:12px;";

                                    const t = document.createElement("div"); 
                                    t.className = "h3-clip-result-title"; 
                                    t.style.marginTop = "0";
                                    t.textContent = `クリップ ${i} プロンプト`;

                                    const lockLabel = document.createElement("label");
                                    lockLabel.style.cssText = "display:flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#ffcc00; cursor:pointer;";
                                    const lockChk = document.createElement("input");
                                    lockChk.type = "checkbox";
                                    lockChk.checked = getV(`c${i}_locked`, false);
                                    lockLabel.append(lockChk, document.createTextNode("🔒 ロック"));

                                    titleBlock.append(t, lockLabel);

                                    const singleBtn = document.createElement("button");
                                    singleBtn.textContent = "［このクリップのみ構築・翻訳］";
                                    singleBtn.title = `クリップ${i}のみをLLMに翻訳させます`;
                                    singleBtn.style.cssText = "background:#1e2430; border:1px solid #324765; color:#5bb3f5; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:4px; cursor:pointer; transition:all 0.1s;";
                                    singleBtn.onmouseenter = () => { singleBtn.style.background = "#2b3446"; };
                                    singleBtn.onmouseleave = () => { singleBtn.style.background = "#1e2430"; };

                                    headerBar.append(titleBlock, singleBtn);

                                    const cta = document.createElement("textarea");
                                    cta.className = "h3-clip-result-textarea";
                                    cta.value = cd[i] || "";
                                    
                                    const applyLockState = () => {
                                        if (lockChk.checked) {
                                            cta.readOnly = true;
                                            cta.style.opacity = "0.5";
                                            cta.style.pointerEvents = "none";
                                            singleBtn.style.display = "none";
                                            t.textContent = `クリップ ${i} プロンプト (🔒 ロック中)`;
                                            t.style.color = "#8b949e";
                                        } else {
                                            cta.readOnly = false;
                                            cta.style.opacity = "1";
                                            cta.style.pointerEvents = "auto";
                                            singleBtn.style.display = "block";
                                            t.textContent = `クリップ ${i} プロンプト (直接編集可能)`;
                                            t.style.color = "#ffffff";
                                        }
                                    };
                                    applyLockState();

                                    lockChk.onchange = () => {
                                        setV(`c${i}_locked`, lockChk.checked);
                                        applyLockState();
                                    };

                                    cta.oninput = () => {
                                        try {
                                            const current = JSON.parse(genClipWidget.value || "{}");
                                            current[String(i)] = cta.value;
                                            genClipWidget.value = JSON.stringify(current);
                                            if (genClipWidget.callback) genClipWidget.callback(genClipWidget.value);
                                        } catch(e) {}
                                    };
                                    
                                    singleBtn.onclick = async () => {
                                        singleBtn.disabled = true; 
                                        singleBtn.textContent = "⏳ 構築中...";
                                        
                                        const payload = { target_clip: i };
                                        (node.widgets || []).forEach(w => { payload[w.name] = w.value; });
                                        try {
                                            const parsed = h3ParseClipSettings(wMap["clips_data_json"].value);
                                            Object.assign(payload, parsed);
                                        } catch(e) {}
                                        
                                        const originalLock = payload[`c${i}_locked`];
                                        payload[`c${i}_locked`] = false;

                                        try {
                                            const controller = new AbortController();
                                            const timeoutId = setTimeout(() => controller.abort(), 600000);

                                            const res = await fetch("/h3/generate_prompt", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify(payload),
                                                signal: controller.signal
                                            });
                                            clearTimeout(timeoutId);

                                            const data = await res.json();
                                            if (data.success && data.clip_prompts && data.clip_prompts[i]) {
                                                cta.value = data.clip_prompts[i];
                                                cta.oninput();
                                            } else { 
                                                alert("プロンプト生成エラー: " + (data.error || "不明なエラー")); 
                                            }
                                        } catch (err) { 
                                            alert("通信エラー: " + err.message); 
                                        } finally { 
                                            singleBtn.disabled = false; 
                                            singleBtn.textContent = "［このクリップのみ構築・翻訳］"; 
                                            if (originalLock) setV(`c${i}_locked`, true);
                                        }
                                    };

                                    clipResContainer.append(headerBar, cta);
                                }
                            }
                        };

                        if (genClipWidget) {
                            updateClipResultsUI();
                        }

                        genBtn.onclick = async () => {
                            genBtn.disabled = true;
                            genBtn.innerHTML = `<span>⏳ プロンプト構築中... (LLM通信中)</span>`;

                            const payload = {};
                            (node.widgets || []).forEach(w => { payload[w.name] = w.value; });

                            for (let i = 1; i <= 5; i++) payload[`char${i}_enabled`] = charEnabledState[i];
                            for (let i = 1; i <= 4; i++) payload[`shot${i}_enabled`] = shotEnabledState[i];
                            for (let i = 1; i <= 10; i++) {
                                payload[`c${i}_enabled`] = wMap[`c${i}_enabled`] ? !!wMap[`c${i}_enabled`].value : false;
                                for (let j = 1; j <= 4; j++) {
                                    payload[`c${i}_s${j}_enabled`] = !!clipShotEnabledState[i][j];
                                }
                            }
                            
                            try {
                                const parsed = h3ParseClipSettings(wMap["clips_data_json"].value);
                                Object.assign(payload, parsed);
                            } catch(e) {}

                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 600000);

                                const res = await fetch("/h3/generate_prompt", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(payload),
                                    signal: controller.signal
                                });
                                clearTimeout(timeoutId);
                                const data = await res.json();
                                if (data.success) {
                                    if (data.prompt) {
                                        ta.value = data.prompt;
                                        promptCheckState=null;renderPromptCheck();
                                        if (customWidget) {
                                            customWidget.value = data.prompt;
                                            if (customWidget.callback) customWidget.callback(data.prompt);
                                        }
                                    }
                                    if (data.clip_prompts) {
                                        let current = {};
                                        try { current = JSON.parse(genClipWidget.value || "{}"); } catch(e){}
                                        Object.assign(current, data.clip_prompts);
                                        const strData = JSON.stringify(current);
                                        if (genClipWidget) {
                                            genClipWidget.value = strData;
                                            if (genClipWidget.callback) genClipWidget.callback(strData);
                                        }
                                        updateClipResultsUI();
                                    }

                                    chkUse.checked = true;
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
                                genBtn.innerHTML = `<span>▶ 全てのプロンプトを構築・翻訳 (ロック中クリップは除外)</span>`;
                            }
                        };

                        if(promptCheckState && (promptCheckState.text!==ta.value ||
                           promptCheckState.sourceFingerprint!==promptCheckFingerprint()))promptCheckState=null;
                        renderPromptCheck();
                        contentArea.append(titlePrompt, genBtn, banner, baseHeader, ta, inspectorPanel, clipResContainer);
                        
                    } else if (activeTab === "cache") {
                        const resetBox = document.createElement("div");
                        resetBox.style.cssText = "background:#141416;border:1px solid #383838;border-radius:8px;padding:12px;margin-bottom:14px;";
                        const resetTitle = document.createElement("div");
                        resetTitle.textContent = "入力内容の消去";
                        resetTitle.style.cssText = "font-size:13px;font-weight:bold;color:#ffffff;margin-bottom:7px;";
                        const resetNote = document.createElement("div");
                        resetNote.textContent = "消去したいタブにチェックを入れてください。チェックを外したタブの入力は保持します。";
                        resetNote.style.cssText = "font-size:11px;color:#9aa0a6;line-height:1.6;margin-bottom:9px;";
                        const resetGrid = document.createElement("div");
                        resetGrid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:9px;";
                        const resetChecks = {};
                        for (const section of H3_RESET_SECTIONS) {
                            const label = document.createElement("label");
                            label.style.cssText = "display:flex;align-items:center;gap:7px;background:#202020;border:1px solid #383838;border-radius:8px;padding:8px 9px;color:#dbe0e6;font-size:11px;font-weight:600;cursor:pointer;min-width:0;";
                            const checkbox = document.createElement("input");
                            checkbox.type = "checkbox";
                            checkbox.checked = !!h3ResetSelection[section.id];
                            checkbox.style.cssText = "accent-color:#007acc;width:15px;height:15px;flex-shrink:0;cursor:pointer;";
                            checkbox.onchange = () => {
                                h3ResetSelection[section.id] = checkbox.checked;
                                updateResetButton();
                            };
                            label.append(checkbox, document.createTextNode(section.label));
                            resetGrid.appendChild(label);
                            resetChecks[section.id] = checkbox;
                        }
                        const selectControls = document.createElement("div");
                        selectControls.style.cssText = "display:flex;gap:12px;justify-content:flex-end;margin-bottom:9px;";
                        for (const [text, checked] of [["全選択", true], ["全解除", false]]) {
                            const button = document.createElement("button");
                            button.type = "button";
                            button.textContent = text;
                            button.style.cssText = "background:none;border:none;padding:2px;color:#9aa0a6;text-decoration:underline;font-size:10px;cursor:pointer;";
                            button.onclick = () => {
                                for (const section of H3_RESET_SECTIONS) {
                                    h3ResetSelection[section.id] = checked;
                                    resetChecks[section.id].checked = checked;
                                }
                                updateResetButton();
                            };
                            selectControls.appendChild(button);
                        }
                        const resetHint = document.createElement("div");
                        resetHint.textContent = "※ メディアボックスの割り当ては［キャラクター設定］に含まれます。LLM設定・Irodori-TTS設定、アップロード済みファイルは消去しません。";
                        resetHint.style.cssText = "font-size:10px;color:#8b949e;line-height:1.5;margin-bottom:10px;";
                        const resetBtn = document.createElement("button");
                        resetBtn.type = "button";
                        resetBtn.style.cssText = "width:100%;background:#a33442;border:1px solid #d96774;border-radius:5px;color:white;padding:10px;font-size:12px;font-weight:bold;cursor:pointer;";
                        const updateResetButton = () => {
                            const count = H3_RESET_SECTIONS.filter(s => h3ResetSelection[s.id]).length;
                            resetBtn.disabled = count === 0;
                            resetBtn.textContent = count ? `🗑 選択した${count}項目を消去` : "消去する項目を選択してください";
                            resetBtn.style.opacity = count ? "1" : "0.45";
                            resetBtn.style.cursor = count ? "pointer" : "not-allowed";
                        };
                        updateResetButton();
                        resetBtn.onclick = () => {
                            const selected = Object.fromEntries(H3_RESET_SECTIONS.map(s => [s.id, !!h3ResetSelection[s.id]]));
                            const labels = H3_RESET_SECTIONS.filter(s => selected[s.id]).map(s => `・${s.label}`);
                            if (!labels.length) return;
                            if (!window.confirm(`次の入力内容を新規配置時の状態に戻します。\n\n${labels.join("\n")}\n\nチェックしていない項目は保持します。\nこの操作は取り消せません。実行しますか？`)) return;

                            h3ResetSelectedWidgets(wMap, h3FreshWidgetValues, selected);
                            if (selected.cast) {
                                state = h3ParseClipSettings(wMap.timeline_data?.value);
                                if (!Array.isArray(state.items)) state.items = [];
                                activeSlotConfig = null;
                                fileInput.value = "";
                                for (let i = 1; i <= 5; i++) {
                                    charEnabledState[i] = !!wMap[`char${i}_enabled`]?.value;
                                    syncRefModRemote(i, "None");
                                }
                                renderFixedMediaLanes();
                            }
                            if (selected.timeline) {
                                for (let i = 1; i <= 4; i++) shotEnabledState[i] = !!wMap[`shot${i}_enabled`]?.value;
                                pendingDirectorPatch = null;
                                directorHistory = [];
                            }
                            if (selected.clip) {
                                clipData = h3ParseClipSettings(wMap.clips_data_json?.value);
                                for (let i = 1; i <= 10; i++) {
                                    clipEnabledState[i] = !!wMap[`c${i}_enabled`]?.value;
                                    for (let j = 1; j <= 4; j++) clipShotEnabledState[i][j] = !!wMap[`c${i}_s${j}_enabled`]?.value;
                                }
                                activeClipTab = 1;
                            } else if (selected.prompt) {
                                clipData = h3ParseClipSettings(wMap.clips_data_json?.value);
                            }
                            if (selected.auto) {
                                const freshAuto = h3ParseClipSettings(wMap.auto_data?.value);
                                autoState = {enabled:false,directorMode:"detailed",overwrite:false,noClips:false,duration:5,clipCount:1,story:"",...freshAuto};
                            }
                            if (selected.prompt) promptCheckState = null;
                            lastFocusedInput = null;
                            renderTabContent();
                            node.setDirtyCanvas(true, true);
                        };
                        resetBox.append(resetTitle, resetNote, resetGrid, selectControls, resetHint, resetBtn);
                        contentArea.appendChild(resetBox);
                        const card = document.createElement("div"); 
                        card.className = "h3-char-card";
                        card.style.cssText = "background:transparent; border:none; padding:0;";

                        const infoBox = document.createElement("div");
                        infoBox.style.cssText = "background:#1e2430; border:1px solid #324765; border-radius:6px; padding:10px; margin-bottom:12px;";
                        const infoText = document.createElement("div");
                        infoText.style.cssText = "font-size:11px; color:#c0d1e3; line-height:1.5;";
                        infoText.innerHTML = "クリップ生成専用のSeed / Latent管理です。<br>ベース生成のSeed管理はSeed (rgthree)でお願いします。";
                        infoBox.appendChild(infoText);
                        card.appendChild(infoBox);

                        if (!clipData.cache_settings) clipData.cache_settings = {};

                        let enabledCount = 0;
                        for (let i = 1; i <= 10; i++) {
                            if (wMap[`c${i}_enabled`] && wMap[`c${i}_enabled`].value) {
                                enabledCount++;
                                
                                if (!clipData.cache_settings[i]) {
                                    clipData.cache_settings[i] = { seed: -1, last_seed: null, save_latent: false };
                                }
                                const cInfo = clipData.cache_settings[i];

                                const row = document.createElement("div");
                                row.style.cssText = "display:flex; align-items:center; gap:6px; background:#14161b; padding:6px 10px; border-radius:6px; border:1px solid #242730; margin-bottom:6px;";
                                
                                const badge = document.createElement("div");
                                badge.style.cssText = "flex: 0 0 24px; font-size:11px; font-weight:bold; color:#8bb4dc; user-select:none; text-align:center;";
                                badge.textContent = `[${i}]`;

                                const lblSeed = document.createElement("span");
                                lblSeed.textContent = "Seed:";
                                lblSeed.style.cssText = "font-size:10px; color:#9aa0a6; margin-left:4px;";

                                const inpSeed = document.createElement("input");
                                inpSeed.type = "text";
                                inpSeed.value = cInfo.seed;
                                inpSeed.style.cssText = "flex: 0 0 120px; background:#08090b; border:1px solid #383e4c; border-radius:4px; color:#ffffff; font-family:Consolas, monospace; font-size:11px; padding:4px 6px; outline:none;";
                                inpSeed.oninput = () => {
                                    const val = inpSeed.value.replace(/[^0-9-]/g, "");
                                    cInfo.seed = val ? parseInt(val) : -1;
                                    saveClipData();
                                };

                                const btnRand = document.createElement("button");
                                btnRand.textContent = "🎲 ランダム";
                                btnRand.title = "Seedを -1 (ランダム) にリセットします";
                                btnRand.style.cssText = "background:#20242c; border:1px solid #383e4c; color:#dbe0e6; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; cursor:pointer;";
                                btnRand.onclick = () => {
                                    cInfo.seed = -1;
                                    inpSeed.value = -1;
                                    saveClipData();
                                };

                                const btnFix = document.createElement("button");
                                btnFix.textContent = cInfo.last_seed ? `♻️ 固定 (${cInfo.last_seed})` : "♻️ 固定";
                                btnFix.disabled = !cInfo.last_seed;
                                btnFix.title = cInfo.last_seed ? "前回の生成で使われた数値で固定してスキップ可能にします" : "まだ生成されていません";
                                btnFix.style.cssText = `background:#20242c; border:1px solid #383e4c; color:${cInfo.last_seed ? '#dbe0e6' : '#555'}; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; cursor:${cInfo.last_seed ? 'pointer' : 'not-allowed'};`;
                                btnFix.onclick = () => {
                                    if (cInfo.last_seed) {
                                        cInfo.seed = cInfo.last_seed;
                                        inpSeed.value = cInfo.last_seed;
                                        saveClipData();
                                    }
                                };

                                const lblLatent = document.createElement("label");
                                lblLatent.style.cssText = "display:flex; align-items:center; gap:4px; font-size:10px; font-weight:bold; color:#ffcc00; cursor:pointer; margin-left:auto;";
                                const chkLatent = document.createElement("input");
                                chkLatent.type = "checkbox";
                                chkLatent.checked = cInfo.save_latent;
                                chkLatent.onchange = () => {
                                    cInfo.save_latent = chkLatent.checked;
                                    saveClipData();
                                };
                                lblLatent.append(chkLatent, document.createTextNode("💾 Latentをキャッシュ保存"));

                                row.append(badge, lblSeed, inpSeed, btnRand, btnFix, lblLatent);
                                card.appendChild(row);
                            }
                        }
                        
                        if (enabledCount === 0) {
                            const msg = document.createElement("div");
                            msg.style.cssText = "font-size:11px; color:#888; padding:10px;";
                            msg.textContent = "有効なクリップがありません。「クリップ」タブで有効にしてください。";
                            card.appendChild(msg);
                        }
                        
                        contentArea.appendChild(card);
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

                const buildSlot = (laneEl, laneType, slotIdx, acceptTypes, isKeyframe = false, customBadge = null) => {
                    const slot = document.createElement("div");
                    const slotClass = isKeyframe ? "keyframe-slot" : `${laneType}-slot`;
                    slot.className = `h3-slot ${slotClass}`;

                    const item = (Array.isArray(state?.items) ? state.items : []).find(it => (it.laneType || it.type) === laneType && it.slot === slotIdx);

                    const badge = document.createElement("span");
                    badge.className = "h3-slot-badge";
                    badge.textContent = customBadge ? customBadge : `#${slotIdx + 1}`;
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
                    imgBlock.innerHTML = `<div class="h3-section-title">リファレンス画像 <span class="h3-section-sub">(Picture 1-9)</span></div>`;
                    const imgLane = document.createElement("div");
                    imgLane.className = "h3-lane";
                    imgBlock.appendChild(imgLane);
                    for (let i = 0; i < 9; i++) {
                        buildSlot(imgLane, "image", i, "image/*");
                    }

                    const kfBlock = document.createElement("div");
                    kfBlock.className = "h3-lane-block";
                    kfBlock.innerHTML = `<div class="h3-section-title">キーフレーム画像 <span class="h3-section-sub">(First Frame / Last Frame)</span></div>`;
                    const kfLane = document.createElement("div");
                    kfLane.className = "h3-lane";
                    kfBlock.appendChild(kfLane);
                    buildSlot(kfLane, "keyframe", 0, "image/*", true, "開始");
                    buildSlot(kfLane, "keyframe", 1, "image/*", true, "終了");

                    const vidBlock = document.createElement("div");
                    vidBlock.className = "h3-lane-block";
                    vidBlock.innerHTML = `<div class="h3-section-title">リファレンス映像 <span class="h3-section-sub">(Video 1-2)</span></div>`;
                    const vidLane = document.createElement("div");
                    vidLane.className = "h3-lane";
                    vidBlock.appendChild(vidLane);
                    for (let i = 0; i < 2; i++) {
                        buildSlot(vidLane, "video", i, "video/*");
                    }

                    const audBlock = document.createElement("div");
                    audBlock.className = "h3-lane-block";
                    audBlock.innerHTML = `<div class="h3-section-title">音声ボックス <span class="h3-section-sub">(Audio 1-3, Drive, Final)</span></div>`;
                    const audLane = document.createElement("div");
                    audLane.className = "h3-lane";
                    audLane.style.flexWrap = "wrap";
                    audBlock.appendChild(audLane);
                    
                    for (let i = 0; i < 3; i++) {
                        buildSlot(audLane, "audio", i, "audio/*");
                    }
                    
                    const spacer = document.createElement("div");
                    spacer.style.width = "12px";
                    audLane.appendChild(spacer);
                    
                    buildSlot(audLane, "audio", 3, "audio/*", false, "Drive");
                    buildSlot(audLane, "audio", 4, "audio/*", false, "Final");

                    mediaBody.append(imgBlock, kfBlock, vidBlock, audBlock);
                };

                if (node.addDOMWidget) {
                    node.addDOMWidget("studio_console_ui", "custom", root, {
                        serialize: false,
                        hideOnZoom: false,
                        getHeight: () => 820
                    });
                }

                node.setSize([H3_MIN_WIDTH, H3_MIN_HEIGHT]);

                const onResize = node.onResize;
                node.onResize = function (size) {
                    if (size[0] < H3_MIN_WIDTH) size[0] = H3_MIN_WIDTH;
                    if (size[1] < H3_MIN_HEIGHT) size[1] = H3_MIN_HEIGHT;

                    if (onResize) onResize.apply(this, arguments);

                    if (root) {
                        root.style.width = (size[0] - 20) + "px";
                        root.style.height = (size[1] - 85) + "px";
                    }
                };

                renderTabContent();
                renderFixedMediaLanes();

                const onConfigure = node.onConfigure;
                node.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    for (let i = 1; i <= 5; i++) {
                        if (wMap[`char${i}_enabled`]) charEnabledState[i] = !!wMap[`char${i}_enabled`].value;
                    }
                    for (let i = 1; i <= 4; i++) {
                        if (wMap[`shot${i}_enabled`]) shotEnabledState[i] = !!wMap[`shot${i}_enabled`].value;
                    }
                    for (let i = 1; i <= 10; i++) {
                        if (wMap[`c${i}_enabled`]) clipEnabledState[i] = !!wMap[`c${i}_enabled`].value;
                        for (let j = 1; j <= 4; j++) {
                            if (wMap[`c${i}_s${j}_enabled`]) {
                                clipShotEnabledState[i][j] = !!wMap[`c${i}_s${j}_enabled`].value;
                            }
                        }
                    }
                    try {
                        if (wMap["timeline_data"] && wMap["timeline_data"].value) {
                            state = JSON.parse(wMap["timeline_data"].value);
                        }
                    } catch (e) {}
                    if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
                    if (!Array.isArray(state.items)) state.items = [];
                    try {
                        if (wMap["auto_data"] && wMap["auto_data"].value) {
                            autoState = { ...autoState, ...JSON.parse(wMap["auto_data"].value) };
                        }
                    } catch(e){}
                    clipData = h3ParseClipSettings(wMap["clips_data_json"]?.value);

                    renderTabContent();
                    renderFixedMediaLanes();

                    for (let i = 1; i <= 5; i++) {
                        const isEnabled = wMap[`char${i}_enabled`] ? !!wMap[`char${i}_enabled`].value : (i === 1);
                        if (!isEnabled) {
                            syncRefModRemote(i, "None");
                        } else if (wMap[`char${i}_refmod`]) {
                            syncRefModRemote(i, wMap[`char${i}_refmod`].value);
                        }
                    }
                    
                    if (node.size[0] < H3_MIN_WIDTH || node.size[1] < H3_MIN_HEIGHT) {
                        node.setSize([Math.max(H3_MIN_WIDTH, node.size[0]), Math.max(H3_MIN_HEIGHT, node.size[1])]);
                    }
                    if (root) {
                        root.style.width = (node.size[0] - 20) + "px";
                        root.style.height = (node.size[1] - 85) + "px";
                    }
                };

                const originalOnRemoved = node.onRemoved;
                node.onRemoved = function (...args) {
                    h3Disposed = true;
                    document.removeEventListener("h3_seeds_updated", onH3SeedsUpdated);
                    if (h3SeedRefreshFrame !== null) cancelAnimationFrame(h3SeedRefreshFrame);
                    if (h3DragCleanup) h3DragCleanup();
                    h3UnsubscribeBackground(root);
                    if (originalOnRemoved) return originalOnRemoved.apply(this, args);
                };
            };
        }
    }
});