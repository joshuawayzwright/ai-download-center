// Production approval is separate from each feature switch. This helper grants
// no identity or quota: every enabled customer still passes those server checks.
const PRODUCTION_ORIGIN = 'https://thesoloserviceprovider.com.au';
const PRODUCTION_HOST = 'thesoloserviceprovider.com.au';

function customerRelease(req, env = process.env) {
  const headers = req.headers || {};
  const production = env.VERCEL_ENV === 'production' &&
    env.SOLO_CUSTOMER_PRODUCTION_ENABLED === 'true' &&
    headers.host === PRODUCTION_HOST &&
    (headers.origin === undefined || headers.origin === PRODUCTION_ORIGIN) &&
    headers['sec-fetch-site'] !== 'cross-site';
  const allowed = env.VERCEL_ENV === 'preview' || production;
  return {
    authEnabled: allowed && env.SOLO_CUSTOMER_AUTH_ENABLED === 'true',
    chatEnabled: allowed && env.SOLO_CUSTOMER_CHAT_ENABLED === 'true'
  };
}

module.exports = { customerRelease };
