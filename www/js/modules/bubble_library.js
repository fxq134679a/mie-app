/* ════════════════════════════════════════════════════════
   气泡库 · 图片气泡主题（内置 + 用户导入）
   ─────────────────────────────────────────────
   · 内置主题来自 .ktheme 主题包提取；用户可在全屏气泡库页
     导入 .ktheme / 成对 PNG，自主删除、搜索、选用
   · 九宫格 border-image 拉伸：切角区不变形，肚皮随文字拉伸
   · 全屏页两种用法：
       openBubbleLibraryOverlay({ current, onPick })  选择模式
       美化 App → 气泡库 → 管理与全局默认
   ════════════════════════════════════════════════════════ */

const BUBBLE_LIBRARY = [
    {
        id: 'pochacco',
        name: '帕恰狗',
        send: 'img/bubbles/pochacco-send.png',
        receive: 'img/bubbles/pochacco-receive.png',
        /* 九宫格切片（源图 126x100 @2x）：左右切角包住耳朵和眼睛，上56 包住整张脸，下18 是肚皮；
           显示宽度 ×1.3 放大，让小狗脸更清晰可爱 */
        sendSlice: '56 26 18 48',
        sendWidth: '36px 17px 12px 31px',
        receiveSlice: '56 45 18 27',
        receiveWidth: '36px 30px 12px 17px',
        textColor: '#333333'
    },
    {
        id: 'rainbow',
        name: '彩虹',
        send: 'img/bubbles/rainbow-send.png',
        receive: 'img/bubbles/rainbow-receive.png',
        /* 圆形气泡（源图 98x97 @2x）：四边切片留住彩虹圆环，中心浅色渐变随文字拉伸，×1.3 放大 */
        sendSlice: '48 48 47 48',
        sendWidth: '31px 31px 30px 31px',
        receiveSlice: '48 48 47 48',
        receiveWidth: '31px 31px 30px 31px',
        textColor: '#333333'
    }
];

/* ── 用户气泡库（存 db.userBubbleThemes）────────────── */
function getUserBubbleThemes() {
    if (typeof db === 'undefined') return [];
    if (!Array.isArray(db.userBubbleThemes)) db.userBubbleThemes = [];
    return db.userBubbleThemes;
}
function getAllBubbleThemes() {
    return BUBBLE_LIBRARY.concat(getUserBubbleThemes());
}
function isUserBubbleTheme(id) {
    return getUserBubbleThemes().some(t => t.id === id);
}
function getBubbleTheme(id) {
    if (!id) return null;
    return getAllBubbleThemes().find(t => t.id === id) || null;
}
/* 聊天生效主题：聊天自带选择 > 全局默认 */
function getEffectiveBubbleTheme(chat) {
    if (!chat) return null;
    const own = getBubbleTheme(chat.bubbleThemeId);
    if (own) return own;
    if (typeof db !== 'undefined' && db.defaultBubbleThemeId) return getBubbleTheme(db.defaultBubbleThemeId);
    return null;
}

/* 气泡库基础样式（选择卡片），只注入一次 */
(function _injectBubbleLibBaseStyle() {
    if (document.getElementById('bubble-lib-base-style')) return;
    const st = document.createElement('style');
    st.id = 'bubble-lib-base-style';
    st.textContent = `
        .bubble-lib-row { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; -webkit-overflow-scrolling: touch; }
        .bubble-lib-card { flex: none; width: 108px; border: 2px solid transparent; border-radius: 12px; padding: 8px 6px 6px; text-align: center; cursor: pointer; background: rgba(0,0,0,0.03); transition: border-color .15s, background .15s; }
        .bubble-lib-card.selected { border-color: var(--primary-color, #ff6b9d); background: rgba(255,107,157,0.08); }
        .bubble-lib-sample-box { height: 64px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; }
        .bubble-lib-sample { display: inline-block; max-width: 100%; font-size: 12px; line-height: 1.4; word-break: keep-all; white-space: nowrap; }
        .bubble-lib-sample.is-default { background: #fff; border: 1px solid #e5e5e5; border-radius: 14px; padding: 7px 12px; color: #333; }
        .bubble-lib-sample.is-default::after { content: ''; }
        .bubble-lib-name { font-size: 12px; color: #666; }
        .bubble-lib-card.selected .bubble-lib-name { color: var(--primary-color, #ff6b9d); font-weight: 600; }
    `;
    document.head.appendChild(st);
})();

/* 渲染气泡库选择卡片到指定容器（旧版横排，保留兼容）
   containerId: 容器元素 id
   selectedId:  当前选中的主题 id（'' = 不使用）
   onPick:      点选回调 (themeId) => void  */
function renderBubbleLibraryPicker(containerId, selectedId, onPick) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    box.dataset.sel = selectedId || '';

    const mkCard = (id, name, sampleHTML) => {
        const card = document.createElement('div');
        card.className = 'bubble-lib-card' + ((selectedId || '') === id ? ' selected' : '');
        card.dataset.themeId = id;
        const sampleBox = document.createElement('div');
        sampleBox.className = 'bubble-lib-sample-box';
        sampleBox.innerHTML = sampleHTML;
        const nameEl = document.createElement('div');
        nameEl.className = 'bubble-lib-name';
        nameEl.textContent = name;
        card.appendChild(sampleBox);
        card.appendChild(nameEl);
        card.addEventListener('click', () => {
            box.querySelectorAll('.bubble-lib-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            box.dataset.sel = id;
            if (typeof onPick === 'function') onPick(id);
        });
        return card;
    };

    const mkImageSample = (imgPath, slice, width, textColor) => {
        /* 预览用缩小版边框：真实 border-width 直接放小卡片会把内容区挤到文字竖排 */
        const w = _scaleWidthStr(width, 0.62);
        return `<span class="bubble-lib-sample" style="border-style:solid;border-color:transparent;border-width:${w};border-image-source:url('${imgPath}');border-image-slice:${slice} fill;border-image-repeat:stretch;color:${textColor};">你好呀</span>`;
    };

    box.appendChild(mkCard('', '默认气泡', '<span class="bubble-lib-sample is-default">你好呀</span>'));
    getAllBubbleThemes().forEach(t => {
        box.appendChild(mkCard(t.id, t.name, mkImageSample(t.receive, t.receiveSlice, t.receiveWidth, t.textColor)));
    });
}

/* 把选中主题的气泡样式注入页面（清掉旧注入，未选中时不注入）
   同时作用于 B 模式（.message-bubble）和 A 模式（#a-app .a-bubble / .a-gu） */
/* 文字位置：优先数值 textPad {t,r,b,l}（创建页可调）；否则回退九宫格 textPos */
function _bubbleTextPosPad(theme) {
    const p = theme && theme.textPad;
    if (p && typeof p === 'object') {
        const n = v => Math.max(0, Math.round(Number(v) || 0));
        return `${n(p.t)}px ${n(p.r)}px ${n(p.b)}px ${n(p.l)}px`;
    }
    const parts = String((theme && theme.textPos) || 'center-center').split('-');
    const v = parts[0] || 'center', h = parts[1] || 'center';
    const top = v === 'bottom' ? 12 : 2;
    const bottom = v === 'top' ? 14 : 4;
    const left = h === 'right' ? 14 : 4;
    const right = h === 'left' ? 16 : 4;
    return `${top}px ${right}px ${bottom}px ${left}px`;
}

/* 负数文字位置：padding 无法为负，钳到 0 后用 translate 把内容推出边界 */
function _bubbleTextPosShift(theme) {
    const p = theme && theme.textPad;
    if (!p || typeof p !== 'object') return '';
    const num = v => Math.round(Number(v) || 0);
    const x = (num(p.l) < 0 ? num(p.l) : 0) + (num(p.r) < 0 ? -num(p.r) : 0);
    const y = (num(p.t) < 0 ? num(p.t) : 0) + (num(p.b) < 0 ? -num(p.b) : 0);
    if (!x && !y) return '';
    return `translate(${x}px, ${y}px)`;
}

function applyBubbleThemeStyle(chatId, themeId) {
    document.querySelectorAll('style[id^="bubble-theme-for-"]').forEach(el => el.remove());
    const theme = getBubbleTheme(themeId);
    if (!theme || !chatId) return;

    /* 九宫格左右边框会吃掉内容宽度：短消息（如"111"）会被挤到一字一行。
       全局是 border-box，min-width 要连边框和内边距一起算，保证内容区至少能横排 ~3.4 个字 */
    const _w = (s) => String(s || '').trim().split(/\s+/).map(v => parseFloat(v) || 0);
    const _lr = (arr) => (arr[1] || 0) + (arr[3] || 0);
    const pad = _bubbleTextPosPad(theme);
    const _pv = _w(pad);
    const padLR = (_pv[1] || 0) + (_pv[3] || 0);
    const sendBase = Math.ceil(_lr(_w(theme.sendWidth)) + padLR);
    const recvBase = Math.ceil(_lr(_w(theme.receiveWidth)) + padLR);
    /* 原比例约束：上传图自带宽高比时，气泡按原比例显示（长文本内容撑高时自然放宽） */
    const sendAR = theme.sendRatio ? `aspect-ratio: ${theme.sendRatio};` : '';
    const recvAR = theme.receiveRatio ? `aspect-ratio: ${theme.receiveRatio};` : '';
    const shift = _bubbleTextPosShift(theme);
    const shiftCss = shift ? `display:inline-block; transform:${shift};` : '';

    const st = document.createElement('style');
    st.id = 'bubble-theme-for-' + chatId;
    st.textContent = `
/* 气泡库主题：${theme.name} */
.message-bubble {
    background: transparent !important;
    background-image: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border-style: solid;
    border-color: transparent;
    border-image-repeat: stretch;
    padding: ${pad} !important;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.13));
}
.message-bubble.sent {
    border-image-source: url("${theme.send}");
    border-image-slice: ${theme.sendSlice} fill;
    border-width: ${theme.sendWidth};
    color: ${theme.textColor} !important;
    ${sendAR}
}
.message-bubble.received {
    border-image-source: url("${theme.receive}");
    border-image-slice: ${theme.receiveSlice} fill;
    border-width: ${theme.receiveWidth};
    color: ${theme.textColor} !important;
    ${recvAR}
}
.message-bubble .bubble-content { color: ${theme.textColor} !important; text-shadow: none !important; ${shiftCss} }
#a-app .a-bubble {
    background: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border-style: solid;
    border-color: transparent;
    border-image-source: url("${theme.send}");
    border-image-slice: ${theme.sendSlice} fill;
    border-image-repeat: stretch;
    border-width: ${theme.sendWidth};
    min-width: calc(${sendBase}px + 3.4em);
    ${sendAR}
    padding: ${pad} !important;
    color: ${theme.textColor} !important;
    /* 白底背景图气泡（如帕恰狗白狗）靠 drop-shadow 勾出轮廓 */
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.16));
}
#a-app .a-gu {
    background: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border-style: solid;
    border-color: transparent;
    display: inline-block;
    border-image-source: url("${theme.receive}");
    border-image-slice: ${theme.receiveSlice} fill;
    border-image-repeat: stretch;
    border-width: ${theme.receiveWidth};
    min-width: calc(${recvBase}px + 3.4em);
    ${recvAR}
    padding: ${pad} !important;
    color: ${theme.textColor} !important;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.16));
}
`;
    /* 创建页的自定义美化 CSS（用户写的，作用于聊天气泡） */
    if (typeof theme.customCss === 'string' && theme.customCss.trim()) {
        st.textContent += '\n/* 用户自定义 CSS */\n' + theme.customCss;
    }
    document.head.appendChild(st);
}

/* 根据 chatId 从数据库读主题并注入（供进聊天室等时机调用）
   群聊时同时叠加「成员专属气泡」样式层 */
function applyBubbleThemeForChat(chatId) {
    if (!chatId || typeof db === 'undefined') return;
    const chat = (db.characters || []).find(c => c.id === chatId) || (db.groups || []).find(g => g.id === chatId);
    if (!chat) return;
    const eff = getEffectiveBubbleTheme(chat);
    applyBubbleThemeStyle(chatId, eff ? eff.id : '');
    /* 群聊：叠加成员专属气泡（有专属的成员用专属，没设的成员吃群聊原有样式） */
    if (typeof applyGroupMemberBubbleStyles === 'function') applyGroupMemberBubbleStyles(chatId);
}

/* ════════════════════════════════════════════════════════
   群聊成员专属气泡
   · group.memberBubbleThemes = { [memberId]: bubbleThemeId }
   · 只改该成员气泡的外观（九宫格贴图/文字色/内边距），
     聊天页自定义 CSS 照常生效；没设专属的成员吃群聊原有气泡样式
   ════════════════════════════════════════════════════════ */

/* 主题共用量计算（与 applyBubbleThemeStyle 同一套口径） */
function _bubbleThemeMetrics(theme) {
    const _w = (s) => String(s || '').trim().split(/\s+/).map(v => parseFloat(v) || 0);
    const _lr = (arr) => (arr[1] || 0) + (arr[3] || 0);
    const pad = _bubbleTextPosPad(theme);
    const _pv = _w(pad);
    const padLR = (_pv[1] || 0) + (_pv[3] || 0);
    return {
        pad,
        sendBase: Math.ceil(_lr(_w(theme.sendWidth)) + padLR),
        recvBase: Math.ceil(_lr(_w(theme.receiveWidth)) + padLR),
        shift: _bubbleTextPosShift(theme)
    };
}

/* 单个成员的气泡作用域 CSS（received 侧，选择器比全局主题更specific，!important 同级时胜出）
   同时覆盖 B 模式（.message-bubble）与 A 模式（#a-app .a-gu） */
function _memberBubbleRule(mid, theme) {
    const m = _bubbleThemeMetrics(theme);
    const shiftCss = m.shift ? `display:inline-block; transform:${m.shift};` : '';
    const recvAR = theme.receiveRatio ? `aspect-ratio: ${theme.receiveRatio};` : '';
    return `
/* 成员专属气泡：${theme.name} */
.message-bubble.received[data-mid="${mid}"] {
    background: transparent !important;
    background-image: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border-style: solid;
    border-color: transparent;
    border-image-repeat: stretch;
    border-image-source: url("${theme.receive}");
    border-image-slice: ${theme.receiveSlice} fill;
    border-width: ${theme.receiveWidth};
    padding: ${m.pad} !important;
    color: ${theme.textColor} !important;
    ${recvAR}
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.13));
}
.message-bubble.received[data-mid="${mid}"] .bubble-content { color: ${theme.textColor} !important; text-shadow: none !important; ${shiftCss} }
#a-app .a-gu[data-mid="${mid}"] {
    background: transparent !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    border-style: solid;
    border-color: transparent;
    border-image-source: url("${theme.receive}") !important;
    border-image-slice: ${theme.receiveSlice} fill !important;
    border-image-repeat: stretch;
    border-width: ${theme.receiveWidth} !important;
    min-width: calc(${m.recvBase}px + 3.4em);
    ${recvAR}
    padding: ${m.pad} !important;
    color: ${theme.textColor} !important;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.16));
}
#a-app .a-gu[data-mid="${mid}"] .a-txt, #a-app .a-gu[data-mid="${mid}"] { color: ${theme.textColor} !important; }
`;
}

/* 注入当前群聊的成员专属气泡样式层（进群聊 / 改设置 / 改气泡库后调用） */
function applyGroupMemberBubbleStyles(chatId) {
    document.querySelectorAll('style[id^="member-bubbles-for-"]').forEach(el => el.remove());
    if (!chatId || typeof db === 'undefined') return;
    const group = (db.groups || []).find(g => g.id === chatId);
    if (!group) return;
    const map = group.memberBubbleThemes || {};
    let css = '';
    Object.keys(map).forEach(mid => {
        const theme = getBubbleTheme(map[mid]);
        if (theme && theme.receive) css += _memberBubbleRule(String(mid), theme);
        /* 主题自带的自定义 CSS：与全局气泡库同语义，作用于聊天页（编辑气泡里的代码改了就生效） */
        if (theme && typeof theme.customCss === 'string' && theme.customCss.trim()) {
            css += '\n/* 成员气泡「' + theme.name + '」自定义 CSS */\n' + theme.customCss + '\n';
        }
    });
    if (!css) return;
    const st = document.createElement('style');
    st.id = 'member-bubbles-for-' + chatId;
    st.textContent = '/* 群聊成员专属气泡 */\n' + css;
    document.head.appendChild(st);
}

/* ════════════════════════════════════════════════════════
   全屏气泡库（白色液态玻璃风）
   · 顶栏：返回 ‹ | 标题居中 | 右上角液态玻璃 ＋（进入创建页）
   · 用户气泡卡片常驻 × 删除；点卡片即选用
   · 创建页：命名 / 本地上传异形背景图 / 贴纸合成 / 文字九宫格定位
   ════════════════════════════════════════════════════════ */

let _blOnPick = null;
let _blCurrent = '';
let _blOverlayReady = false;

/* 豹宝图标图库状态 */
let _bbpStyle = 'thin';
let _bbpQuery = '';

/* 创建页状态 */
const _blCreate = {
    editingId: null,                   // 非空 = 正在编辑已有气泡（保存时原地更新，id 不变）
    name: '',
    sendRaw: '', recvRaw: '',          // 上传原图（原比例保留）
    sendSrc: '', recvSrc: '',          // 背景调整后的图
    sendGeo: null, recvGeo: null,
    textPad: { t: 2, r: 4, b: 4, l: 4 },   // 文字位置数值（px）
    stickerSrc: '', stickerX: 82, stickerY: 18, stickerScale: 32,  // 贴纸 X/Y 百分比 + 大小
    bgOX: 0, bgOY: 0, bgSX: 100, bgSY: 100, // 背景移动/压缩（%）
    customCss: ''
};

/* 长按状态 */
let _blLPFired = false;
let _blLPTimer = null;

function _ensureBubbleLibOverlay() {
    if (_blOverlayReady) return;
    const st = document.createElement('style');
    st.id = 'bubble-lib-overlay-style';
    st.textContent = `
        /* ── 气泡库主页面：白色为主 · 液态玻璃 ── */
        #bubble-library-overlay { position: fixed; inset: 0; z-index: 10000; display: none; flex-direction: column;
            background: linear-gradient(165deg, #f8f9fc 0%, #eef1f7 48%, #f4f0f6 100%); }
        #bubble-library-overlay.visible { display: flex; }
        .blo-header { position: relative; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
            background: rgba(255,255,255,0.55);
            -webkit-backdrop-filter: blur(24px) saturate(1.7); backdrop-filter: blur(24px) saturate(1.7);
            border-bottom: 1px solid rgba(255,255,255,0.7); }
        .blo-title { position: absolute; left: 50%; transform: translateX(-50%); font-size: 17px; font-weight: 700; color: #2b2b31; letter-spacing: .5px; pointer-events: none; }
        .blo-back { width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(255,255,255,0.75); color: #4a4a52; font-size: 24px; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 14px rgba(31,41,66,0.10), inset 0 1px 0 rgba(255,255,255,0.9); }
        .blo-back:active { transform: scale(.93); }
        .blo-plus { width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(255,255,255,0.78); color: #ff5c95; font-size: 22px; font-weight: 300; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
            box-shadow: 0 6px 18px rgba(31,41,66,0.14), inset 0 1px 0 rgba(255,255,255,0.95); }
        .blo-plus:active { transform: scale(.92); }
        .blo-search { padding: 12px 14px 4px; flex-shrink: 0; }
        .blo-search input { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.85); outline: none;
            background: rgba(255,255,255,0.62);
            -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
            border-radius: 16px; padding: 10px 16px; font-size: 14px;
            box-shadow: inset 0 1px 4px rgba(31,41,66,0.06); }
        .blo-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
            padding: 14px 16px calc(26px + env(safe-area-inset-bottom, 0px)); align-content: start; -webkit-overflow-scrolling: touch; }
        .blo-card { position: relative; text-align: center; cursor: pointer; border-radius: 20px; padding: 14px 10px 10px;
            background: rgba(255,255,255,0.72);
            -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
            border: 1.5px solid rgba(255,255,255,0.9);
            box-shadow: 0 8px 24px rgba(31,41,66,0.08);
            transition: transform .12s, box-shadow .2s, border-color .15s; }
        .blo-card:active { transform: scale(.97); }
        .blo-card.selected { border-color: rgba(255,107,157,0.7); background: rgba(255,255,255,0.92);
            box-shadow: 0 8px 26px rgba(255,107,157,0.20); }
        .blo-preview { height: 104px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; overflow: hidden; }
        .blo-preview .bubble-lib-sample { font-size: 12px; }
        .blo-name { font-size: 12.5px; color: #3c3c43; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .blo-card.selected .blo-name { color: #ff5c95; font-weight: 700; }
        .blo-badge { position: absolute; top: 8px; left: 8px; font-size: 9px; background: rgba(255,107,157,0.14);
            color: #ff5c95; border-radius: 8px; padding: 2px 7px; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
        .blo-del { position: absolute; top: 2px; right: 4px; border: none; background: none; font-size: 17px; color: #c6c8d0; cursor: pointer; padding: 5px; line-height: 1; }
        .blo-del:active { color: #ff5a5a; }
        .blo-empty { grid-column: 1 / -1; text-align: center; color: #9a9aa4; padding: 48px 0; font-size: 13px; }
        .blo-hint { padding: 0 16px 6px; font-size: 11px; color: #a8aab4; text-align: center; flex-shrink: 0; }
        /* ── 长按气泡操作单（液态玻璃） ── */
        #bubble-theme-actions { position: fixed; inset: 0; z-index: 10040; display: flex; align-items: flex-end; justify-content: center;
            background: rgba(24,26,33,0.30); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
            opacity: 0; transition: opacity .18s; padding: 0 14px calc(22px + env(safe-area-inset-bottom, 0px)); }
        #bubble-theme-actions.visible { opacity: 1; }
        .bta-sheet { width: 100%; max-width: 360px; background: rgba(255,255,255,0.92);
            -webkit-backdrop-filter: blur(28px) saturate(1.7); backdrop-filter: blur(28px) saturate(1.7);
            border-radius: 26px; padding: 12px; box-shadow: 0 24px 60px rgba(20,24,38,0.28);
            display: flex; flex-direction: column; gap: 6px;
            transform: translateY(14px); transition: transform .18s; }
        #bubble-theme-actions.visible .bta-sheet { transform: translateY(0); }
        .bta-title { text-align: center; font-size: 13px; font-weight: 700; color: #2f2f36; padding: 6px 0 8px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bta-btn { border: none; cursor: pointer; border-radius: 18px; padding: 13px; font-size: 15px; font-weight: 600;
            color: #2f2f36; background: rgba(31,41,66,0.05); }
        .bta-btn:active { transform: scale(.97); background: rgba(31,41,66,0.10); }
        .bta-btn.danger { color: #ff3b30; }
        .bta-btn.cancel { font-weight: 700; background: linear-gradient(135deg, #ff9cba, #ff6b9d); color: #fff;
            box-shadow: 0 8px 20px rgba(255,107,157,0.28); }
        .blo-default-sample { display: inline-block; background: rgba(255,255,255,0.95); border: 1px solid #e7e8ee; border-radius: 16px; padding: 10px 15px; color: #333; font-size: 12px; box-shadow: 0 3px 10px rgba(31,41,66,0.06); }
        .blo-actions { display: flex; align-items: center; gap: 8px; }
        .blo-baobao { width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(255,255,255,0.78); display: flex; align-items: center; justify-content: center;
            -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
            box-shadow: 0 6px 18px rgba(31,41,66,0.14), inset 0 1px 0 rgba(255,255,255,0.95); }
        .blo-baobao img { width: 23px; height: 23px; object-fit: contain; pointer-events: none; }
        .blo-baobao:active { transform: scale(.92); }

        /* ── 豹宝图标图库 ── */
        #baobao-picker-overlay { position: fixed; inset: 0; z-index: 10020; display: none; flex-direction: column;
            background: linear-gradient(165deg, #f8f9fc 0%, #eef1f7 48%, #f4f0f6 100%); }
        #baobao-picker-overlay.visible { display: flex; }
        .bbp-header { position: relative; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
            background: rgba(255,255,255,0.55);
            -webkit-backdrop-filter: blur(24px) saturate(1.7); backdrop-filter: blur(24px) saturate(1.7);
            border-bottom: 1px solid rgba(255,255,255,0.7); }
        .bbp-count { min-width: 38px; height: 26px; box-sizing: border-box; padding: 0 10px; border-radius: 13px;
            display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
            color: #ff5c95; background: rgba(255,107,157,0.13); }
        .bbp-search { padding: 12px 14px 2px; flex-shrink: 0; }
        .bbp-search input { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.85); outline: none;
            background: rgba(255,255,255,0.62);
            -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
            border-radius: 16px; padding: 10px 16px; font-size: 14px;
            box-shadow: inset 0 1px 4px rgba(31,41,66,0.06); }
        .bbp-styles { display: flex; gap: 8px; overflow-x: auto; padding: 10px 14px 4px; flex-shrink: 0;
            -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .bbp-styles::-webkit-scrollbar { display: none; }
        .bbp-chip { flex: none; border: 1px solid rgba(255,255,255,0.9); background: rgba(255,255,255,0.62); color: #555863;
            border-radius: 14px; padding: 7px 13px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
            box-shadow: 0 3px 10px rgba(31,41,66,0.05); }
        .bbp-chip.active { background: linear-gradient(135deg, #ff9cba, #ff6b9d); color: #fff; border-color: transparent;
            box-shadow: 0 6px 16px rgba(255,107,157,0.28); }
        .bbp-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
            padding: 10px 14px 14px; align-content: start; -webkit-overflow-scrolling: touch; }
        .bbp-tile { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 4px 7px;
            border-radius: 16px; background: rgba(255,255,255,0.72); border: 1px solid rgba(255,255,255,0.9);
            box-shadow: 0 5px 14px rgba(31,41,66,0.06); cursor: pointer; transition: transform .12s; }
        .bbp-tile:active { transform: scale(.94); }
        .bbp-tile img { width: 34px; height: 34px; object-fit: contain; pointer-events: none; }
        .bbp-tile span { font-size: 9.5px; color: #6b6e7a; text-align: center; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; max-width: 100%; line-height: 1.2; }
        .bbp-empty { grid-column: 1 / -1; text-align: center; color: #9a9aa4; padding: 48px 0; font-size: 13px; }
        .bbp-footer { flex-shrink: 0; text-align: center; font-size: 10px; color: #9a9aa4;
            padding: 0 14px calc(10px + env(safe-area-inset-bottom, 0px)); line-height: 1.5; }
        #bbp-preview { position: fixed; inset: 0; z-index: 10030; display: none; align-items: center; justify-content: center;
            background: rgba(24,26,33,0.35); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 28px; }
        #bbp-preview.visible { display: flex; }
        .bbp-preview-card { width: 100%; max-width: 280px; background: rgba(255,255,255,0.94); border-radius: 26px;
            padding: 22px 18px 18px; text-align: center; box-shadow: 0 24px 60px rgba(20,24,38,0.24);
            display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .bbp-preview-icon { width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; }
        .bbp-preview-icon img { width: 110px; height: 110px; object-fit: contain; }
        .bbp-preview-name { font-size: 15px; font-weight: 700; color: #2b2b31; }
        .bbp-preview-meta { font-size: 11px; color: #8b8e99; }
        .bbp-preview-close { margin-top: 8px; width: 100%; border: none; border-radius: 16px; padding: 11px;
            font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #ff9cba, #ff6b9d);
            cursor: pointer; box-shadow: 0 8px 20px rgba(255,107,157,0.3); }
        .bbp-preview-close:active { transform: scale(.97); }

        /* ── 气泡创建页 ── */
        #bubble-creator-overlay { position: fixed; inset: 0; z-index: 10010; display: none; flex-direction: column;
            background: linear-gradient(165deg, #f8f9fc 0%, #eef1f7 48%, #f4f0f6 100%); }
        #bubble-creator-overlay.visible { display: flex; }
        .bcr-header { position: relative; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
            background: rgba(255,255,255,0.55);
            -webkit-backdrop-filter: blur(24px) saturate(1.7); backdrop-filter: blur(24px) saturate(1.7);
            border-bottom: 1px solid rgba(255,255,255,0.7); }
        .bcr-save-mini { border: none; cursor: pointer; border-radius: 14px; padding: 8px 18px; font-size: 13px; font-weight: 700; color: #fff;
            background: linear-gradient(135deg, #ff9cba, #ff6b9d); box-shadow: 0 6px 16px rgba(255,107,157,0.35); }
        .bcr-save-mini:active { transform: scale(.95); }
        .bcr-body { flex: 1; overflow-y: auto; padding: 14px 16px calc(28px + env(safe-area-inset-bottom, 0px));
            display: flex; flex-direction: column; gap: 14px; -webkit-overflow-scrolling: touch; }
        .bcr-card { background: rgba(255,255,255,0.66);
            -webkit-backdrop-filter: blur(20px) saturate(1.6); backdrop-filter: blur(20px) saturate(1.6);
            border: 1px solid rgba(255,255,255,0.85); border-radius: 20px; padding: 14px;
            box-shadow: 0 8px 24px rgba(31,41,66,0.07); }
        .bcr-label { font-size: 13px; font-weight: 700; color: #2f2f36; margin-bottom: 10px;
            display: flex; justify-content: space-between; align-items: center; }
        .bcr-head { font-size: 13px; font-weight: 700; color: #2f2f36; display: flex;
            justify-content: space-between; align-items: center; cursor: pointer; user-select: none;
            -webkit-user-select: none; padding: 2px 0; }
        .bcr-chev { color: #a2a5b2; font-size: 12px; transition: transform .18s; flex: none; margin-left: 8px; }
        .bcr-card.open .bcr-chev { transform: rotate(180deg); }
        .bcr-card-body { display: none; margin-top: 10px; }
        .bcr-card.open .bcr-card-body { display: block; }
        .bcr-name-input { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.9); outline: none;
            background: rgba(255,255,255,0.8); border-radius: 14px; padding: 11px 14px; font-size: 14px;
            box-shadow: inset 0 1px 3px rgba(31,41,66,0.05); }
        .bcr-uploads { display: flex; gap: 12px; }
        .bcr-upload { flex: 1; min-height: 108px; border: 1.5px dashed rgba(31,41,66,0.18); border-radius: 16px;
            background: rgba(255,255,255,0.5); display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 6px; cursor: pointer; overflow: hidden; position: relative; transition: border-color .15s; }
        .bcr-upload:active { border-color: rgba(255,107,157,0.5); }
        .bcr-upload.filled { border-style: solid; border-color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.75); }
        .bcr-upload img { max-width: 88%; max-height: 88%; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(31,41,66,0.14)); }
        .bcr-up-icon { font-size: 21px; color: #b9bcc8; line-height: 1; }
        .bcr-up-text { font-size: 11px; color: #8b8e99; }
        .bcr-preview { border-radius: 18px; padding: 16px 14px; background: linear-gradient(135deg, #e8edf5, #f5edf2);
            display: flex; flex-direction: column; gap: 12px; min-height: 120px; }
        .bcr-row { display: flex; }
        .bcr-row.sent { justify-content: flex-end; }
        .bcr-bubble { display: inline-block; border-style: solid; border-color: transparent; border-image-repeat: stretch;
            font-size: 13px; line-height: 1.55; max-width: 80%; word-break: break-word; position: relative; }
        .bcr-stk { position: absolute; pointer-events: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.16)); }
        .bcr-mini-btn { border: none; background: rgba(31,41,66,0.07); color: #6b6e7a; border-radius: 10px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
        .bcr-size-slider { width: 100%; accent-color: #ff6b9d; margin: 0; }
        .bcr-num-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .bcr-num { flex: 1; min-width: 64px; display: flex; flex-direction: column; gap: 4px; }
        .bcr-num label { font-size: 11px; font-weight: 600; color: #8b8e99; text-align: center; }
        .bcr-num input { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.9);
            background: rgba(255,255,255,0.85); border-radius: 10px; padding: 8px 4px; font-size: 14px;
            text-align: center; outline: none; box-shadow: inset 0 1px 3px rgba(31,41,66,0.05); }
        .bcr-num input:focus { border-color: rgba(255,107,157,0.55); }
        .bcr-arrow-row { display: flex; gap: 8px; justify-content: center; }
        .bcr-arrow { border: none; background: rgba(31,41,66,0.07); color: #555863; border-radius: 10px;
            width: 40px; height: 32px; font-size: 14px; cursor: pointer; }
        .bcr-arrow:active { transform: scale(.92); background: rgba(255,107,157,0.16); }
        .bcr-css { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.9);
            background: rgba(255,255,255,0.85); border-radius: 12px; padding: 10px 12px; font-size: 12px;
            font-family: Consolas, Menlo, monospace; line-height: 1.5; color: #333; outline: none;
            resize: vertical; min-height: 92px; box-shadow: inset 0 1px 3px rgba(31,41,66,0.05); }
        .bcr-css:focus { border-color: rgba(255,107,157,0.55); }
        .bcr-sticker-tools { flex: 1; display: flex; flex-direction: column; gap: 12px; justify-content: center; align-items: center; }
        .bcr-ktheme-btn { width: 100%; border: 1px solid rgba(31,41,66,0.1); background: rgba(255,255,255,0.75); color: #555863;
            border-radius: 14px; padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .bcr-ktheme-btn:active { transform: scale(.98); }
        .bcr-save-big { width: 100%; border: none; border-radius: 18px; padding: 13px; font-size: 15px; font-weight: 700; color: #fff;
            background: linear-gradient(135deg, #ff9cba, #ff6b9d); box-shadow: 0 10px 26px rgba(255,107,157,0.35); cursor: pointer; }
        .bcr-save-big:active { transform: scale(.98); }
    `;
    document.head.appendChild(st);

    const ov = document.createElement('div');
    ov.id = 'bubble-library-overlay';
    ov.innerHTML = `
        <div class="blo-header">
            <button class="blo-back" id="blo-back">‹</button>
            <div class="blo-title" id="blo-title">气泡库</div>
            <div class="blo-actions">
                <button class="blo-baobao" id="blo-baobao" aria-label="豹宝图标"><img src="assets/baobao-icons/svg/thin/seal-face.svg" alt=""></button>
                <button class="blo-plus" id="blo-plus" aria-label="创建气泡">＋</button>
            </div>
        </div>
        <div class="blo-search"><input id="blo-search" type="text" placeholder="搜索气泡名字"></div>
        <div class="blo-hint">长按气泡可编辑或删除</div>
        <div class="blo-grid" id="blo-grid"></div>
        <input type="file" id="blo-file" accept=".ktheme,.zip,image/png" multiple style="display:none">`;
    document.body.appendChild(ov);

    /* ── 豹宝图标图库（压在气泡库上面）── */
    const bbp = document.createElement('div');
    bbp.id = 'baobao-picker-overlay';
    bbp.innerHTML = `
        <div class="bbp-header">
            <button class="blo-back" id="bbp-back">‹</button>
            <div class="blo-title">豹宝图标</div>
            <div class="bbp-count" id="bbp-count">0</div>
        </div>
        <div class="bbp-search"><input id="bbp-search" type="text" placeholder="搜索图标名字，比如 搜索、睡觉"></div>
        <div class="bbp-styles" id="bbp-styles"></div>
        <div class="bbp-grid" id="bbp-grid"></div>
        <div class="bbp-footer">图标：豹宝图标 by @唐幡 · CC BY-NC 4.0 · 仅限非商业使用</div>`;
    document.body.appendChild(bbp);

    const bbpp = document.createElement('div');
    bbpp.id = 'bbp-preview';
    bbpp.innerHTML = `
        <div class="bbp-preview-card">
            <div class="bbp-preview-icon" id="bbp-preview-icon"></div>
            <div class="bbp-preview-name" id="bbp-preview-name"></div>
            <div class="bbp-preview-meta" id="bbp-preview-meta"></div>
            <button type="button" class="bbp-preview-close" id="bbp-preview-close">关闭</button>
        </div>`;
    document.body.appendChild(bbpp);

    /* ── 气泡创建页（全屏，压在气泡库上面）── */
    const cr = document.createElement('div');
    cr.id = 'bubble-creator-overlay';
    cr.innerHTML = `
        <div class="bcr-header">
            <button class="blo-back" id="bcr-back">‹</button>
            <div class="blo-title" id="bcr-title">创建气泡</div>
            <button class="bcr-save-mini" id="bcr-save-top">保存</button>
        </div>
        <div class="bcr-body">
            <div class="bcr-card">
                <div class="bcr-preview" id="bcr-preview"></div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">气泡名字 <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <input class="bcr-name-input" id="bcr-name" maxlength="12" placeholder="我的气泡">
                </div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">气泡背景图 <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <div class="bcr-uploads">
                        <div class="bcr-upload" id="bcr-up-recv"></div>
                        <div class="bcr-upload" id="bcr-up-send"></div>
                        <input type="file" id="bcr-file-send" accept="image/png,image/webp" style="display:none">
                        <input type="file" id="bcr-file-recv" accept="image/png,image/webp" style="display:none">
                    </div>
                </div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">背景调整 <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <div class="bcr-num-row" id="bcr-bgadj"></div>
                </div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">文字位置 <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <div class="bcr-num-row" id="bcr-textpad"></div>
                </div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">贴纸 <button type="button" class="bcr-mini-btn" id="bcr-sticker-del" style="display:none">移除贴纸</button> <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <div class="bcr-uploads">
                        <div class="bcr-upload" id="bcr-up-sticker"></div>
                        <input type="file" id="bcr-file-sticker" accept="image/png,image/webp" style="display:none">
                        <div class="bcr-sticker-tools" id="bcr-sticker-tools" style="display:none">
                            <div class="bcr-num-row" id="bcr-stkxy" style="width:100%"></div>
                            <div class="bcr-arrow-row">
                                <button type="button" class="bcr-arrow" id="bcr-stk-left" aria-label="左移">←</button>
                                <button type="button" class="bcr-arrow" id="bcr-stk-up" aria-label="上移">↑</button>
                                <button type="button" class="bcr-arrow" id="bcr-stk-down" aria-label="下移">↓</button>
                                <button type="button" class="bcr-arrow" id="bcr-stk-right" aria-label="右移">→</button>
                            </div>
                            <input type="range" class="bcr-size-slider" id="bcr-stksize" min="10" max="70" value="32">
                        </div>
                    </div>
                </div>
            </div>
            <div class="bcr-card">
                <div class="bcr-head">自定义 CSS <span class="bcr-chev">▾</span></div>
                <div class="bcr-card-body">
                    <textarea class="bcr-css" id="bcr-css" rows="4" spellcheck="false"></textarea>
                </div>
            </div>
            <div class="bcr-card">
                <button type="button" class="bcr-ktheme-btn" id="bcr-ktheme">导入 .ktheme / 成对 PNG 文件</button>
            </div>
            <button type="button" class="bcr-save-big" id="bcr-save-big">保存到气泡库</button>
        </div>`;
    document.body.appendChild(cr);

    /* ── 气泡库事件 ── */
    document.getElementById('blo-back').addEventListener('click', _closeBubbleLibOverlay);
    document.getElementById('blo-search').addEventListener('input', () => _renderBubbleLibGrid(document.getElementById('blo-search').value.trim()));
    document.getElementById('blo-plus').addEventListener('click', _openPlusMenu);
    document.getElementById('blo-file').addEventListener('change', _handleBubbleImport);

    /* ── 加号底部菜单：创建气泡 / 管理聊天预设 ── */
    function _openPlusMenu() {
        let menu = document.getElementById('blo-plus-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'blo-plus-menu';
            menu.style.cssText = 'position:fixed;inset:0;z-index:3100;background:rgba(0,0,0,0.35);display:none;align-items:flex-end;justify-content:center;';
            menu.innerHTML = '<div style="width:88%;max-width:360px;margin:0 auto 24px;background:#fff;border-radius:16px;overflow:hidden;">'
                + '<button type="button" id="blo-pm-create" style="display:block;width:100%;padding:16px 0;border:none;border-bottom:0.5px solid rgba(0,0,0,0.08);background:#fff;font-size:15px;color:#111;cursor:pointer;">创建气泡</button>'
                + '<button type="button" id="blo-pm-manage" style="display:block;width:100%;padding:16px 0;border:none;background:#fff;font-size:15px;color:#111;cursor:pointer;">管理聊天预设</button>'
                + '<button type="button" id="blo-pm-cancel" style="display:block;width:calc(100% - 16px);margin:8px;padding:14px 0;border:none;border-radius:16px;background:#f2f3f7;font-size:15px;font-weight:600;color:#111;cursor:pointer;">取消</button>'
                + '</div>';
            document.body.appendChild(menu);
            menu.addEventListener('click', (e) => { if (e.target === menu) menu.style.display = 'none'; });
            menu.querySelector('#blo-pm-cancel').addEventListener('click', () => { menu.style.display = 'none'; });
            menu.querySelector('#blo-pm-create').addEventListener('click', () => {
                menu.style.display = 'none';
                _openBubbleCreator();
            });
            menu.querySelector('#blo-pm-manage').addEventListener('click', () => {
                menu.style.display = 'none';
                if (typeof openManagePresetsModal === 'function') openManagePresetsModal();
                else showToast('预设管理组件未加载');
            });
        }
        menu.style.display = 'flex';
    }

    /* ── 豹宝图标图库事件 ── */
    document.getElementById('blo-baobao').addEventListener('click', _bbpOpen);
    document.getElementById('bbp-back').addEventListener('click', _bbpClose);
    document.getElementById('bbp-search').addEventListener('input', (e) => {
        _bbpQuery = e.target.value.trim();
        _bbpRenderGrid();
    });
    document.getElementById('bbp-styles').addEventListener('click', (e) => {
        const chip = e.target.closest('.bbp-chip');
        if (!chip) return;
        _bbpStyle = chip.dataset.style;
        _bbpRenderStyles();
        _bbpRenderGrid();
    });
    document.getElementById('bbp-grid').addEventListener('click', (e) => {
        const tile = e.target.closest('.bbp-tile');
        if (tile) _bbpShowPreview(tile.dataset.name);
    });
    document.getElementById('bbp-preview-close').addEventListener('click', _bbpClosePreview);
    bbpp.addEventListener('click', (e) => { if (e.target === bbpp) _bbpClosePreview(); });

    /* ── 创建页事件 ── */
    document.getElementById('bcr-back').addEventListener('click', _closeBubbleCreator);
    document.getElementById('bcr-save-top').addEventListener('click', _blSaveCreated);
    document.getElementById('bcr-save-big').addEventListener('click', _blSaveCreated);
    document.getElementById('bcr-up-send').addEventListener('click', () => document.getElementById('bcr-file-send').click());
    document.getElementById('bcr-up-recv').addEventListener('click', () => document.getElementById('bcr-file-recv').click());
    document.getElementById('bcr-up-sticker').addEventListener('click', () => document.getElementById('bcr-file-sticker').click());
    document.getElementById('bcr-file-send').addEventListener('change', e => _blHandleBubbleUpload(e, 'send'));
    document.getElementById('bcr-file-recv').addEventListener('change', e => _blHandleBubbleUpload(e, 'recv'));
    document.getElementById('bcr-file-sticker').addEventListener('change', e => _blHandleBubbleUpload(e, 'sticker'));
    document.getElementById('bcr-sticker-del').addEventListener('click', e => {
        e.stopPropagation();
        _blCreate.stickerSrc = '';
        _blRenderCreatorTools();
    });
    /* 手风琴：点击栏头展开/收起 */
    cr.querySelectorAll('.bcr-card .bcr-head').forEach(h => {
        h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
    });
    document.getElementById('bcr-stksize').addEventListener('input', e => {
        _blCreate.stickerScale = Number(e.target.value) || 32;
        _blRenderCreatorPreview();
    });
    document.getElementById('bcr-ktheme').addEventListener('click', () => document.getElementById('blo-file').click());
    document.getElementById('bcr-css').addEventListener('input', e => {
        _blCreate.customCss = e.target.value;
        _blSyncPreviewCss();
    });
    const nudge = (dx, dy) => {
        _blCreate.stickerX = Math.min(100, Math.max(0, _blCreate.stickerX + dx));
        _blCreate.stickerY = Math.min(100, Math.max(0, _blCreate.stickerY + dy));
        _blSyncCreatorNumFields();
        _blRenderCreatorPreview();
    };
    document.getElementById('bcr-stk-left').addEventListener('click', () => nudge(-2, 0));
    document.getElementById('bcr-stk-right').addEventListener('click', () => nudge(2, 0));
    document.getElementById('bcr-stk-up').addEventListener('click', () => nudge(0, -2));
    document.getElementById('bcr-stk-down').addEventListener('click', () => nudge(0, 2));

    _blBuildCreatorFields();
    _blOverlayReady = true;
}

/* 数值输入框（label + number input） */
function _blNumField(label, value, min, max, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'bcr-num';
    const lab = document.createElement('label');
    lab.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = value; inp.min = min; inp.max = max;
    inp.addEventListener('input', () => onInput(Number(inp.value) || 0));
    wrap.appendChild(lab); wrap.appendChild(inp);
    return wrap;
}

/* 一次性构建：背景调整 / 文字位置 / 贴纸 X·Y·大小 数值控件 */
function _blBuildCreatorFields() {
    const bgBox = document.getElementById('bcr-bgadj');
    if (bgBox && !bgBox.childElementCount) {
        [['左右移动', 'bgOX', -50, 50], ['上下移动', 'bgOY', -50, 50],
         ['左右压缩', 'bgSX', 50, 200], ['上下压缩', 'bgSY', 50, 200]].forEach(([label, key, min, max]) => {
            const f = _blNumField(label, _blCreate[key], min, max, v => {
                _blCreate[key] = v;
                _blScheduleBgAdjust();
            });
            f.dataset.key = key;
            bgBox.appendChild(f);
        });
    }
    const tpBox = document.getElementById('bcr-textpad');
    if (tpBox && !tpBox.childElementCount) {
        [['上', 't'], ['右', 'r'], ['下', 'b'], ['左', 'l']].forEach(([label, key]) => {
            const f = _blNumField(label, _blCreate.textPad[key], -60, 60, v => {
                _blCreate.textPad[key] = v;
                _blRenderCreatorPreview();
            });
            f.dataset.key = key;
            tpBox.appendChild(f);
        });
    }
    const skBox = document.getElementById('bcr-stkxy');
    if (skBox && !skBox.childElementCount) {
        [['X', 'stickerX', 0, 100], ['Y', 'stickerY', 0, 100], ['大小', 'stickerScale', 5, 90]].forEach(([label, key, min, max]) => {
            const f = _blNumField(label, _blCreate[key], min, max, v => {
                _blCreate[key] = v;
                _blRenderCreatorPreview();
            });
            f.dataset.key = key;
            skBox.appendChild(f);
        });
    }
}

/* 把状态同步回数值输入框 */
function _blSyncCreatorNumFields() {
    document.querySelectorAll('#bcr-bgadj input, #bcr-textpad input, #bcr-stkxy input').forEach(inp => {
        const box = inp.closest('.bcr-num');
        const key = box && box.dataset.key;
        if (!key) return;
        inp.value = ['t', 'r', 'b', 'l'].includes(key) ? _blCreate.textPad[key] : _blCreate[key];
    });
    const sizeEl = document.getElementById('bcr-stksize');
    if (sizeEl) sizeEl.value = _blCreate.stickerScale;
}

/* ══ 豹宝图标图库（本地图标：assets/baobao-icons） ══ */
function _bbpData() {
    return window.BAOBAO_ICON_DATA || null;
}

function _bbpEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _bbpAvailableIcons() {
    const data = _bbpData();
    if (!data) return [];
    const q = _bbpQuery.toLowerCase();
    let list = data.icons.filter(i => !q || `${i.label} ${i.name}`.toLowerCase().includes(q));
    if (_bbpStyle.includes('sleep')) list = list.filter(i => i.sleep);
    return list;
}

function _bbpOpen() {
    _ensureBubbleLibOverlay();
    const ov = document.getElementById('baobao-picker-overlay');
    if (!ov) return;
    _bbpStyle = 'thin';
    _bbpQuery = '';
    const si = document.getElementById('bbp-search');
    if (si) si.value = '';
    _bbpRenderStyles();
    _bbpRenderGrid();
    ov.classList.add('visible');
    const grid = document.getElementById('bbp-grid');
    if (grid) grid.scrollTop = 0;
}

function _bbpClose() {
    _bbpClosePreview();
    const ov = document.getElementById('baobao-picker-overlay');
    if (ov) ov.classList.remove('visible');
}

function _bbpStyleList() {
    const data = _bbpData();
    return data && Array.isArray(data.styles) ? data.styles : [];
}

function _bbpStyleLabel(id) {
    const s = _bbpStyleList().find(x => x.id === id);
    return s ? s.label : id;
}

function _bbpRenderStyles() {
    const box = document.getElementById('bbp-styles');
    if (!box) return;
    box.innerHTML = _bbpStyleList().map(s =>
        `<button type="button" class="bbp-chip${s.id === _bbpStyle ? ' active' : ''}" data-style="${_bbpEsc(s.id)}">${_bbpEsc(s.label)}</button>`
    ).join('');
}

function _bbpRenderGrid() {
    const grid = document.getElementById('bbp-grid');
    if (!grid) return;
    const data = _bbpData();
    if (!data) {
        grid.innerHTML = '<div class="bbp-empty">图标数据未加载</div>';
        return;
    }
    const list = _bbpAvailableIcons();
    const counter = document.getElementById('bbp-count');
    if (counter) counter.textContent = String(list.length);
    if (!list.length) {
        grid.innerHTML = '<div class="bbp-empty">没有找到图标</div>';
        return;
    }
    grid.innerHTML = list.map(i => {
        const src = `assets/baobao-icons/svg/${_bbpStyle}/${_bbpEsc(i.name)}.svg`;
        return `<button type="button" class="bbp-tile" data-name="${_bbpEsc(i.name)}" title="${_bbpEsc(i.label)}">
            <img src="${src}" alt="${_bbpEsc(i.label)}" draggable="false">
            <span>${_bbpEsc(i.label)}</span>
        </button>`;
    }).join('');
}

function _bbpShowPreview(name) {
    const data = _bbpData();
    if (!data) return;
    const icon = data.icons.find(i => i.name === name);
    if (!icon) return;
    const box = document.getElementById('bbp-preview');
    const iconBox = document.getElementById('bbp-preview-icon');
    if (!box || !iconBox) return;
    iconBox.innerHTML = `<img src="assets/baobao-icons/svg/${_bbpStyle}/${encodeURIComponent(icon.name)}.svg" alt="${_bbpEsc(icon.label)}">`;
    document.getElementById('bbp-preview-name').textContent = icon.label;
    const typeLabel = icon.type === 'seal' ? '海豹' : '动作';
    document.getElementById('bbp-preview-meta').textContent = `${_bbpStyleLabel(_bbpStyle)} · ${typeLabel} · ${icon.name}`;
    box.classList.add('visible');
}

function _bbpClosePreview() {
    const box = document.getElementById('bbp-preview');
    if (box) box.classList.remove('visible');
}

function _closeBubbleLibOverlay() {
    _bbpClose();
    const ov = document.getElementById('bubble-library-overlay');
    if (ov) ov.classList.remove('visible');
}

function _openBubbleCreator(theme) {
    _ensureBubbleLibOverlay();
    if (theme && theme.id) {
        _blPrefillCreator(theme);
    } else {
        _blResetCreator();
    }
    /* 每次进入创建页，各栏默认收起 */
    document.querySelectorAll('#bubble-creator-overlay .bcr-card.open').forEach(c => c.classList.remove('open'));
    const tEl = document.getElementById('bcr-title');
    if (tEl) tEl.textContent = (theme && theme.id) ? '编辑气泡' : '创建气泡';
    document.getElementById('bubble-creator-overlay').classList.add('visible');
}

/* 编辑模式：把已有气泡的资料灌回创建页（名字/图片/文字位置/自定义 CSS 均可改） */
function _blPrefillCreator(theme) {
    _blResetCreator();
    _blCreate.editingId = theme.id;
    _blCreate.name = theme.name || '';
    _blCreate.sendRaw = theme.send || ''; _blCreate.sendSrc = theme.send || '';
    _blCreate.recvRaw = theme.receive || ''; _blCreate.recvSrc = theme.receive || '';
    _blCreate.sendGeo = { slice: theme.sendSlice, width: theme.sendWidth, textColor: theme.textColor, ratio: theme.sendRatio || null };
    _blCreate.recvGeo = { slice: theme.receiveSlice, width: theme.receiveWidth, textColor: theme.textColor, ratio: theme.receiveRatio || null };
    if (theme.textPad && typeof theme.textPad === 'object') {
        _blCreate.textPad = { t: Number(theme.textPad.t) || 0, r: Number(theme.textPad.r) || 0, b: Number(theme.textPad.b) || 0, l: Number(theme.textPad.l) || 0 };
    }
    _blCreate.customCss = theme.customCss || '';
    const nameEl = document.getElementById('bcr-name');
    if (nameEl) nameEl.value = _blCreate.name;
    const cssEl = document.getElementById('bcr-css');
    if (cssEl) cssEl.value = _blCreate.customCss;
    _blSyncPreviewCss();
    _blSyncCreatorNumFields();
    _blRenderCreatorTools();
}

function _closeBubbleCreator() {
    const cr = document.getElementById('bubble-creator-overlay');
    if (cr) cr.classList.remove('visible');
}

function _blResetCreator() {
    _blCreate.editingId = null;
    _blCreate.name = '';
    _blCreate.sendRaw = ''; _blCreate.recvRaw = '';
    _blCreate.sendSrc = ''; _blCreate.recvSrc = '';
    _blCreate.sendGeo = null; _blCreate.recvGeo = null;
    _blCreate.textPad = { t: 2, r: 4, b: 4, l: 4 };
    _blCreate.stickerSrc = ''; _blCreate.stickerX = 82; _blCreate.stickerY = 18; _blCreate.stickerScale = 32;
    _blCreate.bgOX = 0; _blCreate.bgOY = 0; _blCreate.bgSX = 100; _blCreate.bgSY = 100;
    _blCreate.customCss = '';
    const nameEl = document.getElementById('bcr-name');
    if (nameEl) nameEl.value = '';
    const cssEl = document.getElementById('bcr-css');
    if (cssEl) cssEl.value = '';
    _blSyncPreviewCss();
    _blSyncCreatorNumFields();
    _blRenderCreatorTools();
}

/* 上传图 → dataURL：只做等比限尺寸压缩（原比例保留），不改画幅 */
function _blFileToDataURL(file, maxDim) {
    return new Promise((resolve, reject) => {
        if (!file || !/^image\/(png|webp)$/i.test(file.type)) { reject(new Error('请选 PNG / WebP 图片')); return; }
        const fr = new FileReader();
        fr.onerror = reject;
        fr.onload = async () => {
            try {
                const img = await _blLoadImage(fr.result);
                const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                const k = Math.max(w, h) > maxDim ? maxDim / Math.max(w, h) : 1;
                if (k === 1) { resolve(fr.result); return; }
                const c = document.createElement('canvas');
                c.width = Math.round(w * k); c.height = Math.round(h * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/png'));
            } catch (err) { reject(err); }
        };
        fr.readAsDataURL(file);
    });
}

/* 判断图片是否有透明区域（决定用哪种切片算法） */
function _blImgHasAlpha(img) {
    try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 40) { if (d[i] < 200) return true; }
        return false;
    } catch (e) { return true; }
}

/* 不透明矩形图：按比例给四角留切片，避免整图被拉伸 */
function _blDefaultGeo(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const t = Math.round(h * 0.28), r = Math.round(w * 0.22), b = Math.round(h * 0.28), l = Math.round(w * 0.22);
    const half = v => Math.max(6, Math.round(v / 2)) + 'px';
    return { slice: `${t} ${r} ${b} ${l}`, width: `${half(t)} ${half(r)} ${half(b)} ${half(l)}`, textColor: '#333333', ratio: +(w / h).toFixed(4) };
}

function _blGeoFor(img) {
    return (_blImgHasAlpha(img) && _blComputeNineSlice(img)) || _blDefaultGeo(img);
}

async function _blHandleBubbleUpload(ev, which) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
        const dataUrl = await _blFileToDataURL(file, which === 'sticker' ? 600 : 1000);
        if (which === 'sticker') {
            _blCreate.stickerSrc = dataUrl;
            _blRenderCreatorTools();
        } else {
            /* 两边各自独立：左边角色气泡、右边用户气泡，互不影响 */
            if (which === 'send') {
                _blCreate.sendRaw = dataUrl;
            } else {
                _blCreate.recvRaw = dataUrl;
            }
            await _blApplyBgAdjust();
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('图片处理失败：' + (err && err.message ? err.message : '请重试'));
    }
}

/* 背景调整（防抖）：把原图按 移动/压缩 参数重绘到同尺寸画布，再按新图算九宫格切片 */
let _blBgAdjTimer = null;
function _blScheduleBgAdjust() {
    clearTimeout(_blBgAdjTimer);
    _blBgAdjTimer = setTimeout(() => { _blApplyBgAdjust(); }, 260);
}

/* 裁掉四周的透明边距（留 2px 呼吸边），让九宫格切片贴紧图形、比例还原更准。无透明边距时原样返回 */
function _blTrimAlpha(img) {
    try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return img;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        let top = h, bottom = -1, left = w, right = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (d[(y * w + x) * 4 + 3] > 24) {
                    if (y < top) top = y; if (y > bottom) bottom = y;
                    if (x < left) left = x; if (x > right) right = x;
                }
            }
        }
        if (bottom < 0) return img;
        const pad = 2;
        top = Math.max(0, top - pad); left = Math.max(0, left - pad);
        bottom = Math.min(h - 1, bottom + pad); right = Math.min(w - 1, right + pad);
        const tw = right - left + 1, th = bottom - top + 1;
        if (tw === w && th === h) return img;
        const c2 = document.createElement('canvas');
        c2.width = tw; c2.height = th;
        c2.getContext('2d').drawImage(img, left, top, tw, th, 0, 0, tw, th);
        return c2;
    } catch (e) { return img; }
}

async function _blApplyBgAdjust() {
    if (!_blCreate.sendRaw && !_blCreate.recvRaw) return;
    const ox = Number(_blCreate.bgOX) || 0, oy = Number(_blCreate.bgOY) || 0;
    const sx = (Number(_blCreate.bgSX) || 100) / 100, sy = (Number(_blCreate.bgSY) || 100) / 100;
    const needs = ox !== 0 || oy !== 0 || sx !== 1 || sy !== 1;
    for (const side of ['send', 'recv']) {
        const raw = _blCreate[side + 'Raw'];
        if (!raw) continue;
        let src = raw;
        if (needs) {
            const img = await _blLoadImage(raw);
            const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            const dw = W * sx, dh = H * sy;
            const dx = (W - dw) / 2 + ox / 100 * W;
            const dy = (H - dh) / 2 + oy / 100 * H;
            ctx.drawImage(img, dx, dy, dw, dh);
            src = c.toDataURL('image/png');
        }
        const trimmed = _blTrimAlpha(await _blLoadImage(src));
        const geo = _blGeoFor(trimmed);
        _blCreate[side + 'Src'] = (trimmed.toDataURL ? trimmed.toDataURL('image/png') : src);
        _blCreate[side + 'Geo'] = geo;
    }
    _blRenderCreatorTools();
}

/* 贴纸定位 CSS（预览用）：X/Y 为中心点百分比 */
function _blStickerCss(scale) {
    return `left:${_blCreate.stickerX}%;top:${_blCreate.stickerY}%;transform:translate(-50%,-50%);width:${scale}%;`;
}

/* 预览区同步用户自定义 CSS */
function _blSyncPreviewCss() {
    let el = document.getElementById('bcr-css-style');
    if (!el) {
        el = document.createElement('style');
        el.id = 'bcr-css-style';
        document.head.appendChild(el);
    }
    el.textContent = _blCreate.customCss || '';
}

/* 上传块 / 贴纸工具 重渲染 */
function _blRenderCreatorTools() {
    const tile = (el, src, label) => {
        if (!el) return;
        el.classList.toggle('filled', !!src);
        el.innerHTML = src
            ? `<img src="${src}" alt="">`
            : `<span class="bcr-up-icon">＋</span><span class="bcr-up-text">${label}</span>`;
    };
    tile(document.getElementById('bcr-up-send'), _blCreate.sendSrc, '用户气泡');
    tile(document.getElementById('bcr-up-recv'), _blCreate.recvSrc, '角色气泡');
    tile(document.getElementById('bcr-up-sticker'), _blCreate.stickerSrc, '贴纸');

    const tools = document.getElementById('bcr-sticker-tools');
    if (tools) tools.style.display = _blCreate.stickerSrc ? 'flex' : 'none';
    const delBtn = document.getElementById('bcr-sticker-del');
    if (delBtn) delBtn.style.display = _blCreate.stickerSrc ? '' : 'none';
    _blSyncCreatorNumFields();
    _blRenderCreatorPreview();
}

/* 创建页实时预览 */
function _blRenderCreatorPreview() {
    const pv = document.getElementById('bcr-preview');
    if (!pv) return;
    const n = v => Math.max(0, Math.round(Number(v) || 0));
    const pad = `${n(_blCreate.textPad.t)}px ${n(_blCreate.textPad.r)}px ${n(_blCreate.textPad.b)}px ${n(_blCreate.textPad.l)}px`;
    /* 负数文字位置：padding 钳到 0，超出部分用 translate 补 */
    const tp = _blCreate.textPad;
    const sx = ((Number(tp.l) || 0) < 0 ? Number(tp.l) : 0) + ((Number(tp.r) || 0) < 0 ? -Number(tp.r) : 0);
    const sy = ((Number(tp.t) || 0) < 0 ? Number(tp.t) : 0) + ((Number(tp.b) || 0) < 0 ? -Number(tp.b) : 0);
    const shiftSty = (sx || sy) ? `display:inline-block;transform:translate(${sx}px,${sy}px);` : '';
    const stk = _blCreate.stickerSrc
        ? `<img class="bcr-stk" src="${_blCreate.stickerSrc}" style="${_blStickerCss(_blCreate.stickerScale)}">`
        : '';
    const mk = (src, geo, cls) => {
        if (!src || !geo) {
            return `<div class="bcr-row ${cls}"><span class="blo-default-sample">你好呀</span></div>`;
        }
        return `<div class="bcr-row ${cls}"><span class="bcr-bubble message-bubble ${cls}" style="border-width:${geo.width};border-image-source:url('${src}');border-image-slice:${geo.slice} fill;color:${geo.textColor || '#333'};padding:${pad};${geo.ratio ? `aspect-ratio:${geo.ratio};` : ''}">${stk}<span class="bubble-content" style="${shiftSty}">今天也要开心呀</span></span></div>`;
    };
    pv.innerHTML = mk(_blCreate.recvSrc, _blCreate.recvGeo, 'received') + mk(_blCreate.sendSrc, _blCreate.sendGeo, 'sent');
}

/* 贴纸合成进气泡图（X/Y 中心点百分比 + 大小），返回 PNG dataURL */
function _blComposeSticker(srcImg, stickerImg, xPct, yPct, scaleFrac) {
    const W = srcImg.naturalWidth || srcImg.width, H = srcImg.naturalHeight || srcImg.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(srcImg, 0, 0);
    const sw = W * scaleFrac;
    const sh = sw * (stickerImg.naturalHeight || stickerImg.height) / (stickerImg.naturalWidth || stickerImg.width);
    const x = W * xPct / 100 - sw / 2;
    const y = H * yPct / 100 - sh / 2;
    ctx.drawImage(stickerImg, x, y, sw, sh);
    return c.toDataURL('image/png');
}

async function _blSaveCreated() {
    const nameEl = document.getElementById('bcr-name');
    const name = (nameEl && nameEl.value.trim()) || '我的气泡';
    if (!_blCreate.sendSrc && !_blCreate.recvSrc) {
        if (typeof showToast === 'function') showToast('先上传气泡背景图');
        return;
    }
    try {
        /* 只上传了一边时，另一边沿用同一张图 */
        let send = _blCreate.sendSrc || _blCreate.recvSrc;
        let recv = _blCreate.recvSrc || _blCreate.sendSrc;
        let sendGeo = _blCreate.sendGeo || _blCreate.recvGeo;
        let recvGeo = _blCreate.recvGeo || _blCreate.sendGeo;
        if (_blCreate.stickerSrc) {
            const st = await _blLoadImage(_blCreate.stickerSrc);
            const sImg = await _blLoadImage(send), rImg = await _blLoadImage(recv);
            const sc = _blCreate.stickerScale / 100;
            send = _blComposeSticker(sImg, st, _blCreate.stickerX, _blCreate.stickerY, sc);
            recv = _blComposeSticker(rImg, st, _blCreate.stickerX, _blCreate.stickerY, sc);
        }
        const payload = {
            name,
            send, receive: recv,
            sendSlice: sendGeo.slice, sendWidth: sendGeo.width,
            receiveSlice: recvGeo.slice, receiveWidth: recvGeo.width,
            sendRatio: sendGeo.ratio || null, receiveRatio: recvGeo.ratio || null,
            textColor: sendGeo.textColor || recvGeo.textColor || '#333333',
            textPad: { ..._blCreate.textPad },
            customCss: _blCreate.customCss || ''
        };
        const editingId = _blCreate.editingId;
        if (editingId) {
            /* 编辑模式：原地更新（id 不变，所有已选用该气泡的聊天/成员自动跟随） */
            const arr = getUserBubbleThemes();
            const idx = arr.findIndex(t => t.id === editingId);
            if (idx > -1) Object.assign(arr[idx], payload);
            if (typeof saveData === 'function') await saveData();
            _closeBubbleCreator();
            _renderBubbleLibGrid((document.getElementById('blo-search') || { value: '' }).value.trim());
            /* 当前聊天若正在用这个气泡（全局/聊天级/群成员级），立即重应用 */
            if (typeof currentChatId !== 'undefined' && currentChatId && typeof applyBubbleThemeForChat === 'function') {
                try { applyBubbleThemeForChat(currentChatId); } catch (e) { /* 忽略 */ }
            }
            /* 群设置的成员气泡列表若在屏上，同步刷新名字 */
            if (typeof renderGroupMemberBubbleList === 'function') { try { renderGroupMemberBubbleList(); } catch (e) { /* 忽略 */ } }
            if (typeof showToast === 'function') showToast(`「${name}」已更新`);
        } else {
            const theme = Object.assign({ id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) }, payload);
            getUserBubbleThemes().push(theme);
            if (typeof saveData === 'function') await saveData();
            _closeBubbleCreator();
            _renderBubbleLibGrid((document.getElementById('blo-search') || { value: '' }).value.trim());
            if (typeof showToast === 'function') showToast(`「${name}」已加入气泡库`);
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('保存失败：' + (err && err.message ? err.message : '请重试'));
    }
}

function _scaleWidthStr(widthStr, k) {
    return String(widthStr || '').split(' ').map(v => {
        const n = parseFloat(v);
        return (Number.isFinite(n) ? Math.max(2, Math.round(n * k)) : 0) + 'px';
    }).join(' ');
}

function _mkBloPreview(theme) {
    const box = document.createElement('div');
    box.className = 'blo-preview';
    if (!theme) {
        box.innerHTML = '<span class="blo-default-sample">你好呀</span>';
        return box;
    }
    const w = _scaleWidthStr(theme.receiveWidth, 0.62);
    box.innerHTML = `<span class="bubble-lib-sample" style="border-style:solid;border-color:transparent;border-width:${w};border-image-source:url('${theme.receive}');border-image-slice:${theme.receiveSlice} fill;border-image-repeat:stretch;color:${theme.textColor || '#333'};">你好呀</span>`;
    return box;
}

function _renderBubbleLibGrid(filter) {
    const grid = document.getElementById('blo-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const q = (filter || '').toLowerCase();

    const mkCard = (id, name, theme, deletable) => {
        if (q && !name.toLowerCase().includes(q)) return;
        const card = document.createElement('div');
        card.className = 'blo-card' + ((_blCurrent || '') === id ? ' selected' : '');
        card.appendChild(_mkBloPreview(theme));
        const nameEl = document.createElement('div');
        nameEl.className = 'blo-name';
        nameEl.textContent = name;
        card.appendChild(nameEl);
        if (id && typeof db !== 'undefined' && id === (db.defaultBubbleThemeId || '')) {
            const badge = document.createElement('div');
            badge.className = 'blo-badge';
            badge.textContent = '全局';
            card.appendChild(badge);
        }
        if (deletable) {
            const del = document.createElement('button');
            del.className = 'blo-del';
            del.textContent = '×';
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`删除气泡「${name}」？删除后不可恢复。`)) return;
                const arr = getUserBubbleThemes();
                const idx = arr.findIndex(t => t.id === id);
                if (idx > -1) arr.splice(idx, 1);
                if (typeof db !== 'undefined' && db.defaultBubbleThemeId === id) db.defaultBubbleThemeId = '';
                if (typeof saveData === 'function') await saveData();
                _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
                if (typeof showToast === 'function') showToast('已删除');
            });
            card.appendChild(del);

            /* 长按（500ms）弹出 编辑/删除 操作单；桌面端右键同样呼出 */
            const startLP = () => {
                _blLPFired = false;
                clearTimeout(_blLPTimer);
                _blLPTimer = setTimeout(() => { _blLPFired = true; _openBubbleThemeActions(id, name); }, 500);
            };
            const cancelLP = () => clearTimeout(_blLPTimer);
            card.addEventListener('touchstart', startLP, { passive: true });
            card.addEventListener('touchend', cancelLP, { passive: true });
            card.addEventListener('touchmove', cancelLP, { passive: true });
            card.addEventListener('contextmenu', (e) => { e.preventDefault(); _blLPFired = true; _openBubbleThemeActions(id, name); });
        }
        card.addEventListener('click', () => {
            /* 长按刚触发完的这次 click 不算选用 */
            if (_blLPFired) { _blLPFired = false; return; }
            if (typeof _blOnPick === 'function') _blOnPick(id);
            _closeBubbleLibOverlay();
        });
        grid.appendChild(card);
    };

    mkCard('', '默认气泡', null, false);
    getAllBubbleThemes().forEach(t => mkCard(t.id, t.name, t, isUserBubbleTheme(t.id)));
    if (!grid.children.length) {
        const empty = document.createElement('div');
        empty.className = 'blo-empty';
        empty.textContent = '没有找到匹配的气泡';
        grid.appendChild(empty);
    }
}

/* 长按气泡 → 编辑/删除 操作单 */
function _removeBubbleThemeActions() {
    const ov = document.getElementById('bubble-theme-actions');
    if (ov) ov.remove();
}

function _openBubbleThemeActions(id, name) {
    _removeBubbleThemeActions();
    const ov = document.createElement('div');
    ov.id = 'bubble-theme-actions';
    ov.innerHTML = `
        <div class="bta-sheet">
            <div class="bta-title">${String(name || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</div>
            <button type="button" class="bta-btn" data-act="edit">编辑气泡</button>
            <button type="button" class="bta-btn danger" data-act="del">删除气泡</button>
            <button type="button" class="bta-btn cancel" data-act="cancel">取消</button>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));
    ov.addEventListener('click', async (e) => {
        const btn = e.target.closest('.bta-btn');
        const act = btn ? btn.dataset.act : (e.target === ov ? 'cancel' : '');
        if (!act) return;
        _removeBubbleThemeActions();
        if (act === 'edit') {
            const theme = getBubbleTheme(id);
            if (theme && isUserBubbleTheme(id)) _openBubbleCreator(theme);
        } else if (act === 'del') {
            if (!confirm(`删除气泡「${name}」？删除后不可恢复。`)) return;
            const arr = getUserBubbleThemes();
            const idx = arr.findIndex(t => t.id === id);
            if (idx > -1) arr.splice(idx, 1);
            if (typeof db !== 'undefined') {
                if (db.defaultBubbleThemeId === id) db.defaultBubbleThemeId = '';
                /* 清掉所有聊天/群成员对这个气泡的选用 */
                (db.characters || []).forEach(c => { if (c.bubbleThemeId === id) c.bubbleThemeId = ''; });
                (db.groups || []).forEach(g => {
                    if (g.bubbleThemeId === id) g.bubbleThemeId = '';
                    if (g.memberBubbleThemes) {
                        Object.keys(g.memberBubbleThemes).forEach(mid => { if (g.memberBubbleThemes[mid] === id) delete g.memberBubbleThemes[mid]; });
                    }
                });
            }
            if (typeof saveData === 'function') await saveData();
            _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
            if (typeof showToast === 'function') showToast('已删除');
        }
    });
}

function openBubbleLibraryOverlay(opts) {
    opts = opts || {};
    _ensureBubbleLibOverlay();
    _blOnPick = opts.onPick || null;
    _blCurrent = opts.current || '';
    document.getElementById('blo-title').textContent = opts.title || '气泡库';
    document.getElementById('blo-search').value = '';
    _renderBubbleLibGrid('');
    document.getElementById('bubble-library-overlay').classList.add('visible');
}
/* 美化 App 入口：管理 + 设为全局默认 */
function openBubbleLibraryManager() {
    openBubbleLibraryOverlay({
        current: (typeof db !== 'undefined' && db.defaultBubbleThemeId) || '',
        title: '气泡库',
        onPick: async (id) => {
            if (typeof db === 'undefined') return;
            db.defaultBubbleThemeId = id;
            const t = getBubbleTheme(id);
            if (typeof saveData === 'function') await saveData();
            if (typeof showToast === 'function') showToast(t ? `全局默认气泡：${t.name}` : '已恢复默认气泡');
        }
    });
}

/* ════════════════════════════════════════════════════════
   导入：.ktheme（zip）拆包 / 成对 PNG
   ════════════════════════════════════════════════════════ */

function _blInflate(u8) {
    if (typeof pako !== 'undefined' && pako.inflateRaw) return pako.inflateRaw(u8);
    throw new Error('缺少解压组件');
}

function _blBlobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
    });
}

async function _blReadZipEntries(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip / ktheme 文件');
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (ptr + 46 > u8.length || dv.getUint32(ptr, true) !== 0x02014b50) break;
        const method = dv.getUint16(ptr + 10, true);
        const csize = dv.getUint32(ptr + 20, true);
        const nameLen = dv.getUint16(ptr + 28, true);
        const extraLen = dv.getUint16(ptr + 30, true);
        const commentLen = dv.getUint16(ptr + 32, true);
        const lho = dv.getUint32(ptr + 42, true);
        const name = new TextDecoder().decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
        entries.push({ name, method, csize, lho });
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    const extract = async (entry) => {
        const nameLen = dv.getUint16(entry.lho + 26, true);
        const extraLen = dv.getUint16(entry.lho + 28, true);
        const start = entry.lho + 30 + nameLen + extraLen;
        const data = u8.subarray(start, start + entry.csize);
        return entry.method === 0 ? data : _blInflate(data);
    };
    return { entries, extract };
}

/* 用 alpha 通道自动算九宫格切片：找"实心主体"边界，
   尾巴/耳朵等窄条留在切角带里不参与拉伸 */
function _blComputeNineSlice(img) {
    try {
        const w = img.width, h = img.height;
        if (!w || !h) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const rowW = new Array(h).fill(0), colH = new Array(w).fill(0);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (d[(y * w + x) * 4 + 3] > 24) { rowW[y]++; colH[x]++; }
            }
        }
        const maxW = Math.max.apply(null, rowW), maxH = Math.max.apply(null, colH);
        if (!maxW || !maxH) return null;
        const full = (v, m) => v > m * 0.6;
        let top = 0; while (top < h - 1 && !full(rowW[top], maxW)) top++;
        let bot = h - 1; while (bot > 0 && !full(rowW[bot], maxW)) bot--;
        let left = 0; while (left < w - 1 && !full(colH[left], maxH)) left++;
        let right = w - 1; while (right > 0 && !full(colH[right], maxH)) right--;
        top = Math.min(top, h - 8); bot = Math.min(h - 1 - bot, h - 8);
        left = Math.min(left, w - 8); right = Math.min(w - 1 - right, w - 8);
        const slice = `${top} ${right} ${bot} ${left}`;
        const half = v => Math.max(6, Math.round(v / 2)) + 'px';
        const width = `${half(top)} ${half(right)} ${half(bot)} ${half(left)}`;
        /* 文字颜色：中心区亮度 */
        let r = 0, g = 0, b = 0, n = 0;
        const cx0 = Math.floor(w * 0.35), cx1 = Math.floor(w * 0.65);
        const cy0 = Math.floor(h * 0.35), cy1 = Math.floor(h * 0.65);
        for (let y = cy0; y < cy1; y += 2) for (let x = cx0; x < cx1; x += 2) {
            const o = (y * w + x) * 4;
            if (d[o + 3] > 100) { r += d[o]; g += d[o + 1]; b += d[o + 2]; n++; }
        }
        const lum = n ? (r * 0.299 + g * 0.587 + b * 0.114) / n : 255;
        return { slice, width, textColor: lum > 140 ? '#333333' : '#ffffff', ratio: +(w / h).toFixed(4) };
    } catch (e) {
        return null;
    }
}

function _blLoadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function _blThemeFromPair(sendBlob, receiveBlob, name) {
    const [sendData, receiveData] = await Promise.all([
        _blBlobToDataURL(sendBlob), _blBlobToDataURL(receiveBlob)
    ]);
    const img = await _blLoadImage(receiveData);
    const geo = _blComputeNineSlice(img) || {
        slice: '40 40 14 40',
        width: '20px 20px 7px 20px',
        textColor: '#333333',
        ratio: +(((img.naturalWidth || img.width) / (img.naturalHeight || img.height)).toFixed(4))
    };
    return {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name,
        send: sendData,
        receive: receiveData,
        sendSlice: geo.slice, sendWidth: geo.width,
        receiveSlice: geo.slice, receiveWidth: geo.width,
        sendRatio: geo.ratio || null, receiveRatio: geo.ratio || null,
        textColor: geo.textColor
    };
}

async function _blImportKtheme(file) {
    const buf = await file.arrayBuffer();
    const { entries, extract } = await _blReadZipEntries(buf);
    const pngs = entries.filter(e => /\.png$/i.test(e.name) && !/\.DS_Store/i.test(e.name));
    /* 找成对的 Send / Receive（排除 Selected 选中态图） */
    const bubbles = pngs.filter(e => /bubble/i.test(e.name) && !/selected/i.test(e.name));
    const pool = bubbles.length ? bubbles : pngs;
    const sends = pool.filter(e => /send/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    const receives = pool.filter(e => /receive/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!sends.length || !receives.length) throw new Error('包里没找到成对的聊天气泡图');
    /* 按编号分组（Send01/Send02...），有多套就都收进来 */
    const groupOf = e => {
        const m = e.name.match(/(\d+)\.(?:png)$/i) || e.name.match(/(\d+)(?:Selected)?@/i);
        return m ? m[1] : '';
    };
    const pairs = [];
    const usedRecv = new Set();
    for (const s of sends) {
        const g = groupOf(s);
        let r = receives.find(x => !usedRecv.has(x) && groupOf(x) === g);
        if (!r) r = receives.find(x => !usedRecv.has(x));
        if (r) { usedRecv.add(r); pairs.push([s, r]); }
    }
    if (!pairs.length) throw new Error('包里没找到成对的聊天气泡图');
    const baseName = file.name.replace(/\.(ktheme|zip)$/i, '') || '导入气泡';
    const themes = [];
    for (let i = 0; i < pairs.length; i++) {
        const [s, r] = pairs[i];
        const sendBlob = new Blob([await extract(s)], { type: 'image/png' });
        const recvBlob = new Blob([await extract(r)], { type: 'image/png' });
        const name = pairs.length > 1 ? `${baseName} ${i + 1}` : baseName;
        themes.push(await _blThemeFromPair(sendBlob, recvBlob, name));
    }
    return themes;
}

async function _handleBubbleImport(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!files.length) return;
    try {
        let imported = 0;
        for (const f of files) {
            if (/\.png$/i.test(f.name)) continue; /* PNG 单独处理 */
            const themes = await _blImportKtheme(f);
            getUserBubbleThemes().push(...themes);
            imported += themes.length;
        }
        const pngs = files.filter(f => /\.png$/i.test(f.name));
        if (pngs.length >= 2) {
            /* 成对 PNG：文件名带 send/发送 的是发送气泡，否则第一个当发送 */
            let send = pngs.find(f => /send|发送/i.test(f.name));
            let recv = pngs.find(f => f !== send && /receive|recv|接收/i.test(f.name));
            if (!recv) recv = pngs.find(f => f !== send) || pngs[1];
            if (!send) send = pngs[0];
            const name = prompt('给这套气泡起个名字：', '我的气泡');
            if (name) {
                const theme = await _blThemeFromPair(send, recv, name.trim());
                getUserBubbleThemes().push(theme);
                imported++;
            }
        } else if (pngs.length === 1) {
            if (typeof showToast === 'function') showToast('PNG 需要一次选两张（发送 + 接收）');
        }
        if (imported > 0) {
            if (typeof saveData === 'function') await saveData();
            _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
            if (typeof showToast === 'function') showToast(`导入成功，新增 ${imported} 套气泡`);
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('导入失败：' + (err && err.message ? err.message : '文件解析出错'));
    }
}
