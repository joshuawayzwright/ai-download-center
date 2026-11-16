import { loadOrg } from '../src/registry.js';

// A fresh org per test, optionally with the Board envelope confirmed.
export function freshOrg({ confirmed = false } = {}) {
  const org = loadOrg();
  org.constitution = structuredClone(org.constitution);
  org.constitution.board.owner_confirmed = confirmed;
  return org;
}
