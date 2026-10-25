"use strict";
/* SOLO AI Business Command — local-first functional prototype.
   No external API requests, payment calls, analytics or network transmission. */
(function(){
const KEY="solo-suite-v1";
const TOOLS=[
{id:"dashboard",short:"DB",name:"Overview",tag:"Your command centre",desc:"A clear view of your saved leads, tasks and business drafts."},
{id:"leadpilot",short:"LP",name:"LeadPilot",tag:"Capture. Follow up. Convert.",desc:"Log customer enquiries, track stages and prepare replies."},
{id:"businessos",short:"OS",name:"Business OS",tag:"Every task in one place",desc:"Manage work priorities and see your sales pipeline."},
{id:"quotesnap",short:"QS",name:"QuoteSnap",tag:"Professional quote drafts",desc:"Calculate and prepare a client quote in seconds."},
{id:"reviewboost",short:"RB",name:"ReviewBoost",tag:"Build trust through reviews",desc:"Create fair, non-incentivised review requests."},
{id:"reelforge",short:"RF",name:"ReelForge",tag:"Create the next campaign",desc:"Build vertical video scripts and shot lists."},
{id:"siteagent",short:"SA",name:"SiteAgent",tag:"Your website knowledge base",desc:"Save FAQ answers and test a local assistant preview."},
{id:"contentmachine",short:"CM",name:"Content Machine",tag:"Never stare at a blank page",desc:"Prepare platform-specific marketing copy."},
{id:"proposalpro",short:"PP",name:"Proposal Pro",tag:"Win work with clear scope",desc:"Draft client proposals and next steps."},
{id:"kitlab",short:"KL",name:"KitLab",tag:"Your business playbook",desc:"Create a reusable customised AI prompt pack."},
{id:"inboxcommander",short:"IC",name:"Inbox Commander",tag:"Triage, then respond",desc:"Prioritise pasted emails and draft a reply."}
];
const FIELDS={
leadpilot:[["customer","Customer / company","text","e.g. Taylor at Coast Cleaning"],["contact","Email or phone","text","Customer contact"],["need","What do they need?","textarea","Describe the enquiry"],["value","Potential job value (AUD)","number","300"],["followup","Follow-up date","date"]],
businessos:[["task","Task","text","Follow up three outstanding quotes"],["priority","Priority","select",["High","Normal","Low"]],["due","Due date","date"]],
quotesnap:[["customer","Client name","text","Customer name"],["service","Service description","textarea","e.g. Driveway pressure wash"],["rate","Unit price (AUD)","number","150"],["quantity","Quantity","number","1"],["gst","Include 10% GST?","select",["No","Yes"]]],
reviewboost:[["customer","Customer first name","text","Taylor"],["business","Your business name","text","Your business"],["reviewLink","Your public review URL","url","https://..."],["channel","Invite via","select",["Email","SMS"]]],
reelforge:[["business","Business name","text","Your business"],["topic","Service or product","text","Exterior cleaning"],["offer","Call to action / offer","textarea","Book a free quote"],["style","Tone","select",["Professional","Friendly","Bold"]]],
siteagent:[["question","Customer FAQ question","text","How do I book?"],["answer","Approved response","textarea","Use the booking form on our website."]],
contentmachine:[["business","Business name","text","Your business"],["audience","Ideal customer","text","Busy homeowners"],["offer","Service or offer","textarea","Reliable end-of-lease cleaning"],["channel","Channel","select",["Facebook","Instagram","LinkedIn","Google Business"]]],
proposalpro:[["business","Your business name","text","Your business"],["client","Client name","text","Customer"],["scope","Scope of work","textarea","Detailed deliverables and exclusions"],["price","Quoted amount (AUD)","number","500"],["timeline","Delivery timeframe","text","Within 5 business days"]],
kitlab:[["business","Business name","text","Your business"],["industry","Industry","text","Landscaping"],["goal","Main business goal","textarea","More qualified local leads"]],
inboxcommander:[["sender","Sender / contact","text","Customer name"],["message","Paste the enquiry or email","textarea","Message content"],["voice","Reply style","select",["Professional","Friendly","Brief"]]]
};
const defaults={leads:[],tasks:[],quotes:[],reviews:[],reels:[],faqs:[],posts:[],proposals:[],kits:[],inbox:[]};
const bucket={leadpilot:"leads",businessos:"tasks",quotesnap:"quotes",reviewboost:"reviews",reelforge:"reels",siteagent:"faqs",contentmachine:"posts",proposalpro:"proposals",kitlab:"kits",inboxcommander:"inbox"};
let db=load(), route="dashboard", latest="",toastTimer=0;
function load(){try{const p=JSON.parse(localStorage.getItem(KEY)||"{}");const o={};Object.keys(defaults).forEach(k=>o[k]=Array.isArray(p[k])?p[k].slice(0,500):[]);return o;}catch(e){return structuredClone(defaults);}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(db));return true;}catch(e){toast("Browser storage is full or unavailable. Export your data.");return false;}}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v){const n=new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(v)||0);return n.startsWith("$")?"A"+n:n;}
function pretty(v){return String(v||"").trim();}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.hidden=true,3400);}
function id(){return "rec-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);}
function today(){return new Date().toISOString().slice(0,10);}
function nav(){document.getElementById("nav").innerHTML=TOOLS.map(x=>'<button class="nav-item '+(x.id===route?'active':'')+'" data-go="'+x.id+'" type="button" '+(x.id===route?'aria-current="page"':'')+'><span class="nav-mark">'+x.short+'</span>'+esc(x.name)+'</button>').join("");}
function header(x){return '<div class="hero"><div><p class="eyebrow">SOLO AI / '+(x.id==="dashboard"?"CONTROL CENTRE":"TOOL "+String(TOOLS.indexOf(x)).padStart(2,"0"))+'</p><h1 class="title">'+esc(x.name)+'<em>'+(x.id==="dashboard"?' .':'')+'</em></h1><p class="lede">'+esc(x.tag)+'. '+esc(x.desc)+'</p></div><div><button class="button" type="button" data-go="dashboard">← Overview</button></div></div>';}
function note(){return '<div class="notice">Prototype mode: these are working local tools with template-based drafts. No generative AI, live sending, video rendering, online account, payment or cloud sync is connected. Avoid sensitive customer data on shared devices.</div>';}
function metrics(){const open=db.leads.filter(x=>x.stage!=="Won"&&x.stage!=="Lost");const due=db.tasks.filter(x=>!x.done);const won=db.leads.filter(x=>x.stage==="Won");return [
["Open leads",open.length,"Manually entered"],
["Pipeline value",money(open.reduce((a,x)=>a+(Number(x.value)||0),0)),"Estimates, not revenue"],
["Tasks to do",due.length,"Personal task list"],
["Won leads",won.length,"Manually marked as won"]].map(a=>'<article class="kpi"><div class="klabel">'+a[0]+'</div><strong>'+a[1]+'</strong><small>'+a[2]+'</small></article>').join("");}
function overview(){return '<div class="hero"><div><p class="eyebrow">THE SOLO SERVICE PROVIDER / YOUR AI BUSINESS HUB</p><h1 class="title">Run your business.<br><em>Not your workload.</em></h1><p class="lede">Ten connected tools, one clean workspace. Start with a real enquiry, task or campaign brief. Your drafts and records remain on this device for now.</p></div><button class="button gold" type="button" data-go="leadpilot">Manage leads →</button></div>'+note()+'<div class="kpis">'+metrics()+'</div><div class="section"><h2>The SOLO tool suite</h2><span>10 modules · local prototype</span></div><div class="modules">'+TOOLS.slice(1).map(x=>'<button class="module" type="button" data-go="'+x.id+'"><span class="module-icon">'+x.short+'</span><strong>'+esc(x.name)+'</strong><span class="desc">'+esc(x.desc)+'</span><span class="arrow">Open tool ↗</span></button>').join("")+'</div>';}
function inputHtml(f){const [name,label,type,opt]=f;let element="";
 if(type==="textarea")element='<textarea id="f-'+name+'" name="'+name+'" required maxlength="3000" placeholder="'+esc(opt)+'"></textarea>';
 else if(type==="select")element='<select id="f-'+name+'" name="'+name+'">'+opt.map(a=>'<option>'+esc(a)+'</option>').join("")+'</select>';
 else element='<input class="input" id="f-'+name+'" name="'+name+'" type="'+type+'" '+(type==="number"?'min="0" step="0.01"':'')+' maxlength="250" '+(type==="date"?'':'required')+' placeholder="'+esc(opt||"")+'">';
 return '<div class="field"><label for="f-'+name+'">'+esc(label)+'</label>'+element+'</div>';}
function renderTool(x){
 const col=bucket[x.id];
 const form='<form class="stack" id="tool-form" data-tool="'+x.id+'">'+FIELDS[x.id].map(inputHtml).join("")+'<div class="actions"><button class="button gold" type="submit">Generate & save →</button><button class="button" type="reset">Clear</button></div></form>';
 const other=x.id==="siteagent"?'<hr class="hr"><form class="stack" id="faq-try"><div class="field"><label for="customer-question">Test a customer question</label><input id="customer-question" name="question" class="input" required maxlength="250" placeholder="What are your opening hours?"></div><button class="button" type="submit">Test local FAQ matching</button></form>':'';
 const recent='<div class="section"><h2>Saved '+(x.id==="businessos"?"tasks":x.id==="siteagent"?"FAQs":"drafts / records")+'</h2><span>'+db[col].length+' saved on this device</span></div><div id="records">'+listRecords(x.id)+'</div>';
 return header(x)+note()+'<div class="tool-grid"><section class="panel"><h2>'+esc(x.tag)+'</h2><p class="panel-sub">Enter your details. SOLO prepares a practical, editable template and saves a local record.</p>'+form+other+'</section><section class="panel"><h2>Workspace output</h2><p class="panel-sub">Generated drafts are available to copy or export as text.</p><div class="output '+(latest?"":"empty")+'" id="generated">'+esc(latest||"Your generated result will appear here after submitting the form.")+'</div><div class="actions"><button type="button" class="button sm" data-action="copy">Copy result</button><button type="button" class="button sm" data-action="text">Download .txt</button></div>'+recent+'</section></div>';
}
function listRecords(tool){const rows=db[bucket[tool]];if(!rows.length)return '<div class="empty-state">Nothing saved yet.<br>Use the form to create your first record.</div>';
 return rows.slice().reverse().slice(0,15).map(r=>'<div class="record"><div><strong>'+esc(recordTitle(tool,r))+'</strong><small>'+esc(r.created||"")+'</small>'+(tool==="leadpilot"?'<span class="pill">'+esc(r.stage||"New")+'</span>':tool==="businessos"?'<span class="pill">'+(r.done?'Done':'To do')+'</span>':'')+'</div><div class="record-actions">'+(tool==="leadpilot"?'<button class="button sm" data-advance="'+esc(r.id)+'">Next stage</button>':'')+(tool==="businessos"?'<button class="button sm" data-task="'+esc(r.id)+'">'+(r.done?'Reopen':'Done')+'</button>':'')+'<button class="button sm" data-load="'+esc(r.id)+'" aria-label="View saved record">View</button><button class="button sm danger" data-delete="'+esc(r.id)+'" aria-label="Delete saved record">×</button></div></div>').join("");
}
function recordTitle(tool,r){return ({leadpilot:r.customer,businessos:r.task,quotesnap:r.customer+" — "+r.service,reviewboost:r.customer,reelforge:r.topic,siteagent:r.question,contentmachine:r.business+" — "+r.channel,proposalpro:r.client,kitlab:r.business,inboxcommander:r.sender})[tool]||"Untitled";}
function generate(tool,v){
 const business=pretty(v.business)||"your business",client=pretty(v.customer||v.client||v.sender)||"there",offer=pretty(v.offer)||"our services",need=pretty(v.need),subject=pretty(v.service);
 switch(tool){
 case "leadpilot":return "LEAD RECORD — "+client+"\nContact: "+pretty(v.contact)+"\nNeed: "+need+"\nOpportunity: "+money(v.value)+"\nFollow-up date: "+(v.followup||"Not scheduled")+"\n\nSUGGESTED REPLY (review before sending)\nHi "+client+",\n\nThanks for reaching out about "+need+". I would be happy to discuss what you need and provide a clear quote. What is the best time for a quick call?\n\nKind regards,\nYour business";
 case "businessos":return "TASK: "+v.task+"\nPriority: "+v.priority+"\nDue: "+(v.due||"Unscheduled")+"\nStatus: To do\n\nNEXT ACTION\nSet a calendar reminder, prepare any required information and mark the task complete when finished.";
 case "quotesnap":{const price=Number(v.rate)||0,qty=Number(v.quantity)||0,sub=price*qty,gst=v.gst==="Yes"?sub*.1:0;return "DRAFT QUOTE\nClient: "+client+"\nPrepared: "+today()+"\n\nService: "+subject+"\nQuantity: "+qty+"\nUnit price: "+money(price)+"\nSubtotal: "+money(sub)+"\nGST: "+money(gst)+"\nTOTAL: "+money(sub+gst)+"\n\nSubject to scope confirmation, availability and written acceptance. Confirm GST registration and invoicing requirements before issuing.";}
 case "reviewboost":return "REVIEW INVITATION — "+v.channel+"\n\nHi "+client+",\n\nThank you for choosing "+business+". We would appreciate honest feedback about your experience. If you have a moment, you can leave a review here:\n"+v.reviewLink+"\n\nWe welcome all feedback, positive or negative. Thank you for supporting our small business.\n\n"+business+"\n\nNote: No rewards, selective requests or pressure for a positive rating.";
 case "reelforge":return "VERTICAL REEL STORYBOARD — 9:16 | 25 seconds\nBusiness: "+business+"\nStyle: "+v.style+"\nTopic: "+v.topic+"\n\n00–04s  HOOK: 'Need help with "+v.topic+"?'\n04–10s  SHOW: A genuine before/after or customer problem.\n10–17s  PROOF: Your process, result or authorised testimonial.\n17–22s  VALUE: Why your service is worth choosing.\n22–25s  CTA: "+offer+"\n\nCAPTION\n"+business+" makes "+v.topic+" simpler. "+offer+"\n\nSHOT NOTES\nFilm vertically in good light. Secure customer consent. Use royalty-cleared music. Verify all claims.\n\nStoryboard only: no actual video has been rendered.";
 case "siteagent":return "FAQ SAVED FOR LOCAL PREVIEW\n\nQUESTION\n"+v.question+"\n\nAPPROVED ANSWER\n"+v.answer+"\n\nThis record helps test a keyword-based FAQ matcher on this device. It is not yet deployed as a website chatbot.";
 case "contentmachine":{let hook=v.channel==="LinkedIn"?"A smarter way to approach ":v.channel==="Instagram"?"Here's what better looks like: ":v.channel==="Google Business"?"Local service spotlight: ":"Looking for reliable help with ";return v.channel.toUpperCase()+" CONTENT DRAFT\n\n"+hook+offer+"\n\n"+business+" helps "+v.audience+" with "+offer+".\n\nWhat you can expect:\n• Clear communication\n• A straightforward process\n• Service tailored to your needs\n\nSend us a message to learn more or request a quote.\n\n#SmallBusiness #LocalService\n\nReview hashtags, offers and claims before publication.";}
 case "proposalpro":return "SERVICE PROPOSAL — DRAFT\nPrepared by: "+business+"\nPrepared for: "+v.client+"\nDate: "+today()+"\n\nOBJECTIVE & SCOPE\n"+v.scope+"\n\nPROPOSED INVESTMENT\n"+money(v.price)+" AUD (tax treatment to confirm)\n\nESTIMATED DELIVERY\n"+v.timeline+"\n\nNEXT STEPS\n1. Confirm deliverables and any exclusions.\n2. Agree payment milestones and timing.\n3. Execute an appropriate agreement before work begins.\n\nProposal draft only; not legal advice or a binding contract.";
 case "kitlab":return "SOLO KITLAB — PERSONALISED PROMPT PACK\nBusiness: "+business+"\nIndustry: "+v.industry+"\nGoal: "+v.goal+"\n\nPROMPT 1 — CUSTOMER RESEARCH\nAct as a research assistant for a "+v.industry+" business. Identify five customer pain points connected to this goal: "+v.goal+". State assumptions and avoid inventing customer data.\n\nPROMPT 2 — MARKETING\nWrite five authentic marketing hooks for "+business+". Audience: local clients interested in "+v.industry+". Use a helpful tone and clear calls to action.\n\nPROMPT 3 — SALES FOLLOW-UP\nDraft a concise, helpful follow-up to a prospective customer who has requested a quote but not replied. Avoid pressure or fake urgency.\n\nCHECKLIST\n□ Verify facts, legal claims and pricing\n□ Protect personal and customer information\n□ Adapt copy to the real offer\n□ Track enquiries and conversions";
 case "inboxcommander":{const msg=v.message.toLowerCase();const priority=/urgent|complaint|refund|cancel|problem|immediately/.test(msg)?"HIGH":/quote|price|book|availability|order/.test(msg)?"SALES":"NORMAL";return "INBOX TRIAGE — MANUAL\nSender: "+v.sender+"\nSuggested category: "+priority+"\nReason: Based on simple keywords in pasted text, not an AI classifier.\n\nDRAFT RESPONSE — "+v.voice+"\nHi "+client+",\n\nThank you for your message. I've received your enquiry and will review the details so I can give you an accurate response. If there is a time-sensitive detail, please let me know.\n\nKind regards,\nYour business\n\nNo email was sent. Review and personalise before copying.";}
 default:return "";
 }
}
function routeTo(next){route=TOOLS.some(x=>x.id===next)?next:"dashboard";latest="";location.hash=route;render();document.getElementById("sidebar").classList.remove("open");document.getElementById("menuButton").setAttribute("aria-expanded","false");window.scrollTo(0,0);}
function render(){nav();document.getElementById("crumb").textContent=TOOLS.find(x=>x.id===route).name;document.getElementById("main").innerHTML=route==="dashboard"?overview():renderTool(TOOLS.find(x=>x.id===route));}
function values(form){const v={};for(const [k,val] of new FormData(form).entries())v[k]=pretty(val);return v;}
function submitTool(form){const tool=form.dataset.tool;const v=values(form);const output=generate(tool,v);const rec={id:id(),...v,created:new Date().toLocaleString("en-AU"),output};
 if(tool==="leadpilot")rec.stage="New";if(tool==="businessos")rec.done=false;
 db[bucket[tool]].push(rec);persist();latest=output;render();toast("Saved locally — "+TOOLS.find(x=>x.id===tool).name);}
function locate(uid){return (db[bucket[route]]||[]).find(r=>r.id===uid);}
function download(filename,content,mime){const b=new Blob([content],{type:mime||"text/plain;charset=utf-8"}),url=URL.createObjectURL(b),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function copy(txt){if(!txt){toast("Create or view a record first.");return;}if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(txt).then(()=>toast("Copied to clipboard")).catch(()=>toast("Clipboard blocked — use Download .txt"));}else{const t=document.createElement("textarea");t.value=txt;t.style.position="fixed";t.style.opacity="0";document.body.append(t);t.select();const ok=document.execCommand("copy");t.remove();toast(ok?"Copied to clipboard":"Clipboard unavailable — use Download .txt");}}
function testFaq(q){const normal=t=>t.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>3),words=normal(q);let best=null,score=0;db.faqs.forEach(item=>{const pool=normal(item.question);const hits=words.filter(w=>pool.includes(w)).length;if(hits>score){score=hits;best=item;}});return best&&score?"LOCAL FAQ RESULT\n\n"+best.answer+"\n\nMatched from: "+best.question:"No matching FAQ found. Add a relevant question and approved answer first. A production bot needs stronger intent handling and safe fallback rules.";}
document.addEventListener("click",ev=>{
 const go=ev.target.closest("[data-go]");if(go){routeTo(go.dataset.go);return;}
 if(ev.target.closest("#menuButton")){const side=document.getElementById("sidebar");const opened=side.classList.toggle("open");document.getElementById("menuButton").setAttribute("aria-expanded",String(opened));return;}
 const btn=ev.target.closest("button");if(!btn)return;
 if(btn.dataset.action==="export"){download("solo-suite-backup-"+today()+".json",JSON.stringify({format:"solo-suite-v1",exportedAt:new Date().toISOString(),data:db},null,2),"application/json");toast("Workspace backup downloaded");return;}
 if(btn.dataset.action==="copy"){copy(latest);return;}
 if(btn.dataset.action==="text"){if(latest){download("solo-"+route+"-"+today()+".txt",latest);}else toast("Create or view a record first.");return;}
 if(!bucket[route])return;
 const uid=btn.dataset.delete||btn.dataset.load||btn.dataset.advance||btn.dataset.task;if(!uid)return;
 const r=locate(uid);if(!r)return;
 if(btn.dataset.delete){if(!window.confirm("Delete this local record? This cannot be undone."))return;db[bucket[route]]=db[bucket[route]].filter(x=>x.id!==uid);persist();latest="";render();toast("Record deleted");return;}
 if(btn.dataset.load){latest=r.output;render();toast("Saved record opened");return;}
 if(btn.dataset.advance){const stages=["New","Contacted","Quoted","Won","Lost"];r.stage=stages[(stages.indexOf(r.stage)+1)%stages.length];persist();render();toast("Lead moved to "+r.stage);return;}
 if(btn.dataset.task){r.done=!r.done;r.output=r.output.replace(/Status: (To do|Done)/,"Status: "+(r.done?"Done":"To do"));latest=r.output;persist();render();toast(r.done?"Task completed":"Task reopened");}
});
document.addEventListener("submit",ev=>{
 if(ev.target.id==="tool-form"){ev.preventDefault();if(ev.target.reportValidity())submitTool(ev.target);}
 if(ev.target.id==="faq-try"){ev.preventDefault();const q=values(ev.target).question;latest=testFaq(q);render();toast("Local FAQ search completed");}
});
window.addEventListener("hashchange",()=>{const r=location.hash.slice(1);if(r!==route)routeTo(r);});
route=TOOLS.some(t=>t.id===location.hash.slice(1))?location.hash.slice(1):"dashboard";render();
})();
