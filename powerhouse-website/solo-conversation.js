(() => {
  const form = document.querySelector('#solo-chat-form');
  const transcript = document.querySelector('#solo-chat-transcript');
  const status = document.querySelector('#solo-chat-status');
  if (!form || !transcript || !status) return;
  const input = form.querySelector('textarea');
  const submit = form.querySelector('button[type="submit"]');
  const messages = [];
  const encoder = new TextEncoder();
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || prompt.length > 1200 || submit.disabled) return;
    add('user', prompt);
    const pending = [...messages, {role:'user',content:prompt}];
    // Keep complete exchanges followed by the pending user turn. A 12-message
    // slice can start with an assistant; at most 11 preserves the shared API contract.
    while (pending.length > 11) pending.splice(0, 2);
    let payload = JSON.stringify({messages:pending});
    // Character limits alone do not bound UTF-8 or JSON-escaped request bytes.
    while (encoder.encode(payload).byteLength > 16000 && pending.length > 1) {
      pending.splice(0, 2);
      payload = JSON.stringify({messages:pending});
    }
    input.value = '';
    submit.disabled = true;
    status.textContent = 'Connecting to SOLO…';
    let succeeded = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      let response, data;
      try {
        response = await fetch('/api/solo-chat', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:payload, signal:controller.signal
        });
        data = await response.json().catch(() => ({}));
      } finally {clearTimeout(timer);}
      if (!response.ok) {
        const privateAccess = response.status === 401 || response.status === 503;
        const message = privateAccess
          ? 'SOLO AI is in private testing. Public conversations are not available yet.'
          : 'SOLO could not respond right now. Please try again later.';
        add('notice', message);
        status.textContent = privateAccess ? 'Development access only' : 'Response unavailable';
        return;
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('Empty reply');
      add('assistant', data.reply);
      messages.splice(0, messages.length, ...pending, {role:'assistant',content:data.reply.slice(0,1200)});
      succeeded = true;
      status.textContent = 'SOLO replied';
    } catch {
      add('notice','SOLO is unavailable right now. Please try again later.');
      status.textContent = 'Connection unavailable';
    } finally {
      // Preserve a newer draft typed while the request was pending.
      if (!succeeded && input.value === '') input.value = prompt;
      submit.disabled = false;
      input.focus();
    }
  });
})();
