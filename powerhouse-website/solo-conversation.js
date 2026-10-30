(() => {
  const form = document.querySelector('#solo-chat-form');
  const transcript = document.querySelector('#solo-chat-transcript');
  const status = document.querySelector('#solo-chat-status');
  if (!form || !transcript || !status) return;
  const input = form.querySelector('textarea');
  const submit = form.querySelector('button[type="submit"]');
  const messages = [];
  const encoder = new TextEncoder();
  let account = window.soloAccountState || {enabled: false, authenticated: false, chatEnabled: false, sessionVersion: 0};
  let retry = null;
  let retryAfter = 0;
  let activeController;
  let conversationVersion = 0;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const add = (role, value) => {
    const line = document.createElement('div');
    line.className = 'solo-message ' + (role === 'user' ? 'from-user' : role === 'notice' ? 'system-notice' : 'from-solo');
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'YOU' : role === 'notice' ? 'STATUS' : 'SOLO';
    const text = document.createElement('p');
    text.textContent = value;
    line.append(label, text);
    transcript.append(line);
    transcript.scrollTop = transcript.scrollHeight;
  };
  const privateNotice = 'SOLO AI is in private testing. Public conversations are not available yet.';
  const acceptedNotice = 'This request has already been accepted. It will not be sent again. Edit your message to start a new request.';
  const remainingWait = () => Math.max(1, Math.ceil((retryAfter - Date.now()) / 1000));
  const showWait = () => {
    add('notice', `Your usage limit has been reached. Please wait ${remainingWait()} seconds before trying again.`);
    status.textContent = 'Usage limit reached';
  };
  const clearConversation = notice => {
    conversationVersion++;
    activeController?.abort();
    retry = null;
    retryAfter = 0;
    messages.length = 0;
    input.value = '';
    transcript.replaceChildren();
    add('notice', notice);
  };
  const recheckAccount = () => {
    clearConversation('Your account changed. The previous conversation has been cleared. Checking account access…');
    // Block submissions even if the account controller's check is asynchronous.
    account = {...account, authenticated: false, chatEnabled: false, userId: null};
    status.textContent = 'Checking account access…';
    window.dispatchEvent(new CustomEvent('solo:account-stale'));
  };
  input.addEventListener('input', () => { retry = null; });
  window.addEventListener('solo:account', event => {
    const next = event.detail;
    if (!next || typeof next.enabled !== 'boolean') return;
    if (next.sessionVersion !== account.sessionVersion || next.authenticated !== account.authenticated || next.userId !== account.userId) {
      const signedInNow = !account.authenticated && next.authenticated;
      clearConversation(signedInNow
        ? (next.chatEnabled ? 'Signed in. SOLO is ready.' : 'Signed in. Chat remains in private testing.')
        : 'Conversation cleared after the account changed.');
    }
    account = next;
    status.textContent = !account.enabled ? 'Private testing — public access not enabled'
      : !account.authenticated ? 'Sign in with an invited account'
        : account.chatEnabled ? 'Signed in — ready to chat' : 'Signed in — chat remains in private testing';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || prompt.length > 1200 || submit.disabled) return;
    if (account.enabled && (!account.authenticated || !account.chatEnabled)) {
      add('notice', !account.authenticated ? 'Sign in to your invited account to use SOLO chat.' : privateNotice);
      status.textContent = !account.authenticated ? 'Sign-in required' : 'Development access only';
      return;
    }
    const expectedUserId = account.authenticated ? account.userId : null;
    if (account.authenticated && (typeof expectedUserId !== 'string' || !uuid.test(expectedUserId))) {
      recheckAccount();
      return;
    }
    if (Date.now() < retryAfter) { showWait(); return; }
    const pending = [...messages, {role:'user',content:prompt}];
    // Keep complete exchanges followed by the pending user turn. A 12-message
    // slice can start with an assistant; at most 11 preserves the shared API contract.
    while (pending.length > 11) pending.splice(0, 2);
    // Include both UUID fields when enforcing the complete request byte bound.
    const requestBody = requestId => ({messages: pending, requestId, ...(expectedUserId ? {expectedUserId} : {})});
    let payload = JSON.stringify(requestBody('00000000-0000-4000-8000-000000000000'));
    // Character limits alone do not bound UTF-8 or JSON-escaped request bytes.
    while (encoder.encode(payload).byteLength > 16000 && pending.length > 1) {
      pending.splice(0, 2);
      payload = JSON.stringify(requestBody('00000000-0000-4000-8000-000000000000'));
    }
    const fingerprint = JSON.stringify(pending);
    if (retry?.fingerprint === fingerprint && retry.accepted) {
      add('notice', acceptedNotice);
      status.textContent = 'Request already accepted';
      return;
    }
    if (!retry || retry.fingerprint !== fingerprint) {
      try {
        if (typeof crypto?.randomUUID !== 'function') throw new Error('Secure UUID unavailable');
        retry = {fingerprint, requestId: crypto.randomUUID(), accepted: false};
      } catch {
        add('notice', 'A secure browser connection is required. Reopen this page using HTTPS before trying again.');
        status.textContent = 'Secure browser required';
        return;
      }
    }
    const requestId = retry.requestId;
    payload = JSON.stringify(requestBody(requestId));
    add('user', prompt);
    input.value = '';
    submit.disabled = true;
    status.textContent = 'Connecting to SOLO…';
    let succeeded = false;
    const sessionVersion = account.sessionVersion;
    const version = conversationVersion;
    try {
      const controller = new AbortController();
      activeController = controller;
      const timer = setTimeout(() => controller.abort(), 35000);
      let response, data;
      try {
        response = await fetch('/api/solo-chat', {
          method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
          body:payload, signal:controller.signal
        });
        data = await response.json().catch(() => ({}));
      } finally {clearTimeout(timer);}
      if (version !== conversationVersion || sessionVersion !== account.sessionVersion) return;
      if (response.status === 409 && data.code === 'account_changed') {
        recheckAccount();
        return;
      }
      if (data.usage) window.dispatchEvent(new CustomEvent('solo:usage', {detail: data.usage}));
      if (!response.ok) {
        if (response.status === 409) {
          if (retry?.requestId === requestId) retry.accepted = true;
          add('notice', acceptedNotice);
          status.textContent = 'Request already accepted';
          return;
        }
        if (response.status === 429) {
          const value = response.headers?.get('Retry-After');
          const seconds = value && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
          const deadline = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(value || '');
          if (Number.isFinite(deadline) && deadline > Date.now()) {
            retryAfter = deadline;
            showWait();
          } else {
            add('notice', 'Your usage limit has been reached. Please check your account allowance before trying again.');
            status.textContent = 'Usage limit reached';
          }
          return;
        }
        if (response.status === 401 && account.enabled) {
          add('notice', 'Your session has expired or sign-in is required. Sign in to your invited account again.');
          status.textContent = 'Sign-in required';
          window.dispatchEvent(new CustomEvent('solo:session-expired'));
          return;
        }
        const privateAccess = response.status === 401 || (response.status === 503 && !account.chatEnabled);
        const message = privateAccess
          ? privateNotice
          : 'SOLO could not respond right now. Please try again later.';
        add('notice', message);
        status.textContent = privateAccess ? 'Development access only' : 'Response unavailable';
        return;
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('Empty reply');
      add('assistant', data.reply);
      messages.splice(0, messages.length, ...pending, {role:'assistant',content:data.reply.slice(0,1200)});
      succeeded = true;
      retry = null;
      status.textContent = 'SOLO replied';
    } catch {
      if (version !== conversationVersion || sessionVersion !== account.sessionVersion) return;
      add('notice','SOLO is unavailable right now. Please try again later.');
      status.textContent = 'Connection unavailable';
    } finally {
      // Preserve a newer draft typed while the request was pending.
      const sameConversation = version === conversationVersion && sessionVersion === account.sessionVersion;
      if (!succeeded && input.value === '' && sameConversation) input.value = prompt;
      activeController = null;
      submit.disabled = false;
      if (sameConversation) input.focus();
    }
  });
})();
