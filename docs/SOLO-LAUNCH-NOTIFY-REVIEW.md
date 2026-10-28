# Launch notification, product plan previews and interest counts — review gate

## What this change does
- Adds branded, accessible, email-only launch signup on homepage and products page.
- Replaces product mailto buttons with product-specific anchors to the form; direct support email remains.
- Adds native expandable “Preview the plan” sections for all ten products, sourced from data/solo-commerce-catalogue.json. These are **illustrative planned workflows, not working-product demos or proof of completed deliverables**. Real sample assets still need to be created/reviewed before claiming hands-on previews.
- Implements a browser-only Klaviyo client subscription request using verified public site ID UQ4LLB and existing list SewPSU.
- Implements optional first-party event logging for product-interest clicks and accepted signup requests; no private credentials, third-party tracking SDK, cookies, browser storage, fingerprinting or user identifier.
- Leaves all ten products Coming Soon; no purchase, public AI/auth, SMTP, prices, GST, charity or domain changes.

## Current gates — intentionally OFF
- launch-config.js: subscriptionsEnabled=false and metricsEnabled=false.
- API: SOLO_INTEREST_EVENTS_ENABLED must be exactly true or returns 503 without recording.
- No Vercel environment variable was created or changed.
- Draft changes do not authorize merge, production deployment or enabling collection. Obtain explicit release approval.
- Existing Klaviyo draft form YhPxkx is not embedded, edited or published. Its old name/source says “Free Marketing Starter Pack” and support text is malformed. Publishing it would not implement this feature.

## Klaviyo evidence and contract (28 October 2026)
- Account UQ4LLB/public_api_key UQ4LLB; default sender joshuawright@thesoloserviceprovider.com.au, name The Solo Service Provider.
- List SewPSU: double_opt_in. This implementation must not change that setting.
- Browser POST https://a.klaviyo.com/client/subscriptions/?company_id=UQ4LLB.
- Headers: Content-Type application/vnd.api+json; revision 2026-10-15. No Authorization header/private API key.
- Explicit email-marketing permission only; no SMS, open-tracking or click-tracking consent.
- 202 = request accepted, not confirmed subscriber, delivered email, successful inbox arrival, account creation or reserved access.
- custom_source includes consent version/page; profile stores only email and the visitor-selected product interest/source/version. Re-submission updates the selected interest; this is not a historical interest ledger.
- No live POST, test subscription or customer email was sent during implementation.
- Do NOT use an existing unsubscribed address for a test without fresh permission.
- Account default sender is NOT proof of confirmation-message From/Reply-To; the list confirmation template and end-to-end delivery still require inspection and an authorized test mailbox.

Primary references:
https://developers.klaviyo.com/en/reference/create_client_subscription
https://raw.githubusercontent.com/klaviyo/openapi/main/openapi/stable/apis/create_client_subscription.json
https://help.klaviyo.com/hc/en-us/articles/115005251108

## Publication acceptance checklist
1. Approve the launch-only email scope and updated privacy text. Confirm list confirmation From/Reply-To, content and unsubscribe experience; no free pack promise.
2. Provide/authorize a test address to request a confirmation email and follow its link. No mass import, no resubscription of unsubscribed profiles.
3. Verify absent/pending vs confirmed consent in Klaviyo, existing subscriber case, invalid email, duplicate submission, service error, timeout, Back/Forward and mobile/keyboard use.
4. Approve enabling the form. Enable subscriptionsEnabled and remove the visible preview-only paragraph in the same reviewed release; never leave a live form claiming not to submit.
5. Separately approve activation of first-party counts and verify existing Vercel log retention/access is sufficient. Set metricsEnabled and SOLO_INTEREST_EVENTS_ENABLED only as authorized; do not add a vendor, credential, database or drain by implication.
6. Test the real browser at 390px and desktop, including native details, selected product, required checkbox, retry and focus. Node VM tests are not browser interaction acceptance.
7. Merge/deploy only this reviewed feature branch; do not merge customer AI PR #34 or open public AI.
8. Verify actual production readback and target commit/deployment, plus form signup/confirmation and counts. Disable collection promptly if verification fails.

## Measurement meaning and limits
Event fields are allowlisted: event (product_interest or signup_request_accepted), product (one of ten or all-products), page (home/products). Unknown fields—including emails—are rejected. No raw request/header/body logging is added. Hosting infrastructure may independently process IP/user-agent/security logs; do not claim that all infrastructure is anonymous.

Honor Do Not Track/Global Privacy Control. Client deduplication lasts only for the current page. Event counts are approximate, may be incomplete or manipulated, and are NOT unique visitors, consent records, conversions or confirmed subscriptions. CORS/origin validation is not bot authentication. No durable analytics store or automatic reporting schedule is created.

Accepted signup request counts are measured separately from **confirmed** subscribers in Klaviyo. Use list consent/source/product fields for confirmed signup reporting; no confirmation event is fabricated in the browser. The optional CLI summarizer accepts exported first-party event JSONL and emits counts without identifiers. Verify log retention and arrange a permitted export before relying on long-term totals.

## Test boundary
All automated subscription tests mock fetch: no real emails or Klaviyo mutations.
Local Chromium was previously blocked at runtime launch; do not reuse screenshots from a different site revision as acceptance for this feature.

## Existing log readout verified; durability is an explicit blocker
Read-only connector verification on 28 October 2026:
- Correct project prj_cPk5dNiHe1ytCVKmra5WRYrQSCDg / team_Aam7UAVXoawuKPDZ7jK7NXrF.
- get_runtime_logs with production, since=24h, query=solo_launch_interest_v1, group_by=requestPath succeeded with no events (expected: OFF).
- Team/project normalized responses did not expose Observability Plus entitlement.
- Current official runtime-log documentation: Pro 1 day; Pro+Observability Plus 30 days. Do not assume Plus is active. Legacy observability schema endpoint returned 404; no settings changed.
- The count tool can group by request path, not arbitrary product JSON fields. Per-product reports require application-message export and filtering.

After activation and a known test event, an already-authenticated Vercel CLI can read a bounded window without new credentials:

    vercel logs runtime --scope wrightwayz --project prj_cPk5dNiHe1ytCVKmra5WRYrQSCDg --environment production --query solo_launch_interest_v1 --since 12h --limit 10000 --json | node scripts/summarize-launch-interest.cjs

No new CLI login/token should be created as part of this draft. The CLI execution itself has not been tested here; the existing connector read permission was tested. The parser accepts documented Vercel log wrappers with application JSON in data.message and rejects additional application fields. Export shape must be verified against one real enabled test event before relying on the report.

The summarizer marks missing pagination metadata and truncated/excluded results, and only outputs non-identifying counts. If the export reports more pages, fetch every documented cursor or use non-overlapping bounded windows; do not label a partial export as a total. Do not save unfiltered infrastructure logs, which may contain technical identifiers.

**Long-term tracking remains incomplete** until an approved durable retention route exists. No paid Observability upgrade, drain, vendor, schedule or database change was authorized/applied. Proposed next decision: approve a restricted daily aggregate table in the existing Supabase project with only day/product/event/page/count (no email, IP, visitor ID or raw event), with access limited to the existing server/admin boundary. Schema, access policy, authenticated reporting and retention would be reviewed before application; never expose a public read/report endpoint. This is a proposal, not an implemented persistent store.

Sources:
https://vercel.com/docs/logs/runtime
https://vercel.com/docs/cli/logs

## Unapplied aggregate SQL proposal
docs/PROPOSED-SOLO-INTEREST-AGGREGATES.sql is review material only, outside automatic migrations. It proposes a private aggregate table with row-level security and no browser roles; a narrowly parameterized increment function is executable only by the existing server service role. No new key is created and no key may be placed in browser code. Existing production server credential availability must be verified securely before adapter implementation. The draft does not add the adapter or pretend logs are durable. Apply/test/retention choices and authenticated admin reporting still need approval and implementation.
