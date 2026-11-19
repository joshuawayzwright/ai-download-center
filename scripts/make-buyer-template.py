#!/usr/bin/env python3
"""Build a clean directory template for a Directory Launch buyer.

Copies the core public directory files into a new folder, resets every
owner-specific setting in config.js, replaces the catalogue with sample
listings, and reports any file that still mentions this site's brand or
contact details so they can be edited before the buyer's site goes live.

Usage: python3 scripts/make-buyer-template.py <output-dir> [--name "Site name"]
"""
from pathlib import Path
import argparse
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]

# The core directory only. Category guides, Creator Studio, legal pages and
# search-console verification files belong to this site, not the buyer's.
TEMPLATE_FILES = (
    '.nojekyll', 'LICENSE',
    'index.html', 'featured-thanks.html',
    'app.js', 'analytics.js', 'hf-classify.js',
    'styles.css', 'guide.css', 'favicon.svg',
)

CONFIG_TEMPLATE = """// Site settings for listings and revenue. Edit these values; no other code changes are needed.
window.SITE_CONFIG = {{
  repoUrl: '',

  // Paid featured listing. Paste your Stripe Payment Link, Gumroad or Lemon Squeezy checkout URL here.
  // While it is empty, the "Get featured" button opens a request form instead.
  featuredCheckoutUrl: '',
  featuredPrice: '$99 USD',
  featuredPeriod: 'per month',

  // Where sponsors manage or cancel their subscription (Stripe customer portal login link).
  billingPortalUrl: '',
  // A public contact address for sponsors (shown on the confirmation page). Leave empty to hide it.
  supportEmail: '',
  // The business name customers see on checkout and their card statement.
  merchantName: {name},

  // Google Analytics 4 Measurement ID, e.g. 'G-ABC123XYZ9'. While it is empty, no analytics code loads.
  gaMeasurementId: '',
}};
"""

SAMPLE_TOOLS = {
    'tools': [
        {
            'name': 'Example Listing One', 'company': 'Example Co', 'category': 'chatbot',
            'platform': 'Web app', 'version': 'Latest', 'price': 'Free',
            'tags': ['example'], 'description': 'Replace this with a one-line description.',
            'url': 'https://example.com/',
        },
        {
            'name': 'Example Listing Two', 'company': 'Example Co', 'category': 'chatbot',
            'platform': 'Web app', 'version': 'Latest', 'price': 'Paid',
            'tags': ['example'], 'description': 'Replace this with a one-line description.',
            'url': 'https://example.org/',
        },
    ]
}

# Strings that identify this site or its owner. Any template file that still
# contains one is reported for manual editing.
OWNER_MARKERS = (
    'superadmin2712', '0452 272 820', '61452272820', 'joshuawayzwright',
    'Solo Service Provider', 'AI Download Center', 'G-18D31VQ9SB',
    'buy.stripe.com', 'billing.stripe.com',
)


def make_template(output, name):
    output = Path(output).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Choose an output folder outside this repository.')
    if output.exists() and any(output.iterdir()):
        raise ValueError(f'Output folder is not empty: {output}')
    for rel in TEMPLATE_FILES:
        source = ROOT / rel
        if not source.is_file() or source.is_symlink():
            raise ValueError(f'Missing or symlinked template file: {rel}')

    output.mkdir(parents=True, exist_ok=True)
    for rel in TEMPLATE_FILES:
        destination = output / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / rel, destination)

    (output / 'config.js').write_text(CONFIG_TEMPLATE.format(name=json.dumps(name)), encoding='utf-8')
    (output / 'data').mkdir(exist_ok=True)
    (output / 'data' / 'tools.json').write_text(json.dumps(SAMPLE_TOOLS, indent=2) + '\n', encoding='utf-8')

    flagged = {}
    for path in sorted(output.rglob('*')):
        # The MIT licence must keep its original copyright line.
        if not path.is_file() or path.name == 'LICENSE':
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        hits = sorted({marker for marker in OWNER_MARKERS if marker in text})
        if hits:
            flagged[str(path.relative_to(output))] = hits
    return output, flagged


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('output', help='new, empty folder outside this repository')
    parser.add_argument('--name', default='My Directory', help="the buyer's site or business name")
    args = parser.parse_args(argv)
    try:
        output, flagged = make_template(args.output, args.name)
    except ValueError as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    print(f'Template written to {output}')
    print('Next: add listings to data/tools.json and paste the buyer\'s checkout link into config.js.')
    if flagged:
        print('\nStill mentions this site or its owner. Edit before going live:')
        for rel, hits in flagged.items():
            print(f'  {rel}: {", ".join(hits)}')
    print('\nThe buyer needs their own privacy policy and terms pages; this template includes neither.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
