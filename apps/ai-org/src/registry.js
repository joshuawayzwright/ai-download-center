// Loads the org (constitution, policy, agent manifests, workflows) and validates its structure.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { orgFromBundle, bundleFromOrg, validateOrg, chainOfCommand, orgChart } from './org-model.js';

export const DEFAULT_ORG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'org');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function loadOrg(dir = DEFAULT_ORG_DIR) {
  const agents = new Map();
  for (const file of readdirSync(join(dir, 'agents')).filter((f) => f.endsWith('.json')).sort()) {
    const manifest = readJson(join(dir, 'agents', file));
    agents.set(manifest.id, manifest);
  }
  const workflows = new Map();
  for (const file of readdirSync(join(dir, 'workflows')).filter((f) => f.endsWith('.json')).sort()) {
    const wf = readJson(join(dir, 'workflows', file));
    workflows.set(wf.id, wf);
  }
  return {
    constitution: readJson(join(dir, 'constitution.json')),
    policy: readJson(join(dir, 'policy.json')),
    agents,
    workflows,
  };
}
