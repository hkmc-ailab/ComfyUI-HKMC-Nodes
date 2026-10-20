import { app } from "../../scripts/app.js";

const COMMON_OPTIONS = [
    { cat: "🎥 カメラの動き", id: "c1", label: "完全固定 (Static)", eng: "Keep the camera completely static, observing the subject." },
    { cat: "🎥 カメラの動き", id: "c2", label: "微細な手持ちの揺らぎ", eng: "Introduce a very slight, natural handheld camera shake to add intimacy." },
    { cat: "🎥 カメラの動き", id: "c3", label: "激しい手持ちシェイク", eng: "Introduce heavy, chaotic handheld camera shake for intense energy." },
    { cat: "🎥 カメラの動き", id: "c4", label: "極めてゆっくりな引き", eng: "Use an extremely slow pull-out or subtle tracking motion." },
    { cat: "🎥 カメラの動き", id: "c5", label: "前進トラッキング (Dolly In)", eng: "Use smooth dolly-in or forward tracking movements toward the subject." },
    { cat: "🎥 カメラの動き", id: "c6", label: "後退トラッキング (Dolly Out)", eng: "Use a steady backward tracking shot, maintaining distance as the subject moves." },
    { cat: "🎥 カメラの動き", id: "c7", label: "並走トラッキング", eng: "Track smoothly alongside the subject." },
    { cat: "🎥 カメラの動き", id: "c8", label: "緩やかなパン (Gentle Pan)", eng: "Use a slow, gentle horizontal pan." },
    { cat: "🎥 カメラの動き", id: "c9", label: "高速パン / ウィップパン", eng: "Execute a blurry whip pan into or out of the shot." },
    { cat: "🎥 カメラの動き", id: "c10", label: "ゆっくりなティルトアップ", eng: "Use a slow tilt-up camera movement." },
    { cat: "🎥 カメラの動き", id: "c11", label: "ゆっくりなティルトダウン", eng: "Use a slow tilt-down camera movement." },
    { cat: "🎥 カメラの動き", id: "c12", label: "緩やかな回り込み (Arc)", eng: "Use a smooth, gentle arc shot moving semi-circularly around the subject." },
    { cat: "🎥 カメラの動き", id: "c13", label: "360度高速旋回 (Rapid Orbit)", eng: "Use rapid, dynamic 360-degree orbit camera movements around the subject." },
    { cat: "🎥 カメラの動き", id: "c14", label: "スナップズーム / 急接近", eng: "Use violent snap zooms or rapid dolly push-ins directly towards the subject." },
    { cat: "🎥 カメラの動き", id: "c15", label: "傾斜・ダッチアングル", eng: "Use aggressive Dutch angles and dynamic tilted tracking." },
    { cat: "🎥 カメラの動き", id: "c16", label: "ゆっくりなクレーンアップ", eng: "Elevate the camera slowly, revealing more of the environment." },
    { cat: "🎥 カメラの動き", id: "c17", label: "ゆっくりなクレーンダウン", eng: "Lower the camera smoothly to build grounded tension." },
    { cat: "🎥 カメラの動き", id: "c18", label: "下からの突き上げ (Pedestal)", eng: "Shoot up aggressively from ground level in a rapid pedestal move." },
    { cat: "🎥 カメラの動き", id: "c19", label: "ドローン飛行 (Drone Flight)", eng: "Use sweeping, dynamic drone-like aerial camera movements." },
    { cat: "🎥 カメラの動き", id: "c20", label: "肩越し / 背後追従", eng: "Follow closely from right behind the subject's shoulder." },

    { cat: "🎞 ショットサイズ・アングル", id: "s1", label: "瞳/顔の特写 (Extreme CU)", eng: "Focus on an extreme close-up of the subject's eyes, lips, or subtle facial expressions." },
    { cat: "🎞 ショットサイズ・アングル", id: "s2", label: "手元/小物の特写 (Macro)", eng: "Focus tightly on the subject's fingertips, hands, or a small prop." },
    { cat: "🎞 ショットサイズ・アングル", id: "s3", label: "顔アップ (Close-up)", eng: "Frame a standard close-up focusing primarily on the subject's face." },
    { cat: "🎞 ショットサイズ・アングル", id: "s4", label: "バストアップ (Medium CU)", eng: "Maintain standard medium close-ups (bust shots) for clear performance visibility." },
    { cat: "🎞 ショットサイズ・アングル", id: "s5", label: "ウエストショット (Medium)", eng: "Use medium waist shots to show hand gestures and body rhythm clearly." },
    { cat: "🎞 ショットサイズ・アングル", id: "s6", label: "ニーショット (Medium Full)", eng: "Use knee-level framing to capture leg movement and overall posture." },
    { cat: "🎞 ショットサイズ・アングル", id: "s7", label: "フルショット (Full Body)", eng: "Frame the subject entirely head-to-toe within the environment." },
    { cat: "🎞 ショットサイズ・アングル", id: "s8", label: "超引き (Extreme Wide)", eng: "Use an extreme wide shot to emphasize loneliness, vastness, and negative space around the subject." },
    { cat: "🎞 ショットサイズ・アングル", id: "s_ang1", label: "上から (High Angle)", eng: "Frame the subject from a distinct high angle, looking down from above." },
    { cat: "🎞 ショットサイズ・アングル", id: "s_ang2", label: "下から (Low Angle)", eng: "Frame the subject from a powerful low angle, looking upward from ground level." },
    { cat: "🎞 ショットサイズ・アングル", id: "s_ang3", label: "横から (Side Profile)", eng: "Capture the subject strictly in profile from the side." },
    { cat: "🎞 ショットサイズ・アングル", id: "s_ang4", label: "傾斜 (Dutch Angle)", eng: "Use a tilted Dutch angle framing to create psychological tension and dynamic perspective." },
    { cat: "🎞 ショットサイズ・アングル", id: "s9", label: "全身⇔顔の激しい切替", eng: "Alternate dramatically between wide full-body shots and intense extreme close-ups." },
    { cat: "🎞 ショットサイズ・アングル", id: "s10", label: "超広角 / 魚眼レンズ", eng: "Use an ultra-wide angle or fisheye lens effect to distort perspective and emphasize aggressive forward motion." },
    { cat: "🎞 ショットサイズ・アングル", id: "s11", label: "望遠レンズ / 圧縮効果", eng: "Use a telephoto lens to compress the background and isolate the subject." },
    { cat: "🎞 ショットサイズ・アングル", id: "s12", label: "浅い被写界深度 (ボケ)", eng: "Use a very shallow depth of field, heavily blurring the background to isolate the subject." },

    { cat: "👤 キャラクターの演技", id: "a1", label: "佇む / 遠くを見つめる", eng: "The subject looks away, standing still with a quiet, contemplative presence." },
    { cat: "👤 キャラクターの演技", id: "a2", label: "カメラに視線を向ける", eng: "The subject holds strong, confident eye contact with the camera lens." },
    { cat: "👤 キャラクターの演技", id: "a3", label: "目を閉じる / うつむく", eng: "The subject gently closes their eyes or looks down slightly, expressing melancholy." },
    { cat: "👤 キャラクターの演技", id: "a4", label: "静かに歌う / 語りかける", eng: "The subject sings quietly or speaks softly with minimal, restrained body movement." },
    { cat: "👤 キャラクターの演技", id: "a5", label: "リズムに乗る / ステップ", eng: "The subject steps or sways naturally to the rhythm." },
    { cat: "👤 キャラクターの演技", id: "a6", label: "感情を込めた身振り", eng: "The subject uses expressive hand gestures while performing." },
    { cat: "👤 キャラクターの演技", id: "a7", label: "歩き出す / 前進する", eng: "The subject begins to walk forward purposefully while performing." },
    { cat: "👤 キャラクターの演技", id: "a8", label: "走り出す / 疾走", eng: "The subject breaks into a full, desperate sprint." },
    { cat: "👤 キャラクターの演技", id: "a9", label: "振り返る", eng: "The subject gracefully turns their head or body to look back over their shoulder." },
    { cat: "👤 キャラクターの演技", id: "a10", label: "軽くターンする", eng: "The subject performs a light, elegant spin or turn." },
    { cat: "👤 キャラクターの演技", id: "a11", label: "空を仰ぐ / 手を伸ばす", eng: "The subject looks up to the sky or reaches out a hand gently." },
    { cat: "👤 キャラクターの演技", id: "a12", label: "地面に座る / しゃがむ", eng: "The subject sits gracefully on the ground or crouches, looking vulnerable." },
    { cat: "👤 キャラクターの演技", id: "a13", label: "シャウト / 大きなアクション", eng: "The subject shouts, jumps, or performs with explosive full-body energy." },
    { cat: "👤 キャラクターの演技", id: "a14", label: "カメラに向かって挑発/掴む", eng: "The subject leans aggressively into the lens, pointing, taunting, or reaching to grab the camera." },
    { cat: "👤 キャラクターの演技", id: "a15", label: "髪や衣装が激しく舞う", eng: "Hair and clothing whip around dynamically due to intense movement or heavy wind." },
    { cat: "👤 キャラクターの演技", id: "a16", label: "飛び跳ねる / 跳躍", eng: "The subject leaps into the air with intense momentum." },
    { cat: "👤 キャラクターの演技", id: "a17", label: "膝をつく / のけぞる", eng: "The subject drops to their knees or throws their head back passionately." },
    { cat: "👤 キャラクターの演技", id: "a18", label: "自然と一体化 / 風を感じる", eng: "The subject stands relaxed, letting the wind move their hair and clothes softly as if merging with nature." },

    { cat: "✨ 照明・空間・天候", id: "l1", label: "単一ピンスポット", eng: "Use minimalist lighting, such as a single dramatic pin spot illuminating the subject from above." },
    { cat: "✨ 照明・空間・天候", id: "l2", label: "深い影 / シルエット", eng: "Use deep chiaroscuro shadows and a dark, moody ambient atmosphere, heavily silhouetting the subject." },
    { cat: "✨ 照明・空間・天候", id: "l3", label: "緩やかな明滅 (Pulse)", eng: "Stage or ambient lighting pulses gently in time with the beat." },
    { cat: "✨ 照明・空間・天候", id: "l4", label: "ストロボ激点滅", eng: "Use aggressive, fast-paced strobe lights flashing intensely." },
    { cat: "✨ 照明・空間・天候", id: "l5", label: "朝靄 / 柔らかい自然光", eng: "Use soft natural lighting, morning mist, or gentle sun rays filtering through." },
    { cat: "✨ 照明・空間・天候", id: "l6", label: "夕暮れの逆光 / マジックアワー", eng: "Bathe the scene in warm, melancholic golden hour backlighting with soft flares." },
    { cat: "✨ 照明・空間・天候", id: "l7", label: "冷たい月明かり / 夜", eng: "Illuminate the scene with a cold, ethereal blue moonlight." },
    { cat: "✨ 照明・空間・天候", id: "l8", label: "ネオンや街灯の反射", eng: "Incorporate the colorful reflections of neon signs or streetlights on wet surfaces." },
    { cat: "✨ 照明・空間・天候", id: "l9", label: "柔らかな逆光フレア", eng: "Use soft backlight flares to enhance cinematic depth and emotion." },
    { cat: "✨ 照明・空間・天候", id: "l10", label: "強烈なレンズフレアと閃光", eng: "Flood the scene with blinding lens flares, explosive sparks, or intense flashes of light." },
    { cat: "✨ 照明・空間・天候", id: "l11", label: "レーザー照明の乱舞", eng: "Fill the environment with chaotic, sweeping concert laser lights." },
    { cat: "✨ 照明・空間・天候", id: "l12", label: "スモーク / フォグ", eng: "Introduce a layer of atmospheric smoke or fog to separate subject from background." },
    { cat: "✨ 照明・空間・天候", id: "l13", label: "CO2大噴射 / ライブ特効", eng: "Trigger massive smoke plumes, CO2 jets, and crossing light beams." },
    { cat: "✨ 照明・空間・天候", id: "l14", label: "火花 / 炎 (Pyrotechnics)", eng: "Use pyrotechnics, bursting sparks, or background flames." },
    { cat: "✨ 照明・空間・天候", id: "l15", label: "穏やかな風 / 舞う落ち葉", eng: "A gentle breeze blows through, carrying falling leaves or dust motes." },
    { cat: "✨ 照明・空間・天候", id: "l16", label: "激しい風 / 荒れる環境", eng: "A heavy, chaotic wind whips through the environment." },
    { cat: "✨ 照明・空間・天候", id: "l17", label: "静かな雨 / 水滴", eng: "A quiet, gentle rain falls, with water droplets visible." },
    { cat: "✨ 照明・空間・天候", id: "l18", label: "激しい雨 / 水しぶき", eng: "Soak the scene in torrential rain or explosive water splashes." },
    { cat: "✨ 照明・空間・天候", id: "l19", label: "雪が舞う", eng: "Soft, cinematic snow falls gently across the scene." },
    { cat: "✨ 照明・空間・天候", id: "l20", label: "動く影 (Moving Shadows)", eng: "Cast moving environmental shadows across the scene to imply off-screen motion." }
];

const DIRECTIVE_OPTIONS = {
    low: COMMON_OPTIONS,
    mid: COMMON_OPTIONS,
    high: COMMON_OPTIONS,
    transition: COMMON_OPTIONS
};

app.registerExtension({
    name: "MiniMax.H3DesignDirector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "H3DesignDirector") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                const node = this;

                const jsonWidget = node.widgets.find(w => w.name === "design_data_json");
                if (jsonWidget) {
                    if (jsonWidget.inputEl) jsonWidget.inputEl.style.display = "none";
                    jsonWidget.draw = function () {};
                    jsonWidget.computeSize = () => [0, -4];
                }

                let selectedData = { low: [], mid: [], high: [], transition: [] };
                const loadSelectionFromWidget = () => {
                    try {
                        let parsed = JSON.parse(jsonWidget?.value || '{}');
                        selectedData = {
                            low: Array.isArray(parsed.low) ? parsed.low : [],
                            mid: Array.isArray(parsed.mid) ? parsed.mid : [],
                            high: Array.isArray(parsed.high) ? parsed.high : [],
                            transition: Array.isArray(parsed.transition) ? parsed.transition : []
                        };
                    } catch(e) {
                        selectedData = { low: [], mid: [], high: [], transition: [] };
                    }
                };
                loadSelectionFromWidget();

                const saveSelection = () => {
                    if (jsonWidget) {
                        jsonWidget.value = JSON.stringify(selectedData);
                        if (jsonWidget.callback) jsonWidget.callback(jsonWidget.value);
                    }
                };

                const root = document.createElement("div");
                root.className = "h3-studio-container";
                root.style.cssText = "background:#0b0c10; border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:10px; height:100%; box-sizing:border-box;";

                const tabBar = document.createElement("div");
                tabBar.style.cssText = "display:flex; background:#181a20; border-radius:6px; padding:4px;";
                
                const tabs = [
                    { id: "low", label: "🔵 Low時" },
                    { id: "mid", label: "🟡 Middle時" },
                    { id: "high", label: "🔴 High時" },
                    { id: "transition", label: "🔀 展開時" }
                ];
                
                const contentArea = document.createElement("div");
                contentArea.style.cssText = "flex:1; overflow-y:auto; padding-right:4px;";
                contentArea.classList.add("h3-clip-results-container");

                let activeTab = "low";
                const tabBtns = {};

                const renderOptions = () => {
                    contentArea.replaceChildren();
                    const options = DIRECTIVE_OPTIONS[activeTab];
                    
                    const categories = {};
                    options.forEach(opt => {
                        if (!categories[opt.cat]) categories[opt.cat] = [];
                        categories[opt.cat].push(opt);
                    });

                    Object.keys(categories).forEach(cat => {
                        const block = document.createElement("div");
                        block.style.cssText = "margin-bottom:12px; background:#13151a; border:1px solid #2a2d35; border-radius:6px; padding:8px;";
                        
                        const title = document.createElement("div");
                        title.textContent = cat;
                        title.style.cssText = "font-size:11px; font-weight:bold; color:#8b949e; margin-bottom:6px;";
                        block.appendChild(title);

                        const grid = document.createElement("div");
                        grid.style.cssText = "display:flex; flex-wrap:wrap; gap:6px;";

                        categories[cat].forEach(opt => {
                            const isChecked = selectedData[activeTab].includes(opt.eng);
                            const chip = document.createElement("div");
                            chip.className = `h3-toggle-chip ${isChecked ? "active" : ""}`;
                            chip.style.cssText = `flex: 1 1 calc(50% - 6px); padding:6px 8px; font-size:10px; border-radius:6px; cursor:pointer; user-select:none; border:1px solid #383838; background:${isChecked ? '#007acc' : '#202020'}; color:${isChecked ? '#fff' : '#dbe0e6'}; text-align:center; transition:all 0.1s;`;
                            chip.textContent = opt.label;
                            
                            chip.onclick = () => {
                                if (selectedData[activeTab].includes(opt.eng)) {
                                    selectedData[activeTab] = selectedData[activeTab].filter(e => e !== opt.eng);
                                    chip.style.background = "#202020"; chip.style.color = "#dbe0e6";
                                } else {
                                    selectedData[activeTab].push(opt.eng);
                                    chip.style.background = "#007acc"; chip.style.color = "#fff";
                                }
                                saveSelection();
                            };
                            grid.appendChild(chip);
                        });
                        block.appendChild(grid);
                        contentArea.appendChild(block);
                    });
                };

                tabs.forEach(t => {
                    const btn = document.createElement("div");
                    btn.textContent = t.label;
                    btn.style.cssText = `flex:1; text-align:center; padding:6px 0; font-size:11px; font-weight:bold; cursor:pointer; border-radius:4px; color:${t.id === activeTab ? '#fff' : '#666'}; background:${t.id === activeTab ? '#2c2f36' : 'transparent'};`;
                    btn.onclick = () => {
                        activeTab = t.id;
                        Object.values(tabBtns).forEach(b => { b.style.background = 'transparent'; b.style.color = '#666'; });
                        btn.style.background = '#2c2f36'; btn.style.color = '#fff';
                        renderOptions();
                    };
                    tabBtns[t.id] = btn;
                    tabBar.appendChild(btn);
                });

                root.append(tabBar, contentArea);
                
                if (node.addDOMWidget) {
                    node.addDOMWidget("design_director_ui", "custom", root, { serialize: false, hideOnZoom: false, getHeight: () => 560 });
                }
                node.setSize([400, 600]);

                const onConfigure = node.onConfigure;
                node.onConfigure = function () {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    loadSelectionFromWidget();
                    renderOptions();
                };

                renderOptions();
            };
        }
    }
});