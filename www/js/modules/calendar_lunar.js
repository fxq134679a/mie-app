// 农历 / 节气 / 节日库 (js/modules/calendar_lunar.js)
// 供日历 App 显示 iOS 风格的农历日、节气与节日胶囊
(function () {
    'use strict';

    /* ── 农历数据表 1900-2100（标准 lunarInfo） ── */
    const LUNAR_INFO = [
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
        0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
        0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
        0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
        0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
        0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
        0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
        0x0d520
    ];

    const LUNAR_MONTH_CN = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
    const LUNAR_DAY_CN = [
        "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
        "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
        "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"
    ];
    const GAN = "甲乙丙丁戊己庚辛壬癸";
    const ZHI = "子丑寅卯辰巳午未申酉戌亥";
    const ZODIAC = "鼠牛虎兔龙蛇马羊猴鸡狗猪";

    function lYearDays(y) {
        let sum = 348;
        for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
        return sum + leapDays(y);
    }
    function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
    function leapDays(y) { return leapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
    function monthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }

    // 公历 Date → 农历
    function calSolarToLunar(date) {
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        let offset = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
        let i, temp = 0;
        for (i = 1900; i < 2101 && offset > 0; i++) { temp = lYearDays(i); offset -= temp; }
        if (offset < 0) { offset += temp; i--; }
        const lunarYear = i;
        const leap = leapMonth(i);
        let isLeap = false;
        for (i = 1; i < 13 && offset > 0; i++) {
            if (leap > 0 && i === (leap + 1) && isLeap === false) { --i; isLeap = true; temp = leapDays(lunarYear); }
            else { temp = monthDays(lunarYear, i); }
            if (isLeap === true && i === (leap + 1)) isLeap = false;
            offset -= temp;
        }
        if (offset === 0 && leap > 0 && i === leap + 1) {
            if (isLeap) { isLeap = false; } else { isLeap = true; --i; }
        }
        if (offset < 0) { offset += temp; --i; }
        const lunarMonth = i;
        const lunarDay = offset + 1;
        const gzY = (lunarYear - 4) % 10, gzZ = (lunarYear - 4) % 12;
        return {
            year: lunarYear,
            month: lunarMonth,
            day: lunarDay,
            isLeap,
            monthName: (isLeap ? "闰" : "") + LUNAR_MONTH_CN[lunarMonth - 1] + "月",
            dayName: LUNAR_DAY_CN[lunarDay - 1] || "",
            gzYear: GAN[gzY] + ZHI[gzZ],
            zodiac: ZODIAC[gzZ],
        };
    }

    /* ── 节气（寿星公式，21 世纪） ── */
    const TERM_NAMES = ["小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
        "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
        "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"];
    const TERM_C21 = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1,
        5.52, 21.04, 5.678, 21.37, 7.108, 22.83, 7.5, 23.13,
        7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94];

    // 返回某公历月内 {日: 节气名}
    function calSolarTermsOfMonth(year, month) {
        const y = year % 100;
        const map = {};
        if (y === 0 && year >= 2100) return map;
        const L = Math.floor((y - 1) / 4);
        for (let k = 0; k < 2; k++) {
            const idx = (month - 1) * 2 + k;
            const day = Math.floor(y * 0.2422 + TERM_C21[idx]) - L;
            map[day] = TERM_NAMES[idx];
        }
        return map;
    }

    /* ── 节日 ── */
    const SOLAR_FESTIVALS = {
        "1-1": "元旦", "2-14": "情人节", "3-8": "妇女节", "3-12": "植树节",
        "5-1": "劳动节", "5-4": "青年节", "6-1": "儿童节", "7-1": "建党节",
        "8-1": "建军节", "9-10": "教师节", "10-1": "国庆节", "12-25": "圣诞节",
    };
    const LUNAR_FESTIVALS = {
        "1-1": "春节", "1-15": "元宵节", "2-2": "龙抬头", "3-3": "上巳节",
        "5-5": "端午节", "7-7": "七夕节", "7-15": "中元节", "8-15": "中秋节",
        "9-9": "重阳节", "12-8": "腊八节",
    };

    // 返回某公历日的节日名（含除夕），无则 null
    function calFestivalOf(date) {
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        const solar = SOLAR_FESTIVALS[m + "-" + d];
        if (solar) return solar;
        const lu = calSolarToLunar(date);
        if (!lu.isLeap) {
            const lun = LUNAR_FESTIVALS[lu.month + "-" + lu.day];
            if (lun) return lun;
            // 除夕：农历十二月（有闰腊月时取闰腊月）的最后一天
            if (lu.month === 12 && lu.isLeap === (leapMonth(lu.year) === 12)) {
                const lastDay = (leapMonth(lu.year) === 12) ? leapDays(lu.year) : monthDays(lu.year, 12);
                if (lu.day === lastDay) return "除夕";
            }
        }
        return null;
    }

    // 汇总：某公历日的 {festival, term, lunar}（视图层直接用）
    function calDayInfo(date) {
        const lunar = calSolarToLunar(date);
        const term = calSolarTermsOfMonth(date.getFullYear(), date.getMonth() + 1)[date.getDate()] || null;
        const festival = calFestivalOf(date);
        return { lunar, term, festival };
    }

    window.calSolarToLunar = calSolarToLunar;
    window.calSolarTermsOfMonth = calSolarTermsOfMonth;
    window.calFestivalOf = calFestivalOf;
    window.calDayInfo = calDayInfo;
})();
