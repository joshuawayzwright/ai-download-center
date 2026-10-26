(() => {
  const form = document.querySelector('#solo-chat-form');
  const transcript = document.querySelector('#solo-chat-transcript');
  const status = document.querySelector('#solo-chat-status');
  if (!form || !transcript || !status) return;
  const input = form.querySelector('textarea');
  const submit = form.querySelector('button[type="submit"]');
  const messages = [];
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
    const pending = [...messages, {role:'user',content:prompt}].slice(-12);
    input.value = '';
    submit.disabled = true;
    status.textContent = 'Connecting to SOLO…';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      let response;
      try {
        response = await fetch('/api/solo-chat', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({messages:pending}), signal:controller.signal
        });
      } finally {clearTimeout(timer);}
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = response.status === 503
          ? 'SOLO AI is in private testing. Public conversations are not available yet.'
          : 'SOLO could not respond right now. Please try again later.';
        add('notice', message);
        status.textContent = 'Development access only';
        return;
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('Empty reply');
      add('assistant', data.reply);
      messages.splice(0, messages.length, ...pending, {role:'assistant',content:data.reply.slice(0,1200)});
      if(messages.length > 12) messages.splice(0, messages.length - 12);
      status.textContent = 'SOLO replied';
    } catch {
      add('notice','SOLO is unavailable right now. Please try again later.');
      status.textContent = 'Connection unavailable';
    } finally {submit.disabled=false;input.focus();}
  });
})();
