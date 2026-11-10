/* ---------- NodeFX: start-up ---------- */
S.view='fx';
nfxStart().catch(e=>{console.error('NodeFX start',e);flash('NodeFX could not start: '+(e&&e.message||e));}).finally(()=>document.body.classList.add('nfx-ready'));
setTimeout(()=>document.body.classList.add('nfx-ready'),4000);   /* never stays hidden, even when the plugin does not answer */
if(window.__VSTEST) window.__vs={S,NFX,NH,nfxState,nfxApply,nfxSync,nfxMacroTags,nfxSetMacro,nfxUndo,nfxRedo,nfxHistTick,
  graphOf:s=>graphOf(s),fxNode:(t,x,y)=>fxNode(t,x,y),mkCable:(a,ap,b,bp)=>mkCable(a,ap,b,bp),fxRender:()=>fxRender(),FXT,
  fxParam:(n,q,fn)=>engineFxParam(n,q,fn)};
