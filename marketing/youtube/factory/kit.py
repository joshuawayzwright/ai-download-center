#!/usr/bin/env python3
"""Build the on-camera recording kit in the SOLO brand.

Makes, in out/kit/:
  - <ep>-thumb-overlay.png  1280x720 thumbnail with a transparent right half:
                            put your photo underneath it in Canva or any editor
  - <ep>-thumb-preview.png  the same with a grey placeholder, to check layout
  - lower-third.png         1920x1080 transparent name strap for your editor
  - intro-3s.mp4            3-second branded opener (silent)
  - endscreen-20s.mp4       20-second end-screen background with clear zones
                            for YouTube's video and subscribe elements (silent)

Usage: PATH=.cache/venv/bin:$PATH .cache/venv/bin/python kit.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.argv = sys.argv[:1]
import render as r  # noqa: E402  (shares palette, fonts and the emblem)

OUT = r.HERE / "out" / "kit"

EPISODES = [
    ("ep01-ai-proposals", "AI proposals", "One-week field test"),
    ("ep02-sole-trader-plan", "5 jobs for AI", "AI for sole traders"),
    ("ep03-ollama", "Run AI offline", "Ollama tutorial"),
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(r.find_font(name), size)


def grid(d: ImageDraw.ImageDraw, w: int, h: int, step: int, x0: int = 0, x1: int | None = None) -> None:
    x1 = w if x1 is None else x1
    for y in range(0, h, step):
        d.line([(x0, y), (x1, y)], fill=r.RULE, width=1)
    for x in range(x0, x1, step):
        d.line([(x, 0), (x, h)], fill=r.RULE, width=1)


def brackets(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], k: int, width: int) -> None:
    x0, y0, x1, y1 = box
    for (x, y, sx, sy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([(x, y), (x + sx * k, y)], fill=r.GOLD, width=width)
        d.line([(x, y), (x, y + sy * k)], fill=r.GOLD, width=width)


def thumbnail_overlay(text: str, kicker: str) -> Image.Image:
    """Left 58% branded panel, right side transparent for the creator's photo."""
    w, h, split = 1280, 720, 740
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    panel = Image.new("RGBA", (split, h), r.BG + (255,))
    pd = ImageDraw.Draw(panel)
    grid(pd, split, h, 64)
    glow = r.glow_layer(700, 46)
    panel.paste(glow, (-160, -120), glow)
    # soft fade from panel into the photo
    fade = Image.linear_gradient("L").rotate(90).resize((120, h))
    edge = Image.new("RGBA", (120, h), r.BG + (255,))
    edge.putalpha(fade)
    img.paste(panel, (0, 0))
    img.alpha_composite(edge, (split, 0))
    d = ImageDraw.Draw(img)
    mark = r.emblem(84)
    img.alpha_composite(mark, (56, 52))
    d.text((56 + mark.width + 20, 74), kicker.upper(), font=font("Rajdhani-SemiBold.ttf", 38), fill=r.DIM)
    words = text.upper().split()
    size = 170
    while size > 80:
        f = font(r.HEAD_FONT, size)
        lines = r.wrap(d, " ".join(words), f, split - 110)
        widest = max(d.textlength(line, font=f) for line in lines)
        if len(lines) <= 2 and widest <= split - 110 and len(lines) * size * 0.95 <= h - 300:
            break
        size -= 6
    y = (h - len(lines) * size * 0.95) / 2 + 30
    for i, line in enumerate(lines):
        d.text((56, y + i * size * 0.95), line, font=f, fill=r.GOLD if i == len(lines) - 1 else r.INK)
    d.rectangle([56, h - 92, 56 + 220, h - 84], fill=r.BLUE)
    brackets(d, (24, 24, w - 24, h - 24), 54, 6)
    return img


def preview(overlay: Image.Image) -> Image.Image:
    base = Image.new("RGBA", overlay.size, (70, 72, 78, 255))
    d = ImageDraw.Draw(base)
    cx, cy = 1030, 420
    d.ellipse([cx - 110, cy - 250, cx + 110, cy - 30], fill=(110, 112, 118, 255))
    d.rounded_rectangle([cx - 220, cy - 10, cx + 220, cy + 400], radius=140, fill=(110, 112, 118, 255))
    d.text((cx - 150, 640), "YOUR PHOTO HERE", font=font("Rajdhani-Bold.ttf", 40), fill=r.INK)
    base.alpha_composite(overlay)
    return base


def lower_third() -> Image.Image:
    w, h = 1920, 1080
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x, y = 120, 840
    d.rectangle([x, y, x + 760, y + 130], fill=r.BG + (235,))
    d.rectangle([x, y, x + 10, y + 130], fill=r.GOLD)
    mark = r.emblem(84)
    img.alpha_composite(mark, (x + 34, y + 23))
    d.text((x + 140, y + 18), "JOSH WRIGHT", font=font("Rajdhani-Bold.ttf", 58), fill=r.GOLD)
    d.text((x + 142, y + 78), "AI FIELD NOTES  ·  REAL TOOLS. REAL RESULTS.", font=font("Rajdhani-SemiBold.ttf", 30), fill=r.DIM)
    d.rectangle([x, y + 130, x + 760, y + 136], fill=r.BLUE)
    return img


def frame_card(title: str, sub: str, zones: bool = False) -> Image.Image:
    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), r.BG)
    d = ImageDraw.Draw(img)
    grid(d, w, h, 72)
    glow = r.glow_layer(1100, 50)
    img.paste(glow, ((w - 1100) // 2, (h - 1100) // 2 - 60), glow)
    d = ImageDraw.Draw(img)
    brackets(d, (60, 60, w - 60, h - 60), 60, 6)
    mark = r.emblem(150)
    ty = 170 if zones else 330
    img.paste(mark, ((w - mark.width) // 2, ty), mark)
    fh, fs = font(r.HEAD_FONT, 110), font("Rajdhani-SemiBold.ttf", 44)
    for text, f, y, fill in [(title, fh, ty + 180, r.GOLD), (sub, fs, ty + 310, r.DIM)]:
        tw = d.textlength(text, font=f)
        d.text(((w - tw) / 2, y), text, font=f, fill=fill)
    if zones:  # where YouTube's end-screen elements sit; keep text out of them
        d.rounded_rectangle([260, 640, 260 + 760, 640 + 428 - 40], radius=18, outline=r.RULE, width=3)
        d.ellipse([1300, 660, 1300 + 330, 660 + 330], outline=r.RULE, width=3)
    return img


def still_to_mp4(img: Image.Image, seconds: float, path: Path) -> None:
    png = path.with_suffix(".png")
    img.save(png)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(png), "-t", str(seconds),
         "-vf", "fade=t=in:st=0:d=0.4,format=yuv420p", "-r", "30", "-c:v", "libx264", "-crf", "18",
         "-movflags", "+faststart", str(path)],
        check=True,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, text, kicker in EPISODES:
        ov = thumbnail_overlay(text, kicker)
        ov.save(OUT / f"{slug}-thumb-overlay.png")
        preview(ov).convert("RGB").save(OUT / f"{slug}-thumb-preview.png")
    lower_third().save(OUT / "lower-third.png")
    still_to_mp4(frame_card("AI FIELD NOTES", "REAL TOOLS. REAL RESULTS."), 3, OUT / "intro-3s.mp4")
    still_to_mp4(frame_card("THANKS FOR WATCHING", "WATCH NEXT  ·  SUBSCRIBE", zones=True), 20, OUT / "endscreen-20s.mp4")
    print("\n".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
