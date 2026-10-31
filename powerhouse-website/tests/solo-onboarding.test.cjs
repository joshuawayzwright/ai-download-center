const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createOnboardingHandler } = require('../api/solo-onboarding.js');
const { HttpError } = require('../lib/solo-customer-access.cjs');

const ORIGIN = 'https://solo-preview.example';
const PRODUCTION_ORIGIN = 'https://thesoloserviceprovider.com.au';
const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const EMAIL = 'pilot@example.test';
const PASSWORD = '  dummy password 123!  ';
const CODE = '012345';
const ACCESS = 'dummy-onboarding-access-token';
const REFRESH = 'dummy-onboarding-refresh-token';
const USER = { id: '00000000-0000-4000-8000-000000000001', email: EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false };
const IDENTITY = { userId: USER.id, sessionId: '00000000-0000-4000-8000-000000000002', user: USER };
const SESSION = { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, user: USER };
const SETTINGS = { disable_signup: false, external: { email: true }, mailer_autoconfirm: false };
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_AUTH_ENABLED: 'true',
  SOLO_CUSTOMER_SIGNUP_ENABLED: 'true', SOLO_CUSTOMER_RECOVERY_ENABLED: 'true',
  SOLO_SUPABASE_URL: SUPABASE, SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only' };
const BODIES = {
  signup: { action: 'signup', email: EMAIL, password: PASSWORD, acceptedTerms: true },
  verify_email: { action: 'verify_email', email: EMAIL, code: CODE },
  request_reset: { action: 'request_reset', email: EMAIL },
  reset_password: { action: 'reset_password', email: EMAIL, code: CODE, password: PASSWORD }
};
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function defaultReply(url, options) {
  const path = new URL(url).pathname;
  if (path === '/auth/v1/settings') return response(SETTINGS);
  if (path === '/auth/v1/signup') return response({ ...USER, email_confirmed_at: null });
  if (path === '/auth/v1/recover') return response({});
  if (path === '/auth/v1/verify') return response(SESSION);
  if (path === '/auth/v1/user' && options.method === 'PUT') return response(USER);
  if (path === '/auth/v1/logout') return response(null, 204);
  assert.fail('Unexpected endpoint; onboarding must not admit chat or grant membership: ' + path);
}

function setup(overrides = {}) {
  const calls = [];
  const admissions = [];
  const verifications = [];
  const events = [];
  const transport = overrides.fetcher || defaultReply;
  const verifier = overrides.verify || (async () => IDENTITY);
  const admitter = overrides.admit || (async () => {});
  const opts = { env: { ...ENV, ...overrides.env },
    fetcher: async (url, options) => {
      calls.push({ url, options }); events.push(new URL(url).pathname);
      return transport(url, options);
    },
    verify: async (token, options) => {
      verifications.push({ token, options }); events.push('verify-identity');
      return verifier(token, options);
    },
    admit: async (req, attempt, options) => {
      admissions.push({ attempt, options }); events.push('admit');
      return admitter(req, attempt, options);
    }
  };
  if (Object.hasOwn(overrides, 'admit') && overrides.admit === undefined) delete opts.admit;
  const handler = createOnboardingHandler(opts);
  return { calls, admissions, verifications, events,
    async request({ method = 'POST', body = BODIES.signup, headers = {}, chunks } = {}) {
      const req = Readable.from(chunks || []);
      req.method = method;
      req.headers = { host: 'solo-preview.example', origin: ORIGIN,
        'content-type': 'application/json', ...headers };
      req.body = chunks === undefined ? body : undefined;
      let result;
      const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
        end(value) { result = { status: this.statusCode, body: JSON.parse(value), headers: this.headers }; } };
      await handler(req, res);
      assert.ok(result, 'The endpoint completes a JSON response');
      assert.equal(result.headers['Cache-Control'], 'no-store, private');
      assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
      if (method === 'POST') assert.equal(result.body.ok, result.status >= 200 && result.status < 300);
      const visible = JSON.stringify(result);
      for (const secret of [ACCESS, REFRESH, PASSWORD, CODE, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY]) {
        assert.equal(visible.includes(secret), false, 'Response does not disclose submitted secrets or provider tokens');
      }
      return result;
    }
  };
}

function clearedCookies(result) {
  const cookies = result.headers['Set-Cookie'];
  assert.equal(cookies?.length, 2);
  assert.deepEqual(cookies.map(cookie => cookie.split('=', 1)[0]).sort(), ['__Host-solo-access', '__Host-solo-refresh']);
  for (const cookie of cookies) {
    assert.match(cookie, /^__Host-solo-(access|refresh)=; Max-Age=0; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  }
}

test('capabilities are local boolean flags and default closed without contacting account services', async () => {
  const api = setup();
  assert.deepEqual((await api.request({ method: 'GET', headers: { origin: undefined } })).body,
    { enabled: true, signupEnabled: true, recoveryEnabled: true });
  for (const env of [
    { SOLO_CUSTOMER_SIGNUP_ENABLED: undefined, SOLO_CUSTOMER_RECOVERY_ENABLED: undefined },
    { SOLO_CUSTOMER_AUTH_ENABLED: 'false' }, { VERCEL_ENV: 'development' }
  ]) {
    const closed = setup({ env });
    const state = await closed.request({ method: 'GET' });
    assert.equal(state.body.signupEnabled, false);
    assert.equal(state.body.recoveryEnabled, false);
    for (const body of Object.values(BODIES)) {
      const result = await closed.request({ body });
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'onboarding_disabled');
    }
    assert.equal(closed.calls.length + closed.admissions.length, 0);
  }
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('production onboarding requires its own release approval and exact commercial host', async () => {
  const headers = { host: 'thesoloserviceprovider.com.au', origin: PRODUCTION_ORIGIN };
  const closed = setup({ env: { VERCEL_ENV: 'production' } });
  assert.equal((await closed.request({ headers })).status, 503);
  assert.equal(closed.calls.length + closed.admissions.length, 0);
  const api = setup({ env: { VERCEL_ENV: 'production', SOLO_CUSTOMER_PRODUCTION_ENABLED: 'true' } });
  for (const host of ['solo-preview.example', 'www.thesoloserviceprovider.com.au', 'thesoloserviceprovider.com.au.attacker.test']) {
    assert.equal((await api.request({ headers: { host, origin: 'https://' + host } })).status, 503);
  }
  assert.equal(api.calls.length, 0);
  assert.equal((await api.request({ headers })).status, 202);
});

test('signup and recovery switches are independent of each other and the chat switch', async () => {
  for (const [flag, disabledActions, enabledAction] of [
    ['SOLO_CUSTOMER_SIGNUP_ENABLED', ['signup', 'verify_email'], 'request_reset'],
    ['SOLO_CUSTOMER_RECOVERY_ENABLED', ['request_reset', 'reset_password'], 'signup']
  ]) {
    const api = setup({ env: { [flag]: 'false', SOLO_CUSTOMER_CHAT_ENABLED: 'false' } });
    for (const action of disabledActions) assert.equal((await api.request({ body: BODIES[action] })).status, 503);
    assert.equal(api.calls.length + api.admissions.length, 0);
    assert.equal((await api.request({ body: BODIES[enabledAction] })).status, 202);
  }
});

test('all mutations require exact HTTPS origin and reject cross-site requests before admission', async () => {
  const api = setup();
  for (const origin of [undefined, 'null', 'http://solo-preview.example', ORIGIN + '/', 'https://attacker.example']) {
    assert.equal((await api.request({ headers: { origin } })).status, 403);
  }
  assert.equal((await api.request({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('unsupported methods and actions have explicit errors without admission', async () => {
  const api = setup();
  const method = await api.request({ method: 'DELETE' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.Allow, 'GET, POST');
  const action = await api.request({ body: { action: 'invite', email: EMAIL } });
  assert.equal(action.status, 400);
  assert.equal(action.body.code, 'invalid_action');
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('exact JSON MIME and a plain request shape are required before account operations', async () => {
  const api = setup();
  for (const type of ['text/plain', 'application/jsonp', 'application/json-extra', undefined]) {
    assert.equal((await api.request({ headers: { 'content-type': type } })).status, 415);
  }
  for (const body of [null, [], '[]', 'null', '{', 17, true]) {
    assert.equal((await api.request({ body })).status, 400);
  }
  for (const body of Object.values(BODIES)) {
    assert.equal((await api.request({ body: { ...body, role: 'service_role' } })).status, 400);
  }
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('actual UTF-8 body bytes are bounded for object, string, Buffer and streamed requests', async () => {
  const api = setup();
  const oversized = { ...BODIES.signup, password: '🙂'.repeat(2100) };
  const json = JSON.stringify(oversized);
  for (const body of [oversized, json, Buffer.from(json)]) {
    assert.equal((await api.request({ body, headers: { 'content-length': '1' } })).status, 413);
  }
  assert.equal((await api.request({ chunks: [Buffer.from(json).subarray(0, 100), Buffer.from(json).subarray(100)] })).status, 413);
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('email, terms and purpose-specific OTP validation block malformed or extra fields', async () => {
  const api = setup();
  for (const email of ['', 'no-at-sign', 'a@b c.test', {}, ['pilot@example.test']]) {
    assert.equal((await api.request({ body: { ...BODIES.signup, email } })).status, 400);
  }
  for (const acceptedTerms of [undefined, false, 'true', 1]) {
    const result = await api.request({ body: { ...BODIES.signup, acceptedTerms } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'terms_required');
  }
  for (const action of ['verify_email', 'reset_password']) {
    for (const code of ['12345', '12345678901', 123456, '123 456', 'abcdef', '１２３４５６']) {
      assert.equal((await api.request({ body: { ...BODIES[action], code } })).status, 400);
    }
  }
  assert.equal((await api.request({ body: { ...BODIES.request_reset, password: PASSWORD } })).status, 400);
  assert.equal(api.calls.length + api.admissions.length, 0);
});

test('password bounds count Unicode code points and preserve whitespace and split UTF-8 input', async () => {
  const api = setup();
  for (const password of ['a'.repeat(11), '🙂'.repeat(11), 'a'.repeat(129), '🙂'.repeat(129), null]) {
    assert.equal((await api.request({ body: { ...BODIES.signup, password } })).status, 400);
  }
  assert.equal(api.calls.length + api.admissions.length, 0);
  const password = '🙂'.repeat(12);
  const bytes = Buffer.from(JSON.stringify({ ...BODIES.signup, password }));
  const cut = bytes.indexOf(Buffer.from('🙂')) + 1;
  assert.equal((await api.request({ chunks: [bytes.subarray(0, cut), bytes.subarray(cut)] })).status, 202);
  assert.equal(JSON.parse(api.calls.find(call => call.url.endsWith('/signup')).options.body).password, password);
  const ascii = setup();
  assert.equal((await ascii.request({ body: { ...BODIES.signup, email: ' PILOT@example.test ' } })).status, 202);
  assert.deepEqual(JSON.parse(ascii.calls.find(call => call.url.endsWith('/signup')).options.body),
    { email: EMAIL, password: PASSWORD });
});

test('every valid action spends durable admission before any provider request and excludes secrets from admission', async () => {
  for (const [action, body] of Object.entries(BODIES)) {
    const api = setup();
    const result = await api.request({ body });
    assert.ok(result.status === 200 || result.status === 202);
    assert.equal(api.events[0], 'admit');
    assert.equal(api.admissions.length, 1);
    assert.deepEqual(api.admissions[0].attempt, { action, email: EMAIL });
    assert.equal(api.admissions[0].options.env.SOLO_SUPABASE_URL, SUPABASE);
    assert.equal(typeof api.admissions[0].options.fetcher, 'function');
  }
});

test('durable denial and storage failure stop every action before email, verification or password changes', async () => {
  for (const failure of [
    new HttpError(429, 'auth_rate_limited', 'Too many attempts.', { 'Retry-After': '37' }),
    new HttpError(503, 'auth_admission_unavailable', 'Unavailable')
  ]) {
    for (const body of Object.values(BODIES)) {
      const api = setup({ admit: async () => { throw failure; } });
      const result = await api.request({ body });
      assert.equal(result.status, failure.status);
      assert.equal(result.body.code, failure.code);
      assert.equal(api.calls.length + api.verifications.length, 0);
      assert.equal(result.headers['Set-Cookie'], undefined);
      if (failure.status === 429) assert.equal(result.headers['Retry-After'], '37');
    }
  }
});

test('the real admission adapter accepts all onboarding actions and fails closed before Auth', async () => {
  for (const body of Object.values(BODIES)) {
    const api = setup({ admit: undefined,
      env: { VERCEL: '1', SOLO_SUPABASE_SECRET_KEY: 'sb_secret_unit_test_only',
        SOLO_USAGE_HASH_SECRET: 'unit-test-only-hmac-secret-0123456789abcdefghijklmnopqrstuvwxyz' },
      fetcher: async (url, options) => {
        assert.equal(url, SUPABASE + '/rest/v1/rpc/solo_admit_auth_attempt');
        assert.equal(options.headers.Authorization, undefined);
        const input = JSON.parse(options.body);
        assert.deepEqual(Object.keys(input).sort(), ['p_email_key', 'p_ip_key']);
        assert.match(input.p_email_key, /^[a-f0-9]{64}$/);
        assert.match(input.p_ip_key, /^[a-f0-9]{64}$/);
        assert.doesNotMatch(options.body, /pilot@example|192\.0\.2\.10|dummy password/);
        return response({ allowed: false, code: 'rate_limited', retry_after_seconds: 37 });
      } });
    const result = await api.request({ body, headers: { 'x-vercel-forwarded-for': '192.0.2.10' } });
    assert.equal(result.status, 429);
    assert.equal(result.headers['Retry-After'], '37');
    assert.equal(api.calls.length, 1);
  }
});

test('invalid provider configuration fails closed without making requests to another origin', async () => {
  for (const env of [
    { SOLO_SUPABASE_URL: 'https://attacker.example' },
    { SOLO_SUPABASE_URL: SUPABASE + '/unexpected' },
    { SOLO_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
    { SOLO_SUPABASE_PUBLISHABLE_KEY: '' },
    { SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy\nunsafe' }
  ]) {
    const api = setup({ env });
    assert.equal((await api.request()).status, 503);
    assert.equal(api.calls.length, 0);
  }
});

test('signup refuses disabled email, closed signup or autoconfirm settings without creating an account', async () => {
  for (const settings of [
    { ...SETTINGS, disable_signup: true }, { ...SETTINGS, mailer_autoconfirm: true },
    { ...SETTINGS, external: { email: false } }, {}, null
  ]) {
    const api = setup({ fetcher: async url => {
      assert.equal(url, SUPABASE + '/auth/v1/settings');
      return response(settings);
    } });
    assert.equal((await api.request()).status, 503);
    assert.equal(api.calls.length, 1);
  }
});

test('signup checks live settings, sends only email and password, and issues no session or membership', async () => {
  const api = setup();
  const result = await api.request();
  assert.equal(result.status, 202);
  assert.equal(result.body.code, 'check_email');
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.deepEqual(api.calls.map(call => new URL(call.url).pathname), ['/auth/v1/settings', '/auth/v1/signup']);
  assert.equal(api.calls[0].options.method, 'GET');
  assert.equal(api.calls[1].options.method, 'POST');
  assert.equal(api.verifications.length, 0);
  for (const { url, options } of api.calls) {
    assert.equal(new URL(url).origin, SUPABASE);
    assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('duplicate signup and unknown recovery responses do not enumerate accounts', async () => {
  for (const [action, errors] of [
    ['signup', ['user_already_exists', 'email_exists']],
    ['request_reset', ['user_not_found', 'email_not_confirmed']]
  ]) {
    const normal = await setup().request({ body: BODIES[action] });
    for (const error_code of errors) {
      const api = setup({ fetcher: async (url, options) => url.endsWith('/settings') ? defaultReply(url, options)
        : response({ code: error_code, error_code, msg: 'Provider-specific account detail' }, 422) });
      const result = await api.request({ body: BODIES[action] });
      assert.equal(result.status, 202);
      assert.deepEqual(result.body, normal.body);
      assert.equal(result.headers['Set-Cookie'], undefined);
    }
  }
});

test('systemic provider failures are not disguised as a successful email request or retried', async () => {
  for (const action of ['signup', 'request_reset']) {
    for (const mode of ['server-error', 'known-code-with-server-error', 'network', 'invalid-json']) {
      let targetCalls = 0;
      const api = setup({ fetcher: async (url, options) => {
        if (url.endsWith('/settings')) return defaultReply(url, options);
        targetCalls++;
        if (mode === 'network') throw new Error('Internal detail ' + ACCESS + PASSWORD);
        if (mode === 'invalid-json') return { ok: true, status: 200, json: async () => { throw new Error(REFRESH); } };
        if (mode === 'known-code-with-server-error') return response({ code: action === 'signup'
          ? 'user_already_exists' : 'user_not_found', msg: PASSWORD + ACCESS }, 500);
        return response({ code: 'unexpected_failure', msg: PASSWORD + ACCESS }, 500);
      } });
      const result = await api.request({ body: BODIES[action] });
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'onboarding_unavailable');
      assert.equal(targetCalls, 1);
      assert.equal(result.headers['Set-Cookie'], undefined);
    }
  }
});

test('a session unexpectedly returned by signup cannot become a browser login', async () => {
  const api = setup({ fetcher: async (url, options) => url.endsWith('/signup') ? response(SESSION) : defaultReply(url, options) });
  const result = await api.request();
  assert.equal(result.status, 503);
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.ok(api.calls.some(call => call.url === SUPABASE + '/auth/v1/logout?scope=local'), 'Clean up any unexpected temporary session');
});

test('email verification uses only signup OTP and revokes its temporary session before returning success', async () => {
  const api = setup();
  const result = await api.request({ body: BODIES.verify_email,
    headers: { cookie: '__Host-solo-access=unrelated-browser-session', authorization: 'Bearer unrelated-token' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.code, 'email_verified');
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { email: EMAIL, token: CODE, type: 'signup' });
  assert.equal(api.verifications.length, 1);
  assert.equal(api.verifications[0].token, ACCESS);
  assert.deepEqual(api.events, ['admit', '/auth/v1/verify', 'verify-identity', '/auth/v1/logout']);
  assert.equal(api.calls[1].url, SUPABASE + '/auth/v1/logout?scope=local');
  assert.equal(api.calls[1].options.headers.Authorization, 'Bearer ' + ACCESS);
});

test('invalid or expired OTP does not update a password, reuse ambient credentials or retry verification', async () => {
  for (const action of ['verify_email', 'reset_password']) {
    const api = setup({ fetcher: async (url, options) => {
      assert.equal(url, SUPABASE + '/auth/v1/verify');
      assert.equal(options.headers.Authorization, undefined);
      return response({ code: 'otp_expired', msg: 'Invalid token ' + CODE }, 403);
    } });
    const result = await api.request({ body: BODIES[action], headers: { cookie: '__Host-solo-access=unrelated-browser-session' } });
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'invalid_code');
    assert.equal(api.calls.length, 1);
    assert.equal(api.verifications.length, 0);
    assert.equal(result.headers['Set-Cookie'], undefined);
  }
});

test('malformed verification responses never reach identity verification or a password update', async () => {
  for (const data of [null, {}, [], { access_token: '' }, { access_token: ACCESS },
    { ...SESSION, expires_in: '3600' }, { ...SESSION, refresh_token: REFRESH + '\ninvalid' },
    { ...SESSION, access_token: ACCESS + '\ninvalid' }]) {
    const api = setup({ fetcher: async (url, options) => url.endsWith('/verify') ? response(data) : defaultReply(url, options) });
    const result = await api.request({ body: BODIES.reset_password });
    assert.equal(result.status, 503);
    assert.equal(api.verifications.length, 0);
    assert.equal(api.calls.some(call => call.options.method === 'PUT'), false);
  }
});

test('online identity must match the submitted email and be confirmed before verification or password success', async () => {
  for (const action of ['verify_email', 'reset_password']) {
    for (const user of [{ ...USER, email: 'other@example.test' }, { ...USER, email_confirmed_at: null }]) {
      const api = setup({ verify: async () => ({ ...IDENTITY, user }) });
      const result = await api.request({ body: BODIES[action] });
      assert.ok(result.status >= 400);
      assert.equal(result.body.ok, false);
      assert.equal(api.calls.some(call => call.options.method === 'PUT'), false);
      assert.ok(api.calls.some(call => call.url === SUPABASE + '/auth/v1/logout?scope=local'));
    }
  }
});

test('email verification cannot claim completion while temporary-session revocation is unconfirmed', async () => {
  const api = setup({ fetcher: async (url, options) => url.includes('/logout')
    ? response({ message: 'Private upstream detail ' + ACCESS }, 500) : defaultReply(url, options) });
  const result = await api.request({ body: BODIES.verify_email });
  assert.equal(result.status, 503);
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.notEqual(result.body.code, 'email_verified');
});

test('recovery uses purpose-specific OTP, verifies its identity, changes only password and globally signs out', async () => {
  const api = setup();
  const result = await api.request({ body: BODIES.reset_password });
  assert.equal(result.status, 200);
  assert.equal(result.body.code, 'password_reset');
  clearedCookies(result);
  assert.deepEqual(api.events, ['admit', '/auth/v1/verify', 'verify-identity', '/auth/v1/user', '/auth/v1/logout']);
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { email: EMAIL, token: CODE, type: 'recovery' });
  assert.equal(api.calls[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(api.calls[1].options.body), { password: PASSWORD });
  assert.equal(api.calls[1].options.headers.Authorization, 'Bearer ' + ACCESS);
  assert.equal(api.calls[2].url, SUPABASE + '/auth/v1/logout?scope=global');
  assert.equal(api.calls[2].options.headers.Authorization, 'Bearer ' + ACCESS);
});

test('a consumed recovery code followed by failed or uncertain password update has honest partial-state response', async () => {
  for (const mode of ['rejected', 'uncertain']) {
    const api = setup({ fetcher: async (url, options) => {
      if (options.method === 'PUT') {
        if (mode === 'uncertain') throw new Error('Network ended after dispatch ' + PASSWORD);
        return response({ code: 'same_password', msg: PASSWORD }, 422);
      }
      return defaultReply(url, options);
    } });
    const result = await api.request({ body: BODIES.reset_password });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'reset_incomplete');
    assert.equal(result.body.sessionInvalidated, true);
    assert.notEqual(result.body.passwordChanged, true);
    clearedCookies(result);
    assert.equal(api.calls.filter(call => call.url.endsWith('/verify')).length, 1);
    assert.equal(api.calls.filter(call => call.options.method === 'PUT').length, 1);
    assert.ok(api.calls.some(call => call.url === SUPABASE + '/auth/v1/logout?scope=local'));
  }
});

test('successful password update with failed global logout reports change but never claims full reset success', async () => {
  const api = setup({ fetcher: async (url, options) => url.endsWith('scope=global')
    ? response({ code: 'unexpected_failure', msg: ACCESS }, 500) : defaultReply(url, options) });
  const result = await api.request({ body: BODIES.reset_password });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'reset_signout_unconfirmed');
  assert.equal(result.body.passwordChanged, true);
  assert.equal(result.body.sessionInvalidated, true);
  clearedCookies(result);
  assert.equal(api.calls.filter(call => call.url.endsWith('/verify')).length, 1);
  assert.equal(api.calls.filter(call => call.options.method === 'PUT').length, 1);
  assert.equal(api.calls.filter(call => call.url.endsWith('scope=global')).length, 1);
});
