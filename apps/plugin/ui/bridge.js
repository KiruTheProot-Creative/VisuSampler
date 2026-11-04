/* Talks to the plugin. Same protocol as JUCE's WebBrowserComponent native integration:
   calls go out as "__juce__invoke" events and come back as "__juce__complete". */
const B=()=>window.__JUCE__&&window.__JUCE__.backend;
let nextId=1;const pending=new Map();
function ensureListener(){
  if(ensureListener.done||!B())return;ensureListener.done=true;
  B().addEventListener('__juce__complete',({promiseId,result})=>{const p=pending.get(promiseId);if(p){pending.delete(promiseId);p(result);}});
}
export function call(name,...params){
  ensureListener();
  if(!B())return Promise.reject(new Error('not running inside VisuPlayer'));
  const id=nextId++;
  return new Promise(res=>{pending.set(id,res);B().emitEvent('__juce__invoke',{name,params,resultId:id});});
}
export function on(event,fn){if(B())B().addEventListener(event,fn);}
export const inPlugin=()=>!!B();
