/* =========================================================
 * MieLoading · 全局生成等待动画接管器
 *
 * - 美化 App 里可给「全局」和「每个生成等待过程」分别选动画
 * - 内置：默认 / 仓鼠跑轮 / 铅笔画圈 / 拍桌手 / ZZZ / 散步鸟 / 颠勺煎锅 / 蝴蝶 /
 *         蹦跳小球 / 心形描线 / 洗衣机
 * - 通过 MutationObserver 自动接管各 APP 动态插入的等待节点，
 *   不需要逐个改业务模块；角色聊天「正在输入」等待被明确排除
 * ========================================================= */
(function () {
    'use strict';

    var CFG_KEY = 'mie_loading_anim_v1';
    var BUILTIN = [
        { id: 'default', label: '默认' },
        { id: 'hamster', label: '仓鼠跑轮' },
        { id: 'pencil', label: '铅笔画圈' },
        { id: 'fish', label: '拍桌手' },
        { id: 'zzz', label: 'ZZZ' },
        { id: 'quail', label: '散步鸟' },
        { id: 'rat', label: '颠勺煎锅' },
        { id: 'butterfly', label: '蝴蝶' },
        { id: 'turtle', label: '蹦跳小球' },
        { id: 'heart', label: '心形描线' },
        { id: 'washer', label: '洗衣机' }
    ];

    /* 大尺寸动画的最小显示尺寸（小于该值会糊成一团） */
    var MIN_SIZE = { hamster: 120, fish: 80, zzz: 80, quail: 120, rat: 80, butterfly: 60, turtle: 100, heart: 120, washer: 100 };

    /* 角色聊天等待（用户明确排除）与设置页自身，兜底扫描时一律跳过 */
    var EXCLUDE = '#chat-room-screen, .typing-indicator, .message-wrapper, .message-bubble, ' +
        '#customize-screen, #mie-ld-modal, textarea, input, script, style, .mie-ld';

    /* ---------------------------------------------------------
     * 场景表：每一条 = 美化 App 里可单独设置的一个生成等待过程
     * selectors —— 精确等待容器；text —— 文本兜底（无 class 的提示节点）
     * --------------------------------------------------------- */
    var SCENES = [
        { id: 'airdrop', label: '隔空投送', size: 78, block: true,
            selectors: ['#airdrop-loading'], hide: ['#airdrop-loading-icon'] },
        { id: 'journal', label: '日记', size: 72, block: true,
            selectors: ['.journal-card.generating'], hide: ['.spinner'] },
        { id: 'reader', label: '阅读器', size: 62, block: true,
            selectors: ['.cove-ai-loading'], hide: ['.cove-spinner'] },
        { id: 'shop', label: '商城', size: 58, block: true,
            selectors: ['.shop-loading-skeleton'], hide: ['[class*="skeleton-"]'] },
        { id: 'worldbook', label: '世界书', size: 56, block: true,
            selectors: ['.wb-loading'], hide: ['svg'] },
        { id: 'xhs', label: '小红书', size: 38,
            selectors: ['#xhs-busy-indicator'], hide: ['.cp-spin'],
            text: { scopes: ['#xiaohongshu-screen', '#xhs-screen', '.xhs-screen'], pattern: /正在生成|生成中|加载中/ } },
        { id: 'ins', label: 'Instagram', size: 34,
            text: { scopes: ['#instagram-screen'], pattern: /生成中|正在回复|正在生成/ } },
        { id: 'x', label: '推特', size: 34,
            text: { scopes: ['#x-social-screen', '.x-social-screen'], pattern: /生成中|正在生成|加载中/ } },
        { id: 'moments', label: '朋友圈', size: 36,
            text: { scopes: ['#moments-screen', '.moments-screen'], pattern: /生成中|正在生成|加载中/ } },
        { id: 'peek', label: '偷看手机', size: 40,
            selectors: ['p.placeholder-text', '.toast.visible .toast-content'],
            matchText: /正在生成|批量生成/ },
        { id: 'jili', label: '视频号', size: 38,
            selectors: ['.jlb-loading', '.jl-empty', '.jl-refresh-txt', '.jl-refresh'],
            matchText: /正在加载|加载中|正在生成|AI 正在生成/, hide: ['.jl-spin'] },
        { id: 'workshop', label: '图像工坊', size: 30,
            text: { scopes: ['#image-workshop-screen', '.image-workshop-screen'], pattern: /生成中|正在生成/ } },
        { id: 'voice', label: '语音', size: 32,
            selectors: ['#sfx-body'], matchText: /加载中|生成中/ },
        { id: 'calendar', label: '日历', size: 26,
            selectors: ['[data-loading="true"]'] },
        { id: 'forum', label: '论坛与评论', size: 32,
            text: { scopes: ['#forum-screen', '.forum-screen'], pattern: /生成中|正在生成|加载中/ } },
        { id: 'other', label: '其他应用', size: 34, generic: true,
            text: { scopes: ['body'], pattern: /正在生成|生成中|加载中|思考中|正在批量生成/ } }
    ];

    var state = { global: 'default', scenes: {} };
    var hiddenMap = new WeakMap();
    var prevHosts = {};
    var pencilUid = 0;

    /* ------------------------- 配置读写 ------------------------- */
    function readCfg() {
        try {
            var raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {};
            state.global = validAnim(raw.global) ? raw.global : 'default';
            state.scenes = (raw.scenes && typeof raw.scenes === 'object') ? raw.scenes : {};
        } catch (e) { /* 配置损坏则用默认值 */ }
        return state;
    }

    function validAnim(id) {
        return BUILTIN.some(function (a) { return a.id === id; });
    }

    function writeCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({
                global: state.global, scenes: state.scenes
            }));
            return true;
        } catch (e) {
            if (typeof showToast === 'function') showToast('保存失败，代码可能过长');
            return false;
        }
    }

    function options() {
        return BUILTIN.slice();
    }

    function resolve(sceneId) {
        var v = state.scenes[sceneId];
        return (v && v !== 'follow' && validAnim(v)) ? v : state.global;
    }

    /* ------------------------- 动画 DOM ------------------------- */
    function hamsterMarkup() {
        return '<span class="mie-ld-hamster">' +
            '<span class="mie-ld-wheel"></span><span class="mie-ld-spoke"></span>' +
            '<span class="mie-ld-hrunner">' +
            '<span class="mie-ld-hbody">' +
            '<span class="mie-ld-hhead"><span class="mie-ld-hear"></span>' +
            '<span class="mie-ld-heye"></span><span class="mie-ld-hnose"></span></span>' +
            '<span class="mie-ld-hlimb-fr"></span><span class="mie-ld-hlimb-fl"></span>' +
            '<span class="mie-ld-hlimb-br"></span><span class="mie-ld-hlimb-bl"></span>' +
            '<span class="mie-ld-htail"></span>' +
            '</span></span></span>';
    }

    function pencilMarkup() {
        var uid = ++pencilUid;
        var cid = 'mie-ld-eraser-' + uid;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="mie-ld-pencil" width="100%" height="100%">' +
            '<defs><clipPath id="' + cid + '"><rect height="30" width="30" ry="5" rx="5"></rect></clipPath></defs>' +
            '<circle transform="rotate(-113,100,100)" stroke-linecap="round" stroke-dashoffset="439.82" ' +
            'stroke-dasharray="439.82 439.82" stroke-width="2" stroke="currentColor" fill="none" r="70" class="mie-ld-pstroke"></circle>' +
            '<g transform="translate(100,100)" class="mie-ld-protate"><g fill="none">' +
            '<circle transform="rotate(-90)" stroke-dashoffset="402" stroke-dasharray="402.12 402.12" stroke-width="30" stroke="hsl(223,90%,50%)" r="64" class="mie-ld-pb1"></circle>' +
            '<circle transform="rotate(-90)" stroke-dashoffset="465" stroke-dasharray="464.96 464.96" stroke-width="10" stroke="hsl(223,90%,60%)" r="74" class="mie-ld-pb2"></circle>' +
            '<circle transform="rotate(-90)" stroke-dashoffset="339" stroke-dasharray="339.29 339.29" stroke-width="10" stroke="hsl(223,90%,40%)" r="54" class="mie-ld-pb3"></circle>' +
            '</g>' +
            '<g transform="rotate(-90) translate(49,0)" class="mie-ld-peraser"><g class="mie-ld-peraser-skew">' +
            '<rect height="30" width="30" ry="5" rx="5" fill="hsl(223,90%,70%)"></rect>' +
            '<rect clip-path="url(#' + cid + ')" height="30" width="5" fill="hsl(223,90%,60%)"></rect>' +
            '<rect height="20" width="30" fill="hsl(223,10%,90%)"></rect>' +
            '<rect height="20" width="15" fill="hsl(223,10%,70%)"></rect>' +
            '<rect height="20" width="5" fill="hsl(223,10%,80%)"></rect>' +
            '<rect height="2" width="30" y="6" fill="hsla(223,10%,10%,0.2)"></rect>' +
            '<rect height="2" width="30" y="13" fill="hsla(223,10%,10%,0.2)"></rect>' +
            '</g></g>' +
            '<g transform="rotate(-90) translate(49,-30)" class="mie-ld-ppoint">' +
            '<polygon points="15 0,30 30,0 30" fill="hsl(33,90%,70%)"></polygon>' +
            '<polygon points="15 0,6 30,0 30" fill="hsl(33,90%,50%)"></polygon>' +
            '<polygon points="15 0,20 10,10 10" fill="hsl(223,10%,10%)"></polygon>' +
            '</g></g></svg>';
    }

    /* 拍桌手 (Uiverse · Pradeepsaranbishnoi tall-fish-38 原版还原)
       原版类名为 emoji（.🤚/.👉/.🌴/.👍），这里改成 ASCII 类名，数值不变 */
    function fishMarkup() {
        return '<span class="mie-ld-fish">' +
            '<span class="mie-ld-finger"></span>' +
            '<span class="mie-ld-finger"></span>' +
            '<span class="mie-ld-finger"></span>' +
            '<span class="mie-ld-finger"></span>' +
            '<span class="mie-ld-palm"></span>' +
            '<span class="mie-ld-thumb"></span>' +
            '</span>';
    }

    /* ZZZ (Uiverse · necatimertmetin quiet-bulldog-16 原版还原)
       原版为 4 个裸 .z 元素，这里补一个定位容器，其余数值不变 */
    function zzzMarkup() {
        return '<span class="mie-ld-zzz">' +
            '<span class="mie-ld-z mie-ld-z1">Z</span>' +
            '<span class="mie-ld-z mie-ld-z2">Z</span>' +
            '<span class="mie-ld-z mie-ld-z3">Z</span>' +
            '<span class="mie-ld-z mie-ld-z4">Z</span>' +
            '</span>';
    }

    /* 散步鸟 (Uiverse · AatreyuShau lazy-quail-10 原版还原)
       原版 #gnd 是 id，多实例会重复，改为 mie-ld-qgnd 类 */
    function quailMarkup() {
        return '<span class="mie-ld-quail">' +
            '<svg class="mie-ld-qlegl" version="1.1" xmlns="http://www.w3.org/2000/svg" width="20.69332" height="68.19944" viewBox="0,0,20.69332,68.19944">' +
            '<g transform="translate(-201.44063,-235.75466)"><g stroke-miterlimit="10">' +
            '<path d="" fill="#ffffff" stroke="none" stroke-width="0.5"></path>' +
            '<path d="" fill-opacity="0.26667" fill="#97affd" stroke-opacity="0.48627" stroke="#ffffff" stroke-width="0"></path>' +
            '<path d="M218.11971,301.20087c-2.20708,1.73229 -4.41416,0 -4.41416,0l-1.43017,-1.1437c-1.42954,-1.40829 -3.04351,-2.54728 -4.56954,-3.87927c-0.95183,-0.8308 -2.29837,-1.49883 -2.7652,-2.55433c-0.42378,-0.95815 0.14432,-2.02654 0.29355,-3.03399c0.41251,-2.78499 1.82164,-5.43386 2.41472,-8.22683c1.25895,-4.44509 2.73863,-8.98683 3.15318,-13.54796c0.22615,-2.4883 -0.21672,-5.0155 -0.00278,-7.50605c0.30636,-3.56649 1.24602,-7.10406 1.59992,-10.6738c0.29105,-2.93579 -0.00785,-5.9806 -0.00785,-8.93046c0,0 0,-2.44982 3.12129,-2.44982c3.12129,0 3.12129,2.44982 3.12129,2.44982c0,3.06839 0.28868,6.22201 -0.00786,9.27779c-0.34637,3.56935 -1.30115,7.10906 -1.59992,10.6738c-0.2103,2.50918 0.22586,5.05326 -0.00278,7.56284c-0.43159,4.7371 -1.94029,9.46317 -3.24651,14.07835c-0.47439,2.23403 -1.29927,4.31705 -2.05805,6.47156c-0.18628,0.52896 -0.1402,1.0974 -0.327,1.62624c-0.09463,0.26791 -0.64731,0.47816 -0.50641,0.73323c0.19122,0.34617 0.86423,0.3445 1.2346,0.58502c1.88637,1.22503 3.50777,2.79494 5.03,4.28305l0.96971,0.73991c0,0 2.20708,1.73229 0,3.46457z" fill="none" stroke="#191e2e" stroke-width="7"></path>' +
            '</g></g></svg>' +
            '<svg class="mie-ld-qlegr" version="1.1" xmlns="http://www.w3.org/2000/svg" width="41.02537" height="64.85502" viewBox="0,0,41.02537,64.85502">' +
            '<g transform="translate(-241.54137,-218.44347)"><g stroke-miterlimit="10">' +
            '<path d="M279.06674,279.42662c-2.27967,1.98991 -6.08116,0.58804 -6.08116,0.58804l-2.47264,-0.92915c-2.58799,-1.18826 -5.31176,-2.08831 -7.99917,-3.18902c-1.67622,-0.68654 -3.82471,-1.16116 -4.93147,-2.13229c-1.00468,-0.88156 -0.69132,-2.00318 -0.92827,-3.00935c-0.65501,-2.78142 0.12275,-5.56236 -0.287,-8.37565c-0.2181,-4.51941 -0.17458,-9.16283 -1.60696,-13.68334c-0.78143,-2.46614 -2.50162,-4.88125 -3.30086,-7.34796c-1.14452,-3.53236 -1.40387,-7.12078 -2.48433,-10.66266c-0.88858,-2.91287 -2.63779,-5.85389 -3.93351,-8.74177c0,0 -1.07608,-2.39835 3.22395,-2.81415c4.30003,-0.41581 2.41605,1.98254 2.41605,1.98254c1.34779,3.00392 3.13072,6.05282 4.06444,9.0839c1.09065,3.54049 1.33011,7.13302 2.48433,10.66266c0.81245,2.48448 2.5308,4.917 3.31813,7.40431c1.48619,4.69506 1.48366,9.52281 1.71137,14.21503c0.32776,2.25028 0.10631,4.39942 0.00736,6.60975c-0.02429,0.54266 0.28888,1.09302 0.26382,1.63563c-0.01269,0.27488 -0.68173,0.55435 -0.37558,0.78529c0.41549,0.31342 1.34191,0.22213 1.95781,0.40826c3.13684,0.94799 6.06014,2.26892 8.81088,3.52298l1.66093,0.59519c0,0 6.76155,1.40187 4.48187,3.39177z" fill="none" stroke="#000000" stroke-width="7"></path>' +
            '<path d="" fill="#ffffff" stroke="none" stroke-width="0.5"></path>' +
            '<path d="" fill-opacity="0.26667" fill="#97affd" stroke-opacity="0.48627" stroke="#ffffff" stroke-width="0"></path>' +
            '</g></g></svg>' +
            '<span class="mie-ld-qbod">' +
            '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="144.10576" height="144.91623" viewBox="0,0,144.10576,144.91623">' +
            '<g transform="translate(-164.41679,-112.94712)"><g stroke-miterlimit="10">' +
            '<path d="M166.9168,184.02633c0,-36.49454 35.0206,-66.07921 72.05288,-66.07921c37.03228,0 67.05288,29.58467 67.05288,66.07921c0,6.94489 -1.08716,13.63956 -3.10292,19.92772c-2.71464,8.46831 -7.1134,16.19939 -12.809,22.81158c-2.31017,2.68194 -7.54471,12.91599 -7.54471,12.91599c0,0 -5.46714,-1.18309 -8.44434,0.6266c-3.86867,2.35159 -10.95356,10.86714 -10.95356,10.86714c0,0 -6.96906,-3.20396 -9.87477,-2.58085c-2.64748,0.56773 -6.72538,5.77072 -6.72538,5.77072c0,0 -5.5023,-4.25969 -7.5982,-4.25969c-3.08622,0 -9.09924,3.48259 -9.09924,3.48259c0,0 -6.0782,-5.11244 -9.00348,-5.91884c-4.26461,-1.17561 -12.23343,0.75049 -12.23343,0.75049c0,0 -5.18164,-8.26065 -7.60688,-9.90388c-3.50443,-2.37445 -8.8271,-3.95414 -8.8271,-3.95414c0,0 -5.33472,-8.81718 -7.27019,-11.40895c-4.81099,-6.44239 -13.46422,-9.83437 -15.65729,-17.76175c-1.53558,-5.55073 -2.35527,-21.36472 -2.35527,-21.36472z" fill="#191e2e" stroke="#000000" stroke-width="5" stroke-linecap="butt"></path>' +
            '<path d="M167.94713,180c0,-37.03228 35.0206,-67.05288 72.05288,-67.05288c37.03228,0 67.05288,30.0206 67.05288,67.05288c0,7.04722 -1.08716,13.84053 -3.10292,20.22135c-2.71464,8.59309 -7.1134,16.43809 -12.809,23.14771c-2.31017,2.72146 -7.54471,13.1063 -7.54471,13.1063c0,0 -5.46714,-1.20052 -8.44434,0.63584c-3.86867,2.38624 -10.95356,11.02726 -10.95356,11.02726c0,0 -6.96906,-3.25117 -9.87477,-2.61888c-2.64748,0.5761 -6.72538,5.85575 -6.72538,5.85575c0,0 -5.5023,-4.32246 -7.5982,-4.32246c-3.08622,0 -9.09924,3.5339 -9.09924,3.5339c0,0 -6.0782,-5.18777 -9.00348,-6.00605c-4.26461,-1.19293 -12.23343,0.76155 -12.23343,0.76155c0,0 -5.18164,-8.38236 -7.60688,-10.04981c-3.50443,-2.40943 -8.8271,-4.0124 -8.8271,-4.0124c0,0 -5.33472,-8.9471 -7.27019,-11.57706c-4.81099,-6.53732 -13.46422,-9.97928 -15.65729,-18.02347c-1.53558,-5.63252 -2.35527,-21.67953 -2.35527,-21.67953z" fill="#191e2e" stroke="none" stroke-width="0" stroke-linecap="butt"></path>' +
            '<path d="" fill="#ffffff" stroke="none" stroke-width="0.5" stroke-linecap="butt"></path>' +
            '<path d="" fill-opacity="0.26667" fill="#97affd" stroke-opacity="0.48627" stroke="#ffffff" stroke-width="0" stroke-linecap="butt"></path>' +
            '<path d="M216.22445,188.06994c0,0 1.02834,11.73245 -3.62335,21.11235c-4.65169,9.3799 -13.06183,10.03776 -13.06183,10.03776c0,0 7.0703,-3.03121 10.89231,-10.7381c4.34839,-8.76831 5.79288,-20.41201 5.79288,-20.41201z" fill="none" stroke="#2f3a50" stroke-width="3" stroke-linecap="round"></path>' +
            '</g></g></svg>' +
            '<svg class="mie-ld-qhead" version="1.1" xmlns="http://www.w3.org/2000/svg" width="115.68559" height="88.29441" viewBox="0,0,115.68559,88.29441">' +
            '<g transform="translate(-191.87889,-75.62023)"><g stroke-miterlimit="10">' +
            '<path d="" fill="#ffffff" stroke="none" stroke-width="0.5" stroke-linecap="butt"></path>' +
            '<path d="M195.12889,128.77752c0,-26.96048 21.33334,-48.81626 47.64934,-48.81626c26.316,0 47.64935,21.85578 47.64935,48.81626c0,0.60102 -9.22352,20.49284 -9.22352,20.49284l-7.75885,0.35623l-7.59417,6.15039l-8.64295,-1.74822l-11.70703,6.06119l-6.38599,-4.79382l-6.45999,2.36133l-7.01451,-7.38888l-8.11916,1.29382l-6.19237,-6.07265l-7.6263,-1.37795l-4.19835,-7.87062l-4.24236,-4.16907c0,0 -0.13314,-2.0999 -0.13314,-3.29458z" fill="none" stroke="#2f3a50" stroke-width="6" stroke-linecap="butt"></path>' +
            '<path d="M195.31785,124.43649c0,-26.96048 21.33334,-48.81626 47.64934,-48.81626c26.316,0 47.64935,21.85578 47.64935,48.81626c0,1.03481 -0.08666,2.8866 -0.08666,2.8866c0,0 16.8538,15.99287 16.21847,17.23929c-0.66726,1.30905 -23.05667,-4.14265 -23.05667,-4.14265l-2.29866,4.5096l-7.75885,0.35623l-7.59417,6.15039l-8.64295,-1.74822l-11.70703,6.06119l-6.38599,-4.79382l-6.45999,2.36133l-7.01451,-7.38888l-8.11916,1.29382l-6.19237,-6.07265l-7.6263,-1.37795l-4.19835,-7.87062l-4.24236,-4.16907c0,0 -0.13314,-2.0999 -0.13314,-3.29458z" fill="#191e2e" stroke-opacity="0.48627" stroke="#ffffff" stroke-width="0" stroke-linecap="butt"></path>' +
            '<path d="M271.10348,122.46768l10.06374,-3.28166l24.06547,24.28424" fill="none" stroke="#2f3a50" stroke-width="6" stroke-linecap="round"></path>' +
            '<path d="M306.56448,144.85764l-41.62024,-8.16845l2.44004,-7.87698" fill="none" stroke="#000000" stroke-width="3.5" stroke-linecap="round"></path>' +
            '<path d="M276.02738,115.72434c-0.66448,-4.64715 2.56411,-8.95308 7.21127,-9.61756c4.64715,-0.66448 8.95309,2.56411 9.61757,7.21126c0.46467,3.24972 -1.94776,8.02206 -5.96624,9.09336c-2.11289,-1.73012 -5.08673,-5.03426 -5.08673,-5.03426c0,0 -4.12095,1.16329 -4.60481,1.54229c-0.16433,-0.04891 -0.62732,-0.38126 -0.72803,-0.61269c-0.30602,-0.70328 -0.36302,-2.02286 -0.44303,-2.58239z" fill="#ffffff" stroke="none" stroke-width="0.5" stroke-linecap="butt"></path>' +
            '<path d="M242.49281,125.6424c0,-4.69442 3.80558,-8.5 8.5,-8.5c4.69442,0 8.5,3.80558 8.5,8.5c0,4.69442 -3.80558,8.5 -8.5,8.5c-4.69442,0 -8.5,-3.80558 -8.5,-8.5z" fill="#ffffff" stroke="none" stroke-width="0.5" stroke-linecap="butt"></path>' +
            '<path d="" fill-opacity="0.26667" fill="#97affd" stroke-opacity="0.48627" stroke="#ffffff" stroke-width="0" stroke-linecap="butt"></path>' +
            '</g></g></svg>' +
            '</span>' +
            '<svg class="mie-ld-qgnd" version="1.1" xmlns="http://www.w3.org/2000/svg" width="475" height="530" viewBox="0,0,163.40011,85.20095">' +
            '<g transform="translate(-176.25,-207.64957)"><g stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10">' +
            '<path d="M295.5,273.1829c0,0 -57.38915,6.69521 -76.94095,-9.01465c-13.65063,-10.50609 15.70098,-20.69467 -2.5451,-19.94465c-30.31027,2.05753 -38.51396,-26.84135 -38.51396,-26.84135c0,0 6.50084,13.30023 18.93224,19.17888c9.53286,4.50796 26.23632,-1.02541 32.09529,4.95137c3.62417,3.69704 2.8012,6.33005 0.66517,8.49452c-3.79415,3.84467 -11.7312,6.21103 -6.24682,10.43645c22.01082,16.95812 72.55412,12.73944 72.55412,12.73944z" fill="#000000"></path>' +
            '<path d="M338.92138,217.76285c0,0 -17.49626,12.55408 -45.36424,10.00353c-8.39872,-0.76867 -17.29557,-6.23066 -17.29557,-6.23066c0,0 3.06461,-2.23972 15.41857,0.72484c26.30467,6.31228 47.24124,-4.49771 47.24124,-4.49771z" fill="#000000"></path>' +
            '<path d="M209.14443,223.00182l1.34223,15.4356l-10.0667,-15.4356" fill="none"></path>' +
            '<path d="M198.20391,230.41806l12.95386,7.34824l6.71113,-12.08004" fill="none"></path>' +
            '<path d="M211.19621,238.53825l8.5262,-6.09014" fill="none"></path>' +
            '<path d="M317.57068,215.80173l5.27812,6.49615l0.40601,-13.39831" fill="none"></path>' +
            '<path d="M323.66082,222.70389l6.09014,-9.33822" fill="none"></path>' +
            '</g></g></svg>' +
            '</span>';
    }

    /* 颠勺煎锅 (Uiverse · vinodjangid07 polite-rat-20 原版还原) */
    function ratMarkup() {
        return '<span class="mie-ld-rat">' +
            '<span class="mie-ld-ratwrap">' +
            '<span class="mie-ld-ratpan">' +
            '<span class="mie-ld-ratfood"></span>' +
            '<span class="mie-ld-ratbase"></span>' +
            '<span class="mie-ld-rathandle"></span>' +
            '</span>' +
            '<span class="mie-ld-ratshadow"></span>' +
            '</span>' +
            '</span>';
    }

    /* 蝴蝶 (Uiverse · carlosepcc/tender-dog-11 原版还原，SVG 路径逐字未动) */
    function butterflyMarkup() {
        return '<span class="mie-ld-butterfly">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="193" height="369" x="0" y="0" version="1.1" viewBox="0 0 18.528 35.424">' +
            '<path fill="#000" d="M3.358 35.05c.435-.175.646-.408.861-.95.374-.94.698-1.52 1.145-2.05.78-.92 1.757-1.638 2.666-1.957.603-.212.9-.204 1.505.041.843.343 1.597.25 2.062-.254.95-1.029 3.95-6.873 5.841-11.376.869-2.07.831-1.882.797-3.962-.034-2.106-.024-2.064-.927-3.887-1.639-3.31-4.426-6.582-7.147-8.392C8.71 1.298 6.715.504 5.296.328c-.718-.09-2.465-.001-3.183.16C.943.752.279 1.268.279 1.917c0 .119.437 1.136.97 2.26.533 1.126 1.044 2.291 1.135 2.591.334 1.106.776 3.567.945 5.27.065.652.357 1.286.751 1.633.419.367 1.351.786 1.964.883.286.044.534.096.553.115.018.018-.129.128-.327.244-.761.446-1.432 1.439-1.74 2.574-.216.802-.194 2.914.045 4.121.24 1.212.575 2.318 1.031 3.403.46 1.092.535 1.458.439 2.135-.223 1.575-1.958 4.03-3.489 4.937-.693.41-.885.587-1.066.98-.173.375-.185.535-.069.953.223.802 1.206 1.326 1.937 1.033z"></path>' +
            '</svg>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="150" x="0" y="0" version="1.1" viewBox="0 0 2.4 14.4">' +
            '<path fill="#000" d="M2.2 13c0 .641-.447 1.16-1 1.16-.553 0-1-.519-1-1.16V1.4C.2.759.647.24 1.2.24c.553 0 1 .519 1 1.16z"></path>' +
            '</svg>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="193" height="369" x="0" y="0" version="1.1" viewBox="0 0 18.528 35.424">' +
            '<path fill="#000" d="M15.105 35.155c-.42-.196-.627-.482-.902-1.253-.544-1.517-2.145-3.126-3.636-3.652-.69-.243-.887-.242-1.486.01-.617.26-1.342.278-1.798.045-.555-.283-1.76-2.262-3.476-5.708C2.628 22.232.984 18.575.455 17.144c-.236-.637-.237-.655-.237-2.485 0-2.164.01-2.209.9-4.013 1.011-2.049 2.53-4.189 4.185-5.9C7.679 2.293 9.783.995 12.49.313c.782-.197 1.554-.236 2.695-.137 1.619.14 2.38.38 2.882.909.21.22.246.321.243.684-.002.373-.122.67-.959 2.395-1.277 2.63-1.59 3.806-2.035 7.63-.111.951-.316 1.426-.809 1.87-.52.47-1.306.807-2.165.928l-.391.054.35.224c.897.574 1.58 1.674 1.834 2.956.193.969.12 2.791-.164 4.15-.222 1.061-.696 2.518-1.12 3.443-.336.735-.411 1.584-.203 2.3.505 1.738 2.056 3.692 3.736 4.705.693.417.938.83.874 1.476-.104 1.071-1.193 1.706-2.153 1.256z"></path>' +
            '</svg>' +
            '</span>';
    }

    /* 蹦跳小球 (Uiverse · mobinkakei grumpy-turtle-41 原版还原)
       三个小球依次弹跳 + 地面投影；shadow 的 nth-child(4)(5) 位置看似
       与 circle 错位，实际按 animation-delay 与第 2/3 颗球同步，逐字保留 */
    function turtleMarkup() {
        return '<span class="mie-ld-turtle">' +
            '<span class="mie-ld-tcircle"></span>' +
            '<span class="mie-ld-tcircle"></span>' +
            '<span class="mie-ld-tcircle"></span>' +
            '<span class="mie-ld-tshadow"></span>' +
            '<span class="mie-ld-tshadow"></span>' +
            '<span class="mie-ld-tshadow"></span>' +
            '</span>';
    }

    /* 心形描线 (Uiverse · G27XLEO spotty-chipmunk-84 原版还原)
       原版 id=line/point/svg5 改为类名（多实例防冲突）；
       filter 引用 url(#blur) 原样保留（与原版渲染一致） */
    function heartMarkup() {
        var d = 'M-28.73 167.2c26.43 9.21 68.46-9.46 85.45-12.03 18.45-2.78 32.82 4.86 28.75 9.83-3.82 4.66-25.77-21.18-14.81-31.5 9.54-8.98 17.64 10.64 16.42 17.06-1.51-6.2 2.95-26.6 14.74-22.11 11.7 4.46-4.33 49.03-15.44 44.08-6.97-3.1 15.44-16.26 26.1-16 23.03.56 55.6 27.51 126.63 3.36';
        return '<svg class="mie-ld-heart" viewBox="-5 -5 278 56" version="1.1" xmlns="http://www.w3.org/2000/svg">' +
            '<filter><feGaussianBlur stdDeviation="1.6"></feGaussianBlur></filter>' +
            '<g transform="translate(29.1 -127.42)"><path pathLength="1" d="' + d + '" class="mie-ld-hline"></path></g>' +
            '<g transform="translate(29.1 -127.42)"><path pathLength="1" d="' + d + '" class="mie-ld-hpoint" filter="url(#blur)"></path></g>' +
            '</svg>';
    }

    /* 洗衣机 (Uiverse · Shoh2008 curvy-bulldog-27 原版还原)
       原版单个 .loader 依赖 ::before/::after，滚筒旋转 + 机身抖动 */
    function washerMarkup() {
        return '<span class="mie-ld-wash"></span>';
    }

    function buildInner(animId) {
        if (animId === 'hamster') return htmlToNode(hamsterMarkup());
        if (animId === 'pencil') return htmlToNode(pencilMarkup());
        if (animId === 'fish') return htmlToNode(fishMarkup());
        if (animId === 'zzz') return htmlToNode(zzzMarkup());
        if (animId === 'quail') return htmlToNode(quailMarkup());
        if (animId === 'rat') return htmlToNode(ratMarkup());
        if (animId === 'butterfly') return htmlToNode(butterflyMarkup());
        if (animId === 'turtle') return htmlToNode(turtleMarkup());
        if (animId === 'heart') return htmlToNode(heartMarkup());
        if (animId === 'washer') return htmlToNode(washerMarkup());
        if (animId === 'default') {
            var d = document.createElement('span');
            d.className = 'mie-ld-native';
            return d;
        }
        return null;
    }

    function htmlToNode(html) {
        var t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstChild;
    }

    function buildNode(animId, size) {
        var wrap = document.createElement('span');
        wrap.className = 'mie-ld';
        wrap.style.setProperty('--mie-ld-size', size + 'px');
        var inner = buildInner(animId);
        if (inner) wrap.appendChild(inner);
        return wrap;
    }

    /* ------------------------- 等待节点接管 ------------------------- */
    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        try {
            var cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
            return el.getClientRects().length > 0;
        } catch (e) { return false; }
    }

    function textHosts(scene, claimed) {
        var t = scene.text;
        if (!t) return [];
        var out = [];
        var roots = [];
        t.scopes.forEach(function (s) {
            try { Array.prototype.push.apply(roots, document.querySelectorAll(s)); } catch (e) { /* 忽略无效选择器 */ }
        });
        roots.forEach(function (root) {
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
            var n;
            while ((n = walker.nextNode())) {
                if (!t.pattern.test(n.nodeValue || '')) continue;
                var el = n.parentElement;
                if (!el || !isVisible(el)) continue;
                if (el.closest(EXCLUDE)) continue;
                /* 父链上已有注入节点时不再重复挂载（如 toast 里的文案） */
                if (el.parentElement && el.parentElement.closest('.mie-ld-host')) continue;
                if (claimed.has(el)) continue;
                var txt = (el.textContent || '').trim();
                if (txt.length > 70 || el.children.length > 3) continue;
                if (el.closest('.toast') && !el.querySelector('.spinner') && !/批量生成/.test(txt)) continue;
                out.push(el);
            }
        });
        return out;
    }

    function collectHosts(scene, claimed) {
        var hosts = [];
        (scene.selectors || []).forEach(function (sel) {
            try {
                Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
                    if (!isVisible(el)) return;
                    if (scene.matchText && !scene.matchText.test((el.textContent || '').trim())) return;
                    if (scene.generic && el.closest(EXCLUDE)) return;
                    if (claimed.has(el)) return;
                    hosts.push(el);
                });
            } catch (e) { /* 忽略无效选择器 */ }
        });
        Array.prototype.push.apply(hosts, textHosts(scene, claimed));
        /* 去重 + 只保留最内层（父节点若包含另一个候选则丢掉父） */
        var uniq = [];
        hosts.forEach(function (h) { if (uniq.indexOf(h) === -1) uniq.push(h); });
        return uniq.filter(function (h) {
            return !uniq.some(function (o) { return o !== h && h.contains(o); });
        });
    }

    function hideOriginals(host, scene) {
        var sels = (scene.hide || []).join(',');
        if (!sels) return;
        var saved = [];
        try {
            Array.prototype.forEach.call(host.querySelectorAll(sels), function (el) {
                if (el.closest('.mie-ld')) return;
                saved.push({ el: el, prev: el.style.getPropertyValue('display') });
                el.style.setProperty('display', 'none', 'important');
            });
        } catch (e) { /* 忽略无效选择器 */ }
        hiddenMap.set(host, saved);
    }

    function restoreOriginals(host) {
        var saved = hiddenMap.get(host);
        if (!saved) return;
        saved.forEach(function (o) {
            if (o.prev) o.el.style.setProperty('display', o.prev);
            else o.el.style.removeProperty('display');
        });
        hiddenMap.delete(host);
    }

    function removeInject(host) {
        var node = host.querySelector(':scope > .mie-ld[data-mie-ld]');
        if (node) node.remove();
        restoreOriginals(host);
        delete host.dataset.mieLd;
        host.classList.remove('mie-ld-host');
    }

    function ensureInject(host, scene, animId) {
        if (animId === 'default') { removeInject(host); return; }
        if (host.dataset.mieLd === animId && host.querySelector(':scope > .mie-ld[data-mie-ld]')) return;
        if (host.dataset.mieLd) removeInject(host);

        hideOriginals(host, scene);
        /* 仓鼠/拍桌手/散步鸟细节多，太小会糊成一团 */
        var size = scene.size || 40;
        var min = MIN_SIZE[animId];
        if (min) size = Math.max(size, min);
        var wrap = buildNode(animId, size);
        wrap.dataset.mieLd = animId;
        if (scene.block || animId === 'hamster' || animId === 'fish' || animId === 'quail' ||
            animId === 'rat' || animId === 'butterfly' || animId === 'turtle' ||
            animId === 'heart' || animId === 'washer') wrap.classList.add('mie-ld--block');
        if (animId === 'hamster' || animId === 'fish' || animId === 'quail' ||
            animId === 'rat' || animId === 'butterfly' || animId === 'turtle' ||
            animId === 'heart' || animId === 'washer') wrap.classList.add('mie-ld--stack');
        host.insertBefore(wrap, host.firstChild);
        host.classList.add('mie-ld-host');
        host.dataset.mieLd = animId;
    }

    function sync() {
        var claimed = new Set();
        SCENES.forEach(function (scene) {
            var hosts = collectHosts(scene, claimed);
            hosts.forEach(function (h) { claimed.add(h); });
            var animId = resolve(scene.id);
            var active = new Set(hosts);
            var prev = prevHosts[scene.id] || new Set();
            prev.forEach(function (h) { if (!active.has(h)) removeInject(h); });
            hosts.forEach(function (h) { ensureInject(h, scene, animId); });
            prevHosts[scene.id] = active;
        });
    }

    /* ------------------------- 设置面板 ------------------------- */
    function optionHTML(withFollow, current) {
        var html = withFollow ? '<option value="follow"' + (current === 'follow' || !current || !validAnim(current) ? ' selected' : '') + '>跟随全局</option>' : '';
        options().forEach(function (o) {
            html += '<option value="' + o.id + '"' + (current === o.id ? ' selected' : '') + '>' + o.label + '</option>';
        });
        return html;
    }

    function buildModal() {
        if (document.getElementById('mie-ld-modal')) return;
        var box = document.createElement('div');
        box.id = 'mie-ld-modal';
        box.className = 'modal-overlay';
        box.innerHTML =
            '<div class="modal-window" style="max-height: 82vh; overflow-y: auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<h3 style="margin:0;">加载动画</h3>' +
            '<button class="icon-btn-simple" data-mie-ld="close">✕</button></div>' +
            '<div class="mie-ld-preview" id="mie-ld-preview"></div>' +
            '<div class="mie-ld-row"><label>全局默认</label>' +
            '<select class="mie-ld-sel" id="mie-ld-global"></select></div>' +
            '<div class="mie-ld-subhead">各应用</div>' +
            '<div class="mie-ld-scene-list" id="mie-ld-scenes"></div>' +
            '</div>';
        document.body.appendChild(box);
    }

    function renderPreview() {
        var box = document.getElementById('mie-ld-preview');
        if (!box) return;
        box.innerHTML = '';
        var id = state.global === 'default' ? 'default' : state.global;
        var node = buildNode(id, MIN_SIZE[id] || 96);
        box.appendChild(node);
    }

    function renderModal() {
        buildModal();
        var g = document.getElementById('mie-ld-global');
        if (g) g.innerHTML = optionHTML(false, state.global);

        var list = document.getElementById('mie-ld-scenes');
        if (list) {
            list.innerHTML = SCENES.map(function (s) {
                var cur = state.scenes[s.id] || 'follow';
                return '<div class="mie-ld-row"><label>' + s.label + '</label>' +
                    '<select class="mie-ld-sel" data-mie-ld-scene="' + s.id + '">' +
                    optionHTML(true, cur) + '</select></div>';
            }).join('');
        }
        renderPreview();
    }

    function open() {
        readCfg();
        renderModal();
        var m = document.getElementById('mie-ld-modal');
        if (m) m.classList.add('visible');
    }

    function close() {
        var m = document.getElementById('mie-ld-modal');
        if (m) m.classList.remove('visible');
    }

    /* ------------------------- 事件绑定 ------------------------- */
    function bindEvents() {
        document.body.addEventListener('change', function (e) {
            var t = e.target;
            if (t.id === 'mie-ld-global') {
                state.global = t.value;
                writeCfg();
                renderPreview();
                sync();
            } else if (t.dataset && t.dataset.mieLdScene) {
                var id = t.dataset.mieLdScene;
                if (t.value === 'follow') delete state.scenes[id];
                else state.scenes[id] = t.value;
                writeCfg();
                sync();
            }
        });

        document.body.addEventListener('click', function (e) {
            var t = e.target.closest('[data-mie-ld]');
            if (!t) {
                if (e.target.id === 'mie-ld-modal') close();
                return;
            }
            if (t.dataset.mieLd === 'close') close();
        });
    }

    /* ------------------------- 启动 ------------------------- */
    function boot() {
        readCfg();
        buildModal();
        bindEvents();
        sync();

        var raf = 0;
        var mo = new MutationObserver(function () {
            if (raf) return;
            raf = requestAnimationFrame(function () { raf = 0; sync(); });
        });
        mo.observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    window.MieLoading = {
        open: open,
        close: close,
        sync: sync,
        get: function () { return JSON.parse(JSON.stringify(state)); },
        set: function (patch) {
            if (patch.global) state.global = patch.global;
            if (patch.scenes) state.scenes = patch.scenes;
            writeCfg();
            sync();
            renderModal();
        },
        options: options,
        scenes: function () { return SCENES.map(function (s) { return { id: s.id, label: s.label }; }); },
        registerScene: function (s) { if (s && s.id && !SCENES.some(function (x) { return x.id === s.id; })) SCENES.push(s); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
