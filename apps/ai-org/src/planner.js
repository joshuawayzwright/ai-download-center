// Planner: turns a scheduled agent run's proposed intents into a safe batch of Board Console requests.
// Pure code, shared by the CLI and tests. It never runs anything; it only decides what gets filed.
//
// Guarantees for every scheduled run:
//  - only actions on the scheduled allow-list are filed (no refunds, coupons or sent emails),
//  - nothing is filed while an L2 or L4 kill switch is active, or for a paused agent,
//  - no duplicates: an intent whose id, or whose exact action, matches an open request is skipped,
//  - at most MAX_PER_RUN requests are filed, in the order proposed,
//  - every intent still passes the gateway's validation and the policy engine (buildRequest).
import { Controls } from './policy.js';
import { buildRequest, canonical } from './gateway.js';

export const MAX_PER_RUN = 5;

// Actions an unattended run may propose. Refunds, coupons and sending email need a person to start them.
export const SCHEDULED_ACTIONS = new Set(['task.create', 'email.draft', 'crm.update']);

const OPEN = (r) => r && (r.status === 'pending' || (r.status === 'ready' && r.run?.state !== 'done')
  || (r.status === 'approved' && r.run?.state !== 'done'));

/**
 * @param org        loaded org
 * @param controlsState  {levels, paused} from controls/state in the Board Console (may be empty)
 * @param intents    [{id, agent, kind, params, subject, body, confidence, evidence, deadline?}]
 * @param existing   [{id, ...request}] current requests in the Board Console
 * @returns {{ file: {id, request}[], skipped: {id, reason}[], halted?: string }}
 */
export function planBatch(org, controlsState, intents, existing = [], { now = new Date(), max = MAX_PER_RUN } = {}) {
  const controls = Controls.fromState(org, controlsState ?? {});
  if (controls.levels.has('L4')) return { file: [], skipped: [], halted: 'L4 full stop is active; nothing was filed' };
  if (controls.levels.has('L2')) return { file: [], skipped: [], halted: 'L2 external freeze is active; nothing was filed' };
  if (!Array.isArray(intents)) throw new Error('intents must be an array');

  const existingIds = new Set(existing.map((r) => r.id));
  const openActions = new Set(existing.filter(OPEN).filter((r) => r.execution).map((r) => canonical(r.execution)));
  const file = [];
  const skipped = [];

  for (const intent of intents) {
    const id = intent?.id;
    const skip = (reason) => skipped.push({ id: id ?? '(no id)', reason });
    if (!SCHEDULED_ACTIONS.has(intent?.kind)) { skip(`${intent?.kind} is not allowed in a scheduled run`); continue; }
    if (controls.paused.has(intent.agent)) { skip(`${intent.agent} is paused`); continue; }
    if (existingIds.has(id) || file.some((f) => f.id === id)) { skip('already filed'); continue; }
    const key = canonical({ kind: intent.kind, params: intent.params });
    if (openActions.has(key) || file.some((f) => canonical(f.request.execution) === key)) { skip('the same action is already open'); continue; }
    if (file.length >= max) { skip(`run limit of ${max} reached`); continue; }
    const { id: _id, deadline, confidence, evidence, subject, body, ...rest } = intent;
    try {
      const request = buildRequest(org, controls, rest, { id, now, deadline, confidence, evidence, subject, body });
      file.push({ id, request: { ...request, filedBy: 'scheduled-run' } });
    } catch (e) {
      skip(e.message);
    }
  }
  return { file, skipped };
}

/** The planner's output as Board Console database writes (one batch call). */
export function toWrites(plan) {
  return plan.file.map(({ id, request }) => ({ op: 'set', collection: 'requests', doc_id: id, data: request }));
}
