// Pure org-model functions: no Node APIs, so they run in Node and in the browser.
import { TIER_RANK } from './util.js';

/** Build the in-memory org (agents and workflows as Maps) from a plain JSON bundle. */
export function orgFromBundle(bundle) {
  return {
    constitution: bundle.constitution,
    policy: bundle.policy,
    agents: new Map(bundle.agents.map((a) => [a.id, a])),
    workflows: new Map(bundle.workflows.map((w) => [w.id, w])),
  };
}

/** The inverse of orgFromBundle: a JSON-serializable bundle. */
export function bundleFromOrg(org) {
  return {
    constitution: org.constitution,
    policy: org.policy,
    agents: [...org.agents.values()],
    workflows: [...org.workflows.values()],
  };
}

const REQUIRED = ['id', 'version', 'title', 'layer', 'reports_to', 'mission', 'kpis', 'permissions', 'memory'];

export function validateOrg(org) {
  const errors = [];
  const { agents, constitution, policy, workflows } = org;

  for (const [id, a] of agents) {
    for (const field of REQUIRED) if (a[field] === undefined) errors.push(`${id}: missing ${field}`);
    if (a.reports_to !== 'board' && !agents.has(a.reports_to)) errors.push(`${id}: reports_to unknown agent ${a.reports_to}`);
    for (const d of a.dotted_to ?? []) if (d !== 'board' && !agents.has(d)) errors.push(`${id}: dotted_to unknown agent ${d}`);
    if (!(a.permissions?.max_tier in TIER_RANK)) errors.push(`${id}: invalid max_tier`);
    if (a.permissions?.max_tier === 'T4') errors.push(`${id}: no agent may hold T4; T4 belongs to the human Board`);
    const weights = (a.kpis ?? []).reduce((s, k) => s + k.weight, 0);
    if (Math.abs(weights - 1) > 1e-9) errors.push(`${id}: KPI weights sum to ${weights}, expected 1`);
    if (!(a.kpis ?? []).some((k) => k.guardrail) && a.layer !== 'L3') {
      // Guardrails are recommended, not mandatory; recorded as a warning-level error only for execs.
      if (a.layer === 'L1') errors.push(`${id}: executives need at least one guardrail KPI`);
    }
  }

  // Exactly one root, and the hierarchy must be acyclic.
  const roots = [...agents.values()].filter((a) => a.reports_to === 'board');
  if (roots.length !== 1) errors.push(`expected exactly one agent reporting to the board, found ${roots.length}`);
  for (const id of agents.keys()) {
    const seen = new Set();
    let cur = id;
    while (cur && cur !== 'board') {
      if (seen.has(cur)) { errors.push(`${id}: reporting cycle via ${cur}`); break; }
      seen.add(cur);
      cur = agents.get(cur)?.reports_to;
    }
  }

  // Budget: department caps must fit inside the Board envelope.
  const totalCaps = [...agents.values()].reduce((s, a) => s + (a.permissions?.spend_limit_usd?.monthly ?? 0), 0);
  if (totalCaps > constitution.board.monthly_burn_cap_usd) {
    errors.push(`sum of monthly spend caps ${totalCaps} exceeds board burn cap ${constitution.board.monthly_burn_cap_usd}`);
  }

  // Policy co-signers must exist.
  for (const [type, rule] of Object.entries(policy.action_types)) {
    for (const r of [rule.cosigner, ...(rule.also_requires ?? [])].filter(Boolean)) {
      if (!agents.has(r)) errors.push(`policy ${type}: unknown co-signer ${r}`);
    }
  }

  // Workflow owners and evaluators exist, and evaluator != owner (separation of duties).
  for (const wf of workflows.values()) {
    for (const s of wf.stages) {
      if (!agents.has(s.owner)) errors.push(`${wf.id}.${s.id}: unknown owner ${s.owner}`);
      if (!agents.has(s.evaluator)) errors.push(`${wf.id}.${s.id}: unknown evaluator ${s.evaluator}`);
      if (s.owner === s.evaluator) errors.push(`${wf.id}.${s.id}: owner cannot evaluate its own gate`);
    }
  }
  return errors;
}

export function chainOfCommand(org, id) {
  const chain = [];
  let cur = org.agents.get(id)?.reports_to;
  while (cur) {
    chain.push(cur);
    if (cur === 'board') break;
    cur = org.agents.get(cur)?.reports_to;
  }
  return chain;
}

export function orgChart(org) {
  const children = new Map();
  for (const a of org.agents.values()) {
    if (!children.has(a.reports_to)) children.set(a.reports_to, []);
    children.get(a.reports_to).push(a.id);
  }
  const lines = ['board (human)'];
  const walk = (id, prefix) => {
    const kids = (children.get(id) ?? []).sort();
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      const a = org.agents.get(kid);
      const extras = [a.permissions.max_tier, ...(a.veto.length ? [`veto:${a.veto.join('/')}`] : []), ...(a.dotted_to.length ? [`dotted:${a.dotted_to.join(',')}`] : [])];
      lines.push(`${prefix}${last ? '└── ' : '├── '}${kid}  [${extras.join(' ')}]`);
      walk(kid, prefix + (last ? '    ' : '│   '));
    });
  };
  walk('board', '');
  return lines.join('\n');
}
