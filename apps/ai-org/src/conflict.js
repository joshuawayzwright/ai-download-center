// Conflict resolution ladder: veto -> empirical test -> common manager -> reversibility default.
import { chainOfCommand } from './registry.js';

export function commonManager(org, a, b) {
  const chainA = [a, ...chainOfCommand(org, a)];
  const chainB = new Set([b, ...chainOfCommand(org, b)]);
  return chainA.find((x) => chainB.has(x)) ?? 'board';
}

/**
 * @param {object} org
 * @param {object} c { domain, parties:[{agent, option, evidence:[], reversibility:0..1, expectedValue?}],
 *                     objections:[{agent, domain}], testable:boolean, testCostUsd?, managerDecision?: option }
 */
export function resolveConflict(org, c) {
  if (!c.parties || c.parties.length !== 2) throw new Error('conflict needs exactly two parties');
  const steps = [];

  // 1. Vetoes: a veto-holder objecting in their domain blocks; only the Board can override.
  for (const o of c.objections ?? []) {
    const holder = org.agents.get(o.agent);
    if (holder?.veto?.includes(o.domain)) {
      steps.push(`veto by ${o.agent} on ${o.domain}`);
      return { outcome: 'blocked_by_veto', decidedBy: o.agent, overridableBy: 'board', steps };
    }
  }

  // 2. Claims must carry evidence.
  for (const p of c.parties) {
    if (!p.evidence?.length) {
      steps.push(`${p.agent} position has no evidence`);
      const other = c.parties.find((x) => x !== p);
      return { outcome: 'decided', option: other.option, decidedBy: 'rule:evidence_required', steps };
    }
  }

  // 3. Empirical tiebreak when cheap.
  if (c.testable && (c.testCostUsd ?? 0) <= org.policy.escalation.t3_spend_over_usd) {
    steps.push('resolvable empirically; run the cheapest test');
    return { outcome: 'run_test', steps };
  }

  // 4. Common manager decides.
  const mgr = commonManager(org, c.parties[0].agent, c.parties[1].agent);
  steps.push(`escalated to common manager ${mgr}`);
  if (c.managerDecision) {
    return { outcome: 'decided', option: c.managerDecision, decidedBy: mgr, dissent: c.parties.filter((p) => p.option !== c.managerDecision).map((p) => p.agent), steps };
  }

  // 5. Deadlock default: the more reversible option; tie broken by expected value.
  const [a, b] = c.parties;
  const pick = a.reversibility !== b.reversibility
    ? (a.reversibility > b.reversibility ? a : b)
    : ((a.expectedValue ?? 0) >= (b.expectedValue ?? 0) ? a : b);
  steps.push('deadlock: chose the more reversible option');
  return { outcome: 'decided', option: pick.option, decidedBy: 'rule:prefer_reversible', dissent: [c.parties.find((p) => p !== pick).agent], steps };
}
