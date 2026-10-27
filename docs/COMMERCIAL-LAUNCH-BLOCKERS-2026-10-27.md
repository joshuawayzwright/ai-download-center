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
- The private owner-token SOLO API has a verified real two-turn Gemini conversation; see [the verification record](SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md).
- Customer sessions and durable quota SQL are implemented. The existing commercial Supabase project `tymayhazawkofmiypeqt` is accessible in The Solo Service Provider organisation `txfdoppxcbylrguxsjod`, Free plan, existing region `ap-northeast-1`. Reuse it; no new organisation or replacement project is needed.
- Migration `20261027071534` (`solo_customer_admission`) is applied. Live checks verified FORCE RLS on three tables, restricted invoker functions, denied client privileges and required runtime grants. Rolled-back service-role checks exercised disabled/error outcomes; anonymous HTTPS RPC/private-schema calls were rejected. Policy remains false, with zero members and ledger rows.
- Five sensitive Vercel Preview variables are configured: commercial URL, publishable key, independent usage hash secret and both customer flags **false**. **`SOLO_SUPABASE_SECRET_KEY` is still absent.** The connector does not expose server-key retrieval.
- Actual Supabase Auth settings report **`disable_signup=false`**. Unrestricted signup must be disabled before the pilot; the current connector does not expose Auth configuration updates. The absence of signup in our application does not disable the provider endpoint.
- Real customer login, refresh/logout/revocation, independent hosted quota races and customer-authenticated Gemini chat remain **unverified**. Current CI run `40468034635` passed 148 tests, including nine mocked hosted-runner tests. Protected Preview `dpl_3iKhAVdexUXURiQ5YupThKu5aVco` is READY and three actual HTTP checks confirm its customer gates are disabled; these are not successful customer-session tests. See [customer access status](SOLO-CUSTOMER-ACCESS-2026-10-27.md).
- Keep public inference disabled.

## Current decision
**Do not claim the website or marketplace is launch-ready.** Preserve the maintenance deployment and existing checkout configuration until the release gates are met.
