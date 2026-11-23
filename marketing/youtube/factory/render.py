#!/usr/bin/env python3
"""Render AI Field Notes vertical explainer videos (Shorts, TikTok, Reels).

Each video is defined in a JSON file as a list of segments. A segment has
on-screen headline text ("screen") and narration ("say"). The renderer:

1. Speaks each segment with a local Piper voice (no cloud service).
2. Draws 1080x1920 frames with Pillow: notebook-style background, a
   headline that fades in per segment, word-by-word captions, and a
   progress bar.
3. Pipes the frames and the narration into ffmpeg to make an MP4.

Usage:
    python render.py videos/batch-01.json            # render every video
    python render.py videos/batch-01.json --only 003 # one video by id prefix
    python render.py videos/batch-01.json --voice .cache/voices/en_US-norman-medium.onnx

Requirements: see README.md (ffmpeg, Pillow, numpy, piper-tts, a voice model).
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 1080, 1920          # set per video by apply_format()
FPS = 30

# Layout for each output format. "vertical" is the original Shorts layout;
# "landscape" is 16:9 long-form for regular YouTube uploads.
FORMATS = {
    "vertical": dict(size=(1080, 1920), head=104, head_lh=122, head_y=760, head_w=260,
                     cap=66, cap_y=1290, cap_lh=96, step_y=470, bar_y=1700,
                     rule_top=260, rule_bottom=180, brand_y=120, glow=900, glow_x=90, glow_y=320),
    "landscape": dict(size=(1920, 1080), head=92, head_lh=108, head_y=430, head_w=420,
                      cap=54, cap_y=720, cap_lh=78, step_y=230, bar_y=968,
                      rule_top=200, rule_bottom=90, brand_y=70, glow=760, glow_x=580, glow_y=60),
}
L = FORMATS["vertical"]
GAP_SECONDS = 0.18          # pause between segments
TAIL_SECONDS = 0.6          # hold on the last frame
CAPTION_WORDS = 4           # words shown per caption chunk

# SOLO brand lock palette (ai-download-center/docs/SOLO-BRAND-LOCK.md):
# charcoal #0A0A0A, weathered steel #8A8F98, burnished gold #D4AF37,
# restrained electric blue #0087FF. INK is the light text colour for contrast.
BG = (10, 10, 10)
RULE = (30, 32, 36)          # faint steel grid
INK = (238, 238, 234)
DIM = (138, 143, 152)        # weathered steel
GOLD = (212, 175, 55)
BLUE = (0, 135, 255)
GOLD_DARK = (58, 48, 15)     # caption highlight behind the gold word

# Approved business emblem: a small source crop (285x282), so it is only ever
# scaled down, never enlarged. See docs/SOLO-BRAND-LOCK.md.
EMBLEM = HERE.parents[2] / "powerhouse-website" / "assets" / "approved-stage" / "business-emblem.png"

DEFAULT_VOICE = HERE / ".cache" / "voices" / "en_US-joe-medium.onnx"
FONT_DIRS = [Path("/usr/share/fonts/opentype/inter"), HERE / ".cache" / "fonts"]


def find_font(name: str) -> str:
    for d in FONT_DIRS:
        p = d / name
        if p.exists():
            return str(p)
    sys.exit(f"Font {name} not found. Run setup.sh (Inter and Rajdhani, see README.md).")


# Brand type: headline Montra Bold (no font file available yet, so Rajdhani
# Bold stands in), subheading Rajdhani SemiBold, body Inter.
HEAD_FONT = next((n for n in ("Montra-Bold.otf", "Montra-Bold.ttf", "Montra Bold.otf")
                  if any((d / n).exists() for d in FONT_DIRS)), "Rajdhani-Bold.ttf")
F_BRAND = ImageFont.truetype(find_font("Rajdhani-Bold.ttf"), 46)
F_PILLAR = ImageFont.truetype(find_font("Rajdhani-SemiBold.ttf"), 38)
F_HEAD = ImageFont.truetype(find_font(HEAD_FONT), 120)
F_CAP = ImageFont.truetype(find_font("Inter-SemiBold.otf"), 66)
F_SMALL = ImageFont.truetype(find_font("Inter-Medium.otf"), 32)


def emblem(size: int) -> Image.Image:
    """The approved business emblem, scaled down to fit a size x size box."""
    img = Image.open(EMBLEM).convert("RGBA")
    if size > max(img.size):
        size = max(img.size)       # never enlarge the source crop
    img.thumbnail((size, size), Image.LANCZOS)
    return img


def apply_format(name: str) -> None:
    """Switch canvas size, layout and headline/caption fonts to a format."""
    global W, H, L, F_HEAD, F_CAP
    if name not in FORMATS:
        sys.exit(f"Unknown format {name!r}; use one of {sorted(FORMATS)}")
    L = FORMATS[name]
    W, H = L["size"]
    F_HEAD = ImageFont.truetype(find_font(HEAD_FONT), int(L["head"] * 1.15))
    F_CAP = ImageFont.truetype(find_font("Inter-SemiBold.otf"), L["cap"])


@dataclass
class Segment:
    screen: str
    say: str
    wav: Path
    chapter: str | None = None
    start: float = 0.0
    duration: float = 0.0


def wav_duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / float(w.getframerate())


def speak(text: str, out: Path, voice: Path, piper: str) -> None:
    subprocess.run(
        [piper, "-m", str(voice), "-f", str(out), "--sentence-silence", "0.12"],
        input=text.encode(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def background(pillar: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    top, bottom = L["rule_top"] - 40, H - L["rule_bottom"] + 20
    for y in range(top, bottom, 72):            # faint industrial grid
        d.line([(60, y), (W - 60, y)], fill=RULE, width=1)
    for x in range(60, W - 59, 72):
        d.line([(x, top), (x, bottom)], fill=RULE, width=1)
    k = 46                                      # gold corner brackets
    for (x, y, sx, sy) in [(60, top, 1, 1), (W - 60, top, -1, 1), (60, bottom, 1, -1), (W - 60, bottom, -1, -1)]:
        d.line([(x, y), (x + sx * k, y)], fill=GOLD, width=4)
        d.line([(x, y), (x, y + sy * k)], fill=GOLD, width=4)
    by = L["brand_y"]
    mark = emblem(64)
    img.paste(mark, (90, by - 10), mark)
    d.text((90 + mark.width + 18, by - 2), "AI FIELD NOTES", font=F_BRAND, fill=GOLD)
    pw = d.textlength(pillar.upper(), font=F_PILLAR)
    d.rectangle([W - 90 - pw - 36, by - 6, W - 90, by + 50], outline=DIM, width=2)
    d.line([(W - 90 - pw - 36, by + 50), (W - 90, by + 50)], fill=BLUE, width=4)
    d.text((W - 90 - pw - 18, by), pillar.upper(), font=F_PILLAR, fill=INK)
    return img


def glow_layer(size: int = 900, peak: int = 34) -> Image.Image:
    """Soft lime radial glow that drifts behind the headline."""
    r = size / 2
    ys, xs = np.mgrid[0:size, 0:size]
    dist = np.sqrt((xs - r) ** 2 + (ys - r) ** 2) / r
    alpha = (np.clip(1 - dist, 0, 1) ** 2 * peak).astype(np.uint8)
    layer = Image.new("RGBA", (size, size), GOLD + (0,))
    layer.putalpha(Image.fromarray(alpha, "L"))
    return layer


def headline_layer(text: str) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    lines = wrap(d, text.upper(), F_HEAD, W - L["head_w"])
    lh = L["head_lh"]
    top = L["head_y"] - (len(lines) * lh) // 2
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=F_HEAD)
        d.text(((W - tw) / 2, top + i * lh), line, font=F_HEAD, fill=INK)
    return layer


def word_times(seg: Segment) -> list[tuple[str, float]]:
    """Estimate when each word starts, proportional to its length."""
    words = seg.say.split()
    weights = [len(w) + 2 for w in words]
    total = sum(weights)
    t, out = seg.start, []
    for w, k in zip(words, weights):
        out.append((w, t))
        t += seg.duration * k / total
    return out


def draw_caption(d: ImageDraw.ImageDraw, words: list[tuple[str, float]], now: float) -> None:
    idx = max((i for i, (_, t) in enumerate(words) if t <= now), default=0)
    start = (idx // CAPTION_WORDS) * CAPTION_WORDS
    chunk = words[start:start + CAPTION_WORDS]
    texts = [w for w, _ in chunk]
    space = d.textlength(" ", font=F_CAP)
    widths = [d.textlength(w, font=F_CAP) for w in texts]
    # wrap the chunk onto at most two lines
    lines, cur, cur_w = [], [], 0.0
    for i, w in enumerate(widths):
        need = w if not cur else cur_w + space + w
        if cur and need > W - 200:
            lines.append(cur)
            cur, cur_w = [i], w
        else:
            cur.append(i)
            cur_w = need
    if cur:
        lines.append(cur)
    y = L["cap_y"]
    for line in lines:
        lw = sum(widths[i] for i in line) + space * (len(line) - 1)
        x = (W - lw) / 2
        for i in line:
            active = start + i == idx
            if active:
                d.rounded_rectangle([x - 12, y - 6, x + widths[i] + 12, y + L["cap"] + 16], radius=14, fill=GOLD_DARK)
            d.text((x, y), texts[i], font=F_CAP, fill=GOLD if active else INK)
            x += widths[i] + space
        y += L["cap_lh"]


def stamp(seconds: float) -> str:
    """YouTube chapter timestamp: m:ss, or h:mm:ss past an hour."""
    s = int(seconds)
    h, m, sec = s // 3600, s // 60 % 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def thumbnail(spec: dict, pillar: str) -> Image.Image:
    """1280x720 thumbnail in the SOLO brand: charcoal, steel grid, gold headline, blue tag."""
    tw, th = 1280, 720
    img = Image.new("RGB", (tw, th), BG)
    d = ImageDraw.Draw(img)
    for y in range(40, th - 39, 64):
        d.line([(40, y), (tw - 40, y)], fill=RULE, width=1)
    for x in range(40, tw - 39, 64):
        d.line([(x, 40), (x, th - 40)], fill=RULE, width=1)
    glow = glow_layer(900, 46)
    img.paste(glow, (tw - 820, -180), glow)
    d = ImageDraw.Draw(img)
    k = 54
    for (x, y, sx, sy) in [(40, 40, 1, 1), (tw - 40, 40, -1, 1), (40, th - 40, 1, -1), (tw - 40, th - 40, -1, -1)]:
        d.line([(x, y), (x + sx * k, y)], fill=GOLD, width=6)
        d.line([(x, y), (x, y + sy * k)], fill=GOLD, width=6)
    mark = emblem(84)
    img.paste(mark, (96, 74), mark)
    f_kick = ImageFont.truetype(find_font("Rajdhani-SemiBold.ttf"), 40)
    d.text((96 + mark.width + 22, 92), spec.get("kicker", pillar).upper(), font=f_kick, fill=DIM)
    words = spec["text"].upper().split()
    size = 230
    while size > 90:
        f = ImageFont.truetype(find_font(HEAD_FONT), size)
        lines = wrap(d, " ".join(words), f, tw - 220)
        widest = max(d.textlength(line, font=f) for line in lines)
        # keep the headline between the kicker (y~170) and the tag (y=th-150)
        if len(lines) <= 2 and widest <= tw - 220 and len(lines) * size * 0.95 <= th - 340:
            break
        size -= 8
    top, bottom = 170, th - 150 if spec.get("tag") else th - 70
    y = top + (bottom - top - len(lines) * size * 0.95) / 2 - size * 0.08
    for i, line in enumerate(lines):
        d.text((96, y + i * size * 0.95), line, font=f, fill=GOLD if i == len(lines) - 1 else INK)
    if spec.get("tag"):
        f_tag = ImageFont.truetype(find_font("Rajdhani-Bold.ttf"), 46)
        tw2 = d.textlength(spec["tag"].upper(), font=f_tag)
        d.rectangle([96, th - 136, 96 + tw2 + 48, th - 70], fill=BLUE)
        d.text((120, th - 134), spec["tag"].upper(), font=f_tag, fill=INK)
    return img


def check_glyphs(spec: dict) -> None:
    """Stop before rendering if on-screen text uses a character the brand
    fonts can't draw (it would show as an empty box, e.g. "¾")."""
    from fontTools.ttLib import TTFont
    head = set(TTFont(find_font(HEAD_FONT)).getBestCmap())
    texts = [s["screen"].upper() for s in spec["segments"]]
    th = spec.get("thumbnail", {})
    texts += [th.get(k, "").upper() for k in ("text", "kicker", "tag")]
    bad = sorted({c for t in texts for c in t if not c.isspace() and ord(c) not in head})
    if bad:
        sys.exit(f"{spec['id']}: the headline font can't draw {bad}. Spell it out (e.g. 3/4, ^, 'to the power of').")


def render_video(spec: dict, out_dir: Path, voice: Path, piper: str) -> Path:
    vid = spec["id"]
    apply_format(spec.get("format", "vertical"))
    check_glyphs(spec)
    work = Path(tempfile.mkdtemp(prefix=f"aifn-{vid}-"))
    try:
        segs: list[Segment] = []
        t = 0.0
        for i, s in enumerate(spec["segments"]):
            seg = Segment(screen=s["screen"], say=s["say"], wav=work / f"{i:03d}.wav",
                          chapter=s.get("chapter"))
            speak(seg.say, seg.wav, voice, piper)
            seg.start, seg.duration = t, wav_duration(seg.wav)
            t += seg.duration + GAP_SECONDS
            segs.append(seg)
        total = t - GAP_SECONDS + TAIL_SECONDS

        # narration track: segments separated by short silences
        audio = work / "narration.wav"
        concat = work / "concat.txt"
        silence = work / "gap.wav"
        rate = wave.open(str(segs[0].wav)).getframerate()
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        f"anullsrc=r={rate}:cl=mono", "-t", str(GAP_SECONDS), str(silence)], check=True)
        with concat.open("w") as f:
            for i, seg in enumerate(segs):
                f.write(f"file '{seg.wav}'\n")
                if i < len(segs) - 1:
                    f.write(f"file '{silence}'\n")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                        "-i", str(concat), str(audio)], check=True)

        bg = background(spec.get("pillar", "AI Explained"))
        # crop each headline to its bounding box so per-frame pasting is cheap
        heads = []
        for s in segs:
            layer = headline_layer(s.screen)
            box = layer.getbbox() or (0, 0, 1, 1)
            heads.append((layer.crop(box), box[0], box[1]))
        words = [word_times(s) for s in segs]
        glow = glow_layer(L["glow"])
        # chapter label shown above the headline: the latest chapter started so far
        chapter_of, current = [], None
        for s in segs:
            current = s.chapter or current
            chapter_of.append(current)

        out_dir.mkdir(parents=True, exist_ok=True)
        mp4 = out_dir / f"{vid}.mp4"
        ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
             "-i", str(audio), "-af", "apad", "-t", f"{total:.3f}",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(mp4)],
            stdin=subprocess.PIPE,
        )
        n = math.ceil(total * FPS)
        cover = None
        for f in range(n):
            now = f / FPS
            si = max((i for i, s in enumerate(segs) if s.start <= now), default=0)
            seg = segs[si]
            frame = bg.copy()
            gx = int(L["glow_x"] + 70 * math.sin(now * 0.45))
            gy = int(L["glow_y"] + 90 * math.cos(now * 0.33))
            frame.paste(glow, (gx, gy), glow)
            # headline fades and rises in over 0.3s at the start of each segment
            k = min(1.0, (now - seg.start) / 0.3)
            ease = 1 - (1 - k) ** 3
            layer, hx, hy = heads[si]
            if ease < 1:
                alpha = layer.getchannel("A").point(lambda a, e=ease: int(a * e))
                layer = layer.copy()
                layer.putalpha(alpha)
            frame.paste(layer, (hx, hy + int(40 * (1 - ease))), layer)
            d = ImageDraw.Draw(frame)
            step = (chapter_of[si] or "").upper() if chapter_of[si] else f"{si + 1} / {len(segs)}"
            d.text(((W - d.textlength(step, font=F_PILLAR)) / 2, L["step_y"]), step, font=F_PILLAR, fill=BLUE)
            if now <= seg.start + seg.duration + GAP_SECONDS:
                draw_caption(d, words[si], now)
            # progress bar
            by = L["bar_y"]
            d.rounded_rectangle([150, by, W - 150, by + 12], radius=6, fill=RULE)
            d.rounded_rectangle([150, by, 150 + (W - 300) * min(1.0, now / total), by + 12], radius=6, fill=GOLD)
            d.text((150, by + 30), spec.get("footer", "Follow for daily AI field notes"), font=F_SMALL, fill=DIM)
            ff.stdin.write(frame.tobytes())
            if cover is None and now >= min(0.6, segs[0].duration):
                cover = frame
        ff.stdin.close()
        if ff.wait() != 0:
            raise RuntimeError(f"ffmpeg failed for {vid}")
        (cover or bg).save(out_dir / f"{vid}-cover.png")

        meta = {k: spec[k] for k in ("id", "title", "description", "tags") if k in spec}
        chapters = [(s.start, s.chapter) for s in segs if s.chapter]
        if chapters:
            lines = [f"{stamp(t)} {name}" for t, name in chapters]
            meta["chapters"] = lines
            if "description" in meta:
                meta["description"] = meta["description"].replace("{chapters}", "\n".join(lines))
        if "thumbnail" in spec:
            thumbnail(spec["thumbnail"], spec.get("pillar", "AI Explained")).save(out_dir / f"{vid}-thumb.png")
        meta["duration_seconds"] = round(total, 1)
        meta["script"] = " ".join(s.say for s in segs)
        (out_dir / f"{vid}.json").write_text(json.dumps(meta, indent=2))
        print(f"  {mp4.name}  {total:.1f}s")
        return mp4
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path, help="JSON file with a list of videos")
    ap.add_argument("--only", help="render only videos whose id starts with this")
    ap.add_argument("--voice", type=Path, default=DEFAULT_VOICE, help="Piper .onnx voice model")
    ap.add_argument("--out", type=Path, default=HERE / "out")
    ap.add_argument("--piper", default=shutil.which("piper") or "piper", help="path to the piper binary")
    args = ap.parse_args()

    if not args.voice.exists():
        sys.exit(f"Voice model not found: {args.voice}. Run setup.sh first.")
    videos = json.loads(args.spec.read_text())
    if args.only:
        videos = [v for v in videos if v["id"].startswith(args.only)]
    print(f"Rendering {len(videos)} video(s) with {args.voice.name}")
    for v in videos:
        render_video(v, args.out, args.voice, args.piper)


if __name__ == "__main__":
    main()
