// --- 聊天关键词特效：14 种演出（移植自 nuojiji）---
// 双方消息里说到触发词（或表情包含义）时，聊天屏幕播放对应特效。
// 设置在 角色聊天设置 → 专属 → 关键词特效：总开关 / 14 种单独开关 / 角色感知 / ▶ 预览。

const CHAT_FX_RULES = [
    { id: 'bomb',      type: 'stage', name: '炸弹爆炸', desc: '炸弹从天而降轰一声炸开，屏幕猛震', phrases: '炸弹 / 气炸 / 炸了 / 爆炸',
      zh: ['炸弹', '炸彈', '气炸', '氣炸', '炸了', '爆炸'], en: [/\bbomb(s)?\b/i, /\bexplode(d|s)?\b/i] },
    { id: 'fireworks', type: 'stage', name: '放烟花',   desc: '几朵烟花在屏幕上依次绽放', phrases: '烟花 / 烟火 / 新年快乐 / 跨年',
      zh: ['烟花', '煙花', '烟火', '煙火', '新年快乐', '新年快樂', '跨年', '放烟花', '放煙花'], en: [/\bfireworks?\b/i, /\bhappy\s*new\s*year\b/i] },
    { id: 'confetti',  type: 'stage', name: '撒礼花',   desc: '底部两个角喷出彩带纸屑', phrases: '恭喜 / 庆祝 / 太棒了 / 撒花 / 干杯',
      zh: ['恭喜', '庆祝', '慶祝', '太棒了', '干杯', '乾杯', '撒花', '祝贺', '祝賀'], en: [/\bcongrats?\b/i, /\bcheers\b/i, /\bparty\s*time\b/i] },
    { id: 'heartbeat', type: 'stage', name: '怦然心动', desc: '屏幕中央一颗大心怦怦跳，泛起涟漪', phrases: '心动 / 怦然 / 心跳',
      zh: ['心动', '心動', '怦然', '心跳加速'], en: [/\bheart(beat|s)?\b/i, /\bmy\s*heart\b/i] },
    { id: 'night',     type: 'stage', name: '晚安夜空', desc: '屏幕暗下来，月亮星星升上夜空', phrases: '晚安 / 好梦',
      zh: ['晚安', '好梦', '好夢'], en: [/\bgood\s*night\b/i, /\bsweet\s*dreams?\b/i] },
    { id: 'anger',     type: 'stage', name: '生气冒烟', desc: '边缘弹出愤怒青筋，画面泛红', phrases: '生气 / 气死 / 好气 / 哼哼',
      zh: ['生气', '生氣', '气死', '氣死', '好气', '好氣', '哼哼', '气死我了'], en: [/\bangry\b/i, /\bmad\s*at\b/i] },
    { id: 'shake',     type: 'stage', name: '抖一抖',   desc: '整个聊天窗口晃一晃', phrases: '抖一抖 / 地震 / 震动',
      zh: ['抖一抖', '抖抖', '地震', '震动', '震動'], en: [/\bshake\b/i, /\bnudge\b/i, /\bearthquake\b/i] },
    { id: 'heart',     type: 'rain', art: 'heart',    name: '爱心雨',   desc: '爱心噼里啪啦往下掉', phrases: '我爱你 / 爱你 / 喜欢你 / 比心',
      zh: ['我爱你', '我愛你', '爱你', '愛你', '喜欢你', '喜歡你', '比心'], en: [/\bi\s*love\s*(you|u)\b/i, /\blove\s*(you|u|ya)\b/i] },
    { id: 'kiss',      type: 'rain', art: 'kiss',     name: '么么哒',   desc: '亲亲嘴印和小爱心一起落下', phrases: '么么哒 / 亲亲 / 啵啵 / mua',
      zh: ['么么哒', '麼麼噠', '么么', '麼麼', '亲亲', '親親', '啵啵', '啵一个', '啵一個'], en: [/\bmua+a+h*\b/i, /\bkiss(es)?\b/i, /\bxoxo\b/i] },
    { id: 'star',      type: 'rain', art: 'star',     name: '星星雨',   desc: '闪闪的星星飘下来', phrases: '想你 / 好想你 / miss you',
      zh: ['想你', '想死你', '好想你'], en: [/\bmiss\s*(you|u|ya)\b/i] },
    { id: 'balloon',   type: 'rain', art: 'balloon',  name: '气球上浮', desc: '彩色气球从底部飘上来', phrases: '生日快乐 / 生快',
      zh: ['生日快乐', '生日快樂', '生快'], en: [/\bhappy\s*birthday\b/i, /\bhbd\b/i] },
    { id: 'envelope',  type: 'rain', art: 'envelope', name: '红包雨',   desc: '小红包簌簌往下掉', phrases: '恭喜发财 / 红包 / 过年好',
      zh: ['恭喜发财', '恭喜發財', '红包', '紅包', '过年好', '過年好'], en: [/\bred\s*envelopes?\b/i] },
    { id: 'snow',      type: 'rain', art: 'snow',     name: '下雪了',   desc: '雪花慢慢飘落', phrases: '下雪 / 雪花 / 初雪',
      zh: ['下雪', '雪花', '初雪', '下雪了'], en: [/\bsnow(ing|flakes?)?\b/i] },
    { id: 'petal',     type: 'rain', art: 'petal',    name: '花瓣雨',   desc: '花瓣打着旋儿飘下来', phrases: '送你花 / 鲜花 / 樱花 / 玫瑰',
      zh: ['送你花', '花花', '鲜花', '鮮花', '樱花', '櫻花', '玫瑰'], en: [/\bflowers?\b/i, /\broses?\b/i] }
];

const CHAT_FX_ARTS = {
    heart: (c) => `<svg viewBox="0 0 64 58" width="100%" height="100%"><defs><linearGradient id="fxg-h${c.n}" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${c.c1}"/><stop offset="1" stop-color="${c.c2}"/></linearGradient></defs><path d="M32 56C14 42 2 31 2 17.5 2 8.4 9.2 2 17.6 2c5.9 0 11 3.2 14.4 8.4C35.4 5.2 40.5 2 46.4 2 54.8 2 62 8.4 62 17.5 62 31 50 42 32 56z" fill="url(#fxg-h${c.n})"/><ellipse cx="18" cy="15" rx="7" ry="4.5" fill="#fff" opacity="0.45" transform="rotate(-30 18 15)"/></svg>`,
    kiss: (c) => `<svg viewBox="0 0 64 40" width="100%" height="100%"><defs><linearGradient id="fxg-k${c.n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.c1}"/><stop offset="1" stop-color="${c.c2}"/></linearGradient></defs><path d="M2 20C9 9 17 3 24 3c3.5 0 6 2 8 4.5C34 5 36.5 3 40 3c7 0 15 6 22 17-6 10-17 17-30 17S8 30 2 20z" fill="url(#fxg-k${c.n})"/><path d="M5 20c8 2 17 3 27 3s19-1 27-3" stroke="#7a1030" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.55"/><ellipse cx="22" cy="11" rx="6" ry="2.6" fill="#fff" opacity="0.4"/></svg>`,
    star: (c) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M32 3l8.6 18.4L61 24l-15 14.2L49.8 60 32 50.4 14.2 60l3.8-21.8L3 24l20.4-2.6z" fill="${c.c1}" stroke="${c.c2}" stroke-width="2" stroke-linejoin="round"/></svg>`,
    balloon: (c) => `<svg viewBox="0 0 40 64" width="100%" height="100%"><defs><radialGradient id="fxg-b${c.n}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${c.c1}"/><stop offset="1" stop-color="${c.c2}"/></radialGradient></defs><ellipse cx="20" cy="24" rx="17" ry="21" fill="url(#fxg-b${c.n})"/><ellipse cx="13" cy="15" rx="5" ry="7" fill="#fff" opacity="0.4" transform="rotate(-20 13 15)"/><path d="M20 45l-4 5h8z" fill="${c.c2}"/><path d="M20 50c4 6-4 8 1 13" stroke="${c.c2}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
    envelope: (c) => `<svg viewBox="0 0 64 46" width="100%" height="100%"><rect x="2" y="2" width="60" height="42" rx="5" fill="${c.c1}"/><path d="M2 6l30 22L62 6" stroke="${c.c2}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="27" r="7.5" fill="#ffd84a" stroke="#d9a318" stroke-width="1.5"/></svg>`,
    snow: (c) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><g stroke="${c.c1}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M32 6v52M9 19l46 26M55 19L9 45"/></g><g fill="${c.c1}"><circle cx="32" cy="6" r="4"/><circle cx="32" cy="58" r="4"/><circle cx="9" cy="19" r="4"/><circle cx="55" cy="45" r="4"/><circle cx="55" cy="19" r="4"/><circle cx="9" cy="45" r="4"/></g></svg>`,
    petal: (c) => `<svg viewBox="0 0 64 48" width="100%" height="100%"><path d="M32 4C46 4 62 14 62 26c0 8-10 14-20 14-6 0-8-2-10-2s-4 2-10 2C12 40 2 34 2 26 2 14 18 4 32 4z" fill="${c.c1}" opacity="0.92"/><path d="M8 30c10-8 38-8 48 0" stroke="${c.c2}" stroke-width="2" fill="none" opacity="0.5"/></svg>`,
    bomb: `<svg viewBox="0 0 80 84" width="100%" height="100%"><defs><radialGradient id="fxg-bomb" cx="0.35" cy="0.35" r="0.75"><stop offset="0" stop-color="#6b6f86"/><stop offset="0.5" stop-color="#2e3142"/><stop offset="1" stop-color="#14151d"/></radialGradient></defs><circle cx="36" cy="50" r="30" fill="url(#fxg-bomb)"/><rect x="44" y="14" width="16" height="12" rx="3" transform="rotate(35 52 20)" fill="#3a3d50"/><path d="M58 14c4-6 10-8 14-6" stroke="#b08a5a" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="38" rx="8" ry="5" fill="#fff" opacity="0.28" transform="rotate(-35 24 38)"/><g class="fx-bomb-spark"><circle cx="73" cy="7" r="5" fill="#ffd84a"/><circle cx="73" cy="7" r="2.6" fill="#fff"/><path d="M73 0v-4M80 7h4M78 2l3-3M78 12l3 3M66 2l-3-3" stroke="#ffb02e" stroke-width="2" stroke-linecap="round"/></g></svg>`,
    vein: (c) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><g fill="none" stroke="${c.c1}" stroke-width="7" stroke-linecap="round"><path d="M8 26c8 0 14-6 14-14"/><path d="M42 12c0 8 6 14 14 14"/><path d="M56 40c-8 0-14 6-14 14"/><path d="M22 54c0-8-6-14-14-14"/></g></svg>`,
    moon: (c) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><mask id="fxg-m${c.n}"><rect width="64" height="64" fill="#fff"/><circle cx="46" cy="20" r="21" fill="#000"/></mask></defs><circle cx="32" cy="32" r="27" fill="${c.c1}" mask="url(#fxg-m${c.n})"/><circle cx="20" cy="24" r="2.5" fill="#fff" opacity="0.5"/><circle cx="14" cy="40" r="1.8" fill="#fff" opacity="0.4"/></svg>`
};

let __fxUid = 0;
const __fxLastPlay = {};
const CHAT_FX_COLORS = {
    heart:    [['#ff8fb1', '#ff3d6e'], ['#ffb3c8', '#ff6f9a'], ['#ff7a8a', '#e8264d']],
    kiss:     [['#ff5a7e', '#d81b4a'], ['#ff8aa6', '#e8326a']],
    star:     [['#ffe27a', '#ffb02e'], ['#fff3b8', '#ffcf4a']],
    balloon:  [['#ff9a9e', '#e5646e'], ['#a1c4fd', '#5b8def'], ['#fddb92', '#f2a65a'], ['#d4fc79', '#8bc34a']],
    envelope: [['#e0453a', '#b32e24'], ['#d43d2f', '#a02619']],
    snow:     [['#e8f4ff', '#bfe0ff']],
    petal:    [['#ffc2d4', '#ff8fb1'], ['#ffd7e2', '#ffb7c9'], ['#fbc2eb', '#f5a0d0']],
    vein:     [['#ff3b3b']],
    moon:     [['#fff6d8', '#f2e2a0']]
};

function chatFxGetRule(id) {
    return CHAT_FX_RULES.find(r => r.id === id) || null;
}

function chatFxArt(art, size) {
    const palette = (CHAT_FX_COLORS[art] || [['#ff8fb1', '#ff3d6e']]);
    const [c1, c2 = c1] = palette[Math.floor(Math.random() * palette.length)];
    const fn = CHAT_FX_ARTS[art];
    return fn({ c1, c2, n: ++__fxUid, size });
}

function detectChatFx(text, disabled) {
    if (!text || typeof text !== 'string') return null;
    const off = new Set(disabled || []);
    const lower = text.toLowerCase();
    for (const rule of CHAT_FX_RULES) {
        if (off.has(rule.id)) continue;
        if (rule.zh.some(k => lower.includes(k.toLowerCase()))) return rule.id;
        if (rule.en.some(re => re.test(text))) return rule.id;
    }
    return null;
}

// ---- 演出层 ----

function chatFxLayer(host) {
    const layer = document.createElement('div');
    layer.className = 'chat-fx-layer';
    layer.innerHTML = '';
    (host || document.getElementById('chat-room-screen') || document.body).appendChild(layer);
    return layer;
}

function chatFxRainParticle(art) {
    const p = document.createElement('div');
    p.className = 'chat-fx-particle';
    p.innerHTML = chatFxArt(art);
    return p;
}

function playChatFxRain(layer, art, opts) {
    const conf = Object.assign({ count: 22, rise: false, durMin: 2.4, durMax: 4.2 }, opts || {});
    for (let i = 0; i < conf.count; i++) {
        const p = chatFxRainParticle(art);
        const size = 14 + Math.random() * 22;
        p.style.left = (Math.random() * 94) + '%';
        p.style.width = size + 'px';
        p.style.height = (art === 'heart' || art === 'envelope' ? size * 0.85 : art === 'balloon' ? size * 1.5 : size * 0.8) + 'px';
        p.style.setProperty('--fx-scale', (0.6 + Math.random() * 0.7).toFixed(2));
        p.style.setProperty('--fx-drift', Math.round(Math.random() * 80 - 40) + 'px');
        p.style.setProperty('--fx-spin', Math.round(Math.random() * 240 - 120) + 'deg');
        p.style.animationDelay = (Math.random() * 1.4).toFixed(2) + 's';
        p.style.animationDuration = (conf.durMin + Math.random() * (conf.durMax - conf.durMin)).toFixed(2) + 's';
        p.classList.add(conf.rise ? 'chat-fx-rise' : 'chat-fx-fall');
        layer.appendChild(p);
    }
}

function playChatFxShake(host) {
    const el = host || document.getElementById('chat-room-screen');
    if (!el || el.classList.contains('chat-fx-host-shake')) return;
    el.classList.add('chat-fx-host-shake');
    setTimeout(() => el.classList.remove('chat-fx-host-shake'), 900);
}

function playChatFxStageBomb(layer, host) {
    const bomb = document.createElement('div');
    bomb.className = 'chat-fx-bomb';
    bomb.innerHTML = CHAT_FX_ARTS.bomb;
    layer.appendChild(bomb);
    const boom = document.createElement('div');
    boom.className = 'chat-fx-boom';
    layer.appendChild(boom);
    setTimeout(() => playChatFxShake(host), 1050);
}

function playChatFxStageFireworks(layer) {
    const spots = [[28, 30], [66, 22], [48, 42], [76, 44]];
    spots.forEach(([x, y], i) => {
        setTimeout(() => {
            const burst = document.createElement('div');
            burst.className = 'chat-fx-burst';
            burst.style.left = x + '%';
            burst.style.top = y + '%';
            const colors = ['#ff6f9a', '#ffd84a', '#8fb8ff', '#a1f7b5'];
            const col = colors[i % colors.length];
            burst.innerHTML = `<div class="chat-fx-burst-flash" style="background:radial-gradient(circle, #fff 0%, ${col} 45%, transparent 70%)"></div>` +
                Array.from({ length: 14 }, (_, k) => {
                    const ang = (k / 14) * Math.PI * 2 + Math.random() * 0.4;
                    const r = 70 + Math.random() * 90;
                    return `<div class="chat-fx-spark" style="background:${col};--dx:${Math.round(Math.cos(ang) * r)}px;--dy:${Math.round(Math.sin(ang) * r)}px;--d:${(0.7 + Math.random() * 0.4).toFixed(2)}s"></div>`;
                }).join('');
            layer.appendChild(burst);
            setTimeout(() => burst.remove(), 1300);
        }, i * 620);
    });
}

function playChatFxStageConfetti(layer) {
    const side = (dir) => {
        const popper = document.createElement('div');
        popper.className = 'chat-fx-popper chat-fx-popper-' + (dir < 0 ? 'l' : 'r');
        popper.innerHTML = `<div class="chat-fx-popper-cone"></div>` + Array.from({ length: 18 }, () => {
            const colors = ['#ff6f9a', '#ffd84a', '#8fb8ff', '#a1f7b5', '#ff9a5a', '#c79bff'];
            const col = colors[Math.floor(Math.random() * colors.length)];
            const dx = Math.round(dir * (60 + Math.random() * 220));
            const dy = -Math.round(220 + Math.random() * 240);
            const w = 5 + Math.round(Math.random() * 7);
            return `<div class="chat-fx-confetti" style="background:${col};width:${w}px;height:${w * 0.55}px;--dx:${dx}px;--dy:${dy}px;--rs:${Math.round(Math.random() * 720 - 360)}deg;--d:${(0.9 + Math.random() * 0.7).toFixed(2)}s"></div>`;
        }).join('');
        layer.appendChild(popper);
        setTimeout(() => popper.remove(), 1800);
    };
    side(-1); side(1);
}

function playChatFxStageHeartbeat(layer) {
    const hb = document.createElement('div');
    hb.className = 'chat-fx-heartbeat';
    hb.innerHTML = `<div class="chat-fx-hb-ripple"></div><div class="chat-fx-hb-ripple r2"></div><div class="chat-fx-hb-core">${chatFxArt('heart')}</div>`;
    layer.appendChild(hb);
    setTimeout(() => hb.remove(), 2800);
}

function playChatFxStageNight(layer) {
    const veil = document.createElement('div');
    veil.className = 'chat-fx-night-veil';
    const moon = document.createElement('div');
    moon.className = 'chat-fx-night-moon';
    moon.innerHTML = chatFxArt('moon');
    const stars = document.createElement('div');
    stars.className = 'chat-fx-night-stars';
    stars.innerHTML = Array.from({ length: 14 }, () => {
        const s = 3 + Math.random() * 4;
        return `<div class="chat-fx-twinkle" style="left:${Math.random() * 92}%;top:${Math.random() * 55}%;width:${s}px;height:${s}px;animation-delay:${(Math.random() * 2).toFixed(2)}s"></div>`;
    }).join('');
    layer.appendChild(veil);
    layer.appendChild(moon);
    layer.appendChild(stars);
}

function playChatFxStageAnger(layer) {
    const veil = document.createElement('div');
    veil.className = 'chat-fx-anger-veil';
    layer.appendChild(veil);
    const spots = [[8, 14], [88, 18], [10, 74], [86, 80]];
    spots.forEach(([x, y], i) => {
        const v = document.createElement('div');
        v.className = 'chat-fx-vein';
        v.style.left = x + '%';
        v.style.top = y + '%';
        v.style.animationDelay = (i * 0.12) + 's';
        v.innerHTML = chatFxArt('vein');
        layer.appendChild(v);
    });
    setTimeout(() => playChatFxShake(), 200);
}

const CHAT_FX_DURATION = {
    bomb: 2600, fireworks: 3400, confetti: 2400, heartbeat: 2800, night: 4200, anger: 2400, shake: 900,
    heart: 5200, kiss: 5200, star: 5000, balloon: 5200, envelope: 5000, snow: 5600, petal: 5600
};

function playChatFx(fxId, hostId) {
    const rule = chatFxGetRule(fxId);
    if (!rule) return;
    const now = Date.now();
    if (__fxLastPlay[fxId] && now - __fxLastPlay[fxId] < 2500) return;
    __fxLastPlay[fxId] = now;
    const host = hostId ? document.getElementById(hostId) : document.getElementById('chat-room-screen');
    if (!host) return;
    const layer = chatFxLayer(host);
    switch (fxId) {
        case 'heart': case 'kiss': case 'star': case 'envelope': case 'snow': case 'petal':
            playChatFxRain(layer, rule.art); break;
        case 'balloon':
            playChatFxRain(layer, 'balloon', { count: 12, rise: true, durMin: 3.4, durMax: 5 }); break;
        case 'bomb': playChatFxStageBomb(layer, host); break;
        case 'fireworks': playChatFxStageFireworks(layer); break;
        case 'confetti': playChatFxStageConfetti(layer); break;
        case 'heartbeat': playChatFxStageHeartbeat(layer); break;
        case 'night': playChatFxStageNight(layer); break;
        case 'anger': playChatFxStageAnger(layer); break;
        case 'shake': playChatFxShake(host); break;
    }
    setTimeout(() => layer.remove(), CHAT_FX_DURATION[fxId] || 5000);
}

// ---- 消息触发 ----

function chatFxTextOf(message) {
    if (!message || typeof message.content !== 'string') return '';
    let text = message.content;
    if (message.role === 'system') return '';
    if (/^\s*\[system/.test(text)) return '';
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/^<think>[\s\S]*?<\/think>/gi, '');
    const wrapped = text.match(/\[.*?的消息[：:]([\s\S]+?)\]$/);
    if (wrapped) text = wrapped[1];
    const sticker = text.match(/(?:表情包|贴了表情)[：:]\s*(.+?)\]?$/);
    if (sticker) text = sticker[1] + ' ' + text;
    return text.trim();
}

function chatFxOnMessage(message, chatId, chatType) {
    if (chatType !== 'private' || chatId !== window.currentChatId) return;
    const roomEl = document.getElementById('chat-room-screen');
    if (!roomEl || !roomEl.classList.contains('active')) return;
    const chat = (typeof db !== 'undefined' && db.characters || []).find(c => c.id === chatId);
    if (!chat || chat.chatFxEnabled === false) return;
    const text = chatFxTextOf(message);
    if (!text) return;
    const fx = detectChatFx(text, chat.chatFxDisabled || []);
    if (fx) playChatFx(fx);
}

// ---- 角色感知提示词 ----

function chatFxBuildPromptSection(chat) {
    if (!chat || chat.chatFxEnabled === false || chat.chatFxCharAware === false) return '';
    const rules = CHAT_FX_RULES.filter(r => !(chat.chatFxDisabled || []).includes(r.id));
    if (!rules.length) return '';
    const lines = [
        '[聊天关键词特效 — 本聊天已开启]',
        '当消息或表情包含义里出现这些词（你和对方说的都算），聊天界面会播放一段对应的小特效：',
        ...rules.map(r => '- ' + r.phrases + ' → ' + r.name + '（' + r.desc + '）'),
        '这是聊天 App 自带的趣味玩法，类似大家熟悉的表情特效。你能察觉到这些特效，可以在合适的时机自己说出这些话触发特效，也可以就特效自然地互动。'
    ];
    const lastUser = (chat.history || []).filter(m => m.role === 'user').map(m => chatFxTextOf(m)).pop();
    const hit = lastUser ? detectChatFx(lastUser, chat.chatFxDisabled || []) : null;
    if (hit) {
        const rule = chatFxGetRule(hit);
        lines.push('注意：对方刚发的这条消息触发了「' + rule.name + '」特效，可以自然地接住这个气氛。');
    }
    return '\n\n' + lines.join('\n');
}

// ---- 设置页 UI ----

function chatFxRenderSettings(char) {
    const list = document.getElementById('chatfx-rules-list');
    if (!list || !char) return;
    const enabledEl = document.getElementById('setting-chatfx-enabled');
    const awareEl = document.getElementById('setting-chatfx-char-aware');
    if (enabledEl) enabledEl.checked = char.chatFxEnabled !== false;
    if (awareEl) awareEl.checked = char.chatFxCharAware !== false;
    const disabled = new Set(char.chatFxDisabled || []);
    list.innerHTML = '';
    CHAT_FX_RULES.forEach(rule => {
        const row = document.createElement('div');
        row.className = 'chatfx-rule-row' + (disabled.has(rule.id) ? ' off' : '');
        row.innerHTML = `
            <div class="chatfx-rule-info">
                <div class="chatfx-rule-name">${rule.name}</div>
                <div class="chatfx-rule-words">${rule.phrases}</div>
            </div>
            <div class="chatfx-rule-ops">
                <button type="button" class="chatfx-preview-btn" title="预览">▶</button>
                <label class="kkt-switch"><input type="checkbox" ${disabled.has(rule.id) ? '' : 'checked'}><span class="kkt-slider"></span></label>
            </div>`;
        row.querySelector('.chatfx-preview-btn').addEventListener('click', () => {
            playChatFx(rule.id, 'chat-settings-screen');
        });
        row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            const on = e.target.checked;
            const cur = new Set(char.chatFxDisabled || []);
            if (on) cur.delete(rule.id); else cur.add(rule.id);
            char.chatFxDisabled = CHAT_FX_RULES.map(r => r.id).filter(id => cur.has(id));
            row.classList.toggle('off', !on);
            if (typeof saveData === 'function') saveData();
            showToast((on ? '已开启' : '已关闭') + '「' + rule.name + '」');
        });
        list.appendChild(row);
    });
}

function chatFxSaveSettings(char) {
    if (!char) return;
    const enabledEl = document.getElementById('setting-chatfx-enabled');
    const awareEl = document.getElementById('setting-chatfx-char-aware');
    if (enabledEl) char.chatFxEnabled = enabledEl.checked;
    if (awareEl) char.chatFxCharAware = awareEl.checked;
    // 14 种单独开关在渲染时即时生效（chatFxDisabled 已随勾选写回角色）
}

if (typeof window !== 'undefined') {
    window.ChatFx = {
        rules: CHAT_FX_RULES,
        detect: detectChatFx,
        play: playChatFx,
        onMessage: chatFxOnMessage,
        buildPromptSection: chatFxBuildPromptSection,
        renderSettings: chatFxRenderSettings,
        saveSettings: chatFxSaveSettings
    };
}
