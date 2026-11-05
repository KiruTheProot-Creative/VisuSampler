/* ---------- multi selection, layer groups and moving layers ----------
   S.msel holds every selected element; S.sel stays the "main" one (the one clicked last).
   A layer group is a run of elements with the same el.grp, listed in S.lgroups. Groups are only for editing:
   the player ignores them, so nothing changes in how a library looks or plays. */
S.msel=[];S.lgroups=[];
const lgById=id=>S.lgroups.find(g=>g.id===id)||null;
function mselIds(){
  if(!S.sel){S.msel=[];return S.msel;}
  S.msel=S.msel.filter(id=>S.els.some(e=>e.id===id));
  if(S.msel.indexOf(S.sel)<0)S.msel=[S.sel];
  return S.msel;
}
const selEls=()=>{const ids=mselIds();return S.els.filter(e=>ids.indexOf(e.id)>=0);};
const grpMembers=gid=>S.els.filter(e=>e.grp===gid);
/* clicking a grouped element picks the whole group (Alt picks just the element) */
const withGroups=ids=>{const out=new Set(ids);ids.forEach(id=>{const e=S.els.find(x=>x.id===id);if(e&&e.grp)grpMembers(e.grp).forEach(m=>out.add(m.id));});return [...out];};
function setSel(ids,primary){
  ids=ids.filter((v,i)=>ids.indexOf(v)===i);
  S.msel=ids;S.sel=ids.length?(primary&&ids.indexOf(primary)>=0?primary:ids[ids.length-1]):null;
  if(S.sel&&S.tab!=='props')S.tab='props';
  renderLayers();placeSel();renderRight();
}
select=function(id){setSel(id?[id]:[],id);};
/* drop groups nobody is in, and keep each group's elements next to each other in the stacking order */
function tidyGroups(){
  S.lgroups=S.lgroups.filter(g=>S.els.some(e=>e.grp===g.id));
  S.els.forEach(e=>{if(e.grp&&!lgById(e.grp))delete e.grp;});
  for(const g of S.lgroups){
    const m=grpMembers(g.id);if(m.length<2)continue;
    const top=S.els.indexOf(m[m.length-1]),rest=S.els.filter(e=>e.grp!==g.id);
    let ins=0;for(let i=0;i<top;i++)if(S.els[i].grp!==g.id)ins++;
    rest.splice(ins,0,...m);S.els=rest;
  }
}
function groupSel(){
  const els=selEls();if(els.length<2){flash('Select two or more elements to group them');return;}
  const g={id:nid('g'),name:'Group '+(S.lgroups.length+1),open:true};S.lgroups.push(g);
  /* the group sits where its topmost element was */
  const top=S.els.indexOf(els[els.length-1]),rest=S.els.filter(e=>els.indexOf(e)<0);
  let ins=0;for(let i=0;i<top;i++)if(els.indexOf(S.els[i])<0)ins++;
  els.forEach(e=>{e.grp=g.id;});rest.splice(ins,0,...els);S.els=rest;
  tidyGroups();rerenderAll();setSel(els.map(e=>e.id),S.sel);flash(g.name+': '+els.length+' elements');
}
function ungroupSel(){
  const gs=new Set(selEls().map(e=>e.grp).filter(Boolean));if(!gs.size)return;
  S.els.forEach(e=>{if(gs.has(e.grp))delete e.grp;});tidyGroups();renderLayers();renderRight();
}
/* ---- moving, deleting, duplicating every selected element ---- */
function startMoveMulti(e){
  const els=selEls();if(!els.length)return;e.preventDefault();
  const sx=e.clientX,sy=e.clientY,o=els.map(el=>({el,x:el.x,y:el.y}));
  const bx0=Math.min(...els.map(el=>el.x)),by0=Math.min(...els.map(el=>el.y)),bw=Math.max(...els.map(el=>el.x+el.w))-bx0,bh=Math.max(...els.map(el=>el.y+el.h))-by0;
  let moved=false;
  drag(ev=>{
    let dx=(ev.clientX-sx)/S.z,dy=(ev.clientY-sy)/S.z;if(!moved&&Math.abs(dx)+Math.abs(dy)<.5)return;moved=true;
    if(S.snap&&!ev.altKey){
      const xs=[0,S.canvas.w/2,S.canvas.w],ys=[0,S.canvas.h/2,S.canvas.h];
      S.els.forEach(q=>{if(els.indexOf(q)>=0)return;xs.push(q.x,q.x+q.w/2,q.x+q.w);ys.push(q.y,q.y+q.h/2,q.y+q.h);});
      const nx=bx0+dx,ny=by0+dy,sxx=snap1([nx,nx+bw/2,nx+bw],xs),syy=snap1([ny,ny+bh/2,ny+bh],ys);
      if(sxx)dx+=sxx.d;if(syy)dy+=syy.d;showGuides(sxx?sxx.t:null,syy?syy.t:null);
    }else hideGuides();
    o.forEach(p=>{p.el.x=Math.round(p.x+dx);p.el.y=Math.round(p.y+dy);renderEl(p.el);});placeSel();syncPosFields();
  },hideGuides);
}
startMove=startMoveMulti;
delEl=function(){
  const els=selEls();if(!els.length)return;
  els.forEach(el=>{const n=nodes.get(el.id);if(n)n.remove();nodes.delete(el.id);});
  S.els=S.els.filter(e=>els.indexOf(e)<0);tidyGroups();rerenderAll();setSel([]);
};
dupEl=function(){
  const els=selEls();if(!els.length)return;
  /* a whole group duplicates into a new group; part of a group stays in it */
  const gmap={};els.forEach(e=>{if(e.grp&&!gmap[e.grp]&&grpMembers(e.grp).every(m=>els.indexOf(m)>=0)){const g=lgById(e.grp),ng={id:nid('g'),name:g.name+' copy',open:true};S.lgroups.push(ng);gmap[e.grp]=ng.id;}});
  const top=S.els.indexOf(els[els.length-1]),copies=els.map(el=>{const c=JSON.parse(JSON.stringify(el));c.id=nid('e');c.name=el.name+(els.length>1?'':' copy');c.x+=16;c.y+=16;if(c.grp&&gmap[c.grp])c.grp=gmap[c.grp];return c;});
  S.els.splice(top+1,0,...copies);
  copies.forEach(c=>{const n=document.createElement('div');n.className='el '+c.type;n.dataset.id=c.id;canvas.appendChild(n);nodes.set(c.id,n);});
  tidyGroups();rerenderAll();setSel(copies.map(c=>c.id));
};
moveZ=function(d){
  const ids=mselIds();if(!ids.length)return;
  const isSel=e=>ids.indexOf(e.id)>=0,a=S.els;
  if(d>0){for(let i=a.length-2;i>=0;i--)if(isSel(a[i])&&!isSel(a[i+1])){const t=a[i];a[i]=a[i+1];a[i+1]=t;}}
  else{for(let i=1;i<a.length;i++)if(isSel(a[i])&&!isSel(a[i-1])){const t=a[i];a[i]=a[i-1];a[i-1]=t;}}
  tidyGroups();rerenderAll();renderLayers();
};
function nudgeSel(dx,dy){selEls().forEach(el=>{el.x+=dx;el.y+=dy;renderEl(el);});placeSel();syncPosFields();}
/* ---- selection box: one box around everything, an outline on each element ---- */
const mselLayer=document.createElement('div');mselLayer.id='mselLayer';$('#viewport').insertBefore(mselLayer,$('#selbox'));
placeSel=function(){
  const sb=$('#selbox'),els=S.mode==='design'?selEls():[];
  mselLayer.innerHTML='';sb.classList.toggle('multi',els.length>1);
  if(!els.length){sb.hidden=true;return;}
  const z=S.z,x0=Math.min(...els.map(e=>e.x)),y0=Math.min(...els.map(e=>e.y)),x1=Math.max(...els.map(e=>e.x+e.w)),y1=Math.max(...els.map(e=>e.y+e.h));
  sb.hidden=false;sb.style.left=(x0*z)+'px';sb.style.top=(y0*z)+'px';sb.style.width=((x1-x0)*z)+'px';sb.style.height=((y1-y0)*z)+'px';
  if(els.length>1){
    els.forEach(e=>{const d=document.createElement('div');d.className='mselOne';d.style.cssText='left:'+(e.x*z)+'px;top:'+(e.y*z)+'px;width:'+(e.w*z)+'px;height:'+(e.h*z)+'px';mselLayer.appendChild(d);});
    const gs=new Set(els.map(e=>e.grp)),g=gs.size===1&&lgById([...gs][0]);
    $('#selTag').textContent=(g&&grpMembers(g.id).length===els.length?g.name+' · ':'')+els.length+' selected · '+Math.round(x1-x0)+'×'+Math.round(y1-y0);
  }else $('#selTag').textContent=els[0].name+' · '+Math.round(els[0].w)+'×'+Math.round(els[0].h);
};
/* ---- canvas: click, Shift/Ctrl-click, and a marquee from empty space ---- */
stageEl.addEventListener('pointerdown',e=>{
  if(S.mode!=='design'||S.view!=='design'||e.button!==0)return;
  if(e.target.closest('#selbox .hd'))return;
  let n=e.target.closest('#canvas .el');const add=e.shiftKey||e.ctrlKey||e.metaKey;
  /* a background that fills the whole canvas counts as empty space for dragging (a click still selects it) */
  let backdrop=null;
  if(n){const el=S.els.find(x=>x.id===n.dataset.id);if(el&&el.x<=1&&el.y<=1&&el.x+el.w>=S.canvas.w-1&&el.y+el.h>=S.canvas.h-1&&mselIds().indexOf(el.id)<0){backdrop=el;n=null;}}
  if(n){
    e.stopImmediatePropagation();
    const id=n.dataset.id,ids=e.altKey?[id]:withGroups([id]),cur=mselIds();
    if(add){const has=ids.every(i=>cur.indexOf(i)>=0);setSel(has?cur.filter(i=>ids.indexOf(i)<0):cur.concat(ids),has?null:id);if(has)return;}
    else if(e.altKey||!ids.every(i=>cur.indexOf(i)>=0))setSel(ids,id);   /* already selected: keep it, so the whole selection drags */
    else if(S.sel!==id){S.sel=id;renderLayers();renderRight();}
    startMoveMulti(e);return;
  }
  if(!backdrop&&!(e.target===stageEl||e.target===vp||e.target===canvas))return;
  e.preventDefault();e.stopImmediatePropagation();
  const r=canvas.getBoundingClientRect(),base=add?mselIds().slice():[],p0={x:(e.clientX-r.left)/S.z,y:(e.clientY-r.top)/S.z};
  const box=document.createElement('div');box.id='marquee';box.hidden=true;mselLayer.after(box);
  if(!add)setSel([]);
  let swept=false;
  drag(ev=>{
    const p1={x:(ev.clientX-r.left)/S.z,y:(ev.clientY-r.top)/S.z},x0=Math.min(p0.x,p1.x),y0=Math.min(p0.y,p1.y),x1=Math.max(p0.x,p1.x),y1=Math.max(p0.y,p1.y);
    if(x1-x0<3&&y1-y0<3)return;
    swept=true;box.hidden=false;box.style.cssText='left:'+(x0*S.z)+'px;top:'+(y0*S.z)+'px;width:'+((x1-x0)*S.z)+'px;height:'+((y1-y0)*S.z)+'px';
    const hit=S.els.filter(q=>q.x<x1&&q.x+q.w>x0&&q.y<y1&&q.y+q.h>y0).map(q=>q.id);
    setSel(base.concat(withGroups(hit)));
  },()=>{box.remove();if(!swept&&backdrop)setSel(add?base.concat([backdrop.id]):[backdrop.id],backdrop.id);});
},true);
/* ---- layers panel: groups as folders, Ctrl/Shift-click, drag to reorder or move into a group ---- */
renderLayers=function(){
  const ids=mselIds(),rows=S.els.slice().reverse(),row=e=>'<li draggable="true" data-drag="'+e.id+'"><button type="button" class="lr'+(e.id===S.sel?' on':ids.indexOf(e.id)>=0?' msel':'')+'" data-id="'+e.id+'"><i class="ic '+e.type+'"></i><span>'+esc(e.name)+'</span><small>'+e.type+'</small></button></li>';
  let h='';
  for(let i=0;i<rows.length;){
    const e=rows[i],g=e.grp&&lgById(e.grp);
    if(!g){h+=row(e);i++;continue;}
    const run=[];while(i<rows.length&&rows[i].grp===g.id)run.push(rows[i++]);
    const allIn=run.every(m=>ids.indexOf(m.id)>=0);
    h+='<li class="lg'+(g.open?' open':'')+'" data-g="'+g.id+'"><div class="lgh'+(allIn?' on':'')+'" draggable="true" data-gdrag="'+g.id+'"><button type="button" class="lgt" data-gt="'+g.id+'" aria-label="'+(g.open?'Collapse':'Expand')+' '+esc(g.name)+'" aria-expanded="'+g.open+'">'+(g.open?'▾':'▸')+'</button><button type="button" class="lgn" data-gsel="'+g.id+'"><span>'+esc(g.name)+'</span><small>'+run.length+'</small></button></div>'
      +(g.open?'<ul>'+run.map(row).join('')+'</ul>':'')+'</li>';
  }
  $('#layers').innerHTML=h;$('#layerCount').textContent='· '+S.els.length;
};
$('#layers').addEventListener('click',e=>{
  const gt=e.target.closest('[data-gt]');if(gt){const g=lgById(gt.dataset.gt);if(g){g.open=!g.open;renderLayers();}e.stopPropagation();return;}
  const gs=e.target.closest('[data-gsel]');if(gs){const m=grpMembers(gs.dataset.gsel).map(x=>x.id);setSel(e.shiftKey||e.ctrlKey||e.metaKey?mselIds().concat(m):m);e.stopPropagation();return;}
  const lr=e.target.closest('.lr');if(!lr)return;e.stopPropagation();
  const id=lr.dataset.id,cur=mselIds();
  if(e.ctrlKey||e.metaKey){const has=cur.indexOf(id)>=0;setSel(has?cur.filter(i=>i!==id):cur.concat([id]),has?null:id);return;}
  if(e.shiftKey&&S.sel){const order=S.els.slice().reverse().map(x=>x.id),a=order.indexOf(S.sel),b=order.indexOf(id);setSel(cur.concat(order.slice(Math.min(a,b),Math.max(a,b)+1)),S.sel);return;}
  select(id);
},true);
let LDRAG=null;
$('#layers').addEventListener('dragstart',e=>{
  const gd=e.target.closest('[data-gdrag]'),ed=e.target.closest('[data-drag]');
  if(gd)LDRAG={grp:gd.dataset.gdrag,ids:grpMembers(gd.dataset.gdrag).map(x=>x.id)};
  else if(ed){const id=ed.dataset.drag,cur=mselIds();LDRAG={ids:cur.indexOf(id)>=0?cur.slice():[id]};}
  else return;
  e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','layers');}catch(err){}
});
function dropSpot(e){
  const t=e.target.closest('#layers [data-drag], #layers .lgh');if(!t||!LDRAG)return null;
  const r=t.getBoundingClientRect(),above=e.clientY<r.top+r.height/2;
  return{t,above,gh:t.classList.contains('lgh')?t.dataset.gdrag:null,id:t.dataset.drag||null};
}
const clearDrop=()=>$$('#layers .dropA,#layers .dropB').forEach(x=>x.classList.remove('dropA','dropB'));
$('#layers').addEventListener('dragover',e=>{const s=dropSpot(e);if(!s)return;e.preventDefault();clearDrop();s.t.classList.add(s.above?'dropA':'dropB');});
$('#layers').addEventListener('dragleave',e=>{if(!e.relatedTarget||!$('#layers').contains(e.relatedTarget))clearDrop();});
$('#layers').addEventListener('dragend',()=>{clearDrop();LDRAG=null;});
$('#layers').addEventListener('drop',e=>{
  const s=dropSpot(e);clearDrop();if(!s){LDRAG=null;return;}e.preventDefault();
  const mv=S.els.filter(x=>LDRAG.ids.indexOf(x.id)>=0);if(!mv.length){LDRAG=null;return;}
  let target,front,grp;   /* front: lands in front of target (above it in the list) */
  if(s.gh){
    const m=grpMembers(s.gh);
    if(LDRAG.grp||!s.above&&!lgById(s.gh).open){target=s.above?m[m.length-1]:m[0];front=s.above;grp=null;}
    else{target=m[m.length-1];front=true;grp=s.gh;}   /* onto a group header: join the group, at its top */
    if(LDRAG.grp===s.gh){LDRAG=null;return;}
  }else{
    target=S.els.find(x=>x.id===s.id);front=s.above;grp=target.grp||null;
    if(LDRAG.grp&&grp&&grp!==LDRAG.grp){const m=grpMembers(grp);target=front?m[m.length-1]:m[0];grp=null;}   /* a group never lands inside another */
    if(LDRAG.grp)grp=LDRAG.grp;
  }
  if(mv.indexOf(target)>=0){LDRAG=null;return;}
  const rest=S.els.filter(x=>mv.indexOf(x)<0),at=rest.indexOf(target)+(front?1:0);
  rest.splice(at,0,...mv);S.els=rest;
  if(!LDRAG.grp)mv.forEach(x=>{if(grp)x.grp=grp;else delete x.grp;});
  LDRAG=null;tidyGroups();rerenderAll();renderLayers();placeSel();renderRight();
});
/* ---- inspector for several elements: group, align, distribute ---- */
const propsHTMLOne=propsHTML;
propsHTML=function(){
  const els=selEls();if(els.length<2)return propsHTMLOne();
  const gs=new Set(els.map(e=>e.grp)),g=gs.size===1&&lgById([...gs][0]),whole=g&&grpMembers(g.id).length===els.length;
  let h='<div class="phead"><b class="pname">'+(whole?esc(g.name):els.length+' elements')+'</b><span class="badge">'+els.length+' selected</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-act="fwd">Forward</button><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="dup">Duplicate</button><button type="button" class="btn danger" data-act="del">Delete</button></div>';
  h+=sec('Group',whole?'<label class="f"><span>Name</span><input type="text" data-gname="'+g.id+'" value="'+esc(g.name)+'"></label><div class="chips"><button type="button" class="btn" data-mg="ungroup">Ungroup</button></div>'
    :'<div class="chips"><button type="button" class="btn" data-mg="group">Group them</button>'+([...gs].some(Boolean)?'<button type="button" class="btn" data-mg="ungroup">Ungroup</button>':'')+'</div><p class="hint">Ctrl+G groups, Ctrl+Shift+G ungroups. A group moves and selects as one; Alt-click picks one element inside it.</p>');
  const A=[['l','Left'],['c','Centre'],['r','Right'],['t','Top'],['m','Middle'],['b','Bottom']];
  h+=sec('Align','<div class="chips">'+A.map(a=>'<button type="button" class="btn" data-al="'+a[0]+'">'+a[1]+'</button>').join('')+'</div>'
    +(els.length>2?'<div class="chips"><button type="button" class="btn" data-al="dh">Space evenly across</button><button type="button" class="btn" data-al="dv">Space evenly down</button></div>':''));
  return h;
};
function alignSel(k){
  const els=selEls();if(els.length<2)return;
  const x0=Math.min(...els.map(e=>e.x)),y0=Math.min(...els.map(e=>e.y)),x1=Math.max(...els.map(e=>e.x+e.w)),y1=Math.max(...els.map(e=>e.y+e.h));
  if(k==='dh'||k==='dv'){
    const v=k==='dh',s=els.slice().sort((a,b)=>v?a.x-b.x:a.y-b.y),tot=s.reduce((a,e)=>a+(v?e.w:e.h),0),gap=((v?x1-x0:y1-y0)-tot)/(s.length-1);let p=v?x0:y0;
    s.forEach(e=>{if(v)e.x=Math.round(p);else e.y=Math.round(p);p+=(v?e.w:e.h)+gap;});
  }else els.forEach(e=>{
    if(k==='l')e.x=x0;if(k==='r')e.x=x1-e.w;if(k==='c')e.x=Math.round((x0+x1-e.w)/2);
    if(k==='t')e.y=y0;if(k==='b')e.y=y1-e.h;if(k==='m')e.y=Math.round((y0+y1-e.h)/2);
  });
  els.forEach(renderEl);placeSel();
}
rbody.addEventListener('click',e=>{
  const al=e.target.closest('[data-al]');if(al){alignSel(al.dataset.al);return;}
  const mg=e.target.closest('[data-mg]');if(mg){if(mg.dataset.mg==='group')groupSel();else ungroupSel();}
});
rbody.addEventListener('input',e=>{const t=e.target;if(!t.dataset.gname)return;const g=lgById(t.dataset.gname);if(g){g.name=t.value;renderLayers();placeSel();}});
/* ---- saved with the project ---- */
(function(){
  const s0=snapshot;snapshot=function(){const s=s0();s.lgroups=JSON.parse(JSON.stringify(S.lgroups));return s;};
  const r0=restore;restore=function(sn){r0(sn);S.lgroups=sn&&sn.lgroups?JSON.parse(JSON.stringify(sn.lgroups)):[];S.msel=[];tidyGroups();};
})();
