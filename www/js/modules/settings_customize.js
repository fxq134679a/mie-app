// --- 个性化与外观设置逻辑 ---

// === 开屏动画设置 ===
// 开屏在页面解析阶段就要启动，读不了异步的 Dexie，所以配置放 localStorage。
// 与 index.html 里的 mieSplash 读取的是同一个 key。
const MIE_SPLASH_CONFIG_KEY = 'mie_splash_config_v1';
const MIE_SPLASH_DEFAULT_MS = 7000;

// 默认文案来自 mist-splash/quotes.js（宿主也加载了这份文件）
function getMieSplashDefaults() {
    const d = (typeof window !== 'undefined' && window.MistSplashDefaults) || {};
    return {
        quotes: Array.isArray(d.quotes) && d.quotes.length
            ? d.quotes.slice()
            : ['起雾了。\n你在玻璃那边，我在这边。'],
        introEn: typeof d.introEn === 'string' ? d.introEn : 'TOUCH THE GLASS.',
        introCn: typeof d.introCn === 'string' ? d.introCn : '用手指擦开这层雾。',
        title: typeof d.title === 'string' ? d.title : 'Mist'
    };
}

function readMieSplashRawConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(MIE_SPLASH_CONFIG_KEY) || '{}') || {}; } catch (e) { }
    return cfg && typeof cfg === 'object' ? cfg : {};
}

function getMieSplashConfig() {
    const cfg = readMieSplashRawConfig();
    let ms = Number(cfg.durationMs);
    if (!Number.isFinite(ms)) ms = MIE_SPLASH_DEFAULT_MS;
    ms = Math.max(3000, Math.min(20000, ms));
    return {
        enabled: cfg.enabled !== false,
        durationMs: ms,
        stayUntilEnter: cfg.stayUntilEnter === true,
        bg: typeof cfg.bg === 'string' ? cfg.bg : '',
        // null 表示没自定义，界面回退到默认文案
        quotes: Array.isArray(cfg.quotes)
            ? cfg.quotes.filter(q => typeof q === 'string' && q.trim()).map(q => q.replace(/\r/g, '').trim())
            : null,
        introEn: typeof cfg.introEn === 'string' ? cfg.introEn : null,
        introCn: typeof cfg.introCn === 'string' ? cfg.introCn : null,
        title: typeof cfg.title === 'string' ? cfg.title : null,
        revealColor: (typeof cfg.revealColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cfg.revealColor.trim())) ? cfg.revealColor.trim() : ''
    };
}

function saveMieSplashConfig(patch) {
    // 用原始配置合并，避免只改时长时把文字等字段弄丢
    const next = Object.assign(readMieSplashRawConfig(), patch);
    // 样式二（锦鲤涟漪）已下线，顺手清掉残留字段
    delete next.style;
    delete next.koiTone;
    try {
        localStorage.setItem(MIE_SPLASH_CONFIG_KEY, JSON.stringify(next));
        return true;
    } catch (e) {
        console.error('[Splash] 保存失败', e);
        showToast('保存失败：背景图可能太大');
        return false;
    }
}

function refreshMieSplashBgPreview() {
    const el = document.getElementById('splash-bg-preview');
    if (!el) return;
    const cfg = getMieSplashConfig();
    el.style.backgroundImage = `url("${cfg.bg || 'mist-splash/mist.webp'}")`;
}

// === 擦开底色（划开后显现文字的那层背景颜色） ===
const MIE_SPLASH_REVEAL_PRESETS = [
    { hex: '',        name: '默认蓝' },
    { hex: '#b8d8f0', name: '浅蓝' },
    { hex: '#ffffff', name: '白' },
    { hex: '#f8cede', name: '浅粉' },
    { hex: '#f4a7b9', name: '粉' },
    { hex: '#ffe3a3', name: '暖黄' },
    { hex: '#bfe3c0', name: '浅绿' },
    { hex: '#2d2d2d', name: '黑' }
];

function refreshSplashRevealUI() {
    const box = document.getElementById('splash-reveal-swatches');
    if (!box) return;
    const cfg = getMieSplashConfig();
    const cur = (cfg.revealColor || '').toUpperCase();
    box.innerHTML = '';

    const mkSwatch = (hex, title, isCustom) => {
        const HEX = (hex || '').toUpperCase();
        const selected = isCustom
            ? (cur && !MIE_SPLASH_REVEAL_PRESETS.some(p => p.hex.toUpperCase() === cur))
            : (HEX === cur);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'splash-reveal-swatch' + (selected ? ' selected' : '');
        b.title = title;
        if (hex) b.dataset.color = hex; else b.dataset.color = '';
        b.style.cssText = 'width:32px;height:32px;border-radius:50%;cursor:pointer;padding:0;' +
            'border:2px solid ' + (selected ? 'var(--primary-color,#ff6b9d)' : 'rgba(0,0,0,0.12)') + ';' +
            'box-shadow:' + (selected ? '0 0 0 2px rgba(255,107,157,0.25)' : 'none') + ';' +
            'background:' + (hex || '#092161') + ';transition:border-color .15s, box-shadow .15s;';
        return b;
    };

    MIE_SPLASH_REVEAL_PRESETS.forEach(p => box.appendChild(mkSwatch(p.hex, p.name, false)));

    // 自定义取色
    const custom = mkSwatch('', '自定义', true);
    custom.dataset.custom = '1';
    custom.style.background = 'conic-gradient(#ff5a5a,#ffb84d,#ffe14d,#6bd06b,#4da6ff,#a56bff,#ff5a5a)';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'splash-reveal-custom';
    colorInput.value = cur || '#092161';
    colorInput.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';
    custom.style.position = 'relative';
    custom.appendChild(colorInput);
    box.appendChild(custom);
}

function fillMieSplashTextInputs() {
    const cfg = getMieSplashConfig();
    const defaults = getMieSplashDefaults();
    const quotesEl = document.getElementById('splash-quotes-input');
    const enEl = document.getElementById('splash-intro-en');
    const cnEl = document.getElementById('splash-intro-cn');
    const titleEl = document.getElementById('splash-title-input');
    if (quotesEl) quotesEl.value = (cfg.quotes && cfg.quotes.length ? cfg.quotes : defaults.quotes).join('\n\n');
    if (enEl) enEl.value = cfg.introEn === null ? defaults.introEn : cfg.introEn;
    if (cnEl) cnEl.value = cfg.introCn === null ? defaults.introCn : cfg.introCn;
    if (titleEl) titleEl.value = cfg.title === null ? defaults.title : cfg.title;
}

// 返回 false 表示校验没过（预览按钮会因此中止）
function saveMieSplashTextFromUI(silent) {
    const quotesEl = document.getElementById('splash-quotes-input');
    if (!quotesEl) return true;

    const quotes = quotesEl.value
        .replace(/\r/g, '')
        .split(/\n\s*\n/)
        .map(s => s.trim())
        .filter(Boolean);

    if (!quotes.length) {
        if (!silent) showToast('至少保留一段开屏文字');
        return false;
    }
    if (quotes.length > 12) {
        if (!silent) showToast('最多 12 段，合并一下吧');
        return false;
    }
    if (quotes.some(q => q.length > 240)) {
        if (!silent) showToast('每段最多 240 字');
        return false;
    }
    if (quotes.join('').length > 1000) {
        if (!silent) showToast('文字总长度太长了，删减一些吧');
        return false;
    }

    const enEl = document.getElementById('splash-intro-en');
    const cnEl = document.getElementById('splash-intro-cn');
    const titleEl = document.getElementById('splash-title-input');

    const ok = saveMieSplashConfig({
        quotes,
        introEn: enEl ? enEl.value.trim().slice(0, 60) : '',
        introCn: cnEl ? cnEl.value.trim().slice(0, 60) : '',
        title: titleEl ? titleEl.value.trim().slice(0, 16) : ''
    });
    if (ok && !silent) showToast('开屏文字已保存，点“预览开屏”看看');
    return ok;
}

function openMieSplashSettings() {
    const cfg = getMieSplashConfig();
    const toggle = document.getElementById('splash-enabled-toggle');
    const slider = document.getElementById('splash-duration-slider');
    const label = document.getElementById('splash-duration-value');
    const stayToggle = document.getElementById('splash-stay-toggle');
    if (toggle) toggle.checked = cfg.enabled;
    if (slider) slider.value = String(Math.round(cfg.durationMs / 1000));
    if (label) label.textContent = Math.round(cfg.durationMs / 1000) + ' 秒';
    if (stayToggle) stayToggle.checked = cfg.stayUntilEnter;
    updateSplashDurationUI(cfg.stayUntilEnter);
    fillMieSplashTextInputs();
    refreshMieSplashBgPreview();
    refreshSplashRevealUI();
    const modal = document.getElementById('splash-settings-modal');
    if (modal) modal.classList.add('visible');
}

function updateSplashDurationUI(stayOn) {
    const slider = document.getElementById('splash-duration-slider');
    const label = document.getElementById('splash-duration-value');
    const durationGroup = slider ? slider.closest('.form-group') : null;
    if (stayOn) {
        if (slider) slider.disabled = true;
        if (label) label.textContent = '—';
        if (durationGroup) durationGroup.style.opacity = '0.45';
    } else {
        if (slider) slider.disabled = false;
        if (durationGroup) durationGroup.style.opacity = '';
    }
}


function setupWallpaperApp() {
    const e = document.getElementById('wallpaper-upload'), t = document.getElementById('wallpaper-preview');
    if (t) {
        t.style.backgroundImage = `url(${db.wallpaper})`;
        t.textContent = '';
    }
    if (e) {
        e.addEventListener('change', async (a) => {
            const n = a.target.files[0];
            if (n) {
                try {
                    const r = await compressImage(n, {quality: 0.85, maxWidth: 1080, maxHeight: 1920});
                    db.wallpaper = r;
                    applyWallpaper(r);
                    if (t) t.style.backgroundImage = `url(${r})`;
                    await saveData();
                    showToast('壁纸已更新');
                } catch (error) {
                    showToast('壁纸压缩失败');
                }
            }
        });
    }
}

function setupCustomizeApp() {
    const customizeForm = document.getElementById('customize-form');
    
    document.body.addEventListener('click', async (e) => {
        const target = e.target;

        const header = target.closest('.collapsible-header');
        if (header) {
            const section = header.closest('.collapsible-section');
            if (section) {
                section.classList.toggle('open');
                return; 
            }
        }

        if (target.matches('.reset-icon-btn')) {
            const iconId = target.dataset.id;
            if (db.customIcons) {
                delete db.customIcons[iconId];
            }
            await saveData();
            renderCustomizeForm();
            setupHomeScreen();
            showToast('图标已重置');
        }

        if (target.matches('#apply-global-css-now-btn')) {
            const textarea = document.getElementById('global-beautification-css');
            const newCss = textarea.value;
            db.globalCss = newCss;
            applyGlobalCss(newCss);
            await saveData();
            showToast('全局样式已应用');
        }
        
        if (target.matches('#global-css-apply-btn')) {
            const select = document.getElementById('global-css-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            const preset = db.globalCssPresets.find(p => p.name === presetName);
            if (preset) {
                const textarea = document.getElementById('global-beautification-css');
                textarea.value = preset.css;
                db.globalCss = preset.css;
                applyGlobalCss(preset.css);
                saveData();
                showToast('全局CSS预设已应用');
            }
        }
        
        if (target.matches('#global-css-save-btn')) {
            const textarea = document.getElementById('global-beautification-css');
            const css = textarea.value.trim();
            if (!css) return showToast('CSS内容为空，无法保存');
            const name = prompt('请输入此预设的名称（同名将覆盖）:');
            if (!name) return;
            if (!db.globalCssPresets) db.globalCssPresets = [];
            const existingIndex = db.globalCssPresets.findIndex(p => p.name === name);
            if (existingIndex > -1) {
                db.globalCssPresets[existingIndex].css = css;
            } else {
                db.globalCssPresets.push({ name, css });
            }
            saveData();
            populateGlobalCssPresetSelect();
            showToast('全局CSS预设已保存');
        }
        
        if (target.matches('#global-css-manage-btn')) {
            openGlobalCssManageModal();
        }
        
        if (target.matches('#apply-font-btn')) {
            const fontUrl = document.getElementById('customize-font-url').value.trim();
            if (fontUrl.startsWith('[本地字体] ')) {
                const presetName = fontUrl.replace('[本地字体] ', '');
                applyFontPreset(presetName);
            } else {
                db.fontUrl = fontUrl;
                await saveData();
                applyGlobalFont(fontUrl, false);
                showToast('新字体已应用！');
            }
        }
        
        if (target.matches('#restore-font-btn')) {
            document.getElementById('customize-font-url').value = '';
            db.fontUrl = '';
            await saveData();
            applyGlobalFont('', false);
            showToast('已恢复默认字体！');
        }

        if (target.matches('#font-apply-preset-btn')) {
            const select = document.getElementById('font-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyFontPreset(presetName);
        }
        
        if (target.matches('#font-save-preset-btn')) {
            saveCurrentFontAsPreset();
        }
        
        if (target.matches('#font-manage-presets-btn')) {
            openFontManageModal();
        }

        if (target.matches('#sound-apply-preset-btn')) {
            const select = document.getElementById('sound-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            applySoundPreset(presetName);
        }
        
        if (target.matches('#sound-save-preset-btn')) {
            saveCurrentSoundAsPreset();
        }
        
        if (target.matches('#sound-manage-presets-btn')) {
            openSoundManageModal();
        }

        if (target.matches('#icon-apply-preset-btn')) {
            const select = document.getElementById('icon-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyIconPreset(presetName);
        }

        if (target.matches('#icon-save-preset-btn')) {
            saveCurrentIconsAsPreset();
        }

        if (target.matches('#icon-manage-presets-btn')) {
            openIconManageModal();
        }

        if (target.matches('#test-send-sound-btn')) {
            const url = document.getElementById('global-send-sound-url').value;
            if (url) {
                try {
                    const audio = new Audio(url);
                    audio.play().catch(e => showToast('播放失败: ' + e.message));
                } catch (e) {
                    showToast('无效的音频地址');
                }
            } else {
                showToast('未设置提示音');
            }
        }
        if (target.matches('#reset-send-sound-btn')) {
            document.getElementById('global-send-sound-url').value = '';
            db.globalSendSound = '';
            saveData();
            showToast('已重置');
        }
        if (target.matches('#test-receive-sound-btn')) {
            const url = document.getElementById('global-receive-sound-url').value;
            if (url) {
                try {
                    const audio = new Audio(url);
                    audio.play().catch(e => showToast('播放失败: ' + e.message));
                } catch (e) {
                    showToast('无效的音频地址');
                }
            } else {
                showToast('未设置提示音');
            }
        }
        if (target.matches('#reset-receive-sound-btn')) {
            document.getElementById('global-receive-sound-url').value = '';
            db.globalReceiveSound = '';
            saveData();
            showToast('已重置');
        }

        // === 开屏动画设置 ===
        if (target.matches('#splash-preview-btn')) {
            // 先把当前文字/滑块/开关写进去，预览才和下次打开一致
            if (!saveMieSplashTextFromUI(true)) return;
            const slider = document.getElementById('splash-duration-slider');
            const toggle = document.getElementById('splash-enabled-toggle');
            saveMieSplashConfig({
                durationMs: (Number(slider && slider.value) || 7) * 1000,
                enabled: toggle ? toggle.checked : true
            });
            // 不关设置弹窗：开屏遮罩在它上面，淡出后正好回到设置界面继续调
            if (window.mieSplash && typeof window.mieSplash.preview === 'function') {
                window.mieSplash.preview();
            } else {
                showToast('预览仅在应用内可用');
            }
        }

        if (target.matches('#splash-save-text-btn')) {
            saveMieSplashTextFromUI(false);
        }

        if (target.matches('#splash-reset-text-btn')) {
            if (!saveMieSplashConfig({ quotes: null, introEn: null, introCn: null, title: null })) return;
            fillMieSplashTextInputs();
            showToast('已恢复默认文字');
        }

        if (target.matches('#splash-reset-bg-btn')) {
            if (!saveMieSplashConfig({ bg: '' })) return;
            refreshMieSplashBgPreview();
            showToast('已恢复默认背景');
        }

        // 擦开底色：色板 / 自定义 / 恢复默认
        if (target.matches('.splash-reveal-swatch')) {
            if (target.dataset.custom === '1') {
                const ci = document.getElementById('splash-reveal-custom');
                if (ci) ci.click();
                return;
            }
            if (!saveMieSplashConfig({ revealColor: target.dataset.color || '' })) return;
            refreshSplashRevealUI();
            showToast(target.dataset.color ? '擦开底色已更新' : '已恢复默认擦开底色');
            return;
        }
        if (target.matches('#splash-reset-reveal-btn')) {
            if (!saveMieSplashConfig({ revealColor: '' })) return;
            refreshSplashRevealUI();
            showToast('已恢复默认擦开底色');
        }
    });

    document.body.addEventListener('input', async (e) => {
        const target = e.target;

        if (target.dataset.iconId) { 
            const iconId = target.dataset.iconId;
            const newUrl = target.value.trim();
            const previewImg = document.getElementById(`icon-preview-${iconId}`);
            if (newUrl) {
                if (!db.customIcons) db.customIcons = {};
                db.customIcons[iconId] = newUrl;
                if(previewImg) previewImg.src = newUrl;
            }
            await saveData();
            setupHomeScreen();
        } 
        else if (target.dataset.widgetPart) {
            const part = target.dataset.widgetPart;
            const prop = target.dataset.widgetProp;
            const newValue = target.value.trim();

            if (prop) { 
                db.homeWidgetSettings[part][prop] = newValue;
            } else { 
                db.homeWidgetSettings[part] = newValue;
            }
            await saveData();
            setupHomeScreen();
        }
    });

    document.body.addEventListener('input', async (e) => {
        if (e.target.id !== 'splash-duration-slider') return;
        const label = document.getElementById('splash-duration-value');
        if (label) label.textContent = e.target.value + ' 秒';
    });

    document.body.addEventListener('change', async (e) => {
        // === 开屏动画设置 ===
        if (e.target.id === 'splash-duration-slider') {
            saveMieSplashConfig({ durationMs: (Number(e.target.value) || 7) * 1000 });
            return;
        }

        if (e.target.id === 'splash-enabled-toggle') {
            saveMieSplashConfig({ enabled: e.target.checked });
            showToast(e.target.checked ? '打开应用时会显示开屏动画' : '已关闭开屏动画');
            return;
        }

        if (e.target.id === 'splash-stay-toggle') {
            saveMieSplashConfig({ stayUntilEnter: e.target.checked });
            updateSplashDurationUI(e.target.checked);
            showToast(e.target.checked ? '开屏将一直显示，直到点击 ENTER' : '已恢复自动倒计时');
            return;
        }

        if (e.target.id === 'splash-reveal-custom') {
            const hex = (e.target.value || '').toUpperCase();
            if (/^#[0-9A-F]{6}$/.test(hex) && saveMieSplashConfig({ revealColor: hex })) {
                refreshSplashRevealUI();
                showToast('擦开底色已更新');
            }
            return;
        }

        if (e.target.id === 'splash-bg-upload') {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showToast('请选择图片文件');
                e.target.value = '';
                return;
            }
            try {
                showToast('正在处理图片...');
                const dataUrl = await compressImage(file, { quality: 0.82, maxWidth: 900, maxHeight: 1800 });
                // localStorage 一般只有 5MB，超了就别写，避免把别的配置撑坏
                if (dataUrl.length > 1.6 * 1024 * 1024) {
                    showToast('图片太大了，换一张小一点的吧');
                } else if (saveMieSplashConfig({ bg: dataUrl })) {
                    refreshMieSplashBgPreview();
                    showToast('背景图已更新，点“预览开屏”看看');
                }
            } catch (error) {
                console.error('[Splash] 背景处理失败', error);
                showToast('图片处理失败，请重试');
            } finally {
                e.target.value = '';
            }
            return;
        }

        if (e.target.id === 'local-font-upload') {
            const file = e.target.files[0];
            if (!file) return;
            
            const validTypes = ['font/ttf', 'font/woff', 'font/woff2', 'font/otf'];
            const validExtensions = ['.ttf', '.woff', '.woff2', '.otf'];
            const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            
            if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt)) {
                showToast('不支持的字体格式，请上传 ttf, woff, woff2 或 otf 文件');
                e.target.value = '';
                return;
            }

            try {
                showToast('正在处理字体文件...');
                const presetId = 'font_' + Date.now();
                const fontFamily = 'CustomFont_' + Date.now();
                
                await dexieDB.customFonts.put({
                    id: presetId,
                    file: file,
                    timestamp: Date.now()
                });

                const presetName = file.name.substring(0, file.name.lastIndexOf('.'));
                const newPreset = {
                    id: presetId,
                    name: presetName,
                    isCustom: true,
                    fontFamily: fontFamily
                };

                const presets = _getFontPresets();
                presets.push(newPreset);
                _saveFontPresets(presets);
                
                await injectCustomFont(newPreset);
                populateFontPresetSelect();
                
                const select = document.getElementById('font-preset-select');
                if (select) {
                    select.value = presetName;
                    await applyFontPreset(presetName);
                }
                
                showToast('本地字体已上传并应用');
            } catch (error) {
                console.error('字体上传失败:', error);
                showToast('字体上传失败，请重试');
            } finally {
                e.target.value = '';
            }
        }

        if (e.target.matches('.icon-upload-input')) {
            const file = e.target.files[0];
            if (!file) return;
            const iconId = e.target.dataset.iconId;
            
            try {
                showToast('正在处理图片...');
                const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 200, maxHeight: 200 });
                
                if (!db.customIcons) db.customIcons = {};
                db.customIcons[iconId] = compressedUrl;
                
                const previewImg = document.getElementById(`icon-preview-${iconId}`);
                const urlInput = document.querySelector(`input[data-icon-id="${iconId}"][type="url"]`);
                
                if (previewImg) previewImg.src = compressedUrl;
                if (urlInput) urlInput.value = compressedUrl;
                
                await saveData();
                setupHomeScreen();
                showToast('图标已更新');
            } catch (error) {
                console.error('图标上传失败', error);
                showToast('图片处理失败，请重试');
            } finally {
                e.target.value = null;
            }
        }

        if (e.target.id === 'global-send-sound-url') {
            db.globalSendSound = e.target.value.trim();
            saveData();
        }
        if (e.target.id === 'global-receive-sound-url') {
            db.globalReceiveSound = e.target.value.trim();
            saveData();
        }
        if (e.target.id === 'multi-msg-sound-switch') {
            db.multiMsgSoundEnabled = e.target.checked;
            saveData();
        }
        if (e.target.id === 'global-send-sound-upload' || e.target.id === 'global-receive-sound-upload') {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('文件过大，请限制在 2MB 以内');
                e.target.value = null;
                return;
            }
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const base64 = evt.target.result;
                if (e.target.id === 'global-send-sound-upload') {
                    db.globalSendSound = base64;
                    document.getElementById('global-send-sound-url').value = base64;
                } else {
                    db.globalReceiveSound = base64;
                    document.getElementById('global-receive-sound-url').value = base64;
                }
                await saveData();
                showToast('提示音已上传');
            };
            reader.readAsDataURL(file);
            e.target.value = null;
        }
    });
}

// 小纸条字迹：选项包含上传过的自定义字体，解析规则交给 ChatNote 与信箱保持一致
function populateNoteFontSelect() {
    const select = document.getElementById('note-font-select');
    if (!select || !window.ChatNote) return;
    const preview = document.getElementById('note-font-preview');
    select.innerHTML = window.ChatNote.fontOptions(window.ChatNote.getMyFont());
    const sync = function () {
        window.ChatNote.setMyFont(select.value);
        const family = window.ChatNote.fontFamilyFor(select.value);
        select.style.fontFamily = family;
        if (preview) preview.style.fontFamily = family;
    };
    sync();
    select.addEventListener('change', sync);
}

function renderCustomizeForm() {
    const customizeForm = document.getElementById('customize-form');
    customizeForm.innerHTML = ''; 
    
    const container = document.createElement('div');
    container.className = 'kkt-settings-container';
    
    const iconOrder = [
        'chat-list-screen', 'instagram-screen', 'x-social-screen', 'api-settings-screen',
        'world-book-screen', 'customize-screen', 'mailbox-screen', 'have-you-eaten-screen',
        'night-mode-btn', 'forum-screen', 'console-screen', 'pomodoro-screen', 'storage-analysis-screen', 'widget-market-screen', 'reader-bookshelf-screen', 'vocab-book-screen', 'placeholder-app', 'calendar-screen'
    ];

    let iconsContentHTML = '';
    iconOrder.forEach(id => {
        if (!defaultIcons[id]) return;
        const { name, url } = defaultIcons[id];
        const currentIcon = (db.customIcons && db.customIcons[id]) || url;
        iconsContentHTML += `
        <div class="kkt-item">
            <div class="kkt-item-label">
                <img src="${currentIcon}" alt="${name}" class="kkt-small-avatar" id="icon-preview-${id}" style="width: 40px; height: 40px; border-radius: 10px; margin-right: 10px; object-fit: cover;">
                <span>${name || '模式切换'}</span>
            </div>
            <div class="kkt-item-control" style="gap: 8px;">
                <input type="url" placeholder="URL" value="${(db.customIcons && db.customIcons[id]) || ''}" data-icon-id="${id}" style="text-align:right; border:none; background:transparent; width: 100px; font-size: 13px; color: #888;">
                <input type="file" id="upload-icon-${id}" data-icon-id="${id}" accept="image/*" style="display:none;" class="icon-upload-input">
                <label for="upload-icon-${id}" class="btn btn-small btn-neutral" style="padding: 4px 8px; font-size: 12px; margin: 0; cursor: pointer;">📷</label>
                <button type="button" class="reset-icon-btn btn btn-small" data-id="${id}" style="padding: 4px 8px; font-size: 12px; margin: 0; background-color: #f0f0f0; color: #666; border:none;">↺</button>
            </div>
        </div>`;
    });

    const appearanceSection = `
    <div class="kkt-group-title" style="margin-left: 15px; margin-bottom: 8px; font-size: 13px; color: #666;">界面与外观</div>
    <div class="kkt-group">
        <!-- 切换模式（三选一：B 原生 / A / C purr 微信风） -->
        <div class="kkt-item" id="ui-mode-item">
            <div class="kkt-item-content">
                <div class="kkt-item-title">切换模式</div>
                <div class="kkt-item-subtitle">B 原生 · A · C（purr 微信风），切换后刷新</div>
            </div>
            <div class="ui-mode-seg" id="ui-mode-seg">
                <button type="button" data-mode="mie" class="${(db.uiMode || 'mie') === 'mie' ? 'on' : ''}">B</button>
                <button type="button" data-mode="a" class="${db.uiMode === 'a' ? 'on' : ''}">A</button>
                <button type="button" data-mode="c" class="${db.uiMode === 'c' ? 'on' : ''}">C</button>
            </div>
        </div>

        <!-- 灵动岛开关 -->
        <div class="kkt-item">
            <div class="kkt-item-content">
                <div class="kkt-item-title">灵动岛</div>
                <div class="kkt-item-subtitle">屏幕顶部小胶囊，六只像素小蟹轮播</div>
            </div>
            <label class="a-mode-switch" onclick="event.stopPropagation();">
                <input type="checkbox" id="island-toggle" ${window.AIsland && window.AIsland.isOn() ? 'checked' : ''} onchange="if(window.AIsland) window.AIsland.setOn(this.checked)">
                <span class="a-mode-switch-slider"></span>
            </label>
        </div>

        <!-- 字体大小 -->
        <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding: 15px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div class="kkt-item-content" style="flex:1;">
                    <div class="kkt-item-title">全局字体大小</div>
                    <div class="kkt-item-subtitle">调整应用内文字的缩放比例</div>
                </div>
                <span id="font-size-value" style="color: var(--primary-color); font-weight: bold; font-size: 16px;">${(db.fontSizeScale || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" id="font-size-slider" min="0.8" max="1.5" step="0.1" value="${db.fontSizeScale || 1.0}" style="width: 100%; accent-color: var(--primary-color); margin-top: 4px;">
        </div>

        <!-- 字体设置 -->
        <div class="kkt-item" onclick="document.getElementById('font-settings-modal').classList.add('visible')" style="cursor: pointer;">
            <div class="kkt-item-content">
                <div class="kkt-item-title">自定义字体</div>
                <div class="kkt-item-subtitle">上传或输入字体链接</div>
            </div>
            <span class="kkt-arrow">›</span>
        </div>

        <!-- 全局CSS -->
        <div class="kkt-item" onclick="document.getElementById('global-css-modal').classList.add('visible')" style="cursor: pointer;">
            <div class="kkt-item-content">
                <div class="kkt-item-title">全局CSS美化</div>
                <div class="kkt-item-subtitle">自定义应用全局样式</div>
            </div>
            <span class="kkt-arrow">›</span>
        </div>

        <!-- 开屏动画 -->
        <div class="kkt-item" onclick="openMieSplashSettings()" style="cursor: pointer;">
            <div class="kkt-item-content">
                <div class="kkt-item-title">开屏动画</div>
                <div class="kkt-item-subtitle">停留时间、背景图（擦雾水波效果保留）</div>
            </div>
            <span class="kkt-arrow">›</span>
        </div>
    </div>
    `;

    const soundSectionHTML = `
    <div class="kkt-group-title" style="margin-left: 15px; margin-bottom: 8px; font-size: 13px; color: #666; margin-top: 20px;">声音与振动</div>
    <div class="kkt-group">
        <div class="kkt-item" onclick="document.getElementById('sound-settings-modal').classList.add('visible')" style="cursor: pointer;">
            <div class="kkt-item-content">
                <div class="kkt-item-title">消息提示音</div>
                <div class="kkt-item-subtitle">发送与接收消息的音效</div>
            </div>
            <span class="kkt-arrow">›</span>
        </div>
    </div>
    `;

    const iconsSectionHTML = `
    <div class="kkt-group-title" style="margin-left: 15px; margin-bottom: 8px; font-size: 13px; color: #666; margin-top: 20px;">个性化</div>
    <div class="kkt-group">
        <div class="kkt-item" onclick="document.getElementById('icon-settings-modal').classList.add('visible')" style="cursor: pointer;">
            <div class="kkt-item-content">
                <div class="kkt-item-title">自定义图标</div>
                <div class="kkt-item-subtitle">修改主页应用图标</div>
            </div>
            <span class="kkt-arrow">›</span>
        </div>
    </div>
    `;

    const noteSectionHTML = `
    <div class="kkt-group-title" style="margin-left: 15px; margin-bottom: 8px; font-size: 13px; color: #666; margin-top: 20px;">小纸条</div>
    <div class="kkt-group">
        <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding: 15px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="kkt-item-content" style="flex:1;">
                    <div class="kkt-item-title">纸条字体</div>
                    <div class="kkt-item-subtitle">你手写纸条时纸上的字迹（角色的纸条跟信箱设置走）</div>
                </div>
                <select id="note-font-select" style="width:132px;padding:6px 8px;border:none;background:transparent;font-size:13px;text-align:right;color:#888;"></select>
            </div>
            <div id="note-font-preview" style="margin-top:12px;font-size:17px;line-height:1.6;color:#333;">示例：放学别走，我有话跟你说</div>
        </div>
    </div>
    `;

    container.innerHTML = appearanceSection + soundSectionHTML + iconsSectionHTML + noteSectionHTML;
    customizeForm.appendChild(container);

    // 注入模态框 HTML 到 body (如果不存在)
    if (!document.getElementById('font-settings-modal')) {
        const modalsHTML = `
        <!-- 字体设置模态框 -->
        <div id="font-settings-modal" class="modal-overlay">
            <div class="modal-window" style="max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">自定义字体</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('font-settings-modal').classList.remove('visible')">✕</button>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <input type="text" id="customize-font-url" placeholder="例如：https://example.com/font.woff2" value="${db.fontUrl && db.fontUrl.startsWith('CustomFont_') ? '[本地字体] 已应用' : (db.fontUrl || '')}" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size: 14px;">
                </div>
                <div class="form-group" style="margin-top: 10px;">
                    <input type="file" id="local-font-upload" accept=".ttf,.woff,.woff2,.otf" style="display: none;">
                    <label for="local-font-upload" class="btn btn-secondary" style="display: block; text-align: center; cursor: pointer; padding: 10px; border-radius: 8px; border: 1px dashed #ccc; background: #fafafa; color: #666;">
                        <span style="font-size: 16px; margin-right: 5px;">📁</span> 从本地上传字体文件
                    </label>
                </div>
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-top:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="font-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="font-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="font-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="font-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="font-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
                <div style="display:flex; gap:10px; justify-content: flex-end; margin-top: 15px;">
                    <button type="button" id="restore-font-btn" class="btn btn-neutral btn-small">恢复默认</button>
                    <button type="button" id="apply-font-btn" class="btn btn-primary btn-small">直接应用</button>
                </div>
            </div>
        </div>

        <!-- 全局CSS模态框 -->
        <div id="global-css-modal" class="modal-overlay">
            <div class="modal-window" style="max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">全局CSS美化</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('global-css-modal').classList.remove('visible')">✕</button>
                </div>
                <div class="form-group" style="margin-top: 15px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label for="global-beautification-css" style="font-weight: bold; font-size: 14px; color: var(--primary-color); margin-bottom: 0;">CSS代码</label>
                        <button type="button" id="apply-global-css-now-btn" class="btn btn-primary btn-small" style="width:auto;">立即应用</button>
                    </div>
                    <textarea id="global-beautification-css" class="form-group" rows="8" placeholder="在此输入CSS代码..." style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-family: monospace; font-size: 12px;"></textarea>
                </div>
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="global-css-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="global-css-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">-- 选择 --</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="global-css-apply-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="global-css-save-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="global-css-manage-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 开屏动画设置模态框 -->
        <div id="splash-settings-modal" class="modal-overlay">
            <div class="modal-window" style="max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">开屏动画</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('splash-settings-modal').classList.remove('visible')">✕</button>
                </div>

                <div class="form-group" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid #f5f5f5;">
                    <div>
                        <label style="font-weight:bold; font-size:13px; color:#333; margin-bottom:0;">显示开屏动画</label>
                        <p style="font-size:11px; color:#999; margin:4px 0 0;">关闭后打开应用不再显示</p>
                    </div>
                    <label class="kkt-switch">
                        <input type="checkbox" id="splash-enabled-toggle">
                        <span class="kkt-slider"></span>
                    </label>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                        <label style="font-weight:bold; font-size:13px; color:#333; margin-bottom:0;">停留时间</label>
                        <span id="splash-duration-value" style="color:#3d7ea6; font-weight:bold; font-size:14px;">7 秒</span>
                    </div>
                    <input type="range" id="splash-duration-slider" min="3" max="20" step="1" value="7" style="width:100%; accent-color: var(--primary-color);">
                    <p style="font-size:11px; color:#999; margin:4px 0 0;">到时间后自动淡出；点开屏上的 ENTER 可提前结束</p>
                </div>

                <div class="form-group" style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid #f5f5f5;">
                    <div>
                        <label style="font-weight:bold; font-size:13px; color:#333; margin-bottom:0;">不自动消失</label>
                        <p style="font-size:11px; color:#999; margin:4px 0 0;">开启后开屏会一直显示，直到点击 ENTER</p>
                    </div>
                    <label class="kkt-switch">
                        <input type="checkbox" id="splash-stay-toggle">
                        <span class="kkt-slider"></span>
                    </label>
                </div>

                <div class="form-group" style="margin-top: 16px; border-top: 1px solid #f5f5f5; padding-top: 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <label style="font-weight:bold; font-size:13px; color:#333; margin-bottom:0;">开屏文字</label>
                        <button type="button" id="splash-reset-text-btn" class="btn btn-small btn-neutral" style="margin:0; padding:4px 10px;">恢复默认文字</button>
                    </div>

                    <label for="splash-quotes-input" style="font-size:12px; color:#666; display:block; margin-bottom:4px;">擦开后显示的文字</label>
                    <textarea id="splash-quotes-input" rows="7" placeholder="起雾了。&#10;你在玻璃那边，我在这边。" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size:13px; line-height:1.6; resize:vertical; box-sizing:border-box;"></textarea>
                    <p style="font-size:11px; color:#999; margin:4px 0 0;">空一行分一段，最多 12 段；每段会散在雾后不同位置。</p>

                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <div style="flex:1;">
                            <label for="splash-intro-en" style="font-size:12px; color:#666; display:block; margin-bottom:4px;">左上角英文提示</label>
                            <input type="text" id="splash-intro-en" maxlength="60" placeholder="TOUCH THE GLASS." style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px 10px; font-size:13px; box-sizing:border-box;">
                        </div>
                        <div style="flex:1;">
                            <label for="splash-intro-cn" style="font-size:12px; color:#666; display:block; margin-bottom:4px;">左上角中文提示</label>
                            <input type="text" id="splash-intro-cn" maxlength="60" placeholder="用手指擦开这层雾。" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px 10px; font-size:13px; box-sizing:border-box;">
                        </div>
                    </div>

                    <div style="margin-top:10px;">
                        <label for="splash-title-input" style="font-size:12px; color:#666; display:block; margin-bottom:4px;">手写标题</label>
                        <input type="text" id="splash-title-input" maxlength="16" placeholder="Mist" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px 10px; font-size:13px; box-sizing:border-box;">
                        <p style="font-size:11px; color:#999; margin:4px 0 0;">建议用英文；留空则不显示。</p>
                    </div>

                    <button type="button" id="splash-save-text-btn" class="btn btn-primary btn-small" style="width:100%; margin-top:10px;">保存文字</button>
                    <p style="font-size:11px; color:#999; margin:6px 0 0;">换文字后会改用系统衬线字体（原字体只包含默认文案的字形）。</p>
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <label style="font-weight:bold; font-size:13px; color:#333; margin-bottom:0;">擦开底色</label>
                        <button type="button" id="splash-reset-reveal-btn" class="btn btn-small btn-neutral" style="margin:0; padding:4px 10px;">恢复默认</button>
                    </div>
                    <div id="splash-reveal-swatches" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;"></div>
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <label style="font-weight:bold; font-size:13px; color:#333;">背景图</label>
                    <div id="splash-bg-preview" style="height:190px; border-radius:12px; background:#719AE0 center/cover no-repeat; margin-top:8px; border:1px solid #eee;"></div>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <input type="file" id="splash-bg-upload" accept="image/*" style="display:none;">
                        <label for="splash-bg-upload" class="btn btn-small btn-primary" style="margin:0; cursor:pointer; padding:8px 14px;">上传图片</label>
                        <button type="button" id="splash-reset-bg-btn" class="btn btn-small btn-neutral" style="margin:0; padding:8px 14px;">恢复默认</button>
                    </div>
                    <p style="font-size:11px; color:#999; margin:6px 0 0;">图片会压缩后保存在本机；竖图效果最好，横图会自动裁切。</p>
                </div>

                <div style="display:flex; gap:10px; margin-top:18px;">
                    <button type="button" id="splash-preview-btn" class="btn btn-primary" style="flex:1;">预览开屏</button>
                </div>
                <p style="font-size:11px; color:#999; text-align:center; margin:10px 0 0;">设置立即保存，下次打开应用生效</p>
            </div>
        </div>

        <!-- 提示音设置模态框 -->
        <div id="sound-settings-modal" class="modal-overlay">
            <div class="modal-window" style="max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">消息提示音</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('sound-settings-modal').classList.remove('visible')">✕</button>
                </div>
                <div class="form-group" style="margin-top: 15px; margin-bottom: 15px;">
                    <label style="font-weight: bold; font-size: 13px; color: #333;">开始生成提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-send-sound-url" placeholder="音频URL" value="${db.globalSendSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px; font-size: 13px;">
                        <input type="file" id="global-send-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-send-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-send-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-send-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-weight: bold; font-size: 13px; color: #333;">收到回复提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-receive-sound-url" placeholder="音频URL" value="${db.globalReceiveSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px; font-size: 13px;">
                        <input type="file" id="global-receive-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-receive-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-receive-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-receive-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                </div>
                
                <div class="form-group" style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <label for="multi-msg-sound-switch" style="font-weight: bold; font-size: 13px; color: #333; margin-bottom: 0;">多条消息连续提示音</label>
                    <label class="kkt-switch">
                        <input type="checkbox" id="multi-msg-sound-switch" ${db.multiMsgSoundEnabled ? 'checked' : ''}>
                        <span class="kkt-slider"></span>
                    </label>
                </div>
                <p style="font-size: 12px; color: #999; margin-top: 5px;">开启后，AI 连续回复的多条消息都会触发提示音。</p>

                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-top:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="sound-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="sound-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="sound-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="sound-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="sound-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 自定义图标模态框 -->
        <div id="icon-settings-modal" class="modal-overlay">
            <div class="modal-window" style="max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">自定义图标</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('icon-settings-modal').classList.remove('visible')">✕</button>
                </div>
                <div class="icon-settings-content" style="border-top: 1px solid #f5f5f5; padding-top: 15px;">
                    ${iconsContentHTML}
                </div>
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-top:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="icon-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="icon-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="icon-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">加载</button>
                        <button type="button" id="icon-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="icon-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 图标预设管理模态框 -->
        <div id="icon-presets-modal" class="modal-overlay" style="display:none;">
            <div class="modal-window" style="max-height: 70vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">图标预设管理</h3>
                    <button class="icon-btn-simple" onclick="document.getElementById('icon-presets-modal').style.display='none'">✕</button>
                </div>
                <div id="icon-presets-list" style="max-height:50vh;overflow:auto;"></div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
    } else {
        const iconModalWindow = document.getElementById('icon-settings-modal')?.querySelector('.modal-window');
        if (iconModalWindow) {
            const iconListDiv = iconModalWindow.querySelector('.icon-settings-content');
            if (iconListDiv) {
                iconListDiv.innerHTML = iconsContentHTML;
            }
        }
        const globalCssTextarea = document.getElementById('global-beautification-css');
        if (globalCssTextarea) {
            globalCssTextarea.value = db.globalCss || '';
        }
    }

    populateGlobalCssPresetSelect();
    populateFontPresetSelect();
    populateSoundPresetSelect();
    populateIconPresetSelect();
    populateNoteFontSelect();

    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    // 液态玻璃滑杆：把当前值换算成粉色液体的填充比例（--fill）
    const syncFontSliderFill = (el) => {
        const min = parseFloat(el.min) || 0;
        const max = parseFloat(el.max) || 100;
        const pct = ((parseFloat(el.value) - min) / (max - min || 1)) * 100;
        el.style.setProperty('--fill', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
    };
    if (fontSizeSlider) {
        syncFontSliderFill(fontSizeSlider);
        fontSizeSlider.addEventListener('input', (e) => {
            syncFontSliderFill(e.target);
            const scale = parseFloat(e.target.value);
            fontSizeValue.textContent = `${scale.toFixed(1)}x`;
            applyFontSize(scale);
        });
        fontSizeSlider.addEventListener('change', async (e) => {
            const scale = parseFloat(e.target.value);
            db.fontSizeScale = scale;
            await saveData();
            showToast('字体大小已保存');
        });
    }

    // 模式切换（三选一）：点击后写入 db.uiMode 并刷新
    const uiModeSeg = document.getElementById('ui-mode-seg');
    if (uiModeSeg) {
        uiModeSeg.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-mode]');
            if (!btn) return;
            const mode = btn.dataset.mode;
            const current = db.uiMode || 'mie';
            if (mode === current) return;
            if (typeof CMode !== 'undefined' && CMode.setMode) {
                CMode.setMode(mode);
            } else {
                db.uiMode = mode;
                try { localStorage.setItem('mie_ui_mode', mode); } catch (err) { /* ignore */ }
                saveData().then(() => setTimeout(() => location.reload(), 600));
            }
        });
    }

    const globalCssTextarea = document.getElementById('global-beautification-css');
    if (globalCssTextarea) {
        globalCssTextarea.value = db.globalCss || '';
    }
}

function populateIconPresetSelect() {
    const select = document.getElementById('icon-preset-select');
    if (!select) return;
    const presets = db.iconPresets || [];
    select.innerHTML = '<option value="">— 选择 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function saveCurrentIconsAsPreset() {
    const icons = db.customIcons ? JSON.parse(JSON.stringify(db.customIcons)) : {};
    if (!Object.keys(icons).length) return showToast('当前没有自定义图标，无法保存');

    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;

    if (!db.iconPresets) db.iconPresets = [];
    const idx = db.iconPresets.findIndex(p => p.name === name);
    const preset = { name, icons };

    if (idx >= 0) db.iconPresets[idx] = preset;
    else db.iconPresets.push(preset);

    saveData();
    populateIconPresetSelect();
    showToast('图标预设已保存');
}

async function applyIconPreset(name) {
    const presets = db.iconPresets || [];
    const preset = presets.find(p => p.name === name);
    if (!preset) return showToast('未找到该预设');

    db.customIcons = JSON.parse(JSON.stringify(preset.icons));
    await saveData();
    renderCustomizeForm();
    setupHomeScreen();
    showToast('图标预设已应用');
}

function openIconManageModal() {
    const modal = document.getElementById('icon-presets-modal');
    const list = document.getElementById('icon-presets-list');
    if (!modal || !list) return;

    list.innerHTML = '';
    const presets = db.iconPresets || [];
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    } else {
        presets.forEach((p, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f0f0f0;';

            const count = Object.keys(p.icons || {}).length;
            row.innerHTML = `
                <span style="font-size:14px;">${p.name} <span style="color:#999;font-size:12px;">(${count}个图标)</span></span>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-small btn-primary" data-icon-preset-apply="${idx}" style="padding:4px 8px;font-size:12px;">加载</button>
                    <button class="btn btn-small btn-danger" data-icon-preset-delete="${idx}" style="padding:4px 8px;font-size:12px;">删除</button>
                </div>
            `;
            list.appendChild(row);
        });
    }

    modal.style.display = '';
    modal.classList.add('visible');

    list.onclick = async (e) => {
        const applyBtn = e.target.closest('[data-icon-preset-apply]');
        if (applyBtn) {
            const idx = parseInt(applyBtn.dataset.iconPresetApply);
            const preset = db.iconPresets[idx];
            if (preset) {
                db.customIcons = JSON.parse(JSON.stringify(preset.icons));
                await saveData();
                renderCustomizeForm();
                setupHomeScreen();
                modal.classList.remove('visible');
                showToast('图标预设已应用');
            }
            return;
        }
        const deleteBtn = e.target.closest('[data-icon-preset-delete]');
        if (deleteBtn) {
            const idx = parseInt(deleteBtn.dataset.iconPresetDelete);
            if (confirm('确定删除此预设？')) {
                db.iconPresets.splice(idx, 1);
                await saveData();
                populateIconPresetSelect();
                openIconManageModal();
                showToast('预设已删除');
            }
        }
    };
}
