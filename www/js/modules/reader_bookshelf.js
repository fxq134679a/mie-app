// --- Cove Book Forge · 书架逻辑 (js/modules/reader_bookshelf.js) ---

document.addEventListener('DOMContentLoaded', () => {
    const bookshelfGrid = document.getElementById('bookshelf-grid');
    const fileUploadInput = document.getElementById('reader-file-upload');
    const manageBtn = document.getElementById('reader-manage-btn');
    const cancelManageBtn = document.getElementById('reader-cancel-manage-btn');

    const modal = document.getElementById('cove-import-modal');
    const modalTitle = document.getElementById('cove-import-title');
    const modalProgress = document.getElementById('cove-import-progress');
    const modalStatus = document.getElementById('cove-import-status');

    let isEditMode = false;
    let isRendering = false;

    function showImportModal(title = '导入中...') {
        modalTitle.textContent = title;
        modalProgress.style.width = '0%';
        modalStatus.textContent = '准备中';
        modal.style.display = 'flex';
    }
    function updateImportProgress(percent, status) {
        modalProgress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        if (status) modalStatus.textContent = status;
    }
    function hideImportModal() { modal.style.display = 'none'; }

    // ============ 渲染书架 ============
    async function renderBookshelf() {
        if (!bookshelfGrid || isRendering) return;
        isRendering = true;
        try {
            // 清掉除了上传按钮之外的所有书
            Array.from(bookshelfGrid.querySelectorAll('.cove-book-card')).forEach(el => el.remove());

            const allBooks = await dexieDB.reader_books.orderBy('lastReadTime').reverse().toArray();
            const cacheCountMap = new Map();
            try {
                const cached = await dexieDB.cove_chapter_cache.toArray();
                cached.forEach(c => {
                    cacheCountMap.set(c.bookId, (cacheCountMap.get(c.bookId) || 0) + 1);
                });
            } catch (e) { /* v9 store 可能还没迁移好，忽略 */ }

            allBooks.forEach(book => {
                const coverEl = book.sourceFormat === 'pdf' ? '📄' : (book.sourceFormat === 'epub' ? '📑' : '📖');
                const cacheCount = cacheCountMap.get(book.id) || 0;
                const cacheOk = cacheCount >= Math.max(1, Math.floor(book.totalChapters * 0.5));

                const progress = book.totalChapters > 0
                    ? Math.round((book.currentChapterIndex / book.totalChapters) * 100)
                    : 0;

                const el = document.createElement('div');
                el.className = `book-item cove-book-card ${isEditMode ? 'edit-mode' : ''}`;
                el.dataset.id = book.id;
                el.innerHTML = `
                    <button class="book-delete-btn" data-id="${book.id}" aria-label="删除">×</button>
                    <div class="cove-card-inner">
                        <div class="book-cover cove-cover" style="background: linear-gradient(135deg, #ffd6e2, #ff9eb5); color:#fff;">
                            ${coverEl}
                        </div>
                        <div class="cove-meta">
                            <div class="book-title cove-title-c">${book.title || '未命名'}</div>
                            <div class="book-author cove-sub-c">${book.author || '未知作者'} · ${book.totalChapters || 0} 章</div>
                            <div class="cove-badges">
                                <span class="cove-badge cove-badge-${book.sourceFormat || 'txt'}">${(book.sourceFormat || 'txt').toUpperCase()}</span>
                                ${cacheOk
                                    ? `<span class="cove-badge cove-badge-cache" title="${cacheCount}/${book.totalChapters} 章指纹已缓存">💗 缓存已就绪</span>`
                                    : `<span class="cove-badge cove-badge-nocache" title="章节指纹未缓存">指纹中...</span>`
                                }
                            </div>
                            <div class="cove-progress-row">
                                <div class="cove-progress-bar"><div class="cove-progress-fill" style="width:${progress}%;"></div></div>
                                <span class="cove-progress-text">${progress}%</span>
                            </div>
                        </div>
                    </div>
                `;

                el.addEventListener('click', (e) => {
                    if (isEditMode) return;
                    if (e.target.classList.contains('book-delete-btn')) return;
                    openReaderView(book.id);
                });

                const del = el.querySelector('.book-delete-btn');
                del.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除《${book.title}》？\n（所有章节指纹缓存、AI 分析结果会一起清理）`)) {
                        await deleteBook(book.id);
                        renderBookshelf();
                    }
                });

                // 插到上传按钮之前
                const uploadBtn = bookshelfGrid.querySelector('.cove-upload-btn');
                bookshelfGrid.insertBefore(el, uploadBtn);
            });
        } catch (e) {
            console.error('renderBookshelf failed:', e);
        } finally {
            isRendering = false;
        }
    }

    async function deleteBook(bookId) {
        try {
            await dexieDB.transaction('rw',
                dexieDB.reader_books, dexieDB.reader_chapters, dexieDB.reader_comments,
                dexieDB.cove_chapter_cache, dexieDB.cove_analysis_cache,
                async () => {
                    await dexieDB.reader_books.delete(bookId);
                    await dexieDB.reader_chapters.where('bookId').equals(bookId).delete();
                    await dexieDB.reader_comments.where('bookId').equals(bookId).delete();
                    await dexieDB.cove_chapter_cache.where('bookId').equals(bookId).delete();
                    await dexieDB.cove_analysis_cache.where('bookId').equals(bookId).delete();
                });
            showToast("已删除");
        } catch (e) {
            showToast("删除失败: " + e.message);
        }
    }

    // ============ 上传处理（兼容旧流程 + 新流程） ============
    // 新版：processBookFile 直接产出章节 → saveBookToDB 自动算指纹
    // 旧版：TXT 仍然走 chapter confirm modal（读者可以挑匹配规则）
    fileUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        fileUploadInput.value = '';

        const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
        const bookInfo = window.readerParser.parseBookInfo(file.name);

        // TXT 走旧的目录识别弹窗（用户体验好）
        if (ext === 'txt') {
            try {
                const text = await window.readerParser.readTxtContent(file);
                showChapterConfirmModal(bookInfo, text, async (finalChapters) => {
                    showImportModal(`导入《${bookInfo.title}》`);
                    updateImportProgress(80, '保存章节 + 计算指纹...');
                    bookInfo.sourceFormat = 'txt';
                    const start = Date.now();
                    await window.readerParser.saveBookToDB(bookInfo, finalChapters);
                    updateImportProgress(100, `完成！（${Math.round((Date.now() - start)/1000)}s）`);
                    setTimeout(() => { hideImportModal(); showToast(`《${bookInfo.title}》已入架 ✨`); renderBookshelf(); }, 600);
                });
            } catch (err) {
                showToast("导入失败: " + err.message);
            }
            return;
        }

        // PDF / EPUB 直接 import
        try {
            showImportModal(`解析《${bookInfo.title}》`);
            const { chapters } = await window.readerParser.parseBookFile(file, (p, s) => updateImportProgress(p, s));
            bookInfo.sourceFormat = ext;
            updateImportProgress(80, `保存 ${chapters.length} 章 + 计算指纹...`);
            const start = Date.now();
            await window.readerParser.saveBookToDB(bookInfo, chapters);
            updateImportProgress(100, `完成！（${Math.round((Date.now() - start)/1000)}s）`);
            setTimeout(() => { hideImportModal(); showToast(`《${bookInfo.title}》已入架 ✨`); renderBookshelf(); }, 600);
        } catch (err) {
            hideImportModal();
            showToast("导入失败: " + err.message);
        }
    });

    // ============ 旧版目录识别弹窗（TXT 用） ============
    function showChapterConfirmModal(bookInfo, text, onConfirm) {
        let currentPatternKey = 'AUTO';
        let currentChapters = window.readerParser.parseChapters(text, currentPatternKey);
        const modalEl = document.createElement('div');
        modalEl.className = 'chapter-confirm-modal-overlay';
        const tagsHtml = window.readerParser.CHAPTER_PATTERNS.map(pattern => `
            <button class="chapter-tag-btn ${pattern.key === currentPatternKey ? 'active' : ''}" data-key="${pattern.key}">${pattern.label}</button>
        `).join('');
        modalEl.innerHTML = `
            <div class="chapter-confirm-modal">
                <div class="modal-header"><h3>目录识别确认</h3><button class="modal-close-btn">&times;</button></div>
                <div class="modal-body">
                    <div class="book-info-summary"><span><strong>书名：</strong>${bookInfo.title}</span><span><strong>作者：</strong>${bookInfo.author}</span></div>
                    <div class="section-title">选择匹配规则：</div>
                    <div class="chapter-tags-container">${tagsHtml}</div>
                    <div class="preview-header">识别结果预览 (共 <b id="preview-chapter-count">${currentChapters.length}</b> 章)</div>
                    <div class="chapter-preview-list" id="chapter-preview-list"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn cancel-btn">取消</button>
                    <button class="modal-btn confirm-btn primary">确认并导入</button>
                </div>
            </div>`;
        document.body.appendChild(modalEl);
        const previewListEl = modalEl.querySelector('#chapter-preview-list');
        const countEl = modalEl.querySelector('#preview-chapter-count');
        function renderPreview() {
            countEl.textContent = currentChapters.length;
            if (currentChapters.length === 0) { previewListEl.innerHTML = `<div class="preview-empty">未识别到章节</div>`; return; }
            const displayChapters = currentChapters.slice(0, 100);
            previewListEl.innerHTML = displayChapters.map((ch, idx) => `
                <div class="preview-chapter-item"><span class="index">${idx + 1}.</span><span class="title">${ch.title}</span></div>
            `).join('') + (currentChapters.length > 100 ? `<div class="preview-more">... 剩余 ${currentChapters.length - 100} 章</div>` : '');
        }
        renderPreview();
        modalEl.querySelectorAll('.chapter-tag-btn').forEach(btn => btn.addEventListener('click', () => {
            modalEl.querySelectorAll('.chapter-tag-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPatternKey = btn.dataset.key;
            currentChapters = window.readerParser.parseChapters(text, currentPatternKey);
            renderPreview();
        }));
        const close = () => modalEl.remove();
        modalEl.querySelector('.modal-close-btn').addEventListener('click', close);
        modalEl.querySelector('.cancel-btn').addEventListener('click', close);
        modalEl.querySelector('.confirm-btn').addEventListener('click', () => { close(); if (onConfirm) onConfirm(currentChapters); });
    }

    // ============ 管理模式切换 ============
    if (manageBtn && cancelManageBtn) {
        manageBtn.addEventListener('click', () => { isEditMode = true; manageBtn.style.display = 'none'; cancelManageBtn.style.display = 'block'; renderBookshelf(); });
        cancelManageBtn.addEventListener('click', () => { isEditMode = false; manageBtn.style.display = 'block'; cancelManageBtn.style.display = 'none'; renderBookshelf(); });
    }

    // ============ 屏幕切换观察 ============
    let lastActiveState = false;
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.target.id === 'reader-bookshelf-screen') {
                const isActive = m.target.classList.contains('active');
                if (isActive && !lastActiveState) {
                    renderBookshelf();
                    // Cove: 确保右上角两个导出按钮存在（幂等）
                    if (window.readerSkillForge) window.readerSkillForge.ensureForgeUi(m.target);
                }
                lastActiveState = isActive;
            }
        });
    });
    const bookshelfScreen = document.getElementById('reader-bookshelf-screen');
    if (bookshelfScreen) observer.observe(bookshelfScreen, { attributes: true, attributeFilter: ['class'] });

    window.readerBookshelf = { renderBookshelf };
});

function openReaderView(bookId) {
    if (window.readerView && window.readerView.loadBook) {
        window.readerView.loadBook(bookId);
        switchScreen('reader-view-screen');
    } else {
        console.error("readerView 模块未加载");
    }
}
