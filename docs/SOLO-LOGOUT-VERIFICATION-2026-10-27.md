# SOLO logout verification — 27 October 2026

## Outcome and change

The account controller now invalidates local signed-in state immediately when
logout starts. Previously, the browser could retain the account and pending
conversation state while waiting for the logout POST to settle. The six-line
change in `powerhouse-website/solo-account.js` clears that state and advances the
session generation before sending the request, while displaying “Signing out”.
This prevents stale conversation work from being accepted as current during the
pending logout.

Source: [`1a2738816fe764ec5ac1723fef377aca5f505ee0`](https://github.com/joshuawayzwright/ai-download-center/commit/1a2738816fe764ec5ac1723fef377aca5f505ee0).
No API/backend change was needed. Four older verification documents also received
historical scope labels so their completed authentication, quota and Gemini
milestones are not mistaken for unfinished work.
[Issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)
remains the authoritative current release checklist.

## Automated verification

Two new account regressions failed against the baseline and passed with the fix.
Targeted verification passed **29 account + 26 conversation = 55 tests**.
[Final CI 40512204310](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40512204310)
passed **160 JavaScript + 21 SQL = 181 tests**, zero failures or skips; individual
logs were inspected. [Repository quality 40512204274](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40512204274)
and [catalogue checks 40512204359](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40512204359)
also passed. The controller regressions use controlled transports; these results
do not establish actual signed-in website logout.

## Deployment and actual checks

Normal protected Preview **`dpl_Dr62bzK8kLsqyXaoZUQfNbacjUsc`** reached **READY**
at `1a27388`: [SOLO conversation Preview](https://solo-provider-industrial-pf0z4q0gh-wrightwayz.vercel.app/solo-ai.html#conversation).
`solo-ai.html`, `solo-account.js`, `solo-conversation.js` and `styles.css` each
returned HTTP 200 and matched the exact source-commit hashes.

| Actual closed-gate request | Result |
| --- | --- |
| Account GET | 200; enabled/authenticated/chatEnabled all false; private/no-store caching |
| Account refresh POST | 503 `auth_disabled` |
| Chat POST with deliberately invalid Bearer | 503 `customer_disabled` |
| Chat POST with expected account but no cookie | 503 `customer_disabled` |

Actual Chrome at **1363 × 936** confirmed CHECK ACCESS retained the closed state,
login/logout controls were hidden, and the page had no horizontal overflow.
This verifies deployed closed-access behavior, not a real signed-in logout race.
See the [sanitized evidence](evidence/solo-logout-verification-2026-10-27.json)
and [desktop screenshot](evidence/solo-logout-preview-2026-10-27.jpg).

## Preserved state and limits

A read-only SQL check at **13:18:57.905261 UTC** on 27 October 2026
(**23:18:57 Brisbane**) confirmed policy disabled, original caps
**3/user/minute, 20/user/day, 20/global/minute, 200/global/day**, zero eligible
members, zero fixture sessions and **15 retained ledger rows**, including the
same four earlier Gemini successes. This cycle made no hosted database writes,
model calls or environment changes. Production remained on maintenance deployment
**`dpl_9KijhLqwcEABqisC59RiLYJgyeV8`**. Artwork and commercial flows were unchanged.

Local cancellation cannot cancel a provider call already admitted. Peer tabs are
notified after logout settles. If server logout fails, a fresh account check may
truthfully find that the server session is still valid; immediate local clearing
does not claim successful remote revocation.

Actual signed-in website acceptance remains open. Existing fixture credentials
were not retained; supported secure browser credential entry requires the user.
The Supabase connector works, while the dashboard browser is at sign-in. No
verified Gemini spending budget was established, so no new model call was made.
Samsung/device acceptance, hosted failure accounting and other public-release
gates remain separate. Next: complete supported secure sign-in for the existing
controlled website acceptance session, preserving the recorded cost and release
requirements.
