import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const TARGET_SIZE = 1000;
const CATALOG_URL = 'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=1000&full=true';
// Classification and test-fixture filtering are shared with the site and the normalizer.
const require = createRequire(import.meta.url);
const { classify, describe } = require('../hf-classify.js');
const { isTestFixture } = require('./hf-fixtures.cjs');

const catalogPath = new URL('../data/tools.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const tools = Array.isArray(catalog.tools) ? catalog.tools : [];
const existingNames = new Set(tools.map((tool) => tool.name.toLowerCase()));

if (tools.length >= TARGET_SIZE) {
  console.log(`Catalog already has ${tools.length} entries; no expansion needed.`);
  process.exit(0);
}

const response = await fetch(CATALOG_URL);
if (!response.ok) throw new Error(`Hugging Face returned ${response.status}`);
const models = await response.json();

for (const model of models) {
  if (tools.length >= TARGET_SIZE) break;

  const modelId = String(model.id || '').trim();
  if (!modelId || existingNames.has(modelId.toLowerCase())) continue;

  const tags = Array.isArray(model.tags) ? model.tags : [];
  if (isTestFixture(modelId, model)) continue;
  const { category, task, label } = classify(model);
  const licenseTag = tags.find((tag) => tag.startsWith('license:'));
  const extra = tags.filter((t) => !/^(license:|region:|arxiv:|base_model:|dataset:|endpoints_compatible|autotrain_compatible|deploy:|doi:)/.test(t) && t !== task);
  const modelTags = [...new Set(['community', 'hugging-face', task, ...extra.slice(0, 3)])].slice(0, 6);
  const name = modelId;

  tools.push({
    name,
    company: model.author || modelId.split('/')[0] || 'Hugging Face',
    category,
    platform: 'Hugging Face model',
    version: model.lastModified ? `Updated ${model.lastModified.slice(0, 10)}` : 'Community model',
    price: licenseTag ? licenseTag.slice('license:'.length) : 'Review license',
    tags: modelTags,
    description: describe(model, label),
    url: `https://huggingface.co/${modelId.split('/').map(encodeURIComponent).join('/')}`,
    source: 'hugging-face',
  });
  existingNames.add(name.toLowerCase());
}

if (tools.length < TARGET_SIZE) {
  throw new Error(`Only expanded to ${tools.length} entries; expected ${TARGET_SIZE}.`);
}

catalog.tools = tools;
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Expanded catalog to ${tools.length} entries.`);