/* ---------- toolbar, modes ---------- */
function syncToolbar(){
  $('#cw').value=S.canvas.w; $('#ch').value=S.canvas.h; $('#zoom').value=S.zoom; $('#snap').checked=S.snap; $('#preset').value=''; $('#bpm').value=S.bpm;
  syncSig();
}
function syncSig(){
  const n=$('#sigN'),d=$('#sigD'); if(n) n.value=S.sig.n; if(d) d.value=S.sig.d;
}
$('#cw').addEventListener('change',()=>setCanvas(parseFloat($('#cw').value),S.canvas.h));
$('#ch').addEventListener('change',()=>setCanvas(S.canvas.w,parseFloat($('#ch').value)));
$('#preset').addEventListener('change',e=>{const v=e.target.value;if(v){const p=v.split('x');setCanvas(+p[0],+p[1]);}e.target.value='';});
$('#zoom').addEventListener('change',e=>{S.zoom=e.target.value;layout();});
$('#snap').addEventListener('change',e=>{S.snap=e.target.checked;});
$('#bpm').addEventListener('input',e=>{const v=parseFloat(e.target.value);if(v>=40)setBpm(v);});
$('#resetVals').addEventListener('click',()=>{S.tags.forEach(t=>{if(!t.sys)t.value=t.def;});rerenderAll();applyAudio();fxRefreshParams();if(S.tab==='tags')renderRight();});
$('#sigN').addEventListener('change',()=>setSig($('#sigN').value,$('#sigD').value));
$('#sigD').addEventListener('change',()=>setSig($('#sigN').value,$('#sigD').value));
function setMode(m){
  S.mode=m; stageEl.classList.toggle('design',m==='design'); stageEl.classList.toggle('test',m==='test');
  $('#mDesign').setAttribute('aria-pressed',String(m==='design')); $('#mTest').setAttribute('aria-pressed',String(m==='test'));
  $('#testbar').hidden=m!=='test'; hideGuides(); placeSel(); layout(); rerenderAll();
}
const VIEWS={design:['leftD','centerD','rightD'],fx:['leftF','centerF','rightF'],map:['leftM','centerM','rightM'],samples:['leftS','centerS','rightS'],export:['leftX','centerX','rightX']};
function setView(v){
  S.view=v;
  Object.keys(VIEWS).forEach(k=>VIEWS[k].forEach(id=>{$('#'+id).hidden=k!==v;}));
  $('#modeSeg').hidden=v!=='design';
  $$('#viewTabs [data-view]').forEach(b=>{b.classList.toggle('on',b.dataset.view===v);if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(v==='fx') fxRender(); else if(v==='map'){mapUI();mapStart();} else if(v==='samples'){if(!smSample()&&S.samples[0])S.smp.sel=S.samples[0].id;smPanelRender();smStart();smFit();} else if(v==='export'){exRender();} else {layout();rerenderAll();}
}
$$('#viewTabs [data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#mDesign').addEventListener('click',()=>setMode('design'));
$('#mTest').addEventListener('click',()=>setMode('test'));
window.addEventListener('blur',()=>{AU.v.forEach((v,m)=>synthOff(m));sampPanic();$$('#kb .on').forEach(b=>b.classList.remove('on'));});

