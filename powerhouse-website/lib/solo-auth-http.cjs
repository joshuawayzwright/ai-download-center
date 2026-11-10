// Shared server-only HTTP/session safeguards for SOLO account endpoints.
const access = require('./solo-customer-access.cjs');
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
  if (typeof key !== 'string' || !key.startsWith('sb_publishable_') || key.length <= 'sb_publishable_'.length ||
      /[\s\x00-\x1f\x7f]/.test(key)) throw fail(503, 'auth_unavailable', 'Account access is not configured.');
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

module.exports = { REFRESH_COOKIE, reply, fail, clearCookies, readCookie, sameOrigin, readBody, authConfig, validSession, setSession };
