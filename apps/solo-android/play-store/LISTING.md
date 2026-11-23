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

## Full description (1,718 / 4,000 characters)

```
SOLO AI is the AI assistant from The Solo Service Provider, built for solo operators, freelancers and small teams who want clear answers and practical help without the noise.

WHAT SOLO AI HELPS WITH
• Plan your week, your jobs and your priorities
• Draft emails, quotes, follow-ups and social posts
• Think through problems and decisions step by step
• Explain unfamiliar topics in plain English
• Suggest AI tools that suit the way you work

UP-TO-DATE ANSWERS WITH SOURCES
• When a question needs current information, SOLO searches Google and shows the web pages it used
• Tap a source to check it for yourself

DESIGNED FOR YOUR PHONE
• Replies stream in as SOLO writes them, and you can stop at any time
• Clean formatting: headings, lists, bold text and code blocks with one-tap copy
• Speak your question with your phone's voice typing, and have answers read aloud
• Regenerate an answer, share it, or copy it in one tap
• Your conversations are saved on your phone so you can pick up where you left off

HONEST AND IN YOUR CONTROL
• SOLO says when it isn't sure and never claims to have taken actions for you
• Report any reply that's harmful or wrong, right inside the app
• Delete one conversation or all of them at any time, and delete your account from Settings
• No ads and no analytics in the app
• Your sign-in is encrypted on your device and excluded from backups

FREE TO START
Create a free account with your email address to get free messages every day.

AI replies can be wrong, so check anything important. Don't share passwords, payment details or other sensitive information.

Privacy: https://thesoloserviceprovider.com.au/privacy.html#solo-ai
The Solo Service Provider · Gold Coast, Queensland
```

## Graphics

| Asset | File | Play requirement |
| --- | --- | --- |
| App icon | `icon-512.png` (the approved SOLO AI master, unchanged) | 512 × 512 PNG |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 PNG/JPEG |
| Phone screenshots | `screenshots/1-welcome.png`, `2-conversation.png`, `3-follow-up.png`, `4-plan-my-week.png` | 2–8 images, 1080 × 2160 (2:1) |

The screenshots are rendered from the real app UI by `SoloAppUiTest`, using a scripted
sample conversation. Regenerate them with
`./gradlew :app:testDebugUnitTest --tests '*SoloAppUiTest'` (output:
`app/build/play-screenshots/`). Once chat is live, replace them with captures from a real
phone showing real SOLO replies.

The feature graphic uses Inter, the brand's body font. The brand headline font (Montra) wasn't
available. Replace it if you have a licensed copy.

## Before you upload

This text describes version 1.1.0. Use it only once these are live on production:

- **Free sign-up.** Creating an account, the 8-digit verification code and the password
  reset code all work for a new address, through `/api/solo-onboarding`. That needs custom SMTP on the commercial Supabase project; Supabase's
  built-in email only reaches project team members.
- **Answers with sources.** Google Search grounding is switched on in `/api/solo-chat`.
- **Account deletion.** `delete_account` is deployed.
- **Privacy notice.** It covers public accounts, Google Search grounding and in-app account
  deletion.

Until then, keep using the 1.0.0 text (invite-only early access, no sources). Listing
features that don't work yet breaks Play's policies and the brand rule against presenting
unfinished features as live.

**Play Console data safety and account deletion.** The app creates accounts, so Play needs
an account deletion URL as well as the in-app option, for example
https://thesoloserviceprovider.com.au/privacy.html#solo-ai with the deletion steps.

## Release notes: 1.3.0

Paste into "What's new" for the 1.3.0 release (en-AU, under 500 characters):

```
New for Pro testers: connect Google Contacts, Tasks and Drive (only files you pick), add Calendar bookings, and ask about travel times and places with Google Maps. SOLO never changes anything without your tap on Confirm.
```

Play Console: before this goes beyond testers, update Data safety for contacts, calendar,
tasks and files the user picks; each is read on the server for that user's reply, not stored.

## Release notes: 1.2.1

Paste into "What's new" for the 1.2.1 release (en-AU, under 500 characters):

```
Sharper SOLO AI icon: the picture on the home screen and beside replies now shows its full rounded frame.
```

## Release notes: 1.2.0

Paste into "What's new" for the 1.2.0 release (en-AU, under 500 characters):

```
New for testers: connect Google Calendar (read-only) in Settings > Connected apps, then ask "What's on this week?". Read aloud now works on more phones and speaks on the first tap. New sign-up codes can be requested after 60 seconds, and the code email tells you to check Spam.
```

Play Console: update Data safety before this release goes beyond testers. The app now
lets users connect Google Calendar; event titles, times, locations and busy status are
read by the server for that user's reply (not stored, encrypted in transit). The stored
Google connection key is encrypted and deleted on disconnect or account deletion.

## Release notes: 1.1.1

Paste into "What's new" for the 1.1.1 release (en-AU, under 500 characters):

```
Smoother display on Android 15 and newer: SOLO AI now draws edge to edge, with the top bar, chat box and keyboard kept clear of the system bars. Updated Android libraries.
```

Technical note: 1.1.1 removes the app's own deprecated window bar colours and updates
androidx.activity (1.13.0) and core-splashscreen (1.2.0). AndroidX still contains
version-gated calls to `Window.setStatusBarColor` / `setNavigationBarColor` /
`setDecorFitsSystemWindows` for Android 14 and older (EdgeToEdgeApi26/29/35 and Compose
`ViewCompatShims`). They never run on Android 15+, but Play's static scan may still list
them. Play treats that notice as a recommendation, not a blocker.
