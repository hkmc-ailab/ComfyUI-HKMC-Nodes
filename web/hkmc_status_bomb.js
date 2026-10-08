import { app } from "../../scripts/app.js";

// 全グラフ（メイン＋サブグラフ全部）を収集
function collectAllGraphs() {
    const root = app.graph;
    const graphs = new Set();
    if (!root) return Array.from(graphs);
    graphs.add(root);

    const explore = (g) => {
        if (!g) return;
        if (g._nodes) {
            g._nodes.forEach(n => {
                const inner = n.subgraph || n.inner_graph;
                if (inner && !graphs.has(inner)) {
                    graphs.add(inner);
                    explore(inner);
                }
            });
        }
        if (g.subgraphs) {
            Object.values(g.subgraphs).forEach(sg => {
                if (sg && !graphs.has(sg)) {
                    graphs.add(sg);
                    explore(sg);
                }
            });
        }
    };
    explore(root);

    return Array.from(graphs);
}

function findLinkGlobally(linkId, allGraphs) {
    if (linkId == null) return null;
    for (const g of allGraphs) {
        if (g.links) {
            if (Array.isArray(g.links) && g.links[linkId]) return g.links[linkId];
            if (g.links instanceof Map && g.links.has(linkId)) return g.links.get(linkId);
            if (typeof g.links === "object" && g.links[linkId]) return g.links[linkId];
        }
    }
    return null;
}

function findNodeGlobally(nodeId, allGraphs) {
    if (nodeId == null) return null;
    for (const g of allGraphs) {
        if (g.getNodeById) {
            const n = g.getNodeById(nodeId);
            if (n) return n;
        }
        if (g._nodes) {
            const n = g._nodes.find(item => item && item.id === nodeId);
            if (n) return n;
        }
    }
    return null;
}

// Node 5 などのグループノードからツマミ値を確実に取得
function extractValuesFromNode5(node) {
    if (!node || !node.widgets) return null;

    let isEnabled = null;
    let countVal = null;

    node.widgets.forEach(w => {
        const name = (w.name || "").toLowerCase();
        const label = (w.label || "").toLowerCase();

        if (isEnabled === null) {
            if (label.includes("長尺生成") || name === "enabled_9") {
                isEnabled = !!w.value;
            }
        }
        if (countVal === null) {
            if (label.includes("クリップ数") || name === "value_2") {
                const parsed = parseInt(w.value);
                if (!isNaN(parsed)) countVal = parsed;
            }
        }
    });

    if (isEnabled !== null || countVal !== null) {
        return {
            enabled: isEnabled !== null ? isEnabled : false,
            value: countVal !== null ? countVal : 1
        };
    }
    return null;
}

// 親スイッチのシグナルを解決
function getMasterSignal(allGraphs) {
    const rootNodes = app.graph?._nodes || [];
    for (const n of rootNodes) {
        if (n && n.widgets) {
            const res = extractValuesFromNode5(n);
            if (res) {
                return res.enabled ? res.value : 0;
            }
        }
    }

    for (const g of allGraphs) {
        if (!g._nodes) continue;
        for (const n of g._nodes) {
            if (
                n &&
                (n.type === "HKMCMasterBombSwitch" ||
                 n.comfyClass === "HKMCMasterBombSwitch" ||
                 (n.title && n.title.includes("Master Switch")))
            ) {
                const wEnabled = n.widgets?.find(w => w.name === "enabled");
                const wVal = n.widgets?.find(w => w.name === "value");
                const isEnabled = wEnabled ? !!wEnabled.value : false;
                const countVal = wVal ? (parseInt(wVal.value) || 1) : 1;
                return isEnabled ? countVal : 0;
            }
        }
    }

    return null;
}

// メイン爆破処理
function triggerBombExecution() {
    try {
        const rootGraph = app.graph;
        if (!rootGraph) return;

        const allGraphs = collectAllGraphs();
        const childNodes = [];

        allGraphs.forEach(g => {
            if (!g._nodes) return;
            g._nodes.forEach(n => {
                if (n && (n.type === "HKMCChildBombGate" || n.comfyClass === "HKMCChildBombGate" || (n.title && n.title.includes("Child Bomb")))) {
                    childNodes.push(n);
                }
            });
        });

        if (childNodes.length === 0) return;

        const signal = getMasterSignal(allGraphs);
        if (signal === null) return;

        let anyModeChanged = false;

        childNodes.forEach(child => {
            const clipIndexWidget = child.widgets?.find(w => w.name === "clip_index");
            const actionWidget = child.widgets?.find(w => w.name === "action");
            const invertWidget = child.widgets?.find(w => w.name === "invert");

            const clipIndex = clipIndexWidget ? (parseInt(clipIndexWidget.value) || 1) : 1;
            const actionStr = actionWidget ? actionWidget.value : "mute";
            const isInvert = invertWidget ? !!invertWidget.value : false;

            let shouldBomb = false;
            if (signal === 0) {
                shouldBomb = false;
            } else {
                shouldBomb = (clipIndex <= signal);
            }

            if (isInvert) {
                shouldBomb = !shouldBomb;
            }

            const targetMode = shouldBomb ? (actionStr === "mute" ? 2 : 4) : 0;

            child.inputs?.forEach(input => {
                if (input.name && input.name.startsWith("target_") && input.link != null) {
                    const targetLink = findLinkGlobally(input.link, allGraphs);
                    if (targetLink) {
                        const targetNode = findNodeGlobally(targetLink.origin_id, allGraphs);
                        if (targetNode && targetNode.mode !== targetMode) {
                            targetNode.mode = targetMode;
                            anyModeChanged = true;
                            if (targetNode.graph && targetNode.graph.setDirtyCanvas) {
                                targetNode.graph.setDirtyCanvas(true, true);
                            }
                        }
                    }
                }
            });
        });

        if (anyModeChanged && app.canvas) {
            app.canvas.setDirty(true, true);
        }
    } catch (error) {
        // 例外を完全に握り潰し、監視ループのフリーズを防ぐ
    }
}

// 幽霊出力ピン（target_out）が残っていたら強制削除して検証エラーを防止
function cleanupGhostOutputs(node) {
    try {
        if (node.outputs && node.outputs.length > 0) {
            for (let i = node.outputs.length - 1; i >= 0; i--) {
                node.removeOutput(i);
            }
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        }
    } catch (e) {}
}

// 子ノード（入力 target_XX の増減）
function manageChildTargetInputs(node) {
    try {
        if (!node.inputs) return;

        let lastConnectedSlot = 0;
        node.inputs.forEach((input) => {
            if (input.name && input.name.startsWith("target_")) {
                const slotNum = parseInt(input.name.slice(7), 10);
                if (input.link != null && !isNaN(slotNum) && slotNum > lastConnectedSlot) {
                    lastConnectedSlot = slotNum;
                }
            }
        });

        const targetCount = lastConnectedSlot + 1;

        for (let i = 1; i <= targetCount; i++) {
            const slotName = `target_${String(i).padStart(2, "0")}`;
            if (!node.inputs.some(inp => inp.name === slotName)) {
                node.addInput(slotName, "*");
            }
        }

        for (let i = node.inputs.length - 1; i >= 0; i--) {
            const input = node.inputs[i];
            if (input.name && input.name.startsWith("target_")) {
                const slotNum = parseInt(input.name.slice(7), 10);
                if (!isNaN(slotNum) && slotNum > targetCount && input.link == null) {
                    node.removeInput(i);
                }
            }
        }

        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    } catch (e) {}
}

// 親ノード（出力 signal_out_XX の増減）
function manageMasterOutputSlots(node) {
    try {
        if (!node.outputs) return;

        let lastConnectedOut = 0;
        node.outputs.forEach((out, idx) => {
            if (out.links && out.links.length > 0) {
                lastConnectedOut = idx + 1;
            }
        });

        const targetOutCount = Math.max(1, lastConnectedOut + 1);

        while (node.outputs.length < targetOutCount) {
            const nextIdx = node.outputs.length + 1;
            node.addOutput(`signal_out_${nextIdx}`, "HKMC_BOMB_SIG");
        }

        while (node.outputs.length > targetOutCount) {
            const lastOut = node.outputs[node.outputs.length - 1];
            if (!lastOut.links || lastOut.links.length === 0) {
                node.removeOutput(node.outputs.length - 1);
            } else {
                break;
            }
        }

        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    } catch (e) {}
}

function setupNodeHooks(node) {
    if (!node) return;
    const isMaster = node.type === "HKMCMasterBombSwitch" || node.comfyClass === "HKMCMasterBombSwitch";
    const isChild = node.type === "HKMCChildBombGate" || node.comfyClass === "HKMCChildBombGate";

    if (isMaster && !node._bomb_hooked) {
        node._bomb_hooked = true;
        const origOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function (type, index, isConnected) {
            let res;
            try { if (origOnConnectionsChange) res = origOnConnectionsChange.apply(this, arguments); } catch (e) {}
            if (type === 2) manageMasterOutputSlots(this);
            setTimeout(triggerBombExecution, 30);
            return res;
        };
        manageMasterOutputSlots(node);
    }

    if (isChild && !node._bomb_hooked) {
        node._bomb_hooked = true;
        cleanupGhostOutputs(node); // 検証エラーの元となる幽霊出力を消去
        const origOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function (type, index, isConnected) {
            let res;
            try { if (origOnConnectionsChange) res = origOnConnectionsChange.apply(this, arguments); } catch (e) {}
            if (type === 1) manageChildTargetInputs(this);
            setTimeout(triggerBombExecution, 30);
            return res;
        };
        manageChildTargetInputs(node);
    }

    // 全ノードのウィジェット操作監視 (エラーで止まらないようにtry-catch強化)
    if (node.widgets) {
        node.widgets.forEach(w => {
            if (!w._bomb_cb_hooked) {
                w._bomb_cb_hooked = true;
                const orig = w.callback;
                w.callback = function () {
                    let res;
                    try {
                        if (orig) res = orig.apply(this, arguments);
                    } catch (e) {}
                    setTimeout(triggerBombExecution, 30);
                    return res;
                };
            }
        });
    }
}

app.registerExtension({
    name: "HKMC.StatusBomb",

    nodeCreated(node) {
        setupNodeHooks(node);
    },

    loadedGraphNode(node) {
        setupNodeHooks(node);
    },

    async afterConfigureGraph() {
        const allGraphs = collectAllGraphs();
        allGraphs.forEach(g => {
            if (!g._nodes) return;
            g._nodes.forEach(setupNodeHooks);
        });
        setTimeout(triggerBombExecution, 250);
        
        // 0.3秒間隔でグラフを監視し、リアルタイムに変更を反映する絶対停止しない安全装置
        if (!window._hkmc_bomb_interval) {
            window._hkmc_bomb_interval = setInterval(triggerBombExecution, 300);
        }
    },

    async beforeQueuePrompt() {
        triggerBombExecution();
    }
});