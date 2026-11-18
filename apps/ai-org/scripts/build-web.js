#!/usr/bin/env node
// Builds the Board Console web app into web/build (or the directory given as the first argument).
// The app runs the same control-plane modules as the CLI, so only browser-safe modules are copied.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrg, validateOrg, bundleFromOrg } from '../src/registry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BROWSER_MODULES = ['util.js', 'org-model.js', 'policy.js', 'finance.js', 'lifecycle.js', 'performance.js', 'conflict.js', 'improvement.js', 'gateway.js'];

export function buildWeb(outDir = join(root, 'web', 'build')) {
  const org = loadOrg();
  const errors = validateOrg(org);
  if (errors.length) throw new Error(`org is invalid:\n- ${errors.join('\n- ')}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'lib'), { recursive: true });
  for (const m of BROWSER_MODULES) {
    const src = readFileSync(join(root, 'src', m), 'utf8');
    if (/from ['"]node:/.test(src)) throw new Error(`${m} imports a Node module and cannot run in the browser`);
    copyFileSync(join(root, 'src', m), join(outDir, 'lib', m));
  }
  writeFileSync(join(outDir, 'org.json'), JSON.stringify(bundleFromOrg(org)) + '\n');
  copyFileSync(join(root, 'web', 'index.html'), join(outDir, 'index.html'));
  copyFileSync(join(root, 'web', 'app.js'), join(outDir, 'app.js'));
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Built Board Console into ${buildWeb(process.argv[2])}`);
}
