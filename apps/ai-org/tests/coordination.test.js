import test from 'node:test';
import assert from 'node:assert/strict';
import { Bus, validateMessage } from '../src/bus.js';
import { resolveConflict, commonManager } from '../src/conflict.js';
import { evaluateGate, checkKillCriteria } from '../src/lifecycle.js';
import { freshOrg } from './helpers.js';

const request = (over = {}) => ({
  id: 'r1', type: 'decision_request', from: 'sales', to: ['cfo'], subject: 'Approve 20% discount', tier: 'T3',
  options: [{ id: 'A' }, { id: 'B' }], recommendation: 'A', confidence: 0.7,
  deadline: '2026-11-18T00:00:00Z', evidence: [{ kind: 'crm_record', ref: 'deal/1' }], ...over,
});

test('decision requests are schema-checked', () => {
  const org = freshOrg();
  assert.deepEqual(validateMessage(org, request()), []);
  const errs = validateMessage(org, request({ evidence: [], recommendation: 'Z', confidence: 2 })).join('\n');
  assert.match(errs, /evidence/);
  assert.match(errs, /recommendation/);
  assert.match(errs, /confidence/);
});

test('responses resolve a request; all addressees must approve', () => {
  const bus = new Bus(freshOrg());
  bus.send(request({ to: ['cfo', 'cmo'] }));
  assert.equal(bus.respond('r1', 'cfo', { approve: true }).resolved, false);
  const r = bus.respond('r1', 'cmo', { approve: false });
  assert.equal(r.resolved, true);
  assert.equal(r.approved, false);
  assert.throws(() => bus.respond('r1', 'cfo', { approve: true }), /no pending/);
});

test('silence is not approval: overdue requests escalate one level up', () => {
  const bus = new Bus(freshOrg());
  bus.send(request());
  const esc = bus.tick(Date.parse('2026-11-19T00:00:00Z'));
  assert.equal(esc.length, 1);
  assert.deepEqual(esc[0].to, ['ceo']);
  assert.match(esc[0].body, /NOT approved/);
});

test('conflict: veto holder in domain blocks; only the board can override', () => {
  const r = resolveConflict(freshOrg(), {
    parties: [{ agent: 'marketing', option: 'post', evidence: ['e'] }, { agent: 'sales', option: 'hold', evidence: ['e'] }],
    objections: [{ agent: 'clo', domain: 'legal' }],
  });
  assert.equal(r.outcome, 'blocked_by_veto');
  assert.equal(r.overridableBy, 'board');
});

test('conflict: cheap testable disputes run a test; otherwise common manager or reversibility', () => {
  const org = freshOrg();
  const parties = [
    { agent: 'marketing', option: 'seo', evidence: ['e'], reversibility: 0.9 },
    { agent: 'sales', option: 'outbound', evidence: ['e'], reversibility: 0.4 },
  ];
  assert.equal(resolveConflict(org, { parties, testable: true, testCostUsd: 20 }).outcome, 'run_test');
  assert.equal(commonManager(org, 'marketing', 'sales'), 'cmo');
  assert.equal(commonManager(org, 'marketing', 'eng'), 'ceo');
  const m = resolveConflict(org, { parties, managerDecision: 'outbound' });
  assert.equal(m.decidedBy, 'cmo');
  assert.deepEqual(m.dissent, ['marketing']);
  assert.equal(resolveConflict(org, { parties }).option, 'seo');
});

test('conflict: a position without evidence loses', () => {
  const r = resolveConflict(freshOrg(), {
    parties: [{ agent: 'marketing', option: 'a', evidence: [] }, { agent: 'sales', option: 'b', evidence: ['e'] }],
  });
  assert.equal(r.option, 'b');
});

test('stage gates require the designated independent evaluator', () => {
  const wf = freshOrg().workflows.get('venture-lifecycle');
  assert.equal(evaluateGate(wf, 'validation', { evaluator: 'product', metrics: {} }).pass, false);
  const ok = evaluateGate(wf, 'validation', { evaluator: 'cfo', metrics: { landing_conversion: 0.08, ltv_to_cac: 4 } });
  assert.equal(ok.pass, true);
  assert.equal(ok.next, 'build');
  const veto = evaluateGate(wf, 'research', { evaluator: 'eval-lab', metrics: { sam_usd: 1e6, evidence_grade: 0.9, legal_blockers: 1 } });
  assert.equal(veto.vetoedBy, 'clo');
});

test('kill criteria fire only after the required consecutive periods', () => {
  const criteria = freshOrg().workflows.get('venture-lifecycle').kill_criteria_examples;
  assert.deepEqual(checkKillCriteria(criteria, [{ cac_usd: 300 }]), []);
  assert.deepEqual(checkKillCriteria(criteria, [{ cac_usd: 300 }, { cac_usd: 250 }]), [{ metric: 'cac_usd', action: 'pause_initiative' }]);
});
