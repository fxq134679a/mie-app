// 微信内置表情（小黄脸）资源表 + 文本短码渲染
// 素材来自 https://github.com/xxk8/wechat-emojis （MIT 许可的整理包），图片版权归腾讯所有，仅限非商用。
// 消息里存的是 [微笑] 这样的短码文本，显示时才换成图片，所以 AI 和搜索都还能读懂原文。
(function () {
    'use strict';

    const EMOJIS = [
    { n: "微笑", g: "face", f: "assets/wxemoji/000.png" },
    { n: "撇嘴", g: "face", f: "assets/wxemoji/001.png" },
    { n: "色", g: "face", f: "assets/wxemoji/002.png" },
    { n: "发呆", g: "face", f: "assets/wxemoji/003.png" },
    { n: "得意", g: "face", f: "assets/wxemoji/004.png" },
    { n: "流泪", g: "face", f: "assets/wxemoji/005.png" },
    { n: "害羞", g: "face", f: "assets/wxemoji/006.png" },
    { n: "闭嘴", g: "face", f: "assets/wxemoji/007.png" },
    { n: "睡", g: "face", f: "assets/wxemoji/008.png" },
    { n: "大哭", g: "face", f: "assets/wxemoji/009.png" },
    { n: "尴尬", g: "face", f: "assets/wxemoji/010.png" },
    { n: "发怒", g: "face", f: "assets/wxemoji/011.png" },
    { n: "调皮", g: "face", f: "assets/wxemoji/012.png" },
    { n: "呲牙", g: "face", f: "assets/wxemoji/013.png" },
    { n: "惊讶", g: "face", f: "assets/wxemoji/014.png" },
    { n: "难过", g: "face", f: "assets/wxemoji/015.png" },
    { n: "囧", g: "face", f: "assets/wxemoji/016.png" },
    { n: "抓狂", g: "face", f: "assets/wxemoji/017.png" },
    { n: "吐", g: "face", f: "assets/wxemoji/018.png" },
    { n: "偷笑", g: "face", f: "assets/wxemoji/019.png" },
    { n: "愉快", g: "face", f: "assets/wxemoji/020.png" },
    { n: "白眼", g: "face", f: "assets/wxemoji/021.png" },
    { n: "傲慢", g: "face", f: "assets/wxemoji/022.png" },
    { n: "困", g: "face", f: "assets/wxemoji/023.png" },
    { n: "惊恐", g: "face", f: "assets/wxemoji/024.png" },
    { n: "憨笑", g: "face", f: "assets/wxemoji/025.png" },
    { n: "悠闲", g: "face", f: "assets/wxemoji/026.png" },
    { n: "咒骂", g: "face", f: "assets/wxemoji/027.png" },
    { n: "疑问", g: "face", f: "assets/wxemoji/028.png" },
    { n: "嘘", g: "face", f: "assets/wxemoji/029.png" },
    { n: "晕", g: "face", f: "assets/wxemoji/030.png" },
    { n: "衰", g: "face", f: "assets/wxemoji/031.png" },
    { n: "骷髅", g: "face", f: "assets/wxemoji/032.png" },
    { n: "敲打", g: "face", f: "assets/wxemoji/033.png" },
    { n: "再见", g: "face", f: "assets/wxemoji/034.png" },
    { n: "擦汗", g: "face", f: "assets/wxemoji/035.png" },
    { n: "抠鼻", g: "face", f: "assets/wxemoji/036.png" },
    { n: "鼓掌", g: "face", f: "assets/wxemoji/037.png" },
    { n: "坏笑", g: "face", f: "assets/wxemoji/038.png" },
    { n: "右哼哼", g: "face", f: "assets/wxemoji/039.png" },
    { n: "鄙视", g: "face", f: "assets/wxemoji/040.png" },
    { n: "委屈", g: "face", f: "assets/wxemoji/041.png" },
    { n: "快哭了", g: "face", f: "assets/wxemoji/042.png" },
    { n: "阴险", g: "face", f: "assets/wxemoji/043.png" },
    { n: "亲亲", g: "face", f: "assets/wxemoji/044.png" },
    { n: "可怜", g: "face", f: "assets/wxemoji/045.png" },
    { n: "笑脸", g: "face", f: "assets/wxemoji/046.png" },
    { n: "生病", g: "face", f: "assets/wxemoji/047.png" },
    { n: "脸红", g: "face", f: "assets/wxemoji/048.png" },
    { n: "破涕为笑", g: "face", f: "assets/wxemoji/049.png" },
    { n: "恐惧", g: "face", f: "assets/wxemoji/050.png" },
    { n: "失望", g: "face", f: "assets/wxemoji/051.png" },
    { n: "无语", g: "face", f: "assets/wxemoji/052.png" },
    { n: "嘿哈", g: "face", f: "assets/wxemoji/053.png" },
    { n: "捂脸", g: "face", f: "assets/wxemoji/054.png" },
    { n: "机智", g: "face", f: "assets/wxemoji/055.png" },
    { n: "皱眉", g: "face", f: "assets/wxemoji/056.png" },
    { n: "耶", g: "face", f: "assets/wxemoji/057.png" },
    { n: "吃瓜", g: "face", f: "assets/wxemoji/058.png" },
    { n: "加油", g: "face", f: "assets/wxemoji/059.png" },
    { n: "汗", g: "face", f: "assets/wxemoji/060.png" },
    { n: "天啊", g: "face", f: "assets/wxemoji/061.png" },
    { n: "Emm", g: "face", f: "assets/wxemoji/062.png" },
    { n: "社会社会", g: "face", f: "assets/wxemoji/063.png" },
    { n: "旺柴", g: "face", f: "assets/wxemoji/064.png" },
    { n: "好的", g: "face", f: "assets/wxemoji/065.png" },
    { n: "打脸", g: "face", f: "assets/wxemoji/066.png" },
    { n: "哇", g: "face", f: "assets/wxemoji/067.png" },
    { n: "翻白眼", g: "face", f: "assets/wxemoji/068.png" },
    { n: "666", g: "face", f: "assets/wxemoji/069.png" },
    { n: "让我看看", g: "face", f: "assets/wxemoji/070.png" },
    { n: "叹气", g: "face", f: "assets/wxemoji/071.png" },
    { n: "苦涩", g: "face", f: "assets/wxemoji/072.png" },
    { n: "裂开", g: "face", f: "assets/wxemoji/073.png" },
    { n: "奸笑", g: "face", f: "assets/wxemoji/074.png" },
    { n: "握手", g: "gesture", f: "assets/wxemoji/075.png" },
    { n: "胜利", g: "gesture", f: "assets/wxemoji/076.png" },
    { n: "抱拳", g: "gesture", f: "assets/wxemoji/077.png" },
    { n: "勾引", g: "gesture", f: "assets/wxemoji/078.png" },
    { n: "拳头", g: "gesture", f: "assets/wxemoji/079.png" },
    { n: "OK", g: "gesture", f: "assets/wxemoji/080.png" },
    { n: "合十", g: "gesture", f: "assets/wxemoji/081.png" },
    { n: "强", g: "gesture", f: "assets/wxemoji/082.png" },
    { n: "拥抱", g: "gesture", f: "assets/wxemoji/083.png" },
    { n: "弱", g: "gesture", f: "assets/wxemoji/084.png" },
    { n: "猪头", g: "animal", f: "assets/wxemoji/085.png" },
    { n: "跳跳", g: "animal", f: "assets/wxemoji/086.png" },
    { n: "发抖", g: "animal", f: "assets/wxemoji/087.png" },
    { n: "转圈", g: "animal", f: "assets/wxemoji/088.png" },
    { n: "庆祝", g: "blessing", f: "assets/wxemoji/089.png" },
    { n: "礼物", g: "blessing", f: "assets/wxemoji/090.png" },
    { n: "红包", g: "blessing", f: "assets/wxemoji/091.png" },
    { n: "發", g: "blessing", f: "assets/wxemoji/092.png" },
    { n: "福", g: "blessing", f: "assets/wxemoji/093.png" },
    { n: "烟花", g: "blessing", f: "assets/wxemoji/094.png" },
    { n: "爆竹", g: "blessing", f: "assets/wxemoji/095.png" },
    { n: "嘴唇", g: "other", f: "assets/wxemoji/096.png" },
    { n: "爱心", g: "other", f: "assets/wxemoji/097.png" },
    { n: "心碎", g: "other", f: "assets/wxemoji/098.png" },
    { n: "啤酒", g: "other", f: "assets/wxemoji/099.png" },
    { n: "咖啡", g: "other", f: "assets/wxemoji/100.png" },
    { n: "蛋糕", g: "other", f: "assets/wxemoji/101.png" },
    { n: "凋谢", g: "other", f: "assets/wxemoji/102.png" },
    { n: "菜刀", g: "other", f: "assets/wxemoji/103.png" },
    { n: "炸弹", g: "other", f: "assets/wxemoji/104.png" },
    { n: "便便", g: "other", f: "assets/wxemoji/105.png" },
    { n: "太阳", g: "other", f: "assets/wxemoji/106.png" },
    { n: "月亮", g: "other", f: "assets/wxemoji/107.png" },
    { n: "玫瑰", g: "other", f: "assets/wxemoji/108.png" }
    ];

    const BY_NAME = {};
    EMOJIS.forEach(e => { BY_NAME[e.n] = e; });

    // 微信表情名只含中文、字母和数字，不需要正则转义；这里再挡一道，防止以后混进特殊字符
    const SAFE = /^[\u4e00-\u9fa5A-Za-z0-9]+$/;
    const ALT = Object.keys(BY_NAME).filter(k => SAFE.test(k)).sort((a, b) => b.length - a.length).join('|');
    const RE = ALT ? new RegExp('\\[(' + ALT + ')\\]', 'g') : null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function src(name) { const e = BY_NAME[name]; return e ? e.f : ''; }
    function has(name) { return !!BY_NAME[name]; }
    function count() { return EMOJIS.length; }
    function groups() {
        const order = [], map = {};
        EMOJIS.forEach(e => { if (!map[e.g]) { map[e.g] = []; order.push(e.g); } map[e.g].push(e); });
        return order.map(g => ({ g: g, items: map[g] }));
    }

    // 先整体转义再换图，保证消息里的尖括号不会被当成标签
    function render(text) {
        const t = esc(text);
        if (!RE) return t;
        return t.replace(RE, (m, name) => {
            const e = BY_NAME[name];
            if (!e) return m;
            return '<img class="wx-em" src="' + esc(e.f) + '" alt="[' + esc(name) + ']" title="[' + esc(name) + ']" draggable="false">';
        });
    }

    // 会话列表这类只能放文字的地方：把短码压成空格，不至于露出一串方括号
    function stripToText(text) {
        const t = String(text == null ? '' : text);
        if (!RE) return t;
        return t.replace(RE, ' ');
    }

    window.WxEmoji = { EMOJIS: EMOJIS, src: src, has: has, count: count, groups: groups, render: render, stripToText: stripToText, esc: esc };
})();
