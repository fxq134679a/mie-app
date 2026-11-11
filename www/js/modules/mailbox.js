/* ============ 信箱 App（whisper-mailbox 完整移植 + 角色写信） ============
 * 入口：主屏幕「信箱」图标 → #mailbox-screen
 * 列表：Inbox / Sent / Unread，信封随滚动 3D 翻转，未读回形针
 * 拆信：点信封 → 翻转 → 封盖翻开 → 抽出信纸 → 分页阅读（左右滑/箭头）
 * 写信：选择寄件人/收件人（我 或 角色）；角色当寄件人时可让 AI 代写
 * 其他：回信、粉碎删除、多选删除、最近删除 7 天恢复、时间/密码锁、外观/信纸字体
 * 数据：db.mailboxLetters；角色来自 db.characters
 */
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const screenEl = () => document.getElementById('mailbox-screen');
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const pad = (n) => String(n).padStart(2, '0');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
    const PREFS_KEY = 'whisper-mailbox-preferences-v1';
    const DEMO_KEY = 'whisper-mailbox-demo-v1';
    const DEMO_PASSWORD_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    const FOLDERS = {
        received: { title: 'Inbox', label: '收件箱' },
        sent: { title: 'Sent', label: '已寄出' },
        unread: { title: 'Unread', label: '未读' }
    };

    const view = {
        folder: 'received',
        positions: new Map(),
        roles: [],
        mounted: false,
        editing: null,
        active: null,
        selecting: false,
        selected: new Set(),
        auto: true,
        autoFrame: 0,
        autoLast: 0,
        autoPos: null,
        pauseUntil: 0,
        autoDirection: 1,
        items: [],
        tiltFrame: 0,
        trashRows: [],
        hover: null,
        pressed: null
    };

    /* ===== 偏好：外观 / 信纸字体 ===== */
    const paperFonts = {
        default: '',
        serif: 'Georgia,"Times New Roman","Songti SC",serif',
        handwriting: '"Segoe Print","KaiTi","STKaiti",cursive',
        mono: '"Cascadia Code",Consolas,"Microsoft YaHei",monospace'
    };
    let preferences = { theme: 'system', paperFont: 'default', roleFonts: {} };
    try { Object.assign(preferences, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}); } catch (e) { /* 忽略损坏的偏好 */ }
    if (!preferences.roleFonts || typeof preferences.roleFonts !== 'object') preferences.roleFonts = {};

    function savePreferences() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); } catch (e) { /* 存储不可用时保持内存态 */ }
    }

    function customFontPresets() {
        const presets = (window.db && Array.isArray(db.fontPresets)) ? db.fontPresets : [];
        return presets.filter((p) => p && p.isCustom && p.fontFamily);
    }

    function fontFamilyFor(value) {
        if (!value || value === 'default') return '';
        if (Object.prototype.hasOwnProperty.call(paperFonts, value)) return paperFonts[value];
        const preset = customFontPresets().find((p) => p.id === value || p.name === value);
        return preset ? `"${preset.fontFamily}", var(--font-b)` : '';
    }

    function applyLetterFont(letter) {
        const root = screenEl();
        if (!root) return;
        const value = letter && letter.from !== 'self' ? (preferences.roleFonts || {})[String(letter.fromRoleId)] : '';
        const family = fontFamilyFor(value);
        if (family) root.style.setProperty('--font-letter-role', family);
        else root.style.removeProperty('--font-letter-role');
    }

    function applyPreferences() {
        const root = screenEl();
        if (!root) return;
        const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark.matches);
        root.dataset.appearance = dark ? 'dark' : 'light';
        const family = fontFamilyFor(preferences.paperFont);
        if (family) root.style.setProperty('--font-letter-body', family);
        else root.style.removeProperty('--font-letter-body');
    }

    systemDark.addEventListener('change', () => { if (preferences.theme === 'system') applyPreferences(); });

    /* ===== 角色信件字体 ===== */
    const roleFontBuiltins = [
        ['default', '跟随默认信纸字体'],
        ['serif', 'Serif'],
        ['handwriting', 'Handwriting / 楷体'],
        ['mono', 'Monospace']
    ];

    function roleFontOptions(selected) {
        const options = roleFontBuiltins.slice();
        for (const preset of customFontPresets()) options.push([preset.id, preset.name || '自定义字体']);
        if (selected && selected !== 'default' && !options.some(([value]) => value === selected)) {
            options.push([selected, '（字体已丢失，重选一个）']);
        }
        return options.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
    }

    function previewRoleFont(select) {
        const family = fontFamilyFor(select.value);
        if (family) select.style.fontFamily = family;
        else select.style.removeProperty('font-family');
    }

    function renderRoleFonts() {
        const list = $('mb-role-font-list');
        if (!list) return;
        loadRoles();
        if (!view.roles.length) {
            list.innerHTML = '<p class="mb-role-font-empty">还没有角色。先在主屏幕里添加角色，再回来给 TA 挑字体。</p>';
            return;
        }
        list.innerHTML = view.roles.map((role) => {
            const selected = preferences.roleFonts[role.id] || 'default';
            return `<label class="mb-role-font-row"><span class="mb-role-font-name">${esc(role.name)}</span><select class="mb-input mb-role-font-select" data-role="${esc(role.id)}" aria-label="${esc(role.name)}的信件字体">${roleFontOptions(selected)}</select></label>`;
        }).join('');
        list.querySelectorAll('.mb-role-font-select').forEach((select) => {
            previewRoleFont(select);
            select.addEventListener('change', () => {
                const roleId = select.dataset.role;
                if (select.value === 'default') delete preferences.roleFonts[roleId];
                else preferences.roleFonts[roleId] = select.value;
                savePreferences();
                previewRoleFont(select);
                if (view.active && String(view.active.fromRoleId) === String(roleId)) applyLetterFont(view.active);
                toast(`已给${roleName(roleId)}换好字体`);
            });
        });
    }

    async function uploadRoleFont(file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['ttf', 'woff', 'woff2', 'otf'].includes(ext)) {
            toast('只支持 ttf / woff / woff2 / otf 字体');
            return;
        }
        if (!window.dexieDB || !window.db) {
            toast('字体系统还没准备好，稍后再试');
            return;
        }
        try {
            toast('正在处理字体文件…');
            const id = 'font_' + Date.now();
            const preset = {
                id,
                name: file.name.replace(/\.[^.]+$/, '') || '自定义字体',
                isCustom: true,
                fontFamily: 'CustomFont_' + Date.now()
            };
            await dexieDB.customFonts.put({ id, file, timestamp: Date.now() });
            if (!Array.isArray(db.fontPresets)) db.fontPresets = [];
            db.fontPresets.push(preset);
            try { if (typeof saveData === 'function') saveData(); } catch (e) { /* 保存失败仍可临时使用 */ }
            if (typeof window.injectCustomFont === 'function') await window.injectCustomFont(preset);
            renderRoleFonts();
            toast('字体已上传，给哪个角色用就选一下');
        } catch (error) {
            console.error('[Mailbox] 字体上传失败', error);
            toast('字体上传失败，换一个文件试试');
        }
    }

    /* ===== 数据 ===== */
    function letters() {
        if (!window.db) return [];
        if (!Array.isArray(db.mailboxLetters)) db.mailboxLetters = [];
        return db.mailboxLetters;
    }

    function persist() {
        try { if (typeof saveData === 'function') saveData(); } catch (e) { /* 保存失败不影响当前界面 */ }
    }

    const hasPassword = (l) => !!(l && (l.passwordHash || l.password));
    const incoming = (l) => l.to === 'self';
    const isUnread = (l) => incoming(l) && !l.readAt;
    function isUnlocked(l) {
        if (!l) return false;
        if (l.isUnlocked) return true;
        if (!l.unlockAt && !hasPassword(l)) return true;
        return !!l.unlockAt && Date.parse(l.unlockAt) <= Date.now();
    }

    function fmt(ts) {
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return '—';
        return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function dateLabel() {
        const d = new Date();
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function timeLeft(ts) {
        const remaining = new Date(ts).getTime() - Date.now();
        if (!Number.isFinite(remaining)) return '等待解封';
        if (remaining <= 0) return '已到解封时间';
        const minutes = Math.ceil(remaining / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days) return `还有 ${days} 天 ${hours % 24} 小时可打开`;
        if (hours) return `还有 ${hours} 小时 ${minutes % 60} 分可打开`;
        return `还有 ${minutes} 分钟可打开`;
    }

    const lockMessage = (l) => l.unlockAt ? timeLeft(l.unlockAt) : hasPassword(l) ? '密码解封' : '等待解封';

    async function hash(text) {
        if (!text) return null;
        if (window.crypto && crypto.subtle) {
            try {
                const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                return [...new Uint8Array(buffer)].map((v) => v.toString(16).padStart(2, '0')).join('');
            } catch (e) { /* file:// 下退回简单散列 */ }
        }
        let h = 0;
        for (const ch of String(text)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
        return 'fallback' + h.toString(16);
    }

    function loadRoles() {
        const chars = (window.db && db.characters) || [];
        view.roles = chars.filter((c) => c && c.id).map((c) => ({
            id: String(c.id),
            name: String(c.remarkName || c.realName || c.name || 'TA'),
            avatar: c.avatar || '',
            persona: c.persona || c.description || '',
            raw: c
        }));
        return view.roles;
    }

    const roleById = (id) => view.roles.find((r) => r.id === String(id));
    const roleName = (id) => { const r = roleById(id); return r ? r.name : 'TA'; };

    function person(letter, side) {
        if (letter[side] === 'self' || letter[side + 'RoleId'] === 'self') return '你';
        const role = roleById(letter[side + 'RoleId']);
        return role ? role.name : (letter[side + 'Name'] || 'TA');
    }

    function welcomeLetter() {
        return {
            id: 'mb-welcome',
            from: 'contact',
            to: 'self',
            fromRoleId: 'mailbox',
            toRoleId: 'self',
            fromName: '信箱',
            toName: '你',
            content: '这是你的信箱。\n\n从今天起，你可以给手机里的任何一个角色写信，也可以让他们坐下来，认真给你写一封。\n\n点右上角的 +，选一个角色当收件人，把想说的话写在信纸上。如果想收到他们的来信，把寄件人换成角色、收件人换成你，再点「让 TA 写」，信就会自己落到信箱里。\n\n信纸一页放不下的时候，左右轻轻一滑就能翻页。\n\n收到信以后，左上角的回形针会提醒你还没拆。拆开时，封盖会翻起来，信纸从信封里抽出来。读完了，把信收回信封，它会自己躺回原来的位置。',
            createdAt: new Date().toISOString(),
            readAt: null,
            reply: null,
            allowReply: true,
            isUnlocked: true,
            hidden: false,
            purgeAt: null
        };
    }

    /* 兼容旧版简化信箱的数据结构 */
    function normalizeLetters() {
        const list = letters();
        let changed = false;
        for (const l of list) {
            if (!l || typeof l !== 'object') continue;
            if (typeof l.createdAt === 'number') { l.createdAt = new Date(l.createdAt).toISOString(); changed = true; }
            if (l.body != null && l.content == null) {
                l.content = (l.subject ? String(l.subject) + '\n\n' : '') + String(l.body);
                delete l.body; delete l.subject; changed = true;
            }
            if (l.read != null && l.readAt == null) {
                l.readAt = l.read ? new Date(l.createdAt || Date.now()).toISOString() : null;
                delete l.read; changed = true;
            }
            if (l.folder) {
                if (l.folder === 'sent') { l.from = 'self'; l.to = 'contact'; l.toRoleId = l.toRoleId || ''; }
                else { l.from = 'contact'; l.to = 'self'; l.fromRoleId = l.fromRoleId || 'mailbox'; }
                delete l.folder; changed = true;
            }
            if (l.from === 'system') { l.from = 'contact'; l.fromRoleId = l.fromRoleId || 'mailbox'; changed = true; }
            if (!l.createdAt) { l.createdAt = new Date().toISOString(); changed = true; }
            if (l.allowReply == null) { l.allowReply = true; changed = true; }
            if (l.reply === undefined) { l.reply = null; changed = true; }
            if (l.hidden == null) { l.hidden = !!l.deletedAt; changed = true; }
            if (l.purgeAt == null && l.deletedAt) {
                l.purgeAt = new Date(Date.parse(l.deletedAt) + RETENTION_MS).toISOString();
                changed = true;
            }
            if (l.sticker != null) { delete l.sticker; changed = true; }
            if (l.avatar != null) { delete l.avatar; changed = true; }
            if (l.isUnlocked == null) { l.isUnlocked = isUnlocked(l); changed = true; }
        }
        const now = Date.now();
        const kept = list.filter((l) => !(l && l.hidden && l.purgeAt && Date.parse(l.purgeAt) <= now));
        if (kept.length !== list.length) {
            db.mailboxLetters = kept;
            changed = true;
        }
        if (changed) persist();
    }

    function ensureSeed() {
        if (!window.db) return;
        if (Array.isArray(db.mailboxLetters)) return;
        db.mailboxLetters = [welcomeLetter()];
        persist();
    }

    /* ===== 示例信 ===== */
    function seedDemoLetters() {
        if (!window.db) return false;
        let seen = '';
        try { seen = localStorage.getItem(DEMO_KEY) || ''; } catch (e) { seen = ''; }
        if (seen) return false;
        const list = letters();
        if (list.some((l) => l && l.demo)) {
            try { localStorage.setItem(DEMO_KEY, '1'); } catch (e) { /* 存储不可用 */ }
            return false;
        }
        const now = Date.now();
        const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
        const demo = (over) => Object.assign({
            from: 'contact',
            to: 'self',
            fromRoleId: 'mailbox',
            toRoleId: 'self',
            fromName: '信箱',
            toName: '你',
            readAt: null,
            reply: null,
            allowReply: true,
            hidden: false,
            purgeAt: null,
            isUnlocked: true,
            demo: true
        }, over);
        const demos = [
            demo({
                id: 'mb-demo-lan',
                fromName: '小岚',
                createdAt: hoursAgo(2),
                content: '今天路过花市，看到一束很浅的黄色小菊，摊主说是刚到的。\n\n我站了一会儿，还是买下来了。现在插在厨房的玻璃瓶里，路过就看见一点亮。\n\n想起你说过，家里要有会慢慢变化的东西。花算一个，信也算一个。\n\n所以写这封给你。不用急着回。'
            }),
            demo({
                id: 'mb-demo-mountain',
                fromName: '远山',
                createdAt: hoursAgo(5),
                unlockAt: new Date(now + 69 * 3600000).toISOString(),
                isUnlocked: false,
                content: '这封信要过几天才能拆。\n\n现在写的时候是晚上，窗外在下雨，楼下的便利店还亮着。等你能看到这些字的时候，雨大概早就停了。\n\n我把想说的话先放在这里：别把日子过得太赶。你已经很好了。\n\n到那天再读一遍，看看有没有什么变了。'
            }),
            demo({
                id: 'mb-demo-tide',
                fromName: '潮汐',
                createdAt: hoursAgo(9),
                passwordHash: DEMO_PASSWORD_HASH,
                isUnlocked: false,
                content: '这是一个小小的盒子，钥匙只有你知道。\n\n里面没有要紧的事，只有一句：今天辛苦了。\n\n密码是四个数字，从小到大，最普通的那一组。\n\n（提示：1、2、3、4 的顺序。）'
            }),
            demo({
                id: 'mb-demo-future',
                fromName: '未来的你',
                createdAt: hoursAgo(36),
                readAt: hoursAgo(30),
                reply: {
                    content: '看完了。谢谢你留的这些字。\n\n窗台的薄荷我也记得。等我回去给它浇水。',
                    createdAt: hoursAgo(28)
                },
                content: '写这封信的时候，我还不知道你会在哪一天拆开它。\n\n也许是一个普通的周三，也许是你刚刚做完一件很累的事，靠在椅子上不想动。那就先别动，把肩膀放下来，慢慢看。\n\n我想跟你讲一件很小的事。\n\n前几天我整理抽屉，翻到一张很久以前的便签，上面只写了半句话，后面被水洇开了。我盯着那半句话看了很久，忽然发现，原来那时候的我已经在替现在的我担心了。她不知道后来会怎样，还是把想说的话留了下来。\n\n人好像总是这样，一边觉得眼前的日子长得没有尽头，一边又悄悄地把一些小东西藏起来，等着以后的自己发现。一颗糖，一张车票，一句没头没尾的话。\n\n所以我也想给你留一点什么。\n\n不是什么大道理。只是希望你偶尔会想起，曾经有一个晚上，有人很认真地坐在这里，想象你现在的样子。想象你也许瘦了一点，也许学会了做一道菜，也许终于把那盆快枯掉的植物救回来了。\n\n如果你现在过得很好，那就不用回信，把这几页纸折回去，放回信封里，让它继续躺在盒子里。\n\n如果你现在不太好，也没关系。信不会催你。你可以明天再看，也可以等到下个季节。\n\n对了，窗台那盆薄荷还活着。我给它换了个大一点的盆，它好像有点不适应，叶子蔫了两天，又慢慢立起来了。\n\n你看，很多东西都是这样。\n\n最后写一句我最近很喜欢的话：慢一点也没关系，路会自己长出来。\n\n我们以后再见。'
            }),
            demo({
                id: 'mb-demo-postman',
                fromName: '邮差',
                createdAt: hoursAgo(50),
                readAt: hoursAgo(49),
                content: '这是这个信箱的第一封测试信。\n\n如果你能看到日期、贴纸、回形针和背后折起的封口线，说明一切都装好了。\n\n试着把它往两边滑一滑，看看前后的信是怎么翻过去的。\n\n邮差'
            })
        ];
        for (const l of list) {
            if (l && l.id === 'mb-welcome') l.createdAt = new Date(now - 72 * 3600000).toISOString();
        }
        db.mailboxLetters = demos.concat(list);
        persist();
        try { localStorage.setItem(DEMO_KEY, '1'); } catch (e) { /* 存储不可用 */ }
        return true;
    }

    /* ===== 信封贴纸 ===== */
    const stampArt = [
        { name: '铃兰', palette: 0, svg: '<path d="M17 41c3-9 5-18 4-29M20 35C8 35 8 27 8 25c8 1 12 5 12 10M20 31c9-1 12-7 12-11-7 1-11 5-12 11"/><path class="postage-petal" d="M21 13c-6-5-12 0-10 5l-2 3q5 4 9 0l-2-3c0-2 2-4 5-5M22 20c6-3 10 1 8 5l2 3q-5 3-9-1l2-2c1-2-1-4-3-5M20 27c-5-3-10 0-9 4l-2 3q5 4 9 0l-2-3q1-3 4-4"/>' },
        { name: '郁金香', palette: 3, svg: '<path d="M20 40V25M20 37Q8 34 9 28q9 1 11 9M20 40q11-3 12-12-9 2-12 12"/><path class="postage-fill" d="M11 13l5 4 4-7 4 7 5-4v9q0 9-9 9t-9-9Z"/><path d="M20 17v13" class="postage-detail"/>' },
        { name: '蝴蝶', palette: 4, svg: '<path class="postage-fill" d="M20 25C6 8 5 17 7 25q1 6 11 3-9 2-7 9 3 6 9-7 6 13 9 7 2-7-7-9 10 3 11-3 2-8-13 0Z"/><path d="M20 20v14M20 21q-5-9-7-5M20 21q5-9 7-5M9 22l7 3M31 22l-7 3M14 34l3-4M26 34l-3-4"/>' },
        { name: '月与星', palette: 1, svg: '<path class="postage-fill" d="M24 12a13 13 0 1 0 7 23A12 12 0 0 1 24 12Z"/><path class="postage-solid" d="m29 13 1.2 3.4 3.5 1.1-3.5 1.2-1.2 3.4-1.2-3.4-3.4-1.2 3.4-1.1Z"/><circle cx="32" cy="28" r=".9"/><circle cx="11" cy="12" r=".7"/>' },
        { name: '山间日出', palette: 1, svg: '<circle class="postage-fill" cx="26" cy="17" r="5"/><path class="postage-wash" d="m6 33 11-16 10 16Z"/><path class="postage-fill" d="m15 35 12-13 8 13Z"/><path d="m12 25 5-8 5 8-5-3ZM6 39h28M10 42h20"/>' },
        { name: '天鹅湖', palette: 5, svg: '<path class="postage-petal" d="M9 30q10 0 13-4c5-6-5-7-4-13q1-5 5-3 5 2-1 10-2 4 4 7l7 1q-3 11-14 11-8 0-10-9Z"/><path d="m23 13 4 1-4 2M15 31q5 6 12-1M8 42h11M23 42h9"/><circle class="postage-solid" cx="22" cy="12.5" r=".7"/>' },
        { name: '小猫', palette: 6, svg: '<path class="postage-fill" d="M12 25V14l6 4q3-1 6 0l5-4v11q-1 5-5 6 6 4 5 10H13q-2-8 3-10-4-2-4-6Z"/><path d="M27 39q9 0 5-8M16 24h1M24 24h1m-7 4 2 1 2-1"/><path class="postage-detail" d="m10 10 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>' },
        { name: '雏菊', palette: 2, svg: '<path d="M20 41V26M20 37q-9-1-10-7 8 0 10 7M20 40q8-1 10-8-9 1-10 8"/><path class="postage-petal" d="M17 16c-8-8-12 2-4 5-10 1-6 11 2 6-4 10 7 12 7 2 5 9 13 2 5-4 11 1 10-10 0-7 6-9-4-14-7-4 0-11-11-8-7 2Z"/><circle class="postage-fill" cx="20" cy="22" r="4"/>' },
        { name: '蝴蝶结', palette: 3, svg: '<path class="postage-fill" d="M19 23C3 7 3 31 18 27l-6 13 8-4 7 5-5-14c15 4 15-20-1-4Z"/><path d="m10 19 9 5-9 2M30 19l-9 5 9 2M19 27l-3 7M22 27l3 8"/><ellipse class="postage-petal" cx="20" cy="25" rx="2.7" ry="3.4"/>' },
        { name: '橄榄枝', palette: 0, svg: '<path d="M13 42q12-16 12-32"/><path class="postage-fill" d="M24 15q-8 0-8-7 8 0 8 7M24 21q9-1 10-8-8 0-10 8M21 26q-10 1-11-7 9-1 11 7M19 32q9 2 13-5-8-3-13 5M16 36q-10 0-10-7 8 0 10 7"/>' },
        { name: '贝壳', palette: 2, svg: '<path class="postage-fill" d="M17 37C7 34 4 27 7 22q2-4 6-3 0-8 7-8t7 8q4-1 6 3 3 5-10 15l-3-1Z"/><path d="m10 24 9 12M15 18l5 18M20 14v22M25 18l-4 18M30 24l-8 12M16 39h8"/>' },
        { name: '纸鹤', palette: 5, svg: '<path class="postage-wash" d="m6 15 14 9 10-10-4 16 9 3-13 2-12-4 7-5Z"/><path d="m6 15 14 9 10-10-4 16 9 3-13 2-12-4 7-5ZM10 31l10-7 2 11M20 24l6 6M26 30l-4 5"/><path class="postage-detail" d="M10 39h10M24 40h5"/>' }
    ];
    const palettes = [['#c7d0bc', '#596a51'], ['#c6d3dd', '#536c82'], ['#e5d6b7', '#8b7349'], ['#e1c3c5', '#98676e'], ['#d5cadd', '#7d698a'], ['#c5d6ce', '#57776b'], ['#e4cdbb', '#926e57']];

    function letterHtml(letter) {
        const date = new Date(letter.createdAt);
        const valid = Number.isFinite(date.getTime());
        const dateText = valid ? `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '—';
        let seed = 2166136261;
        for (const ch of String(letter.id)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
        const art = seed % stampArt.length;
        const design = stampArt[art];
        const color = palettes[design.palette];
        const shape = ['rectangle', 'arch', 'oval', 'ticket'][(seed >>> 9) % 4];
        const tilt = [-3, 1.5, -1, 3][(seed >>> 12) % 4];
        const hand = [-1.7, 1.2, -.6, 2.1][(seed >>> 15) % 4];
        const locked = !isUnlocked(letter);
        const lock = locked
            ? `<span class="envelope-lock"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2 M8 10v1.5"/></svg><span>${esc(lockMessage(letter))}</span></span>`
            : '';
        const unread = isUnread(letter);
        const clip = unread
            ? '<span class="envelope-unread-clip" data-unread-marker title="未读"><svg viewBox="0 0 24 44" aria-hidden="true"><path class="paperclip-shadow" d="M8 14v17a4 4 0 0 0 8 0V8a6 6 0 0 0-12 0v24a8 8 0 0 0 16 0V12"/><path class="paperclip-metal" d="M8 14v17a4 4 0 0 0 8 0V8a6 6 0 0 0-12 0v24a8 8 0 0 0 16 0V12"/><path class="paperclip-light" d="M8 14v17a4 4 0 0 0 8 0V8a6 6 0 0 0-12 0v24a8 8 0 0 0 16 0V12"/></svg></span>'
            : '';
        const label = `${dateText}的信，${locked ? lockMessage(letter) : '可以阅读'}${unread ? '，未读' : ''}`;
        return `<div class="mail-slot"><button type="button" class="mail-envelope" data-id="${esc(letter.id)}" data-direction="${letter.from === 'self' ? 'sent' : 'received'}" aria-label="${esc(label)}" aria-haspopup="dialog" style="--mail-tilt:${hand}deg"><span class="envelope-volume" aria-hidden="true"><span class="envelope-edge"></span><span class="envelope-edge envelope-edge-side"></span><span class="envelope-face envelope-front"><span class="envelope-bulge"></span>${clip}<span class="envelope-postage" data-shape="${shape}" data-art="${art}" title="${design.name}贴纸" style="--postage-bg:${color[0]};--postage-ink:${color[1]};--postage-tilt:${tilt}deg"><svg viewBox="0 0 40 52" aria-hidden="true">${design.svg}</svg></span><time class="envelope-date"${valid ? ` datetime="${esc(letter.createdAt)}"` : ''}>${dateText}</time>${lock}</span><span class="envelope-face envelope-back"><svg class="envelope-fold" viewBox="0 0 600 324" preserveAspectRatio="none"><path d="M2 322 206 126 M598 322 394 126" stroke-opacity=".42"/><path d="M2 4 280 172Q300 185 320 172L598 4" stroke-opacity=".58"/><path d="M4 2H596L320 166Q300 178 280 166Z" fill="#eeece1" stroke-opacity=".12"/><path d="M322 188 548 50" stroke-opacity=".14"/><path d="M336 204 516 96" stroke-opacity=".08"/></svg><span class="envelope-back-seal"></span><span class="envelope-sender"><small>From</small><span class="envelope-sender-name">${esc(person(letter, 'from'))}</span></span></span></span></button></div>`;
    }

    const emptyHtml = (text) => `<div class="mailbox-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 13h36v24H6Z M6 13l18 15 18-15 M6 37l12-13 M42 37 30 24"/></svg><p>${esc(text)}</p></div>`;

    /* ===== 外壳 ===== */
    function shellHtml() {
        const icons = {
            back: 'M15 6l-6 6 6 6',
            settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
            flip: 'M4 7h16l-4-4 M20 17H4l4 4 M20 7l-4 4 M4 17l4-4',
            plus: 'M12 5v14 M5 12h14',
            close: 'M6 6l12 12 M18 6 6 18',
            write: 'M4 20l5-1L21 7l-5-5L4 14z M15 4l5 5',
            spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z M19 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z',
            trash: 'M4 7h16 M9 7V4h6v3 M7 7l1 14h8l1-14',
            auto: 'M8 5v14l11-7z',
            check: 'M4 5h16v15H4z M8 12l3 3 5-6'
        };
        const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
        return `
        <header class="mb-topbar">
            <div class="mb-topbar-left">
                <button type="button" class="back-btn mb-back" data-target="home-screen" aria-label="返回主屏幕">${svg('back')}</button>
            </div>
            <button type="button" class="mb-settings" id="mb-settings" aria-label="信箱设置">${svg('settings')}</button>
        </header>
        <main class="mb-page">
            <header class="mailbox-heading">
                <div class="mailbox-folder-control">
                    <h1><span id="mailboxTitle">Inbox</span><small id="mailboxCount" aria-live="polite">00</small></h1>
                    <button type="button" class="mailbox-folder-toggle" id="mailboxFolderButton" aria-haspopup="menu" aria-expanded="false" aria-controls="mailboxFolderMenu" aria-label="切换信箱">${svg('flip')}</button>
                    <div class="mailbox-folder-menu" id="mailboxFolderMenu" role="menu" aria-label="切换信箱" hidden>
                        <button type="button" data-folder="received" role="menuitemradio" aria-checked="true">Inbox<small>00</small></button>
                        <button type="button" data-folder="sent" role="menuitemradio" aria-checked="false">Sent<small>00</small></button>
                        <button type="button" data-folder="unread" role="menuitemradio" aria-checked="false">Unread<small>00</small></button>
                    </div>
                </div>
                <div class="mailbox-tools-control">
                    <button type="button" class="mailbox-write" id="openWrite" aria-label="信箱选项" title="信箱选项" aria-haspopup="menu" aria-expanded="false" aria-controls="mailboxToolsMenu">${svg('plus')}</button>
                    <div class="mailbox-folder-menu mailbox-tools-menu" id="mailboxToolsMenu" role="menu" aria-label="信箱选项" hidden>
                        <button type="button" role="menuitem" data-mail-tool="write">${svg('write')}<span>写一封信</span></button>
                        <button type="button" role="menuitem" data-mail-tool="ai">${svg('spark')}<span>让 TA 写信</span></button>
                        <button type="button" role="menuitem" data-mail-tool="trash">${svg('trash')}<span>最近删除</span></button>
                        <button type="button" role="menuitemcheckbox" data-mail-tool="auto" aria-checked="true">${svg('auto')}<span>自动滚动</span><span class="mailbox-auto-switch" aria-hidden="true"></span></button>
                        <button type="button" role="menuitem" data-mail-tool="check">${svg('check')}<span>选择信件</span></button>
                    </div>
                </div>
            </header>
            <div class="mailbox-selection-bar" id="mb-select-bar" hidden>
                <span class="mailbox-selection-count" id="mb-select-count" role="status">已选 0 封</span>
                <button type="button" data-select-all>全选</button>
                <button type="button" data-select-delete disabled>删除</button>
                <button type="button" data-select-exit aria-label="退出多选">${svg('close')}</button>
            </div>
            <section class="mailbox-tray" aria-label="信封收藏盒">
                <div class="mailbox-scroller" id="mailboxScroller">
                    <div class="letter-list" id="receivedList" aria-label="收到的信"></div>
                    <div class="letter-list" id="sentList" aria-label="寄出的信" hidden></div>
                    <div class="letter-list" id="unreadList" aria-label="未读的信" hidden></div>
                </div>
            </section>
        </main>

        <div class="mb-modal-overlay" id="mb-write-modal">
            <div class="mb-modal" role="dialog" aria-modal="true" aria-labelledby="mb-write-title">
                <header class="mb-modal-header">
                    <span class="mb-modal-title" id="mb-write-title">Write a Letter</span>
                    <button type="button" class="mb-modal-close" id="mb-close-write" aria-label="关闭写信">✕</button>
                </header>
                <div class="mb-address-row">
                    <label class="mb-field"><span>寄件人</span><select class="mb-input" id="mb-letter-from"></select></label>
                    <label class="mb-field"><span>收件人</span><select class="mb-input" id="mb-letter-to"></select></label>
                </div>
                <p class="mb-note" id="mb-roles-note" hidden></p>
                <div class="mb-ai-row" id="mb-ai-row" hidden>
                    <input class="mb-input" id="mb-ai-topic" placeholder="想让 TA 写点什么（可不填）">
                    <button type="button" class="mb-btn mb-btn-ai" id="mb-ai-go">让 TA 写</button>
                </div>
                <label class="mb-field mb-block"><span>正文</span><textarea class="mb-paper-input" id="mb-letter-content" placeholder="把想说的话写在这里…"></textarea></label>
                <div class="mb-lock-block">
                    <div class="mb-field-label">解封条件（可不填）</div>
                    <p class="mb-note" id="mb-existing-lock" hidden></p>
                    <div class="mb-lock-row">
                        <input class="mb-input" id="mb-lock-days" type="number" min="0" step="1" inputmode="numeric" aria-label="解封天数" placeholder="天">
                        <input class="mb-input" id="mb-lock-hours" type="number" min="0" step="1" inputmode="numeric" aria-label="解封小时" placeholder="时">
                        <input class="mb-input" id="mb-lock-minutes" type="number" min="0" step="1" inputmode="numeric" aria-label="解封分钟" placeholder="分">
                    </div>
                    <input class="mb-input mb-lock-password" id="mb-letter-password" type="password" placeholder="密码锁，可不填">
                    <label class="mb-switch" id="mb-remove-lock-row" hidden><span>移除原有解封条件</span><input type="checkbox" id="mb-remove-locks"></label>
                </div>
                <div class="mb-modal-btns">
                    <button type="button" class="mb-btn" id="mb-btn-cancel">取消</button>
                    <button type="button" class="mb-btn mb-btn-danger" id="mb-btn-del" hidden>删除</button>
                    <button type="button" class="mb-btn mb-btn-primary" id="mb-btn-save">保存</button>
                </div>
            </div>
        </div>

        <div class="mb-modal-overlay" id="mb-reply-modal">
            <div class="mb-modal" role="dialog" aria-modal="true" aria-labelledby="mb-reply-title">
                <header class="mb-modal-header">
                    <span class="mb-modal-title" id="mb-reply-title">写回信</span>
                    <button type="button" class="mb-modal-close" id="mb-close-reply" aria-label="关闭回信">✕</button>
                </header>
                <textarea class="mb-paper-input mb-reply-input" id="mb-reply-content" placeholder="写下你的回信…"></textarea>
                <div class="mb-modal-btns">
                    <button type="button" class="mb-btn" id="mb-reply-cancel">取消</button>
                    <button type="button" class="mb-btn mb-btn-primary" id="mb-reply-send">寄出回信</button>
                </div>
            </div>
        </div>

        <div class="mb-modal-overlay" id="mb-settings-modal">
            <div class="mb-modal" role="dialog" aria-modal="true" aria-labelledby="mb-settings-title">
                <header class="mb-modal-header">
                    <span class="mb-modal-title" id="mb-settings-title">Settings</span>
                    <button type="button" class="mb-modal-close" id="mb-close-settings" aria-label="关闭设置">✕</button>
                </header>
                <label class="mb-field mb-block"><span>外观</span>
                    <select class="mb-input" id="mb-theme">
                        <option value="system">跟随系统</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </label>
                <label class="mb-field mb-block"><span>信纸正文字体</span>
                    <select class="mb-input" id="mb-paper-font">
                        <option value="default">跟随正文默认字体</option>
                        <option value="serif">Serif</option>
                        <option value="handwriting">Handwriting / 楷体</option>
                        <option value="mono">Monospace</option>
                    </select>
                </label>
                <div class="mb-role-fonts">
                    <div class="mb-role-fonts-head">
                        <span>角色信件字体</span>
                        <button type="button" class="mb-font-upload" id="mb-font-upload">上传字体文件</button>
                    </div>
                    <div class="mb-role-font-list" id="mb-role-font-list"></div>
                    <input type="file" id="mb-font-file" accept=".ttf,.woff,.woff2,.otf,font/ttf,font/woff,font/woff2,font/otf" hidden>
                </div>
                <p class="mb-note">信件只保存在这台设备里。密码锁是本地锁，不用于保护真正机密的信息。</p>
            </div>
        </div>

        <section class="mailbox-trash-overlay" id="mb-trash" hidden>
            <div class="mailbox-trash-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-trash-title">
                <header>
                    <h2 id="mb-trash-title">Recently Deleted</h2>
                    <button type="button" class="mailbox-trash-close" aria-label="关闭最近删除">${svg('close')}</button>
                </header>
                <p class="mailbox-trash-note">删除的信件保留 7 天，到期自动清理</p>
                <div class="mailbox-trash-list"></div>
                <p class="mailbox-trash-status" role="status"></p>
            </div>
        </section>

        <div class="mb-toast" id="mb-toast"></div>`;
    }

    /* ===== 顶部提示 ===== */
    let toastTimer = 0;
    function toast(message) {
        const el = $('mb-toast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    /* ===== 信封堆叠 ===== */
    const smooth = (value) => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
    };

    function drawTilt() {
        view.tiltFrame = 0;
        const scroller = $('mailboxScroller');
        if (!scroller) return;
        const focus = Number(scroller.dataset.focus) || 0;
        const scroll = scroller.scrollTop;
        const distances = view.items.map((item) => (item.top + item.height / 2 - scroll - focus) / item.step);
        for (let index = 0; index < view.items.length; index += 1) {
            const item = view.items[index];
            const distance = distances[index];
            const angle = reduced.matches ? 0 : distance > .13 ? 55 * smooth((distance - .13) / 1.25) : distance < -.13 ? -166 * smooth((-distance - .13) / 1.55) : 0;
            const closeness = Math.max(0, 1 - Math.abs(distance) / 1.6);
            const openingShift = -(focus - item.height / 2 - 24) * (1 - smooth(scroll / item.step));
            const packedShift = distance > 1.25 ? (1.25 + (distance - 1.25) * .45 - distance) * item.step : 0;
            const shift = openingShift + packedShift;
            const depth = reduced.matches ? 0 : closeness * 14 - Math.min(95, Math.abs(distance) * 18);
            const facing = reduced.matches ? 1 : Math.max(0, Math.cos(angle * Math.PI / 180));
            const light = Math.max(0, Math.min(.24, (facing - .42) * .42));
            const shade = Math.min(.34, (1 - facing) * .25 + Math.min(.07, Math.abs(angle) / 1800));
            const occlusion = index === 0 || reduced.matches ? 0 : Math.min(.34, .13 + .2 * smooth(Math.max(0, distance) / 1.1));
            const parallax = reduced.matches ? 0 : Math.sin(angle * Math.PI / 180) * 2.4;
            const signature = `${angle.toFixed(2)}:${shift.toFixed(1)}:${depth.toFixed(1)}:${light.toFixed(2)}:${shade.toFixed(2)}:${occlusion.toFixed(2)}`;
            if (item.signature === signature) continue;
            item.signature = signature;
            item.button.style.setProperty('--mail-angle', angle.toFixed(2) + 'deg');
            item.button.style.setProperty('--mail-lift', depth.toFixed(1) + 'px');
            item.button.style.setProperty('--mail-shift', reduced.matches ? '0px' : shift.toFixed(1) + 'px');
            item.button.style.setProperty('--mail-shade', shade.toFixed(3));
            item.button.style.setProperty('--mail-light', light.toFixed(3));
            item.button.style.setProperty('--mail-occlusion', occlusion.toFixed(3));
            item.button.style.setProperty('--mail-parallax', parallax.toFixed(2) + 'px');
            item.slot.style.setProperty('--mail-layer', String(10 + Math.round(90 / (1 + Math.abs(distance)))));
            item.button.dataset.face = Math.abs(angle) > 90 ? 'back' : 'front';
        }
    }

    function queueTilt() {
        if (!view.tiltFrame) view.tiltFrame = requestAnimationFrame(drawTilt);
    }

    function measureTilt() {
        const scroller = $('mailboxScroller');
        if (!scroller) return;
        const list = $(view.folder + 'List');
        if (!list) return;
        const first = list.querySelector('.mail-envelope');
        const height = (first && first.offsetHeight) || 160;
        const step = (first && first.parentElement && first.parentElement.offsetHeight) || 110;
        const focus = Math.max(height / 2 + 20, scroller.clientHeight * .35);
        scroller.dataset.focus = String(focus);
        scroller.style.setProperty('--mail-start-space', Math.max(20, focus - height / 2) + 'px');
        scroller.style.setProperty('--mail-end-space', Math.max(24, scroller.clientHeight - focus + height / 2 - step) + 'px');
        view.items = [...list.querySelectorAll('.mail-slot')].map((slot) => {
            const button = slot.querySelector('.mail-envelope');
            return {
                slot,
                button,
                top: list.offsetTop + slot.offsetTop,
                height: button.offsetHeight,
                step: slot.offsetHeight,
                signature: ''
            };
        });
        queueTilt();
    }

    /* ===== 渲染 ===== */
    function renderLists(keepScroll) {
        const scroller = $('mailboxScroller');
        const scrollTop = keepScroll && scroller ? scroller.scrollTop : 0;
        const all = letters().filter((l) => l && !l.hidden);
        const sorted = all.slice().sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
        const buckets = {
            received: sorted.filter(incoming),
            sent: sorted.filter((l) => l.from === 'self'),
            unread: sorted.filter(isUnread)
        };
        const emptyText = { received: '还没有收到的信', sent: '还没有寄出的信', unread: '收到的信都读过了' };
        for (const name of Object.keys(FOLDERS)) {
            const list = $(name + 'List');
            if (!list) continue;
            list.innerHTML = buckets[name].length ? buckets[name].map(letterHtml).join('') : emptyHtml(emptyText[name]);
            list.hidden = name !== view.folder;
            const option = $('mailboxFolderMenu') && $('mailboxFolderMenu').querySelector(`[data-folder="${name}"]`);
            if (option) {
                option.querySelector('small').textContent = String(buckets[name].length).padStart(2, '0');
                option.setAttribute('aria-checked', String(name === view.folder));
            }
        }
        const title = $('mailboxTitle');
        const count = $('mailboxCount');
        if (title) title.textContent = FOLDERS[view.folder].title;
        if (count) count.textContent = String(buckets[view.folder].length).padStart(2, '0');
        const folderBtn = $('mailboxFolderButton');
        if (folderBtn) folderBtn.setAttribute('aria-label', '切换信箱，当前' + FOLDERS[view.folder].label);
        measureTilt();
        if (scroller) {
            const target = keepScroll ? scrollTop : (view.positions.get(view.folder) || 0);
            scroller.scrollTop = target;
            view.positions.set(view.folder, target);
        }
        updateSelection();
    }

    function refresh(keepScroll) {
        loadRoles();
        normalizeLetters();
        renderLists(keepScroll !== false);
    }

    function revealLetter(id) {
        const scroller = $('mailboxScroller');
        if (!scroller) return;
        measureTilt();
        const item = view.items.find((entry) => entry.button && entry.button.dataset.id === String(id));
        if (!item) return;
        const focus = Number(scroller.dataset.focus) || 0;
        const top = Math.max(0, item.top + item.height / 2 - focus);
        scroller.scrollTo({ top, behavior: reduced.matches ? 'auto' : 'smooth' });
        view.positions.set(view.folder, top);
        item.slot.classList.add('is-fresh');
        setTimeout(() => item.slot.classList.remove('is-fresh'), 3000);
    }

    function selectFolder(name) {
        if (!FOLDERS[name] || name === view.folder) {
            closePopover();
            return;
        }
        const scroller = $('mailboxScroller');
        if (scroller) view.positions.set(view.folder, scroller.scrollTop);
        view.folder = name;
        if (view.selecting) selection(false);
        closePopover();
        renderLists(false);
        pauseAuto();
    }

    /* ===== 弹层（文件夹 / 工具菜单） ===== */
    let openedPopover = null;
    const popoverVersions = new WeakMap();

    function setPopover(menu, button, open) {
        if (!menu || !button) return;
        if (button.getAttribute('aria-expanded') === String(open)) return;
        if (open && openedPopover && openedPopover.menu !== menu) setPopover(openedPopover.menu, openedPopover.button, false);
        const wasHidden = menu.hidden;
        const style = getComputedStyle(menu);
        const current = { opacity: style.opacity, transform: style.transform };
        const version = (popoverVersions.get(menu) || 0) + 1;
        popoverVersions.set(menu, version);
        menu.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        button.setAttribute('aria-expanded', String(open));
        menu.inert = !open;
        if (open) {
            openedPopover = { menu, button };
            menu.hidden = false;
        } else if (openedPopover && openedPopover.menu === menu) {
            openedPopover = null;
        }
        if (reduced.matches) {
            menu.hidden = !open;
            return;
        }
        const animation = menu.animate(
            open
                ? [wasHidden ? { opacity: 0, transform: 'translateY(-9px) scale(.88)' } : current, { opacity: 1, transform: 'translateY(0) scale(1)' }]
                : [current, { opacity: 0, transform: 'translateY(-6px) scale(.94)' }],
            { duration: open ? 260 : 160, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
        if (open) [...menu.children].forEach((item, index) => item.animate([{ transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }], { duration: 200, delay: index * 30, easing: 'ease-out', fill: 'backwards' }));
        animation.finished.then(() => {
            if (popoverVersions.get(menu) === version && !open) menu.hidden = true;
        }).catch(() => {});
    }

    function closePopover() {
        if (openedPopover) {
            const { menu, button } = openedPopover;
            setPopover(menu, button, false);
        }
    }

    /* ===== 选择 ===== */
    function updateSelection() {
        const available = new Set(letters().filter((l) => l && !l.hidden).map((l) => String(l.id)));
        view.selected = new Set([...view.selected].filter((id) => available.has(id)));
        const root = screenEl();
        const bar = $('mb-select-bar');
        const scroller = $('mailboxScroller');
        if (root) root.classList.toggle('mailbox-selecting', view.selecting);
        if (bar) {
            bar.hidden = !view.selecting;
            $('mb-select-count').textContent = `已选 ${view.selected.size} 封`;
            bar.querySelector('[data-select-delete]').disabled = !view.selected.size;
        }
        if (!scroller) return;
        scroller.querySelectorAll('.mail-envelope').forEach((envelope) => {
            const chosen = view.selected.has(envelope.dataset.id);
            if (view.selecting) {
                envelope.setAttribute('aria-pressed', String(chosen));
                envelope.classList.toggle('is-selected', chosen);
                envelope.querySelectorAll('.envelope-front,.envelope-back').forEach((face) => {
                    if (!face.querySelector('.mailbox-select-mark')) face.insertAdjacentHTML('beforeend', '<span class="mailbox-select-mark" aria-hidden="true"></span>');
                });
            } else {
                envelope.removeAttribute('aria-pressed');
                envelope.classList.remove('is-selected');
                envelope.querySelectorAll('.mailbox-select-mark').forEach((mark) => mark.remove());
            }
        });
    }

    function selection(value) {
        view.selecting = value;
        view.selected.clear();
        updateSelection();
    }

    /* ===== 自动滚动 ===== */
    function screenActive() {
        const root = screenEl();
        return !!root && root.classList.contains('active');
    }

    function autoBlocked() {
        return view.selecting || !$('mb-trash').hidden || !!document.querySelector('#mailbox-screen .mb-modal-overlay.open') || !!document.querySelector('#mailbox-screen .letter-reader-v2:not([hidden])') || ($('openWrite') && $('openWrite').getAttribute('aria-expanded') === 'true') || ($('mailboxFolderButton') && $('mailboxFolderButton').getAttribute('aria-expanded') === 'true');
    }

    function autoTick(now) {
        view.autoFrame = 0;
        if (!view.auto || !screenActive()) return;
        const scroller = $('mailboxScroller');
        const dt = Math.min(40, now - (view.autoLast || now));
        view.autoLast = now;
        if (scroller && !document.hidden && !autoBlocked() && now > view.pauseUntil) {
            const max = scroller.scrollHeight - scroller.clientHeight;
            if (max > 2) {
                view.autoPos = Math.max(0, Math.min(max, (view.autoPos == null ? scroller.scrollTop : view.autoPos) + view.autoDirection * dt * .078));
                scroller.scrollTop = view.autoPos;
                if ((view.autoDirection > 0 && view.autoPos >= max) || (view.autoDirection < 0 && view.autoPos <= 0)) {
                    view.autoDirection *= -1;
                    view.pauseUntil = now + 850;
                }
            }
        } else {
            view.autoPos = null;
        }
        view.autoFrame = requestAnimationFrame(autoTick);
    }

    function setAuto(value) {
        view.auto = value;
        const scroller = $('mailboxScroller');
        if (scroller) scroller.classList.toggle('mailbox-auto-scroll', value);
        const item = $('mailboxToolsMenu') && $('mailboxToolsMenu').querySelector('[data-mail-tool="auto"]');
        if (item) item.setAttribute('aria-checked', String(value));
        if (value) {
            view.pauseUntil = 0;
            view.autoPos = scroller ? scroller.scrollTop : 0;
            pauseAuto();
            startAuto();
        } else if (view.autoFrame) {
            cancelAnimationFrame(view.autoFrame);
            view.autoFrame = 0;
        }
    }

    function startAuto() {
        if (view.auto && !view.autoFrame && screenActive()) {
            view.autoLast = 0;
            view.autoFrame = requestAnimationFrame(autoTick);
        }
    }

    function pauseAuto() {
        view.pauseUntil = performance.now() + 3500;
        view.autoPos = null;
    }

    /* ===== 写信 / AI ===== */
    async function llmChat(systemPrompt, userPrompt) {
        const api = window.db && db.apiSettings;
        if (!api || !api.url || !api.key || !api.model) throw new Error('请先在 API 设置里配置好 API');
        let headers;
        let endpoint;
        let body;
        if (api.provider === 'gemini') {
            endpoint = api.url.replace(/\/$/, '') + '/v1beta/models/' + api.model + ':generateContent?key=' + encodeURIComponent(api.key);
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                system_instruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.95 }
            });
        } else {
            endpoint = api.url.replace(/\/$/, '') + '/v1/chat/completions';
            headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key };
            body = JSON.stringify({
                model: api.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.95
            });
        }
        const resp = await fetch(endpoint, { method: 'POST', headers, body });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error('API 错误 ' + resp.status + ' ' + errText.slice(0, 120));
        }
        const data = await resp.json();
        if (api.provider === 'gemini') {
            const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
            return (parts && parts.map((p) => p.text || '').join('')) || '';
        }
        return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    }

    function recentChat(role) {
        const history = (role.raw && role.raw.history) || [];
        return history
            .filter((m) => m && m.content && !m.isThinking && !m.isSystem)
            .slice(-10)
            .map((m) => {
                const text = String(m.content).replace(/\s+/g, ' ').slice(0, 180);
                return (m.role === 'assistant' ? role.name : '你') + '：' + text;
            })
            .join('\n');
    }

    function letterSystemPrompt(role) {
        const lines = [
            `你是「${role.name}」——住在这部手机里的一个角色，平时和「你」在聊天里来往，有自己的说话口吻和习惯。`,
            role.persona ? `你的角色设定：${String(role.persona).slice(0, 800)}` : '',
            '现在你想给「你」写一封纸信。像真的坐下来写信那样，用你平时的口吻，写具体的小事和此刻的心情。',
            '要求：180~450字；第一人称；可以提到最近聊天里发生的事；不要客套的标题、署名的落款和日期；不要使用 markdown 或代码块；直接输出信的正文。'
        ];
        const chat = recentChat(role);
        if (chat) lines.push('', '你们最近的聊天片段：', chat);
        return lines.filter(Boolean).join('\n');
    }

    function syncAiRow() {
        const from = $('mb-letter-from');
        const to = $('mb-letter-to');
        const row = $('mb-ai-row');
        if (!from || !to || !row) return;
        row.hidden = from.value === 'self' || to.value !== 'self' || !roleById(from.value);
    }

    function openAiWrite() {
        if (!view.roles.length) {
            toast('还没有角色，先去聊天里创建一个');
            return;
        }
        const role = view.roles.slice().sort((a, b) => ((b.raw.history || []).length) - ((a.raw.history || []).length))[0];
        openWrite(null, { from: role.id, to: 'self', focusTopic: true });
    }

    function openWrite(letter, preset) {
        preset = preset || {};
        loadRoles();
        view.editing = letter || null;
        const fromSel = $('mb-letter-from');
        const toSel = $('mb-letter-to');
        if (!fromSel || !toSel) return;

        const options = '<option value="self">你</option>' + view.roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
        fromSel.innerHTML = options;
        toSel.innerHTML = options;

        if (letter) {
            fromSel.value = letter.from === 'self' ? 'self' : String(letter.fromRoleId || 'self');
            toSel.value = letter.to === 'self' ? 'self' : String(letter.toRoleId || 'self');
            fromSel.disabled = true;
            $('mb-letter-content').value = letter.content || '';
        } else {
            fromSel.disabled = false;
            $('mb-letter-content').value = '';
            fromSel.value = preset.from || 'self';
            toSel.value = preset.to || (view.roles[0] ? view.roles[0].id : 'self');
        }
        if (fromSel.value === toSel.value) {
            const alt = view.roles.find((r) => r.id !== fromSel.value);
            toSel.value = fromSel.value === 'self' ? (alt ? alt.id : 'self') : 'self';
        }

        $('mb-write-title').textContent = letter ? 'Edit Letter' : 'Write a Letter';
        $('mb-btn-del').hidden = !letter;
        $('mb-roles-note').hidden = !!letter || view.roles.length > 0;
        $('mb-roles-note').textContent = view.roles.length ? '' : '还没有角色，先去聊天里创建一个，再回来写信。';

        for (const id of ['mb-lock-days', 'mb-lock-hours', 'mb-lock-minutes', 'mb-letter-password', 'mb-ai-topic']) $(id).value = '';
        $('mb-remove-lock-row').hidden = !letter;
        $('mb-remove-locks').checked = false;
        $('mb-letter-password').placeholder = letter && hasPassword(letter) ? '留空保留原密码' : '密码锁，可不填';
        $('mb-existing-lock').hidden = !letter || (!letter.unlockAt && !hasPassword(letter));
        $('mb-existing-lock').textContent = letter ? '保留原有解封条件；填写新的时间或密码可替换。' + (letter.unlockAt ? ' ' + fmt(letter.unlockAt) : '') : '';

        syncAiRow();
        $('mb-write-modal').classList.add('open');
        if (preset.focusTopic && !$('mb-ai-row').hidden) setTimeout(() => $('mb-ai-topic').focus(), 120);
        else setTimeout(() => $('mb-letter-content').focus({ preventScroll: true }), 120);
    }

    async function aiGenerate() {
        const from = $('mb-letter-from').value;
        const to = $('mb-letter-to').value;
        if (from === 'self' || to !== 'self') {
            toast('把寄件人选成角色、收件人选成你，才能让 TA 写');
            return;
        }
        const role = roleById(from);
        if (!role) return;
        const button = $('mb-ai-go');
        const old = button.textContent;
        button.disabled = true;
        button.textContent = '写中…';
        try {
            const topic = $('mb-ai-topic').value.trim();
            const user = '现在是 ' + dateLabel() + '。' + (topic ? `这封信想聊聊「${topic}」。` : '写一封此刻最想写给「你」的信。') + '直接输出信的正文。';
            const text = (await llmChat(letterSystemPrompt(role), user)).trim();
            if (!text) throw new Error('没写成，再试一次');
            $('mb-letter-content').value = text;
            toast('写好了，可以改一改再寄出');
        } catch (e) {
            toast((e && e.message) || '写信失败');
        } finally {
            button.disabled = false;
            button.textContent = old;
        }
    }

    async function saveLetter() {
        const fromVal = $('mb-letter-from').value;
        const toVal = $('mb-letter-to').value;
        const content = $('mb-letter-content').value.trim();
        if (!content) { toast('正文还没写'); return; }
        if (fromVal === toVal) { toast('寄件人和收件人不能是同一个人'); return; }

        const fromSelf = fromVal === 'self';
        const toSelf = toVal === 'self';
        let letter = view.editing;
        if (!letter) {
            letter = {
                id: 'mb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                createdAt: new Date().toISOString(),
                readAt: null,
                reply: null,
                allowReply: true,
                hidden: false,
                purgeAt: null
            };
        }
        letter.from = fromSelf ? 'self' : 'contact';
        letter.to = toSelf ? 'self' : 'contact';
        letter.fromRoleId = fromSelf ? 'self' : fromVal;
        letter.toRoleId = toSelf ? 'self' : toVal;
        letter.fromName = fromSelf ? '你' : roleName(fromVal);
        letter.toName = toSelf ? '你' : roleName(toVal);
        letter.content = content;

        const days = Math.max(0, Number($('mb-lock-days').value) || 0);
        const hours = Math.max(0, Number($('mb-lock-hours').value) || 0);
        const minutes = Math.max(0, Number($('mb-lock-minutes').value) || 0);
        const totalMinutes = days * 1440 + hours * 60 + minutes;
        const password = $('mb-letter-password').value.trim();

        if (!view.editing) {
            letter.unlockAt = totalMinutes > 0 ? new Date(Date.now() + Math.min(totalMinutes, 3650 * 1440) * 60000).toISOString() : null;
            letter.passwordHash = password ? await hash(password) : null;
            letter.isUnlocked = !letter.unlockAt && !letter.passwordHash;
            letters().unshift(letter);
        } else {
            if (totalMinutes > 0) {
                letter.unlockAt = new Date(Date.now() + Math.min(totalMinutes, 3650 * 1440) * 60000).toISOString();
                letter.isUnlocked = false;
            }
            if (password) {
                letter.passwordHash = await hash(password);
                letter.isUnlocked = false;
            }
            if ($('mb-remove-locks').checked) {
                letter.unlockAt = null;
                letter.passwordHash = null;
                letter.isUnlocked = true;
            }
        }

        const editing = !!view.editing;
        persist();
        closeModal('mb-write-modal');
        view.editing = null;
        const targetFolder = letter.to === 'self' ? 'received' : 'sent';
        if (view.folder !== targetFolder) {
            view.folder = targetFolder;
            renderLists(false);
        } else {
            refresh(true);
        }
        revealLetter(letter.id);
        toast(editing ? '已更新' : targetFolder === 'sent' ? '信已封好 · 已放进寄件箱' : '信已封好 · 已放进收件箱');
    }

    /* ===== 阅读 ===== */
    function markRead(letter) {
        if (!incoming(letter) || letter.readAt) return;
        letter.readAt = new Date().toISOString();
        persist();
        renderLists(true);
    }

    function readerModel(letter) {
        return {
            letter,
            envelopeHtml: letterHtml(letter),
            sender: person(letter, 'from'),
            recipient: person(letter, 'to'),
            date: fmt(letter.createdAt),
            replyDate: letter.reply ? fmt(letter.reply.createdAt) : '',
            locked: !isUnlocked(letter),
            hasPassword: hasPassword(letter),
            unlockAt: letter.unlockAt,
            canUnlock: hasPassword(letter) || !letter.unlockAt || new Date(letter.unlockAt).getTime() <= Date.now(),
            lockText: letter.unlockAt ? fmt(letter.unlockAt) + ' 解封。' + timeLeft(letter.unlockAt) + (hasPassword(letter) ? ' 也可以输入密码提前打开。' : '') : '输入密码后可以拆开这封信。',
            canEdit: letter.from === 'self',
            canReply: letter.to === 'self' && letter.allowReply && !letter.reply,
            onRead: async () => { markRead(letter); return !!letter.readAt; },
            onUnlock: async (password) => {
                const pwHash = await hash(String(password || '').trim());
                if (hasPassword(letter) && pwHash !== letter.passwordHash && !(letter.unlockAt && new Date(letter.unlockAt).getTime() <= Date.now())) {
                    throw new Error('密码不对，再想想');
                }
                if (!isUnlocked(letter) && !hasPassword(letter) && letter.unlockAt && new Date(letter.unlockAt).getTime() > Date.now()) {
                    throw new Error('还没到拆信时间');
                }
                letter.isUnlocked = true;
                persist();
                renderLists(true);
                return readerModel(letter);
            },
            onReply: () => { Reader.suspend(); openReply(letter); },
            onEdit: () => { if (letter.from !== 'self') return; Reader.close(true); openWrite(letter); },
            onDelete: () => removeLetter(letter)
        };
    }

    function openLetter(letter, source) {
        if (!letter || !Reader.ready) return;
        view.active = letter;
        Reader.open(readerModel(letter), source);
    }

    /* ===== 回信 ===== */
    let replyTarget = null;

    function openReply(letter) {
        replyTarget = letter;
        $('mb-reply-content').value = '';
        $('mb-reply-modal').classList.add('open');
    }

    function saveReply() {
        if (!replyTarget) return;
        const content = $('mb-reply-content').value.trim();
        if (!content) { toast('回信还没写'); return; }
        replyTarget.reply = { from: 'self', content, createdAt: new Date().toISOString() };
        persist();
        closeModal('mb-reply-modal');
        Reader.close(true);
        replyTarget = null;
        refresh(true);
        toast('回信已夹进信里');
    }

    /* ===== 删除 / 最近删除 ===== */
    function trashLetter(id) {
        const letter = letters().find((l) => String(l.id) === String(id));
        if (!letter) return;
        letter.hidden = true;
        letter.purgeAt = new Date(Date.now() + RETENTION_MS).toISOString();
        persist();
    }

    async function removeLetter(letter) {
        if (!letter) return;
        const commit = () => trashLetter(letter.id);
        const shredded = await Reader.shred(letter.id, commit);
        if (!shredded) await commit();
        view.active = null;
        refresh(true);
        if (Reader.isOpen()) Reader.close(true);
        toast('已移入最近删除');
    }

    function removeMany(ids) {
        const targets = [...new Set(ids.map(String))];
        targets.forEach(trashLetter);
        refresh(true);
        return targets;
    }

    function renderTrash() {
        const overlay = $('mb-trash');
        if (!overlay) return;
        const list = overlay.querySelector('.mailbox-trash-list');
        const rows = view.trashRows;
        list.innerHTML = rows.length ? rows.map((letter) => {
            const days = Math.max(1, Math.ceil((Date.parse(letter.purgeAt) - Date.now()) / 86400000));
            const date = new Date(letter.createdAt);
            const from = letter.from === 'self' ? '你' : person(letter, 'from');
            const to = letter.to === 'self' ? '你' : person(letter, 'to');
            const preview = isUnlocked(letter) ? (letter.content || '') : '尚未解封的信件';
            return `<article class="mailbox-trash-row"><div class="mailbox-trash-date"><b>${pad(date.getDate())}</b><span>${esc(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))}</span></div><div class="mailbox-trash-info"><strong>${esc(from)} → ${esc(to)}</strong><p>${esc(preview)}</p><small>剩余 ${days} 天</small></div><button type="button" data-restore="${esc(letter.id)}">恢复</button></article>`;
        }).join('') : '<div class="mailbox-trash-empty">最近没有删除的信件</div>';
    }

    function openTrash() {
        selection(false);
        const overlay = $('mb-trash');
        if (!overlay) return;
        view.trashRows = letters().filter((l) => l && l.hidden).sort((a, b) => Date.parse(b.purgeAt) - Date.parse(a.purgeAt));
        renderTrash();
        overlay.hidden = false;
        overlay.querySelector('.mailbox-trash-status').textContent = '';
        overlay.querySelector('.mailbox-trash-close').focus({ preventScroll: true });
        if (!reduced.matches) {
            overlay.querySelector('.mailbox-trash-sheet').animate(
                [{ transform: 'translateY(26px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
                { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }
            );
        }
    }

    function closeTrash() {
        const overlay = $('mb-trash');
        if (!overlay) return;
        overlay.hidden = true;
        const btn = $('openWrite');
        if (btn) btn.focus({ preventScroll: true });
    }

    function restoreLetter(id) {
        const letter = letters().find((l) => String(l.id) === String(id));
        if (!letter) return;
        letter.hidden = false;
        letter.purgeAt = null;
        letter.deletedAt = null;
        persist();
        view.trashRows = view.trashRows.filter((l) => String(l.id) !== String(id));
        renderTrash();
        $('mb-trash').querySelector('.mailbox-trash-status').textContent = '已恢复';
        refresh(true);
    }

    /* ===== 弹窗开关 ===== */
    function closeModal(id) {
        const el = $(id);
        if (el) el.classList.remove('open');
    }

    /* ===== 阅读器（移植自 whisper-mailbox reader） ===== */
    const Reader = (() => {
        const icons = {
            close: 'M6 6l12 12 M18 6 6 18',
            back: 'M15 6l-6 6 6 6',
            next: 'M9 6l6 6-6 6',
            flip: 'M4 7h16l-4-4 M20 17H4l4 4 M20 7l-4 4 M4 17l4-4',
            reply: 'M9 5 3 11l6 6 M3 11h10a7 7 0 0 1 7 7',
            edit: 'm15 4 5 5 M4 20l5-1L21 7l-5-5L4 14Z',
            remove: 'M4 7h16 M9 7V4h6v3 M7 7l1 14h8l1-14 M10 10v7 M14 10v7',
            lock: 'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3'
        };
        const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
        let root = null;
        let base;
        let content;
        let cards = [];
        let pageTemplate;
        let model = null;
        let pages = [];
        let order = [];
        let session = 0;
        let busy = false;
        let turn = null;
        let deckFrame = 0;
        let paperGesture = null;
        let envelopeGesture = null;
        let read = false;
        let priorFocus = null;
        let suspended = false;
        let resizeFrame = 0;
        let swipeX = 0;
        let swipeSide = '';
        let suppressEnvelopeClick = false;
        let noticeTimer = 0;
        let noticeClearTimer = 0;
        let shakeMotion = null;
        let shredding = false;
        let layoutKey = '';
        let fontRevision = 0;
        const motions = new Set();

        function q(selector) { return root.querySelector(selector); }
        const envelope = () => q('.reader-envelope');
        const track = () => q('.reader-envelope-track');
        const envelopeStage = () => q('.reader-envelope-stage');
        const paperStage = () => q('.reader-paper-stage');
        const stack = () => q('.reader-paper-stack');
        const shadow = () => q('.reader-turn-shadow');
        const flap = () => q('.reader-envelope-flap');
        const slip = () => q('.reader-envelope-slip');
        const envelopeModel = () => q('.reader-envelope-model');
        const passwordEntry = () => q('.reader-password-entry');
        const passwordForm = () => q('.reader-password-form');
        const passwordInput = () => q('.reader-lock-password');
        const lockNotice = () => q('.reader-lock-notice');
        const envelopeShell = () => q('.reader-envelope-shell');

        function setBusy(value) { busy = value; root.dataset.busy = String(value); }
        function phase(value) { root.dataset.phase = value; paperStage().inert = value !== 'paper'; envelopeStage().inert = value === 'paper'; }
        function motionStep(value) { root.dataset.motion = value; }

        function inertBackground(on) {
            const items = screenEl().querySelectorAll('.mb-topbar, .mb-page');
            items.forEach((element) => {
                if (on) {
                    if (!element.dataset.readerInert) { element.dataset.readerInert = element.inert ? '1' : '0'; element.inert = true; }
                } else if (element.dataset.readerInert != null) {
                    element.inert = element.dataset.readerInert === '1';
                    delete element.dataset.readerInert;
                }
            });
        }

        async function animate(element, frames, duration = 480) {
            if (reduced.matches || duration === 0) { Object.assign(element.style, frames[frames.length - 1]); return; }
            const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'forwards' });
            motions.add(animation);
            await animation.finished.catch(() => {});
            motions.delete(animation);
            if (animation.playState === 'finished') Object.assign(element.style, frames[frames.length - 1]);
            animation.cancel();
        }

        function unlockTimeReached() {
            const time = new Date(model && model.unlockAt || '').getTime();
            return Number.isFinite(time) && time <= Date.now();
        }
        function hideNotice() { clearTimeout(noticeTimer); clearTimeout(noticeClearTimer); lockNotice().classList.remove('is-visible'); lockNotice().textContent = ''; }
        function notify(message) {
            hideNotice();
            lockNotice().textContent = String(message || '').replace(/[。．.]+$/u, '');
            lockNotice().classList.add('is-visible');
            noticeTimer = setTimeout(() => {
                lockNotice().classList.remove('is-visible');
                noticeClearTimer = setTimeout(() => { lockNotice().textContent = ''; }, 180);
            }, 2600);
        }
        function lockFeedback(message) {
            notify(message);
            if (shakeMotion) { shakeMotion.cancel(); motions.delete(shakeMotion); shakeMotion = null; }
            if (reduced.matches) return;
            const animation = envelopeShell().animate([
                { transform: 'none' },
                { transform: 'translateX(-5px) rotate(-.8deg)' },
                { transform: 'translateX(5px) rotate(.8deg)' },
                { transform: 'translateX(-3px) rotate(-.4deg)' },
                { transform: 'translateX(2px) rotate(.2deg)' },
                { transform: 'none' }
            ], { duration: 380, easing: 'ease-out' });
            shakeMotion = animation;
            motions.add(animation);
            animation.finished.catch(() => {}).finally(() => { motions.delete(animation); if (shakeMotion === animation) shakeMotion = null; });
        }
        function closePasswordForm(focus = false) {
            if (passwordForm().contains(document.activeElement)) passwordInput().blur();
            passwordForm().hidden = true;
            passwordInput().value = '';
            passwordInput().removeAttribute('aria-invalid');
            passwordEntry().setAttribute('aria-expanded', 'false');
            passwordEntry().hidden = !(model && model.locked && model.hasPassword && !unlockTimeReached() && envelope().classList.contains('is-back'));
            if (focus) (passwordEntry().hidden ? envelope() : passwordEntry()).focus({ preventScroll: true });
        }
        function showPasswordForm() {
            if (busy || !model || !model.locked || !model.hasPassword || !envelope().classList.contains('is-back')) return;
            if (unlockTimeReached()) { showPaper(); return; }
            hideNotice();
            revealEnvelope(0);
            passwordEntry().hidden = true;
            passwordEntry().setAttribute('aria-expanded', 'true');
            passwordForm().hidden = false;
            passwordInput().focus({ preventScroll: true });
        }
        function cancelTurn() {
            if (deckFrame) cancelAnimationFrame(deckFrame);
            deckFrame = 0;
            if (turn && turn.resolve) turn.resolve();
            turn = null;
            paperGesture = null;
            delete root.dataset.deckProgress;
            shadow().style.opacity = '0';
            settleDeck();
        }
        function parts(text) {
            return typeof Intl.Segmenter === 'function'
                ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
                : Array.from(text);
        }
        function paginate(text, kind) {
            const chars = parts(text);
            const result = [];
            let start = 0;
            let offset = 0;
            if (!chars.length) return [{ text: '', kind, offset: 0 }];
            const width = content.clientWidth;
            const height = content.clientHeight;
            const measure = root.querySelector('.reader-measure');
            measure.style.width = width + 'px';
            const style = getComputedStyle(content);
            for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']) measure.style[property] = style[property];
            while (start < chars.length) {
                let low = 1;
                let high = Math.min(420, chars.length - start);
                let fit = 1;
                while (low <= high) {
                    const middle = (low + high) >> 1;
                    measure.textContent = chars.slice(start, start + middle).join('');
                    if (measure.scrollHeight <= height + .5 && measure.scrollWidth <= width + .5) { fit = middle; low = middle + 1; }
                    else high = middle - 1;
                }
                if (start + fit < chars.length) {
                    for (let end = fit; end >= Math.floor(fit * .72); end--) {
                        if (/[\n。！？.!?]/u.test(chars[start + end - 1])) { fit = end; break; }
                    }
                }
                const textPart = chars.slice(start, start + fit).join('');
                result.push({ text: textPart, kind, offset });
                offset += textPart.length;
                start += fit;
            }
            measure.textContent = '';
            return result;
        }
        function fillPage(element, pageIndex) {
            const page = pages[pageIndex];
            element.querySelector('.reader-page-content').textContent = page.text;
            element.querySelector('.reader-page-heading strong').textContent = page.kind === 'reply' ? '回信' : model.sender + ' → ' + model.recipient;
            element.querySelector('.reader-page-heading small').textContent = page.kind === 'reply' ? model.replyDate : model.date;
            element.querySelector('.reader-page-index').textContent = `${pageIndex + 1} / ${pages.length}`;
        }
        const mix = (a, b, t) => a + (b - a) * t;
        function deckPose(position) {
            const depth = Math.min(position, 3);
            return { x: depth ? (depth % 2 ? -1 : 1) * depth * 3 : 0, y: depth * 5, r: depth ? (depth % 2 ? .8 : -.65) * depth : -.2 };
        }
        function placeCard(card, pose) {
            card.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) rotate(${pose.r}deg)`;
        }
        function settleDeck() {
            if (!cards.length || !order.length) return;
            const focused = document.activeElement;
            const focusClass = focused && focused.closest('.reader-page') ? ['reader-prev', 'reader-next', 'reader-return'].find((name) => focused.classList.contains(name)) : null;
            order.forEach((pageIndex, position) => {
                const card = cards[pageIndex];
                const active = position === 0;
                placeCard(card, deckPose(position));
                card.style.zIndex = String(cards.length - position);
                card.style.visibility = position < 4 ? 'visible' : 'hidden';
                card.style.willChange = position < 4 ? 'transform' : '';
                card.classList.toggle('reader-page-base', active);
                card.classList.toggle('reader-deck-sheet', !active);
                card.inert = !active;
                card.setAttribute('aria-hidden', String(!active));
            });
            base = cards[order[0]];
            content = base.querySelector('.reader-page-content');
            stack().dataset.page = String(order[0] + 1);
            stack().dataset.turning = 'false';
            if (focusClass) base.querySelector('.' + focusClass)?.focus({ preventScroll: true });
        }
        function paint() {
            if (!pages.length) return;
            const fragment = document.createDocumentFragment();
            cards = pages.map((_, pageIndex) => {
                const card = pageTemplate.cloneNode(true);
                card.classList.remove('reader-page-base');
                card.dataset.pageIndex = String(pageIndex);
                fillPage(card, pageIndex);
                card.querySelectorAll('.reader-prev,.reader-next').forEach((button) => { button.disabled = pages.length < 2; });
                fragment.appendChild(card);
                return card;
            });
            stack().querySelectorAll('.reader-page').forEach((card) => card.remove());
            stack().insertBefore(fragment, shadow());
            stack().dataset.sheets = String(pages.length);
            settleDeck();
        }
        function layout() {
            if (!model || root.hidden || !content.clientWidth || !content.clientHeight) return;
            const previous = pages[order[0]];
            const offset = previous ? previous.offset : 0;
            const kind = previous ? previous.kind : 'letter';
            if (turn) { cancelTurn(); setBusy(false); }
            pages = [...paginate(String(model.letter.content || ''), 'letter'), ...(model.letter.reply ? paginate(String(model.letter.reply.content || ''), 'reply') : [])];
            const match = pages.findIndex((page) => page.kind === kind && page.offset <= offset && page.offset + page.text.length > offset);
            const index = Math.max(0, match);
            order = pages.map((_, i) => (i + index) % pages.length);
            paint();
            layoutKey = paperLayoutKey();
        }
        function createTurn(direction) {
            if (busy || root.dataset.phase !== 'paper' || pages.length < 2) return false;
            setBusy(true);
            const oldOrder = [...order];
            const nextOrder = direction > 0 ? [...order.slice(1), order[0]] : [order[order.length - 1], ...order.slice(0, -1)];
            const moving = direction > 0 ? order[0] : order[order.length - 1];
            const travel = stack().clientWidth + stack().clientHeight * .12 + 28;
            const slots = oldOrder.map((pageIndex, position) => ({ card: cards[pageIndex], pageIndex, position, nextPosition: nextOrder.indexOf(pageIndex) }))
                .filter((slot) => slot.position < 4 || slot.nextPosition < 4 || slot.pageIndex === moving)
                .map((slot) => ({ ...slot, from: deckPose(slot.position), to: deckPose(slot.nextPosition) }));
            turn = { moving, direction, oldOrder, nextOrder, slots, progress: 0, travel, velocity: 0, lastTime: performance.now() };
            stack().dataset.turning = 'true';
            slots.forEach(({ card }) => { card.style.visibility = 'visible'; card.style.willChange = 'transform'; });
            previewTurn(0);
            return true;
        }
        function previewTurn(progress) {
            if (!turn) return;
            turn.progress = progress;
            const { moving, direction, slots, travel } = turn;
            const arc = Math.sin(progress * Math.PI);
            const shift = smooth(direction > 0 ? progress * 2 : progress * 2 - 1);
            slots.forEach(({ card, pageIndex, from, to }) => {
                if (pageIndex === moving) {
                    const side = direction > 0 ? -1 : 1;
                    placeCard(card, { x: mix(from.x, to.x, progress) + side * travel * arc, y: mix(from.y, to.y, progress) - 12 * arc, r: mix(from.r, to.r, progress) + side * 6 * arc });
                    card.style.zIndex = String((direction > 0 ? progress < .5 : progress >= .5) ? cards.length + 1 : 0);
                } else {
                    placeCard(card, { x: mix(from.x, to.x, shift), y: mix(from.y, to.y, shift), r: mix(from.r, to.r, shift) });
                }
            });
            root.dataset.deckProgress = progress.toFixed(4);
        }
        async function finishTurn(commit = true) {
            if (!turn) return;
            const moving = turn;
            const token = session;
            const from = turn.progress;
            const to = commit ? 1 : 0;
            const distance = to - from;
            const duration = reduced.matches ? 0 : Math.max(200, Math.abs(distance) * 560);
            const start = performance.now();
            const velocity = performance.now() - moving.lastTime < 90 ? moving.velocity : 0;
            const tangent = Math.max(-Math.abs(distance) * .35, Math.min(Math.abs(distance) * 2, velocity * duration));
            await new Promise((resolve) => {
                moving.resolve = resolve;
                function tick(now) {
                    if (turn !== moving || token !== session) { resolve(); return; }
                    const t = duration ? Math.min(1, (now - start) / duration) : 1;
                    const t2 = t * t;
                    const t3 = t2 * t;
                    const p = (2 * t3 - 3 * t2 + 1) * from + (t3 - 2 * t2 + t) * tangent + (-2 * t3 + 3 * t2) * to;
                    previewTurn(Math.max(0, Math.min(1, p)));
                    if (t < 1) deckFrame = requestAnimationFrame(tick);
                    else { deckFrame = 0; resolve(); }
                }
                tick(start);
            });
            if (turn !== moving || token !== session) return;
            order = commit ? moving.nextOrder : moving.oldOrder;
            cancelTurn();
            setBusy(false);
        }
        function turnPage(direction) { if (createTurn(direction)) finishTurn(true); }
        function revealEnvelope(x, settled = false) {
            const canReply = model && model.canReply && !model.locked;
            if (x < 0 && !canReply) x = 0;
            swipeX = Math.max(-84, Math.min(84, x));
            const side = swipeX < -2 ? 'reply' : swipeX > 2 ? 'delete' : '';
            swipeSide = side;
            root.dataset.reveal = side || 'none';
            track().style.setProperty('--reader-swipe-x', swipeX + 'px');
            track().classList.toggle('is-settling', settled);
            q('.reader-reply').hidden = side !== 'reply';
            q('.reader-delete').hidden = side !== 'delete';
        }
        async function faceBack(back, token = session) {
            if (envelope().classList.contains('is-back') === back) return true;
            closePasswordForm();
            passwordEntry().hidden = true;
            hideNotice();
            const from = envelopeModel().style.transform || (envelope().classList.contains('is-back') ? 'rotateY(180deg)' : 'rotateY(0deg)');
            await animate(envelopeModel(), [{ transform: from }, { transform: back ? 'rotateY(180deg)' : 'rotateY(0deg)' }], 480);
            if (token !== session) return false;
            envelope().classList.toggle('is-back', back);
            closePasswordForm();
            return true;
        }
        function paperTransform(rect) {
            const target = paperStage().getBoundingClientRect();
            return `translate(${rect.x + rect.width / 2 - target.x - target.width / 2}px,${rect.y + rect.height / 2 - target.y - target.height / 2}px) scale(${rect.width / target.width},${rect.height / target.height})`;
        }
        async function showPaper() {
            if (!model || busy) return;
            if (swipeSide) { revealEnvelope(0, true); return; }
            if (model.locked) {
                if (unlockTimeReached()) { unlock(''); return; }
                closePasswordForm();
                lockFeedback(model.hasPassword ? (model.unlockAt ? '还没到拆信时间，可在背面输入密码提前打开。' : '这封信需要密码，请在背面输入。') : '还没到拆信时间，现在还不能打开。');
                return;
            }
            const token = session;
            setBusy(true);
            revealEnvelope(0);
            closePasswordForm();
            hideNotice();
            motionStep('turning');
            if (!await faceBack(true, token)) return;
            motionStep('flap-opening');
            flap().style.zIndex = '6';
            await animate(flap(), [{ transform: 'translateZ(5px) rotateX(0deg)' }, { transform: 'translateZ(5px) rotateX(-180deg)' }], 540);
            if (token !== session) return;
            flap().style.transform = 'translateZ(-2px) rotateX(-180deg)';
            flap().style.zIndex = '0';
            envelope().classList.add('is-unsealing');
            motionStep('extracting');
            await animate(slip(), [{ transform: 'translateY(0)' }, { transform: 'translateY(-80%)' }], 560);
            if (token !== session) return;
            envelope().classList.add('is-extracting');
            layout();
            const source = slip().getBoundingClientRect();
            motionStep('unfolding');
            phase('paper');
            await animate(paperStage(), [{ transform: paperTransform(source), opacity: '0.4' }, { transform: 'none', opacity: '1' }], 540);
            if (token !== session) return;
            paperStage().style.transform = '';
            paperStage().style.opacity = '';
            setBusy(false);
            motionStep('reading');
            base.querySelector('.reader-return').focus({ preventScroll: true });
            if (!read) {
                read = true;
                Promise.resolve(model.onRead && model.onRead()).then((saved) => {
                    if (token === session && saved) root.querySelectorAll('[data-unread-marker]').forEach((marker) => marker.remove());
                });
            }
        }
        async function toEnvelope() {
            if (!model || busy || root.dataset.phase !== 'paper') return;
            const token = session;
            cancelTurn();
            setBusy(true);
            revealEnvelope(0);
            motionStep('folding');
            envelope().classList.add('is-back', 'is-unsealing', 'is-extracting');
            envelopeModel().style.transform = 'rotateY(180deg)';
            flap().style.transform = 'translateZ(-2px) rotateX(-180deg)';
            flap().style.zIndex = '0';
            slip().style.transform = 'translateY(-80%)';
            phase('envelope');
            const destination = slip().getBoundingClientRect();
            await animate(paperStage(), [{ transform: 'none', opacity: '1' }, { transform: paperTransform(destination), opacity: '0' }], 480);
            if (token !== session) return;
            paperStage().style.transform = '';
            paperStage().style.opacity = '';
            motionStep('inserting');
            await animate(slip(), [{ transform: 'translateY(-80%)' }, { transform: 'translateY(0)' }], 560);
            if (token !== session) return;
            envelope().classList.remove('is-extracting');
            motionStep('flap-closing');
            flap().style.zIndex = '6';
            await animate(flap(), [{ transform: 'translateZ(5px) rotateX(-180deg)' }, { transform: 'translateZ(5px) rotateX(0deg)' }], 540);
            if (token !== session) return;
            envelope().classList.remove('is-unsealing');
            setBusy(false);
            motionStep('closed');
            envelope().focus({ preventScroll: true });
        }
        function fillEnvelope() {
            const template = document.createElement('template');
            template.innerHTML = model.envelopeHtml;
            const front = q('.reader-envelope-front');
            front.replaceChildren(...[...(template.content.querySelector('.envelope-front')?.childNodes || [])].map((node) => node.cloneNode(true)));
            const sender = template.content.querySelector('.envelope-sender');
            q('.reader-envelope-details').replaceChildren(...(sender ? [sender.cloneNode(true)] : []));
            closePasswordForm();
            hideNotice();
            q('.reader-unlock').disabled = false;
            passwordInput().readOnly = false;
            q('.reader-edit').hidden = !model.canEdit;
            root.setAttribute('aria-label', model.sender + '写给' + model.recipient + '的信');
        }
        async function unlock(password = passwordInput().value) {
            if (!model || busy || (!model.hasPassword && !unlockTimeReached())) return;
            if (!String(password).trim() && !unlockTimeReached()) {
                passwordInput().setAttribute('aria-invalid', 'true');
                notify('请先输入密码。');
                passwordInput().focus({ preventScroll: true });
                return;
            }
            const token = session;
            setBusy(true);
            hideNotice();
            q('.reader-unlock').disabled = true;
            passwordInput().readOnly = true;
            try {
                const updated = await model.onUnlock(password);
                if (token !== session) return;
                model = updated;
                fillEnvelope();
                setBusy(false);
                showPaper();
            } catch (error) {
                if (token === session) {
                    setBusy(false);
                    q('.reader-unlock').disabled = false;
                    passwordInput().readOnly = false;
                    lockFeedback(error.message || '暂时无法解封，请稍后再试。');
                    if (!passwordForm().hidden) {
                        passwordInput().setAttribute('aria-invalid', 'true');
                        passwordInput().focus({ preventScroll: true });
                        passwordInput().select();
                    }
                }
            }
        }
        async function shred(letterId, commit) {
            if (!model || String(model.letter.id) !== String(letterId) || busy || root.hidden || suspended || root.dataset.phase !== 'envelope') return false;
            shredding = true;
            setBusy(true);
            hideNotice();
            closePasswordForm();
            envelopeGesture = null;
            if (shakeMotion) { shakeMotion.cancel(); motions.delete(shakeMotion); shakeMotion = null; }
            envelopeStage().inert = true;
            q('.reader-close').disabled = true;
            root.setAttribute('aria-busy', 'true');
            root.focus({ preventScroll: true });
            try {
                await Shredder.play({ host: root, source: envelope(), commit });
                shredding = false;
                close(true);
                return true;
            } catch (error) {
                setBusy(false);
                notify('删除失败，信还在这里');
                throw error;
            } finally {
                shredding = false;
                q('.reader-close').disabled = false;
                envelopeStage().inert = root.dataset.phase === 'paper';
                root.removeAttribute('aria-busy');
            }
        }
        function open(value, source) {
            if (shredding) return;
            if (model) close(true);
            const token = ++session;
            model = value;
            root.dataset.origin = value.letter && value.letter.from === 'self' ? 'self' : 'contact';
            applyLetterFont(value.letter);
            pages = [];
            order = [];
            read = false;
            suspended = false;
            priorFocus = document.activeElement;
            setBusy(true);
            fillEnvelope();
            phase('envelope');
            motionStep('enlarging');
            envelope().className = 'reader-envelope';
            closePasswordForm();
            envelopeModel().style.transform = 'rotateY(0deg)';
            flap().style.transform = 'translateZ(5px) rotateX(0deg)';
            flap().style.zIndex = '6';
            slip().style.transform = 'translateY(0)';
            paperStage().style.transform = '';
            paperStage().style.opacity = '';
            revealEnvelope(0);
            root.hidden = false;
            inertBackground(true);
            requestAnimationFrame(() => { if (token === session) root.classList.add('is-visible'); });
            root.focus({ preventScroll: true });
            const face = source && source.querySelector(source.dataset.face === 'back' ? '.envelope-back' : '.envelope-front');
            const rect = (face || source) && (face || source).getBoundingClientRect();
            const target = envelope().getBoundingClientRect();
            const transform = rect && rect.width && rect.height
                ? `translate(${rect.x + rect.width / 2 - target.x - target.width / 2}px,${rect.y + rect.height / 2 - target.y - target.height / 2}px) scale(${rect.width / target.width},${rect.height / target.height})`
                : 'scale(.88)';
            animate(envelope(), [{ transform, opacity: '.5' }, { transform: 'none', opacity: '1' }], 440).then(() => {
                if (token !== session) return;
                envelope().style.transform = '';
                envelope().style.opacity = '';
                setBusy(false);
                motionStep('closed');
                envelope().focus({ preventScroll: true });
            });
        }
        function close(immediate = false) {
            if (shredding) return;
            if (!model) return;
            session++;
            hideNotice();
            closePasswordForm();
            cancelTurn();
            for (const motion of motions) motion.cancel();
            motions.clear();
            const focus = priorFocus;
            model = null;
            applyLetterFont(null);
            setBusy(false);
            if (root) root.classList.remove('is-visible');
            inertBackground(false);
            suspended = false;
            if (immediate || reduced.matches) root.hidden = true;
            else setTimeout(() => { if (!model) root.hidden = true; }, 220);
            if (focus && focus.isConnected && !focus.inert) focus.focus({ preventScroll: true });
            else $('mailboxFolderButton')?.focus({ preventScroll: true });
        }
        function suspend() {
            if (!model) return;
            suspended = true;
            root.hidden = true;
            inertBackground(false);
        }
        function resume() {
            if (!model || !suspended) return;
            suspended = false;
            root.hidden = false;
            inertBackground(true);
            revealEnvelope(0);
            if (root.dataset.phase === 'paper') layout();
            envelope().focus({ preventScroll: true });
        }
        function paperLayoutKey() {
            const style = getComputedStyle(content);
            return [content.clientWidth, content.clientHeight, style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing, fontRevision].join('|');
        }
        function resized() {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(function update() {
                resizeFrame = 0;
                if (!model || root.hidden) return;
                if (busy) { resizeFrame = requestAnimationFrame(update); return; }
                if (paperLayoutKey() !== layoutKey) layout();
            });
        }
        function init() {
            if (root) return;
            root = document.createElement('div');
            root.className = 'letter-reader-v1 letter-reader-v2';
            root.hidden = true;
            root.tabIndex = -1;
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', '阅读信件');
            root.innerHTML = `<button class="reader-close" aria-label="返回信箱">${icon('close')}</button><div class="reader-stage"><div class="reader-envelope-stage"><div class="reader-envelope-shell"><p class="reader-lock-notice" role="status" aria-live="polite" aria-atomic="true"></p><div class="reader-envelope-swipe-actions"><button class="reader-swipe-action reader-delete" aria-label="删除这封信" title="删除" hidden>${icon('remove')}</button><button class="reader-swipe-action reader-reply" aria-label="回应这封信" title="回应" hidden>${icon('reply')}</button></div><div class="reader-envelope-track"><button class="reader-envelope" aria-label="点击拆开信封" aria-description="左滑露出回应，右滑露出删除；点击信封拆信。"><span class="reader-envelope-model"><span class="reader-envelope-face reader-envelope-front"></span><span class="reader-envelope-face reader-envelope-back"><span class="reader-envelope-flap"></span><span class="reader-envelope-slip"></span><span class="reader-envelope-pocket"></span><span class="reader-envelope-details"></span></span></span></button><button type="button" class="reader-password-entry" aria-controls="readerPasswordForm" aria-expanded="false" hidden>${icon('lock')}<span>输入密码</span></button><form id="readerPasswordForm" class="reader-password-form" autocomplete="off" hidden><input class="reader-lock-password" type="password" name="letter-password" autocomplete="off" placeholder="输入密码" aria-label="解封密码"><button type="submit" class="reader-unlock" aria-label="用密码解封">${icon('next')}</button></form><button class="reader-icon reader-edit" aria-label="编辑这封信" title="编辑" hidden>${icon('edit')}</button><button class="reader-icon reader-flip" aria-label="翻转信封" title="翻转信封">${icon('flip')}</button></div></div></div><div class="reader-paper-stage" inert><div class="reader-paper-stack"><article class="reader-page reader-page-base"><header class="reader-page-header"><button class="reader-icon reader-return" aria-label="收起信纸，返回信封">${icon('back')}</button><div class="reader-page-heading"><strong></strong><small></small></div></header><div class="reader-page-content"></div><footer class="reader-page-footer"><button class="reader-icon reader-prev" aria-label="上一张信纸">${icon('back')}</button><span class="reader-page-index" role="status" aria-live="polite"></span><button class="reader-icon reader-next" aria-label="下一张信纸">${icon('next')}</button></footer></article><div class="reader-turn-shadow"></div></div></div></div>`;
            screenEl().appendChild(root);
            base = q('.reader-page-base');
            content = base.querySelector('.reader-page-content');
            pageTemplate = base.cloneNode(true);
            q('.reader-deck-under')?.remove();
            const measure = document.createElement('div');
            measure.className = 'reader-page-content reader-measure';
            measure.setAttribute('aria-hidden', 'true');
            root.appendChild(measure);

            q('.reader-close').addEventListener('click', () => close());
            root.addEventListener('click', (event) => {
                if (busy || !model) return;
                const target = event.target;
                if (target !== root && target !== q('.reader-stage') && target !== envelopeStage() && target !== paperStage() && target !== stack()) return;
                close();
            });
            envelope().addEventListener('click', (event) => {
                if (suppressEnvelopeClick) { event.preventDefault(); return; }
                showPaper();
            });
            q('.reader-flip').addEventListener('click', async () => {
                if (busy) return;
                const token = session;
                setBusy(true);
                revealEnvelope(0);
                await faceBack(!envelope().classList.contains('is-back'));
                if (model && token === session) setBusy(false);
            });
            stack().addEventListener('click', (event) => {
                const button = event.target.closest('button');
                if (!button || !base.contains(button)) return;
                if (button.classList.contains('reader-return')) toEnvelope();
                else if (button.classList.contains('reader-prev')) turnPage(-1);
                else if (button.classList.contains('reader-next')) turnPage(1);
            });
            passwordEntry().addEventListener('click', showPasswordForm);
            passwordForm().addEventListener('submit', (event) => { event.preventDefault(); unlock(); });
            passwordInput().addEventListener('input', () => passwordInput().removeAttribute('aria-invalid'));
            q('.reader-edit').addEventListener('click', () => { if (!busy && model && model.onEdit) model.onEdit(); });
            q('.reader-reply').addEventListener('click', () => { if (!busy && swipeSide === 'reply' && model && model.onReply) model.onReply(); });
            q('.reader-delete').addEventListener('click', () => { if (!busy && swipeSide === 'delete' && model && model.onDelete) model.onDelete(); });
            track().addEventListener('pointerdown', (event) => {
                if (busy || root.dataset.phase !== 'envelope' || event.button !== 0 || event.target.closest('.reader-icon,.reader-password-entry,.reader-password-form')) return;
                track().classList.remove('is-settling');
                envelopeGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: swipeX, moving: false };
            });
            track().addEventListener('pointermove', (event) => {
                if (!envelopeGesture || event.pointerId !== envelopeGesture.id) return;
                const dx = event.clientX - envelopeGesture.x;
                const dy = event.clientY - envelopeGesture.y;
                if (!envelopeGesture.moving) {
                    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { envelopeGesture = null; return; }
                    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
                    envelopeGesture.moving = true;
                    track().setPointerCapture(event.pointerId);
                }
                event.preventDefault();
                revealEnvelope(envelopeGesture.start + dx);
            });
            function releaseEnvelope(event, cancel = false) {
                if (!envelopeGesture || event.pointerId !== envelopeGesture.id) return;
                const moving = envelopeGesture.moving;
                envelopeGesture = null;
                if (moving) {
                    suppressEnvelopeClick = true;
                    setTimeout(() => { suppressEnvelopeClick = false; }, 350);
                    const value = !cancel && Math.abs(swipeX) > 32 ? Math.sign(swipeX) * 84 : 0;
                    revealEnvelope(value, true);
                }
            }
            track().addEventListener('pointerup', (event) => releaseEnvelope(event));
            track().addEventListener('pointercancel', (event) => releaseEnvelope(event, true));
            stack().addEventListener('pointerdown', (event) => {
                if (busy || event.button !== 0 || root.dataset.phase !== 'paper' || !content.contains(event.target)) return;
                const r = content.getBoundingClientRect();
                if (event.pointerType === 'mouse' && event.clientX > r.left + 45 && event.clientX < r.right - 45) return;
                paperGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: 0, distance: 0 };
            });
            stack().addEventListener('pointermove', (event) => {
                if (!paperGesture || event.pointerId !== paperGesture.id) return;
                const dx = event.clientX - paperGesture.x;
                const dy = event.clientY - paperGesture.y;
                if (!paperGesture.direction) {
                    if (Math.abs(dy) > 15 && Math.abs(dy) > Math.abs(dx)) { paperGesture = null; return; }
                    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                    const direction = dx < 0 ? 1 : -1;
                    if (!createTurn(direction)) { paperGesture = null; return; }
                    paperGesture.direction = direction;
                    stack().setPointerCapture(event.pointerId);
                }
                event.preventDefault();
                paperGesture.distance = Math.max(0, -dx * paperGesture.direction);
                const progress = Math.asin(Math.min(.99, paperGesture.distance / turn.travel)) / Math.PI;
                const now = performance.now();
                const elapsed = now - turn.lastTime;
                if (elapsed > 0) turn.velocity = mix(turn.velocity, (progress - turn.progress) / elapsed, .65);
                turn.lastTime = now;
                previewTurn(progress);
            });
            function releasePaper(event, cancel = false) {
                if (!paperGesture || event.pointerId !== paperGesture.id) return;
                const gesture = paperGesture;
                paperGesture = null;
                if (gesture.direction && turn) {
                    const flick = performance.now() - turn.lastTime < 90 && turn.velocity > .00035 && gesture.distance > 30;
                    finishTurn(!cancel && (gesture.distance > stack().clientWidth * .16 || flick));
                }
            }
            stack().addEventListener('pointerup', (event) => releasePaper(event));
            stack().addEventListener('pointercancel', (event) => releasePaper(event, true));
            stack().addEventListener('lostpointercapture', (event) => { if (event.target === stack()) releasePaper(event, true); });
            root.addEventListener('keydown', (event) => {
                if (event.key === 'Tab') root.dataset.keyboard = 'true';
                if (event.key === 'Escape') {
                    event.preventDefault();
                    if (shredding) return;
                    if (!passwordForm().hidden && !busy) closePasswordForm(true);
                    else if (swipeSide) revealEnvelope(0, true);
                    else if (root.dataset.phase === 'paper' && !busy) toEnvelope();
                    else close();
                    return;
                }
                if (event.target.matches('input,textarea')) return;
                if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                    event.preventDefault();
                    if (root.dataset.phase === 'paper') turnPage(event.key === 'ArrowRight' ? 1 : -1);
                    else if (!busy) {
                        revealEnvelope(event.key === 'ArrowLeft' ? -84 : 84, true);
                        if (swipeSide) q('.reader-' + swipeSide).focus();
                    }
                }
                if (event.key === 'Tab') {
                    const controls = [...root.querySelectorAll('button,input')].filter((element) => !element.disabled && !element.hidden && !element.closest('[inert],[hidden]') && element.getClientRects().length);
                    const first = controls[0];
                    const last = controls[controls.length - 1];
                    if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                }
            });
            root.addEventListener('pointerdown', () => { root.dataset.keyboard = 'false'; }, { passive: true });
            new ResizeObserver(resized).observe(stack());
            document.fonts?.addEventListener('loadingdone', (event) => {
                const family = getComputedStyle(content).fontFamily;
                if (event.fontfaces.some((face) => family.includes(face.family.replace(/["']/g, '')))) { fontRevision++; resized(); }
            });
            window.addEventListener('resize', resized, { passive: true });
            setInterval(() => {
                if (model && model.locked && unlockTimeReached() && !busy) { model.canUnlock = true; closePasswordForm(); }
            }, 10000);
        }

        return {
            init,
            open,
            close,
            suspend,
            resume,
            shred,
            isOpen: () => !!root && !root.hidden,
            get ready() { return !!root; },
            get root() { return root; },
            get envelope() { return root ? envelope() : null; }
        };
    })();

    /* ===== 碎纸机（移植自 whisper-mailbox shredder） ===== */
    const Shredder = (() => {
        const random = (min, max) => min + Math.random() * (max - min);
        async function play({ host, source, commit }) {
            if (reduced.matches) { await commit(); return; }
            const animations = new Set();
            let layer;
            let letter;
            let machine;
            let body;
            let particles;
            let geometry;
            let visualError = false;
            function tween(element, frames, options) {
                const animation = element.animate(frames, { fill: 'forwards', ...options });
                animations.add(animation);
                return animation.finished.catch(() => {});
            }
            function cleanup() {
                for (const animation of animations) animation.cancel();
                animations.clear();
                if (layer) layer.remove();
                host.classList.remove('is-shredding');
                delete host.dataset.shredPhase;
            }
            function prepare() {
                const viewport = host.getBoundingClientRect();
                const rect = source.getBoundingClientRect();
                const width = Math.min(360, viewport.width - 44);
                const height = 82;
                const x = (viewport.width - width) / 2;
                const y = Math.max(58, Math.min(126, viewport.height * .12));
                const feedY = y + height - 10;
                const scale = width * .81 / rect.width;
                geometry = { viewport, rect, width, height, x, y, feedY, scale, dx: viewport.width / 2 - (rect.left - viewport.left + rect.width / 2), dy: feedY + 16 - (rect.top - viewport.top) };
                layer = document.createElement('div');
                layer.className = 'reader-shred-layer';
                layer.setAttribute('aria-hidden', 'true');
                layer.inert = true;
                layer.innerHTML = '<div class="reader-shred-feed"><div class="reader-shred-letter"></div></div><div class="reader-shredder"><div class="reader-shredder-body"><span class="reader-shredder-ridge"></span><span class="reader-shredder-light"></span><svg class="reader-shredder-symbol" viewBox="0 0 24 24"><path d="M8 3h8v8H8z M5 10h14v7H5z M8 17v5 M12 17v4 M16 17v5"/></svg><span class="reader-shredder-slot"></span><span class="reader-shredder-teeth"></span></div></div><div class="reader-shred-particles"></div>';
                machine = layer.querySelector('.reader-shredder');
                body = layer.querySelector('.reader-shredder-body');
                letter = layer.querySelector('.reader-shred-letter');
                particles = layer.querySelector('.reader-shred-particles');
                Object.assign(machine.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
                const feed = layer.querySelector('.reader-shred-feed');
                feed.style.top = feedY + 'px';
                Object.assign(letter.style, { left: rect.left - viewport.left + 'px', top: rect.top - viewport.top - feedY + 'px', width: rect.width + 'px', height: rect.height + 'px' });
                const envelopeClone = source.cloneNode(true);
                envelopeClone.tabIndex = -1;
                envelopeClone.removeAttribute('aria-description');
                envelopeClone.style.transform = '';
                envelopeClone.style.opacity = '1';
                letter.appendChild(envelopeClone);
                host.appendChild(layer);
                host.classList.add('is-shredding');
                host.dataset.shredPhase = 'arriving';
                return Promise.all([
                    tween(machine, [{ transform: `translate3d(0,${-y - height - 20}px,0)`, opacity: 0 }, { transform: 'translate3d(0,0,0)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }),
                    tween(letter, [{ transform: 'translate3d(0,0,0) scale(1)' }, { transform: `translate3d(${geometry.dx}px,${geometry.dy}px,0) scale(${scale})` }], { duration: 560, easing: 'cubic-bezier(.25,.72,.25,1)' })
                ]);
            }
            function scatter() {
                const { viewport, x, width, y, height } = geometry;
                const outlet = y + height - 7;
                const fall = viewport.height - outlet + 50;
                const jobs = [];
                for (let i = 0; i < 40; i++) {
                    const strip = i < 12;
                    const piece = document.createElement('i');
                    const start = x + width * random(.12, .88);
                    const drift = random(-1, 1) * Math.min(viewport.width * .3, 140);
                    const spin = random(-270, 270);
                    const tilt = random(-160, 160);
                    const duration = random(1100, 1550);
                    const delay = 260 + i * 13 + random(0, 110);
                    piece.className = 'reader-shred-piece' + (strip ? ' is-strip' : '');
                    Object.assign(piece.style, { left: start + 'px', top: outlet + 'px', width: random(strip ? 4 : 7, strip ? 7 : 13) + 'px', height: random(strip ? 28 : 10, strip ? 49 : 23) + 'px' });
                    piece.style.setProperty('--scrap-shade', ['#f8f5e9', '#e8e5d7', '#fffdf5', '#efede2', '#e1e5d8'][i % 5]);
                    particles.appendChild(piece);
                    jobs.push(tween(piece, [
                        { offset: 0, transform: 'translate3d(0,0,0) rotate(0deg) rotateY(0deg)', opacity: 0 },
                        { offset: .06, transform: `translate3d(${drift * .05}px,12px,0) rotate(${spin * .04}deg) rotateY(${tilt * .08}deg)`, opacity: 1 },
                        { offset: .44, transform: `translate3d(${drift * .6}px,${fall * .26}px,0) rotate(${spin * .55}deg) rotateY(${tilt}deg)`, opacity: 1 },
                        { offset: 1, transform: `translate3d(${drift}px,${fall}px,0) rotate(${spin}deg) rotateY(${tilt * 2}deg)`, opacity: 0 }
                    ], { duration, delay, easing: 'cubic-bezier(.28,.18,.62,1)' }));
                }
                return Promise.all(jobs);
            }
            const request = Promise.resolve().then(commit);
            const entrance = Promise.resolve().then(prepare).catch(() => { visualError = true; });
            try {
                await request;
                await entrance;
                if (!visualError) {
                    host.dataset.shredPhase = 'feeding';
                    const { dx, dy, scale, rect } = geometry;
                    tween(body, [{ transform: 'translateX(0)' }, { transform: 'translateX(.55px)' }, { transform: 'translateX(-.55px)' }, { transform: 'translateX(0)' }], { duration: 100, iterations: 13, fill: 'none' });
                    const feed = tween(letter, [{ transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})` }, { transform: `translate3d(${dx}px,${dy - rect.height * scale - 30}px,0) scale(${scale})` }], { duration: 1250, easing: 'cubic-bezier(.35,.05,.65,.95)' });
                    const scraps = scatter();
                    await feed;
                    host.dataset.shredPhase = 'falling';
                    await scraps;
                    host.dataset.shredPhase = 'leaving';
                    await tween(machine, [{ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: 'translate3d(0,-24px,0)', opacity: 0 }], { duration: 230, easing: 'ease-in' });
                }
            } catch (error) {
                try { await request; } catch (requestError) { throw requestError; }
            } finally {
                cleanup();
            }
        }
        return { play };
    })();

    /* ===== 绑定 ===== */
    function bindShell() {
        const root = screenEl();
        const scroller = $('mailboxScroller');
        const folderMenu = $('mailboxFolderMenu');
        const folderToggle = $('mailboxFolderButton');
        const toolsMenu = $('mailboxToolsMenu');
        const openWriteBtn = $('openWrite');

        scroller.addEventListener('scroll', () => {
            view.positions.set(view.folder, scroller.scrollTop);
            queueTilt();
        }, { passive: true });

        scroller.addEventListener('click', (event) => {
            const envelope = event.target.closest('.mail-envelope');
            if (!envelope) return;
            if (view.selecting) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (view.selected.has(envelope.dataset.id)) view.selected.delete(envelope.dataset.id);
                else view.selected.add(envelope.dataset.id);
                updateSelection();
                return;
            }
            const letter = letters().find((l) => String(l.id) === envelope.dataset.id && !l.hidden);
            if (letter) openLetter(letter, envelope);
        }, true);

        scroller.addEventListener('focusin', (event) => {
            const button = event.target.closest('.mail-envelope');
            if (button && event.target.matches(':focus-visible')) {
                const item = view.items.find((entry) => entry.button === button);
                if (item) scroller.scrollTo({ top: item.top + item.height / 2 - Number(scroller.dataset.focus), behavior: reduced.matches ? 'instant' : 'smooth' });
            }
        });

        const setHover = (node) => {
            if (view.hover === node) return;
            if (view.hover) view.hover.classList.remove('is-hover');
            view.hover = node;
            if (view.hover) view.hover.classList.add('is-hover');
        };
        const clearPress = () => {
            if (view.pressed) view.pressed.classList.remove('is-pressing');
            view.pressed = null;
            if (root) root.classList.remove('mailbox-pressing');
        };
        scroller.addEventListener('pointermove', (event) => {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            setHover(event.target.closest('.mail-envelope'));
        }, { passive: true });
        scroller.addEventListener('pointerleave', () => setHover(null), { passive: true });
        scroller.addEventListener('pointerdown', (event) => {
            clearPress();
            const envelope = event.target.closest('.mail-envelope');
            if (!envelope || view.selecting) return;
            view.pressed = envelope;
            envelope.classList.add('is-pressing');
            if (root) root.classList.add('mailbox-pressing');
        }, { passive: true });
        ['pointerup', 'pointercancel'].forEach((type) => window.addEventListener(type, clearPress, { passive: true }));
        window.addEventListener('blur', clearPress);
        scroller.addEventListener('scroll', () => { setHover(null); clearPress(); }, { passive: true });

        ['pointerdown', 'touchstart', 'wheel'].forEach((type) => scroller.addEventListener(type, pauseAuto, { passive: true }));
        document.addEventListener('visibilitychange', () => { view.autoLast = 0; pauseAuto(); });

        new ResizeObserver(() => measureTilt()).observe(scroller);
        window.addEventListener('resize', measureTilt, { passive: true });
        reduced.addEventListener('change', () => {
            view.items.forEach((item) => { item.signature = ''; });
            measureTilt();
        });

        folderToggle.addEventListener('click', () => {
            const open = folderToggle.getAttribute('aria-expanded') !== 'true';
            setPopover(folderMenu, folderToggle, open);
            if (open) folderMenu.querySelector(`[data-folder="${view.folder}"]`).focus();
        });
        folderMenu.addEventListener('click', (event) => {
            const button = event.target.closest('[data-folder]');
            if (!button) return;
            selectFolder(button.dataset.folder);
            folderToggle.focus();
        });
        folderMenu.addEventListener('keydown', (event) => {
            const buttons = [...folderMenu.querySelectorAll('[data-folder]')];
            const index = buttons.indexOf(document.activeElement);
            if (event.key === 'Escape') { closePopover(); folderToggle.focus(); }
            else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next].focus();
            }
        });

        openWriteBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const open = openWriteBtn.getAttribute('aria-expanded') !== 'true';
            setPopover(toolsMenu, openWriteBtn, open);
            if (open) toolsMenu.querySelector('button').focus();
        });
        toolsMenu.addEventListener('click', (event) => {
            const item = event.target.closest('[data-mail-tool]');
            if (!item) return;
            setPopover(toolsMenu, openWriteBtn, false);
            const action = item.dataset.mailTool;
            if (action === 'write') openWrite();
            else if (action === 'ai') openAiWrite();
            else if (action === 'trash') openTrash();
            else if (action === 'auto') setAuto(!view.auto);
            else if (action === 'check') selection(!view.selecting);
        });
        toolsMenu.addEventListener('keydown', (event) => {
            const choices = [...toolsMenu.querySelectorAll('button')];
            const index = choices.indexOf(document.activeElement);
            if (event.key === 'Escape') { setPopover(toolsMenu, openWriteBtn, false); openWriteBtn.focus(); }
            else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
                choices[next].focus();
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (folderMenu && !folderMenu.hidden && !event.target.closest('.mailbox-folder-control')) setPopover(folderMenu, folderToggle, false);
            if (toolsMenu && !toolsMenu.hidden && !event.target.closest('.mailbox-tools-control')) setPopover(toolsMenu, openWriteBtn, false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (openedPopover) {
                const { menu, button } = openedPopover;
                setPopover(menu, button, false);
                button.focus();
            }
        });

        /* 多选栏 */
        const bar = $('mb-select-bar');
        bar.querySelector('[data-select-exit]').addEventListener('click', () => selection(false));
        bar.querySelector('[data-select-all]').addEventListener('click', () => {
            const ids = [...$(view.folder + 'List').querySelectorAll('.mail-envelope')].map((envelope) => envelope.dataset.id);
            const all = ids.every((id) => view.selected.has(id));
            ids.forEach((id) => { if (all) view.selected.delete(id); else view.selected.add(id); });
            updateSelection();
        });
        bar.querySelector('[data-select-delete]').addEventListener('click', () => {
            if (!view.selected.size) return;
            const count = view.selected.size;
            removeMany([...view.selected]);
            view.selected.clear();
            view.selecting = false;
            updateSelection();
            toast(`已删除 ${count} 封，可在最近删除里找回`);
        });

        /* 写信弹窗 */
        $('mb-close-write').addEventListener('click', () => closeModal('mb-write-modal'));
        $('mb-btn-cancel').addEventListener('click', () => closeModal('mb-write-modal'));
        $('mb-btn-save').addEventListener('click', saveLetter);
        $('mb-btn-del').addEventListener('click', () => {
            const letter = view.editing;
            closeModal('mb-write-modal');
            if (letter) removeLetter(letter);
        });
        $('mb-letter-from').addEventListener('change', () => {
            const from = $('mb-letter-from');
            const to = $('mb-letter-to');
            if (from.value === to.value) {
                const alt = view.roles.find((r) => r.id !== from.value);
                to.value = from.value === 'self' ? (alt ? alt.id : 'self') : 'self';
            }
            syncAiRow();
        });
        $('mb-letter-to').addEventListener('change', syncAiRow);
        $('mb-ai-go').addEventListener('click', aiGenerate);
        $('mb-write-modal').addEventListener('click', (event) => { if (event.target === $('mb-write-modal')) closeModal('mb-write-modal'); });

        /* 回信弹窗 */
        $('mb-close-reply').addEventListener('click', () => { closeModal('mb-reply-modal'); Reader.resume(); });
        $('mb-reply-cancel').addEventListener('click', () => { closeModal('mb-reply-modal'); Reader.resume(); });
        $('mb-reply-send').addEventListener('click', saveReply);
        $('mb-reply-modal').addEventListener('click', (event) => {
            if (event.target === $('mb-reply-modal')) { closeModal('mb-reply-modal'); Reader.resume(); }
        });

        /* 设置 */
        $('mb-settings').addEventListener('click', () => {
            $('mb-theme').value = preferences.theme;
            $('mb-paper-font').value = preferences.paperFont;
            renderRoleFonts();
            $('mb-settings-modal').classList.add('open');
        });
        $('mb-close-settings').addEventListener('click', () => closeModal('mb-settings-modal'));
        $('mb-settings-modal').addEventListener('click', (event) => { if (event.target === $('mb-settings-modal')) closeModal('mb-settings-modal'); });
        $('mb-theme').addEventListener('change', (event) => { preferences.theme = event.target.value; savePreferences(); applyPreferences(); });
        $('mb-paper-font').addEventListener('change', (event) => { preferences.paperFont = event.target.value; savePreferences(); applyPreferences(); });
        $('mb-font-upload').addEventListener('click', () => $('mb-font-file').click());
        $('mb-font-file').addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) await uploadRoleFont(file);
        });

        /* 最近删除 */
        const trash = $('mb-trash');
        trash.querySelector('.mailbox-trash-close').addEventListener('click', closeTrash);
        trash.addEventListener('click', (event) => {
            if (event.target === trash) { closeTrash(); return; }
            const restore = event.target.closest('[data-restore]');
            if (!restore || restore.disabled) return;
            restore.disabled = true;
            restore.textContent = '恢复中';
            try { restoreLetter(restore.dataset.restore); } catch (e) { restore.disabled = false; restore.textContent = '恢复'; }
        });
        trash.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeTrash(); } });

        /* 全局 Esc 关弹窗 */
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!screenActive()) return;
            for (const id of ['mb-write-modal', 'mb-reply-modal', 'mb-settings-modal']) {
                const el = $(id);
                if (el && el.classList.contains('open')) {
                    el.classList.remove('open');
                    if (id === 'mb-reply-modal') Reader.resume();
                }
            }
        });

        if (root) root.addEventListener('pointerdown', () => { /* 占位，保留事件顺序稳定 */ }, { passive: true });
    }

    /* ===== 挂载 / 入口 ===== */
    function mount() {
        const root = screenEl();
        if (!root || view.mounted) return;
        root.innerHTML = shellHtml();
        view.mounted = true;
        applyPreferences();
        Reader.init();
        bindShell();
        loadRoles();
        ensureSeed();
        const seeded = seedDemoLetters();
        normalizeLetters();
        renderLists(false);
        setAuto(view.auto);
        if (seeded) toast('已放入 5 封示例信，点开看看');
    }

    function render() {
        const root = screenEl();
        if (!root) return;
        if (!view.mounted) mount();
        else refresh(true);
        startAuto();
    }

    window.Mailbox = {
        render,
        openLetter: (id) => {
            const letter = letters().find((l) => String(l.id) === String(id));
            if (letter) openLetter(letter, null);
        },
        closeStage: () => Reader.close(true),
        get folder() { return view.folder; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (screenEl() && screenEl().classList.contains('active')) render(); });
    }
})();
