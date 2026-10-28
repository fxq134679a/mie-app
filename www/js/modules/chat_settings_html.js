const chatSettingsHtml = `
        <header class="app-header">
            <button class="back-btn" data-target="chat-room-screen">‹</button>
            <div class="title-container">
                <h1 class="title">聊天设置</h1>
            </div>
            <div class="placeholder" style="display:flex;justify-content:flex-end;align-items:center;padding-right:14px;">
                <button type="submit" form="chat-settings-form" class="btn btn-primary" style="margin:0;padding:6px 16px;font-size:13px;border-radius:16px;white-space:nowrap;">保存</button>
            </div>
        </header>
        <main class="content">
            <div class="kkt-settings-container">
                <!-- 个人资料部分 -->
                <div class="kkt-profile-section">
                    <img src="" alt="Avatar" id="setting-char-avatar-preview" class="kkt-profile-avatar" onclick="document.getElementById('setting-char-avatar-upload').click()">
                    <div class="kkt-profile-name" id="setting-char-name-display"></div>
                    <!-- 隐藏的文件上传input -->
                    <input type="file" id="setting-char-avatar-upload" accept="image/*" style="display:none;">
                </div>

                <!-- Tab 导航栏 -->
                <div class="settings-tabs">
                    <div class="settings-tab-item active" data-tab="setting-tab-basic">设定</div>
                    <div class="settings-tab-item" data-tab="setting-tab-func">功能</div>
                    <div class="settings-tab-item" data-tab="setting-tab-style">美化</div>
                    <div class="settings-tab-item" data-tab="setting-tab-exclusive">专属</div>
                </div>

                <form id="chat-settings-form">
                    
                    <!-- 【设定】Tab 内容 -->
                    <div id="setting-tab-basic" class="settings-tab-content active">
                        <!-- 角色信息分组 -->
                        <div class="kkt-group">
                            <div class="kkt-item">
                                <div class="kkt-item-label">角色真名</div>
                                <div class="kkt-item-control">
                                    <input type="text" id="setting-char-realname" autocomplete="off" style="text-align:right; border:none; background:transparent;" placeholder="点击修改">
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">备注名</div>
                                <div class="kkt-item-control">
                                    <input type="text" id="setting-char-remark" autocomplete="off" style="text-align:right; border:none; background:transparent;" placeholder="点击修改">
                                </div>
                            </div>
                            <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                <div class="kkt-item-label" style="margin-bottom:8px;">角色人设</div>
                                <textarea id="setting-char-persona" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:80px;" placeholder="详细描述角色的性格..."></textarea>
                            </div>
                             <!-- 表情包分组 -->
                            <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                <div class="kkt-item-label" style="margin-bottom:8px;">可用表情包分组</div>
                                <div id="setting-char-sticker-groups-container" style="width:100%; max-height: 120px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 8px;">
                                    <!-- JS populate -->
                                </div>
                            </div>
                        </div>

                        <!-- 关联世界书 (移到我的信息前) -->
                        <div class="kkt-group" style="margin-top:15px;">
                            <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding-bottom: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px;">
                                    <div class="kkt-item-label">关联世界书</div>
                                    <div class="kkt-item-control">
                                        <button type="button" id="link-world-book-btn" class="btn btn-small btn-secondary" style="margin: 0; padding: 4px 8px;">设置</button>
                                    </div>
                                </div>
                                <div id="private-bound-worldbooks-wrapper" style="display: none; padding-bottom: 10px;">
                                    <div id="private-bound-worldbooks-toggle" style="font-size: 12px; color: #999; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                        <span>已绑定世界书 (<span id="private-bound-count">0</span>)</span>
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </div>
                                    <div id="private-bound-worldbooks-container" style="display: none; padding-top: 8px;">
                                        <div id="private-bound-worldbooks-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 我的信息分组 -->
                        <div class="kkt-group" style="margin-top:15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">我的头像</div>
                                <div class="kkt-item-control" onclick="document.getElementById('setting-my-avatar-upload').click()">
                                    <img src="" id="setting-my-avatar-preview" class="kkt-small-avatar">
                                    <span class="kkt-arrow">›</span>
                                </div>
                                <input type="file" id="setting-my-avatar-upload" accept="image/*" style="display:none;">
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">我的名字</div>
                                <div class="kkt-item-control">
                                    <input type="text" id="setting-my-name" autocomplete="off" style="text-align:right; border:none; background:transparent;" placeholder="点击修改">
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">我的昵称</div>
                                <div class="kkt-item-control">
                                    <input type="text" id="setting-my-remark-name" autocomplete="off" style="text-align:right; border:none; background:transparent;" placeholder="为空时显示我的名字">
                                </div>
                            </div>
                            <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                <div class="kkt-item-label" style="margin-bottom:8px;">我的人设</div>
                                <textarea id="setting-my-persona" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:60px;" placeholder="描述你的形象..."></textarea>
                            </div>
                            <!-- 人设预设 -->
                            <div class="kkt-item">
                                 <div class="kkt-item-label">人设预设</div>
                                 <div class="kkt-item-control">
                                     <select id="mypersona-preset-select" style="border:none; bg:transparent; width:100px;"><option value="">选择</option></select>
                                     <button type="button" id="mypersona-apply-btn" class="btn btn-small btn-primary" style="padding:4px 8px; margin-left:5px;">应用</button>
                                     <button type="button" id="mypersona-save-btn" class="btn btn-small" style="padding:4px 8px; margin-left:5px;">存</button>
                                     <button type="button" id="mypersona-manage-btn" class="btn btn-small" style="padding:4px 8px; margin-left:5px;">管</button>
                                 </div>
                            </div>
                        </div>
                    </div>

                    <!-- 【功能】Tab 内容 -->
                    <div id="setting-tab-func" class="settings-tab-content">
                        <!-- 聊天增强 -->
                        <div class="kkt-group">
                            <div class="kkt-item">
                                <div class="kkt-item-label">最大记忆轮数</div>
                                <div class="kkt-item-control">
                                    <input type="number" id="setting-max-memory" value="100" min="1" style="width:50px; text-align:right; border:none;">
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">双语聊天模式</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-bilingual-mode">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">韩语学习模式</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-korean-mode">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" id="setting-bilingual-style-container">
                                <div class="kkt-item-label">翻译显示样式</div>
                                <div class="kkt-item-control">
                                    <select id="setting-bilingual-style" style="border:none; background:transparent; text-align:right;">
                                        <option value="under">气泡外 (默认)</option>
                                        <option value="inner">气泡内</option>
                                        <option value="inner-no-line">气泡内 (无分割线)</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">自定义回复条数</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-reply-count-enabled">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                        
                            <div class="kkt-item" id="setting-reply-count-container" style="display: none;">
                                <div class="kkt-item-label">回复条数范围</div>
                                <div class="kkt-item-control" style="gap: 5px;">
                                    <input type="number" id="setting-reply-count-min" value="3" min="1" style="width:30px; text-align:center; border:none; background: rgba(0,0,0,0.05); border-radius: 4px;">
                                    <span style="color:#999;">-</span>
                                    <input type="number" id="setting-reply-count-max" value="8" min="1" style="width:30px; text-align:center; border:none; background: rgba(0,0,0,0.05); border-radius: 4px;">
                                </div>
                            </div>
                        </div>

                        <!-- 互动功能控制中心 -->
                        <div class="feature-control-center" style="margin-top: 15px;">
                            <div class="feature-grid">
                                <!-- 主动发消息（默认关闭，可在角色设置里自行开启） -->
                                <div class="feature-card" data-feature="auto-reply">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M7.5 10h.01M12 10h.01M16.5 10h.01"></path></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-auto-reply-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">主动发消息</div>
                                        <div class="feature-card-desc">她会自己来找你（默认关闭）</div>
                                    </div>
                                </div>

                                <!-- 真实相册 -->
                                <div class="feature-card" data-feature="gallery">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-use-real-gallery">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">真实相册</div>
                                        <div class="feature-card-desc">匹配相册图片发送</div>
                                    </div>
                                </div>

                                <!-- 朋友圈互动 -->
                                <div class="feature-card" data-feature="moments">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-moments-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">朋友圈互动</div>
                                        <div class="feature-card-desc">允许角色发动态</div>
                                    </div>
                                </div>

                                <!-- 商城互动 -->
                                <div class="feature-card" data-feature="shop">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-shop-interaction-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">商城互动</div>
                                        <div class="feature-card-desc">允许角色购买商品</div>
                                    </div>
                                </div>

                                <!-- 视频通话 -->
                                <div class="feature-card" data-feature="call">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-video-call-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">主动通话</div>
                                        <div class="feature-card-desc">允许角色发起通话</div>
                                    </div>
                                </div>

                                <!-- 角色状态栏 -->
                                <div class="feature-card" data-feature="status">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 12h12M6 8h12M6 16h12"></path></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-status-panel-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">角色状态栏</div>
                                        <div class="feature-card-desc">显示角色实时状态</div>
                                    </div>
                                </div>

                                <!-- 自动隔空投送 -->
                                <div class="feature-card" data-feature="auto-airdrop">
                                    <div class="feature-card-header">
                                        <div class="feature-card-icon">
                                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4zM6 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6z"/><path d="M8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1.599 4.058a.5.5 0 0 1 .208.676A6.967 6.967 0 0 0 1 8c0 1.18.292 2.292.807 3.266a.5.5 0 0 1-.884.468A7.968 7.968 0 0 1 0 8c0-1.347.334-2.619.923-3.734a.5.5 0 0 1 .676-.208zm12.802 0a.5.5 0 0 1 .676.208A7.967 7.967 0 0 1 16 8a7.967 7.967 0 0 1-.923 3.734.5.5 0 0 1-.884-.468A6.967 6.967 0 0 0 15 8c0-1.18-.292-2.292-.807-3.266a.5.5 0 0 1 .208-.676zM3.057 5.534a.5.5 0 0 1 .284.648A4.986 4.986 0 0 0 3 8c0 .642.12 1.255.34 1.818a.5.5 0 1 1-.93.364A5.986 5.986 0 0 1 2 8c0-.769.145-1.505.41-2.182a.5.5 0 0 1 .647-.284zm9.886 0a.5.5 0 0 1 .648.284C13.855 6.495 14 7.231 14 8c0 .769-.145 1.505-.41 2.182a.5.5 0 0 1-.93-.364C12.88 9.255 13 8.642 13 8c0-.642-.12-1.255-.34-1.818a.5.5 0 0 1 .283-.648z"/></svg>
                                        </div>
                                        <label class="kkt-switch">
                                            <input type="checkbox" id="setting-auto-airdrop-enabled">
                                            <span class="kkt-slider"></span>
                                        </label>
                                    </div>
                                    <div class="feature-card-body">
                                        <div class="feature-card-title">自动隔空投送</div>
                                        <div class="feature-card-desc">角色发图时自动接收</div>
                                    </div>
                                </div>
                            </div>

                            <!-- 状态栏详细设置 (折叠面板) -->
                            <div id="status-panel-settings-container" class="feature-details-panel">
                                <div class="kkt-group">
                                    <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                        <div class="preset-select-container" style="width: 100%; margin-bottom: 10px;">
                                            <label class="preset-select-label">快速填充预设</label>
                                            <div style="display:flex; gap:5px; align-items:center;">
                                                <select id="setting-status-preset-select" style="flex:1; border: 1px solid #eee; border-radius: 6px; padding: 6px;">
                                                    <option value="">-- 选择预设自动填充 --</option>
                                                </select>
                                                <button type="button" id="quick-save-status-preset-btn" class="btn btn-small" style="padding: 6px 12px; white-space: nowrap;">存</button>
                                            </div>
                                        </div>
                                        <div class="kkt-item-label" style="margin-bottom:8px;">状态栏格式要求 (Prompt Suffix)</div>
                                        <textarea id="setting-status-prompt-suffix" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:60px;" placeholder="例如：请在回复末尾输出状态码：[HP:xx]"></textarea>
                                    </div>
                                    <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                        <div class="kkt-item-label" style="margin-bottom:8px;">提取正则 (Regex Pattern)</div>
                                        <input type="text" id="setting-status-regex" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px;" placeholder="例如：\\[HP:(\\d+)\\]">
                                    </div>
                                    <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                                        <div class="kkt-item-label" style="margin-bottom:8px;">正则替换式 (HTML Template)</div>
                                        <textarea id="setting-status-replace" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:60px;" placeholder='例如：<div class="hp-bar" style="width:$1%"></div>'></textarea>
                                    </div>
                                    <div class="kkt-item">
                                        <div class="kkt-item-label">仅发送最近 x 个状态栏</div>
                                        <div class="kkt-item-control">
                                            <input type="number" id="setting-status-history-limit" value="3" min="0" style="width:50px; text-align:right; border:none; background: #f5f5f5; border-radius: 4px; padding: 4px;">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 主动发消息详细设置 (折叠面板) -->
                            <div id="auto-reply-settings-container" class="feature-details-panel">
                                <div class="kkt-group">
                                    <div class="kkt-item">
                                        <div class="kkt-item-label">安静多久后主动找你 (分钟)</div>
                                        <div class="kkt-item-control">
                                            <input type="number" id="setting-auto-reply-interval" value="60" min="1" style="width:50px; text-align:right; border:none; background: #f5f5f5; border-radius: 4px; padding: 4px;">
                                        </div>
                                    </div>
                                    <div class="kkt-item" style="display:block;">
                                        <div style="font-size:12px; line-height:1.7; color:#999;">
                                            开启后她会主动来找你：打开 App 时会替你排好接下来一天的呼唤，<b>App 关着也会准时提醒</b>。关掉则不再收到任何主动消息（已排好的会一起取消）。
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button type="button" class="kkt-danger-btn" id="clear-chat-history-btn">清空聊天记录</button>
                    </div>

                    <!-- 【专属】Tab 内容 -->
                    <div id="setting-tab-exclusive" class="settings-tab-content">
                        <!-- 专属模型 -->
                        <div class="kkt-group">
                            <div class="kkt-item">
                                <div class="kkt-item-label">使用专属模型</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-exclusive-api-enabled">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" id="setting-exclusive-api-container" style="display: none;">
                                <div class="kkt-item-label">选择 API 预设</div>
                                <div class="kkt-item-control">
                                    <select id="setting-exclusive-api-preset-select" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px;">
                                        <option value="">请选择预设</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                        </div>

                        <!-- 专属提示词与思维链 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">专属提示词版本</div>
                                <div class="kkt-item-control">
                                    <select id="setting-exclusive-prompt-version" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px;">
                                        <option value="">跟随全局</option>
                                        <option value="uwu">UwU</option>
                                        <option value="tt">T.T</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">专属聊天预设</div>
                                <div class="kkt-item-control">
                                    <select id="setting-exclusive-chat-preset" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px; max-width: 150px;">
                                        <option value="">跟随全局</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">专属思维链预设</div>
                                <div class="kkt-item-control">
                                    <select id="setting-exclusive-cot-preset" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px; max-width: 150px;">
                                        <option value="">跟随全局</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                        </div>

                        <!-- 专属绘图工坊配置 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">专属绘图提示词预设</div>
                                <div class="kkt-item-control">
                                    <select id="setting-exclusive-workshop-preset" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px; max-width: 150px;">
                                        <option value="">跟随全局</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                        </div>

                        <!-- 专属消息提示音 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">专属提示音</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-char-sound-enabled">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <!-- 通话自动播放语音 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">语音通话播放声音</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-char-call-voice">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" style="border-bottom: none;">
                                <div style="font-size: 11px; color: #999; line-height: 1.5; padding: 4px 0;">开启后，和TA通话时TA回复的话会自动生成并播放语音，声音会保存进通话记录</div>
                            </div>
                        </div>
                        <!-- 通话环境音识别 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">通话环境音识别</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-char-call-sound-watch">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" style="border-bottom: none;">
                                <div style="font-size: 11px; color: #999; line-height: 1.5; padding: 4px 0;">开启后通话时，手机会自动听出你身边的声音（喘息、水声、拍打、震动等），以提示的形式告诉TA。识别全部在本机完成，不上传。首次使用需授权麦克风</div>
                            </div>
                        </div>
                        <div id="char-sound-settings-container" style="display: none;">
                            <div style="background: #f9f9f9; border-radius: 12px; padding: 12px; margin-top: 8px; border: 1px solid #f0f0f0;">
                                <div style="margin-bottom: 12px;">
                                    <label style="font-weight: bold; font-size: 12px; color: #666; display: block; margin-bottom: 5px;">发送提示音</label>
                                    <div style="display: flex; gap: 6px; align-items: center;">
                                        <input type="url" id="char-send-sound-url" placeholder="音频URL" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 7px; font-size: 12px; min-width: 0;">
                                        <input type="file" id="char-send-sound-upload" accept="audio/*,video/mp4" style="display: none;">
                                        <label for="char-send-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer; padding: 6px 8px; font-size: 12px;">📂</label>
                                        <button type="button" id="char-test-send-sound-btn" class="btn btn-primary btn-small" style="margin: 0; padding: 6px 10px;">▶</button>
                                        <button type="button" id="char-reset-send-sound-btn" class="btn btn-danger btn-small" style="margin: 0; padding: 6px 10px;">×</button>
                                    </div>
                                </div>
                                <div style="margin-bottom: 12px;">
                                    <label style="font-weight: bold; font-size: 12px; color: #666; display: block; margin-bottom: 5px;">收到回复提示音</label>
                                    <div style="display: flex; gap: 6px; align-items: center;">
                                        <input type="url" id="char-receive-sound-url" placeholder="音频URL" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 7px; font-size: 12px; min-width: 0;">
                                        <input type="file" id="char-receive-sound-upload" accept="audio/*,video/mp4" style="display: none;">
                                        <label for="char-receive-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer; padding: 6px 8px; font-size: 12px;">📂</label>
                                        <button type="button" id="char-test-receive-sound-btn" class="btn btn-primary btn-small" style="margin: 0; padding: 6px 10px;">▶</button>
                                        <button type="button" id="char-reset-receive-sound-btn" class="btn btn-danger btn-small" style="margin: 0; padding: 6px 10px;">×</button>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <label style="font-weight: bold; font-size: 12px; color: #666;">多条消息连续提示音</label>
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="char-multi-msg-sound-switch">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                                <div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                        <label style="color:#888;font-size:12px;white-space:nowrap;">预设库</label>
                                        <select id="char-sound-preset-select" style="flex:1;padding:5px;border-radius:6px;border:1px solid #ddd;font-size:12px;background:transparent;min-width:0;"><option value="">— 选择 —</option></select>
                                    </div>
                                    <div style="display:flex;gap:6px;justify-content:flex-end;">
                                        <button type="button" id="char-sound-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;font-size:12px;">应用</button>
                                        <button type="button" id="char-sound-save-preset-btn" class="btn btn-small" style="padding:4px 8px;font-size:12px;">保存为预设</button>
                                        <button type="button" id="char-sound-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;font-size:12px;">管理</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- 聊天特效 -->
                        <div class="kkt-group" style="margin-top: 15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">星尘雾</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-stardust-enabled">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div style="font-size: 11px; color: #999; line-height: 1.5; padding: 4px 0;">开启后，TA 偶尔会把半句话藏进星尘雾里，点一下气泡才看得到</div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">贴表情</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-sticker-reaction-enabled">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" style="border-bottom: none;">
                                <div style="font-size: 11px; color: #999; line-height: 1.5; padding: 4px 0;">开启后，TA 会看心情给你的消息贴表情，也可能会往聊天背景贴 emoji</div>
                            </div>
                        </div>
                    </div>

                    <!-- 【美化】Tab 内容 -->
                    <div id="setting-tab-style" class="settings-tab-content">
                        <!-- 聊天环境分组 -->
                        <div class="kkt-group">
                            <div class="kkt-item">
                                <div class="kkt-item-label">聊天背景</div>
                                <div class="kkt-item-control">
                                    <span onclick="document.getElementById('setting-chat-bg-upload').click()" style="cursor:pointer; color:var(--primary-color);">点击更换</span>
                                    <span style="margin: 0 8px; color: #eee;">|</span>
                                    <span id="reset-chat-bg-btn" style="cursor:pointer; color:#999;">恢复默认</span>
                                </div>
                                <input type="file" id="setting-chat-bg-upload" accept="image/*" style="display:none;">
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">主题颜色</div>
                                <div class="kkt-item-control">
                                    <select id="setting-theme-color" style="border:none; background:transparent; text-align:right;"></select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">头像显示模式</div>
                                <div class="kkt-item-control">
                                    <select id="setting-avatar-mode" style="border:none; background:transparent; text-align:right;">
                                        <option value="full">全部显示</option>
                                        <option value="merge">气泡合并</option>
                                        <option value="kkt">KKT模式</option>
                                        <option value="hidden">隐藏头像</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">顶部标题布局</div>
                                <div class="kkt-item-control">
                                    <select id="setting-title-layout" style="border:none; background:transparent; text-align:right;">
                                        <option value="left">居左 (默认)</option>
                                        <option value="center">居中</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">显示时间戳</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-show-timestamp">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" id="setting-timestamp-style-container">
                                <div class="kkt-item-label">时间戳位置</div>
                                <div class="kkt-item-control">
                                    <select id="setting-timestamp-style" style="border:none; background:transparent; text-align:right;">
                                        <option value="bubble">跟随气泡</option>
                                        <option value="avatar">头像下方</option>
                                    </select>
                                    <span class="kkt-arrow">›</span>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">顶部显示在线状态</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-show-status">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">聊天内显示状态更新消息</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-show-status-update-msg">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item">
                                <div class="kkt-item-label">气泡磨砂效果</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-bubble-blur">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding-bottom: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                    <div class="kkt-item-label">头像圆角</div>
                                    <span id="setting-avatar-radius-value" style="color: var(--primary-color); font-weight: bold;">50%</span>
                                </div>
                                <input type="range" id="setting-avatar-radius" min="0" max="50" step="1" value="50" style="width: 100%; accent-color: var(--primary-color);">
                            </div>
                        </div>

                        <!-- 头像框分组 -->
                        <div class="kkt-group" style="margin-top:15px;">
                            <div class="kkt-item" id="setting-avatar-frame-entry" style="cursor:pointer;">
                                <div class="kkt-item-label">头像框设置</div>
                                <div class="kkt-item-control"><span class="kkt-arrow">›</span></div>
                            </div>
                        </div>

                        <!-- 气泡样式分组 -->
                        <div class="kkt-group" style="margin-top:15px;">
                            <div class="kkt-item">
                                <div class="kkt-item-label">自定义气泡样式</div>
                                <div class="kkt-item-control">
                                    <label class="kkt-switch">
                                        <input type="checkbox" id="setting-use-custom-css">
                                        <span class="kkt-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="kkt-item" style="display:block;">
                                 <div id="private-bubble-css-preview" class="bubble-css-preview" style="margin-bottom:10px;"></div>
                                 <div id="private-bubble-author-note" style="font-size: 12px; color: #999; margin-bottom: 5px; display: none;"></div>
                                 
                                 <!-- 私聊 CSS 搜索替换工具栏 -->
                                 <div class="textarea-edit-toolbar" id="private-css-toolbar">
                                    <button type="button" class="toolbar-toggle-btn" title="搜索与替换">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    </button>
                                    <div class="toolbar-main-box" style="display: none;">
                                        <div class="toolbar-search-row">
                                            <input type="text" class="toolbar-search-input" placeholder="搜索...">
                                            <span class="toolbar-match-count">0/0</span>
                                            <button type="button" class="toolbar-prev-btn" title="上一个">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                            </button>
                                            <button type="button" class="toolbar-next-btn" title="下一个">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                            </button>
                                            <button type="button" class="toolbar-expand-replace-btn" title="展开替换">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>
                                            </button>
                                        </div>
                                        <div class="toolbar-replace-row" style="display: none;">
                                            <input type="text" class="toolbar-replace-input" placeholder="替换为...">
                                            <button type="button" class="toolbar-replace-btn" title="替换当前">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                            </button>
                                            <button type="button" class="toolbar-replace-all-btn" title="全部替换">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                 </div>

                                 <textarea id="setting-custom-bubble-css" rows="4" placeholder="CSS代码..." style="width:100%; border:1px solid #eee; border-radius:8px; padding:5px;" disabled></textarea>
                                 <div style="display:flex; justify-content:flex-end; gap:5px; margin-top:5px; flex-wrap: wrap;">
                                     <select id="bubble-preset-select" style="width:100px;"><option value="">预设</option></select>
                                     <button type="button" id="apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                                     <button type="button" id="save-preset-btn" class="btn btn-small" style="padding:4px 8px;">存</button>
                                     <button type="button" id="manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管</button>
                                     <button type="button" id="export-preset-btn" class="btn btn-small" style="padding:4px 8px;">导出</button>
                                     <button type="button" id="import-preset-btn" class="btn btn-small" style="padding:4px 8px;">导入</button>
                                     <button type="button" id="reset-custom-bubble-css-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">重置</button>
                                 </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </main>

        <!-- 头像框设置弹窗 -->
        <div id="avatar-frame-modal" class="modal-overlay">
            <div class="modal-window" style="width: 320px; max-height: 86%; overflow-y: auto; padding: 16px; border-radius: 20px;">
                <div class="afm-title">头像框设置</div>

                <!-- 顶部双预览：点击选中要编辑的一侧 -->
                <div class="afm-preview-row">
                    <div class="afm-side selected" id="afm-side-char">
                        <div class="afm-preview-box avatar-frame-wrap" id="af-char-preview-box">
                            <img id="af-char-avatar" class="af-avatar" src="" alt="">
                        </div>
                        <div class="afm-side-label">角色</div>
                    </div>
                    <div class="afm-side" id="afm-side-my">
                        <div class="afm-preview-box avatar-frame-wrap" id="af-my-preview-box">
                            <img id="af-my-avatar" class="af-avatar" src="" alt="">
                        </div>
                        <div class="afm-side-label">我</div>
                    </div>
                </div>

                <!-- 当前选中侧的操作 -->
                <div class="afm-ops-row">
                    <button type="button" class="btn btn-small btn-primary" id="afm-upload-btn" style="padding:6px 14px;">上传图片</button>
                    <button type="button" class="btn btn-small btn-neutral" id="afm-remove-btn" style="padding:6px 14px;">移除头像框</button>
                    <input type="file" id="afm-upload" accept="image/*" style="display:none;">
                </div>

                <!-- 头像库（最多展示4个，点击打开「全部头像框」弹窗） -->
                <div class="afm-lib">
                    <div class="afm-lib-header">
                        <span class="afm-lib-title">头像库</span>
                        <span class="afm-lib-actions">
                            <button type="button" class="afm-mini-btn" id="afm-lib-upload-btn">批量上传</button>
                            <input type="file" id="afm-lib-upload" accept="image/*" multiple style="display:none;">
                        </span>
                    </div>
                    <div class="afm-lib-grid" id="afm-lib-grid"></div>
                    <div class="afm-lib-more" id="afm-lib-more">查看全部头像框 ›</div>
                    <div class="afm-lib-empty" id="afm-lib-empty">头像库是空的，点击「批量上传」添加头像框素材</div>
                </div>

                <!-- 位置与大小调整（作用于当前选中侧） -->
                <div class="afm-sliders">
                    <div class="afm-slider-title" id="afm-slider-title">调整「角色」的头像框</div>
                    <div class="af-slider-row"><span>左右</span><input type="range" id="af-dx" min="-40" max="40" step="1" value="0"><span class="af-val" id="af-dx-val">0</span></div>
                    <div class="af-slider-row"><span>上下</span><input type="range" id="af-dy" min="-40" max="40" step="1" value="0"><span class="af-val" id="af-dy-val">0</span></div>
                    <div class="af-slider-row"><span>大小</span><input type="range" id="af-scale" min="60" max="180" step="5" value="100"><span class="af-val" id="af-scale-val">100%</span></div>
                </div>

                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" class="btn btn-neutral" id="af-cancel-btn" style="flex:1;">取消</button>
                    <button type="button" class="btn btn-primary" id="af-save-btn" style="flex:1;">保存</button>
                </div>
            </div>
        </div>

        <!-- 全部头像框选择弹窗（点击头像框实时应用到顶部预览） -->
        <div id="afm-all-modal" class="modal-overlay">
            <div class="modal-window" style="width: 320px; max-height: 80%; overflow-y: auto; padding: 16px; border-radius: 20px;">
                <div class="afm-title">选择头像框</div>
                <div class="afm-lib">
                    <div class="afm-lib-header">
                        <span class="afm-lib-title">全部头像框</span>
                        <span class="afm-lib-actions">
                            <button type="button" class="afm-mini-btn" id="afm-all-upload-btn">批量上传</button>
                            <button type="button" class="afm-mini-btn" id="afm-all-manage-btn">批量删除</button>
                            <input type="file" id="afm-all-upload" accept="image/*" multiple style="display:none;">
                        </span>
                    </div>
                    <div class="afm-lib-grid" id="afm-all-grid"></div>
                    <div class="afm-lib-manage-bar" id="afm-all-manage-bar" style="display:none;">
                        <button type="button" class="afm-mini-btn danger" id="afm-all-delete-btn">删除选中 (0)</button>
                        <button type="button" class="afm-mini-btn" id="afm-all-done-btn">完成</button>
                    </div>
                    <div class="afm-lib-empty" id="afm-all-empty">还没有头像框，点击「批量上传」添加</div>
                </div>
                <button type="button" class="btn btn-neutral" id="afm-all-close-btn" style="width:100%; margin-top:12px;">关闭</button>
            </div>
        </div>
`;

function injectChatSettingsHtml() {
    const container = document.getElementById('chat-settings-screen');
    if (container) {
        container.innerHTML = chatSettingsHtml;
    }
}
