#!/usr/bin/env node
// Offline operator SQL plans only. This file has no network or credential access.
const PROJECT_REF = 'tymayhazawkofmiypeqt';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['inspect', 'grant', 'renew', 'block'];

class PlanError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const reject = code => { throw new PlanError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const literal = value => "E'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

function timestamp(value) {
  if (typeof value !== 'string') reject('invalid_utc_timestamp');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) reject('invalid_utc_timestamp');
  const second = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const date = new Date(second);
  if (!Number.isFinite(date.getTime()) || Number(match[1]) < 1 || date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3]) ||
      date.getUTCHours() !== Number(match[4]) || date.getUTCMinutes() !== Number(match[5]) ||
      date.getUTCSeconds() !== Number(match[6])) reject('invalid_utc_timestamp');
  // Keep the original literal: Date.toISOString would discard PostgreSQL's
  // microseconds and make exact prior-state comparisons unreliable.
  return { value, micros: BigInt(date.getTime()) * 1000n + BigInt((match[7] || '').padEnd(6, '0')) };
}

function validate(input, now) {
  if (!object(input)) reject('invalid_input');
  if (input.projectRef !== PROJECT_REF) reject('wrong_project');
  if (!ACTIONS.includes(input.action)) reject('invalid_action');
  const mode = input.mode === undefined ? 'dry-run' : input.mode;
  if (!['dry-run', 'apply'].includes(mode)) reject('invalid_mode');
  if (typeof input.userId !== 'string' || !UUID.test(input.userId)) reject('invalid_user_id');
  const edit = ['grant', 'renew'].includes(input.action);
  const fields = ['projectRef', 'userId', 'action', 'mode',
    ...(edit ? ['expectedEmail', 'expiresAt', 'expectedMembership'] : [])];
  if (Object.keys(input).some(key => !fields.includes(key))) reject('unexpected_field');
  const plan = { action: input.action, mode, userId: input.userId.toLowerCase() };
  if (!edit) return plan;

  if (typeof input.expectedEmail !== 'string' || input.expectedEmail.length > 254 ||
      /[\x00-\x1f\x7f]/.test(input.expectedEmail) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.expectedEmail.trim())) reject('invalid_expected_email');
  plan.email = input.expectedEmail.trim().toLowerCase();
  const nowMs = typeof now === 'function' ? now() : now;
  if (!Number.isSafeInteger(nowMs)) reject('invalid_clock');
  plan.expiry = timestamp(input.expiresAt);
  if (plan.expiry.micros <= BigInt(nowMs) * 1000n) reject('expiry_not_future');
  if (!Object.hasOwn(input, 'expectedMembership')) reject('expected_membership_required');
  if (input.expectedMembership === null) {
    if (input.action !== 'grant') reject('renew_requires_unblocked_member');
    plan.previous = null;
  } else {
    const prior = input.expectedMembership;
    if (!object(prior) || Object.keys(prior).length !== 2 ||
        !Object.hasOwn(prior, 'blocked') || !Object.hasOwn(prior, 'expiresAt') ||
        typeof prior.blocked !== 'boolean') reject('invalid_expected_membership');
    plan.previous = { blocked: prior.blocked, expiry: timestamp(prior.expiresAt) };
    if (input.action === 'grant' && !prior.blocked) reject('grant_requires_absent_or_blocked_member');
    if (input.action === 'renew' && prior.blocked) reject('renew_requires_unblocked_member');
    if (input.action === 'renew' && plan.expiry.micros <= plan.previous.expiry.micros) reject('renew_must_extend_expiry');
  }
  return plan;
}

function stateJSON(alias) {
  return `jsonb_build_object('blocked', ${alias}.blocked, 'expiresAt',
    to_char(${alias}.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`;
}

function generatePlan(input, { now = Date.now } = {}) {
  const plan = validate(input, now);
  const id = literal(plan.userId) + '::uuid';
  const prefix = `-- SOLO membership operator plan; target project: ${PROJECT_REF}.
-- This file contains private operator input. Do not commit or publish it.
-- Verify the connected project before execution; SQL cannot prove its project ref.
-- Mode: ${plan.mode}. Generation itself performs no database operation.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
SET LOCAL TIME ZONE 'UTC';
`;
  const ending = plan.mode === 'apply' ? 'COMMIT;\n' : 'ROLLBACK;\n';
  if (plan.action === 'inspect') {
    return prefix + `SELECT jsonb_build_object(
  'operation', 'inspect', 'mode', ${literal(plan.mode)}, 'userId', target.user_id,
  'found', m.user_id IS NOT NULL,
  'membership', CASE WHEN m.user_id IS NULL THEN NULL ELSE ${stateJSON('m')} END
) AS member_operation
FROM (VALUES (${id})) AS target(user_id)
LEFT JOIN solo_private.chat_members m ON m.user_id = target.user_id;
` + ending;
  }

  const identity = plan.email === undefined ? '' : `
  SELECT u.id, u.email, u.email_confirmed_at, u.is_anonymous, u.banned_until, u.deleted_at
    INTO v_user FROM auth.users u WHERE u.id = ${id} FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_identity_missing'; END IF;
  IF v_user.email IS NULL OR lower(btrim(v_user.email)) <> ${literal(plan.email)} THEN
    RAISE EXCEPTION 'member_identity_mismatch';
  END IF;
  IF v_user.email_confirmed_at IS NULL OR NOT isfinite(v_user.email_confirmed_at)
      OR v_user.email_confirmed_at > clock_timestamp()
      OR v_user.is_anonymous IS DISTINCT FROM false
      OR v_user.deleted_at IS NOT NULL
      OR (v_user.banned_until IS NOT NULL AND v_user.banned_until > clock_timestamp()) THEN
    RAISE EXCEPTION 'member_identity_ineligible';
  END IF;
  IF NOT isfinite(${literal(plan.expiry.value)}::timestamptz)
      OR ${literal(plan.expiry.value)}::timestamptz <= clock_timestamp() THEN
    RAISE EXCEPTION 'member_expiry_not_future';
  END IF;
`;
  const expectation = plan.action === 'block' ? `
  IF NOT v_found THEN RAISE EXCEPTION 'member_missing'; END IF;
` : plan.previous === null ? `
  IF v_found THEN RAISE EXCEPTION 'member_state_changed'; END IF;
` : `
  IF NOT v_found OR v_member.blocked IS DISTINCT FROM ${plan.previous.blocked ? 'true' : 'false'}
      OR v_member.expires_at IS DISTINCT FROM ${literal(plan.previous.expiry.value)}::timestamptz THEN
    RAISE EXCEPTION 'member_state_changed';
  END IF;
`;
  const change = plan.action === 'block' ? `
  UPDATE solo_private.chat_members SET blocked = true WHERE user_id = ${id};
` : plan.previous === null ? `
  INSERT INTO solo_private.chat_members (user_id, blocked, expires_at)
    VALUES (${id}, false, ${literal(plan.expiry.value)}::timestamptz);
` : `
  UPDATE solo_private.chat_members SET blocked = false, expires_at = ${literal(plan.expiry.value)}::timestamptz
    WHERE user_id = ${id};
`;
  const body = `DECLARE
  v_user record;
  v_member solo_private.chat_members%ROWTYPE;
  v_found boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  -- Use the existing admission mutex and row version, preserving all policy values.
  UPDATE solo_private.chat_policy SET id = true WHERE id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_policy_missing'; END IF;
${identity}
  SELECT * INTO v_member FROM solo_private.chat_members WHERE user_id = ${id} FOR UPDATE;
  v_found := FOUND;
  v_before := CASE WHEN v_found THEN ${stateJSON('v_member')} ELSE NULL END;
${expectation}${change}
  SELECT * INTO STRICT v_member FROM solo_private.chat_members WHERE user_id = ${id};
  v_after := ${stateJSON('v_member')};
  -- A transaction-local result, not an audit table or runtime authorization input.
  PERFORM set_config('solo.member_operation_result', jsonb_build_object(
    'operation', ${literal(plan.action)}, 'mode', ${literal(plan.mode)}, 'userId', ${id},
    'before', v_before, 'after', v_after)::text, true);
END;`;
  // Dollar delimiters are parsed before the PL/pgSQL body's string literals.
  // Select a delimiter absent from the complete escaped body, including email.
  let delimiter = '$solo_member_operation$';
  for (let index = 1; body.includes(delimiter); index++) delimiter = `$solo_member_operation_${index}$`;
  return prefix + `DO ${delimiter}\n${body}\n${delimiter};
SELECT current_setting('solo.member_operation_result')::jsonb AS member_operation;
` + ending;
}

function main() {
  try {
    const text = require('node:fs').readFileSync(0, 'utf8');
    if (Buffer.byteLength(text) > 8192) reject('input_too_large');
    let input;
    try { input = JSON.parse(text); } catch { reject('invalid_json'); }
    process.stdout.write(generatePlan(input));
  } catch (error) {
    process.stderr.write(`SOLO_MEMBER_PLAN_ERROR ${error instanceof PlanError ? error.code : 'plan_unavailable'}\n`);
    process.exitCode = 1;
  }
}

module.exports = { generatePlan, PlanError, PROJECT_REF };
if (require.main === module) main();
