// Policy engine: decides whether an agent action is allowed, denied, or needs approval.
// Deterministic code, not an LLM; agents cannot bypass it.
import { TIER_RANK, tierMax } from './util.js';
import { chainOfCommand } from './org-model.js';

const EXTERNAL_TYPES = new Set(['external_comm', 'publish_content', 'public_statement', 'ad_spend', 'discount', 'refund']);

export class Controls {
  constructor(org) {
    this.org = org;
    this.levels = new Set(); // 'L2' | 'L3' | 'L4'
    this.paused = new Set(); // agent ids (L1)
    this.log = [];
    this.monthlySpend = new Map();
  }

  trigger(level, by, { target, reason } = {}) {
    const rule = this.org.policy.kill_switch_levels[level];
    if (!rule) throw new Error(`Unknown kill-switch level ${level}`);
    const allowed = rule.triggered_by.includes(by)
      || (rule.triggered_by.includes('manager') && target && this.org.agents.get(target)?.reports_to === by);
    if (!allowed) throw new Error(`${by} may not trigger ${level}`);
    if (level === 'L1') {
      if (!target) throw new Error('L1 requires a target agent');
      this.paused.add(target);
    } else {
      this.levels.add(level);
    }
    this.log.push({ at: new Date().toISOString(), level, by, target, reason });
  }

  release(level, by, { target } = {}) {
    // Releasing is restricted to the Board or Risk, except L1 which the manager may release.
    if (level === 'L1') {
      if (by !== 'risk' && by !== 'board' && this.org.agents.get(target)?.reports_to !== by) throw new Error(`${by} may not release L1 on ${target}`);
      this.paused.delete(target);
    } else {
      if (by !== 'board' && by !== 'risk') throw new Error(`only board or risk may release ${level}`);
      this.levels.delete(level);
    }
    this.log.push({ at: new Date().toISOString(), release: level, by, target });
  }

  // Returns the kill-switch levels the given live metrics should trigger.
  autoTriggers({ dailySpendUsd = 0, forecastDailySpendUsd = Infinity, errorRate = 0, outboundPerHour = 0 } = {}) {
    const t = this.org.policy.auto_triggers;
    const fired = [];
    if (dailySpendUsd > forecastDailySpendUsd * t.daily_spend_over_forecast_multiple) fired.push({ level: 'L3', reason: 'daily spend above forecast multiple' });
    if (errorRate > t.error_rate_over) fired.push({ level: 'L2', reason: 'error rate above threshold' });
    if (outboundPerHour > t.outbound_messages_per_hour_over) fired.push({ level: 'L2', reason: 'outbound volume anomaly' });
    for (const f of fired) if (!this.levels.has(f.level)) this.trigger(f.level, 'risk', { reason: f.reason });
    return fired;
  }

  recordSpend(agent, usd) {
    this.monthlySpend.set(agent, (this.monthlySpend.get(agent) ?? 0) + usd);
  }

  /** Serializable kill-switch state, for storage outside the process. */
  toState() {
    return { levels: [...this.levels].sort(), paused: [...this.paused].sort() };
  }

  /** Rebuild controls from stored state; unknown levels and agents are ignored. */
  static fromState(org, { levels = [], paused = [] } = {}) {
    const c = new Controls(org);
    for (const l of levels) if (l in org.policy.kill_switch_levels && l !== 'L1') c.levels.add(l);
    for (const a of paused) if (org.agents.has(a)) c.paused.add(a);
    return c;
  }
}

function owningExec(org, agentId) {
  const a = org.agents.get(agentId);
  if (a.layer === 'L1') return agentId;
  return chainOfCommand(org, agentId).find((id) => org.agents.get(id)?.layer === 'L1') ?? 'ceo';
}

/**
 * @param {object} org  loaded org
 * @param {Controls} controls
 * @param {object} action { agent, type, spendUsd?, discount?, commitmentMonths?, author?, approvals?, compliance?, untrustedTrigger?, verified? }
 * @returns {{decision:'allow'|'deny'|'needs_approval', tier:string, required:string[], missing:string[], reasons:string[]}}
 */
export function evaluate(org, controls, action) {
  const reasons = [];
  const deny = (msg, tier = 'T0') => ({ decision: 'deny', tier, required: [], missing: [], reasons: [...reasons, msg] });
  const agent = org.agents.get(action.agent);
  if (!agent) return deny(`unknown agent ${action.agent}`);
  const rule = org.policy.action_types[action.type];
  if (!rule) return deny(`unknown action type ${action.type}`);

  let tier = rule.tier;
  const spend = action.spendUsd ?? 0;
  const esc = org.policy.escalation;
  const caps = agent.permissions.spend_limit_usd ?? { per_action: 0, monthly: 0 };

  // Kill switches first.
  if (controls.levels.has('L4') && TIER_RANK[tier] > 0) return deny('L4 full stop is active', tier);
  if (controls.paused.has(agent.id) && TIER_RANK[tier] > 0) return deny(`${agent.id} is paused (L1)`, tier);
  if (controls.levels.has('L2') && EXTERNAL_TYPES.has(action.type)) return deny('L2 external freeze is active', tier);
  if (controls.levels.has('L3') && spend > 0) return deny('L3 spend freeze is active', tier);

  if ((agent.permissions.forbidden ?? []).includes(action.type)) return deny(`${action.type} is forbidden for ${agent.id}`, tier);
  if (action.untrustedTrigger && !action.verified) return deny('action was triggered by untrusted content and has not been verified', tier);
  if (rule.requires_compliance && action.compliance?.status !== 'approved') return deny('external output requires compliance approval', tier);
  if (rule.separation_of_duties === 'author_cannot_approve' && action.author && action.author === action.agent) {
    return deny('separation of duties: the author cannot approve or ship their own work', tier);
  }

  const required = new Set();
  const cfoOrIndependent = () => (agent.id === 'cfo' ? 'ceo' : 'cfo');

  // Escalation by money, discount and commitment length.
  if (spend > esc.t4_spend_over_usd) { tier = tierMax(tier, 'T4'); reasons.push(`spend ${spend} > T4 threshold`); }
  else if (spend > esc.t3_spend_over_usd) { tier = tierMax(tier, 'T3'); required.add(cfoOrIndependent()); reasons.push(`spend ${spend} > T3 threshold`); }
  if (spend > caps.per_action) { tier = tierMax(tier, 'T3'); required.add(cfoOrIndependent()); reasons.push(`spend ${spend} > per-action cap ${caps.per_action}`); }
  const monthToDate = controls.monthlySpend.get(agent.id) ?? 0;
  if (spend > 0 && monthToDate + spend > caps.monthly) { tier = tierMax(tier, 'T3'); required.add(cfoOrIndependent()); reasons.push('monthly cap would be exceeded'); }
  if (action.discount !== undefined) {
    const limit = Math.min(agent.permissions.discount_limit ?? 0, esc.discount_cfo_cosign_over);
    if (action.discount > limit) { tier = tierMax(tier, 'T3'); required.add(cfoOrIndependent()); reasons.push(`discount ${action.discount} > ${limit}`); }
  }
  if ((action.commitmentMonths ?? 0) > org.constitution.board.max_commitment_months_without_board) {
    tier = tierMax(tier, 'T4'); reasons.push('commitment longer than board limit');
  }

  // Board has not confirmed the envelope: everything T2+ goes to the Board.
  if (!org.constitution.board.owner_confirmed && TIER_RANK[tier] >= 2) {
    tier = tierMax(tier, 'T2');
    required.add('board');
    reasons.push('board envelope not yet confirmed by the owner');
  }

  if (tier === 'T4') {
    required.clear();
    required.add('board');
  } else if (tier === 'T3') {
    const exec = owningExec(org, agent.id);
    if (exec !== agent.id) required.add(exec);
    for (const c of [rule.cosigner, ...(rule.also_requires ?? [])].filter(Boolean)) required.add(c === agent.id ? 'ceo' : c);
    if (required.size === 0 || (required.size === 1 && required.has('board'))) required.add(agent.id === 'ceo' ? 'cfo' : 'ceo');
  } else if (TIER_RANK[tier] > TIER_RANK[agent.permissions.max_tier]) {
    required.add(agent.reports_to);
    reasons.push(`tier ${tier} exceeds ${agent.id} max tier ${agent.permissions.max_tier}`);
  }
  required.delete(agent.id);

  const approvals = new Set(action.approvals ?? []);
  // The Board sits at the top of every approval chain, so its approval covers every approver below it.
  // Denials above (kill switches, compliance, separation of duties, forbidden actions) still apply.
  const boardApproved = approvals.has('board');
  const missing = boardApproved ? [] : [...required].filter((r) => !approvals.has(r));
  if (boardApproved && required.size > 0) reasons.push('approved by the Board');
  return {
    decision: missing.length === 0 ? 'allow' : 'needs_approval',
    tier,
    required: [...required],
    missing,
    reasons,
  };
}
