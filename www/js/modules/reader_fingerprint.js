// --- Cove Book Forge · 章节稳定指纹 (js/modules/reader_fingerprint.js) ---
// 指纹规则（和 Cove 保持一致的方法论，但精简）：
//   SHA-256( normalizeWhitespace(chapterTitle) + "\u0001" + normalizeWhitespace(chapterBody) )
//   normalizeWhitespace = 合并连续空白 + trim + 统一 \n
// 为什么要指纹：
//   章节 AI 分析很贵，同一章节（哪怕换了文件名、换了顺序）
//   只要正文没变，指纹就命中 → 直接复用缓存，零 token 消耗

(function () {
    /**
     * 统一空白符：合并所有连续空白（含换行）→ 单个空格，然后 trim
     * @param {string} s
     */
    function normalizeWhitespace(s) {
        if (!s) return '';
        // \u00A0 不间断空格 / \uFEFF BOM / \u2028 行分隔 这些都要干掉
        return String(s)
            .replace(/[\u00A0\uFEFF]/g, ' ')
            .replace(/[\r\n\u2028\u2029]+/g, '\n')
            .replace(/[ \t\f\v\u00A0]+/g, ' ')
            .trim();
    }

    /**
     * 浏览器原生 SHA-256，十六进制小写返回
     * 用 crypto.subtle.digest（标准 API，所有现代浏览器支持）
     */
    async function sha256hex(text) {
        const enc = new TextEncoder();
        const buf = enc.encode(text);
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        const bytes = new Uint8Array(hashBuf);
        let out = '';
        for (let i = 0; i < bytes.length; i++) {
            out += bytes[i].toString(16).padStart(2, '0');
        }
        return out;
    }

    /**
     * 给一个章节算 Cove 风格的稳定指纹
     * @param {{title: string, content: string}} chapter
     * @returns {Promise<string>} 64 位小写十六进制 SHA-256
     */
    async function chapterFingerprint(chapter) {
        const payload = normalizeWhitespace(chapter.title) + '\u0001' + normalizeWhitespace(chapter.content);
        return sha256hex(payload);
    }

    /**
     * 给整本书算"组合指纹"：所有章节 fingerprint 按 index 拼接再算一次 SHA-256
     * 用途：一本书里章节都没变 → 不用重新分析整本书；某一章内容变了 → 组合指纹就变
     * @param {Array<{fingerprint: string}>} chapterFps
     * @returns {Promise<string>}
     */
    async function bookCompositeFingerprint(chapterFps) {
        const payload = chapterFps
            .map((c, i) => `${i}\u0001${c.fingerprint || ''}`)
            .join('\u0002');
        return sha256hex(payload);
    }

    window.readerFingerprint = {
        normalizeWhitespace,
        sha256hex,
        chapterFingerprint,
        bookCompositeFingerprint
    };
})();
