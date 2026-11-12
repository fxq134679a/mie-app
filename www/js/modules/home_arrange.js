// --- 桌面排法（js/modules/home_arrange.js）---
// 移植自 lianhuan（MIT）blocks/home + blocks/physics：
//   垂丝/横渡/灯串 = silk-rope.js 一个舞台三种 mode
//   纸夹 = paper-clip.js + demo-paper.html 的七张纸（几何在 home_arrange_data.js）
//   散摞 = stack.js + demo-stack.html 的五摞纸片
// 映射：桌面 App 图标 → 丝线卡（13 张）/ 纸夹纸（6 张）/ 散摞纸片（13 片）
// 点按两段式：第一下浮起/绷紧，第二下打开对应 App（switchScreen）
(function () {
    'use strict';

    var MODES = [
        { id: 'grid', label: '原生' },
        { id: 'drape', label: '垂丝' },
        { id: 'blinds', label: '横渡' },
        { id: 'lantern', label: '灯串' },
        { id: 'paper', label: '纸夹' },
        { id: 'stack', label: '散摞' }
    ];
    var SILK_MODES = ['drape', 'blinds', 'lantern'];

    var silkInst = null;
    var current = 'grid';
    var apps = [];          // [{name, target}]
    var inited = false;

    function isSilk(m) { return SILK_MODES.indexOf(m) >= 0; }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function uniqueName(base, i) { return base; }

    /* ── App 清单：由 setupHomeScreen 传入 ── */
    function setApps(list) { apps = (list || []).filter(function (a) { return a && a.name && a.target; }); }

    /* ui.js 里 switchScreen 是 const 声明，不在 window 上 —— 走全局词法作用域兜底 */
    function goScreen(target) {
        if (typeof window.switchScreen === 'function') return window.switchScreen(target);
        if (typeof switchScreen === 'function') return switchScreen(target);
    }

    function openAppByName(name) {
        var hit = apps.find(function (a) { return a.name === name; });
        if (hit) {
            goScreen(hit.target);
            return true;
        }
        return false;
    }
    // 纸夹 / 散摞的第二段点按走 window.openEntry（paper-clip.js / stack.js 内部约定）
    window.openEntry = function (name) {
        if (current !== 'paper' && current !== 'stack') return false;
        return openAppByName(name);
    };

    /* ── DOM ── */
    function buildSilkBox() {
        var cards = '';
        var n = Math.min(13, apps.length);
        for (var i = 0; i < n; i++) {
            cards += '<div class="silkcard" data-card="' + i + '" data-target="' + esc(apps[i].target) + '"><b>' + esc(apps[i].name) + '</b></div>';
        }
        return '<div data-home="silk" hidden><div class="silkstage" data-stage>'
            + '<svg data-svg aria-hidden="true"></svg>' + cards
            + '<div class="silkhint" data-hint></div>'
            + '</div></div>';
    }
    function buildCanvasBox(kind, markup) {
        return '<div data-home="' + kind + '" hidden><div class="lh-canvas-wrap"><div class="hstage">' + markup + '</div></div></div>';
    }

    /* 把 App 名写进纸夹的纸 / 散摞的纸片。
       纸上的排版照原件（_ref/lianhuan core/web/index.html 247479 起）：
       眉标小字 + 大标题 + 副标题三行。这里只换文字，口径同上游 paintPaper：
       换 b / i 的内容。但上游 paintPaper 保留眉标，是因为正式应用里眉标配的是
       真实数据（NOW PLAYING 配真实在听的歌）；mie 把纸重用成 App 启动器，
       眉标和 b/i 之后的剩余节点（book 的进度条、moment 的第二条假动态）都
       对不上号 —— 一律清掉，不拿上游演示的假数据装作有内容（上游自己的口径：
       「没有的就是没有」）。 */
    function relabelPaper(root, list) {
        var slips = Array.prototype.slice.call(root.querySelectorAll('[data-slip]'));
        var usable = slips.filter(function (s) { return !s.hasAttribute('data-retired'); });
        // 撤掉的那张（hidden）清掉上游演示的假文案就行
        slips.forEach(function (slip) {
            if (!slip.hasAttribute('data-retired')) return;
            var body = slip.querySelector('[data-body]');
            if (body) body.innerHTML = '';
        });
        usable.forEach(function (slip, i) {
            var app = list[i % list.length];
            slip.setAttribute('data-sub', app.name);
            slip.setAttribute('data-target', app.target);
            var body = slip.querySelector('[data-body]');
            if (!body) return;
            var eyebrow = body.querySelector('span');
            if (eyebrow) eyebrow.textContent = '';
            var b = body.querySelector('b');
            if (b) b.textContent = app.name;    // 角标 em（上游演示的假条数）一并去掉
            var it = body.querySelector('i');
            if (it) it.textContent = '点两下打开';
            /* b/i 之后的剩余节点全是演示数据（进度条 / 分割线 / 假评论），砍掉 */
            var tail = it || b;
            if (tail) while (tail.nextElementSibling) tail.nextElementSibling.remove();
        });
    }
    function relabelStack(root, list) {
        var leaves = Array.prototype.slice.call(root.querySelectorAll('[data-leaf]'));
        leaves.forEach(function (leaf, i) {
            var app = list[i % list.length];
            leaf.setAttribute('data-sub', app.name);
            leaf.setAttribute('data-target', app.target);
            // 小标签行（MAIN 之类装饰字）删掉，名字写进 <b>
            var b = leaf.querySelector('b');
            Array.prototype.slice.call(leaf.querySelectorAll('span')).forEach(function (sp) {
                if (b && sp.nextElementSibling === b) sp.remove();
            });
            if (b) b.textContent = app.name;
        });
        // 上游演示用的假分组名（聊天/心情…）不是本应用的，一律清掉
        Array.prototype.slice.call(root.querySelectorAll('[data-sname]')).forEach(function (s) { s.textContent = ''; });
    }

    /* 物理脚本（纸夹/散摞）在加载时绑定现有 DOM —— 渲染后要重放。
       用 fetch+eval 同步重放，比重复插 <script src> 可靠（后者偶发不执行）。
       ★ 加载失败绝不静默：本地服务器偶发 RESET 会把 fetch 打掉，之前这里
         Promise.all(..., done) 直接把失败吞了 —— 物理脚本没 eval，纸夹/散摞
         整个死掉（纸不动、点按没反应），页面上一行报错都没有，时好时坏全看
         网络脸色。现在：单脚本重试 3 次，仍失败就地报错，绝不假装加载成功。 */
    var PHYS_SRC = { paper: null, stack: null };
    var PHYS_URL = {
        paper: 'js/vendor/lianhuan/paper-clip.js',
        stack: 'js/vendor/lianhuan/stack.js'
    };
    function fetchPhys(k, n) {
        return fetch(PHYS_URL[k]).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(function (t) {
            PHYS_SRC[k] = t;
        }).catch(function (e) {
            if (n < 3) {
                return new Promise(function (res) { setTimeout(res, 300 * (n + 1)); })
                    .then(function () { return fetchPhys(k, n + 1); });
            }
            throw e;
        });
    }
    function ensurePhys(done) {
        var keys = ['paper', 'stack'].filter(function (k) { return !PHYS_SRC[k]; });
        if (!keys.length) { done(); return; }
        Promise.all(keys.map(function (k) {
            return fetchPhys(k, 0).catch(function (e) {
                console.error('[HomeArrange] 物理脚本加载失败（已重试）：', k, e);
            });
        })).then(done, done);
    }
    function replayPhysics() {
        ['paper', 'stack'].forEach(function (k) {
            if (!PHYS_SRC[k]) {
                console.error('[HomeArrange] 物理脚本缺失，' + (k === 'paper' ? '纸夹' : '散摞') + '不会动 —— 检查上面的加载报错');
                return;
            }
            try { (new Function(PHYS_SRC[k]))(); } catch (e) { console.error('[HomeArrange] 重放物理失败：', k, e); }
        });
    }

    /* ── 渲染（每次 setupHomeScreen 调一次，幂等）── */
    function setup(homeScreen, appList) {
        if (!homeScreen || !window.LH_MARKUP) return;
        setApps(appList);
        current = (window.db && db.homeArrange) || 'grid';
        if (current === 'grid') { teardown(); return; }
        if (!apps.length) return;

        destroySilk();
        var M = window.LH_MARKUP;
        var html = '<div class="lh-mode-wrap">'
            + M.wallPaper.replace('<div data-wall data-wall-paper', '<div data-wall data-wall-paper hidden')
            + M.wallStack.replace('<div data-wall data-wall-stack', '<div data-wall data-wall-stack hidden')
            + buildSilkBox()
            + buildCanvasBox('paper', M.paper)
            + buildCanvasBox('stack', M.stack)
            + '</div>';
        homeScreen.innerHTML = html;
        homeScreen.classList.add('lh-active');

        var wrap = homeScreen.querySelector('.lh-mode-wrap');
        relabelPaper(wrap, apps);
        relabelStack(wrap, apps);

        // 底纸墙跟着排法走
        var wP = wrap.querySelector('[data-wall-paper]');
        var wS = wrap.querySelector('[data-wall-stack]');
        if (wP) wP.hidden = current !== 'paper';
        if (wS) wS.hidden = current !== 'stack';

        // 显示对应容器
        var boxSilk = wrap.querySelector('[data-home="silk"]');
        var boxPaper = wrap.querySelector('[data-home="paper"]');
        var boxStack = wrap.querySelector('[data-home="stack"]');
        if (boxSilk) boxSilk.hidden = !isSilk(current);
        if (boxPaper) boxPaper.hidden = current !== 'paper';
        if (boxStack) boxStack.hidden = current !== 'stack';

        homeScreen.classList.toggle('lh-night', current === 'lantern');

        // 丝线实例
        if (window.SilkRope && boxSilk && isSilk(current)) {
            var stage = boxSilk.querySelector('[data-stage]');
            silkInst = window.SilkRope(stage, {
                mode: current,
                isActive: function () {
                    return isSilk(current)
                        && homeScreen.classList.contains('active')
                        && !boxSilk.hidden;
                },
                onOpen: function (el) {
                    var t = el && el.getAttribute('data-target');
                    if (t) goScreen(t);
                }
            });
        }

        // 纸夹 / 散摞的物理在脚本加载时绑定现有 DOM —— 渲染完重放一遍
        if (current === 'paper' || current === 'stack') {
            window.__paperStageHost = '[data-home="paper"]';
            window.__stackStageHost = '[data-home="stack"]';
            ensurePhys(function () {
                replayPhysics();
                setTimeout(function () {
                    if (current === 'paper' && window.paperFit) window.paperFit();
                    if (current === 'stack' && window.stackFit) window.stackFit();
                }, 60);
            });
        }
        inited = true;
    }

    function destroySilk() {
        if (silkInst) {
            /* 先离开灯串（applyMode 会把进灯串前那套主题还回去），再销毁 */
            try { silkInst.setMode('drape'); } catch (e) { }
            try { silkInst.destroy(); } catch (e) { }
            silkInst = null;
        }
    }
    function teardown() {
        destroySilk();
        inited = false;
    }

    /* ── 切换排法 ── */
    function set(mode) {
        if (MODES.every(function (m) { return m.id !== mode; })) return;
        window.db.homeArrange = mode;
        if (typeof window.saveData === 'function') window.saveData();
        if (mode === 'grid') {
            // 复位状态 + 摘掉画布类，再交给 setupHomeScreen 渲染普通网格
            current = 'grid';
            teardown();
            var hs = document.getElementById('home-screen');
            if (hs) hs.classList.remove('lh-active', 'lh-night');
        }
        // grid 交给 setupHomeScreen 正常渲染；其余走本模块
        if (typeof window.setupHomeScreen === 'function') window.setupHomeScreen();
        else if (mode !== 'grid') current = mode;
    }

    window.HomeArrange = {
        MODES: MODES,
        get mode() { return current; },
        isActive: function () { return inited && current !== 'grid'; },
        isSilkMode: isSilk,
        setup: setup,
        set: set,
        /* 壳尺寸变了叫一下：三种画布重新量 */
        rebuild: function () {
            if (silkInst) { try { silkInst.rebuild(); } catch (e) { } }
            if (window.paperFit) { try { window.paperFit(); } catch (e) { } }
            if (window.stackFit) { try { window.stackFit(); } catch (e) { } }
        },
        repaint: function () { if (silkInst) { try { silkInst.repaint(); } catch (e) { } } }
    };
})();
