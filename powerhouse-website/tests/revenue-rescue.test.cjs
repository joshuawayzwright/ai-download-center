const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(siteRoot, name), 'utf8');

function page() {
  return read('revenue-rescue.html');
}

test('Revenue Rescue page exposes the approved metadata and local brand asset', () => {
  const html = page();
  assert.match(html, /<html lang="en-AU">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/thesoloserviceprovider\.com\.au\/revenue-rescue\.html">/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /"@type": "Service"/);
  assert.match(html, /\/assets\/approved-stage\/business-app-icon-512\.png/);
  assert.doesNotMatch(html, /src="https:\/\/thesoloserviceprovider\.com\.au\/assets\//);
  assert.match(html, /aria-label="Primary navigation"/);
  assert.match(html, /aria-controls="primary-links" hidden/);
  assert.match(html, /id="primary-links"/);
  assert.match(html, /src="\/site-navigation\.js" defer/);
});

test('Revenue Rescue page contains the three approved packages and exact commercial boundaries', () => {
  const html = page();
  assert.match(html, /Conversion Leak Audit/);
  assert.match(html, /A\$395/);
  assert.match(html, /SOLO Revenue Rescue/);
  assert.match(html, /A\$1,250/);
  assert.match(html, /Implemented Rescue/);
  assert.match(html, /From A\$2,500/);
  assert.match(html, /No revenue or ranking guarantee/i);
  assert.match(html, /quoted after audit and access review/i);
  assert.equal((html.match(/class="price-card/g) || []).length, 3);
});

test('Revenue Rescue page uses the approved business identity and legal links', () => {
  const html = page();
  assert.match(html, /joshuawright@thesoloserviceprovider\.com\.au/g);
  assert.match(html, /0452 272 820/);
  assert.match(html, /63 638 672 067/);
  assert.match(html, /href="\/terms\.html"/);
  assert.match(html, /href="\/privacy\.html"/);
  assert.match(html, /href="\/refunds\.html"/);
});

test('Enquiry flow prepares a reviewable email and does not transmit or store form data', () => {
  const html = page();
  assert.match(html, /id="enquiry-form"/);
  assert.match(html, /id="package-select"/);
  assert.match(html, /mailto:joshuawright@thesoloserviceprovider\.com\.au/);
  assert.match(html, /encodeURIComponent\(subject\)/);
  assert.match(html, /encodeURIComponent\(body\)/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(html, /buy\.stripe\.com|checkout\.stripe\.com|stripe\.com\/v\d/i);
});

test('Existing site script adds one Services link, retargets Work With Me, and guards duplicates', () => {
  const script = read('site-navigation.js');
  assert.match(script, /\/revenue-rescue\.html/);
  assert.match(script, /SERVICES/);
  assert.match(script, /WORK WITH ME/);
  assert.match(script, /footer \.footerlinks/);
  assert.match(script, /querySelector\([^\n]*revenue-rescue\.html/);
});

test('Sitemap includes the Revenue Rescue route exactly once', () => {
  const sitemap = read('sitemap.xml');
  const route = 'https://thesoloserviceprovider.com.au/revenue-rescue.html';
  assert.equal(sitemap.split(route).length - 1, 1);
});
