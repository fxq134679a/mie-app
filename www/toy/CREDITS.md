# 玩具（toy/app.html）出处

本文件是 https://github.com/29-Cu/Ruota-della-Fortuna 的 `index.html`（项目名 "ero-slot"，MIT License，作者 Copper / 29-Cu）整体拷贝，
原样保留了它的轮盘、拉杆、跑马灯、GORE 保险盖、自定义标签和记录功能。

本地相对上游做了三处改动，都在文件里可搜到：

1. `const DIMS` 里删掉了两个标签：`正太攻 / Shota Top / ショタ攻め`、`年龄扮演 / Age Play / 年齢プレイ`（未成年相关，不参与移植）。502 → 500。
2. `<style id="mie-toy-bridge">`：结果卡按钮的中文化和「发送给角色」样式。
3. `<script id="mie-toy-bridge">`：把摇出来的结果 `postMessage` 给 mie 外壳，接收外壳的收起/再摇指令。

升级上游时，保留第 2、3 两段（都在 `</head>` 前和 `</body>` 前），重做第 1 条即可。

上游依赖：Google Fonts 的 `Rye` / `Cinzel` / `Noto Serif SC`，断网时自动退化成系统衬线体。

## 许可

MIT License — Copyright (c) 2025 Copper (29-Cu)。
本移植仅供个人非商用使用；请勿商用（原作内容为成人向标签库）。
