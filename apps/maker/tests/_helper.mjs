import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch(e){pw=createRequire('/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/v4/')('playwright');}
export const chromium=pw.chromium;
export async function openApp(viewport){
  const {server}=await import('../../../tools/serve.mjs');
  await new Promise(r=>server.listen(0,r));
  const port=server.address().port,b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:viewport||{width:1500,height:860}}),errs=[];
  p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|fonts\.g/.test(m.text()))errs.push(m.text());});
  await p.addInitScript(()=>{window.__VSTEST=1;});
  await p.goto('http://localhost:'+port+'/apps/maker/');await p.waitForTimeout(700);
  return{p,b,errs,close:async()=>{await b.close();server.close();}};
}
