// Gated account sessions for the existing SOLO API. No public signup.
// Provider and Supabase privileged credentials are never sent to the browser.
const access = require('../lib/solo-customer-access.cjs');
const { customerRelease } = require('../lib/solo-release-policy.cjs');
const { admitAuthRequest } = require('../lib/solo-auth-admission.cjs');
const { REFRESH_COOKIE, reply, fail, clearCookies, readCookie, sameOrigin, readBody, authConfig, validSession, setSession } = require('../lib/solo-auth-http.cjs');

function createAuthHandler({ env = process.env, fetcher = (...args) => globalThis.fetch(...args),
  verify = access.verifyCustomer, status = access.customerStatus, admit = admitAuthRequest } = {}) {
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
  async function validatedStatus(token, chatEnabled) {
    const options = { env, fetcher };
    const identity = await verify(token, options);
    const usage = await status(identity, options);
    if (usage.active !== true) throw fail(403, 'access_denied', 'This account does not have SOLO preview access.');
    return { enabled: true, authenticated: true,
      user: { id: identity.userId, email: identity.user.email || '' },
      usage: { remaining_daily: usage.remaining_daily ?? null, daily_limit: usage.daily_limit ?? null },
      chatEnabled };
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
    try {
      sameOrigin(req);
      if (req.method === 'GET') {
        if (!enabled) return reply(res, 200, disabled);
        const token = access.parseAccessToken(req);
        // A normal access-cookie expiry must trigger the client's one refresh
        // attempt; a genuinely signed-out visitor needs no upstream request.
        if (!token && readCookie(req, REFRESH_COOKIE)) throw fail(401, 'session_expired', 'Please sign in again.');
        return reply(res, 200, token ? await validatedStatus(token.token, release.chatEnabled)
          : { enabled: true, authenticated: false, chatEnabled: false });
      }
      const body = await readBody(req);
      action = body.action;
      // Disabling access must not trap an existing session. Same-origin logout
      // can only revoke/clear credentials; it never grants membership or chat.
      if (!enabled && action !== 'logout') return reply(res, 503,
        { ...disabled, error: 'SOLO accounts are in private testing.', code: 'auth_disabled' });
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
        const refresh = readCookie(req, REFRESH_COOKIE);
        if (!refresh) throw fail(401, 'session_expired', 'Please sign in again.');
        session = await authRequest('token?grant_type=refresh_token', { refresh_token: refresh });
      }
      if (!validSession(session)) throw fail(503, 'auth_unavailable', 'Account service returned an invalid response.');
      let view;
      try { view = await validatedStatus(session.access_token, release.chatEnabled); }
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
      if (httpStatus === 429) {
        const delay = known ? Number(error.headers['Retry-After']) : NaN;
        res.setHeader('Retry-After', Number.isInteger(delay) && delay > 0 && delay <= 86400 ? String(delay) : '60');
      }
      return reply(res, httpStatus, { enabled, authenticated: false, chatEnabled: false,
        error: action === 'logout'
          ? 'Local account cookies were cleared, but server sign-out could not be confirmed.'
          : known ? error.message : 'Account service is temporarily unavailable.', code });
    }
  };
}

module.exports = createAuthHandler();
module.exports.createAuthHandler = createAuthHandler;
