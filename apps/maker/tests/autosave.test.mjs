// Autosave in the desktop app (with a stand-in for the desktop bridge): changes are noticed, a backup is written while
// there are unsaved changes, saving clears it, a backup left behind is offered back on start, closing asks first.
import {openApp} from './_helper.mjs';
const store={backup:null,meta:null},calls=[];
const app=await openApp({width:1500,height:860},{
  expose:{
    __fsAuto:(b64,meta)=>{store.backup=b64;store.meta=JSON.parse(meta);store.meta.time=Date.now();calls.push('autosave');return true;},
    __fsInfo:()=>store.meta?JSON.stringify(Object.assign({},store.meta,{size:store.backup.length})):null,
    __fsRead:()=>store.backup,
    __fsClear:()=>{store.backup=store.meta=null;calls.push('clear');return true;}
  },
  init:()=>{
    const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
    const join=parts=>{const o=new Uint8Array(parts.reduce((n,d)=>n+d.length,0));let p=0;for(const d of parts){o.set(d,p);p+=d.length;}return o;};
    window.__saves=[];
    window.visuDesktop={
      saveProject:async(name,parts,file,saveAs)=>{window.__saves.push({file,saveAs});window.__lastProj=join(parts);return file||('C:/Projects/'+name+'.vmproj');},
      info:async()=>({version:'0.0.1',build:'abc1234',date:'2026-11-07',os:'Windows_NT 10.0.22631 (x64)',electron:'33.2.1',logFile:'C:/Users/me/Documents/VisuSampler/Logs/VisuMaker.log'}),
      log:(level,msg)=>{(window.__logs=window.__logs||[]).push(level+' '+msg);},
      openLogs:async()=>{window.__openedLogs=true;},
      takeOpenRequest:async()=>{const r=window.__openReq;window.__openReq=null;return r||null;},
      onOpenRequest:cb=>{window.__onOpenReq=cb;},
      autosave:async(parts,meta)=>window.__fsAuto(b64(join(parts)),JSON.stringify(meta)),
      autosaveInfo:async()=>{const s=await window.__fsInfo();return s?JSON.parse(s):null;},
      autosaveRead:async()=>{const s=atob(await window.__fsRead()),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;},
      autosaveClear:async()=>window.__fsClear(),
      onSaveThenClose:cb=>{window.__saveThenClose=cb;}
    };
  }
});
const p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const dot=()=>p.evaluate(()=>document.querySelector('#projSave').classList.contains('dirty'));
await p.waitForTimeout(800);
ok(!(await p.$('#autoRestore')),'no backup: nothing is offered on start');
ok(!(await p.evaluate(()=>window.__vs.projDirty()))&&!(await dot()),'a fresh start has no unsaved changes');
await p.evaluate(()=>{window.__vs.AUTO.every=300;});
await p.waitForTimeout(1500);
ok(!calls.includes('autosave'),'nothing to back up while nothing changed');
/* an edit */
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');await p.waitForTimeout(300);
await p.evaluate(()=>{const v=window.__vs;v.S.lib.name='Crash Test';v.S.zones[0].vol=-7.5;v.touchMap();});
ok(await p.evaluate(()=>window.__vs.projDirty()),'an edit counts as an unsaved change');
await p.waitForTimeout(2500);
ok(calls.filter(c=>c==='autosave').length===1&&store.meta&&store.meta.name==='Crash Test','a backup is written once ('+calls.join(',')+')');
ok(await dot(),'the Save button shows a dot for unsaved changes');
/* while notes play, no backup */
await p.evaluate(()=>{window.__vs.S.zones[1].vol=-3;window.__vs.noteOn(60,100);});await p.waitForTimeout(1600);
const during=calls.filter(c=>c==='autosave').length;
await p.evaluate(()=>window.__vs.noteOff(60));await p.waitForTimeout(2500);
ok(during===1&&calls.filter(c=>c==='autosave').length===2,'no backup while a note sounds, it waits until it ends ('+calls.join(',')+')');
/* saving clears the backup */
await p.keyboard.press('Control+s');await p.waitForTimeout(1200);
ok(calls[calls.length-1]==='clear'&&!store.meta&&!(await dot())&&!(await p.evaluate(()=>window.__vs.projDirty())),'saving clears the backup and the dot');
/* closing: unsaved changes hold the close back, "Save" saves and then closes */
const ev=await p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
ok(!ev,'no unsaved changes: closing is not held back');
await p.evaluate(()=>{window.__vs.S.zones[0].vol=-9.25;});
const ev2=await p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
ok(ev2,'unsaved changes: closing is held back (the app asks)');
const closed=await p.evaluate(async()=>{let c=false;window.close=()=>{c=true;};const n=window.__saves.length;await window.__saveThenClose();await new Promise(r=>setTimeout(r,800));return{c,saved:window.__saves.length-n,file:window.__saves[window.__saves.length-1].file};});
ok(closed.c&&closed.saved===1&&closed.file==='C:/Projects/Crash Test.vmproj','"Save" on close saves to the same file, then closes ('+JSON.stringify(closed)+')');
/* a crash: a backup is left, and the next start offers it */
await p.evaluate(()=>{window.__vs.AUTO.allowClose=false;window.__vs.S.zones[0].vol=-11;window.__vs.S.zones[2].pan=-40;});
await p.waitForTimeout(2500);
ok(store.meta&&store.meta.file==='C:/Projects/Crash Test.vmproj','the backup remembers which file it belongs to');
await p.reload();await p.waitForTimeout(1500);
ok(!!(await p.$('#autoRestore')),'after the crash, the next start offers the backup');
ok(/Crash Test/.test(await p.textContent('#autoRestore')),'it names the project');
await p.evaluate(()=>{window.__vs.AUTO.every=300;});await p.waitForTimeout(1200);
ok(store.meta&&!calls.slice(-1).includes('clear'),'the backup is kept while the question is open');
await p.click('#autoRestore button.primary');await p.waitForTimeout(1500);
const back=await p.evaluate(()=>({vol:window.__vs.S.zones[0].vol,pan:window.__vs.S.zones[2].pan,name:window.__vs.S.lib.name,dirty:window.__vs.projDirty()}));
ok(back.vol===-11&&back.pan===-40&&back.name==='Crash Test','Restore brings the work back ('+JSON.stringify(back)+')');
ok(back.dirty&&(await dot()),'the restored project still counts as unsaved');
const sv=await p.evaluate(async()=>{const n=window.__saves.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,1000));return window.__saves.slice(n);});
ok(sv.length===1&&sv[0].file==='C:/Projects/Crash Test.vmproj'&&!store.meta,'Ctrl+S then saves it over its own file and clears the backup ('+JSON.stringify(sv)+')');
/* Discard */
await p.evaluate(()=>{window.__vs.S.zones[0].vol=-2;});await p.waitForTimeout(2500);
await p.reload();await p.waitForTimeout(1500);
await p.click('#autoRestore button.danger');await p.waitForTimeout(500);
ok(!store.meta&&!(await p.$('#autoRestore')),'Discard removes the backup');
/* About: version, build, log folder */
await p.click('#aboutBtn');await p.waitForTimeout(300);
const about=await p.textContent('#aboutBox');
ok(/0\.0\.1/.test(about)&&/abc1234/.test(about)&&/Windows/.test(about),'About shows the version, build and system');
await p.click('#aboutBox >> text=Open log folder');
ok(await p.evaluate(()=>window.__openedLogs===true),'About opens the log folder');
await p.keyboard.press('Escape');ok(!(await p.$('#aboutBox')),'Escape closes About');
/* failures shown to the user also go into the log */
/* a project double-clicked in Explorer */
const req=await p.evaluate(async()=>{   /* save "From Explorer" as a file, then switch to another clean project */
  const v=window.__vs;v.S.lib.name='From Explorer';v.S.zones[0].vol=-1.5;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,1200));
  const bytes=window.__lastProj;v.S.lib.name='Something Else';v.S.zones[0].vol=-20;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,1200));
  window.__openReq={file:'C:/Projects/Other/From Explorer.vmproj',bytes};window.__onOpenReq();await new Promise(r=>setTimeout(r,1500));
  const n=window.__saves.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,1200));
  return{name:v.S.lib.name,vol:v.S.zones[0].vol,saved:window.__saves.slice(n)};});
ok(req.name==='From Explorer'&&req.vol===-1.5&&req.saved.length===1&&req.saved[0].file==='C:/Projects/Other/From Explorer.vmproj','a project opened from Explorer opens, and Ctrl+S saves it to its own file ('+JSON.stringify(req)+')');
/* opening over unsaved changes asks first */
await p.evaluate(()=>{window.__keep=window.__lastProj;window.__vs.S.zones[0].vol=-33;});
p.once('dialog',d=>d.dismiss());
await p.evaluate(async()=>{window.__openReq={file:'C:/x.vmproj',bytes:window.__keep};window.__onOpenReq();await new Promise(r=>setTimeout(r,1200));});
ok(await p.evaluate(()=>window.__vs.S.zones[0].vol===-33),'unsaved changes: opening another project asks, and Cancel keeps the work');
p.once('dialog',d=>d.accept());
await p.evaluate(async()=>{window.__openReq={file:'C:/x.vmproj',bytes:window.__keep};window.__onOpenReq();await new Promise(r=>setTimeout(r,1500));});
ok(await p.evaluate(()=>window.__vs.S.zones[0].vol===-1.5),'and OK opens it');
await p.evaluate(()=>{window.__logs=[];});
await p.evaluate(()=>{window.__vs.S.zones[0].vol=-5;});
await p.evaluate(async()=>{const D=window.visuDesktop,o=D.saveProject;D.saveProject=async()=>{throw new Error('disk full');};
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,1000));D.saveProject=o;});
ok(await p.evaluate(()=>(window.__logs||[]).some(l=>/warn .*Could not save: disk full/.test(l))),'a failed save goes into the log ('+(await p.evaluate(()=>(window.__logs||[]).join(' | ')))+')');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
