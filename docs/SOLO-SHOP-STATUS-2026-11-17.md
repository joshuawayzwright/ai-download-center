# SOLO shop status — 17 November 2026

**The Solo Service Provider shop is live and taking orders.** This replaces the "orders paused" and "coming soon, not for sale" statements in earlier docs, which are kept for history.

## What was checked

Checked on 17 November 2026 against the live site, not this repository:

- https://thesoloserviceprovider.com.au/shop/ shows **16 product cards, each with a Buy Now button**. The product list comes from `/shop/products.json`.
- Buy Now on **SOLO Cashflow Control** opened a live Stripe Checkout session (`cs_live_…`). The check stopped at the payment page and made no purchase.
- The shop states that prices are in AUD with no GST (the business isn't registered for GST), offers a 30-day money-back guarantee, and runs a launch code, **LAUNCH20** (20% off until 31 December 2026).
- The only remaining COMING SOON on the live site is the **SOLO AI assistant**, which is not a public service.

## Products and prices on the live shop

| Product | Price |
| --- | --- |
| SOLO Complete Toolkit — All Ten Products | A$79 |
| SOLO Trade Edition: Cleaners | A$49 |
| SOLO Trade Edition: Handyman & Home Maintenance | A$49 |
| SOLO Trade Edition: Lawn Mowing & Gardening | A$49 |
| SOLO Trade Edition: Mobile Dog Grooming | A$49 |
| SOLO Revenue Rescue DIY Kit | A$39 |
| SOLO Cashflow Control | A$29 |
| SOLO Quote & Invoice Builder | A$29 |
| SOLO Small Business Operations Hub | A$29 |
| SOLO Client Booking & Follow-Up | A$19 |
| SOLO Content Repurposing Studio | A$19 |
| SOLO Customer Support Desk | A$19 |
| SOLO Digital Product Launch System | A$19 |
| SOLO Business Research Dashboard | A$15 |
| SOLO Job Application Command Centre | A$12 |
| SOLO AI Workflow Starter Pack | A$9 |

## Not checked here

- A completed purchase, payment-confirmed download delivery and refunds.
- The checkout currency for Australian buyers. A test from a US browser showed **$20.32** for the A$29 Cashflow Control, which looks like Stripe converting the price to the buyer's currency. Confirm an Australian buyer sees A$29.

## Where the code lives

The live shop's source is **not in this repository**. It appears to be [`joshuawayzwright/solo-commerce`](https://github.com/joshuawayzwright/solo-commerce) (`public-static-release/public/shop/`, found 21 November 2026 by matching the live shop's files). These parts of this repo still describe the older coming-soon build and are out of sync with production:

- `powerhouse-website/`: coming-soon product cards with no checkout.
- `data/solo-commerce-catalogue.json` and `data/solo-knowledge.json`: every product is `coming_soon_not_for_sale` with no price.
- `scripts/verify-powerhouse-package.py`: fails if those files show a product for sale.

Change these together, or retire them, once the repository that deploys the live shop is confirmed.
