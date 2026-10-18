import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function installStudioStyles() {
    if (document.getElementById("h3-studio-mv-styles")) return;
    const style = document.createElement("style");
    style.id = "h3-studio-mv-styles";
    style.textContent = `
        .h3-studio-container { display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; background: #000000; color: #dbe0e6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; border-radius: 8px; overflow: hidden; position: relative; }
        .h3-tab-bar { display: flex; background: #000000; border-bottom: 1px solid #282828; padding: 6px 8px 0 8px; gap: 6px; flex-shrink: 0; overflow-x: hidden; }
        .h3-tab-btn { background: #141416; border: 1px solid #24262b; border-bottom: none; color: #666a73; padding: 6px 14px; font-size: 11px; font-weight: 600; border-radius: 6px 6px 0 0; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .h3-tab-btn:hover { color: #ffffff; background: #22252a; border-color: #383c44; }
        .h3-tab-btn.active { color: #ffffff; background: #2c2f36; border-color: #4a4f5a; }
        .h3-top-toggle-bar { display: flex; gap: 6px; background: transparent; padding: 2px 0 6px 0; margin-bottom: 4px; }
        .h3-toggle-chip { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: #202020; border: 1px solid #383838; border-radius: 8px; padding: 6px 0; cursor: pointer; font-size: 11px; font-weight: 600; color: #dbe0e6; user-select: none; }
        .h3-toggle-chip:hover { border-color: #555555; }
        .h3-toggle-chip.active { background: #007acc; border-color: #5bb3f5; color: #ffffff; }
        .h3-toggle-chip input[type="checkbox"] { cursor: pointer; margin: 0; pointer-events: none; }
        .h3-tab-content { padding: 10px; display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; background: #000000; }
        .h3-char-card { background: transparent; border: 1px solid #555860; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
        .h3-char-title { font-size: 12px; font-weight: bold; color: #ffffff; padding-left: 2px; }
        .h3-field-row { display: flex; flex-direction: column; gap: 4px; }
        .h3-field-row label { font-size: 10px; color: #9aa0a6; font-weight: bold; }
        .h3-pic-check-row { display: flex; flex-direction: column; gap: 4px; }
        .h3-pic-check-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; }
        .h3-pic-check-item { display: flex; align-items: center; justify-content: center; background: #202020; border: 1px solid #383838; border-radius: 6px; padding: 6px 0; cursor: pointer; font-size: 11px; font-weight: 600; color: #9aa0a6; user-select: none; }
        .h3-pic-check-item:hover { border-color: #555555; color: #ffffff; }
        .h3-pic-check-item.checked { background: #007acc; border-color: #5bb3f5; color: #ffffff; font-weight: bold; }
        .h3-btn-gen-prompt { background: #007acc; border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 13px; font-weight: bold; padding: 10px 16px; border-radius: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4); }
        .h3-btn-gen-prompt:hover { background: #0088e6; }
        .h3-btn-gen-prompt:disabled { background: #2b2b2b; color: #6e7681; cursor: not-allowed; }
        
        .h3-cast-sing-block { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .h3-cast-sing-row { display: flex; align-items: center; gap: 10px; background: #151518; padding: 5px 8px; border-radius: 6px; border: 1px solid #282828; }
        .h3-cast-toggle-chip { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: #202020; border: 1px solid #383838; border-radius: 6px; padding: 4px 0; cursor: pointer; font-size: 10px; font-weight: 600; color: #8b949e; user-select: none; }
        .h3-cast-toggle-chip.active { background: #007acc; border-color: #5bb3f5; color: #ffffff; font-weight: bold; }
        .h3-sing-check-label { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: bold; color: #dbe0e6; cursor: pointer; user-select: none; }
        .h3-sing-check-label input { cursor: pointer; margin: 0; }
        
        .h3-guide-banner { background: #0c1824; border: 1px solid #1d456b; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 11px; }
        .h3-guide-title { font-weight: bold; color: #5bb3f5; display: flex; align-items: center; gap: 6px; }
        .h3-guide-list { margin: 0; padding-left: 18px; color: #c0d1e3; line-height: 1.6; }
        .h3-guide-list b { color: #ffcc00; }
        .h3-guide-current { font-size: 10px; color: #8bb4dc; border-top: 1px dashed #20476e; padding-top: 4px; margin-top: 2px; }

        .h3-fixed-media-area { display: flex; flex-direction: column; background: #000000; border-top: 1px solid #282828; flex-shrink: 0; box-sizing: border-box; position: relative; }
        .h3-media-resizer-bar { display: flex; justify-content: space-between; align-items: center; padding: 1px 10px; background: #141416; border-bottom: 1px solid #24262b; cursor: row-resize; user-select: none; height: 18px; box-sizing: border-box; }
        .h3-media-resizer-bar:hover { background: #1c1d21; }
        .h3-media-header-title { font-size: 10px; font-weight: bold; color: #dbe0e6; letter-spacing: 0.5px; pointer-events: none; }
        .h3-media-drag-handle { font-size: 14px; font-weight: bold; color: #666a73; letter-spacing: 2px; pointer-events: none; line-height: 1; }
        .h3-media-toggle-btn { font-size: 10px; font-weight: bold; color: #ffffff; cursor: pointer; padding: 0 4px; line-height: 1; }
        .h3-media-body { display: flex; flex-direction: column; gap: 10px; padding: 10px; box-sizing: border-box; background: #000000; overflow-y: auto; overflow-x: hidden; max-height: 480px; min-height: 100px; }
        .h3-media-body.collapsed { display: none; }
        .h3-lane-block { display: flex; flex-direction: column; gap: 4px; width: 100%; background: transparent; border: 1px solid #555860; border-radius: 8px; padding: 8px 10px 10px 10px; box-sizing: border-box; }
        .h3-section-title { font-size: 11px; font-weight: bold; color: #ffffff; padding-left: 2px; }
        .h3-section-sub { font-size: 9px; font-weight: normal; color: #8b949e; margin-left: 4px; }
        .h3-lane { display: flex; gap: 6px; padding: 2px 0 0 0; background: transparent; border: none; overflow-x: auto; width: 100%; min-height: 80px; align-items: center; box-sizing: border-box; }
        
        .h3-slot { position: relative; flex: 0 0 68px; width: 68px; height: 76px; border-radius: 8px; background: #202020; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; box-sizing: border-box; }
        .h3-slot.image-slot, .h3-slot.keyframe-slot { border: 1px dashed #3a75a4; }
        .h3-slot.image-slot.occupied, .h3-slot.keyframe-slot.occupied { border: 1px solid #5bb3f5; background-size: cover; background-position: center; }
        .h3-slot.video-slot { border: 1px dashed #6a4c82; }
        .h3-slot.video-slot.occupied { border: 1px solid #b887d8; background-size: cover; background-position: center; }
        .h3-slot.audio-slot { border: 1px dashed #3b7560; }
        .h3-slot.audio-slot.occupied { border: 1px solid #7ecf9d; background: #202020; justify-content: flex-start; padding-top: 6px; }
        .h3-slot-add { font-size: 20px; font-weight: bold; pointer-events: none; line-height: 1; }
        .h3-audio-icon { font-size: 18px; margin-bottom: 2px; pointer-events: none; }
        .h3-audio-name { font-size: 8px; color: #dbe0e6; padding: 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center; pointer-events: none; }
        .h3-slot-del-btn { position: absolute; top: 2px; right: 2px; background: rgba(180, 40, 40, 0.85); color: #fff; width: 14px; height: 14px; border-radius: 50%; border: none; font-size: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; }
        .h3-slot-del-btn:hover { background: #d32f2f; }
        
        .h3-slot-badge { position: absolute; top: 2px; left: 2px; background: rgba(0,0,0,0.7); font-size: 8px; padding: 1px 3px; border-radius: 3px; z-index: 1; pointer-events: none; color: #dbe0e6; }
        
        .h3-clip-results-container { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; overflow-y: auto; padding-right: 4px; }
        .h3-clip-results-container::-webkit-scrollbar { width: 6px; }
        .h3-clip-results-container::-webkit-scrollbar-thumb { background: #383838; border-radius: 3px; }
        .h3-clip-result-title { font-size: 11px; font-weight: bold; color: #ffffff; margin-top: 4px; flex-shrink: 0; }
        .h3-clip-result-textarea { width: 100%; min-height: 120px; background: #181818; border: 1px solid #383838; border-radius: 8px; color: #dbe0e6; font-family: Consolas, "Courier New", monospace; font-size: 11px; line-height: 1.45; padding: 8px; box-sizing: border-box; resize: vertical; outline: none; flex-shrink: 0; }
        .h3-clip-result-textarea:focus { border-color: #6e7681; }
    `;
    document.head.appendChild(style);
}

const OVERLAP_SEC = 1.625;

const TEMPLATE_GLOBAL_SUMMARY = 
`【世界観・舞台】：ネオン輝く雨のサイバーパンク都市の裏路地
【シチュエーション】：孤独を抱えた主人公が覚悟を胸に夜明けへ向かって歩き出す
【曲調・テンポ】：重厚なビートと疾走感のあるダークエレクトロ
【映像・カメラ方針】：ダイナミックな回り込み、映画的な陰影と被写体の強い眼差し`;

const TEMPLATE_GLOBAL_RETENTION = 
`【画風・トーン】：Cinematic photorealistic, 8k resolution, dramatic volumetric lighting
【品質・破綻防止】：変形・腕や指の歪み防止、同一キャラクターの顔・衣装・髪型の一貫性を完全維持
【映像トーン】：極端なアニメ調崩れを排除、一貫したカラーグレーディング`;

app.registerExtension({
    name: "MiniMax.H3PromptDirector_MV",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "H3PromptDirector_MV") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                const node = this;

                installStudioStyles();

                const wMap = {};
                node.widgets.forEach(w => {
                    wMap[w.name] = w;
                    w.draw = function () {};
                    w.computeSize = () => [0, -4];
                    if (w.inputEl) w.inputEl.style.display = "none";
                });

                let clipData = {};
                try { clipData = JSON.parse(wMap["clips_data_json"]?.value || "{}"); } catch(e) { clipData = {}; }

                let updatePlanGuide = null;

                const saveClipData = () => {
                    if (wMap["clips_data_json"]) {
                        wMap["clips_data_json"].value = JSON.stringify(clipData);
                        if (wMap["clips_data_json"].callback) wMap["clips_data_json"].callback(wMap["clips_data_json"].value);
                    }
                };

                const getV = (key, def) => clipData[key] !== undefined ? clipData[key] : def;
                const setV = (key, val) => { 
                    clipData[key] = val; 
                    saveClipData(); 
                    if (updatePlanGuide) updatePlanGuide();
                };

                let state = { items: [] };
                try { if (wMap["timeline_data"] && wMap["timeline_data"].value) state = JSON.parse(wMap["timeline_data"].value); } catch (e) {}

                const bindReal = (wName, label, isMultiline = false, placeholder = "") => {
                    const w = wMap[wName];
                    if (!w) return document.createElement("div");
                    const row = document.createElement("div"); row.className = "h3-field-row";
                    if (label) { const lbl = document.createElement("label"); lbl.textContent = label; row.appendChild(lbl); }
                    let el;
                    if (w.type === "combo") {
                        el = document.createElement("select");
                        el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:6px 8px; border-radius:8px; outline:none;";
                        (w.options?.values || []).forEach(opt => {
                            const optEl = document.createElement("option"); optEl.value = opt; optEl.textContent = opt;
                            if (opt === w.value) optEl.selected = true;
                            el.appendChild(optEl);
                        });
                        el.onchange = () => { w.value = el.value; if (w.callback) w.callback(el.value); };
                    } else if (isMultiline) {
                        el = document.createElement("textarea");
                        el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:8px; border-radius:8px; min-height:56px; outline:none;";
                        el.placeholder = placeholder; el.value = w.value !== undefined ? w.value : "";
                        el.oninput = () => { w.value = el.value; if (w.callback) w.callback(el.value); };
                    } else {
                        el = document.createElement("input"); el.type = "text";
                        el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:6px 8px; border-radius:8px; outline:none;";
                        el.placeholder = placeholder; el.value = w.value !== undefined ? w.value : "";
                        el.oninput = () => { w.value = el.value; if (w.callback) w.callback(w.value); };
                    }
                    row.appendChild(el); return row;
                };

                const bindVInputWithTemplate = (key, labelText, templateText, placeholderText = "") => {
                    const row = document.createElement("div"); row.className = "h3-field-row";
                    
                    const labelBar = document.createElement("div");
                    labelBar.style.cssText = "display:flex; justify-content:space-between; align-items:center;";

                    const lbl = document.createElement("label");
                    lbl.textContent = labelText;
                    lbl.style.cssText = "font-size:10px; color:#9aa0a6; font-weight:bold;";

                    const btnTpl = document.createElement("button");
                    btnTpl.type = "button";
                    btnTpl.innerHTML = `📋 テンプレを挿入`;
                    btnTpl.style.cssText = "background:#1e2430; border:1px solid #324765; color:#5bb3f5; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; cursor:pointer;";
                    btnTpl.title = "最適化された記入テンプレートを入力欄に挿入します";

                    const el = document.createElement("textarea");
                    el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:8px; border-radius:8px; min-height:86px; outline:none; font-family:inherit; font-size:11px; line-height:1.5;";
                    el.placeholder = placeholderText || templateText;
                    el.value = getV(key, "");
                    el.oninput = () => setV(key, el.value);

                    btnTpl.onclick = (e) => {
                        e.preventDefault();
                        if (!el.value.trim() || confirm("入力欄をテンプレートで上書きしますか？")) {
                            el.value = templateText;
                            setV(key, templateText);
                        }
                    };

                    labelBar.append(lbl, btnTpl);
                    row.append(labelBar, el);
                    return row;
                };

                const bindVInput = (key, labelText, isMultiline = false, placeholder = "") => {
                    const row = document.createElement("div"); row.className = "h3-field-row";
                    if (labelText) { const lbl = document.createElement("label"); lbl.textContent = labelText; row.appendChild(lbl); }
                    let el;
                    if (isMultiline) {
                        el = document.createElement("textarea");
                        el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:8px; border-radius:8px; min-height:56px; outline:none;";
                        el.placeholder = placeholder;
                    } else {
                        el = document.createElement("input"); el.type = "text";
                        el.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:6px 8px; border-radius:8px; outline:none;";
                        el.placeholder = placeholder;
                    }
                    el.value = getV(key, "");
                    el.oninput = () => setV(key, el.value);
                    row.appendChild(el); return row;
                };

                const bindVCheck = (key, labelText, defVal, onChangeExtra = null) => {
                    const label = document.createElement("label");
                    label.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#dbe0e6;cursor:pointer;";
                    const cb = document.createElement("input"); cb.type = "checkbox";
                    cb.checked = getV(key, defVal);
                    cb.onchange = () => { setV(key, cb.checked); if (onChangeExtra) onChangeExtra(cb.checked); };
                    label.append(cb, document.createTextNode(labelText)); return label;
                };

                const bindVSelect = (key, labelText, options, defVal) => {
                    const row = document.createElement("div"); row.className = "h3-field-row";
                    if (labelText) { const lbl = document.createElement("label"); lbl.textContent = labelText; row.appendChild(lbl); }
                    const sel = document.createElement("select");
                    sel.style.cssText = "background:#202020; color:#ffffff; border:1px solid #383838; padding:6px 8px; border-radius:8px; outline:none;";
                    options.forEach(opt => {
                        const optEl = document.createElement("option"); optEl.value = opt.value; optEl.textContent = opt.label;
                        if (getV(key, defVal) === opt.value) optEl.selected = true;
                        sel.appendChild(optEl);
                    });
                    sel.onchange = () => setV(key, sel.value);
                    row.appendChild(sel);
                    return row;
                };

                const bindVCastSingSelector = (prefix) => {
                    const block = document.createElement("div"); block.className = "h3-cast-sing-block";
                    const lbl = document.createElement("div"); lbl.style.cssText = "font-size:10px; color:#9aa0a6; font-weight:bold;"; lbl.textContent = "登場キャラクター・口パク設定";
                    block.appendChild(lbl);

                    for (let k = 1; k <= 3; k++) {
                        const row = document.createElement("div"); row.className = "h3-cast-sing-row";
                        const inKey = `${prefix}_char${k}_in`;
                        const singKey = `${prefix}_char${k}_sing`;

                        if (clipData[inKey] === undefined) { clipData[inKey] = (k === 1); }
                        if (clipData[singKey] === undefined) { clipData[singKey] = false; }

                        const nameW = wMap[`char${k}_name`];
                        const presetW = wMap[`char${k}_preset`];
                        let cLabel = `キャラ${k} (S${k})`;
                        if (nameW && nameW.value) cLabel = `${nameW.value} (S${k})`;
                        else if (presetW && presetW.value && presetW.value !== "None") cLabel = `${presetW.value} (S${k})`;

                        const isIn = clipData[inKey];
                        const chip = document.createElement("div");
                        chip.className = `h3-cast-toggle-chip ${isIn ? "active" : ""}`;
                        chip.textContent = cLabel;

                        const singLabel = document.createElement("label"); singLabel.className = "h3-sing-check-label";
                        const singChk = document.createElement("input"); singChk.type = "checkbox";
                        singChk.checked = clipData[singKey];

                        chip.onclick = (e) => {
                            e.preventDefault();
                            const active = !chip.classList.contains("active");
                            chip.className = `h3-cast-toggle-chip ${active ? "active" : ""}`;
                            setV(inKey, active);
                        };

                        singChk.onchange = () => { setV(singKey, singChk.checked); };

                        singLabel.append(singChk, document.createTextNode("口パク (歌唱)"));
                        row.append(chip, singLabel);
                        block.appendChild(row);
                    }
                    return block;
                };

                const createPicCheckboxGroup = (charIndex) => {
                    const wrapper = document.createElement("div"); wrapper.className = "h3-pic-check-row";
                    const label = document.createElement("label"); label.textContent = "キャラクター画像 (P1〜P9 参照指定)"; label.style.cssText = "font-size:10px; color:#9aa0a6; font-weight:bold;";
                    const grid = document.createElement("div"); grid.className = "h3-pic-check-grid";
                    const picsWidget = wMap[`char${charIndex}_pics`];
                    let currentPics = picsWidget && picsWidget.value ? String(picsWidget.value).split(",").map(p => p.trim()).filter(Boolean) : [];
                    for (let p = 1; p <= 9; p++) {
                        const item = document.createElement("div"); const tag = `<Picture ${p}>`;
                        item.className = `h3-pic-check-item ${currentPics.includes(tag) ? "checked" : ""}`; item.textContent = `P${p}`;
                        item.onclick = (e) => {
                            e.stopPropagation(); if (!picsWidget) return;
                            if (!item.classList.contains("checked")) { item.classList.add("checked"); if (!currentPics.includes(tag)) currentPics.push(tag); }
                            else { item.classList.remove("checked"); currentPics = currentPics.filter(t => t !== tag); }
                            currentPics.sort(); picsWidget.value = currentPics.join(", "); if (picsWidget.callback) picsWidget.callback(picsWidget.value);
                        };
                        grid.appendChild(item);
                    }
                    wrapper.append(label, grid); return wrapper;
                };

                const buildPlanGuideBanner = (bannerId) => {
                    const banner = document.createElement("div");
                    banner.id = bannerId;
                    banner.className = "h3-guide-banner";
                    return banner;
                };

                updatePlanGuide = () => {
                    const totalMusic = parseFloat(getV("total_music_sec", "90")) || 90;
                    
                    const calcClips = (duration) => {
                        if (totalMusic <= duration) return 1;
                        const netLater = duration - OVERLAP_SEC;
                        return 1 + Math.ceil((totalMusic - duration) / netLater);
                    };

                    const clips5s = calcClips(5.0);
                    const clips8s = calcClips(8.0);
                    const clips10s = calcClips(10.0);

                    let enabledCount = 0;
                    for (let i = 1; i <= 14; i++) {
                        if (getV(`c${i}_enabled`, i === 1)) enabledCount++;
                    }

                    const coveredSec = enabledCount === 0 ? 0 : 10.0 + Math.max(0, enabledCount - 1) * (10.0 - OVERLAP_SEC);

                    const html = `
                        <div class="h3-guide-title">【推奨制作プラン・生成ガイド】（楽曲長: ${totalMusic.toFixed(1)} 秒）</div>
                        <ul class="h3-guide-list">
                            <li><b>標準・カット重視（1クリップ約5秒尺）</b>： 全 <b>${clips5s}</b> クリップで完走（Clip 1: 5.0s / 2以降: 実質 +3.38s）</li>
                            <li><b>安定・ミドル尺（1クリップ約8秒尺）</b>： 全 <b>${clips8s}</b> クリップで完走（Clip 1: 8.0s / 2以降: 実質 +6.38s）</li>
                            <li><b>おすすめ・ロングテイク（1クリップ約10秒尺）</b>： 全 <b>${clips10s}</b> クリップで完走（Clip 1: 10.0s / 2以降: 実質 +8.38s）</li>
                        </ul>
                        <div class="h3-guide-current">
                            <b>現在の設定状況:</b> 有効クリップ数 = <b>${enabledCount} クリップ</b>（10秒尺設定なら 約 <b>${coveredSec.toFixed(1)} 秒</b> 地点までカバー中）
                        </div>
                    `;

                    ["guide-banner-omakase", "guide-banner-prompt"].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = html;
                    });
                };

                let activeTab = "omakase";
                let activeClipTab = 1;
                let isMediaCollapsed = false;
                let mediaBodyHeight = 340;

                const root = document.createElement("div");
                root.className = "h3-studio-container";
                root.style.transform = `translateY(-14px)`;

                const tabBar = document.createElement("div");
                tabBar.className = "h3-tab-bar";

                const tabs = [
                    { id: "omakase", label: "おまかせ構成" },
                    { id: "cast", label: "キャラクター設定" },
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
                        fixedMediaArea.style.display = (activeTab === "llm" || activeTab === "prompt") ? "none" : "flex";
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
                mediaResizerBar.innerHTML = `<div class="h3-media-header-title">［メディアボックス］</div><div class="h3-media-drag-handle">⋯</div><div class="h3-media-toggle-btn">▼</div>`;
                const toggleBtn = mediaResizerBar.lastChild;
                const mediaBody = document.createElement("div");
                mediaBody.className = "h3-media-body";
                mediaBody.style.height = `${mediaBodyHeight}px`;

                let isDragging = false, startY = 0, startHeight = 0;
                mediaResizerBar.onmousedown = (e) => {
                    if (e.target === toggleBtn) return;
                    isDragging = true; startY = e.clientY; startHeight = mediaBody.offsetHeight;
                    if (isMediaCollapsed) { isMediaCollapsed = false; mediaBody.classList.remove("collapsed"); toggleBtn.textContent = "▼"; }
                    e.preventDefault();
                    const onMouseMove = (ev) => {
                        if (!isDragging) return;
                        let newH = Math.max(80, Math.min(520, startHeight + (startY - ev.clientY)));
                        mediaBodyHeight = newH; mediaBody.style.height = `${newH}px`;
                    };
                    const onMouseUp = () => { isDragging = false; window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
                    window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseUp);
                };
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    isMediaCollapsed = !isMediaCollapsed;
                    if (isMediaCollapsed) { mediaBody.classList.add("collapsed"); toggleBtn.textContent = "▲"; }
                    else { mediaBody.classList.remove("collapsed"); mediaBody.style.height = `${mediaBodyHeight}px`; toggleBtn.textContent = "▼"; }
                };

                fixedMediaArea.append(mediaResizerBar, mediaBody);
                root.append(tabBar, contentArea, fixedMediaArea);

                const applyStoryboardToClips = (text) => {
                    if (!text || !text.trim()) return;
                    
                    for (let i = 1; i <= 14; i++) {
                        setV(`c${i}_enabled`, false);
                        for (let j = 1; j <= 4; j++) {
                            setV(`c${i}_s${j}_enabled`, false);
                            setV(`c${i}_s${j}_char1_sing`, false);
                            setV(`c${i}_s${j}_char2_sing`, false);
                            setV(`c${i}_s${j}_char3_sing`, false);
                        }
                    }

                    const clipBlocks = text.split(/\[Clip\s*(\d+)\]/i);
                    for (let idx = 1; idx < clipBlocks.length; idx += 2) {
                        const clipNum = parseInt(clipBlocks[idx]);
                        const blockContent = clipBlocks[idx + 1] || "";
                        if (clipNum < 1 || clipNum > 14) continue;

                        setV(`c${clipNum}_enabled`, true);

                        const mSummary = blockContent.match(/(?:演出|Direction|Scene|Atmosphere|Lighting)\s*[:：]\s*(.*?)(?=(?:保持|Retention|環境音|Foley|Sound|Shot\s*\d+)\s*[:：]|$)/is);
                        if (mSummary) setV(`c${clipNum}_summary`, mSummary[1].trim());

                        const mRet = blockContent.match(/(?:保持|Retention|Wardrobe|Features)\s*[:：]\s*(.*?)(?=(?:演出|Direction|Scene|Atmosphere|Lighting|環境音|Foley|Sound|Shot\s*\d+)\s*[:：]|$)/is);
                        if (mRet) setV(`c${clipNum}_retention`, mRet[1].trim());

                        const mAmb = blockContent.match(/(?:環境音|Foley|Sound|Audio)\s*[:：]\s*(.*?)(?=(?:演出|Direction|Scene|Atmosphere|Lighting|保持|Retention|Wardrobe|Features|Shot\s*\d+)\s*[:：]|$)/is);
                        if (mAmb) setV(`c${clipNum}_ambient_sound`, mAmb[1].trim());

                        for (let j = 1; j <= 4; j++) {
                            const mShot = blockContent.match(new RegExp(`Shot\\s*${j}\\s*[:：]\\s*(.*?)(?=(?:Shot\\s*\\d+|演出|Direction|Scene|Atmosphere|Lighting|保持|Retention|Wardrobe|Features|環境音|Foley|Sound|Audio)\\s*[:：]|$)`, "is"));
                            if (mShot) {
                                setV(`c${clipNum}_s${j}_enabled`, true);
                                setV(`c${clipNum}_s${j}_action`, mShot[1].trim());
                                setV(`c${clipNum}_s${j}_char1_in`, true);
                            }
                        }
                    }
                    saveClipData();
                    alert("全体構成をクリップ 1〜14 に反映しました！\n※必ず「クリップ」タブを開き、歌うシーンの「口パク (歌唱)」を手動でONにしてください。");
                };

                const renderTabContent = () => {
                    contentArea.replaceChildren();

                    if (activeTab === "omakase") {
                        const card = document.createElement("div"); card.className = "h3-char-card";
                        const title = document.createElement("div"); title.className = "h3-char-title";
                        title.textContent = "MV全体設定 ＆ 楽曲自動解析ビルダー";

                        card.append(
                            title,
                            bindVInputWithTemplate("global_summary", "MVの全体演出・シチュエーション", TEMPLATE_GLOBAL_SUMMARY),
                            bindVInputWithTemplate("global_retention", "禁止事項＆スタイル維持 (全クリップ固定)", TEMPLATE_GLOBAL_RETENTION)
                        );

                        card.appendChild(buildPlanGuideBanner("guide-banner-omakase"));

                        const analysisBlock = document.createElement("div");
                        analysisBlock.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-top:6px; background:#101114; padding:10px; border-radius:8px; border:1px solid #282828;";
                        const bTitle = document.createElement("div");
                        bTitle.style.cssText = "font-size:11px; font-weight:bold; color:#ffcc00;";
                        bTitle.textContent = "🎵 楽曲自動解析 ＆ 絵コンテ生成";

                        const durationRow = document.createElement("div");
                        durationRow.style.cssText = "display:flex; align-items:center; gap:8px;";
                        const durationLabel = document.createElement("label");
                        durationLabel.textContent = " 1クリップの基本生成尺 (秒):";
                        durationLabel.style.cssText = "font-size:11px; color:#dbe0e6;";
                        const durationInput = document.createElement("input");
                        durationInput.type = "number"; durationInput.min = "1"; durationInput.step = "0.5";
                        durationInput.value = getV("clip_duration_sec", "10.0");
                        durationInput.style.cssText = "width:50px; background:#000; color:#fff; border:1px solid #555; padding:4px 6px; border-radius:4px; font-size:11px; text-align:center; outline:none;";
                        durationInput.oninput = () => { setV("clip_duration_sec", durationInput.value); };
                        durationRow.append(durationLabel, durationInput);
                        analysisBlock.appendChild(durationRow);

                        const audioOptions = [
                            { value: "auto", label: "自動判別 (Geminiなら直接音源解析 / その他はPython波形解析)" },
                            { value: "gemini_audio", label: "Gemini 直接音源解析 (音を耳で聴いてボーカル・展開を判別)" },
                            { value: "python_wave", label: "Python 波形エネルギー解析 (Ollama/ChatGPT向け)" }
                        ];
                        analysisBlock.appendChild(bindVSelect("audio_analysis_mode", "解析モードの選択", audioOptions, "auto"));

                        const genSbBtn = document.createElement("button");
                        genSbBtn.className = "h3-btn-gen-prompt";
                        genSbBtn.style.marginTop = "4px";
                        genSbBtn.innerHTML = `<span>▶ 楽曲を解析して全体絵コンテを自動生成 (LLM)</span>`;

                        analysisBlock.appendChild(genSbBtn);
                        card.appendChild(analysisBlock);

                        const editorTitle = document.createElement("div");
                        editorTitle.style.cssText = "font-size:11px; font-weight:bold; color:#ffffff; margin-top:10px;";
                        editorTitle.textContent = "全体構成エディタ (全クリップの絵コンテ一括編集)";

                        const sbTextarea = document.createElement("textarea");
                        sbTextarea.style.cssText = "width:100%; min-height:180px; background:#121214; border:1px solid #383838; border-radius:8px; color:#dbe0e6; font-family:Consolas,monospace; font-size:11px; line-height:1.45; padding:8px; box-sizing:border-box; outline:none;";
                        sbTextarea.value = getV("storyboard_draft", "");
                        sbTextarea.placeholder = "上のボタンを押すと、楽曲に同期した14クリップ分の絵コンテがここに出力されます。直接編集も可能です。";
                        sbTextarea.oninput = () => { setV("storyboard_draft", sbTextarea.value); };

                        const applyBtn = document.createElement("button");
                        applyBtn.style.cssText = "background:#22863a; border:1px solid #2ea44f; color:#ffffff; font-size:12px; font-weight:bold; padding:8px 14px; border-radius:6px; cursor:pointer; align-self:flex-start; margin-top:4px;";
                        applyBtn.textContent = "▼ この全体構成をクリップタブに一括反映する";
                        applyBtn.onclick = () => { applyStoryboardToClips(sbTextarea.value); };

                        genSbBtn.onclick = async () => {
                            genSbBtn.disabled = true; genSbBtn.innerHTML = `<span>⏳ 楽曲を解析中... (LLM通信中)</span>`;
                            const payload = {
                                global_summary: getV("global_summary", ""),
                                global_retention: getV("global_retention", ""),
                                audio_analysis_mode: getV("audio_analysis_mode", "auto"),
                                clip_duration_sec: getV("clip_duration_sec", "10.0"),
                                timeline_data: wMap["timeline_data"]?.value || '{"items":[]}',
                                llm_provider: wMap["llm_provider"]?.value || "Ollama (Local)",
                                llm_api_key: wMap["llm_api_key"]?.value || "",
                                llm_model: wMap["llm_model"]?.value || ""
                            };
                            try {
                                const res = await api.fetchApi("/h3/generate_storyboard_mv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                                const data = await res.json();
                                if (data.success && data.storyboard) {
                                    sbTextarea.value = data.storyboard;
                                    setV("storyboard_draft", data.storyboard);
                                } else { alert("絵コンテ生成エラー: " + (data.error || "不明なエラー")); }
                            } catch (e) { alert("通信エラー: " + e.message); }
                            finally { genSbBtn.disabled = false; genSbBtn.innerHTML = `<span>▶ 楽曲を解析して全体絵コンテを自動生成 (LLM)</span>`; }
                        };

                        card.append(editorTitle, sbTextarea, applyBtn);
                        contentArea.appendChild(card);
                        updatePlanGuide();

                    } else if (activeTab === "cast") {
                        const toggleBar = document.createElement("div"); toggleBar.className = "h3-top-toggle-bar";
                        const charCards = {};
                        for (let i = 1; i <= 3; i++) {
                            const isChecked = !!(wMap[`char${i}_enabled`] && wMap[`char${i}_enabled`].value);
                            const chip = document.createElement("div"); chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = isChecked;
                            const span = document.createElement("span"); span.textContent = `キャラクター${i}`;
                            chip.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const active = !chip.classList.contains("active");
                                chip.className = `h3-toggle-chip ${active ? "active" : ""}`; chk.checked = active;
                                if (wMap[`char${i}_enabled`]) { wMap[`char${i}_enabled`].value = active; if(wMap[`char${i}_enabled`].callback) wMap[`char${i}_enabled`].callback(active); }
                                if (charCards[i]) charCards[i].style.display = active ? "flex" : "none";
                            };
                            chip.append(chk, span); toggleBar.appendChild(chip);
                        }
                        contentArea.appendChild(toggleBar);

                        const motionStyleOptions = [
                            { value: "graceful", label: "優雅・おしとやか (跳ねず、穏やかで静かな佇まい)" },
                            { value: "standard", label: "標準・通常ダンス (音楽に合わせた自然なリズム)" },
                            { value: "energetic", label: "激しい・アクティブ (全身を使ったダイナミックな振り付け)" }
                        ];

                        for (let i = 1; i <= 3; i++) {
                            const isChecked = !!(wMap[`char${i}_enabled`] && wMap[`char${i}_enabled`].value);
                            const card = document.createElement("div"); card.className = "h3-char-card"; card.style.display = isChecked ? "flex" : "none";
                            const title = document.createElement("div"); title.className = "h3-char-title"; title.textContent = `キャラクター ${i}`;
                            card.append(
                                title, 
                                bindReal(`char${i}_name`, "キャラクター名", false, "キャラクター名を英語で入力"), 
                                bindReal(`char${i}_preset`, "プリセット"), 
                                createPicCheckboxGroup(i), 
                                bindVSelect(`char${i}_motion_style`, "動作スタイル (おしとやかさ/激しさ)", motionStyleOptions, "graceful"),
                                bindReal(`char${i}_audio`, "ボイスリファレンス"), 
                                bindReal(`char${i}_extra`, "特徴定義・追記", true, "キャラクターの特徴や追加の特徴を入力")
                            );
                            contentArea.appendChild(card); charCards[i] = card;
                        }

                    } else if (activeTab === "clip") {
                        const totalMusicRow = document.createElement("div");
                        totalMusicRow.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px; background:#181818; padding:8px 12px; border-radius:8px; border:1px solid #383838;";
                        const totalMusicLabel = document.createElement("label");
                        totalMusicLabel.textContent = "🎵 楽曲の総時間 (秒):";
                        totalMusicLabel.style.cssText = "font-size:11px; font-weight:bold; color:#dbe0e6;";
                        const totalMusicInput = document.createElement("input");
                        totalMusicInput.type = "number"; totalMusicInput.min = "0"; totalMusicInput.step = "0.1";
                        totalMusicInput.value = getV("total_music_sec", "");
                        totalMusicInput.id = "h3-total-music-input";
                        totalMusicInput.style.cssText = "width:70px; background:#000; color:#fff; border:1px solid #555; padding:4px 6px; border-radius:4px; font-size:12px; text-align:center; outline:none;";
                        totalMusicInput.oninput = () => { setV("total_music_sec", totalMusicInput.value); };
                        totalMusicRow.append(totalMusicLabel, totalMusicInput);
                        contentArea.appendChild(totalMusicRow);

                        const clipGrid = document.createElement("div");
                        clipGrid.style.display = "grid"; clipGrid.style.gridTemplateColumns = "repeat(7, 1fr)"; clipGrid.style.gap = "6px"; clipGrid.style.marginBottom = "8px";

                        for (let i = 1; i <= 14; i++) {
                            const isEnabled = getV(`c${i}_enabled`, i === 1);
                            const indicator = isEnabled ? "🟢" : "⚫";
                            const btn = document.createElement("div");
                            btn.innerHTML = `<span style="font-size:8px; margin-right:4px; pointer-events:none;">${indicator}</span>C${i}`;
                            const isActive = (activeClipTab === i);
                            btn.className = `h3-toggle-chip ${isActive ? "active" : ""}`;
                            if(isActive) { btn.style.borderColor = "#5bb3f5"; btn.style.color = "#ffffff"; }
                            btn.onclick = () => { activeClipTab = i; renderTabContent(); };
                            clipGrid.appendChild(btn);
                        }
                        contentArea.appendChild(clipGrid);

                        const activeClipCard = document.createElement("div");
                        activeClipCard.className = "h3-char-card"; activeClipCard.style.display = "flex"; activeClipCard.style.flexDirection = "column";

                        const titleBar = document.createElement("div");
                        titleBar.style.cssText = "display:flex; align-items:center; gap:12px; margin-bottom:8px; flex-wrap:wrap;";
                        const title = document.createElement("div"); title.className = "h3-char-title"; title.textContent = `クリップ ${activeClipTab}`;
                        
                        titleBar.append(
                            title, 
                            bindVCheck(`c${activeClipTab}_enabled`, "このクリップを有効にする", activeClipTab === 1, () => { renderTabContent(); }), 
                            bindVCheck(`c${activeClipTab}_continue`, "前回の動画の続きを生成する", true), 
                            bindVCheck(`c${activeClipTab}_link_next`, "今回の動画を次に繋げる", false)
                        );
                        activeClipCard.appendChild(titleBar);

                        activeClipCard.append(
                            bindVInput(`c${activeClipTab}_summary`, "演出（summary）", true, "このクリップの全体的な演出・シチュエーション・展開を入力（LLMがsummary:へ英語翻訳します）"),
                            bindVInput(`c${activeClipTab}_retention`, "保持要素 (retention_analysis)", true, "このクリップ特有の保持要素や維持したいディテールを入力（LLMが英語翻訳します）"),
                            bindVInput(`c${activeClipTab}_ambient_sound`, "環境音 (Foley)", false, "足音、風の音、雨音などの環境音・効果音を入力")
                        );

                        const shotToggleBar = document.createElement("div"); 
                        shotToggleBar.className = "h3-top-toggle-bar"; shotToggleBar.style.marginTop = "8px";
                        for (let j = 1; j <= 4; j++) {
                            const sKey = `c${activeClipTab}_s${j}_enabled`;
                            const isChecked = getV(sKey, j === 1);
                            const chip = document.createElement("div"); chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = isChecked;
                            const span = document.createElement("span"); span.textContent = `ショット${j}`;
                            chip.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const active = !chip.classList.contains("active");
                                setV(sKey, active);
                                renderTabContent();
                            };
                            chip.append(chk, span); shotToggleBar.appendChild(chip);
                        }
                        activeClipCard.appendChild(shotToggleBar);

                        for (let j = 1; j <= 4; j++) {
                            if (!getV(`c${activeClipTab}_s${j}_enabled`, j === 1)) continue;
                            const card = document.createElement("div"); card.className = "h3-char-card"; card.style.cssText = "background:#070709; border:1px solid #383838; margin-top:4px;";
                            const shotTitle = document.createElement("div"); shotTitle.className = "h3-char-title"; shotTitle.textContent = `ショット ${j}`;
                            
                            card.append(
                                shotTitle,
                                bindVInput(`c${activeClipTab}_s${j}_action`, "アクション / 構図", true, `ショット${j}のアクション・カメラワークを入力`), 
                                bindVCastSingSelector(`c${activeClipTab}_s${j}`)
                            );
                            activeClipCard.appendChild(card);
                        }
                        contentArea.appendChild(activeClipCard);

                    } else if (activeTab === "llm") {
                        const titleLLM = document.createElement("div"); titleLLM.className = "h3-char-title"; titleLLM.textContent = "LLM連携設定";
                        contentArea.append(
                            titleLLM, 
                            bindReal("llm_provider", "プロバイダの選択"), 
                            bindReal("llm_api_key", "APIキー (Windows環境変数登録済みの場合は空欄可)"), 
                            bindReal("llm_model", "モデル名 (例: gemini-3.8-flash, qwen2.5:7b-instruct-q5_K_M)")
                        );

                    } else if (activeTab === "prompt") {
                        const titlePrompt = document.createElement("div"); titlePrompt.className = "h3-char-title"; titlePrompt.innerHTML = `MiniMax H3 クリッププロンプト生成 <span style="color:gray; font-size:smaller; font-weight:normal;">(タブを切り替えると生成が中断されます)</span>`;
                        
                        contentArea.append(titlePrompt, buildPlanGuideBanner("guide-banner-prompt"));

                        const genBtn = document.createElement("button"); genBtn.className = "h3-btn-gen-prompt"; genBtn.innerHTML = `<span>▶ 全てのクリップを構築・翻訳</span>`;
                        const clipResContainer = document.createElement("div"); clipResContainer.className = "h3-clip-results-container";

                        const genClipWidget = wMap["generated_clip_prompts"];
                        
                        // ▼ 追加: 有効なすべてのクリップを一覧で表示し、それぞれに個別生成ボタンを配置
                        const updateClipResultsUI = () => {
                            clipResContainer.replaceChildren();
                            let clipData = {};
                            try { clipData = JSON.parse(genClipWidget.value || "{}"); } catch(e){}

                            for (let i = 1; i <= 14; i++) {
                                // 有効（🟢）になっているクリップのみを表示する
                                if (getV(`c${i}_enabled`, i === 1)) {
                                    const headerBar = document.createElement("div");
                                    headerBar.style.cssText = "display:flex; justify-content:space-between; align-items:flex-end; margin-top:4px;";
                                    
                                    const t = document.createElement("div"); 
                                    t.className = "h3-clip-result-title"; 
                                    t.style.marginTop = "0";
                                    t.textContent = `クリップ ${i} プロンプト (直接編集可能)`;
                                    
                                    const singleBtn = document.createElement("button");
                                    singleBtn.textContent = "［このクリップのみを構築・翻訳］";
                                    singleBtn.title = `クリップ${i}のみをLLMに翻訳させます`;
                                    singleBtn.style.cssText = "background:#1e2430; border:1px solid #324765; color:#5bb3f5; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:4px; cursor:pointer; transition:all 0.1s;";
                                    singleBtn.onmouseenter = () => { singleBtn.style.background = "#2b3446"; };
                                    singleBtn.onmouseleave = () => { singleBtn.style.background = "#1e2430"; };

                                    headerBar.append(t, singleBtn);

                                    const cta = document.createElement("textarea"); 
                                    cta.className = "h3-clip-result-textarea"; 
                                    cta.value = clipData[i] || "";
                                    
                                    cta.oninput = () => { 
                                        try { 
                                            const current = JSON.parse(genClipWidget.value || "{}"); 
                                            current[String(i)] = cta.value; 
                                            genClipWidget.value = JSON.stringify(current); 
                                            if (genClipWidget.callback) genClipWidget.callback(genClipWidget.value); 
                                        } catch(e) {} 
                                    };

                                    // 個別生成ボタンの処理
                                    singleBtn.onclick = async () => {
                                        singleBtn.disabled = true; 
                                        singleBtn.textContent = "⏳ 構築中...";
                                        
                                        const payload = { target_clip: i }; // Python側にクリップ番号を伝える
                                        node.widgets.forEach(w => { payload[w.name] = w.value; });
                                        try {
                                            const parsed = JSON.parse(wMap["clips_data_json"].value || "{}");
                                            Object.assign(payload, parsed);
                                        } catch(e) {}
                                        
                                        try {
                                            const res = await api.fetchApi("/h3/generate_prompt_mv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                                            const data = await res.json();
                                            if (data.success && data.clip_prompts && data.clip_prompts[i]) {
                                                cta.value = data.clip_prompts[i];
                                                cta.oninput(); // 保存処理をトリガー
                                            } else { 
                                                alert("プロンプト生成エラー: " + (data.error || "不明なエラー")); 
                                            }
                                        } catch (err) { 
                                            alert("通信エラー: " + err.message); 
                                        } finally { 
                                            singleBtn.disabled = false; 
                                            singleBtn.textContent = "［このクリップのみを構築・翻訳］"; 
                                        }
                                    };

                                    clipResContainer.append(headerBar, cta);
                                }
                            }
                        };
                        
                        if (genClipWidget) { updateClipResultsUI(); }

                        // 全体生成ボタンの処理（変更なし・上書きマージのみ）
                        genBtn.onclick = async () => {
                            genBtn.disabled = true; genBtn.innerHTML = `<span>⏳ プロンプト構築中... (LLM通信中)</span>`;
                            const payload = {};
                            node.widgets.forEach(w => { payload[w.name] = w.value; });
                            try {
                                const parsed = JSON.parse(wMap["clips_data_json"].value || "{}");
                                Object.assign(payload, parsed);
                            } catch(e) {}
                            
                            try {
                                const res = await api.fetchApi("/h3/generate_prompt_mv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                                const data = await res.json();
                                if (data.success && data.clip_prompts) {
                                    let current = {};
                                    try { current = JSON.parse(genClipWidget.value || "{}"); } catch(e){}
                                    Object.assign(current, data.clip_prompts); // 既存を維持しつつ上書き
                                    const strData = JSON.stringify(current);
                                    if (genClipWidget) { genClipWidget.value = strData; if (genClipWidget.callback) genClipWidget.callback(strData); }
                                    updateClipResultsUI();
                                } else { alert("プロンプト生成エラー: " + (data.error || "不明なエラー")); }
                            } catch (err) { alert("通信エラー: " + err.message); } 
                            finally { genBtn.disabled = false; genBtn.innerHTML = `<span>▶ 全てのクリップを構築・翻訳</span>`; }
                        };
                        
                        contentArea.append(genBtn, clipResContainer);
                        updatePlanGuide();
                    }
                };

                const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.hidden = true;
                let activeSlotConfig = null;
                
                const detectAudioDuration = (filename) => {
                    try {
                        const testAudio = new Audio(`/view?filename=${encodeURIComponent(filename)}&type=input`);
                        testAudio.onloadedmetadata = () => {
                            if (testAudio.duration && !isNaN(testAudio.duration)) {
                                const roundedSec = Math.round(testAudio.duration * 10) / 10;
                                setV("total_music_sec", roundedSec);
                                const inputEl = document.getElementById("h3-total-music-input");
                                if (inputEl) inputEl.value = roundedSec;
                                if (updatePlanGuide) updatePlanGuide();
                            }
                        };
                    } catch(e) {}
                };

                const buildSlot = (laneEl, laneType, slotIdx, acceptTypes, isKeyframe = false, customBadge = null) => {
                    const slot = document.createElement("div");
                    const slotClass = isKeyframe ? "keyframe-slot" : `${laneType}-slot`;
                    slot.className = `h3-slot ${slotClass}`;

                    const item = state.items.find(it => (it.laneType || it.type) === laneType && it.slot === slotIdx);

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
                            if (laneType === "audio" && slotIdx === 4) detectAudioDuration(json.name);
                            renderFixedMediaLanes();
                        }
                    };

                    laneEl.appendChild(slot);
                };

                fileInput.onchange = async () => {
                    if (fileInput.files.length > 0 && activeSlotConfig) {
                        const file = fileInput.files[0];
                        const form = new FormData();
                        form.append("image", file, file.name);
                        form.append("type", "input");
                        const res = await api.fetchApi("/upload/image", { method: "POST", body: form });
                        const json = await res.json();
                        state.items = state.items.filter(it => !((it.laneType || it.type) === activeSlotConfig.type && it.slot === activeSlotConfig.index));
                        state.items.push({ type: activeSlotConfig.type, value: json.name, slot: activeSlotConfig.index, laneType: activeSlotConfig.type });
                        if (wMap["timeline_data"]) {
                            wMap["timeline_data"].value = JSON.stringify(state);
                            if (wMap["timeline_data"].callback) wMap["timeline_data"].callback(wMap["timeline_data"].value);
                        }
                        if (activeSlotConfig.type === "audio" && activeSlotConfig.index === 4) detectAudioDuration(json.name);
                        renderFixedMediaLanes();
                    }
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
                    
                    // Audio 1〜3
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
                    node.addDOMWidget("studio_console_ui", "custom", root, { serialize: false, hideOnZoom: false, getHeight: () => 820 });
                }
                node.setSize([720, 905]);
                const onResize = node.onResize;
                node.onResize = function (size) {
                    if (size[0] < 720) size[0] = 720; if (size[1] < 905) size[1] = 905;
                    if (root) { root.style.width = (size[0] - 20) + "px"; root.style.height = (size[1] - 85) + "px"; }
                    if (onResize) onResize.apply(this, arguments);
                };

                const onConfigure = node.onConfigure;
                node.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    try { clipData = JSON.parse(wMap["clips_data_json"]?.value || "{}"); } catch(e) { clipData = {}; }
                    try { if (wMap["timeline_data"] && wMap["timeline_data"].value) state = JSON.parse(wMap["timeline_data"].value); } catch (e) {}
                    renderTabContent(); renderFixedMediaLanes();
                    if (node.size[0] < 720 || node.size[1] < 905) node.setSize([Math.max(720, node.size[0]), Math.max(905, node.size[1])]);
                    if (root) { root.style.width = (node.size[0] - 20) + "px"; root.style.height = (node.size[1] - 85) + "px"; }
                };
                
                renderTabContent();
                renderFixedMediaLanes();
            };
        }
    }
});