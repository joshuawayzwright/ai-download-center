#!/usr/bin/env bash
# Set up the AI Field Notes video factory: a Python venv with Piper, plus
# two commercially usable voices (CC0 and public domain).
set -euo pipefail
cd "$(dirname "$0")"

python3 -m venv .cache/venv
.cache/venv/bin/pip install -q --upgrade pip
.cache/venv/bin/pip install -q piper-tts pillow numpy

mkdir -p .cache/voices
base=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US
# joe: dataset licensed CC0. norman: LibriVox recordings, public domain.
for v in joe norman; do
  f=.cache/voices/en_US-$v-medium.onnx
  [ -f "$f" ] || curl -fsSL -o "$f" "$base/$v/medium/en_US-$v-medium.onnx"
  [ -f "$f.json" ] || curl -fsSL -o "$f.json" "$base/$v/medium/en_US-$v-medium.onnx.json"
done

command -v ffmpeg >/dev/null || echo "Install ffmpeg (e.g. 'brew install ffmpeg' or 'apt-get install ffmpeg')."
fc-list 2>/dev/null | grep -qi "Inter" || echo "Install the Inter font family, or put Inter-*.otf files in .cache/fonts/."
echo "Ready. Render with: PATH=.cache/venv/bin:\$PATH .cache/venv/bin/python render.py videos/batch-01.json"
