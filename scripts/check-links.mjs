// Checks every official URL in data/tools.json and writes a Markdown report to link-report.md.
// Exits 0 either way; the report's first line says how many links are broken.
import { readFileSync, writeFileSync } from 'node:fs';

const tools = JSON.parse(readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8')).tools;
const TIMEOUT_MS = 20000;
// Many sites answer bots with these codes even though they work in a browser.
const BOT_BLOCK_CODES = new Set([401, 403, 429, 503]);

async function check(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AI-Download-Center-link-check)' },
    });
    if (response.ok) return { status: 'ok', code: response.status, finalUrl: response.url };
    if (BOT_BLOCK_CODES.has(response.status)) return { status: 'blocked', code: response.status };
    return { status: 'broken', code: response.status };
  } catch (error) {
    return { status: 'broken', code: error.name === 'AbortError' ? 'timeout' : (error.cause?.code || error.message) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let i = 0; i < tools.length; i += 10) {
  const batch = tools.slice(i, i + 10);
  results.push(...await Promise.all(batch.map(async (tool) => ({ tool, ...(await check(tool.url)) }))));
}

const broken = results.filter((r) => r.status === 'broken');
const blocked = results.filter((r) => r.status === 'blocked');
const moved = results.filter((r) => r.status === 'ok' && r.finalUrl && new URL(r.finalUrl).host !== new URL(r.tool.url).host);

const lines = [
  `**${broken.length} broken** of ${results.length} links checked on ${new Date().toISOString().slice(0, 10)}.`,
  '',
];
if (broken.length) {
  lines.push('### Broken', '', '| Tool | URL | Result |', '|---|---|---|');
  broken.forEach((r) => lines.push(`| ${r.tool.name} | ${r.tool.url} | ${r.code} |`));
  lines.push('');
}
if (moved.length) {
  lines.push('### Moved to a new domain (update the URL)', '', '| Tool | Old URL | Now |', '|---|---|---|');
  moved.forEach((r) => lines.push(`| ${r.tool.name} | ${r.tool.url} | ${r.finalUrl} |`));
  lines.push('');
}
if (blocked.length) {
  lines.push(`<details><summary>${blocked.length} sites blocked the automated check (usually fine in a browser)</summary>`, '');
  blocked.forEach((r) => lines.push(`- ${r.tool.name}: ${r.tool.url} (${r.code})`));
  lines.push('', '</details>');
}

writeFileSync('link-report.md', lines.join('\n') + '\n');
console.log(lines[0]);
