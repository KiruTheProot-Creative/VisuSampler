/* ---------- autosave (desktop app) ----------
   The project counts as changed when its undo fingerprint (p995) differs from the one it had when it was last saved or
   opened. While it is changed, a backup is written about once a minute into the app's own folder (never over the user's
   file), when nothing is being played or dragged. Saving clears the backup. On start, a backup left behind (a crash, or
   a close without saving) is offered back. Closing with unsaved changes asks first (Save / Close without saving / Cancel). */
const AUTO={savedKey:null,autoKey:null,every:60000,lastAt:0,busy:false,pending:false,allowClose:false,on:false};
const autoD=()=>{const D=window.visuDesktop;return D&&D.autosave?D:null;};
function projKeyNow(){const k=typeof insKeyNow==='function'?insKeyNow():'';return k||(HIST.last?HIST.last.key:'');}   /* a library: every instrument's token (the one being edited included) */
function projKey(){histCheck();return projKeyNow();}
function projDirty(){return projKey()!==AUTO.savedKey;}
function markSaved(){AUTO.savedKey=AUTO.autoKey=projKey();autoDot();}
function autoDot(){const b=$('#projSave');if(b)b.classList.toggle('dirty',AUTO.savedKey!=null&&HIST.last!=null&&projKeyNow()!==AUTO.savedKey);}
async function autosaveNow(){
  const D=autoD();if(!D||AUTO.busy||AUTO.pending)return false;
  const key=projKey();if(key===AUTO.savedKey||key===AUTO.autoKey)return false;
  AUTO.busy=true;
  try{const parts=await projectParts();await D.autosave(parts,{name:S.lib.name,file:PROJ_FILE||null});AUTO.autoKey=key;return true;}
  catch(e){console.warn('autosave failed',e);return false;}
  finally{AUTO.busy=false;AUTO.lastAt=Date.now();}
}
function autoTick(){
  if(!autoD()||AUTO.pending||Date.now()-AUTO.lastAt<AUTO.every)return;
  const playing=(typeof SV!=='undefined'&&SV.list&&SV.list.length)||(typeof ENG!=='undefined'&&ENG&&ENG.voices>0);
  if(playing||HIST.pointer||projBusy)return;   /* not while notes sound or a drag is going on: try again next tick */
  autosaveNow();
}
/* saving, opening and presets set the "saved" point */
{const sp0=saveProject;saveProject=async function(saveAs){const r=await sp0(saveAs);if(r){markSaved();const D=autoD();if(D)D.autosaveClear().catch(()=>{});}return r;};}
{const op0=openProject;openProject=async function(b,file){const r=await op0(b,file);markSaved();return r;};}
{const lp0=loadPreset;loadPreset=function(k){const r=lp0(k);if(typeof INS!=='undefined'&&INS.list.length<2)insInit(S.lib&&S.lib.name);markSaved();return r;};}
{const hu0=histUI;histUI=function(){hu0();autoDot();};}

/* the backup from last time */
function autoAsk(info){
  return new Promise(res=>{
    const t=new Date(info.time),when=t.toLocaleDateString()+' '+t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const ov=document.createElement('div');ov.id='autoRestore';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    const box=document.createElement('div');
    box.style.cssText='background:var(--panel,#383838);color:var(--fg,#ddd);border:1px solid var(--line,#1d1d1d);border-radius:6px;padding:18px 20px;max-width:440px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px var(--f-body,sans-serif)';
    const h=document.createElement('div');h.style.cssText='font-size:15px;font-weight:600;margin-bottom:8px';h.textContent='Restore unsaved work?';
    const p=document.createElement('div');p.style.cssText='line-height:1.5;margin-bottom:14px;color:var(--muted,#aaa)';
    p.textContent='VisuMaker kept a backup of "'+(info.name||'Untitled')+'" from '+when+(info.file?' (saved before as '+info.file.split(/[\\/]/).pop()+')':'')+'. It has changes that were never saved.';
    const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;justify-content:flex-end';
    const mk=(txt,cls,v)=>{const b=document.createElement('button');b.type='button';b.className='btn'+(cls?' '+cls:'');b.textContent=txt;b.addEventListener('click',()=>{ov.remove();res(v);});return b;};
    const keep=mk('Restore','primary',true);row.append(mk('Discard backup','danger',false),keep);
    box.append(h,p,row);ov.append(box);document.body.append(ov);keep.focus();
    ov.addEventListener('keydown',e=>{if(e.key==='Escape'){ov.remove();res(null);}});
  });
}
async function autoCheckRestore(){
  const D=autoD();if(!D)return;
  let info=null;try{info=await D.autosaveInfo();}catch(e){}
  if(!info)return;
  AUTO.pending=true;   /* no autosave until this is answered, so the backup is not overwritten */
  try{
    const ans=await autoAsk(info);
    if(ans===true){
      flash('Restoring…');await nextFrame();
      try{await openProject(await D.autosaveRead(),info.file||null);AUTO.savedKey='(restored, not saved)';AUTO.autoKey=projKey();autoDot();flash('Restored "'+S.lib.name+'": save it to keep it');}
      catch(e){flash('Could not restore the backup: '+e.message);}
    }else if(ans===false)await D.autosaveClear();
  }finally{AUTO.pending=false;AUTO.lastAt=Date.now();}
}
/* closing: hold it back while there are unsaved changes; the desktop app asks (see main.js) */
window.addEventListener('beforeunload',e=>{
  if(!autoD()||AUTO.allowClose)return;
  let dirty=false;try{dirty=projDirty();}catch(err){}
  if(dirty){e.preventDefault();e.returnValue='';}
});
function autoStart(){
  const D=autoD();if(!D||AUTO.on)return;AUTO.on=true;AUTO.lastAt=Date.now();
  if(D.onSaveThenClose)D.onSaveThenClose(async()=>{
    flash('Saving…');await nextFrame();
    let r=null;try{r=await saveProject(false);}catch(e){flash('Could not save: '+e.message);}
    if(r){AUTO.allowClose=true;window.close();}else flash('Not saved: VisuMaker stays open');
  });
  setInterval(autoTick,1000);
  if(D.onOpenRequest)D.onOpenRequest(()=>openFromExplorer());
  (async()=>{await autoCheckRestore();await openFromExplorer();})();   /* the backup question first, then a project double-clicked in Explorer */
}
