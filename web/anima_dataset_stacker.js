import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const tagCategories = [
    ["identity", "基本属性"], ["face", "顔・瞳"], ["hair", "髪"],
    ["body", "身体・耳・尻尾"], ["upper", "上半身衣装"], ["waist", "腰・ベルト"],
    ["lower", "下半身衣装"], ["legs", "脚・靴"], ["hands", "手・手袋"],
    ["accessories", "装飾・装備"], ["other", "その他"],
];

function makeElement(type, text) {
    const element = document.createElement(type);
    if (text !== undefined) element.textContent = text;
    if (type === "button") element.type = "button";
    return element;
}

function renderTagOptions(panel, tags, disabled, commit) {
    panel.replaceChildren();
    if (!tags.length) {
        panel.textContent = "選択できるプリセットタグがありません。";
        return;
    }

    const toolbar = makeElement("div");
    toolbar.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:6px;";
    const all = makeElement("button", "全選択");
    const clear = makeElement("button", "全解除");
    all.style.cssText = "background:#1d2229;color:#8bb4dc;border:1px solid #3a506b;border-radius:5px;font-size:10px;font-weight:600;padding:4px 7px;cursor:pointer;";
    clear.style.cssText = "background:#261d20;color:#e07878;border:1px solid #6b3a3a;border-radius:5px;font-size:10px;font-weight:600;padding:4px 7px;cursor:pointer;";
    const total = makeElement("span");
    total.style.marginLeft = "auto";
    toolbar.append(all, clear, total);
    panel.append(toolbar);

    const groups = [];
    for (const [category, label] of tagCategories) {
        const items = tags.filter(tag => tag.category === category);
        if (!items.length) continue;
        const group = makeElement("div");
        group.style.cssText = "margin-bottom:4px; border:1px solid #333; border-radius:4px; padding:4px;";
        const header = makeElement("div");
        header.style.cssText = "display:flex; align-items:center; gap:6px;";
        const groupLabel = makeElement("label");
        groupLabel.style.cssText = "display:flex; align-items:center; gap:4px; flex:1;";
        const checkbox = makeElement("input");
        checkbox.type = "checkbox";
        groupLabel.append(checkbox, makeElement("span", label));
        const count = makeElement("span");
        const expand = makeElement("button", "▼");
        expand.style.cssText = "display:flex;align-items:center;justify-content:center;flex:0 0 27px;width:27px;height:23px;box-sizing:border-box;background:#22262b;border:1px solid #626b76;border-radius:5px;color:#fff;font-family:Arial,sans-serif;font-size:10px;font-weight:700;line-height:1;cursor:pointer;";
        expand.onmouseenter = () => { expand.style.background = "#373d44"; expand.style.borderColor = "#f0f0f0"; };
        expand.onmouseleave = () => { expand.style.background = "#22262b"; expand.style.borderColor = "#626b76"; };
        expand.setAttribute("aria-label", label + "の個別タグ");
        expand.setAttribute("aria-expanded", "false");
        header.append(groupLabel, count, expand);
        group.append(header);

        const list = makeElement("div");
        list.hidden = true;
        const toggles = items.map(item => {
            const row = makeElement("label");
            row.style.cssText = "display:flex; align-items:baseline; gap:4px; margin:2px 0 0 12px; overflow-wrap:anywhere;";
            const toggle = makeElement("input");
            toggle.type = "checkbox";
            toggle.onchange = () => change([item], toggle.checked);
            row.append(toggle, makeElement("span", item.text));
            list.append(row);
            return toggle;
        });
        expand.onclick = () => {
            list.hidden = !list.hidden;
            expand.textContent = list.hidden ? "▼" : "▲";
            expand.setAttribute("aria-expanded", String(!list.hidden));
        };
        checkbox.onchange = () => change(items, checkbox.checked);
        group.append(list);
        panel.append(group);
        groups.push({ items, toggles, checkbox, count });
    }

    const refresh = () => {
        let enabled = 0;
        for (const { items, toggles, checkbox, count } of groups) {
            let selected = 0;
            items.forEach((item, i) => {
                const checked = !disabled.has(item.key);
                toggles[i].checked = checked;
                if (checked) selected++;
            });
            checkbox.checked = selected === items.length;
            checkbox.indeterminate = selected > 0 && selected < items.length;
            count.textContent = `${selected}/${items.length}`;
            enabled += selected;
        }
        total.textContent = `有効なタグ ${enabled} / ${tags.length}`;
    };
    const change = (items, checked) => {
        for (const item of items) {
            if (checked) disabled.delete(item.key);
            else disabled.add(item.key);
        }
        commit(tags.filter(tag => disabled.has(tag.key)).map(tag => tag.key));
        refresh();
    };
    all.onclick = () => change(tags, true);
    clear.onclick = () => change(tags, false);
    refresh();
}

if (!window._anima_stacker_hooked) {
    window._anima_stacker_hooked = true;
    let autoIndexCounter = 0;
    let lastQueueTime = 0;

    const origGraphToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function () {
        const res = await origGraphToPrompt.apply(this, arguments);
        const p = res.output;

        const now = Date.now();
        if (now - lastQueueTime > 3000) {
            autoIndexCounter = 0;
        }
        lastQueueTime = now;

        for (const [id, node] of Object.entries(p)) {
            if (node.class_type === "AnimaDatasetStacker") {
                node.inputs["current_index"] = autoIndexCounter;

                const gNode = app.graph.getNodeById(Number(id));
                if (gNode) {
                    const w = gNode.widgets?.find(w => w.name === "current_index");
                    if (w) w.value = autoIndexCounter;
                }
            }
        }

        autoIndexCounter++;
        return res;
    };
}

app.registerExtension({
    name: "HKMC.AnimaDatasetStackerUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AnimaDatasetStacker") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const angles = [
                    { id: "front", label: "正面" },
                    { id: "front_left", label: "左斜前" },
                    { id: "left", label: "左向き" },
                    { id: "back_left", label: "左斜後" },
                    { id: "back", label: "後ろ" },
                    { id: "back_right", label: "右斜後" },
                    { id: "right", label: "右向き" },
                    { id: "front_right", label: "右斜前" },
                    { id: "top", label: "上から" },
                    { id: "bottom", label: "下から" },
                    { id: "front_low", label: "前斜下" },
                    { id: "back_low", label: "後斜下" },
                    { id: "front_high", label: "前斜上" },
                    { id: "back_high", label: "後斜上" }
                ];

                const expressions = [
                    { id: "neutral", label: "無表情" },
                    { id: "smile", label: "微笑み" },
                    { id: "laugh", label: "笑い" },
                    { id: "cry", label: "泣く" },
                    { id: "angry", label: "怒る" },
                    { id: "blush", label: "赤面" },
                    { id: "surprised", label: "驚く" }
                ];

                const shotTabs = ["full", "upper", "face"];
                const presetWidget = this.widgets.find(w => w.name === "character_preset");
                const selWidget = this.widgets.find(w => w.name === "selection_json");
                const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
                const readSelection = () => {
                    let saved;
                    try {
                        saved = JSON.parse(selWidget?.value);
                    } catch {
                        saved = null;
                    }
                    const selection = {};
                    for (const key of [...shotTabs, "face_expressions"]) {
                        const items = key === "face_expressions" ? expressions : angles;
                        selection[key] = Object.fromEntries(items.map(({ id }) => [id, !!saved?.[key]?.[id]]));
                    }
                    selection.disabled_tags = isRecord(saved?.disabled_tags) ? saved.disabled_tags : {};
                    return selection;
                };
                let state = readSelection();

                const idxWidget = this.widgets.find(w => w.name === "current_index");
                if (idxWidget) {
                    idxWidget.type = "hidden";
                    idxWidget.computeSize = () => [0, -4];
                    idxWidget.draw = () => {};
                }

                if (selWidget) {
                    selWidget.type = "hidden";
                    selWidget.computeSize = () => [0, -4];
                    selWidget.draw = () => {};
                }

                const syncToWidget = () => {
                    if (selWidget) {
                        selWidget.value = JSON.stringify(state);
                        if (selWidget.callback) selWidget.callback(selWidget.value);
                    }
                    updateBadge();
                    this.setDirtyCanvas?.(true, false);
                };

                const negativeWidget = this.widgets?.find(w => w.name === "negative_prompt");
                const negativeOriginalCompute = negativeWidget?.computeSize?.bind(negativeWidget);
                let freedNegativeHeight = 35;
                if (negativeWidget && negativeOriginalCompute) {
                    const originalSize = negativeOriginalCompute(480);
                    const originalHeight = Array.isArray(originalSize) ? originalSize[1] : 105;
                    if (Number.isFinite(originalHeight) && originalHeight > 0) {
                        const reducedHeight = Math.max(55, Math.round(originalHeight * 2 / 3));
                        freedNegativeHeight = Math.max(0, originalHeight - reducedHeight);
                        negativeWidget.computeSize = width => {
                            const size = negativeOriginalCompute(width);
                            return [size[0], Math.max(55, Math.round(size[1] * 2 / 3))];
                        };
                    }
                }
                const panelHeight = 185 + freedNegativeHeight;
                const container = document.createElement("div");
                container.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    background: #141416;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 8px 10px;
                    margin: 4px 0 2px 0;
                    font-family: sans-serif;
                    width: 100%;
                    max-height: ${panelHeight}px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    box-sizing: border-box;
                `;

                const tabBar = document.createElement("div");
                tabBar.style.cssText = "display: flex; gap: 4px; border-bottom: 1px solid #282828; padding-bottom: 6px; width: 100%; box-sizing: border-box; flex-shrink: 0;";
                
                const tabs = [
                    { id: "full", label: "全身 (14)" },
                    { id: "upper", label: "上半身 (14)" },
                    { id: "face", label: "顔 (14)" },
                    { id: "tags", label: "タグ指定" }
                ];
                let currentTab = "full";

                const tabBtns = {};
                tabs.forEach(t => {
                    const btn = document.createElement("button");
                    btn.textContent = t.label;
                    btn.type = "button";
                    btn.style.cssText = `flex: 1; background: ${t.id === currentTab ? '#007acc' : '#222'}; color: ${t.id === currentTab ? '#fff' : '#aaa'}; border: 1px solid #444; border-radius: 4px; padding: 4px 0; font-size: 10px; font-weight: bold; cursor: pointer;`;
                    btn.onclick = (e) => {
                        e.preventDefault();
                        currentTab = t.id;
                        Object.entries(tabBtns).forEach(([k, b]) => {
                            b.style.background = (k === currentTab) ? "#007acc" : "#222";
                            b.style.color = (k === currentTab) ? "#fff" : "#aaa";
                        });
                        if (currentTab === "tags") {
                            loadTags();
                            return;
                        }
                        renderButtons();
                    };
                    tabBtns[t.id] = btn;
                    tabBar.appendChild(btn);
                });

                const ctrlBar = document.createElement("div");
                ctrlBar.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 2px 0; width: 100%; box-sizing: border-box; flex-shrink: 0;";

                const btnGroup = document.createElement("div");
                btnGroup.style.cssText = "display: flex; gap: 4px;";

                const btnSelectAll = document.createElement("button");
                btnSelectAll.textContent = "全選択";
                btnSelectAll.type = "button";
                btnSelectAll.style.cssText = "background: #222; color: #8bb4dc; border: 1px solid #3a506b; border-radius: 4px; font-size: 9px; font-weight: bold; padding: 2px 6px; cursor: pointer;";
                btnSelectAll.onclick = (e) => {
                    e.preventDefault();
                    angles.forEach(a => state[currentTab][a.id] = true);
                    syncToWidget();
                    renderButtons();
                };

                const btnClearAll = document.createElement("button");
                btnClearAll.textContent = "全解除";
                btnClearAll.type = "button";
                btnClearAll.style.cssText = "background: #222; color: #d66; border: 1px solid #6b3a3a; border-radius: 4px; font-size: 9px; font-weight: bold; padding: 2px 6px; cursor: pointer;";
                btnClearAll.onclick = (e) => {
                    e.preventDefault();
                    angles.forEach(a => state[currentTab][a.id] = false);
                    syncToWidget();
                    renderButtons();
                };

                btnGroup.append(btnSelectAll, btnClearAll);

                const countBadge = document.createElement("span");
                countBadge.style.cssText = "font-size: 10px; color: #c0d1e3; font-weight: bold;";

                const updateBadge = () => {
                    let fullCount = Object.values(state.full).filter(Boolean).length;
                    let upperCount = Object.values(state.upper).filter(Boolean).length;
                    
                    let faceAngleCount = Object.values(state.face).filter(Boolean).length;
                    let exprCount = Object.values(state.face_expressions).filter(Boolean).length;
                    
                    let faceTotal = 0;
                    if (faceAngleCount > 0) {
                        let backAngleSelected = ["back_left", "back", "back_right", "back_low", "back_high"].filter(id => state.face[id]).length;
                        let frontAngleSelected = faceAngleCount - backAngleSelected;
                        
                        if (exprCount > 0) {
                            faceTotal = (frontAngleSelected * exprCount) + backAngleSelected;
                        } else {
                            faceTotal = faceAngleCount;
                        }
                    }

                    let total = fullCount + upperCount + faceTotal;
                    countBadge.textContent = `選択中: ${total} 枚 (Batch count: ${total})`;
                };

                ctrlBar.append(btnGroup, countBadge);

                const grid = document.createElement("div");
                grid.style.cssText = "display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; box-sizing: border-box; flex-shrink: 0;";

                const exprContainer = document.createElement("div");
                exprContainer.style.cssText = `
                    display: none;
                    flex-direction: column;
                    gap: 4px;
                    border-top: 1px dashed #333;
                    padding-top: 6px;
                    margin-top: 2px;
                    width: 100%;
                    box-sizing: border-box;
                    flex-shrink: 0;
                `;

                const exprHeader = document.createElement("div");
                exprHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; width: 100%;";
                
                const exprTitle = document.createElement("span");
                exprTitle.textContent = "表情指定 (アングル × 選択表情)";
                exprTitle.style.cssText = "font-size: 10px; color: #8bb4dc; font-weight: bold;";

                const exprBtnGroup = document.createElement("div");
                exprBtnGroup.style.cssText = "display: flex; gap: 4px;";

                const btnExprAll = document.createElement("button");
                btnExprAll.textContent = "全表情";
                btnExprAll.type = "button";
                btnExprAll.style.cssText = "background: #222; color: #8bb4dc; border: 1px solid #3a506b; border-radius: 4px; font-size: 8px; font-weight: bold; padding: 1px 5px; cursor: pointer;";
                btnExprAll.onclick = (e) => {
                    e.preventDefault();
                    expressions.forEach(exp => state.face_expressions[exp.id] = true);
                    syncToWidget();
                    renderButtons();
                };

                const btnExprClear = document.createElement("button");
                btnExprClear.textContent = "解除";
                btnExprClear.type = "button";
                btnExprClear.style.cssText = "background: #222; color: #d66; border: 1px solid #6b3a3a; border-radius: 4px; font-size: 8px; font-weight: bold; padding: 1px 5px; cursor: pointer;";
                btnExprClear.onclick = (e) => {
                    e.preventDefault();
                    expressions.forEach(exp => state.face_expressions[exp.id] = false);
                    syncToWidget();
                    renderButtons();
                };

                exprBtnGroup.append(btnExprAll, btnExprClear);
                exprHeader.append(exprTitle, exprBtnGroup);

                const exprGrid = document.createElement("div");
                exprGrid.style.cssText = "display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; box-sizing: border-box;";

                exprContainer.append(exprHeader, exprGrid);

                const renderButtons = () => {
                    const showTags = currentTab === "tags";
                    ctrlBar.style.display = showTags ? "none" : "flex";
                    grid.style.display = showTags ? "none" : "grid";
                    exprContainer.style.display = currentTab === "face" ? "flex" : "none";
                    tagPanel.hidden = !showTags;
                    if (showTags) return;

                    grid.innerHTML = "";
                    angles.forEach(a => {
                        const isChecked = state[currentTab][a.id];

                        const abtn = document.createElement("button");
                        abtn.type = "button";
                        abtn.textContent = a.label;
                        abtn.style.cssText = `border: 1px solid ${isChecked ? '#5bb3f5' : '#333'}; background: ${isChecked ? '#007acc' : '#1e1e22'}; color: ${isChecked ? '#fff' : '#888'}; padding: 6px 0; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer; transition: all 0.1s; width: 100%; box-sizing: border-box;`;
                        
                        abtn.onclick = (e) => {
                            e.preventDefault();
                            state[currentTab][a.id] = !isChecked;
                            syncToWidget();
                            renderButtons();
                        };
                        grid.appendChild(abtn);
                    });

                    exprGrid.innerHTML = "";
                    expressions.forEach(exp => {
                        const isChecked = !!state.face_expressions[exp.id];
                        const ebtn = document.createElement("button");
                        ebtn.type = "button";
                        ebtn.textContent = exp.label;
                        ebtn.style.cssText = `border: 1px solid ${isChecked ? '#e68a00' : '#333'}; background: ${isChecked ? '#b36b00' : '#1e1e22'}; color: ${isChecked ? '#fff' : '#888'}; padding: 5px 0; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer; transition: all 0.1s; width: 100%; box-sizing: border-box;`;
                        
                        ebtn.onclick = (e) => {
                            e.preventDefault();
                            state.face_expressions[exp.id] = !isChecked;
                            syncToWidget();
                            renderButtons();
                        };
                        exprGrid.appendChild(ebtn);
                    });
                };

                const tagPanel = makeElement("div");
                tagPanel.style.cssText = "color:#c0d1e3; font-size:11px; min-height:0; overflow-y:auto;";
                let tagRequest = 0;
                const loadTags = async () => {
                    const request = ++tagRequest;
                    const preset = String(presetWidget?.value ?? "None");
                    renderButtons();
                    tagPanel.scrollTop = 0;
                    if (preset === "None") {
                        tagPanel.textContent = "キャラクタープリセットを選択してください。";
                        return;
                    }
                    tagPanel.textContent = "プリセットのタグを読み込み中…";
                    const isCurrent = () => request === tagRequest && presetWidget?.value === preset;
                    try {
                        const url = `/anima/stacker/character_tags?preset=${encodeURIComponent(preset)}`;
                        const response = await api.fetchApi(url, { cache: "no-store" });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
                        if (data.preset !== preset || !Array.isArray(data.tags)) {
                            throw new Error("プリセットの読み込み結果が不正です");
                        }
                        if (!isCurrent()) return;
                        const saved = Object.hasOwn(state.disabled_tags, preset) ? state.disabled_tags[preset] : [];
                        const disabled = new Set(Array.isArray(saved) ? saved : []);
                        renderTagOptions(tagPanel, data.tags, disabled, keys => {
                            if (!isCurrent()) return;
                            if (keys.length) state.disabled_tags = { ...state.disabled_tags, [preset]: keys };
                            else delete state.disabled_tags[preset];
                            syncToWidget();
                        });
                    } catch (error) {
                        if (!isCurrent()) return;
                        const retry = makeElement("button", "再読み込み");
                        retry.onclick = () => loadTags();
                        tagPanel.replaceChildren(makeElement("div", `読み込み失敗：${error.message}`), retry);
                    }
                };
                if (presetWidget) {
                    const onPresetChanged = presetWidget.callback;
                    presetWidget.callback = function () {
                        const result = onPresetChanged?.apply(this, arguments);
                        if (currentTab === "tags") loadTags();
                        return result;
                    };
                }
                const onConfigure = this.onConfigure;
                this.onConfigure = function () {
                    const result = onConfigure?.apply(this, arguments);
                    state = readSelection();
                    updateBadge();
                    if (currentTab === "tags") loadTags();
                    else renderButtons();
                    return result;
                };

                container.append(tabBar, ctrlBar, grid, exprContainer, tagPanel);

                const customUiWidget = this.addDOMWidget("dataset_stacker_ui", "custom", container, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => panelHeight
                });
                customUiWidget.computeSize = (width) => [width || 480, panelHeight];

                const spacerDiv = document.createElement("div");
                spacerDiv.style.cssText = "height: 24px; width: 100%; pointer-events: none;";
                const spacerWidget = this.addDOMWidget("bottom_spacer", "custom", spacerDiv, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => 24
                });
                spacerWidget.computeSize = () => [480, 24];

                const origOnResize = this.onResize;
                this.onResize = function (size) {
                    if (origOnResize) origOnResize.apply(this, arguments);
                    if (container) {
                        container.style.width = "100%";
                    }
                };

                updateBadge();
                renderButtons();
                this.setSize([480, 500]);
            };
        }
    }
});
