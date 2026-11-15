const test = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const {admitAuthRequest} = require('../lib/solo-auth-admission.cjs');
const ENV = {VERCEL:'1',VERCEL_ENV:'preview',SOLO_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SOLO_SUPABASE_SECRET_KEY:'sb_secret_dummy-rpc-key-not-real',SOLO_USAGE_HASH_SECRET:'dummy-hmac-key-only-for-local-tests-123456789'};
const REQUEST = {headers:{'x-vercel-forwarded-for':'192.0.2.1'}};
const INPUT = {action:'login',email:'person@example.invalid'};
const OK = {allowed:true,code:'admitted',retry_after_seconds:0};
const response = (data=OK,ok=true) => ({ok,json:async()=>data});
const unavailable = error => error.status===503 && error.code==='auth_admission_unavailable';

test('admission sends only domain-separated hashes to the commercial RPC',async()=>{
  let call;
  const result=await admitAuthRequest(REQUEST,{...INPUT,email:' PERSON@EXAMPLE.INVALID ',password:'never-forward-me'},
    {env:ENV,fetcher:async(url,options)=>{call={url,...options};return response();}});
  assert.deepEqual(result,OK);
  assert.equal(call.url,ENV.SOLO_SUPABASE_URL+'/rest/v1/rpc/solo_admit_auth_attempt');
  const body=JSON.parse(call.body);
  assert.deepEqual(Object.keys(body).sort(),['p_email_key','p_ip_key']);
  assert.equal(body.p_email_key,createHmac('sha256',ENV.SOLO_USAGE_HASH_SECRET)
    .update('solo-auth-admission:v1\0email\0person@example.invalid').digest('hex'));
  assert.match(body.p_ip_key,/^[0-9a-f]{64}$/);
  assert.doesNotMatch(call.body,/person|example|192\.0\.2|password|never-forward/);
  assert.deepEqual(Object.keys(call.headers).sort(),['Accept','Content-Type','apikey']);
  assert.equal(call.headers.apikey,ENV.SOLO_SUPABASE_SECRET_KEY);
  assert.equal(call.redirect,'error');
  assert.ok(call.signal instanceof AbortSignal);
});

test('equivalent IPv6 representations and IPv4-mapped addresses share keys',async()=>{
  const key=async ip=>{
    let body;
    await admitAuthRequest({headers:{'x-vercel-forwarded-for':ip}},INPUT,{env:ENV,
      fetcher:async(_url,options)=>{body=JSON.parse(options.body);return response();}});
    return body.p_ip_key;
  };
  assert.equal(await key('2001:DB8:0:0:0:0:0:1'),await key('2001:db8::1'));
  assert.equal(await key('::ffff:192.0.2.1'),await key('192.0.2.1'));
  assert.notEqual(await key('192.0.2.1'),await key('192.0.2.2'));
});

test('untrusted fallback headers, ambiguous IPs and non-Vercel runtimes fail before storage',async()=>{
  let calls=0;
  const options={env:ENV,fetcher:async()=>{calls++;return response();}};
  for(const value of [undefined,null,[],['192.0.2.1'],'','192.0.2.1, 198.51.100.2',
    '192.0.2.1:1234',' 192.0.2.1','bad','fe80::1%eth0']){
    await assert.rejects(admitAuthRequest({headers:{'x-vercel-forwarded-for':value,
      'x-forwarded-for':'192.0.2.1','x-real-ip':'192.0.2.1'},socket:{remoteAddress:'192.0.2.1'}},INPUT,options),unavailable);
  }
  for(const env of [{...ENV,VERCEL:undefined},{...ENV,VERCEL_ENV:'development'}])
    await assert.rejects(admitAuthRequest(REQUEST,INPUT,{...options,env}),unavailable);
  assert.equal(calls,0);
});

test('bad URL, RPC key or missing independent hashing secret fails before network',async()=>{
  let calls=0;
  for(const patch of [{SOLO_SUPABASE_URL:'http://abcdefghijklmnopqrst.supabase.co'},
    {SOLO_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co.attacker.invalid'},
    {SOLO_SUPABASE_URL:ENV.SOLO_SUPABASE_URL+'/other'},
    {SOLO_SUPABASE_URL:ENV.SOLO_SUPABASE_URL+'?secret=x'},
    {SOLO_SUPABASE_SECRET_KEY:'legacy-key'}, {SOLO_SUPABASE_SECRET_KEY:'sb_secret_bad\nkey'},
    {SOLO_USAGE_HASH_SECRET:undefined},{SOLO_USAGE_HASH_SECRET:'short'}]){
    await assert.rejects(admitAuthRequest(REQUEST,INPUT,{env:{...ENV,...patch},
      fetcher:async()=>{calls++;return response();}}),unavailable);
  }
  assert.equal(calls,0);
});

test('unsupported actions and malformed identities never reserve',async()=>{
  let calls=0;
  for(const input of [null,{...INPUT,action:'unsupported'},{...INPUT,action:'refresh'},
    {...INPUT,email:'missing-at'},{...INPUT,email:'a\u0000@example.invalid'},
    {...INPUT,email:'a'.repeat(255)+'@example.invalid'}])
    await assert.rejects(admitAuthRequest(REQUEST,input,{env:ENV,fetcher:async()=>{calls++;return response();}}),unavailable);
  assert.equal(calls,0);
});

test('RPC rate rejection preserves only a bounded Retry-After',async()=>{
  await assert.rejects(admitAuthRequest(REQUEST,INPUT,{env:ENV,fetcher:async()=>response(
    {allowed:false,code:'rate_limited',retry_after_seconds:37})}),error=>{
      assert.equal(error.status,429); assert.equal(error.code,'auth_rate_limited');
      assert.deepEqual(error.headers,{'Retry-After':'37'}); return true;
    });
});

test('missing migration, storage outages and malformed responses fail closed without retry',async()=>{
  for(const reply of [response(null),response([]),response(OK,false),response({allowed:true}),
    response({...OK,code:'unknown'}),response({...OK,allowed:'true'}),
    response({allowed:false,code:'configuration_missing',retry_after_seconds:0}),
    ...[0,-1,86401,'37',Infinity].map(n=>response({allowed:false,code:'rate_limited',retry_after_seconds:n})),
    {ok:true,json:async()=>{throw Error('Invalid JSON');}}]){
    let calls=0;
    await assert.rejects(admitAuthRequest(REQUEST,INPUT,{env:ENV,fetcher:async()=>{calls++;return reply;}}),unavailable);
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(admitAuthRequest(REQUEST,INPUT,{env:ENV,fetcher:async()=>{
    calls++; throw Error('Synthetic timeout');}}),unavailable);
  assert.equal(calls,1);
});

test('each login reserves independently; changing RPC credentials does not change hashes',async()=>{
  const bodies=[];
  for(const key of [ENV.SOLO_SUPABASE_SECRET_KEY,'sb_secret_another-local-dummy-key'])
    await admitAuthRequest(REQUEST,INPUT,{env:{...ENV,SOLO_SUPABASE_SECRET_KEY:key},
      fetcher:async(_url,options)=>{bodies.push(options.body);return response();}});
  assert.equal(bodies.length,2); assert.equal(bodies[0],bodies[1]);
});

test('login, signup and every recovery action share the same durable email/IP budget',async()=>{
  const bodies=[];
  for(const action of ['login','signup','verify_email','request_reset','reset_password']) {
    await admitAuthRequest(REQUEST,{...INPUT,action,code:'123456',password:'never-record-this'},
      {env:ENV,fetcher:async(_url,options)=>{bodies.push(options.body);return response();}});
  }
  assert.equal(bodies.length,5);
  assert.equal(new Set(bodies).size,1,'changing action must not create a fresh quota key');
  assert.doesNotMatch(bodies[0],/123456|never-record|person@example/);
  for(const action of ['signup','verify_email','request_reset','reset_password']) {
    await assert.rejects(admitAuthRequest(REQUEST,{...INPUT,action},{env:ENV,fetcher:async()=>response(
      {allowed:false,code:'rate_limited',retry_after_seconds:37})}),error=>error.status===429);
  }
});
