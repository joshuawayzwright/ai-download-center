const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../api/launch-interest.js'),'utf8');
const valid={event:'product_interest',product:'solo-cashflow-control',page:'products'};
async function run({enabled='true',method='POST',headers={},body=valid,chunks}={}) {
 const logs=[], module={exports:{}};
 vm.runInNewContext(source,{module,Buffer,process:{env:enabled===null?{}:{SOLO_INTEREST_EVENTS_ENABLED:enabled}},console:{info:s=>logs.push(s),log:()=>assert.fail('unexpected logging'),error:()=>assert.fail('unexpected error logging')}});
 const req={method,headers:{origin:'https://thesoloserviceprovider.com.au','content-type':'application/json',...headers},body};
 if(chunks){delete req.body;req[Symbol.asyncIterator]=async function*(){yield* chunks;};}
 const res={headers:{},setHeader(n,v){this.headers[n]=v;},end(s){this.body=JSON.parse(s);}};
 await module.exports(req,res);return {status:res.statusCode,headers:res.headers,body:res.body,logs};
}
test('measurement endpoint fails closed unless exact enabled flag is set',async()=>{for(const enabled of [null, '', 'false','TRUE','1']){const r=await run({enabled});assert.equal(r.status,503);assert.equal(r.logs.length,0);assert.equal(r.headers['Cache-Control'],'no-store');}});
for(const method of ['GET','PUT','OPTIONS','DELETE']) test(method+' is rejected with Allow POST',async()=>{const r=await run({method});assert.equal(r.status,405);assert.equal(r.headers.Allow,'POST');assert.equal(r.logs.length,0);});
test('cross-origin, missing, null and lookalike origins rejected',async()=>{for(const origin of [undefined,'null','https://attacker.test','https://thesoloserviceprovider.com.au.attacker.test','http://thesoloserviceprovider.com.au']){const r=await run({headers:{origin}});assert.equal(r.status,403);assert.equal(r.logs.length,0);}});
test('www origin is accepted without exposing cross-origin CORS headers',async()=>{const r=await run({headers:{origin:'https://www.thesoloserviceprovider.com.au'}});assert.equal(r.status,200);assert.equal(r.headers['Access-Control-Allow-Origin'],undefined);});
test('GPC and DNT suppress recording before parsing or logging',async()=>{for(const headers of [{'sec-gpc':'1'},{dnt:'1'}]){const r=await run({headers,body:'not json'});assert.equal(r.status,200);assert.deepEqual(r.body,{recorded:false});assert.equal(r.logs.length,0);}});
test('only JSON MIME accepted while charset parameter is allowed',async()=>{for(const type of ['text/plain','application/jsonp','application/json-malicious','']){const r=await run({headers:{'content-type':type}});assert.equal(r.status,415);assert.equal(r.logs.length,0);}assert.equal((await run({headers:{'content-type':'application/json; charset=utf-8'}})).status,200);});
test('declared oversize rejected',async()=>{const r=await run({headers:{'content-length':'513'}});assert.equal(r.status,413);assert.equal(r.logs.length,0);});
test('actual UTF-8 bytes enforce limit for parsed body, string body and streamed body',async()=>{
 const oversized={...valid,email:'界'.repeat(150)};
 for(const args of [{body:oversized},{body:JSON.stringify(oversized)},{chunks:[Buffer.from(JSON.stringify(oversized))]},{chunks:[Buffer.from(' '.repeat(300)),Buffer.from(' '.repeat(300))]}]){const r=await run({...args,headers:{'content-length':'1'}});assert.equal(r.status,413);assert.equal(r.logs.length,0);}
});
test('malformed or empty JSON is rejected for parsed and streamed requests',async()=>{for(const args of [{body:'{'},{body:''},{chunks:[Buffer.from('{')]},{chunks:[]}]){const r=await run(args);assert.equal(r.status,400);assert.equal(r.logs.length,0);}});
test('extra keys, identities, wrong shapes and unsupported values rejected without logging',async()=>{
 const bodies=[null,[],42,'"text"',{...valid,email:'private@example.test'},{...valid,ip:'127.0.0.1'},{...valid,referrer:'https://private.test'},{...valid,event:'signup_confirmed'},{...valid,product:'unapproved-product'},{...valid,page:'/path?email=private@example.test'},{event:valid.event,product:valid.product},{...valid,event:{toString:'product_interest'}}];
 for(const body of bodies){const r=await run({body});assert.equal(r.status,400,JSON.stringify(body));assert.equal(r.logs.length,0);}
});
test('accepted metrics log only exact whitelisted labels, never headers or request identity',async()=>{
 const r=await run({headers:{cookie:'secret-cookie',authorization:'private-token','x-forwarded-for':'192.0.2.1',referer:'https://private.test/?email=private@example.test','user-agent':'private-device'}});
 assert.equal(r.status,200);assert.deepEqual(r.body,{recorded:true});assert.equal(r.logs.length,1);
 assert.deepEqual(JSON.parse(r.logs[0]),{type:'solo_launch_interest_v1',...valid});
 assert.doesNotMatch(r.logs[0],/private|secret|192\.0\.2|cookie|authorization|referrer|user-agent/);
});
test('both operational events and page labels are accepted; accepted is not confirmed consent',async()=>{
 for(const event of ['product_interest','signup_request_accepted'])for(const page of ['home','products']){const r=await run({body:{...valid,event,page}});assert.equal(r.status,200);assert.equal(JSON.parse(r.logs[0]).event,event);}
});
test('all ten product IDs and the collection option are accepted',async()=>{
 const ids=['all-products','solo-cashflow-control','solo-quote-invoice-builder','solo-client-booking-follow-up','solo-job-application-command-centre','solo-content-repurposing-studio','solo-customer-support-desk','solo-small-business-operations-hub','solo-digital-product-launch-system','solo-business-research-dashboard','solo-ai-workflow-starter-pack'];
 for(const product of ids)assert.equal((await run({body:{...valid,product}})).status,200,product);
});
test('streamed valid payload is accepted across chunk boundaries',async()=>{const s=JSON.stringify(valid);const r=await run({chunks:[Buffer.from(s.slice(0,9)),Buffer.from(s.slice(9))]});assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.logs[0]),{type:'solo_launch_interest_v1',...valid});});
