const groupSettingsHtml = `
        <header class="app-header">
            <button class="back-btn" data-target="chat-room-screen">‹</button>
            <div class="title-container">
                <h1 class="title">群聊设置</h1>
            </div>
            <div class="placeholder"></div>
        </header>
        <main class="content">
            <div class="kkt-settings-container">
                <!-- 群信息头部 (模仿个人资料) -->
                <div class="kkt-profile-section">
                    <img src="" alt="群头像" id="setting-group-avatar-preview" class="kkt-profile-avatar" onclick="document.getElementById('setting-group-avatar-upload').click()">
                    <!-- 隐藏的文件上传input -->
                    <input type="file" id="setting-group-avatar-upload" accept="image/*" style="display:none;">
                    <!-- 群名直接在这里显示/编辑 -->
                    <input type="text" id="setting-group-name" autocomplete="off" class="kkt-profile-name-input" placeholder="输入群名" style="text-align:center; border:none; background:transparent; font-size:18px; font-weight:bold; margin-top:10px; width:80%;">
                </div>

                <form id="group-settings-form">
                    <!-- 我的信息分组 -->
                    <div class="kkt-group">
                        <div class="kkt-item">
                            <div class="kkt-item-label">我的头像</div>
                            <div class="kkt-item-control" onclick="document.getElementById('setting-group-my-avatar-upload').click()">
                                <img src="" id="setting-group-my-avatar-preview" class="kkt-small-avatar">
                                <span class="kkt-arrow">›</span>
                            </div>
                            <input type="file" id="setting-group-my-avatar-upload" accept="image/*" style="display:none;">
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">我的群昵称</div>
                            <div class="kkt-item-control">
                                <input type="text" id="setting-group-my-nickname" autocomplete="off" style="text-align:right; border:none; background:transparent;" placeholder="点击修改">
                            </div>
                        </div>
                        <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                            <div class="kkt-item-label" style="margin-bottom:8px;">我的人设</div>
                            <textarea id="setting-group-my-persona" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:60px;" placeholder="描述你在此群的形象..."></textarea>
                        </div>
                    </div>

                    <!-- 群成员管理分组 -->
                    <div class="kkt-group" style="margin-top:15px;">
                        <div class="kkt-item" style="display:block;">
                            <div class="kkt-item-label" style="margin-bottom:10px;">群成员</div>
                            <div class="group-members-list" id="group-members-list-container" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 10px;"></div>
                        </div>
                    </div>

                    <!-- 群公告设置分组 -->
                    <div class="kkt-group" style="margin-top:15px;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">启用群公告</div>
                            <div class="kkt-item-control">
                                <label class="kkt-switch">
                                    <input type="checkbox" id="setting-group-show-notice">
                                    <span class="kkt-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                            <div class="kkt-item-label" style="margin-bottom:8px;">公告内容</div>
                            <textarea id="setting-group-notice" style="width:100%; border:1px solid #eee; border-radius:8px; padding:8px; min-height:80px;" placeholder="输入群公告，将作为当前剧情背景..."></textarea>
                        </div>
                    </div>

                    <!-- 专属模型 -->
                    <div class="kkt-group" style="margin-top: 15px;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">使用专属模型</div>
                            <div class="kkt-item-control">
                                <label class="kkt-switch">
                                    <input type="checkbox" id="setting-group-exclusive-api-enabled">
                                    <span class="kkt-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" id="setting-group-exclusive-api-container" style="display: none;">
                            <div class="kkt-item-label">选择 API 预设</div>
                            <div class="kkt-item-control">
                                <select id="setting-group-exclusive-api-preset-select" style="border:none; background:transparent; text-align:right; direction: rtl; appearance: none; -webkit-appearance: none; padding-right: 15px;">
                                    <option value="">请选择预设</option>
                                </select>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                    </div>

                    <!-- 功能开关分组 (私聊八卦) -->
                    <div class="kkt-group" style="margin-top: 15px;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">开启允许群内私聊</div>
                            <div class="kkt-item-control">
                                <label class="kkt-switch">
                                    <input type="checkbox" id="setting-group-allow-gossip">
                                    <span class="kkt-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">双语聊天模式</div>
                            <div class="kkt-item-control">
                                <label class="kkt-switch">
                                    <input type="checkbox" id="setting-group-bilingual-mode">
                                    <span class="kkt-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" id="setting-group-bilingual-style-container">
                            <div class="kkt-item-label">翻译显示样式</div>
                            <div class="kkt-item-control">
                                <select id="setting-group-bilingual-style" style="border:none; background:transparent; text-align:right;">
                                    <option value="under">气泡外 (默认)</option>
                                    <option value="inner">气泡内</option>
                                    <option value="inner-no-line">气泡内 (无分割线)</option>
                                </select>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                    </div>

                    <!-- 表情包设置分组 -->
                    <div class="kkt-group" style="margin-top:15px;">
                        <div class="kkt-item" style="flex-direction:column; align-items:flex-start;">
                            <div class="kkt-item-label" style="margin-bottom:8px;">可用表情包分组</div>
                            <div id="setting-group-sticker-groups-container" style="width:100%; max-height: 120px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 8px;">
                                <!-- JS populate -->
                            </div>
                        </div>
                    </div>

                    <!-- 聊天环境分组 -->
                    <div class="kkt-group" style="margin-top:15px;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">聊天背景</div>
                            <div class="kkt-item-control">
                                <span onclick="document.getElementById('setting-group-chat-bg-upload').click()" style="cursor:pointer; color:var(--primary-color);">点击更换</span>
                                <span style="margin: 0 8px; color: #eee;">|</span>
                                <span id="reset-group-chat-bg-btn" style="cursor:pointer; color:#999;">恢复默认</span>
                            </div>
                            <input type="file" id="setting-group-chat-bg-upload" accept="image/*" style="display:none;">
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">主题颜色</div>
                            <div class="kkt-item-control">
                                <select id="setting-group-theme-color" style="border:none; background:transparent; text-align:right;"></select>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">最大记忆轮数</div>
                            <div class="kkt-item-control">
                                <input type="number" id="setting-group-max-memory" value="100" min="1" style="width:50px; text-align:right; border:none;">
                            </div>
                        </div>
                        <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding-bottom: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px;">
                                <div class="kkt-item-label">关联世界书</div>
                                <div class="kkt-item-control">
                                    <button type="button" id="link-group-world-book-btn" class="btn btn-small btn-secondary" style="margin: 0; padding: 4px 8px;">设置</button>
                                </div>
                            </div>
                            <div id="group-bound-worldbooks-wrapper" style="display: none; padding-bottom: 10px;">
                                <div id="group-bound-worldbooks-toggle" style="font-size: 12px; color: #999; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    <span>已绑定世界书 (<span id="group-bound-count">0</span>)</span>
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                                <div id="group-bound-worldbooks-container" style="display: none; padding-top: 8px;">
                                    <div id="group-bound-worldbooks-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">显示时间戳</div>
                            <div class="kkt-item-control">
                                <label class="kkt-switch">
                                    <input type="checkbox" id="setting-group-show-timestamp">
                                    <span class="kkt-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" id="setting-group-timestamp-style-container">
                            <div class="kkt-item-label">时间戳位置</div>
                            <div class="kkt-item-control">
                                <select id="setting-group-timestamp-style" style="border:none; background:transparent; text-align:right;">
                                    <option value="bubble">跟随气泡</option>
                                    <option value="avatar">头像下方</option>
                                </select>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                        <div class="kkt-item">
                            <div class="kkt-item-label">顶部标题布局</div>
                            <div class="kkt-item-control">
                                <select id="setting-group-title-layout" style="border:none; background:transparent; text-align:right;">
                                    <option value="left">居左 (默认)</option>
                                    <option value="center">居中</option>
                                </select>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                        <div class="kkt-item" style="flex-direction: column; align-items: stretch; padding-bottom: 15px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <div class="kkt-item-label">头像圆角</div>
                                <span id="setting-group-avatar-radius-value" style="color: var(--primary-color); font-weight: bold;">50%</span>
                            </div>
                            <input type="range" id="setting-group-avatar-radius" min="0" max="50" step="1" value="50" style="width: 100%; accent-color: var(--primary-color);">
                        </div>
                    </div>

                    <!-- 气泡库（图片气泡主题，A / B 模式通用）：点击打开全屏气泡库 -->
                    <div class="kkt-group" id="group-bubble-library-group" style="margin-top:15px;">
                        <div class="kkt-item" id="group-bubble-library-entry" style="cursor:pointer;">
                            <div class="kkt-item-label">气泡库</div>
                            <div class="kkt-item-control">
                                <span id="group-bubble-library-entry-name" style="font-size:12px;color:#999;">默认气泡</span>
                                <span class="kkt-arrow">›</span>
                            </div>
                        </div>
                    </div>

                    <!-- 成员专属气泡：从气泡库为每个群成员单独选气泡；没设的成员用群聊原有气泡样式 -->
                    <div class="kkt-group" id="group-member-bubble-group" style="margin-top:15px;">
                        <div class="kkt-item" style="flex-direction: column; align-items: stretch;">
                            <div class="kkt-item-label" style="margin-bottom:8px;">成员专属气泡</div>
                            <div id="group-member-bubble-list"></div>
                            <div style="font-size:11px;color:#999;margin-top:8px;line-height:1.5;">点成员选气泡库气泡；选「默认气泡」清除专属。没设专属的成员使用上方气泡库/自定义气泡样式的效果，聊天页 CSS 不受影响。</div>
                        </div>
                    </div>

                    <!-- 成员专属头像框：默认折叠，点击标题展开后为每个群成员单独设置头像框 -->
                    <div class="kkt-group" id="group-member-avatar-frame-group" style="margin-top:15px;">
                        <div class="kkt-item" id="group-member-avatar-frame-toggle" style="cursor:pointer;">
                            <div class="kkt-item-label">成员专属头像框</div>
                            <div class="kkt-item-control">
                                <span id="group-member-avatar-frame-count" style="font-size:12px;color:#999;">0 人已设置</span>
                                <svg class="maf-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                        <div id="group-member-avatar-frame-panel" style="display:none; padding: 0 15px 12px;">
                            <div id="group-member-avatar-frame-list"></div>
                            <div style="font-size:11px;color:#999;margin-top:8px;line-height:1.5;">点成员设置专属头像框（头像框库与私聊共用，可上传）。没设的成员不套头像框。</div>
                        </div>
                    </div>

                    <!-- 气泡样式分组（B 模式专用，A 模式下隐藏） -->
                    <div class="kkt-group" id="b-group-bubble-style-group" style="margin-top:15px;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">自定义气泡样式</div>
                            <div class="kkt-item-control">
                                <label class="mono-switch" data-ios-cb-skip data-native-toggle>
                                    <input type="checkbox" class="ms-input" id="setting-group-use-custom-css">
                                    <span class="mono-track"></span>
                                    <span class="mono-knob"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" style="display:block;">
                             <div id="group-bubble-css-preview" class="bubble-css-preview" style="margin-bottom:10px;"></div>
                             <div id="group-bubble-author-note" style="font-size: 12px; color: #999; margin-bottom: 5px; display: none;"></div>
                             
                             <!-- 群聊 CSS 搜索替换工具栏 -->
                             <div class="textarea-edit-toolbar" id="group-css-toolbar">
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
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 19"></polyline></svg>
                                        </button>
                                        <button type="button" class="toolbar-replace-all-btn" title="全部替换">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                                        </button>
                                    </div>
                                </div>
                             </div>

                             <textarea id="setting-group-custom-bubble-css" rows="4" placeholder="CSS代码..." style="width:100%; border:1px solid #eee; border-radius:8px; padding:5px;" disabled></textarea>
                             <div style="display:flex; justify-content:flex-end; gap:5px; margin-top:5px; flex-wrap: wrap;">
                                 <select id="group-bubble-preset-select" class="mono-select" style="width:100px;"><option value="">预设</option></select>
                                 <button type="button" id="group-apply-preset-btn" class="mono-btn">选择预设</button>
                                 <button type="button" id="group-save-preset-btn" class="mono-btn">存</button>
                                 <button type="button" id="group-manage-presets-btn" class="mono-btn">管</button>
                                 <button type="button" id="group-export-preset-btn" class="mono-btn">导出</button>
                                 <button type="button" id="group-import-preset-btn" class="mono-btn">导入</button>
                                 <button type="button" id="reset-group-custom-bubble-css-btn" class="mono-btn">重置</button>
                             </div>
                        </div>
                    </div>

                    <!-- 气泡样式分组（A 模式专用，与 B 完全独立） -->
                    <div class="kkt-group" id="a-group-bubble-style-group" style="margin-top:15px; display:none;">
                        <div class="kkt-item">
                            <div class="kkt-item-label">自定义气泡样式</div>
                            <div class="kkt-item-control">
                                <label class="mono-switch" data-ios-cb-skip data-native-toggle>
                                    <input type="checkbox" class="ms-input" id="setting-group-a-use-custom-css">
                                    <span class="mono-track"></span>
                                    <span class="mono-knob"></span>
                                </label>
                            </div>
                        </div>
                        <div class="kkt-item" style="display:block;">
                             <div id="a-group-bubble-css-preview" class="bubble-css-preview" style="margin-bottom:10px;"></div>
                             <textarea id="setting-group-a-custom-bubble-css" rows="4" placeholder="CSS代码...（作用于 A 模式气泡 .a-bubble / 正文 .a-gu / 头像 .a-avatar，支持 {{char_avatar}} 等模板变量）" style="width:100%; border:1px solid #eee; border-radius:8px; padding:5px;" disabled></textarea>
                             <div style="display:flex; justify-content:flex-end; gap:5px; margin-top:5px; flex-wrap: wrap;">
                                 <select id="a-group-bubble-preset-select" class="mono-select" style="width:100px;"><option value="">预设</option></select>
                                 <button type="button" id="a-group-apply-preset-btn" class="mono-btn">应用</button>
                                 <button type="button" id="a-group-save-preset-btn" class="mono-btn">存</button>
                                 <button type="button" id="a-group-manage-presets-btn" class="mono-btn">管</button>
                                 <button type="button" id="a-group-export-preset-btn" class="mono-btn">导出</button>
                                 <button type="button" id="a-group-import-preset-btn" class="mono-btn">导入</button>
                                 <button type="button" id="a-reset-group-a-bubble-css-btn" class="mono-btn">重置</button>
                             </div>
                        </div>
                    </div>
                </form>

                <button type="button" class="kkt-danger-btn" id="clear-group-chat-history-btn">清空聊天记录</button>
            </div>
        </main>
`;

function injectGroupSettingsHtml() {
    const container = document.getElementById('group-settings-screen');
    if (container) {
        container.innerHTML = groupSettingsHtml;
    }
}
