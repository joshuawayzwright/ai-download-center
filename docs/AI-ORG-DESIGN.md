# Self-Improving AI Organization: Design

**Status:** design plus control-plane skeleton (`apps/ai-org`). Board envelope values are defaults awaiting owner confirmation.
**Applied to:** AI Download Center (featured listings, US$99/month). Operating jurisdiction: Australia.

## 1. Principles

1. **The org is configuration.** Agents, permissions and workflows are JSON manifests executed by a deterministic runtime. Structural change is a reviewed diff.
2. **Reversibility sets autonomy.** Cheap, reversible actions run freely; cost and irreversibility raise the approval tier.
3. **Provenance or it didn't happen.** Facts need a source, timestamp and confidence; unsourced claims are hypotheses.
4. **Separation of duties.** Proposer ≠ approver, author ≠ merger, optimizer ≠ evaluator.
5. **Value, not activity.** Every KPI rolls up to the North Star and is paired with a guardrail.
6. **Self-improvement is an experiment.** Every change is A/B tested on a hidden holdout, with rollback.

Agents are reliable on bounded tasks with clear success criteria and weak on long-horizon judgment. The design therefore moves judgment into gates, evaluations and scorecards rather than trusting any single agent.

## 2. Layers

| Layer | Contents |
| --- | --- |
| L0 Governance | Human Board, constitution, kill switches |
| L1 Executive | CEO, COO, CTO, CMO, CFO, CLO, CHRO |
| L2 Functional | Ops, Support/CS, Product, Engineering, R&D, Marketing, Sales, FP&A, Risk, Compliance, Eval Lab |
| L3 Workers | Ephemeral task agents, e.g. the existing `.claude/agents` marketing writers |
| L4 Platform | Policy engine, ledger, memory, bus, finance, evals (`apps/ai-org`) |

## 3. Hierarchy

```
board (human)
└── ceo  [T3]
    ├── cfo  [T3 dotted:board]
    │   ├── fpa  [T2]
    │   └── risk  [T1 veto:existential/risk dotted:board]
    ├── chro  [T3]
    │   └── eval-lab  [T1]
    ├── clo  [T3 veto:legal/regulatory dotted:board]
    │   └── compliance  [T1 veto:regulated_comms]
    ├── cmo  [T3]
    │   ├── marketing  [T2]
    │   └── sales  [T2 dotted:cfo]
    ├── coo  [T3]
    │   ├── ops  [T2]
    │   └── support  [T2 dotted:product]
    └── cto  [T3]
        ├── eng  [T2]
        ├── product  [T2 dotted:cmo]
        └── rnd  [T2]
```

Each agent's mission, responsibilities, KPIs (with guardrails), tools, permissions, memory scopes and budget live in `apps/ai-org/org/agents/<id>.json`.

## 4. Decision rights

| Tier | Meaning | Approval |
| --- | --- | --- |
| T0 | Read or analyze | None |
| T1 | Internal and reversible | None (logged) |
| T2 | External or bounded spend | Policy checks (compliance, caps) |
| T3 | Material: spend > US$100 or over agent cap, discount > 15%, contracts, pricing, public statements, agent promotions | Owning exec plus independent co-signer (CFO for money, CLO for legal, Eval Lab for agent versions) |
| T4 | Spend > US$500, commitments > 12 months, capital, new jurisdiction, customer-data deletion, constitution | Human Board |

Hard rules enforced in code:

- **Compliance first:** external output needs compliance approval.
- **No self-shipping:** authors can't merge or ship their own work.
- **Untrusted input:** actions triggered by untrusted content are denied until verified.
- **Unconfirmed envelope:** while the Board envelope is unconfirmed, every T2+ action goes to the Board.

**Kill switches:**

| Level | Effect | Who can trigger |
| --- | --- | --- |
| L1 | Pause one agent | Its manager, Risk |
| L2 | Freeze external actions | Any exec, Risk |
| L3 | Freeze spend | CFO, Risk |
| L4 | Full stop | Board, Risk |

Auto-triggers: daily spend above 2× forecast, error rate above 5%, outbound messages above 500 per hour.

## 5. Lifecycle

| Stage | Owner | Independent evaluator | Gate (defaults) |
| --- | --- | --- | --- |
| Idea | R&D | CEO | Strategic fit ≥ 0.6, novelty ≥ 0.5 |
| Research | Product | Eval Lab | SAM ≥ US$100k, evidence grade ≥ 0.7, zero legal blockers (CLO veto) |
| Validation | Product | CFO | Landing conversion ≥ 5%, LTV/CAC ≥ 3 |
| Build | Eng | CTO | All acceptance tests pass, zero critical vulnerabilities |
| Launch | Marketing | CMO | Compliance approved (veto), tracking verified |
| Sell | Sales | CFO | CAC payback ≤ 3 months, win rate ≥ 15% |
| Succeed | Support | COO | NRR ≥ 100%, CSAT ≥ 85% |
| Scale | COO | CFO | Contribution margin at 2× volume ≥ 50% |
| Optimize | CHRO | Eval Lab | Continuous; feeds Idea |

Every initiative carries pre-registered kill criteria, for example: pause if CAC > US$198 for 2 consecutive periods.

## 6. Memory

| Store | Rule |
| --- | --- |
| Working | Agent-private, task lifetime |
| Episodic | Append-only event log, written by the platform |
| Semantic | Facts need a source. Contradictions are kept as *contested* and queued for reconciliation, never overwritten. Confidence decays with age, and stale facts are refused for decisions. |
| Procedural | Playbooks and prompt versions in Git, changed by PR plus evaluation |
| Decision ledger | Hash-chained; every T2+ decision stores its predicted success probability, and outcomes are scored into Brier calibration per agent |

## 7. Communication

Message types: task, task_result, decision_request, decision, broadcast, escalation.

A decision request must carry:

- options
- a recommendation that is one of those options
- confidence
- evidence
- a deadline

**Silence is never approval:** an overdue request escalates one level up, marked *not approved*.

| Cadence | What |
| --- | --- |
| Daily | Department digests |
| Weekly | Exec sync and Board digest |
| Monthly | Close and scorecards |
| Quarterly | OKRs, scenarios, budget |

## 8. Conflict resolution

1. A veto holder objecting in their domain (CLO legal, Risk existential, Compliance regulated comms) blocks. Only the Board overrides.
2. A position without evidence loses.
3. If the dispute is cheaply testable (≤ US$100), run the test.
4. Otherwise the common manager decides, and dissent is logged. A dissenter proven right earns calibration credit.
5. On deadlock, choose the more reversible option.

## 9. Performance

Monthly scorecard weights:

| Component | Weight |
| --- | --- |
| Outcome KPIs | 40% |
| Quality | 20% |
| Calibration | 15% |
| Efficiency | 15% |
| Compliance | 10% |

A missed guardrail KPI caps the outcome score at 0.5, which stops agents gaming one metric.

Lifecycle: production → PIP after one cycle below 0.6 → replace after two consecutive cycles.

## 10. Finance

- **Budget:** monthly burn cap US$300 (default), split 70% core, 20% growth, 10% R&D. Department caps must fit inside the cap; the validator enforces this.
- **Unit economics:** LTV, LTV/CAC and payback from price, margin, churn and CAC.
- **Growth pool:** allocated by Thompson sampling across channels, with no channel over 30% and at least 10% reserved for exploration.
- **Scenarios:** Monte Carlo cash simulation gives P10/P50/P90 ending cash and the probability of breaching the US$500 cash floor for bear, base and bull growth.

## 11. Risk and compliance

| Risk | Controls |
| --- | --- |
| Financial | Caps, co-sign, anomaly auto-freeze |
| Legal (Australian Consumer Law, Spam Act 2003, Privacy Act 1988) | CLO veto, compliance gate on all external output |
| Security | Secrets never in agent context; untrusted-content rule |
| Model | Provenance, eval regression, separation of duties |
| Operational | Rate limits, circuit breakers |
| Strategic | Kill criteria, channel concentration limits |

Every T2+ action is ledgered, so an audit is a query.

## 12. Self-improvement loops

| Loop | Frequency | Mechanism |
| --- | --- | --- |
| Task reflection | Every task | Note written to episodic memory |
| Playbooks | Weekly | Mine successful sequences, then PR plus evaluation |
| Agent versions | Bi-weekly | Gate: evaluator ≠ author; agent can't author its own version or touch its own KPIs, evals or permissions; holdout n ≥ 100; lift ≥ 0.02; no guardrail regression. Then shadow → canary → production, with automatic rollback on a live KPI dip of more than 5%. |
| Org design | Quarterly | T3 change, piloted in shadow mode |
| Strategy | Quarterly | Ledger outcomes update beliefs; North Star changes are T4 |

## 13. Human touchpoints

- **Once, then quarterly:** confirm the constitution and envelope.
- **As needed:** approve T4 requests.
- **Weekly:** read the Board digest and review a 2% audit sample of T2 actions.
- **Legal and identity acts agents cannot perform:** signing, banking, KYC.

## 14. Next phase

1. Owner confirms the Board envelope (`owner_confirmed: true`) or edits the values.
2. Add a tool gateway: wrap Stripe, CRM, email and GitHub calls so each passes through `evaluate()` and writes to the ledger.
3. Run the first revenue loop (Marketing → Compliance → Sales → Support) at T1/T2 with the existing `.claude/agents` as workers.
4. Stand up Eval Lab golden sets before enabling any automatic agent promotion.
