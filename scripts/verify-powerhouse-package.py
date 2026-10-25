#!/usr/bin/env python3
"""Validate the approved Powerhouse package before any deployment."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1] / "powerhouse-website"
REQUIRED = {
    "index.html", "digital-products.html", "solo-ai.html", "contact.html",
    "marketing-kit.html", "privacy.html", "refunds.html", "terms.html",
    "thank-you.html", "styles.css", "solo-chat.js",
    "assets/solo-hero.webp", "assets/business-icon.webp",
    "downloads/five-minute-ai-marketing-fix.pdf",
    *(f"assets/kit{i}.webp" for i in range(1, 11)),
}
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.local = []
        self.external = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("href", "src"):
            url = a.get(key, "")
            if not url or url.startswith(("#", "mailto:", "tel:", "data:")):
                continue
            if url.startswith(("http://", "https://")):
                self.external.append(url)
            elif url.startswith("/"):
                self.local.append(urlsplit(url).path.lstrip("/"))
            elif not url.startswith("//"):
                self.local.append(urlsplit(url).path)
def main():
    if not ROOT.is_dir():
        sys.exit("BLOCKED: Approved website not imported to powerhouse-website/")
    missing = sorted(p for p in REQUIRED if not (ROOT / p).is_file())
    issues = []
    for page in ROOT.glob("*.html"):
        links = Links()
        links.feed(page.read_text(encoding="utf-8"))
        for local in links.local:
            if local and not (ROOT / local).is_file():
                issues.append(f"{page.name}: missing {local}")
    kit = (ROOT / "marketing-kit.html").read_text(encoding="utf-8")
    if "https://buy.stripe.com/4gM8wP2qK0mDaww1XpeAg01" not in kit:
        issues.append("Existing A$79 Stripe checkout link not retained")
    if missing or issues:
        for m in missing:
            print("MISSING:", m)
        for issue in issues:
            print("ERROR:", issue)
        sys.exit(1)
    print(f"PASS: {len(REQUIRED)} required files, local HTML links and existing checkout retained")
    print("NOTE: Browser visual QA and payment fulfilment require separate verification")
if __name__ == "__main__":
    main()
