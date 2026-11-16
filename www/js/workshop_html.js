function injectWorkshopHTML() {
    const workshopHTML = `
<style>
    /* 绘图工坊：iOS 液态玻璃（白底 + 柔和色斑 + 毛玻璃卡片） */
    #drawing-workshop-screen {
        --ws-ink: #1c1c1e;
        --ws-sub: #8e8e93;
        --ws-line: rgba(60, 60, 67, 0.10);
        --ws-glass: rgba(255, 255, 255, 0.52);
        --ws-glass-2: rgba(255, 255, 255, 0.78);
        --ws-blur: blur(22px) saturate(180%);
        --ws-radius: 24px;
    }
    #drawing-workshop-screen.active {
        position: relative;
        background-color: #ffffff;
    }
    #drawing-workshop-screen .ws-bg {
        position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
        background: linear-gradient(180deg, #fbfcff 0%, #f6f4f8 100%);
    }    #drawing-workshop-screen .ws-blob {
        position: absolute; border-radius: 50%; filter: blur(64px); opacity: 0.8;
    }
    #drawing-workshop-screen .ws-blob-a { width: 300px; height: 300px; top: -100px; left: -90px; background: radial-gradient(circle, #cfe0ff 0%, rgba(207, 224, 255, 0) 70%); }
    #drawing-workshop-screen .ws-blob-b { width: 280px; height: 280px; top: 170px; right: -130px; background: radial-gradient(circle, #ffd4e6 0%, rgba(255, 212, 230, 0) 70%); }
    #drawing-workshop-screen .ws-blob-c { width: 340px; height: 340px; bottom: -150px; left: -80px; background: radial-gradient(circle, #cdf2e2 0%, rgba(205, 242, 226, 0) 70%); }

    #drawing-workshop-screen .app-header {
        position: relative; z-index: 3;
        background: rgba(255, 255, 255, 0.55);
        backdrop-filter: var(--ws-blur); -webkit-backdrop-filter: var(--ws-blur);
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        box-shadow: 0 1px 0 var(--ws-line);
    }
    #drawing-workshop-screen .app-header .back-btn { color: var(--ws-ink); }
    #drawing-workshop-screen .ws-title {
        flex: 1; text-align: center; font-size: 16px; font-weight: 700; color: var(--ws-ink); letter-spacing: .02em;
    }
    #workshop-char-select {
        -webkit-appearance: none; appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.66);
        backdrop-filter: var(--ws-blur); -webkit-backdrop-filter: var(--ws-blur);
        color: var(--ws-ink); border-radius: 999px; font-size: 13px; padding: 7px 26px 7px 13px;
        max-width: 132px; text-align: right; direction: rtl; outline: none;
        box-shadow: 0 6px 16px -12px rgba(31, 41, 55, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%231c1c1e' stroke-width='1.4' stroke-linecap='round'/></svg>");
        background-repeat: no-repeat; background-position: right 11px center;
    }
    #drawing-workshop-screen .content {
        position: relative; z-index: 1; padding: 14px 14px 42px; background: transparent;
    }

    /* 玻璃卡片 */
    #drawing-workshop-screen .ws-section {
        background: var(--ws-glass);
        backdrop-filter: var(--ws-blur); -webkit-backdrop-filter: var(--ws-blur);
        border: 1px solid rgba(255, 255, 255, 0.85); border-radius: var(--ws-radius);
        margin-bottom: 14px; overflow: hidden;
        box-shadow: 0 14px 34px -22px rgba(31, 41, 55, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
    #drawing-workshop-screen .ws-sec-head {
        display: flex; justify-content: space-between; align-items: center; gap: 10px;
        padding: 15px 16px;
    }
    #drawing-workshop-screen .ws-fold-head { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
    #drawing-workshop-screen .ws-fold-head:active { background: rgba(255, 255, 255, 0.4); }
    #drawing-workshop-screen .ws-sec-title { font-size: 15px; font-weight: 700; color: var(--ws-ink); }
    #drawing-workshop-screen .ws-chev {
        flex: none; width: 22px; height: 22px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(120, 120, 128, 0.12); color: #6b6b70;
        transition: transform .28s cubic-bezier(.32,.72,0,1);
        transform: rotate(-90deg);
    }
    #drawing-workshop-screen .ws-section.open .ws-chev { transform: rotate(0deg); }
    #drawing-workshop-screen .ws-fold {
        display: grid; grid-template-rows: 0fr;
        transition: grid-template-rows .3s cubic-bezier(.32,.72,0,1);
    }
    #drawing-workshop-screen .ws-section.open .ws-fold { grid-template-rows: 1fr; }
    #drawing-workshop-screen .ws-fold > div { overflow: hidden; min-height: 0; }

    #drawing-workshop-screen .ws-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 13px 16px; gap: 12px;
    }
    #drawing-workshop-screen .ws-row + .ws-row,
    #drawing-workshop-screen .ws-fold-head + .ws-fold .ws-row:first-child { border-top: 1px solid rgba(255, 255, 255, 0.65); }
    #drawing-workshop-screen .ws-label { font-size: 14px; color: var(--ws-ink); flex: none; }
    #drawing-workshop-screen .ws-input, #drawing-workshop-screen .ws-select, #drawing-workshop-screen .ws-textarea {
        border: 1px solid rgba(255, 255, 255, 0.9); border-radius: 16px;
        background: rgba(255, 255, 255, 0.72); color: var(--ws-ink);
        font-size: 14px; padding: 11px 13px; outline: none; width: 100%;
        box-shadow: inset 0 1px 2px rgba(31, 41, 55, 0.05);
    }
    #drawing-workshop-screen .ws-input:focus, #drawing-workshop-screen .ws-select:focus, #drawing-workshop-screen .ws-textarea:focus {
        background: var(--ws-glass-2); border-color: rgba(255, 255, 255, 1);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.55), inset 0 1px 2px rgba(31, 41, 55, 0.05);
    }
    #drawing-workshop-screen .ws-textarea { min-height: 78px; resize: vertical; line-height: 1.55; }
    #drawing-workshop-screen .ws-select { -webkit-appearance: none; appearance: none; text-align: right; direction: rtl; max-width: 62%; }
    #drawing-workshop-screen .ws-btn {
        border: 1px solid rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.7); color: var(--ws-ink);
        border-radius: 999px; font-size: 13px; padding: 7px 15px; cursor: pointer; white-space: nowrap; flex: none;
        box-shadow: 0 6px 16px -12px rgba(31, 41, 55, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        transition: transform .18s ease, background .18s ease;
    }
    #drawing-workshop-screen .ws-btn:active { transform: scale(.95); background: #fff; }
    #drawing-workshop-screen .ws-btn-dark {
        background: #111; color: #fff; border-color: #111;
        box-shadow: 0 10px 22px -14px rgba(0, 0, 0, 0.65);
    }
    #drawing-workshop-screen .ws-pill {
        border: 1px solid rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.66); color: var(--ws-ink);
        border-radius: 999px; font-size: 13px; padding: 8px 0; text-align: center; cursor: pointer; flex: 1;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
    #drawing-workshop-screen .ws-pill.on { background: #111; color: #fff; border-color: #111; }
    #drawing-workshop-screen .ws-pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
    #drawing-workshop-screen .ws-pill-row .ws-pill { flex: 1 1 30%; }
    #drawing-workshop-screen .kkt-switch { width: 48px; height: 28px; }
    #drawing-workshop-screen .kkt-switch .kkt-slider { background: rgba(120, 120, 128, 0.22); }
    #drawing-workshop-screen .kkt-switch input:checked + .kkt-slider { background: #111; }
    #drawing-workshop-screen .kkt-switch .kkt-slider::before { height: 22px; width: 22px; }
    #workshop-generate-btn {
        width: 100%; padding: 14px; font-size: 15px; font-weight: 700;
        background: #111; color: #fff; border: none; border-radius: 999px;
        box-shadow: 0 16px 30px -18px rgba(0, 0, 0, 0.7);
    }
    #workshop-generate-btn:active { transform: scale(.98); }
    #drawing-workshop-screen .ws-ref-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    #drawing-workshop-screen .ws-ref-item {
        position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden;
        background: rgba(255, 255, 255, 0.5); cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 6px 14px -12px rgba(31, 41, 55, 0.5);
    }
    #drawing-workshop-screen .ws-ref-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #drawing-workshop-screen .ws-ref-item .ws-ref-mask {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.16); color: #fff; font-size: 14px;
    }
    #drawing-workshop-screen .ws-ref-item.del-sel .ws-ref-mask { background: rgba(0, 0, 0, 0.55); }
    #drawing-workshop-screen .ws-empty {
        text-align: center; color: #98989d; font-size: 13px; padding: 18px;
        border: 1px dashed rgba(120, 120, 128, 0.28); border-radius: 18px; background: rgba(255, 255, 255, 0.42);
    }
</style>
<div id="drawing-workshop-screen" class="screen">
    <div class="ws-bg"><span class="ws-blob ws-blob-a"></span><span class="ws-blob ws-blob-b"></span><span class="ws-blob ws-blob-c"></span></div>
    <header class="app-header">
        <button class="back-btn" data-target="home-screen">‹</button>
        <div class="ws-title">绘图工坊</div>
        <select id="workshop-char-select" title="切换角色"></select>
    </header>
    <main class="content" id="drawing-workshop-content" style="overflow-y: auto;">

        <!-- ① 生图 API（折叠） -->
        <div class="ws-section" id="workshop-api-section" data-fold="api">
            <div class="ws-sec-head ws-fold-head" data-fold-toggle>
                <div class="ws-sec-title">生图 API</div>
                <span class="ws-chev"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1.5 1.5L6 6l4.5-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            </div>
            <div class="ws-fold">
                <div>
                    <div class="ws-row" style="flex-direction: column; align-items: stretch;">
                        <input type="text" id="workshop-api-url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="API 地址" class="ws-input" style="margin-bottom: 8px;">
                        <input type="password" id="workshop-api-key" autocomplete="new-password" placeholder="密钥" class="ws-input">
                    </div>
                    <div class="ws-row">
                        <div class="ws-label">模型</div>
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; justify-content: flex-end;">
                            <select id="workshop-api-model" class="ws-select" style="max-width: none; flex: 1;">
                                <option value="">请先拉取</option>
                            </select>
                            <button type="button" class="ws-btn" id="workshop-fetch-models-btn">拉取模型</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ② 当前角色：专属生图配置（JS 渲染） -->
        <div class="ws-section" id="workshop-char-card">
            <div id="workshop-char-panel"></div>
        </div>

        <!-- ③ 提示词扩写（折叠） -->
        <div class="ws-section" id="workshop-llm-section" data-fold="llm">
            <div class="ws-sec-head ws-fold-head" data-fold-toggle>
                <div class="ws-sec-title">提示词扩写</div>
                <span class="ws-chev"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1.5 1.5L6 6l4.5-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            </div>
            <div class="ws-fold">
                <div>
                    <div class="ws-row">
                        <div class="ws-label">独立 API 配置</div>
                        <label class="kkt-switch">
                            <input type="checkbox" id="workshop-llm-independent-api">
                            <span class="kkt-slider"></span>
                        </label>
                    </div>
                    <div class="ws-row" id="workshop-llm-api-select-container" style="display: none;">
                        <div class="ws-label">选择 API 预设</div>
                        <select id="workshop-llm-api-preset" class="ws-select">
                            <option value="">请选择</option>
                        </select>
                    </div>
                    <div class="ws-row" style="flex-direction: column; align-items: stretch;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div class="ws-label">扩写条目</div>
                            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                                <select id="workshop-llm-preset-group-select" class="ws-select" style="max-width: 110px; text-align: center; direction: ltr;"></select>
                                <button class="ws-btn" id="workshop-reset-llm-preset-group-btn">重置</button>
                                <button class="ws-btn" id="workshop-add-llm-preset-group-btn">新建</button>
                                <button class="ws-btn" id="workshop-rename-llm-preset-group-btn">改名</button>
                                <button class="ws-btn" id="workshop-delete-llm-preset-group-btn">删除</button>
                                <button class="ws-btn" id="workshop-export-llm-preset-group-btn">导出</button>
                                <button class="ws-btn" id="workshop-import-llm-preset-group-btn">导入</button>
                                <input type="file" id="workshop-import-llm-preset-group-input" accept=".json" style="display: none;">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                            <button class="ws-btn ws-btn-dark" id="workshop-add-llm-prompt-btn">+ 添加条目</button>
                        </div>
                        <div id="workshop-llm-prompt-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ④ 生成测试图 -->
        <div class="ws-section">
            <div class="ws-sec-body" style="padding: 16px;">
                <button class="btn btn-primary" id="workshop-generate-btn">生成测试图</button>
                <div style="position: relative; margin-top: 12px;">
                    <div id="workshop-preview-area" class="ws-empty" style="min-height: 200px; display: flex; align-items: center; justify-content: center;">
                        图片预览区域
                    </div>
                    <div id="workshop-preview-actions" style="display: none; position: absolute; bottom: 10px; right: 10px; gap: 8px;">
                        <button id="workshop-save-cache-btn" class="ws-btn" style="background: rgba(255,255,255,0.9);">存入缓存</button>
                        <button id="workshop-download-btn" class="ws-btn ws-btn-dark">下载</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ⑤ 缓存管理 -->
        <div class="ws-section">
            <div class="ws-sec-head">
                <div class="ws-sec-title">缓存管理</div>
                <button class="ws-btn" id="workshop-history-btn">查看全部</button>
            </div>
            <div style="padding: 0 12px 12px;">
                <div id="workshop-history-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;"></div>
            </div>
        </div>

    </main>
</div>
    `;

    const phoneScreen = document.querySelector('.phone-screen');
    if (phoneScreen) {
        phoneScreen.insertAdjacentHTML('beforeend', workshopHTML);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectWorkshopHTML();
});
