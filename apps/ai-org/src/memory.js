// Semantic memory with provenance, confidence decay, contradiction handling and scoped access.
const DAY = 86_400_000;

function matches(pattern, namespace) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return namespace === pattern.slice(0, -2) || namespace.startsWith(pattern.slice(0, -1));
  return pattern === namespace;
}

export class MemoryStore {
  constructor(org, { now = () => Date.now() } = {}) {
    this.org = org;
    this.now = now;
    this.entries = new Map(); // key -> array of claims
    this.reconciliationQueue = [];
  }

  #check(agentId, namespace, mode) {
    const a = this.org.agents.get(agentId);
    if (!a) throw new Error(`unknown agent ${agentId}`);
    const scopes = a.memory?.[mode] ?? [];
    if (!scopes.some((p) => matches(p, namespace))) throw new Error(`${agentId} has no ${mode} access to ${namespace}`);
  }

  /**
   * Store a claim. Claims without a source are hypotheses. A claim that contradicts an existing
   * fact does not overwrite it; both are kept and a reconciliation task is queued.
   */
  put(agentId, { namespace, key, value, source, observedAt, confidence = 0.7, ttlDays = 90 }) {
    this.#check(agentId, namespace, 'write');
    const fullKey = `${namespace}/${key}`;
    const claim = {
      value,
      source: source ?? null,
      status: source ? 'fact' : 'hypothesis',
      confidence: Math.max(0, Math.min(1, confidence)),
      observedAt: observedAt ?? new Date(this.now()).toISOString(),
      ttlDays,
      writer: agentId,
    };
    const existing = this.entries.get(fullKey) ?? [];
    const live = existing.filter((c) => c.status !== 'superseded');
    const isFactLike = (c) => c.status === 'fact' || c.status === 'contested';
    if (claim.status === 'hypothesis') {
      // A hypothesis never displaces a sourced fact; it only replaces older hypotheses.
      if (!live.some(isFactLike)) for (const c of live) c.status = 'superseded';
    } else {
      const conflicting = live.filter((c) => isFactLike(c) && JSON.stringify(c.value) !== JSON.stringify(value));
      if (conflicting.length) {
        for (const c of conflicting) c.status = 'contested';
        claim.status = 'contested';
        this.reconciliationQueue.push({ key: fullKey, claims: [...conflicting, claim], openedBy: agentId });
      } else {
        // Same value re-observed, or a fact replacing hypotheses: older claims are superseded.
        for (const c of live) c.status = 'superseded';
      }
    }
    existing.push(claim);
    this.entries.set(fullKey, existing);
    return claim;
  }

  /** Effective confidence decays linearly to half at TTL, and keeps decaying after. */
  effectiveConfidence(claim) {
    const ageDays = (this.now() - Date.parse(claim.observedAt)) / DAY;
    return Math.max(0, claim.confidence * (1 - 0.5 * (ageDays / claim.ttlDays)));
  }

  get(agentId, namespace, key) {
    this.#check(agentId, namespace, 'read');
    const claims = (this.entries.get(`${namespace}/${key}`) ?? []).filter((c) => c.status !== 'superseded');
    return claims.map((c) => ({
      ...c,
      stale: (this.now() - Date.parse(c.observedAt)) / DAY > c.ttlDays,
      effectiveConfidence: this.effectiveConfidence(c),
    }));
  }

  /** For T2+ decisions: return a single fresh, sourced, uncontested fact or throw. */
  getForDecision(agentId, namespace, key, { minConfidence = 0.5 } = {}) {
    const claims = this.get(agentId, namespace, key);
    if (claims.length === 0) throw new Error(`no claim for ${namespace}/${key}`);
    if (claims.some((c) => c.status === 'contested')) throw new Error(`${namespace}/${key} is contested; reconcile first`);
    const fact = claims.find((c) => c.status === 'fact');
    if (!fact) throw new Error(`${namespace}/${key} is only a hypothesis`);
    if (fact.stale) throw new Error(`${namespace}/${key} is stale; re-verify the source`);
    if (fact.effectiveConfidence < minConfidence) throw new Error(`${namespace}/${key} confidence ${fact.effectiveConfidence.toFixed(2)} < ${minConfidence}`);
    return fact;
  }

  /** Resolve a contested key by choosing the winning value; losers are superseded. */
  reconcile(agentId, namespace, key, winningValue, { source }) {
    this.#check(agentId, namespace, 'write');
    const fullKey = `${namespace}/${key}`;
    for (const c of this.entries.get(fullKey) ?? []) c.status = 'superseded';
    this.reconciliationQueue = this.reconciliationQueue.filter((r) => r.key !== fullKey);
    return this.put(agentId, { namespace, key, value: winningValue, source, confidence: 0.9 });
  }
}
