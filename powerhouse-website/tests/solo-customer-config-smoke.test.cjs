const test = require('node:test');
const assert = require('node:assert/strict');
const { runConfigSmoke, ConfigSmokeFailure } = require('../scripts/solo-customer-config-smoke.cjs');
const { HttpError } = require('../lib/solo-customer-access.cjs');
const ORIGIN = 'https://tymayhazawkofmiypeqt.supabase.co';
const RPC = ORIGIN + '/rest/v1/rpc/solo_customer_status';
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_CONFIG_CHECK: 'true',
  SOLO_CUSTOMER_AUTH_ENABLED: 'false', SOLO_CUSTOMER_CHAT_ENABLED: 'false',
  SOLO_SUPABASE_URL: ORIGIN, SOLO_SUPABASE_SECRET_KEY: 'sb_secret_dummy_only',
  SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only' };
const SETTINGS = { disable_signup: false, external: { email: true, anonymous_users: false }, mailer_autoconfirm: false };
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('config probe requires explicit Preview opt-in, closed gates, the exact project and modern key formats before network', async () => {
  for (const change of [{ VERCEL_ENV: 'production' }, { SOLO_CUSTOMER_CONFIG_CHECK: undefined },
    { SOLO_CUSTOMER_AUTH_ENABLED: 'true' }, { SOLO_CUSTOMER_CHAT_ENABLED: 'true' },
    { SOLO_CUSTOMER_AUTH_ENABLED: undefined },
    { SOLO_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    { SOLO_SUPABASE_URL: ORIGIN + '/redirect' },
    { SOLO_SUPABASE_SECRET_KEY: '' }, { SOLO_SUPABASE_SECRET_KEY: 'sb_secret_dummy\n' },
    { SOLO_SUPABASE_PUBLISHABLE_KEY: 'legacy-key' }, { SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ dummy' }]) {
    let calls = 0;
    await assert.rejects(runConfigSmoke({ env: { ...ENV, ...change }, log() {},
      fetcher: async () => { calls++; } }), ConfigSmokeFailure);
    assert.equal(calls, 0);
  }
});

test('probe uses actual adapter, verifies HTTP200 plus disabled, and emits only marker and allowlisted booleans', async () => {
  const logs = [], calls = [];
  const result = await runConfigSmoke({ env: ENV, log: line => logs.push(line), fetcher: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    if (url === RPC) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_SECRET_KEY);
      const ids = JSON.parse(options.body);
      assert.match(ids.p_user_id, /^[0-9a-f-]{36}$/);
      assert.match(ids.p_session_id, /^[0-9a-f-]{36}$/);
      assert.notEqual(ids.p_user_id, ids.p_session_id);
      return response({ active: false, code: 'disabled' });
    }
    assert.equal(url, ORIGIN + '/auth/v1/settings');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY);
    return response({ ...SETTINGS, sensitive_unexpected_field: ENV.SOLO_SUPABASE_SECRET_KEY });
  } });
  assert.deepEqual(calls, [RPC, ORIGIN + '/auth/v1/settings']);
  assert.equal(result.serverKeyVerified, true);
  assert.deepEqual(logs, ['SOLO_COMMERCIAL_SERVER_KEY_PASS',
    '{"disable_signup":false,"email":true,"anonymous":false,"mailer_autoconfirm":false}']);
  assert.equal(logs.join('').includes(ENV.SOLO_SUPABASE_SECRET_KEY), false);
  assert.equal(logs.join('').includes(ENV.SOLO_SUPABASE_PUBLISHABLE_KEY), false);
});

test('authentication errors, wrong RPC results and non-200 responses never count as credential verification', async () => {
  for (const reply of [response({ active: false, code: 'disabled' }, 401),
    response({ active: false, code: 'disabled' }, 503),
    response({ active: false, code: 'configuration_missing' }),
    response({ active: true, code: 'active' }), response({ error: ENV.SOLO_SUPABASE_SECRET_KEY })]) {
    const logs = [], calls = [];
    await assert.rejects(runConfigSmoke({ env: ENV, log: line => logs.push(line),
      fetcher: async url => { calls.push(url); return reply; } }),
    error => error.code === 'RPC_DISABLED_RESULT_NOT_VERIFIED');
    assert.deepEqual(calls, [RPC]);
    assert.deepEqual(logs, []);
  }
});

test('wrapper refuses any changed RPC destination and a local disabled error without observed HTTP cannot pass', async () => {
  for (const status of [
    async (_identity, options) => options.fetcher(ORIGIN + '/rest/v1/rpc/solo_admit_request',
      { method: 'POST', redirect: 'error', headers: { apikey: ENV.SOLO_SUPABASE_SECRET_KEY } }),
    async () => { throw new HttpError(503, 'disabled', 'local error'); }
  ]) {
    let calls = 0;
    await assert.rejects(runConfigSmoke({ env: ENV, status, log() {}, fetcher: async () => { calls++; } }),
      error => error.code === 'RPC_DISABLED_RESULT_NOT_VERIFIED');
    assert.equal(calls, 0);
  }
});

test('settings output never substitutes false for missing or nonboolean fields and never prints raw failures', async () => {
  for (const settingResult of [response({ ...SETTINGS, disable_signup: 'false' }), response({}),
    response(SETTINGS, 403), new Error('upstream might echo ' + ENV.SOLO_SUPABASE_SECRET_KEY)]) {
    const logs = [];
    await assert.rejects(runConfigSmoke({ env: ENV, log: line => logs.push(line), fetcher: async url => {
      if (url === RPC) return response({ active: false, code: 'disabled' });
      if (settingResult instanceof Error) throw settingResult;
      return settingResult;
    } }), error => error instanceof ConfigSmokeFailure && !error.message.includes(ENV.SOLO_SUPABASE_SECRET_KEY));
    assert.deepEqual(logs, []);
  }
});
