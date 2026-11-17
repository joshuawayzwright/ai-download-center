import test from 'node:test';
import assert from 'node:assert/strict';
import { unitEconomics, budgetSplit, thompsonAllocate, monteCarloRunway } from '../src/finance.js';
import { scorecard, lifecycleState, parseTarget } from '../src/performance.js';
import { promotionGate, nextRolloutStage } from '../src/improvement.js';
import { freshOrg } from './helpers.js';

test('unit economics', () => {
  const u = unitEconomics({ priceMonthly: 100, grossMargin: 0.8, monthlyChurn: 0.1, cac: 200 });
  assert.equal(u.ltv, 800);
  assert.equal(u.ltvToCac, 4);
  assert.equal(u.paybackMonths, 2.5);
});

test('budget split follows constitution shares', () => {
  const s = budgetSplit(300, freshOrg().constitution.allocation_policy);
  assert.deepEqual(s, { core: 210, growth: 60, rnd: 30 });
});

test('Thompson allocation sums to pool, respects caps and funds every arm', () => {
  const arms = [
    { id: 'a', successes: 50, failures: 50 },
    { id: 'b', successes: 5, failures: 95 },
    { id: 'c', successes: 2, failures: 98 },
    { id: 'd', successes: 1, failures: 99 },
  ];
  const alloc = thompsonAllocate(arms, 1000, { maxShare: 0.4, minExploration: 0.1 });
  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1000) < 0.05);
  assert.ok(alloc.a <= 400.01);
  for (const v of Object.values(alloc)) assert.ok(v >= 25 - 0.01, 'exploration floor');
  assert.ok(alloc.a >= alloc.d);
  assert.deepEqual(thompsonAllocate(arms, 1000, { maxShare: 0.4 }), alloc, 'deterministic with seed');
});

test('Monte Carlo runway is ordered and reproducible', () => {
  const args = { cash: 1000, mrr: 100, growthMean: 0.05, growthSd: 0.1, monthlyCosts: 150, runs: 2000, floor: 0 };
  const a = monteCarloRunway(args);
  assert.ok(a.p10 <= a.p50 && a.p50 <= a.p90);
  assert.deepEqual(monteCarloRunway(args), a);
  assert.ok(monteCarloRunway({ ...args, growthMean: -0.2 }).probBelowFloor > a.probBelowFloor);
});

test('scorecard weights outcomes and caps the score when a guardrail is missed', () => {
  const sales = freshOrg().agents.get('sales');
  const base = { quality: 0.9, brier: 0.1, costPerTaskUsd: 0.4, targetCostPerTaskUsd: 0.5, violations: 0 };
  const good = scorecard(sales, { ...base, kpis: { win_rate: 0.3, new_sponsors_per_month: 3, avg_discount: 0.05 } });
  const gamed = scorecard(sales, { ...base, kpis: { win_rate: 0.3, new_sponsors_per_month: 3, avg_discount: 0.3 } });
  assert.equal(good.parts.outcomes, 1);
  assert.equal(gamed.parts.outcomes, 0.5);
  assert.ok(gamed.total < good.total);
  assert.throws(() => scorecard(sales, { ...base, kpis: {} }), /missing actual/);
});

test('KPI target parsing and lifecycle transitions', () => {
  assert.deepEqual(parseTarget('>=10/mo'), { op: '>=', value: 10 });
  assert.equal(lifecycleState([0.8, 0.7]), 'production');
  assert.equal(lifecycleState([0.8, 0.5]), 'pip');
  assert.equal(lifecycleState([0.5, 0.4]), 'replace');
});

test('promotion gate enforces independence, sample size, lift and guardrails', () => {
  const good = {
    agent: 'sales', author: 'chro', evaluator: 'eval-lab',
    holdout: { n: 200, baseline: 0.7, candidate: 0.75 },
    guardrails: [{ name: 'complaint_rate', baseline: 0.01, candidate: 0.012, higherIsBetter: false }],
  };
  assert.equal(promotionGate(good).promote, true);
  assert.equal(promotionGate({ ...good, evaluator: 'chro' }).promote, false);
  assert.equal(promotionGate({ ...good, author: 'sales' }).promote, false);
  assert.equal(promotionGate({ ...good, holdout: { n: 20, baseline: 0.7, candidate: 0.9 } }).promote, false);
  assert.equal(promotionGate({ ...good, guardrails: [{ name: 'refunds', baseline: 0.01, candidate: 0.05, higherIsBetter: false }] }).promote, false);
  assert.equal(promotionGate({ ...good, touchesOwnEvalOrPermissions: true }).promote, false);
});

test('rollout advances stage by stage and rolls back on a live KPI dip', () => {
  assert.equal(nextRolloutStage('shadow', { gatePassed: true }), 'canary');
  assert.equal(nextRolloutStage('canary', { gatePassed: false }), 'canary');
  assert.equal(nextRolloutStage('canary', { gatePassed: true, liveKpiDelta: -0.1 }), 'rolled_back');
});
