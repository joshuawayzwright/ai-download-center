const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const handler = require('../api/solo-chat.js');
const { collectSources, systemInstruction } = handler;

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


const grounding = chunks => ({ candidates: [{ content: { parts: [{ text: 'Answer.' }] }, finishReason: 'STOP',
  groundingMetadata: { groundingChunks: chunks } }] });

test('sources keep https web chunks only, de-duplicated, titled and capped at 8', () => {
  const chunks = [{ web: { uri: 'https://example.com/a', title: 'Example\n A' } },
    { web: { uri: 'https://example.com/a', title: 'dup' } },
    { web: { uri: 'http://insecure.test/', title: 'no' } },
    { web: { uri: 'javascript:alert(1)', title: 'no' } },
    { web: { uri: 'https://user:pw@example.com/', title: 'no' } },
    { web: { uri: 'https://untitled.test/x' } },
    { retrievedContext: { uri: 'https://x.test' } }, null,
    ...Array.from({ length: 12 }, (_, i) => ({ web: { uri: `https://s${i}.test/`, title: 'T'.repeat(300) } }))];
  const sources = collectSources(grounding(chunks));
  assert.equal(sources.length, 8);
  assert.deepEqual(sources[0], { title: 'Example  A', url: 'https://example.com/a' });
  assert.deepEqual(sources[1], { title: 'untitled.test', url: 'https://untitled.test/x' });
  assert.equal(sources[2].title.length, 200);
  assert.ok(sources.every(s => s.url.startsWith('https://')));
  assert.deepEqual(collectSources({}), []);
});

test('search switch adds the Google Search tool, the search prompt and sources to the done event', async () => {
  let sent;
  await withEnv({ ...PRIVATE, SOLO_AI_SEARCH: 'true', SOLO_AI_MODEL: 'gemini-3.8-flash' }, async (u, o) => {
    sent = { url: u, body: JSON.parse(o.body) };
    return sse([{ candidates: [{ content: { parts: [{ text: 'Rates rose.' }] } }] },
      { ...grounding([{ web: { uri: 'https://rba.gov.au/', title: 'rba.gov.au' } }]), usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } }]);
  }, async () => {
    const r = await request({ body: ask(), headers: owner });
    const done = r.events.find(e => e.event === 'done').data;
    assert.deepEqual(done.sources, [{ title: 'rba.gov.au', url: 'https://rba.gov.au/' }]);
    assert.equal(done.model, 'gemini-3.8-flash');
  });
  assert.match(sent.url, /models\/gemini-3\.8-flash:streamGenerateContent/);
  assert.deepEqual(sent.body.tools, [{ google_search: {} }]);
  assert.equal(sent.body.generationConfig.maxOutputTokens, 4096);
  assert.match(sent.body.systemInstruction.parts[0].text, /Google Search/);
  assert.doesNotMatch(sent.body.systemInstruction.parts[0].text, /cannot browse/);
});

test('without the search switch there is no tool and the prompt says SOLO cannot browse', async () => {
  let sent;
  await withEnv({ ...PRIVATE, SOLO_AI_SEARCH: 'false' }, async (u, o) => { sent = JSON.parse(o.body);
    return sse([{ candidates: [{ content: { parts: [{ text: 'Hi.' }] }, finishReason: 'STOP' }] }]); }, async () => {
    const r = await request({ body: ask(), headers: owner });
    assert.equal(r.events.at(-1).data.sources, undefined);
  });
  assert.equal(sent.tools, undefined);
  assert.equal(sent.generationConfig.maxOutputTokens, 1024);
  assert.match(systemInstruction(new Date(), false), /cannot browse/);
});

test('non-streaming replies carry sources too', async () => {
  await withEnv({ ...PRIVATE, SOLO_AI_SEARCH: 'true' }, async () => ({ ok: true, status: 200,
    json: async () => grounding([{ web: { uri: 'https://a.test/', title: 'A' } }]) }), async () => {
    const r = await request({ body: ask({ stream: false }), headers: owner });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sources, [{ title: 'A', url: 'https://a.test/' }]);
  });
});
