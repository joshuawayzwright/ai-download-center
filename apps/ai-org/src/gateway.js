// Tool gateway: the only path from an agent's intent to a real-world tool call.
// Pure code (no Node or browser APIs), shared by the CLI and the Board Console.
//
//   validate params -> map to a policy action -> evaluate() -> request (pending | ready)
//   -> Board decision -> executionPlan() re-checks everything at run time -> connector call
//
// Calls go through the viewer's claude.ai connectors (display names below), so nothing here
// holds credentials.
import { evaluate } from './policy.js';

export const CONNECTORS = {
  gmail: { server: 'Gmail', label: 'Gmail', tools: ['create_draft', 'send_message'] },
  stripe: { server: 'Stripe', label: 'Stripe', tools: ['stripe_api_write', 'list_available_accounts_or_orgs'] },
  hubspot: { server: 'HubSpot', label: 'HubSpot', tools: ['manage_crm_objects'] },
  linear: { server: 'Linear', label: 'Linear', tools: ['save_issue'] },
};

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[A-Za-z]{2,}$/;
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);

function checkEmails(list, field, errors, { required = false } = {}) {
  if (list === undefined) { if (required) errors.push(`${field} is required`); return; }
  if (!Array.isArray(list) || (required && list.length === 0)) { errors.push(`${field} must be a non-empty list of addresses`); return; }
  if (list.length > 20) errors.push(`${field} has more than 20 addresses`);
  for (const a of list) if (typeof a !== 'string' || !EMAIL.test(a)) errors.push(`${field}: "${a}" is not a plain email address`);
}

function checkEmailBody(p, errors) {
  checkEmails(p.to, 'to', errors, { required: true });
  checkEmails(p.cc, 'cc', errors);
  if (!str(p.subject) || p.subject.length > 200) errors.push('subject is required (at most 200 characters)');
  if (!str(p.body) || p.body.length > 20000) errors.push('body is required (plain text, at most 20,000 characters)');
}

const emailInput = (p) => ({ to: p.to, ...(p.cc?.length ? { cc: p.cc } : {}), subject: p.subject, body: p.body });

/**
 * The action catalog. Each entry:
 *  connector   key in CONNECTORS
 *  policyType  action type in org/policy.json
 *  validate(p) -> string[]           parameter errors
 *  policy(p)   -> extra policy fields (spendUsd, discount)
 *  call(p, cfg, requestId) -> {server, tool, input}
 *  describe(p) -> [label, value][]   what the Board sees before it runs
 *  setup(cfg)  -> string[]           missing connector configuration
 */
export const ACTIONS = {
  'email.draft': {
    label: 'Save an email draft in Gmail',
    connector: 'gmail',
    policyType: 'save_email_draft',
    validate(p) { const e = []; checkEmailBody(p, e); return e; },
    policy: () => ({}),
    call: (p) => ({ server: CONNECTORS.gmail.server, tool: 'create_draft', input: emailInput(p) }),
    describe: (p) => [['To', p.to.join(', ')], ...(p.cc?.length ? [['Cc', p.cc.join(', ')]] : []), ['Subject', p.subject], ['Body', p.body]],
    setup: () => [],
  },
  'email.send': {
    label: 'Send an email from Gmail',
    connector: 'gmail',
    policyType: 'external_comm',
    validate(p) { const e = []; checkEmailBody(p, e); return e; },
    policy: () => ({}),
    call: (p) => ({ server: CONNECTORS.gmail.server, tool: 'send_message', input: emailInput(p) }),
    describe: (p) => [['To', p.to.join(', ')], ...(p.cc?.length ? [['Cc', p.cc.join(', ')]] : []), ['Subject', p.subject], ['Body', p.body]],
    setup: () => [],
  },
  'stripe.coupon': {
    label: 'Create a Stripe coupon',
    connector: 'stripe',
    policyType: 'discount',
    validate(p) {
      const e = [];
      if (typeof p.percent_off !== 'number' || !(p.percent_off > 0 && p.percent_off <= 100)) e.push('percent_off must be a number above 0 and at most 100');
      if (!['once', 'repeating', 'forever'].includes(p.duration)) e.push('duration must be once, repeating or forever');
      if (p.duration === 'repeating' && !(isInt(p.duration_in_months) && p.duration_in_months > 0 && p.duration_in_months <= 36)) e.push('duration_in_months must be a whole number from 1 to 36 when duration is repeating');
      if (p.duration !== 'repeating' && p.duration_in_months !== undefined) e.push('duration_in_months is only allowed when duration is repeating');
      if (p.max_redemptions !== undefined && !(isInt(p.max_redemptions) && p.max_redemptions > 0)) e.push('max_redemptions must be a positive whole number');
      if (!str(p.name) || p.name.length > 40) e.push('name is required (at most 40 characters; customers see it)');
      return e;
    },
    policy: (p) => ({ discount: p.percent_off / 100 }),
    call: (p, cfg, requestId) => ({
      server: CONNECTORS.stripe.server,
      tool: 'stripe_api_write',
      input: {
        stripe_api_operation_id: 'PostCoupons',
        stripe_context: cfg.stripe.account,
        livemode: cfg.stripe.livemode !== false,
        parameters: {
          percent_off: p.percent_off,
          duration: p.duration,
          ...(p.duration === 'repeating' ? { duration_in_months: p.duration_in_months } : {}),
          ...(p.max_redemptions ? { max_redemptions: p.max_redemptions } : {}),
          name: p.name,
          metadata: { org_request_id: requestId },
        },
      },
    }),
    describe: (p) => [['Discount', `${p.percent_off}% off`], ['Applies', p.duration === 'repeating' ? `for ${p.duration_in_months} months` : p.duration], ['Uses', p.max_redemptions ? `at most ${p.max_redemptions}` : 'unlimited'], ['Name customers see', p.name]],
    setup: (cfg) => (cfg.stripe?.account ? [] : ['choose which Stripe account to use']),
  },
  'stripe.refund': {
    label: 'Refund a Stripe payment',
    connector: 'stripe',
    policyType: 'refund',
    validate(p) {
      const e = [];
      if (typeof p.payment_intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(p.payment_intent)) e.push('payment_intent must be a Stripe PaymentIntent id (pi_...)');
      if (p.amount !== undefined && !(isInt(p.amount) && p.amount > 0)) e.push('amount must be a positive whole number of cents, or omitted for a full refund');
      if (p.amount === undefined && !(typeof p.full_amount_usd === 'number' && p.full_amount_usd > 0)) e.push('a full refund must state full_amount_usd so the spending limits can be checked');
      if (!['duplicate', 'fraudulent', 'requested_by_customer'].includes(p.reason)) e.push('reason must be duplicate, fraudulent or requested_by_customer');
      return e;
    },
    policy: (p) => ({ spendUsd: p.amount !== undefined ? p.amount / 100 : p.full_amount_usd }),
    call: (p, cfg, requestId) => ({
      server: CONNECTORS.stripe.server,
      tool: 'stripe_api_write',
      input: {
        stripe_api_operation_id: 'PostRefunds',
        stripe_context: cfg.stripe.account,
        livemode: cfg.stripe.livemode !== false,
        parameters: { payment_intent: p.payment_intent, ...(p.amount !== undefined ? { amount: p.amount } : {}), reason: p.reason, metadata: { org_request_id: requestId } },
      },
    }),
    describe: (p) => [['Payment', p.payment_intent], ['Amount', p.amount !== undefined ? `$${(p.amount / 100).toFixed(2)}` : `full payment ($${p.full_amount_usd.toFixed(2)})`], ['Reason', p.reason.replaceAll('_', ' ')]],
    setup: (cfg) => (cfg.stripe?.account ? [] : ['choose which Stripe account to use']),
  },
  'crm.update': {
    label: 'Update a HubSpot record',
    connector: 'hubspot',
    policyType: 'update_crm',
    validate(p) {
      const e = [];
      if (!['contacts', 'companies', 'deals', 'tickets'].includes(p.objectType)) e.push('objectType must be contacts, companies, deals or tickets');
      if (!(isInt(p.objectId) && p.objectId > 0)) e.push('objectId must be a HubSpot record id (a positive whole number)');
      const props = p.properties;
      if (!props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).length === 0) e.push('properties must name at least one property to change');
      else {
        if (Object.keys(props).length > 20) e.push('at most 20 properties per update');
        for (const [k, v] of Object.entries(props)) {
          if (!/^[a-z0-9_]{1,100}$/.test(k)) e.push(`property name "${k}" is not a HubSpot internal name`);
          if (typeof v !== 'string') e.push(`property ${k} must be a string value`);
        }
      }
      return e;
    },
    policy: () => ({}),
    call: (p) => ({
      server: CONNECTORS.hubspot.server,
      tool: 'manage_crm_objects',
      // The Board's click in the console is the explicit human confirmation HubSpot requires.
      input: { confirmationStatus: 'CONFIRMED', updateRequest: { objects: [{ objectType: p.objectType, objectId: p.objectId, properties: p.properties }] } },
    }),
    describe: (p) => [['Record', `${p.objectType} #${p.objectId}`], ...Object.entries(p.properties).map(([k, v]) => [`Set ${k}`, v])],
    setup: () => [],
  },
  'task.create': {
    label: 'Create a Linear task',
    connector: 'linear',
    policyType: 'create_task',
    validate(p) {
      const e = [];
      if (!str(p.title) || p.title.length > 200) e.push('title is required (at most 200 characters)');
      if (p.description !== undefined && (typeof p.description !== 'string' || p.description.length > 20000)) e.push('description must be text (at most 20,000 characters)');
      if (p.priority !== undefined && ![0, 1, 2, 3, 4].includes(p.priority)) e.push('priority must be 0 (none) to 4 (low)');
      return e;
    },
    policy: () => ({}),
    call: (p, cfg) => ({
      server: CONNECTORS.linear.server,
      tool: 'save_issue',
      input: { team: cfg.linear.team, title: p.title, ...(p.description ? { description: p.description } : {}), ...(p.priority !== undefined ? { priority: p.priority } : {}) },
    }),
    describe: (p) => [['Title', p.title], ...(p.description ? [['Description', p.description]] : []), ...(p.priority !== undefined ? [['Priority', ['none', 'urgent', 'high', 'medium', 'low'][p.priority]]] : [])],
    setup: (cfg) => (str(cfg.linear?.team) ? [] : ['name the Linear team that gets new tasks']),
  },
};

export const RUN_OPTION = 'run';

/** Key-order-independent JSON, used to pin exactly what the Board approved. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** Validate an action and map it to a policy action. */
export function policyActionFor({ agent, kind, params = {}, author, compliance, untrustedTrigger, verified, approvals = [] }) {
  const spec = ACTIONS[kind];
  if (!spec) return { errors: [`unknown action ${kind}; known: ${Object.keys(ACTIONS).join(', ')}`] };
  const errors = spec.validate(params);
  if (errors.length) return { errors };
  const action = { agent, type: spec.policyType, ...spec.policy(params), approvals };
  if (author) action.author = author;
  if (compliance) action.compliance = compliance;
  if (untrustedTrigger) { action.untrustedTrigger = true; action.verified = Boolean(verified); }
  return { errors: [], action };
}

/**
 * Turn an agent's intent into a Board Console request document.
 * Denied or invalid intents throw: they never reach the Board.
 */
export function buildRequest(org, controls, intent, { id, now = new Date(), deadline, confidence = 0.5, evidence = [], subject, body } = {}) {
  if (!id || !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) throw new Error('request id must be 1-200 letters, digits or _ - . ~ : @ +');
  if (!org.agents.has(intent.agent)) throw new Error(`unknown agent ${intent.agent}`);
  const { errors, action } = policyActionFor(intent);
  if (errors.length) throw new Error(`invalid ${intent.kind}: ${errors.join('; ')}`);
  const verdict = evaluate(org, controls, action);
  if (verdict.decision === 'deny') throw new Error(`policy denies this action: ${verdict.reasons.at(-1)}`);
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error('requests need at least one piece of evidence');
  const spec = ACTIONS[intent.kind];
  const due = deadline ?? new Date(now.getTime() + 3 * 86_400_000).toISOString();
  return {
    type: 'decision_request',
    from: intent.agent,
    to: ['board'],
    tier: verdict.tier,
    subject: subject ?? spec.label,
    ...(body ? { body } : {}),
    options: [{ id: RUN_OPTION, summary: `${spec.label} as described` }],
    recommendation: RUN_OPTION,
    confidence,
    evidence,
    deadline: due,
    action,
    execution: { kind: intent.kind, params: intent.params },
    approvals: action.approvals,
    status: verdict.decision === 'allow' ? 'ready' : 'pending',
    createdAt: now.toISOString(),
  };
}

/**
 * Re-check a request immediately before running it. Everything that can change between filing and
 * running (kill switches, approvals, connector setup, the request's own state) is checked here.
 * @returns {{ok:boolean, reasons:string[], call?:{server,tool,input}, describe?:[string,string][]}}
 */
export function executionPlan(org, controls, cfg, request) {
  const reasons = [];
  const ex = request?.execution;
  const spec = ex && ACTIONS[ex.kind];
  if (!spec) return { ok: false, reasons: ['this request has nothing to run'] };
  if (request.run?.state === 'done') reasons.push('it has already run');
  if (request.run?.state === 'unknown') reasons.push('a previous run may have gone through; check the connector before running again');
  if (request.run?.state === 'running') reasons.push('it is running now');
  if (request.run?.state === 'needs_confirmation') reasons.push('it is waiting for you to confirm it in Stripe');
  const approved = request.status === 'approved' && request.choice === RUN_OPTION;
  if (!approved && request.status !== 'ready') reasons.push(request.status === 'pending' ? 'it needs your approval first' : 'it was not approved to run');
  if (approved && request.approvedExecution !== canonical(ex)) reasons.push('the action changed after you approved it; it needs a fresh approval');

  const intent = {
    agent: request.action?.agent ?? request.from,
    kind: ex.kind,
    params: ex.params,
    author: request.action?.author,
    compliance: request.action?.compliance,
    untrustedTrigger: request.action?.untrustedTrigger,
    verified: request.action?.verified,
    approvals: [...new Set([...(Array.isArray(request.approvals) ? request.approvals : []), ...(approved ? ['board'] : [])])],
  };
  const { errors, action } = policyActionFor(intent);
  if (errors.length) return { ok: false, reasons: [...reasons, ...errors] };
  const verdict = evaluate(org, controls, action);
  if (verdict.decision !== 'allow') reasons.push(verdict.decision === 'deny' ? verdict.reasons.at(-1) : `still needs approval from ${verdict.missing.join(', ')}`);
  for (const m of spec.setup(cfg ?? {})) reasons.push(`connector setup: ${m}`);
  if (reasons.length) return { ok: false, reasons, describe: spec.describe(ex.params) };
  return { ok: true, reasons: [], call: spec.call(ex.params, cfg, request.id), describe: spec.describe(ex.params), verdict };
}

/** Short, human-readable outcome from a connector payload, plus any id or link worth keeping. */
export function summarizeResult(kind, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const pick = (...keys) => keys.map((k) => p[k]).find((v) => typeof v === 'string' && v.length > 0);
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  const approvalUrl = (text.match(/https:\/\/[^\s"'<>]*approv[^\s"'<>]*/i) ?? [])[0];
  const out = { id: pick('id', 'identifier') ?? null, url: pick('viewUrl', 'url') ?? approvalUrl ?? null, needsApproval: Boolean(approvalUrl) };
  out.summary = out.needsApproval
    ? 'Stripe asked for confirmation before it will run this. Open the link, approve it, then mark the run done.'
    : `${ACTIONS[kind]?.label ?? kind}: done${out.id ? ` (${out.id})` : ''}`;
  return out;
}
