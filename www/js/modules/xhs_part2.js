
  // ------------------------------------------------------------
  // 双语文本（lib/bilingual-text.ts + CheckPhoneBilingualText 移植）
  // 展开状态按实例 key 记录（React 里是组件内部 state，重渲染后保留）。
  // ------------------------------------------------------------

  function xhsContainsChinese(text) {
    return /[\u3400-\u9fff]/.test(text);
  }

  function xhsNormalizeBilingualText(text) {
    if (typeof normalizeBilingualTextInput === "function") return normalizeBilingualTextInput(text);
    return String(text == null ? "" : text).replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  function xhsSplitSegmentedBilingualLine(line) {
    const parts = line.split("|").map(part => part.trim());
    if (parts.length < 2 || parts.some(part => !part)) return null;

    if (parts.length === 3) {
      const originalLabel = parts[0];
      const mixedLabelAndOriginal = parts[1];
      const translatedValue = parts[2];
      const colonIndex = mixedLabelAndOriginal.search(/[:：]/);
      if (colonIndex > 0 && xhsContainsChinese(translatedValue) && !xhsContainsChinese(originalLabel)) {
        const translatedLabel = mixedLabelAndOriginal.slice(0, colonIndex + 1).trim();
        const originalValue = mixedLabelAndOriginal.slice(colonIndex + 1).trim();
        if (translatedLabel && originalValue && xhsContainsChinese(translatedLabel)) {
          return {
            original: `${originalLabel}: ${originalValue}`,
            translated: `${translatedLabel} ${translatedValue}`,
          };
        }
      }
    }

    if (parts.length % 2 !== 0) return null;

    const originalParts = [];
    const translatedParts = [];
    let hasNonChineseOriginal = false;

    for (let index = 0; index < parts.length; index += 2) {
      const original = parts[index];
      const translated = parts[index + 1];
      if (!translated || !xhsContainsChinese(translated)) return null;
      if (!xhsContainsChinese(original)) hasNonChineseOriginal = true;
      originalParts.push(original);
      translatedParts.push(translated);
    }

    if (!hasNonChineseOriginal) return null;
    return {
      original: originalParts.join(" | "),
      translated: translatedParts.join(" | "),
    };
  }

  function xhsSplitBilingualText(text) {
    if (typeof splitBilingualText === "function") return splitBilingualText(text);
    const trimmed = xhsNormalizeBilingualText(text).trim();
    if (!trimmed || trimmed.includes("```") || /<script\b|<style\b/i.test(trimmed)) return null;
    const firstPipe = trimmed.indexOf("|");
    if (firstPipe <= 0) return null;
    if (firstPipe === trimmed.lastIndexOf("|")) {
      const original = trimmed.slice(0, firstPipe).trim();
      const translated = trimmed.slice(firstPipe + 1).trim();
      if (!original || !translated) return null;
      if (!xhsContainsChinese(translated)) return null;
      return { original, translated };
    }
    if (trimmed.includes("\n")) {
      const originalLines = [];
      const translatedLines = [];
      let bilingualLineCount = 0;

      trimmed.split("\n").forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
          originalLines.push("");
          translatedLines.push("");
          return;
        }
        const linePipe = line.indexOf("|");
        if (linePipe > 0 && linePipe === line.lastIndexOf("|")) {
          const lineOriginal = line.slice(0, linePipe).trim();
          const lineTranslated = line.slice(linePipe + 1).trim();
          if (!lineOriginal || !lineTranslated || !xhsContainsChinese(lineTranslated)) {
            originalLines.length = 0;
            originalLines.push(null);
            return;
          }
          originalLines.push(lineOriginal);
          translatedLines.push(lineTranslated);
          bilingualLineCount += 1;
          return;
        }
        if (line.includes("|")) {
          const segmented = xhsSplitSegmentedBilingualLine(line);
          if (!segmented) {
            originalLines.length = 0;
            originalLines.push(null);
            return;
          }
          originalLines.push(segmented.original);
          translatedLines.push(segmented.translated);
          bilingualLineCount += 1;
          return;
        }
        originalLines.push(line);
        translatedLines.push(line);
      });

      if (originalLines.includes(null)) return null;
      if (bilingualLineCount === 0) return null;
      const original = originalLines.join("\n").trim();
      const translated = translatedLines.join("\n").trim();
      if (!original || !translated || !xhsContainsChinese(translated)) return null;
      return { original, translated };
    }
    return xhsSplitSegmentedBilingualLine(trimmed);
  }

  function xhsCollapseBilingualTranslation() {
    const settings = xhsData && xhsData.settings;
    if (settings && typeof settings.collapseBilingualTranslation === "boolean") {
      return settings.collapseBilingualTranslation;
    }
    return true;
  }

  const bilingualExpandedMap = new Map();

  function xhsBilingual(text, tone, variant, className, key) {
    const normalized = xhsNormalizeBilingualText(text);
    const bilingual = xhsSplitBilingualText(normalized);
    if (!bilingual) {
      return `<span${className ? ` class="${xhsEscapeHtml(className)}"` : ""}>${xhsEscapeHtml(normalized)}</span>`;
    }
    const mapKey = key || `${tone || "xiaohongshu"}:${variant || "block"}:${normalized}`;
    const expanded = bilingualExpandedMap.has(mapKey)
      ? bilingualExpandedMap.get(mapKey)
      : !xhsCollapseBilingualTranslation();
    let html = `<span class="cp-bilingual cp-bilingual--${tone || "xiaohongshu"} cp-bilingual--${variant || "block"}${className ? ` ${xhsEscapeHtml(className)}` : ""}`;
    html += `" data-xhs-bi-key="${xhsEscapeHtml(mapKey)}" data-xhs-bi-translated="${xhsEscapeHtml(bilingual.translated)}">`;
    html += `<span class="cp-bilingual-original">${xhsEscapeHtml(bilingual.original)}</span>`;
    html += `<span class="cp-bilingual-toggle" role="button" tabindex="0" data-xhs-action="bilingual-toggle" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "收起中文" : "中文"}</span>`;
    if (expanded && variant === "inline") {
      html += `<span class="cp-bilingual-inline-separator" aria-hidden="true"> </span><span class="cp-bilingual-translation">${xhsEscapeHtml(bilingual.translated)}</span>`;
    } else if (expanded && variant === "block") {
      html += `<span class="cp-bilingual-divider" aria-hidden="true"></span><span class="cp-bilingual-translation">${xhsEscapeHtml(bilingual.translated)}</span>`;
    }
    html += "</span>";
    return html;
  }

  function xhsToggleBilingual(btn) {
    const wrap = btn.closest(".cp-bilingual");
    if (!wrap) return;
    const key = wrap.getAttribute("data-xhs-bi-key") || "";
    const variant = wrap.className.indexOf("cp-bilingual--inline") >= 0 ? "inline" : "block";
    const current = bilingualExpandedMap.has(key)
      ? bilingualExpandedMap.get(key)
      : !xhsCollapseBilingualTranslation();
    const next = !current;
    bilingualExpandedMap.set(key, next);
    if (bilingualExpandedMap.size > 400) bilingualExpandedMap.clear();
    const separator = variant === "inline"
      ? wrap.querySelector(".cp-bilingual-inline-separator")
      : wrap.querySelector(".cp-bilingual-divider");
    const translation = wrap.querySelector(".cp-bilingual-translation");
    if (next) {
      if (!separator) {
        const sepHtml = variant === "inline"
          ? '<span class="cp-bilingual-inline-separator" aria-hidden="true"> </span>'
          : '<span class="cp-bilingual-divider" aria-hidden="true"></span>';
        btn.insertAdjacentHTML("afterend", sepHtml);
      }
      if (!translation) {
        const span = document.createElement("span");
        span.className = "cp-bilingual-translation";
        span.textContent = wrap.getAttribute("data-xhs-bi-translated") || "";
        wrap.appendChild(span);
      }
      btn.setAttribute("aria-expanded", "true");
      btn.textContent = "收起中文";
    } else {
      if (separator) separator.remove();
      if (translation) translation.remove();
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "中文";
    }
  }

  function xhsGetPlainText(text) {
    if (typeof getXhsPlainText === "function") return getXhsPlainText(text);
    const normalized = xhsNormalizeBilingualText(text);
    const parts = xhsSplitBilingualText(normalized);
    return parts ? parts.original : normalized;
  }

  // ------------------------------------------------------------
  // 头像 / 图标 / 框样式
  // ------------------------------------------------------------

  function xhsAvatar(className, src, name) {
    const isDefaultAvatar = Boolean(src && String(src).indexOf(XHS_DEFAULT_AVATAR_PREFIX) === 0);
    return `<div class="${className}${isDefaultAvatar ? " xhs-default-avatar" : ""}">` +
      (src
        ? `<img src="${xhsEscapeHtml(src)}" alt="" />`
        : `<span>${xhsEscapeHtml((name || "?").slice(0, 1))}</span>`) +
      "</div>";
  }

  function xhsDislikeIcon() {
    return '<svg class="xhs-comment-dislike-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" /><path d="M8.3 9.7h1.9" /><path d="M13.8 9.7h1.9" /><path d="M8.9 15.5c1.7-.85 4.5-.85 6.2 0" /></svg>';
  }

  const XHS_OVERVIEW_GLYPH_PATHS = {
    heart: "M12 21.2c-.35 0-.7-.13-.98-.39C4.88 15.28 2 12.67 2 8.72 2 5.58 4.47 3.1 7.58 3.1c1.75 0 3.43.82 4.42 2.11.99-1.29 2.67-2.11 4.42-2.11C19.53 3.1 22 5.58 22 8.72c0 3.95-2.88 6.56-9.02 12.09-.28.26-.63.39-.98.39Z",
    bookmark: "M6.35 4.55c0-1.1.9-2 2-2h7.3c1.1 0 2 .9 2 2v16.1c0 .7-.8 1.1-1.36.68L12 18.1l-4.29 3.23a.82.82 0 0 1-1.36-.68V4.55Z",
    user: "M12 11.2a4.55 4.55 0 1 0 0-9.1 4.55 4.55 0 0 0 0 9.1ZM4.15 21.06c0-4.13 3.52-7.48 7.85-7.48s7.85 3.35 7.85 7.48c0 .54-.39.99-.92 1.07-2.12.31-4.43.47-6.93.47s-4.81-.16-6.93-.47a1.08 1.08 0 0 1-.92-1.07Z",
  };

  function xhsOverviewGlyph(type) {
    if (type === "chat") {
      return '<svg class="cp-xhs-overview-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.15c5.54 0 10 3.82 10 8.55s-4.46 8.55-10 8.55c-1.11 0-2.18-.15-3.18-.44l-3.54 1.56a.75.75 0 0 1-1.02-.88l.9-3.3C3.22 15.69 2 13.56 2 11.7c0-4.73 4.46-8.55 10-8.55Z" /><circle cx="8.8" cy="11.45" r="1.18" fill="#fff" /><circle cx="15.2" cy="11.45" r="1.18" fill="#fff" /></svg>';
    }
    return `<svg class="cp-xhs-overview-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${XHS_OVERVIEW_GLYPH_PATHS[type] || XHS_OVERVIEW_GLYPH_PATHS.heart}" /></svg>`;
  }

  function xhsImageFrameStyle(width, height) {
    if (!width || !height || width <= 0 || height <= 0) return DEFAULT_XHS_IMAGE_FRAME_STYLE;
    const heightRatio = Math.min(height / width, XHS_MAX_IMAGE_HEIGHT_RATIO);
    return `aspect-ratio: 1 / ${heightRatio.toFixed(4)}`;
  }

  function xhsGetNoteCardVariant(note) {
    const textLength = xhsGetPlainText(note.body).length + xhsGetPlainText(note.title).length;
    if (textLength > 95) return "tall";
    if (textLength > 54) return "regular";
    return "compact";
  }

  function xhsGetIconImageFrameStyle(note) {
    return ICON_XHS_IMAGE_FRAME_STYLES[xhsGetNoteCardVariant(note)];
  }

  function xhsGetGenderClassName(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "xhs-profile-gender xhs-profile-gender--female";
    if (normalized.includes("女") || normalized.includes("♀") || normalized.includes("female")) {
      return "xhs-profile-gender xhs-profile-gender--female";
    }
    if (normalized.includes("男") || normalized.includes("♂") || normalized.includes("male")) {
      return "xhs-profile-gender xhs-profile-gender--male";
    }
    return "xhs-profile-gender";
  }

  // ------------------------------------------------------------
  // 角色辅助（mie：角色来自 db.characters）
  // ------------------------------------------------------------

  function xhsCharacters() {
    if (typeof getXiaohongshuCharacterList === "function") {
      const list = getXiaohongshuCharacterList();
      return Array.isArray(list) ? list : [];
    }
    if (typeof db !== "undefined" && db && Array.isArray(db.characters)) return db.characters;
    return [];
  }

  function xhsResolveCharacterDisplayName(character) {
    if (typeof resolveCharacterXiaohongshuDisplayName === "function") {
      return resolveCharacterXiaohongshuDisplayName(character);
    }
    if (!character) return "";
    return String(character.xiaohongshuName || character.remarkName || character.realName || character.name || "").trim();
  }

  function xhsIsCharacterAuthor(authorName, character, displayName) {
    if (typeof isCharacterXiaohongshuAuthor === "function") {
      return isCharacterXiaohongshuAuthor(authorName, displayName, character.name);
    }
    const normalized = String(authorName || "").trim();
    if (!normalized) return false;
    return [displayName.trim(), character.name.trim()].filter(Boolean).includes(normalized);
  }

  function xhsCreateCharacterPost(character, activity) {
    if (!activity || !activity.post) return null;
    const now = new Date().toISOString();
    const displayName = xhsResolveCharacterDisplayName(character);
    const noteId = `xhs_char_note_${character.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const comments = (activity.post.comments || [])
      .filter(comment => comment.text)
      .map((comment, index) => {
        const parsedReplyIndex = /^.*_comment_(\d+)$/.exec(comment.replyToCommentId || "");
        const isCharacterAuthor = xhsIsCharacterAuthor(comment.authorName, character, displayName);
        const created = makeXiaohongshuComment({
          noteId,
          authorType: isCharacterAuthor ? "character" : "npc",
          authorId: isCharacterAuthor ? character.id : makeXiaohongshuNpcId(comment.authorName),
          authorName: isCharacterAuthor ? displayName : comment.authorName,
          text: comment.text,
          replyTo: comment.replyTo,
          replyToCommentId: parsedReplyIndex ? `${noteId}_comment_${Number(parsedReplyIndex[1])}` : comment.replyToCommentId,
        });
        created.id = `${noteId}_comment_${index + 1}`;
        return created;
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
      comments,
      imageDescription: activity.post.type === "post" ? activity.post.imageDescription : undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  function orderCommentsForDisplay(comments) {
    const byId = new Map(comments.map(comment => [comment.id, comment]));
    const indexById = new Map(comments.map((comment, index) => [comment.id, index]));
    const childrenByParent = new Map();
    const childIds = new Set();

    function wouldCreateCycle(commentId, parentId) {
      const seen = new Set([commentId]);
      let currentId = parentId;
      while (currentId) {
        if (seen.has(currentId)) return true;
        seen.add(currentId);
        const parent = byId.get(currentId);
        currentId = parent ? parent.replyToCommentId || "" : "";
      }
      return false;
    }

    comments.forEach((comment) => {
      const parentId = comment.replyToCommentId;
      if (!parentId || !byId.has(parentId) || wouldCreateCycle(comment.id, parentId)) return;
      childIds.add(comment.id);
      const children = childrenByParent.get(parentId) || [];
      children.push(comment);
      childrenByParent.set(parentId, children);
    });

    const ordered = [];
    const visited = new Set();

    function collectDescendants(id, acc) {
      (childrenByParent.get(id) || []).forEach((child) => {
        if (visited.has(child.id)) return;
        visited.add(child.id);
        acc.push(child);
        collectDescendants(child.id, acc);
      });
    }

    comments.forEach((comment) => {
      if (childIds.has(comment.id) || visited.has(comment.id)) return;
      visited.add(comment.id);
      ordered.push(comment);
      const descendants = [];
      collectDescendants(comment.id, descendants);
      descendants.sort((a, b) => (indexById.get(a.id) || 0) - (indexById.get(b.id) || 0));
      ordered.push(...descendants);
    });

    comments.forEach((comment) => {
      if (!visited.has(comment.id)) {
        visited.add(comment.id);
        ordered.push(comment);
      }
    });
    return ordered;
  }

  function collectCommentThreadIds(comments, rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      comments.forEach((comment) => {
        if (comment.replyToCommentId && ids.has(comment.replyToCommentId) && !ids.has(comment.id)) {
          ids.add(comment.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function noteHasUserComment(note) {
    return note.comments.some(comment => comment.authorType === "user");
  }

  function findAddedCharacterComment(before, after, character) {
    const beforeIds = new Set(before.comments.map(comment => comment.id));
    return after.comments.find(comment =>
      !beforeIds.has(comment.id)
      && comment.authorType === "character"
      && comment.authorId === character.id
    ) || null;
  }

  // ------------------------------------------------------------
  // 记忆事件辅助（mie 无 incrementEventCounter/summarizer，防御性调用）
  // ------------------------------------------------------------

  function touchCharacterMemory(character) {
    if (typeof incrementEventCounter === "function") {
      try { incrementEventCounter(character.id); } catch (err) { console.warn("[Xiaohongshu] event counter failed:", err); }
    }
    if (typeof maybeRunSummarization === "function") {
      Promise.resolve()
        .then(() => maybeRunSummarization(character.id, character.name))
        .catch(err => console.warn("[Xiaohongshu] Summarization check failed:", err));
    }
  }

  function recordCharacterThreadCommentEvents(character, sourceNote, appliedNote, threadComments) {
    threadComments
      .filter(comment =>
        comment.authorType === "character"
        && comment.authorId === character.id
        && comment.text.trim()
        && (comment.replyToCommentId || comment.replyTo)
      )
      .forEach((comment) => {
        const targetComment = comment.replyToCommentId
          ? appliedNote.comments.find(item => item.id === comment.replyToCommentId)
          : undefined;
        recordXiaohongshuReplyEvent({
          characterId: character.id,
          characterName: character.name,
          note: sourceNote,
          comment,
          targetComment,
        });
      });
  }

  // ------------------------------------------------------------
  // 关注关系 / 账号辅助
  // ------------------------------------------------------------

  function makeCharacterAccount(character) {
    return {
      type: "character",
      id: character.id,
      name: xhsResolveCharacterDisplayName(character),
      avatar: character.avatar || undefined,
      followedAt: new Date().toISOString(),
    };
  }

  function makeAccountFromNote(note) {
    if (note.source === "user") return null;
    return {
      type: note.source,
      id: note.authorId || (note.source === "npc" ? makeXiaohongshuNpcId(note.authorName) : note.source),
      name: note.authorName,
      followedAt: new Date().toISOString(),
    };
  }

  function isFollowingAccount(account) {
    if (!account) return false;
    const key = accountKey(account);
    return xhsData.socialGraph.following.some(item => accountKey(item) === key);
  }

  function addFollowersToState(current, accounts, note) {
    const existing = new Set(current.socialGraph.followers.map(accountKey));
    const added = dedupeAccounts(accounts.filter(account => account.name.trim()))
      .filter(account => !existing.has(accountKey(account)))
      .map(account => ({ ...account, followedAt: account.followedAt || new Date().toISOString() }));
    if (added.length === 0) return { next: current, added };
    const notifications = added.map(account => makeXiaohongshuNotification({
      type: "follow",
      noteId: note ? note.id : undefined,
      actorName: account.name,
      text: `${account.name} 关注了你`,
      thumbnailText: note ? note.title : undefined,
      unread: true,
    }));
    return {
      added,
      next: {
        ...current,
        profile: {
          ...current.profile,
          followerCount: current.socialGraph.followers.length + added.length,
        },
        socialGraph: {
          ...current.socialGraph,
          followers: [...added, ...current.socialGraph.followers],
        },
        notifications: [...notifications, ...current.notifications],
      },
    };
  }

  // ------------------------------------------------------------
  // 通知辅助
  // ------------------------------------------------------------

  function getNotificationNote(notice) {
    if (!notice.noteId) return null;
    return xhsData.notes.find(note => note.id === notice.noteId) || null;
  }

  function renderNotificationThumbnail(notice) {
    const note = getNotificationNote(notice);
    if (note && note.imageDataUrl) {
      return `<img src="${xhsEscapeHtml(note.imageDataUrl)}" alt="" />`;
    }
    return `<span>${xhsEscapeHtml(xhsGetPlainText(notice.thumbnailText || (note ? note.title : "") || "笔记"))}</span>`;
  }

  function notificationEngagementCount(notice) {
    if (notice.type !== "like" && notice.type !== "save") return 1;
    const parsed = typeof parseNotificationCountFromText === "function"
      ? parseNotificationCountFromText(notice.text)
      : parseNotificationCountFromTextLocal(notice.text);
    return Math.max(1, Math.round(notice.count == null ? parsed : notice.count));
  }

  function notificationUnreadWeight(notice) {
    if (!notice.unread) return 0;
    return notificationEngagementCount(notice);
  }

  function notificationActorLabel(notice) {
    if (notice.type === "like" || notice.type === "save") {
      const match = notice.text.match(/^(.+?)等\s*[0-9][\d.,，]*(?:\.\d+)?\s*(?:[kKwW万千])?\s*人/);
      return (match && match[1] && match[1].trim()) || notice.actorName;
    }
    return notice.actorName;
  }

  function formatNotificationAction(notice) {
    if (notice.type === "like") {
      const count = notificationEngagementCount(notice);
      return count > 1 ? `等${formatCount(count)}人赞了你的笔记` : "赞了你的笔记";
    }
    if (notice.type === "save") {
      const count = notificationEngagementCount(notice);
      return count > 1 ? `等${formatCount(count)}人收藏了你的笔记` : "收藏了你的笔记";
    }
    if (notice.type === "follow") return "关注了你";
    if (notice.type === "comment") return "评论了你的笔记";
    return notice.text;
  }

  function formatNotificationPreview(notice) {
    if (notice.type !== "comment") return "";
    return notice.text
      .replace(new RegExp(`^${notice.actorName}\\s*(评论了你的笔记|回复了你)[:：]?\\s*`), "")
      .trim();
  }

  // ------------------------------------------------------------
  // 身份 / 头像解析
  // ------------------------------------------------------------

  function xhsResolveUserIdentity() {
    if (typeof resolveUserIdentity === "function") {
      try {
        const scoped = resolveUserIdentity(undefined, "xiaohongshu");
        return scoped || resolveUserIdentity();
      } catch (err) { /* 忽略，走本地兜底 */ }
    }
    const nickname = (xhsData && xhsData.profile && xhsData.profile.nickname) || "我";
    return { id: "user", name: nickname, avatarUrl: "" };
  }

  function resolveAuthorAvatar(source, authorId, authorName, seed) {
    const derived = xhsDerived;
    if (source === "user") return derived.userAvatar;
    if (source === "character") {
      return derived.characterAvatarMap.get(authorId) || pickDefaultAvatar(`character:${authorId || authorName}`);
    }
    return pickDefaultAvatar(`npc:${authorName || authorId || seed}`);
  }

  function getNoteAvatar(note) {
    return resolveAuthorAvatar(note.source, note.authorId, note.authorName, note.id);
  }

  function getCommentAvatar(comment) {
    return resolveAuthorAvatar(comment.authorType, comment.authorId, comment.authorName, comment.id);
  }

  function getNotificationAvatar(actorName, seed) {
    const character = xhsCharacters().find(item =>
      item.name === actorName || xhsResolveCharacterDisplayName(item) === actorName
    );
    if (character && character.avatar) return character.avatar;
    const identity = xhsDerived.userIdentity;
    if (actorName === xhsData.profile.nickname || (identity && actorName === identity.name)) {
      return xhsDerived.userAvatar;
    }
    return pickDefaultAvatar(`notice:${actorName || seed}`);
  }

  // ------------------------------------------------------------
  // 错误状态
  // ------------------------------------------------------------

  function clearErrorState() {
    xhsState.error = "";
    xhsState.debugErrorTitle = "暂时无法完成小红书操作。";
    xhsState.debugRawOutput = "";
    xhsState.debugParseError = "";
    xhsState.showDebugReason = false;
  }

  function handleGenerationError(err, title = "暂时无法完成小红书操作。") {
    const message = err instanceof Error ? err.message : String(err);
    xhsState.debugErrorTitle = title;
    xhsState.error = message;
    if (typeof XiaohongshuGenerationError === "function" && err instanceof XiaohongshuGenerationError) {
      xhsState.debugRawOutput = err.rawOutput || "";
      xhsState.debugParseError = err.parseError || "";
    } else {
      xhsState.debugRawOutput = "";
      xhsState.debugParseError = message;
    }
    xhsNotice(message);
  }

  // ------------------------------------------------------------
  // 派生数据（等价于 TSX 的 useMemo 集合；每次渲染前重算）
  // ------------------------------------------------------------

  let xhsDerived = null;

  function xhsComputeDerived() {
    const state = xhsData;
    const characters = xhsCharacters();
    const identity = xhsResolveUserIdentity();
    const userAvatar = (identity && identity.avatarUrl) || pickDefaultAvatar(`user:${(identity && identity.id) || state.profile.nickname}`);

    const dmNotifications = state.notifications.filter(item => item.type === "dm");
    const groups = new Map();
    dmNotifications.forEach((notice) => {
      const threadName = (notice.threadName && notice.threadName.trim()) || notice.actorName.trim() || "小红书用户";
      const threadId = (notice.threadId && notice.threadId.trim()) || `dm:${threadName}`;
      const bucket = groups.get(threadId) || [];
      bucket.push(notice);
      groups.set(threadId, bucket);
    });
    const dmThreads = Array.from(groups.entries())
      .flatMap(([threadId, notifications]) => {
        const sorted = [...notifications].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const latest = sorted[sorted.length - 1];
        if (!latest) return [];
        const incoming = sorted.find(item => item.direction !== "outgoing");
        const actorName = latest.threadName || (incoming ? incoming.actorName : "") || latest.actorName || "小红书用户";
        return [{
          id: threadId,
          actorName,
          notifications: sorted,
          latest,
          unreadCount: sorted.reduce((total, item) => total + notificationUnreadWeight(item), 0),
        }];
      })
      .sort((a, b) => Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt));

    const selectedNote = xhsState.selectedNoteId
      ? state.notes.find(note => note.id === xhsState.selectedNoteId) || null
      : null;
    const selectedDmThread = xhsState.selectedDmThreadId
      ? dmThreads.find(thread => thread.id === xhsState.selectedDmThreadId) || null
      : null;
    const selectedAuthorAccount = selectedNote ? makeAccountFromNote(selectedNote) : null;
    const selectedAuthorFollowing = isFollowingAccount(selectedAuthorAccount);

    const hiddenFeedNoteIds = new Set(state.feedHiddenNoteIds);
    const followedAccountKeys = new Set(state.socialGraph.following.map(accountKey));
    const sortByCreatedAtDesc = (a, b) => b.createdAt.localeCompare(a.createdAt);
    const discoverNotes = state.notes
      .filter(note => note.type === "post" && note.feedScope !== "nearby" && !hiddenFeedNoteIds.has(note.id))
      .sort(sortByCreatedAtDesc);
    const nearbyNotes = state.notes
      .filter(note => note.type === "post" && note.feedScope === "nearby" && !hiddenFeedNoteIds.has(note.id))
      .sort(sortByCreatedAtDesc);
    const followedNotes = state.notes
      .filter(note => note.source !== "user" && !hiddenFeedNoteIds.has(note.id) && followedAccountKeys.has(noteAuthorKey(note)))
      .sort(sortByCreatedAtDesc);
    const videoNotes = state.notes
      .filter(note => note.type === "video" && !hiddenFeedNoteIds.has(note.id))
      .sort(sortByCreatedAtDesc);
    const activeHomeNotes = xhsState.homeFeedTab === "follow"
      ? followedNotes
      : xhsState.homeFeedTab === "video" ? videoNotes : discoverNotes;
    const activeVideoNoteIndex = videoNotes.findIndex(note => note.id === xhsState.selectedNoteId);
    const activeVideoCaption = selectedNote && selectedNote.type === "video" ? selectedNote.body : "";

    const myNotes = state.notes.filter(note => note.source === "user").sort(sortByCreatedAtDesc);
    let profileNotes;
    if (xhsState.profileTab === "notes") {
      profileNotes = myNotes;
    } else {
      let ids = [];
      if (xhsState.profileTab === "comments") {
        ids = [
          ...state.userInteractions.commentedNoteIds,
          ...state.notes.filter(note => note.comments.some(comment => comment.authorType === "user")).map(note => note.id),
        ];
      } else if (xhsState.profileTab === "saved") {
        ids = [
          ...state.userInteractions.savedNoteIds,
          ...state.notes.filter(note => note.saved).map(note => note.id),
        ];
      } else if (xhsState.profileTab === "liked") {
        ids = [
          ...state.userInteractions.likedNoteIds,
          ...state.notes.filter(note => note.liked).map(note => note.id),
        ];
      }
      const idSet = new Set(ids);
      profileNotes = state.notes
        .filter(note => idSet.has(note.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    const characterAvatarMap = new Map();
    characters.forEach((character) => {
      if (character.avatar) characterAvatarMap.set(character.id, character.avatar);
    });
    const characterById = new Map(characters.map(character => [character.id, character]));
    const followedMentionCharacters = state.socialGraph.following
      .filter(account => account.type === "character")
      .map((account) => {
        const character = characterById.get(account.id);
        if (!character) return null;
        return {
          account,
          character,
          displayName: account.name || xhsResolveCharacterDisplayName(character),
          avatar: account.avatar || character.avatar || "",
        };
      })
      .filter(Boolean);

    const profileCoverImage = state.profile.coverImageDataUrl || "";
    const profileCoverStyle = profileCoverImage
      ? `background-image: linear-gradient(180deg, rgba(0,0,0,0.34), rgba(0,0,0,0.54)), url("${profileCoverImage.replace(/"/g, "%22")}");`
      : "";
    const profileStats = {
      followingCount: state.socialGraph.following.length,
      followerCount: state.socialGraph.followers.length,
      likedAndSavedCount: state.notes
        .filter(note => note.source === "user")
        .reduce((total, note) => total + note.likeCount + note.saveCount, 0),
    };

    const unreadCount = state.notifications.reduce((total, item) => total + notificationUnreadWeight(item), 0);
    const engagementUnreadCount = state.notifications.reduce((total, item) => {
      if (item.type !== "like" && item.type !== "save") return total;
      return total + notificationUnreadWeight(item);
    }, 0);
    const followUnreadCount = state.notifications.filter(item => item.unread && item.type === "follow").length;
    const commentUnreadCount = state.notifications.filter(item => item.unread && item.type === "comment").length;

    const selectedMessageNotifications = xhsState.messagePanel
      ? state.notifications.filter(item => xhsState.messagePanel === "engagement"
        ? item.type === "like" || item.type === "save"
        : item.type === xhsState.messagePanel)
      : [];
    const selectedMessagePanelLabel = xhsState.messagePanel === "engagement"
      ? "点赞和收藏"
      : xhsState.messagePanel === "follow" ? "新增关注" : xhsState.messagePanel === "comment" ? "评论" : "";
    const selectedMessagePanelTitle = xhsState.messagePanel === "engagement" ? "收到的赞和收藏" : selectedMessagePanelLabel;
    const isMessageSubpage = xhsState.selectedTab === "messages" && (Boolean(xhsState.messagePanel) || Boolean(selectedDmThread));

    const derived = {
      characters,
      userIdentity: identity,
      userAvatar,
      dmNotifications,
      dmThreads,
      selectedNote,
      selectedDmThread,
      selectedAuthorAccount,
      selectedAuthorFollowing,
      hiddenFeedNoteIds,
      followedAccountKeys,
      discoverNotes,
      nearbyNotes,
      followedNotes,
      videoNotes,
      activeHomeNotes,
      activeVideoNoteIndex,
      activeVideoCaption,
      myNotes,
      profileNotes,
      homeColumns: splitColumns(activeHomeNotes),
      nearbyColumns: splitColumns(nearbyNotes),
      profileColumns: splitColumns(profileNotes),
      characterAvatarMap,
      followedMentionCharacters,
      profileCoverStyle,
      profileStats,
      unreadCount,
      engagementUnreadCount,
      followUnreadCount,
      commentUnreadCount,
      selectedMessageNotifications,
      selectedMessagePanelLabel,
      selectedMessagePanelTitle,
      isMessageSubpage,
    };
    xhsDerived = derived;
    return derived;
  }

  function findMentionCharacterInText(text) {
    return [...xhsDerived.followedMentionCharacters]
      .sort((left, right) => right.displayName.length - left.displayName.length)
      .find(item => text.includes(`@${item.displayName}`))
      ?.character;
  }
