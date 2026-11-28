// --- 世界书功能 (js/modules/worldbook.js) ---

let wbViewMode = 'grid'; // 'grid' 或 'list'
let wbPathStack = [{ id: null, name: '世界书' }];
let wbEntryEditMode = false; // 全局世界书条目页的编辑模式（点右上角铅笔进入，点条目直接进编辑页）
let wbSearchQuery = ''; // 世界书搜索关键字（按名字过滤当前层级）

function enterWorldBookMultiSelectMode(initialId) {
    if (isWorldBookMultiSelectMode) return;
    isWorldBookMultiSelectMode = true;

    document.getElementById('wb-fab').style.display = 'none';
    document.getElementById('world-book-view-toggle-btn').style.display = 'none';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'inline-block';
    document.getElementById('world-book-screen').classList.add('wb-multi-select');
    document.getElementById('world-book-multi-select-bar').style.display = 'flex';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '70px';

    selectedWorldBookIds.clear();
    if (initialId) {
        selectedWorldBookIds.add(initialId);
    }

    updateWorldBookSelectCount();
    renderWorldBookList(); 
}

function exitWorldBookMultiSelectMode() {
    isWorldBookMultiSelectMode = false;

    document.getElementById('wb-fab').style.display = '';
    document.getElementById('world-book-view-toggle-btn').style.display = 'inline-block';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'none';
    document.getElementById('world-book-screen').classList.remove('wb-multi-select');
    document.getElementById('world-book-multi-select-bar').style.display = 'none';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '0';

    selectedWorldBookIds.clear();
    renderWorldBookList();
}

function toggleWorldBookSelection(bookId) {
    if (selectedWorldBookIds.has(bookId)) {
        selectedWorldBookIds.delete(bookId);
    } else {
        selectedWorldBookIds.add(bookId);
    }
    updateWorldBookSelectCount();
    renderWorldBookList();
}

function updateWorldBookSelectCount() {
    const count = selectedWorldBookIds.size;
    document.getElementById('world-book-select-count').textContent = `已选择 ${count} 项`;
    document.getElementById('delete-selected-world-books-btn').disabled = count === 0;
    
    const moveBtn = document.getElementById('move-selected-world-books-btn');
    if (moveBtn) {
        moveBtn.disabled = count === 0;
    }
}

// 获取文件夹及其所有子文件夹中的条目ID
function getFolderEntryIds(folderId) {
    const ids = [];
    const collect = (parentId) => {
        db.worldBooks.forEach(item => {
            if (item.parentId === parentId) {
                if (item.type === 'entry') ids.push(item.id);
                else if (item.type === 'folder') collect(item.id);
            }
        });
    };
    collect(folderId);
    return ids;
}

// 检查某个条目的祖先文件夹中是否有全局文件夹
function hasGlobalAncestor(entryId) {
    const entry = db.worldBooks.find(wb => wb.id === entryId);
    if (!entry || !entry.parentId) return null;
    let pid = entry.parentId;
    while (pid) {
        const folder = db.worldBooks.find(wb => wb.id === pid);
        if (folder && folder.global) return folder;
        if (folder) pid = folder.parentId;
        else break;
    }
    return null;
}

// 将全局文件夹的条目绑定到所有角色和群组
async function bindGlobalFolderToAll(folderId) {
    const entryIds = getFolderEntryIds(folderId);
    if (entryIds.length === 0) return;
    db.characters.forEach(char => {
        if (!char.worldBookIds) char.worldBookIds = [];
        entryIds.forEach(id => {
            if (!char.worldBookIds.includes(id)) char.worldBookIds.push(id);
        });
    });
    db.groups.forEach(group => {
        if (!group.worldBookIds) group.worldBookIds = [];
        entryIds.forEach(id => {
            if (!group.worldBookIds.includes(id)) group.worldBookIds.push(id);
        });
    });
}

// 从所有角色和群组中解绑全局文件夹的条目
async function unbindGlobalFolderFromAll(folderId) {
    const entryIds = getFolderEntryIds(folderId);
    if (entryIds.length === 0) return;
    const idSet = new Set(entryIds);
    db.characters.forEach(char => {
        if (char.worldBookIds) {
            char.worldBookIds = char.worldBookIds.filter(id => !idSet.has(id));
        }
    });
    db.groups.forEach(group => {
        if (group.worldBookIds) {
            group.worldBookIds = group.worldBookIds.filter(id => !idSet.has(id));
        }
    });
}

/**
 * 液态玻璃风格的确认弹窗（替代 confirm，部分 WebView 会吞掉原生 confirm 导致"点了没反应"）
 * @returns {Promise<boolean>} 确定返回 true，取消返回 false
 */
function wbAskConfirm(title, message, okText) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'wb-prompt-overlay';
        overlay.innerHTML = `
            <div class="wb-prompt-card">
                <div class="wb-prompt-title"></div>
                <div class="wb-prompt-msg"></div>
                <div class="wb-prompt-actions">
                    <button type="button" class="wb-prompt-btn wb-prompt-cancel">取消</button>
                    <button type="button" class="wb-prompt-btn wb-prompt-ok">${wbEscape(okText || '确定')}</button>
                </div>
            </div>
        `;
        overlay.querySelector('.wb-prompt-title').textContent = title || '确认';
        overlay.querySelector('.wb-prompt-msg').textContent = message || '';
        document.body.appendChild(overlay);

        let done = false;
        const finish = value => {
            if (done) return;
            done = true;
            overlay.remove();
            resolve(value);
        };
        overlay.querySelector('.wb-prompt-cancel').addEventListener('click', () => finish(false));
        overlay.querySelector('.wb-prompt-ok').addEventListener('click', () => finish(true));
        overlay.addEventListener('click', e => {
            if (e.target === overlay) finish(false);
        });
    });
}

// 空世界书自动删除：递归清掉没有任何条目/子世界书的空文件夹
function purgeEmptyWorldBooks() {
    let removed = 0;
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = db.worldBooks.length - 1; i >= 0; i--) {
            const item = db.worldBooks[i];
            const hasChildren = db.worldBooks.some(wb => wb.parentId === item.id);
            if (item.type === 'folder' && !hasChildren) {
                db.worldBooks.splice(i, 1);
                removed++;
                changed = true;
            }
        }
    }
    if (removed > 0) {
        // 清理路径栈中已不存在的文件夹
        wbPathStack = wbPathStack.filter(p => p.id === null || db.worldBooks.some(wb => wb.id === p.id));
        if (wbPathStack.length === 0) wbPathStack = [{ id: null, name: '世界书' }];
    }
    return removed;
}

async function deleteSelectedWorldBooks() {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;

    const ok = await wbAskConfirm('删除确认', `确定要删除这 ${count} 个项目吗？此操作不可恢复。`, '删除');
    if (ok) {
        const idsToDelete = Array.from(selectedWorldBookIds);
        
        // 递归删除文件夹及其内容
        const allIdsToDelete = new Set();
        const findChildren = (parentId) => {
            db.worldBooks.forEach(item => {
                if (item.parentId === parentId) {
                    allIdsToDelete.add(item.id);
                    if (item.type === 'folder') findChildren(item.id);
                }
            });
        };
        
        idsToDelete.forEach(id => {
            allIdsToDelete.add(id);
            const item = db.worldBooks.find(wb => wb.id === id);
            if (item && item.type === 'folder') findChildren(id);
        });

        const finalIds = Array.from(allIdsToDelete);
        await dexieDB.worldBooks.bulkDelete(finalIds);
        db.worldBooks = db.worldBooks.filter(book => !allIdsToDelete.has(book.id));
        
        db.characters.forEach(char => {
            if (char.worldBookIds) {
                char.worldBookIds = char.worldBookIds.filter(id => !allIdsToDelete.has(id));
            }
        });
        db.groups.forEach(group => {
            if (group.worldBookIds) {
                group.worldBookIds = group.worldBookIds.filter(id => !allIdsToDelete.has(id));
            }
        });

        await saveData();
        const purged = purgeEmptyWorldBooks();
        if (purged > 0) await saveData();
        showToast(`已成功删除 ${finalIds.length} 个项目`);
        exitWorldBookMultiSelectMode();
        renderWorldBookList();
    }
}

async function migrateWorldBookPositions() {
    let migrated = false;
    db.worldBooks.forEach(item => {
        if (item.type === 'entry' && (item.position === 'middle' || item.position === 'center')) {
            item.position = 'before';
            item.depth = 300;
            migrated = true;
        }
    });
    if (migrated) {
        await saveData();
        console.log('Worldbook positions migrated: middle -> before (depth 300)');
    }
}

// V2 模型迁移：旧四位置（破限/前/后/聊天规范）+ depth 排序 → 酒馆式字段。
// 只补字段不删数据：旧条目全部保留，无关键词的条目转为常驻（保持原来"每轮必注入"的行为）。
async function migrateWorldBookModelV2() {
    let migrated = 0;
    db.worldBooks.forEach(item => {
        if (!item || item._wbV2) return;
        if (item.type === 'folder') {
            if (item.recursion === undefined) item.recursion = false;
            if (item.maxRecursionSteps === undefined) item.maxRecursionSteps = 3;
            item._wbV2 = true;
            return;
        }
        if (item.type !== 'entry') return;
        if (item.position === 'limit_break') {
            item.entryType = 'jailbreak';
        } else if (!item.entryType) {
            item.entryType = 'normal';
        }
        // 旧 depth 是排序权重（越小越靠前）→ 新 order（越大越靠前）
        if (item.order === undefined) {
            const oldDepth = (typeof wbToNum === 'function') ? wbToNum(item.depth, 100) : (parseInt(item.depth, 10) || 100);
            item.order = Math.max(1, Math.min(999, 200 - oldDepth));
        }
        item.position = 0;
        item.depth = 4;
        if (item.role === undefined) item.role = 0;
        // 旧模型没有关键词：无关键词的条目转常驻，保持旧的常驻注入行为
        if (!item.keys && !item.keysSecondary) {
            item.constant = true;
        }
        item.keys = item.keys || '';
        item.keysSecondary = item.keysSecondary || '';
        if (item.selectiveLogic === undefined) item.selectiveLogic = 0;
        if (!item.priority) item.priority = 'medium';
        if (!item.chatScope) item.chatScope = 'all';
        if (item.scanDepth === undefined) item.scanDepth = '';
        if (item.caseSensitive === undefined) item.caseSensitive = false;
        if (item.matchWholeWords === undefined) item.matchWholeWords = true;
        if (item.useProbability === undefined) item.useProbability = false;
        if (item.probability === undefined) item.probability = 100;
        if (item.group === undefined) item.group = '';
        if (item.groupWeight === undefined) item.groupWeight = 100;
        if (item.groupOverride === undefined) item.groupOverride = false;
        if (item.sticky === undefined) item.sticky = 0;
        if (item.cooldown === undefined) item.cooldown = 0;
        if (item.delay === undefined) item.delay = 0;
        if (item.excludeRecursion === undefined) item.excludeRecursion = false;
        if (item.preventRecursion === undefined) item.preventRecursion = false;
        if (item.delayUntilRecursion === undefined) item.delayUntilRecursion = false;
        if (item.disable === undefined) item.disable = false;
        item._wbV2 = true;
        migrated++;
    });
    if (migrated > 0) {
        await saveData();
        console.log(`[世界书] V2 模型迁移完成：${migrated} 个条目/文件夹`);
    }
}

// 三态 select：'' 不修改 / 'on' / 'off'
function wbTriState(val) {
    if (val === 'on' || val === 'off') return val;
    return '';
}

function wbApplyTriState(item, field, tri) {
    if (tri === 'on') item[field] = true;
    else if (tri === 'off') item[field] = false;
}

function wbBatchApply(patch, folderPatch, targetIds) {
    let count = 0;
    db.worldBooks.forEach(item => {
        if (item.type !== 'entry') return;
        if (targetIds && !targetIds.includes(item.id)) return;
        Object.keys(patch).forEach(k => { item[k] = patch[k]; });
        count++;
    });
    if (folderPatch && folderPatch.id) {
        const folder = db.worldBooks.find(wb => wb.id === folderPatch.id);
        if (folder) {
            if (folderPatch.recursion !== undefined) folder.recursion = folderPatch.recursion;
            if (folderPatch.maxRecursionSteps !== undefined) folder.maxRecursionSteps = folderPatch.maxRecursionSteps;
        }
    }
    return count;
}

// 整本酒馆进阶：批量弹窗
function openWorldBookBatchModal() {
    const modal = document.getElementById('wb-batch-adv-modal');
    if (!modal) return;
    // 重置为"全部不修改"
    ['wb-batch-priority', 'wb-batch-position', 'wb-batch-role', 'wb-batch-constant', 'wb-batch-prob-toggle',
     'wb-batch-case', 'wb-batch-whole-words', 'wb-batch-group-override', 'wb-batch-exclude-recursion',
     'wb-batch-prevent-recursion', 'wb-batch-delay-until-recursion', 'wb-batch-enabled',
     'wb-batch-folder-recursion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['wb-batch-keys', 'wb-batch-group'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['wb-batch-depth', 'wb-batch-order', 'wb-batch-scan-depth', 'wb-batch-probability', 'wb-batch-group-weight',
     'wb-batch-sticky', 'wb-batch-cooldown', 'wb-batch-delay', 'wb-batch-max-recursion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const targetInfo = document.getElementById('wb-batch-target-info');
    if (targetInfo) {
        const selectedIds = Array.from(selectedWorldBookIds).filter(id => {
            const item = db.worldBooks.find(wb => wb.id === id);
            return item && item.type === 'entry';
        });
        targetInfo.textContent = selectedIds.length > 0
            ? `应用到已选 ${selectedIds.length} 个条目`
            : '应用到整本所有条目';
    }
    modal.classList.add('visible');
}

function closeWorldBookBatchModal() {
    const modal = document.getElementById('wb-batch-adv-modal');
    if (modal) modal.classList.remove('visible');
}

async function applyWorldBookBatch() {
    const modal = document.getElementById('wb-batch-adv-modal');
    if (!modal) return;
    const val = id => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    const numOrUndef = id => {
        const v = val(id);
        if (v === '' || v === null) return undefined;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : undefined;
    };

    const patch = {};
    const priority = val('wb-batch-priority');
    if (priority === 'high' || priority === 'medium' || priority === 'low') patch.priority = priority;
    const position = val('wb-batch-position');
    if (position === '0' || position === '4') patch.position = parseInt(position, 10);
    const role = val('wb-batch-role');
    if (role === '0' || role === '1' || role === '2') patch.role = parseInt(role, 10);
    const depth = numOrUndef('wb-batch-depth');
    if (depth !== undefined) patch.depth = Math.max(0, depth);
    const order = numOrUndef('wb-batch-order');
    if (order !== undefined) patch.order = order;
    const scanDepthRaw = val('wb-batch-scan-depth');
    if (scanDepthRaw !== '') {
        const n = parseInt(scanDepthRaw, 10);
        patch.scanDepth = Number.isFinite(n) && n >= 1 ? n : '';
    }
    const constant = wbTriState(val('wb-batch-constant'));
    if (constant !== '') patch.constant = constant === 'on';
    const probToggle = wbTriState(val('wb-batch-prob-toggle'));
    if (probToggle !== '') patch.useProbability = probToggle === 'on';
    const probability = numOrUndef('wb-batch-probability');
    if (probability !== undefined) patch.probability = Math.min(100, Math.max(0, probability));
    const keys = val('wb-batch-keys');
    if (keys.trim() !== '') patch.keys = keys.trim();
    const caseTri = wbTriState(val('wb-batch-case'));
    if (caseTri !== '') patch.caseSensitive = caseTri === 'on';
    const wholeTri = wbTriState(val('wb-batch-whole-words'));
    if (wholeTri !== '') patch.matchWholeWords = wholeTri === 'on';
    const group = val('wb-batch-group');
    if (group.trim() !== '') patch.group = group.trim();
    const groupWeight = numOrUndef('wb-batch-group-weight');
    if (groupWeight !== undefined) patch.groupWeight = Math.max(1, groupWeight);
    const groupOverride = wbTriState(val('wb-batch-group-override'));
    if (groupOverride !== '') patch.groupOverride = groupOverride === 'on';
    const sticky = numOrUndef('wb-batch-sticky');
    if (sticky !== undefined) patch.sticky = Math.max(0, sticky);
    const cooldown = numOrUndef('wb-batch-cooldown');
    if (cooldown !== undefined) patch.cooldown = Math.max(0, cooldown);
    const delay = numOrUndef('wb-batch-delay');
    if (delay !== undefined) patch.delay = Math.max(0, delay);
    const excludeRec = wbTriState(val('wb-batch-exclude-recursion'));
    if (excludeRec !== '') patch.excludeRecursion = excludeRec === 'on';
    const preventRec = wbTriState(val('wb-batch-prevent-recursion'));
    if (preventRec !== '') patch.preventRecursion = preventRec === 'on';
    const delayUntilRec = wbTriState(val('wb-batch-delay-until-recursion'));
    if (delayUntilRec !== '') patch.delayUntilRecursion = delayUntilRec === 'on';
    const enabledTri = wbTriState(val('wb-batch-enabled'));
    if (enabledTri !== '') patch.disable = enabledTri !== 'on';

    // 书级（递归）只对当前所在世界书生效
    let folderPatch = null;
    const currentFolder = wbPathStack[wbPathStack.length - 1];
    if (currentFolder && currentFolder.id) {
        const folderRec = wbTriState(val('wb-batch-folder-recursion'));
        const maxRec = numOrUndef('wb-batch-max-recursion');
        if (folderRec !== '' || maxRec !== undefined) {
            folderPatch = { id: currentFolder.id };
            if (folderRec !== '') folderPatch.recursion = folderRec === 'on';
            if (maxRec !== undefined) folderPatch.maxRecursionSteps = Math.min(10, Math.max(1, maxRec));
        }
    }

    // 多选模式下只改已选条目，否则改整本
    const selectedIds = Array.from(selectedWorldBookIds).filter(id => {
        const item = db.worldBooks.find(wb => wb.id === id);
        return item && item.type === 'entry';
    });
    const targetIds = selectedIds.length > 0 ? selectedIds : null;

    const hasEntryPatch = Object.keys(patch).length > 0;
    if (!hasEntryPatch && !folderPatch) {
        showToast('没有要修改的设置');
        return;
    }
    const count = wbBatchApply(patch, folderPatch, targetIds);
    closeWorldBookBatchModal();
    renderWorldBookList();
    showToast(`已应用设置到 ${count} 个条目`);
    try {
        await saveData();
    } catch (err) {
        console.error('世界书批量设置持久化失败:', err);
    }
}


async function migrateWorldBookCategories() {
    // 结构归一化：条目只能活在世界书（文件夹）里。
    // 兼容旧版 category 迁移 + 备份导入产生的"游离条目"（无 parentId 或归属失效、缺 type 字段），
    // 自动按 category / bookName / book 分组成一本一本的世界书，无法分组时统一归入「导入的世界书」。
    if (!Array.isArray(db.worldBooks)) db.worldBooks = [];

    const folderIds = new Set(db.worldBooks.filter(wb => wb && wb.type === 'folder' && wb.id).map(wb => wb.id));
    const orphans = db.worldBooks.filter(item => {
        if (!item || item.id === undefined || item.id === null) return false;
        if (item.type === 'folder') return false;                       // 文件夹本身不会游离
        // 条目：没有归属，或归属指向不存在的文件夹 → 游离条目
        return !item.parentId || !folderIds.has(item.parentId);
    });
    if (orphans.length === 0) return;

    // 分组键：category > bookName > book > lorebookName > 兜底
    const groups = new Map();
    orphans.forEach(item => {
        const key = item.category || item.bookName || item.book || item.lorebookName || '导入的世界书';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });

    let createdBooks = 0;
    for (const [bookName, items] of groups) {
        // 查找是否已存在同名根级世界书
        let folder = db.worldBooks.find(wb => wb.type === 'folder' && wb.name === bookName && !wb.parentId);
        if (!folder) {
            folder = {
                id: `wb_f_migrated_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                parentId: null,
                type: 'folder',
                name: bookName
            };
            db.worldBooks.push(folder);
            createdBooks++;
        }
        // 条目挂入世界书，并补齐缺失的 type 字段（选择器/渲染都依赖 type === 'entry'）
        items.forEach(item => {
            item.parentId = folder.id;
            if (item.type !== 'entry') item.type = 'entry';
        });
    }

    await saveData();
    console.log(`[世界书] 结构归一化完成：${orphans.length} 个游离条目 → ${groups.size} 本世界书（新建 ${createdBooks} 本）`);
    showToast(`检测到 ${orphans.length} 个游离条目，已自动整理为 ${groups.size} 本世界书`);
}

/**
 * 弹出目标世界书选择弹窗
 * @param {Array<{id:string,name:string}>} folders 候选世界书列表
 * @returns {Promise<string|null>} 选中的世界书 id，取消返回 null
 */
function wbAskMoveTarget(folders) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'wb-prompt-overlay';
        const listHtml = folders.map(f => `
            <button type="button" class="wb-move-item" data-id="${wbEscape(f.id)}">${wbEscape(f.name)}</button>
        `).join('');
        overlay.innerHTML = `
            <div class="wb-prompt-card wb-move-card">
                <div class="wb-prompt-title">移动到</div>
                <div class="wb-move-list">${listHtml}</div>
                <div class="wb-prompt-actions">
                    <button type="button" class="wb-prompt-btn wb-prompt-cancel">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let done = false;
        const finish = value => {
            if (done) return;
            done = true;
            overlay.remove();
            resolve(value);
        };
        overlay.querySelectorAll('.wb-move-item').forEach(btn => {
            btn.addEventListener('click', () => finish(btn.dataset.id));
        });
        overlay.querySelector('.wb-prompt-cancel').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', e => {
            if (e.target === overlay) finish(null);
        });
    });
}

async function moveSelectedWorldBooksToTarget() {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;

    // 循环引用检查：文件夹不能移动到它自身或其子文件夹中（直接从候选列表里排除）
    const isDescendant = (parentId, targetId) => {
        if (!parentId) return false;
        if (parentId === targetId) return true;
        const parent = db.worldBooks.find(wb => wb.id === parentId);
        if (parent && parent.parentId) {
            return isDescendant(parent.parentId, targetId);
        }
        return false;
    };

    const selectedFolders = db.worldBooks.filter(wb => selectedWorldBookIds.has(wb.id) && wb.type === 'folder');
    // 候选目标：所有世界书（文件夹），排除已选中的文件夹自身及其子孙
    const candidates = db.worldBooks.filter(wb => {
        if (wb.type !== 'folder') return false;
        return !selectedFolders.some(sf => sf.id === wb.id || isDescendant(wb.id, sf.id));
    });
    if (candidates.length === 0) {
        showToast('没有可选择的目标世界书');
        return;
    }

    const targetId = await wbAskMoveTarget(candidates);
    if (!targetId) return;
    const target = db.worldBooks.find(wb => wb.id === targetId);
    if (!target) return;

    // 执行移动
    const idsToMove = Array.from(selectedWorldBookIds);
    idsToMove.forEach(id => {
        const item = db.worldBooks.find(wb => wb.id === id);
        if (item) {
            item.parentId = targetId;
        }
    });

    await saveData();
    const purged = purgeEmptyWorldBooks();
    if (purged > 0) {
        await saveData();
        if (purged === 1) showToast(`已移动 ${count} 个项目，1 本空世界书已自动删除`);
        else showToast(`已移动 ${count} 个项目，${purged} 本空世界书已自动删除`);
    } else {
        showToast(`已成功移动 ${count} 个项目`);
    }
    exitWorldBookMultiSelectMode();
    renderWorldBookList();
}

/** 转义 HTML，条目内容/名称直接拼进 DOM 前使用 */
function wbEscape(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 液态玻璃风格的输入弹窗（替代 prompt）
 * @param {string} title 标题
 * @param {string} placeholder 输入框占位
 * @param {string} defaultValue 默认值
 * @returns {Promise<string|null>} 确认返回输入的文本，取消返回 null
 */
function wbAskName(title, placeholder, defaultValue) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'wb-prompt-overlay';
        overlay.innerHTML = `
            <div class="wb-prompt-card">
                <div class="wb-prompt-title"></div>
                <input class="wb-prompt-input" type="text">
                <div class="wb-prompt-actions">
                    <button type="button" class="wb-prompt-btn wb-prompt-cancel">取消</button>
                    <button type="button" class="wb-prompt-btn wb-prompt-ok">确定</button>
                </div>
            </div>
        `;
        overlay.querySelector('.wb-prompt-title').textContent = title || '请输入';
        const input = overlay.querySelector('.wb-prompt-input');
        input.placeholder = placeholder || '';
        input.value = defaultValue || '';
        document.body.appendChild(overlay);

        let done = false;
        const finish = value => {
            if (done) return;
            done = true;
            overlay.remove();
            resolve(value);
        };
        const submit = () => {
            const v = input.value.trim();
            finish(v ? v : null);
        };

        overlay.querySelector('.wb-prompt-cancel').addEventListener('click', () => finish(null));
        overlay.querySelector('.wb-prompt-ok').addEventListener('click', submit);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) finish(null);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                finish(null);
            }
        });

        setTimeout(() => {
            input.focus();
            input.select();
        }, 60);
    });
}

/**
 * 编辑当前世界书：改名 + 全局开关 + 封面上传
 * @returns {Promise<{name: string, global: boolean, cover: string|null, coverChanged: boolean}|null>}
 */
function wbAskFolderEdit(folder) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'wb-prompt-overlay';
        overlay.innerHTML = `
            <div class="wb-prompt-card">
                <div class="wb-prompt-title">编辑世界书</div>
                <input class="wb-prompt-input" type="text">
                <label class="wb-edit-global-row">
                    <input type="checkbox" class="wb-edit-global-cb">
                    <span>全局世界书</span>
                </label>
                <div class="wb-edit-cover-row">
                    <div class="wb-edit-cover-preview"></div>
                    <div class="wb-edit-cover-actions">
                        <button type="button" class="wb-edit-cover-btn">上传封面</button>
                        <button type="button" class="wb-edit-cover-reset">恢复默认</button>
                    </div>
                    <input type="file" class="wb-edit-cover-file" accept="image/*" hidden>
                </div>
                <div class="wb-prompt-actions">
                    <button type="button" class="wb-prompt-btn wb-prompt-cancel">取消</button>
                    <button type="button" class="wb-prompt-btn wb-prompt-ok">保存</button>
                </div>
            </div>
        `;
        const input = overlay.querySelector('.wb-prompt-input');
        const globalCb = overlay.querySelector('.wb-edit-global-cb');
        const preview = overlay.querySelector('.wb-edit-cover-preview');
        const fileInput = overlay.querySelector('.wb-edit-cover-file');
        input.value = folder.name || '';
        globalCb.checked = !!folder.global;

        let coverData = folder.cover || null;
        let coverChanged = false;
        const refreshPreview = () => {
            preview.style.backgroundImage = coverData ? `url("${coverData}")` : '';
        };
        refreshPreview();
        document.body.appendChild(overlay);

        let done = false;
        const finish = value => {
            if (done) return;
            done = true;
            overlay.remove();
            resolve(value);
        };
        const submit = () => {
            const name = input.value.trim();
            if (!name) { showToast('名称不能为空'); return; }
            finish({ name, global: !!globalCb.checked, cover: coverData, coverChanged });
        };
        overlay.querySelector('.wb-prompt-cancel').addEventListener('click', () => finish(null));
        overlay.querySelector('.wb-prompt-ok').addEventListener('click', submit);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) finish(null);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            else if (e.key === 'Escape') finish(null);
        });
        overlay.querySelector('.wb-edit-cover-btn').addEventListener('click', () => fileInput.click());
        overlay.querySelector('.wb-edit-cover-reset').addEventListener('click', () => {
            coverData = null;
            coverChanged = true;
            refreshPreview();
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            try {
                const dataUrl = await compressImage(file, { quality: 0.7, maxWidth: 512, maxHeight: 512 });
                coverData = dataUrl;
                coverChanged = true;
                refreshPreview();
                showToast('封面已选择，保存后生效');
            } catch (err) {
                console.error('封面图片处理失败:', err);
                showToast('封面图片处理失败');
            }
        });
        setTimeout(() => { input.focus(); input.select(); }, 60);
    });
}

function openWorldBookTxtImportModal() {
    const folders = (db.worldBooks || []).filter(item => item && item.type === 'folder' && item.id);
    const folderMap = new Map(folders.map(folder => [folder.id, folder]));
    const folderPath = folder => {
        const parts = [folder.name || '未命名世界书'];
        let parent = folderMap.get(folder.parentId);
        while (parent) {
            parts.unshift(parent.name || '未命名世界书');
            parent = folderMap.get(parent.parentId);
        }
        return parts.join(' / ');
    };

    const overlay = document.createElement('div');
    overlay.className = 'wb-prompt-overlay wb-import-overlay';
    overlay.innerHTML = `
        <div class="wb-prompt-card wb-import-card" role="dialog" aria-modal="true" aria-labelledby="wb-import-title">
            <div class="wb-prompt-title" id="wb-import-title">导入 TXT 条目</div>
            <div class="wb-import-field">
                <label class="wb-import-label">TXT 文件</label>
                <button type="button" class="wb-import-file-btn" id="wb-txt-import-pick">选择 TXT 文件</button>
                <input type="file" id="wb-txt-import-file" accept=".txt,text/plain" hidden>
                <div class="wb-import-file-name" id="wb-txt-import-file-name">尚未选择文件</div>
            </div>
            <div class="wb-import-field">
                <label class="wb-import-label" for="wb-txt-import-target">导入到世界书</label>
                <select class="wb-import-select" id="wb-txt-import-target">
                    <option value="">请选择世界书</option>
                </select>
            </div>
            <div class="wb-import-error" id="wb-txt-import-error" role="alert"></div>
            <div class="wb-prompt-actions">
                <button type="button" class="wb-prompt-btn wb-prompt-cancel">取消</button>
                <button type="button" class="wb-prompt-btn wb-prompt-ok" disabled>导入</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const pickBtn = overlay.querySelector('#wb-txt-import-pick');
    const fileInput = overlay.querySelector('#wb-txt-import-file');
    const fileName = overlay.querySelector('#wb-txt-import-file-name');
    const targetSelect = overlay.querySelector('#wb-txt-import-target');
    const errorEl = overlay.querySelector('#wb-txt-import-error');
    const okBtn = overlay.querySelector('.wb-prompt-ok');
    const cancelBtn = overlay.querySelector('.wb-prompt-cancel');
    let selectedFile = null;
    let importing = false;

    folders
        .map(folder => ({ folder, label: folderPath(folder) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
        .forEach(({ folder, label }) => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = label;
            targetSelect.appendChild(option);
        });

    const currentFolderId = wbPathStack[wbPathStack.length - 1]?.id;
    if (currentFolderId && folderMap.has(currentFolderId)) targetSelect.value = currentFolderId;
    if (folders.length === 0) errorEl.textContent = '请先新建一本世界书，再导入条目。';

    const updateConfirmState = () => {
        okBtn.disabled = importing || !selectedFile || !targetSelect.value;
    };
    const setError = message => {
        errorEl.textContent = message || '';
    };
    const finish = () => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
    };
    const onKeyDown = event => {
        if (event.key === 'Escape' && !importing) finish();
    };

    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const isTxt = /\.txt$/i.test(file.name) || file.type === 'text/plain';
        if (!isTxt) {
            selectedFile = null;
            fileInput.value = '';
            fileName.textContent = '尚未选择文件';
            setError('请选择 TXT 格式的文件。');
            updateConfirmState();
            return;
        }
        selectedFile = file;
        const size = file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`;
        fileName.textContent = `${file.name} · ${size}`;
        setError('');
        updateConfirmState();
    });
    targetSelect.addEventListener('change', () => {
        setError('');
        updateConfirmState();
    });
    cancelBtn.addEventListener('click', () => {
        if (!importing) finish();
    });
    overlay.addEventListener('click', event => {
        if (event.target === overlay && !importing) finish();
    });
    document.addEventListener('keydown', onKeyDown);

    okBtn.addEventListener('click', async () => {
        if (importing || !selectedFile || !targetSelect.value) return;
        importing = true;
        okBtn.disabled = true;
        okBtn.textContent = '导入中…';
        cancelBtn.disabled = true;
        try {
            const raw = await selectedFile.text();
            const content = raw.replace(/^\uFEFF/, '').trim();
            if (!content) throw new Error('TXT 文件内容为空。');
            const target = folderMap.get(targetSelect.value);
            if (!target) throw new Error('所选世界书不存在，请重新选择。');

            const baseName = selectedFile.name.replace(/\.txt$/i, '').trim() || '导入的条目';
            const siblings = db.worldBooks.filter(item => item.parentId === target.id && item.type === 'entry');
            let name = baseName;
            let suffix = 0;
            while (siblings.some(item => item.name === name)) {
                suffix += 1;
                name = suffix === 1 ? `${baseName}（导入）` : `${baseName}（导入${suffix}）`;
            }

            const newId = `wb_${Date.now()}`;
            db.worldBooks.push({
                id: newId,
                parentId: target.id,
                type: 'entry',
                name,
                content,
                category: '',
                keys: '',
                keysSecondary: '',
                selectiveLogic: 0,
                constant: false,
                useProbability: false,
                probability: 100,
                priority: 'medium',
                position: 0,
                depth: 4,
                role: 0,
                order: 100,
                scanDepth: '',
                caseSensitive: false,
                matchWholeWords: true,
                group: '',
                groupWeight: 100,
                groupOverride: false,
                sticky: 0,
                cooldown: 0,
                delay: 0,
                excludeRecursion: false,
                preventRecursion: false,
                delayUntilRecursion: false,
                disable: false,
                entryType: 'normal',
                _wbV2: true
            });

            if (target.global) {
                db.characters.forEach(char => {
                    if (!char.worldBookIds) char.worldBookIds = [];
                    if (!char.worldBookIds.includes(newId)) char.worldBookIds.push(newId);
                });
                db.groups.forEach(group => {
                    if (!group.worldBookIds) group.worldBookIds = [];
                    if (!group.worldBookIds.includes(newId)) group.worldBookIds.push(newId);
                });
            }

            let persisted = true;
            try {
                await saveData();
            } catch (error) {
                persisted = false;
                console.error('TXT 条目持久化失败:', error);
            }

            const path = [{ id: null, name: '世界书' }];
            const chain = [];
            let current = target;
            while (current) {
                chain.unshift({ id: current.id, name: current.name });
                current = folderMap.get(current.parentId);
            }
            wbPathStack = path.concat(chain);
            renderWorldBookList();
            finish();
            switchScreen('world-book-screen');
            showToast(persisted ? `已导入「${name}」到「${target.name}」` : '条目已导入，但写入本地存储失败');
        } catch (error) {
            importing = false;
            okBtn.textContent = '导入';
            cancelBtn.disabled = false;
            setError(error && error.message ? error.message : '导入失败，请重试。');
            updateConfirmState();
        }
    });

    updateConfirmState();
    setTimeout(() => pickBtn.focus(), 60);
}

async function setupWorldBookApp() {
    await migrateWorldBookPositions();
    await migrateWorldBookCategories();
    await migrateWorldBookModelV2();
    const addWorldBookBtn = document.getElementById('add-world-book-btn');
    const viewToggleBtn = document.getElementById('world-book-view-toggle-btn');
    const backBtn = document.getElementById('world-book-back-btn');
    const newMenu = document.getElementById('world-book-new-menu');
    
    const editWorldBookForm = document.getElementById('edit-world-book-form');
    const worldBookNameInput = document.getElementById('world-book-name');
    const worldBookContentInput = document.getElementById('world-book-content');
    const worldBookListContainer = document.getElementById('world-book-list-container');
    const worldBookIdInput = document.getElementById('world-book-id');

    // 视图切换（网格 ↔ 横排）：直接切容器样式 + 重启容器浮现动画。
    // 注意：此处曾用 GSAP Flip 做几何补间，但 absolute:true 会把所有卡片拉出文档流
    // （容器塌陷→内容空白），且每张 3D 卡片逐帧重新栅格化，真机上卡顿白屏 1~2 秒，故弃用。
    let wbViewAnimTimer = null;
    viewToggleBtn.addEventListener('click', () => {
        const wbScreen = document.getElementById('world-book-screen');

        wbViewMode = wbViewMode === 'grid' ? 'list' : 'grid';
        document.getElementById('wb-grid-icon').style.display = wbViewMode === 'grid' ? 'block' : 'none';
        document.getElementById('wb-list-icon').style.display = wbViewMode === 'list' ? 'block' : 'none';
        worldBookListContainer.className = wbViewMode === 'grid' ? 'grid-view' : 'list-view';

        // 轻量过渡：重启 wbRise 浮现动画（单层 opacity+transform，低端机也流畅）
        worldBookListContainer.style.animation = 'none';
        void worldBookListContainer.offsetWidth; // 强制回流以重新触发动画
        worldBookListContainer.style.animation = '';

        // 动画期间关掉顶栏 backdrop-filter，结束恢复
        wbScreen.classList.add('wb-animating');
        clearTimeout(wbViewAnimTimer);
        wbViewAnimTimer = setTimeout(() => wbScreen.classList.remove('wb-animating'), 550);
    });

    // 返回逻辑
    backBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止冒泡到 body 触发全局 back-btn 逻辑
        if (wbPathStack.length > 1) {
            wbPathStack.pop();
            renderWorldBookList();
        } else {
            switchScreen('home-screen');
        }
    });

    // 搜索栏：点右上角放大镜展开 / 收起，输入即时按名字过滤当前层级
    const searchToggleBtn = document.getElementById('wb-search-toggle-btn');
    const searchBar = document.getElementById('wb-search-bar');
    const searchInput = document.getElementById('wb-search-input');
    const searchCancel = document.getElementById('wb-search-cancel');
    if (searchToggleBtn && searchBar && searchInput && searchCancel) {
        const wbScreenEl = document.getElementById('world-book-screen');
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const show = searchBar.style.display === 'none';
            searchBar.style.display = show ? 'flex' : 'none';
            wbScreenEl.classList.toggle('wb-searching', show);
            if (show) {
                searchInput.focus();
            } else {
                searchInput.value = '';
                wbSearchQuery = '';
                renderWorldBookList();
            }
        });
        searchInput.addEventListener('input', () => {
            wbSearchQuery = searchInput.value;
            renderWorldBookList();
        });
        searchCancel.addEventListener('click', () => {
            searchInput.value = '';
            wbSearchQuery = '';
            searchBar.style.display = 'none';
            wbScreenEl.classList.remove('wb-searching');
            renderWorldBookList();
        });
    }

    // 编辑界面的返回逻辑
    const editBackBtn = document.querySelector('#edit-world-book-screen .back-btn');
    if (editBackBtn) {
        // 移除可能存在的旧监听器（如果有的话）
        const newEditBackBtn = editBackBtn.cloneNode(true);
        editBackBtn.parentNode.replaceChild(newEditBackBtn, editBackBtn);
        
        newEditBackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            switchScreen('world-book-screen');
        });
    }

    // 新建菜单切换
    addWorldBookBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        newMenu.style.display = newMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
        newMenu.style.display = 'none';
    });

    // 新建世界书（用自定义输入弹窗，避免部分 WebView 不支持 prompt）
    document.getElementById('wb-menu-new-folder').addEventListener('click', async () => {
        const name = await wbAskName('新建世界书', '请输入世界书名称');
        if (name && name.trim()) {
            const currentFolderId = wbPathStack[wbPathStack.length - 1].id;
            const newFolder = {
                id: `wb_f_${Date.now()}`,
                parentId: currentFolderId,
                type: 'folder',
                name: name.trim()
            };
            db.worldBooks.push(newFolder);
            await saveData();
            renderWorldBookList();
        }
    });

    // 新建条目
    document.getElementById('wb-menu-new-entry').addEventListener('click', () => {
        currentEditingWorldBookId = null;
        editWorldBookForm.reset();
        document.getElementById('world-book-id').value = '';
        document.getElementById('world-book-category').value = '';
        document.getElementById('world-book-keys').value = '';
        document.getElementById('world-book-keys-secondary').value = '';
        document.getElementById('world-book-selective-logic').value = '0';
        document.getElementById('world-book-constant').checked = false;
        document.getElementById('world-book-prob-toggle').checked = false;
        document.getElementById('world-book-probability').value = '100';
        document.getElementById('world-book-priority').value = 'medium';
        document.querySelector('input[name="world-book-position"][value="0"]').checked = true;
        document.getElementById('world-book-depth').value = '4';
        document.getElementById('world-book-role').value = '0';
        document.getElementById('world-book-order').value = '100';
        document.getElementById('world-book-scan-depth').value = '';
        document.getElementById('world-book-case').checked = false;
        document.getElementById('world-book-whole-words').checked = true;
        document.getElementById('world-book-group').value = '';
        document.getElementById('world-book-group-weight').value = '100';
        document.getElementById('world-book-group-override').checked = false;
        document.getElementById('world-book-sticky').value = '0';
        document.getElementById('world-book-cooldown').value = '0';
        document.getElementById('world-book-delay').value = '0';
        document.getElementById('world-book-exclude-recursion').checked = false;
        document.getElementById('world-book-prevent-recursion').checked = false;
        document.getElementById('world-book-delay-until-recursion').checked = false;
        wbToggleEntryFormSections();
        switchScreen('edit-world-book-screen');
    });

    document.getElementById('wb-menu-import-txt').addEventListener('click', (e) => {
        e.stopPropagation();
        newMenu.style.display = 'none';
        openWorldBookTxtImportModal();
    });

    // 编辑当前世界书：改名 / 设为全局
    const editFolderItem = document.getElementById('wb-menu-edit-folder');
    if (editFolderItem) {
        editFolderItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            newMenu.style.display = 'none';
            const currentFolder = wbPathStack[wbPathStack.length - 1];
            if (!currentFolder || !currentFolder.id) return;
            const folder = db.worldBooks.find(wb => wb.id === currentFolder.id && wb.type === 'folder');
            if (!folder) return;

            const result = await wbAskFolderEdit(folder);
            if (!result) return;

            const wasGlobal = !!folder.global;
            if (wasGlobal !== result.global) {
                if (result.global) await bindGlobalFolderToAll(folder.id);
                else await unbindGlobalFolderFromAll(folder.id);
            }
            folder.name = result.name;
            folder.global = result.global;
            if (result.coverChanged) {
                if (result.cover) folder.cover = result.cover;
                else delete folder.cover;
            }
            currentFolder.name = result.name;
            await saveData();
            renderWorldBookList();
            showToast('世界书已更新');
        });
    }

    // 位置/概率切换时显示或隐藏对应字段
    document.querySelectorAll('input[name="world-book-position"]').forEach(radio => {
        radio.addEventListener('change', wbToggleEntryFormSections);
    });
    const wbProbToggleEl = document.getElementById('world-book-prob-toggle');
    if (wbProbToggleEl) wbProbToggleEl.addEventListener('change', wbToggleEntryFormSections);

    editWorldBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = worldBookNameInput.value.trim();
        const content = worldBookContentInput.value.trim();
        const category = document.getElementById('world-book-category').value.trim();
        const keys = document.getElementById('world-book-keys').value.trim();
        const keysSecondary = document.getElementById('world-book-keys-secondary').value.trim();
        const selectiveLogic = parseInt(document.getElementById('world-book-selective-logic').value, 10) || 0;
        const constant = document.getElementById('world-book-constant').checked;
        const useProbability = document.getElementById('world-book-prob-toggle').checked;
        const probability = Math.min(100, Math.max(0, parseInt(document.getElementById('world-book-probability').value, 10) || 0));
        const priority = document.getElementById('world-book-priority').value;
        const positionRadio = document.querySelector('input[name="world-book-position"]:checked');
        const position = positionRadio ? parseInt(positionRadio.value, 10) : 0;
        const depth = Math.max(0, parseInt(document.getElementById('world-book-depth').value, 10) || 4);
        const role = parseInt(document.getElementById('world-book-role').value, 10) || 0;
        const orderRaw = parseInt(document.getElementById('world-book-order').value, 10);
        const order = Number.isFinite(orderRaw) ? orderRaw : 100;
        const scanDepthRaw = document.getElementById('world-book-scan-depth').value.trim();
        const scanDepth = scanDepthRaw === '' ? '' : Math.max(1, parseInt(scanDepthRaw, 10) || 1);
        const caseSensitive = document.getElementById('world-book-case').checked;
        const matchWholeWords = document.getElementById('world-book-whole-words').checked;
        const group = document.getElementById('world-book-group').value.trim();
        const groupWeight = Math.max(1, parseInt(document.getElementById('world-book-group-weight').value, 10) || 100);
        const groupOverride = document.getElementById('world-book-group-override').checked;
        const sticky = Math.max(0, parseInt(document.getElementById('world-book-sticky').value, 10) || 0);
        const cooldown = Math.max(0, parseInt(document.getElementById('world-book-cooldown').value, 10) || 0);
        const delay = Math.max(0, parseInt(document.getElementById('world-book-delay').value, 10) || 0);
        const excludeRecursion = document.getElementById('world-book-exclude-recursion').checked;
        const preventRecursion = document.getElementById('world-book-prevent-recursion').checked;
        const delayUntilRecursion = document.getElementById('world-book-delay-until-recursion').checked;
        const currentFolderId = wbPathStack[wbPathStack.length - 1].id;

        if (!name || !content) return showToast('名称和内容不能为空');

        if (currentEditingWorldBookId) {
            const book = db.worldBooks.find(wb => wb.id === currentEditingWorldBookId);
            if (book) {
                Object.assign(book, {
                    name, content, category, keys, keysSecondary, selectiveLogic,
                    constant, useProbability, probability, priority, position, depth,
                    role, order, scanDepth, caseSensitive, matchWholeWords, group,
                    groupWeight, groupOverride, sticky, cooldown, delay,
                    excludeRecursion, preventRecursion, delayUntilRecursion
                });
            }
        } else {
            const newId = `wb_${Date.now()}`;
            db.worldBooks.push({
                id: newId,
                parentId: currentFolderId,
                type: 'entry',
                name,
                content,
                category,
                keys, keysSecondary, selectiveLogic,
                constant, useProbability, probability, priority, position, depth,
                role, order, scanDepth, caseSensitive, matchWholeWords, group,
                groupWeight, groupOverride, sticky, cooldown, delay,
                excludeRecursion, preventRecursion, delayUntilRecursion,
                entryType: 'normal',
                _wbV2: true
            });
            // 如果父文件夹是全局文件夹，自动绑定到所有角色和群组
            const parentFolder = db.worldBooks.find(wb => wb.id === currentFolderId);
            if (parentFolder && parentFolder.global) {
                db.characters.forEach(char => {
                    if (!char.worldBookIds) char.worldBookIds = [];
                    if (!char.worldBookIds.includes(newId)) char.worldBookIds.push(newId);
                });
                db.groups.forEach(group => {
                    if (!group.worldBookIds) group.worldBookIds = [];
                    if (!group.worldBookIds.includes(newId)) group.worldBookIds.push(newId);
                });
            }
        }
        // 先切换界面并提示，持久化放最后兜底：避免 saveData 在部分 WebView 上
        // 慢/失败时卡在创建页（条目其实已入内存库，表现为"点保存没反应"）
        renderWorldBookList();
        switchScreen('world-book-screen');
        showToast('世界书条目已保存');
        try {
            await saveData();
        } catch (err) {
            console.error('世界书条目持久化失败:', err);
            showToast('提示：条目已创建，但写入本地存储失败');
        }
    });

    // 点击世界书：先播翻封面动画，动画结束再进入（不再依赖长按）
    let wbFolderOpenTimer = null;
    worldBookListContainer.addEventListener('click', e => {
        const itemCard = e.target.closest('.wb-item-card');
        if (!itemCard) return;

        const id = itemCard.dataset.id;
        const item = db.worldBooks.find(wb => wb.id === id);
        if (!item) return;

        if (isWorldBookMultiSelectMode) {
            // 在多选模式下：
            // 1. 如果点击的是封面区域，或者是条目，则切换选中状态
            // 2. 如果点击的是世界书的其他区域（如名称），则进入该世界书
            if (e.target.closest('.wb-icon-wrapper') || item.type === 'entry') {
                toggleWorldBookSelection(id);
            } else if (item.type === 'folder') {
                wbPathStack.push({ id: item.id, name: item.name });
                renderWorldBookList();
            }
            return;
        }

        if (item.type === 'folder') {
            const book = itemCard.querySelector('.wb-book');
            if (book && worldBookListContainer.classList.contains('grid-view') && !wbFolderOpenTimer) {
                book.classList.add('is-open');
                wbFolderOpenTimer = setTimeout(() => {
                    wbFolderOpenTimer = null;
                    wbPathStack.push({ id: item.id, name: item.name });
                    renderWorldBookList();
                }, 520);
            } else {
                wbPathStack.push({ id: item.id, name: item.name });
                renderWorldBookList();
            }
            return;
        }

        // 编辑模式：点条目直接进编辑页（返回后仍保持编辑模式，直到再点右上角铅笔退出）
        if (wbEntryEditMode && item.type === 'entry') {
            openWorldBookEditor(item);
            return;
        }

        // 全局世界书条目：点开关切换启用/停用（停用后角色不读取该条目）
        const switchEl = e.target.closest('.wb-entry-switch');
        if (switchEl) {
            const target = db.worldBooks.find(wb => wb.id === id);
            if (target) {
                const turningOn = target.enabled === false || target.disable === true;
                target.enabled = turningOn;
                target.disable = !turningOn;
                switchEl.classList.toggle('on', turningOn);
                saveData().catch(err => console.error('世界书条目开关持久化失败:', err));
            }
            return;
        }

        // 条目：点其他地方展开/收起具体内容
        if (itemCard.classList.contains('wb-entry-row')) {
            itemCard.classList.toggle('open');
            return;
        }

        openWorldBookEditor(item);
    });

    // 长按进入多选（翻开封面动画已改为点击触发，不再由 touchstart 驱动）
    let wbLongPressTimer;
    worldBookListContainer.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.wb-item-card');
        if (!item) return;
        wbLongPressTimer = setTimeout(() => {
            enterWorldBookMultiSelectMode(item.dataset.id);
        }, 600);
    });
    worldBookListContainer.addEventListener('touchend', () => { clearTimeout(wbLongPressTimer); });
    worldBookListContainer.addEventListener('touchmove', () => { clearTimeout(wbLongPressTimer); });
    worldBookListContainer.addEventListener('touchcancel', () => { clearTimeout(wbLongPressTimer); });

    document.getElementById('delete-selected-world-books-btn').addEventListener('click', deleteSelectedWorldBooks);
    document.getElementById('move-selected-world-books-btn').addEventListener('click', moveSelectedWorldBooksToTarget);
    document.getElementById('cancel-wb-multi-select-btn').addEventListener('click', exitWorldBookMultiSelectMode);

    // 全局世界书条目页右上角编辑图标：切换编辑模式
    const entryEditModeBtn = document.getElementById('wb-entry-editmode-btn');
    if (entryEditModeBtn) {
        entryEditModeBtn.addEventListener('click', () => {
            wbEntryEditMode = !wbEntryEditMode;
            entryEditModeBtn.classList.toggle('active', wbEntryEditMode);
            renderWorldBookList();
        });
    }

    // 整本酒馆进阶（批量设置）
    const batchAdvItem = document.getElementById('wb-menu-batch-adv');
    if (batchAdvItem) {
        batchAdvItem.addEventListener('click', (e) => {
            e.stopPropagation();
            newMenu.style.display = 'none';
            openWorldBookBatchModal();
        });
    }
    const batchCloseBtn = document.getElementById('wb-batch-cancel-btn');
    if (batchCloseBtn) batchCloseBtn.addEventListener('click', closeWorldBookBatchModal);
    const batchApplyBtn = document.getElementById('wb-batch-apply-btn');
    if (batchApplyBtn) batchApplyBtn.addEventListener('click', applyWorldBookBatch);
    const batchOverlay = document.getElementById('wb-batch-adv-modal');
    if (batchOverlay) {
        batchOverlay.addEventListener('click', e => {
            if (e.target === batchOverlay) closeWorldBookBatchModal();
        });
    }

}

function renderWorldBookList() {
    const container = document.getElementById('world-book-list-container');
    const currentFolder = wbPathStack[wbPathStack.length - 1];
    const atRoot = currentFolder.id === null;

    // 更新标题
    document.getElementById('world-book-title').textContent = atRoot ? '世界书' : currentFolder.name;

    // 新建菜单：第一页只能新建世界书，进入世界书之后才能新建条目/批量设置
    const newBookItem = document.getElementById('wb-menu-new-folder');
    const newEntryItem = document.getElementById('wb-menu-new-entry');
    const importTxtItem = document.getElementById('wb-menu-import-txt');
    const batchAdvMenuItem = document.getElementById('wb-menu-batch-adv');
    const editFolderMenuItem = document.getElementById('wb-menu-edit-folder');
    if (newBookItem) newBookItem.style.display = atRoot ? 'block' : 'none';
    if (newEntryItem) newEntryItem.style.display = atRoot ? 'none' : 'block';
    if (editFolderMenuItem) editFolderMenuItem.style.display = atRoot ? 'none' : 'block';
    if (importTxtItem) importTxtItem.style.display = 'block';
    if (batchAdvMenuItem) batchAdvMenuItem.style.display = atRoot ? 'none' : 'block';

    // 排列方式切换、搜索图标只在世界书首页可用
    const viewToggleBtn = document.getElementById('world-book-view-toggle-btn');
    if (viewToggleBtn) viewToggleBtn.style.display = atRoot ? 'flex' : 'none';
    const searchToggleBtn = document.getElementById('wb-search-toggle-btn');
    if (searchToggleBtn) searchToggleBtn.style.display = atRoot ? 'flex' : 'none';

    // 进入世界书条目页：右上角显示编辑图标（进入后点条目直接编辑）；回到根目录退出编辑模式
    const entryEditModeBtn = document.getElementById('wb-entry-editmode-btn');
    if (entryEditModeBtn) {
        entryEditModeBtn.style.display = atRoot ? 'none' : 'flex';
        if (atRoot) {
            wbEntryEditMode = false;
            entryEditModeBtn.classList.remove('active');
        }
    }

    // 进入世界书后清掉首页遗留的搜索状态
    if (!atRoot && wbSearchQuery) {
        wbSearchQuery = '';
        const wbSearchInput = document.getElementById('wb-search-input');
        const wbSearchBar = document.getElementById('wb-search-bar');
        if (wbSearchInput) wbSearchInput.value = '';
        if (wbSearchBar) wbSearchBar.style.display = 'none';
        document.getElementById('world-book-screen')?.classList.remove('wb-searching');
    }

    // 首页搜索：世界书名称 + 条目名称（附带所在世界书路径，用于定位）
    const q = wbSearchQuery.trim().toLowerCase();
    const wbPathOf = item => {
        const parts = [];
        let pid = item.parentId;
        while (pid) {
            const parent = db.worldBooks.find(w => w.id === pid);
            if (!parent) break;
            parts.unshift(parent.name);
            pid = parent.parentId;
        }
        return parts.join(' / ');
    };
    let currentItems;
    if (q && atRoot) {
        currentItems = db.worldBooks
            .filter(item => String(item.name || '').toLowerCase().includes(q))
            .map(item => ({ ...item, _wbPath: wbPathOf(item) }));
    } else {
        currentItems = db.worldBooks.filter(item => {
            if (atRoot) return !item.parentId && item.type === 'folder';
            return item.parentId === currentFolder.id;
        });
    }

    document.getElementById('no-world-books-placeholder').style.display = currentItems.length === 0 ? 'block' : 'none';
    // 搜索无结果时给个明确的提示语
    const phEl = document.getElementById('no-world-books-placeholder');
    phEl.innerHTML = q
        ? '<p>没有找到与「' + wbEscape(wbSearchQuery.trim()) + '」匹配的世界书或条目</p>'
        : '<p>你的世界一片混沌...</p><p>点击右上角的"+"创造第一个设定吧！</p>';
    container.innerHTML = '';

    // 世界书内部：条目横排成列表
    if (!atRoot) {
        container.className = 'wb-rows-view';
        currentItems.forEach(item => container.appendChild(buildWorldBookRow(item)));
        return;
    }

    container.className = wbViewMode === 'grid' ? 'grid-view' : 'list-view';

    currentItems.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'wb-item-card';
        card.dataset.id = item.id;
        if (isWorldBookMultiSelectMode) {
            card.classList.add('is-selecting');
            if (selectedWorldBookIds.has(item.id)) card.classList.add('selected');
        }

        const globalBadge = (item.type === 'folder' && item.global) ? '<span class="wb-global-badge">全局</span>' : '';

        // 搜索到的条目单独用扁平卡片展示，并标出它所在的世界书
        if (q && item.type === 'entry') {
            card.classList.add('wb-search-entry-card');
            card.innerHTML = `
                <div class="wb-search-entry-name">${wbEscape(item.name)}</div>
                <div class="wb-search-path">${wbEscape(item._wbPath || '')}</div>
            `;
            container.appendChild(card);
            return;
        }

        // 书本结构：封面保留手账本配色，悬停/按住时翻开，内页（浅色同色系）显示世界书名称
        card.innerHTML = `
            <div class="wb-book wb-page-${idx % 6}">
                <div class="wb-book-page"><span class="wb-book-page-title">${wbEscape(item.name)}</span></div>
                <div class="wb-icon-wrapper wb-cover wb-cover-${idx % 6}${item.cover ? ' has-custom-cover' : ''}">
                    <div class="wb-cover-image"></div>
                    <span class="wb-cover-top">NOTE BOOK</span>
                </div>
            </div>
            <div class="wb-item-name">${wbEscape(item.name)}${globalBadge}</div>
            ${q && item._wbPath ? `<div class="wb-search-path">${wbEscape(item._wbPath)}</div>` : ''}
        `;
        const coverEl = card.querySelector('.wb-cover-image');
        if (coverEl && item.cover) coverEl.style.backgroundImage = `url("${item.cover}")`;
        
        container.appendChild(card);
    });
}

/** 世界书内部的一条条目（横排，可展开查看内容） */
function buildWorldBookRow(item) {
    const row = document.createElement('div');
    row.className = 'wb-item-card wb-entry-row';
    row.dataset.id = item.id;
    if (isWorldBookMultiSelectMode) {
        row.classList.add('is-selecting');
        if (selectedWorldBookIds.has(item.id)) row.classList.add('selected');
    }

    if (item.type === 'folder') {
        row.classList.add('is-folder-row');
        row.innerHTML = `
            <div class="wb-entry-main">
                <div class="wb-entry-title"><span class="wb-entry-name">${wbEscape(item.name)}</span></div>
            </div>
            <span class="wb-entry-arrow">›</span>
        `;
        return row;
    }

    const preview = String(item.content || '').replace(/\s+/g, ' ').trim();
    // 全局世界书里的条目：右侧是启用/停用开关；其他世界书条目右侧不放按钮（编辑统一走右上角铅笔）
    const inGlobal = !!hasGlobalAncestor(item.id);
    const sideControl = inGlobal ? `
        <button type="button" class="wb-entry-switch${item.enabled === false || item.disable === true ? '' : ' on'}" aria-label="启用条目"><span class="wb-entry-switch-knob"></span></button>
    ` : '';
    row.innerHTML = `
        <div class="wb-entry-main">
            <div class="wb-entry-title">
                <span class="wb-entry-name">${wbEscape(item.name)}</span>
                ${item.category ? `<span class="wb-entry-cat">${wbEscape(item.category)}</span>` : ''}
            </div>
            <div class="wb-entry-preview">${wbEscape(preview)}</div>
        </div>
        ${sideControl}
        <span class="wb-entry-arrow">⌄</span>
        <div class="wb-entry-body"><div class="wb-entry-content">${wbEscape(item.content || '')}</div></div>
    `;
    return row;
}

// 条目编辑页：按注入位置/概率开关显示或隐藏对应字段
function wbToggleEntryFormSections() {
    const pos = document.querySelector('input[name="world-book-position"]:checked');
    const isChat = pos && pos.value === '4';
    const depthGroup = document.getElementById('wb-depth-group');
    const roleGroup = document.getElementById('wb-role-group');
    if (depthGroup) depthGroup.style.display = isChat ? 'block' : 'none';
    if (roleGroup) roleGroup.style.display = isChat ? 'block' : 'none';
    const probToggle = document.getElementById('world-book-prob-toggle');
    const probGroup = document.getElementById('wb-prob-group');
    if (probGroup) probGroup.style.display = (probToggle && probToggle.checked) ? 'block' : 'none';
}

/** 打开条目的编辑页 */
function openWorldBookEditor(item) {
    currentEditingWorldBookId = item.id;
    const worldBookIdInput = document.getElementById('world-book-id');
    const worldBookNameInput = document.getElementById('world-book-name');
    const worldBookContentInput = document.getElementById('world-book-content');
    worldBookIdInput.value = item.id;
    worldBookNameInput.value = item.name;
    worldBookContentInput.value = item.content;
    document.getElementById('world-book-category').value = item.category || '';
    document.getElementById('world-book-keys').value = item.keys || '';
    document.getElementById('world-book-keys-secondary').value = item.keysSecondary || '';
    document.getElementById('world-book-selective-logic').value = String(item.selectiveLogic === undefined ? 0 : item.selectiveLogic);
    document.getElementById('world-book-constant').checked = !!item.constant;
    document.getElementById('world-book-prob-toggle').checked = !!item.useProbability;
    document.getElementById('world-book-probability').value = item.probability !== undefined ? item.probability : 100;
    document.getElementById('world-book-priority').value = item.priority || 'medium';

    // 位置：0 系统提示词区 / 4 插入聊天记录
    const posNum = (typeof wbToNum === 'function') ? wbToNum(item.position, 0) : (parseInt(item.position, 10) || 0);
    const positionValue = posNum === 4 ? '4' : '0';
    const positionRadio = document.querySelector(`input[name="world-book-position"][value="${positionValue}"]`);
    if (positionRadio) positionRadio.checked = true;

    document.getElementById('world-book-depth').value = item.depth !== undefined ? item.depth : 4;
    document.getElementById('world-book-role').value = String(item.role === undefined ? 0 : item.role);
    document.getElementById('world-book-order').value = item.order !== undefined ? item.order : 100;
    document.getElementById('world-book-scan-depth').value = item.scanDepth == null ? '' : item.scanDepth;
    document.getElementById('world-book-case').checked = !!item.caseSensitive;
    document.getElementById('world-book-whole-words').checked = item.matchWholeWords !== false;
    document.getElementById('world-book-group').value = item.group || '';
    document.getElementById('world-book-group-weight').value = item.groupWeight !== undefined ? item.groupWeight : 100;
    document.getElementById('world-book-group-override').checked = !!item.groupOverride;
    document.getElementById('world-book-sticky').value = item.sticky !== undefined ? item.sticky : 0;
    document.getElementById('world-book-cooldown').value = item.cooldown !== undefined ? item.cooldown : 0;
    document.getElementById('world-book-delay').value = item.delay !== undefined ? item.delay : 0;
    document.getElementById('world-book-exclude-recursion').checked = !!item.excludeRecursion;
    document.getElementById('world-book-prevent-recursion').checked = !!item.preventRecursion;
    document.getElementById('world-book-delay-until-recursion').checked = !!item.delayUntilRecursion;

    if (typeof wbToggleEntryFormSections === 'function') wbToggleEntryFormSections();

    switchScreen('edit-world-book-screen');
}

function renderCategorizedWorldBookList(container, books, selectedIds, idPrefix) {
    container.innerHTML = '';
    // 仅显示条目，不显示文件夹
    const entries = books.filter(b => b.type === 'entry');
    
    if (!entries || entries.length === 0) {
        container.innerHTML = '<li style="color: #888; text-align: center; padding: 15px;">暂无世界书条目</li>';
        return;
    }

    const groupedBooks = entries.reduce((acc, book) => {
        const category = book.category || '未分类';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(book);
        return acc;
    }, {});

    const sortedCategories = Object.keys(groupedBooks).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return a.localeCompare(b);
    });

    sortedCategories.forEach(category => {
        const categoryBooks = groupedBooks[category];
        const allInCategorySelected = categoryBooks.every(book => selectedIds.includes(book.id));

        const groupEl = document.createElement('div');
        groupEl.className = 'world-book-category-group';

        groupEl.innerHTML = `
            <div class="world-book-category-header">
                <input type="checkbox" class="category-checkbox" ${allInCategorySelected ? 'checked' : ''}>
                <span class="category-name">${category}</span>
                <span class="category-arrow">▼</span>
            </div>
            <ul class="world-book-items-list">
                ${categoryBooks.map(book => {
                    const isChecked = selectedIds.includes(book.id);
                    return `
                        <li class="world-book-select-item">
                            <input type="checkbox" class="item-checkbox" id="${idPrefix}-${book.id}" value="${book.id}" ${isChecked ? 'checked' : ''}>
                            <label for="${idPrefix}-${book.id}">${book.name}</label>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
        container.appendChild(groupEl);
    });

    container.querySelectorAll('.world-book-category-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return; 
            const group = header.closest('.world-book-category-group');
            group.classList.toggle('open');
        });
    });

    container.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const group = e.target.closest('.world-book-category-group');
            const itemCheckboxes = group.querySelectorAll('.item-checkbox');
            itemCheckboxes.forEach(itemCb => {
                itemCb.checked = e.target.checked;
            });
        });
    });

    container.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const group = e.target.closest('.world-book-category-group');
            const categoryCheckbox = group.querySelector('.category-checkbox');
            const allItems = group.querySelectorAll('.item-checkbox');
            const allChecked = Array.from(allItems).every(item => item.checked);
            categoryCheckbox.checked = allChecked;
        });
    });
}

// --- 全屏世界书选择器逻辑 ---
let selectorPathStack = [{ id: null, name: '根目录' }];
let tempSelectedWbIds = new Set();

// 全局世界书条目始终绑定所有角色/群组：保存选择时强制并入，防止被选择器保存操作挤掉
function mergeGlobalWbEntryIds(ids) {
    const merged = new Set(ids || []);
    db.worldBooks.forEach(wb => {
        if (wb && wb.type === 'folder' && wb.global) {
            getFolderEntryIds(wb.id).forEach(id => merged.add(id));
        }
    });
    return Array.from(merged);
}

function openWorldBookSelector(initialSelectedIds) {
    selectorPathStack = [{ id: null, name: '根目录' }];
    tempSelectedWbIds = new Set(initialSelectedIds || []);
    
    document.getElementById('world-book-selection-modal').classList.add('visible');
    renderWorldBookSelectorList();
}

function closeWorldBookSelector() {
    document.getElementById('world-book-selection-modal').classList.remove('visible');
}

function renderWorldBookSelectorList() {
    const container = document.getElementById('world-book-selection-list');
    const currentFolder = selectorPathStack[selectorPathStack.length - 1];
    
    // 更新面包屑
    const breadcrumb = document.getElementById('wb-selector-breadcrumb');
    const backBtn = document.getElementById('wb-selector-back-folder-btn');
    const currentName = document.getElementById('wb-selector-current-folder-name');
    
    if (selectorPathStack.length > 1) {
        backBtn.style.display = 'flex';
        currentName.textContent = currentFolder.name;
    } else {
        backBtn.style.display = 'none';
        currentName.textContent = '根目录';
    }

    // 过滤当前层级内容：根目录只显示世界书文件（文件夹），条目一律进入文件内部再勾选
    const currentItems = db.worldBooks.filter(item => {
        if (currentFolder.id === null) {
            return !item.parentId && item.type === 'folder';
        }
        return item.parentId === currentFolder.id;
    });

    container.innerHTML = '';

    if (currentItems.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888; font-size: 14px;">文件夹为空</div>';
        return;
    }

    // 递归收集文件夹内所有条目 id（用于全选/半选判断）
    const getAllChildEntries = (folderId) => {
        let entries = [];
        db.worldBooks.forEach(wb => {
            if (wb.parentId === folderId) {
                if (wb.type === 'entry') entries.push(wb.id);
                else if (wb.type === 'folder') entries = entries.concat(getAllChildEntries(wb.id));
            }
        });
        return entries;
    };

    // 根目录：全局世界书置顶展示（全局书自动绑定所有角色/群组，此处不可选择或修改）
    const sortedItems = (currentFolder.id === null && currentItems.length > 0)
        ? [...currentItems].sort((a, b) => ((b.global === true) ? 1 : 0) - ((a.global === true) ? 1 : 0))
        : currentItems;

    sortedItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'wb-selector-row';

        const isFolder = item.type === 'folder';
        const isGlobalBook = isFolder && item.global === true;

        let iconSvg = '';
        if (isFolder) {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707z"/></svg>`;
        } else {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M6 11.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg>`;
        }

        // 右侧控件：全局书无开关（不可动）；其余为滑动开关
        let rightContent = '';
        if (isGlobalBook) {
            rightContent = `
                <span class="wb-selector-global-badge">全局</span>
                <div class="wb-selector-arrow"></div>
            `;
        } else {
            let isOn;
            if (isFolder) {
                const childEntryIds = getAllChildEntries(item.id);
                isOn = childEntryIds.length > 0 && childEntryIds.every(id => tempSelectedWbIds.has(id));
            } else {
                isOn = tempSelectedWbIds.has(item.id);
            }
            rightContent = `
                <button type="button" class="wb-entry-switch${isOn ? ' on' : ''}" data-role="wb-select-switch"><span class="wb-entry-switch-knob"></span></button>
                ${isFolder ? '<div class="wb-selector-arrow"></div>' : ''}
            `;
        }

        row.innerHTML = `
            <div class="wb-selector-icon">${iconSvg}</div>
            <div class="wb-selector-name">${item.name}</div>
            ${rightContent}
        `;
        if (isGlobalBook) row.classList.add('is-global-row');

        row.addEventListener('click', (e) => {
            // 全局世界书：不可在此选择/修改
            if (isGlobalBook) return;

            const switchEl = e.target.closest('.wb-entry-switch');
            if (isFolder) {
                if (switchEl) {
                    // 开关：整本世界书全部条目一起开/关
                    const childEntryIds = getAllChildEntries(item.id);
                    const turningOn = !switchEl.classList.contains('on');
                    childEntryIds.forEach(id => {
                        if (turningOn) tempSelectedWbIds.add(id);
                        else tempSelectedWbIds.delete(id);
                    });
                    switchEl.classList.toggle('on', turningOn);
                } else {
                    // 点击其他区域进入该世界书
                    selectorPathStack.push({ id: item.id, name: item.name });
                    renderWorldBookSelectorList();
                }
            } else {
                // 条目：点击行切换该条目的开关
                const turningOn = !tempSelectedWbIds.has(item.id);
                if (turningOn) tempSelectedWbIds.add(item.id);
                else tempSelectedWbIds.delete(item.id);
                const sw = row.querySelector('.wb-entry-switch');
                if (sw) sw.classList.toggle('on', turningOn);
            }
        });

        container.appendChild(row);
    });
}

// 绑定选择器事件
document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('wb-selector-back-folder-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (selectorPathStack.length > 1) {
                selectorPathStack.pop();
                renderWorldBookSelectorList();
            }
        });
    }

    const cancelBtn = document.getElementById('cancel-world-book-selection-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeWorldBookSelector);
    }
});
