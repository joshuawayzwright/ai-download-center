// Keeps guide pages honest: every tool card marked with data-tool must match its
// hand-picked catalog entry (name, price type and official link). Run after editing
// data/tools.json or any guide page:  node --test scripts/test-guide-catalog.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

const catalog = new Map(
  JSON.parse(read('data/tools.json'))
    .tools.filter((tool) => tool.source !== 'hugging-face')
    .map((tool) => [tool.name, tool]),
);

// Pages whose tool cards are bound to the catalog.
const PAGES = ['free-ai-tools.html'];

const decode = (value) =>
  value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function readCards(html) {
  return [...html.matchAll(/<article class="app" data-tool="([^"]+)" data-price="([^"]+)">([\s\S]*?)<\/article>/g)].map(
    ([, name, price, body]) => ({
      name: decode(name),
      price: decode(price),
      official: decode(body.match(/<a [^>]*data-official href="([^"]+)"/)?.[1] ?? ''),
    }),
  );
}

for (const page of PAGES) {
  test(`${page}: every tool card matches the catalog`, () => {
    const html = read(page);
    const cards = readCards(html);
    assert.ok(cards.length > 0, `${page} has no catalog-bound tool cards`);
    // A card that drops its binding would silently escape this test.
    const unbound = (html.match(/<article class="app"/g) || []).length - cards.length;
    assert.equal(unbound, 0, `${page} has ${unbound} tool card(s) without data-tool/data-price`);
    for (const card of cards) {
      const tool = catalog.get(card.name);
      assert.ok(tool, `${page}: "${card.name}" is not a hand-picked catalog tool`);
      assert.equal(card.price, tool.price, `${page}: "${card.name}" price type`);
      assert.ok(
        card.official === tool.url || card.official === tool.affiliateUrl,
        `${page}: "${card.name}" official link ${card.official} differs from catalog ${tool.url}`,
      );
    }
  });
}

test('the starter kit lists only tools that are free to start', () => {
  const free = new Set(['Free', 'Freemium', 'Open source', 'Free (source available)']);
  for (const card of readCards(read('free-ai-tools.html'))) {
    assert.ok(free.has(card.price), `"${card.name}" is ${card.price}, not free to start`);
    assert.doesNotMatch(catalog.get(card.name).description, /no free tier/i, `"${card.name}" says it has no free tier`);
  }
});
