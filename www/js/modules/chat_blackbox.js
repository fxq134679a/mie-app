/* 情绪黑箱（js/modules/chat_blackbox.js）
   把 js/lib/mie_emotion_blackbox.js 那套纯函数接到 mie 的角色上：角色在回复末尾写
   <blackbox slot="燥火" delta="+12" event="…"/>，这里摘掉标签、记进账本，下一轮把状态栏注回提示词。

   账本流水挂在角色对象的 chat.blackbox 上，跟着 saveData() 一起存（和 chat.memoryJournals 一个路子），
   不建数据库表。只在私聊日常记账，群聊和通话不记。
   查看页没做，所以 grant 标签一律不当真：数值只从语气里漏出来。 */
(function () {
    'use strict';

    const HOUR = 3600000;
    const LOOKBACK_DAYS = 60;   // 算数值时往回看多久，和上游 demo 一致
    const RETAIN_DAYS = 90;     // 流水最多留多久
    const RETAIN_MAX = 800;
    let seq = 0;                // 每条回复一个 turn，下降阻尼按 turn 记账

    const lib = () => window.MieEmotionBlackbox;

    // 称呼用玩家在这个角色上填的「我的名字」，没填就用上游默认的「她」
    function configFor(chat) {
        const user = String((chat && chat.myName) || '').trim() || '她';
        return lib().createConfig({ names: { user } });
    }

    function store(chat) {
        if (!chat.blackbox || typeof chat.blackbox !== 'object') chat.blackbox = {};
        const bb = chat.blackbox;
        if (!Array.isArray(bb.events)) bb.events = [];
        if (!Array.isArray(bb.lastErrors)) bb.lastErrors = [];
        if (typeof bb.levels !== 'string') bb.levels = '';
        return bb;
    }

    function enabled(chat) {
        return !!chat && chat.blackboxEnabled !== false;
    }

    function prune(bb) {
        const cutoff = Date.now() - RETAIN_DAYS * 24 * HOUR;
        if (bb.events.some(e => Date.parse(e.at) < cutoff)) {
            bb.events = bb.events.filter(e => Date.parse(e.at) >= cutoff);
        }
        if (bb.events.length > RETAIN_MAX) bb.events = bb.events.slice(-RETAIN_MAX);
    }

    /* 回复落进聊天记录之前调用：摘掉标签，顺手记账。
       即使这个角色的开关关着也照摘——不然原始标签会留在气泡、朗读和历史里。 */
    function onReply(text, chat, chatType) {
        if (!lib() || !text || typeof text !== 'string') return text;
        const parsed = lib().parseTags(text, configFor(chat));
        if (!parsed.items.length) return text;
        if (chatType === 'private' && enabled(chat)) {
            const bb = store(chat);
            const grantless = parsed.items.filter(it => it.kind !== 'grant');
            const made = lib().toEvents(grantless, { turn: 'r' + Date.now() + '-' + (++seq) });
            if (made.events.length) bb.events.push.apply(bb.events, made.events);
            bb.lastErrors = made.errors;
            prune(bb);
        }
        return parsed.content;
    }

    function stateFor(chat) {
        const config = configFor(chat);
        const since = Date.now() - LOOKBACK_DAYS * 24 * HOUR;
        return lib().computeState(store(chat).events.filter(e => Date.parse(e.at) >= since), config, { now: new Date() });
    }

    const NO_PAGE = '她没有可以翻看这本账的页面，不要写 grant 标签，也不要答应把数值念给她听。';

    /* 拼进 system prompt：黑箱说明（不变）+ 这一轮的状态栏（每轮变）。
       关了开关返回空串，一个字都不注。 */
    function buildPromptSection(chatType, chat) {
        if (!lib() || chatType !== 'private' || !chat || !enabled(chat)) return '';
        const config = configFor(chat);
        const bb = store(chat);
        const context = lib().buildContext(stateFor(chat), config, { levels: bb.levels, lastErrors: bb.lastErrors });
        return '\n\n' + lib().buildRule(config) + NO_PAGE + '\n' + context + '\n';
    }

    // 重新生成会把那之后的回复全部丢掉，它们记的几笔也跟着作废
    function dropAfter(chat, ts) {
        if (!chat || !chat.blackbox || !ts) return;
        const cut = Number(ts);
        chat.blackbox.events = (chat.blackbox.events || []).filter(e => Date.parse(e.at) <= cut);
    }

    // 只清账，不清 TA 给自己写的反应档位
    function clear(chat) {
        if (!chat) return;
        const levels = chat.blackbox ? chat.blackbox.levels : '';
        chat.blackbox = { events: [], lastErrors: [], levels: levels || '' };
    }

    // 专属页里的「清掉这本账」：设置面板是静态注入的，用委托监听，不碰 settings_chat.js
    document.addEventListener('click', function (e) {
        const btn = e.target && e.target.closest ? e.target.closest('#setting-blackbox-clear') : null;
        if (!btn) return;
        e.preventDefault();
        const chat = (typeof currentChatType !== 'undefined' && currentChatType === 'group')
            ? null
            : (typeof db !== 'undefined' && db && typeof currentChatId !== 'undefined')
                ? (db.characters || []).find(c => c.id === currentChatId)
                : null;
        if (!chat) return;
        clear(chat);
        if (typeof saveData === 'function') saveData();
        if (typeof showToast === 'function') showToast('已经把这本账清空');
    });

    window.ChatBlackbox = {
        enabled: enabled,
        onReply: onReply,
        stateFor: stateFor,
        buildPromptSection: buildPromptSection,
        dropAfter: dropAfter,
        clear: clear,
        configFor: configFor
    };
})();
