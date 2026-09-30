import { readFile, writeFile } from 'node:fs/promises';

const TARGET_SIZE = 500;
const CATALOG_URL = 'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=1000&full=true';
const taskCategories = {
  'automatic-speech-recognition': 'audio',
  'audio-classification': 'audio',
  'audio-to-audio': 'audio',
  'text-to-audio': 'audio',
  'text-to-speech': 'audio',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'text-to-image': 'image',
  'image-to-image': 'image',
  'unconditional-image-generation': 'image',
  'image-classification': 'vision',
  'image-segmentation': 'vision',
  'object-detection': 'vision',
  'depth-estimation': 'vision',
  'visual-question-answering': 'vision',
  'image-to-text': 'vision',
  conversational: 'chatbot',
  'text-generation': 'llm',
  'text2text-generation': 'llm',
  'sentence-similarity': 'llm',
  'feature-extraction': 'llm',
};

const taskLabels = {
  audio: 'Audio',
  chatbot: 'Conversational',
  code: 'Code',
  image: 'Image generation',
  llm: 'Text generation',
  video: 'Video',
  vision: 'Computer vision',
};

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
  const searchable = `${modelId} ${tags.join(' ')}`.toLowerCase();
  const task = model.pipeline_tag || tags.find((tag) => taskCategories[tag]) || 'text-generation';
  let category = taskCategories[task] || 'llm';

  if (searchable.includes('diffusion') || searchable.includes('flux')) category = 'image';
  else if (searchable.includes('video')) category = 'video';
  else if (searchable.includes('speech') || searchable.includes('audio')) category = 'audio';
  else if (searchable.includes('vision') || searchable.includes('detection')) category = 'vision';
  else if (searchable.includes('code') || searchable.includes('coder')) category = 'code';

  const licenseTag = tags.find((tag) => tag.startsWith('license:'));
  const downloads = Number(model.downloads || 0).toLocaleString();
  const modelTags = [...new Set(['community', 'hugging-face', task, ...tags.slice(0, 3)])].slice(0, 6);
  const name = modelId;

  tools.push({
    name,
    company: model.author || modelId.split('/')[0] || 'Hugging Face',
    category,
    platform: 'Hugging Face model',
    version: model.lastModified ? `Updated ${model.lastModified.slice(0, 10)}` : 'Community model',
    price: licenseTag ? licenseTag.slice('license:'.length) : 'Review license',
    tags: modelTags,
    description: `${taskLabels[category] || 'AI'} model from the public Hugging Face registry with ${downloads} downloads.`,
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