// 日历主视图模块 (js/modules/calendar_view.js)
// 月历页 + 详情时间轴页 + 所有弹窗交互

const CAL_MONTH_CN = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const CAL_WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];
const CAL_WEEKDAY_FULL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const CAL_HOUR_H = 48;
const CAL_STRIP_RADIUS = 8;
const CAL_DAY_RADIUS = 21;

const CAL_EMOJI_PRESETS = [
    "📌", "💼", "📚", "💻", "🏃", "🏋️", "🍽️", "☕", "🎬",
    "🎮", "🎵", "🛒", "🛍️", "✈️", "🏥", "📞", "💤", "❤️",
    "🎂", "🎨", "🧹", "🐾",
];

const CAL_COLOR_LABELS = {
    blue: "蓝", green: "绿", amber: "橙", rose: "粉",
    violet: "紫", teal: "青", slate: "灰", lilac: "丁香",
};

const CAL_THEMES = [
    { id: "light", name: "默认" },
    { id: "dark", name: "深色" },
    { id: "cream", name: "奶油" },
    { id: "mint", name: "薄荷" },
    { id: "mist", name: "雾紫" },
    { id: "sakura", name: "樱粉" },
];

const CAL_CSS_EXAMPLE = `/* 示例：修改月历单元格背景 */
.calendar-month-cell {
  background: rgba(0,0,0,0.02);
  border-radius: 8px;
}
/* 修改事件块圆角 */
.calendar-tl-event {
  border-radius: 10px;
}`;

let calState = {
    view: "month",
    todayIso: calFormatIsoDate(new Date()),
    selectedDate: calFormatIsoDate(new Date()),
    pendingScrollYm: null,
    owners: [],
    genOwnerKey: null,
    config: null,
    ownerPlans: [],
    isGenerating: false,
    editingItem: null,
    autoAttempted: new Set(),
    screenObserver: null,
    plansSignature: "",
    nowMinutes: new Date().getHours() * 60 + new Date().getMinutes(),
    nowTimer: null,
    detailCenter: null,
};

// 顶栏 SVG 图标（不用 emoji）
const CAL_SVG_ICONS = {
    spark: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5l1.8 4.6 4.7 1.9-4.7 1.9L10 15.5l-1.8-4.6-4.7-1.9 4.7-1.9z" fill="currentColor" stroke="none"/><path d="M15.8 12.8l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor" stroke="none"/></svg>',
    plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4.5v11M4.5 10h11"/></svg>',
    gear: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.6"/><path d="M16.2 12.5a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.46V19a2 2 0 11-4 0v-.09a1.6 1.6 0 00-1.05-1.47 1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.46-.97H1a2 2 0 110-4h.09A1.6 1.6 0 002.56 7.2a1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06a1.6 1.6 0 001.77.32H7a1.6 1.6 0 00.97-1.46V1a2 2 0 114 0v.09a1.6 1.6 0 00.97 1.46 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06a1.6 1.6 0 00-.32 1.77V7a1.6 1.6 0 001.46.97H19a2 2 0 110 4h-.09a1.6 1.6 0 00-1.46.97z"/></svg>',
    days: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2.5" y="4" width="15" height="12" rx="2.5"/><path d="M2.5 8h15M8.2 8v8"/></svg>',
};

// 日程块时间行的小时钟图标
const CAL_EV_CLOCK_ICON = '<svg class="cal-ev-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

function calNotice(msg) {
    if (typeof showToast === "function") showToast(msg);
}

// 主屏日历 App 角标：AI 改过、用户还没点进去看过的日期
function calUpdateAppBadge() {
    const unseen = (typeof calGetUnseenDays === "function") ? calGetUnseenDays() : [];
    document.querySelectorAll('.menu-item[data-action="calendar"]').forEach(el => {
        el.classList.toggle("has-cal-unseen", unseen.length > 0);
    });
    document.querySelectorAll('.app-icon[data-target="calendar-screen"]').forEach(el => {
        el.classList.toggle("has-cal-unseen", unseen.length > 0);
    });
}

// AI 写入计划后的统一处理：未读日期标记 + 主屏角标
function calMarkAiChanges(items, characterName) {
    const list = Array.isArray(items) ? items : [];
    const dates = new Set(list.map(i => i.date).filter(Boolean));
    for (const date of dates) {
        if (typeof calMarkDayChanged === "function") calMarkDayChanged(date);
    }
    calUpdateAppBadge();
    return dates.size;
}

function calBuildOwners() {
    const options = [{
        key: "user:self",
        ownerType: "user",
        ownerId: "self",
        name: "我",
        avatar: null,
    }];
    const chars = (typeof db !== "undefined" && Array.isArray(db.characters)) ? db.characters : [];
    for (const char of chars) {
        options.push({
            key: `character:${char.id}`,
            ownerType: "character",
            ownerId: char.id,
            name: char.remarkName || char.realName || char.name || "未命名",
            avatar: char.avatar || null,
        });
    }
    return options;
}

function calGetSelectedOwner() {
    return calState.owners.find(o => o.key === calState.genOwnerKey) || calState.owners.find(o => o.ownerType === "character") || calState.owners[0] || null;
}

function calOwnerNameOf(item) {
    if (!item || item.ownerType === "user") return "我";
    const owner = calState.owners.find(o => o.ownerType === item.ownerType && o.ownerId === item.ownerId);
    return owner ? owner.name : "";
}

function calGetWeekStartForSelected() {
    return calGetWeekStartIso(calParseIsoDate(calState.selectedDate));
}

function calRefreshPlans() {
    // 所有角色/用户的日程合并进同一本日历
    calState.ownerPlans = calGetAllItemsAggregated();
    calState.plansSignature = calState.ownerPlans
        .map(i => `${i.id}:${i.updatedAt || ""}`).join("|");
}

// 打开日历屏幕时同步一次数据：聊天自动记事等外部写入也能立刻显示
function calEnsureScreenObserver() {
    const screen = document.getElementById("calendar-screen");
    if (!screen || calState.screenObserver) return;
    calState.screenObserver = new MutationObserver(() => {
        if (!screen.classList.contains("active")) return;
        const before = calState.plansSignature;
        calRefreshPlans();
        if (calState.plansSignature !== before) calRerenderCurrentView();
        if (calState.pendingScrollYm) calScrollToMonth(calState.pendingScrollYm, false);
        calTryAutoGenerate();
    });
    calState.screenObserver.observe(screen, { attributes: true, attributeFilter: ["class"] });
}

function calGetItemsByDate() {
    return calBuildItemsByDate(calState.ownerPlans);
}

function calApplyTheme() {
    const screen = document.getElementById("calendar-screen");
    if (!screen) return;
    screen.setAttribute("data-calendar-theme", calState.config.theme);
}

function calApplyCustomCssToDom() {
    let el = document.getElementById("cal-custom-css");
    if (!el) {
        el = document.createElement("style");
        el.id = "cal-custom-css";
        document.head.appendChild(el);
    }
    const css = calLoadCustomCss();
    el.textContent = css || "";
}

// 节日/节气胶囊颜色（文字 + 胶囊分开，设置里可选）
function calApplyFestivalStyle() {
    const screen = document.getElementById("calendar-screen");
    if (!screen) return;
    const legacy = calState.config.festivalColor || "#E9575A";
    screen.style.setProperty("--cal-fest-text", calState.config.festivalTextColor || legacy);
    screen.style.setProperty("--cal-fest-pill", calState.config.festivalPillColor || legacy);
}

// ═══════════════════════════════════════════════════════════
//  初始化
// ═══════════════════════════════════════════════════════════

function setupCalendar() {
    calState.config = calLoadConfig();
    if (![1, 2].includes(calState.config.daysPerPage)) calState.config.daysPerPage = 2;
    calState.owners = calBuildOwners();
    calState.todayIso = calFormatIsoDate(new Date());
    calState.selectedDate = calState.todayIso;
    calRefreshPlans();
    calApplyTheme();
    calApplyFestivalStyle();
    calApplyCustomCssToDom();
    calRenderShell();
    calRenderMonthView();
    calEnsureScreenObserver();
    calUpdateAppBadge();

    calState.nowTimer = setInterval(() => {
        const now = new Date();
        calState.nowMinutes = now.getHours() * 60 + now.getMinutes();
        calUpdateNowLine();
    }, 60000);

    calTryAutoGenerate();
}

function calRenderShell() {
    const screen = document.getElementById("calendar-screen");
    if (!screen) return;
    screen.innerHTML = `
        <div class="calendar-page" id="cal-page"></div>
        <div id="cal-modal-container"></div>
    `;
}

// ═══════════════════════════════════════════════════════════
//  月历页
// ═══════════════════════════════════════════════════════════

function calBuildMonths() {
    const today = calParseIsoDate(calState.todayIso);
    const blocks = [];
    for (let m = -12; m <= 12; m++) {
        const first = new Date(today.getFullYear(), today.getMonth() + m, 1);
        const year = first.getFullYear();
        const month = first.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const weeks = [];
        let week = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            if (week.length > 0 && d.getDay() === 0) {
                weeks.push(week);
                week = [];
            }
            week.push({
                iso: calFormatIsoDate(d),
                day,
                weekday: d.getDay(),
            });
        }
        if (week.length > 0) weeks.push(week);
        blocks.push({
            ym: `${year}-${month}`,
            year,
            month,
            firstWeekday: first.getDay(),
            weeks,
        });
    }
    return blocks;
}

function calRenderMonthView() {
    calState.view = "month";
    const page = document.getElementById("cal-page");
    if (!page) return;

    const owner = calGetSelectedOwner();
    const itemsByDate = calGetItemsByDate();
    const months = calBuildMonths();
    const todayYm = (() => {
        const d = calParseIsoDate(calState.todayIso);
        return `${d.getFullYear()}-${d.getMonth()}`;
    })();

    let monthsHtml = "";
    for (const block of months) {
        const termMap = (typeof calSolarTermsOfMonth === "function")
            ? calSolarTermsOfMonth(block.year, block.month + 1) : {};
        const labelOffset = `${(block.firstWeekday / 7) * 100}%`;
        let weeksHtml = "";
        for (const week of block.weeks) {
            let cellsHtml = "";
            for (const cell of week) {
                const items = itemsByDate.get(cell.iso);
                const isToday = cell.iso === calState.todayIso;
                const dotHtml = items && items.length > 0
                    ? `<i class="calendar-event-dot" data-color="${items[0].colorKey}"></i>`
                    : "";
                // 农历日 / 节日 / 节气（iOS 风格）
                let subHtml = "";
                let pillHtml = "";
                if (typeof calDayInfo === "function") {
                    try {
                        const info = calDayInfo(new Date(cell.iso + "T00:00:00"));
                        subHtml = `<span class="calendar-month-lunar">${info.lunar.day === 1 ? info.lunar.monthName : info.lunar.dayName}</span>`;
                        const festName = info.festival || info.term;
                        if (festName) {
                            const iconInner = calState.config.festivalIconImage
                                ? `<img class="calendar-fest-pill-img" src="${calState.config.festivalIconImage}" alt="">`
                                : `<i>${escapeHtml(calState.config.festivalIcon || "★")}</i>`;
                            pillHtml = `<span class="calendar-festival-pill">${iconInner}${escapeHtml(festName)}</span>`;
                        }
                    } catch (e) {}
                }
                cellsHtml += `
                    <button type="button" class="calendar-month-cell"
                        data-iso="${cell.iso}"
                        ${isToday ? 'data-today="true"' : ""}
                        style="grid-column-start: ${cell.weekday + 1}">
                        <span class="calendar-month-num">${cell.day}</span>
                        ${subHtml}
                        <span class="calendar-month-dots">${dotHtml}</span>
                        ${pillHtml}
                    </button>`;
            }
            weeksHtml += `<div class="calendar-month-week">${cellsHtml}</div>`;
        }
        const isCurrent = block.ym === todayYm;
        monthsHtml += `
            <div class="calendar-month-block" data-ym="${block.ym}">
                <div class="calendar-month-label" style="--label-offset: ${labelOffset}">
                    <strong ${isCurrent ? 'data-current="true"' : ""}>${block.month + 1}月</strong>
                </div>
                ${weeksHtml}
            </div>`;
    }

    page.className = "calendar-page calendar-page-month";
    page.innerHTML = `
        <div class="calendar-month-scroll hide-scrollbar" id="cal-month-scroll">
            ${monthsHtml}
        </div>
        <div class="calendar-month-header" id="cal-month-header">
            <div class="calendar-apple-topbar">
                <button type="button" class="calendar-pill-btn calendar-back-btn" id="cal-back-btn">
                    <span>‹</span>
                    <span id="cal-topbar-year">${new Date().getFullYear()}年</span>
                </button>
                <span class="calendar-topbar-space"></span>
                <button type="button" class="calendar-icon-btn" id="cal-gen-btn" aria-label="AI 生成" ${calState.isGenerating ? "disabled" : ""}>${CAL_SVG_ICONS.spark}</button>
                <button type="button" class="calendar-icon-btn" id="cal-add-btn" aria-label="新增日程">${CAL_SVG_ICONS.plus}</button>
                <button type="button" class="calendar-icon-btn" id="cal-settings-btn" aria-label="日历设置">${CAL_SVG_ICONS.gear}</button>
            </div>
            <div class="calendar-month-title">
                <strong id="cal-month-title">${CAL_MONTH_CN[new Date().getMonth()]}</strong>
            </div>
            <div class="calendar-weekday-head" aria-hidden="true">
                ${CAL_WEEKDAY_SHORT.map(w => `<span>${w}</span>`).join("")}
            </div>
        </div>
        <div class="calendar-bottom-fade"></div>
        <div class="calendar-float-bar">
            <button type="button" class="calendar-pill-btn" id="cal-today-btn">今天</button>
        </div>
    `;

    calBindMonthEvents();
    calEnsureHeaderObserver();
    calMeasureHeaderHeight();
    calScrollToMonth(todayYm, false);
    calTryAutoGenerate();
}

function calMeasureHeaderHeight() {
    const header = document.getElementById("cal-month-header");
    const scroll = document.getElementById("cal-month-scroll");
    if (header && scroll) {
        const h = header.offsetHeight;
        scroll.style.paddingTop = h + "px";
    }
}

function calScrollToMonth(ym, smooth) {
    const scroller = document.getElementById("cal-month-scroll");
    if (!scroller) return;
    const block = scroller.querySelector(`[data-ym="${ym}"]`);
    if (!block) return;
    // 页面隐藏（display:none）时 scrollTop 无效，挂起到可见后再滚
    if (scroller.offsetParent === null) {
        calState.pendingScrollYm = ym;
        return;
    }
    calState.pendingScrollYm = null;
    const header = document.getElementById("cal-month-header");
    const headerH = header ? header.offsetHeight : 0;
    scroller.scrollTo({
        top: block.offsetTop - headerH,
        behavior: smooth ? "smooth" : "auto",
    });
}

// 悬浮头部尺寸变化（页面显示/旋转/字体加载）时重算滚动区 padding
function calEnsureHeaderObserver() {
    const header = document.getElementById("cal-month-header");
    if (!header || header.__calRO) return;
    const ro = new ResizeObserver(() => {
        calMeasureHeaderHeight();
        if (calState.pendingScrollYm) calScrollToMonth(calState.pendingScrollYm, false);
    });
    ro.observe(header);
    header.__calRO = ro;
}

function calBindMonthEvents() {
    const scroller = document.getElementById("cal-month-scroll");
    if (scroller) {
        let ticking = false;
        scroller.addEventListener("scroll", () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                calUpdateMonthTitle();
            });
        });
    }

    const backBtn = document.getElementById("cal-back-btn");
    if (backBtn) backBtn.addEventListener("click", () => switchScreen("home-screen"));

    const genBtn = document.getElementById("cal-gen-btn");
    if (genBtn) genBtn.addEventListener("click", () => calOpenGenerateModal());

    const addBtn = document.getElementById("cal-add-btn");
    if (addBtn) addBtn.addEventListener("click", () => calOpenNewDraft(calState.todayIso));

    const settingsBtn = document.getElementById("cal-settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", () => calOpenSettingsModal());

    const todayBtn = document.getElementById("cal-today-btn");
    if (todayBtn) todayBtn.addEventListener("click", () => {
        const today = calParseIsoDate(calState.todayIso);
        const ym = `${today.getFullYear()}-${today.getMonth()}`;
        calScrollToMonth(ym, true);
    });

    const page = document.getElementById("cal-page");
    if (page) {
        page.addEventListener("click", (e) => {
            const cell = e.target.closest(".calendar-month-cell");
            if (cell) {
                calOpenDetail(cell.dataset.iso);
                return;
            }
        });
    }
}

function calUpdateMonthTitle() {
    const scroller = document.getElementById("cal-month-scroll");
    const header = document.getElementById("cal-month-header");
    if (!scroller || !header) return;
    const headerH = header.offsetHeight;
    const probe = scroller.scrollTop + headerH + 60;
    for (const child of Array.from(scroller.children)) {
        if (!child.dataset || !child.dataset.ym) continue;
        if (child.offsetTop + child.offsetHeight > probe) {
            const [yearStr, monthStr] = child.dataset.ym.split("-");
            const monthIdx = parseInt(monthStr, 10);
            const titleEl = document.getElementById("cal-month-title");
            const yearEl = document.getElementById("cal-topbar-year");
            if (titleEl) titleEl.textContent = CAL_MONTH_CN[monthIdx] || "";
            if (yearEl) yearEl.textContent = `${yearStr}年`;
            break;
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  详情页（周条 + 时间轴）
// ═══════════════════════════════════════════════════════════

function calOpenDetail(date) {
    calState.selectedDate = date;
    calState.detailCenter = date;
    calState.view = "detail";
    calRenderDetailView();
}

function calBackToMonth() {
    calRenderMonthView();
}

function calRenderDetailView() {
    const page = document.getElementById("cal-page");
    if (!page) return;

    const owner = calGetSelectedOwner();
    const itemsByDate = calGetItemsByDate();
    const dpp = calState.config.daysPerPage;
    const center = calState.detailCenter || calState.selectedDate;
    const selectedIso = calState.selectedDate;

    const weeks = calBuildStripWeeks(center);
    const days = calBuildStripDays(center);

    const selectedDate = calParseIsoDate(selectedIso);
    const backLabel = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`;

    page.className = "calendar-page calendar-page-detail";
    page.innerHTML = `
        <div class="calendar-apple-topbar">
            <button type="button" class="calendar-pill-btn calendar-back-btn" id="cal-detail-back">
                <span>‹</span> ${backLabel}
            </button>
            <span class="calendar-topbar-space"></span>
            <button type="button" class="calendar-icon-btn" id="cal-days-btn" aria-label="每页天数">${CAL_SVG_ICONS.days}</button>
            <button type="button" class="calendar-icon-btn" id="cal-gen-btn" aria-label="AI 生成" ${calState.isGenerating ? "disabled" : ""}>${CAL_SVG_ICONS.spark}</button>
            <button type="button" class="calendar-icon-btn" id="cal-add-btn" aria-label="新增日程">${CAL_SVG_ICONS.plus}</button>
            <button type="button" class="calendar-icon-btn" id="cal-settings-btn" aria-label="日历设置">${CAL_SVG_ICONS.gear}</button>
        </div>
        <div class="calendar-weekday-head calendar-strip-head" aria-hidden="true">
            ${CAL_WEEKDAY_SHORT.map(w => `<span>${w}</span>`).join("")}
        </div>
        <div class="calendar-week-strip hide-scrollbar" id="cal-strip">
            ${calBuildStripPanelsHtml(weeks)}
        </div>
        ${dpp === 1 ? `
        <div class="calendar-detail-datehead">
            <b id="cal-dd-title"></b>
            <span id="cal-dd-sub"></span>
        </div>
        ` : `
        <div class="calendar-tl-headrow">
            <div class="calendar-tl-headrow-gutter"></div>
            <div class="calendar-tl-headrow-days hide-scrollbar" id="cal-tl-head"
                style="--tl-day-w: ${100 / dpp}%">
                ${calBuildDayHeadersHtml(days, dpp)}
            </div>
        </div>
        `}
        <div class="calendar-tl-vscroll hide-scrollbar" id="cal-tl-vscroll">
            <div class="calendar-tl-row">
                <div class="calendar-tl-gutter" id="cal-tl-gutter">
                    ${calBuildGutterHtml()}
                </div>
                <div class="calendar-tl-hscroll hide-scrollbar" id="cal-tl-hscroll"
                    style="--tl-day-w: ${100 / dpp}%">
                    ${calBuildDayColumnsHtml(days, itemsByDate)}
                </div>
            </div>
        </div>
        <div class="calendar-float-bar">
            <button type="button" class="calendar-pill-btn" id="cal-today-btn">今天</button>
        </div>
    `;

    calBindDetailEvents(days, weeks);
    calUpdateDetailDateHead();
    calRequestAnimationFrame(() => {
        calSnapStripTo(selectedIso, false);
        calSnapTimelineTo(selectedIso, false, dpp);
        calPaintSelection(false);
        calUpdateRangePill(selectedIso, days, dpp);
        const vscroll = document.getElementById("cal-tl-vscroll");
        if (vscroll && vscroll.scrollTop === 0) {
            vscroll.scrollTop = 8 * CAL_HOUR_H;
        }
    });
}

function calBuildStripWeeks(center) {
    const base = calParseIsoDate(center);
    const sunday = new Date(base);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const sundayIso = calFormatIsoDate(sunday);
    const weeks = [];
    for (let i = -CAL_STRIP_RADIUS; i <= CAL_STRIP_RADIUS; i++) {
        weeks.push(calAddDays(sundayIso, i * 7));
    }
    return weeks;
}

function calBuildStripDays(center) {
    const days = [];
    for (let i = -CAL_DAY_RADIUS; i <= CAL_DAY_RADIUS; i++) {
        days.push(calAddDays(center, i));
    }
    return days;
}

function calBuildStripPanelsHtml(weeks) {
    let html = "";
    for (const weekStart of weeks) {
        let cellsHtml = "";
        for (let i = 0; i < 7; i++) {
            const iso = calAddDays(weekStart, i);
            const d = calParseIsoDate(iso);
            const isToday = iso === calState.todayIso;
            let lunarText = "";
            if (typeof calDayInfo === "function") {
                try {
                    const info = calDayInfo(new Date(iso + "T00:00:00"));
                    if (info && info.lunar) lunarText = info.lunar.day === 1 ? info.lunar.monthName : info.lunar.dayName;
                } catch (e) {}
            }
            cellsHtml += `
                <button type="button" class="calendar-strip-cell"
                    data-date="${iso}"
                    ${isToday ? 'data-today="true"' : ""}>
                    <span class="calendar-strip-num">${d.getDate()}</span>
                    <span class="calendar-strip-lunar">${lunarText}</span>
                </button>`;
        }
        html += `
            <div class="calendar-strip-panel" data-week="${weekStart}">
                <i class="calendar-strip-range" style="display:none"></i>
                <i class="calendar-strip-bubble" style="display:none"></i>
                ${cellsHtml}
            </div>`;
    }
    return html;
}

function calBuildDayHeadersHtml(days, dpp) {
    let html = "";
    for (const iso of days) {
        const d = calParseIsoDate(iso);
        const isToday = iso === calState.todayIso;
        // 多日列头：11月10日 – 周二 + 农历（十月初二 / 初一显示月名）
        let lunarText = "";
        if (typeof calDayInfo === "function") {
            try {
                const info = calDayInfo(new Date(iso + "T00:00:00"));
                if (info && info.lunar) lunarText = info.lunar.day === 1 ? info.lunar.monthName : info.lunar.monthName + info.lunar.dayName;
            } catch (e) {}
        }
        html += `
            <div class="calendar-tl-day-head" data-today="${isToday}">
                <b>${d.getMonth() + 1}月${d.getDate()}日 – ${CAL_WEEKDAY_FULL[d.getDay()]}</b>
                <span>${lunarText}</span>
            </div>`;
    }
    return html;
}

function calBuildGutterHtml() {
    let html = "";
    for (let h = 0; h < 24; h++) {
        html += `<span>${String(h).padStart(2, "0")}:00</span>`;
    }
    const nowTop = (calState.nowMinutes / 60) * CAL_HOUR_H;
    const nowH = Math.floor(calState.nowMinutes / 60);
    const nowM = calState.nowMinutes % 60;
    const nowLabel = `${String(nowH).padStart(2, "0")}:${String(nowM).padStart(2, "0")}`;
    html += `<i class="calendar-now-badge" id="cal-now-badge" style="top:${nowTop}px">${nowLabel}</i>`;
    return html;
}

function calBuildDayColumnsHtml(days, itemsByDate) {
    let html = "";
    for (const iso of days) {
        const isToday = iso === calState.todayIso;
        const items = itemsByDate.get(iso) || [];
        const positioned = calLayoutDayEvents(items);

        let eventsHtml = "";
        if (isToday) {
            const nowTop = (calState.nowMinutes / 60) * CAL_HOUR_H;
            eventsHtml += `<i class="calendar-now-line" id="cal-now-line" style="top:${nowTop}px"></i>`;
        }
        for (const pos of positioned) {
            const item = pos.item;
            const emojiPrefix = item.emoji ? `${item.emoji} ` : "";
            const locationSuffix = item.location ? ` · ${item.location}` : "";
            const aiSuffix = item.source === "generated" ? " · 计划" : "";
            const ownerSuffix = item.ownerType && item.ownerType !== "user" ? ` · ${escapeHtml(calOwnerNameOf(item))}` : "";
            eventsHtml += `
                <button type="button" class="calendar-tl-event"
                    data-color="${item.colorKey}"
                    data-item-id="${item.id}"
                    style="top:${pos.top}px; height:${pos.height}px; left:calc(${pos.left}% + 3px); width:calc(${pos.width}% - 6px)">
                    <b>${emojiPrefix}${escapeHtml(item.title)}</b>
                    <span>${CAL_EV_CLOCK_ICON}${item.startTime}–${item.endTime}${locationSuffix}${aiSuffix}${ownerSuffix}</span>
                </button>`;
        }

        html += `
            <div class="calendar-tl-day" data-date="${iso}" data-today="${isToday}">
                <div class="calendar-tl-body">${eventsHtml}</div>
            </div>`;
    }
    return html;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function calBindDetailEvents(days, weeks) {
    const dpp = calState.config.daysPerPage;

    const backBtn = document.getElementById("cal-detail-back");
    if (backBtn) backBtn.addEventListener("click", () => calBackToMonth());

    const daysBtn = document.getElementById("cal-days-btn");
    if (daysBtn) daysBtn.addEventListener("click", () => calOpenDaysModal());

    const genBtn = document.getElementById("cal-gen-btn");
    if (genBtn) genBtn.addEventListener("click", () => calOpenGenerateModal());

    const addBtn = document.getElementById("cal-add-btn");
    if (addBtn) addBtn.addEventListener("click", () => calOpenNewDraft(calState.selectedDate));

    const settingsBtn = document.getElementById("cal-settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", () => calOpenSettingsModal());

    const todayBtn = document.getElementById("cal-today-btn");
    if (todayBtn) todayBtn.addEventListener("click", () => calGotoToday(days));

    const strip = document.getElementById("cal-strip");
    if (strip) {
        strip.addEventListener("click", (e) => {
            const cell = e.target.closest(".calendar-strip-cell");
            if (cell) {
                calApplySelection(cell.dataset.date, { fromStrip: true }, days);
            }
        });
    }

    const tlH = document.getElementById("cal-tl-hscroll");
    const tlHead = document.getElementById("cal-tl-head");
    if (tlH) {
        let suppress = false;
        tlH.addEventListener("scroll", () => {
            if (tlHead) tlHead.scrollLeft = tlH.scrollLeft;
            const colW = tlH.clientWidth / dpp;
            if (colW <= 0) return;
            const fIdx = tlH.scrollLeft / colW;
            calUpdateRangePillByFIdx(fIdx, days, dpp);
            if (suppress) return;
            const idx = Math.round(fIdx);
            const iso = days[Math.max(0, Math.min(days.length - 1, idx))];
            if (iso && iso !== calState.selectedDate) {
                calApplySelection(iso, { fromTimeline: true }, days);
            }
        });

        const page = document.getElementById("cal-page");
        if (page) {
            page.addEventListener("click", (e) => {
                const eventBtn = e.target.closest(".calendar-tl-event");
                if (eventBtn) {
                    const itemId = eventBtn.dataset.itemId;
                    const item = calFindItemById(itemId);
                    if (item) calOpenEditItem(item);
                }
            });
        }
    }
}

function calFindItemById(itemId) {
    for (const item of calState.ownerPlans) {
        if (item.id === itemId) return item;
    }
    return null;
}

// 详情页日期标题（iOS 风格：公历 + 农历）
function calUpdateDetailDateHead() {
    const titleEl = document.getElementById("cal-dd-title");
    const subEl = document.getElementById("cal-dd-sub");
    if (!titleEl) return;
    const d = calParseIsoDate(calState.selectedDate);
    titleEl.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 – ${CAL_WEEKDAY_FULL[d.getDay()]}`;
    if (subEl && typeof calSolarToLunar === "function") {
        try {
            const lu = calSolarToLunar(d);
            subEl.textContent = `${lu.gzYear}年${lu.isLeap ? "闰" : ""}${lu.monthName}${lu.dayName} · 属${lu.zodiac}`;
        } catch (e) { subEl.textContent = ""; }
    }
}

function calApplySelection(iso, opts, days) {
    const prev = calState.selectedDate;
    if (iso === prev) return;

    if (!days.includes(iso)) {
        calState.selectedDate = iso;
        calState.detailCenter = iso;
        calRenderDetailView();
        return;
    }

    calState.selectedDate = iso;
    calUpdateDetailDateHead();
    calPaintSelection(true, prev);
    // 范围条跟随选中日（不依赖时间轴滚动事件）
    calUpdateRangePill(iso, days, calState.config.daysPerPage);
    if (opts?.fromStrip) calSnapTimelineTo(iso, true, calState.config.daysPerPage);
    if (!opts?.fromTimeline) calSnapStripTo(iso, true);
}

function calPaintSelection(animate, prevIso) {
    const strip = document.getElementById("cal-strip");
    if (!strip) return;

    strip.querySelectorAll(".calendar-strip-bubble").forEach(b => { b.style.display = "none"; });
    strip.querySelectorAll(".calendar-strip-cell.is-selected").forEach(c => c.classList.remove("is-selected"));

    const sel = calState.selectedDate;
    const sundayStart = calSundayStart(sel);
    const panel = strip.querySelector(`[data-week="${sundayStart}"]`);
    if (!panel) return;

    const cell = panel.querySelector(`[data-date="${sel}"]`);
    if (!cell) return;
    cell.classList.add("is-selected");

    const bubble = panel.querySelector(".calendar-strip-bubble");
    if (!bubble) return;

    const x = cell.offsetLeft + cell.offsetWidth / 2 - 23;
    bubble.style.display = "block";
    bubble.classList.toggle("is-today", sel === calState.todayIso);

    if (animate && prevIso && calSundayStart(prevIso) === sundayStart) {
        const prevCell = panel.querySelector(`[data-date="${prevIso}"]`);
        const x0 = prevCell ? prevCell.offsetLeft + prevCell.offsetWidth / 2 - 23 : x;
        bubble.style.transform = `translateX(${x}px)`;
        bubble.animate([
            { transform: `translateX(${x0}px) scale(1)` },
            { transform: `translateX(${(x0 + x) / 2}px) scale(0.55)` },
            { transform: `translateX(${x}px) scale(1)` },
        ], { duration: 230, easing: "cubic-bezier(0.3, 0.7, 0.35, 1)" });
    } else if (animate) {
        bubble.style.transform = `translateX(${x}px)`;
        bubble.animate([
            { transform: `translateX(${x}px) scale(0.4)`, opacity: 0.4 },
            { transform: `translateX(${x}px) scale(1)`, opacity: 1 },
        ], { duration: 180, easing: "ease-out" });
    } else {
        bubble.style.transform = `translateX(${x}px)`;
    }
}

function calSundayStart(iso) {
    const d = calParseIsoDate(iso);
    return calAddDays(iso, -d.getDay());
}

function calSnapStripTo(iso, smooth) {
    const strip = document.getElementById("cal-strip");
    if (!strip) return;
    const panel = strip.querySelector(`[data-week="${calSundayStart(iso)}"]`);
    if (!panel) return;
    strip.scrollTo({ left: panel.offsetLeft - strip.offsetLeft, behavior: smooth ? "smooth" : "auto" });
}

function calSnapTimelineTo(iso, smooth, dpp) {
    const tl = document.getElementById("cal-tl-hscroll");
    if (!tl) return;
    const days = calGetCurrentDays();
    const idx = days.indexOf(iso);
    if (idx < 0) return;
    tl.scrollTo({ left: idx * (tl.clientWidth / dpp), behavior: smooth ? "smooth" : "auto" });
}

function calGetCurrentDays() {
    const center = calState.detailCenter || calState.selectedDate;
    return calBuildStripDays(center);
}

function calUpdateRangePill(iso, days, dpp) {
    const idx = days.indexOf(iso);
    if (idx < 0) return;
    calUpdateRangePillByFIdx(idx, days, dpp);
}

function calUpdateRangePillByFIdx(fIdx, days, dpp) {
    const strip = document.getElementById("cal-strip");
    if (!strip) return;
    strip.querySelectorAll(".calendar-strip-range").forEach(p => { p.style.display = "none"; });
    // 单日模式：只有黑圆，不画灰色范围条
    if (dpp <= 1) return;

    const tlH = document.getElementById("cal-tl-hscroll");
    if (tlH && tlH.clientWidth <= 0) return; // 布局未就绪，先别动范围条

    const base = Math.max(0, Math.min(days.length - 1, Math.floor(fIdx)));
    const d0 = days[base];
    if (!d0) return;
    const sundayStart = calSundayStart(d0);
    const panel = strip.querySelector(`[data-week="${sundayStart}"]`);
    if (!panel) return;
    const pill = panel.querySelector(".calendar-strip-range");
    if (!pill) return;
    const cellW = panel.clientWidth / 7;
    const d = calParseIsoDate(d0);
    pill.style.display = "block";
    // 胶囊两端与黑圆边缘齐平：从选中日黑圆左缘延伸到 dpp 天后黑圆右缘
    const BUBBLE = 46;
    const left = d.getDay() * cellW + cellW / 2 - BUBBLE / 2;
    pill.style.width = `${BUBBLE + cellW * (dpp - 1)}px`;
    pill.style.transform = `translateX(${left}px)`;
}

function calGotoToday(currentDays) {
    const today = calState.todayIso;
    if (!currentDays.includes(today)) {
        calState.selectedDate = today;
        calState.detailCenter = today;
        calRenderDetailView();
        return;
    }
    calApplySelection(today, { fromStrip: true }, currentDays);
}

function calUpdateNowLine() {
    const nowTop = (calState.nowMinutes / 60) * CAL_HOUR_H;
    const nowH = Math.floor(calState.nowMinutes / 60);
    const nowM = calState.nowMinutes % 60;
    const nowLabel = `${String(nowH).padStart(2, "0")}:${String(nowM).padStart(2, "0")}`;

    const line = document.getElementById("cal-now-line");
    if (line) line.style.top = `${nowTop}px`;
    const badge = document.getElementById("cal-now-badge");
    if (badge) {
        badge.style.top = `${nowTop}px`;
        badge.textContent = nowLabel;
    }
}

function calRequestAnimationFrame(fn) {
    requestAnimationFrame(fn);
}

// ═══════════════════════════════════════════════════════════
//  顶部操作按钮（生成 / 新增 / 设置）
// ═══════════════════════════════════════════════════════════

function calRenderFab() { /* 旧 FAB 已移除：操作集中在右上角图标 */ }

function calSyncGeneratingState() {
    document.querySelectorAll("#cal-gen-btn").forEach(b => {
        if (calState.isGenerating) b.setAttribute("data-loading", "true");
        else b.removeAttribute("data-loading");
    });
}

// ═══════════════════════════════════════════════════════════
//  事件编辑弹窗
// ═══════════════════════════════════════════════════════════

function calOpenNewDraft(date) {
    const base = calCreateDefaultDraft(date);
    calState.editingItem = {
        ownerKey: "user:self",
        date: base.date,
        endDate: base.date,
        startTime: base.startTime,
        endTime: base.endTime,
        location: base.location,
        title: base.title,
        emoji: base.emoji,
        type: "",
        yearly: false,
    };
    calRenderEditModal();
}

function calOpenEditItem(item) {
    calState.editingItem = {
        id: item.id,
        ownerKey: item.ownerKey || "user:self",
        date: item.date,
        endDate: item.date,
        originalDate: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        location: item.location,
        title: item.title,
        emoji: item.emoji || "",
        colorKey: item.colorKey,
        type: item.type || "",
        yearly: item.yearly === true,
    };
    calRenderEditModal();
}

function calRenderEditModal() {
    const container = document.getElementById("cal-modal-container");
    if (!container) return;
    const draft = calState.editingItem;
    if (!draft) {
        container.innerHTML = "";
        return;
    }

    const isEdit = !!draft.id;
    const emojiHtml = CAL_EMOJI_PRESETS.map(emoji => {
        const active = draft.emoji === emoji;
        return `<button type="button" class="calendar-emoji-preset" data-emoji="${emoji}" ${active ? 'data-active="true"' : ""}>${emoji}</button>`;
    }).join("");

    const colorHtml = `
        <button type="button" class="calendar-color-swatch calendar-color-swatch-auto" data-color-key=""
            ${!draft.colorKey ? 'data-active="true"' : ""}>自动</button>
    ` + CAL_COLOR_KEYS.map(key => {
        return `<button type="button" class="calendar-color-swatch" data-color="${key}" data-color-key="${key}"
            ${draft.colorKey === key ? 'data-active="true"' : ""} title="${CAL_COLOR_LABELS[key]}"></button>`;
    }).join("");

    const typeHtml = CAL_EVENT_TYPES.map(t =>
        `<button type="button" class="cal-type-chip" data-type="${t}"
            ${(draft.type || "") === t ? 'data-active="true"' : ""}>${CAL_EVENT_TYPE_LABELS[t]}</button>`).join("");
    const showYearly = !!draft.type && draft.type !== "period";

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-edit-overlay">
            <div class="calendar-edit-modal" id="cal-edit-modal">
                <div class="modal-header">
                    <button type="button" class="modal-header-btn modal-header-btn-muted" id="cal-edit-close">‹</button>
                    <span class="modal-header-title">${isEdit ? "编辑日程" : "新增日程"}</span>
                    <button type="button" class="modal-header-btn modal-header-btn-action" id="cal-edit-save">✓</button>
                </div>
                <div class="modal-body hide-scrollbar" style="display:flex;flex-direction:column;gap:10px;padding-bottom:20px;">
                    <div class="grid grid-2">
                        <div class="field-group">
                            <label>开始日期</label>
                            <input type="date" id="cal-edit-date" value="${draft.date}">
                        </div>
                        <div class="field-group">
                            <label>结束日期</label>
                            <input type="date" id="cal-edit-end-date" value="${draft.endDate || draft.date}" min="${draft.date}">
                        </div>
                    </div>
                    <div class="grid grid-2">
                        <div class="field-group">
                            <label>开始时间</label>
                            <input type="time" id="cal-edit-start" value="${draft.startTime}">
                        </div>
                        <div class="field-group">
                            <label>结束时间</label>
                            <input type="time" id="cal-edit-end" value="${draft.endTime}">
                        </div>
                    </div>
                    <div class="field-group">
                        <label>事项</label>
                        <input type="text" id="cal-edit-title" value="${escapeHtml(draft.title)}" placeholder="例如：部门周会">
                    </div>
                    <div class="field-group">
                        <label>地点</label>
                        <input type="text" id="cal-edit-location" value="${escapeHtml(draft.location)}" placeholder="例如：公司会议室">
                    </div>
                    <div class="field-group">
                        <label>图标（点选，再点取消）</label>
                        <div class="calendar-emoji-row">${emojiHtml}</div>
                    </div>
                    <div class="field-group">
                        <label>颜色</label>
                        <div class="calendar-color-picker">${colorHtml}</div>
                    </div>
                    <div class="field-group">
                        <label>类型</label>
                        <div class="cal-type-row">${typeHtml}</div>
                    </div>
                    <div class="cal-setting-row" id="cal-edit-yearly-row" style="display:${showYearly ? "" : "none"}">
                        <span>每年重复</span>
                        <button type="button" class="cal-switch" id="cal-edit-yearly" data-on="${draft.yearly === true}"><i></i></button>
                    </div>
                    ${isEdit ? `
                    <button type="button" class="calendar-delete-btn" id="cal-edit-delete">
                        🗑 删除该事项
                    </button>` : ""}
                </div>
            </div>
        </div>
    `;

    calBindEditModalEvents();
}

function calBindEditModalEvents() {
    const overlay = document.getElementById("cal-edit-overlay");
    const closeBtn = document.getElementById("cal-edit-close");
    const saveBtn = document.getElementById("cal-edit-save");
    const deleteBtn = document.getElementById("cal-edit-delete");

    if (overlay) overlay.addEventListener("click", (e) => {
        if (e.target === overlay) calCloseEditModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", () => calCloseEditModal());
    if (saveBtn) saveBtn.addEventListener("click", () => calSaveDraft());
    if (deleteBtn) deleteBtn.addEventListener("click", () => calHandleDeleteItem());

    const dateInput = document.getElementById("cal-edit-date");
    const endDateInput = document.getElementById("cal-edit-end-date");
    if (dateInput) {
        dateInput.addEventListener("change", () => {
            const val = dateInput.value;
            calState.editingItem.date = val;
            if (endDateInput) {
                endDateInput.min = val;
                if (endDateInput.value < val) endDateInput.value = val;
            }
        });
    }
    if (endDateInput) {
        endDateInput.addEventListener("change", () => {
            calState.editingItem.endDate = endDateInput.value;
        });
    }

    const startInput = document.getElementById("cal-edit-start");
    const endInput = document.getElementById("cal-edit-end");
    if (startInput) startInput.addEventListener("change", () => { calState.editingItem.startTime = startInput.value; });
    if (endInput) endInput.addEventListener("change", () => { calState.editingItem.endTime = endInput.value; });

    const titleInput = document.getElementById("cal-edit-title");
    const locationInput = document.getElementById("cal-edit-location");
    if (titleInput) titleInput.addEventListener("input", () => { calState.editingItem.title = titleInput.value; });
    if (locationInput) locationInput.addEventListener("input", () => { calState.editingItem.location = locationInput.value; });

    const emojiRow = document.querySelector(".calendar-emoji-row");
    if (emojiRow) {
        emojiRow.addEventListener("click", (e) => {
            const btn = e.target.closest(".calendar-emoji-preset");
            if (!btn) return;
            const emoji = btn.dataset.emoji;
            if (calState.editingItem.emoji === emoji) {
                calState.editingItem.emoji = "";
            } else {
                calState.editingItem.emoji = emoji;
            }
            calRenderEditModal();
        });
    }

    const colorPicker = document.querySelector(".calendar-color-picker");
    if (colorPicker) {
        colorPicker.addEventListener("click", (e) => {
            const btn = e.target.closest(".calendar-color-swatch");
            if (!btn) return;
            const key = btn.dataset.colorKey;
            calState.editingItem.colorKey = key || undefined;
            calRenderEditModal();
        });
    }

    const typeRow = document.querySelector(".cal-type-row");
    if (typeRow) {
        typeRow.addEventListener("click", (e) => {
            const btn = e.target.closest(".cal-type-chip");
            if (!btn) return;
            calState.editingItem.type = btn.dataset.type || "";
            calRenderEditModal();
        });
    }

    document.getElementById("cal-edit-yearly")?.addEventListener("click", (e) => {
        const next = calState.editingItem.yearly !== true;
        calState.editingItem.yearly = next;
        e.currentTarget.setAttribute("data-on", next);
    });
}

function calCloseEditModal() {
    calState.editingItem = null;
    const container = document.getElementById("cal-modal-container");
    if (container) container.innerHTML = "";
}

function calSaveDraft() {
    const draft = calState.editingItem;
    if (!draft) return;
    const owner = calState.owners.find(o => o.key === (draft.ownerKey || "user:self"))
        || { ownerType: "user", ownerId: "self" };

    const error = calValidateDraft(draft);
    if (error) { calNotice(error); return; }

    const startDate = draft.date;
    const endDate = draft.endDate || draft.date;
    if (endDate < startDate) { calNotice("结束日期不能早于开始日期"); return; }

    const dayCount = Math.round((calParseIsoDate(endDate).getTime() - calParseIsoDate(startDate).getTime()) / 86400000) + 1;
    if (dayCount > 31) { calNotice("一次最多创建 31 天的日程"); return; }

    const firstWeekStart = calGetWeekStartIso(calParseIsoDate(startDate));

    if (draft.id && draft.originalDate) {
        const originalWeekStart = calGetWeekStartIso(calParseIsoDate(draft.originalDate));
        if (originalWeekStart !== firstWeekStart) {
            calDeleteItem(owner.ownerType, owner.ownerId, originalWeekStart, draft.id);
        }
    }

    for (let offset = 0; offset < dayCount; offset++) {
        const day = calParseIsoDate(startDate);
        day.setDate(day.getDate() + offset);
        const dayIso = calFormatIsoDate(day);
        const weekStart = calGetWeekStartIso(day);
        calUpsertItem(owner.ownerType, owner.ownerId, weekStart, {
            id: offset === 0 ? draft.id : undefined,
            date: dayIso,
            startTime: draft.startTime,
            endTime: draft.endTime,
            location: draft.location,
            title: draft.title,
            emoji: calSanitizeEmoji(draft.emoji),
            source: "manual",
            colorKey: draft.colorKey || calPickColorKey(draft.startTime),
            type: draft.type || "",
            yearly: draft.type && draft.type !== "period" ? draft.yearly === true : false,
        });
    }

    calCloseEditModal();
    calRefreshPlans();
    calRerenderCurrentView();
    calNotice(dayCount > 1 ? `已创建 ${dayCount} 天的日程` : "日程已保存");
}

function calHandleDeleteItem() {
    const draft = calState.editingItem;
    if (!draft?.id) return;
    const owner = calState.owners.find(o => o.key === (draft.ownerKey || "user:self"))
        || { ownerType: "user", ownerId: "self" };

    const targetWeekStart = calGetWeekStartIso(calParseIsoDate(draft.originalDate || draft.date));
    calDeleteItem(owner.ownerType, owner.ownerId, targetWeekStart, draft.id);
    calCloseEditModal();
    calRefreshPlans();
    calRerenderCurrentView();
    calNotice("日程已删除");
}

// ═══════════════════════════════════════════════════════════
//  设置弹窗（配色 + 节日标记 + 自动生成 + 自定义 CSS）
// ═══════════════════════════════════════════════════════════

function calOpenSettingsModal() {
    const container = document.getElementById("cal-modal-container");
    if (!container) return;

    const currentCss = calLoadCustomCss();
    const themesHtml = CAL_THEMES.map(t => `
        <button type="button" class="calendar-theme-option"
            data-theme-id="${t.id}"
            ${calState.config.theme === t.id ? 'data-active="true"' : ""}>
            <span class="calendar-theme-swatch" data-theme-id="${t.id}"></span>
            <span>${t.name}</span>
        </button>
    `).join("");

    const buildColorPicker = (idPrefix, current) => {
        let html = (CAL_FESTIVAL_COLORS || []).map(c => `
            <button type="button" class="calendar-color-swatch" data-${idPrefix}-color="${c}"
                style="background:${c}"
                ${current === c ? 'data-active="true"' : ""}></button>
        `).join("") + `
            <label class="calendar-color-swatch calendar-color-swatch-custom" title="自定义颜色">
                <input type="color" id="cal-${idPrefix}-color-input" value="${current}"
                    style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer">
                <span>+</span>
            </label>`;
        return html;
    };

    const textCur = calState.config.festivalTextColor || calState.config.festivalColor || "#E9575A";
    const pillCur = calState.config.festivalPillColor || calState.config.festivalColor || "#E9575A";

    const iconsHtml = (CAL_FESTIVAL_ICONS || ["★"]).map(ic => `
        <button type="button" class="calendar-fest-icon-option" data-fest-icon="${ic}"
            ${!calState.config.festivalIconImage && calState.config.festivalIcon === ic ? 'data-active="true"' : ""}>${ic}</button>
    `).join("") + `
        <label class="calendar-fest-icon-option calendar-fest-icon-upload"
            ${calState.config.festivalIconImage ? 'data-active="true"' : ""}
            title="上传图片">
            <input type="file" id="cal-fest-icon-file" accept="image/*" style="display:none">
            <span style="font-size:13px">🖼</span>
        </label>`;

    const autoOn = !!calState.config.autoGenerateEnabled;
    const autoRange = calState.config.autoGenerateRange || "week";
    const notesOn = calState.config.autoNotesEnabled !== false;
    const notifyOn = calState.config.changeNotifyEnabled !== false;

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-theme-overlay">
            <div class="calendar-edit-modal calendar-theme-modal" id="cal-theme-modal">
                <div class="calendar-theme-modal-head">
                    <strong>日历设置</strong>
                    <button type="button" class="calendar-icon-btn" id="cal-theme-close" aria-label="关闭" style="font-size:14px">✕</button>
                </div>
                <div class="cal-setting-label">配色</div>
                <div class="calendar-theme-grid">${themesHtml}</div>
                <div class="cal-setting-label">标记文字颜色</div>
                <div class="calendar-color-picker calendar-fest-color-picker">${buildColorPicker("fest-text", textCur)}</div>
                <div class="cal-setting-label">标记胶囊颜色</div>
                <div class="calendar-color-picker calendar-fest-color-picker">${buildColorPicker("fest-pill", pillCur)}</div>
                <div class="cal-setting-label">标记图标</div>
                <div class="calendar-fest-icon-row">${iconsHtml}</div>
                <div class="cal-setting-row">
                    <span>自动生成角色日程</span>
                    <button type="button" class="cal-switch" id="cal-auto-switch" data-on="${autoOn}"><i></i></button>
                </div>
                <div class="cal-setting-row" id="cal-auto-range-row" style="display:${autoOn ? "" : "none"}">
                    <span>生成范围</span>
                    <select id="cal-auto-range" class="cal-plan-select cal-auto-range-select">
                        <option value="week" ${autoRange === "week" ? "selected" : ""}>本周</option>
                        <option value="7" ${autoRange === "7" ? "selected" : ""}>未来7天</option>
                        <option value="14" ${autoRange === "14" ? "selected" : ""}>未来14天</option>
                    </select>
                </div>
                <div class="cal-setting-row">
                    <span>聊天自动记事</span>
                    <button type="button" class="cal-switch" id="cal-notes-switch" data-on="${notesOn}"><i></i></button>
                </div>
                <div class="cal-setting-row">
                    <span>改动提醒</span>
                    <button type="button" class="cal-switch" id="cal-notify-switch" data-on="${notifyOn}"><i></i></button>
                </div>
                <div class="calendar-css-label">自定义 CSS</div>
                <textarea class="calendar-css-textarea" id="cal-css-input"
                    placeholder="/* 输入 CSS，可自定义页面一切样式... */"
                    spellcheck="false" autocapitalize="off" autocorrect="off">${escapeHtml(currentCss)}</textarea>
                <div class="calendar-theme-css-actions">
                    <button type="button" class="calendar-block-btn" data-variant="ghost" id="cal-css-example">示例</button>
                    <button type="button" class="calendar-block-btn" data-variant="ghost" id="cal-css-clear">清空</button>
                    <button type="button" class="calendar-block-btn" data-variant="primary" id="cal-css-apply">应用</button>
                </div>
            </div>
        </div>
    `;

    const overlay = document.getElementById("cal-theme-overlay");
    if (overlay) overlay.addEventListener("click", (e) => {
        if (e.target === overlay) container.innerHTML = "";
    });

    document.getElementById("cal-theme-close")?.addEventListener("click", () => { container.innerHTML = ""; });

    container.querySelectorAll(".calendar-theme-option").forEach(btn => {
        btn.addEventListener("click", () => {
            calState.config.theme = btn.dataset.themeId;
            calSaveConfig(calState.config);
            calApplyTheme();
            container.querySelectorAll(".calendar-theme-option").forEach(b => b.removeAttribute("data-active"));
            btn.setAttribute("data-active", "true");
        });
    });

    const bindColorPicker = (idPrefix, configKey) => {
        const dataKey = idPrefix.replace(/-([a-z])/g, (m, c) => c.toUpperCase()) + "Color";
        container.querySelectorAll(`[data-${idPrefix}-color]`).forEach(btn => {
            btn.addEventListener("click", () => {
                calState.config[configKey] = btn.dataset[dataKey];
                calSaveConfig(calState.config);
                calApplyFestivalStyle();
                container.querySelectorAll(`[data-${idPrefix}-color]`).forEach(b => b.removeAttribute("data-active"));
                btn.setAttribute("data-active", "true");
            });
        });
        document.getElementById(`cal-${idPrefix}-color-input`)?.addEventListener("input", (e) => {
            calState.config[configKey] = e.target.value;
            calSaveConfig(calState.config);
            calApplyFestivalStyle();
            container.querySelectorAll(`[data-${idPrefix}-color]`).forEach(b => b.removeAttribute("data-active"));
        });
    };
    bindColorPicker("fest-text", "festivalTextColor");
    bindColorPicker("fest-pill", "festivalPillColor");

    // 预设图标（点击同时清除自定义图片）
    container.querySelectorAll("[data-fest-icon]").forEach(btn => {
        btn.addEventListener("click", () => {
            calState.config.festivalIcon = btn.dataset.festIcon;
            calState.config.festivalIconImage = "";
            calSaveConfig(calState.config);
            container.querySelectorAll("[data-fest-icon]").forEach(b => b.removeAttribute("data-active"));
            btn.setAttribute("data-active", "true");
            calRerenderCurrentView();
        });
    });

    // 上传图片作为标记图标（压缩为 48px PNG 存配置）
    document.getElementById("cal-fest-icon-file")?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const S = 48;
                const canvas = document.createElement("canvas");
                canvas.width = S; canvas.height = S;
                const ctx = canvas.getContext("2d");
                const scale = Math.min(S / img.width, S / img.height);
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
                try {
                    calState.config.festivalIconImage = canvas.toDataURL("image/png");
                    calSaveConfig(calState.config);
                    calApplyFestivalStyle();
                    container.querySelectorAll("[data-fest-icon]").forEach(b => b.removeAttribute("data-active"));
                    const up = container.querySelector(".calendar-fest-icon-upload");
                    if (up) up.setAttribute("data-active", "true");
                    calRerenderCurrentView();
                    calNotice("标记图标已更新");
                } catch (err) {
                    calNotice("图片处理失败");
                }
            };
            img.onerror = () => calNotice("图片读取失败");
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    });

    document.getElementById("cal-auto-switch")?.addEventListener("click", (e) => {
        const next = calState.config.autoGenerateEnabled !== true;
        calState.config.autoGenerateEnabled = next;
        calSaveConfig(calState.config);
        e.currentTarget.setAttribute("data-on", next);
        const rangeRow = document.getElementById("cal-auto-range-row");
        if (rangeRow) rangeRow.style.display = next ? "" : "none";
        calNotice(next ? "已开启自动生成" : "已关闭自动生成");
        if (next) calTryAutoGenerate();
    });

    document.getElementById("cal-auto-range")?.addEventListener("change", (e) => {
        calState.config.autoGenerateRange = e.target.value;
        calSaveConfig(calState.config);
        calState.autoAttempted.clear();
        calTryAutoGenerate();
    });

    const bindConfigSwitch = (id, key, onText, offText) => {
        document.getElementById(id)?.addEventListener("click", (e) => {
            const next = !(calState.config[key] !== false);
            calState.config[key] = next;
            calSaveConfig(calState.config);
            e.currentTarget.setAttribute("data-on", next);
            calNotice(next ? onText : offText);
        });
    };
    bindConfigSwitch("cal-notes-switch", "autoNotesEnabled", "已开启聊天自动记事", "已关闭聊天自动记事");
    bindConfigSwitch("cal-notify-switch", "changeNotifyEnabled", "已开启改动提醒", "已关闭改动提醒");

    document.getElementById("cal-css-example")?.addEventListener("click", () => {
        const input = document.getElementById("cal-css-input");
        if (input) input.value = CAL_CSS_EXAMPLE;
    });

    document.getElementById("cal-css-clear")?.addEventListener("click", () => {
        const input = document.getElementById("cal-css-input");
        if (input) input.value = "";
    });

    document.getElementById("cal-css-apply")?.addEventListener("click", () => {
        const input = document.getElementById("cal-css-input");
        if (!input) return;
        const css = input.value.trim();
        calSaveCustomCss(css);
        calApplyCustomCssToDom();
        calNotice("自定义 CSS 已应用");
    });
}

// ═══════════════════════════════════════════════════════════
//  每页天数弹窗
// ═══════════════════════════════════════════════════════════

function calOpenDaysModal() {
    const container = document.getElementById("cal-modal-container");
    if (!container) return;

    // 液态玻璃气泡菜单：锚定在「每页天数」按钮下方
    const screen = document.getElementById("calendar-screen");
    const anchor = document.getElementById("cal-days-btn");
    let top = 64, right = 12;
    if (screen && anchor) {
        const sr = screen.getBoundingClientRect();
        const ar = anchor.getBoundingClientRect();
        top = ar.bottom - sr.top + 8;
        right = Math.max(8, sr.right - ar.right);
    }

    const ICON_DAY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M3.5 9.5h17"/><path d="M7 14h6"/></svg>`;
    const ICON_MULTI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="4.5" width="7.4" height="15" rx="2.6"/><rect x="13.1" y="4.5" width="7.4" height="15" rx="2.6"/></svg>`;
    const ICON_LIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.4"/></svg>`;

    const cur = calState.config.daysPerPage;
    const item = (attrs, icon, label, active) => `
        <button type="button" class="calendar-days-pop-item" ${attrs} ${active ? 'data-active="true"' : ""}>
            <span class="ck">✓</span>
            <span class="pi">${icon}</span>
            <span>${label}</span>
        </button>`;

    container.innerHTML = `
        <div class="calendar-popover-overlay" id="cal-days-overlay">
            <div class="calendar-days-popover" style="top:${top}px; right:${right}px">
                ${item('data-days="1"', ICON_DAY, "单日", cur === 1)}
                ${item('data-days="2"', ICON_MULTI, "多日", cur === 2)}
                ${item('data-list="1"', ICON_LIST, "列表", false)}
            </div>
        </div>
    `;

    // 弹层已挂载，按弹层实际位置精确锚定到按钮下方
    const overlayEl = document.getElementById("cal-days-overlay");
    if (overlayEl && anchor) {
        const or = overlayEl.getBoundingClientRect();
        const ar = anchor.getBoundingClientRect();
        const pop = container.querySelector(".calendar-days-popover");
        if (pop) {
            pop.style.top = (ar.bottom - or.top + 8) + "px";
            pop.style.right = Math.max(8, or.right - ar.right) + "px";
        }
    }

    const overlay = document.getElementById("cal-days-overlay");
    if (overlay) overlay.addEventListener("click", (e) => {
        if (e.target === overlay) container.innerHTML = "";
    });

    container.querySelectorAll(".calendar-days-pop-item[data-days]").forEach(btn => {
        btn.addEventListener("click", () => {
            const n = parseInt(btn.dataset.days, 10);
            calState.config.daysPerPage = n;
            calSaveConfig(calState.config);
            container.innerHTML = "";
            calRenderDetailView();
        });
    });
    // 列表：先只占位，不做功能
    container.querySelector('.calendar-days-pop-item[data-list]')?.addEventListener("click", () => {
        container.innerHTML = "";
    });
}

// ═══════════════════════════════════════════════════════════
//  确认弹窗
// ═══════════════════════════════════════════════════════════

// 「计划」弹窗：选角色 → 选日期范围 → 预设(日常生活)/自定义内容
function calOpenGenerateModal() {
    const container = document.getElementById("cal-modal-container");
    if (!container) return;

    calState.owners = calBuildOwners(); // 刷新角色列表（包含新建角色）
    const chars = calState.owners.filter(o => o.ownerType === "character");
    if (!chars.length) {
        calNotice("还没有角色，先去创建一个吧");
        return;
    }
    if (!calState.genOwnerKey || !chars.some(o => o.key === calState.genOwnerKey)) {
        calState.genOwnerKey = chars[0].key;
    }

    const todayIso = calState.todayIso;
    const optionsHtml = `<option value="all" ${calState.genOwnerKey === "all" ? "selected" : ""}>全部</option>` +
        chars.map(o => `<option value="${o.key}" ${o.key === calState.genOwnerKey ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("");

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-plan-overlay">
            <div class="calendar-edit-modal calendar-plan-modal">
                <div class="modal-header">
                    <button type="button" class="modal-header-btn modal-header-btn-muted" id="cal-plan-close">‹</button>
                    <span class="modal-header-title">计划</span>
                    <span class="modal-header-spacer"></span>
                </div>
                <div class="modal-body hide-scrollbar" style="display:flex;flex-direction:column;gap:10px;padding-bottom:20px;">
                    <div class="field-group">
                        <label>角色</label>
                        <select id="cal-plan-char" class="cal-plan-select">${optionsHtml}</select>
                    </div>
                    <div class="grid grid-2">
                        <div class="field-group">
                            <label>开始日期</label>
                            <input type="date" id="cal-plan-start" value="${todayIso}">
                        </div>
                        <div class="field-group">
                            <label>结束日期</label>
                            <input type="date" id="cal-plan-end" value="${calAddDays(todayIso, 6)}" min="${todayIso}">
                        </div>
                    </div>
                    <div class="field-group">
                        <label>内容</label>
                        <textarea id="cal-plan-note" class="cal-plan-note" rows="4" placeholder="选填"></textarea>
                    </div>
                </div>
                <div class="calendar-confirm-footer">
                    <button type="button" class="calendar-block-btn" data-variant="ghost" id="cal-plan-cancel">取消</button>
                    <button type="button" class="calendar-block-btn" data-variant="primary" id="cal-plan-ok"
                        ${calState.isGenerating ? "disabled" : ""}>
                        ${calState.isGenerating ? "生成中…" : "确认"}
                    </button>
                </div>
            </div>
        </div>
    `;

    const startInput = document.getElementById("cal-plan-start");
    const endInput = document.getElementById("cal-plan-end");

    const syncFromEnd = () => {
        if (!endInput.value || endInput.value < startInput.value) { endInput.value = startInput.value; }
    };
    startInput.addEventListener("change", () => {
        if (!startInput.value) startInput.value = todayIso;
        endInput.min = startInput.value;
        syncFromEnd();
    });
    endInput.addEventListener("change", syncFromEnd);

    document.getElementById("cal-plan-char").addEventListener("change", (e) => {
        calState.genOwnerKey = e.target.value;
    });

    const overlay = document.getElementById("cal-plan-overlay");
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) container.innerHTML = "";
    });
    document.getElementById("cal-plan-close")?.addEventListener("click", () => { container.innerHTML = ""; });
    document.getElementById("cal-plan-cancel")?.addEventListener("click", () => { container.innerHTML = ""; });
    document.getElementById("cal-plan-ok")?.addEventListener("click", () => {
        const startDate = startInput.value || todayIso;
        if (!endInput.value || endInput.value < startDate) endInput.value = startDate;
        const dayCount = Math.round((calParseIsoDate(endInput.value) - calParseIsoDate(startDate)) / 86400000) + 1;
        if (dayCount > 31) {
            calNotice("一次最多生成 31 天");
            return;
        }
        const note = (document.getElementById("cal-plan-note")?.value || "").trim();
        container.innerHTML = "";
        calHandleGenerate(calState.genOwnerKey, { startDate, days: dayCount, note });
    });
}

// ═══════════════════════════════════════════════════════════
//  AI 生成
// ═══════════════════════════════════════════════════════════

async function calHandleGenerate(ownerKey, opts = {}) {
    if (calState.isGenerating) return;

    const startDate = opts.startDate || calGetWeekStartForSelected();
    const days = opts.days || 7;

    // 「全部」：为所有角色依次生成
    if (ownerKey === "all") {
        const chars = calState.owners.filter(o => o.ownerType === "character");
        if (!chars.length) { calNotice("还没有角色，先去创建一个吧"); return; }

        calState.isGenerating = true;
        calSyncGeneratingState();
        const okNames = [];
        const failMsgs = [];
        const generatedItems = [];
        for (const owner of chars) {
            const result = await calGenerateScheduleRange(
                owner.ownerType, owner.ownerId, startDate, days,
                owner.name, calGetOwnerPersona(owner), { note: opts.note || "" },
            );
            if (result.success) {
                okNames.push(owner.name);
                generatedItems.push(...(result.items || []));
            } else failMsgs.push(`${owner.name}：${result.error || "生成失败"}`);
        }
        calState.isGenerating = false;
        calSyncGeneratingState();

        calMarkAiChanges(generatedItems, "");
        calRefreshPlans();
        calRerenderCurrentView();
        if (okNames.length && !failMsgs.length) {
            calNotice(`已生成全部 ${okNames.length} 个角色的计划`);
        } else if (okNames.length) {
            calNotice(`已生成 ${okNames.join("、")}；失败：${failMsgs.join("；")}`);
        } else {
            calNotice(failMsgs[0] || "生成失败");
        }
        return;
    }

    const owner = calState.owners.find(o => o.key === ownerKey) || calGetSelectedOwner();
    if (!owner || owner.ownerType !== "character") return;

    calState.isGenerating = true;
    calSyncGeneratingState();

    const result = await calGenerateScheduleRange(
        owner.ownerType, owner.ownerId, startDate, days,
        owner.name, calGetOwnerPersona(owner), { note: opts.note || "" },
    );

    calState.isGenerating = false;
    calSyncGeneratingState();

    if (!result.success) {
        calNotice(result.error || "生成失败");
        return;
    }

    calMarkAiChanges(result.items, owner.name);
    calRefreshPlans();
    calRerenderCurrentView();
    calNotice("计划已生成");
}

// 取角色人设（角色 + 世界书由引擎内部补充）
function calGetOwnerPersona(owner) {
    if (typeof db === "undefined" || !Array.isArray(db.characters)) return "";
    const char = db.characters.find(c => c.id === owner.ownerId);
    return char?.persona || "";
}

// ═══════════════════════════════════════════════════════════
//  自动生成（惰性触发：打开日历/开启开关时检查， blanks 才生成）
//  设计：IPA 在手机上不会常驻后台，定时不现实。改为每次
//  进入日历时惰性检查——某角色在生成范围内一条计划都没有
//  （完全空白）时，才为它生成一次，填满整个范围。
// ═══════════════════════════════════════════════════════════

function calGetAutoRangeInfo() {
    const range = calState.config.autoGenerateRange || "week";
    const start = calState.todayIso;
    if (range === "7") return { start, days: 7, key: `${start}:7` };
    if (range === "14") return { start, days: 14, key: `${start}:14` };
    // 本周：今天 → 本周日（周日的 getDay()=0，正好 7-0=7 天）
    const d = calParseIsoDate(start);
    return { start, days: 7 - d.getDay(), key: `${start}:week` };
}

async function calTryAutoGenerate() {
    if (!calState.config.autoGenerateEnabled || calState.isGenerating) return;
    const chars = (typeof db !== "undefined" && Array.isArray(db.characters)) ? db.characters : [];
    if (!chars.length) return;

    const { start, days, key } = calGetAutoRangeInfo();
    if (days < 1) return;
    const end = calAddDays(start, days - 1);

    const allItems = calGetAllItemsAggregated();
    const targets = chars.filter(char => {
        const ownerKey = `character:${char.id}`;
        if (calState.autoAttempted.has(`${ownerKey}:${key}`)) return false;
        // 范围内已有任何一条计划（手动或生成）则跳过
        return !allItems.some(it => it.ownerKey === ownerKey && it.date >= start && it.date <= end);
    });
    if (!targets.length) return;

    calState.isGenerating = true;
    calSyncGeneratingState();

    const done = [];
    const generatedItems = [];
    for (const char of targets) {
        calState.autoAttempted.add(`character:${char.id}:${key}`);
        const name = char.remarkName || char.realName || char.name || "未命名";
        const result = await calGenerateScheduleRange(
            "character", char.id, start, days, name, char.persona || "", {},
        );
        if (result.success) {
            done.push(name);
            generatedItems.push(...(result.items || []));
        }
    }

    calState.isGenerating = false;
    calSyncGeneratingState();

    if (done.length) {
        calMarkAiChanges(generatedItems, "");
        calRefreshPlans();
        calRerenderCurrentView();
        calNotice(`已自动生成 ${done.join("、")} 的计划`);
    }
}

// ═══════════════════════════════════════════════════════════
//  工具
// ═══════════════════════════════════════════════════════════

function calRerenderCurrentView() {
    if (calState.view === "month") {
        calRenderMonthView();
    } else {
        calRenderDetailView();
    }
}
