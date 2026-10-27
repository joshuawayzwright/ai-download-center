(() => {
  const panel = document.querySelector('#solo-account');
  const form = document.querySelector('#solo-account-form');
  const status = document.querySelector('#solo-account-status');
  const usage = document.querySelector('#solo-account-usage');
  const refresh = document.querySelector('#solo-account-refresh');
  const logout = document.querySelector('#solo-account-logout');
  if (!panel || !form || !status || !usage || !refresh || !logout) return;
  const email = form.querySelector('input[type="email"]');
  const password = form.querySelector('input[type="password"]');
  const submit = form.querySelector('button[type="submit"]');
  let state = {enabled: false, authenticated: false, chatEnabled: false, usage: null, sessionVersion: 0};
  let identity = '';
  let busy = false;

  const safeUsage = value => value && Number.isInteger(value.daily_limit) && value.daily_limit >= 0 &&
    Number.isInteger(value.remaining_daily) && value.remaining_daily >= 0 && value.remaining_daily <= value.daily_limit
    ? {daily_limit: value.daily_limit, remaining_daily: value.remaining_daily} : null;

  const controls = () => {
    email.disabled = busy;
    password.disabled = busy;
    submit.disabled = busy;
    refresh.disabled = busy;
    logout.disabled = busy;
    panel.setAttribute('aria-busy', String(busy));
  };

  const publish = data => {
    const enabled = data?.enabled === true;
    const authenticated = enabled && data?.authenticated === true;
    const address = authenticated && typeof data.user?.email === 'string' ? data.user.email.slice(0, 254) : '';
    const nextIdentity = authenticated
      ? typeof data.user?.id === 'string' ? data.user.id : address || 'authenticated' : '';
    const sessionVersion = state.sessionVersion + (nextIdentity !== identity ? 1 : 0);
    identity = nextIdentity;
    state = {
      enabled, authenticated, chatEnabled: enabled && data?.chatEnabled === true,
      usage: authenticated ? safeUsage(data.usage) : null, sessionVersion
    };
    form.hidden = !enabled || authenticated;
    logout.hidden = !authenticated;
    logout.style.display = authenticated ? '' : 'none';
    refresh.textContent = authenticated ? 'REFRESH SESSION' : 'CHECK ACCESS';
    usage.hidden = !state.usage;
    usage.textContent = state.usage
      ? `${state.usage.remaining_daily} of ${state.usage.daily_limit} daily requests remaining.` : '';
    status.textContent = !enabled
      ? 'SOLO AI is in private testing. Account access is not available here yet.'
      : authenticated
        ? `${address ? `Signed in as ${address}.` : 'Signed in.'} ${state.chatEnabled ? 'Chat is available within your account limits.' : 'Chat remains in private testing.'}`
        : 'Invited testers can sign in below. New account registration is not available here.';
    // This public UI state contains no credentials or session tokens.
    window.soloAccountState = Object.freeze({...state});
    window.dispatchEvent(new CustomEvent('solo:account', {detail: window.soloAccountState}));
  };

  const request = async (method, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/solo-auth', {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})
      });
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid account response');
      return {ok: response.ok, status: response.status, data};
    } finally { clearTimeout(timer); }
  };

  const failure = (code, action) => {
    if (action === 'logout') {
      // The endpoint clears local cookies even when remote revocation fails.
      publish({enabled: state.enabled, authenticated: false, chatEnabled: false});
      status.textContent = 'Conversation cleared. Server sign-out could not be confirmed; use Check access to verify your session.';
    } else if (code === 401) {
      publish({enabled: true, authenticated: false, chatEnabled: state.chatEnabled});
      status.textContent = action === 'login'
        ? 'Sign-in failed. Check your email and password, or use an invited account.'
        : 'Your session could not be refreshed. Sign in to your invited account again.';
    } else if (code === 403) {
      publish({enabled: true, authenticated: false, chatEnabled: false});
      status.textContent = 'This account does not have invited SOLO preview access. Contact support if you expected access.';
    } else {
      status.textContent = code === 429
        ? 'Too many account requests. Please wait before trying again.'
        : 'Account access is temporarily unavailable. Please try again.';
    }
  };

  const run = async action => {
    if (busy) return;
    let body;
    if (action === 'login') {
      if (!email.value.trim() || !password.value) return;
      body = {action, email: email.value.trim(), password: password.value};
      password.value = '';
    } else if (action !== 'check') body = {action};
    busy = true;
    controls();
    try {
      let result = await request(body ? 'POST' : 'GET', body);
      // Refresh once when an existing session expired; never retry inference here.
      if (action === 'check' && result.status === 401) result = await request('POST', {action: 'refresh'});
      if (!result.ok) {
        if (result.data.enabled === false) {
          publish(result.data);
          if (action === 'logout') failure(result.status, action);
        } else failure(result.status, action);
      }
      else {
        publish(result.data);
        if (action === 'logout') {
          email.value = '';
          password.value = '';
        }
      }
    } catch { failure(0, action); }
    finally { busy = false; controls(); }
  };

  form.addEventListener('submit', event => { event.preventDefault(); return run('login'); });
  refresh.addEventListener('click', () => run(state.authenticated ? 'refresh' : 'check'));
  logout.addEventListener('click', () => run('logout'));
  window.addEventListener('solo:session-expired', () => { if (state.enabled) return run('refresh'); });
  window.addEventListener('solo:usage', event => {
    const nextUsage = safeUsage(event.detail);
    if (state.authenticated && nextUsage) {
      state.usage = nextUsage;
      usage.hidden = false;
      usage.textContent = `${nextUsage.remaining_daily} of ${nextUsage.daily_limit} daily requests remaining.`;
    }
  });
  publish({enabled: false, authenticated: false});
  run('check');
})();
