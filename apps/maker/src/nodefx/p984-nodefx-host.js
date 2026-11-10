/* ---------- NodeFX: what the Effects editor gets from the rest of VisuMaker, in the plugin ----------
   nodefx.html carries only the Effects editor (build.py lists its parts). These few stand in for the Maker's
   tabs, interface and project undo, which the plugin has none of. */
/* one view only */
function setView(){S.view='fx';fxRender();}
/* a macro knob moved: the editor shows the parameters that follow it */
function setTag(t,v){
  v=clamp(v,0,1);if(v===t.value)return;t.value=v;
  if(typeof fxRefreshParams==='function')fxRefreshParams();
}
/* parameter moves: replaced by the plugin's setParam in nfxStart */
function engineFxParam(n,q,fn){fn();}
/* no interface page to put elements on */
function renderEl(){}
function renderLayers(){}
function curPageIdx(){return 0;}
const imgSrc=()=>'';
/* undo / redo for the chain (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y): modules, cables, settings and macro names.
   Quick edits in a row (a knob being dragged) are one step. */
const NH={undo:[],redo:[],cur:null,at:0,restoring:false};
function nfxSnapshot(){return JSON.stringify({g:graphOf('master'),m:nfxMacroTags().map(t=>t.name)});}
function histClear(){NH.undo=[];NH.redo=[];NH.cur=nfxSnapshot();NH.at=0;}
function nfxHistTick(){
  if(NH.restoring)return;const s=nfxSnapshot();
  if(NH.cur==null){NH.cur=s;return;}
  if(s===NH.cur)return;
  const now=Date.now();
  if(now-NH.at>700){NH.undo.push(NH.cur);if(NH.undo.length>200)NH.undo.shift();}
  NH.redo=[];NH.cur=s;NH.at=now;
}
function nfxHistGo(from,to){
  nfxHistTick();if(!from.length)return false;
  to.push(NH.cur);const s=from.pop();NH.cur=s;NH.at=0;NH.restoring=true;
  try{
    const o=JSON.parse(s);S.fx.graphs={master:o.g};S.fx.sel=null;S.fx.cable=null;
    nfxMacroTags().forEach((t,i)=>{if(o.m[i])t.name=o.m[i];});
    $('#nfxMacros').innerHTML=nfxMacrosHTML();fxRender();nfxSync(false);
  }finally{NH.restoring=false;}
  return true;
}
const nfxUndo=()=>nfxHistGo(NH.undo,NH.redo),nfxRedo=()=>nfxHistGo(NH.redo,NH.undo);
document.addEventListener('keydown',e=>{
  const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
  if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();
  if(k==='z'&&!e.shiftKey){e.preventDefault();if(!nfxUndo())flash('Nothing to undo');}
  else if((k==='z'&&e.shiftKey)||k==='y'){e.preventDefault();if(!nfxRedo())flash('Nothing to redo');}
});
