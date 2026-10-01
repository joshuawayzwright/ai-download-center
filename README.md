# AI Download Center

A public directory for discovering major AI models, assistants, self-hosted tools, independent AI apps, and official download sources.

**Live site:** https://joshuawayzwright.github.io/ai-download-center/

**Featured listing:** $99 USD/month after a 7-day free trial, securely billed through Stripe.

**Manage billing:** https://billing.stripe.com/p/login/eVq00je9s5GX8oobxZeAg00

**Support:** hello@thesoloserviceprovider.com.au

## Features

- Search across AI models, chatbot tools, and utilities
- Filter by category such as LLM, chatbot, assistant, self-hosted, image, video, and audio
- Showcase official website and project links
- Search live public Hugging Face models alongside the curated listings
- 1,000 validated listings, including community model cards from Hugging Face
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

This directory combines a curated catalog with on-demand search of Hugging Face's public model API. Live search requires an internet connection and returns up to 100 relevant results per page; use Load more to continue through the registry's matching public results. Private or unlisted models and models outside Hugging Face are not included. Always confirm licensing, usage terms, and platform policies on each model card before using or hosting a model.

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
- **Customer support:** billing and listing support uses `hello@thesoloserviceprovider.com.au`.
- **Affiliate links:** add `"affiliateUrl": "https://..."` to an entry. The card's link uses it (marked `rel="sponsored"`) instead of the plain `url`.

The footer tells visitors that sponsored placements are paid and that some links are affiliate links. Keep it there: advertising rules in most countries require that disclosure.

## Marketing agents

Ten Claude Code agents in [.claude/agents/](.claude/agents/) draft advertising for the directory: campaign plans, SEO pages, X, LinkedIn, Reddit, newsletter, sponsor outreach, launch posts, video scripts, and a compliance review. Run `/ad-campaign <goal>` in Claude Code to run a full campaign. Drafts land in `marketing/drafts/` for review, and nothing is posted automatically. See [marketing/README.md](marketing/README.md).

## Automations

These GitHub Actions run free on this public repository:

- **Validate catalog** ([validate-catalog.yml](.github/workflows/validate-catalog.yml)): checks `data/tools.json` on every pull request and every push to main (required fields, allowed categories, https links, no duplicates). Run it locally with `node scripts/validate-catalog.mjs`.
- **Weekly link check** ([link-check.yml](.github/workflows/link-check.yml)): every Monday morning (Australian time), it tests every catalog link and opens or updates a "Broken catalog links" issue when any fail. When they're fixed, it closes the issue. You can also run it from the Actions tab.

## Project ownership

AI Download Center's concept, design direction, and curation are credited to [@joshuawayzwright](https://github.com/joshuawayzwright). The site implementation was developed with GitHub Copilot. The original project code is covered by the MIT license in [LICENSE](LICENSE). Provider names, model names, logos, and linked resources belong to their respective owners.

## License

MIT
