/* ---------- modular FX: interaction ---------- */
let addCount=0;
function fxSelect(id,cab){
  S.fx.sel=id||null; S.fx.cable=cab||null;
  $$('#fxNodes .fxn').forEach(e=>e.classList.toggle('sel',e.dataset.id===S.fx.sel));
  $$('#fxCables .cab').forEach(e=>e.classList.toggle('sel',e.dataset.cid===S.fx.cable));
  fxInspRender();
}
function newNodeAt(type,x,y){
  const g=curG(),n=fxNode(type,x,y); g.nodes.push(n); return n;
}
function centerSpot(){
  const st=$('#fxStage'),o=(addCount++%6)*22;
  return{x:st.clientWidth/2-S.fx.pan.x-95+o,y:st.clientHeight/2-S.fx.pan.y-60+o};
}
function fxAddCenter(type){
  const p=centerSpot(),n=newNodeAt(type,p.x,p.y);
  S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash(n.name+' added. Drag from a port to wire it.');
}
function insertOnCable(cid,type,x,y){
  const g=curG(),c=g.cables.find(k=>k.id===cid); if(!c) return;
  const a=nodeById(g,c.from.n),b=nodeById(g,c.to.n);
  if(cableKind(g,c)!=='audio'||FXT[type].kind==='mod'){
    const n=newNodeAt(type,x,y); S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash('Control cables cannot be split, so the node was just added.'); return;
  }
  const n=newNodeAt(type,x,y);
  g.cables=g.cables.filter(k=>k!==c);
  g.cables.push(mkCable(a,c.from.p,n,'in'));
  g.cables.push(mkCable(n,FXT[type].outs.indexOf('mix')>=0?'mix':FXT[type].outs[0],b,c.to.p));
  S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash('Inserted '+n.name+' into the cable.');
}
/* ---- search overlay ---- */
const SR={x:0,y:0,cab:null,list:[],i:0};
function srcFilter(q){
  q=q.trim().toLowerCase();
  return Object.keys(FXT).filter(k=>FXT[k].kind!=='io'&&(!q||(FXT[k].label+' '+FXT[k].cat+' '+FXT[k].hint).toLowerCase().indexOf(q)>=0));
}
function srcDraw(){
  SR.list=srcFilter($('#fxQ').value); SR.i=clamp(SR.i,0,Math.max(0,SR.list.length-1));
  $('#fxRes').innerHTML=SR.list.length?SR.list.map((k,i)=>'<li role="option" data-t="'+k+'" aria-selected="'+(i===SR.i)+'"><b>'+FXT[k].label+'</b><small>'+FXT[k].cat+'</small></li>').join(''):'<li class="none">Nothing matches</li>';
}
function openSearch(x,y,cab){
  const s=$('#fxSearch'),st=$('#fxStage').getBoundingClientRect();
  SR.x=x;SR.y=y;SR.cab=cab||null;SR.i=0;
  s.hidden=false; s.style.left=clamp(x+S.fx.pan.x,6,Math.max(6,st.width-260))+'px'; s.style.top=clamp(y+S.fx.pan.y,6,Math.max(6,st.height-280))+'px';
  $('#fxQ').value=''; srcDraw(); $('#fxQ').focus();
}
function closeSearch(){$('#fxSearch').hidden=true;}
function srcPick(type){
  if(!type) return; closeSearch();
  if(SR.cab) insertOnCable(SR.cab,type,SR.x,SR.y);
  else{const n=newNodeAt(type,SR.x,SR.y);S.fx.sel=n.id;S.fx.cable=null;fxRender();}
}
$('#fxQ').addEventListener('input',()=>{SR.i=0;srcDraw();});
$('#fxQ').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){SR.i=Math.min(SR.list.length-1,SR.i+1);srcDraw();e.preventDefault();}
  else if(e.key==='ArrowUp'){SR.i=Math.max(0,SR.i-1);srcDraw();e.preventDefault();}
  else if(e.key==='Enter'){srcPick(SR.list[SR.i]);e.preventDefault();}
  else if(e.key==='Escape'){closeSearch();e.preventDefault();}
});
$('#fxRes').addEventListener('click',e=>{const li=e.target.closest('[data-t]');if(li)srcPick(li.dataset.t);});
/* ---- pointer on the node stage ---- */
const fxStage=$('#fxStage');
function panPoint(ev){const r=$('#fxPan').getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
fxStage.addEventListener('pointerdown',e=>{
  const t=e.target;
  if(!$('#fxSearch').hidden&&!t.closest('#fxSearch')) closeSearch();
  const port=t.closest('.port');
  if(port&&port.dataset.dir==='out'){startWire(e,port);return;}
  if(port) return;
  if(t.closest('.fxb,input,select,textarea')) return;
  const hit=t.closest('.cab');
  if(hit){fxSelect(null,hit.dataset.cid);return;}
  const nd=t.closest('.fxn');
  if(nd){
    fxSelect(nd.dataset.id,null);
    if(t.closest('.fxh')) startNodeDrag(e,nd);
    return;
  }
  fxSelect(null,null);
  const sx=e.clientX,sy=e.clientY,ox=S.fx.pan.x,oy=S.fx.pan.y;
  fxStage.classList.add('panning');
  drag(ev=>{S.fx.pan.x=Math.round(ox+ev.clientX-sx);S.fx.pan.y=Math.round(oy+ev.clientY-sy);$('#fxPan').style.transform='translate('+S.fx.pan.x+'px,'+S.fx.pan.y+'px)';},()=>fxStage.classList.remove('panning'));
});
function startNodeDrag(e,nd){
  const n=nodeById(curG(),nd.dataset.id); if(!n) return; e.preventDefault();
  const sx=e.clientX,sy=e.clientY,ox=n.x,oy=n.y;
  drag(ev=>{
    n.x=Math.round(ox+ev.clientX-sx); n.y=Math.round(oy+ev.clientY-sy);
    nd.style.left=n.x+'px'; nd.style.top=n.y+'px'; fxCables();
  });
}
function startWire(e,port){
  e.preventDefault();
  const g=curG(),a=nodeById(g,port.dataset.n),ap=port.dataset.p; if(!a) return;
  fxStage.classList.add('wiring');
  $$('#fxNodes .port.in').forEach(p=>{const b=nodeById(g,p.dataset.n);p.classList.toggle('can',!!b&&!canConnect(g,a,ap,b,p.dataset.p));});
  const kind=fxIsMod(a)?'ctl':(ap==='out'?'mix':ap),tmp=$('#fxTemp');
  tmp.setAttribute('class','k-'+kind);
  const from=portPos($('#fxPan').getBoundingClientRect(),a.id,ap,'out');
  const upd=ev=>{const p=panPoint(ev);tmp.setAttribute('d',curvePath(from,p));};
  upd(e);
  drag(upd,()=>{});
  const fin=ev=>{
    window.removeEventListener('pointerup',fin);
    tmp.setAttribute('d',''); fxStage.classList.remove('wiring');
    $$('#fxNodes .port.can').forEach(p=>p.classList.remove('can'));
    const el=document.elementFromPoint(ev.clientX,ev.clientY);
    let tp=el&&el.closest('.port.in'),b,bp;
    if(tp){b=nodeById(g,tp.dataset.n);bp=tp.dataset.p;}
    else{
      const nd=el&&el.closest('.fxn');
      if(nd&&!fxIsMod(a)){b=nodeById(g,nd.dataset.id);bp='in';}
    }
    if(!b) return;
    const why=addCable(g,a,ap,b,bp);
    if(why){flash(why);return;}
    fxRender();
  };
  window.addEventListener('pointerup',fin);
}
fxStage.addEventListener('dblclick',e=>{
  if(e.target.closest('.fxn,.port,#fxSearch')) return;
  const hit=e.target.closest('.cab'),p=panPoint(e);
  openSearch(p.x-40,p.y-20,hit?hit.dataset.cid:null);
});
/* ---- parameter inputs ---- */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('pr')){
    const g=curG(),n=nodeById(g,t.dataset.n),q=n&&FXT[n.type].params.find(x=>x.k===t.dataset.pk); if(!q) return;
    if(fxSynced(n,q)){n.ps=n.ps||{};n.ps[q.k]=t.value/1000;}
    else{n.p[q.k]=realOfNorm(q,t.value/1000);if(q.opts)n.p[q.k]=Math.round(n.p[q.k]);}
    const row=t.closest('.fxp');
    row.querySelector('.pv').textContent=fmtParR(q,parReal(g,n,q,fxClock()));
    S.fx.an=fxAnalyze(g); fxReport(); return;
  }
  if(t.dataset&&t.dataset.fn==='name'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return; n.name=t.value||FXT[n.type].label;
    const h=$('#fxNodes .fxn[data-id="'+n.id+'"] .fxh b'); if(h) h.textContent=n.name; return;
  }
  if(t.dataset&&t.dataset.fa==='amt'){
    const c=curG().cables.find(k=>k.id===S.fx.cable); if(!c) return; c.amt=+t.value; t.nextElementSibling.textContent=c.amt+'%'; fxRefreshParams();
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('mtag')){
    const n=nodeById(curG(),t.dataset.n); if(!n) return; if(t.value) n.tag.value=t.value; else delete n.tag.value; fxRefreshParams(); return;
  }
  if(t.dataset&&t.dataset.fn==='sync'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return; n.sync=t.checked; if(n.sync)fxSyncInit(n); fxRender(); return;
  }
  if(t.dataset&&(t.dataset.fn==='ir'||t.dataset.fn==='skin')){
    const n=nodeById(curG(),S.fx.sel); if(!n) return;
    if(t.dataset.fn==='ir'){n.s=n.s||{};n.s.ir=t.value||null;}else n.skin=t.checked?'pedal':null;
    fxRender(); return;
  }
  if(t.dataset&&t.dataset.fn==='tag'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return;
    if(t.value) n.tag[t.dataset.k]=t.value; else delete n.tag[t.dataset.k];
    fxRender();
  }
});
/* ---- buttons ---- */
function fxAct(act,b){
  const g=curG(),id=b.dataset.id,n=id&&nodeById(g,id);
  switch(act){
    case 'add': fxAddCenter(b.dataset.t); break;
    case 'scope': S.fx.scope=b.dataset.s; S.fx.sel=null; S.fx.cable=null; S.fx.pan={x:30,y:20}; fxRender(); break;
    case 'byp': if(n){n.bypass=!n.bypass;fxRender();} break;
    case 'del': if(n&&FXT[n.type].kind!=='io'){removeNode(g,n.id);if(S.fx.sel===n.id)S.fx.sel=null;fxRender();} break;
    case 'delcab': g.cables=g.cables.filter(c=>c.id!==S.fx.cable); S.fx.cable=null; fxRender(); break;
    case 'insert': {
      const c=g.cables.find(k=>k.id===S.fx.cable); if(!c) break;
      const a=nodeById(g,c.from.n),bb=nodeById(g,c.to.n);
      openSearch(Math.round((a.x+bb.x)/2)+60,Math.round((a.y+bb.y)/2)+30,c.id); break;
    }
    case 'sup': case 'sdn': {
      const o=chainOrder(g),i=o.findIndex(x=>x.id===id),j=i+(act==='sup'?-1:1); if(i<0||j<0||j>=o.length) break;
      o.splice(j,0,o.splice(i,1)[0]); relinkChain(g,o); fxRender(); break;
    }
    case 'sadd': {const o=chainOrder(g),m=fxNode($('#stkAdd').value,0,0);g.nodes.push(m);o.push(m);relinkChain(g,o);fxRender();break;}
    case 'sflat': relinkChain(g,chainOrder(g)); fxRender(); flash('Flattened to a straight chain'); break;
  }
}
document.addEventListener('click',e=>{
  if(S.view!=='fx') return;
  const b=e.target.closest('[data-fa]'); if(!b||b.tagName==='INPUT'||b.tagName==='SELECT') return;
  fxAct(b.dataset.fa,b);
});
$('#fxVNodes').addEventListener('click',()=>{S.fx.view='nodes';fxRender();});
$('#fxVStack').addEventListener('click',()=>{S.fx.view='stack';fxRender();});
$('#fxFlow').addEventListener('click',()=>{S.fx.flow=!S.fx.flow;fxRender();flash(S.fx.flow?'Flow on: cables animate and modulators move.':'Flow off');});
$('#fxFit').addEventListener('click',()=>{S.fx.pan={x:30,y:20};fxRender();});
$('#fxAddBtn').addEventListener('click',()=>{const p=centerSpot();openSearch(p.x,p.y,null);});
/* keys, called from the global handler while the FX view is open */
function fxKey(e){
  if(!$('#fxSearch').hidden) return;
  const g=curG();
  if(e.key==='Delete'||e.key==='Backspace'){
    if(S.fx.cable){g.cables=g.cables.filter(c=>c.id!==S.fx.cable);S.fx.cable=null;fxRender();e.preventDefault();}
    else if(S.fx.sel){const n=nodeById(g,S.fx.sel);if(n&&FXT[n.type].kind!=='io'){removeNode(g,n.id);S.fx.sel=null;fxRender();e.preventDefault();}}
  }else if(e.key==='b'&&S.fx.sel){const n=nodeById(g,S.fx.sel);if(n&&FXT[n.type].kind!=='io'){n.bypass=!n.bypass;fxRender();}}
  else if(e.key==='a'||e.key==='/'){const p=centerSpot();openSearch(p.x,p.y,S.fx.cable);e.preventDefault();}
  else if(e.key==='Escape'){fxSelect(null,null);}
}
