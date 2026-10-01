// Re-classifies the Hugging Face model cards in data/tools.json using each model's real
// pipeline_tag from the Hugging Face API, removes CI/test fixtures and models that no longer
// exist, and rewrites their descriptions. Hand-picked entries (no `source` field) are untouched.
//
//   node scripts/normalize-hf-imports.mjs           # dry run: prints what would change
//   node scripts/normalize-hf-imports.mjs --write   # applies the changes
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classify, describe } = require('../hf-classify.js');
const { isTestFixture } = require('./hf-fixtures.cjs');

const WRITE = process.argv.includes('--write');
const file = new URL('../data/tools.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const data = JSON.parse(raw);

const isImport = (t) => t.source === 'hugging-face';
const imports = data.tools.filter(isImport);
console.log(`${data.tools.length} entries, ${imports.length} Hugging Face imports`);

async function fetchModel(id) {
  const url = `https://huggingface.co/api/models/${id.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'ai-download-center-catalog-normalizer' } });
      if (res.status === 404 || res.status === 401 || res.status === 403) return { missing: res.status };
      if (res.status === 429) { const wait = Number(res.headers.get('retry-after')) || 10 * attempt; await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === 6) return { error: error.message };
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return { error: 'rate limited' };
}

const results = new Map();
const queue = [...imports];
async function worker() {
  while (queue.length) {
    const tool = queue.shift();
    results.set(tool.name, await fetchModel(tool.name));
  }
}
await Promise.all(Array.from({ length: 3 }, worker));

const changes = { recategorized: [], removedFixture: [], removedMissing: [], errors: [] };
const moves = {};
const next = [];
for (const tool of data.tools) {
  if (!isImport(tool)) { next.push(tool); continue; }
  const model = results.get(tool.name) || {};
  if (isTestFixture(tool.name, model)) { changes.removedFixture.push(tool.name); continue; }
  if (model.missing) { changes.removedMissing.push(`${tool.name} (HTTP ${model.missing})`); continue; }
  if (model.error) { changes.errors.push(`${tool.name}: ${model.error}`); next.push(tool); continue; }

  const { category, task, label } = classify(model);
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const extra = tags.filter((t) => !/^(license:|region:|arxiv:|base_model:|dataset:|endpoints_compatible|autotrain_compatible|deploy:|doi:)/.test(t) && t !== task);
  const licenseTag = tags.find((t) => t.startsWith('license:'));
  const updated = {
    ...tool,
    category,
    version: model.lastModified ? `Updated ${model.lastModified.slice(0, 10)}` : tool.version,
    price: licenseTag ? licenseTag.slice('license:'.length) : 'Review license',
    tags: [...new Set(['community', 'hugging-face', task, ...extra.slice(0, 3)])].slice(0, 6),
    description: describe(model, label),
  };
  if (updated.category !== tool.category) {
    changes.recategorized.push(`${tool.name}: ${tool.category} -> ${updated.category} (${task || 'no pipeline tag'})`);
    const key = `${tool.category} -> ${updated.category}`;
    moves[key] = (moves[key] || 0) + 1;
  }
  next.push(updated);
}

console.log(`\nRecategorized: ${changes.recategorized.length}`);
Object.entries(moves).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
console.log(`Removed test/CI fixtures: ${changes.removedFixture.length}`);
changes.removedFixture.forEach((n) => console.log(`  - ${n}`));
console.log(`Removed (no longer on Hugging Face): ${changes.removedMissing.length}`);
changes.removedMissing.forEach((n) => console.log(`  - ${n}`));
console.log(`Kept unchanged after fetch errors: ${changes.errors.length}`);
changes.errors.slice(0, 20).forEach((n) => console.log(`  ! ${n}`));

const counts = {};
next.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
console.log(`\nResult: ${next.length} entries`, JSON.stringify(counts));

if (WRITE) {
  data.tools = next;
  const line = (t) => '    ' + JSON.stringify(t).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  writeFileSync(file, ['{', '  "tools": [', next.map(line).join(',' + eol), '  ]', '}', ''].join(eol));
  console.log('data/tools.json updated.');
} else {
  console.log('\nDry run only. Re-run with --write to apply.');
}
