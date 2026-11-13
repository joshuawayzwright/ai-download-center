# SOLO AI: Google Play store listing

Draft listing text and graphics for Play Console (**Grow → Store presence → Main store
listing**). Use these only once the conditions in "Before you upload" are met.

| Field | Value | Limit |
| --- | --- | --- |
| App name | SOLO AI | 30 |
| Short description | Your AI guide for solo operators: plans, emails, ideas and clear answers. | 80 (73) |
| Category | Productivity | |
| Contact email | hello@thesoloserviceprovider.com.au | |
| Website | https://thesoloserviceprovider.com.au/solo-ai.html | |
| Privacy policy | https://thesoloserviceprovider.com.au/privacy.html | |

## Full description (1,646 / 4,000 characters)

```
SOLO AI is the AI assistant from The Solo Service Provider, built for solo operators, freelancers and small teams who want clear answers and practical help without the noise.

WHAT SOLO AI HELPS WITH
• Plan your week, your jobs and your priorities
• Draft emails, quotes, follow-ups and social posts
• Think through problems and decisions step by step
• Explain unfamiliar topics in plain English
• Suggest AI tools that suit the way you work

DESIGNED FOR YOUR PHONE
• Replies stream in as SOLO writes them, and you can stop at any time
• Clean formatting: headings, lists, bold text and code blocks with one-tap copy
• Speak your question with your phone's voice typing, and have answers read aloud
• Regenerate an answer, share it, or copy it in one tap
• Your conversations are saved on your phone so you can pick up where you left off

HONEST AND IN YOUR CONTROL
• SOLO says when it isn't sure and never claims to have browsed the web or taken actions for you
• Report any reply that's harmful or wrong, right inside the app
• Delete one conversation or all of them at any time
• No ads and no analytics in the app
• Your sign-in is encrypted on your device and excluded from backups

EARLY ACCESS
SOLO AI is in early access for invited accounts, with a daily message allowance. Sign in with the email address you were invited with. Ask about early access at hello@thesoloserviceprovider.com.au.

AI replies can be wrong, so check anything important. Don't share passwords, payment details or other sensitive information.

Privacy: https://thesoloserviceprovider.com.au/privacy.html#solo-ai
The Solo Service Provider · Gold Coast, Queensland
```

## Graphics

| Asset | File | Play requirement |
| --- | --- | --- |
| App icon | `icon-512.png` (the approved SOLO AI master, unchanged) | 512 × 512 PNG |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 PNG/JPEG |
| Phone screenshots | `screenshots/1-welcome.png`, `2-conversation.png`, `3-follow-up.png` | 2–8 images, 1080 × 2160 (2:1) |

The screenshots are rendered from the real app UI by `SoloAppUiTest`, using a scripted
sample conversation. Regenerate them with
`./gradlew :app:testDebugUnitTest --tests '*SoloAppUiTest'` (output:
`app/build/play-screenshots/`). Once chat is live, replace them with captures from a real
phone showing real SOLO replies.

The feature graphic uses Inter, the brand's body font. The brand headline font (Montra) wasn't
available. Replace it if you have a licensed copy.

## Before you upload

- SOLO AI chat must work for testers: the production endpoint is deployed, and #34 and #52
  are merged and enabled. Otherwise this listing would describe features that aren't
  available, which breaks Play's policies and the brand rule against presenting unfinished
  features as live.
- The privacy notice section (solo-commerce PR #39) must be deployed.
