/* =========================================================
   管理功能集 v3
   —— 与聊天页加号面板完全一致的滑动结构（左右滑翻页 + 底部圆点）
   —— 支持拖动排序、隐藏 / 恢复、保存后立即生效
   window.MieFunctionPanelManager = { open, close, loadConfig, saveConfig, ALL_ITEMS, PAGE_SIZE }
   持久化：localStorage.mieFunctionPanelConfig = { order: [...], hidden: [...] }
   ========================================================= */

(function () {
    'use strict';

    // —— 所有可管理的功能按钮（与聊天页 expansion-item 一一对应）——
    const ALL_ITEMS = [
        { id: 'regenerate-btn',     label: '重回',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65,6.35C16.2,4.9,14.21,4,12,4A8,8,0,0,0,4,12A8,8,0,0,0,12,20C15.73,20,18.84,17.45,19.73,14H17.65C16.83,16.33,14.61,18,12,18A6,6,0,0,1,6,12A6,6,0,0,1,12,6C13.66,6,15.14,6.69,16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>' },
        { id: 'photo-video-btn',    label: '相册',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/></svg>' },
        { id: 'image-recognition-btn', label: '识图',  svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.58,16.09L19.66,18L18.24,16.58L21,13.83C21.39,13.44 22,13.44 22.39,13.83L23.17,14.61C23.56,15 23.56,15.64 23.17,16.03L21.58,17.62M20.13,12.25L18.71,13.66L20.41,15.36L21.83,13.94L20.13,12.25M5.93,19H5C3.9,19 3,18.1 3,17V5C3,3.9 3.9,3 5,3H19C20.1,3 21,3.9 21,5V11.08L19,13.08V5H5V17H5.93L13.5,9.43L16.29,12.21L12.08,16.42L5.93,19Z"/></svg>' },
        { id: 'voice-message-btn',  label: '语音',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>' },
        { id: 'wallet-btn',         label: '转账',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18H4V8H20V18ZM4 6H20V6H4Z"/></svg>' },
        { id: 'gift-btn',           label: '礼物',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20,8L12,13L4,8V6H20M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M12.5,18C12.5,17.29 12.17,16.65 11.64,16.27C12.17,15.89 12.5,15.26 12.5,14.55C12.5,13.6 11.83,12.79 11,12.58V12H13V10H11V8H13V6H11V5C11,4.45 10.55,4 10,4H8C7.45,4 7,4.45 7,5V6H9V8H7V10H9V12H7V12.58C6.17,12.79 5.5,13.6 5.5,14.55C5.5,15.26 5.83,15.89 6.36,16.27C5.83,16.65 5.5,17.29 5.5,18H12.5Z"/></svg>' },
        { id: 'chat-note-btn',      label: '小纸条',   svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H13l7 7v6a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V6.5Zm2.2-.4c-.3.3-.5.7-.5 1.1 0 .5.2.9.5 1.2l6.9 6.9c.3.3.7.5 1.2.5.4 0 .8-.2 1.1-.5.6-.6.6-1.6 0-2.3l-6.9-6.9c-.6-.6-1.6-.6-2.3 0Zm1.1 1.5c.4-.4 1-.4 1.3 0l6.8 6.8c.4.4.4 1 0 1.3s-1 .4-1.3 0l-6.8-6.8c-.4-.4-.4-1 0-1.3Z"/></svg>' },
        { id: 'chat-toy-btn',      label: '玩具',   svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 1.8a.8.8 0 0 0-.8.8v3.2h11.6V4.6a.8.8 0 0 0-.8-.8H7ZM5.4 9v6.4h13.2V9H5.4Zm1.9 1.2h1.7v4H7.3v-4Zm3.6 0h1.7v4h-1.7v-4Zm3.6 0h1.7v4h-1.7v-4ZM5.4 16.8V19.4a.8.8 0 0 0 .8.8h11.6a.8.8 0 0 0 .8-.8v-2.6H5.4ZM19.6 4h1.5a1 1 0 0 1 1 1v9a1 1 0 0 1-2 0V5h-.5V4Z"/></svg>' },
        { id: 'time-skip-btn',      label: '剧情',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5v14l7-7-7-7zm9 0v14l7-7-7-7z"></path></svg>' },
        { id: 'memory-journal-btn', label: '日记',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,13.09C11.67,13.03 11.34,13 11,13A3,3 0 0,0 8,16A3,3 0 0,0 11,19C12.36,19 13.5,18.15 13.91,17H16V15H13.91C13.5,13.85 12.36,13.09 12,13.09M11,17A1,1 0 0,1 10,16A1,1 0 0,1 11,15A1,1 0 0,1 12,16A1,1 0 0,1 11,17Z"/></svg>' },
        { id: 'delete-history-btn', label: '管理',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>' },
        { id: 'char-gallery-manage-btn', label: 'TA相册', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>' },
        { id: 'capture-btn',        label: '捕获',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' },
        { id: 'airdrop-panel-btn',  label: '隔空投送', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4zM6 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6z"/><path d="M8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1.599 4.058a.5.5 0 0 1 .208.676A6.967 6.967 0 0 0 1 8c0 1.18.292 2.292.807 3.266a.5.5 0 0 1-.884.468A7.968 7.968 0 0 1 0 8c0-1.347.334-2.619.923-3.734a.5.5 0 0 1 .676-.208zm12.802 0a.5.5 0 0 1 .676.208A7.967 7.967 0 0 1 16 8a7.967 7.967 0 0 1-.923 3.734.5.5 0 0 1-.884-.468A6.967 6.967 0 0 0 15 8c0-1.18-.292-2.292-.807-3.266a.5.5 0 0 1 .208-.676z"/></svg>' },
        { id: 'shop-btn',           label: '商城',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 8.89l-1.06-4.24C20.67 3.82 19.92 3.25 19.06 3.25h-14.12c-0.86 0-1.61 0.57-1.78 1.4L2.1 8.89c-0.34 1.35 0.38 2.7 1.63 3.12l0.27 0.09V19c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2v-6.9l0.27-0.09c1.25-0.42 1.97-1.77 1.63-3.12zM12 13c-1.1 0-2-0.9-2-2s0.9-2 2-2 2 0.9 2 2-0.9 2-2 2z"/></svg>' },
        { id: 'video-call-btn',     label: '通话',     svg: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328zM1.884.511a1.745 1.745 0 0 1 2.612.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511zM11 .5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L14.293 1H11.5a.5.5 0 0 1-.5-.5z"/></svg>' },
        { id: 'red-packet-btn',     label: '红包',     svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 12c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8 8 3.58 8 8z"/></svg>' }
    ];

    const STORAGE_KEY = 'mieFunctionPanelConfig';
    const PAGE_SIZE = 8;
    const ROOT_ID = 'function-panel-manager-modal';

    let state = null;
    let overlay = null;
    let visible = false;
    let currentSlide = 0;
    let drag = null;
    let pan = null;
    let lastFlip = 0;
    let scrollRaf = 0;
    // 运行时真实按钮定义（以聊天页加号面板 DOM 为准，含其他模块动态追加的按钮）
    let runtimeDefs = ALL_ITEMS.slice();

    function byId(id) {
        return runtimeDefs.find(i => i.id === id) || ALL_ITEMS.find(i => i.id === id);
    }

    // 读取聊天页加号面板里真实的按钮（名称 / 图标 / 当前顺序 / 是否隐藏）
    function collectRealItems() {
        const nodes = document.querySelectorAll('#chat-expansion-panel .expansion-item');
        if (!nodes.length) return [];
        const list = [];
        Array.prototype.forEach.call(nodes, function (el) {
            const id = el.id;
            if (!id) return;
            if (list.some(function (d) { return d.id === id; })) return;
            const nameEl = el.querySelector('.expansion-item-name');
            const iconEl = el.querySelector('.expansion-item-icon');
            const fb = ALL_ITEMS.find(function (i) { return i.id === id; });
            list.push({
                id: id,
                label: (nameEl && nameEl.textContent.trim()) || (fb ? fb.label : id),
                svg: (iconEl && iconEl.innerHTML) || (fb ? fb.svg : ''),
                hidden: el.style.display === 'none'
            });
        });
        return list;
    }

    // —— 纠正配置结构（保留所有已知 id / 补全新按钮 / 去重）——
    function normalize(cfg) {
        const order = [];
        const src = (cfg && Array.isArray(cfg.order)) ? cfg.order : [];
        src.forEach(id => {
            if (typeof id === 'string' && id && order.indexOf(id) < 0) order.push(id);
        });
        ALL_ITEMS.forEach(it => { if (order.indexOf(it.id) < 0) order.push(it.id); });
        runtimeDefs.forEach(it => { if (order.indexOf(it.id) < 0) order.push(it.id); });
        const hidden = [];
        ((cfg && cfg.hidden) || []).forEach(id => {
            if (typeof id === 'string' && id && hidden.indexOf(id) < 0) hidden.push(id);
        });
        return { order: order, hidden: hidden };
    }

    function loadConfig() {
        let cfg = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) cfg = JSON.parse(raw);
        } catch (_) { cfg = null; }
        if (cfg && Array.isArray(cfg.order) && cfg.order.length) {
            return normalize(cfg);
        }
        const def = normalize({
            order: ALL_ITEMS.map(i => i.id),
            hidden: ['red-packet-btn']
        });
        saveConfig(def);
        return def;
    }

    function saveConfig(cfg) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
    }

    function visibleIds() {
        return state.order.filter(id => !!byId(id) && state.hidden.indexOf(id) < 0);
    }

    // —— 构建面板 ——
    function buildPanel() {
        const root = document.createElement('div');
        root.className = 'fpm-overlay';
        root.id = ROOT_ID;
        root.innerHTML = [
            '<div class="fpm-backdrop"></div>',
            '<div class="fpm-panel">',
            '  <header class="fpm-header">',
            '    <button type="button" class="fpm-btn fpm-btn-ghost" id="fpm-reset-btn">重置</button>',
            '    <span class="fpm-title">管理功能集</span>',
            '    <div class="fpm-header-right">',
            '      <button type="button" class="fpm-btn fpm-btn-ghost" id="fpm-close-btn">关闭</button>',
            '      <button type="button" class="fpm-btn fpm-btn-primary" id="fpm-save-btn">保存</button>',
            '    </div>',
            '  </header>',
            '  <div class="fpm-tip">左右滑动翻页 · 长按拖动排序 · 点 × 隐藏</div>',
            '  <div class="fpm-swiper-container">',
            '    <div class="fpm-swiper-wrapper" id="fpm-swiper-wrapper"></div>',
            '    <div class="fpm-pagination" id="fpm-pagination"></div>',
            '  </div>',
            '  <div class="fpm-hidden-section" id="fpm-hidden-section"></div>',
            '</div>'
        ].join('');
        return root;
    }

    // —— 渲染 ——
    function render() {
        if (!overlay) return;
        const wrapper = overlay.querySelector('#fpm-swiper-wrapper');
        const pagination = overlay.querySelector('#fpm-pagination');
        const hiddenSection = overlay.querySelector('#fpm-hidden-section');
        if (!wrapper) return;

        const vis = visibleIds();
        const pages = [];
        for (let i = 0; i < vis.length; i += PAGE_SIZE) pages.push(vis.slice(i, i + PAGE_SIZE));
        if (pages.length === 0) pages.push([]);
        if (currentSlide > pages.length - 1) currentSlide = pages.length - 1;
        if (currentSlide < 0) currentSlide = 0;

        wrapper.innerHTML = '';
        pages.forEach((ids, p) => {
            const slide = document.createElement('div');
            slide.className = 'fpm-slide';
            slide.dataset.page = String(p);
            ids.forEach(id => slide.appendChild(makeItemEl(id)));
            wrapper.appendChild(slide);
        });

        pagination.innerHTML = '';
        pages.forEach((_, i) => {
            const dot = document.createElement('span');
            dot.className = 'dot' + (i === currentSlide ? ' active' : '');
            dot.addEventListener('click', () => goToSlide(i));
            pagination.appendChild(dot);
        });
        pagination.style.display = pages.length > 1 ? '' : 'none';

        hiddenSection.innerHTML = '';
        if (state.hidden.length > 0) {
            const title = document.createElement('div');
            title.className = 'fpm-hidden-title';
            title.textContent = '已隐藏（点 + 恢复）';
            hiddenSection.appendChild(title);
            const grid = document.createElement('div');
            grid.className = 'fpm-hidden-grid';
            state.hidden.forEach(id => {
                if (byId(id)) grid.appendChild(makeHiddenItemEl(id));
            });
            hiddenSection.appendChild(grid);
        }

        bindSwiper(wrapper, pagination);

        requestAnimationFrame(() => {
            wrapper.scrollLeft = currentSlide * (wrapper.clientWidth || 0);
        });
    }

    function bindSwiper(wrapper, pagination) {
        // 用属性赋值，重复渲染不会重复叠加监听
        wrapper.onscroll = function () {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(function () {
                scrollRaf = 0;
                const w = wrapper.clientWidth || 1;
                const slides = wrapper.querySelectorAll('.fpm-slide');
                let idx = Math.round(wrapper.scrollLeft / w);
                if (idx < 0) idx = 0;
                if (idx > slides.length - 1) idx = slides.length - 1;
                if (idx !== currentSlide) {
                    currentSlide = idx;
                    updateDots(pagination);
                }
            });
        };

        // 桌面端：拖动空白区域翻页
        wrapper.onpointerdown = function (e) {
            if (e.pointerType !== 'mouse') return;
            if (e.target.closest('.fpm-item')) return;
            pan = { startX: e.clientX, startLeft: wrapper.scrollLeft, id: e.pointerId };
            try { wrapper.setPointerCapture(e.pointerId); } catch (_) {}
            wrapper.style.scrollSnapType = 'none';
            wrapper.style.scrollBehavior = 'auto';
            wrapper.style.cursor = 'grabbing';
        };
        wrapper.onpointermove = function (e) {
            if (!pan || pan.id !== e.pointerId) return;
            wrapper.scrollLeft = pan.startLeft - (e.clientX - pan.startX);
        };
        const endPan = function (e) {
            if (!pan || pan.id !== e.pointerId) return;
            pan = null;
            wrapper.style.scrollSnapType = '';
            wrapper.style.scrollBehavior = '';
            wrapper.style.cursor = '';
            const w = wrapper.clientWidth || 1;
            goToSlide(Math.round(wrapper.scrollLeft / w));
        };
        wrapper.onpointerup = endPan;
        wrapper.onpointercancel = endPan;

        // 触摸拖动排序时，阻止页面一起横滑
        wrapper.ontouchmove = function (e) {
            if (drag && drag.active && e.cancelable) e.preventDefault();
        };
    }

    function updateDots(pagination) {
        if (!pagination) return;
        const dots = pagination.querySelectorAll('.dot');
        for (let i = 0; i < dots.length; i++) {
            dots[i].classList.toggle('active', i === currentSlide);
        }
    }

    function goToSlide(idx) {
        if (!overlay) return;
        const wrapper = overlay.querySelector('#fpm-swiper-wrapper');
        if (!wrapper) return;
        const count = wrapper.querySelectorAll('.fpm-slide').length;
        if (idx < 0) idx = 0;
        if (idx > count - 1) idx = count - 1;
        currentSlide = idx;
        wrapper.scrollTo({ left: idx * (wrapper.clientWidth || 0), behavior: 'smooth' });
        updateDots(overlay.querySelector('#fpm-pagination'));
    }

    // —— 功能卡片 ——
    function makeItemEl(id) {
        const def = byId(id);
        const el = document.createElement('div');
        el.className = 'fpm-item';
        el.dataset.id = id;
        el.innerHTML =
            '<div class="fpm-item-remove" title="隐藏">×</div>' +
            '<div class="fpm-item-icon">' + def.svg + '</div>' +
            '<div class="fpm-item-label">' + def.label + '</div>';
        const btn = el.querySelector('.fpm-item-remove');
        btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            hideItem(id);
        });
        el.draggable = false;
        el.addEventListener('dragstart', function (e) { e.preventDefault(); });
        el.addEventListener('pointerdown', onItemPointerDown);
        return el;
    }

    function makeHiddenItemEl(id) {
        const def = byId(id);
        const el = document.createElement('div');
        el.className = 'fpm-item is-hidden';
        el.dataset.id = id;
        el.innerHTML =
            '<div class="fpm-item-restore" title="恢复">+</div>' +
            '<div class="fpm-item-icon">' + def.svg + '</div>' +
            '<div class="fpm-item-label">' + def.label + '</div>';
        el.querySelector('.fpm-item-restore').addEventListener('click', function (e) {
            e.stopPropagation();
            showItem(id);
        });
        return el;
    }

    function hideItem(id) {
        if (state.hidden.indexOf(id) < 0) state.hidden.push(id);
        render();
    }

    function showItem(id) {
        state.hidden = state.hidden.filter(x => x !== id);
        if (state.order.indexOf(id) < 0) state.order.push(id);
        render();
    }

    // —— 排序数据操作 ——
    function moveBefore(id, targetId) {
        if (id === targetId) return;
        state.order = state.order.filter(x => x !== id);
        const idx = state.order.indexOf(targetId);
        if (idx >= 0) state.order.splice(idx, 0, id);
        else state.order.push(id);
    }

    function moveToPageEnd(id, page) {
        const vis = visibleIds().filter(x => x !== id);
        let insertAt = (page + 1) * PAGE_SIZE;
        if (insertAt > vis.length) insertAt = vis.length;
        vis.splice(insertAt, 0, id);
        const rest = state.order.filter(x => vis.indexOf(x) < 0);
        state.order = vis.concat(rest);
    }

    // —— 拖动（鼠标直接拖，触摸长按后拖）——
    function onItemPointerDown(e) {
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('.fpm-item-remove')) return;
        const el = e.currentTarget;
        drag = {
            el: el,
            id: el.dataset.id,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
            active: false,
            ghost: null,
            offsetX: 0,
            offsetY: 0,
            timer: 0
        };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        // 鼠标按下时阻止浏览器原生拖拽 / 选中，避免 pointercancel
        if (e.pointerType === 'mouse' && e.cancelable) e.preventDefault();
        document.addEventListener('pointermove', onItemPointerMove);
        document.addEventListener('pointerup', onItemPointerUp);
        document.addEventListener('pointercancel', onItemPointerCancel);
        if (e.pointerType !== 'mouse') {
            drag.timer = setTimeout(function () {
                if (drag && !drag.active) activateDrag(drag.startX, drag.startY);
            }, 200);
        }
    }

    function onItemPointerMove(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.active) {
            if (Math.sqrt(dx * dx + dy * dy) <= 8) return;
            clearTimeout(drag.timer);
            if (e.pointerType === 'mouse') {
                activateDrag(drag.startX, drag.startY);
            } else {
                // 触摸快速滑动 = 翻页，交给原生滚动
                abortDrag();
                return;
            }
        }
        if (e.cancelable) e.preventDefault();
        moveGhost(e.clientX, e.clientY);
        updateDropTarget(e.clientX, e.clientY);
        maybeFlip(e.clientX);
    }

    function activateDrag(x, y) {
        if (!drag || drag.active) return;
        drag.active = true;
        const rect = drag.el.getBoundingClientRect();
        const ghost = drag.el.cloneNode(true);
        ghost.className = 'fpm-item fpm-ghost';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        drag.offsetX = x - rect.left;
        drag.offsetY = y - rect.top;
        drag.el.classList.add('is-dragging');
        moveGhost(x, y);
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
    }

    function moveGhost(x, y) {
        if (!drag || !drag.ghost) return;
        drag.ghost.style.left = (x - drag.offsetX) + 'px';
        drag.ghost.style.top = (y - drag.offsetY) + 'px';
    }

    function updateDropTarget(x, y) {
        const under = document.elementFromPoint(x, y);
        const item = under ? under.closest('.fpm-item') : null;
        document.querySelectorAll('.fpm-item.is-drop-target').forEach(function (n) {
            n.classList.remove('is-drop-target');
        });
        drag.targetItem = (item && !item.classList.contains('fpm-ghost') && item !== drag.el) ? item : null;
        drag.targetSlide = under ? under.closest('.fpm-slide') : null;
        if (drag.targetItem) drag.targetItem.classList.add('is-drop-target');
    }

    function maybeFlip(x) {
        if (!overlay) return;
        const wrapper = overlay.querySelector('#fpm-swiper-wrapper');
        if (!wrapper) return;
        const now = Date.now();
        if (now - lastFlip < 600) return;
        const rect = wrapper.getBoundingClientRect();
        const count = wrapper.querySelectorAll('.fpm-slide').length;
        if (x < rect.left + 30 && currentSlide > 0) {
            lastFlip = now;
            goToSlide(currentSlide - 1);
        } else if (x > rect.right - 30 && currentSlide < count - 1) {
            lastFlip = now;
            goToSlide(currentSlide + 1);
        }
    }

    function onItemPointerUp(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        clearTimeout(drag.timer);
        const wasActive = drag.active;
        const id = drag.id;
        cleanupDrag();
        if (!wasActive) return;

        const under = document.elementFromPoint(e.clientX, e.clientY);
        const targetItem = under ? under.closest('.fpm-item') : null;
        const targetSlide = under ? under.closest('.fpm-slide') : null;

        if (targetItem && !targetItem.classList.contains('fpm-ghost') && targetItem.dataset.id !== id) {
            moveBefore(id, targetItem.dataset.id);
            render();
        } else if (targetSlide) {
            moveToPageEnd(id, parseInt(targetSlide.dataset.page, 10) || 0);
            render();
        }
    }

    function onItemPointerCancel() {
        cleanupDrag();
    }

    function abortDrag() {
        cleanupDrag();
    }

    function cleanupDrag() {
        document.removeEventListener('pointermove', onItemPointerMove);
        document.removeEventListener('pointerup', onItemPointerUp);
        document.removeEventListener('pointercancel', onItemPointerCancel);
        document.querySelectorAll('.fpm-item.is-drop-target').forEach(function (n) {
            n.classList.remove('is-drop-target');
        });
        if (drag) {
            clearTimeout(drag.timer);
            if (drag.el) drag.el.classList.remove('is-dragging');
            if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
        }
        drag = null;
    }

    // —— 对外 API ——
    function open() {
        if (visible) return;
        // 以聊天页加号面板的真实按钮为准（名称 / 图标 / 动态注入的新按钮）
        const real = collectRealItems();
        if (real.length) {
            runtimeDefs = real.concat(ALL_ITEMS.filter(function (a) {
                return !real.some(function (r) { return r.id === a.id; });
            }));
        } else {
            runtimeDefs = ALL_ITEMS.slice();
        }

        // 顺序与显隐一律以「已保存的配置」为唯一基准。
        // 面板 DOM 的顺序本身也是由配置渲染出来的——若此刻 DOM 还是默认模板顺序
        //（面板尚未按配置重排），拿 DOM 当基准会把用户保存的顺序覆盖回默认，
        // 再点保存就把配置彻底毁了（表现为刷新后功能集变回默认）。
        state = loadConfig();

        if (real.length) {
            // 名称 / 图标跟随真实按钮（其他模块可自定义）
            real.forEach(function (d) {
                const def = runtimeDefs.find(function (x) { return x.id === d.id; });
                if (def) { def.label = d.label; def.svg = d.svg; }
            });
            // 配置里没有的新按钮（其他模块动态注入的）追加到末尾
            real.forEach(function (d) {
                if (state.order.indexOf(d.id) < 0) state.order.push(d.id);
            });
        }

        currentSlide = 0;
        visible = true;
        overlay = buildPanel();
        document.body.appendChild(overlay);

        // 先绑定按钮，保证任何情况下都能关闭
        overlay.querySelector('#fpm-close-btn').addEventListener('click', close);
        overlay.querySelector('.fpm-backdrop').addEventListener('click', close);
        overlay.querySelector('#fpm-save-btn').addEventListener('click', function () {
            saveConfig(state);
            close();
            if (typeof window.rebuildFunctionPanelSwiper === 'function') {
                try { window.rebuildFunctionPanelSwiper(); } catch (_) {}
            } else if (typeof window.refreshFunctionPanelSwiper === 'function') {
                try { window.refreshFunctionPanelSwiper(); } catch (_) {}
            }
        });
        overlay.querySelector('#fpm-reset-btn').addEventListener('click', function () {
            if (!window.confirm('恢复默认的功能排列？')) return;
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
            state = loadConfig();
            currentSlide = 0;
            render();
        });

        render();
    }

    function close() {
        cleanupDrag();
        pan = null;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        visible = false;
    }

    window.MieFunctionPanelManager = {
        open: open,
        close: close,
        loadConfig: loadConfig,
        saveConfig: saveConfig,
        ALL_ITEMS: ALL_ITEMS,
        PAGE_SIZE: PAGE_SIZE
    };
})();
