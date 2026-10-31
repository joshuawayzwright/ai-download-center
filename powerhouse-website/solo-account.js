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
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let state = {enabled: false, authenticated: false, userId: null, chatEnabled: false, usage: null, sessionVersion: 0};
  let identity = '';
  let busy = false;
  let activeAction = null;
  let generation = 0;
  let queuedCheck = false;
  let lastWakeCheck = -Infinity;
  let suppressWakeUntil = 0;
  let warmStarted = false;
  let channel;

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

  const publish = (data, invalidate = false) => {
    const enabled = data?.enabled === true;
    const userId = typeof data?.user?.id === 'string' && UUID.test(data.user.id)
      ? data.user.id.toLowerCase() : null;
    const authenticated = enabled && data?.authenticated === true && userId !== null;
    const address = authenticated && typeof data.user?.email === 'string' ? data.user.email.slice(0, 254) : '';
    const nextIdentity = authenticated ? userId : '';
    const sessionVersion = state.sessionVersion + (invalidate || nextIdentity !== identity ? 1 : 0);
    identity = nextIdentity;
    state = {
      enabled, authenticated, userId: authenticated ? userId : null,
      chatEnabled: authenticated && data?.chatEnabled === true,
      usage: authenticated ? safeUsage(data.usage) : null, sessionVersion
    };
    form.hidden = !enabled || authenticated;
    panel.setAttribute('data-authenticated', authenticated ? 'true' : 'false');
    refresh.hidden = authenticated;
    refresh.style.display = authenticated ? 'none' : '';
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
        : 'Invited testers can sign in below. Available account setup and password help appear below.';
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
    if (busy) {
      if (action === 'check') queuedCheck = true;
      return;
    }
    let body;
    if (action === 'login') {
      if (!email.value.trim() || !password.value) return;
      body = {action, email: email.value.trim(), password: password.value};
      password.value = '';
    } else if (action !== 'check') body = {action};
    busy = true;
    activeAction = action;
    controls();
    if (action === 'login') {
      status.textContent = 'Signing in securely…';
      submit.textContent = 'SIGNING IN…';
    }
    if (action === 'logout') {
      // Stop local chat now; remote session revocation is still pending.
      generation++;
      publish({enabled: state.enabled, authenticated: false, chatEnabled: false}, true);
      status.textContent = 'Signing out. Conversation cleared.';
    }
    const startedGeneration = generation;
    // Logout can clear cookies even when server revocation fails. Other tabs
    // must recheck the actual cookie session rather than trust this response.
    let notifyTabs = action === 'logout';
    let refreshed = action === 'refresh';
    try {
      let result = await request(body ? 'POST' : 'GET', body);
      if (action === 'login' && result.ok && result.data.authenticated === true) notifyTabs = true;
      if (startedGeneration !== generation) {
        if (refreshed && result.ok) notifyTabs = true;
        return;
      }
      // Refresh once when an existing session expired; never retry inference here.
      if (action === 'check' && result.status === 401) {
        refreshed = true;
        result = await request('POST', {action: 'refresh'});
      }
      if (startedGeneration !== generation) {
        if (refreshed && result.ok) notifyTabs = true;
        return;
      }
      if (!result.ok) {
        if (result.data.enabled === false) {
          publish(result.data);
          if (action === 'logout') failure(result.status, action);
        } else failure(result.status, action);
      }
      else {
        publish(result.data);
        if ((action === 'login' || action === 'refresh') && result.data.authenticated === true) {
          suppressWakeUntil = Date.now() + 30000;
        }
        if (action === 'logout') {
          email.value = '';
          password.value = '';
        }
      }
    } catch {
      if (startedGeneration === generation) failure(0, action);
    } finally {
      if (notifyTabs) {
        // A fixed, ephemeral signal only: no identity, credentials or messages.
        try { channel?.postMessage('account-changed'); } catch { /* Focus checks remain available. */ }
      }
      busy = false;
      activeAction = null;
      submit.textContent = 'SIGN IN';
      controls();
      if (queuedCheck) {
        queuedCheck = false;
        return run('check');
      }
    }
  };

  const invalidateAndCheck = () => {
    generation++;
    password.value = '';
    // Publish immediately so chat drops old history and in-flight responses,
    // including while another account request is still waiting on the server.
    publish({enabled: state.enabled, authenticated: false, chatEnabled: false}, true);
    status.textContent = 'Account access changed. Checking your session…';
    return run('check');
  };
  const wakeCheck = () => {
    if (document.visibilityState === 'hidden' || busy) return;
    const now = Date.now();
    if (now < suppressWakeUntil) return;
    // Browsers commonly deliver focus and visibility/pageshow together.
    if (now - lastWakeCheck < 250) return;
    lastWakeCheck = now;
    return run('check');
  };

  try {
    if (typeof window.BroadcastChannel === 'function') {
      channel = new window.BroadcastChannel('solo-account-events-v1');
      channel.addEventListener('message', event => {
        if (event.data === 'account-changed') invalidateAndCheck();
      });
    }
  } catch { /* Older/restricted browsers still recheck on focus and restoration. */ }

  const warmAccountServices = () => {
    if (warmStarted || !state.enabled || state.authenticated) return;
    warmStarted = true;
    fetch('/api/solo-auth?warm=1', {method:'GET', credentials:'same-origin', cache:'no-store'})
      .catch(() => { /* Login remains available if warm-up fails. */ });
  };
  email.addEventListener('focus', warmAccountServices);
  password.addEventListener('focus', warmAccountServices);
  form.addEventListener('pointerdown', warmAccountServices);
  form.addEventListener('submit', event => { event.preventDefault(); return run('login'); });
  refresh.addEventListener('click', () => run(state.authenticated ? 'refresh' : 'check'));
  logout.addEventListener('click', () => run('logout'));
  window.addEventListener('solo:account-stale', event => {
    if (event.detail?.notifyPeers === true) {
      // Onboarding asks this channel's owner to notify other windows once.
      // The fixed signal contains no account identity or credentials.
      try { channel?.postMessage('account-changed'); } catch { /* Local invalidation still applies. */ }
    }
    return invalidateAndCheck();
  });
  window.addEventListener('solo:session-expired', () => { if (state.enabled) return run('refresh'); });
  window.addEventListener('focus', wakeCheck);
  // Initial navigation already has the startup check below. A restored page
  // must revalidate cookies before trusting its retained account display.
  window.addEventListener('pageshow', event => { if (event.persisted) wakeCheck(); });
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') wakeCheck();
  });
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
