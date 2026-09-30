# Contributing

Thanks for helping improve the AI Download Center catalog.

## Ways to contribute

- Suggest a new tool or model entry via the issue template.
- Improve the catalog structure, UI copy, or category organization.
- Fix broken links, configuration issues, or documentation gaps.
- Help refine the GitHub Pages setup and deployment flow.

## Local preview

From the project root, serve the site locally:

```bash
node -e "const http=require('http');const fs=require('fs');const path=require('path');const root=process.cwd();const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};http.createServer((req,res)=>{let url=req.url==='/'?'/index.html':req.url.split('?')[0];let file=path.join(root,url);fs.readFile(file,(err,data)=>{if(err){res.statusCode=404;res.end('Not found');return;}res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain; charset=utf-8');res.end(data);});}).listen(8000,()=>console.log('http://localhost:8000'));"
```

Then open `http://localhost:8000` in a browser.

## Submission quality

- Prefer official project URLs and company-owned pages.
- Keep categories consistent with the existing catalog taxonomy.
- Add clear, accurate descriptions and useful labels.
- Verify licensing, pricing, and platform status before submitting.

## Pull requests

- Keep changes focused and easy to review.
- Validate the site locally before opening a PR.
- Update docs or UI copy when behavior changes.
