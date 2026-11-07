import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "HKMC/Image Label";
const SUBFOLDER = "hkmc_image_labels";
const MIN_WIDTH = 48;
const MAX_WIDTH = 6000;
const DEFAULT_MAX_DIMENSION = 440;
const VALID_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function redraw(node) {
    if (node?.setDirtyCanvas) node.setDirtyCanvas(true, true);
    else app.graph?.setDirtyCanvas?.(true, true);
}

function markChanged(node) {
    redraw(node);
    node.graph?.change?.();
}

function getGraphPoint(canvas, event) {
    if (canvas && typeof canvas.convertEventToCanvasOffset === "function") {
        const point = canvas.convertEventToCanvasOffset(event);
        if (Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)) {
            return point;
        }
    }
    const scale = canvas?.ds?.scale || 1;
    const rect = canvas?.canvas?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const offset = canvas?.ds?.offset || [0, 0];
    return [(event.clientX - rect.left) / scale - offset[0],
            (event.clientY - rect.top) / scale - offset[1]];
}

class HKMCImageLabel extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "HKMC Image Label";
        this.size = [260, 190];
        this.resizable = false;
        this.isVirtualNode = true;
        this.serialize_widgets = false;
        this.color = "transparent";
        this.bgcolor = "transparent";
        this.flags = this.flags || {};
        this.properties = {
            ...(this.properties || {}),
            image: null,
            opacity: 1,
        };
        this._imageElement = null;
        this._loadToken = 0;
        this._hoverCorner = null;
        this._resizeSession = null;
        this._status = "empty";
    }

    onConfigure() {
        this.resizable = false;
        this.isVirtualNode = true;
        this.color = "transparent";
        this.bgcolor = "transparent";
        if (!this.properties) this.properties = {};
        this.properties.opacity = clamp(this.properties.opacity ?? 1, 0, 1);
        this.loadStoredImage(false);
    }

    onPropertyChanged(name, value) {
        if (name === "opacity") {
            this.properties.opacity = clamp(value, 0, 1);
            markChanged(this);
        } else if (name === "image") {
            this.loadStoredImage(false);
        }
        return true;
    }

    imageURL(record) {
        const query = new URLSearchParams({
            filename: record.name,
            type: record.type || "input",
            subfolder: record.subfolder || "",
        });
        return api.apiURL(`/view?${query.toString()}`);
    }

    loadStoredImage(fitNewImage = false, preserveWidth = false) {
        const token = ++this._loadToken;
        const record = this.properties?.image;
        this._imageElement = null;
        if (!record || typeof record.name !== "string" || !record.name) {
            this._status = "empty";
            redraw(this);
            return;
        }
        this._status = "loading";
        const img = new Image();
        img.onload = () => {
            if (token !== this._loadToken) return;
            this._imageElement = img;
            this._status = "ready";
            if (fitNewImage && img.naturalWidth > 0 && img.naturalHeight > 0) {
                const scale = Math.min(1, DEFAULT_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
                const width = Math.max(MIN_WIDTH, Math.round(img.naturalWidth * scale));
                this.size = [width, width * img.naturalHeight / img.naturalWidth];
                markChanged(this);
            } else if (preserveWidth && img.naturalWidth > 0 && img.naturalHeight > 0) {
                this.size[1] = this.size[0] * img.naturalHeight / img.naturalWidth;
                markChanged(this);
            } else {
                redraw(this);
            }
        };
        img.onerror = () => {
            if (token !== this._loadToken) return;
            this._status = "error";
            redraw(this);
        };
        img.src = this.imageURL(record);
    }

    chooseImage() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
        input.style.display = "none";
        document.body.appendChild(input);
        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) return;
            if (!VALID_EXTENSIONS.test(file.name)) {
                window.alert("PNG / JPG / WebP の画像を選択してください。");
                return;
            }
            await this.uploadImage(file);
        }, { once: true });
        input.click();
    }

    async uploadImage(file) {
        const hadImage = Boolean(this.properties?.image);
        const form = new FormData();
        form.append("image", file, file.name);
        form.append("type", "input");
        form.append("subfolder", SUBFOLDER);
        form.append("overwrite", "false");
        this._status = "uploading";
        redraw(this);
        try {
            const response = await api.fetchApi("/upload/image", { method: "POST", body: form });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
            }
            const result = await response.json();
            if (!result?.name) throw new Error("アップロード先のファイル名を取得できませんでした。");
            this.properties.image = {
                name: result.name,
                subfolder: result.subfolder ?? SUBFOLDER,
                type: result.type ?? "input",
            };
            this.loadStoredImage(!hadImage, hadImage);
            markChanged(this);
        } catch (error) {
            console.error("[HKMC Image Label] Upload failed:", error);
            this._status = hadImage ? "ready" : "empty";
            window.alert(`画像を読み込めませんでした。\n${error.message || error}`);
            redraw(this);
        }
    }

    clearImage() {
        this.properties.image = null;
        ++this._loadToken;
        this._imageElement = null;
        this._status = "empty";
        markChanged(this);
    }

    resetImageSize() {
        const img = this._imageElement;
        if (!img?.naturalWidth || !img?.naturalHeight) return;
        const scale = Math.min(1, DEFAULT_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(MIN_WIDTH, Math.round(img.naturalWidth * scale));
        this.size = [width, width * img.naturalHeight / img.naturalWidth];
        markChanged(this);
    }

    drawImageOnly(ctx, canvas) {
        const w = this.size[0];
        const h = this.size[1];
        ctx.save();
        if (this._imageElement) {
            ctx.globalAlpha *= clamp(this.properties.opacity ?? 1, 0, 1);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(this._imageElement, 0, 0, w, h);
        } else {
            ctx.fillStyle = "rgba(15, 20, 27, 0.74)";
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(147, 177, 205, 0.8)";
            ctx.lineWidth = 1.5 / (canvas?.ds?.scale || 1);
            ctx.setLineDash([7, 5]);
            ctx.strokeRect(0, 0, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = "#e1e8f0";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 15px sans-serif";
            const title = this._status === "loading" || this._status === "uploading"
                ? "画像を読み込み中..."
                : this._status === "error"
                    ? "画像が見つかりません"
                    : "HKMC Image Label";
            ctx.fillText(title, w / 2, h / 2 - 12);
            ctx.font = "12px sans-serif";
            ctx.fillText("ダブルクリックで画像を選択", w / 2, h / 2 + 13);
        }

        if (this._imageElement && (this._hoverCorner || this.is_selected || this._resizeSession)) {
            const scale = canvas?.ds?.scale || 1;
            const length = Math.min(14 / scale, w / 5, h / 5);
            const lineWidth = 2 / scale;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "rgba(0,0,0,0.8)";
            ctx.lineWidth = lineWidth + 2 / scale;
            this.drawCorners(ctx, w, h, length);
            ctx.strokeStyle = "#f0f8ff";
            ctx.lineWidth = lineWidth;
            this.drawCorners(ctx, w, h, length);
        }
        ctx.restore();
    }

    drawCorners(ctx, w, h, length) {
        ctx.beginPath();
        ctx.moveTo(0, length); ctx.lineTo(0, 0); ctx.lineTo(length, 0);
        ctx.moveTo(w - length, 0); ctx.lineTo(w, 0); ctx.lineTo(w, length);
        ctx.moveTo(0, h - length); ctx.lineTo(0, h); ctx.lineTo(length, h);
        ctx.moveTo(w - length, h); ctx.lineTo(w, h); ctx.lineTo(w, h - length);
        ctx.stroke();
    }

    cornerAt(localPos, canvas) {
        if (!this._imageElement || !localPos) return null;
        const scale = canvas?.ds?.scale || 1;
        const threshold = Math.min(18 / scale, this.size[0] * 0.24, this.size[1] * 0.24);
        const x = localPos[0], y = localPos[1];
        const left = Math.abs(x) <= threshold;
        const right = Math.abs(x - this.size[0]) <= threshold;
        const top = Math.abs(y) <= threshold;
        const bottom = Math.abs(y - this.size[1]) <= threshold;
        if (left && top) return "tl";
        if (right && top) return "tr";
        if (left && bottom) return "bl";
        if (right && bottom) return "br";
        return null;
    }

    onMouseMove(event, localPos, canvas) {
        if (this._resizeSession) return true;
        const corner = this.cornerAt(localPos, canvas);
        if (corner !== this._hoverCorner) {
            this._hoverCorner = corner;
            redraw(this);
        }
        if (canvas?.canvas) {
            canvas.canvas.style.cursor = corner
                ? ((corner === "tl" || corner === "br") ? "nwse-resize" : "nesw-resize")
                : "move";
        }
        return false;
    }

    onMouseLeave(event, localPos, canvas) {
        if (canvas?.canvas) canvas.canvas.style.cursor = "";
        if (this._hoverCorner) {
            this._hoverCorner = null;
            redraw(this);
        }
    }

    onMouseDown(event, localPos, canvas) {
        if (event.button !== 0 || this.flags?.pinned) return false;
        const corner = this.cornerAt(localPos, canvas);
        if (!corner) return false;
        this.startCornerResize(corner, event, canvas);
        if (canvas) {
            canvas.node_dragged = null;
            canvas.resizing_node = null;
            canvas.dragging_canvas = false;
        }
        return true;
    }

    startCornerResize(corner, startEvent, canvas) {
        this.finishCornerResize();
        const startPos = [this.pos[0], this.pos[1]];
        const startSize = [this.size[0], this.size[1]];
        const startPointer = getGraphPoint(canvas, startEvent);
        const ratio = startSize[0] / Math.max(startSize[1], 1);
        const fromLeft = corner === "tl" || corner === "bl";
        const fromTop = corner === "tl" || corner === "tr";
        const session = {
            startPos, startSize, startPointer, ratio, fromLeft, fromTop,
            canvas, move: null, up: null, cancel: null,
        };
        session.move = (event) => {
            if (this._resizeSession !== session) return;
            if (event.buttons === 0) {
                this.finishCornerResize();
                return;
            }
            const pointer = getGraphPoint(canvas, event);
            const dx = pointer[0] - startPointer[0];
            const dy = pointer[1] - startPointer[1];
            const desiredW = startSize[0] + (fromLeft ? -dx : dx);
            const desiredH = startSize[1] + (fromTop ? -dy : dy);
            const width = Math.abs(dx) / Math.max(startSize[0], 1) >= Math.abs(dy) / Math.max(startSize[1], 1)
                ? desiredW : desiredH * ratio;
            const newW = clamp(width, MIN_WIDTH, MAX_WIDTH);
            const newH = newW / ratio;
            const anchorX = fromLeft ? startPos[0] + startSize[0] : startPos[0];
            const anchorY = fromTop ? startPos[1] + startSize[1] : startPos[1];
            this.size[0] = newW;
            this.size[1] = newH;
            this.pos[0] = fromLeft ? anchorX - newW : anchorX;
            this.pos[1] = fromTop ? anchorY - newH : anchorY;
            redraw(this);
            if (event.cancelable) event.preventDefault();
            event.stopImmediatePropagation?.();
        };
        session.up = () => this.finishCornerResize();
        session.cancel = (event) => {
            if (event.key === "Escape") {
                this.pos = [...startPos];
                this.size = [...startSize];
                this.finishCornerResize();
            }
        };
        this._resizeSession = session;
        window.addEventListener("pointermove", session.move, true);
        window.addEventListener("mousemove", session.move, true);
        window.addEventListener("pointerup", session.up, true);
        window.addEventListener("mouseup", session.up, true);
        window.addEventListener("blur", session.up, true);
        window.addEventListener("keydown", session.cancel, true);
        redraw(this);
    }

    finishCornerResize() {
        const session = this._resizeSession;
        if (!session) return;
        this._resizeSession = null;
        window.removeEventListener("pointermove", session.move, true);
        window.removeEventListener("mousemove", session.move, true);
        window.removeEventListener("pointerup", session.up, true);
        window.removeEventListener("mouseup", session.up, true);
        window.removeEventListener("blur", session.up, true);
        window.removeEventListener("keydown", session.cancel, true);
        markChanged(this);
    }

    onDblClick() {
        this.chooseImage();
        return true;
    }

    getExtraMenuOptions(canvas, options) {
        options.unshift(
            {
                content: "🖼️ 画像を選択・変更...",
                callback: () => this.chooseImage(),
            },
            {
                content: "↔ 画像サイズを初期値に戻す",
                disabled: !this._imageElement,
                callback: () => this.resetImageSize(),
            },
            {
                content: `◐ 透明度を変更... (${Math.round(clamp(this.properties.opacity ?? 1, 0, 1) * 100)}%)`,
                callback: () => {
                    const current = Math.round(clamp(this.properties.opacity ?? 1, 0, 1) * 100);
                    const input = window.prompt("不透明度を 0〜100 (%) で指定してください", String(current));
                    if (input === null) return;
                    const value = Number(input);
                    if (!Number.isFinite(value) || value < 0 || value > 100) {
                        window.alert("0〜100の数値を入力してください。");
                        return;
                    }
                    this.properties.opacity = value / 100;
                    markChanged(this);
                },
            },
            {
                content: "⬇ 背面へ移動",
                callback: () => {
                    const nodes = this.graph?._nodes;
                    if (!Array.isArray(nodes)) return;
                    const index = nodes.indexOf(this);
                    if (index > 0) {
                        nodes.splice(index, 1);
                        nodes.unshift(this);
                        markChanged(this);
                    }
                },
            },
            {
                content: "✕ 画像を外す",
                disabled: !this.properties.image,
                callback: () => this.clearImage(),
            },
            null,
        );
    }

    onRemoved() {
        this.finishCornerResize();
        ++this._loadToken;
        this._imageElement = null;
    }
}

HKMCImageLabel.title = "HKMC Image Label";
HKMCImageLabel.title_mode = LiteGraph.NO_TITLE;
HKMCImageLabel.collapsable = false;
HKMCImageLabel.category = "HKMC";

app.registerExtension({
    name: "HKMC.ImageLabel",
    registerCustomNodes() {
        if (LiteGraph.registered_node_types?.[NODE_TYPE]) return;
        LiteGraph.registerNodeType(NODE_TYPE, HKMCImageLabel);
        const originalDrawNode = LGraphCanvas.prototype.drawNode;
        LGraphCanvas.prototype.drawNode = function (node, ctx) {
            if (node instanceof HKMCImageLabel) {
                node.drawImageOnly(ctx, this);
                return;
            }
            return originalDrawNode.apply(this, arguments);
        };
    },
});
