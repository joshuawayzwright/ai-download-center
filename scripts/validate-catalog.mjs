// Validates data/tools.json. Exits 1 and lists every problem if the catalog is invalid.
import { readFileSync } from 'node:fs';

const CATEGORIES = ['llm', 'chatbot', 'assistant', 'self-hosted', 'vision', 'image', 'audio', 'code', 'video', 'utility'];
const REQUIRED = ['name', 'company', 'category', 'platform', 'version', 'price', 'tags', 'description', 'url'];

const problems = [];
let tools;
try {
  tools = JSON.parse(readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8')).tools;
} catch (error) {
  console.error(`data/tools.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(tools) || tools.length === 0) {
  console.error('data/tools.json must have a non-empty "tools" array.');
  process.exit(1);
}

const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const seenNames = new Map();
tools.forEach((tool, index) => {
  const label = `#${index + 1} ${tool.name ?? '(no name)'}`;
  for (const field of REQUIRED) {
    const value = tool[field];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      problems.push(`${label}: missing "${field}"`);
    }
  }
  if (tool.category && !CATEGORIES.includes(tool.category)) {
    problems.push(`${label}: category "${tool.category}" is not one of ${CATEGORIES.join(', ')}`);
  }
  if (tool.tags && !Array.isArray(tool.tags)) problems.push(`${label}: "tags" must be an array`);
  if (tool.url && !isHttpsUrl(tool.url)) problems.push(`${label}: "url" must be an https URL`);
  if (tool.affiliateUrl !== undefined && !isHttpsUrl(tool.affiliateUrl)) {
    problems.push(`${label}: "affiliateUrl" must be an https URL`);
  }
  if (tool.sponsored !== undefined && typeof tool.sponsored !== 'boolean') {
    problems.push(`${label}: "sponsored" must be true or false`);
  }
  if (tool.description && tool.description.length > 200) {
    problems.push(`${label}: description is ${tool.description.length} characters (max 200)`);
  }
  const key = String(tool.name ?? '').toLowerCase();
  if (seenNames.has(key)) problems.push(`${label}: duplicate name (also #${seenNames.get(key)})`);
  else seenNames.set(key, index + 1);
});

if (problems.length) {
  console.error(`Found ${problems.length} problem(s) in data/tools.json:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`data/tools.json is valid: ${tools.length} tools, ${new Set(tools.map((t) => t.category)).size} categories.`);
