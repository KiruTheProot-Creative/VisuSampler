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
  if(el.type==='dropdown'){e.preventDefault();ddOpen(el);return;}
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
  if(el.type==='dropdown'){e.preventDefault();const t=tagById(el.tag);if(t&&stepCount(t)>1)stepBy(t,Math.sign(e.deltaY));return;}
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

/* ---- dropdown menu (Test mode and the player) ---- */
let DDM=null;
function ddClose(){if(DDM){DDM.box.remove();document.removeEventListener('pointerdown',DDM.out,true);document.removeEventListener('keydown',DDM.key,true);DDM=null;}}
function ddOpen(el){
  const was=DDM&&DDM.id===el.id;ddClose();if(was)return;
  const d=ddSteps(el);if(!d.t||!d.steps.length)return;
  const rows=Math.max(2,Math.min(d.steps.length,el.menuRows||8)),rh=Math.max(18,Math.round(el.size*1.6)),mh=rows*rh+6;
  const below=el.y+el.h+mh<=S.canvas.h||el.y-mh<0,top=below?el.y+el.h+2:el.y-mh-2;
  const box=document.createElement('div');box.className='ddmenu';
  box.style.cssText='left:'+el.x+'px;top:'+top+'px;width:'+Math.max(el.w,80)+'px;max-height:'+mh+'px;background:'+el.menuBg+';color:'+el.menuFg+';border-radius:'+Math.min(10,el.radius)+'px;font-family:\''+el.font+'\',Figtree,sans-serif;font-size:'+el.size+'px;--hi:'+el.menuHi;
  box.innerHTML=d.steps.map((s,i)=>'<div class="ddi'+(i===d.i?' on':'')+'" data-i="'+i+'" style="height:'+rh+'px;padding:0 '+el.pad+'px">'+esc((el.prefix||'')+s)+'</div>').join('');
  canvas.appendChild(box);
  const cur=box.querySelector('.ddi.on');if(cur)box.scrollTop=Math.max(0,cur.offsetTop-rh*2);
  box.addEventListener('pointerdown',ev=>{ev.stopPropagation();const r=ev.target.closest('.ddi');if(!r)return;ev.preventDefault();setStep(d.t,+r.dataset.i);ddClose();});
  const out=ev=>{if(!box.contains(ev.target)&&!(ev.target.closest&&ev.target.closest('.el[data-id="'+el.id+'"]')))ddClose();};
  const key=ev=>{if(ev.key==='Escape'){ev.preventDefault();ddClose();}};
  DDM={id:el.id,box,out,key};document.addEventListener('pointerdown',out,true);document.addEventListener('keydown',key,true);
}
