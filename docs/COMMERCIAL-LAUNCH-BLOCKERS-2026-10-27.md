# SOLO — Commercial Launch Blocker Audit (27 October 2026)

The payment and SOLO API observations below preserve the **27 October audit
snapshot**. Replacement-product release gates were reconciled on **28 October
2026** against the existing [ten-product reset](SOLO-10-PRODUCT-RESET.md).
[Issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31) is
authoritative for current deployments, evidence and remaining work.

## Production storefront — recorded state and cutover gate
- https://thesoloserviceprovider.com.au/ currently serves a **maintenance page**: "WE'RE BUILDING WHAT'S NEXT." It explicitly states that the store and AI platform are temporarily unavailable and new orders paused.
- Production homepage returns HTTP 200, but **HTTP 200 does not mean the store is open**.
- Do not override maintenance without owner confirmation of the intended cutover.

## Stripe — verified 27 October snapshot, retained as history

The AI Marketing Kit is **retired from new sales and promotion**. Its payment
references below are historical records, not a reactivation instruction. Do not
reactivate its checkout; preserve earlier customer access, refunds and records.

- Account: `acct_1UHgnLEDtq3SEtM7` (Joshua Wright – Sole Trader).
- Existing AI Marketing Kit link: `plink_1UHjwyEDtq3SEtM7DQ7dfvUW`.
- Link: `https://buy.stripe.com/4gM8wP2qK0mDaww1XpeAg01`.
- Stripe reports **active=false**.
- Line item: The Solo Service Provider's AI Marketing Kit, **AUD 79.00**.
- Success redirect configured to `https://thesoloserviceprovider.com.au/thank-you.html?session_id={CHECKOUT_SESSION_ID}`.
- The thank-you page explicitly says it **does not verify payment** and automatic paid-kit delivery is **not configured**.
- Another active link exists for a different product, "Digital Business Starter Kit", AUD 79.00. **Do not substitute this link for the Marketing Kit.**
- Other active links sell AI Download Centre featured listings in **USD 99.00**; keep those products and revenue streams distinct.

## Current replacement-product release gates — updated 28 October

These gates apply separately to each of the ten replacement products. None is
independently verified as sale-ready. Start with Cashflow Control, then Quote &
Invoice Builder, as the reset specifies. The [first private Cashflow build](SOLO-CASHFLOW-CONTROL-BUILD-2026-10-28.md)
is tangible product work, not approval to sell it.

- [ ] Confirm the approved website scope and maintenance cutover. A website-only release may keep customer AI and all unfinished-product checkouts disabled.
- [ ] Complete the specific product files and guide; independently verify calculations, examples, supported applications, mobile usability and accessibility.
- [ ] Obtain owner acceptance of the deliverable, accurate listing/preview, licence, refund/support wording and final price. Reset prices remain provisional.
- [ ] Audit and configure the correct product's existing Stripe infrastructure; do not reuse the retired Kit, another product's link or the directory's paid-listing checkout.
- [ ] Verify payment-confirmed fulfilment using signed webhooks and durable order state, protected downloads and the stated delivery/email method. Keep paid files and the full package out of the public repository.
- [ ] Verify successful and failed payments, duplicate webhooks, download access and the refund/support path before accepting external orders.
- [ ] Verify the approved live purchase-to-delivery journey after launch; distinguish self-tests from real external orders.
- [ ] Release each remaining product only after its own gates pass; keep unfinished listings explicitly in development.

## SOLO AI — historical verification snapshot
- Gemini provider-only Vercel diagnostic previously returned a real model response.
- The private owner-token SOLO API has a verified real two-turn Gemini conversation; see [the verification record](SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md).
- Customer sessions and durable quota SQL are implemented. The existing commercial Supabase project `tymayhazawkofmiypeqt` is accessible in The Solo Service Provider organisation `txfdoppxcbylrguxsjod`, Free plan, existing region `ap-northeast-1`. Reuse it; no new organisation or replacement project is needed.
- Migration `20261027071534` (`solo_customer_admission`) is applied. Live checks verified FORCE RLS on three tables, restricted invoker functions, denied client privileges and required runtime grants. Rolled-back service-role checks exercised disabled/error outcomes; anonymous HTTPS RPC/private-schema calls were rejected. After the controlled windows, policy is disabled, both test memberships are blocked/expired, sessions are zero, and 15 rows remain: 11 admission-only reservations plus four Gemini successes.
- All six commercial Vercel Preview variables are configured, including the server secret key with verified hosted status-RPC access. Both customer flags are restored **false**. Actual Supabase Auth settings verify **`disable_signup=true`**.
- **Real customer login, refresh/logout/revocation, all five independent hosted admission races and actual customer API quota rejection passed.** That earlier [Auth/quota cycle](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md) made zero model calls. The later [customer Gemini verification](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md) passed two captured HTTP turns, context recall, exact quota decrement and durable success accounting. Four provider calls were made across its two windows; the first two retain ledger-only evidence because client output was lost. Cleanup is verified.
- Real provider-error/timeout and finalization-failure accounting, actual customer website sign-in/chat, Samsung/desktop acceptance and monetary/public-release controls remain unverified.
- Existing CI run `40478171099` at unchanged runtime `0af8d9c` passed **158 tests**, zero failures/skips; quality run `40478171124` passed. These tests were not rerun for the Gemini cycle. Final normal protected Preview `dpl_Fciqz77hEPSAg1FQ59UTcX13n9yM` is READY at `f4ba7c22e6976c127aefb55a1c0479686cad16f0`; actual HTTP checks confirm both restored customer gates are disabled. Production remains maintenance deployment `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`. See [customer access status](SOLO-CUSTOMER-ACCESS-2026-10-27.md).
- Keep public inference disabled.

## Current release decision

**Do not claim the website or marketplace is launch-ready.** Keep maintenance
until the approved website cutover; do not make that website-only decision depend
on enabling AI or accepting payments for unfinished products. Preserve existing
checkout configuration while the applicable replacement-product gates are open.
The retired Marketing Kit remains retired. Work toward a functional public site,
one verified product purchase and delivery, and the separately controlled SOLO
beta; completed API milestones need not be repeated without a regression.
