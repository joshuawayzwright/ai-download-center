const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../solo-account.js'), 'utf8');
const signedOut = {enabled: true, authenticated: false, chatEnabled: false};
const signedIn = {
  enabled: true, authenticated: true, chatEnabled: true,
  user: {email: 'tester@example.com'}, usage: {remaining_daily: 7, daily_limit: 10}
};
const response = (data, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => data});

function harness(responder = async () => response(signedOut)) {
  class Element {
    constructor() {
      this.value = '';
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
      this.style = {};
      this.attributes = {};
      this.listeners = {};
    }
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
  const calls = [];
  const events = [];
  const windowListeners = {};
  const timers = new Map();
  let timerId = 0;
  const window = {
    addEventListener(name, listener) { (windowListeners[name] ||= []).push(listener); },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of windowListeners[event.type] || []) listener(event);
    }
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const document = {querySelector: selector => elements[selector]};
  Object.defineProperty(document, 'cookie', {
    get() { throw new Error('Session cookies must stay inaccessible to JavaScript'); },
    set() { throw new Error('Session cookies must be set by the server'); }
  });
  const context = {
    document, window, CustomEvent, AbortController,
    setTimeout: (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => { calls.push({url, ...options}); return responder(options, calls.length); }
  };
  for (const target of [context, window]) for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(target, name, {get() { throw new Error('Credentials must not use browser storage'); }});
  }
  vm.runInNewContext(source, context);
  return {
    panel, form, email, password, submit, status, usage, refresh, logout, calls, events, timers, window,
    async ready() {
      for (let i = 0; i < 40 && panel.attributes['aria-busy'] === 'true'; i++) await Promise.resolve();
      assert.equal(panel.attributes['aria-busy'], 'false');
    },
    login(address = 'tester@example.com', secret = 'test-password-not-a-real-secret') {
      email.value = address;
      password.value = secret;
      return form.listeners.submit({preventDefault() {}});
    },
    check: () => refresh.listeners.click(),
    signOut: () => logout.listeners.click(),
    dispatch(type, detail) { window.dispatchEvent(new CustomEvent(type, {detail})); }
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
    ...signedIn, user: {id: number === 1 ? 'user-one' : 'user-two', email: 'same@example.com'}
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
  const h = harness(async () => response({...signedIn, user: {email: address}, usage: {remaining_daily: -3, daily_limit: 10}}));
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

test('account fields have explicit labels, appropriate autocomplete and no signup controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '../solo-ai.html'), 'utf8');
  assert.match(html, /label for="solo-account-email"/);
  assert.match(html, /id="solo-account-email" type="email" autocomplete="username"/);
  assert.match(html, /label for="solo-account-password"/);
  assert.match(html, /id="solo-account-password" type="password" autocomplete="current-password"/);
  assert.match(html, /id="solo-account-status" role="status" aria-live="polite"/);
  assert.ok(html.indexOf('/solo-account.js') < html.indexOf('/solo-conversation.js'));
});
