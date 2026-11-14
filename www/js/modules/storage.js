// --- 存储分析与数据管理 (js/modules/storage.js) ---

const STORAGE_CATEGORIES = [
    { key: 'chats', name: '聊天记录', desc: '所有对话历史' },
    { key: 'contacts', name: '角色设定', desc: '联系人及角色卡片' },
    { key: 'worldbooks', name: '世界书', desc: '世界书条目数据' },
    { key: 'personas', name: '用户设定', desc: '用户人设数据' },
    { key: 'wallpapers', name: '壁纸与外观', desc: '自定义壁纸、主题、表情包' },
    { key: 'fonts', name: '字体', desc: '自定义字体文件' },
    { key: 'settings', name: '基础设置', desc: 'API配置、UI偏好等' },
    { key: 'xApp', name: '推特APP', desc: 'X社交应用数据（自定义头像等）' },
    { key: 'instagram', name: 'Instagram', desc: 'Instagram应用数据（帖子、相册、评论等）' },
    { key: 'other', name: '生图缓存', desc: '相册、工坊生图、阅读插图等' }
];

let currentStorageSizes = {};
let selectedModules = {
    chats: true,
    contacts: true,
    worldbooks: true,
    personas: true,
    wallpapers: true,
    fonts: true,
    settings: true,
    xApp: true,
    instagram: true
};

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function stringifySize(obj) {
    try {
        return obj ? JSON.stringify(obj).length : 0;
    } catch (e) {
        return 0;
    }
}

async function calculateStorageSize() {
    let sizes = {
        chats: 0,
        contacts: 0,
        worldbooks: 0,
        personas: 0,
        wallpapers: 0,
        fonts: 0,
        settings: 0,
        xApp: 0,
        instagram: 0,
        other: 0,
        total: 0
    };

    if (!db || !db.characters) await loadData();

    // 1. chats & contacts & other(gallery)
    (db.characters || []).forEach(char => {
        sizes.chats += stringifySize(char.history);
        sizes.chats += stringifySize(char.callHistory);
        sizes.other += stringifySize(char.gallery);
        
        const charBase = { ...char, history: undefined, callHistory: undefined, gallery: undefined };
        sizes.contacts += stringifySize(charBase);
    });
    (db.groups || []).forEach(group => {
        sizes.chats += stringifySize(group.history);
        sizes.chats += stringifySize(group.callHistory);
        
        const groupBase = { ...group, history: undefined, callHistory: undefined };
        sizes.contacts += stringifySize(groupBase);
    });

    // 2. worldbooks
    sizes.worldbooks += stringifySize(db.worldBooks);

    // 3. personas
    sizes.personas += stringifySize(db.myPersonaPresets);
    sizes.personas += stringifySize(db.homeSignature);
    sizes.personas += stringifySize(db.activePersonaId);

    // 4. wallpapers
    sizes.wallpapers += stringifySize(db.wallpaper);
    sizes.wallpapers += stringifySize(db.bubbleCssPresets);
    sizes.wallpapers += stringifySize(db.globalCss);
    sizes.wallpapers += stringifySize(db.globalCssPresets);
    sizes.wallpapers += stringifySize(db.myStickers);
    sizes.wallpapers += stringifySize(db.moreProfileCardBg);
    sizes.wallpapers += stringifySize(db.themeSettings);
    sizes.wallpapers += stringifySize(db.themePresets);

    // 5. fonts
    sizes.fonts += stringifySize(db.fontUrl);
    sizes.fonts += stringifySize(db.fontPresets);

    // 6. settings
    const settingsKeys = [
        'apiSettings', 'apiPresets', 'cotSettings', 'cotPresets', 'homeScreenMode', 
        'customIcons', 'insWidgetSettings', 'homeWidgetSettings', 'chatFolders', 
        'fontSizeScale', 'savedKeyboardHeight', 'statusBarPresets', 'globalSendSound', 
        'globalReceiveSound', 'multiMsgSoundEnabled', 'soundPresets', 'galleryPresets', 
        'hasSeenVideoCallDisclaimer', 'hasSeenVideoCallAvatarHint', 'workshopSettings', 
        'workshopLlmPresets', 'workshopPromptPresets', 'homeLayoutOrder', 'homeLayoutPages', 
        'widgetTemplates', 'addedWidgets', 'backupReminderSettings', 'stUnlocked'
    ];
    settingsKeys.forEach(key => {
        sizes.settings += stringifySize(db[key]);
    });

    // 7. xApp (推特)
    sizes.xApp += stringifySize(db.xAvatarSettings);

    // 8. instagram
    const igKeys = ['igProfile', 'igCharProfiles', 'igCommentSettings', 'igCharPostSettings', 'igCharGalleries', 'igCharPosts', 'igAutoPostPlan', 'igFollowState'];
    igKeys.forEach(key => {
        sizes.instagram += stringifySize(db[key]);
    });

    // 9. other (Dexie)
    try {
        if (dexieDB) {
            const workshopItems = await dexieDB.workshopHistory.toArray();
            workshopItems.forEach(item => sizes.other += stringifySize(item));
            
            const vibeItems = await dexieDB.workshopVibeGroups.toArray();
            vibeItems.forEach(item => sizes.other += stringifySize(item));
            
            const photoItems = await dexieDB.characterPhotos.toArray();
            photoItems.forEach(item => sizes.other += stringifySize(item));
            if (dexieDB.povSnaps) {
                const snapItems = await dexieDB.povSnaps.toArray();
                snapItems.forEach(item => sizes.other += stringifySize(item));
            }
            
            if (dexieDB.reader_comments) {
                const comments = await dexieDB.reader_comments.toArray();
                comments.forEach(item => sizes.other += stringifySize(item));
            }
            
            if (dexieDB.customFonts) {
                const fonts = await dexieDB.customFonts.toArray();
                fonts.forEach(font => {
                    if (font.file && font.file.size) {
                        sizes.fonts += font.file.size;
                    }
                });
            }
        }
    } catch (e) {
        console.warn("Could not calculate dexie data size:", e);
    }

    sizes.total = Object.keys(sizes).reduce((sum, key) => key !== 'total' ? sum + sizes[key] : sum, 0);
    return sizes;
}

function renderStorageUI() {
    const totalEl = document.getElementById('storage-total-size');
    const barChart = document.getElementById('storage-bar-chart');
    const legendContainer = document.getElementById('storage-legend-container');
    const backupOptions = document.getElementById('storage-backup-options');

    if (!totalEl || !barChart || !legendContainer || !backupOptions) return;

    totalEl.textContent = formatBytes(currentStorageSizes.total);

    // Render Bar Chart
    barChart.innerHTML = '';
    STORAGE_CATEGORIES.forEach(cat => {
        const size = currentStorageSizes[cat.key] || 0;
        if (size > 0 && currentStorageSizes.total > 0) {
            const percentage = (size / currentStorageSizes.total) * 100;
            const segment = document.createElement('div');
            segment.className = `storage-segment ${cat.key}`;
            segment.style.width = `${percentage}%`;
            barChart.appendChild(segment);
        }
    });

    // Render Legend
    legendContainer.innerHTML = '';
    STORAGE_CATEGORIES.forEach(cat => {
        const size = currentStorageSizes[cat.key] || 0;
        legendContainer.innerHTML += `
            <div class="storage-legend-item">
                <div class="storage-legend-color ${cat.key}"></div>
                <div class="storage-legend-info">
                    <span class="storage-legend-name">${cat.name}</span>
                    <span class="storage-legend-size">${formatBytes(size)}</span>
                </div>
            </div>
        `;
    });

    // Render Backup Options
    backupOptions.innerHTML = '';
    STORAGE_CATEGORIES.forEach(cat => {
        if (cat.key === 'other') return; // 不在备份选项中显示其他缓存
        const size = currentStorageSizes[cat.key] || 0;
        const isChecked = selectedModules[cat.key] ? 'checked' : '';
        backupOptions.innerHTML += `
            <div class="storage-setting-item">
                <div class="storage-setting-info">
                    <span class="storage-setting-name">${cat.name}</span>
                    <span class="storage-setting-desc">${cat.desc} (${formatBytes(size)})</span>
                </div>
                <label class="kkt-switch">
                    <input type="checkbox" class="backup-module-checkbox" data-key="${cat.key}" ${isChecked}>
                    <span class="kkt-slider"></span>
                </label>
            </div>
        `;
    });
    
    backupOptions.innerHTML += `
        <div style="font-size: 12px; color: #888; margin-top: 15px; text-align: center;">
            * 注：为避免备份文件过大导致崩溃，相册、工坊历史等包含大量图片的本地缓存数据不参与导出。
        </div>
    `;

    // Bind Checkbox Events
    document.querySelectorAll('.backup-module-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            selectedModules[e.target.dataset.key] = e.target.checked;
            updateSelectAllBtn();
        });
    });
    updateSelectAllBtn();
}

function updateSelectAllBtn() {
    const btn = document.getElementById('storage-select-all-btn');
    if (!btn) return;
    const allSelected = Object.values(selectedModules).every(v => v);
    btn.textContent = allSelected ? '全不选' : '全选';
}

function setupStorageAnalysisScreen() {
    const screen = document.getElementById('storage-analysis-screen');
    if (!screen) return;

    // 自愈：若注入markup缺失（用户设备缓存了旧版 storage_html.js 导致元素不全），重新注入
    if (!document.getElementById('storage-bar-chart') && typeof injectStorageHTML === 'function') {
        try { injectStorageHTML(); } catch (e) { console.error('storage markup re-inject failed:', e); }
    }

    // 启动即渲染备份选项列表（大小先按 0 显示，分析完成后刷新数字）。
    // 关键：不能等存储分析完成才渲染——部分设备（iOS WKWebView / file://）分析可能
    // 卡住或抛错，导致整个「备份选项」卡片内容空白、看起来像消失了。
    try { renderStorageUI(); } catch (e) { console.error('storage options initial render failed:', e); }

    const observer = new MutationObserver(async (mutations) => {
        if (screen.classList.contains('active')) {
            try {
                showToast('正在分析存储空间...');
                currentStorageSizes = await calculateStorageSize();
            } catch (e) {
                console.error('storage analysis failed:', e);
                showToast('存储分析出错：' + (e.message || '未知错误'));
            }
            // 无论分析成功失败，都要把选项列表和持久化卡片画出来
            try { renderStorageUI(); } catch (e) { console.error('renderStorageUI failed:', e); }
            try { updatePersistenceStatus(); } catch (e) { console.error('updatePersistenceStatus failed:', e); }
        }
    });

    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });

    // Select All Button
    const selectAllBtn = document.getElementById('storage-select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const allSelected = Object.values(selectedModules).every(v => v);
            const newValue = !allSelected;
            Object.keys(selectedModules).forEach(k => selectedModules[k] = newValue);
            renderStorageUI();
        });
    }

    // Export Button
    const exportBtn = document.getElementById('storage-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExport);
    }

    // Import Input
    const importInput = document.getElementById('storage-import-file');
    if (importInput) {
        importInput.addEventListener('change', handleImport);
    }

    // 单独备份：世界书 / 主屏幕美化
    const wbExportBtn = document.getElementById('wb-solo-export-btn');
    if (wbExportBtn) wbExportBtn.addEventListener('click', handleWorldBookExport);
    const wbImportBtn = document.getElementById('wb-solo-import-btn');
    const wbImportInput = document.getElementById('wb-solo-import-file');
    if (wbImportBtn && wbImportInput) {
        wbImportBtn.addEventListener('click', () => wbImportInput.click());
        wbImportInput.addEventListener('change', handleWorldBookImport);
    }
    const hsExportBtn = document.getElementById('homestyle-solo-export-btn');
    if (hsExportBtn) hsExportBtn.addEventListener('click', handleHomeStyleExport);
    const hsImportBtn = document.getElementById('homestyle-solo-import-btn');
    const hsImportInput = document.getElementById('homestyle-solo-import-file');
    if (hsImportBtn && hsImportInput) {
        hsImportBtn.addEventListener('click', () => hsImportInput.click());
        hsImportInput.addEventListener('change', handleHomeStyleImport);
    }

    async function updatePersistenceStatus() {
        const statusContainer = document.getElementById('storage-persistence-container');
        if (!statusContainer) return;

        // 持久化卡片三种环境都要显示，不能因为 API 缺失就整卡消失：
        // ① 原生壳（MIE-APP / OctoNative）：数据存在应用沙盒，天然受系统保护
        // ② 浏览器且支持 navigator.storage：显示真实持久化状态，可手动申请
        // ③ 其他环境：只显示说明信息
        const cardShell = (statusHtml, btnHtml = '') => `
            <div style="padding: 14px 18px; background: linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 100%); border-radius: 26px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; border: none; box-shadow: 0 12px 32px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9);">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-weight: bold; font-size: 0.9rem; color: #000000;">持久化存储保护</div>
                    <div style="font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">${statusHtml}</div>
                </div>
                ${btnHtml}
            </div>`;

        // ① 原生应用（IPA）：沙盒存储，数据天然受保护
        if (window.OctoNative) {
            statusContainer.innerHTML = cardShell(
                '<span style="color: #51cf66;">已受保护 (原生应用沙盒存储)</span>'
            );
            return;
        }

        // ② 浏览器：支持持久化 API 才有状态和按钮
        if (navigator.storage && navigator.storage.persisted) {
            let isPersisted = false;
            try { isPersisted = await navigator.storage.persisted(); } catch (e) { /* file:// 等环境可能拒绝 */ }

            statusContainer.innerHTML = cardShell(
                isPersisted
                    ? '<span style="color: #51cf66;">已开启 (数据受保护)</span>'
                    : '<span style="color: #ff922b;">未开启 (容易被清理)</span>',
                isPersisted ? '' : '<button id="manual-persist-btn" class="storage-action-btn" style="width: auto; padding: 8px 18px; font-size: 0.85rem; border-radius: 999px; background: linear-gradient(180deg, #ffffff 0%, #f7f7fb 100%); border: none; color: #000000; box-shadow: 0 8px 20px rgba(0,0,0,0.08), 0 2px 5px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.95);">立即开启</button>'
            );

            const btn = document.getElementById('manual-persist-btn');
            if (btn) {
                btn.onclick = async () => {
                    try {
                        const persisted = await navigator.storage.persist();
                        if (persisted) {
                            showToast("已成功开启持久化存储！");
                        } else {
                            showToast("开启失败，可能是浏览器策略限制。");
                        }
                    } catch (e) {
                        showToast("当前环境不支持开启持久化存储。");
                    }
                    updatePersistenceStatus();
                };
            }
            return;
        }

        // ③ 其他环境：至少给出说明，卡片不再凭空消失
        statusContainer.innerHTML = cardShell(
            '<span style="color: #8e8e93;">数据保存在应用沙盒内</span>'
        );
    }

    // 启动时也渲染一次持久化卡片（不等页面打开）
    try { updatePersistenceStatus(); } catch (e) { /* 忽略 */ }
}

// --- 导出逻辑 ---
async function handleExport() {
    if (!Object.values(selectedModules).some(v => v)) {
        showToast('请至少选择一项要导出的数据');
        return;
    }

    const exportBtn = document.getElementById('storage-export-btn');
    const exportText = document.getElementById('storage-export-text');
    exportBtn.disabled = true;
    exportText.textContent = '处理中...';

    try {
        let exportData = {
            version: appVersion,
            timestamp: new Date().toISOString(),
            modules: {}
        };

        // 1. Chats & Contacts
        if (selectedModules.chats || selectedModules.contacts) {
            exportData.modules.characters = [];
            exportData.modules.groups = [];

            db.characters.forEach(char => {
                let exportChar = { ...char };
                if (!selectedModules.chats) {
                    exportChar.history = [];
                    exportChar.callHistory = [];
                }
                if (!selectedModules.contacts) {
                    // If only exporting chats, we still need basic info to identify the char
                    exportChar = { id: char.id, name: char.name, history: char.history, callHistory: char.callHistory };
                }
                // 始终不导出 gallery
                exportChar.gallery = [];
                exportData.modules.characters.push(exportChar);
            });

            db.groups.forEach(group => {
                let exportGroup = { ...group };
                if (!selectedModules.chats) {
                    exportGroup.history = [];
                    exportGroup.callHistory = [];
                }
                if (!selectedModules.contacts) {
                    exportGroup = { id: group.id, name: group.name, history: group.history, callHistory: group.callHistory };
                }
                exportData.modules.groups.push(exportGroup);
            });
        }

        // 2. Worldbooks
        if (selectedModules.worldbooks) {
            exportData.modules.worldBooks = db.worldBooks;
        }

        // 3. Personas
        if (selectedModules.personas) {
            exportData.modules.myPersonaPresets = db.myPersonaPresets;
            exportData.modules.homeSignature = db.homeSignature;
            exportData.modules.activePersonaId = db.activePersonaId;
        }

        // 4. Wallpapers
        if (selectedModules.wallpapers) {
            exportData.modules.wallpaper = db.wallpaper;
            exportData.modules.bubbleCssPresets = db.bubbleCssPresets;
            exportData.modules.globalCss = db.globalCss;
            exportData.modules.globalCssPresets = db.globalCssPresets;
            exportData.modules.myStickers = db.myStickers;
            exportData.modules.moreProfileCardBg = db.moreProfileCardBg;
            exportData.modules.themeSettings = db.themeSettings;
            exportData.modules.themePresets = db.themePresets;
        }

        // 5. Fonts
        if (selectedModules.fonts) {
            exportData.modules.fontUrl = db.fontUrl;
            exportData.modules.fontPresets = db.fontPresets;
        }

        // 6. Settings
        if (selectedModules.settings) {
            const settingsKeys = [
                'apiSettings', 'apiPresets', 'cotSettings', 'cotPresets', 'homeScreenMode', 
                'customIcons', 'insWidgetSettings', 'homeWidgetSettings', 'chatFolders', 
                'fontSizeScale', 'savedKeyboardHeight', 'statusBarPresets', 'globalSendSound', 
                'globalReceiveSound', 'multiMsgSoundEnabled', 'soundPresets', 'galleryPresets', 
                'hasSeenVideoCallDisclaimer', 'hasSeenVideoCallAvatarHint', 'workshopSettings', 
                'workshopLlmPresets', 'workshopPromptPresets', 'homeLayoutOrder', 'homeLayoutPages', 
                'widgetTemplates', 'addedWidgets', 'backupReminderSettings', 'stUnlocked'
            ];
            settingsKeys.forEach(key => {
                exportData.modules[key] = db[key];
            });
        }

        // 7. X/Twitter APP
        if (selectedModules.xApp) {
            exportData.modules.xAvatarSettings = db.xAvatarSettings;
        }

        // 8. Instagram
        if (selectedModules.instagram) {
            const igExportKeys = ['igProfile', 'igCharProfiles', 'igCommentSettings', 'igCharPostSettings', 'igCharGalleries', 'igCharPosts', 'igAutoPostPlan', 'igFollowState'];
            igExportKeys.forEach(key => {
                exportData.modules[key] = db[key];
            });
        }

        const jsonString = JSON.stringify(exportData);
        const dataBlob = new Blob([jsonString]);
        
        try {
            const compressionStream = new CompressionStream('gzip');
            const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
            const compressedBlob = await new Response(compressedStream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();

            const fileName = `UwU_Backup_${new Date().toISOString().slice(0,10)}.ee`;
            let nativeSaved = false;
            if (window.OctoNative && typeof window.OctoNative.saveBackup === 'function') {
                nativeSaved = await window.OctoNative.saveBackup(fileName, compressedBlob);
            }
            if (!nativeSaved) {
                const url = URL.createObjectURL(compressedBlob);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", url);
                downloadAnchorNode.setAttribute("download", fileName);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                URL.revokeObjectURL(url);
                showToast('导出成功');
            } else {
                showToast('导出成功，在分享面板里选「存储到文件」即可存到手机');
            }
        } catch (compressError) {
            console.warn('压缩导出失败，尝试降级为未压缩导出:', compressError);
            // 降级为未压缩的 JSON 导出
            const jsonName = `UwU_Backup_${new Date().toISOString().slice(0,10)}.json`;
            let nativeSaved2 = false;
            if (window.OctoNative && typeof window.OctoNative.saveBackup === 'function') {
                nativeSaved2 = await window.OctoNative.saveBackup(jsonName, dataBlob);
            }
            if (!nativeSaved2) {
                const url = URL.createObjectURL(dataBlob);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", url);
                downloadAnchorNode.setAttribute("download", jsonName);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                URL.revokeObjectURL(url);
                showToast('导出成功 (未压缩)');
            } else {
                showToast('导出成功，在分享面板里选「存储到文件」即可存到手机');
            }
        }
    } catch (error) {
        console.error('导出失败:', error);
        showToast('导出失败，请重试');
    } finally {
        exportBtn.disabled = false;
        exportText.textContent = '导出备份';
    }
}

// --- 导入逻辑 ---
// 读取备份文件：不看扩展名，只看文件头，兼容 .ee / .json / 被改名的文件
// iOS 上 DecompressionStream 可用，老系统兜底用 pako
async function readBackupFile(file) {
    if (!file || file.size === 0) throw new Error('这个文件是空的');

    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const isGzip = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;

    if (!isGzip) {
        // 未压缩的 JSON（可能是 .json 备份，也可能只是改了后缀）
        return await file.text();
    }

    if (typeof DecompressionStream === 'function') {
        try {
            const ds = new DecompressionStream('gzip');
            const text = await new Response(file.stream().pipeThrough(ds)).text();
            if (text) return text;
        } catch (e) {
            console.warn('[备份] 系统解压失败，改用 pako 兜底', e);
        }
    }

    if (window.pako && typeof window.pako.ungzip === 'function') {
        const buf = new Uint8Array(await file.arrayBuffer());
        return window.pako.ungzip(buf, { to: 'string' });
    }

    throw new Error('这台设备不支持解压这个备份，请改用未压缩的 .json 备份');
}
window.readBackupFile = readBackupFile;

// ============================================================
// 选择性导入：自动检测备份内容 → 弹窗勾选 → 智能合并
// （不覆盖删除现有数据：角色/群聊按 ID 合并并保留聊天记录与相册）
// ============================================================
const IMPORT_SETTINGS_KEYS = [
    'apiSettings', 'apiPresets', 'cotSettings', 'cotPresets', 'homeScreenMode',
    'customIcons', 'insWidgetSettings', 'homeWidgetSettings', 'chatFolders',
    'fontSizeScale', 'savedKeyboardHeight', 'statusBarPresets', 'globalSendSound',
    'globalReceiveSound', 'multiMsgSoundEnabled', 'soundPresets', 'galleryPresets',
    'hasSeenVideoCallDisclaimer', 'hasSeenVideoCallAvatarHint', 'workshopSettings',
    'workshopLlmPresets', 'workshopPromptPresets', 'homeLayoutOrder', 'homeLayoutPages',
    'widgetTemplates', 'addedWidgets', 'backupReminderSettings', 'stUnlocked',
    'peekIconPresets'
];
const IMPORT_IG_KEYS = ['igProfile', 'igCharProfiles', 'igCommentSettings', 'igCharPostSettings', 'igCharGalleries', 'igCharPosts', 'igAutoPostPlan', 'igFollowState'];

// 旧版整包备份（_exportVersion !== '3.0'）兼容转换：重组分块聊天记录 + 世界书 position 迁移
function normalizeBackupToMods(data) {
    if (data.modules && typeof data.modules === 'object') return data.modules;  // 新版 .ee 模块备份
    if (data._exportVersion === '3.0') return data;                             // v3.0 整包备份，键名与 mods 兼容

    // 旧版整包备份
    const reassembleHistory = (chat) => {
        if (!chat.history || !Array.isArray(chat.history) || chat.history.length === 0) return [];
        if (typeof chat.history[0] === 'object' && chat.history[0] !== null) return chat.history;
        if (data.__chunks__ && typeof chat.history[0] === 'string') {
            let fullHistory = [];
            chat.history.forEach(key => {
                if (data.__chunks__[key]) {
                    try { fullHistory = fullHistory.concat(JSON.parse(data.__chunks__[key])); }
                    catch (e) { console.error('Failed to parse history chunk ' + key, e); }
                }
            });
            return fullHistory;
        }
        return [];
    };
    const newData = { ...data };
    if (newData.characters) newData.characters = newData.characters.map(char => ({ ...char, history: reassembleHistory(char) }));
    if (newData.groups) newData.groups = newData.groups.map(group => ({ ...group, history: reassembleHistory(group) }));
    if (Array.isArray(newData.worldBooks)) {
        newData.worldBooks = newData.worldBooks.map(item => {
            if (item.type === 'entry' && (item.position === 'middle' || item.position === 'center')) {
                return { ...item, position: 'before', depth: 300 };
            }
            return item;
        });
    }
    return newData;
}

// 自动检测备份里有什么
function detectImportItems(mods) {
    const has = k => mods[k] !== undefined;
    const len = k => Array.isArray(mods[k]) ? mods[k].length : 0;
    const historyMsgs = [].concat(mods.characters || [], mods.groups || [])
        .reduce((n, c) => n + (Array.isArray(c.history) ? c.history.length : 0), 0);
    return [
        { key: 'contacts', icon: '👤', name: '角色与群聊', count: len('characters') + len('groups'), unit: '个', detected: len('characters') + len('groups') > 0 },
        { key: 'chats', icon: '💬', name: '聊天记录', count: historyMsgs, unit: '条消息', detected: historyMsgs > 0 },
        { key: 'worldbooks', icon: '🌍', name: '世界书', count: len('worldBooks'), unit: '条', detected: len('worldBooks') > 0 },
        { key: 'personas', icon: '🪪', name: '用户设定', count: len('myPersonaPresets') || (has('homeSignature') ? 1 : 0), unit: '项', detected: len('myPersonaPresets') > 0 || has('homeSignature') },
        { key: 'wallpapers', icon: '🎨', name: '壁纸与外观', count: len('myStickers') + len('themePresets') + len('bubbleCssPresets'), unit: '项', detected: len('myStickers') > 0 || len('themePresets') > 0 || len('bubbleCssPresets') > 0 || has('wallpaper') },
        { key: 'fonts', icon: '🔤', name: '字体', count: len('fontPresets') || (has('fontUrl') ? 1 : 0), unit: '项', detected: len('fontPresets') > 0 || has('fontUrl') },
        { key: 'settings', icon: '⚙️', name: '基础设置（API / 桌面布局等）', count: IMPORT_SETTINGS_KEYS.filter(has).length, unit: '项', detected: IMPORT_SETTINGS_KEYS.some(has) },
        { key: 'xApp', icon: '🐦', name: '推特APP', count: has('xAvatarSettings') ? 1 : 0, unit: '项', detected: has('xAvatarSettings') },
        { key: 'instagram', icon: '📸', name: 'Instagram', count: IMPORT_IG_KEYS.filter(has).length, unit: '项', detected: IMPORT_IG_KEYS.some(has) }
    ];
}

// 按勾选执行合并（模块隔离：单个失败不影响其他，最后统一汇报 + 落盘校验）
async function executeImportMerge(mods, sel) {
    const importReport = { ok: [], fail: [] };
    const runModule = (name, fn) => {
        try {
            fn();
            importReport.ok.push(name);
        } catch (err) {
            console.error('[备份] 导入模块 ' + name + ' 失败:', err);
            importReport.fail.push(name + '：' + (err && err.message ? err.message.slice(0, 40) : '未知错误'));
        }
    };
    window.__importCounts = {};

    // 1. 角色 & 群聊（含聊天记录）
    if ((sel.chats || sel.contacts) && mods.characters) {
        runModule('联系人/聊天', () => {
            let added = 0, updated = 0;
            mods.characters.forEach(importedChar => {
                const existingCharIndex = db.characters.findIndex(c => c.id === importedChar.id);
                if (existingCharIndex !== -1) {
                    updated++;
                    let existingChar = db.characters[existingCharIndex];
                    if (sel.chats && importedChar.history) {
                        existingChar.history = importedChar.history;
                        existingChar.callHistory = importedChar.callHistory || [];
                    }
                    if (sel.contacts) {
                        const tempHistory = existingChar.history;
                        const tempCallHistory = existingChar.callHistory;
                        const tempGallery = existingChar.gallery;
                        Object.assign(existingChar, importedChar);
                        if (!sel.chats) {
                            existingChar.history = tempHistory;
                            existingChar.callHistory = tempCallHistory;
                        }
                        // 始终保留原有的 gallery
                        existingChar.gallery = tempGallery;
                    }
                } else {
                    added++;
                    db.characters.push(importedChar);
                }
            });
            window.__importCounts = { charsAdded: added, charsUpdated: updated };
        });
    }

    if ((sel.chats || sel.contacts) && mods.groups) {
        runModule('群聊', () => {
            let added = 0, updated = 0;
            mods.groups.forEach(importedGroup => {
                const existingGroupIndex = db.groups.findIndex(g => g.id === importedGroup.id);
                if (existingGroupIndex !== -1) {
                    updated++;
                    let existingGroup = db.groups[existingGroupIndex];
                    if (sel.chats && importedGroup.history) {
                        existingGroup.history = importedGroup.history;
                        existingGroup.callHistory = importedGroup.callHistory || [];
                    }
                    if (sel.contacts) {
                        const tempHistory = existingGroup.history;
                        const tempCallHistory = existingGroup.callHistory;
                        Object.assign(existingGroup, importedGroup);
                        if (!sel.chats) {
                            existingGroup.history = tempHistory;
                            existingGroup.callHistory = tempCallHistory;
                        }
                    }
                } else {
                    added++;
                    db.groups.push(importedGroup);
                }
            });
            if (window.__importCounts) window.__importCounts.groupsAdded = added;
        });
    }

    // 1.5 修复群聊 senderId 与成员 id 对不上的情况（老版本备份/跨设备备份常见）
    //     匹配链：'member_'+senderId / originalCharId / characterId / senderName → 重写为成员 id
    if ((sel.chats || sel.contacts) && mods.groups) {
        runModule('群聊成员修复', () => {
            let fixed = 0;
            mods.groups.forEach(group => {
                if (!group || !Array.isArray(group.members) || !Array.isArray(group.history)) return;
                const memberIds = new Set(group.members.map(m => m.id));
                group.history.forEach(msg => {
                    if (!msg) return;
                    // 主消息 senderId
                    if (msg.senderId && msg.senderId !== 'user_me' && !memberIds.has(msg.senderId)) {
                        const m = (window.findGroupMember ? window.findGroupMember(group, msg.senderId, msg) : null);
                        if (m) { msg.senderId = m.id; fixed++; }
                    }
                    // 主消息：无 senderId 只有 senderName（其他软件转换的备份常见）→ 按名字写入成员 id
                    if (!msg.senderId && msg.role !== 'user' && msg.senderName) {
                        const m = (window.findGroupMember ? window.findGroupMember(group, null, msg) : null);
                        if (m) { msg.senderId = m.id; fixed++; }
                    }
                    // 引用（回复）里的 senderId
                    if (msg.quote && msg.quote.senderId && msg.quote.senderId !== 'user_me' && !memberIds.has(msg.quote.senderId)) {
                        const m = (window.findGroupMember ? window.findGroupMember(group, msg.quote.senderId, msg) : null);
                        if (m) { msg.quote.senderId = m.id; fixed++; }
                    }
                    // 引用：无 senderId 只有 senderName → 「我」写 user_me，成员名写成员 id
                    if (msg.quote && !msg.quote.senderId && msg.quote.senderName) {
                        const qn = msg.quote.senderName;
                        if (qn === '我' || (group.me && qn === group.me.nickname)) {
                            msg.quote.senderId = 'user_me'; fixed++;
                        } else {
                            const m = (window.findGroupMember ? window.findGroupMember(group, null, msg.quote) : null);
                            if (m) { msg.quote.senderId = m.id; fixed++; }
                        }
                    }
                });
            });
            window.__importCounts.senderFixed = fixed;
        });
    }

    // 2. 世界书（按 ID 合并，不再整表替换——现有的条目不会被删掉）
    if (sel.worldbooks && mods.worldBooks) {
        runModule('世界书', () => {
            const map = new Map((db.worldBooks || []).filter(w => w && w.id).map(w => [w.id, w]));
            let added = 0;
            (mods.worldBooks || []).forEach(w => {
                if (!w || !w.id) return;
                if (!map.has(w.id)) added++;
                map.set(w.id, w);
            });
            db.worldBooks = Array.from(map.values());
            window.__importCounts.wbAdded = added;
        });
    }

    // 3. Personas
    if (sel.personas) {
        runModule('人设', () => {
            if (mods.myPersonaPresets) db.myPersonaPresets = mods.myPersonaPresets;
            if (mods.homeSignature !== undefined) db.homeSignature = mods.homeSignature;
            if (mods.activePersonaId !== undefined) db.activePersonaId = mods.activePersonaId;
        });
    }

    // 4. Wallpapers
    if (sel.wallpapers) {
        runModule('壁纸/贴纸', () => {
            if (mods.wallpaper !== undefined) db.wallpaper = mods.wallpaper;
            if (mods.bubbleCssPresets) db.bubbleCssPresets = mods.bubbleCssPresets;
            if (mods.globalCss !== undefined) db.globalCss = mods.globalCss;
            if (mods.globalCssPresets) db.globalCssPresets = mods.globalCssPresets;
            if (mods.myStickers) db.myStickers = mods.myStickers;
            if (mods.moreProfileCardBg !== undefined) db.moreProfileCardBg = mods.moreProfileCardBg;
            if (mods.themeSettings) db.themeSettings = mods.themeSettings;
            if (mods.themePresets) db.themePresets = mods.themePresets;
        });
    }

    // 5. Fonts
    if (sel.fonts) {
        runModule('字体', () => {
            if (mods.fontUrl !== undefined) db.fontUrl = mods.fontUrl;
            if (mods.fontPresets) db.fontPresets = mods.fontPresets;
        });
    }

    // 6. Settings
    if (sel.settings) {
        runModule('设置', () => {
            IMPORT_SETTINGS_KEYS.forEach(key => {
                if (mods[key] !== undefined) {
                    db[key] = mods[key];
                }
            });
        });
    }

    // 7. X/Twitter APP
    if (sel.xApp) {
        runModule('X/Twitter', () => {
            if (mods.xAvatarSettings !== undefined) db.xAvatarSettings = mods.xAvatarSettings;
        });
    }

    // 8. Instagram
    if (sel.instagram) {
        runModule('Instagram', () => {
            IMPORT_IG_KEYS.forEach(key => {
                if (mods[key] !== undefined) db[key] = mods[key];
            });
        });
    }

    // 落盘 + 校验（无论哪个模块失败都保证执行）
    // 外来备份（转换格式）的动态提示：还原到动态页并从聊天记录清理
    try { if (typeof migrateForeignMomentPrompts === 'function') migrateForeignMomentPrompts(); } catch (e) { console.error('[备份] 动态提示迁移失败:', e); }
    await saveData();
    // LSDB（IPA/降级）模式：立即冲刷并检查是否真的写进去了（localStorage 5MB 配额会静默失败！）
    if (dexieDB && typeof dexieDB.flush === 'function') dexieDB.flush();
    const quotaBroke = dexieDB && dexieDB.name === 'LSDB(localStorage)' && typeof dexieDB._writeFailed === 'function' && dexieDB._writeFailed();
    return { quotaBroke, importReport };
}

// 选择性导入弹窗：自动检测 + 勾选 + 合并（供存储页 / 教程页两处导入入口共用）
function openImportPickerModal(rawData) {
    return new Promise((resolve) => {
        const mods = normalizeBackupToMods(rawData);
        const items = detectImportItems(mods);
        const anyDetected = items.some(i => i.detected);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay visible';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10001;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
        <div class="modal-window" style="width:380px;max-width:92%;max-height:84vh;display:flex;flex-direction:column;background:var(--panel-bg,#fff);padding:20px;border-radius:18px;box-shadow:0 12px 32px rgba(0,0,0,0.18);box-sizing:border-box;">
            <h3 style="margin:0 0 6px 0;font-size:18px;color:var(--text-primary,#1a1a1a);">选择要导入的内容</h3>
            <div style="font-size:12px;color:#999;margin-bottom:12px;line-height:1.5;">已自动检测这份备份里的数据，勾选想要导入的部分。<br>现有数据不会被删除——角色/群聊按 ID 智能合并，并保留聊天记录与相册。</div>
            <div id="imp-picker-list" style="flex:1;min-height:0;overflow:auto;">
                ${items.map(it => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;background:#f7f7fa;margin-bottom:6px;${it.detected ? 'cursor:pointer;' : 'opacity:0.45;'}">
                    <input type="checkbox" data-imp-key="${it.key}" ${it.detected ? 'checked' : 'disabled'} style="width:17px;height:17px;flex:none;accent-color:var(--primary-color,#07c160);">
                    <span style="font-size:18px;flex:none;">${it.icon}</span>
                    <span style="flex:1;font-size:14px;color:var(--text-primary,#1a1a1a);">${it.name}</span>
                    <span style="font-size:12px;color:#999;flex:none;">${it.detected ? (it.count + ' ' + it.unit) : '备份中没有'}</span>
                </label>`).join('')}
            </div>
            <div style="display:flex;gap:10px;margin-top:14px;">
                <button type="button" id="imp-picker-cancel" class="btn btn-secondary" style="flex:1;padding:10px;border-radius:12px;">取消</button>
                <button type="button" id="imp-picker-confirm" class="btn btn-primary" style="flex:1;padding:10px;border-radius:12px;${anyDetected ? '' : 'opacity:0.5;pointer-events:none;'}">开始导入</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) { close(); resolve(false); } });
        overlay.querySelector('#imp-picker-cancel').addEventListener('click', () => { close(); resolve(false); });
        overlay.querySelector('#imp-picker-confirm').addEventListener('click', async () => {
            const sel = {};
            let any = false;
            overlay.querySelectorAll('[data-imp-key]').forEach(cb => { sel[cb.dataset.impKey] = cb.checked; if (cb.checked) any = true; });
            if (!any) { showToast('请至少勾选一项要导入的内容'); return; }
            const btn = overlay.querySelector('#imp-picker-confirm');
            btn.textContent = '导入中...';
            btn.style.pointerEvents = 'none';
            try {
                const res = await executeImportMerge(mods, sel);
                close();
                // 关掉所有可能卡住的弹层，避免刷新失败时全屏被盖住点不了任何东西
                document.querySelectorAll('.modal-overlay.visible, .modal-overlay.active').forEach(m => { m.classList.remove('visible', 'active'); });
                if (res.quotaBroke) {
                    alert('⚠️ 存储空间不足，导入的数据没有保存成功！\n\n这份备份太大（解压后约 35MB），而当前存储方式（localStorage）上限只有约 5MB。\n\n解决办法：\n1. 先在「数据管理」清理图片缓存等大文件，或删掉一些旧角色/聊天\n2. 或用电脑浏览器打开本应用再导入（IndexedDB 容量充足）\n3. 本次回到导入前的状态');
                    resolve(false);
                    return;
                }
                const cnt = window.__importCounts || {};
                const failMsg = res.importReport.fail.length ? ('，失败：' + res.importReport.fail.join('；')) : '';
                showToast('导入成功：' + (cnt.charsAdded ? '新角色 ' + cnt.charsAdded : '') + (cnt.charsUpdated ? ' 更新' + cnt.charsUpdated : '') + (cnt.groupsAdded ? ' 新群 ' + cnt.groupsAdded : '') + (cnt.wbAdded !== undefined ? ' 世界书新增 ' + cnt.wbAdded + ' 条' : '') + failMsg, 4000);
                resolve(true);
                setTimeout(() => { window.location.reload(); }, 1500);
            } catch (err) {
                console.error('[备份] 合并导入失败:', err);
                close();
                showToast('导入失败：' + (err && err.message ? err.message : '未知错误'), 4000);
                resolve(false);
            }
        });
    });
}
window.mieOpenImportPicker = openImportPickerModal;

async function handleImport(event) {
    const input = event.target;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const importLabel = document.getElementById('storage-import-label');
    const importText = document.getElementById('storage-import-text');
    if (importLabel) importLabel.classList.add('disabled');
    if (importText) importText.textContent = '处理中...';

    try {
        const jsonString = await readBackupFile(file);

        let importedData;
        try {
            importedData = JSON.parse(jsonString);
        } catch (parseErr) {
            console.error('[备份] JSON 解析失败', parseErr, jsonString.slice(0, 120));
            throw new Error('备份内容不是有效的 JSON，文件可能没下载完整');
        }

        // 自动检测 + 弹窗勾选 + 智能合并（内部完成落盘/配额校验/刷新）
        await openImportPickerModal(importedData);
        input.value = '';

    } catch (error) {
        console.error('导入出错:', error);
        showToast('导入失败：' + (error && error.message ? error.message : '文件格式不正确'), 4000);
        if (importLabel) importLabel.classList.remove('disabled');
        if (importText) importText.textContent = '导入备份';
        input.value = '';
    }
}

// --- 单独备份：世界书 / 主屏幕美化 ---
// 压缩并下载（与整体备份同一套 gzip + 降级逻辑）
async function downloadSoloBackup(jsonString, fileName) {
    const dataBlob = new Blob([jsonString]);
    try {
        const compressionStream = new CompressionStream('gzip');
        const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
        const compressedBlob = await new Response(compressedStream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();

        let nativeSaved = false;
        if (window.OctoNative && typeof window.OctoNative.saveBackup === 'function') {
            nativeSaved = await window.OctoNative.saveBackup(fileName, compressedBlob);
        }
        if (!nativeSaved) {
            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', fileName);
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } else {
            showToast('导出成功，在分享面板里选「存储到文件」即可存到手机');
        }
    } catch (e) {
        console.warn('[单独备份] 压缩失败，降级为未压缩 JSON:', e);
        const jsonName = fileName.replace(/\.ee$/, '.json');
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', jsonName);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('导出成功 (未压缩)');
    }
}

async function handleWorldBookExport() {
    const btn = document.getElementById('wb-solo-export-btn');
    btn.disabled = true;
    try {
        const payload = {
            type: 'worldbook-backup',
            version: appVersion,
            timestamp: new Date().toISOString(),
            worldBooks: db.worldBooks || []
        };
        await downloadSoloBackup(JSON.stringify(payload), `WorldBook_Backup_${new Date().toISOString().slice(0,10)}.ee`);
        showToast(`世界书导出成功（${(db.worldBooks || []).length} 个条目/文件夹）`);
    } catch (e) {
        console.error('[世界书导出] 失败:', e);
        showToast('世界书导出失败，请重试');
    } finally {
        btn.disabled = false;
    }
}

async function handleWorldBookImport(event) {
    const input = event.target;
    if (!input.files || input.files.length === 0) return;
    const btn = document.getElementById('wb-solo-import-btn');
    btn.disabled = true;
    try {
        const jsonString = await readBackupFile(input.files[0]);
        const data = JSON.parse(jsonString);
        // 兼容整体备份里抠出来的 modules.worldBooks 和单独备份格式
        const list = Array.isArray(data) ? data
            : Array.isArray(data.worldBooks) ? data.worldBooks
            : (data.modules && Array.isArray(data.modules.worldBooks)) ? data.modules.worldBooks
            : null;
        if (!list) throw new Error('文件里没有世界书数据');

        if (!Array.isArray(db.worldBooks)) db.worldBooks = [];
        let added = 0, skipped = 0, renamed = 0;
        list.forEach(wb => {
            if (!wb || !wb.id) return;
            // id 已存在 → 跳过，绝不动原有数据
            if (db.worldBooks.some(b => b.id === wb.id)) { skipped++; return; }
            const clone = JSON.parse(JSON.stringify(wb));
            // 同名不同条目 → 加后缀避免混淆
            if (db.worldBooks.some(b => b.name === clone.name && b.parentId === clone.parentId)) {
                clone.name = clone.name + '（导入）';
                renamed++;
            }
            db.worldBooks.push(clone);
            added++;
        });

        await saveData();
        showToast(`世界书导入完成：新增 ${added} 个${skipped ? `，跳过已存在 ${skipped} 个` : ''}${renamed ? `，重命名 ${renamed} 个` : ''}（原有数据未覆盖）`);
        setTimeout(() => { window.location.reload(); }, 1600);
    } catch (e) {
        console.error('[世界书导入] 失败:', e);
        showToast('导入失败：' + (e && e.message ? e.message : '文件格式不正确'));
        btn.disabled = false;
        input.value = '';
    }
}

async function handleHomeStyleExport() {
    const btn = document.getElementById('homestyle-solo-export-btn');
    btn.disabled = true;
    try {
        const payload = {
            type: 'homestyle-backup',
            version: appVersion,
            timestamp: new Date().toISOString(),
            wallpaper: db.wallpaper || '',
            customIcons: db.customIcons || {}
        };
        await downloadSoloBackup(JSON.stringify(payload), `HomeStyle_Backup_${new Date().toISOString().slice(0,10)}.ee`);
        showToast('主屏幕美化导出成功');
    } catch (e) {
        console.error('[主屏幕美化导出] 失败:', e);
        showToast('导出失败，请重试');
    } finally {
        btn.disabled = false;
    }
}

async function handleHomeStyleImport(event) {
    const input = event.target;
    if (!input.files || input.files.length === 0) return;
    const btn = document.getElementById('homestyle-solo-import-btn');
    btn.disabled = true;
    try {
        const jsonString = await readBackupFile(input.files[0]);
        const data = JSON.parse(jsonString);
        const mods = data.modules || data;
        if (mods.wallpaper === undefined && !mods.customIcons && !data.wallpaper && !data.customIcons) {
            throw new Error('文件里没有主屏幕美化数据');
        }
        const wallpaper = data.wallpaper !== undefined ? data.wallpaper : mods.wallpaper;
        const icons = data.customIcons || mods.customIcons;

        let iconCount = 0;
        if (wallpaper !== undefined) db.wallpaper = wallpaper;
        if (icons && typeof icons === 'object') {
            if (!db.customIcons) db.customIcons = {};
            // 只覆盖备份里包含的图标，原有其他图标保留
            Object.keys(icons).forEach(k => { db.customIcons[k] = icons[k]; });
            iconCount = Object.keys(icons).length;
        }

        await saveData();
        showToast(`主屏幕美化导入成功（壁纸${wallpaper !== undefined ? '已替换' : '无变化'}，${iconCount} 个图标已更新）`);
        setTimeout(() => { window.location.reload(); }, 1600);
    } catch (e) {
        console.error('[主屏幕美化导入] 失败:', e);
        showToast('导入失败：' + (e && e.message ? e.message : '文件格式不正确'));
        btn.disabled = false;
        input.value = '';
    }
}

// --- 持久化存储逻辑 ---
async function checkAndRequestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            console.log("Storage is already persisted.");
            return;
        }

        const hasPrompted = localStorage.getItem('storage_persist_prompted');
        if (hasPrompted) return;

        showPersistencePrompt();
    }
}

function showPersistencePrompt() {
    if (document.getElementById('persistence-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'persistence-modal';
    modal.className = 'modal-overlay visible';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-bottom: 10px;">🛡️ 防止数据丢失</h3>
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 14px;">
                为了避免聊天记录被浏览器自动清理，建议开启<strong>持久化存储</strong>保护。<br>
                <span style="font-size: 12px; color: #999; display: block; margin-top: 8px;">(开启后，浏览器将不会在空间不足时自动删除你的数据)</span>
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="persist-allow-btn" class="btn btn-primary" style="flex: 1;">开启保护</button>
                <button id="persist-later-btn" class="btn btn-neutral" style="flex: 1;">稍后</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('persist-allow-btn').onclick = async () => {
        const persisted = await navigator.storage.persist();
        if (persisted) {
            showToast("已成功开启持久化存储！");
        } else {
            showToast("开启失败，可能是浏览器策略限制。");
        }
        localStorage.setItem('storage_persist_prompted', 'true');
        modal.remove();
    };

    document.getElementById('persist-later-btn').onclick = () => {
        localStorage.setItem('storage_persist_prompted', 'true');
        modal.remove();
    };

    // 点击遮罩关闭时也视为“稍后”，避免下次启动再次弹出挡住点击
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            localStorage.setItem('storage_persist_prompted', 'true');
            modal.remove();
        }
    });
}

// --- 清理图片缓存逻辑 ---
function setupCleanImageCache() {
    const openBtn = document.getElementById('open-clean-cache-btn');
    const modal = document.getElementById('clean-image-cache-modal');
    const form = document.getElementById('clean-image-cache-form');
    const cancelBtn = document.getElementById('cancel-clean-btn');
    const confirmBtn = document.getElementById('confirm-clean-btn');
    const loadingDiv = document.getElementById('clean-cache-loading');
    
    // The modal might not be in DOM immediately if it's injected, but it's in index.html currently.
    if (!modal || !form) return;
    
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');

    let cacheSizes = {
        generated: 0,
        chat: 0,
        gallery: 0,
        stickers: 0
    };

    function isBase64Image(str) {
        if (typeof str !== 'string') return false;
        if (str.startsWith('data:image/')) return true;
        if (str.length > 1000 && !str.startsWith('http') && !str.includes(' ')) return true;
        return false;
    }

    function getStringSize(str) {
        return typeof str === 'string' ? str.length : 0;
    }

    async function calculateCacheSizes() {
        cacheSizes = { generated: 0, chat: 0, gallery: 0, stickers: 0 };

        if (dexieDB) {
            try {
                const workshopItems = await dexieDB.workshopHistory.toArray();
                workshopItems.forEach(item => {
                    if (isBase64Image(item.image)) cacheSizes.generated += getStringSize(item.image);
                });
                const photoItems = await dexieDB.characterPhotos.toArray();
                photoItems.forEach(item => {
                    if (isBase64Image(item.image)) cacheSizes.generated += getStringSize(item.image);
                });
                if (dexieDB.povSnaps) {
                    const snapItems = await dexieDB.povSnaps.toArray();
                    snapItems.forEach(item => {
                        if (isBase64Image(item.image)) cacheSizes.generated += getStringSize(item.image);
                    });
                }
                if (dexieDB.reader_comments) {
                    const comments = await dexieDB.reader_comments.toArray();
                    comments.forEach(item => {
                        if (item.content && item.content.startsWith('[ILLUSTRATION]')) {
                            cacheSizes.generated += getStringSize(item.content);
                        }
                    });
                }
            } catch (e) {
                console.error("Error calculating generated images size:", e);
            }
        }

        const processHistory = (history) => {
            if (!history) return;
            history.forEach(msg => {
                if (msg.content) {
                    if (isBase64Image(msg.content)) {
                        cacheSizes.chat += getStringSize(msg.content);
                    } else {
                        const imgRegex = /!\[.*?\]\((data:image\/[^)]+)\)/g;
                        let match;
                        while ((match = imgRegex.exec(msg.content)) !== null) {
                            cacheSizes.chat += getStringSize(match[1]);
                        }
                        const htmlImgRegex = /<img[^>]+src=["'](data:image\/[^"']+)["']/g;
                        while ((match = htmlImgRegex.exec(msg.content)) !== null) {
                            cacheSizes.chat += getStringSize(match[1]);
                        }
                    }
                }
                if (msg.parts) {
                    msg.parts.forEach(part => {
                        if (part.type === 'image' && isBase64Image(part.data)) {
                            cacheSizes.chat += getStringSize(part.data);
                        }
                    });
                }
            });
        };
        (db.characters || []).forEach(char => processHistory(char.history));
        (db.groups || []).forEach(group => processHistory(group.history));

        (db.characters || []).forEach(char => {
            if (char.gallery) {
                char.gallery.forEach(item => {
                    if (isBase64Image(item.url)) cacheSizes.gallery += getStringSize(item.url);
                });
            }
        });

        (db.myStickers || []).forEach(sticker => {
            if (isBase64Image(sticker.url)) cacheSizes.stickers += getStringSize(sticker.url);
        });

        document.getElementById('size-generated-images').textContent = `(${formatBytes(cacheSizes.generated)})`;
        document.getElementById('size-chat-images').textContent = `(${formatBytes(cacheSizes.chat)})`;
        document.getElementById('size-gallery-images').textContent = `(${formatBytes(cacheSizes.gallery)})`;
        document.getElementById('size-sticker-images').textContent = `(${formatBytes(cacheSizes.stickers)})`;
    }

    // Use event delegation for the open button since it's injected dynamically
    document.addEventListener('click', async (e) => {
        if (e.target && (e.target.id === 'open-clean-cache-btn' || e.target.closest('#open-clean-cache-btn'))) {
            modal.classList.add('visible');
            form.style.display = 'none';
            loadingDiv.style.display = 'block';
            confirmBtn.disabled = true;
            checkboxes.forEach(cb => cb.checked = false);

            await calculateCacheSizes();

            loadingDiv.style.display = 'none';
            form.style.display = 'block';
        }
    });

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.remove('visible');
        };
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const anyChecked = Array.from(checkboxes).some(c => c.checked);
            confirmBtn.disabled = !anyChecked;
        });
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const selectedCategories = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        
        if (selectedCategories.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = '清理中...';

        try {
            let dataChanged = false;

            if (selectedCategories.includes('generated') && dexieDB) {
                const workshopItems = await dexieDB.workshopHistory.toArray();
                const workshopIdsToDelete = workshopItems.filter(item => isBase64Image(item.image)).map(item => item.id);
                if (workshopIdsToDelete.length > 0) {
                    await dexieDB.workshopHistory.bulkDelete(workshopIdsToDelete);
                }

                const photoItems = await dexieDB.characterPhotos.toArray();
                const photoIdsToDelete = photoItems.filter(item => isBase64Image(item.image)).map(item => item.id);
                if (photoIdsToDelete.length > 0) {
                    await dexieDB.characterPhotos.bulkDelete(photoIdsToDelete);
                }

                if (dexieDB.povSnaps) {
                    await dexieDB.povSnaps.clear();
                }

                if (dexieDB.reader_comments) {
                    const comments = await dexieDB.reader_comments.toArray();
                    const commentIdsToDelete = comments.filter(item => item.content && item.content.startsWith('[ILLUSTRATION]')).map(item => item.id);
                    if (commentIdsToDelete.length > 0) {
                        await dexieDB.reader_comments.bulkDelete(commentIdsToDelete);
                    }
                }
            }

            if (selectedCategories.includes('chat')) {
                const cleanHistory = (history) => {
                    if (!history) return;
                    history.forEach(msg => {
                        if (msg.content) {
                            if (isBase64Image(msg.content)) {
                                msg.content = '[图片已清理]';
                                dataChanged = true;
                            } else {
                                let originalContent = msg.content;
                                msg.content = msg.content.replace(/!\[.*?\]\((data:image\/[^)]+)\)/g, '[图片已清理]');
                                msg.content = msg.content.replace(/<img[^>]+src=["'](data:image\/[^"']+)["'][^>]*>/g, '[图片已清理]');
                                if (originalContent !== msg.content) dataChanged = true;
                            }
                        }
                        if (msg.parts) {
                            msg.parts.forEach(part => {
                                if (part.type === 'image' && isBase64Image(part.data)) {
                                    part.data = '';
                                    part.type = 'text';
                                    part.text = '[图片已清理]';
                                    dataChanged = true;
                                }
                            });
                        }
                    });
                };
                (db.characters || []).forEach(char => cleanHistory(char.history));
                (db.groups || []).forEach(group => cleanHistory(group.history));
            }

            if (selectedCategories.includes('gallery')) {
                (db.characters || []).forEach(char => {
                    if (char.gallery) {
                        const originalLength = char.gallery.length;
                        char.gallery = char.gallery.filter(item => !isBase64Image(item.url));
                        if (originalLength !== char.gallery.length) dataChanged = true;
                    }
                });
            }

            if (selectedCategories.includes('stickers')) {
                const originalLength = db.myStickers.length;
                db.myStickers = db.myStickers.filter(sticker => !isBase64Image(sticker.url));
                if (originalLength !== db.myStickers.length) dataChanged = true;
            }

            if (dataChanged) {
                await saveData();
            }

            showToast('清理完成！');
            modal.classList.remove('visible');
            
            const screen = document.getElementById('storage-analysis-screen');
            if (screen && screen.classList.contains('active')) {
                currentStorageSizes = await calculateStorageSize();
                renderStorageUI();
            }

        } catch (error) {
            console.error("Error cleaning cache:", error);
            showToast('清理过程中发生错误');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确认清理';
        }
    };
}

function injectStorageHTMLSafe() {
    // 屏幕容器缺失或内容为空时兜底注入（防旧缓存/时序问题导致空白页）
    const screen = document.getElementById('storage-analysis-screen');
    if (!screen) return;
    if (screen.innerHTML.trim().length < 100 && typeof injectStorageHTML === 'function') {
        try { injectStorageHTML(); } catch (e) { console.error('injectStorageHTML fallback failed:', e); }
    }
}
window.injectStorageHTMLSafe = injectStorageHTMLSafe;

window.checkAndRequestPersistence = checkAndRequestPersistence;
window.setupStorageAnalysisScreen = setupStorageAnalysisScreen;
window.setupCleanImageCache = setupCleanImageCache;
