const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixtures, FixtureFailure } = require('../scripts/solo-customer-fixtures.cjs');
const ORIGIN = 'https://tymayhazawkofmiypeqt.supabase.co';
const FIXTURES = [
  { testOnly: true, email: 'solo-verification-a1b2@thesoloserviceprovider.com.au', password: 'dummy-long-password-for-fixture-tests-1' },
  { testOnly: true, email: 'solo-verification-c3d4@thesoloserviceprovider.com.au', password: 'dummy-long-password-for-fixture-tests-2' }
];
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_FIXTURE_CREATE: 'true',
  SOLO_CUSTOMER_AUTH_ENABLED: 'false', SOLO_CUSTOMER_CHAT_ENABLED: 'false',
  SOLO_SUPABASE_URL: ORIGIN, SOLO_SUPABASE_SECRET_KEY: 'sb_secret_dummy_only',
  SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy_only', SOLO_CUSTOMER_FIXTURES: JSON.stringify(FIXTURES) };
const response = (data, status = 200) => ({ status, json: async () => data });
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];

test('fixture creation rejects wrong environment, project, keys and unscoped fixture data before networking', async () => {
  for (const change of [{ VERCEL_ENV: 'production' }, { SOLO_CUSTOMER_FIXTURE_CREATE: undefined },
    { SOLO_CUSTOMER_AUTH_ENABLED: 'true' }, { SOLO_CUSTOMER_CHAT_ENABLED: 'true' },
    { SOLO_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    { SOLO_SUPABASE_SECRET_KEY: 'sb_secret_dummy\n' }, { SOLO_SUPABASE_PUBLISHABLE_KEY: 'legacy-key' },
    { SOLO_CUSTOMER_FIXTURES: 'invalid-json' }, { SOLO_CUSTOMER_FIXTURES: JSON.stringify([FIXTURES[0]]) },
    ...[{ testOnly: false }, { email: 'customer@example.com' }, { password: 'short' }, { password: 'x'.repeat(73) }]
      .map(change => ({ SOLO_CUSTOMER_FIXTURES: JSON.stringify([{ ...FIXTURES[0], ...change }, FIXTURES[1]]) }))]) {
    let calls = 0;
    await assert.rejects(runFixtures({ env: { ...ENV, ...change }, log() {}, fetcher: async () => { calls++; } }), FixtureFailure);
    assert.equal(calls, 0);
  }
});

test('open signup or any existing/unknown user inventory blocks all creation', async () => {
  for (const [settings, users] of [[{ disable_signup: false }, { users: [] }],
    [{}, { users: [] }], [{ disable_signup: true }, { users: [{ id: ids[0] }] }],
    [{ disable_signup: true }, {}]]) {
    const calls = [], logs = [];
    await assert.rejects(runFixtures({ env: ENV, log: line => logs.push(line), fetcher: async (url, options) => {
      calls.push(options.method);
      return response(url.endsWith('/settings') ? settings : users);
    } }), FixtureFailure);
    assert.equal(calls.includes('POST'), false);
    assert.deepEqual(logs, []);
  }
});

test('admin creation uses apikey only, auto-confirms email, and prints each ID before the next create', async () => {
  const logs = [], calls = [];
  let created = 0;
  const result = await runFixtures({ env: ENV, log: line => logs.push(line), fetcher: async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    if (url.endsWith('/settings')) {
      assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY);
      return response({ disable_signup: true });
    }
    assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_SECRET_KEY);
    if (options.method === 'GET') return response({ users: [] });
    assert.equal(url, ORIGIN + '/auth/v1/admin/users');
    assert.equal(logs.length, created, 'earlier IDs log immediately');
    const fixture = FIXTURES[created];
    assert.deepEqual(JSON.parse(options.body), { email: fixture.email, password: fixture.password, email_confirm: true });
    return response({ id: ids[created++], email: fixture.email, email_confirmed_at: '2026-10-27T00:00:00Z',
      unexpected_sensitive_field: ENV.SOLO_SUPABASE_SECRET_KEY });
  } });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'POST', 'POST']);
  assert.deepEqual(result, ids.map((userId, index) => ({ index, userId })));
  assert.deepEqual(logs, [...result.map(value => JSON.stringify(value)), 'SOLO_CUSTOMER_FIXTURES_CREATED_PASS']);
  const text = logs.join('\n');
  for (const value of [ENV.SOLO_SUPABASE_SECRET_KEY, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY,
    ...FIXTURES.flatMap(fixture => [fixture.email, fixture.password])]) assert.equal(text.includes(value), false);
});

test('uncertain second creation preserves the first ID and never retries or logs the raw failure', async () => {
  const logs = [];
  let posts = 0;
  await assert.rejects(runFixtures({ env: ENV, log: line => logs.push(line), fetcher: async (url, options) => {
    if (url.endsWith('/settings')) return response({ disable_signup: true });
    if (options.method === 'GET') return response({ users: [] });
    if (posts++ === 0) return response({ id: ids[0], email: FIXTURES[0].email, email_confirmed_at: '2026-10-27T00:00:00Z' });
    throw new Error(FIXTURES[1].password + ENV.SOLO_SUPABASE_SECRET_KEY);
  } }), error => error.code === 'CREATE_OUTCOME_UNKNOWN_INSPECT_USERS' && !error.message.includes('sb_secret'));
  assert.equal(posts, 2);
  assert.deepEqual(logs, [JSON.stringify({ index: 0, userId: ids[0] })]);
});

test('failed HTTP or unconfirmed creation cannot emit the all-created marker or continue', async () => {
  for (const createResponse of [response({ error: ENV.SOLO_SUPABASE_SECRET_KEY }, 401),
    response({ id: ids[0], email: FIXTURES[0].email, email_confirmed_at: null })]) {
    const logs = [];
    let posts = 0;
    await assert.rejects(runFixtures({ env: ENV, log: line => logs.push(line), fetcher: async (url, options) => {
      if (url.endsWith('/settings')) return response({ disable_signup: true });
      if (options.method === 'GET') return response({ users: [] });
      posts++;
      return createResponse;
    } }), FixtureFailure);
    assert.equal(posts, 1);
    assert.equal(logs.includes('SOLO_CUSTOMER_FIXTURES_CREATED_PASS'), false);
    assert.equal(logs.join('').includes(ENV.SOLO_SUPABASE_SECRET_KEY), false);
  }
});
