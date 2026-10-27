// Server-only admission before a password login. No account credentials or raw
// identifiers are stored. Missing configuration/storage always blocks login.
const {createHmac} = require('node:crypto');
const {isIP} = require('node:net');
const {HttpError} = require('./solo-customer-access.cjs');

const unavailable = () => new HttpError(503, 'auth_admission_unavailable',
  'Account access is temporarily unavailable. Please try again later.');

function configuration(env) {
  let url;
  try { url = new URL(env.SOLO_SUPABASE_URL); } catch { throw unavailable(); }
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      env.VERCEL !== '1' || !['preview', 'production'].includes(env.VERCEL_ENV)) throw unavailable();
  const key = env.SOLO_SUPABASE_SECRET_KEY;
  const hashSecret = env.SOLO_USAGE_HASH_SECRET;
  if (typeof key !== 'string' || !key.startsWith('sb_secret_') || /[\s\x00-\x1f\x7f]/.test(key) ||
      typeof hashSecret !== 'string' || hashSecret.length < 32) throw unavailable();
  return {origin: url.origin, key, hashSecret};
}

function trustedIp(req) {
  // Vercel supplies this header. Do not trust a caller-supplied proxy chain,
  // X-Forwarded-For, X-Real-IP, or a socket address as an alternate identity.
  // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
  const value = req?.headers?.['x-vercel-forwarded-for'];
  if (typeof value !== 'string' || value !== value.trim() || value.length > 45) throw unavailable();
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6 || value.includes('%')) throw unavailable();
  // Canonicalize equivalent compressed, expanded and mixed-case IPv6 forms.
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  // Treat IPv4-mapped IPv6 and IPv4 as the same client key.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
  }
  return address;
}

async function admitAuthRequest(req, input, {env = process.env, fetcher = globalThis.fetch} = {}) {
  const config = configuration(env);
  if (input?.action !== 'login' || typeof input.email !== 'string') throw unavailable();
  const email = input.email.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      /[\x00-\x1f\x7f]/.test(email)) throw unavailable();
  const ip = trustedIp(req);
  const hash = (scope, value) => createHmac('sha256', config.hashSecret)
    .update(`solo-auth-admission:v1\0${scope}\0`).update(value).digest('hex');
  const body = {p_email_key: hash('email', email), p_ip_key: hash('ip', ip)};
  let response, result;
  try {
    response = await fetcher(config.origin + '/rest/v1/rpc/solo_admit_auth_attempt', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: {apikey: config.key, 'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify(body)
    });
    result = await response.json();
  } catch { throw unavailable(); }
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) throw unavailable();
  if (result.allowed === true && result.code === 'admitted' && result.retry_after_seconds === 0) return result;
  if (result.allowed === false && result.code === 'rate_limited' &&
      Number.isInteger(result.retry_after_seconds) && result.retry_after_seconds > 0 && result.retry_after_seconds <= 86400) {
    throw new HttpError(429, 'auth_rate_limited', 'Too many sign-in attempts. Please wait before trying again.',
      {'Retry-After': String(result.retry_after_seconds)});
  }
  throw unavailable();
}

module.exports = {admitAuthRequest};
