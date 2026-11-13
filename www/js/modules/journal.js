// --- 回忆日记功能 (js/modules/journal.js) ---

let generatingChatId = null;

function setupMemoryJournalScreen() {
    const generateNewJournalBtn = document.getElementById('generate-new-journal-btn');
    const generateJournalModal = document.getElementById('generate-journal-modal');
    const generateJournalForm = document.getElementById('generate-journal-form');
    const journalListContainer = document.getElementById('journal-list-container');
    const editDetailBtn = document.getElementById('edit-journal-detail-btn');
    const bindWorldBookBtn = document.getElementById('bind-journal-worldbook-btn');
    // 新增元素引用
    const journalStyleModal = document.getElementById('journal-style-selection-modal');
    const saveJournalStyleBtn = document.getElementById('save-journal-style-btn');
    const journalStyleRadios = document.querySelectorAll('input[name="journal-style-mode"]');
    const customStyleContainer = document.getElementById('journal-custom-style-container');
    const journalStyleWorldBookList = document.getElementById('journal-style-worldbook-list');
    // 新增：多选管理相关元素
    const manageBtn = document.getElementById('journal-manage-btn');
    const cancelManageBtn = document.getElementById('journal-cancel-manage-btn');
    const multiSelectBar = document.getElementById('journal-multi-select-bar');
    const batchDeleteBtn = document.getElementById('journal-batch-delete-btn');
    const mergeBtn = document.getElementById('journal-merge-btn');
    const selectCountSpan = document.getElementById('journal-select-count');

    // --- 手写日记（手动添加） ---
    const manualAddBtn = document.getElementById('journal-manual-add-btn');
    const manualJournalModal = document.getElementById('manual-journal-modal');
    const manualJournalForm = document.getElementById('manual-journal-form');

    function padManual(n) { return String(n).padStart(2, '0'); }

    if (manualAddBtn && manualJournalModal && manualJournalForm) {
        manualAddBtn.addEventListener('click', () => {
            manualJournalForm.reset();
            const dateInput = document.getElementById('manual-journal-date');
            if (dateInput) {
                const now = new Date();
                dateInput.value = `${now.getFullYear()}-${padManual(now.getMonth() + 1)}-${padManual(now.getDate())}`;
            }
            manualJournalModal.classList.add('visible');
        });

        // 点遮罩关闭
        manualJournalModal.addEventListener('click', (e) => {
            if (e.target === manualJournalModal) manualJournalModal.classList.remove('visible');
        });

        manualJournalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            if (!chat) return;

            const title = document.getElementById('manual-journal-title').value.trim();
            const content = document.getElementById('manual-journal-content').value.trim();
            if (!title || !content) {
                showToast('标题和正文都要填哦');
                return;
            }

            const dateVal = document.getElementById('manual-journal-date').value;
            const createdAt = dateVal ? new Date(`${dateVal}T12:00:00`).getTime() : Date.now();

            if (!chat.memoryJournals) {
                chat.memoryJournals = [];
            }
            chat.memoryJournals.push({
                id: `journal_${Date.now()}`,
                range: { start: 0, end: 0 },
                startMessageId: null,
                endMessageId: null,
                title,
                content,
                createdAt,
                chatId: currentChatId,
                chatType: currentChatType,
                isFavorited: false,
                manual: true
            });
            await saveData();

            manualJournalModal.classList.remove('visible');
            renderJournalList();
            showToast('日记已保存');
        });
    }

    let isMultiSelectMode = false;
    let selectedJournalIds = new Set();

    // 绑定按钮点击事件
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            toggleMultiSelectMode(true);
        });
    }

    if (cancelManageBtn) {
        cancelManageBtn.addEventListener('click', () => {
            toggleMultiSelectMode(false);
        });
    }

    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async () => {
            if (selectedJournalIds.size === 0) return;
            if (confirm(`确定要删除选中的 ${selectedJournalIds.size} 篇日记吗？此操作不可恢复。`)) {
                const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
                if (!chat) return;

                chat.memoryJournals = chat.memoryJournals.filter(j => !selectedJournalIds.has(j.id));
                await saveData();
                toggleMultiSelectMode(false);
                renderJournalList();
                showToast('已批量删除');
            }
        });
    }

    if (mergeBtn) {
        mergeBtn.addEventListener('click', async () => {
            if (selectedJournalIds.size < 2) {
                showToast('请至少选择 2 篇日记进行合并');
                return;
            }
            await mergeJournals(Array.from(selectedJournalIds));
        });
    }

    function toggleMultiSelectMode(active) {
        isMultiSelectMode = active;
        selectedJournalIds.clear();
        updateSelectCount();

        // 书架视图下进入多选：先切到平铺列表，勾选框才有卡片可挂
        if (active && currentChatType === 'private' && !odCurrentMonth) {
            odCurrentMonth = 'ALL';
            renderJournalList();
        }

        const container = document.getElementById('journal-list-container');
        const cards = container.querySelectorAll('.journal-card');
        
        if (active) {
            manageBtn.style.display = 'none';
            cancelManageBtn.style.display = 'flex';
            multiSelectBar.style.display = 'flex';
            generateNewJournalBtn.style.display = 'none'; // 隐藏生成按钮避免干扰
            if (bindWorldBookBtn) bindWorldBookBtn.style.display = 'none';
            
            cards.forEach(card => {
                card.classList.add('select-mode');
            });
        } else {
            // 退出多选：回到书架视图
            if (currentChatType === 'private' && odCurrentMonth === 'ALL') {
                odCurrentMonth = null;
                renderJournalList();
            }
            manageBtn.style.display = 'flex';
            cancelManageBtn.style.display = 'none';
            multiSelectBar.style.display = 'none';
            generateNewJournalBtn.style.display = 'flex';
            if (bindWorldBookBtn && currentChatType === 'private') bindWorldBookBtn.style.display = 'flex';

            cards.forEach(card => {
                card.classList.remove('select-mode');
                const checkbox = card.querySelector('.journal-checkbox');
                if (checkbox) checkbox.classList.remove('checked');
            });
        }
    }

    function updateSelectCount() {
        if (selectCountSpan) {
            selectCountSpan.textContent = `已选 ${selectedJournalIds.size} 篇`;
        }
    }

    async function mergeJournals(journalIds) {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;

        // 1. 获取选中的日记对象并排序
        const selectedJournals = chat.memoryJournals
            .filter(j => journalIds.includes(j.id))
            .sort((a, b) => a.range.start - b.range.start); // 按消息范围起始排序

        if (selectedJournals.length === 0) return;

        // 2. 计算合并后的范围
        const mergedStart = selectedJournals[0].range.start;
        const mergedEnd = selectedJournals[selectedJournals.length - 1].range.end;

        // 3. 拼接内容
        const combinedContent = selectedJournals.map(j => `【${j.title}】\n${j.content}`).join('\n\n---\n\n');

        // 4. 构建 Prompt
        let summaryPrompt = `你是一个专业的档案记录员。请将以下多篇日记合并整理成一篇连贯、精简的“回忆录”。\n\n`;

        summaryPrompt += `【核心要求】\n`;
        summaryPrompt += `1. **体现时间进程**：正文内容必须按时间顺序组织，并明确指出时间点。**格式规范：**请严格按照“x年x月x日，发生了[事件]”的格式进行叙述，确保时间线清晰。\n`;
        summaryPrompt += `2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。\n`;
        summaryPrompt += `3. **抓取重点**：识别对话中的核心事件、重要话题转折、关键决策或信息。忽略无关的闲聊和琐碎细节。\n`;
        summaryPrompt += `4. **关键原话摘录（重要）**：\n`;
        summaryPrompt += `    - 仅当出现具有**极高情感价值**（如表白、郑重承诺、极具感染力的情感宣泄）或**重大剧情价值**（如揭示核心秘密、决定性瞬间）的对话时，请**直接引用角色的原话**。\n`;
        summaryPrompt += `    - **引用格式**：使用引号包裹原话，例如：${chat.realName}说：“我永远不会离开你。”\n`;
        summaryPrompt += `    - **严格控制数量**：只摘录最闪光、最不可替代的那几句。如果聊天记录平淡无奇或全是日常琐事，**请不要摘录任何原话**，以免破坏摘要的精简性。\n`;
        summaryPrompt += `5. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n\n`;

        summaryPrompt += `你的输出必须使用XML标签包裹，包含以下两个部分：\n`;
        summaryPrompt += `<title>一个概括性的标题，例如“1月上旬·关于旅行的筹备与出发”</title>\n`;
        summaryPrompt += `<content>合并后的正文内容</content>\n\n`;

        summaryPrompt += `请严格按照上述XML标签格式输出，不要输出任何其他多余的文字。\n\n`;
        summaryPrompt += `待合并的日记内容如下：\n\n${combinedContent}`;

        showToast('正在合并精简，请稍候...');
        
        // 退出多选模式并显示加载状态
        toggleMultiSelectMode(false);
        
        // 显示列表占位卡片
        const container = document.getElementById('journal-list-container');
        const loadingCard = document.createElement('li');
        loadingCard.className = 'journal-card generating';
        loadingCard.id = 'journal-generating-card';
        loadingCard.innerHTML = `
            <div class="spinner"></div>
            <div class="text">正在合并回忆...</div>
        `;
        if (container.firstChild) {
            container.insertBefore(loadingCard, container.firstChild);
        } else {
            container.appendChild(loadingCard);
        }
        container.scrollTop = 0;

        isGenerating = true;
        generatingChatId = currentChatId;

        try {
            const apiConfig = resolveAuxiliaryApiConfig('journal');
            let { url, key, model } = apiConfig;
            if (!url || !key || !model) {
                throw new Error("API设置不完整。");
            }

            if (url.endsWith('/')) {
                url = url.slice(0, -1);
            }

            const { requestBody, endpoint, headers } = buildChatApiRequest(
                apiConfig,
                [{ role: 'user', content: summaryPrompt }],
                { temperature: 0.7 }
            );

            const rawContent = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);

            const titleMatch = rawContent.match(/<title>([\s\S]*?)<\/title>/i);
            const contentMatch = rawContent.match(/<content>([\s\S]*?)<\/content>/i);

            const parsedTitle = titleMatch ? titleMatch[1].trim() : "合并日记";
            const parsedContent = contentMatch ? contentMatch[1].trim() : "内容为空。";

            const newJournal = {
                id: `journal_${Date.now()}`,
                range: { start: mergedStart, end: mergedEnd },
                startMessageId: chat.history[mergedStart - 1]?.id || null,
                endMessageId: chat.history[mergedEnd - 1]?.id || null,
                title: parsedTitle,
                content: parsedContent,
                createdAt: Date.now(),
                chatId: currentChatId,
                chatType: currentChatType,
                isFavorited: false 
            };

            if (!chat.memoryJournals) {
                chat.memoryJournals = [];
            }
            chat.memoryJournals.push(newJournal);
            await saveData();

            renderJournalList();
            showToast('日记合并完成！');

        } catch (error) {
            const card = document.getElementById('journal-generating-card');
            if(card) card.remove();
            showApiError(error);
        } finally {
            isGenerating = false;
            generatingChatId = null;
        }
    }

    bindWorldBookBtn.addEventListener('click', () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;

        // 仅私聊支持新风格设置
        if (currentChatType === 'private') {
            // 智能迁移
            const migrationMsg = migrateJournalSettings(chat);
            if (migrationMsg) {
                showToast(migrationMsg);
            }

            // 设置 Radio 状态
            const currentMode = chat.journalStyleSettings.mode || 'default';
            const radio = document.querySelector(`input[name="journal-style-mode"][value="${currentMode}"]`);
            if (radio) radio.checked = true;

            // 显示/隐藏自定义列表
            customStyleContainer.style.display = (currentMode === 'custom') ? 'flex' : 'none';

            // 渲染世界书列表 (总是渲染，以便切换时可用)
            renderCategorizedWorldBookList(journalStyleWorldBookList, db.worldBooks, chat.journalStyleSettings.customWorldBookIds || [], 'journal-style-wb-select');
            
            journalStyleModal.classList.add('visible');
        } else {
            showToast('群聊暂不支持自定义风格设置');
        }
    });

    // Radio 切换事件
    journalStyleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            customStyleContainer.style.display = (e.target.value === 'custom') ? 'flex' : 'none';
        });
    });

    // 保存按钮点击事件
    saveJournalStyleBtn.addEventListener('click', async () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : null;
        if (!chat) return;

        const selectedMode = document.querySelector('input[name="journal-style-mode"]:checked').value;
        const selectedIds = Array.from(journalStyleWorldBookList.querySelectorAll('.item-checkbox:checked')).map(input => input.value);

        chat.journalStyleSettings = {
            mode: selectedMode,
            customWorldBookIds: selectedIds
        };
        
        // 同步更新旧字段以保持潜在的向后兼容性
        chat.journalWorldBookIds = selectedIds;

        await saveData();
        journalStyleModal.classList.remove('visible');
        showToast('日记风格设置已保存');
    });

    /* ---- Our Diaries 角色页：写日记 + 日记设置 ---- */
    const odPenBtn = document.getElementById('od-pen-journal-btn');
    const odSettingsBtn = document.getElementById('od-journal-settings-btn');
    const odAutoModal = document.getElementById('od-auto-journal-modal');
    const odAutoSwitch = document.getElementById('od-auto-switch');
    const odAutoFreqArea = document.getElementById('od-auto-freq-area');
    const odDaysGrid = document.getElementById('od-days-grid');
    const odAutoCloseBtn = document.getElementById('od-auto-close-btn');

    // 日期格子 1~31 只建一次
    if (odDaysGrid && !odDaysGrid.childElementCount) {
        for (let d = 1; d <= 31; d++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'od-day-chip';
            b.textContent = d;
            b.dataset.day = d;
            odDaysGrid.appendChild(b);
        }
    }

    let odAutoCharId = null;
    function odAutoGet() {
        const c = db.characters.find(x => x.id === odAutoCharId);
        if (!c) return null;
        if (!c.autoJournal) c.autoJournal = { enabled: false, mode: 'daily', days: [] };
        return c.autoJournal;
    }
    function odAutoRender() {
        const s = odAutoGet();
        if (!s) return;
        odAutoSwitch.checked = !!s.enabled;
        odAutoFreqArea.style.display = s.enabled ? 'block' : 'none';
        document.querySelectorAll('.od-freq-pill').forEach(p => p.classList.toggle('on', p.dataset.mode === s.mode));
        odDaysGrid.style.display = s.mode === 'custom' ? 'grid' : 'none';
        odDaysGrid.querySelectorAll('.od-day-chip').forEach(ch => ch.classList.toggle('on', (s.days || []).includes(+ch.dataset.day)));
    }

    // 笔图标：让角色写一篇日记（自动取最近最多 60 条消息作为素材）
    odPenBtn.addEventListener('click', async () => {
        if (currentChatType !== 'private' || isGenerating) return;
        const chat = db.characters.find(c => c.id === currentChatId);
        if (!chat) return;
        const total = (chat.history || []).length;
        if (total < 2) { showToast('还没有足够的聊天记录，先和 TA 聊聊天吧'); return; }
        const end = total;
        const start = Math.max(1, end - 59);
        await generateJournal(start, end, true);
    });

    // 设置图标：打开日记设置弹窗
    odSettingsBtn.addEventListener('click', () => {
        if (currentChatType !== 'private') return;
        const chat = db.characters.find(c => c.id === currentChatId);
        if (!chat) return;
        odAutoCharId = chat.id;
        odAutoRender();
        odAutoModal.classList.add('visible');
    });
    odAutoCloseBtn.addEventListener('click', () => odAutoModal.classList.remove('visible'));
    odAutoModal.addEventListener('click', (e) => {
        if (e.target === odAutoModal) odAutoModal.classList.remove('visible');
    });

    odAutoSwitch.addEventListener('change', async () => {
        const s = odAutoGet();
        if (!s) return;
        s.enabled = odAutoSwitch.checked;
        await saveData();
        odAutoRender();
    });
    document.querySelectorAll('.od-freq-pill').forEach(p => p.addEventListener('click', async () => {
        const s = odAutoGet();
        if (!s) return;
        s.mode = p.dataset.mode;
        if (s.mode === 'custom' && !(s.days || []).length) s.days = [1];
        await saveData();
        odAutoRender();
    }));
    odDaysGrid.addEventListener('click', async (e) => {
        const chip = e.target.closest('.od-day-chip');
        if (!chip) return;
        const s = odAutoGet();
        if (!s) return;
        s.days = s.days || [];
        const d = +chip.dataset.day;
        const i = s.days.indexOf(d);
        if (i >= 0) {
            if (s.days.length > 1) s.days.splice(i, 1);   // 至少保留一天
        } else {
            s.days.push(d);
        }
        s.days.sort((a, b) => a - b);
        await saveData();
        odAutoRender();
    });

    generateNewJournalBtn.addEventListener('click', () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const totalMessages = chat ? chat.history.length : 0;
        
        const rangeInfo = document.getElementById('journal-range-info');
        rangeInfo.textContent = `当前聊天总消息数: ${totalMessages}`;

        const modalTitle = document.querySelector('#generate-journal-modal h3');
        if (modalTitle) {
            modalTitle.textContent = (currentChatType === 'group') ? '生成群聊总结' : '指定总结范围';
        }

        generateJournalForm.reset();
        generateJournalModal.classList.add('visible');
    });

    generateJournalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const startInput = document.getElementById('journal-range-start');
        const endInput = document.getElementById('journal-range-end');
        const includeFavoritedCheckbox = document.getElementById('journal-include-favorited');

        const start = parseInt(startInput.value);
        const end = parseInt(endInput.value);
        const includeFavorited = includeFavoritedCheckbox.checked;
        
        if (isNaN(start) || isNaN(end) || start <= 0 || end < start) {
            showToast('请输入有效的起止范围');
            return;
        }

        generateJournalModal.classList.remove('visible');
        await generateJournal(start, end, includeFavorited);
    });

    journalListContainer.addEventListener('click', async (e) => {
        const target = e.target;

        // Our Diaries 书架交互
        const backBtn = target.closest('.od-month-back');
        if (backBtn) {
            odCurrentMonth = null;
            if (odFromDiaryApp) {
                // 从日记 App 书架进入：返回日记 App 的书架页
                odFromDiaryApp = false;
                if (typeof switchScreen === 'function') switchScreen('diary-screen');
                if (window.DiaryApp && typeof window.DiaryApp.render === 'function') window.DiaryApp.render();
            } else {
                renderJournalList();
            }
            return;
        }
        // 长按换封面松手后，吞掉紧跟着的 click（避免误进书）
        if (odSuppressBookClick) { odSuppressBookClick = false; return; }
        const book = target.closest('.od-book');
        if (book) {
            odCurrentMonth = book.dataset.ym;
            renderJournalList();
            return;
        }

        // 月份视图日记卡片点击已直接绑在卡片元素上（buildOdEntryCard），这里不再委托

        const card = target.closest('.journal-card');
        if (!card) return;

        const journalId = card.dataset.id;
        
        // 多选模式逻辑
        if (isMultiSelectMode) {
            if (selectedJournalIds.has(journalId)) {
                selectedJournalIds.delete(journalId);
                card.querySelector('.journal-checkbox').classList.remove('checked');
            } else {
                selectedJournalIds.add(journalId);
                card.querySelector('.journal-checkbox').classList.add('checked');
            }
            updateSelectCount();
            return; // 阻止进入详情页
        }

        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const journal = chat.memoryJournals.find(j => j.id === journalId);
        if (!journal) return;

        if (target.closest('.delete-journal-btn')) {
            if (confirm('确定要删除这篇日记吗？')) {
                chat.memoryJournals = chat.memoryJournals.filter(j => j.id !== journalId);
                await saveData();
                renderJournalList();
                showToast('日记已删除');
            }
            return;
        }

        if (target.closest('.favorite-journal-btn')) {
            journal.isFavorited = !journal.isFavorited;
            await saveData();
            target.closest('.favorite-journal-btn').classList.toggle('favorited', journal.isFavorited);
            showToast(journal.isFavorited ? '已收藏' : '已取消收藏');
            return;
        }
        
        const date = new Date(journal.createdAt);
        const formattedDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        
        currentJournalDetailId = journal.id;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');

        titleEl.isContentEditable = false;
        contentEl.isContentEditable = false;
        titleEl.style.border = 'none';
        contentEl.style.border = 'none';
        titleEl.style.padding = '0';
        contentEl.style.padding = '0';
        editDetailBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>`;

        titleEl.textContent = journal.title;
        document.getElementById('journal-detail-meta').textContent = journal.manual
            ? `创建于 ${formattedDate}`
            : `创建于 ${formattedDate} | 消息范围: ${journal.range.start}-${journal.range.end}`;
        document.getElementById('journal-detail-content').textContent = journal.content;
        
        switchScreen('memory-journal-detail-screen');
    });

    // 长按书籍换封面：按住 ~0.5s 后松手即切换下一个封面颜色
    let odPressTimer = null;
    let odPressLong = false;
    journalListContainer.addEventListener('pointerdown', (e) => {
        const book = e.target.closest('.od-book');
        if (!book) return;
        odPressLong = false;
        book.classList.add('od-pressing');
        const x0 = e.clientX, y0 = e.clientY;
        const cancelPress = () => {
            if (odPressTimer) { clearTimeout(odPressTimer); odPressTimer = null; }
            book.classList.remove('od-pressing');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancelPress);
        };
        const move = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12) cancelPress(); };
        const up = async (ev) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancelPress);
            if (odPressTimer) { clearTimeout(odPressTimer); odPressTimer = null; }
            book.classList.remove('od-pressing');
            if (odPressLong && ev.target.closest('.od-book') === book) {
                odSuppressBookClick = true;
                setTimeout(() => { odSuppressBookClick = false; }, 400); // 兜底自动复位
                const chat = db.characters.find(c => c.id === currentChatId);
                if (chat) {
                    await odCycleCover(chat, book.dataset.ym);
                    renderJournalList();
                }
            }
            odPressLong = false;
        };
        odPressTimer = setTimeout(() => { odPressLong = true; }, 480);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancelPress);
    });

    editDetailBtn.addEventListener('click', async () => {
        if (!currentJournalDetailId) return;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');
        const isEditing = titleEl.isContentEditable;

        if (isEditing) {
            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            if (!chat) return;
            const journal = chat.memoryJournals.find(j => j.id === currentJournalDetailId);
            if (!journal) return;

            journal.title = titleEl.textContent.trim();
            journal.content = contentEl.textContent.trim();
            await saveData();

            titleEl.isContentEditable = false;
            contentEl.isContentEditable = false;
            titleEl.style.border = 'none';
            contentEl.style.border = 'none';
            titleEl.style.padding = '0';
            contentEl.style.padding = '0';
            editDetailBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>`;
            showToast('日记已保存');
            renderJournalList(); 
        } else {
            titleEl.setAttribute('contenteditable', 'true');
            contentEl.setAttribute('contenteditable', 'true');
            titleEl.style.border = '1px dashed #ccc';
            titleEl.style.padding = '5px';
            contentEl.style.border = '1px dashed #ccc';
            contentEl.style.padding = '10px';
            editDetailBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" /></svg>`; 
            titleEl.focus();
        }
    });
}

// 信封色调池（纸/蜡/墨成套，按日记 id 稳定取色）
const JOURNAL_TONES = [
    { paper: '#f3e6d0', wax: '#8f3545', ink: '#6b4a36' },
    { paper: '#fdf6ec', wax: '#c98a2d', ink: '#8a6a54' },
    { paper: '#e8f0e3', wax: '#426b54', ink: '#3f4a38' },
    { paper: '#fdeef0', wax: '#b5533c', ink: '#5c3a4d' },
    { paper: '#eae4f2', wax: '#7a5c9e', ink: '#5c3a4d' },
    { paper: '#e4eef2', wax: '#3f5b8f', ink: '#33475b' },
];
function journalTone(id) {
    let h = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return JOURNAL_TONES[h % JOURNAL_TONES.length];
}
function shadeColor(hex, pct) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = c => Math.max(0, Math.min(255, Math.round(pct >= 0 ? c + (255 - c) * pct : c * (1 + pct))));
    return '#' + ((1 << 24) + (ch((n >> 16) & 255) << 16) + (ch((n >> 8) & 255) << 8) + ch(n & 255)).toString(16).slice(1);
}
const JOURNAL_WAX_ICON = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.5-9C.8 8.6 2.7 5 6.2 5c2.1 0 3.4 1.1 4.3 2.4l1.5 2 1.5-2C14.4 6.1 15.7 5 17.8 5c3.5 0 5.4 3.6 3.7 7-2.3 4.4-9.5 9-9.5 9z"/></svg>';

function renderJournalList() {
    const container = document.getElementById('journal-list-container');
    const placeholder = document.getElementById('no-journals-placeholder');
    container.innerHTML = '';

    // 换了角色/群聊时重置月份视图
    if (odLastChatId !== currentChatId) {
        odLastChatId = currentChatId;
        odCurrentMonth = null;
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const journals = chat ? chat.memoryJournals : [];

    // 更新标题和按钮显示
    const bindBtn = document.getElementById('bind-journal-worldbook-btn');
    const title = document.querySelector('#memory-journal-screen .title');

    if (currentChatType === 'group') {
        const screenEl0 = document.getElementById('memory-journal-screen');
        if (screenEl0) screenEl0.classList.toggle('od-mode', false);
        const actionGroup0 = document.querySelector('#memory-journal-screen .action-btn-group');
        if (actionGroup0) actionGroup0.style.display = ''; // 群聊智能总结保留右上角按钮
        if (bindBtn) bindBtn.style.display = 'none';
        if (title) { title.style.display = ''; title.textContent = '智能总结'; }
        if (placeholder) {
            placeholder.innerHTML = '<p>还没有总结哦~</p><p>点击右上角的“+号”来生成第一篇吧！</p>';
        }
        renderJournalCards(container, journals, placeholder, false);
        return;
    }

    // 私聊：Our Diaries 书架（隐藏顶栏标题，换浅蓝灰底；右上角按钮整组隐藏——
    // 切换角色/管理/绑定世界书/手写日记/生成日记在日记 App 流程里都用不上）
    const screenEl = document.getElementById('memory-journal-screen');
    if (screenEl) screenEl.classList.toggle('od-mode', true);
    const actionGroup = document.querySelector('#memory-journal-screen .action-btn-group');
    if (actionGroup) actionGroup.style.display = 'none';
    if (title) title.style.display = 'none';
    // 从聊天功能栏进来：右上角显示「写日记 + 日记设置」；从日记 App 进来：不显示
    const odActions = document.getElementById('od-char-actions');
    if (odActions) odActions.style.display = odFromDiaryApp ? 'none' : 'flex';
    if (placeholder) {
        placeholder.innerHTML = '<p>还没有日记哦~</p><p>点击右上角的“+号”来创建第一篇吧！</p>';
    }

    if ((!journals || journals.length === 0)) {
        if (placeholder) placeholder.style.display = 'block';
        return;
    }
    if (placeholder) placeholder.style.display = 'none';

    if (!odCurrentMonth) {
        renderDiaryBookshelf(container, chat, journals);
    } else {
        renderDiaryMonthView(container, journals);
    }
}

/* ---------- Our Diaries 书架 ---------- */
const OD_MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const OD_MONTH_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// 封面配色（换封面循环）：封面底色 / 格线亮 / 格线暗 / 书脊 / 搭扣 / 丝带
const OD_PALETTES = [
    { cover: '#a3a084', lineL: 'rgba(255,255,255,.34)', lineD: 'rgba(63,58,40,.30)', spine: '#4c443a', strap: '#5f564a', ribbon: '#c9a86a' },
    { cover: '#b09aa6', lineL: 'rgba(255,255,255,.36)', lineD: 'rgba(74,52,68,.28)', spine: '#514049', strap: '#66526499', ribbon: '#8d5f77' },
    { cover: '#8ea6c8', lineL: 'rgba(255,255,255,.38)', lineD: 'rgba(38,56,88,.30)', spine: '#3c4a63', strap: '#4d5c76', ribbon: '#e8c9a0' },
    { cover: '#d9b95c', lineL: 'rgba(255,255,255,.42)', lineD: 'rgba(110,84,26,.28)', spine: '#6b5522', strap: '#7d6530', ribbon: '#a0522d' },
    { cover: '#cf9a94', lineL: 'rgba(255,255,255,.38)', lineD: 'rgba(104,48,44,.28)', spine: '#5f3a36', strap: '#744a45', ribbon: '#b0c4a8' },
    { cover: '#8ab0a3', lineL: 'rgba(255,255,255,.36)', lineD: 'rgba(34,74,62,.28)', spine: '#35544a', strap: '#44665b', ribbon: '#d9a0b0' }
];

function odCoverIdx(chat, ym) {
    if (!chat.diaryCovers) chat.diaryCovers = {};
    const idx = parseInt(chat.diaryCovers[ym], 10);
    return isNaN(idx) ? 0 : idx % OD_PALETTES.length;
}

function odBookHTML(ym, paletteIdx) {
    const [y, m] = ym.split('-').map(n => parseInt(n, 10));
    const p = OD_PALETTES[paletteIdx % OD_PALETTES.length];
    return `
        <div class="od-book" data-ym="${ym}" style="--od-c:${p.cover}; --od-l:${p.lineL}; --od-d:${p.lineD}; --od-spine:${p.spine}; --od-strap:${p.strap}; --od-ribbon:${p.ribbon};">
            <div class="od-book-cover">
                <div class="od-book-label">
                    <div class="od-bk-en">${OD_MONTH_EN[m - 1]}</div>
                    <div class="od-bk-cn">${OD_MONTH_CN[m - 1]}</div>
                    <div class="od-bk-yr">– ${y} –</div>
                </div>
                <div class="od-book-strap"><span class="od-book-btndot"></span></div>
            </div>
            <div class="od-book-pages"></div>
            <div class="od-book-ribbon"></div>
        </div>`;
}

function renderDiaryBookshelf(container, chat, journals) {
    // 按年-月分组
    const byMonth = {};
    journals.forEach(j => {
        const d = new Date(j.createdAt);
        if (isNaN(d.getTime())) return;
        const ym = `${d.getFullYear()}-${d.getMonth() + 1}`;
        (byMonth[ym] = byMonth[ym] || []).push(j);
    });

    const ymKeys = Object.keys(byMonth).sort((a, b) => {
        const [ay, am] = a.split('-').map(Number), [by2, bm] = b.split('-').map(Number);
        return (by2 - ay) || (bm - am); // 年月均倒序
    });
    if (!ymKeys.length) return;

    const years = {};
    ymKeys.forEach(ym => { const y = ym.split('-')[0]; (years[y] = years[y] || []).push(ym); });

    const page = document.createElement('div');
    page.className = 'od-page';
    let html = `
        <div class="od-head">
            <h1 class="od-title">Our Diaries</h1>
            <p class="od-sub">把日子，一本一本留下来</p>
        </div>`;

    Object.keys(years).sort((a, b) => b - a).forEach(y => {
        html += `
        <div class="od-tl">
            <div class="od-year">${y}</div>
            <div class="od-months">`;
        years[y].forEach(ym => {
            const items = byMonth[ym];
            const m = parseInt(ym.split('-')[1], 10);
            const latest = items.reduce((acc, j) => j.createdAt > acc ? j.createdAt : acc, 0);
            const ld = new Date(latest);
            const pIdx = odCoverIdx(chat, ym);
            html += `
            <div class="od-month-row">
                <div class="od-month-label">${OD_MONTH_EN[m - 1]}</div>
                <div class="od-book-col">${odBookHTML(ym, pIdx)}</div>
                <div class="od-info">
                    <div class="od-info-count">${items.length} 篇日记</div>
                    <div class="od-info-read">读到 · ${ld.getMonth() + 1} 月 ${ld.getDate()} 日</div>
                </div>
            </div>`;
        });
        html += `</div></div>`;
    });

    page.innerHTML = html;
    container.appendChild(page);
}

/* 平铺卡片列表（群聊「智能总结」/ 多选模式共用） */
function renderJournalCards(container, journals, placeholder) {
    let isShowingLoading = false;
    // 恢复生成状态卡片
    if (typeof isGenerating !== 'undefined' && isGenerating && generatingChatId === currentChatId) {
        const loadingCard = document.createElement('li');
        loadingCard.className = 'journal-card generating';
        loadingCard.id = 'journal-generating-card';
        loadingCard.innerHTML = `
            <div class="spinner"></div>
            <div class="text">正在${currentChatType === 'group' ? '总结群聊' : '编织回忆'}...</div>
        `;
        container.appendChild(loadingCard);
        isShowingLoading = true;
    }

    if ((!journals || journals.length === 0) && !isShowingLoading) {
        if (placeholder) placeholder.style.display = 'block';
        return;
    }
    if (placeholder) placeholder.style.display = 'none';

    const sortedJournals = [...journals].sort((a, b) => a.createdAt - b.createdAt);
    sortedJournals.forEach(j => container.appendChild(buildJournalCard(j)));
}

function renderDiaryMonthView(container, journals) {
    // 全部日记（多选管理模式）沿用旧卡片列表，勾选框才有卡片可挂
    if (odCurrentMonth === 'ALL') {
        const barOld = document.createElement('div');
        barOld.className = 'od-month-view';
        barOld.innerHTML = `
            <div class="od-month-caption">全部日记</div>`;
        const listOld = document.createElement('ul');
        listOld.className = 'list-container';
        listOld.style.cssText = 'padding:0;margin:0;background:none;';
        [...journals].sort((a, b) => a.createdAt - b.createdAt).forEach(j => listOld.appendChild(buildJournalCard(j)));
        barOld.appendChild(listOld);
        container.appendChild(barOld);
        return;
    }

    const [y, m] = odCurrentMonth.split('-').map(Number);
    const items = journals.filter(j => {
        const d = new Date(j.createdAt);
        return d.getFullYear() === y && d.getMonth() + 1 === m;
    }).sort((a, b) => a.createdAt - b.createdAt); // 旧 → 新，时间流自上而下

    const bar = document.createElement('div');
    bar.className = 'od-month-view';
    // 左上角已有返回箭头，不再放「返回书架」按钮
    bar.innerHTML = `
        <div class="od-month-caption">${OD_MONTH_EN[m - 1]} · ${OD_MONTH_CN[m - 1]} · ${y}</div>`;

    const tl = document.createElement('div');
    tl.className = 'od-timeline';
    items.forEach(j => {
        const d = new Date(j.createdAt);
        const styleIdx = odEntryStyle(j.id);
        const row = document.createElement('div');
        row.className = 'od-entry-row';
        row.innerHTML = `
            <div class="od-entry-date">
                <div class="ode-day">${pad(d.getDate())}</div>
                <div class="ode-mon">${OD_MONTH_EN[m - 1].slice(0, 3)}</div>
            </div>`;
        row.appendChild(buildOdEntryCard(j, styleIdx, false));
        tl.appendChild(row);
    });

    bar.appendChild(tl);
    container.appendChild(bar);
}

/* ---------- 三种 uiverse 卡片样式（按日记 id 稳定随机） ---------- */
function odEntryStyle(id) {
    let h = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h % 3; // 0=横线信纸 1=灰底硬影 2=白卡三彩点
}

function buildOdEntryCard(journal, styleIdx, full) {
    const card = document.createElement('li');
    const cls = ['odc-note', 'odc-gray', 'odc-dots'][styleIdx % 3];
    card.className = 'od-entry-card ' + cls + (full ? ' od-full' : '');
    card.dataset.id = journal.id;
    card.dataset.style = styleIdx % 3;

    const d = new Date(journal.createdAt);
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fav = journal.isFavorited ? '<span class="odc-fav-chip">★ 收藏</span>' : '';
    const preview = full ? String(journal.content || '')
        : String(journal.content || '').slice(0, 120);

    card.innerHTML = `
        <div class="odc-toprow">
            <span class="odc-date-chip">${dateStr}</span>
            ${fav}
        </div>
        <div class="odc-title"></div>
        <div class="odc-body"></div>`;
    // 防注入：文本用 textContent 填
    card.querySelector('.odc-title').textContent = journal.title || '无标题';
    card.querySelector('.odc-body').textContent = preview;

    // 点击直接绑在卡片元素上（iOS WKWebView 对纯 li/div 的事件委托不可靠）
    if (!full) {
        card.setAttribute('role', 'button');
        card.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const chat2 = (currentChatType === 'private')
                ? db.characters.find(c => c.id === currentChatId)
                : db.groups.find(g => g.id === currentChatId);
            const journal2 = chat2 ? (chat2.memoryJournals || []).find(j => j.id === card.dataset.id) : null;
            if (journal2) {
                odOpenEntryModal(journal2, styleIdx % 3, card);
            }
        });
    }
    return card;
}

/* ---------- 放大查看弹层：卡片飞到屏幕中间 + 背景虚化 ---------- */
let odModalOpenedAt = 0; // 防抖：同一张卡 600ms 内只开一次
function odOpenEntryModal(journal, styleIdx, fromCard) {
    if (Date.now() - odModalOpenedAt < 600) return;
    if (document.querySelector('.od-entry-overlay')) return; // 已有弹层
    odModalOpenedAt = Date.now();

    const overlay = document.createElement('div');
    overlay.className = 'od-entry-overlay';

    const zoomCard = buildOdEntryCard(journal, styleIdx, true);
    zoomCard.classList.add('od-entry-zoom');
    zoomCard.classList.remove('od-entry-card');
    // 保留类名供样式命中（odc-*），od-entry-card 已被移除避免 :active 缩放

    // 右上角编辑图标：删除这篇日记（简约 SVG，非 emoji）
    const odEditBtn = document.createElement('button');
    odEditBtn.type = 'button';
    odEditBtn.className = 'od-entry-edit';
    odEditBtn.setAttribute('aria-label', '删除这篇日记');
    odEditBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    odEditBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const chat2 = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat2) return;
        if (!confirm('删除这篇日记？删除后无法恢复。')) return;
        chat2.memoryJournals = (chat2.memoryJournals || []).filter(j => j.id !== journal.id);
        await saveData();
        closed = true;              // 防止 close() 重复执行
        overlay.classList.remove('open');
        overlay.remove();
        zoomCard.remove();
        renderJournalList();
        showToast('日记已删除');
    });
    zoomCard.appendChild(odEditBtn);

    document.body.appendChild(overlay);
    document.body.appendChild(zoomCard);

    const r = fromCard ? fromCard.getBoundingClientRect() : null;
    if (fromCard) fromCard.style.visibility = 'hidden';

    const startRect = r || (() => {
        const w = Math.min(300, window.innerWidth - 56);
        return { left: (window.innerWidth - w) / 2, top: window.innerHeight / 2 - 100, width: w, height: 180 };
    })();

    zoomCard.style.left = startRect.left + 'px';
    zoomCard.style.top = startRect.top + 'px';
    zoomCard.style.width = startRect.width + 'px';
    if (startRect.height) zoomCard.style.height = startRect.height + 'px';

    // 目标：屏幕居中的竖长方形（高约为宽的 1.5 倍，且不超屏高的 74%）
    const targetW = Math.min(300, window.innerWidth - 56);
    const targetH = Math.min(Math.round(window.innerHeight * 0.74), Math.round(targetW * 1.55));
    const tx = (window.innerWidth - targetW) / 2;
    const ty = (window.innerHeight - targetH) / 2;

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove('open');
        // 飞回原位
        zoomCard.style.left = startRect.left + 'px';
        zoomCard.style.top = startRect.top + 'px';
        zoomCard.style.width = startRect.width + 'px';
        zoomCard.style.height = startRect.height + 'px';
        zoomCard.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            zoomCard.remove();
            if (fromCard) fromCard.style.visibility = '';
        }, 420);
    };

    overlay.addEventListener('click', close);
    // iOS Safari 兜底：touchstart 在遮罩上也关闭
    overlay.addEventListener('touchstart', (ev) => {
        if (ev.target === overlay) { ev.preventDefault(); close(); }
    }, { passive: false });

    requestAnimationFrame(() => {
        overlay.classList.add('open');
        zoomCard.style.width = targetW + 'px';
        zoomCard.style.height = targetH + 'px';
        zoomCard.style.left = tx + 'px';
        zoomCard.style.top = ty + 'px';
    });
}

// 点顶栏返回箭头离开回忆日记页时，重置 Our Diaries 视图状态，
// 保证下次进入（尤其从聊天功能集进来）先看到书架而不是上次的月份视图
document.addEventListener('click', (e) => {
    const backBtn = e.target.closest('#memory-journal-screen .back-btn');
    if (backBtn) {
        odCurrentMonth = null;
        odFromDiaryApp = false;
    }
});

// Our Diaries 视图状态：null=书架，'YYYY-M'=某月，'ALL'=全部
let odCurrentMonth = null;
let odLastChatId = null;
let odFromDiaryApp = false; // 从日记 App 书架点书进入时为 true，「返回书架」回 diary-screen
let odSuppressBookClick = false; // 长按换封面松手后，吞掉紧跟着的 click

/* 长按换封面：切换到下一个配色并保存 */
async function odCycleCover(chat, ym) {
    if (!chat || !ym) return;
    chat.diaryCovers = chat.diaryCovers || {};
    chat.diaryCovers[ym] = (odCoverIdx(chat, ym) + 1) % OD_PALETTES.length;
    await saveData();
    if (typeof showToast === 'function') showToast('已换封面');
}

function buildJournalCard(journal) {
    const card = document.createElement('li');
    card.className = 'journal-card';
    card.dataset.id = journal.id;

    const date = new Date(journal.createdAt);
    const formattedDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    card.innerHTML = `
        <div class="journal-checkbox"></div>
        <div class="journal-card-header">
            <div class="journal-card-title">${journal.title}</div>
        </div>
        <div class="journal-card-actions">
            <button class="action-icon-btn favorite-journal-btn" title="收藏">
                <svg viewBox="0 0 24 24">
                    <path class="star-outline" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z" fill="currentColor"/>
                    <path class="star-solid" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                </svg>
            </button>
            <button class="action-icon-btn delete-journal-btn" title="删除">
                <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
            </button>
        </div>
        <div class="journal-card-footer" style="justify-content: space-between; height: auto; opacity: 1; margin-top: 10px;">
            <span class="journal-card-date">${formattedDate}</span>
            <span class="journal-card-range">范围: ${journal.range.start}-${journal.range.end}</span>
        </div>
    `;

    if (journal.isFavorited) {
        card.querySelector('.favorite-journal-btn').classList.add('favorited');
    }

    const tone = journalTone(journal.id);
    card.style.setProperty('--j-paper', tone.paper);
    card.style.setProperty('--j-paper-dark', shadeColor(tone.paper, -0.08));
    card.style.setProperty('--j-wax', tone.wax);
    card.style.setProperty('--j-ink', tone.ink);
    card.insertAdjacentHTML('beforeend',
        '<div class="journal-paper-tex"></div>'
        + '<div class="journal-wax">' + JOURNAL_WAX_ICON + '</div>');
    return card;
}

// Our Diaries 视图状态（odCurrentMonth / odLastChatId / odFromDiaryApp / odSuppressBookClick）
// 已在 renderDiaryMonthView 上方声明

async function generateJournal(start, end, includeFavorited = false) {
    showToast('正在生成日记，请稍候...');
    
    // 显示列表占位卡片
    const container = document.getElementById('journal-list-container');
    const placeholder = document.getElementById('no-journals-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const loadingCard = document.createElement('li');
    loadingCard.className = 'journal-card generating';
    loadingCard.id = 'journal-generating-card';
    loadingCard.innerHTML = `
        <div class="spinner"></div>
        <div class="text">正在${currentChatType === 'group' ? '总结群聊' : '编织回忆'}...</div>
    `;
    
    if (container.firstChild) {
        container.insertBefore(loadingCard, container.firstChild);
    } else {
        container.appendChild(loadingCard);
    }
    container.scrollTop = 0;

    isGenerating = true; 
    generatingChatId = currentChatId;

    try {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) {
            throw new Error("未找到当前聊天。");
        }

        const startIndex = start - 1;
        const endIndex = end;
        
        if (startIndex < 0 || endIndex > chat.history.length || startIndex >= endIndex) {
            throw new Error("无效的消息范围。");
        }

        // ...
        let messagesToSummarize = chat.history.slice(startIndex, endIndex);
        
        // 1. 保持原样：第三个参数设为 true，确保你想要的“高权重”隐藏消息能被读进来
        messagesToSummarize = filterHistoryForAI(chat, messagesToSummarize, true);

        // 2. 【新增】精准剔除 thinking 消息
        // 你的 chat_ai.js 中生成的思考消息带有 isThinking: true 属性
        // 即使它们包含在上下文里，我们也在生成日记前把它们扔掉
        messagesToSummarize = messagesToSummarize.filter(m => !m.isThinking);

        // 3. 【可选保险】防止只有标签没有属性的情况（针对旧历史记录）
        // 如果你担心以前的历史记录里有 thinking 标签但没有 isThinking 属性，可以加一步正则清洗
        messagesToSummarize.forEach(m => {
            if (m.content && typeof m.content === 'string') {
               m.content = m.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<think>[\s\S]*?<\/think>/gi, '');
            }
        });

        let worldBooksContent = '';
        let summaryPrompt = '';
        let favoritedJournalsPrompt = '';

        // 新增：读取已收藏的日记 (通用逻辑)
        if (includeFavorited) {
            const favoritedJournals = (chat.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `标题：${j.title}\n内容：${j.content}`)
                .join('\n\n---\n\n');
            
            if (favoritedJournals) {
                favoritedJournalsPrompt = `【过往回顾】\n这是你之前已经写下的内容，请参考它们，以确保新内容的连续性，并避免重复记录已经记录过的事件。\n\n${favoritedJournals}\n\n`;
            }
        }

        if (currentChatType === 'group') {
            // 群聊逻辑
            const worldBooksLimitBreak = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'limit_break')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksBefore = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksAfter = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && (wb.position === 'after' || !wb.position))).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksGuidelines = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'guidelines')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            
            worldBooksContent = [
                ...worldBooksLimitBreak.map(wb => wb.content),
                ...worldBooksBefore.map(wb => wb.content),
                ...worldBooksAfter.map(wb => wb.content),
                ...worldBooksGuidelines.map(wb => wb.content)
            ].join('\n\n');

            summaryPrompt = `你是一个群聊记录总结助手。请以完全客观的第三视角，对以下群聊记录进行精简总结。\n\n`;
            
            if (favoritedJournalsPrompt) {
                summaryPrompt += favoritedJournalsPrompt;
            }

            // 注入群聊基础信息
            summaryPrompt += `群聊名称: ${chat.name}\n`;
            summaryPrompt += `群成员列表: ${chat.members.map(m => `${m.groupNickname}(${m.realName})`).join(', ')}\n\n`;

            // 注入群聊关联的世界书
            if (worldBooksContent) {
                summaryPrompt += `背景设定参考:\n${worldBooksContent}\n\n`;
            }

            summaryPrompt += `总结要求：\n`;
            summaryPrompt += `1. **客观中立**：使用第三人称视角，不带个人情感色彩，不使用强烈的情绪词汇。\n`;
            summaryPrompt += `2. **精简准确**：只陈述事实，概括主要话题和事件，去除无关的闲聊细节。\n`;
            summaryPrompt += `3. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n\n`;

            summaryPrompt += `你的输出必须使用XML标签包裹，包含以下两个部分：\n`;
            summaryPrompt += `<title>格式为“日期·核心事件”，例如“1月20日·讨论周末计划”</title>\n`;
            summaryPrompt += `<content>总结正文。分条列出主要讨论点或事件。</content>\n\n`;

            summaryPrompt += `请严格按照上述XML标签格式输出，不要输出任何其他多余的文字。\n\n`;
            summaryPrompt += `聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;

        } else {
            // 私聊逻辑
            // 0. 确保迁移
            migrateJournalSettings(chat);

            // 1. 自动获取通用世界书 (Context)
            const worldBooksLimitBreak = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'limit_break')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksBefore = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksAfter = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && (wb.position === 'after' || !wb.position))).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            const worldBooksGuidelines = (chat.worldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'guidelines')).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
            
            worldBooksContent = [
                ...worldBooksLimitBreak.map(wb => wb.content),
                ...worldBooksBefore.map(wb => wb.content),
                ...worldBooksAfter.map(wb => wb.content),
                ...worldBooksGuidelines.map(wb => wb.content)
            ].join('\n\n');

            // 2. 获取风格设置
            const styleSettings = chat.journalStyleSettings || { mode: 'default', customWorldBookIds: [] };
            
            // 3. 构建 Prompt
            if (styleSettings.mode === 'summary') {
                // 摘要总结风格
                summaryPrompt = `你是一个专业的对话记录总结助手。请根据提供的聊天记录，生成一份精简的摘要总结。\n\n`;
                
                if (favoritedJournalsPrompt) {
                    summaryPrompt += favoritedJournalsPrompt;
                }

                summaryPrompt += `要求：
1. **体现时间进程**：正文内容必须按时间顺序组织，并明确指出时间点。**格式规范：**请严格按照“x年x月x日，发生了[事件]”的格式进行叙述，确保时间线清晰。
2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。
3. **抓取重点**：识别对话中的核心事件、重要话题转折、关键决策或信息。忽略无关的闲聊和琐碎细节。
4. **关键原话摘录（重要）**：
    - 仅当出现具有**极高情感价值**（如表白、郑重承诺、极具感染力的情感宣泄）或**重大剧情价值**（如揭示核心秘密、决定性瞬间）的对话时，请**直接引用角色的原话**。
    - **引用格式**：使用引号包裹原话，例如：${chat.realName}说：“我永远不会离开你。”
    - **严格控制数量**：只摘录最闪光、最不可替代的那几句。如果聊天记录平淡无奇或全是日常琐事，**请不要摘录任何原话**，以免破坏摘要的精简性。
5. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。

你的输出必须使用XML标签包裹，包含以下两个部分：
<title>格式为“日期范围·核心事件”，例如“1月20日-1月22日·关于旅行计划的讨论”</title>
<content>总结正文</content>

请严格按照上述XML标签格式输出，不要输出任何其他多余的文字。

聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;

            } else {
                // 默认风格 (流水账) 或 自定义风格
                // 基础 Prompt (第一人称)
                summaryPrompt = `你是一个日记整理助手。请以角色 "${chat.remarkName || chat.name}" 的第一人称视角，总结以下聊天记录。请专注于重要的情绪、事件和细节。\n\n`;
                
                if (favoritedJournalsPrompt) {
                    summaryPrompt += favoritedJournalsPrompt;
                }

                summaryPrompt += "为了更好地理解角色和背景，请参考以下信息：\n";
                summaryPrompt += "=====\n";

                if (worldBooksContent) {
                    summaryPrompt += `世界观设定:\n${worldBooksContent}\n\n`;
                }

                summaryPrompt += `你的角色设定:\n- 角色名: ${chat.realName}\n- 人设: ${chat.persona || "一个友好、乐于助人的伙伴。"}\n\n`;
                summaryPrompt += `我的角色设定:\n- 我的称呼: ${chat.myName}\n- 我的人设: ${chat.myPersona || "无特定人设。"}\n\n`;
                summaryPrompt += "=====\n";

                // 如果是自定义风格，注入额外要求
                if (styleSettings.mode === 'custom') {
                    const customWorldBooks = (styleSettings.customWorldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean).sort((a, b) => (a.depth || 100) - (b.depth || 100));
                    const customStyleContent = customWorldBooks.map(wb => wb.content).join('\n\n');
                    
                    if (customStyleContent) {
                        summaryPrompt += `\n**特别日记格式/风格要求**：\n请优先严格遵循以下风格指南或格式要求来撰写日记：\n${customStyleContent}\n\n`;
                    }
                }

                summaryPrompt += `请基于以上所有背景信息，总结以下聊天记录。你的输出必须使用XML标签包裹，包含 <title>年月日·一个简洁的标题</title> 和 <content>完整的日记正文</content> 两个部分，请严格按照XML标签格式输出，不要输出任何其他多余的文字。聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;
            }
        }

        const apiConfig = resolveAuxiliaryApiConfig('journal');
        let { url, key, model } = apiConfig;
        if (!url || !key || !model) {
            throw new Error("API设置不完整。");
        }

        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }

        const { requestBody, endpoint, headers } = buildChatApiRequest(
            apiConfig,
            [{ role: 'user', content: summaryPrompt }],
            { temperature: 0.7 }
        );

        const rawContent = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);

        const titleMatch = rawContent.match(/<title>([\s\S]*?)<\/title>/i);
        const contentMatch = rawContent.match(/<content>([\s\S]*?)<\/content>/i);

        const parsedTitle = titleMatch ? titleMatch[1].trim() : "无标题日记";
        const parsedContent = contentMatch ? contentMatch[1].trim() : "内容为空。";

        const newJournal = {
            id: `journal_${Date.now()}`,
            range: { start, end },
            startMessageId: chat.history[start - 1]?.id || null,
            endMessageId: chat.history[end - 1]?.id || null,
            title: parsedTitle,
            content: parsedContent,
            createdAt: Date.now(),
            chatId: currentChatId,
            chatType: currentChatType,
            isFavorited: false 
        };

        if (!chat.memoryJournals) {
            chat.memoryJournals = [];
        }
        chat.memoryJournals.push(newJournal);
        await saveData();

        // 小厨房：AI 写日记赚买菜券（每天限 1 张，设置里可关）
        if (currentChatType === 'private' && window.MieKitchen) {
            try { window.MieKitchen.rewardDiary(currentChatId); } catch (e) { /* 忽略 */ }
        }

        renderJournalList();
        showToast('新日记已生成！');

    } catch (error) {
        // 移除生成卡片
        const card = document.getElementById('journal-generating-card');
        if(card) card.remove();
        
        // 如果列表为空，恢复显示 placeholder
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat || !chat.memoryJournals || chat.memoryJournals.length === 0) {
             const placeholder = document.getElementById('no-journals-placeholder');
             if (placeholder) placeholder.style.display = 'block';
        }

        showApiError(error);
    } finally {
        isGenerating = false; 
        generatingChatId = null;
    }
}

function migrateJournalSettings(chat) {
    if (!chat.journalStyleSettings) {
        const oldJournalIds = chat.journalWorldBookIds || [];
        const chatCommonIds = chat.worldBookIds || [];
        
        // 1. 剔除重复项 (在通用里已存在的)
        const uniqueCustomIds = oldJournalIds.filter(id => !chatCommonIds.includes(id));
        
        // 2. 决定模式
        let newMode = 'default';
        let migrationMsg = '';

        if (oldJournalIds.length > 0) {
            if (uniqueCustomIds.length === 0) {
                // 情况 A: 旧关联全是通用背景 -> 迁移到默认模式
                newMode = 'default';
                migrationMsg = '日记功能升级：已自动关联聊天室背景，您的旧设置已合并到“默认风格”。';
            } else {
                // 情况 B: 有额外的世界书 -> 迁移到自定义模式，保留额外项
                newMode = 'custom';
                migrationMsg = `日记功能升级：已自动关联聊天室背景，剩余 ${uniqueCustomIds.length} 个特殊设定已保留在“自定义风格”中。`;
            }
        } else {
            // 情况 C: 无旧关联 -> 默认
            newMode = 'default';
        }

        // 3. 应用设置
        chat.journalStyleSettings = { 
            mode: newMode, 
            customWorldBookIds: uniqueCustomIds 
        };
        
        return migrationMsg;
    }
    return null;
}

/* ================= 主动写日记（自动调度） =================
   设置存在 char.autoJournal = { enabled, mode:'daily'|'every2'|'custom', days:[1..31] }
   上次自动写作日期存 char.autoJournalLast = 'YYYY-MM-DD' */
function odTodayStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function odAutoDue(char, now) {
    const s = char.autoJournal;
    if (!s || !s.enabled) return false;
    if (!char.history || char.history.length < 2) return false;
    const today = odTodayStr(now);
    if (char.autoJournalLast === today) return false;   // 今天已经写过
    if (s.mode === 'daily') return true;
    if (s.mode === 'every2') {
        if (!char.autoJournalLast) return true;
        const last = new Date(char.autoJournalLast + 'T00:00:00');
        if (isNaN(last.getTime())) return true;
        return Math.floor((now - last) / 86400000) >= 2;
    }
    if (s.mode === 'custom') return Array.isArray(s.days) && s.days.includes(now.getDate());
    return false;
}

async function runAutoJournalCheck() {
    if (typeof db === 'undefined' || !db || !Array.isArray(db.characters)) return;
    if (isGenerating) return;
    const now = new Date();
    for (const c of db.characters) {
        if (!odAutoDue(c, now)) continue;
        if (isGenerating) break;
        const prevId = currentChatId, prevType = currentChatType, prevMonth = odCurrentMonth;
        currentChatId = c.id;
        currentChatType = 'private';
        odCurrentMonth = null;
        try {
            if (typeof showToast === 'function') showToast(`✍️ ${c.remarkName || c.name} 正在写日记…`);
            const total = c.history.length;
            await generateJournal(Math.max(1, total - 59), total, true);
            c.autoJournalLast = odTodayStr(now);
            await saveData();
        } catch (err) {
            console.warn('[OdAutoJournal] 自动写日记失败：', err);
            break;   // API 出问题时别连续轰其他角色
        } finally {
            currentChatId = prevId;
            currentChatType = prevType;
            odCurrentMonth = prevMonth;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}

function startAutoJournalScheduler() {
    setTimeout(runAutoJournalCheck, 8000);                  // 启动后检查一次
    setInterval(runAutoJournalCheck, 30 * 60 * 1000);       // 之后每 30 分钟检查
}
window.OdAutoJournal = { start: startAutoJournalScheduler, check: runAutoJournalCheck };
