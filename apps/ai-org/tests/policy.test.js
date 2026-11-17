import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, Controls } from '../src/policy.js';
import { freshOrg } from './helpers.js';

const setup = (confirmed = true) => {
  const org = freshOrg({ confirmed });
  return { org, controls: new Controls(org) };
};

test('T0 and T1 actions are allowed without approval', () => {
  const { org, controls } = setup();
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'draft' }).decision, 'allow');
  assert.equal(evaluate(org, controls, { agent: 'eng', type: 'open_pull_request' }).decision, 'allow');
});

test('external output needs compliance approval', () => {
  const { org, controls } = setup();
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'publish_content' }).decision, 'deny');
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'publish_content', compliance: { status: 'approved' } }).decision, 'allow');
});

test('unconfirmed board envelope routes every T2+ action to the board', () => {
  const { org, controls } = setup(false);
  const r = evaluate(org, controls, { agent: 'marketing', type: 'publish_content', compliance: { status: 'approved' } });
  assert.equal(r.decision, 'needs_approval');
  assert.deepEqual(r.missing, ['board']);
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'draft' }).decision, 'allow');
});

test('author cannot merge their own pull request', () => {
  const { org, controls } = setup();
  assert.equal(evaluate(org, controls, { agent: 'eng', type: 'merge_pull_request', author: 'eng' }).decision, 'deny');
  assert.equal(evaluate(org, controls, { agent: 'cto', type: 'merge_pull_request', author: 'eng' }).decision, 'allow');
});

test('spend above per-action cap escalates to T3 with CFO co-sign', () => {
  const { org, controls } = setup();
  const r = evaluate(org, controls, { agent: 'marketing', type: 'ad_spend', spendUsd: 40 });
  assert.equal(r.tier, 'T3');
  assert.ok(r.missing.includes('cfo'));
  assert.ok(r.missing.includes('cmo'), 'owning exec must also approve');
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'ad_spend', spendUsd: 40, approvals: ['cfo', 'cmo'] }).decision, 'allow');
});

test('monthly cap is enforced across actions', () => {
  const { org, controls } = setup();
  controls.recordSpend('marketing', 50);
  const r = evaluate(org, controls, { agent: 'marketing', type: 'ad_spend', spendUsd: 20 });
  assert.equal(r.tier, 'T3');
  assert.ok(r.reasons.includes('monthly cap would be exceeded'));
});

test('large spend and long commitments are T4 board decisions', () => {
  const { org, controls } = setup();
  assert.deepEqual(evaluate(org, controls, { agent: 'ops', type: 'vendor_contract', spendUsd: 900 }).missing, ['board']);
  assert.equal(evaluate(org, controls, { agent: 'ops', type: 'vendor_contract', spendUsd: 10, commitmentMonths: 24 }).tier, 'T4');
});

test('discount above limit needs CFO; sales cannot change prices', () => {
  const { org, controls } = setup();
  assert.ok(evaluate(org, controls, { agent: 'sales', type: 'discount', discount: 0.2 }).missing.includes('cfo'));
  assert.equal(evaluate(org, controls, { agent: 'sales', type: 'discount', discount: 0.1 }).decision, 'allow');
  assert.equal(evaluate(org, controls, { agent: 'sales', type: 'price_change' }).decision, 'deny');
});

test('CFO cannot co-sign their own spend; the CEO does', () => {
  const { org, controls } = setup();
  const r = evaluate(org, controls, { agent: 'cfo', type: 'vendor_contract', spendUsd: 50 });
  assert.ok(!r.required.includes('cfo'));
  assert.ok(r.required.includes('ceo'));
});

test('untrusted-content triggers are denied until verified', () => {
  const { org, controls } = setup();
  const base = { agent: 'support', type: 'external_comm', compliance: { status: 'approved' }, untrustedTrigger: true };
  assert.equal(evaluate(org, controls, base).decision, 'deny');
  assert.equal(evaluate(org, controls, { ...base, verified: true }).decision, 'allow');
});

test('kill switches: L1 pause, L2 external freeze, L3 spend freeze, L4 full stop', () => {
  const { org, controls } = setup();
  controls.trigger('L1', 'cmo', { target: 'marketing' });
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'create_task' }).decision, 'deny');
  assert.equal(evaluate(org, controls, { agent: 'marketing', type: 'draft' }).decision, 'allow', 'read-only work continues');
  controls.release('L1', 'cmo', { target: 'marketing' });

  controls.trigger('L2', 'risk');
  assert.equal(evaluate(org, controls, { agent: 'support', type: 'external_comm', compliance: { status: 'approved' } }).decision, 'deny');
  assert.equal(evaluate(org, controls, { agent: 'eng', type: 'open_pull_request' }).decision, 'allow');
  assert.throws(() => controls.release('L2', 'cmo'), /only board or risk/);
  controls.release('L2', 'risk');

  controls.trigger('L4', 'board');
  assert.equal(evaluate(org, controls, { agent: 'eng', type: 'open_pull_request' }).decision, 'deny');
});

test('only authorized roles can trigger kill switches', () => {
  const { controls } = setup();
  assert.throws(() => controls.trigger('L4', 'cmo'), /may not trigger/);
  assert.throws(() => controls.trigger('L1', 'cmo', { target: 'eng' }), /may not trigger/);
});

test('auto triggers fire on spend and error anomalies', () => {
  const { controls } = setup();
  const fired = controls.autoTriggers({ dailySpendUsd: 50, forecastDailySpendUsd: 10, errorRate: 0.2 });
  assert.deepEqual(fired.map((f) => f.level).sort(), ['L2', 'L3']);
  assert.ok(controls.levels.has('L3'));
});
