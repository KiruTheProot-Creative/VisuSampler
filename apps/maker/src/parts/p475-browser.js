/* ---------- ready-made patch browser and a second patch slot (Interface tab > Add) ----------
   Patch browser: a display plus folder and patch buttons, wired to the patch tags (side A, or side B with "B").
   Second patch slot: switches on layer B, adds its browser and an A/B mix knob linked to both layers' volume. */
function ensureGroupMode(){
  if(patchModeOn())return;
  const p=playOf();setPatchMode(p,'group');
}
function addBrowser(B,at){
  ensureGroupMode();
  const sx=B?'B':'',W=380,H=104,x0=at?at.x:Math.round((S.canvas.w-W)/2),y0=at?at.y:Math.round((S.canvas.h-H)/2);
  const g={id:nid('g'),name:'Patch browser'+(B?' B':''),open:false};S.lgroups.push(g);
  const put=(type,o)=>{const e=mk(type,Object.assign({grp:g.id},o));S.els.push(e);const n=document.createElement('div');n.className='el '+type;n.dataset.id=e.id;canvas.appendChild(n);nodes.set(e.id,n);renderEl(e);return e;};
  put('panel',{name:'Browser panel'+(B?' B':''),x:x0,y:y0,w:W,h:H,radius:10});
  put('lcd',{name:'Patch display'+(B?' B':''),x:x0+10,y:y0+10,w:W-20,h:40,size:20,text:'{folder'+sx+'}  ·  {patch'+sx+'}'});
  const bw=80,bh=34,by=y0+H-bh-10;
  const btn=(label,verb,tag,x)=>put('button',{name:label+(B?' B':''),label,x,y:by,w:bw,h:bh,size:12,mode:'momentary',tag:'',rules:[{when:'press',cond:null,acts:[{verb,tag,val:''}]}]});
  btn('◀ Folder','prev','list'+sx,x0+10);btn('Folder ▶','next','list'+sx,x0+14+bw);
  btn('◀ Patch','prev','patch'+sx,x0+W-14-2*bw);btn('Patch ▶','next','patch'+sx,x0+W-10-bw);
  rerenderAll();renderLayers();refreshDisplays();
  return g;
}
function addSlotB(){
  ensureGroupMode();
  const p=playOf();if(!layerBOn()){setLayerB(p,true);S.play=p;}
  /* an A/B mix knob, linked to both layers' volume (equal power) */
  let mix=tagByName('Patch mix');if(!mix){mix=mkTag('Patch mix','number',{value:.5,def:.5});S.tags.push(mix);}
  const q=playOf(),ls=[layerOf(q,0),layerOf(q,1)];
  if(!ls[0].links.vol)ls[0].links.vol={tag:mix.id,from:0,to:-60};
  if(!ls[1].links.vol)ls[1].links.vol={tag:mix.id,from:-60,to:0};
  q.layers=ls;q.layerB=true;S.play=q;
  /* under browser A when there is one (above it if there is no room), otherwise in the middle */
  const W=380,H=104,ga=S.lgroups.find(x=>x.name==='Patch browser'),pa=ga&&S.els.find(e=>e.grp===ga.id&&e.type==='panel');
  let x0=Math.round((S.canvas.w-W)/2),y0=Math.round((S.canvas.h-H)/2);
  if(pa){x0=pa.x;y0=pa.y+pa.h+12;if(y0+H>S.canvas.h)y0=Math.max(0,pa.y-H-12);}
  const g=addBrowser(true,{x:x0,y:y0});
  const kx=x0+W+16+72<=S.canvas.w?x0+W+16:Math.max(0,x0-16-72),ky=pa?Math.round((Math.min(pa.y,y0)+Math.max(pa.y,y0)+H)/2-48):y0+4;
  const k=mk('knob',{name:'A/B mix',x:kx,y:ky,w:72,h:72,tag:mix.id,grp:g.id});S.els.push(k);
  const t=mk('text',{name:'A/B mix label',x:kx-24,y:ky+76,w:120,h:22,text:'A  ·  Mix  ·  B',size:13,align:'center',grp:g.id});S.els.push(t);
  [k,t].forEach(e=>{const n=document.createElement('div');n.className='el '+e.type;n.dataset.id=e.id;canvas.appendChild(n);nodes.set(e.id,n);renderEl(e);});
  rerenderAll();renderLayers();refreshDisplays();
  flash('Second patch slot added: side B picks its own patch, and the A/B mix knob blends them');
}
{const ac0=addComp;addComp=function(kind){
  if(kind==='browser'){const B=layerBOn()&&S.els.some(e=>e.rules&&e.rules.some(r=>r.acts&&r.acts.some(a=>a.tag==='patch')));const g=addBrowser(B);setSel(S.els.filter(e=>e.grp===g.id).map(e=>e.id));flash('Patch browser added'+(B?' for side B':'')+'. Restyle it like any other elements.');return;}
  if(kind==='slotB'){addSlotB();return;}
  return ac0(kind);
};}
/* new blank projects start with folders and patches */
{const bb0=buildBlank;buildBlank=function(){bb0.apply(this,arguments);setPatchMode(playOf(),'group');};}
