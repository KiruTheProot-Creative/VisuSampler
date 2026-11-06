import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch(e){pw=createRequire('/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/v4/')('playwright');}
export const chromium=pw.chromium;
/* opts.native: a fake desktop bridge (window.visuNative) wired to VisuMakerAudioNull, the native audio core without a
   sound card, so tests run the Maker exactly as the desktop app does with native audio */
export async function openApp(viewport,opts){
  opts=opts||{};
  const {server}=await import('../../../tools/serve.mjs');
  await new Promise(r=>server.listen(0,r));
  const port=server.address().port,b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:viewport||{width:1500,height:860}}),errs=[];
  p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|fonts\.g/.test(m.text()))errs.push(m.text());});
  await p.addInitScript(()=>{window.__VSTEST=1;});
  let proc=null;
  if(opts.native){
    const {spawn}=await import('node:child_process'),fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
    let n=0;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vmtest-'));
    await p.exposeFunction('__naStart',()=>{
      if(proc)return{ok:true};
      proc=spawn(opts.native,[],{stdio:['pipe','pipe','ignore']});let buf='';proc.stdout.setEncoding('utf8');
      proc.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(line.trim())p.evaluate(l=>window.__naRecv&&window.__naRecv(JSON.parse(l)),line).catch(()=>{});}});
      return{ok:true};
    });
    await p.exposeFunction('__naSend',(m,b64)=>{
      if(!proc)return;
      if(m.t==='load'){const f=path.join(dir,'e'+(++n)+'.vsamp');fs.writeFileSync(f,Buffer.from(b64,'base64'));m={t:'load',path:f};}
      proc.stdin.write(JSON.stringify(m)+'\n');
    });
    await p.addInitScript(()=>{
      let cb=null;window.__naRecv=m=>{if(cb)cb(m);};
      const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
      window.visuNative={start:()=>window.__naStart(),stop:async()=>true,on:f=>{cb=f;},
        send:m=>{if(m.t==='load'&&m.bytes){window.__naSend({t:'load'},b64(new Uint8Array(m.bytes)));}else window.__naSend(m,null);}};
    });
  }
  await p.goto('http://localhost:'+port+'/apps/maker/');await p.waitForTimeout(700);
  return{p,b,errs,close:async()=>{if(proc)try{proc.stdin.end();proc.kill();}catch(e){}await b.close();server.close();}};
}
