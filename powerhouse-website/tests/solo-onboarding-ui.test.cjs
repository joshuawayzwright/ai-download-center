const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../solo-onboarding.js'), 'utf8');
const enabled = {enabled: true, signupEnabled: true, recoveryEnabled: true};
const disabled = {enabled: false, signupEnabled: false, recoveryEnabled: false};
const actions = {signup: 'signup', verify_email: 'verify-email', request_reset: 'request-reset', reset_password: 'reset-password'};
const password = 'example-password-only';
const response = (data, status = 200, retryAfter = null) => ({
  ok: status >= 200 && status < 300, status, json: async () => data,
  headers: {get: name => name.toLowerCase() === 'retry-after' ? retryAfter : null}
});
const tick = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

function harness(responder = async () => response(enabled), options = {}) {
  class Element {
    constructor() {
      this.value = ''; this.checked = false; this.textContent = ''; this.hidden = true;
      this.disabled = false; this.attributes = {}; this.listeners = {}; this.children = [];
      this.style = {}; this.focusCount = 0;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { this.focusCount++; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    get scrollHeight() { return this.children.length; }
    set innerHTML(_value) { throw new Error('Untrusted onboarding content must remain plain text'); }
  }
  const elements = {};
  const element = id => elements[`#${id}`] ||= new Element();
  const panel = element('solo-onboarding');
  panel.setAttribute('data-code-min-length', String(options.codeMin ?? 6));
  panel.setAttribute('data-code-max-length', String(options.codeMax ?? 10));
  const status = element('solo-onboarding-status');
  const back = element('solo-onboarding-back');
  const forms = {};
  for (const [action, slug] of Object.entries(actions)) {
    const item = forms[action] = {
      form: element(`solo-onboarding-${slug}`), opener: element(`solo-onboarding-open-${slug}`),
      email: new Element(), password: ['signup', 'reset_password'].includes(action) ? new Element() : null,
      code: ['verify_email', 'reset_password'].includes(action) ? new Element() : null,
      terms: action === 'signup' ? new Element() : null, submit: new Element()
    };
    item.form.querySelector = selector => ({
      'input[type="email"]': item.email, 'input[type="password"]': item.password,
      'input[data-onboarding-code]': item.code, 'input[type="checkbox"]': item.terms,
      'button[type="submit"]': item.submit
    })[selector] || null;
  }
  const signIn = element('solo-account-form');
  const signInEmail = element('solo-account-email');
  const refresh = element('solo-account-refresh');
  let account;
  let chat;
  if (options.controllers) {
    account = {
      panel: element('solo-account'), form: signIn, email: signInEmail, password: new Element(), submit: new Element(),
      status: element('solo-account-status'), usage: element('solo-account-usage'), refresh, logout: element('solo-account-logout')
    };
    account.form.querySelector = selector => ({
      'input[type="email"]': account.email, 'input[type="password"]': account.password,
      'button[type="submit"]': account.submit
    })[selector];
    chat = {
      form: element('solo-chat-form'), input: new Element(), submit: new Element(),
      transcript: element('solo-chat-transcript'), status: element('solo-chat-status')
    };
    chat.form.querySelector = selector => selector === 'textarea' ? chat.input : chat.submit;
    chat.send = value => { chat.input.value = value; return chat.form.listeners.submit({preventDefault() {}}); };
    chat.text = () => chat.transcript.children.flatMap(node => node.children.map(child => child.textContent)).join(' ');
  }
  const calls = [];
  const events = [];
  const broadcasts = [];
  const windowListeners = {};
  const timers = new Map();
  let timerId = 0;
  let now = 100000;
  const channels = [];
  class BroadcastChannel {
    constructor(name) { this.name = name; this.listeners = []; channels.push(this); }
    addEventListener(name, listener) { if (name === 'message') this.listeners.push(listener); }
    postMessage(data) {
      broadcasts.push({name: this.name, data});
      for (const other of channels) if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.listeners.forEach(listener => listener({data})));
      }
    }
  }
  const window = {
    BroadcastChannel: options.noChannel ? undefined : BroadcastChannel,
    ...(options.initialAccount ? {soloAccountState: options.initialAccount} : {}),
    addEventListener(name, listener) { (windowListeners[name] ||= []).push(listener); },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of windowListeners[event.type] || []) listener(event);
    }
  };
  const document = {
    querySelector: selector => options.missingPanel && selector === '#solo-onboarding' ? null : elements[selector] || null,
    createElement: () => new Element(), visibilityState: 'visible', addEventListener() {}
  };
  Object.defineProperty(document, 'cookie', {
    get() { throw new Error('JavaScript must not read cookies'); },
    set() { throw new Error('JavaScript must not set cookies'); }
  });
  class CustomEvent { constructor(type, detail = {}) { this.type = type; this.detail = detail.detail; } }
  const context = {
    window, document, CustomEvent, AbortController, TextEncoder,
    crypto: {randomUUID: require('node:crypto').randomUUID},
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, request) => { calls.push({url, ...request}); return responder(request, calls.length, url); }
  };
  for (const target of [context, window]) for (const property of ['localStorage', 'sessionStorage', 'location']) {
    Object.defineProperty(target, property, {get() { throw new Error('No browser storage or URL credentials'); }});
  }
  if (options.controllers) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../solo-account.js'), 'utf8'), context);
  vm.runInNewContext(source, context);
  if (options.controllers) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../solo-conversation.js'), 'utf8'), context);
  return {
    panel, status, forms, back, signIn, signInEmail, refresh, calls, events, broadcasts, timers, account, chat, window,
    async ready() { await tick(); assert.equal(panel.attributes['aria-busy'], 'false'); },
    open(action) { forms[action].opener.listeners.click(); },
    submit(action, values = {}) {
      const item = forms[action];
      for (const [name, value] of Object.entries(values)) {
        if (name === 'acceptedTerms') item.terms.checked = value;
        else item[name].value = value;
      }
      return item.form.listeners.submit({preventDefault() {}});
    },
    emit(type, fields = {}) { window.dispatchEvent({type, ...fields}); },
    advance(milliseconds) { now += milliseconds; },
    fireTimer(delay) {
      const entry = [...timers].find(([, value]) => value.delay === delay);
      assert.ok(entry, `Expected ${delay} ms timer`);
      timers.delete(entry[0]); now += delay; entry[1].callback();
    },
    noSecrets() {
      for (const item of Object.values(forms)) {
        if (item.password) assert.equal(item.password.value, '');
        if (item.code) assert.equal(item.code.value, '');
        if (item.terms) assert.equal(item.terms.checked, false);
      }
    }
  };
}

test('onboarding has no form flash while capability discovery is pending', async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  assert.equal(h.panel.hidden, true);
  for (const item of Object.values(h.forms)) assert.equal(item.form.hidden, true);
  release(response(enabled));
  await h.ready();
  assert.equal(h.panel.hidden, false);
  for (const item of Object.values(h.forms)) {
    assert.equal(item.form.hidden, true);
    assert.equal(item.opener.hidden, false);
  }
  assert.deepEqual([h.calls[0].method, h.calls[0].credentials, h.calls[0].cache, h.calls[0].redirect],
    ['GET', 'same-origin', 'no-store', 'error']);
  assert.equal(h.calls.length, 1);
});

test('disabled, malformed, failed or incomplete capability responses cannot expose or submit a feature', async () => {
  for (const result of [response(disabled), response({...enabled, enabled: false}), response({...enabled, signupEnabled: 'true'}),
    response({...enabled, recoveryEnabled: null}), response({enabled: true}), response(enabled, 503), response([])]) {
    const h = harness(async () => result);
    await h.ready();
    assert.equal(h.panel.hidden, true);
    h.open('signup');
    await h.submit('signup', {email: 'person@example.com', password, acceptedTerms: true});
    assert.equal(h.calls.length, 1);
    for (const item of Object.values(h.forms)) assert.equal(item.opener.hidden, true);
  }
  const h = harness(async () => { throw new Error('Connection unavailable'); });
  await h.ready();
  assert.equal(h.panel.hidden, true);
});

test('signup/verification and recovery/reset each require their own explicit capability flag', async () => {
  for (const signupEnabled of [true, false]) {
    const h = harness(async () => response({...enabled, signupEnabled, recoveryEnabled: !signupEnabled}));
    await h.ready();
    assert.equal(h.forms.signup.opener.hidden, !signupEnabled);
    assert.equal(h.forms.verify_email.opener.hidden, !signupEnabled);
    assert.equal(h.forms.request_reset.opener.hidden, signupEnabled);
    assert.equal(h.forms.reset_password.opener.hidden, signupEnabled);
    const blocked = signupEnabled ? 'request_reset' : 'signup';
    h.open(blocked);
    await h.submit(blocked, {email: 'person@example.com', ...(blocked === 'signup' ? {password, acceptedTerms: true} : {})});
    assert.equal(h.calls.length, 1);
  }
});

test('an already authenticated account keeps onboarding hidden and cannot submit its forms', async () => {
  const h = harness(undefined, {initialAccount: {
    enabled: true, authenticated: true, userId: '00000000-0000-4000-8000-000000000001', sessionVersion: 1
  }});
  await h.ready();
  assert.equal(h.panel.hidden, true);
  h.open('request_reset'); await h.submit('request_reset', {email: 'person@example.com'});
  assert.equal(h.calls.length, 1);
  for (const item of Object.values(h.forms)) assert.equal(item.opener.hidden, true);
});

test('an account change aborts pending signup, removes previous email and discards its late success', async () => {
  let finish;
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : new Promise(resolve => { finish = resolve; }));
  await h.ready(); h.open('signup');
  const pending = h.submit('signup', {email: 'previous@example.com', password, acceptedTerms: true});
  h.emit('solo:account', {detail: {
    enabled: true, authenticated: true, userId: '00000000-0000-4000-8000-000000000002', sessionVersion: 1
  }});
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.panel.hidden, true);
  for (const item of Object.values(h.forms)) assert.equal(item.email.value, '');
  finish(response({ok: true, code: 'check_email'}, 202)); await pending;
  assert.equal(h.status.textContent, '');
  h.emit('solo:account', {detail: {enabled: true, authenticated: false, userId: null, sessionVersion: 2}});
  assert.equal(h.panel.hidden, false);
  for (const item of Object.values(h.forms)) assert.equal(item.form.hidden, true);
  assert.equal(h.calls.length, 2);
  h.noSecrets();
});

test('cross-tab invalidation discards a pending recovery outcome without restoring the old email or form', async () => {
  let finish;
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : new Promise(resolve => { finish = resolve; }));
  await h.ready(); h.open('request_reset');
  const pending = h.submit('request_reset', {email: 'previous@example.com'});
  h.emit('solo:account-stale');
  assert.equal(h.calls[1].signal.aborted, true);
  finish(response({ok: true, code: 'check_email'}, 202)); await pending;
  assert.equal(h.status.textContent, '');
  for (const item of Object.values(h.forms)) {
    assert.equal(item.email.value, ''); assert.equal(item.form.hidden, true);
  }
  assert.equal(h.calls.length, 2);
});

test('a same-session account check does not erase a form while the user is completing it', async () => {
  const account = {enabled: true, authenticated: false, userId: null, sessionVersion: 4};
  const h = harness(undefined, {initialAccount: account});
  await h.ready(); h.open('signup');
  h.forms.signup.email.value = 'person@example.com'; h.forms.signup.password.value = password;
  h.emit('solo:account', {detail: {...account, usage: null}});
  assert.equal(h.forms.signup.email.value, 'person@example.com');
  assert.equal(h.forms.signup.password.value, password);
  assert.equal(h.forms.signup.form.hidden, false);
});

test('signup clears secrets before a pending request and advances only on the exact generic acknowledgement', async () => {
  let finish;
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : new Promise(resolve => { finish = resolve; }));
  await h.ready();
  h.open('signup');
  const pending = h.submit('signup', {email: ' person@example.com ', password, acceptedTerms: true});
  h.noSecrets();
  assert.equal(h.panel.attributes['aria-busy'], 'true');
  assert.equal(h.forms.signup.submit.disabled, true);
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'signup', email: 'person@example.com', password, acceptedTerms: true});
  assert.deepEqual(Object.keys(h.calls[1].headers), ['Content-Type']);
  assert.equal(h.calls[1].headers['Content-Type'], 'application/json');
  finish(response({ok: true, code: 'check_email'}, 202));
  await pending;
  assert.equal(h.forms.signup.form.hidden, true);
  assert.equal(h.forms.verify_email.form.hidden, false);
  assert.equal(h.forms.verify_email.email.value, 'person@example.com');
  assert.match(h.status.textContent, /If this address can be registered/);
  assert.match(h.status.textContent, /does not grant SOLO chat access/);
  assert.equal(h.events.length, 0);
  assert.equal(h.broadcasts.length, 0);
  assert.equal(h.calls.length, 2);
  h.noSecrets();
});

test('client validation clears secrets, retains only email and makes no request for invalid input or missing consent', async () => {
  const cases = [
    {email: 'not-an-email', password, acceptedTerms: true, field: 'email'},
    {email: 'person@example.com', password: 'short', acceptedTerms: true, field: 'password'},
    {email: 'person@example.com', password: 'x'.repeat(129), acceptedTerms: true, field: 'password'},
    {email: 'person@example.com', password: ' '.repeat(12), acceptedTerms: true, field: 'password'},
    {email: 'person@example.com', password: 'long\u0000password', acceptedTerms: true, field: 'password'},
    {email: 'person@example.com', password, acceptedTerms: false, field: 'terms'}
  ];
  for (const {field, ...values} of cases) {
    const h = harness();
    await h.ready(); h.open('signup'); await h.submit('signup', values);
    assert.equal(h.calls.length, 1);
    assert.equal(h.forms.signup[field].attributes['aria-invalid'], 'true');
    assert.ok(h.forms.signup[field].focusCount > 0);
    assert.equal(h.forms.signup.email.value, values.email);
    h.noSecrets();
  }
});

test('password limits count Unicode code points instead of UTF-16 units', async () => {
  for (const length of [6, 12, 128, 129]) {
    const h = harness(async (_request, number) => response(number === 1 ? enabled : {ok: true, code: 'check_email'}, number === 1 ? 200 : 202));
    await h.ready(); h.open('signup');
    await h.submit('signup', {email: 'person@example.com', password: '🔒'.repeat(length), acceptedTerms: true});
    assert.equal(h.calls.length, length >= 12 && length <= 128 ? 2 : 1);
    h.noSecrets();
  }
});

test('email verification preserves leading zeroes, binds its purpose and never authenticates or grants chat', async () => {
  const h = harness(async (_request, number) => response(number === 1 ? enabled : {ok: true, code: 'email_verified', access_token: 'must-not-surface'}));
  await h.ready(); h.open('verify_email');
  await h.submit('verify_email', {email: 'person@example.com', code: '001234'});
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'verify_email', email: 'person@example.com', code: '001234'});
  assert.match(h.status.textContent, /Email verified/);
  assert.match(h.status.textContent, /remain restricted/);
  assert.doesNotMatch(h.status.textContent, /must-not-surface|Signed in|Chat is available/);
  assert.equal(h.events.length, 0);
  assert.equal(h.broadcasts.length, 0);
  assert.equal(h.window.soloAccountState, undefined);
  assert.ok(h.status.focusCount > 0);
  h.noSecrets();
});

test('code validation accepts 6–10 ASCII digits and rejects wrong-length, spaced and non-digit values', async () => {
  for (const [code, accepted] of [['12345', false], ['123456', true], ['0123456789', true], ['12345678901', false], ['12 3456', false], ['１２３４５６', false], ['123x56', false]]) {
    const h = harness(async (_request, number) => response(number === 1 ? enabled : {ok: true, code: 'email_verified'}));
    await h.ready(); h.open('verify_email'); await h.submit('verify_email', {email: 'person@example.com', code});
    assert.equal(h.calls.length, accepted ? 2 : 1, code);
    h.noSecrets();
  }
});

test('a bounded configured code length is reflected in native validation and unsafe configuration falls back', async () => {
  const h = harness(undefined, {codeMin: 8, codeMax: 8});
  await h.ready(); h.open('verify_email');
  assert.equal(h.forms.verify_email.code.minLength, 8);
  assert.equal(h.forms.verify_email.code.maxLength, 8);
  assert.equal(h.forms.verify_email.code.attributes.pattern, '[0-9]{8,8}');
  await h.submit('verify_email', {email: 'person@example.com', code: '123456'});
  assert.equal(h.calls.length, 1);
  assert.match(h.status.textContent, /8 digit verification code/);
  const fallback = harness(undefined, {codeMin: 0, codeMax: 100});
  await fallback.ready();
  assert.equal(fallback.forms.reset_password.code.attributes.pattern, '[0-9]{6,10}');
});

test('requesting recovery gives a non-enumerating acknowledgement and does not invalidate current sessions', async () => {
  const h = harness(async (_request, number) => response(number === 1 ? enabled : {ok: true, code: 'check_email'}, number === 1 ? 200 : 202));
  await h.ready(); h.open('request_reset');
  await h.submit('request_reset', {email: 'person@example.com'});
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'request_reset', email: 'person@example.com'});
  assert.equal(h.forms.reset_password.form.hidden, false);
  assert.equal(h.forms.reset_password.email.value, 'person@example.com');
  assert.match(h.status.textContent, /If this address has an eligible account/);
  assert.equal(h.events.length, 0);
  assert.equal(h.broadcasts.length, 0);
  assert.equal(h.calls.length, 2);
});

test('confirmed password reset sends one explicit request, invalidates the account and broadcasts no sensitive data', async () => {
  const h = harness(async (_request, number) => response(number === 1 ? enabled : {ok: true, code: 'password_reset', sessionInvalidated: true}));
  await h.ready(); h.open('reset_password');
  await h.submit('reset_password', {email: 'person@example.com', code: '004321', password});
  assert.deepEqual(JSON.parse(h.calls[1].body), {action: 'reset_password', email: 'person@example.com', password, code: '004321'});
  assert.equal(h.forms.reset_password.form.hidden, true);
  assert.match(h.status.textContent, /Password updated and existing sessions signed out/);
  assert.match(h.status.textContent, /does not change your SOLO access/);
  assert.deepEqual(h.broadcasts, []); // The account controller owns the actual broadcast.
  assert.equal(h.events.filter(event => event.type === 'solo:account-stale').length, 1);
  assert.equal(h.events[0].detail.notifyPeers, true);
  assert.deepEqual(Object.keys(h.events[0].detail), ['notifyPeers']);
  assert.equal(h.calls.length, 2);
  h.noSecrets();
});

test('consumed-code and uncertain sign-out errors invalidate stale context and do not offer same-code retry', async () => {
  for (const code of ['reset_incomplete', 'reset_signout_unconfirmed']) {
    const h = harness(async (_request, number) => number === 1 ? response(enabled) : response({
      ok: false, code, sessionInvalidated: true, ...(code === 'reset_signout_unconfirmed' ? {passwordChanged: true} : {}),
      error: '<img src=x onerror=alert(1)>'
    }, 503));
    await h.ready(); h.open('reset_password');
    await h.submit('reset_password', {email: 'person@example.com', code: '123456', password});
    assert.equal(h.forms.reset_password.form.hidden, false);
    assert.equal(h.forms.reset_password.email.value, 'person@example.com');
    assert.equal(h.events.filter(event => event.type === 'solo:account-stale').length, 1);
    assert.equal(h.events[0].detail.notifyPeers, true);
    assert.deepEqual(h.broadcasts, []);
    assert.match(h.status.textContent, code === 'reset_incomplete' ? /request a new code/ : /Contact support before continuing/);
    assert.doesNotMatch(h.status.textContent, /<img|sessions signed out/);
    assert.equal(h.calls.length, 2);
    h.noSecrets();
  }
});

test('a lost reset response remains uncertain, clears old context and never automatically resends or logs in', async () => {
  const h = harness(async (_request, number) => {
    if (number === 1) return response(enabled);
    throw new Error('Lost response after server mutation');
  }, {noChannel: true});
  await h.ready(); h.open('reset_password');
  await h.submit('reset_password', {email: 'person@example.com', code: '123456', password});
  assert.match(h.status.textContent, /may have been used/);
  assert.match(h.status.textContent, /new reset code/);
  assert.doesNotMatch(h.status.textContent, /Password updated|Lost response/);
  assert.equal(h.events.filter(event => event.type === 'solo:account-stale').length, 1);
  assert.equal(h.calls.length, 2);
  h.noSecrets();
});

test('stalled reset response bodies time out, release controls and keep an uncertain outcome', async () => {
  const h = harness(async (request, number) => number === 1 ? response(enabled) : {
    ...response({}), json: () => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('Aborted'))))
  });
  await h.ready(); h.open('reset_password');
  const pending = h.submit('reset_password', {email: 'person@example.com', code: '123456', password});
  await tick(); h.noSecrets(); h.fireTimer(45000); await pending;
  assert.equal(h.forms.reset_password.submit.disabled, false);
  assert.equal(h.panel.attributes['aria-busy'], 'false');
  assert.match(h.status.textContent, /could not be confirmed/);
  assert.equal(h.calls.length, 2);
  assert.equal(h.timers.size, 0);
});

test('only the exact HTTP status and success code can confirm an operation', async () => {
  for (const result of [response({ok: true, code: 'email_verified'}, 202), response({ok: true, code: 'password_reset'}),
    response({ok: 'true', code: 'email_verified'}), response(null), response({error: 'Email verified <script>bad</script>'}, 500)]) {
    const h = harness(async (_request, number) => number === 1 ? response(enabled) : result);
    await h.ready(); h.open('verify_email'); await h.submit('verify_email', {email: 'person@example.com', code: '123456'});
    assert.match(h.status.textContent, /could not be confirmed/);
    assert.doesNotMatch(h.status.textContent, /Email verified|<script>/);
    assert.equal(h.forms.verify_email.form.hidden, false);
    assert.equal(h.events.length, 0);
    assert.equal(h.calls.length, 2);
    h.noSecrets();
  }
});

test('safe validation errors do not render upstream text and still require re-entering secrets', async () => {
  for (const [code, status, expected] of [['invalid_code', 401, /invalid or has expired/], ['weak_password', 400, /12–128/],
    ['invalid_request', 400, /required fields/]]) {
    const h = harness(async (_request, number) => number === 1 ? response(enabled) : response({ok: false, code, error: 'PRIVATE_PROVIDER_DETAIL'}, status));
    await h.ready(); h.open('reset_password');
    await h.submit('reset_password', {email: 'person@example.com', code: '123456', password});
    assert.match(h.status.textContent, expected);
    assert.doesNotMatch(h.status.textContent, /PRIVATE_PROVIDER_DETAIL/);
    assert.equal(h.events.length, 0);
    h.noSecrets();
  }
});

test('actual Retry-After remains visible across forms and expires without retries or erasing a later outcome', async () => {
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : number === 2
    ? response({ok: false, code: 'rate_limited'}, 429, '12') : response({ok: true, code: 'check_email'}, 202));
  await h.ready(); h.open('request_reset'); await h.submit('request_reset', {email: 'person@example.com'});
  assert.match(h.status.textContent, /wait 12 seconds/);
  assert.equal(h.forms.request_reset.submit.disabled, true);
  await h.submit('request_reset', {email: 'person@example.com'});
  assert.equal(h.calls.length, 2);
  h.advance(4000);
  h.open('reset_password');
  assert.equal(h.forms.reset_password.form.hidden, false);
  assert.equal(h.forms.reset_password.submit.disabled, true);
  assert.match(h.status.textContent, /wait 8 seconds/);
  await h.submit('reset_password');
  assert.equal(h.calls.length, 2);
  h.advance(7000);
  h.open('verify_email');
  assert.equal(h.forms.verify_email.submit.disabled, true);
  assert.match(h.status.textContent, /wait 1 second before/);
  h.fireTimer(12000);
  assert.equal(h.forms.verify_email.submit.disabled, false);
  assert.equal(h.status.textContent, '');
  assert.equal(h.status.attributes['data-error'], 'false');
  assert.equal(h.calls.length, 2);
  h.open('request_reset');
  await h.submit('request_reset', {email: 'person@example.com'});
  assert.equal(h.calls.length, 3);

  // Background tabs can deliver a timer late. A new manual request after the
  // deadline may finish first; its success or error must remain readable.
  for (const outcome of [response({ok: true, code: 'email_verified'}), response({ok: false, code: 'invalid_code'}, 401)]) {
    const delayed = harness(async (_request, number) => number === 1 ? response(enabled) : number === 2
      ? response({ok: false, code: 'rate_limited'}, 429, '12') : outcome);
    await delayed.ready(); delayed.open('request_reset');
    await delayed.submit('request_reset', {email: 'person@example.com'});
    delayed.advance(12000);
    delayed.open('verify_email');
    await delayed.submit('verify_email', {email: 'person@example.com', code: '123456'});
    const message = delayed.status.textContent;
    assert.match(message, outcome.ok ? /Email verified/ : /invalid or has expired/);
    const errorState = delayed.status.attributes['data-error'];
    delayed.fireTimer(12000);
    assert.equal(delayed.status.textContent, message);
    assert.equal(delayed.status.attributes['data-error'], errorState);
    assert.equal(delayed.calls.length, 3);
  }
});

test('invalid or excessive Retry-After values cannot create a false countdown', async () => {
  for (const value of ['0', '-4', '99999', '12 seconds', 'malformed', null]) {
    const h = harness(async (_request, number) => number === 1 ? response(enabled) : response({ok: false, code: 'rate_limited'}, 429, value));
    await h.ready(); h.open('request_reset'); await h.submit('request_reset', {email: 'person@example.com'});
    assert.equal(h.status.textContent, 'Too many account requests. Please wait before trying again.');
    assert.equal(h.timers.size, 0);
  }
});

test('a feature disabled during submission closes controls and never reports success', async () => {
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : response({ok: false, code: 'onboarding_disabled'}, 503));
  await h.ready(); h.open('signup'); await h.submit('signup', {email: 'person@example.com', password, acceptedTerms: true});
  assert.match(h.status.textContent, /not available here right now/);
  for (const item of Object.values(h.forms)) {
    assert.equal(item.form.hidden, true); assert.equal(item.opener.hidden, true);
  }
  assert.equal(h.panel.hidden, false); // Keep the explanatory status readable.
  h.noSecrets();
});

test('changing purpose and returning to sign-in clears secrets and keeps accessible focus and labels in sync', async () => {
  const h = harness(); await h.ready(); h.open('signup');
  h.forms.signup.email.value = 'person@example.com'; h.forms.signup.password.value = password; h.forms.signup.terms.checked = true;
  h.open('reset_password');
  assert.equal(h.forms.reset_password.email.value, 'person@example.com');
  assert.equal(h.forms.signup.opener.attributes['aria-expanded'], 'false');
  assert.equal(h.forms.reset_password.opener.attributes['aria-expanded'], 'true');
  assert.ok(h.forms.reset_password.email.focusCount > 0);
  h.noSecrets();
  h.forms.reset_password.code.value = '123456'; h.forms.reset_password.password.value = password;
  h.signIn.hidden = false; h.back.listeners.click();
  assert.equal(h.forms.reset_password.form.hidden, true);
  assert.equal(h.signInEmail.focusCount, 1);
  h.noSecrets();
  h.open('signup'); h.signIn.hidden = true; h.back.listeners.click();
  assert.equal(h.refresh.focusCount, 1);
});

test('page restoration clears secret fields and external account invalidation also clears the email', async () => {
  const h = harness(); await h.ready();
  for (const event of [{type: 'pagehide'}, {type: 'pageshow', persisted: true}, {type: 'solo:account-stale'}]) {
    h.forms.signup.email.value = 'person@example.com'; h.forms.signup.password.value = password;
    h.forms.signup.terms.checked = true; h.forms.reset_password.code.value = '123456';
    h.emit(event.type, event); h.noSecrets();
    assert.equal(h.forms.signup.email.value, event.type === 'solo:account-stale' ? '' : 'person@example.com');
  }
  assert.equal(h.calls.length, 1);
});

test('a double submission and purpose change cannot start concurrent email or reset operations', async () => {
  let finish;
  const h = harness(async (_request, number) => number === 1 ? response(enabled) : new Promise(resolve => { finish = resolve; }));
  await h.ready(); h.open('request_reset');
  const pending = h.submit('request_reset', {email: 'person@example.com'});
  await h.submit('request_reset', {email: 'person@example.com'});
  h.open('signup');
  assert.equal(h.forms.signup.form.hidden, true);
  assert.equal(h.calls.length, 2);
  finish(response({ok: true, code: 'check_email'}, 202)); await pending;
});

test('actual controllers clear conversation after a recovery outcome even if another session check is pending', async () => {
  for (const code of ['password_reset', 'reset_incomplete', 'reset_signout_unconfirmed']) {
    let reset = false;
    const h = harness(async (request, _number, url) => {
      if (url === '/api/solo-auth') return response({enabled: true, authenticated: false, chatEnabled: false});
      if (url === '/api/solo-chat') return response({reply: 'previous private answer'});
      if (request.method === 'GET') return response(enabled);
      reset = true;
      return response({ok: code === 'password_reset', code, sessionInvalidated: true,
        ...(code === 'reset_signout_unconfirmed' ? {passwordChanged: true} : {})}, code === 'password_reset' ? 200 : 503);
    }, {controllers: true});
    await h.ready(); await tick();
    // A retained transcript/draft from before account revalidation must still
    // disappear when reset completes; no extra inference is needed to clear it.
    h.chat.transcript.children.push({children: [{textContent: 'previous private answer'}]});
    h.chat.input.value = 'unsent private draft';
    h.open('reset_password');
    await h.submit('reset_password', {email: 'person@example.com', code: '123456', password});
    await tick();
    assert.doesNotMatch(h.chat.text(), /previous private|unsent private/);
    assert.equal(h.chat.input.value, '');
    assert.equal(h.window.soloAccountState.authenticated, false);
    assert.equal(h.calls.filter(call => call.url === '/api/solo-chat').length, 0);
    assert.equal(h.calls.filter(call => call.url === '/api/solo-onboarding' && call.method === 'POST').length, 1);
    assert.deepEqual(h.broadcasts, [{name: 'solo-account-events-v1', data: 'account-changed'}]);
    assert.equal(h.calls.filter(call => call.url === '/api/solo-auth').length, 2, 'One initial check and one recovery check');
    assert.match(h.status.textContent, code === 'password_reset' ? /Password updated and existing sessions signed out/
      : code === 'reset_incomplete' ? /request a new code/ : /Contact support before continuing/);
  }
});

test('absence of the onboarding panel makes no network request', async () => {
  const h = harness(undefined, {missingPanel: true});
  await tick(); assert.equal(h.calls.length, 0);
});

test('the HTML keeps controls hidden by default, labelled and purpose-specific with the approved crisp SOLO artwork', () => {
  const html = fs.readFileSync(path.join(__dirname, '../solo-ai.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../solo-onboarding.css'), 'utf8');
  assert.match(html, /id="solo-onboarding"[^>]* hidden>/);
  for (const slug of Object.values(actions)) {
    assert.match(html, new RegExp(`<form id="solo-onboarding-${slug}"[^>]* hidden`));
    assert.match(html, new RegExp(`aria-controls="solo-onboarding-${slug}" aria-expanded="false" hidden`));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Every ID is unique');
  for (const match of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing labelled input ${match[1]}`);
  assert.equal((html.match(/autocomplete="one-time-code"/g) || []).length, 2);
  assert.equal((html.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.match(html, /id="solo-onboarding-status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"/);
  assert.match(html, /I have read and accept the <a href="\/terms.html">Terms<\/a>/);
  assert.match(html, /<a href="\/privacy.html">Privacy Policy<\/a>/);
  assert.match(html, /\/assets\/approved-stage\/solo-ai-mark-v4\.svg/);
  assert.match(html, /\/solo-onboarding.css/);
  assert.ok(html.indexOf('/solo-account.js') < html.indexOf('/solo-onboarding.js'));
  assert.ok(html.indexOf('/solo-onboarding.js') < html.indexOf('/solo-conversation.js'));
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(css, /min-height:44px/);
  assert.doesNotMatch(source, /innerHTML|localStorage|sessionStorage|document\.cookie|location\.|URLSearchParams/);
});
