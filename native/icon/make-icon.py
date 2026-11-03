#!/usr/bin/env python3
"""用宝宝给的手绘小人做 App 图标 / 启动图 / favicon。

用法: python native/icon/make-icon.py native/icon/out
"""
import os
import sys

from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "source.jpg")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(SRC), "out")


def subject_box(img, thresh=243):
    """找非白像素的外框（纸张本身有点灰噪点，阈值放宽一点）"""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    x0, y0, x1, y1 = w, h, 0, 0
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            if px[x, y] < thresh:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 <= x0 or y1 <= y0:
        return (0, 0, w, h)
    return (x0, y0, x1 + 1, y1 + 1)


def crop_square(img, box, pad_ratio=0.14):
    """按主体外框裁一个正方形，四周留一点呼吸空间"""
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    side = max(bw, bh) * (1 + pad_ratio * 2)
    half = side / 2
    w, h = img.size
    left = max(0, min(w - side, cx - half))
    top = max(0, min(h - side, cy - half))
    side = min(side, w, h)
    return img.crop((int(left), int(top), int(left + side), int(top + side)))


def on_canvas(square, size, bg=(255, 255, 255), fill=0.86):
    canvas = Image.new("RGB", (size, size), bg)
    target = int(size * fill)
    art = square.convert("RGB").resize((target, target), Image.LANCZOS)
    off = (size - target) // 2
    canvas.paste(art, (off, off))
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    sq = crop_square(src, subject_box(src))

    # App 图标：Apple 会自己切圆角，这里直接给满幅方图
    icon = on_canvas(sq, 1024, fill=0.84)
    icon.save(os.path.join(OUT, "AppIcon-512@2x.png"), optimize=True)

    # 启动图：白底 + 中间小小一只
    splash = Image.new("RGB", (2732, 2732), (255, 255, 255))
    art = sq.resize((int(2732 * 0.28), int(2732 * 0.28)), Image.LANCZOS)
    splash.paste(art, ((2732 - art.width) // 2, (2732 - art.height) // 2))
    for suffix in ("", "-1", "-2"):
        splash.save(os.path.join(OUT, f"splash-2732x2732{suffix}.png"), optimize=True)

    # 网页图标
    on_canvas(sq, 180, fill=0.9).save(os.path.join(OUT, "icon-180.png"), optimize=True)
    on_canvas(sq, 64, fill=0.92).save(os.path.join(OUT, "favicon-64.png"), optimize=True)
    on_canvas(sq, 64, fill=0.92).save(
        os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )

    print("已生成 ->", OUT)
    for f in sorted(os.listdir(OUT)):
        if f.startswith("source"):
            continue
        print("  ", f, os.path.getsize(os.path.join(OUT, f)), "bytes")


if __name__ == "__main__":
    main()
