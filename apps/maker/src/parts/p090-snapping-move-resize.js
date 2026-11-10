/* ---------- snapping, move, resize ---------- */
function snapTargets(except){
  const xs=[0,S.canvas.w/2,S.canvas.w],ys=[0,S.canvas.h/2,S.canvas.h];
  S.els.forEach(o=>{if(o===except)return;xs.push(o.x,o.x+o.w/2,o.x+o.w);ys.push(o.y,o.y+o.h/2,o.y+o.h);});
  return{xs,ys};
}
function snap1(vals,targets){
  const th=6/S.z;let best=null;
  for(const v of vals)for(const t of targets){const d=t-v;if(Math.abs(d)<=th&&(best===null||Math.abs(d)<Math.abs(best.d)))best={d,t};}
  return best;
}
function showGuides(gx,gy){
  const x=$('#gx'),y=$('#gy');
  x.hidden=gx===null||gx===undefined; y.hidden=gy===null||gy===undefined;
  if(!x.hidden) x.style.left=(gx*S.z)+'px';
  if(!y.hidden) y.style.top=(gy*S.z)+'px';
}
const hideGuides=()=>{$('#gx').hidden=true;$('#gy').hidden=true;};
function syncPosFields(){
  const el=sel(); if(!el||S.tab!=='props') return;
  ['x','y','w','h'].forEach(k=>{const i=$('[data-k="'+k+'"]',rbody);if(i&&document.activeElement!==i)i.value=Math.round(el[k]);});
}
function startMove(e){
  const el=sel(); if(!el) return; e.preventDefault();
  const sx=e.clientX,sy=e.clientY,ox=el.x,oy=el.y;
  drag(ev=>{
    let nx=ox+(ev.clientX-sx)/S.z,ny=oy+(ev.clientY-sy)/S.z;
    if(S.snap&&!ev.altKey){
      const T=snapTargets(el),bx=snap1([nx,nx+el.w/2,nx+el.w],T.xs),by=snap1([ny,ny+el.h/2,ny+el.h],T.ys);
      if(bx) nx+=bx.d; if(by) ny+=by.d;
      showGuides(bx?bx.t:null,by?by.t:null);
    }else hideGuides();
    el.x=Math.round(nx); el.y=Math.round(ny); renderEl(el); placeSel(); syncPosFields();
  },hideGuides);
}
function startResize(e,dir){
  const el=sel(); if(!el) return; e.preventDefault(); e.stopPropagation();
  const sx=e.clientX,sy=e.clientY,o={x:el.x,y:el.y,w:el.w,h:el.h},sq=el.type==='knob';
  drag(ev=>{
    const dx=(ev.clientX-sx)/S.z,dy=(ev.clientY-sy)/S.z;
    let x=o.x,y=o.y,w=o.w,h=o.h;
    if(dir.includes('e')) w=o.w+dx;
    if(dir.includes('s')) h=o.h+dy;
    if(dir.includes('w')){x=o.x+dx;w=o.w-dx;}
    if(dir.includes('n')){y=o.y+dy;h=o.h-dy;}
    if(S.snap&&!ev.altKey&&!sq){
      const T=snapTargets(el);
      if(dir.includes('e')){const b=snap1([x+w],T.xs);if(b)w+=b.d;}
      if(dir.includes('w')){const b=snap1([x],T.xs);if(b){x+=b.d;w-=b.d;}}
      if(dir.includes('s')){const b=snap1([y+h],T.ys);if(b)h+=b.d;}
      if(dir.includes('n')){const b=snap1([y],T.ys);if(b){y+=b.d;h-=b.d;}}
    }
    if(w<12){if(dir.includes('w'))x-=12-w;w=12;}
    if(h<12){if(dir.includes('n'))y-=12-h;h=12;}
    if(sq){const m=Math.max(w,h);if(dir.includes('w'))x=o.x+o.w-m;if(dir.includes('n'))y=o.y+o.h-m;w=h=m;}
    el.x=Math.round(x);el.y=Math.round(y);el.w=Math.round(w);el.h=Math.round(h);
    renderEl(el);placeSel();syncPosFields();
  });
}

