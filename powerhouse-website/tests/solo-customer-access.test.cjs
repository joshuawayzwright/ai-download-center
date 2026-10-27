const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { HttpError, parseAccessToken, verifyCustomer, customerStatus, reserve, finalize } = require('../lib/solo-customer-access.cjs');
const handler = require('../api/solo-chat.js');

// Deliberately unsigned test JWTs. Only the mocked Auth service accepts them.
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://abcdefghijklmnopqrst.supabase.co';
const MODEL = 'gemini-3.5-flash-lite';
const claims = extra => ({ sub: USER, session_id: SESSION, iss: `${ORIGIN}/auth/v1`,
  aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
const jwt = extra => [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(claims(extra))).toString('base64url'), 'test_signature'].join('.');
const TOKEN = jwt();
const IDENTITY = { userId: USER, sessionId: SESSION };
const BODY = { requestId: REQUEST, messages: [{ role: 'user', content: 'Private unit-test prompt' }] };
const ENV = {
  VERCEL_ENV: 'preview', SOLO_CUSTOMER_CHAT_ENABLED: 'true',
  SOLO_SUPABASE_URL: ORIGIN, SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  SOLO_SUPABASE_SECRET_KEY: 'sb_secret_test_only', SOLO_USAGE_HASH_SECRET: 'unit-test-hmac-only-0123456789abcdefghijklmnopqrstuvwxyz',
  SOLO_PRIVATE_TEST_ENABLED: 'true', SOLO_PRIVATE_TEST_TOKEN: 'unit-test-owner-only-0123456789abcdefghijklmnopqrstuvwxyz',
  SOLO_AI_PROVIDER: 'gemini', SOLO_AI_MODEL: MODEL, GEMINI_API_KEY: 'unit-test-gemini-only'
};
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const user = { id: USER, email: 'unit-test@example.invalid', is_anonymous: false, email_confirmed_at: '2026-10-27T00:00:00Z' };

function transport(overrides = {}) {
  const calls = [];
  const counts = { auth: 0, admit: 0, finish: 0, provider: 0, status: 0 };
  const fetcher = async (input, options) => {
    const url = new URL(input);
    let phase;
    if (url.href === `${ORIGIN}/auth/v1/user`) phase = 'auth';
    else if (url.href === `${ORIGIN}/rest/v1/rpc/solo_admit_request`) phase = 'admit';
    else if (url.href === `${ORIGIN}/rest/v1/rpc/solo_finish_request`) phase = 'finish';
    else if (url.href === `${ORIGIN}/rest/v1/rpc/solo_customer_status`) phase = 'status';
    else if (url.origin === 'https://generativelanguage.googleapis.com') phase = 'provider';
    else throw new Error('Unexpected network destination');
    counts[phase]++;
    calls.push({ phase, url: url.href, options, body: options.body ? JSON.parse(options.body) : null });
    if (phase === 'auth') {
      assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_PUBLISHABLE_KEY);
      assert.match(options.headers.Authorization, /^Bearer /);
      assert.equal(options.redirect, 'error');
    } else if (phase !== 'provider') {
      assert.equal(options.headers.apikey, ENV.SOLO_SUPABASE_SECRET_KEY);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.redirect, 'error');
    }
    if (overrides[phase]) return overrides[phase](calls.at(-1), counts[phase]);
    if (phase === 'auth') return response(200, user);
    if (phase === 'admit') return response(200, { allowed: true, code: 'admitted', request_id: REQUEST, retry_after_seconds: 0, remaining_daily: 19, daily_limit: 20 });
    if (phase === 'finish') return response(200, { ok: true, code: 'completed' });
    if (phase === 'status') return response(200, { active: true, code: 'active', remaining_daily: 20, daily_limit: 20 });
    return response(200, { candidates: [{ content: { parts: [{ text: 'SOLO customer reply' }] } }],
      usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 13 } });
  };
  return { fetcher, calls, counts };
}

async function isolated(run, overrides = {}, network = transport()) {
  const originalFetch = global.fetch;
  const keys = new Set([...Object.keys(ENV), ...Object.keys(overrides)]);
  const previous = new Map([...keys].map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries({ ...ENV, ...overrides })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  global.fetch = network.fetcher;
  try { return await run(network); }
  finally {
    global.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

async function chat({ body = BODY, headers = {} } = {}) {
  const req = Readable.from([]);
  req.method = 'POST';
  req.body = body;
  req.headers = { 'content-type': 'application/json', host: 'solo-preview.example',
    origin: 'https://solo-preview.example', authorization: `Bearer ${TOKEN}`, ...headers };
  let result;
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    end(value) { result = { status: this.statusCode, headers: this.headers, body: JSON.parse(value) }; } };
  await handler(req, res);
  return result;
}

test('access parsing supports explicit Android bearer and same-origin HTTPOnly cookie', () => {
  assert.deepEqual(parseAccessToken({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }), { token: TOKEN, source: 'bearer' });
  assert.deepEqual(parseAccessToken({ method: 'POST', headers: { host: 'solo.example', origin: 'https://solo.example', cookie: `other=1; __Host-solo-access=${TOKEN}` } }), { token: TOKEN, source: 'cookie' });
  assert.equal(parseAccessToken({ headers: { cookie: 'unrelated=value' } }), null);
  assert.equal(parseAccessToken({ method: 'GET', headers: { host: 'solo.example', cookie: `__Host-solo-access=${TOKEN}` } }).source, 'cookie');
});

test('cookie mutations require an exact HTTPS origin', () => {
  for (const origin of [undefined, 'https://attacker.invalid', 'http://solo.example', 'https://solo.example/path']) {
    assert.throws(() => parseAccessToken({ method: 'POST', headers: { host: 'solo.example', origin, cookie: `__Host-solo-access=${TOKEN}` } }), error => error instanceof HttpError && error.status === 403);
  }
});

test('ambiguous and malformed customer credentials cannot become owner requests', () => {
  for (const headers of [
    { authorization: `Bearer ${TOKEN}`, cookie: `__Host-solo-access=${TOKEN}` },
    { cookie: `__Host-solo-access=${TOKEN}; __Host-solo-access=${TOKEN}` },
    { authorization: [`Bearer ${TOKEN}`] }
  ]) assert.throws(() => parseAccessToken({ headers }), error => error.status === 400);
  for (const authorization of ['', 'Basic abc', 'Bearer one,two', 'Bearer token with spaces']) {
    assert.throws(() => parseAccessToken({ headers: { authorization } }), error => error.status === 401);
  }
});

test('verified identity comes from an online Auth check of the exact bearer token', async () => {
  const network = transport();
  const identity = await verifyCustomer(TOKEN, { env: ENV, fetcher: network.fetcher });
  assert.equal(network.counts.auth, 1);
  assert.equal(network.calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(identity.userId, USER);
  assert.equal(identity.sessionId, SESSION);
});

test('claims are validated only after Auth confirmation and reject wrong identities, issuers and expirations', async () => {
  for (const bad of [
    { sub: SESSION }, { session_id: 'invalid' }, { iss: 'https://another.supabase.co/auth/v1' },
    { exp: 1 }, { exp: '9999999999' }, { role: 'service_role' }, { aud: 'another-audience' },
    { nbf: Math.floor(Date.now() / 1000) + 3600 }
  ]) {
    const network = transport();
    await assert.rejects(verifyCustomer(jwt(bad), { env: ENV, fetcher: network.fetcher }), error => error.status === 401);
    assert.equal(network.counts.auth, 1);
  }
  const denied = transport({ auth: () => response(401, { secret: ENV.SOLO_SUPABASE_SECRET_KEY }) });
  await assert.rejects(verifyCustomer('not-even-a-jwt', { env: ENV, fetcher: denied.fetcher }), error => error.status === 401 && !error.message.includes(ENV.SOLO_SUPABASE_SECRET_KEY));
  assert.equal(denied.counts.auth, 1);
});

test('anonymous Auth users and anonymous JWT claims cannot access customer inference', async () => {
  for (const anonymousUser of [false, true]) {
    const network = transport({ auth: () => response(200, { ...user, is_anonymous: anonymousUser }) });
    await assert.rejects(verifyCustomer(jwt({ is_anonymous: !anonymousUser }), { env: ENV, fetcher: network.fetcher }), error => error.status === 403);
  }
});

test('customer gate defaults off and production cannot enable it', async () => {
  for (const env of [{ SOLO_CUSTOMER_CHAT_ENABLED: undefined }, { SOLO_CUSTOMER_CHAT_ENABLED: 'false' }, { VERCEL_ENV: 'production' }]) {
    await isolated(async network => {
      const result = await chat();
      assert.equal(result.status, 503);
      assert.equal(network.calls.length, 0);
    }, env);
  }
});

test('invalid customer credentials never fall back to a valid owner token', async () => {
  const network = transport({ auth: () => response(401, { error: 'Invalid token' }) });
  await isolated(async () => {
    const result = await chat({ headers: { authorization: 'Bearer invalid-token', 'x-solo-test-token': ENV.SOLO_PRIVATE_TEST_TOKEN } });
    assert.equal(result.status, 401);
    assert.equal(network.counts.admit, 0);
    assert.equal(network.counts.provider, 0);
  }, {}, network);
});

test('cookie/bearer ambiguity and cross-origin cookie attempts never contact Auth or Gemini', async () => {
  await isolated(async network => {
    const mixed = await chat({ headers: { cookie: `__Host-solo-access=${TOKEN}` } });
    assert.equal(mixed.status, 400);
    const missingOrigin = await chat({ headers: { authorization: undefined, origin: undefined, cookie: `__Host-solo-access=${TOKEN}` } });
    assert.equal(missingOrigin.status, 403);
    assert.equal(network.calls.length, 0);
  });
});

test('customer inference requires the approved Gemini configuration before reservation', async () => {
  for (const env of [{ GEMINI_API_KEY: undefined }, { GEMINI_API_KEY: ' ' }, { SOLO_AI_PROVIDER: 'openai' }, { SOLO_AI_MODEL: 'unapproved-model' }]) {
    await isolated(async network => {
      assert.equal((await chat()).status, 503);
      assert.equal(network.calls.length, 0);
    }, env);
  }
});

test('request UUID is required before any quota reservation or provider call', async () => {
  for (const requestId of [undefined, '', 'bad-id', 12]) {
    await isolated(async network => {
      assert.equal((await chat({ body: { ...BODY, requestId } })).status, 400);
      assert.equal(network.counts.admit, 0);
      assert.equal(network.counts.provider, 0);
    });
  }
});

test('invalid JWT identity cannot reach quota reservation or Gemini', async () => {
  await isolated(async network => {
    const result = await chat({ headers: { authorization: `Bearer ${jwt({ role: 'service_role' })}` } });
    assert.equal(result.status, 401);
    assert.equal(network.counts.auth, 1);
    assert.equal(network.counts.admit, 0);
    assert.equal(network.counts.provider, 0);
  });
});

test('all admission denials fail closed before provider access', async () => {
  const cases = [
    ['invalid_session', 401], ['access_denied', 403], ['member_blocked', 403], ['member_expired', 403],
    ['duplicate_request', 409], ['request_conflict', 409], ['disabled', 503], ['configuration_missing', 503],
    ['invalid_request', 400], ['unknown_response', 503], ['user_minute_limit', 429], ['user_daily_limit', 429],
    ['global_minute_limit', 429], ['global_daily_limit', 429]
  ];
  for (const [code, status] of cases) {
    const network = transport({ admit: () => response(200, { allowed: false, code, retry_after_seconds: 37, request_id: REQUEST }) });
    await isolated(async () => {
      const result = await chat({ headers: { 'x-solo-test-token': ENV.SOLO_PRIVATE_TEST_TOKEN } });
      assert.equal(result.status, status, code);
      if (status === 429) assert.equal(result.headers['Retry-After'], '37');
      assert.equal(network.counts.provider, 0, code);
      assert.equal(network.counts.finish, 0, code);
    }, {}, network);
  }
});

test('Auth and admission outages never invoke Gemini or reveal exception content', async () => {
  for (const phase of ['auth', 'admit']) {
    for (const failure of [() => response(500, {}), () => { throw new Error(`Never expose ${ENV.SOLO_SUPABASE_SECRET_KEY} ${TOKEN}`); }]) {
      const network = transport({ [phase]: failure });
      await isolated(async () => {
        const result = await chat();
        assert.equal(result.status, 503);
        assert.equal(network.counts.provider, 0);
        assert.equal(JSON.stringify(result).includes(ENV.SOLO_SUPABASE_SECRET_KEY), false);
        assert.equal(JSON.stringify(result).includes(TOKEN), false);
      }, {}, network);
    }
  }
});

test('malformed admission responses and mismatched request IDs cannot authorize inference', async () => {
  for (const data of [null, [], { allowed: true }, { allowed: true, code: 'admitted', request_id: SESSION }]) {
    const network = transport({ admit: () => response(200, data) });
    await isolated(async () => {
      assert.equal((await chat()).status, 503);
      assert.equal(network.counts.provider, 0);
    }, {}, network);
  }
});

test('customer request reserves once before Gemini and records usage before reporting success', async () => {
  await isolated(async network => {
    const result = await chat();
    assert.equal(result.status, 200);
    assert.equal(result.body.reply, 'SOLO customer reply');
    assert.equal(result.body.requestId, REQUEST);
    assert.deepEqual(result.body.usage, { remaining_daily: 19, daily_limit: 20 });
    assert.deepEqual(network.calls.map(call => call.phase), ['auth', 'admit', 'provider', 'finish']);
    const admission = network.calls[1].body;
    assert.equal(admission.p_user_id, USER);
    assert.equal(admission.p_session_id, SESSION);
    assert.equal(admission.p_request_id, REQUEST);
    assert.match(admission.p_fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(admission).includes(BODY.messages[0].content), false);
    assert.equal(network.calls[2].options.headers['x-goog-api-key'], ENV.GEMINI_API_KEY);
    assert.equal(network.calls[2].options.headers.Authorization, undefined);
    assert.deepEqual(network.calls[3].body, { p_user_id: USER, p_request_id: REQUEST, p_status: 'succeeded',
      p_provider: 'gemini', p_model: MODEL, p_input_tokens: 42, p_output_tokens: 13 });
  });
});

test('customer cookie POST and Android bearer without Origin share the same admission path', async () => {
  for (const headers of [{ authorization: undefined, cookie: `__Host-solo-access=${TOKEN}` }, { origin: undefined }]) {
    await isolated(async network => {
      const body = headers.cookie ? { ...BODY, expectedUserId: USER } : BODY;
      assert.equal((await chat({ headers, body })).status, 200);
      assert.equal(network.counts.admit, 1);
      assert.equal(network.counts.provider, 1);
    });
  }
});

test('provider errors and timeouts are finalized without refunding the reserved request', async () => {
  const cases = [
    [() => response(429, {}), 502, 'provider_error'],
    [() => response(200, { candidates: [] }), 502, 'provider_error'],
    [() => { throw new Error('Network failure'); }, 504, 'internal_error'],
    [() => { const error = new Error('Timeout'); error.name = 'AbortError'; throw error; }, 504, 'timeout']
  ];
  for (const [provider, status, completion] of cases) {
    const network = transport({ provider });
    await isolated(async () => {
      const result = await chat();
      assert.equal(result.status, status);
      assert.equal(result.body.reply, undefined);
      assert.deepEqual(result.body.usage, { remaining_daily: 19, daily_limit: 20 });
      assert.deepEqual(network.calls.map(call => call.phase), ['auth', 'admit', 'provider', 'finish']);
      assert.equal(network.calls[3].body.p_status, completion);
      assert.equal(network.calls[3].body.p_input_tokens, null);
      assert.equal(network.calls[3].body.p_output_tokens, null);
    }, {}, network);
  }
});

test('failed usage finalization returns 503 rather than an unrecorded successful reply', async () => {
  for (const finish of [() => response(500, {}), () => response(200, { ok: false, code: 'request_not_found' }), () => { throw Error('Database unavailable'); }]) {
    const network = transport({ finish });
    await isolated(async () => {
      const result = await chat();
      assert.equal(result.status, 503);
      assert.equal(result.body.reply, undefined);
      assert.deepEqual(result.body.usage, { remaining_daily: 19, daily_limit: 20 });
      assert.equal(network.counts.admit, 1);
      assert.equal(network.counts.provider, 1);
      assert.equal(network.counts.finish, 1);
    }, {}, network);
  }
});

test('customer status checks live access without reserving or consuming chat quota', async () => {
  const network = transport();
  const result = await customerStatus(IDENTITY, { env: ENV, fetcher: network.fetcher });
  assert.equal(result.active, true);
  assert.deepEqual(network.calls.map(call => call.phase), ['status']);
  assert.deepEqual(network.calls[0].body, { p_user_id: USER, p_session_id: SESSION });
  const revoked = transport({ status: () => response(200, { active: false, code: 'invalid_session' }) });
  await assert.rejects(customerStatus(IDENTITY, { env: ENV, fetcher: revoked.fetcher }), error => error.status === 401);
  assert.equal(revoked.counts.admit, 0);
});

test('malformed admission allowance is never exposed as customer quota', async () => {
  for (const usage of [{ remaining_daily: '19', daily_limit: 20 }, { remaining_daily: -1, daily_limit: 20 },
    { remaining_daily: 21, daily_limit: 20 }, { remaining_daily: 19, daily_limit: Infinity }]) {
    const network = transport({ admit: () => response(200, { allowed: true, code: 'admitted', request_id: REQUEST, ...usage }) });
    await isolated(async () => {
      const result = await chat();
      assert.equal(result.status, 200);
      assert.equal(result.body.usage, undefined);
    }, {}, network);
  }
});

test('request fingerprints are keyed, stable, and change with messages or model', async () => {
  const network = transport();
  const options = { env: ENV, fetcher: network.fetcher };
  for (const request of [
    { requestId: REQUEST, messages: BODY.messages, model: MODEL },
    { requestId: REQUEST, messages: BODY.messages, model: MODEL },
    { requestId: REQUEST, messages: [{ role: 'user', content: 'Changed private prompt' }], model: MODEL },
    { requestId: REQUEST, messages: BODY.messages, model: 'another-model' }
  ]) await reserve(IDENTITY, request, options);
  const fingerprints = network.calls.map(call => call.body.p_fingerprint);
  assert.equal(fingerprints[0], fingerprints[1]);
  assert.notEqual(fingerprints[0], fingerprints[2]);
  assert.notEqual(fingerprints[0], fingerprints[3]);
  const otherKey = transport();
  await reserve(IDENTITY, { requestId: REQUEST, messages: BODY.messages, model: MODEL }, { env: { ...ENV, SOLO_USAGE_HASH_SECRET: 'a-different-unit-test-hmac-secret-0123456789' }, fetcher: otherKey.fetcher });
  assert.notEqual(fingerprints[0], otherKey.calls[0].body.p_fingerprint);
});

test('unusable server keys and hashing configuration fail before provider access', async () => {
  for (const env of [{ SOLO_SUPABASE_PUBLISHABLE_KEY: undefined }, { SOLO_SUPABASE_SECRET_KEY: undefined }, { SOLO_USAGE_HASH_SECRET: 'short' }, { SOLO_SUPABASE_URL: 'https://attacker.invalid' }]) {
    await isolated(async network => {
      assert.equal((await chat()).status, 503);
      assert.equal(network.counts.provider, 0);
    }, env);
  }
});

test('finalization bounds token metadata and accepts an identical already-completed result', async () => {
  const network = transport({ finish: () => response(200, { ok: true, code: 'already_completed' }) });
  for (const [inputTokens, outputTokens] of [[Infinity, -1], [1000001, '42']]) {
    await finalize(IDENTITY, { requestId: REQUEST, status: 'succeeded', provider: 'gemini', model: MODEL,
      inputTokens, outputTokens }, { env: ENV, fetcher: network.fetcher });
    assert.equal(network.calls.at(-1).body.p_input_tokens, null);
    assert.equal(network.calls.at(-1).body.p_output_tokens, null);
  }
});

test('existing private owner path remains independent when no customer credentials are supplied', async () => {
  await isolated(async network => {
    const result = await chat({ body: { messages: BODY.messages }, headers: { authorization: undefined, 'x-solo-test-token': ENV.SOLO_PRIVATE_TEST_TOKEN } });
    assert.equal(result.status, 200);
    assert.equal(result.body.usage, undefined);
    assert.deepEqual(network.calls.map(call => call.phase), ['provider']);
  }, { SOLO_CUSTOMER_CHAT_ENABLED: 'false', SOLO_SUPABASE_URL: undefined, SOLO_SUPABASE_SECRET_KEY: undefined });
});
