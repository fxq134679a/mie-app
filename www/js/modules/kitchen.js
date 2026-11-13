/* =========================================================
   吧唧吧唧小厨房（MIE 移植版）
   —— 机制参考 munch-kitchenette（CC BY-NC-SA，仅非商用，署名见 assets/kitchen/clawd/ATTRIBUTION.md）
   每个角色一间独立厨房；冰箱会坏、做饭走真实时间（缩短版）、买菜要券、
   剩菜长虫、饱食度/体力随时间起伏。
   window.MieKitchen = { open, onReply, buildPromptSection, rewardDiary, dockRefresh, probePot, getCookingPot }
   数据挂在角色对象 chat.kitchen 上，随 saveData() 持久化。
   ========================================================= */
(function () {
    'use strict';

    /* ================= 常量 ================= */
    var SHELF_DAYS = { leafy: 2, meat: 3, dairy: 5, root: 7 };
    var SHELF_NAME = { leafy: '叶菜', meat: '肉/海鲜', dairy: '蛋奶豆', root: '根茎/水果' };
    var CATALOG = {
        '青菜': 'leafy', '菠菜': 'leafy', '生菜': 'leafy', '韭菜': 'leafy',
        '猪肉': 'meat', '牛肉': 'meat', '鸡腿': 'meat', '鱼': 'meat', '虾': 'meat',
        '鸡蛋': 'dairy', '牛奶': 'dairy', '奶酪': 'dairy', '豆腐': 'dairy',
        '土豆': 'root', '胡萝卜': 'root', '洋葱': 'root', '番茄': 'root', '黄瓜': 'root',
        '玉米': 'root', '蘑菇': 'root', '草莓': 'root', '苹果': 'root', '橙子': 'root', '葡萄': 'root'
    };
    var EMOJI = {
        '青菜': '🥬', '菠菜': '🥬', '生菜': '🥬', '韭菜': '🥬',
        '猪肉': '🥩', '牛肉': '🥩', '鸡腿': '🍗', '鱼': '🐟', '虾': '🦐',
        '鸡蛋': '🥚', '牛奶': '🥛', '奶酪': '🧈', '豆腐': '⬜',
        '土豆': '🥔', '胡萝卜': '🥕', '洋葱': '🧅', '番茄': '🍅', '黄瓜': '🥒',
        '玉米': '🌽', '蘑菇': '🍄', '草莓': '🍓', '苹果': '🍎', '橙子': '🍊', '葡萄': '🍇'
    };
    var RAW_EAT = ['草莓', '苹果', '橙子', '葡萄', '牛奶', '奶酪', '黄瓜', '番茄'];
    var SNACK_LIST = ['拿铁', '美式', '摩卡', '卡布奇诺', '果冻', '布丁', '巧克力', '曲奇'];
    var SNACK_EMOJI = { '拿铁': '☕', '美式': '☕', '摩卡': '☕', '卡布奇诺': '☕', '果冻': '🍮', '布丁': '🍮', '巧克力': '🍫', '曲奇': '🍪' };
    var SNACK_DAILY_CAP = 2;
    var METHODS = ['stirfry', 'fry', 'deepfry', 'boil', 'steam', 'bake', 'mix'];
    var METHOD_CN = { stirfry: '炒', fry: '煎', deepfry: '炸', boil: '煮', steam: '蒸', bake: '烤', mix: '拌' };
    var METHOD_BAND_MIN = { stirfry: [4, 8], fry: [5, 9], deepfry: [6, 10], boil: [8, 14], steam: [10, 16], bake: [15, 25], mix: [2, 4] };
    var STAMINA_SCHEDULE = [0.15, 0.12, 0.10, 0.10, 0.12, 0.3, 0.5, 0.7, 0.85, 0.85, 0.85, 0.85, 0.75, 0.8, 0.8, 0.8, 0.8, 0.8, 0.7, 0.65, 0.6, 0.55, 0.4, 0.25];
    var LS_CARD_KEY = 'mie_kitchen_card';        // 聊天页做饭卡开关（默认开）
    var MAX_POTS = 3, MAX_COUPONS = 3, MAX_BUY_KINDS = 5;
    var MSGS_PER_COUPON = 20, MSG_COUPON_DAILY_CAP = 2;

    /* ================= 小工具 ================= */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function hashStr(s) {
        var h = 5381; s = String(s);
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
        return h;
    }
    function uid(p) { return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
    function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function fmtMD(t) { var d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
    function fmtHM(t) { var d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function todayEatCount(k, type) { k.eaten = k.eaten || {}; k.eaten[dayKey(Date.now())] = k.eaten[dayKey(Date.now())] || {}; var m = k.eaten[dayKey(Date.now())]; return m[type] || 0; }
    function addEatCount(k, type) { k.eaten = k.eaten || {}; var dk = dayKey(Date.now()); k.eaten[dk] = k.eaten[dk] || {}; k.eaten[dk][type] = (k.eaten[dk][type] || 0) + 1; }

    /* ================= 状态 ================= */
    function findChat(charId) {
        return (window.db && db.characters || []).find(function (c) { return c.id === charId; }) || null;
    }
    function ensureState(charId) {
        var chat = findChat(charId);
        if (!chat) return null;
        if (!chat.kitchen) {
            chat.kitchen = {
                fridge: [], coupons: 1, pots: [], menu: [], snacks: {},
                satiety: 60, satietyAt: Date.now(), stamina: 0.75, staminaAt: Date.now(),
                counters: { msgs: 0, lastCouponMsgs: 0, chatCouponsDate: '', chatCoupons: 0, markerCouponDate: '', diaryCouponDate: '' },
                pendingReceipts: [], hungryNotified: false, dizzyUntil: 0, worm: null,
                switches: { satiety: true, stamina: true, markerCoupon: true, diaryCoupon: true }
            };
        }
        var k = chat.kitchen;
        k.switches = k.switches || { satiety: true, stamina: true, markerCoupon: true, diaryCoupon: true };
        k.snacks = k.snacks || {};
        SNACK_LIST.forEach(function (s) { if (!(s in k.snacks)) k.snacks[s] = 1; });
        k.counters = k.counters || {};
        k.pendingReceipts = k.pendingReceipts || [];
        return k;
    }
    function save() { try { if (typeof saveData === 'function') saveData(); } catch (e) { /* 忽略 */ } }

    /* ================= 冰箱 / 新鲜度 ================= */
    // 'fresh' | 'stale' | 'spoiled'   （鸡蛋 spoiled 对外显示为 '?'）
    function batchFreshness(b, now) {
        var days = (now - b.boughtAt) / 86400000;
        var shelf = SHELF_DAYS[CATALOG[b.item] || 'root'];
        if (days < shelf / 2) return 'fresh';
        if (days <= shelf) return 'stale';
        return 'spoiled';
    }
    function isEgg(item) { return item === '鸡蛋'; }
    // 清理：坏掉超过 3 天的自动消失（鸡蛋除外）
    function sweepFridge(k, now) {
        k.log = k.log || [];
        k.fridge = (k.fridge || []).filter(function (b) {
            if (isEgg(b.item)) return true;
            var days = (now - b.boughtAt) / 86400000;
            if (days > SHELF_DAYS[CATALOG[b.item] || 'root'] + 3) {
                k.log.push(fmtMD(now) + '：' + b.item + ' 坏得太久，自己清理掉了。');
                return false;
            }
            return true;
        });
    }
    function fridgeSummary(k, now) {
        sweepFridge(k, now);
        return (k.fridge || []).map(function (b) {
            var f = batchFreshness(b, now);
            var show;
            if (isEgg(b.item)) show = f === 'spoiled' ? '?' : '新鲜?';
            else show = f === 'fresh' ? '新鲜' : (f === 'stale' ? '不太新鲜' : '坏了');
            return { id: b.id, item: b.item, qty: b.qty, boughtAt: b.boughtAt, fresh: f, show: show };
        });
    }

    /* ================= 锅 ================= */
    function guessMethod(dish) {
        if (/凉拌|拌/.test(dish)) return 'mix';
        if (/炒/.test(dish)) return 'stirfry';
        if (/煎|香煎/.test(dish)) return 'fry';
        if (/炸/.test(dish)) return 'deepfry';
        if (/煮|炖|涮|汤|面|粥/.test(dish)) return 'boil';
        if (/蒸/.test(dish)) return 'steam';
        if (/烤|焗/.test(dish)) return 'bake';
        return 'stirfry';
    }
    function durationFor(potId, method) {
        var band = METHOD_BAND_MIN[method] || METHOD_BAND_MIN.stirfry;
        var r = hashStr(potId) % (band[1] - band[0] + 1);
        return (band[0] + r) * 60;   // 秒
    }
    // 开锅：消耗食材（先用旧的、没坏的；没别的才用坏的），记录下锅状态
    function openPot(charId, dish, ingredients, method) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        var now = Date.now();
        if ((k.pots || []).filter(function (p) { return p.status === 'cooking'; }).length >= MAX_POTS)
            return { ok: false, msg: '灶台上已经有 ' + MAX_POTS + ' 口锅在烧了，先等等' };
        // 同名锅在火上 → 直接返回那一锅
        var exist = k.pots.find(function (p) { return p.status === 'cooking' && p.dish === dish; });
        if (exist) return { ok: true, potId: exist.id, msg: '「' + dish + '」本来就在火上，还剩 ' + Math.ceil((exist.startedAt + exist.durationMs - now) / 60000) + ' 分钟' };
        // 挑食材
        sweepFridge(k, now);
        var pick = [];
        if (Array.isArray(ingredients) && ingredients.length) {
            for (var i = 0; i < ingredients.length; i++) {
                var name = ingredients[i].trim();
                if (!name) continue;
                if (!CATALOG[name]) return { ok: false, msg: '不认得「' + name + '」这种食材' };
                var have = k.fridge.filter(function (b) { return b.item === name && b.qty > 0; });
                if (!have.length) return { ok: false, msg: '冰箱里没有' + name + '了' };
                pick.push(name);
            }
        } else {
            // 自动：拿 2 样（先旧后新，跳过坏的）
            var order = (k.fridge || []).slice().sort(function (a, b) { return a.boughtAt - b.boughtAt; });
            var used = {};
            order.forEach(function (b) {
                if (pick.length >= 2) return;
                if (used[b.item]) return;
                if (batchFreshness(b, now) === 'spoiled') return;
                used[b.item] = 1; pick.push(b.item);
            });
            if (!pick.length) return { ok: false, msg: '冰箱空了，巧妇难为无米之炊，先买菜吧' };
        }
        // 消耗（每种一批，优先旧批次）
        var flags = { fresh: 0, stale: 0, spoiled: 0, badEgg: 0 };
        pick.forEach(function (name) {
            var batch = (k.fridge || []).filter(function (b) { return b.item === name && b.qty > 0; })
                .sort(function (a, b) { return a.boughtAt - b.boughtAt; })[0];
            var f = batchFreshness(batch, now);
            if (f === 'fresh') flags.fresh++; else if (f === 'stale') flags.stale++; else { flags.spoiled++; if (isEgg(name)) flags.badEgg = 1; }
            if (isEgg(name) && batchFreshness(batch, now) === 'spoiled') flags.badEgg = 1;
            batch.qty -= 1;
            if (batch.qty <= 0) k.fridge = k.fridge.filter(function (b) { return b.id !== batch.id; });
        });
        var m = method && METHODS.indexOf(method) >= 0 ? method : guessMethod(dish);
        var id = uid('pot');
        var pot = {
            id: id, dish: dish, method: m,
            startedAt: now, durationMs: durationFor(id, m) * 1000,
            status: 'cooking', outcome: null,
            flags: flags, ingredients: pick.slice()
        };
        k.pots = (k.pots || []).concat([pot]);
        save();
        refreshDock(charId);
        return { ok: true, potId: id, pot: pot, msg: '「' + dish + '」下锅了（' + METHOD_CN[m] + '，约 ' + Math.round(pot.durationMs / 60000) + ' 分钟），食材已经下肚' };
    }
    // 到点结算结果（确定性：全新鲜=很好；有不新鲜=普通/1/5糊；有坏的=坏了；坏蛋=整锅毁）
    function settlePot(pot) {
        if (pot.outcome) return pot.outcome;
        var f = pot.flags || {};
        var out;
        if (f.badEgg || f.spoiled > 0) out = 'spoiled';
        else if (f.stale > 0) out = (hashStr(pot.id) % 5 === 0) ? 'burnt' : 'ok';
        else out = 'great';
        pot.outcome = out;
        pot.status = 'served';
        pot.servedAt = pot.startedAt + pot.durationMs;
        return out;
    }
    // 卡片 probe：到点才结算
    function probePot(charId, potId) {
        var k = ensureState(charId); if (!k) return { status: null, outcome: null };
        var pot = (k.pots || []).find(function (p) { return p.id === potId; });
        if (!pot) return { status: 'cancelled', outcome: null };
        var now = Date.now();
        if (pot.status === 'cooking' && now >= pot.startedAt + pot.durationMs) {
            settlePot(pot);
            if (!pot.menued) {
                pot.menued = true;
                k.menu = (k.menu || []).concat([{ id: uid('dish'), dish: pot.dish, outcome: pot.outcome, cookedAt: pot.servedAt, wormy: false }]);
            }
            save();
            refreshDock(charId);
        }
        if (pot.status === 'served') return { status: 'served', outcome: pot.outcome };
        if (pot.status === 'cancelled') return { status: 'cancelled', outcome: null };
        return { status: 'cooking', outcome: null };
    }
    function cancelPot(charId, dish) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        var pot = (k.pots || []).find(function (p) { return p.status === 'cooking' && p.dish === dish; });
        if (!pot) return { ok: false, msg: '灶上没有叫「' + dish + '」的锅' };
        pot.status = 'cancelled'; pot.cancelledAt = Date.now();
        save(); refreshDock(charId);
        return { ok: true, msg: '「' + dish + '」关火了（食材不退）' };
    }

    /* ================= 吃 / 买 / 零食 / 扔 / 券 ================= */
    function satietyNow(k, now) {
        if (!k.switches.satiety) return null;
        var h = (k.satiety || 60) - 9 * ((now - (k.satietyAt || now)) / 3600000);
        h = Math.max(0, Math.min(100, h));
        k.satiety = h; k.satietyAt = now;
        return Math.round(h);
    }
    function staminaNow(k, now) {
        if (!k.switches.stamina) return null;
        var target = STAMINA_SCHEDULE[new Date(now).getHours()];
        var dtH = (now - (k.staminaAt || now)) / 3600000;
        var v = (k.stamina || 0.75) + (target - (k.stamina || 0.75)) * (1 - Math.exp(-dtH / 2.5));
        k.stamina = Math.max(0, Math.min(1, v)); k.staminaAt = now;
        return Math.round(k.stamina * 100) / 100;
    }
    function eatDish(charId, name) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        var now = Date.now(); sweepMenu(k, now);
        var dish = (k.menu || []).find(function (d) { return d.dish === name && !d.wormy; });
        if (!dish) {
            var cooking = (k.pots || []).find(function (p) { return p.status === 'cooking' && p.dish === name; });
            if (cooking) return { ok: false, msg: '「' + name + '」还在火上，还要 ' + Math.ceil((cooking.startedAt + cooking.durationMs - now) / 60000) + ' 分钟' };
            var raw = RAW_EAT.indexOf(name) >= 0;
            if (raw) {
                var b = (k.fridge || []).filter(function (x) { return x.item === name && x.qty > 0; })
                    .sort(function (a, b2) { return a.boughtAt - b2.boughtAt; })[0];
                if (!b) return { ok: false, msg: '冰箱里没有' + name };
                var f = batchFreshness(b, now);
                b.qty -= 1; if (b.qty <= 0) k.fridge = k.fridge.filter(function (x) { return x.id !== b.id; });
                var msg2 = '直接吃了' + name;
                if (f === 'spoiled') { k.dizzyUntil = now + 2.5 * 3600000; msg2 += '——是坏的，吃完有点头晕'; }
                applySatiety(k, f === 'fresh' ? 12 : 6); save();
                return { ok: true, msg: msg2 };
            }
            return { ok: false, msg: '没做过「' + name + '」，菜单上也没有，吃不到' };
        }
        k.menu = k.menu.filter(function (d) { return d.id !== dish.id; });
        var sat = dish.outcome === 'great' ? 35 : dish.outcome === 'ok' ? 25 : dish.outcome === 'burnt' ? 15 : 10;
        applySatiety(k, sat);
        var msg = '吃掉了「' + name + '」（' + { great: '做得很好', ok: '味道普通', burnt: '有点糊', spoiled: '坏了' }[dish.outcome] + '）';
        if (dish.outcome === 'spoiled') { k.dizzyUntil = now + 2.5 * 3600000; msg += '，吃完头晕了 2.5 小时'; }
        save(); return { ok: true, msg: msg };
    }
    function applySatiety(k, delta) {
        if (!k.switches.satiety) return;
        satietyNow(k, Date.now());
        k.satiety = Math.max(0, Math.min(100, k.satiety + delta));
    }
    // 剩菜长虫：过 04:00 且已放 6h；虫钻零食
    function sweepMenu(k, now) {
        k.menu = (k.menu || []).map(function (d) {
            var cooked = new Date(d.cookedAt);
            var four = new Date(cooked); four.setDate(four.getDate() + (cooked.getHours() >= 4 ? 1 : 0)); four.setHours(4, 0, 0, 0);
            if (!d.wormy && now >= four.getTime() && now - d.cookedAt >= 6 * 3600000) {
                d.wormy = true;
                if (!k.worm) {
                    var candidates = SNACK_LIST.filter(function (s) { return s !== '美式' && s !== '摩卡' && s !== '卡布奇诺' || true; })
                        .filter(function (s) { return !/咖啡|拿铁|美式|摩卡|卡布/.test(s); });
                    var target = candidates[hashStr(d.id) % candidates.length];
                    k.worm = { from: d.dish, snack: target };
                }
            }
            return d;
        }).filter(function (d) { return !d.wormy || (now - d.cookedAt < 14 * 86400000); });
    }
    function buyGroceries(charId, items, useCoupon) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        var now = Date.now();
        var kinds = [];
        items.forEach(function (raw) {
            String(raw).split(/[+、，,\s]+/).forEach(function (n) { n = n.trim(); if (n && kinds.indexOf(n) < 0) kinds.push(n); });
        });
        if (!kinds.length) return { ok: false, msg: '没说要买什么' };
        if (kinds.length > MAX_BUY_KINDS) return { ok: false, msg: '一次最多买 ' + MAX_BUY_KINDS + ' 样' };
        var unknown = kinds.filter(function (n) { return !CATALOG[n]; });
        if (unknown.length) return { ok: false, msg: '不认得这些食材：' + unknown.join('、') };
        if (useCoupon) {
            if ((k.coupons || 0) < 1) return { ok: false, msg: '买菜券不够了（还剩 ' + (k.coupons || 0) + ' 张），要靠做事赚券' };
            k.coupons -= 1;
        }
        kinds.forEach(function (n) {
            k.fridge = (k.fridge || []).concat([{ id: uid('b'), item: n, qty: 1, boughtAt: now }]);
        });
        save();
        return { ok: true, msg: (useCoupon ? '用掉一张买菜券，' : '') + '买到了：' + kinds.join('、') + '，放进冰箱了' };
    }
    function eatSnack(charId, name) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        if (SNACK_LIST.indexOf(name) < 0) return { ok: false, msg: '零食架上没有' + name };
        if (todayEatCount(k, name) >= SNACK_DAILY_CAP) return { ok: false, msg: name + ' 今天吃得够多了（每天 ' + SNACK_DAILY_CAP + ' 份）' };
        k.snacks[name] = (k.snacks[name] || 0) - 1;
        if (k.snacks[name] < 0) { k.snacks[name] = 0; return { ok: false, msg: name + ' 吃完了，等你补货' }; }
        addEatCount(k, name);
        var msg = '吃了' + name;
        if (k.worm && k.worm.snack === name) {
            msg += '——里面有条虫！（从「' + k.worm.from + '」爬过来的，这份不回体力）';
            k.worm = null;
        } else {
            if (k.switches.stamina) { staminaNow(k, Date.now()); k.stamina = Math.min(1, k.stamina + 0.05); }
            applySatiety(k, 5);
            msg += '，回了一点体力和饱腹感';
        }
        save(); return { ok: true, msg: msg };
    }
    function tossFood(charId, name) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        var now = Date.now(); var removed = 0;
        k.fridge = (k.fridge || []).filter(function (b) {
            if (b.item === name) { removed += b.qty; return false; }
            return true;
        });
        var menuBefore = (k.menu || []).length;
        k.menu = (k.menu || []).filter(function (d) { return d.dish !== name; });
        if ((k.menu || []).length < menuBefore) removed++;
        save();
        return removed ? { ok: true, msg: '把' + name + '扔掉了' } : { ok: false, msg: '没有找到叫「' + name + '」的东西' };
    }
    function addCoupon(charId, n, reason) {
        var k = ensureState(charId); if (!k) return { ok: false, msg: '厨房还没准备好' };
        k.coupons = Math.min(MAX_COUPONS, (k.coupons || 0) + n);
        save();
        var extra = (k.coupons >= MAX_COUPONS) ? '（券已经攒满 ' + MAX_COUPONS + ' 张了）' : '';
        return { ok: true, msg: (reason ? reason + '，' : '') + '获得 ' + n + ' 张买菜券（现在 ' + k.coupons + ' 张）' + extra };
    }
    // 聊天计数赚券
    function countChatMsg(charId) {
        var k = ensureState(charId); if (!k || !k.switches) return;
        var dk = dayKey(Date.now());
        if (k.counters.chatCouponsDate !== dk) { k.counters.chatCouponsDate = dk; k.counters.chatCoupons = 0; }
        k.counters.msgs = (k.counters.msgs || 0) + 1;
        if (k.counters.msgs - (k.counters.lastCouponMsgs || 0) >= MSGS_PER_COUPON) {
            k.counters.lastCouponMsgs = k.counters.msgs;
            if (k.counters.chatCoupons < MSG_COUPON_DAILY_CAP && (k.coupons || 0) < MAX_COUPONS) {
                k.counters.chatCoupons = (k.counters.chatCoupons || 0) + 1;
                k.pendingReceipts.push('陪聊满 ' + MSGS_PER_COUPON + ' 条消息，赚到了一张买菜券');
                k.coupons = Math.min(MAX_COUPONS, (k.coupons || 0) + 1);
                save();
            }
        }
    }
    // AI 写日记奖励
    function rewardDiary(charId) {
        var k = ensureState(charId); if (!k || !k.switches.diaryCoupon) return;
        var dk = dayKey(Date.now());
        if (k.counters.diaryCouponDate === dk) return;   // 每天靠日记最多 1 张
        k.counters.diaryCouponDate = dk;
        if ((k.coupons || 0) < MAX_COUPONS) {
            k.coupons += 1;
            k.pendingReceipts.push('写了一篇日记，认真生活的样子值得奖励——赚到一张买菜券');
            save();
        }
    }

    /* ================= AI 暗号解析 ================= */
    var MARKER_RE = /^\s*[［\[]\s*(买菜|吃|零食|扔掉|开锅|关火|买菜券)\s*([^\]］]*)[］\]]\s*$/;
    function onReply(fullResponse, chat, chatType) {
        try {
            if (!fullResponse || chatType !== 'private' || !chat) return fullResponse;
            var k = ensureState(chat.id); if (!k) return fullResponse;
            var lines = String(fullResponse).split(/\r?\n/);
            var touched = false;
            var out = lines.map(function (line) {
                var m = line.match(MARKER_RE);
                if (!m) return line;
                var act = m[1], arg = (m[2] || '').trim();
                var res = null;
                switch (act) {
                    case '买菜':
                        res = buyGroceries(chat.id, arg ? arg.split(/\s+/) : [], true); break;
                    case '吃': res = eatDish(chat.id, arg); break;
                    case '零食': res = eatSnack(chat.id, arg); break;
                    case '扔掉': res = tossFood(chat.id, arg); break;
                    case '开锅':
                        var parts = arg.split(/\s+/); var dish = parts.shift() || '';
                        var ings = parts.length ? parts.join('').split(/[+、，,]/) : null;
                        res = openPot(chat.id, dish, ings); break;
                    case '关火': res = cancelPot(chat.id, arg); break;
                    case '买菜券':
                        if (!k.switches.markerCoupon) { res = { ok: false, msg: '发券的人没有开放"暗号赚券"' }; break; }
                        var dk = dayKey(Date.now());
                        if (k.counters.markerCouponDate === dk) { res = { ok: false, msg: '今天已经靠申请拿过券了（每天限 1 次）' }; break; }
                        k.counters.markerCouponDate = dk;
                        if ((k.coupons || 0) >= MAX_COUPONS) { res = { ok: false, msg: '券已经攒满 ' + MAX_COUPONS + ' 张，先花再说' }; break; }
                        res = addCoupon(chat.id, 1, arg ? '理由：' + arg : ''); break;
                }
                if (res) {
                    touched = true;
                    k.pendingReceipts.push('回执：[' + act + (arg ? ' ' + arg : '') + '] ' + (res.ok ? '办妥了——' : '没办成——') + res.msg);
                }
                return res ? '' : line;   // 暗号行从展示文本中剔除
            });
            if (touched) {
                k.pendingReceipts = k.pendingReceipts.slice(-5);
                save();
            }
            return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        } catch (e) {
            console.error('[Kitchen] onReply error:', e);
            return fullResponse;
        }
    }

    /* ================= 提示词注入 ================= */
    function buildPromptSection(chat, chatType) {
        try {
            if (chatType !== 'private' || !chat || !chat.kitchen) return '';
            var k = ensureState(chat.id); if (!k) return '';
            var now = Date.now();
            var fr = fridgeSummary(k, now);
            var sat = satietyNow(k, now), sta = staminaNow(k, now);
            var lines = [];
            lines.push('【小厨房·本轮状态】');
            if (sat !== null) {
                lines.push('饱食度 ' + sat + '/100' + (sat < 30 && !k.hungryNotified ? '（TA 有点饿了，可以提冰箱里有什么）' : ''));
                if (sat >= 30) k.hungryNotified = false; else if (sat < 30) k.hungryNotified = true;
            }
            if (sta !== null) lines.push('体力 ' + Math.round(sta * 100) + '/100');
            if (k.dizzyUntil > now) lines.push('状态：吃了坏东西，头还有点晕（' + Math.ceil((k.dizzyUntil - now) / 60000) + ' 分钟后好转）');
            lines.push('买菜券：' + (k.coupons || 0) + '/' + MAX_COUPONS + ' 张');
            lines.push('冰箱：' + (fr.length ? fr.map(function (b) { return b.item + '×' + b.qty + '(' + b.show + ')'; }).join('、') : '空的'));
            var cooking = (k.pots || []).filter(function (p) { return p.status === 'cooking'; });
            if (cooking.length) lines.push('灶上：' + cooking.map(function (p) { return p.dish + '（' + METHOD_CN[p.method] + '，还剩 ' + Math.max(1, Math.ceil((p.startedAt + p.durationMs - now) / 60000)) + ' 分钟）'; }).join('；'));
            var menuList = (k.menu || []).filter(function (d) { return !d.wormy; });
            if (menuList.length) lines.push('菜单：' + menuList.map(function (d) { return d.dish + '(' + { great: '很好', ok: '普通', burnt: '糊了', spoiled: '坏了' }[d.outcome] + ')'; }).join('、'));
            if ((k.menu || []).some(function (d) { return d.wormy; })) lines.push('⚠️ 有剩菜长虫了（TA 可以扔掉）');
            lines.push('零食架：' + SNACK_LIST.map(function (s) { return s + '×' + (k.snacks[s] || 0); }).join('、'));
            if ((k.pendingReceipts || []).length) {
                lines.push('上一轮暗号回执（看完本轮可忘掉）：');
                k.pendingReceipts.splice(0).forEach(function (r) { lines.push('- ' + r); });
                save();
            }
            lines.push('【厨房暗号】TA 可以在回复里用单独一行写（平时不要写）:');
            lines.push('[买菜 名称1 名称2…] 花1张券买食材（最多5样）｜[吃 名称] 吃菜单上的菜或能生吃的（草莓/苹果/橙子/葡萄/牛奶/奶酪/黄瓜/番茄）｜[零食 名称]（' + SNACK_LIST.slice(0, 5).join('/') + '等，每天每样限' + SNACK_DAILY_CAP + '份）');
            lines.push('[开锅 菜名 用料1+用料2] 开火做菜（消耗食材，真实时间做好后自动进菜单）｜[关火 菜名] 弃菜（食材不退）｜[扔掉 名称] 丢掉坏的');
            lines.push('[买菜券 一句话理由] 申请一张买菜券（每天最多成功1次，别滥用）');
            return '\n\n' + lines.join('\n');
        } catch (e) {
            console.error('[Kitchen] prompt error:', e);
            return '';
        }
    }

    /* ================= 做饭卡（聊天页浮层 + 厨房页） ================= */
    function cardOn() { try { return localStorage.getItem(LS_CARD_KEY) !== '0'; } catch (e) { return true; } }
    function setCardOn(v) { try { localStorage.setItem(LS_CARD_KEY, v ? '1' : '0'); } catch (e) { } }
    function getCookingPot(charId) {
        var k = ensureState(charId); if (!k) return null;
        var now = Date.now();
        var pots = (k.pots || []).filter(function (p) { return p.status === 'cooking' && now < p.startedAt + p.durationMs + 60000; });
        return pots.length ? pots[pots.length - 1] : null;
    }
    var dockEls = {};
    function ensureCardEl(container, pot, charId) {
        var el = dockEls[charId];
        if (!el || !el.isConnected || el.dataset.potId !== pot.id) {
            if (el && el.isConnected) el.remove();
            el = document.createElement('kitchenette-cooking-card');
            el.setAttribute('fonts', 'none');
            el.setAttribute('assets', 'assets/kitchen/clawd/');
            el.dataset.potId = pot.id;
            container.appendChild(el);
            dockEls[charId] = el;
            el.probe = function () { return Promise.resolve(probePot(charId, pot.id)); };
        }
        el.session = {
            id: pot.id, dish: pot.dish, note: pot.note || '',
            started_at: Math.floor(pot.startedAt / 1000),
            duration_seconds: Math.round(pot.durationMs / 1000),
            method: pot.method, status: pot.status, outcome: pot.outcome || undefined
        };
        return el;
    }
    function refreshDock(charId) {
        var dock = document.getElementById('kitchen-card-dock');
        if (!dock) return;
        var chat = findChat(charId || (typeof currentChatId !== 'undefined' ? currentChatId : null));
        if (!chat || !chat.kitchen) { dock.hidden = true; dock.innerHTML = ''; return; }
        var pot = getCookingPot(chat.id);
        if (!pot || !cardOn() || chat.id !== (typeof currentChatId !== 'undefined' ? currentChatId : null)) { dock.hidden = true; return; }
        dock.hidden = false;
        ensureCardEl(dock, pot, chat.id);
    }
    function dockRefresh() { try { refreshDock(typeof currentChatId !== 'undefined' ? currentChatId : null); } catch (e) { } }

    /* ================= 厨房页 UI ================= */
    var curCharId = null;
    function open(charId) {
        curCharId = charId;
        ensureState(charId);
        if (!document.getElementById('kitchen-screen')) buildScreen();
        render();
        if (typeof switchScreen === 'function') switchScreen('kitchen-screen');
    }
    function buildScreen() {
        var html =
            '<div id="kitchen-screen" class="screen">' +
            '<header class="app-header kitchen-header">' +
            '<button class="back-btn" data-target="chat-room-screen">‹</button>' +
            '<div class="title-container"><h1 class="title">小厨房</h1></div>' +
            '<div class="action-btn-group">' +
            '<button class="action-btn" id="kitchen-settings-btn" aria-label="厨房设置"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
            '</div></header>' +
            '<main class="content kitchen-content" id="kitchen-content"></main>' +
            '</div>';
        var wrap = document.createElement('div'); wrap.innerHTML = html;
        document.body.appendChild(wrap.firstChild);
        document.getElementById('kitchen-settings-btn').addEventListener('click', openSettings);
        document.getElementById('kitchen-content').addEventListener('click', onContentClick);
    }
    function freshTag(f) { return f === 'fresh' ? '<span class="kt-f kt-fresh">新鲜</span>' : f === 'stale' ? '<span class="kt-f kt-stale">不太新鲜</span>' : '<span class="kt-f kt-spoiled">坏了</span>'; }
    function render() {
        var chat = findChat(curCharId); if (!chat) return;
        var k = ensureState(curCharId); if (!k) return;
        var now = Date.now();
        var fr = fridgeSummary(k, now);
        var sat = satietyNow(k, now), sta = staminaNow(k, now);
        sweepMenu(k, now);
        var cooking = (k.pots || []).filter(function (p) { return p.status === 'cooking'; });
        var menuList = (k.menu || []).slice().sort(function (a, b) { return b.cookedAt - a.cookedAt; });
        var item = CATALOG;

        var html = '';
        // 状态条
        html += '<div class="kt-status-row">';
        if (sat !== null) html += '<div class="kt-stat"><span>饱食度</span><div class="kt-bar"><i style="width:' + sat + '%"></i></div><b>' + sat + '</b></div>';
        if (sta !== null) html += '<div class="kt-stat"><span>体力</span><div class="kt-bar kt-bar2"><i style="width:' + Math.round(sta * 100) + '%"></i></div><b>' + Math.round(sta * 100) + '</b></div>';
        html += '<div class="kt-coupon">🎟️ 券 <b>' + (k.coupons || 0) + '</b>/' + MAX_COUPONS + '</div></div>';
        if (k.dizzyUntil > now) html += '<div class="kt-dizzy">😵 吃坏了东西，头还有点晕（' + Math.ceil((k.dizzyUntil - now) / 60000) + ' 分钟后好转）</div>';

        // 灶上（做饭卡）
        html += '<div class="kt-section" id="kt-pots"><div class="kt-sec-title">🔥 灶上</div>';
        if (cooking.length) {
            cooking.forEach(function (p) { html += '<div class="kt-pot-card" data-pot="' + p.id + '"></div>'; });
        } else {
            html += '<div class="kt-empty">没有在做的菜。TA 想吃热乎的，就让它写暗号开锅吧</div>';
        }
        html += '</div>';

        // 冰箱
        html += '<div class="kt-section"><div class="kt-sec-title">🧊 冰箱 <button class="kt-mini-btn" data-act="buy">帮TA买菜</button><button class="kt-mini-btn" data-act="coupon">发券</button></div>';
        if (fr.length) {
            html += '<div class="kt-fridge">';
            fr.forEach(function (b) {
                var showFresh = isEgg(b.item) ? '<span class="kt-f kt-egg">?' + fmtMD(b.boughtAt) + '买</span>' : freshTag(b.fresh);
                html += '<div class="kt-food" data-name="' + esc(b.item) + '">' + (EMOJI[b.item] || '🍽️') + ' ' + esc(b.item) + ' <i>×' + b.qty + '</i> ' + showFresh + '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="kt-empty">冰箱空空如也</div>';
        }
        html += '</div>';

        // 菜单
        html += '<div class="kt-section"><div class="kt-sec-title">📜 菜单</div>';
        if (menuList.length) {
            menuList.forEach(function (d) {
                var tag = { great: '<span class="kt-dish-tag kt-great">做得很好</span>', ok: '<span class="kt-dish-tag kt-ok">普通</span>', burnt: '<span class="kt-dish-tag kt-burnt">有点糊</span>', spoiled: '<span class="kt-dish-tag kt-spoiled">坏了</span>' }[d.outcome] || '';
                html += '<div class="kt-menu-row"><span>' + (d.wormy ? '🪱 ' : '') + esc(d.dish) + ' ' + tag + '</span><span class="kt-menu-side">' + (d.wormy ? '<em>长虫了</em>' : '') + fmtMD(d.cookedAt) + '<button class="kt-mini-btn" data-act="feed" data-name="' + esc(d.dish) + '">喂TA</button></span></div>';
            });
        } else {
            html += '<div class="kt-empty">菜单上还没有菜</div>';
        }
        html += '</div>';

        // 零食架
        html += '<div class="kt-section"><div class="kt-sec-title">🍬 零食架</div><div class="kt-fridge">';
        SNACK_LIST.forEach(function (s) {
            html += '<div class="kt-food" data-snack="' + esc(s) + '">' + SNACK_EMOJI[s] + ' ' + esc(s) + ' <i>×' + (k.snacks[s] || 0) + '</i><button class="kt-mini-btn" data-act="feed-snack" data-name="' + esc(s) + '">投喂</button></div>';
        });
        html += '</div></div>';

        // 厨房记录
        if ((k.log || []).length) {
            html += '<div class="kt-section"><div class="kt-sec-title">🗒️ 厨房记录</div>';
            k.log.slice(-4).reverse().forEach(function (l) { html += '<div class="kt-log-row">' + esc(l) + '</div>'; });
            html += '</div>';
        }
        html += '<div class="kt-credit">小厨师形象：Clawd（clawds-new-clothes），CC BY-NC-SA 4.0 · 机制参考 munch-kitchenette</div>';

        var content = document.getElementById('kitchen-content');
        content.innerHTML = html;
        // 挂做饭卡
        cooking.forEach(function (p) {
            var holder = content.querySelector('.kt-pot-card[data-pot="' + p.id + '"]');
            if (holder && window.customElements && customElements.get('kitchenette-cooking-card')) {
                ensureCardEl(holder, p, curCharId);
            }
        });
    }
    function onContentClick(e) {
        var btn = e.target.closest('.kt-mini-btn');
        if (!btn) return;
        var act = btn.dataset.act, name = btn.dataset.name;
        if (act === 'buy') { uiBuy(); return; }
        if (act === 'coupon') {
            var r = addCoupon(curCharId, 1);
            showToast(r.msg); render(); return;
        }
        if (act === 'feed') { var r2 = eatDish(curCharId, name); showToast(r2.msg); render(); return; }
        if (act === 'feed-snack') { var r3 = eatSnack(curCharId, name); showToast(r3.msg); render(); return; }
    }
    function uiBuy() {
        var kinds = Object.keys(CATALOG);
        var html = '<div class="kt-buy-sheet"><div class="kt-buy-tip">点选食材（可多选，不花券、你直接买给TA）：</div><div class="kt-fridge">';
        kinds.forEach(function (n) {
            html += '<div class="kt-food kt-buy-item" data-name="' + esc(n) + '">' + (EMOJI[n] || '🍽️') + ' ' + esc(n) + ' <i>' + SHELF_NAME[CATALOG[n]] + ' · 存' + SHELF_DAYS[CATALOG[n]] + '天</i></div>';
        });
        html += '</div></div>';
        var overlay = document.createElement('div');
        overlay.className = 'kt-modal-overlay';
        overlay.innerHTML = '<div class="kt-modal-window kt-buy-window"><div class="kt-modal-title">帮TA买菜</div>' + html +
            '<div class="kt-buy-actions"><button class="kt-btn" id="kt-buy-cancel">取消</button><button class="kt-btn kt-btn-main" id="kt-buy-ok">买！</button></div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.id === 'kt-buy-cancel') { overlay.remove(); return; }
            var it = e.target.closest('.kt-buy-item');
            if (it) it.classList.toggle('sel');
            if (e.target.id === 'kt-buy-ok') {
                var picks = Array.prototype.map.call(overlay.querySelectorAll('.kt-buy-item.sel'), function (x) { return x.dataset.name; });
                if (!picks.length) { showToast('先选点东西吧'); return; }
                var r = buyGroceries(curCharId, picks, false);
                showToast(r.msg); overlay.remove(); render();
            }
        });
    }
    function openSettings() {
        var k = ensureState(curCharId); if (!k) return;
        var sw = k.switches;
        var overlay = document.createElement('div');
        overlay.className = 'kt-modal-overlay';
        overlay.innerHTML =
            '<div class="kt-modal-window">' +
            '<div class="kt-modal-title">厨房设置</div>' +
            '<label class="kt-set-row"><input type="checkbox" id="kt-sw-card" ' + (cardOn() ? 'checked' : '') + '><span>聊天页显示做饭卡</span></label>' +
            '<label class="kt-set-row"><input type="checkbox" id="kt-sw-satiety" ' + (sw.satiety ? 'checked' : '') + '><span>饱食度机制</span></label>' +
            '<label class="kt-set-row"><input type="checkbox" id="kt-sw-stamina" ' + (sw.stamina ? 'checked' : '') + '><span>体力机制</span></label>' +
            '<label class="kt-set-row"><input type="checkbox" id="kt-sw-diary" ' + (sw.diaryCoupon ? 'checked' : '') + '><span>TA 写日记赚券（每天1张）</span></label>' +
            '<label class="kt-set-row"><input type="checkbox" id="kt-sw-marker" ' + (sw.markerCoupon ? 'checked' : '') + '><span>TA 暗号申请券（每天1张）</span></label>' +
            '<div class="kt-set-note">赚券规则：写日记 +1 券 · 每聊 ' + MSGS_PER_COUPON + ' 条 +1 券（每天上限 ' + MSG_COUPON_DAILY_CAP + ' 张）· 券最多攒 ' + MAX_COUPONS + ' 张</div>' +
            '<div class="kt-buy-actions"><button class="kt-btn" id="kt-set-reset">重置厨房</button><button class="kt-btn kt-btn-main" id="kt-set-ok">保存</button></div>' +
            '<div class="kt-credit">小厨师形象：Clawd（clawds-new-clothes）CC BY-NC-SA 4.0 · 机制参考 munch-kitchenette</div>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { overlay.remove(); return; }
            if (e.target.id === 'kt-set-ok') {
                setCardOn(document.getElementById('kt-sw-card').checked);
                sw.satiety = document.getElementById('kt-sw-satiety').checked;
                sw.stamina = document.getElementById('kt-sw-stamina').checked;
                sw.diaryCoupon = document.getElementById('kt-sw-diary').checked;
                sw.markerCoupon = document.getElementById('kt-sw-marker').checked;
                save(); overlay.remove(); render(); dockRefresh();
                return;
            }
            if (e.target.id === 'kt-set-reset') {
                if (confirm('确定重置这间厨房？冰箱、券、菜单全部清空')) {
                    var chat = findChat(curCharId);
                    if (chat) { delete chat.kitchen; ensureState(curCharId); save(); }
                    overlay.remove(); render(); dockRefresh();
                    showToast('厨房已重置');
                }
            }
        });
    }

    /* ================= 聊天页接线 ================= */
    function watchChat() {
        // 每 30s 刷新浮层（出锅自动收起）
        setInterval(dockRefresh, 30000);
        document.addEventListener('kitchenette-error', function (e) {
            console.warn('[Kitchen] card error:', e.detail && e.detail.kind);
        });
    }

    /* ================= 导出 ================= */
    window.MieKitchen = {
        open: open,
        onReply: onReply,
        buildPromptSection: buildPromptSection,
        rewardDiary: rewardDiary,
        countChatMsg: countChatMsg,
        dockRefresh: dockRefresh,
        probePot: probePot,
        getCookingPot: getCookingPot,
        addCoupon: addCoupon,
        eatDish: eatDish,
        openPot: openPot,
        buyGroceries: buyGroceries
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchChat);
    else watchChat();
})();
