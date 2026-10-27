// --- Cove Book Forge · 书导入引擎 (js/modules/reader_parser.js) ---
// 复用旧版 TXT 解析 + 新增 PDF（pdf.js）/ EPUB（ePub.js）
// 三种格式统一产出 Cove 风格的 ChapterSnapshot: { title, content, sourceLocator }

const CHAPTER_PATTERNS = [
    {
        key: 'AUTO',
        label: '智能综合（推荐）',
        regex: /^\s*(?:={1,10}\s*|[-]{3,}\s*)?(?:第?[0-9零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟两]+[章回部集节卷番]|Chapter\s*[0-9]+|(?:[0-9]+|[\u2460-\u2473])[\.、\s]+|（[^）]+）|\([^)]+\)|楔子|引子|序言|前言|简介|文案|尾声|番外)(?:\s+.*)?(?:={1,10}\s*|[-]{3,}\s*)?$/gm
    },
    {
        key: 'CHINESE_NUM',
        label: '第X章/回/节/卷',
        regex: /^\s*第[0-9零一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟两]+[章回部集节卷番].*$/gm
    },
    {
        key: 'ENGLISH_CHAPTER',
        label: 'Chapter X',
        regex: /^\s*Chapter\s*[0-9]+.*$/gi
    },
    {
        key: 'PURE_DIGIT',
        label: '数字序号 (1. / 1、)',
        regex: /^\s*[0-9]+[\.、\s]+.*$/gm
    },
    {
        key: 'BRACKETS',
        label: '括号序号 (（一）/ (1))',
        regex: /^\s*(?:（[^）]+）|\([^)]+\)).*$/gm
    },
    {
        key: 'SPECIAL',
        label: '特殊标识 (序言/楔子/番外)',
        regex: /^\s*(?:楔子|引子|序言|前言|简介|文案|尾声|番外).*/gm
    }
];

// =============== 公共工具 ===============

function parseBookInfo(filename) {
    let name = filename.replace(/\.(txt|epub|pdf)$/i, '').trim();
    let title = name, author = '未知作者';
    let match = name.match(/^《(.*?)》(?:(?:\s*by\s*|by|作者：|-|\s+)(.*))?$/i);
    if (match) return { title: match[1].trim(), author: (match[2] || '').trim() || '未知作者' };
    match = name.match(/^(.*?)(?:\s+by\s+|by|-|作者：)(.*)$/i);
    if (match) return { title: match[1].trim(), author: match[2].trim() || '未知作者' };
    return { title: name, author };
}

function parseChapters(text, patternKey = 'AUTO') {
    const targetPattern = CHAPTER_PATTERNS.find(p => p.key === patternKey);
    const chapterRegex = targetPattern
        ? new RegExp(targetPattern.regex.source, targetPattern.regex.flags)
        : new RegExp(CHAPTER_PATTERNS[0].regex.source, CHAPTER_PATTERNS[0].regex.flags);

    const chapters = [];
    let match, lastIndex = 0, currentTitle = "前言/简介";
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while ((match = chapterRegex.exec(text)) !== null) {
        const content = text.substring(lastIndex, match.index).trim();
        if (content || chapters.length === 0) chapters.push({ title: currentTitle, content });
        currentTitle = match[0].trim();
        lastIndex = chapterRegex.lastIndex;
    }
    const lastContent = text.substring(lastIndex).trim();
    if (lastContent || currentTitle !== "前言/简介") chapters.push({ title: currentTitle, content: lastContent });
    if (chapters.length === 0) chapters.push({ title: "正文", content: text.trim() });
    return chapters;
}

// =============== CDN 库懒加载 ===============
// pdf.js / ePub.js 用 CDN 的 importmap 或者直接 <script> 挂在 index.html 底部
// 如果没预先加载，这里帮用户动态 load 一次（加版本戳避免缓存问题）
async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    // pdf.js 新版本用 pdfjsLib.GlobalWorkerOptions.workerSrc
    // 旧版全局变量是 pdfjsLib
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = resolve; s.onerror = () => reject(new Error('pdf.js 加载失败，请检查网络'));
        document.head.appendChild(s);
    });
    // worker 配置（用同一 CDN 的 worker）
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return window.pdfjsLib;
}

async function loadEpubJs() {
    if (window.ePub) return window.ePub;
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; // epub.js 依赖 JSZip
        s.onload = resolve; s.onerror = () => reject(new Error('JSZip 加载失败'));
        document.head.appendChild(s);
    });
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js';
        s.onload = resolve; s.onerror = () => reject(new Error('ePub.js 加载失败，请检查网络'));
        document.head.appendChild(s);
    });
    return window.ePub;
}

// =============== TXT ===============

function readTxtContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(file, 'UTF-8');
    });
}

async function parseTxtFile(file) {
    const text = await readTxtContent(file);
    const chapters = parseChapters(text);
    return { chapters };
}

// =============== PDF ===============
// 从 PDF 文本层提取纯文本，按物理页分章节（简单可靠，不猜 PDF 的章节层级）
async function parsePdfFile(file, onProgress) {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    if (onProgress) onProgress(10, `PDF 解析：共 ${pdf.numPages} 页`);

    const chapters = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (onProgress) onProgress(10 + Math.round(70 * pageNum / pdf.numPages), `PDF 解析第 ${pageNum} 页...`);
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const text = content.items.map(it => it.str).join('').trim();
        if (text) {
            chapters.push({
                title: `第 ${pageNum} 页`,
                content: text
            });
        }
    }

    if (chapters.length === 0) {
        throw new Error("PDF 没有文本层（可能是扫描版），OCR 不在本模块支持范围内");
    }

    // 如果 PDF 文本里本身有章节标记（如 "第X章"），二次尝试合并
    // 用 AUTO 模式把所有页 text 拼起来再 parse 一次，章节更多更合理
    const fullText = chapters.map(c => c.content).join('\n\n');
    const merged = parseChapters(fullText);
    if (merged.length >= chapters.length && merged.length <= chapters.length * 2) {
        // 合并结果合理，用合并版（章节标记被识别出来了）
        return { chapters: merged.filter(c => c.content.trim()).map((c, i) => ({ ...c, sourceLocator: `pdf:merged:${i}` })) };
    }

    // 兜底：每页一章
    return { chapters: chapters.map(c => ({ ...c, sourceLocator: `pdf:page:${c.title}` })) };
}

// =============== EPUB ===============
// epubjs 按 spine 顺序遍历 item，抽取文本节点，标题优先用 nav label
async function parseEpubFile(file, onProgress) {
    const ePub = await loadEpubJs();
    const book = ePub(file);
    const toc = await book.loaded.navigation.then(nav => nav.toc || []);
    const spineItems = await book.loaded.spine.then(s => s.items);
    if (onProgress) onProgress(10, `EPUB 解析：${spineItems.length} 个 spine 节点`);

    const chapters = [];
    const TOC_MAP = new Map();
    const walkToc = (items) => {
        for (const item of items || []) {
            TOC_MAP.set(item.href, item.label);
            if (item.subitems) walkToc(item.subitems);
        }
    };
    walkToc(toc);

    for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i];
        let doc;
        try {
            doc = await item.load();
        } catch (e) { continue; }
        if (onProgress) onProgress(10 + Math.round(70 * i / spineItems.length), `EPUB 解析节点 ${i + 1}/${spineItems.length}`);

        const body = doc.querySelector('body') || doc.documentElement;
        // epub 里的 nav 目录结构通常有 h1/h2/h3，优先用第一个 heading 作为章节标题
        const firstHeading = body.querySelector('h1, h2, h3');
        const headingText = firstHeading ? firstHeading.textContent.trim() : null;
        const tocLabel = TOC_MAP.get(item.href);
        const title = tocLabel || headingText || `第 ${i + 1} 节`;
        // 纯文本（去掉 script/style）
        const textNodes = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
        const text = Array.from(textNodes).map(n => n.textContent.trim()).filter(Boolean).join('\n').trim();

        if (text) {
            chapters.push({ title, content: text, sourceLocator: `epub:spine:${i}` });
        }
    }

    await book.destroy();
    if (chapters.length === 0) throw new Error("EPUB 没解析出任何章节");
    return { chapters };
}

// =============== 统一入口 ===============

async function parseBookFile(file, onProgress) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
    if (ext === 'txt')     return parseTxtFile(file);
    if (ext === 'pdf')     return parsePdfFile(file, onProgress);
    if (ext === 'epub')    return parseEpubFile(file, onProgress);
    throw new Error(`不支持的文件格式：.${ext || '未知'}（仅支持 .txt / .pdf / .epub）`);
}

async function saveBookToDB(bookMeta, chaptersData) {
    const bookId = bookMeta.id || ('book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    const meta = {
        id: bookId,
        title: bookMeta.title,
        author: bookMeta.author || '未知作者',
        sourceFormat: bookMeta.sourceFormat || 'txt',     // 'txt' | 'pdf' | 'epub'
        totalChapters: chaptersData.length,
        currentChapterIndex: 0,
        scrollProgress: 0,
        addTime: Date.now(),
        lastReadTime: Date.now(),
        // Cove 扩展字段（任务 1 先占坑，任务 3 炼成 Skill 时用）
        coveBookCompositeFp: null,
        coveSkillForgeStatus: 'none'                      // 'none' | 'forging' | 'done'
    };
    const chaptersToSave = chaptersData.map((ch, index) => ({
        id: `${bookId}_ch_${index}`,
        bookId, index,
        title: ch.title,
        content: ch.content,
        sourceLocator: ch.sourceLocator || null
    }));

    await dexieDB.transaction('rw',
        dexieDB.reader_books, dexieDB.reader_chapters,
        dexieDB.cove_chapter_cache, async () => {
        await dexieDB.reader_books.put(meta);
        await dexieDB.reader_chapters.bulkPut(chaptersToSave);

        // 顺手算好每章稳定指纹，存到 cove_chapter_cache，任务 2 AI 分析时直接复用
        for (let i = 0; i < chaptersToSave.length; i++) {
            const ch = chaptersToSave[i];
            const fp = await window.readerFingerprint.chapterFingerprint(ch);
            await dexieDB.cove_chapter_cache.put({
                chapterId: ch.id,
                bookId, index: i,
                fingerprint: fp,
                sourceLocator: ch.sourceLocator,
                contentLength: ch.content.length,
                cachedAt: Date.now()
            });
        }
    });
    return bookId;
}

// =============== 旧 API 兼容导出（reader_bookshelf.js 仍在用） ===============

async function processTxtFile(file, onProgress) {
    const { chapters } = await parseTxtFile(file);
    const bookInfo = parseBookInfo(file.name);
    // 返回结构和旧版一致
    return { bookInfo, chapters };
}

// 新版通用入口：返回 { bookInfo, chapters, bookId(可选) }
async function processBookFile(file, onProgress) {
    if (onProgress) onProgress(0, "准备加载库...");
    const { chapters } = await parseBookFile(file, onProgress);
    const bookInfo = parseBookInfo(file.name);
    bookInfo.sourceFormat = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || 'txt';
    return { bookInfo, chapters };
}

window.readerParser = {
    CHAPTER_PATTERNS,
    parseBookInfo,
    parseChapters,
    readTxtContent,
    saveBookToDB,
    processTxtFile,    // 旧兼容
    processBookFile,   // 新通用
    parseBookFile      // 直接 { chapters } 解析
};
