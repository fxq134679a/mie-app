// 日历存储层 (js/modules/calendar_storage.js)
// 使用 localStorage 存储日程计划和配置

const CAL_PLANS_KEY = "mie_calendar_plans_v1";
const CAL_CONFIG_KEY = "mie_calendar_config_v1";
const CAL_CSS_KEY = "mie_calendar_custom_css_v1";
const CAL_EXTRAS_KEY = "mie_calendar_extras_v1"; // 便签 / 贴纸 / 已读标记

const CAL_THEME_IDS = ["light", "dark", "cream", "mint", "mist", "sakura"];
const CAL_DAYS_OPTIONS = [1, 2];
// 日程类型（编辑器可标纪念日 / 生日 / 生理期）
const CAL_EVENT_TYPES = ["", "anniversary", "birthday", "period"];
const CAL_EVENT_TYPE_LABELS = { "": "普通", anniversary: "纪念日", birthday: "生日", period: "生理期" };

const CAL_DEFAULT_CONFIG = {
    theme: "light",
    daysPerPage: 1,
    customCss: "",
    autoGenerateEnabled: false,
    autoGenerateRange: "week", // week=本周剩余 | 7 | 14
    autoNotesEnabled: true,     // 聊天自动记事（写共享日历）
    changeNotifyEnabled: true,  // AI 改动日期后的提醒
    festivalColor: "#E9575A",
    festivalTextColor: "#E9575A",
    festivalPillColor: "#E9575A",
    festivalIcon: "★",
    festivalIconImage: "",
};

const CAL_FESTIVAL_COLORS = ["#E9575A", "#E8788C", "#E88B3A", "#C9930E", "#3FA564", "#2E9E97", "#3B7FE0", "#8B6BD9", "#8A8A8A"];
const CAL_FESTIVAL_ICONS = ["★", "✦", "♥", "❄", "✿", "◉"];

function calLoadStore() {
    try {
        const raw = localStorage.getItem(CAL_PLANS_KEY);
        if (!raw) return { plans: [] };
        const parsed = JSON.parse(raw);
        return { plans: Array.isArray(parsed.plans) ? parsed.plans : [] };
    } catch {
        return { plans: [] };
    }
}

function calSaveStore(store) {
    localStorage.setItem(CAL_PLANS_KEY, JSON.stringify(store));
}

function calLoadConfig() {
    try {
        const raw = localStorage.getItem(CAL_CONFIG_KEY);
        if (!raw) return { ...CAL_DEFAULT_CONFIG };
        const parsed = { ...CAL_DEFAULT_CONFIG, ...JSON.parse(raw) };
        delete parsed.themeMode; // 手帐风主题已移除，清掉旧配置残留
        if (!CAL_THEME_IDS.includes(parsed.theme)) parsed.theme = CAL_DEFAULT_CONFIG.theme;
        if (!CAL_DAYS_OPTIONS.includes(parsed.daysPerPage)) parsed.daysPerPage = CAL_DEFAULT_CONFIG.daysPerPage;
        if (!["week", "7", "14"].includes(parsed.autoGenerateRange)) parsed.autoGenerateRange = "week";
        return parsed;
    } catch {
        return { ...CAL_DEFAULT_CONFIG };
    }
}

function calSaveConfig(config) {
    localStorage.setItem(CAL_CONFIG_KEY, JSON.stringify(config));
}

function calLoadCustomCss() {
    return localStorage.getItem(CAL_CSS_KEY) || "";
}

function calSaveCustomCss(css) {
    localStorage.setItem(CAL_CSS_KEY, css);
}

function calLoadWeekPlan(ownerType, ownerId, weekStart) {
    const store = calLoadStore();
    const plan = store.plans.find(
        p => p.ownerType === ownerType && p.ownerId === ownerId && p.weekStart === weekStart
    );
    if (!plan) return null;
    return {
        ...plan,
        items: calSortItems((plan.items || [])
            .filter(item => calIsTimeRangeAllowed(item.startTime, item.endTime))
            .map(item => ({
                ...item,
                weekday: item.weekday || calGetWeekdayLabel(item.date),
                colorKey: item.colorKey || calPickColorKey(item.startTime),
            }))),
    };
}

function calSaveWeekPlan(plan) {
    const store = calLoadStore();
    const normalized = {
        ...plan,
        updatedAt: new Date().toISOString(),
        items: calSortItems(plan.items.map(item => ({
            ...item,
            weekday: item.weekday || calGetWeekdayLabel(item.date),
            colorKey: item.colorKey || calPickColorKey(item.startTime),
        }))),
    };
    const nextPlans = store.plans.filter(
        p => !(p.ownerType === plan.ownerType && p.ownerId === plan.ownerId && p.weekStart === plan.weekStart)
    );
    nextPlans.push(normalized);
    calSaveStore({ plans: nextPlans });
    return normalized;
}

function calReplaceWeekItems(ownerType, ownerId, weekStart, items) {
    const existing = calLoadWeekPlan(ownerType, ownerId, weekStart);
    const plan = {
        id: existing?.id ?? `calweek_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ownerType,
        ownerId,
        weekStart,
        items,
        updatedAt: new Date().toISOString(),
    };
    return calSaveWeekPlan(plan);
}

function calUpsertItem(ownerType, ownerId, weekStart, item) {
    const plan = calLoadWeekPlan(ownerType, ownerId, weekStart);
    const existingItems = plan?.items ?? [];
    const now = new Date().toISOString();
    const normalized = {
        id: item.id ?? calGenerateId(),
        date: item.date,
        weekday: item.weekday || calGetWeekdayLabel(item.date),
        startTime: item.startTime,
        endTime: item.endTime,
        location: (item.location || "").trim(),
        title: (item.title || "").trim(),
        emoji: calSanitizeEmoji(item.emoji),
        colorKey: item.colorKey || calPickColorKey(item.startTime),
        source: item.source || "manual",
        type: CAL_EVENT_TYPES.includes(item.type) ? item.type : "",
        yearly: item.yearly === true,
        createdAt: item.createdAt ?? now,
        updatedAt: now,
    };
    const nextItems = existingItems.filter(e => e.id !== normalized.id);
    nextItems.push(normalized);
    return calReplaceWeekItems(ownerType, ownerId, weekStart, nextItems);
}

function calDeleteItem(ownerType, ownerId, weekStart, itemId) {
    const plan = calLoadWeekPlan(ownerType, ownerId, weekStart);
    return calReplaceWeekItems(ownerType, ownerId, weekStart, (plan?.items ?? []).filter(item => item.id !== itemId));
}

function calClearGeneratedItems(ownerType, ownerId, weekStart) {
    const existing = calLoadWeekPlan(ownerType, ownerId, weekStart);
    const items = existing?.items ?? [];
    const removed = items.filter(item => item.source !== "manual");
    if (removed.length === 0) return [];
    calReplaceWeekItems(ownerType, ownerId, weekStart, items.filter(item => item.source === "manual"));
    return removed;
}

function calRestoreWeekItems(ownerType, ownerId, weekStart, itemsToRestore) {
    if (itemsToRestore.length === 0) return;
    const existing = calLoadWeekPlan(ownerType, ownerId, weekStart);
    calReplaceWeekItems(ownerType, ownerId, weekStart, calSortItems([
        ...(existing?.items ?? []),
        ...itemsToRestore,
    ]));
}

function calCloneWithManualEdits(ownerType, ownerId, weekStart, generatedItems) {
    const existing = calLoadWeekPlan(ownerType, ownerId, weekStart);
    const manualItems = (existing?.items ?? []).filter(item => item.source === "manual");
    const nextItems = [...generatedItems.filter(item => item.source !== "manual")];
    for (const item of manualItems) {
        const collides = nextItems.find(
            e => e.date === item.date && e.startTime === item.startTime &&
                 e.endTime === item.endTime && e.title === item.title
        );
        if (!collides) nextItems.push(item);
    }
    return calReplaceWeekItems(ownerType, ownerId, weekStart, nextItems);
}

function calNormalizeGeneratedItems(rawItems) {
    const now = new Date().toISOString();
    return calSortItems(
        rawItems
            .map(item => ({
                id: calGenerateId(),
                date: item.date,
                weekday: calGetWeekdayLabel(item.date),
                startTime: calNormalizeTime(item.startTime) || item.startTime,
                endTime: calNormalizeTime(item.endTime) || item.endTime,
                location: (item.location || "").trim(),
                title: (item.title || "").trim(),
                emoji: calSanitizeEmoji(item.emoji),
                colorKey: CAL_COLOR_KEYS.includes(item.colorKey) ? item.colorKey : calPickColorKey(item.startTime),
                source: "generated",
                createdAt: now,
                updatedAt: now,
            }))
            .filter(item => calIsTimeRangeAllowed(item.startTime, item.endTime))
    );
}

function calValidateDraft(item) {
    const start = calNormalizeTime(item.startTime);
    const end = calNormalizeTime(item.endTime);
    if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return "请选择日期";
    if (!start || !end) return "请输入正确的时间格式";
    if (start >= end) return "结束时间需要晚于开始时间";
    if (!item.title.trim()) return "请输入事项";
    return null;
}

// 聚合所有角色/用户的日程（同一本日历展示）
function calGetAllItemsAggregated() {
    const store = calLoadStore();
    const allItems = [];
    for (const plan of store.plans) {
        for (const item of (plan.items || [])) {
            if (!calIsTimeRangeAllowed(item.startTime, item.endTime)) continue;
            allItems.push({
                ...item,
                ownerType: plan.ownerType,
                ownerId: plan.ownerId,
                ownerKey: `${plan.ownerType}:${plan.ownerId}`,
                weekday: item.weekday || calGetWeekdayLabel(item.date),
                colorKey: item.colorKey || calPickColorKey(item.startTime),
            });
        }
    }
    return allItems;
}

function calGetAllItemsForOwner(ownerType, ownerId) {
    const store = calLoadStore();
    const allItems = [];
    for (const plan of store.plans) {
        if (plan.ownerType !== ownerType || plan.ownerId !== ownerId) continue;
        for (const item of (plan.items || [])) {
            if (calIsTimeRangeAllowed(item.startTime, item.endTime)) {
                allItems.push({
                    ...item,
                    weekday: item.weekday || calGetWeekdayLabel(item.date),
                    colorKey: item.colorKey || calPickColorKey(item.startTime),
                });
            }
        }
    }
    return allItems;
}

function calBuildScheduleSummary(ownerType, ownerId, weekStart) {
    const plan = calLoadWeekPlan(ownerType, ownerId, weekStart);
    if (!plan || plan.items.length === 0) return "本周暂无明确日程安排。";
    const grouped = new Map();
    for (const item of plan.items) {
        if (!grouped.has(item.date)) grouped.set(item.date, []);
        grouped.get(item.date).push(item);
    }
    return calGetWeekDates(weekStart).map(date => {
        const items = calSortItems(grouped.get(date) || []);
        if (items.length === 0) return `${date} ${calGetWeekdayLabel(date)}：暂无明确安排`;
        const summary = items.map(i => `${i.startTime}-${i.endTime} @${i.location || "未定"} ${i.title}`).join("；");
        return `${date} ${calGetWeekdayLabel(date)}：${summary}`;
    }).join("\n");
}

// 供聊天提示词使用：把日历渲染成 <calendar> 块
// 对齐仓库的三段注入：[NOW] 此刻正在进行的 / [TODAY] 今天其余 / [NEW] 新出现还没说过的
const CAL_AI_NEW_SEEN_KEY = "mie_calendar_ai_new_seen_v1";

function calTimeToMinutes(hhmm) {
    const [h, m] = String(hhmm || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}

function calLoadAiNewSeen() {
    try {
        const raw = localStorage.getItem(CAL_AI_NEW_SEEN_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function calSaveAiNewSeen(ids) {
    localStorage.setItem(CAL_AI_NEW_SEEN_KEY, JSON.stringify(ids.slice(-200)));
}

function calBuildChatPlanContext(characterId) {
    const today = new Date();
    const todayIso = calFormatIsoDate(today);
    const nowMin = today.getHours() * 60 + today.getMinutes();

    const charItems = characterId ? calGetAllItemsForOwner("character", characterId) : [];
    const userItems = calGetAllItemsAggregated().filter(i => i.ownerType !== "character");
    const all = [...charItems, ...userItems].filter(i => calIsTimeRangeAllowed(i.startTime, i.endTime));

    const nameOf = (it) => (it.ownerType === "character"
        ? (typeof calOwnerNameOf === "function" ? calOwnerNameOf(it) : "角色")
        : "USER");
    const fmt = (it) => `${it.startTime}–${it.endTime} ${it.title}（${nameOf(it)}）`;
    const isAllDay = (it) => it.startTime === "00:00" && it.endTime >= "23:59";

    const todayList = calSortItems(all.filter(i => i.date === todayIso));
    const nowItems = todayList.filter(i => !isAllDay(i)
        && calTimeToMinutes(i.startTime) <= nowMin && nowMin < calTimeToMinutes(i.endTime));
    const restItems = todayList.filter(i => !nowItems.includes(i) && calTimeToMinutes(i.endTime) > nowMin);

    // [NEW]：未来 7 天里 AI 自己记上的、还没注入过的（一条只说一次）
    const horizon = calAddDays(todayIso, 7);
    const seen = new Set(calLoadAiNewSeen());
    const news = calSortItems(all.filter(i => i.date >= todayIso && i.date <= horizon
        && (i.source === "auto" || i.source === "generated") && !seen.has(i.id))).slice(0, 6);

    if (!nowItems.length && !restItems.length && !news.length) return "";

    const lines = [];
    if (nowItems.length) lines.push(`[NOW] ${nowItems.map(fmt).join("；")}`);
    if (restItems.length) lines.push(`[TODAY] ${restItems.map(fmt).join("；")}`);
    if (news.length) {
        lines.push(`[NEW] ${news.map(it => {
            const d = calParseIsoDate(it.date);
            return `${d.getMonth() + 1}/${d.getDate()} ${fmt(it)}`;
        }).join("；")}`);
    }

    if (news.length) {
        calSaveAiNewSeen([...seen, ...news.map(i => i.id)]);
    }

    return `<calendar>\n${lines.join("\n")}\n</calendar>\n` +
        `（这是此刻日历上的安排：正在进行的时段要符合当时的日程，可以自然提起或被问起。）`;
}

// ═══════════════════════════════════════════════════════════
//  共用数据层：AUTO 记事 / 便签 / 贴纸 / 已读标记
// ═══════════════════════════════════════════════════════════

function calLoadExtras() {
    try {
        const raw = localStorage.getItem(CAL_EXTRAS_KEY);
        if (!raw) return { notes: [], stickers: [], unseen: [] };
        const parsed = JSON.parse(raw);
        return {
            notes: Array.isArray(parsed.notes) ? parsed.notes : [],
            stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
            unseen: Array.isArray(parsed.unseen) ? parsed.unseen : [],
        };
    } catch {
        return { notes: [], stickers: [], unseen: [] };
    }
}

function calSaveExtras(extras) {
    localStorage.setItem(CAL_EXTRAS_KEY, JSON.stringify(extras));
}

// AUTO 自动记事：写进主计划表（source="auto"），两个主题都会显示
function calAddAutoEvent({ date, title, startTime = "09:00", endTime = "10:00", location = "", ownerType = "user", ownerId = "me", messageId = "" }) {
    const cleanTitle = (title || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !cleanTitle) return null;
    if (!calIsTimeRangeAllowed(startTime, endTime)) return null;

    const weekStart = calGetWeekStartIso(calParseIsoDate(date));
    const existing = calLoadWeekPlan(ownerType, ownerId, weekStart);
    const dup = (existing?.items || []).some(it =>
        it.date === date && (it.title || "").trim() === cleanTitle
    );
    if (dup) return null;

    const plan = calUpsertItem(ownerType, ownerId, weekStart, {
        date, title: cleanTitle, startTime, endTime, location,
        emoji: "", colorKey: "slate", source: "auto", messageId,
    });
    if (typeof calMarkDayChanged === "function") calMarkDayChanged(date);
    return plan;
}

// 便签：{ id, date, text, x, y, rotation, ownerType, ownerId, eventId, liked, createdAt }
function calListNotes(date) {
    return calLoadExtras().notes.filter(n => !date || n.date === date);
}

function calAddNote(note) {
    const extras = calLoadExtras();
    const normalized = {
        id: note.id || calGenerateId(),
        date: note.date,
        text: (note.text || "").trim(),
        x: Number(note.x) || 0,
        y: Number(note.y) || 0,
        rotation: Number(note.rotation) || 0,
        ownerType: note.ownerType || "user",
        ownerId: note.ownerId || "me",
        eventId: note.eventId || "",
        liked: !!note.liked,
        createdAt: new Date().toISOString(),
    };
    extras.notes.push(normalized);
    calSaveExtras(extras);
    return normalized;
}

function calUpdateNote(id, patch) {
    const extras = calLoadExtras();
    const note = extras.notes.find(n => n.id === id);
    if (!note) return null;
    Object.assign(note, patch);
    calSaveExtras(extras);
    return note;
}

function calDeleteNote(id) {
    const extras = calLoadExtras();
    extras.notes = extras.notes.filter(n => n.id !== id);
    calSaveExtras(extras);
}

// 贴纸：{ id, date, asset, image, x, y, scale, rotation, z }
function calListStickers(date) {
    return calLoadExtras().stickers.filter(s => !date || s.date === date);
}

function calAddSticker(sticker) {
    const extras = calLoadExtras();
    const normalized = {
        id: sticker.id || calGenerateId(),
        date: sticker.date,
        asset: sticker.asset || "",
        image: sticker.image || "",
        x: Number(sticker.x) || 0,
        y: Number(sticker.y) || 0,
        scale: Number(sticker.scale) || 1,
        rotation: Number(sticker.rotation) || 0,
        z: extras.stickers.length + 1,
        createdAt: new Date().toISOString(),
    };
    extras.stickers.push(normalized);
    calSaveExtras(extras);
    return normalized;
}

function calUpdateSticker(id, patch) {
    const extras = calLoadExtras();
    const sticker = extras.stickers.find(s => s.id === id);
    if (!sticker) return null;
    Object.assign(sticker, patch);
    calSaveExtras(extras);
    return sticker;
}

function calDeleteSticker(id) {
    const extras = calLoadExtras();
    extras.stickers = extras.stickers.filter(s => s.id !== id);
    calSaveExtras(extras);
}

// 已读标记：AI 改过的、用户还没看过的日期
function calGetUnseenDays() {
    return calLoadExtras().unseen;
}

function calMarkDayChanged(date) {
    const extras = calLoadExtras();
    if (!extras.unseen.includes(date)) {
        extras.unseen.push(date);
        calSaveExtras(extras);
    }
}

function calMarkDaySeen(date) {
    const extras = calLoadExtras();
    extras.unseen = extras.unseen.filter(d => d !== date);
    calSaveExtras(extras);
}
