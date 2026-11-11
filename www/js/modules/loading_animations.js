/* =========================================================
 * MieLoading · 全局生成等待动画接管器
 *
 * - 美化 App 里可给「全局」和「每个生成等待过程」分别选动画
 * - 内置：默认 / 仓鼠跑轮 / 铅笔画圈；支持粘贴 CSS 自建动画
 * - 通过 MutationObserver 自动接管各 APP 动态插入的等待节点，
 *   不需要逐个改业务模块；角色聊天「正在输入」等待被明确排除
 * - 自定义 CSS 经作用域隔离 + @keyframes 改名，不会污染全站
 * ========================================================= */
(function () {
    'use strict';

    var CFG_KEY = 'mie_loading_anim_v1';
    var BUILTIN = [
        { id: 'default', label: '默认' },
        { id: 'hamster', label: '仓鼠跑轮' },
        { id: 'pencil', label: '铅笔画圈' }
    ];

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

    var state = { global: 'default', scenes: {}, customs: [] };
    var hiddenMap = new WeakMap();
    var prevHosts = {};
    var pencilUid = 0;

    /* ------------------------- 配置读写 ------------------------- */
    function readCfg() {
        try {
            var raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {};
            /* 先恢复自建动画，再校验引用它的 global / scenes，否则会被误判为无效 */
            state.customs = Array.isArray(raw.customs) ? raw.customs.filter(function (a) {
                return a && a.id && a.css;
            }) : [];
            state.global = validAnim(raw.global) ? raw.global : 'default';
            state.scenes = (raw.scenes && typeof raw.scenes === 'object') ? raw.scenes : {};
        } catch (e) { /* 配置损坏则用默认值 */ }
        return state;
    }

    function validAnim(id) {
        if (!id) return false;
        if (id === 'default' || id === 'hamster' || id === 'pencil') return true;
        return state.customs.some(function (a) { return 'u' + a.id === id; });
    }

    function writeCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({
                global: state.global, scenes: state.scenes, customs: state.customs
            }));
            return true;
        } catch (e) {
            if (typeof showToast === 'function') showToast('保存失败，代码可能过长');
            return false;
        }
    }

    function options() {
        var list = BUILTIN.slice();
        state.customs.forEach(function (a) { list.push({ id: 'u' + a.id, label: a.name || '自定义动画' }); });
        return list;
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

    function customMarkup(anim) {
        var root = document.createElement('span');
        root.className = 'mie-ld-custom mie-ld-u' + anim.id + (anim.rootHint ? ' ' + anim.rootHint : '');
        var inner = anim.html || autoMarkup(anim.css, anim.rootHint || guessRootHint(anim.css));
        root.innerHTML = inner || '<span class="mie-ld-part"></span><span class="mie-ld-part"></span><span class="mie-ld-part"></span>';
        return root;
    }

    function buildInner(animId) {
        if (animId === 'hamster') return htmlToNode(hamsterMarkup());
        if (animId === 'pencil') return htmlToNode(pencilMarkup());
        if (animId === 'default') {
            var d = document.createElement('span');
            d.className = 'mie-ld-native';
            return d;
        }
        var custom = state.customs.filter(function (a) { return 'u' + a.id === animId; })[0];
        return custom ? customMarkup(custom) : null;
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

    /* --------------------- 自定义 CSS 作用域隔离 --------------------- */
    function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /* 从 CSS 里抓出全部选择器（跳过 @media/@keyframes 等 at 规则头） */
    function cssSelectorList(css) {
        var clean = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
        var out = [];
        clean.split('{').slice(0, -1).forEach(function (chunk) {
            var i = chunk.lastIndexOf('}');
            var seg = (i > -1 ? chunk.slice(i + 1) : chunk).trim();
            if (!seg || seg.charAt(0) === '@') return;
            seg.split(',').forEach(function (s) {
                s = s.trim().replace(/^[>+~\s]+/, '');
                if (s) out.push(s);
            });
        });
        return out;
    }

    /* 只贴 CSS 也直接能用：按选择器里的 class 自动生成结构 DOM。
       - 根类（guessRootHint）由容器自己承担，不再生成元素
       - 后代选择器 .a .b 推断出 b 嵌在 a 里；否则默认挂在根下
       - BEM 修饰符 X--mod 自动带上基础类 X（如 book__pg--2 → "book__pg book__pg--2"）
       - :nth-child(N) 按最大序号补足同 class 的份数 */
    function autoMarkup(css, hint) {
        var sels = cssSelectorList(css);
        var order = [], seen = {}, count = {}, parentOf = {};
        function note(n) {
            if (!n || n.indexOf('mie-ld') === 0) return;
            if (hint && n === hint) { seen[n] = true; return; }
            if (!seen[n]) {
                seen[n] = true;
                order.push(n);
                count[n] = 1;
                parentOf[n] = hint ? null : null;   // 默认挂根容器下
            }
        }
        sels.forEach(function (sel) {
            var names = (sel.match(/\.([a-zA-Z_][\w-]*)/g) || []).map(function (c) { return c.slice(1); });
            names.forEach(note);
            var nm = sel.match(/:nth-child\(\s*(\d+)\s*\)/);
            if (nm) {
                names.forEach(function (n) {
                    if (count[n] !== undefined) count[n] = Math.max(count[n], parseInt(nm[1], 10));
                });
            }
            var parts = sel.split(/[\s>+~]+/).filter(Boolean);
            if (parts.length >= 2) {
                var childCls = (parts[parts.length - 1].match(/\.([a-zA-Z_][\w-]*)/g) || []).map(function (c) { return c.slice(1); });
                var parCls = (parts[parts.length - 2].match(/\.([a-zA-Z_][\w-]*)/g) || []).map(function (c) { return c.slice(1); });
                if (childCls.length && parCls.length) {
                    var p = parCls[parCls.length - 1];
                    if (p !== (hint || null) && seen[p] !== undefined && !(hint && p === hint)) {
                        childCls.forEach(function (n) {
                            if (parentOf[n] === null) parentOf[n] = p;
                        });
                    }
                }
            }
        });
        if (!order.length) return '';

        function classesFor(n) {
            var base = n.split('--')[0];
            return (base !== n && seen[base]) ? base + ' ' + n : n;
        }
        function nodeFor(n, depth) {
            if (depth > 8) return '';
            var open = '<span class="' + classesFor(n) + '">';
            var kids = order.filter(function (k) { return parentOf[k] === n; });
            var inner = '';
            kids.forEach(function (k) { inner += nodeFor(k, depth + 1); });
            var copies = count[n] > 1 ? count[n] : 1;
            var out = '';
            for (var i = 0; i < copies; i++) out += open + (i === 0 ? inner : '') + '</span>';
            return out;
        }
        var roots = order.filter(function (k) { return !parentOf[k]; });
        return roots.map(function (k) { return nodeFor(k, 0); }).join('');
    }

    function guessRootHint(css) {
        var counts = {};
        css.replace(/\.([a-zA-Z_][\w-]*)/g, function (m, n) {
            if (n.indexOf('__') > -1 || n.indexOf('--') > -1 || n.indexOf('mie-ld') === 0) return m;
            counts[n] = (counts[n] || 0) + 1;
            return m;
        });
        var best = null, max = 0;
        Object.keys(counts).forEach(function (k) {
            if (counts[k] > max) { max = counts[k]; best = k; }
        });
        return best;
    }

    function scopeSelector(sel, root, hint) {
        sel = (sel || '').trim();
        if (!sel) return root;
        if (sel.indexOf(root) === 0) return sel;
        if (hint) {
            var re = new RegExp(esc('.' + hint) + '(?=[\\s:.#>+\\[,~]|$)', 'g');
            if (re.test(sel)) return sel.replace(re, root);
        }
        if (/^(?::root|html|body|:scope|\*)$/i.test(sel)) return root;
        var replaced = sel.replace(/^(?::root|html|body|:scope)(?=[\s>+~,.#:\[])/i, root);
        if (replaced !== sel && replaced.indexOf(root) === 0) return replaced;
        return root + ' ' + sel;
    }

    function walkRules(rules, fn) {
        Array.prototype.forEach.call(rules, function (r) {
            fn(r);
            if (r.type !== 7 && r.cssRules) {
                try { walkRules(r.cssRules, fn); } catch (e) { /* 跨域规则忽略 */ }
            }
        });
    }

    function applyCustomStyle(anim) {
        var styleId = 'mie-ld-style-' + anim.id;
        var old = document.getElementById(styleId);
        if (old) old.remove();

        var root = '.mie-ld-u' + anim.id;
        var hint = anim.rootHint || guessRootHint(anim.css);
        var map = {};
        var css = String(anim.css || '');

        /* @keyframes 改名（项目里已有 @keyframes spin，不改名必冲突） */
        css = css.replace(/@keyframes\s+([\w-]+)/gi, function (m, name) {
            var neu = 'mieLdU' + anim.id + '_' + name.replace(/[^\w-]/g, '');
            map[name] = neu;
            return '@keyframes ' + neu;
        });
        css = css.replace(/\b(animation(?:-name)?)\s*:\s*([^;}]+)/gi, function (m, prop, val) {
            var v = val;
            Object.keys(map).forEach(function (k) {
                v = v.replace(new RegExp('\\b' + esc(k) + '\\b', 'g'), map[k]);
            });
            return prop + ': ' + v;
        });

        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);

        if (!style.sheet) return;
        try {
            walkRules(style.sheet.cssRules, function (r) {
                if (r.type !== 1) return;                       // CSSStyleRule
                try {
                    r.selectorText = String(r.selectorText).split(',').map(function (s) {
                        return scopeSelector(s, root, hint);
                    }).join(',');
                } catch (e) { /* 无效选择器保留原样 */ }
            });
        } catch (e) { /* 忽略解析异常 */ }
    }

    function applyAllCustomStyles() {
        state.customs.forEach(applyCustomStyle);
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
        /* 仓鼠细节多，太小会糊成一团；自建动画按 em 缩放也需要基本尺寸 */
        var size = scene.size || 40;
        if (animId === 'hamster') size = Math.max(size, 120);
        if (animId.charAt(0) === 'u') size = Math.max(size, 72);
        var wrap = buildNode(animId, size);
        wrap.dataset.mieLd = animId;
        if (scene.block || animId === 'hamster') wrap.classList.add('mie-ld--block');
        if (animId === 'hamster') wrap.classList.add('mie-ld--stack');
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
    var EXAMPLE_CSS = '.loader {\n' +
        '  width: 48px;\n  height: 48px;\n' +
        '  border: 4px solid #eee;\n  border-top-color: #8f3545;\n' +
        '  border-radius: 50%;\n  animation: mieSpin 1s linear infinite;\n' +
        '}\n\n@keyframes mieSpin {\n  to { transform: rotate(360deg); }\n}';

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
            '<div class="mie-ld-subhead">新建动画</div>' +
            '<div class="mie-ld-row"><label>名称</label></div>' +
            '<div class="mie-ld-row"><input class="mie-ld-input" id="mie-ld-name" placeholder="自定义动画"></div>' +
            '<div class="mie-ld-row"><label>CSS</label></div>' +
            '<div class="mie-ld-row"><textarea class="mie-ld-textarea" id="mie-ld-css" rows="10"></textarea></div>' +
            '<div class="mie-ld-row"><button class="btn btn-primary btn-small" data-mie-ld="save" style="margin:0;">保存</button></div>' +
            '<div class="mie-ld-subhead">已建动画</div>' +
            '<div id="mie-ld-customs"></div>' +
            '</div>';
        document.body.appendChild(box);
    }

    function renderPreview() {
        var box = document.getElementById('mie-ld-preview');
        if (!box) return;
        box.innerHTML = '';
        var id = state.global === 'default' ? 'default' : state.global;
        var node = buildNode(id, id === 'hamster' ? 120 : 96);
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

        var customs = document.getElementById('mie-ld-customs');
        if (customs) {
            customs.innerHTML = state.customs.length ? state.customs.map(function (a) {
                return '<div class="mie-ld-custom-item"><span>' + escapeHTML(a.name || '自定义动画') + '</span>' +
                    '<button class="mie-ld-del" data-mie-ld-del="' + a.id + '">删除</button></div>';
            }).join('') : '<div class="mie-ld-row"><span>—</span></div>';
        }

        var cssEl = document.getElementById('mie-ld-css');
        if (cssEl && !cssEl.value) cssEl.value = EXAMPLE_CSS;
        renderPreview();
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
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

    function onSave() {
        var nameEl = document.getElementById('mie-ld-name');
        var cssEl = document.getElementById('mie-ld-css');
        var css = cssEl ? cssEl.value.trim() : '';
        if (!css) { if (typeof showToast === 'function') showToast('CSS 不能为空'); return; }
        var anim = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            name: (nameEl && nameEl.value.trim()) || '自定义动画',
            css: css,
            rootHint: guessRootHint(css)
        };
        state.customs.push(anim);
        if (!writeCfg()) { state.customs.pop(); return; }
        applyCustomStyle(anim);
        if (nameEl) nameEl.value = '';
        renderModal();
        sync();
    }

    function onDelete(id) {
        state.customs = state.customs.filter(function (a) { return a.id !== id; });
        Object.keys(state.scenes).forEach(function (k) {
            if (state.scenes[k] === 'u' + id) delete state.scenes[k];
        });
        if (state.global === 'u' + id) state.global = 'default';
        var st = document.getElementById('mie-ld-style-' + id);
        if (st) st.remove();
        writeCfg();
        sync();
        renderModal();
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
            var t = e.target.closest('[data-mie-ld], [data-mie-ld-del]');
            if (!t) {
                if (e.target.id === 'mie-ld-modal') close();
                return;
            }
            if (t.dataset.mieLd === 'close') close();
            else if (t.dataset.mieLd === 'save') onSave();
            else if (t.dataset.mieLdDel) onDelete(t.dataset.mieLdDel);
        });
    }

    /* ------------------------- 启动 ------------------------- */
    function boot() {
        readCfg();
        buildModal();
        applyAllCustomStyles();
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
