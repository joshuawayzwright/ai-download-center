# AI Org: control plane for an autonomous agent organization

This is the deterministic layer (L4) that an AI agent organization runs on. It decides what each agent may do, records every decision, keeps memory honest and allocates money. It contains no LLM calls: agents (Claude Code subagents, Agent SDK workers or anything else) call into it before acting, and it cannot be bypassed by an agent's own reasoning.

The full design is in [docs/AI-ORG-DESIGN.md](../../docs/AI-ORG-DESIGN.md). The Board Console app is in `web/`.

## Status

| Part | Status |
| --- | --- |
| Org config: constitution, policy, 18 agent manifests, lifecycle workflow | Done, validated by `npm run validate` |
| Policy engine, kill switches, ledger, memory, message bus, conflict ladder, scorecards, promotion gate, finance, stage gates | Done, 41 unit tests |
| Board Console web app (`web/`): approvals, org chart, policy check, decision log, finance, kill switches | Done, published as a private app; 4 build tests |
| Wiring to real LLM agents and business tools (Stripe, CRM, email, GitHub) | **Not built.** This is the next phase |
| Board envelope (spend caps, burn cap, cash floor) | **Defaults, not confirmed by the owner.** Until `constitution.board.owner_confirmed` is `true`, every T2+ action requires Board approval |

## Commands

```bash
cd apps/ai-org
npm test            # 45 tests, Node 22+, no dependencies
npm run validate    # structural checks on the org config
npm run chart       # print the reporting hierarchy
npm run simulate    # demo: policy decisions, unit economics, allocation, cash scenarios, a stage gate
npm run build:web   # build the Board Console into web/build
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
