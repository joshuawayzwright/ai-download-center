const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../solo-account.js'), 'utf8');
const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const signedOut = {enabled: true, authenticated: false, chatEnabled: false};
const signedIn = {
  enabled: true, authenticated: true, chatEnabled: true,
  user: {id: USER_A, email: 'tester@example.com'}, usage: {remaining_daily: 7, daily_limit: 10}
};
const response = (data, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => data});

function channelHub() {
  const channels = new Set();
  const messages = [];
  return {
    messages,
    BroadcastChannel: class {
      constructor(name) { this.name = name; this.listeners = []; channels.add(this); }
      addEventListener(name, listener) { if (name === 'message') this.listeners.push(listener); }
      postMessage(data) {
        messages.push({name: this.name, data});
        for (const other of channels) if (other !== this && other.name === this.name) {
          queueMicrotask(() => { for (const listener of other.listeners) listener({data}); });
        }
      }
    }
  };
}

function harness(responder = async () => response(signedOut), options = {}) {
  class Element {
    constructor() {
      this.value = '';
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
      this.style = {};
      this.attributes = {};
      this.listeners = {};
      this.children = [];
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    focus() {}
    get scrollHeight() { return this.children.length; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    setAttribute(name, value) { this.attributes[name] = value; }
    set innerHTML(_value) { throw new Error('Untrusted account content must remain text'); }
  }
  const elements = Object.fromEntries([
    'solo-account', 'solo-account-form', 'solo-account-status', 'solo-account-usage',
    'solo-account-refresh', 'solo-account-logout'
  ].map(id => [`#${id}`, new Element()]));
  const panel = elements['#solo-account'];
  const form = elements['#solo-account-form'];
  const status = elements['#solo-account-status'];
  const usage = elements['#solo-account-usage'];
  const refresh = elements['#solo-account-refresh'];
  const logout = elements['#solo-account-logout'];
  const email = new Element();
  const password = new Element();
  const submit = new Element();
  form.querySelector = selector => ({
    'input[type="email"]': email, 'input[type="password"]': password, 'button[type="submit"]': submit
  })[selector];
  let chat;
  if (options.conversation) {
    chat = {form: new Element(), input: new Element(), submit: new Element(), transcript: new Element(), status: new Element()};
    chat.form.querySelector = selector => selector === 'textarea' ? chat.input : chat.submit;
    elements['#solo-chat-form'] = chat.form;
    elements['#solo-chat-transcript'] = chat.transcript;
    elements['#solo-chat-status'] = chat.status;
    chat.send = value => {
      chat.input.value = value;
      return chat.form.listeners.submit({preventDefault() {}});
    };
  }
  const calls = [];
  const events = [];
  const windowListeners = {};
  const documentListeners = {};
  const timers = new Map();
  let timerId = 0;
  let now = 1000000;
  const window = {
    addEventListener(name, listener) { (windowListeners[name] ||= []).push(listener); },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of windowListeners[event.type] || []) listener(event);
    }
  };
  if (options.BroadcastChannel) window.BroadcastChannel = options.BroadcastChannel;
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const document = {
    visibilityState: 'visible', querySelector: selector => elements[selector], createElement: () => new Element(),
    addEventListener(name, listener) { (documentListeners[name] ||= []).push(listener); }
  };
  Object.defineProperty(document, 'cookie', {
    get() { throw new Error('Session cookies must stay inaccessible to JavaScript'); },
    set() { throw new Error('Session cookies must be set by the server'); }
  });
  const context = {
    document, window, CustomEvent, AbortController, TextEncoder,
    crypto: {randomUUID: require('node:crypto').randomUUID},
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => { calls.push({url, ...options}); return responder(options, calls.length, url); }
  };
  for (const target of [context, window]) for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(target, name, {get() { throw new Error('Credentials must not use browser storage'); }});
  }
  vm.runInNewContext(source, context);
  if (options.conversation) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../solo-conversation.js'), 'utf8'), context);
  }
  return {
    panel, form, email, password, submit, status, usage, refresh, logout, calls, events, timers, window, chat,
    async ready() {
      await Promise.resolve();
      for (let i = 0; i < 80 && panel.attributes['aria-busy'] === 'true'; i++) await Promise.resolve();
      assert.equal(panel.attributes['aria-busy'], 'false');
    },
    login(address = 'tester@example.com', secret = 'test-password-not-a-real-secret') {
      email.value = address;
      password.value = secret;
      return form.listeners.submit({preventDefault() {}});
    },
    check: () => refresh.listeners.click(),
    signOut: () => logout.listeners.click(),
    dispatch(type, detail) { window.dispatchEvent(new CustomEvent(type, {detail})); },
    emit(type, fields = {}) { window.dispatchEvent({type, ...fields}); },
    advance(milliseconds) { now += milliseconds; },
    visibility(value) {
      document.visibilityState = value;
      for (const listener of documentListeners.visibilitychange || []) listener({type: 'visibilitychange'});
    }
  };
}

test('disabled account gate stays a private preview without sign-in or sign-out controls', async () => {
  const h = harness(async () => response({enabled: false, authenticated: false}));
  await h.ready();
  assert.equal(h.form.hidden, true);
  assert.equal(h.logout.hidden, true);
  assert.equal(h.logout.style.display, 'none');
  assert.equal(h.usage.hidden, true);
  assert.match(h.status.textContent, /private testing/);
  assert.doesNotMatch(h.status.textContent, /Signed in|Chat is available/);
  assert.equal(h.calls[0].method, 'GET');
  assert.equal(h.calls[0].credentials, 'same-origin');
  assert.equal(h.calls[0].cache, 'no-store');
});

test('enabled signed-out account shows invited login without registering or sending email', async () => {
  const h = harness();
  await h.ready();
  assert.equal(h.form.hidden, false);
  assert.match(h.status.textContent, /Invited testers/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, '/api/solo-auth');
});

test('login uses server cookies, clears the password and publishes only sanitized UI state', async () => {
  const h = harness(async (_options, number) => response(number === 1 ? signedOut : {
    ...signedIn, access_token: 'must-not-reach-ui', refresh_token: 'must-not-reach-state'
  }));
  await h.ready();
  const pending = h.login(' tester@example.com ');
  assert.equal(h.password.value, '');
  await pending;
  assert.equal(h.calls[1].method, 'POST');
  assert.equal(h.calls[1].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(h.calls[1].body), {
    action: 'login', email: 'tester@example.com', password: 'test-password-not-a-real-secret'
  });
  assert.deepEqual(Object.keys(h.calls[1].headers), ['Content-Type']);
  assert.equal(h.form.hidden, true);
  assert.equal(h.logout.hidden, false);
  assert.match(h.status.textContent, /Signed in as tester@example.com/);
  assert.equal(h.usage.textContent, '7 of 10 daily requests remaining.');
  assert.equal(h.window.soloAccountState.sessionVersion, 1);
  assert.equal(h.window.soloAccountState.userId, USER_A);
  assert.doesNotMatch(JSON.stringify(h.window.soloAccountState), /must-not|password|access_token|refresh_token/);
  assert.ok(h.events.some(event => event.type === 'solo:account' && event.detail.authenticated));
  assert.equal(h.timers.size, 0);
});

test('authenticated account does not claim chat works while the customer chat gate is off', async () => {
  const h = harness(async () => response({...signedIn, chatEnabled: false}));
  await h.ready();
  assert.match(h.status.textContent, /Chat remains in private testing/);
  assert.equal(h.window.soloAccountState.chatEnabled, false);
});

test('failed login has a generic error, clears password and never authenticates', async () => {
  const h = harness(async (_options, number) => number === 1 ? response(signedOut) : response({error: 'Internal provider detail'}, 401));
  await h.ready();
  await h.login();
  assert.match(h.status.textContent, /Sign-in failed/);
  assert.doesNotMatch(h.status.textContent, /Internal provider detail/);
  assert.equal(h.password.value, '');
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.form.hidden, false);
  assert.equal(h.submit.disabled, false);
});

test('expired startup session refreshes once and does not refresh indefinitely', async () => {
  const h = harness(async () => response({error: 'Session expired'}, 401));
  await h.ready();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].method, 'GET');
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'refresh'});
  assert.equal(h.form.hidden, false);
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.match(h.status.textContent, /Sign in/);
});

test('a refreshable expired session recovers and explicit refresh uses the same cookie API', async () => {
  const h = harness(async (_options, number) => number === 1 ? response({error: 'Expired'}, 401) : response(signedIn));
  await h.ready();
  assert.equal(h.window.soloAccountState.authenticated, true);
  const version = h.window.soloAccountState.sessionVersion;
  await h.check();
  assert.deepEqual(JSON.parse(h.calls[2].body), {action: 'refresh'});
  assert.equal(h.window.soloAccountState.sessionVersion, version);
});

test('sign-out is confirmed by server status and increments the conversation session version', async () => {
  const h = harness(async (_options, number) => response(number === 1 ? signedIn : signedOut));
  await h.ready();
  await h.signOut();
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'logout'});
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.window.soloAccountState.sessionVersion, 2);
  assert.equal(h.logout.hidden, true);
  assert.equal(h.email.value, '');
});

test('failed sign-out clears local account state without falsely confirming server revocation', async () => {
  const h = harness(async (_options, number) => {
    if (number === 1) return response(signedIn);
    throw new Error('Network error');
  });
  await h.ready();
  await h.signOut();
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.window.soloAccountState.sessionVersion, 2);
  assert.match(h.status.textContent, /Server sign-out could not be confirmed/);
  assert.equal(h.logout.hidden, true);
});

test('revoked membership clears signed-in state and gives the invited-access explanation', async () => {
  const h = harness(async (_options, number) => number === 1 ? response(signedIn)
    : response({enabled: true, authenticated: false, error: 'Access denied'}, 403));
  await h.ready();
  await h.check();
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.window.soloAccountState.sessionVersion, 2);
  assert.match(h.status.textContent, /does not have invited SOLO preview access/);
});

test('a gate disabled during login returns to the private-preview message', async () => {
  const h = harness(async (_options, number) => number === 1 ? response(signedOut)
    : response({enabled: false, authenticated: false, chatEnabled: false}, 503));
  await h.ready();
  await h.login();
  assert.equal(h.window.soloAccountState.enabled, false);
  assert.equal(h.form.hidden, true);
  assert.match(h.status.textContent, /private testing/);
});

test('account identity uses the server user ID even if email is unchanged', async () => {
  const h = harness(async (_options, number) => response({
    ...signedIn, user: {id: number === 1 ? USER_A : USER_B, email: 'same@example.com'}
  }));
  await h.ready();
  assert.equal(h.window.soloAccountState.sessionVersion, 1);
  await h.check();
  assert.equal(h.window.soloAccountState.sessionVersion, 2);
});

test('account outage and malformed response never expose login success', async () => {
  for (const responder of [
    async () => { throw new Error('Network error'); },
    async () => ({ok: true, status: 200, json: async () => { throw new Error('Broken JSON'); }}),
    async () => response({error: 'Provider service unavailable'}, 503)
  ]) {
    const h = harness(responder);
    await h.ready();
    assert.match(h.status.textContent, /temporarily unavailable/);
    assert.equal(h.window.soloAccountState.authenticated, false);
    assert.equal(h.form.hidden, true);
    assert.equal(h.refresh.disabled, false);
    assert.equal(h.timers.size, 0);
  }
});

test('user email markup is text and invalid usage is hidden', async () => {
  const address = '<img src=x onerror=alert(1)>';
  const h = harness(async () => response({...signedIn, user: {id: USER_A, email: address}, usage: {remaining_daily: -3, daily_limit: 10}}));
  await h.ready();
  assert.ok(h.status.textContent.includes(address));
  assert.equal(h.usage.hidden, true);
  assert.equal(h.window.soloAccountState.usage, null);
});

test('chat session-expired event refreshes account cookies without submitting chat inference', async () => {
  const h = harness(async () => response(signedIn));
  await h.ready();
  h.dispatch('solo:session-expired');
  await h.ready();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'refresh'});
  assert.ok(h.calls.every(call => call.url === '/api/solo-auth'));
  h.dispatch('solo:usage', {remaining_daily: 6, daily_limit: 10});
  assert.equal(h.usage.textContent, '6 of 10 daily requests remaining.');
});

test('account request timeout is at least 30 seconds and makes controls recoverable', async () => {
  const h = harness(options => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const timer = [...h.timers.values()][0];
  assert.ok(timer.delay >= 30000);
  timer.callback();
  await h.ready();
  assert.match(h.status.textContent, /temporarily unavailable/);
  assert.equal(h.refresh.disabled, false);
});

test('authenticated UI requires a valid server user ID and publishes no identity when signed out', async () => {
  for (const id of [undefined, 'not-a-user-id', '<script>']) {
    const h = harness(async () => response({...signedIn, user: {id, email: 'tester@example.com'}}));
    await h.ready();
    assert.equal(h.window.soloAccountState.authenticated, false);
    assert.equal(h.window.soloAccountState.chatEnabled, false);
    assert.equal(h.window.soloAccountState.userId, null);
  }
  const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const h = harness(async (_options, number) => response(number === 1
    ? {...signedIn, user: {id, email: 'tester@example.com'}} : signedOut));
  await h.ready();
  assert.equal(h.window.soloAccountState.userId, id.toLowerCase());
  await h.signOut();
  assert.equal(h.window.soloAccountState.userId, null);
});

test('login and logout notify another tab without sharing identity, credentials or causing loops', async () => {
  const hub = channelHub();
  let current = signedOut;
  const responder = async options => {
    const action = options.body && JSON.parse(options.body).action;
    if (action === 'login') current = signedIn;
    if (action === 'logout') current = signedOut;
    return response(current);
  };
  const first = harness(responder, hub);
  const second = harness(responder, hub);
  await Promise.all([first.ready(), second.ready()]);
  await first.login();
  await second.ready();
  assert.equal(second.window.soloAccountState.userId, USER_A);
  assert.equal(second.calls.length, 2);
  await first.signOut();
  await second.ready();
  assert.equal(second.window.soloAccountState.authenticated, false);
  assert.equal(second.window.soloAccountState.userId, null);
  assert.equal(second.calls.length, 3);
  assert.equal(hub.messages.length, 2);
  assert.ok(hub.messages.every(message => message.data === 'account-changed'));
  assert.doesNotMatch(JSON.stringify(hub.messages), /password|tester@|00000000|access_token|refresh_token/);
  assert.ok(second.calls.every(call => call.method === 'GET' && call.url === '/api/solo-auth'));
});

test('stale-account invalidation clears immediately and an older status cannot restore the prior account', async () => {
  let finishOld;
  const old = new Promise(resolve => { finishOld = resolve; });
  const h = harness(async (_options, number) => number === 2 ? old : response(number === 1
    ? signedIn : {...signedIn, user: {id: USER_B, email: 'second@example.com'}}));
  await h.ready();
  const version = h.window.soloAccountState.sessionVersion;
  h.emit('focus');
  const eventStart = h.events.length;
  h.password.value = 'unfinished-local-password';
  h.dispatch('solo:account-stale');
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.window.soloAccountState.userId, null);
  assert.equal(h.window.soloAccountState.chatEnabled, false);
  assert.ok(h.window.soloAccountState.sessionVersion > version);
  assert.equal(h.password.value, '');
  finishOld(response(signedIn));
  await h.ready();
  assert.equal(h.calls.length, 3);
  assert.equal(h.window.soloAccountState.userId, USER_B);
  assert.ok(h.events.slice(eventStart).filter(event => event.type === 'solo:account')
    .every(event => event.detail.userId !== USER_A));
  assert.ok(h.calls.every(call => call.url === '/api/solo-auth'));
});

test('an invalidated delayed 401 does not refresh the newly changed cookie session', async () => {
  let finishOld;
  const old = new Promise(resolve => { finishOld = resolve; });
  const h = harness(async (_options, number) => number === 1 ? old
    : response({...signedIn, user: {id: USER_B, email: 'second@example.com'}}));
  h.dispatch('solo:account-stale');
  finishOld(response({error: 'Expired old session'}, 401));
  await h.ready();
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.method === 'GET'));
  assert.equal(h.window.soloAccountState.userId, USER_B);
});

test('external changes during login queue one recheck and ignore the delayed login identity', async () => {
  const hub = channelHub();
  const peer = new hub.BroadcastChannel('solo-account-events-v1');
  let finishLogin;
  const pendingLogin = new Promise(resolve => { finishLogin = resolve; });
  const h = harness(async (_options, number) => number === 1 ? response(signedOut)
    : number === 2 ? pendingLogin
      : response({...signedIn, user: {id: USER_B, email: 'second@example.com'}}), hub);
  await h.ready();
  const pending = h.login();
  const eventStart = h.events.length;
  peer.postMessage('account-changed');
  peer.postMessage('account-changed');
  await Promise.resolve();
  assert.equal(h.window.soloAccountState.userId, null);
  assert.equal(h.window.soloAccountState.authenticated, false);
  finishLogin(response(signedIn));
  await pending;
  await h.ready();
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].method, 'GET');
  assert.equal(h.window.soloAccountState.userId, USER_B);
  assert.ok(h.events.slice(eventStart).filter(event => event.type === 'solo:account')
    .every(event => event.detail.userId !== USER_A));
  // Two received signals and one completed login signal; checks never broadcast.
  assert.equal(hub.messages.length, 3);
});

test('same-user refresh and coalesced wake checks preserve the conversation version without broadcasts', async () => {
  const hub = channelHub();
  const h = harness(async () => response(signedIn), hub);
  await h.ready();
  const version = h.window.soloAccountState.sessionVersion;
  await h.check();
  h.emit('focus');
  h.emit('pageshow', {persisted: true});
  h.visibility('visible');
  await h.ready();
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].method, 'GET');
  assert.equal(h.window.soloAccountState.sessionVersion, version);
  assert.equal(h.window.soloAccountState.userId, USER_A);
  assert.equal(hub.messages.length, 0);
});

test('focus and restored-page checks discover changed accounts when BroadcastChannel is unavailable', async () => {
  const h = harness(async (_options, number) => response({...signedIn,
    user: {id: number === 2 ? USER_B : USER_A, email: 'tester@example.com'}}), {
    BroadcastChannel: class { constructor() { throw new Error('Unavailable'); } }
  });
  await h.ready();
  h.emit('pageshow', {persisted: false});
  await h.ready();
  assert.equal(h.calls.length, 1);
  h.emit('focus');
  await h.ready();
  assert.equal(h.window.soloAccountState.userId, USER_B);
  assert.equal(h.window.soloAccountState.sessionVersion, 2);
  h.advance(300);
  h.emit('pageshow', {persisted: true});
  await h.ready();
  assert.equal(h.calls.length, 3);
  assert.equal(h.window.soloAccountState.userId, USER_A);
  assert.equal(h.window.soloAccountState.sessionVersion, 3);
});

test('hidden-page events avoid account calls and visibility restoration revalidates once', async () => {
  const h = harness(async (_options, number) => response(number === 1 ? signedIn
    : {...signedIn, user: {id: USER_B, email: 'second@example.com'}}));
  await h.ready();
  h.visibility('hidden');
  h.emit('focus');
  assert.equal(h.calls.length, 1);
  h.visibility('visible');
  await h.ready();
  assert.equal(h.calls.length, 2);
  assert.equal(h.window.soloAccountState.userId, USER_B);
});

test('failed stale-account revalidation keeps the old identity unavailable', async () => {
  let failOld;
  const old = new Promise((_resolve, reject) => { failOld = reject; });
  const h = harness(async (_options, number) => number === 1 ? response(signedIn)
    : number === 2 ? old : response({error: 'Temporarily unavailable'}, 503));
  await h.ready();
  const pending = h.check();
  h.dispatch('solo:account-stale');
  failOld(new Error('Old request failed'));
  await pending;
  assert.equal(h.calls.length, 3);
  assert.equal(h.window.soloAccountState.authenticated, false);
  assert.equal(h.window.soloAccountState.userId, null);
  assert.equal(h.window.soloAccountState.chatEnabled, false);
  assert.match(h.status.textContent, /temporarily unavailable/);
  assert.equal(h.refresh.disabled, false);
});

test('both browser controllers recover from changed cookies without retrying or retaining another account history', async () => {
  let cookieUser = USER_A;
  let simulatedProviderCalls = 0;
  const h = harness(async (options, _number, url) => {
    if (url === '/api/solo-auth') return response({...signedIn,
      user: {id: cookieUser, email: 'controlled@example.invalid'}});
    assert.equal(url, '/api/solo-chat');
    const body = JSON.parse(options.body);
    if (body.expectedUserId !== cookieUser) return response({code: 'account_changed'}, 409);
    simulatedProviderCalls++;
    return response({reply: 'Synthetic reply', requestId: body.requestId});
  }, {conversation: true});
  await h.ready();
  await h.chat.send('SYNTHETIC_ACCOUNT_A_CONTEXT');
  assert.equal(simulatedProviderCalls, 1);
  cookieUser = USER_B;
  await h.chat.send('Draft from the stale tab');
  await h.ready();
  const chatCalls = () => h.calls.filter(call => call.url === '/api/solo-chat');
  assert.equal(chatCalls().length, 2);
  assert.equal(simulatedProviderCalls, 1);
  assert.equal(JSON.parse(chatCalls()[1].body).expectedUserId, USER_A);
  assert.equal(h.window.soloAccountState.userId, USER_B);
  assert.equal(h.chat.input.value, '');
  assert.doesNotMatch(JSON.stringify(h.chat.transcript.children), /SYNTHETIC_ACCOUNT_A_CONTEXT|Draft from the stale tab/);
  await h.chat.send('Fresh account B question');
  const fresh = JSON.parse(chatCalls()[2].body);
  assert.equal(fresh.expectedUserId, USER_B);
  assert.deepEqual(fresh.messages, [{role: 'user', content: 'Fresh account B question'}]);
  assert.equal(simulatedProviderCalls, 2);
  assert.ok(h.calls.every(call => ['/api/solo-auth', '/api/solo-chat'].includes(call.url)));
});

test('account fields have explicit labels, appropriate autocomplete and no signup controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '../solo-ai.html'), 'utf8');
  assert.match(html, /label for="solo-account-email"/);
  assert.match(html, /id="solo-account-email" type="email" autocomplete="username"/);
  assert.match(html, /label for="solo-account-password"/);
  assert.match(html, /id="solo-account-password" type="password" autocomplete="current-password"/);
  assert.match(html, /id="solo-account-status" role="status" aria-live="polite"/);
  assert.ok(html.indexOf('/solo-account.js') < html.indexOf('/solo-conversation.js'));
});
