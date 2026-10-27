(() => {
  const panel = document.querySelector('#solo-onboarding');
  const status = document.querySelector('#solo-onboarding-status');
  const back = document.querySelector('#solo-onboarding-back');
  if (!panel || !status || !back) return;
  const definitions = {
    signup: {slug: 'signup', feature: 'signupEnabled', status: 202, code: 'check_email'},
    verify_email: {slug: 'verify-email', feature: 'signupEnabled', status: 200, code: 'email_verified'},
    request_reset: {slug: 'request-reset', feature: 'recoveryEnabled', status: 202, code: 'check_email'},
    reset_password: {slug: 'reset-password', feature: 'recoveryEnabled', status: 200, code: 'password_reset'}
  };
  const forms = {};
  for (const [action, definition] of Object.entries(definitions)) {
    const form = document.querySelector(`#solo-onboarding-${definition.slug}`);
    const opener = document.querySelector(`#solo-onboarding-open-${definition.slug}`);
    if (!form || !opener) return;
    forms[action] = {
      form, opener, email: form.querySelector('input[type="email"]'),
      password: form.querySelector('input[type="password"]'),
      code: form.querySelector('input[data-onboarding-code]'),
      terms: form.querySelector('input[type="checkbox"]'),
      submit: form.querySelector('button[type="submit"]')
    };
    if (!forms[action].email || !forms[action].submit) return;
  }
  if (!forms.signup.password || !forms.signup.terms || !forms.verify_email.code ||
      !forms.reset_password.code || !forms.reset_password.password) return;

  const configuredMin = Number(panel.getAttribute('data-code-min-length'));
  const configuredMax = Number(panel.getAttribute('data-code-max-length'));
  const validRange = Number.isInteger(configuredMin) && Number.isInteger(configuredMax) &&
    configuredMin >= 6 && configuredMax <= 10 && configuredMin <= configuredMax;
  const codeMin = validRange ? configuredMin : 6;
  const codeMax = validRange ? configuredMax : 10;
  const codePattern = new RegExp(`^[0-9]{${codeMin},${codeMax}}$`);
  for (const item of Object.values(forms)) if (item.code) {
    item.code.minLength = codeMin;
    item.code.maxLength = codeMax;
    item.code.setAttribute('pattern', `[0-9]{${codeMin},${codeMax}}`);
  }

  let capabilities = {enabled: false, signupEnabled: false, recoveryEnabled: false};
  let active = null;
  let busy = false;
  let retryAt = 0;
  let retryTimer;
  let exposed = false;
  let generation = 0;
  let activeRequest;
  let ownInvalidation = false;
  const accountSnapshot = value => ({
    authenticated: value?.authenticated === true,
    userId: value?.authenticated === true && typeof value.userId === 'string' ? value.userId : null,
    sessionVersion: Number.isSafeInteger(value?.sessionVersion) ? value.sessionVersion : 0
  });
  let account = accountSnapshot(window.soloAccountState);
  const allowed = action => !account.authenticated && capabilities.enabled && capabilities[definitions[action].feature];
  const clearSecrets = () => {
    for (const item of Object.values(forms)) {
      if (item.password) item.password.value = '';
      if (item.code) item.code.value = '';
      if (item.terms) item.terms.checked = false;
    }
  };
  const rememberEmail = value => {
    for (const item of Object.values(forms)) item.email.value = value;
  };
  const clearInvalid = () => {
    for (const item of Object.values(forms)) {
      for (const field of [item.email, item.password, item.code, item.terms]) {
        if (field) field.removeAttribute('aria-invalid');
      }
    }
  };
  const controls = () => {
    panel.hidden = !exposed || account.authenticated;
    panel.setAttribute('aria-busy', String(busy));
    for (const [action, item] of Object.entries(forms)) {
      const enabled = allowed(action);
      item.opener.hidden = !enabled;
      item.opener.disabled = busy;
      item.opener.setAttribute('aria-expanded', String(enabled && active === action));
      item.form.hidden = !enabled || active !== action;
      for (const field of [item.email, item.password, item.code, item.terms]) {
        if (field) field.disabled = busy || !enabled;
      }
      item.submit.disabled = busy || !enabled || retryAt > Date.now();
    }
    back.hidden = active === null;
    back.disabled = busy;
  };
  const say = (message, error = false, focus = false) => {
    // Provider messages and HTML are never inserted into the page.
    status.textContent = message;
    status.setAttribute('data-error', String(error));
    if (focus) status.focus();
  };
  const select = (action, focus = true) => {
    if (busy || (action && !allowed(action))) return;
    if (active) rememberEmail(forms[active].email.value.trim());
    clearSecrets();
    clearInvalid();
    active = action;
    say('');
    controls();
    if (focus && action) forms[action].email.focus();
  };
  const invalidateSession = () => {
    // The account controller owns the fixed cross-tab signal, avoiding a second
    // same-window BroadcastChannel delivery. This never signs anyone in.
    ownInvalidation = true;
    try { window.dispatchEvent(new CustomEvent('solo:account-stale', {detail: {notifyPeers: true}})); }
    finally { ownInvalidation = false; }
  };
  const request = async body => {
    const controller = new AbortController();
    if (body) activeRequest = controller;
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/solo-onboarding', {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: controller.signal,
        ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})
      });
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid onboarding response');
      return {ok: response.ok, status: response.status, data, retryAfter: response.headers?.get('Retry-After')};
    } finally {
      clearTimeout(timer);
      if (activeRequest === controller) activeRequest = null;
    }
  };
  const applyWait = value => {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,4}$/.test(value)) return null;
    const seconds = Number(value);
    if (seconds > 86400) return null;
    retryAt = Date.now() + seconds * 1000;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryAt = 0; controls(); }, seconds * 1000);
    return seconds;
  };
  const uncertain = action => {
    if (action === 'reset_password') {
      invalidateSession();
      return 'Password reset could not be confirmed. Your code may have been used. Choose Forgot password to request a new reset code before trying again.';
    }
    if (action === 'verify_email') {
      return 'Email verification could not be confirmed. The code may have been used. Try signing in, or contact support for help with a new verification email.';
    }
    return 'Your request could not be confirmed. Check your inbox before making another request.';
  };
  const failed = (result, action) => {
    const {data} = result;
    const reset = action === 'reset_password';
    if (reset && (data.sessionInvalidated === true || data.passwordChanged === true)) invalidateSession();
    if (reset && result.status === 503 && data.code === 'reset_signout_unconfirmed' && data.passwordChanged === true) {
      return 'Your password was updated, but sign-out across devices could not be confirmed. Contact support before continuing.';
    }
    if (reset && result.status === 503 && data.code === 'reset_incomplete') {
      return 'The reset code was checked, but password reset could not be confirmed. Choose Forgot password to request a new code before trying again.';
    }
    if (result.status === 401 && data.code === 'invalid_code') {
      return reset
        ? 'That password reset code is invalid or has expired. Choose Forgot password to request a new reset code.'
        : 'That verification code is invalid or has expired. Use the latest verification email, or contact support for help with a new code.';
    }
    if (result.status === 400 && data.code === 'weak_password') return 'Use a password with 12–128 characters. Enter it again before submitting.';
    if (result.status === 400 && data.code === 'terms_required') return 'Read and accept the Terms before creating an account.';
    if (result.status === 400 && data.code === 'invalid_request') return 'Check your email and the required fields, then enter your password or code again.';
    if (result.status === 429) {
      const wait = applyWait(result.retryAfter);
      return wait ? `Too many account requests. Please wait ${wait} ${wait === 1 ? 'second' : 'seconds'} before trying again.`
        : 'Too many account requests. Please wait before trying again.';
    }
    if (result.status === 503 && ['disabled', 'onboarding_disabled', 'signup_disabled', 'recovery_disabled'].includes(data.code)) {
      capabilities = {enabled: false, signupEnabled: false, recoveryEnabled: false};
      active = null;
      return 'Account setup and password recovery are not available here right now. Reload this page later to check availability.';
    }
    // An upstream failure after verification may have consumed a one-use code.
    if (reset && data.sessionInvalidated === true) {
      return 'Password reset could not be confirmed. Choose Forgot password to request a new reset code before trying again.';
    }
    return uncertain(action);
  };

  const run = async action => {
    if (busy || active !== action || !allowed(action) || retryAt > Date.now()) return;
    const item = forms[action];
    const body = {action, email: item.email.value.trim()};
    if (item.password) body.password = item.password.value;
    if (item.code) body.code = item.code.value.trim();
    if (item.terms) body.acceptedTerms = item.terms.checked === true;
    // Discard secret inputs immediately, including while the network is stalled.
    // Only the submitted email remains in the forms after every outcome.
    clearSecrets();
    rememberEmail(body.email);
    clearInvalid();
    let invalid;
    let explanation;
    if (body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || /[\x00-\x1f\x7f]/.test(body.email)) {
      invalid = item.email; explanation = 'Enter a valid email address.';
    } else if (item.password && (Array.from(body.password).length < 12 || Array.from(body.password).length > 128 ||
        !body.password.trim() || /[\x00-\x1f\x7f]/.test(body.password))) {
      invalid = item.password; explanation = 'Use a password with 12–128 characters. It cannot contain only spaces or control characters. Enter it again before submitting.';
    } else if (item.code && !codePattern.test(body.code)) {
      invalid = item.code; explanation = `Enter the ${codeMin === codeMax ? codeMin : `${codeMin}–${codeMax}`} digit ${action === 'verify_email' ? 'verification' : 'password reset'} code from your email.`;
    } else if (item.terms && !body.acceptedTerms) {
      invalid = item.terms; explanation = 'Read and accept the Terms before creating an account.';
    }
    if (invalid) {
      invalid.setAttribute('aria-invalid', 'true');
      say(explanation, true);
      invalid.focus();
      return;
    }
    busy = true;
    const startedGeneration = generation;
    controls();
    say({signup: 'Requesting account verification…', verify_email: 'Checking your verification code…',
      request_reset: 'Requesting a password reset code…', reset_password: 'Updating your password and signing out sessions…'}[action]);
    try {
      const result = await request(body);
      if (startedGeneration !== generation) return;
      const expected = definitions[action];
      if (result.ok && result.status === expected.status && result.data.ok === true && result.data.code === expected.code) {
        if (action === 'signup') {
          active = 'verify_email';
          say('If this address can be registered, a verification code will be sent by email. Check your inbox and spam folder. Verification does not grant SOLO chat access.', false, true);
        } else if (action === 'request_reset') {
          active = 'reset_password';
          say('If this address has an eligible account, a password reset code will be sent by email. Check your inbox and spam folder, then enter the code and a new password.', false, true);
        } else if (action === 'verify_email') {
          active = null;
          say('Email verified. You can use Sign in above. SOLO account access and chat availability remain restricted while testing continues.', false, true);
        } else {
          active = null;
          invalidateSession();
          say('Password updated and existing sessions signed out. Use Sign in above with your new password. This does not change your SOLO access or usage limits.', false, true);
        }
      } else if (!result.ok) say(failed(result, action), true, true);
      else say(uncertain(action), true, true);
    } catch {
      if (startedGeneration !== generation) return;
      say(uncertain(action), true, true);
    } finally {
      clearSecrets();
      busy = false;
      controls();
    }
  };

  for (const [action, item] of Object.entries(forms)) {
    item.opener.addEventListener('click', () => select(action));
    item.form.addEventListener('submit', event => { event.preventDefault(); return run(action); });
  }
  back.addEventListener('click', () => {
    if (busy) return;
    select(null, false);
    const signIn = document.querySelector('#solo-account-form');
    const target = signIn && !signIn.hidden ? document.querySelector('#solo-account-email') : document.querySelector('#solo-account-refresh');
    target?.focus();
  });
  // Back/forward restoration must not redisplay a password or one-use code.
  window.addEventListener('pagehide', clearSecrets);
  window.addEventListener('pageshow', event => { if (event.persisted) clearSecrets(); });
  const accountChanged = () => {
    generation++;
    activeRequest?.abort();
    clearSecrets();
    rememberEmail('');
    active = null;
    say('');
    controls();
  };
  window.addEventListener('solo:account-stale', () => { if (!ownInvalidation) accountChanged(); });
  window.addEventListener('solo:account', event => {
    if (!event.detail || typeof event.detail.authenticated !== 'boolean') return;
    const next = accountSnapshot(event.detail);
    const changed = next.authenticated !== account.authenticated || next.userId !== account.userId ||
      next.sessionVersion !== account.sessionVersion;
    account = next;
    if (changed && !ownInvalidation) accountChanged();
    else controls();
  });

  panel.hidden = true;
  clearSecrets();
  controls();
  (async () => {
    busy = true;
    controls();
    try {
      const result = await request();
      const data = result.data;
      if (!result.ok || result.status !== 200 || !['enabled', 'signupEnabled', 'recoveryEnabled'].every(key => typeof data[key] === 'boolean')) return;
      capabilities = {enabled: data.enabled, signupEnabled: data.enabled && data.signupEnabled,
        recoveryEnabled: data.enabled && data.recoveryEnabled};
      exposed = capabilities.enabled && (capabilities.signupEnabled || capabilities.recoveryEnabled);
    } catch { /* Unavailable or malformed capabilities keep every onboarding control closed. */ }
    finally { busy = false; controls(); }
  })();
})();
