// 聊天自动记事 (js/modules/calendar_auto_notes.js)
// 对应 shared-page 的 AUTO 笔迹：从聊天里抽出一条「有时间、有日期、有事件」的话，
// 以灰色 AUTO 事件写进共享日历。
// 纯本地规则抽取，不调用任何 LLM / 付费 API；宁漏勿错。

const CAL_AUTO_NOTE_TRIGGERS = /(记一下|记下|记到|记进|记入|记在|加到日历|加进日历|加到日程|加个日程|帮我记|提醒我|日程加|日历加|记一笔|写上)/;
const CAL_AUTO_NOTE_RECURRING = /(每天|每周|每月|每年|天天|经常|总是|总是要|年年|每逢|平时)/;
const CAL_AUTO_NOTE_WEEKDAY_CHARS = { "一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6, "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6 };

function calAutoNoteIso(date) {
    return calFormatIsoDate(date);
}

function calAutoNoteAddDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
}

function calAutoNoteWeekdayIndex(raw) {
    return CAL_AUTO_NOTE_WEEKDAY_CHARS[raw] ?? 0;
}

// 返回 { iso, phrase } 或 null；所有相对日期都以「今天」为基准
function calAutoNoteParseDate(text, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const simple = [
        [/大后天/, 3], [/后天/, 2], [/明天|明日/, 1], [/今天|今日|今晚|今早|今夜/, 0],
    ];
    for (const [re, delta] of simple) {
        const m = text.match(re);
        if (m) return { iso: calAutoNoteIso(calAutoNoteAddDays(today, delta)), phrase: m[0] };
    }

    const mondayIndex = (today.getDay() + 6) % 7;

    // 下周三 / 下礼拜天
    const nextWeek = text.match(/下\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/);
    if (nextWeek) {
        const target = calAutoNoteWeekdayIndex(nextWeek[1]);
        const nextMonday = 7 - mondayIndex;
        return { iso: calAutoNoteIso(calAutoNoteAddDays(today, nextMonday + target)), phrase: nextWeek[0] };
    }

    // 本周三 / 周三 / 星期三 / 礼拜天（已过去则顺延到下周同一天）
    const thisWeek = text.match(/(?:本周|这周|这星期|本星期)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/);
    if (thisWeek) {
        const target = calAutoNoteWeekdayIndex(thisWeek[1]);
        let delta = target - mondayIndex;
        if (delta < 0) delta += 7;
        return { iso: calAutoNoteIso(calAutoNoteAddDays(today, delta)), phrase: thisWeek[0] };
    }

    // 11月20日 / 11月20号
    const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (md) {
        const month = Number(md[1]) - 1, day = Number(md[2]);
        let d = new Date(today.getFullYear(), month, day);
        if (!Number.isNaN(d.getTime()) && d < today) d = new Date(today.getFullYear() + 1, month, day);
        return { iso: calAutoNoteIso(d), phrase: md[0] };
    }

    // 2026-11-20
    const full = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (full) {
        const d = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
        if (!Number.isNaN(d.getTime())) return { iso: calAutoNoteIso(d), phrase: full[0] };
    }
    return null;
}

function calAutoNoteFmt(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function calAutoNoteParseTime(text) {
    const daypartMatch = text.match(/晚上|傍晚|夜里|深夜|下午|中午|早上|上午/);
    const daypart = daypartMatch ? daypartMatch[0] : "";
    const isAfternoon = /下午/.test(daypart);
    const isNight = /晚上|傍晚|夜里|深夜/.test(daypart);

    let phrase = "";
    let start = null;
    const colon = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    const oclock = text.match(/(\d{1,2})\s*点\s*(半|\d{1,2}\s*分?)?/);
    if (colon) {
        phrase = colon[0];
        start = Number(colon[1]) * 60 + Number(colon[2]);
        if ((isAfternoon || isNight) && Number(colon[1]) < 12) start += 12 * 60;
    } else if (oclock) {
        phrase = oclock[0];
        let hour = Number(oclock[1]);
        const minute = oclock[2] === "半" ? 30 : (oclock[2] ? parseInt(oclock[2], 10) || 0 : 0);
        if ((isAfternoon || isNight) && hour < 12) hour += 12;
        start = hour * 60 + minute;
    } else {
        const defaults = { "早上": 9 * 60, "上午": 9 * 60, "中午": 12 * 60, "下午": 15 * 60, "晚上": 20 * 60, "傍晚": 18 * 60, "夜里": 22 * 60, "深夜": 22 * 60 };
        start = defaults[daypart] ?? 9 * 60;
    }
    if (start >= 24 * 60) return null;
    const end = Math.min(23 * 60 + 59, start + 60);
    return {
        startTime: calAutoNoteFmt(start),
        endTime: calAutoNoteFmt(end),
        phrase: daypart + phrase,
        hasClock: !!colon || !!oclock,
        hasDaypart: !!daypart,
    };
}

function calAutoNoteCleanTitle(text, phrases, hasTrigger) {
    let title = text;
    for (const p of [CAL_AUTO_NOTE_TRIGGERS.source, ...phrases.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))]) {
        if (!p) continue;
        title = title.replace(new RegExp(p, "g"), " ");
    }
    title = title
        .replace(/[，,。.！!？?~、；;\s]+/g, " ")
        .trim()
        .replace(/^(?:要|去|帮我|记得|到时候|然后|还有|我想|我得|我要|请|再|顺便|会|得|的)+/g, "")
        .trim();
    if (hasTrigger) title = title.replace(/^(?:日历|日程|上去|上|到|在)+/g, "").trim();
    return title.slice(0, 24).trim();
}

// 抽取一条事件；返回 { date, title, startTime, endTime, confidence } 或 null
function calExtractAutoEvents(text, now = new Date()) {
    const raw = String(text || "").trim();
    if (!raw || raw.length > 80) return null;
    if (CAL_AUTO_NOTE_RECURRING.test(raw)) return null;
    if (/[?？]$/.test(raw) || /吗[？?]?$/.test(raw)) return null;

    const hasTrigger = CAL_AUTO_NOTE_TRIGGERS.test(raw);
    const dateInfo = calAutoNoteParseDate(raw, now);
    if (!dateInfo) return null;
    const timeInfo = calAutoNoteParseTime(raw);
    if (!timeInfo) return null;

    const todayIso = calAutoNoteIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    if (dateInfo.iso < todayIso) return null; // 已经发生的不记

    const title = calAutoNoteCleanTitle(raw, [dateInfo.phrase, timeInfo.phrase], hasTrigger);
    if (title.length < 2) return null;

    let confidence = 0.5; // 明确日期
    if (hasTrigger) confidence += 0.3;
    if (timeInfo.hasClock) confidence += 0.15;
    if (timeInfo.hasDaypart) confidence += 0.1;
    confidence += 0.1;
    const threshold = hasTrigger ? 0.6 : 0.7;
    if (confidence < threshold) return null;

    return {
        date: dateInfo.iso,
        title,
        startTime: timeInfo.startTime,
        endTime: timeInfo.endTime,
        confidence: Math.round(confidence * 100) / 100,
    };
}

// 供聊天 sendMessage 调用：写入共享日历 + 已读标记 + 角标 + 即时刷新
function calHandleChatAutoNotes(rawText, chat, chatType) {
    if (chatType && chatType !== "private") return null;
    if (typeof calLoadConfig !== "function" || typeof calAddAutoEvent !== "function") return null;
    const cfg = calLoadConfig();
    if (cfg.autoNotesEnabled !== true) return null;

    const ev = calExtractAutoEvents(rawText, new Date());
    if (!ev) return null;

    const saved = calAddAutoEvent({
        date: ev.date, title: ev.title,
        startTime: ev.startTime, endTime: ev.endTime,
        ownerType: "user", ownerId: "self",
        messageId: chat?.id ? `${chat.id}_${Date.now()}` : "",
    });
    if (!saved) return null; // 同日同标题已存在

    if (typeof calMarkDayChanged === "function") calMarkDayChanged(ev.date);
    if (typeof calUpdateAppBadge === "function") calUpdateAppBadge();
    if (typeof calRefreshPlans === "function") {
        calRefreshPlans();
        const screen = document.getElementById("calendar-screen");
        if (screen?.classList.contains("active") && typeof calRerenderCurrentView === "function") {
            calRerenderCurrentView();
        }
    }
    if (cfg.changeNotifyEnabled !== false && typeof showToast === "function") {
        showToast(`已记入日历：${ev.date.slice(5)} ${ev.title}`);
    }
    return ev;
}
