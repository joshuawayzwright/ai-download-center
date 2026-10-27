# Cross-project audit and controlled cleanup — 27 October 2026

## Current information and profile audit — later on 27 October 2026

This section supersedes the older live-store and private-chat observations in the historical snapshot below. The release authority remains the current section of [master issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

| Area | Current verified information |
| --- | --- |
| Public maintainer contact | Joshua Wright, **superadmin2712@gmail.com**, **0452 272 820** / +61 452 272 820; Gold Coast, Queensland, Australia. Contact destinations have been inspected; no email or call was sent. |
| GitHub profile | [Original SOLO and WrightWayz banners, current contacts and portfolio status](https://github.com/joshuawayzwright/joshuawayzwright/commit/44341a4cbc7f05753ddd2bb3c310cf23e9d0708a) published; browser rendering and both source image dimensions verified. |
| AI Download Centre | Public directory responds successfully. Current contact source/configuration is updated in this information refresh. Featured listings remain separate from the withdrawn Marketing Kit; payment configuration is unchanged. |
| ProjectForge AI | Existing Pages deployment is live with eight browser tools. README and knowledge-base updates correct older setup-blocked wording and the six-tool count. |
| Commercial production | The Solo Service Provider displays maintenance, with new orders paused. The original A$79 Marketing Kit is withdrawn. Source/contact edits do not end maintenance or promote the development website. |
| SOLO private conversation | Prior owner-authenticated two-turn Gemini API test is verified; see [the evidence](SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md). |
| SOLO customer access | Session/quota work and hosted commercial database setup are in [draft PR #34](https://github.com/joshuawayzwright/ai-download-center/pull/34), still unmerged. 148 automated checks are recorded; live customer login, hosted quota races and customer Gemini chat remain unverified. |
| Vercel failed attempts | The separate business-command project still fails on missing `apps/solo-suite`. The latest inspected industrial-project redeploy also failed on missing `powerhouse-website` in that redeploy's source. Neither failure removes the earlier READY private preview or the maintenance production deployment. No Vercel project setting was changed in this audit. |

### GitHub refresh checklist

- [x] Inspect all seven accessible repositories and current Vercel/project evidence.
- [x] Publish exact original artwork and current public contact information in the profile.
- [x] Verify the profile's rendered content, email destination and fully loaded banner dimensions.
- [x] Mark the old 25-repository migration and 15-app expansion as plans, not completed releases.
- [x] Prepare current directory/commercial contact corrections without changing checkout configuration.
- [x] Verify contact source refresh [dcffec3](https://github.com/joshuawayzwright/ai-download-center/commit/dcffec321735ca56da1e8d0991dcec8205de82ae): [Repository quality](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40515180059), [catalog validation](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40515179967) and [Pages deployment](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40515180057) succeeded. Actual HTTPS requests to directory home, config, privacy and terms returned 200 with the current email and no old support email; terms includes the current phone.
- [x] Verify the corrected Android build workflow [40515179982](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40515179982) succeeds for the contact-text change; this is not Play publication.
- [ ] Resolve or retire the duplicate legacy Android workflow, which still fails in [run 40515180137](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40515180137); a passing corrected workflow does not make every check green.
- [ ] Finish account sidebar bio, public-email selection and pins through an authenticated GitHub browser session; the repository connector does not expose these settings.
- [ ] Correct older WrightWayz website contact/registration wording under its existing website change controls; this profile refresh does not alter charity production.
- [ ] Resolve the existing WrightWayz CI canonical-domain mismatch before calling its quality gates green.
- [ ] Complete the remaining customer, commerce, mobile and Android release gates in issue #31.

ProjectForge's documentation update [b7839e4](https://github.com/joshuawayzwright/projectforge-ai/commit/b7839e47616368fcaca4f0c5854811e4aa713714) passed its [Pages verification/deployment workflow](https://github.com/joshuawayzwright/projectforge-ai/actions/runs/40515134283). Its public homepage still responds with the expected title. Commercial contact source changes remain pending a separately approved production cutover; the live commercial maintenance page still displays its earlier contact address.

No deletion, archiving, repository-visibility change, payment activation or production cutover was performed. The original brand assets remain byte-for-byte intact.

## Historical snapshot from the earlier 27 October audit

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
- [x] Identify `solo-ai-business-command` build failure: configured `apps/solo-suite` directory is absent.
- [ ] Decide correct source directory or retire duplicate project only after mapping its domains and purpose.
- [ ] Run actual SOLO API POST and CI tests; authenticate users and enforce durable quotas.
- [ ] Verify Stripe payment-to-file delivery with an authorised test transaction.
- [ ] Verify all commercial product assets are complete and readable.
- [ ] Audit links, metadata, accessibility, spelling and policy claims on each app.
- [ ] Review suspected duplicates and obtain deletion/archival approval.
- [ ] Owner visual sign-off and controlled production deployment.

**Do not mark any untested step complete.**
