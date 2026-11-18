import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.js';
import { MemoryStore } from '../src/memory.js';
import { freshOrg } from './helpers.js';

test('ledger is hash-chained and detects tampering on reload', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl');
  const l = new Ledger({ file });
  l.decide({ id: 'd1', agent: 'cmo', summary: 'Launch SEO pages', prediction: { p: 0.7 } });
  l.outcome('d1', { success: true });
  assert.deepEqual(new Ledger({ file }).verify(), []);
  writeFileSync(file, readFileSync(file, 'utf8').replace('Launch SEO pages', 'Launch ads'));
  assert.throws(() => new Ledger({ file }), /integrity failure/);
});

test('ledger computes Brier calibration and credits correct dissent', () => {
  const l = new Ledger();
  l.decide({ id: 'a', agent: 'cmo', summary: 'x', prediction: { p: 0.9 }, dissent: [{ agent: 'cfo' }] });
  l.decide({ id: 'b', agent: 'cmo', summary: 'y', prediction: { p: 0.9 } });
  l.outcome('a', { success: false });
  l.outcome('b', { success: true });
  const cal = l.calibration();
  assert.equal(cal.cmo.n, 2);
  assert.ok(Math.abs(cal.cmo.brier - (0.81 + 0.01) / 2) < 1e-9);
  assert.equal(cal.cfo.dissentWins, 1);
  assert.throws(() => l.outcome('a', { success: true }), /already recorded/);
});

test('memory: unsourced claims are hypotheses and cannot drive decisions', () => {
  const m = new MemoryStore(freshOrg());
  m.put('sales', { namespace: 'semantic.customers', key: 'acme.budget', value: 500 });
  assert.throws(() => m.getForDecision('sales', 'semantic.customers', 'acme.budget'), /hypothesis/);
  m.put('sales', { namespace: 'semantic.customers', key: 'acme.budget', value: 500, source: 'crm:deal/1' });
  assert.equal(m.getForDecision('sales', 'semantic.customers', 'acme.budget').value, 500);
});

test('memory: a hypothesis never displaces a sourced fact', () => {
  const m = new MemoryStore(freshOrg());
  m.put('sales', { namespace: 'semantic.customers', key: 'k', value: 1, source: 'crm' });
  m.put('sales', { namespace: 'semantic.customers', key: 'k', value: 2 });
  assert.equal(m.getForDecision('sales', 'semantic.customers', 'k').value, 1);
});

test('memory: contradicting facts are contested, then reconciled', () => {
  const m = new MemoryStore(freshOrg());
  m.put('sales', { namespace: 'semantic.customers', key: 'k', value: 'A', source: 's1' });
  m.put('support', { namespace: 'semantic.customers', key: 'k', value: 'B', source: 's2' });
  assert.equal(m.reconciliationQueue.length, 1);
  assert.throws(() => m.getForDecision('sales', 'semantic.customers', 'k'), /contested/);
  m.reconcile('sales', 'semantic.customers', 'k', 'B', { source: 'billing' });
  assert.equal(m.getForDecision('sales', 'semantic.customers', 'k').value, 'B');
  assert.equal(m.reconciliationQueue.length, 0);
});

test('memory: stale facts and scope violations are refused', () => {
  let now = Date.parse('2026-01-01');
  const m = new MemoryStore(freshOrg(), { now: () => now });
  m.put('sales', { namespace: 'semantic.customers', key: 'k', value: 1, source: 's', ttlDays: 30 });
  now += 31 * 86_400_000;
  assert.throws(() => m.getForDecision('sales', 'semantic.customers', 'k'), /stale/);
  assert.throws(() => m.put('sales', { namespace: 'financial.model', key: 'k', value: 1, source: 's' }), /no write access/);
});
