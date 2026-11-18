// Board Console: the human Board's view of the AI organization.
// It runs the same control-plane modules as the CLI (copied to ./lib by scripts/build-web.js)
// and keeps approvals, the decision ledger and kill-switch state in the artifact's db when it is
// available, or in memory for a local preview.
import { orgFromBundle, validateOrg, chainOfCommand } from './lib/org-model.js';
import { evaluate, Controls } from './lib/policy.js';
import { unitEconomics, budgetSplit, thompsonAllocate, monteCarloRunway } from './lib/finance.js';
import { ACTIONS, CONNECTORS, executionPlan, summarizeResult, canonical, RUN_OPTION } from './lib/gateway.js';

const VIEWS = [
  ['overview', 'Overview'],
  ['approvals', 'Approvals'],
  ['org', 'Organization'],
  ['policy', 'Policy check'],
  ['ledger', 'Decision log'],
  ['finance', 'Finance'],
  ['controls', 'Kill switches'],
  ['connections', 'Connections'],
];

const state = {
  org: null,
  orgErrors: [],
  mode: 'local', // 'db' once the artifact store answers
  db: null,
  mcp: null,
  servers: null, // listTools() result: which connectors this viewer has
  cfg: { stripe: { account: null, livemode: true, name: '' }, linear: { team: '' } },
  stripeAccounts: null,
  running: new Set(),
  viewerId: null,
  canWrite: true,
  writeError: null,
  loading: true,
  slow: false,
  requests: [],
  ledger: [],
  controls: { levels: [], paused: [], log: [] },
  chain: { ok: true, broken: [] },
  selectedAgent: 'ceo',
  approvalFilter: 'pending',
  sandbox: { agent: 'marketing', type: 'publish_content', spendUsd: 0, discount: '', commitmentMonths: 0, author: '', compliance: true, untrusted: false, verified: false, approvals: [], assumeConfirmed: false },
  finance: {
    ue: { priceMonthly: 99, grossMargin: 0.9, monthlyChurn: 0.15, cac: 120 },
    mc: { cash: 1000, mrr: 99, growthSd: 0.15, monthlyCosts: 150, bear: -0.05, base: 0.05, bull: 0.15 },
    arms: [
      { id: 'seo', successes: 12, failures: 300 },
      { id: 'reddit', successes: 4, failures: 200 },
      { id: 'sponsor_outreach', successes: 3, failures: 40 },
      { id: 'newsletter', successes: 1, failures: 60 },
    ],
  },
};

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const pct = (n, d = 0) => `${(n * 100).toFixed(d)}%`;
const when = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isOverdue = (r) => r.status === 'pending' && Date.parse(r.deadline) < Date.now();
const pending = () => state.requests.filter((r) => r.status === 'pending');
// Requests with something to run that the Board or policy has cleared and that haven't finished.
const runnable = (r) => Boolean(r.execution) && r.run?.state !== 'done'
  && (r.status === 'ready' || (r.status === 'approved' && r.choice === RUN_OPTION));
const toRun = () => state.requests.filter(runnable);
const controlsObj = () => Controls.fromState(state.org, state.controls);
const agentTitle = (id) => (id === 'board' ? 'Board (you)' : state.org.agents.get(id)?.title ?? id);

function tierChip(t) {
  return `<span class="tier ${esc(t)}">${esc(t)}</span>`;
}

// ---------- persistence ----------
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The hash covers the decision itself; a later outcome is recorded beside it and is not hashed.
function hashBody(e) {
  return JSON.stringify({ seq: e.seq, at: e.at, kind: e.kind, requestId: e.requestId, agent: e.agent, summary: e.summary, tier: e.tier, approved: e.approved, choice: e.choice, rationale: e.rationale, p: e.p, prev: e.prev });
}

async function verifyChain() {
  const sorted = [...state.ledger].sort((a, b) => a.seq - b.seq);
  const broken = [];
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const prev = i === 0 ? 'genesis' : sorted[i - 1].hash;
    if (e.prev !== prev || e.hash !== (await sha256(hashBody(e)))) broken.push(e.seq);
  }
  state.chain = { ok: broken.length === 0, broken };
}

async function guardedWrite(fn) {
  if (!state.canWrite) return false;
  try {
    await fn();
    state.writeError = null;
    return true;
  } catch (e) {
    if (e?.code === 'invalid_argument') state.canWrite = false;
    state.writeError = e?.code === 'quota_exceeded'
      ? 'The app’s storage is full. Delete old decisions before adding more.'
      : e?.code === 'invalid_argument'
        ? 'Your access to this app is read-only, so changes are not saved.'
        : 'The change could not be saved. Try again in a moment.';
    render();
    return false;
  }
}

async function saveControls(next) {
  const doc = { levels: next.levels, paused: next.paused, log: next.log.slice(-50) };
  if (state.mode === 'db') return guardedWrite(() => state.db.doc('controls/state').set(doc));
  state.controls = doc;
  render();
  return true;
}

async function ledgerEntry(req, fields) {
  const sorted = [...state.ledger].sort((a, b) => a.seq - b.seq);
  const last = sorted.at(-1);
  const entry = {
    seq: (last?.seq ?? -1) + 1,
    at: new Date().toISOString(),
    requestId: req.id,
    agent: String(req.from ?? 'unknown'),
    summary: String(req.subject ?? ''),
    tier: String(req.tier ?? ''),
    p: typeof req.confidence === 'number' ? req.confidence : null,
    prev: last?.hash ?? 'genesis',
    example: Boolean(req.example),
    ...fields,
  };
  entry.hash = await sha256(hashBody(entry));
  return entry;
}

async function writeRequestAndLedger(req, update, entry) {
  if (state.mode === 'db') {
    return guardedWrite(async () => {
      await state.db.doc(`requests/${req.id}`).update(update);
      if (entry) await state.db.doc(`ledger/d${String(entry.seq).padStart(6, '0')}`).set(entry);
    });
  }
  Object.assign(req, update);
  if (entry) { state.ledger.push({ ...entry, id: `d${entry.seq}` }); await verifyChain(); }
  render();
  return true;
}

async function decideRequest(req, { approved, choice, rationale }) {
  const entry = await ledgerEntry(req, { approved, choice: choice ?? null, rationale: rationale ?? '' });
  const update = { status: approved ? 'approved' : 'denied', choice: choice ?? null, rationale: rationale ?? '', decidedAt: entry.at };
  // Pin the approval to exactly what was shown, so a later edit needs a fresh approval.
  if (approved && req.execution) update.approvedExecution = canonical(req.execution);
  return writeRequestAndLedger(req, update, entry);
}

// Codes where the connector call certainly did not reach the tool, or the tool reported failure.
const NOT_RUN = new Set(['not_in_manifest', 'server_not_connected', 'selection_required', 'blocked_by_policy', 'bad_request', 'approval_required', 'needs_reauth', 'not_granted', 'capability_disabled', 'capability_removed', 'consent_required', 'transform_error', 'server_not_found', 'tool_error', 'self_only']);
const CONNECTOR_HELP = {
  needs_reauth: 'reconnect it in claude.ai Settings → Connectors',
  server_not_connected: 'add it in claude.ai Settings → Connectors',
  not_in_manifest: 'you turned this connector off for the app; allow it in the app’s permissions',
  approval_required: 'the connector asked for your approval and didn’t get it',
  selection_required: 'you have more than one connector with this name; choose one when asked',
  blocked_by_policy: 'your organization’s policy blocks this tool',
};

async function runRequest(req, { approvalToken } = {}) {
  if (!state.mcp) { state.writeError = 'Running actions needs the published app with your connectors.'; render(); return; }
  if (state.mode !== 'db') return;
  const base = approvalToken ? { ...req, run: undefined } : req;
  const plan = executionPlan(state.org, controlsObj(), state.cfg, base);
  if (!plan.ok) { state.writeError = `Not run: ${plan.reasons.join('; ')}.`; render(); return; }
  if (state.running.has(req.id)) return;
  state.running.add(req.id);
  render();
  const ref = state.db.doc(`requests/${req.id}`);
  try {
    // Only one viewer may run a request; others back off.
    const lease = await ref.acquire({ holder: state.viewerId ?? 'board', ttlMs: 180000 });
    if (!lease.acquired) throw Object.assign(new Error('Someone else is running this right now.'), { local: true });
    const fresh = await ref.get();
    const current = fresh.exists ? { id: req.id, ...fresh.data() } : null;
    const recheck = current && executionPlan(state.org, controlsObj(), state.cfg, approvalToken ? { ...current, run: undefined } : current);
    if (!recheck?.ok) throw Object.assign(new Error(`Not run: ${(recheck?.reasons ?? ['the request is gone']).join('; ')}.`), { local: true });
    await ref.update({ run: { state: 'running', startedAt: new Date().toISOString() } });

    const input = approvalToken ? { ...recheck.call.input, human_confirmation: { approval_token: approvalToken } } : recheck.call.input;
    let result;
    try {
      result = await state.mcp.callTool(recheck.call.server, recheck.call.tool, input, { cache: false });
    } catch (e) {
      const code = e?.code ?? 'upstream_error';
      const certain = NOT_RUN.has(code);
      const run = {
        state: certain ? 'failed' : 'unknown',
        finishedAt: new Date().toISOString(),
        code,
        error: String(e?.message ?? 'The connector call failed.').slice(0, 1000),
        ...(CONNECTOR_HELP[code] ? { help: CONNECTOR_HELP[code] } : {}),
      };
      const entry = await ledgerEntry(current, { kind: 'execution', approved: false, choice: 'run', rationale: certain ? `Run failed (${code}): ${run.error}` : `Run outcome unknown (${code}); check ${recheck.call.server} before retrying` });
      await writeRequestAndLedger(current, { run }, entry);
      return;
    }
    const out = summarizeResult(current.execution.kind, result?.payload ?? result?.content?.[0]?.text);
    const run = {
      state: out.needsApproval ? 'needs_confirmation' : 'done',
      finishedAt: new Date().toISOString(),
      summary: out.summary,
      ...(out.id ? { resultId: out.id } : {}),
      ...(out.url ? { url: out.url } : {}),
    };
    const entry = await ledgerEntry(current, { kind: 'execution', approved: !out.needsApproval, choice: 'run', rationale: out.summary });
    await writeRequestAndLedger(current, { run }, entry);
  } catch (e) {
    state.writeError = e?.local ? e.message : 'The run could not be recorded. Check the connector before trying again.';
    render();
  } finally {
    state.running.delete(req.id);
    render();
  }
}

/** After checking the connector by hand, the Board records whether an uncertain run went through. */
async function settleRun(req, done) {
  const run = { ...(req.run ?? {}), state: done ? 'done' : 'failed', settledAt: new Date().toISOString(), settledByBoard: true };
  const entry = await ledgerEntry(req, { kind: 'execution', approved: done, choice: 'run', rationale: done ? 'Board confirmed the run went through' : 'Board confirmed the run did not go through' });
  return writeRequestAndLedger(req, { run }, entry);
}

async function saveCfg(next) {
  if (state.mode !== 'db') { state.cfg = next; render(); return; }
  await guardedWrite(() => state.db.doc('settings/connectors').set(next));
}

async function refreshServers() {
  if (!state.mcp) return;
  try { state.servers = (await state.mcp.listTools()).servers ?? []; } catch { state.servers = []; }
  render();
}

async function recordOutcome(entry, success) {
  const outcome = { success, at: new Date().toISOString() };
  if (state.mode === 'db') return guardedWrite(() => state.db.doc(`ledger/${entry.id}`).update({ outcome }));
  entry.outcome = outcome;
  render();
  return true;
}

async function connect() {
  const claude = window.claude;
  if (!claude?.use) return finishLocal();
  const [db, user, mcp] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('mcp')]);
  state.mcp = mcp;
  if (!db) return finishLocal();
  state.mode = 'db';
  state.db = db;
  if (user) {
    const edit = await user.canEdit().catch(() => null);
    state.canWrite = edit !== false;
    state.viewerId = await user.id().catch(() => null);
  }
  refreshServers();
  db.doc('settings/connectors').onSnapshot((snap) => {
    const d = snap.exists ? snap.data() : {};
    state.cfg = {
      stripe: { account: typeof d.stripe?.account === 'string' ? d.stripe.account : null, livemode: d.stripe?.livemode !== false, name: typeof d.stripe?.name === 'string' ? d.stripe.name : '' },
      linear: { team: typeof d.linear?.team === 'string' ? d.linear.team : '' },
    };
    render();
  }, () => {});

  const timer = setTimeout(() => { state.slow = true; render(); }, 10_000);
  let pendingFirst = 3;
  const settle = (snap) => {
    if (snap?.metadata?.fromCache === false && pendingFirst > 0) {
      pendingFirst -= 1;
      if (pendingFirst === 0) { clearTimeout(timer); state.slow = false; }
    }
    state.loading = false;
  };
  const fail = () => { clearTimeout(timer); state.loading = false; state.slow = true; render(); };

  db.collection('requests').onSnapshot((snap) => {
    state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => typeof r.subject === 'string');
    settle(snap);
    render();
  }, fail);
  db.collection('ledger').onSnapshot(async (snap) => {
    state.ledger = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => Number.isInteger(e.seq));
    settle(snap);
    await verifyChain();
    render();
  }, fail);
  db.doc('controls/state').onSnapshot((snap) => {
    const d = snap.exists ? snap.data() : {};
    state.controls = {
      levels: Array.isArray(d.levels) ? d.levels.filter((x) => typeof x === 'string') : [],
      paused: Array.isArray(d.paused) ? d.paused.filter((x) => typeof x === 'string') : [],
      log: Array.isArray(d.log) ? d.log : [],
    };
    settle(snap);
    render();
  }, fail);
}

function finishLocal() {
  state.mode = 'local';
  state.loading = false;
  render();
}

// ---------- views ----------
function statusPills() {
  const b = state.org.constitution.board;
  const c = state.controls;
  const pills = [];
  pills.push(b.owner_confirmed ? '<span class="pill ok">Limits confirmed</span>' : '<span class="pill warn">Limits not confirmed</span>');
  if (c.levels.includes('L4')) pills.push('<span class="pill bad">Full stop</span>');
  else if (c.levels.length) pills.push(`<span class="pill bad">${esc(c.levels.join(' + '))} active</span>`);
  else pills.push('<span class="pill ok">Kill switches clear</span>');
  if (toRun().length) pills.push(`<span class="pill warn">${toRun().length} ready to run</span>`);
  if (state.mode === 'local') pills.push('<span class="pill">Preview: not saved</span>');
  else if (!state.canWrite) pills.push('<span class="pill">Read-only</span>');
  return pills.join('');
}

function tabsHtml(current) {
  const n = pending().length + toRun().length;
  return VIEWS.map(([id, label]) => `<a href="#${id}" ${id === current ? 'aria-current="page"' : ''}>${label}${id === 'approvals' && n ? `<span class="count">${n}</span>` : ''}</a>`).join('');
}

function banners() {
  const out = [];
  if (state.orgErrors.length) out.push(`<div class="notice bad">The organization config has problems: ${esc(state.orgErrors.join('; '))}</div>`);
  if (state.writeError) out.push(`<div class="notice bad">${esc(state.writeError)}</div>`);
  if (state.slow) out.push('<div class="notice">The saved data can’t be reached yet, so what you see may be out of date.</div>');
  return out.join('');
}

function viewOverview() {
  const { constitution: k } = state.org;
  const b = k.board;
  const p = pending();
  const overdue = p.filter(isOverdue).length;
  const split = budgetSplit(b.monthly_burn_cap_usd, k.allocation_policy);
  const recent = [...state.ledger].sort((a, b2) => b2.seq - a.seq).slice(0, 5);
  const c = state.controls;
  return `
  <h1>Overview</h1>
  <p class="sub">${esc(k.business)}. North Star: <strong>${esc(k.north_star.definition)}</strong>.</p>
  ${b.owner_confirmed ? '' : `<div class="notice" style="margin-bottom:16px">The spending limits below are defaults you haven’t confirmed yet, so every external or spending action waits for your approval. To confirm them, set <code>owner_confirmed</code> to <code>true</code> in <code>apps/ai-org/org/constitution.json</code>.</div>`}
  <div class="grid">
    <a class="panel stack" href="#approvals" style="text-decoration:none;color:inherit">
      <span class="label">Waiting for you</span>
      <span class="big">${p.length}</span>
      <span class="${overdue ? '' : 'muted'}">${overdue ? `${overdue} past deadline and not approved` : 'Nothing overdue'}</span>
    </a>
    <a class="panel stack" href="#controls" style="text-decoration:none;color:inherit">
      <span class="label">Kill switches</span>
      <span class="big">${c.levels.length ? esc(c.levels.join(' + ')) : 'Clear'}</span>
      <span class="muted">${c.paused.length ? `${c.paused.length} agent(s) paused` : 'No agents paused'}</span>
    </a>
    <div class="panel stack">
      <span class="label">Monthly spending cap</span>
      <span class="big">${money(b.monthly_burn_cap_usd)}</span>
      <span class="muted">Core ${money(split.core)} · Growth ${money(split.growth)} · R&amp;D ${money(split.rnd)}</span>
    </div>
    <div class="panel stack">
      <span class="label">Decisions logged</span>
      <span class="big">${state.ledger.length}</span>
      <span class="${state.chain.ok ? 'muted' : ''}">${state.chain.ok ? 'Log intact' : `Tampering detected at entry ${esc(state.chain.broken.join(', '))}`}</span>
    </div>
  </div>
  <div class="panel" style="margin-top:16px">
    <h2>Recent decisions</h2>
    ${recent.length ? `<div class="scroll"><table><tr><th>When</th><th>Request</th><th>From</th><th>Result</th></tr>${recent.map((e) => `<tr><td class="mono">${esc(when(e.at))}</td><td>${esc(e.summary)}${e.example ? ' <span class="pill">Example</span>' : ''}</td><td>${esc(agentTitle(e.agent))}</td><td>${e.approved ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Denied</span>'}</td></tr>`).join('')}</table></div>` : '<p class="muted">No decisions yet. Approvals and denials you make appear here.</p>'}
  </div>
  <div class="panel" style="margin-top:16px">
    <h2>Rules the organization can’t break</h2>
    <ul class="reasons">${k.never.map((n) => `<li>Never ${esc(n)}</li>`).join('')}</ul>
  </div>`;
}

function requestCard(r) {
  const overdue = isOverdue(r);
  const options = Array.isArray(r.options) ? r.options : [];
  const evidence = Array.isArray(r.evidence) ? r.evidence : [];
  let check = '';
  if (r.action && typeof r.action === 'object' && state.org.agents.has(r.action.agent)) {
    const v = evaluate(state.org, controlsObj(), { ...r.action, approvals: [] });
    check = `<div class="muted">Policy check: <strong>${esc(v.decision.replace('_', ' '))}</strong> at ${tierChip(v.tier)}${v.missing.length ? `, needs ${esc(v.missing.join(', '))}` : ''}${v.reasons.length ? `. ${esc(v.reasons.at(-1))}` : ''}</div>`;
  }
  const decided = r.status !== 'pending';
  const exec = executionBlock(r);
  return `
  <article class="card ${overdue ? 'overdue' : ''}" data-id="${esc(r.id)}">
    <div class="row">${tierChip(r.tier)}<span class="muted">from ${esc(agentTitle(r.from))}</span>${r.example ? '<span class="pill">Example</span>' : ''}
      ${r.run?.state === 'done' ? '<span class="pill ok">Ran</span>' : r.status === 'ready' ? '<span class="pill warn">Allowed by policy</span>' : decided ? `<span class="pill ${r.status === 'approved' ? 'ok' : 'bad'}">${esc(r.status)}</span>` : overdue ? '<span class="pill bad">Overdue, not approved</span>' : `<span class="pill">Due ${esc(when(r.deadline))}</span>`}</div>
    <h3>${esc(r.subject)}</h3>
    ${r.body ? `<p style="margin:0">${esc(r.body)}</p>` : ''}
    ${exec || check}
    ${r.status === 'ready' ? '' : `<div class="opts">${options.map((o) => `
      <label class="opt"><input type="radio" name="opt-${esc(r.id)}" value="${esc(o.id)}" ${o.id === (decided ? r.choice : r.recommendation) ? 'checked' : ''} ${decided ? 'disabled' : ''}>
        <span><strong>${esc(o.id)}.</strong> ${esc(o.summary ?? '')}${o.id === r.recommendation ? ` <span class="rec">Recommended · ${pct(num(r.confidence))} confident</span>` : ''}</span></label>`).join('')}</div>`}
    ${evidence.length ? `<div class="muted mono">Evidence: ${evidence.map((e) => `${esc(e.kind)} ${esc(e.ref)}`).join(' · ')}</div>` : ''}
    ${r.status === 'ready' && r.run?.state === 'done'
      ? ''
      : r.status === 'ready'
      ? `<div class="row"><span class="muted">Allowed by policy without your approval.</span><button class="danger" data-act="deny" data-id="${esc(r.id)}" ${state.canWrite ? '' : 'disabled'}>Cancel it</button></div>`
      : decided
      ? `<div class="muted">Decided ${esc(when(r.decidedAt))}${r.rationale ? `: ${esc(r.rationale)}` : ''}</div>`
      : `<label class="field">Reason (saved in the decision log)<textarea id="why-${esc(r.id)}"></textarea></label>
         <div class="row"><button class="primary" data-act="approve" data-id="${esc(r.id)}" ${state.canWrite ? '' : 'disabled'}>Approve selected option</button>
         <button class="danger" data-act="deny" data-id="${esc(r.id)}" ${state.canWrite ? '' : 'disabled'}>Deny</button></div>`}
  </article>`;
}

function viewApprovals() {
  const f = state.approvalFilter;
  const list = state.requests
    .filter((r) => (f === 'pending' ? r.status === 'pending' : f === 'run' ? runnable(r) : r.status !== 'pending' && !runnable(r)))
    .sort((a, b) => (f === 'pending' ? Date.parse(a.deadline) - Date.parse(b.deadline) : Date.parse(b.decidedAt ?? 0) - Date.parse(a.decidedAt ?? 0)));
  return `
  <h1>Approvals</h1>
  <p class="sub">Requests the organization can’t settle without you: T4 decisions, and every external or spending action while your limits are unconfirmed. Silence never counts as approval: a request past its deadline stays unapproved.</p>
  <div class="row" style="margin-bottom:16px">
    <button data-filter="pending" class="${f === 'pending' ? 'primary' : ''}">Waiting (${pending().length})</button>
    <button data-filter="run" class="${f === 'run' ? 'primary' : ''}">Ready to run (${toRun().length})</button>
    <button data-filter="decided" class="${f === 'decided' ? 'primary' : ''}">Done (${state.requests.length - pending().length - toRun().length})</button>
  </div>
  ${state.loading && state.mode === 'db' ? '<p class="muted">Loading requests…</p>' : list.length
    ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))">${list.map(requestCard).join('')}</div>`
    : `<div class="panel empty">${f === 'pending' ? 'Nothing is waiting for you. When an agent files a request that needs the Board, it appears here with its options, evidence and deadline. You can also ask Claude to file one.' : f === 'run' ? 'Nothing is ready to run. Approved actions and actions the policy allows on its own appear here.' : 'Nothing is finished yet.'}</div>`}`;
}

function treeHtml(parent) {
  const kids = [...state.org.agents.values()].filter((a) => a.reports_to === parent).sort((a, b) => a.id.localeCompare(b.id));
  if (!kids.length) return '';
  return `<ul class="${parent === 'board' ? 'tree' : ''}">${kids.map((a) => `
    <li><button data-agent="${esc(a.id)}" aria-pressed="${a.id === state.selectedAgent}">${tierChip(a.permissions.max_tier)} ${esc(a.title)}${state.controls.paused.includes(a.id) ? ' <span class="pill bad">Paused</span>' : ''}</button>${treeHtml(a.id)}</li>`).join('')}</ul>`;
}

function viewOrg() {
  const a = state.org.agents.get(state.selectedAgent) ?? state.org.agents.get('ceo');
  const caps = a.permissions.spend_limit_usd ?? {};
  return `
  <h1>Organization</h1>
  <p class="sub">${state.org.agents.size} agents reporting to you. Select one to see its mission, targets and limits.</p>
  <div class="split">
    <div class="panel"><div class="label" style="margin-bottom:8px">Board (you)</div>${treeHtml('board')}</div>
    <div class="panel stack">
      <div class="row">${tierChip(a.permissions.max_tier)}<span class="label">${esc(a.layer)} · v${esc(a.version)}</span></div>
      <h2 style="margin:0;font-size:18px">${esc(a.title)}</h2>
      <p style="margin:0">${esc(a.mission)}</p>
      <div class="muted">Reports to ${esc(agentTitle(a.reports_to))}${a.dotted_to.length ? `; also answers to ${esc(a.dotted_to.map(agentTitle).join(', '))}` : ''}. Chain: ${esc(chainOfCommand(state.org, a.id).join(' → '))}</div>
      ${a.veto.length ? `<div><span class="pill bad">Can veto: ${esc(a.veto.join(', '))}</span></div>` : ''}
      <div><div class="label">Responsibilities</div><ul class="reasons">${a.responsibilities.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
      <div class="scroll"><table><tr><th>Target</th><th>Goal</th><th class="num">Weight</th></tr>${a.kpis.map((k) => `<tr><td>${esc(k.name.replaceAll('_', ' '))}${k.guardrail ? ' <span class="pill warn">Guardrail</span>' : ''}</td><td class="mono">${esc(k.target)}</td><td class="num">${pct(k.weight)}</td></tr>`).join('')}</table></div>
      <div class="muted">Spending: ${money(caps.per_action ?? 0)} per action, ${money(caps.monthly ?? 0)} per month${a.permissions.discount_limit ? `. Discounts up to ${pct(a.permissions.discount_limit)}` : ''}${a.permissions.forbidden?.length ? `. Never: ${esc(a.permissions.forbidden.join(', ').replaceAll('_', ' '))}` : ''}.</div>
      <div class="muted">Tools: ${esc(Object.entries(a.tools).map(([t, s]) => `${t} (${s.join(', ')})`).join(' · '))}</div>
      ${a.workers?.length ? `<div class="muted">Workers: ${esc(a.workers.join(', '))}</div>` : ''}
    </div>
  </div>`;
}

function sandboxVerdict() {
  const s = state.sandbox;
  let org = state.org;
  if (s.assumeConfirmed) org = { ...org, constitution: { ...org.constitution, board: { ...org.constitution.board, owner_confirmed: true } } };
  const action = {
    agent: s.agent,
    type: s.type,
    spendUsd: num(s.spendUsd),
    commitmentMonths: num(s.commitmentMonths),
    approvals: s.approvals,
    compliance: { status: s.compliance ? 'approved' : 'pending' },
    untrustedTrigger: s.untrusted,
    verified: s.verified,
  };
  if (s.discount !== '') action.discount = num(s.discount) / 100;
  if (s.author) action.author = s.author;
  return evaluate(org, controlsObj(), action);
}

function verdictHtml() {
  const v = sandboxVerdict();
  const words = { allow: 'Allowed', deny: 'Denied', needs_approval: 'Needs approval' };
  return `
    <div class="verdict ${v.decision}">${words[v.decision]}</div>
    <div class="row">${tierChip(v.tier)}${v.required.length ? `<span class="muted">Approvers: ${esc(v.required.map(agentTitle).join(', '))}</span>` : '<span class="muted">No approvers needed</span>'}</div>
    ${v.missing.length ? `<div>Still missing: <strong>${esc(v.missing.map(agentTitle).join(', '))}</strong></div>` : ''}
    ${v.reasons.length ? `<ul class="reasons">${v.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
}

function viewPolicy() {
  const s = state.sandbox;
  const agents = [...state.org.agents.values()];
  const types = Object.entries(state.org.policy.action_types);
  const approverIds = ['board', ...agents.filter((a) => a.layer === 'L1').map((a) => a.id), 'eval-lab'];
  return `
  <h1>Policy check</h1>
  <p class="sub">Try an action and see what the policy engine decides, using the live kill-switch state. This is the same code the agents are checked against.</p>
  <div class="split">
    <form class="panel stack" id="sandbox">
      <div class="form">
        <label class="field">Agent<select id="sb-agent">${agents.map((a) => `<option value="${esc(a.id)}" ${a.id === s.agent ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>
        <label class="field">Action<select id="sb-type">${types.map(([t, r]) => `<option value="${esc(t)}" ${t === s.type ? 'selected' : ''}>${esc(t.replaceAll('_', ' '))} (${r.tier})</option>`).join('')}</select></label>
        <label class="field">Spend (US$)<input id="sb-spend" type="number" min="0" step="1" value="${esc(s.spendUsd)}"></label>
        <label class="field">Discount (%)<input id="sb-discount" type="number" min="0" max="100" step="1" placeholder="none" value="${esc(s.discount)}"></label>
        <label class="field">Commitment (months)<input id="sb-months" type="number" min="0" step="1" value="${esc(s.commitmentMonths)}"></label>
        <label class="field">Work authored by<select id="sb-author"><option value="">Someone else</option>${agents.map((a) => `<option value="${esc(a.id)}" ${a.id === s.author ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>
      </div>
      <label class="check"><input id="sb-compliance" type="checkbox" ${s.compliance ? 'checked' : ''}> Compliance has approved the content</label>
      <label class="check"><input id="sb-untrusted" type="checkbox" ${s.untrusted ? 'checked' : ''}> Prompted by outside, untrusted content</label>
      <label class="check"><input id="sb-verified" type="checkbox" ${s.verified ? 'checked' : ''}> That content has been verified</label>
      <label class="check"><input id="sb-assume" type="checkbox" ${s.assumeConfirmed ? 'checked' : ''}> Pretend my spending limits are confirmed</label>
      <div><div class="label" style="margin-bottom:6px">Approvals already given</div>
        <div class="row">${approverIds.map((id) => `<label class="check"><input type="checkbox" data-approver="${esc(id)}" ${s.approvals.includes(id) ? 'checked' : ''}> ${esc(id === 'board' ? 'Board' : id.toUpperCase())}</label>`).join('')}</div></div>
    </form>
    <div class="panel stack" id="verdict" aria-live="polite">${verdictHtml()}</div>
  </div>`;
}

function calibration() {
  const by = new Map();
  for (const e of state.ledger) {
    if (e.kind === 'execution' || !e.outcome || typeof e.p !== 'number' || !e.approved) continue;
    const y = e.outcome.success ? 1 : 0;
    const s = by.get(e.agent) ?? { n: 0, sq: 0 };
    s.n += 1;
    s.sq += (e.p - y) ** 2;
    by.set(e.agent, s);
  }
  return [...by].map(([agent, s]) => ({ agent, n: s.n, brier: s.sq / s.n }));
}

function viewLedger() {
  const entries = [...state.ledger].sort((a, b) => b.seq - a.seq);
  const cal = calibration();
  return `
  <h1>Decision log</h1>
  <p class="sub">Every decision you make is chained to the one before it, so any later edit shows up as tampering. When a decision’s result is known, mark whether it worked; that scores how well each agent’s confidence matches reality.</p>
  <div class="notice ${state.chain.ok ? 'info' : 'bad'}" style="margin-bottom:16px">${state.chain.ok ? `Log intact: ${entries.length} entries, every link checks out.` : `The log has been altered at entry ${esc(state.chain.broken.join(', '))}. Treat those entries and everything after them as untrusted.`}</div>
  <div class="panel" style="margin-bottom:16px">
    <h2>Calibration</h2>
    ${cal.length ? `<div class="scroll"><table><tr><th>Agent</th><th class="num">Scored decisions</th><th class="num">Brier score</th><th>Reading</th></tr>${cal.map((c) => `<tr><td>${esc(agentTitle(c.agent))}</td><td class="num">${c.n}</td><td class="num">${c.brier.toFixed(3)}</td><td>${c.brier <= 0.1 ? 'Well calibrated' : c.brier <= 0.25 ? 'Better than a coin flip' : 'Worse than a coin flip'}</td></tr>`).join('')}</table></div>` : '<p class="muted">No scores yet. Mark the result of an approved decision to start scoring.</p>'}
  </div>
  <div class="panel">
    <h2>Entries</h2>
    ${entries.length ? `<div class="scroll"><table><tr><th>#</th><th>When</th><th>Request</th><th>Decision</th><th>Result</th></tr>${entries.map((e) => `<tr>
      <td class="mono">${e.seq}</td><td class="mono">${esc(when(e.at))}</td>
      <td>${esc(e.summary)}${e.example ? ' <span class="pill">Example</span>' : ''}<div class="muted">${esc(agentTitle(e.agent))} · ${tierChip(e.tier)}${typeof e.p === 'number' ? ` · ${pct(e.p)} confident` : ''}</div>${e.rationale ? `<div class="muted">“${esc(e.rationale)}”</div>` : ''}</td>
      <td>${e.kind === 'execution' ? (e.approved ? '<span class="pill ok">Ran</span>' : '<span class="pill warn">Run not completed</span>') : e.approved ? `<span class="pill ok">Approved${e.choice ? ` ${esc(e.choice)}` : ''}</span>` : '<span class="pill bad">Denied</span>'}</td>
      <td>${e.kind === 'execution' ? '<span class="muted">—</span>' : e.outcome ? (e.outcome.success ? '<span class="pill ok">Worked</span>' : '<span class="pill bad">Didn’t work</span>') : e.approved ? `<div class="row"><button data-outcome="1" data-entry="${esc(e.id)}" ${state.canWrite ? '' : 'disabled'}>Worked</button><button data-outcome="0" data-entry="${esc(e.id)}" ${state.canWrite ? '' : 'disabled'}>Didn’t</button></div>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</table></div>` : '<p class="muted">No decisions yet.</p>'}
  </div>`;
}

function rangeSvg(rows) {
  const vals = rows.flatMap((r) => [r.p10, r.p90, 0]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 520; const L = 52; const R = 16; const rowH = 34;
  const x = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const H = rows.length * rowH + 28;
  const ticks = [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ending cash range by scenario">
    <line x1="${x(0)}" x2="${x(0)}" y1="4" y2="${H - 22}" stroke="var(--line)" stroke-width="1"/>
    ${rows.map((r, i) => {
      const y = 14 + i * rowH;
      return `<text x="0" y="${y + 4}">${r.name}</text>
      <line x1="${x(r.p10)}" x2="${x(r.p90)}" y1="${y}" y2="${y}" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" opacity=".35"/>
      <circle cx="${x(r.p50)}" cy="${y}" r="5" fill="var(--accent)"/>`;
    }).join('')}
    ${ticks.map((t) => `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${money(t)}</text>`).join('')}
  </svg>`;
}

function financeResults() {
  const f = state.finance;
  const b = state.org.constitution.board;
  const ue = unitEconomics({ priceMonthly: num(f.ue.priceMonthly), grossMargin: num(f.ue.grossMargin), monthlyChurn: Math.max(0.001, num(f.ue.monthlyChurn, 0.15)), cac: num(f.ue.cac) });
  const rows = ['bear', 'base', 'bull'].map((name) => ({
    name,
    ...monteCarloRunway({ cash: num(f.mc.cash), mrr: num(f.mc.mrr), growthMean: num(f.mc[name]), growthSd: Math.max(0, num(f.mc.growthSd)), monthlyCosts: num(f.mc.monthlyCosts), floor: b.cash_floor_usd, runs: 4000 }),
  }));
  const pool = budgetSplit(b.monthly_burn_cap_usd, state.org.constitution.allocation_policy).growth;
  const arms = f.arms.filter((a) => a.id).map((a) => ({ id: a.id, successes: Math.max(0, num(a.successes)), failures: Math.max(0, num(a.failures)) }));
  const alloc = thompsonAllocate(arms, pool, { maxShare: state.org.constitution.allocation_policy.max_arm_share, minExploration: state.org.constitution.allocation_policy.min_exploration_share });
  return {
    ue: `<table><tr><td>Lifetime value</td><td class="num">${money(ue.ltv)}</td></tr><tr><td>Lifetime value ÷ acquisition cost</td><td class="num">${ue.ltvToCac.toFixed(2)}${ue.ltvToCac >= 3 ? ' <span class="pill ok">≥ 3</span>' : ' <span class="pill warn">&lt; 3</span>'}</td></tr><tr><td>Months to earn back acquisition cost</td><td class="num">${ue.paybackMonths.toFixed(1)}</td></tr><tr><td>Average customer life</td><td class="num">${ue.lifetimeMonths.toFixed(1)} months</td></tr></table>`,
    mc: `${rangeSvg(rows)}<div class="scroll"><table><tr><th>Scenario</th><th class="num">Low (P10)</th><th class="num">Median</th><th class="num">High (P90)</th><th class="num">Chance cash falls below ${money(b.cash_floor_usd)}</th></tr>${rows.map((r) => `<tr><td>${r.name}</td><td class="num">${money(r.p10)}</td><td class="num">${money(r.p50)}</td><td class="num">${money(r.p90)}</td><td class="num">${pct(r.probBelowFloor, 1)}</td></tr>`).join('')}</table></div>`,
    alloc: `<p class="muted" style="margin:0 0 8px">Growth pool: ${money(pool)} a month. No channel gets more than ${pct(state.org.constitution.allocation_policy.max_arm_share)}.</p>${Object.entries(alloc).map(([id, v]) => `<div style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><span>${esc(id)}</span><span class="mono">$${v.toFixed(2)}</span></div><div class="bar"><span style="width:${pool ? (v / pool) * 100 : 0}%"></span></div></div>`).join('')}`,
  };
}

function viewFinance() {
  const f = state.finance;
  const r = financeResults();
  const field = (group, key, label, step = 'any') => `<label class="field">${label}<input type="number" step="${step}" data-fin="${group}.${key}" value="${esc(f[group][key])}"></label>`;
  return `
  <h1>Finance</h1>
  <p class="sub">The starting numbers are illustrative, not your business data. Change any input and the results update.</p>
  <div class="split">
    <div class="panel stack"><h2>Featured-listing economics</h2>
      <div class="form">${field('ue', 'priceMonthly', 'Price per month (US$)')}${field('ue', 'grossMargin', 'Gross margin (0–1)')}${field('ue', 'monthlyChurn', 'Monthly cancellation rate (0–1)')}${field('ue', 'cac', 'Cost to win a sponsor (US$)')}</div>
      <div class="scroll" id="fin-ue">${r.ue}</div></div>
    <div class="panel stack"><h2>Growth budget by channel</h2>
      <div class="scroll"><table><tr><th>Channel</th><th class="num">Wins</th><th class="num">Misses</th></tr>${f.arms.map((a, i) => `<tr><td><input data-arm="${i}.id" value="${esc(a.id)}" aria-label="Channel name"></td><td><input type="number" min="0" data-arm="${i}.successes" value="${esc(a.successes)}" aria-label="Wins"></td><td><input type="number" min="0" data-arm="${i}.failures" value="${esc(a.failures)}" aria-label="Misses"></td></tr>`).join('')}</table></div>
      <div id="fin-alloc">${r.alloc}</div></div>
  </div>
  <div class="panel stack" style="margin-top:16px"><h2>Cash in 12 months</h2>
    <div class="form">${field('mc', 'cash', 'Cash today (US$)')}${field('mc', 'mrr', 'Monthly revenue (US$)')}${field('mc', 'monthlyCosts', 'Monthly costs (US$)')}${field('mc', 'growthSd', 'Growth volatility')}${field('mc', 'bear', 'Bear growth / month')}${field('mc', 'base', 'Base growth / month')}${field('mc', 'bull', 'Bull growth / month')}</div>
    <div id="fin-mc">${r.mc}</div></div>`;
}

function viewControls() {
  const c = state.controls;
  const levels = state.org.policy.kill_switch_levels;
  const words = { freeze_external: 'Stops every outward action: emails, posts, ads, discounts, refunds.', freeze_spend: 'Stops every action that spends money.', full_stop: 'Stops everything except reading and drafting.' };
  return `
  <h1>Kill switches</h1>
  <p class="sub">You can trigger or release any switch. Agents are checked against these the moment they change.</p>
  <div class="grid">${['L2', 'L3', 'L4'].map((l) => {
    const on = c.levels.includes(l);
    return `<div class="panel stack">
      <div class="row" style="justify-content:space-between"><span class="label">${l}</span>${on ? '<span class="pill bad">Active</span>' : '<span class="pill ok">Off</span>'}</div>
      <h2 style="margin:0">${esc(levels[l].effect.replaceAll('_', ' '))}</h2>
      <p class="muted" style="margin:0">${words[levels[l].effect]}</p>
      <label class="field">Reason<input id="reason-${l}" placeholder="Why"></label>
      <button class="${on ? '' : 'danger'}" data-switch="${l}" data-on="${on ? 1 : 0}" ${state.canWrite ? '' : 'disabled'}>${on ? `Release ${l}` : `Trigger ${l}`}</button></div>`;
  }).join('')}</div>
  <div class="panel" style="margin-top:16px"><h2>Pause one agent (L1)</h2>
    <div class="scroll"><table><tr><th>Agent</th><th>Status</th><th></th></tr>${[...state.org.agents.values()].map((a) => {
      const paused = c.paused.includes(a.id);
      return `<tr><td>${esc(a.title)}</td><td>${paused ? '<span class="pill bad">Paused</span>' : '<span class="pill ok">Running</span>'}</td><td class="num"><button data-pause="${esc(a.id)}" data-on="${paused ? 1 : 0}" ${state.canWrite ? '' : 'disabled'}>${paused ? 'Resume' : 'Pause'}</button></td></tr>`;
    }).join('')}</table></div></div>
  <div class="panel" style="margin-top:16px"><h2>History</h2>
    ${c.log.length ? `<div class="scroll"><table><tr><th>When</th><th>Change</th><th>Reason</th></tr>${[...c.log].reverse().map((e) => `<tr><td class="mono">${esc(when(e.at))}</td><td>${esc(e.action)} ${esc(e.level)}${e.target ? ` on ${esc(agentTitle(e.target))}` : ''}</td><td>${esc(e.reason || '—')}</td></tr>`).join('')}</table></div>` : '<p class="muted">No switches have been used.</p>'}</div>`;
}

function serverStatus(name) {
  if (!state.mcp) return { label: 'Unavailable here', cls: '' };
  if (!state.servers) return { label: 'Checking…', cls: '' };
  const s = state.servers.find((x) => x.server === name);
  if (!s) return { label: 'Not connected', cls: 'warn' };
  if (s.authStatus === 'needs_reauth') return { label: 'Needs reconnecting', cls: 'bad' };
  return { label: s.authStatus === 'connected' ? 'Connected' : 'Available', cls: 'ok' };
}

function executionBlock(r) {
  const ex = r.execution;
  if (!ex || typeof ex !== 'object') return '';
  const spec = ACTIONS[ex.kind];
  if (!spec) return `<div class="notice bad">Unknown action “${esc(ex.kind)}”. It can’t run.</div>`;
  const params = ex.params && typeof ex.params === 'object' ? ex.params : {};
  const errors = spec.validate(params);
  if (errors.length) return `<div class="notice bad">This action is malformed and can’t run: ${esc(errors.join('; '))}.</div>`;
  const conn = CONNECTORS[spec.connector];
  const st = serverStatus(conn.server);
  const rows = spec.describe(params).map(([k, v]) => `<tr><th style="width:30%">${esc(k)}</th><td style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(v)}</td></tr>`).join('');
  const compliance = r.action?.compliance?.status;
  const run = r.run ?? {};
  const plan = executionPlan(state.org, controlsObj(), state.cfg, r);
  const busy = state.running.has(r.id) || run.state === 'running';
  let runUi = '';
  if (run.state === 'done') {
    runUi = `<div class="notice info">${esc(run.summary ?? 'Done.')}${run.url ? ` <a href="${esc(run.url)}" target="_blank" rel="noopener">Open</a>` : ''}<div class="muted">${esc(when(run.finishedAt ?? run.settledAt))}</div></div>`;
  } else if (run.state === 'needs_confirmation') {
    runUi = `<div class="notice">${esc(run.summary)} ${run.url ? `<a href="${esc(run.url)}" target="_blank" rel="noopener">Open Stripe</a>` : ''}
      <div class="row" style="margin-top:8px"><input id="token-${esc(r.id)}" placeholder="Approval token from Stripe" style="max-width:280px">
      <button data-finish="${esc(r.id)}" ${state.canWrite ? '' : 'disabled'}>Finish run</button>
      <button data-settle="${esc(r.id)}" data-done="0" ${state.canWrite ? '' : 'disabled'}>Abandon</button></div></div>`;
  } else if (run.state === 'unknown') {
    runUi = `<div class="notice bad">The last run may or may not have gone through (${esc(run.code)}). Check ${esc(conn.label)} first, then record what happened.
      <div class="row" style="margin-top:8px"><button data-settle="${esc(r.id)}" data-done="1" ${state.canWrite ? '' : 'disabled'}>It went through</button>
      <button data-settle="${esc(r.id)}" data-done="0" ${state.canWrite ? '' : 'disabled'}>It didn’t</button></div></div>`;
  } else if (runnable(r)) {
    runUi = `${run.state === 'failed' ? `<div class="notice bad">Last run failed: ${esc(run.error ?? run.code)}${run.help ? `. Fix: ${esc(run.help)}` : ''}.</div>` : ''}
      ${plan.ok
        ? `<button class="primary" data-run="${esc(r.id)}" ${busy || !state.canWrite || !state.mcp ? 'disabled' : ''}>${busy ? 'Running…' : `Run in ${esc(conn.label)}`}</button>${state.mcp ? '' : ' <span class="muted">Open the published app to run actions.</span>'}`
        : `<div class="muted">Can’t run yet: ${esc(plan.reasons.join('; '))}.</div>`}`;
  }
  return `<div class="panel" style="background:var(--sunk);padding:12px">
    <div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="label">What will run · ${esc(spec.label)}</span><span class="pill ${st.cls}">${esc(conn.label)}: ${esc(st.label)}</span></div>
    <div class="scroll"><table>${rows}</table></div>
    ${compliance ? `<div class="muted" style="margin-top:6px">Compliance: ${esc(compliance)}</div>` : ''}
    ${runUi ? `<div style="margin-top:10px">${runUi}</div>` : ''}
  </div>`;
}

function viewConnections() {
  const cfg = state.cfg;
  const card = (key, body) => {
    const conn = CONNECTORS[key];
    const st = serverStatus(conn.server);
    const actions = Object.values(ACTIONS).filter((a) => a.connector === key).map((a) => a.label);
    return `<div class="panel stack">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(conn.label)}</h2><span class="pill ${st.cls}">${esc(st.label)}</span></div>
      <div class="muted">Can: ${esc(actions.join(' · '))}</div>${body}</div>`;
  };
  const stripeBody = `
    <div>${cfg.stripe.account ? `Using <strong>${esc(cfg.stripe.name || cfg.stripe.account)}</strong> <span class="mono">${esc(cfg.stripe.account)}</span>${cfg.stripe.livemode ? ' <span class="pill warn">Live money</span>' : ' <span class="pill">Test mode</span>'}` : '<span class="pill warn">No account chosen. Stripe actions won’t run until you pick one.</span>'}</div>
    ${state.stripeAccounts
      ? `<label class="field">Account<select id="stripe-account">${state.stripeAccounts.map((a) => `<option value="${esc(a.id)}" ${a.id === cfg.stripe.account ? 'selected' : ''}>${esc(a.name)} · ${esc(a.id)}${a.livemode ? ' (live)' : ' (test)'}</option>`).join('')}</select></label>
         <div class="row"><button class="primary" data-conn="stripe-save" ${state.canWrite ? '' : 'disabled'}>Use this account</button></div>`
      : `<div class="row"><button data-conn="stripe-load" ${state.mcp ? '' : 'disabled'}>Load my Stripe accounts</button></div>`}`;
  const linearBody = `
    <label class="field">Team that gets new tasks<input id="linear-team" value="${esc(cfg.linear.team)}" placeholder="Team name or key"></label>
    <div class="row"><button class="primary" data-conn="linear-save" ${state.canWrite ? '' : 'disabled'}>Save</button></div>`;
  return `
  <h1>Connections</h1>
  <p class="sub">Approved actions run through your own claude.ai connectors, with your permission each time a connector is first used. Nothing here stores passwords or keys.</p>
  ${state.mcp ? '' : '<div class="notice" style="margin-bottom:16px">Connectors are only available in the published app.</div>'}
  <div class="row" style="margin-bottom:16px"><button data-conn="refresh" ${state.mcp ? '' : 'disabled'}>Check connections</button></div>
  <div class="grid">
    ${card('gmail', '<div class="muted">No setup needed. Emails go out from the Gmail account connected to claude.ai.</div>')}
    ${card('stripe', stripeBody)}
    ${card('hubspot', '<div class="muted">No setup needed. Your click to run counts as the confirmation HubSpot requires.</div>')}
    ${card('linear', linearBody)}
  </div>
  <div class="panel" style="margin-top:16px"><h2>How an action reaches a connector</h2>
    <ol class="reasons"><li>An agent files the action. Its details are checked and the policy decides: allowed, needs your approval, or refused (refused actions never reach you).</li>
    <li>You approve it. Your approval is pinned to exactly what you saw.</li>
    <li>When you press Run, everything is checked again: kill switches, approvals, setup, and that it hasn’t already run.</li>
    <li>The connector runs it once, and the result goes in the decision log.</li></ol></div>`;
}

// ---------- render & events ----------
function currentView() {
  const h = location.hash.slice(1);
  return VIEWS.some(([id]) => id === h) ? h : 'overview';
}

function render() {
  if (!state.org) return;
  const v = currentView();
  $('#status-pills').innerHTML = statusPills();
  $('#tabs').innerHTML = tabsHtml(v);
  const body = { overview: viewOverview, approvals: viewApprovals, org: viewOrg, policy: viewPolicy, ledger: viewLedger, finance: viewFinance, controls: viewControls, connections: viewConnections }[v]();
  // Live data re-renders the view; keep what the viewer was typing or had selected.
  const root = $('#view');
  const focusedId = document.activeElement?.id;
  const typed = [...root.querySelectorAll('textarea[id], input[id]:not([type=checkbox])')].map((el) => [el.id, el.value]);
  const picked = [...root.querySelectorAll('input[type=radio]:checked')].map((el) => [el.name, el.value]);
  root.innerHTML = banners() + body;
  for (const [id, value] of typed) { const el = document.getElementById(id); if (el && !el.disabled) el.value = value; }
  for (const [name, value] of picked) {
    const el = [...root.querySelectorAll('input[type=radio]')].find((r) => r.name === name && r.value === value);
    if (el && !el.disabled) el.checked = true;
  }
  if (focusedId) document.getElementById(focusedId)?.focus();
}

function readSandbox() {
  const s = state.sandbox;
  s.agent = $('#sb-agent').value;
  s.type = $('#sb-type').value;
  s.spendUsd = $('#sb-spend').value;
  s.discount = $('#sb-discount').value;
  s.commitmentMonths = $('#sb-months').value;
  s.author = $('#sb-author').value;
  s.compliance = $('#sb-compliance').checked;
  s.untrusted = $('#sb-untrusted').checked;
  s.verified = $('#sb-verified').checked;
  s.assumeConfirmed = $('#sb-assume').checked;
  s.approvals = [...document.querySelectorAll('[data-approver]')].filter((i) => i.checked).map((i) => i.dataset.approver);
  $('#verdict').innerHTML = verdictHtml();
}

let finTimer;
function onFinanceInput(t) {
  if (t.dataset.fin) {
    const [g, k] = t.dataset.fin.split('.');
    state.finance[g][k] = t.value;
  } else if (t.dataset.arm) {
    const [i, k] = t.dataset.arm.split('.');
    state.finance.arms[Number(i)][k] = t.value;
  }
  clearTimeout(finTimer);
  finTimer = setTimeout(() => {
    const r = financeResults();
    $('#fin-ue').innerHTML = r.ue;
    $('#fin-mc').innerHTML = r.mc;
    $('#fin-alloc').innerHTML = r.alloc;
  }, 200);
}

async function toggleSwitch(level, on, reason, target) {
  const c = controlsObj();
  try {
    if (on) c.release(level, 'board', { target }); else c.trigger(level, 'board', { target, reason });
  } catch (e) {
    state.writeError = e.message;
    render();
    return;
  }
  const s = c.toState();
  const log = [...state.controls.log, { at: new Date().toISOString(), level, action: on ? 'Released' : 'Triggered', target: target ?? null, reason: reason ?? '' }];
  await saveControls({ ...s, log });
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.filter) { state.approvalFilter = t.dataset.filter; render(); return; }
  if (t.dataset.agent) { state.selectedAgent = t.dataset.agent; render(); return; }
  if (t.dataset.act) {
    const req = state.requests.find((r) => r.id === t.dataset.id);
    if (!req || !(req.status === 'pending' || (req.status === 'ready' && t.dataset.act === 'deny'))) return;
    const choice = document.querySelector(`input[name="opt-${CSS.escape(req.id)}"]:checked`)?.value ?? null;
    const rationale = document.getElementById(`why-${req.id}`)?.value.trim() ?? '';
    const approved = t.dataset.act === 'approve';
    if (approved && !choice) { state.writeError = 'Choose an option before approving.'; render(); return; }
    t.disabled = true;
    await decideRequest(req, { approved, choice: approved ? choice : null, rationale });
    return;
  }
  if (t.dataset.run) {
    const req = state.requests.find((r) => r.id === t.dataset.run);
    if (req) await runRequest(req);
    return;
  }
  if (t.dataset.finish) {
    const req = state.requests.find((r) => r.id === t.dataset.finish);
    const token = document.getElementById(`token-${t.dataset.finish}`)?.value.trim();
    if (req && token) await runRequest(req, { approvalToken: token });
    return;
  }
  if (t.dataset.settle) {
    const req = state.requests.find((r) => r.id === t.dataset.settle);
    if (req) { t.disabled = true; await settleRun(req, t.dataset.done === '1'); }
    return;
  }
  if (t.dataset.conn === 'refresh') { await refreshServers(); return; }
  if (t.dataset.conn === 'stripe-load') {
    try {
      const res = await state.mcp.callTool('Stripe', 'list_available_accounts_or_orgs', {}, { cache: false });
      const accounts = Array.isArray(res?.payload?.accounts) ? res.payload.accounts : [];
      state.stripeAccounts = accounts.filter((a) => typeof a.stripe_context === 'string').map((a) => ({ id: a.stripe_context, name: String(a.name ?? a.stripe_context), livemode: a.livemode !== false }));
    } catch (e) {
      state.writeError = `Couldn’t list Stripe accounts: ${CONNECTOR_HELP[e?.code] ?? e?.message ?? 'unknown error'}.`;
    }
    render();
    return;
  }
  if (t.dataset.conn === 'stripe-save') {
    const id = $('#stripe-account')?.value;
    const acct = state.stripeAccounts?.find((a) => a.id === id);
    if (acct) await saveCfg({ ...state.cfg, stripe: { account: acct.id, livemode: acct.livemode, name: acct.name } });
    return;
  }
  if (t.dataset.conn === 'linear-save') {
    const team = $('#linear-team')?.value.trim() ?? '';
    await saveCfg({ ...state.cfg, linear: { team } });
    return;
  }
  if (t.dataset.outcome) {
    const e = state.ledger.find((x) => x.id === t.dataset.entry);
    if (e && !e.outcome) { t.disabled = true; await recordOutcome(e, t.dataset.outcome === '1'); }
    return;
  }
  if (t.dataset.switch) {
    t.disabled = true;
    await toggleSwitch(t.dataset.switch, t.dataset.on === '1', $(`#reason-${t.dataset.switch}`)?.value.trim());
    return;
  }
  if (t.dataset.pause) {
    t.disabled = true;
    await toggleSwitch('L1', t.dataset.on === '1', '', t.dataset.pause);
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.closest('#sandbox')) readSandbox();
  else if (t.dataset.fin || t.dataset.arm) onFinanceInput(t);
});
document.addEventListener('change', (ev) => {
  if (ev.target.closest('#sandbox')) readSandbox();
});
document.addEventListener('submit', (ev) => ev.preventDefault());
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- boot ----------
(async () => {
  try {
    const res = await fetch('org.json');
    if (!res.ok) throw new Error(`org.json returned ${res.status}`);
    state.org = orgFromBundle(await res.json());
    state.orgErrors = validateOrg(state.org);
  } catch (e) {
    $('#view').innerHTML = `<div class="notice bad">The organization config couldn’t be loaded (${esc(e.message)}).</div>`;
    return;
  }
  render();
  connect().catch(() => finishLocal());
})();
