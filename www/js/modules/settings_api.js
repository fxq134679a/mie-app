// --- API 设置与预设管理逻辑 ---

// Dylan Heartbeat 默认配置 — 如果电脑局域网 IP 变了，在设置页的粉色区块里改 Gateway 地址就行
const HEARTBEAT_DEFAULTS = {
    url: 'http://192.168.1.103:3000',
    key: 'miemie_local_gateway_key_please_change_me_x9K3pQvL',
    model: 'gemini-3-flash-preview',
    provider: 'newapi'
};

function setupHeartbeatToggle() {
    const switchEl = document.getElementById('heartbeat-mode-switch');
    const rowEl    = document.getElementById('heartbeat-settings-row');
    const urlEl    = document.getElementById('heartbeat-gateway-url');
    const saveBtn  = document.getElementById('heartbeat-save-btn');
    const tipEl    = document.getElementById('heartbeat-status-tip');

    const providerEl = document.getElementById('api-provider');
    const apiUrlEl   = document.getElementById('api-url');
    const apiKeyEl   = document.getElementById('api-key');
    const apiModelEl = document.getElementById('api-model');
    const fetchBtn   = document.getElementById('fetch-models-btn');

    if (!switchEl) return;

    // 初始化：恢复持久化的开关状态 / Gateway 地址
    const savedHeartbeat = (db.apiSettings && db.apiSettings.heartbeat) || {};
    const heartbeatUrl  = savedHeartbeat.url  || HEARTBEAT_DEFAULTS.url;
    const heartbeatKey  = savedHeartbeat.key  || HEARTBEAT_DEFAULTS.key;
    const heartbeatModel= savedHeartbeat.model|| HEARTBEAT_DEFAULTS.model;

    urlEl.value = heartbeatUrl;

    const isOn = !!savedHeartbeat.enabled;
    switchEl.checked = isOn;
    rowEl.style.display = isOn ? 'block' : 'none';
    applyHeartbeatLock(isOn);

    // 如果上次是 ON，自动把 Gateway 配置重新灌回表单（避免刷新后 apiSettings 里还是旧值）
    if (isOn) {
        applyHeartbeatToForm({ url: heartbeatUrl, key: heartbeatKey, model: heartbeatModel });
    }

    function applyHeartbeatLock(on) {
        // 开关 ON 时，锁住下面基础配置那几个字段，防止手滑改了以为还在走 Gateway
        [providerEl, apiUrlEl, apiKeyEl].forEach(el => { if (el) el.disabled = on; });
        if (on) {
            [providerEl, apiUrlEl, apiKeyEl].forEach(el => { if (el) el.style.opacity = '0.5'; });
            tipEl.textContent = '💗 已启用 Dylan Heartbeat：AI 会自动醒来关心你';
        } else {
            [providerEl, apiUrlEl, apiKeyEl].forEach(el => { if (el) { el.disabled = false; el.style.opacity = ''; } });
            tipEl.textContent = '';
        }
    }

    function applyHeartbeatToForm(cfg) {
        providerEl.value = cfg.provider || 'newapi';
        apiUrlEl.value   = cfg.url;
        apiKeyEl.value   = cfg.key;
        // model 要等拉取完再填，但先塞个占位选项防止下拉为空
        apiModelEl.innerHTML = `<option value="${cfg.model}">${cfg.model} (Heartbeat)</option>`;
        apiModelEl.value = cfg.model;
    }

    async function enableHeartbeat() {
        const cfg = {
            url: (urlEl.value || HEARTBEAT_DEFAULTS.url).trim().replace(/\/$/, ''),
            key: heartbeatKey,   // Gateway Key 固定，用户不用改
            model: heartbeatModel,
            provider: 'newapi'
        };

        // 先备份用户当前自定义的 API（只有还没备份过或上次备份的是 Heartbeat 才需要更新）
        const apiSettings = db.apiSettings || {};
        const wasCustom = apiSettings.customApiBackup && !apiSettings.heartbeat?.enabled;
        if (!apiSettings.customApiBackup) {
            // 第一次启用，把用户现在填的保存起来
            db.apiSettings.customApiBackup = {
                url: apiSettings.url || '',
                key: apiSettings.key || '',
                model: apiSettings.model || '',
                provider: apiSettings.provider || 'newapi',
                streamEnabled: apiSettings.streamEnabled,
                temperatureEnabled: apiSettings.temperatureEnabled,
                temperature: apiSettings.temperature
            };
        }

        // 写入 Heartbeat 配置到 apiSettings
        db.apiSettings.provider = cfg.provider;
        db.apiSettings.url      = cfg.url;
        db.apiSettings.key      = cfg.key;
        db.apiSettings.model    = cfg.model;

        db.apiSettings.heartbeat = {
            enabled: true,
            url: cfg.url,
            key: cfg.key,
            model: cfg.model
        };

        applyHeartbeatToForm(cfg);
        applyHeartbeatLock(true);
        switchEl.checked = true;
        rowEl.style.display = 'block';

        await saveData();

        // 自动拉一下 Gateway 返回的模型列表，让下拉框规范
        try {
            await window.fetchAndPopulateModels(false);
        } catch (e) { /* 拉不到也没关系，手动拉即可 */ }

        showToast('💗 Dylan Heartbeat 已启用');
    }

    async function disableHeartbeat() {
        const backup = db.apiSettings && db.apiSettings.customApiBackup;
        if (backup) {
            // 恢复用户原来的 API
            db.apiSettings.provider = backup.provider || 'newapi';
            db.apiSettings.url      = backup.url || '';
            db.apiSettings.key      = backup.key || '';
            db.apiSettings.model    = backup.model || '';
            if (backup.streamEnabled !== undefined)     db.apiSettings.streamEnabled     = backup.streamEnabled;
            if (backup.temperatureEnabled !== undefined) db.apiSettings.temperatureEnabled = backup.temperatureEnabled;
            if (backup.temperature !== undefined)       db.apiSettings.temperature         = backup.temperature;
            // 清掉备份 —— 下次再开 Heartbeat 时重新备份当前值
            db.apiSettings.customApiBackup = null;
        }
        db.apiSettings.heartbeat = { enabled: false };

        // 把恢复后的值回填到表单
        if (providerEl) providerEl.value = db.apiSettings.provider || 'newapi';
        if (apiUrlEl)   apiUrlEl.value   = db.apiSettings.url || '';
        if (apiKeyEl)   apiKeyEl.value   = db.apiSettings.key || '';
        if (db.apiSettings.model) {
            apiModelEl.innerHTML = `<option value="${db.apiSettings.model}">${db.apiSettings.model}</option>`;
            apiModelEl.value = db.apiSettings.model;
        } else {
            apiModelEl.innerHTML = '<option value="">请先拉取</option>';
        }

        applyHeartbeatLock(false);
        switchEl.checked = false;
        rowEl.style.display = 'none';

        await saveData();
        showToast('已关闭 Heartbeat，恢复自定义 API');
    }

    // 开关切换（只展开/收起 Gateway 地址输入行，不立刻切换 API）
    switchEl.addEventListener('change', () => {
        if (switchEl.checked) {
            rowEl.style.display = 'block';
            // 等用户点"保存并启用"再真的切换
        } else {
            disableHeartbeat();  // 关掉是立刻生效
        }
    });

    // "保存并启用"按钮
    saveBtn.addEventListener('click', async () => {
        const urlVal = urlEl.value.trim();
        if (!urlVal) { showToast('请先填 Gateway 地址'); return; }
        // 简单校验一下格式
        if (!/^https?:\/\//.test(urlVal)) { showToast('Gateway 地址需以 http:// 或 https:// 开头'); return; }
        enableHeartbeat();
    });

    // 用户在 Gateway 地址输入框改了之后，先存起来（但不立刻切换）
    urlEl.addEventListener('blur', async () => {
        if (switchEl.checked) {
            const cur = db.apiSettings && db.apiSettings.heartbeat;
            if (cur && cur.url !== urlEl.value.trim()) {
                db.apiSettings.heartbeat = { ...cur, url: urlEl.value.trim() };
                await saveData();
            }
        }
    });
}

function setupHeartbeatTimeline() {
    const toggleEl   = document.getElementById('heartbeat-timeline-toggle');
    const arrowEl    = document.getElementById('heartbeat-timeline-arrow');
    const panelEl    = document.getElementById('heartbeat-timeline-panel');
    const injectEl   = document.getElementById('heartbeat-inject-memory');
    const visualEl   = document.getElementById('heartbeat-visual-toggle');
    const sliderEl   = document.getElementById('heartbeat-threshold-slider');
    const labelEl    = document.getElementById('heartbeat-threshold-label');
    const viewBtn    = document.getElementById('heartbeat-view-timeline');
    const clearBtn   = document.getElementById('heartbeat-clear-timeline');
    const previewEl  = document.getElementById('heartbeat-timeline-preview');
    if (!toggleEl) return;

    // 从 localStorage 恢复偏好（不要和 apiSettings 混存）
    const prefKey = 'miemie_heartbeat_pref';
    const loadPref = () => {
        try { return JSON.parse(localStorage.getItem(prefKey) || '{}'); } catch { return {}; }
    };
    const savePref = (p) => localStorage.setItem(prefKey, JSON.stringify(p));

    let pref = loadPref();
    injectEl.checked = pref.injectMemory !== false;  // 默认 ON
    if (visualEl) visualEl.checked = pref.visual !== false; // 默认 ON
    sliderEl.value   = pref.threshold || 60;
    labelEl.textContent = `${sliderEl.value} 分钟`;

    toggleEl.addEventListener('click', () => {
        const hidden = panelEl.style.display === 'none';
        panelEl.style.display = hidden ? 'block' : 'none';
        arrowEl.textContent = hidden ? '▴' : '▾';
        if (hidden) loadTimelinePreview();
    });

    injectEl.addEventListener('change', () => {
        pref = loadPref(); pref.injectMemory = injectEl.checked; savePref(pref);
        // 持久化到 db 也存一份（后端 Gateway 可能读到）
        if (db.apiSettings.heartbeat) { db.apiSettings.heartbeat.injectMemory = injectEl.checked; saveData(); }
    });

    if (visualEl) visualEl.addEventListener('change', () => {
        pref = loadPref(); pref.visual = visualEl.checked; savePref(pref);
        showToast(`心跳可视化已${visualEl.checked ? '开启 💗' : '关闭'}`);
        // 立刻触发更新（chat_heartbeat.js 有 10 秒轮询 + 这个 localStorage 变化即时响应）
    });

    sliderEl.addEventListener('input', () => { labelEl.textContent = `${sliderEl.value} 分钟`; });
    sliderEl.addEventListener('change', async () => {
        const minutes = Number(sliderEl.value);
        pref = loadPref(); pref.threshold = minutes; savePref(pref);
        showToast(`唤醒阈值已改为 ${minutes} 分钟（Gateway 需重启生效）`);
    });

    viewBtn.addEventListener('click', loadTimelinePreview);
    clearBtn.addEventListener('click', async () => {
        if (!confirm('确定清空 Dylan Heartbeat 的时间线和唤醒记录？\n（miemie 本地聊天记录不会被删）')) return;
        const url = (db.apiSettings.heartbeat?.url || '').replace(/\/$/, '') + '/admin/timeline';
        if (!db.apiSettings.heartbeat?.url) { showToast('请先开启 Heartbeat 模式'); return; }
        try {
            const res = await fetch(url, { method: 'DELETE', headers: { 'X-Internal-Key': 'miemie_internal_clear' } });
            if (res.ok) { showToast('✅ 时间线已清空'); previewEl.innerHTML = '<span style="color:#aaa;">时间线已清空</span>'; }
            else { showToast('清空失败：' + res.status); }
        } catch (e) { showToast('清空失败：' + e.message); }
    });

    async function loadTimelinePreview() {
        const gatewayUrl = (db.apiSettings.heartbeat?.url || '').replace(/\/$/, '');
        if (!gatewayUrl) { previewEl.innerHTML = '<span style="color:#aaa;">请先开启 Heartbeat 模式</span>'; return; }
        previewEl.innerHTML = '<span style="color:#aaa;">加载中...</span>';
        try {
            const res = await fetch(gatewayUrl + '/v1/timeline');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const { messages } = await res.json();
            if (!messages || messages.length === 0) {
                previewEl.innerHTML = '<span style="color:#aaa;">时间线是空的 🧹</span>';
                return;
            }
            // 时间线里的 AI 主动唤醒消息会带 "自动唤醒" 标记，给它 💗 样式
            const html = messages.slice(-20).reverse().map(m => {
                const isWake = m.content && m.content.includes('自动唤醒');
                const isUser = m.role === 'user';
                const icon = isUser ? '👤' : (isWake ? '💗' : '🤖');
                const color = isWake ? '#1a1a1a' : (isUser ? '#4a7bb5' : '#666');
                const preview = String(m.content || '').replace(/^（[^）]+）/g, '').trim();
                return `<div style="margin-bottom:4px; padding:3px 6px; border-radius:6px; background:${isWake ? '#efefef' : '#f8f9fb'};">
                    <span style="color:${color}; font-weight:600;">${icon} ${isUser ? '你' : (isWake ? '💗 AI 主动' : 'AI')}：</span>
                    <span style="color:#555;">${preview.substring(0, 80)}${preview.length > 80 ? '...' : ''}</span>
                </div>`;
            }).join('');
            previewEl.innerHTML = `<div style="margin-bottom:6px; color:#666; font-weight:600;">共 ${messages.length} 条（显示最近 20 条）</div>` + html;
        } catch (e) {
            previewEl.innerHTML = `<span style="color:#d97777;">加载失败：${e.message}</span>`;
        }
    }
}

function setupApiSettingsApp() {
    const e = document.getElementById('api-form'), t = document.getElementById('fetch-models-btn'),
        a = document.getElementById('api-model'), n = document.getElementById('api-provider'),
        r = document.getElementById('api-url'), s = document.getElementById('api-key'), c = {
            newapi: '',
            deepseek: 'https://api.deepseek.com',
            claude: 'https://api.anthropic.com',
            gemini: 'https://generativelanguage.googleapis.com'
        };
    db.apiSettings && (n.value = db.apiSettings.provider || 'newapi', r.value = db.apiSettings.url || '', s.value = db.apiSettings.key || '', db.apiSettings.model && (a.innerHTML = `<option value="${db.apiSettings.model}">${db.apiSettings.model}</option>`));
    if (db.apiSettings && typeof db.apiSettings.timePerceptionEnabled !== 'undefined') { document.getElementById('time-perception-switch').checked = db.apiSettings.timePerceptionEnabled; }
    if (db.apiSettings && typeof db.apiSettings.streamEnabled !== 'undefined') { document.getElementById('stream-switch').checked = db.apiSettings.streamEnabled; } else { document.getElementById('stream-switch').checked = true; } 
    
    const keepAliveSwitch = document.getElementById('keep-alive-switch');
    if (keepAliveSwitch) {
        if (db.apiSettings && typeof db.apiSettings.keepAliveEnabled !== 'undefined') {
            keepAliveSwitch.checked = db.apiSettings.keepAliveEnabled;
        } else {
            keepAliveSwitch.checked = false;
        }
        keepAliveSwitch.addEventListener('change', async (e) => {
            const desiredState = e.target.checked;
            if (window.KeepAliveManager) {
                await window.KeepAliveManager.setEnabled(desiredState, { userInitiated: true });
            }
            db.apiSettings = db.apiSettings || {};
            db.apiSettings.keepAliveEnabled = desiredState;
            await saveData();
            showToast(desiredState ? '持续运行增强已开启' : '持续运行增强已关闭');
        });
    }

    const tempEnabledSwitch = document.getElementById('temperature-enabled-switch');
    const tempSlider = document.getElementById('temperature-slider');
    const tempValue = document.getElementById('temperature-value');
    
    if (tempEnabledSwitch) {
        if (db.apiSettings && typeof db.apiSettings.temperatureEnabled !== 'undefined') {
            tempEnabledSwitch.checked = db.apiSettings.temperatureEnabled;
        } else {
            tempEnabledSwitch.checked = true; // 默认开启
        }
        if (tempSlider) tempSlider.disabled = !tempEnabledSwitch.checked;
        
        tempEnabledSwitch.addEventListener('change', (e) => {
            if (tempSlider) tempSlider.disabled = !e.target.checked;
        });
    }

    if (tempSlider && tempValue) {
        const savedTemp = (db.apiSettings && db.apiSettings.temperature !== undefined) ? db.apiSettings.temperature : 1.0;
        tempSlider.value = savedTemp;
        tempValue.textContent = savedTemp;

        tempSlider.addEventListener('input', (e) => {
            tempValue.textContent = e.target.value;
        });
    }

    populateApiSelect();
    setupSecondaryApiSettings();
    setupHeartbeatToggle();   // Dylan Heartbeat 开关
    setupHeartbeatTimeline(); // 时间线管理折叠区
    n.addEventListener('change', () => {
        r.value = c[n.value] || ''
    });

    // 提取为全局函数以便复用
    window.fetchAndPopulateModels = async (showToastFlag = true) => {
        const provider = n.value;
        let apiUrl = r.value.trim();
        const apiKey = s.value.trim();
        const modelSelect = a;
        const fetchBtn = t;

        if (!apiUrl || !apiKey) {
            if (showToastFlag) showToast('请先填写API地址和密钥！');
            return;
        }

        if (BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
            if (showToastFlag) showToast('该 API 站点已被屏蔽，无法使用！');
            return;
        }

        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        
        const endpoint = provider === 'gemini' 
            ? `${apiUrl}/v1beta/models?key=${getRandomValue(apiKey)}` 
            : `${apiUrl}/v1/models`;

        if (fetchBtn) {
            fetchBtn.classList.add('loading');
            fetchBtn.disabled = true;
        }

        try {
            const headers = provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` };
            const response = await fetch(endpoint, { method: 'GET', headers });
            
            if (!response.ok) {
                const error = new Error(`网络响应错误: ${response.status}`);
                error.response = response;
                throw error;
            }

            const data = await response.json();
            let models = [];
            
            if (provider !== 'gemini' && data.data) {
                models = data.data.map(e => e.id);
            } else if (provider === 'gemini' && data.models) {
                models = data.models.map(e => e.name.replace('models/', ''));
            }

            // 保留当前选中的值（如果仍在列表中）
            const currentVal = modelSelect.value;
            
            modelSelect.innerHTML = '';
            if (models.length > 0) {
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelSelect.appendChild(opt);
                });
                
                // 尝试恢复之前的选择，或者使用设置中的值
                if (models.includes(currentVal)) {
                    modelSelect.value = currentVal;
                } else if (db.apiSettings && db.apiSettings.model && models.includes(db.apiSettings.model)) {
                    modelSelect.value = db.apiSettings.model;
                }
                
                if (showToastFlag) showToast('模型列表拉取成功！');
            } else {
                modelSelect.innerHTML = '<option value="">未找到任何模型</option>';
                if (showToastFlag) showToast('未找到任何模型');
            }
        } catch (err) {
            console.error(err);
            if (showToastFlag) {
                showApiError(err);
                modelSelect.innerHTML = '<option value="">拉取失败</option>';
            }
        } finally {
            if (fetchBtn) {
                fetchBtn.classList.remove('loading');
                fetchBtn.disabled = false;
            }
        }
    };

    t.addEventListener('click', () => window.fetchAndPopulateModels(true));
    e.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!a.value) return showToast('请选择模型后保存！');
        if (BLOCKED_API_DOMAINS.some(domain => r.value.includes(domain))) {
            return showToast('该 API 站点已被屏蔽，无法保存！');
        }
        const secondary = readSecondaryApiSettings();
        if (secondary.enabled && (!secondary.url || !secondary.key || !secondary.model)) {
            return showToast('请完整填写副 API 地址、密钥和模型！');
        }
        if (secondary.enabled && BLOCKED_API_DOMAINS.some(domain => secondary.url.includes(domain))) {
            return showToast('副 API 站点已被屏蔽，无法保存！');
        }
        db.apiSettings = {
            provider: n.value,
            url: r.value,
            key: s.value,
            model: a.value,
            timePerceptionEnabled: document.getElementById('time-perception-switch').checked,
            streamEnabled: document.getElementById('stream-switch').checked, 
            keepAliveEnabled: document.getElementById('keep-alive-switch') ? document.getElementById('keep-alive-switch').checked : false,
            temperatureEnabled: document.getElementById('temperature-enabled-switch').checked,
            temperature: parseFloat(document.getElementById('temperature-slider').value),
            secondary
        };
        await saveData();
        showToast('API设置已保存！')
    })
}

function getDefaultSecondaryApiRoutes() {
    return {
        callReply: false,
        callSummary: false,
        journal: false,
        peek: false,
        shop: false,
        batteryReminder: false
    };
}

function readSecondaryApiSettings() {
    const enabledEl = document.getElementById('secondary-api-enabled');
    const providerEl = document.getElementById('secondary-api-provider');
    const urlEl = document.getElementById('secondary-api-url');
    const keyEl = document.getElementById('secondary-api-key');
    const modelEl = document.getElementById('secondary-api-model');
    const routes = getDefaultSecondaryApiRoutes();

    document.querySelectorAll('[data-secondary-route]').forEach(input => {
        routes[input.dataset.secondaryRoute] = input.checked;
    });

    return {
        enabled: Boolean(enabledEl && enabledEl.checked),
        provider: providerEl ? providerEl.value : 'newapi',
        url: urlEl ? urlEl.value.trim().replace(/\/$/, '') : '',
        key: keyEl ? keyEl.value.trim() : '',
        model: modelEl ? modelEl.value : '',
        routes
    };
}

function setupSecondaryApiSettings() {
    const enabledEl = document.getElementById('secondary-api-enabled');
    const panel = document.getElementById('secondary-api-panel');
    const providerEl = document.getElementById('secondary-api-provider');
    const urlEl = document.getElementById('secondary-api-url');
    const keyEl = document.getElementById('secondary-api-key');
    const modelEl = document.getElementById('secondary-api-model');
    const fetchBtn = document.getElementById('secondary-fetch-models-btn');
    if (!enabledEl || !panel || !providerEl || !urlEl || !keyEl || !modelEl || !fetchBtn) return;

    const secondary = (db.apiSettings && db.apiSettings.secondary) || {};
    const providerUrls = {
        newapi: '',
        deepseek: 'https://api.deepseek.com',
        claude: 'https://api.anthropic.com',
        gemini: 'https://generativelanguage.googleapis.com'
    };

    enabledEl.checked = Boolean(secondary.enabled);
    providerEl.value = secondary.provider || 'newapi';
    urlEl.value = secondary.url || '';
    keyEl.value = secondary.key || '';
    if (secondary.model) {
        modelEl.innerHTML = '';
        const savedModelOption = document.createElement('option');
        savedModelOption.value = secondary.model;
        savedModelOption.textContent = secondary.model;
        modelEl.appendChild(savedModelOption);
    }
    const savedRoutes = { ...getDefaultSecondaryApiRoutes(), ...(secondary.routes || {}) };
    document.querySelectorAll('[data-secondary-route]').forEach(input => {
        input.checked = Boolean(savedRoutes[input.dataset.secondaryRoute]);
    });

    const updatePanelState = () => {
        panel.style.display = enabledEl.checked ? 'block' : 'none';
    };
    updatePanelState();

    if (enabledEl.dataset.listenerBound === 'true') return;
    enabledEl.dataset.listenerBound = 'true';
    enabledEl.addEventListener('change', updatePanelState);
    providerEl.addEventListener('change', () => {
        urlEl.value = providerUrls[providerEl.value] || '';
        modelEl.innerHTML = '<option value="">请重新拉取模型</option>';
    });
    fetchBtn.addEventListener('click', async () => {
        let apiUrl = urlEl.value.trim().replace(/\/$/, '');
        const apiKey = keyEl.value.trim();
        const provider = providerEl.value;
        if (!apiUrl || !apiKey) return showToast('请先填写副 API 地址和密钥！');
        if (BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
            return showToast('副 API 站点已被屏蔽，无法使用！');
        }

        const endpoint = provider === 'gemini'
            ? `${apiUrl}/v1beta/models?key=${getRandomValue(apiKey)}`
            : `${apiUrl}/v1/models`;
        fetchBtn.disabled = true;
        fetchBtn.classList.add('loading');
        try {
            const headers = provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` };
            const response = await fetch(endpoint, { method: 'GET', headers });
            if (!response.ok) {
                const error = new Error(`网络响应错误: ${response.status}`);
                error.response = response;
                throw error;
            }
            const data = await response.json();
            const models = provider === 'gemini'
                ? (data.models || []).map(item => item.name.replace('models/', ''))
                : (data.data || []).map(item => item.id);
            modelEl.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelEl.appendChild(option);
            });
            if (!models.length) modelEl.innerHTML = '<option value="">未找到任何模型</option>';
            showToast(models.length ? '副 API 模型列表拉取成功！' : '未找到任何模型');
        } catch (error) {
            showApiError(error);
            modelEl.innerHTML = '<option value="">拉取失败</option>';
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.classList.remove('loading');
        }
    });
}

// --- 预设管理 ---
function _getApiPresets() {
    return db.apiPresets || [];
}

function _createApiPresetId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return 'api_preset_' + window.crypto.randomUUID();
    }
    return 'api_preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function _normalizeApiPresets(arr) {
    const usedIds = new Set();
    return (Array.isArray(arr) ? arr : []).map(preset => {
        const normalized = preset && typeof preset === 'object' ? preset : {};
        if (!normalized.id || usedIds.has(normalized.id)) {
            normalized.id = _createApiPresetId();
        }
        usedIds.add(normalized.id);
        return normalized;
    });
}

function _saveApiPresets(arr) {
    db.apiPresets = _normalizeApiPresets(arr);
    saveData();
    window.dispatchEvent(new CustomEvent('api-presets-updated'));
}

function populateApiSelect() {
    const sel = document.getElementById('api-preset-select');
    if (!sel) return;
    const needsMigration = _getApiPresets().some(p => !p || !p.id);
    const presets = _normalizeApiPresets(_getApiPresets());
    db.apiPresets = presets;
    if (needsMigration) saveData();
    sel.innerHTML = '<option value="">— 选择 API 预设 —</option>';
    presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
    });
}

function saveCurrentApiAsPreset() {
    const apiKeyEl = document.querySelector('#api-key');
    const apiUrlEl = document.querySelector('#api-url');
    const providerEl = document.querySelector('#api-provider');
    const modelEl = document.querySelector('#api-model');
    const tempEnabledSwitch = document.getElementById('temperature-enabled-switch');
    const tempSlider = document.getElementById('temperature-slider');

    const data = {
        apiKey: apiKeyEl ? apiKeyEl.value : '',
        apiUrl: apiUrlEl ? apiUrlEl.value : '',
        provider: providerEl ? providerEl.value : '',
        model: modelEl ? modelEl.value : '',
        temperatureEnabled: tempEnabledSwitch ? tempEnabledSwitch.checked : false,
        temperature: tempSlider ? parseFloat(tempSlider.value) : 1.0
    };
    
    let name = prompt('为该 API 预设填写名称（会覆盖同名预设）：');
    if (!name) return;
    const presets = _getApiPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = {id: idx >= 0 ? presets[idx].id : _createApiPresetId(), name: name, data: data};
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    _saveApiPresets(presets);
    populateApiSelect();
    showToast('API 预设已保存');
}

async function applyApiPreset(name) {
    const presets = _getApiPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    try {
        const apiKeyEl = document.querySelector('#api-key');
        const apiUrlEl = document.querySelector('#api-url');
        const providerEl = document.querySelector('#api-provider');
        const modelEl = document.querySelector('#api-model');
        const tempEnabledSwitch = document.getElementById('temperature-enabled-switch');
        const tempSlider = document.getElementById('temperature-slider');
        const tempValue = document.getElementById('temperature-value');

        if (apiKeyEl && p.data && typeof p.data.apiKey !== 'undefined') apiKeyEl.value = p.data.apiKey;
        if (apiUrlEl && p.data && typeof p.data.apiUrl !== 'undefined') apiUrlEl.value = p.data.apiUrl;
        if (providerEl && p.data && typeof p.data.provider !== 'undefined') providerEl.value = p.data.provider;
        if (modelEl && p.data && typeof p.data.model !== 'undefined') {
            modelEl.innerHTML = `<option value="${p.data.model}">${p.data.model}</option>`;
            modelEl.value = p.data.model;
        }
        if (tempEnabledSwitch && p.data && typeof p.data.temperatureEnabled !== 'undefined') {
            tempEnabledSwitch.checked = p.data.temperatureEnabled;
            if (tempSlider) tempSlider.disabled = !tempEnabledSwitch.checked;
        }
        if (tempSlider && p.data && typeof p.data.temperature !== 'undefined') {
            tempSlider.value = p.data.temperature;
            if (tempValue) tempValue.textContent = p.data.temperature;
        }

        showToast('已应用 API 预设');
    } catch(e) {
        console.error('applyApiPreset error', e);
    }
}

function openApiManageModal() {
    const modal = document.getElementById('api-presets-modal');
    const list = document.getElementById('api-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getApiPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 6px';
        row.style.borderBottom = '1px solid #f6f6f6';

        const left = document.createElement('div');
        left.style.flex = '1';
        left.style.minWidth = '0';
        left.innerHTML = '<div style="font-weight:600;">'+p.name+'</div><div style="font-size:12px;color:#666;margin-top:4px;">' + (p.data && p.data.provider ? ('提供者：'+p.data.provider) : '') + '</div>';

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyApiPreset(p.name); modal.style.display='none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getApiPresets();
            all[idx].name = newName;
            _saveApiPresets(all);
            openApiManageModal();
            populateApiSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.textContent = '删除';
        delBtn.onclick = function(){ if(!confirm('确定删除 "'+p.name+'" ?')) return; const all=_getApiPresets(); all.splice(idx,1); _saveApiPresets(all); openApiManageModal(); populateApiSelect(); };

        btns.appendChild(applyBtn); btns.appendChild(renameBtn); btns.appendChild(delBtn);

        row.appendChild(left); row.appendChild(btns);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function exportApiPresets() {
    const presets = _getApiPresets();
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'api_presets.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
function importApiPresets() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = function(e){
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = function(){ try { const data = JSON.parse(r.result); if (Array.isArray(data)) { _saveApiPresets(data); populateApiSelect(); openApiManageModal(); } else alert('文件格式不正确'); } catch(e){ alert('导入失败：'+e.message); } };
        r.readAsText(f);
    };
    inp.click();
}

// --- 生图 API 配置 ---
function initImgGenApiSettings() {
    const urlInput = document.getElementById('imggen-api-url');
    const keyInput = document.getElementById('imggen-api-key');
    const modelSelect = document.getElementById('imggen-api-model');
    const fetchBtn = document.getElementById('imggen-fetch-models-btn');
    const saveBtn = document.getElementById('imggen-api-save-btn');
    if (!urlInput || !keyInput || !modelSelect || !fetchBtn || !saveBtn) return;

    const load = () => {
        const ws = db.workshopSettings || {};
        const presets = ws.apiPresets?.gpt || ws.apiPresets?.novelai || [];
        const activeId = ws.activeApiPresetId?.gpt || ws.activeApiPresetId?.novelai;
        const active = presets.find(p => p.id === activeId) || presets[0];
        urlInput.value = active?.url || '';
        keyInput.value = active?.key || '';
        if (ws.imgGenModel) {
            modelSelect.innerHTML = `<option value="${ws.imgGenModel}">${ws.imgGenModel}</option>`;
        }
        if (ws.imgGenModelList && ws.imgGenModelList.length > 0) {
            modelSelect.innerHTML = '';
            ws.imgGenModelList.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                if (m === ws.imgGenModel) opt.selected = true;
                modelSelect.appendChild(opt);
            });
        }
    };

    fetchBtn.addEventListener('click', async () => {
        let apiUrl = urlInput.value.trim();
        const apiKey = keyInput.value.trim();
        if (!apiUrl || !apiKey) {
            showToast('请先填写 API 地址和密钥');
            return;
        }
        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);

        fetchBtn.disabled = true;
        fetchBtn.textContent = '拉取中...';

        try {
            const endpoint = `${apiUrl}/v1/models`;
            const resp = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const models = (data.data || data.models || []).map(m => m.id || m.name || m).filter(Boolean);

            if (models.length === 0) throw new Error('未找到可用模型');

            modelSelect.innerHTML = '';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modelSelect.appendChild(opt);
            });

            if (!db.workshopSettings) db.workshopSettings = {};
            db.workshopSettings.imgGenModelList = models;
            await saveData();
            showToast(`已拉取 ${models.length} 个模型`);
        } catch (err) {
            console.error('Fetch img models error:', err);
            showToast('拉取模型失败: ' + err.message);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '拉取模型';
        }
    });

    saveBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        const model = modelSelect.value;

        if (!url || !key) {
            showToast('请填写 API 地址和密钥');
            return;
        }

        if (!db.workshopSettings) db.workshopSettings = {};
        const ws = db.workshopSettings;

        // 使用 gpt (OpenAI-compatible) 预设存储
        if (!ws.apiPresets) ws.apiPresets = { novelai: [], gpt: [] };
        if (!ws.apiPresets.gpt) ws.apiPresets.gpt = [];
        if (!ws.activeApiPresetId) ws.activeApiPresetId = {};

        const presets = ws.apiPresets.gpt;
        const activeId = ws.activeApiPresetId.gpt;
        const existing = presets.find(p => p.id === activeId);
        if (existing) {
            existing.url = url;
            existing.key = key;
        } else {
            const id = 'preset_' + Date.now();
            presets.push({ id, name: '自定义', url, key, protocol: 'openai', responseFormat: 'auto' });
            ws.activeApiPresetId.gpt = id;
        }

        ws.provider = 'gpt';
        ws.imgGenModel = model;
        ws.gptModel = model;

        await saveData();
        showToast('生图 API 设置已保存');
    });

    load();
}

/* ===== 设置页可折叠分组 ===== */
(function () {
    const KEY = 'uwu_api_collapse';

    function store() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }

    function applyState() {
        const screen = document.getElementById('api-settings-screen');
        if (!screen) return;
        const state = store();
        screen.querySelectorAll('.kkt-collapsible[data-collapse-key]').forEach(group => {
            group.classList.toggle('collapsed', state[group.dataset.collapseKey] !== true);
        });
    }

    function init() {
        applyState();
        const screen = document.getElementById('api-settings-screen');
        if (!screen) return;
        screen.addEventListener('click', (e) => {
            const head = e.target.closest('.kkt-collapse-head');
            if (!head) return;
            const group = head.closest('.kkt-collapsible');
            if (!group || !group.dataset.collapseKey) return;
            const willOpen = group.classList.contains('collapsed');
            group.classList.toggle('collapsed', !willOpen);
            const s = store();
            s[group.dataset.collapseKey] = willOpen;
            try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (err) {}
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
