const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../launch-notify.js'), 'utf8');
function harness({config = {}, navigator = {}, responder = async () => ({status:202})} = {}) {
  class Element {
    constructor(){ this.value=''; this.checked=false; this.listeners={}; this.attrs={}; this.textContent=''; this.disabled=false; }
    addEventListener(n,f){this.listeners[n]=f;}
    setAttribute(n,v){this.attrs[n]=v;}
    removeAttribute(n){delete this.attrs[n];}
    focus(){this.focused=true;}
  }
  const email=new Element(), interest=new Element(), consent=new Element(), button=new Element(), status=new Element(), honeypot=new Element(), form=new Element();
  interest.options=['all-products','solo-cashflow-control'].map(value=>({value}));interest.value='all-products';email.value='person@example.test';consent.checked=true;
  const link=new Element();link.dataset={launchInterest:'solo-cashflow-control'};
  const selectors={'[name="email"]':email,'[name="interest"]':interest,'[name="consent"]':consent,'button[type="submit"]':button,'[name="website"]':honeypot};
  form.querySelector=s=>selectors[s];form.valid=true;form.reportValidity=()=>form.valid;
  const events={}, calls=[], timers=new Map();let timer=0;
  const window={SOLO_LAUNCH_CONFIG:{subscriptionsEnabled:true,metricsEnabled:false,companyId:'UQ4LLB',listId:'SewPSU',revision:'2026-10-15',...config},addEventListener:(n,f)=>events[n]=f};
  vm.runInNewContext(source,{window,navigator,document:{body:{dataset:{launchPage:'products'}},querySelector:s=>s==='#launch-notify-form'?form:status,querySelectorAll:()=>[link]},AbortController,fetch:(url,options)=>{calls.push({url,...options});return responder(url,options,calls.length);},setTimeout:(fn,delay)=>{timers.set(++timer,{fn,delay});return timer;},clearTimeout:id=>timers.delete(id)});
  return {email,interest,consent,button,status,honeypot,form,events,calls,timers,link,submit:()=>form.listeners.submit({preventDefault(){}})};
}
test('checked-in configuration is frozen and both rollout gates are disabled',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../launch-config.js'),'utf8'),{window});
 assert.equal(window.SOLO_LAUNCH_CONFIG.subscriptionsEnabled,false);assert.equal(window.SOLO_LAUNCH_CONFIG.metricsEnabled,false);assert(Object.isFrozen(window.SOLO_LAUNCH_CONFIG));
});
test('disabled rollout prevents all subscription sends and announces preview',async()=>{const h=harness({config:{subscriptionsEnabled:false}});await h.submit();assert.equal(h.calls.length,0);assert.equal(h.button.disabled,true);assert.match(h.status.textContent,/Preview only/);});
for(const [label,change] of [['unchecked consent',h=>h.consent.checked=false],['invalid native form',h=>h.form.valid=false],['unknown product',h=>h.interest.value='attacker'],['honeypot',h=>h.honeypot.value='bot'],['bad email',h=>h.email.value='not email'],['oversized email',h=>h.email.value='a'.repeat(250)+'@x.test']]) {
 test(label+' sends nothing',async()=>{const h=harness();change(h);await h.submit();assert.equal(h.calls.length,0);});
}
test('uses public subscription API, explicit consent and expected list with no credentials',async()=>{
 const h=harness();h.email.value=' person@example.test ';h.interest.value='solo-cashflow-control';await h.submit();const c=h.calls[0];
 assert.equal(c.url,'https://a.klaviyo.com/client/subscriptions/?company_id=UQ4LLB');assert.equal(c.credentials,'omit');assert.equal(c.referrerPolicy,'no-referrer');assert.equal(c.headers.revision,'2026-10-15');assert.equal(c.headers.Authorization,undefined);
 const d=JSON.parse(c.body).data;assert.equal(d.type,'subscription');assert.equal(d.relationships.list.data.id,'SewPSU');assert.equal(d.attributes.profile.data.attributes.email,'person@example.test');assert.equal(d.attributes.profile.data.attributes.subscriptions.email.marketing.consent,'SUBSCRIBED');assert.equal(d.attributes.profile.data.attributes.properties['SOLO Product Interest'],'solo-cashflow-control');
 assert.match(h.status.textContent,/does not confirm a subscription/);assert.equal(h.email.value,'');assert.equal(h.consent.checked,false);assert.equal(h.timers.size,0);assert.equal(h.button.disabled,false);
});
for(const code of [200,201,204,400,429,500]) test('only 202 is accepted, not '+code,async()=>{const h=harness({responder:async()=>({status:code})});await h.submit();assert.doesNotMatch(h.status.textContent,/^Request accepted/);assert.equal(h.email.value,'person@example.test');assert.equal(h.button.disabled,false);assert.equal(h.timers.size,0);});
test('duplicate in-flight submission is blocked; accepted response preserves newer draft',async()=>{let finish;const h=harness({responder:()=>new Promise(r=>finish=r)});const pending=h.submit();h.email.value='new@example.test';await h.submit();assert.equal(h.calls.length,1);assert.equal(h.button.disabled,true);finish({status:202});await pending;assert.equal(h.email.value,'new@example.test');assert.equal(h.form.attrs['aria-busy'],undefined);});
test('network errors preserve drafts and do not claim rejection or confirmed subscription',async()=>{const h=harness({responder:async()=>{throw Error('network');}});await h.submit();assert.equal(h.email.value,'person@example.test');assert.match(h.status.textContent,/may have reached/);assert.equal(h.button.disabled,false);});
test('timeout aborts request and restores retry state',async()=>{const h=harness({responder:(_u,o)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted'))))});const pending=h.submit();const timer=[...h.timers.values()][0];assert.equal(timer.delay,12000);timer.fn();await pending;assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.button.disabled,false);assert.equal(h.email.value,'person@example.test');});
test('pagehide aborts and invalidates late response; persisted pageshow resets consent',async()=>{let finish;const h=harness({responder:()=>new Promise(r=>finish=r)});const pending=h.submit();h.events.pagehide();assert.equal(h.calls[0].signal.aborted,true);h.events.pageshow({persisted:true});const status=h.status.textContent;finish({status:202});await pending;assert.equal(h.status.textContent,status);assert.equal(h.email.value,'person@example.test');assert.equal(h.consent.checked,false);assert.equal(h.button.disabled,false);});
test('metrics disabled by default even when product links are clicked',()=>{const h=harness();h.link.listeners.click();assert.equal(h.calls.length,0);assert.equal(h.interest.value,'solo-cashflow-control');assert.equal(h.email.focused,true);});
for(const privacy of [{doNotTrack:'1'},{globalPrivacyControl:true}]) test('privacy preference suppresses optional metrics '+JSON.stringify(privacy),async()=>{const h=harness({config:{metricsEnabled:true},navigator:privacy});h.link.listeners.click();await h.submit();assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/klaviyo/);});
test('metrics whitelist payload excludes identity, deduplicates and cannot block signup',async()=>{
 const h=harness({config:{metricsEnabled:true},responder:async url=>{if(url.startsWith('/api'))throw Error('metric unavailable');return {status:202};}});h.link.listeners.click();h.link.listeners.click();await h.submit();
 const metrics=h.calls.filter(c=>c.url==='/api/launch-interest');assert.equal(metrics.length,2);
 assert.deepEqual(JSON.parse(metrics[0].body),{event:'product_interest',product:'solo-cashflow-control',page:'products'});
 assert.deepEqual(JSON.parse(metrics[1].body),{event:'signup_request_accepted',product:'solo-cashflow-control',page:'products'});
 for(const c of metrics){assert.equal(c.credentials,'omit');assert.equal(c.referrerPolicy,'no-referrer');assert.doesNotMatch(c.body,/person@|email|referrer|visitor|cookie/i);}
 assert.match(h.status.textContent,/^Request accepted/);
});
test('unknown product link is ignored and emits no metric',()=>{const h=harness({config:{metricsEnabled:true}});h.link.dataset.launchInterest='attacker';h.link.listeners.click();assert.equal(h.calls.length,0);assert.equal(h.interest.value,'all-products');});
test('an old timeout cannot abort a newer request after history restoration',async()=>{
 const finish=[];
 const h=harness({responder:()=>new Promise(resolve=>finish.push(resolve))});
 const old=h.submit();
 const oldTimeout=[...h.timers.values()][0].fn;
 h.events.pagehide();h.events.pageshow({persisted:true});
 h.email.value='new@example.test';h.consent.checked=true;
 const newer=h.submit();
 oldTimeout();
 const newerWasAborted=h.calls[1].signal.aborted;
 finish[0]({status:202});finish[1]({status:202});
 await Promise.all([old,newer]);
 assert.equal(newerWasAborted,false,'stale timer must only ever refer to its own request');
});
