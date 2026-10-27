// Preview-only account sessions for the existing SOLO API. No public signup.
// Provider and Supabase privileged credentials are never sent to the browser.
const access = require('../lib/solo-customer-access.cjs');
const ACCESS_COOKIE = '__Host-solo-access';
const REFRESH_COOKIE = '__Host-solo-refresh';
const MAX_BODY_BYTES = 8192;
const COOKIE_FLAGS = '; Path=/; Secure; HttpOnly; SameSite=Strict';

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Authorization, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function fail(status, code, message) { return new access.HttpError(status, code, message); }
function clearCookies(res) {
  res.setHeader('Set-Cookie', [ACCESS_COOKIE, REFRESH_COOKIE]
    .map(name => `${name}=; Max-Age=0${COOKIE_FLAGS}`));
}
function readCookie(req, name) {
  const found = String(req.headers.cookie || '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(name + '='));
  if (found.length > 1) throw fail(401, 'invalid_session', 'Please sign in again.');
  if (!found.length) return null;
  let value;
  try { value = decodeURIComponent(found[0].slice(name.length + 1)); }
  catch { throw fail(401, 'invalid_session', 'Please sign in again.'); }
  if (!value || value.length > 4096 || /[\s\x00-\x1f\x7f]/.test(value)) {
    throw fail(401, 'invalid_session', 'Please sign in again.');
  }
  return value;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin && req.method === 'GET') return;
  let parsed;
  try { parsed = new URL(origin); } catch { throw fail(403, 'invalid_origin', 'Same-origin account access required.'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.host !== req.headers.host ||
      req.headers['sec-fetch-site'] === 'cross-site') {
    throw fail(403, 'invalid_origin', 'Same-origin account access required.');
  }
}
async function readBody(req) {
  if (String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw fail(415, 'json_required', 'JSON required.');
  }
  const length = Number(req.headers['content-length'] || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) {
    throw fail(413, 'request_too_large', 'Account request is too large.');
  }
  let body = req.body;
  try {
    if (body === undefined) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_BODY_BYTES) throw fail(413, 'request_too_large', 'Account request is too large.');
        chunks.push(buffer);
      }
      body = Buffer.concat(chunks, bytes);
    }
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw fail(413, 'request_too_large', 'Account request is too large.');
      body = JSON.parse(body.toString());
    } else if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
      throw fail(413, 'request_too_large', 'Account request is too large.');
    }
  } catch (error) {
    if (error instanceof access.HttpError) throw error;
    throw fail(400, 'invalid_json', 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'invalid_request', 'Invalid account request.');
  return body;
}
function authConfig(env) {
  let url;
  try { url = new URL(env.SOLO_SUPABASE_URL); } catch { throw fail(503, 'auth_unavailable', 'Account access is not configured.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw fail(503, 'auth_unavailable', 'Account access is not configured.');
  }
  const key = env.SOLO_SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || !key.startsWith('sb_publishable_')) throw fail(503, 'auth_unavailable', 'Account access is not configured.');
  return { origin: url.origin, key };
}
function validSession(session) {
  return session && typeof session.access_token === 'string' && session.access_token.length > 10 &&
    session.access_token.length <= 3600 && !/[\s\x00-\x1f\x7f]/.test(session.access_token) &&
    typeof session.refresh_token === 'string' && session.refresh_token.length > 10 &&
    session.refresh_token.length <= 2048 && !/[\s\x00-\x1f\x7f]/.test(session.refresh_token) &&
    Number.isInteger(session.expires_in) && session.expires_in > 0 && session.expires_in <= 86400;
}
function setSession(res, session) {
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Max-Age=${Math.min(session.expires_in, 3600)}${COOKIE_FLAGS}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Max-Age=2592000${COOKIE_FLAGS}`
  ]);
}

function createAuthHandler({ env = process.env, fetcher = (...args) => globalThis.fetch(...args),
  verify = access.verifyCustomer, status = access.customerStatus } = {}) {
  async function authRequest(path, body, token) {
    const config = authConfig(env);
    let response;
    try {
      response = await fetcher(config.origin + '/auth/v1/' + path, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.'); }
    if (response.status === 429) throw fail(429, 'auth_rate_limited', 'Too many sign-in attempts. Please wait before trying again.');
    if ([400, 401, 403, 422].includes(response.status)) throw fail(401, 'invalid_credentials', 'Unable to sign in. Check your account details.');
    if (!response.ok) throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.');
    if (path.startsWith('logout')) return {};
    try { return await response.json(); } catch { throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.'); }
  }
  async function validatedStatus(token) {
    const options = { env, fetcher };
    const identity = await verify(token, options);
    const usage = await status(identity, options);
    if (usage.active !== true) throw fail(403, 'access_denied', 'This account does not have SOLO preview access.');
    return { enabled: true, authenticated: true,
      user: { id: identity.userId, email: identity.user.email || '' },
      usage: { remaining_daily: usage.remaining_daily ?? null, daily_limit: usage.daily_limit ?? null },
      chatEnabled: env.SOLO_CUSTOMER_CHAT_ENABLED === 'true' };
  }
  async function revoke(token) {
    if (token) await authRequest('logout?scope=local', null, token);
  }
  return async (req, res) => {
    const enabled = env.VERCEL_ENV === 'preview' && env.SOLO_CUSTOMER_AUTH_ENABLED === 'true';
    const disabled = { enabled: false, authenticated: false, chatEnabled: false };
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return reply(res, 405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }
    let action;
    try {
      sameOrigin(req);
      if (!enabled) return req.method === 'GET' ? reply(res, 200, disabled)
        : reply(res, 503, { ...disabled, error: 'SOLO accounts are in private testing.', code: 'auth_disabled' });
      if (req.method === 'GET') {
        const token = access.parseAccessToken(req);
        // A normal access-cookie expiry must trigger the client's one refresh
        // attempt; a genuinely signed-out visitor needs no upstream request.
        if (!token && readCookie(req, REFRESH_COOKIE)) throw fail(401, 'session_expired', 'Please sign in again.');
        return reply(res, 200, token ? await validatedStatus(token.token)
          : { enabled: true, authenticated: false, chatEnabled: false });
      }
      const body = await readBody(req);
      action = body.action;
      if (!['login', 'refresh', 'logout'].includes(action)) throw fail(400, 'invalid_action', 'Unsupported account action.');
      if (action === 'logout') {
        const current = access.parseAccessToken(req);
        const refresh = readCookie(req, REFRESH_COOKIE);
        let token = current?.token;
        // If the access cookie has expired, rotate the refresh credential only to
        // revoke that same server session. Never create a new customer session.
        if (!token && refresh) {
          const session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
          if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
          token = session.access_token;
        }
        try { await revoke(token); }
        catch (error) {
          if (error.status !== 401 || !refresh) throw error;
          const session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
          if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
          await revoke(session.access_token);
        }
        clearCookies(res);
        return reply(res, 200, { enabled: true, authenticated: false, chatEnabled: false });
      }
      let session;
      if (action === 'login') {
        if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
            typeof body.password !== 'string' || !body.password || body.password.length > 1024) {
          throw fail(400, 'invalid_credentials', 'Enter your account email and password.');
        }
        session = await authRequest('token?grant_type=password', { email: body.email.trim(), password: body.password });
      } else {
        const refresh = readCookie(req, REFRESH_COOKIE);
        if (!refresh) throw fail(401, 'session_expired', 'Please sign in again.');
        session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
      }
      if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
      let view;
      try { view = await validatedStatus(session.access_token); }
      catch (error) {
        // A signed-in Supabase account still needs current SOLO membership.
        // Revoke a newly issued but denied session without exposing its tokens.
        try { await revoke(session.access_token); } catch { /* Gate remains closed. */ }
        throw error;
      }
      setSession(res, session);
      return reply(res, 200, view);
    } catch (error) {
      const known = error instanceof access.HttpError;
      const code = known ? error.code : 'auth_unavailable';
      const httpStatus = known ? error.status : 503;
      if ((action === 'refresh' && httpStatus === 401) || action === 'logout') clearCookies(res);
      if (httpStatus === 429) res.setHeader('Retry-After', '60');
      return reply(res, httpStatus, { enabled, authenticated: false, chatEnabled: false,
        error: known ? error.message : 'Account service is temporarily unavailable.', code });
    }
  };
}

module.exports = createAuthHandler();
module.exports.createAuthHandler = createAuthHandler;
