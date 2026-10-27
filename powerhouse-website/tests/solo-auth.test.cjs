const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createAuthHandler } = require('../api/solo-auth.js');
const { HttpError } = require('../lib/solo-customer-access.cjs');

const ORIGIN = 'https://solo-preview.example';
const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const ACCESS = 'dummy-access-token-for-tests';
const REFRESH = 'dummy-refresh-token-for-tests';
const IDENTITY = { userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002', user: { email: 'pilot@example.test' } };
const SESSION = { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 };
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_AUTH_ENABLED: 'true',
  SOLO_CUSTOMER_CHAT_ENABLED: 'true', SOLO_SUPABASE_URL: SUPABASE,
  SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const login = { action: 'login', email: ' pilot@example.test ', password: ' test password ' };

function setup(overrides = {}) {
  const calls = [];
  const handler = createAuthHandler({ env: { ...ENV },
    fetcher: async (url, options) => { calls.push({ url, options }); return response(SESSION); },
    verify: async (token) => { assert.equal(token, ACCESS); return IDENTITY; },
    status: async (identity) => { assert.equal(identity, IDENTITY); return { active: true, code: 'active', remaining_daily: 19, daily_limit: 20 }; },
    ...overrides });
  return { calls, async request({ method = 'POST', body = login, headers = {}, chunks } = {}) {
    const req = Readable.from(chunks || []);
    req.method = method;
    req.headers = { host: 'solo-preview.example', origin: ORIGIN, 'content-type': 'application/json', ...headers };
    req.body = chunks === undefined ? body : undefined;
    let result;
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      end(value) { result = { status: this.statusCode, body: JSON.parse(value), headers: this.headers }; } };
    await handler(req, res);
    assert.ok(result, 'handler completes a JSON response');
    assert.equal(result.headers['Cache-Control'], 'no-store, private');
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    return result;
  } };
}

test('production and disabled preview never contact account services', async () => {
  for (const env of [{ ...ENV, VERCEL_ENV: 'production' }, { ...ENV, SOLO_CUSTOMER_AUTH_ENABLED: 'false' }, {}]) {
    const api = setup({ env });
    const state = await api.request({ method: 'GET', headers: { cookie: '__Host-solo-access=' + ACCESS } });
    assert.equal(state.status, 200);
    assert.deepEqual(state.body, { enabled: false, authenticated: false, chatEnabled: false });
    assert.equal((await api.request()).status, 503);
    assert.equal(api.calls.length, 0);
  }
});

test('unsupported methods are explicit and never contact Auth', async () => {
  const api = setup();
  const result = await api.request({ method: 'DELETE' });
  assert.equal(result.status, 405);
  assert.equal(result.headers.Allow, 'GET, POST');
  assert.equal(api.calls.length, 0);
});

test('account mutations require exact HTTPS Origin before parsing or Auth', async () => {
  const api = setup();
  for (const origin of [undefined, 'null', 'http://solo-preview.example', 'https://attacker.example', ORIGIN + '/']) {
    assert.equal((await api.request({ headers: { origin } })).status, 403);
  }
  assert.equal((await api.request({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal(api.calls.length, 0);
});

test('signed-out status is local; expired access cookie signals one refresh', async () => {
  const api = setup({ verify: async () => assert.fail('No access token'), status: async () => assert.fail('No identity') });
  const state = await api.request({ method: 'GET', headers: { origin: undefined } });
  assert.equal(state.status, 200);
  assert.deepEqual(state.body, { enabled: true, authenticated: false, chatEnabled: false });
  const expired = await api.request({ method: 'GET', headers: { cookie: '__Host-solo-refresh=' + REFRESH } });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.code, 'session_expired');
  assert.equal(api.calls.length, 0);
});

test('login verifies account and membership before issuing secure cookies', async () => {
  const api = setup();
  const result = await api.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.authenticated, true);
  assert.equal(result.body.chatEnabled, true);
  assert.deepEqual(result.body.user, { id: IDENTITY.userId, email: IDENTITY.user.email });
  assert.deepEqual(result.body.usage, { remaining_daily: 19, daily_limit: 20 });
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { email: 'pilot@example.test', password: ' test password ' });
  assert.equal(api.calls[0].options.headers.apikey, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(api.calls[0].options.headers.Authorization, undefined);
  assert.equal(api.calls[0].options.redirect, 'error');
  for (const cookie of result.headers['Set-Cookie']) {
    assert.match(cookie, /^__Host-solo-(access|refresh)=/);
    assert.match(cookie, /; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
    assert.doesNotMatch(cookie, /Domain=/i);
  }
  assert.match(result.headers['Set-Cookie'][0], /Max-Age=3600/);
  assert.match(result.headers['Set-Cookie'][1], /Max-Age=2592000/);
  const json = JSON.stringify(result.body);
  for (const secret of [ACCESS, REFRESH, login.password, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY]) assert.equal(json.includes(secret), false);
});

test('verified status exposes only identity and quota, and respects chat-off flag', async () => {
  const api = setup({ env: { ...ENV, SOLO_CUSTOMER_CHAT_ENABLED: 'false' } });
  const state = await api.request({ method: 'GET', headers: { cookie: '__Host-solo-access=' + ACCESS } });
  assert.equal(state.status, 200);
  assert.equal(state.body.authenticated, true);
  assert.equal(state.body.chatEnabled, false);
  assert.equal(api.calls.length, 0);
});

test('denied membership revokes the newly issued session and never sets auth cookies', async () => {
  const api = setup({ status: async () => { throw new HttpError(403, 'access_denied', 'No preview access.'); } });
  const result = await api.request();
  assert.equal(result.status, 403);
  assert.equal(result.body.authenticated, false);
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].url, SUPABASE + '/auth/v1/logout?scope=local');
  assert.equal(api.calls[1].options.headers.Authorization, 'Bearer ' + ACCESS);
});

test('membership outage also prevents cookie issuance even if revocation fails', async () => {
  let attempts = 0;
  const api = setup({ status: async () => { throw new HttpError(503, 'usage_unavailable', 'Usage unavailable.'); },
    fetcher: async () => { if (++attempts === 1) return response(SESSION); throw new Error('private upstream details'); } });
  const result = await api.request();
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'usage_unavailable');
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.equal(attempts, 2);
});

test('refresh rotates both HttpOnly cookies after current membership verification', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'refresh' }, headers: { cookie: '__Host-solo-refresh=' + REFRESH } });
  assert.equal(result.status, 200);
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { refresh_token: REFRESH });
  assert.equal(result.headers['Set-Cookie'].length, 2);
  assert.equal(JSON.stringify(result.body).includes(REFRESH), false);
});

test('missing, duplicated or malformed refresh cookie fails without upstream request', async () => {
  const api = setup();
  for (const cookie of ['', '__Host-solo-refresh=%', '__Host-solo-refresh=', '__Host-solo-refresh=bad%20token',
    '__Host-solo-refresh=' + REFRESH + '; __Host-solo-refresh=second']) {
    const result = await api.request({ body: { action: 'refresh' }, headers: { cookie } });
    assert.equal(result.status, 401);
    assert.ok(result.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
  }
  assert.equal(api.calls.length, 0);
});

test('invalid refresh credentials clear cookies and sanitize upstream account details', async () => {
  const api = setup({ fetcher: async () => response({ error: 'internal-refresh-token-value' }, 400) });
  const result = await api.request({ body: { action: 'refresh' }, headers: { cookie: '__Host-solo-refresh=' + REFRESH } });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'invalid_credentials');
  assert.ok(result.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
  assert.equal(JSON.stringify(result.body).includes('internal-refresh'), false);
});

test('logout revokes the server session before reporting success and clears cookies', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'logout' }, headers: { cookie: '__Host-solo-access=' + ACCESS + '; __Host-solo-refresh=' + REFRESH } });
  assert.equal(result.status, 200);
  assert.equal(result.body.authenticated, false);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/logout?scope=local');
  assert.equal(api.calls[0].options.headers.Authorization, 'Bearer ' + ACCESS);
  assert.ok(result.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
});

test('logout with expired access rotates the existing refresh only to revoke it', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'logout' }, headers: { cookie: '__Host-solo-refresh=' + REFRESH } });
  assert.equal(result.status, 200);
  assert.equal(api.calls.length, 2);
  assert.match(api.calls[0].url, /grant_type=refresh_token$/);
  assert.match(api.calls[1].url, /logout\?scope=local$/);
  assert.equal(api.calls[1].options.headers.Authorization, 'Bearer ' + ACCESS);
  assert.ok(result.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
});

test('logout retries a rejected old access token via refresh then revokes once', async () => {
  const sequence = [];
  const api = setup({ fetcher: async (url, options) => {
    sequence.push({ url, options });
    return sequence.length === 1 ? response({}, 401) : response(SESSION);
  } });
  const result = await api.request({ body: { action: 'logout' }, headers: { cookie: '__Host-solo-access=' + ACCESS + '; __Host-solo-refresh=' + REFRESH } });
  assert.equal(result.status, 200);
  assert.equal(sequence.length, 3);
  assert.match(sequence[0].url, /logout/);
  assert.match(sequence[1].url, /grant_type=refresh_token/);
  assert.match(sequence[2].url, /logout/);
});

test('failed revocation clears local cookies but never claims successful server logout', async () => {
  const api = setup({ fetcher: async () => { throw new Error('secret server failure'); } });
  const result = await api.request({ body: { action: 'logout' }, headers: { cookie: '__Host-solo-access=' + ACCESS } });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'auth_unavailable');
  assert.ok(result.headers['Set-Cookie'].every(value => value.includes('Max-Age=0')));
  assert.doesNotMatch(JSON.stringify(result.body), /secret server failure/);
});

test('JSON shape, MIME and actual UTF-8 body limits apply before any Auth request', async () => {
  const api = setup();
  assert.equal((await api.request({ headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await api.request({ headers: { 'content-type': 'application/json-extra' } })).status, 415);
  for (const body of [null, [], 'false', '{', { action: 'signup' }, { action: 'login', email: 'bad', password: 'test' }]) {
    assert.equal((await api.request({ body })).status, 400);
  }
  const oversized = JSON.stringify({ ...login, extra: '界'.repeat(3000) });
  for (const options of [{ body: oversized }, { body: Buffer.from(oversized) }, { body: JSON.parse(oversized) }, { chunks: [Buffer.from(oversized)] }]) {
    assert.equal((await api.request({ ...options, headers: { 'content-length': '1' } })).status, 413);
  }
  assert.equal(api.calls.length, 0);
});

test('unknown, invalid and redirected upstream auth failures are safe and non-cacheable', async () => {
  for (const code of [400, 401, 403, 422, 429, 500, 302]) {
    const api = setup({ fetcher: async () => response({ error: 'account exists; private detail ' + ACCESS }, code) });
    const result = await api.request();
    assert.equal(result.status, code === 429 ? 429 : code >= 400 && code < 429 ? 401 : 503);
    assert.equal(result.body.authenticated, false);
    assert.equal(result.headers['Set-Cookie'], undefined);
    assert.doesNotMatch(JSON.stringify(result.body), /account exists|private detail|dummy-access/);
    if (code === 429) assert.equal(result.headers['Retry-After'], '60');
  }
});

test('invalid Auth sessions do not issue cookies or contact membership storage', async () => {
  for (const session of [{}, { ...SESSION, access_token: 'injected\r\n' }, { ...SESSION, refresh_token: null }, { ...SESSION, expires_in: -1 }, { ...SESSION, expires_in: '3600' }]) {
    const api = setup({ fetcher: async () => response(session), status: async () => assert.fail('Invalid session') });
    const result = await api.request();
    assert.equal(result.status, 503);
    assert.equal(result.headers['Set-Cookie'], undefined);
  }
});

test('misconfigured origin or publishable key cannot send a password to another endpoint', async () => {
  for (const env of [{ ...ENV, SOLO_SUPABASE_URL: 'https://attacker.example' }, { ...ENV, SOLO_SUPABASE_URL: SUPABASE + '/wrong' },
    { ...ENV, SOLO_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' }, { ...ENV, SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' }]) {
    const api = setup({ env });
    assert.equal((await api.request()).status, 503);
    assert.equal(api.calls.length, 0);
  }
});

test('ambiguous account credentials are rejected before any session verification', async () => {
  const api = setup({ verify: async () => assert.fail('Ambiguous credentials') });
  for (const headers of [{ cookie: '__Host-solo-access=' + ACCESS, authorization: 'Bearer ' + ACCESS },
    { cookie: '__Host-solo-access=' + ACCESS + '; __Host-solo-access=' + ACCESS }]) {
    assert.equal((await api.request({ method: 'GET', headers })).status, 400);
  }
});
