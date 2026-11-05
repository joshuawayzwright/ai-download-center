const test = require('node:test');
const assert = require('node:assert/strict');
const { runHostedChecks, configuration, HostedFailure } = require('../scripts/solo-customer-hosted-smoke.cjs');

const ORIGIN = 'https://solo-provider-industrial-test123-wrightwayz.vercel.app';
const PROJECT = 'https://tymayhazawkofmiypeqt.supabase.co';
const SECRET = 'sb_secret_dummy_hosted_test_only';
const A = { testOnly: true, userId: '00000000-0000-4000-8000-000000000001',
  email: 'hosted-one@example.invalid', password: 'dummy-password-for-tests-only' };
const B = { testOnly: true, userId: '00000000-0000-4000-8000-000000000002',
  email: 'hosted-two@example.invalid', password: 'another-dummy-password-for-tests' };
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_HOSTED_CHECK: 'true',
  SOLO_CUSTOMER_SMOKE_TARGET_URL: ORIGIN + '/?_vercel_share=dummy-share-for-tests',
  SOLO_SUPABASE_URL: PROJECT, SOLO_SUPABASE_SECRET_KEY: SECRET,
  SOLO_CUSTOMER_SMOKE_MODE: 'auth', SOLO_CUSTOMER_SMOKE_IDENTITIES: JSON.stringify([A]) };
const FLAGS = '; Max-Age=3600; Secure; HttpOnly; SameSite=Strict; Path=/';
const response = (body, status = 200, headers = {}) => ({ status,
  headers: { 'cache-control': 'no-store, private', ...headers },
  body: JSON.stringify(body), connectionId: {} });

function mockHosted({ quota = Infinity, code = 'user_minute_limit', chatEnabled = false,
  wrongIdentity = false, unsafeCookies = false, staleAccepted = false, sameConnection = false } = {}) {
  const calls = [], sessions = new Map(), ledger = new Map();
  let refreshNumber = 0, activeAdmissions = 0, peakAdmissions = 0;
  const sharedConnection = {};
  function cookieValues(value) {
    return Object.fromEntries((value || '').split('; ').filter(Boolean).map(pair => {
      const index = pair.indexOf('='); return [pair.slice(0, index), pair.slice(index + 1)];
    }));
  }
  function tokenFor(identity) {
    const payload = { sub: identity.userId, session_id: identity.userId.replace('4000', '4001'),
      iss: PROJECT + '/auth/v1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
    return 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.ZHVtbXk';
  }
  function view(identity) {
    const used = [...ledger.values()].filter(row => row.userId === identity.userId).length;
    return { enabled: true, authenticated: true, chatEnabled,
      user: { id: wrongIdentity ? B.userId : identity.userId, email: identity.email },
      usage: { remaining_daily: 20 - used, daily_limit: 20 } };
  }
  function issued(identity) {
    const token = tokenFor(identity);
    sessions.set(token, { identity, active: true });
    const flags = unsafeCookies ? '; Max-Age=3600; Path=/' : FLAGS;
    return response(view(identity), 200, { 'set-cookie': [
      '__Host-solo-access=' + token + flags,
      '__Host-solo-refresh=dummy-refresh-token-' + (++refreshNumber) + flags ] });
  }
  async function transport(url, options) {
    calls.push({ url, options });
    if (url.origin === ORIGIN && url.pathname === '/') {
      return response({}, 200, { 'set-cookie': ['_vercel_jwt=dummy-protection; Secure; HttpOnly; Path=/'] });
    }
    if (url.origin === ORIGIN && url.pathname === '/api/solo-auth') {
      assert.equal(options.headers.Origin, ORIGIN);
      assert.equal(options.headers.apikey, undefined);
      const body = options.body ? JSON.parse(options.body) : {};
      const cookies = cookieValues(options.headers.Cookie);
      const token = options.headers.Authorization?.slice(7) || cookies['__Host-solo-access'];
      const current = sessions.get(token);
      if (body.action === 'login') return issued([A, B].find(user => user.email === body.email));
      if (body.action === 'refresh') return issued(current.identity);
      if (body.action === 'logout') {
        if (current) current.active = false;
        return response({ enabled: true, authenticated: false, chatEnabled: false }, 200,
          { 'set-cookie': ['__Host-solo-access=', '__Host-solo-refresh=']
            .map(cookie => cookie + FLAGS.replace('3600', '0')) });
      }
      if (current?.active || (staleAccepted && current)) return response(view(current.identity));
      if (token) return response({ code: 'invalid_session', authenticated: false }, 401);
      return response({ enabled: true, authenticated: false, chatEnabled: false });
    }
    assert.equal(url.origin, PROJECT);
    assert.equal(options.headers.apikey, SECRET);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    const current = [...sessions.values()].find(session => session.identity.userId === body.p_user_id);
    if (url.pathname.endsWith('/solo_customer_status')) {
      return response({ active: Boolean(current?.active), code: current?.active ? 'active' : 'invalid_session' });
    }
    assert.equal(url.pathname, '/rest/v1/rpc/solo_admit_request');
    activeAdmissions++;
    peakAdmissions = Math.max(peakAdmissions, activeAdmissions);
    // Give every launched request a chance to enter the transport before any
    // completes. This tests harness scheduling; it is not hosted SQL evidence.
    await new Promise(resolve => setImmediate(resolve));
    let result;
    const prior = ledger.get(body.p_request_id);
    if (!current?.active) result = { allowed: false, code: 'invalid_session' };
    else if (prior) result = { allowed: false,
      code: prior.fingerprint === body.p_fingerprint ? 'duplicate_request' : 'request_conflict' };
    else if (ledger.size >= quota) result = { allowed: false, code, retry_after_seconds: 60 };
    else {
      ledger.set(body.p_request_id, { userId: body.p_user_id, fingerprint: body.p_fingerprint });
      result = { allowed: true, code: 'admitted' };
    }
    activeAdmissions--;
    return { ...response({ ...result, request_id: body.p_request_id }),
      ...(sameConnection ? { connectionId: sharedConnection } : {}) };
  }
  return { calls, sessions, ledger, transport, get peakAdmissions() { return peakAdmissions; } };
}

test('hosted runner requires explicit opt-in, the existing commercial project and an immutable Preview', async () => {
  for (const change of [
    { SOLO_CUSTOMER_HOSTED_CHECK: undefined }, { VERCEL_ENV: 'production' },
    { SOLO_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    { SOLO_CUSTOMER_SMOKE_TARGET_URL: 'https://thesoloserviceprovider.com.au/' },
    { SOLO_CUSTOMER_SMOKE_TARGET_URL: 'https://attacker.invalid/?_vercel_share=secret' },
    { SOLO_CUSTOMER_SMOKE_IDENTITIES: JSON.stringify([{ ...A, testOnly: false }]) },
    { SOLO_SUPABASE_SECRET_KEY: 'legacy-or-missing-secret' }
  ]) {
    let calls = 0;
    await assert.rejects(runHostedChecks({ env: { ...ENV, ...change }, transport: async () => { calls++; }, log() {} }), HostedFailure);
    assert.equal(calls, 0);
  }
});

test('auth harness checks real-session sequence and emits no dummy credentials or bodies', async () => {
  const host = mockHosted(), logs = [];
  const result = await runHostedChecks({ env: ENV, transport: host.transport, log: value => logs.push(value) });
  assert.equal(result.checks, 7);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.hostedTransport, false);
  assert.equal(host.ledger.size, 0, 'revoked-session probe cannot reserve');
  assert.equal([...host.sessions.values()].some(session => session.active), false);
  const output = logs.join('\n');
  for (const value of [SECRET, A.email, A.password, 'dummy-share-for-tests', 'dummy-refresh-token-', 'eyJhbGci']) {
    assert.equal(output.includes(value), false, 'credentials and user identifiers never appear in output');
  }
  assert.equal(host.calls.some(call => call.url.pathname === '/api/solo-chat'), false);
});

test('authenticated harness refuses live inference, unsafe cookies and unintended identities, then closes the session', async () => {
  for (const options of [{ chatEnabled: true }, { unsafeCookies: true }, { wrongIdentity: true }]) {
    const host = mockHosted(options);
    await assert.rejects(runHostedChecks({ env: ENV, transport: host.transport, log() {} }), HostedFailure);
    assert.equal([...host.sessions.values()].some(session => session.active), false);
    assert.equal(host.ledger.size, 0);
  }
});

test('the auth harness cannot report success when an unexpired revoked JWT remains accepted', async () => {
  const host = mockHosted({ staleAccepted: true });
  await assert.rejects(runHostedChecks({ env: ENV, transport: host.transport, log() {} }),
    error => error.code === 'REVOKED_STATUS_HTTP_200');
});

test('protected Preview redirects never forward cookies or passwords to another origin', async () => {
  const calls = [];
  await assert.rejects(runHostedChecks({ env: ENV, log() {}, transport: async (url, options) => {
    calls.push({ url, options });
    return response({}, 307, { location: 'https://attacker.invalid/', 'set-cookie': ['_vercel_jwt=dummy'] });
  } }), error => error.code === 'PREVIEW_CROSS_ORIGIN_REDIRECT');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body, undefined);
});

test('duplicate race launches independent requests concurrently, checks fingerprint conflict and retains only one debit', async () => {
  const host = mockHosted(), logs = [];
  const result = await runHostedChecks({ env: { ...ENV, SOLO_CUSTOMER_SMOKE_MODE: 'race',
    SOLO_CUSTOMER_SMOKE_SCENARIO: 'duplicate', SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '1' },
  transport: host.transport, log: value => logs.push(value) });
  assert.equal(host.peakAdmissions, 4);
  assert.equal(result.reservedRequestIds.length, 1);
  assert.equal(host.ledger.size, 1);
  assert.equal(result.checks, 5);
  assert.equal(logs.some(value => value.includes('CHANGED_DUPLICATE_REJECTED')), true);
  assert.equal([...host.sessions.values()].some(session => session.active), false);
});

test('user and global cap races assert exact admitted/denied counts and persistent allowance', async () => {
  for (const scenario of ['user_minute', 'user_daily', 'global_minute', 'global_daily']) {
    const global = scenario.startsWith('global_');
    const host = mockHosted({ quota: 2, code: scenario + '_limit' });
    const result = await runHostedChecks({ env: { ...ENV, SOLO_CUSTOMER_SMOKE_MODE: 'race',
      SOLO_CUSTOMER_SMOKE_IDENTITIES: JSON.stringify(global ? [A, B] : [A]),
      SOLO_CUSTOMER_SMOKE_SCENARIO: scenario, SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '2' },
    transport: host.transport, log() {} });
    assert.equal(host.peakAdmissions, global ? 8 : 4);
    assert.equal(result.reservedRequestIds.length, 2);
    assert.equal(host.ledger.size, 2);
    assert.equal([...host.sessions.values()].some(session => session.active), false);
  }
});

test('race refuses pooled connection evidence and does not retry uncertain admissions', async () => {
  const host = mockHosted({ sameConnection: true });
  await assert.rejects(runHostedChecks({ env: { ...ENV, SOLO_CUSTOMER_SMOKE_MODE: 'race',
    SOLO_CUSTOMER_SMOKE_SCENARIO: 'duplicate', SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '1' },
  transport: host.transport, log() {} }), error => error.code === 'INDEPENDENT_CONNECTIONS_NOT_OBSERVED');
  assert.equal(host.calls.filter(call => call.url.pathname.endsWith('/solo_admit_request')).length, 4);
  assert.equal(host.ledger.size, 1);
  assert.equal([...host.sessions.values()].some(session => session.active), false);
});

test('race parameters are bounded and must distinguish user and global fixtures', () => {
  const race = { ...ENV, SOLO_CUSTOMER_SMOKE_MODE: 'race', SOLO_CUSTOMER_SMOKE_SCENARIO: 'user_minute',
    SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '2' };
  for (const change of [{ SOLO_CUSTOMER_SMOKE_ATTEMPTS_PER_USER: '100' },
    { SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '0' }, { SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS: '4' },
    { SOLO_CUSTOMER_SMOKE_SCENARIO: 'global_minute' },
    { SOLO_CUSTOMER_SMOKE_IDENTITIES: JSON.stringify([A, A]) }]) {
    assert.throws(() => configuration({ ...race, ...change }), HostedFailure);
  }
});
