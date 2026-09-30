# AI Download Center

A GitHub-ready directory for discovering major AI models, assistants, self-hosted tools, and independent AI apps.

## Features

- Search across AI models, chatbot tools, and utilities
- Filter by category such as LLM, chatbot, assistant, self-hosted, image, video, and audio
- Showcase official website and project links
- Search live public Hugging Face models alongside the curated listings
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

## Listings and revenue

Settings live in [config.js](config.js).

- **Free submissions:** the "Submit a tool" button opens a GitHub issue form ([submit-tool.yml](.github/ISSUE_TEMPLATE/submit-tool.yml)). To accept a submission, add an entry to `data/tools.json`.
- **Featured listings:** add `"sponsored": true` to an entry in `data/tools.json`. It moves to the top of the catalog with a Sponsored badge. The "Get featured" button opens a request form until you set `featuredCheckoutUrl` to a Stripe Payment Link, Gumroad or Lemon Squeezy checkout URL.
- **Affiliate links:** add `"affiliateUrl": "https://..."` to an entry. The card's link uses it (marked `rel="sponsored"`) instead of the plain `url`.

The footer tells visitors that sponsored placements are paid and that some links are affiliate links. Keep it there: advertising rules in most countries require that disclosure.

## Project ownership

AI Download Center's concept, design direction, and curation are credited to [@joshuawayzwright](https://github.com/joshuawayzwright). The site implementation was developed with GitHub Copilot. The original project code is covered by the MIT license in [LICENSE](LICENSE). Provider names, model names, logos, and linked resources belong to their respective owners.

## License

MIT
