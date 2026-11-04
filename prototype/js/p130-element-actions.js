/* ---------- element actions ---------- */
function addEl(type){
  const el=mk(type);
  el.x=Math.round((S.canvas.w-el.w)/2); el.y=Math.round((S.canvas.h-el.h)/2);
  S.els.push(el);
  const n=document.createElement('div'); n.className='el '+type; n.dataset.id=el.id; canvas.appendChild(n); nodes.set(el.id,n);
  renderEl(el); select(el.id);
}
function dupEl(){
  const el=sel(); if(!el) return;
  const c=JSON.parse(JSON.stringify(el)); c.id=nid('e'); c.name=el.name+' copy'; c.x+=16; c.y+=16;
  S.els.splice(S.els.indexOf(el)+1,0,c);
  const n=document.createElement('div'); n.className='el '+c.type; n.dataset.id=c.id; canvas.appendChild(n); nodes.set(c.id,n);
  rerenderAll(); select(c.id);
}
function delEl(){
  const el=sel(); if(!el) return;
  const n=nodes.get(el.id); if(n) n.remove(); nodes.delete(el.id);
  S.els.splice(S.els.indexOf(el),1); rerenderAll(); select(null);
}
function moveZ(d){
  const el=sel(); if(!el) return; const i=S.els.indexOf(el),j=i+d;
  if(j<0||j>=S.els.length) return;
  S.els.splice(i,1); S.els.splice(j,0,el); rerenderAll(); renderLayers();
}
function addComp(kind){
  if(kind!=='banks') return;
  const bt=bankTag(); if(!bt) return;
  const cnt=Math.min(8,S.banks.length),w=56,h=40,gap=6,total=cnt*w+(cnt-1)*gap;
  const x0=Math.round((S.canvas.w-total)/2),y0=Math.round((S.canvas.h-h)/2);
  let last=null;
  for(let i=0;i<cnt;i++){
    const el=mk('button',{name:'Bank '+S.banks[i].letter,label:'{bank.letter}',x:x0+i*(w+gap),y:y0,w,h,tag:bt.id,mode:'radio',value:i,led:true,size:18});
    el.label=S.banks[i].letter;
    S.els.push(el);
    const n=document.createElement('div'); n.className='el button'; n.dataset.id=el.id; canvas.appendChild(n); nodes.set(el.id,n);
    renderEl(el); last=el;
  }
  if(last) select(last.id);
  flash('Bank buttons added, bound to the bank tag');
}

