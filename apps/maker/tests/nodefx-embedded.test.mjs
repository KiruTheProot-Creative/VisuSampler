// NodeFX as the plugin really shows it: only the files built into the plugin (the NodeFXUI list in
// apps/plugin/nodefx/CMakeLists.txt), each found by its own name the way NodeFXEditor::resource does, on JUCE's
// resource origin, with a stand-in for JUCE's native bridge (window.__JUCE__) that answers like NodeFXProcessor.
// Catches a blank editor: a file the page needs that is not built in, a broken lookup, a script error.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './_helper.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),nfxDir=path.join(root,'apps/plugin/nodefx');
const cm=fs.readFileSync(path.join(nfxDir,'CMakeLists.txt'),'utf8');
const list=cm.slice(cm.indexOf('juce_add_binary_data(NodeFXUI'),cm.indexOf(')',cm.indexOf('juce_add_binary_data(NodeFXUI'))).split(/\s+/).filter(s=>s.startsWith('../'));
const files=new Map(list.map(f=>{const abs=path.resolve(nfxDir,f);return[path.basename(abs),abs];}));
const factory=JSON.parse(fs.readFileSync(path.join(nfxDir,'presets/factoryPresets.json'),'utf8'));
const fails=[],missing=[],errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
ok(list.length===files.size,'every built-in file has its own name ('+list.length+' files)');
const mime=f=>f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.ttf')?'font/ttf':'application/octet-stream';
const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:780}});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.origin!=='https://juce.backend'){return r.abort();}
  const file=u.pathname.split('/').pop()||'nodefx.html';   // NodeFXEditor::resource: by the file's own name
  const abs=files.get(file);
  if(!abs){missing.push(u.pathname);return r.fulfill({status:404,body:''});}
  return r.fulfill({status:200,contentType:mime(file),body:fs.readFileSync(abs)});
});
await p.exposeFunction('__nfxFactory',()=>JSON.stringify(factory));
await p.addInitScript(()=>{
  /* JUCE's bridge: "__juce__invoke" goes out, "__juce__complete" comes back */
  const ls={};let rack=null,presets=null;
  const answer=async(name,a)=>{
    if(!presets)presets=JSON.parse(await window.__nfxFactory());
    if(name==='getRack')return rack;
    if(name==='setRack'){rack=a[0];return true;}
    if(name==='listPresets')return presets.map(x=>({id:'f:'+x.bank+'/'+x.name,name:x.name,bank:x.bank,factory:true}));
    if(name==='loadPreset'){const x=presets.find(q=>'f:'+q.bank+'/'+q.name===a[0]);return x?JSON.stringify(x.state):null;}
    if(name==='getVersion')return'NodeFX test';
    return true;};
  window.__nfxCalls=[];
  window.__JUCE__={backend:{
    addEventListener:(n,f)=>{(ls[n]=ls[n]||[]).push(f);},
    removeEventListener:()=>{},
    emitEvent:(n,d)=>{if(n!=='__juce__invoke')return;window.__nfxCalls.push(d.name);
      answer(d.name,d.params).then(result=>setTimeout(()=>(ls.__juce__complete||[]).forEach(f=>f({promiseId:d.resultId,result})),5));}},
    initialisationData:{}};
});
await p.goto('https://juce.backend/apps/maker/nodefx.html');
await p.waitForTimeout(2500);
ok(missing.length===0,'everything the page loads is built into the plugin'+(missing.length?' (missing: '+missing.join(', ')+')':''));
ok(errs.length===0,'no script errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
const st=await p.evaluate(()=>({nodefx:document.body.classList.contains('nodefx'),nodes:document.querySelectorAll('#fxStage .fxn,#fxStage [data-node]').length,
  name:(document.querySelector('#nfxPName')||{}).textContent||'',knobs:document.querySelectorAll('.nfxk[data-i]').length,
  h:document.body.getBoundingClientRect().height,calls:window.__nfxCalls.slice()}));
ok(st.nodefx&&st.h>500,'the editor shows (not a blank page)');
ok(st.name.includes(factory[0].name),'the first factory preset loads through the bridge ('+st.name.trim()+')');
ok(st.knobs===8,'8 macro knobs');
ok(st.nodes>0,'the chain\'s modules are drawn ('+st.nodes+')');
ok(st.calls.includes('getRack')&&st.calls.includes('setRack'),'the page talks to the plugin ('+[...new Set(st.calls)].join(', ')+')');
await p.screenshot({path:path.join((await import('node:os')).tmpdir(),'nodefx-embedded.png')}).catch(()=>{});
await b.close();
console.log(fails.length?fails.length+' FAILED':'ALL OK');process.exit(fails.length?1:0);
