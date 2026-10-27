#!/usr/bin/env python3
"""Validate the public, coming-soon Powerhouse website before deployment."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import sys

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "powerhouse-website"
PAGES = {
    "index.html", "digital-products.html", "solo-ai.html", "contact.html",
    "privacy.html", "refunds.html", "terms.html", "thank-you.html",
}
REQUIRED = PAGES | {
    "styles.css", "solo-chat.js", "robots.txt", "sitemap.xml",
    "assets/approved-stage/business-app-icon-512.png",
    "assets/approved-stage/business-emblem.png",
    "assets/approved-stage/solo-ai-app-icon-512.png",
    "downloads/five-minute-ai-marketing-fix.pdf",
}
PRODUCTS = {
    "solo-cashflow-control": "SOLO Cashflow Control",
    "solo-quote-invoice-builder": "SOLO Quote & Invoice Builder",
    "solo-client-booking-follow-up": "SOLO Client Booking & Follow-Up",
    "solo-job-application-command-centre": "SOLO Job Application Command Centre",
    "solo-content-repurposing-studio": "SOLO Content Repurposing Studio",
    "solo-customer-support-desk": "SOLO Customer Support Desk",
    "solo-small-business-operations-hub": "SOLO Small Business Operations Hub",
    "solo-digital-product-launch-system": "SOLO Digital Product Launch System",
    "solo-business-research-dashboard": "SOLO Business Research Dashboard",
    "solo-ai-workflow-starter-pack": "SOLO AI Workflow Starter Pack",
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
PRICE = re.compile(r"(?:\$\s*\d|\bAUD\s*\d|\d[\d,.]*\s*AUD\b)", re.I)
SITE_HOSTS = {"thesoloserviceprovider.com.au", "www.thesoloserviceprovider.com.au"}
CHECKOUT_HOSTS = {"buy.stripe.com", "checkout.stripe.com", "paypal.me"}


class Node:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def nodes(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.nodes()

    def text(self):
        if self.tag in {"script", "style"}:
            return ""
        return " ".join(child.text() if isinstance(child, Node) else child for child in self.children)


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def clean(text):
    return " ".join(text.split())


def main():
    issues = [f"Missing required file: {name}" for name in sorted(REQUIRED) if not (ROOT / name).is_file()]
    pages = {name: Page((ROOT / name).read_text(encoding="utf-8")) for name in PAGES if (ROOT / name).is_file()}
    ids = {name: [n.attrs["id"] for n in p.root.nodes() if "id" in n.attrs] for name, p in pages.items()}

    for name, page in pages.items():
        if any(count > 1 for count in Counter(ids[name]).values()):
            issues.append(f"{name}: duplicate HTML id")
        if PRICE.search(page.root.text()):
            issues.append(f"{name}: public price found while all products are coming soon")
        for node in page.root.nodes():
            for attr in ("href", "src", "action"):
                value = node.attrs.get(attr, "")
                if not value:
                    continue
                url = urlsplit(value)
                if url.hostname in CHECKOUT_HOSTS or re.search(r"(?:^|/)checkout(?:/|$)", url.path, re.I):
                    issues.append(f"{name}: actionable checkout link is not permitted")
                if url.scheme in {"mailto", "tel", "data"}:
                    continue
                if url.scheme and url.scheme not in {"http", "https"}:
                    issues.append(f"{name}: unsupported link scheme {url.scheme}")
                    continue
                if url.netloc and url.hostname not in SITE_HOSTS:
                    continue
                local = unquote(url.path).lstrip("/") if url.path else name
                if not local or url.path.endswith("/"):
                    local += "index.html"
                target = (ROOT / local).resolve()
                if not target.is_relative_to(ROOT.resolve()) or not target.is_file():
                    issues.append(f"{name}: missing or out-of-root local target {local}")
                elif url.fragment and local in pages and unquote(url.fragment) not in ids[local]:
                    issues.append(f"{name}: missing fragment {value}")

    for name in ("index.html", "digital-products.html"):
        if name not in pages:
            continue
        cards = [n for n in pages[name].root.nodes() if n.tag == "article" and "product" in n.attrs.get("class", "").split()]
        if len(cards) != 10 or Counter(n.attrs.get("id") for n in cards) != Counter(PRODUCTS.keys()):
            issues.append(f"{name}: expected exactly the ten replacement product cards, once each")
        for card in cards:
            product = PRODUCTS.get(card.attrs.get("id"), "unknown product")
            headings = [clean(n.text()) for n in card.nodes() if n.tag in {"h2", "h3"}]
            badges = [n for n in card.nodes() if "pending" in n.attrs.get("class", "").split()]
            if headings != [product] or len(badges) != 1 or clean(badges[0].text()) != "COMING SOON":
                issues.append(f"{name}: {product} needs its correct title and one COMING SOON badge")
            elif badges[0].attrs.get("aria-label") != f"{product} is coming soon":
                issues.append(f"{name}: {product} needs the matching accessible coming-soon label")
            for node in card.nodes():
                if node.tag == "form" or (node.tag == "button" and "disabled" not in node.attrs):
                    issues.append(f"{name}: {product} has an unexpected active product control")
                if node.tag == "a" and not node.attrs.get("href", "").startswith("mailto:"):
                    issues.append(f"{name}: {product} may offer an email enquiry, not a purchase action")

    for filename, key in (("solo-commerce-catalogue.json", "launch_products"), ("solo-knowledge.json", "products")):
        try:
            entries = json.loads((REPO / "data" / filename).read_text(encoding="utf-8"))[key]
            if len(entries) != 10 or Counter(p.get("id") for p in entries) != Counter(PRODUCTS.keys()):
                issues.append(f"{filename}: expected exactly the ten replacement products")
            for product in entries:
                if product.get("name") != PRODUCTS.get(product.get("id")) or product.get("status") != "coming_soon_not_for_sale":
                    issues.append(f"{filename}: incorrect product name or availability")
                if "checkout_url" not in product or product["checkout_url"] is not None or any(product.get(field) is not None for field in ("price", "price_aud", "proposed_price_aud")):
                    issues.append(f"{filename}: coming-soon products must have no price or checkout")
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            issues.append(f"{filename}: invalid catalogue structure ({type(error).__name__})")

    if issues:
        for issue in issues:
            print("ERROR:", issue)
        sys.exit(1)
    print(f"PASS: {len(REQUIRED)} required static files; local links/anchors; ten COMING SOON cards on each catalogue page; no price or checkout")
    print("NOTE: Historical Stripe records are retained separately. Browser acceptance, AI availability and future paid fulfilment require their own evidence.")


if __name__ == "__main__":
    main()
