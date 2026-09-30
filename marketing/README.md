# Marketing agents

Ten Claude Code agents that draft advertising for AI Download Center. They write drafts to `marketing/drafts/`. A person reviews and posts them, and no agent posts, sends, or publishes anything.

All agents follow [brand.md](brand.md): the product facts, pricing, voice, and hard rules. Update that file when anything changes (for example the price or the URL), and every agent picks it up.

## The agents

| Agent | What it makes | Output folder |
|---|---|---|
| `campaign-strategist` | Campaign brief: goal, hook, which channels, and UTM tags | `drafts/briefs/` |
| `seo-writer` | Search landing pages and meta tags | `drafts/seo/` |
| `x-writer` | X posts and a thread | `drafts/x/` |
| `linkedin-writer` | LinkedIn posts, including one aimed at sponsors | `drafts/linkedin/` |
| `reddit-writer` | Rule-checked Reddit posts per subreddit | `drafts/reddit/` |
| `newsletter-writer` | Email newsletter issue | `drafts/newsletter/` |
| `sponsor-outreach` | Prospect list and outreach emails for featured listings | `drafts/outreach/` |
| `launch-writer` | Product Hunt, Show HN, and Indie Hackers posts | `drafts/launch/` |
| `video-scriptwriter` | Shorts/TikTok scripts and a YouTube outline | `drafts/video/` |
| `compliance-reviewer` | Fact, disclosure, platform-rule, and email-law check | adds a review block to each draft |

## How to use them

Open Claude Code in this repo, then either:

- **Run a whole campaign:** `/ad-campaign sell featured listings to AI startups`
- **Run one agent:** "Use the reddit-writer agent to draft posts about the self-hosted tools."

Always run `compliance-reviewer` before posting. Only post drafts marked **APPROVED**.

## Placeholders to fill in

Drafts use these when an agent can't know the answer:
- `[NEEDS INFO: ...]`: a fact the agent couldn't verify
- `[NEEDS OWNER APPROVAL]`: a decision such as a discount
- `[NEEDS ACCOUNT]`: a demo that needs a login
- `[YOUR NAME]`, `[POSTAL ADDRESS]`, `[UNSUBSCRIBE LINK]`: required in emails by law

## Cost

The agents run on your Claude plan. Writers use Sonnet and the reviewer uses Opus. A full campaign uses 5–7 agent runs.
