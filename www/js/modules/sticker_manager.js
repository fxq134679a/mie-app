// —— 表情包管理页（更多 → 表情包）：白底 · 黑字 · iOS 液态玻璃 ——
(function () {
    const BODY_ID = 'sticker-manager-body';
    const SCREEN_ID = 'sticker-manager-screen';
    const TITLE_ID = 'sticker-manager-title';
    const MANAGE_BTN_ID = 'sm-manage-btn';
    const OVERLAY_ID = 'sm-overlay';

    let view = 'home';          // home | emojiAdd | emojiImport | browse | kaoAdd | kaoImport | kaoBrowse
    let browseGroup = 'all';    // 整理表情：all | '' (未分组) | 分组名
    let kaoGroup = 'all';       // 整理颜文字：all | 分类下标
    let manageMode = false;     // 管理态：可多选 / 删除 / 移动 / 管理分组
    let picked = new Set();     // 表情用 id，颜文字用 "分类下标:条目下标"
    let sheet = '';             // '' | move | groups | kmove | cats
    let kaoAddPick = 0;
    let wired = false;

    const TITLES = {
        home: '表情包',
        emojiAdd: '添加表情',
        emojiImport: '批量导入',
        browse: '整理表情',
        kaoAdd: '添加颜文字',
        kaoImport: '批量导入',
        kaoBrowse: '整理颜文字'
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function body() { return document.getElementById(BODY_ID); }

    // 弹层挂在 body 上，页面上有玻璃模糊层时 fixed 才不会被裁掉
    function overlay() {
        let ov = document.getElementById(OVERLAY_ID);
        if (!ov) {
            ov = document.createElement('div');
            ov.id = OVERLAY_ID;
            document.body.appendChild(ov);
            ov.addEventListener('click', (e) => {
                if (e.target === ov) { sheet = ''; drawSheet(); return; }
                const node = e.target.closest('[data-act]');
                if (!node) return;
                e.preventDefault();
                e.stopPropagation();
                act(node.dataset.act, node);
            });
        }
        return ov;
    }

    function find(sel) {
        const ov = document.getElementById(OVERLAY_ID);
        const a = ov ? ov.querySelector(sel) : null;
        if (a) return a;
        const el = body();
        return el ? el.querySelector(sel) : null;
    }

    function groups() {
        return [...new Set(db.myStickers.map(s => s.group).filter(g => g))];
    }

    function cats() {
        return kaoList();
    }

    function kaoTotal() {
        return cats().reduce((n, c) => n + c.items.length, 0);
    }

    function notifyPanel() {
        if (window.MieStickerPanel) window.MieStickerPanel.refreshStickers();
    }

    async function persistStickers() {
        await saveData();
        notifyPanel();
    }

    function persistKaomoji() {
        saveKaomoji();
        if (window.MieStickerPanel) window.MieStickerPanel.refreshKaomoji();
    }

    // ==================== 图标 ====================
    const ICON = {
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        import: '<svg viewBox="0 0 24 24"><path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
        grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
        text: '<svg viewBox="0 0 24 24"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>'
    };

    // ==================== 首页 ====================
    function viewHome() {
        const gs = groups();
        const cs = cats();
        return `
        <div class="sm-hero">
            <div class="sm-stat"><b>${db.myStickers.length}</b><span>表情</span></div>
            <div class="sm-stat"><b>${gs.length}</b><span>分组</span></div>
            <div class="sm-stat"><b>${kaoTotal()}</b><span>颜文字</span></div>
            <div class="sm-stat"><b>${cs.length}</b><span>分类</span></div>
        </div>

        <div class="sm-sec">
            <div class="sm-sec-head">表情包</div>
            <div class="sm-cards">
                <button class="sm-card" data-act="emoji-add">${ICON.plus}<span class="sm-card-t">添加表情</span></button>
                <button class="sm-card" data-act="emoji-import">${ICON.import}<span class="sm-card-t">批量导入</span></button>
                <button class="sm-card" data-act="emoji-browse">${ICON.grid}<span class="sm-card-t">整理表情</span></button>
            </div>
        </div>

        <div class="sm-sec">
            <div class="sm-sec-head">颜文字</div>
            <div class="sm-cards">
                <button class="sm-card" data-act="kao-add">${ICON.text}<span class="sm-card-t">添加颜文字</span></button>
                <button class="sm-card" data-act="kao-import">${ICON.import}<span class="sm-card-t">批量导入</span></button>
                <button class="sm-card" data-act="kao-browse">${ICON.grid}<span class="sm-card-t">整理颜文字</span></button>
            </div>
        </div>`;
    }

    // ==================== 表情：添加 / 导入 ====================
    function viewEmojiAdd() {
        const gs = groups();
        return `
        <div class="sm-sheet">
            <div class="sm-preview" id="sm-preview"><span>预览</span></div>
            <div class="sm-field"><label>名称</label><input type="text" id="sm-em-name"></div>
            <div class="sm-field"><label>分组</label><input type="text" id="sm-em-group" list="sm-group-list">
                <datalist id="sm-group-list">${gs.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
            </div>
            <div class="sm-field"><label>图片网址</label><input type="text" id="sm-em-url"></div>
            <div class="sm-row">
                <label class="sm-btn" for="sm-em-file">从相册选一张</label>
                <input type="file" id="sm-em-file" accept="image/*" hidden>
                <button class="sm-btn primary" data-act="emoji-save">保存</button>
            </div>
        </div>`;
    }

    function viewEmojiImport() {
        return `
        <div class="sm-sheet">
            <div class="sm-field"><label>分组</label><input type="text" id="sm-imp-group"></div>
            <div class="sm-field"><label>导入内容</label><textarea id="sm-imp-text" rows="10"></textarea></div>
            <div class="sm-row"><button class="sm-btn primary" data-act="import-run">开始导入</button></div>
        </div>`;
    }

    // ==================== 表情：整理 ====================
    function browseList() {
        if (browseGroup === 'all') return db.myStickers;
        if (browseGroup === '') return db.myStickers.filter(s => !s.group);
        return db.myStickers.filter(s => s.group === browseGroup);
    }

    function viewBrowse() {
        const gs = groups();
        const list = browseList();
        let html = `
        <div class="sm-chips top">
            <button class="sm-chip ${browseGroup === 'all' ? 'on' : ''}" data-act="browse-group" data-g="all">全部<em>${db.myStickers.length}</em></button>
            <button class="sm-chip ${browseGroup === '' ? 'on' : ''}" data-act="browse-group" data-g="">未分组<em>${db.myStickers.filter(s => !s.group).length}</em></button>
            ${gs.map(g => `<button class="sm-chip ${browseGroup === g ? 'on' : ''}" data-act="browse-group" data-g="${esc(g)}">${esc(g)}<em>${db.myStickers.filter(s => s.group === g).length}</em></button>`).join('')}
        </div>`;

        if (manageMode) {
            html += `
            <div class="sm-tools">
                <button class="sm-btn small" data-act="pick-all">全选</button>
                <button class="sm-btn small" data-act="pick-move">移动分组</button>
                <button class="sm-btn small danger" data-act="pick-del">删除${picked.size ? '(' + picked.size + ')' : ''}</button>
                <button class="sm-btn small" data-act="groups-open">管理分组</button>
            </div>`;
        }

        html += '<div class="sm-grid">';
        if (!list.length) html += '<p class="sm-empty">还没有表情</p>';
        list.forEach(s => {
            html += `<div class="sm-cell ${manageMode && picked.has(s.id) ? 'on' : ''}" data-act="cell" data-id="${esc(s.id)}">
                <img src="${esc(s.data)}" alt="${esc(s.name)}" loading="lazy">
                <span>${esc(s.name)}</span>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function moveSheetHTML() {
        const gs = groups();
        return `
        <div class="sm-ov-card">
            <div class="sm-ov-title">移到哪个分组</div>
            <div class="sm-chips">
                <button class="sm-chip" data-act="move-to" data-g="">不留分组</button>
                ${gs.map(g => `<button class="sm-chip" data-act="move-to" data-g="${esc(g)}">${esc(g)}</button>`).join('')}
            </div>
            <div class="sm-field"><label>新建分组</label><input type="text" id="sm-move-group"></div>
            <div class="sm-row">
                <button class="sm-btn primary" data-act="move-run">移动${picked.size ? '(' + picked.size + ')' : ''}</button>
                <button class="sm-btn ghost" data-act="sheet-close">取消</button>
            </div>
        </div>`;
    }

    function groupsSheetHTML() {
        const gs = groups();
        const un = db.myStickers.filter(s => !s.group).length;
        let rows = '';
        rows += `
        <div class="sm-gm-row">
            <span class="sm-gm-n">未分组<em>${un}</em></span>
            <div class="sm-gm-ops">
                <button class="sm-ico" data-act="grp-rename" data-g="">改名</button>
                <button class="sm-ico danger" data-act="grp-del" data-g="" ${un ? '' : 'disabled'}>删除</button>
            </div>
        </div>`;
        gs.forEach(g => {
            rows += `
            <div class="sm-gm-row">
                <span class="sm-gm-n">${esc(g)}<em>${db.myStickers.filter(s => s.group === g).length}</em></span>
                <div class="sm-gm-ops">
                    <button class="sm-ico" data-act="grp-rename" data-g="${esc(g)}">改名</button>
                    <button class="sm-ico danger" data-act="grp-del" data-g="${esc(g)}">删除</button>
                </div>
            </div>`;
        });
        return `
        <div class="sm-ov-card">
            <div class="sm-ov-title">管理分组</div>
            <div class="sm-gm-list">${rows}</div>
            <div class="sm-row"><button class="sm-btn wide ghost" data-act="sheet-close">完成</button></div>
        </div>`;
    }

    // ==================== 颜文字：添加 / 导入 ====================
    function viewKaoAdd() {
        const cs = cats();
        return `
        <div class="sm-sheet">
            <div class="sm-field"><label>内容</label><input type="text" id="sm-kao-text"></div>
            <div class="sm-field"><label>放进哪个分类</label>
                <div class="sm-chips in">
                    ${cs.map((c, i) => `<button class="sm-chip ${i === kaoAddPick ? 'on' : ''}" data-act="kao-pick" data-i="${i}">${esc(c.name)}<em>${c.items.length}</em></button>`).join('')}
                </div>
            </div>
            <div class="sm-row"><button class="sm-btn primary" data-act="kao-save">添加</button></div>
        </div>`;
    }

    function viewKaoImport() {
        const cs = cats();
        return `
        <div class="sm-sheet">
            <div class="sm-field"><label>分类</label><input type="text" id="sm-kimp-cat" list="sm-cat-list">
                <datalist id="sm-cat-list">${cs.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
            </div>
            <div class="sm-field"><label>导入内容</label><textarea id="sm-kimp-text" rows="10"></textarea></div>
            <div class="sm-row"><button class="sm-btn primary" data-act="kao-import-run">开始导入</button></div>
        </div>`;
    }

    // ==================== 颜文字：整理 ====================
    function kaoItemList() {
        const cs = cats();
        const only = kaoGroup === 'all' ? -1 : Number(kaoGroup);
        const out = [];
        cs.forEach((c, i) => {
            if (only >= 0 && i !== only) return;
            c.items.forEach((x, k) => out.push({ i, k, x }));
        });
        return out;
    }

    function viewKaoBrowse() {
        const cs = cats();
        if (Number(kaoGroup) >= cs.length) kaoGroup = 'all';
        const list = kaoItemList();
        let html = `
        <div class="sm-chips top">
            <button class="sm-chip ${kaoGroup === 'all' ? 'on' : ''}" data-act="kao-group" data-i="all">全部<em>${kaoTotal()}</em></button>
            ${cs.map((c, i) => `<button class="sm-chip ${kaoGroup === String(i) ? 'on' : ''}" data-act="kao-group" data-i="${i}">${esc(c.name)}<em>${c.items.length}</em></button>`).join('')}
        </div>`;

        if (manageMode) {
            html += `
            <div class="sm-tools">
                <button class="sm-btn small" data-act="kao-pick-all">全选</button>
                <button class="sm-btn small" data-act="kao-move-open">移动分类</button>
                <button class="sm-btn small danger" data-act="kao-pick-del">删除${picked.size ? '(' + picked.size + ')' : ''}</button>
                <button class="sm-btn small" data-act="cats-open">管理分类</button>
            </div>`;
        }

        html += '<div class="sm-kao-grid">';
        if (!list.length) html += '<p class="sm-empty">还没有颜文字</p>';
        list.forEach(o => {
            const key = o.i + ':' + o.k;
            const desc = kaoDesc(o.x);
            html += `<div class="sm-kao-cell ${manageMode && picked.has(key) ? 'on' : ''}" data-act="kao-cell" data-key="${key}">
                <b>${esc(kaoText(o.x))}</b>${desc ? `<span>${esc(desc)}</span>` : ''}
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function kmoveSheetHTML() {
        const cs = cats();
        return `
        <div class="sm-ov-card">
            <div class="sm-ov-title">移到哪个分类</div>
            <div class="sm-chips">
                ${cs.map(c => `<button class="sm-chip" data-act="kao-move-to" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('')}
            </div>
            <div class="sm-field"><label>新建分类</label><input type="text" id="sm-kmove-cat"></div>
            <div class="sm-row">
                <button class="sm-btn primary" data-act="kao-move-run">移动${picked.size ? '(' + picked.size + ')' : ''}</button>
                <button class="sm-btn ghost" data-act="sheet-close">取消</button>
            </div>
        </div>`;
    }

    function catsSheetHTML() {
        const cs = cats();
        let rows = '';
        cs.forEach((c, i) => {
            rows += `
            <div class="sm-gm-row">
                <span class="sm-gm-n">${esc(c.name)}<em>${c.items.length}</em></span>
                <div class="sm-gm-ops">
                    <button class="sm-ico" data-act="cat-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="sm-ico" data-act="cat-down" data-i="${i}" ${i === cs.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="sm-ico" data-act="cat-rename" data-i="${i}">改名</button>
                    <button class="sm-ico danger" data-act="cat-del" data-i="${i}">删除</button>
                </div>
            </div>`;
        });
        return `
        <div class="sm-ov-card">
            <div class="sm-ov-title">管理分类</div>
            <div class="sm-gm-list">${rows || '<p class="sm-empty">还没有分类</p>'}</div>
            <div class="sm-field"><label>新建分类</label><input type="text" id="sm-cat-new"></div>
            <div class="sm-row">
                <button class="sm-btn primary" data-act="cat-new">新建</button>
                <button class="sm-btn ghost" data-act="sheet-close">完成</button>
            </div>
        </div>`;
    }

    function drawSheet() {
        let html = '';
        if (sheet === 'move') html = moveSheetHTML();
        else if (sheet === 'groups') html = groupsSheetHTML();
        else if (sheet === 'kmove') html = kmoveSheetHTML();
        else if (sheet === 'cats') html = catsSheetHTML();
        const ov = html ? overlay() : document.getElementById(OVERLAY_ID);
        if (!ov) return;
        if (html) {
            ov.innerHTML = html;
            ov.classList.add('open');
            if (sheet === 'kmove' || sheet === 'move') {
                const input = ov.querySelector('input[id$="-cat"], input#sm-move-group');
                if (input) input.addEventListener('input', () => {
                    ov.querySelectorAll('.sm-chip').forEach(c => c.classList.remove('on'));
                });
            }
        } else {
            ov.classList.remove('open');
            ov.innerHTML = '';
        }
    }

    // ==================== 渲染 ====================
    function render() {
        const el = body();
        if (!el) return;
        let html = '';
        if (view === 'home') html = viewHome();
        else if (view === 'emojiAdd') html = viewEmojiAdd();
        else if (view === 'emojiImport') html = viewEmojiImport();
        else if (view === 'browse') html = viewBrowse();
        else if (view === 'kaoAdd') html = viewKaoAdd();
        else if (view === 'kaoImport') html = viewKaoImport();
        else if (view === 'kaoBrowse') html = viewKaoBrowse();
        el.innerHTML = html;
        el.dataset.view = view;

        const title = document.getElementById(TITLE_ID);
        if (title) title.textContent = TITLES[view] || '表情包';

        const mb = document.getElementById(MANAGE_BTN_ID);
        if (mb) {
            const on = (view === 'browse' || view === 'kaoBrowse') && manageMode;
            mb.style.display = (view === 'browse' || view === 'kaoBrowse') ? '' : 'none';
            mb.textContent = manageMode ? '退出' : '管理';
            mb.classList.toggle('on', on);
        }

        if (view !== 'browse' && view !== 'kaoBrowse') sheet = '';
        drawSheet();
        bindExtras();
    }

    function bindExtras() {
        const el = body();
        if (!el) return;

        if (view === 'emojiAdd') {
            const url = el.querySelector('#sm-em-url');
            const file = el.querySelector('#sm-em-file');
            const preview = el.querySelector('#sm-preview');
            if (url) url.addEventListener('input', () => {
                const v = url.value.trim();
                preview.innerHTML = v ? `<img src="${esc(v)}" alt="预览">` : '<span>预览</span>';
            });
            if (file) file.addEventListener('change', async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const dataUrl = await compressImage(f, { quality: 0.8, maxWidth: 200, maxHeight: 200 });
                    preview.innerHTML = `<img src="${dataUrl}" alt="预览">`;
                    if (url) url.value = '';
                } catch (err) {
                    showToast('图片处理失败');
                }
            });
        }
    }

    // ==================== 动作 ====================
    async function act(name, node) {
        const el = body();

        if (name === 'sheet-close') { sheet = ''; drawSheet(); return; }
        if (name === 'home') { view = 'home'; manageMode = false; picked.clear(); sheet = ''; render(); return; }

        if (name === 'emoji-add') { view = 'emojiAdd'; render(); return; }
        if (name === 'emoji-import') { view = 'emojiImport'; render(); return; }
        if (name === 'emoji-browse') { view = 'browse'; manageMode = false; picked.clear(); render(); return; }
        if (name === 'kao-add') { view = 'kaoAdd'; kaoAddPick = 0; render(); return; }
        if (name === 'kao-import') { view = 'kaoImport'; render(); return; }
        if (name === 'kao-browse') { view = 'kaoBrowse'; manageMode = false; picked.clear(); kaoGroup = 'all'; render(); return; }

        if (name === 'toggle-manage') {
            manageMode = !manageMode;
            picked.clear();
            sheet = '';
            render();
            return;
        }

        if (name === 'browse-group') {
            browseGroup = node.dataset.g;
            picked.clear();
            sheet = '';
            render();
            return;
        }
        if (name === 'kao-group') {
            kaoGroup = node.dataset.i;
            picked.clear();
            sheet = '';
            render();
            return;
        }

        // ——— 添加表情 ———
        if (name === 'emoji-save') {
            const preview = el.querySelector('#sm-preview img');
            const data = preview ? preview.src : '';
            const label = el.querySelector('#sm-em-name').value.trim();
            const group = el.querySelector('#sm-em-group').value.trim();
            if (!label) return showToast('给表情起个名字');
            if (!data) return showToast('先选一张图或填图片网址');
            db.myStickers.push({
                id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                name: label,
                data: data,
                group: group,
                lastUsedTime: Date.now()
            });
            await persistStickers();
            showToast('已保存');
            view = 'home';
            render();
            return;
        }

        // ——— 批量导入表情 ———
        if (name === 'import-run') {
            const text = el.querySelector('#sm-imp-text').value.trim();
            const group = el.querySelector('#sm-imp-group').value.trim();
            if (!text) return showToast('先粘贴要导入的内容');
            const fresh = [];
            text.split('\n').forEach(line => {
                const t = line.trim().replace('：', ':');
                if (!t) return;
                const at = t.indexOf(':');
                if (at <= 0) return;
                const label = t.substring(0, at).trim();
                const url = t.substring(at + 1).trim();
                if (label && url.startsWith('http')) {
                    fresh.push({
                        id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${fresh.length}`,
                        name: label,
                        data: url,
                        group: group,
                        lastUsedTime: Date.now()
                    });
                }
            });
            if (!fresh.length) return showToast('没解析出有效行');
            db.myStickers.push(...fresh);
            await persistStickers();
            showToast(`导入了 ${fresh.length} 个表情`);
            view = 'home';
            render();
            return;
        }

        // ——— 表情多选 / 移动 / 删除 ———
        if (name === 'cell') {
            if (!manageMode) return;
            const id = node.dataset.id;
            if (picked.has(id)) picked.delete(id); else picked.add(id);
            render();
            return;
        }
        if (name === 'pick-all') {
            browseList().forEach(s => picked.add(s.id));
            render();
            return;
        }
        if (name === 'pick-del') {
            if (!picked.size) return showToast('还没选中表情');
            if (!window.confirm(`确定删除这 ${picked.size} 个表情？`)) return;
            await dexieDB.myStickers.bulkDelete([...picked]);
            db.myStickers = db.myStickers.filter(s => !picked.has(s.id));
            picked.clear();
            sheet = '';
            await persistStickers();
            showToast('已删除');
            render();
            return;
        }
        if (name === 'pick-move') {
            if (!picked.size) return showToast('还没选中表情');
            sheet = 'move';
            drawSheet();
            return;
        }
        if (name === 'move-to') {
            overlay().querySelectorAll('.sm-chip').forEach(c => c.classList.remove('on'));
            node.classList.add('on');
            const input = find('#sm-move-group');
            if (input) input.value = node.dataset.g;
            return;
        }
        if (name === 'move-run') {
            const input = find('#sm-move-group');
            const target = input ? input.value.trim() : '';
            const n = picked.size;
            db.myStickers.forEach(s => { if (picked.has(s.id)) s.group = target; });
            picked.clear();
            sheet = '';
            await persistStickers();
            showToast(`已移动 ${n} 个表情`);
            render();
            return;
        }

        // ——— 管理分组 ———
        if (name === 'groups-open') { sheet = 'groups'; drawSheet(); return; }
        if (name === 'grp-rename') {
            const g = node.dataset.g;
            const label = window.prompt('分组改名', g);
            if (label === null) return;
            const t = label.trim();
            if (!t) return showToast('名字不能为空');
            db.myStickers.forEach(s => {
                if (g === '' ? !s.group : s.group === g) s.group = t;
            });
            if (browseGroup === g) browseGroup = t;
            sheet = 'groups';
            await persistStickers();
            showToast('已改名');
            render();
            return;
        }
        if (name === 'grp-del') {
            const g = node.dataset.g;
            const doomed = db.myStickers.filter(s => (g === '' ? !s.group : s.group === g));
            if (!doomed.length) return;
            if (!window.confirm(`删除分组「${g || '未分组'}」和里面 ${doomed.length} 个表情？`)) return;
            await dexieDB.myStickers.bulkDelete(doomed.map(s => s.id));
            db.myStickers = db.myStickers.filter(s => (g === '' ? !!s.group : s.group !== g));
            if (browseGroup === g) browseGroup = 'all';
            picked.clear();
            sheet = 'groups';
            await persistStickers();
            showToast('已删除');
            render();
            return;
        }

        // ——— 添加颜文字 ———
        if (name === 'kao-pick') {
            kaoAddPick = parseInt(node.dataset.i, 10);
            el.querySelectorAll('.sm-chip[data-act="kao-pick"]').forEach((c, i) => c.classList.toggle('on', i === kaoAddPick));
            return;
        }
        if (name === 'kao-save') {
            const text = el.querySelector('#sm-kao-text').value.trim();
            if (!text) return showToast('先输入颜文字');
            const c = cats()[kaoAddPick];
            if (!c) return showToast('还没有分类');
            c.items.push(text);
            persistKaomoji();
            showToast(`已添加到「${c.name}」`);
            view = 'home';
            render();
            return;
        }

        // ——— 批量导入颜文字：左边描述，冒号，右边颜文字 ———
        if (name === 'kao-import-run') {
            const text = el.querySelector('#sm-kimp-text').value.trim();
            const catName = el.querySelector('#sm-kimp-cat').value.trim();
            if (!text) return showToast('先粘贴要导入的内容');
            const list = cats();
            const label = catName || '未分类';
            let ti = list.findIndex(c => c.name === label);
            if (ti < 0) {
                list.push({ name: label, items: [] });
                ti = list.length - 1;
            }
            let n = 0;
            text.split('\n').forEach(line => {
                const t = line.trim().replace('：', ':');
                if (!t) return;
                const at = t.indexOf(':');
                if (at < 0) {
                    list[ti].items.push(t);
                    n++;
                    return;
                }
                const desc = t.substring(0, at).trim();
                const kao = t.substring(at + 1).trim();
                if (!kao) return;
                list[ti].items.push(desc ? { d: desc, t: kao } : kao);
                n++;
            });
            if (!n) return showToast('没解析出有效行');
            persistKaomoji();
            showToast(`导入了 ${n} 条颜文字`);
            view = 'home';
            render();
            return;
        }

        // ——— 颜文字多选 / 移动 / 删除 ———
        if (name === 'kao-cell') {
            if (!manageMode) return;
            const key = node.dataset.key;
            if (picked.has(key)) picked.delete(key); else picked.add(key);
            render();
            return;
        }
        if (name === 'kao-pick-all') {
            kaoItemList().forEach(o => picked.add(o.i + ':' + o.k));
            render();
            return;
        }
        if (name === 'kao-move-open') {
            if (!picked.size) return showToast('还没选中颜文字');
            sheet = 'kmove';
            drawSheet();
            return;
        }
        if (name === 'kao-move-to') {
            overlay().querySelectorAll('.sm-chip').forEach(c => c.classList.remove('on'));
            node.classList.add('on');
            const input = find('#sm-kmove-cat');
            if (input) input.value = node.dataset.c;
            return;
        }
        if (name === 'kao-move-run') {
            const input = find('#sm-kmove-cat');
            const target = input ? input.value.trim() : '';
            if (!target) return showToast('给个分类名');
            const moved = takePicked();
            if (!moved.length) return;
            const list = cats();
            let ti = list.findIndex(c => c.name === target);
            if (ti < 0) {
                list.push({ name: target, items: [] });
                ti = list.length - 1;
            }
            list[ti].items.push(...moved);
            picked.clear();
            kaoGroup = 'all';
            sheet = '';
            persistKaomoji();
            showToast(`已移动 ${moved.length} 条`);
            render();
            return;
        }
        if (name === 'kao-pick-del') {
            if (!picked.size) return showToast('还没选中颜文字');
            if (!window.confirm(`删除这 ${picked.size} 条颜文字？`)) return;
            takePicked();
            picked.clear();
            kaoGroup = 'all';
            sheet = '';
            persistKaomoji();
            showToast('已删除');
            render();
            return;
        }

        // ——— 管理分类 ———
        if (name === 'cats-open') { sheet = 'cats'; drawSheet(); return; }
        if (name === 'cat-new') {
            const input = find('#sm-cat-new');
            const t = input ? input.value.trim() : '';
            if (!t) return showToast('名字不能为空');
            cats().push({ name: t, items: [] });
            sheet = 'cats';
            persistKaomoji();
            showToast(`已新建分类「${t}」`);
            render();
            return;
        }
        if (name === 'cat-up' || name === 'cat-down') {
            const i = parseInt(node.dataset.i, 10);
            const j = name === 'cat-up' ? i - 1 : i + 1;
            const list = cats();
            if (j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            if (kaoGroup === String(i)) kaoGroup = String(j);
            else if (kaoGroup === String(j)) kaoGroup = String(i);
            picked.clear();
            sheet = 'cats';
            persistKaomoji();
            render();
            return;
        }
        if (name === 'cat-rename') {
            const i = parseInt(node.dataset.i, 10);
            const c = cats()[i];
            if (!c) return;
            const label = window.prompt('分类改名', c.name);
            if (label === null) return;
            const t = label.trim();
            if (!t) return showToast('名字不能为空');
            c.name = t;
            sheet = 'cats';
            persistKaomoji();
            showToast('已改名');
            render();
            return;
        }
        if (name === 'cat-del') {
            const i = parseInt(node.dataset.i, 10);
            const c = cats()[i];
            if (!c) return;
            if (!window.confirm(`删除分类「${c.name}」和里面 ${c.items.length} 条颜文字？`)) return;
            cats().splice(i, 1);
            picked.clear();
            kaoGroup = 'all';
            sheet = 'cats';
            persistKaomoji();
            showToast('已删除');
            render();
            return;
        }
    }

    // 按选中键把条目从各自分类里摘出来返回（下标从后往前删，不会错位）
    function takePicked() {
        const byCat = {};
        picked.forEach(key => {
            const p = String(key).split(':');
            const i = p[0], k = Number(p[1]);
            if (!byCat[i]) byCat[i] = [];
            byCat[i].push(k);
        });
        const list = cats();
        const out = [];
        Object.keys(byCat).forEach(i => {
            const c = list[+i];
            if (!c) return;
            byCat[i].sort((a, b) => b - a).forEach(k => {
                if (k < c.items.length) out.push(c.items.splice(k, 1)[0]);
            });
        });
        return out;
    }

    // ==================== 接线 ====================
    function init() {
        if (wired) return;
        const el = body();
        if (!el) return;
        wired = true;

        el.addEventListener('click', (e) => {
            const node = e.target.closest('[data-act]');
            if (!node) return;
            e.preventDefault();
            e.stopPropagation();
            act(node.dataset.act, node);
        });

        const mb = document.getElementById(MANAGE_BTN_ID);
        if (mb) mb.addEventListener('click', () => act('toggle-manage'));

        // 子页面里顶栏返回键先回到本页首页
        const back = document.querySelector('#' + SCREEN_ID + ' .back-btn');
        if (back) {
            back.addEventListener('click', (e) => {
                if (view === 'home') return;
                e.stopPropagation();
                e.preventDefault();
                view = 'home';
                manageMode = false;
                picked.clear();
                sheet = '';
                render();
            }, true);
        }
    }

    window.MieStickerManager = {
        open() {
            if (!document.getElementById(BODY_ID)) return;
            init();
            view = 'home';
            manageMode = false;
            picked.clear();
            sheet = '';
            kaoGroup = 'all';
            browseGroup = 'all';
            render();
            switchScreen(SCREEN_ID);
        }
    };
})();
