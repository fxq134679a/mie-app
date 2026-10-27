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
    selectedOwnerKey: "user:self",
    owners: [],
    config: null,
    ownerPlans: [],
    isGenerating: false,
    fabMenuOpen: false,
    editingItem: null,
    autoAttempted: new Set(),
    nowMinutes: new Date().getHours() * 60 + new Date().getMinutes(),
    nowTimer: null,
    detailCenter: null,
};

function calNotice(msg) {
    if (typeof showToast === "function") showToast(msg);
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
            name: char.remarkName || char.realName || "未命名",
            avatar: char.avatar || null,
        });
    }
    return options;
}

function calGetSelectedOwner() {
    return calState.owners.find(o => o.key === calState.selectedOwnerKey) || calState.owners[0] || null;
}

function calGetWeekStartForSelected() {
    return calGetWeekStartIso(calParseIsoDate(calState.selectedDate));
}

function calRefreshPlans() {
    const owner = calGetSelectedOwner();
    if (!owner) return;
    calState.ownerPlans = calGetAllItemsForOwner(owner.ownerType, owner.ownerId);
}

function calGetItemsByDate() {
    return calBuildItemsByDate(calState.ownerPlans);
}

function calApplyTheme() {
    const screen = document.getElementById("calendar-screen");
    if (screen) screen.setAttribute("data-calendar-theme", calState.config.theme);
}

function calApplyCustomCssToDom() {
    let el = document.getElementById("cal-custom-css");
    if (!el) {
        el = document.createElement("style");
        el.id = "cal-custom-css";
        document.head.appendChild(el);
    }
    const css = calLoadCustomCss();
    el.textContent = css ? `#calendar-screen { ${css} }` : "";
}

// ═══════════════════════════════════════════════════════════
//  初始化
// ═══════════════════════════════════════════════════════════

function setupCalendar() {
    calState.config = calLoadConfig();
    calState.owners = calBuildOwners();
    calState.todayIso = calFormatIsoDate(new Date());
    calState.selectedDate = calState.todayIso;
    calRefreshPlans();
    calApplyTheme();
    calApplyCustomCssToDom();
    calRenderShell();
    calRenderMonthView();

    calState.nowTimer = setInterval(() => {
        const now = new Date();
        calState.nowMinutes = now.getHours() * 60 + now.getMinutes();
        calUpdateNowLine();
    }, 60000);
}

function calRenderShell() {
    const screen = document.getElementById("calendar-screen");
    if (!screen) return;
    screen.innerHTML = `
        <div class="calendar-page" id="cal-page"></div>
        <div id="cal-fab-container"></div>
        <div id="cal-modal-container"></div>
    `;
    calRenderFab();
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

    const ownerStripHtml = calBuildOwnerStripHtml();

    let monthsHtml = "";
    for (const block of months) {
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
                cellsHtml += `
                    <button type="button" class="calendar-month-cell"
                        data-iso="${cell.iso}"
                        ${isToday ? 'data-today="true"' : ""}
                        style="grid-column-start: ${cell.weekday + 1}">
                        <span class="calendar-month-num">${cell.day}</span>
                        <span class="calendar-month-dots">${dotHtml}</span>
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
                <button type="button" class="calendar-icon-btn" id="cal-theme-btn" aria-label="主题">
                    🎨
                </button>
            </div>
            ${ownerStripHtml}
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
    calScrollToMonth(todayYm, false);
    calMeasureHeaderHeight();
}

function calBuildOwnerStripHtml() {
    let html = `<section class="calendar-owner-strip hide-scrollbar">`;
    for (const owner of calState.owners) {
        const isActive = owner.key === calState.selectedOwnerKey;
        const avatarHtml = owner.avatar
            ? `<img src="${owner.avatar}" alt="">`
            : `<span class="cal-avatar-circle">${(owner.name || "?")[0]}</span>`;
        html += `
            <button type="button" class="calendar-owner-chip"
                data-owner-key="${owner.key}"
                ${isActive ? 'data-active="true"' : ""}>
                ${avatarHtml}
                <span>${owner.name}</span>
            </button>`;
    }
    html += `</section>`;
    return html;
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
    const header = document.getElementById("cal-month-header");
    const headerH = header ? header.offsetHeight : 0;
    scroller.scrollTo({
        top: block.offsetTop - headerH,
        behavior: smooth ? "smooth" : "auto",
    });
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

    const themeBtn = document.getElementById("cal-theme-btn");
    if (themeBtn) themeBtn.addEventListener("click", () => calOpenThemeModal());

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
            const chip = e.target.closest(".calendar-owner-chip");
            if (chip) {
                calState.selectedOwnerKey = chip.dataset.ownerKey;
                calState.selectedDate = calState.todayIso;
                calState.fabMenuOpen = false;
                calRefreshPlans();
                calRenderMonthView();
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
    const backLabel = `${selectedDate.getMonth() + 1}月`;

    const ownerStripHtml = calBuildOwnerStripHtml();

    page.className = "calendar-page calendar-page-detail";
    page.innerHTML = `
        <div class="calendar-apple-topbar">
            <button type="button" class="calendar-pill-btn calendar-back-btn" id="cal-detail-back">
                <span>‹</span> ${backLabel}
            </button>
            <span class="calendar-topbar-space"></span>
            <button type="button" class="calendar-icon-btn" id="cal-days-btn" aria-label="每页天数">
                ▧
            </button>
        </div>
        ${ownerStripHtml}
        <div class="calendar-weekday-head calendar-strip-head" aria-hidden="true">
            ${CAL_WEEKDAY_SHORT.map(w => `<span>${w}</span>`).join("")}
        </div>
        <div class="calendar-week-strip hide-scrollbar" id="cal-strip">
            ${calBuildStripPanelsHtml(weeks)}
        </div>
        <div class="calendar-tl-headrow">
            <div class="calendar-tl-headrow-gutter"></div>
            <div class="calendar-tl-headrow-days hide-scrollbar" id="cal-tl-head"
                style="--tl-day-w: ${100 / dpp}%">
                ${calBuildDayHeadersHtml(days, dpp)}
            </div>
        </div>
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
            cellsHtml += `
                <button type="button" class="calendar-strip-cell"
                    data-date="${iso}"
                    ${isToday ? 'data-today="true"' : ""}>
                    <span class="calendar-strip-num">${d.getDate()}</span>
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
        if (dpp >= 5) {
            html += `
                <div class="calendar-tl-day-head" data-today="${isToday}">
                    <b>${d.getDate()}日</b>
                    <span>${CAL_WEEKDAY_FULL[d.getDay()]}</span>
                </div>`;
        } else {
            html += `
                <div class="calendar-tl-day-head" data-today="${isToday}">
                    <b>${d.getMonth() + 1}月${d.getDate()}日 – ${CAL_WEEKDAY_FULL[d.getDay()]}</b>
                    <span></span>
                </div>`;
        }
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
            const aiSuffix = item.source === "generated" ? " · AI" : "";
            eventsHtml += `
                <button type="button" class="calendar-tl-event"
                    data-color="${item.colorKey}"
                    data-item-id="${item.id}"
                    style="top:${pos.top}px; height:${pos.height}px; left:calc(${pos.left}% + 3px); width:calc(${pos.width}% - 6px)">
                    <b>${emojiPrefix}${escapeHtml(item.title)}</b>
                    <span>${item.startTime}–${item.endTime}${locationSuffix}${aiSuffix}</span>
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

    const todayBtn = document.getElementById("cal-today-btn");
    if (todayBtn) todayBtn.addEventListener("click", () => calGotoToday(days));

    const strip = document.getElementById("cal-strip");
    if (strip) {
        strip.addEventListener("click", (e) => {
            const cell = e.target.closest(".calendar-strip-cell");
            if (cell) {
                calApplySelection(cell.dataset.date, { fromStrip: true }, days);
            }
            const chip = e.target.closest(".calendar-owner-chip");
            if (chip) {
                calState.selectedOwnerKey = chip.dataset.ownerKey;
                calState.selectedDate = calState.todayIso;
                calState.detailCenter = calState.todayIso;
                calState.fabMenuOpen = false;
                calRefreshPlans();
                calRenderDetailView();
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
    calPaintSelection(true, prev);
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

    const x = cell.offsetLeft + cell.offsetWidth / 2 - 24;
    bubble.style.display = "block";
    bubble.classList.toggle("is-today", sel === calState.todayIso);

    if (animate && prevIso && calSundayStart(prevIso) === sundayStart) {
        const prevCell = panel.querySelector(`[data-date="${prevIso}"]`);
        const x0 = prevCell ? prevCell.offsetLeft + prevCell.offsetWidth / 2 - 24 : x;
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
    pill.style.width = `${cellW * dpp}px`;
    pill.style.transform = `translateX(${d.getDay() * cellW}px)`;
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
//  FAB 菜单
// ═══════════════════════════════════════════════════════════

function calRenderFab() {
    const container = document.getElementById("cal-fab-container");
    if (!container) return;
    container.innerHTML = `
        <div class="calendar-fab-stack" id="cal-fab-stack">
            <button type="button" class="calendar-fab calendar-fab-primary" id="cal-fab-btn">
                <span id="cal-fab-icon" style="font-size:20px;transition:transform 0.2s">+</span>
            </button>
        </div>
    `;

    const fabBtn = document.getElementById("cal-fab-btn");
    if (fabBtn) {
        fabBtn.addEventListener("click", () => {
            const owner = calGetSelectedOwner();
            if (owner?.ownerType === "character") {
                calToggleFabMenu();
            } else {
                const date = calState.view === "detail" ? calState.selectedDate : calState.todayIso;
                calOpenNewDraft(date);
            }
        });
    }
}

function calToggleFabMenu() {
    calState.fabMenuOpen = !calState.fabMenuOpen;
    calRenderFabMenu();
}

function calCloseFabMenu() {
    calState.fabMenuOpen = false;
    calRenderFabMenu();
}

function calRenderFabMenu() {
    const stack = document.getElementById("cal-fab-stack");
    if (!stack) return;

    const existing = stack.querySelector(".calendar-fab-backdrop");
    if (existing) existing.remove();
    const existingMenu = stack.querySelector(".calendar-fab-menu");
    if (existingMenu) existingMenu.remove();

    const icon = document.getElementById("cal-fab-icon");
    if (icon) icon.style.transform = calState.fabMenuOpen ? "rotate(45deg)" : "";

    const fabBtn = document.getElementById("cal-fab-btn");
    if (fabBtn) {
        fabBtn.setAttribute("data-loading", calState.isGenerating ? "true" : "false");
    }

    if (!calState.fabMenuOpen) return;

    const owner = calGetSelectedOwner();
    if (!owner || owner.ownerType !== "character") return;

    const backdrop = document.createElement("div");
    backdrop.className = "calendar-fab-backdrop";
    backdrop.addEventListener("click", () => calCloseFabMenu());
    stack.parentElement.insertBefore(backdrop, stack);

    const autoEnabled = calState.config.autoGenerateEnabled;
    const menu = document.createElement("div");
    menu.className = "calendar-fab-menu";
    menu.innerHTML = `
        <button type="button" class="calendar-fab-menu-item" id="cal-fab-new">
            <span style="font-size:15px">+</span> 新增日程
        </button>
        <button type="button" class="calendar-fab-menu-item" id="cal-fab-generate"
            ${calState.isGenerating ? "disabled" : ""}>
            <span style="font-size:15px">✨</span>
            ${calState.isGenerating ? "生成中…" : "AI 生成本周"}
        </button>
        <button type="button" class="calendar-fab-menu-item" id="cal-fab-auto"
            data-on="${autoEnabled}">
            <span style="font-size:15px">🤖</span> 每周自动生成
            <i class="calendar-fab-menu-state">${autoEnabled ? "已开" : "已关"}</i>
        </button>
    `;
    stack.appendChild(menu);

    document.getElementById("cal-fab-new")?.addEventListener("click", () => {
        calCloseFabMenu();
        const date = calState.view === "detail" ? calState.selectedDate : calState.todayIso;
        calOpenNewDraft(date);
    });

    document.getElementById("cal-fab-generate")?.addEventListener("click", () => {
        calCloseFabMenu();
        calShowGenerateConfirm();
    });

    document.getElementById("cal-fab-auto")?.addEventListener("click", () => {
        calCloseFabMenu();
        calShowAutoConfirm();
    });
}

// ═══════════════════════════════════════════════════════════
//  事件编辑弹窗
// ═══════════════════════════════════════════════════════════

function calOpenNewDraft(date) {
    const base = calCreateDefaultDraft(date);
    calState.editingItem = {
        date: base.date,
        endDate: base.date,
        startTime: base.startTime,
        endTime: base.endTime,
        location: base.location,
        title: base.title,
        emoji: base.emoji,
    };
    calRenderEditModal();
}

function calOpenEditItem(item) {
    calState.editingItem = {
        id: item.id,
        date: item.date,
        endDate: item.date,
        originalDate: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        location: item.location,
        title: item.title,
        emoji: item.emoji || "",
        colorKey: item.colorKey,
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
}

function calCloseEditModal() {
    calState.editingItem = null;
    const container = document.getElementById("cal-modal-container");
    if (container) container.innerHTML = "";
}

function calSaveDraft() {
    const owner = calGetSelectedOwner();
    const draft = calState.editingItem;
    if (!owner || !draft) return;

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
        });
    }

    calCloseEditModal();
    calRefreshPlans();
    calRerenderCurrentView();
    calNotice(dayCount > 1 ? `已创建 ${dayCount} 天的日程` : "日程已保存");
}

function calHandleDeleteItem() {
    const owner = calGetSelectedOwner();
    const draft = calState.editingItem;
    if (!owner || !draft?.id) return;

    const targetWeekStart = calGetWeekStartIso(calParseIsoDate(draft.originalDate || draft.date));
    calDeleteItem(owner.ownerType, owner.ownerId, targetWeekStart, draft.id);
    calCloseEditModal();
    calRefreshPlans();
    calRerenderCurrentView();
    calNotice("日程已删除");
}

// ═══════════════════════════════════════════════════════════
//  主题弹窗
// ═══════════════════════════════════════════════════════════

function calOpenThemeModal() {
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

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-theme-overlay">
            <div class="calendar-edit-modal calendar-theme-modal" id="cal-theme-modal">
                <div class="calendar-theme-modal-head">
                    <strong>主题</strong>
                    <button type="button" class="calendar-icon-btn" id="cal-theme-close" aria-label="关闭" style="font-size:14px">✕</button>
                </div>
                <div class="calendar-theme-grid">${themesHtml}</div>
                <div class="calendar-css-label">自定义 CSS</div>
                <textarea class="calendar-css-textarea" id="cal-css-input"
                    placeholder="/* 输入 CSS 覆盖日历样式... */"
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

    const optionsHtml = CAL_DAYS_OPTIONS.map(n => `
        <button type="button" class="calendar-days-option"
            data-days="${n}"
            ${calState.config.daysPerPage === n ? 'data-active="true"' : ""}>
            <b>${n}</b>
            <span>${n === 1 ? "单日" : `${n} 天`}</span>
        </button>
    `).join("");

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-days-overlay">
            <div class="calendar-edit-modal calendar-days-modal">
                <div class="calendar-theme-modal-head">
                    <strong>每页天数</strong>
                    <button type="button" class="calendar-icon-btn" id="cal-days-close" aria-label="关闭" style="font-size:14px">✕</button>
                </div>
                <div class="calendar-days-options">${optionsHtml}</div>
            </div>
        </div>
    `;

    const overlay = document.getElementById("cal-days-overlay");
    if (overlay) overlay.addEventListener("click", (e) => {
        if (e.target === overlay) container.innerHTML = "";
    });

    document.getElementById("cal-days-close")?.addEventListener("click", () => { container.innerHTML = ""; });

    container.querySelectorAll(".calendar-days-option").forEach(btn => {
        btn.addEventListener("click", () => {
            const n = parseInt(btn.dataset.days, 10);
            calState.config.daysPerPage = n;
            calSaveConfig(calState.config);
            container.innerHTML = "";
            calRenderDetailView();
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  确认弹窗
// ═══════════════════════════════════════════════════════════

function calShowGenerateConfirm() {
    const owner = calGetSelectedOwner();
    if (!owner) return;
    const container = document.getElementById("cal-modal-container");
    if (!container) return;

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-confirm-overlay">
            <div class="calendar-edit-modal calendar-confirm-dialog">
                <div class="calendar-confirm-icon" style="font-size:26px">✨</div>
                <div class="calendar-confirm-title">确认生成日程？</div>
                <div class="calendar-confirm-desc">
                    将为 <strong>${escapeHtml(owner.name)}</strong> 生成一周日程并覆盖当前已有 AI 安排（手动添加的保留）
                </div>
                <div class="calendar-confirm-footer">
                    <button type="button" class="calendar-block-btn" data-variant="ghost" id="cal-confirm-cancel">取消</button>
                    <button type="button" class="calendar-block-btn" data-variant="primary" id="cal-confirm-ok"
                        ${calState.isGenerating ? "disabled" : ""}>
                        ${calState.isGenerating ? "生成中…" : "确认"}
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById("cal-confirm-overlay")?.addEventListener("click", (e) => {
        if (e.target.id === "cal-confirm-overlay") container.innerHTML = "";
    });
    document.getElementById("cal-confirm-cancel")?.addEventListener("click", () => { container.innerHTML = ""; });
    document.getElementById("cal-confirm-ok")?.addEventListener("click", () => {
        container.innerHTML = "";
        calHandleGenerate();
    });
}

function calShowAutoConfirm() {
    const owner = calGetSelectedOwner();
    if (!owner) return;
    const container = document.getElementById("cal-modal-container");
    if (!container) return;

    const enabled = calState.config.autoGenerateEnabled;
    const title = enabled ? "关闭自动生成？" : "开启自动生成？";
    const desc = enabled
        ? "关闭后将不再自动为角色生成每周日程"
        : `每周将自动为 <strong>${escapeHtml(owner.name)}</strong> 生成日程安排`;

    container.innerHTML = `
        <div class="calendar-modal-overlay" id="cal-confirm-overlay">
            <div class="calendar-edit-modal calendar-confirm-dialog">
                <div class="calendar-confirm-icon" style="font-size:26px">🤖</div>
                <div class="calendar-confirm-title">${title}</div>
                <div class="calendar-confirm-desc">${desc}</div>
                <div class="calendar-confirm-footer">
                    <button type="button" class="calendar-block-btn" data-variant="ghost" id="cal-confirm-cancel">取消</button>
                    <button type="button" class="calendar-block-btn" data-variant="primary" id="cal-confirm-ok">确认</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById("cal-confirm-overlay")?.addEventListener("click", (e) => {
        if (e.target.id === "cal-confirm-overlay") container.innerHTML = "";
    });
    document.getElementById("cal-confirm-cancel")?.addEventListener("click", () => { container.innerHTML = ""; });
    document.getElementById("cal-confirm-ok")?.addEventListener("click", () => {
        const next = !enabled;
        calState.config.autoGenerateEnabled = next;
        calSaveConfig(calState.config);
        container.innerHTML = "";
        calNotice(next ? "已开启每周自动生成" : "已关闭每周自动生成");
    });
}

// ═══════════════════════════════════════════════════════════
//  AI 生成
// ═══════════════════════════════════════════════════════════

async function calHandleGenerate() {
    const owner = calGetSelectedOwner();
    if (!owner || calState.isGenerating || owner.ownerType !== "character") return;

    const char = (typeof db !== "undefined" && Array.isArray(db.characters))
        ? db.characters.find(c => c.id === owner.ownerId)
        : null;

    calState.isGenerating = true;
    calRenderFab();

    const weekStart = calGetWeekStartForSelected();
    const result = await calGenerateWeeklySchedule(
        owner.ownerType, owner.ownerId, weekStart,
        owner.name, char?.persona || "",
    );

    calState.isGenerating = false;
    calRenderFab();

    if (!result.success) {
        calNotice(result.error || "生成失败");
        return;
    }

    calRefreshPlans();
    calRerenderCurrentView();
    calNotice("本周日程已生成");
}

function calTryAutoGenerate() {
    const owner = calGetSelectedOwner();
    if (!owner || !calState.config.autoGenerateEnabled || owner.ownerType !== "character" || calState.isGenerating) return;

    const weekStart = calGetWeekStartForSelected();
    const autoKey = `${owner.ownerType}:${owner.ownerId}:${weekStart}`;
    if (calState.autoAttempted.has(autoKey)) return;

    const existingPlan = calLoadWeekPlan(owner.ownerType, owner.ownerId, weekStart);
    if (existingPlan && existingPlan.items.length > 0) return;

    calState.autoAttempted.add(autoKey);

    const char = (typeof db !== "undefined" && Array.isArray(db.characters))
        ? db.characters.find(c => c.id === owner.ownerId)
        : null;

    calState.isGenerating = true;
    calRenderFab();

    calGenerateWeeklySchedule(
        owner.ownerType, owner.ownerId, weekStart,
        owner.name, char?.persona || "",
    ).then(result => {
        calState.isGenerating = false;
        calRenderFab();
        if (!result.success) {
            calNotice(result.error || "自动生成失败");
            return;
        }
        calRefreshPlans();
        calRerenderCurrentView();
        calNotice("已自动生成本周角色日程");
    });
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
