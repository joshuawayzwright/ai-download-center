// Self-improvement gate: promote a new agent version only on independent, held-out evidence.

export const ROLLOUT = ['draft', 'shadow', 'canary', 'production'];

/**
 * @param c {
 *   agent, author, evaluator,
 *   holdout: { n, baseline, candidate },           // mean task score on hidden holdout
 *   guardrails: [{ name, baseline, candidate, higherIsBetter }],
 *   touchesOwnEvalOrPermissions?: boolean
 * }
 */
export function promotionGate(c, { minN = 100, minLift = 0.02, guardrailTolerance = 0.01 } = {}) {
  const reasons = [];
  if (c.author === c.evaluator) reasons.push('evaluator must be independent of the author');
  if (c.author === c.agent) reasons.push('an agent may not author its own new version');
  if (c.touchesOwnEvalOrPermissions) reasons.push('changes to own KPIs, evals or permissions are not allowed');
  if ((c.holdout?.n ?? 0) < minN) reasons.push(`holdout too small (${c.holdout?.n ?? 0} < ${minN})`);
  const lift = (c.holdout?.candidate ?? 0) - (c.holdout?.baseline ?? 0);
  if (lift < minLift) reasons.push(`lift ${lift.toFixed(3)} < required ${minLift}`);
  for (const g of c.guardrails ?? []) {
    const delta = g.higherIsBetter ? g.baseline - g.candidate : g.candidate - g.baseline;
    if (delta > guardrailTolerance) reasons.push(`guardrail ${g.name} regressed by ${delta.toFixed(3)}`);
  }
  return { promote: reasons.length === 0, lift, reasons };
}

/** Advance one rollout stage, or roll back to the previous production version on a KPI dip. */
export function nextRolloutStage(current, { gatePassed, liveKpiDelta = 0, rollbackThreshold = -0.05 }) {
  if (!ROLLOUT.includes(current)) throw new Error(`unknown stage ${current}`);
  if ((current === 'canary' || current === 'production') && liveKpiDelta < rollbackThreshold) return 'rolled_back';
  if (!gatePassed) return current;
  const i = ROLLOUT.indexOf(current);
  return ROLLOUT[Math.min(i + 1, ROLLOUT.length - 1)];
}
