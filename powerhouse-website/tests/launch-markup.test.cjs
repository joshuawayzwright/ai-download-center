const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('ten honest previews, specific signup anchors and clear unchecked consent on both catalogues',()=>{
 for(const file of ['index.html','digital-products.html']){
  const s=fs.readFileSync(path.join(root,'powerhouse-website',file),'utf8');
  assert.equal((s.match(/<details class="product-preview">/g)||[]).length,10);
  assert.equal((s.match(/not a working product demo/g)||[]).length,10);
  assert.equal((s.match(/data-launch-interest="/g)||[]).length,10);
  assert.equal((s.match(/class="pending"/g)||[]).length,10);
  assert.match(s,/name="consent" type="checkbox" required/);
  assert.doesNotMatch(s,/name="consent"[^>]*checked/);
  assert.match(s,/No information is submitted/);
  assert.match(s,/type="submit" disabled/);
  assert.match(s,/id="launch-notify"/);
  assert.doesNotMatch(s,/static\.klaviyo\.com|buy\.stripe\.com/);
 }
});
test('log report excludes identifiers and flags truncated exports',()=>{
 const e={type:'solo_launch_interest_v1',event:'product_interest',product:'solo-cashflow-control',page:'home'};
 const input=[
  {type:'log',data:{message:JSON.stringify(e),ip:'192.0.2.1',email:'private@example.test'}},
  {...e,email:'reject@example.test'},
  {type:'summary',data:{pagination:{hasMore:true},excludedIntervals:[]}}
 ].map(JSON.stringify).join('\n');
 const r=spawnSync(process.execPath,[path.join(root,'scripts/summarize-launch-interest.cjs')],{input,encoding:'utf8'});
 assert.equal(r.status,0);const result=JSON.parse(r.stdout);
 assert.equal(result.counts[0].count,1);assert.match(result.export_status,/partial/);
 assert.doesNotMatch(r.stdout,/192\.0\.2\.1|private@|reject@/);
});
