const test = require('node:test');
const assert = require('node:assert/strict');
const { runSmoke, validateTarget } = require('../scripts/solo-private-smoke.cjs');
const target = 'https://solo-provider-industrial-abc123xyz-wrightwayz.vercel.app';
const token = 'unit-test-token-only-0123456789abcdefghijklmnopqrstuvwxyz';
const env = { VERCEL_ENV: 'preview', SOLO_PRIVATE_TEST_ENABLED: 'true',
  SOLO_PRIVATE_TEST_TOKEN: token, SOLO_SMOKE_TARGET_URL: target + '/?_vercel_share=unit-share' };
const response = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers }
});

test('smoke refuses production and unapproved destinations before sending any token', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error('must not fetch'); };
  await assert.rejects(runSmoke({ env: { ...env, VERCEL_ENV: 'production' }, fetcher }), /PREVIEW_ONLY/);
  await assert.rejects(runSmoke({ env: { ...env, SOLO_SMOKE_TARGET_URL: 'https://attacker.invalid' }, fetcher }), /TARGET_NOT_SOLO_PREVIEW/);
  await assert.rejects(runSmoke({ env: { ...env, SOLO_PRIVATE_TEST_ENABLED: 'false' }, fetcher }), /PRIVATE_GATE_REQUIRED/);
  assert.equal(calls, 0);
  assert.throws(() => validateTarget(target + '/?key=secret'), /TARGET_QUERY_NOT_ALLOWED/);
});

test('smoke stops at an off-origin access redirect without forwarding credentials', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 307, headers: { Location: 'https://attacker.invalid/' } });
  };
  await assert.rejects(runSmoke({ env, fetcher }), /ACCESS_CROSS_ORIGIN_REDIRECT/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['x-solo-test-token'], undefined);
});

test('smoke validates real API-shaped responses and two-turn context without logging secrets', async () => {
  const logs = [];
  let providerCalls = 0;
  let accessCalls = 0;
  const fetcher = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, target);
    assert.equal(options.redirect, 'manual');
    if (url.pathname === '/') {
      assert.equal(options.headers['x-solo-test-token'], undefined);
      if (++accessCalls === 1) return new Response(null, {
        status: 307, headers: { Location: '/', 'Set-Cookie': 'test-access=cookie-value; Secure; HttpOnly' }
      });
      assert.equal(options.headers.Cookie, 'test-access=cookie-value');
      return response(200, {});
    }
    assert.equal(url.pathname, '/api/solo-chat');
    assert.equal(url.search, '');
    assert.equal(options.headers.Cookie, 'test-access=cookie-value');
    if (options.method === 'GET') return response(405, { error: 'Method not allowed' });
    if (options.headers.Origin !== target) return response(403, { error: 'Origin rejected' });
    if (options.headers['x-solo-test-token'] !== token) return response(401, { error: 'Private access required' });
    const body = JSON.parse(options.body);
    if (Buffer.byteLength(options.body) > 16000) return response(413, { error: 'Too large' });
    providerCalls++;
    const marker = body.messages[0].content.match(/SOLO-[a-f0-9]+/)[0];
    return response(200, { provider: 'gemini', model: 'gemini-3.5-flash-lite',
      reply: providerCalls === 1 ? 'READY' : marker });
  };
  const result = await runSmoke({ env, fetcher, log: line => logs.push(line) });
  assert.equal(result.checks, 7);
  assert.equal(providerCalls, 2);
  assert.equal(logs.at(-1), 'SOLO_DEPLOYED_CHAT_E2E_PASS');
  const output = logs.join('\n');
  for (const secret of [token, 'unit-share', 'cookie-value', 'READY']) assert.ok(!output.includes(secret));
  assert.doesNotMatch(output, /SOLO-[a-f0-9]+/);
});

test('provider failures cannot produce a passing smoke result', async () => {
  const logs = [];
  const fetcher = async (input, options) => {
    const url = new URL(input);
    if (url.pathname === '/') return response(200, {});
    if (options.method === 'GET') return response(405, { error: 'Method not allowed' });
    if (options.headers.Origin !== target) return response(403, { error: 'Origin rejected' });
    if (options.headers['x-solo-test-token'] !== token) return response(401, { error: 'Private access required' });
    if (Buffer.byteLength(options.body) > 16000) return response(413, { error: 'Too large' });
    return response(502, { error: 'Provider unavailable', upstreamStatus: 429 });
  };
  await assert.rejects(runSmoke({ env, fetcher, log: line => logs.push(line) }), /GEMINI_FIRST_TURN_HTTP_502/);
  assert.ok(logs.some(line => line.includes('"upstreamStatus":429')));
  assert.ok(!logs.includes('SOLO_DEPLOYED_CHAT_E2E_PASS'));
});
