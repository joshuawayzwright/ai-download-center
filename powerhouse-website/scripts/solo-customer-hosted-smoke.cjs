// Explicitly opted-in hosted checks. No signup, email, policy edits or inference.
// Credentials stay in memory; output contains fixed result codes and request IDs.
const https = require('node:https');
const { createHash, randomUUID } = require('node:crypto');
const { validateTarget } = require('./solo-private-smoke.cjs');

const COMMERCIAL_ORIGIN = 'https://tymayhazawkofmiypeqt.supabase.co';
const ACCESS = '__Host-solo-access';
const REFRESH = '__Host-solo-refresh';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENARIOS = new Set(['duplicate', 'user_minute', 'user_daily', 'global_minute', 'global_daily']);

class HostedFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(condition, code) { if (!condition) throw new HostedFailure(code); }
const header = (response, name) => response.headers?.[name.toLowerCase()];

// agent:false gives every request its own TLS connection. Promise.all below
// launches admission requests together, rather than using PGlite's single queue.
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    let socket;
    const request = https.request(url, {
      method: options.method || 'GET', headers: options.headers, agent: false,
      signal: AbortSignal.timeout(35000)
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) response.destroy(new Error('response limit'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode,
        headers: response.headers, body: Buffer.concat(chunks).toString('utf8'),
        connectionId: socket }));
    });
    request.on('socket', value => { socket = value; });
    request.on('error', reject);
    request.end(options.body);
  });
}

function configuration(env) {
  need(env.VERCEL_ENV === 'preview' && env.SOLO_CUSTOMER_HOSTED_CHECK === 'true', 'EXPLICIT_PREVIEW_OPT_IN_REQUIRED');
  let target;
  try { target = validateTarget(env.SOLO_CUSTOMER_SMOKE_TARGET_URL); }
  catch { throw new HostedFailure('IMMUTABLE_SOLO_PREVIEW_REQUIRED'); }
  need(env.SOLO_SUPABASE_URL === COMMERCIAL_ORIGIN, 'EXISTING_COMMERCIAL_PROJECT_REQUIRED');
  need(typeof env.SOLO_SUPABASE_SECRET_KEY === 'string' &&
    /^sb_secret_[^\s]+$/.test(env.SOLO_SUPABASE_SECRET_KEY), 'SERVER_SECRET_REQUIRED');
  const mode = env.SOLO_CUSTOMER_SMOKE_MODE;
  need(mode === 'auth' || mode === 'race', 'MODE_REQUIRED');
  let identities;
  try { identities = JSON.parse(env.SOLO_CUSTOMER_SMOKE_IDENTITIES); }
  catch { throw new HostedFailure('CONTROLLED_TEST_IDENTITIES_REQUIRED'); }
  need(Array.isArray(identities) && identities.length >= 1 && identities.length <= 2,
    'CONTROLLED_TEST_IDENTITIES_REQUIRED');
  for (const identity of identities) {
    need(identity && identity.testOnly === true && UUID.test(identity.userId) &&
      typeof identity.email === 'string' && identity.email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) &&
      typeof identity.password === 'string' && identity.password.length >= 16 && identity.password.length <= 1024,
    'CONTROLLED_TEST_IDENTITIES_REQUIRED');
  }
  need(new Set(identities.map(identity => identity.userId.toLowerCase())).size === identities.length,
    'DISTINCT_TEST_IDENTITIES_REQUIRED');
  const scenario = env.SOLO_CUSTOMER_SMOKE_SCENARIO;
  const attempts = Number(env.SOLO_CUSTOMER_SMOKE_ATTEMPTS_PER_USER || 4);
  const expected = Number(env.SOLO_CUSTOMER_SMOKE_EXPECTED_ADMISSIONS);
  if (mode === 'auth') need(identities.length === 1, 'AUTH_REQUIRES_ONE_TEST_IDENTITY');
  else {
    need(SCENARIOS.has(scenario), 'RACE_SCENARIO_REQUIRED');
    need(identities.length === (scenario.startsWith('global_') ? 2 : 1), 'RACE_IDENTITY_COUNT');
    need(Number.isInteger(attempts) && attempts >= 2 && attempts <= 6, 'RACE_ATTEMPTS_OUT_OF_BOUNDS');
    need(Number.isInteger(expected) && expected >= 1 && expected < attempts * identities.length,
      'EXPECTED_ADMISSIONS_REQUIRED');
    if (scenario === 'duplicate') need(expected === 1, 'DUPLICATE_EXPECTS_ONE_ADMISSION');
  }
  return { target, mode, identities, scenario, attempts, expected,
    secret: env.SOLO_SUPABASE_SECRET_KEY };
}

function json(response, name) {
  let value;
  try { value = JSON.parse(response.body); } catch { throw new HostedFailure(name + '_NOT_JSON'); }
  need(value && typeof value === 'object' && !Array.isArray(value), name + '_INVALID_JSON');
  return value;
}
function usage(data) {
  const value = data?.usage || data;
  need(Number.isSafeInteger(value?.remaining_daily) && Number.isSafeInteger(value?.daily_limit) &&
    value.remaining_daily >= 0 && value.daily_limit > 0 && value.remaining_daily <= value.daily_limit,
  'INVALID_USAGE_RESULT');
  return { remaining: value.remaining_daily, limit: value.daily_limit };
}
function sessionFromCookie(client) {
  let token, claims;
  try {
    token = decodeURIComponent(client.cookies.get(ACCESS));
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch { throw new HostedFailure('LOGIN_SESSION_INVALID'); }
  // The application already verified this JWT online. Decoding here only binds
  // the test to the expected fixture and lets RPC checks target that live session.
  need(claims.sub === client.identity.userId && UUID.test(claims.session_id) &&
    claims.iss === COMMERCIAL_ORIGIN + '/auth/v1' && claims.role === 'authenticated' &&
    Number.isInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000), 'LOGIN_SESSION_INVALID');
  return { token, userId: claims.sub, sessionId: claims.session_id, expires: claims.exp };
}
function sessionCookies(response, clearing = false) {
  const all = header(response, 'set-cookie') || [];
  need(Array.isArray(all), 'SESSION_COOKIE_HEADER_INVALID');
  for (const name of [ACCESS, REFRESH]) {
    const matching = all.filter(cookie => cookie.startsWith(name + '='));
    need(matching.length === 1, 'SESSION_COOKIES_REQUIRED');
    const fields = matching[0].split(';').map(part => part.trim().toLowerCase());
    need(fields.includes('secure') && fields.includes('httponly') && fields.includes('samesite=strict') &&
      fields.includes('path=/') && !fields.some(field => field.startsWith('domain=')), 'SESSION_COOKIE_FLAGS_INVALID');
    const age = fields.find(field => field.startsWith('max-age='));
    need(age && (clearing ? age === 'max-age=0' : Number(age.slice(8)) > 0), 'SESSION_COOKIE_AGE_INVALID');
  }
}

async function runHostedChecks({ env = process.env, transport = httpsRequest, log = console.log } = {}) {
  const config = configuration(env);
  const origin = config.target.origin;
  const runId = randomUUID();
  const clients = [];
  let checks = 0;
  function pass(name, evidence = {}) {
    checks++;
    log(JSON.stringify({ case: name, result: 'pass', ...evidence }));
  }
  async function call(url, options) {
    need(url.origin === origin || url.origin === COMMERCIAL_ORIGIN, 'CREDENTIAL_DESTINATION_REJECTED');
    try { return await transport(url, options); }
    catch { throw new HostedFailure('NETWORK_OR_RUNTIME_ERROR'); }
  }
  function cookieHeader(client, protectionOnly = false) {
    return [...client.cookies].filter(([name]) => !protectionOnly || ![ACCESS, REFRESH].includes(name))
      .map(([name, value]) => `${name}=${value}`).join('; ');
  }
  function capture(client, response) {
    for (const cookie of header(response, 'set-cookie') || []) {
      const [pair] = cookie.split(';');
      const split = pair.indexOf('=');
      if (split <= 0) continue;
      const name = pair.slice(0, split), value = pair.slice(split + 1);
      if (!value || /;\s*max-age=0(?:;|$)/i.test(cookie)) client.cookies.delete(name);
      else client.cookies.set(name, value);
    }
    if (client.cookies.has(ACCESS) || client.cookies.has(REFRESH)) client.active = true;
  }
  async function account(client, { method = 'GET', body, bearer, name, expected = 200 } = {}) {
    const response = await call(new URL('/api/solo-auth', origin), { method,
      headers: { Cookie: cookieHeader(client, Boolean(bearer)), Origin: origin,
        'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    capture(client, response);
    const data = json(response, name);
    need(response.status === expected, name + '_HTTP_' + response.status);
    need(/\bno-store\b/.test(header(response, 'cache-control') || ''), name + '_MUST_NOT_CACHE');
    // Check response shape without ever writing bodies, tokens or emails to logs.
    need(!('access_token' in data) && !('refresh_token' in data) && !('password' in data), 'CREDENTIAL_IN_ACCOUNT_JSON');
    return { response, data };
  }
  async function rpc(name, params) {
    const response = await call(new URL('/rest/v1/rpc/' + name, COMMERCIAL_ORIGIN), {
      method: 'POST', headers: { apikey: config.secret, 'Content-Type': 'application/json' },
      body: JSON.stringify(params) });
    need(response.status === 200, 'RPC_HTTP_' + response.status);
    return { response, data: json(response, 'RPC') };
  }
  const paramsFor = session => ({ p_user_id: session.userId, p_session_id: session.sessionId });
  function signedIn(client, data) {
    need(data.enabled === true && data.authenticated === true && data.user?.id === client.identity.userId,
      'EXPECTED_TEST_IDENTITY_REQUIRED');
    // This harness cannot call /api/solo-chat. Its target must also keep customer
    // inference closed throughout these provider-free Auth/database checks.
    need(data.chatEnabled === false, 'CUSTOMER_CHAT_MUST_REMAIN_DISABLED');
    return usage(data);
  }
  async function login(identity) {
    const client = { identity, cookies: new Map(), active: false };
    clients.push(client);
    let url = config.target;
    let accessed = false;
    for (let i = 0; i < 5; i++) {
      const response = await call(url, { headers: { Cookie: cookieHeader(client) } });
      capture(client, response);
      if (response.status >= 300 && response.status < 400) {
        const location = header(response, 'location');
        need(typeof location === 'string', 'PREVIEW_REDIRECT_MISSING');
        const next = new URL(location, url);
        need(next.origin === origin, 'PREVIEW_CROSS_ORIGIN_REDIRECT');
        url = next;
        continue;
      }
      need(response.status === 200, 'PREVIEW_ACCESS_REQUIRED');
      accessed = true;
      break;
    }
    need(accessed, 'PREVIEW_TOO_MANY_REDIRECTS');
    const signedOut = await account(client, { name: 'SIGNED_OUT_STATUS' });
    need(signedOut.data.enabled === true && signedOut.data.authenticated === false &&
      signedOut.data.chatEnabled === false, 'AUTH_ONLY_PREVIEW_REQUIRED');
    const { response, data } = await account(client, { method: 'POST', name: 'LOGIN',
      body: { action: 'login', email: identity.email, password: identity.password } });
    // Mark a returned session for cleanup before subsequent assertions can fail.
    client.active = client.cookies.has(ACCESS) || client.cookies.has(REFRESH);
    sessionCookies(response);
    client.before = signedIn(client, data);
    client.session = sessionFromCookie(client);
    pass('REAL_LOGIN_AND_SECURE_COOKIES');
    return client;
  }
  async function logout(client) {
    if (!client.active) return;
    const retained = new Map(client.cookies);
    try {
      const { response, data } = await account(client, { method: 'POST', name: 'LOGOUT', body: { action: 'logout' } });
      sessionCookies(response, true);
      need(data.authenticated === false && !client.cookies.has(ACCESS) && !client.cookies.has(REFRESH),
        'LOGOUT_NOT_CONFIRMED');
      client.active = false;
    } catch (error) {
      // Local cookie deletion is not proof of remote revocation. Keep the
      // in-memory fixture session for the final cleanup attempt on failure.
      client.cookies = retained;
      throw error;
    }
  }
  const reservations = [];
  try {
    for (const identity of config.identities) await login(identity);
    if (config.mode === 'auth') {
      const client = clients[0];
      const status = await account(client, { name: 'LIVE_STATUS' });
      need(signedIn(client, status.data).remaining === client.before.remaining, 'STATUS_CONSUMED_ALLOWANCE');
      pass('LIVE_SESSION_STATUS_WITHOUT_DEBIT');
      const oldRefresh = client.cookies.get(REFRESH);
      const rotated = await account(client, { method: 'POST', name: 'REFRESH', body: { action: 'refresh' } });
      sessionCookies(rotated.response);
      need(client.cookies.get(REFRESH) !== oldRefresh, 'REFRESH_NOT_ROTATED');
      need(signedIn(client, rotated.data).remaining === client.before.remaining, 'REFRESH_CONSUMED_ALLOWANCE');
      const refreshed = sessionFromCookie(client);
      need(refreshed.sessionId === client.session.sessionId, 'REFRESH_CHANGED_SESSION');
      client.session = refreshed;
      pass('REAL_REFRESH_ROTATION');
      await logout(client);
      pass('REMOTE_LOGOUT_AND_COOKIE_CLEAR');
      need(refreshed.expires > Math.floor(Date.now() / 1000), 'REVOKED_TOKEN_ALREADY_EXPIRED');
      const stale = await account(client, { name: 'REVOKED_STATUS', bearer: refreshed.token, expected: 401 });
      need(stale.data.code === 'invalid_session' && stale.data.authenticated === false, 'REVOKED_STATUS_ACCEPTED');
      const revokedStatus = await rpc('solo_customer_status', paramsFor(refreshed));
      need(revokedStatus.data.active === false && revokedStatus.data.code === 'invalid_session', 'REVOKED_DATABASE_STATUS_ACCEPTED');
      pass('UNEXPIRED_REVOKED_SESSION_REJECTED');
      const denied = await rpc('solo_admit_request', { ...paramsFor(refreshed), p_request_id: randomUUID(),
        p_fingerprint: createHash('sha256').update('revoked-' + runId).digest('hex') });
      need(denied.data.allowed === false && denied.data.code === 'invalid_session', 'REVOKED_ADMISSION_ACCEPTED');
      pass('REVOKED_SESSION_CANNOT_RESERVE');
    } else {
      const repeatedId = randomUUID();
      const batch = clients.flatMap((client, userIndex) => Array.from({ length: config.attempts }, () => {
        const requestId = config.scenario === 'duplicate' ? repeatedId : randomUUID();
        const fingerprint = createHash('sha256').update('SOLO_ADMISSION_CHECK:' + runId + ':' + requestId).digest('hex');
        return { client, userIndex, requestId, fingerprint };
      }));
      // Print only noncredential UUIDs before dispatch. A timeout is not retried:
      // it may already have reserved allowance and needs a ledger inspection.
      log(JSON.stringify({ case: 'RACE_PLANNED', scenario: config.scenario, runId,
        requestIds: [...new Set(batch.map(item => item.requestId))] }));
      const started = Date.now();
      const settled = await Promise.allSettled(batch.map(async item => ({ ...item,
        ...await rpc('solo_admit_request', { ...paramsFor(item.client.session),
          p_request_id: item.requestId, p_fingerprint: item.fingerprint }) })));
      need(settled.every(item => item.status === 'fulfilled'), 'RACE_TRANSPORT_FAILED_INSPECT_LEDGER');
      const results = settled.map(item => item.value);
      need(new Set(results.map(result => result.response.connectionId)).size === batch.length,
        'INDEPENDENT_CONNECTIONS_NOT_OBSERVED');
      const deniedCode = config.scenario === 'duplicate' ? 'duplicate_request' : config.scenario + '_limit';
      for (const result of results) {
        need(result.data.request_id === result.requestId, 'RACE_REQUEST_ID_MISMATCH');
        need((result.data.allowed === true && result.data.code === 'admitted') ||
          (result.data.allowed === false && result.data.code === deniedCode), 'RACE_UNEXPECTED_OUTCOME');
        if (!result.data.allowed && config.scenario !== 'duplicate') {
          need(Number.isInteger(result.data.retry_after_seconds) && result.data.retry_after_seconds > 0 &&
            result.data.retry_after_seconds <= 86400, 'QUOTA_RETRY_AFTER_INVALID');
        }
        if (result.data.allowed) reservations.push({ requestId: result.requestId, userIndex: result.userIndex });
      }
      need(reservations.length === config.expected, 'RACE_ADMISSION_COUNT_MISMATCH');
      pass('INDEPENDENT_' + config.scenario.toUpperCase() + '_RACE', { admitted: reservations.length,
        denied: batch.length - reservations.length, independentConnections: batch.length,
        durationMs: Date.now() - started, hostedTransport: transport === httpsRequest });
      if (config.scenario === 'duplicate') {
        const conflict = await rpc('solo_admit_request', { ...paramsFor(clients[0].session),
          p_request_id: repeatedId, p_fingerprint: createHash('sha256').update('different-' + runId).digest('hex') });
        need(conflict.data.allowed === false && conflict.data.code === 'request_conflict', 'CHANGED_DUPLICATE_ACCEPTED');
        pass('CHANGED_DUPLICATE_REJECTED');
      }
      for (const [userIndex, client] of clients.entries()) {
        const after = await account(client, { name: 'POST_RACE_STATUS' });
        const observed = signedIn(client, after.data);
        const admitted = reservations.filter(row => row.userIndex === userIndex).length;
        need(observed.limit === client.before.limit && observed.remaining === client.before.remaining - admitted,
          'PERSISTENT_ALLOWANCE_MISMATCH');
      }
      pass('PERSISTENT_ALLOWANCE_MATCHES_RESERVATIONS');
    }
  } finally {
    const cleanup = await Promise.allSettled(clients.filter(client => client.active).map(logout));
    need(cleanup.every(result => result.status === 'fulfilled'), 'TEST_SESSION_CLEANUP_FAILED');
  }
  pass('TEST_SESSIONS_CLOSED');
  const result = { mode: config.mode, scenario: config.scenario || null, checks,
    runId, target: origin, project: 'tymayhazawkofmiypeqt',
    reservedRequestIds: reservations.map(row => row.requestId),
    providerCalls: 0, hostedTransport: transport === httpsRequest };
  log(JSON.stringify({ case: 'SOLO_CUSTOMER_HOSTED_CHECK_PASS', ...result }));
  return result;
}

if (require.main === module) {
  runHostedChecks().catch(error => {
    // Never print raw errors: they may contain a password, URL, cookie or key.
    console.error('SOLO_CUSTOMER_HOSTED_CHECK_FAIL_' +
      (error instanceof HostedFailure ? error.code : 'NETWORK_OR_RUNTIME_ERROR'));
    process.exitCode = 1;
  });
}
module.exports = { runHostedChecks, configuration, httpsRequest, HostedFailure };
