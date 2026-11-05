# SOLO customer Gemini verification — 27 October 2026

## Verified result

**A real customer-authenticated, two-turn Gemini conversation passed through
the existing `/api/solo-chat`, including context recall, quota consumption and
successful durable finalization.** The captured run made exactly two chat POSTs
without automatic retry. Two earlier calls also completed in the ledger, but
their client output was lost. **Four actual Gemini requests were made in total**;
all four records remain counted.

The source of this report is the
[sanitized verification JSON](evidence/solo-customer-gemini-verification-2026-10-27.json).
The earlier [Auth/quota verification](SOLO-CUSTOMER-LIVE-VERIFICATION-2026-10-27.md)
remains a separate completed cycle with zero model calls and 11 retained
admission-only reservations.

Customer website sign-in/chat, Samsung and full desktop acceptance, real
provider-error/timeout and finalization-failure accounting, monetary controls,
Android, subscriptions and public release remain unfinished.

## Source and controlled target

- Source: [`f4ba7c22e6976c127aefb55a1c0479686cad16f0`](https://github.com/joshuawayzwright/ai-download-center/commit/f4ba7c22e6976c127aefb55a1c0479686cad16f0), branch `feat/solo-customer-access`.
- Runtime implementation: `0af8d9c263a1653128786061f3ffacea99b36894`; no backend code change was needed.
- Test target: `dpl_3e5bP4PSzSbj5ia35oPUUt62qT2P`, **READY**, normal deployment without a build override: [test Preview](https://solo-provider-industrial-oioe10pa4-wrightwayz.vercel.app/solo-ai.html#conversation).
- Existing commercial Supabase project: `tymayhazawkofmiypeqt`.
- Controlled customer UUID: `8b6a0501-0441-4476-813b-357657344c61`.
- Authentication used login cookies only, with no private owner-test token or `Authorization` header. Credentials and conversation text are absent from the evidence file.

The captured window opened at **09:32:02 UTC** with two available daily
admissions, a user day limit of 11, global day limit of 15 and user/global
minute limits of two. Existing ledger rows were retained when preparing these
boundaries.

## Captured conversation and database outcome

Login returned **HTTP 200**. Both chat replies identified provider `gemini` and
model `gemini-3.5-flash-lite`; both matched the expected random code and contained
21 reply characters. The second user question omitted that code. Its submitted
history contained the actual first user/assistant exchange, verifying recall
from client-supplied conversation history. This does not establish server-stored
conversation memory.

| Turn | Request UUID | HTTP | Duration | Remaining daily allowance | SQL input / output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | `2351e9d3-151d-48c2-a760-c8940cc93005` | 200 | 2,617 ms | 1 | 135 / 14 |
| 2 | `a840cc02-673e-4ee5-8baa-3a3f4f7bfb49` | 200 | 2,603 ms | 0 | 168 / 14 |

Allowance moved **2 → 1 → 0**, and a subsequent account status GET returned
**200** with the persisted result. Logout returned **200**. The captured process
exited zero and emitted `SOLO_CUSTOMER_GEMINI_TWO_TURN_PASS`.

Independent SQL inspection confirmed both request rows belong to the expected
customer and have status **`succeeded`**, provider/model recorded, non-null
completion timestamps and the token counts above. The first completed at
**09:32:23.178740 UTC**, the second at **09:32:25.777824 UTC**. These database
results establish durable successful finalization in addition to the HTTP
replies. Observed tokens do not establish billing charges or a monetary budget.

## Earlier attempt — ledger evidence only

The initial bounded window produced these durable successes:

| Request UUID | SQL outcome | Input / output tokens | Completed UTC |
| --- | --- | ---: | --- |
| `dacb4ced-977a-401a-b852-aba9d4ae8824` | `succeeded`, Gemini | 139 / 18 | 09:28:24.513875 |
| `5beee5d8-df2a-4bf6-8595-19334c6c090f` | `succeeded`, Gemini | 176 / 18 | 09:28:26.775231 |

Both recorded model `gemini-3.5-flash-lite`. An orchestration output-capture error
lost client stdout, so **no client HTTP or context assertion is claimed for this
attempt**. Its cleanup completed at 09:28:29 UTC with policy disabled, restored
caps, zero sessions and 13 total rows: 11 prior reservations plus two successes.
A separate bounded window then supplied the captured two-turn evidence above.
Neither attempt's records were erased or refunded.

## Final cleanup and deployed state

The second window closed at **09:32:37 UTC**. SQL inspection at
**09:33:16 UTC** verified:

- Policy disabled; original caps restored to **3/user/minute, 20/user/day,
  20/global/minute and 200/global/day**.
- Zero sessions, zero eligible members and two blocked/expired memberships.
- **15 retained ledger rows:** all 11 previous admission-only reservations and
  four succeeded Gemini requests. The captured conversation used one session.

Final normal Preview `dpl_Fciqz77hEPSAg1FQ59UTcX13n9yM` is **READY** at
`f4ba7c22e6976c127aefb55a1c0479686cad16f0`, without a build override:
[current protected SOLO Preview](https://solo-provider-industrial-qoyn70gb8-wrightwayz.vercel.app/solo-ai.html#conversation).
Both customer flags are false. Actual HTTP checks passed:

| Check | Result |
| --- | --- |
| Account GET | 200; `enabled:false`, `authenticated:false`, `chatEnabled:false`; `no-store, private` |
| Account refresh POST | 503 `auth_disabled` |
| Customer chat POST | 503 `customer_disabled` |

The checks exited zero and logged `SOLO_CUSTOMER_CONFIG_DISABLED_PASS`.
Production still serves maintenance from `dpl_9KijhLqwcEABqisC59RiLYJgyeV8`.
No production release occurred.

## Automated tests and remaining gates

The existing [CI run 40478171099](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40478171099)
at runtime commit `0af8d9c` remains the **158-test baseline**: 137
API/browser/smoke plus 21 SQL tests. Runtime code did not change and those tests
were not rerun in this cycle. No new test count is claimed; actual hosted
conversation evidence is recorded separately above.

- [x] Two captured customer-authenticated Gemini turns, exact context recall and quota decrement.
- [x] Independent SQL confirmation of both successful durable completions and token observations.
- [x] Account for all four actual requests, including the initial attempt's limited evidence.
- [x] Close the verification windows and verify the final disabled Preview and unchanged production.
- [ ] Real provider-error/timeout and finalization-failure accounting.
- [ ] Customer login and complete conversation through the actual branded website UI.
- [ ] Samsung/mobile and full desktop, keyboard, focus and accessibility acceptance.
- [ ] Monetary ceilings/monitoring, retention/deletion and public abuse controls.
- [ ] Approved production release, Android integration and subscriptions.

The available cloud-browser secure sign-in flow cannot automatically consume
the controlled test credentials. This leaves actual customer UI verification
open; no additional account setup is needed to establish the API result.
