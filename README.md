# AI Download Center

A GitHub-ready directory for discovering major AI models, assistants, self-hosted tools, and independent AI apps.

## Features

- Search across AI models, chatbot tools, and utilities
- Filter by category such as LLM, chatbot, assistant, self-hosted, image, video, and audio
- Showcase official website and project links
- Mobile-friendly landing page and catalog layout
- Easy extension through the JSON-based catalog

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

## Notes

This directory is meant to help users explore official sources and major AI tools in one place. Always confirm licensing, usage terms, and platform policies before using or hosting any model or tool.

## License

MIT
