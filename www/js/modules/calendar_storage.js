// 日历存储层 (js/modules/calendar_storage.js)
// 使用 localStorage 存储日程计划和配置

const CAL_PLANS_KEY = "mie_calendar_plans_v1";
const CAL_CONFIG_KEY = "mie_calendar_config_v1";
const CAL_CSS_KEY = "mie_calendar_custom_css_v1";

const CAL_THEME_IDS = ["light", "dark", "cream", "mint", "mist", "sakura"];
const CAL_DAYS_OPTIONS = [1, 2, 3, 5, 7];

const CAL_DEFAULT_CONFIG = {
    theme: "light",
    daysPerPage: 2,
    customCss: "",
};

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
        if (!CAL_THEME_IDS.includes(parsed.theme)) parsed.theme = CAL_DEFAULT_CONFIG.theme;
        if (!CAL_DAYS_OPTIONS.includes(parsed.daysPerPage)) parsed.daysPerPage = CAL_DEFAULT_CONFIG.daysPerPage;
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
