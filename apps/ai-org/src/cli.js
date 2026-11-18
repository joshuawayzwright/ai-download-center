#!/usr/bin/env node
// ai-org CLI: validate | chart | simulate
import { loadOrg, validateOrg, orgChart } from './registry.js';
import { evaluate, Controls } from './policy.js';
import { budgetSplit, thompsonAllocate, monteCarloRunway, unitEconomics } from './finance.js';
import { evaluateGate } from './lifecycle.js';

const org = loadOrg();
const cmd = process.argv[2] ?? 'validate';

if (cmd === 'validate') {
  const errors = validateOrg(org);
  if (errors.length) {
    console.error(`Org is INVALID (${errors.length} problems):\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Org is valid: ${org.agents.size} agents, ${org.workflows.size} workflow(s).`);
  }
} else if (cmd === 'chart') {
  console.log(orgChart(org));
} else if (cmd === 'simulate') {
  const b = org.constitution.board;
  console.log(`Board envelope confirmed by owner: ${b.owner_confirmed}\n`);

  console.log('== Policy decisions ==');
  const controls = new Controls(org);
  const cases = [
    { agent: 'marketing', type: 'draft' },
    { agent: 'marketing', type: 'publish_content', compliance: { status: 'pending' } },
    { agent: 'marketing', type: 'publish_content', compliance: { status: 'approved' } },
    { agent: 'sales', type: 'discount', discount: 0.25 },
    { agent: 'eng', type: 'merge_pull_request', author: 'eng' },
    { agent: 'ops', type: 'vendor_contract', spendUsd: 80 },
    { agent: 'ceo', type: 'raise_capital' },
    { agent: 'support', type: 'external_comm', compliance: { status: 'approved' }, untrustedTrigger: true },
  ];
  for (const c of cases) {
    const r = evaluate(org, controls, c);
    const needs = r.missing.length ? `needs: ${r.missing.join(',')}` : '';
    console.log(`${c.agent.padEnd(9)} ${c.type.padEnd(18)} -> ${r.decision.padEnd(14)} ${r.tier} ${needs} ${r.reasons.at(-1) ?? ''}`);
  }

  console.log('\n== Unit economics (featured listing, illustrative inputs) ==');
  const ue = unitEconomics({ priceMonthly: 99, grossMargin: 0.9, monthlyChurn: 0.15, cac: 120 });
  console.log(`LTV $${ue.ltv.toFixed(0)}, LTV/CAC ${ue.ltvToCac.toFixed(2)}, payback ${ue.paybackMonths.toFixed(1)} months`);

  console.log('\n== Monthly budget split ==');
  const split = budgetSplit(b.monthly_burn_cap_usd, org.constitution.allocation_policy);
  console.log(split);

  console.log('\n== Growth pool allocation (Thompson sampling, illustrative arm data) ==');
  console.log(thompsonAllocate([
    { id: 'seo', successes: 12, failures: 300 },
    { id: 'reddit', successes: 4, failures: 200 },
    { id: 'sponsor_outreach', successes: 3, failures: 40 },
    { id: 'newsletter', successes: 1, failures: 60 },
  ], split.growth, {
    maxShare: org.constitution.allocation_policy.max_arm_share,
    minExploration: org.constitution.allocation_policy.min_exploration_share,
  }));

  console.log('\n== 12-month cash scenarios (Monte Carlo, illustrative inputs) ==');
  for (const [name, g] of [['bear', -0.05], ['base', 0.05], ['bull', 0.15]]) {
    const mc = monteCarloRunway({ cash: 1000, mrr: 99, growthMean: g, growthSd: 0.15, monthlyCosts: 150, floor: b.cash_floor_usd });
    console.log(`${name.padEnd(5)} P10 $${mc.p10.toFixed(0)}  P50 $${mc.p50.toFixed(0)}  P90 $${mc.p90.toFixed(0)}  P(cash < floor) ${(mc.probBelowFloor * 100).toFixed(1)}%`);
  }

  console.log('\n== Stage gate: validation ==');
  console.log(evaluateGate(org.workflows.get('venture-lifecycle'), 'validation', {
    evaluator: 'cfo',
    metrics: { landing_conversion: 0.07, ltv_to_cac: 2.1 },
  }));
} else {
  console.error('usage: ai-org <validate|chart|simulate>');
  process.exitCode = 2;
}
