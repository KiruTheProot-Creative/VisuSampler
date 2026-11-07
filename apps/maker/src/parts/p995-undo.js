/* ---------- undo / redo for the whole project ----------
   After every edit (a click, a drag that ended, a typed value, a key) the project is compared with the last saved state;
   if it changed, that last state goes onto the undo stack. A state is the project snapshot plus references to each
   sample's audio arrays (audio edits always make new arrays, so keeping references is cheap and also brings back
   deleted samples and audio edits). Knob values and page switches are playing, not editing, so they never count. */
const HIST={undo:[],redo:[],last:null,pointer:false,timer:0,max:80,applying:false};
const chIds=new WeakMap();let chSeq=0;
const chId=a=>{if(!chIds.has(a))chIds.set(a,++chSeq);return chIds.get(a);};
function histState(){
  const sn=snapshot(),bufs={};
  for(const s of S.samples){const b=BUF.get(s.id);if(b)bufs[s.id]={ch:b.ch,sr:b.sr,peaks:b.peaks};}
  /* what counts as an edit: everything except knob values, the page shown and the selected group */
  const fp=JSON.parse(JSON.stringify(sn));(fp.tags||[]).forEach(t=>{t.value=0;});delete fp.mapgrp;
  const key=JSON.stringify(fp)+'|'+Object.keys(bufs).map(id=>id+':'+bufs[id].ch.map(chId).join(',')).join(';');
  return{sn,bufs,key};
}
function histCheck(){
  if(HIST.applying||HIST.pointer)return;
  let st;try{st=histState();}catch(e){return;}
  if(!HIST.last){HIST.last=st;histUI();return;}
  if(st.key===HIST.last.key){HIST.last.sn=st.sn;return;}   /* only values changed: keep them, no new step */
  HIST.undo.push(HIST.last);if(HIST.undo.length>HIST.max)HIST.undo.shift();
  HIST.redo=[];HIST.last=st;histUI();
}
const histSoon=ms=>{clearTimeout(HIST.timer);HIST.timer=setTimeout(histCheck,ms);};
function histApply(st){
  HIST.applying=true;
  try{
    const keep={view:S.view,scope:S.fx.scope,focus:S.snd&&S.snd.focus,group:S.map.group,tab:S.tab,mode:S.mode};
    for(const id of Object.keys(st.bufs)){const b=BUF.get(id),x=st.bufs[id];if(b){b.ch=x.ch;b.sr=x.sr;b.peaks=x.peaks;}else BUF.set(id,{ch:x.ch,sr:x.sr,peaks:x.peaks});}
    restore(st.sn);
    if(keep.scope&&(keep.scope==='master'||S.groups.indexOf(keep.scope)>=0))S.fx.scope=keep.scope;
    if(keep.group&&S.groups.indexOf(keep.group)>=0)S.map.group=keep.group;
    if(S.snd&&keep.focus)S.snd.focus=keep.focus==='zone'?'zone':keep.focus;
    S.tab=keep.tab||S.tab;if(S.smp.sel&&!S.samples.some(s=>s.id===S.smp.sel))S.smp.sel=S.samples[0]?S.samples[0].id:null;
    RENDER_CACHE.clear();afterLoad();setView(keep.view);
    if(S.view==='sound'){smPanelRender();smFit();smInvalidate();}
  }finally{HIST.applying=false;}
  HIST.last=histState();
}
function undo(){
  histCheck();if(!HIST.undo.length){flash('Nothing to undo');return;}
  const st=HIST.undo.pop();HIST.redo.push(HIST.last);histApply(st);histUI();flash('Undone');
}
function redo(){
  histCheck();if(!HIST.redo.length){flash('Nothing to redo');return;}
  const st=HIST.redo.pop();HIST.undo.push(HIST.last);histApply(st);histUI();flash('Redone');
}
function histClear(){HIST.undo=[];HIST.redo=[];HIST.last=null;histCheck();histUI();}
function histUI(){
  const u=$('#histUndo'),r=$('#histRedo');if(!u)return;
  u.disabled=!HIST.undo.length;r.disabled=!HIST.redo.length;
  u.title='Undo (Ctrl+Z)'+(HIST.undo.length?' · '+HIST.undo.length+' step'+(HIST.undo.length>1?'s':''):'');r.title='Redo (Ctrl+Y)'+(HIST.redo.length?' · '+HIST.redo.length:'');
}
/* buttons next to Open / Save */
(function(){
  const o=$('#projOpen');if(!o)return;
  const mkb=(id,txt,lab,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn hist';b.id=id;b.textContent=txt;b.setAttribute('aria-label',lab);b.addEventListener('click',fn);return b;};
  o.before(mkb('histUndo','↶','Undo',()=>undo()),mkb('histRedo','↷','Redo',()=>redo()));
})();
/* when to look for changes */
document.addEventListener('pointerdown',()=>{HIST.pointer=true;},true);
document.addEventListener('pointerup',()=>{HIST.pointer=false;histSoon(60);},true);
document.addEventListener('pointercancel',()=>{HIST.pointer=false;histSoon(60);},true);
['change','drop','click'].forEach(ev=>document.addEventListener(ev,()=>histSoon(60),true));
document.addEventListener('keyup',e=>{if(!typing(e.target)||e.key==='Enter')histSoon(120);},true);
document.addEventListener('input',()=>histSoon(700),true);
setInterval(()=>{if(!HIST.pointer&&!document.hidden)histCheck();},1500);   /* catches slow things like imports */
/* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (text fields keep their own undo) */
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();
  if(k!=='z'&&k!=='y')return;
  const t=e.target;if(t&&(t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&/^(text|search|number)$/.test(t.type))))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(k==='y'||e.shiftKey)redo();else undo();
},true);
/* a new project or preset starts a fresh history */
{const op0=openProject;openProject=async function(b,file){const r=await op0(b,file);histClear();return r;};}
{const lp0=loadPreset;loadPreset=function(k){const r=lp0(k);histClear();return r;};}
