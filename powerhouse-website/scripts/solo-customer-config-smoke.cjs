// Opt-in server-side configuration check. No account creation or inference.
const { randomUUID } = require('node:crypto');
const { customerStatus, HttpError } = require('../lib/solo-customer-access.cjs');
const ORIGIN = 'https://tymayhazawkofmiypeqt.supabase.co';
const RPC = ORIGIN + '/rest/v1/rpc/solo_customer_status';

class ConfigSmokeFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(condition, code) { if (!condition) throw new ConfigSmokeFailure(code); }

async function runConfigSmoke({ env = process.env, fetcher = globalThis.fetch,
  log = console.log, status = customerStatus } = {}) {
  need(env.VERCEL_ENV === 'preview' && env.SOLO_CUSTOMER_CONFIG_CHECK === 'true', 'PREVIEW_OPT_IN_REQUIRED');
  need(env.SOLO_CUSTOMER_AUTH_ENABLED === 'false' && env.SOLO_CUSTOMER_CHAT_ENABLED === 'false', 'CUSTOMER_GATES_MUST_BE_FALSE');
  need(env.SOLO_SUPABASE_URL === ORIGIN, 'EXISTING_COMMERCIAL_PROJECT_REQUIRED');
  need(typeof env.SOLO_SUPABASE_SECRET_KEY === 'string' && /^sb_secret_[A-Za-z0-9_-]+$/.test(env.SOLO_SUPABASE_SECRET_KEY), 'SERVER_KEY_FORMAT_INVALID');
  need(typeof env.SOLO_SUPABASE_PUBLISHABLE_KEY === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SOLO_SUPABASE_PUBLISHABLE_KEY), 'PUBLISHABLE_KEY_FORMAT_INVALID');

  let rpcCalls = 0, rpcStatus, policyDisabled = false;
  const observedFetch = async (url, options = {}) => {
    need(url === RPC && options.method === 'POST' && options.redirect === 'error', 'RPC_DESTINATION_REJECTED');
    need(++rpcCalls === 1 && options.headers?.apikey === env.SOLO_SUPABASE_SECRET_KEY &&
      !Object.keys(options.headers || {}).some(key => /^(authorization|cookie)$/i.test(key)), 'RPC_HEADERS_REJECTED');
    const response = await fetcher(url, options);
    rpcStatus = response.status;
    return response;
  };
  try {
    await status({ userId: randomUUID(), sessionId: randomUUID() }, { env, fetcher: observedFetch });
  } catch (error) {
    policyDisabled = error instanceof HttpError && error.status === 503 && error.code === 'disabled';
  }
  // A generic 503, an authentication failure or a disabled local flag is not
  // evidence that the configured server credential reached the hosted function.
  need(rpcCalls === 1 && rpcStatus === 200 && policyDisabled, 'RPC_DISABLED_RESULT_NOT_VERIFIED');

  let response, body;
  try {
    response = await fetcher(ORIGIN + '/auth/v1/settings', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SOLO_SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' }
    });
    need(response.status === 200, 'AUTH_SETTINGS_HTTP_FAILED');
    body = await response.json();
  } catch (error) {
    if (error instanceof ConfigSmokeFailure) throw error;
    throw new ConfigSmokeFailure('AUTH_SETTINGS_UNAVAILABLE');
  }
  const settings = { disable_signup: body?.disable_signup, email: body?.external?.email,
    anonymous: body?.external?.anonymous_users, mailer_autoconfirm: body?.mailer_autoconfirm };
  need(Object.values(settings).every(value => typeof value === 'boolean'), 'AUTH_SETTINGS_BOOLEAN_FIELDS_REQUIRED');
  log('SOLO_COMMERCIAL_SERVER_KEY_PASS');
  log(JSON.stringify(settings));
  return { serverKeyVerified: true, settings };
}

if (require.main === module) {
  runConfigSmoke().catch(error => {
    // Never print raw exceptions or service bodies; they can contain secrets.
    console.error('SOLO_COMMERCIAL_CONFIG_FAIL_' +
      (error instanceof ConfigSmokeFailure ? error.code : 'NETWORK_OR_RUNTIME_ERROR'));
    process.exitCode = 1;
  });
}
module.exports = { runConfigSmoke, ConfigSmokeFailure };
