import assert from 'node:assert/strict';
import {before, beforeEach, after, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const migrations = ['20261027071534_solo_customer_admission.sql', '20261112010000_solo_reply_reports.sql']
  .map(name => new URL(`../../supabase/migrations/${name}`, import.meta.url));
const db = new PGlite();
const user = randomUUID(), session = randomUUID(), other = randomUUID(), otherSession = randomUUID();

// Local fixtures only. Never apply this mock auth schema to a Supabase project.
before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, not_after timestamptz);
  `);
  for (const migration of migrations) await db.exec(await readFile(migration, 'utf8'));
});

beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE solo_private.reply_reports, solo_private.chat_requests, solo_private.chat_members, auth.sessions, auth.users;`);
  await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [user, other]);
  await db.query('INSERT INTO auth.sessions VALUES ($1, $2, NULL), ($3, $4, NULL)', [session, user, otherSession, other]);
});
after(async () => { await db.close(); });

async function ledger(userId, status = 'succeeded') {
  const id = randomUUID();
  await db.query(`INSERT INTO solo_private.chat_requests (user_id, session_id, request_id, fingerprint, status, completed_at)
    VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'reserved' THEN NULL ELSE now() END)`,
    [userId, userId === user ? session : otherSession, id, 'a'.repeat(64), status]);
  return id;
}

async function submit(args, role = 'service_role') {
  await db.exec(`SET ROLE ${role}`);
  try {
    const {rows} = await db.query('SELECT public.solo_submit_report($1, $2, $3, $4, $5, $6) AS r',
      [args.user ?? user, args.session ?? session, args.request, args.reason ?? 'harmful', args.note ?? null, args.reply ?? 'Reply text']);
    return rows[0].r;
  } finally { await db.exec('RESET ROLE'); }
}

test('a customer can report a reply they received, once', async () => {
  const request = await ledger(user);
  assert.equal((await submit({request, note: 'unsafe'})).code, 'reported');
  assert.deepEqual(await submit({request}), {ok: true, code: 'already_reported', retry_after_seconds: 0});
  const {rows} = await db.query('SELECT reason, note, reply_text, review_status FROM solo_private.reply_reports');
  assert.deepEqual(rows, [{reason: 'harmful', note: 'unsafe', reply_text: 'Reply text', review_status: 'open'}]);
});

test('only succeeded replies owned by the caller can be reported', async () => {
  const othersReply = await ledger(other);
  const failed = await ledger(user, 'provider_error');
  for (const request of [othersReply, failed, randomUUID()]) {
    assert.equal((await submit({request})).code, 'request_not_found');
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM solo_private.reply_reports')).rows[0].n, 0);
});

test('a live session is required, but not an active membership', async () => {
  const request = await ledger(user);
  assert.equal((await submit({request, session: otherSession})).code, 'invalid_session');
  await db.query("UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = $1", [session]);
  assert.equal((await submit({request})).code, 'invalid_session');
  await db.query('UPDATE auth.sessions SET not_after = NULL WHERE id = $1', [session]);
  // No chat_members row exists for this user, yet reporting still works.
  assert.equal((await submit({request})).code, 'reported');
});

test('invalid input is rejected', async () => {
  const request = await ledger(user);
  for (const bad of [{reason: 'spam'}, {reply: ''}, {reply: 'x'.repeat(4001)}, {note: ''}, {note: 'x'.repeat(501)}]) {
    assert.equal((await submit({request, ...bad})).code, 'invalid_request');
  }
});

test('reports are limited to 20 per customer per UTC day', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await submit({request: await ledger(user)})).code, 'reported');
  const limited = await submit({request: await ledger(user)});
  assert.equal(limited.code, 'report_limit');
  assert.ok(limited.retry_after_seconds > 0 && limited.retry_after_seconds <= 86400);
});

test('anon and authenticated roles cannot read reports or call the function', async () => {
  const request = await ledger(user);
  await submit({request});
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT * FROM solo_private.reply_reports'));
    await assert.rejects(db.query('SELECT public.solo_submit_report($1, $2, $3, $4, $5, $6)',
      [user, session, request, 'harmful', null, 'x']));
    await db.exec('RESET ROLE');
  }
});

test('the service role cannot change review state or delete reports', async () => {
  const request = await ledger(user);
  await submit({request});
  await db.exec('SET ROLE service_role');
  await assert.rejects(db.query("UPDATE solo_private.reply_reports SET review_status = 'reviewed'"));
  await assert.rejects(db.query('DELETE FROM solo_private.reply_reports'));
  await db.exec('RESET ROLE');
});
