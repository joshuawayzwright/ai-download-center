import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { generatePlan, PROJECT_REF } from '../../powerhouse-website/scripts/solo-member-access.cjs';

const db = new PGlite();
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const MISSING = '00000000-0000-4000-8000-000000000003';
const SESSION = '10000000-0000-4000-8000-000000000001';
const EMAIL = 'pilot@example.invalid';
const PREVIOUS = '2000-01-01T00:00:00.123456Z';
const expiry = () => new Date(Date.now() + 86400000).toISOString();
const input = (overrides = {}) => ({ projectRef: PROJECT_REF, userId: USER, action: 'grant',
  expectedEmail: EMAIL, expiresAt: expiry(), expectedMembership: null, ...overrides });
const operation = (action, overrides = {}) => ({ projectRef: PROJECT_REF, userId: USER, action, ...overrides });

before(async () => {
  // Minimal local Auth fixtures only. Never apply this fixture setup remotely.
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email varchar, email_confirmed_at timestamptz,
      is_anonymous boolean NOT NULL DEFAULT false, banned_until timestamptz, deleted_at timestamptz);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, not_after timestamptz);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261027071534_solo_customer_admission.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE solo_private.chat_requests, solo_private.chat_members, auth.sessions, auth.users;
    DELETE FROM solo_private.chat_policy;
    INSERT INTO solo_private.chat_policy VALUES(true,false,3,20,20,200,clock_timestamp());
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      ('${USER}','${EMAIL}',clock_timestamp()-interval '1 day'),
      ('${OTHER}','other@example.invalid',clock_timestamp()-interval '1 day');
    INSERT INTO auth.sessions VALUES('${SESSION}','${USER}',NULL);
    INSERT INTO solo_private.chat_members(user_id,blocked,expires_at)
      VALUES('${OTHER}',true,'${PREVIOUS}');
    INSERT INTO solo_private.chat_requests(user_id,session_id,request_id,fingerprint)
      VALUES('${OTHER}','20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',repeat('f',64));`);
});
after(async () => { await db.close(); });

async function run(sql) {
  try { return await db.exec(sql); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
function result(results) {
  const rows = results.flatMap(value => value.rows || []);
  const matches = rows.filter(row => Object.hasOwn(row, 'member_operation'));
  assert.equal(matches.length, 1, 'one structured operator result');
  return matches[0].member_operation;
}
async function snapshot() {
  return (await db.query(`SELECT jsonb_build_object(
    'policy',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM solo_private.chat_policy p),
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth.sessions s),
    'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,request_id) FROM solo_private.chat_requests r),
    'otherMemberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id) FROM solo_private.chat_members m WHERE user_id<>'${USER}')
  ) AS state`)).rows[0].state;
}
async function member() {
  return (await db.query(`SELECT user_id,blocked,
    to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "expiresAt",
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
    FROM solo_private.chat_members WHERE user_id=$1`, [USER])).rows[0];
}
async function seedMember(blocked = true, expiresAt = PREVIOUS) {
  await db.query('INSERT INTO solo_private.chat_members(user_id,blocked,expires_at) VALUES($1,$2,$3)',
    [USER, blocked, expiresAt]);
}
async function admission(requestId) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    return (await tx.query('SELECT public.solo_admit_request($1,$2,$3,$4) AS result',
      [USER, SESSION, requestId, 'a'.repeat(64)])).rows[0].result;
  });
}

test('strict operator input rejects wrong project, credentials, ambiguous actions and nonfinite or stale dates', () => {
  for (const value of [null, [], input({ projectRef: 'other-project' }), input({ userId: 'not-a-uuid' }),
    input({ mode: 'auto' }), input({ action: 'delete' }), input({ apiKey: 'dummy-secret-do-not-print' }),
    input({ expectedMembership: undefined }), input({ expectedEmail: 'invalid' })]) {
    assert.throws(() => generatePlan(value));
  }
  for (const expiresAt of ['infinity', '-infinity', 'not-a-date', '2000-01-01T00:00:00Z',
    '2999-02-30T00:00:00Z', '2999-01-01T00:00:00+10:00', '2999-01-01T00:00:00.1234567Z']) {
    assert.throws(() => generatePlan(input({ expiresAt })));
  }
  assert.throws(() => generatePlan(input({ expectedMembership: { blocked: true, expiresAt: 'infinity' } })));
  assert.throws(() => generatePlan(operation('block', { expectedEmail: EMAIL })));
});

test('plan generation is offline; apply merely changes generated transaction ending', async () => {
  const before = await snapshot();
  const dry = generatePlan(input());
  const apply = generatePlan(input({ mode: 'apply' }));
  assert.match(dry, /ROLLBACK;\n$/);
  assert.match(apply, /COMMIT;\n$/);
  assert.equal(await member(), undefined);
  assert.deepEqual(await snapshot(), before);
});

test('default grant is rollback-only with an accurate before/after result and no persistent changes', async () => {
  const before = await snapshot();
  const outcome = result(await run(generatePlan(input())));
  assert.equal(outcome.operation, 'grant');
  assert.equal(outcome.mode, 'dry-run');
  assert.equal(outcome.userId, USER);
  assert.equal(outcome.before, null);
  assert.equal(outcome.after.blocked, false);
  assert.equal(await member(), undefined);
  assert.deepEqual(await snapshot(), before);
});

test('explicit apply grants only the confirmed target and preserves policy, Auth, sessions and usage history', async () => {
  const before = await snapshot();
  const outcome = result(await run(generatePlan(input({ mode: 'apply', expectedEmail: ' PILOT@example.invalid ' }))));
  assert.equal(outcome.mode, 'apply');
  assert.equal((await member()).blocked, false);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.query('SELECT enabled FROM solo_private.chat_policy')).rows[0].enabled, false);
});

test('grant rejects missing or mismatched identities and actual unconfirmed, anonymous, banned or deleted users', async () => {
  for (const change of [
    'email_confirmed_at=NULL', "email_confirmed_at=clock_timestamp()+interval '1 day'",
    "email_confirmed_at='infinity'", 'is_anonymous=true', 'deleted_at=clock_timestamp()',
    "banned_until=clock_timestamp()+interval '1 day'", 'email=NULL'
  ]) {
    await db.exec(`UPDATE auth.users SET email='${EMAIL}',email_confirmed_at=clock_timestamp()-interval '1 day',
      is_anonymous=false,banned_until=NULL,deleted_at=NULL WHERE id='${USER}';
      UPDATE auth.users SET ${change} WHERE id='${USER}';`);
    const before = await snapshot();
    await assert.rejects(run(generatePlan(input({ mode: 'apply' }))), /member_identity_(ineligible|mismatch)/);
    assert.equal(await member(), undefined);
    assert.deepEqual(await snapshot(), before);
  }
  await db.exec(`UPDATE auth.users SET email='${EMAIL}',email_confirmed_at=clock_timestamp()-interval '1 day',
    is_anonymous=false,banned_until=NULL,deleted_at=NULL WHERE id='${USER}'`);
  await assert.rejects(run(generatePlan(input({ mode: 'apply', expectedEmail: 'someoneelse@example.invalid' }))), /member_identity_mismatch/);
  await assert.rejects(run(generatePlan(input({ mode: 'apply', userId: MISSING }))), /member_identity_missing/);
  assert.equal(await member(), undefined);
});

test('an expired ban does not permanently prevent a confirmed customer grant', async () => {
  await db.exec(`UPDATE auth.users SET banned_until=clock_timestamp()-interval '1 day' WHERE id='${USER}'`);
  await run(generatePlan(input({ mode: 'apply' })));
  assert.equal((await member()).blocked, false);
});

test('grant cannot overwrite a membership or silently unblock stale state; exact microseconds are retained', async () => {
  await seedMember();
  const before = await member();
  await assert.rejects(run(generatePlan(input({ mode: 'apply' }))), /member_state_changed/);
  await assert.rejects(run(generatePlan(input({ mode: 'apply',
    expectedMembership: { blocked: true, expiresAt: '2000-01-01T00:00:00.123000Z' } }))), /member_state_changed/);
  assert.deepEqual(await member(), before);
  const exact = input({ mode: 'apply', expectedMembership: { blocked: true, expiresAt: PREVIOUS } });
  assert.ok(generatePlan(exact).includes(PREVIOUS));
  const outcome = result(await run(generatePlan(exact)));
  assert.deepEqual(outcome.before, { blocked: true, expiresAt: PREVIOUS });
  assert.equal((await member()).blocked, false);
  assert.equal((await member()).createdAt, before.createdAt);
});

test('renew only extends an explicitly matched unblocked membership and cannot unblock a blocked member', async () => {
  await seedMember(false);
  const prior = await member();
  const plan = input({ action: 'renew', mode: 'apply', expectedMembership: { blocked: false, expiresAt: PREVIOUS } });
  assert.throws(() => generatePlan({ ...plan, expectedMembership: { blocked: true, expiresAt: PREVIOUS } }), /renew_requires_unblocked_member/);
  assert.throws(() => generatePlan({ ...plan, expectedMembership: null }), /renew_requires_unblocked_member/);
  assert.throws(() => generatePlan({ ...plan, expectedMembership: { blocked: false, expiresAt: '2999-01-01T00:00:00Z' } }), /renew_must_extend_expiry/);
  assert.throws(() => generatePlan({ ...plan, action: 'grant' }), /grant_requires_absent_or_blocked_member/);
  await run(generatePlan(plan));
  assert.equal((await member()).blocked, false);
  assert.equal((await member()).createdAt, prior.createdAt);
  await assert.rejects(run(generatePlan(plan)), /member_state_changed/);
});

test('expiry is rechecked at execution so a delayed plan cannot grant already-expired access', async () => {
  const now = Date.now();
  const sql = generatePlan(input({ mode: 'apply', expiresAt: new Date(now - 1000).toISOString() }), { now: now - 2000 });
  const before = await snapshot();
  await assert.rejects(run(sql), /member_expiry_not_future/);
  assert.equal(await member(), undefined);
  assert.deepEqual(await snapshot(), before);
});

test('inspect reports existing and missing membership honestly without changing it', async () => {
  const missing = result(await run(generatePlan(operation('inspect'))));
  assert.equal(missing.found, false);
  assert.equal(missing.membership, null);
  await seedMember();
  const before = await member();
  const existing = result(await run(generatePlan(operation('inspect'))));
  assert.equal(existing.found, true);
  assert.deepEqual(existing.membership, { blocked: true, expiresAt: PREVIOUS });
  assert.deepEqual(await member(), before);
});

test('block reports missing membership as an error and preserves session, expiry and request history', async () => {
  const before = await snapshot();
  await assert.rejects(run(generatePlan(operation('block', { mode: 'apply' }))), /member_missing/);
  assert.deepEqual(await snapshot(), before);
  await seedMember(false);
  const prior = await member();
  const outcome = result(await run(generatePlan(operation('block', { mode: 'apply' }))));
  assert.equal(outcome.before.blocked, false);
  assert.equal(outcome.after.blocked, true);
  assert.equal(outcome.after.expiresAt, PREVIOUS);
  assert.deepEqual(await member(), { ...prior, blocked: true });
  assert.deepEqual(await snapshot(), before);
});

test('existing admission function observes grant and block without resetting quota or affecting other customers', async () => {
  // Explicit local fixture only; operator SQL must preserve this chosen policy.
  await db.exec('UPDATE solo_private.chat_policy SET enabled=true');
  const denied = await admission('30000000-0000-4000-8000-000000000011');
  assert.equal(denied.code, 'access_denied');
  await run(generatePlan(input({ mode: 'apply' })));
  const allowed = await admission('30000000-0000-4000-8000-000000000012');
  assert.equal(allowed.allowed, true);
  const beforeBlock = await snapshot();
  await run(generatePlan(operation('block', { mode: 'apply' })));
  const blocked = await admission('30000000-0000-4000-8000-000000000013');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, 'member_blocked');
  assert.deepEqual(await snapshot(), beforeBlock);
  assert.equal((await db.query('SELECT count(*)::int n FROM solo_private.chat_requests')).rows[0].n, 2);
});

test('client and runtime roles remain unable to provision or unblock membership', async () => {
  await seedMember();
  const before = await member();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const plan of [operation('block', { mode: 'apply' }), input({ mode: 'apply',
      expectedMembership: { blocked: true, expiresAt: PREVIOUS } })]) {
      const sql = generatePlan(plan).replace('BEGIN;', `BEGIN;\nSET LOCAL ROLE ${role};`);
      await assert.rejects(run(sql), /permission denied/);
      assert.deepEqual(await member(), before);
    }
  }
});

test('operator email cannot escape E-string literals or the dollar-quoted procedure body', async () => {
  const hostile = "o'brien\\+$solo_member_operation$+$solo_member_operation_1$;--@example.invalid";
  await db.query('UPDATE auth.users SET email=$1 WHERE id=$2', [hostile, USER]);
  const before = await snapshot();
  const plan = generatePlan(input({ expectedEmail: hostile, mode: 'apply' }));
  assert.match(plan, /DO \$solo_member_operation_2\$/);
  await run(plan);
  assert.equal((await member()).blocked, false);
  assert.deepEqual(await snapshot(), before);
});

test('CLI rejects malformed input without printing email, credentials or the supplied text', () => {
  const script = fileURLToPath(new URL('../../powerhouse-website/scripts/solo-member-access.cjs', import.meta.url));
  for (const payload of [JSON.stringify(input({ projectRef: 'not-commercial', expectedEmail: 'private@example.invalid' })),
    JSON.stringify(input({ password: 'dummy-secret-do-not-print' })), '{bad private@example.invalid', 'x'.repeat(8193)]) {
    const child = spawnSync(process.execPath, [script], { input: payload, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.error, undefined, 'CLI validation must finish within five seconds');
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /^SOLO_MEMBER_PLAN_ERROR [a-z_]+\n$/);
    assert.doesNotMatch(child.stderr, /private@example|dummy-secret/);
  }
});
