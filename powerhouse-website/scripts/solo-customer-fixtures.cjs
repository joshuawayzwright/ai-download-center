// Explicit one-off creation of two controlled Auth fixtures. Never sends email.
// No public signup, membership changes, quota changes or inference occur here.
const ORIGIN = 'https://tymayhazawkofmiypeqt.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^solo-verification-[a-f0-9]+@thesoloserviceprovider\.com\.au$/;
class FixtureFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(condition, code) { if (!condition) throw new FixtureFailure(code); }

async function runFixtures({ env = process.env, fetcher = globalThis.fetch, log = console.log } = {}) {
  need(env.VERCEL_ENV === 'preview' && env.SOLO_CUSTOMER_FIXTURE_CREATE === 'true', 'PREVIEW_OPT_IN_REQUIRED');
  need(env.SOLO_CUSTOMER_AUTH_ENABLED === 'false' && env.SOLO_CUSTOMER_CHAT_ENABLED === 'false', 'CUSTOMER_GATES_MUST_BE_FALSE');
  need(env.SOLO_SUPABASE_URL === ORIGIN, 'EXISTING_COMMERCIAL_PROJECT_REQUIRED');
  need(typeof env.SOLO_SUPABASE_SECRET_KEY === 'string' && /^sb_secret_[A-Za-z0-9_-]+$/.test(env.SOLO_SUPABASE_SECRET_KEY), 'SERVER_KEY_FORMAT_INVALID');
  need(typeof env.SOLO_SUPABASE_PUBLISHABLE_KEY === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SOLO_SUPABASE_PUBLISHABLE_KEY), 'PUBLISHABLE_KEY_FORMAT_INVALID');
  let fixtures;
  try { fixtures = JSON.parse(env.SOLO_CUSTOMER_FIXTURES); }
  catch { throw new FixtureFailure('FIXTURE_DATA_INVALID'); }
  need(Array.isArray(fixtures) && fixtures.length === 2, 'EXACTLY_TWO_FIXTURES_REQUIRED');
  for (const fixture of fixtures) {
    need(fixture?.testOnly === true && typeof fixture.email === 'string' && EMAIL.test(fixture.email) &&
      fixture.email.length <= 254 && typeof fixture.password === 'string' && fixture.password.length >= 32 &&
      Buffer.byteLength(fixture.password, 'utf8') <= 72 && !/[\s\x00-\x1f\x7f]/.test(fixture.password), 'FIXTURE_DATA_INVALID');
  }
  need(fixtures[0].email !== fixtures[1].email, 'DISTINCT_FIXTURES_REQUIRED');

  async function request(path, key, body) {
    let response, data;
    try {
      response = await fetcher(ORIGIN + path, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.timeout(body ? 10000 : 5000),
        headers: { apikey: key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      need(response.status === 200, body ? 'CREATE_HTTP_FAILED_NO_RETRY' : 'PREFLIGHT_HTTP_FAILED');
      data = await response.json();
    } catch (error) {
      if (error instanceof FixtureFailure) throw error;
      throw new FixtureFailure(body ? 'CREATE_OUTCOME_UNKNOWN_INSPECT_USERS' : 'PREFLIGHT_UNAVAILABLE');
    }
    need(data && typeof data === 'object' && !Array.isArray(data), 'RESPONSE_SHAPE_INVALID');
    return data;
  }
  const settings = await request('/auth/v1/settings', env.SOLO_SUPABASE_PUBLISHABLE_KEY);
  need(settings.disable_signup === true, 'SIGNUP_MUST_BE_DISABLED');
  const existing = await request('/auth/v1/admin/users?page=1&per_page=1', env.SOLO_SUPABASE_SECRET_KEY);
  need(Array.isArray(existing.users) && existing.users.length === 0, 'EMPTY_AUTH_PROJECT_REQUIRED');

  const created = [];
  for (const [index, fixture] of fixtures.entries()) {
    const user = await request('/auth/v1/admin/users', env.SOLO_SUPABASE_SECRET_KEY,
      { email: fixture.email, password: fixture.password, email_confirm: true });
    need(UUID.test(user.id), 'CREATE_IDENTIFIER_INVALID_INSPECT_USERS');
    // Emit each confirmed HTTP success immediately, before the next creation.
    // These IDs permit partial-run auditing; credentials and emails never log.
    const record = { index, userId: user.id };
    created.push(record);
    log(JSON.stringify(record));
    need(user.email === fixture.email && typeof user.email_confirmed_at === 'string' &&
      Number.isFinite(Date.parse(user.email_confirmed_at)), 'CREATE_CONFIRMATION_INVALID_INSPECT_USERS');
  }
  log('SOLO_CUSTOMER_FIXTURES_CREATED_PASS');
  return created;
}

if (require.main === module) {
  runFixtures().catch(error => {
    console.error('SOLO_CUSTOMER_FIXTURES_FAIL_' +
      (error instanceof FixtureFailure ? error.code : 'NETWORK_OR_RUNTIME_ERROR'));
    process.exitCode = 1;
  });
}
module.exports = { runFixtures, FixtureFailure };
