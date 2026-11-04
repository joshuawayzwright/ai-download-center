// Run against the staged Pages artifact with the desktop Chrome binary from the CI image.
const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright-core');

const site = path.resolve(__dirname, '../_site');
const oldScript = '/app.js?v=20261001-classify1';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

test('directory upgrade, slow input, external requests and responsive layout', async (t) => {
  let warmed = 0;
  let releaseCatalog;
  const gate = new Promise((resolve) => { releaseCatalog = resolve; });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    // Fail on attempted external resources without sending test data off the runner.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    if (url.pathname === '/warm') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><script src="' + oldScript + '"></script>');
    }
    if (req.url === oldScript) {
      warmed++;
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.end('window.usingPreviousScript = true;');
    }
    if (url.pathname === '/data/tools.json') await gate;
    try {
      const file = path.resolve(site, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(site + path.sep)) throw new Error('Outside staged site');
      const body = await readFile(file);
      res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { releaseCatalog(); server.closeAllConnections(); server.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => { if (new URL(req.url()).origin !== origin) external.push(req.url()); });
  await page.addInitScript(() => {
    window.blocked = [];
    document.addEventListener('securitypolicyviolation', (event) => window.blocked.push(event.blockedURI));
  });

  await page.goto(origin + '/warm');
  assert.equal(await page.evaluate(() => window.usingPreviousScript), true);
  await page.goto(origin + '/?filter=audio&q=legacy#catalog', { waitUntil: 'domcontentloaded' });
  const search = page.getByRole('searchbox', { name: 'Search catalog' });
  await page.waitForFunction(() => document.querySelector('#toolGrid').getAttribute('aria-busy') === 'true');
  assert.equal(await search.inputValue(), '');
  await search.pressSequentially('whisper');
  releaseCatalog();
  await page.waitForFunction(() => !document.querySelector('#toolGrid').hasAttribute('aria-busy'));
  assert.equal(await search.inputValue(), 'whisper');
  assert.match(await page.locator('#resultsText').innerText(), /Showing [1-9]\d* entr/);
  assert.equal(page.url(), origin + '/?filter=audio#catalog');
  assert.equal(await page.evaluate(() => Boolean(window.usingPreviousScript)), false);
  assert.equal(warmed, 1);
  const appTiming = await page.evaluate(() => performance.getEntriesByType('resource')
    .find((entry) => new URL(entry.name).pathname === '/app.js')?.name);
  assert.ok(appTiming && appTiming !== origin + oldScript);
  await search.fill('qa45-private-marker');
  await search.press('Enter');
  await page.waitForTimeout(650); // Longer than the former automatic-search debounce.
  assert.equal(await page.locator('#resultsText').innerText(), 'Showing 0 entries');
  assert.equal(page.url(), origin + '/?filter=audio#catalog');
  assert.equal(await page.evaluate(() => [localStorage, sessionStorage].some((storage) =>
    Object.values(storage).some((value) => value.includes('qa45-private-marker')))), false);
  await search.press('Tab');
  assert.equal(await page.locator('#searchLiveModels').evaluate((button) => button.matches(':focus-visible')), true);
  assert.deepEqual(await page.evaluate(() => window.blocked), []);

  await search.fill('');
  await page.locator('[data-collection="image video"]').click();
  assert.equal(new URL(page.url()).searchParams.get('filter'), 'image video');
  const count = await page.locator('[data-count-for="image video"]').innerText();
  assert.equal(await page.locator('#resultsText').innerText(), 'Showing ' + parseInt(count, 10) + ' entries');
  await page.goBack();
  assert.equal(new URL(page.url()).searchParams.get('filter'), 'audio');
  await page.goForward();
  assert.equal(new URL(page.url()).searchParams.get('filter'), 'image video');

  for (const name of await readdir(site)) {
    if (!name.endsWith('.html')) continue;
    await page.goto(origin + '/' + name);
    assert.deepEqual(await page.evaluate(() => window.blocked), [], name);
  }
  for (const width of [1280, 412, 360, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const [name, selector] of [['index.html', '.hero-art img'], ['creator-studio.html', '.studio-visual img']]) {
      await page.goto(origin + '/' + name);
      const metrics = await page.locator(selector).evaluate((img) => ({
        fit: getComputedStyle(img).objectFit,
        loaded: img.complete && img.naturalWidth > 0,
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth
      }));
      assert.equal(metrics.fit, 'contain', name);
      assert.ok(metrics.loaded, name);
      assert.ok(metrics.page <= metrics.viewport, name + ' overflows at ' + width + 'px');
    }
  }
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
