// Temporary preview-only provider connectivity test; no credentials or model text logged.
(async()=>{
 if(process.env.VERCEL_ENV!=="preview"){console.log("SOLO_GEMINI_SKIPPED");return;}
 const key=process.env.GEMINI_API_KEY;
 if(!key){console.error("SOLO_GEMINI_NO_KEY");process.exitCode=1;return;}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
   method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
   body:JSON.stringify({contents:[{role:"user",parts:[{text:"Say hello in one sentence."}]}],generationConfig:{maxOutputTokens:128}}),signal:controller.signal
  });
  if(!response.ok){console.error("SOLO_GEMINI_HTTP_"+response.status);process.exitCode=1;return;}
  const body=await response.json();
  const answer=(body.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();
  if(!answer){console.error("SOLO_GEMINI_EMPTY");process.exitCode=1;return;}
  console.log("SOLO_GEMINI_REAL_RESPONSE_PASS");
 }catch(e){console.error("SOLO_GEMINI_NETWORK_ERROR");process.exitCode=1}
 finally{clearTimeout(timer)}
})();
