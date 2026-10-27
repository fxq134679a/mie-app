// --- Cove Book Forge · 输出引擎 (js/modules/reader_skill_forge.js) ---
// 两种输出：
//   1. Obsidian 笔记 zip（Books/…/MOC.md + Chapters/… + Cards/… + manifest.json）
//   2. Agent Skill 单 .md 文件（整本书浓缩）
// 两者都复用 cove_analysis_cache 里已有的分析结果（没分析过的章节跳过并提示）

// 加载 JSZip（CDN）—— 用户点导出时动态 inject，首屏不拖速度
async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('JSZip 加载失败，请检查网络'));
        document.head.appendChild(s);
    });
    return window.JSZip;
}

// 文件名安全化（对齐 Cove "safe title"）
function safeSlug(s) {
    return String(s || '')
        .replace(/[\\/:*?"<>|\r\n\t]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'untitled';
}
function stableKey() {
    // Cove 风格：4 段 hex 短 ID（不用真正 UUID，够用就行）
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Markdown 安全化：代码块 + 表格 + 缩进都要
function mdEscape(s) {
    return String(s || '').replace(/\|/g, '\\|');
}

// ======================================================
// 1. Obsidian 导出（zip 下载）
// ======================================================

/**
 * 为一本书生成 Obsidian 兼容的 zip
 * 目录结构和 Cove Book Forge 保持一致：
 *   Books/<safe-title>--<bookKey>/MOC.md
 *   Books/<safe-title>--<bookKey>/Chapters/01 章名.md
 *   Cards/<topic>--<cardId>.md  （从 frameworks + topics 生成）
 *   .cove-book-forge/obsidian/<bookKey>.json  manifest
 */
async function forgeObsidianZip(bookId, { onProgress } = {}) {
    const JSZip = await loadJSZip();

    const book = await dexieDB.reader_books.get(bookId);
    if (!book) throw new Error('书不存在');
    const chapters = await dexieDB.reader_chapters.where('bookId').equals(bookId).sortBy('index');
    const analyses = await dexieDB.cove_analysis_cache.where('bookId').equals(bookId).sortBy('chapterIndex');

    const analysisMap = new Map();
    analyses.forEach(a => analysisMap.set(a.chapterId, a));
    const coveredChapters = chapters.filter(c => analysisMap.has(c.id));
    const skippedChapters = chapters.filter(c => !analysisMap.has(c.id));

    if (coveredChapters.length === 0) {
        throw new Error(`这本书还没被 AI 分析过。至少先分析一章再导出吧～`);
    }

    if (skippedChapters.length > 0) {
        // 不算硬错误，只是提醒
        console.warn(`[Cove Obsidian] ${skippedChapters.length} 章未分析，会被跳过：`,
            skippedChapters.map(c => c.title));
    }

    const bookSafe = safeSlug(book.title);
    const bookKey = await window.readerFingerprint.bookCompositeFingerprint(
        coveredChapters.map(c => ({ fingerprint: analysisMap.get(c.id)?.fingerprint }))
    );
    const rootDir = `Books/${bookSafe}--${bookKey.slice(0, 16)}`;

    const zip = new JSZip();

    // ── 1. 每章 → Chapters/NN <safe title>.md ──
    const chapterFiles = [];
    const cards = [];
    const chaptersIndex = [];

    for (let i = 0; i < coveredChapters.length; i++) {
        const ch = coveredChapters[i];
        const a = analysisMap.get(ch.id);
        if (!a) continue;
        const idx = i + 1;
        const safeTitle = safeSlug(ch.title);
        const path = `${rootDir}/Chapters/${String(idx).padStart(2, '0')} ${safeTitle}.md`;

        const md = buildChapterMarkdown(book, ch, a);
        zip.file(path, md);

        chapterFiles.push({ index: idx, title: ch.title, path, hash: a.fingerprint.slice(0, 16) });

        // 从 frameworks + topics 提炼 Card（每章最多 2 个概念卡）
        const cardSeeds = [
            ...(a.analysis.frameworks || []).slice(0, 1),
            ...(a.analysis.topics || []).filter(t => t.includes('-') || t.includes(' ')).slice(0, 1)
        ];
        cardSeeds.forEach((seed, ci) => {
            const cardContent = `# ${seed}\n\n> 来自《${book.title}》第 ${idx} 章 ${ch.title}\n\n**核心观点**：${a.analysis.core_idea || ''}\n\n**关联**：${(a.analysis.frameworks || []).join(', ') || '—'}\n**主题**：${(a.analysis.topics || []).join(', ') || '—'}\n\n> 由 Cove Book Forge 自动生成，人工笔记可继续追加。\n`;
            const cardKey = safeSlug(seed) + '--' + stableKey().slice(0, 8);
            const cardPath = `Cards/${safeSlug(seed)}--${cardKey.split('--').pop()}.md`;
            zip.file(cardPath, cardContent);
            cards.push({ title: seed, path: cardPath, fromChapter: idx });
        });

        if (onProgress) onProgress(idx, coveredChapters.length, `生成章节 ${idx}/${coveredChapters.length}`);
    }

    // ── 2. MOC（目录总览） ──
    const moc = buildMocMarkdown(book, chapterFiles, cards);
    zip.file(`${rootDir}/${book.title} MOC.md`, moc);

    // ── 3. manifest（给人/程序读的元数据） ──
    const manifest = {
        book: { id: book.id, title: book.title, author: book.author, sourceFormat: book.sourceFormat },
        bookKey,
        generatedAt: new Date().toISOString(),
        coveBookForgeVersion: 'miemie-task3-1',
        chapters: chapterFiles,
        cards: cards,
        skipped: skippedChapters.map(c => ({ index: c.index, title: c.title, reason: 'not_analyzed' })),
        managedRoot: `${rootDir}/`
    };
    zip.file(`.cove-book-forge/obsidian/${bookKey.slice(0, 16)}.json`, JSON.stringify(manifest, null, 2));

    // ── 4. 打包 ──
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `Obsidian-${bookSafe}.zip`;
    triggerBlobDownload(blob, filename);

    return { filename, chapters: chapterFiles.length, cards: cards.length, skipped: skippedChapters.length };
}

function buildChapterMarkdown(book, chapter, analysisRow) {
    const a = analysisRow.analysis;
    const fp = analysisRow.fingerprint;
    const frontmatter = [
        '---',
        `cove_managed: true`,
        `cove_book_id: "${book.id}"`,
        `cove_book_title: "${mdEscape(book.title)}"`,
        `cove_chapter_index: ${chapter.index}`,
        `cove_chapter_title: "${mdEscape(chapter.title)}"`,
        `cove_fingerprint: "${fp || 'unknown'}"`,
        `cove_analyzed_at: "${analysisRow.analyzedAt ? new Date(analysisRow.analyzedAt).toISOString() : 'unknown'}"`,
        `cove_model: "${mdEscape(analysisRow.model || 'unknown')}"`,
        `tags: [cove, book-forge, chapter]`,
        '---',
        ''
    ].join('\n');

    const highlights = (a.highlights || []).map(h => `> ${h}`).join('\n\n');
    const keyPoints = (a.key_points || []).map((k, i) => `${i + 1}. ${k}`).join('\n');
    const notes = (a.notes || []).map(n => `- ${n}`).join('\n');
    const reflections = (a.reflections || []).map(r => `- ${r}`).join('\n');
    const frameworks = (a.frameworks || []).join(' · ');
    const topics = (a.topics || []).map(t => `#${t}`).join(' ');

    const body = [
        `# ${chapter.title}`,
        '',
        `> 《${book.title}》 — 第 ${chapter.index + 1} / ${book.totalChapters} 章`,
        '',
        `## 🎯 核心观点`,
        '',
        a.core_idea || '（无）',
        '',
        a.core_idea ? `> Cove 指纹 \`${fp?.slice(0, 16)}...\` · ${analysisRow.model || 'unknown'}` : '',
        '',
        (a.highlights || []).length ? `## ✨ 原文亮点\n\n${highlights}\n` : '',
        (a.key_points || []).length ? `## 🔑 要点\n\n${keyPoints}\n` : '',
        (a.notes || []).length ? `## 📝 笔记\n\n${notes}\n` : '',
        (a.reflections || []).length ? `## 💭 反思\n\n${reflections}\n` : '',
        frameworks ? `## 🧩 框架 / 模型\n\n${frameworks}\n` : '',
        topics ? `## 🏷️ 主题\n\n${topics}\n` : '',
        '---',
        '',
        '_本章正文（前半）_',
        '',
        chapter.content.slice(0, 2000) + (chapter.content.length > 2000 ? '\n\n…（正文过长已截断，完整版在原文件中）' : ''),
    ].filter(Boolean).join('\n');

    return frontmatter + body;
}

function buildMocMarkdown(book, chapterFiles, cards) {
    const chapterLinks = chapterFiles.map(c => `- [[${safeSlug(book.title)}--*/${c.title}|第${String(c.index).padStart(2, '0')}章 ${c.title}]]`).join('\n');
    const cardLinks = cards.length
        ? '\n## 🧠 概念卡\n\n' + cards.map(c => `- [[${safeSlug(c.title)}--*/${c.title}]] (来自第${c.fromChapter}章)`).join('\n') + '\n'
        : '';
    return `# 《${book.title}》 总览 (MOC)\n\n> 作者：${book.author} · 共 ${book.totalChapters} 章 · Cove Book Forge 生成\n\n## 📚 章节目录\n\n${chapterLinks}\n${cardLinks}\n---\n\n*本文件由 Cove Book Forge 自动生成，作为整本书的入口索引。*\n`;
}

// ======================================================
// 2. Agent Skill 炼成（单 .md 文件）
// ======================================================

/**
 * 把整本书所有分析浓缩成一份 Agent Skill .md
 * 格式对齐 Codex / Claude Code 的 Agent Skill 约定：
 *   - frontmatter name / description
 *   - When to use / When NOT to use
 *   - 核心角色化 prompt
 *   - 关键知识点汇总表
 *   - 完整章节分析（可选，太长就截断 + 提示用户看 Obsidian）
 */
async function forgeAgentSkillMd(bookId) {
    const book = await dexieDB.reader_books.get(bookId);
    if (!book) throw new Error('书不存在');
    const analyses = await dexieDB.cove_analysis_cache.where('bookId').equals(bookId).sortBy('chapterIndex');
    if (analyses.length === 0) throw new Error(`这本书还没被 AI 分析过。先批量分析吧～`);

    // 提炼全局主题 / 框架
    const allFrameworks = new Set();
    const allTopics = new Set();
    const allKeyPoints = [];
    const chapterSummaries = [];
    analyses.forEach(a => {
        (a.analysis.frameworks || []).forEach(f => allFrameworks.add(f));
        (a.analysis.topics || []).forEach(t => allTopics.add(t));
        (a.analysis.key_points || []).slice(0, 2).forEach(k => allKeyPoints.push(`第${a.chapterIndex + 1}章：${k}`));
        chapterSummaries.push({ idx: a.chapterIndex + 1, title: a.chapterTitle, core: a.analysis.core_idea });
    });

    const skillBody = `---
name: "${safeSlug(book.title).replace(/-/g, '-')}-knowledge"
description: "精通《${book.title}》（${book.author}）的全部章节分析。当被问到与这本书的观点、框架、人物、情节相关的任何问题时，基于已分析章节的核心观点、要点、反思和框架来回答。"
version: "1.0"
source: "cove-book-forge-miemie"
chapters_analyzed: ${analyses.length} / ${book.totalChapters}
---

# Agent Skill：《${book.title}》

## 🎭 角色定位

你是《${book.title}》（${book.author}）的**专属 AI 解读助手**。你已经读过并深度分析了这本书的所有章节（${analyses.length} / ${book.totalChapters}）。

**回答规则**：
1. 用户问任何与这本书相关的问题，你都**优先基于下方章节分析里的核心观点和要点**来回答
2. 如果分析里没有足够信息，诚实说"这部分我没有被专门分析过"，不要编造
3. 回答尽量贴合原文口吻，必要时引用分析里的原文亮点
4. 跨章节综合时，注意不同章节可能有不同角度甚至矛盾观点——**如实呈现**

## 🛠️ 什么时候用我

- 用户讨论《${book.title}》里的某个观点、框架、人物或情节
- 用户想让你**从这本书的视角**回答一个问题
- 用户想让你**把这本书的方法/模型用到另一个场景**
- 用户对比这本书和另一本书的异同

## 🚫 什么时候不用我

- 用户的问题和这本书无关（通用话题用通用 Skill）
- 用户想要原文逐字朗读（那是阅读器的事，不是 Skill）

## 📚 全局知识地图

### 🧩 关键框架 / 模型（从所有章节提炼）
${Array.from(allFrameworks).map(f => `- **${f}**`).join('\n') || '_（未识别出明确框架）'}

### 🏷️ 覆盖主题
${Array.from(allTopics).map(t => `#${t}`).join(' ') || '_（未提炼主题）'}

### 🎯 全局核心观点 Top
${allKeyPoints.slice(0, 15).map((k, i) => `${i + 1}. ${k}`).join('\n')}

## 📖 章节速查（${analyses.length} 章）

${chapterSummaries.map(s => `### 第 ${s.idx} 章 · ${s.title}\n\n> ${s.core || '（核心观点待填充）'}`).join('\n\n')}

---

*本 Skill 由 Cove Book Forge (miemie 版) 自动生成，基础数据来自 ${analyses.length} 章 AI 结构化分析。分析时间 ${new Date(analyses[analyses.length - 1].analyzedAt).toLocaleString('zh-CN')}。*
*如果要更完整的章节细节（原文亮点、完整要点、笔记、反思），请使用对应的 Obsidian zip 导出。*
`;

    const blob = new Blob([skillBody], { type: 'text/markdown;charset=utf-8' });
    const safeBook = safeSlug(book.title);
    triggerBlobDownload(blob, `Skill-${safeBook}.md`);

    return { filename: `Skill-${safeBook}.md`, chaptersAnalyzed: analyses.length, globalFrameworks: allFrameworks.size, globalTopics: allTopics.size };
}

// ======================================================
// 工具：触发下载
// ======================================================
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ======================================================
// UI：书架页上的两个胶囊按钮（插到书架 header 里）
// ======================================================
async function ensureForgeUi(bookshelfScreen) {
    if (!bookshelfScreen || bookshelfScreen.querySelector('.cove-forge-header')) return;

    // 找到原来 header 里的 action-btn-group
    const btnGroup = bookshelfScreen.querySelector('.action-btn-group');
    if (!btnGroup) return;

    // 先把原来的 manage button 隐藏（导出按钮自己就是管理功能，避免重复）
    // 但不删除，renderBookshelf 可能还会用到
    const manageBtn = bookshelfScreen.querySelector('#reader-manage-btn');
    if (manageBtn) manageBtn.style.display = 'none';
    const cancelManageBtn = bookshelfScreen.querySelector('#reader-cancel-manage-btn');
    if (cancelManageBtn) cancelManageBtn.style.display = 'none';

    // 插两个导出按钮
    btnGroup.innerHTML += `
        <button class="cove-forge-btn" id="cove-obsidian-btn" title="导出 Obsidian 笔记 zip">
            📦 Obsidian
        </button>
        <button class="cove-forge-btn" id="cove-skill-btn" title="炼成 Agent Skill .md">
            ✨ Agent Skill
        </button>
    `;

    btnGroup.querySelector('#cove-obsidian-btn').addEventListener('click', async () => {
        await pickBookAndForge(bookshelfScreen, 'obsidian');
    });
    btnGroup.querySelector('#cove-skill-btn').addEventListener('click', async () => {
        await pickBookAndForge(bookshelfScreen, 'skill');
    });
}

// 一个简单的"从书架里选书"弹窗
async function pickBookAndForge(bookshelfScreen, mode) {
    const books = await dexieDB.reader_books.orderBy('lastReadTime').reverse().toArray();
    if (books.length === 0) { showToast('书架还是空的，先导入一本书吧～'); return; }

    const modal = document.createElement('div');
    modal.className = 'cove-forge-picker';
    modal.innerHTML = `
        <div class="cove-forge-card">
            <div class="cove-forge-title">
                ${mode === 'obsidian' ? '📦 导出 Obsidian 笔记' : '✨ 炼成 Agent Skill'}
            </div>
            <div class="cove-forge-sub">选择一本书：</div>
            <div class="cove-forge-list">
                ${books.map(b => `
                    <button class="cove-forge-item" data-id="${b.id}">
                        <div class="cove-forge-item-title">${b.title}</div>
                        <div class="cove-forge-item-sub">${b.author} · ${b.totalChapters} 章</div>
                    </button>
                `).join('')}
            </div>
            <button class="cove-forge-close-btn">取消</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.cove-forge-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('.cove-forge-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const bookId = btn.dataset.id;
            modal.remove();
            try {
                showToast(mode === 'obsidian' ? '正在打包 Obsidian zip...' : '正在炼成 Skill...');
                if (mode === 'obsidian') {
                    const info = await forgeObsidianZip(bookId);
                    showToast(`✅ 导出成功：${info.filename}`);
                } else {
                    const info = await forgeAgentSkillMd(bookId);
                    showToast(`✅ Skill 炼成：${info.filename}`);
                }
            } catch (e) {
                showToast('❌ ' + e.message);
            }
        });
    });
}

window.readerSkillForge = {
    forgeObsidianZip,
    forgeAgentSkillMd,
    ensureForgeUi
};
