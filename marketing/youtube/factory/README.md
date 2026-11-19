# AI Field Notes video factory

This turns a JSON script into finished videos (H.264, AAC): vertical 1080×1920 for YouTube Shorts, TikTok and Instagram Reels, or landscape 1920×1080 for long-form YouTube. Everything runs locally: no paid video credits and no cloud voice service.

Each video has:
- a notebook-style background in the brand colours (charcoal, lime, coral)
- a headline for each segment that fades in, with a step counter
- word-by-word captions with the current word highlighted (most Shorts viewers watch with the sound off)
- a progress bar and a follow prompt
- narration by a local [Piper](https://github.com/OHF-Voice/piper1-gpl) voice
- a cover image (`<id>-cover.png`) and a metadata file (`<id>.json`: title, description, tags, duration and full script)

## Setup (once)

```bash
cd marketing/youtube/factory
./setup.sh
```

This needs `ffmpeg`, Python 3.10+ and the Inter font. `setup.sh` creates `.cache/venv` and downloads two voices into `.cache/voices/`:

| Voice | Licence of the training data | Notes |
|---|---|---|
| `en_US-joe-medium` (default) | CC0 | Clear male US voice |
| `en_US-norman-medium` | Public domain (LibriVox) | Warmer, audiobook-style |

Avoid Piper voices whose model card says CC BY-NC or "research only" (for example `ryan` and `hfc_male`): those don't allow commercial use, and a monetised channel counts as commercial.

## Render

```bash
PATH=.cache/venv/bin:$PATH .cache/venv/bin/python render.py videos/batch-01.json
# one video:          --only 003
# other voice:        --voice .cache/voices/en_US-norman-medium.onnx
```

Output goes to `out/`, which is gitignored. A 45-second video takes about 30–40 seconds on 4 CPU cores.

## Write a new video

Add an object to a batch file in `videos/`:

```json
{
  "id": "013-short-slug",
  "pillar": "AI Explained",
  "title": "Question-style title under 70 characters #Shorts",
  "description": "Two sentences. Then hashtags.",
  "tags": ["main keyword", "variant", "..."],
  "segments": [
    {"screen": "Hook as a question", "say": "One spoken sentence that opens the loop."},
    {"screen": "2–5 words", "say": "One idea per segment, 1–3 sentences."},
    {"screen": "The takeaway", "say": "Payoff, then: Follow for more AI explained."}
  ]
}
```

**Writing rules**
- Aim for 5–6 segments and 90–130 spoken words (35–50 seconds).
- Put the hook in segment 1, as a question or a surprising claim the video actually answers.
- Keep `screen` text short (2–6 words). It's the headline, not a transcript.
- **Accuracy:** explain stable concepts plainly; hedge where things vary ("often", "many models"); never invent numbers, quotes or news. For news or new releases, use the official announcement and put the date in the description.
- Spell out symbols in `say` text so the voice pronounces them ("three quarters", not "¾").

## Long-form (landscape) videos

Add `"format": "landscape"` to a video to render it at 1920×1080 in the same style. Two optional fields help with long videos:

- `"chapter"` on a segment starts a YouTube chapter there. The chapter name replaces the step counter on screen, and the renderer writes real timestamps into the metadata file. Put `{chapters}` in the description and it's replaced with the timed chapter list, so chapters never need re-timing by hand. YouTube needs the first chapter at 0:00, at least three chapters, and each at least 10 seconds long.
- `"thumbnail": {"text": "Move 37", "kicker": "Series · Episode 1", "tag": "1 in 10,000"}` makes a 1280×720 `<id>-thumb.png`: big text (3 words at most), kicker in coral, optional coral tag. The channel kit prefers your real face on long-form thumbnails, so treat these as stand-ins.

`videos/ai-turning-points.json` holds the four-episode *AI Turning Points* series (about 9–10 minutes each). Each one takes roughly 10 minutes to render on 4 CPU cores.

## Disclosure

The narration is a synthetic voice and the visuals are generated graphics, not realistic footage of people or events.
- Every description should say "Narrated with an AI voice."
- On TikTok, turn on the AI-generated content setting.
- On YouTube, the "altered or synthetic content" label is for realistic content viewers could mistake for real people, places or events. These videos aren't that, but tick it whenever a video does include realistic AI imagery or a cloned voice.

## Publish

Use vidIQ (connected to YouTube, TikTok and Instagram):
1. `vidiq_video_upload` with `localFile` → run the returned command → call again with the `uploadId`.
2. `vidiq_social_post_draft_create`: one draft per video with YouTube, Instagram and TikTok destinations.
3. Review the draft, then `vidiq_social_post_publish`. TikTok privacy, comments and music confirmation, and YouTube privacy, are the creator's choices.
