// --- 设置绑定与持久化（zk8：生图 API 只留地址 + 密钥 + 模型，接口形态由地址推断） ---

function getWorkshopImageApi() {
    const api = (db.workshopSettings && db.workshopSettings.imageApi) || {};
    return { url: String(api.url || '').trim(), key: String(api.key || '').trim() };
}

function getWorkshopImageModel() {
    const s = db.workshopSettings || {};
    return String(s.model || s.novelaiModel || s.gptModel || '').trim();
}

// 旧数据一次性搬迁：把当时选中的预设地址/密钥搬到扁平字段，其余数据原样保留
function migrateWorkshopImageApi(settings) {
    if (settings.imageApi) return false;
    const legacy = Array.isArray(settings.apiPresets) ? settings.apiPresets.filter(p => p && p.url) : [];
    const src = legacy.find(p => p.id === settings.activeApiPresetId) || legacy[0]
        || (settings.novelaiApiUrl && settings.novelaiApiUrl !== 'https://image.novelai.net/ai/generate-image-stream'
            ? { url: settings.novelaiApiUrl, key: settings.novelaiApiKey } : null)
        || (settings.gptApiUrl && settings.gptApiUrl !== 'https://api.openai.com/v1/images/generations'
            ? { url: settings.gptApiUrl, key: settings.gptApiKey } : null);
    settings.imageApi = { url: (src && src.url) || '', key: (src && src.key) || '' };
    if (!settings.model) settings.model = getWorkshopImageModel();
    return true;
}

async function initWorkshopSettings() {
    if (!db.workshopSettings) return;

    const settings = db.workshopSettings;

    let changed = migrateWorkshopImageApi(settings);
    // 旧「全局氛围/参考图库」入口已删除，其数据只会在生图时被误当成参考图
    if ('vibe' in settings || 'vibeLibrary' in settings) {
        delete settings.vibe;
        delete settings.vibeLibrary;
        changed = true;
    }
    if (changed) await saveData();
    bindWorkshopImageApiInputs();
    initWorkshopFolds();

    // 全局比例不再暴露 UI，仅作为角色未配置比例时的兜底默认值
    if (!settings.aspectRatio) settings.aspectRatio = '3:4';

    const bindInput = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (settings[key] !== undefined) el.value = settings[key];
        el.addEventListener('change', async (e) => {
            if (!e.isTrusted) return;
            settings[key] = e.target.value;
            await saveData();
        });
    };

    const bindSwitch = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (settings[key] !== undefined) el.checked = settings[key];
        el.addEventListener('change', async (e) => {
            if (!e.isTrusted) return;
            settings[key] = e.target.checked;
            await saveData();
        });
    };

    // 绑定 LLM 设置
    bindSwitch('workshop-llm-independent-api', 'llmIndependentApi');
    bindInput('workshop-llm-api-preset', 'llmApiPresetId');

    populateWorkshopLlmApiPresets();
    if (!window.__workshopLlmApiPresetListenerBound) {
        window.addEventListener('api-presets-updated', populateWorkshopLlmApiPresets);
        window.__workshopLlmApiPresetListenerBound = true;
    }

    // 初始化 LLM 预设条目
    initWorkshopLLMPrompts();

    // 触发一次 LLM 开关的 change 事件以更新 UI
    const llmToggle = document.getElementById('workshop-llm-independent-api');
    if (llmToggle) llmToggle.dispatchEvent(new Event('change'));
}

function bindWorkshopImageApiInputs() {
    const api = getWorkshopImageApi();
    const urlEl = document.getElementById('workshop-api-url');
    const keyEl = document.getElementById('workshop-api-key');
    if (urlEl) {
        urlEl.value = api.url;
        urlEl.addEventListener('input', async (e) => {
            if (!e.isTrusted) return;
            db.workshopSettings.imageApi.url = e.target.value.trim();
            await saveData();
        });
    }
    if (keyEl) {
        keyEl.value = api.key;
        keyEl.addEventListener('input', async (e) => {
            if (!e.isTrusted) return;
            db.workshopSettings.imageApi.key = e.target.value.trim();
            await saveData();
        });
    }
}

// 折叠面板：点标题展开/收起，开合状态记住（重复初始化时不叠加监听，否则一次点击会开又关）
function initWorkshopFolds() {
    const state = db.workshopSettings.foldState || {};
    document.querySelectorAll('#drawing-workshop-screen [data-fold]').forEach(section => {
        const key = section.dataset.fold;
        const head = section.querySelector('[data-fold-toggle]');
        if (!head || head.dataset.foldBound) return;
        head.dataset.foldBound = '1';
        if (state[key]) section.classList.add('open');
        head.addEventListener('click', async () => {
            const open = section.classList.toggle('open');
            db.workshopSettings.foldState = { ...(db.workshopSettings.foldState || {}), [key]: open };
            await saveData();
        });
    });
}

function populateWorkshopLlmApiPresets() {
    if (!db.workshopSettings) return;

    const presets = Array.isArray(db.apiPresets) ? db.apiPresets : [];
    const select = document.getElementById('workshop-llm-api-preset');
    if (!select) return;

    let selectedId = db.workshopSettings.llmApiPresetId || '';
    let settingsChanged = false;
    // 兼容曾经手动写入预设名称的旧数据。
    const legacyPreset = presets.find(p => p && p.name === selectedId);
    if (legacyPreset && typeof _createApiPresetId === 'function') {
        if (!legacyPreset.id) legacyPreset.id = _createApiPresetId();
        selectedId = legacyPreset.id;
        db.workshopSettings.llmApiPresetId = selectedId;
        settingsChanged = true;
    }

    select.innerHTML = '<option value="">请选择</option>';
    presets.forEach(preset => {
        if (!preset || !preset.id || !preset.name || !preset.data) return;
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    });

    if (selectedId && presets.some(p => p.id === selectedId)) {
        select.value = selectedId;
    } else if (selectedId) {
        db.workshopSettings.llmApiPresetId = '';
        select.value = '';
        settingsChanged = true;
    }

    if (settingsChanged) saveData();
}

// --- 模型列表 ---
function fillWorkshopModelSelect(modelIds) {
    const select = document.getElementById('workshop-api-model');
    if (!select) return;
    const saved = getWorkshopImageModel();
    const ids = (Array.isArray(modelIds) && modelIds.length) ? modelIds : (saved ? [saved] : []);
    select.innerHTML = ids.length ? '' : '<option value="">请先拉取模型</option>';
    ids.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        select.appendChild(option);
    });
    if (saved) select.value = saved;
}

async function fetchGPTModels(apiUrl, apiKey) {
    const response = await fetch(`${openAIBaseUrl(apiUrl)}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return (data.data || []).map(m => m.id).filter(Boolean);
}

function initWorkshopModels() {
    const fetchBtn = document.getElementById('workshop-fetch-models-btn');
    const modelSelect = document.getElementById('workshop-api-model');
    if (!fetchBtn || !modelSelect) return;

    fillWorkshopModelSelect([]);

    modelSelect.addEventListener('change', async (e) => {
        if (!db.workshopSettings) return;
        db.workshopSettings.model = e.target.value;
        if (typeof saveData === 'function') await saveData();
    });

    fetchBtn.addEventListener('click', async () => {
        const apiUrl = document.getElementById('workshop-api-url').value.trim();
        const apiKey = document.getElementById('workshop-api-key').value.trim();

        if (!apiUrl || !apiKey) {
            showToast('请先填写 API 地址和密钥');
            return;
        }

        const originalText = fetchBtn.textContent;
        fetchBtn.textContent = '拉取中...';
        fetchBtn.disabled = true;

        try {
            const ids = await fetchGPTModels(apiUrl, apiKey);
            fillWorkshopModelSelect(ids);
            showToast(`已拉取 ${ids.length} 个模型`);
        } catch (error) {
            console.error('Fetch models error:', error);
            showToast('拉取模型失败: ' + error.message);
        } finally {
            fetchBtn.textContent = originalText;
            fetchBtn.disabled = false;
        }
    });
}
