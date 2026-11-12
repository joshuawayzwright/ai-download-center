const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createReportHandler } = require('../api/solo-report.js');
const { HttpError } = require('../lib/solo-customer-access.cjs');

const ACCESS = 'dummy-access-token-for-tests';
const REQUEST_ID = '3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
const IDENTITY = { userId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002' };
const ENV = { VERCEL_ENV: 'preview', SOLO_CUSTOMER_AUTH_ENABLED: 'true' };
const REPORT = { requestId: REQUEST_ID, reason: 'harmful', note: '  This advice is unsafe.  ', reply: 'The reported reply.' };

function setup({ env = ENV, verify, submit } = {}) {
  const submitted = [];
  const handler = createReportHandler({ env,
    verify: verify || (async token => { assert.equal(token, ACCESS); return IDENTITY; }),
    submit: submit || (async (identity, report) => { submitted.push({ identity, report }); return { ok: true, code: 'reported' }; }) });
  return { submitted, async request({ method = 'POST', body = REPORT, headers } = {}) {
    const req = Readable.from([]);
    req.method = method;
    req.headers = headers || { host: 'solo-preview.example', 'content-type': 'application/json', authorization: 'Bearer ' + ACCESS };
    req.body = body;
    let result;
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
      end(v) { result = { status: this.statusCode, body: JSON.parse(v), headers: this.headers }; } };
    await handler(req, res);
    return result;
  } };
}

test('a signed-in app customer can report a reply; identity comes from the session', async () => {
  const api = setup();
  const result = await api.request();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, code: 'reported' });
  assert.deepEqual(api.submitted[0], { identity: IDENTITY,
    report: { requestId: REQUEST_ID, reason: 'harmful', note: 'This advice is unsafe.', replyText: 'The reported reply.' } });
});

test('reports require a session and the account release gate', async () => {
  let result = await setup().request({ headers: { host: 'solo-preview.example', 'content-type': 'application/json' } });
  assert.equal(result.status, 401);
  for (const env of [{ ...ENV, SOLO_CUSTOMER_AUTH_ENABLED: 'false' }, { ...ENV, VERCEL_ENV: 'production' }]) {
    const api = setup({ env });
    result = await api.request();
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'reports_disabled');
    assert.equal(api.submitted.length, 0);
  }
});

test('cookie reports must be exact same-origin requests', async () => {
  const api = setup();
  const result = await api.request({ headers: { host: 'solo-preview.example', origin: 'https://evil.example',
    'content-type': 'application/json', cookie: '__Host-solo-access=' + ACCESS } });
  assert.equal(result.status, 403);
  assert.equal(api.submitted.length, 0);
});

test('invalid reports are rejected before any account lookup', async () => {
  const bad = [
    { ...REPORT, requestId: 'not-a-uuid' }, { ...REPORT, reason: 'spam' }, { ...REPORT, reply: '' },
    { ...REPORT, reply: 'x'.repeat(4001) }, { ...REPORT, note: 'x'.repeat(501) }, { ...REPORT, reply: 'bad\u0000text' }
  ];
  for (const body of bad) {
    let verified = false;
    const api = setup({ verify: async () => { verified = true; return IDENTITY; } });
    const result = await api.request({ body });
    assert.equal(result.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(verified, false);
  }
});

test('database outcomes map to clear HTTP errors with Retry-After for the daily limit', async () => {
  const cases = [
    [new HttpError(404, 'request_not_found', 'That reply could not be found for this account.'), 404],
    [new HttpError(429, 'report_limit', 'limit', { 'Retry-After': '120' }), 429],
    [new Error('unexpected'), 503]
  ];
  for (const [error, status] of cases) {
    const result = await setup({ submit: async () => { throw error; } }).request();
    assert.equal(result.status, status);
    if (status === 429) assert.equal(result.headers['Retry-After'], '120');
  }
});

test('only POST is accepted', async () => {
  const result = await setup().request({ method: 'GET' });
  assert.equal(result.status, 405);
});
