import {openApp} from './_helper.mjs';
import fs from 'node:fs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');
const before=await p.evaluate(async()=>{
  const v=window.__vs,S=v.S;v.ensureAudio();
  S.lib.name='Round Trip';S.lib.author='Tester';
  const s=S.samples[0];v.smOp&&0;S.zones[0].vol=-4.5;S.zones[2].pan=33;
  /* an image asset used by the banner */
  const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#e33';x.fillRect(0,0,400,200);
  const url=c.toDataURL('image/png'),im=new Image();im.src=url;await im.decode();
  const sig=id=>{const b=v.BUF.get(id);let h=0;for(let i=0;i<b.ch[0].length;i+=97)h=(h*31+Math.round(b.ch[0][i]*32767))|0;return h;};
  return{name:S.lib.name,zones:S.zones.length,samples:S.samples.length,els:S.els.length,vol:S.zones[0].vol,pan:S.zones[2].pan,sig:S.samples.map(s=>sig(s.id)),frames:S.samples.map(s=>s.frames),imgW:400,tags:S.tags.length,url};
});
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#projSave')]);
const path='/tmp/roundtrip.vmproj';await dl.saveAs(path);
ok(/\.vmproj/.test(dl.suggestedFilename()),'saved as '+dl.suggestedFilename()+' ('+fs.statSync(path).size+' bytes)');
await p.reload();await p.waitForTimeout(800);
await p.setInputFiles('#fileProj',path);await p.waitForTimeout(1500);
const after=await p.evaluate(()=>{
  const v=window.__vs,S=v.S,sig=id=>{const b=v.BUF.get(id);let h=0;for(let i=0;i<b.ch[0].length;i+=97)h=(h*31+Math.round(b.ch[0][i]*32767))|0;return h;};
  return{name:S.lib.name,zones:S.zones.length,samples:S.samples.length,els:S.els.length,vol:S.zones[0].vol,pan:S.zones[2].pan,sig:S.samples.map(s=>sig(s.id)),frames:S.samples.map(s=>s.frames),tags:S.tags.length};
});
ok(after.name==='Round Trip','library name restored');
ok(after.zones===before.zones&&after.samples===before.samples,'same zones and samples');
ok(after.els===before.els&&after.tags===before.tags,'same designer elements and tags ('+after.els+', '+after.tags+')');
ok(after.vol===-4.5&&after.pan===33,'zone edits restored');
ok(JSON.stringify(after.sig)===JSON.stringify(before.sig),'audio is identical');
// bad file
await p.evaluate(()=>{});await p.setInputFiles('#fileProj',{name:'x.vmproj',mimeType:'application/octet-stream',buffer:Buffer.alloc(30)});await p.waitForTimeout(300);
ok(/Could not open/.test(await p.textContent('#msg')),'bad file gives a friendly message');
// a built library is refused as a project
const lib=await p.evaluate(async()=>{const r=await window.__vs.buildVsamp();return Array.from(r.bytes);});
await p.setInputFiles('#fileProj',{name:'lib.vmproj',mimeType:'application/octet-stream',buffer:Buffer.from(lib)});await p.waitForTimeout(300);
ok(/finished library/.test(await p.textContent('#msg')),'a finished .vsamp is not opened as a project');
// reopened project still exports and plays
const ex=await p.evaluate(async()=>{const v=window.__vs;v.ensureAudio();const r=await v.buildVsamp();await new Promise(r=>setTimeout(r,2500));v.noteOn(53,100);await new Promise(r=>setTimeout(r,300));const n=v.SV.list.length+(v.ENG?v.ENG.voices:0);v.noteOff(53);return{ok:(await v.parseVsamp(r.bytes)).ok,voices:n};});
ok(ex.ok&&ex.voices>0,'reopened project exports and plays ('+ex.voices+' voices)');
ok(app.errs.length===0,'no page errors '+app.errs.join('|'));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
