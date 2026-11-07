import {openApp} from './_helper.mjs';
import fs from 'node:fs';
import {readVsamp,writeVsamp,Pack,crc32,decodePCM} from '../../../packages/core/src/index.js';
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
/* audio is saved as plain float now (fast), with checksums that match */
{const r=readVsamp(new Uint8Array(fs.readFileSync(path))),A=Object.values(r.manifest.audio);let good=0;
 for(const a of A){const d=await r.blob(a.data);if(a.data.enc==='raw'&&crc32(d)===a.data.crc&&d.length===a.data.raw)good++;}
 ok(A.length>0&&good===A.length,'project audio is stored as plain float with good checksums ('+good+'/'+A.length+')');}
/* projects saved by older Makers (deflated audio) still open, with the exact same audio */
{const r=readVsamp(new Uint8Array(fs.readFileSync(path))),m=JSON.parse(JSON.stringify(r.manifest)),pack=new Pack();let packed=0;
 const keys=['audio','assets','fonts'];const all=[];keys.forEach(k=>Object.keys(m[k]||{}).forEach(id=>all.push([k,id])));
 for(const [k,id] of all){const raw=await r.blob(m[k][id].data);m[k][id].data=await pack.add(raw,{compress:k==='audio'});if(m[k][id].data.enc==='deflate')packed++;}
 const old=writeVsamp(m,pack);
 await p.setInputFiles('#fileProj',{name:'old.vmproj',mimeType:'application/octet-stream',buffer:Buffer.from(old)});await p.waitForTimeout(1500);
 const sig=await p.evaluate(()=>{const v=window.__vs;const s=id=>{const b=v.BUF.get(id);let h=0;for(let i=0;i<b.ch[0].length;i+=97)h=(h*31+Math.round(b.ch[0][i]*32767))|0;return h;};return v.S.samples.map(x=>s(x.id));});
 ok(packed>0&&JSON.stringify(sig)===JSON.stringify(before.sig),'an older project with deflated audio opens with the same audio ('+packed+' deflated)');}
/* desktop app: Save writes back to the same file (a dialog only the first time / for Save as), in pieces */
{const r=await p.evaluate(async()=>{
   const calls=[];window.visuDesktop={saveProject:async(name,parts,file,saveAs)=>{calls.push({name,n:parts.length,file,saveAs,bytes:parts.reduce((a,d)=>a+d.length,0)});window.__parts=parts;return file&&!saveAs?file:'C:/Users/me/'+name+'.vmproj';}};
   const press=sh=>document.dispatchEvent(new KeyboardEvent('keydown',{key:sh?'S':'s',ctrlKey:true,shiftKey:sh,bubbles:true,cancelable:true}));
   press(false);await new Promise(r=>setTimeout(r,1200));press(false);await new Promise(r=>setTimeout(r,1200));press(true);await new Promise(r=>setTimeout(r,1200));
   const parts=window.__parts,all=new Uint8Array(parts.reduce((a,d)=>a+d.length,0));let o=0;for(const d of parts){all.set(d,o);o+=d.length;}
   delete window.visuDesktop;return{calls,msg:document.querySelector('#msg').textContent,all:Array.from(all)};});
 const c=r.calls;let reads=false;try{const rv=readVsamp(new Uint8Array(r.all));reads=rv.manifest.format==='visumaker-project';}catch(e){}
 ok(c.length===3&&c[0].file===null&&!c[0].saveAs&&c[1].file==='C:/Users/me/Round Trip.vmproj'&&!c[1].saveAs&&c[2].saveAs,'Ctrl+S saves to the same file, Ctrl+Shift+S asks again ('+JSON.stringify(c.map(x=>[x.file,x.saveAs]))+')');
 ok(c[0].n>2&&reads&&/Saved to/.test(r.msg),'the desktop app gets the file in pieces ('+c[0].n+' pieces, '+c[0].bytes+' bytes)');
}
ok(app.errs.length===0,'no page errors '+app.errs.join('|'));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
