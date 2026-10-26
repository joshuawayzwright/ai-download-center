// One-time, server-side Vercel preview build diagnostic.
// Prints only pass/fail and upstream status; never logs credentials or response text.
(async()=>{
 if(process.env.VERCEL_ENV!=="preview"){console.log("SOLO_DIAGNOSTIC_SKIPPED_NOT_PREVIEW");return;}
 if(!process.env.OPENAI_API_KEY){console.error("SOLO_DIAGNOSTIC_FAIL_NO_PROVIDER_KEY");process.exitCode=1;return;}
 const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",signal:ctl.signal,
   headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({model:process.env.SOLO_AI_MODEL||"gpt-5-mini",input:"Reply with a brief greeting.",max_output_tokens:64,store:false})
  });
  if(!response.ok){console.error("SOLO_DIAGNOSTIC_FAIL_PROVIDER_STATUS_"+response.status);process.exitCode=1;return;}
  const data=await response.json();
  const reply=(data.output||[]).flatMap(i=>i.content||[]).filter(c=>c.type==="output_text").map(c=>c.text).join("").trim();
  if(!reply){console.error("SOLO_DIAGNOSTIC_FAIL_EMPTY_MODEL_RESPONSE");process.exitCode=1;return;}
  console.log("SOLO_DIAGNOSTIC_PASS_REAL_MODEL_REPLY");
 }catch(e){console.error("SOLO_DIAGNOSTIC_FAIL_NETWORK_OR_TIMEOUT");process.exitCode=1}
 finally{clearTimeout(timeout)}
})();
