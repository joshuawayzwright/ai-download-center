# AI Download Center

A lightweight, GitHub-ready catalog site for discovering official AI tools, open-source models, and community resources.

## Features

- Search across AI models and tool categories
- Filter by category and platform
- Showcase official download sources
- Clean, mobile-responsive layout
- Easy to extend with more entries in the JSON catalog

## Local development

```bash
cd ai-download-center
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project structure

```text
ai-download-center/
├── index.html
├── styles.css
├── app.js
├── data/
│   └── tools.json
├── README.md
├── .gitignore
└── LICENSE
```

## Notes

This project is intended to surface official releases, open-source repositories, and reputable links only. Always verify licensing and platform rules before downloading or using AI tools.

## License

This project is licensed under the MIT License.
