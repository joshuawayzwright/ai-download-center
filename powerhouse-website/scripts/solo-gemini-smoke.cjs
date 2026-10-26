// Temporary preview-only provider connectivity test; no credentials or model text logged.
(async()=>{
 if(process.env.VERCEL_ENV!=="preview"){console.log("SOLO_GEMINI_SKIPPED");return;}
 const key=process.env.GEMINI_API_KEY;
 if(!key){console.error("SOLO_GEMINI_NO_KEY");process.exitCode=1;return;}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":key},signal:controller.signal});
  if(!response.ok){console.error("SOLO_GEMINI_MODELS_HTTP_"+response.status);process.exitCode=1;return;}
  const body=await response.json();
  const models=(body.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>m.name);
  console.log("SOLO_GEMINI_SUPPORTED_MODELS:",models.slice(0,18).join(","));
  if(!models.length){console.error("SOLO_GEMINI_NO_GENERATION_MODELS");process.exitCode=1;return;}
 }catch(e){console.error("SOLO_GEMINI_NETWORK_ERROR");process.exitCode=1}
 finally{clearTimeout(timer)}
})();
