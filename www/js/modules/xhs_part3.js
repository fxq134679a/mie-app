
  // ------------------------------------------------------------
  // 渲染编排（等价于 TSX 顶层 return 的结构）
  // 静态外壳插槽：#xhsAppbarSlot / #xhsBusySlot / #xhsMainViewSlot
  //               / #xhsTabbarSlot / #xhsSheetSlot
  // ------------------------------------------------------------

  // 错误弹窗开关（React 里是 DebugErrorCard 的内部 open state）
  let xhsDebugDialogOpen = false;

  function xhsHeartIcon(size, strokeWidth, filled) {
    const svg = xhsIcon("heart", size, strokeWidth);
    return filled ? svg.replace('fill="none"', 'fill="currentColor"') : svg;
  }

  function xhsViewKind() {
    if (xhsDerived && xhsDerived.selectedDmThread) return "thread";
    const note = xhsDerived && xhsDerived.selectedNote;
    if (note && note.type === "video") return "video";
    if (note) return "detail";
    return "main";
  }

  function xhsResetSlot(slot) {
    slot.className = "xhs-shell-slot";
    slot.hidden = true;
    slot.innerHTML = "";
  }

  function xhsRender() {
    if (!xhsState.initialized || !xhsData) return;
    xhsComputeDerived();

    const appbarSlot = document.getElementById("xhsAppbarSlot");
    const busySlot = document.getElementById("xhsBusySlot");
    const mainSlot = document.getElementById("xhsMainViewSlot");
    const tabbarSlot = document.getElementById("xhsTabbarSlot");
    const sheetSlot = document.getElementById("xhsSheetSlot");
    if (!mainSlot) return;

    const kind = xhsViewKind();

    // --- 顶栏 ---
    if (appbarSlot) {
      if (xhsState.selectedTab !== "profile" && !xhsDerived.selectedNote && !xhsDerived.selectedDmThread) {
        appbarSlot.hidden = false;
        appbarSlot.className = "cp-xhs-appbar xhs-appbar";
        appbarSlot.innerHTML = renderAppbarContent();
      } else {
        xhsResetSlot(appbarSlot);
      }
    }

    // --- 忙碌指示 + 错误弹窗 ---
    if (busySlot) {
      const showErrorDialog = Boolean(xhsState.error) && xhsDebugDialogOpen;
      if (xhsState.busy === "idle" && !showErrorDialog) {
        xhsResetSlot(busySlot);
      } else {
        busySlot.hidden = false;
        busySlot.className = "xhs-shell-slot";
        busySlot.innerHTML = renderBusySlotContent();
      }
    }

    // --- 主视图 ---
    mainSlot.hidden = false;
    if (kind === "thread") {
      mainSlot.className = "cp-xhs-thread-screen xhs-dm-thread-screen";
      mainSlot.innerHTML = renderDmThread();
    } else if (kind === "video") {
      mainSlot.className = "cp-xhs-video-detail-screen xhs-video-detail-screen" +
        (xhsState.videoCommentsOpen ? " is-comments-open" : "");
      mainSlot.innerHTML = renderVideoDetail();
    } else if (kind === "detail") {
      mainSlot.className = "cp-xhs-scroll cp-xhs-scroll--detail xhs-detail-page";
      mainSlot.innerHTML = renderNoteDetail();
    } else {
      mainSlot.className = "cp-xhs-scroll" +
        (xhsState.selectedTab === "profile" ? " cp-xhs-scroll--profile" : "");
      mainSlot.innerHTML = renderMainScroll();
    }

    // --- 底部导航 ---
    if (tabbarSlot) {
      if (!xhsDerived.selectedNote && !xhsDerived.isMessageSubpage) {
        tabbarSlot.hidden = false;
        tabbarSlot.className = "cp-xhs-tabbar xhs-tabbar";
        tabbarSlot.innerHTML = renderTabbarContent();
      } else {
        xhsResetSlot(tabbarSlot);
      }
    }

    // --- 弹层（发布 / 设置 / 编辑资料 / 删除确认 / 刷新清空确认） ---
    if (sheetSlot) {
      const sheetsHtml = renderSheets();
      if (sheetsHtml) {
        sheetSlot.hidden = false;
        sheetSlot.className = "xhs-shell-slot";
        sheetSlot.innerHTML = sheetsHtml;
      } else {
        xhsResetSlot(sheetSlot);
      }
    }

    xhsState.lastViewKind = kind;
    xhsRunPostRenderHooks(kind);
  }

  // ------------------------------------------------------------
  // 顶栏
  // ------------------------------------------------------------

  function renderAppbarContent() {
    const subpage = xhsDerived.isMessageSubpage;
    let stackHtml = "";
    if (subpage) {
      stackHtml = `<div class="cp-xhs-header-title is-active">${xhsEscapeHtml(xhsDerived.selectedMessagePanelTitle)}</div>`;
    } else if (xhsState.selectedTab === "home") {
      stackHtml = HOME_FEED_TABS.map(tab => `
        <button
          type="button"
          class="cp-xhs-header-title ${xhsState.homeFeedTab === tab.id ? "is-active" : ""}"
          data-xhs-action="select-home-feed-tab"
          data-tab-id="${tab.id}"
          ${xhsState.homeFeedTab === tab.id ? 'aria-current="page"' : ""}
        >${xhsEscapeHtml(tab.label)}</button>`).join("");
    } else {
      const title = xhsState.selectedTab === "video" ? "附近" : xhsState.selectedTab === "messages" ? "消息" : "发布";
      stackHtml = `<div class="cp-xhs-header-title is-active">${xhsEscapeHtml(title)}</div>`;
    }

    const actionsHtml = !subpage ? `
      <div class="cp-appbar-actions">
        <button
          type="button"
          class="cp-float-refresh xhs-icon-action xhs-icon-action--refresh"
          data-xhs-action="feed-refresh"
          ${xhsState.busy !== "idle" ? "disabled" : ""}
          aria-label="刷新小红书内容"
        >${xhsIcon("rotate-cw", 18, 1.75)}</button>
        <button
          type="button"
          class="cp-float-refresh xhs-icon-action xhs-icon-action--clear"
          data-xhs-action="feed-clear"
          ${xhsState.busy !== "idle" || xhsData.notes.length === 0 ? "disabled" : ""}
          aria-label="清空小红书内容"
        >${xhsIcon("trash-2", 17, 1.8)}</button>
      </div>` : `<div class="cp-appbar-actions"></div>`;

    return `
      <button
        type="button"
        class="cp-float-back"
        data-xhs-action="appbar-back"
        aria-label="${subpage ? "返回消息" : "返回桌面"}"
      >${xhsIcon("chevron-left", 24, 2)}</button>
      <div class="cp-xhs-header-stack">${stackHtml}</div>
      ${actionsHtml}`;
  }

  // ------------------------------------------------------------
  // 忙碌指示 + 错误弹窗（CheckPhoneDebugErrorCard 移植）
  // ------------------------------------------------------------

  function renderBusySlotContent() {
    let html = "";
    if (xhsState.busy !== "idle") {
      const busy = xhsState.busy;
      const text = busy === "npc-feed" ? "正在生成帖子内容"
        : busy === "character-activity" ? "正在生成角色互动内容"
        : busy === "publish" ? "正在发布笔记"
        : busy === "comment-reply" || busy === "mention-reply" ? "正在生成回复内容"
        : busy === "dm-reply" ? "正在生成私信回复"
        : "正在生成互动内容";
      html += `
        <div class="cp-refresh-indicator cp-refresh-indicator--floating" aria-live="polite">
          <span class="cp-refresh-indicator-text">${xhsEscapeHtml(text)}</span>
          <span class="cp-refresh-indicator-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>`;
    }
    if (xhsState.error && xhsDebugDialogOpen) {
      html += renderErrorDialog();
    }
    return html;
  }

  function xhsBuildErrorReasonText() {
    const rawOutput = (xhsState.debugRawOutput || "").trim();
    const normalizedError = String(xhsState.error || "").replace(/\r\n/g, "\n").trim();
    const detailParts = [(xhsState.debugParseError || "").replace(/\r\n/g, "\n").trim()]
      .filter((item, index, items) => item && item !== normalizedError && items.indexOf(item) === index);
    const detail = detailParts.join("\n");
    const errorText = detail ? `${normalizedError}\n${detail}` : normalizedError;
    return `错误信息：${errorText}\nAI原始输出：${rawOutput}`;
  }

  function renderErrorDialog() {
    const title = xhsState.debugErrorTitle || "哎呀，抱歉~同步数据失败了呢~";
    return `
      <div class="modal-overlay visible" data-ui="modal" data-xhs-error-overlay>
        <div class="modal-window cp-sync-error-dialog" data-ui="modal-dialog" data-xhs-stop>
          <button
            type="button"
            class="modal-header-btn modal-header-btn-muted cp-sync-error-close"
            data-xhs-action="error-close"
            aria-label="关闭"
          >${xhsIcon("x", 17)}</button>
          <div class="modal-header cp-sync-error-header" data-ui="modal-header">
            <h3 class="modal-title">${xhsEscapeHtml(title)}</h3>
          </div>
          <div class="modal-body cp-sync-error-body" data-ui="modal-body">
            ${xhsState.showDebugReason ? `
              <div class="cp-sync-error-raw" role="region" aria-label="AI 原始输出">
                <pre>${xhsEscapeHtml(xhsBuildErrorReasonText())}</pre>
              </div>
              <button type="button" class="ui-btn ui-btn-outline cp-sync-error-copy" data-xhs-action="error-copy">复制</button>
            ` : `
              <button type="button" class="ui-btn ui-btn-primary" data-xhs-action="error-reason">查看原因</button>
            `}
          </div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------
  // 底部导航
  // ------------------------------------------------------------

  function renderTabbarContent() {
    return TABS.map((tab) => {
      if (tab.id === "publish") {
        return `
          <button key="${tab.id}" type="button" class="cp-xhs-tab-publish" data-xhs-action="open-compose" aria-label="发布">
            <div class="cp-xhs-tab-publish-inner">${xhsIcon("plus", 20, 3)}</div>
          </button>`;
      }
      const active = xhsState.selectedTab === tab.id;
      return `
        <button
          key="${tab.id}"
          type="button"
          class="cp-xhs-tab ${active ? "is-active" : ""}"
          data-xhs-action="select-tab"
          data-tab-id="${tab.id}"
        >
          <div class="cp-xhs-tab-inner">
            <span>${xhsEscapeHtml(tab.label)}</span>
            ${tab.id === "messages" && xhsDerived.unreadCount > 0
              ? `<span class="cp-xhs-tab-badge">${xhsEscapeHtml(xhsDerived.unreadCount > 99 ? "99+" : String(xhsDerived.unreadCount))}</span>`
              : ""}
          </div>
        </button>`;
    }).join("");
  }

  // ------------------------------------------------------------
  // 笔记卡片（NoteImage / NoteCard）
  // ------------------------------------------------------------

  function renderNoteImage(note, hideTextImageDescription) {
    if (note.type === "video") {
      let inner;
      if (note.imageDataUrl) {
        inner = `<img src="${xhsEscapeHtml(note.imageDataUrl)}" alt="" class="xhs-video-real-image" />`;
      } else if ((note.videoDescription || "").trim() || (note.imageDescription || "").trim()) {
        inner = `<span>${xhsBilingual(note.videoDescription || note.imageDescription || "", "light", "block", "", `noteimg:${note.id}`)}</span>`;
      } else {
        inner = `<span>${xhsEscapeHtml(note.coverIcon || "")}</span>`;
      }
      return `<div class="cp-xhs-cover cp-xhs-cover--video cp-xhs-cover--${xhsEscapeHtml(note.tone)}" style="${VIDEO_XHS_IMAGE_FRAME_STYLE}">${inner}</div>`;
    }
    if (note.imageDataUrl) {
      return `
        <div class="xhs-note-real-image-frame" style="${xhsImageFrameStyle(note.imageWidth, note.imageHeight)}">
          <img src="${xhsEscapeHtml(note.imageDataUrl)}" alt="" class="xhs-note-real-image" />
        </div>`;
    }
    if ((note.imageDescription || "").trim() && !hideTextImageDescription) {
      return `
        <div class="cp-xhs-cover cp-xhs-cover--${xhsEscapeHtml(note.tone)} xhs-note-text-image" style="${TEXT_XHS_IMAGE_FRAME_STYLE}">
          <span>${xhsBilingual(note.imageDescription, "xiaohongshu", "block", "", `noteimg:${note.id}`)}</span>
        </div>`;
    }
    return `
      <div class="cp-xhs-cover cp-xhs-cover--${xhsEscapeHtml(note.tone)}" style="${xhsGetIconImageFrameStyle(note)}">
        <span class="cp-xhs-cover-icon">${xhsEscapeHtml(note.coverIcon || "")}</span>
      </div>`;
  }

  function renderNoteCard(note, avatarSrc, hideTextImageDescription) {
    const variant = xhsGetNoteCardVariant(note);
    return `
      <button type="button" class="cp-xhs-note-card cp-xhs-note-card--${variant}" data-xhs-action="open-note" data-note-id="${xhsEscapeHtml(note.id)}">
        ${renderNoteImage(note, hideTextImageDescription)}
        <div class="cp-xhs-note-body">
          <strong>${xhsBilingual(note.title, "xiaohongshu", "block", "", `cardtitle:${note.id}`)}</strong>
          <p>${xhsBilingual(note.body, "xiaohongshu", "block", "", `cardbody:${note.id}`)}</p>
          <div class="cp-xhs-note-foot">
            <div class="cp-xhs-note-author">
              ${xhsAvatar("cp-xhs-note-author-avatar", avatarSrc, note.authorName)}
              <span>${xhsEscapeHtml(note.authorName)}</span>
            </div>
            <em class="${note.liked ? "is-liked" : ""}">${xhsHeartIcon(12, 2.4, note.liked)}${xhsEscapeHtml(formatCount(note.likeCount))}</em>
          </div>
        </div>
      </button>`;
  }

  function renderWaterfall(columns, options) {
    const opts = options || {};
    if (columns[0].length + columns[1].length === 0) {
      return `
        <div class="cp-xhs-status cp-empty-copy">
          <p>暂无小红书内容</p>
          ${opts.showGenerateButton ? `
            <button
              type="button"
              class="xhs-empty-generate-btn"
              data-xhs-action="generate-home"
              ${xhsState.busy !== "idle" ? "disabled" : ""}
            >${xhsState.busy === "npc-feed" || xhsState.busy === "character-activity" ? "正在生成" : "生成小红书内容"}</button>
          ` : ""}
        </div>`;
    }
    const renderColumn = (items) => items.map(note => renderNoteCard(
      note,
      getNoteAvatar(note),
      Boolean(opts.hideCharacterTextImages) && note.source === "character" && note.type === "post"
    )).join("");
    return `
      <div class="cp-xhs-waterfall-grid">
        <div class="cp-xhs-waterfall-column">${renderColumn(columns[0])}</div>
        <div class="cp-xhs-waterfall-column">${renderColumn(columns[1])}</div>
      </div>`;
  }

  // ------------------------------------------------------------
  // 主滚动视图（首页 / 附近 / 消息 / 我的主页）
  // ------------------------------------------------------------

  function renderMainScroll() {
    const tab = xhsState.selectedTab;
    let html = "";

    if (tab === "home") {
      html += `<section class="cp-xhs-home">${renderWaterfall(xhsDerived.homeColumns, { showGenerateButton: true, hideCharacterTextImages: true })}</section>`;
    }

    if (tab === "video") {
      html += `<section class="cp-xhs-home">${renderWaterfall(xhsDerived.nearbyColumns, { showGenerateButton: true })}</section>`;
    }

    if (tab === "messages") {
      html += renderMessagesView();
    }

    if (tab === "profile") {
      html += renderProfileView();
    }

    return html;
  }

  function renderMessagesView() {
    if (xhsState.messagePanel) {
      const notices = xhsDerived.selectedMessageNotifications;
      const listHtml = notices.length === 0
        ? `<div class="cp-xhs-mini-empty">暂无${xhsEscapeHtml(xhsDerived.selectedMessagePanelLabel)}通知</div>`
        : notices.map((notice, index) => `
          <button
            type="button"
            class="xhs-message-detail-card"
            ${notice.noteId ? `data-xhs-action="open-note" data-note-id="${xhsEscapeHtml(notice.noteId)}"` : ""}
          >
            ${xhsAvatar(`xhs-message-detail-avatar cp-xhs-thread-avatar--tone-${(index % 6) + 1}`, getNotificationAvatar(notice.actorName, notice.id), notice.actorName)}
            <div class="xhs-message-detail-copy">
              <div>
                <strong>${xhsEscapeHtml(notificationActorLabel(notice))}</strong>
                ${notice.type === "follow" ? "<em>你的粉丝</em>" : ""}
              </div>
              <span>${xhsEscapeHtml(formatNotificationAction(notice))} <time>${xhsEscapeHtml(formatTime(notice.createdAt))}</time></span>
              ${notice.type === "comment" ? `
                <p>${xhsBilingual(formatNotificationPreview(notice), "xiaohongshu", "inline", "", `msgprev:${notice.id}`)}</p>
              ` : ""}
            </div>
            <div class="xhs-message-detail-thumb">${renderNotificationThumbnail(notice)}</div>
          </button>`).join("");
      return `
        <section class="cp-xhs-panel cp-xhs-message-page xhs-message-detail-page">
          <div class="xhs-message-detail-list">${listHtml}</div>
        </section>`;
    }

    const panels = [
      { id: "engagement", label: "点赞和收藏", count: xhsDerived.engagementUnreadCount, icon: "heart", tone: "heart" },
      { id: "follow", label: "新增关注", count: xhsDerived.followUnreadCount, icon: "user", tone: "follow" },
      { id: "comment", label: "评论", count: xhsDerived.commentUnreadCount, icon: "chat", tone: "chat" },
    ];
    const overviewHtml = panels.map(panel => `
      <button type="button" class="cp-xhs-overview-card" data-xhs-action="open-message-panel" data-panel-id="${panel.id}">
        <div class="cp-xhs-overview-icon-wrapper">
          <div class="cp-xhs-overview-icon cp-xhs-overview-icon--${panel.tone}">${xhsOverviewGlyph(panel.icon)}</div>
          ${panel.count > 0 ? `<span class="cp-xhs-overview-badge">${xhsEscapeHtml(formatBadgeCount(panel.count))}</span>` : ""}
        </div>
        <span>${xhsEscapeHtml(panel.label)}</span>
      </button>`).join("");

    const threads = xhsDerived.dmThreads;
    const threadsHtml = threads.length === 0 ? `<div class="cp-xhs-mini-empty">暂无私信</div>` : threads.map((thread, index) => `
      <button type="button" class="cp-xhs-thread-card" data-xhs-action="open-dm-thread" data-thread-id="${xhsEscapeHtml(thread.id)}">
        ${xhsAvatar(`cp-xhs-thread-avatar cp-xhs-thread-avatar--tone-${(index % 6) + 1}`, getNotificationAvatar(thread.actorName, thread.id), thread.actorName)}
        <div class="cp-xhs-thread-meta">
          <div class="cp-xhs-thread-text">
            <span class="cp-xhs-thread-name">${xhsEscapeHtml(thread.actorName)}</span>
            <span class="cp-xhs-thread-preview">${xhsEscapeHtml(xhsGetPlainText(thread.latest.text))}</span>
          </div>
          <div class="cp-xhs-thread-status">
            <time class="cp-xhs-thread-time">${xhsEscapeHtml(formatTime(thread.latest.createdAt))}</time>
            ${thread.unreadCount > 0
              ? `<span class="cp-xhs-thread-unread-badge">${xhsEscapeHtml(formatBadgeCount(thread.unreadCount))}</span>`
              : `<span class="cp-xhs-thread-spacer"></span>`}
          </div>
        </div>
      </button>`).join("");

    return `
      <section class="cp-xhs-panel cp-xhs-message-page xhs-message-page">
        <div class="cp-xhs-message-overview">${overviewHtml}</div>
        <div class="xhs-message-section-title">
          <strong>私信</strong>
          ${threads.length > 0 ? `<span>${threads.length} 个对话</span>` : ""}
        </div>
        <div class="cp-xhs-thread-list">${threadsHtml}</div>
      </section>`;
  }

  function renderProfileView() {
    const profile = xhsData.profile;
    return `
      <section class="cp-xhs-profile xhs-profile">
        <div class="cp-xhs-profile-topbar ${xhsState.profileTopbarVisible ? "is-visible" : ""}">
          <button type="button" data-xhs-action="request-close" aria-label="返回桌面">${xhsIcon("chevron-left", 24, 2.4)}</button>
          <div>
            <button type="button" data-xhs-action="open-settings" aria-label="设置">${xhsIcon("more-horizontal", 22, 1.5)}</button>
          </div>
        </div>
        <div class="cp-xhs-profile-hero">
          <button
            type="button"
            class="cp-xhs-profile-cover"
            style="${xhsDerived.profileCoverStyle}"
            aria-label="更换主页背景图"
            data-xhs-action="pick-cover"
          ></button>
          <input type="file" accept="image/*" hidden data-xhs-role="profile-cover-input" />
          <div class="cp-xhs-profile-main">
            <div class="cp-xhs-profile-avatar-wrap">
              ${xhsAvatar("cp-xhs-profile-avatar", xhsDerived.userAvatar, profile.nickname)}
            </div>
            <div class="cp-xhs-profile-meta">
              <h3>${xhsEscapeHtml(profile.nickname)}${xhsIcon("chevron-down", 16, 2.3)}</h3>
              <span>小红书号：${xhsEscapeHtml(profile.handle)}</span>
              <span>IP 属地：${xhsEscapeHtml(profile.ipLocation)}</span>
            </div>
          </div>
          <div class="cp-xhs-profile-bio">
            <p>${xhsEscapeHtml(profile.signature)}</p>
            <em class="${xhsGetGenderClassName(profile.gender)}">${xhsEscapeHtml(profile.gender || "♀")}</em>
          </div>
          <div class="cp-xhs-profile-actions">
            <div class="cp-xhs-profile-stats">
              <div><strong>${xhsEscapeHtml(formatCount(xhsDerived.profileStats.followingCount))}</strong><span>关注</span></div>
              <div><strong>${xhsEscapeHtml(formatCount(xhsDerived.profileStats.followerCount))}</strong><span>粉丝</span></div>
              <div><strong>${xhsEscapeHtml(formatCount(xhsDerived.profileStats.likedAndSavedCount))}</strong><span>获赞与收藏</span></div>
            </div>
            <button type="button" class="cp-xhs-profile-edit" data-xhs-action="open-profile-edit">编辑资料</button>
            <button type="button" class="cp-xhs-profile-settings" aria-label="Profile settings" data-xhs-action="open-settings">
              ${xhsIcon("more-horizontal", 22, 1.5)}
            </button>
          </div>
          <div class="cp-xhs-profile-tools">
            <div><strong>创作灵感</strong><span>学创作找灵感</span></div>
            <div><strong>RED 创作大赛</strong><span>为新生代好作品助力</span></div>
            <div><strong>浏览记录</strong><span>看过的笔记</span></div>
          </div>
        </div>
        <div class="cp-xhs-profile-content">
          <div class="cp-xhs-profile-tabs">
            ${PROFILE_TABS.map(tab => `
              <button
                type="button"
                class="${xhsState.profileTab === tab.id ? "is-active" : ""}"
                data-xhs-action="select-profile-tab"
                data-tab-id="${tab.id}"
              >${xhsEscapeHtml(tab.label)}</button>`).join("")}
            ${xhsIcon("search", 20, 1.55)}
          </div>
          ${renderWaterfall(xhsDerived.profileColumns)}
        </div>
      </section>`;
  }
