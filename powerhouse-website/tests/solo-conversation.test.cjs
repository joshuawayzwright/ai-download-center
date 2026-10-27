const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../solo-conversation.js'), 'utf8');
const response = (reply = 'SOLO response', status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => status === 200 ? {reply} : {error: 'Unavailable'}
});

function harness(responder = async (_options, number) => response(`Reply ${number}`)) {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.textContent = '';
      this.value = '';
      this.disabled = false;
      this.focusCount = 0;
    }
    append(...nodes) { this.children.push(...nodes); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { this.focusCount++; }
    get scrollHeight() { return this.children.length; }
    set innerHTML(_value) { throw new Error('Chat must render untrusted text with textContent'); }
  }
  const form = new Element();
  const input = new Element();
  const button = new Element();
  const transcript = new Element();
  const status = new Element();
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  form.querySelector = selector => selector === 'textarea' ? input : button;
  const elements = {'#solo-chat-form': form, '#solo-chat-transcript': transcript, '#solo-chat-status': status};
  vm.runInNewContext(source, {
    document: {querySelector: selector => elements[selector], createElement: () => new Element()},
    AbortController, TextEncoder,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      calls.push({url, ...options});
      return responder(options, calls.length);
    }
  });
  return {
    input, button, transcript, status, calls, timers,
    async submit(value) {
      input.value = value;
      await form.listeners.submit({preventDefault() {}});
    },
    history: index => JSON.parse(calls[index].body).messages,
    lines: () => transcript.children.map(line => ({
      label: line.children[0].textContent,
      text: line.children[1].textContent
    }))
  };
}

function assertConversation(messages) {
  assert.ok(messages.length <= 11);
  assert.equal(messages.length % 2, 1);
  for (let i = 0; i < messages.length; i++) {
    assert.equal(messages[i].role, i % 2 === 0 ? 'user' : 'assistant');
  }
}

test('eight exchanges preserve complete history pairs and never start with assistant', async () => {
  const h = harness();
  for (let turn = 1; turn <= 8; turn++) {
    await h.submit(`Question ${turn}`);
    const messages = h.history(turn - 1);
    assertConversation(messages);
    assert.equal(messages.at(-1).content, `Question ${turn}`);
    assert.equal(h.status.textContent, 'SOLO replied');
  }
  assert.equal(h.history(6)[0].content, 'Question 2');
  assert.equal(h.history(7)[0].content, 'Question 3');
  assert.equal(h.history(7).at(-2).content, 'Reply 7');
  assert.equal(h.timers.size, 0);
  assert.equal(h.button.disabled, false);
});

for (const [name, content] of [
  ['multibyte UTF-8', '界'.repeat(1200)],
  ['JSON-escaped control characters', '\u0001'.repeat(1200)]
]) {
  test(`${name} history stays within the actual 16,000-byte request limit`, async () => {
    const h = harness(async () => response(content));
    for (let turn = 0; turn < 8; turn++) {
      await h.submit(content);
      assert.ok(Buffer.byteLength(h.calls[turn].body, 'utf8') <= 16000);
      assertConversation(h.history(turn));
      assert.equal(h.history(turn).at(-1).content, content);
    }
    assert.ok(h.history(7).length < 11, 'byte limit must trim before message-count limit');
  });
}

for (const status of [401, 503]) {
  test(`HTTP ${status} gives private-testing status and restores a retry without failed context`, async () => {
    const h = harness(async (_options, number) => response(`Reply ${number}`, number === 2 ? status : 200));
    await h.submit('Successful question');
    await h.submit('Retry this question');
    assert.equal(h.status.textContent, 'Development access only');
    assert.equal(h.input.value, 'Retry this question');
    assert.equal(h.lines().at(-1).label, 'STATUS');
    assert.match(h.lines().at(-1).text, /private testing/);
    assert.doesNotMatch(h.lines().at(-1).text, /log ?in|sign ?in/i);
    await h.submit(h.input.value);
    assert.deepEqual(h.history(2), [
      {role: 'user', content: 'Successful question'},
      {role: 'assistant', content: 'Reply 1'},
      {role: 'user', content: 'Retry this question'}
    ]);
    assert.equal(h.input.value, '');
  });
}

test('a failed pending request preserves a newer draft and blocks duplicate submission', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.submit('First question');
  assert.equal(h.button.disabled, true);
  await h.submit('A newer draft');
  assert.equal(h.calls.length, 1);
  finish(response('', 502));
  await pending;
  assert.equal(h.input.value, 'A newer draft');
  assert.equal(h.status.textContent, 'Response unavailable');
  assert.equal(h.button.disabled, false);
  assert.equal(h.timers.size, 0);
});

for (const [name, fail] of [
  ['network failure', () => { throw new Error('Network unavailable'); }],
  ['empty reply', () => response('')],
  ['invalid JSON', () => ({ok: true, status: 200, json: async () => { throw new Error('Invalid JSON'); }})]
]) {
  test(`${name} restores the prompt and does not enter successful conversation history`, async () => {
    const h = harness(async (_options, number) => number === 1 ? fail() : response());
    await h.submit('Please retain this');
    assert.equal(h.input.value, 'Please retain this');
    assert.equal(h.lines().at(-1).label, 'STATUS');
    assert.equal(h.status.textContent, 'Connection unavailable');
    assert.equal(h.timers.size, 0);
    await h.submit(h.input.value);
    assert.deepEqual(h.history(1), [{role: 'user', content: 'Please retain this'}]);
  });
}

test('user and model markup remains text, and the browser sends no private credentials', async () => {
  const modelText = '<script>alert("model")</script>';
  const prompt = '<img src=x onerror=alert("user")>';
  const h = harness(async () => response(modelText));
  await h.submit(prompt);
  assert.deepEqual(h.lines(), [{label: 'YOU', text: prompt}, {label: 'SOLO', text: modelText}]);
  assert.equal(h.calls[0].url, '/api/solo-chat');
  assert.equal(h.calls[0].method, 'POST');
  assert.equal(h.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(h.calls[0].headers), ['Content-Type']);
});

test('timeout also aborts a stalled response body and leaves the prompt available to retry', async () => {
  let bodyStarted;
  const reading = new Promise(resolve => { bodyStarted = resolve; });
  const h = harness(async options => ({
    ok: true,
    status: 200,
    json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      bodyStarted();
    })
  }));
  const pending = h.submit('Do not lose this prompt');
  await reading;
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  await pending;
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.input.value, 'Do not lose this prompt');
  assert.equal(h.status.textContent, 'Connection unavailable');
  assert.equal(h.button.disabled, false);
  assert.equal(h.timers.size, 0);
});

test('blank and oversized input never submits an API request', async () => {
  const h = harness();
  await h.submit('   ');
  await h.submit('x'.repeat(1201));
  assert.equal(h.calls.length, 0);
  assert.equal(h.lines().length, 0);
});
