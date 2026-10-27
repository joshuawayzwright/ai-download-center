import assert from 'node:assert/strict';
import {before, beforeEach, after, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const migration = new URL('../../supabase/migrations/20261027034444_solo_customer_admission.sql', import.meta.url);
const db = new PGlite();
const fingerprint = 'a'.repeat(64);
const users = Array.from({length: 12}, () => ({user: randomUUID(), session: randomUUID()}));

// Local fixtures only. Never apply this mock auth schema to a Supabase project.
before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      not_after timestamptz
    );
  `);
  await db.exec(await readFile(migration, 'utf8'));
});

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    TRUNCATE solo_private.chat_requests, solo_private.chat_members, auth.sessions, auth.users;
    DELETE FROM solo_private.chat_policy;
    INSERT INTO solo_private.chat_policy
      (id, enabled, user_minute_limit, user_day_limit, global_minute_limit, global_day_limit)
    VALUES (true, false, 3, 20, 20, 200);
  `);
});
after(async () => { await db.close(); });

async function asRole(role, sql, params = []) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query(sql, params);
  });
}
async function member(who = users[0]) {
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [who.user]);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES ($1,$2)', [who.session, who.user]);
  await db.query(`INSERT INTO solo_private.chat_members(user_id,blocked,expires_at)
    VALUES ($1,false,clock_timestamp()+interval '1 day')`, [who.user]);
  return who;
}
async function enable() { await db.exec('UPDATE solo_private.chat_policy SET enabled=true'); }
async function admit(who = users[0], request = randomUUID(), hash = fingerprint) {
  const result = await asRole('service_role',
    'SELECT public.solo_admit_request($1::uuid,$2::uuid,$3::uuid,$4::text) AS result',
    [who.user, who.session, request, hash]);
  return result.rows[0].result;
}
async function status(who = users[0]) {
  const result = await asRole('service_role',
    'SELECT public.solo_customer_status($1::uuid,$2::uuid) AS result', [who.user, who.session]);
  return result.rows[0].result;
}
async function finish(who, request, state = 'succeeded', input = 15, output = 20) {
  const result = await asRole('service_role',
    'SELECT public.solo_finish_request($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::integer,$7::integer) AS result',
    [who.user, request, state, 'gemini', 'gemini-3.5-flash-lite', input, output]);
  return result.rows[0].result;
}
async function ledgerCount() {
  const result = await db.query('SELECT count(*)::integer AS count FROM solo_private.chat_requests');
  return result.rows[0].count;
}

test('migration is disabled by default; status and admission fail closed', async () => {
  await member();
  assert.deepEqual(await status(), {active: false, code: 'disabled'});
  assert.equal((await admit()).code, 'disabled');
  assert.equal(await ledgerCount(), 0);
});

test('missing singleton policy fails closed without a reservation', async () => {
  await member();
  await db.exec('DELETE FROM solo_private.chat_policy');
  assert.equal((await status()).code, 'configuration_missing');
  assert.equal((await admit()).code, 'configuration_missing');
  assert.equal(await ledgerCount(), 0);
});

test('status consumes no quota and reports the daily allowance', async () => {
  await member(); await enable();
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await status(), {active: true, code: 'active', daily_limit: 20, remaining_daily: 20});
  }
  assert.equal(await ledgerCount(), 0);
  const admission = await admit();
  assert.equal(admission.remaining_daily, 19);
  assert.equal(admission.daily_limit, 20);
  assert.equal((await status()).remaining_daily, 19);
});

test('missing, blocked and expired members cannot access status or inference', async () => {
  await member(); await enable();
  await db.query('DELETE FROM solo_private.chat_members WHERE user_id=$1', [users[0].user]);
  assert.equal((await status()).code, 'access_denied');
  assert.equal((await admit()).code, 'access_denied');
  await db.query(`INSERT INTO solo_private.chat_members(user_id,expires_at)
    VALUES ($1,clock_timestamp()+interval '1 day')`, [users[0].user]);
  assert.equal((await admit()).code, 'member_blocked');
  assert.equal((await status()).code, 'member_blocked');
  await db.exec(`UPDATE solo_private.chat_members SET blocked=false,expires_at=clock_timestamp()-interval '1 second'`);
  assert.equal((await admit()).code, 'member_expired');
  assert.equal((await status()).code, 'member_expired');
  assert.equal(await ledgerCount(), 0);
});

test('session ownership mismatch and expired sessions are rejected', async () => {
  await member(users[0]); await member(users[1]); await enable();
  const mismatch = {user: users[0].user, session: users[1].session};
  assert.equal((await admit(mismatch)).code, 'invalid_session');
  assert.equal((await status(mismatch)).code, 'invalid_session');
  await db.query(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1`, [users[0].session]);
  assert.equal((await admit()).code, 'invalid_session');
  assert.equal((await status()).code, 'invalid_session');
  assert.equal(await ledgerCount(), 0);
});

test('logout revocation blocks further admissions but permits recording a previously admitted result', async () => {
  await member(); await enable();
  const request = randomUUID();
  assert.equal((await admit(users[0], request)).allowed, true);
  await db.query('DELETE FROM auth.sessions WHERE id=$1', [users[0].session]);
  assert.equal((await status()).code, 'invalid_session');
  assert.equal((await admit()).code, 'invalid_session');
  assert.deepEqual(await finish(users[0], request), {ok: true, code: 'completed'});
  assert.equal(await ledgerCount(), 1);
});

test('queued concurrent admissions enforce per-user minute cap', async () => {
  await member(); await enable();
  const results = await Promise.all(Array.from({length: 12}, () => admit()));
  assert.equal(results.filter(x => x.allowed).length, 3);
  assert.equal(results.filter(x => x.code === 'user_minute_limit').length, 9);
  assert.ok(results.filter(x => !x.allowed).every(x => x.retry_after_seconds === 60));
  assert.equal(await ledgerCount(), 3);
});

test('queued identical IDs reserve exactly once and different payloads conflict', async () => {
  await member(); await enable();
  const request = randomUUID();
  const results = await Promise.all(Array.from({length: 8}, () => admit(users[0], request)));
  assert.equal(results.filter(x => x.allowed).length, 1);
  assert.equal(results.filter(x => x.code === 'duplicate_request').length, 7);
  assert.equal((await admit(users[0], request, 'b'.repeat(64))).code, 'request_conflict');
  await finish(users[0], request);
  assert.equal((await admit(users[0], request)).code, 'duplicate_request');
  assert.equal(await ledgerCount(), 1);
});

test('per-user daily cap applies across minute windows', async () => {
  await member(); await enable();
  await db.exec('UPDATE solo_private.chat_policy SET user_minute_limit=100,user_day_limit=2');
  assert.equal((await admit()).allowed, true);
  assert.equal((await admit()).allowed, true);
  const result = await admit();
  assert.equal(result.code, 'user_daily_limit');
  assert.ok(result.retry_after_seconds >= 1 && result.retry_after_seconds <= 86400);
  assert.equal((await status()).remaining_daily, 0);
  assert.equal(await ledgerCount(), 2);
});

test('queued distinct users share one global minute cap', async () => {
  for (const who of users.slice(0, 8)) await member(who);
  await enable();
  await db.exec('UPDATE solo_private.chat_policy SET global_minute_limit=5');
  const results = await Promise.all(users.slice(0, 8).map(who => admit(who)));
  assert.equal(results.filter(x => x.allowed).length, 5);
  assert.equal(results.filter(x => x.code === 'global_minute_limit').length, 3);
  assert.equal(await ledgerCount(), 5);
});

test('global daily cap includes failed and unfinished reservations without refunds', async () => {
  for (const who of users.slice(0, 4)) await member(who);
  await enable();
  await db.exec('UPDATE solo_private.chat_policy SET global_day_limit=3');
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (let i = 0; i < ids.length; i++) assert.equal((await admit(users[i], ids[i])).allowed, true);
  await finish(users[0], ids[0], 'provider_error', null, null);
  await finish(users[1], ids[1], 'timeout', null, null);
  assert.equal((await admit(users[3])).code, 'global_daily_limit');
  assert.equal((await admit(users[0], ids[0])).code, 'duplicate_request');
  assert.equal(await ledgerCount(), 3);
  assert.equal((await status(users[0])).remaining_daily, 19);
});

test('expired rolling minute reservations remain in the daily ledger', async () => {
  await member(); await enable();
  for (let i = 0; i < 3; i++) await admit();
  assert.equal((await admit()).code, 'user_minute_limit');
  await db.exec(`UPDATE solo_private.chat_requests SET created_at=clock_timestamp()-interval '61 seconds'`);
  assert.equal((await admit()).allowed, true);
  assert.equal(await ledgerCount(), 4);
});

test('previous UTC day does not consume current daily allowance', async () => {
  await member(); await enable();
  await db.exec('UPDATE solo_private.chat_policy SET user_day_limit=1');
  await admit();
  assert.equal((await admit()).code, 'user_daily_limit');
  await db.exec(`UPDATE solo_private.chat_requests SET created_at=clock_timestamp()-interval '25 hours'`);
  assert.equal((await status()).remaining_daily, 1);
  assert.equal((await admit()).allowed, true);
  assert.equal(await ledgerCount(), 2);
});

test('completion is idempotent, immutable and scoped to the supplied user', async () => {
  await member(users[0]); await member(users[1]); await enable();
  const request = randomUUID();
  await admit(users[0], request);
  assert.deepEqual(await finish(users[1], request), {ok: false, code: 'request_not_found'});
  assert.deepEqual(await finish(users[0], request), {ok: true, code: 'completed'});
  assert.deepEqual(await finish(users[0], request), {ok: true, code: 'already_completed'});
  assert.deepEqual(await finish(users[0], request, 'timeout', null, null), {ok: false, code: 'completion_conflict'});
  const saved = await db.query('SELECT status,input_tokens,output_tokens FROM solo_private.chat_requests');
  assert.deepEqual(saved.rows, [{status: 'succeeded', input_tokens: 15, output_tokens: 20}]);
});

test('unknown usage stays null and invalid metadata cannot mutate a reservation', async () => {
  await member(); await enable();
  const request = randomUUID();
  await admit(users[0], request);
  assert.equal((await finish(users[0], request, 'reserved')).code, 'invalid_request');
  assert.equal((await finish(users[0], request, 'succeeded', -1, 2)).code, 'invalid_request');
  assert.equal((await finish(users[0], request, 'timeout', null, null)).ok, true);
  const result = await db.query('SELECT input_tokens,output_tokens FROM solo_private.chat_requests');
  assert.deepEqual(result.rows[0], {input_tokens: null, output_tokens: null});
});

test('anon and authenticated roles cannot call any RPC or access private records', async () => {
  await member(); await enable();
  for (const role of ['anon', 'authenticated']) {
    for (const sql of [
      `SELECT public.solo_customer_status('${users[0].user}','${users[0].session}')`,
      `SELECT public.solo_admit_request('${users[0].user}','${users[0].session}','${randomUUID()}','${fingerprint}')`,
      `SELECT public.solo_finish_request('${users[0].user}','${randomUUID()}','succeeded','gemini','gemini-3.5-flash-lite',1,1)`,
      'SELECT * FROM solo_private.chat_requests',
      'UPDATE solo_private.chat_policy SET enabled=true',
      `INSERT INTO solo_private.chat_members(user_id,blocked,expires_at) VALUES ('${users[1].user}',false,clock_timestamp()+interval '1 day')`
    ]) await assert.rejects(asRole(role, sql), error => error.code === '42501');
  }
  assert.equal(await ledgerCount(), 0);
});

test('service role cannot self-enrol, alter limits, refund, or write auth data', async () => {
  await member(); await enable();
  await admit();
  for (const sql of [
    'UPDATE solo_private.chat_policy SET enabled=true',
    'UPDATE solo_private.chat_policy SET global_day_limit=1000000',
    'UPDATE solo_private.chat_members SET blocked=false',
    'DELETE FROM solo_private.chat_requests',
    `UPDATE solo_private.chat_requests SET created_at=clock_timestamp()-interval '25 hours'`,
    'DELETE FROM auth.sessions',
    `INSERT INTO auth.users(id) VALUES ('${randomUUID()}')`
  ]) await assert.rejects(asRole('service_role', sql), error => error.code === '42501');
  assert.equal(await ledgerCount(), 1);
});

test('all private tables have forced RLS and every exposed RPC is security invoker', async () => {
  const tables = await db.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE relnamespace='solo_private'::regnamespace AND relkind='r' ORDER BY relname`);
  assert.equal(tables.rows.length, 3);
  assert.ok(tables.rows.every(row => row.relrowsecurity && row.relforcerowsecurity));
  const functions = await db.query(`SELECT proname,prosecdef FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN
    ('solo_admit_request','solo_finish_request','solo_customer_status')`);
  assert.equal(functions.rows.length, 3);
  assert.ok(functions.rows.every(row => row.prosecdef === false));
});

test('storage failure throws rather than authorizing inference', async () => {
  await member(); await enable();
  await db.exec('ALTER TABLE solo_private.chat_requests RENAME TO unavailable_chat_requests');
  try {
    await assert.rejects(admit(), error => error.code === '42P01');
  } finally {
    await db.exec('ALTER TABLE solo_private.unavailable_chat_requests RENAME TO chat_requests');
  }
  assert.equal(await ledgerCount(), 0);
});

test('account deletion cannot erase the durable global admission record', async () => {
  await member(); await enable();
  await admit();
  await db.query('DELETE FROM auth.users WHERE id=$1', [users[0].user]);
  assert.equal((await status()).code, 'invalid_session');
  assert.equal(await ledgerCount(), 1);
});

test('invalid admission fingerprint does not reserve quota', async () => {
  await member(); await enable();
  for (const hash of [null, '', 'not-a-fingerprint', 'A'.repeat(64), 'a'.repeat(65)]) {
    assert.equal((await admit(users[0], randomUUID(), hash)).code, 'invalid_request');
  }
  assert.equal(await ledgerCount(), 0);
});
