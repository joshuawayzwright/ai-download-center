#!/usr/bin/env node
'use strict';
// Pipe approved Vercel JSONL directly; do not save raw request logs with identifiers.
const readline = require('node:readline');
const products = new Set(['all-products', ...require('../data/solo-commerce-catalogue.json').launch_products.map(p => p.id)]);
const counts = new Map();
let ignored = 0, summaries = 0, incomplete = false;
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  try {
    let e = JSON.parse(line);
    if (e.type === 'summary') {
      summaries++;
      const summary = e.data || e;
      if (summary.pagination?.hasMore || (summary.excludedIntervals || []).length) incomplete = true;
      return;
    }
    if (e.type === 'log') {
      // Only inspect the application message, never copy Vercel metadata to the report.
      if (typeof e.data?.message !== 'string') { ignored++; return; }
      e = JSON.parse(e.data.message);
    }
    if (Object.keys(e).sort().join(',') !== 'event,page,product,type' ||
        e.type !== 'solo_launch_interest_v1' || !products.has(e.product) ||
        !['product_interest', 'signup_request_accepted'].includes(e.event) ||
        !['home', 'products'].includes(e.page)) { ignored++; return; }
    const key = [e.event, e.product, e.page].join('|');
    counts.set(key, (counts.get(key) || 0) + 1);
  } catch { ignored++; }
}).on('close', () => {
  process.stdout.write(JSON.stringify({
    notice: 'Approximate event counts, not unique visitors or confirmed subscribers.',
    export_status: summaries === 0 ? 'unverified: no Vercel pagination summary supplied'
      : incomplete ? 'partial: more pages or excluded intervals exist' : 'no truncation reported by supplied export',
    ignored_records: ignored,
    counts: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
      const [event, product, page] = key.split('|'); return { event, product, page, count };
    })
  }, null, 2) + '\n');
});
