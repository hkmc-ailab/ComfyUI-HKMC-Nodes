import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CATEGORIES = [
    ["identity", "基本属性"], ["face", "顔・瞳"], ["hair", "髪"],
    ["body", "身体・耳・尻尾"], ["upper", "上半身衣装"], ["waist", "腰・ベルト"],
    ["lower", "下半身衣装"], ["legs", "脚・靴"], ["hands", "手・手袋"],
    ["accessories", "装飾・装備"], ["expression", "表情"], ["pose", "ポーズ"], ["other", "その他"]
];
const CATEGORY_IDS = new Set(CATEGORIES.map(([id]) => id));

app.registerExtension({
    name: "Anima.CharacterExtractor",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaCharacterExtractor") return;
        const previousCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            previousCreated?.apply(this, arguments);
            const node = this;
            const wMap = Object.fromEntries((node.widgets || []).map(w => [w.name, w]));
            for (const name of ["character_prompt", "llm_provider", "llm_api_key", "llm_model"]) {
                const w = wMap[name];
                if (!w) continue;
                w.type = "hidden";
                w.computeSize = () => [0, -4];
                w.draw = () => {};
                if (w.inputEl) {
                    w.inputEl.style.display = "none";
                    w.inputEl.style.height = "0";
                    w.inputEl.style.minHeight = "0";
                    w.inputEl.style.margin = "0";
                    w.inputEl.style.padding = "0";
                    w.inputEl.style.border = "0";
                }
            }
            const el = (tag, css = "", text = "") => {
                const result = document.createElement(tag);
                result.style.cssText = css;
                if (text) result.textContent = text;
                return result;
            };
            const buttonCss = "background:#242932;color:#dce5f0;border:1px solid #404954;border-radius:5px;padding:6px 9px;font-size:11px;cursor:pointer;";
            const fieldCss = "width:100%;min-width:0;box-sizing:border-box;background:#1c2026;color:#e5e9f0;border:1px solid #414851;border-radius:5px;padding:7px;font:11px/1.5 sans-serif;";
            const root = el("div", "display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;background:#15171b;color:#dce0e8;border:1px solid #353a44;border-radius:7px;font-family:Arial,sans-serif;");
            const tabs = el("div", "display:flex;flex:0 0 35px;gap:5px;padding:5px 6px 0;background:#181b20;box-sizing:border-box;border-bottom:1px solid #343943;");
            const pages = {};
            const tabButtons = {};
            for (const [id, name] of [["input", "入力・抽出"], ["review", "分類を確認・編集"], ["llm", "LLM設定"]]) {
                const btn = el("button", "flex:1;min-width:0;border:1px solid #414753;border-radius:5px 5px 0 0;padding:3px;font-size:11px;font-weight:600;cursor:pointer;", name);
                btn.type = "button";
                tabs.appendChild(btn);
                tabButtons[id] = btn;
                pages[id] = el("div", "display:none;flex:1;min-height:0;flex-direction:column;gap:9px;padding:10px;box-sizing:border-box;overflow:hidden;");
            }
            let currentTab = "input";
            const switchTab = id => {
                currentTab = id;
                for (const [key, page] of Object.entries(pages)) {
                    page.style.display = key === id ? "flex" : "none";
                    tabButtons[key].style.background = key === id ? "#176ba7" : "#242831";
                    tabButtons[key].style.color = key === id ? "white" : "#9da5b1";
                }
                app.graph?.setDirtyCanvas?.(true, true);
            };
            for (const id of Object.keys(tabButtons)) tabButtons[id].onclick = () => switchTab(id);
            const label = text => el("div", "font-size:10px;font-weight:600;color:#aab5c4;", text);
            const input = el("textarea", fieldCss + "flex:1;min-height:80px;resize:none;font-family:Consolas,monospace;");
            input.value = String(wMap.character_prompt?.value ?? "");
            input.placeholder = "キャラクターの全身プロンプトをカンマ区切りで入力";
            input.oninput = () => {
                if (wMap.character_prompt) {
                    wMap.character_prompt.value = input.value;
                    wMap.character_prompt.callback?.(input.value);
                }
            };
            const help = el("div", "font-size:10px;line-height:1.6;color:#9da9b8;", "QueueでLLMが一次分類します。その後［分類を確認・編集］でタグを確認・修正して保存してください。再実行しても画面上の手動修正は確認なしでは破棄しません。");
            const toReview = el("button", buttonCss, "分類結果を確認・編集");
            pages.input.append(label("全身キャラクタープロンプト"), input, help, toReview);

            const toolbar = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:0 0 auto;");
            const filter = el("select", fieldCss + "flex:1;max-width:190px;");
            for (const [value, name] of [["all", "全分類"], ...CATEGORIES]) {
                const opt = el("option", "", name);
                opt.value = value;
                filter.appendChild(opt);
            }
            const counter = el("span", "font-size:10px;color:#aab4c3;white-space:nowrap;");
            const add = el("button", buttonCss, "＋ タグ追加");
            const importBtn = el("button", buttonCss, "JSON読込");
            toolbar.append(filter, counter, add, importBtn);
            const notice = el("div", "flex:0 0 auto;font-size:10px;line-height:1.5;color:#c0cbd8;");
            const list = el("div", "flex:1;min-height:0;overflow:auto;border:1px solid #343b46;border-radius:6px;padding:5px;box-sizing:border-box;background:#191c22;");
            const footer = el("div", "display:flex;flex:0 0 auto;gap:6px;");
            const save = el("button", buttonCss + "flex:1;background:#176196;color:white;border-color:#3285c0;font-weight:600;", "プリセットを保存");
            const jsonBtn = el("button", buttonCss, "JSON表示");
            footer.append(save, jsonBtn);
            pages.review.append(toolbar, notice, list, footer);

            const llmLabel = (title, control) => {
                const wrap = el("div", "display:flex;flex-direction:column;gap:5px;");
                wrap.append(label(title), control);
                return wrap;
            };
            const provider = el("select", fieldCss);
            const choices = wMap.llm_provider?.options?.values || ["Ollama (Local)", "Gemini (Cloud)", "ChatGPT (OpenAI)"];
            for (const name of choices) {
                const opt = el("option", "", name);
                opt.value = name;
                provider.appendChild(opt);
            }
            provider.value = wMap.llm_provider?.value ?? choices[0];
            const apiKey = el("input", fieldCss);
            apiKey.type = "password";
            apiKey.autocomplete = "off";
            apiKey.value = String(wMap.llm_api_key?.value ?? "");
            const model = el("input", fieldCss);
            model.value = String(wMap.llm_model?.value ?? "");
            model.placeholder = "例: qwen2.5:7b-instruct-q5_K_M";
            for (const [ctrl, name, event] of [[provider, "llm_provider", "change"], [apiKey, "llm_api_key", "input"], [model, "llm_model", "input"]]) {
                ctrl.addEventListener(event, () => {
                    if (wMap[name]) {
                        wMap[name].value = ctrl.value;
                        wMap[name].callback?.(ctrl.value);
                    }
                });
            }
            pages.llm.append(llmLabel("プロバイダー", provider), llmLabel("APIキー（環境変数を使う場合は空欄）", apiKey), llmLabel("モデル名", model));

            let data = null;
            let dirty = false;
            const normalized = raw => {
                const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (!parsed || parsed.format !== "anima_character_v2" || !Array.isArray(parsed.tags)) throw Error("Anima Character v2形式のJSONではありません");
                const tags = parsed.tags.map((row, index) => {
                    if (!row || typeof row.text !== "string" || !CATEGORY_IDS.has(row.category)) throw Error(`${index + 1}行目のタグまたは分類が不正です`);
                    return { id: index, text: row.text, category: row.category, locked: !!row.locked };
                });
                return { format: "anima_character_v2", version: 2, tags, original_prompt: String(parsed.original_prompt ?? "") };
            };
            const currentJSON = () => {
                if (!data) throw Error("分類結果がありません。先にQueueを実行してください");
                return JSON.stringify({ ...data, tags: data.tags.map((tag, id) => ({ ...tag, id })) }, null, 2);
            };
            const sourceCoverage = () => {
                if (!data) return "";
                const original = (data.original_prompt || "").split(/[,、\n]+/).map(s => s.trim()).filter(Boolean);
                const texts = new Set(data.tags.map(t => t.text.trim().toLocaleLowerCase()));
                const excluded = new Set(["1girl", "1boy", "solo", "masterpiece", "best quality", "amazing quality", "absurdres", "highres", "newest", "anime style", "very aesthetic"]);
                const missing = original.filter(t => !excluded.has(t.toLowerCase()) && !texts.has(t.toLocaleLowerCase()));
                return missing.length ? `元タグの未保持: ${missing.length}件（${missing.slice(0, 3).join(" / ")}${missing.length > 3 ? "…" : ""}）` : "元タグの保持チェック: OK";
            };
            const render = () => {
                list.replaceChildren();
                if (!data) {
                    notice.textContent = "未分類：Queueを実行するか、JSONを読み込んでください。";
                    counter.textContent = "0件";
                    return;
                }
                counter.textContent = `${data.tags.length}タグ`;
                notice.textContent = `${dirty ? "● 手動編集あり（未保存） / " : ""}${sourceCoverage()} / 変更は保存するまでプリセットに反映されません`;
                const visible = data.tags.map((tag, index) => ({ tag, index })).filter(({ tag }) => filter.value === "all" || tag.category === filter.value);
                for (const { tag, index } of visible) {
                    const row = el("div", "display:flex;gap:5px;align-items:center;padding:5px 3px;border-bottom:1px solid #2b3039;box-sizing:border-box;");
                    const textInput = el("input", fieldCss + "flex:1;min-width:0;padding:6px;", "");
                    textInput.value = tag.text;
                    textInput.title = "元タグの文字列。編集可能";
                    textInput.oninput = () => { tag.text = textInput.value; dirty = true; notice.textContent = `● 手動編集あり（未保存） / ${sourceCoverage()}`; };
                    const category = el("select", fieldCss + "width:122px;flex:0 0 122px;padding:5px 3px;");
                    for (const [value, name] of CATEGORIES) {
                        const option = el("option", "", name);
                        option.value = value;
                        category.appendChild(option);
                    }
                    category.value = tag.category;
                    category.onchange = () => { tag.category = category.value; dirty = true; render(); };
                    const lock = el("button", buttonCss + "padding:5px 6px;", tag.locked ? "🔒" : "🔓");
                    lock.title = "手動修正を保護する印。分類結果の再読込時にも保護する";
                    lock.onclick = () => { tag.locked = !tag.locked; dirty = true; render(); };
                    const remove = el("button", buttonCss + "padding:5px 6px;", "×");
                    remove.title = "タグ削除";
                    remove.onclick = () => { data.tags.splice(index, 1); dirty = true; render(); };
                    row.append(textInput, category, lock, remove);
                    list.appendChild(row);
                }
            };
            const loadData = (raw, fromQueue = false) => {
                const incoming = normalized(raw);
                if (fromQueue && dirty && data && !confirm("未保存の手動編集があります。新しいLLM分類結果で置き換えますか？")) return;
                if (fromQueue && data) {
                    const protectedTags = data.tags.filter(tag => tag.locked);
                    for (const old of protectedTags) {
                        const matching = incoming.tags.find(tag => tag.text === old.text);
                        if (matching) {
                            matching.category = old.category;
                            matching.locked = true;
                        }
                    }
                }
                data = incoming;
                dirty = false;
                render();
            };
            filter.onchange = render;
            add.onclick = () => {
                if (!data) data = { format: "anima_character_v2", version: 2, tags: [], original_prompt: input.value };
                data.tags.push({ id: data.tags.length, text: "", category: filter.value === "all" ? "other" : filter.value, locked: false });
                dirty = true;
                render();
                list.scrollTop = list.scrollHeight;
            };
            importBtn.onclick = () => {
                const raw = prompt("既存のAnima Character v2 JSONを貼り付けてください");
                if (!raw) return;
                if (dirty && !confirm("未保存の編集を破棄して読み込みますか？")) return;
                try { loadData(raw); switchTab("review"); } catch (err) { alert(`読込失敗: ${err.message}`); }
            };
            toReview.onclick = () => switchTab("review");
            jsonBtn.onclick = () => {
                try {
                    const raw = currentJSON();
                    const panel = el("textarea", fieldCss + "flex:1;min-height:0;resize:none;font-family:Consolas,monospace;");
                    panel.value = raw;
                    const dialog = el("div", "position:absolute;inset:40px 10px 10px;background:#171b22;border:1px solid #64758c;border-radius:6px;padding:9px;display:flex;flex-direction:column;gap:7px;z-index:20;box-sizing:border-box;");
                    const close = el("button", buttonCss, "閉じる");
                    close.onclick = () => dialog.remove();
                    dialog.append(label("現在の分類JSON（コピー用・読み取り専用）"), panel, close);
                    panel.readOnly = true;
                    root.appendChild(dialog);
                    root.style.position = "relative";
                } catch (err) { alert(err.message); }
            };
            save.onclick = async () => {
                let content;
                try {
                    if (data?.tags.some(t => !t.text.trim())) throw Error("空欄のタグがあります。修正または削除してください");
                    const missing = sourceCoverage();
                    if (missing.startsWith("元タグの未保持") && !confirm(`${missing}\nこのまま保存しますか？`)) return;
                    content = currentJSON();
                } catch (err) { alert(err.message); return; }
                let filename = prompt("charactersフォルダへ保存するファイル名", "anima_character.json");
                if (!filename?.trim()) return;
                filename = filename.trim();
                if (!filename.toLowerCase().endsWith(".json")) filename += ".json";
                try {
                    const response = await api.fetchApi("/anima/save_character", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, content }) });
                    const result = await response.json();
                    if (!response.ok || !result.success) throw Error(result.error || `HTTP ${response.status}`);
                    dirty = false;
                    render();
                    alert(`保存完了: ${result.filename}\nStackerのプリセット一覧に表示されない場合はノードを再作成してください。`);
                } catch (err) { alert(`保存失敗: ${err.message}`); }
            };
            root.append(tabs, pages.input, pages.review, pages.llm);
            const panel = node.addDOMWidget("extractor_panel", "custom", root, { serialize: false, hideOnZoom: false, getHeight: () => Math.max(400, (node.size?.[1] || 650) - 95) });
            panel.computeSize = width => [width || 640, Math.max(400, (node.size?.[1] || 650) - 95)];
            node.resultWidget = { get value() { return data ? currentJSON() : ""; }, set value(value) { try { loadData(value, true); } catch (err) { notice.textContent = `分類結果の解析に失敗: ${err.message}`; } } };
            const previousResize = node.onResize;
            node.onResize = function (size) {
                previousResize?.apply(this, arguments);
                this.size[0] = Math.max(580, this.size[0]);
                this.size[1] = Math.max(540, this.size[1]);
                root.style.height = `${Math.max(400, this.size[1] - 95)}px`;
                root.style.width = "100%";
            };
            switchTab("input");
            render();
            node.setSize([640, 680]);
            node.onResize(node.size);
        };
        const previousExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            previousExecuted?.apply(this, arguments);
            if (message?.formatted_text?.[0] !== undefined && this.resultWidget) this.resultWidget.value = message.formatted_text[0];
        };
    }
});
