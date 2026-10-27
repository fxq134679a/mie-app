// 日历工具函数 (js/modules/calendar_utils.js)

const CAL_WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const CAL_COLOR_KEYS = ["blue", "green", "amber", "rose", "violet", "teal", "slate", "lilac"];

const CAL_EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/u;

function calFormatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function calParseIsoDate(dateText) {
    return new Date(`${dateText}T00:00:00`);
}

function calStartOfWeek(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

function calGetWeekStartIso(date) {
    return calFormatIsoDate(calStartOfWeek(date));
}

function calGetWeekDates(weekStart) {
    const base = calParseIsoDate(weekStart);
    return Array.from({ length: 7 }, (_, idx) => {
        const current = new Date(base);
        current.setDate(base.getDate() + idx);
        return calFormatIsoDate(current);
    });
}

function calGetWeekdayLabel(dateOrIso) {
    const date = typeof dateOrIso === "string" ? calParseIsoDate(dateOrIso) : dateOrIso;
    return CAL_WEEKDAY_LABELS[date.getDay()];
}

function calTimeToMinutes(value) {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return hours * 60 + minutes;
}

function calNormalizeTime(value) {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function calIsTimeRangeAllowed(startTime, endTime) {
    const start = calTimeToMinutes(startTime);
    const end = calTimeToMinutes(endTime);
    return !Number.isNaN(start) && !Number.isNaN(end) && start < end;
}

function calPickColorKey(startTime) {
    const minutes = calTimeToMinutes(startTime);
    if (Number.isNaN(minutes)) return "slate";
    if (minutes < 9 * 60) return "teal";
    if (minutes < 12 * 60) return "blue";
    if (minutes < 15 * 60) return "green";
    if (minutes < 18 * 60) return "amber";
    if (minutes < 21 * 60) return "violet";
    return "rose";
}

function calSanitizeEmoji(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed || trimmed === "无") return "";
    const match = trimmed.match(CAL_EMOJI_RE);
    return match ? match[0] : "";
}

function calSortItems(items) {
    return [...items].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
        return a.title.localeCompare(b.title);
    });
}

function calFormatWeekRange(weekStart) {
    const dates = calGetWeekDates(weekStart);
    const start = calParseIsoDate(dates[0]);
    const end = calParseIsoDate(dates[6]);
    return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`;
}

function calAddDays(iso, n) {
    const d = calParseIsoDate(iso);
    return calFormatIsoDate(new Date(d.getTime() + n * 86400000));
}

function calGenerateId() {
    return `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calBuildItemsByDate(items) {
    const map = new Map();
    for (const item of items) {
        if (!map.has(item.date)) map.set(item.date, []);
        map.get(item.date).push(item);
    }
    for (const [, arr] of map) {
        arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
}

function calLayoutDayEvents(items) {
    const sorted = items
        .map(item => ({
            item,
            start: calTimeToMinutes(item.startTime),
            end: Math.max(calTimeToMinutes(item.endTime), calTimeToMinutes(item.startTime) + 25),
        }))
        .filter(e => !Number.isNaN(e.start) && !Number.isNaN(e.end))
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const results = [];
    let clusterMaxEnd = -1;
    let columnEnds = [];
    let clusterEntries = [];

    const flush = () => {
        const columnCount = Math.max(columnEnds.length, 1);
        for (const { entry, column } of clusterEntries) {
            results.push({
                item: entry.item,
                top: (entry.start / 60) * 48,
                height: Math.max(((entry.end - entry.start) / 60) * 48 - 2, 20),
                left: (column / columnCount) * 100,
                width: 100 / columnCount,
            });
        }
        columnEnds = [];
        clusterEntries = [];
    };

    for (const entry of sorted) {
        if (clusterEntries.length > 0 && entry.start >= clusterMaxEnd) {
            flush();
            clusterMaxEnd = -1;
        }
        let column = columnEnds.findIndex(end => end <= entry.start);
        if (column === -1) {
            column = columnEnds.length;
            columnEnds.push(entry.end);
        } else {
            columnEnds[column] = entry.end;
        }
        clusterEntries.push({ entry, column });
        clusterMaxEnd = Math.max(clusterMaxEnd, entry.end);
    }
    flush();
    return results;
}
