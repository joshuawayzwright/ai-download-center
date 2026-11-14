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
  SOLO_NATIVE_AUTH_ENABLED: 'true', SOLO_PUBLIC_SIGNUP_ENABLED: 'true',
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
const ACCOUNT_PAGE = encodeURIComponent('https://thesoloserviceprovider.com.au/solo-ai-account.html');

test('status advertises sign-up only when its own switch and native sign-in are on', async () => {
  assert.equal((await setup().request({ method: 'GET' })).body.signupEnabled, true);
  const off = await setup({ env: { ...ENV, SOLO_PUBLIC_SIGNUP_ENABLED: 'false' } }).request({ method: 'GET' });
  assert.equal(off.body.signupEnabled, false);
  const signedIn = await setup({ status: async () => ({ active: true, code: 'active', tier: 'free', remaining_daily: 9, daily_limit: 10 }) })
    .request({ method: 'GET', headers: { ...NATIVE, authorization: 'Bearer ' + ACCESS } });
  assert.deepEqual(signedIn.body.usage, { remaining_daily: 9, daily_limit: 10, tier: 'free' });
  assert.equal(signedIn.body.signupEnabled, true);
});

test('sign-up validates, rate-limits, and asks Supabase to email a confirmation link', async () => {
  const api = setup({ reply: () => response({ id: 'x' }) });
  const result = await api.request({ body: { action: 'signup', email: ' New@Example.test ', password: 'correct horse battery' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { enabled: true, authenticated: false, chatEnabled: false, signupEnabled: true, signup: 'check_email' });
  assert.equal(result.body.session, undefined);
  assert.deepEqual(api.admissions, [{ email: 'New@Example.test', action: 'signup' }]);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/signup?redirect_to=' + ACCOUNT_PAGE);
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { email: 'New@Example.test', password: 'correct horse battery' });
  assert.equal(api.calls[0].options.headers.apikey, 'sb_publishable_dummy_only');
});

test('sign-up refuses bad input before any upstream call', async () => {
  for (const [body, code] of [[{ email: 'nope', password: 'long enough pw' }, 'invalid_email'],
    [{ email: 'a@b.test', password: 'short' }, 'weak_password'],
    [{ email: 'a@b.test', password: 'x'.repeat(73) }, 'weak_password'],
    [{ email: 'a@b.test', password: '界'.repeat(25) }, 'weak_password']]) {
    const api = setup();
    const result = await api.request({ body: { action: 'signup', ...body } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, code);
    assert.equal(api.calls.length + api.admissions.length, 0);
  }
});

test('sign-up is closed when its switch is off, and with native sign-in off', async () => {
  for (const env of [{ ...ENV, SOLO_PUBLIC_SIGNUP_ENABLED: 'false' }, { ...ENV, SOLO_PUBLIC_SIGNUP_ENABLED: undefined }]) {
    const api = setup({ env });
    const result = await api.request({ body: { action: 'signup', email: 'a@b.test', password: 'long enough pw' } });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'signup_disabled');
    assert.equal(api.calls.length, 0);
  }
  const native = setup({ env: { ...ENV, SOLO_NATIVE_AUTH_ENABLED: 'false' } });
  assert.equal((await native.request({ body: { action: 'signup', email: 'a@b.test', password: 'long enough pw' } })).status, 503);
});

test('sign-up maps Supabase errors and never reveals whether an address already has an account', async () => {
  const cases = [[{ error_code: 'weak_password' }, 422, 400, 'weak_password'],
    [{ error_code: 'email_address_invalid' }, 400, 400, 'invalid_email'],
    [{ error_code: 'over_email_send_rate_limit' }, 429, 429, 'auth_rate_limited'],
    [{ error_code: 'signup_disabled' }, 422, 503, 'signup_disabled'],
    [{ error_code: 'email_address_not_authorized' }, 400, 503, 'email_unavailable'],
    [{ error_code: 'user_already_exists' }, 422, 200, undefined]];
  for (const [data, upstream, status, code] of cases) {
    const api = setup({ reply: () => response(data, upstream) });
    const result = await api.request({ body: { action: 'signup', email: 'a@b.test', password: 'long enough pw' } });
    assert.equal(result.status, status, JSON.stringify(data));
    assert.equal(result.body.code, code);
    if (status === 200) assert.equal(result.body.signup, 'check_email');
  }
});

test('password reset requests are generic and rate-limited', async () => {
  const api = setup({ reply: () => response({}) });
  const result = await api.request({ body: { action: 'request_reset', email: 'a@b.test' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.reset, 'check_email');
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/recover?redirect_to=' + ACCOUNT_PAGE);
  assert.deepEqual(api.admissions, [{ email: 'a@b.test', action: 'request_reset' }]);
  const unknown = await setup({ reply: () => response({ error_code: 'user_not_found' }, 400) })
    .request({ body: { action: 'request_reset', email: 'a@b.test' } });
  assert.equal(unknown.status, 200);
  const limited = await setup({ reply: () => response({ error_code: 'over_email_send_rate_limit' }, 429) })
    .request({ body: { action: 'request_reset', email: 'a@b.test' } });
  assert.equal(limited.status, 429);
  const bad = await setup().request({ body: { action: 'request_reset', email: 'not-an-email' } });
  assert.equal(bad.status, 400);
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

test('the reset page sets a new password with the emailed session, web only', async () => {
  const api = setup({ reply: () => response({}) });
  const result = await api.request({ headers: WEB, body: { action: 'reset_password', access_token: ACCESS, password: 'brand new password' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.reset, 'done');
  assert.equal(api.calls[0].url, SUPABASE + '/auth/v1/user');
  assert.equal(api.calls[0].options.method, 'PUT');
  assert.equal(api.calls[0].options.headers.Authorization, 'Bearer ' + ACCESS);
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { password: 'brand new password' });
  assert.match(api.calls[1].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.deepEqual(api.admissions, [{ email: 'pilot@example.test', action: 'reset_password' }]);
  const native = await setup().request({ body: { action: 'reset_password', access_token: ACCESS, password: 'brand new password' } });
  assert.equal(native.status, 400);
  const expired = await setup({ verify: async () => { throw new HttpError(401, 'invalid_session', 'x'); } })
    .request({ headers: WEB, body: { action: 'reset_password', access_token: 'bad', password: 'brand new password' } });
  assert.equal(expired.body.code, 'reset_link_expired');
  const weak = await setup().request({ headers: WEB, body: { action: 'reset_password', access_token: ACCESS, password: 'short' } });
  assert.equal(weak.body.code, 'weak_password');
});
