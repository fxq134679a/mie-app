/* 气象功能（只在 A 模式）
   图层页来自 weather/corvus/（CC BY-NC-SA 4.0，原样使用）与 weather/mood/（MIT，原样使用）
   本文件只做：读设置 → 挂/摘透明图层 → 把要画的那一档告诉图层页 */
(function () {
    'use strict';

    const BASE = 'weather/';
    const LAYER_SRC = {
        fx: BASE + 'corvus/fx.html',
        sky: BASE + 'corvus/sky.html',
        caustic: BASE + 'corvus/caustic.html',
        glass: BASE + 'corvus/glass.html'
    };
    const LAYER_TYPE = { fx: 'weather-fx', sky: 'weather-sky', caustic: 'weather-caustic', glass: 'weather-glass' };
    const LOOK_SRC = { a: BASE + 'mood/mood-a.html', b: BASE + 'mood/mood-b.html', c: BASE + 'mood/mood-c.html' };

    const DEFAULTS = {
        on: false,
        source: 'emotion',          // emotion | real
        side: 'me',                 // me | char
        myCity: '',
        look: 'none',               // none | a | b | c
        bg: '',                     // 自己上传的背景照片（dataURL）
        intensity: 60,
        layers: { fx: true, sky: false, caustic: false, glass: false },
        calmLook: 'calm',
        calmTint: 'none',
        emotions: null
    };

    // 天气档：两套仓库能画的样子全列进来，情绪表按档挑
    const LOOK_OPTS = [
        ['calm', '放晴', { mood: 'clear', fx: null, sky: 'clear' }],
        ['sunrain', '太阳雨', { mood: 'rain', fx: 'rain-streak', sky: 'clear' }],
        ['rain', '落雨', { mood: 'rain', fx: 'rain-streak', sky: 'cloudy' }],
        ['drizzle', '细雨', { mood: 'rain', fx: 'soft-fog', sky: 'cloudy' }],
        ['storm', '雷暴', { mood: 'storm', fx: null, sky: 'storm' }],
        ['hail', '冰雹', { mood: 'hail', fx: 'rain-streak', sky: 'storm' }],
        ['snow', '落雪', { mood: 'snow', fx: 'soft-snow', sky: 'cloudy' }],
        ['sleet', '雨夹雪', { mood: 'snow', fx: 'slant-snow', sky: 'cloudy' }],
        ['fog', '起雾', { mood: 'clear', fx: 'soft-fog', sky: 'fog' }],
        ['overcast', '阴天', { mood: 'clear', fx: null, sky: 'cloudy' }],
        ['rainbow', '彩虹', { mood: 'rainbow', fx: null, sky: 'rainbow' }],
        ['night', '夜里', { mood: 'clear', fx: null, sky: 'none' }]
    ];
    const LOOK = Object.fromEntries(LOOK_OPTS.map(l => [l[0], l[2]]));

    // 配色只加在背景层上，粒子保持原色，免得整屏每帧做滤镜
    const TINT_OPTS = [
        ['none', '原色', 'none'],
        ['warm', '暖', 'sepia(.22) saturate(1.25) hue-rotate(-10deg)'],
        ['cool', '冷', 'saturate(.85) hue-rotate(10deg) brightness(.96)'],
        ['pink', '粉', 'saturate(1.3) hue-rotate(-28deg) brightness(1.05)'],
        ['grey', '灰', 'saturate(.35) brightness(.9)'],
        ['night', '夜', 'brightness(.7) saturate(.8) hue-rotate(20deg)'],
        ['gold', '金', 'sepia(.4) saturate(1.35) brightness(1.06)'],
        ['green', '青', 'hue-rotate(38deg) saturate(1.1)']
    ];
    const TINT = Object.fromEntries(TINT_OPTS.map(t => [t[0], t[2]]));

    // 默认情绪表：前 5 条沿用情绪黑箱原有的类别，后面是可以自己加的
    const DEFAULT_EMOTIONS = [
        { key: 'lust', name: '欲望', halflife: 24, desc: '没被满足的亲近和占有欲、被打断的兴致、攒着没发出来的冲动', look: 'drizzle', tint: 'warm' },
        { key: 'irritation', name: '燥火', halflife: 12, desc: '被敷衍、被顶嘴、看{user}熬夜空腹不吃东西、被{user}惹毛的火气', look: 'storm', tint: 'night' },
        { key: 'sullen', name: '憋闷', halflife: 72, desc: '{user}冷淡划界限、拿你当工具人、没挑明但堵在胸口的闷气', look: 'fog', tint: 'grey' },
        { key: 'jealousy', name: '嫉妒', halflife: 36, desc: '{user}提别人太多、注意力从你身上移开、领地被冒犯', look: 'hail', tint: 'cool' },
        { key: 'neglect', name: '冷落', halflife: 48, desc: '{user}消失太久、不回你、把你晾着', look: 'snow', tint: 'night' },
        { key: 'anger', name: '生气', halflife: 12, desc: '当面顶撞、被否定、说了不听', look: 'storm', tint: 'none' },
        { key: 'grievance', name: '委屈', halflife: 48, desc: '没做错却被怪、被凶、好心当成驴肝肺', look: 'rain', tint: 'grey' },
        { key: 'shy', name: '害羞', halflife: 6, desc: '被夸、被看穿、被说了暧昧的话', look: 'fog', tint: 'pink' },
        { key: 'flutter', name: '心动', halflife: 12, desc: '突然被撩到、想起对方的好、心里发痒', look: 'rainbow', tint: 'pink' },
        { key: 'miss', name: '思念', halflife: 72, desc: '好久没见、想对方在想自己做什么', look: 'fog', tint: 'cool' },
        { key: 'anxiety', name: '焦虑', halflife: 12, desc: '事情没落定、怕出错、反复确认', look: 'hail', tint: 'cool' },
        { key: 'tired', name: '疲惫', halflife: 24, desc: '熬夜、忙太久、被反复消耗', look: 'overcast', tint: 'grey' },
        { key: 'resigned', name: '无奈', halflife: 24, desc: '说了也没用、只能顺着、懒得争', look: 'drizzle', tint: 'grey' },
        { key: 'coquettish', name: '撒娇', halflife: 6, desc: '讨抱讨陪、故意黏人、要哄', look: 'sunrain', tint: 'pink' },
        { key: 'relief', name: '安心', halflife: 72, desc: '被接住、确认了没被丢下', look: 'calm', tint: 'gold' },
        { key: 'release', name: '释怀', halflife: 72, desc: '想通了、翻篇了、不再计较', look: 'sunrain', tint: 'gold' },
        { key: 'fear', name: '恐惧', halflife: 12, desc: '怕失去、被吓到、听到坏消息', look: 'sleet', tint: 'night' }
    ];

    const CALM_FLOOR = 20;   // 数值低于这档就按平静算

    function emotions() {
        const p = prefs();
        if (!Array.isArray(p.emotions) || !p.emotions.length) {
            p.emotions = DEFAULT_EMOTIONS.map(e => Object.assign({}, e));
        }
        const out = p.emotions.filter(e => e && e.key && e.name);
        // 就地补齐，不换新对象：改名字时拿到的引用必须还是库里那一个
        out.forEach(e => {
            if (typeof e.desc !== 'string') e.desc = '';
            if (!(Number(e.halflife) > 0)) e.halflife = 24;
            if (!LOOK[e.look]) e.look = 'calm';
            if (!TINT[e.tint]) e.tint = 'none';
        });
        p.emotions = out;
        return out;
    }

    // 交给情绪黑箱当类别表用：重名重码和坏半衰期在这里挡掉，免得 createConfig 抛错
    function slots() {
        const out = [], seen = {};
        emotions().forEach(e => {
            const key = String(e.key || '').trim(), name = String(e.name || '').trim();
            if (!key || !name || seen[key] || seen[name]) return;
            seen[key] = seen[name] = true;
            out.push({ key: key, name: name, halflife: Math.max(1, Number(e.halflife) || 24), desc: String(e.desc || '') });
        });
        return out;
    }

    function emotionNote() {
        return emotions().length > 5 ? '类别里也有会往上涨的心情，和负面那几类一样记、一样写标签。' : '';
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function prefs() {
        const raw = (typeof db !== 'undefined' && db.weatherFx) || {};
        const p = Object.assign({}, DEFAULTS, raw);
        p.layers = Object.assign({}, DEFAULTS.layers, raw.layers || {});
        db.weatherFx = p;
        return p;
    }

    const NO_CHAT = { on: null, city: '' };

    function chatWeather(chat) {
        if (!chat) return NO_CHAT;
        if (!chat.weatherFx || typeof chat.weatherFx !== 'object') chat.weatherFx = { on: null, city: '' };
        return chat.weatherFx;
    }

    function currentChat() {
        if (typeof currentChatId === 'undefined' || !currentChatId) return null;
        if (typeof currentChatType !== 'undefined' && currentChatType === 'group') {
            return (db.groups || []).find(g => g.id === currentChatId) || null;
        }
        return (db.characters || []).find(c => c.id === currentChatId) || null;
    }

    const isAMode = () => document.body.classList.contains('a-mode');
    // 聊天界面没顶在前面时（设置页、其他界面把 #a-app 收走了），连量矩形都不用做
    const appShown = () => {
        const a = document.getElementById('a-app');
        return !!(a && a.classList.contains('on'));
    };

    // ── 图层挂载 ──
    const frames = {};
    const ready = {};

    function ensureStyle() {
        if (document.getElementById('a-weather-style')) return;
        const s = document.createElement('style');
        s.id = 'a-weather-style';
        s.textContent = `
#a-weather,#a-weather-look{position:fixed;inset:0;width:100%;height:100%;border:0;pointer-events:none;display:none;}
#a-weather-look{z-index:0;}
#a-weather{z-index:1410;}
body.aw-look #a-app{background:transparent;}
.aw-emo .kkt-item-label{display:flex;gap:8px;align-items:center;flex:1;min-width:0;}
.aw-emo .aw-emo-name{width:60px;flex:none;border:none;background:transparent;font:inherit;color:inherit;text-align:left;padding:0;}
.aw-emo .aw-emo-desc{flex:1;min-width:0;border:none;background:transparent;font:inherit;color:inherit;opacity:.5;text-align:left;padding:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aw-emo .kkt-item-control{flex:none;}.aw-emo .kkt-item-control select{max-width:76px;border:none;background:transparent;font:inherit;font-size:12px;color:inherit;}.aw-emo .kkt-item-control select:focus{outline:none;}
.aw-emo-del{border:none;background:transparent;color:inherit;opacity:.45;font-size:14px;cursor:pointer;padding:0 2px;}
.aw-emo-btn,.aw-bg-btn{border:none;background:transparent;color:inherit;font-size:12px;cursor:pointer;padding:0 4px;opacity:.7;}
#aw-bg-thumb{width:26px;height:26px;border-radius:6px;object-fit:cover;display:none;}
.a-weather-group.folded .aw-body{display:none;}
.a-weather-group.folded #aw-head{border-bottom:none;}
.a-weather-group #aw-head{cursor:pointer;}
.a-weather-group #aw-head .kkt-arrow{display:inline-block;transition:transform .18s;}
.a-weather-group:not(.folded) #aw-head .kkt-arrow{transform:rotate(90deg);}
#a-weather-emo-group.folded .aw-emo{display:none;}
body.aw-look #a-app .a-gu,body.aw-look #a-app .a-nb-me{color:#f4f4f2;}
body.aw-look #a-app .a-who,body.aw-look #a-app .a-time,body.aw-look #a-app .a-sys{color:rgba(244,244,242,.62);}
body.aw-look #a-app .a-bubble{color:#2b2a27;}
`;
        document.head.appendChild(s);
    }

    // 图层挂在 A 外壳里面：设置页/其他界面顶掉 #a-app 时，天气跟着一起不见，不会盖住面板
    function hostParent() {
        return document.getElementById('a-app') || document.body;
    }

    function place(id, beforeBg) {
        const host = hostParent(), el = document.getElementById(id);
        if (!el) return null;
        if (el.parentNode === host) return el;
        if (beforeBg) {
            const bg = document.getElementById('a-bgimg');
            host.insertBefore(el, bg && bg.parentNode === host ? bg.nextSibling : host.firstChild);
        } else host.appendChild(el);
        return el;
    }

    function buildHosts() {
        ensureStyle();
        if (!document.getElementById('a-weather-look')) {
            const look = document.createElement('iframe');
            look.id = 'a-weather-look';
            look.setAttribute('aria-hidden', 'true');
            look.addEventListener('load', () => { dressLookFrame(look); applyPlan(lastPlan); });
            document.body.appendChild(look);
        }
        if (!document.getElementById('a-weather')) {
            const box = document.createElement('div');
            box.id = 'a-weather';
            document.body.appendChild(box);
        }
        // 外壳可能比这两个节点晚一步建好，每次同步时把它们挪进去
        place('a-weather-look', true);
        place('a-weather', false);
    }

    function layerFrame(key) {
        const box = document.getElementById('a-weather');
        if (!box) return null;
        let f = frames[key];
        if (f && f.isConnected) return f;
        f = document.createElement('iframe');
        f.className = 'a-weather-layer';
        f.setAttribute('aria-hidden', 'true');
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;';
        f.src = LAYER_SRC[key];
        ready[key] = false;
        bubLast = '';        // 新帧什么都还不知道，矩形必须重推一遍
        // 就绪信息可能比 load 还早到（fx.html 只在收到第一条消息后停止重报），
        // 所以监听挂在父页 window 上、按 source 认帧，建帧的那一刻就开始收。
        window.addEventListener('message', ev => {
            if (ev.source !== f.contentWindow) return;
            if (ev.data && ev.data.type === LAYER_TYPE[key] + '-ready') {
                ready[key] = true;
                applyPlan(lastPlan);
            }
        });
        box.appendChild(f);
        frames[key] = f;
        f.addEventListener('load', () => {
            watchContext(key, f);
            // 报到信息万一丢了（页面被冻住、加载卡顿），4 秒后当作就绪补推一版，别把图层晾着
            setTimeout(() => { if (!ready[key]) { ready[key] = true; applyPlan(lastPlan); } }, 4000);
        });
        return f;
    }

    // ── 显卡把 WebGL 上下文收走了（切后台、驱动重置、显存不够）：图层会僵成一张死图。
    //    上游页面自己不认这个事件，所以由宿主悄悄把这个图层重挂一次，坏太多次就收手。
    const glFix = {};

    function watchContext(key, f) {
        let d = null;
        try { d = f.contentDocument; } catch (e) { return; }
        if (!d) return;
        Array.prototype.forEach.call(d.querySelectorAll('canvas'), cv => {
            if (cv.__awGl) return;
            cv.__awGl = true;
            cv.addEventListener('webglcontextlost', () => reloadLayer(key));
        });
    }

    function reloadLayer(key) {
        const f = frames[key];
        if (!f) return;
        const now = Date.now();
        const s = glFix[key] || (glFix[key] = { at: 0, n: 0 });
        if (now - s.at > 60000) s.n = 0;        // 只有一分钟内连着坏才算修不好
        s.at = now;
        if (++s.n > 3) return;
        ready[key] = false;
        bubLast = '';
        f.__awBg = null;          // 重挂后这张图就没了，照片要重新推一遍
        f.src = LAYER_SRC[key] + '?r=' + now;
    }

    function send(key, op, value) {
        const f = frames[key];
        if (!f || !f.contentWindow) return;
        try {
            f.contentWindow.postMessage({ type: LAYER_TYPE[key], op: op, value: value }, '*');
        } catch (e) { /* 忽略 */ }
    }

    const HIDE_CSS = 'main.stage,#dock,.top-bar,.intensity,.lens-hint,#motion-btn,#prism-btn,#lens-canvas,#bg-file{display:none!important}';

    // 背景页自带的演示界面在图层里不该出现；强度滑杆由外部推动
    function dressLookFrame(f) {
        if (!f) return;
        try {
            const d = f.contentDocument;
            if (!d) return;
            if (!d.getElementById('mie-weather-hide')) {
                const s = d.createElement('style');
                s.id = 'mie-weather-hide';
                s.textContent = HIDE_CSS;
                (d.head || d.documentElement).appendChild(s);
            }
        } catch (e) { /* 跨域时跳过 */ }
    }

    function setLookIntensity(f, v) {
        if (!f) return;
        try {
            const s = f.contentDocument && f.contentDocument.getElementById('slider');
            if (!s) return;
            s.value = v;
            s.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { /* 跨域时跳过 */ }
    }

    function lookFrame() {
        const f = document.getElementById('a-weather-look');
        if (!f) return null;
        const src = LOOK_SRC[prefs().look];
        if (!src) { f.style.display = 'none'; f.__awBg = null; f.src = 'about:blank'; return null; }
        if (!f.dataset.loaded || f.dataset.loaded !== src) {
            f.dataset.loaded = src;
            f.__awBg = null;      // 页面一重挂，自己上传的那张就没了，必须重推
            f.src = src;
        }
        f.style.display = 'block';
        dressLookFrame(f);
        return f;
    }

    // 自己上传的照片：琉璃页有换图接口、雨滴玻璃有换图接口，山谷/流光没有就继续用它自己的画面
    function pushLookBg(f) {
        if (!f) return;
        const bg = prefs().bg || '';
        if (!bg || f.__awBg === bg) return;
        try {
            if (typeof f.contentWindow.setBackground !== 'function') return;   // 还没加载完，下次同步再推
            f.contentWindow.setBackground(bg);
            f.__awBg = bg;
        } catch (e) { /* 跨域时跳过 */ }
    }

    // 换图/清图后让背景页重新挂载，回到它自带的那几张照片
    function reloadLook() {
        const f = document.getElementById('a-weather-look');
        if (!f) return;
        f.__awBg = null;
        if (!LOOK_SRC[prefs().look]) return;
        f.dataset.loaded = '';
        lookFrame();
    }

    // ── 气泡矩形桥：雨点砸到气泡上溅开、雪在气泡顶堆起来（推法照 corvus demo/chat.html）──
    // 只量有底色的东西：我的气泡、语音条、图片、输入框、正在输入；纯文字回复没有面儿，堆雪会飘在空中。
    const BUB_SEL = '#a-app .a-bubble, #a-app .a-voice, #a-app .a-imgs img, #a-app .a-composer, #a-app .a-typing';
    let bubTimer = null;
    let bubLast = '';

    function bubbleList() {
        const list = [];
        const vh = window.innerHeight || 0, vw = window.innerWidth || 0;
        document.querySelectorAll(BUB_SEL).forEach((el, i) => {
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 16) return;
            if (r.bottom < -60 || r.top > vh + 60 || r.right < 0 || r.left > vw) return;
            list.push({ i: 'b' + i, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
        });
        return list;
    }

    function pushBubbles() {
        const p = prefs();
        if (!isAMode() || !appShown() || !p.on || !p.layers.fx || !ready.fx) return;
        const list = bubbleList();
        const json = JSON.stringify(list);
        if (json === bubLast) return;   // 位置没动就不推
        bubLast = json;
        send('fx', 'setBubbles', list);
    }

    function startBubbles() {
        if (bubTimer) return;
        bubTimer = setInterval(pushBubbles, 350);
        document.addEventListener('scroll', pushBubbles, true);
        window.addEventListener('resize', pushBubbles);
        pushBubbles();
    }

    function stopBubbles() {
        if (!bubTimer) return;
        clearInterval(bubTimer);
        bubTimer = null;
        document.removeEventListener('scroll', pushBubbles, true);
        window.removeEventListener('resize', pushBubbles);
        bubLast = '';
        if (ready.fx) send('fx', 'setBubbles', []);
    }

    // ── 把一档天气推给各层 ──
    let lastPlan = null;

    function applyPlan(plan) {
        if (!plan) return;
        lastPlan = plan;
        const p = prefs();
        const box = document.getElementById('a-weather');
        if (box) box.style.display = p.on ? 'block' : 'none';

        const showLook = !!(p.on && p.look !== 'none' && plan.mood);
        document.body.classList.toggle('aw-look', showLook);
        const lf = showLook ? lookFrame() : null;
        const lookBox = document.getElementById('a-weather-look');
        if (!showLook && lookBox) lookBox.style.display = 'none';
        if (lf) lf.style.filter = TINT[plan.tint] || 'none';

        Object.keys(LAYER_SRC).forEach(key => {
            const on = !!p.on && !!p.layers[key];
            const f = on ? layerFrame(key) : frames[key];
            if (f) f.style.display = on ? 'block' : 'none';
            if (!on) { if (ready[key]) send(key, 'setPaused', true); return; }
            // 图层一收到消息就不再重报"我好了"，所以没报到之前一句都不发，
            // 等它自己报上来再由 applyPlan 补推这一档（重挂恢复也走这条）。
            if (!ready[key]) return;
            send(key, 'setPaused', false);
            if (key === 'fx') {
                if (plan.fx) {
                    send(key, 'setEffect', plan.fx);
                    send(key, 'setCount', plan.fxCount || p.intensity);
                    send(key, 'setSpeed', plan.fxSpeed || 1);
                    send(key, 'setOpacity', plan.fxOpacity == null ? 100 : plan.fxOpacity);
                    send(key, 'setFrost', !!plan.frost);
                    send(key, 'setSplash', !!plan.splash);
                    send(key, 'setAccumulate', !!plan.accumulate);
                }
            } else if (key === 'sky') {
                send(key, 'setState', plan.sky || 'none');
                send(key, 'setStrength', plan.skyStrength == null ? 60 : plan.skyStrength);
            } else if (key === 'caustic') {
                send(key, 'setPower', plan.caustic == null ? 90 : plan.caustic);
            } else if (key === 'glass') {
                send(key, 'start');
                if (p.bg && f && f.__awBg !== p.bg) { send(key, 'setBackground', p.bg); f.__awBg = p.bg; }
            }
        });

        if (lf) {
            try {
                if (typeof lf.contentWindow.setWeather === 'function') lf.contentWindow.setWeather(plan.mood);
            } catch (e) { /* 同源被限制时留给图层自己 */ }
            setLookIntensity(lf, p.intensity);
            pushLookBg(lf);
        }
    }

    // ── 该画哪一档：第 3、4 步接进来 ──
    function emotionPlan(chat) {
        const p = prefs();
        const calm = { look: p.calmLook || 'calm', tint: p.calmTint || 'none', value: 0, name: '' };
        if (!chat || !window.ChatBlackbox || !ChatBlackbox.enabled(chat)) return calm;
        let st = null;
        try { st = ChatBlackbox.stateFor(chat); } catch (e) { return calm; }
        if (!st || !Array.isArray(st.slots)) return calm;
        const table = {};
        emotions().forEach(e => { table[e.key] = e; });
        let best = null;
        st.slots.forEach(s => {
            const e = table[s.key];
            if (e && s.value >= CALM_FLOOR && (!best || s.value > best.value)) best = { e: e, value: s.value };
        });
        if (!best) return calm;
        return { look: best.e.look, tint: best.e.tint, value: best.value, name: best.e.name };
    }

    function planFor() {
        const p = prefs();
        const w = chatWeather(currentChat());
        const on = w && w.on != null ? w.on : p.on;
        if (!on) return { mood: null, fx: null, sky: 'none' };
        if (p.source === 'real') return realPlan();
        const em = emotionPlan(currentChat());
        const L = LOOK[em.look] || LOOK.calm;
        const dens = em.value ? 0.4 + 0.6 * Math.min(1, em.value / 100) : 1;
        return {
            mood: L.mood, fx: L.fx, sky: L.sky, tint: em.tint,
            fxCount: Math.round(p.intensity * dens),
            fxSpeed: em.value ? 0.8 + em.value / 100 : 1,
            splash: true, accumulate: true, emotion: em.name
        };
    }

    // ── 真实天气：wttr.in 读数 → 12 档里的哪一档（取数走 corvus 自带的 weather.js，不改它）──
    const REAL_LOOK = { clear: 'calm', cloudy: 'overcast', fog: 'fog', storm: 'storm', rain: 'rain', snow: 'snow' };
    const REAL_CACHE_KEY = 'mieWeatherReal';
    const REAL_TTL = 30 * 60 * 1000;
    let real = null;      // { city, reading, at, failed }
    let realBusy = false;
    let realTimer = null;

    function loadRealCache() {
        try {
            const c = JSON.parse(localStorage.getItem(REAL_CACHE_KEY) || 'null');
            if (c && c.reading && c.reading.kind) real = { city: String(c.city || ''), reading: c.reading, at: Number(c.at) || 0, failed: false };
        } catch (e) { real = null; }
    }

    function saveRealCache() {
        if (!real || !real.reading) return;
        try { localStorage.setItem(REAL_CACHE_KEY, JSON.stringify({ city: real.city, reading: real.reading, at: real.at })); } catch (e) { /* 存不下就算了 */ }
    }

    function realCity() {
        const p = prefs();
        return String(p.side === 'char' ? (chatWeather(currentChat()).city || '') : (p.myCity || '')).trim();
    }

    // 雨夹雪、大雪这些级别差，落到不同的档上
    function lookKey(r) {
        if (!r) return 'calm';
        if (r.kind === 'rain') return r.level >= 2 ? 'rain' : 'drizzle';
        if (r.kind === 'snow') return r.level >= 3 ? 'sleet' : 'snow';
        return REAL_LOOK[r.kind] || 'calm';
    }

    function refreshReal(force) {
        const p = prefs();
        if (!p.on || p.source !== 'real' || !window.WeatherFX || realBusy) return;
        const city = realCity();
        if (!force && real && real.city === city && Date.now() - real.at < REAL_TTL) return;
        if (navigator.onLine === false) {       // 断网时不敲门，接着用上一次读数，画面不跳
            paintReal(); applyPlan(planFor()); return;
        }
        realBusy = true;
        WeatherFX.fetchWeather(city).then(r => {
            if (r) {
                real = { city: city, reading: r, at: Date.now(), failed: false };
                saveRealCache();
            } else if (real && real.reading && real.city === city) {
                real.failed = true;   // 查不到就接着用上一次，画面不许跳
            } else {
                real = { city: city, reading: null, at: Date.now(), failed: true };
            }
        }).catch(() => {
            if (real) real.failed = true;
        }).then(() => {
            realBusy = false;
            paintReal();
            applyPlan(planFor());
        });
    }

    function realText(r) {
        if (!r) return '';
        const label = r.label || (window.WeatherFX ? WeatherFX.fallbackLabel(r.kind) : r.kind);
        return label + ' ' + r.temp + '℃';
    }

    function realPlan() {
        const p = prefs();
        const r = real && real.reading ? real.reading : null;
        const L = LOOK[lookKey(r)] || LOOK.calm;
        const dens = r ? (r.level >= 3 ? 1 : r.level === 2 ? 0.7 : 0.4) : 1;
        return {
            mood: L.mood, fx: L.fx, sky: L.sky, tint: 'none',
            fxCount: Math.round(p.intensity * dens),
            fxSpeed: 1, splash: true, accumulate: true,
            emotion: '', weather: realText(r)
        };
    }

    function paintReal() {
        const el = document.getElementById('aw-real-now');
        if (!el) return;
        if (!real) { el.textContent = ''; return; }
        if (!real.reading) { el.textContent = '没查到'; return; }
        const t = new Date(real.at);
        el.textContent = (real.city || '按定位') + ' · ' + realText(real.reading) + ' · ' +
            ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
    }

    function startRealTimer() {
        if (realTimer) return;
        realTimer = setInterval(() => refreshReal(false), REAL_TTL);
    }

    function sync() {
        if (!isAMode()) { teardown(); return; }
        buildHosts();
        startBubbles();
        if (prefs().source === 'real') refreshReal(false);
        applyPlan(planFor());
    }

    function teardown() {
        stopBubbles();
        document.body.classList.remove('aw-look');
        const box = document.getElementById('a-weather');
        if (box) box.style.display = 'none';
        const look = document.getElementById('a-weather-look');
        if (look) look.style.display = 'none';
    }

    // ── 设置面板（A 模式 · 聊天设置 · 美化）──
    const OPTS = {
        source: [['emotion', '角色情绪'], ['real', '真实天气']],
        side: [['me', '我这边'], ['char', '角色那边']],
        look: [['none', '不铺'], ['a', '琉璃'], ['b', '山谷'], ['c', '流光']]
    };

    function row(label, controlHtml, id) {
        return `<div class="kkt-item"${id ? ` id="${id}"` : ''}><div class="kkt-item-label">${label}</div>` +
            `<div class="kkt-item-control">${controlHtml}<span class="kkt-arrow">›</span></div></div>`;
    }

    function selectHtml(id, opts, val) {
        return `<select id="${id}" style="border:none;background:transparent;text-align:right;">` +
            opts.map(o => `<option value="${o[0]}"${o[0] === val ? ' selected' : ''}>${o[1]}</option>`).join('') +
            '</select>';
    }

    function switchHtml(id, checked) {
        return `<label class="kkt-switch"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}><span class="kkt-slider"></span></label>`;
    }

    function buildGroup() {
        const tab = document.getElementById('setting-tab-style');
        if (!tab || !isAMode() || document.getElementById('a-weather-group')) return;
        const p = prefs();
        const chat = currentChat();
        const w = chatWeather(chat);
        const hasChat = !!chat;
        const group = document.createElement('div');
        group.className = 'kkt-group a-weather-group folded';
        group.id = 'a-weather-group';
        group.innerHTML = [
            row('气象', switchHtml('aw-on', p.on), 'aw-head'),
            '<div class="aw-body">' + [
                `<div id="aw-char-row" style="display:${hasChat ? '' : 'none'}">${row('本角色气象', selectHtml('aw-char-on', [['follow', '跟随全局'], ['on', '开'], ['off', '关']], w.on == null ? 'follow' : (w.on ? 'on' : 'off')))}</div>`,
                row('天气来源', selectHtml('aw-source', OPTS.source, p.source)),
                `<div id="aw-side-row" style="display:${p.source === 'real' ? '' : 'none'}">${row('取哪边', selectHtml('aw-side', OPTS.side, p.side))}</div>`,
                row('我的城市', `<input type="text" id="aw-mycity" value="${(p.myCity || '').replace(/"/g, '&quot;')}" style="border:none;background:transparent;text-align:right;width:120px;">`),
                `<div id="aw-charcity-row" style="display:${hasChat ? '' : 'none'}">${row('角色城市', `<input type="text" id="aw-charcity" value="${(w.city || '').replace(/"/g, '&quot;')}" style="border:none;background:transparent;text-align:right;width:120px;">`)}</div>`,
                `<div id="aw-real-row" style="display:${p.source === 'real' ? '' : 'none'}"><div class="kkt-item"><div class="kkt-item-label">现在</div><div class="kkt-item-control"><span id="aw-real-now"></span></div></div></div>`,
                row('雨雪雾', switchHtml('aw-l-fx', p.layers.fx)),
                row('天空', switchHtml('aw-l-sky', p.layers.sky)),
                row('水波', switchHtml('aw-l-caustic', p.layers.caustic)),
                row('雨水玻璃', switchHtml('aw-l-glass', p.layers.glass)),
                row('背景', selectHtml('aw-look', OPTS.look, p.look)),
                row('背景照片', `<img id="aw-bg-thumb" alt="">` +
                    `<label class="aw-bg-btn" for="aw-bg-file">上传</label>` +
                    `<button type="button" class="aw-bg-btn" id="aw-bg-clear">清除</button>` +
                    `<input type="file" id="aw-bg-file" accept="image/*" style="display:none;">`),
                row('强度', `<input type="range" id="aw-int" min="10" max="100" step="1" value="${p.intensity}">`)
            ].join('') + '</div>'
        ].join('');
        tab.insertBefore(group, tab.firstChild.nextSibling || null);

        // 整块默认折叠：点「气象」那一行才展开，开关本身不算点行
        group.querySelector('#aw-head').addEventListener('click', e => {
            if (e.target.closest('.kkt-switch')) return;
            group.classList.toggle('folded');
        });

        const save = async () => {
            try { await saveData(); } catch (e) { console.error('[Weather] save failed:', e); }
            applyPlan(planFor());
        };
        const q = sel => group.querySelector(sel);

        q('#aw-on').addEventListener('change', e => { prefs().on = e.target.checked; save(); });
        q('#aw-char-on').addEventListener('change', e => {
            const v = e.target.value;
            chatWeather(currentChat()).on = v === 'follow' ? null : v === 'on';
            save();
        });
        q('#aw-source').addEventListener('change', e => {
            prefs().source = e.target.value;
            const isReal = e.target.value === 'real';
            q('#aw-side-row').style.display = isReal ? '' : 'none';
            q('#aw-real-row').style.display = isReal ? '' : 'none';
            save();
            if (isReal) refreshReal(true);
        });
        q('#aw-side').addEventListener('change', e => { prefs().side = e.target.value; save(); refreshReal(true); });
        q('#aw-mycity').addEventListener('change', e => { prefs().myCity = e.target.value.trim(); save(); refreshReal(true); });
        q('#aw-charcity').addEventListener('change', e => { chatWeather(currentChat()).city = e.target.value.trim(); save(); refreshReal(true); });
        [['#aw-l-fx', 'fx'], ['#aw-l-sky', 'sky'], ['#aw-l-caustic', 'caustic'], ['#aw-l-glass', 'glass']].forEach(pair => {
            q(pair[0]).addEventListener('change', e => { prefs().layers[pair[1]] = e.target.checked; save(); });
        });
        q('#aw-look').addEventListener('change', e => { prefs().look = e.target.value; save(); });
        q('#aw-int').addEventListener('change', e => { prefs().intensity = +e.target.value; save(); });

        const thumb = q('#aw-bg-thumb');
        const paintBg = () => {
            const bg = prefs().bg || '';
            if (bg) thumb.src = bg; else thumb.removeAttribute('src');
            thumb.style.display = bg ? 'block' : 'none';
        };
        q('#aw-bg-file').addEventListener('change', async e => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file || !/^image\//i.test(file.type || '')) return;
            let url = '';
            try { url = await compressImage(file, { quality: 0.8, maxWidth: 1440, maxHeight: 1440 }); }
            catch (err) { showToast('图片读不出来'); return; }
            if (!url || url.length > 2.5e6) { showToast('这张太大了，换一张'); return; }
            prefs().bg = url;
            await save();
            paintBg();
        });
        q('#aw-bg-clear').addEventListener('click', async () => {
            if (!prefs().bg) return;
            prefs().bg = '';
            await save();
            reloadLook();
            reloadLayer('glass');
            paintBg();
        });
        paintBg();

        paintReal();
        buildEmoGroup();
    }

    function emoRowsHtml() {
        const p = prefs();
        return [
            row('平静', selectHtml('aw-calm-look', LOOK_OPTS, p.calmLook || 'calm') + selectHtml('aw-calm-tint', TINT_OPTS, p.calmTint || 'none')),
            emotions().map((e, i) =>
                `<div class="kkt-item aw-emo" data-i="${i}">` +
                `<div class="kkt-item-label"><input type="text" class="aw-emo-name" value="${esc(e.name)}">` +
                `<input type="text" class="aw-emo-desc" value="${esc(e.desc)}"></div>` +
                `<div class="kkt-item-control">` +
                `<select class="aw-emo-look">` + LOOK_OPTS.map(l => `<option value="${l[0]}"${l[0] === e.look ? ' selected' : ''}>${l[1]}</option>`).join('') + `</select>` +
                `<select class="aw-emo-tint">` + TINT_OPTS.map(t => `<option value="${t[0]}"${t[0] === e.tint ? ' selected' : ''}>${t[1]}</option>`).join('') + `</select>` +
                `<button type="button" class="aw-emo-del">✕</button></div></div>`
            ).join('')
        ].join('');
    }

    function buildEmoGroup() {
        const tab = document.getElementById('setting-tab-style');
        if (!tab || !isAMode() || document.getElementById('a-weather-emo-group')) return;
        const group = document.createElement('div');
        group.className = 'kkt-group';
        group.id = 'a-weather-emo-group';
        group.innerHTML = row('情绪', '<button type="button" class="aw-emo-btn" id="aw-emo-add">新增</button>' +
            '<button type="button" class="aw-emo-btn" id="aw-emo-fold">收起</button>') + emoRowsHtml();
        tab.appendChild(group);

        const save = async () => {
            try { await saveData(); } catch (e) { console.error('[Weather] save failed:', e); }
            applyPlan(planFor());
        };
        const reBuild = () => { removeEmoGroup(); buildEmoGroup(); };
        // 每次现取现改：saveData 之后 db 里的数组可能被换掉，缓存下来会写到旧副本上
        const at = el => emotions()[+el.closest('.aw-emo').dataset.i];

        group.querySelector('#aw-emo-add').addEventListener('click', async () => {
            emotions().push({ key: 'e' + Date.now().toString(36), name: '新情绪', halflife: 24, desc: '', look: 'calm', tint: 'none' });
            await save();
            reBuild();
        });
        group.querySelector('#aw-emo-fold').addEventListener('click', () => {
            const folded = group.classList.toggle('folded');
            group.querySelector('#aw-emo-fold').textContent = folded ? '展开' : '收起';
        });
        group.addEventListener('change', async e => {
            const t = e.target;
            if (t.id === 'aw-calm-look') { prefs().calmLook = t.value; await save(); return; }
            if (t.id === 'aw-calm-tint') { prefs().calmTint = t.value; await save(); return; }
            if (!t.closest || !t.closest('.aw-emo')) return;
            const it = at(t);
            if (t.classList.contains('aw-emo-look')) it.look = t.value;
            else if (t.classList.contains('aw-emo-tint')) it.tint = t.value;
            else if (t.classList.contains('aw-emo-desc')) it.desc = t.value.trim();
            else if (t.classList.contains('aw-emo-name')) {
                const v = t.value.trim();
                const dup = emotions().some((x, i) => i !== +t.closest('.aw-emo').dataset.i && (x.name === v || x.key === v));
                if (!v || dup) { t.value = it.name; return; }
                it.name = v;
            }
            await save();
        });
        group.addEventListener('click', async e => {
            const btn = e.target.closest && e.target.closest('.aw-emo-del');
            if (!btn) return;
            const arr = emotions();
            if (arr.length <= 1) return;
            arr.splice(+btn.closest('.aw-emo').dataset.i, 1);
            await save();
            reBuild();
        });
    }

    function removeEmoGroup() {
        const g = document.getElementById('a-weather-emo-group');
        if (g) g.remove();
    }

    function removeGroup() {
        const g = document.getElementById('a-weather-group');
        if (g) g.remove();
        removeEmoGroup();
    }

    // 打开聊天设置时刷新面板里的值
    const origLoad = window.loadSettingsToSidebar;
    window.loadSettingsToSidebar = function () {
        const r = origLoad && origLoad.apply(this, arguments);
        removeGroup();
        setTimeout(buildGroup, 0);
        return r;
    };

    // 聊天页切换角色 / 进出聊天时同步画面
    let watching = false;
    function watch() {
        if (watching || typeof MutationObserver === 'undefined') return;
        watching = true;
        new MutationObserver(() => sync()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        const nameEl = document.getElementById('a-name');
        if (nameEl) new MutationObserver(() => sync()).observe(nameEl, { childList: true, characterData: true, subtree: true });
    }

    window.MieWeather = {
        prefs: prefs,
        sync: sync,
        apply: applyPlan,
        planFor: planFor,
        slots: slots,
        emotionNote: emotionNote,
        buildGroup: buildGroup,
        removeGroup: removeGroup,
        buildEmoGroup: buildEmoGroup,
        removeEmoGroup: removeEmoGroup,
        realState: () => real,
        refreshReal: refreshReal,
        bubbleList: bubbleList,
        pushBubbles: pushBubbles
    };

    // TA 每写完一轮黑箱，画面跟着换一档
    function hookBlackbox() {
        const BB = window.ChatBlackbox;
        if (!BB || BB.__weatherHook || typeof BB.onReply !== 'function') return;
        BB.__weatherHook = true;
        const orig = BB.onReply;
        BB.onReply = function () {
            const out = orig.apply(this, arguments);
            setTimeout(sync, 0);
            return out;
        };
    }

    // 切走的时候别白算：量矩形的轮询停掉；切回来重新排一档，断网期间攒下的变化也补上
    function bindWake() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopBubbles();
            else sync();
        });
        window.addEventListener('online', () => {
            const p = prefs();
            if (p.on && p.source === 'real') refreshReal(true);
        });
    }

    // A 模式的 body 标记可能比本文件晚一步打上，所以先挂监听，再按当前状态决定挂不挂图层
    function boot() {
        watch();
        bindWake();
        hookBlackbox();
        loadRealCache();
        startRealTimer();
        ensureStyle();
        if (isAMode()) {
            buildHosts();
            sync();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
