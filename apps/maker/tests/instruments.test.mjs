// Several instruments in one project (a library): each has its own samples, interface and effects; switching swaps
// everything; the others' samples never show; duplicate, delete, reorder; save and open keep them all; one-instrument
// projects are saved exactly as before.
import {openApp} from './_helper.mjs';
import {readVsamp,readVslib} from '../../../packages/core/src/index.js';
const app=await openApp({width:1500,height:860}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');await p.waitForTimeout(300);
const st=()=>p.evaluate(()=>{const v=window.__vs;return{n:v.INS.list.length,cur:v.INS.cur,names:v.INS.list.map(i=>i.name),banks:v.INS.list.map(i=>i.bank),
  samples:v.S.samples.length,zones:v.S.zones.length,groups:v.S.groups.slice(),buf:[...v.BUF.keys()].length,els:v.S.els.length,label:document.querySelector('#insName').textContent,dirty:v.projDirty()};});
const s0=await st();
ok(s0.n===1&&s0.samples>0&&s0.label.length>0,'a project starts with one instrument ('+s0.label+', '+s0.samples+' samples)');
const oneBytes=await p.evaluate(async()=>Array.from(await window.__vs.saveProject()));
ok(!readVsamp(new Uint8Array(oneBytes)).manifest.instruments,'a one-instrument project is saved exactly as before (no instrument list)');
/* add */
await p.click('#insBtn');await p.click('[data-ia="add"]');await p.waitForTimeout(300);
const s1=await st();
ok(s1.n===2&&s1.samples===0&&s1.zones===0&&s1.buf===0&&s1.els===0,'+ New: an empty instrument, none of the first one\'s samples show ('+JSON.stringify(s1)+')');
ok(await p.evaluate(()=>document.querySelector('#histUndo').disabled),'undo does not reach into the other instrument');
await p.evaluate(()=>{const v=window.__vs,N=48000,a=new Float32Array(N);for(let i=0;i<N;i++)a[i]=Math.sin(i*.05)*.4;
  const s=v.addBuffer('Pad sine',[a],48000);s.root=60;v.addZoneFor(s.id,0,127,{group:'Pads',root:60});v.S.groups.push('Pads');v.rerender();});
await p.click('#insBtn');await p.fill('#insNameIn','Pad A');await p.fill('#insBankIn','01. Pads');await p.press('#insBankIn','Enter');await p.keyboard.press('Escape');
const s2=await st();
ok(s2.label==='Pad A'&&s2.banks[1]==='01. Pads'&&s2.samples===1,'rename it and put it in a bank');
/* switch back */
await p.click('#insBtn');await p.click('[data-ins="ins1"]');await p.waitForTimeout(300);
const s3=await st();
ok(s3.samples===s0.samples&&s3.zones===s0.zones&&s3.els===s0.els&&s3.buf===s0.samples&&s3.label===s0.label,'switching back brings the first instrument back whole, and only its samples');
ok(!s3.groups.includes('Pads'),'the other instrument\'s groups do not show');
/* duplicate, then change the copy */
await p.click('#insBtn');await p.click('[data-ia="dup"]');await p.waitForTimeout(300);
const s4=await st();
ok(s4.n===3&&s4.names[1]===s0.label+' copy'&&s4.samples===s0.samples&&s4.zones===s0.zones,'Duplicate copies the instrument with its samples ('+s4.names.join(', ')+')');
await p.evaluate(()=>{window.__vs.S.zones[0].vol=-12.5;});
await p.click('#insBtn');await p.click('[data-ins="ins1"]');await p.waitForTimeout(300);
ok(await p.evaluate(()=>window.__vs.S.zones[0].vol)!==-12.5,'changing the copy leaves the original alone');
/* reorder */
await p.click('#insBtn');await p.click('[data-ia="down"]');
ok((await st()).names.join('|')===[s0.label+' copy',s0.label,'Pad A'].join('|'),'▼ moves it down the list');
await p.keyboard.press('Escape');
/* save and open */
const bytes=await p.evaluate(async()=>Array.from(await window.__vs.saveProject()));
const man=readVsamp(new Uint8Array(bytes)).manifest;
ok(man.instruments&&man.instruments.length===3&&man.instruments.filter(i=>i.current).length===1&&man.snapshot.zones.length===s0.zones,'the project file holds all three; the one being edited is the main snapshot (older Makers open that one)');
await p.evaluate(()=>{window.__vs.S.zones[0].vol=-3;});
await p.setInputFiles('#fileProj',{name:'lib.vmproj',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});await p.waitForTimeout(1500);
const s5=await st();
ok(s5.n===3&&s5.names.join('|')===[s0.label+' copy',s0.label,'Pad A'].join('|')&&s5.cur==='ins1'&&s5.samples===s0.samples,'opening it brings back all three, in order, on the same instrument');
ok(!s5.dirty,'just opened: nothing unsaved');
await p.click('#insBtn');await p.click('[data-ins="'+(await p.evaluate(()=>window.__vs.INS.list[2].id))+'"]');await p.waitForTimeout(300);
const s6=await st();
ok(s6.label==='Pad A'&&s6.samples===1&&s6.groups.includes('Pads')&&s6.buf===1,'the reopened "Pad A" has its own sample back');
const pk=await p.evaluate(()=>{const v=window.__vs,b=v.BUF.get(v.S.samples[0].id);return[b.ch[0][100],b.ch[0][4000]];});
ok(Math.abs(pk[0]-Math.sin(100*.05)*.4)<1e-6&&Math.abs(pk[1]-Math.sin(4000*.05)*.4)<1e-6,'its audio is exactly what was recorded');
ok(!(await st()).dirty,'switching instruments is not a change');
await p.click('#insBtn');await p.fill('#insNameIn','Pad B');await p.keyboard.press('Escape');
ok((await st()).dirty,'renaming one is a change');
/* delete */
p.once('dialog',d=>d.accept());
await p.click('#insBtn');await p.click('[data-ia="del"]');await p.waitForTimeout(300);
const s7=await st();
ok(s7.n===2&&!s7.names.includes('Pad B')&&s7.buf===s7.samples,'Delete removes the instrument and its samples');
/* export: this instrument (.vsins) and the whole library (.vslib) */
await p.evaluate(()=>{const v=window.__vs;v.INS.list[0].bank='01. Keys';v.INS.list[1].bank='02. Copies';v.insUI();});
await p.click('[data-view=export]');await p.waitForTimeout(500);
ok(await p.locator('[data-xa="buildlib"]').count()===1&&/this instrument/.test(await p.textContent('[data-xa="build"]')),'Export offers this instrument (.vsins) and the library (.vslib)');
const before=await p.evaluate(()=>window.__vs.INS.cur);
await p.click('[data-xa="buildlib"]');
await p.waitForFunction(()=>window.__vs.S.build.verify,null,{timeout:120000});
const lr=await p.evaluate(()=>({kind:window.__vs.S.build.report.kind,ok:window.__vs.S.build.verify.ok,n:window.__vs.S.build.verify.instruments,cur:window.__vs.INS.cur,bytes:Array.from(window.__vs.S.build.last.bytes),report:document.querySelector('.report')&&document.querySelector('.report').textContent}));
ok(lr.kind==='vslib'&&lr.ok&&lr.n===2&&lr.cur===before,'Build library: a verified .vslib with both instruments, and you are back on the instrument you were editing ('+(lr.report||'').slice(0,90)+')');
const lib=await readVslib(new Uint8Array(lr.bytes));
const names=await p.evaluate(()=>window.__vs.INS.list.map(i=>i.name));
ok(lib.manifest.lib.name===await p.evaluate(()=>window.__vs.S.lib.name)&&lib.instruments.map(i=>i.name).join('|')===names.join('|')&&lib.instruments.map(i=>i.bank).join('|')==='01. Keys|02. Copies','the library file lists the instruments by bank ('+lib.instruments.map(i=>i.bank+': '+i.name).join(', ')+')');
const inner=lib.instruments.map(i=>readVsamp(i.bytes).manifest);
ok(inner.every((m,k)=>m.format==='vsamp'&&m.lib.name===names[k]&&m.samples.length>0)&&inner[0].lib.id!==inner[1].lib.id,'each instrument inside is a complete instrument file with its own name, id and samples');
ok(lib.manifest.banner.images.tile&&lib.manifest.banner.images.wide,'the library carries its banner');
await p.click('[data-xa="build"]');
await p.waitForFunction(()=>window.__vs.S.build.report&&window.__vs.S.build.report.kind==='vsins'&&window.__vs.S.build.verify,null,{timeout:120000});
const ir=await p.evaluate(()=>({name:window.__vs.S.build.report.name,ok:window.__vs.S.build.verify.ok,bytes:Array.from(window.__vs.S.build.last.bytes)}));
ok(ir.ok&&ir.name===names[await p.evaluate(()=>window.__vs.INS.list.findIndex(i=>i.id===window.__vs.INS.cur))]&&readVsamp(new Uint8Array(ir.bytes)).manifest.format==='vsamp','Build this instrument: a .vsins named after the instrument');
await p.click('[data-xa="download"]');await p.waitForTimeout(300);
ok(/\.vsins$/.test(await p.evaluate(()=>window.__vs.LAST_DL?window.__vs.LAST_DL.name:'')),'downloads as .vsins ('+(await p.evaluate(()=>window.__vs.LAST_DL?window.__vs.LAST_DL.name:''))+')');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
