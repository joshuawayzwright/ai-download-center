// Email verification and recovery for the existing SOLO account service.
// No client token exchange, automatic membership, or inference entitlement.
const access = require('../lib/solo-customer-access.cjs');
const { customerRelease } = require('../lib/solo-release-policy.cjs');
const { admitAuthRequest } = require('../lib/solo-auth-admission.cjs');
const { reply, fail, clearCookies, sameOrigin, readBody, authConfig, validSession } = require('../lib/solo-auth-http.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = {
  signup: ['action', 'email', 'password', 'acceptedTerms'],
  verify_email: ['action', 'email', 'code'],
  request_reset: ['action', 'email'],
  reset_password: ['action', 'email', 'code', 'password']
};
const unavailable = () => fail(503, 'onboarding_unavailable', 'Account setup is temporarily unavailable. Please try again later.');
const checkEmail = { ok: true, code: 'check_email' };

function capabilities(req, env) {
  const auth = customerRelease(req, env).authEnabled;
  const signupEnabled = auth && env.SOLO_CUSTOMER_SIGNUP_ENABLED === 'true';
  const recoveryEnabled = auth && env.SOLO_CUSTOMER_RECOVERY_ENABLED === 'true';
  return { enabled: signupEnabled || recoveryEnabled, signupEnabled, recoveryEnabled };
}

function validate(body) {
  if (!Object.hasOwn(FIELDS, body.action)) throw fail(400, 'invalid_action', 'Unsupported account action.');
  if (Object.keys(body).some(key => !FIELDS[body.action].includes(key))) {
    throw fail(400, 'invalid_request', 'Invalid account request.');
  }
  if (typeof body.email !== 'string' || body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || /[\x00-\x1f\x7f]/.test(body.email)) {
    throw fail(400, 'invalid_request', 'Enter a valid account email address.');
  }
  if (['verify_email', 'reset_password'].includes(body.action) &&
      (typeof body.code !== 'string' || !/^[0-9]{6,10}$/.test(body.code))) {
    throw fail(400, 'invalid_request', 'Enter the verification code from your email.');
  }
  if (['signup', 'reset_password'].includes(body.action)) {
    const password = body.password;
    if (typeof password !== 'string' || [...password].length < 12 || [...password].length > 128 ||
        !password.trim() || /[\x00-\x1f\x7f]/.test(password)) {
      throw fail(400, 'weak_password', 'Use a password of 12 to 128 characters.');
    }
  }
  if (body.action === 'signup' && body.acceptedTerms !== true) {
    throw fail(400, 'terms_required', 'Read and accept the Terms and Privacy Policy to create an account.');
  }
  return { ...body, email: body.email.trim().toLowerCase() };
}

function safeToken(value) {
  return typeof value === 'string' && value.length > 10 && value.length <= 3600 && !/[\s\x00-\x1f\x7f]/.test(value);
}

function createOnboardingHandler({ env = process.env, fetcher = (...args) => globalThis.fetch(...args),
  verify = access.verifyCustomer, admit = admitAuthRequest } = {}) {
  async function provider(path, { method = 'POST', body, token } = {}) {
    const config = authConfig(env);
    let response, data;
    try {
      response = await fetcher(config.origin + '/auth/v1/' + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: config.key, 'Content-Type': 'application/json', Accept: 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw unavailable(); }
    if (response.status === 429) {
      const delay = Number(response.headers?.get?.('retry-after'));
      throw new access.HttpError(429, 'auth_rate_limited', 'Too many account requests. Please wait before trying again.',
        { 'Retry-After': Number.isInteger(delay) && delay > 0 && delay <= 86400 ? String(delay) : '60' });
    }
    if (path.startsWith('logout') && response.ok) return {};
    try { data = await response.json(); } catch { throw unavailable(); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailable();
    if (!response.ok) {
      const code = typeof data.code === 'string' ? data.code : data.error_code;
      // Only documented existence results receive the same neutral answer.
      // Provider outages, disabled signup, SMTP errors and weak passwords do not.
      if (path === 'signup' && [400, 422].includes(response.status) &&
          ['user_already_exists', 'email_exists'].includes(code)) return { duplicate: true };
      if (path === 'recover' && [400, 404, 422].includes(response.status) &&
          ['user_not_found', 'email_not_confirmed'].includes(code)) return {};
      if (path === 'verify' && [400, 401, 403, 422].includes(response.status)) {
        throw fail(401, 'invalid_code', 'That code is invalid or expired. Request a new code and try again.');
      }
      if (path === 'signup' && code === 'weak_password') {
        throw fail(400, 'weak_password', 'Choose a stronger password of 12 to 128 characters.');
      }
      throw unavailable();
    }
    return data;
  }

  async function revoke(token, scope = 'local') {
    await provider('logout?scope=' + scope, { token });
  }
  async function cleanup(session) {
    if (safeToken(session?.access_token)) {
      try { await revoke(session.access_token); } catch { /* Never grant access after cleanup failure. */ }
    }
  }
  async function assertSignupConfiguration() {
    const settings = await provider('settings', { method: 'GET' });
    if (settings.disable_signup !== false || settings.external?.email !== true || settings.mailer_autoconfirm !== false) {
      throw unavailable();
    }
  }
  async function verifiedIdentity(session, email) {
    const identity = await verify(session.access_token, { env, fetcher });
    const user = identity?.user;
    if (!identity || !UUID.test(identity.userId) || !user ||
        typeof user.email !== 'string' || user.email.trim().toLowerCase() !== email ||
        typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at)) ||
        user.is_anonymous === true) throw unavailable();
    return identity;
  }

  return async (req, res) => {
    const flags = capabilities(req, env);
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return reply(res, 405, { ok: false, error: 'Method not allowed.', code: 'method_not_allowed' });
    }
    let action, session, codeConsumed = false, passwordChanged = false;
    try {
      sameOrigin(req);
      if (req.method === 'GET') return reply(res, 200, flags);
      const raw = await readBody(req);
      action = raw.action;
      const permitted = ['signup', 'verify_email'].includes(action) ? flags.signupEnabled
        : ['request_reset', 'reset_password'].includes(action) ? flags.recoveryEnabled : false;
      if (!Object.hasOwn(FIELDS, action)) throw fail(400, 'invalid_action', 'Unsupported account action.');
      if (!permitted) throw fail(503, 'onboarding_disabled', 'Account setup is not available here yet.');
      const body = validate(raw);
      // The same durable email/IP/global budget covers all account actions.
      // Changing endpoints or OTP purpose must not multiply the allowance.
      await admit(req, { email: body.email, action }, { env, fetcher });

      if (action === 'signup') {
        await assertSignupConfiguration();
        const result = await provider('signup', { body: { email: body.email, password: body.password } });
        const unexpectedSession = result.session || result;
        if (unexpectedSession.access_token || unexpectedSession.refresh_token) {
          await cleanup(unexpectedSession);
          throw unavailable();
        }
        if (result.duplicate !== true && !UUID.test((result.user || result).id)) throw unavailable();
        return reply(res, 202, checkEmail);
      }
      if (action === 'request_reset') {
        await provider('recover', { body: { email: body.email } });
        return reply(res, 202, checkEmail);
      }

      // Purpose-specific verification prevents a signup code being used to reset
      // a password. Generic type=email accepts more than one token purpose.
      session = await provider('verify', { body: { email: body.email, token: body.code,
        type: action === 'verify_email' ? 'signup' : 'recovery' } });
      codeConsumed = true;
      if (!validSession(session)) throw unavailable();
      const identity = await verifiedIdentity(session, body.email);
      if (action === 'verify_email') {
        await revoke(session.access_token);
        session = null;
        return reply(res, 200, { ok: true, code: 'email_verified' });
      }

      // Recovery credentials exist only for this request; they never become a
      // normal SOLO session. A password change cannot authorize AI membership.
      clearCookies(res);
      const updated = await provider('user', { method: 'PUT', token: session.access_token,
        body: { password: body.password } });
      const user = updated.user || updated;
      if (user.id !== identity.userId || typeof user.email !== 'string' ||
          user.email.trim().toLowerCase() !== body.email) throw unavailable();
      passwordChanged = true;
      // Password update revokes other sessions; explicit global logout also
      // removes this one-use recovery session. Both must finish before success.
      await revoke(session.access_token, 'global');
      session = null;
      return reply(res, 200, { ok: true, code: 'password_reset', sessionInvalidated: true });
    } catch (error) {
      await cleanup(session);
      if (action === 'reset_password' && codeConsumed) {
        clearCookies(res);
        return reply(res, 503, { ok: false, sessionInvalidated: true,
          ...(passwordChanged ? { passwordChanged: true } : {}),
          code: passwordChanged ? 'reset_signout_unconfirmed' : 'reset_incomplete',
          error: passwordChanged
            ? 'Your password was updated, but sign-out across devices could not be confirmed. Contact support before continuing.'
            : 'The reset code was checked, but password reset could not be confirmed. Request a new code before trying again.' });
      }
      const known = error instanceof access.HttpError;
      const status = known ? error.status : 503;
      if (status === 429) {
        const delay = known ? Number(error.headers?.['Retry-After']) : NaN;
        res.setHeader('Retry-After', Number.isInteger(delay) && delay > 0 && delay <= 86400 ? String(delay) : '60');
      }
      return reply(res, status, { ok: false, code: known ? error.code : 'onboarding_unavailable',
        error: known ? error.message : unavailable().message });
    }
  };
}

module.exports = createOnboardingHandler();
module.exports.createOnboardingHandler = createOnboardingHandler;
