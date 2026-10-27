// 藏宝地图接入层
// 上游 hidden-letters 是一个独立的小服务（Express + React + Leaflet），跑在 8800 端口。
// 这里只负责：懒加载 iframe、探活、加载/出错状态、重新加载。
// 真正的藏宝逻辑全在 D:\A\html\mie\hidden-letters 里，不往 MIE 里搬。

(function () {
    'use strict';

    var URL_KEY = 'mie_treasure_map_url';   // 想换成隧道地址（任务 6）时改这个
    var DEFAULT_PORT = 8800;
    var PROBE_TIMEOUT_MS = 4000;
    var READY_TIMEOUT_MS = 10000;
    var READY_MSG = 'hidden-letters-ready';

    var frameEl = null;
    var timer = null;
    var state = 'idle';                     // idle | loading | ready | error
    var view = 'finder';                    // finder（寻宝人看的地图）| hider（藏宝人的工作台）
    var currentHider = '';                  // 当前藏宝人名字（从角色聊天带过来）

    function byId(id) {
        return document.getElementById(id);
    }

    // 上游登录用的是 SameSite=Lax 的 cookie，iframe 必须和 MIE 同一个 host，
    // 否则浏览器按跨站处理，cookie 不发，会一直跳登录页。
    function defaultBaseUrl() {
        var host = (location.hostname || '').trim();
        if (!host) host = '127.0.0.1';
        if (host === 'localhost') return 'http://localhost:' + DEFAULT_PORT + '/';
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'http://' + host + ':' + DEFAULT_PORT + '/';
        // 用域名访问时先按本机走；手机/隧道场景在任务 6 里改成实际地址
        return 'http://127.0.0.1:' + DEFAULT_PORT + '/';
    }

    function baseUrl() {
        try {
            var saved = localStorage.getItem(URL_KEY);
            if (saved && /^https?:\/\//i.test(saved)) return saved.replace(/\/+$/, '') + '/';
        } catch (e) { }
        return defaultBaseUrl();
    }

    function clearTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 连不上时给出「能照着做」的原因，而不是干巴巴一句失败
    function describeFailure() {
        var url = baseUrl();
        var host = location.hostname || '';
        var isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

        // https 页面里嵌 http 的 iframe 会被手机浏览器直接拦掉（混合内容）
        if (location.protocol === 'https:' && /^http:/i.test(url)) {
            return '当前是用 https 打开 MIE 的，手机不允许 https 页面里嵌 http 的藏宝地图。'
                + '改成 http://' + (host || '电脑的局域网IP') + ':8080/ 打开 MIE 再试；'
                + '地址不对也可以在下面直接改。';
        }
        if (url.indexOf('127.0.0.1') >= 0 || url.indexOf('localhost') >= 0) {
            return '地址是 ' + url + ' —— 在手机上 127.0.0.1 指的是手机自己，连不到电脑。'
                + '改成 http://电脑局域网IP:' + DEFAULT_PORT + '/（电脑上跑 tools\\allow-phone.bat 会显示这个 IP）。';
        }
        return '地址是 ' + url + '。检查三件事：① 手机和电脑同一个 WiFi；② 电脑上 services 小黑窗还开着；'
            + '③ 电脑防火墙放行 ' + DEFAULT_PORT + ' 端口（双击 tools\\allow-phone.bat 放行一次即可）。'
            + (isIP ? '' : ' 现在这个地址可能不是电脑的局域网 IP，可以在下面直接改。');
    }

    // 同一个服务下两页：/ 是寻宝人看的，/hider.html 是藏宝人的工作台
    function pageUrl() {
        var base = baseUrl() + (view === 'hider' ? 'hider.html' : '');
        if (view === 'hider' && currentHider) {
            base += (base.indexOf('?') >= 0 ? '&' : '?') + 'hider=' + encodeURIComponent(currentHider);
        }
        return base;
    }

    // 头部那颗「藏 / 看」跟着当前页面变
    function syncViewButton() {
        var btn = byId('treasure-map-hide');
        if (!btn) return;
        var hider = view === 'hider';
        btn.textContent = hider ? '看' : '藏';
        btn.title = hider ? '回到地图' : '藏东西';
        btn.setAttribute('aria-label', btn.title);
    }

    // kind: loading | error | ready
    function renderStatus(kind, title, hint) {
        var box = byId('treasure-map-status');
        if (!box) return;

        if (kind === 'ready') {
            box.style.display = 'none';
            box.dataset.kind = 'ready';
            box.innerHTML = '';
            return;
        }

        var html = '';
        if (kind === 'loading') html += '<div class="tm-spinner"></div>';
        if (kind === 'error') html += '<div class="tm-err-mark">!</div>';
        html += '<p class="tm-status-title">' + title + '</p>';
        if (hint) html += '<p class="tm-status-hint">' + hint + '</p>';
        if (kind === 'error') {
            html += '<div class="tm-status-actions">'
                + '<button type="button" class="btn btn-primary btn-small" id="tm-retry-btn">重试</button>'
                + '<a class="btn btn-neutral btn-small" href="' + pageUrl() + '" target="_blank" rel="noopener">在浏览器打开</a>'
                + '</div>'
                // 手机场景：地址不对（127.0.0.1 / 端口不对）时直接改，不用去翻设置
                + '<div class="tm-url-fix">'
                + '<input id="tm-url-input" type="text" inputmode="url" autocomplete="off" spellcheck="false"'
                + ' value="' + escapeAttr(baseUrl()) + '" aria-label="藏宝地图地址">'
                + '<button type="button" class="btn btn-neutral btn-small" id="tm-url-save">保存并重试</button>'
                + '</div>';
        }

        box.style.display = 'flex';
        box.dataset.kind = kind;
        box.innerHTML = html;
    }

    function destroyFrame() {
        if (frameEl && frameEl.parentNode) frameEl.parentNode.removeChild(frameEl);
        frameEl = null;
    }

    function fail(title, hint) {
        state = 'error';
        clearTimer();
        destroyFrame();
        renderStatus('error', title, hint);
    }

    // 服务在不在：拿一张静态图探一下。
    // 不能用 fetch：no-cors 请求连不上时也会 resolve 成 opaque（status 0），判断不了。
    function probeImage(url) {
        return new Promise(function (resolve) {
            var done = false;
            var img = new Image();
            var t = setTimeout(function () {
                if (done) return;
                done = true;
                resolve(false);
            }, PROBE_TIMEOUT_MS);

            img.onload = function () {
                if (done) return;
                done = true;
                clearTimeout(t);
                resolve(true);
            };
            img.onerror = function () {
                if (done) return;
                done = true;
                clearTimeout(t);
                resolve(false);
            };
            img.src = url + 'icon.svg?probe=' + Date.now();
        });
    }

    function mountFrame(url) {
        var stage = byId('treasure-map-stage');
        if (!stage) return;

        frameEl = document.createElement('iframe');
        frameEl.id = 'treasure-map-frame';
        frameEl.title = '藏宝地图';
        // geolocation 要显式授权给 iframe，否则「定位我」按钮会被直接拒
        frameEl.setAttribute('allow', 'geolocation; clipboard-write; fullscreen');
        frameEl.setAttribute('referrerpolicy', 'no-referrer');
        frameEl.src = url;
        stage.appendChild(frameEl);

        // iframe 的 load 事件在「连接被拒绝」的错误页上也会触发，不能拿它当加载成功。
        // 真正的完成信号由子页面 postMessage 过来（见 hidden-letters/web/index.html、public/login.html）。
        timer = setTimeout(function () {
            if (state !== 'loading') return;
            fail('打开超时', '服务有响应，但页面一直没加载完。点重试，或者先在浏览器里打开看看。');
        }, READY_TIMEOUT_MS);
    }

    function load(force, targetView) {
        var stage = byId('treasure-map-stage');
        if (!stage) return;
        if (frameEl && !force) return;

        if (targetView === 'hider' || targetView === 'finder') view = targetView;
        syncViewButton();

        if (force) destroyFrame();
        clearTimer();
        state = 'loading';
        renderStatus('loading', view === 'hider' ? '正在打开藏宝人的工作台…' : '正在打开藏宝地图…', '第一次打开会慢一点，之后会记住登录');

        var url = pageUrl();

        // 探活探的是服务根（icon.svg 是一张静态图），不是具体那一页
        probeImage(baseUrl()).then(function (ok) {
            if (state !== 'loading') return;
            if (!ok) {
                fail('连不上藏宝地图', describeFailure());
                return;
            }
            mountFrame(url);
        });
    }

    // 子页面加载完会 postMessage 过来，这时候才收加载层；顺便记下现在是哪一页
    window.addEventListener('message', function (e) {
        if (!frameEl || e.source !== frameEl.contentWindow) return;
        var d = e.data;
        if (!d || d.type !== READY_MSG) return;

        view = d.view === 'hider' ? 'hider' : 'finder';
        syncViewButton();

        if (state !== 'loading') return;
        state = 'ready';
        clearTimer();
        renderStatus('ready');
    });

    function bindOnce() {
        var stage = byId('treasure-map-stage');
        if (stage && !stage.dataset.tmBound) {
            stage.dataset.tmBound = '1';
            stage.addEventListener('click', function (e) {
                if (!e.target || !e.target.closest) return;

                var retry = e.target.closest('#tm-retry-btn');
                if (retry) {
                    e.preventDefault();
                    load(true);
                    return;
                }

                // 现场改地址：手机连不上多半就是这里写的是 127.0.0.1
                var saveAddr = e.target.closest('#tm-url-save');
                if (saveAddr) {
                    e.preventDefault();
                    var input = byId('tm-url-input');
                    var v = input ? String(input.value || '').trim() : '';
                    if (!v) return;
                    if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
                    window.TreasureMap.setUrl(v);
                    load(true);
                }
            });
        }

        var refresh = byId('treasure-map-refresh');
        if (refresh && !refresh.dataset.tmBound) {
            refresh.dataset.tmBound = '1';
            refresh.addEventListener('click', function (e) {
                e.preventDefault();
                load(true);
            });
        }

        var hide = byId('treasure-map-hide');
        if (hide && !hide.dataset.tmBound) {
            hide.dataset.tmBound = '1';
            hide.addEventListener('click', function (e) {
                e.preventDefault();
                load(true, view === 'hider' ? 'finder' : 'hider');
            });
        }

        var mobileBtn = byId('treasure-map-mobile');
        if (mobileBtn && !mobileBtn.dataset.tmBound) {
            mobileBtn.dataset.tmBound = '1';
            mobileBtn.addEventListener('click', function (e) {
                e.preventDefault();
                showMobileModal();
            });
        }

        var mobileClose = byId('tm-mobile-close');
        if (mobileClose && !mobileClose.dataset.tmBound) {
            mobileClose.dataset.tmBound = '1';
            mobileClose.addEventListener('click', function () {
                hideMobileModal();
            });
        }

        var mobileBackdrop = document.querySelector('.tm-mobile-backdrop');
        if (mobileBackdrop && !mobileBackdrop.dataset.tmBound) {
            mobileBackdrop.dataset.tmBound = '1';
            mobileBackdrop.addEventListener('click', function () {
                hideMobileModal();
            });
        }

        var copyBtn = byId('tm-mobile-copy-btn');
        if (copyBtn && !copyBtn.dataset.tmBound) {
            copyBtn.dataset.tmBound = '1';
            copyBtn.addEventListener('click', function () {
                var input = byId('tm-mobile-url-input');
                if (input) {
                    input.select();
                    try {
                        navigator.clipboard.writeText(input.value);
                        copyBtn.textContent = '已复制';
                        setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
                    } catch (e) {
                        document.execCommand('copy');
                        copyBtn.textContent = '已复制';
                        setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
                    }
                }
            });
        }
    }

    function showMobileModal() {
        var modal = byId('tm-mobile-modal');
        if (!modal) return;
        var url = baseUrl();
        var qrImg = byId('tm-mobile-qr-img');
        var urlInput = byId('tm-mobile-url-input');
        if (qrImg) {
            qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
        }
        if (urlInput) {
            urlInput.value = url;
        }
        modal.style.display = 'flex';
    }

    function hideMobileModal() {
        var modal = byId('tm-mobile-modal');
        if (modal) modal.style.display = 'none';
    }

    function open() {
        bindOnce();
        syncViewButton();
        load(false);
    }

    window.TreasureMap = {
        open: open,
        reload: function () { load(true); },
        // 头部那颗按钮点一下的效果：在地图和藏宝人工作台之间切
        toggle: function () { load(true, view === 'hider' ? 'finder' : 'hider'); },
        // 打开藏宝人工作台，可选传入角色名（从聊天页带过来）
        openHider: function (hiderName) {
            if (hiderName) currentHider = String(hiderName).slice(0, 20);
            load(true, 'hider');
        },
        openFinder: function () { load(true, 'finder'); },
        getView: function () { return view; },
        getUrl: baseUrl,
        // 设置当前藏宝人名字（从角色聊天带过来）
        setHider: function (name) { currentHider = name ? String(name).slice(0, 20) : ''; },
        getHider: function () { return currentHider; },
        // 设置里要改地址时用；传空字符串恢复默认
        setUrl: function (url) {
            try {
                if (!url) localStorage.removeItem(URL_KEY);
                else localStorage.setItem(URL_KEY, url);
            } catch (e) { }
        }
    };
})();
