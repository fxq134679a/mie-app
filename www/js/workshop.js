document.addEventListener('DOMContentLoaded', () => {
    // initDrawingWorkshop() 将在 main.js 的 init() 中调用，确保数据已加载
});

// --- 绘图工坊 (Drawing Workshop) 逻辑（zk8：单页结构，无 tab / 无氛围） ---
function initDrawingWorkshop() {
    // LLM 独立 API 切换（隔空投送提示词扩写用）
    const llmIndependentApiToggle = document.getElementById('workshop-llm-independent-api');
    const llmApiSelectContainer = document.getElementById('workshop-llm-api-select-container');
    if (llmIndependentApiToggle && llmApiSelectContainer) {
        llmIndependentApiToggle.addEventListener('change', (e) => {
            llmApiSelectContainer.style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    // 初始化设置绑定
    initWorkshopSettings();

    // 初始化模型拉取
    initWorkshopModels();

    // 初始化生图逻辑
    initWorkshopGeneration();

    // 初始化历史记录
    loadWorkshopHistory();

    // 初始化角色切换与专属配置面板
    initWorkshopCharManagement();
}
