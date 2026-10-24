/**
 * SOLO model routing policy — pure, provider-independent logic.
 * A model provider adapter, usage budget and authentication are required
 * before any public model call. This file does not invoke external APIs.
 */
export const MODES = Object.freeze(['chat','research','build','agent','studio']);
export const MODELS = Object.freeze({
  fast: {provider:'openai', env:'SOLO_FAST_MODEL'},
  reasoning: {provider:'openai', env:'SOLO_REASONING_MODEL'},
  code: {provider:'openai', env:'SOLO_CODE_MODEL'},
  creative: {provider:'openai', env:'SOLO_CREATIVE_MODEL'}
});
export function route(input) {
  if (!input || typeof input !== 'object') throw new TypeError('request required');
  const mode=String(input.mode||'chat').toLowerCase();
  if(!MODES.includes(mode)) throw new RangeError('unsupported mode');
  const text=String(input.text||'').slice(0,4000);
  if(!text.trim()) throw new TypeError('message required');
  if(mode==='agent') return {mode,profile:'reasoning',requiresApproval:true,tools:[]};
  if(mode==='build'||/\b(code|debug|program|typescript|python|javascript)\b/i.test(text))
    return {mode,profile:'code',requiresApproval:false,tools:[]};
  if(mode==='research')return {mode,profile:'reasoning',requiresApproval:false,tools:['public_search']};
  if(mode==='studio')return {mode,profile:'creative',requiresApproval:false,tools:[]};
  if(text.length>1400||/\b(analyse|analyze|compare|reason|complex)\b/i.test(text))
    return {mode,profile:'reasoning',requiresApproval:false,tools:[]};
  return {mode,profile:'fast',requiresApproval:false,tools:[]};
}
export function validateAgentAction(action,approvedActions=[]) {
  if(!action||typeof action!=='object'||typeof action.id!=='string')return false;
  return approvedActions.includes(action.id);
}
