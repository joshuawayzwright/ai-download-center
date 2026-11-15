const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const handler = require('../api/solo-chat.js');

const TEST_TOKEN = '0123456789abcdefghijklmnopqrstuvwxyz';
const ORIGIN = 'https://abcdefghijklmnopqrst.supabase.co';
const USER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '33333333-3333-4333-8333-333333333333';

// Captures either a JSON reply or a server-sent event stream.
function request({ body, headers = {} }) {
  const req = Readable.from([]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', host: 'solo.example', ...headers };
  req.body = body;
  let resolve;
  const finished = new Promise(r => { resolve = r; });
  let written = '';
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, write(s) { written += s; return true; },
    end(s) {
      if (s !== undefined) return resolve({ status: this.statusCode, body: JSON.parse(s), headers: this.headers });
      resolve({ status: this.statusCode, events: parse(written), headers: this.headers });
    } };
  return handler(req, res).then(() => finished);
}

function parse(text) {
  return text.split('\n\n').filter(Boolean).map(block => {
    const event = /^event: (.+)$/m.exec(block)[1];
    return { event, data: JSON.parse(/^data: (.+)$/m.exec(block)[1]) };
  });
}

// An upstream SSE body delivered in awkward chunks (split mid-line).
function sse(chunks) {
  const text = chunks.map(c => 'data: ' + JSON.stringify(c) + '\r\n\r\n').join('');
  const encoder = new TextEncoder();
  const pieces = [text.slice(0, 17), text.slice(17, 60), text.slice(60)].filter(Boolean);
  return { ok: true, status: 200, body: (async function* () { for (const p of pieces) yield encoder.encode(p); })() };
}

async function withEnv(env, fetchImpl, run) {
  const previous = new Map(Object.keys(env).map(k => [k, process.env[k]]));
  const previousFetch = global.fetch;
  Object.assign(process.env, env);
  global.fetch = fetchImpl;
  try { return await run(); } finally {
    global.fetch = previousFetch;
    for (const [k, v] of previous) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const PRIVATE = { SOLO_PRIVATE_TEST_ENABLED: 'true', SOLO_PRIVATE_TEST_TOKEN: TEST_TOKEN, GEMINI_API_KEY: 'test-only',
  SOLO_AI_PROVIDER: 'gemini', SOLO_AI_MODEL: 'gemini-3.5-flash-lite', VERCEL_ENV: 'preview' };
const owner = { 'x-solo-test-token': TEST_TOKEN };
const ask = (extra = {}) => ({ messages: [{ role: 'user', content: 'Plan my week' }], stream: true, ...extra });

test('streaming relays visible text deltas, then one done event with the full reply', async () => {
  let url, sent;
  await withEnv(PRIVATE, async (u, o) => { url = u; sent = JSON.parse(o.body); return sse([
    { candidates: [{ content: { parts: [{ text: 'secret plan', thought: true }, { text: 'Here is ' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'your **plan**.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
  ]); }, async () => {
    const r = await request({ body: ask(), headers: owner });
    assert.equal(r.status, 200);
    assert.match(r.headers['Content-Type'], /^text\/event-stream/);
    assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.deepEqual(r.events.map(e => e.event), ['delta', 'delta', 'done']);
    assert.deepEqual(r.events.slice(0, 2).map(e => e.data.text), ['Here is ', 'your **plan**.']);
    assert.equal(r.events[2].data.reply, 'Here is your **plan**.');
    assert.equal(r.events[2].data.truncated, undefined);
  });
  assert.match(url, /:streamGenerateContent\?alt=sse$/);
  assert.equal(sent.generationConfig.maxOutputTokens, 1024);
  assert.match(sent.systemInstruction.parts[0].text, /Australian English/);
  assert.match(sent.systemInstruction.parts[0].text, /Today's date is /);
});

test('a reply cut off by the token cap is marked truncated', async () => {
  await withEnv(PRIVATE, async () => sse([{ candidates: [{ content: { parts: [{ text: 'Long answer' }] }, finishReason: 'MAX_TOKENS' }] }]),
    async () => {
      const r = await request({ body: ask(), headers: owner });
      assert.equal(r.events.at(-1).data.truncated, true);
    });
});

test('an upstream failure before streaming is still a normal JSON error', async () => {
  await withEnv(PRIVATE, async () => ({ ok: false, status: 429 }), async () => {
    const r = await request({ body: ask(), headers: owner });
    assert.equal(r.status, 502);
    assert.equal(r.body.upstreamStatus, 429);
  });
});

test('an empty or broken stream ends with an error event, never done', async () => {
  await withEnv(PRIVATE, async () => sse([{ candidates: [{ content: { parts: [{ text: 'only thoughts', thought: true }] } }] }]),
    async () => {
      const r = await request({ body: ask(), headers: owner });
      assert.deepEqual(r.events.map(e => e.event), ['error']);
      assert.equal(r.events[0].data.code, 'empty_reply');
    });
  const broken = { ok: true, status: 200, body: (async function* () {
    yield new TextEncoder().encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Partial' }] } }] }) + '\n\n');
    throw new Error('connection reset');
  })() };
  await withEnv(PRIVATE, async () => broken, async () => {
    const r = await request({ body: ask(), headers: owner });
    assert.deepEqual(r.events.map(e => e.event), ['delta', 'error']);
    assert.equal(r.events[1].data.code, 'interrupted');
  });
});

test('stream must be a boolean; non-streaming replies are unchanged', async () => {
  const bad = await request({ body: ask({ stream: 'yes' }), headers: owner });
  assert.equal(bad.status, 400);
  await withEnv(PRIVATE, async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Plain JSON' }] } }] }) }),
    async () => {
      const r = await request({ body: ask({ stream: false }), headers: owner });
      assert.equal(r.status, 200);
      assert.equal(r.body.reply, 'Plain JSON');
    });
});

test('assistant history turns may be up to 4,000 characters; user turns stay at 1,200', async () => {
  const history = c => ({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: c }, { role: 'user', content: 'more' }] });
  await withEnv(PRIVATE, async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }),
    async () => {
      assert.equal((await request({ body: history('a'.repeat(4000)), headers: owner })).status, 200);
      assert.equal((await request({ body: history('a'.repeat(4001)), headers: owner })).status, 400);
      assert.equal((await request({ body: { messages: [{ role: 'user', content: 'x'.repeat(1201) }] }, headers: owner })).status, 400);
    });
});

test('customer streaming reserves before the provider and records completion before done', async () => {
  const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = [encode({ alg: 'RS256' }), encode({ sub: USER, session_id: '22222222-2222-4222-8222-222222222222',
    iss: ORIGIN + '/auth/v1', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');
  const calls = [];
  let finished;
  const env = { ...PRIVATE, SOLO_CUSTOMER_CHAT_ENABLED: 'true', SOLO_SUPABASE_URL: ORIGIN,
    SOLO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only', SOLO_SUPABASE_SECRET_KEY: 'sb_secret_test_only',
    SOLO_USAGE_HASH_SECRET: 'unit-test-hmac-only-0123456789abcdefghijklmnopqrstuvwxyz' };
  await withEnv(env, async (url, options) => {
    if (url === ORIGIN + '/auth/v1/user') { calls.push('auth'); return { ok: true, status: 200, json: async () => ({ id: USER,
      email: 'c@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false }) }; }
    if (url === ORIGIN + '/rest/v1/rpc/solo_admit_request') { calls.push('admit'); return { ok: true, status: 200,
      json: async () => ({ allowed: true, code: 'admitted', request_id: REQUEST, remaining_daily: 19, daily_limit: 20 }) }; }
    if (url === ORIGIN + '/rest/v1/rpc/solo_finish_request') { calls.push('finish'); finished = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, code: 'completed' }) }; }
    calls.push('provider');
    return sse([{ candidates: [{ content: { parts: [{ text: 'Customer reply' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }]);
  }, async () => {
    const r = await request({ body: ask({ requestId: REQUEST }), headers: { authorization: 'Bearer ' + token } });
    assert.deepEqual(calls, ['auth', 'admit', 'provider', 'finish']);
    const done = r.events.at(-1);
    assert.equal(done.event, 'done');
    assert.equal(done.data.requestId, REQUEST);
    assert.deepEqual(done.data.usage, { remaining_daily: 19, daily_limit: 20 });
    assert.equal(finished.p_status, 'succeeded');
    assert.equal(finished.p_input_tokens, 7);
    assert.equal(finished.p_output_tokens, 3);
  });
});
