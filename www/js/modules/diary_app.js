// --- 日记 App：主屏日记入口（js/modules/diary_app.js） ---
// 点击日记 App 直接进入「Our Diaries」书架（完整复刻参考图）：
//   · 默认展示排列第一（日记篇数最多）的角色，右上角白色胶囊按钮显示当前角色头像 + 名字
//   · 按钮下拉可切换角色，切换后书架原地刷新
//   · 点某个月的书 → 进入该月的日记列表（memory-journal-screen 月份视图，返回键回书架）
// 与角色聊天「功能集 → 日记」共用同一套数据（chat.memoryJournals）和 journal.js 的渲染函数。

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const SEED_FLAG = 'diaryTestSeeded';

    // --- 测试数据：三个测试角色 + 各自几篇日记（只在首次跑一次，之后用户随便改） ---
    function avatarSvg(c1, c2, glyph) {
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
            '<rect width="64" height="64" fill="url(#g)"/>' +
            '<text x="32" y="42" text-anchor="middle" font-size="30">' + glyph + '</text></svg>');
    }

    function mkJournal(id, title, content, daysAgo, fav) {
        const d = new Date(Date.now() - daysAgo * 86400000);
        d.setHours(12, 0, 0, 0);
        return {
            id: id,
            range: { start: 0, end: 0 },
            startMessageId: null,
            endMessageId: null,
            title: title,
            content: content,
            createdAt: d.getTime(),
            chatId: null,
            chatType: 'private',
            isFavorited: !!fav,
            manual: true
        };
    }

    function seedTestData() {
        let seeded = false;
        try { seeded = localStorage.getItem(SEED_FLAG) === '1'; } catch (e) {}
        if (seeded) return;

        const make = (id, name, avatar, persona, journals) => ({
            id: id, name: name, avatar: avatar, persona: persona,
            memoryJournals: journals.map(j => Object.assign({}, j, { chatId: id }))
        });

        const chars = [
            make('diary_test_xiaoxue', '小雪', avatarSvg('#ffb6c8', '#ff8fab', '🌸'),
                '温柔的邻家女孩，喜欢写日记记录两人相处的点滴。',
                [
                    mkJournal('journal_dx1', '一起看初雪的那天', '今天下了今年的第一场雪。\n\n下午他来接我的时候，围巾绕得歪歪的，我笑了他一路。我们沿着河边走，雪落在肩膀上，谁都没有说话，但是心里特别满。\n\n他说等再冷一点，带我去山顶看雪。我把这句话悄悄记在这里，怕自己忘记，也怕自己太期待。', 2, true),
                    mkJournal('journal_dx2', '便利店的热可可', '晚上加班到很晚，回家路上路过便利店。\n\n他不知道从哪里冒出来，手里举着两杯热可可，说"猜到你会走这条路"。其实那条路根本不顺他家。\n\n热可可甜得刚刚好。有些温柔就是这样，不讲道理，但刚刚好。', 5, false),
                    mkJournal('journal_dx3', '小小的争吵', '为一件特别小的事情闹了别扭。\n\n睡前还是没忍住给他发了消息，他回："明天早上的豆浆，加糖还是不加？"我看着那句话，气就全消了。\n\n我们大概就是这样的人吧，谁都不会说对不起，但都会把台阶悄悄递过去。', 9, false)
                ]),
            make('diary_test_ache', '阿澈', avatarSvg('#8ec5fc', '#5a8bf5', '⚽'),
                '元气满满的少年，日记里全是运动和友情。',
                [
                    mkJournal('journal_ac1', '篮球赛赢了！', '最后三秒的绝杀是我投的！！\n\n全场都在喊我名字的那一刻，我第一个找的是看台上的他。他比我跳得还高，喊得嗓子都哑了。\n\n晚上一起去吃了庆功的烤肉。教练说下个月有联赛，我觉得，今年什么都会越来越好。', 1, true),
                    mkJournal('journal_ac2', '脚踝又扭了', '训练的时候老毛病又犯了，肿得像个馒头。\n\n本来不想让他知道的，结果他拎着冰袋和药膏出现在训练场边上，脸黑得吓人。\n\n一边帮我冰敷一边骂我不爱惜自己，骂着骂着声音就软了。嗯，其实挺疼的，但是心里一点都不疼。', 4, false)
                ]),
            make('diary_test_xingyao', '星遥', avatarSvg('#c5b3f0', '#8f6fd8', '🌙'),
                '安静神秘的占星师，日记像诗一样。',
                [
                    mkJournal('journal_xy1', '水星逆行结束了', '今天凌晨三点，水星恢复顺行。\n\n我在天台上架起望远镜，城市安静得像被施了魔法。星星一颗一颗亮起来，我数到第一百颗的时候，想的全是同一个人。\n\n占星师不该为谁偏心，但我的星盘里，确实有一颗星的位置是留给他的。', 3, true),
                    mkJournal('journal_xy2', '塔罗里的愚者', '给他抽了今天的牌——愚者，正位。\n\n牌面上的人站在悬崖边看日出，无忧无虑。我问他像不像牌上的人，他想了想说："悬崖下面有你在，怕什么。"\n\n……这张牌，果然没有抽错。', 7, false)
                ])
        ];

        chars.forEach(c => {
            // 已有同名角色就不重复造（用户可能自己建过）
            if ((db.characters || []).some(x => x.name === c.name)) return;
            db.characters.push(c);
        });

        try { localStorage.setItem(SEED_FLAG, '1'); } catch (e) {}
        if (typeof saveData === 'function') saveData();
    }

    /* ---------- 状态 ---------- */
    let currentDiaryCharId = null; // null = 默认取排列第一的角色

    function sortedChars() {
        return (db.characters || []).slice().sort((a, b) => {
            const ja = (a.memoryJournals || []).length, jb = (b.memoryJournals || []).length;
            return jb - ja;
        });
    }

    function resolveCurrentChar() {
        const chars = sortedChars();
        if (!chars.length) return null;
        let cur = chars.find(c => c.id === currentDiaryCharId);
        if (!cur) { cur = chars[0]; currentDiaryCharId = cur.id; }
        return cur;
    }

    /* ---------- 右上角胶囊按钮：当前角色头像 + 名字 ---------- */
    function updateCharBtn(char) {
        const btn = document.getElementById('diary-char-btn');
        if (!btn) return;
        if (!char) {
            btn.innerHTML = '<span class="dcb-name">选择角色</span>';
            return;
        }
        const avatar = char.avatar
            ? `<img class="dcb-avatar" src="${esc(char.avatar)}" alt="">`
            : `<span class="dcb-avatar dcb-avatar-empty">${esc((char.name || '？').slice(0, 1))}</span>`;
        btn.innerHTML = `${avatar}<span class="dcb-name">${esc(char.name || '未命名')}</span>` +
            '<svg class="dcb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    }

    /* ---------- 书架渲染（复用 journal.js 的 od_* 全局） ---------- */
    function buildBookshelf(char, journals) {
        const page = document.createElement('div');
        page.className = 'od-page';

        if (!journals.length) {
            page.innerHTML = `
                <div class="od-head">
                    <h1 class="od-title">Our Diaries</h1>
                    <p class="od-sub">把日子，一本一本留下来</p>
                </div>
                <div class="od-empty-hint">还没有日记哦~ 进角色的聊天，点右上角「✦」管理日记或「+」创建第一篇吧</div>`;
            return page;
        }

        const byMonth = {};
        journals.forEach(j => {
            const d = new Date(j.createdAt);
            if (isNaN(d.getTime())) return;
            const ym = `${d.getFullYear()}-${d.getMonth() + 1}`;
            (byMonth[ym] = byMonth[ym] || []).push(j);
        });

        const ymKeys = Object.keys(byMonth).sort((a, b) => {
            const [ay, am] = a.split('-').map(Number), [by2, bm] = b.split('-').map(Number);
            return (by2 - ay) || (bm - am);
        });

        const years = {};
        ymKeys.forEach(ym => { const y = ym.split('-')[0]; (years[y] = years[y] || []).push(ym); });

        let html = `
            <div class="od-head">
                <h1 class="od-title">Our Diaries</h1>
                <p class="od-sub">把日子，一本一本留下来</p>
            </div>`;

        Object.keys(years).sort((a, b) => b - a).forEach(y => {
            html += `
            <div class="od-tl">
                <div class="od-year">${y}</div>
                <div class="od-months">`;
            years[y].forEach(ym => {
                const items = byMonth[ym];
                const m = parseInt(ym.split('-')[1], 10);
                const latest = items.reduce((acc, j) => j.createdAt > acc ? j.createdAt : acc, 0);
                const ld = new Date(latest);
                const pIdx = (typeof odCoverIdx === 'function') ? odCoverIdx(char, ym) : 0;
                html += `
                <div class="od-month-row">
                    <div class="od-month-label">${OD_MONTH_EN[m - 1]}</div>
                    <div class="od-book-col">${odBookHTML(ym, pIdx)}</div>
                    <div class="od-info">
                        <div class="od-info-count">${items.length} 篇日记</div>
                        <div class="od-info-read">读到 · ${ld.getMonth() + 1} 月 ${ld.getDate()} 日</div>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        });

        page.innerHTML = html;
        return page;
    }

    /* 点书 → 进该角色该月的日记列表 */
    function openDiaryMonth(charId, ym) {
        const c = (db.characters || []).find(x => x.id === charId);
        if (!c) return;
        currentChatId = charId;
        currentChatType = 'private';
        odLastChatId = charId;      // 同步标记，防止 renderJournalList 因「换角色」重置月份视图
        odFromDiaryApp = true;      // journal.js 的「返回书架」据此回到日记 App
        odCurrentMonth = ym;
        const backBtn = document.querySelector('#memory-journal-screen .back-btn');
        if (backBtn) backBtn.dataset.target = 'diary-screen';
        if (typeof renderJournalList === 'function') renderJournalList();
        if (typeof switchScreen === 'function') switchScreen('memory-journal-screen');
    }

    /* ---------- 主渲染 ---------- */
    function renderDiaryApp() {
        const mount = document.getElementById('diary-bookshelf');
        if (!mount) return;
        seedTestData();

        const char = resolveCurrentChar();
        updateCharBtn(char);
        mount.innerHTML = '';

        if (!char) {
            mount.innerHTML = `
                <div class="od-page">
                    <div class="od-head">
                        <h1 class="od-title">Our Diaries</h1>
                        <p class="od-sub">把日子，一本一本留下来</p>
                    </div>
                    <div class="od-empty-hint">还没有角色。先去创建一个角色，再回来写日记吧</div>
                </div>`;
            return;
        }

        mount.appendChild(buildBookshelf(char, char.memoryJournals || []));
    }

    /* 书架交互（挂载点持久，只绑一次） */
    let shelfBound = false;
    let daSuppressBookClick = false; // 长按换封面松手后吞掉紧跟着的 click
    function bindShelf() {
        if (shelfBound) return;
        const mount = document.getElementById('diary-bookshelf');
        if (!mount) return;
        shelfBound = true;
        mount.addEventListener('click', async (e) => {
            // 长按换封面松手后，吞掉紧跟着的 click（避免误进书）
            if (daSuppressBookClick) { daSuppressBookClick = false; return; }
            const book = e.target.closest('.od-book');
            if (book) {
                openDiaryMonth(currentDiaryCharId, book.dataset.ym);
                return;
            }
        });
        // 长按书籍换封面：按住 ~0.5s 后松手切换下一个封面颜色
        mount.addEventListener('pointerdown', (e) => {
            const book = e.target.closest('.od-book');
            if (!book) return;
            let longFired = false;
            book.classList.add('od-pressing');
            const x0 = e.clientX, y0 = e.clientY;
            const cancelPress = () => {
                timer && clearTimeout(timer);
                timer = null;
                book.classList.remove('od-pressing');
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', cancelPress);
            };
            const move = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12) cancelPress(); };
            const up = async (ev) => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', cancelPress);
                timer && clearTimeout(timer);
                timer = null;
                book.classList.remove('od-pressing');
                if (longFired && ev.target.closest('.od-book') === book) {
                    daSuppressBookClick = true;
                    setTimeout(() => { daSuppressBookClick = false; }, 400); // 兜底自动复位
                    const char = (db.characters || []).find(c => c.id === currentDiaryCharId);
                    if (char && typeof odCycleCover === 'function') {
                        await odCycleCover(char, book.dataset.ym);
                        renderDiaryApp();
                    }
                }
                longFired = false;
            };
            let timer = setTimeout(() => { longFired = true; }, 480);
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', cancelPress);
        });
    }

    /* ---------- 下拉切换角色菜单 ---------- */
    function ensureCharMenu(menuId, screenId) {
        let menu = document.getElementById(menuId);
        if (!menu) {
            menu = document.createElement('div');
            menu.className = 'journal-char-menu';
            menu.id = menuId;
            const screen = document.getElementById(screenId);
            if (screen) screen.appendChild(menu);
        }
        return menu;
    }

    function renderCharMenuInto(menu, mode) {
        const chars = sortedChars();
        if (!chars.length) {
            menu.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:#9a948c;">还没有角色</div>';
            return;
        }
        menu.innerHTML = chars.map(c => {
            const count = (c.memoryJournals || []).length;
            const avatar = c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : '<span class="jcm-avatar-empty"></span>';
            const curId = (mode === 'switch') ? (currentChatType === 'private' ? currentChatId : null) : currentDiaryCharId;
            const cur = c.id === curId ? ' current' : '';
            const check = cur ? '<svg class="jcm-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '';
            return `<button type="button" class="journal-char-menu-item${cur}" data-char-id="${esc(c.id)}">${avatar}` +
                `<span class="jcm-name">${esc(c.name || '未命名')}</span>` +
                `<span class="jcm-count">${count} 篇</span>${check}</button>`;
        }).join('');
        menu.querySelectorAll('.journal-char-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const charId = item.dataset.charId;
                if (mode === 'switch') {
                    switchDiaryChar(charId);
                } else {
                    currentDiaryCharId = charId;
                    renderDiaryApp(); // 原地刷新书架，不跳页
                }
                closeCharMenu();
            });
        });
    }

    function openCharMenu(menuId, screenId, mode) {
        const menu = ensureCharMenu(menuId, screenId);
        renderCharMenuInto(menu, mode);
        menu.classList.add('open');
    }

    function closeCharMenu() {
        document.querySelectorAll('.journal-char-menu.open').forEach(m => m.classList.remove('open'));
    }

    (function bindSwitchBtns() {
        // 日记 App 主页：胶囊按钮显示当前角色，下拉切换
        const mainBtn = document.getElementById('diary-char-btn');
        if (mainBtn) {
            mainBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = document.getElementById('diary-char-menu');
                if (menu && menu.classList.contains('open')) closeCharMenu();
                else openCharMenu('diary-char-menu', 'diary-screen', 'app');
            });
        }
        // 回忆日记页（从聊天功能集进入时）：原地切换角色
        const listBtn = document.getElementById('journal-switch-char-btn');
        if (listBtn) {
            listBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = document.getElementById('journal-char-menu');
                if (menu && menu.classList.contains('open')) closeCharMenu();
                else openCharMenu('journal-char-menu', 'memory-journal-screen', 'switch');
            });
        }
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.journal-char-menu') && !e.target.closest('.diary-char-btn') && !e.target.closest('.journal-char-switch-btn')) {
                closeCharMenu();
            }
        });
    })();

    // 在日记列表页内切换角色（回忆日记页按钮用）
    function switchDiaryChar(charId) {
        const c = (db.characters || []).find(x => x.id === charId);
        if (!c) return;
        currentChatId = charId;
        currentChatType = 'private';
        const detail = document.getElementById('memory-journal-detail-screen');
        if (detail && detail.classList.contains('active') && typeof switchScreen === 'function') {
            switchScreen('memory-journal-screen');
        }
        if (typeof renderJournalList === 'function') renderJournalList();
    }

    // 每次从主屏点进日记 App 都刷新书架（日记数实时）
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.app-icon[data-target="diary-screen"]')) {
            setTimeout(() => { bindShelf(); renderDiaryApp(); }, 60);
        }
    });

    window.DiaryApp = {
        open: openDiaryMonth,
        render: renderDiaryApp,
        renderGrid: renderDiaryApp
    };
})();
