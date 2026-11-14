import assert from 'node:assert/strict';
import {before, beforeEach, after, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const migrations = ['20261027071534_solo_customer_admission.sql', '20261114010000_solo_open_access.sql']
  .map(name => new URL(`../../supabase/migrations/${name}`, import.meta.url));
const db = new PGlite();
const fingerprint = 'b'.repeat(64);

// Local fixtures only. Never apply this mock auth schema to a Supabase project.
before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, not_after timestamptz);
  `);
  for (const file of migrations) await db.exec(await readFile(file, 'utf8'));
});
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE solo_private.chat_requests, solo_private.chat_members, auth.sessions, auth.users;
    DELETE FROM solo_private.chat_policy;
    INSERT INTO solo_private.chat_policy
      (id, enabled, user_minute_limit, user_day_limit, global_minute_limit, global_day_limit)
    VALUES (true, true, 100, 20, 1000, 1000);`);
});
after(async () => { await db.close(); });

async function asService(sql, params) {
  return db.transaction(async tx => { await tx.exec('SET LOCAL ROLE service_role'); return tx.query(sql, params); });
}
async function account({membership} = {}) {
  const who = {user: randomUUID(), session: randomUUID()};
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [who.user]);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES ($1,$2)', [who.session, who.user]);
  if (membership) await db.query(`INSERT INTO solo_private.chat_members(user_id,blocked,expires_at)
    VALUES ($1,$2,clock_timestamp()+$3::interval)`, [who.user, membership.blocked ?? false, membership.expires ?? '1 day']);
  return who;
}
const status = async who => (await asService('SELECT public.solo_customer_status($1::uuid,$2::uuid) AS r',
  [who.user, who.session])).rows[0].r;
const admit = async who => (await asService('SELECT public.solo_admit_request($1::uuid,$2::uuid,$3::uuid,$4::text) AS r',
  [who.user, who.session, randomUUID(), fingerprint])).rows[0].r;
const access = async who => (await asService('SELECT solo_private.customer_access_code($1::uuid,$2::uuid,clock_timestamp()) AS r',
  [who.user, who.session])).rows[0].r;
const open = (limit = 3) => db.exec(`UPDATE solo_private.chat_policy SET open_access=true, free_day_limit=${limit}`);

test('defaults keep the invite-only behaviour', async () => {
  const policy = (await db.query('SELECT open_access, free_day_limit FROM solo_private.chat_policy')).rows[0];
  assert.deepEqual(policy, {open_access: false, free_day_limit: 10});
  const stranger = await account();
  assert.equal((await status(stranger)).code, 'access_denied');
  assert.equal((await admit(stranger)).code, 'access_denied');
  assert.equal(await access(stranger), 'access_denied');
  const lapsed = await account({membership: {expires: '-1 day'}});
  assert.equal((await admit(lapsed)).code, 'member_expired');
  const member = await account({membership: {}});
  assert.deepEqual(await status(member), {active: true, code: 'active', tier: 'member', daily_limit: 20, remaining_daily: 20});
});

test('open access admits accounts without membership on the free allowance', async () => {
  await open(2);
  const user = await account();
  assert.deepEqual(await status(user), {active: true, code: 'active', tier: 'free', daily_limit: 2, remaining_daily: 2});
  assert.equal(await access(user), 'active');
  const first = await admit(user);
  assert.equal(first.code, 'admitted');
  assert.equal(first.tier, 'free');
  assert.equal(first.remaining_daily, 1);
  assert.equal((await admit(user)).code, 'admitted');
  const third = await admit(user);
  assert.equal(third.code, 'user_daily_limit');
  assert.ok(third.retry_after_seconds > 0);
  assert.equal((await status(user)).remaining_daily, 0);
});

test('members keep their own allowance and expired members fall back to free', async () => {
  await open(1);
  const member = await account({membership: {}});
  const admitted = await admit(member);
  assert.equal(admitted.tier, 'member');
  assert.equal(admitted.daily_limit, 20);
  const lapsed = await account({membership: {expires: '-1 day'}});
  assert.equal((await status(lapsed)).tier, 'free');
});

test('blocked accounts, bad sessions and the global switch still deny', async () => {
  await open();
  const blocked = await account({membership: {blocked: true}});
  assert.equal((await admit(blocked)).code, 'member_blocked');
  assert.equal(await access(blocked), 'member_blocked');
  const user = await account();
  assert.equal((await status({user: user.user, session: randomUUID()})).code, 'invalid_session');
  await db.exec('UPDATE solo_private.chat_policy SET enabled=false');
  assert.equal((await admit(user)).code, 'disabled');
});

test('the global daily limit covers free accounts', async () => {
  await open(5);
  await db.exec('UPDATE solo_private.chat_policy SET global_day_limit=2');
  const a = await account(), b = await account();
  assert.equal((await admit(a)).code, 'admitted');
  assert.equal((await admit(b)).code, 'admitted');
  assert.equal((await admit(a)).code, 'global_daily_limit');
});

test('runtime roles cannot change the open-access policy', async () => {
  await assert.rejects(asService('UPDATE solo_private.chat_policy SET open_access=true', []));
  await assert.rejects(asService('UPDATE solo_private.chat_policy SET free_day_limit=999', []));
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      return tx.query('SELECT solo_private.customer_tier($1::uuid,$2::uuid,clock_timestamp(),true)', [randomUUID(), randomUUID()]);
    }));
  }
});
