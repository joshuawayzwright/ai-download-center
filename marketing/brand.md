# AI Download Center: brand facts

Every marketing agent reads this file before writing. If a fact you need isn't here or in the repo, don't invent it: write `[NEEDS INFO: ...]` in the draft instead.

## The product

- **Name:** AI Download Center
- **URL:** https://joshuawayzwright.github.io/ai-download-center/
- **What it is:** a free, searchable directory of AI models, chatbots, assistants, self-hosted apps, and creative tools, plus a curated set of open-source Android apps (APKs) linked to their official download pages. Every listing links to the official source. Search also covers public models on Hugging Face.
- **Catalog facts:** read `data/tools.json` for the current count, categories, and entries. Never quote a number without checking it there.
- **Maker:** @joshuawayzwright (https://github.com/joshuawayzwright)
- **Source code:** public on GitHub, MIT licensed.

## Two audiences

1. **Visitors (free):** developers, researchers, students, and teams choosing an AI tool. They want to compare options fast and get to the official source without SEO spam.
2. **Sponsors (paid):** AI startups and tool makers who want to be seen by those visitors.
   - Featured listing: **$99 per month** (check `config.js` for the current price). Pinned to the top of the catalog, shown first in matching searches, labeled "Sponsored".
   - Free listing: submit through the GitHub form. It's reviewed by hand.
   - Request links:
     - Featured: https://github.com/joshuawayzwright/ai-download-center/issues/new?template=featured-listing.yml
     - Free: https://github.com/joshuawayzwright/ai-download-center/issues/new?template=submit-tool.yml

## Voice

- Plain, specific, and useful. Write like a knowledgeable friend, not a hype account.
- Lead with what the reader gets. Name real tools and categories from the catalog.
- No "revolutionary", "game-changing", "unlock", "supercharge", or "10x".
- No emoji walls. One emoji at most, and only where the platform expects it.

## Hard rules (all agents)

- **No invented facts.** No made-up user counts, traffic, testimonials, reviews, partnerships, or rankings. The site has no public traffic numbers yet, so don't claim any.
- **No implied endorsement.** OpenAI, Google, Anthropic, Meta, and every other listed company are not partners or sponsors. Don't imply they are.
- **Disclose paid placement.** Anything that promotes a sponsored listing says it's sponsored.
- **Respect platform rules.** Follow each community's self-promotion rules. Never suggest fake accounts, vote manipulation, or posting the same thing in many places at once.
- **Email law.** Outreach emails need a real sender name, an honest subject line, a postal address placeholder, and an easy way to opt out (CAN-SPAM, and GDPR where it applies).
- **Drafts only.** Agents write drafts to `marketing/drafts/`. A person reviews and posts them. Agents never post, send, or publish anything.
