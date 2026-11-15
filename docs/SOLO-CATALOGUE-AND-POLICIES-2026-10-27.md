# SOLO launch collection and customer policies — 27 October 2026

## Outcome and source

The website now presents the initial ten-product collection and ongoing development, with purchasing explicitly closed. Terms, Privacy and Refunds use a consistent branded document layout. These changes are verified in a protected Preview; they have not been promoted to production or received final owner visual approval.

- Implementation: [`c5a25e1827a13f38ba77855a28a9d17a56eb2cad`](https://github.com/joshuawayzwright/ai-download-center/commit/c5a25e1827a13f38ba77855a28a9d17a56eb2cad), nine files.
- Store typography and heading hierarchy: [`76af5a3902a491cc4b15350c0b06c05495804ebb`](https://github.com/joshuawayzwright/ai-download-center/commit/76af5a3902a491cc4b15350c0b06c05495804ebb).
- Final normal Preview: **`dpl_HvF4Hwh5bzrZHcG7bWBEKaE2eGPF`**, READY at `76af5a3`.
- [Protected website Preview](https://solo-provider-industrial-f22obagei-wrightwayz.vercel.app/), [Terms](https://solo-provider-industrial-f22obagei-wrightwayz.vercel.app/terms.html), [launch collection](https://solo-provider-industrial-f22obagei-wrightwayz.vercel.app/digital-products.html).

## Regression corrected

The existing [commercial reset](SOLO-10-PRODUCT-RESET.md) already retired the AI Marketing Kit from new sales and promotion. The website and structured catalogue still emphasized the old Kit and nine earlier concepts. Terms still described a single A$79 product, while the free sampler retained outdated promotional content. Those inconsistencies were corrected against the existing decision; this was not a new product or pricing approval.

The homepage, store, structured catalogue and knowledge data now identify these ten planned products:

| # | Product |
| --- | --- |
| 1 | SOLO Cashflow Control |
| 2 | SOLO Quote & Invoice Builder |
| 3 | SOLO Client Booking & Follow-Up |
| 4 | SOLO Job Application Command Centre |
| 5 | SOLO Content Repurposing Studio |
| 6 | SOLO Customer Support Desk |
| 7 | SOLO Small Business Operations Hub |
| 8 | SOLO Digital Product Launch System |
| 9 | SOLO Business Research Dashboard |
| 10 | SOLO AI Workflow Starter Pack |

All are marked in development, with no active checkout. Proposed prices remain provisional; historical Kit references and earlier concepts are archived as historical data. Existing customer access, records and support were preserved. Ongoing development does not promise a release date, subscription, entitlement to future products or 24-hour service level.

Terms now have one main landmark, eight numbered sections, a contents navigation, readable text widths, related-policy links and contact details. Privacy and Refunds share the policy styling. The own-use/own-business licence and Australian Consumer Law protections remain; no new blanket refund exclusion or waiver was introduced. [ACCC remedy guidance](https://www.accc.gov.au/consumers/problem-with-a-product-or-service-you-bought/repair-replace-refund-cancel) informed the consumer-rights review. Approved artwork and commercial/charity separation remain intact.

## Verified evidence

**Deployment and HTTP:** Seven deployed files returned HTTP 200 and matched the exact source-commit hashes: homepage, store, Terms, Privacy, Refunds, stylesheet and free sampler. Account status returned HTTP 200 with customer access disabled. A deliberately invalid Bearer chat request returned 503 `customer_disabled`; no model call occurred.

**Desktop browser:** At **1363 × 936**, the final Terms skip link moved keyboard focus to `policy-main`; all eight sections and contents links were present, with no horizontal overflow. On the earlier `c5a25e1` Preview, the Consumer Rights contents link positioned its target at **103.89px**, below the header bottom at **77px**. The final store displayed ten equal cards, all labelled **IN DEVELOPMENT**, with a gold Georgia heading measured at **54px**, product titles using `h2`, and no horizontal overflow.

**Sampler:** The updated PDF is **88,489 bytes**, two pages, with five prompts and all ten launch-product names. SHA-256: `c930e6262495941a0cedd4b06804af46670a37293f1574d558da2e09d2d9a44c`.

**Automated checks:** [CI 40508107002](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40508107002) passed the existing **158 JavaScript + 21 SQL tests = 179**, with zero failures or skips; logs were inspected. [Repository quality 40508106970](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40508106970) and [catalogue checks 40508107154](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40508107154) also passed. These checks do not establish sale-ready deliverables or paid fulfilment.

Evidence: [sanitized verification record](evidence/solo-catalogue-and-policies-2026-10-27.json), [Terms screenshot](evidence/solo-terms-preview-2026-10-27.jpg), [collection screenshot](evidence/solo-launch-collection-preview-2026-10-27.jpg).

## Boundaries and remaining work

No API/controller changes, hosted database writes, model calls, environment changes, Stripe changes, billing changes or production promotion occurred. `main` remained at `6865dde`; the production domain remained on maintenance deployment **`dpl_9KijhLqwcEABqisC59RiLYJgyeV8`**.

- [x] Correct catalogue, policy and sampler inconsistencies; preserve approved assets and consumer protections.
- [x] Verify final protected Preview files, desktop interactions and existing automated regression suite.
- [ ] Obtain owner final visual approval and verify an actual Samsung device.
- [ ] Complete and independently test product deliverables; validate preview, licensing, payment, protected delivery and support before opening each checkout.
- [ ] Complete the separate SOLO AI signed-in browser/device and remaining launch gates. This cycle adds no new customer-inference evidence.

Next execution: complete the existing controlled signed-in SOLO website acceptance session. The collection and policy preview is ready for owner visual review; that approval remains a separate condition before production promotion.
