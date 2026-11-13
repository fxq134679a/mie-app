# Attribution · 署名

> **Unofficial fan work.** Clawd is a character created by Anthropic for Claude Code. All rights in the Clawd character and in the names and marks "Clawd", "Claude", "Claude Code" and "Anthropic" belong to Anthropic, PBC. Nothing in this folder is made by, affiliated with, sponsored by or endorsed by Anthropic, and no license here grants any right in Anthropic's characters, names or marks.
>
> **非官方同人作品。** Clawd 是 Anthropic 为 Claude Code 创作的角色。Clawd 的角色形象，以及「Clawd」「Claude」「Claude Code」「Anthropic」这些名称与标识，一切权利归 Anthropic, PBC。本目录的内容不是 Anthropic 出品，与 Anthropic 没有隶属关系，没有得到其赞助或背书；这里的任何许可都不授予与 Anthropic 的角色、名称、标识相关的权利。

## Where the cook comes from

Every image in this folder is **adapted material**: it was rendered with the engine of

- **clawds-new-clothes** — <https://github.com/CharlieLuinaris/clawds-new-clothes>
- Copyright 2026 Charlie Luinaris
- **Luin Luinaris** (<https://github.com/luinluinaris>): the animation and the engine, from the first prototype to all 48 moves, plus the outfit layers, checks and export tools.
- **Charlie Luinaris**: the London postie concept, the pixel corrections and the four outfits; maintainer and copyright holder.
- Licenses: code **MIT**; artwork and anything that depicts Clawd **CC BY-NC-SA 4.0**, offered to the extent the authors hold rights in it; the Clawd character itself is excluded.
- Upstream commit used: `76e7572b42859205f44d2e46ae61f76947efae64` (2026-10-17, v1.1.0).

The upstream `NOTICE` is reproduced unchanged in [`UPSTREAM-NOTICE`](UPSTREAM-NOTICE), the upstream `LICENSE` (MIT, with its scope note) in [`LICENSES/UPSTREAM-LICENSE`](LICENSES/UPSTREAM-LICENSE), and the full license texts in [`LICENSES/`](LICENSES/).

## What was changed

The body, the face and the way he moves are upstream's. On top of the upstream engine, tsuru0805 added (2026-11):

- **Two outfits** that replace the postie uniform (bowler hat, waistcoat, satchel and pocket watch are taken off):
  - `toque` — a tall chef's hat, a white double-breasted jacket and a red neckerchief;
  - `scarf` — a blue polka-dot headscarf and a cream apron with a pink heart pocket.
- **51 cooking moves**, 45 frames each: washing hands, chopping, and for each of seven methods (stir-fry, pan-fry, deep-fry, boil, steam, bake, mix) seven moves (the main action, wiping the brow, looking up, caught by the steam, tasting, serving, burning it), with the pots, pans and food they need.
- **The export**: each move in each outfit as an animated WebP (the engine's 300 px canvas scaled ×2 with nearest-neighbour and placed on a 720 × 720 transparent canvas so that the counter line is at y = 560; frame delays 70 / 60 / 70 ms as upstream; lossless), the last frame of every serve and fail move as a PNG, and `base.png`, the first frame of upstream's `idle` move in each outfit.

The source files for these additions are in [`../../clawd-engine-additions/`](../../clawd-engine-additions/), with instructions for putting them back into the upstream engine and exporting again.

## License of the files in this folder

The images in `toque/` and `scarf/` are licensed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International** (<https://creativecommons.org/licenses/by-nc-sa/4.0/>), the same license as the upstream artwork they adapt; full text in [`LICENSES/CC-BY-NC-SA-4.0.txt`](LICENSES/CC-BY-NC-SA-4.0.txt). Adaptations © 2026 tsuru0805, to the extent of the changes listed above. The Clawd character is not covered by this license.

That means: you may share and adapt these images for **non-commercial** purposes, as long as you keep this attribution, say what you changed, and share your version under the same license. No merchandise, no sticker-store listings, nothing that implies an official connection with Anthropic. If Anthropic or the upstream authors ask for something to be changed or removed, it will be.

The images are provided as they are, without warranties of any kind (see Section 5 of the license).

When you share or remix, please keep this line:

> munch-kitchenette cook · adapted from clawds-new-clothes (animation by Luin Luinaris, Clawd pixel art and outfits concept by Charlie Luinaris) · chef outfits and cooking moves by tsuru0805 · CC BY-NC-SA 4.0 · unofficial Clawd fan work

## 中文

本目录下的每一张图都是**改编作品**，用下面这个仓库的引擎画出来：

- **clawds-new-clothes** — <https://github.com/CharlieLuinaris/clawds-new-clothes>，版权所有 2026 Charlie Luinaris
- **Luin Luinaris**：动画与引擎（从底稿到四十八支动作）、换装图层、检查与导出工具。
- **Charlie Luinaris**：老伦敦信差的设定、像素修订与四套衣服；项目维护者与版权人。
- 许可：代码 **MIT**；美术以及一切画出 Clawd 的产物 **CC BY-NC-SA 4.0**（在作者享有权利的范围内提供，Clawd 角色本身不在其中）。
- 取用的上游 commit：`76e7572b42859205f44d2e46ae61f76947efae64`（2026-10-17，v1.1.0）。

上游的 `NOTICE` 原样收在 [`UPSTREAM-NOTICE`](UPSTREAM-NOTICE)，上游的 `LICENSE`（MIT 及其适用范围说明）在 [`LICENSES/UPSTREAM-LICENSE`](LICENSES/UPSTREAM-LICENSE)，两份许可全文在 [`LICENSES/`](LICENSES/)。

**改了什么**（tsuru0805，2026-11，在上游引擎之上加的；身体、脸和动起来的方式都是上游的）：

- **两套衣服**，换下信差制服（礼帽、马甲、皮包、怀表都摘掉）：`toque` 高筒厨师帽 + 白色双排扣厨师服 + 红领巾；`scarf` 蓝底白点头巾 + 米色大围裙 + 粉色爱心口袋。
- **51 支下厨动作**，每支 45 帧：洗手、切菜，以及七种做法（炒、煎、炸、煮、蒸、烤、拌）各七支（主动作、擦汗、抬头看、被热气熏到、尝味、端上来、糊了），连同用到的锅碗和菜。
- **导出**：每支动作 × 每套衣服一张动态 WebP（引擎 300 像素画布最近邻放大 2 倍，贴在 720 × 720 透明画布上，台面线在 y = 560；每帧延时沿用上游的 70 / 60 / 70 毫秒；无损），端上来和糊了的最后一帧各一张 PNG，以及 `base.png`（上游 `idle` 动作的第一帧穿上这两套衣服）。

这些新增内容的源文件在 [`../../clawd-engine-additions/`](../../clawd-engine-additions/)，里面写了怎么放回上游引擎重新导出。

**本目录文件的许可**：`toque/` 与 `scarf/` 里的图按 **CC BY-NC-SA 4.0**（署名—非商业性使用—相同方式共享）提供，与它们改编的上游美术相同；全文见 [`LICENSES/CC-BY-NC-SA-4.0.txt`](LICENSES/CC-BY-NC-SA-4.0.txt)。改编部分 © 2026 tsuru0805，仅限上面列出的改动。Clawd 角色本身不在许可范围内。

也就是说：可以在**非商业**用途下转发和再改，但要带上署名、说明改了什么、改出来的东西用同一份许可公开。不做周边，不上架贴纸商店，不用在任何暗示与 Anthropic 有官方关系的场合。Anthropic 或上游作者要求修改或撤下时，照办。

这些图按现状提供，不附带任何担保（见许可第 5 条）。

转发、再创作时请带上这一行：

> munch-kitchenette cook · adapted from clawds-new-clothes (animation by Luin Luinaris, Clawd pixel art and outfits concept by Charlie Luinaris) · chef outfits and cooking moves by tsuru0805 · CC BY-NC-SA 4.0 · unofficial Clawd fan work
