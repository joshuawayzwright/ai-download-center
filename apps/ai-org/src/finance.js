// Unit economics, budget split, Thompson-sampling allocation and Monte Carlo runway.
import { beta, normal, quantile, rng } from './util.js';

export function unitEconomics({ priceMonthly, grossMargin, monthlyChurn, cac }) {
  if (monthlyChurn <= 0) throw new Error('monthlyChurn must be > 0');
  const contributionMonthly = priceMonthly * grossMargin;
  const lifetimeMonths = 1 / monthlyChurn;
  const ltv = contributionMonthly * lifetimeMonths;
  return {
    contributionMonthly,
    lifetimeMonths,
    ltv,
    ltvToCac: cac > 0 ? ltv / cac : Infinity,
    paybackMonths: contributionMonthly > 0 ? cac / contributionMonthly : Infinity,
  };
}

export function budgetSplit(totalUsd, policy) {
  const { core, growth, rnd } = policy;
  if (Math.abs(core + growth + rnd - 1) > 1e-9) throw new Error('allocation shares must sum to 1');
  return { core: totalUsd * core, growth: totalUsd * growth, rnd: totalUsd * rnd };
}

/**
 * Allocate a growth pool across arms (channels/experiments) by Thompson sampling.
 * Each arm: { id, successes, failures }. Share per arm is the fraction of posterior draws it wins,
 * capped at maxShare, with at least minExploration spread evenly across all arms.
 */
export function thompsonAllocate(arms, poolUsd, { maxShare = 0.3, minExploration = 0.1, draws = 4000, seed = 7 } = {}) {
  if (arms.length === 0) return {};
  if (maxShare * arms.length < 1) maxShare = 1 / arms.length;
  const rand = rng(seed);
  const wins = new Map(arms.map((a) => [a.id, 0]));
  for (let i = 0; i < draws; i++) {
    let best = null;
    let bestVal = -1;
    for (const a of arms) {
      const v = beta(rand, a.successes + 1, a.failures + 1);
      if (v > bestVal) { bestVal = v; best = a.id; }
    }
    wins.set(best, wins.get(best) + 1);
  }
  const floor = minExploration / arms.length;
  let shares = new Map(arms.map((a) => [a.id, floor + (1 - minExploration) * (wins.get(a.id) / draws)]));
  // Cap and redistribute the excess proportionally among uncapped arms.
  for (let iter = 0; iter < arms.length; iter++) {
    const capped = [...shares].filter(([, s]) => s > maxShare);
    if (!capped.length) break;
    let excess = 0;
    for (const [id, s] of capped) { excess += s - maxShare; shares.set(id, maxShare); }
    const open = [...shares].filter(([, s]) => s < maxShare);
    const openTotal = open.reduce((t, [, s]) => t + s, 0);
    for (const [id, s] of open) shares.set(id, s + excess * (s / openTotal));
  }
  return Object.fromEntries([...shares].map(([id, s]) => [id, Number((s * poolUsd).toFixed(2))]));
}

/**
 * Monte Carlo cash simulation.
 * @returns P10/P50/P90 of ending cash and the probability cash falls below the floor at any month.
 */
export function monteCarloRunway({ cash, mrr, growthMean, growthSd, monthlyCosts, months = 12, runs = 10000, floor = 0, seed = 42 }) {
  const rand = rng(seed);
  const ending = [];
  let breaches = 0;
  for (let r = 0; r < runs; r++) {
    let c = cash;
    let m = mrr;
    let breached = false;
    for (let t = 0; t < months; t++) {
      m = Math.max(0, m * (1 + normal(rand, growthMean, growthSd)));
      c += m - monthlyCosts;
      if (c < floor) breached = true;
    }
    if (breached) breaches++;
    ending.push(c);
  }
  ending.sort((a, b) => a - b);
  return {
    p10: quantile(ending, 0.1),
    p50: quantile(ending, 0.5),
    p90: quantile(ending, 0.9),
    probBelowFloor: breaches / runs,
  };
}
