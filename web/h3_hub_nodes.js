import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "MiniMax.H3HubNodes",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "H3SeedHub") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                const node = this;

                if (node.outputs && node.outputs.length > 2) {
                    node.outputs.length = 2;
                }

                const updateOutputs = () => {
                    if (!node.outputs) return;
                    let lastConnectedIndex = -1;
                    for (let i = 0; i < node.outputs.length; i++) {
                        if (node.outputs[i].links && node.outputs[i].links.length > 0) {
                            lastConnectedIndex = i;
                        }
                    }
                    const targetCount = Math.min(64, Math.max(2, lastConnectedIndex + 2));
                    while (node.outputs.length < targetCount) {
                        node.addOutput(`seed_${node.outputs.length + 1}`, "INT");
                    }
                    while (node.outputs.length > targetCount) {
                        node.removeOutput(node.outputs.length - 1);
                    }
                    node.setSize(node.computeSize());
                };

                const onConnectionsChange = node.onConnectionsChange;
                node.onConnectionsChange = function (type, index, isConnected, link_info) {
                    if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                    if (type === 2) updateOutputs();
                };

                const onConfigure = node.onConfigure;
                node.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    updateOutputs();
                };
                updateOutputs();
            };
        }
    }
});