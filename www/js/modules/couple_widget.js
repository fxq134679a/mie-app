/* 桌面小组件数据源：把「TA此刻」排成一整天，连同「在一起多久」的起点和两张头像，
   压成一份快照推给原生壳。文案只从角色自己写好的状态库里挑，一次 API 都不调。 */
(function () {
    'use strict';

    const SLOTS = 8;                       // 一次往后排几条
    const STEP_MS = 3 * 3600 * 1000;       // 条目间隔：3 小时
    const AVATAR_PX = 128;

    const cfg = () => Object.assign(
        { on: false, charId: '', since: '', syncedAt: 0 },
        (typeof db !== 'undefined' && db.coupleWidget) || {}
    );

    const DEFAULT_ME_AVATAR = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    function persona() {
        if (typeof db === 'undefined') return null;
        const list = db.myPersonaPresets || [];
        const hit = db.activePersonaId ? list.find(p => p && p.id === db.activePersonaId) : null;
        return hit || list[0] || null;
    }

    const findChar = id => ((typeof db !== 'undefined' && db.characters) || []).find(c => c && c.id === id) || null;

    const taName = c => c ? (((c.remarkName && c.remarkName.trim()) || c.realName || c.name) || '') : '';
    /* 导入角色时没填「我叫什么」会留下 user 这个占位，不能印到桌面上 */
    const myNameOf = c => {
        const p = persona();
        const fromChar = c && ((c.myRemarkName && c.myRemarkName.trim()) || c.myName);
        return (fromChar && fromChar !== 'user') ? fromChar : ((p && p.name) || '我');
    };

    function sinceMs(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return 0;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }

    /* 文案来源：最近写进状态栏的历史 → 都没有就留空 */
    function dayLines(char) {
        if (!char) return [];
        const seen = [];
        ((char.statusPanel || {}).history || []).forEach(h => {
            const t = String((h && h.raw) || '').replace(/<[^>]*>/g, '').trim();
            if (t && seen.indexOf(t) < 0) seen.push(t);
        });
        return seen;
    }

    function shuffled(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /* dataURL 头像在网页里先缩到 128 方图再交出去，免得几 MB 的底图过桥 */
    function shrinkDataUrl(dataUrl) {
        return new Promise(resolve => {
            const im = new Image();
            im.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = AVATAR_PX; cv.height = AVATAR_PX;
                    const side = Math.min(im.width, im.height) || AVATAR_PX;
                    cv.getContext('2d').drawImage(
                        im, (im.width - side) / 2, (im.height - side) / 2, side, side,
                        0, 0, AVATAR_PX, AVATAR_PX
                    );
                    resolve(String(cv.toDataURL('image/jpeg', 0.85)).split(',')[1] || '');
                } catch (e) { resolve(''); }
            };
            im.onerror = () => resolve('');
            im.src = dataUrl;
        });
    }

    /* 头像四种：本地底图转 base64 / 网络图交给自己去下 / 只是个表情 / 什么都没有 */
    function avatarOut(src) {
        const s = String(src || '');
        if (s.startsWith('data:image')) return { kind: 'wait', value: s };
        if (/^https?:\/\//i.test(s)) return { kind: 'url', value: s };
        return s ? { kind: 'text', value: s.slice(0, 2) } : { kind: 'none', value: '' };
    }

    async function avatarFinal(src) {
        const a = avatarOut(src);
        if (a.kind !== 'wait') return a;
        const b64 = await shrinkDataUrl(a.value);
        return b64 ? { kind: 'b64', value: b64 } : { kind: 'none', value: '' };
    }

    async function build() {
        const c = cfg();
        const char = findChar(c.charId);
        const lines = shuffled(dayLines(char));
        const offset = lines.length ? Math.floor(Math.random() * lines.length) : 0;
        const now = Date.now();

        const slots = [];
        for (let i = 0; i < SLOTS; i++) {
            slots.push({
                at: now + i * STEP_MS,
                text: lines.length ? lines[(offset + i) % lines.length] : ''
            });
        }

        const p = persona();
        const myFace = (char && char.myAvatar) || (p && p.avatar) || DEFAULT_ME_AVATAR;

        return {
            on: !!c.on && !!char,
            charId: c.charId || '',
            taName: taName(char),
            myName: myNameOf(char),
            sinceMs: sinceMs(c.since),
            slots,
            taAvatar: await avatarFinal(char && char.avatar),
            myAvatar: await avatarFinal(myFace),
            updatedAt: now
        };
    }

    function plugin() {
        const Cap = window.Capacitor;
        if (Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform()) {
            const cp = (Cap.Plugins || {}).CoupleWidget;
            if (cp && typeof cp.write === 'function') return { kind: 'cap', write: (payload) => cp.write({ payload }) };
        }
        const ON = window.OctoNative;
        if (ON && typeof ON.widgetWrite === 'function') {
            return { kind: 'octo', write: (payload) => Promise.resolve(ON.widgetWrite({ payload })) };
        }
        if (ON && typeof ON.coupleWidgetWrite === 'function') {
            return { kind: 'octo', write: (payload) => Promise.resolve(ON.coupleWidgetWrite({ payload })) };
        }
        return null;
    }

    let pending = null;
    async function syncNow() {
        if (pending) return pending;
        pending = (async () => {
            try {
                const snap = await build();
                if (typeof db !== 'undefined' && db.coupleWidget) {
                    db.coupleWidget.syncedAt = snap.updatedAt;
                    try { await saveData(); } catch (e) { /* 存储失败不影响推给桌面 */ }
                }
                const p = plugin();
                if (p) {
                    try { await p.write(JSON.stringify(snap)); }
                    catch (e) { console.warn('[CoupleWidget] write failed:', e); }
                } else {
                    // 壳既没 Capacitor CoupleWidget 插件也没 OctoNative 桥
                    // 不要硬报错，boot 时可能壳还没注入桥
                    console.warn('[CoupleWidget] 原生桥未就绪，数据暂存 localStorage');
                }
                return snap;
            } finally {
                pending = null;
            }
        })();
        return pending;
    }

    async function save(patch) {
        db.coupleWidget = Object.assign({ on: false, charId: '', since: '', syncedAt: 0 }, db.coupleWidget || {}, patch || {});
        try { await saveData(); } catch (e) { /* ignore */ }
        const snap = await syncNow();
        if (patch && patch.on !== undefined && typeof showToast === 'function') {
            showToast(snap.on ? '已同步到桌面' : '已停止同步桌面');
        }
        return snap;
    }

    function boot() {
        const c = cfg();
        if (c.on && c.charId) syncNow();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && cfg().on && cfg().charId) syncNow();
        });
    }

    window.CoupleWidget = { boot, save, syncNow, build, cfg };
})();
