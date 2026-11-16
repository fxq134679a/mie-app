// --- 角色切换与专属生图配置（zk8：单角色面板，无「添加角色」，无人物/非人物分类） ---

function wsEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 取当前选中角色的绑定配置（没有就懒创建）
function ensureWorkshopBoundChar(charId) {
    if (!db.workshopSettings) db.workshopSettings = {};
    if (!Array.isArray(db.workshopSettings.boundCharacters)) db.workshopSettings.boundCharacters = [];
    let bc = db.workshopSettings.boundCharacters.find(b => b.charId === charId);
    if (!bc) {
        bc = { charId: charId, imgGenEnabled: false, imgGenAspectRatio: '', imgGenPositive: '', imgGenNegative: '', imgGenRefs: [] };
        db.workshopSettings.boundCharacters.push(bc);
    }
    migrateWorkshopBoundChar(bc);
    return bc;
}

// 旧数据迁移：人物/非人物分类提示词 → 单套；分类参考图 → 平铺
function migrateWorkshopBoundChar(bc) {
    let changed = false;
    if (bc.imgGenPrompts && (bc.imgGenPrompts.people || bc.imgGenPrompts['non-people'])) {
        const p = bc.imgGenPrompts;
        if (!bc.imgGenPositive) bc.imgGenPositive = [p.people && p.people.positive, p['non-people'] && p['non-people'].positive].filter(Boolean).join(', ');
        if (!bc.imgGenNegative) bc.imgGenNegative = [p.people && p.people.negative, p['non-people'] && p['non-people'].negative].filter(Boolean).join(', ');
        delete bc.imgGenPrompts;
        changed = true;
    }
    if (bc.imgGenRefs && !Array.isArray(bc.imgGenRefs)) {
        const old = bc.imgGenRefs || {};
        bc.imgGenRefs = [...(old.people || []), ...(old['non-people'] || [])];
        changed = true;
    }
    if (!Array.isArray(bc.imgGenRefs)) { bc.imgGenRefs = []; changed = true; }
    if (changed) saveData();
}

function getWorkshopActiveChar() {
    if (!db.workshopSettings || !db.workshopSettings.activeCharId) return null;
    const char = db.characters.find(c => c.id === db.workshopSettings.activeCharId);
    return char || null;
}

function initWorkshopCharManagement() {
    const select = document.getElementById('workshop-char-select');
    const panel = document.getElementById('workshop-char-panel');
    if (!select || !panel) return;

    if (!db.workshopSettings) db.workshopSettings = {};

    // ── 角色下拉：列出全部角色 ──
    const renderSelect = () => {
        select.innerHTML = '';
        db.characters.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.remarkName || c.name || c.realName || '角色';
            select.appendChild(opt);
        });
        // 恢复上次选中的角色；没有记录就默认第一个
        if (!db.workshopSettings.activeCharId || !db.characters.some(c => c.id === db.workshopSettings.activeCharId)) {
            db.workshopSettings.activeCharId = db.characters.length ? db.characters[0].id : '';
        }
        select.value = db.workshopSettings.activeCharId || '';
    };
    renderSelect();

    select.addEventListener('change', async () => {
        db.workshopSettings.activeCharId = select.value;
        await saveData();
        renderCharPanel();
    });

    // ── 当前角色的专属配置面板 ──
    const renderCharPanel = async () => {
        const char = getWorkshopActiveChar();
        if (!char) {
            panel.innerHTML = '<div class="ws-empty" style="margin: 14px 16px;">还没有角色，先去创建一个角色吧</div>';
            return;
        }
        const bc = ensureWorkshopBoundChar(char.id);
        const charName = char.remarkName || char.name || char.realName || '角色';
        const ratioVal = bc.imgGenAspectRatio || '';

        panel.innerHTML = `
            <div class="ws-sec-head">
                <div>
                    <div class="ws-sec-title">${wsEsc(charName)} · 生图配置</div>
                </div>
                <label class="kkt-switch">
                    <input type="checkbox" id="ws-char-imggen-toggle" ${bc.imgGenEnabled ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>
            <div id="ws-char-imggen-panel" style="display: ${bc.imgGenEnabled ? 'block' : 'none'};">
                <div class="ws-row" style="flex-direction: column; align-items: stretch;">
                    <div class="ws-label" style="margin-bottom: 8px;">画面比例</div>
                    <div class="ws-pill-row" id="ws-char-ratio-row">
                        ${[['', '默认'], ['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']]
                            .map(([v, t]) => `<button type="button" class="ws-pill ws-ratio-pill ${ratioVal === v ? 'on' : ''}" data-v="${v}">${t}</button>`).join('')}
                    </div>
                </div>
                <div class="ws-row" style="flex-direction: column; align-items: stretch; border-top: 1px solid var(--ws-line);">
                    <div class="ws-label" style="margin-bottom: 8px;">正面提示词</div>
                    <textarea id="ws-char-positive" class="ws-textarea" placeholder="正面提示词">${wsEsc(bc.imgGenPositive || '')}</textarea>
                    <div class="ws-label" style="margin: 12px 0 8px;">负面提示词</div>
                    <textarea id="ws-char-negative" class="ws-textarea" style="min-height: 60px;" placeholder="负面提示词">${wsEsc(bc.imgGenNegative || '')}</textarea>
                </div>
                <div class="ws-row" style="flex-direction: column; align-items: stretch; border-top: 1px solid var(--ws-line);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div class="ws-label">参考图</div>
                        <div style="display: flex; gap: 6px;">
                            <input type="file" id="ws-char-ref-upload" accept="image/*" multiple style="display: none;">
                            <button type="button" class="ws-btn" id="ws-char-ref-add-btn">+ 添加</button>
                            <button type="button" class="ws-btn" id="ws-char-ref-del-btn">删除</button>
                        </div>
                    </div>
                    <div class="ws-ref-grid" id="ws-char-ref-grid"></div>
                    <div id="ws-char-ref-delbar" style="display: none; margin-top: 8px;">
                        <button type="button" class="ws-btn ws-btn-dark" id="ws-char-ref-delok-btn">删除选中 (0)</button>
                    </div>
                </div>
            </div>
        `;

        // 开关
        panel.querySelector('#ws-char-imggen-toggle').addEventListener('change', async (e) => {
            bc.imgGenEnabled = e.target.checked;
            panel.querySelector('#ws-char-imggen-panel').style.display = e.target.checked ? 'block' : 'none';
            await saveData();
        });

        // 比例
        panel.querySelectorAll('.ws-ratio-pill').forEach(pill => {
            pill.addEventListener('click', async () => {
                bc.imgGenAspectRatio = pill.dataset.v;
                panel.querySelectorAll('.ws-ratio-pill').forEach(p => p.classList.toggle('on', p === pill));
                await saveData();
            });
        });

        // 提示词
        panel.querySelector('#ws-char-positive').addEventListener('change', async (e) => {
            bc.imgGenPositive = e.target.value.trim();
            await saveData();
        });
        panel.querySelector('#ws-char-negative').addEventListener('change', async (e) => {
            bc.imgGenNegative = e.target.value.trim();
            await saveData();
        });

        // ── 参考图 ──
        let deleteMode = false;
        const delSel = new Set();

        const getRefs = () => { if (!Array.isArray(bc.imgGenRefs)) bc.imgGenRefs = []; return bc.imgGenRefs; };

        const exitDeleteMode = () => {
            deleteMode = false;
            delSel.clear();
            const bar = panel.querySelector('#ws-char-ref-delbar');
            if (bar) bar.style.display = 'none';
            renderRefs();
        };

        const renderRefs = () => {
            const grid = panel.querySelector('#ws-char-ref-grid');
            if (!grid) return;
            const refs = getRefs();
            if (refs.length === 0) {
                grid.innerHTML = '<div class="ws-empty" style="grid-column: 1 / -1; padding: 14px;">暂无参考图</div>';
                return;
            }
            grid.innerHTML = '';
            refs.forEach(ref => {
                const item = document.createElement('div');
                item.className = 'ws-ref-item' + (deleteMode && delSel.has(ref.id) ? ' del-sel' : '');
                item.innerHTML = `<img src="${ref.src}" alt=""><div class="ws-ref-mask">${deleteMode && delSel.has(ref.id) ? '✓' : ''}</div>`;
                if (deleteMode) {
                    item.addEventListener('click', () => {
                        if (delSel.has(ref.id)) delSel.delete(ref.id); else delSel.add(ref.id);
                        renderRefs();
                    });
                }
                grid.appendChild(item);
            });
        };

        const addBtn = panel.querySelector('#ws-char-ref-add-btn');
        const uploadInput = panel.querySelector('#ws-char-ref-upload');
        addBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            const refs = getRefs();
            for (const file of files) {
                if (file.size > 5 * 1024 * 1024) {
                    showToast(`${file.name} 超过 5MB，已跳过`);
                    continue;
                }
                try {
                    const src = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    refs.push({ id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), src });
                } catch (err) {
                    console.error('Failed to read reference image:', err);
                }
            }
            await saveData();
            renderRefs();
            e.target.value = null;
            showToast(`已添加 ${files.length} 张参考图`);
        });

        const delBtn = panel.querySelector('#ws-char-ref-del-btn');
        delBtn.addEventListener('click', () => {
            if (deleteMode) { exitDeleteMode(); return; }
            if (getRefs().length === 0) { showToast('暂无参考图'); return; }
            deleteMode = true;
            delSel.clear();
            delBtn.textContent = '取消';
            const bar = panel.querySelector('#ws-char-ref-delbar');
            if (bar) bar.style.display = 'block';
            renderRefs();
        });

        panel.querySelector('#ws-char-ref-delok-btn').addEventListener('click', async () => {
            if (delSel.size === 0) { showToast('请先点选要删除的图片'); return; }
            const n = delSel.size;
            const refs = getRefs();
            bc.imgGenRefs = refs.filter(r => !delSel.has(r.id));
            await saveData();
            const btn = panel.querySelector('#ws-char-ref-del-btn');
            if (btn) btn.textContent = '删除';
            exitDeleteMode();
            showToast(`已删除 ${n} 张`);
        });

        renderRefs();
    };

    renderCharPanel();
}
