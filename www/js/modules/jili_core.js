/*
 * 叽哩叽哩（仿B站 AI 应用）核心模块 —— mie 项目移植
 * =====================================================================
 * 职责：数据层（存取/工厂/格式化）+ AI 引擎（大模型调用）+ 外部抓取（bgm.tv / B站番剧）。
 * 不含任何 UI；jili_html.js / jili.js 只通过 window.JiliCore 访问本文件。
 *
 * 依赖顺序（index.html 按此顺序引入，均为纯全局 script，无 import/export/require）：
 *   1. js/modules/jili_core.js   —— 本文件
 *   2. js/modules/jili_html.js   —— UI 渲染层（并行文件）
 *   3. js/modules/jili.js        —— 页面装配/事件层（并行文件）
 *
 * 存储：localStorage 键 "ai_phone_jili_state_v1"（同步 JSON，替代原项目 Dexie/IndexedDB）。
 *
 * AI 说明：
 *   - 所有 ai.* 方法经由 sendLlm() 调用大模型，读取全局 db.apiSettings
 *     {url,key,model,provider}（与小红书模块共用同一套配置）；
 *     缺配置时抛 Error("NO_API")，由 UI 层捕获并 toast。
 *   - provider === "gemini" 走 v1beta generateContent；其余走 OpenAI 兼容
 *     v1/chat/completions（transport 逻辑复制自 xiaohongshu_core.js）。
 *   - 提示词模板逐字保留自原项目（中英混杂照抄），仅把变量插值改为 JS 模板串。
 *   - 提示词来源（beautified 源码）：draftWorldview/charToCreator/generateFeed/dmReply
 *     → main.pp.js 69603-70096；commentReply/danmakuReact/seedComments/ghostPost/
 *     studioRound(无主持观众模拟)/fanMailReply → JiliScreen.pp.js。
 *   - 外部抓取：bgm.tv 日历/条目 + B站 PGC 季度接口，30 分钟模块级缓存（Map）。
 * ===================================================================== */
(function () {
    "use strict";

    /* =============================================================
     * 常量
     * ============================================================= */

    var STORAGE_KEY = "ai_phone_jili_state_v1";

    /** 经验等级阈值（levelOf: 1..6） */
    var LEVELS = [0, 50, 200, 600, 1500, 4000];
    /** 充电加成倍率（按等级） */
    var RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
    /** 弹幕/礼物特效调色盘 */
    var FX_COLORS = ["#ff6699", "#ffc53d", "#4dc3ff", "#a07cff", "#7ef0d0"];
    /** 充电档位（元） */
    var RECHARGE_TIERS = [6, 30, 98, 298];

    /* 充电/货币换算内部常量（源自原项目：Vn=600 / Kn=10 / zn=0.5 / Yn=60 / Jn=30；
     * SC 花费 = price*Kn 叽币；档位赠送硬币 coinsPerTier） */
    var RECHARGE = { Vn: 600, Kn: 10, zn: 0.5, Yn: 60, Jn: 30, coinsPerTier: [1, 10, 66, 520] };
    var SC_PRICES = [30, 50, 100];

    /** 礼物目录（逐字取自原项目 JiliScreen.pp.js Gs 表：id/emoji/price/tier/fx/color） */
    var GIFTS = [
        { id: "spicy", name: "辣条", emoji: "🌶️", price: 1, tier: "small" },
        { id: "heart", name: "小心心", emoji: "💗", price: 5, tier: "small" },
        { id: "clap", name: "鼓掌", emoji: "👏", price: 5, tier: "small" },
        { id: "drink", name: "能量饮料", emoji: "🥤", price: 10, tier: "small" },
        { id: "rose", name: "玫瑰", emoji: "🌹", price: 10, tier: "small" },
        { id: "icecream", name: "冰淇淋", emoji: "🍦", price: 20, tier: "small" },
        { id: "milktea", name: "奶茶", emoji: "🧋", price: 30, tier: "mid" },
        { id: "cake", name: "草莓蛋糕", emoji: "🍰", price: 52, tier: "mid" },
        { id: "bow", name: "应援蝴蝶结", emoji: "🎀", price: 99, tier: "mid" },
        { id: "bear", name: "抱抱熊", emoji: "🧸", price: 99, tier: "mid" },
        { id: "lightstick", name: "应援棒", emoji: "🪄", price: 120, tier: "mid" },
        { id: "kiss", name: "飞吻", emoji: "💋", price: 166, tier: "mid" },
        { id: "moon", name: "月光信笺", emoji: "🌙", price: 199, tier: "mid" },
        { id: "ring", name: "告白戒指", emoji: "💍", price: 334, tier: "big", fx: "zoom", color: "#8fd3ff" },
        { id: "fireworks", name: "烟花", emoji: "🎆", price: 399, tier: "big", fx: "rain", color: "#ffb84d" },
        { id: "sportscar", name: "超跑", emoji: "🏎️", price: 500, tier: "big", fx: "drive", color: "#ff5a5a" },
        { id: "rocket", name: "小火箭", emoji: "🚀", price: 520, tier: "big", fx: "fly", color: "#ff8a3d" },
        { id: "yacht", name: "游艇", emoji: "🛥️", price: 888, tier: "big", fx: "drive", color: "#4dc3ff" },
        { id: "crown", name: "王冠", emoji: "👑", price: 999, tier: "big", fx: "zoom", color: "#ffd24d" },
        { id: "plane", name: "私人飞机", emoji: "✈️", price: 1200, tier: "big", fx: "fly", color: "#9fb8ff" },
        { id: "castle", name: "梦幻城堡", emoji: "🏯", price: 1314, tier: "legend", color: "#ff7eb6" },
        { id: "whale", name: "星海鲸", emoji: "🐋", price: 2000, tier: "legend", color: "#4db8ff" },
        { id: "galaxy", name: "银河", emoji: "🌌", price: 3000, tier: "legend", color: "#a07cff" },
        { id: "unicorn", name: "梦幻独角兽", emoji: "🦄", price: 5200, tier: "legend", color: "#ff9ee5" },
        { id: "dragon", name: "祥龙", emoji: "🐉", price: 8888, tier: "legend", color: "#ffcc33" },
        { id: "planet", name: "礼物星球", emoji: "🪐", price: 13140, tier: "legend", color: "#7ef0d0" }
    ];
    var GIFT_IDS = GIFTS.map(function (g) { return g.id; });
    /** 舰队等级（价格单位：元） */
    var GUARDS = [
        { id: "captain", price: 198, rank: 1 },
        { id: "admiral", price: 1998, rank: 2 },
        { id: "governor", price: 19998, rank: 3 }
    ];

    /** UP主类型/分区/直播形式枚举（提示词用，源自原项目 m3u / m3J / $q） */
    var JILI_TYPES = ["real", "faceless", "virtual", "radio"];
    var JILI_AREAS = ["chat", "looks", "virtual", "ent", "game", "music", "asmr", "food", "life", "knowledge", "film", "doc", "anime"];
    var LIVE_FORMATS = ["chat", "sing", "dance", "game", "draw", "study", "cook", "eat", "asmr", "music", "craft", "fitness", "outdoor", "react", "story", "makeup", "pet", "unbox"];

    var CACHE_TTL = 0x1b7740; /* 30 分钟 */
    var CACHE_MAX = 60;

    /* =============================================================
     * 基础小工具
     * ============================================================= */

    var _jidSeq = 0;
    function jid(prefix) {
        _jidSeq += 1;
        return (prefix || "j") + Date.now().toString(36) + _jidSeq.toString(36);
    }

    function clampNum(n, min, max, dflt) {
        var v = Number(n);
        if (isNaN(v)) v = Number(dflt) || 0;
        if (v < min) v = min;
        if (v > max) v = max;
        return v;
    }

    /** FNV-1a 32位哈希（源自 JiliScreen.pp.js oo()） */
    function hash(str) {
        var h = 0x811c9dc5;
        var s = String(str == null ? "" : str);
        for (var i = 0; i < s.length; i++) {
            h = Math.imul(h ^ s.charCodeAt(i), 0x1000193) >>> 0;
        }
        return h >>> 0;
    }

    /** 由 seed 生成确定性封面（CSS 渐变） */
    function seedCover(seed) {
        var h = hash("cover:" + String(seed == null ? "" : seed));
        var h1 = h % 360;
        var h2 = (h >>> 8) % 360;
        return "linear-gradient(135deg, hsl(" + h1 + ", 70%, 55%), hsl(" + h2 + ", 70%, 32%))";
    }

    /** 由 id/名字生成确定性头像底色 */
    function avatarColor(idOrName) {
        var h = hash(String(idOrName == null ? "" : idOrName));
        return "hsl(" + (h % 360) + ", 62%, 52%)";
    }

    /** 经验 → 等级 1..6 */
    function levelOf(exp) {
        var n = Number(exp) || 0;
        var lv = 0;
        for (var i = 0; i < LEVELS.length; i++) {
            if (n >= LEVELS[i]) lv = i + 1;
        }
        return lv;
    }

    /** 1.2亿 → "1.2亿"，1.5万 → "1.5万"，其余取整 */
    function formatCount(n) {
        n = Number(n) || 0;
        if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
        if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
        return String(Math.round(n));
    }

    /** 秒 → "m:ss" */
    function formatDur(sec) {
        sec = Math.max(0, Math.floor(Number(sec) || 0));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m + ":" + String(s).padStart(2, "0");
    }

    /** 相对时间：刚刚 / x分钟前 / x小时前 / x天前 / 日期 */
    function relTime(at) {
        var diff = Date.now() - (Number(at) || 0);
        if (diff < 90000) return "刚刚";
        if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
        if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
        if (diff < 2592000000) return Math.floor(diff / 86400000) + "天前";
        try { return new Date(Number(at)).toLocaleDateString(); } catch (e) { return ""; }
    }

    /** LCG 洗牌（Fisher-Yates，不改动原数组；源自 JiliScreen.pp.js co()） */
    function shuffle(arr, seed) {
        var a = (arr || []).slice();
        var s = seed || 1;
        for (var i = a.length - 1; i > 0; i--) {
            s = (Math.imul(s, 0x41c64e6d) + 0x3039) >>> 0;
            var j = s % (i + 1);
            var tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    /** 私信会话 id 规则（本移植无跨站账号：me:creatorId） */
    function threadId(creatorId) {
        return "me:" + creatorId;
    }

    /** 是否在充电中（until > now），返回充电条目或 null */
    function chargedOf(state, creatorId) {
        var list = (state && state.charged) || [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (String(c.creatorId) === String(creatorId) && Number(c.until) > Date.now()) return c;
        }
        return null;
    }

    /** 是否已关注某 UP */
    function isFollowed(state, creatorId) {
        return ((state && state.following) || []).indexOf(String(creatorId)) >= 0;
    }

    /* =============================================================
     * 工厂（只填默认值，不自动写入 state）
     * ============================================================= */

    function makeCreator(patch) {
        var p = patch || {};
        return {
            id: p.id || jid("up"),
            name: p.name || "",
            type: p.type || "virtual",
            area: p.area || "chat",
            gender: p.gender || "",
            persona: p.persona || "",
            catchphrase: p.catchphrase || "",
            fanName: p.fanName || "",
            looks: p.looks || "",
            schedule: p.schedule || "",
            followReply: p.followReply || "",
            fans: clampNum(p.fans, 0, 50000000, 1000),
            sourceCharId: p.sourceCharId || "",
            liveNow: p.liveNow || null,
            visual: p.visual || { img: false, vid: false },
            createdAt: p.createdAt || Date.now()
        };
    }

    function makePost(patch) {
        var p = patch || {};
        var kind = p.kind === "dynamic" ? "dynamic" : "video";
        var base = {
            id: p.id || jid(kind === "dynamic" ? "dy" : "bv"),
            creatorId: p.creatorId || "me",
            kind: kind,
            at: p.at || Date.now(),
            liked: !!p.liked,
            coined: !!p.coined,
            faved: !!p.faved,
            comments: Array.isArray(p.comments) ? p.comments : []
        };
        if (kind === "video") {
            return Object.assign(base, {
                title: p.title || "",
                desc: p.desc || "",
                intro: p.intro != null ? p.intro : (p.desc || ""),
                area: p.area || "life",
                coverText: p.coverText != null ? p.coverText : String(p.title || "").slice(0, 8),
                durationSec: clampNum(p.durationSec, 20, 3600, 180),
                play: clampNum(p.play, 0, 1e8, p.play != null ? 0 : 1000),
                likes: clampNum(p.likes, 0, 1e8, 50),
                coins: clampNum(p.coins, 0, 1e8, 10),
                favs: clampNum(p.favs, 0, 1e8, 10),
                danmakuCount: clampNum(p.danmakuCount, 0, 1e8, 0),
                audio: p.audio || "voice",
                bgm: p.bgm || "",
                script: Array.isArray(p.script) ? p.script : [],
                scenes: Array.isArray(p.scenes) ? p.scenes : [],
                seed: p.seed != null ? p.seed : hash(String(p.title || "") + "|" + String(p.durationSec || "")),
                series: p.series || "",
                season: p.season || 0,
                episode: p.episode || 0,
                epTitle: p.epTitle || "",
                fanOnly: !!p.fanOnly
            }, base.comments.length ? { commentsCount: base.comments.length } : { commentsCount: clampNum(p.commentsCount, 0, 1e8, 0) });
        }
        return Object.assign(base, {
            text: p.text || "",
            likes: clampNum(p.likes, 0, 1e8, 20)
        }, base.comments.length ? { commentsCount: base.comments.length } : { commentsCount: clampNum(p.commentsCount, 0, 1e8, 3) });
    }

    function makeComment(patch) {
        var p = patch || {};
        return {
            id: p.id || jid("c"),
            name: p.name || "",
            userId: p.userId || "",
            text: p.text || "",
            at: p.at || Date.now(),
            likes: clampNum(p.likes, 0, 1e8, 0),
            liked: !!p.liked,
            isUp: !!p.isUp,
            replies: Array.isArray(p.replies) ? p.replies : []
        };
    }

    function makeNotice(patch) {
        var p = patch || {};
        return { id: p.id || jid("n"), text: p.text || "", at: p.at || Date.now() };
    }

    function makeFanMail(patch) {
        var p = patch || {};
        return {
            id: p.id || jid("fm"),
            fanName: p.fanName || "",
            accountName: p.accountName || "",
            postId: p.postId || "",
            text: p.text || "",
            at: p.at || Date.now(),
            reply: p.reply || "",
            repliedAt: p.repliedAt || 0
        };
    }

    function makeDMThread(patch) {
        var p = patch || {};
        return {
            id: p.id || (p.creatorId ? threadId(p.creatorId) : jid("t")),
            creatorId: p.creatorId || "",
            unread: clampNum(p.unread, 0, 999, 0),
            lastText: p.lastText || "",
            lastAt: p.lastAt || Date.now()
        };
    }

    function makeDMMessage(patch) {
        var p = patch || {};
        return {
            id: p.id || jid("m"),
            threadId: p.threadId || "",
            from: p.from === "them" ? "them" : "me",
            text: p.text || "",
            at: p.at || Date.now(),
            auto: !!p.auto,
            kind: p.kind || "text",
            meta: p.meta || null
        };
    }

    function makeInboxRow(patch) {
        var p = patch || {};
        var cat = ["reply", "like", "fan"].indexOf(p.cat) >= 0 ? p.cat : "reply";
        return {
            id: p.id || jid("ib"),
            cat: cat,
            name: p.name || "",
            userId: p.userId || "",
            text: p.text || "",
            quote: p.quote || "",
            thumbPostId: p.thumbPostId || "",
            at: p.at || Date.now(),
            followed: !!p.followed
        };
    }

    /* =============================================================
     * 存储
     * ============================================================= */

    function defaultSettings() {
        return {
            giftFx: "all",
            dmReactOn: true,
            autoCover: true,
            generateCreators: false,
            dmOpacity: 1,
            dmSpeed: 1,
            dmSize: 1,
            dmBlock: ""
        };
    }

    /**
     * 默认状态：种子数据全部字面写入（无任何运行时随机生成）。
     * 时间戳基于调用时刻做固定偏移，保证“刚刚/x小时前”等展示自然。
     */
    function createDefaultJiliState() {
        var t = Date.now();
        var MIN = 60 * 1000, H = 60 * MIN, D = 24 * H;
        var state = {
            worldview: "现代真实世界：一家名为「叽哩叽哩」的视频网站，界面与氛围类似哔哩哔哩。科技水平与当下一致，没有超自然元素。年轻人在这里看动画、游戏、知识和美食视频，深夜蹲虚拟主播的电台直播；弹幕文化、一键三连、充电都是日常，评论区偶尔会吵起来，但整体氛围热闹而友善。",
            userName: "阿澈",
            userAvatar: "",
            userIntro: "",
            exp: 0,
            jibi: 0,
            coin: 5,
            earnings: 0,
            fans: 2,
            characters: [
                {
                    id: "char_muyu", name: "慕雨", avatar: "",
                    persona: "你大学时的天文社学姐，现在在市天文馆做讲解员。性格温柔又话痨，一聊起星空就停不下来，喜欢用比喻讲复杂的天文知识，收藏了一整柜星座明信片。",
                    worldInfo: "现代真实世界，科技与当下一致，没有超自然元素。"
                },
                {
                    id: "char_zhaoyang", name: "赵阳", avatar: "",
                    persona: "你高中隔壁班的同学，现在是健身教练兼业余脱口秀演员。自来熟，嗓门大，爱开玩笑，但心思很细，会记得朋友随口提过的小事。",
                    worldInfo: "现代真实世界。"
                },
                {
                    id: "char_xiaoman", name: "小满", avatar: "",
                    persona: "网上认识的独立游戏开发者，线下社恐但线上话多，正在做一款种田游戏，养了一只叫「像素」的橘猫。",
                    worldInfo: "现代真实世界。"
                },
                {
                    id: "char_linshen", name: "林深", avatar: "",
                    persona: "巷口书店的老板，戴圆框眼镜，说话慢条斯理，会拉大提琴，喜欢在打烊后读推理小说。",
                    worldInfo: "现代真实世界。"
                }
            ],
            creators: [
                {
                    id: "up_yinyu", name: "银羽Yinyu", type: "virtual", area: "virtual", gender: "female",
                    persona: "深夜档虚拟主播，看板娘是一只银白色长发的电子狐狸。声音软糯，语速不快，擅长哄睡电台和慢悠悠的杂谈，弹幕问什么都能接住，偶尔唱歌（自嘲五音不全）。",
                    catchphrase: "晚上好呀，这里是银羽的小窝～",
                    fanName: "小羽毛", looks: "", schedule: "每周二、四、六 22:00 直播",
                    followReply: "谢谢关注～我是银羽，一个在深夜陪你聊天的人。\n平时直播电台和杂谈，偶尔唱歌（跑调请多包涵）。\n早点休息，晚安好梦。",
                    fans: 128000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: { title: "【深夜电台】聊聊最近的番剧和心事", coverText: "深夜电台", formats: ["chat", "sing"], goods: [] },
                    createdAt: t - 90 * D
                },
                {
                    id: "up_xuchai", name: "老徐拆机", type: "real", area: "knowledge", gender: "male",
                    persona: "数码拆解UP主，前手机维修师傅。普通话带点口音，语速快，讲参数像唠家常，最爱说「这成本一看就离谱」。桌面永远堆满拆到一半的机器。",
                    catchphrase: "拆开看看，不就知道了",
                    fanName: "拆友", looks: "", schedule: "每周三、周日 12:00 更新",
                    followReply: "哈喽，我是老徐，专拆各种数码产品。\n每周三和周日中午更新，帮你把钱花明白。\n想看拆什么，评论区留言。",
                    fans: 456000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: null, createdAt: t - 120 * D
                },
                {
                    id: "up_aman", name: "厨房里的阿蛮", type: "real", area: "food", gender: "female",
                    persona: "家常菜UP主，一个人住，厨房三平米。镜头前大大咧咧，翻车了也不剪掉，口头禅是「问题不大，能吃」。擅长十分钟快手菜和深夜报复社会的夜宵。",
                    catchphrase: "今天也要好好吃饭",
                    fanName: "干饭人", looks: "", schedule: "每周一、五 18:00 更新，周末随缘直播",
                    followReply: "你好呀，我是阿蛮，一个在出租屋里做菜的普通打工人。\n每周一和周五更新快手菜，深夜偶尔直播做夜宵。\n记得先关注再吃饭～",
                    fans: 89000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: { title: "阿蛮的深夜食堂：夜宵现做", coverText: "深夜食堂", formats: ["cook", "eat"], goods: [{ name: "阿蛮同款藤椒酱", emoji: "🌶️", price: 19.9, desc: "拌面拌饭都好吃", stock: 200 }] },
                    createdAt: t - 80 * D
                },
                {
                    id: "up_luochen", name: "洛尘说历史", type: "real", area: "knowledge", gender: "male",
                    persona: "历史科普UP主，中文系研究生。讲话慢条斯理，擅长把复杂的历史讲成连续剧，一期视频一个观点，评论区经常吵成一团。",
                    catchphrase: "历史没有如果，但有意思",
                    fanName: "洛友", looks: "", schedule: "每周六 10:00 更新",
                    followReply: "你好，我是洛尘，讲历史故事的人。\n每周六上午更新一期，从先秦讲到近代。\n感谢关注，欢迎来评论区讨论。",
                    fans: 512000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: null, createdAt: t - 200 * D
                },
                {
                    id: "up_juanjuan", name: "奶油蛋糕卷", type: "real", area: "game", gender: "female",
                    persona: "游戏区小UP主，主打休闲和独立游戏，技术菜但节目效果好，输了会真实地哀嚎。周末会和粉丝连麦打游戏。",
                    catchphrase: "卷卷今天也很非",
                    fanName: "卷心菜", looks: "", schedule: "不定期更新，直播看心情",
                    followReply: "嗨～我是卷卷，一个游戏区的小透明。\n技术很菜，快乐很多，欢迎来看我翻车。\n有空来直播间连麦呀！",
                    fans: 23000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: null, createdAt: t - 40 * D
                },
                {
                    id: "up_yehang", name: "夜航星观测站", type: "faceless", area: "knowledge", gender: "male",
                    persona: "天文科普UP主，从不露脸，只有星空和望远镜的画面配旁白。声音低沉，喜欢在片尾说一句「我们头顶，见」。",
                    catchphrase: "抬头，看星星",
                    fanName: "观星者", looks: "", schedule: "晴天的周五 21:00 直播观星",
                    followReply: "你好，我是夜航星。\n这里只有星空、望远镜和一点天文知识。\n晴天周五晚直播观星，我们头顶见。",
                    fans: 66000, sourceCharId: "", visual: { img: false, vid: false },
                    liveNow: null, createdAt: t - 150 * D
                }
            ],
            posts: [
                {
                    id: "bv_yinyu1", creatorId: "up_yinyu", kind: "video",
                    title: "【银羽】深夜电台 vol.12：那些年我们一起追过的番",
                    desc: "今晚聊聊入坑的番剧，顺便读几个小羽毛的来信。泡好茶，慢慢听。",
                    area: "virtual", coverText: "失眠速进", durationSec: 2400,
                    play: 45000, likes: 3800, coins: 1200, favs: 900, danmakuCount: 320,
                    audio: "voice", bgm: "lofi piano", script: [], scenes: [],
                    series: "深夜电台", season: 1, episode: 12, epTitle: "入坑的番",
                    fanOnly: false, at: t - 2 * H, liked: false, coined: false, faved: false,
                    commentsCount: 3,
                    comments: [
                        { id: "c_yy11", name: "夜猫子本猫", userId: "", text: "周二晚上准时来报到，电台就是我的助眠白噪音", at: t - 100 * MIN, likes: 342, liked: false, isUp: false, replies: [] },
                        { id: "c_yy12", name: "狐狸不吃素", userId: "", text: "来信那段眼泪没绷住，银羽声音真的好温柔", at: t - 88 * MIN, likes: 218, liked: false, isUp: false, replies: [] },
                        { id: "c_yy13", name: "今晚早睡失败", userId: "", text: "说好的哄睡电台，我越听越精神", at: t - 70 * MIN, likes: 96, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_aman1", creatorId: "up_aman", kind: "video",
                    title: "10分钟搞定！藤椒肥牛面，深夜报复社会",
                    desc: "加班回家10分钟开饭，藤椒的麻配肥牛的香，汤都不剩。",
                    area: "food", coverText: "10分钟搞定", durationSec: 360,
                    play: 156000, likes: 12300, coins: 3400, favs: 8900, danmakuCount: 260,
                    audio: "voice", bgm: "", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 20 * H, liked: false, coined: false, faved: false,
                    commentsCount: 3,
                    comments: [
                        { id: "c_am11", name: "干饭第一名", userId: "", text: "跟着做了一次，好吃到舔碗，就是藤椒放多了差点送走", at: t - 18 * H, likes: 866, liked: false, isUp: false, replies: [] },
                        { id: "c_am12", name: "厨房杀手", userId: "", text: "看完立刻下楼买肥牛，便利店还真的有", at: t - 15 * H, likes: 431, liked: false, isUp: false, replies: [] },
                        { id: "c_am13", name: "问题不大能吃", userId: "", text: "阿蛮的背景音咀嚼声才是精髓", at: t - 9 * H, likes: 152, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_luochen1", creatorId: "up_luochen", kind: "video",
                    title: "安史之乱后，唐朝为什么还能撑144年？",
                    desc: "一场叛乱没有杀死大唐，反而让它学会了新的活法。从藩镇、漕运到两税法，一次讲透。",
                    area: "knowledge", coverText: "硬撑144年", durationSec: 1080,
                    play: 512000, likes: 46000, coins: 21000, favs: 33000, danmakuCount: 1200,
                    audio: "voice", bgm: "epic orchestral", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 1 * D, liked: false, coined: false, faved: false,
                    commentsCount: 3,
                    comments: [
                        { id: "c_lc11", name: "课代表小史", userId: "", text: "课代表总结：不是唐朝命硬，是江南的漕运硬", at: t - 20 * H, likes: 3200, liked: false, isUp: false, replies: [] },
                        { id: "c_lc12", name: "关中人士", userId: "", text: "“唐朝丢了河北等于丢了半条命”这句太精辟了", at: t - 16 * H, likes: 1870, liked: false, isUp: false, replies: [] },
                        { id: "c_lc13", name: "历史圈外人", userId: "", text: "每周六的快乐就是这么朴实无华", at: t - 8 * H, likes: 640, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_xuchai1", creatorId: "up_xuchai", kind: "video",
                    title: "拆解199元的「游戏手机」，里面全是故事",
                    desc: "百元机拆开全是性价比的影子，这成本一看就离谱。",
                    area: "knowledge", coverText: "199的成本", durationSec: 600,
                    play: 210000, likes: 18000, coins: 5600, favs: 7700, danmakuCount: 540,
                    audio: "voice", bgm: "", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 2 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_xc11", name: "电子垃圾佬", userId: "", text: "199还要什么自行车，老徐这成本表太实在了", at: t - 44 * H, likes: 921, liked: false, isUp: false, replies: [] },
                        { id: "c_xc12", name: "拆友团团长", userId: "", text: "下次能不能拆个百元平板，想看老板亏多少", at: t - 30 * H, likes: 405, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_yehang1", creatorId: "up_yehang", kind: "video",
                    title: "在城市阳台拍土星环，到底要花多少钱？",
                    desc: "从入门望远镜到拍出土星环，我把每一分钱都列给你看。",
                    area: "knowledge", coverText: "拍到了！", durationSec: 480,
                    play: 98000, likes: 7600, coins: 2100, favs: 4400, danmakuCount: 180,
                    audio: "voice", bgm: "ambient space", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 3 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_yh11", name: "楼下天文台", userId: "", text: "第一次看清土星环那天真的会起鸡皮疙瘩", at: t - 66 * H, likes: 512, liked: false, isUp: false, replies: [] },
                        { id: "c_yh12", name: "光污染受害者", userId: "", text: "在城市能拍成这样，设备清单已抄", at: t - 50 * H, likes: 289, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_juanjuan1", creatorId: "up_juanjuan", kind: "video",
                    title: "《星露谷物语》第一年：我把自己种破产了",
                    desc: "休闲种田？不存在的，第一年结束我负债三千，但快乐是真的。",
                    area: "game", coverText: "负债三千", durationSec: 540,
                    play: 67000, likes: 5400, coins: 1300, favs: 2600, danmakuCount: 150,
                    audio: "voice", bgm: "cozy acoustic", script: [], scenes: [],
                    series: "星露谷开荒", season: 1, episode: 1, epTitle: "破产元年",
                    fanOnly: false, at: t - 4 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_jj11", name: "卷心菜一号", userId: "", text: "负债三千还笑得这么开心，这就是独立游戏人的快乐吗", at: t - 90 * H, likes: 344, liked: false, isUp: false, replies: [] },
                        { id: "c_jj12", name: "种田模拟器之神", userId: "", text: "下周目记得先攒钱买洒水器，别头铁", at: t - 72 * H, likes: 190, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_xuchai2", creatorId: "up_xuchai", kind: "video",
                    title: "百元机械键盘大乱斗：谁才是卷王之王？",
                    desc: "四把百元键盘同台对比，手感、声音、键线分离一个不落。",
                    area: "knowledge", coverText: "卷王之王", durationSec: 660,
                    play: 187000, likes: 15200, coins: 4800, favs: 6600, danmakuCount: 420,
                    audio: "voice", bgm: "", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 5 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_xc21", name: "键圈底层", userId: "", text: "听声音那一part我反复拉了五遍，耳朵怀孕", at: t - 110 * H, likes: 688, liked: false, isUp: false, replies: [] },
                        { id: "c_xc22", name: "打工人小张", userId: "", text: "已下单卷王，希望它撑过我的三个月热度", at: t - 96 * H, likes: 277, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_aman2", creatorId: "up_aman", kind: "video",
                    title: "草莓蛋糕翻车现场（但成品意外能吃）",
                    desc: "打发失败的奶油救回来了，颜值不够味道来凑。",
                    area: "food", coverText: "翻车现场", durationSec: 300,
                    play: 132000, likes: 11000, coins: 2900, favs: 5100, danmakuCount: 230,
                    audio: "voice", bgm: "", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 6 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_am21", name: "烘焙劝退师", userId: "", text: "看到打发失败那一刻我就放心了，原来不止我翻车", at: t - 130 * H, likes: 733, liked: false, isUp: false, replies: [] },
                        { id: "c_am22", name: "甜品雷达", userId: "", text: "翻车翻得食欲大开，这合理吗", at: t - 120 * H, likes: 318, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_luochen2", creatorId: "up_luochen", kind: "video",
                    title: "一张地图看懂三国鼎立：谁的地盘最难打？",
                    desc: "地形决定命运：蜀道的险、江东的水、中原的平。",
                    area: "knowledge", coverText: "一图看懂", durationSec: 900,
                    play: 298000, likes: 26000, coins: 12000, favs: 19000, danmakuCount: 860,
                    audio: "voice", bgm: "chinese traditional", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 7 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_lc21", name: "地图爱好者", userId: "", text: "用地图讲战争最直观，蜀道那段建议反复观看", at: t - 150 * H, likes: 1420, liked: false, isUp: false, replies: [] },
                        { id: "c_lc22", name: "季汉粉不哭", userId: "", text: "看到汉中那段直接泪目，丞相太难了", at: t - 140 * H, likes: 980, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_yehang2", creatorId: "up_yehang", kind: "video",
                    title: "为什么冬天的星空比夏天亮？",
                    desc: "不是错觉，是地球在公转轨道上换了个朝向。",
                    area: "knowledge", coverText: "冬天最亮", durationSec: 420,
                    play: 76000, likes: 6100, coins: 1700, favs: 3600, danmakuCount: 140,
                    audio: "voice", bgm: "ambient space", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 8 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_yh21", name: "猎户座常客", userId: "", text: "原来夏天看的是银心方向，涨知识了", at: t - 180 * H, likes: 402, liked: false, isUp: false, replies: [] },
                        { id: "c_yh22", name: "抬头党", userId: "", text: "「我们头顶，见」这结尾每次听都起鸡皮疙瘩", at: t - 170 * H, likes: 356, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "bv_yinyu2", creatorId: "up_yinyu", kind: "video",
                    title: "银羽翻唱：《夜空中最亮的星》（跑调预警）",
                    desc: "答应小羽毛的翻唱来了，跑调的地方请弹幕手下留情（bushi）",
                    area: "virtual", coverText: "跑调预警", durationSec: 260,
                    play: 89000, likes: 9200, coins: 2500, favs: 1800, danmakuCount: 410,
                    audio: "voice", bgm: "", script: [], scenes: [],
                    series: "", season: 0, episode: 0, epTitle: "",
                    fanOnly: false, at: t - 9 * D, liked: false, coined: false, faved: false,
                    commentsCount: 2,
                    comments: [
                        { id: "c_yy21", name: "耳朵在抗议", userId: "", text: "跑调也是好听的跑调，这就是滤镜吗", at: t - 200 * H, likes: 611, liked: false, isUp: false, replies: [] },
                        { id: "c_yy22", name: "小羽毛001", userId: "", text: "副歌那下没绷住直接单曲循环了", at: t - 190 * H, likes: 429, liked: false, isUp: false, replies: [] }
                    ]
                },
                {
                    id: "dy_aman1", creatorId: "up_aman", kind: "dynamic",
                    text: "明天晚上八点直播做夜宵！想吃什么在评论区点菜，点赞最高的安排上～",
                    at: t - 5 * H, liked: false, likes: 3200, commentsCount: 2,
                    comments: [
                        { id: "c_dy11", name: "深夜饿魔", userId: "", text: "点菜！麻辣香锅！不麻不要钱的那种", at: t - 4 * H, likes: 221, liked: false, isUp: false, replies: [] },
                        { id: "c_dy12", name: "减脂失败者", userId: "", text: "凌晨的直播间是我减肥路上最大的敌人", at: t - 3 * H, likes: 178, liked: false, isUp: false, replies: [] }
                    ]
                }
            ],
            danmaku: [
                { postId: "bv_luochen1", time: 5, text: "历史区顶流更新了", mode: "scroll", color: "", big: false, up: false, likes: 0 },
                { postId: "bv_luochen1", time: 132, text: "前方高能", mode: "top", color: "", big: false, up: false, likes: 820 },
                { postId: "bv_luochen1", time: 520, text: "泪目", mode: "scroll", color: "#fe0302", big: false, up: false, likes: 156 },
                { postId: "bv_aman1", time: 12, text: "深夜放毒啊喂", mode: "scroll", color: "", big: false, up: false, likes: 0 },
                { postId: "bv_aman1", time: 200, text: "跟着做了一次，好吃！", mode: "scroll", color: "", big: false, up: false, likes: 44 },
                { postId: "bv_aman1", time: 355, text: "完结撒花", mode: "bottom", color: "", big: false, up: false, likes: 0 }
            ],
            dms: [],
            dmMessages: [],
            following: [],
            followSeedCleared: true,
            msgSeedCleared: true,
            fanFollowBack: { "奶茶三分甜": true },
            charged: [{ creatorId: "up_luochen", until: t + 29 * D }],
            history: ["bv_aman1", "bv_luochen1", "bv_yinyu1"],
            favs: ["bv_luochen1", "bv_aman2"],
            later: ["bv_luochen2", "bv_yehang1"],
            notices: [],
            inboxSeen: {},
            inboxLiked: {},
            inbox: [],
            liveRooms: [
                { id: "live_up_yinyu", creatorId: "up_yinyu", title: "【深夜电台】聊聊最近的番剧和心事", coverText: "深夜电台", topic: "最近的番剧和心事", viewers: 3840, popularity: 5200, source: "chat" },
                { id: "live_up_aman", creatorId: "up_aman", title: "阿蛮的深夜食堂：夜宵现做", coverText: "深夜食堂", topic: "夜宵点菜", viewers: 860, popularity: 1200, source: "camera" }
            ],
            fanMail: [],
            bgms: [],
            screenings: [],
            feedAt: 0,
            settings: defaultSettings()
        };
        return state;
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return createDefaultJiliState();
            var data = JSON.parse(raw);
            if (!data || typeof data !== "object") return createDefaultJiliState();
            var state = createDefaultJiliState();
            Object.keys(state).forEach(function (k) {
                if (data[k] !== undefined) state[k] = data[k];
            });
            state.settings = Object.assign(defaultSettings(), data.settings || {});
            // 一次性迁移：清空旧版本预置的默认关注列表（关注页改为关注后才显示视频）
            if (!data.followSeedCleared) {
                var trio = ["up_aman", "up_luochen", "up_yinyu"];
                if (Array.isArray(state.following) && state.following.length === trio.length &&
                    trio.every(function (id) { return state.following.indexOf(id) >= 0; })) {
                    state.following = [];
                }
                state.followSeedCleared = true;
            }
            // 一次性迁移：清空旧版本预置的私信/通知/粉丝来信（讯息页改为互动后才出现内容）
            if (!data.msgSeedCleared) {
                var seedTids = ["me:up_yinyu", "me:up_aman", "me:up_luochen"];
                state.dmMessages = (state.dmMessages || []).filter(function (m) { return seedTids.indexOf(m.threadId) < 0; });
                state.dms = (state.dms || []).filter(function (t2) { return seedTids.indexOf(t2.id) < 0; });
                state.inbox = (state.inbox || []).filter(function (r) { return !/^ib_[1-6]$/.test(r.id || ""); });
                state.notices = (state.notices || []).filter(function (n) { return !/^n_[1-3]$/.test(n.id || ""); });
                state.fanMail = (state.fanMail || []).filter(function (m2) { return m2.id !== "fm_1"; });
                state.msgSeedCleared = true;
            }
            // 封面字升级：旧种子帖的平淡封面字换成吸睛标题（按 id+旧值匹配，幂等，不碰 AI 生成的帖子）
            var SEED_COVER_V2 = [
                ["bv_yinyu1", "深夜电台", "失眠速进"],
                ["bv_aman1", "藤椒肥牛面", "10分钟搞定"],
                ["bv_luochen1", "大唐续命", "硬撑144年"],
                ["bv_xuchai1", "拆机", "199的成本"],
                ["bv_yehang1", "土星环", "拍到了！"],
                ["bv_juanjuan1", "种田破产", "负债三千"],
                ["bv_xuchai2", "键盘乱斗", "卷王之王"],
                ["bv_aman2", "蛋糕翻车", "翻车现场"],
                ["bv_luochen2", "三国地图", "一图看懂"],
                ["bv_yehang2", "冬季星空", "冬天最亮"],
                ["bv_yinyu2", "翻唱", "跑调预警"]
            ];
            (state.posts || []).forEach(function (p) {
                for (var i = 0; i < SEED_COVER_V2.length; i++) {
                    if (p.id === SEED_COVER_V2[i][0] && p.coverText === SEED_COVER_V2[i][1]) { p.coverText = SEED_COVER_V2[i][2]; break; }
                }
            });
            return state;
        } catch (e) {
            return createDefaultJiliState();
        }
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* 存储满等异常静默 */ }
    }

    function reset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
        return createDefaultJiliState();
    }

    /* =============================================================
     * LLM 传输层（复制自 xiaohongshu_core.js 的 sendLlm 实现）
     * ============================================================= */

    function resolveGlobalApiConfig() {
        var config = typeof db !== "undefined" ? db.apiSettings : null;
        if (!config || !config.url || !config.key || !config.model) return null;
        return config;
    }

    function _dataUrlToBase64(dataUrl) {
        var s = String(dataUrl || "");
        var i = s.indexOf(",");
        return i >= 0 ? s.slice(i + 1) : s;
    }

    function _mimeFromDataUrl(dataUrl) {
        var m = /^data:([^;,]+)/.exec(String(dataUrl || ""));
        return m ? m[1] : "";
    }

    /**
     * 发送 LLM 请求。缺配置抛 Error("NO_API")。
     * @returns {Promise<string>} 模型回复文本
     */
    async function sendLlm(systemPrompt, userPrompt, imageParts) {
        var apiConfig = resolveGlobalApiConfig();
        if (!apiConfig) throw new Error("NO_API");

        var baseUrl = String(apiConfig.url || "").replace(/\/+$/, "");
        var key = apiConfig.key, model = apiConfig.model, provider = apiConfig.provider;
        var images = (Array.isArray(imageParts) ? imageParts : []).filter(function (p) { return p && p.dataUrl; });

        var endpoint, headers, body;
        if (provider === "gemini") {
            var parts = [{ text: userPrompt }];
            for (var i = 0; i < images.length; i++) {
                parts.push({
                    inline_data: {
                        mime_type: images[i].mimeType || _mimeFromDataUrl(images[i].dataUrl) || "image/jpeg",
                        data: _dataUrlToBase64(images[i].dataUrl)
                    }
                });
            }
            endpoint = baseUrl + "/v1beta/models/" + model + ":generateContent?key=" + key;
            headers = { "Content-Type": "application/json" };
            var payload = { contents: [{ role: "user", parts: parts }], generationConfig: { temperature: 0.8 } };
            if (systemPrompt) payload.system_instruction = { parts: [{ text: systemPrompt }] };
            body = JSON.stringify(payload);
        } else {
            var userContent = userPrompt;
            if (images.length > 0) {
                userContent = [{ type: "text", text: userPrompt }].concat(images.map(function (p) {
                    return { type: "image_url", image_url: { url: p.dataUrl, detail: "low" } };
                }));
            }
            endpoint = baseUrl + "/v1/chat/completions";
            headers = { "Content-Type": "application/json", "Authorization": "Bearer " + key };
            var messages = [];
            if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
            messages.push({ role: "user", content: userContent });
            body = JSON.stringify({ model: model, messages: messages, temperature: 0.8 });
        }

        var response = await fetch(endpoint, { method: "POST", headers: headers, body: body });
        if (!response.ok) {
            var errText = await response.text().catch(function () { return ""; });
            throw new Error("API 错误: " + response.status + " " + errText.slice(0, 200));
        }
        var data = await response.json();
        if (provider === "gemini") {
            var text = ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
                .map(function (p) { return (p && typeof p.text === "string") ? p.text : ""; })
                .filter(Boolean).join("\n");
            return text || (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";
        }
        return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    }

    /* ---------------- JSON 提取（移植自原项目 main.pp.js 69207-69431：Pq/Fq/Bq/Hq） ---------------- */

    /** Pq：剥 <think> 块与 ``` 围栏 */
    function _cleanLlmText(text) {
        var s = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
        s = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
        s = s.replace(/<think(?:ing)?>[\s\S]*$/i, "");
        var fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
        s = fence ? fence[1] : s.replace(/```(?:json|JSON)?\s*/g, "");
        return s.trim();
    }

    /** Fq：字符串内的裸换行/控制字符修复 */
    function _fixRawStrings(src) {
        var out = "", inStr = false, esc = false;
        for (var i = 0; i < src.length; i++) {
            var c = src[i];
            if (inStr) {
                if (esc) { out += c; esc = false; continue; }
                if (c === "\\") { out += c; esc = true; continue; }
                if (c === '"') { out += c; inStr = false; continue; }
                if (c === "\n") { out += "\\n"; continue; }
                if (c === "\r") { out += "\\r"; continue; }
                if (c === "\t") { out += "\\t"; continue; }
                if (c < "\x20") continue;
                out += c;
            } else {
                if (c === '"') inStr = true;
                out += c;
            }
        }
        return out;
    }

    /** 字符串感知扫描：记录每个 } / ] 之后的位置 */
    function _closePositions(src) {
        var positions = [], inStr = false, esc = false;
        for (var i = 0; i < src.length; i++) {
            var c = src[i];
            if (inStr) {
                if (esc) esc = false;
                else if (c === "\\") esc = true;
                else if (c === '"') inStr = false;
            } else if (c === '"') inStr = true;
            else if (c === "}" || c === "]") positions.push(i + 1);
        }
        return positions;
    }

    /** 字符串感知扫描：未闭合的 { / [ 栈 */
    function _openBrackets(src) {
        var stack = [], inStr = false, esc = false;
        for (var i = 0; i < src.length; i++) {
            var c = src[i];
            if (inStr) {
                if (esc) esc = false;
                else if (c === "\\") esc = true;
                else if (c === '"') inStr = false;
            } else if (c === '"') inStr = true;
            else if (c === "{" || c === "[") stack.push(c);
            else if (c === "}" || c === "]") stack.pop();
        }
        return stack;
    }

    /** Bq：多级修复解析（曲引号/尾逗号 → 字符串修复 → 截断处补闭合括号） */
    function _jsonRepairParse(text) {
        var s = _cleanLlmText(text);
        var start = s.search(/[{[]/);
        var body = start > 0 ? s.slice(start) : s;
        try { return JSON.parse(body); } catch (e0) { }
        var a = body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1");
        var b = _fixRawStrings(a).replace(/,\s*([}\]])/g, "$1");
        var candidates = [a, b];
        for (var i = 0; i < candidates.length; i++) {
            try { return JSON.parse(candidates[i]); } catch (e1) { }
        }
        var positions = _closePositions(b);
        for (var j = positions.length - 1; j >= 0; j--) {
            var cut = b.slice(0, positions[j]).replace(/[\s,]+$/, "");
            var stack = _openBrackets(cut);
            var fixed = cut;
            for (var k = stack.length - 1; k >= 0; k--) fixed += stack[k] === "{" ? "}" : "]";
            try { return JSON.parse(fixed); } catch (e2) { }
        }
        throw new Error("BAD_JSON");
    }

    /**
     * extractJson：从模型回复中提取一个 JSON 对象。
     * （移植自原项目 main.pp.js Hq/Bq：剥 think/围栏 → 首个 { 到末个 } → 多级修复解析）
     * 全部失败 → throw new Error("BAD_JSON")；输入为空 → throw new Error("EMPTY_REPLY")
     */
    function extractJson(text) {
        var s = _cleanLlmText(text);
        if (!s) throw new Error("EMPTY_REPLY");
        var start = s.indexOf("{");
        if (start < 0) throw new Error("BAD_JSON");
        var end = s.lastIndexOf("}");
        if (end > start) {
            try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { }
        }
        var obj = _jsonRepairParse(s.slice(start));
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("BAD_JSON");
        return obj;
    }

    /** 统一入口：记录 feature 日志 + 请求 + 解析 JSON */
    async function _askJson(feature, systemPrompt, userPrompt) {
        try { console.log("[jili] feature:", feature); } catch (e) { }
        var text = await sendLlm(systemPrompt, userPrompt);
        if (!text || !String(text).trim()) throw new Error("EMPTY_REPLY");
        return extractJson(text);
    }

    /* =============================================================
     * 提示词公共片段（逐字保留自原项目 lq / sG / aG / ka / Da）
     * ============================================================= */

    /** sG：站点语言名（本移植固定简中） */
    function _langName() {
        return "Simplified Chinese (简体中文)";
    }

    /** lq/Pq：用户名保护规则 */
    function _namesRule(names) {
        var list = (names || []).filter(Boolean);
        if (!list.length) return "";
        var quoted = list.map(function (n) { return '"' + n + '"'; }).join(" / ");
        return "ABSOLUTE RULE: " + quoted + " is the real user. NEVER write any line, comment, bullet comment, gift, follow, membership or Super Chat under " +
            (list.length > 1 ? "any of these names" : "this name") +
            " (or an obvious variant). Only the user speaks for themself — you only write other people.";
    }

    /** aG：外语行规则（逐字） */
    var _FOREIGN_CLAUSE = "\nFOREIGN-LANGUAGE LINES: if any text is written in a language other than the site language above (a creator whose persona speaks another language, a foreign viewer…), that field MUST be 原文（translation into the site language）: the complete translation in FULL-WIDTH parentheses（）as the LAST thing in the same field, exactly once, never shortened or dropped. Never glue \"Foreign sentence. 中文句子\" together without the（）, never put the（）in the middle. In multi-line fields (e.g. followReply) every line ends with its own（translation）.";

    /** ka：创作者自述块 */
    function _creatorLine(creator, contextBlock) {
        if (!creator) return "";
        var lines = [
            "CREATOR: " + creator.name + " | type: " + (creator.type || "") + " | area: " + (creator.area || ""),
            creator.persona ? "Persona: " + creator.persona : "",
            creator.catchphrase ? "Catchphrase: " + creator.catchphrase : "",
            creator.fanName ? "Fans are called: " + creator.fanName : "",
            creator.fans != null ? "Followers: " + creator.fans : "",
            contextBlock ? "Character background:\n" + contextBlock : ""
        ].filter(Boolean);
        return lines.join("\n");
    }

    /** Da：视频/动态上下文块（逐字） */
    function _videoContext(post) {
        if (!post) return "";
        if (post.kind === "dynamic") {
            return "POST: a short text post on the creator's feed:\n" + String(post.text || "");
        }
        var script = (post.script || []).map(function (l) { return "[" + formatDur(l.t) + "] " + l.text; }).join("\n");
        return "VIDEO: \"" + (post.title || "") + "\" (" + formatDur(post.durationSec) + ")" +
            (post.desc ? "\nDescription: " + post.desc : "") +
            (script ? "\nStoryboard:\n" + script : "");
    }

    /** 按粉丝量档位决定评论数（6/8/10/12） */
    function _commentCountFor(fans) {
        var n = Number(fans) || 0;
        return n >= 100000 ? 12 : n >= 10000 ? 10 : n >= 1000 ? 8 : 6;
    }

    function _norm(s) {
        return String(s == null ? "" : s).normalize("NFKC").toLowerCase();
    }

    function _isUserName(name, aliases) {
        var n = _norm(name);
        if (!n) return false;
        return (aliases || []).some(function (a) { return _norm(a) === n; });
    }

    /** mG：charToCreator / generateFeed 共用的 creator JSON 形状（逐字） */
    function _creatorShape() {
        return "{\"name\":\"online handle\",\"type\":\"" + JILI_TYPES.join("|") + "\",\"area\":\"" + JILI_AREAS.join("|") + "\",\"gender\":\"male|female (the creator's real gender, also decides their voice; voice-only / faceless creators still have one)\",\"persona\":\"2-4 sentences: personality, speaking style, what their streams/videos are like\",\"catchphrase\":\"a short signature line\",\"fanName\":\"what fans are called\",\"looks\":\"English visual description for image generation (face, hair, outfit, room); empty string for radio type\",\"schedule\":\"usual streaming time\",\"followReply\":\"the auto-reply DM a new follower receives, in their own voice: 2-4 short lines (thanks for following, who they are, what they make, a warm or funny sign-off; emoji ok; use \\n between lines)\",\"fans\":12345}";
    }

    /* =============================================================
     * 外部抓取（bgm.tv / B站 PGC），30 分钟模块级缓存
     * ============================================================= */

    var _fetchCache = new Map();

    function _cached(key, fn) {
        var hit = _fetchCache.get(key);
        if (hit && Date.now() - hit.t < CACHE_TTL) return Promise.resolve(hit.data);
        var p = Promise.resolve().then(fn).then(function (data) {
            _fetchCache.set(key, { t: Date.now(), data: data });
            if (_fetchCache.size > CACHE_MAX) {
                var first = _fetchCache.keys().next().value;
                if (first !== undefined) _fetchCache.delete(first);
            }
            return data;
        }).catch(function (err) {
            _fetchCache.delete(key);
            throw err;
        });
        return p;
    }

    function _httpsUp(url) {
        return String(url || "").replace(/^http:\/\//, "https://");
    }

    function _bgmItem(item) {
        var img = (item && item.images) || {};
        return {
            bgmId: item.id,
            title: item.name_cn || item.name || "",
            name: item.name || "",
            cover: _httpsUp(img.large || img.common || img.medium || img.image || ""),
            score: (item.rating && item.rating.score) || 0,
            airDate: item.air_date || item.date || "",
            weekday: item.air_weekday
        };
    }

    /** 番剧日历（bgm.tv/calendar），按星期分组，组内按评分降序 */
    function fetchBgmCalendar() {
        return _cached("bgm:calendar", async function () {
            var res = await fetch("https://api.bgm.tv/calendar", { headers: { "Accept": "application/json" } });
            if (!res.ok) throw new Error("BGM " + res.status);
            var list = await res.json();
            return (Array.isArray(list) ? list : []).map(function (group) {
                var weekday = group && group.weekday && group.weekday.id;
                return {
                    weekday: weekday,
                    items: ((group && group.items) || []).map(_bgmItem).filter(function (it) { return it.cover; })
                        .sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0); })
                };
            });
        });
    }

    /** 单个 bgm 条目详情 */
    function fetchBgmSubject(id) {
        return _cached("bgm:subject:" + id, async function () {
            var res = await fetch("https://api.bgm.tv/v0/subjects/" + encodeURIComponent(id), { headers: { "Accept": "application/json" } });
            if (!res.ok) throw new Error("BGM " + res.status);
            return _bgmItem(await res.json());
        });
    }

    /**
     * B站番剧季度信息。key 支持：
     *   完整链接 https://www.bilibili.com/bangumi/play/ss123 / media/md456，
     *   或 "ss123" / "ep456" / "md789"。
     */
    function fetchPgcSeason(key) {
        return _cached("pgc:" + key, async function () {
            var s = String(key || "");
            var m = /bilibili\.com\/bangumi\/(?:play|media)\/(ss|ep|md)(\d+)/i.exec(s) || /^(ss|ep|md)(\d+)$/i.exec(s.trim());
            if (!m) throw new Error("BAD_LINK");
            var q;
            if (m[1].toLowerCase() === "ss") {
                q = "season_id=" + m[2];
            } else if (m[1].toLowerCase() === "ep") {
                q = "ep_id=" + m[2];
            } else {
                var r1 = await fetch("https://api.bilibili.com/pgc/review/user?media_id=" + m[2], { headers: { "Accept": "application/json" } });
                if (!r1.ok) throw new Error("BILI " + r1.status);
                var d1 = await r1.json();
                var sid = d1 && d1.result && d1.result.media && d1.result.media.season_id;
                if (!sid) throw new Error("BILI BAD_MEDIA");
                q = "season_id=" + sid;
            }
            var res = await fetch("https://api.bilibili.com/pgc/view/web/season?" + q, { headers: { "Accept": "application/json" } });
            if (!res.ok) throw new Error("BILI " + res.status);
            var data = await res.json();
            var r = (data && (data.result || data.data)) || data;
            if (!r || (data && typeof data.code === "number" && data.code !== 0)) throw new Error("BILI " + ((data && data.code) || "BAD_DATA"));
            var title = String(r.title || "");
            if (r.season_title && title.indexOf(r.season_title) < 0) title = (title + " " + r.season_title).trim();
            var publish = r.publish || {};
            return {
                seasonId: r.season_id,
                seasonType: r.type,
                score: (r.rating && r.rating.score) || 0,
                scoreCount: (r.rating && r.rating.count) || 0,
                styles: r.styles || [],
                areas: r.areas || [],
                publishDate: publish.release_date_show || publish.pub_time_show || "",
                totalDesc: (r.new_ep && r.new_ep.desc) || "",
                title: title,
                cover: r.cover || "",
                evaluate: r.evaluate || "",
                episodes: (r.episodes || []).filter(function (e) { return e && e.bvid; }).map(function (e, i) {
                    return {
                        epId: e.ep_id || e.id,
                        bvid: e.bvid,
                        index: e.title || String(i + 1),
                        longTitle: e.long_title || "",
                        badge: e.badge || "",
                        vip: e.status !== 2 && !!e.badge,
                        durationSec: Math.round((e.duration || 0) / 1000),
                        cover: e.cover || ""
                    };
                }),
                seasons: (r.seasons || []).map(function (ss) {
                    return { seasonId: ss.season_id, title: ss.season_title || title };
                })
            };
        });
    }

    /** B站 PGC 排行榜（影视片库数据源）。seasonType: 1番剧 2电影 3纪录片 4国创 5综艺 7电视剧；day: 3/7 */
    function fetchBiliRank(seasonType, day) {
        return _cached("bili:rank:" + seasonType + ":" + day, async function () {
            var res = await fetch("https://api.bilibili.com/pgc/web/rank/list?day=" + (day || 3) + "&season_type=" + (seasonType || 2),
                { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com" } });
            if (!res.ok) throw new Error("BILI " + res.status);
            var data = await res.json();
            var list = data && data.result && data.result.list;
            if (!Array.isArray(list) || !list.length) throw new Error("BILI BAD_DATA");
            return list.map(function (it, i) {
                return {
                    seasonId: it.season_id || 0,
                    rank: it.rank || i + 1,
                    title: it.title || "",
                    cover: it.cover || it.ss_horizontal_cover || "",
                    badge: it.badge || "",
                    score: (it.rating && it.rating.score) || 0,
                    follow: (it.stat && (it.stat.follow || it.stat.view)) || 0,
                    newEpDesc: (it.new_ep && it.new_ep.desc) || "",
                    url: it.url || ""
                };
            });
        });
    }

    /* =============================================================
     * AI 引擎
     * ============================================================= */

    var ai = {};

    /* ---------------- 世界观起草 ----------------
     * 提示词逐字来源：main.pp.js 69603-69655 (hG) */
    ai.draftWorldview = async function (state, hint) {
        var chars = (state.characters || []).map(function (c) {
            return ["### " + c.name,
            c.persona ? "Persona:\n" + c.persona : "",
            c.worldInfo ? "World info:\n" + c.worldInfo : ""].filter(Boolean).join("\n");
        }).join("\n\n");

        var system = "You help set up a Bilibili-style video & live-streaming app inside a phone-simulator roleplay app. Decide what WORLD this video site exists in, based on the user's persona and the characters they chat with (their personas and world info).\nWrite a compact world brief that another AI will use to generate creators, videos and live streams that fit this world:\n- era / technology level, whether magic, supernatural, sci-fi tech etc. exist and how common they are\n- what society and daily life look like; notable places, factions, species or professions\n- what online video / streaming culture looks like in this world (what people stream, popular video genres, slang), described as things that would really exist there\nIf the material clearly shows the modern real world, say so briefly and note any special twist it has. If different characters come from different worlds, describe how they plausibly share one site (or note the main world and treat others as visitors).\n5-10 sentences. Write in " + _langName() + ". Output the brief as plain text only, no title, no JSON.";

        var user = (hint ? "The user's current draft (improve / keep what fits):\n" + hint + "\n\n" : "") +
            "USER \"" + (state.userName || "the user") + "\" persona:\n" + (state.userIntro || "(not written)") +
            "\n\nCHARACTERS:\n" + (chars || "(none)");

        var text = String(await sendLlm(system, user) || "")
            .replace(/^```[a-z]*\n?|```$/g, "")
            .trim();
        state.worldview = text;
        save(state);
        return text;
    };

    /* ---------------- 内容生成（推荐页刷新） ----------------
     * 提示词逐字来源：main.pp.js 69849-70032 (xG)，本移植 allowNewCreators=false（不生成新 UP） */
    function _creatorEntryBlock(creator) {
        return [
            "### id=" + creator.id + " | " + creator.name + " | followers=" + (Number(creator.fans) || 0) +
            " | type=" + (creator.type || "") + " | area=" + (creator.area || "") +
            (creator.gender ? " | gender=" + creator.gender : "") +
            (creator.sourceCharId ? " | THIS IS A CHARACTER THE USER KNOWS" : ""),
            creator.persona ? "Creator persona: " + creator.persona : "",
            creator.catchphrase ? "Catchphrase: " + creator.catchphrase : "",
            creator.schedule ? "Usual schedule: " + creator.schedule : "",
            creator.sourceCharId ? "Character background:\n" + (creator.persona || "") : ""
        ].filter(Boolean).join("\n");
    }

    ai.generateFeed = async function (state) {
        var count = 2 + (Date.now() % 3); /* 2-4 条 */
        var totalCreators = (state.creators || []).length;
        var allNames = (state.creators || []).map(function (c) { return c.name; });
        var charNames = (state.characters || []).map(function (c) { return c.name; });
        var creatorsBlock = (state.creators || []).map(_creatorEntryBlock).join("\n\n") || "(none yet — the site is brand new)";
        var recentTitles = (state.posts || []).filter(function (p) { return p.kind === "video"; }).slice(0, 8).map(function (p) { return p.title; });
        var aliases = [state.userName];

        var system = "You simulate the content feed of a Bilibili-style video & live-streaming site inside a phone-simulator app. The viewer is " + (state.userName || "the user") +
            ".\nCurrent local time: " + new Date().toLocaleString("en-US", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }) +
            ".\n\nCREATORS ON THE SITE:\n" + creatorsBlock +
            "\n" +
            "\nIMPORTANT: Do not invent any new creators. Return \"newCreators\":[] and use only the creators above.\n" +
            "\n\nNEW CREATORS: invent up to 0 new creators when the site needs more variety" +
            (totalCreators < 6 ? " (the site is still small, so do add some)" : " (only if it adds something; 0 is fine)") +
            ". Each: {\"tempId\":\"new1\", ...creator fields}. Handles look like real online handles, never real celebrities / streamers / brands; mix on-camera, faceless, VTuber and voice-only types. Creator fields: " + _creatorShape() + "." +
            (allNames.length ? "\nNames already taken: " + allNames.join(", ") : "") +
            (charNames.length ? "\nThese people are the user's own characters, not site creators: " + charNames.join(", ") + ". Never invent a new creator who is one of them (same name or obviously the same person)." : "") +
            "\n\n" +
            "TASK 1 — new content. Write " + count + " items spread across creators (each creator's voice and niche must show):\n- kind \"video\": title in Bilibili style (brackets, hooks, emoji ok), desc, area (" + JILI_AREAS.join("|") + "), coverText (2-8 chars — a PUNCHY thumbnail headline like a real video-site cover: numbers, exclamations, suspense or a hot take, e.g. \"10分钟搞定\" \"翻车了\" \"负债三千\" \"全网最细\"; NEVER a plain category label like \"美食分享\" or \"深夜电台\"; may contain one \\n to split two lines), durationSec (30-600),\n  script = storyboard lines covering the whole video [{\"t\":seconds,\"k\":\"say|desc\",\"text\":\"...\"}]. \"k\":\"say\" = words the creator actually SAYS OUT LOUD at that moment — write them as real speech in first person, the way they would say it on camera (these are read aloud by the voice). \"k\":\"desc\" = what is on screen while nobody is speaking: scene descriptions, on-screen captions, section titles, lyrics (these are only shown, never read aloud). Never write a camera direction, a scene description or third-person narration as \"say\", and never write spoken words as \"desc\". A talking video is mostly \"say\" with a few \"desc\"; every line needs a \"k\". The length MUST match the content: one line per 8-15 seconds of video, so lines ≈ durationSec / 12 (60s → 5 lines, 3 min → 15, 6 min → 30). Mix lengths across the batch like a real site: some short clips (30-90s), some medium (2-4 min), and when writing 3+ videos include at least one long video (5-10 min: deep dives, full tutorials, vlogs, story episodes) with a full script that really fills it. A thin topic is a short video; a long video must have enough content. Anything the script does not cover is cut from the video,\n  audio = \"voice\" when someone talks / narrates on camera, or \"bgm\" when the video is visuals set to music with nobody talking (surgery or lab footage, edits / MADs / fan cuts, scenery, cooking or crafting without narration, timelapses…). For \"bgm\" videos every script line is \"k\":\"desc\" (on-screen captions, scene descriptions or the lyrics being played) — never speech,\n  bgm = music search keywords for fitting background music: a real song as \"title artist\", or a style such as \"lofi piano\" / \"epic orchestral\" (every video gets one; talking videos just get quiet background music),\n  danmaku = 12-24 viewer bullet comments spread over the timeline (more for longer videos) [{\"t\":seconds,\"text\":\"short\"}] in real Bilibili meme style. Like the real site, a few are special: fixed at the top (\"mode\":\"top\") for 前方高能 / 空降 x:xx / 名场面 / 完结撒花-style moments, a rare one fixed at the bottom (\"mode\":\"bottom\"), and about 1 in 8 colored (\"color\":\"#fe0302\" / \"#ffd302\" / \"#00cd00\" / \"#89d5ff\" / \"#cc0273\" …); at the single biggest moment of a video at most 1-2 may be advanced danmaku (\"mode\":\"adv\": a big glowing line that appears in place, like 名场面 / 泪目 / 神仙打架 moments), a rare one may be \"big\":true (large text, e.g. 空降成功 / 全体起立), 0-1 may be the creator's own (\"up\":true, in their voice, e.g. thanking viewers or a spoiler warning), and 1-2 popular ones carry \"likes\" (100-50000) as highly-upvoted danmaku; most are plain white scrolling comments,\n  comments = readable top comments [{\"name\":\"handle\",\"text\":\"...\",\"likes\":123}], scaled by that creator's followers: 6 comments below 1k followers, 8 at 1k-10k, 10 at 10k-100k, and 12 at 100k+. Make them varied (short reactions, timestamps, questions, observations, disagreement, longer fan comments), not a wall of repetitive praise. A creator marked CHARACTER may occasionally comment under OTHER creators' videos in their own voice (consistent with their background and memories): use their exact creator name and add \"charCreatorId\":\"<their id>\".\n  stats {\"play\",\"likes\",\"coins\",\"favs\"} realistic for the creator's fan count,\n  fanOnly true for roughly 1 in 8 videos (charge-exclusive extras).\n  Series (optional, for multi-part content like tutorials, vlogs, dramas, challenges): \"series\" = the show name only (no season / episode numbers in it), \"season\" (number), \"episode\" (number within that season), \"epTitle\" = short episode subtitle (<=12 chars). To continue a creator's Running series use the exact same series name, the same season and the next episode number; a new season starts again at episode 1. A brand-new series starts at season 1 episode 1. Keep the video title natural (it may mention the episode, e.g. \"【Series name S2E3】...\").\n- kind \"dynamic\": short text post in the creator's voice (\"text\"), with likes and 5-8 varied comments.\n" +
            "TASK 2 — who is LIVE right now. Be realistic: most creators are OFFLINE most of the time. Only creators whose usual schedule fits the current local time are live (late night / early morning usually only 0-2 people; evenings the most). It is completely fine for nobody to be live. For each live creator give durationMin = how many more minutes this stream will last (20-240).\nVary what the streams actually ARE, like a real site: \"formats\" = 1-3 of " + LIVE_FORMATS.join(", ") + " (more than one = mixed stream, e.g. chat then sing). Match the creator's niche, but don't make every stream a chit-chat.\nFor creators marked CHARACTER: only live if it truly fits their persona AND what has been going on in their recent chat/story right now; otherwise not live. Give a one-sentence reason.\nSome streams can be live shopping (直播带货) when it genuinely fits the creator (beauty, food, fashion, gadgets, lifestyle, crafts, or a persona that would sell things): add \"goods\" = 2-6 items they sell, each {\"name\",\"emoji\",\"price\" (CNY, realistic for the item),\"desc\" (one selling point),\"stock\"}. Most streams have no goods — omit the field." +
            "\n\n" + _namesRule(aliases) +
            "\nWrite every human-readable text in " + _langName() + "." + _FOREIGN_CLAUSE +
            " Use creatorId exactly as given.\nOutput JSON only:\n{\"newCreators\":[{\"tempId\":\"new1\", ...}],\"posts\":[{\"creatorId\":\"...\",\"kind\":\"video|dynamic\", ...}],\"live\":[{\"creatorId\":\"...\",\"title\":\"stream title\",\"topic\":\"today's topic\",\"coverText\":\"<=8 chars\",\"formats\":[\"game\"],\"durationMin\":90,\"reason\":\"why they are live now\",\"goods\":[{\"name\":\"...\",\"emoji\":\"🧴\",\"price\":59,\"desc\":\"...\",\"stock\":200}]}]}";

        var user = (recentTitles.length ? "Recent titles already on the site (don't repeat): " + recentTitles.join(" / ") + "\n" : "") + "Generate now. JSON only.";

        var data = await _askJson("jili/generateFeed", system, user);
        var creatorMap = {};
        (state.creators || []).forEach(function (c) { creatorMap[String(c.id)] = c; });

        var added = 0;
        var rawPosts = (Array.isArray(data && data.posts) ? data.posts : []);
        for (var i = 0; i < rawPosts.length && added < count; i++) {
            var raw = rawPosts[i];
            var creator = creatorMap[String((raw && raw.creatorId) || "")];
            if (!creator) continue;
            var now = Date.now();
            if ((raw.kind || "video") === "video") {
                var title = String(raw.title || "").trim();
                if (!title) continue;
                var stats = raw.stats || {};
                var post = makePost({
                    id: jid("bv"), creatorId: creator.id, kind: "video",
                    title: title,
                    desc: String(raw.desc || "").trim(),
                    area: String(raw.area || creator.area || "life"),
                    coverText: String(raw.coverText || "").replace(/\\n/g, "\n").trim().slice(0, 10) || title.slice(0, 8),
                    durationSec: clampNum(raw.durationSec, 20, 3600, 180),
                    play: clampNum(stats.play, 10, 1e8, 1000),
                    likes: clampNum(stats.likes, 0, 1e8, 50),
                    coins: clampNum(stats.coins, 0, 1e8, 10),
                    favs: clampNum(stats.favs, 0, 1e8, 10),
                    audio: raw.audio === "bgm" ? "bgm" : "voice",
                    bgm: String(raw.bgm || ""),
                    script: (Array.isArray(raw.script) ? raw.script : []).map(function (l) {
                        return { t: clampNum(l && l.t, 0, 3600, 0), k: (l && l.k) === "desc" ? "desc" : "say", text: String((l && l.text) || "") };
                    }).filter(function (l) { return l.text; }),
                    series: String(raw.series || ""), season: Number(raw.season) || 0,
                    episode: Number(raw.episode) || 0, epTitle: String(raw.epTitle || ""),
                    fanOnly: !!raw.fanOnly,
                    at: now - added * 1000,
                    comments: (Array.isArray(raw.comments) ? raw.comments : [])
                        .filter(function (c) { return c && c.name && c.text && !_isUserName(c.name, aliases); })
                        .map(function (c, ci) {
                            return makeComment({ name: String(c.name), text: String(c.text), likes: clampNum(c.likes, 0, 1e8, 0), at: now - ci * 60000 });
                        })
                });
                post.commentsCount = post.comments.length;
                post.danmakuCount = (Array.isArray(raw.danmaku) ? raw.danmaku : []).length;
                (Array.isArray(raw.danmaku) ? raw.danmaku : []).forEach(function (d) {
                    if (!d || !d.text) return;
                    state.danmaku.push({
                        postId: post.id, time: clampNum(d.t, 0, post.durationSec, 0), text: String(d.text),
                        mode: d.mode === "top" || d.mode === "bottom" || d.mode === "adv" ? d.mode : "scroll",
                        color: typeof d.color === "string" ? d.color : "", big: !!d.big, up: !!d.up, likes: clampNum(d.likes, 0, 1e8, 0)
                    });
                });
                state.posts.unshift(post);
            } else {
                var text = String(raw.text || "").trim();
                if (!text) continue;
                var dyn = makePost({
                    id: jid("dy"), creatorId: creator.id, kind: "dynamic", text: text,
                    likes: clampNum((raw.stats && raw.stats.likes) || raw.likes, 0, 1e8, 20),
                    at: now - added * 1000,
                    comments: (Array.isArray(raw.comments) ? raw.comments : [])
                        .filter(function (c) { return c && c.name && c.text && !_isUserName(c.name, aliases); })
                        .map(function (c, ci) { return makeComment({ name: String(c.name), text: String(c.text), likes: clampNum(c.likes, 0, 1e8, 0), at: now - ci * 60000 }); })
                });
                dyn.commentsCount = dyn.comments.length;
                state.posts.unshift(dyn);
            }
            added += 1;
        }
        save(state);
        return { added: added };
    };

    /* ---------------- 私信回复 ----------------
     * 提示词逐字来源：main.pp.js 70033-70096 (bG)，本移植 canExchange=false（无换联系方式） */
    ai.dmReply = async function (state, creatorId, userText, opts) {
        opts = opts || {};
        var creator = (state.creators || []).find(function (c) { return String(c.id) === String(creatorId); });
        if (!creator) throw new Error("NO_CREATOR");
        var tid = threadId(creator.id);
        var thread = (state.dms || []).find(function (x) { return x.id === tid; });
        if (!thread) {
            thread = makeDMThread({ id: tid, creatorId: creator.id });
            state.dms.unshift(thread);
        }

        if (opts.reroll) {
            /* 重掷：截掉上一轮生成的 them 消息（从尾部连续的 them 自动消息开始删）；
             * 若带 userText（用户重发/改写最后一条），再把尾部的 me 消息一并截掉，
             * 之后由下方统一追加新的 me 消息 —— 与原项目 reroll 后 sendDM 的语义一致 */
            var msgs = (state.dmMessages || []).filter(function (m) { return m.threadId === tid; })
                .sort(function (a, b) { return a.at - b.at; });
            for (var r = msgs.length - 1; r >= 0; r--) {
                if (msgs[r].from !== "them") break;
                var idx = state.dmMessages.indexOf(msgs[r]);
                if (idx >= 0) state.dmMessages.splice(idx, 1);
            }
            if (userText) {
                var rest = (state.dmMessages || []).filter(function (m) { return m.threadId === tid; })
                    .sort(function (a, b) { return a.at - b.at; });
                if (rest.length && rest[rest.length - 1].from === "me") {
                    var meIdx = state.dmMessages.indexOf(rest[rest.length - 1]);
                    if (meIdx >= 0) state.dmMessages.splice(meIdx, 1);
                }
            }
        }

        var now = Date.now();
        if (userText) {
            state.dmMessages.push(makeDMMessage({ threadId: tid, from: "me", text: String(userText), at: now }));
        }

        var threadMsgs = (state.dmMessages || []).filter(function (m) { return m.threadId === tid; })
            .sort(function (a, b) { return a.at - b.at; });
        var transcript = threadMsgs.map(function (m) {
            return (m.from === "me" ? (state.userName || "Viewer") : creator.name) + ": " + m.text;
        }).join("\n");

        var recentWorks = (state.posts || [])
            .filter(function (p) { return String(p.creatorId) === String(creator.id) && p.kind === "video"; })
            .slice(0, 2).map(function (p) { return p.title; });
        var liveNow = creator.liveNow && creator.liveNow.title ? "\"" + creator.liveNow.title + "\"" : "";
        var localTime = new Date().toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

        var contextBlock = "";
        if (creator.sourceCharId) {
            var ch = (state.characters || []).find(function (c) { return c.id === creator.sourceCharId; });
            if (ch) {
                contextBlock = "### " + ch.name + "\nPersona:\n" + (ch.persona || "") + "\nWorld info:\n" + (ch.worldInfo || "");
            }
        }

        var system = "You are " + creator.name + ", a creator (\"UP主\") on a Bilibili-style video & live-streaming site inside a phone-simulator app, replying to a private message (站内私信) from a viewer.\nCreator type: " + (creator.type || "") + "; area: " + (creator.area || "") + ".\n" +
            (creator.persona ? "How you act as a creator: " + creator.persona : "") + "\n" +
            (creator.catchphrase ? "Catchphrase: " + creator.catchphrase : "") + "\n" +
            (creator.fanName ? "Your fans are called: " + creator.fanName : "") + "\n" +
            (recentWorks.length ? "Your latest uploads: " + recentWorks.join("; ") : "") + "\n" +
            (liveNow ? "You are LIVE right now: " + liveNow : "") + "\n" +
            "Local time now: " + localTime + ".\n" +
            (contextBlock
                ? "\nYou are also a character who personally knows " + (state.userName || "this viewer") + ". This site's DMs are separate from your private chat app, but it is the same relationship — act accordingly.\n" + contextBlock
                : "\nThe viewer is " + (state.userName || "a viewer") + ".") +
            "\n\nHOW BILIBILI 私信 FEELS — follow this:\n- This window IS the private conversation. Never suggest \"moving to DMs / private chat\", never call it a backstage, inbox pile or fan mail, never talk as if you are reading it from a creator dashboard.\n- It is phone texting on a video app: short, casual, quick-fire bubbles. Split your reply into 1-4 separate messages; each one is a single short line (a reaction, a question, one or two short sentences). No long paragraphs, no formal letter tone, no hashtags.\n- Stay fully in character (persona, speech habits, how you address " + (state.userName || "them") + ", world info rules). Being a creator is part of your life here, so it is natural to mention your videos, streams, editing, comments or 充电 when it fits — but answer what they actually said first.\n- Bilibili-style text emoticons such as [doge] [笑哭] [OK] [星星眼] or 2333 are fine occasionally if it suits your persona; don't overuse them.\n- Read the conversation: never repeat a line, joke, question or topic you already used above; move the conversation forward.\n\n" +
            "Write in " + _langName() + ".\nOutput JSON only: {\"replies\":[\"...\",\"...\"]}";

        var user = "Conversation so far:\n" + (transcript || "(empty)") + "\n\nReply now. JSON only.";

        var data = await _askJson("jili/dmReply", system, user);
        var replies = (Array.isArray(data && data.replies) ? data.replies : [])
            .map(function (s) { return String(s || "").trim(); }).filter(Boolean);
        if (!replies.length) throw new Error("EMPTY_REPLY");

        var lastMsg = null;
        var baseAt = Date.now();
        for (var i = 0; i < replies.length; i++) {
            lastMsg = makeDMMessage({ threadId: tid, from: "them", text: replies[i], at: baseAt + i, auto: true, kind: "text", meta: null });
            state.dmMessages.push(lastMsg);
            thread.unread = (Number(thread.unread) || 0) + 1;
        }

        /* 偶发卡片消息：正在直播 → live 卡；有最新视频 → video 卡（确定性哈希规则） */
        var h = hash(tid + "|" + String(userText || "") + "|" + replies.length);
        if (creator.liveNow && creator.liveNow.title && h % 5 === 0 && lastMsg) {
            lastMsg.kind = "live";
            lastMsg.meta = { title: creator.liveNow.title, live: true };
        } else {
            var latest = (state.posts || []).find(function (p) { return String(p.creatorId) === String(creator.id) && p.kind === "video"; });
            if (latest && h % 7 === 0 && lastMsg) {
                lastMsg.kind = "video";
                lastMsg.meta = { title: latest.title, dur: latest.durationSec };
            }
        }

        thread.lastText = lastMsg.text;
        thread.lastAt = lastMsg.at;
        save(state);
        return lastMsg;
    };

    /* ---------------- 评论回复（UP回复 + 围观群众） ----------------
     * 提示词逐字来源：JiliScreen.pp.js 1663-1872，本移植无 @提及/团队/多语言分支 */
    ai.commentReply = async function (state, postId, commentText) {
        var post = (state.posts || []).find(function (p) { return String(p.id) === String(postId); });
        if (!post) throw new Error("NO_POST");
        var creator = (state.creators || []).find(function (c) { return String(c.id) === String(post.creatorId); });
        var userName = state.userName || "the user";
        var aliases = [userName];

        var uploaderBlock;
        if (creator) {
            uploaderBlock = creator.sourceCharId
                ? "UPLOADER: \"" + creator.name + "\" — this channel belongs to a character who personally knows " + userName + ". When writing \"upReply\", you ARE this character: obey their persona and shared memories below.\n" + _creatorLine(creator, creator.persona || "")
                : "UPLOADER: \"" + creator.name + "\" (" + (Number(creator.fans) || 0) + " fans). Persona: " + (creator.persona || "") + (creator.catchphrase ? " Catchphrase: " + creator.catchphrase : "");
        } else {
            uploaderBlock = "The video was uploaded by " + userName + " themself — there is no other uploader to reply.";
        }
        var upRule = creator
            ? (creator.sourceCharId
                ? "the character usually replies to " + userName + " in their own voice (they know each other); \"\" only if it truly fits them to ignore it."
                : "small/medium uploaders often reply to fans; huge uploaders rarely do unless the comment is funny or notable. \"\" if they would not reply.")
            : "always \"\".";

        var system = "You simulate the comment section of a Bilibili-style video site inside a phone-simulator app.\n" +
            _videoContext(post) + "\n\n" +
            uploaderBlock + "\n\n" +
            "\n" + userName + " posted a new top-level comment." +
            "\n\nDecide realistically who responds:\n- \"upReply\": " + upRule +
            "\n- \"authorReply\": " + "always \"\"." +
            "\n- \"replies\": 3-7 other viewers joining the thread — a lively Bilibili comment thread, not one-liners in a row: agreeing, joking, arguing, adding info, quoting the video, meme replies (「+1」「笑死」 style lines are fine but mix in substantive ones). Viewers may reply to EACH OTHER: set \"replyTo\" to the handle they answer (" + userName + ", the uploader, or another viewer in this list); omit it when answering " + userName + ". Varied handles, varied lengths.\n- \"newComments\": 1-4 NEW top-level comments from other viewers that showed up around the same time about the video itself (timestamps like \"3:12 笑死\", questions, 课代表 summaries, jokes) — they must not repeat the replies.\n" +
            "- \"likes\": how many likes " + userName + "'s comment gets in the first hour (be realistic; most comments get 0-30).\nNever write lines for " + userName + ". " + _namesRule(aliases) + " Write in " + _langName() + "." +
            "\nOutput JSON only: {\"upReply\":\"\",\"authorReply\":\"\",\"replies\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":3,\"replyTo\":\"handle\"}],\"newComments\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":12}],\"likes\":5}";

        var user = userName + ": \"" + String(commentText || "") + "\"\nJSON only.";

        var data = await _askJson("jili/commentReply", system, user);
        var now = Date.now();
        var upComment = null;

        var upReply = creator ? String((data && data.upReply) || "").trim() : "";
        if (upReply) {
            upComment = makeComment({ name: creator.name, userId: creator.id, text: upReply, at: now, isUp: true });
            post.comments.push(upComment);
            state.inbox.unshift(makeInboxRow({
                cat: "reply", name: creator.name, userId: creator.id, text: upReply,
                quote: String(commentText || ""), thumbPostId: post.id, at: now
            }));
        }

        var threadHost = upComment;
        var repliesArr = (Array.isArray(data && data.replies) ? data.replies : [])
            .map(function (c) {
                return {
                    name: String((c && c.name) || "").trim(),
                    text: String((c && c.text) || "").trim(),
                    likes: clampNum(c && c.likes, 0, 99999, 0),
                    replyTo: String((c && c.replyTo) || "").trim()
                };
            })
            .filter(function (c) { return c.name && c.text && !_isUserName(c.name, aliases); });
        for (var i = 0; i < repliesArr.length; i++) {
            var rc = makeComment({ name: repliesArr[i].name, text: repliesArr[i].text, likes: repliesArr[i].likes, at: now + i });
            if (repliesArr[i].replyTo) rc.replyTo = repliesArr[i].replyTo;
            if (threadHost) threadHost.replies.push(rc);
            else post.comments.push(rc);
        }

        (Array.isArray(data && data.newComments) ? data.newComments : [])
            .map(function (c) {
                return { name: String((c && c.name) || "").trim(), text: String((c && c.text) || "").trim(), likes: clampNum(c && c.likes, 0, 99999, 0) };
            })
            .filter(function (c) { return c.name && c.text && !_isUserName(c.name, aliases); })
            .forEach(function (c, ci) { post.comments.push(makeComment({ name: c.name, text: c.text, likes: c.likes, at: now + 100 + ci })); });

        post.commentsCount = post.comments.length;
        save(state);
        return upComment; /* 无 UP 回复时为 null（围观评论已写入） */
    };

    /* ---------------- 弹幕互动 ----------------
     * 提示词逐字来源：JiliScreen.pp.js 1992-2037 */
    ai.danmakuReact = async function (state, postId, atSec) {
        var post = (state.posts || []).find(function (p) { return String(p.id) === String(postId); });
        if (!post) throw new Error("NO_POST");
        var creator = (state.creators || []).find(function (c) { return String(c.id) === String(post.creatorId); });
        var userName = state.userName || "me";
        var duration = Math.max(1, Number(post.durationSec) || 1);

        var all = (state.danmaku || []).filter(function (d) { return String(d.postId) === String(postId); });
        var sent = all.filter(function (d) { return Math.abs((Number(d.time) || 0) - (Number(atSec) || 0)) <= 25; }).slice(-5);
        if (!sent.length) sent = [{ time: Number(atSec) || 0, text: "……" }];
        var sentTs = sent.map(function (d) { return Number(d.time) || 0; });
        var minT = Math.min.apply(null, sentTs);
        var maxT = Math.max.apply(null, sentTs);
        var endT = Math.min(duration, maxT + 25);

        var nearby = all
            .filter(function (d) { return sent.indexOf(d) < 0 && Math.abs((Number(d.time) || 0) - (Number(atSec) || 0)) <= 60; })
            .slice(0, 12);
        var nearbyBlock = nearby.length
            ? "Bullet comments already on screen around here:\n" + nearby.map(function (d) { return "[" + formatDur(d.time) + "] " + d.text; }).join("\n") + "\n"
            : "";

        var system = "You simulate the live bullet comments (danmaku / 弹幕) of a Bilibili-style video site inside a phone-simulator app.\n" +
            _videoContext(post) + "\n" +
            (creator ? "Uploader: \"" + creator.name + "\"" + (creator.fanName ? ", fans are called " + creator.fanName : "") + "." : "") + "\n" +
            nearbyBlock +
            "\nThe viewer " + userName + " just sent these bullet comments:\n" +
            sent.map(function (d) { return "[" + formatDur(d.time) + "] " + d.text; }).join("\n") +
            "\n\nWrite how OTHER viewers' bullet comments flow right after (between " + formatDur(minT) + " and " + formatDur(endT) + "): 10-18 lines. Mix: people answering or riding " + userName + "'s bullet comment (接梗, 「前面的…」, agreeing / roasting), a few copying it as a meme wave (刷屏 like 「哈哈哈哈」「awsl」「泪目」 when it fits), and reactions to what the video shows at that moment. Each <= 20 characters, no handles, never written as " + userName + ". Write in " + _langName() + ".\nOutput JSON only: {\"danmaku\":[{\"t\":" + Math.round(minT + 1) + ",\"text\":\"...\"}]}";

        var data = await _askJson("jili/danmakuReact", system, "JSON only.");
        var list = (Array.isArray(data && data.danmaku) ? data.danmaku : [])
            .map(function (d) {
                return {
                    postId: postId,
                    time: clampNum(d && d.t, Math.round(minT), Math.round(endT), Math.round(minT + 1)),
                    text: String((d && d.text) || "").trim(),
                    mode: "scroll", color: "", big: false, up: false, likes: 0
                };
            })
            .filter(function (d) { return d.text; })
            .sort(function (a, b) { return a.time - b.time; });
        list.forEach(function (d) { state.danmaku.push(d); });
        save(state);
        return { added: list.length };
    };

    /* ---------------- 评论区冷启动 ----------------
     * 提示词逐字来源：JiliScreen.pp.js 2895-2976 */
    ai.seedComments = async function (state, postId) {
        var post = (state.posts || []).find(function (p) { return String(p.id) === String(postId); });
        if (!post) throw new Error("NO_POST");
        var creator = (state.creators || []).find(function (c) { return String(c.id) === String(post.creatorId); });
        var userName = state.userName || "me";
        var aliases = [userName];
        var selfUpload = !creator;
        var count = _commentCountFor(creator ? creator.fans : (state.fans || 0));
        var existing = (post.comments || []).map(function (c) { return c.name + ": " + c.text; }).join("\n");

        var system = "You write the comment section under one piece of content on a Bilibili-style video site inside a phone-simulator app.\n\n" +
            (selfUpload
                ? "This was uploaded by " + userName + " themself — the viewer IS the uploader. Never write a comment or reply in " + userName + "'s name; only other viewers comment here."
                : _creatorLine(creator, creator.sourceCharId ? (creator.persona || "") : "")) +
            "\n\n" +
            (post.kind !== "dynamic"
                ? "VIDEO: \"" + post.title + "\" (" + formatDur(post.durationSec) + ")" +
                (post.desc ? "\nDescription: " + post.desc : "") +
                ((post.script && post.script.length) ? "\nStoryboard:\n" + post.script.map(function (l) { return "[" + formatDur(l.t) + "] " + l.text; }).join("\n") : "")
                : "POST: " + post.text) +
            "\n" +
            (existing ? "\nComments already there (do NOT repeat them, react around them):\n" + existing : "") +
            "\n\nWrite " + count + " NEW comments: real viewers with varied handles and varied lengths — a joke, a genuine reaction to a specific moment, a nitpick, a question, someone quoting a line, a long-time fan. Bilibili comment culture. Some may argue with each other.\n" +
            "\n- " + _namesRule(aliases) +
            "\nWrite everything in " + _langName() + ".\n\nOutput JSON only: {\"comments\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":12}]}";

        var data = await _askJson("jili/seedComments", system, "Write the comments now. JSON only.");
        var now = Date.now();
        var list = (Array.isArray(data && data.comments) ? data.comments : [])
            .map(function (c) {
                return {
                    name: String((c && c.name) || "").trim(),
                    text: String((c && c.text) || "").trim(),
                    likes: clampNum(c && c.likes, 0, 999999, 0)
                };
            })
            .filter(function (c) { return c.name && c.text && !_isUserName(c.name, aliases); });
        list.forEach(function (c, i) {
            post.comments.push(makeComment({ name: c.name, text: c.text, likes: c.likes, at: now - i * 60000 }));
        });
        post.commentsCount = post.comments.length;
        save(state);
        return { added: list.length };
    };

    /* ---------------- 粉丝来信回复 ----------------
     * 提示词逐字来源：JiliScreen.pp.js 30616-30654 */
    ai.fanMailReply = async function (state, mailId) {
        var mail = (state.fanMail || []).find(function (m) { return String(m.id) === String(mailId); });
        if (!mail) throw new Error("NO_MAIL");
        var accountName = mail.accountName || state.userName || "UP";
        var post = mail.postId ? (state.posts || []).find(function (p) { return String(p.id) === String(mail.postId); }) || null : null;

        var messages = [{ from: "fan", text: mail.text, at: mail.at }];
        if (mail.reply) messages.push({ from: "me", text: mail.reply, at: mail.repliedAt || Date.now() });
        var transcript = messages.map(function (m) {
            return (m.from === "me" ? accountName : mail.fanName) + ": " + m.text;
        }).join("\n");

        var system = "You are \"" + mail.fanName + "\", an ordinary viewer on a Bilibili-style video site inside a phone-simulator app. After watching a video by the creator \"" + accountName + "\" you sent them a private message (站内私信), and now you are chatting with them in that private conversation.\n" +
            (post ? "The video you watched: \"" + post.title + "\"" + (post.desc ? "\nIts description: " + post.desc : "") : "") +
            "\n\nHOW THIS FEELS:\n- You are a fan texting the creator directly. Getting a reply from them feels like a small event: react like a real viewer would (excited, shy, nerdy, joking — whatever fits the personality your handle and first message suggest), and stay consistent with what you already wrote.\n- Phone texting on a video app: 1-3 separate short bubbles, each a single short line. No long paragraphs, no formal letter tone, no hashtags.\n- Answer what they actually said. Read the conversation; never repeat a line or question you already used; move it forward.\n- Bilibili-style emoticons like [doge] [笑哭] [星星眼] or 2333 are fine occasionally.\n- " + _namesRule([accountName, state.userName].filter(Boolean)) +
            "\nWrite in " + _langName() + ".\nOutput JSON only: {\"replies\":[\"...\",\"...\"]}";

        var user = "Conversation so far:\n" + (transcript || "(empty)") + "\n\nReply now as " + mail.fanName + ". JSON only.";

        var data = await _askJson("jili/fanMailReply", system, user);
        var replies = (Array.isArray(data && data.replies) ? data.replies : [])
            .map(function (s) { return String(s || "").trim(); }).filter(Boolean);
        if (!replies.length) throw new Error("EMPTY_REPLY");
        mail.reply = replies.join("\n");
        mail.repliedAt = Date.now();
        save(state);
        return mail;
    };

    /* ---------------- 上传视频（ghostPost 视频分支，创作者=用户本人） ----------------
     * 提示词逐字来源：JiliScreen.pp.js 2775-2840 (Dy)，创作者块替换为用户自有频道 */
    ai.uploadVideo = async function (state, brief) {
        var userName = state.userName || "me";
        var briefText = String(brief || "").trim();
        var recentTitles = (state.posts || [])
            .filter(function (p) { return String(p.creatorId) === "me" && p.kind === "video"; })
            .slice(0, 5).map(function (p) { return p.title; });
        var fans = Number(state.fans) || 0;
        var fansComments = fans >= 100000 ? "12" : fans >= 10000 ? "10" : fans >= 1000 ? "8" : "6";

        var system = "You write one new piece of content for a single creator on a Bilibili-style video site inside a phone-simulator app.\n\n" +
            "CREATOR: \"" + userName + "\" — the user's own channel (the viewer themself, uploading a video as a new UP主)." +
            "\n\n" +
            (briefText
                ? "WHAT THE POST MUST BE ABOUT (the viewer asked for exactly this — follow it, do not drift to another topic):\n" + briefText + "\n\nStay in this creator's voice and niche while covering it: it is still their channel, their style, their way of talking."
                : "No topic was given: pick something this creator would genuinely post right now — their usual niche, their current situation, something that fits what is going on in their life.") +
            "\n" +
            (recentTitles.length ? "\nThey recently posted (do not repeat these): " + recentTitles.join(" / ") : "") +
            "\n\n- " + _namesRule([userName]) +
            "\n- This is the user's own channel: write it as their own work, in their own voice. Never invent other people's actions as the user's." +
            "\nWrite all human-readable text in " + _langName() + "." +
            "\n\nOutput JSON only:\n" +
            "{\"title\":\"video title, Bilibili style (brackets / hooks / emoji ok)\",\"desc\":\"description under the video\",\"area\":\"" + JILI_AREAS.join("|") + "\",\"coverText\":\"<=8 chars for the cover\",\"durationSec\":180,\"audio\":\"voice|bgm\",\"bgm\":\"music search keywords, a real song as \\\"title artist\\\" or a style like lofi piano\",\"script\":[{\"t\":0,\"k\":\"say|desc\",\"text\":\"...\"}],\"danmaku\":[{\"t\":3,\"text\":\"short bullet comment\"}],\"comments\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":12}],\"stats\":{\"play\":12000,\"likes\":800,\"coins\":120,\"favs\":300},\"fanOnly\":false,\"series\":\"\",\"season\":0,\"episode\":0,\"epTitle\":\"\"}" +
            "\n  · script = storyboard lines covering the whole video. \"k\":\"say\" = words the creator actually SAYS OUT LOUD at that moment, written as real speech in first person (these get read aloud by the voice). \"k\":\"desc\" = what is on screen while nobody speaks (scene descriptions, captions, section titles, lyrics) — never write narration or camera directions as \"say\". One line per 8-15 seconds, so lines ≈ durationSec / 12. Anything the script does not cover is cut from the video, so the script must really fill the duration.\n  · audio \"bgm\" = visuals set to music with nobody talking; then every script line is \"k\":\"desc\".\n  · danmaku = 12-24 viewer bullet comments spread over the timeline, real Bilibili meme style.\n  · comments = " + fansComments + " readable top comments from viewers, with varied handles, lengths and opinions.\n  · stats realistic for " + (fans || 1000) + " followers. series/season/episode/epTitle only when it really is part of a series, otherwise \"\" / 0.";

        var data = await _askJson("jili/ghostPost", system, "Write the video now. JSON only.");
        if (!data || typeof data !== "object") throw new Error("EMPTY_REPLY");

        var title = String(data.title || "").trim();
        if (!title) throw new Error("EMPTY_REPLY");
        var durationSec = clampNum(data.durationSec, 20, 3600, 180);
        var script = (Array.isArray(data.script) ? data.script : [])
            .map(function (l) {
                return { t: clampNum(l && l.t, 0, durationSec, 0), k: (l && l.k) === "desc" ? "desc" : "say", text: String((l && l.text) || "") };
            }).filter(function (l) { return l.text; })
            .sort(function (a, b) { return a.t - b.t; });

        /* 由 script 推导 scenes: [{desc, dur}] */
        var scenes = [];
        for (var i = 0; i < script.length; i++) {
            var nextT = (i + 1 < script.length) ? script[i + 1].t : durationSec;
            scenes.push({ desc: script[i].text, dur: Math.max(1, Math.round(nextT - script[i].t)) });
        }
        if (!scenes.length) scenes = [{ desc: title, dur: durationSec }];

        var now = Date.now();
        var post = makePost({
            id: jid("bv"), creatorId: "me", kind: "video",
            title: title,
            desc: String(data.desc || "").trim(),
            intro: String(data.desc || "").trim(),
            area: String(data.area || "life"),
            coverText: state.settings && state.settings.autoCover ? title.slice(0, 8) : "",
            durationSec: durationSec,
            play: 0, likes: 0, coins: 0, favs: 0, danmakuCount: 0,
            audio: data.audio === "bgm" ? "bgm" : "voice",
            bgm: String(data.bgm || ""),
            script: script,
            scenes: scenes,
            seed: hash(title + "|" + durationSec),
            series: String(data.series || ""), season: Number(data.season) || 0,
            episode: Number(data.episode) || 0, epTitle: String(data.epTitle || ""),
            fanOnly: !!data.fanOnly,
            at: now
        });
        state.posts.unshift(post);

        (Array.isArray(data.danmaku) ? data.danmaku : []).forEach(function (d) {
            if (!d || !d.text) return;
            state.danmaku.push({ postId: post.id, time: clampNum(d.t, 0, durationSec, 0), text: String(d.text), mode: "scroll", color: "", big: false, up: false, likes: 0 });
        });

        var seedRes = await ai.seedComments(state, post.id);
        if ((!seedRes || seedRes.added < 2) && Array.isArray(data.comments) && data.comments.length) {
            data.comments.forEach(function (c, ci) {
                if (!c || !c.name || !c.text) return;
                if (_isUserName(c.name, [userName])) return;
                post.comments.push(makeComment({ name: String(c.name), text: String(c.text), likes: clampNum(c.likes, 0, 999999, 0), at: now + ci }));
            });
            post.commentsCount = post.comments.length;
        }

        save(state);
        return post;
    };

    /* ---------------- 动态文字（ghostPost dynamic 分支，创作者=用户本人） ----------------
     * 提示词逐字来源：JiliScreen.pp.js 2775-2840 (Dy) */
    ai.dynamicText = async function (state, hint) {
        var userName = state.userName || "me";
        var briefText = String(hint || "").trim();
        var fans = Number(state.fans) || 0;
        var fansComments = fans >= 100000 ? "10" : fans >= 10000 ? "8" : "6";

        var system = "You write one new piece of content for a single creator on a Bilibili-style video site inside a phone-simulator app.\n\n" +
            "CREATOR: \"" + userName + "\" — the user's own channel (the viewer themself, posting a dynamic on their feed)." +
            "\n\n" +
            (briefText
                ? "WHAT THE POST MUST BE ABOUT (the viewer asked for exactly this — follow it, do not drift to another topic):\n" + briefText + "\n\nStay in this creator's voice and niche while covering it: it is still their channel, their style, their way of talking."
                : "No topic was given: pick something this creator would genuinely post right now — their usual niche, their current situation, something that fits what is going on in their life.") +
            "\n" +
            "\n\n- " + _namesRule([userName]) +
            "\n- This is the user's own channel: write it as their own words." +
            "\nWrite all human-readable text in " + _langName() + "." +
            "\n\nOutput JSON only:\n" +
            "{\"text\":\"the post itself, in the creator's own voice (a real post someone writes on a video site: a thought, an update, a complaint, a photo caption…)\",\"likes\":420,\"comments\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":8}]}" +
            "\n  · comments = " + fansComments + " replies from viewers, varied handles, lengths and opinions, reacting to this specific post.";

        var data = await _askJson("jili/ghostPost", system, "Write the dynamic post now. JSON only.");
        var text = String((data && data.text) || "").trim();
        if (!text) throw new Error("EMPTY_REPLY");
        return text;
    };

    /* ---------------- 直播圆桌（无主持观众模拟） ----------------
     * 提示词逐字来源：JiliScreen.pp.js 21519-21588 (uh 无主持分支 + uO + uS)，
     * 按契约去掉主播/连线PK/嘉宾/带货/连麦申请段，输出类型仅 dm/gift/follow/like/sc/guard */
    function _giftPriceList() {
        return GIFTS.map(function (g) { return g.id + "(" + g.price + ")"; }).join(", ");
    }

    ai.liveRound = async function (state, roomId, userText) {
        var room = (state.liveRooms || []).find(function (r) {
            return String(r.id) === String(roomId) || String(r.creatorId) === String(roomId) || ("live:" + r.creatorId) === String(roomId);
        }) || null;
        var title = (room && room.title) || "我的直播间";
        var topic = (room && room.topic) || "";
        var source = (room && room.source) || "chat";
        var viewers = room && room.viewers ? Number(room.viewers) : Math.max(12, Math.round(0.03 * (Number(state.fans) || 0)));
        var userName = state.userName || "me";

        var roomStatus = ""; /* 本移植不维护跨回合房间状态（uO 输入为空） */
        var uO = roomStatus ? "\nROOM STATUS / what just happened:\n" + roomStatus + "\n" : "";

        var screenDesc = source === "camera" ? "their camera" : source === "video" ? "a video they are playing" : "a chat screen (voice/text only)";

        var system = "You simulate the audience of a small live stream on a Bilibili-style site inside a phone-simulator app. The STREAMER is the user \"" + userName + "\".\n" +
            "Stream: title \"" + title + "\"" + (topic ? ", topic \"" + topic + "\"" : "") + "; shown on screen: " + screenDesc + ". About " + viewers + " viewers are watching.\n" +
            uO +
            "\nWrite the audience's reaction to what just happened, as 8-14 ordered lines:\n" +
            "- \"dm\" bullet comments from random viewers (varied handles, fan medal lv 0-20, Bilibili meme style) reacting to what the streamer said/showed — react to the whole stretch of talk, not just the last sentence; some viewers answer questions the streamer asked.\n" +
            "- Viewers also tap the like button now and then: a few \"like\" lines with \"count\" = taps; a hype peak may carry one \"dm\" with \"hot\":true.\n" +
            "- The audience loves this streamer: \"gift\" (gift id(price in coins): " + _giftPriceList() + "), \"follow\", \"sc\" (price 30/50/100) and \"guard\" memberships (level captain/admiral/governor) whenever the moment or the person fits — any gift, any amount, no spending limit.\n" +
            "- Never write lines for the streamer.\n" +
            "- " + _namesRule([userName]) +
            "\nWrite all human-readable text in " + _langName() + ".\n" +
            "Output JSON only: {\"lines\":[{\"type\":\"dm\",\"name\":\"handle\",\"lv\":3,\"text\":\"...\"},{\"type\":\"gift\",\"name\":\"handle\",\"gift\":\"heart\",\"count\":1},{\"type\":\"follow\",\"name\":\"handle\"},{\"type\":\"like\",\"name\":\"handle\",\"count\":8},{\"type\":\"sc\",\"name\":\"handle\",\"price\":30,\"text\":\"...\"},{\"type\":\"guard\",\"name\":\"handle\",\"level\":\"captain\"}]}";

        var events = userText
            ? "- " + userName + " (the streamer) talked on stream, in order:\n  \"" + String(userText) + "\""
            : "- The stream just started";
        var user = "Just now:\n" + events + "\n\nJSON only.";

        var data = await _askJson("jili/liveRound", system, user);
        var allowed = { dm: 1, gift: 1, follow: 1, like: 1, sc: 1, guard: 1 };
        var lines = (Array.isArray(data && data.lines) ? data.lines : []).map(function (l) {
            if (!l || !allowed[l.type]) return null;
            var name = String(l.name || "").trim();
            if (!name || _isUserName(name, [userName])) return null;
            var out = { type: l.type, name: name };
            if (l.type === "dm" || l.type === "sc") {
                out.text = String(l.text || "").trim();
                if (!out.text) return null;
            }
            if (l.type === "dm") out.lv = clampNum(l.lv, 0, 20, 0);
            if (l.type === "gift") {
                out.gift = GIFT_IDS.indexOf(l.gift) >= 0 ? l.gift : "heart";
                out.count = clampNum(l.count, 1, 99, 1);
            }
            if (l.type === "like") out.count = clampNum(l.count, 1, 99, 1);
            if (l.type === "sc") out.price = SC_PRICES.indexOf(Number(l.price)) >= 0 ? Number(l.price) : clampNum(l.price, 1, 1000, 30);
            if (l.type === "guard") {
                out.level = GUARDS.some(function (g) { return g.id === l.level; }) ? l.level : "captain";
            }
            return out;
        }).filter(Boolean);
        if (!lines.length) throw new Error("EMPTY_REPLY");
        return { lines: lines };
    };

    /* ---------------- 角色入驻（charToCreator） ----------------
     * 提示词逐字来源：main.pp.js 69656-69716 (mG/fG) */
    ai.createCreator = async function (state, charLike) {
        var ch = charLike || {};
        var name = String(ch.name || "").trim();
        if (!name) throw new Error("NO_CHARACTER");
        var contextBlock = "Persona:\n" + (ch.persona || "(none)") + "\nWorld info:\n" + (ch.worldInfo || "(none)");

        var system = "A fictional character is starting an account on a Bilibili-style video & live-streaming site inside a phone-simulator app. Decide what kind of creator THEY would realistically be, true to their persona.\n\nCHARACTER NAME: " + name + "\n" + contextBlock +
            "\n\nRules:\n- Stay faithful to the persona: a shy character might be a faceless or radio streamer; a performer might go on camera; someone private might pick a VTuber avatar.\n- The handle can be their name or a handle they would pick.\n- Write persona (how they act as a creator), catchphrase, fanName and schedule in " + _langName() + ". \"looks\" is English and should match their real appearance if known.\nOutput JSON only: " + _creatorShape();

        var user = "Create " + name + "'s creator identity. JSON only.";

        var data = await _askJson("jili/charToCreator", system, user);
        var followReply = String((data && data.followReply) || "").replace(/\\n/g, "\n").trim();
        var creator = makeCreator({
            name: String((data && data.name) || "").trim() || name,
            type: JILI_TYPES.indexOf(String(data && data.type)) >= 0 ? String(data.type) : "virtual",
            area: JILI_AREAS.indexOf(String(data && data.area)) >= 0 ? String(data.area) : "chat",
            gender: ["male", "female"].indexOf(String(data && data.gender)) >= 0 ? String(data.gender) : "",
            persona: String((data && data.persona) || "").trim(),
            catchphrase: String((data && data.catchphrase) || "").trim(),
            fanName: String((data && data.fanName) || "").trim(),
            looks: String((data && data.looks) || "").trim(),
            schedule: String((data && data.schedule) || "").trim(),
            followReply: followReply,
            fans: clampNum(data && data.fans, 0, 50000000, 1000),
            sourceCharId: String(ch.id || ""),
            liveNow: null
        });
        state.creators.push(creator);
        save(state);
        return creator;
    };

    /* ---------------- UP 主转聊天角色（addCreatorAsFriend） ----------------
     * 提示词参照原项目 JiliScreen i6 调用结构重写（原 app-core chunk 未存档）：
     * 输入创作者档案 + 站内关系 → 生成聊天角色 {name, persona, worldInfo, firstMessage} */
    ai.creatorToChar = async function (state, creator, dmLines) {
        if (!creator) throw new Error("NO_CREATOR");
        if (creator.sourceCharId) throw new Error("ALREADY");
        var userName = state.userName || "me";
        var works = (state.posts || [])
            .filter(function (p) { return String(p.creatorId) === String(creator.id) && (p.title || p.text); })
            .slice(0, 4).map(function (p) { return p.title || p.text; });
        var siteInfo = [
            (state.following || []).map(String).indexOf(String(creator.id)) >= 0 ? userName + " follows them." : "",
            chargedOf(state, creator.id) ? userName + " pays for their channel membership (充电)." : "",
            works.length ? userName + " has seen on the site: " + works.join(" / ") : "",
            (dmLines && dmLines.length) ? "They have exchanged " + dmLines.length + " private messages on the site." : ""
        ].filter(Boolean).join(" ");

        var system = "You turn a creator on a Bilibili-style video & live-streaming site inside a phone-simulator app into a chat character the viewer (\"" + userName + "\") can talk with one-on-one, as if they had become real friends beyond the site.\n\n" +
            _creatorLine(creator, "") +
            (siteInfo ? "\n\nHow they know each other on the site: " + siteInfo : "") +
            (dmLines && dmLines.length ? "\n\nTheir recent private messages:\n" + dmLines.join("\n") : "") +
            "\n\nWrite:\n- \"name\": the handle they would actually go by in a private chat (may be their real name or a closer nickname).\n- \"persona\": 3-5 sentences in " + _langName() + " — who they are off camera, their speaking style, how they treat " + userName + ", what they care about; consistent with their creator persona.\n- \"worldInfo\": one or two sentences about the world they live in (same world as the site).\n- \"firstMessage\": their first private chat message to " + userName + " after becoming friends, in their own voice, 1-3 sentences, warm but in character (not a customer-service script).\nOutput JSON only: {\"name\":\"...\",\"persona\":\"...\",\"worldInfo\":\"...\",\"firstMessage\":\"...\"}";

        var data = await _askJson("jili/addCreatorAsFriend", system, "Write " + creator.name + "'s chat character. JSON only.");
        var persona = String((data && data.persona) || "").trim();
        if (!persona) throw new Error("EMPTY_REPLY");
        return {
            name: String((data && data.name) || "").trim() || creator.name,
            persona: persona,
            worldInfo: String((data && data.worldInfo) || "").trim() || state.worldview || "",
            firstMessage: String((data && data.firstMessage) || "").trim()
        };
    };

    /* ---------------- 评论区楼中楼扩写（expandThread/threadReplies） ----------------
     * 提示词逐字来源：JiliScreen chunk 2656-2735（Do 函数内嵌 DK 提示词） */
    ai.threadReplies = async function (state, postId, commentLike) {
        var post = (state.posts || []).find(function (p) { return String(p.id) === String(postId); });
        if (!post) throw new Error("NO_POST");
        var cm = commentLike || {};
        var creator = (state.creators || []).find(function (c) { return String(c.id) === String(post.creatorId); });
        var userName = state.userName || "me";
        var aliases = [userName];
        var isDynamic = post.kind === "dynamic";
        var script = (post.script || []).map(function (l) { return "[" + formatDur(l.t) + "] " + l.text; }).join("\n");
        var existing = (cm.replies || []).map(function (r) {
            return (r.me ? userName + " (the viewer)" : r.name) +
                (r.replyTo && r.replyTo !== cm.name ? " → @" + r.replyTo : "") + ": " + r.text;
        }).join("\n");
        var charCreators = (state.creators || []).filter(function (c) {
            return c.sourceCharId && String(c.id) !== String(post.creatorId);
        }).map(function (c) { return c.name + " (id " + c.id + ")"; }).join(", ");

        var system = "You write a reply thread (楼中楼) under one comment on a Bilibili-style video site inside a phone-simulator app.\n\n" +
            (creator ? _creatorLine(creator, "") : "This was uploaded by " + userName + " themself — there is no other uploader.") + "\n\n" +
            (isDynamic
                ? "POST: " + String(post.text || "")
                : "VIDEO: \"" + (post.title || "") + "\" (" + formatDur(post.durationSec) + ")" +
                    (post.desc ? "\nDescription: " + post.desc : "") +
                    (script ? "\nStoryboard:\n" + script : "")) + "\n\n" +
            "THE COMMENT (楼主): " + (cm.me ? userName + " (the viewer)" : cm.name) + ": " + String(cm.text || "") + "\n" +
            (existing ? "Replies already under it (continue from here, do NOT repeat them):\n" + existing : "No replies yet.") + "\n\n" +
            "Write 5-8 NEW replies that continue this thread. Other viewers talk to EACH OTHER, not just to the 楼主: set \"replyTo\" to the exact handle being answered (the 楼主, someone already in the thread, or someone earlier in your own list). Varied handles, varied lengths; the same person may come back 2-3 times to keep an exchange going. The 楼主" + (cm.me ? "" : " may also come back and reply") + ".\nLet the thread go wherever it naturally would for this comment — a real discussion, a heated argument with sides taken and 阴阳怪气, or a meme chain; pick what this comment would actually spark.\n" +
            (creator ? "The uploader \"" + creator.name + "\" rarely steps in; only if it truly fits, include ONE reply from them with \"up\": true" + (creator.sourceCharId ? " — written in their own voice." : ".") : "") + "\n" +
            (charCreators ? "These creators are characters the viewer knows; one of them MAY drop in if it fits (exact name, and their \"id\" as \"charCreatorId\"): " + charCreators + ".\n" : "") +
            "- " + _namesRule(aliases) + " Replies may answer " + userName + " (replyTo \"" + userName + "\") but never speak as them.\n" +
            "Write everything in " + _langName() + ".\n\nOutput JSON only: {\"replies\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":3,\"replyTo\":\"handle\"" +
            (creator ? ",\"up\":false" : "") + (charCreators ? ",\"charCreatorId\":\"(only for a listed creator)\"" : "") + "}]}";

        var data = await _askJson("jili/threadReplies", system, "Continue the thread now. JSON only.");
        var list = (Array.isArray(data && data.replies) ? data.replies : []).map(function (r) {
            var up = !!creator && r && r.up === true;
            var name = up ? creator.name : String((r && r.name) || "").trim();
            var cci = !up && r && r.charCreatorId && (state.creators || []).some(function (c) { return String(c.id) === String(r.charCreatorId); })
                ? String(r.charCreatorId) : "";
            var out = {
                name: name,
                text: String((r && r.text) || "").trim(),
                likes: clampNum(r && r.likes, 0, 999999, 0)
            };
            if (!out.name || !out.text || _isUserName(out.name, aliases)) return null;
            if (r && r.replyTo && String(r.replyTo).trim()) out.replyTo = String(r.replyTo).trim();
            if (up) { out.up = true; out.charCreatorId = String(creator.id); }
            else if (cci) out.charCreatorId = cci;
            return out;
        }).filter(Boolean);
        if (!list.length) throw new Error("EMPTY_REPLY");
        return { replies: list };
    };

    /* ---------------- 投稿后观众反响（uploadReception） ----------------
     * 提示词逐字来源：JiliScreen chunk 1970-2000（去掉团队账号/协作者/帧视觉分支） */
    ai.uploadReception = async function (state, post) {
        var userName = state.userName || "me";
        var myFans = Number(state.fans) || 0;
        var duration = Math.max(10, Number(post.durationSec) || 60);
        var noScript = !(post.script || []).length;
        var commentN = myFans >= 500000 ? 28 : myFans >= 100000 ? 24 : myFans >= 10000 ? 18 : myFans >= 1000 ? 14 : 10;
        var script = (post.script || []).map(function (l) { return "[" + formatDur(l.t) + "] " + l.text; }).join("\n");

        var system = "You simulate how the audience of a Bilibili-style video site reacts to a video that the user \"" + userName + "\" just uploaded (inside a phone-simulator app).\n" +
            userName + " has " + myFans + " followers on the site. Judge the reception by how appealing the video genuinely is — a great or striking video can blow up and go viral no matter how small the account is.\n\n" +
            "VIDEO: \"" + (post.title || "") + "\" (" + formatDur(duration) + ")" + (post.area ? ", category " + post.area : "") + "\n" +
            (post.desc ? "Description: " + post.desc + "\n" : "") +
            (noScript ? "" : "Storyboard written by " + userName + ":\n" + script + "\n") +
            "\nProduce:\n" +
            (noScript ? "- \"script\": 5-10 short storyboard captions describing what happens, with times t (seconds, 0-" + duration + "), based ONLY on the title / description — do not invent a different video.\n" : "") +
            "- \"danmaku\": 12-20 bullet comments timed across the video (t in seconds), reacting to specific moments.\n" +
            "- \"comments\": exactly " + commentN + " readable comments from viewers. Use varied handles and lengths: quick reactions, timestamp jokes, questions, useful observations, mild disagreement, and a few longer comments. Avoid repetitive praise; some may ask " + userName + " questions.\n" +
            "- \"fanMail\": 0-4 private messages viewers send " + userName + " after watching (asking for the BGM or a tutorial, urging the next upload, fan confessions, collab requests...), [{\"name\":\"handle\",\"text\":\"...\"}]. [] is fine for an unremarkable video.\n" +
            "- \"stats\": first-day numbers {play, likes, coins, favs}; \"newFans\": followers gained.\n" +
            _namesRule([userName]) +
            "\nWrite all text in " + _langName() + ".\n" +
            "Output JSON only: {" + (noScript ? "\"script\":[{\"t\":0,\"text\":\"...\"}]," : "") + "\"danmaku\":[{\"t\":3,\"text\":\"...\"}],\"comments\":[{\"name\":\"handle\",\"text\":\"...\",\"likes\":2}],\"fanMail\":[{\"name\":\"handle\",\"text\":\"...\"}],\"stats\":{\"play\":300,\"likes\":20,\"coins\":3,\"favs\":5},\"newFans\":4}";

        var data = await _askJson("jili/uploadReception", system, "JSON only.");
        var norm = function (arr) {
            return (Array.isArray(arr) ? arr : []).map(function (x) {
                return {
                    t: clampNum(x && x.t, 0, duration, 0),
                    text: String((x && x.text) || "").trim()
                };
            }).filter(function (x) { return x.text; }).sort(function (a, b) { return a.t - b.t; });
        };
        var stats = data && data.stats || {};
        var play = clampNum(stats.play, 1, 1e8, 120);
        var likes = clampNum(stats.likes, 0, play, Math.round(0.05 * play));
        return {
            script: noScript ? norm(data && data.script).map(function (x) { return { t: x.t, k: "desc", text: x.text }; }) : null,
            danmaku: norm(data && data.danmaku),
            comments: (Array.isArray(data && data.comments) ? data.comments : []).map(function (c) {
                return {
                    name: String((c && c.name) || "").trim(),
                    text: String((c && c.text) || "").trim(),
                    likes: clampNum(c && c.likes, 0, likes, 0)
                };
            }).filter(function (c) { return c.name && c.text && !_isUserName(c.name, [userName]); }),
            fanMail: (Array.isArray(data && data.fanMail) ? data.fanMail : []).map(function (m) {
                return {
                    name: String((m && m.name) || "").trim(),
                    text: String((m && m.text) || "").trim()
                };
            }).filter(function (m) { return m.name && m.text && !_isUserName(m.name, [userName]); }),
            stats: {
                play: play,
                likes: likes,
                coins: clampNum(stats.coins, 0, play, Math.round(0.2 * likes)),
                favs: clampNum(stats.favs, 0, play, Math.round(0.3 * likes))
            },
            newFans: clampNum(data && data.newFans, 0, play, 0)
        };
    };

    /* ---------------- 一起看放映室 AI（screeningRound） ----------------
     * 提示词逐字来源：JiliScreen chunk 3608-3660（xl 的 screening 提示词，
     * 去掉视觉帧/视频下载分支 —— 本移植固定盲态或字幕驱动） */
    ai.screeningRound = async function (state, opts) {
        opts = opts || {};
        var chars = (opts.chars || []).filter(function (c) { return c && c.name; });
        if (!chars.length) throw new Error("NO_CHARS");
        var userName = state.userName || "me";
        var source = opts.source || {};
        var kind = String(source.kind || "post");
        var time = Math.max(0, Number(opts.time) || 0);
        var paused = !!opts.paused;
        var seenBefore = !!opts.seenBefore;
        var userText = String(opts.userText || "").trim();
        var trigger = String(opts.trigger || "");
        var scenes = (opts.scenes || []).slice(-6);
        var lines = (opts.lines || []).slice(-40);
        var danmaku = (opts.danmaku || []).slice(-30);
        var recent = (opts.recent || []).slice(-24);
        var multi = chars.length > 1;
        var names = chars.map(function (c) { return c.name; });
        var watchDesc = kind === "post"
            ? "a video on the Jili video site (shown as storyboard captions + bullet comments)"
            : "bilibili" === kind ? "a Bilibili video (embedded player)"
                : "youtube" === kind ? "a YouTube video (embedded player)" : "a video";
        var fmt = function (s) { return formatDur(s); };
        var contextBlock = function (ch) {
            return "Persona:\n" + (ch.persona || "(none)") + "\nWorld info:\n" + (ch.worldInfo || "(none)") + "\n";
        };
        var recentBlock = recent.map(function (l) {
            return (l.from === "me" ? userName : l.charName || names[0]) + ": " + l.text;
        }).join("\n");

        var styleBlock = "STYLE — this is live chat while watching side by side, like texting a friend during a movie, NOT an essay:\n" +
            "- Split into " + (multi ? (!userText && trigger ? "2-4" : "4-8") : (!userText && trigger ? "1-3" : "3-6")) + " separate chat bubbles. Each bubble is ONE short breath: a quick reaction, an exclamation, a half-sentence, or one or two short sentences. Never pack a whole paragraph into one bubble.\n" +
            "- Mix it up the way people really talk while watching: gut reactions to what just happened on screen (\"wait—\", \"no way\", a laugh), noticing a concrete detail, how it makes " + (multi ? "them" : "you") + " feel, teasing or checking on " + userName + ", a guess about what comes next, a question back to " + userName + ".\n" +
            "- If " + userName + " asked something, answer it first, then keep chatting naturally. Leave room for " + userName + " to reply — end with something " + userName + " can respond to more often than not.\n" +
            "- Keep the rhythm casual; do not summarise the whole video or lecture.\n" +
            "- Read \"Your conversation so far\": NEVER repeat a reaction, joke, observation, question or comforting line already said there (not even reworded). The video has moved on — react to what is new now, or build on what was said instead of restating it.";
        var styleFull = multi
            ? styleBlock + "\n- " + chars.length + " people are talking: let them bounce off each other (agree, disagree, tease, finish each other's thoughts). Not everyone must speak every time; if " + userName + " addresses someone by name, that person answers first.\nAlso add 0-3 very short bullet comments (\"danmaku\", <= 15 chars) someone would type on screen."
            : styleBlock + "\nAlso add 0-3 very short bullet comments (\"danmaku\", <= 15 chars) you would type on screen.";
        var replyShape = multi ? "[{\"name\":\"<one of: " + names.join(" / ") + ">\",\"text\":\"...\"}]" : "[\"...\"]";

        var system = multi
            ? "You voice " + chars.length + " characters — " + names.join(", ") + " — who are all watching " + watchDesc + " together with " + userName + " in a private screening room on a video app inside a phone-simulator app. Keep each of them fully in character with their own voice; they know the others are here and may react to one another as well as to " + userName + ".\n" +
                chars.map(function (ch, i) { return "\n=== " + ch.name + " ===\n" + contextBlock(ch); }).join("")
            : "You are " + names[0] + ", watching " + watchDesc + " together with " + userName + " in a private screening room on a video app inside a phone-simulator app. Stay fully in character.\n" + contextBlock(chars[0]);

        var inChar = "IN CHARACTER — non-negotiable:\n" +
            "- " + (multi ? "Each character" : "You") + " must sound exactly like the PERSONA" + (multi ? "s" : "") + " above: their speech habits, vocabulary, how they address " + userName + ", their temperament and what they would or would not say. The WORLD INFO / EXTRA RULES above are canon — never contradict them.\n" +
            "- Know only what the persona and world allow. If the video touches something " + (multi ? "a character" : "you") + " would have a strong personal take on (their own past, people they know, their values), react from that — that is what makes it feel like watching with *them*, not with a generic AI.\n" +
            "- Be specific: point at concrete things (what is on screen, a line of dialogue or lyric, a bullet comment, the title) and give a real opinion. Avoid empty filler, therapist-style comfort, or repeating the same pet name / opener in every bubble.\n\n" +
            "FOCUS: this is a watching-together moment. Talk mainly about the video — what is on screen, the dialogue, the bullet comments and " + (multi ? "their" : "your") + " reactions to it. The memories and ongoing story from " + (multi ? "their" : "your") + " main chat with " + userName + " are background only (they shape the relationship and tone): do not continue main-chat storylines, errands, plans or scenes, and do not invent things happening around " + (multi ? "them" : "you") + " in the room, unless " + userName + " brings them up first. Bringing the video back to your shared life is fine when it is a natural reaction to what you are watching.";

        var nowWatching = "NOW WATCHING: \"" + (source.title || "") + "\"" + (source.author ? " by " + source.author : "") +
            (source.durationSec ? " (length " + fmt(source.durationSec) + ")" : "") + " — " +
            (opts.timeUnknown
                ? "current position UNKNOWN (the player does not report progress and " + userName + " has not synced the clock yet; do not assume it is at the start or still paused — it may well be playing)"
                : "current position " + fmt(time) + (paused ? ", video is PAUSED right now" : "")) + ".\n" +
            (source.desc ? "Description: " + source.desc + "\n" : "") +
            "KNOWLEDGE: if you genuinely recognize this title as a real, existing film / show / video, you may draw on what you know (cast, trivia, themes, context). " +
            (seenBefore
                ? (multi ? "They have" : "You have") + " seen it before, so " + (multi ? "they" : "you") + " may say things like \"wait for this part\", but do not ruin major twists unless asked."
                : (multi ? "They have" : "You have") + " NOT seen it: never reveal or hint at anything that happens after " + fmt(time) + " — no spoilers. If unsure whether the title is known, do not pretend to know it.");

        var blocks = system + "\n\n" + inChar + "\n\n" + nowWatching + "\n";
        if (scenes.length) blocks += "\nWHAT HAS BEEN SEEN EARLIER (your memory of this viewing):\n" + scenes.map(function (s) { return "[" + fmt(s.t) + "] " + s.text; }).join("\n") + "\n";
        if (lines.length) blocks += "\n" + (kind === "post" ? "STORYBOARD CAPTIONS" : "DIALOGUE / SUBTITLES") + " up to now:\n" + lines.map(function (l) { return "[" + fmt(l.t) + "] " + l.text; }).join("\n") + "\n";
        if (danmaku.length) blocks += "\n" + (kind === "bilibili" ? "REAL BULLET COMMENTS (danmaku) Bilibili viewers posted" : "BULLET COMMENTS other viewers posted") + " around here:\n" + danmaku.map(function (d) { return "[" + fmt(d.t) + "] " + d.text; }).join("\n") + "\n";
        blocks += "\nSCREEN: you cannot see the picture right now — react from the dialogue, what you know and the conversation. Never invent specific visual details.\n\n" +
            styleFull + " React to the concrete content above, not generic filler.\n" +
            "Write in " + _langName() + ".\n" +
            "Output JSON only: {\"replies\":" + replyShape + ",\"danmaku\":[\"...\"]}";

        var user = (recentBlock ? "Your conversation so far:\n" + recentBlock + "\n\n" : "") +
            (userText ? userName + " says: \"" + userText + "\""
                : trigger === "pause" ? "(" + userName + " just paused the video. Say something about this moment, the way people chat when someone hits pause.)"
                    : trigger === "cut" ? "(The scene just changed. Nobody asked — react naturally if it is worth a comment.)"
                        : trigger === "timer" ? "(A while has passed without talking. Say something natural about what you are watching.)"
                            : userName + " asks what " + (multi ? "everyone thinks" : "you think") + " about this part.") +
            "\nJSON only.";

        var data = await _askJson("jili/screening", blocks, user);
        var rawReplies = data && (data.replies || data.reply || data.messages || data.bubbles);
        var replies;
        if (multi) {
            replies = (Array.isArray(rawReplies) ? rawReplies : []).map(function (r) {
                var name = String((r && (r.name || r.speaker || r.charName)) || "").trim();
                var text = String((r && (r.text || (typeof r === "string" ? r : ""))) || "").trim();
                var hit = chars.find(function (c) { return _norm(c.name) === _norm(name); });
                if (!hit && text) {
                    var m = /^([^：:]{1,12})[：:]\s*(.+)$/.exec(text);
                    if (m) {
                        var guess = chars.find(function (c) { return _norm(c.name) === _norm(m[1]); });
                        if (guess) { hit = guess; text = m[2]; }
                    }
                }
                if (!hit || !text) return null;
                return { charId: hit.id, charName: hit.name, text: text };
            }).filter(Boolean);
        } else {
            replies = (Array.isArray(rawReplies) ? rawReplies : []).map(function (t) {
                var text = typeof t === "string" ? t : String((t && t.text) || "");
                text = text.trim();
                return text ? { charId: chars[0].id, charName: chars[0].name, text: text } : null;
            }).filter(Boolean);
        }
        var dms = (Array.isArray(data && data.danmaku) ? data.danmaku : []).map(function (t) {
            return String(typeof t === "string" ? t : (t && t.text) || "").trim();
        }).filter(Boolean).slice(0, 3);
        if (!replies.length) throw new Error("EMPTY_REPLY");
        return { replies: replies, danmaku: dms };
    };

    /* =============================================================
     * 导出（共享契约：window.JiliCore —— 成员名与契约一字不差）
     * ============================================================= */

    window.JiliCore = {
        STORAGE_KEY: STORAGE_KEY,
        LEVELS: LEVELS,
        RATES: RATES,
        FX_COLORS: FX_COLORS,
        RECHARGE_TIERS: RECHARGE_TIERS,
        GIFTS: GIFTS,
        load: load,
        save: save,
        reset: reset,
        createDefaultJiliState: createDefaultJiliState,
        levelOf: levelOf,
        formatCount: formatCount,
        formatDur: formatDur,
        relTime: relTime,
        hash: hash,
        seedCover: seedCover,
        avatarColor: avatarColor,
        shuffle: shuffle,
        threadId: threadId,
        chargedOf: chargedOf,
        isFollowed: isFollowed,
        makeCreator: makeCreator,
        makePost: makePost,
        makeComment: makeComment,
        makeNotice: makeNotice,
        makeFanMail: makeFanMail,
        makeDMThread: makeDMThread,
        makeDMMessage: makeDMMessage,
        makeInboxRow: makeInboxRow,
        sendLlm: sendLlm,
        extractJson: extractJson,
        fetchBgmCalendar: fetchBgmCalendar,
        fetchBgmSubject: fetchBgmSubject,
        fetchPgcSeason: fetchPgcSeason,
        fetchBiliRank: fetchBiliRank,
        ai: ai
    };
})();
