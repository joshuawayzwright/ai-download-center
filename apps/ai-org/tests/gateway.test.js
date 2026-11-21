import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, CONNECTORS, buildRequest, executionPlan, policyActionFor, summarizeResult, canonical, RUN_OPTION } from '../src/gateway.js';
import { Controls, evaluate } from '../src/policy.js';
import { freshOrg } from './helpers.js';

const cfg = { stripe: { account: 'acct_test', livemode: false }, linear: { team: 'Growth' } };
const evidence = [{ kind: 'note', ref: 'test' }];
const now = new Date('2026-11-18T00:00:00Z');

const intents = {
  draft: { agent: 'support', kind: 'email.draft', params: { to: ['sponsor@example.com'], subject: 'Your listing', body: 'Hello' } },
  send: { agent: 'support', kind: 'email.send', params: { to: ['sponsor@example.com'], subject: 'Your listing', body: 'Hello' }, compliance: { status: 'approved' } },
  coupon: { agent: 'sales', kind: 'stripe.coupon', params: { percent_off: 10, duration: 'repeating', duration_in_months: 3, name: 'Launch 10' } },
  bigCoupon: { agent: 'sales', kind: 'stripe.coupon', params: { percent_off: 25, duration: 'once', name: 'Big' } },
  refund: { agent: 'support', kind: 'stripe.refund', params: { payment_intent: 'pi_123', amount: 9900, reason: 'requested_by_customer' } },
  crm: { agent: 'sales', kind: 'crm.update', params: { objectType: 'deals', objectId: 42, properties: { dealstage: 'closedwon' } } },
  task: { agent: 'eng', kind: 'task.create', params: { title: 'Fix search', priority: 2 } },
};

test('every action maps to a real policy type and a declared connector tool', () => {
  const org = freshOrg();
  for (const [kind, spec] of Object.entries(ACTIONS)) {
    assert.ok(org.policy.action_types[spec.policyType], `${kind}: unknown policy type ${spec.policyType}`);
    assert.ok(CONNECTORS[spec.connector], `${kind}: unknown connector`);
  }
  for (const i of Object.values(intents)) {
    const plan = ACTIONS[i.kind].call(i.params, cfg, 'r1');
    assert.equal(plan.server, CONNECTORS[ACTIONS[i.kind].connector].server);
    assert.ok(CONNECTORS[ACTIONS[i.kind].connector].tools.includes(plan.tool), `${i.kind} calls an undeclared tool`);
  }
});

test('parameters are validated before anything reaches policy', () => {
  const bad = [
    { kind: 'email.send', params: { to: ['not-an-email'], subject: 'x', body: 'y' } },
    { kind: 'email.send', params: { to: [], subject: 'x', body: 'y' } },
    { kind: 'stripe.coupon', params: { percent_off: 150, duration: 'once', name: 'x' } },
    { kind: 'stripe.coupon', params: { percent_off: 10, duration: 'repeating', name: 'x' } },
    { kind: 'stripe.refund', params: { payment_intent: 'ch_1', amount: 100, reason: 'requested_by_customer' } },
    { kind: 'stripe.refund', params: { payment_intent: 'pi_1', reason: 'requested_by_customer' } },
    { kind: 'crm.update', params: { objectType: 'notes', objectId: 1, properties: { a: 'b' } } },
    { kind: 'crm.update', params: { objectType: 'deals', objectId: 1, properties: { Deal_Stage: 'x' } } },
    { kind: 'task.create', params: { title: '' } },
    { kind: 'wire.transfer', params: {} },
  ];
  for (const b of bad) assert.ok(policyActionFor({ agent: 'sales', ...b }).errors.length > 0, JSON.stringify(b));
});

test('policy fields carry money and discounts into the policy engine', () => {
  assert.equal(policyActionFor(intents.coupon).action.discount, 0.1);
  assert.equal(policyActionFor(intents.refund).action.spendUsd, 99);
  const full = policyActionFor({ ...intents.refund, params: { payment_intent: 'pi_1', full_amount_usd: 99, reason: 'duplicate' } });
  assert.equal(full.action.spendUsd, 99);
});

test('buildRequest: allowed actions are ready, others pending, denied ones never filed', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  assert.equal(buildRequest(org, c, intents.task, { id: 't1', now, evidence }).status, 'ready');
  assert.equal(buildRequest(org, c, intents.draft, { id: 'd1', now, evidence }).status, 'ready');
  const big = buildRequest(org, c, intents.bigCoupon, { id: 'c1', now, evidence });
  assert.equal(big.status, 'pending');
  assert.equal(big.tier, 'T3');
  assert.equal(big.recommendation, RUN_OPTION);
  assert.throws(() => buildRequest(org, c, { ...intents.send, compliance: { status: 'pending' } }, { id: 's1', now, evidence }), /compliance/);
  assert.throws(() => buildRequest(org, c, intents.task, { id: 'bad id!', now, evidence }), /request id/);
  assert.throws(() => buildRequest(org, c, intents.task, { id: 't2', now, evidence: [] }), /evidence/);
});

test('unconfirmed limits send even a ready-looking email to the Board', () => {
  const org = freshOrg({ confirmed: false });
  const r = buildRequest(org, new Controls(org), intents.send, { id: 's1', now, evidence });
  assert.equal(r.status, 'pending');
});

test('executionPlan re-checks approvals, kill switches, run state and setup at run time', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  const pending = { id: 'c1', ...buildRequest(org, c, intents.bigCoupon, { id: 'c1', now, evidence }) };
  assert.match(executionPlan(org, c, cfg, pending).reasons.join(), /needs your approval/);

  const approved = { ...pending, status: 'approved', choice: RUN_OPTION, approvedExecution: canonical(pending.execution) };
  const ok = executionPlan(org, c, cfg, approved);
  assert.equal(ok.ok, true, ok.reasons.join());
  assert.equal(ok.call.input.stripe_api_operation_id, 'PostCoupons');
  assert.equal(ok.call.input.stripe_context, 'acct_test');
  assert.equal(ok.call.input.livemode, false);
  assert.equal(ok.call.input.parameters.metadata.org_request_id, 'c1');

  assert.equal(executionPlan(org, c, cfg, { ...approved, choice: 'hold' }).ok, false);
  assert.equal(executionPlan(org, c, cfg, { ...approved, status: 'denied' }).ok, false);
  assert.match(executionPlan(org, c, cfg, { ...approved, run: { state: 'done' } }).reasons.join(), /already run/);
  assert.match(executionPlan(org, c, cfg, { ...approved, run: { state: 'unknown' } }).reasons.join(), /may have gone through/);
  assert.match(executionPlan(org, c, { linear: {} }, approved).reasons.join(), /Stripe account/);

  const frozen = Controls.fromState(org, { levels: ['L2'] });
  assert.match(executionPlan(org, frozen, cfg, approved).reasons.join(), /L2/);
  const paused = Controls.fromState(org, { paused: ['sales'] });
  assert.match(executionPlan(org, paused, cfg, approved).reasons.join(), /paused/);
});

test('a tampered request is re-validated, not trusted', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  const r = { id: 't1', ...buildRequest(org, c, intents.task, { id: 't1', now, evidence }) };
  const tampered = { ...r, execution: { kind: 'stripe.refund', params: { payment_intent: 'pi_1', amount: 900000, reason: 'duplicate' } } };
  const plan = executionPlan(org, c, cfg, tampered);
  assert.equal(plan.ok, false, 'a ready task cannot be swapped for a big refund');
  assert.match(plan.reasons.join(), /needs approval|board/);
});

test('Board approval covers missing co-signers but not denials', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  const v = evaluate(org, c, { agent: 'sales', type: 'discount', discount: 0.25, approvals: ['board'] });
  assert.equal(v.decision, 'allow');
  assert.equal(evaluate(org, c, { agent: 'sales', type: 'price_change', approvals: ['board'] }).decision, 'deny');
  assert.equal(evaluate(org, c, { agent: 'eng', type: 'merge_pull_request', author: 'eng', approvals: ['board'] }).decision, 'deny');
});

test('linear needs a team and HubSpot calls carry the confirmation', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  const t = { id: 't1', ...buildRequest(org, c, intents.task, { id: 't1', now, evidence }) };
  assert.match(executionPlan(org, c, { stripe: cfg.stripe, linear: { team: '' } }, t).reasons.join(), /Linear team/);
  assert.equal(executionPlan(org, c, cfg, t).call.input.team, 'Growth');
  const h = { id: 'h1', ...buildRequest(org, c, intents.crm, { id: 'h1', now, evidence }) };
  assert.equal(executionPlan(org, c, cfg, h).call.input.confirmationStatus, 'CONFIRMED');
});

test('summarizeResult extracts ids and spots Stripe confirmation links', () => {
  assert.equal(summarizeResult('task.create', { identifier: 'GRO-12', url: 'https://linear.app/x/GRO-12' }).id, 'GRO-12');
  const s = summarizeResult('stripe.coupon', { message: 'Approve at https://dashboard.stripe.com/approvals/apr_1' });
  assert.equal(s.needsApproval, true);
  assert.match(s.url, /approvals/);
  assert.equal(summarizeResult('email.send', { id: 'm1', threadId: 't' }).summary, 'Send an email from Gmail: done (m1)');
});

test('an approval is pinned to exactly what was approved', () => {
  const org = freshOrg({ confirmed: true });
  const c = new Controls(org);
  const r = { id: 'c1', ...buildRequest(org, c, intents.coupon, { id: 'c1', now, evidence }) };
  const approved = { ...r, status: 'approved', choice: RUN_OPTION, approvedExecution: canonical(r.execution) };
  assert.equal(executionPlan(org, c, cfg, approved).ok, true);
  const swapped = { ...approved, execution: { ...r.execution, params: { ...r.execution.params, percent_off: 90 } } };
  assert.match(executionPlan(org, c, cfg, swapped).reasons.join(), /changed after you approved/);
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
});
