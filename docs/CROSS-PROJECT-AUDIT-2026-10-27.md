# Cross-project audit and controlled cleanup — 27 October 2026

## Operating rule
**No deletion, archiving, domain changes, Stripe changes or production cutover without explicit owner approval and a rollback plan.** Keep WrightWayz charity operations and The Solo Service Provider commercial operations financially and technically distinct. Share design tokens and visual quality standards, **not** legal identities, credentials, customer data, donation flows or accounting.

## Confirmed inventory
GitHub repositories (7): `joshuawayzwright`, `wrightwayz-website` (private), `desktop-tutorial` (private, reported size 0), `sentry-mcp`, `ai-download-center`, `projectforge-ai`, `sudo-hq` (private).

Vercel team projects (6):
| Project | Latest deployment | Disposition |
| --- | --- | --- |
| `wrightwayz-website` | READY, production | Preserve; charity flagship |
| `solo-provider-industrial.` | READY, preview | Commercial website; live domain still on earlier production |
| `sudo-hq` | READY, production | Preserve, inspect separately |
| `solo-ai-business-command` | **ERROR**, production | Build log confirms missing Root Directory `apps/solo-suite`; fix project linkage/root only after identifying intended source |
| `solo-provider-fixed-review` | READY, production | Possible legacy/duplicate; do not delete without domain/traffic check |
| `solo-service-provider-preview` | READY, production | Possible legacy/duplicate; do not delete without domain/traffic check |

## Live website findings
- `https://www.wrightwayz.com/`: HTTP 200, branded title and production artwork referenced in source. **Not** a complete accessibility, legal or functional audit.
- `https://thesoloserviceprovider.com.au/`: HTTP 200, commercial site reachable. Production SOLO chat script and API missing (404), despite both being present in a READY development preview.
- Commercial store displays 10 listings, nine labelled coming soon. Existing A$79 Stripe URL is present, but payment success and secure delivery are not verified.
- Brand mismatch: WrightWayz uses charcoal `#0a0a0a`, steel `#c6c9cc`, burnished gold `#c99734`, electric blue `#139ee8`. Commercial site had a blue-dominant base and temporary imagery.
- The approved commercial SOLO emblem and SOLO AI guardian remain **separate** from the WrightWayz charity emblem.

## Changes made in this audit
- Aligned commercial website CSS surfaces to WrightWayz's industrial colour palette, keeping distinct commercial and charity symbols. **Preview only; not promoted to production.**

## Cleanup candidates — no deletions yet
1. `solo-provider-fixed-review` and `solo-service-provider-preview`: check domain aliases, deployments, usage and references before archiving.
2. `desktop-tutorial`: appears empty; confirm owner intent before archiving.
3. `ai-download-center`: historical website ZIPs, extracted asset variants, temporary smoke-test scripts, and obsolete SVGs may be redundant. Establish hashes and references before removal; preserve approved brand assets and rollback files.
4. `solo-ai-business-command`: build failure is caused by nonexistent `apps/solo-suite` root; do not guess a replacement root or deploy over an unknown app.

## Priority release gates
- [x] Inventory connected GitHub repositories and Vercel projects.
- [x] Verify both primary public websites respond.
- [x] Stage WrightWayz-inspired commercial palette without changing identity.
- [ ] Preview CSS regression: mobile 390px and desktop 1440px, contrast, focus, text clipping, logo fidelity.
- [x] Identify `solo-ai-business-command` build failure: configured `apps/solo-suite` directory is absent.\n- [ ] Decide correct source directory or retire duplicate project only after mapping its domains and purpose.
- [ ] Run actual SOLO API POST and CI tests; authenticate users and enforce durable quotas.
- [ ] Verify Stripe payment-to-file delivery with an authorised test transaction.
- [ ] Verify all commercial product assets are complete and readable.
- [ ] Audit links, metadata, accessibility, spelling and policy claims on each app.
- [ ] Review suspected duplicates and obtain deletion/archival approval.
- [ ] Owner visual sign-off and controlled production deployment.

**Do not mark any untested step complete.**
