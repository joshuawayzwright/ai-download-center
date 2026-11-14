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
  SOLO_NATIVE_AUTH_ENABLED: 'true', SOLO_CUSTOMER_SIGNUP_ENABLED: 'true', SOLO_CUSTOMER_RECOVERY_ENABLED: 'true',
  SOLO_SUPABASE_SECRET_KEY: 'sb_secret_dummy_only', SOLO_SUPABASE_URL: SUPABASE, SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const NATIVE = { host: 'solo-preview.example', 'content-type': 'application/json', 'x-solo-client': 'android' };

function setup(overrides = {}) {
  const calls = [];
  const admissions = [];
  const { reply: _reply, ...rest } = overrides;
  const handler = createAuthHandler({ env: { ...ENV },
    fetcher: async (url, options) => { calls.push({ url, options }); return (overrides.reply || (() => response(SESSION)))(url, options); },
    admit: async (req, attempt) => { admissions.push(attempt); },
    verify: async token => { assert.equal(token, ACCESS); return IDENTITY; },
    freshIdentity: () => IDENTITY,
    status: async () => ({ active: true, code: 'active', remaining_daily: 19, daily_limit: 20 }),
    ...rest });
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


const WEB = { host: 'solo-preview.example', origin: 'https://solo-preview.example', 'content-type': 'application/json',
  'sec-fetch-site': 'same-origin' };

test('status advertises sign-up and reset only when solo-onboarding would accept them from the app', async () => {
  const on = (await setup().request({ method: 'GET' })).body;
  assert.equal(on.signupEnabled, true);
  assert.equal(on.recoveryEnabled, true);
  const off = await setup({ env: { ...ENV, SOLO_CUSTOMER_SIGNUP_ENABLED: 'false', SOLO_CUSTOMER_RECOVERY_ENABLED: undefined } }).request({ method: 'GET' });
  assert.equal(off.body.signupEnabled, false);
  assert.equal(off.body.recoveryEnabled, false);
  const signedIn = await setup({ status: async () => ({ active: true, code: 'active', tier: 'free', remaining_daily: 9, daily_limit: 10 }) })
    .request({ method: 'GET', headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS } });
  assert.deepEqual(signedIn.body.usage, { remaining_daily: 9, daily_limit: 10, tier: 'free' });
  assert.equal(signedIn.body.signupEnabled, true);
});

test('sign-up and reset are not account actions here; they live in solo-onboarding', async () => {
  for (const action of ['signup', 'request_reset', 'reset_password']) {
    const api = setup();
    const result = await api.request({ body: { action, email: 'a@b.test', password: 'long enough password' } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'invalid_action');
    assert.equal(api.calls.length, 0);
  }
});

test('an unconfirmed email gets a clear message instead of a credentials error', async () => {
  const api = setup({ reply: () => response({ error_code: 'email_not_confirmed' }, 400) });
  const result = await api.request({ body: { action: 'login', email: 'a@b.test', password: 'long enough pw' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'email_not_confirmed');
  const wrong = await setup({ reply: () => response({ error_code: 'invalid_credentials' }, 400) })
    .request({ body: { action: 'login', email: 'a@b.test', password: 'long enough pw' } });
  assert.equal(wrong.body.code, 'invalid_credentials');
});

test('account deletion needs confirmation and a verified session, then deletes with the server key', async () => {
  const unconfirmed = setup();
  assert.equal((await unconfirmed.request({ headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS }, body: { action: 'delete_account' } })).status, 400);
  const anonymous = setup();
  assert.equal((await anonymous.request({ body: { action: 'delete_account', confirm: 'DELETE' } })).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const api = setup({ reply: () => response({}) });
  const result = await api.request({ headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS }, body: { action: 'delete_account', confirm: 'DELETE' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, true);
  assert.equal(result.body.authenticated, false);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/admin/users/' + IDENTITY.userId);
  assert.equal(api.calls[0].options.method, 'DELETE');
  assert.equal(api.calls[0].options.headers.apikey, 'sb_secret_dummy_only');
  assert.equal(api.calls[0].options.headers.Authorization, undefined);
  const failed = await setup({ reply: () => response({}, 500) })
    .request({ headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS }, body: { action: 'delete_account', confirm: 'DELETE' } });
  assert.equal(failed.status, 503);
  const invalid = await setup({ verify: async () => { throw new HttpError(401, 'invalid_session', 'Please sign in again.'); } })
    .request({ headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS }, body: { action: 'delete_account', confirm: 'DELETE' } });
  assert.equal(invalid.status, 401);
});

