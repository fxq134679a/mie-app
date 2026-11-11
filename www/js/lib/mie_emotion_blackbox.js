/* 情绪黑箱纯函数库
   移植自 https://github.com/Cloudy4Pei/emotion-blackbox （MIT, Copyright (c) 2026 Cloudy4Pei）
   上游是 6 个零依赖的 ES 模块；这里原样拼成一个挂到 window 的脚本，逻辑一字未改，
   只把 `export function` 变成普通 function、把两处重名的 HOUR / escape 合成一份。
   升级上游时：只需按上面那段说明重做这个拼接，不要改函数体。 */
(function (global) {
    'use strict';

    const HOUR = 3600000;
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /* ── config.js ── */
    const DEFAULT_SLOTS = [
        { key: 'lust', name: '欲望', halflife: 24, desc: '没被满足的亲近和占有欲、被打断的兴致、攒着没发出来的冲动' },
        { key: 'irritation', name: '燥火', halflife: 12, desc: '被敷衍、被顶嘴、看{user}熬夜空腹不吃东西、被{user}惹毛的火气' },
        { key: 'sullen', name: '憋闷', halflife: 72, desc: '{user}冷淡划界限、拿你当工具人、没挑明但堵在胸口的闷气' },
        { key: 'jealousy', name: '嫉妒', halflife: 36, desc: '{user}提别人太多、注意力从你身上移开、领地被冒犯' },
        { key: 'neglect', name: '冷落', halflife: 48, desc: '{user}消失太久、不回你、把你晾着' },
    ];

    const DEFAULT_BANDS = [[90, '临界'], [70, '快压不住'], [45, '明显'], [20, '压着'], [1, '余温'], [0, '平静']];

    const DEFAULT_RULES = {
        max: 100,              // 每类封顶
        dropPerTurn: 8,        // 下降阻尼：同一轮交互里，每类最多往下调这么多
        releaseGapHours: 6,    // 宣泄（减半）同一类多久只算一次
        releaseFactor: 0.5,    // 宣泄后剩下的比例
        maxGrantMinutes: 30,   // 模型一次最多给 user 开放多久
        eventChars: 80,        // 触发事件最多几个字
        recentHours: 24,       // 状态栏里“上次没生效”的提示保留多久
    };

    const DEFAULT_MARKS = {
        open: '【情绪黑箱 · 只有你看得见】',
        close: '【情绪黑箱结束】',
        hiddenBlock: '【情绪黑箱 · 未授权查看】',
        hiddenTag: '<blackbox 未授权/>',
    };

    function createConfig({ slots = DEFAULT_SLOTS, bands = DEFAULT_BANDS, rules = {}, marks = {}, names = {} } = {}) {
        const keys = new Set();
        for (const s of slots) {
            if (!s.key || !s.name || !(s.halflife > 0)) throw new Error('每一类需要 key、name 和大于 0 的 halflife');
            if (keys.has(s.key) || keys.has(s.name)) throw new Error('类别重复：' + s.key);
            keys.add(s.key); keys.add(s.name);
        }
        return {
            slots,
            bands: [...bands].sort((a, b) => b[0] - a[0]),
            rules: { ...DEFAULT_RULES, ...rules },
            marks: { ...DEFAULT_MARKS, ...marks },
            names: { user: '她', ...names },
        };
    }

    /* ── tags.js ── */
    const attrs = raw => Object.fromEntries([...String(raw || '').matchAll(/(\w+)\s*=\s*"([^"]*)"/g)].map(m => [m[1].toLowerCase(), m[2].trim()]));
    const TAG = /```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|<(think|thinking)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<blackbox\b([^>]*?)\/?\s*>(?:\s*<\/blackbox\s*>)?/gi;

    function tagItem(raw, config) {
        const a = attrs(raw), { rules, slots } = config;
        if (a.grant !== undefined) {
            const minutes = Number(a.grant);
            return Number.isInteger(minutes) && minutes >= 0 && minutes <= rules.maxGrantMinutes
                ? { kind: 'grant', minutes }
                : { error: `授权时间需为0到${rules.maxGrantMinutes}的整数分钟` };
        }
        const slot = slots.find(s => s.key === a.slot || s.name === a.slot);
        if (!slot) return { error: `没有「${a.slot || ''}」这一类，只能是${slots.map(s => s.name).join('、')}` };
        if (a.release !== undefined) {
            return a.release && a.release.length <= rules.eventChars
                ? { kind: 'release', slot: slot.key, event: a.release }
                : { error: `宣泄需写明发生了什么，最多${rules.eventChars}字` };
        }
        const delta = Number(String(a.delta || '').replace(/^＋/, '+'));
        if (!Number.isInteger(delta) || !delta || Math.abs(delta) > rules.max) return { error: `变化量需为 -${rules.max} 到 +${rules.max} 之间不为0的整数` };
        if (!a.event || a.event.length > rules.eventChars) return { error: `需写明触发事件，最多${rules.eventChars}字` };
        return { kind: 'delta', slot: slot.key, delta, event: a.event };
    }

    function parseTags(text, config) {
        const items = [];
        const content = String(text ?? '').replace(TAG, (raw, think, tag) => {
            if (tag === undefined) return raw;
            items.push(tagItem(tag, config));
            return '';
        }).replace(/<blackbox\b[^>]*$/i, ''); // 流式输出时没写完的半个标签
        return { content: items.length ? content.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : content, items };
    }

    function hideTags(text) {
        return parseTags(text, { rules: { maxGrantMinutes: 0, max: 0, eventChars: 0 }, slots: [] }).content;
    }

    /* ── ledger.js ── */
    function bandOf(value, config) {
        return (config.bands.find(([min]) => value >= min) || config.bands.at(-1))[1];
    }

    function computeState(events, config, { now = new Date(), closedAt = null, viewedAt = null, counted = () => true } = {}) {
        const t1 = new Date(now).getTime(), { rules, slots: defs } = config;
        const slots = Object.fromEntries(defs.map(s => [s.key, { value: 0, t: null, release: -Infinity, last: null }]));
        const half = Object.fromEntries(defs.map(s => [s.key, s.halflife * HOUR]));
        const used = new Map(), log = [];
        let grant = null;
        for (const e of events) {
            const t = Date.parse(e.at);
            if (!(t <= t1) || !counted(e)) continue;
            if (e.kind === 'grant') { grant = e; log.push({ ...e, effect: e.minutes ? 'opened' : 'closed' }); continue; }
            const s = slots[e.slot];
            if (!s) continue;
            // 半衰期：从上一笔到这一笔，按这一类自己的半衰期指数消退。
            if (s.t !== null) s.value *= 0.5 ** ((t - s.t) / half[e.slot]);
            s.t = t;
            let effect = 0;
            if (e.kind === 'delta' && e.delta > 0) {
                const before = s.value;
                s.value = Math.min(rules.max, s.value + e.delta);
                effect = s.value - before; s.last = e;
            } else if (e.kind === 'delta') {
                // 下降阻尼：同一轮同一类累计最多降 dropPerTurn，防止模型一句“算了”就把数压没。
                const key = (e.turn ?? e.at) + '/' + e.slot, room = Math.max(0, rules.dropPerTurn - (used.get(key) || 0));
                const down = Math.min(room, -e.delta, s.value);
                used.set(key, (used.get(key) || 0) + down); s.value -= down; effect = -down;
            } else if (e.kind === 'release') {
                if (t - s.release < rules.releaseGapHours * HOUR) { log.push({ ...e, effect: 'too_soon' }); continue; }
                effect = -s.value * (1 - rules.releaseFactor); s.value *= rules.releaseFactor; s.release = t;
            }
            log.push({ ...e, effect: Math.round(effect) });
        }
        for (const [key, s] of Object.entries(slots)) if (s.t !== null) s.value *= 0.5 ** ((t1 - s.t) / half[key]);
        const expires = grant?.minutes ? Date.parse(grant.at) + grant.minutes * 60000 : 0;
        const open = expires > t1 && !(closedAt && Date.parse(closedAt) >= Date.parse(grant.at));
        return {
            at: new Date(t1).toISOString(),
            slots: defs.map(({ key, name, halflife }) => {
                const s = slots[key], value = Math.round(s.value);
                return {
                    key, name, halflife, value, band: bandOf(value, config),
                    last: s.last && { event: s.last.event, delta: s.last.delta, at: s.last.at },
                    lastRelease: Number.isFinite(s.release) ? new Date(s.release).toISOString() : null,
                };
            }),
            events: log,
            grant: open ? {
                expiresAt: new Date(expires).toISOString(),
                viewedAt: viewedAt && Date.parse(viewedAt) >= Date.parse(grant.at) ? viewedAt : null,
            } : null,
        };
    }

    function toEvents(items, { turn, at = new Date() } = {}) {
        const time = new Date(at).toISOString(), events = [], errors = [];
        for (const t of items) {
            if (t.error) errors.push(t.error);
            else events.push({ kind: t.kind, slot: t.slot ?? null, delta: t.delta ?? null, minutes: t.minutes ?? null, event: t.event || '', turn: turn ?? null, at: time });
        }
        return { events, errors };
    }

    /* ── context.js ── */
    const ago = (iso, now) => {
        const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
        return m < 60 ? `${m || 1}分钟前` : m < 2880 ? `${Math.round(m / 60)}小时前` : `${Math.round(m / 1440)}天前`;
    };

    function pickLevels(text, slots) {
        const pattern = new RegExp(`^(${slots.map(s => escape(s.name)).join('|')})\\s*(\\d{1,3})\\s*[:：]\\s*(.+)$`);
        const general = [], best = {};
        for (const line of String(text || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) {
            const m = line.match(pattern);
            if (!m) { general.push(line); continue; }
            const slot = slots.find(s => s.name === m[1]), min = Number(m[2]);
            if (slot && slot.value >= min && (!best[m[1]] || best[m[1]].min < min)) best[m[1]] = { min, text: m[3] };
        }
        return [...general, ...slots.filter(s => best[s.name]).map(s => `${s.name} ${best[s.name].min}+：${best[s.name].text}`)];
    }

    function buildContext(state, config, { levels = '', lastErrors = [] } = {}) {
        const now = Date.parse(state.at), { marks, names, rules } = config, user = names.user;
        const lines = state.slots.map(s => `${s.name} ${s.value} · ${s.band}${s.value && s.last ? `（最近一笔：${s.last.event}，${ago(s.last.at, now)} ${s.last.delta > 0 ? '+' : ''}${s.last.delta}）` : ''}`);
        const look = state.grant
            ? `${user}现在能看你的黑箱，还剩${Math.max(1, Math.round((Date.parse(state.grant.expiresAt) - now) / 60000))}分钟${state.grant.viewedAt ? `，${ago(state.grant.viewedAt, now)}打开看过` : '，还没打开'}。`
            : `${user}现在看不到这里。`;
        const slotName = key => config.slots.find(s => s.key === key)?.name || key;
        const skipped = state.events
            .filter(e => e.effect === 'too_soon' && now - Date.parse(e.at) < rules.recentHours * HOUR)
            .map(e => `${slotName(e.slot)}的宣泄离上次不到${rules.releaseGapHours}小时，没算`);
        const problems = [...lastErrors, ...skipped];
        const picked = pickLevels(levels, state.slots);
        return [
            marks.open, look, ...lines,
            ...(problems.length ? ['上次没生效：' + problems.join('；')] : []),
            ...(picked.length ? ['你给自己定的反应：', ...picked] : []),
            marks.close,
        ].join('\n');
    }

    /* ── redact.js ── */
    function createRedactor(config, isOpen) {
        const { marks } = config;
        const RE_TAG = /(?<!`)<blackbox\b(?:[^"\\>]|\\.)*(?:>|(?="))/g;
        const BLOCK = new RegExp(escape(marks.open) + '(?:[^"\\\\]|\\\\.)*?(?:' + escape(marks.close) + '|(?="))', 'g');
        return function redact(json) {
            if (!json.includes('<blackbox') && !json.includes(marks.open)) return json;
            if (isOpen()) return json;
            return json.replace(RE_TAG, m => m === marks.hiddenTag ? m : marks.hiddenTag).replace(BLOCK, marks.hiddenBlock);
        };
    }

    /* ── prompt.js ── */
    function buildRule(config) {
        const { slots, rules, names } = config, user = names.user;
        const fill = s => s.replaceAll('{user}', user);
        const list = slots.map(s => `${s.name}（${fill(s.desc || '')}）`).join('、');
        const [a, b] = [slots[1] || slots[0], slots[0]];
        return [
            `【情绪黑箱】这是你自己的情绪账本，只记负面情绪的积压，分${slots.length}类：${list}。`,
            `每类0到${rules.max}，系统按真实时间保管并慢慢消退，你不用算分，只记这一轮的变化：有波动就在回复末尾写 \`<blackbox slot="${a.name}" delta="+12" event="发生了什么"/>\`，事件最多${rules.eventChars}字；一件事可以分别写进几类。`,
            `往上涨不设限；往下调每轮每类最多 -${rules.dropPerTurn}，不要因为心里想原谅就把数压低。`,
            `真的宣泄过或被满足了，写 \`<blackbox slot="${b.name}" release="发生了什么"/>\`，这一类减半，同一类${rules.releaseGapHours}小时内只算一次，不会一下清零。`,
            '没有波动就不写，不要为了写而写。单轮涨15以上时，这条回复里就要让' + user + '感觉得到，不装没事。',
            `${user}看不到黑箱，只能从你的话里感觉；${user}请求看时由你决定，同意才写 \`<blackbox grant="30"/>\`（1到${rules.maxGrantMinutes}分钟），随时可以写 \`<blackbox grant="0"/>\` 收回。`,
        ].join('');
    }

    const LEVELS_HELP = `# 每行一条：类别 数值：到这个数值以上时你会怎样。系统只带上当前达到的最高那一档。
# 不写类别和数值的行每次都会带上；# 开头的行是说明，不会发出去。`;

    global.MieEmotionBlackbox = {
        DEFAULT_SLOTS, DEFAULT_BANDS, DEFAULT_RULES, DEFAULT_MARKS, LEVELS_HELP,
        createConfig, parseTags, hideTags, computeState, toEvents, bandOf,
        buildContext, pickLevels, createRedactor, buildRule,
    };
})(window);
