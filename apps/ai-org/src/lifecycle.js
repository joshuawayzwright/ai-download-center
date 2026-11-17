// Stage-gate evaluation for the venture lifecycle, plus pre-registered kill criteria.
import { compare } from './util.js';

export function evaluateGate(workflow, stageId, { evaluator, metrics }) {
  const stage = workflow.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`unknown stage ${stageId}`);
  if (evaluator !== stage.evaluator) return { pass: false, reasons: [`gate must be evaluated by ${stage.evaluator}, not ${evaluator}`] };
  const reasons = [];
  let vetoed = null;
  for (const g of stage.gate) {
    if (!(g.metric in metrics)) { reasons.push(`missing metric ${g.metric}`); continue; }
    if (!compare(metrics[g.metric], g.op, g.value)) {
      reasons.push(`${g.metric}=${metrics[g.metric]} fails ${g.op} ${g.value}`);
      if (g.veto_owner) vetoed = g.veto_owner;
    }
  }
  const idx = workflow.stages.indexOf(stage);
  return {
    pass: reasons.length === 0,
    next: reasons.length === 0 ? workflow.stages[idx + 1]?.id ?? null : stageId,
    vetoedBy: vetoed,
    reasons,
  };
}

/** history: array of {metric: value} per period, oldest first. Returns the kill actions that fire. */
export function checkKillCriteria(criteria, history) {
  const fired = [];
  for (const k of criteria) {
    const recent = history.slice(-k.consecutive_periods);
    if (recent.length === k.consecutive_periods && recent.every((p) => k.metric in p && compare(p[k.metric], k.op, k.value))) {
      fired.push({ metric: k.metric, action: k.action });
    }
  }
  return fired;
}
