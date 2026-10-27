function todayShelf() {
  const d = /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const TODAY_SHELF_LITERAL = todayShelf;
Object.defineProperty(globalThis, "TODAY_SHELF", { get: todayShelf, configurable: true });
const HIGHLIGHTS = {
  yellow: { id: "yellow", bg: "rgba(245, 217, 132, 0.55)", dot: "#F1C36B" },
  pink: { id: "pink", bg: "rgba(240, 169, 154, 0.55)", dot: "#E89889" },
  green: { id: "green", bg: "rgba(168, 196, 154, 0.55)", dot: "#9CB78C" },
  blue: { id: "blue", bg: "rgba(143, 168, 192, 0.55)", dot: "#8FA8C0" }
};
const COVERS = {
  ink: { bg: "#1F2530", fg: "#E8DEC9", sub: "#9F8B6C", accent: "#C84A3F" },
  sage: { bg: "#5F6B5A", fg: "#F0EAD8", sub: "#B5AE9B", accent: "#D4C291" },
  rose: { bg: "#7A4A4A", fg: "#F4DBC8", sub: "#C99D85", accent: "#E8A795" },
  cream: { bg: "#EBE2CC", fg: "#3A3025", sub: "#7A6952", accent: "#9F4D3A" },
  night: { bg: "#1A1F2C", fg: "#A8B5C9", sub: "#5C6477", accent: "#E89B8B" },
  rust: { bg: "#A04E36", fg: "#F4E1CC", sub: "#D9A085", accent: "#2A2520" },
  bone: { bg: "#D4C9B0", fg: "#3A2D20", sub: "#8A7559", accent: "#4A3C2A" },
  slate: { bg: "#4A5560", fg: "#E0D9C8", sub: "#A39B85", accent: "#F1C36B" }
};
const SHELF_PROFILES = {
  me: { name: "", avatar: "" },
  ai: { name: "", avatar: "" }
};
const SHELF_AUTHORS = {
  me: { id: "me", name: SHELF_PROFILES.me.name.trim() || "我", cssVar: "--reader-me", deepVar: "--reader-me-deep" },
  ai: { id: "ai", name: SHELF_PROFILES.ai.name.trim() || "AI", cssVar: "--reader-other", deepVar: "--reader-other-deep", solid: "#C2683F" }
};
const DEMO_STORAGE = "nest_bookshelf_demo_library_v1";
const DEMO_PARAGRAPHS = [
  "第一章 留一点时间",
  "书页翻到这里，窗外刚好安静下来。桌上只留一盏灯和半杯水，手机被放到看不见的地方。今晚没有需要赶上的进度，读完这一页，就已经很好。",
  "有些句子不必急着读完。停一下，把此刻的想法留在页边。下一次翻开时，就能遇见今天的自己。",
  "我喜欢给阅读留一点空白。不是每一行都要画线，也不是每个问题都需要马上找到答案。那些暂时说不清的话，可以先收藏起来，等生活慢慢给出注脚。",
  "午后的风从窗缝走过，纸页轻轻抬起一角。书里的小路还没有走到尽头，我却忽然记起很久以前的一次散步。那天没有地图，转过街角，正好遇到一家还开着门的旧书店。",
  "第二章 页边的声音",
  "阅读时偶尔会有这样的瞬间：眼前只是短短一句话，心里却响起很长的回声。我把它标成浅浅的颜色，再写下几个字。记下来的并不是结论，而是我愿意继续想下去的方向。",
  "一条批注可以很短，只是一个问号，或者一句“下次再读”。它们排列在书页旁边，像沿途留下的小石子。回头时，便能找到来时走过的路。",
  "我们读同一本书，也可以看到不同的风景。你停在一朵花前，我记住一扇窗。把这些细小的发现放在一起，故事就多了一条可以继续走的路。",
  "夜色渐深，合上书以后，刚才那一句话还在。它没有催促我改变什么，只是让平常的一天多了一点可以回味的东西。",
  "第三章 下次再见",
  "书签留在这里。明天继续的时候，不必从头寻找，也不用记住页码。让阅读顺着上一次的心情往下走，像接上一场还没聊完的谈话。",
  "一页接着一页，慢慢就读成了一段属于自己的时间。"
];
function demoBook(id, title, cover, status, index) {
  const paras = [...DEMO_PARAGRAPHS];
  const quote = "有些句子不必急着读完。停一下，把此刻的想法留在页边。";
  const annotations = index === 0 ? [
    { id: "demo-note-1", author: "me", chapter: 1, page: 1, paraIdx: 2, rangeStart: 0, rangeEnd: quote.length, color: "yellow", text: quote, note: "你读到这里，会想到什么？", date: todayShelf(), createdAt: 2, comments: [
      { author: "ai", date: todayShelf(), time: "20:16", text: "我想到：慢一点，才会看见句子里的自己。" },
      { author: "me", date: todayShelf(), time: "20:17", text: "那我们就从这一页慢慢聊。" }
    ] },
    { id: "demo-note-ai", author: "ai", chapter: 1, page: 1, paraIdx: 3, rangeStart: 0, rangeEnd: 12, color: "blue", text: paras[3].slice(0, 12), note: "给阅读留白，也给想法留一点位置。", date: todayShelf(), createdAt: 1, comments: [] }
  ] : [];
  return { id, title, author: "NEST 示例文集", description: "用于界面演示的原创示例文字。", cover, status, progress: status === "finished" ? 1 : 0.18 + index * 0.09, currentPage: status === "finished" ? 12 : 2 + index, totalPages: 12, addedAt: todayShelf(), lastReadAt: todayShelf(), _lastReadMs: 100 - index, finishedAt: status === "finished" ? todayShelf() : null, toc: paras.map((p, i) => /^第.+章/.test(p) ? { title: p, page: 1, paraIdx: i } : null).filter(Boolean), annotations, text: [{ chapter: 1, page: 1, paragraphs: paras }] };
}
const DEFAULT_BOOKS = [
  demoBook("slow-pages", "慢读日常", "rust", "reading", 0),
  demoBook("margin-wind", "风在页边", "sage", "reading", 1),
  demoBook("little-lamp", "一盏灯的时间", "ink", "reading", 2),
  demoBook("mountain-mail", "山间来信", "cream", "finished", 3),
  demoBook("room-faraway", "远方的房间", "rose", "finished", 4),
  demoBook("days-in-ink", "把日子写成书", "slate", "finished", 5)
];
function loadDemoBooks() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE));
    if (Array.isArray(saved) && saved.every((b) => b && typeof b.id === "string" && typeof b.title === "string" && Array.isArray(b.annotations) && Array.isArray(b.text))) {
      const role = (author) => !author || author === "me" ? "me" : "ai";
      return saved.map((book) => ({ ...book, annotations: book.annotations.map((annotation) => ({
        ...annotation,
        author: role(annotation.author),
        comments: (annotation.comments || []).map((comment) => ({ ...comment, author: role(comment.author) }))
      })) }));
    }
  } catch {
  }
  return JSON.parse(JSON.stringify(DEFAULT_BOOKS));
}
const BOOKS = loadDemoBooks();
let storageWarningShown = false;
function persistShelf() {
  try {
    localStorage.setItem(DEMO_STORAGE, JSON.stringify(BOOKS));
    return true;
  } catch {
    if (!storageWarningShown) {
      storageWarningShown = true;
      window.alert("本地存储空间不足或被浏览器禁用。本次修改暂存于内存，刷新后可能丢失。");
    }
    return false;
  }
}
function bookById(id) {
  return BOOKS.find((b) => b.id === id);
}
function normalizeMs(v) {
  return typeof v === "number" ? v : Date.parse(v) || 0;
}
function relDate(date) {
  if (!date) return "";
  const n = Math.max(0, Math.floor((/* @__PURE__ */ new Date(todayShelf() + "T00:00:00") - /* @__PURE__ */ new Date(date + "T00:00:00")) / 864e5));
  return n === 0 ? "今天" : n === 1 ? "昨天" : n < 7 ? `${n} 天前` : date.slice(5).replace("-", "/");
}
function touchLastRead(id) {
  const b = bookById(id);
  if (b) {
    b._lastReadMs = Date.now();
    b.lastReadAt = todayShelf();
    persistShelf();
  }
}
function addUserBook(book) {
  BOOKS.unshift(book);
  if (!persistShelf()) {
    BOOKS.shift();
    throw new Error("本地存储空间不足，请先删除不需要的示例书籍。");
  }
}
function removeBook(id) {
  const i = BOOKS.findIndex((b) => b.id === id);
  if (i >= 0) BOOKS.splice(i, 1);
  persistShelf();
}
function renameBook(id, title) {
  const b = bookById(id);
  if (b) {
    b.title = title;
    persistShelf();
  }
}
function upsertUserAnnotation(id, ann) {
  const b = bookById(id);
  if (!b || !ann) return;
  const i = b.annotations.findIndex((a) => a.id === ann.id);
  if (i >= 0) b.annotations[i] = ann;
  else b.annotations.push({ ...ann, createdAt: Date.now() });
  persistShelf();
}
function removeUserAnnotation(id, aid) {
  const b = bookById(id);
  if (b) {
    b.annotations = b.annotations.filter((a) => a.id !== aid);
    persistShelf();
  }
}
function appendReply(aid, reply) {
  for (const b of BOOKS) {
    const a = b.annotations.find((a2) => a2.id === aid);
    if (a) {
      a.comments = [...a.comments || [], reply];
      persistShelf();
      return;
    }
  }
}
function rebuildToc(id) {
  const b = bookById(id);
  if (!b) return [];
  b.toc = (b.text[0]?.paragraphs || []).map((s, i) => window.NestTextParse?.isChapterHeading(s) ? { title: s, page: Math.floor(i / 30) + 1, paraIdx: i } : null).filter(Boolean);
  persistShelf();
  return b.toc;
}
const AI_CHAR_STORAGE = "nest_reader_ai_character_v1";
function getAiCharacter() {
  try {
    const saved = localStorage.getItem(AI_CHAR_STORAGE);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}
function setAiCharacter(char) {
  if (char) localStorage.setItem(AI_CHAR_STORAGE, JSON.stringify({ id: char.id, name: char.name || char.remarkName, avatar: char.avatar || "" }));
  else localStorage.removeItem(AI_CHAR_STORAGE);
}
function getAiCharacterInfo() {
  const saved = getAiCharacter();
  if (saved && saved.name) return { name: saved.name, src: saved.avatar || "" };
  return null;
}
Object.assign(window, { bookById, touchLastRead, addUserBook, removeBook, renameBook, upsertUserAnnotation, removeUserAnnotation, appendReply, rebuildToc, getAiCharacter, setAiCharacter });
const SHELF_SERIF = '"Source Han Serif SC","Songti SC","STSong","PT Serif",Georgia,"Iowan Old Style",serif';
const SHELF_SANS = '-apple-system,"SF Pro","PingFang SC",system-ui,sans-serif';
const sv = (name) => `var(${name})`;
function SlidingSegments({ children, style, variant = "neutral", ...props }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const motion = window.NestSegmentMotion?.mount(ref.current);
    return () => motion?.destroy();
  }, []);
  return /* @__PURE__ */ React.createElement("div", { ...props, "data-nest-segment": variant, ref, style: { "--slide-fill": variant === "underline" ? "var(--accent)" : "var(--bg)", ...style } }, children);
}
function useShelfDark() {
  const get = () => {
    if (typeof document === "undefined") return false;
    const t = document.documentElement.dataset.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setDark(get());
    mq.addEventListener("change", handler);
    const obs = new MutationObserver(handler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", handler);
      obs.disconnect();
    };
  }, []);
  return dark;
}
const navBtn = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 12,
  background: "transparent",
  border: "none",
  color: sv("--text"),
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0
};
const bookNavBtn = {
  width: 32,
  height: 32,
  borderRadius: 16,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0
};
function IconClose() {
  return /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.6", fill: "none", strokeLinecap: "round" }));
}
function IconChevronL() {
  return /* @__PURE__ */ React.createElement("svg", { width: "9", height: "14", viewBox: "0 0 9 14" }, /* @__PURE__ */ React.createElement("path", { d: "M7 1L1 7l6 6", stroke: sv("--text"), strokeWidth: "1.8", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function IconHamburger() {
  return /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("path", { d: "M2 5h14M2 9h14M2 13h10", stroke: sv("--text"), strokeWidth: "1.6", strokeLinecap: "round" }));
}
function IconSearch() {
  return /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("circle", { cx: "8", cy: "8", r: "5.5", stroke: sv("--text"), strokeWidth: "1.6", fill: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M12.5 12.5l3 3", stroke: sv("--text"), strokeWidth: "1.6", strokeLinecap: "round" }));
}
function IconPlus() {
  return /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("path", { d: "M9 3v12M3 9h12", stroke: sv("--text"), strokeWidth: "1.8", strokeLinecap: "round" }));
}
const shelfHeaderStyle = { padding: "58px 16px 8px", display: "flex", alignItems: "center", flexShrink: 0 };
function ShelfSoftEdge({ edge = "top", size = 56, style }) {
  const direction = edge === "top" ? "to bottom" : "to top";
  const layer = { position: "absolute", inset: 0, pointerEvents: "none" };
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-soft-edge", "data-edge": edge, "aria-hidden": "true", style: {
    position: "absolute",
    left: 0,
    right: 0,
    [edge]: 0,
    height: size,
    pointerEvents: "none",
    overflow: "hidden",
    ...style
  } }, [{ blur: 3, end: 100 }, { blur: 10, end: 65 }].map(({ blur, end }) => {
    const mask = `linear-gradient(${direction}, #000 0%, #000 12%, transparent ${end}%)`;
    return /* @__PURE__ */ React.createElement("span", { key: blur, style: { ...layer, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: mask, WebkitMaskImage: mask } });
  }), /* @__PURE__ */ React.createElement("span", { style: { ...layer, background: `linear-gradient(${direction}, var(--bg) 0%, color-mix(in srgb, var(--bg) 96%, transparent) 16%, color-mix(in srgb, var(--bg) 72%, transparent) 40%, color-mix(in srgb, var(--bg) 26%, transparent) 72%, transparent 100%)` } }));
}
function useShelfScrollPosition(scrollRef, enabled = true) {
  React.useLayoutEffect(() => {
    const scroller = scrollRef.current, scope = scroller?.parentElement;
    if (!scroller || !scope) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = enabled ? Math.max(0, scroller.scrollTop) : 0;
      const bottom = enabled ? Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) : 0;
      scope.style.setProperty("--soft-top", String(Math.min(1, top / 32)));
      scope.style.setProperty("--soft-bottom", String(Math.min(1, bottom / 32)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
    const content = new MutationObserver(schedule);
    content.observe(scroller, { childList: true, subtree: true, characterData: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      resize.disconnect();
      content.disconnect();
    };
  }, [scrollRef, enabled]);
}
function ShelfScrollEdges({ scrollRef, enabled = true, topSize = 56, bottomSize = 48, style }) {
  useShelfScrollPosition(scrollRef, enabled);
  if (!enabled) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-scroll-edges", "aria-hidden": "true", style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, ...style } }, /* @__PURE__ */ React.createElement(ShelfSoftEdge, { size: topSize, style: { opacity: "var(--soft-top,0)" } }), /* @__PURE__ */ React.createElement(ShelfSoftEdge, { edge: "bottom", size: bottomSize, style: { opacity: "var(--soft-bottom,0)" } }));
}
function ShelfScrollArea({ children, scrollRef: externalRef, style, ...props }) {
  const ownRef = React.useRef(null), scrollRef = externalRef || ownRef;
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-scroll-area", style: { position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } }, /* @__PURE__ */ React.createElement("div", { ...props, ref: scrollRef, style: { flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", ...style } }, children), /* @__PURE__ */ React.createElement(ShelfScrollEdges, { scrollRef }));
}
function ShelfLibraryViewport({ header, children }) {
  const scrollRef = React.useRef(null), headerRef = React.useRef(null), layoutRef = React.useRef(null);
  useShelfScrollPosition(scrollRef);
  React.useLayoutEffect(() => {
    const header2 = headerRef.current, layout = layoutRef.current;
    const measure = () => layout.style.setProperty("--library-header-height", `${header2.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header2);
    return () => observer.disconnect();
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-library-layout", ref: layoutRef }, /* @__PURE__ */ React.createElement("div", { className: "shelf-library-chrome", ref: headerRef }, /* @__PURE__ */ React.createElement("div", { className: "shelf-library-material", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "shelf-library-solid" }), /* @__PURE__ */ React.createElement(ShelfSoftEdge, { size: 64, style: { top: "calc(100% - 32px)", opacity: "var(--soft-top,0)" } })), header), /* @__PURE__ */ React.createElement("div", { className: "shelf-library-scroll", ref: scrollRef }, children), /* @__PURE__ */ React.createElement(ShelfSoftEdge, { edge: "bottom", size: 48, style: { zIndex: 5, opacity: "var(--soft-bottom,0)" } }));
}
function ShelfBackToTop({ scrollRef, enabled = true }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) {
      setVisible(false);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(scroller.scrollTop > Math.max(480, scroller.clientHeight));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    update();
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      resize.disconnect();
    };
  }, [scrollRef, enabled]);
  if (!enabled || !visible) return null;
  return /* @__PURE__ */ React.createElement("button", { type: "button", className: "shelf-back-to-top", "aria-label": "返回顶部", onClick: () => scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), style: {
    position: "absolute",
    right: 20,
    bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
    zIndex: 20,
    width: 44,
    height: 44,
    padding: 0,
    border: 0,
    borderRadius: "50%",
    background: "#1A1714",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,.16)"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12 19V5m-6 6 6-6 6 6" })));
}
function ShelfTopBar({ title, left, right, sideWidth = 40, softEdge = false }) {
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-topbar", style: {
    ...shelfHeaderStyle,
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: sv("--bg")
  } }, softEdge && /* @__PURE__ */ React.createElement(ShelfSoftEdge, { size: 44, style: { top: "100%", opacity: "var(--soft-top,0)" } }), /* @__PURE__ */ React.createElement("div", { style: { width: sideWidth, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-start" } }, left), /* @__PURE__ */ React.createElement("div", { style: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontFamily: SHELF_SANS,
    fontSize: 16,
    fontWeight: 600,
    color: sv("--text"),
    letterSpacing: 0.3
  } }, title), /* @__PURE__ */ React.createElement("div", { style: { width: sideWidth, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end" } }, right));
}
function BookCover({ book, w = 124, h = 178, showSpine = true }) {
  const palette = COVERS[book.cover] || COVERS.ink;
  const edge = Math.max(0.7, w * 0.018);
  return /* @__PURE__ */ React.createElement("div", { className: "book-cover", style: { width: w, height: h, position: "relative", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", inset: `0 ${-edge}px 0 0`, background: palette.bg, borderRadius: "2px 4px 4px 2px", boxShadow: `inset -1px -1px 1px rgba(0,0,0,.30),0 ${w * 0.06}px ${w * 0.12}px rgba(0,0,0,.17)` } }), /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: edge * 2.5, bottom: edge * 2.5, right: -edge * 0.68, width: edge * 1.6, background: "#DAD4C7", borderRadius: "0 2px 2px 0", boxShadow: "inset -1px 0 1px rgba(40,30,20,.16)" } }), /* @__PURE__ */ React.createElement("div", { style: {
    width: w,
    height: h,
    position: "relative",
    borderRadius: "2px 3px 3px 2px",
    background: palette.bg,
    // Smooth hard cover: crisp board edges, soft reflected light, no texture or recessed center.
    backgroundImage: "linear-gradient(110deg,rgba(255,255,255,.045),transparent 40%,rgba(0,0,0,.025))",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.20),inset -1px 0 0 rgba(0,0,0,.13),inset 0 -1px 0 rgba(0,0,0,.22)`,
    overflow: "hidden",
    flexShrink: 0
  } }, showSpine && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: w * 0.045,
    background: "linear-gradient(90deg,rgba(0,0,0,.23),rgba(255,255,255,.06) 48%,transparent)"
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: w * 0.13,
    top: h * 0.1,
    width: w * 0.08,
    height: 1.5,
    background: palette.accent,
    opacity: 0.85
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: w * 0.13,
    right: w * 0.13,
    top: h * 0.18,
    fontFamily: SHELF_SERIF,
    fontSize: book.title.length > 10 ? w * 0.11 : w * 0.135,
    fontWeight: 700,
    color: palette.fg,
    lineHeight: 1.2,
    letterSpacing: book.title.match(/[\u4e00-\u9fa5]/) ? 1 : 0,
    textWrap: "balance"
  } }, book.title), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: w * 0.13,
    right: w * 0.13,
    top: h * 0.55,
    height: 0.5,
    background: palette.sub,
    opacity: 0.6
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: w * 0.13,
    right: w * 0.13,
    top: h * 0.6,
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: w * 0.08,
    color: palette.sub,
    letterSpacing: 0.3
  } }, book.author), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: w * 0.13,
    bottom: h * 0.1,
    width: w * 0.18,
    height: 2,
    background: palette.accent
  } })));
}
function SegmentedTabs({ value, options, onChange }) {
  return /* @__PURE__ */ React.createElement(SlidingSegments, { style: {
    display: "flex",
    background: sv("--bg2"),
    borderRadius: 12,
    padding: 3,
    margin: "4px 20px 0",
    position: "relative"
  } }, options.map((o) => {
    const isActive = value === o.k;
    return /* @__PURE__ */ React.createElement("button", { "aria-pressed": isActive, key: o.k, onClick: () => onChange(o.k), style: {
      flex: 1,
      padding: "8px 10px",
      borderRadius: 10,
      background: isActive ? sv("--bg") : "transparent",
      border: "none",
      cursor: "pointer",
      fontFamily: SHELF_SANS,
      fontSize: 13,
      fontWeight: 700,
      color: isActive ? sv("--text") : sv("--text2"),
      letterSpacing: 0.3,
      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      transition: "all 200ms"
    } }, o.label, " ", /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500, color: sv("--text3"), marginLeft: 2 } }, o.count));
  }));
}
function ContinueHero({ book, onOpen, onResume }) {
  const progress = Math.round(Math.max(0, Math.min(1, Number(book.progress) || 0)) * 100);
  return /* @__PURE__ */ React.createElement("section", { className: "shelf-current", "aria-label": "继续阅读" }, /* @__PURE__ */ React.createElement("button", { className: "shelf-current-open", "aria-label": `查看${book.title}详情`, onClick: onOpen }), /* @__PURE__ */ React.createElement("div", { className: "shelf-current-cover" }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 76, h: 112 })), /* @__PURE__ */ React.createElement("div", { className: "shelf-current-copy" }, /* @__PURE__ */ React.createElement("div", { className: "shelf-eyebrow" }, "继续阅读"), /* @__PURE__ */ React.createElement("h2", null, book.title), /* @__PURE__ */ React.createElement("p", null, book.author), /* @__PURE__ */ React.createElement("div", { className: "shelf-current-bottom" }, /* @__PURE__ */ React.createElement("span", null, "已读 ", progress, "%"), /* @__PURE__ */ React.createElement("button", { className: "shelf-resume", onClick: () => onResume(book.id) }, "接着读"))));
}
function BookGridCard({ book, onOpen, index = 0 }) {
  const progress = Math.round(Math.max(0, Math.min(1, Number(book.progress) || 0)) * 100);
  return /* @__PURE__ */ React.createElement("button", { className: "shelf-book", onClick: onOpen, "aria-label": `查看${book.title}详情` }, /* @__PURE__ */ React.createElement("div", { className: "shelf-book-cover", style: { "--cover-angle": `${[-3, 2, -1, 2, 0, -2][index % 6]}deg` } }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 116, h: 169 })), /* @__PURE__ */ React.createElement("span", { className: "shelf-book-title" }, book.title), /* @__PURE__ */ React.createElement("span", { className: "shelf-book-author" }, book.author), /* @__PURE__ */ React.createElement("span", { className: "shelf-book-state" }, book.status === "finished" ? "已读完" : `已读 ${progress}%`));
}
function LibraryBookRow({ book, onOpen }) {
  const progress = Math.round(Math.max(0, Math.min(1, Number(book.progress) || 0)) * 100);
  const description = typeof book.description === "string" ? book.description.trim() : "";
  return /* @__PURE__ */ React.createElement("button", { className: "library-book-row", onClick: onOpen, "aria-label": `查看${book.title}详情` }, /* @__PURE__ */ React.createElement("div", { className: "library-book-cover" }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 70, h: 102 })), /* @__PURE__ */ React.createElement("div", { className: "library-book-copy" }, /* @__PURE__ */ React.createElement("span", { className: "library-book-title" }, book.title), book.author && /* @__PURE__ */ React.createElement("span", { className: "library-book-author" }, book.author), description && /* @__PURE__ */ React.createElement("span", { className: "library-book-description" }, description), /* @__PURE__ */ React.createElement("span", { className: "library-book-progress" }, book.status === "finished" ? "已读完" : `已读 ${progress}%`)));
}
function ShelfView({ onOpenBook, onResume, onUpload, isShelfActive = true }) {
  const [tab, setTab] = React.useState("reading");
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [libraryTab, setLibraryTab] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const libraryFocusRef = React.useRef(null);
  const byRecent = (a, b) => (b._lastReadMs || 0) - (a._lastReadMs || 0) || (b.lastReadAt || b.addedAt || "").localeCompare(a.lastReadAt || a.addedAt || "");
  const reading = BOOKS.filter((b) => b.status === "reading").sort(byRecent);
  const finished = BOOKS.filter((b) => b.status === "finished").sort(byRecent);
  const hero = reading[0];
  const rest = tab === "reading" ? reading.filter((b) => b.id !== hero?.id) : finished;
  const recent = rest.slice(0, 6);
  const needle = query.trim().toLocaleLowerCase();
  const collection = BOOKS.filter((b) => (libraryTab === "all" || b.status === libraryTab) && (!needle || `${b.title} ${b.author || ""}`.toLocaleLowerCase().includes(needle))).sort(byRecent);
  const openLibrary = (event) => {
    openerRef.current = event.currentTarget;
    libraryFocusRef.current = null;
    setQuery("");
    setLibraryTab("all");
    setLibraryOpen(true);
  };
  const closeLibrary = () => {
    setLibraryOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
  };
  React.useEffect(() => {
    if (!libraryOpen || !isShelfActive) return;
    const root = document.getElementById("nest-bookshelf-root");
    const wasInert = root?.inert;
    if (root) root.inert = true;
    (libraryFocusRef.current || panelRef.current?.querySelector("button"))?.focus({ preventScroll: true });
    return () => {
      if (root) root.inert = wasInert;
    };
  }, [libraryOpen, isShelfActive]);
  const panelKeys = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLibrary();
    }
    if (e.key !== "Tab") return;
    const controls = [...panelRef.current.querySelectorAll("button,input")];
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  return /* @__PURE__ */ React.createElement("main", { className: "cover-shelf" }, /* @__PURE__ */ React.createElement("style", null, `
      .cover-shelf { max-width: 620px; margin: auto; padding: 8px 0 calc(100px + env(safe-area-inset-bottom, 0px)); }
      .cover-shelf button:focus-visible,.shelf-library button:focus-visible { outline: 2px solid var(--reader-other-deep); outline-offset: 4px; }
      .shelf-toolbar { margin: 0 22px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .shelf-status { display:flex; gap:4px; padding:3px; background:var(--bg2); border-radius:13px; }
      .shelf-status button { background:none; border:0; border-radius:10px; padding:8px 14px; font-size:12px; color:var(--text2); cursor:pointer; }
      .shelf-status button[aria-pressed=true] { color:var(--text); background:var(--bg); box-shadow:0 1px 4px #00000009; font-weight:600; }
      .shelf-status small { font-size:10px; margin-left:5px; opacity:.65; font-weight:400; }
      .shelf-row-heading { display:flex; align-items:center; justify-content:space-between; margin:25px 24px 0; font-size:11px; color:var(--text2); }
      .shelf-all { border:0; background:none; font-size:11px; padding:8px 0 8px 12px; color:var(--text2); cursor:pointer; }
      .shelf-carousel { display:flex; gap:20px; padding:20px 25px 22px; overflow-x:auto; overscroll-behavior-x:contain; scroll-snap-type:x proximity; scroll-padding:25px; -webkit-overflow-scrolling:touch; }
      .shelf-book { flex:0 0 116px; min-width:0; display:flex; flex-direction:column; align-items:stretch; padding:0; border:0; background:none; text-align:left; cursor:pointer; scroll-snap-align:start; }
      .shelf-book-cover { height:169px; margin-bottom:20px; align-self:center; transform:rotate(var(--cover-angle)); transform-origin:50% 85%; }
      .shelf-book-title { font:600 13px/1.45 ${SHELF_SERIF}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .shelf-book-author { margin-top:4px; font-size:11px; line-height:1.5; color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .shelf-book-state { margin-top:9px; font-size:10px; color:var(--text3); }
      .shelf-current { position:relative; display:flex; align-items:center; gap:20px; margin:8px 22px 24px; padding:23px 20px; border-radius:21px; background:var(--card); }
      .shelf-current-open { position:absolute; inset:0; z-index:2; border:0; border-radius:inherit; background:none; cursor:pointer; }
      .shelf-current-cover { transform:rotate(-6deg); flex-shrink:0; }
      .shelf-current-copy { flex:1; min-width:0; }
      .shelf-eyebrow { font-size:10px; color:var(--text2); letter-spacing:1px; }
      .shelf-current h2 { font:600 18px/1.4 ${SHELF_SERIF}; margin:8px 0 5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .shelf-current p { font-size:11px; color:var(--text2); margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .shelf-current-bottom { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:18px; }
      .shelf-current-bottom span { color:var(--text2); font-size:10px; white-space:nowrap; }
      .shelf-resume { position:relative; z-index:3; background:var(--accent); color:var(--on-accent); border:0; border-radius:18px; padding:8px 14px; font-size:12px; cursor:pointer; white-space:nowrap; }
      .shelf-empty { padding:34px 24px; font-size:12px; line-height:1.8; color:var(--text2); text-align:center; }
      .shelf-empty button { display:block; margin:16px auto 0; }
      .shelf-library { position:fixed; inset:0; z-index:90; background:var(--bg); display:flex; flex-direction:column; animation:shelf-library-in 180ms ease-out; }
      .shelf-library-head { flex-shrink:0; padding:8px 22px 18px; width:100%; max-width:620px; margin:0 auto; }
      .shelf-close { display:flex; align-items:center; justify-content:center; width:40px; height:40px; padding:0; border:0; background:transparent; color:var(--text); border-radius:0; box-shadow:none; cursor:pointer; font-size:21px; font-weight:300; }
      .shelf-library-search { display:flex; align-items:center; gap:9px; padding:10px 0; background:transparent; border-radius:0; margin-bottom:16px; }
      .shelf-library-search svg { width:15px; height:15px; flex-shrink:0; opacity:.55; }
      .shelf-library-search input { width:100%; min-width:0; border:0; outline:none; background:none; font:16px ${SHELF_SANS}; color:var(--text); }
      .shelf-library-search input::placeholder { font-size:12px; color:var(--text3); }
      .shelf-library-search button { border:0; background:none; color:var(--text2); cursor:pointer; padding:0 3px; }
      .shelf-library-filters { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .shelf-library-filters .shelf-status { background:none; padding:0; gap:4px; }
      .shelf-library-filters .shelf-status button { padding:7px 11px; }
      .shelf-library-filters .shelf-status button[aria-pressed=true] { background:var(--bg2); box-shadow:none; }
      .shelf-library-count { color:var(--text3); font-size:10px; white-space:nowrap; }
      .shelf-library-layout { position:relative; flex:1; min-height:0; isolation:isolate; }
      .shelf-library-chrome { position:absolute; inset:0 0 auto; z-index:10; }
      .shelf-library-material { position:absolute; inset:0; pointer-events:none; z-index:-1; }
      .shelf-library-solid { position:absolute; inset:0 0 32px; background:var(--bg); }
      .shelf-library-chrome > .shelf-topbar { background:transparent!important; }
      .shelf-library-scroll { position:absolute; inset:0; padding-top:var(--library-header-height,222px); overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; scroll-padding-top:var(--library-header-height,222px); }
      .shelf-library-list { display:flex; flex-direction:column; gap:12px; padding:4px 20px calc(28px + env(safe-area-inset-bottom, 0px)); max-width:620px; margin:0 auto; }
      .library-book-row { display:flex; align-items:center; gap:19px; width:100%; padding:19px 18px; border:0; border-radius:18px; background:var(--card); color:var(--text); text-align:left; cursor:pointer; }
      .library-book-row:active { background:var(--card); }
      .library-book-cover { flex:0 0 70px; }
      .library-book-cover > div { box-shadow:0 5px 10px #00000018,inset 4px 0 6px -4px #0006!important; }
      .library-book-copy { display:flex; flex-direction:column; flex:1; min-width:0; }
      .library-book-title { font:600 15px/1.5 ${SHELF_SERIF}; overflow-wrap:anywhere; }
      .library-book-author { margin-top:3px; color:var(--text2); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
      .library-book-description { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-top:9px; color:var(--text2); font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
      .library-book-progress { margin-top:10px; color:var(--text3); font-size:10px; line-height:1.5; }
      @media(max-width:360px) { .shelf-toolbar { margin:0 18px; } .shelf-current { margin-left:18px; margin-right:18px; padding:20px 16px; gap:16px; } .shelf-current h2 { font-size:16px; } .shelf-resume { padding:8px 11px; } .shelf-library-list { padding-left:16px; padding-right:16px; } .library-book-row { padding:16px 14px; gap:15px; } }
      @media(prefers-reduced-motion:reduce) { .shelf-library { animation:none; } }
      @keyframes shelf-library-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    `), hero && /* @__PURE__ */ React.createElement(ContinueHero, { book: hero, onOpen: () => onOpenBook(hero.id), onResume }), /* @__PURE__ */ React.createElement("div", { className: "shelf-toolbar" }, /* @__PURE__ */ React.createElement(SlidingSegments, { className: "shelf-status", "aria-label": "阅读状态" }, [["reading", "在读", reading.length], ["finished", "读完", finished.length]].map(([key, label, count]) => /* @__PURE__ */ React.createElement("button", { key, "aria-pressed": tab === key, onClick: () => {
    setTab(key);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  } }, label, /* @__PURE__ */ React.createElement("small", null, count))))), /* @__PURE__ */ React.createElement("div", { className: "shelf-row-heading" }, /* @__PURE__ */ React.createElement("span", null, tab === "reading" ? "其它在读" : "已读完"), /* @__PURE__ */ React.createElement("button", { className: "shelf-all", onClick: (e) => openLibrary(e) }, "查看全部")), recent.length ? /* @__PURE__ */ React.createElement("div", { className: "shelf-carousel", ref: trackRef, "aria-label": tab === "reading" ? "其它在读书籍" : "已读完书籍" }, recent.map((book, index) => /* @__PURE__ */ React.createElement(BookGridCard, { key: book.id, book, index, onOpen: () => onOpenBook(book.id) }))) : /* @__PURE__ */ React.createElement("div", { className: "shelf-empty" }, !BOOKS.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, "书架还是空的", /* @__PURE__ */ React.createElement("button", { className: "shelf-resume", onClick: onUpload }, "导入书籍")) : tab === "finished" ? "暂无已读完的书" : hero ? "暂无其它在读书籍" : "暂无在读书籍"), libraryOpen && ReactDOM.createPortal(/* @__PURE__ */ React.createElement("section", { className: "shelf-library", style: { display: isShelfActive ? void 0 : "none" }, ref: panelRef, role: "dialog", "aria-modal": "true", "aria-label": "全部书籍", onKeyDown: panelKeys }, /* @__PURE__ */ React.createElement(ShelfLibraryViewport, { header: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ShelfTopBar, { title: "全部书籍", right: /* @__PURE__ */ React.createElement("button", { className: "shelf-close", style: navBtn, "aria-label": "返回书架", onClick: closeLibrary }, /* @__PURE__ */ React.createElement(IconClose, null)) }), /* @__PURE__ */ React.createElement("header", { className: "shelf-library-head" }, /* @__PURE__ */ React.createElement("div", { className: "shelf-library-search" }, /* @__PURE__ */ React.createElement(IconSearch, null), /* @__PURE__ */ React.createElement("input", { ref: searchRef, placeholder: "书名或作者", "aria-label": "搜索书名或作者", value: query, onChange: (e) => setQuery(e.target.value) }), query && /* @__PURE__ */ React.createElement("button", { "aria-label": "清空搜索", onClick: () => {
    setQuery("");
    searchRef.current?.focus();
  } }, /* @__PURE__ */ React.createElement(IconClose, null))), /* @__PURE__ */ React.createElement("div", { className: "shelf-library-filters" }, /* @__PURE__ */ React.createElement(SlidingSegments, { className: "shelf-status", style: { "--slide-fill": "var(--bg2)" } }, [["all", "全部"], ["reading", "在读"], ["finished", "读完"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, "aria-pressed": libraryTab === key, onClick: () => setLibraryTab(key) }, label))), /* @__PURE__ */ React.createElement("span", { className: "shelf-library-count" }, collection.length, " 本")))) }, /* @__PURE__ */ React.createElement("div", { className: "shelf-library-list" }, collection.map((book) => /* @__PURE__ */ React.createElement(LibraryBookRow, { key: book.id, book, onOpen: () => {
    libraryFocusRef.current = document.activeElement;
    onOpenBook(book.id);
  } }))), !collection.length && /* @__PURE__ */ React.createElement("div", { className: "shelf-empty" }, needle ? "未找到匹配的书籍" : "暂无书籍"))), document.body));
}
function BookDetailView({ bookId, onClose, onResume, onJumpAnnotation, onSetStatus, onDelete, initialTab }) {
  const book = bookById(bookId);
  if (!book) return null;
  const [tab, setTab] = React.useState(initialTab || "toc");
  const detailScrollRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuTriggerRef = React.useRef(null);
  const menuItemsRef = React.useRef(null);
  const menuId = React.useId();
  const dismissMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuTriggerRef.current?.focus({ preventScroll: true }));
  };
  React.useEffect(() => {
    if (menuOpen) menuItemsRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [menuOpen]);
  const onMenuKeys = (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      dismissMenu();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [...menuItemsRef.current.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  const [confirming, setConfirming] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [renameVal, setRenameVal] = React.useState("");
  const editorRef = React.useRef(null);
  const actionsOpen = menuOpen || renaming || confirming;
  const closeActions = () => {
    setMenuOpen(false);
    setRenaming(false);
    setConfirming(false);
    requestAnimationFrame(() => menuTriggerRef.current?.focus({ preventScroll: true }));
  };
  const backToActions = () => {
    setRenaming(false);
    setConfirming(false);
    setMenuOpen(true);
  };
  React.useEffect(() => {
    if (renaming) {
      const input = editorRef.current?.querySelector("input");
      input?.focus({ preventScroll: true });
      input?.select();
    } else if (confirming) editorRef.current?.querySelector("[data-cancel]")?.focus({ preventScroll: true });
  }, [renaming, confirming]);
  const onActionsKeys = (e) => {
    if (menuOpen) {
      onMenuKeys(e);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      backToActions();
      return;
    }
    if (e.key === "Tab") {
      const controls = [...editorRef.current.querySelectorAll("button:not(:disabled),input")];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  const [toast, setToast] = React.useState(null);
  const [, forceLocalUpdate] = React.useReducer((x) => x + 1, 0);
  const doDelete = () => {
    setMenuOpen(false);
    setConfirming(false);
    if (onDelete) onDelete(book.id);
  };
  const doRedetectToc = () => {
    closeActions();
    if (!window.rebuildToc) return;
    const next = window.rebuildToc(book.id);
    forceLocalUpdate();
    setTab("toc");
    setToast(next && next.length ? `识别到 ${next.length} 章` : "没找到章节标题");
    setTimeout(() => setToast(null), 2200);
  };
  const doRename = () => {
    const t = renameVal.trim();
    if (!t) return;
    if (window.renameBook) window.renameBook(book.id, t);
    closeActions();
    forceLocalUpdate();
    setToast("已改名");
    setTimeout(() => setToast(null), 1800);
  };
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    background: sv("--bg"),
    zIndex: 100,
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    ...shelfHeaderStyle
  } }, /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "返回", style: navBtn }, /* @__PURE__ */ React.createElement(IconChevronL, null)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, textAlign: "center", fontFamily: SHELF_SANS, fontSize: 14, fontWeight: 600, color: sv("--text") } }, "书籍详情"), /* @__PURE__ */ React.createElement("div", { className: "book-actions-anchor", onKeyDown: actionsOpen ? onActionsKeys : void 0 }, /* @__PURE__ */ React.createElement("style", null, `
            .book-actions-anchor { position:relative; width:40px; height:40px; flex-shrink:0; }
            .book-actions-surface { position:absolute; top:0; right:0; width:40px; height:40px; border-radius:12px; z-index:201; background:transparent; border:1px solid transparent; overflow:hidden; transition:width 240ms cubic-bezier(.32,.72,0,1),height 240ms cubic-bezier(.32,.72,0,1),background-color 160ms,border-radius 240ms,box-shadow 160ms; }
            .book-actions-surface.is-open { width:144px; height:154px; border-radius:16px; background:var(--bg); border-color:transparent; box-shadow:0 8px 28px #00000018,0 1px 4px #0000000d; }
            .book-actions-surface.is-editing { width:min(280px,calc(100vw - 32px)); height:202px; }
            .book-actions-surface.is-confirming { height:202px; }
            :root[data-theme="dark"] .book-actions-surface.is-open { background:var(--card); box-shadow:0 8px 28px #00000050; }
            @media(prefers-color-scheme:dark) { :root:not([data-theme="light"]) .book-actions-surface.is-open { background:var(--card); box-shadow:0 8px 28px #00000050; } }
            .book-action-editor { position:absolute; inset:0; padding:14px 16px 16px; display:flex; flex-direction:column; animation:fadeIn 140ms ease; }
            .book-action-editor-head { display:flex; align-items:center; gap:7px; margin-bottom:18px; }
            .book-action-editor-head h3 { margin:0; font-size:14px; font-weight:600; }
            .book-action-back { display:flex; align-items:center; justify-content:center; width:26px; height:28px; margin-left:-5px; padding:0; background:transparent; border:0; color:var(--text2); cursor:pointer; }
            .book-action-editor input { width:100%; min-width:0; padding:13px 12px; border:0; border-radius:9px; background:var(--bg2); color:var(--text); font:16px/1.4 ${SHELF_SANS}; outline:none; }
            .book-action-editor input:focus-visible { box-shadow:0 0 0 1px var(--line-strong); }
            .book-action-editor-footer { display:flex; justify-content:flex-end; gap:9px; margin-top:auto; }
            .book-action-editor-footer button { min-width:68px; height:36px; padding:0 14px; border:0; border-radius:9px; background:transparent; color:var(--text2); font-size:12px; font-weight:600; cursor:pointer; }
            .book-action-editor-footer .primary { background:var(--accent); color:var(--on-accent); }
            .book-action-editor-footer .danger { background:#C84A3F; color:white; }
            .book-action-editor-footer button:disabled { opacity:.35; cursor:default; }
            .book-action-editor button:focus-visible { outline:1px solid var(--text2); outline-offset:2px; }
            .book-action-target { font-family:${SHELF_SERIF}; font-size:15px; line-height:1.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .book-action-description { margin:9px 0 14px; color:var(--text2); font-size:12px; line-height:1.6; }
            .book-actions-trigger { position:absolute; top:-1px; right:-1px; transition:opacity 120ms!important; }
            .is-open .book-actions-trigger { opacity:0; pointer-events:none; }
            .book-actions-items { position:absolute; top:7px; right:7px; width:128px; display:flex; flex-direction:column; opacity:0; visibility:hidden; transition:opacity 100ms,visibility 0s 240ms; }
            .is-open:not(.is-editing) .book-actions-items { opacity:1; visibility:visible; transition:opacity 140ms 60ms; }
            .book-actions-items button { display:flex; align-items:center; gap:10px; flex:0 0 44px; width:100%; background:transparent; border:0; border-radius:12px; color:var(--text); padding:0 12px; font-size:14px; text-align:left; cursor:pointer; }
            .book-actions-items button:last-child { margin-top:6px; color:#B65E4D; }
            .book-actions-items svg { width:17px; height:17px; flex-shrink:0; opacity:.75; }
            .book-actions-items .book-action-tag { width:14px; height:14px; margin:0 1.5px; }
            .book-actions-items button:focus-visible { outline:1px solid var(--line-strong); outline-offset:-3px; }
            .book-actions-items button:active { background:transparent; }
            @media(prefers-reduced-motion:reduce) { .book-action-editor { animation:none!important; } .book-actions-surface,.book-actions-trigger,.book-actions-items,.is-open:not(.is-editing) .book-actions-items { transition:none!important; } }
          `), actionsOpen && /* @__PURE__ */ React.createElement("div", { onClick: closeActions, style: { position: "fixed", inset: 0, zIndex: 200 } }), /* @__PURE__ */ React.createElement("div", { className: `book-actions-surface${actionsOpen ? " is-open" : ""}${renaming || confirming ? " is-editing" : ""}${confirming ? " is-confirming" : ""}` }, /* @__PURE__ */ React.createElement("button", { ref: menuTriggerRef, className: "book-actions-trigger", "aria-label": "更多书籍操作", "aria-haspopup": "menu", "aria-expanded": actionsOpen, "aria-controls": renaming || confirming ? menuId + "-editor" : menuId, "aria-hidden": actionsOpen || void 0, tabIndex: actionsOpen ? -1 : 0, style: navBtn, onClick: () => setMenuOpen(true) }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "3", r: "1.4", fill: "currentColor" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "9", r: "1.4", fill: "currentColor" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "15", r: "1.4", fill: "currentColor" }))), /* @__PURE__ */ React.createElement("div", { id: menuId, ref: menuItemsRef, className: "book-actions-items", role: "menu", "aria-label": "书籍操作", "aria-hidden": !menuOpen }, /* @__PURE__ */ React.createElement("button", { role: "menuitem", tabIndex: menuOpen ? 0 : -1, onClick: doRedetectToc }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M9 5h11M9 12h11M9 19h8" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "5", r: "1", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "12", r: "1", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "19", r: "1", fill: "currentColor", stroke: "none" })), /* @__PURE__ */ React.createElement("span", null, "识别目录")), /* @__PURE__ */ React.createElement("button", { role: "menuitem", tabIndex: menuOpen ? 0 : -1, onClick: () => {
    setRenameVal(book.title || "");
    setRenaming(true);
    setMenuOpen(false);
  } }, /* @__PURE__ */ React.createElement("svg", { className: "book-action-tag", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" }), /* @__PURE__ */ React.createElement("circle", { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" })), /* @__PURE__ */ React.createElement("span", null, "重命名")), /* @__PURE__ */ React.createElement("button", { role: "menuitem", tabIndex: menuOpen ? 0 : -1, onClick: () => {
    setConfirming(true);
    setMenuOpen(false);
  } }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" })), /* @__PURE__ */ React.createElement("span", null, "从书架删除"))), (renaming || confirming) && /* @__PURE__ */ React.createElement("div", { id: menuId + "-editor", ref: editorRef, className: "book-action-editor", role: "dialog", "aria-modal": "true", "aria-label": renaming ? "重命名" : "从书架删除" }, /* @__PURE__ */ React.createElement("div", { className: "book-action-editor-head" }, /* @__PURE__ */ React.createElement("button", { className: "book-action-back", "aria-label": "返回书籍操作", onClick: backToActions }, /* @__PURE__ */ React.createElement(IconChevronL, null)), /* @__PURE__ */ React.createElement("h3", null, renaming ? "重命名" : "从书架删除")), renaming ? /* @__PURE__ */ React.createElement("input", { "aria-label": "书名", value: renameVal, onChange: (e) => setRenameVal(e.target.value), onKeyDown: (e) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) doRename();
  }, placeholder: "书名" }) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "book-action-target" }, "《", book.title, "》"), /* @__PURE__ */ React.createElement("p", { className: "book-action-description" }, "删除此书及其本地批注。此操作无法撤销。")), /* @__PURE__ */ React.createElement("div", { className: "book-action-editor-footer" }, /* @__PURE__ */ React.createElement("button", { "data-cancel": true, onClick: backToActions }, "取消"), renaming ? /* @__PURE__ */ React.createElement("button", { className: "primary", disabled: !renameVal.trim(), onClick: doRename }, "保存") : /* @__PURE__ */ React.createElement("button", { className: "danger", onClick: doDelete }, "删除")))))), toast && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: "50%",
    top: 90,
    transform: "translateX(-50%)",
    zIndex: 220,
    background: sv("--accent"),
    color: sv("--on-accent"),
    padding: "8px 16px",
    borderRadius: 18,
    fontFamily: SHELF_SANS,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: 0.5,
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    animation: "fadeIn 200ms ease"
  } }, toast), /* @__PURE__ */ React.createElement(ShelfScrollArea, { scrollRef: detailScrollRef, "data-book-detail-scroll": true, style: { flex: 1, overflow: "auto", overflowAnchor: "none" } }, /* @__PURE__ */ React.createElement("div", { style: {
    padding: "12px 24px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 16
  } }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 160, h: 232 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SERIF,
    fontSize: 22,
    fontWeight: 700,
    color: sv("--text"),
    lineHeight: 1.3,
    letterSpacing: 0.5,
    marginBottom: 6,
    textWrap: "balance"
  } }, book.title), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 14,
    color: sv("--text2"),
    letterSpacing: 0.3
  } }, book.author)), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    gap: 24,
    padding: "10px 0 4px"
  } }, /* @__PURE__ */ React.createElement(Stat2, { label: "进度", value: `${Math.round(book.progress * 100)}%` }), /* @__PURE__ */ React.createElement(Stat2, { label: "页码", value: `${book.currentPage}/${book.totalPages}` }), /* @__PURE__ */ React.createElement(Stat2, { label: "批注", value: book.annotations.length })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, width: "100%" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => onResume(book.id), style: {
    width: "100%",
    padding: "14px",
    background: sv("--accent"),
    color: sv("--on-accent"),
    border: "none",
    borderRadius: 14,
    fontFamily: SHELF_SANS,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.5
  } }, book.status === "finished" ? "重新阅读" : "继续阅读"), book.status === "reading" ? /* @__PURE__ */ React.createElement("button", { onClick: () => onSetStatus(book.id, "finished"), style: {
    width: "100%",
    padding: "12px",
    background: sv("--finish-bg"),
    color: sv("--finish-ink"),
    border: "none",
    borderRadius: 14,
    fontFamily: SHELF_SANS,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: 0.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14" }, /* @__PURE__ */ React.createElement("path", { d: "M2 7l3 3 7-7", stroke: sv("--text2"), strokeWidth: "1.8", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" })), "标为读完") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "12px",
    background: sv("--card"),
    border: "0.5px solid " + sv("--card-line"),
    borderRadius: 14,
    fontFamily: SHELF_SANS,
    fontSize: 12,
    color: sv("--text2"),
    letterSpacing: 0.5
  } }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12" }, /* @__PURE__ */ React.createElement("path", { d: "M2 6l2.5 2.5 5.5-5.5", stroke: sv("--text2"), strokeWidth: "1.6", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" })), book.finishedAt ? "读完于 " + book.finishedAt.slice(5).replace("-", "/") : "已读完"), /* @__PURE__ */ React.createElement("button", { onClick: () => onSetStatus(book.id, "reading"), style: {
    padding: "12px 14px",
    background: sv("--reread-bg"),
    color: sv("--reread-ink"),
    border: "none",
    borderRadius: 14,
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: 0.5
  } }, "标为在读")))), /* @__PURE__ */ React.createElement(SlidingSegments, { variant: "underline", style: {
    display: "flex",
    gap: 20,
    padding: "0 24px 4px",
    borderBottom: "0.5px solid " + sv("--line")
  } }, [{ k: "toc", l: "目录" }, { k: "annotations", l: `批注 ${book.annotations.length}` }].map((t) => /* @__PURE__ */ React.createElement("button", { "aria-pressed": tab === t.k, key: t.k, onClick: () => setTab(t.k), style: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "12px 0",
    position: "relative",
    fontFamily: SHELF_SANS,
    fontSize: 14,
    fontWeight: 700,
    color: tab === t.k ? sv("--text") : sv("--text3"),
    letterSpacing: 0.5
  } }, t.l))), tab === "toc" && /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 8px 40px" } }, book.toc.length === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    textAlign: "center",
    padding: "40px 20px",
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 13,
    color: sv("--text3")
  } }, "未识别到目录"), book.toc.map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "row-press", onClick: () => onJumpAnnotation(book.id, c.page, null, c.paraIdx), style: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    cursor: "pointer",
    borderBottom: i === book.toc.length - 1 ? "none" : "0.5px solid " + sv("--line")
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text3"),
    letterSpacing: 0.5,
    width: 28,
    flexShrink: 0
  } }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { style: {
    flex: 1,
    fontFamily: SHELF_SERIF,
    fontSize: 14.5,
    color: sv("--text"),
    letterSpacing: 0.3
  } }, c.title), /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 12,
    color: sv("--text3"),
    marginRight: 10
  } }, "p.", c.page), /* @__PURE__ */ React.createElement("svg", { width: "6", height: "11", viewBox: "0 0 6 11" }, /* @__PURE__ */ React.createElement("path", { d: "M1 1l4 4.5L1 10", stroke: sv("--text3"), strokeWidth: "1.5", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }))))), tab === "annotations" && /* @__PURE__ */ React.createElement("div", { style: { padding: "14px 16px 40px" } }, /* @__PURE__ */ React.createElement(AnnotationSearch, { book, onJumpAnnotation })), false), /* @__PURE__ */ React.createElement(ShelfBackToTop, { scrollRef: detailScrollRef, enabled: tab === "annotations" }));
}
function Stat2({ label, value }) {
  return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 18,
    fontWeight: 800,
    color: sv("--text"),
    letterSpacing: 0.3
  } }, value), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 600,
    marginTop: 2
  } }, label));
}
function AnnotationSearch({ book, onJumpAnnotation }) {
  const [q, setQ] = React.useState("");
  const searchAreaRef = React.useRef(null);
  const savedScrollRef = React.useRef(null);
  const [searchSpace, setSearchSpace] = React.useState({ minHeight: 0, offset: 0 });
  const changeQuery = (value) => {
    const area = searchAreaRef.current;
    const scroll = area?.closest("[data-book-detail-scroll]");
    if (scroll) {
      const offset = Math.max(0, scroll.getBoundingClientRect().top - area.getBoundingClientRect().top);
      savedScrollRef.current = { scroll, top: scroll.scrollTop };
      setSearchSpace({ minHeight: offset + scroll.clientHeight, offset: value.trim() ? offset : 0 });
    }
    setQ(value);
  };
  React.useLayoutEffect(() => {
    const saved = savedScrollRef.current;
    if (saved) {
      saved.scroll.scrollTop = saved.top;
      savedScrollRef.current = null;
    }
  }, [q]);
  const all = React.useMemo(() => {
    return [...book.annotations].sort((a, b) => {
      const dCmp = (b.date || "").localeCompare(a.date || "");
      if (dCmp !== 0) return dCmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [book.annotations]);
  const norm = (s) => (s || "").toLowerCase();
  const ql = q.trim().toLowerCase();
  const pageMatch = ql.match(/^(?:p\.?|第)?\s*(\d+)\s*(?:页)?$/);
  const list = !ql ? all : all.filter((a) => {
    if (pageMatch && String(a.page) === pageMatch[1]) return true;
    if (norm(a.text).includes(ql)) return true;
    if (norm(a.note).includes(ql)) return true;
    if ((a.comments || []).some((c) => norm(c.text).includes(ql))) return true;
    return false;
  });
  return /* @__PURE__ */ React.createElement("div", { ref: searchAreaRef, style: { minHeight: searchSpace.minHeight } }, /* @__PURE__ */ React.createElement("style", null, `.annotation-search-input::placeholder { color:var(--text3); font-size:13px; opacity:1; }`), /* @__PURE__ */ React.createElement("div", { className: "annotation-search-toolbar", style: {
    position: "sticky",
    top: 0,
    zIndex: 8,
    background: sv("--bg"),
    padding: "8px 16px 10px",
    margin: "-8px -16px 4px"
  } }, /* @__PURE__ */ React.createElement(ShelfSoftEdge, { size: 28, style: { top: "100%" } }), /* @__PURE__ */ React.createElement("div", { className: "annotation-search-field", style: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    height: 38,
    padding: "0 13px",
    background: "transparent",
    border: "1px solid " + sv("--line"),
    borderRadius: 20
  } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", style: { flexShrink: 0, opacity: 0.55 } }, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "6", r: "4.2", stroke: sv("--text2"), strokeWidth: "1.4", fill: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M9.5 9.5L12.5 12.5", stroke: sv("--text2"), strokeWidth: "1.4", strokeLinecap: "round" })), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "annotation-search-input",
      type: "text",
      "aria-label": "搜索批注、引文、回复",
      autoComplete: "off",
      enterKeyHint: "search",
      value: q,
      onChange: (e) => changeQuery(e.target.value),
      placeholder: "搜索批注",
      style: {
        flex: 1,
        minWidth: 0,
        border: "none",
        background: "transparent",
        outline: "none",
        WebkitAppearance: "none",
        appearance: "none",
        boxShadow: "none",
        fontFamily: SHELF_SANS,
        fontSize: 16,
        color: sv("--text"),
        height: "100%",
        lineHeight: "20px",
        padding: 0
      }
    }
  ), q && /* @__PURE__ */ React.createElement("button", { "aria-label": "清空批注搜索", onClick: () => changeQuery(""), style: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    width: 28,
    height: 28,
    padding: 0,
    marginRight: -7,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: sv("--text3")
  } }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12" }, /* @__PURE__ */ React.createElement("path", { d: "M3 3l6 6M9 3l-6 6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })))), ql && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "6px 4px 0",
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text3"),
    letterSpacing: 0.3
  } }, list.length, " / ", all.length, " 条匹配")), /* @__PURE__ */ React.createElement("div", { style: { paddingTop: searchSpace.offset } }, all.length === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    textAlign: "center",
    padding: "40px 20px",
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 13,
    color: sv("--text3")
  } }, "还没有批注"), all.length > 0 && list.length === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    textAlign: "center",
    padding: "30px 20px",
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 13,
    color: sv("--text3")
  } }, "没有匹配的批注"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, list.map((a) => {
    const author = SHELF_AUTHORS[a.author || "me"];
    return /* @__PURE__ */ React.createElement("div", { key: a.id, className: "tappable", onClick: () => onJumpAnnotation(book.id, a.page, a.id), style: {
      padding: "14px 16px",
      borderRadius: 14,
      background: sv("--card"),
      border: "0.5px solid " + sv("--card-line"),
      cursor: "pointer"
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: {
      width: 8,
      height: 8,
      borderRadius: 4,
      background: HIGHLIGHTS[a.color].dot
    } }), /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: SHELF_SANS,
      fontSize: 11,
      fontWeight: 700,
      color: sv(author.deepVar),
      letterSpacing: 0.5
    } }, author.name), /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: SHELF_SANS,
      fontSize: 11,
      color: sv("--text3"),
      letterSpacing: 0.5
    } }, "· p.", a.page, " · ", relDate(a.date)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), a.comments && a.comments.length > 0 && /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontFamily: SHELF_SANS,
      fontSize: 11,
      color: sv("--text3")
    } }, /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 11 11" }, /* @__PURE__ */ React.createElement("path", { d: "M1.5 2h8a1 1 0 011 1v4a1 1 0 01-1 1H5l-2.5 2V8H1.5a1 1 0 01-1-1V3a1 1 0 011-1z", fill: "none", stroke: sv("--text3"), strokeWidth: "1.2" })), a.comments.length)), a.text && /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: SHELF_SERIF,
      fontStyle: "normal",
      fontSize: 14,
      lineHeight: 1.6,
      color: sv("--text"),
      background: HIGHLIGHTS[a.color].bg,
      padding: "2px 4px",
      borderRadius: 3,
      display: "inline",
      textWrap: "pretty"
    } }, a.text), a.note && /* @__PURE__ */ React.createElement("div", { style: {
      marginTop: 10,
      paddingTop: 10,
      borderTop: "0.5px dashed " + sv("--line-strong"),
      fontFamily: SHELF_SERIF,
      fontStyle: "normal",
      fontSize: 13,
      color: sv("--text2"),
      lineHeight: 1.6
    } }, a.note), a.comments && a.comments.length > 0 && /* @__PURE__ */ React.createElement("div", { style: {
      marginTop: 10,
      paddingTop: 10,
      borderTop: "0.5px dashed " + sv("--line-strong"),
      display: "flex",
      flexDirection: "column",
      gap: 6
    } }, a.comments.slice(0, 2).map((c, ci) => {
      const ca = SHELF_AUTHORS[c.author];
      return /* @__PURE__ */ React.createElement("div", { key: ci, style: { display: "flex", gap: 6, alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("span", { style: {
        fontFamily: SHELF_SANS,
        fontSize: 11,
        fontWeight: 700,
        color: sv(ca.deepVar),
        letterSpacing: 0.3,
        flexShrink: 0
      } }, ca.name), /* @__PURE__ */ React.createElement("span", { style: {
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 13,
        color: sv("--text2"),
        lineHeight: 1.5,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      } }, c.text));
    }), a.comments.length > 2 && /* @__PURE__ */ React.createElement("div", { style: { fontFamily: SHELF_SANS, fontSize: 11, color: sv("--text3") } }, "还有 ", a.comments.length - 2, " 条")));
  }))));
}
Object.assign(window, {
  SHELF_SERIF,
  SHELF_SANS,
  sv,
  useShelfDark,
  navBtn,
  IconChevronL,
  IconHamburger,
  IconSearch,
  IconPlus,
  ShelfTopBar,
  BookCover,
  SegmentedTabs,
  ContinueHero,
  BookGridCard,
  AddBookTile,
  ShelfView,
  BookDetailView,
  Stat2,
  UploadSheet,
  AnnotationSearch
});
function AddBookTile({ onClick }) {
  return /* @__PURE__ */ React.createElement("div", { onClick, className: "tappable", style: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    cursor: "pointer",
    padding: "4px"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 128,
    height: 186,
    borderRadius: "2px 6px 6px 2px",
    border: "1.5px dashed " + sv("--line-strong"),
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: sv("--card"),
    border: "0.5px solid " + sv("--card-line"),
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("path", { d: "M9 3v12M3 9h12", stroke: sv("--text2"), strokeWidth: "1.8", strokeLinecap: "round" }))), /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text3"),
    letterSpacing: 0.5,
    fontWeight: 600
  } }, "添加书"))), /* @__PURE__ */ React.createElement("div", { style: { padding: "2px 4px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 12,
    color: sv("--text3")
  } }, "EPUB · PDF · 文字")));
}
function UploadSheet({ onClose, onAdded }) {
  const fileRef = React.useRef(null);
  const folderRef = React.useRef(null);
  const [picked, setPicked] = React.useState(null);
  const [parsed, setParsed] = React.useState(null);
  const [parsing, setParsing] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState(null);
  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteBody, setPasteBody] = React.useState("");
  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPicked(f.name);
    setParsed(null);
    setError(null);
    setParsing(true);
    try {
      let r;
      if (/\.pdf$/i.test(f.name)) {
        if (!window.NestPdfParse) throw new Error("PDF 解析模块没加载");
        r = await window.NestPdfParse.readPdf(f);
      } else {
        if (!window.NestEpubParse) throw new Error("解析模块没加载");
        r = await window.NestEpubParse.readEpub(f);
      }
      setParsed(r);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setParsing(false);
    }
  };
  const onPickFolder = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => /\.(txt|text|md|markdown|html?|xhtml)$/i.test(f.name));
    if (!files.length) {
      setError("请选 .txt / .html / .md 这类文本文件");
      return;
    }
    files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "zh", { numeric: true }));
    setPicked(files.length + " 个文件");
    setParsed(null);
    setError(null);
    setParsing(true);
    try {
      const T = window.NestTextParse;
      if (!T) throw new Error("文本解析模块没加载");
      const paragraphs = [];
      for (const f of files) {
        const raw = await f.text();
        const blocks = /\.x?html?$/i.test(f.name) ? T.htmlToParas(raw) : T.textToParas(raw);
        const chapter = f.name.replace(/\.[^.]+$/, "");
        blocks.forEach((t, i) => paragraphs.push({ text: t, chapter: i === 0 ? chapter : null }));
      }
      if (!paragraphs.length) throw new Error("这些文件里没读到文字");
      const rel = files[0].webkitRelativePath || "";
      const folderName = rel.includes("/") ? rel.split("/")[0] : "";
      setParsed({ title: folderName, author: "", paragraphs });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setParsing(false);
    }
  };
  React.useEffect(() => {
    if (mode !== "paste") return;
    const T = window.NestTextParse;
    if (!T || !pasteBody.trim()) {
      setParsed(null);
      return;
    }
    const paras = T.textWithChapters(pasteBody);
    if (!paras.length) {
      setParsed(null);
      return;
    }
    const title = pasteTitle.trim() || paras[0].text.slice(0, 24);
    setParsed({ title, author: "", paragraphs: paras });
  }, [mode, pasteTitle, pasteBody]);
  const onSubmit = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      const book = window.NestEpubParse.epubToShelfBook(parsed, {
        fallbackTitle: picked && /\.(epub|pdf)$/i.test(picked) ? picked.replace(/\.(epub|pdf)$/i, "") : "未命名"
      });
      window.addUserBook(book);
      onAdded && onAdded(book);
      onClose();
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };
  const chapN = parsed ? parsed.paragraphs.filter((p) => p.chapter).length : 0;
  const subtitle = error ? "解析失败：" + error : parsing ? "解析中…" : parsed ? `${picked ? picked + " · " : ""}${parsed.paragraphs.length} 段${chapN ? " · " + chapN + " 章" : ""}` : mode === "paste" ? "粘贴全文 · 空行分段，「第N章 / # 标题」自动成章节" : picked ? `已选择: ${picked}` : "选择来源";
  const options = [
    {
      k: "epub",
      label: "上传 EPUB",
      sub: "从文件中选取 .epub",
      icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 22 22" }, /* @__PURE__ */ React.createElement("path", { d: "M5 3h8l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M13 3v4h4", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("text", { x: "11", y: "16", textAnchor: "middle", fontFamily: SHELF_SANS, fontSize: "5.5", fontWeight: "700", fill: color, letterSpacing: "0.3" }, "EPUB"))
    },
    {
      k: "pdf",
      label: "上传 PDF",
      sub: "从文件中选取 .pdf · 自动转成章节与文字",
      icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 22 22" }, /* @__PURE__ */ React.createElement("path", { d: "M5 3h8l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M13 3v4h4", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("text", { x: "11", y: "16", textAnchor: "middle", fontFamily: SHELF_SANS, fontSize: "5", fontWeight: "700", fill: color, letterSpacing: "0.2" }, "PDF"))
    },
    {
      k: "folder",
      label: "导入文件夹",
      sub: "多选 txt / html，每个文件当一章",
      icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 22 22" }, /* @__PURE__ */ React.createElement("path", { d: "M3 6a1 1 0 011-1h5l2 2h7a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6z", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" }))
    },
    {
      k: "text",
      label: "粘贴文字",
      sub: "作为一篇新的文本读物",
      icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 22 22" }, /* @__PURE__ */ React.createElement("path", { d: "M4 4h14M4 9h14M4 14h10", stroke: color, strokeWidth: "1.6", strokeLinecap: "round" }))
    }
  ];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { onClick: onClose, style: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.32)",
    zIndex: 110,
    animation: "fadeIn 200ms ease"
  } }), /* @__PURE__ */ React.createElement("div", { className: "shelf-upload-sheet", role: "dialog", "aria-modal": "true", "aria-label": "添加一本书" }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 38,
    height: 4,
    borderRadius: 2,
    background: sv("--text3"),
    opacity: 0.4,
    margin: "0 auto 14px"
  } }), /* @__PURE__ */ React.createElement("div", { className: "shelf-upload-head" }, /* @__PURE__ */ React.createElement("h2", null, "添加一本书"), /* @__PURE__ */ React.createElement("button", { "aria-label": "关闭上传", onClick: onClose, style: navBtn }, /* @__PURE__ */ React.createElement(IconClose, null))), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 12,
    color: error ? "#C84A3F" : sv("--text3"),
    marginBottom: 18,
    letterSpacing: 0.5
  } }, subtitle), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: ".epub,.pdf", style: { display: "none" }, onChange: onPickFile }), /* @__PURE__ */ React.createElement("input", { ref: folderRef, type: "file", multiple: true, accept: ".txt,.text,.md,.markdown,.html,.htm,.xhtml", style: { display: "none" }, onChange: onPickFolder }), mode === "paste" && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("input", { value: pasteTitle, onChange: (e) => setPasteTitle(e.target.value), placeholder: "书名（可留空，默认取开头几个字）", style: {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 10,
    padding: "11px 13px",
    borderRadius: 12,
    border: "0.5px solid " + sv("--card-line"),
    background: sv("--card"),
    color: sv("--text"),
    fontFamily: SHELF_SANS,
    fontSize: 14,
    outline: "none"
  } }), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: pasteBody,
      onChange: (e) => setPasteBody(e.target.value),
      rows: 8,
      placeholder: "把全文粘贴到这里…\n\n空行分段；「第一章」「Chapter 2」「# 标题」会自动认成章节。",
      style: {
        width: "100%",
        boxSizing: "border-box",
        padding: "12px 13px",
        borderRadius: 12,
        resize: "none",
        border: "0.5px solid " + sv("--card-line"),
        background: sv("--card"),
        color: sv("--text"),
        fontFamily: SHELF_SANS,
        fontSize: 14,
        lineHeight: 1.65,
        outline: "none"
      }
    }
  )), mode !== "paste" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 } }, options.map((o) => /* @__PURE__ */ React.createElement("button", { className: "shelf-upload-option", key: o.k, onClick: () => {
    setError(null);
    if (o.k === "epub" || o.k === "pdf") {
      const inp = fileRef.current;
      if (inp) {
        inp.accept = o.k === "pdf" ? ".pdf" : ".epub";
        inp.value = "";
        inp.click();
      }
    } else if (o.k === "folder") {
      const inp = folderRef.current;
      if (inp) {
        inp.value = "";
        inp.click();
      }
    } else if (o.k === "text") {
      setPicked(null);
      setParsed(null);
      setMode("paste");
    }
  }, style: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 14,
    background: sv("--card"),
    border: "0.5px solid " + sv("--card-line"),
    cursor: "pointer",
    textAlign: "left"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  } }, o.icon(sv("--text"))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 14,
    fontWeight: 700,
    color: sv("--text"),
    letterSpacing: 0.3
  } }, o.label), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text2"),
    marginTop: 2
  } }, o.sub)), /* @__PURE__ */ React.createElement("svg", { width: "6", height: "11", viewBox: "0 0 6 11" }, /* @__PURE__ */ React.createElement("path", { d: "M1 1l4 4.5L1 10", stroke: sv("--text3"), strokeWidth: "1.5", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: mode === "paste" ? () => {
    setMode(null);
    setParsed(null);
    setPasteBody("");
    setPasteTitle("");
    setError(null);
  } : onClose, style: {
    flex: 1,
    padding: "12px",
    borderRadius: 12,
    background: sv("--bg2"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 13,
    fontWeight: 600,
    color: sv("--text2"),
    letterSpacing: 0.5
  } }, mode === "paste" ? "返回" : "取消"), /* @__PURE__ */ React.createElement("button", { onClick: onSubmit, disabled: !parsed || busy, style: {
    flex: 2,
    padding: "12px",
    borderRadius: 12,
    background: parsed && !busy ? sv("--accent") : sv("--bg2"),
    color: parsed && !busy ? sv("--on-accent") : sv("--text3"),
    border: "none",
    cursor: parsed && !busy ? "pointer" : "default",
    fontFamily: SHELF_SANS,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.5
  } }, busy ? "保存中…" : parsing ? "解析中…" : "加入书架"))));
}
function readShelfIdentity(author) {
  if (author === "ai") {
    const charInfo = getAiCharacterInfo();
    if (charInfo) return { name: charInfo.name, src: charInfo.src };
  }
  return { name: SHELF_AUTHORS[author]?.name || "读者", src: SHELF_PROFILES[author]?.avatar.trim() || "" };
}
function useShelfIdentity(author) {
  return readShelfIdentity(author);
}
function Avatar({ author, size = 44 }) {
  const a = SHELF_AUTHORS[author] || SHELF_AUTHORS.me;
  const { name, src } = useShelfIdentity(author);
  const [failedSrc, setFailedSrc] = React.useState(null);
  return /* @__PURE__ */ React.createElement("div", { style: {
    width: size,
    height: size,
    borderRadius: size / 2,
    flexShrink: 0,
    overflow: "hidden",
    background: a.solid || sv(a.cssVar),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: SHELF_SERIF,
    fontWeight: 700,
    fontSize: size * 0.42,
    color: a.solid ? "#F7EADD" : sv(a.deepVar),
    letterSpacing: 0.5
  } }, src && failedSrc !== src ? /* @__PURE__ */ React.createElement("img", { src, alt: `${name}的头像`, onError: () => setFailedSrc(src), style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }) : /* @__PURE__ */ React.createElement("span", { "aria-label": `${name}的头像` }, name[0]));
}
function ReaderAvatarSlot() {
  return /* @__PURE__ */ React.createElement(Avatar, { author: "me", size: 58 });
}
function MarksView({ onOpenBook }) {
  const booksWithMarks = BOOKS.map((b) => ({ book: b, count: b.annotations.length })).filter((x) => x.count > 0).sort((a, b) => {
    const ad = a.book.annotations.reduce((m, x) => x.date > m ? x.date : m, "");
    const bd = b.book.annotations.reduce((m, x) => x.date > m ? x.date : m, "");
    if (ad !== bd) return bd.localeCompare(ad);
    return b.count - a.count;
  });
  const totalMarks = booksWithMarks.reduce((s, x) => s + x.count, 0);
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "4px 0 calc(160px + env(safe-area-inset-bottom, 0px))" } }, /* @__PURE__ */ React.createElement("div", { style: {
    padding: "6px 24px 14px",
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700
  } }, "共 ", totalMarks, " 条 · 跨 ", booksWithMarks.length, " 本书"), booksWithMarks.length === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    textAlign: "center",
    padding: "60px 30px",
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 14,
    color: sv("--text3")
  } }, "还没有标记。在阅读时点选句子，即可高亮收藏。"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "0 16px" } }, booksWithMarks.map(({ book, count }) => {
    const latest = [...book.annotations].sort((a, b) => b.date.localeCompare(a.date))[0];
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: book.id,
        className: "tappable",
        onClick: () => onOpenBook(book.id, "annotations"),
        style: {
          padding: "14px 16px",
          borderRadius: 16,
          background: sv("--card"),
          border: "0.5px solid " + sv("--card-line"),
          cursor: "pointer",
          display: "flex",
          gap: 14,
          alignItems: "center"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { transform: "rotate(-7deg)", flexShrink: 0, margin: "3px 3px 3px 0" } }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 48, h: 70 })),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: SHELF_SERIF,
        fontSize: 15,
        fontWeight: 700,
        color: sv("--text"),
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginBottom: 2
      } }, book.title), /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 12,
        color: sv("--text2"),
        marginBottom: 8,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      } }, book.author), /* @__PURE__ */ React.createElement("div", { style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        fontFamily: SHELF_SANS,
        fontSize: 11,
        color: sv("--text3"),
        letterSpacing: 0.3
      } }, /* @__PURE__ */ React.createElement("span", { style: {
        background: sv("--bg2"),
        padding: "2px 8px",
        borderRadius: 8,
        fontWeight: 700,
        color: sv("--text2")
      } }, count, " 条批注"), latest && /* @__PURE__ */ React.createElement("span", null, "· 最新 ", relDate(latest.date)))),
      /* @__PURE__ */ React.createElement("svg", { width: "6", height: "11", viewBox: "0 0 6 11", style: { flexShrink: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M1 1l4 4.5L1 10", stroke: sv("--text3"), strokeWidth: "1.5", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }))
    );
  })));
}
function profileActivity(author) {
  const rows = [];
  BOOKS.forEach((book) => (book.annotations || []).forEach((annotation) => {
    if (annotation.author === author) rows.push({ key: `${book.id}:${annotation.id}`, book, annotation, text: annotation.note || annotation.text || "", kind: annotation.note ? "批注" : "高亮", date: annotation.date || "" });
    (annotation.comments || []).forEach((comment, index) => {
      if (comment.author === author) rows.push({ key: `${book.id}:${annotation.id}:reply:${comment.id || index}`, book, annotation, text: comment.text || "", kind: "回复", date: comment.date || "", sortDate: comment.date || annotation.date || "", time: comment.time || "" });
    });
  }));
  return rows.sort((a, b) => ((b.sortDate || b.date) + (b.time || "")).localeCompare((a.sortDate || a.date) + (a.time || "")));
}
function ProfileView({ onOpenBook, onOpenAnnotation, isShelfActive = true }) {
  const me = useShelfIdentity("me");
  const partner = useShelfIdentity("ai");
  const [person, setPerson] = React.useState(null);
  const [section, setSection] = React.useState("notes");
  const [showCharPicker, setShowCharPicker] = React.useState(false);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const panelRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);
  const themeOf = () => document.documentElement.dataset.theme || "system";
  const [theme, setTheme] = React.useState(themeOf);
  const applyTheme = (t) => {
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    setTheme(t);
  };
  const activities = { me: profileActivity("me"), ai: profileActivity("ai") };
  const ownBooks = [...BOOKS].sort((a, b) => (b._lastReadMs || 0) - (a._lastReadMs || 0) || (b.lastReadAt || b.addedAt || "").localeCompare(a.lastReadAt || a.addedAt || ""));
  const booksFor = (author) => author === "me" ? ownBooks : [...new Map(activities[author].map((row) => [row.book.id, row.book])).values()];
  const closePerson = () => {
    setPerson(null);
    requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
  };
  const openPerson = (author, event) => {
    openerRef.current = event.currentTarget;
    returnFocusRef.current = null;
    setSection("notes");
    setPerson(author);
  };
  React.useEffect(() => {
    if (!person || !isShelfActive) return;
    const root = document.getElementById("nest-bookshelf-root"), wasInert = root?.inert;
    if (root) root.inert = true;
    (returnFocusRef.current || panelRef.current?.querySelector("button"))?.focus({ preventScroll: true });
    return () => {
      if (root) root.inert = wasInert;
    };
  }, [person, isShelfActive]);
  const panelKeys = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePerson();
      return;
    }
    if (e.key !== "Tab") return;
    const controls = [...panelRef.current.querySelectorAll("button")];
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  const rememberFocus = () => {
    returnFocusRef.current = document.activeElement;
  };
  const rows = person ? activities[person] : [];
  const selectedBooks = person ? booksFor(person) : [];
  const identity = person === "me" ? me : partner;
  return /* @__PURE__ */ React.createElement("div", { className: "reader-profiles" }, /* @__PURE__ */ React.createElement("style", null, `
      .reader-profiles { max-width:620px; margin:auto; padding:8px 20px 120px; }
      .reader-profile-card { display:block; width:100%; text-align:left; border:0; border-radius:22px; padding:22px; background:var(--card); margin-bottom:14px; cursor:pointer; color:var(--text); }
      .reader-profile-card.partner { background:var(--bg2); }
      .reader-profile-head { display:grid; grid-template-columns:56px minmax(0,1fr); align-items:center; gap:14px; }
      .reader-profile-name { font:600 22px/1.4 ${SHELF_SERIF}; }
      .reader-profile-stats { display:flex; flex-wrap:wrap; gap:5px 14px; margin-top:6px; color:var(--text2); font-size:11px; }
      .reader-profile-latest { display:grid; grid-template-columns:56px minmax(0,1fr); gap:14px; align-items:center; margin-top:22px; }
      .reader-profile-cover { width:56px; display:flex; justify-content:center; }
      .reader-profile-latest-label { font-size:10px; color:var(--text2); margin-bottom:6px; }
      .reader-profile-latest-title { font:600 14px/1.5 ${SHELF_SERIF}; }
      .reader-profile-meta { font-size:11px; color:var(--text2); margin-top:4px; }
      .reader-profile-theme-label { font-size:11px; color:var(--text2); margin:26px 4px 10px; }
      .reader-profile-theme { display:flex; background:var(--bg2); border-radius:12px; padding:3px; }
      .reader-profile-theme button { flex:1; border:0; border-radius:10px; padding:10px 8px; background:transparent; color:var(--text2); font-size:12px; cursor:pointer; }
      .reader-profile-theme button[aria-pressed=true] { background:var(--bg); color:var(--text); font-weight:600; }
      .person-reading-panel { position:fixed; inset:0; z-index:90; background:var(--bg); display:flex; flex-direction:column; }
      .person-reading-head { width:100%; max-width:620px; margin:0 auto; padding:2px 22px 16px; }
      .person-reading-identity { display:flex; gap:15px; align-items:center; margin:0 2px 22px; }
      .person-reading-tabs { display:flex; background:var(--bg2); border-radius:12px; padding:3px; }
      .person-reading-tabs button { flex:1; padding:9px; border:0; border-radius:9px; background:transparent; color:var(--text2); font-size:12px; cursor:pointer; }
      .person-reading-tabs button[aria-pressed=true] { background:var(--bg); color:var(--text); font-weight:600; }
      .person-reading-scroll { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
      .person-reading-content { max-width:620px; margin:0 auto; padding:4px 22px 36px; }
      .person-note { width:100%; text-align:left; border:0; border-radius:16px; padding:18px; background:var(--bg2); color:var(--text); margin-bottom:12px; cursor:pointer; }
      .person-note-meta { display:flex; justify-content:space-between; gap:12px; font-size:10px; color:var(--text2); margin-bottom:10px; }
      .person-note-text { font:normal 14px/1.85 ${SHELF_SERIF}; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
      .person-note-book { display:flex; align-items:center; gap:10px; font-size:11px; color:var(--text2); margin-top:16px; }
      .person-note-book-title { font-weight:600; color:var(--text); line-height:1.5; }
      .person-note-book-author { font-size:10px; margin-top:2px; }
      .person-note-kind { display:inline-flex; align-items:center; gap:6px; font-weight:500; color:var(--note-accent); }
      .person-note-kind::before { content:""; width:5px; height:5px; border-radius:50%; background:currentColor; }
      .person-note[data-kind="回复"] .person-note-kind { color:var(--reply-accent); }
      .person-note-meta { align-items:center; }
      .person-book { display:flex; align-items:center; gap:18px; width:100%; padding:18px; margin-bottom:12px; text-align:left; border:0; border-radius:18px; background:var(--bg2); color:var(--text); cursor:pointer; }
      .person-empty { padding:40px 12px; text-align:center; color:var(--text2); font-size:12px; }
      .reader-profiles button:focus-visible,.person-reading-panel button:focus-visible { outline:2px solid var(--reader-other-deep); outline-offset:3px; }
    `), ["me", "ai"].map((author) => {
    const who = author === "me" ? me : partner, activity = activities[author];
    const notes = activity.filter((row) => row.kind !== "回复").length, replies = activity.length - notes;
    const recent = author === "me" ? ownBooks.find((book) => book.status === "reading") : booksFor(author)[0];
    return /* @__PURE__ */ React.createElement("button", { key: author, className: `reader-profile-card ${author === "ai" ? "partner" : ""}`, "aria-label": `查看${who.name}的阅读`, onClick: (e) => openPerson(author, e) }, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-head" }, /* @__PURE__ */ React.createElement(Avatar, { author, size: 56 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-name" }, who.name), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-stats" }, /* @__PURE__ */ React.createElement("span", null, notes, " 条批注与高亮"), /* @__PURE__ */ React.createElement("span", null, replies, " 条回复")))), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-latest" }, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-cover" }, recent && /* @__PURE__ */ React.createElement(BookCover, { book: recent, w: 38, h: 55 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-latest-label" }, author === "me" ? "正在读" : "最近共读"), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-latest-title" }, recent?.title || (author === "me" ? "暂无在读书籍" : "暂无共读记录")), recent && /* @__PURE__ */ React.createElement("div", { className: "reader-profile-meta" }, author === "me" ? `已读 ${Math.round((recent.progress || 0) * 100)}%` : recent.author))));
  }), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-theme-label" }, "外观"), /* @__PURE__ */ React.createElement(SlidingSegments, { className: "reader-profile-theme", "aria-label": "外观" }, [["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, "aria-pressed": theme === key, onClick: () => applyTheme(key) }, label))), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-theme-label", style: { marginTop: 20 } }, "共读角色"), /* @__PURE__ */ React.createElement("button", { className: "reader-profile-card partner", style: { marginBottom: 0 }, onClick: () => setShowCharPicker(true) }, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-head" }, /* @__PURE__ */ React.createElement(Avatar, { author: "ai", size: 56 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-name" }, partner.name), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-stats" }, /* @__PURE__ */ React.createElement("span", null, "点击选择微信角色作为共读伙伴"))))), showCharPicker && ReactDOM.createPortal(/* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }, onClick: () => setShowCharPicker(false) }, /* @__PURE__ */ React.createElement("div", { style: { background: sv("--bg"), borderRadius: "20px 20px 0 0", padding: "20px 0 calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: 620, maxHeight: "70vh", overflow: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 4, background: sv("--text3"), borderRadius: 2, margin: "0 auto 12px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: sv("--text") } }, "选择共读角色")), /* @__PURE__ */ React.createElement("div", { style: { padding: "0 20px" } }, /* @__PURE__ */ React.createElement("button", { style: { width: "100%", padding: "14px 16px", border: "none", borderRadius: 12, background: sv("--bg2"), color: sv("--text"), fontSize: 14, textAlign: "left", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }, onClick: () => { setAiCharacter(null); setShowCharPicker(false); forceUpdate(); } }, /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 40, borderRadius: 20, background: "#C2683F", display: "flex", alignItems: "center", justifyContent: "center", color: "#F7EADD", fontWeight: 700, fontSize: 18, flexShrink: 0 } }, "A"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, "AI 助手"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: sv("--text2") } }, "使用默认 AI"))), (window.db?.characters || []).filter((c) => c && (c.name || c.remarkName)).map((c) => /* @__PURE__ */ React.createElement("button", { key: c.id, style: { width: "100%", padding: "14px 16px", border: "none", borderRadius: 12, background: sv("--bg2"), color: sv("--text"), fontSize: 14, textAlign: "left", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }, onClick: () => { setAiCharacter(c); setShowCharPicker(false); forceUpdate(); } }, /* @__PURE__ */ React.createElement("img", { src: c.avatar || "", style: { width: 40, height: 40, borderRadius: 20, objectFit: "cover", flexShrink: 0, background: sv("--card") }, onError: (e) => { e.target.style.display = "none"; } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, c.remarkName || c.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: sv("--text2") } }, "微信角色"))))), (window.db?.characters || []).length === 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "20px 0", color: sv("--text2"), fontSize: 13 } }, "暂无角色，请先在微信中创建角色")))), document.body), person && ReactDOM.createPortal(/* @__PURE__ */ React.createElement("section", { ref: panelRef, className: "person-reading-panel", style: { display: isShelfActive ? void 0 : "none" }, role: "dialog", "aria-modal": "true", "aria-label": `${identity.name}的阅读`, onKeyDown: panelKeys }, /* @__PURE__ */ React.createElement(ShelfTopBar, { title: `${identity.name}的阅读`, left: /* @__PURE__ */ React.createElement("button", { "aria-label": "返回个人页", onClick: closePerson, style: navBtn }, /* @__PURE__ */ React.createElement(IconChevronL, null)) }), /* @__PURE__ */ React.createElement("header", { className: "person-reading-head" }, /* @__PURE__ */ React.createElement("div", { className: "person-reading-identity" }, person === "me" ? /* @__PURE__ */ React.createElement(ReaderAvatarSlot, null) : /* @__PURE__ */ React.createElement(Avatar, { author: "ai", size: 58 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-name" }, identity.name), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-meta" }, rows.length, " 条批注与回复 · ", selectedBooks.length, " 本", person === "ai" ? "共读书籍" : "书籍"))), /* @__PURE__ */ React.createElement(SlidingSegments, { className: "person-reading-tabs", "aria-label": "阅读记录类型" }, [["notes", "批注与回复"], ["books", person === "me" ? "书籍" : "共读书籍"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, "aria-pressed": section === key, onClick: () => {
    returnFocusRef.current = null;
    setSection(key);
  } }, label)))), /* @__PURE__ */ React.createElement(ShelfScrollArea, { className: "person-reading-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "person-reading-content" }, section === "notes" ? rows.length ? rows.map((row) => /* @__PURE__ */ React.createElement("button", { key: row.key, className: "person-note", "data-kind": row.kind, "aria-label": `查看${identity.name}在${row.book.title}中的${row.kind}`, onClick: () => {
    rememberFocus();
    onOpenAnnotation(row.book.id, row.annotation);
  } }, /* @__PURE__ */ React.createElement("div", { className: "person-note-meta" }, /* @__PURE__ */ React.createElement("span", { className: "person-note-kind" }, row.kind), /* @__PURE__ */ React.createElement("span", null, [row.date, row.time].filter(Boolean).join(" · "))), /* @__PURE__ */ React.createElement("div", { className: "person-note-text" }, row.text), /* @__PURE__ */ React.createElement("div", { className: "person-note-book" }, /* @__PURE__ */ React.createElement(BookCover, { book: row.book, w: 22, h: 32 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "person-note-book-title" }, row.book.title), /* @__PURE__ */ React.createElement("div", { className: "person-note-book-author" }, row.book.author))))) : /* @__PURE__ */ React.createElement("div", { className: "person-empty" }, "暂无批注与回复") : selectedBooks.length ? selectedBooks.map((book) => /* @__PURE__ */ React.createElement("button", { key: book.id, className: "person-book", onClick: () => {
    rememberFocus();
    onOpenBook(book.id);
  } }, /* @__PURE__ */ React.createElement(BookCover, { book, w: 58, h: 85 }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "reader-profile-latest-title" }, book.title), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-meta" }, book.author), /* @__PURE__ */ React.createElement("div", { className: "reader-profile-meta" }, person === "me" ? (book.status === "finished" ? "已读完" : `在读 · ${Math.round((book.progress || 0) * 100)}%`) : `${rows.filter((row) => row.book.id === book.id).length} 条批注与回复`)))) : /* @__PURE__ */ React.createElement("div", { className: "person-empty" }, "暂无共读书籍")))), document.body);
}
Object.assign(window, { Avatar, MarksView, ProfileView });
function splitSentences(para) {
  const re = /[^。！？!?\.]+[。！？!?\.]*|[^。！？!?\.]+$/g;
  return para.match(re) || [para];
}
function readerHitsText(element, x, y) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
    }
  }
  return false;
}
function readerHasSelection() {
  const selection = window.getSelection();
  return !!(selection && !selection.isCollapsed && selection.toString().trim());
}
function ReaderParagraph({ text, paraIdx, annotations, editing, onTapAnnotation, onTapPara, fontSize = 17 }) {
  const inPara = annotations.filter((a) => a.paraIdx === paraIdx && a.rangeStart != null && a.rangeEnd != null && a.rangeStart < a.rangeEnd).sort((a, b) => a.rangeStart - b.rangeStart);
  const pieces = [];
  let cursor = 0;
  for (const a of inPara) {
    const s = Math.max(cursor, a.rangeStart);
    const e = Math.min(text.length, a.rangeEnd);
    if (s > cursor) pieces.push({ kind: "plain", text: text.slice(cursor, s) });
    if (e > s) pieces.push({ kind: "mark", text: text.slice(s, e), ann: a });
    cursor = Math.max(cursor, e);
  }
  if (cursor < text.length) pieces.push({ kind: "plain", text: text.slice(cursor) });
  if (!pieces.length) pieces.push({ kind: "plain", text });
  const handleParaClick = (e) => {
    try {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    } catch {
    }
    if (!readerHitsText(e.currentTarget, e.clientX, e.clientY)) return;
    e.stopPropagation();
    if (onTapPara) onTapPara(paraIdx);
  };
  return /* @__PURE__ */ React.createElement(
    "p",
    {
      "data-para-idx": paraIdx,
      onClick: handleParaClick,
      style: {
        fontFamily: SHELF_SERIF,
        fontSize,
        lineHeight: 1.85,
        color: sv("--text"),
        margin: "0 0 18px",
        textIndent: "2em",
        letterSpacing: 0.2,
        textAlign: "justify",
        wordBreak: "break-word",
        userSelect: "text",
        WebkitUserSelect: "text",
        cursor: "pointer"
      }
    },
    pieces.map((p, i) => {
      if (p.kind === "plain") return /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, p.text);
      const authorVar = p.ann.author === "ai" ? "--reader-other-deep" : "--reader-me-deep";
      return /* @__PURE__ */ React.createElement(
        "span",
        {
          key: i,
          "data-ann-id": p.ann.id,
          onClick: (e) => {
            e.stopPropagation();
            onTapAnnotation(p.ann.id);
          },
          style: {
            background: `color-mix(in srgb, ${HIGHLIGHTS[p.ann.color].bg} var(--reader-mark-strength, 100%), transparent)`,
            borderBottom: `1.5px solid ${sv(authorVar)}`,
            // Inline filters split multi-column text into transient WebKit layers.
            // Keep the highlight painted in the text layer when its sheet closes.
            cursor: "pointer",
            padding: "0 1px",
            borderRadius: 1
          }
        },
        p.text
      );
    })
  );
}
const READER_THEMES = [
  { id: "auto", name: "跟随外观", bg: null },
  { id: "paper", name: "纸白", bg: "#FAF9F6", text: "#292724", sub: "#69655E", card: "#F0EEEA" },
  { id: "sepia", name: "暖纸", bg: "#F0E5D2", text: "#433A2F", sub: "#756957", card: "#E5D8C1" },
  { id: "sage", name: "浅绿", bg: "#E5EBE0", text: "#303B32", sub: "#637061", card: "#D8E1D2" },
  { id: "night", name: "夜色", bg: "#202124", text: "#D9D6CF", sub: "#A29F98", card: "#2D2E31" }
];
const READER_BUBBLES = {
  paper: { me: "#E5E2DA", other: "#F3F1EB", ink: "#292724", line: "#CFCBC1", meta: "#69635B" },
  sepia: { me: "#DED0B8", other: "#F6EDDD", ink: "#332B21", line: "#C7B99F", meta: "#71614F" },
  sage: { me: "#D1DCCD", other: "#EEF2E8", ink: "#263329", line: "#B8C5B3", meta: "#5D6C59" },
  night: { me: "#3A3B40", other: "#2B2C30", ink: "#E8E5DF", line: "#505157", meta: "#AFADA8" }
};
function readerThemeStyle(id, hostDark = false) {
  const t = READER_THEMES.find((t2) => t2.id === id);
  const b = READER_BUBBLES[id] || READER_BUBBLES[hostDark ? "night" : "paper"];
  const bubbleDark = id === "night" || id === "auto" && hostDark;
  const bubbles = {
    "--me-bubble": b.me,
    "--reader-other-bubble": b.other,
    "--reply-ink": b.ink,
    "--reply-line": b.line,
    "--reply-meta": b.meta,
    "--reader-me-deep": bubbleDark ? "#E8B8AB" : "#8B5D52",
    "--reader-other-deep": bubbleDark ? "#E2A28F" : "#845449"
  };
  if (!t?.bg) return bubbles;
  const night = id === "night";
  return {
    "--bg": t.bg,
    "--bg2": t.card,
    "--card": t.card,
    "--text": t.text,
    "--text2": t.sub,
    "--text3": t.sub,
    "--line": night ? "#ffffff18" : "#29272416",
    "--line-strong": night ? "#ffffff30" : "#29272430",
    "--card-line": night ? "#ffffff18" : "#29272414",
    "--accent": night ? "#E8E5DE" : "#292724",
    "--on-accent": night ? "#202124" : "#FAF9F6",
    "--reader-mark-strength": night ? "45%" : "100%",
    "--note-accent": night ? "#C69780" : "#95634F",
    "--reply-accent": night ? "#92B1C5" : "#5D7A8D",
    ...bubbles
  };
}
function ReaderSettings({ prefs, onChange, onClose, onJump }) {
  React.useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { onClick: onClose, style: { position: "absolute", inset: 0, background: "#0004", zIndex: 120 } }), /* @__PURE__ */ React.createElement("section", { className: "reader-settings", role: "dialog", "aria-modal": "true", "aria-label": "阅读设置" }, /* @__PURE__ */ React.createElement("header", null, /* @__PURE__ */ React.createElement("h2", null, "阅读设置"), /* @__PURE__ */ React.createElement("button", { "aria-label": "关闭阅读设置", onClick: onClose, style: bookNavBtn }, /* @__PURE__ */ React.createElement(IconClose, null))), /* @__PURE__ */ React.createElement("div", { className: "reader-setting-row" }, /* @__PURE__ */ React.createElement("span", null, "字号"), /* @__PURE__ */ React.createElement("div", { className: "reader-font-controls" }, /* @__PURE__ */ React.createElement("button", { "aria-label": "减小字号", disabled: prefs.size <= 14, onClick: () => onChange({ size: prefs.size - 1 }) }, "A−"), /* @__PURE__ */ React.createElement("output", { "aria-label": "当前字号" }, prefs.size), /* @__PURE__ */ React.createElement("button", { "aria-label": "增大字号", disabled: prefs.size >= 26, onClick: () => onChange({ size: prefs.size + 1 }) }, "A＋"))), /* @__PURE__ */ React.createElement("div", { className: "reader-setting-row" }, /* @__PURE__ */ React.createElement("span", null, "阅读方式"), /* @__PURE__ */ React.createElement(SlidingSegments, { className: "reader-mode-options", "aria-label": "阅读方式" }, [["paged", "左右翻页"], ["scroll", "上下滚动"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, "aria-pressed": prefs.mode === key, onClick: () => onChange({ mode: key }) }, label)))), /* @__PURE__ */ React.createElement("div", { className: "reader-setting-label" }, "阅读底色"), /* @__PURE__ */ React.createElement("div", { className: "reader-colors" }, READER_THEMES.map((t) => /* @__PURE__ */ React.createElement("button", { key: t.id, "aria-label": t.name, "aria-pressed": prefs.theme === t.id, onClick: () => onChange({ theme: t.id }) }, /* @__PURE__ */ React.createElement("span", { style: { background: t.bg || "linear-gradient(135deg,#FAF9F6 50%,#252528 50%)", color: t.text || "var(--text)" } }), /* @__PURE__ */ React.createElement("small", null, t.name)))), onJump && /* @__PURE__ */ React.createElement("button", { className: "reader-jump", onClick: onJump }, "跳转页码")));
}
function readerTextRects(paragraph) {
  const nodes = [];
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let node, length = 0;
  while (node = walker.nextNode()) {
    if (node.length) {
      nodes.push({ node, start: length, end: length + node.length });
      length += node.length;
    }
  }
  const range = document.createRange();
  return { length, at(offset) {
    if (!length) return paragraph.getBoundingClientRect();
    const index = Math.max(0, Math.min(length - 1, offset));
    const part = nodes.find((n) => n.end > index);
    range.setStart(part.node, index - part.start);
    range.setEnd(part.node, index - part.start + 1);
    return range.getBoundingClientRect();
  } };
}
function readerOffsetAtPosition(rects, origin, position, isScroll, step) {
  let lo = 0, hi = Math.max(0, rects.length - 1);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2), r = rects.at(mid);
    const before = isScroll ? r.bottom - origin.top <= position + 1 : Math.floor((r.left - origin.left + 2) / step) < position;
    if (before) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function readerChapterIndex(toc, paraIdx) {
  const legacyPage = Math.floor(paraIdx / 30) + 1;
  let current = -1;
  (toc || []).forEach((chapter, index) => {
    if (chapter.paraIdx != null ? chapter.paraIdx <= paraIdx : chapter.page <= legacyPage) current = index;
  });
  return current;
}
function ReaderView({ bookId, onClose, openAnnotationId, openParaIdx }) {
  const book = bookById(bookId);
  if (!book) return null;
  const hostDark = useShelfDark();
  const [annotations, setAnnotations] = React.useState(book.annotations);
  const [selected, setSelected] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [showChrome, setShowChrome] = React.useState(false);
  const [showToc, setShowToc] = React.useState(false);
  const [showJumpPage, setShowJumpPage] = React.useState(false);
  const [selUI, setSelUI] = React.useState(null);
  const PAGE_GAP = 64;
  const READER_TOP_INSET = "calc(12px + env(safe-area-inset-top, 0px))";
  const pagerRef = React.useRef(null);
  const colRef = React.useRef(null);
  const [prefs, setPrefs] = React.useState(() => {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("nest_bookshelf_demo_reader_preferences_v1") || "{}") || {};
    } catch {
    }
    return {
      mode: saved.mode === "scroll" ? "scroll" : "paged",
      size: Math.min(26, Math.max(14, Number(saved.size) || 17)),
      theme: ["auto", "paper", "sepia", "sage", "night"].includes(saved.theme) ? saved.theme : "auto"
    };
  });
  const isScroll = prefs.mode === "scroll";
  const [showSettings, setShowSettings] = React.useState(false);
  const [innerW, setInnerW] = React.useState(0);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const [layoutReady, setLayoutReady] = React.useState(false);
  const [animatePage, setAnimatePage] = React.useState(false);
  const restoredScrollRef = React.useRef(null);
  const PAGE_STORAGE_KEY = "nest_bookshelf_demo_reader_page_" + bookId;
  const ANCHOR_STORAGE_KEY = "nest_bookshelf_demo_reader_anchor_" + bookId;
  const [page, setPage] = React.useState(() => {
    try {
      return Math.max(0, parseInt(localStorage.getItem(PAGE_STORAGE_KEY)) || 0);
    } catch {
      return 0;
    }
  });
  const [pageCount, setPageCount] = React.useState(1);
  const [currentParaIdx, setCurrentParaIdx] = React.useState(0);
  const anchorRef = React.useRef(void 0);
  if (anchorRef.current === void 0) {
    try {
      anchorRef.current = JSON.parse(localStorage.getItem(ANCHOR_STORAGE_KEY) || "null");
    } catch {
      anchorRef.current = null;
    }
  }
  const jumpedRef = React.useRef(false);
  const geometryRef = React.useRef({ entries: [], map: [], step: 1, count: 1 });
  const currentPageRef = React.useRef(page);
  currentPageRef.current = page;
  const scrollFrame = React.useRef(null);
  const contentLength = book.text?.[0]?.paragraphs?.length || 0;
  const saveAnchor = (anchor) => {
    anchorRef.current = anchor;
    setCurrentParaIdx(anchor.paraIdx);
    try {
      localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(anchor));
    } catch {
    }
  };
  const rememberPosition = (position) => {
    const g = geometryRef.current, col = colRef.current;
    const entry = g.entries.find((e) => e.end > position + 0.01) || g.entries[g.entries.length - 1];
    const paragraph = entry && col?.querySelector(`[data-para-idx="${entry.paraIdx}"]`);
    if (!paragraph) return;
    const offset = readerOffsetAtPosition(readerTextRects(paragraph), col.getBoundingClientRect(), position, isScroll, g.step);
    saveAnchor({ paraIdx: entry.paraIdx, offset });
  };
  const onReaderScroll = () => {
    const vp = pagerRef.current;
    if (!isScroll || !vp || geometryRef.current.mode !== prefs.mode) return;
    if (restoredScrollRef.current != null && Math.abs(vp.scrollTop - restoredScrollRef.current) < 1) return;
    restoredScrollRef.current = null;
    if (scrollFrame.current != null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const g = geometryRef.current;
      if (g.mode !== "scroll") return;
      rememberPosition(vp.scrollTop);
      const atEnd = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2;
      setPage(atEnd ? g.count - 1 : Math.min(g.count - 1, Math.floor(vp.scrollTop / g.step)));
    });
  };
  React.useEffect(() => () => {
    if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
  }, []);
  const updatePrefs = (patch) => {
    if (patch.mode && patch.mode !== prefs.mode || patch.size && patch.size !== prefs.size) {
      if (scrollFrame.current != null) {
        cancelAnimationFrame(scrollFrame.current);
        if (isScroll && pagerRef.current) rememberPosition(pagerRef.current.scrollTop);
      }
      scrollFrame.current = null;
      if (colRef.current) colRef.current.style.transition = "none";
      setAnimatePage(false);
      setLayoutReady(false);
    }
    setPrefs((p) => ({ ...p, ...patch }));
  };
  React.useEffect(() => {
    try {
      localStorage.setItem("nest_bookshelf_demo_reader_preferences_v1", JSON.stringify(prefs));
    } catch {
    }
  }, [prefs]);
  React.useLayoutEffect(() => {
    const vp = pagerRef.current, col = colRef.current;
    if (!vp || !col || !contentLength) return;
    const measure = () => {
      col.style.transition = "none";
      const cs = getComputedStyle(vp);
      const w = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (w <= 0 || vp.clientHeight <= 0) return;
      col.style.columnWidth = isScroll ? "auto" : w + "px";
      const step = isScroll ? vp.clientHeight : w + PAGE_GAP;
      const count = Math.max(1, isScroll ? Math.ceil(vp.scrollHeight / step) : Math.round((col.scrollWidth + PAGE_GAP) / step));
      const cr = col.getBoundingClientRect();
      const entries = Array.from(col.querySelectorAll("p[data-para-idx]"), (p) => {
        const rects = Array.from(p.getClientRects());
        const start = isScroll ? rects[0].top - cr.top : Math.max(0, Math.floor((rects[0].left - cr.left + 2) / step));
        const last = rects[rects.length - 1];
        const end = isScroll ? last.bottom - cr.top : Math.floor((last.left - cr.left + 2) / step) + 1;
        return { paraIdx: Number(p.dataset.paraIdx), start, end };
      });
      const map = Array.from({ length: count }, (_, i) => (entries.find((e) => e.end > (isScroll ? i * step : i) + 0.01) || entries[entries.length - 1])?.paraIdx || 0);
      geometryRef.current = { entries, map, step, count, mode: prefs.mode };
      const initialPara = !jumpedRef.current ? openAnnotationId ? annotations.find((a) => a.id === openAnnotationId)?.paraIdx : openParaIdx : null;
      const anchor = initialPara != null ? { paraIdx: initialPara, offset: 0 } : anchorRef.current;
      const target = anchor && entries.find((e) => e.paraIdx === anchor.paraIdx);
      let position = target ? target.start + (target.end - target.start) * (Number(anchor.fraction) || 0) : currentPageRef.current * (isScroll ? step : 1);
      if (target && Number.isFinite(anchor.offset)) {
        const paragraph = col.querySelector(`[data-para-idx="${anchor.paraIdx}"]`);
        const rect = readerTextRects(paragraph).at(anchor.offset);
        position = isScroll ? rect.top - cr.top : Math.floor((rect.left - cr.left + 2) / step);
      }
      col.style.transition = "none";
      vp.scrollLeft = 0;
      vp.scrollTop = isScroll ? Math.max(0, position) : 0;
      restoredScrollRef.current = isScroll ? vp.scrollTop : null;
      const nextPage = Math.max(0, Math.min(count - 1, Math.floor(isScroll ? vp.scrollTop / step : position)));
      col.style.transform = isScroll ? "none" : `translateX(${-nextPage * step}px)`;
      currentPageRef.current = nextPage;
      setAnimatePage(false);
      setInnerW(w);
      setPageCount(count);
      setPage(nextPage);
      if (target && Number.isFinite(anchor.offset)) saveAnchor(anchor);
      else rememberPosition(isScroll ? vp.scrollTop : nextPage);
      setLayoutVersion((v) => v + 1);
      setLayoutReady(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [bookId, contentLength, prefs.mode, prefs.size]);
  React.useEffect(() => {
    if (!layoutReady) return;
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, String(page));
    } catch {
    }
    book.progress = Math.max(0, Math.min(1, (page + 1) / pageCount));
    book.currentPage = page + 1;
    book.totalPages = pageCount;
    book.lastReadAt = TODAY_SHELF;
    persistShelf();
  }, [page, pageCount, layoutReady, isScroll, bookId]);
  const currentChapterIndex = React.useMemo(() => readerChapterIndex(book.toc, currentParaIdx), [currentParaIdx, book.toc]);
  const currentChapterTitle = book.toc?.[currentChapterIndex]?.title || "";
  const goToPage = (next) => {
    if (isScroll) return;
    next = Math.max(0, Math.min(pageCount - 1, next));
    if (next === currentPageRef.current) return;
    rememberPosition(next);
    currentPageRef.current = next;
    setAnimatePage(true);
    setPage(next);
  };
  const turn = (dir) => goToPage(currentPageRef.current + dir);
  const jumpToParagraph = (idx, annotationId) => {
    const col = colRef.current, vp = pagerRef.current;
    if (!col || !vp) return;
    const p = col.querySelector(`[data-para-idx="${idx}"]`);
    const target = annotationId && Array.from(col.querySelectorAll("[data-ann-id]")).find((el) => el.dataset.annId === String(annotationId)) || p;
    if (!target) return;
    const r = target.getClientRects()[0], cr = col.getBoundingClientRect();
    if (isScroll) {
      vp.scrollTop = Math.max(0, r.top - cr.top);
      onReaderScroll();
    } else {
      const next = Math.max(0, Math.min(pageCount - 1, Math.floor((r.left - cr.left + 2) / (innerW + PAGE_GAP))));
      goToPage(next);
    }
  };
  React.useEffect(() => {
    const onKey = (e) => {
      if (isScroll || showSettings || showToc || editing || selected || showJumpPage || e.target.closest('input,textarea,[contenteditable="true"]')) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        turn(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        turn(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount, isScroll, showSettings, showToc, editing, selected, showJumpPage]);
  React.useEffect(() => {
    if (!layoutReady || jumpedRef.current) return;
    if (openAnnotationId) {
      const ann = annotations.find((a) => a.id === openAnnotationId);
      if (!ann) return;
      jumpToParagraph(ann.paraIdx, ann.id);
      setEditing(ann.id);
    } else if (openParaIdx != null) jumpToParagraph(openParaIdx);
    jumpedRef.current = true;
  }, [layoutReady, openAnnotationId, openParaIdx, annotations]);
  const readingTapRef = React.useRef(null);
  const beginReadingTap = (e) => {
    readingTapRef.current = {
      x: e.clientX,
      y: e.clientY,
      at: Date.now(),
      moved: false,
      selected: readerHasSelection(),
      pointerId: e.pointerId
    };
  };
  const moveReadingTap = (e) => {
    const tap = readingTapRef.current;
    if (tap && (e.pointerId !== tap.pointerId || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8)) tap.moved = true;
  };
  const guardReadingClick = (e) => {
    const tap = readingTapRef.current;
    if (readerHasSelection() || tap && (tap.selected || tap.moved || Date.now() - tap.at > 500)) {
      e.stopPropagation();
    }
    readingTapRef.current = null;
  };
  const toggleReadingChrome = (e) => {
    if (showSettings || showToc || editing || selected || showJumpPage || readerHasSelection()) return;
    if (e.target.closest("button,a,input,textarea,[data-ann-id],[data-page-edge]")) return;
    if (readerHitsText(e.target, e.clientX, e.clientY)) return;
    setShowChrome((visible) => !visible);
  };
  const touchRef = React.useRef(null);
  const cancelTouchTurn = () => {
    touchRef.current = null;
    if (readingTapRef.current) readingTapRef.current.moved = true;
  };
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) {
      cancelTouchTurn();
      return;
    }
    if (isScroll) return;
    const t = e.touches[0];
    touchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchMove = (e) => {
    if (e.touches.length !== 1) cancelTouchTurn();
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s || isScroll || e.touches.length || window.getSelection()?.toString()) return;
    const t = Array.from(e.changedTouches).find((t2) => t2.identifier === s.id);
    if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 600) {
      if (readingTapRef.current) readingTapRef.current.moved = true;
      turn(dx < 0 ? 1 : -1);
    }
  };
  const needsLoad = false, loadErr = false;
  const chapter = book.text?.[0]?.paragraphs?.length ? book.text[0] : null;
  const saveAnnotation = ({ color, note }) => {
    if (editing) {
      const updated = annotations.map((a) => a.id === editing ? { ...a, color, note } : a);
      setAnnotations(updated);
      const ann = updated.find((a) => a.id === editing);
      if (window.upsertUserAnnotation && ann) window.upsertUserAnnotation(book.id, ann);
      setEditing(null);
    } else if (selected) {
      const tempId = "an_" + Date.now();
      const newAnn = {
        id: tempId,
        author: "me",
        chapter: chapter.chapter,
        page: chapter.page,
        paraIdx: selected.paraIdx,
        sentenceIdx: 0,
        rangeStart: selected.rangeStart,
        rangeEnd: selected.rangeEnd,
        color,
        text: selected.text,
        note,
        date: TODAY_SHELF,
        comments: []
      };
      setAnnotations([...annotations, newAnn]);
      if (window.upsertUserAnnotation) window.upsertUserAnnotation(book.id, newAnn);
      setSelected(null);
    }
  };
  React.useEffect(() => {
    if (!chapter) return;
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelUI(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString();
      if (!text || text.length < 1) {
        setSelUI(null);
        return;
      }
      let node = range.startContainer;
      while (node && (!node.dataset || node.dataset.paraIdx == null)) {
        node = node.parentNode;
      }
      if (!node || node.dataset == null) {
        setSelUI(null);
        return;
      }
      const paraIdx = parseInt(node.dataset.paraIdx, 10);
      const fullText = chapter.paragraphs[paraIdx] || "";
      const start = fullText.indexOf(text);
      const end = start >= 0 ? start + text.length : -1;
      if (start < 0) {
        setSelUI(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setSelUI({
        x: r.left + r.width / 2,
        y: r.top,
        text,
        paraIdx,
        rangeStart: start,
        rangeEnd: end
      });
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [chapter]);
  const startNewFromSelection = () => {
    if (!selUI) return;
    setSelected({ paraIdx: selUI.paraIdx, rangeStart: selUI.rangeStart, rangeEnd: selUI.rangeEnd, text: selUI.text });
    setSelUI(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch (e) {
    }
  };
  const startNewFullPara = (paraIdx) => {
    const idx = paraIdx != null ? paraIdx : selUI?.paraIdx;
    if (idx == null) return;
    const fullText = (chapter.paragraphs[idx] || "").trim();
    if (!fullText) return;
    setSelected({ paraIdx: idx, rangeStart: 0, rangeEnd: fullText.length, text: fullText });
    setSelUI(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch (e) {
    }
  };
  const addComment = (text) => {
    if (!editing || !text.trim()) return;
    const parent = annotations.find((a) => a.id === editing);
    const now = /* @__PURE__ */ new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const comment = { author: "me", date: todayShelf(), time, text: text.trim() };
    if (window.appendReply) window.appendReply(editing, comment);
    setAnnotations((book.annotations || []).map(
      (a) => a.id === editing ? { ...a, comments: [...a.comments || []] } : a
    ));
  };
  const updateColor = (color) => {
    if (!editing) return;
    const next = annotations.map((a) => a.id === editing ? { ...a, color } : a);
    setAnnotations(next);
    upsertUserAnnotation(book.id, next.find((a) => a.id === editing));
  };
  const deleteAnnotation = () => {
    if (editing) {
      const target = annotations.find((a) => a.id === editing);
      if (window.removeUserAnnotation) window.removeUserAnnotation(book.id, editing);
      setAnnotations(annotations.filter((a) => a.id !== editing));
      setEditing(null);
    }
  };
  const cancel = () => {
    setSelected(null);
    setEditing(null);
  };
  const activeAnnotation = editing ? annotations.find((a) => a.id === editing) : null;
  if (!chapter) {
    if (needsLoad && !loadErr) {
      return /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        inset: 0,
        background: sv("--bg"),
        zIndex: 100,
        display: "flex",
        flexDirection: "column"
      } }, /* @__PURE__ */ React.createElement(ShelfTopBar, { title: book.title, left: /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "返回", style: navBtn }, /* @__PURE__ */ React.createElement(IconChevronL, null)) }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: sv("--text3"), fontFamily: SHELF_SERIF, fontSize: 14 } }, "正在加载……")));
    }
    return /* @__PURE__ */ React.createElement(ReaderEmpty, { book, onClose });
  }
  return /* @__PURE__ */ React.createElement("div", { className: "reader-view", "data-reading-mode": prefs.mode, "data-chrome-visible": showChrome, style: {
    ...readerThemeStyle(prefs.theme, hostDark),
    position: "absolute",
    inset: 0,
    background: sv("--bg"),
    zIndex: 100,
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React.createElement("div", { className: "reader-chrome", "aria-hidden": !showChrome, inert: showChrome ? void 0 : "", style: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 12,
    height: 106,
    background: sv("--bg"),
    transition: "transform 250ms cubic-bezier(0.2,0,0.2,1), opacity 200ms",
    transform: showChrome ? "translateY(0)" : "translateY(-100%)",
    opacity: showChrome ? 1 : 0,
    pointerEvents: showChrome ? "auto" : "none"
  } }, /* @__PURE__ */ React.createElement(ShelfSoftEdge, { size: 48, style: { top: "100%" } }), /* @__PURE__ */ React.createElement(
    ShelfTopBar,
    {
      sideWidth: 82,
      title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: SHELF_SERIF, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, book.title), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: SHELF_SANS, fontSize: 10, color: sv("--text3"), marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, currentChapterTitle ? currentChapterTitle + " · " : "", isScroll ? `${Math.round((page + 1) / pageCount * 100)}%` : `第 ${page + 1} / ${pageCount} 页`)),
      left: /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "返回", style: navBtn }, /* @__PURE__ */ React.createElement(IconChevronL, null)),
      right: /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 2 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setShowSettings(true), "aria-label": "阅读设置", style: { ...navBtn, fontFamily: SHELF_SERIF, fontSize: 17 } }, "Aa"), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowToc(true), "aria-label": "目录", style: navBtn }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18" }, /* @__PURE__ */ React.createElement("path", { d: "M3 4h12M3 9h12M3 14h12", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }))))
    }
  )), /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: pagerRef,
      className: "reader-viewport",
      onScroll: onReaderScroll,
      onPointerDownCapture: beginReadingTap,
      onPointerMoveCapture: moveReadingTap,
      onPointerCancel: () => {
        if (readingTapRef.current) readingTapRef.current.moved = true;
      },
      onClickCapture: guardReadingClick,
      onClick: toggleReadingChrome,
      onTouchStart,
      onTouchEnd,
      onTouchMove,
      onTouchCancel: cancelTouchTurn,
      style: {
        position: "absolute",
        top: isScroll ? 0 : READER_TOP_INSET,
        paddingTop: isScroll ? READER_TOP_INSET : 0,
        bottom: 0,
        left: 0,
        right: 0,
        paddingLeft: 22,
        paddingRight: 22,
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        overflowX: "hidden",
        overflowY: isScroll ? "auto" : "hidden",
        overscrollBehavior: "contain",
        overflowAnchor: "none",
        touchAction: "pan-y pinch-zoom"
      }
    },
    /* @__PURE__ */ React.createElement("div", { ref: colRef, style: {
      height: isScroll ? "auto" : "100%",
      columnWidth: isScroll ? "auto" : innerW ? innerW + "px" : "auto",
      columnGap: PAGE_GAP,
      columnFill: "auto",
      transform: isScroll ? "none" : `translateX(${-page * (innerW + PAGE_GAP)}px)`,
      transition: !isScroll && animatePage ? "transform 340ms cubic-bezier(0.3,0,0.2,1)" : "none"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: SHELF_SANS,
      fontSize: 10,
      color: sv("--text3"),
      letterSpacing: 2,
      fontWeight: 700,
      marginBottom: 28,
      textAlign: "center"
    } }, book.toc.find((c) => c.page === chapter.page)?.title || `第 ${chapter.chapter} 章`), chapter.paragraphs.map((para, pi) => /* @__PURE__ */ React.createElement(
      ReaderParagraph,
      {
        key: pi,
        fontSize: prefs.size,
        text: para,
        paraIdx: pi,
        annotations,
        editing,
        onTapAnnotation: (annId) => {
          setEditing(annId);
        },
        onTapPara: (idx) => startNewFullPara(idx)
      }
    )), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "34px 0 10px" } }, /* @__PURE__ */ React.createElement("div", { style: {
      display: "inline-block",
      width: 24,
      height: 1,
      background: sv("--line-strong")
    } }))),
    !isScroll && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { "data-page-edge": true, "aria-label": "上一页", onClick: (e) => {
      e.stopPropagation();
      turn(-1);
    }, style: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: 18,
      cursor: "pointer"
    } }), /* @__PURE__ */ React.createElement("div", { "data-page-edge": true, "aria-label": "下一页", onClick: (e) => {
      e.stopPropagation();
      turn(1);
    }, style: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: 18,
      cursor: "pointer"
    } })),
    "      "
  ), /* @__PURE__ */ React.createElement(
    ShelfScrollEdges,
    {
      scrollRef: pagerRef,
      enabled: isScroll,
      topSize: READER_TOP_INSET,
      bottomSize: "calc(28px + env(safe-area-inset-bottom, 0px))",
      style: { zIndex: 11 }
    }
  ), showSettings && /* @__PURE__ */ React.createElement(
    ReaderSettings,
    {
      prefs,
      onChange: updatePrefs,
      onClose: () => setShowSettings(false),
      onJump: !isScroll ? () => {
        setShowSettings(false);
        setShowJumpPage(true);
      } : null
    }
  ), showJumpPage && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { onClick: () => setShowJumpPage(false), style: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.25)",
    zIndex: 130
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 131,
    background: sv("--bg"),
    borderRadius: 16,
    padding: "20px 24px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
    minWidth: 220,
    textAlign: "center"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 11,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 14
  } }, "跳转到第几页"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      autoFocus: true,
      min: 1,
      max: pageCount,
      placeholder: String(page + 1),
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          const v = parseInt(e.target.value);
          if (v >= 1 && v <= pageCount) {
            goToPage(v - 1);
            setShowJumpPage(false);
          }
        }
      },
      style: {
        width: "100%",
        border: "0.5px solid " + sv("--card-line"),
        background: sv("--card"),
        borderRadius: 10,
        outline: "none",
        padding: "10px 14px",
        textAlign: "center",
        fontFamily: SHELF_SERIF,
        fontSize: 20,
        fontWeight: 700,
        color: sv("--text"),
        boxSizing: "border-box",
        WebkitAppearance: "none",
        MozAppearance: "textfield"
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    marginTop: 8,
    letterSpacing: 0.5
  } }, "共 ", pageCount, " 页 · 输入后按回车"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setShowJumpPage(false), style: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 10,
    background: sv("--bg2"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 600,
    color: sv("--text2")
  } }, "取消"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    const input = document.querySelector('input[type="number"]');
    const v = parseInt(input?.value);
    if (v >= 1 && v <= pageCount) {
      goToPage(v - 1);
      setShowJumpPage(false);
    }
  }, style: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 10,
    background: sv("--accent"),
    color: sv("--on-accent"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 700
  } }, "跳转")))), selUI && /* @__PURE__ */ React.createElement(
    "button",
    {
      onPointerDown: (e) => e.preventDefault(),
      onClick: startNewFromSelection,
      "aria-label": "添加批注",
      title: "节选批注",
      style: {
        position: "absolute",
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        width: 52,
        height: 52,
        borderRadius: 26,
        background: sv("--accent"),
        color: sv("--on-accent"),
        border: "none",
        cursor: "pointer",
        boxShadow: "0 8px 22px rgba(0,0,0,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 130,
        animation: "fadeIn 180ms ease",
        WebkitTapHighlightColor: "transparent"
      }
    },
    /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("path", { d: "M10 3v14M3 10h14", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }))
  ), showToc && /* @__PURE__ */ React.createElement(
    TocDrawer,
    {
      book,
      currentChapterIndex,
      onClose: () => setShowToc(false),
      onJumpPara: (idx) => {
        setShowToc(false);
        jumpToParagraph(idx);
      }
    }
  ), (selected || editing) && /* @__PURE__ */ React.createElement(
    AnnotationSheet,
    {
      mode: editing ? "view" : "new",
      existing: activeAnnotation,
      selectedText: selected ? selected.text : activeAnnotation?.text || "",
      onSave: saveAnnotation,
      onAddComment: addComment,
      onChangeColor: updateColor,
      onDelete: editing ? deleteAnnotation : null,
      onCancel: cancel
    }
  ));
}
function ReaderEmpty({ book, onClose }) {
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    background: sv("--bg"),
    zIndex: 100,
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React.createElement(ShelfTopBar, { title: book.title, left: /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "返回", style: navBtn }, /* @__PURE__ */ React.createElement(IconChevronL, null)) }), /* @__PURE__ */ React.createElement("div", { style: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 40px",
    textAlign: "center"
  } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(BookCover, { book, w: 120, h: 172 }), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 28,
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 14,
    color: sv("--text3"),
    lineHeight: 1.7
  } }, "这本书的正文还没准备好", /* @__PURE__ */ React.createElement("br", null), "（示例 EPUB 没有解析样张）"))));
}
function HighlightColorPicker({ color, onChange }) {
  const labels = { yellow: "黄色高亮", pink: "粉色高亮", green: "绿色高亮", blue: "蓝色高亮" };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "highlight-color-picker",
      role: "group",
      "aria-label": "高亮颜色",
      style: { display: "flex", gap: 2, flexShrink: 0 }
    },
    Object.values(HIGHLIGHTS).map((h) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: h.id,
        type: "button",
        "aria-label": labels[h.id],
        "aria-pressed": color === h.id,
        onClick: () => onChange(h.id),
        style: {
          width: 32,
          height: 32,
          padding: 5,
          border: 0,
          borderRadius: 6,
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", style: {
        width: 22,
        height: 22,
        boxSizing: "border-box",
        borderRadius: "50%",
        background: h.bg,
        border: `1.5px solid ${color === h.id ? sv("--text") : "transparent"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      } }, /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: h.dot } }))
    ))
  );
}
function AnnotationSheet({ mode, existing, selectedText, onSave, onAddComment, onChangeColor, onDelete, onCancel }) {
  const [color, setColor] = React.useState(existing ? existing.color : "yellow");
  const [note, setNote] = React.useState(existing ? existing.note || "" : "");
  const [reply, setReply] = React.useState("");
  const [editingNote, setEditingNote] = React.useState(false);
  const isView = mode === "view";
  const author = existing ? SHELF_AUTHORS[existing.author || "me"] : SHELF_AUTHORS.me;
  const isMine = existing && (existing.author === "me" || !existing.author);
  const commitNoteEdit = () => {
    if (existing) onSave({ color, note });
    setEditingNote(false);
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { onClick: onCancel, style: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.32)",
    zIndex: 110,
    animation: "fadeIn 200ms ease"
  } }), /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 111,
    background: sv("--bg"),
    borderRadius: "20px 20px 0 0",
    padding: "12px 0 0",
    boxShadow: "0 -8px 24px rgba(0,0,0,0.15)",
    animation: "slideUp 280ms cubic-bezier(0.2,0,0.2,1)",
    maxHeight: "78%",
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 38,
    height: 4,
    borderRadius: 2,
    background: sv("--text3"),
    opacity: 0.4,
    margin: "0 auto 8px"
  } }), /* @__PURE__ */ React.createElement(ShelfScrollArea, { style: { flex: 1, overflow: "auto", padding: "8px 20px 0" } }, /* @__PURE__ */ React.createElement("div", { style: {
    padding: "12px 14px",
    borderRadius: 12,
    background: sv("--card"),
    border: "0.5px solid " + sv("--card-line"),
    marginBottom: 14
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SERIF,
    fontStyle: "normal",
    fontSize: 14,
    lineHeight: 1.65,
    color: sv("--text"),
    maxHeight: 110,
    overflow: "auto"
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    background: HIGHLIGHTS[color].bg,
    padding: "1px 3px",
    borderRadius: 2,
    textWrap: "pretty"
  } }, selectedText)), isView && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 0.5
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: sv(author.deepVar) } }, author.name), /* @__PURE__ */ React.createElement("span", null, "· p.", existing.page, " · ", relDate(existing.date)))), isView && /* @__PURE__ */ React.createElement(React.Fragment, null, (existing.note || editingNote) && /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    gap: 10,
    marginBottom: 14
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    width: 6,
    alignSelf: "stretch",
    borderRadius: 3,
    background: HIGHLIGHTS[existing.color].dot
  } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    lineHeight: "16px"
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 11,
    fontWeight: 700,
    color: sv(author.deepVar),
    letterSpacing: 0.5
  } }, author.name), /* @__PURE__ */ React.createElement("span", { className: "annotation-kind", "data-kind": "note" }, "批注"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: SHELF_SANS, fontSize: 10, color: sv("--text3") } }, "· ", relDate(existing.date), isMine && !editingNote ? " · 双击修改" : "")), editingNote && isMine ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: note,
      onChange: (e) => setNote(e.target.value),
      autoFocus: true,
      rows: 3,
      style: {
        width: "100%",
        border: "0.5px solid " + sv("--card-line"),
        background: sv("--card"),
        borderRadius: 10,
        outline: "none",
        padding: "10px 12px",
        resize: "none",
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 14,
        lineHeight: 1.6,
        color: sv("--text"),
        boxSizing: "border-box"
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setNote(existing.note || "");
    setEditingNote(false);
  }, style: {
    padding: "6px 14px",
    borderRadius: 10,
    background: sv("--bg2"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 600,
    color: sv("--text2")
  } }, "取消"), /* @__PURE__ */ React.createElement("button", { onClick: commitNoteEdit, style: {
    padding: "6px 14px",
    borderRadius: 10,
    background: sv("--accent"),
    color: sv("--on-accent"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 700
  } }, "保存"))) : /* @__PURE__ */ React.createElement(
    "div",
    {
      onDoubleClick: () => {
        if (isMine) setEditingNote(true);
      },
      style: {
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 14,
        lineHeight: 1.65,
        color: sv("--text"),
        textWrap: "pretty",
        cursor: isMine ? "text" : "default"
      }
    },
    existing.note
  ))), existing.comments && existing.comments.length > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    paddingTop: 6,
    paddingBottom: 6,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 6
  } }, existing.comments.map((c, i) => {
    const a = SHELF_AUTHORS[c.author];
    const isMe = c.author === "me";
    return /* @__PURE__ */ React.createElement("div", { key: i, style: {
      display: "flex",
      flexDirection: "column",
      alignItems: isMe ? "flex-end" : "flex-start"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
      // Match the bubble's 12px padding + 1px border on either side.
      paddingInline: 13,
      lineHeight: "16px",
      flexDirection: isMe ? "row-reverse" : "row"
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontFamily: SHELF_SANS,
      fontSize: 11,
      fontWeight: 700,
      color: sv(a.deepVar),
      letterSpacing: 0.5
    } }, a.name), /* @__PURE__ */ React.createElement("span", { className: "annotation-kind", "data-kind": "reply" }, "回复"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: SHELF_SANS, fontSize: 10, color: sv("--reply-meta") } }, [c.date ? relDate(c.date) : "", c.time].filter(Boolean).join(" · "))), /* @__PURE__ */ React.createElement("div", { className: "annotation-reply-bubble", style: {
      maxWidth: "88%",
      width: "fit-content",
      boxSizing: "border-box",
      minWidth: 0,
      padding: "9px 12px",
      borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
      background: isMe ? sv("--me-bubble") : sv("--reader-other-bubble"),
      // A full CSS pixel keeps all four edges visible at fractional scroll positions.
      border: "1px solid " + sv("--reply-line"),
      fontFamily: SHELF_SERIF,
      fontStyle: "normal",
      fontSize: 14,
      lineHeight: 1.55,
      color: sv("--reply-ink"),
      textWrap: "wrap",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "normal",
      textAlign: "left"
    } }, c.text));
  })), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
    borderTop: "0.5px solid " + sv("--line"),
    marginTop: 6
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700
  } }, "高亮颜色"), /* @__PURE__ */ React.createElement(HighlightColorPicker, { color, onChange: (value) => {
    setColor(value);
    onChangeColor(value);
  } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("button", { onClick: onDelete, style: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 12,
    fontWeight: 600,
    color: "#C84A3F",
    padding: "4px 8px"
  } }, "删除"))), !isView && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700
  } }, "高亮颜色"), /* @__PURE__ */ React.createElement(HighlightColorPicker, { color, onChange: setColor })), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 10
  } }, "批注 (可选)"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: note,
      onChange: (e) => setNote(e.target.value),
      placeholder: "写点什么……",
      rows: 3,
      style: {
        width: "100%",
        border: "0.5px solid " + sv("--card-line"),
        background: sv("--card"),
        borderRadius: 12,
        outline: "none",
        padding: "12px 14px",
        resize: "none",
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 14,
        lineHeight: 1.6,
        color: sv("--text"),
        marginBottom: 4,
        boxSizing: "border-box"
      }
    }
  ))), /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 16px 22px",
    borderTop: "0.5px solid " + sv("--line"),
    background: sv("--bg")
  } }, isView ? /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: sv("--card"),
    borderRadius: 22,
    padding: "5px 5px 5px 16px",
    border: "0.5px solid " + sv("--card-line")
  } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: reply,
      onChange: (e) => setReply(e.target.value),
      onKeyDown: (e) => {
        if (e.key === "Enter" && reply.trim()) {
          onAddComment(reply);
          setReply("");
        }
      },
      placeholder: "写下回复…",
      style: {
        flex: 1,
        minWidth: 0,
        border: "none",
        background: "transparent",
        outline: "none",
        fontFamily: SHELF_SERIF,
        fontStyle: "normal",
        fontSize: 14,
        color: sv("--text"),
        padding: "6px 0"
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    if (reply.trim()) {
      onAddComment(reply);
      setReply("");
    }
  }, style: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: reply.trim() ? sv("--accent") : sv("--bg2"),
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14" }, /* @__PURE__ */ React.createElement("path", { d: "M7 11V2M3 6l4-4 4 4", stroke: reply.trim() ? sv("--on-accent") : sv("--text3"), strokeWidth: "2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" })))) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } }, /* @__PURE__ */ React.createElement("button", { onClick: onCancel, style: {
    padding: "12px 18px",
    borderRadius: 12,
    flex: 1,
    background: sv("--bg2"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 13,
    fontWeight: 600,
    color: sv("--text2"),
    letterSpacing: 0.5
  } }, "取消"), /* @__PURE__ */ React.createElement("button", { onClick: () => onSave({ color, note: note.trim() }), style: {
    padding: "12px 22px",
    borderRadius: 12,
    flex: 2,
    background: sv("--accent"),
    color: sv("--on-accent"),
    border: "none",
    cursor: "pointer",
    fontFamily: SHELF_SANS,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.5
  } }, "高亮 + 批注")))));
}
function TocDrawer({ book, currentChapterIndex = -1, onClose, onJumpPara }) {
  const listRef = React.useRef(null);
  const currentRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const list = listRef.current, row = currentRef.current;
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect(), rowRect = row.getBoundingClientRect();
    list.scrollTop += rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2;
  }, [currentChapterIndex]);
  const toc = book.toc || [];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { onClick: onClose, style: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.32)",
    zIndex: 120,
    animation: "fadeIn 200ms ease"
  } }), /* @__PURE__ */ React.createElement("div", { className: "reader-toc", style: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    zIndex: 121,
    width: "78%",
    background: sv("--bg"),
    boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
    animation: "slideLeft 320ms cubic-bezier(0.2,0,0.2,1)",
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    padding: "58px 16px 14px",
    flexShrink: 0,
    borderBottom: "0.5px solid " + sv("--line")
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SANS,
    fontSize: 10,
    color: sv("--text3"),
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 4
  } }, "目录"), /* @__PURE__ */ React.createElement("div", { style: {
    fontFamily: SHELF_SERIF,
    fontSize: 18,
    fontWeight: 700,
    color: sv("--text"),
    lineHeight: 1.3
  } }, book.title)), /* @__PURE__ */ React.createElement(ShelfScrollArea, { scrollRef: listRef, className: "reader-toc-list", style: { flex: 1, minHeight: 0, overflow: "auto" } }, toc.map((c, i) => {
    const isCurrent = i === currentChapterIndex;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: i,
        type: "button",
        className: "row-press",
        ref: isCurrent ? currentRef : null,
        "aria-current": isCurrent ? "location" : void 0,
        onClick: () => {
          if (c.paraIdx != null && onJumpPara) onJumpPara(c.paraIdx);
          else onClose();
        },
        style: {
          width: "100%",
          padding: "14px 18px",
          cursor: "pointer",
          border: 0,
          background: "transparent",
          textAlign: "left",
          borderBottom: i === toc.length - 1 ? "none" : "0.5px solid " + sv("--line"),
          display: "flex",
          alignItems: "center",
          WebkitTapHighlightColor: "transparent"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: {
        fontFamily: SHELF_SANS,
        fontSize: 11,
        color: sv("--text3"),
        width: 28,
        flexShrink: 0
      } }, String(i + 1).padStart(2, "0")),
      /* @__PURE__ */ React.createElement("span", { style: {
        flex: 1,
        minWidth: 0,
        overflowWrap: "anywhere",
        fontFamily: SHELF_SERIF,
        fontSize: 14.5,
        lineHeight: 1.5,
        fontWeight: isCurrent ? 700 : 400,
        color: sv("--text")
      } }, c.title),
      /* @__PURE__ */ React.createElement("span", { style: {
        marginLeft: 10,
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontFamily: SHELF_SANS,
        fontSize: isCurrent ? 10 : 11,
        fontWeight: isCurrent ? 600 : 400,
        color: sv(isCurrent ? "--accent" : "--text3")
      } }, isCurrent ? "当前章节" : `p.${c.page}`)
    );
  }))));
}
Object.assign(window, { ReaderView, ReaderEmpty, AnnotationSheet, TocDrawer, splitSentences });
function ShelfApp() {
  const [route, setRoute] = React.useState({ view: "shelf" });
  const [uploading, setUploading] = React.useState(false);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const setBookStatus = (id, status) => {
    const i = BOOKS.findIndex((b) => b.id === id);
    if (i < 0) return;
    BOOKS[i].status = status;
    BOOKS[i].lastReadAt = TODAY_SHELF;
    if (status === "finished") {
      BOOKS[i].progress = 1;
      BOOKS[i].finishedAt = TODAY_SHELF;
      BOOKS[i].currentPage = BOOKS[i].totalPages;
    } else if (status === "reading") {
      if (BOOKS[i].progress === 1) BOOKS[i].progress = 0.95;
      delete BOOKS[i].finishedAt;
    }
    persistShelf();
    forceUpdate();
  };
  const openBook = (bookId, initialTab) => {
    if (window.touchLastRead) window.touchLastRead(bookId);
    setRoute({ view: "detail", bookId, initialTab });
  };
  const resume = (bookId) => {
    if (window.touchLastRead) window.touchLastRead(bookId);
    setRoute({ view: "reader", bookId });
  };
  const backToShelf = () => {
    forceUpdate();
    setRoute({ view: "shelf" });
  };
  const [tab, setTab] = React.useState("books");
  const mainScrollRef = React.useRef(null);
  useShelfScrollPosition(mainScrollRef);
  React.useLayoutEffect(() => {
    const scroller = mainScrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    scroller.parentElement.style.setProperty("--soft-top", "0");
  }, [tab]);
  const closeToHost = () => {
    setTab("books");
    backToShelf();
    if (typeof switchScreen === 'function') {
      switchScreen('home-screen');
    }
  };
  const headers = {
    books: { title: "书架", right: /* @__PURE__ */ React.createElement("button", { style: navBtn, "aria-label": "导入书籍", onClick: () => setUploading(true) }, /* @__PURE__ */ React.createElement(IconPlus, null)) },
    marks: { title: "书签", right: null },
    me: { title: "我", right: null }
  };
  const head = headers[tab];
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: sv("--bg"),
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { ref: mainScrollRef, className: "shelf-main-scroll", style: {
    height: "100%",
    overflow: "auto",
    overflowX: "hidden",
    scrollBehavior: "auto",
    overflowAnchor: "none",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain"
  } }, /* @__PURE__ */ React.createElement(
    ShelfTopBar,
    {
      softEdge: true,
      title: head.title,
      left: /* @__PURE__ */ React.createElement("button", { style: navBtn, "aria-label": "返回", onClick: closeToHost }, /* @__PURE__ */ React.createElement(IconChevronL, null)),
      right: head.right
    }
  ), tab === "books" && /* @__PURE__ */ React.createElement(ShelfView, { isShelfActive: route.view === "shelf", onOpenBook: openBook, onResume: resume, onUpload: () => setUploading(true) }), tab === "marks" && /* @__PURE__ */ React.createElement(MarksView, { onOpenBook: openBook }), tab === "me" && /* @__PURE__ */ React.createElement(ProfileView, { isShelfActive: route.view === "shelf", onOpenBook: openBook, onOpenAnnotation: (bookId, annotation) => setRoute({ view: "reader", bookId, page: annotation.page, annId: annotation.id, paraIdx: annotation.paraIdx, returnToProfile: true }) })), /* @__PURE__ */ React.createElement(ShelfBottomTabBar, { active: tab, onTab: setTab }), route.view === "detail" && /* @__PURE__ */ React.createElement(
    BookDetailView,
    {
      bookId: route.bookId,
      initialTab: route.initialTab,
      onClose: backToShelf,
      onResume: resume,
      onSetStatus: setBookStatus,
      onDelete: (id) => {
        window.removeBook(id);
        setRoute({ view: "shelf" });
        forceUpdate();
      },
      onJumpAnnotation: (bookId, page, annId, paraIdx) => setRoute({ view: "reader", bookId, page, annId, paraIdx })
    }
  ), route.view === "reader" && /* @__PURE__ */ React.createElement(
    ReaderView,
    {
      bookId: route.bookId,
      onClose: () => setRoute(route.returnToProfile ? { view: "shelf" } : { view: "detail", bookId: route.bookId }),
      openAnnotationId: route.annId,
      openParaIdx: route.paraIdx
    }
  ), uploading && /* @__PURE__ */ React.createElement(UploadSheet, { onClose: () => setUploading(false), onAdded: () => {
    setTab("books");
    forceUpdate();
  } }));
}
function ShelfBottomTabBar({ active, onTab }) {
  const tabs = [
    { k: "marks", icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("path", { d: "M4 3h10a2 2 0 012 2v12l-3-2-3 2-3-2-3 2V5a2 2 0 012-2z", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinejoin: "round" })) },
    { k: "books", icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("path", { d: "M3 3.5C3 3.5 5 3 7.5 3.5C9 4 10 5 10 5V17C10 17 9 16 7.5 15.5C5.5 15 3 15.5 3 15.5V3.5Z", stroke: color, strokeWidth: "1.5", fill: "none", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M17 3.5C17 3.5 15 3 12.5 3.5C11 4 10 5 10 5V17C10 17 11 16 12.5 15.5C14.5 15 17 15.5 17 15.5V3.5Z", stroke: color, strokeWidth: "1.5", fill: "none", strokeLinejoin: "round" })) },
    { k: "me", icon: (color) => /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("circle", { cx: "10", cy: "7", r: "3.2", stroke: color, strokeWidth: "1.6", fill: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M3.5 17c.7-3.4 3.4-5 6.5-5s5.8 1.6 6.5 5", stroke: color, strokeWidth: "1.6", fill: "none", strokeLinecap: "round" })) }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "shelf-bottom-bar", style: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingLeft: 18,
    paddingRight: 18,
    // 跟日记保持一致：纯 28px，不再叠 env(safe-area-inset-bottom)
    // （之前叠了 → home indicator 高度 ~34px 全空在底栏下方，比日记浮高一截）
    paddingBottom: 28,
    background: "transparent",
    zIndex: 30
  } }, /* @__PURE__ */ React.createElement(ShelfSoftEdge, { edge: "bottom", size: "calc(100% + 44px)" }), /* @__PURE__ */ React.createElement("div", { className: "shelf-tab-items", style: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    background: "transparent"
  } }, tabs.map((t) => {
    const isActive = active === t.k;
    return /* @__PURE__ */ React.createElement("button", { key: t.k, "aria-label": t.k === "books" ? "书架" : t.k === "marks" ? "书签" : "我", "aria-current": isActive ? "page" : void 0, onClick: () => onTab(t.k), style: {
      background: isActive ? sv("--accent") : "transparent",
      border: "none",
      cursor: "pointer",
      width: 48,
      height: 48,
      borderRadius: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, t.icon(isActive ? sv("--on-accent") : sv("--text2")));
  })));
}
function ShelfRoot() {
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    inset: 0,
    background: sv("--bg"),
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement(ShelfApp, null));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('nest-bookshelf-root');
    if (el) ReactDOM.createRoot(el).render(/* @__PURE__ */ React.createElement(ShelfRoot, null));
  });
} else {
  var el = document.getElementById('nest-bookshelf-root');
  if (el) ReactDOM.createRoot(el).render(/* @__PURE__ */ React.createElement(ShelfRoot, null));
}
