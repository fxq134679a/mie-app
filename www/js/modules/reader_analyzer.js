// --- Cove Book Forge · 章节 AI 分析器 (js/modules/reader_analyzer.js) ---
// 方法论对齐 Cove ChapterAnalyzer，但简化 + 纯前端：
//   1. 稳定指纹缓存：fingerprint 命中 → 零 token，直接返回
//   2. 结构化输出：要求 AI 输出严格 JSON schema，失败自动重试 1 次
//   3. 复用 miemie 已有 fetchAiResponse / buildChatApiRequest / resolveWorkshopLlmApiConfig

const COVE_ANALYSIS_SCHEMA = `你必须且只能输出一个严格的 JSON 对象，字段如下，不要任何解释文字、不要 markdown 代码块、不要前后缀：
{
  "core_idea": "1-3 句话，这本书/这一章的核心观点、主题或主张",
  "key_points": ["要点 1", "要点 2", "要点 3"],
  "highlights": ["原文中让你印象深刻的关键句子或段落原文（带引号）"],
  "notes": ["你的分析笔记、个人解读、和其他章节/书的联系"],
  "reflections": ["AI 视角的反思、值得深挖的问题、争议点、应用场景"],
  "frameworks": ["这一章提到或用到的理论框架 / 方法论 / 模型"],
  "topics": ["这一章覆盖的主题关键词（尽量用英文 slug 风格如 'cognitive-dissonance'）"]
}`;

function buildAnalysisSystemPrompt(bookMeta, chapterIndex, chapterTitle, totalChapters) {
    return [
        `你是一个严谨的读书分析师，正在为《${bookMeta.title}》（${bookMeta.author}）做结构化分析。`,
        `这是第 ${chapterIndex + 1} / ${totalChapters} 章「${chapterTitle}」。`,
        `严格输出 JSON schema：`,
        COVE_ANALYSIS_SCHEMA,
        `要求：`,
        `1. 所有数组字段如果没有就返回 []（不要 null、不要省略）`,
        `2. 字符串字段不要超过 200 字`,
        `3. 原文 highlights 必须是章节里真的出现过的文字，不要编造`,
        `4. 只能输出 JSON，外面不要包 markdown（不要 \`\`\`json），不要解释，直接 { 开头 } 结尾`
    ].join('\n');
}

function buildAnalysisUserPrompt(chapterContent) {
    const maxLen = 12000; // 单 chapter 正文截断给 LLM（超长章节分块在任务 3 做）
    const truncated = chapterContent.length > maxLen
        ? chapterContent.slice(0, maxLen) + `\n...（章节过长，已截断至 ${maxLen} 字）`
        : chapterContent;
    return `请分析以下章节正文：\n\n${truncated}`;
}

/**
 * 解析 AI 返回的可能不干净的 JSON（AI 常包 markdown code fence 或前面带废话）
 */
function extractJsonFromAi(text) {
    if (!text) throw new Error('AI 返回空内容');
    let raw = String(text).trim();
    // 去掉 ```json ... ```
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    // 去掉前置废话直到第一个 {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        raw = raw.substring(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(raw);
    // 基础 schema 校验（比 Cove 的 Pydantic 宽松，但保证字段齐全）
    const norm = {
        core_idea: String(parsed.core_idea || '').trim().slice(0, 400),
        key_points: Array.isArray(parsed.key_points) ? parsed.key_points.map(String).slice(0, 10) : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 5) : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(String).slice(0, 10) : [],
        reflections: Array.isArray(parsed.reflections) ? parsed.reflections.map(String).slice(0, 10) : [],
        frameworks: Array.isArray(parsed.frameworks) ? parsed.frameworks.map(String).slice(0, 10) : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics.map(String).slice(0, 20) : []
    };
    // 必须至少有 core_idea 或 key_points 才叫"成功"
    if (!norm.core_idea && norm.key_points.length === 0) {
        throw new Error('JSON 结构不合理：缺少 core_idea 和 key_points');
    }
    return norm;
}

/**
 * 分析一个章节（纯同步逻辑 + 一次重试）
 * @returns {{ analysis: object, cacheHit: boolean, tokensUsed?: number, error?: string }}
 */
async function analyzeChapter(bookMeta, chapterRow) {
    const chId = chapterRow.id;
    const bookId = chapterRow.bookId;
    const fingerprint = chapterRow.fingerprint;

    if (!fingerprint) {
        // 理论上 saveBookToDB 已经算好存 cove_chapter_cache；兜底重算一次
        const fp = await window.readerFingerprint.chapterFingerprint(chapterRow);
        await dexieDB.cove_chapter_cache.put({
            chapterId: chId, bookId, index: chapterRow.index,
            fingerprint: fp, sourceLocator: chapterRow.sourceLocator,
            contentLength: chapterRow.content.length, cachedAt: Date.now()
        });
        chapterRow.fingerprint = fp;
    }

    // 1️⃣ 指纹命中 → 直接返回缓存（零 token！）
    const cached = await dexieDB.cove_analysis_cache.get(chId);
    if (cached && cached.fingerprint === fingerprint) {
        return { analysis: cached.analysis, cacheHit: true };
    }

    // 2️⃣ 没命中，调 AI
    const apiConfig = resolveWorkshopLlmApiConfig();
    if (!apiConfig.url || !apiConfig.key || !apiConfig.model) {
        throw new Error('AI API 未配置（去 miemie → 设置 → API 设置填好才能分析）');
    }

    const messages = [
        { role: 'system', content: buildAnalysisSystemPrompt(bookMeta, chapterRow.index, chapterRow.title, bookMeta.totalChapters) },
        { role: 'user', content: buildAnalysisUserPrompt(chapterRow.content) }
    ];

    const { endpoint, headers, requestBody } = buildChatApiRequest(apiConfig, messages, { temperature: 0.3 });

    let rawText, lastErr;
    try {
        rawText = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
    } catch (e) { lastErr = e; }

    // 3️⃣ 第一次 JSON 解析失败？重试 1 次（prompt 更严格 + 温度更低）
    let analysis;
    try {
        analysis = extractJsonFromAi(rawText);
    } catch (e) {
        lastErr = e;
        try {
            // 重试：更短更狠的 system prompt + temperature=0
            const retryMessages = [
                { role: 'system', content: '只输出一个合法 JSON 对象，严格按 schema：{"core_idea":"","key_points":[],"highlights":[],"notes":[],"reflections":[],"frameworks":[],"topics":[]}。不要任何其他字符，不要 markdown。' },
                { role: 'user', content: `分析《${bookMeta.title}》第${chapterRow.index + 1}章「${chapterRow.title}」：\n\n${buildAnalysisUserPrompt(chapterRow.content)}` }
            ];
            const r = buildChatApiRequest(apiConfig, retryMessages, { temperature: 0 });
            const retryText = await fetchAiResponse(apiConfig, r.requestBody, r.headers, r.endpoint);
            analysis = extractJsonFromAi(retryText);
        } catch (e2) {
            throw new Error(`AI 分析失败：${lastErr?.message || ''} / 重试也失败：${e2.message}`);
        }
    }

    // 4️⃣ 存缓存（带 fingerprint 保证下次命中）
    const now = Date.now();
    await dexieDB.cove_analysis_cache.put({
        chapterId: chId, bookId, fingerprint,
        analysis,
        analyzedAt: now,
        bookTitle: bookMeta.title,
        chapterIndex: chapterRow.index,
        chapterTitle: chapterRow.title,
        model: apiConfig.model
    });

    return { analysis, cacheHit: false };
}

/**
 * 分析整本书（串行 + 每章检查缓存）
 * @param {Function} onProgress (chapterIndex, total, status) => void
 * @returns {{ results: Array, summary: string }}
 */
async function analyzeWholeBook(bookMeta, onProgress) {
    const chapters = await dexieDB.reader_chapters
        .where('bookId').equals(bookMeta.id)
        .sortBy('index');
    // 补上 fingerprint（可能已经在 cove_chapter_cache 里）
    const fpMap = {};
    try {
        const fps = await dexieDB.cove_chapter_cache.where('bookId').equals(bookMeta.id).toArray();
        fps.forEach(f => fpMap[f.chapterId] = f.fingerprint);
    } catch {}
    chapters.forEach(c => c.fingerprint = fpMap[c.id]);

    const results = [];
    let cacheHits = 0, freshCalls = 0;

    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (onProgress) onProgress(i, chapters.length, `分析中：${ch.title}`);
        try {
            const r = await analyzeChapter(bookMeta, ch);
            results.push({ chapterId: ch.id, index: i, title: ch.title, ...r });
            if (r.cacheHit) cacheHits++; else freshCalls++;
        } catch (e) {
            results.push({ chapterId: ch.id, index: i, title: ch.title, error: e.message });
        }
    }

    const summary = `共 ${results.length} 章 · 缓存命中 ${cacheHits}（零 token）· 新调用 ${freshCalls}`;
    return { results, summary };
}

/**
 * 从缓存直接取一本书的所有分析（UI 渲染时用，不触发 AI 调用）
 */
async function loadBookAnalysisFromCache(bookId) {
    try {
        const arr = await dexieDB.cove_analysis_cache
            .where('bookId').equals(bookId)
            .sortBy('chapterIndex');
        return arr;
    } catch { return []; }
}

window.readerAnalyzer = {
    analyzeChapter,
    analyzeWholeBook,
    loadBookAnalysisFromCache,
    // 纯函数导出（方便单测）
    extractJsonFromAi,
    buildAnalysisSystemPrompt,
    buildAnalysisUserPrompt
};
