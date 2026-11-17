// Message schema validation and decision-request handling with deadlines and escalation.
const TYPES = new Set(['task', 'task_result', 'decision_request', 'decision', 'broadcast', 'escalation']);

export function validateMessage(org, msg) {
  const errors = [];
  for (const f of ['id', 'type', 'from', 'to', 'subject']) if (msg[f] === undefined) errors.push(`missing ${f}`);
  if (msg.type && !TYPES.has(msg.type)) errors.push(`unknown type ${msg.type}`);
  if (msg.from && !org.agents.has(msg.from) && msg.from !== 'board' && msg.from !== 'platform') errors.push(`unknown sender ${msg.from}`);
  for (const t of [].concat(msg.to ?? [])) if (!org.agents.has(t) && t !== 'board') errors.push(`unknown recipient ${t}`);
  if (msg.type === 'decision_request') {
    if (!msg.tier) errors.push('decision_request needs tier');
    if (!Array.isArray(msg.options) || msg.options.length < 1) errors.push('decision_request needs options');
    if (msg.recommendation && !msg.options?.some((o) => o.id === msg.recommendation)) errors.push('recommendation must be one of the options');
    if (typeof msg.confidence !== 'number' || msg.confidence < 0 || msg.confidence > 1) errors.push('confidence must be in [0,1]');
    if (!msg.deadline || Number.isNaN(Date.parse(msg.deadline))) errors.push('decision_request needs an ISO deadline');
    if (!Array.isArray(msg.evidence) || msg.evidence.length === 0) errors.push('decision_request needs evidence');
  }
  return errors;
}

export class Bus {
  constructor(org) {
    this.org = org;
    this.outbox = [];
    this.pending = new Map(); // id -> {msg, responses: Map}
    this.subscribers = [];
  }

  subscribe(fn) { this.subscribers.push(fn); }

  send(msg) {
    const errors = validateMessage(this.org, msg);
    if (errors.length) throw new Error(`invalid message: ${errors.join('; ')}`);
    this.outbox.push(msg);
    if (msg.type === 'decision_request') this.pending.set(msg.id, { msg, responses: new Map() });
    for (const s of this.subscribers) s(msg);
    return msg;
  }

  respond(requestId, from, { choice, approve, rationale }) {
    const p = this.pending.get(requestId);
    if (!p) throw new Error(`no pending request ${requestId}`);
    if (![].concat(p.msg.to).includes(from)) throw new Error(`${from} is not an addressee of ${requestId}`);
    p.responses.set(from, { choice, approve: Boolean(approve), rationale });
    const all = [].concat(p.msg.to).every((t) => p.responses.has(t));
    if (all) {
      this.pending.delete(requestId);
      const approved = [...p.responses.values()].every((r) => r.approve);
      return { resolved: true, approved, responses: Object.fromEntries(p.responses) };
    }
    return { resolved: false };
  }

  /** Expire overdue requests. Silence is never approval: overdue requests escalate one level up. */
  tick(now = Date.now()) {
    const escalations = [];
    for (const [id, p] of this.pending) {
      if (Date.parse(p.msg.deadline) > now) continue;
      this.pending.delete(id);
      const silent = [].concat(p.msg.to).filter((t) => !p.responses.has(t));
      const up = new Set(silent.map((t) => (t === 'board' ? 'board' : this.org.agents.get(t)?.reports_to ?? 'board')));
      const esc = {
        id: `${id}:esc`,
        type: 'escalation',
        from: 'platform',
        to: [...up],
        subject: `Overdue: ${p.msg.subject}`,
        body: `No response from ${silent.join(', ')} by ${p.msg.deadline}. Original request is attached; it was NOT approved.`,
        original: p.msg,
      };
      this.outbox.push(esc);
      escalations.push(esc);
    }
    return escalations;
  }
}
