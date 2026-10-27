// --- 聊天星尘：被雾住的那句话，化成会呼吸的星尘，点一下散开 ---
// 引擎只认 .mie-dust：哪里插进来一个，就在它每一行上铺一条星尘。
// 画布贴着 .message-area 的视口，不跟着聊天记录一起变高——记录再长也不会撑爆画布尺寸上限。
// 每帧用 scrollTop 把「内容坐标」换算成「视口坐标」，滚动时星尘和文字一起走，不会掉队。

(function () {
    'use strict';

    const DUST = '.mie-dust';
    const MAX_PARTS_PER_CLOUD = 900;

    const bell = () => (Math.random() + Math.random() + Math.random()) / 3;

    let area = null;
    let canvas = null;
    let ctx = null;
    let viewW = 0;
    let viewH = 0;

    let clouds = [];            // { el, parts, nRects, textLen, color, state, t0 }
    let raf = 0;
    let observer = null;
    let sizeObserver = null;
    let rescanTimer = 0;
    let lastCheck = 0;
    let attached = false;

    function byEl(el) {
        for (let i = 0; i < clouds.length; i++) {
            if (clouds[i].el === el) return clouds[i];
        }
        return null;
    }

    // 星尘用文字自己的颜色：这行字化开时，像它本身的墨散成了尘
    function textColor(el) {
        const source = el.parentElement || el;
        const color = getComputedStyle(source).color;
        return color && color !== 'rgba(0, 0, 0, 0)' ? color : '#5d4152';
    }

    function seed(el) {
        const parts = [];
        const rects = [...el.getClientRects()];
        const color = textColor(el);
        if (!rects.length) {
            return { el, parts, nRects: -1, textLen: el.textContent.length, color, state: 'hidden', t0: 0 };
        }

        // 页面坐标 → 消息区的「内容坐标」，之后每帧只需减去 scrollTop
        const areaRect = area.getBoundingClientRect();
        const scrollTop = area.scrollTop;
        const ax = rects[0].left - areaRect.left;
        const ay = rects[0].top - areaRect.top + scrollTop;
        let budget = MAX_PARTS_PER_CLOUD;

        for (const r of rects) {
            if (r.width < 2 || r.height < 2) continue;
            const left = r.left - areaRect.left;
            const top = r.top - areaRect.top + scrollTop;
            const n = Math.min(budget, Math.max(3, Math.round(r.width * r.height / 22)));
            budget -= n;

            for (let i = 0; i < n; i++) {
                const x = -4 + Math.random() * (r.width + 8);
                const y = r.height * (0.5 + (bell() - 0.5) * 1.4);
                // 纵向钟形 + 两端化开：雾带没有硬边界
                let edge = Math.exp(-(((y / r.height - 0.5) * 2.2) ** 2));
                edge *= Math.max(0.12, Math.min(1, Math.min(x + 4, r.width + 4 - x) / 12));

                parts.push({
                    x: left + x,
                    y: top + y,
                    size: 0.55 + Math.random() * 0.85,
                    alpha: (0.3 + Math.random() * 0.62) * edge,
                    phase: Math.random() * 6.28,
                    speed: 1 + Math.random() * 2.5,
                    wob: 0.4 + Math.random() * 1.2,
                    delay: Math.random() * 150,          // 揭开时错峰熄灭
                    dur: 200 + Math.random() * 180,
                    fly: [(Math.random() - 0.5) * 30,
                          (y < r.height / 2 ? -1 : 1) * (10 + Math.random() * 25)]
                });
            }
            if (budget <= 0) break;
        }

        return { el, parts, nRects: rects.length, textLen: el.textContent.length, color, state: 'hidden', t0: 0, ax, ay };
    }

    function fit() {
        if (!area || !canvas) return;
        const w = area.clientWidth;
        const h = area.clientHeight;
        if (w <= 0 || h <= 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const bw = Math.round(w * dpr);
        const bh = Math.round(h * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        viewW = w;
        viewH = h;
        // 贴在消息区的位置上（.content 是 position:relative）
        canvas.style.left = area.offsetLeft + 'px';
        canvas.style.top = area.offsetTop + 'px';
    }

    function rescan() {
        if (!area || !ctx) return;
        const els = area.querySelectorAll(DUST);
        const next = [];

        for (const el of els) {
            const old = byEl(el);
            const rects = el.getClientRects();
            // 只重铺「行数变了 / 字数变了 / 位置挪了 / 新来的」这几个，其余粒子保留，避免整片雾重新抖一下
            let same = !!(old && old.nRects === rects.length && old.textLen === el.textContent.length);
            if (same && rects.length) {
                // 上方消息增删、图片撑高都会让文字整体位移，此时内容坐标失效，必须重铺
                const areaRect = area.getBoundingClientRect();
                const ax = rects[0].left - areaRect.left;
                const ay = rects[0].top - areaRect.top + area.scrollTop;
                if (Math.abs(ax - old.ax) > 1 || Math.abs(ay - old.ay) > 1) same = false;
            }
            if (same) {
                next.push(old);
                continue;
            }
            const fresh = seed(el);
            if (old) {
                fresh.state = old.state;
                fresh.t0 = old.t0;
            } else if (el.classList.contains('open')) {
                fresh.state = 'open';
                fresh.parts = [];
            }
            next.push(fresh);
        }

        clouds = next;
    }

    function scheduleRescan() {
        clearTimeout(rescanTimer);
        rescanTimer = setTimeout(rescan, 100);
    }

    function draw(now) {
        raf = requestAnimationFrame(draw);
        if (!ctx || !area) return;

        // 每 400ms 自查一次：键盘弹起、字体变化、图片加载都可能让折行变了
        if (now - lastCheck > 400) {
            lastCheck = now;
            fit();
            rescan();
        }

        const t = now / 1000;
        const scrollTop = area.scrollTop;
        ctx.clearRect(0, 0, viewW, viewH);

        for (const c of clouds) {
            if (c.state === 'open') continue;

            for (const p of c.parts) {
                let x = p.x + Math.sin(t * p.speed * 0.6 + p.phase) * p.wob;
                let y = p.y + Math.cos(t * p.speed * 0.5 + p.phase) * p.wob * 0.7;
                let a = p.alpha * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * p.speed + p.phase)));

                if (c.state !== 'hidden') {
                    const e = Math.min(1, Math.max(0, (now - c.t0 - p.delay) / p.dur));
                    const k = e * e * (3 - 2 * e);     // smoothstep：起止都柔
                    if (c.state === 'opening') {
                        a *= 1 - k;                    // 逐粒熄灭……
                        x += p.fly[0] * e * p.dur / 1000;   // ……边熄边往行外飘
                        y += p.fly[1] * e * p.dur / 1000;
                    } else {
                        a *= k;                        // 藏回：逐粒重新点亮
                    }
                }

                if (a < 0.02) continue;
                const sy = y - scrollTop;
                if (sy < -20 || sy > viewH + 20) continue;

                ctx.globalAlpha = a;
                ctx.fillStyle = c.color;
                ctx.beginPath();
                ctx.arc(x, sy, p.size, 0, 6.2832);
                ctx.fill();
            }

            if (c.state === 'opening' && now - c.t0 > 600) c.state = 'open';
            else if (c.state === 'closing' && now - c.t0 > 600) c.state = 'hidden';
        }

        ctx.globalAlpha = 1;
    }

    function onAreaClick(e) {
        const el = e.target && e.target.closest ? e.target.closest(DUST) : null;
        if (!el || !area.contains(el)) return;
        e.stopPropagation();

        const c = byEl(el);
        if (!c) return;
        const showing = c.state === 'opening' || c.state === 'open';
        c.state = showing ? 'closing' : 'opening';
        c.t0 = performance.now();
        el.classList.toggle('open', !showing);
    }

    function onWindowResize() {
        fit();
        rescan();
    }

    function attach() {
        const next = document.getElementById('message-area');
        if (!next) return;
        if (attached && next === area) { rescan(); return; }
        detach();

        area = next;
        const host = area.parentElement || area;

        canvas = document.createElement('canvas');
        canvas.className = 'mie-dust-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        ctx = canvas.getContext('2d');
        if (!ctx) { detach(); return; }

        area.addEventListener('click', onAreaClick);
        observer = new MutationObserver(scheduleRescan);
        observer.observe(area, { childList: true, subtree: true, characterData: true });
        if (window.ResizeObserver) {
            sizeObserver = new ResizeObserver(() => { fit(); rescan(); });
            sizeObserver.observe(area);
        }
        window.addEventListener('resize', onWindowResize);

        fit();
        rescan();
        raf = requestAnimationFrame(draw);
        attached = true;
    }

    function detach() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        clearTimeout(rescanTimer);
        if (observer) { observer.disconnect(); observer = null; }
        if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null; }
        window.removeEventListener('resize', onWindowResize);
        if (area) area.removeEventListener('click', onAreaClick);
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

        area = null;
        canvas = null;
        ctx = null;
        clouds = [];
        attached = false;
    }

    // 聊天列表 / 通知弹窗的预览：藏起来的段落不能露出原文
    function redact(text, dust) {
        if (typeof text !== 'string' || !Array.isArray(dust) || !dust.length) return text;
        const len = text.length;
        const ranges = dust
            .filter(r => Array.isArray(r))
            .map(r => [Math.max(0, Math.min(len, r[0] | 0)), Math.max(0, Math.min(len, r[1] | 0))])
            .filter(r => r[1] > r[0])
            .sort((a, b) => a[0] - b[0]);
        if (!ranges.length) return text;

        let out = '';
        let cursor = 0;
        for (const [s, e] of ranges) {
            if (s < cursor) continue;
            out += text.slice(cursor, s) + '…';
            cursor = e;
        }
        return out + text.slice(cursor);
    }

    window.MieStardust = {
        attach: attach,
        detach: detach,
        rescan: rescan,
        redact: redact
    };
})();
