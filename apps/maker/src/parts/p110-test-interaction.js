/* ---------- test mode interaction ---------- */
function btnDown(el,e){
  e.preventDefault(); RT.down=el.id; const t=tagById(el.tag);
  if(t){
    if(el.mode==='toggle') setTag(t,t.value>.5?0:1);
    else if(el.mode==='radio') setStep(t,el.value);
    else if(el.mode==='momentary'&&t.kind==='number') setTag(t,1);
  }
  fireEvent(el,'press'); renderEl(el);
  const hold=setTimeout(()=>fireEvent(el,'hold'),500);
  drag(()=>{},()=>{
    clearTimeout(hold); RT.down=null;
    if(t&&el.mode==='momentary'&&t.kind==='number') setTag(t,0);
    fireEvent(el,'release'); renderEl(el);
  });
}
function startTest(e){
  const n=e.target.closest('.el'); if(!n) return;
  const el=S.els.find(x=>x.id===n.dataset.id); if(!el) return;
  if(el.type==='button'){btnDown(el,e);return;}
  if(el.type==='list'){
    const r=e.target.closest('.lrow');
    if(r&&r.dataset.i!==undefined){e.preventDefault();const lt=listTag();if(lt)setStep(lt,+r.dataset.i);}
    return;
  }
  if(el.type!=='knob'&&el.type!=='fader') return;
  const t=tagById(el.tag); if(!t) return; e.preventDefault();
  if(el.type==='knob'){
    const sy=e.clientY,v0=t.value;
    drag(ev=>setTag(t,v0+(sy-ev.clientY)/(ev.shiftKey?800:220)));
  }else{
    const r=n.getBoundingClientRect(),{vert,L,hl}=faderMetrics(el);
    const setFrom=ev=>{const p=((vert?ev.clientY-r.top:ev.clientX-r.left)/S.z)-hl/2;const f=clamp(p/(L-hl),0,1);setTag(t,vert?1-f:f);};
    setFrom(e); drag(setFrom);
  }
}
canvas.addEventListener('pointerdown',e=>{
  if(S.mode==='test'){startTest(e);return;}
  const n=e.target.closest('.el');
  if(!n){select(null);return;}
  if(S.sel!==n.dataset.id) select(n.dataset.id);
  startMove(e);
});
stageEl.addEventListener('pointerdown',e=>{if(S.mode==='design'&&(e.target===stageEl||e.target===vp))select(null);});
$$('#selbox .hd').forEach(h=>h.addEventListener('pointerdown',e=>startResize(e,h.dataset.dir)));
function elOf(e){const n=e.target.closest&&e.target.closest('.el');return n?S.els.find(x=>x.id===n.dataset.id)||null:null;}
canvas.addEventListener('dblclick',e=>{
  if(S.mode!=='test') return;
  const el=elOf(e); if(!el) return;
  if(el.type==='button'){fireEvent(el,'doubleclick');return;}
  const t=tagById(el.tag);
  if(t&&(el.type==='knob'||el.type==='fader')) setTag(t,t.def);
});
canvas.addEventListener('wheel',e=>{
  if(S.mode!=='test') return;
  const el=elOf(e); if(!el) return;
  if(el.type==='list'){e.preventDefault();const lt=listTag();if(lt)stepBy(lt,Math.sign(e.deltaY));return;}
  const t=tagById(el.tag);
  if(!t||(el.type!=='knob'&&el.type!=='fader')) return;
  e.preventDefault(); const c=stepCount(t);
  setTag(t,t.value-Math.sign(e.deltaY)*(c>1?1/(c-1):.02));
},{passive:false});
canvas.addEventListener('pointerover',e=>{
  const n=e.target.closest&&e.target.closest('.el.button'),id=n?n.dataset.id:null;
  if(id===RT.hover) return;
  const old=RT.hover; RT.hover=id;
  [old,id].forEach(i=>{const el=i&&S.els.find(x=>x.id===i);if(el)renderEl(el);});
});
canvas.addEventListener('pointerleave',()=>{
  if(!RT.hover) return;
  const el=S.els.find(x=>x.id===RT.hover); RT.hover=null; if(el)renderEl(el);
});
