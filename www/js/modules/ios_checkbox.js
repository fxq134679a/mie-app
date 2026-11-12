/* iOS 风格勾选框 · 全项目自动接入
   把「方形打勾」的 <input type=checkbox> 现场包成 .ios-checkbox 结构（不改动任何业务代码）。
   跳过：滑动开关、隐藏辅助输入框、已包装的、显式标记 data-ios-cb-skip 的。
   动态渲染的弹窗/列表由 MutationObserver 自动补包。 */
(function () {
    'use strict';

    var SWITCH_PARENT = /switch|toggle/i;                       // kkt-switch / ig-switch / community-setting-toggle ...
    var SWITCH_SIBLING = /slider|track|toggle|switch/i;         // kkt-slider / toggle-slider / .track / .ap-switch i
    var HIDDEN_STYLE = /opacity\s*:\s*0|\bwidth\s*:\s*0|\bheight\s*:\s*0|display\s*:\s*none|visibility\s*:\s*hidden/i;

    function skip(cb) {
        if (cb.dataset.iosCb !== undefined) return true;
        if (cb.hasAttribute('data-ios-cb-skip') || cb.closest('[data-ios-cb-skip]')) return true;
        if (cb.closest('.ios-checkbox')) return true;
        // 朋友圈 / 社区点赞按钮：隐藏 checkbox + 双 SVG 爱心，靠 :checked 切换，不能被包成方框
        if (cb.closest('.like-wrapper')) return true;
        if (cb.type !== 'checkbox') return true;
        var inline = cb.getAttribute('style') || '';
        if (HIDDEN_STYLE.test(inline)) return true;             // 纯逻辑用隐藏输入框
        var parent = cb.parentElement;
        if (!parent) return true;
        if (SWITCH_PARENT.test(parent.className || '')) return true;
        var sib = cb.nextElementSibling;
        if (sib && (SWITCH_SIBLING.test(sib.className || '') || sib.tagName === 'I')) return true;
        if (parent.classList.contains('kkt-switch')) return true;
        return false;
    }

    var SVG = '<span class="checkbox-bg"></span>' +
        '<svg class="checkbox-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path class="check-path" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" ' +
        'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function wrap(cb) {
        if (skip(cb)) return;
        var inLabel = !!cb.closest('label');
        // 在外层 label 内部用 span 包，避免 label 嵌套；否则用 label 让点击自动切换
        var host = document.createElement(inLabel ? 'span' : 'label');
        host.className = 'ios-checkbox blue';
        host.dataset.iosCbHost = '1';
        var parent = cb.parentElement;
        parent.insertBefore(host, cb);
        host.appendChild(cb);                       // 移动节点，事件监听器/checked 状态全部保留
        cb.dataset.iosCb = '1';
        var visual = document.createElement('span');
        visual.className = 'checkbox-wrapper';
        visual.innerHTML = SVG;
        host.appendChild(visual);
    }

    function scan(root) {
        var nodes;
        try { nodes = (root || document).querySelectorAll('input[type="checkbox"]'); }
        catch (e) { return; }
        for (var i = 0; i < nodes.length; i++) wrap(nodes[i]);
    }

    var queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; scan(document); });
    }

    function start() {
        scan(document);
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                if (records[i].addedNodes.length) { schedule(); return; }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
        window.IOsCheckbox = { scan: scan };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
