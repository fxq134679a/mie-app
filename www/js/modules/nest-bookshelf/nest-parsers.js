// nest-bookshelf-ui parsers (EPUB/TXT/PDF)
(function() {
  const PAGE_SIZE = 30;
  function extractEpubParagraphs(node) {
    const BLOCK = /* @__PURE__ */ new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
    const SKIP = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NAV", "HEADER", "FOOTER", "SVG", "FIGURE"]);
    const BLOCK_SELECTOR = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre";
    const out = [];
    function walk(n) {
      if (!n) return;
      if (n.nodeType === 1) {
        const tn = (n.tagName || "").toUpperCase();
        if (SKIP.has(tn)) return;
        if (BLOCK.has(tn)) {
          if (n.querySelector && n.querySelector(BLOCK_SELECTOR)) {
            for (const c of n.childNodes) walk(c);
            return;
          }
          const t = (n.textContent || "").trim();
          if (t) out.push(t);
          return;
        }
      }
      if (n.childNodes) for (const c of n.childNodes) walk(c);
    }
    walk(node);
    if (!out.length) {
      const txt = (node.textContent || "").trim();
      if (txt) {
        txt.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
      }
    }
    return out;
  }
  async function readEpub(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip 未加载（CDN 问题？）");
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const containerEntry = zip.file("META-INF/container.xml");
    if (!containerEntry) throw new Error("没找到 META-INF/container.xml（这文件可能不是有效 epub）");
    const containerXml = await containerEntry.async("string");
    const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
    const rootfile = containerDoc.querySelector("rootfile") || containerDoc.getElementsByTagName("rootfile")[0];
    if (!rootfile) throw new Error("container.xml 缺 rootfile");
    const opfPath = rootfile.getAttribute("full-path");
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";
    const fullPath = (rel) => opfDir ? opfDir + "/" + rel : rel;
    const opfEntry = zip.file(opfPath);
    if (!opfEntry) throw new Error("找不到 OPF：" + opfPath);
    const opfXml = await opfEntry.async("string");
    const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
    const titleEl = opfDoc.getElementsByTagName("dc:title")[0] || opfDoc.querySelector("metadata title, title");
    const authorEl = opfDoc.getElementsByTagName("dc:creator")[0] || opfDoc.querySelector("metadata creator");
    const cleanMeta = (s) => {
      if (!s) return "";
      let t = String(s).trim();
      t = t.replace(/[,，;；、\s]*ePUBw[\.\s]*COM/gi, "");
      t = t.replace(/[,，;；、\s]*[A-Za-z]+\.com[a-zA-Z0-9]*/gi, "");
      t = t.replace(/\(?\s*作家榜经典\s*\)?/g, "");
      t = t.replace(/[\s,，;；、]+$/g, "");
      t = t.replace(/^[\s,，;；、]+/g, "");
      return t.trim();
    };
    const epubTitle = cleanMeta(titleEl ? titleEl.textContent : "");
    const epubAuthor = cleanMeta(authorEl ? authorEl.textContent : "");
    const manifest = {};
    Array.from(opfDoc.getElementsByTagName("item")).forEach((it) => {
      const id = it.getAttribute("id");
      const href = it.getAttribute("href");
      if (id && href) manifest[id] = href;
    });
    const spineRefs = Array.from(opfDoc.getElementsByTagName("itemref")).map((ir) => ir.getAttribute("idref")).filter(Boolean);
    if (!spineRefs.length) throw new Error("OPF 没有 spine（书没有正文文件）");
    const hrefToTitle = {};
    const navItem = Array.from(opfDoc.getElementsByTagName("item")).find((it) => it.getAttribute("properties") === "nav");
    if (navItem) {
      const navPath = fullPath(navItem.getAttribute("href"));
      const navEntry = zip.file(navPath);
      if (navEntry) {
        try {
          const navXml = await navEntry.async("string");
          const navDoc = new DOMParser().parseFromString(navXml, "application/xhtml+xml");
          const navEl = navDoc.querySelector('nav[*|type="toc"]') || navDoc.querySelector("nav");
          if (navEl) {
            navEl.querySelectorAll("a[href]").forEach((a) => {
              const href = a.getAttribute("href").split("#")[0];
              const label = (a.textContent || "").trim();
              if (href && label) hrefToTitle[href] = label;
            });
          }
        } catch (e) {
        }
      }
    }
    const ncxItem = Array.from(opfDoc.getElementsByTagName("item")).find((it) => (it.getAttribute("media-type") || "").includes("ncx"));
    if (ncxItem && Object.keys(hrefToTitle).length === 0) {
      const ncxPath = fullPath(ncxItem.getAttribute("href"));
      const ncxEntry = zip.file(ncxPath);
      if (ncxEntry) {
        try {
          const ncxXml = await ncxEntry.async("string");
          const ncxDoc = new DOMParser().parseFromString(ncxXml, "application/xml");
          Array.from(ncxDoc.getElementsByTagName("navPoint")).forEach((np) => {
            const labelEl = np.getElementsByTagName("text")[0];
            const contentEl = np.getElementsByTagName("content")[0];
            if (labelEl && contentEl) {
              const href = (contentEl.getAttribute("src") || "").split("#")[0];
              const label = (labelEl.textContent || "").trim();
              if (href && label) hrefToTitle[href] = label;
            }
          });
        } catch (e) {
        }
      }
    }
    const out = [];
    let processedCount = 0;
    let foundContentCount = 0;
    for (const idref of spineRefs) {
      const relHref = manifest[idref];
      if (!relHref) continue;
      const filePath = fullPath(relHref);
      const entry = zip.file(filePath);
      if (!entry) continue;
      processedCount++;
      let html;
      try {
        html = await entry.async("string");
      } catch (e) {
        continue;
      }
      if (!html) continue;
      let doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
      if (doc.querySelector("parsererror") || !doc.documentElement) {
        doc = new DOMParser().parseFromString(html, "text/html");
      }
      const body = doc.body || doc.querySelector("body") || doc.documentElement;
      if (!body) continue;
      const blocks = extractEpubParagraphs(body);
      if (blocks.length) foundContentCount++;
      let chapterTitle = null;
      if (hrefToTitle[relHref]) chapterTitle = hrefToTitle[relHref];
      if (!chapterTitle) {
        const h = body.querySelector && body.querySelector("h1, h2, h3");
        if (h) chapterTitle = (h.textContent || "").trim();
      }
      blocks.forEach((text, j) => {
        out.push({
          text,
          chapter: j === 0 && chapterTitle ? chapterTitle : null
        });
      });
    }
    if (!out.length) {
      throw new Error("0 段（spine " + spineRefs.length + " 项 · 找到文件 " + processedCount + " · 有内容 " + foundContentCount + "）");
    }
    return { title: epubTitle, author: epubAuthor, paragraphs: out };
  }
  function epubToShelfBook(parsed, opts) {
    opts = opts || {};
    const paras = parsed.paragraphs;
    const totalPages = Math.max(1, Math.ceil(paras.length / PAGE_SIZE));
    const toc = [];
    paras.forEach((p, i) => {
      if (p.chapter) {
        const page = Math.floor(i / PAGE_SIZE) + 1;
        toc.push({ title: p.chapter, page, paraIdx: i });
      }
    });
    const text = [{
      chapter: 1,
      page: 1,
      paragraphs: paras.map((p) => p.text)
    }];
    const COVER_KEYS = ["ink", "sage", "rose", "cream", "night", "rust", "bone", "slate"];
    const id = opts.id || "book_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    let h = 0;
    for (const c of id) h = (h << 5) - h + c.charCodeAt(0) | 0;
    const cover = COVER_KEYS[Math.abs(h) % COVER_KEYS.length];
    const today = typeof TODAY_SHELF !== "undefined" && TODAY_SHELF ? TODAY_SHELF : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return {
      id,
      title: parsed.title || opts.fallbackTitle || "未命名",
      author: parsed.author || opts.fallbackAuthor || "",
      cover,
      status: "reading",
      progress: 0,
      currentPage: 1,
      totalPages,
      addedAt: today,
      lastReadAt: today,
      toc,
      annotations: [],
      text
    };
  }
  window.NestEpubParse = { readEpub, epubToShelfBook, PAGE_SIZE };
})();
(function() {
  function textToParas(raw) {
    let s = String(raw || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
    let blocks = s.split(/\n[ \t]*\n+/);
    if (blocks.length <= 1) blocks = s.split(/\n+/);
    return blocks.map((b) => b.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  }
  function isChapterHeading(line) {
    const t = String(line || "").trim();
    if (!t || t.length > 40) return false;
    if (/^#{1,4}\s+\S/.test(t)) return true;
    if (/^第\s*[0-9零一二三四五六七八九十百千两]+\s*[章节回卷篇折部]/.test(t)) return true;
    if (/^(chapter|part|book|section)\s+[0-9ivxlcdm]+/i.test(t)) return true;
    if (/^(序章|序言|楔子|前言|引子|后记|後記|尾声|终章|番外|附录)/.test(t)) return true;
    return false;
  }
  function textWithChapters(raw) {
    return textToParas(raw).map((p) => {
      const head = isChapterHeading(p);
      const text = p.replace(/^#{1,4}\s+/, "");
      return { text, chapter: head ? text.trim() : null };
    });
  }
  function htmlToParas(html) {
    const BLOCK = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre";
    try {
      const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      const body = doc.body || doc.documentElement;
      if (!body) return [];
      const out = [];
      const els = body.querySelectorAll(BLOCK);
      els.forEach((el) => {
        if (el.querySelector && el.querySelector(BLOCK)) return;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      });
      if (out.length) return out;
      const all = (body.textContent || "").trim();
      return all ? textToParas(all) : [];
    } catch (e) {
      return textToParas(String(html || "").replace(/<[^>]+>/g, "\n"));
    }
  }
  window.NestTextParse = { textToParas, textWithChapters, htmlToParas, isChapterHeading };
})();
(function() {
  const VERSION = "3.11.174";
  const PKG = "https://unpkg.com/pdfjs-dist@" + VERSION + "/";
  const BUILD = PKG + "legacy/build/";
  let _libPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      let done = false;
      const to = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error("pdf.js 脚本加载超时（网络慢 / CDN 不通）"));
        }
      }, 25e3);
      s.onload = () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          resolve();
        }
      };
      s.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          reject(new Error("pdf.js 脚本加载失败（CDN 不通？）"));
        }
      };
      document.head.appendChild(s);
    });
  }
  function fetchText(url) {
    return Promise.race([
      fetch(url).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("超时")), 25e3))
    ]);
  }
  function loadLib() {
    if (window.pdfjsLib && window.pdfjsLib.__nestReady) return Promise.resolve(window.pdfjsLib);
    if (_libPromise) return _libPromise;
    _libPromise = (async () => {
      if (!window.pdfjsLib) await loadScript(BUILD + "pdf.min.js");
      const lib = window.pdfjsLib;
      if (!lib) throw new Error("pdf.js 加载了但没挂到 window.pdfjsLib");
      if (!lib.GlobalWorkerOptions.workerSrc) {
        const src = await fetchText(BUILD + "pdf.worker.min.js");
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
      }
      lib.__nestReady = true;
      return lib;
    })().catch((e) => {
      _libPromise = null;
      throw e;
    });
    return _libPromise;
  }
  const isCJK = (ch) => !!ch && /[㐀-鿿豈-﫿぀-ヿ가-힯]/.test(ch);
  const endsSentence = (t) => /[.!?。！？”’」』）)\]]\s*$/.test(t);
  function cleanMeta(s) {
    if (!s) return "";
    let t = String(s).trim();
    t = t.replace(/[,，;；、\s]*[A-Za-z]+\.com[a-z0-9]*/gi, "");
    t = t.replace(/\.(pdf|epub)$/i, "");
    t = t.replace(/^[\s,，;；、_\-]+|[\s,，;；、_\-]+$/g, "");
    return t.trim();
  }
  const isPageNumLine = (t) => {
    const s = t.trim();
    if (!s) return true;
    if (/^[0-9]{1,4}$/.test(s)) return true;
    if (/^[ivxlcdm]{1,7}$/i.test(s)) return true;
    if (/^(第\s*)?[0-9]{1,4}\s*(页|\/\s*[0-9]{1,4})?$/.test(s)) return true;
    if (/^[\-—·•※\s]*[0-9]{1,4}[\-—·•※\s]*$/.test(s)) return true;
    return false;
  };
  function pageToLines(tc) {
    const items = [];
    for (const it of tc.items) {
      if (it.str === void 0 || it.str === "") continue;
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      items.push({ str: it.str, x: tr[4], y: tr[5], w: it.width || 0, size: Math.abs(tr[3]) || it.height || 10 });
    }
    if (!items.length) return [];
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups = [];
    let cur = null;
    for (const e of items) {
      if (cur && Math.abs(e.y - cur.y) <= Math.max(1.5, cur.size * 0.5)) {
        cur.parts.push(e);
      } else {
        if (cur) groups.push(cur);
        cur = { y: e.y, size: e.size, parts: [e] };
      }
    }
    if (cur) groups.push(cur);
    const lines = [];
    for (const g of groups) {
      g.parts.sort((a, b) => a.x - b.x);
      let text = "";
      for (let i = 0; i < g.parts.length; i++) {
        const p = g.parts[i];
        if (i > 0) {
          const prev = g.parts[i - 1];
          const gap = p.x - (prev.x + prev.w);
          const endSp = /\s$/.test(text);
          const cjkBoundary = isCJK(text.slice(-1)) && isCJK(p.str[0] || "");
          if (!endSp && !cjkBoundary && gap > p.size * 0.28) text += " ";
        }
        text += p.str;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text) lines.push({ text, x: g.parts[0].x, y: g.y, size: g.size });
    }
    return lines;
  }
  async function readPdf(file) {
    const lib = await loadLib();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({
      data: buf,
      isEvalSupported: false,
      // 中文 PDF 常用预定义 CMap 的 CID 字体（如 UniGB-UCS2-H），不挂 cMap 抽出来会乱码/空。
      // 只抽文字不渲染，所以不需要 standardFontDataUrl。
      cMapUrl: PKG + "cmaps/",
      cMapPacked: true
    }).promise;
    let title = "", author = "";
    try {
      const md = await pdf.getMetadata();
      if (md && md.info) {
        title = cleanMeta(md.info.Title);
        author = cleanMeta(md.info.Author);
      }
    } catch (e) {
    }
    const pageChapter = {};
    try {
      const outline = await pdf.getOutline();
      if (outline && outline.length) {
        const flat = [];
        (function rec(items) {
          for (const it of items) {
            flat.push(it);
            if (it.items && it.items.length) rec(it.items);
          }
        })(outline);
        for (const it of flat) {
          const t = (it.title || "").trim();
          if (!t) continue;
          let dest = it.dest;
          try {
            if (typeof dest === "string") dest = await pdf.getDestination(dest);
          } catch (e) {
            dest = null;
          }
          if (!Array.isArray(dest) || !dest[0]) continue;
          let idx;
          try {
            idx = await pdf.getPageIndex(dest[0]);
          } catch (e) {
            continue;
          }
          if (idx != null && pageChapter[idx] === void 0) pageChapter[idx] = t;
        }
      }
    } catch (e) {
    }
    const hasOutline = Object.keys(pageChapter).length > 0;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      try {
        const pg = await pdf.getPage(n);
        const tc = await pg.getTextContent();
        pages.push(pageToLines(tc));
        if (pg.cleanup) pg.cleanup();
      } catch (e) {
        pages.push([]);
      }
    }
    const totalChars = pages.reduce((a, ls) => a + ls.reduce((b, l) => b + l.text.length, 0), 0);
    if (totalChars < 20) throw new Error("这个 PDF 像是扫描图片，没有可提取的文字（需要 OCR，暂不支持）");
    const freq = {};
    const norm = (t) => t.replace(/\d+/g, "#").trim();
    for (const ls of pages) {
      if (!ls.length) continue;
      [ls[0], ls[ls.length - 1]].forEach((l) => {
        const k = norm(l.text);
        if (k.length <= 60) freq[k] = (freq[k] || 0) + 1;
      });
    }
    const livePages = pages.filter((p) => p.length).length || 1;
    const isRunning = (t) => {
      const k = norm(t);
      return !!k && freq[k] >= 3 && freq[k] >= livePages * 0.25 && t.length <= 60;
    };
    const sizes = [];
    for (const ls of pages) for (const l of ls) sizes.push(l.size);
    sizes.sort((a, b) => a - b);
    const bodySize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 12;
    const out = [];
    const pushPara = (text, chapter) => {
      const t = (text || "").replace(/\s+/g, " ").trim();
      if (t) out.push({ text: t, chapter: chapter || null });
    };
    let carry = null;
    for (let pi = 0; pi < pages.length; pi++) {
      const ls = pages[pi].filter((l) => !isRunning(l.text) && !isPageNumLine(l.text));
      const pageCh = hasOutline ? pageChapter[pi] || null : null;
      if (pageCh && carry) {
        pushPara(carry.text, carry.chapter);
        carry = null;
      }
      if (!ls.length) continue;
      const leftMargin = ls.reduce((m, l) => Math.min(m, l.x), Infinity);
      let para = carry ? carry.text : "";
      let paraCh = carry ? carry.chapter : null;
      carry = null;
      let pageChUsed = false;
      const takePageCh = () => {
        if (pageCh && !pageChUsed) {
          pageChUsed = true;
          return pageCh;
        }
        return null;
      };
      const flush = () => {
        if (para) {
          pushPara(para, paraCh || takePageCh());
          para = "";
          paraCh = null;
        }
      };
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        const isHeading = !hasOutline && l.size > bodySize * 1.28 && l.text.length > 0 && l.text.length < 48;
        if (isHeading) {
          flush();
          pushPara(l.text, l.text);
          continue;
        }
        if (para) {
          let brk = false;
          if (i > 0) {
            const gap = ls[i - 1].y - l.y;
            if (gap > l.size * 1.8) brk = true;
          }
          if (l.x - leftMargin > bodySize * 1.1) brk = true;
          if (brk) flush();
        }
        if (!para) {
          para = l.text;
        } else {
          const a = para.slice(-1), b = l.text[0] || "";
          if (/-$/.test(para) && /[A-Za-z]/.test(b)) para = para.slice(0, -1) + l.text;
          else if (isCJK(a) && isCJK(b)) para += l.text;
          else para += " " + l.text;
        }
      }
      if (para) {
        const ch = paraCh || takePageCh();
        if (endsSentence(para)) pushPara(para, ch);
        else carry = { text: para, chapter: ch };
      }
    }
    if (carry) pushPara(carry.text, carry.chapter);
    if (!out.length) throw new Error("解析出 0 段（PDF 文字层异常）");
    return {
      title: title || cleanMeta((file.name || "").replace(/\.pdf$/i, "")) || "未命名",
      author: author || "",
      paragraphs: out
    };
  }
  window.NestPdfParse = { readPdf, loadLib };
})(); 
