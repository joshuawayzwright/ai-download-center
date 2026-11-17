// Append-only, hash-chained decision ledger with outcome tracking and calibration.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const hash = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex');

export class Ledger {
  constructor({ file } = {}) {
    this.file = file;
    this.entries = [];
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) this.entries.push(JSON.parse(line));
      const bad = this.verify();
      if (bad.length) throw new Error(`ledger integrity failure at entries ${bad.join(', ')}`);
    }
  }

  #append(body) {
    const prev = this.entries.at(-1)?.hash ?? 'genesis';
    const entry = { seq: this.entries.length, at: body.at ?? new Date().toISOString(), prev, ...body };
    entry.hash = hash({ ...entry, hash: undefined });
    this.entries.push(entry);
    if (this.file) appendFileSync(this.file, JSON.stringify(entry) + '\n');
    return entry;
  }

  /** Record a decision with its predicted probability of success. */
  decide({ id, agent, type, tier, summary, rationale, prediction, approvals = [], dissent = [] }) {
    if (!id || !agent || !summary) throw new Error('decision needs id, agent and summary');
    if (prediction && (prediction.p < 0 || prediction.p > 1)) throw new Error('prediction.p must be in [0,1]');
    if (this.find(id)) throw new Error(`decision ${id} already exists`);
    return this.#append({ kind: 'decision', id, agent, type, tier, summary, rationale, prediction, approvals, dissent });
  }

  /** Record the actual outcome of a decision once it matures. */
  outcome(id, { success, note }) {
    if (!this.find(id)) throw new Error(`unknown decision ${id}`);
    if (this.entries.some((e) => e.kind === 'outcome' && e.id === id)) throw new Error(`outcome for ${id} already recorded`);
    return this.#append({ kind: 'outcome', id, success: Boolean(success), note });
  }

  find(id) {
    return this.entries.find((e) => e.kind === 'decision' && e.id === id);
  }

  /** Brier score per agent (lower is better); dissenters who were right are credited. */
  calibration() {
    const byAgent = new Map();
    for (const o of this.entries.filter((e) => e.kind === 'outcome')) {
      const d = this.find(o.id);
      if (!d?.prediction) continue;
      const y = o.success ? 1 : 0;
      const s = byAgent.get(d.agent) ?? { n: 0, sq: 0, dissentWins: 0 };
      s.n += 1;
      s.sq += (d.prediction.p - y) ** 2;
      byAgent.set(d.agent, s);
      for (const dis of d.dissent ?? []) {
        if (!o.success) {
          const ds = byAgent.get(dis.agent) ?? { n: 0, sq: 0, dissentWins: 0 };
          ds.dissentWins += 1;
          byAgent.set(dis.agent, ds);
        }
      }
    }
    return Object.fromEntries([...byAgent].map(([a, s]) => [a, { n: s.n, brier: s.n ? s.sq / s.n : null, dissentWins: s.dissentWins }]));
  }

  /** Returns indexes of entries whose hash chain is broken (empty if intact). */
  verify() {
    const bad = [];
    this.entries.forEach((e, i) => {
      const prev = i === 0 ? 'genesis' : this.entries[i - 1].hash;
      if (e.prev !== prev || e.hash !== hash({ ...e, hash: undefined })) bad.push(i);
    });
    return bad;
  }
}
