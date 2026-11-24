#!/usr/bin/env python3
"""Add or refresh the "More guides" list on every guide page.

The guide list comes from the #guides grid in index.html, so adding a card there
and re-running this script updates every guide. Safe to run repeatedly.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BLOCK = re.compile(r'<section class="related-guides" data-related-guides.*?</section>\n\n        ', re.S)


def guides():
    index = (ROOT / 'index.html').read_text()
    start = index.index('<section class="guides" id="guides"')
    grid = index[start:index.index('</section>', start)]
    cards = re.findall(r'<a class="collection-card[^"]*" href="([^"#?]+\.html)">\s*<span[^>]*>[^<]*</span>\s*<h3>([^<]+)</h3>', grid)
    return [(href, title) for href, title in cards if (ROOT / href).is_file()]


def main():
    all_guides = guides()
    for href, _ in all_guides:
        path = ROOT / href
        text = BLOCK.sub('', path.read_text())
        if '<section class="newsletter"' not in text:
            print(f'skipped {href}: no newsletter section to anchor on')
            continue
        items = '\n'.join(f'          <li><a href="{o}">{t}</a></li>' for o, t in all_guides if o != href)
        block = ('<section class="related-guides" data-related-guides aria-labelledby="relatedGuidesTitle">\n'
                 '        <h2 id="relatedGuidesTitle">More guides</h2>\n'
                 f'        <ul>\n{items}\n        </ul>\n'
                 '        </section>\n\n        ')
        path.write_text(text.replace('<section class="newsletter"', block + '<section class="newsletter"', 1))
    print(f'Linked {len(all_guides)} guide pages.')


if __name__ == '__main__':
    main()
