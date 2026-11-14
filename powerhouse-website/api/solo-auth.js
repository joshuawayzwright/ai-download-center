// Account sessions for the SOLO API: sign-in, optional public sign-up (its own
// switch), password reset and account deletion.
// Provider and Supabase privileged credentials are never sent to the browser.
const access = require('../lib/solo-customer-access.cjs');
const { customerRelease } = require('../lib/solo-release-policy.cjs');
const { admitAuthRequest } = require('../lib/solo-auth-admission.cjs');
const { REFRESH_COOKIE, reply, fail, clearCookies, readCookie, sameOrigin, readBody, authConfig, validSession, setSession } = require('../lib/solo-auth-http.cjs');

// Native app clients (SOLO AI for Android) identify themselves with this header and
// receive tokens in the JSON body instead of cookies. They must not send Origin or
// Cookie: a browser cannot read a cross-origin JSON response or send this
// non-simple header without a CORS preflight, which this API never approves.
const NATIVE_CLIENT = 'android';

function nativeMode(req) {
  const client = req.headers['x-solo-client'];
  if (client === undefined) return false;
  if (client !== NATIVE_CLIENT || req.headers.origin !== undefined || req.headers.cookie !== undefined) {
    throw fail(400, 'invalid_client', 'Unsupported account client.');
  }
  return true;
}

function nativeRefreshToken(body) {
  const token = body.refresh_token;
  if (typeof token !== 'string' || token.length < 11 || token.length > 2048 || /[\s\x00-\x1f\x7f]/.test(token)) {
    throw fail(401, 'session_expired', 'Please sign in again.');
  }
  return token;
}

// Where Supabase sends people after they confirm an email or ask for a reset.
const ACCOUNT_PAGE = 'https://thesoloserviceprovider.com.au/solo-ai-account.html';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(value) {
  return typeof value === 'string' && value.trim().length <= 254 && EMAIL.test(value.trim()) &&
    !/[\x00-\x1f\x7f]/.test(value);
}

// Supabase limits bcrypt input to 72 bytes; count bytes, not characters.
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters for your password.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Use a password of 72 characters or fewer.';
  if (/[\x00-\x1f\x7f]/.test(password)) return 'Your password contains characters that cannot be used.';
  return null;
}

function nativeSession(session) {
  return { access_token: session.access_token, refresh_token: session.refresh_token,
    expires_in: Math.min(session.expires_in, 3600), token_type: 'bearer' };
}

function createAuthHandler({ env = process.env, fetcher = (...args) => globalThis.fetch(...args),
  verify = access.verifyCustomer, freshIdentity = access.identityFromSession,
  status = access.customerStatus, admit = admitAuthRequest } = {}) {
  async function warmAccountServices() {
    if (env.VERCEL_ENV !== 'preview') return;
    const config = authConfig(env);
    const key = env.SOLO_SUPABASE_SECRET_KEY;
    if (typeof key !== 'string' || !key.startsWith('sb_secret_') || /[\s\x00-\x1f\x7f]/.test(key)) return;
    try {
      await fetcher(config.origin + '/rest/v1/rpc/solo_customer_status', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
        headers: { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          p_user_id: '00000000-0000-4000-8000-000000000001',
          p_session_id: '00000000-0000-4000-8000-000000000002'
        })
      });
    } catch { /* Best-effort connection warm-up only. */ }
  }
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
    if ([400, 401, 403, 422].includes(response.status)) {
      let detail = null;
      try { detail = await response.json(); } catch { /* Generic failure below. */ }
      // Supabase checks the password before reporting an unconfirmed address.
      if (path.startsWith('token?grant_type=password') && (detail?.error_code === 'email_not_confirmed' || detail?.code === 'email_not_confirmed')) {
        throw fail(403, 'email_not_confirmed', 'Confirm your email first. Open the link we sent you, then sign in.');
      }
      throw fail(401, 'invalid_credentials', 'Unable to sign in. Check your account details.');
    }
    if (!response.ok) throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.');
    if (path.startsWith('logout')) return {};
    try { return await response.json(); } catch { throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.'); }
  }
  async function validatedStatus(token, chatEnabled, identity = null) {
    const options = { env, fetcher };
    const verifiedIdentity = identity || await verify(token, options);
    const usage = await status(verifiedIdentity, options);
    if (usage.active !== true) throw fail(403, 'access_denied', 'This account does not have SOLO preview access.');
    return { enabled: true, authenticated: true,
      user: { id: verifiedIdentity.userId, email: verifiedIdentity.user.email || '' },
      usage: { remaining_daily: usage.remaining_daily ?? null, daily_limit: usage.daily_limit ?? null,
        ...(['member', 'free'].includes(usage.tier) ? { tier: usage.tier } : {}) },
      chatEnabled };
  }
  const signupEnabled = (release, native) => release.authEnabled && env.SOLO_PUBLIC_SIGNUP_ENABLED === 'true' &&
    (!native || env.SOLO_NATIVE_AUTH_ENABLED === 'true');
  // Supabase Auth calls whose errors must not read as "unable to sign in".
  async function accountEmailRequest(path, body) {
    const config = authConfig(env);
    let response, data = null;
    try {
      response = await fetcher(config.origin + '/auth/v1/' + path + '?redirect_to=' + encodeURIComponent(ACCOUNT_PAGE), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    } catch { throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.'); }
    try { data = await response.json(); } catch { /* Some successes have no body. */ }
    if (response.ok) return;
    const code = typeof data?.error_code === 'string' ? data.error_code : typeof data?.code === 'string' ? data.code : '';
    if (response.status === 429 || code.startsWith('over_')) {
      throw fail(429, 'auth_rate_limited', 'Too many account requests. Please wait before trying again.');
    }
    if (code === 'weak_password') throw fail(400, 'weak_password',
      'Choose a stronger password: at least 8 characters, not a common password.');
    if (code === 'email_address_invalid' || code === 'validation_failed') {
      throw fail(400, 'invalid_email', 'Enter a valid email address.');
    }
    if (code === 'signup_disabled' || code === 'email_provider_disabled') {
      throw fail(503, 'signup_disabled', 'New SOLO AI accounts are not open right now.');
    }
    // An existing address gets the same answer as a new one, so nobody can use
    // sign-up to find out who has an account.
    if (code === 'user_already_exists' || code === 'email_exists') return;
    if (code === 'email_address_not_authorized' || response.status >= 500) {
      throw fail(503, 'email_unavailable', 'We could not send the email right now. Please try again later.');
    }
    throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.');
  }
  async function deleteUser(userId) {
    const config = authConfig(env);
    const secret = env.SOLO_SUPABASE_SECRET_KEY;
    if (typeof secret !== 'string' || !secret.startsWith('sb_secret_') || /[\s\x00-\x1f\x7f]/.test(secret)) {
      throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.');
    }
    let response;
    try {
      response = await fetcher(config.origin + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
        method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ should_soft_delete: false })
      });
    } catch { throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.'); }
    if (!response.ok && response.status !== 404) {
      throw fail(503, 'auth_unavailable', 'Your account could not be deleted right now. Please try again later.');
    }
  }
  async function revoke(token) {
    if (token) await authRequest('logout?scope=local', null, token);
  }
  return async (req, res) => {
    const release = customerRelease(req, env);
    const enabled = release.authEnabled;
    const disabled = { enabled: false, authenticated: false, chatEnabled: false };
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return reply(res, 405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }
    let action;
    let native = false;
    try {
      native = nativeMode(req);
      if (!native) sameOrigin(req);
      if (req.method === 'GET') {
        const warm = typeof req.url === 'string' && /(?:^|[?&])warm=1(?:&|$)/.test(req.url.split('?', 2)[1] || '');
        if (warm) {
          if (!enabled || env.VERCEL_ENV !== 'preview' || req.headers['sec-fetch-site'] !== 'same-origin') {
            throw fail(403, 'invalid_origin', 'Same-origin account access required.');
          }
          await warmAccountServices();
          return reply(res, 200, { enabled: true, warmed: true });
        }
        if (!enabled) return reply(res, 200, disabled);
        // The app shows sign-in only when native token issuance is switched on.
        if (native && env.SOLO_NATIVE_AUTH_ENABLED !== 'true') return reply(res, 200, disabled);
        const signup = { signupEnabled: signupEnabled(release, native) };
        const token = access.parseAccessToken(req);
        // A normal access-cookie expiry must trigger the client's one refresh
        // attempt; a genuinely signed-out visitor needs no upstream request.
        if (!token && readCookie(req, REFRESH_COOKIE)) throw fail(401, 'session_expired', 'Please sign in again.');
        return reply(res, 200, token ? { ...await validatedStatus(token.token, release.chatEnabled), ...signup }
          : { enabled: true, authenticated: false, chatEnabled: false, ...signup });
      }
      const body = await readBody(req);
      action = body.action;
      // Disabling access must not trap an existing session. Same-origin logout
      // can only revoke/clear credentials; it never grants membership or chat.
      if (!enabled && action !== 'logout') return reply(res, 503,
        { ...disabled, error: 'SOLO accounts are in private testing.', code: 'auth_disabled' });
      if (!['login', 'refresh', 'logout', 'signup', 'request_reset', 'reset_password', 'delete_account'].includes(action)) {
        throw fail(400, 'invalid_action', 'Unsupported account action.');
      }
      // Native token issuance has its own switch so web sign-in can open first.
      // Logout always stays available so a closed gate never traps a session.
      if (native && action !== 'logout' && env.SOLO_NATIVE_AUTH_ENABLED !== 'true') {
        return reply(res, 503, { ...disabled, error: 'SOLO app sign-in is not available yet.', code: 'native_auth_disabled' });
      }
      const signedOut = { enabled: true, authenticated: false, chatEnabled: false };
      if (action === 'signup') {
        if (!signupEnabled(release, native)) {
          return reply(res, 503, { ...signedOut, error: 'New SOLO AI accounts are not open right now.', code: 'signup_disabled' });
        }
        if (!validEmail(body.email)) throw fail(400, 'invalid_email', 'Enter a valid email address.');
        const problem = passwordProblem(body.password);
        if (problem) throw fail(400, 'weak_password', problem);
        await admit(req, { email: body.email.trim(), action: 'signup' }, { env, fetcher });
        await accountEmailRequest('signup', { email: body.email.trim(), password: body.password });
        return reply(res, 200, { ...signedOut, signupEnabled: true, signup: 'check_email' });
      }
      if (action === 'request_reset') {
        if (!validEmail(body.email)) throw fail(400, 'invalid_email', 'Enter a valid email address.');
        await admit(req, { email: body.email.trim(), action: 'request_reset' }, { env, fetcher });
        try { await accountEmailRequest('recover', { email: body.email.trim() }); }
        catch (error) { if (error.status === 429 || error.code === 'email_unavailable') throw error; }
        return reply(res, 200, { ...signedOut, reset: 'check_email' });
      }
      if (action === 'reset_password') {
        // From the reset page: the one-time session in the emailed link sets a new password.
        // That session is only used here; the person then signs in normally.
        if (native) throw fail(400, 'invalid_action', 'Unsupported account action.');
        const token = typeof body.access_token === 'string' ? body.access_token : '';
        const problem = passwordProblem(body.password);
        if (problem) throw fail(400, 'weak_password', problem);
        let identity;
        try { identity = await verify(token, { env, fetcher }); }
        catch { throw fail(401, 'reset_link_expired', 'This reset link has expired. Ask for a new one from the app.'); }
        await admit(req, { email: identity.user.email, action: 'reset_password' }, { env, fetcher });
        const config = authConfig(env);
        let response, data = null;
        try {
          response = await fetcher(config.origin + '/auth/v1/user', {
            method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(8000),
            headers: { apikey: config.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: body.password })
          });
          try { data = await response.json(); } catch { /* ignore */ }
        } catch { throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.'); }
        if (!response.ok) {
          const code = data?.error_code || data?.code;
          if (code === 'weak_password') throw fail(400, 'weak_password', 'Choose a stronger password: at least 8 characters, not a common password.');
          if (code === 'same_password') throw fail(400, 'same_password', 'Choose a password you have not used for this account.');
          if (response.status === 401 || response.status === 403) throw fail(401, 'reset_link_expired', 'This reset link has expired. Ask for a new one from the app.');
          throw fail(503, 'auth_unavailable', 'Account service is temporarily unavailable.');
        }
        try { await revoke(token); } catch { /* The one-time session expires on its own. */ }
        return reply(res, 200, { ...signedOut, reset: 'done' });
      }
      if (action === 'delete_account') {
        if (body.confirm !== 'DELETE') throw fail(400, 'confirmation_required', 'Confirm that you want to delete your account.');
        const current = access.parseAccessToken(req);
        if (!current) throw fail(401, 'session_expired', 'Please sign in again.');
        const identity = await verify(current.token, { env, fetcher });
        await deleteUser(identity.userId);
        if (!native) clearCookies(res);
        return reply(res, 200, { ...signedOut, deleted: true });
      }
      if (action === 'logout' && native) {
        // Revoke the app's session. A stale access token may be replaced once by
        // the app's refresh token, only to revoke that same server session.
        const current = access.parseAccessToken(req);
        const revokeWithRefresh = async () => {
          const session = await authRequest('token?grant_type=refresh_token', { refresh_token: nativeRefreshToken(body) });
          if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
          await revoke(session.access_token);
        };
        if (!current) {
          if (body.refresh_token !== undefined) await revokeWithRefresh();
        } else {
          try { await revoke(current.token); }
          catch (error) {
            if (error.status !== 401 || body.refresh_token === undefined) throw error;
            await revokeWithRefresh();
          }
        }
        return reply(res, 200, { enabled, authenticated: false, chatEnabled: false });
      }
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
        return reply(res, 200, { enabled, authenticated: false, chatEnabled: false });
      }
      let session;
      if (action === 'login') {
        if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
            typeof body.password !== 'string' || !body.password || body.password.length > 1024) {
          throw fail(400, 'invalid_credentials', 'Enter your account email and password.');
        }
        await admit(req, { email: body.email.trim(), action: 'login' }, { env, fetcher });
        session = await authRequest('token?grant_type=password', { email: body.email.trim(), password: body.password });
      } else {
        const refresh = native ? nativeRefreshToken(body) : readCookie(req, REFRESH_COOKIE);
        if (!refresh) throw fail(401, 'session_expired', 'Please sign in again.');
        session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
      }
      if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
      let view;
      try {
        const identity = freshIdentity(session, { env });
        view = await validatedStatus(session.access_token, release.chatEnabled, identity);
      }
      catch (error) {
        // A signed-in Supabase account still needs current SOLO membership.
        // Revoke a newly issued but denied session without exposing its tokens.
        try { await revoke(session.access_token); } catch { /* Gate remains closed. */ }
        throw error;
      }
      if (native) return reply(res, 200, { ...view, session: nativeSession(session) });
      setSession(res, session);
      return reply(res, 200, view);
    } catch (error) {
      const known = error instanceof access.HttpError;
      const code = known ? error.code : 'auth_unavailable';
      const httpStatus = known ? error.status : 503;
      if (!native && ((action === 'refresh' && httpStatus === 401) || action === 'logout')) clearCookies(res);
      if (httpStatus === 429) {
        const delay = known ? Number(error.headers['Retry-After']) : NaN;
        res.setHeader('Retry-After', Number.isInteger(delay) && delay > 0 && delay <= 86400 ? String(delay) : '60');
      }
      return reply(res, httpStatus, { enabled, authenticated: false, chatEnabled: false,
        error: action === 'logout'
          ? (native ? 'Signed out on this device, but server sign-out could not be confirmed.'
            : 'Local account cookies were cleared, but server sign-out could not be confirmed.')
          : known ? error.message : 'Account service is temporarily unavailable.', code });
    }
  };
}

module.exports = createAuthHandler();
module.exports.createAuthHandler = createAuthHandler;
