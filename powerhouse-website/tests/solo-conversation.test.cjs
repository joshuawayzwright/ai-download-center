const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../solo-conversation.js'), 'utf8');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = (reply = 'SOLO response', status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => status === 200 ? {reply} : {error: 'Unavailable'}
});

function harness(responder = async (_options, number) => response(`Reply ${number}`), options = {}) {
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
    replaceChildren(...nodes) { this.children = [...nodes]; }
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
  let uuid = 0;
  let now = Date.now();
  const events = [];
  const windowListeners = {};
  const window = {
    soloAccountState: options.account === undefined
      ? {enabled:true,authenticated:true,chatEnabled:true,sessionVersion:1,userId:USER}
      : options.account,
    addEventListener(name, listener) { (windowListeners[name] ||= []).push(listener); },
    dispatchEvent(event) { events.push(event); for (const listener of windowListeners[event.type] || []) listener(event); }
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  class Clock extends Date { static now() { return now; } }
  form.querySelector = selector => selector === 'textarea' ? input : button;
  const elements = {'#solo-chat-form': form, '#solo-chat-transcript': transcript, '#solo-chat-status': status};
  vm.runInNewContext(source, {
    document: {querySelector: selector => elements[selector], createElement: () => new Element()},
    AbortController, TextEncoder, window, CustomEvent, Date: Clock,
    crypto: options.secureCrypto === false ? undefined : {
      randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      calls.push({url, ...options});
      return responder(options, calls.length);
    }
  });
  return {
    input, button, transcript, status, calls, timers, events,
    advance(milliseconds) { now += milliseconds; },
    edit(value) { input.value = value; input.listeners.input(); },
    setAccount(state) { window.soloAccountState = state; window.dispatchEvent(new CustomEvent('solo:account', {detail: state})); },
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
  assert.equal(h.calls[0].credentials, 'same-origin');
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

test('an unchanged manual retry reuses the request UUID and success clears it', async () => {
  const h = harness(async (_options, number) => {
    if (number === 1) throw new Error('Connection lost');
    return response();
  });
  await h.submit('A retryable question');
  await h.submit(h.input.value);
  const first = JSON.parse(h.calls[0].body).requestId;
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(h.calls[0].body, h.calls[1].body);
  await h.submit('A retryable question');
  assert.notEqual(JSON.parse(h.calls[2].body).requestId, first);
});

test('editing a failed prompt clears the retry UUID even if the original text is restored', async () => {
  const h = harness(async () => response('', 502));
  await h.submit('Original question');
  h.edit('An edited question');
  h.edit('Original question');
  await h.submit(h.input.value);
  assert.notEqual(JSON.parse(h.calls[0].body).requestId, JSON.parse(h.calls[1].body).requestId);
});

test('409 marks the request accepted and blocks resubmission until the user edits', async () => {
  const h = harness(async () => response('', 409));
  await h.submit('Accept once');
  assert.equal(h.status.textContent, 'Request already accepted');
  assert.match(h.lines().at(-1).text, /already been accepted/);
  await h.submit(h.input.value);
  assert.equal(h.calls.length, 1);
  h.edit('A new request');
  await h.submit(h.input.value);
  assert.equal(h.calls.length, 2);
  assert.notEqual(JSON.parse(h.calls[0].body).requestId, JSON.parse(h.calls[1].body).requestId);
});

test('429 honors Retry-After without automatic inference and preserves the retry UUID', async () => {
  const h = harness(async (_options, number) => number === 1
    ? {...response('', 429), headers: {get: () => '2'}} : response());
  await h.submit('Respect the quota');
  assert.match(h.lines().at(-1).text, /wait 2 seconds/);
  await h.submit(h.input.value);
  h.advance(1999);
  await h.submit(h.input.value);
  assert.equal(h.calls.length, 1);
  h.advance(1);
  assert.equal(h.calls.length, 1, 'waiting must never automatically retry inference');
  await h.submit(h.input.value);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].body, h.calls[1].body);
});

test('401 requests account refresh only when customer accounts are enabled', async () => {
  const h = harness(async () => response('', 401), {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  await h.submit('My session expired');
  assert.equal(h.status.textContent, 'Sign-in required');
  assert.match(h.lines().at(-1).text, /Sign in/);
  assert.equal(h.events.filter(event => event.type === 'solo:session-expired').length, 1);
  assert.equal(h.calls.length, 1);
});

test('closed public account state keeps the composer disabled without sending', async () => {
  const h = harness(undefined, {account:{enabled:false,authenticated:false,chatEnabled:false,sessionVersion:0}});
  h.setAccount({enabled:false,authenticated:false,chatEnabled:false,sessionVersion:0});
  assert.equal(h.input.disabled,true);
  assert.equal(h.button.disabled,true);
  assert.match(h.input.placeholder,/not publicly available/);
  await h.submit('Do not send');
  assert.equal(h.calls.length,0);
});

test('invited account login and customer chat gates are respected before sending', async () => {
  const h = harness(undefined, {account: {enabled: true, authenticated: false, chatEnabled: false, sessionVersion: 0}});
  await h.submit('Keep this draft');
  assert.equal(h.calls.length, 0);
  assert.equal(h.input.value, 'Keep this draft');
  assert.equal(h.status.textContent, 'Sign-in required');
  h.setAccount({enabled: true, authenticated: true, chatEnabled: false, sessionVersion: 1, userId: USER});
  assert.equal(h.input.disabled, true);
  assert.equal(h.button.disabled, true);
  await h.submit('Wait for chat approval');
  assert.equal(h.calls.length, 0);
  assert.equal(h.status.textContent, 'Signed in — chat remains in private testing');
});


test('chat-off account state disables the composer and repeated blocked submits cannot stack notices', async () => {
  const h = harness(undefined, {account: {enabled: true, authenticated: false, chatEnabled: false, sessionVersion: 0}});
  h.setAccount({enabled: true, authenticated: true, chatEnabled: false, sessionVersion: 1, userId: USER});
  assert.equal(h.input.disabled, true);
  assert.equal(h.button.disabled, true);
  assert.equal(h.input.placeholder, 'Chat remains in private testing');
  const initial = h.lines().length;
  await h.submit('Blocked one');
  await h.submit('Blocked two');
  assert.equal(h.calls.length, 0);
  assert.equal(h.lines().length, initial);
});

test('identical system notices are deduplicated until another message changes the transcript state', async () => {
  const h = harness(undefined, {account: {enabled: true, authenticated: true, chatEnabled: false, sessionVersion: 1, userId: USER}});
  h.setAccount({enabled: true, authenticated: true, chatEnabled: false, sessionVersion: 2, userId: OTHER_USER});
  const first = h.lines().length;
  h.setAccount({enabled: true, authenticated: true, chatEnabled: false, sessionVersion: 3, userId: USER});
  assert.ok(h.lines().length <= first + 1);
});

test('missing secure UUID support fails closed without a random fallback', async () => {
  const h = harness(undefined, {secureCrypto: false});
  await h.submit('A secure request');
  assert.equal(h.calls.length, 0);
  assert.equal(h.status.textContent, 'Secure browser required');
  assert.equal(h.input.value, 'A secure request');
});

test('account change clears context and suppresses an old in-flight reply and prompt', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }), {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  const pending = h.submit('Previous account private prompt');
  h.setAccount({enabled: true, authenticated: false, chatEnabled: false, sessionVersion: 2});
  assert.equal(h.calls[0].signal.aborted, true);
  finish(response('Previous account private reply'));
  await pending;
  assert.equal(h.input.value, '');
  assert.equal(h.input.focusCount, 0, 'an old request must not move focus after sign-out');
  assert.ok(h.lines().every(line => !line.text.includes('Previous account')));
  h.setAccount({enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 3, userId: OTHER_USER});
  const next = h.submit('New account question');
  finish(response('New account reply'));
  await next;
  assert.deepEqual(h.history(1), [{role: 'user', content: 'New account question'}]);
});

test('admitted provider failure updates returned usage without an extra request', async () => {
  const usage = {remaining_daily: 2, daily_limit: 10};
  const h = harness(async () => ({ok: false, status: 502, json: async () => ({error: 'Provider unavailable', usage})}));
  await h.submit('A request that used an allowance');
  assert.equal(h.calls.length, 1);
  assert.equal(h.events.filter(event => event.type === 'solo:usage').length, 1);
  assert.deepEqual(h.events.find(event => event.type === 'solo:usage').detail, usage);
  assert.equal(h.status.textContent, 'Response unavailable');
});

test('customer requests bind to the visible account and include the binding in the 16000-byte budget', async () => {
  // Three such turns fit without expectedUserId (15,961 bytes), but not with it
  // (16,017 bytes), so the older complete exchange must be trimmed.
  const content = '\u0001'.repeat(878);
  const h = harness(async () => response(content), {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  await h.submit(content);
  await h.submit(content);
  for (const call of h.calls) {
    assert.equal(JSON.parse(call.body).expectedUserId, USER);
    assert.ok(Buffer.byteLength(call.body, 'utf8') <= 16000);
  }
  assert.deepEqual(h.history(1), [{role: 'user', content}]);
});

test('an authenticated UI without a valid account ID fails closed and requests an account check', async () => {
  for (const userId of [undefined, null, 'not-an-account', 42]) {
    const h = harness(undefined, {
      account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId}
    });
    await h.submit('A draft without a verified owner');
    assert.equal(h.calls.length, 0);
    assert.equal(h.input.value, '');
    assert.equal(h.events.filter(event => event.type === 'solo:account-stale').length, 1);
    await h.submit('Wait for account verification');
    assert.equal(h.calls.length, 0);
  }
});

test('account_changed clears stale history and draft without a duplicate retry or focus restoration', async () => {
  const h = harness(async (_options, number) => number === 2
    ? {ok: false, status: 409, json: async () => ({code: 'account_changed', error: 'Account changed'})}
    : response('Reply for this account'), {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  await h.submit('First account private history');
  const priorFocus = h.input.focusCount;
  await h.submit('First account private follow-up');
  assert.equal(h.calls.length, 2);
  assert.equal(h.input.value, '');
  assert.equal(h.input.focusCount, priorFocus);
  assert.ok(h.lines().every(line => !line.text.includes('First account') && !line.text.includes('already been accepted')));
  assert.equal(h.events.filter(event => event.type === 'solo:account-stale').length, 1);
  assert.equal(h.events.filter(event => event.type === 'solo:usage').length, 0);
  await h.submit('Do not send while checking account access');
  assert.equal(h.calls.length, 2, 'account recovery must never automatically retry inference');
  h.setAccount({enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 2, userId: OTHER_USER});
  await h.submit('Second account new conversation');
  assert.deepEqual(h.history(2), [{role: 'user', content: 'Second account new conversation'}]);
  assert.equal(JSON.parse(h.calls[2].body).expectedUserId, OTHER_USER);
  assert.notEqual(JSON.parse(h.calls[2].body).requestId, JSON.parse(h.calls[1].body).requestId);
});

test('a changed public account ID clears context even if its session version is unchanged', async () => {
  const h = harness(undefined, {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  await h.submit('Original account private history');
  h.setAccount({enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: OTHER_USER});
  assert.ok(h.lines().every(line => !line.text.includes('Original account')));
  await h.submit('Changed account conversation');
  assert.deepEqual(h.history(1), [{role: 'user', content: 'Changed account conversation'}]);
});

test('an expired customer cookie requests one refresh and keeps the UUID for a manual retry', async () => {
  const h = harness(async (_options, number) => number === 1
    ? {ok: false, status: 401, json: async () => ({code: 'session_expired'})} : response(), {
    account: {enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER}
  });
  await h.submit('Keep this customer request');
  assert.equal(h.events.filter(event => event.type === 'solo:session-expired').length, 1);
  assert.equal(h.calls.length, 1);
  h.setAccount({enabled: true, authenticated: true, chatEnabled: true, sessionVersion: 1, userId: USER});
  assert.equal(h.calls.length, 1, 'refreshing account state must not submit inference');
  await h.submit(h.input.value);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].body, h.calls[1].body);
});
