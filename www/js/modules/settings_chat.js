// --- 聊天设置与管理逻辑 ---

// ===== 聊天背景模糊度 =====

// 百分比 → 实际 blur 像素（100% = 30px 上限，再高就糊成马赛克了）
function chatBgBlurPx(percent) {
    return Math.round((Math.max(0, Math.min(100, percent)) / 100) * 30 * 10) / 10;
}

function setChatRoomBgImage(url) {
    const room = document.getElementById('chat-room-screen');
    if (!room) return;
    room.style.setProperty('--chat-bg-image', url ? `url("${url}")` : 'none');
}

function updateChatBgBlurLabel(percent) {
    const label = document.getElementById('setting-chat-bg-blur-value');
    if (label) label.textContent = percent + '%';
}

// 打开设置面板时按角色回填滑杆，并同步聊天室的模糊变量
function syncChatBgBlurUI(char) {
    const slider = document.getElementById('setting-chat-bg-blur');
    if (!slider) return;
    const v = (char && typeof char.chatBgBlur === 'number') ? char.chatBgBlur : 0;
    slider.value = v;
    updateChatBgBlurLabel(v);
    const chatRoomScreen = document.getElementById('chat-room-screen');
    if (chatRoomScreen) chatRoomScreen.style.setProperty('--chat-bg-blur', chatBgBlurPx(v) + 'px');
}

// ===== 专属模型：私聊与群聊共用 =====

function exclusiveApiPrefix(scope) {
    return scope === 'group' ? 'setting-group-exclusive-api' : 'setting-exclusive-api';
}

// 「专属模型」这一行跟着「使用专属模型」开关一起显隐
function setExclusiveModelRowVisible(scope, visible) {
    const row = document.getElementById(exclusiveApiPrefix(scope) + '-model-row');
    if (row) row.style.display = visible ? 'flex' : 'none';
}

// 打开设置时先把已存的模型填回去，避免列表没拉取就显示空
function renderExclusiveModelSelect(scope, savedModel) {
    const select = document.getElementById(exclusiveApiPrefix(scope) + '-model');
    if (!select) return;
    select.innerHTML = '';
    const opt = document.createElement('option');
    if (savedModel) {
        opt.value = savedModel;
        opt.textContent = savedModel;
        select.appendChild(opt);
    } else {
        opt.value = '';
        opt.textContent = '请先拉取模型';
        select.appendChild(opt);
    }
}

function fillExclusiveModelSelect(scope, models, keepValue) {
    const select = document.getElementById(exclusiveApiPrefix(scope) + '-model');
    if (!select) return;
    select.innerHTML = '';
    if (!models.length) {
        select.innerHTML = '<option value="">未找到可用模型</option>';
        return;
    }
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });
    if (keepValue && models.includes(keepValue)) select.value = keepValue;
}

// 用所选 API 预设自带的地址和密钥去拉模型列表
async function fetchExclusiveApiModels(scope) {
    const prefix = exclusiveApiPrefix(scope);
    const presetSelect = document.getElementById(prefix + '-preset-select');
    const fetchBtn = document.getElementById(prefix + '-fetch-btn');
    if (!presetSelect) return;

    const current = document.getElementById(prefix + '-model') ? document.getElementById(prefix + '-model').value : '';
    const preset = (db.apiPresets || []).find(p => p.name === presetSelect.value);
    const data = preset && preset.data ? preset.data : {};
    let apiUrl = (data.apiUrl || '').trim();
    const apiKey = (data.apiKey || '').trim();
    const provider = data.provider || 'newapi';

    if (!presetSelect.value) return showToast('请先选择 API 预设！');
    if (!apiUrl || !apiKey) return showToast('这个预设还没填 API 地址和密钥！');
    if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    if (typeof BLOCKED_API_DOMAINS !== 'undefined' && BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
        return showToast('该 API 站点已被屏蔽，无法使用！');
    }

    const endpoint = provider === 'gemini'
        ? `${apiUrl}/v1beta/models?key=${getRandomValue(apiKey)}`
        : `${apiUrl}/v1/models`;

    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.classList.add('loading');
    }
    try {
        const headers = provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` };
        const response = await fetch(endpoint, { method: 'GET', headers });
        if (!response.ok) {
            const err = new Error(`网络响应错误: ${response.status}`);
            err.response = response;
            throw err;
        }
        const payload = await response.json();
        const models = provider === 'gemini'
            ? (payload.models || []).map(m => m.name.replace('models/', ''))
            : (payload.data || []).map(m => m.id);
        // 当前选中的模型还在列表里就保留，否则退回预设自带的模型
        fillExclusiveModelSelect(scope, models, models.includes(current) ? current : (data.model || ''));
        showToast(models.length ? '模型列表拉取成功！' : '未找到可用模型');
    } catch (err) {
        console.error(err);
        if (typeof showApiError === 'function') showApiError(err);
        renderExclusiveModelSelect(scope, '');
        const select = document.getElementById(prefix + '-model');
        if (select) select.innerHTML = '<option value="">拉取失败</option>';
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.classList.remove('loading');
        }
    }
}

function setupChatSettings() {
    if (typeof injectChatSettingsHtml === 'function') {
        injectChatSettingsHtml();
    }

    const themeSelect = document.getElementById('setting-theme-color');
    themeSelect.innerHTML = '';
    Object.keys(colorThemes).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = colorThemes[key].name;
        themeSelect.appendChild(option);
    });

    // 角色设置风格：按角色即时切换并持久化
    const uiStyleSelect = document.getElementById('setting-char-ui-style');
    if (uiStyleSelect) {
        uiStyleSelect.addEventListener('change', () => {
            const e = db.characters.find(e => e.id === currentChatId);
            if (e) {
                e.uiStyle = uiStyleSelect.value;
                applySketchbookTheme(e);
                if (typeof saveData === 'function') saveData();
            }
        });
    }
    
    document.getElementById('chat-settings-btn').addEventListener('click', () => {
        if (currentChatType === 'private') {
            loadSettingsToSidebar();
            switchScreen('chat-settings-screen');
        } else if (currentChatType === 'group') {
            loadGroupSettingsToSidebar();
            switchScreen('group-settings-screen');
        }
    });

    const moreSettingsBtn = document.getElementById('more-settings-btn');
    if (moreSettingsBtn) {
        moreSettingsBtn.addEventListener('click', () => {
            switchScreen('api-settings-screen');
        });
    }
    
    document.querySelector('.phone-screen').addEventListener('click', e => {
        const openSidebar = document.querySelector('.settings-sidebar.open');
        if (openSidebar && !openSidebar.contains(e.target) && !e.target.closest('.action-btn') && !e.target.closest('.modal-overlay') && !e.target.closest('.action-sheet-overlay')) {
            openSidebar.classList.remove('open');
        }
    });

    document.getElementById('chat-settings-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentChatId) {
            showToast('错误：未选择角色');
            return;
        }
        try {
            await saveSettingsFromSidebar();
        } catch (err) {
            console.error('[保存设置] 失败:', err);
            showToast('保存失败：' + err.message);
        }
    });

    // --- Tab 切换逻辑 ---
    // 仅选择聊天设置和群聊设置中的 Tab，排除 CoT 设置
    const tabs = document.querySelectorAll('#chat-settings-screen .settings-tab-item, #group-settings-screen .settings-tab-item');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有 active 类
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // 添加当前 active 类
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            if (targetId) {
                const targetEl = document.getElementById(targetId);
                if (targetEl) targetEl.classList.add('active');
            }
            window.ClawdTemp?.mount();
        });
    });
    document.getElementById('setting-exclusive-reply').addEventListener('toggle', () => {
        window.ClawdTemp?.mount();
    });
    
    const useCustomCssCheckbox = document.getElementById('setting-use-custom-css'),
        customCssTextarea = document.getElementById('setting-custom-bubble-css'),
        resetCustomCssBtn = document.getElementById('reset-custom-bubble-css-btn'),
        privatePreviewBox = document.getElementById('private-bubble-css-preview');

    // 自定义气泡样式：点击标题行展开/收起（点右侧开关本身不触发展开）
    const bubbleFoldHead = document.getElementById('bubble-css-fold-head');
    if (bubbleFoldHead && !bubbleFoldHead.dataset.foldBound) {
        bubbleFoldHead.dataset.foldBound = '1';
        bubbleFoldHead.addEventListener('click', (ev) => {
            if (ev.target.closest('.mono-switch')) return;
            const body = document.getElementById('bubble-css-fold-body');
            const arrow = document.getElementById('bubble-css-fold-arrow');
            if (!body) return;
            const willOpen = body.style.display === 'none' || !body.style.display;
            body.style.display = willOpen ? 'block' : 'none';
            if (arrow) arrow.style.transform = willOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        });
    }

    useCustomCssCheckbox.addEventListener('change', (e) => {
        triggerHapticFeedback('light');
        customCssTextarea.disabled = !e.target.checked;
        const char = db.characters.find(c => c.id === currentChatId);
        if (char) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, customCssTextarea.value, !e.target.checked, theme);
        }
    });
    
    customCssTextarea.addEventListener('input', (e) => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char && useCustomCssCheckbox.checked) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, e.target.value, false, theme);
        }
    });
    
    resetCustomCssBtn.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char) {
            char.useCustomBubbleCss = false;
            char.customBubbleCss = '';
            char.bubbleThemeId = ''; /* 重置同时清掉气泡库选择 */
            customCssTextarea.value = '';
            useCustomCssCheckbox.checked = false;
            customCssTextarea.disabled = true;
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, '', true, theme);
            if (typeof applyBubbleThemeForChat === 'function') applyBubbleThemeForChat(currentChatId);
            if (typeof setupBubbleLibraryUI === 'function') setupBubbleLibraryUI('private');
            await saveData();
            showToast('样式已重置为默认（气泡库选择已清空）');
        }
    });
    
    document.getElementById('setting-char-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                document.getElementById('setting-char-avatar-preview').src = compressedUrl;
            } catch (error) {
                showToast('头像压缩失败，请重试');
            }
        }
    });
    
    document.getElementById('setting-my-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                document.getElementById('setting-my-avatar-preview').src = compressedUrl;
            } catch (error) {
                showToast('头像压缩失败，请重试');
            }
        }
    });
    
    document.getElementById('setting-chat-bg-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                try {
                    const compressedUrl = await compressImage(file, {
                        quality: 0.85,
                        maxWidth: 1080,
                        maxHeight: 1920
                    });
                    char.chatBg = compressedUrl;
                    setChatRoomBgImage(compressedUrl);
                    await saveData();
                    showToast('聊天背景已更换');
                } catch (error) {
                    showToast('背景压缩失败，请重试');
                }
            }
        }
    });

    const resetChatBgBtn = document.getElementById('reset-chat-bg-btn');
    if (resetChatBgBtn) {
        resetChatBgBtn.addEventListener('click', async () => {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                char.chatBg = '';
                char.chatBgBlur = 0;
                syncChatBgBlurUI(char);
                const chatRoomScreen = document.getElementById('chat-room-screen');
                if (chatRoomScreen) {
                    setChatRoomBgImage(null);
                    chatRoomScreen.style.setProperty('--chat-bg-blur', '0px');
                }
                await saveData();
                showToast('聊天背景已恢复默认');
            }
        });
    }

    // 背景模糊度滑杆：拖动实时预览，松手保存（0% = 不模糊，100% = 最大虚化）
    const bgBlurSlider = document.getElementById('setting-chat-bg-blur');
    if (bgBlurSlider) {
        bgBlurSlider.addEventListener('input', () => {
            const v = parseInt(bgBlurSlider.value, 10) || 0;
            updateChatBgBlurLabel(v);
            const chatRoomScreen = document.getElementById('chat-room-screen');
            if (chatRoomScreen) chatRoomScreen.style.setProperty('--chat-bg-blur', chatBgBlurPx(v) + 'px');
        });
        bgBlurSlider.addEventListener('change', async () => {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                char.chatBgBlur = parseInt(bgBlurSlider.value, 10) || 0;
                await saveData();
            }
        });
    }
    
    document.getElementById('clear-chat-history-btn').addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (confirm(`你确定要清空与“${character.remarkName}”的所有聊天记录吗？这个操作是不可恢复的！`)) {
            character.history = [];
            character.status = '在线'; 
            await saveData();
            renderMessages(false, true);
            renderChatList();
            if (currentChatId === character.id) {
                document.getElementById('chat-room-status-text').textContent = '在线';
            }
            showToast('聊天记录已清空');
        }
    });

    // 删除角色：只有微信（C）模式的设置页露这颗按钮，删的是人本体，和上面「只清记录」分得很开
    const deleteCharBtn = document.getElementById('delete-character-btn');
    if (deleteCharBtn) {
        deleteCharBtn.addEventListener('click', async () => {
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            if (!confirm(`确定要删除角色“${character.remarkName || character.name}”吗？他的聊天记录、总结、记忆会一起消失，找不回来。`)) return;
            await dexieDB.characters.delete(character.id);
            db.characters = db.characters.filter(c => c.id !== character.id);
            await saveData();
            if (typeof renderChatList === 'function') renderChatList();
            showToast('角色已删除');
            switchScreen('home-screen');
        });
    }
    
    document.getElementById('link-world-book-btn').addEventListener('click', () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        openWorldBookSelector(character.worldBookIds || []);
    });

    document.getElementById('link-group-world-book-btn').addEventListener('click', () => {
        const group = db.groups.find(g => g.id === currentChatId);
        if (!group) return;
        openWorldBookSelector(group.worldBookIds || []);
    });

    document.getElementById('save-world-book-selection-btn').addEventListener('click', async () => {
        const selectedIds = Array.from(tempSelectedWbIds);
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (character) character.worldBookIds = selectedIds;
            renderBoundWorldBooks('private', character.worldBookIds);
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (group) group.worldBookIds = selectedIds;
            renderBoundWorldBooks('group', group.worldBookIds);
        }
        await saveData();
        closeWorldBookSelector();
        showToast('世界书关联已更新');
    });

    const replyCountSwitch = document.getElementById('setting-reply-count-enabled');
    if (replyCountSwitch) {
        replyCountSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-reply-count-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    // 专属模型开关逻辑 (私聊)
    const exclusiveApiSwitch = document.getElementById('setting-exclusive-api-enabled');
    if (exclusiveApiSwitch) {
        exclusiveApiSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-exclusive-api-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
            setExclusiveModelRowVisible('private', e.target.checked);
        });
    }

    // 专属模型开关逻辑 (群聊)
    const groupExclusiveApiSwitch = document.getElementById('setting-group-exclusive-api-enabled');
    if (groupExclusiveApiSwitch) {
        groupExclusiveApiSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-group-exclusive-api-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
            setExclusiveModelRowVisible('group', e.target.checked);
        });
    }

    // 专属模型：拉取按钮，以及换预设后自动重拉一次列表
    [['private', 'setting-exclusive-api'], ['group', 'setting-group-exclusive-api']].forEach(pair => {
        const scope = pair[0], prefix = pair[1];
        const fetchBtn = document.getElementById(prefix + '-fetch-btn');
        if (fetchBtn) fetchBtn.addEventListener('click', () => fetchExclusiveApiModels(scope));
        const presetSel = document.getElementById(prefix + '-preset-select');
        if (presetSel) presetSel.addEventListener('change', () => {
            renderExclusiveModelSelect(scope, '');
            if (presetSel.value) fetchExclusiveApiModels(scope);
        });
    });

    // --- 功能控制中心 ---
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        const checkbox = card.querySelector('input[type="checkbox"]');
        const featureId = card.dataset.feature;
        
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('kkt-slider')
                && !e.target.closest('[data-native-toggle]')
                && !e.target.closest('.fc-r7-switch, .fc-shoh5, .fc-moments-switch, .fc-shop-toggle, .fc-airdrop-toggle, .fc-imagegen-toggle, .fc-lever-switch, .fc-pool-table, .fc-origami, .fc-billiard-switch')) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        checkbox.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const isChecked = e.target.checked;
            
            if (isChecked) {
                card.classList.add('is-on');
            } else {
                card.classList.remove('is-on');
            }

            if (featureId === 'status') {
                const panel = document.getElementById('status-panel-settings-container');
                if (panel) {
                    if (isChecked) {
                        panel.classList.add('open');
                    } else {
                        panel.classList.remove('open');
                    }
                }
            } else if (featureId === 'auto-reply') {
                const panel = document.getElementById('auto-reply-settings-container');
                if (panel) {
                    if (isChecked) {
                        panel.classList.add('open');
                    } else {
                        panel.classList.remove('open');
                    }
                }
            } else if (featureId === 'a-delay-reply') {
                const panel = document.getElementById('a-delay-reply-settings-container');
                if (panel) {
                    if (isChecked) {
                        panel.classList.add('open');
                    } else {
                        panel.classList.remove('open');
                    }
                }
            }
        });
    });

    initAvatarFrameSettings();
    initCharSoundSettings();
}

function populateCharSoundPresetSelect() {
    const sel = document.getElementById('char-sound-preset-select');
    if (!sel) return;
    const presets = db.soundPresets || [];
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function initCharSoundSettings() {
    const toggle = document.getElementById('setting-char-sound-enabled');
    const container = document.getElementById('char-sound-settings-container');
    if (toggle && container) {
        toggle.addEventListener('change', () => {
            container.style.display = toggle.checked ? 'block' : 'none';
        });
    }

    document.getElementById('chat-settings-screen')?.addEventListener('click', (e) => {
        const target = e.target;

        if (target.matches('#char-test-send-sound-btn')) {
            const url = document.getElementById('char-send-sound-url').value;
            if (url) {
                try { const a = new Audio(url); a.play().catch(err => showToast('播放失败: ' + err.message)); }
                catch { showToast('无效的音频地址'); }
            } else showToast('未设置提示音');
        }
        if (target.matches('#char-test-receive-sound-btn')) {
            const url = document.getElementById('char-receive-sound-url').value;
            if (url) {
                try { const a = new Audio(url); a.play().catch(err => showToast('播放失败: ' + err.message)); }
                catch { showToast('无效的音频地址'); }
            } else showToast('未设置提示音');
        }
        if (target.matches('#char-reset-send-sound-btn')) {
            document.getElementById('char-send-sound-url').value = '';
            showToast('已重置');
        }
        if (target.matches('#char-reset-receive-sound-btn')) {
            document.getElementById('char-receive-sound-url').value = '';
            showToast('已重置');
        }
        if (target.matches('#char-sound-apply-preset-btn')) {
            const sel = document.getElementById('char-sound-preset-select');
            const name = sel.value;
            if (!name) return showToast('请选择一个预设');
            const presets = db.soundPresets || [];
            const p = presets.find(x => x.name === name);
            if (!p) return showToast('未找到该预设');
            document.getElementById('char-send-sound-url').value = p.sendSound || '';
            document.getElementById('char-receive-sound-url').value = p.receiveSound || '';
            showToast('已应用预设');
        }
        if (target.matches('#char-sound-save-preset-btn')) {
            const sendUrl = document.getElementById('char-send-sound-url').value.trim();
            const receiveUrl = document.getElementById('char-receive-sound-url').value.trim();
            if (!sendUrl && !receiveUrl) return showToast('提示音配置为空，无法保存');
            let name = prompt('请输入预设名称（将覆盖同名预设）：');
            if (!name) return;
            const presets = db.soundPresets || [];
            const idx = presets.findIndex(p => p.name === name);
            const preset = { name, sendSound: sendUrl, receiveSound: receiveUrl };
            if (idx >= 0) presets[idx] = preset; else presets.push(preset);
            db.soundPresets = presets;
            saveData();
            populateCharSoundPresetSelect();
            showToast('预设已保存');
        }
        if (target.matches('#char-sound-manage-presets-btn')) {
            openSoundManageModal();
        }
    });

    document.getElementById('chat-settings-screen')?.addEventListener('change', async (e) => {
        if (e.target.id === 'char-send-sound-upload' || e.target.id === 'char-receive-sound-upload') {
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
                if (e.target.id === 'char-send-sound-upload') {
                    document.getElementById('char-send-sound-url').value = base64;
                } else {
                    document.getElementById('char-receive-sound-url').value = base64;
                }
                showToast('提示音已上传');
            };
            reader.readAsDataURL(file);
            e.target.value = null;
        }
    });
}

// ===== 头像框设置 =====
function measureFrameHole(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const n = 64, half = n / 2;
                const cv = document.createElement('canvas');
                cv.width = n; cv.height = n;
                const ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0, n, n);
                const d = ctx.getImageData(0, 0, n, n).data;
                const dists = [];
                for (let i = 0; i < 24; i++) {
                    const ang = i / 24 * Math.PI * 2;
                    const dx = Math.cos(ang), dy = Math.sin(ang);
                    for (let r = 1; r < half; r++) {
                        const x = Math.round(half - 0.5 + dx * r), y = Math.round(half - 0.5 + dy * r);
                        if (d[(y * n + x) * 4 + 3] > 25) { dists.push(r / half); break; }
                    }
                }
                if (!dists.length) { resolve(0); return; }
                dists.sort((a, b) => a - b);
                const hole = dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.75))];
                resolve(hole >= 0.45 ? hole : 0);
            } catch (e) { resolve(0); }
        };
        img.onerror = () => resolve(0);
        img.src = src;
    });
}
function frameInsetCss(hole) {
    if (!hole || hole <= 0.625) return '-30%';
    return (-((1 / hole - 1) / 2) * 100).toFixed(2) + '%';
}
function initAvatarFrameSettings() {
    const modal = document.getElementById('avatar-frame-modal');
    if (!modal) return;

    const LIB_KEY = 'uwu_avatar_frames_lib';
    const loadLib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { return []; } };
    const saveLib = (lib) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); } catch (e) { showToast('头像库存储空间不足'); } };

    let selectedSide = 'char';           // 当前编辑侧
    let libManageMode = false;           // 头像库批量删除模式
    const libSelected = new Set();       // 批量删除选中的 id

    // 编辑中的临时数据
    const pending = {
        char: { src: null, dx: 0, dy: 0, scale: 100 },
        my: { src: null, dx: 0, dy: 0, scale: 100 }
    };

    const applyPreview = (side) => {
        const box = document.getElementById(side === 'char' ? 'af-char-preview-box' : 'af-my-preview-box');
        const p = pending[side];
        box.style.setProperty('--frame-img', p.src ? `url("${p.src}")` : 'none');
        box.style.setProperty('--frame-dx', p.dx + 'px');
        box.style.setProperty('--frame-dy', p.dy + 'px');
        box.style.setProperty('--frame-scale', (p.scale || 100) / 100);
    };

    const syncSliders = () => {
        const p = pending[selectedSide];
        document.getElementById('af-dx').value = p.dx;
        document.getElementById('af-dx-val').textContent = p.dx;
        document.getElementById('af-dy').value = p.dy;
        document.getElementById('af-dy-val').textContent = p.dy;
        document.getElementById('af-scale').value = p.scale;
        document.getElementById('af-scale-val').textContent = p.scale + '%';
        document.getElementById('afm-slider-title').textContent =
            `调整「${selectedSide === 'char' ? '角色' : '我'}」的头像框`;
    };

    // 切换编辑侧
    const selectSide = (side) => {
        selectedSide = side;
        document.getElementById('afm-side-char').classList.toggle('selected', side === 'char');
        document.getElementById('afm-side-my').classList.toggle('selected', side === 'my');
        syncSliders();
    };
    document.getElementById('afm-side-char').addEventListener('click', () => selectSide('char'));
    document.getElementById('afm-side-my').addEventListener('click', () => selectSide('my'));

    // 滑块（作用于当前选中侧）
    [['dx', v => v], ['dy', v => v], ['scale', v => v]].forEach(([axis]) => {
        document.getElementById('af-' + axis).addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10) || 0;
            pending[selectedSide][axis] = v;
            if (axis === 'scale') document.getElementById('af-scale-val').textContent = v + '%';
            else document.getElementById('af-' + axis + '-val').textContent = v;
            applyPreview(selectedSide);
        });
    });

    // 打开弹窗：回填头像、头像框数据与头像圆角设置
    document.getElementById('setting-avatar-frame-entry').addEventListener('click', () => {
        triggerHapticFeedback('light');
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) { showToast('找不到当前聊天'); return; }

        // 预览头像按「头像圆角」设置显示
        const radius = (char.avatarRadius !== undefined ? char.avatarRadius : 50) + '%';
        document.getElementById('af-char-avatar').src = char.avatar || '';
        document.getElementById('af-my-avatar').src = char.myAvatar || '';
        document.getElementById('af-char-avatar').style.borderRadius = radius;
        document.getElementById('af-my-avatar').style.borderRadius = radius;

        ['char', 'my'].forEach(side => {
            const f = char[side === 'char' ? 'avatarFrame' : 'myAvatarFrame'];
            pending[side] = f ? { src: f.src || null, dx: f.dx || 0, dy: f.dy || 0, scale: f.scale || 100, hole: f.hole } : { src: null, dx: 0, dy: 0, scale: 100 };
            applyPreview(side);
        });
        selectSide('char');
        exitManageMode();
        renderLib();
        modal.classList.add('visible');
    });

    const closeModal = () => modal.classList.remove('visible');
    document.getElementById('af-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // 图片处理：压缩 → 居中裁成正方形（PNG 保留透明）
    const cropSquare = (dataUrl, maxSide) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const size = Math.min(img.width, img.height, maxSide);
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            canvas.getContext('2d').drawImage(
                img,
                (img.width - size) / 2, (img.height - size) / 2, size, size,
                0, 0, size, size
            );
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });

    // 上传头像框（作用于当前选中侧）
    document.getElementById('afm-upload-btn').addEventListener('click', () => document.getElementById('afm-upload').click());
    document.getElementById('afm-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const compressedUrl = await compressImage(file, { quality: 0.9, maxWidth: 600, maxHeight: 600 });
            const src = await cropSquare(compressedUrl, 600);
            pending[selectedSide].src = src;
            pending[selectedSide].hole = await measureFrameHole(src);
            applyPreview(selectedSide);
            showToast('已上传，可拖动滑块调整位置和大小');
        } catch (err) {
            showToast('图片处理失败，请重试');
        }
    });
    document.getElementById('afm-remove-btn').addEventListener('click', () => {
        pending[selectedSide] = { src: null, dx: 0, dy: 0, scale: 100 };
        applyPreview(selectedSide);
    });

    // ===== 头像库 =====
    const renderLib = () => {
        const grid = document.getElementById('afm-lib-grid');
        const empty = document.getElementById('afm-lib-empty');
        const more = document.getElementById('afm-lib-more');
        const lib = loadLib();
        empty.style.display = lib.length ? 'none' : 'block';
        more.style.display = lib.length ? 'block' : 'none';
        grid.innerHTML = '';
        lib.slice(0, 4).forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'afm-lib-cell';
            const img = document.createElement('img');
            img.src = item.src;
            cell.appendChild(img);
            grid.appendChild(cell);
        });
    };

    const exitManageMode = () => {
        libManageMode = false;
        libSelected.clear();
        const mb = document.getElementById('afm-all-manage-btn');
        const bar = document.getElementById('afm-all-manage-bar');
        if (mb) mb.textContent = '批量删除';
        if (bar) bar.style.display = 'none';
    };

    // ===== 全部头像框弹窗 =====
    const allModal = document.getElementById('afm-all-modal');
    const renderAllGrid = () => {
        const grid = document.getElementById('afm-all-grid');
        const empty = document.getElementById('afm-all-empty');
        const lib = loadLib();
        empty.style.display = lib.length ? 'none' : 'block';
        grid.innerHTML = '';
        lib.forEach(item => {
            const isCurrent = !libManageMode && pending[selectedSide].src === item.src;
            const isPicked = libManageMode && libSelected.has(item.id);
            const cell = document.createElement('div');
            cell.className = 'afm-lib-cell' + (isCurrent || isPicked ? ' selected' : '');
            const img = document.createElement('img');
            img.src = item.src;
            cell.appendChild(img);
            cell.addEventListener('click', async () => {
                if (libManageMode) {
                    libSelected.has(item.id) ? libSelected.delete(item.id) : libSelected.add(item.id);
                    cell.classList.toggle('selected', libSelected.has(item.id));
                    document.getElementById('afm-all-delete-btn').textContent = `删除选中 (${libSelected.size})`;
                } else {
                    // 点击即实时应用到顶部预览，无需保存；重置偏移让框默认紧贴头像边缘
                    const hole = item.hole !== undefined ? item.hole : await measureFrameHole(item.src);
                    pending[selectedSide] = { src: item.src, dx: 0, dy: 0, scale: 100, hole };
                    applyPreview(selectedSide);
                    closeAllModal();
                }
            });
            grid.appendChild(cell);
        });
    };

    const openAllModal = () => {
        exitManageMode();
        renderAllGrid();
        allModal.classList.add('visible');
    };
    const closeAllModal = () => {
        exitManageMode();
        allModal.classList.remove('visible');
    };

    document.getElementById('afm-lib-grid').addEventListener('click', openAllModal);
    document.getElementById('afm-lib-more').addEventListener('click', openAllModal);
    document.getElementById('afm-lib-empty').addEventListener('click', openAllModal);
    document.getElementById('afm-all-close-btn').addEventListener('click', closeAllModal);
    allModal.addEventListener('click', (e) => { if (e.target === allModal) closeAllModal(); });

    // 批量上传（主弹窗与全部弹窗共用处理）
    const handleLibUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        showToast('正在处理 ' + files.length + ' 张图片…');
        const lib = loadLib();
        let ok = 0;
        for (const file of files) {
            try {
                const compressedUrl = await compressImage(file, { quality: 0.9, maxWidth: 300, maxHeight: 300 });
                const src = await cropSquare(compressedUrl, 300);
                lib.push({ id: 'afl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), src, hole: await measureFrameHole(src) });
                ok++;
            } catch (err) { /* 单张失败跳过 */ }
        }
        saveLib(lib);
        renderLib();
        renderAllGrid();
        showToast(ok + ' 张已加入头像库');
    };
    document.getElementById('afm-lib-upload-btn').addEventListener('click', () => document.getElementById('afm-lib-upload').click());
    document.getElementById('afm-lib-upload').addEventListener('change', handleLibUpload);
    document.getElementById('afm-all-upload-btn').addEventListener('click', () => document.getElementById('afm-all-upload').click());
    document.getElementById('afm-all-upload').addEventListener('change', handleLibUpload);

    // 批量删除（在全部头像框弹窗内操作）
    document.getElementById('afm-all-manage-btn').addEventListener('click', () => {
        if (libManageMode) { exitManageMode(); renderAllGrid(); return; }
        libManageMode = true;
        libSelected.clear();
        document.getElementById('afm-all-manage-btn').textContent = '取消';
        document.getElementById('afm-all-manage-bar').style.display = 'flex';
        document.getElementById('afm-all-delete-btn').textContent = '删除选中 (0)';
        renderAllGrid();
    });
    document.getElementById('afm-all-done-btn').addEventListener('click', () => { exitManageMode(); renderAllGrid(); });
    document.getElementById('afm-all-delete-btn').addEventListener('click', () => {
        if (!libSelected.size) { showToast('请先点击选择要删除的头像框'); return; }
        saveLib(loadLib().filter(item => !libSelected.has(item.id)));
        exitManageMode();
        renderLib();
        renderAllGrid();
        showToast('已删除');
    });

    // 保存：写入角色数据并立即重绘聊天页
    document.getElementById('af-save-btn').addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) { showToast('找不到当前聊天'); return; }
        const p = pending.char, m = pending.my;
        char.avatarFrame = p.src ? { src: p.src, dx: p.dx, dy: p.dy, scale: p.scale, hole: p.hole } : null;
        char.myAvatarFrame = m.src ? { src: m.src, dx: m.dx, dy: m.dy, scale: m.scale, hole: m.hole } : null;
        await saveData();
        closeModal();
        showToast('头像框已保存');
        if (typeof renderMessages === 'function') renderMessages(false, true);
    });
}

function renderBoundWorldBooks(type, worldBookIds) {
    const wrapperId = type === 'private' ? 'private-bound-worldbooks-wrapper' : 'group-bound-worldbooks-wrapper';
    const toggleId = type === 'private' ? 'private-bound-worldbooks-toggle' : 'group-bound-worldbooks-toggle';
    const containerId = type === 'private' ? 'private-bound-worldbooks-container' : 'group-bound-worldbooks-container';
    const listId = type === 'private' ? 'private-bound-worldbooks-list' : 'group-bound-worldbooks-list';
    const countId = type === 'private' ? 'private-bound-count' : 'group-bound-count';
    
    const wrapper = document.getElementById(wrapperId);
    const toggle = document.getElementById(toggleId);
    const container = document.getElementById(containerId);
    const list = document.getElementById(listId);
    const countSpan = document.getElementById(countId);
    
    if (!wrapper || !list) return;

    if (!worldBookIds || worldBookIds.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'block';
    if (countSpan) countSpan.textContent = worldBookIds.length;
    list.innerHTML = '';

    // 绑定折叠/展开事件 (确保只绑定一次)
    if (toggle && !toggle.dataset.bound) {
        toggle.dataset.bound = 'true';
        toggle.addEventListener('click', () => {
            const isHidden = container.style.display === 'none';
            container.style.display = isHidden ? 'block' : 'none';
            const svg = toggle.querySelector('svg');
            if (svg) {
                svg.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }

    worldBookIds.forEach(id => {
        const wb = db.worldBooks.find(b => b.id === id);
        if (wb) {
            const globalFolder = hasGlobalAncestor(wb.id);
            const isGlobalBound = !!globalFolder;
            const card = document.createElement('div');
            card.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #666;';
            const globalLabel = isGlobalBound ? '<span style="font-size:10px;color:#4CAF50;background:rgba(76,175,80,0.1);border:1px solid #4CAF50;border-radius:8px;padding:1px 5px;margin-right:6px;white-space:nowrap;">全局</span>' : '';
            card.innerHTML = `
                <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;">${globalLabel}${wb.name}</span>
                ${isGlobalBound ? '<span style="font-size:11px;color:#aaa;padding:2px 6px;">自动绑定</span>' : '<button class="bound-wb-unbind-btn" data-id="'+id+'" style="background:none;border:none;color:#999;font-size:12px;padding:2px 6px;cursor:pointer;">解绑</button>'}
            `;
            
            const unbindBtn = card.querySelector('.bound-wb-unbind-btn');
            if (unbindBtn) {
                unbindBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const targetId = e.target.dataset.id;
                    if (type === 'private') {
                        const char = db.characters.find(c => c.id === currentChatId);
                        if (char) {
                            char.worldBookIds = char.worldBookIds.filter(i => i !== targetId);
                            renderBoundWorldBooks('private', char.worldBookIds);
                        }
                    } else {
                        const group = db.groups.find(g => g.id === currentChatId);
                        if (group) {
                            group.worldBookIds = group.worldBookIds.filter(i => i !== targetId);
                            renderBoundWorldBooks('group', group.worldBookIds);
                        }
                    }
                    await saveData();
                    showToast('已解绑世界书');
                });
            }
            
            list.appendChild(card);
        }
    });
}

function applySketchbookTheme(char) {
    const chatSettings = document.getElementById('chat-settings-screen');
    const groupSettings = document.getElementById('group-settings-screen');
    const useSketch = !!char && char.uiStyle === 'sketchbook';

    if (useSketch) {
        chatSettings && chatSettings.classList.add('sketchbook-theme');
    } else {
        chatSettings && chatSettings.classList.remove('sketchbook-theme');
    }
    groupSettings && groupSettings.classList.remove('sketchbook-theme');
}

function loadSettingsToSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    applySketchbookTheme(e);
    const delCharBtn = document.getElementById('delete-character-btn');
    if (delCharBtn) delCharBtn.style.display = (e && document.body.classList.contains('c-mode')) ? '' : 'none';
    if (e) {
        document.getElementById('setting-char-avatar-preview').src = e.avatar;
        renderBoundWorldBooks('private', e.worldBookIds || []);
        const nameDisplay = document.getElementById('setting-char-name-display');
        if(nameDisplay) nameDisplay.textContent = e.remarkName;
        document.getElementById('setting-char-realname').value = e.realName || '';
        document.getElementById('setting-char-remark').value = e.remarkName;
        document.getElementById('setting-char-persona').value = e.persona;
        
        const stickerGroupsContainer = document.getElementById('setting-char-sticker-groups-container');
        stickerGroupsContainer.innerHTML = '';
        
        const allGroups = [...new Set(db.myStickers.map(s => s.group || '未分类'))].filter(g => g);
        const charGroups = (e.stickerGroups || '').split(/[,，]/).map(s => s.trim());

        if (allGroups.length === 0) {
            stickerGroupsContainer.innerHTML = '<span style="color:#999; font-size:12px;">暂无表情包分组，请先在表情包管理中添加。</span>';
        } else {
            allGroups.forEach(group => {
                const tag = document.createElement('div');
                tag.className = 'sticker-group-tag';
                if (charGroups.includes(group)) {
                    tag.classList.add('selected');
                }
                tag.textContent = group;
                tag.dataset.group = group;
                
                tag.addEventListener('click', () => {
                    tag.classList.toggle('selected');
                });
                
                stickerGroupsContainer.appendChild(tag);
            });
        }
        
        document.getElementById('setting-my-avatar-preview').src = e.myAvatar;
        document.getElementById('setting-my-name').value = e.myName;
        document.getElementById('setting-my-remark-name').value = e.myRemarkName || '';
        document.getElementById('setting-my-persona').value = e.myPersona;
        document.getElementById('setting-theme-color').value = e.theme || 'white_pink';
        syncChatBgBlurUI(e);
        const uiStyleSelect = document.getElementById('setting-char-ui-style');
        if (uiStyleSelect) uiStyleSelect.value = e.uiStyle || 'original';
        document.getElementById('setting-max-memory').value = e.maxMemory;
        
        document.getElementById('setting-reply-count-enabled').checked = e.replyCountEnabled || false;
        const replyCountContainer = document.getElementById('setting-reply-count-container');
        if (replyCountContainer) {
            replyCountContainer.style.display = e.replyCountEnabled ? 'flex' : 'none';
        }
        document.getElementById('setting-reply-count-min').value = e.replyCountMin || 3;
        document.getElementById('setting-reply-count-max').value = e.replyCountMax || 8;

        // 专属模型
        const exclusiveApiSwitch = document.getElementById('setting-exclusive-api-enabled');
        const exclusiveApiContainer = document.getElementById('setting-exclusive-api-container');
        const exclusiveApiPresetSelect = document.getElementById('setting-exclusive-api-preset-select');
        
        if (exclusiveApiSwitch && exclusiveApiContainer && exclusiveApiPresetSelect) {
            exclusiveApiSwitch.checked = e.exclusiveApiEnabled || false;
            exclusiveApiContainer.style.display = e.exclusiveApiEnabled ? 'flex' : 'none';
            
            // 填充预设列表
            exclusiveApiPresetSelect.innerHTML = '<option value="">请选择预设</option>';
            const presets = db.apiPresets || [];
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                exclusiveApiPresetSelect.appendChild(opt);
            });
            
            exclusiveApiPresetSelect.value = e.exclusiveApiPreset || '';
            setExclusiveModelRowVisible('private', Boolean(e.exclusiveApiEnabled));
            renderExclusiveModelSelect('private', e.exclusiveModel || '');
        }

        // 专属提示词版本
        const exclusivePromptVersionSelect = document.getElementById('setting-exclusive-prompt-version');
        if (exclusivePromptVersionSelect) {
            exclusivePromptVersionSelect.value = e.exclusivePromptVersion || '';
        }

        // 专属聊天预设
        const exclusiveChatPresetSelect = document.getElementById('setting-exclusive-chat-preset');
        if (exclusiveChatPresetSelect) {
            exclusiveChatPresetSelect.innerHTML = '<option value="">跟随全局</option>';
            (db.chatPresets || []).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                exclusiveChatPresetSelect.appendChild(opt);
            });
            exclusiveChatPresetSelect.value = e.exclusiveChatPreset || '';
        }

        // 专属思维链预设
        const exclusiveCotPresetSelect = document.getElementById('setting-exclusive-cot-preset');
        if (exclusiveCotPresetSelect) {
            exclusiveCotPresetSelect.innerHTML = '<option value="">跟随全局</option>';
            if (db.cotPresets && db.cotPresets.length > 0) {
                db.cotPresets.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    exclusiveCotPresetSelect.appendChild(opt);
                });
            }
            exclusiveCotPresetSelect.value = e.exclusiveCotPreset || '';
        }

        // 专属提示音
        const charSoundEnabled = document.getElementById('setting-char-sound-enabled');
        const charSoundContainer = document.getElementById('char-sound-settings-container');
        if (charSoundEnabled && charSoundContainer) {
            charSoundEnabled.checked = e.charSoundEnabled || false;
            charSoundContainer.style.display = e.charSoundEnabled ? 'block' : 'none';
            document.getElementById('char-send-sound-url').value = e.charSendSound || '';
            document.getElementById('char-receive-sound-url').value = e.charReceiveSound || '';
            document.getElementById('char-multi-msg-sound-switch').checked = e.charMultiMsgSound || false;
            populateCharSoundPresetSelect();
        }

        // 消息免打扰（后台通知）
        const charMutedEl = document.getElementById('setting-char-muted');
        if (charMutedEl) charMutedEl.checked = e.muted || false;

        // 通话自动播放语音
        const charCallVoiceEl = document.getElementById('setting-char-call-voice');
        if (charCallVoiceEl) charCallVoiceEl.checked = e.charCallVoice || false;

        // 通话环境音识别
        const charCallSoundWatchEl = document.getElementById('setting-char-call-sound-watch');
        if (charCallSoundWatchEl) charCallSoundWatchEl.checked = e.charCallSoundWatch || false;

        // 通话形象（LivLiv 2.5D）
        const livlivSel = document.getElementById('setting-char-livliv-select');
        if (livlivSel) {
            const chars = (window.LivlivCall && window.LivlivCall.CHARACTERS) || [];
            const cur = e.livlivCharacter || '';
            livlivSel.innerHTML = '<option value="">默认 (Sena)</option>' + chars.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            livlivSel.value = cur;
        }

        // 手机样式（聊天页右上角偷看入口图标）
        const phoneStyleSel = document.getElementById('setting-char-phone-style');
        if (phoneStyleSel) phoneStyleSel.value = e.phoneStyle || 'emu';

        // 查手机图标显隐
        const peekBtnEnabledEl = document.getElementById('setting-char-peek-btn-enabled');
        if (peekBtnEnabledEl) {
            peekBtnEnabledEl.checked = !e.peekBtnHidden;
            peekBtnEnabledEl.onchange = async () => {
                const ch = (typeof db !== 'undefined' && db.characters || []).find(c => c.id === currentChatId);
                if (!ch) return;
                ch.peekBtnHidden = !peekBtnEnabledEl.checked;
                try { await saveData(); } catch (err) { console.error('[查手机开关] 保存失败', err); }
                if (currentChatType === 'private' && typeof renderPeekPhoneIcon === 'function') {
                    renderPeekPhoneIcon(ch);
                }
                showToast(peekBtnEnabledEl.checked ? '已显示查手机图标' : '已隐藏查手机图标');
            };
        }

        // 功能面板文字颜色
        const funcLabelGroup = document.getElementById('setting-func-label-group');
        if (funcLabelGroup) {
            const isAMode = (window.AMode && typeof window.AMode.isEnabled === 'function') ? window.AMode.isEnabled() : (db && db.uiMode === 'a');
            funcLabelGroup.style.display = isAMode ? '' : 'none';
        }
        const funcLabelColorEl = document.getElementById('setting-char-func-label-color');
        if (funcLabelColorEl) {
            const savedColor = e.featureLabelColor || '';
            funcLabelColorEl.value = savedColor || '#666666';
            funcLabelColorEl.dataset.isDefault = savedColor ? '0' : '1';
            funcLabelColorEl.oninput = () => { funcLabelColorEl.dataset.isDefault = '0'; };
            const funcLabelResetBtn = document.getElementById('setting-char-func-label-reset');
            if (funcLabelResetBtn) {
                funcLabelResetBtn.onclick = () => {
                    funcLabelColorEl.value = '#666666';
                    funcLabelColorEl.dataset.isDefault = '1';
                };
            }
        }

        document.getElementById('setting-bilingual-mode').checked = e.bilingualModeEnabled || false;
        document.getElementById('setting-bilingual-style').value = e.bilingualBubbleStyle || 'under';
        document.getElementById('setting-korean-mode').checked = e.koreanModeEnabled || false;
        document.getElementById('setting-korean-mode').onchange = function () {
            if (this.checked) {
                document.getElementById('setting-bilingual-mode').checked = true;
            }
        };
        
        document.getElementById('setting-avatar-mode').value = e.avatarMode || 'full';
        const avatarRadius = e.avatarRadius !== undefined ? e.avatarRadius : 50;
        document.getElementById('setting-avatar-radius').value = avatarRadius;
        document.getElementById('setting-avatar-radius-value').textContent = `${avatarRadius}%`;
        
        const radiusSlider = document.getElementById('setting-avatar-radius');
        const radiusValue = document.getElementById('setting-avatar-radius-value');
        radiusSlider.oninput = () => {
            radiusValue.textContent = `${radiusSlider.value}%`;
        };

        document.getElementById('setting-bubble-blur').checked = e.bubbleBlurEnabled !== false; 

        document.getElementById('setting-title-layout').value = e.titleLayout || 'left';
        document.getElementById('setting-show-timestamp').checked = e.showTimestamp || false;
        document.getElementById('setting-timestamp-style').value = e.timestampStyle || 'bubble';
        document.getElementById('setting-show-status').checked = e.showStatus !== false;
        document.getElementById('setting-show-status-update-msg').checked = e.showStatusUpdateMsg || false;

        const sp = e.statusPanel || {};
        const statusCheckbox = document.getElementById('setting-status-panel-enabled');
        statusCheckbox.checked = sp.enabled || false;
        document.getElementById('setting-status-prompt-suffix').value = sp.promptSuffix || '';
        document.getElementById('setting-status-regex').value = sp.regexPattern || '';
        document.getElementById('setting-status-replace').value = sp.replacePattern || '';
        document.getElementById('setting-status-history-limit').value = sp.historyLimit !== undefined ? sp.historyLimit : 3;
        const statusRandomCheckbox = document.getElementById('setting-status-random-enabled');
        if (statusRandomCheckbox) statusRandomCheckbox.checked = sp.randomEnabled === true;
        
        statusCheckbox.dispatchEvent(new Event('change'));

        const shopCheckbox = document.getElementById('setting-shop-interaction-enabled');
        shopCheckbox.checked = e.shopInteractionEnabled !== false;
        shopCheckbox.dispatchEvent(new Event('change'));

        const momentsCheckbox = document.getElementById('setting-moments-enabled');
        momentsCheckbox.checked = e.momentsEnabled !== false;
        momentsCheckbox.dispatchEvent(new Event('change'));

        const stardustCheckbox = document.getElementById('setting-stardust-enabled');
        if (stardustCheckbox) stardustCheckbox.checked = e.stardustEnabled !== false;
        const snapCheckbox = document.getElementById('setting-snap-enabled');
        if (snapCheckbox) snapCheckbox.checked = e.snapEnabled !== false;

        const blackboxCheckbox = document.getElementById('setting-blackbox-enabled');
        if (blackboxCheckbox) blackboxCheckbox.checked = e.blackboxEnabled !== false;
        const blackboxLevels = document.getElementById('setting-blackbox-levels');
        if (blackboxLevels) blackboxLevels.value = (e.blackbox && e.blackbox.levels) || '';

        const stickerReactionCheckbox = document.getElementById('setting-sticker-reaction-enabled');
        if (stickerReactionCheckbox) stickerReactionCheckbox.checked = e.stickerReactionEnabled !== false;

        // 表情编辑器：角色（按角色限制 TA 贴的）+ 长按气泡胶囊表情（我的，默认显示长按时会出现的表情）
        renderStickerEmojiEditor(document.getElementById('sticker-ai-emoji-list'), Array.isArray(e.stickerEmojis) ? e.stickerEmojis : [], {
            onChange: (list) => { e.stickerEmojis = list; if (typeof saveData === 'function') saveData(); }
        });
        const pickerDefaults = (e.reactionPickerSet) ? []
            : ((typeof db !== 'undefined' && Array.isArray(db.reactionPickerEmojis) && db.reactionPickerEmojis.length)
                ? db.reactionPickerEmojis.filter(x => typeof x === 'string' && x.trim())
                : (typeof CS_REACTION_EMOJIS !== 'undefined' ? CS_REACTION_EMOJIS.slice() : []));
        renderStickerEmojiEditor(document.getElementById('sticker-picker-emoji-list'), Array.isArray(e.reactionPickerEmojis) ? e.reactionPickerEmojis : [], {
            defaults: pickerDefaults,
            onChange: (list) => { e.reactionPickerEmojis = list; e.reactionPickerSet = true; if (typeof saveData === 'function') saveData(); }
        });

        /* 贴表情折叠：点「贴表情」那一行展开/收起下面的编辑器（点开关本体仍只切开关） */
        const stickerRow = document.getElementById('setting-sticker-row');
        const stickerFold = document.getElementById('sticker-fold');
        if (stickerRow && stickerFold && !stickerRow.dataset.foldWired) {
            stickerRow.dataset.foldWired = '1';
            stickerRow.addEventListener('click', (ev) => {
                if (ev.target.closest('.kkt-switch')) return;
                stickerFold.classList.toggle('open');
            });
        }

        const callCheckbox = document.getElementById('setting-video-call-enabled');
        callCheckbox.checked = e.videoCallEnabled || false;
        callCheckbox.dispatchEvent(new Event('change'));

        const foodRecordCheckbox = document.getElementById('setting-food-record-enabled');
        if (foodRecordCheckbox) foodRecordCheckbox.checked = e.foodRecordEnabled || false;

        const ar = e.autoReply || {};
        const autoReplyCheckbox = document.getElementById('setting-auto-reply-enabled');
        autoReplyCheckbox.checked = ar.enabled || false;
        document.getElementById('setting-auto-reply-interval').value = ar.interval || 60;
        autoReplyCheckbox.dispatchEvent(new Event('change'));
        // 记住原始状态，保存时用来判断「这次是不是刚关掉」
        window.__autoReplyWasOn = !!ar.enabled;

        const autoAirdropCheckbox = document.getElementById('setting-auto-airdrop-enabled');
        if (autoAirdropCheckbox) {
            autoAirdropCheckbox.checked = e.autoAirDropEnabled || false;
            autoAirdropCheckbox.dispatchEvent(new Event('change'));
        }

        const autoImageGenCheckbox = document.getElementById('setting-auto-image-gen-enabled');
        if (autoImageGenCheckbox) {
            autoImageGenCheckbox.checked = e.autoImageGen || false;
            autoImageGenCheckbox.dispatchEvent(new Event('change'));
        }

        // A模式自动回复（发消息后 N 秒未再发才触发）
        const aDelayCheckbox = document.getElementById('setting-a-delay-reply-enabled');
        if (aDelayCheckbox) {
            const hasDelay = !!(e.aReplyDelay && e.aReplyDelay > 0);
            aDelayCheckbox.checked = hasDelay;
            document.getElementById('setting-a-delay-reply-seconds').value = hasDelay ? e.aReplyDelay : 3;
            aDelayCheckbox.dispatchEvent(new Event('change'));
        }

        // 灵动岛开关（全局设置，即时生效，不走保存按钮）
        const islandCb = document.getElementById('setting-island-enabled');
        if (islandCb) islandCb.checked = !!(window.AIsland && window.AIsland.isOn());
        if (window.AIsland && typeof window.AIsland.syncCfgUI === 'function') window.AIsland.syncCfgUI();

        const galleryCheckbox = document.getElementById('setting-use-real-gallery');
        galleryCheckbox.checked = e.useRealGallery || false;
        galleryCheckbox.dispatchEvent(new Event('change'));

        const useCustomCssCheckbox = document.getElementById('setting-use-custom-css'),
            customCssTextarea = document.getElementById('setting-custom-bubble-css'),
            privatePreviewBox = document.getElementById('private-bubble-css-preview');
        useCustomCssCheckbox.checked = e.useCustomBubbleCss || false;
        customCssTextarea.value = e.customBubbleCss || '';
        customCssTextarea.disabled = !useCustomCssCheckbox.checked;
        // 气泡字体：选项来自美化 APP 字体库（db.fontPresets）
        const bubbleFontSel = document.getElementById('setting-bubble-font');
        if (bubbleFontSel) {
            const presets = db.fontPresets || [];
            bubbleFontSel.innerHTML = '<option value="">默认字体</option>' + presets.map(p =>
                `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`).join('');
            bubbleFontSel.value = presets.some(p => p.name === e.bubbleFont) ? e.bubbleFont : '';
            if (e.bubbleFont) {
                const p = presets.find(x => x.name === e.bubbleFont);
                try { bubbleFontSel.style.fontFamily = (p && p.isCustom && p.fontFamily) ? `"${p.fontFamily}"` : `"${e.bubbleFont}"`; } catch (err) { /* 忽略 */ }
            } else { bubbleFontSel.style.fontFamily = ''; }
        }
        const theme = colorThemes[e.theme || 'white_pink'];
        updateBubbleCssPreview(privatePreviewBox, e.customBubbleCss, !e.useCustomBubbleCss, theme);
        populateBubblePresetSelect('bubble-preset-select');
        if (typeof setupABubbleStyleUI === 'function') setupABubbleStyleUI('private');
        if (typeof setupBubbleLibraryUI === 'function') setupBubbleLibraryUI('private');
        if (typeof applyStyleTabModeScope === 'function') applyStyleTabModeScope();
        populateMyPersonaSelect();
        if (typeof populateStatusBarPresetSelect === 'function') {
            populateStatusBarPresetSelect();
        }
        // 专属温度滑块（等页面显示后挂载，隐藏状态量不到尺寸）
        if (window.ClawdTemp) setTimeout(() => window.ClawdTemp.mount(), 80);
    }
}

// 初始化文本框搜索替换工具栏
function initTextareaSearchReplace(toolbarId, textareaId) {
    const toolbar = document.getElementById(toolbarId);
    const textarea = document.getElementById(textareaId);
    if (!toolbar || !textarea) return;

    const toggleBtn = toolbar.querySelector('.toolbar-toggle-btn');
    const mainBox = toolbar.querySelector('.toolbar-main-box');
    const searchInput = toolbar.querySelector('.toolbar-search-input');
    const matchCountSpan = toolbar.querySelector('.toolbar-match-count');
    const prevBtn = toolbar.querySelector('.toolbar-prev-btn');
    const nextBtn = toolbar.querySelector('.toolbar-next-btn');
    const expandReplaceBtn = toolbar.querySelector('.toolbar-expand-replace-btn');
    const replaceRow = toolbar.querySelector('.toolbar-replace-row');
    const replaceInput = toolbar.querySelector('.toolbar-replace-input');
    const replaceBtn = toolbar.querySelector('.toolbar-replace-btn');
    const replaceAllBtn = toolbar.querySelector('.toolbar-replace-all-btn');

    let matches = [];
    let currentMatchIndex = -1;

    // 1. 折叠/展开逻辑
    toggleBtn.addEventListener('click', () => {
        const isHidden = mainBox.style.display === 'none';
        mainBox.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            searchInput.focus();
            performSearch();
        }
    });

    expandReplaceBtn.addEventListener('click', () => {
        const isHidden = replaceRow.style.display === 'none';
        replaceRow.style.display = isHidden ? 'flex' : 'none';
        expandReplaceBtn.classList.toggle('open', isHidden);
        if (isHidden) replaceInput.focus();
    });

    // 2. 搜索逻辑
    function performSearch() {
        const query = searchInput.value;
        const content = textarea.value;
        matches = [];
        currentMatchIndex = -1;

        if (query) {
            let pos = content.indexOf(query);
            while (pos !== -1) {
                matches.push(pos);
                pos = content.indexOf(query, pos + 1);
            }
        }

        updateUI();
    }

    function updateUI() {
        if (matches.length > 0) {
            if (currentMatchIndex === -1) currentMatchIndex = 0;
            matchCountSpan.textContent = `${currentMatchIndex + 1}/${matches.length}`;
        } else {
            matchCountSpan.textContent = `0/0`;
        }
    }

    function scrollToMatch() {
        if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
            const start = matches[currentMatchIndex];
            const end = start + searchInput.value.length;
            textarea.focus();
            textarea.setSelectionRange(start, end);
            
            // 简单的滚动定位：计算大概位置
            const lineHeight = 20; // 估算行高
            const textBefore = textarea.value.substring(0, start);
            const linesBefore = textBefore.split('\n').length;
            textarea.scrollTop = (linesBefore - 2) * lineHeight;
            
            updateUI();
        }
    }

    searchInput.addEventListener('input', performSearch);

    prevBtn.addEventListener('click', () => {
        if (matches.length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
        scrollToMatch();
    });

    nextBtn.addEventListener('click', () => {
        if (matches.length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % matches.length;
        scrollToMatch();
    });

    // 3. 替换逻辑
    replaceBtn.addEventListener('click', () => {
        if (currentMatchIndex === -1 || matches.length === 0) return;
        
        const query = searchInput.value;
        const replacement = replaceInput.value;
        const start = matches[currentMatchIndex];
        const end = start + query.length;
        
        const content = textarea.value;
        textarea.value = content.substring(0, start) + replacement + content.substring(end);
        
        // 触发 input 事件以更新预览
        textarea.dispatchEvent(new Event('input'));
        
        performSearch(); // 重新搜索
        if (matches.length > 0) {
            currentMatchIndex = Math.min(currentMatchIndex, matches.length - 1);
            scrollToMatch();
        }
        triggerHapticFeedback('light');
    });

    replaceAllBtn.addEventListener('click', () => {
        const query = searchInput.value;
        if (!query) return;
        
        const replacement = replaceInput.value;
        const content = textarea.value;
        const newContent = content.split(query).join(replacement);
        
        if (content === newContent) {
            showToast('未找到匹配内容');
            return;
        }
        
        textarea.value = newContent;
        textarea.dispatchEvent(new Event('input'));
        performSearch();
        showToast('全部替换完成');
        triggerHapticFeedback('medium');
    });

    // 监听文本框手动修改
    textarea.addEventListener('input', () => {
        if (mainBox.style.display !== 'none') {
            performSearch();
        }
    });
}

async function saveSettingsFromSidebar() {
    console.log('[保存设置] 开始保存, currentChatId:', currentChatId);
    const e = db.characters.find(e => e.id === currentChatId);
    if (!e) {
        console.error('[保存设置] 未找到角色, currentChatId:', currentChatId);
        showToast('错误：未找到角色数据');
        return;
    }
    console.log('[保存设置] 找到角色:', e.remarkName || e.realName);
    if (e) {
        e.avatar = document.getElementById('setting-char-avatar-preview').src;
        
        const oldRealName = e.realName;
        const newRealName = document.getElementById('setting-char-realname').value.trim();
        
        if (oldRealName && newRealName && oldRealName !== newRealName) {
            // 清洗历史记录中的旧真名
            const nameRegex = new RegExp(oldRealName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            if (e.history && e.history.length > 0) {
                e.history.forEach(msg => {
                    if (msg.content) {
                        msg.content = msg.content.replace(nameRegex, newRealName);
                    }
                });
            }
            e.realName = newRealName;
            showToast(`真名已从“${oldRealName}”修改为“${newRealName}”，历史记录已同步清洗`);
        } else if (newRealName) {
            e.realName = newRealName;
        }

        e.remarkName = document.getElementById('setting-char-remark').value;
        e.persona = document.getElementById('setting-char-persona').value;
        
        const selectedGroups = Array.from(document.querySelectorAll('#setting-char-sticker-groups-container .sticker-group-tag.selected'))
            .map(tag => tag.dataset.group)
            .join(',');
        e.stickerGroups = selectedGroups;

        e.myAvatar = document.getElementById('setting-my-avatar-preview').src;
        e.myName = document.getElementById('setting-my-name').value;
        e.myRemarkName = document.getElementById('setting-my-remark-name').value.trim();
        e.myPersona = document.getElementById('setting-my-persona').value;
        e.theme = document.getElementById('setting-theme-color').value;
        e.chatBgBlur = parseInt(document.getElementById('setting-chat-bg-blur').value, 10) || 0;
        const uiStyleSelectSave = document.getElementById('setting-char-ui-style');
        if (uiStyleSelectSave) e.uiStyle = uiStyleSelectSave.value;
        e.maxMemory = document.getElementById('setting-max-memory').value;
        e.replyCountEnabled = document.getElementById('setting-reply-count-enabled').checked;
        let rcMin = parseInt(document.getElementById('setting-reply-count-min').value, 10) || 3;
        let rcMax = parseInt(document.getElementById('setting-reply-count-max').value, 10) || 8;
        if (rcMin < 1) rcMin = 1;
        if (rcMax < rcMin) rcMax = rcMin;   // 上限不能小于下限
        e.replyCountMin = rcMin;
        e.replyCountMax = rcMax;
        
        const exclusiveApiSwitch = document.getElementById('setting-exclusive-api-enabled');
        if (exclusiveApiSwitch) {
            e.exclusiveApiEnabled = exclusiveApiSwitch.checked;
            e.exclusiveApiPreset = document.getElementById('setting-exclusive-api-preset-select').value;
            const exclusiveModelSelect = document.getElementById('setting-exclusive-api-model');
            e.exclusiveModel = exclusiveModelSelect ? exclusiveModelSelect.value : '';
        }

        const exclusivePromptVersionSelect = document.getElementById('setting-exclusive-prompt-version');
        if (exclusivePromptVersionSelect) {
            e.exclusivePromptVersion = exclusivePromptVersionSelect.value;
        }

        const exclusiveChatPresetSelect = document.getElementById('setting-exclusive-chat-preset');
        if (exclusiveChatPresetSelect) {
            e.exclusiveChatPreset = exclusiveChatPresetSelect.value;
        }

        const exclusiveCotPresetSelect = document.getElementById('setting-exclusive-cot-preset');
        if (exclusiveCotPresetSelect) {
            e.exclusiveCotPreset = exclusiveCotPresetSelect.value;
        }

        // 专属温度（Clawd 滑块）
        const tempState = (window.ClawdTemp && window.ClawdTemp.getState) ? window.ClawdTemp.getState() : null;
        if (tempState) {
            if (tempState.value === 'auto') {
                e.charTempEnabled = false;
            } else {
                e.charTempEnabled = true;
                e.charTemperature = tempState.temp;
            }
        }

        const charSoundEnabled = document.getElementById('setting-char-sound-enabled');
        if (charSoundEnabled) {
            e.charSoundEnabled = charSoundEnabled.checked;
            e.charSendSound = document.getElementById('char-send-sound-url').value.trim();
            e.charReceiveSound = document.getElementById('char-receive-sound-url').value.trim();
            e.charMultiMsgSound = document.getElementById('char-multi-msg-sound-switch').checked;
        }

        // 消息免打扰（后台通知）
        const charMutedSave = document.getElementById('setting-char-muted');
        if (charMutedSave) {
            e.muted = charMutedSave.checked;
        }

        const charCallVoiceSave = document.getElementById('setting-char-call-voice');
        if (charCallVoiceSave) {
            e.charCallVoice = charCallVoiceSave.checked;
        }

        const charCallSoundWatchSave = document.getElementById('setting-char-call-sound-watch');
        if (charCallSoundWatchSave) {
            e.charCallSoundWatch = charCallSoundWatchSave.checked;
        }

        // 通话形象（LivLiv 2.5D）
        const livlivSelSave = document.getElementById('setting-char-livliv-select');
        if (livlivSelSave) {
            e.livlivCharacter = livlivSelSave.value || '';
        }

        // 手机样式
        const phoneStyleSave = document.getElementById('setting-char-phone-style');
        if (phoneStyleSave) {
            const newStyle = phoneStyleSave.value || 'emu';
            const styleChanged = e.phoneStyle !== newStyle;
            e.phoneStyle = newStyle;
            if (styleChanged && typeof renderPeekPhoneIcon === 'function') {
                renderPeekPhoneIcon(e);
            }
        }

        // 查手机图标显隐；变化时立即刷新聊天页入口
        const peekBtnEnabledSave = document.getElementById('setting-char-peek-btn-enabled');
        if (peekBtnEnabledSave) {
            const wasHidden = !!e.peekBtnHidden;
            e.peekBtnHidden = !peekBtnEnabledSave.checked;
            if (wasHidden !== e.peekBtnHidden && typeof renderPeekPhoneIcon === 'function') {
                renderPeekPhoneIcon(e);
            }
        }

        // 功能面板文字颜色（A 模式加号面板）
        const funcLabelColorSave = document.getElementById('setting-char-func-label-color');
        if (funcLabelColorSave) {
            e.featureLabelColor = (funcLabelColorSave.dataset.isDefault === '1') ? '' : funcLabelColorSave.value;
            if (window.AMode && typeof window.AMode.applyAFeatureLabelColor === 'function') {
                try { window.AMode.applyAFeatureLabelColor(currentChatId); } catch (err) { console.warn('applyAFeatureLabelColor failed:', err); }
            }
        }

        e.useCustomBubbleCss = document.getElementById('setting-use-custom-css').checked;
        e.customBubbleCss = document.getElementById('setting-custom-bubble-css').value;
        /* 气泡字体：存字体库预设名（美化 APP 字体库），空 = 默认 */
        const bubbleFontSelSave = document.getElementById('setting-bubble-font');
        e.bubbleFont = bubbleFontSelSave ? bubbleFontSelSave.value : (e.bubbleFont || '');
        /* A 模式独立气泡样式（与 B 分开存储） */
        const aUseEl = document.getElementById('setting-a-use-custom-css'), aTaEl = document.getElementById('setting-a-custom-bubble-css');
        if (aUseEl && aTaEl) {
            e.aUseCustomBubbleCss = aUseEl.checked;
            e.aCustomBubbleCss = aTaEl.value;
            if (typeof updateACustomBubbleStyle === 'function') updateACustomBubbleStyle(currentChatId, e.aCustomBubbleCss, e.aUseCustomBubbleCss);
        }
        if (typeof applyBubbleThemeStyle === 'function') {
            /* 互斥：开着自定义气泡样式的模式不套气泡库 */
            const pModes = (typeof chatBubbleThemeModes === 'function') ? chatBubbleThemeModes(e) : { b: true, a: true };
            if (e.bubbleThemeId && (pModes.b || pModes.a)) {
                applyBubbleThemeStyle(currentChatId, e.bubbleThemeId, { skipB: !pModes.b, skipA: !pModes.a });
            } else {
                applyBubbleThemeStyle(currentChatId, '');
            }
        }
        e.bilingualModeEnabled = document.getElementById('setting-bilingual-mode').checked;
        e.bilingualBubbleStyle = document.getElementById('setting-bilingual-style').value;
        e.koreanModeEnabled = document.getElementById('setting-korean-mode').checked;
        
        e.avatarMode = document.getElementById('setting-avatar-mode').value;
        e.avatarRadius = parseInt(document.getElementById('setting-avatar-radius').value, 10);

        e.bubbleBlurEnabled = document.getElementById('setting-bubble-blur').checked;
        const chatScreen = document.getElementById('chat-room-screen');
        if (e.bubbleBlurEnabled) {
            chatScreen.classList.remove('disable-blur');
        } else {
            chatScreen.classList.add('disable-blur');
        }

        e.titleLayout = document.getElementById('setting-title-layout').value;
        const header = document.getElementById('chat-room-header-default');
        if (e.titleLayout === 'center') {
            header.classList.add('title-centered');
        } else {
            header.classList.remove('title-centered');
        }

        e.showTimestamp = document.getElementById('setting-show-timestamp').checked;
        
        if (e.showTimestamp) {
            chatScreen.classList.add('show-timestamp');
        } else {
            chatScreen.classList.remove('show-timestamp');
        }
        chatScreen.classList.remove('timestamp-side');

        e.timestampStyle = document.getElementById('setting-timestamp-style').value;
        chatScreen.classList.remove('timestamp-style-bubble', 'timestamp-style-avatar');
        chatScreen.classList.add(`timestamp-style-${e.timestampStyle || 'bubble'}`);

        e.showStatus = document.getElementById('setting-show-status').checked;
        const subtitle = document.getElementById('chat-room-subtitle');
        if (subtitle) {
            subtitle.style.display = e.showStatus ? 'flex' : 'none';
        }

        e.showStatusUpdateMsg = document.getElementById('setting-show-status-update-msg').checked;

        if (!e.statusPanel) e.statusPanel = {};
        e.statusPanel.enabled = document.getElementById('setting-status-panel-enabled').checked;
        e.statusPanel.promptSuffix = document.getElementById('setting-status-prompt-suffix').value;
        e.statusPanel.regexPattern = document.getElementById('setting-status-regex').value;
        e.statusPanel.replacePattern = document.getElementById('setting-status-replace').value;
        const historyLimitInput = parseInt(document.getElementById('setting-status-history-limit').value, 10);
        e.statusPanel.historyLimit = isNaN(historyLimitInput) ? 3 : historyLimitInput;
        const statusRandomCheckbox = document.getElementById('setting-status-random-enabled');
        if (statusRandomCheckbox) e.statusPanel.randomEnabled = statusRandomCheckbox.checked;

        e.shopInteractionEnabled = document.getElementById('setting-shop-interaction-enabled').checked;

        e.momentsEnabled = document.getElementById('setting-moments-enabled').checked;

        const stardustCheckbox = document.getElementById('setting-stardust-enabled');
        if (stardustCheckbox) e.stardustEnabled = stardustCheckbox.checked;
        const snapCheckbox = document.getElementById('setting-snap-enabled');
        if (snapCheckbox) e.snapEnabled = snapCheckbox.checked;

        const blackboxCheckbox = document.getElementById('setting-blackbox-enabled');
        if (blackboxCheckbox) e.blackboxEnabled = blackboxCheckbox.checked;
        const blackboxLevels = document.getElementById('setting-blackbox-levels');
        if (blackboxLevels) {
            if (!e.blackbox || typeof e.blackbox !== 'object') e.blackbox = { events: [], lastErrors: [], levels: '' };
            e.blackbox.levels = blackboxLevels.value;
        }

        const stickerReactionCheckbox = document.getElementById('setting-sticker-reaction-enabled');
        if (stickerReactionCheckbox) e.stickerReactionEnabled = stickerReactionCheckbox.checked;

        e.videoCallEnabled = document.getElementById('setting-video-call-enabled').checked;

        const foodRecordCheckboxSave = document.getElementById('setting-food-record-enabled');
        if (foodRecordCheckboxSave) e.foodRecordEnabled = foodRecordCheckboxSave.checked;

        if (!e.autoReply) e.autoReply = {};
        e.autoReply.enabled = document.getElementById('setting-auto-reply-enabled').checked;
        const autoReplyIntervalInput = parseInt(document.getElementById('setting-auto-reply-interval').value, 10);
        e.autoReply.interval = isNaN(autoReplyIntervalInput) ? 60 : autoReplyIntervalInput;

        const autoAirdropCheckbox = document.getElementById('setting-auto-airdrop-enabled');
        if (autoAirdropCheckbox) {
            e.autoAirDropEnabled = autoAirdropCheckbox.checked;
        }

        const autoImageGenCheckboxSave = document.getElementById('setting-auto-image-gen-enabled');
        if (autoImageGenCheckboxSave) {
            e.autoImageGen = autoImageGenCheckboxSave.checked;
        }

        // A模式自动回复（发消息后 N 秒未再发才触发，0=关闭）
        const aDelayCheckboxSave = document.getElementById('setting-a-delay-reply-enabled');
        if (aDelayCheckboxSave) {
            const aDelaySec = parseInt(document.getElementById('setting-a-delay-reply-seconds').value, 10);
            e.aReplyDelay = aDelayCheckboxSave.checked ? (isNaN(aDelaySec) ? 3 : Math.max(1, aDelaySec)) : 0;
        }

        e.useRealGallery = document.getElementById('setting-use-real-gallery').checked;

        console.log('[保存设置] 开始写入数据库...');
        await saveData();
        console.log('[保存设置] 保存成功');


        // 主动发消息：通知队列同步
        var _autoReplyOn = !!(e.autoReply && e.autoReply.enabled);
        var _autoReplyMsg = '';
        if (window.OctoNative && typeof window.OctoNative.replanChar === 'function') {
            try {
                window.OctoNative.replanChar(e.id);
                if (window.__autoReplyWasOn && !_autoReplyOn) {
                    _autoReplyMsg = '已关闭主动发消息，排好的提醒已撤回';
                } else if (!window.__autoReplyWasOn && _autoReplyOn) {
                    _autoReplyMsg = '已开启主动发消息，接下来一天她会来找你';
                }
            } catch (err) { console.warn('[主动发消息] 排程同步失败', err); }
        }
        window.__autoReplyWasOn = _autoReplyOn;

        showToast(_autoReplyMsg || '设置已保存！');
        chatRoomTitle.textContent = e.remarkName;
        renderChatList();
        currentPage = 1;
        renderMessages(false, true);
    }
}

// 备份提示
function promptForBackupIfNeeded(triggerType) {
    if (triggerType === 'history_milestone') {
        showToast('uwu提醒您：记得备份噢');
    }
}

// 重新计算并更新角色状态
function recalculateChatStatus(chat) {
    if (!chat || !chat.history) return;
    
    
    if (!chat.realName) return; // 简单判断，群聊通常没有单人的 realName 用于状态更新（群聊逻辑不同）

    const updateStatusRegex = new RegExp(`\\[${chat.realName}更新状态为：(.*?)\\]`);
    let foundStatus = '在线'; // 默认状态

    // 倒序遍历历史记录
    for (let i = chat.history.length - 1; i >= 0; i--) {
        const msg = chat.history[i];
        // 忽略被撤回的消息
        if (msg.isWithdrawn) continue;

        const match = msg.content.match(updateStatusRegex);
        if (match) {
            foundStatus = match[1];
            break; // 找到最近的一个状态，停止遍历
        }
    }

    // 更新状态
    chat.status = foundStatus;
    
    // 如果当前正在该聊天室，实时更新 UI
    if (currentChatId === chat.id) {
        const statusTextEl = document.getElementById('chat-room-status-text');
        if (statusTextEl) {
            statusTextEl.textContent = foundStatus;
        }
    }
}

/* ==================== A 模式专用自定义气泡样式 ==================== */
const A_BUBBLE_UI_CFG = {
    private: {
        wrapA: 'a-bubble-style-group', wrapB: 'b-bubble-style-group',
        use: 'setting-a-use-custom-css', ta: 'setting-a-custom-bubble-css',
        preview: 'a-bubble-css-preview', sel: 'a-bubble-preset-select',
        apply: 'a-apply-preset-btn', save: 'a-save-preset-btn', manage: 'a-manage-presets-btn',
        exp: 'a-export-preset-btn', imp: 'a-import-preset-btn', reset: 'a-reset-a-bubble-css-btn'
    },
    group: {
        wrapA: 'a-group-bubble-style-group', wrapB: 'b-group-bubble-style-group',
        use: 'setting-group-a-use-custom-css', ta: 'setting-group-a-custom-bubble-css',
        preview: 'a-group-bubble-css-preview', sel: 'a-group-bubble-preset-select',
        apply: 'a-group-apply-preset-btn', save: 'a-group-save-preset-btn', manage: 'a-group-manage-presets-btn',
        exp: 'a-group-export-preset-btn', imp: 'a-group-import-preset-btn', reset: 'a-reset-group-a-bubble-css-btn'
    }
};
const _aBubbleWired = {};

function _getABubblePresets() { return db.aBubbleCssPresets || []; }
function _saveABubblePresets(arr) { db.aBubbleCssPresets = arr || []; saveData(); }
function _populateABubblePresetSelect(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    _getABubblePresets().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}
/* A 模式整页预览：仿 A 聊天页的顶栏 + 消息 + 输入栏。
   默认样式一律写成 :where(外壳) .xxx —— :where() 不计特异性，所以填进来的美化 CSS
   能盖住这些默认值，优先级关系和真实页面一致 */
const A_PAGE_PREVIEW_CSS = [
    '.a-bubble-css-preview-scope{background:transparent;border-radius:10px;padding:6px 8px;overflow:hidden;font-size:13px;color:#111;}',
    ':where(.a-bubble-css-preview-scope) .a-header{display:flex;align-items:center;gap:8px;padding:4px 2px 8px;border-bottom:1px solid #f2f2f2;}',
    ':where(.a-bubble-css-preview-scope) .a-iconbtn{width:24px;height:24px;flex:none;border:none;background:transparent;color:#333;display:flex;align-items:center;justify-content:center;}',
    ':where(.a-bubble-css-preview-scope) .a-iconbtn svg{width:15px;height:15px;}',
    ':where(.a-bubble-css-preview-scope) .a-title{flex:1;min-width:0;text-align:center;}',
    ':where(.a-bubble-css-preview-scope) .a-title h1{margin:0;font-size:14px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    ':where(.a-bubble-css-preview-scope) .a-title .sub{font-size:11px;color:#999;}',
    ':where(.a-bubble-css-preview-scope) .a-log{padding:8px 2px;display:flex;flex-direction:column;gap:8px;}',
    ':where(.a-bubble-css-preview-scope) .a-row{display:flex;gap:6px;align-items:flex-start;}',
    ':where(.a-bubble-css-preview-scope) .a-row.me{justify-content:flex-end;}',
    ':where(.a-bubble-css-preview-scope) .a-avatar{width:26px;height:26px;flex:none;border-radius:50%;background:#e8e8e8 var(--a-pv-av, none) center/cover no-repeat;}',
    ':where(.a-bubble-css-preview-scope) .a-body{max-width:80%;}',
    ':where(.a-bubble-css-preview-scope) .a-who{font-size:10px;color:#999;margin:0 0 3px 3px;}',
    ':where(.a-bubble-css-preview-scope) .a-bubble{display:inline-block;background:#a2d2ff;color:#111;padding:7px 11px;border-radius:14px;}',
    ':where(.a-bubble-css-preview-scope) .a-gu{display:inline-block;background:#f2f2f2;color:#111;padding:7px 11px;border-radius:14px;}',
    ':where(.a-bubble-css-preview-scope) .a-foot{border-top:1px solid #f2f2f2;padding:7px 2px 2px;}',
    ':where(.a-bubble-css-preview-scope) .a-composer{border:1px solid #eee;border-radius:12px;padding:6px 8px;}',
    ':where(.a-bubble-css-preview-scope) .a-box{display:block;width:100%;border:none;background:transparent;font-size:12px;color:#888;outline:none;}',
    ':where(.a-bubble-css-preview-scope) .a-ctlrow{display:flex;align-items:center;gap:8px;margin-top:5px;}',
    ':where(.a-bubble-css-preview-scope) .a-ctl,:where(.a-bubble-css-preview-scope) .a-send{width:22px;height:22px;border:none;background:transparent;color:#333;display:flex;align-items:center;justify-content:center;}',
    ':where(.a-bubble-css-preview-scope) .a-ctl svg,:where(.a-bubble-css-preview-scope) .a-send svg{width:14px;height:14px;}',
    ':where(.a-bubble-css-preview-scope) .a-gap{flex:1;}'
].join('');
const A_PV_ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h16"></path></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="12" cy="19" r="1.7"></circle></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>'
};

function _updateABubbleCssPreview(box, css, useDefault) {
    if (!box) return;
    box.innerHTML = '';
    const chat = (typeof _abubbleChatOf === 'function') ? _abubbleChatOf() : null;
    const name = (chat && (chat.remarkName || chat.name)) || '';
    const mkStyle = (text) => {
        const s = document.createElement('style');
        s.className = 'a-bubble-preview-style';
        s.textContent = text;
        return s;
    };
    const page = document.createElement('div');
    page.className = 'a-bubble-css-preview-scope';

    const log = document.createElement('div');
    log.className = 'a-log';
    const meRow = document.createElement('div');
    meRow.className = 'a-row me';
    const meBody = document.createElement('div');
    meBody.className = 'a-body';
    const meBub = document.createElement('div');
    meBub.className = 'a-bubble';
    meBub.textContent = '我发出去的消息';
    meBody.appendChild(meBub); meRow.appendChild(meBody); log.appendChild(meRow);

    const aiRow = document.createElement('div');
    aiRow.className = 'a-row has-av';
    const av = document.createElement('div');
    av.className = 'a-avatar';
    const avUrl = chat && (chat.avatar || (chat.members && chat.members[0] && chat.members[0].avatar) || '');
    if (avUrl) av.style.setProperty('--a-pv-av', 'url("' + String(avUrl).replace(/"/g, '%22') + '")');
    const aiBody = document.createElement('div');
    aiBody.className = 'a-body';
    const who = document.createElement('div');
    who.className = 'a-who';
    who.textContent = name || 'TA';
    const gu = document.createElement('div');
    gu.className = 'a-gu';
    gu.textContent = '对方回的消息';
    aiBody.appendChild(who); aiBody.appendChild(gu);
    aiRow.appendChild(av); aiRow.appendChild(aiBody); log.appendChild(aiRow);
    page.appendChild(log);

    page.appendChild(mkStyle(A_PAGE_PREVIEW_CSS));
    box.style.opacity = useDefault ? '0.55' : '1';
    if (!useDefault && css) {
        const done = (typeof processTemplate === 'function' && chat) ? processTemplate(css, chat) : css;
        page.appendChild(mkStyle(done));
    }
    box.appendChild(page);
}
/* 把 A 的 CSS 注入页面（并清掉 B 的注入，保证两模式互不污染） */
function updateACustomBubbleStyle(chatId, css, enabled) {
    document.querySelectorAll('style[id^="a-custom-bubble-style-for-"]').forEach(el => el.remove());
    // 不在 A 模式就不往页面上贴 A 的整页 CSS，PHONE 那边各管各的
    if (!isAClaudeUI()) return;
    // 同步应用气泡库主题
    if (typeof applyBubbleThemeForChat === 'function' && chatId) applyBubbleThemeForChat(chatId);
    document.querySelectorAll('style[id^="custom-bubble-style-for-"]').forEach(el => el.remove());
    if (!enabled || !css) return;
    let chat = null;
    if (typeof db !== 'undefined') {
        chat = (db.characters || []).find(c => c.id === chatId) || (db.groups || []).find(g => g.id === chatId);
    }
    const processedCss = (typeof processTemplate === 'function' && chat) ? processTemplate(css, chat) : css;
    const st = document.createElement('style');
    st.id = 'a-custom-bubble-style-for-' + chatId;
    st.textContent = processedCss;
    document.head.appendChild(st);
}
function _openABubblePresetPicker(cfg) {
    const presets = _getABubblePresets();
    if (!presets.length) return showToast('暂无预设，可先点「存」把当前气泡 CSS 保存为预设');
    let ov = document.getElementById('a-bubble-preset-picker-modal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'a-bubble-preset-picker-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.style.display = 'none'; });
    }
    const listHtml = presets.map(p =>
        '<div class="abpp-row" data-name="' + p.name.replace(/"/g, '&quot;') + '" style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid #f0f0f0;">'
        + '<div class="abpp-name" style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;color:#333;">' + p.name + '</div>'
        + '<button type="button" class="abpp-preview-btn mono-btn" style="padding:5px 10px;border-radius:8px;font-size:12px;">查看预览</button>'
        + '<button type="button" class="abpp-apply-btn mono-btn mono-btn-primary" style="padding:5px 10px;border-radius:8px;font-size:12px;">应用</button>'
        + '</div>').join('');
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:320px;max-width:88vw;max-height:70vh;display:flex;flex-direction:column;padding:14px;">'
        + '<div style="text-align:center;font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">选择预设</div>'
        + '<div style="flex:1;overflow-y:auto;">' + listHtml + '</div>'
        + '<button type="button" id="abpp-picker-close" class="mono-btn" style="margin-top:10px;width:100%;border-radius:10px;">取消</button>'
        + '</div>';
    ov.style.display = 'flex';
    ov.querySelectorAll('.abpp-row').forEach(row => {
        const name = row.dataset.name;
        row.querySelector('.abpp-preview-btn').addEventListener('click', () => _openABubblePresetPreview(name));
        row.querySelector('.abpp-apply-btn').addEventListener('click', () => {
            ov.style.display = 'none';
            const preset = _getABubblePresets().find(p => p.name === name);
            if (!preset) return showToast('未找到该预设');
            const ta = document.getElementById(cfg.ta);
            const use = document.getElementById(cfg.use);
            if (!ta || !use) return;
            ta.value = preset.css;
            use.checked = true; ta.disabled = false;
            const chat2 = _abubbleChatOf();
            if (chat2) { chat2.aCustomBubbleCss = preset.css; chat2.aUseCustomBubbleCss = true; }
            _updateABubbleCssPreview(document.getElementById(cfg.preview), preset.css, false);
            showToast('已应用，记得保存');
        });
    });
    ov.querySelector('#abpp-picker-close').addEventListener('click', () => { ov.style.display = 'none'; });
}

/* A 模式预设预览：用该预设的 CSS 实时渲染两条示例消息 */
function _openABubblePresetPreview(name) {
    const preset = _getABubblePresets().find(p => p.name === name);
    if (!preset) return showToast('未找到该预设');
    let ov = document.getElementById('a-bubble-preset-preview-modal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'a-bubble-preset-preview-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:4100;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.style.display = 'none'; });
    }
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:340px;max-width:92vw;max-height:82vh;overflow:auto;padding:12px;position:relative;">'
        + '<button type="button" id="abpp-close" style="position:absolute;top:6px;right:8px;border:none;background:rgba(0,0,0,0.05);border-radius:50%;width:26px;height:26px;font-size:14px;color:#666;cursor:pointer;">✕</button>'
        + '<div style="text-align:center;font-size:14px;font-weight:600;color:#333;margin:4px 0 10px;">' + name + '</div>'
        + '<div class="abpp-preview-box" style="border:1px solid #f0f0f0;border-radius:12px;padding:10px;"></div>'
        + '</div>';
    ov.style.display = 'flex';
    _updateABubbleCssPreview(ov.querySelector('.abpp-preview-box'), preset.css, false);
    ov.querySelector('#abpp-close').addEventListener('click', () => { ov.style.display = 'none'; });
}

function _openABubbleManageModal(onChange) {
    let modal = document.getElementById('a-bubble-manage-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'a-bubble-manage-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:3000;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = '<div style="background:#fff;border-radius:16px;width:300px;max-height:70%;overflow-y:auto;padding:16px;" id="a-bubble-manage-box"><div style="font-weight:bold;margin-bottom:10px;">管理气泡预设（A 模式）</div><div id="a-bubble-manage-list"></div><button type="button" id="a-bubble-manage-close" class="btn" style="margin-top:10px;width:100%;">关闭</button></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        document.getElementById('a-bubble-manage-close').addEventListener('click', () => { modal.style.display = 'none'; });
    }
    const list = modal.querySelector('#a-bubble-manage-list');
    list.innerHTML = '';
    const presets = _getABubblePresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;';
        const name = document.createElement('div');
        name.style.cssText = 'flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
        name.textContent = p.name;
        row.appendChild(name);
        const ops = document.createElement('div');
        ops.style.cssText = 'display:flex;gap:6px;';
        const rn = document.createElement('button');
        rn.className = 'btn'; rn.style.padding = '6px 8px'; rn.textContent = '重命名';
        rn.onclick = () => {
            const nn = prompt('输入新名称：', p.name);
            if (!nn || nn === p.name) return;
            _getABubblePresets()[idx].name = nn;
            _saveABubblePresets(_getABubblePresets());
            _openABubbleManageModal(onChange); onChange && onChange();
        };
        const del = document.createElement('button');
        del.className = 'btn btn-danger'; del.style.padding = '6px 8px'; del.textContent = '删除';
        del.onclick = () => {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            const arr = _getABubblePresets(); arr.splice(idx, 1);
            _saveABubblePresets(arr);
            _openABubbleManageModal(onChange); onChange && onChange();
        };
        ops.appendChild(rn); ops.appendChild(del); row.appendChild(ops);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}
function _abubbleChatOf() {
    return (currentChatType === 'private')
        ? (db.characters || []).find(c => c.id === currentChatId)
        : (db.groups || []).find(g => g.id === currentChatId);
}
/* ==================== 气泡库 ==================== */
/* 角色设置的气泡库入口：点击弹出全屏气泡库进行选择（支持搜索 / 导入 / 删除） */
function setupBubbleLibraryUI(kind) {
    const entryId = kind === 'private' ? 'bubble-library-entry' : 'group-bubble-library-entry';
    const nameId = kind === 'private' ? 'bubble-library-entry-name' : 'group-bubble-library-entry-name';
    const entry = document.getElementById(entryId);
    const nameEl = document.getElementById(nameId);
    const chat = _abubbleChatOf();
    if (!entry || !chat) return;
    const eff = (typeof getEffectiveBubbleTheme === 'function') ? getEffectiveBubbleTheme(chat) : null;
    if (nameEl) nameEl.textContent = eff ? eff.name : '默认气泡';
    entry.onclick = () => {
        openBubbleLibraryOverlay({
            current: chat.bubbleThemeId || '',
            onPick: (id) => {
                const c = _abubbleChatOf();
                if (!c) return;
                c.bubbleThemeId = id;
                if (typeof saveData === 'function') saveData();
                if (typeof applyBubbleThemeStyle === 'function') {
                    /* 互斥：开着自定义气泡样式的模式不套气泡库，提示关闭后生效 */
                    const pModes = (typeof chatBubbleThemeModes === 'function') ? chatBubbleThemeModes(c) : { b: true, a: true };
                    const allowB = (db.uiMode !== 'a') ? pModes.b : pModes.a;
                    if (id && (pModes.b || pModes.a)) {
                        applyBubbleThemeStyle(currentChatId, id, { skipB: !pModes.b, skipA: !pModes.a });
                    } else {
                        applyBubbleThemeStyle(currentChatId, '');
                    }
                    const t2 = (typeof getBubbleTheme === 'function') ? getBubbleTheme(id) : null;
                    if (t2 && !allowB && typeof showToast === 'function') {
                        showToast(`已选用「${t2.name}」，自定义气泡样式开着，关闭后生效`);
                    }
                }
                setupBubbleLibraryUI(kind);
                const t = (typeof getBubbleTheme === 'function') ? getBubbleTheme(id) : null;
                if (typeof showToast === 'function') showToast(t ? `已选用「${t.name}」` : '已恢复默认气泡');
            }
        });
    };
}

/* zk11e：美化 Tab 按模式分流 —— CLAUDE(A) 模式只显示 A 侧设置，PHONE 专属项隐藏；
   气泡相关设置（气泡库 + A 自定义气泡样式）折叠进「气泡设置」，点 A 外观组的「气泡」行或折叠头展开/收起 */
function applyStyleTabModeScope() {
    const tab = document.getElementById('setting-tab-style');
    if (!tab) return;
    const isAMode = (window.AMode && typeof window.AMode.isEnabled === 'function') ? window.AMode.isEnabled() : (db && db.uiMode === 'a');
    tab.classList.toggle('a-mode-scope', !!isAMode);

    const lib = document.getElementById('bubble-library-group');
    const abg = document.getElementById('a-bubble-style-group');
    const bGroup = document.getElementById('b-bubble-style-group');
    let fold = document.getElementById('a-bubble-fold');

    if (!isAMode) {
        /* PHONE 模式：把气泡组挪回原位（气泡库在自定义样式组之前），拆掉折叠容器 */
        if (fold) {
            if (lib && bGroup && bGroup.parentNode === tab) bGroup.before(lib); else if (lib) tab.appendChild(lib);
            if (abg) tab.appendChild(abg);
            fold.remove();
        }
        return;
    }

    /* A 模式：包一个折叠容器，头行点击展开/收起 */
    if (!fold) {
        fold = document.createElement('div');
        fold.id = 'a-bubble-fold';
        fold.innerHTML = '<div class="kkt-group a-bubble-fold-head" id="a-bubble-fold-head"><div class="kkt-item"><div class="kkt-item-label">气泡设置</div><span class="kkt-arrow a-bubble-fold-arrow">›</span></div></div>';
        const look = document.getElementById('a-mode-look-group');
        if (look && look.parentNode === tab) look.after(fold);
        else tab.insertBefore(fold, tab.firstChild);
        fold.querySelector('#a-bubble-fold-head').addEventListener('click', () => fold.classList.toggle('open'));
    }
    if (lib) fold.appendChild(lib);
    if (abg) fold.appendChild(abg);

    /* A 外观组里的「气泡」那一栏：点击行 = 展开/收起（点开关本体仍只切开关） */
    const bubbleToggle = document.getElementById('a-mode-bubble-toggle');
    if (bubbleToggle) {
        const row = bubbleToggle.closest('.kkt-item');
        if (row && !row.dataset.foldWired) {
            row.dataset.foldWired = '1';
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                if (e.target.closest('.kkt-switch')) return;
                fold.classList.toggle('open');
            });
        }
    }
}

function setupABubbleStyleUI(kind) {
    const cfg = A_BUBBLE_UI_CFG[kind];
    if (!cfg) return;
    const isAMode = (db.uiMode === 'a');
    const wrapA = document.getElementById(cfg.wrapA), wrapB = document.getElementById(cfg.wrapB);
    if (wrapA) wrapA.style.display = isAMode ? '' : 'none';
    if (wrapB) wrapB.style.display = isAMode ? 'none' : '';
    const chat = _abubbleChatOf();
    const use = document.getElementById(cfg.use), ta = document.getElementById(cfg.ta);
    if (!use || !ta || !chat) return;
    use.checked = chat.aUseCustomBubbleCss || false;
    ta.value = chat.aCustomBubbleCss || '';
    ta.disabled = !use.checked;
    _updateABubbleCssPreview(document.getElementById(cfg.preview), chat.aCustomBubbleCss || '', !use.checked);
    _populateABubblePresetSelect(cfg.sel);
    use.onchange = () => { ta.disabled = !use.checked; };
    if (!_aBubbleWired[kind]) {
        _aBubbleWired[kind] = true;
        const refresh = () => {
            _populateABubblePresetSelect(cfg.sel);
            _updateABubbleCssPreview(document.getElementById(cfg.preview), ta.value, !use.checked);
        };
        const c = document.getElementById(cfg.apply);
        if (c) c.addEventListener('click', () => {
            // 点击「选择预设」→ 居中小弹窗（预设名 + 查看预览 + 应用），与 B 模式一致
            _openABubblePresetPicker(cfg);
        });
        const s = document.getElementById(cfg.save);
        if (s) s.addEventListener('click', () => {
            const css = ta.value.trim();
            if (!css) return showToast('先填写 CSS 再保存');
            const name = prompt('预设名称：');
            if (!name) return;
            const arr = _getABubblePresets();
            const idx = arr.findIndex(p => p.name === name);
            if (idx >= 0) {
                if (!confirm('已存在 "' + name + '"，覆盖？')) return;
                arr[idx].css = css;
            } else arr.push({ name, css });
            _saveABubblePresets(arr);
            _populateABubblePresetSelect(cfg.sel);
            showToast('已保存');
        });
        const m = document.getElementById(cfg.manage);
        if (m) m.addEventListener('click', () => _openABubbleManageModal(() => _populateABubblePresetSelect(cfg.sel)));
        const ex = document.getElementById(cfg.exp);
        if (ex) ex.addEventListener('click', () => {
            const css = ta.value.trim();
            if (!css) return showToast('先填写 CSS 再导出');
            const name = prompt('导出预设名称：');
            if (!name) return;
            const blob = new Blob([JSON.stringify({ name, css, authorNote: '' }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'bubble_preset_' + name + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        });
        const im = document.getElementById(cfg.imp);
        if (im) im.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,.txt';
            inp.onchange = () => {
                const file = inp.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        let data;
                        if (file.name.toLowerCase().endsWith('.json')) {
                            data = JSON.parse(reader.result);
                            if (!data.name || typeof data.css === 'undefined') throw new Error('无效的预设文件');
                        } else {
                            data = { name: file.name.replace(/\.[^.]+$/, ''), css: String(reader.result) };
                        }
                        const arr = _getABubblePresets();
                        const idx = arr.findIndex(p => p.name === data.name);
                        if (idx >= 0) {
                            if (!confirm('已存在 "' + data.name + '"，覆盖？')) return;
                            arr[idx].css = data.css;
                        } else arr.push({ name: data.name, css: data.css });
                        _saveABubblePresets(arr);
                        _populateABubblePresetSelect(cfg.sel);
                        showToast('预设导入成功');
                    } catch (err) { showToast('导入失败：' + err.message); }
                };
                reader.readAsText(file);
            };
            inp.click();
        });
        const r = document.getElementById(cfg.reset);
        if (r) r.addEventListener('click', async () => {
            if (!confirm('清空当前聊天的整页美化CSS？')) return;
            ta.value = ''; use.checked = false; ta.disabled = true;
            const chat2 = _abubbleChatOf();
            if (chat2) {
                chat2.aCustomBubbleCss = ''; chat2.aUseCustomBubbleCss = false;
                chat2.bubbleThemeId = ''; /* 重置同时清掉气泡库选择 */
            }
            refresh();
            if (typeof applyBubbleThemeForChat === 'function') applyBubbleThemeForChat(currentChatId);
            if (typeof setupBubbleLibraryUI === 'function') setupBubbleLibraryUI(kind);
            if (typeof saveData === 'function') await saveData();
            showToast('样式已重置为默认（气泡库选择已清空）');
        });
    }
}

/* ===================== 表情编辑器 ===================== */

/* （zk11f 已移除快捷 emoji 区，此常量保留给默认打底列表备用） */
const STICKER_QUICK_EMOJIS = ['❤️', '🥺', '😂', '🫣', '😡', '🐰', '🫶', '😍', '😭', '👍', '🙏', '✨', '😘', '🤔', '💀', '🎀', '🥰', '😳', '🤗', '🫠', '🙈', '💤', '🐶', '🐱', '🐻', '🌟', '💢', '😢', '😇', '🤡', '🎉', '🔥', '🍉', '🌊', '🌷', '🥀', '👁️', '🫧'];

function _stickerSegmentFirst(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    try {
        if (window.Intl && Intl.Segmenter) {
            const first = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(t)][0];
            if (first && first.segment) return first.segment;
        }
    } catch (err) { /* 降级 */ }
    return t.slice(0, 8);
}

/* zk11f：贴表情编辑器
   - 去掉快捷 emoji 按钮区，只留手动输入添加
   - opts.defaults：列表为空时先显示默认表情（如长按气泡的默认胶囊表情），
     用户一动手编辑（删/加）就把当前显示的整套落库保存 */
function renderStickerEmojiEditor(container, emojis, opts) {
    if (!container) return;
    opts = opts || {};
    let list = (emojis || []).filter(e => typeof e === 'string' && e && e.trim()).slice();
    /* 当前展示的列表：自己设过用自己没？没设过用默认打底 */
    const shown = () => list.length ? list : (opts.defaults || []);
    /* 用户动手编辑的那一刻，把打底的默认表情物化成自己的列表 */
    const materialize = () => { if (!list.length && (opts.defaults || []).length) list = opts.defaults.slice(); };
    const save = () => { if (opts.onChange) opts.onChange(list.slice()); };

    function rebuildListFromDom() {
        list = [...container.querySelectorAll('.see-chip')].map(c => c.__emoji);
    }

    function attachDrag(chip) {
        let sx = 0, sy = 0, holdTimer = null, dragging = false;
        chip.addEventListener('touchstart', (ev) => {
            const t = ev.touches[0];
            sx = t.clientX; sy = t.clientY;
            holdTimer = setTimeout(() => {
                dragging = true;
                chip.classList.add('see-dragging');
                if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) {} }
            }, 280);
        }, { passive: true });
        chip.addEventListener('touchmove', (ev) => {
            const t = ev.touches[0];
            if (!dragging) {
                if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(holdTimer);
                return;
            }
            ev.preventDefault();
            chip.style.transform = `translate(${t.clientX - sx}px, ${t.clientY - sy}px) scale(1.18)`;
            const under = document.elementFromPoint(t.clientX, t.clientY);
            const target = under && under.closest ? under.closest('.see-chip') : null;
            if (target && target !== chip && container.contains(target)) {
                const chips = [...container.querySelectorAll('.see-chip')];
                const fromIdx = chips.indexOf(chip);
                const toIdx = chips.indexOf(target);
                if (fromIdx < toIdx) target.parentNode.insertBefore(chip, target.nextSibling);
                else target.parentNode.insertBefore(chip, target);
            }
        }, { passive: false });
        const finish = () => {
            clearTimeout(holdTimer);
            if (dragging) {
                dragging = false;
                chip.classList.remove('see-dragging');
                chip.style.transform = '';
                rebuildListFromDom();
                save();
            }
        };
        chip.addEventListener('touchend', finish);
        chip.addEventListener('touchcancel', finish);
    }

    function buildAddRow() {
        const row = document.createElement('div');
        row.className = 'see-add-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'see-add-input';
        input.placeholder = '输入 emoji 添加';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'see-add-btn';
        addBtn.textContent = '添加';
        const tryAdd = () => {
            const emoji = _stickerSegmentFirst(input.value);
            if (!emoji) return;
            materialize();
            if (shown().includes(emoji)) { showToast('已经在列表里啦'); return; }
            list.push(emoji);
            save();
            renderAll();
        };
        addBtn.addEventListener('click', tryAdd);
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); tryAdd(); } });
        row.appendChild(input);
        row.appendChild(addBtn);
        return row;
    }

    function renderAll() {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'see-chips';
        const base = shown();
        base.forEach((emoji) => {
            const chip = document.createElement('span');
            chip.className = 'see-chip';
            chip.__emoji = emoji;
            const t = document.createElement('i');
            t.textContent = emoji;
            chip.appendChild(t);
            const x = document.createElement('b');
            x.textContent = '×';
            x.addEventListener('click', (ev) => {
                ev.stopPropagation();
                materialize();
                list = list.filter(e => e !== emoji);
                save();
                renderAll();
            });
            chip.appendChild(x);
            attachDrag(chip);
            wrap.appendChild(chip);
        });
        if (base.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'see-empty';
            empty.textContent = '(空)';
            wrap.appendChild(empty);
        }
        container.appendChild(wrap);
        container.appendChild(buildAddRow());
    }

    renderAll();
}
