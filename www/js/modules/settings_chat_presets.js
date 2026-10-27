// --- 聊天预设管理（线上聊天：提示词条目 + 正则规则） ---

function _getChatPresets() {
    return db.chatPresets || [];
}

function _saveChatPresets(arr) {
    db.chatPresets = arr || [];
    saveData();
}

function _newChatPreset(name) {
    return {
        id: 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: name || '新预设',
        enabled: true,
        promptEntries: [],
        regexRules: []
    };
}

function _newPromptEntry() {
    return {
        id: 'pe_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        title: '',
        content: '',
        enabled: true
    };
}

function _newRegexRule() {
    return {
        id: 'rr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        pattern: '',
        flags: 'g',
        replacement: '',
        scope: 'ai', // ai: AI回复显示前 | user: 发送给AI前 | both: 两者
        enabled: true
    };
}

/* ===== 管理列表弹窗 ===== */

function openChatPresetsModal() {
    const modal = document.getElementById('chat-presets-modal');
    const list = document.getElementById('chat-presets-list');
    if (!modal || !list) return;
    renderChatPresetsList();
    modal.style.display = 'flex';
}

function renderChatPresetsList() {
    const list = document.getElementById('chat-presets-list');
    if (!list) return;
    list.innerHTML = '';
    const presets = _getChatPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设，点击下方"新建预设"创建</p>';
        return;
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 8px;border-bottom:1px solid #eee;';

        const left = document.createElement('div');
        left.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';

        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameDiv.textContent = p.name;
        nameRow.appendChild(nameDiv);

        if (p.enabled === false) {
            const offTag = document.createElement('span');
            offTag.style.cssText = 'font-size:11px;color:#999;background:#eee;padding:1px 6px;border-radius:8px;flex-shrink:0;';
            offTag.textContent = '已禁用';
            nameRow.appendChild(offTag);
        }
        left.appendChild(nameRow);

        const meta = document.createElement('div');
        const entryCount = (p.promptEntries || []).filter(e => e.enabled !== false).length;
        const regexCount = (p.regexRules || []).filter(r => r.enabled !== false).length;
        meta.style.cssText = 'font-size:12px;color:#999;';
        meta.textContent = `条目 ${entryCount} · 正则 ${regexCount}`;
        left.appendChild(meta);

        row.appendChild(left);

        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

        const toggleLabel = document.createElement('label');
        toggleLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = p.enabled !== false;
        toggle.onchange = function () {
            const all = _getChatPresets();
            all[idx].enabled = toggle.checked;
            _saveChatPresets(all);
            renderChatPresetsList();
        };
        toggleLabel.appendChild(toggle);
        toggleLabel.appendChild(document.createTextNode('启用'));
        btnWrap.appendChild(toggleLabel);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary';
        editBtn.style.cssText = 'padding:5px 10px;border-radius:8px;font-size:12px;';
        editBtn.textContent = '编辑';
        editBtn.onclick = function () { openChatPresetEditor(idx); };
        btnWrap.appendChild(editBtn);

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.cssText = 'padding:5px 10px;border-radius:8px;font-size:12px;';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function () {
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getChatPresets();
            all[idx].name = newName.trim();
            _saveChatPresets(all);
            renderChatPresetsList();
        };
        btnWrap.appendChild(renameBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.cssText = 'padding:5px 10px;border-radius:8px;font-size:12px;';
        delBtn.textContent = '删除';
        delBtn.onclick = function () {
            if (!confirm('确定删除预设 "' + p.name + '"？')) return;
            const all = _getChatPresets();
            all.splice(idx, 1);
            _saveChatPresets(all);
            renderChatPresetsList();
        };
        btnWrap.appendChild(delBtn);

        row.appendChild(btnWrap);
        list.appendChild(row);
    });
}

/* ===== 编辑器弹窗 ===== */

let _editingChatPresetIdx = -1;

function openChatPresetEditor(idx) {
    _editingChatPresetIdx = idx;
    const modal = document.getElementById('chat-preset-editor-modal');
    if (!modal) return;

    const presets = _getChatPresets();
    const isNew = idx < 0;
    const preset = isNew ? _newChatPreset('') : presets[idx];

    const title = document.getElementById('chat-preset-editor-title');
    const nameInput = document.getElementById('chat-preset-editor-name');
    const enabledCheck = document.getElementById('chat-preset-editor-enabled');
    title.textContent = isNew ? '新建预设' : '编辑预设';
    nameInput.value = preset.name === '新预设' ? '' : preset.name;
    enabledCheck.checked = preset.enabled !== false;

    renderChatPresetEntries(preset.promptEntries || []);
    renderChatPresetRegexes(preset.regexRules || []);

    document.getElementById('chat-presets-modal').style.display = 'none';
    modal.style.display = 'flex';
}

function _collectEditingPreset() {
    const nameInput = document.getElementById('chat-preset-editor-name');
    const enabledCheck = document.getElementById('chat-preset-editor-enabled');
    const presets = _getChatPresets();
    let preset;
    if (_editingChatPresetIdx >= 0) {
        preset = presets[_editingChatPresetIdx];
    } else {
        preset = _newChatPreset('');
        presets.push(preset);
        _editingChatPresetIdx = presets.length - 1;
    }
    preset.name = (nameInput.value || '').trim() || '未命名预设';
    preset.enabled = enabledCheck.checked;
    preset.promptEntries = _collectPromptEntries();
    preset.regexRules = _collectRegexRules();
    _saveChatPresets(presets);
    return preset;
}

function saveChatPresetEditor() {
    const nameInput = document.getElementById('chat-preset-editor-name');
    if (!(nameInput.value || '').trim()) {
        showToast('请输入预设名称');
        return;
    }
    _collectEditingPreset();
    closeChatPresetEditor();
    showToast('预设已保存');
}

function closeChatPresetEditor() {
    const modal = document.getElementById('chat-preset-editor-modal');
    if (modal) modal.style.display = 'none';
    _editingChatPresetIdx = -1;
    const listModal = document.getElementById('chat-presets-modal');
    if (listModal) listModal.style.display = 'flex';
    renderChatPresetsList();
}

/* ===== 条目渲染 ===== */

function renderChatPresetEntries(entries) {
    const list = document.getElementById('chat-preset-entries-list');
    if (!list) return;
    list.innerHTML = '';
    if (!entries.length) {
        list.innerHTML = '<div style="font-size:13px;color:#aaa;padding:8px 4px;">暂无条目，点击"添加条目"新增提示词内容</div>';
        return;
    }
    entries.forEach((entry, i) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid #e5e5ea;border-radius:12px;padding:10px;background:#fafafa;';

        const headRow = document.createElement('div');
        headRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.placeholder = '条目标题（可选，如：文风要求）';
        titleInput.value = entry.title || '';
        titleInput.dataset.entryField = 'title';
        titleInput.dataset.entryIdx = i;
        titleInput.style.cssText = 'flex:1;padding:6px 10px;border-radius:8px;border:1px solid #ddd;font-size:13px;';
        headRow.appendChild(titleInput);

        const enableLabel = document.createElement('label');
        enableLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;white-space:nowrap;';
        const enableCheck = document.createElement('input');
        enableCheck.type = 'checkbox';
        enableCheck.checked = entry.enabled !== false;
        enableCheck.dataset.entryField = 'enabled';
        enableCheck.dataset.entryIdx = i;
        enableLabel.appendChild(enableCheck);
        enableLabel.appendChild(document.createTextNode('启用'));
        headRow.appendChild(enableLabel);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.style.cssText = 'padding:4px 10px;border-radius:8px;font-size:12px;';
        delBtn.textContent = '删除';
        delBtn.onclick = function () {
            if (!confirm('删除该条目？')) return;
            entries.splice(i, 1);
            renderChatPresetEntries(entries);
        };
        headRow.appendChild(delBtn);

        box.appendChild(headRow);

        const contentArea = document.createElement('textarea');
        contentArea.placeholder = '提示词内容，支持变量：{角色名} {用户名}';
        contentArea.value = entry.content || '';
        contentArea.dataset.entryField = 'content';
        contentArea.dataset.entryIdx = i;
        contentArea.style.cssText = 'width:100%;min-height:90px;padding:8px 10px;border-radius:8px;border:1px solid #ddd;font-size:13px;box-sizing:border-box;resize:vertical;';
        box.appendChild(contentArea);

        list.appendChild(box);
    });
}

function addChatPresetEntry() {
    const list = document.getElementById('chat-preset-entries-list');
    if (!list) return;
    const entries = _collectPromptEntries();
    entries.push(_newPromptEntry());
    renderChatPresetEntries(entries);
    const boxes = list.querySelectorAll('textarea');
    if (boxes.length) boxes[boxes.length - 1].focus();
}

function _collectPromptEntries() {
    const list = document.getElementById('chat-preset-entries-list');
    if (!list) return [];
    const entries = [];
    const boxes = list.children;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const titleInput = box.querySelector('input[data-entry-field="title"]');
        const enableCheck = box.querySelector('input[data-entry-field="enabled"]');
        const contentArea = box.querySelector('textarea[data-entry-field="content"]');
        if (!contentArea) continue;
        entries.push({
            id: 'pe_' + i + '_' + Date.now(),
            title: titleInput ? titleInput.value.trim() : '',
            content: contentArea.value,
            enabled: enableCheck ? enableCheck.checked : true
        });
    }
    return entries;
}

/* ===== 正则渲染 ===== */

function renderChatPresetRegexes(rules) {
    const list = document.getElementById('chat-preset-regex-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rules.length) {
        list.innerHTML = '<div style="font-size:13px;color:#aaa;padding:8px 4px;">暂无正则规则</div>';
        return;
    }
    rules.forEach((rule, i) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid #e5e5ea;border-radius:12px;padding:10px;background:#fafafa;';

        const headRow = document.createElement('div');
        headRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

        const enableLabel = document.createElement('label');
        enableLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;';
        const enableCheck = document.createElement('input');
        enableCheck.type = 'checkbox';
        enableCheck.checked = rule.enabled !== false;
        enableCheck.dataset.regexField = 'enabled';
        enableCheck.dataset.regexIdx = i;
        enableLabel.appendChild(enableCheck);
        enableLabel.appendChild(document.createTextNode('启用'));
        headRow.appendChild(enableLabel);

        const scopeSelect = document.createElement('select');
        scopeSelect.dataset.regexField = 'scope';
        scopeSelect.dataset.regexIdx = i;
        scopeSelect.style.cssText = 'padding:4px 8px;border-radius:8px;border:1px solid #ddd;font-size:12px;';
        scopeSelect.innerHTML =
            '<option value="ai">AI 回复显示前</option>' +
            '<option value="user">发送给 AI 前</option>' +
            '<option value="both">两者都生效</option>';
        scopeSelect.value = rule.scope || 'ai';
        headRow.appendChild(scopeSelect);

        headRow.appendChild(document.createElement('div')); // spacer

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.style.cssText = 'padding:4px 10px;border-radius:8px;font-size:12px;margin-left:auto;';
        delBtn.textContent = '删除';
        delBtn.onclick = function () {
            if (!confirm('删除该正则规则？')) return;
            rules.splice(i, 1);
            renderChatPresetRegexes(rules);
        };
        headRow.appendChild(delBtn);

        box.appendChild(headRow);

        const patternRow = document.createElement('div');
        patternRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
        const slash1 = document.createElement('span');
        slash1.textContent = '/';
        slash1.style.cssText = 'font-size:14px;color:#888;';
        const patternInput = document.createElement('input');
        patternInput.type = 'text';
        patternInput.placeholder = '正则表达式（不含两侧斜杠）';
        patternInput.value = rule.pattern || '';
        patternInput.dataset.regexField = 'pattern';
        patternInput.dataset.regexIdx = i;
        patternInput.style.cssText = 'flex:1;padding:6px 10px;border-radius:8px;border:1px solid #ddd;font-size:13px;font-family:monospace;';
        const slash2 = document.createElement('span');
        slash2.textContent = '/';
        slash2.style.cssText = 'font-size:14px;color:#888;';
        const flagsInput = document.createElement('input');
        flagsInput.type = 'text';
        flagsInput.placeholder = 'g';
        flagsInput.value = rule.flags || 'g';
        flagsInput.dataset.regexField = 'flags';
        flagsInput.dataset.regexIdx = i;
        flagsInput.style.cssText = 'width:52px;padding:6px 8px;border-radius:8px;border:1px solid #ddd;font-size:13px;font-family:monospace;text-align:center;';
        patternRow.appendChild(slash1);
        patternRow.appendChild(patternInput);
        patternRow.appendChild(slash2);
        patternRow.appendChild(flagsInput);
        box.appendChild(patternRow);

        const replaceRow = document.createElement('div');
        replaceRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.cssText = 'font-size:14px;color:#888;';
        const replaceInput = document.createElement('input');
        replaceInput.type = 'text';
        replaceInput.placeholder = '替换为（留空=删除匹配内容，可用 $1 $2 引用分组）';
        replaceInput.value = rule.replacement || '';
        replaceInput.dataset.regexField = 'replacement';
        replaceInput.dataset.regexIdx = i;
        replaceInput.style.cssText = 'flex:1;padding:6px 10px;border-radius:8px;border:1px solid #ddd;font-size:13px;font-family:monospace;';
        replaceRow.appendChild(arrow);
        replaceRow.appendChild(replaceInput);
        box.appendChild(replaceRow);

        list.appendChild(box);
    });
}

function addChatPresetRegex() {
    const rules = _collectRegexRules();
    rules.push(_newRegexRule());
    renderChatPresetRegexes(rules);
}

function _collectRegexRules() {
    const list = document.getElementById('chat-preset-regex-list');
    if (!list) return [];
    const rules = [];
    const boxes = list.children;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const enableCheck = box.querySelector('input[data-regex-field="enabled"]');
        const scopeSelect = box.querySelector('select[data-regex-field="scope"]');
        const patternInput = box.querySelector('input[data-regex-field="pattern"]');
        const flagsInput = box.querySelector('input[data-regex-field="flags"]');
        const replaceInput = box.querySelector('input[data-regex-field="replacement"]');
        if (!patternInput) continue;
        rules.push({
            id: 'rr_' + i + '_' + Date.now(),
            pattern: patternInput.value,
            flags: (flagsInput.value || 'g').replace(/[^gimsuy]/g, ''),
            replacement: replaceInput.value,
            scope: scopeSelect ? scopeSelect.value : 'ai',
            enabled: enableCheck ? enableCheck.checked : true
        });
    }
    return rules;
}

/* ===== 应用层（供提示词 / 消息处理调用） ===== */

function getActiveChatPreset(character) {
    const presets = _getChatPresets();
    if (!presets.length) return null;
    let preset = null;
    if (character && character.exclusiveChatPreset) {
        preset = presets.find(p => p.id === character.exclusiveChatPreset);
    }
    if (!preset && db.cotSettings && db.cotSettings.activeChatPresetId) {
        preset = presets.find(p => p.id === db.cotSettings.activeChatPresetId);
    }
    if (!preset) return null;
    return preset.enabled === false ? null : preset;
}

function buildChatPresetPromptSection(character) {
    const preset = getActiveChatPreset(character);
    if (!preset) return '';
    const entries = (preset.promptEntries || [])
        .filter(e => e.enabled !== false && (e.content || '').trim());
    if (!entries.length) return '';
    const charName = (character && (character.realName || character.name)) || '角色';
    const userName = (character && character.myName) || '用户';
    let section = '\n\n【聊天预设】\n';
    entries.forEach(e => {
        let content = e.content
            .replace(/\{角色名\}/g, charName)
            .replace(/\{用户名\}/g, userName);
        if (e.title && e.title.trim()) {
            section += `\n<${e.title.trim()}>\n${content}\n</${e.title.trim()}>\n`;
        } else {
            section += `\n${content}\n`;
        }
    });
    return section;
}

function applyChatPresetRegex(text, character, scope) {
    if (!text || typeof text !== 'string') return text;
    const preset = getActiveChatPreset(character);
    if (!preset) return text;
    let result = text;
    (preset.regexRules || []).forEach(rule => {
        if (rule.enabled === false || !rule.pattern) return;
        const ruleScope = rule.scope || 'ai';
        if (scope && ruleScope !== 'both' && ruleScope !== scope) return;
        try {
            const flags = rule.flags || 'g';
            const re = new RegExp(rule.pattern, flags.includes('g') ? flags : flags + 'g');
            result = result.replace(re, rule.replacement || '');
        } catch (e) {
            console.warn('聊天预设正则无效:', rule.pattern, e.message);
        }
    });
    return result;
}

/* ===== 事件绑定 ===== */

function setupChatPresetFeatures() {
    const manageBtn = document.getElementById('chat-presets-manage-btn');
    if (manageBtn) manageBtn.addEventListener('click', openChatPresetsModal);

    const closeBtn = document.getElementById('chat-presets-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () {
        document.getElementById('chat-presets-modal').style.display = 'none';
    });

    const newBtn = document.getElementById('chat-preset-new-btn');
    if (newBtn) newBtn.addEventListener('click', function () { openChatPresetEditor(-1); });

    const saveBtn = document.getElementById('chat-preset-editor-save');
    if (saveBtn) saveBtn.addEventListener('click', saveChatPresetEditor);

    const cancelBtn = document.getElementById('chat-preset-editor-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
        closeChatPresetEditor();
    });

    const addEntryBtn = document.getElementById('chat-preset-add-entry-btn');
    if (addEntryBtn) addEntryBtn.addEventListener('click', addChatPresetEntry);

    const addRegexBtn = document.getElementById('chat-preset-add-regex-btn');
    if (addRegexBtn) addRegexBtn.addEventListener('click', addChatPresetRegex);
}
