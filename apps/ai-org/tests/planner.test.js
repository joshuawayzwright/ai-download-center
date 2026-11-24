import test from 'node:test';
import assert from 'node:assert/strict';
import { planBatch, toWrites, MAX_PER_RUN } from '../src/planner.js';
import { freshOrg } from './helpers.js';

const now = new Date('2026-11-25T00:00:00Z');
const ev = [{ kind: 'note', ref: 'test' }];
const task = (id, title, agent = 'eng') => ({ id, agent, kind: 'task.create', params: { title }, subject: title, confidence: 0.6, evidence: ev });

test('files allowed intents as Board Console requests', () => {
  const plan = planBatch(freshOrg({ confirmed: true }), {}, [task('t1', 'Fix broken links')], [], { now });
  assert.equal(plan.file.length, 1);
  assert.equal(plan.file[0].request.status, 'ready');
  assert.equal(plan.file[0].request.filedBy, 'scheduled-run');
  assert.deepEqual(toWrites(plan)[0].collection, 'requests');
  assert.equal(toWrites(plan)[0].doc_id, 't1');
});

test('refunds, coupons and sent emails are never filed by a scheduled run', () => {
  const intents = [
    { id: 'r1', agent: 'support', kind: 'stripe.refund', params: { payment_intent: 'pi_1', amount: 100, reason: 'duplicate' }, evidence: ev },
    { id: 'c1', agent: 'sales', kind: 'stripe.coupon', params: { percent_off: 10, duration: 'once', name: 'x' }, evidence: ev },
    { id: 'e1', agent: 'support', kind: 'email.send', params: { to: ['a@example.com'], subject: 's', body: 'b' }, compliance: { status: 'approved' }, evidence: ev },
  ];
  const plan = planBatch(freshOrg({ confirmed: true }), {}, intents, [], { now });
  assert.equal(plan.file.length, 0);
  assert.equal(plan.skipped.length, 3);
  assert.match(plan.skipped[0].reason, /not allowed in a scheduled run/);
});

test('kill switches halt the run and paused agents are skipped', () => {
  const org = freshOrg({ confirmed: true });
  assert.match(planBatch(org, { levels: ['L2'] }, [task('t1', 'x')], [], { now }).halted, /L2/);
  assert.match(planBatch(org, { levels: ['L4'] }, [task('t1', 'x')], [], { now }).halted, /L4/);
  const plan = planBatch(org, { paused: ['eng'] }, [task('t1', 'x'), task('t2', 'y', 'ops')], [], { now });
  assert.deepEqual(plan.file.map((f) => f.id), ['t2']);
  assert.match(plan.skipped[0].reason, /paused/);
});

test('duplicates are skipped by id and by identical open action', () => {
  const org = freshOrg({ confirmed: true });
  const existing = [
    { id: 't1', status: 'ready', execution: { kind: 'task.create', params: { title: 'Old' } } },
    { id: 'old', status: 'pending', execution: { kind: 'task.create', params: { title: 'Same work' } } },
    { id: 'done', status: 'ready', run: { state: 'done' }, execution: { kind: 'task.create', params: { title: 'Finished work' } } },
  ];
  const plan = planBatch(org, {}, [task('t1', 'New'), task('t2', 'Same work'), task('t3', 'Finished work'), task('t3', 'Dup id')], existing, { now });
  assert.deepEqual(plan.file.map((f) => f.id), ['t3'], 'finished work can be filed again');
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['already filed', 'the same action is already open', 'already filed']);
});

test('at most MAX_PER_RUN requests per run; invalid intents are reported, not filed', () => {
  const org = freshOrg({ confirmed: true });
  const many = Array.from({ length: MAX_PER_RUN + 2 }, (_, i) => task(`t${i}`, `Task ${i}`));
  const plan = planBatch(org, {}, [task('bad', ''), ...many], [], { now });
  assert.equal(plan.file.length, MAX_PER_RUN);
  assert.match(plan.skipped[0].reason, /title is required/);
  assert.equal(plan.skipped.filter((s) => /run limit/.test(s.reason)).length, 2);
});
