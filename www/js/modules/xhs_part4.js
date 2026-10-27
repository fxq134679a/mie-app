
  // ------------------------------------------------------------
  // 弹层（发布 / 设置 / 编辑资料 / 删除确认 / 刷新清空确认）
  // ------------------------------------------------------------

  function renderSheets() {
    let html = "";
    if (xhsState.composeOpen) html += renderComposeSheet();
    if (xhsState.settingsOpen) html += renderSettingsSheet();
    if (xhsState.profileOpen) html += renderProfileEditSheet();
    if (xhsState.deleteTarget) html += renderDeleteSheet();
    if (xhsState.pendingFeedAction) html += renderFeedActionSheet();
    return html;
  }

  function renderToggle(checked, action) {
    return `<button type="button" role="switch" aria-checked="${checked ? "true" : "false"}" class="ui-toggle" data-ui="toggle" data-xhs-action="${action}"${checked ? ' data-checked=""' : ""}><span class="ui-toggle-knob"></span></button>`;
  }

  function renderComposeSheet() {
    const draft = xhsState.draft;
    const image = draft.image || {};
    let leftHtml;
    if (image.dataUrl === undefined && image.description === undefined) {
      leftHtml = `
        <div class="xhs-image-upload-area">
          <div class="xhs-publish-placeholder">
            <span class="xhs-publish-placeholder-icon" style="color:#bbb">${xhsIcon("image-plus", 42, 1.5)}</span>
            <div class="xhs-placeholder-actions">
              <button type="button" data-xhs-action="publish-pick-image">上传图片</button>
              <button type="button" data-xhs-action="publish-text-mode">描述图片</button>
            </div>
          </div>
          <input type="file" accept="image/*" hidden data-xhs-role="publish-image-input" />
        </div>`;
    } else if (image.dataUrl) {
      leftHtml = `
        <div
          class="xhs-image-upload-area is-image-preview"
          style="${xhsImageFrameStyle(image.width, image.height)}"
          data-xhs-action="publish-pick-image"
        >
          <img src="${xhsEscapeHtml(image.dataUrl)}" alt="Preview" class="xhs-publish-preview-img" />
          <input type="file" accept="image/*" hidden data-xhs-role="publish-image-input" />
        </div>
        <button type="button" class="xhs-upload-change-btn" data-xhs-action="publish-clear-image">取消并重新选择</button>`;
    } else {
      leftHtml = `
        <div class="xhs-image-upload-area is-text-mode">
          <div class="xhs-text-image-preview">${xhsEscapeHtml((image.description || "").trim() || "在此区域下方输入描述\n即可生成文字图片")}</div>
        </div>
        <div class="xhs-publish-field">
          <label>文字图片内容</label>
          <textarea
            placeholder="输入文字描述..."
            data-xhs-role="publish-image-desc"
          >${xhsEscapeHtml(image.description || "")}</textarea>
        </div>
        <button type="button" class="xhs-upload-change-btn" data-xhs-action="publish-clear-image">取消并重新选择</button>`;
    }
    return `
      <div class="xhs-modal-backdrop" data-xhs-backdrop="compose">
        <section class="xhs-publish-sheet" data-xhs-stop>
          <header>
            <strong>发布新笔记</strong>
            <button type="button" class="xhs-sheet-close-btn" data-xhs-action="close-compose" aria-label="关闭">×</button>
          </header>
          <div class="xhs-publish-content">
            <div class="xhs-publish-left">${leftHtml}</div>
            <div class="xhs-publish-right">
              <input class="xhs-publish-title-input" placeholder="填写标题会有更多赞哦~" data-xhs-role="publish-title" value="${xhsEscapeHtml(draft.title)}" />
              <textarea class="xhs-publish-body-input" placeholder="添加正文，和大家分享你的见闻..." data-xhs-role="publish-body">${xhsEscapeHtml(draft.body)}</textarea>
              <div class="xhs-publish-tag-input">
                <span>#</span>
                <input data-xhs-role="publish-tag" value="${xhsEscapeHtml(xhsState.tagInput)}" placeholder="添加标签，用空格或逗号分隔" />
              </div>
              <div class="xhs-publish-actions">
                <button type="button" class="xhs-publish-submit-btn" data-xhs-action="publish-submit" ${xhsState.busy !== "idle" || (!draft.title.trim() && !draft.body.trim()) ? "disabled" : ""}>
                  ${xhsState.busy === "publish" ? xhsIcon("loader-2", 18, 2, "cp-spin") : xhsIcon("send", 18)}
                  发布笔记
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>`;
  }

  function renderSettingsSheet() {
    const draft = xhsState.settingsDraft || {};
    const characters = xhsDerived.characters;
    const participantsHtml = characters.length === 0
      ? `<span class="xhs-settings-edit-participants-empty">暂无角色</span>`
      : characters.map((character) => {
        const selected = (draft.participantCharacterIds || []).includes(character.id);
        return `
          <button
            type="button"
            class="${selected ? "is-selected" : ""}"
            data-xhs-action="settings-toggle-participant"
            data-character-id="${xhsEscapeHtml(character.id)}"
          >
            <span>${character.avatar ? `<img src="${xhsEscapeHtml(character.avatar)}" alt="" />` : xhsEscapeHtml(String(character.name || "").slice(0, 1))}</span>
            <em>${xhsEscapeHtml(character.name)}</em>
          </button>`;
      }).join("");

    const promptEntries = [
      { key: "npcIdentityGuardPrompt", label: "NPC身份保护", value: draft.npcIdentityGuardPrompt != null ? draft.npcIdentityGuardPrompt : CORE_DEFAULT_SETTINGS.npcIdentityGuardPrompt },
      { key: "npcFeedPrompt", label: "帖子生成", value: draft.npcFeedPrompt },
      { key: "npcUserPostReactionPrompt", label: "评论用户帖子", value: draft.npcUserPostReactionPrompt },
      { key: "npcCommentReplyPrompt", label: "回复用户评论", value: draft.npcCommentReplyPrompt },
      { key: "npcMoreCommentsPrompt", label: "加载更多评论", value: draft.npcMoreCommentsPrompt != null ? draft.npcMoreCommentsPrompt : "" },
      { key: "npcDmReplyPrompt", label: "回复私信", value: draft.npcDmReplyPrompt != null ? draft.npcDmReplyPrompt : "" },
      { key: "bilingualTranslationPrompt", label: "双语翻译", value: draft.bilingualTranslationPrompt || CORE_DEFAULT_BILINGUAL_PROMPT },
    ];
    const promptsHtml = promptEntries.map(({ key, label, value }) => {
      const isOpen = xhsState.expandedPrompts.includes(key);
      return `
        <div class="xhs-settings-edit-prompt${isOpen ? " is-open" : ""}">
          <button type="button" class="xhs-settings-edit-prompt-head" data-xhs-action="toggle-prompt" data-prompt-key="${key}">
            <span>${xhsEscapeHtml(label)}</span>
            ${xhsIcon("chevron-down", 15, 2)}
          </button>
          ${isOpen ? `<textarea class="xhs-profile-edit-pill xhs-settings-edit-prompt-textarea" data-xhs-role="settings-prompt" data-prompt-key="${key}">${xhsEscapeHtml(value == null ? "" : value)}</textarea>` : ""}
        </div>`;
    }).join("");

    return `
      <div class="xhs-modal-backdrop" data-xhs-backdrop="settings">
        <section class="xhs-profile-edit-sheet xhs-settings-edit-sheet" data-xhs-stop>
          <header class="xhs-profile-edit-header">
            <strong>小红书设置</strong>
            <button type="button" class="xhs-sheet-close-btn" data-xhs-action="close-settings" aria-label="关闭">×</button>
          </header>
          <div class="xhs-profile-edit-body">
            <div class="xhs-profile-edit-field">
              <span class="xhs-profile-edit-section-title">INTERACTION <em>角色互动概率</em></span>
              <input
                class="xhs-profile-edit-pill"
                type="number"
                min="0"
                max="100"
                value="${xhsEscapeHtml(String(draft.sendToCharacterProbability == null ? "" : draft.sendToCharacterProbability))}"
                placeholder="发给角色的概率 (0–100)"
                data-xhs-role="settings-probability"
              />
            </div>
            <div class="xhs-profile-edit-field">
              <span class="xhs-profile-edit-section-title">TRANSLATION <em>双语翻译</em></span>
              <div class="xhs-settings-toggle-list">
                <div class="xhs-settings-toggle-row">
                  <div>
                    <strong>双语翻译</strong>
                    <span>角色内容</span>
                  </div>
                  ${renderToggle(Boolean(draft.bilingualTranslationEnabled), "settings-toggle-bilingual")}
                </div>
                <div class="xhs-settings-toggle-row">
                  <div>
                    <strong>折叠翻译</strong>
                    <span>默认收起</span>
                  </div>
                  ${renderToggle(Boolean(draft.collapseBilingualTranslation), "settings-toggle-collapse")}
                </div>
              </div>
            </div>
            <div class="xhs-profile-edit-field">
              <span class="xhs-profile-edit-section-title">PARTICIPANTS <em>参与角色</em></span>
              <div class="xhs-settings-edit-participants">${participantsHtml}</div>
            </div>
            <div class="xhs-profile-edit-field">
              <span class="xhs-profile-edit-section-title">PROMPTS <em>提示词</em></span>
              ${promptsHtml}
            </div>
          </div>
          <footer class="xhs-profile-edit-footer">
            <button type="button" class="xhs-profile-edit-footer-cancel" data-xhs-action="settings-reset">恢复默认</button>
            <button type="button" class="xhs-profile-edit-footer-save" data-xhs-action="settings-save">保存设置</button>
          </footer>
        </section>
      </div>`;
  }

  function renderProfileEditSheet() {
    const draft = xhsState.profileDraft || {};
    return `
      <div class="xhs-modal-backdrop" data-xhs-backdrop="profile">
        <section class="xhs-profile-edit-sheet" data-xhs-stop>
          <header class="xhs-profile-edit-header">
            <strong>编辑资料</strong>
            <button type="button" class="xhs-sheet-close-btn" data-xhs-action="close-profile" aria-label="关闭">×</button>
          </header>
          <div class="xhs-profile-edit-body">
            <div class="xhs-profile-edit-row-2">
              <div class="xhs-profile-edit-field">
                <span class="xhs-profile-edit-section-title">NICKNAME <em>昵称</em></span>
                <input class="xhs-profile-edit-pill" value="${xhsEscapeHtml(draft.nickname || "")}" placeholder="给自己起个名字" data-xhs-role="profile-nickname" />
              </div>
              <div class="xhs-profile-edit-field">
                <span class="xhs-profile-edit-section-title">ID <em>小红书号</em></span>
                <input class="xhs-profile-edit-pill" value="${xhsEscapeHtml(draft.handle || "")}" placeholder="未设置" data-xhs-role="profile-handle" />
              </div>
            </div>
            <div class="xhs-profile-edit-row-2">
              <div class="xhs-profile-edit-field">
                <span class="xhs-profile-edit-section-title">GENDER <em>性别</em></span>
                <div class="xhs-profile-edit-gender">
                  <button
                    type="button"
                    class="${/女|♀|female/i.test(draft.gender || "") ? "is-active" : ""}"
                    data-xhs-action="profile-gender"
                    data-gender="♀"
                    aria-label="女"
                  >♀</button>
                  <button
                    type="button"
                    class="${/男|♂|male/i.test(draft.gender || "") ? "is-active" : ""}"
                    data-xhs-action="profile-gender"
                    data-gender="♂"
                    aria-label="男"
                  >♂</button>
                </div>
              </div>
              <div class="xhs-profile-edit-field">
                <span class="xhs-profile-edit-section-title">IP LOCATION <em>属地</em></span>
                <input class="xhs-profile-edit-pill" value="${xhsEscapeHtml(draft.ipLocation || "")}" placeholder="北京" data-xhs-role="profile-ip" />
              </div>
            </div>
            <div class="xhs-profile-edit-field">
              <span class="xhs-profile-edit-section-title">SIGNATURE <em>签名</em></span>
              <textarea class="xhs-profile-edit-pill xhs-profile-edit-bio" placeholder="说点什么..." data-xhs-role="profile-signature">${xhsEscapeHtml(draft.signature || "")}</textarea>
            </div>
          </div>
          <footer class="xhs-profile-edit-footer">
            <button type="button" class="xhs-profile-edit-footer-cancel" data-xhs-action="close-profile">关闭</button>
            <button type="button" class="xhs-profile-edit-footer-save" data-xhs-action="profile-save">保存</button>
          </footer>
        </section>
      </div>`;
  }

  function renderDeleteSheet() {
    const target = xhsState.deleteTarget;
    if (!target) return "";
    const isNote = target.type === "note";
    return `
      <div class="xhs-modal-backdrop" data-xhs-backdrop="delete">
        <section class="xhs-confirm-sheet" data-xhs-stop role="dialog" aria-modal="true" aria-label="确认删除">
          <header>
            <strong>${isNote ? "删除这篇笔记？" : "删除这条评论？"}</strong>
            <button type="button" class="xhs-sheet-close-btn" data-xhs-action="delete-cancel" aria-label="关闭">×</button>
          </header>
          <p>${isNote
            ? `将删除《${xhsEscapeHtml(target.title || "")}》，相关评论、消息和短期记忆事件也会一并清理。`
            : `将删除 ${xhsEscapeHtml(target.comment ? target.comment.authorName : "")} 在《${xhsEscapeHtml(target.noteTitle || "")}》下的评论，相关短期记忆事件也会一并清理。`}</p>
          ${!isNote && target.comment ? `<blockquote>${xhsEscapeHtml(target.comment.text)}</blockquote>` : ""}
          <div class="xhs-confirm-actions">
            <button type="button" data-xhs-action="delete-cancel">取消</button>
            <button type="button" class="xhs-confirm-delete-btn" data-xhs-action="delete-confirm">确认删除</button>
          </div>
        </section>
      </div>`;
  }

  function renderFeedActionSheet() {
    const action = xhsState.pendingFeedAction;
    if (!action) return "";
    const isRefresh = action === "refresh";
    return `
      <div class="xhs-modal-backdrop" data-xhs-backdrop="feed">
        <section class="xhs-confirm-sheet" data-xhs-stop role="dialog" aria-modal="true" aria-label="${isRefresh ? "确认刷新" : "确认清空内容流"}">
          <header>
            <strong>${isRefresh ? "新增一批小红书内容？" : "清空首页、附近和视频内容？"}</strong>
            <button type="button" class="xhs-sheet-close-btn" data-xhs-action="feed-cancel" aria-label="关闭">×</button>
          </header>
          <p>${isRefresh
            ? "将生成一批新的首页与视频内容，已有内容会保留，旧内容不会回传给本次生成链路。"
            : "将清空首页推荐、附近和视频页当前可见内容；消息、私信、用户主页和互动记录会保留。"}</p>
          <div class="xhs-confirm-actions">
            <button type="button" data-xhs-action="feed-cancel">取消</button>
            <button
              type="button"
              class="${isRefresh ? "xhs-confirm-primary-btn" : "xhs-confirm-delete-btn"}"
              data-xhs-action="feed-confirm"
            >${isRefresh ? "确认新增" : "确认清空"}</button>
          </div>
        </section>
      </div>`;
  }

  // ------------------------------------------------------------
  // 评论列表 / 评论工具条
  // ------------------------------------------------------------

  function renderCommentList(note, getAvatarImpl) {
    const comments = note.comments;
    if (comments.length === 0) return `<div class="cp-xhs-mini-empty">还没有评论</div>`;
    const orderedComments = orderCommentsForDisplay(comments);
    return orderedComments.map((comment) => {
      const parentComment = comment.replyToCommentId
        ? comments.find(item => item.id === comment.replyToCommentId)
        : null;
      const targetName = parentComment ? parentComment.authorName : (!comment.replyToCommentId ? comment.replyTo : undefined);
      const depth = parentComment || (!comment.replyToCommentId && comment.replyTo) ? 1 : 0;
      return `
        <div class="cp-xhs-comment-card cp-xhs-comment-card--depth-${depth}" data-comment-id="${xhsEscapeHtml(comment.id)}">
          ${xhsAvatar("cp-xhs-comment-avatar", getAvatarImpl(comment), comment.authorName)}
          <div class="cp-xhs-comment-content">
            <strong>${xhsEscapeHtml(comment.authorName)}${targetName ? `<span class="cp-xhs-comment-reply-label">回复</span>${xhsEscapeHtml(targetName)}` : ""}</strong>
            <p>${xhsBilingual(comment.text, "xiaohongshu", "inline", "", `comment:${note.id}:${comment.id}`)}</p>
            <div class="xhs-comment-actions">
              <div class="xhs-comment-text-actions">
                <time class="xhs-comment-time" datetime="${xhsEscapeHtml(comment.createdAt)}">${xhsEscapeHtml(formatTime(comment.createdAt))}</time>
                <button type="button" data-xhs-action="comment-reply" data-comment-id="${xhsEscapeHtml(comment.id)}">回复</button>
                <button type="button" data-xhs-action="comment-delete" data-comment-id="${xhsEscapeHtml(comment.id)}">删除</button>
              </div>
              <div class="xhs-comment-vote-actions">
                <button
                  type="button"
                  class="xhs-comment-vote-btn ${comment.liked ? "is-active" : ""}"
                  data-xhs-action="comment-vote"
                  data-vote="like"
                  data-comment-id="${xhsEscapeHtml(comment.id)}"
                  aria-label="点赞评论"
                >
                  ${xhsHeartIcon(20, 2.15, comment.liked)}
                  ${comment.likeCount > 0 ? `<span>${xhsEscapeHtml(formatCount(comment.likeCount))}</span>` : ""}
                </button>
                <button
                  type="button"
                  class="xhs-comment-vote-btn ${comment.disliked ? "is-active is-disliked" : ""}"
                  data-xhs-action="comment-vote"
                  data-vote="dislike"
                  data-comment-id="${xhsEscapeHtml(comment.id)}"
                  aria-label="点踩评论"
                >
                  ${xhsDislikeIcon()}
                  ${comment.dislikeCount > 0 ? `<span>${xhsEscapeHtml(formatCount(comment.dislikeCount))}</span>` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  function renderCommentToolbar() {
    const mentionCharacters = xhsDerived.followedMentionCharacters;
    const mentionHtml = xhsState.commentMentionOpen ? `
      <div class="xhs-comment-mention-panel">
        ${mentionCharacters.length > 0
          ? mentionCharacters.map(({ account, displayName, avatar }) => `
            <button
              type="button"
              data-xhs-mousedown-preserve
              data-xhs-action="mention-character"
              data-display-name="${xhsEscapeHtml(displayName)}"
              ${xhsState.busy !== "idle" ? "disabled" : ""}
            >
              <span>${avatar ? `<img src="${xhsEscapeHtml(avatar)}" alt="" />` : xhsEscapeHtml(displayName.slice(0, 1))}</span>
              <em>${xhsEscapeHtml(displayName)}</em>
            </button>`).join("")
          : `<span class="xhs-comment-panel-empty">暂无已关注角色</span>`}
      </div>` : "";
    const emojiHtml = xhsState.commentEmojiOpen ? `
      <div class="xhs-comment-emoji-panel">
        ${XHS_DM_EMOJIS.map(emoji => `
          <button type="button" data-xhs-mousedown-preserve data-xhs-action="pick-comment-emoji" data-emoji="${xhsEscapeHtml(emoji)}">${xhsEscapeHtml(emoji)}</button>`).join("")}
      </div>` : "";
    return `
      ${mentionHtml}
      ${emojiHtml}
      <div class="xhs-comment-toolbar">
        <div class="xhs-comment-toolbar-icons">
          <button
            type="button"
            class="${xhsState.commentMentionOpen ? "is-active" : ""}"
            aria-label="@已关注角色"
            data-xhs-mousedown-preserve
            data-xhs-action="toggle-comment-mention"
            ${xhsState.busy !== "idle" ? "disabled" : ""}
          >${xhsIcon("at-sign", 22, 2.05)}</button>
          <button
            type="button"
            class="${xhsState.commentEmojiOpen ? "is-active" : ""}"
            aria-label="选择表情"
            data-xhs-mousedown-preserve
            data-xhs-action="toggle-comment-emoji"
            ${xhsState.busy !== "idle" ? "disabled" : ""}
          >${xhsIcon("smile", 22, 2.05)}</button>
        </div>
        <button
          type="button"
          class="xhs-comment-toolbar-send"
          data-xhs-action="submit-comment"
          ${xhsState.busy !== "idle" || !xhsState.commentDraft.trim() ? "disabled" : ""}
        >${xhsState.busy === "comment-reply" || xhsState.busy === "mention-reply" ? xhsIcon("loader-2", 15, 2, "cp-spin") : "发送"}</button>
      </div>`;
  }

  // ------------------------------------------------------------
  // 私信线程
  // ------------------------------------------------------------

  function renderDmThread() {
    const thread = xhsDerived.selectedDmThread;
    if (!thread) return "";
    const messagesHtml = thread.notifications.map((notice, index) => {
      const previous = thread.notifications[index - 1];
      const showTime = !previous || formatTime(previous.createdAt) !== formatTime(notice.createdAt);
      const outgoing = notice.direction === "outgoing";
      return `
        <div class="cp-xhs-chat-message-block" data-notice-id="${xhsEscapeHtml(notice.id)}">
          ${showTime ? `<time class="cp-xhs-chat-time">${xhsEscapeHtml(formatTime(notice.createdAt))}</time>` : ""}
          <div class="cp-xhs-chat-row ${outgoing ? "is-outgoing" : "is-incoming"}">
            ${!outgoing ? xhsAvatar("cp-xhs-chat-avatar", getNotificationAvatar(notice.actorName, notice.id), notice.actorName) : ""}
            <div class="cp-xhs-chat-content">
              <p>${xhsBilingual(notice.text, "xiaohongshu", "inline", "", `dm:${notice.id}`)}</p>
            </div>
            ${outgoing ? xhsAvatar("cp-xhs-chat-avatar cp-xhs-chat-avatar--me", xhsDerived.userAvatar, xhsData.profile.nickname) : ""}
          </div>
        </div>`;
    }).join("");

    const emojiPanelHtml = xhsState.dmEmojiOpen ? `
      <div class="xhs-dm-emoji-panel">
        ${XHS_DM_EMOJIS.map(emoji => `<button type="button" data-xhs-action="dm-emoji" data-emoji="${xhsEscapeHtml(emoji)}">${xhsEscapeHtml(emoji)}</button>`).join("")}
      </div>` : "";

    return `
      <header class="cp-xhs-thread-appbar">
        <button type="button" class="cp-xhs-thread-nav-button" data-xhs-action="dm-back" aria-label="返回消息">${xhsIcon("chevron-left", 26, 2.4)}</button>
        <div class="cp-xhs-thread-title-block">
          ${xhsAvatar("cp-xhs-thread-avatar cp-xhs-thread-avatar--header", getNotificationAvatar(thread.actorName, thread.id), thread.actorName)}
          <strong>${xhsEscapeHtml(thread.actorName)}</strong>
        </div>
        <button type="button" class="cp-xhs-thread-nav-button" aria-label="更多">${xhsIcon("more-horizontal", 27, 2.4)}</button>
      </header>
      <div class="cp-xhs-thread-messages">
        <div class="cp-xhs-chat-stack">${messagesHtml}</div>
      </div>
      <div class="cp-xhs-thread-composer">
        ${emojiPanelHtml}
        <div class="cp-xhs-thread-inputbar">
          <button type="button" aria-label="表情" class="${xhsState.dmEmojiOpen ? "is-active" : ""}" data-xhs-action="dm-emoji-toggle">${xhsIcon("smile", 24, 1.8)}</button>
          <input
            class="cp-xhs-thread-input-field"
            value="${xhsEscapeHtml(xhsState.dmDraft)}"
            data-xhs-role="dm-input"
            placeholder="发消息..."
          />
          <button type="button" class="xhs-dm-generate-btn" aria-label="生成回复" ${xhsState.busy !== "idle" ? "disabled" : ""} data-xhs-action="dm-generate">
            ${xhsState.busy === "dm-reply" ? xhsIcon("loader-2", 21, 2, "cp-spin") : xhsIcon("sparkles", 22, 1.8)}
          </button>
          <button type="button" aria-label="发送" ${xhsState.busy !== "idle" || !xhsState.dmDraft.trim() ? "disabled" : ""} data-xhs-action="dm-send">
            ${xhsIcon("send", 22, 1.8)}
          </button>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------
  // 视频详情
  // ------------------------------------------------------------

  function renderVideoMovingLayer(note, styleAttr, preview) {
    const isPreview = Boolean(preview);
    const account = makeAccountFromNote(note);
    const following = isFollowingAccount(account);
    const showCaptionControls = !isPreview && xhsDerived.selectedNote && note.id === xhsDerived.selectedNote.id;
    let frameInner;
    if (note.imageDataUrl) {
      frameInner = `<img class="xhs-video-real-image" src="${xhsEscapeHtml(note.imageDataUrl)}" alt="" />`;
    } else if ((note.videoDescription || "").trim() || (note.imageDescription || "").trim()) {
      frameInner = `
        <div class="cp-xhs-video-frame-text">
          ${xhsBilingual(note.videoDescription || note.imageDescription || "", "light", "block", "", `videoimg:${note.id}`)}
        </div>`;
    } else {
      frameInner = "";
    }
    const captionText = showCaptionControls && xhsState.videoCaptionCanExpand && !xhsState.videoCaptionExpanded
      ? `${xhsState.collapsedVideoCaption}...`
      : note.body;
    return `
      <div class="cp-xhs-video-moving-layer${isPreview ? " cp-xhs-video-moving-layer--preview" : ""}" style="${styleAttr}">
        <main class="cp-xhs-video-stage">
          <div class="cp-xhs-video-frame cp-xhs-cover--${xhsEscapeHtml(note.tone)}">${frameInner}</div>
          <section class="cp-xhs-video-meta">
            <div class="cp-xhs-video-author-row">
              ${xhsAvatar("cp-xhs-video-author-avatar", getNoteAvatar(note), note.authorName)}
              <strong>${xhsEscapeHtml(note.authorName)}</strong>
              ${account ? `
                <button
                  type="button"
                  class="${following ? "is-following" : ""}"
                  data-xhs-action="toggle-follow-author"
                  data-note-id="${xhsEscapeHtml(note.id)}"
                >${following ? "已关注" : "关注"}</button>` : ""}
              <time>${xhsEscapeHtml(formatTime(note.createdAt))}</time>
              <button
                type="button"
                class="xhs-delete-note-btn xhs-video-delete-note-btn"
                data-xhs-action="request-delete-note"
                data-note-id="${xhsEscapeHtml(note.id)}"
                aria-label="删除帖子"
              >${xhsIcon("trash-2", 14, 2.1)}删除</button>
            </div>
            <h3>${xhsBilingual(note.title, "light", "block", "", `videotitle:${note.id}`)}</h3>
            <div class="cp-xhs-video-caption-wrap">
              ${showCaptionControls ? `<div aria-hidden="true" class="cp-xhs-video-caption-measure"></div>` : ""}
              <p class="${!xhsState.videoCaptionExpanded || isPreview ? "is-collapsed" : ""}">
                ${xhsBilingual(captionText, "light", "block", "", `videocaption:${note.id}`)}${showCaptionControls && xhsState.videoCaptionCanExpand ? `  <button type="button" class="cp-xhs-video-caption-toggle" data-xhs-action="video-caption-toggle" data-xhs-stop-touch>${xhsState.videoCaptionExpanded ? "收起" : "展开"}</button>` : ""}
              </p>
            </div>
            ${note.tags.length > 0 ? `<div class="cp-xhs-video-tags">${note.tags.map(tag => `<em>#${xhsEscapeHtml(tag)}</em>`).join("")}</div>` : ""}
            <div class="cp-xhs-video-progress" aria-hidden="true"></div>
          </section>
        </main>
      </div>`;
  }

  function xhsVideoMovableStyle() {
    return `transform: translate3d(0, ${xhsState.videoDragOffset}px, 0);` +
      ` transition: ${xhsState.videoDragSettling ? "transform 190ms cubic-bezier(0.2, 0.82, 0.2, 1)" : "none"};` +
      ` will-change: transform;`;
  }

  function xhsVideoPreviewStyle() {
    const direction = xhsState.videoDragDirection;
    if (!direction) return null;
    return `transform: translate3d(0, calc(${xhsState.videoDragOffset}px ${direction === "next" ? "+" : "-"} 100vh), 0);` +
      ` transition: ${xhsState.videoDragSettling ? "transform 190ms cubic-bezier(0.2, 0.82, 0.2, 1)" : "none"};` +
      ` will-change: transform; pointer-events: none;`;
  }

  function renderVideoDetail() {
    const note = xhsDerived.selectedNote;
    if (!note) return "";
    const previewNote = xhsState.videoDragDirection ? xhsGetSiblingVideo(xhsState.videoDragDirection) : undefined;
    const previewStyle = xhsVideoPreviewStyle();
    const composerExpanded = xhsCommentComposerExpanded();
    const replyVisible = xhsState.replyTarget && xhsState.replyTarget.noteId === note.id;
    return `
      <header class="cp-xhs-video-detail-topbar">
        <button type="button" data-xhs-action="close-note" aria-label="返回">${xhsIcon("chevron-left", 26, 2)}</button>
        <button type="button" aria-label="更多视频"><span class="cp-xhs-video-stack-icon" aria-hidden="true"></span></button>
        <div class="cp-xhs-video-topbar-spacer"></div>
        <button type="button" aria-label="搜索">${xhsIcon("search", 22, 2.2)}</button>
        <button type="button" aria-label="分享" data-xhs-action="share-note" data-note-id="${xhsEscapeHtml(note.id)}">${xhsShareFatIcon(23)}</button>
      </header>
      ${previewNote && previewStyle ? renderVideoMovingLayer(previewNote, previewStyle, true) : ""}
      ${renderVideoMovingLayer(note, xhsVideoMovableStyle(), false)}
      <footer class="cp-xhs-video-actions xhs-video-actions">
        <button type="button" class="cp-xhs-video-input xhs-video-input-button" data-xhs-action="open-video-comments">说点什么...</button>
        <button type="button" class="cp-xhs-video-action ${note.liked ? "is-active" : ""}" data-xhs-action="toggle-like" data-note-id="${xhsEscapeHtml(note.id)}" aria-label="点赞">
          ${xhsHeartIcon(24, 2.1, note.liked)}
          <span>${xhsEscapeHtml(formatCount(note.likeCount))}</span>
        </button>
        <button type="button" class="cp-xhs-video-action ${note.saved ? "is-active" : ""}" data-xhs-action="toggle-save" data-note-id="${xhsEscapeHtml(note.id)}" aria-label="收藏">
          <span class="xhs-icon-fill${note.saved ? " is-filled" : ""}">${xhsIcon("bookmark", 24, 2.1)}</span>
          <span>${xhsEscapeHtml(formatCount(note.saveCount))}</span>
        </button>
        <button type="button" class="cp-xhs-video-action" data-xhs-action="open-video-comments" aria-label="评论">
          ${xhsIcon("message-circle", 24, 2.1)}
          <span>${xhsEscapeHtml(formatCount(note.commentCount))}</span>
        </button>
      </footer>
      ${xhsState.videoCommentsOpen ? `
        <div class="cp-xhs-video-comments-backdrop" data-xhs-backdrop="video-comments">
          <section class="cp-xhs-video-comments-sheet xhs-video-comments-sheet" data-xhs-stop>
            <div class="cp-xhs-video-comments-handle" aria-hidden="true"></div>
            <header>
              <strong>评论 ${xhsEscapeHtml(formatCount(note.commentCount))}</strong>
              <button type="button" data-xhs-action="close-video-comments" aria-label="关闭评论">×</button>
            </header>
            <div class="cp-xhs-comment-list xhs-video-comment-list">
              ${renderCommentList(note, getCommentAvatar)}
              <button
                type="button"
                class="xhs-load-comments-btn"
                data-xhs-action="load-more-comments"
                data-note-id="${xhsEscapeHtml(note.id)}"
                ${xhsState.busy !== "idle" ? "disabled" : ""}
              >${xhsState.busy === "more-comments" ? xhsIcon("loader-2", 15, 2, "cp-spin") : ""}${xhsState.busy === "more-comments" ? "加载中" : "加载更多评论"}</button>
            </div>
            <div class="xhs-video-comment-composer ${composerExpanded ? "is-expanded" : ""}">
              ${replyVisible ? `
                <div class="xhs-reply-target">
                  <span>回复 ${xhsEscapeHtml(xhsState.replyTarget.authorName)}</span>
                  <button type="button" data-xhs-action="clear-reply-target">取消</button>
                </div>` : ""}
              <div class="xhs-comment-input-row">
                <textarea
                  data-xhs-role="comment-input"
                  placeholder="${replyVisible ? "写回复" : "写评论"}"
                  rows="${composerExpanded ? 3 : 1}"
                >${xhsEscapeHtml(xhsState.commentDraft)}</textarea>
                ${!composerExpanded ? `
                  <button type="button" data-xhs-action="submit-comment" ${xhsState.busy !== "idle" || !xhsState.commentDraft.trim() ? "disabled" : ""}>
                    ${xhsState.busy === "comment-reply" || xhsState.busy === "mention-reply" ? xhsIcon("loader-2", 15, 2, "cp-spin") : ""}
                    发送
                  </button>` : ""}
              </div>
              ${composerExpanded ? renderCommentToolbar() : ""}
            </div>
          </section>
        </div>` : ""}`;
  }

  // ------------------------------------------------------------
  // 笔记详情（图文）
  // ------------------------------------------------------------

  function renderNoteDetail() {
    const note = xhsDerived.selectedNote;
    if (!note) return "";
    const composerExpanded = xhsCommentComposerExpanded();
    const replyVisible = xhsState.replyTarget && xhsState.replyTarget.noteId === note.id;
    return `
      <div class="cp-xhs-note-detail-header">
        <button type="button" class="cp-xhs-detail-back" data-xhs-action="close-note" aria-label="返回">${xhsIcon("chevron-left", 24, 2.1)}</button>
        <div class="cp-xhs-detail-author-info">
          ${xhsAvatar("cp-xhs-detail-avatar", getNoteAvatar(note), note.authorName)}
          <span class="cp-xhs-detail-name">${xhsEscapeHtml(note.authorName)}</span>
        </div>
        ${xhsDerived.selectedAuthorAccount ? `
          <button
            type="button"
            class="cp-xhs-detail-follow ${xhsDerived.selectedAuthorFollowing ? "is-following" : ""}"
            data-xhs-action="toggle-follow-author"
            data-note-id="${xhsEscapeHtml(note.id)}"
          >${xhsDerived.selectedAuthorFollowing ? "已关注" : "关注"}</button>` : ""}
        <button type="button" class="cp-xhs-detail-share" aria-label="分享" data-xhs-action="share-note" data-note-id="${xhsEscapeHtml(note.id)}">${xhsShareFatIcon(25)}</button>
      </div>
      <article class="cp-xhs-note-detail xhs-note-detail-page">
        <div class="xhs-note-detail-media">${renderNoteImage(note, false)}</div>
        <div class="cp-xhs-note-detail-card">
          <h3>${xhsBilingual(note.title, "xiaohongshu", "block", "", `detailtitle:${note.id}`)}</h3>
          <p class="cp-xhs-note-detail-body">${xhsBilingual(note.body, "xiaohongshu", "block", "", `detailbody:${note.id}`)}</p>
          ${note.tags.length ? `<div class="cp-xhs-note-detail-tags">${note.tags.map(tag => `<em>#${xhsEscapeHtml(tag)}</em>`).join("")}</div>` : ""}
          <div class="xhs-note-detail-meta-row">
            <div class="cp-xhs-note-detail-time">${xhsEscapeHtml(formatTime(note.createdAt))}</div>
            <button type="button" class="xhs-delete-note-btn" data-xhs-action="request-delete-note" data-note-id="${xhsEscapeHtml(note.id)}" aria-label="删除帖子">
              ${xhsIcon("trash-2", 14, 2.1)}
              删除
            </button>
          </div>
        </div>
        <div class="cp-xhs-comment-section xhs-detail-comment-section">
          <div class="cp-xhs-comment-count">共 ${xhsEscapeHtml(formatCount(note.commentCount))} 条评论</div>
          <div class="cp-xhs-comment-list">
            ${renderCommentList(note, getCommentAvatar)}
            <button
              type="button"
              class="xhs-load-comments-btn"
              data-xhs-action="load-more-comments"
              data-note-id="${xhsEscapeHtml(note.id)}"
              ${xhsState.busy !== "idle" ? "disabled" : ""}
            >${xhsState.busy === "more-comments" ? xhsIcon("loader-2", 15, 2, "cp-spin") : ""}${xhsState.busy === "more-comments" ? "加载中" : "加载更多评论"}</button>
          </div>
        </div>
      </article>
      <div class="cp-xhs-detail-bottom-bar xhs-detail-bottom-bar ${composerExpanded ? "is-expanded" : ""}">
        <div class="xhs-detail-comment-stack">
          ${replyVisible ? `
            <div class="xhs-reply-target xhs-detail-reply-target">
              <span>回复 ${xhsEscapeHtml(xhsState.replyTarget.authorName)}</span>
              <button type="button" data-xhs-action="clear-reply-target">取消</button>
            </div>` : ""}
          <div class="cp-xhs-input-box xhs-detail-input-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
            <textarea
              data-xhs-role="comment-input"
              placeholder="${replyVisible ? "写回复" : "说点什么..."}"
              rows="${composerExpanded ? 3 : 1}"
            >${xhsEscapeHtml(xhsState.commentDraft)}</textarea>
          </div>
          ${composerExpanded ? renderCommentToolbar() : ""}
        </div>
        ${!composerExpanded && xhsState.commentDraft.trim() ? `
          <button type="button" class="xhs-detail-send-btn" data-xhs-action="submit-comment" ${xhsState.busy !== "idle" ? "disabled" : ""}>
            ${xhsState.busy === "comment-reply" || xhsState.busy === "mention-reply" ? xhsIcon("loader-2", 15, 2, "cp-spin") : "发送"}
          </button>` : ""}
        ${!composerExpanded ? `
          <div class="cp-xhs-action-icons">
            <button type="button" class="cp-xhs-action-btn ${note.liked ? "is-liked" : ""}" data-xhs-action="toggle-like" data-note-id="${xhsEscapeHtml(note.id)}" aria-label="点赞">
              ${xhsHeartIcon(24, 1.72, note.liked)}
              <span>${xhsEscapeHtml(formatCount(note.likeCount))}</span>
            </button>
            <button type="button" class="cp-xhs-action-btn ${note.saved ? "is-saved" : ""}" data-xhs-action="toggle-save" data-note-id="${xhsEscapeHtml(note.id)}" aria-label="收藏">
              <span class="xhs-icon-fill${note.saved ? " is-filled" : ""}">${xhsIcon("bookmark", 24, 1.72)}</span>
              <span>${xhsEscapeHtml(formatCount(note.saveCount))}</span>
            </button>
            <button type="button" class="cp-xhs-action-btn" aria-label="评论">
              ${xhsIcon("message-circle", 24, 1.72)}
              <span>${xhsEscapeHtml(formatCount(note.commentCount))}</span>
            </button>
          </div>` : ""}
      </div>`;
  }

  function xhsCommentComposerExpanded() {
    return xhsState.commentComposerFocused
      || Boolean(xhsState.commentDraft.trim())
      || Boolean(xhsState.replyTarget)
      || xhsState.commentEmojiOpen
      || xhsState.commentMentionOpen;
  }

  function xhsGetSiblingVideo(direction) {
    const index = xhsDerived.activeVideoNoteIndex;
    if (index < 0) return undefined;
    const nextIndex = direction === "previous" ? index - 1 : index + 1;
    return xhsDerived.videoNotes[nextIndex];
  }

  // ------------------------------------------------------------
  // 渲染后钩子：滚动恢复 / 视频文案测量 / 焦点恢复
  // ------------------------------------------------------------

  let xhsLastViewKey = "";

  function xhsRunPostRenderHooks(kind) {
    const slot = document.getElementById("xhsMainViewSlot");
    if (!slot) return;

    const note = xhsDerived.selectedNote;
    const contextId = kind === "thread" ? (xhsState.selectedDmThreadId || "") : (note ? note.id : "");
    const viewKey = kind === "main" ? "main" : `${kind}:${contextId}`;
    if (kind === "main") {
      slot.scrollTop = xhsState.savedScroll.main || 0;
    } else if (viewKey !== xhsLastViewKey) {
      slot.scrollTop = 0;
      xhsState.savedScroll[kind] = 0;
    } else {
      slot.scrollTop = xhsState.savedScroll[kind] || 0;
    }
    xhsLastViewKey = viewKey;

    if (kind === "video") xhsMeasureVideoCaption();

    if (xhsState.focusPlan) {
      const plan = xhsState.focusPlan;
      xhsState.focusPlan = null;
      const input = slot.querySelector(plan.selector) || document.querySelector(plan.selector);
      if (input) {
        input.focus();
        if (plan.caret != null && typeof input.setSelectionRange === "function") {
          try { input.setSelectionRange(plan.caret, plan.caret); } catch (err) { /* 忽略 */ }
        }
      }
    }
  }

  function xhsMeasureVideoCaption() {
    const note = xhsDerived.selectedNote;
    const caption = xhsDerived.activeVideoCaption;
    if (!note || !caption || xhsState.videoCaptionExpanded) return;
    window.requestAnimationFrame(() => {
      const measureNode = document.querySelector("#xhsMainViewSlot .cp-xhs-video-caption-measure");
      if (!measureNode) return;
      const currentNote = xhsDerived.selectedNote;
      if (!currentNote || currentNote.id !== note.id || xhsDerived.activeVideoCaption !== caption) return;
      if (xhsState.videoCaptionExpanded) return;

      const computedStyle = window.getComputedStyle(measureNode);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 19.6;
      const maxHeight = lineHeight * 3 + 1;

      measureNode.textContent = caption;
      if (measureNode.scrollHeight <= maxHeight) {
        if (xhsState.videoCaptionCanExpand !== false || xhsState.collapsedVideoCaption !== caption) {
          xhsState.videoCaptionCanExpand = false;
          xhsState.collapsedVideoCaption = caption;
          xhsRender();
        }
        return;
      }

      let left = 0;
      let right = caption.length;
      let best = "";
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        const candidate = caption.slice(0, middle).trimEnd();
        measureNode.textContent = `${candidate}...  展开`;
        if (measureNode.scrollHeight <= maxHeight) {
          best = candidate;
          left = middle + 1;
        } else {
          right = middle - 1;
        }
      }

      const collapsed = best.slice(0, Math.max(0, best.length - 1)).trimEnd();
      if (xhsState.videoCaptionCanExpand !== true || xhsState.collapsedVideoCaption !== collapsed) {
        xhsState.videoCaptionCanExpand = true;
        xhsState.collapsedVideoCaption = collapsed;
        xhsRender();
      }
    });
  }
