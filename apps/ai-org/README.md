# AI Org: control plane for an autonomous agent organization

This is the deterministic layer (L4) that an AI agent organization runs on. It decides what each agent may do, records every decision, keeps memory honest and allocates money. It contains no LLM calls: agents (Claude Code subagents, Agent SDK workers or anything else) call into it before acting, and it cannot be bypassed by an agent's own reasoning.

The full design is in [docs/AI-ORG-DESIGN.md](../../docs/AI-ORG-DESIGN.md). The Board Console app is in `web/`.

## Status

| Part | Status |
| --- | --- |
| Org config: constitution, policy, 18 agent manifests, lifecycle workflow | Done, validated by `npm run validate` |
| Policy engine, kill switches, ledger, memory, message bus, conflict ladder, scorecards, promotion gate, finance, stage gates | Done, 41 unit tests |
| Board Console web app (`web/`): approvals, org chart, policy check, decision log, finance, kill switches | Done, published as a private app; 4 build tests |
| Tool gateway (`src/gateway.js`): Gmail, Stripe, HubSpot and Linear actions behind the policy engine, run from the Board Console | Done; 11 gateway tests plus a mocked end-to-end browser run. Live connector results not yet observed |
| Scheduled agent run (`src/planner.js`, `org/playbooks/scheduled-run.md`) | Done; 5 planner tests. A scheduled Claude session files requests; the Board still presses Run |
| Board envelope (spend caps, burn cap, cash floor) | Confirmed by the owner on 2026-11-23 at US$300/month burn cap, US$500 cash floor, T3 above US$100, T4 above US$500 |

## Commands

```bash
cd apps/ai-org
npm test            # 61 tests, Node 22+, no dependencies
npm run validate    # structural checks on the org config
npm run chart       # print the reporting hierarchy
npm run simulate    # demo: policy decisions, unit economics, allocation, cash scenarios, a stage gate
npm run build:web   # build the Board Console into web/build
node src/cli.js propose intent.json   # check an agent's action and print the request to file
```

## Tool gateway

`src/gateway.js` is the only path from an agent's intent to a real tool call. Nothing in it holds credentials: calls run through the Board's own claude.ai connectors from the Board Console.

| Action | Connector and tool | Policy type | Notes |
| --- | --- | --- | --- |
| `email.draft` | Gmail `create_draft` | `save_email_draft` (T1) | Draft only; nothing is sent |
| `email.send` | Gmail `send_message` | `external_comm` (T2) | Needs `compliance.status: "approved"` |
| `stripe.coupon` | Stripe `stripe_api_write` → `PostCoupons` | `discount` (T2, T3 above 15%) | Needs a Stripe account chosen under Connections |
| `stripe.refund` | Stripe `stripe_api_write` → `PostRefunds` | `refund` (T2; spend limits apply) | `amount` in cents, or `full_amount_usd` for a full refund |
| `crm.update` | HubSpot `manage_crm_objects` | `update_crm` (T1) | One record, up to 20 properties |
| `task.create` | Linear `save_issue` | `create_task` (T1) | Needs a Linear team set under Connections |

How an action moves:

1. **File.** `buildRequest()` validates the parameters, maps them to a policy action and evaluates it. Refused actions throw and never reach the Board. Allowed actions are filed as `ready`, and everything else as `pending`.
2. **Approve.** The Board approves in the console. The approval is pinned to the exact action (`approvedExecution`), so any later edit needs a fresh approval. A Board approval covers the co-signers below it, but never overrides a denial such as a kill switch, missing compliance approval, separation of duties or a forbidden action.
3. **Run.** `executionPlan()` re-checks everything at the moment of running: approval, pinned parameters, kill switches, connector setup and run state. The console takes a short lease so only one viewer runs it, calls the connector once, and writes the result to the request and the decision log.
4. **Uncertain results.** If the connector fails in a way that may still have gone through, the request is marked `unknown` and won't run again until the Board checks the connector and records what happened. If Stripe asks for its own confirmation, the request waits in `needs_confirmation` until the Board finishes it with Stripe's approval token.

To file an action, write an intent file and check it:

```json
{
  "id": "task-check-links-2026-11-18",
  "agent": "eng",
  "kind": "task.create",
  "params": { "title": "Check catalog links", "priority": 3 },
  "evidence": [{ "kind": "link-report", "ref": "link-check workflow run" }]
}
```

`node src/cli.js propose intent.json` prints `{id, request}`. Store `request` in the app's database at `requests/<id>`; Claude can do this with the artifact data tool.

## Scheduled agent run

A scheduled Claude session follows [`org/playbooks/scheduled-run.md`](org/playbooks/scheduled-run.md). It reads the business's state from Stripe, GitHub and Linear (all read-only), decides what each agent would do, and files those actions in the Board Console. It never runs anything: the Board presses Run.

`src/planner.js` enforces the run's limits:

- Only `task.create`, `email.draft` and `crm.update` can be filed. Refunds, coupons and sent emails always need a person to start them.
- Nothing is filed while an L2 or L4 kill switch is active, and nothing is filed for a paused agent.
- An intent is skipped if its id, or its exact action, matches a request that's already open.
- At most 5 requests per run.
- Every intent still passes gateway validation and the policy engine.

```bash
node src/cli.js plan intents.json --existing existing.json --controls controls.json
# → {"halted": null, "writes": [...], "skipped": [...]}; send "writes" as one database batch
```

## Board Console app

`web/` is the human Board's app. It imports the same `src/` modules the CLI uses (the build copies the browser-safe ones into `web/build/lib/` and bundles the org config into `web/build/org.json`), so a policy answer in the app is the policy answer the agents get.

| View | What it does |
| --- | --- |
| Overview | Pending approvals, kill-switch state, spending cap split, recent decisions |
| Approvals | Requests that need the Board. Approve one option or deny, with a reason. Overdue requests stay unapproved |
| Organization | Reporting tree; each agent's mission, KPIs, guardrails, limits and tools |
| Policy check | Try any agent and action against the live policy engine and kill switches |
| Decision log | Hash-chained record of every Board decision, outcome marking and per-agent calibration |
| Finance | Unit economics, growth-pool allocation, 12-month cash scenarios |
| Kill switches | Trigger and release L2–L4, pause or resume single agents, with history |

When published as a claude.ai artifact it stores data in the artifact database. Only Editors and the owner write; Viewers read nothing.

| Path | Contents |
| --- | --- |
| `requests/<id>` | Decision requests (the `bus.js` decision_request shape, plus `status`, optional `action` for a live policy check) |
| `ledger/d<seq>` | Board decisions, chained by `prev`/`hash` |
| `controls/state` | Kill-switch levels, paused agents, history |
| `settings/connectors` | Chosen Stripe account and mode, Linear team |

Opened anywhere else (for example a local static server on `web/build`), it runs in preview mode and keeps changes in memory only.

```bash
npm run build:web
cd web/build && python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

```
org/
  constitution.json      North Star, Board envelope, never-rules, allocation policy (Board-owned)
  policy.json            Autonomy tiers T0–T4, action types, escalation thresholds, kill switches
  agents/*.json          One manifest per agent: mission, KPIs, tools, permissions, memory scopes, budget
  workflows/lifecycle.json  Idea → research → validation → build → launch → sell → succeed → scale → optimize
src/
  registry.js     load + validate org, org chart, chain of command
  policy.js       evaluate(action) → allow | deny | needs_approval; kill switches; auto-triggers
  ledger.js       hash-chained decision ledger, outcomes, Brier calibration, dissent credit
  memory.js       provenance-gated facts, hypotheses, contradictions, decay, scoped access
  bus.js          message schema, decision requests, deadlines (silence is never approval)
  conflict.js     veto → evidence → empirical test → common manager → prefer reversible
  performance.js  scorecards with guardrail caps, PIP/replace lifecycle
  improvement.js  promotion gate for new agent versions, shadow → canary → production, rollback
  finance.js      unit economics, budget split, Thompson-sampling allocation, Monte Carlo runway
  lifecycle.js    stage-gate evaluation, kill criteria
```

## How an agent uses it

```js
import { loadOrg, Controls, evaluate } from './src/index.js';

const org = loadOrg();
const controls = new Controls(org);
const verdict = evaluate(org, controls, {
  agent: 'marketing',
  type: 'publish_content',
  compliance: { status: 'approved' },
});
// verdict.decision: 'allow' | 'deny' | 'needs_approval'; verdict.missing lists required approvers
```

## Mapping to existing Claude agents

The marketing subagents in `.claude/agents/` are L3 workers under the `marketing` and `sales` leads (see `workers` in their manifests). `compliance-reviewer` implements the `compliance` agent's review step: no `publish_content` or `external_comm` action is allowed until compliance status is `approved`.

## Changing the org

Edit the JSON, then run `npm run validate && npm test`. The validator rejects:

- reporting cycles
- any agent holding T4
- KPI weights that don't sum to 1
- executives with no guardrail KPI
- department spend caps above the Board burn cap
- unknown co-signers
- stage gates evaluated by their own owner
