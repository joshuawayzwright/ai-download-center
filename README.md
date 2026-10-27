# AI Download Center

A public directory for discovering major AI models, assistants, self-hosted tools, independent AI apps, and official download sources.

**Live site:** https://joshuawayzwright.github.io/ai-download-center/

**Configured featured-listing offer:** $99 USD/month after a 7-day free trial through Stripe. Checkout completion and fulfilment were not re-tested in the 27 October information audit.

**Manage billing:** https://billing.stripe.com/p/login/eVq00je9s5GX8oobxZeAg00

**Maintainer and support:** [superadmin2712@gmail.com](mailto:superadmin2712@gmail.com) · [0452 272 820](tel:+61452272820)

## Current portfolio status — 27 October 2026

The public AI directory is live on GitHub Pages. This repository also contains commercial SOLO development source; a working directory deployment does not establish that those separate products are released.

| Area | Source | Current status |
| --- | --- | --- |
| AI Download Centre | Repository root | Live public directory; latest audited Pages deployment succeeded. |
| The Solo Service Provider / SOLO AI | [powerhouse-website/](powerhouse-website/) | Commercial production serves a maintenance notice. New orders are paused; the former A$79 AI Marketing Kit is withdrawn. |
| SOLO customer access | [Draft PR #34](https://github.com/joshuawayzwright/ai-download-center/pull/34) | Login/session and durable quota implementation is under review, not merged. Live customer login, hosted concurrency and customer Gemini conversation remain unverified. |
| Android work | [Master release checklist](https://github.com/joshuawayzwright/ai-download-center/issues/31) | Source/build work exists; Google Play publication is not verified. |

The earlier owner-authenticated two-turn Gemini conversation is documented in [private API verification](docs/SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md). It is separate from customer authentication or a public AI launch. The customer branch records 148 automated checks; those checks do not close the remaining live customer gates.

Use the **current section of [master issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)** for release decisions; its later evidence supersedes older execution logs. The commercial Supabase project is separate from WrightWayz. Existing charity and commercial identities, data, payments and governance remain separate.

Directory featured listings are a separate offer from the withdrawn A$79 Marketing Kit. This information refresh does not activate, deactivate or substitute any payment link.

## Features

- Search across AI models, chatbot tools, and utilities
- Filter by category such as LLM, chatbot, assistant, self-hosted, image, video, and audio
- Showcase official website and project links
- Search live public Hugging Face models alongside the hand-picked listings
- 983 listings: 112 hand-picked tools and 871 community model cards imported from Hugging Face, all checked by the catalog validator
- Mobile-friendly landing page and catalog layout
- Easy extension through the JSON-based catalog
- AI Field Notes channel launch kit and in-browser video brief builder

## YouTube channel workspace

Open [Creator Studio](creator-studio.html) to plan videos for the proposed AI Field Notes channel. The browser-based planner drafts scripts and upload assets for faceless narration, on-camera, or screen-demo formats. The complete positioning, bio, content pillars, first-video plan, and launch checklist are in [youtube-channel-kit.md](youtube-channel-kit.md).

The planner is a template-based production aid. It does not generate footage, call an AI model, create a YouTube account, or publish videos. Verify facts and cite primary sources before publishing.

## Local development

Use any static file server from the project folder:

```bash
cd ai-download-center
node -e "const http=require('http');const fs=require('fs');const path=require('path');const root=process.cwd();const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};http.createServer((req,res)=>{let p=req.url==='/'?'/index.html':req.url.split('?')[0];const file=path.join(root, p); fs.readFile(file,(err,data)=>{if(err){res.statusCode=404;res.end('Not found');return;} res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain; charset=utf-8'); res.end(data);} );}).listen(8000,()=>console.log('http://localhost:8000'));"
```

Then open:

```text
http://localhost:8000
```

## Search visibility

The public site is published with GitHub Pages. Submit `https://joshuawayzwright.github.io/ai-download-center/sitemap.xml` to Google Search Console and Bing Webmaster Tools to request indexing. Search rankings and traffic are not guaranteed; keep the catalog current and share useful pages to improve discovery.

## Notes

This directory combines hand-picked listings and imported Hugging Face model cards with on-demand search of Hugging Face's public model API. Live search requires an internet connection and returns up to 100 relevant results per page; use Load more to continue through the registry's matching public results. Private or unlisted models and models outside Hugging Face are not included. Always confirm licensing, usage terms, and platform policies on each model card before using or hosting a model.

To refresh the community-model portion of the catalog and keep the threefold target, run:

```bash
node scripts/expand-catalog.mjs
node scripts/validate-catalog.mjs
```

## Listings and revenue

Settings live in [config.js](config.js).

- **Free submissions:** the "Submit a tool" button opens a GitHub issue form ([submit-tool.yml](.github/ISSUE_TEMPLATE/submit-tool.yml)). To accept a submission, add an entry to `data/tools.json`.
- **Featured listings:** the public "Start 7-day free trial" button opens the live Stripe subscription checkout at $99 USD/month after trial. Paid entries use `"sponsored": true` and are clearly labeled Sponsored.
- **Customer billing:** sponsors can update payment details, view invoices, or cancel through the Stripe customer portal linked from the site and confirmation page.
- **Customer support:** billing and listing enquiries use [superadmin2712@gmail.com](mailto:superadmin2712@gmail.com), phone **0452 272 820**. Please name AI Download Centre in the enquiry.
- **Affiliate links:** add `"affiliateUrl": "https://..."` to an entry. The card's link uses it (marked `rel="sponsored"`) instead of the plain `url`.

The footer tells visitors that sponsored placements are paid and that some links are affiliate links. Keep it there: advertising rules in most countries require that disclosure.

## Marketing agents

Ten Claude Code agents in [.claude/agents/](.claude/agents/) draft advertising for the directory: campaign plans, SEO pages, X, LinkedIn, Reddit, newsletter, sponsor outreach, launch posts, video scripts, and a compliance review. Run `/ad-campaign <goal>` in Claude Code to run a full campaign. Drafts land in `marketing/drafts/` for review, and nothing is posted automatically. See [marketing/README.md](marketing/README.md).

## Automations

These GitHub Actions run free on this public repository:

- **Validate catalog** ([validate-catalog.yml](.github/workflows/validate-catalog.yml)): checks `data/tools.json` on every pull request and every push to main (required fields, allowed categories, https links, no duplicates). Run it locally with `node scripts/validate-catalog.mjs`.
- **Weekly link check** ([link-check.yml](.github/workflows/link-check.yml)): every Monday morning (Australian time), it tests every catalog link and opens or updates a "Broken catalog links" issue when any fail. When they're fixed, it closes the issue. You can also run it from the Actions tab.

## Project ownership

AI Download Center's concept, design direction, and curation are credited to [@joshuawayzwright](https://github.com/joshuawayzwright). The site implementation was developed with GitHub Copilot and Claude Code. The original project code is covered by the MIT license in [LICENSE](LICENSE). Provider names, model names, logos, and linked resources belong to their respective owners.

## License

MIT
