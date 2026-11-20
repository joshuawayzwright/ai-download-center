#!/usr/bin/env bash
# Set up the AI Field Notes video factory: a Python venv with Piper, plus
# two commercially usable voices (CC0 and public domain).
set -euo pipefail
cd "$(dirname "$0")"

python3 -m venv .cache/venv
.cache/venv/bin/pip install -q --upgrade pip
.cache/venv/bin/pip install -q piper-tts pillow numpy fonttools

mkdir -p .cache/voices
base=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US
# joe: dataset licensed CC0. norman: LibriVox recordings, public domain.
for v in joe norman; do
  f=.cache/voices/en_US-$v-medium.onnx
  [ -f "$f" ] || curl -fsSL -o "$f" "$base/$v/medium/en_US-$v-medium.onnx"
  [ -f "$f.json" ] || curl -fsSL -o "$f.json" "$base/$v/medium/en_US-$v-medium.onnx.json"
done

# Brand fonts (SOLO brand lock): Rajdhani from Google Fonts (SIL Open Font
# Licence). Montra Bold is the brand headline font but isn't freely
# downloadable: copy Montra-Bold.otf into .cache/fonts/ and it's used
# automatically; until then Rajdhani Bold stands in.
mkdir -p .cache/fonts
css=$(curl -fsSL "https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700")
for pair in "600:SemiBold" "700:Bold"; do
  f=.cache/fonts/Rajdhani-${pair#*:}.ttf
  url=$(printf '%s\n' "$css" | awk -v w="font-weight: ${pair%%:*};" 'index($0,w){f=1} f&&/src:/{print;exit}' | grep -o 'https://[^)]*')
  [ -f "$f" ] || curl -fsSL -o "$f" "$url"
done

command -v ffmpeg >/dev/null || echo "Install ffmpeg (e.g. 'brew install ffmpeg' or 'apt-get install ffmpeg')."
fc-list 2>/dev/null | grep -qi "Inter" || echo "Install the Inter font family, or put Inter-*.otf files in .cache/fonts/."
echo "Ready. Render with: PATH=.cache/venv/bin:\$PATH .cache/venv/bin/python render.py videos/batch-01.json"
