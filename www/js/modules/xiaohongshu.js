// ============================================================
// 小红书 APP 主模块（xiaohongshu.js）
// 依赖全局（index.html 按序加载）：
//   1) xiaohongshu_core.js —— 状态存储 / AI 生成 / apply / 记忆事件
//   2) xiaohongshu_html.js —— injectXiaohongshuHTML() 静态骨架
//   3) main.js —— .back-btn[data-target] 全局返回桌面代理、showToast
// 纯 vanilla JS：状态对象 + 渲染函数 + 事件委托，无框架。
// ============================================================

/* global document, window, requestAnimationFrame, cancelAnimationFrame,
   loadXiaohongshuState, saveXiaohongshuState, createDefaultXiaohongshuState,
   resetXiaohongshuState, DEFAULT_XIAOHONGSHU_SETTINGS, makeXiaohongshuNpcId,
   getXiaohongshuCharacterList, resolveCharacterXiaohongshuDisplayName,
   createUserXiaohongshuNote, makeXiaohongshuComment, makeXiaohongshuNotification,
   generateXiaohongshuNpcFeed, generateXiaohongshuNpcReactionForUserPost,
   generateXiaohongshuNpcReplyToUserComment, generateXiaohongshuNpcMoreComments,
   generateXiaohongshuNpcDmReply, generateXiaohongshuCharacterActivity,
   generateXiaohongshuCharacterReactionToUserPost,
   generateXiaohongshuCharacterReplyToUserComment,
   generateXiaohongshuCharacterMentionReply,
   applyNpcReaction, applyNpcCommentReply, applyNpcMoreComments,
   applyCharacterReaction, applyCharacterCommentReply,
   applyCharacterActivityComment, applyCharacterMentionReply,
   recordXiaohongshuPostEvent, recordXiaohongshuCommentEvent,
   recordXiaohongshuReplyEvent, recordXiaohongshuFollowUserEvent,
   deleteXiaohongshuProjectionEventsForNote, deleteXiaohongshuProjectionEventForComment,
   XiaohongshuGenerationError, resolveNoteImageDataUrl, xhsHasNoteImage,
   resolveGlobalApiConfig, getXiaohongshuUserProfileName, showToast */

(function () {
    "use strict";

    // ============================================================
    // 常量
    // ============================================================
    var TABS = [
        { id: "home", label: "首页" },
        { id: "video", label: "附近" },
        { id: "publish", label: "发布" },
        { id: "messages", label: "消息" },
        { id: "profile", label: "我的" }
    ];
    var PROFILE_TABS = [
        { id: "notes", label: "笔记" },
        { id: "comments", label: "评论" },
        { id: "saved", label: "收藏" },
        { id: "liked", label: "赞过" }
    ];
    var HOME_FEED_TABS = [
        { id: "follow", label: "关注" },
        { id: "discover", label: "发现" },
        { id: "video", label: "视频" }
    ];
    var XHS_DM_EMOJIS = ["😊", "😂", "🥺", "😭", "😳", "👍", "❤️", "✨", "🌸", "🍵", "🥰", "🤔", "😎", "🙌", "💌", "🫶"];
    var XHS_MAX_IMAGE_HEIGHT_RATIO = 4 / 3;
    var XHS_TEXT_IMAGE_HEIGHT_RATIO = 1.18;
    var XHS_VIDEO_IMAGE_HEIGHT_RATIO = XHS_TEXT_IMAGE_HEIGHT_RATIO;
    var XHS_COVER_LOCAL_KEY = "xhs_cover_local";
    var XHS_COVER_STORAGE_KEY = "ai_phone_xiaohongshu_cover_v1";

    // ============================================================
    // 小工具
    // ============================================================
    function el(id) { return document.getElementById(id); }
    function esc(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function formatCount(value) {
        var v = Number(value) || 0;
        if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + "万";
        if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
        return String(Math.max(0, Math.round(v)));
    }
    function formatBadgeCount(value) {
        if (value > 99) return "99+";
        return String(Math.max(0, Math.round(value)));
    }
    function parseCompactCountLabel(value) {
        var normalized = String(value || "").trim().replace(/[,，\s]/g, "");
        var match = /^(\d+(?:\.\d+)?)([kKwW万千])?$/.exec(normalized);
        if (!match) return 1;
        var amount = Number(match[1]);
        if (!Number.isFinite(amount)) return 1;
        var unit = match[2];
        if (unit === "w" || unit === "W" || unit === "万") return Math.max(1, Math.round(amount * 10000));
        if (unit === "k" || unit === "K" || unit === "千") return Math.max(1, Math.round(amount * 1000));
        return Math.max(1, Math.round(amount));
    }
    function parseNotificationCountFromText(text) {
        var match = String(text || "").match(/等\s*([0-9][\d.,，]*(?:\.\d+)?\s*(?:[kKwW万千])?)\s*人/);
        return match ? parseCompactCountLabel(match[1]) : 1;
    }
    function formatTime(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        var diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
        if (diffMinutes < 60) return diffMinutes + "分钟前";
        if (diffMinutes < 1440) return Math.round(diffMinutes / 60) + "小时前";
        return Math.round(diffMinutes / 1440) + "天前";
    }
    function splitColumns(items) {
        var left = [], right = [];
        items.forEach(function (item, index) {
            if (index % 2 === 0) left.push(item); else right.push(item);
        });
        return [left, right];
    }
    function addId(list, id) { return list.indexOf(id) >= 0 ? list : [id].concat(list); }
    function removeId(list, id) { return list.filter(function (item) { return item !== id; }); }
    function accountKey(account) { return account.type + ":" + account.id; }
    function noteAuthorKey(note) {
        if (note.source === "user") return "";
        var id = note.authorId || (note.source === "npc" ? makeXiaohongshuNpcId(note.authorName) : note.source);
        return accountKey({ type: note.source, id: id });
    }
    function dedupeAccounts(accounts) {
        var seen = Object.create(null);
        return accounts.filter(function (account) {
            var key = accountKey(account);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }
    function makeNpcAccount(name) {
        return {
            type: "npc",
            id: makeXiaohongshuNpcId(name),
            name: name,
            followedAt: new Date().toISOString()
        };
    }
    function hashNum(value) {
        var hash = 0;
        var text = String(value || "");
        for (var index = 0; index < text.length; index += 1) {
            hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
        }
        return hash;
    }
    // mie 没有 /xiaohongshu/avatars/*.png 资源，默认头像回退为“首字母”样式。
    function pickDefaultAvatar() { return ""; }
    function getNoteCardVariant(note) {
        var textLength = getXhsPlainText(note.body).length + getXhsPlainText(note.title).length;
        if (textLength > 95) return "tall";
        if (textLength > 54) return "regular";
        return "compact";
    }
    function aspectStyle(ratio) { return ' style="aspect-ratio:1 / ' + ratio + '"'; }
    function defaultImageFrameStyle() { return aspectStyle("1.3333"); }
    function textImageFrameStyle() { return aspectStyle(XHS_TEXT_IMAGE_HEIGHT_RATIO); }
    function videoImageFrameStyle() { return aspectStyle(XHS_VIDEO_IMAGE_HEIGHT_RATIO); }
    function iconImageFrameStyle(note) {
        var variant = getNoteCardVariant(note);
        if (variant === "compact") return aspectStyle("0.9");
        if (variant === "regular") return aspectStyle(XHS_TEXT_IMAGE_HEIGHT_RATIO);
        return aspectStyle("1.3333");
    }
    function getImageFrameStyleAttr(width, height) {
        if (!width || !height || width <= 0 || height <= 0) return defaultImageFrameStyle();
        var heightRatio = Math.min(height / width, XHS_MAX_IMAGE_HEIGHT_RATIO);
        return aspectStyle(heightRatio.toFixed(4));
    }
    function getGenderClassName(value) {
        var normalized = String(value || "").trim().toLowerCase();
        if (!normalized) return "xhs-profile-gender xhs-profile-gender--female";
        if (normalized.indexOf("女") >= 0 || normalized.indexOf("♀") >= 0 || normalized.indexOf("female") >= 0) {
            return "xhs-profile-gender xhs-profile-gender--female";
        }
        if (normalized.indexOf("男") >= 0 || normalized.indexOf("♂") >= 0 || normalized.indexOf("male") >= 0) {
            return "xhs-profile-gender xhs-profile-gender--male";
        }
        return "xhs-profile-gender";
    }
    function noteHasUserComment(note) {
        return note.comments.some(function (comment) { return comment.authorType === "user"; });
    }

    // ============================================================
    // 双语文本（源 lib/bilingual-text.ts + CheckPhoneBilingualText）
    // ============================================================
    function containsChinese(text) { return /[\u3400-\u9fff]/.test(text); }
    function normalizeBilingualTextInput(text) { return String(text || "").replace(/\\r\\n|\\n|\\r/g, "\n"); }
    function splitSegmentedBilingualLine(line) {
        var parts = line.split("|").map(function (part) { return part.trim(); });
        if (parts.length < 2 || parts.some(function (part) { return !part; })) return null;
        if (parts.length === 3) {
            var originalLabel = parts[0], mixedLabelAndOriginal = parts[1], translatedValue = parts[2];
            var colonIndex = mixedLabelAndOriginal.search(/[:：]/);
            if (colonIndex > 0 && containsChinese(translatedValue) && !containsChinese(originalLabel)) {
                var translatedLabel = mixedLabelAndOriginal.slice(0, colonIndex + 1).trim();
                var originalValue = mixedLabelAndOriginal.slice(colonIndex + 1).trim();
                if (translatedLabel && originalValue && containsChinese(translatedLabel)) {
                    return {
                        original: originalLabel + ": " + originalValue,
                        translated: translatedLabel + " " + translatedValue
                    };
                }
            }
        }
        if (parts.length % 2 !== 0) return null;
        var originalParts = [], translatedParts = [], hasNonChineseOriginal = false;
        for (var index = 0; index < parts.length; index += 2) {
            var original = parts[index], translated = parts[index + 1];
            if (!translated || !containsChinese(translated)) return null;
            if (!containsChinese(original)) hasNonChineseOriginal = true;
            originalParts.push(original);
            translatedParts.push(translated);
        }
        if (!hasNonChineseOriginal) return null;
        return { original: originalParts.join(" | "), translated: translatedParts.join(" | ") };
    }
    function splitBilingualText(text) {
        var trimmed = normalizeBilingualTextInput(text).trim();
        if (!trimmed || trimmed.indexOf("```") >= 0 || /<script\b|<style\b/i.test(trimmed)) return null;
        var firstPipe = trimmed.indexOf("|");
        if (firstPipe <= 0) return null;
        if (firstPipe === trimmed.lastIndexOf("|")) {
            var original = trimmed.slice(0, firstPipe).trim();
            var translated = trimmed.slice(firstPipe + 1).trim();
            if (!original || !translated) return null;
            if (!containsChinese(translated)) return null;
            return { original: original, translated: translated };
        }
        if (trimmed.indexOf("\n") >= 0) {
            var originalLines = [], translatedLines = [], bilingualLineCount = 0;
            trimmed.split("\n").forEach(function (rawLine) {
                var line = rawLine.trim();
                if (!line) { originalLines.push(""); translatedLines.push(""); return; }
                var linePipe = line.indexOf("|");
                if (linePipe > 0 && linePipe === line.lastIndexOf("|")) {
                    var lineOriginal = line.slice(0, linePipe).trim();
                    var lineTranslated = line.slice(linePipe + 1).trim();
                    if (!lineOriginal || !lineTranslated || !containsChinese(lineTranslated)) { originalLines = null; }
                    if (!originalLines) return;
                    originalLines.push(lineOriginal);
                    translatedLines.push(lineTranslated);
                    bilingualLineCount += 1;
                    return;
                }
                if (line.indexOf("|") >= 0) {
                    var segmented = splitSegmentedBilingualLine(line);
                    if (!segmented) { originalLines = null; return; }
                    originalLines.push(segmented.original);
                    translatedLines.push(segmented.translated);
                    bilingualLineCount += 1;
                    return;
                }
                originalLines.push(line);
                translatedLines.push(line);
            });
            if (!originalLines || bilingualLineCount === 0) return null;
            var blockOriginal = originalLines.join("\n").trim();
            var blockTranslated = translatedLines.join("\n").trim();
            if (!blockOriginal || !blockTranslated || !containsChinese(blockTranslated)) return null;
            return { original: blockOriginal, translated: blockTranslated };
        }
        return splitSegmentedBilingualLine(trimmed);
    }
    function getXhsPlainText(text) {
        var normalized = normalizeBilingualTextInput(text);
        var split = splitBilingualText(normalized);
        return split ? split.original : normalized;
    }
    function bilingualHtml(text, tone, variant) {
        var normalized = normalizeBilingualTextInput(text);
        var split = splitBilingualText(normalized);
        if (!split) return esc(normalized);
        var expanded = S.bilingualExpanded;
        var classes = "cp-bilingual cp-bilingual--" + (tone || "default") + " cp-bilingual--" + (variant || "block");
        var html = '<span class="' + classes + '">'
            + '<span class="cp-bilingual-original">' + esc(split.original) + '</span>'
            + '<span class="cp-bilingual-toggle" data-action="bilingual-toggle" role="button">' + (expanded ? "收起中文" : "中文") + '</span>';
        if (expanded) {
            html += variant === "inline"
                ? '<span class="cp-bilingual-inline-separator" aria-hidden="true"> </span>'
                : '<span class="cp-bilingual-divider" aria-hidden="true"></span>';
            html += '<span class="cp-bilingual-translation">' + esc(split.translated) + '</span>';
        }
        return html + '</span>';
    }

    // ============================================================
    // 内联 SVG 图标（Bootstrap/Lucide 风格）
    // ============================================================
    var ICON_PATHS = {
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
        send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
        smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
        at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
        sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>',
        share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
        more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
        chevronDown: '<path d="M6 9l6 6 6-6"/>',
        chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
        trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
        imagePlus: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/><path d="M18.5 2.5v4M16.5 4.5h4"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'
    };
    function icon(name, size, strokeWidth, filled) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="'
            + (filled ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="'
            + (strokeWidth || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + (ICON_PATHS[name] || "") + '</svg>';
    }
    function dislikeIcon() {
        return '<svg class="xhs-comment-dislike-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<circle cx="12" cy="12" r="9.2"/><path d="M8.3 9.7h1.9"/><path d="M13.8 9.7h1.9"/><path d="M8.9 15.5c1.7-.85 4.5-.85 6.2 0"/></svg>';
    }
    function avatarHtml(className, src, name) {
        var isDefault = typeof src === "string" && src.indexOf("/xiaohongshu/avatars/") === 0;
        var inner = src
            ? '<img src="' + esc(src) + '" alt="" />'
            : '<span>' + esc((name || "?").slice(0, 1)) + '</span>';
        return '<div class="' + esc(className) + (isDefault ? " xhs-default-avatar" : "") + '">' + inner + '</div>';
    }

    // ============================================================
    // 模块状态
    // ============================================================
    var S = {
        state: null,
        characters: [],
        selectedTab: "home",
        homeFeedTab: "discover",
        profileTab: "notes",
        selectedNoteId: null,
        busy: "idle",
        imageMap: {},
        bilingualExpanded: false,
        messagePanel: null,
        selectedDmThreadId: null,
        dmDraft: "",
        dmEmojiOpen: false,
        commentDraft: "",
        replyTarget: null,
        commentComposerFocused: false,
        commentEmojiOpen: false,
        commentMentionOpen: false,
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
        captionMeasured: false,
        profileTopbarVisible: false,
        composeOpen: false,
        settingsOpen: false,
        profileOpen: false,
        deleteTarget: null,
        pendingFeedAction: null,
        draft: { title: "", body: "", tags: [], image: {} },
        tagInput: "",
        settingsDraft: null,
        expandedPrompts: {},
        profileDraft: null,
        mainScrollTop: 0
    };

    // ============================================================
    // 派生数据
    // ============================================================
    function getState() { return S.state; }
    function findNote(noteId) {
        return S.state.notes.find(function (note) { return note.id === noteId; }) || null;
    }
    function selectedNote() { return S.selectedNoteId ? findNote(S.selectedNoteId) : null; }
    function hiddenFeedNoteIds() { return new Set(S.state.feedHiddenNoteIds); }
    function followedAccountKeys() {
        return new Set(S.state.socialGraph.following.map(accountKey));
    }
    function byCreatedDesc(a, b) { return b.createdAt.localeCompare(a.createdAt); }
    function discoverNotes() {
        var hidden = hiddenFeedNoteIds();
        return S.state.notes.filter(function (note) {
            return note.type === "post" && note.feedScope !== "nearby" && !hidden.has(note.id);
        }).sort(byCreatedDesc);
    }
    function nearbyNotes() {
        var hidden = hiddenFeedNoteIds();
        return S.state.notes.filter(function (note) {
            return note.type === "post" && note.feedScope === "nearby" && !hidden.has(note.id);
        }).sort(byCreatedDesc);
    }
    function followedNotes() {
        var hidden = hiddenFeedNoteIds();
        var keys = followedAccountKeys();
        return S.state.notes.filter(function (note) {
            if (note.source === "user" || hidden.has(note.id)) return false;
            // 已关注账号的帖子
            if (keys.has(noteAuthorKey(note))) return true;
            // 角色发的帖子也显示在关注页
            if (note.source === "character") return true;
            return false;
        }).sort(byCreatedDesc);
    }
    function videoNotes() {
        var hidden = hiddenFeedNoteIds();
        return S.state.notes.filter(function (note) {
            return note.type === "video" && !hidden.has(note.id);
        }).sort(byCreatedDesc);
    }
    function activeHomeNotes() {
        if (S.homeFeedTab === "follow") return followedNotes();
        if (S.homeFeedTab === "video") return videoNotes();
        return discoverNotes();
    }
    function activeVideoNoteIndex() {
        var notes = videoNotes();
        return notes.findIndex(function (note) { return note.id === S.selectedNoteId; });
    }
    function myNotes() {
        return S.state.notes.filter(function (note) { return note.source === "user"; }).sort(byCreatedDesc);
    }
    function profileNotes() {
        if (S.profileTab === "notes") return myNotes();
        var ids = [];
        if (S.profileTab === "comments") {
            ids = S.state.userInteractions.commentedNoteIds.concat(
                S.state.notes.filter(function (note) { return note.comments.some(function (c) { return c.authorType === "user"; }); }).map(function (note) { return note.id; })
            );
        } else if (S.profileTab === "saved") {
            ids = S.state.userInteractions.savedNoteIds.concat(
                S.state.notes.filter(function (note) { return note.saved; }).map(function (note) { return note.id; })
            );
        } else if (S.profileTab === "liked") {
            ids = S.state.userInteractions.likedNoteIds.concat(
                S.state.notes.filter(function (note) { return note.liked; }).map(function (note) { return note.id; })
            );
        }
        var idSet = new Set(ids);
        return S.state.notes.filter(function (note) { return idSet.has(note.id); })
            .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    }
    function dmNotifications() {
        return S.state.notifications.filter(function (item) { return item.type === "dm"; });
    }
    function dmThreads() {
        var groups = new Map();
        dmNotifications().forEach(function (notice) {
            var threadName = (notice.threadName || "").trim() || (notice.actorName || "").trim() || "小红书用户";
            var threadId = (notice.threadId || "").trim() || ("dm:" + threadName);
            var list = groups.get(threadId) || [];
            list.push(notice);
            groups.set(threadId, list);
        });
        return Array.from(groups.entries()).flatMap(function (entry) {
            var sorted = entry[1].slice().sort(function (a, b) { return Date.parse(a.createdAt) - Date.parse(b.createdAt); });
            var latest = sorted[sorted.length - 1];
            if (!latest) return [];
            var actorName = latest.threadName
                || (sorted.find(function (item) { return item.direction !== "outgoing"; }) || {}).actorName
                || latest.actorName || "小红书用户";
            return [{
                id: entry[0],
                actorName: actorName,
                notifications: sorted,
                latest: latest,
                unreadCount: sorted.reduce(function (total, item) { return total + notificationUnreadWeight(item); }, 0)
            }];
        }).sort(function (a, b) { return Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt); });
    }
    function selectedDmThread() {
        if (!S.selectedDmThreadId) return null;
        return dmThreads().find(function (thread) { return thread.id === S.selectedDmThreadId; }) || null;
    }
    function selectedMessageNotifications() {
        if (!S.messagePanel) return [];
        return S.state.notifications.filter(function (item) {
            return S.messagePanel === "engagement" ? item.type === "like" || item.type === "save" : item.type === S.messagePanel;
        });
    }
    function selectedMessagePanelLabel() {
        if (S.messagePanel === "engagement") return "点赞和收藏";
        if (S.messagePanel === "follow") return "新增关注";
        if (S.messagePanel === "comment") return "评论";
        return "";
    }
    function selectedMessagePanelTitle() {
        return S.messagePanel === "engagement" ? "收到的赞和收藏" : selectedMessagePanelLabel();
    }
    function isMessageSubpage() {
        return S.selectedTab === "messages" && (Boolean(S.messagePanel) || Boolean(S.selectedDmThreadId));
    }
    function notificationEngagementCount(notice) {
        if (notice.type !== "like" && notice.type !== "save") return 1;
        return Math.max(1, Math.round(notice.count != null ? notice.count : parseNotificationCountFromText(notice.text)));
    }
    function notificationUnreadWeight(notice) {
        if (!notice.unread) return 0;
        return notificationEngagementCount(notice);
    }
    function unreadCount() {
        return S.state.notifications.reduce(function (total, item) { return total + notificationUnreadWeight(item); }, 0);
    }
    function engagementUnreadCount() {
        return S.state.notifications.reduce(function (total, item) {
            if (item.type !== "like" && item.type !== "save") return total;
            return total + notificationUnreadWeight(item);
        }, 0);
    }
    function followUnreadCount() {
        return S.state.notifications.filter(function (item) { return item.unread && item.type === "follow"; }).length;
    }
    function commentUnreadCount() {
        return S.state.notifications.filter(function (item) { return item.unread && item.type === "comment"; }).length;
    }
    function makeCharacterAccount(character) {
        return {
            type: "character",
            id: character.id,
            name: resolveCharacterXiaohongshuDisplayName(character),
            avatar: character.avatar || undefined,
            followedAt: new Date().toISOString()
        };
    }
    function makeAccountFromNote(note) {
        if (note.source === "user") return null;
        return {
            type: note.source,
            id: note.authorId || (note.source === "npc" ? makeXiaohongshuNpcId(note.authorName) : note.source),
            name: note.authorName,
            followedAt: new Date().toISOString()
        };
    }
    function isFollowingAccount(account) {
        if (!account) return false;
        var key = accountKey(account);
        return S.state.socialGraph.following.some(function (item) { return accountKey(item) === key; });
    }
    function characterAvatarMap() {
        var map = new Map();
        S.characters.forEach(function (character) {
            if (character.avatar) map.set(character.id, character.avatar);
        });
        return map;
    }
    function resolveAuthorAvatar(source, authorId, authorName, seed) {
        if (source === "user") return "";
        if (source === "character") return characterAvatarMap().get(authorId) || pickDefaultAvatar("character:" + (authorId || authorName));
        return pickDefaultAvatar("npc:" + (authorName || authorId || seed));
    }
    function getNoteAvatar(note) {
        return resolveAuthorAvatar(note.source, note.authorId, note.authorName, note.id);
    }
    function getCommentAvatar(comment) {
        return resolveAuthorAvatar(comment.authorType, comment.authorId, comment.authorName, comment.id);
    }
    function getNotificationAvatar(actorName, seed) {
        var character = S.characters.find(function (item) {
            return item.name === actorName || resolveCharacterXiaohongshuDisplayName(item) === actorName;
        });
        if (character && character.avatar) return character.avatar;
        if (actorName === S.state.profile.nickname) return "";
        return pickDefaultAvatar("notice:" + (actorName || seed));
    }
    function userAvatar() { return ""; }
    function followedMentionCharacters() {
        var characterById = new Map(S.characters.map(function (character) { return [character.id, character]; }));
        return S.state.socialGraph.following
            .filter(function (account) { return account.type === "character"; })
            .map(function (account) {
                var character = characterById.get(account.id);
                if (!character) return null;
                return {
                    account: account,
                    character: character,
                    displayName: account.name || resolveCharacterXiaohongshuDisplayName(character),
                    avatar: account.avatar || character.avatar || ""
                };
            })
            .filter(Boolean);
    }
    function findMentionCharacterInText(text) {
        var list = followedMentionCharacters().slice()
            .sort(function (left, right) { return right.displayName.length - left.displayName.length; });
        var found = list.find(function (item) { return text.indexOf("@" + item.displayName) >= 0; });
        return found ? found.character : undefined;
    }
    function noteImageKey(note) { return note.imageAssetId || note.id; }
    function profileCoverImage() {
        var key = S.state.profile.coverImageAssetId;
        return key ? (S.imageMap[key] || "") : "";
    }
    function profileStats() {
        return {
            followingCount: S.state.socialGraph.following.length,
            followerCount: S.state.socialGraph.followers.length,
            likedAndSavedCount: S.state.notes
                .filter(function (note) { return note.source === "user"; })
                .reduce(function (total, note) { return total + note.likeCount + note.saveCount; }, 0)
        };
    }
    function commentComposerExpanded() {
        return S.commentComposerFocused || Boolean(S.commentDraft.trim()) || Boolean(S.replyTarget)
            || S.commentEmojiOpen || S.commentMentionOpen;
    }
    function getNotificationNote(notice) {
        if (!notice.noteId) return null;
        return findNote(notice.noteId);
    }

    // ============================================================
    // 评论区二级平铺排序（源 orderCommentsForDisplay）
    // ============================================================
    function orderCommentsForDisplay(comments) {
        var byId = new Map(comments.map(function (comment) { return [comment.id, comment]; }));
        var indexById = new Map(comments.map(function (comment, index) { return [comment.id, index]; }));
        var childrenByParent = new Map();
        var childIds = new Set();
        function wouldCreateCycle(commentId, parentId) {
            var seen = new Set([commentId]);
            var currentId = parentId;
            while (currentId) {
                if (seen.has(currentId)) return true;
                seen.add(currentId);
                var parent = byId.get(currentId);
                currentId = parent ? (parent.replyToCommentId || "") : "";
            }
            return false;
        }
        comments.forEach(function (comment) {
            var parentId = comment.replyToCommentId;
            if (!parentId || !byId.has(parentId) || wouldCreateCycle(comment.id, parentId)) return;
            childIds.add(comment.id);
            var children = childrenByParent.get(parentId) || [];
            children.push(comment);
            childrenByParent.set(parentId, children);
        });
        var ordered = [];
        var visited = new Set();
        function collectDescendants(id, acc) {
            (childrenByParent.get(id) || []).forEach(function (child) {
                if (visited.has(child.id)) return;
                visited.add(child.id);
                acc.push(child);
                collectDescendants(child.id, acc);
            });
        }
        comments.forEach(function (comment) {
            if (childIds.has(comment.id) || visited.has(comment.id)) return;
            visited.add(comment.id);
            ordered.push(comment);
            var descendants = [];
            collectDescendants(comment.id, descendants);
            descendants.sort(function (a, b) { return (indexById.get(a.id) || 0) - (indexById.get(b.id) || 0); });
            ordered.push.apply(ordered, descendants);
        });
        comments.forEach(function (comment) {
            if (!visited.has(comment.id)) {
                visited.add(comment.id);
                ordered.push(comment);
            }
        });
        return ordered;
    }
    function collectCommentThreadIds(comments, rootId) {
        var ids = new Set([rootId]);
        var changed = true;
        while (changed) {
            changed = false;
            comments.forEach(function (comment) {
                if (comment.replyToCommentId && ids.has(comment.replyToCommentId) && !ids.has(comment.id)) {
                    ids.add(comment.id);
                    changed = true;
                }
            });
        }
        return ids;
    }
    function findAddedCharacterComment(before, after, character) {
        var beforeIds = new Set(before.comments.map(function (comment) { return comment.id; }));
        return after.comments.find(function (comment) {
            return !beforeIds.has(comment.id)
                && comment.authorType === "character"
                && comment.authorId === character.id;
        }) || null;
    }

    // ============================================================
    // 状态持久化
    // ============================================================
    function persist(next) {
        S.state = saveXiaohongshuState(next);
        return S.state;
    }
    function addFollowersToState(current, accounts, note) {
        var existing = new Set(current.socialGraph.followers.map(accountKey));
        var added = dedupeAccounts(accounts.filter(function (account) { return (account.name || "").trim(); }))
            .filter(function (account) { return !existing.has(accountKey(account)); })
            .map(function (account) {
                return Object.assign({}, account, { followedAt: account.followedAt || new Date().toISOString() });
            });
        if (added.length === 0) return { next: current, added: [] };
        var notifications = added.map(function (account) {
            return makeXiaohongshuNotification({
                type: "follow",
                noteId: note ? note.id : undefined,
                actorName: account.name,
                text: account.name + " 关注了你",
                thumbnailText: note ? note.title : undefined,
                unread: true
            });
        });
        return {
            added: added,
            next: Object.assign({}, current, {
                profile: Object.assign({}, current.profile, {
                    followerCount: current.socialGraph.followers.length + added.length
                }),
                socialGraph: Object.assign({}, current.socialGraph, {
                    followers: added.concat(current.socialGraph.followers)
                }),
                notifications: notifications.concat(current.notifications)
            })
        };
    }

    // ============================================================
    // 图片缓存（mie：dataURL 直接存于 note.imageDataUrl / 本地封面键）
    // ============================================================
    function ensureImages() {
        var keys = [];
        S.state.notes.forEach(function (note) {
            if (xhsHasNoteImage(note)) keys.push(noteImageKey(note));
        });
        var coverKey = S.state.profile.coverImageAssetId;
        if (coverKey) keys.push(coverKey);
        keys.forEach(function (key) {
            if (S.imageMap[key]) return;
            if (key === XHS_COVER_LOCAL_KEY) {
                var stored = loadCoverFromStorage();
                if (stored) { S.imageMap[key] = stored; scheduleRender(); }
                return;
            }
            var note = S.state.notes.find(function (item) { return noteImageKey(item) === key; });
            if (!note) return;
            resolveNoteImageDataUrl(note).then(function (dataUrl) {
                if (dataUrl && !S.imageMap[key]) {
                    S.imageMap[key] = dataUrl;
                    scheduleRender();
                }
            }).catch(function () { /* 忽略图片解析失败 */ });
        });
    }
    function loadCoverFromStorage() {
        try {
            return window.localStorage.getItem(XHS_COVER_STORAGE_KEY) || "";
        } catch (error) {
            return "";
        }
    }
    function saveCoverToStorage(dataUrl) {
        try {
            if (dataUrl) window.localStorage.setItem(XHS_COVER_STORAGE_KEY, dataUrl);
            else window.localStorage.removeItem(XHS_COVER_STORAGE_KEY);
        } catch (error) { /* 存储不可用时忽略 */ }
    }

    // ============================================================
    // 渲染：组件
    // ============================================================
    function renderNoteImageInner(note, options) {
        options = options || {};
        var dataUrl = S.imageMap[noteImageKey(note)] || "";
        if (note.type === "video") {
            if (dataUrl) {
                return '<div class="cp-xhs-cover cp-xhs-cover--video cp-xhs-cover--' + esc(note.tone) + '"' + videoImageFrameStyle() + '>'
                    + '<img src="' + esc(dataUrl) + '" alt="" class="xhs-video-real-image" /></div>';
            }
            var desc = note.videoDescription || note.imageDescription || "";
            return '<div class="cp-xhs-cover cp-xhs-cover--video cp-xhs-cover--' + esc(note.tone) + '"' + videoImageFrameStyle() + '><span>'
                + (desc ? bilingualHtml(desc, "light") : esc(note.coverIcon)) + '</span></div>';
        }
        if (dataUrl) {
            return '<div class="xhs-note-real-image-frame"' + getImageFrameStyleAttr(note.imageWidth, note.imageHeight) + '>'
                + '<img src="' + esc(dataUrl) + '" alt="" class="xhs-note-real-image" /></div>';
        }
        if (note.imageDescription && note.imageDescription.trim() && !options.hideTextImageDescription) {
            return '<div class="cp-xhs-cover cp-xhs-cover--' + esc(note.tone) + ' xhs-note-text-image"' + textImageFrameStyle() + '><span>'
                + bilingualHtml(note.imageDescription, "xiaohongshu") + '</span></div>';
        }
        return '<div class="cp-xhs-cover cp-xhs-cover--' + esc(note.tone) + '"' + iconImageFrameStyle(note) + '>'
            + '<span class="cp-xhs-cover-icon">' + esc(note.coverIcon) + '</span></div>';
    }
    function renderNoteCard(note, options) {
        options = options || {};
        var variant = getNoteCardVariant(note);
        return '<button type="button" class="cp-xhs-note-card cp-xhs-note-card--' + variant + '" data-action="open-note" data-note-id="' + esc(note.id) + '">'
            + renderNoteImageInner(note, options)
            + '<div class="cp-xhs-note-body">'
            + '<strong>' + bilingualHtml(note.title, "xiaohongshu") + '</strong>'
            + '<p>' + bilingualHtml(note.body, "xiaohongshu") + '</p>'
            + '<div class="cp-xhs-note-foot">'
            + '<div class="cp-xhs-note-author">'
            + avatarHtml("cp-xhs-note-author-avatar", getNoteAvatar(note), note.authorName)
            + '<span>' + esc(note.authorName) + '</span></div>'
            + '<em class="' + (note.liked ? "is-liked" : "") + '">' + icon("heart", 12, 2.4, note.liked) + formatCount(note.likeCount) + '</em>'
            + '</div></div></button>';
    }
    function renderWaterfall(columns, options) {
        options = options || {};
        if (columns[0].length + columns[1].length === 0) {
            return '<div class="cp-xhs-status"><p>暂无小红书内容</p>'
                + (options.showGenerateButton
                    ? '<button type="button" class="xhs-empty-generate-btn" data-action="empty-generate"' + (S.busy !== "idle" ? " disabled" : "") + '>'
                        + (S.busy === "npc-feed" || S.busy === "character-activity" ? "正在生成" : "生成小红书内容") + '</button>'
                    : "")
                + '</div>';
        }
        var renderColumn = function (notes) {
            return notes.map(function (note) {
                return renderNoteCard(note, {
                    hideTextImageDescription: options.hideCharacterTextImages
                        && note.source === "character" && note.type === "post"
                });
            }).join("");
        };
        return '<div class="cp-xhs-waterfall-grid">'
            + '<div class="cp-xhs-waterfall-column">' + renderColumn(columns[0]) + '</div>'
            + '<div class="cp-xhs-waterfall-column">' + renderColumn(columns[1]) + '</div>'
            + '</div>';
    }
    function renderCommentItem(comment, allComments) {
        var parentComment = comment.replyToCommentId
            ? allComments.find(function (item) { return item.id === comment.replyToCommentId; })
            : null;
        var targetName = parentComment
            ? parentComment.authorName
            : (!comment.replyToCommentId ? comment.replyTo : undefined);
        var depth = parentComment || (!comment.replyToCommentId && comment.replyTo) ? 1 : 0;
        return '<div class="cp-xhs-comment-card cp-xhs-comment-card--depth-' + depth + '">'
            + avatarHtml("cp-xhs-comment-avatar", getCommentAvatar(comment), comment.authorName)
            + '<div class="cp-xhs-comment-content">'
            + '<strong>' + esc(comment.authorName)
            + (targetName ? '<span class="cp-xhs-comment-reply-label">回复</span>' + esc(targetName) : "")
            + '</strong>'
            + '<p>' + bilingualHtml(comment.text, "xiaohongshu", "inline") + '</p>'
            + '<div class="xhs-comment-actions">'
            + '<div class="xhs-comment-text-actions">'
            + '<time class="xhs-comment-time" datetime="' + esc(comment.createdAt) + '">' + esc(formatTime(comment.createdAt)) + '</time>'
            + '<button type="button" data-action="comment-reply" data-comment-id="' + esc(comment.id) + '">回复</button>'
            + '<button type="button" data-action="comment-delete" data-comment-id="' + esc(comment.id) + '">删除</button>'
            + '</div>'
            + '<div class="xhs-comment-vote-actions">'
            + '<button type="button" class="xhs-comment-vote-btn ' + (comment.liked ? "is-active" : "") + '" data-action="comment-vote" data-vote="like" data-comment-id="' + esc(comment.id) + '" aria-label="点赞评论">'
            + icon("heart", 20, 2.15, comment.liked)
            + (comment.likeCount > 0 ? '<span>' + formatCount(comment.likeCount) + '</span>' : "")
            + '</button>'
            + '<button type="button" class="xhs-comment-vote-btn ' + (comment.disliked ? "is-active is-disliked" : "") + '" data-action="comment-vote" data-vote="dislike" data-comment-id="' + esc(comment.id) + '" aria-label="点踩评论">'
            + dislikeIcon()
            + (comment.dislikeCount > 0 ? '<span>' + formatCount(comment.dislikeCount) + '</span>' : "")
            + '</button>'
            + '</div></div></div></div>';
    }
    function renderCommentList(comments) {
        if (comments.length === 0) return '<div class="cp-xhs-mini-empty">还没有评论</div>';
        return orderCommentsForDisplay(comments)
            .map(function (comment) { return renderCommentItem(comment, comments); })
            .join("");
    }
    function renderLoadMoreButton(note) {
        return '<button type="button" class="xhs-load-comments-btn" data-action="load-more-comments" data-note-id="' + esc(note.id) + '"'
            + (S.busy !== "idle" ? " disabled" : "") + '>'
            + (S.busy === "more-comments" ? '<span class="cp-spin"></span>' : "")
            + (S.busy === "more-comments" ? "加载中" : "加载更多评论")
            + '</button>';
    }
    function renderReplyTargetBlock(extraClass) {
        if (!S.replyTarget) return "";
        return '<div class="xhs-reply-target' + (extraClass ? " " + extraClass : "") + '">'
            + '<span>回复 ' + esc(S.replyTarget.authorName) + '</span>'
            + '<button type="button" data-action="comment-clear-reply">取消</button></div>';
    }
    function renderCommentToolbar() {
        var mentionCharacters = followedMentionCharacters();
        return (S.commentMentionOpen
            ? '<div class="xhs-comment-mention-panel">'
                + (mentionCharacters.length > 0
                    ? mentionCharacters.map(function (item) {
                        return '<button type="button" data-action="mention-pick" data-name="' + esc(item.displayName) + '"' + (S.busy !== "idle" ? " disabled" : "") + '>'
                            + '<span>' + (item.avatar ? '<img src="' + esc(item.avatar) + '" alt="" />' : esc(item.displayName.slice(0, 1))) + '</span>'
                            + '<em>' + esc(item.displayName) + '</em></button>';
                    }).join("")
                    : '<span class="xhs-comment-panel-empty">暂无已关注角色</span>')
                + '</div>'
            : "")
            + (S.commentEmojiOpen
                ? '<div class="xhs-comment-emoji-panel">'
                    + XHS_DM_EMOJIS.map(function (emoji) {
                        return '<button type="button" data-action="emoji-pick" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
                    }).join("")
                    + '</div>'
                : "")
            + '<div class="xhs-comment-toolbar">'
            + '<div class="xhs-comment-toolbar-icons">'
            + '<button type="button" class="' + (S.commentMentionOpen ? "is-active" : "") + '" aria-label="@已关注角色" data-action="toolbar-panel" data-panel="mention"' + (S.busy !== "idle" ? " disabled" : "") + '>' + icon("at", 22, 2.05) + '</button>'
            + '<button type="button" class="' + (S.commentEmojiOpen ? "is-active" : "") + '" aria-label="选择表情" data-action="toolbar-panel" data-panel="emoji"' + (S.busy !== "idle" ? " disabled" : "") + '>' + icon("smile", 22, 2.05) + '</button>'
            + '</div>'
            + '<button type="button" class="xhs-comment-toolbar-send" data-action="comment-send"' + (S.busy !== "idle" || !S.commentDraft.trim() ? " disabled" : "") + '>'
            + (S.busy === "comment-reply" || S.busy === "mention-reply" ? '<span class="cp-spin"></span>' : "发送")
            + '</button>'
            + '</div>';
    }
    function renderNotificationThumbnail(notice) {
        var note = getNotificationNote(notice);
        var key = note ? noteImageKey(note) : "";
        if (note && key && S.imageMap[key]) {
            return '<img src="' + esc(S.imageMap[key]) + '" alt="" />';
        }
        return '<span>' + esc(getXhsPlainText(notice.thumbnailText || (note && note.title) || "笔记")) + '</span>';
    }
    function notificationActorLabel(notice) {
        if (notice.type === "like" || notice.type === "save") {
            var match = String(notice.text || "").match(/^(.+?)等\s*[0-9][\d.,，]*(?:\.\d+)?\s*(?:[kKwW万千])?\s*人/);
            return (match && match[1] && match[1].trim()) || notice.actorName;
        }
        return notice.actorName;
    }
    function formatNotificationAction(notice) {
        if (notice.type === "like") {
            var likeCount = notificationEngagementCount(notice);
            return likeCount > 1 ? "等" + formatCount(likeCount) + "人赞了你的笔记" : "赞了你的笔记";
        }
        if (notice.type === "save") {
            var saveCount = notificationEngagementCount(notice);
            return saveCount > 1 ? "等" + formatCount(saveCount) + "人收藏了你的笔记" : "收藏了你的笔记";
        }
        if (notice.type === "follow") return "关注了你";
        if (notice.type === "comment") return "评论了你的笔记";
        return notice.text;
    }
    function formatNotificationPreview(notice) {
        if (notice.type !== "comment") return "";
        var escapedName = String(notice.actorName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return String(notice.text || "")
            .replace(new RegExp("^" + escapedName + "\\s*(评论了你的笔记|回复了你)[:：]?\\s*"), "")
            .trim();
    }
    function overviewGlyph(type) {
        var paths = {
            heart: '<path d="M12 21.2c-.35 0-.7-.13-.98-.39C4.88 15.28 2 12.67 2 8.72 2 5.58 4.47 3.1 7.58 3.1c1.75 0 3.43.82 4.42 2.11.99-1.29 2.67-2.11 4.42-2.11C19.53 3.1 22 5.58 22 8.72c0 3.95-2.88 6.56-9.02 12.09-.28.26-.63.39-.98.39Z"/>',
            user: '<path d="M12 11.2a4.55 4.55 0 1 0 0-9.1 4.55 4.55 0 0 0 0 9.1ZM4.15 21.06c0-4.13 3.52-7.48 7.85-7.48s7.85 3.35 7.85 7.48c0 .54-.39.99-.92 1.07-2.12.31-4.43.47-6.93.47s-4.81-.16-6.93-.47a1.08 1.08 0 0 1-.92-1.07Z"/>',
            chat: '<path d="M12 3.15c5.54 0 10 3.82 10 8.55s-4.46 8.55-10 8.55c-1.11 0-2.18-.15-3.18-.44l-3.54 1.56a.75.75 0 0 1-1.02-.88l.9-3.3C3.22 15.69 2 13.56 2 11.7c0-4.73 4.46-8.55 10-8.55Z"/><circle cx="8.8" cy="11.45" r="1.18" fill="white"/><circle cx="15.2" cy="11.45" r="1.18" fill="white"/>'
        };
        return '<svg class="cp-xhs-overview-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (paths[type] || "") + '</svg>';
    }

    // ============================================================
    // 渲染：顶栏 / 底部导航 / 忙碌指示
    // ============================================================
    function renderAppbar() {
        var appbar = el("xhs-appbar");
        var titles = el("xhs-header-titles");
        var actions = el("xhs-appbar-actions");
        if (!appbar || !titles) return;
        var visible = S.selectedTab !== "profile" && !S.selectedNoteId && !S.selectedDmThreadId;
        appbar.style.display = visible ? "" : "none";
        if (!visible) return;
        var titlesHtml = "";
        if (isMessageSubpage()) {
            titlesHtml = '<div class="cp-xhs-header-title is-active">' + esc(selectedMessagePanelTitle()) + '</div>';
        } else if (S.selectedTab === "home") {
            titlesHtml = HOME_FEED_TABS.map(function (tab) {
                return '<button type="button" class="cp-xhs-header-title ' + (S.homeFeedTab === tab.id ? "is-active" : "") + '" data-action="home-feed-tab" data-tab="' + tab.id + '"'
                    + (S.homeFeedTab === tab.id ? ' aria-current="page"' : "") + '>' + esc(tab.label) + '</button>';
            }).join("");
        } else {
            var label = S.selectedTab === "video" ? "附近" : S.selectedTab === "messages" ? "消息" : "发布";
            titlesHtml = '<div class="cp-xhs-header-title is-active">' + esc(label) + '</div>';
        }
        titles.innerHTML = titlesHtml;
        if (actions) {
            if (isMessageSubpage()) {
                actions.style.display = "none";
            } else {
                actions.style.display = "";
                var refreshBtn = actions.querySelector('[data-action="feed-refresh"]');
                var clearBtn = actions.querySelector('[data-action="feed-clear"]');
                if (refreshBtn) refreshBtn.disabled = S.busy !== "idle";
                if (clearBtn) clearBtn.disabled = S.busy !== "idle" || S.state.notes.length === 0;
            }
        }
    }
    function renderTabbar() {
        var tabbar = el("xhs-tabbar");
        if (!tabbar) return;
        var visible = !S.selectedNoteId && !isMessageSubpage();
        tabbar.style.display = visible ? "" : "none";
        if (!visible) return;
        tabbar.innerHTML = TABS.map(function (tab) {
            if (tab.id === "publish") {
                return '<button type="button" class="cp-xhs-tab-publish" data-action="publish-open" aria-label="发布">'
                    + '<div class="cp-xhs-tab-publish-inner">' + icon("plus", 20, 3) + '</div></button>';
            }
            var active = S.selectedTab === tab.id;
            var badge = tab.id === "messages" && unreadCount() > 0
                ? '<span class="cp-xhs-tab-badge">' + esc(formatBadgeCount(unreadCount())) + '</span>'
                : "";
            return '<button type="button" class="cp-xhs-tab ' + (active ? "is-active" : "") + '" data-action="tab" data-tab="' + tab.id + '">'
                + '<div class="cp-xhs-tab-inner"><span>' + esc(tab.label) + '</span>' + badge + '</div></button>';
        }).join("");
    }
    function renderBusy() {
        var indicator = el("xhs-busy-indicator");
        var text = el("xhs-busy-text");
        if (!indicator || !text) return;
        if (S.busy === "idle") {
            indicator.style.display = "none";
            text.textContent = "";
            return;
        }
        var label = S.busy === "npc-feed" ? "正在生成帖子内容"
            : S.busy === "character-activity" ? "正在生成角色互动内容"
            : S.busy === "publish" ? "正在发布笔记"
            : S.busy === "comment-reply" || S.busy === "mention-reply" ? "正在生成回复内容"
            : S.busy === "dm-reply" ? "正在生成私信回复"
            : "正在生成互动内容";
        text.textContent = label;
        indicator.style.display = "";
    }

    // ============================================================
    // 渲染：视频详情（滑动层 / 说明文字测量）
    // ============================================================
    function renderVideoMovingLayer(note, styleAttr, preview) {
        var account = makeAccountFromNote(note);
        var following = isFollowingAccount(account);
        var showCaptionControls = !preview && note.id === (selectedNote() || {}).id;
        var dataUrl = S.imageMap[noteImageKey(note)] || "";
        var frameInner = "";
        if (dataUrl) {
            frameInner = '<img class="xhs-video-real-image" src="' + esc(dataUrl) + '" alt="" />';
        } else if ((note.videoDescription || "").trim() || (note.imageDescription || "").trim()) {
            frameInner = '<div class="cp-xhs-video-frame-text">'
                + bilingualHtml(note.videoDescription || note.imageDescription || "", "light") + '</div>';
        }
        return '<div class="cp-xhs-video-moving-layer' + (preview ? " cp-xhs-video-moving-layer--preview" : "") + '"' + (styleAttr || "") + '>'
            + '<main class="cp-xhs-video-stage">'
            + '<div class="cp-xhs-video-frame cp-xhs-cover--' + esc(note.tone) + '">' + frameInner + '</div>'
            + '<section class="cp-xhs-video-meta">'
            + '<div class="cp-xhs-video-author-row">'
            + avatarHtml("cp-xhs-video-author-avatar", getNoteAvatar(note), note.authorName)
            + '<strong>' + esc(note.authorName) + '</strong>'
            + (account
                ? '<button type="button" class="' + (following ? "is-following" : "") + '" data-action="video-follow" data-note-id="' + esc(note.id) + '">' + (following ? "已关注" : "关注") + '</button>'
                : "")
            + '<time>' + esc(formatTime(note.createdAt)) + '</time>'
            + '<button type="button" class="xhs-delete-note-btn xhs-video-delete-note-btn" data-action="delete-note" data-note-id="' + esc(note.id) + '" aria-label="删除帖子">'
            + icon("trash", 14, 2.1) + '删除</button>'
            + '</div>'
            + '<h3>' + bilingualHtml(note.title, "light") + '</h3>'
            + '<div class="cp-xhs-video-caption-wrap">'
            + (showCaptionControls ? '<div id="xhs-video-caption-measure" aria-hidden="true" class="cp-xhs-video-caption-measure"></div>' : "")
            + '<p class="' + (!S.videoCaptionExpanded || preview ? "is-collapsed" : "") + '">'
            + bilingualHtml(
                showCaptionControls && S.videoCaptionCanExpand && !S.videoCaptionExpanded
                    ? S.collapsedVideoCaption + "..."
                    : note.body,
                "light")
            + (showCaptionControls && S.videoCaptionCanExpand
                ? '  <button type="button" class="cp-xhs-video-caption-toggle" data-action="caption-toggle">' + (S.videoCaptionExpanded ? "收起" : "展开") + '</button>'
                : "")
            + '</p></div>'
            + (note.tags.length > 0
                ? '<div class="cp-xhs-video-tags">' + note.tags.map(function (tag) { return '<em>#' + esc(tag) + '</em>'; }).join("") + '</div>'
                : "")
            + '<div class="cp-xhs-video-progress" aria-hidden="true"></div>'
            + '</section></main></div>';
    }
    function videoStyleAttrs() {
        var height = (el("xhs-screen-video") || {}).clientHeight || window.innerHeight;
        var settling = S.videoDragSettling;
        if (S.videoDragDirection) {
            var offset = S.videoDragDirection === "next"
                ? "calc(" + S.videoDragOffset + "px + " + height + "px)"
                : "calc(" + S.videoDragOffset + "px - " + height + "px)";
            return ' style="transform:translate3d(0,' + offset + ',0);transition:' + (settling ? "transform 190ms cubic-bezier(0.2,0.82,0.2,1)" : "none") + ';will-change:transform;pointer-events:none"';
        }
        return ' style="transform:translate3d(0,' + S.videoDragOffset + 'px,0);transition:' + (settling ? "transform 190ms cubic-bezier(0.2,0.82,0.2,1)" : "none") + ';will-change:transform"';
    }
    function renderVideoDetail() {
        var container = el("xhs-screen-video");
        var note = selectedNote();
        if (!container || !note) return;
        var previewNote = S.videoDragDirection ? getSiblingVideo(S.videoDragDirection) : null;
        var html = '<header class="cp-xhs-video-detail-topbar">'
            + '<button type="button" data-action="video-back" aria-label="返回">' + icon("chevronLeft", 26, 2) + '</button>'
            + '<button type="button" aria-label="更多视频"><span class="cp-xhs-video-stack-icon" aria-hidden="true"></span></button>'
            + '<div class="cp-xhs-video-topbar-spacer"></div>'
            + '<button type="button" aria-label="搜索">' + icon("search", 22, 2.2) + '</button>'
            + '<button type="button" aria-label="分享" data-action="detail-share" data-note-id="' + esc(note.id) + '">' + icon("share", 23, 2) + '</button>'
            + '</header>';
        if (previewNote) html += renderVideoMovingLayer(previewNote, videoStyleAttrs(), true);
        html += renderVideoMovingLayer(note, videoStyleAttrs(), false);
        html += '<footer class="cp-xhs-video-actions xhs-video-actions">'
            + '<button type="button" class="cp-xhs-video-input xhs-video-input-button" data-action="video-comments-open">说点什么...</button>'
            + '<button type="button" class="cp-xhs-video-action ' + (note.liked ? "is-active" : "") + '" data-action="detail-like" data-note-id="' + esc(note.id) + '" aria-label="点赞">'
            + icon("heart", 24, 2.1, note.liked) + '<span>' + formatCount(note.likeCount) + '</span></button>'
            + '<button type="button" class="cp-xhs-video-action ' + (note.saved ? "is-active" : "") + '" data-action="detail-save" data-note-id="' + esc(note.id) + '" aria-label="收藏">'
            + icon("bookmark", 24, 2.1, note.saved) + '<span>' + formatCount(note.saveCount) + '</span></button>'
            + '<button type="button" class="cp-xhs-video-action" data-action="video-comments-open" aria-label="评论">'
            + icon("comment", 24, 2.1) + '<span>' + formatCount(note.commentCount) + '</span></button>'
            + '</footer>';
        if (S.videoCommentsOpen) {
            var expanded = commentComposerExpanded();
            html += '<div class="cp-xhs-video-comments-backdrop">'
                + '<section class="cp-xhs-video-comments-sheet xhs-video-comments-sheet">'
                + '<div class="cp-xhs-video-comments-handle" aria-hidden="true"></div>'
                + '<header><strong>评论 ' + formatCount(note.commentCount) + '</strong>'
                + '<button type="button" data-action="video-comments-close" aria-label="关闭评论">×</button></header>'
                + '<div class="cp-xhs-comment-list xhs-video-comment-list">'
                + renderCommentList(note.comments)
                + renderLoadMoreButton(note)
                + '</div>'
                + '<div class="xhs-video-comment-composer ' + (expanded ? "is-expanded" : "") + '">'
                + (S.replyTarget && S.replyTarget.noteId === note.id ? renderReplyTargetBlock("") : "")
                + '<div class="xhs-comment-input-row">'
                + '<textarea data-field="comment-draft" placeholder="' + (S.replyTarget ? "写回复" : "写评论") + '" rows="' + (expanded ? 3 : 1) + '">' + esc(S.commentDraft) + '</textarea>'
                + (!expanded
                    ? '<button type="button" data-action="comment-send"' + (S.busy !== "idle" || !S.commentDraft.trim() ? " disabled" : "") + '>'
                        + (S.busy === "comment-reply" || S.busy === "mention-reply" ? '<span class="cp-spin"></span>' : "") + '发送</button>'
                    : "")
                + '</div>'
                + (expanded ? renderCommentToolbar() : "")
                + '</div></section></div>';
        }
        container.innerHTML = html;
        if (!S.captionMeasured) scheduleCaptionMeasure();
    }
    function scheduleCaptionMeasure() {
        if (S.captionMeasureRaf) cancelAnimationFrame(S.captionMeasureRaf);
        S.captionMeasureRaf = requestAnimationFrame(function () {
            S.captionMeasureRaf = null;
            measureVideoCaption();
        });
    }
    function measureVideoCaption() {
        var note = selectedNote();
        if (!note || note.type !== "video") return;
        var caption = note.body;
        S.captionMeasured = true;
        if (!caption) {
            S.videoCaptionCanExpand = false;
            S.collapsedVideoCaption = "";
            return;
        }
        if (S.videoCaptionExpanded) return;
        var measure = el("xhs-video-caption-measure");
        if (!measure) return;
        var computedStyle = window.getComputedStyle(measure);
        var lineHeight = Number.parseFloat(computedStyle.lineHeight) || 19.6;
        var maxHeight = lineHeight * 3 + 1;
        measure.textContent = caption;
        if (measure.scrollHeight <= maxHeight) {
            S.videoCaptionCanExpand = false;
            S.collapsedVideoCaption = caption;
            return;
        }
        var left = 0, right = caption.length, best = "";
        while (left <= right) {
            var middle = Math.floor((left + right) / 2);
            var candidate = caption.slice(0, middle).replace(/\s+$/, "");
            measure.textContent = candidate + "...  展开";
            if (measure.scrollHeight <= maxHeight) {
                best = candidate;
                left = middle + 1;
            } else {
                right = middle - 1;
            }
        }
        S.videoCaptionCanExpand = true;
        S.collapsedVideoCaption = best.slice(0, Math.max(0, best.length - 1)).replace(/\s+$/, "");
        renderVideoDetail();
    }

    // ============================================================
    // 渲染：笔记详情页
    // ============================================================
    function renderDetailPage() {
        var container = el("xhs-screen-detail");
        var note = selectedNote();
        if (!container || !note) return;
        var account = makeAccountFromNote(note);
        var following = isFollowingAccount(account);
        var expanded = commentComposerExpanded();
        var html = '<div class="cp-xhs-note-detail-header">'
            + '<button type="button" class="cp-xhs-detail-back" data-action="detail-back" aria-label="返回">' + icon("chevronLeft", 24, 2.1) + '</button>'
            + '<div class="cp-xhs-detail-author-info">'
            + avatarHtml("cp-xhs-detail-avatar", getNoteAvatar(note), note.authorName)
            + '<span class="cp-xhs-detail-name">' + esc(note.authorName) + '</span></div>'
            + (account
                ? '<button type="button" class="cp-xhs-detail-follow ' + (following ? "is-following" : "") + '" data-action="detail-follow" data-note-id="' + esc(note.id) + '">'
                    + (following ? "已关注" : "关注") + '</button>'
                : "")
            + '<button type="button" class="cp-xhs-detail-share" aria-label="分享" data-action="detail-share" data-note-id="' + esc(note.id) + '">' + icon("share", 25, 2) + '</button>'
            + '</div>'
            + '<article class="cp-xhs-note-detail xhs-note-detail-page">'
            + '<div class="xhs-note-detail-media">' + renderNoteImageInner(note, {}) + '</div>'
            + '<div class="cp-xhs-note-detail-card">'
            + '<h3>' + bilingualHtml(note.title, "xiaohongshu") + '</h3>'
            + '<p class="cp-xhs-note-detail-body">' + bilingualHtml(note.body, "xiaohongshu") + '</p>'
            + (note.tags.length
                ? '<div class="cp-xhs-note-detail-tags">' + note.tags.map(function (tag) { return '<em>#' + esc(tag) + '</em>'; }).join("") + '</div>'
                : "")
            + '<div class="xhs-note-detail-meta-row">'
            + '<div class="cp-xhs-note-detail-time">' + esc(formatTime(note.createdAt)) + '</div>'
            + '<button type="button" class="xhs-delete-note-btn" data-action="delete-note" data-note-id="' + esc(note.id) + '" aria-label="删除帖子">'
            + icon("trash", 14, 2.1) + '删除</button>'
            + '</div></div>'
            + '<div class="cp-xhs-comment-section xhs-detail-comment-section">'
            + '<div class="cp-xhs-comment-count">共 ' + formatCount(note.commentCount) + ' 条评论</div>'
            + '<div class="cp-xhs-comment-list">'
            + renderCommentList(note.comments)
            + renderLoadMoreButton(note)
            + '</div></div></article>'
            + '<div class="cp-xhs-detail-bottom-bar xhs-detail-bottom-bar ' + (expanded ? "is-expanded" : "") + '">'
            + '<div class="xhs-detail-comment-stack">'
            + (S.replyTarget && S.replyTarget.noteId === note.id ? renderReplyTargetBlock("xhs-detail-reply-target") : "")
            + '<div class="cp-xhs-input-box xhs-detail-input-box">'
            + icon("pencil", 16, 2)
            + '<textarea data-field="comment-draft" placeholder="' + (S.replyTarget ? "写回复" : "说点什么...") + '" rows="' + (expanded ? 3 : 1) + '">' + esc(S.commentDraft) + '</textarea>'
            + '</div>'
            + (expanded ? renderCommentToolbar() : "")
            + '</div>'
            + (!expanded && S.commentDraft.trim()
                ? '<button type="button" class="xhs-detail-send-btn" data-action="comment-send"' + (S.busy !== "idle" ? " disabled" : "") + '>'
                    + (S.busy === "comment-reply" || S.busy === "mention-reply" ? '<span class="cp-spin"></span>' : "发送") + '</button>'
                : "")
            + (!expanded
                ? '<div class="cp-xhs-action-icons">'
                    + '<button type="button" class="cp-xhs-action-btn ' + (note.liked ? "is-liked" : "") + '" data-action="detail-like" data-note-id="' + esc(note.id) + '" aria-label="点赞">'
                    + icon("heart", 24, 1.72, note.liked) + '<span>' + formatCount(note.likeCount) + '</span></button>'
                    + '<button type="button" class="cp-xhs-action-btn ' + (note.saved ? "is-saved" : "") + '" data-action="detail-save" data-note-id="' + esc(note.id) + '" aria-label="收藏">'
                    + icon("bookmark", 24, 1.72, note.saved) + '<span>' + formatCount(note.saveCount) + '</span></button>'
                    + '<button type="button" class="cp-xhs-action-btn" aria-label="评论">'
                    + icon("comment", 24, 1.72) + '<span>' + formatCount(note.commentCount) + '</span></button>'
                    + '</div>'
                : "")
            + '</div>';
        container.innerHTML = html;
    }

    // ============================================================
    // 渲染：消息面板 / 私信
    // ============================================================
    function renderMessagesPane() {
        var pane = el("xhs-pane-messages");
        if (!pane) return;
        pane.className = "cp-xhs-panel cp-xhs-message-page " + (S.messagePanel ? "xhs-message-detail-page" : "xhs-message-page");
        if (S.messagePanel) {
            var notifications = selectedMessageNotifications();
            var label = selectedMessagePanelLabel();
            pane.innerHTML = '<div class="xhs-message-detail-list">'
                + (notifications.length === 0
                    ? '<div class="cp-xhs-mini-empty">暂无' + esc(label) + '通知</div>'
                    : notifications.map(function (notice, index) {
                        return '<button type="button" class="xhs-message-detail-card"'
                            + (notice.noteId ? ' data-action="open-note" data-note-id="' + esc(notice.noteId) + '"' : "") + '>'
                            + avatarHtml("xhs-message-detail-avatar cp-xhs-thread-avatar--tone-" + ((index % 6) + 1), getNotificationAvatar(notice.actorName, notice.id), notice.actorName)
                            + '<div class="xhs-message-detail-copy"><div>'
                            + '<strong>' + esc(notificationActorLabel(notice)) + '</strong>'
                            + (notice.type === "follow" ? "<em>你的粉丝</em>" : "")
                            + '</div><span>' + esc(formatNotificationAction(notice)) + ' <time>' + esc(formatTime(notice.createdAt)) + '</time></span>'
                            + (notice.type === "comment"
                                ? '<p>' + bilingualHtml(formatNotificationPreview(notice), "xiaohongshu", "inline") + '</p>'
                                : "")
                            + '</div>'
                            + '<div class="xhs-message-detail-thumb">' + renderNotificationThumbnail(notice) + '</div>'
                            + '</button>';
                    }).join(""))
                + '</div>';
            return;
        }
        var panels = [
            { id: "engagement", label: "点赞和收藏", count: engagementUnreadCount(), tone: "heart", glyph: "heart" },
            { id: "follow", label: "新增关注", count: followUnreadCount(), tone: "follow", glyph: "user" },
            { id: "comment", label: "评论", count: commentUnreadCount(), tone: "chat", glyph: "chat" }
        ];
        var userGlyph = '<path d="M12 11.2a4.55 4.55 0 1 0 0-9.1 4.55 4.55 0 0 0 0 9.1ZM4.15 21.06c0-4.13 3.52-7.48 7.85-7.48s7.85 3.35 7.85 7.48c0 .54-.39.99-.92 1.07-2.12.31-4.43.47-6.93.47s-4.81-.16-6.93-.47a1.08 1.08 0 0 1-.92-1.07Z"/>';
        var overview = panels.map(function (panel) {
            return '<button type="button" class="cp-xhs-overview-card" data-action="overview-open" data-panel="' + panel.id + '">'
                + '<div class="cp-xhs-overview-icon-wrapper">'
                + '<div class="cp-xhs-overview-icon cp-xhs-overview-icon--' + panel.tone + '">'
                + overviewGlyph(panel.glyph) + '</div>'
                + (panel.count > 0 ? '<span class="cp-xhs-overview-badge">' + esc(formatBadgeCount(panel.count)) + '</span>' : "")
                + '</div><span>' + esc(panel.label) + '</span></button>';
        }).join("");
        var threads = dmThreads();
        var threadList = threads.length === 0
            ? '<div class="cp-xhs-mini-empty">暂无私信</div>'
            : threads.map(function (thread, index) {
                return '<button type="button" class="cp-xhs-thread-card" data-action="dm-open" data-thread-id="' + esc(thread.id) + '">'
                    + avatarHtml("cp-xhs-thread-avatar cp-xhs-thread-avatar--tone-" + ((index % 6) + 1), getNotificationAvatar(thread.actorName, thread.id), thread.actorName)
                    + '<div class="cp-xhs-thread-meta">'
                    + '<div class="cp-xhs-thread-text">'
                    + '<span class="cp-xhs-thread-name">' + esc(thread.actorName) + '</span>'
                    + '<span class="cp-xhs-thread-preview">' + esc(getXhsPlainText(thread.latest.text)) + '</span>'
                    + '</div>'
                    + '<div class="cp-xhs-thread-status">'
                    + '<time class="cp-xhs-thread-time">' + esc(formatTime(thread.latest.createdAt)) + '</time>'
                    + (thread.unreadCount > 0
                        ? '<span class="cp-xhs-thread-unread-badge">' + esc(formatBadgeCount(thread.unreadCount)) + '</span>'
                        : '<span class="cp-xhs-thread-spacer"></span>')
                    + '</div></div></button>';
            }).join("");
        pane.innerHTML = '<div class="cp-xhs-message-overview">' + overview + '</div>'
            + '<div class="xhs-message-section-title"><strong>私信</strong>'
            + (threads.length > 0 ? '<span>' + threads.length + ' 个对话</span>' : "")
            + '</div>'
            + '<div class="cp-xhs-thread-list">' + threadList + '</div>';
    }
    function renderDmThread() {
        var container = el("xhs-screen-dm");
        var thread = selectedDmThread();
        if (!container || !thread) return;
        var messagesHtml = thread.notifications.map(function (notice, index) {
            var previous = thread.notifications[index - 1];
            var showTime = !previous || formatTime(previous.createdAt) !== formatTime(notice.createdAt);
            var outgoing = notice.direction === "outgoing";
            return '<div class="cp-xhs-chat-message-block">'
                + (showTime ? '<time class="cp-xhs-chat-time">' + esc(formatTime(notice.createdAt)) + '</time>' : "")
                + '<div class="cp-xhs-chat-row ' + (outgoing ? "is-outgoing" : "is-incoming") + '">'
                + (!outgoing ? avatarHtml("cp-xhs-chat-avatar", getNotificationAvatar(notice.actorName, notice.id), notice.actorName) : "")
                + '<div class="cp-xhs-chat-content"><p>' + bilingualHtml(notice.text, "xiaohongshu", "inline") + '</p></div>'
                + (outgoing ? avatarHtml("cp-xhs-chat-avatar cp-xhs-chat-avatar--me", userAvatar(), S.state.profile.nickname) : "")
                + '</div></div>';
        }).join("");
        var html = '<header class="cp-xhs-thread-appbar">'
            + '<button type="button" class="cp-xhs-thread-nav-button" data-action="dm-back" aria-label="返回消息">' + icon("chevronLeft", 26, 2.4) + '</button>'
            + '<div class="cp-xhs-thread-title-block">'
            + avatarHtml("cp-xhs-thread-avatar cp-xhs-thread-avatar--header", getNotificationAvatar(thread.actorName, thread.id), thread.actorName)
            + '<strong>' + esc(thread.actorName) + '</strong></div>'
            + '<button type="button" class="cp-xhs-thread-nav-button" aria-label="更多">' + icon("more", 27, 2.4) + '</button>'
            + '</header>'
            + '<div class="cp-xhs-thread-messages"><div class="cp-xhs-chat-stack">' + messagesHtml + '</div></div>'
            + '<div class="cp-xhs-thread-composer">'
            + (S.dmEmojiOpen
                ? '<div class="xhs-dm-emoji-panel">'
                    + XHS_DM_EMOJIS.map(function (emoji) {
                        return '<button type="button" data-action="dm-emoji" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
                    }).join("")
                    + '</div>'
                : "")
            + '<div class="cp-xhs-thread-inputbar">'
            + '<button type="button" aria-label="表情" class="' + (S.dmEmojiOpen ? "is-active" : "") + '" data-action="dm-emoji-toggle">' + icon("smile", 24, 1.8) + '</button>'
            + '<input class="cp-xhs-thread-input-field" data-field="dm-draft" value="' + esc(S.dmDraft) + '" placeholder="发消息..." />'
            + '<button type="button" class="xhs-dm-generate-btn" aria-label="生成回复"' + (S.busy !== "idle" ? " disabled" : "") + ' data-action="dm-generate">'
            + (S.busy === "dm-reply" ? '<span class="cp-spin"></span>' : icon("sparkles", 22, 1.8)) + '</button>'
            + '<button type="button" aria-label="发送"' + (S.busy !== "idle" || !S.dmDraft.trim() ? " disabled" : "") + ' data-action="dm-send">'
            + icon("send", 22, 1.8) + '</button>'
            + '</div></div>';
        container.innerHTML = html;
        var stack = container.querySelector(".cp-xhs-thread-messages");
        if (stack) stack.scrollTop = stack.scrollHeight;
    }

    // ============================================================
    // 渲染：主页 / 附近 / 我的主页
    // ============================================================
    function renderHomePane() {
        var pane = el("xhs-pane-home");
        if (!pane) return;
        pane.innerHTML = renderWaterfall(splitColumns(activeHomeNotes()), { showGenerateButton: true, hideCharacterTextImages: true });
    }
    function renderVideoPane() {
        var pane = el("xhs-pane-video");
        if (!pane) return;
        pane.innerHTML = renderWaterfall(splitColumns(nearbyNotes()), { showGenerateButton: true });
    }
    function renderProfilePane() {
        var pane = el("xhs-pane-profile");
        if (!pane) return;
        var profile = S.state.profile;
        var stats = profileStats();
        var coverImage = profileCoverImage();
        var coverStyle = coverImage
            ? ' style="background-image:linear-gradient(180deg, rgba(0,0,0,0.34), rgba(0,0,0,0.54)), url(' + esc(coverImage) + ')"'
            : "";
        var html = '<div class="cp-xhs-profile-topbar ' + (S.profileTopbarVisible ? "is-visible" : "") + '">'
            + '<button type="button" class="back-btn" data-target="home-screen" aria-label="返回桌面">' + icon("chevronLeft", 24, 2.4) + '</button>'
            + '<div><button type="button" data-action="settings-open" aria-label="设置">' + icon("more", 22, 1.5) + '</button></div>'
            + '</div>'
            + '<div class="cp-xhs-profile-hero">'
            + '<button type="button" class="cp-xhs-profile-cover"' + coverStyle + ' aria-label="更换主页背景图" data-action="cover-change"></button>'
            + '<div class="cp-xhs-profile-main">'
            + '<div class="cp-xhs-profile-avatar-wrap">'
            + avatarHtml("cp-xhs-profile-avatar", userAvatar(), profile.nickname)
            + '</div>'
            + '<div class="cp-xhs-profile-meta">'
            + '<h3>' + esc(profile.nickname) + icon("chevronDown", 16, 2.3) + '</h3>'
            + '<span>小红书号：' + esc(profile.handle) + '</span>'
            + '<span>IP 属地：' + esc(profile.ipLocation) + '</span>'
            + '</div></div>'
            + '<div class="cp-xhs-profile-bio">'
            + '<p>' + esc(profile.signature) + '</p>'
            + '<em class="' + getGenderClassName(profile.gender) + '">' + esc(profile.gender || "♀") + '</em>'
            + '</div>'
            + '<div class="cp-xhs-profile-actions">'
            + '<div class="cp-xhs-profile-stats">'
            + '<div><strong>' + formatCount(stats.followingCount) + '</strong><span>关注</span></div>'
            + '<div><strong>' + formatCount(stats.followerCount) + '</strong><span>粉丝</span></div>'
            + '<div><strong>' + formatCount(stats.likedAndSavedCount) + '</strong><span>获赞与收藏</span></div>'
            + '</div>'
            + '<button type="button" class="cp-xhs-profile-edit" data-action="profile-edit-open">编辑资料</button>'
            + '<button type="button" class="cp-xhs-profile-settings" aria-label="Profile settings" data-action="settings-open">' + icon("more", 22, 1.5) + '</button>'
            + '</div>'
            + '<div class="cp-xhs-profile-tools">'
            + '<div><strong>创作灵感</strong><span>学创作找灵感</span></div>'
            + '<div><strong>RED 创作大赛</strong><span>为新生代好作品助力</span></div>'
            + '<div><strong>浏览记录</strong><span>看过的笔记</span></div>'
            + '</div></div>'
            + '<div class="cp-xhs-profile-content">'
            + '<div class="cp-xhs-profile-tabs">'
            + PROFILE_TABS.map(function (tab) {
                return '<button type="button" class="' + (S.profileTab === tab.id ? "is-active" : "") + '" data-action="profile-tab" data-tab="' + tab.id + '">' + esc(tab.label) + '</button>';
            }).join("")
            + icon("search", 20, 1.55)
            + '</div>'
            + renderWaterfall(splitColumns(profileNotes()), {})
            + '</div>';
        pane.innerHTML = html;
    }

    // ============================================================
    // 渲染：弹层（发布 / 设置 / 编辑资料 / 确认）
    // ============================================================
    function renderPublishSheet() {
        var sheet = el("xhs-publish-sheet");
        if (!sheet) return;
        var image = S.draft.image || {};
        var left = "";
        if (image.dataUrl === undefined && image.description === undefined) {
            left = '<div class="xhs-image-upload-area"><div class="xhs-publish-placeholder">'
                + icon("imagePlus", 42, 1.5)
                + '<div class="xhs-placeholder-actions">'
                + '<button type="button" data-action="publish-pick-image">上传图片</button>'
                + '<button type="button" data-action="publish-image-desc">描述图片</button>'
                + '</div></div></div>';
        } else if (image.dataUrl) {
            left = '<div class="xhs-image-upload-area is-image-preview"' + getImageFrameStyleAttr(image.width, image.height) + ' data-action="publish-pick-image">'
                + '<img src="' + esc(image.dataUrl) + '" alt="Preview" class="xhs-publish-preview-img" /></div>'
                + '<button type="button" class="xhs-upload-change-btn" data-action="publish-cancel-image">取消并重新选择</button>';
        } else {
            left = '<div class="xhs-image-upload-area is-text-mode"><div class="xhs-text-image-preview">'
                + esc(image.description && image.description.trim() ? image.description : "在此区域下方输入描述\n即可生成文字图片")
                + '</div></div>'
                + '<div class="xhs-publish-field"><label>文字图片内容</label>'
                + '<textarea data-field="draft-image-desc" placeholder="输入文字描述...">' + esc(image.description || "") + '</textarea></div>'
                + '<button type="button" class="xhs-upload-change-btn" data-action="publish-cancel-image">取消并重新选择</button>';
        }
        var canSubmit = S.busy === "idle" && (S.draft.title.trim() || S.draft.body.trim());
        sheet.innerHTML = '<header><strong>发布新笔记</strong>'
            + '<button type="button" class="xhs-sheet-close-btn" data-action="publish-close" aria-label="关闭">×</button></header>'
            + '<div class="xhs-publish-content">'
            + '<div class="xhs-publish-left">' + left + '</div>'
            + '<div class="xhs-publish-right">'
            + '<input class="xhs-publish-title-input" data-field="draft-title" placeholder="填写标题会有更多赞哦~" value="' + esc(S.draft.title) + '" />'
            + '<textarea class="xhs-publish-body-input" data-field="draft-body" placeholder="添加正文，和大家分享你的见闻...">' + esc(S.draft.body) + '</textarea>'
            + '<div class="xhs-publish-tag-input"><span>#</span>'
            + '<input data-field="draft-tags" value="' + esc(S.tagInput) + '" placeholder="添加标签，用空格或逗号分隔" /></div>'
            + '<div class="xhs-publish-actions">'
            + '<button type="button" class="xhs-publish-submit-btn" data-action="publish-submit"' + (canSubmit ? "" : " disabled") + '>'
            + (S.busy === "publish" ? '<span class="cp-spin"></span>' : icon("send", 18, 2))
            + '发布笔记</button>'
            + '</div></div></div>';
    }
    function renderSettingsSheet() {
        var sheet = el("xhs-settings-sheet");
        if (!sheet) return;
        var draft = S.settingsDraft;
        if (!draft) { sheet.innerHTML = ""; return; }
        var prompts = [
            { key: "npcIdentityGuardPrompt", label: "NPC身份保护", value: draft.npcIdentityGuardPrompt != null ? draft.npcIdentityGuardPrompt : DEFAULT_XIAOHONGSHU_SETTINGS.npcIdentityGuardPrompt },
            { key: "npcFeedPrompt", label: "帖子生成", value: draft.npcFeedPrompt },
            { key: "npcUserPostReactionPrompt", label: "评论用户帖子", value: draft.npcUserPostReactionPrompt },
            { key: "npcCommentReplyPrompt", label: "回复用户评论", value: draft.npcCommentReplyPrompt },
            { key: "npcMoreCommentsPrompt", label: "加载更多评论", value: draft.npcMoreCommentsPrompt != null ? draft.npcMoreCommentsPrompt : "" },
            { key: "npcDmReplyPrompt", label: "回复私信", value: draft.npcDmReplyPrompt != null ? draft.npcDmReplyPrompt : "" },
            { key: "bilingualTranslationPrompt", label: "双语翻译", value: draft.bilingualTranslationPrompt || DEFAULT_XIAOHONGSHU_SETTINGS.bilingualTranslationPrompt }
        ];
        var toggleRow = function (title, sub, checked, key) {
            return '<div class="xhs-settings-toggle-row"><div><strong>' + title + '</strong><span>' + sub + '</span></div>'
                + '<button type="button" class="xhs-toggle ' + (checked ? "is-checked" : "") + '" data-action="settings-toggle" data-key="' + key + '" aria-label="' + title + '"></button></div>';
        };
        var participants = S.characters.length === 0
            ? '<span class="xhs-settings-edit-participants-empty">暂无角色</span>'
            : S.characters.map(function (character) {
                var selected = draft.participantCharacterIds.indexOf(character.id) >= 0;
                return '<button type="button" class="' + (selected ? "is-selected" : "") + '" data-action="settings-participant" data-id="' + esc(character.id) + '">'
                    + '<span>' + (character.avatar ? '<img src="' + esc(character.avatar) + '" alt="" />' : esc((character.name || "?").slice(0, 1))) + '</span>'
                    + '<em>' + esc(character.name) + '</em></button>';
            }).join("");
        sheet.innerHTML = '<header class="xhs-profile-edit-header"><strong>小红书设置</strong>'
            + '<button type="button" class="xhs-sheet-close-btn" data-action="settings-close" aria-label="关闭">×</button></header>'
            + '<div class="xhs-profile-edit-body">'
            + '<div class="xhs-profile-edit-field">'
            + '<span class="xhs-profile-edit-section-title">INTERACTION <em>角色互动概率</em></span>'
            + '<input class="xhs-profile-edit-pill" type="number" min="0" max="100" data-field="settings-probability" value="' + esc(draft.sendToCharacterProbability) + '" placeholder="发给角色的概率 (0–100)" />'
            + '</div>'
            + '<div class="xhs-profile-edit-field">'
            + '<span class="xhs-profile-edit-section-title">TRANSLATION <em>双语翻译</em></span>'
            + '<div class="xhs-settings-toggle-list">'
            + toggleRow("双语翻译", "角色内容", draft.bilingualTranslationEnabled !== false, "bilingualTranslationEnabled")
            + toggleRow("折叠翻译", "默认收起", draft.collapseBilingualTranslation !== false, "collapseBilingualTranslation")
            + '</div></div>'
            + '<div class="xhs-profile-edit-field">'
            + '<span class="xhs-profile-edit-section-title">PARTICIPANTS <em>参与角色</em></span>'
            + '<div class="xhs-settings-edit-participants">' + participants + '</div></div>'
            + '<div class="xhs-profile-edit-field">'
            + '<span class="xhs-profile-edit-section-title">PROMPTS <em>提示词</em></span>'
            + prompts.map(function (prompt) {
                var isOpen = Boolean(S.expandedPrompts[prompt.key]);
                return '<div class="xhs-settings-edit-prompt' + (isOpen ? " is-open" : "") + '">'
                    + '<button type="button" class="xhs-settings-edit-prompt-head" data-action="settings-prompt-toggle" data-key="' + prompt.key + '">'
                    + '<span>' + esc(prompt.label) + '</span>' + icon("chevronDown", 15, 2) + '</button>'
                    + (isOpen ? '<textarea class="xhs-profile-edit-pill xhs-settings-edit-prompt-textarea" data-prompt-key="' + prompt.key + '">' + esc(prompt.value) + '</textarea>' : "")
                    + '</div>';
            }).join("")
            + '</div></div>'
            + '<footer class="xhs-profile-edit-footer">'
            + '<button type="button" class="xhs-profile-edit-footer-cancel" data-action="settings-reset">恢复默认</button>'
            + '<button type="button" class="xhs-profile-edit-footer-save" data-action="settings-save">保存设置</button>'
            + '</footer>';
    }
    function renderProfileSheet() {
        var sheet = el("xhs-profile-sheet");
        if (!sheet) return;
        var draft = S.profileDraft;
        if (!draft) { sheet.innerHTML = ""; return; }
        var genderActive = function (pattern) { return pattern.test(draft.gender || "") ? "is-active" : ""; };
        sheet.innerHTML = '<header class="xhs-profile-edit-header"><strong>编辑资料</strong>'
            + '<button type="button" class="xhs-sheet-close-btn" data-action="profile-close" aria-label="关闭">×</button></header>'
            + '<div class="xhs-profile-edit-body">'
            + '<div class="xhs-profile-edit-row-2">'
            + '<div class="xhs-profile-edit-field"><span class="xhs-profile-edit-section-title">NICKNAME <em>昵称</em></span>'
            + '<input class="xhs-profile-edit-pill" data-field="profile-nickname" value="' + esc(draft.nickname) + '" placeholder="给自己起个名字" /></div>'
            + '<div class="xhs-profile-edit-field"><span class="xhs-profile-edit-section-title">ID <em>小红书号</em></span>'
            + '<input class="xhs-profile-edit-pill" data-field="profile-handle" value="' + esc(draft.handle) + '" placeholder="未设置" /></div>'
            + '</div>'
            + '<div class="xhs-profile-edit-row-2">'
            + '<div class="xhs-profile-edit-field"><span class="xhs-profile-edit-section-title">GENDER <em>性别</em></span>'
            + '<div class="xhs-profile-edit-gender">'
            + '<button type="button" class="' + genderActive(/女|♀|female/i) + '" data-action="profile-gender" data-gender="♀" aria-label="女">♀</button>'
            + '<button type="button" class="' + genderActive(/男|♂|male/i) + '" data-action="profile-gender" data-gender="♂" aria-label="男">♂</button>'
            + '</div></div>'
            + '<div class="xhs-profile-edit-field"><span class="xhs-profile-edit-section-title">IP LOCATION <em>属地</em></span>'
            + '<input class="xhs-profile-edit-pill" data-field="profile-ip" value="' + esc(draft.ipLocation) + '" placeholder="北京" /></div>'
            + '</div>'
            + '<div class="xhs-profile-edit-field"><span class="xhs-profile-edit-section-title">SIGNATURE <em>签名</em></span>'
            + '<textarea class="xhs-profile-edit-pill xhs-profile-edit-bio" data-field="profile-signature" placeholder="说点什么...">' + esc(draft.signature) + '</textarea></div>'
            + '</div>'
            + '<footer class="xhs-profile-edit-footer">'
            + '<button type="button" class="xhs-profile-edit-footer-cancel" data-action="profile-close">关闭</button>'
            + '<button type="button" class="xhs-profile-edit-footer-save" data-action="profile-save">保存</button>'
            + '</footer>';
    }
    function renderConfirmSheet() {
        var sheet = el("xhs-confirm-sheet");
        if (!sheet) return;
        var html = "";
        if (S.deleteTarget) {
            var isNote = S.deleteTarget.type === "note";
            html = '<header><strong>' + (isNote ? "删除这篇笔记？" : "删除这条评论？") + '</strong>'
                + '<button type="button" class="xhs-sheet-close-btn" data-action="confirm-close" aria-label="关闭">×</button></header>'
                + '<p>' + (isNote
                    ? '将删除《' + esc(S.deleteTarget.title) + '》，相关评论、消息和短期记忆事件也会一并清理。'
                    : '将删除 ' + esc(S.deleteTarget.comment.authorName) + ' 在《' + esc(S.deleteTarget.noteTitle) + '》下的评论，相关短期记忆事件也会一并清理。')
                + '</p>'
                + (!isNote ? '<blockquote>' + esc(S.deleteTarget.comment.text) + '</blockquote>' : "")
                + '<div class="xhs-confirm-actions">'
                + '<button type="button" data-action="confirm-close">取消</button>'
                + '<button type="button" class="xhs-confirm-delete-btn" data-action="confirm-delete">确认删除</button>'
                + '</div>';
        } else if (S.pendingFeedAction) {
            var isRefresh = S.pendingFeedAction === "refresh";
            html = '<header><strong>' + (isRefresh ? "新增一批小红书内容？" : "清空首页、附近和视频内容？") + '</strong>'
                + '<button type="button" class="xhs-sheet-close-btn" data-action="confirm-close" aria-label="关闭">×</button></header>'
                + '<p>' + (isRefresh
                    ? "将生成一批新的首页与视频内容，已有内容会保留，旧内容不会回传给本次生成链路。"
                    : "将清空首页推荐、附近和视频页当前可见内容；消息、私信、用户主页和互动记录会保留。")
                + '</p>'
                + '<div class="xhs-confirm-actions">'
                + '<button type="button" data-action="confirm-close">取消</button>'
                + '<button type="button" class="' + (isRefresh ? "xhs-confirm-primary-btn" : "xhs-confirm-delete-btn") + '" data-action="confirm-feed">'
                + (isRefresh ? "确认新增" : "确认清空") + '</button>'
                + '</div>';
        }
        sheet.innerHTML = html;
    }
    function renderModals() {
        var publishModal = el("xhs-modal-publish");
        if (publishModal) publishModal.style.display = S.composeOpen ? "" : "none";
        var settingsModal = el("xhs-modal-settings");
        if (settingsModal) settingsModal.style.display = S.settingsOpen ? "" : "none";
        var profileModal = el("xhs-modal-profile");
        if (profileModal) profileModal.style.display = S.profileOpen ? "" : "none";
        var confirmModal = el("xhs-modal-confirm");
        if (confirmModal) confirmModal.style.display = (S.deleteTarget || S.pendingFeedAction) ? "" : "none";
        if (S.composeOpen) renderPublishSheet();
        if (S.settingsOpen) renderSettingsSheet();
        if (S.profileOpen) renderProfileSheet();
        renderConfirmSheet();
    }

    // ============================================================
    // 渲染：总入口
    // ============================================================
    function renderScreens() {
        var dm = el("xhs-screen-dm");
        var video = el("xhs-screen-video");
        var detail = el("xhs-screen-detail");
        var main = el("xhs-screen-main");
        var showDm = Boolean(S.selectedDmThreadId);
        var note = selectedNote();
        var showVideo = Boolean(note && note.type === "video");
        var showDetail = Boolean(note && note.type !== "video");
        var showMain = !showDm && !showVideo && !showDetail;
        if (dm) dm.style.display = showDm ? "" : "none";
        if (video) video.style.display = showVideo ? "" : "none";
        if (detail) detail.style.display = showDetail ? "" : "none";
        if (main) main.style.display = showMain ? "" : "none";
        if (showDm) renderDmThread();
        if (showVideo) renderVideoDetail();
        if (showDetail) renderDetailPage();
        if (showMain) {
            var panes = { home: el("xhs-pane-home"), video: el("xhs-pane-video"), messages: el("xhs-pane-messages"), profile: el("xhs-pane-profile") };
            Object.keys(panes).forEach(function (key) {
                if (panes[key]) panes[key].style.display = key === S.selectedTab ? "" : "none";
            });
            if (S.selectedTab === "home") renderHomePane();
            if (S.selectedTab === "video") renderVideoPane();
            if (S.selectedTab === "messages") renderMessagesPane();
            if (S.selectedTab === "profile") renderProfilePane();
        }
    }
    var renderScheduled = false;
    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        requestAnimationFrame(function () {
            renderScheduled = false;
            refresh();
        });
    }
    function refresh() {
        renderAppbar();
        renderBusy();
        renderScreens();
        renderTabbar();
        renderModals();
    }
    function refreshAfterStateChange() {
        ensureImages();
        refresh();
    }

    // ============================================================
    // 交互：错误提示 / 忙碌状态
    // ============================================================
    function notice(message) {
        if (typeof showToast === "function") showToast(String(message || ""));
        else console.log("[Xiaohongshu]", message);
    }
    function handleGenerationError(err, title) {
        var message = err instanceof Error ? err.message : String(err);
        console.warn("[Xiaohongshu]", title, err);
        if (err instanceof XiaohongshuGenerationError && err.rawOutput) {
            console.warn("[Xiaohongshu] raw output:", err.rawOutput);
        }
        notice(title + "：" + message);
    }
    function setBusy(next) {
        if (S.busy === next) return;
        S.busy = next;
        renderBusy();
        renderAppbar();
        renderTabbar();
        renderScreens();
        if (!S.composeOpen) return;
        if (next !== "publish") {
            var submit = el("xhs-publish-sheet") && el("xhs-publish-sheet").querySelector(".xhs-publish-submit-btn");
            if (submit) submit.disabled = true;
        }
    }

    // ============================================================
    // 交互：内容流
    // ============================================================
    async function generateNpcFeedState(baseState, activeSettings, scope) {
        var generated = await generateXiaohongshuNpcFeed(
            activeSettings,
            baseState.socialGraph.following.filter(function (account) { return account.type === "npc"; }),
            baseState.profile.ipLocation,
            baseState.profile.nickname
        );
        if (generated.length === 0) throw new Error("没有解析到小红书笔记。");
        if (scope) {
            generated = generated.filter(function (note) {
                if (scope === "discover") return note.type === "post" && note.feedScope !== "nearby";
                if (scope === "nearby") return note.type === "post" && note.feedScope === "nearby";
                if (scope === "video") return note.type === "video";
                return true;
            });
        }
        return {
            generated: generated,
            state: saveXiaohongshuState(Object.assign({}, baseState, {
                notes: generated.concat(baseState.notes)
            }))
        };
    }
    async function generateCharacterActivityState(baseState, activeSettings) {
        var ids = activeSettings.participantCharacterIds;
        var current = baseState;
        if (ids.length === 0) return current;
        var participants = ids
            .map(function (characterId) { return S.characters.find(function (item) { return item.id === characterId; }); })
            .filter(Boolean);
        var successCount = 0;
        var firstError = null;
        for (var index = 0; index < participants.length; index += 1) {
            var character = participants[index];
            var activity = null;
            try {
                activity = await generateXiaohongshuCharacterActivity(character.id, current.notes.slice(0, 30), activeSettings);
            } catch (err) {
                if (!firstError) firstError = err;
                console.warn("[Xiaohongshu] Character activity failed:", character.name, err);
                continue;
            }
            if (!activity) continue;
            successCount += 1;
            var collectedNotifications = [];
            var updatedNotes = current.notes.map(function (note) {
                var related = activity.comments.filter(function (comment) { return comment.noteId === note.id; });
                if (related.length === 0) return note;
                var nextNote = note;
                related.forEach(function (parsed) {
                    if (!parsed.text || !parsed.text.trim()) return;
                    var result = applyCharacterActivityComment({
                        note: nextNote,
                        character: character,
                        text: parsed.text,
                        liked: parsed.liked,
                        saved: parsed.saved,
                        thread: parsed.thread
                    });
                    nextNote = result.note;
                    collectedNotifications.push.apply(collectedNotifications, result.notifications);
                    recordXiaohongshuCommentEvent({
                        characterId: character.id,
                        characterName: character.name,
                        note: note,
                        comment: result.mainComment,
                        liked: parsed.liked,
                        saved: parsed.saved
                    });
                    recordCharacterThreadCommentEvents(character, note, result.note, result.threadComments);
                });
                return nextNote;
            });
            var characterPost = createCharacterPost(character, activity);
            if (characterPost) {
                recordXiaohongshuPostEvent({
                    characterId: character.id,
                    characterName: character.name,
                    note: characterPost
                });
                recordCharacterThreadCommentEvents(character, characterPost, characterPost, characterPost.comments);
            }
            current = saveXiaohongshuState(Object.assign({}, current, {
                notes: characterPost ? [characterPost].concat(updatedNotes) : updatedNotes,
                notifications: collectedNotifications.length > 0
                    ? collectedNotifications.concat(current.notifications)
                    : current.notifications
            }));
            S.state = current;
            refresh();
        }
        if (successCount === 0 && firstError) {
            throw firstError instanceof Error ? firstError : new Error(String(firstError));
        }
        return current;
    }
    function isCharacterXiaohongshuAuthor(authorName, character, displayName) {
        var normalized = String(authorName || "").trim();
        if (!normalized) return false;
        return [displayName.trim(), character.name.trim()].filter(Boolean).indexOf(normalized) >= 0;
    }
    function createCharacterPost(character, activity) {
        if (!activity.post) return null;
        var now = new Date().toISOString();
        var displayName = resolveCharacterXiaohongshuDisplayName(character);
        var noteId = "xhs_char_note_" + character.id + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        var comments = activity.post.comments
            .filter(function (comment) { return comment.text; })
            .map(function (comment, commentIndex) {
                var parsedReplyIndex = (/^.*_comment_(\d+)$/.exec(comment.replyToCommentId || "") || [])[1];
                var isCharacterAuthor = isCharacterXiaohongshuAuthor(comment.authorName, character, displayName);
                var made = makeXiaohongshuComment({
                    noteId: noteId,
                    authorType: isCharacterAuthor ? "character" : "npc",
                    authorId: isCharacterAuthor ? character.id : makeXiaohongshuNpcId(comment.authorName),
                    authorName: isCharacterAuthor ? displayName : comment.authorName,
                    text: comment.text,
                    replyTo: comment.replyTo,
                    replyToCommentId: parsedReplyIndex ? noteId + "_comment_" + Number(parsedReplyIndex) : comment.replyToCommentId
                });
                made.id = noteId + "_comment_" + (commentIndex + 1);
                return made;
            });
        return {
            id: noteId,
            type: activity.post.type,
            source: "character",
            authorId: character.id,
            authorName: displayName,
            title: activity.post.title || activity.post.body.slice(0, 24) || "新的笔记",
            body: activity.post.body,
            videoDescription: activity.post.videoDescription,
            coverIcon: activity.post.coverIcon || (activity.post.type === "video" ? "▶" : "✦"),
            tone: "blush",
            tags: activity.post.tags,
            likeCount: activity.post.likeCount,
            saveCount: activity.post.saveCount,
            commentCount: activity.post.commentCount,
            liked: false,
            saved: false,
            recentLikeNames: activity.post.recentLikeNames,
            recentSaveNames: activity.post.recentSaveNames,
            comments: comments,
            imageDescription: activity.post.type === "post" ? activity.post.imageDescription : undefined,
            createdAt: now,
            updatedAt: now
        };
    }
    function recordCharacterThreadCommentEvents(character, sourceNote, appliedNote, threadComments) {
        (threadComments || []).forEach(function (comment) {
            var isCharacterComment = comment.authorType === "character"
                && comment.authorId === character.id
                && comment.text.trim()
                && (comment.replyToCommentId || comment.replyTo);
            if (!isCharacterComment) return;
            var targetComment = comment.replyToCommentId
                ? appliedNote.comments.find(function (item) { return item.id === comment.replyToCommentId; })
                : undefined;
            recordXiaohongshuReplyEvent({
                characterId: character.id,
                characterName: character.name,
                note: sourceNote,
                comment: comment,
                targetComment: targetComment
            });
        });
    }
    async function handleGenerateHomeContent() {
        if (S.busy !== "idle") return;
        try {
            var activeSettings = S.state.settings;
            var scope = null;
            if (S.selectedTab === "home") {
                if (S.homeFeedTab === "discover") scope = "discover";
                else if (S.homeFeedTab === "video") scope = "video";
                else if (S.homeFeedTab === "follow") scope = "follow";
            } else if (S.selectedTab === "video") {
                scope = "nearby";
            }
            if (scope === "follow") {
                if (activeSettings.participantCharacterIds.length > 0) {
                    setBusy("character-activity");
                    var withCharacters = await generateCharacterActivityState(S.state, activeSettings);
                    S.state = withCharacters;
                    refreshAfterStateChange();
                }
                notice("关注内容已生成");
            } else {
                setBusy("npc-feed");
                var withNpc = await generateNpcFeedState(S.state, activeSettings, scope);
                S.state = withNpc.state;
                refreshAfterStateChange();
                if (activeSettings.participantCharacterIds.length > 0) {
                    setBusy("character-activity");
                    var withCharacters = await generateCharacterActivityState(S.state, activeSettings);
                    S.state = withCharacters;
                    refreshAfterStateChange();
                }
                notice("小红书内容已生成");
            }
        } catch (err) {
            handleGenerationError(err, "暂时无法刷新小红书内容");
        } finally {
            setBusy("idle");
        }
    }
    function handleClearAllContent() {
        var visibleFeedIds = new Set([].concat(discoverNotes(), nearbyNotes(), videoNotes()).map(function (note) { return note.id; }));
        visibleFeedIds.forEach(function (noteId) { deleteXiaohongshuProjectionEventsForNote(noteId); });
        persist(Object.assign({}, S.state, {
            feedHiddenNoteIds: Array.from(new Set(S.state.feedHiddenNoteIds.concat(Array.from(visibleFeedIds))))
        }));
        if (S.selectedNoteId && visibleFeedIds.has(S.selectedNoteId)) {
            S.selectedNoteId = null;
            S.videoCommentsOpen = false;
        }
        S.messagePanel = null;
        S.selectedDmThreadId = null;
        S.replyTarget = null;
        S.commentDraft = "";
        S.commentEmojiOpen = false;
        S.commentMentionOpen = false;
        refreshAfterStateChange();
        notice("首页推荐、附近和视频内容已清空");
    }
    function requestFeedAction(action) {
        if (S.busy !== "idle") return;
        S.pendingFeedAction = action;
        refresh();
    }
    async function handleConfirmFeedAction() {
        if (!S.pendingFeedAction) return;
        var action = S.pendingFeedAction;
        S.pendingFeedAction = null;
        refresh();
        if (action === "refresh") {
            await handleGenerateHomeContent();
        } else {
            handleClearAllContent();
        }
    }

    // ============================================================
    // 交互：笔记 / 评论 / 关注
    // ============================================================
    function openNote(noteId) {
        var main = el("xhs-screen-main");
        S.mainScrollTop = main ? main.scrollTop : S.mainScrollTop;
        S.selectedNoteId = noteId;
        S.commentDraft = "";
        S.replyTarget = null;
        S.commentComposerFocused = false;
        S.commentEmojiOpen = false;
        S.commentMentionOpen = false;
        S.videoCommentsOpen = false;
        S.videoDragOffset = 0;
        S.videoDragSettling = false;
        S.videoDragDirection = null;
        S.videoCaptionExpanded = false;
        S.videoCaptionCanExpand = false;
        S.collapsedVideoCaption = "";
        S.captionMeasured = false;
        refresh();
        var detail = el("xhs-screen-detail");
        if (detail) detail.scrollTop = 0;
    }
    function closeNote() {
        S.selectedNoteId = null;
        S.videoCommentsOpen = false;
        S.commentDraft = "";
        S.replyTarget = null;
        S.commentComposerFocused = false;
        S.commentEmojiOpen = false;
        S.commentMentionOpen = false;
        S.videoDragOffset = 0;
        S.videoDragSettling = false;
        S.videoDragDirection = null;
        refresh();
        var main = el("xhs-screen-main");
        if (main) main.scrollTop = S.mainScrollTop;
    }
    function handleToggleLike(note) {
        var nextLiked = false;
        var notes = S.state.notes.map(function (item) {
            if (item.id !== note.id) return item;
            nextLiked = !item.liked;
            return Object.assign({}, item, {
                liked: nextLiked,
                likeCount: Math.max(0, item.likeCount + (item.liked ? -1 : 1)),
                updatedAt: new Date().toISOString()
            });
        });
        persist(Object.assign({}, S.state, {
            notes: notes,
            userInteractions: Object.assign({}, S.state.userInteractions, {
                likedNoteIds: nextLiked
                    ? addId(S.state.userInteractions.likedNoteIds, note.id)
                    : removeId(S.state.userInteractions.likedNoteIds, note.id)
            })
        }));
        refreshAfterStateChange();
    }
    function handleToggleSave(note) {
        var nextSaved = false;
        var notes = S.state.notes.map(function (item) {
            if (item.id !== note.id) return item;
            nextSaved = !item.saved;
            return Object.assign({}, item, {
                saved: nextSaved,
                saveCount: Math.max(0, item.saveCount + (item.saved ? -1 : 1)),
                updatedAt: new Date().toISOString()
            });
        });
        persist(Object.assign({}, S.state, {
            notes: notes,
            userInteractions: Object.assign({}, S.state.userInteractions, {
                savedNoteIds: nextSaved
                    ? addId(S.state.userInteractions.savedNoteIds, note.id)
                    : removeId(S.state.userInteractions.savedNoteIds, note.id)
            })
        }));
        refreshAfterStateChange();
    }
    function handleToggleFollowAuthor(note) {
        var account = makeAccountFromNote(note);
        if (!account) return;
        var key = accountKey(account);
        var following = S.state.socialGraph.following;
        var exists = following.some(function (item) { return accountKey(item) === key; });
        var nextFollowing = exists
            ? following.filter(function (item) { return accountKey(item) !== key; })
            : [Object.assign({}, account, { followedAt: new Date().toISOString() })].concat(following);
        persist(Object.assign({}, S.state, {
            profile: Object.assign({}, S.state.profile, { followingCount: nextFollowing.length }),
            socialGraph: Object.assign({}, S.state.socialGraph, { following: nextFollowing })
        }));
        refreshAfterStateChange();
    }
    function handleVoteComment(comment, vote) {
        persist(Object.assign({}, S.state, {
            notes: S.state.notes.map(function (note) {
                if (note.id !== comment.noteId) return note;
                return Object.assign({}, note, {
                    comments: note.comments.map(function (item) {
                        if (item.id !== comment.id) return item;
                        if (vote === "like") {
                            var liked = !item.liked;
                            return Object.assign({}, item, {
                                liked: liked,
                                disliked: liked ? false : item.disliked,
                                likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)),
                                dislikeCount: liked && item.disliked ? Math.max(0, item.dislikeCount - 1) : item.dislikeCount
                            });
                        }
                        var disliked = !item.disliked;
                        return Object.assign({}, item, {
                            disliked: disliked,
                            liked: disliked ? false : item.liked,
                            dislikeCount: Math.max(0, item.dislikeCount + (disliked ? 1 : -1)),
                            likeCount: disliked && item.liked ? Math.max(0, item.likeCount - 1) : item.likeCount
                        });
                    }),
                    updatedAt: new Date().toISOString()
                });
            })
        }));
        refreshAfterStateChange();
    }
    async function submitUserComment(options) {
        options = options || {};
        var text = (options.textOverride != null ? options.textOverride : S.commentDraft).trim();
        var note = selectedNote();
        if (S.busy !== "idle" || !note || !text) return;
        var target = S.replyTarget && note.comments.some(function (comment) { return comment.id === S.replyTarget.id; })
            ? S.replyTarget
            : undefined;
        var mentionCharacter = options.mentionCharacter || findMentionCharacterInText(text);
        var userComment = makeXiaohongshuComment({
            noteId: note.id,
            authorType: "user",
            authorId: "user",
            authorName: S.state.profile.nickname || "我",
            text: text,
            replyTo: target ? target.authorName : undefined,
            replyToCommentId: target ? target.id : undefined
        });
        var current = saveXiaohongshuState(Object.assign({}, S.state, {
            notes: S.state.notes.map(function (item) {
                if (item.id !== note.id) return item;
                return Object.assign({}, item, {
                    comments: item.comments.concat([userComment]),
                    commentCount: item.commentCount + 1,
                    updatedAt: new Date().toISOString()
                });
            }),
            userInteractions: Object.assign({}, S.state.userInteractions, {
                commentedNoteIds: addId(S.state.userInteractions.commentedNoteIds, note.id)
            })
        }));
        S.state = current;
        S.commentDraft = "";
        S.commentComposerFocused = false;
        S.commentEmojiOpen = false;
        S.commentMentionOpen = false;
        S.replyTarget = null;
        setBusy(mentionCharacter ? "mention-reply" : "comment-reply");
        try {
            var latestNote = current.notes.find(function (item) { return item.id === note.id; });
            if (!latestNote) return;
            if (mentionCharacter) {
                var mentionReaction = await generateXiaohongshuCharacterMentionReply(mentionCharacter.id, latestNote, userComment, target, current.settings);
                if (!mentionReaction) {
                    notice("该角色暂时没有可用的小红书回复配置");
                    return;
                }
                if (mentionReaction.comment.trim()) {
                    var mentionApplied = applyCharacterMentionReply(latestNote, mentionCharacter, mentionReaction, userComment.id);
                    var mentionAdded = findAddedCharacterComment(latestNote, mentionApplied.note, mentionCharacter);
                    if (mentionAdded) {
                        recordXiaohongshuReplyEvent({
                            characterId: mentionCharacter.id,
                            characterName: mentionCharacter.name,
                            note: latestNote,
                            comment: mentionAdded,
                            targetComment: userComment
                        });
                        recordCharacterThreadCommentEvents(mentionCharacter, latestNote, mentionApplied.note, mentionApplied.threadComments);
                    }
                    current = saveXiaohongshuState(Object.assign({}, current, {
                        notes: current.notes.map(function (item) { return item.id === latestNote.id ? mentionApplied.note : item; }),
                        notifications: mentionApplied.notifications.concat(current.notifications)
                    }));
                    S.state = current;
                    refreshAfterStateChange();
                }
                return;
            }
            var roleCharacterId = target && target.authorType === "character"
                ? target.authorId
                : latestNote.source === "character" ? latestNote.authorId : "";
            var character = roleCharacterId
                ? S.characters.find(function (item) { return item.id === roleCharacterId; })
                : undefined;
            if (character) {
                try {
                    var reaction = await generateXiaohongshuCharacterReplyToUserComment(character.id, latestNote, userComment, target, current.settings);
                    if (reaction && reaction.comment.trim()) {
                        var applied = applyCharacterCommentReply(latestNote, character, reaction, userComment.id);
                        var addedComment = findAddedCharacterComment(latestNote, applied.note, character);
                        if (addedComment) {
                            recordXiaohongshuReplyEvent({
                                characterId: character.id,
                                characterName: character.name,
                                note: latestNote,
                                comment: addedComment,
                                targetComment: userComment
                            });
                            recordCharacterThreadCommentEvents(character, latestNote, applied.note, applied.threadComments);
                        }
                        current = saveXiaohongshuState(Object.assign({}, current, {
                            notes: current.notes.map(function (item) { return item.id === latestNote.id ? applied.note : item; }),
                            notifications: applied.notifications.concat(current.notifications)
                        }));
                        S.state = current;
                        latestNote = applied.note;
                        refreshAfterStateChange();
                    }
                } catch (err) {
                    handleGenerationError(err, "暂时无法生成评论回复");
                }
            }
            var npcReply = await generateXiaohongshuNpcReplyToUserComment(latestNote, userComment, current.settings, target);
            var npcApplied = applyNpcCommentReply(latestNote, npcReply, userComment.id);
            current = saveXiaohongshuState(Object.assign({}, current, {
                notes: current.notes.map(function (item) { return item.id === latestNote.id ? npcApplied.note : item; }),
                notifications: npcApplied.notifications.concat(current.notifications)
            }));
            S.state = current;
            refreshAfterStateChange();
        } catch (err) {
            handleGenerationError(err, mentionCharacter ? "暂时无法生成@回复" : "暂时无法生成评论回复");
        } finally {
            setBusy("idle");
        }
    }
    async function handleLoadMoreComments(note) {
        if (S.busy !== "idle") return;
        var latestNote = S.state.notes.find(function (item) { return item.id === note.id; }) || note;
        setBusy("more-comments");
        try {
            var reaction = await generateXiaohongshuNpcMoreComments(latestNote, S.state.settings);
            var addedCount = reaction.comments.filter(function (comment) { return comment.text; }).length;
            if (addedCount === 0) throw new Error("没有解析到新的小红书评论。");
            var updatedNote = applyNpcMoreComments(latestNote, reaction);
            persist(Object.assign({}, S.state, {
                notes: S.state.notes.map(function (item) { return item.id === latestNote.id ? updatedNote : item; })
            }));
            refreshAfterStateChange();
            notice("已加载 " + addedCount + " 条新评论");
        } catch (err) {
            handleGenerationError(err, "暂时无法加载更多评论");
        } finally {
            setBusy("idle");
        }
    }
    function requestDeleteNote(note) {
        S.deleteTarget = {
            type: "note",
            noteId: note.id,
            title: note.title.trim() || note.body.trim().slice(0, 24) || "这篇笔记"
        };
        refresh();
    }
    function requestDeleteComment(comment) {
        var note = S.state.notes.find(function (item) { return item.id === comment.noteId; });
        S.deleteTarget = {
            type: "comment",
            comment: comment,
            noteTitle: (note && (note.title.trim() || note.body.trim().slice(0, 24))) || "这篇笔记"
        };
        refresh();
    }
    function handleDeleteComment(comment) {
        var sourceNote = S.state.notes.find(function (note) { return note.id === comment.noteId; });
        var deletedIdsForEvents = sourceNote
            ? collectCommentThreadIds(sourceNote.comments, comment.id)
            : new Set([comment.id]);
        deletedIdsForEvents.forEach(function (id) { deleteXiaohongshuProjectionEventForComment(id); });
        var notes = S.state.notes.map(function (note) {
            if (note.id !== comment.noteId) return note;
            var deletedCommentIds = collectCommentThreadIds(note.comments, comment.id);
            var comments = note.comments.filter(function (item) { return !deletedCommentIds.has(item.id); });
            return Object.assign({}, note, {
                comments: comments,
                commentCount: Math.max(0, note.commentCount - deletedCommentIds.size),
                updatedAt: new Date().toISOString()
            });
        });
        var targetNote = notes.find(function (note) { return note.id === comment.noteId; });
        persist(Object.assign({}, S.state, {
            notes: notes,
            userInteractions: Object.assign({}, S.state.userInteractions, {
                commentedNoteIds: targetNote && (comment.authorType !== "user" || noteHasUserComment(targetNote))
                    ? S.state.userInteractions.commentedNoteIds
                    : removeId(S.state.userInteractions.commentedNoteIds, comment.noteId)
            })
        }));
        if (S.replyTarget && deletedIdsForEvents.has(S.replyTarget.id)) S.replyTarget = null;
        refreshAfterStateChange();
    }
    function handleDeleteNote(noteId) {
        deleteXiaohongshuProjectionEventsForNote(noteId);
        persist(Object.assign({}, S.state, {
            notes: S.state.notes.filter(function (note) { return note.id !== noteId; }),
            feedHiddenNoteIds: removeId(S.state.feedHiddenNoteIds, noteId),
            notifications: S.state.notifications.filter(function (noticeItem) { return noticeItem.noteId !== noteId; }),
            userInteractions: {
                likedNoteIds: removeId(S.state.userInteractions.likedNoteIds, noteId),
                savedNoteIds: removeId(S.state.userInteractions.savedNoteIds, noteId),
                commentedNoteIds: removeId(S.state.userInteractions.commentedNoteIds, noteId)
            }
        }));
        S.selectedNoteId = null;
        S.videoCommentsOpen = false;
        S.replyTarget = null;
        S.commentDraft = "";
        S.commentEmojiOpen = false;
        S.commentMentionOpen = false;
        refreshAfterStateChange();
    }
    function handleConfirmDelete() {
        if (!S.deleteTarget) return;
        var target = S.deleteTarget;
        S.deleteTarget = null;
        if (target.type === "note") handleDeleteNote(target.noteId);
        else handleDeleteComment(target.comment);
        refresh();
    }
    function handleShareNote(note) {
        var description = (note.type === "video" ? note.videoDescription || note.imageDescription : note.imageDescription) || "";
        var share = {
            type: "xiaohongshu_note",
            authorName: note.authorName,
            title: getXhsPlainText(note.title),
            body: getXhsPlainText(note.body),
            description: getXhsPlainText(description),
            noteType: note.type,
            tags: note.tags,
            imageAssetId: note.imageAssetId,
            coverIcon: note.coverIcon,
            tone: note.tone
        };
        window.dispatchEvent(new CustomEvent("open-mini-chat", { detail: { share: share } }));
        notice("选择聊天对象后发送小红书帖子");
    }

    // ============================================================
    // 交互：发布
    // ============================================================
    async function handleImageChange(file) {
        if (!file) return;
        var image = new Image();
        var objectUrl = URL.createObjectURL(file);
        image.onload = function () {
            var canvas = document.createElement("canvas");
            var maxSize = 960;
            var sourceWidth = image.width;
            var sourceHeight = image.height;
            var sourceX = 0;
            var sourceY = 0;
            if (sourceHeight / sourceWidth > XHS_MAX_IMAGE_HEIGHT_RATIO) {
                sourceHeight = Math.round(sourceWidth * XHS_MAX_IMAGE_HEIGHT_RATIO);
                sourceY = Math.round((image.height - sourceHeight) / 2);
            }
            var width = sourceWidth;
            var height = sourceHeight;
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = Math.round(height / width * maxSize);
                    width = maxSize;
                } else {
                    width = Math.round(width / height * maxSize);
                    height = maxSize;
                }
            }
            canvas.width = width;
            canvas.height = height;
            var context = canvas.getContext("2d");
            if (!context) {
                URL.revokeObjectURL(objectUrl);
                return;
            }
            context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
            // mie 不用 IndexedDB：直接以 dataURL 存进草稿，最终写入 note.imageDataUrl。
            var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
            URL.revokeObjectURL(objectUrl);
            S.draft.image = { dataUrl: dataUrl, width: canvas.width, height: canvas.height };
            renderModals();
        };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); };
        image.src = objectUrl;
    }
    async function handleProfileCoverChange(file) {
        if (!file) return;
        var image = new Image();
        var objectUrl = URL.createObjectURL(file);
        image.onload = function () {
            var canvas = document.createElement("canvas");
            var maxWidth = 1440;
            var width = image.width;
            var height = image.height;
            if (width > maxWidth) {
                height = Math.round(height / width * maxWidth);
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            var context = canvas.getContext("2d");
            if (!context) {
                URL.revokeObjectURL(objectUrl);
                return;
            }
            context.drawImage(image, 0, 0, width, height);
            var dataUrl = canvas.toDataURL("image/jpeg", 0.84);
            URL.revokeObjectURL(objectUrl);
            saveCoverToStorage(dataUrl);
            S.imageMap[XHS_COVER_LOCAL_KEY] = dataUrl;
            persist(Object.assign({}, S.state, {
                profile: Object.assign({}, S.state.profile, { coverImageAssetId: XHS_COVER_LOCAL_KEY })
            }));
            refresh();
        };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); };
        image.src = objectUrl;
    }
    async function handlePublish() {
        if (S.busy !== "idle" || (!S.draft.title.trim() && !S.draft.body.trim())) return;
        setBusy("publish");
        try {
            var userNote = createUserXiaohongshuNote(
                { title: S.draft.title, body: S.draft.body, tags: S.tagInput.split(/[,，、#\s]+/).filter(Boolean), image: S.draft.image },
                S.state.profile
            );
            var current = saveXiaohongshuState(Object.assign({}, S.state, {
                notes: [userNote].concat(S.state.notes)
            }));
            S.state = current;
            S.composeOpen = false;
            S.draft = { title: "", body: "", tags: [], image: {} };
            S.tagInput = "";
            refreshAfterStateChange();

            setBusy("npc-reaction");
            var npcReaction = await generateXiaohongshuNpcReactionForUserPost(userNote, current.settings);
            var npcApplied = applyNpcReaction(userNote, npcReaction);
            var npcFollowerAccounts = npcReaction.followerNames.map(makeNpcAccount);
            var nextAfterNpc = Object.assign({}, current, {
                notes: current.notes.map(function (note) { return note.id === userNote.id ? npcApplied.note : note; }),
                notifications: npcApplied.notifications.concat(current.notifications)
            });
            nextAfterNpc = addFollowersToState(nextAfterNpc, npcFollowerAccounts, userNote).next;
            current = saveXiaohongshuState(nextAfterNpc);
            S.state = current;
            refreshAfterStateChange();

            setBusy("character-reaction");
            for (var index = 0; index < current.settings.participantCharacterIds.length; index += 1) {
                var characterId = current.settings.participantCharacterIds[index];
                if (Math.random() * 100 > current.settings.sendToCharacterProbability) continue;
                var character = S.characters.find(function (item) { return item.id === characterId; });
                if (!character) continue;
                var latestNote = current.notes.find(function (note) { return note.id === userNote.id; }) || userNote;
                var reaction = await generateXiaohongshuCharacterReactionToUserPost(characterId, latestNote, current.settings);
                if (!reaction || !reaction.comment.trim()) continue;
                var applied = applyCharacterReaction(latestNote, character, reaction);
                var addedComment = findAddedCharacterComment(latestNote, applied.note, character);
                var nextAfterCharacter = Object.assign({}, current, {
                    notes: current.notes.map(function (note) { return note.id === latestNote.id ? applied.note : note; }),
                    notifications: applied.notifications.concat(current.notifications)
                });
                if (addedComment) {
                    recordXiaohongshuCommentEvent({
                        characterId: character.id,
                        characterName: character.name,
                        note: latestNote,
                        comment: addedComment,
                        liked: reaction.liked,
                        saved: reaction.saved
                    });
                    recordCharacterThreadCommentEvents(character, latestNote, applied.note, applied.threadComments);
                }
                if (reaction.followedAuthor) {
                    var followerResult = addFollowersToState(nextAfterCharacter, [makeCharacterAccount(character)], latestNote);
                    nextAfterCharacter = followerResult.next;
                    if (followerResult.added.length > 0) {
                        recordXiaohongshuFollowUserEvent({
                            characterId: character.id,
                            characterName: character.name,
                            userDisplayName: latestNote.authorName
                        });
                    }
                }
                current = saveXiaohongshuState(nextAfterCharacter);
                S.state = current;
                refreshAfterStateChange();
            }
            notice("小红书笔记已发布");
        } catch (err) {
            handleGenerationError(err, "暂时无法发布小红书笔记");
        } finally {
            setBusy("idle");
        }
    }
    function updatePublishSubmitState() {
        var sheet = el("xhs-publish-sheet");
        if (!sheet) return;
        var submit = sheet.querySelector(".xhs-publish-submit-btn");
        if (submit) {
            var canSubmit = S.busy === "idle" && (S.draft.title.trim() || S.draft.body.trim());
            submit.disabled = !canSubmit;
        }
    }

    // ============================================================
    // 交互：消息 / 私信
    // ============================================================
    function createOutgoingDmMessage(thread, text, createdAt) {
        var userName = S.state.profile.nickname || "我";
        var message = makeXiaohongshuNotification({
            type: "dm",
            actorName: userName,
            text: text,
            thumbnailText: "私信",
            direction: "outgoing",
            threadId: thread.id,
            threadName: thread.actorName,
            unread: false
        });
        message.createdAt = createdAt || new Date().toISOString();
        return message;
    }
    function handleSendDmMessage(thread) {
        var text = S.dmDraft.trim();
        if (!text || S.busy !== "idle") return;
        S.dmDraft = "";
        S.dmEmojiOpen = false;
        var userMessage = createOutgoingDmMessage(thread, text);
        persist(Object.assign({}, S.state, {
            notifications: [userMessage].concat(S.state.notifications)
        }));
        refreshAfterStateChange();
    }
    async function handleGenerateDmReply(thread) {
        if (S.busy !== "idle") return;
        setBusy("dm-reply");
        S.dmEmojiOpen = false;
        var pendingText = S.dmDraft.trim();
        var pendingMessage = pendingText ? createOutgoingDmMessage(thread, pendingText, new Date().toISOString()) : null;
        if (pendingMessage) S.dmDraft = "";
        var current = pendingMessage
            ? saveXiaohongshuState(Object.assign({}, S.state, {
                notifications: [pendingMessage].concat(S.state.notifications)
            }))
            : S.state;
        if (pendingMessage) { S.state = current; refreshAfterStateChange(); }
        var threadId = thread.id;
        var threadName = thread.actorName;
        var userName = S.state.profile.nickname || "我";
        var baseMessages = pendingMessage ? thread.notifications.concat([pendingMessage]) : thread.notifications;
        var latestUserText = pendingMessage
            ? pendingMessage.text
            : (baseMessages.slice().reverse().find(function (message) { return message.direction === "outgoing"; }) || {}).text || "";
        if (!latestUserText) {
            setBusy("idle");
            notice("请先发送一条私信");
            return;
        }
        try {
            var reply = await generateXiaohongshuNpcDmReply({
                threadName: threadName,
                userName: userName,
                messages: baseMessages,
                latestUserText: latestUserText,
                settings: current.settings
            });
            var replies = (reply.messages || []).filter(Boolean).map(function (message, index) {
                var made = makeXiaohongshuNotification({
                    type: "dm",
                    actorName: threadName,
                    text: message,
                    thumbnailText: "私信",
                    direction: "incoming",
                    threadId: threadId,
                    threadName: threadName,
                    unread: S.selectedDmThreadId !== threadId
                });
                made.createdAt = new Date(Date.now() + index + 1).toISOString();
                return made;
            });
            if (replies.length > 0) {
                current = saveXiaohongshuState(Object.assign({}, current, {
                    notifications: replies.concat(current.notifications)
                }));
                S.state = current;
            }
        } catch (err) {
            handleGenerationError(err, "暂时无法生成私信回复");
        } finally {
            setBusy("idle");
        }
    }
    function handleOpenMessagePanel(panel) {
        S.selectedDmThreadId = null;
        S.messagePanel = panel;
        var hasUnread = false;
        var notifications = S.state.notifications.map(function (noticeItem) {
            var matches = panel === "engagement"
                ? noticeItem.type === "like" || noticeItem.type === "save"
                : noticeItem.type === panel;
            if (!noticeItem.unread || !matches) return noticeItem;
            hasUnread = true;
            return Object.assign({}, noticeItem, { unread: false });
        });
        if (hasUnread) persist(Object.assign({}, S.state, { notifications: notifications }));
        refresh();
    }
    function handleOpenDmThread(thread) {
        S.messagePanel = null;
        S.selectedDmThreadId = thread.id;
        S.dmDraft = "";
        S.dmEmojiOpen = false;
        var noticeIds = new Set(thread.notifications.map(function (noticeItem) { return noticeItem.id; }));
        var hasUnread = false;
        var notifications = S.state.notifications.map(function (noticeItem) {
            if (!noticeItem.unread || !noticeIds.has(noticeItem.id)) return noticeItem;
            hasUnread = true;
            return Object.assign({}, noticeItem, { unread: false });
        });
        if (hasUnread) persist(Object.assign({}, S.state, { notifications: notifications }));
        refresh();
    }
    function closeDmThread() {
        S.selectedDmThreadId = null;
        S.dmDraft = "";
        S.dmEmojiOpen = false;
        refresh();
    }

    // ============================================================
    // 交互：弹层
    // ============================================================
    function openCompose() {
        S.composeOpen = true;
        renderModals();
    }
    function closeCompose() {
        S.composeOpen = false;
        renderModals();
    }
    function openSettings() {
        S.settingsDraft = JSON.parse(JSON.stringify(S.state.settings));
        S.expandedPrompts = {};
        S.settingsOpen = true;
        renderModals();
    }
    function closeSettings() {
        S.settingsOpen = false;
        S.settingsDraft = null;
        renderModals();
    }
    function handleSaveSettings() {
        var draft = S.settingsDraft;
        persist(Object.assign({}, S.state, {
            settings: Object.assign({}, draft, {
                bilingualTranslationPrompt: (draft.bilingualTranslationPrompt || "").trim() || DEFAULT_XIAOHONGSHU_SETTINGS.bilingualTranslationPrompt,
                sendToCharacterProbability: Math.max(0, Math.min(100, Number(draft.sendToCharacterProbability) || 0))
            })
        }));
        S.bilingualExpanded = !S.state.settings.collapseBilingualTranslation;
        closeSettings();
    }
    function openProfileEdit() {
        S.profileDraft = JSON.parse(JSON.stringify(S.state.profile));
        S.profileOpen = true;
        renderModals();
    }
    function closeProfileEdit() {
        S.profileOpen = false;
        S.profileDraft = null;
        renderModals();
    }
    function handleSaveProfile() {
        var stats = profileStats();
        persist(Object.assign({}, S.state, {
            profile: Object.assign({}, S.profileDraft, {
                followingCount: stats.followingCount,
                followerCount: stats.followerCount,
                likedAndSavedCount: stats.likedAndSavedCount
            })
        }));
        closeProfileEdit();
    }
    function closeConfirm() {
        S.deleteTarget = null;
        S.pendingFeedAction = null;
        renderModals();
    }

    // ============================================================
    // 交互：视频滑动切换
    // ============================================================
    function getSiblingVideo(direction) {
        var index = activeVideoNoteIndex();
        if (index < 0) return undefined;
        var notes = videoNotes();
        var nextIndex = direction === "previous" ? index - 1 : index + 1;
        return notes[nextIndex];
    }
    function settleVideoDrag(nextNoteId) {
        if (S.videoSettleTimer !== null) window.clearTimeout(S.videoSettleTimer);
        S.videoSettleTimer = window.setTimeout(function () {
            if (nextNoteId) S.selectedNoteId = nextNoteId;
            S.videoDragSettling = false;
            S.videoDragOffset = 0;
            S.videoDragDirection = null;
            S.videoSettleTimer = null;
            S.captionMeasured = false;
            refresh();
        }, 190);
    }
    function animateSiblingVideo(direction) {
        var note = selectedNote();
        if (!note || note.type !== "video" || S.videoCommentsOpen) return false;
        var nextVideo = getSiblingVideo(direction);
        if (!nextVideo) return false;
        var height = (el("xhs-screen-video") || {}).clientHeight || window.innerHeight;
        S.videoDragSettling = true;
        S.videoDragDirection = direction;
        S.videoDragOffset = direction === "next" ? -height : height;
        settleVideoDrag(nextVideo.id);
        return true;
    }
    function handleVideoWheel(event) {
        if (S.videoCommentsOpen) return;
        var absY = Math.abs(event.deltaY);
        if (absY < 42 || absY < Math.abs(event.deltaX)) return;
        event.preventDefault();
        var now = Date.now();
        if (now - S.videoLastWheelAt < 520) return;
        S.videoLastWheelAt = now;
        animateSiblingVideo(event.deltaY > 0 ? "next" : "previous");
    }
    function handleVideoTouchStart(event) {
        if (S.videoCommentsOpen) return;
        if (S.videoSettleTimer !== null) {
            window.clearTimeout(S.videoSettleTimer);
            S.videoSettleTimer = null;
        }
        S.videoDragSettling = false;
        S.videoDragOffset = 0;
        S.videoDragDirection = null;
        var touch = event.touches[0];
        S.videoSwipeStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }
    function handleVideoTouchMove(event) {
        if (S.videoCommentsOpen) return;
        var start = S.videoSwipeStart;
        var touch = event.touches[0];
        if (!start || !touch) return;
        var deltaX = touch.clientX - start.x;
        var deltaY = touch.clientY - start.y;
        var absY = Math.abs(deltaY);
        if (absY < 2 || absY < Math.abs(deltaX) * 1.12) return;
        var direction = deltaY < 0 ? "next" : "previous";
        var nextVideo = getSiblingVideo(direction);
        if (!nextVideo) {
            S.videoDragOffset = 0;
            S.videoDragDirection = null;
            return;
        }
        event.preventDefault();
        S.videoDragSettling = false;
        S.videoDragDirection = direction;
        S.videoDragOffset = deltaY;
        renderScreens();
    }
    function handleVideoTouchEnd(event) {
        if (S.videoCommentsOpen) return;
        var start = S.videoSwipeStart;
        S.videoSwipeStart = null;
        var touch = event.changedTouches[0];
        if (!start || !touch) return;
        var deltaX = touch.clientX - start.x;
        var deltaY = touch.clientY - start.y;
        var absY = Math.abs(deltaY);
        if (absY < 56 || absY < Math.abs(deltaX) * 1.15) {
            S.videoDragSettling = true;
            S.videoDragOffset = 0;
            settleVideoDrag();
            return;
        }
        var direction = deltaY < 0 ? "next" : "previous";
        var nextVideo = getSiblingVideo(direction);
        if (!nextVideo) {
            S.videoDragSettling = true;
            S.videoDragOffset = 0;
            settleVideoDrag();
            return;
        }
        var height = (el("xhs-screen-video") || {}).clientHeight || window.innerHeight;
        S.videoDragSettling = true;
        S.videoDragDirection = direction;
        S.videoDragOffset = direction === "next" ? -height : height;
        settleVideoDrag(nextVideo.id);
    }
    function handleMainScroll(event) {
        S.mainScrollTop = event.currentTarget.scrollTop;
        if (S.selectedTab !== "profile") {
            if (S.profileTopbarVisible) {
                S.profileTopbarVisible = false;
                renderProfilePane();
            }
            return;
        }
        var nextVisible = event.currentTarget.scrollTop >= 58;
        if (S.profileTopbarVisible !== nextVisible) {
            S.profileTopbarVisible = nextVisible;
            var topbar = el("xhs-pane-profile") && el("xhs-pane-profile").querySelector(".cp-xhs-profile-topbar");
            if (topbar) topbar.className = "cp-xhs-profile-topbar " + (nextVisible ? "is-visible" : "");
        }
    }

    // ============================================================
    // 返回逻辑
    // ============================================================
    function handleBackIntercept() {
        if (S.selectedDmThreadId) {
            closeDmThread();
            return true;
        }
        if (S.selectedNoteId) {
            closeNote();
            return true;
        }
        if (S.messagePanel) {
            S.messagePanel = null;
            refresh();
            return true;
        }
        return false;
    }

    // ============================================================
    // 事件绑定
    // ============================================================
    var ACTIONS = {
        "feed-refresh": function () { requestFeedAction("refresh"); },
        "feed-clear": function () { requestFeedAction("clear"); },
        "home-feed-tab": function (target) {
            S.homeFeedTab = target.getAttribute("data-tab");
            renderAppbar();
            renderScreens();
        },
        "tab": function (target) {
            var tab = target.getAttribute("data-tab");
            if (S.selectedTab === tab) return;
            S.selectedTab = tab;
            S.profileTopbarVisible = false;
            if (tab !== "messages") {
                S.messagePanel = null;
                S.selectedDmThreadId = null;
                S.dmEmojiOpen = false;
            }
            refresh();
        },
        "publish-open": function () { openCompose(); },
        "publish-close": function () { closeCompose(); },
        "publish-pick-image": function () {
            var input = el("xhs-publish-file-input");
            if (input) input.click();
        },
        "publish-image-desc": function () {
            S.draft.image = { description: "" };
            renderModals();
        },
        "publish-cancel-image": function () {
            S.draft.image = {};
            renderModals();
        },
        "publish-submit": function () { handlePublish(); },
        "empty-generate": function () { handleGenerateHomeContent(); },
        "open-note": function (target) { openNote(target.getAttribute("data-note-id")); },
        "overview-open": function (target) { handleOpenMessagePanel(target.getAttribute("data-panel")); },
        "dm-open": function (target) {
            var thread = dmThreads().find(function (item) { return item.id === target.getAttribute("data-thread-id"); });
            if (thread) handleOpenDmThread(thread);
        },
        "dm-back": function () { closeDmThread(); },
        "dm-emoji-toggle": function () {
            S.dmEmojiOpen = !S.dmEmojiOpen;
            renderDmThread();
        },
        "dm-emoji": function (target) {
            S.dmDraft += target.getAttribute("data-emoji") || "";
            renderDmThread();
        },
        "dm-generate": function () {
            var thread = selectedDmThread();
            if (thread) handleGenerateDmReply(thread);
        },
        "dm-send": function () {
            var thread = selectedDmThread();
            if (thread) handleSendDmMessage(thread);
        },
        "video-back": function () { closeNote(); },
        "video-comments-open": function () {
            S.videoCommentsOpen = true;
            S.commentComposerFocused = false;
            renderVideoDetail();
        },
        "video-comments-close": function () {
            S.videoCommentsOpen = false;
            S.commentEmojiOpen = false;
            S.commentMentionOpen = false;
            renderVideoDetail();
        },
        "caption-toggle": function () {
            S.videoCaptionExpanded = !S.videoCaptionExpanded;
            S.captionMeasured = true;
            renderVideoDetail();
        },
        "detail-back": function () { closeNote(); },
        "detail-share": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleShareNote(note);
        },
        "detail-like": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleToggleLike(note);
        },
        "detail-save": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleToggleSave(note);
        },
        "detail-follow": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleToggleFollowAuthor(note);
        },
        "video-follow": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleToggleFollowAuthor(note);
        },
        "delete-note": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) requestDeleteNote(note);
        },
        "comment-reply": function (target) {
            var note = selectedNote();
            if (!note) return;
            var comment = note.comments.find(function (item) { return item.id === target.getAttribute("data-comment-id"); });
            if (comment) S.replyTarget = comment;
            renderScreens();
        },
        "comment-clear-reply": function () {
            S.replyTarget = null;
            renderScreens();
        },
        "comment-delete": function (target) {
            var note = selectedNote();
            if (!note) return;
            var comment = note.comments.find(function (item) { return item.id === target.getAttribute("data-comment-id"); });
            if (comment) requestDeleteComment(comment);
        },
        "comment-vote": function (target) {
            var note = selectedNote();
            if (!note) return;
            var comment = note.comments.find(function (item) { return item.id === target.getAttribute("data-comment-id"); });
            if (comment) handleVoteComment(comment, target.getAttribute("data-vote") === "dislike" ? "dislike" : "like");
        },
        "comment-send": function () { submitUserComment(); },
        "load-more-comments": function (target) {
            var note = findNote(target.getAttribute("data-note-id"));
            if (note) handleLoadMoreComments(note);
        },
        "toolbar-panel": function (target) {
            var panel = target.getAttribute("data-panel");
            if (panel === "mention") {
                S.commentMentionOpen = !S.commentMentionOpen;
                S.commentEmojiOpen = false;
            } else {
                S.commentEmojiOpen = !S.commentEmojiOpen;
                S.commentMentionOpen = false;
            }
            renderScreens();
        },
        "toolbar-send": function () { submitUserComment(); },
        "mention-pick": function (target) {
            var displayName = target.getAttribute("data-name") || "";
            var mention = "@" + displayName;
            var base = S.commentDraft.replace(/\s+$/g, "");
            if (base.indexOf(mention) >= 0) S.commentDraft = base + " ";
            else S.commentDraft = base ? base + " " + mention + " " : mention + " ";
            S.commentMentionOpen = false;
            S.commentEmojiOpen = false;
            S.commentComposerFocused = true;
            renderScreens();
            refocusCommentDraft();
        },
        "emoji-pick": function (target) {
            S.commentDraft += target.getAttribute("data-emoji") || "";
            S.commentComposerFocused = true;
            renderScreens();
            refocusCommentDraft();
        },
        "profile-tab": function (target) {
            S.profileTab = target.getAttribute("data-tab");
            renderProfilePane();
        },
        "cover-change": function () {
            var input = el("xhs-cover-file-input");
            if (input) input.click();
        },
        "settings-open": function () { openSettings(); },
        "settings-close": function () { closeSettings(); },
        "settings-toggle": function (target) {
            var key = target.getAttribute("data-key");
            if (!S.settingsDraft) return;
            S.settingsDraft[key] = !S.settingsDraft[key];
            renderModals();
        },
        "settings-participant": function (target) {
            var id = target.getAttribute("data-id");
            if (!S.settingsDraft) return;
            var list = S.settingsDraft.participantCharacterIds;
            S.settingsDraft.participantCharacterIds = list.indexOf(id) >= 0
                ? list.filter(function (item) { return item !== id; })
                : list.concat([id]);
            renderModals();
        },
        "settings-prompt-toggle": function (target) {
            var key = target.getAttribute("data-key");
            S.expandedPrompts[key] = !S.expandedPrompts[key];
            renderModals();
        },
        "settings-reset": function () {
            S.settingsDraft = JSON.parse(JSON.stringify(DEFAULT_XIAOHONGSHU_SETTINGS));
            renderModals();
        },
        "settings-save": function () { handleSaveSettings(); },
        "profile-edit-open": function () { openProfileEdit(); },
        "profile-close": function () { closeProfileEdit(); },
        "profile-gender": function (target) {
            if (!S.profileDraft) return;
            S.profileDraft.gender = target.getAttribute("data-gender");
            renderModals();
        },
        "profile-save": function () { handleSaveProfile(); },
        "confirm-close": function () { closeConfirm(); },
        "confirm-delete": function () { handleConfirmDelete(); },
        "confirm-feed": function () { handleConfirmFeedAction(); },
        "bilingual-toggle": function () {
            S.bilingualExpanded = !S.bilingualExpanded;
            refresh();
        }
    };
    function refocusCommentDraft() {
        requestAnimationFrame(function () {
            var screen = el("xiaohongshu-screen");
            if (!screen) return;
            var textarea = screen.querySelector('textarea[data-field="comment-draft"]');
            if (textarea) {
                textarea.focus();
                var length = textarea.value.length;
                try { textarea.setSelectionRange(length, length); } catch (error) { /* ignore */ }
            }
        });
    }
    function bindEvents() {
        var screen = el("xiaohongshu-screen");
        if (!screen || screen.dataset.xhsBound === "1") return;
        screen.dataset.xhsBound = "1";

        screen.addEventListener("click", function (event) {
            var backBtn = event.target.closest ? event.target.closest(".back-btn") : null;
            if (backBtn && backBtn.getAttribute("data-target") === "home-screen") {
                // 子页面打开时执行内部返回并拦截冒泡；否则放行给 main.js 回桌面。
                if (handleBackIntercept()) {
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            }
            var actionEl = event.target.closest ? event.target.closest("[data-action]") : null;
            if (actionEl) {
                var action = actionEl.getAttribute("data-action");
                var handler = ACTIONS[action];
                if (handler) {
                    event.stopPropagation();
                    handler(actionEl, event);
                    return;
                }
            }
            if (event.target.classList && event.target.classList.contains("xhs-modal-backdrop")) {
                if (S.deleteTarget || S.pendingFeedAction) closeConfirm();
                else if (S.composeOpen) closeCompose();
                else if (S.settingsOpen) closeSettings();
                else if (S.profileOpen) closeProfileEdit();
            }
        });

        screen.addEventListener("input", function (event) {
            var target = event.target;
            if (!target || !target.getAttribute) return;
            var field = target.getAttribute("data-field");
            var promptKey = target.getAttribute("data-prompt-key");
            if (promptKey && S.settingsDraft) {
                S.settingsDraft[promptKey] = target.value;
                return;
            }
            if (!field) return;
            switch (field) {
                case "draft-title":
                    S.draft.title = target.value;
                    updatePublishSubmitState();
                    break;
                case "draft-body":
                    S.draft.body = target.value;
                    updatePublishSubmitState();
                    break;
                case "draft-tags":
                    S.tagInput = target.value;
                    break;
                case "draft-image-desc":
                    if (S.draft.image) S.draft.image.description = target.value;
                    break;
                case "dm-draft":
                    S.dmDraft = target.value;
                    break;
                case "comment-draft":
                    S.commentDraft = target.value;
                    updateDetailSendVisibility();
                    break;
                case "settings-probability":
                    if (S.settingsDraft) S.settingsDraft.sendToCharacterProbability = Number(target.value);
                    break;
                case "profile-nickname":
                    if (S.profileDraft) S.profileDraft.nickname = target.value;
                    break;
                case "profile-handle":
                    if (S.profileDraft) S.profileDraft.handle = target.value;
                    break;
                case "profile-ip":
                    if (S.profileDraft) S.profileDraft.ipLocation = target.value;
                    break;
                case "profile-signature":
                    if (S.profileDraft) S.profileDraft.signature = target.value;
                    break;
                default:
                    break;
            }
        });

        screen.addEventListener("keydown", function (event) {
            var target = event.target;
            if (!target || !target.getAttribute) return;
            if (target.getAttribute("data-field") === "dm-draft" && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                var thread = selectedDmThread();
                if (thread) handleSendDmMessage(thread);
            }
        });

        // 评论框聚焦/失焦 → 展开/收起编辑器
        screen.addEventListener("focusin", function (event) {
            var target = event.target;
            if (target && target.getAttribute && target.getAttribute("data-field") === "comment-draft") {
                if (!commentComposerExpanded()) {
                    S.commentComposerFocused = true;
                    renderScreens();
                    refocusCommentDraft();
                }
            }
        });
        screen.addEventListener("focusout", function (event) {
            var target = event.target;
            if (target && target.getAttribute && target.getAttribute("data-field") === "comment-draft") {
                window.setTimeout(function () {
                    S.commentComposerFocused = false;
                    if (!commentComposerExpanded()) renderScreens();
                }, 120);
            }
        });

        // 主滚动（我的页顶部栏显隐）
        var main = el("xhs-screen-main");
        if (main) main.addEventListener("scroll", handleMainScroll);

        // 视频滑动切换
        var video = el("xhs-screen-video");
        if (video) {
            video.addEventListener("wheel", handleVideoWheel, { passive: false });
            video.addEventListener("touchstart", handleVideoTouchStart, { passive: true });
            video.addEventListener("touchmove", handleVideoTouchMove, { passive: false });
            video.addEventListener("touchend", handleVideoTouchEnd);
            video.addEventListener("touchcancel", handleVideoTouchEnd);
        }

        // 发布图片选择
        var publishInput = el("xhs-publish-file-input");
        if (publishInput) {
            publishInput.addEventListener("change", function (event) {
                var file = event.target.files && event.target.files[0];
                event.target.value = "";
                handleImageChange(file);
            });
        }
        // 主页封面选择
        var coverInput = el("xhs-cover-file-input");
        if (coverInput) {
            coverInput.addEventListener("change", function (event) {
                var file = event.target.files && event.target.files[0];
                event.target.value = "";
                handleProfileCoverChange(file);
            });
        }
    }
    function updateDetailSendVisibility() {
        var screen = el("xiaohongshu-screen");
        if (!screen) return;
        var sendBtn = screen.querySelector(".xhs-detail-send-btn");
        if (sendBtn) {
            var shouldShow = !commentComposerExpanded() && Boolean(S.commentDraft.trim());
            sendBtn.style.display = shouldShow ? "" : "none";
            if (shouldShow) sendBtn.disabled = S.busy !== "idle";
        }
    }

    // ============================================================
    // 初始化
    // ============================================================
    function reloadState() {
        S.state = loadXiaohongshuState();
        S.characters = getXiaohongshuCharacterList();
        var coverKey = S.state.profile.coverImageAssetId;
        if (coverKey && !S.imageMap[coverKey]) {
            var stored = loadCoverFromStorage();
            if (stored) S.imageMap[coverKey] = stored;
        }
        S.bilingualExpanded = !S.state.settings.collapseBilingualTranslation;
    }
    function init() {
        reloadState();
        bindEvents();
        refresh();
        ensureImages();
    }

    // ============================================================
    // 对外暴露（调试/联调用）
    // ============================================================
    window.XhsApp = {
        reload: function () { reloadState(); refresh(); ensureImages(); },
        refresh: function () { refresh(); },
        getState: function () { return S.state; },
        openNote: function (noteId) { openNote(noteId); },
        showTab: function (tab) {
            S.selectedTab = tab;
            refresh();
        },
        busy: function () { return S.busy; }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
