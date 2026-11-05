import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SHOTS = ["全身", "膝上", "腰上", "上半身", "胸上", "顔"];
const ANGLES = ["正面", "横から", "斜め前", "斜め後ろ", "上から", "下から", "後ろから", "ダッチアングル", "逆さま", "真上", "真下"];
const TABS = ["考案", "プロンプト", "LLM設定"];
const CHARACTER_CATEGORIES = [
    ["identity", "基本属性"], ["face", "顔・瞳"], ["hair", "髪"],
    ["body", "身体・耳・尻尾"], ["upper", "上半身衣装"], ["waist", "腰・ベルト"],
    ["lower", "下半身衣装"], ["legs", "脚・靴"], ["hands", "手・手袋"],
    ["accessories", "装飾・装備"], ["expression", "表情"], ["pose", "ポーズ"],
    ["other", "その他"]
];
const HIDDEN = ["enable_director", "character_preset", "character_tag_selection", "part_head", "part_upper", "part_waist", "part_lower", "part_legs", "full_back_view", "shot_choice", "angle_choice", "quality_prompt", "scene_prompt", "llm_provider", "llm_api_key", "llm_model", "creative_mode", "convert_all_to_natural", "enable_negative", "negative_preset", "negative_prompt", "lock_final_prompt", "final_positive_prompt"];

function installAnimaStyles() {
    if (document.getElementById("anima-director-styles-v5")) return;
    const style = document.createElement("style");
    style.id = "anima-director-styles-v5";
    style.textContent = `
        .ad5 { display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;background:#000;color:#dbe0e6;font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;border-radius:8px; }
        .ad5-mode { flex-shrink:0;display:flex;gap:7px;padding:10px 10px 8px;border-bottom:1px solid #272727; }
        .ad5-mode label { flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:7px 4px;cursor:pointer;background:#171717;border:1px solid #383838;border-radius:7px;font-weight:600;color:#aab4bf; }
        .ad5-mode label.selected { background:#183247;border-color:#4384b4;color:white; }
        .ad5-mode input { margin:0;accent-color:#1987d0; }
        .ad5-tabs { display:flex;flex-shrink:0;gap:5px;padding:6px 10px 0;border-bottom:1px solid #282828; }
        .ad5-tabs button { flex:1;padding:7px 3px;background:#141416;border:1px solid #24262b;border-bottom:0;border-radius:6px 6px 0 0;color:#8b949e;font-size:11px;font-weight:600;cursor:pointer; }
        .ad5-tabs button.active { background:#2c2f36;border-color:#4a4f5a;color:#fff; }
        .ad5-body { flex:1;min-height:0;display:flex;flex-direction:column;gap:11px;padding:12px;overflow-y:auto;overflow-x:hidden;box-sizing:border-box; }
        .ad5-field { display:flex;flex-direction:column;gap:5px;min-width:0; }
        .ad5-field>label { font-size:10px;font-weight:600;color:#aeb7c2; }
        .ad5-field select,.ad5-field textarea,.ad5-field input { width:100%;box-sizing:border-box;min-width:0;background:#202020;color:#e6e6e6;border:1px solid #383838;border-radius:8px;padding:8px;outline:none;font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .ad5-field textarea { min-height:62px;line-height:1.5;resize:vertical; }
        .ad5-field.ad5-expand { flex:1 1 auto;min-height:105px; }
        .ad5-field.ad5-expand textarea { flex:1 1 auto;min-height:80px; }
        .ad5-body.ad5-normal .ad5-field { flex:1 1 auto;min-height:100px; }
        .ad5-body.ad5-normal .ad5-field textarea { flex:1 1 auto;min-height:70px; }
        .ad5-field textarea[readonly] { background:#141416;color:#aab9c7;border-color:#34383e;resize:vertical; }
        .ad5-field textarea:focus,.ad5-field input:focus,.ad5-field select:focus { border-color:#5b94c3; }
        .ad5-hint { color:#87939e;font-size:9px;line-height:1.5; }
        .ad5-heading { padding-bottom:6px;border-bottom:1px solid #353535;font-size:11px;font-weight:700; }
        .ad5-check { display:flex;gap:7px;align-items:center;color:#bac3ce;font-size:10px; }
        .ad5-check input { width:auto;accent-color:#178bd0; }
        .ad5-button { flex-shrink:0;padding:10px;background:#007acc;color:#fff;border:1px solid #278bd3;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer; }
        .ad5-button:disabled { background:#303030;color:#888;border-color:#444;cursor:wait; }
        .ad5-status { min-height:16px;color:#90a8bd;font-size:10px;line-height:1.5; }
        .ad5-character { display:flex;flex-direction:column;gap:7px;flex-shrink:0;min-height:0; }
        .ad5-character-bar { display:flex;justify-content:space-between;align-items:center;gap:7px;flex-wrap:wrap; }
        .ad5-character-title { font-size:10px;font-weight:700;color:#bdc6d1; }
        .ad5-character-tools { display:flex;align-items:center;gap:5px; }
        .ad5-character-tools button { background:#1d2229;color:#c5d3e0;border:1px solid #3b444f;border-radius:5px;font-size:10px;padding:4px 7px;cursor:pointer; }
        .ad5-character-tools button:hover { border-color:#6a9ac5; }
        .ad5-character-summary { font-size:10px;color:#91a4b6; }
        .ad5-character-list { display:flex;flex-direction:column;gap:2px;overflow-y:auto;max-height:265px;min-height:78px;box-sizing:border-box;background:#121416;border:1px solid #303843;border-radius:6px;padding:5px; }
        .ad5-character-group { display:flex;flex-direction:column;min-width:0;border-bottom:1px solid #292f36; }
        .ad5-character-group:last-child { border-bottom:0; }
        .ad5-character-head { display:flex;gap:7px;align-items:center;min-height:34px;padding:3px 5px; }
        .ad5-character-head input,.ad5-character-item input { margin:0;accent-color:#1987d0;flex:0 0 auto; }
        .ad5-character-label { flex:1;min-width:0;font-size:11px;color:#d1d8e0;cursor:pointer; }
        .ad5-character-count { font-size:10px;color:#8599ad;white-space:nowrap; }
        .ad5-character-expand { display:flex;align-items:center;justify-content:center;flex:0 0 27px;width:27px;height:23px;box-sizing:border-box;background:#22262b;border:1px solid #626b76;border-radius:5px;color:#fff;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1;cursor:pointer; }
        .ad5-character-expand:hover { background:#373d44;border-color:#f0f0f0; }
        .ad5-character-expand:focus-visible { outline:2px solid #dce5ef;outline-offset:1px; }
        .ad5-character-items { display:flex;flex-direction:column;gap:1px;padding:0 6px 5px 24px; }
        .ad5-character-item { display:flex;gap:8px;align-items:flex-start;padding:3px 0;cursor:pointer;color:#bcc7d2;font:10px/1.45 Consolas,monospace;overflow-wrap:anywhere; }
        .ad5-character-item input { margin-top:2px; }
        .ad5-character-notice { font-size:10px;line-height:1.5;color:#91a4b6; }
    `;
    document.head.appendChild(style);
}

app.registerExtension({
    name: "HKMC.AnimaPromptDirectorUI",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaPromptDirector") return;
        const previousCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            previousCreated?.apply(this, arguments);
            installAnimaStyles();
            const node = this;
            const get = name => node.widgets?.find(w => w.name === name);
            let normalPositiveUsed = "";
            let normalNegativeUsed = "";
            let llmPositiveUsed = "";
            let llmNegativeUsed = "";
            let refreshUsed = null;
            let currentTab = "考案";
            let mode = get("llm_provider")?.value === "None (Raw Tag)" ? "normal" : "llm";
            let lastProvider = mode === "llm" ? get("llm_provider")?.value : "Ollama (Local)";
            const existingModeState = node.properties?.animaDirectorModeState;
            let restoringModeState = false;
            const asText = value => String(value ?? "");
            const currentPositive = () => asText(get("final_positive_prompt")?.value);
            const currentNegative = () => asText(get("negative_prompt")?.value);
            const currentLock = () => get("lock_final_prompt")?.value === true;
            let modeState = {
                llm: {
                    positive: mode === "llm" ? currentPositive() : asText(existingModeState?.llm?.positive),
                    negative: mode === "llm" ? currentNegative() : asText(existingModeState?.llm?.negative ?? get("negative_prompt")?.value),
                    locked: mode === "llm" ? currentLock() : existingModeState?.llm?.locked === true
                },
                normal: {
                    positive: mode === "normal" ? currentPositive() : asText(existingModeState?.normal?.positive),
                    negative: mode === "normal" ? currentNegative() : asText(existingModeState?.normal?.negative ?? get("negative_prompt")?.value)
                }
            };
            if (mode === "normal" && typeof existingModeState?.lastProvider === "string" && existingModeState.lastProvider !== "None (Raw Tag)") lastProvider = existingModeState.lastProvider;
            const persistModeState = () => {
                node.properties ||= {};
                node.properties.animaDirectorModeState = {
                    version: 2,
                    activeMode: mode,
                    lastProvider,
                    llm: { ...modeState.llm },
                    normal: { ...modeState.normal }
                };
            };
            const snapshotMode = () => {
                if (mode === "llm") {
                    modeState.llm = { positive: currentPositive(), negative: currentNegative(), locked: currentLock() };
                } else {
                    modeState.normal = { positive: currentPositive(), negative: currentNegative() };
                }
                persistModeState();
            };
            const hydrateModeState = () => {
                const saved = node.properties?.animaDirectorModeState;
                const isSaved = saved && (saved.version === 1 || saved.version === 2);
                const savedMode = isSaved && saved.activeMode === "normal" ? "normal"
                    : isSaved && saved.activeMode === "llm" ? "llm" : null;
                const providerValue = asText(get("llm_provider")?.value);
                const currentMode = savedMode || (providerValue === "None (Raw Tag)" ? "normal" : "llm");
                if (isSaved) {
                    const fallbackLLM = providerValue !== "None (Raw Tag)";
                    modeState.llm = {
                        positive: asText(saved.llm?.positive ?? (fallbackLLM ? currentPositive() : "")),
                        negative: asText(saved.llm?.negative ?? (fallbackLLM ? currentNegative() : "")),
                        locked: typeof saved.llm?.locked === "boolean" ? saved.llm.locked : fallbackLLM && currentLock()
                    };
                    modeState.normal = {
                        positive: asText(saved.normal?.positive ?? (fallbackLLM ? "" : currentPositive())),
                        negative: asText(saved.normal?.negative ?? (fallbackLLM ? "" : currentNegative()))
                    };
                    if (typeof saved.lastProvider === "string" && saved.lastProvider !== "None (Raw Tag)" && saved.lastProvider) {
                        lastProvider = saved.lastProvider;
                    }
                } else {
                    if (currentMode === "llm") {
                        modeState.llm = { positive: currentPositive(), negative: currentNegative(), locked: currentLock() };
                    } else {
                        modeState.normal = { positive: currentPositive(), negative: currentNegative() };
                    }
                }
                mode = currentMode;
                if (mode === "llm" && providerValue !== "None (Raw Tag)" && providerValue) {
                    lastProvider = providerValue;
                }
                restoringModeState = true;
                try {
                    if (mode === "llm") {
                        set("llm_provider", lastProvider || "Ollama (Local)", false);
                        set("final_positive_prompt", modeState.llm.positive, false);
                        set("negative_prompt", modeState.llm.negative, false);
                        set("lock_final_prompt", modeState.llm.locked && !!modeState.llm.positive.trim(), false);
                    } else {
                        set("llm_provider", "None (Raw Tag)", false);
                        set("final_positive_prompt", modeState.normal.positive, false);
                        set("negative_prompt", modeState.normal.negative, false);
                        set("lock_final_prompt", false, false);
                    }
                } finally {
                    restoringModeState = false;
                }
                snapshotMode();
                if (mode === "llm" && currentLock() && currentPositive().trim()) {
                    status.textContent = "保存済みの生成プロンプトを復元しました。Queueでそのまま使用できます。";
                }
            };
            let generationPending = false;
            let generationRevision = 0;
            let generationSerial = 0;
            let activeTagPreset = "";
            let loadingTagPreset = "";
            let tagLoadError = "";
            let presetTags = [];
            let tagLoadSerial = 0;
            let tagLoadPromise = null;
            let tagScrollTop = 0;
            const expandedCategories = new Set();
            const generationSources = new Set([
                "character_preset", "shot_choice", "angle_choice", "quality_prompt", "scene_prompt",
                "llm_provider", "llm_api_key", "llm_model", "creative_mode", "convert_all_to_natural",
                "negative_preset", "negative_prompt", "full_back_view", "character_tag_selection"
            ]);
            const root = document.createElement("div"); root.className = "ad5";
            const modeBar = document.createElement("div"); modeBar.className = "ad5-mode";
            const tabBar = document.createElement("div"); tabBar.className = "ad5-tabs";
            const body = document.createElement("div"); body.className = "ad5-body";
            root.append(modeBar, tabBar, body);
            const make = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
            const set = (name, value, invalidate = true) => {
                const widget = get(name);
                if (!widget || widget.value === value) return;
                const old = widget.value;
                widget.value = value;
                if (widget.inputEl) widget.inputEl.value = value;
                node.onWidgetChanged?.(name, value, old, widget);
                widget.callback?.(value);
                if (!restoringModeState && ["final_positive_prompt", "negative_prompt", "lock_final_prompt"].includes(name)) snapshotMode();
                if (invalidate) {
                    const sourceChanged = mode === "llm" && (generationSources.has(name) ||
                        (name === "final_positive_prompt" && generationPending));
                    if (sourceChanged) {
                        generationRevision++;
                        if (get("lock_final_prompt")?.value) set("lock_final_prompt", false, false);
                        status.textContent = generationPending
                            ? "生成中に設定が変わりました。現在の結果は破棄されます。"
                            : "設定が変わりました。［プロンプト生成］を押し直してください。";
                    }
                    if (mode === "normal") { normalPositiveUsed = ""; normalNegativeUsed = ""; }
                    else { llmPositiveUsed = ""; llmNegativeUsed = ""; }
                    refreshUsed?.();
                }
                node.setDirtyCanvas?.(true, true);
            };
            for (const name of HIDDEN) {
                const w = get(name);
                if (!w) continue;
                w.type = "hidden"; w.computeSize = () => [0,-4]; w.draw = () => {};
                if (w.inputEl) w.inputEl.style.display = "none";
            }
            const status = make("div"); status.className = "ad5-status";
            set("enable_director", true, false);
            set("enable_negative", true, false);
            const addField = (title, control, hint) => {
                const wrapper = make("div"); wrapper.className = "ad5-field";
                wrapper.append(make("label", title), control);
                if (hint) { const text = make("div", hint); text.className = "ad5-hint"; wrapper.appendChild(text); }
                body.appendChild(wrapper);
                return control;
            };
            const textInput = (name, title, rows = 0, hint = "") => {
                const e = make(rows ? "textarea" : "input");
                if (rows) e.rows = rows;
                else e.type = name === "llm_api_key" ? "password" : "text";
                e.value = String(get(name)?.value ?? "");
                e.oninput = () => set(name,e.value);
                return addField(title,e,hint);
            };
            const choice = (name, title, options) => {
                const e = make("select");
                for (const [value,label] of options) { const o = make("option",label); o.value = value; e.appendChild(o); }
                e.value = String(get(name)?.value ?? options[0]?.[0] ?? "");
                e.onchange = () => { set(name,e.value); if (name === "llm_provider") { lastProvider = e.value; persistModeState(); } };
                return addField(title,e);
            };
            const selectionState = () => {
                try {
                    const parsed = JSON.parse(String(get("character_tag_selection")?.value || "{}"));
                    if (parsed && parsed.version === 1 && parsed.presets && typeof parsed.presets === "object" && !Array.isArray(parsed.presets)) return parsed;
                } catch (error) {}
                return { version: 1, presets: {} };
            };
            const disabledTags = preset => {
                const state = selectionState();
                const values = Object.prototype.hasOwnProperty.call(state.presets, preset) ? state.presets[preset] : [];
                return new Set(Array.isArray(values) ? values.filter(x => typeof x === "string") : []);
            };
            const saveDisabledTags = disabled => {
                const preset = String(get("character_preset")?.value ?? "None");
                if (preset === "None" || activeTagPreset !== preset || tagLoadError) return;
                const state = selectionState();
                const presets = { ...state.presets };
                const valid = new Set(presetTags.map(x => x.key));
                const keys = [...disabled].filter(key => valid.has(key));
                if (keys.length) presets[preset] = keys;
                else delete presets[preset];
                set("character_tag_selection", JSON.stringify({ version: 1, presets }));
                draw();
            };
            const loadCharacterTags = (force = false) => {
                const preset = String(get("character_preset")?.value ?? "None");
                if (preset === "None") {
                    tagLoadSerial++;
                    activeTagPreset = "None";
                    loadingTagPreset = "";
                    presetTags = [];
                    tagLoadError = "";
                    tagLoadPromise = null;
                    return Promise.resolve([]);
                }
                if (!force && activeTagPreset === preset && !tagLoadError) return Promise.resolve(presetTags);
                if (!force && loadingTagPreset === preset && tagLoadPromise) return tagLoadPromise;
                const serial = ++tagLoadSerial;
                activeTagPreset = "";
                loadingTagPreset = preset;
                tagLoadError = "";
                presetTags = [];
                draw();
                const task = (async () => {
                    try {
                        const response = await api.fetchApi(`/anima/director/character_tags?preset=${encodeURIComponent(preset)}`, { cache: "no-store" });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
                        if (result.preset !== preset || !Array.isArray(result.tags)) throw new Error("JSONプリセットの読み込み結果が不正です");
                        if (serial !== tagLoadSerial || get("character_preset")?.value !== preset) return [];
                        presetTags = result.tags.filter(tag => tag && typeof tag.key === "string" && typeof tag.text === "string" && typeof tag.category === "string");
                        activeTagPreset = preset;
                        tagLoadError = "";
                        return presetTags;
                    } catch (error) {
                        if (serial !== tagLoadSerial || get("character_preset")?.value !== preset) return [];
                        tagLoadError = String(error.message || error);
                        activeTagPreset = preset;
                        presetTags = [];
                        return [];
                    } finally {
                        if (serial === tagLoadSerial) {
                            loadingTagPreset = "";
                            tagLoadPromise = null;
                            draw();
                        }
                    }
                })();
                tagLoadPromise = task;
                return task;
            };
            const renderCharacterSelection = () => {
                const preset = String(get("character_preset")?.value ?? "None");
                const section = make("div"); section.className = "ad5-character";
                body.appendChild(section);
                const toolbar = make("div"); toolbar.className = "ad5-character-bar";
                const title = make("div", "キャラクター特徴の適用（JSON分類）"); title.className = "ad5-character-title";
                const tools = make("div"); tools.className = "ad5-character-tools";
                const makeTool = (label, callback) => { const button = make("button", label); button.type = "button"; button.onclick = callback; tools.appendChild(button); return button; };
                toolbar.append(title, tools);
                section.appendChild(toolbar);
                const notice = make("div"); notice.className = "ad5-character-notice";
                if (preset === "None") {
                    notice.textContent = "キャラクターJSONを選択すると、13分類と各タグのチェックが表示されます。";
                    section.appendChild(notice);
                    return section;
                }
                if (loadingTagPreset === preset || (activeTagPreset !== preset && !tagLoadError)) {
                    notice.textContent = "JSONの分類を読み込んでいます…";
                    section.appendChild(notice);
                    return section;
                }
                if (tagLoadError) {
                    notice.textContent = `JSONの読み込みに失敗しました：${tagLoadError}`;
                    makeTool("再読込", () => loadCharacterTags(true));
                    section.appendChild(notice);
                    return section;
                }
                const disabled = disabledTags(preset);
                const enabledCount = presetTags.filter(t => !disabled.has(t.key)).length;
                const summary = make("div", `適用 ${enabledCount} / ${presetTags.length} タグ。`);
                summary.className = "ad5-character-summary";
                section.appendChild(summary);
                const list = make("div"); list.className = "ad5-character-list";
                list.style.maxHeight = `${Math.max(245, Math.min(620, (node.size?.[1] || 710) - 415))}px`;
                const commit = nextDisabled => { tagScrollTop = list.scrollTop; saveDisabledTags(nextDisabled); };
                makeTool("全選択", () => commit(new Set()));
                makeTool("全解除", () => commit(new Set(presetTags.map(t => t.key))));
                makeTool("更新", () => { tagScrollTop = 0; loadCharacterTags(true); });
                for (const [category, label] of CHARACTER_CATEGORIES) {
                    const items = presetTags.filter(tag => tag.category === category);
                    const count = items.filter(tag => !disabled.has(tag.key)).length;
                    const group = make("div"); group.className = "ad5-character-group";
                    const header = make("div"); header.className = "ad5-character-head";
                    const checkbox = make("input"); checkbox.type = "checkbox";
                    checkbox.checked = items.length > 0 && count === items.length;
                    checkbox.indeterminate = count > 0 && count < items.length;
                    checkbox.disabled = !items.length;
                    checkbox.onchange = () => {
                        const next = new Set(disabled);
                        for (const item of items) {
                            if (checkbox.checked) next.delete(item.key);
                            else next.add(item.key);
                        }
                        commit(next);
                    };
                    const labelEl = make("label", label); labelEl.className = "ad5-character-label";
                    labelEl.onclick = () => { if (!checkbox.disabled) { checkbox.checked = !checkbox.checked; checkbox.onchange(); } };
                    const countEl = make("span", `${count}/${items.length}`); countEl.className = "ad5-character-count";
                    const expand = make("button", expandedCategories.has(category) ? "▲" : "▼");
                    expand.className = "ad5-character-expand";
                    expand.type = "button";
                    expand.title = expandedCategories.has(category) ? "個別タグを閉じる" : "個別タグを開く";
                    expand.setAttribute("aria-label", expand.title);
                    expand.setAttribute("aria-expanded", String(expandedCategories.has(category)));
                    expand.onclick = () => {
                        tagScrollTop = list.scrollTop;
                        if (expandedCategories.has(category)) expandedCategories.delete(category);
                        else expandedCategories.add(category);
                        draw();
                    };
                    header.append(checkbox, labelEl, countEl, expand);
                    group.appendChild(header);
                    if (expandedCategories.has(category)) {
                        const inner = make("div"); inner.className = "ad5-character-items";
                        if (!items.length) {
                            const empty = make("div", "この分類にタグはありません"); empty.className = "ad5-character-notice";
                            inner.appendChild(empty);
                        }
                        for (const item of items) {
                            const row = make("label"); row.className = "ad5-character-item";
                            const toggle = make("input"); toggle.type = "checkbox";
                            toggle.checked = !disabled.has(item.key);
                            toggle.onchange = () => {
                                const next = new Set(disabled);
                                if (toggle.checked) next.delete(item.key);
                                else next.add(item.key);
                                commit(next);
                            };
                            row.append(toggle, make("span", item.text));
                            inner.appendChild(row);
                        }
                        group.appendChild(inner);
                    }
                    list.appendChild(group);
                }
                section.appendChild(list);
                list.scrollTop = tagScrollTop;
                return null;
            };
            const readOnly = (title, getter, rows = 5) => {
                const e = make("textarea"); e.rows = rows; e.readOnly = true;
                const update = () => { e.value = getter() || ""; e.placeholder = "Queue実行後に、CLIPへ渡された展開済みプロンプトを表示します"; };
                update();
                addField(title,e,);
                return update;
            };
            const generate = async () => {
                if (generationPending || mode !== "llm") return;
                const preset = String(get("character_preset")?.value ?? "None");
                if (preset !== "None") {
                    await loadCharacterTags();
                    if (tagLoadError || activeTagPreset !== preset || get("character_preset")?.value !== preset) {
                        status.textContent = tagLoadError ? `JSONの読み込み失敗：${tagLoadError}` : "プリセットが変更されました。再度生成してください。";
                        draw();
                        return;
                    }
                }
                if (generationPending || mode !== "llm") return;
                generationPending = true;
                const serial = ++generationSerial;
                const revision = generationRevision;
                const requestId = `${node.id || "node"}-${Date.now()}-${serial}`;
                set("lock_final_prompt", false, false);
                status.textContent = "OllamaなどのLLMで英語プロンプトを生成しています…";
                const payload = {};
                for (const name of HIDDEN) if (get(name)) payload[name] = get(name).value;
                payload.enable_director = true;
                payload.enable_negative = true;
                payload.lock_final_prompt = false;
                payload.final_positive_prompt = "";
                payload.request_id = requestId;
                draw();
                try {
                    const response = await api.fetchApi("/anima/director/generate_prompt", {
                        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
                    if (data.request_id !== requestId) throw new Error("生成リクエストの識別番号が一致しません。");
                    if (generationRevision !== revision || mode !== "llm" || generationSerial !== serial) {
                        status.textContent = "生成中に設定が変更されたため、古い生成結果を破棄しました。再生成してください。";
                        return;
                    }
                    const positive = typeof data.positive === "string" ? data.positive.trim() : "";
                    if (!positive) throw new Error("生成されたポジティブプロンプトが空です。");
                    set("final_positive_prompt", positive, false);
                    set("lock_final_prompt", true, false);
                    llmPositiveUsed = "";
                    llmNegativeUsed = "";
                    status.textContent = "英語プロンプトの生成完了。Queueではこの確定済みプロンプトを使用します。";
                } catch (error) {
                    if (generationRevision !== revision || mode !== "llm") {
                        status.textContent = "設定変更により生成結果を破棄しました。再生成してください。";
                    } else {
                        status.textContent = `プロンプト生成失敗：${error.message}`;
                    }
                } finally {
                    generationPending = false;
                    draw();
                }
            };
            const draw = () => {
                refreshUsed = null;
                modeBar.replaceChildren(); tabBar.replaceChildren(); body.replaceChildren();
                body.classList.toggle("ad5-normal", mode === "normal");
                for (const [value,label] of [["llm","LLMモード"],["normal","通常モード"]]) {
                    const row = make("label"); if (mode === value) row.classList.add("selected");
                    const radio = make("input"); radio.type = "radio"; radio.name = `ad5-mode-${node.id}`; radio.checked = value === mode;
                    radio.onchange = () => {
                        if (!radio.checked || mode === value) return;
                        snapshotMode();
                        const destination = { ...modeState[value] };
                        mode = value;
                        generationRevision++;
                        set("llm_provider", mode === "normal" ? "None (Raw Tag)" : lastProvider, false);
                        set("final_positive_prompt", destination.positive, false);
                        set("negative_prompt", destination.negative, false);
                        set("lock_final_prompt", mode === "llm" && destination.locked, false);
                        snapshotMode();
                        if (mode === "llm") status.textContent = modeState.llm.locked && modeState.llm.positive.trim()
                            ? "前回の生成済みプロンプトを復元しました。Queueで使用できます。"
                            : "［プロンプト生成］を押して英語プロンプトを作成してください。";
                        draw();
                    };
                    row.append(radio,document.createTextNode(label)); modeBar.appendChild(row);
                }
                if (mode === "normal") {
                    body.appendChild(Object.assign(make("div","通常プロンプト"),{className:"ad5-heading"}));
                    textInput("final_positive_prompt","ポジティブプロンプト",6,"presetsフォルダのtxtファイルを__xxx__形式で指定すると展開されます");
                    const updatePos = readOnly("実際に使用したポジティブプロンプト",()=>normalPositiveUsed,5);
                    textInput("negative_prompt","ネガティブプロンプト",5,"presetsフォルダのtxtファイルを__xxx__形式で指定すると展開されます");
                    const updateNeg = readOnly("実際に使用したネガティブプロンプト",()=>normalNegativeUsed,5);
                    refreshUsed = () => { updatePos(); updateNeg(); };
                } else {
                    for (const name of TABS) {
                        const b = make("button",name); if (currentTab === name) b.classList.add("active");
                        b.onclick = () => { currentTab = name; draw(); };
                        tabBar.appendChild(b);
                    }
                    if (currentTab === "考案") {
                        const presets = get("character_preset")?.options?.values || ["None"];
                        const presetSelect = choice("character_preset","キャラクタープリセット（JSON）",presets.map(x=>[x,x]));
                        presetSelect.onchange = () => {
                            tagLoadSerial++;
                            loadingTagPreset = "";
                            activeTagPreset = "";
                            tagLoadError = "";
                            presetTags = [];
                            tagScrollTop = 0;
                            expandedCategories.clear();
                            set("character_preset", presetSelect.value);
                            loadCharacterTags();
                            draw();
                        };
                        choice("shot_choice","ショット",SHOTS.map(x=>[x,x]));
                        choice("angle_choice","アングル",ANGLES.map(x=>[x,x]));
                        textInput("scene_prompt","詳細な要望を日本語で記入",6);
                        renderCharacterSelection();
                    } else if (currentTab === "プロンプト") {
                        textInput("quality_prompt","品質・スタイル",3);
                        const negatives = get("negative_preset")?.options?.values || ["None"];
                        choice("negative_preset","ネガティブプリセット",negatives.map(x=>[x,x]));
                        textInput("negative_prompt","ネガティブプロンプト",3);
                        textInput("final_positive_prompt","生成ポジティブ（編集可能）",7);
                        const button = make("button", generationPending ? "プロンプト生成中…" : "プロンプト生成");
                        button.className = "ad5-button";
                        button.disabled = generationPending;
                        button.onclick = generate;
                        body.appendChild(button);
                        body.appendChild(status);
                        const updatePos = readOnly("実際に使用したポジティブプロンプト",()=>llmPositiveUsed,4);
                        const updateNeg = readOnly("実際に使用したネガティブプロンプト",()=>llmNegativeUsed,4);
                        refreshUsed = () => { updatePos(); updateNeg(); };
                    } else {
                        choice("llm_provider","LLMプロバイダー",[["Ollama (Local)","Ollama (Local)"],["Gemini (Cloud)","Gemini (Cloud)"],["ChatGPT (OpenAI)","OpenAI"]]);
                        textInput("llm_model","モデル名");
                        textInput("llm_api_key","APIキー（クラウド利用時のみ）");
                        choice("creative_mode","演出の自由度",[["オフ","忠実"],["控えめ (光・空気感)","控えめ"],["リッチ (小物・情景追加)","自由"]]);
                        const row = make("label"); row.className = "ad5-check";
                        const check = make("input"); check.type = "checkbox"; check.checked = !!get("convert_all_to_natural")?.value;
                        check.onchange = () => set("convert_all_to_natural",check.checked);
                        row.append(check,document.createTextNode("全体を自然言語に変換する")); body.appendChild(row);
                    }
                }
                if (mode === "llm" && get("character_preset")?.value !== "None" &&
                    activeTagPreset !== get("character_preset")?.value &&
                    loadingTagPreset !== get("character_preset")?.value) {
                    queueMicrotask(() => loadCharacterTags());
                }
                node.setDirtyCanvas?.(true,true);
            };
            const MIN_WIDTH = 460;
            const MIN_HEIGHT = 610;
            const widget = node.addDOMWidget("anima_director_panel", "custom", root, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => 380,
                getHeight: () => "100%",
                afterResize: () => {
                    root.style.height = "100%";
                    root.style.width = "100%";
                }
            });
            widget.serialize = false;
            root.style.width = "100%";
            root.style.height = "100%";
            const previousResize = node.onResize;
            node.onResize = function (size) {
                if (Array.isArray(size)) {
                    size[0] = Math.max(MIN_WIDTH, size[0]);
                    size[1] = Math.max(MIN_HEIGHT, size[1]);
                }
                previousResize?.apply(this, arguments);
                root.style.width = "100%";
                root.style.height = "100%";
                const categoryList = root.querySelector(".ad5-character-list");
                if (categoryList) categoryList.style.maxHeight = `${Math.max(245, Math.min(620, (this.size?.[1] || 710) - 415))}px`;
            };
            node.setSize?.([Math.max(node.size?.[0] || 0, MIN_WIDTH), Math.max(node.size?.[1] || 0, 710)]);
            node._animaDirectorSnapshot = snapshotMode;
            node._animaDirectorHydrate = hydrateModeState;
            node._animaDirectorDraw = () => {
                const configuredPreset = String(get("character_preset")?.value ?? "None");
                if (configuredPreset !== activeTagPreset && configuredPreset !== loadingTagPreset) {
                    tagLoadSerial++;
                    loadingTagPreset = "";
                    activeTagPreset = "";
                    tagLoadError = "";
                    presetTags = [];
                }
                if (!generationPending) {
                    const currentProvider = get("llm_provider")?.value;
                    mode = currentProvider === "None (Raw Tag)" ? "normal" : "llm";
                    if (mode === "llm") lastProvider = currentProvider;
                }
                draw();
            };
            node._animaDirectorExecuted = data => {
                if (!data) return;
                const positive = data.positive_used?.[0];
                const negative = data.negative_used?.[0];
                if (typeof positive !== "string" || typeof negative !== "string") return;
                if (mode === "normal") { normalPositiveUsed=positive;normalNegativeUsed=negative; }
                else { llmPositiveUsed=positive;llmNegativeUsed=negative; }
                refreshUsed?.();
            };
            draw();
        };
        const oldSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (serialized) {
            this._animaDirectorSnapshot?.();
            const result = oldSerialize?.apply(this, arguments);
            if (serialized && this.properties?.animaDirectorModeState) {
                serialized.properties ||= {};
                serialized.properties.animaDirectorModeState = JSON.parse(JSON.stringify(this.properties.animaDirectorModeState));
            }
            return result;
        };
        const oldConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = oldConfigure?.apply(this,arguments);
            queueMicrotask(() => { this._animaDirectorHydrate?.(); this._animaDirectorDraw?.(); });
            return result;
        };
        const oldExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            oldExecuted?.apply(this,arguments);
            this._animaDirectorExecuted?.(message);
        };
    }
});
