// Agent scorecards and lifecycle transitions (CHRO + Eval Lab).
import { compare } from './util.js';

export const SCORECARD_WEIGHTS = { outcomes: 0.4, quality: 0.2, calibration: 0.15, efficiency: 0.15, compliance: 0.1 };

/** Parse a KPI target such as ">=0.25", "<=3", "==0" or ">=10/mo" into {op, value}. */
export function parseTarget(target) {
  const m = /^(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)/.exec(String(target));
  if (!m) throw new Error(`unparseable KPI target ${target}`);
  return { op: m[1], value: Number(m[2]) };
}

/** Weighted share of KPIs met. A missed guardrail KPI caps the outcome score at 0.5. */
export function kpiScore(manifest, actuals) {
  let score = 0;
  let guardrailMissed = false;
  const detail = [];
  for (const k of manifest.kpis) {
    if (!(k.name in actuals)) throw new Error(`${manifest.id}: missing actual for KPI ${k.name}`);
    const { op, value } = parseTarget(k.target);
    const met = compare(actuals[k.name], op, value);
    if (met) score += k.weight;
    if (!met && k.guardrail) guardrailMissed = true;
    detail.push({ kpi: k.name, target: k.target, actual: actuals[k.name], met });
  }
  return { score: guardrailMissed ? Math.min(score, 0.5) : score, guardrailMissed, detail };
}

/**
 * @param manifest agent manifest
 * @param m { kpis: {name: actual}, quality: 0..1, brier: 0..1|null, costPerTaskUsd, targetCostPerTaskUsd, violations }
 */
export function scorecard(manifest, m) {
  const outcomes = kpiScore(manifest, m.kpis);
  const calibration = m.brier == null ? 0.5 : Math.max(0, 1 - m.brier / 0.25); // 0.25 = coin-flip Brier
  const efficiency = Math.max(0, Math.min(1, m.targetCostPerTaskUsd / Math.max(m.costPerTaskUsd, 1e-9)));
  const compliance = Math.max(0, 1 - 0.25 * (m.violations ?? 0));
  const parts = { outcomes: outcomes.score, quality: m.quality, calibration, efficiency, compliance };
  const total = Object.entries(SCORECARD_WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0);
  return { agent: manifest.id, total: Number(total.toFixed(4)), parts, outcomes };
}

/** Lifecycle: production -> pip after one cycle below floor -> replace after two consecutive. */
export function lifecycleState(history, { floor = 0.6 } = {}) {
  const recent = history.slice(-2);
  if (recent.length === 2 && recent.every((s) => s < floor)) return 'replace';
  if (recent.at(-1) !== undefined && recent.at(-1) < floor) return 'pip';
  return 'production';
}
