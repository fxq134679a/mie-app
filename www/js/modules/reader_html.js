// --- NEST 书架 HTML 结构注入 (js/modules/reader_html.js) ---
// 替换原有阅读器为 nest-bookshelf-ui React 应用

const readerHtml = `
    <!-- NEST 书架 React 挂载点 -->
    <div id="reader-bookshelf-screen" class="screen" style="position: relative; overflow: hidden;">
        <div id="nest-bookshelf-root" style="width: 100%; height: 100%; position: absolute; inset: 0;"></div>
    </div>
`;

// 将 HTML 注入到 phone-screen 中
document.addEventListener('DOMContentLoaded', () => {
    const phoneScreen = document.querySelector('.phone-screen');
    if (phoneScreen) {
        phoneScreen.insertAdjacentHTML('beforeend', readerHtml);
    }
});
