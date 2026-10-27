# SOLO — Commercial Launch Blocker Audit (27 October 2026)

## Production storefront
- https://thesoloserviceprovider.com.au/ currently serves a **maintenance page**: "WE'RE BUILDING WHAT'S NEXT." It explicitly states that the store and AI platform are temporarily unavailable and new orders paused.
- Production homepage returns HTTP 200, but **HTTP 200 does not mean the store is open**.
- Do not override maintenance without owner confirmation of the intended cutover.

## Stripe — verified live account
- Account: `acct_1UHgnLEDtq3SEtM7` (Joshua Wright – Sole Trader).
- Existing AI Marketing Kit link: `plink_1UHjwyEDtq3SEtM7DQ7dfvUW`.
- Link: `https://buy.stripe.com/4gM8wP2qK0mDaww1XpeAg01`.
- Stripe reports **active=false**.
- Line item: The Solo Service Provider's AI Marketing Kit, **AUD 79.00**.
- Success redirect configured to `https://thesoloserviceprovider.com.au/thank-you.html?session_id={CHECKOUT_SESSION_ID}`.
- The thank-you page explicitly says it **does not verify payment** and automatic paid-kit delivery is **not configured**.
- Another active link exists for a different product, "Digital Business Starter Kit", AUD 79.00. **Do not substitute this link for the Marketing Kit.**
- Other active links sell AI Download Centre featured listings in **USD 99.00**; keep those products and revenue streams distinct.

## Release gates before accepting new orders
- [ ] Confirm intended maintenance end and final approved storefront design.
- [ ] Confirm correct Marketing Kit download exists and matches the product listing.
- [ ] Implement payment-confirmed fulfilment using Stripe webhook signature validation and durable order state.
- [ ] Test successful payment, failed payment, duplicate webhook, download access and customer email.
- [ ] Obtain owner approval before reactivating the A$79 payment link.
- [ ] Verify live checkout and customer delivery after launch.
- [ ] Review the other nine products separately; do not activate unfinished items.

## SOLO AI
- Gemini provider-only Vercel diagnostic previously returned a real model response.
- SOLO API is private; customer authentication, rate limits and complete end-to-end chat are not verified.
- Keep public inference disabled.

## Current decision
**Do not claim the website or marketplace is launch-ready.** Preserve the maintenance deployment and existing checkout configuration until the release gates are met.
