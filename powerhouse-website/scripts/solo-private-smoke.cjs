// Opt-in, server-side verification of the deployed SOLO HTTP endpoint.
// Uses existing Preview credentials; never prints tokens, cookies or model text.
const { randomBytes } = require('node:crypto');

class SmokeFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireCheck = (ok, code) => { if (!ok) throw new SmokeFailure(code); };

function validateTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new SmokeFailure('TARGET_REQUIRED'); }
  requireCheck(url.protocol === 'https:' && !url.username && !url.password && !url.port,
    'TARGET_MUST_BE_HTTPS');
  // Restrict credential forwarding to an immutable deployment of this project.
  requireCheck(/^solo-provider-industrial-[a-z0-9]+-wrightwayz\.vercel\.app$/.test(url.hostname),
    'TARGET_NOT_SOLO_PREVIEW');
  requireCheck([...url.searchParams.keys()].every(key => key === '_vercel_share'),
    'TARGET_QUERY_NOT_ALLOWED');
  url.pathname = '/';
  url.hash = '';
  return url;
}

async function runSmoke({ env = process.env, fetcher = globalThis.fetch, log = console.log } = {}) {
  requireCheck(env.VERCEL_ENV === 'preview', 'PREVIEW_ONLY');
  requireCheck(env.SOLO_PRIVATE_TEST_ENABLED === 'true', 'PRIVATE_GATE_REQUIRED');
  const token = env.SOLO_PRIVATE_TEST_TOKEN;
  requireCheck(typeof token === 'string' && token.length >= 32, 'PRIVATE_TOKEN_REQUIRED');
  const target = validateTarget(env.SOLO_SMOKE_TARGET_URL);
  const origin = target.origin;
  const cookies = new Map();
  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const captureCookies = response => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };
  const boundedFetch = (url, options = {}) => fetcher(url, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(22000)
  });

  // Vercel's temporary share URL grants deployment access, not SOLO inference.
  // Follow only same-origin redirects; never forward credentials elsewhere.
  let accessURL = target;
  let accessed = false;
  for (let step = 0; step < 5; step++) {
    const response = await boundedFetch(accessURL, { headers: { Cookie: cookieHeader() } });
    captureCookies(response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      requireCheck(Boolean(location), 'ACCESS_REDIRECT_MISSING');
      const next = new URL(location, accessURL);
      requireCheck(next.origin === origin, 'ACCESS_CROSS_ORIGIN_REDIRECT');
      accessURL = next;
      continue;
    }
    requireCheck(response.status === 200, 'DEPLOYMENT_ACCESS_FAILED');
    accessed = true;
    break;
  }
  requireCheck(accessed, 'ACCESS_TOO_MANY_REDIRECTS');

  async function request(name, { method = 'POST', body, auth, requestOrigin = origin, expected }) {
    const headers = { Cookie: cookieHeader(), Origin: requestOrigin, 'Content-Type': 'application/json' };
    if (auth) headers['x-solo-test-token'] = auth;
    const started = Date.now();
    const response = await boundedFetch(new URL('/api/solo-chat', origin), {
      method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
    });
    let data;
    try { data = await response.json(); } catch { throw new SmokeFailure(`${name}_NOT_JSON`); }
    const evidence = {
      case: name, status: response.status, durationMs: Date.now() - started,
      requestId: response.headers.get('x-vercel-id') || null
    };
    if (Number.isInteger(data.upstreamStatus)) evidence.upstreamStatus = data.upstreamStatus;
    log(JSON.stringify(evidence));
    requireCheck(response.status === expected, `${name}_HTTP_${response.status}`);
    if (expected !== 200) requireCheck(!data.reply, `${name}_UNEXPECTED_REPLY`);
    return data;
  }

  const simple = { messages: [{ role: 'user', content: 'Hello SOLO' }] };
  await request('METHOD_REJECTED', { method: 'GET', expected: 405 });
  await request('MISSING_TOKEN_REJECTED', { body: simple, expected: 401 });
  await request('WRONG_TOKEN_REJECTED', { body: simple, auth: 'invalid-smoke-token', expected: 401 });
  await request('CROSS_ORIGIN_REJECTED', {
    body: simple, auth: token, requestOrigin: 'https://not-solo.invalid', expected: 403
  });
  await request('OVERSIZED_BODY_REJECTED', {
    body: { ...simple, extra: 'x'.repeat(16000) }, auth: token, expected: 413
  });

  const marker = `SOLO-${randomBytes(6).toString('hex')}`;
  const firstPrompt = `Remember the verification code ${marker} for this conversation. Reply with only READY.`;
  const first = await request('GEMINI_FIRST_TURN', {
    body: { messages: [{ role: 'user', content: firstPrompt }] }, auth: token, expected: 200
  });
  requireCheck(first.provider === 'gemini' && typeof first.reply === 'string' && first.reply.trim(),
    'FIRST_TURN_INVALID_REPLY');
  requireCheck(first.model === (env.SOLO_AI_MODEL || 'gemini-3.5-flash-lite'), 'WRONG_GEMINI_MODEL');
  const second = await request('GEMINI_CONTEXT_TURN', {
    body: { messages: [
      { role: 'user', content: firstPrompt },
      { role: 'assistant', content: first.reply.slice(0, 1200) },
      { role: 'user', content: 'What verification code did I ask you to remember? Reply only with that code.' }
    ] }, auth: token, expected: 200
  });
  requireCheck(second.provider === 'gemini' && second.model === first.model &&
    typeof second.reply === 'string' && second.reply.includes(marker), 'CONTEXT_NOT_PRESERVED');
  log('SOLO_DEPLOYED_CHAT_E2E_PASS');
  return { checks: 7, provider: 'gemini', model: first.model, target: origin };
}

if (require.main === module) {
  runSmoke().catch(error => {
    // Unexpected exceptions can contain request URLs or credentials. Never print them.
    console.error('SOLO_DEPLOYED_CHAT_E2E_FAIL_' +
      (error instanceof SmokeFailure ? error.code : 'NETWORK_OR_RUNTIME_ERROR'));
    process.exitCode = 1;
  });
}
module.exports = { runSmoke, validateTarget, SmokeFailure };
