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
W, H = 1080, 1920
FPS = 30
GAP_SECONDS = 0.18          # pause between segments
TAIL_SECONDS = 0.6          # hold on the last frame
CAPTION_WORDS = 4           # words shown per caption chunk

BG = (24, 25, 28)
RULE = (38, 40, 44)
MARGIN = (90, 52, 46)
INK = (246, 243, 236)
DIM = (150, 150, 146)
LIME = (184, 230, 62)
CORAL = (247, 104, 84)

DEFAULT_VOICE = HERE / ".cache" / "voices" / "en_US-joe-medium.onnx"
FONT_DIRS = [Path("/usr/share/fonts/opentype/inter"), HERE / ".cache" / "fonts"]


def find_font(name: str) -> str:
    for d in FONT_DIRS:
        p = d / name
        if p.exists():
            return str(p)
    sys.exit(f"Font {name} not found. Install Inter (see README.md).")


F_BRAND = ImageFont.truetype(find_font("Inter-Bold.otf"), 40)
F_PILLAR = ImageFont.truetype(find_font("Inter-SemiBold.otf"), 34)
F_HEAD = ImageFont.truetype(find_font("InterDisplay-Bold.otf"), 104)
F_CAP = ImageFont.truetype(find_font("Inter-Bold.otf"), 66)
F_SMALL = ImageFont.truetype(find_font("Inter-Medium.otf"), 32)


@dataclass
class Segment:
    screen: str
    say: str
    wav: Path
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
    for y in range(260, H - 180, 72):          # ruled notebook lines
        d.line([(60, y), (W - 60, y)], fill=RULE, width=2)
    d.line([(118, 200), (118, H - 160)], fill=MARGIN, width=3)  # margin line
    d.text((150, 120), "AI FIELD NOTES", font=F_BRAND, fill=LIME)
    pw = d.textlength(pillar.upper(), font=F_PILLAR)
    d.rounded_rectangle([W - 90 - pw - 36, 112, W - 90, 172], radius=30, outline=CORAL, width=3)
    d.text((W - 90 - pw - 18, 122), pillar.upper(), font=F_PILLAR, fill=CORAL)
    return img


def glow_layer(size: int = 900, peak: int = 34) -> Image.Image:
    """Soft lime radial glow that drifts behind the headline."""
    r = size / 2
    ys, xs = np.mgrid[0:size, 0:size]
    dist = np.sqrt((xs - r) ** 2 + (ys - r) ** 2) / r
    alpha = (np.clip(1 - dist, 0, 1) ** 2 * peak).astype(np.uint8)
    layer = Image.new("RGBA", (size, size), LIME + (0,))
    layer.putalpha(Image.fromarray(alpha, "L"))
    return layer


def headline_layer(text: str) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    lines = wrap(d, text, F_HEAD, W - 260)
    lh = 122
    top = 760 - (len(lines) * lh) // 2
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
    y = 1290
    for line in lines:
        lw = sum(widths[i] for i in line) + space * (len(line) - 1)
        x = (W - lw) / 2
        for i in line:
            active = start + i == idx
            if active:
                d.rounded_rectangle([x - 12, y - 6, x + widths[i] + 12, y + 82], radius=14, fill=(52, 60, 30))
            d.text((x, y), texts[i], font=F_CAP, fill=LIME if active else INK)
            x += widths[i] + space
        y += 96


def render_video(spec: dict, out_dir: Path, voice: Path, piper: str) -> Path:
    vid = spec["id"]
    work = Path(tempfile.mkdtemp(prefix=f"aifn-{vid}-"))
    try:
        segs: list[Segment] = []
        t = 0.0
        for i, s in enumerate(spec["segments"]):
            seg = Segment(screen=s["screen"], say=s["say"], wav=work / f"{i:02d}.wav")
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
        glow = glow_layer()

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
            gx = int(90 + 70 * math.sin(now * 0.45))
            gy = int(320 + 90 * math.cos(now * 0.33))
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
            step = f"{si + 1} / {len(segs)}"
            d.text(((W - d.textlength(step, font=F_PILLAR)) / 2, 470), step, font=F_PILLAR, fill=CORAL)
            if now <= seg.start + seg.duration + GAP_SECONDS:
                draw_caption(d, words[si], now)
            # progress bar
            d.rounded_rectangle([150, 1700, W - 150, 1712], radius=6, fill=RULE)
            d.rounded_rectangle([150, 1700, 150 + (W - 300) * min(1.0, now / total), 1712], radius=6, fill=LIME)
            d.text((150, 1730), spec.get("footer", "Follow for daily AI field notes"), font=F_SMALL, fill=DIM)
            ff.stdin.write(frame.tobytes())
            if cover is None and now >= min(0.6, segs[0].duration):
                cover = frame
        ff.stdin.close()
        if ff.wait() != 0:
            raise RuntimeError(f"ffmpeg failed for {vid}")
        (cover or bg).save(out_dir / f"{vid}-cover.png")

        meta = {k: spec[k] for k in ("id", "title", "description", "tags") if k in spec}
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
