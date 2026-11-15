// Account sessions for the SOLO API: sign-in, sign-out and account deletion.
// Sign-up and password reset live in solo-onboarding.js (emailed one-time codes).
// Provider and Supabase privileged credentials are never sent to the browser.
const access = require('../lib/solo-customer-access.cjs');
const { customerRelease } = require('../lib/solo-release-policy.cjs');
const { admitAuthRequest } = require('../lib/solo-auth-admission.cjs');
const { REFRESH_COOKIE, reply, fail, clearCookies, readCookie, sameOrigin, nativeClient, readBody, authConfig, validSession, setSession } = require('../lib/solo-auth-http.cjs');

function nativeRefreshToken(body) {
  const token = body.refresh_token;
  if (typeof token !== 'string' || token.length < 11 || token.length > 2048 || /[\s\x00-\x1f\x7f]/.test(token)) {
    throw fail(401, 'session_expired', 'Please sign in again.');
  }
  return token;
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
  // The app shows sign-up and reset only when solo-onboarding would accept them.
  const onboarding = (release, native) => {
    const allowed = release.authEnabled && (!native || env.SOLO_NATIVE_AUTH_ENABLED === 'true');
    return { signupEnabled: allowed && env.SOLO_CUSTOMER_SIGNUP_ENABLED === 'true',
      recoveryEnabled: allowed && env.SOLO_CUSTOMER_RECOVERY_ENABLED === 'true' };
  };
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
      native = nativeClient(req);
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
        const signup = onboarding(release, native);
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
      if (!['login', 'refresh', 'logout', 'delete_account'].includes(action)) {
        throw fail(400, 'invalid_action', 'Unsupported account action.');
      }
      // Native token issuance has its own switch so web sign-in can open first.
      // Logout always stays available so a closed gate never traps a session.
      if (native && action !== 'logout' && env.SOLO_NATIVE_AUTH_ENABLED !== 'true') {
        return reply(res, 503, { ...disabled, error: 'SOLO app sign-in is not available yet.', code: 'native_auth_disabled' });
      }
      const signedOut = { enabled: true, authenticated: false, chatEnabled: false };
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
