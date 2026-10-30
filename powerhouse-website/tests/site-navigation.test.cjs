const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function setup() {
  const handlers = {};
  const listen = name => (type, fn) => { handlers[name + ':' + type] = fn; };
  let expanded = 'false';
  const toggle = { hidden: true, getAttribute: () => expanded, setAttribute: (_, value) => { expanded = value; }, focus: () => { document.activeElement = toggle; }, addEventListener: listen('toggle') };
  const anchor = { closest: () => anchor };
  const links = { contains: el => el === anchor, addEventListener: listen('links') };
  const nav = { querySelector: s => s === '.nav-toggle' ? toggle : links, contains: el => [nav, toggle, links, anchor].includes(el), classList: { add: name => { nav.enhanced = name; } }, addEventListener: listen('nav') };
  const media = { matches: true, addEventListener: listen('media') };
  const document = { querySelector: () => nav, addEventListener: listen('document'), activeElement: null };
  const window = { matchMedia: () => media, addEventListener: listen('window') };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'site-navigation.js'), 'utf8'), { document, window });
  return { handlers, toggle, links, nav, anchor, media, document };
}
test('menu exposes state, toggles repeatedly and Escape restores focus', () => {
  const x = setup();
  assert.equal(x.toggle.hidden, false);
  assert.equal(x.nav.enhanced, 'nav-enhanced');
  for (const state of ['true', 'false', 'true']) { x.handlers['toggle:click'](); assert.equal(x.toggle.getAttribute(), state); }
  x.handlers['nav:keydown']({ key: 'Escape' });
  assert.equal(x.toggle.getAttribute(), 'false');
  assert.equal(x.document.activeElement, x.toggle);
});
test('link selection, outside click, focus leaving, history and resize close menu', () => {
  const x = setup();
  for (const [name, event] of [['links:click', { target: x.anchor }], ['document:click', { target: {} }], ['nav:focusout', { relatedTarget: null }], ['window:pageshow'], ['window:hashchange'], ['media:change']]) {
    x.handlers['toggle:click']();
    x.handlers[name](event);
    assert.equal(x.toggle.getAttribute(), 'false', name);
  }
  x.document.activeElement = x.anchor;
  x.handlers['media:change']();
  assert.equal(x.document.activeElement, x.toggle);
});
test('public pages share navigation and business email; launch restrictions remain', () => {
  for (const file of ['index.html', 'digital-products.html', 'contact.html', 'solo-ai.html', 'terms.html', 'privacy.html', 'refunds.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /aria-label="Primary navigation"/);
    assert.match(html, /aria-controls="primary-links" hidden/);
    assert.match(html, /id="primary-links"/);
    assert.match(html, /src="\/site-navigation.js" defer/);
    assert.match(html, /joshuawright@thesoloserviceprovider.com.au/);
    assert.doesNotMatch(html, /superadmin2712@gmail.com/);
    assert.doesNotMatch(html, /https:\/\/(?:buy|checkout)\.stripe\.com/);
    if (['index.html', 'digital-products.html'].includes(file)) assert.equal((html.match(/class="pending"/g) || []).length, 10);
  }
  assert.match(fs.readFileSync(path.join(root, 'contact.html'), 'utf8'), /href="tel:\+61452272820">0452 272 820/);
  assert.match(fs.readFileSync(path.join(root, 'solo-ai.html'), 'utf8'), /(Public chat is not open yet|Private testing — public access not enabled)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.links a:not\(:last-child\)\{display:none\}/);
});


test('floating SOLO guide uses the canonical crisp SOLO AI vector mark, not the business app icon', () => {
  const source = fs.readFileSync(path.join(root, 'solo-chat.js'), 'utf8');
  assert.match(source, /\/assets\/approved-stage\/solo-ai-mark-v4\.svg/);
  assert.doesNotMatch(source, /\/assets\/approved-stage\/business-app-icon-512\.png/);
});
