---
name: ad-campaign
description: Run a full AI Download Center ad campaign. The strategist plans it, the chosen channel agents write drafts, and the compliance reviewer checks everything. Use when the user says "run a campaign", "make ads", "promote the site", or "/ad-campaign <goal>".
---

# Run an ad campaign

The goal comes from the user's arguments, e.g. "sell featured listings" or "get developers to the self-hosted section". If no goal is given, use "grow visitors to the directory".

1. **Plan:** run the `campaign-strategist` agent with the goal. Read the brief it writes in `marketing/drafts/briefs/`.
2. **Write:** run every channel agent the brief names, in parallel, in the background. Pass each agent the brief's path and the campaign slug, e.g. "Follow the brief at marketing/drafts/briefs/2026-10-01-self-hosted.md. Campaign slug: self-hosted."
3. **Review:** when all drafts exist, run `compliance-reviewer` on the drafts from this campaign.
4. **Report to the user:**
   - Each draft file as a link, with its review status (APPROVED / NEEDS CHANGES)
   - Every `[NEEDS INFO]`, `[NEEDS OWNER APPROVAL]`, and `[NEEDS ACCOUNT]` item they must resolve
   - The posting order and days from the brief

Nothing in this workflow posts, sends, or publishes. The user posts the approved drafts themselves.
