// ===================================================================
// blister_dropdown.js — 铝箔药丸板下拉选择器（LeiBox blister-dropdown 复刻）
// 原作 @AdelineAstraOS（biohacking lab blister pack dropdown）
// 三层药槽：pocket-rim（塑料药座）+ 裸胶囊位图 + dome 高光；
// 选中行铝箔被撕开（popped-cavity），裸胶囊飞进顶部药槽。
// 素材：assets/blister/{pocket-rim, pill-blue, pill-amber, pill-sage, popped-cavity}.png
//
// API：
//   BlisterDropdown.mount(容器, { options:[{id,name,extra,pill:'blue'|'amber'|'sage',hue}], value, label, onChange })
//     → 完整版：铝箔头条 + 下方下拉面板（与 demo 布局一致）
//   BlisterDropdown.mountMini(容器, { options, value, onChange })
//     → 迷你版：小药槽触发器 + 右对齐浮动面板（放在弹窗右上角）
//   两者都返回 { root, getValue, setValue, destroy }
// ===================================================================

(function () {
    'use strict';

    var ASSET = 'assets/blister/';
    var PILLS = {
        blue: ASSET + 'pill-blue.png',
        amber: ASSET + 'pill-amber.png',
        sage: ASSET + 'pill-sage.png'
    };
    var RIM = ASSET + 'pocket-rim.png';
    var CAVITY = ASSET + 'popped-cavity.png';

    // ── 音效：胶囊咔哒 + 铝箔窸窣 ──
    var actx = null;
    function ensureAudio() {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume().catch(function () { });
            return actx;
        } catch (e) { return null; }
    }
    function popSound() {
        var ac = ensureAudio();
        if (!ac) return;
        var t = ac.currentTime;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1300, t);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.08);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.13);
    }
    function crinkleSound() {
        var ac = ensureAudio();
        if (!ac) return;
        var t = ac.currentTime, dur = 0.16;
        var buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        var src = ac.createBufferSource();
        src.buffer = buf;
        var bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.8;
        var g = ac.createGain();
        g.gain.setValueAtTime(0.12, t);
        src.connect(bp).connect(g).connect(ac.destination);
        src.start(t);
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function reduced() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function findOpt(options, id) {
        for (var i = 0; i < options.length; i++) if (String(options[i].id) === String(id)) return options[i];
        return null;
    }
    function pillSrc(o) { return PILLS[o && o.pill] || PILLS.blue; }
    function pillFilter(o) { return o && o.hue ? 'hue-rotate(' + Number(o.hue) + 'deg)' : ''; }

    // ── 顶部药槽（铝箔座 + 裸胶囊 + 塑料穹顶高光） ──
    function pocketHtml(o) {
        return '<span class="bdm-pocket" aria-hidden="true">' +
            '<img class="bdm-rim" src="' + RIM + '" alt="" draggable="false">' +
            '<img class="bdm-capsule" src="' + pillSrc(o) + '" style="filter:' + pillFilter(o) + '" alt="" draggable="false">' +
            '<i class="bdm-dome"></i>' +
            '</span>';
    }

    // ── 选项行（未选中：完整胶囊在药座里；选中：铝箔撕开空槽） ──
    function rowHtml(o, selected) {
        return '<div class="bdm-row' + (selected ? ' is-on' : '') + '" role="option" tabindex="0"' +
            ' data-bd-id="' + esc(o.id) + '" aria-selected="' + selected + '">' +
            '<span class="bdm-cell" aria-hidden="true">' +
                '<img class="bdm-cell-rim' + (selected ? ' is-off' : '') + '" src="' + RIM + '" alt="" draggable="false">' +
                '<img class="bdm-cell-capsule' + (selected ? ' is-off' : '') + '" src="' + pillSrc(o) + '" style="filter:' + pillFilter(o) + '" alt="" draggable="false">' +
                '<i class="bdm-cell-dome' + (selected ? ' is-off' : '') + '"></i>' +
                '<img class="bdm-cell-cavity' + (selected ? '' : ' is-off') + '" src="' + CAVITY + '" alt="" draggable="false">' +
            '</span>' +
            '<span class="bdm-dot' + (selected ? ' on' : '') + '" aria-hidden="true"></span>' +
            '<span class="bdm-label">' + esc(o.name) + '</span>' +
            (o.extra ? '<span class="bdm-extra">' + esc(o.extra) + '</span>' : '') +
            '</div>';
    }

    function rowsHtml(options, value) {
        var out = [];
        options.forEach(function (o, i) {
            if (i) out.push('<div class="bdm-perf" aria-hidden="true"></div>');
            out.push(rowHtml(o, String(o.id) === String(value)));
        });
        return out.join('');
    }

    // ── 落点粒子 ──
    function burst(host) {
        if (!host || reduced()) return;
        var layer = document.createElement('div');
        layer.className = 'bdm-burst';
        for (var i = 0; i < 8; i++) {
            var s = document.createElement('span');
            s.style.setProperty('--ba', (i * 45 + Math.random() * 20 - 10) + 'deg');
            s.style.setProperty('--bd', (26 + Math.random() * 22) + 'px');
            layer.appendChild(s);
        }
        host.appendChild(layer);
        setTimeout(function () { layer.remove(); }, 620);
    }

    // ── 裸胶囊从选项行飞进顶部药槽 ──
    function flyCapsule(o, fromRect, toRect, done) {
        if (!fromRect || !toRect || reduced()) { if (done) done(); return; }
        var ghost = document.createElement('img');
        ghost.src = pillSrc(o);
        ghost.className = 'bdm-fly';
        ghost.alt = '';
        ghost.draggable = false;
        if (pillFilter(o)) ghost.style.filter = pillFilter(o);
        ghost.style.left = fromRect.left + 'px';
        ghost.style.top = fromRect.top + 'px';
        ghost.style.width = fromRect.width + 'px';
        ghost.style.height = fromRect.height + 'px';
        document.body.appendChild(ghost);
        var dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
        var dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
        var s = toRect.width / Math.max(1, fromRect.width);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + s.toFixed(3) + ') rotate(-10deg)';
                ghost.style.opacity = '0.95';
            });
        });
        setTimeout(function () { ghost.remove(); if (done) done(); }, 540);
    }

    // ── 共用实例逻辑 ──
    function createInstance(root, opts, refs) {
        var options = opts.options || [];
        var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
        var value = opts.value != null ? String(opts.value) : (options[0] && String(options[0].id));
        var destroyed = false;

        function setOpen(open) {
            root.classList.toggle('is-open', open);
            var trigger = root.querySelector('.bdm-trigger, .bd-head');
            if (trigger) trigger.setAttribute('aria-expanded', String(open));
            if (open) crinkleSound();
        }
        function isOpen() { return root.classList.contains('is-open'); }

        function paintTrigger(o) {
            var capsule = root.querySelector('.bdm-capsule');
            if (!capsule) return;
            capsule.src = pillSrc(o);
            capsule.style.filter = pillFilter(o);
            capsule.classList.remove('is-land');
            void capsule.offsetWidth;
            capsule.classList.add('is-land');
        }

        function paintRows(id) {
            root.querySelectorAll('.bdm-row').forEach(function (row) {
                var on = row.getAttribute('data-bd-id') === String(id);
                row.classList.toggle('is-on', on);
                row.setAttribute('aria-selected', String(on));
                var dot = row.querySelector('.bdm-dot');
                if (dot) dot.classList.toggle('on', on);
                ['.bdm-cell-rim', '.bdm-cell-capsule', '.bdm-cell-dome', '.bdm-cell-cavity'].forEach(function (sel, idx) {
                    var el = row.querySelector(sel);
                    if (el) el.classList.toggle('is-off', on ? idx !== 3 : idx === 3);
                });
            });
        }

        function setValue(id, silent) {
            value = String(id);
            paintRows(value);
            var status = root.querySelector('.bd-status');
            if (status) {
                var o = findOpt(options, value);
                status.textContent = o ? o.name : '';
            }
            paintTrigger(findOpt(options, value));
        }

        function select(id, row) {
            if (destroyed) return;
            id = String(id);
            if (id === value) { setOpen(false); return; }
            var o = findOpt(options, id);
            var srcCell = row && row.querySelector('.bdm-cell');
            var dstPocket = root.querySelector('.bdm-pocket');
            popSound();
            burst(dstPocket);
            var swap = function () {
                setValue(id);
                setOpen(false);
                if (onChange) onChange(id);
            };
            if (srcCell && dstPocket) {
                var a = srcCell.getBoundingClientRect();
                var b = dstPocket.getBoundingClientRect();
                // 先在选项行把铝箔撕开（视觉同步），裸胶囊本体飞往顶部药槽
                paintRows(id);
                flyCapsule(o, { left: a.left + a.width * 0.12, top: a.top, width: a.width * 0.76, height: a.height }, b, swap);
            } else {
                setValue(id);
                setOpen(false);
                if (onChange) onChange(id);
            }
        }

        function bindRows(scope) {
            scope.querySelectorAll('.bdm-row').forEach(function (row) {
                row.addEventListener('click', function () { select(row.getAttribute('data-bd-id'), row); });
                row.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(row.getAttribute('data-bd-id'), row); }
                });
            });
        }

        return {
            root: root,
            isOpen: isOpen,
            setOpen: setOpen,
            getValue: function () { return value; },
            setValue: function (id) { setValue(id, true); },
            select: select,
            bindRows: bindRows,
            onChangeFn: onChange,
            isDestroyed: function () { return destroyed; },
            destroy: function () {
                destroyed = true;
                root.remove();
            }
        };
    }

    // ═══ 迷你版：小药槽触发器 + 浮动面板（放弹窗右上角） ═══
    function mountMini(container, opts) {
        var options = opts.options || [];
        var value = opts.value != null ? String(opts.value) : (options[0] && String(options[0].id));
        var cur = findOpt(options, value);

        var root = document.createElement('div');
        root.className = 'bdm';
        root.innerHTML =
            '<button type="button" class="bdm-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(opts.label || '切换卡池') + '">' +
                pocketHtml(cur) +
            '</button>' +
            '<div class="bdm-pop" role="listbox" aria-label="' + esc(opts.label || '选择') + '">' +
                '<div class="bdm-panel">' + rowsHtml(options, value) + '</div>' +
            '</div>';
        container.appendChild(root);

        var inst = createInstance(root, opts, null);
        var trigger = root.querySelector('.bdm-trigger');
        trigger.addEventListener('click', function () { inst.setOpen(!inst.isOpen()); });

        inst.bindRows(root);

        var outside = function (e) {
            if (inst.isDestroyed()) return;
            if (!root.contains(e.target)) inst.setOpen(false);
        };
        document.addEventListener('pointerdown', outside, true);
        var origDestroy = inst.destroy;
        inst.destroy = function () {
            document.removeEventListener('pointerdown', outside, true);
            origDestroy();
        };
        return inst;
    }

    // ═══ 完整版：铝箔头条 + 下方下拉面板（与 demo 布局一致） ═══
    function mount(container, opts) {
        var options = opts.options || [];
        var value = opts.value != null ? String(opts.value) : (options[0] && String(options[0].id));
        var cur = findOpt(options, value);

        var root = document.createElement('div');
        root.className = 'bd';
        root.innerHTML =
            '<button type="button" class="bd-head" aria-haspopup="listbox" aria-expanded="false">' +
                pocketHtml(cur) +
                '<span class="bd-status">' + esc(cur ? cur.name : '') + '</span>' +
                '<span class="bd-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>' +
            '</button>' +
            '<div class="bd-clip"><div class="bd-panel" role="listbox" aria-label="' + esc(opts.label || '选择') + '">' +
                rowsHtml(options, value) +
            '</div></div>';
        container.appendChild(root);

        var inst = createInstance(root, opts, null);
        var head = root.querySelector('.bd-head');
        head.addEventListener('click', function () { inst.setOpen(!inst.isOpen()); });

        inst.bindRows(root);

        var outside = function (e) {
            if (inst.isDestroyed()) return;
            if (!root.contains(e.target)) inst.setOpen(false);
        };
        document.addEventListener('pointerdown', outside, true);
        var origDestroy = inst.destroy;
        inst.destroy = function () {
            document.removeEventListener('pointerdown', outside, true);
            origDestroy();
        };
        return inst;
    }

    window.BlisterDropdown = { mount: mount, mountMini: mountMini };
})();
