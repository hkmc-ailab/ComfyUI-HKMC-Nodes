import { app } from "../../scripts/app.js";

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

                let state = {
                    full: {},
                    upper: {},
                    face: {},
                    face_expressions: {}
                };
                angles.forEach(a => {
                    state.full[a.id] = false;
                    state.upper[a.id] = false;
                    state.face[a.id] = false;
                });
                expressions.forEach(e => {
                    state.face_expressions[e.id] = false;
                });

                const idxWidget = this.widgets.find(w => w.name === "current_index");
                if (idxWidget) {
                    idxWidget.type = "hidden";
                    idxWidget.computeSize = () => [0, -4];
                    idxWidget.draw = () => {};
                }

                const selWidget = this.widgets.find(w => w.name === "selection_json");
                if (selWidget) {
                    selWidget.type = "hidden";
                    selWidget.computeSize = () => [0, -4];
                    selWidget.draw = () => {};
                    try {
                        const saved = JSON.parse(selWidget.value);
                        if (saved.full && Object.keys(saved.full).length > 0) {
                            state = { ...state, ...saved };
                            if (!state.face_expressions) {
                                state.face_expressions = {};
                                expressions.forEach(e => state.face_expressions[e.id] = false);
                            }
                        }
                    } catch (e) {}
                }

                const syncToWidget = () => {
                    if (selWidget) {
                        selWidget.value = JSON.stringify(state);
                        if (selWidget.callback) selWidget.callback(selWidget.value);
                    }
                    updateBadge();
                };

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
                    max-height: 185px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    box-sizing: border-box;
                `;

                const tabBar = document.createElement("div");
                tabBar.style.cssText = "display: flex; gap: 4px; border-bottom: 1px solid #282828; padding-bottom: 6px; width: 100%; box-sizing: border-box; flex-shrink: 0;";
                
                const tabs = [
                    { id: "all", label: "全て (42)" },
                    { id: "full", label: "全身 (14)" },
                    { id: "upper", label: "上半身 (14)" },
                    { id: "face", label: "顔 (14)" }
                ];
                let currentTab = "all";

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
                        if (currentTab === "face") {
                            exprContainer.style.display = "flex";
                        } else {
                            exprContainer.style.display = "none";
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
                    if (currentTab === "all") {
                        ["full", "upper", "face"].forEach(k => angles.forEach(a => state[k][a.id] = true));
                    } else {
                        angles.forEach(a => state[currentTab][a.id] = true);
                    }
                    syncToWidget();
                    renderButtons();
                };

                const btnClearAll = document.createElement("button");
                btnClearAll.textContent = "全解除";
                btnClearAll.type = "button";
                btnClearAll.style.cssText = "background: #222; color: #d66; border: 1px solid #6b3a3a; border-radius: 4px; font-size: 9px; font-weight: bold; padding: 2px 6px; cursor: pointer;";
                btnClearAll.onclick = (e) => {
                    e.preventDefault();
                    if (currentTab === "all") {
                        ["full", "upper", "face"].forEach(k => angles.forEach(a => state[k][a.id] = false));
                    } else {
                        angles.forEach(a => state[currentTab][a.id] = false);
                    }
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
                    grid.innerHTML = "";
                    angles.forEach(a => {
                        let isChecked = false;
                        if (currentTab === "all") {
                            isChecked = state.full[a.id] && state.upper[a.id] && state.face[a.id];
                        } else {
                            isChecked = state[currentTab][a.id];
                        }

                        const abtn = document.createElement("button");
                        abtn.type = "button";
                        abtn.textContent = a.label;
                        abtn.style.cssText = `border: 1px solid ${isChecked ? '#5bb3f5' : '#333'}; background: ${isChecked ? '#007acc' : '#1e1e22'}; color: ${isChecked ? '#fff' : '#888'}; padding: 6px 0; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer; transition: all 0.1s; width: 100%; box-sizing: border-box;`;
                        
                        abtn.onclick = (e) => {
                            e.preventDefault();
                            const next = !isChecked;
                            if (currentTab === "all") {
                                ["full", "upper", "face"].forEach(k => state[k][a.id] = next);
                            } else {
                                state[currentTab][a.id] = next;
                            }
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

                container.append(tabBar, ctrlBar, grid, exprContainer);

                const customUiWidget = this.addDOMWidget("dataset_stacker_ui", "custom", container, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => 185
                });
                customUiWidget.computeSize = (width) => [width || 480, 185];

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

                syncToWidget();
                renderButtons();
                this.setSize([480, 500]);
            };
        }
    }
});