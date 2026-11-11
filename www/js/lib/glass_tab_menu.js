/* 玻璃标签栏 + 创作菜单 · 移植自 D:/A/html/ipa/玻璃标签栏展开菜单.html（弹簧物理 morph 动画，去掉内嵌字体，改成响应式尺寸） */
(() => {
    const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
    const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };

    function step(state, h, stiffness, damping) {
        state.v += ((state.target - state.p) * stiffness - state.v * damping) * h;
        state.p += state.v * h;
        if (Math.abs(state.p - state.target) < 0.0001 && Math.abs(state.v) < 0.001) {
            state.p = state.target;
            state.v = 0;
        }
        return state.p !== state.target || state.v !== 0;
    }

    function mount(host, options) {
        const opts = { ...options };
        const tabs = opts.tabs || [];
        const actions = opts.actions || [];
        const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const cluster = document.createElement('div');
        cluster.className = 'gtm-cluster';
        cluster.innerHTML = `
            <div class="gtm-panel">
                <div class="gtm-tabs" role="tablist"></div>
                <div class="gtm-menu" role="menu"></div>
            </div>
            <button class="gtm-toggle" type="button" aria-label="打开菜单" aria-expanded="false">
                <span class="gtm-plus" aria-hidden="true"></span>
            </button>
        `;
        host.appendChild(cluster);

        const panel = cluster.querySelector('.gtm-panel');
        const tabsBox = cluster.querySelector('.gtm-tabs');
        const menuBox = cluster.querySelector('.gtm-menu');
        const toggle = cluster.querySelector('.gtm-toggle');
        const plus = cluster.querySelector('.gtm-plus');

        const selection = document.createElement('span');
        selection.className = 'gtm-selection';
        selection.setAttribute('aria-hidden', 'true');
        const lens = document.createElement('span');
        lens.className = 'gtm-lens';
        lens.setAttribute('aria-hidden', 'true');
        tabsBox.append(selection, lens);

        const tabButtons = tabs.map((tab, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gtm-tab';
            button.setAttribute('role', 'tab');
            button.dataset.tab = tab.id;
            button.setAttribute('aria-label', tab.label || tab.id);
            button.setAttribute('aria-selected', String(i === 0));
            button.tabIndex = i === 0 ? 0 : -1;
            button.innerHTML = `${tab.icon || ''}${tab.badgeable ? '<span class="gtm-badge" hidden></span>' : ''}`;
            tabsBox.appendChild(button);
            return button;
        });

        menuBox.style.gridTemplateColumns = `repeat(${opts.columns || Math.min(3, Math.max(1, actions.length))}, 1fr)`;
        const actionButtons = actions.map((action) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gtm-action';
            button.setAttribute('role', 'menuitem');
            button.dataset.action = action.id;
            button.tabIndex = -1;
            button.innerHTML = `${action.icon || ''}<span class="gtm-action-label">${action.label || action.id}</span>`;
            menuBox.appendChild(button);
            return button;
        });

        const geo = { H0: opts.tabHeight || 56, H1: opts.menuHeight || 208, P: 0, T: 0, pad: 6, tabW: 0 };
        function layout() {
            const style = getComputedStyle(host);
            const inner = (host.clientWidth || 360)
                - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
            geo.T = geo.H0;
            const gap = opts.gap == null ? 8 : opts.gap;
            geo.P = Math.max(120, inner - geo.T - gap);
            geo.tabW = (geo.P - geo.pad * 2) / Math.max(1, tabButtons.length);
            cluster.style.setProperty('--gtm-h0', geo.H0 + 'px');
            cluster.style.setProperty('--gtm-h1', geo.H1 + 'px');
            cluster.style.setProperty('--gtm-p', geo.P + 'px');
            cluster.style.setProperty('--gtm-tabw', geo.tabW + 'px');
            cluster.style.setProperty('--gtm-pad', geo.pad + 'px');
            draw();
        }

        const opening = { p: 0, v: 0, target: 0 };
        const selectionState = { p: 0, v: 0, target: 0 };
        const compression = { p: 0, v: 0, target: 0 };
        const press = { p: 0, v: 0, target: 0 };
        const content = { p: 0, v: 0, target: 0 };
        let selected = 0, frame = 0, last = 0, destroyed = false;
        let morphDelay = 0, pendingKick = 0, compressionDelay = 0, contentDelay = 0;

        function draw() {
            const p = clamp(opening.p);
            const c = clamp(compression.p, -0.02, 0.47);
            const width = geo.P * (1 - c);
            const height = geo.H0 + (geo.H1 - geo.H0) * clamp(p, 0, 1.02);
            panel.style.width = width + 'px';
            panel.style.left = ((geo.P - width) / 2) + 'px';
            panel.style.height = height + 'px';
            panel.style.borderRadius = (geo.H0 / 2 + geo.H0 * 0.09 * p) + 'px';

            const blur = 22 * Math.sin(p * Math.PI);
            const reveal = clamp(content.p);
            tabsBox.style.transform = `translateX(-50%) scaleX(${width / geo.P})`;
            tabsBox.style.opacity = String(1 - smooth(0.03, 0.39, p));
            tabsBox.style.filter = blur > 0.01 ? `blur(${blur}px)` : 'none';
            menuBox.style.transform = `translateX(-50%) scale(${width / geo.P}, ${height / geo.H1})`;
            menuBox.style.opacity = String(reveal);
            const menuBlur = 22 * (1 - reveal);
            menuBox.style.filter = menuBlur > 0.01 ? `blur(${menuBlur}px)` : 'none';
            menuBox.style.pointerEvents = opening.target && reveal > 0.62 ? 'auto' : 'none';
            menuBox.inert = !opening.target || reveal <= 0.62;
            tabsBox.inert = Boolean(opening.target) || p > 0.38;

            const travel = clamp(Math.abs(selectionState.v) / 7);
            const slide = `translateX(${geo.pad + selectionState.p * geo.tabW}px) scale(${1 + travel * 0.08}, ${1 + travel * 0.25})`;
            selection.style.transform = slide;
            lens.style.transform = slide;
            lens.style.opacity = String(travel);

            plus.style.transform = `rotate(${45 * p}deg)`;
            toggle.style.transform = `scale(${1 + clamp(press.p, 0, 0.48) * 0.35})`;
        }

        function settle() {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
            morphDelay = 0; pendingKick = 0; compressionDelay = 0; contentDelay = 0;
            for (const state of [opening, selectionState, compression, press, content]) {
                state.p = state.target;
                state.v = 0;
            }
            draw();
        }

        function tick(time) {
            frame = 0;
            if (destroyed) return;
            if (reduced() || document.hidden) { settle(); return; }
            const dt = Math.min(0.032, (time - (last || time - 16)) / 1000);
            last = time;
            let moving = false;
            for (let i = 0; i < 3; i++) {
                const h = dt / 3;
                if (morphDelay > 0) { morphDelay = Math.max(0, morphDelay - h); moving = true; }
                else moving = step(opening, h, 400, 26) || moving;
                if (compressionDelay > 0) { compressionDelay = Math.max(0, compressionDelay - h); moving = true; }
                else if (pendingKick) { compression.v = Math.min(20, compression.v + pendingKick); pendingKick = 0; }
                if (contentDelay > 0) { contentDelay = Math.max(0, contentDelay - h); moving = true; }
                else moving = step(content, h, 480, 30) || moving;
                moving = step(selectionState, h, 330, 26) || moving;
                moving = step(compression, h, 400, 22) || moving;
                moving = step(press, h, 420, 24) || moving;
            }
            draw();
            if (moving) frame = requestAnimationFrame(tick);
            else last = 0;
        }

        function wake() {
            if (destroyed) return;
            if (reduced() || document.hidden) { settle(); return; }
            if (!frame) frame = requestAnimationFrame(tick);
        }

        function setOpen(value) {
            const next = value ? 1 : 0;
            if (next !== opening.target && !reduced()) {
                const gap = Math.abs(next - opening.p);
                morphDelay = gap > 0.95 ? 0.075 : 0;
                compressionDelay = gap > 0.95 ? 0.09 : 0;
                contentDelay = next && gap > 0.95 ? 0.17 : 0;
                pendingKick = 17 * gap;
                press.v = Math.min(18, press.v + 16);
            }
            const wasOpen = Boolean(opening.target);
            opening.target = next;
            content.target = next;
            toggle.setAttribute('aria-expanded', String(Boolean(next)));
            toggle.setAttribute('aria-label', next ? '关闭菜单' : (opts.toggleLabel || '打开菜单'));
            if (!next) actionButtons.forEach((button) => { button.tabIndex = -1; });
            draw();
            wake();
            if (wasOpen !== Boolean(next) && typeof opts.onOpenChange === 'function') opts.onOpenChange(Boolean(next));
        }

        function select(index, focus = false) {
            if (index < 0 || index >= tabButtons.length) return;
            selected = index;
            selectionState.target = index;
            tabButtons.forEach((button, i) => {
                button.setAttribute('aria-selected', String(i === index));
                button.tabIndex = i === index ? 0 : -1;
                button.classList.toggle('active', i === index);
            });
            if (focus) tabButtons[index].focus();
            wake();
        }

        tabButtons.forEach((button, i) => {
            button.addEventListener('click', () => {
                select(i);
                opts.onSelect && opts.onSelect(tabs[i].id, tabs[i]);
            });
            button.addEventListener('keydown', (event) => {
                let next = i;
                if (event.key === 'ArrowRight') next = (i + 1) % tabButtons.length;
                else if (event.key === 'ArrowLeft') next = (i + tabButtons.length - 1) % tabButtons.length;
                else return;
                event.preventDefault();
                select(next, true);
            });
        });

        actionButtons.forEach((button, i) => {
            button.addEventListener('click', () => {
                const action = actions[i];
                setOpen(false);
                opts.onAction && opts.onAction(action.id, action);
            });
        });

        toggle.addEventListener('click', () => setOpen(!opening.target));
        toggle.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && opening.target) { event.preventDefault(); setOpen(false); toggle.focus(); }
        });

        const onDocumentPointer = (event) => {
            if (!opening.target) return;
            if (cluster.contains(event.target)) return;
            setOpen(false);
        };
        document.addEventListener('pointerdown', onDocumentPointer, true);

        const onVisibility = () => { if (document.hidden) settle(); else wake(); };
        document.addEventListener('visibilitychange', onVisibility);

        const observer = new ResizeObserver(() => layout());
        observer.observe(host);
        layout();

        const initial = typeof opts.active === 'number' ? opts.active : tabButtons.findIndex((_, i) => tabs[i].id === opts.active);
        selectionState.p = selectionState.target = initial < 0 ? 0 : initial;
        selected = initial < 0 ? 0 : initial;
        tabButtons.forEach((button, i) => {
            const on = i === selected;
            button.setAttribute('aria-selected', String(on));
            button.tabIndex = on ? 0 : -1;
            button.classList.toggle('active', on);
        });
        draw();

        return {
            element: cluster,
            setActive(id) {
                const index = tabs.findIndex((tab) => tab.id === id);
                if (index >= 0) select(index);
            },
            setBadge(id, count) {
                const index = tabs.findIndex((tab) => tab.id === id);
                if (index < 0) return;
                const badge = tabButtons[index].querySelector('.gtm-badge');
                if (!badge) return;
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.hidden = !(count > 0);
            },
            close() { setOpen(false); },
            isOpen() { return Boolean(opening.target); },
            destroy() {
                destroyed = true;
                cancelAnimationFrame(frame);
                observer.disconnect();
                document.removeEventListener('pointerdown', onDocumentPointer, true);
                document.removeEventListener('visibilitychange', onVisibility);
                cluster.remove();
            }
        };
    }

    /* 只给现有一排按钮套上滑动选中效果：不重建 DOM、不改图标，跟随外部 .active 类切换 */
    function decorate(host, options) {
        const opts = options || {};
        const items = opts.items ? Array.from(opts.items) : Array.from(host.querySelectorAll(opts.itemSelector || '.gtm-tab'));
        if (!items.length) return null;
        const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const selection = document.createElement('span');
        selection.className = 'gtm-selection';
        selection.setAttribute('aria-hidden', 'true');
        const lens = document.createElement('span');
        lens.className = 'gtm-lens';
        lens.setAttribute('aria-hidden', 'true');
        for (const deco of [selection, lens]) deco.style.top = '0px';
        host.prepend(lens, selection);

        const state = { p: 0, v: 0, target: 0 };
        let rects = [];
        let frame = 0;
        let last = 0;
        let destroyed = false;

        function draw() {
            if (!rects.length) return;
            const endIndex = rects.length - 1;
            const p = clamp(state.p, 0, endIndex);
            const from = Math.floor(p);
            const to = Math.min(endIndex, from + 1);
            const t = p - from;
            const a = rects[from];
            const b = rects[to];
            const w = a.w + (b.w - a.w) * t;
            const h = a.h + (b.h - a.h) * t;
            const x = a.x + (b.x - a.x) * t + (a.w - w) / 2;
            const y = a.y + (b.y - a.y) * t + (a.h - h) / 2;
            const travel = clamp(Math.abs(state.v) / 7);
            const slide = `translate(${x}px, ${y}px) scale(${1 + travel * 0.08}, ${1 + travel * 0.25})`;
            for (const deco of [selection, lens]) {
                deco.style.width = w + 'px';
                deco.style.height = h + 'px';
                deco.style.transform = slide;
            }
            lens.style.opacity = String(travel);
        }

        function layout() {
            if (destroyed) return;
            const hostBox = host.getBoundingClientRect();
            // 绝对定位子元素的 left:0/top:0 落在 padding box 上，需扣掉宿主边框
            rects = items.map((item) => {
                const r = item.getBoundingClientRect();
                return {
                    x: r.left - hostBox.left - host.clientLeft,
                    y: r.top - hostBox.top - host.clientTop,
                    w: r.width,
                    h: r.height
                };
            });
            draw();
        }

        // 宿主刚从 display:none 显示出来时测到的是 0，任何动作前先补一次测量
        function ensure() {
            if (!rects.length || !rects.some((rect) => rect.w > 0)) layout();
        }

        // 底栏这类 position:fixed 的宿主 offsetParent 恒为 null，用几何盒子判断可见性
        function onScreen() {
            return host.getClientRects().length > 0;
        }

        function tick(time) {
            frame = 0;
            if (destroyed) return;
            if (reduced() || document.hidden) { settle(); return; }
            const dt = Math.min(0.032, (time - (last || time - 16)) / 1000);
            last = time;
            let moving = false;
            for (let i = 0; i < 3; i++) moving = step(state, dt / 3, 330, 26) || moving;
            draw();
            if (moving) frame = requestAnimationFrame(tick);
            else last = 0;
        }

        function settle() {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
            state.p = state.target;
            state.v = 0;
            ensure();
            draw();
        }

        function wake() {
            if (destroyed) return;
            if (reduced() || document.hidden || !onScreen()) { settle(); return; }
            ensure();
            if (!frame) frame = requestAnimationFrame(tick);
        }

        function activeIndex() {
            return items.findIndex((item) => item.classList.contains('active'));
        }

        function goTo(index, immediate) {
            if (index < 0 || index >= items.length) return;
            const changed = index !== state.target;
            state.target = index;
            if (immediate || !changed) { settle(); return; }
            wake();
        }

        const classWatcher = new MutationObserver(() => goTo(activeIndex(), false));
        items.forEach((item) => classWatcher.observe(item, { attributes: true, attributeFilter: ['class'] }));

        // 宿主可能整体被 display:none 掉（切屏时才显示），显示时机用 style 属性变化兜住
        const hostWatcher = new MutationObserver(() => {
            if (!onScreen()) return;
            layout();
            goTo(activeIndex(), true);
        });
        hostWatcher.observe(host, { attributes: true, attributeFilter: ['style', 'class'] });

        const sizeWatcher = new ResizeObserver(() => layout());
        sizeWatcher.observe(host);

        const onItemPress = () => ensure();
        items.forEach((item) => item.addEventListener('pointerdown', onItemPress, true));

        const onVisibility = () => { if (document.hidden) settle(); else { layout(); wake(); } };
        document.addEventListener('visibilitychange', onVisibility);

        layout();
        goTo(Math.max(0, activeIndex()), true);

        return {
            element: selection,
            refresh() { layout(); goTo(activeIndex(), false); },
            destroy() {
                destroyed = true;
                cancelAnimationFrame(frame);
                classWatcher.disconnect();
                hostWatcher.disconnect();
                sizeWatcher.disconnect();
                items.forEach((item) => item.removeEventListener('pointerdown', onItemPress, true));
                document.removeEventListener('visibilitychange', onVisibility);
                selection.remove();
                lens.remove();
            }
        };
    }

    window.GlassTabMenu = { mount, decorate };
})();
