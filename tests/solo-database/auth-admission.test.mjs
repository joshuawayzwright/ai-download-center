import assert from 'node:assert/strict';
import {before,beforeEach,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const hash=n=>n.toString(16).padStart(64,'0');
before(async()=>{
  // Local-only roles/auth fixture; never apply this setup to hosted Supabase.
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
  for(const name of ['20261027071534_solo_customer_admission.sql','20261028010000_solo_auth_admission.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
});
beforeEach(async()=>{
  await db.exec(`RESET ROLE; TRUNCATE solo_private.auth_rate_counters;
    DELETE FROM solo_private.auth_rate_policy;
    INSERT INTO solo_private.auth_rate_policy VALUES(true,5,20,10,60,30,200,500);`);
});
after(async()=>{await db.close();});
async function asRole(role,sql,params=[]){
  assert.ok(['anon','authenticated','service_role'].includes(role));
  return db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);return tx.query(sql,params);});
}
async function admit(email=hash(1),ip=hash(2)){
  return (await asRole('service_role','SELECT public.solo_admit_auth_attempt($1,$2) AS result',[email,ip])).rows[0].result;
}
async function counters(){return (await db.query('SELECT * FROM solo_private.auth_rate_counters ORDER BY scope,subject_key,window_seconds')).rows;}

test('default caps reserve all seven counters; no raw identifiers or account writes',async()=>{
  assert.deepEqual(await admit(),{allowed:true,code:'admitted',retry_after_seconds:0});
  const rows=await counters(); assert.equal(rows.length,7);
  assert.ok(rows.every(r=>/^[0-9a-f]{64}$/.test(r.subject_key)&&r.attempts===1));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,0);
  assert.equal((await db.query('SELECT enabled FROM solo_private.chat_policy')).rows[0].enabled,false);
});

test('RLS and service-only invoker grants deny clients and prevent policy/member/Auth edits',async()=>{
  for(const role of ['anon','authenticated']){
    await assert.rejects(asRole(role,'SELECT public.solo_admit_auth_attempt($1,$2)',[hash(1),hash(2)]),/permission denied/);
    await assert.rejects(asRole(role,'SELECT * FROM solo_private.auth_rate_counters'),/permission denied/);
  }
  for(const sql of ['UPDATE solo_private.auth_rate_policy SET global_day=9999',
    'DELETE FROM solo_private.auth_rate_policy','UPDATE solo_private.chat_members SET blocked=false',
    'DELETE FROM auth.sessions']) await assert.rejects(asRole('service_role',sql),/permission denied/);
  const tables=(await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE oid IN ('solo_private.auth_rate_policy'::regclass,'solo_private.auth_rate_counters'::regclass)`)).rows;
  assert.equal(tables.length,2); assert.ok(tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
  assert.equal((await db.query(`SELECT prosecdef FROM pg_proc WHERE oid='public.solo_admit_auth_attempt(text,text)'::regprocedure`)).rows[0].prosecdef,false);
});

test('malformed keys and missing policy fail closed with no allocations',async()=>{
  for(const key of [null,'person@example.invalid','a'.repeat(63),'A'.repeat(64),'g'.repeat(64)]){
    assert.equal((await admit(key)).code,'invalid_request');
    assert.equal((await admit(hash(1),key)).code,'invalid_request');
  }
  assert.equal((await counters()).length,0);
  await db.exec('DELETE FROM solo_private.auth_rate_policy');
  assert.equal((await admit()).code,'configuration_missing');
  assert.equal((await counters()).length,0);
});

// PGlite queues transactions on one real PostgreSQL engine/connection. These
// verify SQL check-and-increment behavior, NOT overlapping hosted transactions.
test('queued same-email requests cannot exceed its minute cap',async()=>{
  const results=await Promise.all(Array.from({length:15},()=>admit()));
  assert.equal(results.filter(r=>r.allowed).length,5);
  assert.ok(results.filter(r=>!r.allowed).every(r=>r.code==='rate_limited'&&r.retry_after_seconds>=1&&r.retry_after_seconds<=60));
  assert.ok((await counters()).every(r=>r.attempts===5));
});

test('queued distinct emails share the IP minute cap',async()=>{
  const results=await Promise.all(Array.from({length:15},(_,i)=>admit(hash(i+100),hash(2))));
  assert.equal(results.filter(r=>r.allowed).length,10);
  assert.equal((await counters()).find(r=>r.scope==='ip'&&r.window_seconds===60).attempts,10);
});

test('queued distinct email/IP pairs cannot exceed global minute admission',async()=>{
  await db.exec('UPDATE solo_private.auth_rate_policy SET global_minute=3');
  const results=await Promise.all(Array.from({length:20},(_,i)=>admit(hash(i+100),hash(i+200))));
  assert.equal(results.filter(r=>r.allowed).length,3);
  assert.equal((await counters()).length,15,'three global rows plus four rows per admitted pair');
});

test('all seven limits deny independently and return a bounded remaining window',async()=>{
  const limits=[['email',60,5,hash(1)],['email',3600,20,hash(1)],['ip',60,10,hash(2)],
    ['ip',3600,60,hash(2)],['global',60,30,hash(0)],['global',3600,200,hash(0)],['global',86400,500,hash(0)]];
  for(const [scope,seconds,cap,key] of limits){
    await db.exec('TRUNCATE solo_private.auth_rate_counters');
    await db.query(`INSERT INTO solo_private.auth_rate_counters
      SELECT $1::text,$2::text,$3::integer,e-(e % $3::integer),to_timestamp(e-(e % $3::integer)+$3::integer),$4::integer
      FROM (SELECT floor(extract(epoch FROM clock_timestamp()))::bigint e) s`,[scope,key,seconds,cap]);
    const denied=await admit();
    assert.equal(denied.allowed,false); assert.equal(denied.code,'rate_limited');
    assert.ok(denied.retry_after_seconds>=1&&denied.retry_after_seconds<=seconds);
    assert.equal((await counters()).length,1,'rejection cannot allocate fresh key rows');
    assert.equal((await counters())[0].attempts,cap);
  }
});

test('expired buckets are pruned while active reservations are retained without refunds',async()=>{
  await admit();
  await db.query(`INSERT INTO solo_private.auth_rate_counters VALUES
    ('email',$1,60,60,to_timestamp(120),5)`,[hash(900)]);
  assert.equal((await counters()).length,8);
  await admit();
  const rows=await counters(); assert.equal(rows.length,7);
  assert.ok(rows.every(r=>r.attempts===2));
  // There is deliberately no login-success/failure outcome or refund operation.
  assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns
    WHERE table_schema='solo_private' AND table_name='auth_rate_counters'
    AND column_name IN ('email','ip','password','user_id','outcome')`)).rows[0].n,0);
});

test('global day cap survives different keys and does not grow counters on denial',async()=>{
  await db.exec('UPDATE solo_private.auth_rate_policy SET global_day=2');
  assert.equal((await admit(hash(11),hash(21))).allowed,true);
  assert.equal((await admit(hash(12),hash(22))).allowed,true);
  const before=await counters();
  const denied=await admit(hash(13),hash(23));
  assert.equal(denied.code,'rate_limited'); assert.ok(denied.retry_after_seconds<=86400);
  assert.deepEqual(await counters(),before);
});
