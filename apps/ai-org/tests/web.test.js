import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb, BROWSER_MODULES } from '../scripts/build-web.js';
import { loadOrg, orgFromBundle, bundleFromOrg, validateOrg } from '../src/registry.js';
import { Controls, evaluate } from '../src/policy.js';

test('web build contains the app, a valid org bundle and only browser-safe modules', () => {
  const out = buildWeb(mkdtempSync(join(tmpdir(), 'web-')));
  for (const f of ['index.html', 'app.js', 'org.json']) assert.ok(readdirSync(out).includes(f), f);
  assert.deepEqual(readdirSync(join(out, 'lib')).sort(), [...BROWSER_MODULES].sort());
  for (const m of BROWSER_MODULES) assert.doesNotMatch(readFileSync(join(out, 'lib', m), 'utf8'), /from ['"]node:/, m);
  const org = orgFromBundle(JSON.parse(readFileSync(join(out, 'org.json'), 'utf8')));
  assert.deepEqual(validateOrg(org), []);
  assert.equal(org.agents.size, loadOrg().agents.size);
});

test('every module the app imports is shipped in the build', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  for (const [, m] of app.matchAll(/from '\.\/lib\/([\w-]+\.js)'/g)) assert.ok(BROWSER_MODULES.includes(m), m);
});

test('bundle round-trips the org', () => {
  const org = loadOrg();
  const again = orgFromBundle(JSON.parse(JSON.stringify(bundleFromOrg(org))));
  assert.deepEqual([...again.agents.keys()], [...org.agents.keys()]);
  assert.deepEqual(again.policy, org.policy);
});

test('kill-switch state survives storage and the board can use every switch', () => {
  const org = loadOrg();
  const c = new Controls(org);
  for (const l of ['L2', 'L3', 'L4']) c.trigger(l, 'board');
  c.trigger('L1', 'board', { target: 'sales' });
  const back = Controls.fromState(org, JSON.parse(JSON.stringify(c.toState())));
  assert.deepEqual(back.toState(), { levels: ['L2', 'L3', 'L4'], paused: ['sales'] });
  assert.equal(evaluate(org, back, { agent: 'eng', type: 'open_pull_request' }).decision, 'deny');
  const cleaned = Controls.fromState(org, { levels: ['L9', 'L1'], paused: ['nobody'] });
  assert.deepEqual(cleaned.toState(), { levels: [], paused: [] });
  back.release('L4', 'board');
  back.release('L1', 'board', { target: 'sales' });
  assert.deepEqual(back.toState(), { levels: ['L2', 'L3'], paused: [] });
});
