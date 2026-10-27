# SOLO private API verification — 27 October 2026

This historical record covers the owner-token API verification cycle. Later
[customer authentication/quota evidence](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md),
[customer Gemini evidence](SOLO-CUSTOMER-GEMINI-VERIFICATION-2026-10-27.md) and
[browser-isolation evidence](SOLO-BROWSER-ISOLATION-2026-10-27.md) extend it.
[Issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31) is
authoritative for the current release checklist.

## Outcome

The deployed SOLO endpoint returned two real Gemini responses over HTTP, using
the existing server-side Preview credentials. The second response recalled a
random verification code from the first turn. This verifies a private API
conversation, not customer authentication, a public web-chat launch or Android.

## Exact evidence

| Item | Reference |
| --- | --- |
| Verified application commit | [`aeed62f67c2f935208ac5ff0586ca80783cd7c7f`](https://github.com/joshuawayzwright/ai-download-center/commit/aeed62f67c2f935208ac5ff0586ca80783cd7c7f) |
| Change review | [PR #33](https://github.com/joshuawayzwright/ai-download-center/pull/33) |
| API deployment tested over HTTP | `dpl_A7GqdFxuABQkdVkmMNfnekAgzwdB` |
| Tested preview | https://solo-provider-industrial-3nu69cfi1-wrightwayz.vercel.app/solo-ai.html#conversation |
| Server-side diagnostic deployment | `dpl_XSWk7D4QyYhUtueDwPqbi3ZoNSfQ` — READY |
| Diagnostic logs | [Vercel deployment](https://vercel.com/wrightwayz/solo-provider-industrial./XSWk7D4QyYhUtueDwPqbi3ZoNSfQ) |
| Success marker | `SOLO_DEPLOYED_CHAT_E2E_PASS` |
| Automated CI | [Run 40444756972](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40444756972), 47 tests passed, 0 failed |
| CI test job | [121993262597](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40444756972/job/121993262597) |

Vercel preview URLs require authorized deployment access. Temporary share
parameters and credentials are intentionally absent from this public document.

## Actual deployed checks

| Check | HTTP result | Duration |
| --- | --- | --- |
| GET rejected | 405 | 71 ms |
| Missing private token rejected | 401 | 76 ms |
| Wrong private token rejected | 401 | 60 ms |
| Cross-origin request rejected | 403 | 130 ms |
| Oversized request rejected | 413 | 82 ms |
| First authenticated Gemini response | 200 | 749 ms |
| Second response correctly recalls first-turn code | 200 | 713 ms |

These are individual test timings, not a latency benchmark or service-level
promise. The smoke script also checks `provider=gemini`, the expected
`gemini-3.5-flash-lite` model and nonempty visible reply text. No provider key,
owner token, deployment-access cookie, prompt or response body was logged.

## Code corrections covered by regression tests

- The 16,000-byte request limit now covers parsed objects, strings, Buffers and
  streams, rather than trusting only Content-Length. Split UTF-8 characters are
  decoded once after bounded buffering.
- JSON MIME must match correctly. Conversation history starts and ends with a
  user and alternates roles. Only visible Gemini text parts become the reply.
- Browser history retains complete exchanges, trims against actual UTF-8 JSON
  bytes and preserves failed input for retry. HTTP 401 accurately reports private
  testing. Rendering remains plain text and sends no private credential.
- The opt-in smoke script rejects other projects, production and cross-origin
  redirects before forwarding the owner token. Ordinary CI uses mocks only.

Test breakdown: **31 API + 12 browser-controller + 4 smoke-runner = 47**. Tests of
the browser controller use a minimal DOM/VM; they do not replace real mobile or
desktop layout/accessibility verification. Provider error paths are covered with
mocked failures; the live test did not deliberately induce a paid-provider outage.

## Deployment configuration and cleanup

An initial deployment using the project's defaults served the repository root,
so `/api/solo-chat` was 404. A diagnostic from that root could not locate
`scripts/solo-private-smoke.cjs`. Neither was counted as a working API.

The successful preview explicitly used `powerhouse-website` as its root and `.`
as its static output. Project defaults were then corrected to that same root and
output with no build-command override. The existing project is not linked for
automatic Git deployments; explicit source deployments are still required.

The temporary sensitive `SOLO_SMOKE_TARGET_URL` value was cleared after the
successful test. It is Preview-only and unused by the API or browser. No real
provider/test credentials were rotated or duplicated. Deployment protection
remains enabled; production `SOLO_PRIVATE_TEST_ENABLED` remains `false`.

## Production and next gate at the close of this cycle

Production remained the maintenance deployment
`dpl_9KijhLqwcEABqisC59RiLYJgyeV8`. No production promotion, checkout change,
artwork replacement or WrightWayz database change was performed.

At that point, the next gate was commercial customer identity plus durable atomic
request admission and usage accounting. The only then-visible Supabase project
was the inactive `Wrightwayz Project`; it must stay separate. The connected
personal organization had a Free plan and a read-only quote of 0/month for a new
project, but no separate commercial organization/project had been provisioned in
that cycle. No paid plan was authorized or purchased.

The later customer evidence above resolved that inventory limitation using the
existing commercial project and verified authentication, quotas and customer
Gemini success. This historical next-gate description is not an instruction to
repeat setup or reopen those completed milestones.

Track all remaining work in the current section of [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
