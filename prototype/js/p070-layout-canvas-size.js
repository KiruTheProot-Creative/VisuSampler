/* ---------- layout / canvas size ---------- */
function layout(){
  if(S.view!=='design') return;
  const W=S.canvas.w,H=S.canvas.h; let z;
  if(S.zoom==='fit'){
    const aw=stageEl.clientWidth-56,ah=stageEl.clientHeight-56;
    z=Math.max(.1,Math.min(aw/W,ah/H,1.5));
  }else z=parseFloat(S.zoom)/100;
  const prev=S.z; S.z=z;
  vp.style.width=(W*z)+'px'; vp.style.height=(H*z)+'px';
  canvas.style.cssText='width:'+W+'px;height:'+H+'px;background:'+S.canvas.bg+';transform:scale('+z+')';
  $('#zl').textContent=W+' × '+H+' px · '+Math.round(z*100)+'%';
  if(Math.abs(prev-z)>.001) rerenderAll();
  placeSel();
}
function setCanvas(w,h){
  const rw=Math.round(w),rh=Math.round(h);
  const cw=clamp(rw||S.canvas.w,200,1920),chh=clamp(rh||S.canvas.h,120,1080);
  const clamped=(rw!==cw)||(rh!==chh);
  S.canvas.w=cw; S.canvas.h=chh; $('#cw').value=cw; $('#ch').value=chh;
  if(clamped) flash('Canvas is limited to 1920 × 1080');
  layout();
}
let flashT=0;
function flash(t){
  const ms=[$('#msg'),$('#fxMsg'),$('#mapMsg'),$('#smMsg'),$('#exMsg')];
  ms.forEach(m=>{if(m)m.textContent=t;});
  clearTimeout(flashT);flashT=setTimeout(()=>{ms.forEach(m=>{if(m)m.textContent='';});},3800);
}

