// Adds, changes or removes a tool's affiliate tracking link in data/tools.json.
//
//   node scripts/set-affiliate.mjs "<Tool name>" "<https tracking link>"
//   node scripts/set-affiliate.mjs "<Tool name>" --remove
//   node scripts/set-affiliate.mjs --list
//
// The site already sends visitors to `affiliateUrl` instead of `url` when it is set,
// and marks the link rel="sponsored". Only hand-picked listings can carry one.
// Run scripts/validate-catalog.mjs afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CATALOG = new URL('../data/tools.json', import.meta.url);
// data/tools.json keeps one tool per line; rewrite only the line that changes.
const TOOL_LINE = /^(\s*)(\{.*\})(,?)$/;

// Matches the catalog's one-line style: { "key": value, "tags": ["a", "b"] }
export function formatTool(value) {
  if (Array.isArray(value)) return `[${value.map(formatTool).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${formatTool(item)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

export function setAffiliate(text, name, link) {
  const wanted = name.trim().toLowerCase();
  if (link !== null) {
    let parsed;
    try {
      parsed = new URL(link);
    } catch {
      throw new Error(`"${link}" is not a valid URL.`);
    }
    if (parsed.protocol !== 'https:') throw new Error('The tracking link must start with https://');
    link = parsed.href;
  }
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, index) => {
    const match = line.match(TOOL_LINE);
    if (!match) return;
    const tool = JSON.parse(match[2]);
    if (tool.source !== 'hugging-face' && String(tool.name).toLowerCase() === wanted) hits.push({ index, match, tool });
  });
  if (hits.length === 0) throw new Error(`No hand-picked tool is named "${name}". Run with --list to see names.`);
  if (hits.length > 1) throw new Error(`More than one tool is named "${name}".`);
  const [{ index, match, tool }] = hits;
  if (link === null) delete tool.affiliateUrl;
  else tool.affiliateUrl = link;
  lines[index] = `${match[1]}${formatTool(tool)}${match[3]}`;
  const updated = lines.join('\n');
  JSON.parse(updated); // never write a file that no longer parses
  return { text: updated, tool };
}

function main(args) {
  const text = readFileSync(CATALOG, 'utf8');
  if (args[0] === '--list') {
    for (const tool of JSON.parse(text).tools) {
      if (tool.source !== 'hugging-face') console.log(`${tool.affiliateUrl ? '[affiliate] ' : ''}${tool.name}`);
    }
    return;
  }
  const [name, value] = args;
  if (!name || !value) {
    console.error('Usage: node scripts/set-affiliate.mjs "<Tool name>" "<https tracking link>"');
    console.error('       node scripts/set-affiliate.mjs "<Tool name>" --remove');
    console.error('       node scripts/set-affiliate.mjs --list');
    process.exit(1);
  }
  try {
    const result = setAffiliate(text, name, value === '--remove' ? null : value);
    writeFileSync(CATALOG, result.text);
    console.log(result.tool.affiliateUrl ? `${result.tool.name}: affiliate link set.` : `${result.tool.name}: affiliate link removed.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
