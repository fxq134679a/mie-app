// --- 角色管理逻辑 ---
function initWorkshopCharManagement() {
    const addCharBtn = document.getElementById('workshop-add-char-btn');
    const charListContainer = document.getElementById('workshop-char-list');
    const addCharModal = document.getElementById('workshop-add-char-modal');
    const charSelectionList = document.getElementById('workshop-char-selection-list');
    const confirmAddBtn = document.getElementById('workshop-confirm-add-char-btn');
    const cancelAddBtn = document.getElementById('workshop-cancel-add-char-btn');

    if (!addCharBtn || !charListContainer || !addCharModal) return;

    if (!db.workshopSettings) db.workshopSettings = {};
    if (!db.workshopSettings.boundCharacters) db.workshopSettings.boundCharacters = [];

    // 数据迁移：将角色对象上的旧 charImgGen 数据迁移到 boundCharacters
    const migrateCharImgGenData = () => {
        let migrated = false;
        db.workshopSettings.boundCharacters.forEach(bc => {
            const char = db.characters.find(c => c.id === bc.charId);
            if (!char || !char.charImgGenEnabled) return;

            if (bc.imgGenEnabled === undefined) bc.imgGenEnabled = char.charImgGenEnabled;
            if (bc.imgGenAspectRatio === undefined) bc.imgGenAspectRatio = char.charImgGenAspectRatio || '';
            if (!bc.imgGenPrompts && char.charImgGenPrompts) bc.imgGenPrompts = JSON.parse(JSON.stringify(char.charImgGenPrompts));
            if (!bc.imgGenRefs && char.charImgGenRefs) bc.imgGenRefs = JSON.parse(JSON.stringify(char.charImgGenRefs));
            migrated = true;
        });
        if (migrated) saveData();
    };
    migrateCharImgGenData();

    const renderBoundChars = () => {
        charListContainer.innerHTML = '';
        const boundChars = db.workshopSettings.boundCharacters;

        if (boundChars.length === 0) {
            charListContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无角色，点击右上角添加</div>';
            return;
        }

        boundChars.forEach((boundChar, index) => {
            const char = db.characters.find(c => c.id === boundChar.charId);
            if (!char) return;

            const itemDiv = document.createElement('div');
            itemDiv.style.border = '1px solid #eee';
            itemDiv.style.borderRadius = '8px';
            itemDiv.style.padding = '12px';
            itemDiv.style.background = '#fff';
            itemDiv.style.position = 'relative';

            // 初始化 imgGen 数据结构
            if (!boundChar.imgGenPrompts) boundChar.imgGenPrompts = {};
            if (!boundChar.imgGenRefs) boundChar.imgGenRefs = { people: [], 'non-people': [] };

            const imgGenEnabled = boundChar.imgGenEnabled || false;
            const aspectRatio = boundChar.imgGenAspectRatio || '';

            itemDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <img src="${char.avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 14px;">${char.remarkName || char.name || '未知角色'}</div>
                        <div style="font-size: 12px; color: #666;">变量: <code>{{${char.realName}}}</code></div>
                    </div>
                    <button class="icon-btn-simple danger remove-char-btn" title="移除" style="padding: 4px;">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="font-weight: bold; font-size: 12px; color: #666; display: block; margin-bottom: 4px;">专属跑图词 (变量替换)</label>
                    <textarea class="char-prompt-input" rows="2" style="width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 12px;" placeholder="输入该角色的专属跑图词，会替换提示词中的 {{${char.realName}}}...">${boundChar.prompt || ''}</textarea>
                </div>
                <div style="border-top: 1px solid #f0f0f0; padding-top: 10px; margin-top: 4px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                        <label style="font-weight: bold; font-size: 12px; color: #666;">专属生图配置</label>
                        <label class="kkt-switch">
                            <input type="checkbox" class="char-imggen-toggle" ${imgGenEnabled ? 'checked' : ''}>
                            <span class="kkt-slider"></span>
                        </label>
                    </div>
                    <div class="char-imggen-panel" style="display: ${imgGenEnabled ? 'block' : 'none'}; background: #f9f9f9; border-radius: 10px; padding: 10px; border: 1px solid #f0f0f0;">
                        <div style="margin-bottom: 10px;">
                            <label style="font-weight: bold; font-size: 11px; color: #888; display: block; margin-bottom: 4px;">画面比例</label>
                            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="" ${aspectRatio === '' ? 'checked' : ''}> 跟随全局</label>
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="1:1" ${aspectRatio === '1:1' ? 'checked' : ''}> 1:1</label>
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="3:4" ${aspectRatio === '3:4' ? 'checked' : ''}> 3:4</label>
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="4:3" ${aspectRatio === '4:3' ? 'checked' : ''}> 4:3</label>
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="9:16" ${aspectRatio === '9:16' ? 'checked' : ''}> 9:16</label>
                                <label style="font-size:11px; display:flex; align-items:center; gap:2px;"><input type="radio" name="char-imggen-ratio-${index}" value="16:9" ${aspectRatio === '16:9' ? 'checked' : ''}> 16:9</label>
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; margin-bottom:6px;">
                            <button type="button" class="btn btn-small btn-primary imggen-cat-tab active" data-category="people" style="padding:3px 8px; font-size:11px;">人物类</button>
                            <button type="button" class="btn btn-small imggen-cat-tab" data-category="non-people" style="padding:3px 8px; font-size:11px;">非人物类</button>
                        </div>
                        <div class="imggen-ref-gallery" style="display:grid; grid-template-columns:repeat(4,1fr); gap:5px; min-height:50px; background:#fff; border:1px solid #eee; border-radius:6px; padding:6px; margin-bottom:6px;">
                            <div style="grid-column:1/-1; text-align:center; color:#999; font-size:11px; padding:8px;">暂无参考图</div>
                        </div>
                        <div class="imggen-delete-bar" style="display:none; margin-bottom:4px;">
                            <button type="button" class="btn btn-small btn-danger imggen-delete-selected-btn" style="padding:3px 6px; font-size:11px;">删除选中 (0)</button>
                        </div>
                        <div style="display:flex; gap:4px; margin-bottom:4px;">
                            <input type="file" class="imggen-ref-upload" accept="image/*" multiple style="display:none;">
                            <button type="button" class="btn btn-small btn-secondary imggen-ref-upload-btn" style="padding:3px 6px; font-size:11px;">+ 添加参考图</button>
                            <button type="button" class="btn btn-small imggen-ref-delete-btn" style="padding:3px 6px; font-size:11px;">删除</button>
                        </div>
                        <div style="font-size:10px; color:#999; margin-bottom:6px;">人物类：角色照片/自拍；非人物类：风景/物品/场景</div>
                        <div style="margin-bottom:6px;">
                            <label style="font-weight: bold; font-size: 11px; color: #888; display: block; margin-bottom: 3px;">正面提示词</label>
                            <textarea class="imggen-positive-prompt" style="width:100%; border:1px solid #eee; border-radius:6px; padding:6px; min-height:40px; font-size:11px; resize:vertical;" placeholder="该分类的专属正面提示词"></textarea>
                        </div>
                        <div>
                            <label style="font-weight: bold; font-size: 11px; color: #888; display: block; margin-bottom: 3px;">负面提示词</label>
                            <textarea class="imggen-negative-prompt" style="width:100%; border:1px solid #eee; border-radius:6px; padding:6px; min-height:35px; font-size:11px; resize:vertical;" placeholder="该分类的专属负面提示词"></textarea>
                        </div>
                    </div>
                </div>
            `;

            // --- 事件绑定 ---
            const removeBtn = itemDiv.querySelector('.remove-char-btn');
            const promptInput = itemDiv.querySelector('.char-prompt-input');
            const imgGenToggle = itemDiv.querySelector('.char-imggen-toggle');
            const imgGenPanel = itemDiv.querySelector('.char-imggen-panel');

            removeBtn.addEventListener('click', async () => {
                if (confirm(`确定要从工坊移除角色 ${char.remarkName || char.name || '未知角色'} 吗？`)) {
                    db.workshopSettings.boundCharacters.splice(index, 1);
                    await saveData();
                    renderBoundChars();
                }
            });

            promptInput.addEventListener('change', async (e) => {
                boundChar.prompt = e.target.value.trim();
                await saveData();
            });

            imgGenToggle.addEventListener('change', async () => {
                boundChar.imgGenEnabled = imgGenToggle.checked;
                imgGenPanel.style.display = imgGenToggle.checked ? 'block' : 'none';
                await saveData();
            });

            // 画面比例
            const ratioRadios = itemDiv.querySelectorAll(`input[name="char-imggen-ratio-${index}"]`);
            ratioRadios.forEach(radio => {
                radio.addEventListener('change', async () => {
                    boundChar.imgGenAspectRatio = radio.value;
                    await saveData();
                });
            });

            // 分类标签 + 参考图 + 提示词 的状态
            let currentCategory = 'people';
            let deleteMode = false;
            const deleteSelected = new Set();

            const getCatPrompts = (category) => {
                if (!boundChar.imgGenPrompts[category]) boundChar.imgGenPrompts[category] = { positive: '', negative: '' };
                return boundChar.imgGenPrompts[category];
            };

            const getRefImages = (category) => {
                if (!boundChar.imgGenRefs[category]) boundChar.imgGenRefs[category] = [];
                return boundChar.imgGenRefs[category];
            };

            const saveCurrentPrompts = () => {
                const prompts = getCatPrompts(currentCategory);
                prompts.positive = itemDiv.querySelector('.imggen-positive-prompt').value;
                prompts.negative = itemDiv.querySelector('.imggen-negative-prompt').value;
            };

            const loadCategoryPrompts = (category) => {
                const prompts = getCatPrompts(category);
                itemDiv.querySelector('.imggen-positive-prompt').value = prompts.positive || '';
                itemDiv.querySelector('.imggen-negative-prompt').value = prompts.negative || '';
            };

            const exitDeleteMode = () => {
                deleteMode = false;
                deleteSelected.clear();
                const delBtn = itemDiv.querySelector('.imggen-ref-delete-btn');
                if (delBtn) { delBtn.classList.remove('btn-danger'); delBtn.textContent = '删除'; }
                const bar = itemDiv.querySelector('.imggen-delete-bar');
                if (bar) bar.style.display = 'none';
                renderRefGallery();
            };

            const updateDeleteBar = () => {
                const bar = itemDiv.querySelector('.imggen-delete-bar');
                const btn = itemDiv.querySelector('.imggen-delete-selected-btn');
                if (!bar || !btn) return;
                if (deleteMode) {
                    bar.style.display = 'block';
                    btn.textContent = `删除选中 (${deleteSelected.size})`;
                } else {
                    bar.style.display = 'none';
                }
            };

            const renderRefGallery = () => {
                const gallery = itemDiv.querySelector('.imggen-ref-gallery');
                if (!gallery) return;
                const refs = getRefImages(currentCategory);

                if (refs.length === 0) {
                    gallery.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#999; font-size:11px; padding:8px;">暂无参考图</div>';
                    return;
                }

                gallery.innerHTML = '';
                refs.forEach((ref) => {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'position:relative; aspect-ratio:1; border-radius:4px; overflow:hidden; background:#eee; cursor:pointer;';

                    const img = document.createElement('img');
                    img.src = ref.src;
                    img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                    wrapper.appendChild(img);

                    if (deleteMode) {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center;';
                        const isSelected = deleteSelected.has(ref.id);
                        overlay.style.background = isSelected ? 'rgba(255,0,0,0.25)' : 'rgba(0,0,0,0.15)';
                        const check = document.createElement('div');
                        check.style.cssText = `width:18px; height:18px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; font-size:12px; color:#fff; ${isSelected ? 'background:rgba(255,0,0,0.7);' : 'background:rgba(0,0,0,0.3);'}`;
                        check.textContent = isSelected ? '✓' : '';
                        overlay.appendChild(check);
                        wrapper.appendChild(overlay);
                        wrapper.onclick = () => {
                            if (deleteSelected.has(ref.id)) deleteSelected.delete(ref.id);
                            else deleteSelected.add(ref.id);
                            renderRefGallery();
                            updateDeleteBar();
                        };
                    }
                    gallery.appendChild(wrapper);
                });
            };

            // 分类标签切换
            const catTabs = itemDiv.querySelectorAll('.imggen-cat-tab');
            catTabs.forEach(tab => {
                tab.addEventListener('click', async () => {
                    saveCurrentPrompts();
                    currentCategory = tab.dataset.category;
                    catTabs.forEach(t => {
                        t.classList.toggle('btn-primary', t.dataset.category === currentCategory);
                        t.classList.toggle('active', t.dataset.category === currentCategory);
                    });
                    exitDeleteMode();
                    loadCategoryPrompts(currentCategory);
                    await saveData();
                });
            });

            // 上传参考图
            const uploadInput = itemDiv.querySelector('.imggen-ref-upload');
            const uploadBtn = itemDiv.querySelector('.imggen-ref-upload-btn');
            uploadBtn.addEventListener('click', () => uploadInput.click());

            uploadInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (!files.length) return;
                const refs = getRefImages(currentCategory);

                for (const file of files) {
                    if (file.size > 5 * 1024 * 1024) {
                        if (typeof showToast === 'function') showToast(`${file.name} 超过 5MB，已跳过`);
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
                renderRefGallery();
                e.target.value = null;
                if (typeof showToast === 'function') showToast(`已添加 ${files.length} 张参考图`);
            });

            // 删除模式切换
            const deleteBtn = itemDiv.querySelector('.imggen-ref-delete-btn');
            deleteBtn.addEventListener('click', () => {
                if (deleteMode) {
                    exitDeleteMode();
                } else {
                    const refs = getRefImages(currentCategory);
                    if (refs.length === 0) {
                        if (typeof showToast === 'function') showToast('当前分类暂无参考图');
                        return;
                    }
                    deleteMode = true;
                    deleteSelected.clear();
                    deleteBtn.classList.add('btn-danger');
                    deleteBtn.textContent = '取消';
                    renderRefGallery();
                    updateDeleteBar();
                }
            });

            // 批量删除选中
            const deleteSelectedBtn = itemDiv.querySelector('.imggen-delete-selected-btn');
            deleteSelectedBtn.addEventListener('click', async () => {
                if (deleteSelected.size === 0) {
                    if (typeof showToast === 'function') showToast('请先选择要删除的图片');
                    return;
                }
                const refs = getRefImages(currentCategory);
                for (let i = refs.length - 1; i >= 0; i--) {
                    if (deleteSelected.has(refs[i].id)) refs.splice(i, 1);
                }
                await saveData();
                exitDeleteMode();
                if (typeof showToast === 'function') showToast(`已删除 ${deleteSelected.size} 张`);
            });

            // 提示词失焦保存
            const positiveInput = itemDiv.querySelector('.imggen-positive-prompt');
            const negativeInput = itemDiv.querySelector('.imggen-negative-prompt');
            positiveInput.addEventListener('change', async () => {
                saveCurrentPrompts();
                await saveData();
            });
            negativeInput.addEventListener('change', async () => {
                saveCurrentPrompts();
                await saveData();
            });

            // 初始加载当前分类的提示词和参考图
            loadCategoryPrompts('people');
            renderRefGallery();

            charListContainer.appendChild(itemDiv);
        });
    };

    renderBoundChars();

    // 打开添加角色模态框
    addCharBtn.addEventListener('click', () => {
        charSelectionList.innerHTML = '';
        const boundCharIds = db.workshopSettings.boundCharacters.map(bc => bc.charId);
        const availableChars = db.characters.filter(c => !boundCharIds.includes(c.id));

        if (availableChars.length === 0) {
            charSelectionList.innerHTML = '<li style="text-align: center; color: #999; padding: 20px;">没有可添加的角色了</li>';
        } else {
            availableChars.forEach(char => {
                const li = document.createElement('li');
                li.className = 'list-item';
                li.innerHTML = `
                    <label style="display: flex; align-items: center; width: 100%; cursor: pointer; gap: 10px;">
                        <input type="checkbox" value="${char.id}" class="char-select-checkbox">
                        <img src="${char.avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold;">${char.remarkName || char.name || '未知角色'}</div>
                            <div style="font-size: 12px; color: #666;">${char.realName}</div>
                        </div>
                    </label>
                `;
                charSelectionList.appendChild(li);
            });
        }

        addCharModal.classList.add('visible');
    });

    // 确认添加角色
    confirmAddBtn.addEventListener('click', async () => {
        const checkboxes = charSelectionList.querySelectorAll('.char-select-checkbox:checked');
        let added = false;

        checkboxes.forEach(cb => {
            db.workshopSettings.boundCharacters.push({
                charId: cb.value,
                prompt: '',
                imgGenEnabled: false,
                imgGenAspectRatio: '',
                imgGenPrompts: {},
                imgGenRefs: { people: [], 'non-people': [] }
            });
            added = true;
        });

        if (added) {
            await saveData();
            renderBoundChars();
        }
        addCharModal.classList.remove('visible');
    });

    // 取消添加
    cancelAddBtn.addEventListener('click', () => {
        addCharModal.classList.remove('visible');
    });
}
