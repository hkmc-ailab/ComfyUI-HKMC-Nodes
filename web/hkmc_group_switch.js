import { app } from "../../scripts/app.js";

function getSettingLongVideoValue() {
    const rootGraph = app.canvas?.graph || app.graph;
    if (!rootGraph || !rootGraph._nodes) return false;

    for (const node of rootGraph._nodes) {
        if (node.widgets) {
            const w = node.widgets.find(widget => 
                widget.name === "enabled_10" || 
                (widget.label && widget.label.includes("長尺動画生成"))
            );
            if (w) {
                return !!w.value;
            }
        }
    }
    return false;
}

function cleanTitle(str) {
    if (!str) return "";
    return String(str).replace(/[◆■\s ]/g, "").trim();
}

function applyGroupSwitches() {
    const rootGraph = app.canvas?.graph || app.graph;
    if (!rootGraph) return;

    const isLongVideoEnabled = getSettingLongVideoValue();

    const allGraphs = new Set();
    allGraphs.add(rootGraph);
    if (rootGraph._nodes) {
        rootGraph._nodes.forEach(n => {
            const inner = n.subgraph || n.inner_graph;
            if (inner) allGraphs.add(inner);
        });
    }
    if (rootGraph.subgraphs) {
        Object.values(rootGraph.subgraphs).forEach(sg => allGraphs.add(sg));
    }

    const switchNodes = [];
    allGraphs.forEach(g => {
        if (g._nodes) {
            const found = g._nodes.filter(n =>
                n.type === "HKMCGroupSwitch" || n.title === "HKMC Group Switch" ||
                (n.widgets && n.widgets.some(w => w.name === "title_pattern"))
            );
            switchNodes.push(...found);
        }
    });

    if (switchNodes.length === 0) return;

    switchNodes.forEach(sNode => {
        const patternWidget = sNode.widgets?.find(w => w.name === "title_pattern");
        const triggerWidget = sNode.widgets?.find(w => w.name === "trigger_on");
        const actionWidget = sNode.widgets?.find(w => w.name === "action");

        if (!patternWidget) return;
        const targetCleanPattern = cleanTitle(patternWidget.value);
        if (!targetCleanPattern) return;

        const hasInputLink = sNode.inputs && sNode.inputs[0] && sNode.inputs[0].link != null;
        const baseBool = hasInputLink ? isLongVideoEnabled : !!sNode.widgets?.find(w => w.name === "enabled")?.value;

        const triggerStr = triggerWidget ? String(triggerWidget.value) : "true";
        const isTrueActive = triggerStr.includes("true");
        const isActive = isTrueActive ? baseBool : !baseBool;

        const actionStr = actionWidget ? actionWidget.value : "mute";
        const targetMode = isActive ? 0 : (actionStr === "mute" ? 2 : 4);

        let matchCount = 0;
        allGraphs.forEach(g => {
            if (!g._groups) return;
            g._groups.forEach(grp => {
                const groupCleanTitle = cleanTitle(grp.title);
                if (groupCleanTitle && (groupCleanTitle.includes(targetCleanPattern) || targetCleanPattern.includes(groupCleanTitle))) {
                    matchCount++;
                    grp.recomputeInsideNodes();
                    if (grp._nodes) {
                        grp._nodes.forEach(n => {
                            setModeRecursive(n, targetMode);
                        });
                    }
                }
            });
        });

        console.log(`[HKMC Group Switch] "${patternWidget.value}" -> isActive: ${isActive}, mode: ${targetMode}, 一致グループ: ${matchCount}`);
    });

    rootGraph.setDirtyCanvas(true, true);
    if (app.canvas) app.canvas.setDirty(true, true);
}

function setModeRecursive(node, targetMode, visited = new Set()) {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    node.mode = targetMode;

    const innerNodes = node.subgraph?._nodes || node.inner_graph?._nodes;
    if (innerNodes && Array.isArray(innerNodes)) {
        innerNodes.forEach(child => setModeRecursive(child, targetMode, visited));
    }
}

app.registerExtension({
    name: "HKMC.GroupSwitch",

    nodeCreated(node) {
        if (node.widgets) {
            node.widgets.forEach(w => {
                const orig = w.callback;
                w.callback = function() {
                    if (orig) orig.apply(this, arguments);
                    setTimeout(applyGroupSwitches, 10);
                };
            });
        }
        setTimeout(applyGroupSwitches, 150);
    },

    setup() {
        window.addEventListener("pointerup", () => {
            setTimeout(applyGroupSwitches, 20);
        });
    },

    async afterConfigureGraph() {
        setTimeout(applyGroupSwitches, 200);
    },

    async beforeQueuePrompt() {
        applyGroupSwitches();
    }
});