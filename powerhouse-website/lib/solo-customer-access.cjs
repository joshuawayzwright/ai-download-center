// Server-only customer identity and durable request admission for the SOLO API.
// Never expose the secret key, access tokens or request fingerprints to clients.
const { createHmac } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCESS_COOKIE = '__Host-solo-access';
const MAX_TOKEN_LENGTH = 8192;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_OBSERVED_TOKENS = 1000000;

class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const sessionError = () => new HttpError(401, 'invalid_session', 'Please sign in again.');
const authUnavailable = () => new HttpError(503, 'auth_unavailable', 'Account verification is temporarily unavailable.');
const usageUnavailable = () => new HttpError(503, 'usage_unavailable', 'SOLO usage controls are temporarily unavailable.');

function parseAccessToken(req) {
  const headers = req.headers || {};
  const authorization = headers.authorization;
  const cookieHeader = headers.cookie;
  if (Array.isArray(authorization) || Array.isArray(cookieHeader)) {
    throw new HttpError(400, 'ambiguous_credentials', 'Use one account session.');
  }
  const cookies = typeof cookieHeader === 'string'
    ? cookieHeader.split(';').map(part => part.trim()).filter(part => part.split('=', 1)[0] === ACCESS_COOKIE)
    : [];
  if (cookies.length > 1 || (authorization !== undefined && cookies.length)) {
    throw new HttpError(400, 'ambiguous_credentials', 'Use one account session.');
  }
  if (authorization === undefined && !cookies.length) return null;

  let token, source;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') throw sessionError();
    const match = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
    if (!match) throw sessionError();
    token = match[1];
    source = 'bearer';
  } else {
    const separator = cookies[0].indexOf('=');
    if (separator < 0) throw sessionError();
    try { token = decodeURIComponent(cookies[0].slice(separator + 1)); }
    catch { throw sessionError(); }
    source = 'cookie';

    // Cookie credentials are ambient: state-changing requests require an exact
    // HTTPS Origin. Native Android requests use explicit bearer credentials.
    const mutation = !['GET', 'HEAD'].includes(req.method || 'POST');
    if (mutation || headers.origin !== undefined) {
      const host = headers.host;
      if (typeof host !== 'string' || headers.origin !== `https://${host}`) {
        throw new HttpError(403, 'invalid_origin', 'Same-origin account access is required.');
      }
    }
  }
  if (!token || token.length > MAX_TOKEN_LENGTH || /[\s,\x00-\x1f\x7f]/.test(token)) throw sessionError();
  return { token, source };
}

function configuration(env) {
  let url;
  try { url = new URL(env.SOLO_SUPABASE_URL); } catch { throw authUnavailable(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)) {
    throw authUnavailable();
  }
  return { origin: url.origin };
}

async function fetchJSON(fetcher, url, options, unavailable) {
  let response;
  try {
    response = await fetcher(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch { throw unavailable(); }
  let data;
  try { data = await response.json(); } catch { throw unavailable(); }
  return { response, data };
}

async function verifyCustomer(token, { env = process.env, fetcher = globalThis.fetch, now = Date.now } = {}) {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH || /[\s,\x00-\x1f\x7f]/.test(token)) throw sessionError();
  const { origin } = configuration(env);
  const key = env.SOLO_SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || !key.startsWith('sb_publishable_')) throw authUnavailable();
  const { response, data } = await fetchJSON(fetcher, `${origin}/auth/v1/user`, {
    method: 'GET', headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: 'application/json' }
  }, authUnavailable);
  if (response.status === 401 || response.status === 403) throw sessionError();
  if (!response.ok) throw authUnavailable();
  const user = data?.user || data;
  if (!user || typeof user !== 'object' || !UUID.test(user.id)) throw authUnavailable();

  // This is decoding, not local signature verification. It deliberately happens
  // only after Supabase Auth has validated this exact token online.
  let claims;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw Error();
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw sessionError(); }
  const timestamp = Math.floor(now() / 1000);
  if (!claims || claims.sub !== user.id || claims.iss !== `${origin}/auth/v1` ||
      claims.role !== 'authenticated' || !UUID.test(claims.session_id) ||
      !Number.isInteger(claims.exp) || claims.exp <= timestamp ||
      (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > timestamp)) ||
      !(claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated')))) {
    throw sessionError();
  }
  if (claims.is_anonymous === true || user.is_anonymous === true) {
    throw new HttpError(403, 'access_denied', 'This account does not have SOLO chat access.');
  }
  return { userId: user.id, sessionId: claims.session_id, user, claims };
}

function identityParams(identity) {
  if (!identity || !UUID.test(identity.userId) || !UUID.test(identity.sessionId)) throw sessionError();
  return { p_user_id: identity.userId, p_session_id: identity.sessionId };
}

async function rpc(name, body, { env = process.env, fetcher = globalThis.fetch } = {}) {
  const { origin } = configuration(env);
  const secret = env.SOLO_SUPABASE_SECRET_KEY;
  if (typeof secret !== 'string' || !secret.startsWith('sb_secret_')) throw usageUnavailable();
  // Modern secret keys belong in apikey only. Never combine this privileged
  // request with a customer's bearer token or cookies.
  const { response, data } = await fetchJSON(fetcher, `${origin}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: secret, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  }, usageUnavailable);
  if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) throw usageUnavailable();
  return data;
}

function admissionError(result) {
  const code = result?.code;
  if (code === 'invalid_session') return sessionError();
  if (['access_denied', 'member_expired', 'member_blocked'].includes(code)) {
    return new HttpError(403, code, 'This account does not have SOLO chat access.');
  }
  if (['duplicate_request', 'request_conflict'].includes(code)) {
    return new HttpError(409, code, 'That request has already been submitted. Send a new request to continue.');
  }
  if (['user_minute_limit', 'user_daily_limit', 'global_minute_limit', 'global_daily_limit'].includes(code)) {
    const delay = Number.isInteger(result.retry_after_seconds) && result.retry_after_seconds > 0
      ? Math.min(result.retry_after_seconds, 86400) : 60;
    return new HttpError(429, code, 'Your SOLO usage limit has been reached. Please try again after the limit resets.', { 'Retry-After': String(delay) });
  }
  if (code === 'invalid_request') return new HttpError(400, code, 'Invalid request identifier.');
  if (['disabled', 'configuration_missing'].includes(code)) {
    return new HttpError(503, code, 'Customer conversations are not enabled yet.');
  }
  return usageUnavailable();
}

async function customerStatus(identity, options = {}) {
  const result = await rpc('solo_customer_status', identityParams(identity), options);
  if (result.active !== true || result.code !== 'active') throw admissionError(result);
  return result;
}

async function reserve(identity, { requestId, messages, model }, options = {}) {
  const env = options.env || process.env;
  const ids = identityParams(identity);
  if (typeof requestId !== 'string' || !UUID.test(requestId) || !Array.isArray(messages)) {
    throw new HttpError(400, 'invalid_request', 'A valid request identifier is required.');
  }
  const secret = env.SOLO_USAGE_HASH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw usageUnavailable();
  const canonical = JSON.stringify({ version: 1, userId: identity.userId, model,
    messages: messages.map(message => ({ role: message.role, content: message.content })) });
  const fingerprint = createHmac('sha256', secret).update(canonical).digest('hex');
  const result = await rpc('solo_admit_request', { ...ids,
    p_request_id: requestId.toLowerCase(), p_fingerprint: fingerprint
  }, options);
  if (result.allowed !== true || result.code !== 'admitted') throw admissionError(result);
  if (typeof result.request_id !== 'string' || result.request_id.toLowerCase() !== requestId.toLowerCase()) throw usageUnavailable();
  return result;
}

const safeTokens = value => Number.isInteger(value) && value >= 0 && value <= MAX_OBSERVED_TOKENS ? value : null;

async function finalize(identity, { requestId, status, provider, model, inputTokens = null, outputTokens = null }, options = {}) {
  identityParams(identity);
  if (typeof requestId !== 'string' || !UUID.test(requestId) ||
      !['succeeded', 'provider_error', 'timeout', 'internal_error'].includes(status)) throw usageUnavailable();
  const result = await rpc('solo_finish_request', {
    p_user_id: identity.userId, p_request_id: requestId.toLowerCase(), p_status: status,
    p_provider: provider, p_model: model,
    p_input_tokens: safeTokens(inputTokens), p_output_tokens: safeTokens(outputTokens)
  }, options);
  if (result.ok !== true || !['completed', 'already_completed'].includes(result.code)) throw usageUnavailable();
  return result;
}

module.exports = { HttpError, parseAccessToken, verifyCustomer, customerStatus, reserve, finalize };
