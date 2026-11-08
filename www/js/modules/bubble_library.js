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
function applyBubbleThemeStyle(chatId, themeId) {
    document.querySelectorAll('style[id^="bubble-theme-for-"]').forEach(el => el.remove());
    const theme = getBubbleTheme(themeId);
    if (!theme || !chatId) return;

    /* 九宫格左右边框会吃掉内容宽度：短消息（如"111"）会被挤到一字一行。
       按主题的左右 border 宽度算出气泡最小宽度，保证内容区至少能横排 ~3 个字 */
    const _w = (s) => String(s || '').trim().split(/\s+/).map(v => parseFloat(v) || 0);
    const _lr = (arr) => (arr[1] || 0) + (arr[3] || 0);
    const sendMin = Math.ceil(_lr(_w(theme.sendWidth)) + 50);
    const recvMin = Math.ceil(_lr(_w(theme.receiveWidth)) + 50);

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
    padding: 2px 4px 4px !important;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.13));
}
.message-bubble.sent {
    border-image-source: url("${theme.send}");
    border-image-slice: ${theme.sendSlice} fill;
    border-width: ${theme.sendWidth};
    color: ${theme.textColor} !important;
}
.message-bubble.received {
    border-image-source: url("${theme.receive}");
    border-image-slice: ${theme.receiveSlice} fill;
    border-width: ${theme.receiveWidth};
    color: ${theme.textColor} !important;
}
.message-bubble .bubble-content { color: ${theme.textColor} !important; text-shadow: none !important; }
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
    min-width: ${sendMin}px;
    padding: 2px 4px 4px !important;
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
    min-width: ${recvMin}px;
    padding: 2px 4px 4px !important;
    color: ${theme.textColor} !important;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.16));
}
`;
    document.head.appendChild(st);
}

/* 根据 chatId 从数据库读主题并注入（供进聊天室等时机调用） */
function applyBubbleThemeForChat(chatId) {
    if (!chatId || typeof db === 'undefined') return;
    const chat = (db.characters || []).find(c => c.id === chatId) || (db.groups || []).find(g => g.id === chatId);
    if (!chat) return;
    const eff = getEffectiveBubbleTheme(chat);
    applyBubbleThemeStyle(chatId, eff ? eff.id : '');
}

/* ════════════════════════════════════════════════════════
   全屏气泡库（选择 / 管理）
   ════════════════════════════════════════════════════════ */

let _blOnPick = null;
let _blCurrent = '';
let _blOverlayReady = false;
let _blTab = 'mine';   /* mine = 我的气泡 | qq = QQ 图鉴 */
let _blManage = false; /* 管理模式 */
let _blViewerName = '';

function _ensureBubbleLibOverlay() {
    if (_blOverlayReady) return;
    const st = document.createElement('style');
    st.id = 'bubble-lib-overlay-style';
    st.textContent = `
        #bubble-library-overlay { position: fixed; inset: 0; z-index: 10000; background: #f4f3f0; display: none; flex-direction: column; }
        #bubble-library-overlay.visible { display: flex; }
        .blo-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: rgba(255,255,255,0.92); border-bottom: 1px solid rgba(0,0,0,0.05); flex-shrink: 0; }
        .blo-back { border: none; background: none; font-size: 26px; line-height: 1; color: #333; cursor: pointer; padding: 0 6px; }
        .blo-title { font-size: 17px; font-weight: 700; color: #222; }
        .blo-hspace { flex: 1; }
        .blo-manage { border: none; background: none; font-size: 14px; color: var(--primary-color, #ff6b9d); cursor: pointer; padding: 4px 6px; font-weight: 600; }
        .blo-manage.done { color: #999; }
        .blo-tabs { display: flex; gap: 8px; padding: 10px 14px 0; flex-shrink: 0; }
        .blo-tab { border: none; background: rgba(0,0,0,0.05); color: #666; font-size: 13px; font-weight: 600; border-radius: 14px; padding: 7px 16px; cursor: pointer; }
        .blo-tab.active { background: var(--primary-color, #ff6b9d); color: #fff; }
        .blo-search { padding: 10px 14px 4px; flex-shrink: 0; }
        .blo-search input { width: 100%; box-sizing: border-box; border: none; outline: none; background: rgba(0,0,0,0.05); border-radius: 12px; padding: 9px 14px; font-size: 14px; }
        .blo-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 12px 14px 20px; align-content: start; -webkit-overflow-scrolling: touch; }
        .blo-card { position: relative; background: #fff; border: 2px solid transparent; border-radius: 16px; padding: 10px 8px 8px; text-align: center; cursor: pointer; transition: border-color .15s, transform .1s; }
        .blo-card:active { transform: scale(.97); }
        .blo-card.selected { border-color: var(--primary-color, #ff6b9d); background: rgba(255,107,157,0.06); }
        .blo-preview { height: 84px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; overflow: hidden; }
        .blo-preview .bubble-lib-sample { font-size: 12px; }
        .blo-name { font-size: 12px; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .blo-card.selected .blo-name { color: var(--primary-color, #ff6b9d); font-weight: 700; }
        .blo-badge { position: absolute; top: 6px; left: 6px; font-size: 9px; background: rgba(255,107,157,0.15); color: var(--primary-color, #ff6b9d); border-radius: 6px; padding: 1px 5px; }
        .blo-del { position: absolute; top: 2px; right: 4px; border: none; background: none; font-size: 16px; color: #c2c2c2; cursor: pointer; padding: 4px; line-height: 1; }
        .blo-del:active { color: #ff5a5a; }
        .blo-footer { padding: 10px 14px calc(14px + env(safe-area-inset-bottom, 0px)); background: rgba(255,255,255,0.92); border-top: 1px solid rgba(0,0,0,0.05); flex-shrink: 0; }
        .blo-add { width: 100%; border: none; border-radius: 14px; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #ff8fb0, #ff6b9d); cursor: pointer; }
        .blo-add:active { transform: scale(.98); }
        .blo-default-sample { display: inline-block; background: #fff; border: 1px solid #e5e5e5; border-radius: 14px; padding: 9px 14px; color: #333; font-size: 12px; }
        .blo-qq-img { width: 100%; height: 96px; object-fit: cover; border-radius: 10px; background: #eceae6; display: block; }
        .blo-qq-name { font-size: 11px; color: #555; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .blo-clear { width: 100%; border: none; border-radius: 14px; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #ff7b6b, #ff4d4d); cursor: pointer; display: none; }
        .blo-clear:active { transform: scale(.98); }
        .blo-viewer { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.88); display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        .blo-viewer.visible { display: flex; }
        .blo-viewer img { max-width: 100%; max-height: 72vh; border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
        .blo-viewer-bar { display: flex; gap: 14px; margin-top: 18px; }
        .blo-viewer-bar button { border: none; border-radius: 20px; padding: 10px 26px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .blo-viewer-save { background: var(--primary-color, #ff6b9d); color: #fff; }
        .blo-viewer-close { background: rgba(255,255,255,0.18); color: #fff; }
    `;
    document.head.appendChild(st);

    const ov = document.createElement('div');
    ov.id = 'bubble-library-overlay';
    ov.innerHTML = `
        <div class="blo-header">
            <button class="blo-back" id="blo-back">‹</button>
            <div class="blo-title" id="blo-title">气泡库</div>
            <div class="blo-hspace"></div>
            <button class="blo-manage" id="blo-manage">管理</button>
        </div>
        <div class="blo-tabs" id="blo-tabs">
            <button class="blo-tab active" data-tab="mine">我的气泡</button>
            <button class="blo-tab" data-tab="qq">QQ 图鉴</button>
        </div>
        <div class="blo-search"><input id="blo-search" type="text" placeholder="搜索气泡名字"></div>
        <div class="blo-grid" id="blo-grid"></div>
        <div class="blo-footer">
            <input type="file" id="blo-file" accept=".ktheme,.zip,image/png" multiple style="display:none">
            <button class="blo-add" id="blo-add">＋ 导入气泡</button>
            <button class="blo-clear" id="blo-clear">删除全部导入</button>
        </div>
        <div class="blo-viewer" id="blo-viewer">
            <img id="blo-viewer-img" alt="">
            <div class="blo-viewer-bar">
                <button class="blo-viewer-save" id="blo-viewer-add">添加到气泡库</button>
                <button class="blo-viewer-save" id="blo-viewer-save">保存图片</button>
                <button class="blo-viewer-close" id="blo-viewer-close">关闭</button>
            </div>
        </div>`;
    document.body.appendChild(ov);

    document.getElementById('blo-back').addEventListener('click', _closeBubbleLibOverlay);
    document.getElementById('blo-search').addEventListener('input', () => _renderBubbleLibGrid(document.getElementById('blo-search').value.trim()));
    document.getElementById('blo-add').addEventListener('click', () => document.getElementById('blo-file').click());
    document.getElementById('blo-file').addEventListener('change', _handleBubbleImport);
    document.getElementById('blo-manage').addEventListener('click', () => {
        _blManage = !_blManage;
        _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
        if (_blManage) {
            if (typeof showToast !== 'function') return;
            if (_blTab === 'qq') {
                showToast(getQQGalleryHidden().length ? '管理模式：点 × 隐藏，底部可恢复' : '管理模式：点 × 隐藏不想看的气泡');
            } else {
                const n = getUserBubbleThemes().length;
                showToast(n ? `管理模式：可删除导入的气泡（${n} 套）` : '还没有导入的气泡，先点下方导入');
            }
        }
    });
    document.getElementById('blo-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.blo-tab');
        if (!btn) return;
        _blTab = btn.dataset.tab;
        _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
    });
    document.getElementById('blo-clear').addEventListener('click', async () => {
        if (_blTab === 'qq') {
            const hid = getQQGalleryHidden();
            if (!hid.length) return;
            if (!confirm(`恢复全部 ${hid.length} 个被隐藏的图鉴气泡？`)) return;
            hid.length = 0;
            if (typeof saveData === 'function') await saveData();
            _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
            if (typeof showToast === 'function') showToast('已全部恢复');
            return;
        }
        const arr = getUserBubbleThemes();
        if (!arr.length) return;
        if (!confirm(`删除全部 ${arr.length} 套导入气泡？删除后不可恢复。`)) return;
        arr.length = 0;
        if (typeof db !== 'undefined') db.defaultBubbleThemeId = '';
        if (typeof saveData === 'function') await saveData();
        _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
        if (typeof showToast === 'function') showToast('已清空导入气泡');
    });
    document.getElementById('blo-viewer-close').addEventListener('click', () => {
        document.getElementById('blo-viewer').classList.remove('visible');
    });
    document.getElementById('blo-viewer-add').addEventListener('click', async () => {
        const btn = document.getElementById('blo-viewer-add');
        const url = document.getElementById('blo-viewer-img').src;
        if (!url || btn.disabled) return;
        btn.disabled = true;
        if (typeof showToast === 'function') showToast('正在复刻气泡…');
        try {
            const theme = await _blForgeFromPreview(url, _blViewerName || '图鉴气泡');
            if (!theme) {
                if (typeof showToast === 'function') showToast('这套已经在气泡库里啦');
            } else {
                getUserBubbleThemes().push(theme);
                if (typeof saveData === 'function') await saveData();
                if (typeof showToast === 'function') showToast(`「${theme.name}」已加入我的气泡库`);
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast('添加失败：' + (err && err.message ? err.message : '取色出错'));
        }
        btn.disabled = false;
    });
    document.getElementById('blo-viewer-save').addEventListener('click', () => {
        const url = document.getElementById('blo-viewer-img').src;
        if (!url) return;
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
    });
    _blOverlayReady = true;
}

function _closeBubbleLibOverlay() {
    const ov = document.getElementById('bubble-library-overlay');
    if (ov) ov.classList.remove('visible');
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

    /* 同步界面状态：标签高亮 / 管理按钮 / 底部按钮 */
    document.querySelectorAll('#blo-tabs .blo-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _blTab));
    const manageBtn = document.getElementById('blo-manage');
    if (manageBtn) {
        manageBtn.style.display = '';
        manageBtn.textContent = _blManage ? '完成' : '管理';
        manageBtn.classList.toggle('done', _blManage);
    }
    const addBtn = document.getElementById('blo-add');
    const clearBtn = document.getElementById('blo-clear');
    if (addBtn) addBtn.style.display = (_blTab === 'mine' && !_blManage) ? '' : 'none';
    if (clearBtn) {
        if (_blTab === 'mine') {
            const n = getUserBubbleThemes().length;
            clearBtn.style.display = (_blManage && n > 0) ? '' : 'none';
            clearBtn.textContent = `删除全部导入（${n}）`;
        } else {
            const n = getQQGalleryHidden().length;
            clearBtn.style.display = (_blManage && n > 0) ? '' : 'none';
            clearBtn.textContent = `恢复全部隐藏（${n}）`;
        }
    }

    if (_blTab === 'qq') { _renderQQGallery(grid, q); return; }

    const mkCard = (id, name, theme, deletable) => {
        if (q && !name.toLowerCase().includes(q)) return;
        const card = document.createElement('div');
        card.className = 'blo-card' + ((_blCurrent || '') === id ? ' selected' : '');
        const preview = _mkBloPreview(theme);
        card.appendChild(preview);
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
        if (deletable && _blManage) {
            const del = document.createElement('button');
            del.className = 'blo-del';
            del.textContent = '×';
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`删除气泡「${name}」？删除后不可恢复。`)) return;
                const arr = getUserBubbleThemes();
                const idx = arr.findIndex(t => t.id === id);
                if (idx > -1) arr.splice(idx, 1);
                if (db.defaultBubbleThemeId === id) db.defaultBubbleThemeId = '';
                if (typeof saveData === 'function') await saveData();
                _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
                if (typeof showToast === 'function') showToast('已删除');
            });
            card.appendChild(del);
        }
        card.addEventListener('click', () => {
            if (_blManage) return; /* 管理模式下点卡片不选用 */
            if (typeof _blOnPick === 'function') _blOnPick(id);
            _closeBubbleLibOverlay();
        });
        grid.appendChild(card);
    };

    mkCard('', '默认气泡', null, false);
    getAllBubbleThemes().forEach(t => mkCard(t.id, t.name, t, isUserBubbleTheme(t.id)));
}

/* ── QQ 图鉴隐藏列表（db.qqGalleryHidden，可恢复） ── */
function getQQGalleryHidden() {
    if (typeof db === 'undefined') return [];
    if (!Array.isArray(db.qqGalleryHidden)) db.qqGalleryHidden = [];
    return db.qqGalleryHidden;
}

/* ── QQ 图鉴：腾讯官方 CDN 的气泡效果图（在线加载，点开可保存） ── */
function _qqItemOf(id, isOld) {
    return {
        id,
        name: isOld ? (typeof QQ_NAME_MAP !== 'undefined' && QQ_NAME_MAP[id] || `经典气泡 ${id}`) : `气泡 ${id}`,
        url: isOld
            ? `https://tianquan.gtimg.cn/bubble/item/${id}/250x300_1.png`
            : `https://tianquan.gtimg.cn/bubble/item/${id}/newPreview1.png`
    };
}

function _renderQQGallery(grid, q) {
    const hidden = getQQGalleryHidden();
    const items = [];
    if (typeof QQ_OLD_IDS !== 'undefined') QQ_OLD_IDS.forEach(id => items.push(_qqItemOf(id, true)));
    if (typeof QQ_NEW_IDS !== 'undefined') QQ_NEW_IDS.forEach(id => items.push(_qqItemOf(id, false)));
    const list = items.filter(it => !hidden.includes(it.id)).filter(it =>
        !q || it.name.toLowerCase().includes(q) || String(it.id).includes(q)
    );

    grid.dataset.qqTotal = String(list.length);
    grid.dataset.qqShown = '0';
    grid.dataset.qqQuery = q || '';

    const BATCH = 120;
    const appendBatch = () => {
        const start = parseInt(grid.dataset.qqShown || '0', 10);
        if (start >= list.length) return;
        const end = Math.min(start + BATCH, list.length);
        const frag = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const it = list[i];
            const card = document.createElement('div');
            card.className = 'blo-card';
            card.innerHTML = `<img class="blo-qq-img" loading="lazy" alt="">` +
                `<div class="blo-qq-name"></div>`;
            card.querySelector('.blo-qq-name').textContent = it.name;
            const img = card.querySelector('img');
            img.src = it.url;
            img.addEventListener('error', () => { card.remove(); });
            if (_blManage) {
                const del = document.createElement('button');
                del.className = 'blo-del';
                del.textContent = '×';
                del.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`在图鉴里隐藏「${it.name}」？可随时在管理模式里恢复。`)) return;
                    getQQGalleryHidden().push(it.id);
                    if (typeof saveData === 'function') await saveData();
                    _renderBubbleLibGrid(document.getElementById('blo-search').value.trim());
                    if (typeof showToast === 'function') showToast('已隐藏');
                });
                card.appendChild(del);
            }
            card.addEventListener('click', () => {
                if (_blManage) return;
                _blViewerName = it.name;
                document.getElementById('blo-viewer-img').src = it.url;
                document.getElementById('blo-viewer').classList.add('visible');
            });
            frag.appendChild(card);
        }
        grid.appendChild(frag);
        grid.dataset.qqShown = String(end);
    };
    appendBatch();
    grid._qqAppend = appendBatch;

    if (!grid.dataset.qqScrollBound) {
        grid.dataset.qqScrollBound = '1';
        grid.addEventListener('scroll', () => {
            if (_blTab !== 'qq') return;
            const g = document.getElementById('blo-grid');
            if (!g || parseInt(g.dataset.qqShown || '0', 10) >= parseInt(g.dataset.qqTotal || '0', 10)) return;
            if (g.scrollTop + g.clientHeight > g.scrollHeight - 500 && typeof g._qqAppend === 'function') g._qqAppend();
        });
    }
}

/* ════════════════════════════════════════════════════════
   QQ 图鉴 → 复刻为可用气泡（取效果图配色，重绘干净九宫格）
   ════════════════════════════════════════════════════════ */

function _blMix(c, target, k) {
    return [
        Math.round(c[0] + (target - c[0]) * k),
        Math.round(c[1] + (target - c[1]) * k),
        Math.round(c[2] + (target - c[2]) * k)
    ];
}
function _blRGBStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function _blLum(c) { return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; }

/* 从预览图中央取色：fill=主体平均色，accent=最鲜艳的颜色 */
function _blSamplePalette(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    let bestSat = -1, bestC = [255, 107, 157];
    const x0 = Math.floor(w * 0.2), x1 = Math.floor(w * 0.8);
    const y0 = Math.floor(h * 0.25), y1 = Math.floor(h * 0.75);
    for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
            const o = (y * w + x) * 4;
            const R = d[o], G = d[o + 1], B = d[o + 2];
            r += R; g += G; b += B; n++;
            const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
            const sat = mx === 0 ? 0 : (mx - mn) / mx * Math.min(255, mx);
            if (sat > bestSat) { bestSat = sat; bestC = [R, G, B]; }
        }
    }
    if (!n) return { fill: [255, 255, 255], accent: [255, 107, 157], textColor: '#333333' };
    const fill = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    const lum = _blLum(fill);
    /* 主体太深就提亮当底色，保证文字可读 */
    const adj = lum < 110 ? _blMix(fill, 255, 0.45) : fill;
    return {
        fill: adj,
        accent: bestSat > 60 ? bestC : _blMix(adj, 0, 0.25),
        textColor: _blLum(adj) > 150 ? '#333333' : '#ffffff'
    };
}

/* 画一套干净的圆角气泡 @2x（380x240），tail: 'right' | 'left' */
function _blDrawBubble(pal, tail) {
    const W = 380, H = 240, BW = 348, R = 42;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const x0 = tail === 'right' ? 0 : W - BW;
    const tx = tail === 'right' ? x0 + BW : x0;
    const inward = tail === 'right' ? 14 : -14;
    /* 圆角矩形 + 尾巴，一条闭合路径 */
    ctx.beginPath();
    ctx.moveTo(x0 + R, 0);
    ctx.lineTo(x0 + BW - R, 0);
    ctx.arcTo(x0 + BW, 0, x0 + BW, R, R);
    ctx.lineTo(x0 + BW, H - R);
    ctx.arcTo(x0 + BW, H, x0 + BW - R, H, R);
    ctx.lineTo(tx - inward, H * 0.88);
    ctx.lineTo(tail === 'right' ? W : 0, H * 0.82);
    ctx.lineTo(tx - inward, H * 0.58);
    ctx.lineTo(x0 + R, H);
    ctx.arcTo(x0, H, x0, H - R, R);
    ctx.lineTo(x0, R);
    ctx.arcTo(x0, 0, x0 + R, 0, R);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, _blRGBStr(_blMix(pal.fill, 255, 0.10)));
    grad.addColorStop(1, _blRGBStr(_blMix(pal.fill, 0, 0.08)));
    ctx.fillStyle = grad;
    ctx.fill();
    /* 白描边（QQ 贴纸质感）+ 内圈彩色细线 */
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    const ix = tail === 'right' ? 8 : W - BW + 8;
    const IR = R - 14;
    ctx.moveTo(ix + IR, 8);
    ctx.lineTo(ix + BW - 16 - IR, 8);
    ctx.arcTo(ix + BW - 16, 8, ix + BW - 16, 8 + IR, IR);
    ctx.lineTo(ix + BW - 16, H - 8 - IR);
    ctx.arcTo(ix + BW - 16, H - 8, ix + BW - 16 - IR, H - 8, IR);
    ctx.lineTo(ix + IR, H - 8);
    ctx.arcTo(ix, H - 8, ix, H - 8 - IR, IR);
    ctx.lineTo(ix, 8 + IR);
    ctx.arcTo(ix, 8, ix + IR, 8, IR);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(${pal.accent[0]},${pal.accent[1]},${pal.accent[2]},0.4)`;
    ctx.stroke();
    return c.toDataURL('image/png');
}

/* 主流程：预览图 URL → 复刻主题（若已在库中则返回 null） */
async function _blForgeFromPreview(url, name) {
    const existed = getUserBubbleThemes().find(t => t.qqSrc === url);
    if (existed) return null;
    const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('图片加载失败'));
        im.src = url;
    });
    const pal = _blSamplePalette(img);
    return {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: 'QQ·' + name,
        qqSrc: url,
        send: _blDrawBubble(pal, 'right'),
        receive: _blDrawBubble(pal, 'left'),
        sendSlice: '56 60 18 40',
        sendWidth: '28px 30px 9px 20px',
        receiveSlice: '56 40 18 60',
        receiveWidth: '28px 20px 9px 30px',
        textColor: pal.textColor
    };
}

function openBubbleLibraryOverlay(opts) {
    opts = opts || {};
    _ensureBubbleLibOverlay();
    _blOnPick = opts.onPick || null;
    _blCurrent = opts.current || '';
    _blTab = 'mine';
    _blManage = false;
    document.getElementById('blo-title').textContent = opts.title || '气泡库';
    document.getElementById('blo-search').value = '';
    document.getElementById('blo-viewer').classList.remove('visible');
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
        return { slice, width, textColor: lum > 140 ? '#333333' : '#ffffff' };
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
        textColor: '#333333'
    };
    return {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name,
        send: sendData,
        receive: receiveData,
        sendSlice: geo.slice, sendWidth: geo.width,
        receiveSlice: geo.slice, receiveWidth: geo.width,
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
