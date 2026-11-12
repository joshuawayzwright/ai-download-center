const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createAuthHandler } = require('../api/solo-auth.js');
const { HttpError } = require('../lib/solo-customer-access.cjs');

const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const ACCESS = 'dummy-access-token-for-tests';
const REFRESH = 'dummy-refresh-token-for-tests';
const IDENTITY = { userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002', user: { email: 'pilot@example.test' } };
const SESSION = { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600,
  user: { id: IDENTITY.userId, email: IDENTITY.user.email } };
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_AUTH_ENABLED: 'true', SOLO_CUSTOMER_CHAT_ENABLED: 'true',
  SOLO_NATIVE_AUTH_ENABLED: 'true', SOLO_SUPABASE_URL: SUPABASE, SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const NATIVE = { host: 'solo-preview.example', 'content-type': 'application/json', 'x-solo-client': 'android' };

function setup(overrides = {}) {
  const calls = [];
  const admissions = [];
  const handler = createAuthHandler({ env: { ...ENV },
    fetcher: async (url, options) => { calls.push({ url, options }); return response(SESSION); },
    admit: async (req, attempt) => { admissions.push(attempt); },
    verify: async token => { assert.equal(token, ACCESS); return IDENTITY; },
    freshIdentity: () => IDENTITY,
    status: async () => ({ active: true, code: 'active', remaining_daily: 19, daily_limit: 20 }),
    ...overrides });
  return { calls, admissions, async request({ method = 'POST', body, headers = NATIVE } = {}) {
    const req = Readable.from([]);
    req.method = method;
    req.url = '/api/solo-auth';
    req.headers = { ...headers };
    req.body = body;
    let result;
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      end(value) { result = { status: this.statusCode, body: JSON.parse(value), headers: this.headers }; } };
    await handler(req, res);
    assert.ok(result);
    assert.equal(result.headers['Cache-Control'], 'no-store, private');
    return result;
  } };
}

test('native login returns tokens in the body, never cookies, after admission and membership checks', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'login', email: 'pilot@example.test', password: 'long password here' } });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.deepEqual(result.body.session, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, token_type: 'bearer' });
  assert.equal(result.body.authenticated, true);
  assert.equal(result.body.chatEnabled, true);
  assert.deepEqual(api.admissions, [{ email: 'pilot@example.test', action: 'login' }]);
  assert.match(api.calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
});

test('native sign-in has its own switch, separate from web sign-in', async () => {
  const api = setup({ env: { ...ENV, SOLO_NATIVE_AUTH_ENABLED: 'false' } });
  for (const action of ['login', 'refresh']) {
    const result = await api.request({ body: { action, email: 'pilot@example.test', password: 'x', refresh_token: REFRESH } });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'native_auth_disabled');
  }
  assert.equal(api.calls.length, 0);
  assert.equal(api.admissions.length, 0);
});

test('native requests are disabled with the account gate and in production without release approval', async () => {
  for (const env of [{ ...ENV, SOLO_CUSTOMER_AUTH_ENABLED: 'false' }, { ...ENV, VERCEL_ENV: 'production' }]) {
    const api = setup({ env });
    const result = await api.request({ body: { action: 'login', email: 'pilot@example.test', password: 'x' } });
    assert.equal(result.status, 503);
    assert.equal(api.calls.length, 0);
  }
});

test('native mode refuses browser context: Origin, cookies or another client name', async () => {
  for (const extra of [{ origin: 'https://solo-preview.example' }, { cookie: '__Host-solo-access=' + ACCESS }, { 'x-solo-client': 'web' }]) {
    const api = setup();
    const result = await api.request({ headers: { ...NATIVE, ...extra }, body: { action: 'login', email: 'pilot@example.test', password: 'x' } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'invalid_client');
    assert.equal(api.calls.length, 0);
  }
});

test('native refresh uses the refresh token from the body and returns a new session', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'refresh', refresh_token: REFRESH } });
  assert.equal(result.status, 200);
  assert.equal(result.body.session.refresh_token, REFRESH);
  assert.match(api.calls[0].url, /grant_type=refresh_token$/);
  assert.equal(JSON.parse(api.calls[0].options.body).refresh_token, REFRESH);
  assert.equal(result.headers['Set-Cookie'], undefined);
});

test('native refresh without a usable token asks the app to sign in again', async () => {
  for (const refresh of [undefined, '', 'short', 'has space in it', 'x'.repeat(2049)]) {
    const api = setup();
    const result = await api.request({ body: { action: 'refresh', refresh_token: refresh } });
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'session_expired');
    assert.equal(api.calls.length, 0);
  }
});

test('a denied membership revokes the new native session and returns no tokens', async () => {
  const api = setup({ status: async () => { throw new HttpError(403, 'access_denied', 'This account does not have SOLO preview access.'); } });
  const result = await api.request({ body: { action: 'login', email: 'pilot@example.test', password: 'x' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.session, undefined);
  assert.ok(api.calls.some(call => /\/auth\/v1\/logout/.test(call.url)));
});

test('native logout revokes the bearer session, even when the native switch is off', async () => {
  const api = setup({ env: { ...ENV, SOLO_NATIVE_AUTH_ENABLED: 'false' } });
  const result = await api.request({ headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS }, body: { action: 'logout' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.authenticated, false);
  const logout = api.calls.find(call => /\/auth\/v1\/logout/.test(call.url));
  assert.equal(logout.options.headers.Authorization, 'Bearer ' + ACCESS);
  assert.equal(result.headers['Set-Cookie'], undefined);
});

test('native logout with only a refresh token revokes that same session', async () => {
  const api = setup();
  const result = await api.request({ body: { action: 'logout', refresh_token: REFRESH } });
  assert.equal(result.status, 200);
  assert.match(api.calls[0].url, /grant_type=refresh_token$/);
  assert.match(api.calls[1].url, /\/auth\/v1\/logout/);
});

test('native status uses the bearer token', async () => {
  const api = setup();
  const result = await api.request({ method: 'GET', headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS } });
  assert.equal(result.status, 200);
  assert.equal(result.body.authenticated, true);
  assert.equal(result.body.usage.remaining_daily, 19);
});

test('web requests are unchanged: cookies are set and no tokens appear in the body', async () => {
  const api = setup();
  const result = await api.request({ headers: { host: 'solo-preview.example', origin: 'https://solo-preview.example', 'content-type': 'application/json' },
    body: { action: 'login', email: 'pilot@example.test', password: 'x' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.session, undefined);
  assert.ok(Array.isArray(result.headers['Set-Cookie']));
});

test('native status reports disabled until native sign-in is switched on', async () => {
  const off = setup({ env: { ...ENV, SOLO_NATIVE_AUTH_ENABLED: 'false' } });
  const closed = await off.request({ method: 'GET' });
  assert.deepEqual(closed.body, { enabled: false, authenticated: false, chatEnabled: false });
  const on = await setup().request({ method: 'GET' });
  assert.deepEqual(on.body, { enabled: true, authenticated: false, chatEnabled: false });
});
