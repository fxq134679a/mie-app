// ============================================================
// 小红书模块 - 动态渲染与交互（xiaohongshu.js）
// 从 React 版 components/xiaohongshu/xiaohongshu-app.tsx 1:1 移植。
// 依赖 xiaohongshu_core.js 提供引擎/存储/记忆函数（此处只调用不定义），
// 依赖 xiaohongshu_html.js 注入的静态外壳插槽。
//
// 与源的内部差异（外观与行为保持一致）：
// 1. 笔记图片直接存 note.imageDataUrl（dataURL），不再走 IndexedDB assetId。
// 2. 默认头像路径改为 assets/xiaohongshu/avatars/default-0N.png。
// 3. 角色列表来自 db.characters（头像 char.avatar，显示名 remarkName/realName）。
// 4. 双语展开为全局开关（源为逐条实例状态）。
// 5. 上传图片不再做 canvas 裁剪压缩，直接读取原始 dataURL。
// ============================================================

(function () {
  "use strict";

  // ------------------------------------------------------------
  // 核心契约：xiaohongshu_core.js 提供的函数（只调用，不在此定义）
  //   loadXiaohongshuState / saveXiaohongshuState / createDefaultXiaohongshuState
  //   createUserXiaohongshuNote / makeXiaohongshuComment / makeXiaohongshuNotification
  //   makeXiaohongshuNpcId / normalizeXiaohongshuSettings
  //   generateXiaohongshuNpcFeed / generateXiaohongshuNpcReactionForUserPost
  //   generateXiaohongshuCharacterActivity / generateXiaohongshuCharacterReactionToUserPost
  //   generateXiaohongshuNpcReplyToUserComment / generateXiaohongshuNpcMoreComments
  //   generateXiaohongshuNpcDmReply / generateXiaohongshuCharacterReplyToUserComment
  //   generateXiaohongshuCharacterMentionReply
  //   applyNpcReaction / applyCharacterReaction / applyNpcCommentReply
  //   applyNpcMoreComments / applyCharacterCommentReply / applyCharacterActivityComment
  //   applyCharacterMentionReply / XiaohongshuGenerationError
  //   recordXiaohongshuPostEvent / recordXiaohongshuCommentEvent / recordXiaohongshuReplyEvent
  //   recordXiaohongshuFollowUserEvent / deleteXiaohongshuProjectionEventsForNote
  //   deleteXiaohongshuProjectionEventForComment
  //   resolveCharacterXiaohongshuDisplayName / isCharacterXiaohongshuAuthor
  //   DEFAULT_XIAOHONGSHU_SETTINGS / DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT
  // ------------------------------------------------------------

  // 图标（lucide 内联 SVG，phosphor ShareFat）
  const XHS_ICON_PATHS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "user-round": '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    "message-circle": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    "loader-2": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    "at-sign": '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
    "image-plus": '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  function xhsIcon(name, size, strokeWidth, className) {
    const path = XHS_ICON_PATHS[name] || "";
    const cls = className ? ` class="${className}"` : "";
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth == null ? 2 : strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  function xhsShareFatIcon(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M243.66 109.29l-88-88a12 12 0 0 0-20.49 8.48V72.33C70.55 79.62 27.86 131.53 20 189.79a12 12 0 0 0 21.08 9.46c27.43-33.85 58.05-51.11 94.09-52.59V192a12 12 0 0 0 20.49 8.49l88-88a12 12 0 0 0 0-17.2Z"></path></svg>`;
  }

  const TABS = [
    { id: "home", label: "首页", icon: "home" },
    { id: "video", label: "附近", icon: "map-pin" },
    { id: "publish", label: "发布", icon: "plus" },
    { id: "messages", label: "消息", icon: "bell" },
    { id: "profile", label: "我的", icon: "user-round" },
  ];

  const PROFILE_TABS = [
    { id: "notes", label: "笔记" },
    { id: "comments", label: "评论" },
    { id: "saved", label: "收藏" },
    { id: "liked", label: "赞过" },
  ];

  const HOME_FEED_TABS = [
    { id: "follow", label: "关注" },
    { id: "discover", label: "发现" },
    { id: "video", label: "视频" },
  ];

  const DEFAULT_XHS_AVATARS = [
    "assets/xiaohongshu/avatars/default-01.png",
    "assets/xiaohongshu/avatars/default-02.png",
    "assets/xiaohongshu/avatars/default-03.png",
    "assets/xiaohongshu/avatars/default-04.png",
    "assets/xiaohongshu/avatars/default-05.png",
    "assets/xiaohongshu/avatars/default-06.png",
  ];

  const XHS_DEFAULT_AVATAR_PREFIX = "assets/xiaohongshu/avatars/";
  const XHS_DM_EMOJIS = ["😊", "😂", "🥺", "😭", "😳", "👍", "❤️", "✨", "🌸", "🍵", "🥰", "🤔", "😎", "🙌", "💌", "🫶"];

  const XHS_MAX_IMAGE_HEIGHT_RATIO = 4 / 3;
  const XHS_TEXT_IMAGE_HEIGHT_RATIO = 1.18;
  const XHS_VIDEO_IMAGE_HEIGHT_RATIO = XHS_TEXT_IMAGE_HEIGHT_RATIO;
  const DEFAULT_XHS_IMAGE_FRAME_STYLE = `aspect-ratio: 1 / ${XHS_MAX_IMAGE_HEIGHT_RATIO}`;
  const TEXT_XHS_IMAGE_FRAME_STYLE = `aspect-ratio: 1 / ${XHS_TEXT_IMAGE_HEIGHT_RATIO}`;
  const VIDEO_XHS_IMAGE_FRAME_STYLE = `aspect-ratio: 1 / ${XHS_VIDEO_IMAGE_HEIGHT_RATIO}`;
  const ICON_XHS_IMAGE_FRAME_STYLES = {
    compact: "aspect-ratio: 1 / 0.9",
    regular: `aspect-ratio: 1 / ${XHS_TEXT_IMAGE_HEIGHT_RATIO}`,
    tall: `aspect-ratio: 1 / ${XHS_MAX_IMAGE_HEIGHT_RATIO}`,
  };

  // 防御性包装：核心常量/函数由 xiaohongshu_core.js 提供；缺失时退回本地兜底
  const CORE_DEFAULT_BILINGUAL_PROMPT = typeof DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT === "string"
    ? DEFAULT_XIAOHONGSHU_BILINGUAL_PROMPT
    : [
      "【小红书双语输出规则（仅非中文角色使用，中文角色忽略此规则）】",
      "- 只对小红书角色生成内容生效，包括帖子标题、正文、评论、回复、图片描述、视频描述、私信正文等自然语言内容。",
      "- 不要改动结构标签、块标题或字段名，例如 #评论1、#角色回复、[标题]、[正文]、[内容]、[图片描述]、[视频描述]。",
      "- 如果某个字段内容使用非中文语言，字段值必须写成“完整原文|对应的简体中文译文”。",
      "- 如果内容本来就是中文，正常输出中文，不要添加 |译文。",
      "- 竖线 | 只作为完整原文和完整译文之间的分隔符，不要在原文或译文内部滥用。",
    ].join("\n");

  const CORE_DEFAULT_SETTINGS = typeof DEFAULT_XIAOHONGSHU_SETTINGS !== "undefined" && DEFAULT_XIAOHONGSHU_SETTINGS
    ? DEFAULT_XIAOHONGSHU_SETTINGS
    : {
      bilingualTranslationEnabled: true,
      collapseBilingualTranslation: true,
      bilingualTranslationPrompt: CORE_DEFAULT_BILINGUAL_PROMPT,
      npcIdentityGuardPrompt: "",
      npcFeedPrompt: "",
      npcUserPostReactionPrompt: "",
      npcCommentReplyPrompt: "",
      npcMoreCommentsPrompt: "",
      npcDmReplyPrompt: "",
      participantCharacterIds: [],
      sendToCharacterProbability: 60,
    };

  function xhsNotice(msg) {
    if (typeof showToast === "function") showToast(msg);
    else console.log("[小红书]", msg);
  }

  function xhsEscapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ------------------------------------------------------------
  // UI 状态（等价于 TSX 的 useState 集合）
  // ------------------------------------------------------------
  const xhsState = {
    initialized: false,
    selectedTab: "home",
    homeFeedTab: "discover",
    settingsOpen: false,
    profileOpen: false,
    composeOpen: false,
    selectedNoteId: null,
    busy: "idle",
    error: "",
    debugErrorTitle: "暂时无法完成小红书操作。",
    debugRawOutput: "",
    debugParseError: "",
    showDebugReason: false,
    debugCopyResetTimer: null,
    profileTopbarVisible: false,
    profileTab: "notes",
    commentDraft: "",
    replyTarget: null,
    commentComposerFocused: false,
    videoCommentsOpen: false,
    videoSwipeStart: null,
    videoLastWheelAt: 0,
    videoSettleTimer: null,
    videoDragOffset: 0,
    videoDragSettling: false,
    videoDragDirection: null,
    videoCaptionExpanded: false,
    videoCaptionCanExpand: false,
    collapsedVideoCaption: "",
    messagePanel: null,
    selectedDmThreadId: null,
    dmDraft: "",
    dmEmojiOpen: false,
    commentEmojiOpen: false,
    commentMentionOpen: false,
    deleteTarget: null,
    pendingFeedAction: null,
    profileDraft: null,
    settingsDraft: null,
    expandedPrompts: [],
    draft: { title: "", body: "", tags: [], image: {} },
    tagInput: "",
    mainScrollTop: 0,
    bilingualExpandedOverride: null,
    savedScroll: { main: 0, detail: 0, video: 0, thread: 0 },
    lastViewKind: "",
    focusPlan: null,
  };

  let xhsData = null;

  // ------------------------------------------------------------
  // 基础工具
  // ------------------------------------------------------------
  function formatCount(value) {
    if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return String(Math.max(0, Math.round(value)));
  }

  function formatBadgeCount(value) {
    if (value > 99) return "99+";
    return String(Math.max(0, Math.round(value)));
  }

  function parseCompactCountLabel(value) {
    const normalized = String(value).trim().replace(/[,，\s]/g, "");
    const match = /^(\d+(?:\.\d+)?)([kKwW万千])?$/.exec(normalized);
    if (!match) return 1;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return 1;
    const unit = match[2];
    if (unit === "w" || unit === "W" || unit === "万") return Math.max(1, Math.round(amount * 10000));
    if (unit === "k" || unit === "K" || unit === "千") return Math.max(1, Math.round(amount * 1000));
    return Math.max(1, Math.round(amount));
  }

  function parseNotificationCountFromTextLocal(text) {
    const match = String(text).match(/等\s*([0-9][\d.,，]*(?:\.\d+)?\s*(?:[kKwW万千])?)\s*人/);
    return match ? parseCompactCountLabel(match[1]) : 1;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}小时前`;
    return `${Math.round(diffMinutes / 1440)}天前`;
  }

  function splitColumns(items) {
    const left = [];
    const right = [];
    items.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return [left, right];
  }

  function addId(list, id) {
    return list.includes(id) ? list : [id, ...list];
  }

  function removeId(list, id) {
    return list.filter(item => item !== id);
  }

  function accountKey(account) {
    return `${account.type}:${account.id}`;
  }

  function noteAuthorKey(note) {
    if (note.source === "user") return "";
    const id = note.authorId || (note.source === "npc" ? makeXiaohongshuNpcId(note.authorName) : note.source);
    return accountKey({ type: note.source, id });
  }

  function dedupeAccounts(accounts) {
    const seen = new Set();
    return accounts.filter(account => {
      const key = accountKey(account);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function makeNpcAccount(name) {
    return {
      type: "npc",
      id: makeXiaohongshuNpcId(name),
      name,
      followedAt: new Date().toISOString(),
    };
  }

  function hashStringLocal(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function pickDefaultAvatar(seed) {
    return DEFAULT_XHS_AVATARS[hashStringLocal(seed || "npc") % DEFAULT_XHS_AVATARS.length];
  }
