import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrg, chainOfCommand, orgChart } from '../src/registry.js';
import { freshOrg } from './helpers.js';

test('shipped org configuration is valid', () => {
  assert.deepEqual(validateOrg(freshOrg()), []);
});

test('org includes every required role', () => {
  const org = freshOrg();
  for (const id of ['ceo', 'coo', 'cto', 'cmo', 'cfo', 'chro', 'clo', 'ops', 'product', 'sales', 'support', 'rnd']) {
    assert.ok(org.agents.has(id), `missing ${id}`);
  }
});

test('chain of command walks to the board', () => {
  assert.deepEqual(chainOfCommand(freshOrg(), 'sales'), ['cmo', 'ceo', 'board']);
});

test('validator catches cycles, T4 agents and owner-evaluated gates', () => {
  const org = freshOrg();
  org.agents.set('ceo', { ...org.agents.get('ceo'), reports_to: 'coo' });
  org.agents.set('ops', { ...org.agents.get('ops'), permissions: { ...org.agents.get('ops').permissions, max_tier: 'T4' } });
  const wf = structuredClone(org.workflows.get('venture-lifecycle'));
  wf.stages[0].evaluator = wf.stages[0].owner;
  org.workflows.set(wf.id, wf);
  const errors = validateOrg(org).join('\n');
  assert.match(errors, /reporting cycle/);
  assert.match(errors, /no agent may hold T4/);
  assert.match(errors, /owner cannot evaluate its own gate/);
});

test('validator rejects department caps above the board envelope', () => {
  const org = freshOrg();
  org.constitution.board.monthly_burn_cap_usd = 10;
  assert.match(validateOrg(org).join('\n'), /exceeds board burn cap/);
});

test('org chart renders every agent once', () => {
  const org = freshOrg();
  const chart = orgChart(org);
  for (const id of org.agents.keys()) assert.equal(chart.split('\n').filter((l) => l.includes(`── ${id} `)).length, 1, id);
});
