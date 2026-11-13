// --- 预设管理逻辑 (气泡、人设、字体、提示音、全局CSS) ---

function _getBubblePresets() {
    return db.bubbleCssPresets || [];
}
function _saveBubblePresets(arr) {
    db.bubbleCssPresets = arr || [];
    saveData();
}

function populateBubblePresetSelect(selectId) { 
    const sel = document.getElementById(selectId); 
    if (!sel) return;
    const presets = _getBubblePresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

async function applyPresetToCurrentChat(presetName) {
    const presets = _getBubblePresets();
    const preset = presets.find(p => p.name === presetName);
    if (!preset) { showToast('未找到该预设'); return; }
    
    let textarea;
    let authorNoteDiv;
    if (currentChatType === 'private') {
        textarea = document.getElementById('setting-custom-bubble-css');
        authorNoteDiv = document.getElementById('private-bubble-author-note');
    } else {
        textarea = document.getElementById('setting-group-custom-bubble-css');
        authorNoteDiv = document.getElementById('group-bubble-author-note');
    }
    if (textarea) textarea.value = preset.css;
    
    if (authorNoteDiv) {
        if (preset.authorNote && preset.authorNote.trim() !== '') {
            authorNoteDiv.textContent = `作者注释：${preset.authorNote}`;
            authorNoteDiv.style.display = 'block';
        } else {
            authorNoteDiv.style.display = 'none';
            authorNoteDiv.textContent = '';
        }
    }

    try {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chat) {
            chat.customBubbleCss = preset.css;
            chat.useCustomBubbleCss = true;
            if (currentChatType === 'private') {
                document.getElementById('setting-use-custom-css').checked = true;
                document.getElementById('setting-custom-bubble-css').disabled = false;
            } else {
                document.getElementById('setting-group-use-custom-css').checked = true;
                document.getElementById('setting-group-custom-bubble-css').disabled = false;
            }
            
            if (preset.settings) {
                if (preset.settings.theme !== undefined) chat.theme = preset.settings.theme;
                if (preset.settings.chatBg !== undefined) {
                    chat.chatBg = preset.settings.chatBg;
                    const chatRoomScreen = document.getElementById('chat-room-screen');
                    if (chatRoomScreen) {
                        if (chat.chatBg) {
                            chatRoomScreen.style.backgroundImage = `url(${chat.chatBg})`;
                        } else {
                            chatRoomScreen.style.backgroundImage = '';
                        }
                    }
                }
                if (preset.settings.bilingualModeEnabled !== undefined) chat.bilingualModeEnabled = preset.settings.bilingualModeEnabled;
                if (preset.settings.bilingualBubbleStyle !== undefined) chat.bilingualBubbleStyle = preset.settings.bilingualBubbleStyle;
                if (preset.settings.avatarMode !== undefined) chat.avatarMode = preset.settings.avatarMode;
                if (preset.settings.avatarRadius !== undefined) chat.avatarRadius = preset.settings.avatarRadius;
                if (preset.settings.bubbleBlurEnabled !== undefined) chat.bubbleBlurEnabled = preset.settings.bubbleBlurEnabled;
                if (preset.settings.titleLayout !== undefined) chat.titleLayout = preset.settings.titleLayout;
                if (preset.settings.showTimestamp !== undefined) chat.showTimestamp = preset.settings.showTimestamp;
                if (preset.settings.timestampStyle !== undefined) chat.timestampStyle = preset.settings.timestampStyle;
                
                if (currentChatType === 'private' && typeof loadSettingsToSidebar === 'function') {
                    loadSettingsToSidebar();
                } else if (currentChatType === 'group' && typeof loadGroupSettingsToSidebar === 'function') {
                    loadGroupSettingsToSidebar();
                }
                
                if (typeof renderMessages === 'function') {
                    renderMessages(false, true);
                }
            }
        }
    } catch(e){
        console.warn('applyPresetToCurrentChat: cannot write to db object', e);
    }

    try {
        // updateCustomBubbleStyle(window.currentChatId || null, preset.css, true);
        
        let previewBox;
        if (currentChatType === 'private') {
            previewBox = document.getElementById('private-bubble-css-preview');
        } else {
            previewBox = document.getElementById('group-bubble-css-preview');
        }

        if (previewBox) {
            const themeKey = (currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId).theme : db.groups.find(g => g.id === currentChatId).theme) || 'white_pink';
            updateBubbleCssPreview(previewBox, preset.css, false, colorThemes[themeKey]);
        }
        showToast('预设已应用到当前聊天并保存');
        await saveData();
    } catch(e){
        console.error('applyPresetToCurrentChat error', e);
    }
}

function saveCurrentTextareaAsPreset() {
    const textarea = document.getElementById('setting-custom-bubble-css') || document.getElementById('setting-group-custom-bubble-css');
    if (!textarea) return showToast('找不到自定义 CSS 文本框');
    const css = textarea.value.trim();
    
    let name = prompt('请输入预设名称（将覆盖同名预设）:');
    if (!name) return;
    
    const includeSettings = confirm('是否连带当前的各项美化设置（主题、聊天背景、头像圆角、气泡模糊等）一起保存进预设？');
    
    let settings = null;
    if (includeSettings) {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chat) {
            settings = {
                theme: document.getElementById('setting-theme-color') ? document.getElementById('setting-theme-color').value : chat.theme,
                chatBg: chat.chatBg,
                bilingualModeEnabled: document.getElementById('setting-bilingual-mode') ? document.getElementById('setting-bilingual-mode').checked : chat.bilingualModeEnabled,
                bilingualBubbleStyle: document.getElementById('setting-bilingual-style') ? document.getElementById('setting-bilingual-style').value : chat.bilingualBubbleStyle,
                avatarMode: document.getElementById('setting-avatar-mode') ? document.getElementById('setting-avatar-mode').value : chat.avatarMode,
                avatarRadius: document.getElementById('setting-avatar-radius') ? parseInt(document.getElementById('setting-avatar-radius').value, 10) : chat.avatarRadius,
                bubbleBlurEnabled: document.getElementById('setting-bubble-blur') ? document.getElementById('setting-bubble-blur').checked : chat.bubbleBlurEnabled,
                titleLayout: document.getElementById('setting-title-layout') ? document.getElementById('setting-title-layout').value : chat.titleLayout,
                showTimestamp: document.getElementById('setting-show-timestamp') ? document.getElementById('setting-show-timestamp').checked : chat.showTimestamp,
                timestampStyle: document.getElementById('setting-timestamp-style') ? document.getElementById('setting-timestamp-style').value : chat.timestampStyle
            };
        }
    }

    const presets = _getBubblePresets();
    const idx = presets.findIndex(p => p.name === name);
    
    const presetData = { name, css };
    if (settings) {
        presetData.settings = settings;
    }
    
    if (idx >= 0) {
        presets[idx].css = css;
        if (settings) presets[idx].settings = settings;
        else delete presets[idx].settings;
    } else {
        presets.push(presetData);
    }
    
    _saveBubblePresets(presets);
    populateBubblePresetSelect('bubble-preset-select'); 
    populateBubblePresetSelect('group-bubble-preset-select');
    showToast('预设已保存');
}

/* ===== 自定义气泡预设：选择弹窗 / 预览弹窗 / 全屏管理页 ===== */

// 原尺寸预览弹窗：img 不设宽高 → 上传什么形状（正方形/长方形）就按什么尺寸显示
function openBubblePresetPreview(presetName) {
    const presets = _getBubblePresets();
    const preset = presets.find(p => p.name === presetName);
    if (!preset) return showToast('未找到该预设');
    if (!preset.previewImg) {
        return showToast('该预设还没有预览图，可在气泡库右上角 ＋ → 管理聊天预设里上传');
    }
    let ov = document.getElementById('bubble-preset-preview-modal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'bubble-preset-preview-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.style.display = 'none'; });
    }
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:92vw;max-height:82vh;overflow:auto;padding:10px;position:relative;">'
        + '<button type="button" id="bpp-close" style="position:absolute;top:6px;right:8px;border:none;background:rgba(0,0,0,0.05);border-radius:50%;width:26px;height:26px;font-size:14px;color:#666;cursor:pointer;">✕</button>'
        + '<div style="text-align:center;font-size:14px;font-weight:600;color:#333;margin:4px 0 8px;">' + presetName + '</div>'
        + '<img src="' + preset.previewImg + '" alt="预设预览" style="display:block;max-width:none;">'
        + '</div>';
    ov.style.display = 'flex';
    ov.querySelector('#bpp-close').addEventListener('click', () => { ov.style.display = 'none'; });
}

// 选择预设弹窗：页面中间小弹窗，列出预设名，每个带「查看预览」与「应用」
function openBubblePresetPicker() {
    const presets = _getBubblePresets();
    if (!presets.length) return showToast('暂无预设，可先点「存」把当前气泡 CSS 保存为预设');
    let ov = document.getElementById('bubble-preset-picker-modal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'bubble-preset-picker-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.style.display = 'none'; });
    }
    const listHtml = presets.map(p =>
        '<div class="bpp-row" data-name="' + p.name.replace(/"/g, '&quot;') + '" style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid #f0f0f0;">'
        + '<div class="bpp-name" style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;color:#333;">' + p.name + '</div>'
        + '<button type="button" class="bpp-preview-btn mono-btn" style="padding:5px 10px;border-radius:8px;font-size:12px;">查看预览</button>'
        + '<button type="button" class="bpp-apply-btn mono-btn mono-btn-primary" style="padding:5px 10px;border-radius:8px;font-size:12px;">应用</button>'
        + '</div>').join('');
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:320px;max-width:88vw;max-height:70vh;display:flex;flex-direction:column;padding:14px;">'
        + '<div style="text-align:center;font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">选择预设</div>'
        + '<div style="flex:1;overflow-y:auto;">' + listHtml + '</div>'
        + '<button type="button" id="bpp-picker-close" class="mono-btn" style="margin-top:10px;width:100%;border-radius:10px;">取消</button>'
        + '</div>';
    ov.style.display = 'flex';
    ov.querySelectorAll('.bpp-row').forEach(row => {
        const name = row.dataset.name;
        row.querySelector('.bpp-preview-btn').addEventListener('click', () => openBubblePresetPreview(name));
        row.querySelector('.bpp-apply-btn').addEventListener('click', () => {
            ov.style.display = 'none';
            applyPresetToCurrentChat(name);
        });
    });
    ov.querySelector('#bpp-picker-close').addEventListener('click', () => { ov.style.display = 'none'; });
}

// 管理聊天预设：全屏页面（所有预设 + 上传预览图 / 重命名 / 删除）
let _bpfsTargetIdx = -1;
function openManagePresetsModal() {
    let ov = document.getElementById('bubble-presets-fullscreen');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'bubble-presets-fullscreen';
        ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#f2f3f7;display:none;flex-direction:column;';
        ov.innerHTML = '<div style="flex:none;display:flex;align-items:center;padding:12px 14px;background:#fff;border-bottom:0.5px solid rgba(0,0,0,0.08);">'
            + '<button type="button" id="bpfs-back" style="border:none;background:none;font-size:26px;line-height:1;color:#333;padding:0 8px;cursor:pointer;">‹</button>'
            + '<div style="flex:1;text-align:center;font-size:16px;font-weight:600;color:#111;margin-right:42px;">管理聊天预设</div>'
            + '</div>'
            + '<div id="bpfs-list" style="flex:1;overflow-y:auto;padding:14px;"></div>'
            + '<input type="file" id="bpfs-file" accept="image/*" style="display:none">';
        document.body.appendChild(ov);
        ov.querySelector('#bpfs-back').addEventListener('click', () => { ov.style.display = 'none'; });
        ov.querySelector('#bpfs-file').addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file || _bpfsTargetIdx < 0) return;
            try {
                const url = (typeof compressImage === 'function')
                    ? await compressImage(file, { quality: 0.85, maxWidth: 1600, maxHeight: 1600 }) // 保持原比例，仅限最大边
                    : await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
                const presets = _getBubblePresets();
                if (presets[_bpfsTargetIdx]) {
                    presets[_bpfsTargetIdx].previewImg = url;
                    _saveBubblePresets(presets);
                    showToast('预览图已保存（保持原比例尺寸）');
                }
                _renderBpfsList();
            } catch (err) {
                console.warn('[bubblePresets] 预览图保存失败', err);
                showToast('图片过大或保存失败，请换一张');
            }
            e.target.value = '';
        });
    }
    _renderBpfsList();
    ov.style.display = 'flex';
}

function _renderBpfsList() {
    const list = document.getElementById('bpfs-list');
    if (!list) return;
    list.innerHTML = '';
    const presets = _getBubblePresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:20px 0;text-align:center;">暂无预设<br><span style="font-size:12px;">在聊天设置页自定义气泡 CSS 后点「存」即可保存</span></p>';
        return;
    }
    presets.forEach((p, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05);';
        card.innerHTML = '<div style="display:flex;align-items:center;margin-bottom:8px;">'
            + '<div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:15px;font-weight:600;color:#111;">' + p.name + '</div>'
            + '</div>'
            + '<div class="bpfs-thumb" style="margin-bottom:10px;text-align:center;"></div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
            + '<button type="button" class="bpfs-upload-btn mono-btn" style="padding:6px 10px;border-radius:8px;font-size:12px;">上传预览图</button>'
            + '<button type="button" class="bpfs-view-btn mono-btn" style="padding:6px 10px;border-radius:8px;font-size:12px;">查看预览</button>'
            + '<button type="button" class="bpfs-rename-btn mono-btn" style="padding:6px 10px;border-radius:8px;font-size:12px;">重命名</button>'
            + '<button type="button" class="bpfs-del-btn mono-btn" style="padding:6px 10px;border-radius:8px;font-size:12px;color:#e53935;">删除</button>'
            + '</div>';
        // 缩略图（管理页里限高展示，点「查看预览」看原尺寸）
        const thumb = card.querySelector('.bpfs-thumb');
        if (p.previewImg) {
            thumb.innerHTML = '<img src="' + p.previewImg + '" alt="" style="max-width:100%;max-height:150px;width:auto;height:auto;border-radius:8px;">';
        } else {
            thumb.innerHTML = '<div style="color:#bbb;font-size:12px;padding:10px 0;">尚未上传预览图</div>';
        }
        card.querySelector('.bpfs-upload-btn').addEventListener('click', () => {
            _bpfsTargetIdx = idx;
            document.getElementById('bpfs-file').click();
        });
        card.querySelector('.bpfs-view-btn').addEventListener('click', () => openBubblePresetPreview(p.name));
        card.querySelector('.bpfs-rename-btn').addEventListener('click', () => {
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getBubblePresets();
            all[idx].name = newName;
            _saveBubblePresets(all);
            populateBubblePresetSelect('bubble-preset-select');
            populateBubblePresetSelect('group-bubble-preset-select');
            _renderBpfsList();
        });
        card.querySelector('.bpfs-del-btn').addEventListener('click', () => {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            const all = _getBubblePresets();
            all.splice(idx, 1);
            _saveBubblePresets(all);
            populateBubblePresetSelect('bubble-preset-select');
            populateBubblePresetSelect('group-bubble-preset-select');
            _renderBpfsList();
        });
        list.appendChild(card);
    });
}

function _getMyPersonaPresets() {
    return db.myPersonaPresets || [];
}
function _saveMyPersonaPresets(arr) {
    db.myPersonaPresets = arr || [];
    saveData();
}

function populateMyPersonaSelect() {
    const sel = document.getElementById('mypersona-preset-select');
    if (!sel) return;
    const presets = _getMyPersonaPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentMyPersonaAsPreset() {
    const personaEl = document.getElementById('setting-my-persona');
    const avatarEl = document.getElementById('setting-my-avatar-preview');
    if (!personaEl || !avatarEl) return showToast('找不到我的人设或头像控件');
    const persona = personaEl.value.trim();
    const avatar = avatarEl.src || '';
    if (!persona && !avatar) return showToast('人设和头像都为空，无法保存');
    const name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    const presets = _getMyPersonaPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, persona, avatar };
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    _saveMyPersonaPresets(presets);
    populateMyPersonaSelect();
    showToast('我的人设预设已保存');
}

async function applyMyPersonaPresetToCurrentChat(presetName) {
    const presets = _getMyPersonaPresets();
    const p = presets.find(x => x.name === presetName);
    if (!p) { showToast('未找到该预设'); return; }

    const personaEl = document.getElementById('setting-my-persona');
    const avatarEl = document.getElementById('setting-my-avatar-preview');
    if (personaEl) personaEl.value = p.persona || '';
    if (avatarEl) avatarEl.src = p.avatar || '';

    try {
        if (currentChatType === 'private') {
            const e = db.characters.find(c => c.id === currentChatId);
            if (e) {
                e.myPersona = p.persona || '';
                e.myAvatar = p.avatar || '';
                await saveData();
                showToast('预设已应用并保存到当前聊天');
                if (typeof loadSettingsToSidebar === 'function') try{ loadSettingsToSidebar(); }catch(e){}
                if (typeof renderChatList === 'function') try{ renderChatList(); }catch(e){}
            }
        } else {
            showToast('预设已应用到界面（未检测到当前聊天保存入口）');
        }
    } catch(err) {
        console.error('applyMyPersonaPresetToCurrentChat error', err);
    }
}

function openManageMyPersonaModal() {
    const modal = document.getElementById('mypersona-presets-modal');
    const list = document.getElementById('mypersona-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getMyPersonaPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyMyPersonaPresetToCurrentChat(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getMyPersonaPresets();
            all[idx].name = newName;
            _saveMyPersonaPresets(all);
            openManageMyPersonaModal();
            populateMyPersonaSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getMyPersonaPresets();
            all.splice(idx,1);
            _saveMyPersonaPresets(all);
            openManageMyPersonaModal();
            populateMyPersonaSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

function _getFontPresets() {
    return db.fontPresets || [];
}
function _saveFontPresets(arr) {
    db.fontPresets = arr || [];
    saveData();
}

function populateFontPresetSelect() {
    const sel = document.getElementById('font-preset-select');
    if (!sel) return;
    const presets = _getFontPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        if (p.isCustom && p.fontFamily) {
            opt.style.fontFamily = p.fontFamily;
        }
        sel.appendChild(opt);
    });
}

function saveCurrentFontAsPreset() {
    const fontUrlInput = document.getElementById('customize-font-url');
    if (!fontUrlInput) return showToast('找不到字体 URL 输入框');
    const url = fontUrlInput.value.trim();
    if (!url) return showToast('字体 URL 为空，无法保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getFontPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, url, isCustom: false };
    
    if (idx >= 0) presets[idx] = preset; 
    else presets.push(preset);
    
    _saveFontPresets(presets);
    populateFontPresetSelect();
    showToast('字体预设已保存');
}

async function applyFontPreset(name) {
    const presets = _getFontPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    
    const fontUrlInput = document.getElementById('customize-font-url');
    if (fontUrlInput) {
        fontUrlInput.value = p.isCustom ? '[本地字体] ' + p.name : (p.url || '');
    }
    
    if (p.isCustom) {
        db.fontUrl = p.fontFamily;
        await saveData();
        applyGlobalFont(p.fontFamily, true);
    } else {
        db.fontUrl = p.url;
        await saveData();
        applyGlobalFont(p.url, false);
    }
    showToast('已应用字体预设');
}

function openFontManageModal() {
    const modal = document.getElementById('font-presets-modal');
    const list = document.getElementById('font-presets-list');
    if (!modal || !list) return;
    
    list.innerHTML = '';
    const presets = _getFontPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        if (p.isCustom && p.fontFamily) {
            nameDiv.style.fontFamily = p.fontFamily;
        }
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyFontPreset(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getFontPresets();
            all[idx].name = newName;
            _saveFontPresets(all);
            openFontManageModal();
            populateFontPresetSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = async function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getFontPresets();
            const deletedPreset = all.splice(idx,1)[0];
            _saveFontPresets(all);
            
            if (deletedPreset.isCustom && deletedPreset.id) {
                try {
                    await dexieDB.customFonts.delete(deletedPreset.id);
                    document.fonts.forEach(font => {
                        if (font.family === deletedPreset.fontFamily) {
                            document.fonts.delete(font);
                        }
                    });
                } catch (e) {
                    console.error('Failed to delete custom font from DB:', e);
                }
            }
            
            openFontManageModal();
            populateFontPresetSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

function setupPresetFeatures() {
    const saveBtn = document.getElementById('api-save-preset');
    const manageBtn = document.getElementById('api-manage-presets');
    const applyBtn = document.getElementById('api-apply-preset');
    const select = document.getElementById('api-preset-select');
    const modalClose = document.getElementById('api-close-modal');
    const importBtn = document.getElementById('api-import-presets');
    const exportBtn = document.getElementById('api-export-presets');

    if (saveBtn) saveBtn.addEventListener('click', saveCurrentApiAsPreset);
    if (manageBtn) manageBtn.addEventListener('click', openApiManageModal);
    if (applyBtn) applyBtn.addEventListener('click', function(){ const v=select.value; if(!v) return showToast('请选择预设'); applyApiPreset(v); });
    if (modalClose) modalClose.addEventListener('click', function(){ document.getElementById('api-presets-modal').style.display='none'; });
    if (importBtn) importBtn.addEventListener('click', importApiPresets);
    if (exportBtn) exportBtn.addEventListener('click', exportApiPresets);
    
    const bubbleApplyBtn = document.getElementById('apply-preset-btn');
    const bubbleSaveBtn = document.getElementById('save-preset-btn');
    const bubbleManageBtn = document.getElementById('manage-presets-btn');
    const bubbleModalClose = document.getElementById('close-presets-modal');

    const groupBubbleApplyBtn = document.getElementById('group-apply-preset-btn');
    const groupBubbleSaveBtn = document.getElementById('group-save-preset-btn');
    const groupBubbleManageBtn = document.getElementById('group-manage-presets-btn');

    // 导出/导入相关元素
    const exportBubbleBtn = document.getElementById('export-preset-btn');
    const groupExportBubbleBtn = document.getElementById('group-export-preset-btn');
    const importBubbleBtn = document.getElementById('import-preset-btn');
    const groupImportBubbleBtn = document.getElementById('group-import-preset-btn');
    const bubbleImportInput = document.getElementById('bubble-preset-import-input');
    
    const exportModal = document.getElementById('export-bubble-preset-modal');
    const exportNameInput = document.getElementById('export-bubble-preset-name');
    const exportIncludeYes = document.getElementById('export-bubble-include-yes');
    const exportIncludeNo = document.getElementById('export-bubble-include-no');
    const exportAuthorNote = document.getElementById('export-bubble-author-note');
    const confirmExportBtn = document.getElementById('confirm-export-bubble-btn');
    const cancelExportBtn = document.getElementById('cancel-export-bubble-btn');
    
    let exportIncludeSettings = null; // null: 未选择, true: 是, false: 否

    function openExportModal() {
        exportNameInput.value = '';
        exportAuthorNote.value = '';
        exportIncludeSettings = null;
        exportIncludeYes.classList.remove('btn-primary');
        exportIncludeYes.classList.add('btn-neutral');
        exportIncludeNo.classList.remove('btn-primary');
        exportIncludeNo.classList.add('btn-neutral');
        confirmExportBtn.disabled = true;
        exportModal.style.display = 'flex';
    }

    if (exportIncludeYes) {
        exportIncludeYes.addEventListener('click', () => {
            exportIncludeSettings = true;
            exportIncludeYes.classList.remove('btn-neutral');
            exportIncludeYes.classList.add('btn-primary');
            exportIncludeNo.classList.remove('btn-primary');
            exportIncludeNo.classList.add('btn-neutral');
            confirmExportBtn.disabled = false;
        });
    }

    if (exportIncludeNo) {
        exportIncludeNo.addEventListener('click', () => {
            exportIncludeSettings = false;
            exportIncludeNo.classList.remove('btn-neutral');
            exportIncludeNo.classList.add('btn-primary');
            exportIncludeYes.classList.remove('btn-primary');
            exportIncludeYes.classList.add('btn-neutral');
            confirmExportBtn.disabled = false;
        });
    }

    if (cancelExportBtn) {
        cancelExportBtn.addEventListener('click', () => {
            exportModal.style.display = 'none';
        });
    }

    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', () => {
            const name = exportNameInput.value.trim();
            if (!name) return showToast('请输入预设名称');
            
            const textarea = currentChatType === 'private' ? document.getElementById('setting-custom-bubble-css') : document.getElementById('setting-group-custom-bubble-css');
            const css = textarea ? textarea.value.trim() : '';
            
            const presetData = {
                name: name,
                css: css,
                authorNote: exportAuthorNote.value.trim()
            };

            if (exportIncludeSettings) {
                const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
                if (chat) {
                    presetData.settings = {
                        theme: document.getElementById('setting-theme-color') ? document.getElementById('setting-theme-color').value : chat.theme,
                        chatBg: chat.chatBg,
                        bilingualModeEnabled: document.getElementById('setting-bilingual-mode') ? document.getElementById('setting-bilingual-mode').checked : chat.bilingualModeEnabled,
                        bilingualBubbleStyle: document.getElementById('setting-bilingual-style') ? document.getElementById('setting-bilingual-style').value : chat.bilingualBubbleStyle,
                        avatarMode: document.getElementById('setting-avatar-mode') ? document.getElementById('setting-avatar-mode').value : chat.avatarMode,
                        avatarRadius: document.getElementById('setting-avatar-radius') ? parseInt(document.getElementById('setting-avatar-radius').value, 10) : chat.avatarRadius,
                        bubbleBlurEnabled: document.getElementById('setting-bubble-blur') ? document.getElementById('setting-bubble-blur').checked : chat.bubbleBlurEnabled,
                        titleLayout: document.getElementById('setting-title-layout') ? document.getElementById('setting-title-layout').value : chat.titleLayout,
                        showTimestamp: document.getElementById('setting-show-timestamp') ? document.getElementById('setting-show-timestamp').checked : chat.showTimestamp,
                        timestampStyle: document.getElementById('setting-timestamp-style') ? document.getElementById('setting-timestamp-style').value : chat.timestampStyle
                    };
                }
            }

            const blob = new Blob([JSON.stringify(presetData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; 
            a.download = `bubble_preset_${name}.json`; 
            document.body.appendChild(a); 
            a.click(); 
            a.remove();
            URL.revokeObjectURL(url);
            
            exportModal.style.display = 'none';
            showToast('预设已导出');
        });
    }

    if (exportBubbleBtn) exportBubbleBtn.addEventListener('click', openExportModal);
    if (groupExportBubbleBtn) groupExportBubbleBtn.addEventListener('click', openExportModal);

    if (importBubbleBtn) importBubbleBtn.addEventListener('click', () => bubbleImportInput.click());
    if (groupImportBubbleBtn) groupImportBubbleBtn.addEventListener('click', () => bubbleImportInput.click());

    if (bubbleImportInput) {
        bubbleImportInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const fileName = file.name;
            const fileExt = fileName.split('.').pop().toLowerCase();
            const presetName = fileName.substring(0, fileName.lastIndexOf('.'));

            const processImportData = (data) => {
                try {
                    const presets = _getBubblePresets();
                    const idx = presets.findIndex(p => p.name === data.name);
                    if (idx >= 0) {
                        if (confirm(`已存在名为 "${data.name}" 的预设，是否覆盖？`)) {
                            presets[idx] = data;
                        } else {
                            return;
                        }
                    } else {
                        presets.push(data);
                    }
                    
                    _saveBubblePresets(presets);
                    populateBubblePresetSelect('bubble-preset-select'); 
                    populateBubblePresetSelect('group-bubble-preset-select');
                    showToast('预设导入成功');
                } catch(err) {
                    showToast('导入失败：' + err.message);
                } finally {
                    bubbleImportInput.value = '';
                }
            };

            if (fileExt === 'json') {
                const reader = new FileReader();
                reader.onload = function() {
                    try {
                        const data = JSON.parse(reader.result);
                        if (!data.name || typeof data.css === 'undefined') {
                            throw new Error('无效的预设文件格式');
                        }
                        processImportData(data);
                    } catch(err) {
                        showToast('导入失败：' + err.message);
                        bubbleImportInput.value = '';
                    }
                };
                reader.readAsText(file);
            } else if (fileExt === 'txt') {
                const reader = new FileReader();
                reader.onload = function() {
                    const text = reader.result;
                    // 简单检测是否乱码 (包含大量不可见字符或替换字符)
                    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text) && text.length > 10) {
                        showToast('检测到乱码，请确保文件编码为 UTF-8');
                        bubbleImportInput.value = '';
                        return;
                    }
                    processImportData({ name: presetName, css: text });
                };
                reader.readAsText(file);
            } else if (fileExt === 'docx') {
                if (typeof mammoth === 'undefined') {
                    showToast('缺少文档解析库，无法读取 docx');
                    bubbleImportInput.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(event) {
                    const arrayBuffer = event.target.result;
                    mammoth.extractRawText({arrayBuffer: arrayBuffer})
                        .then(function(result) {
                            const text = result.value;
                            processImportData({ name: presetName, css: text });
                        })
                        .catch(function(err) {
                            showToast('docx 解析失败：' + err.message);
                            bubbleImportInput.value = '';
                        });
                };
                reader.readAsArrayBuffer(file);
            } else if (fileExt === 'doc') {
                // 尝试强行读取旧版 doc
                const reader = new FileReader();
                reader.onload = function() {
                    const text = reader.result;
                    // 强行读取二进制文件通常会产生大量乱码
                    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text)) {
                        alert('检测到 .doc 文件包含乱码。旧版 .doc 为二进制格式，无法直接提取文本。请将其另存为 .docx 或 .txt 后再导入。');
                        bubbleImportInput.value = '';
                        return;
                    }
                    processImportData({ name: presetName, css: text });
                };
                reader.readAsText(file);
            } else {
                showToast('不支持的文件格式');
                bubbleImportInput.value = '';
            }
        });
    }

    if (bubbleApplyBtn) bubbleApplyBtn.addEventListener('click', () => {
        // 点击「选择预设」→ 居中小弹窗（预设名 + 查看预览 + 应用）
        openBubblePresetPicker();
    });
    if (bubbleSaveBtn) bubbleSaveBtn.addEventListener('click', saveCurrentTextareaAsPreset);
    if (bubbleManageBtn) bubbleManageBtn.addEventListener('click', openManagePresetsModal);
    if (bubbleModalClose) bubbleModalClose.addEventListener('click', () => {
        document.getElementById('bubble-presets-modal').style.display = 'none';
    });

    if (groupBubbleApplyBtn) groupBubbleApplyBtn.addEventListener('click', () => {
        openBubblePresetPicker();
    });
    if (groupBubbleSaveBtn) groupBubbleSaveBtn.addEventListener('click', saveCurrentTextareaAsPreset);
    if (groupBubbleManageBtn) groupBubbleManageBtn.addEventListener('click', openManagePresetsModal);

    const personaSaveBtn = document.getElementById('mypersona-save-btn');
    const personaManageBtn = document.getElementById('mypersona-manage-btn');
    const personaApplyBtn = document.getElementById('mypersona-apply-btn');
    const personaSelect = document.getElementById('mypersona-preset-select');
    const personaModalClose = document.getElementById('mypersona-close-modal');

    if (personaSaveBtn) personaSaveBtn.addEventListener('click', saveCurrentMyPersonaAsPreset);
    if (personaManageBtn) personaManageBtn.addEventListener('click', openManageMyPersonaModal);
    if (personaApplyBtn) personaApplyBtn.addEventListener('click', function(){ const v = personaSelect.value; if(!v) return showToast('请选择要应用的预设'); applyMyPersonaPresetToCurrentChat(v); });
    if (personaModalClose) personaModalClose.addEventListener('click', function(){ document.getElementById('mypersona-presets-modal').style.display='none'; });

    const globalCssModalClose = document.getElementById('global-css-close-modal');
    if (globalCssModalClose) globalCssModalClose.addEventListener('click', () => {
        document.getElementById('global-css-presets-modal').style.display = 'none';
    });

    const fontModalClose = document.getElementById('font-close-modal');
    if (fontModalClose) fontModalClose.addEventListener('click', () => {
        document.getElementById('font-presets-modal').style.display = 'none';
    });

    const soundModalClose = document.getElementById('sound-close-modal');
    if (soundModalClose) soundModalClose.addEventListener('click', () => {
        document.getElementById('sound-presets-modal').style.display = 'none';
    });
}

function populateGlobalCssPresetSelect() {
    const select = document.getElementById('global-css-preset-select');
    if (!select) return;
    select.innerHTML = '<option value="">— 选择预设 —</option>';
    (db.globalCssPresets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function openGlobalCssManageModal() {
    const modal = document.getElementById('global-css-presets-modal');
    const list = document.getElementById('global-css-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = db.globalCssPresets || [];
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function() {
            const newName = prompt('输入新名称：', p.name);
            if (!newName || newName === p.name) return;
            db.globalCssPresets[idx].name = newName;
            saveData();
            openGlobalCssManageModal();
            populateGlobalCssPresetSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '6px 8px';
        delBtn.textContent = '删除';
        delBtn.onclick = function() {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            db.globalCssPresets.splice(idx, 1);
            saveData();
            openGlobalCssManageModal();
            populateGlobalCssPresetSelect();
        };

        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(delBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function _getSoundPresets() {
    return db.soundPresets || [];
}
function _saveSoundPresets(arr) {
    db.soundPresets = arr || [];
    saveData();
}

function populateSoundPresetSelect() {
    const sel = document.getElementById('sound-preset-select');
    if (!sel) return;
    const presets = _getSoundPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentSoundAsPreset() {
    const sendUrl = document.getElementById('global-send-sound-url').value.trim();
    const receiveUrl = document.getElementById('global-receive-sound-url').value.trim();
    
    if (!sendUrl && !receiveUrl) return showToast('提示音配置为空，无法保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getSoundPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, sendSound: sendUrl, receiveSound: receiveUrl };
    
    if (idx >= 0) presets[idx] = preset; 
    else presets.push(preset);
    
    _saveSoundPresets(presets);
    populateSoundPresetSelect();
    showToast('提示音预设已保存');
}

function applySoundPreset(name) {
    const presets = _getSoundPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    
    const sendInput = document.getElementById('global-send-sound-url');
    const receiveInput = document.getElementById('global-receive-sound-url');
    
    if (sendInput) sendInput.value = p.sendSound || '';
    if (receiveInput) receiveInput.value = p.receiveSound || '';
    
    db.globalSendSound = p.sendSound || '';
    db.globalReceiveSound = p.receiveSound || '';
    saveData();
    
    showToast('已应用提示音预设');
}

function openSoundManageModal() {
    const modal = document.getElementById('sound-presets-modal');
    const list = document.getElementById('sound-presets-list');
    if (!modal || !list) return;
    
    list.innerHTML = '';
    const presets = _getSoundPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applySoundPreset(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getSoundPresets();
            all[idx].name = newName;
            _saveSoundPresets(all);
            openSoundManageModal();
            populateSoundPresetSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getSoundPresets();
            all.splice(idx,1);
            _saveSoundPresets(all);
            openSoundManageModal();
            populateSoundPresetSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}
