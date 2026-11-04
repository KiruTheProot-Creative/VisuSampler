/* ---------- mapper: zone grid + piano ---------- */
const MG={W:600,H:300,dirty:true,conf:null,confVer:-1,down:new Set(),drag:null,run:false,pian:{H:54}};
const mapCv=$('#mapCanvas'),pianoCv=$('#mapPiano');
const mkx=k=>k*S.map.zoom-S.map.sx;
const velH=()=>MG.H/128;
const vely=v=>MG.H-v*velH();
const editable=z=>S.map.editAll||z.group===S.map.group;
function mapInvalidate(){MG.dirty=true;}
function mapSize(){
  const wrap=$('#mapWrap'),w=Math.max(200,wrap.clientWidth),h=Math.max(160,wrap.clientHeight),d=Math.min(2,dpr());
  MG.W=w;MG.H=h; mapCv.width=Math.round(w*d);mapCv.height=Math.round(h*d);mapCv.style.width=w+'px';mapCv.style.height=h+'px';
  pianoCv.width=Math.round(w*d);pianoCv.height=Math.round(MG.pian.H*d);pianoCv.style.width=w+'px';pianoCv.style.height=MG.pian.H+'px';
  const sc=$('#mapScroll'); const max=Math.max(0,128*S.map.zoom-w); S.map.sx=clamp(S.map.sx,0,max); sc.max=max; sc.value=S.map.sx; sc.disabled=max<=0;
  mapInvalidate();
}
function setZoom(z,anchorX){
  const old=S.map.zoom; z=clamp(z,3,40); if(z===old) return;
  const ax=anchorX==null?MG.W/2:anchorX,k=(S.map.sx+ax)/old; S.map.zoom=z; S.map.sx=k*z-ax; $('#mapZoom').value=z; mapSize();
}
const css=(n,f)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||f;
function mapDraw(){
  MG.dirty=false;
  if(MG.confVer!==S.map.ver){MG.conf=zoneConflicts();MG.confVer=S.map.ver;}
  const d=Math.min(2,dpr()),W=MG.W,H=MG.H,z=S.map.zoom,vh=velH(),ctx=mapCv.getContext('2d'),now=performance.now();
  ctx.setTransform(d,0,0,d,0,0);
  ctx.fillStyle='#363636';ctx.fillRect(0,0,W,H);
  const k0=Math.max(0,Math.floor(S.map.sx/z)),k1=Math.min(127,Math.ceil((S.map.sx+W)/z));
  for(let k=k0;k<=k1;k++){
    const x=mkx(k);
    if(isBlack(k)){ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x,0,z,H);}
    ctx.fillStyle=k%12===0?'rgba(255,255,255,.22)':'rgba(255,255,255,.06)';ctx.fillRect(x,0,1,H);
  }
  ctx.fillStyle='rgba(255,255,255,.1)';
  [32,64,96].forEach(v=>ctx.fillRect(0,vely(v),W,1));
  ctx.font='10px "JetBrains Mono",monospace';ctx.textBaseline='top';
  /* zones */
  const sel=new Set(S.map.sel);
  const pr=zz=>(sel.has(zz.id)?2:0)+(zz.group===S.map.group?1:0),order=S.zones.slice().sort((a,b)=>pr(a)-pr(b));
  order.forEach(zn=>{
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(x2<0||x1>W) return;
    const col=gcfg(zn.group).color,on=editable(zn),s=sel.has(zn.id),hot=now-(S.map.hot[zn.id]||0);
    ctx.globalAlpha=on?1:.28;
    ctx.fillStyle=col;ctx.globalAlpha*=s?.78:.5;ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.globalAlpha=on?1:.28;
    if(hot<500){ctx.fillStyle='rgba(255,255,255,'+(.7*(1-hot/500)).toFixed(2)+')';ctx.fillRect(x1,y1,x2-x1,y2-y1);}
    /* fades as shaded ramps */
    const shade='rgba(30,30,30,.62)';
    const gH=(xa,xb,rev)=>{const g=ctx.createLinearGradient(xa,0,xb,0);g.addColorStop(0,rev?'rgba(30,30,30,0)':shade);g.addColorStop(1,rev?shade:'rgba(30,30,30,0)');return g;};
    if(zn.fadeLo>0){ctx.fillStyle=gH(x1,x1+zn.fadeLo*z,false);ctx.fillRect(x1,y1,zn.fadeLo*z,y2-y1);}
    if(zn.fadeHi>0){ctx.fillStyle=gH(x2-zn.fadeHi*z,x2,true);ctx.fillRect(x2-zn.fadeHi*z,y1,zn.fadeHi*z,y2-y1);}
    const gV=(ya,yb)=>{const g=ctx.createLinearGradient(0,ya,0,yb);g.addColorStop(0,shade);g.addColorStop(1,'rgba(30,30,30,0)');return g;};
    if(zn.vfadeLo>0){const h=zn.vfadeLo*vh;ctx.fillStyle=gV(y2,y2-h);ctx.fillRect(x1,y2-h,x2-x1,h);}
    if(zn.vfadeHi>0){const h=zn.vfadeHi*vh;ctx.fillStyle=gV(y1,y1+h);ctx.fillRect(x1,y1,x2-x1,h);}
    const bad=MG.conf&&MG.conf.has(zn.id);
    ctx.strokeStyle=s?'#ffffff':bad?'#ff6a5e':col;ctx.lineWidth=s?2:1;
    if(bad&&!s)ctx.setLineDash([4,3]);ctx.strokeRect(x1+.5,y1+.5,x2-x1-1,y2-y1-1);ctx.setLineDash([]);
    /* root marker */
    const rx=mkx(zn.root)+z/2;
    if(rx>x1-1&&rx<x2+1){ctx.fillStyle=s?'#fff':'rgba(255,255,255,.75)';ctx.beginPath();ctx.moveTo(rx-4,y2);ctx.lineTo(rx+4,y2);ctx.lineTo(rx,y2-6);ctx.fill();}
    /* label */
    if(x2-x1>26&&y2-y1>12){
      ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.fillStyle='#10161c';ctx.globalAlpha=on?.9:.4;
      const sm=sampleById(zn.sample);
      ctx.fillText((sm?sm.name:'—')+(zn.seq>1?'  #'+zn.seq:''),x1+4,y1+3+(zn.vfadeHi>0?0:0));
      if(zn.loop.on)ctx.fillText('∞',x2-12,y1+3);
      if(zn.mute)ctx.fillText('M',x2-12,y1+15);
      ctx.restore();
    }
    ctx.globalAlpha=1;
    if(s&&x2-x1>18){
      ctx.fillStyle='#fff';ctx.strokeStyle='#10161c';ctx.lineWidth=1;
      const hd=(x,y)=>{ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.stroke();};
      hd(x1+zn.fadeLo*z+(zn.fadeLo?0:6),y1+7);hd(x2-zn.fadeHi*z-(zn.fadeHi?0:6),y1+7);
      hd(x1+6,y2-zn.vfadeLo*vh-(zn.vfadeLo?0:7));hd(x2-6,y1+zn.vfadeHi*vh+(zn.vfadeHi?0:7));
    }
  });
  /* velocity labels */
  ctx.fillStyle='rgba(255,255,255,.55)';ctx.textBaseline='middle';
  [127,96,64,32,0].forEach(v=>ctx.fillText(String(v),3,clamp(vely(v)-(v===0?7:0),6,H-6)));
  if(S.map.marq){const m=S.map.marq;ctx.fillStyle='rgba(90,160,255,.18)';ctx.strokeStyle='#5aa0ff';ctx.lineWidth=1;ctx.fillRect(m.x1,m.y1,m.x2-m.x1,m.y2-m.y1);ctx.strokeRect(m.x1+.5,m.y1+.5,m.x2-m.x1,m.y2-m.y1);}
  pianoDraw();
}
function pianoDraw(){
  const d=Math.min(2,dpr()),W=MG.W,H=MG.pian.H,z=S.map.zoom,ctx=pianoCv.getContext('2d');
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#202020';ctx.fillRect(0,0,W,H);
  const k0=Math.max(0,Math.floor(S.map.sx/z)),k1=Math.min(127,Math.ceil((S.map.sx+W)/z)),now=performance.now();
  const cover=new Array(128).fill(null);
  S.zones.forEach(zn=>{if(!editable(zn))return;for(let k=zn.lo;k<=zn.hi;k++)cover[k]=gcfg(zn.group).color;});
  for(let k=k0;k<=k1;k++){
    const x=mkx(k),down=MAPN.has(k);
    if(!isBlack(k)){ctx.fillStyle=down?'#8fb4e0':'#e9e9e9';ctx.fillRect(x,0,z-1,H-8);}
    else{ctx.fillStyle=down?'#8fb4e0':'#101010';ctx.fillRect(x,0,z-1,(H-8)*.6);}
    if(cover[k]){ctx.fillStyle=cover[k];ctx.fillRect(x,H-6,z-1,6);}
    if(k%12===0&&z>=7){ctx.fillStyle='#222';ctx.font='9px "JetBrains Mono",monospace';ctx.textBaseline='bottom';ctx.fillText(noteName(k),x+2,H-9);}
  }
  /* black keys are drawn over whites so redraw them last */
  for(let k=k0;k<=k1;k++)if(isBlack(k)){const x=mkx(k);ctx.fillStyle=MAPN.has(k)?'#8fb4e0':'#101010';ctx.fillRect(x,0,z-1,(H-8)*.6);}
  Object.keys(S.map.hot).forEach(id=>{
    const age=now-S.map.hot[id];if(age>500)return;const zn=zoneById(id);if(!zn)return;
    ctx.fillStyle='rgba(255,255,255,'+(.5*(1-age/500)).toFixed(2)+')';
    ctx.fillRect(mkx(zn.lo),H-8,(zn.hi-zn.lo+1)*z,2);
  });
}
const MAPN=new Set();
function mapLoop(){
  if(!inMapView()){MG.run=false;return;}
  const now=performance.now();let hot=false;
  for(const id in S.map.hot){if(now-S.map.hot[id]<520)hot=true;else delete S.map.hot[id];}
  if(MG.dirty||hot) mapDraw();
  requestAnimationFrame(mapLoop);
}
let zoomInit=false;
function mapStart(){if(!zoomInit){zoomInit=true;S.map.zoom=clamp(($('#mapWrap').clientWidth||900)/128,3,40);$('#mapZoom').value=S.map.zoom;}mapSize();mapInvalidate();if(!MG.run){MG.run=true;requestAnimationFrame(mapLoop);}}
new ResizeObserver(()=>{if(inMapView())mapSize();}).observe($('#mapWrap'));
/* ---- hit testing ---- */
function hitAt(px,py){
  const z=S.map.zoom,vh=velH(),sel=new Set(S.map.sel);
  const near=(a,b,r)=>Math.abs(a-b)<=r;
  for(const zn of selZones()){
    if(!editable(zn)) continue;
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(x2-x1<=18) continue;
    const hs=[['kfLo',x1+zn.fadeLo*z+(zn.fadeLo?0:6),y1+7],['kfHi',x2-zn.fadeHi*z-(zn.fadeHi?0:6),y1+7],['vfLo',x1+6,y2-zn.vfadeLo*vh-(zn.vfadeLo?0:7)],['vfHi',x2-6,y1+zn.vfadeHi*vh+(zn.vfadeHi?0:7)]];
    for(const h of hs) if(near(px,h[1],7)&&near(py,h[2],7)) return{z:zn,part:h[0]};
  }
  const list=S.zones.slice().reverse().sort((a,b)=>(sel.has(b.id)?1:0)-(sel.has(a.id)?1:0));
  for(const zn of list){
    if(!editable(zn)) continue;
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(px<x1-3||px>x2+3||py<y1-3||py>y2+3) continue;
    const e=Math.min(5,Math.max(2,(x2-x1)/4)),ev=Math.min(5,Math.max(2,(y2-y1)/4));
    const l=px<=x1+e,r=px>=x2-e,t=py<=y1+ev,b=py>=y2-ev;
    if(sel.has(zn.id)&&near(px,mkx(zn.root)+z/2,6)&&py>=y2-12) return{z:zn,part:'root'};
    const part=(t?'t':b?'b':'')+(l?'l':r?'r':'');
    return{z:zn,part:part||'body'};
  }
  return null;
}
const CUR={body:'move',l:'ew-resize',r:'ew-resize',t:'ns-resize',b:'ns-resize',tl:'nwse-resize',br:'nwse-resize',tr:'nesw-resize',bl:'nesw-resize',root:'col-resize',kfLo:'ew-resize',kfHi:'ew-resize',vfLo:'ns-resize',vfHi:'ns-resize'};
function pt(e){const r=mapCv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
const keyAt=x=>clamp(Math.floor((x+S.map.sx)/S.map.zoom),0,127);
const velAt=y=>clamp(Math.floor((MG.H-y)/velH()),0,127);
mapCv.addEventListener('pointermove',e=>{
  if(MG.drag) return; const p=pt(e),h=hitAt(p.x,p.y);
  mapCv.style.cursor=h?CUR[h.part]:'crosshair';
  $('#mapInfo').textContent=noteName(keyAt(p.x))+'  ·  vel '+velAt(p.y)+(h?'  ·  '+(sampleById(h.z.sample)||{name:'?'}).name:'');
});
mapCv.addEventListener('pointerdown',e=>{
  if(e.button!==0) return; e.preventDefault(); mapCv.focus&&mapCv.focus();
  const p=pt(e),h=hitAt(p.x,p.y);
  if(!h){
    if(!e.shiftKey) S.map.sel=[];
    const base=S.map.sel.slice();
    MG.drag=true; const x0=p.x,y0=p.y;
    const mv=ev=>{const q=pt(ev);S.map.marq={x1:Math.min(x0,q.x),y1:Math.min(y0,q.y),x2:Math.max(x0,q.x),y2:Math.max(y0,q.y)};
      const m=S.map.marq,ids=S.zones.filter(zn=>editable(zn)&&mkx(zn.lo)<m.x2&&mkx(zn.hi+1)>m.x1&&vely(zn.vhi+1)<m.y2&&vely(zn.vlo)>m.y1).map(zn=>zn.id);
      S.map.sel=Array.from(new Set(base.concat(ids)));mapInvalidate();};
    drag(mv,()=>{S.map.marq=null;MG.drag=null;mapInvalidate();mapUI();});
    mapInvalidate();return;
  }
  const zn=h.z,had=S.map.sel.indexOf(zn.id)>=0;
  if(e.shiftKey&&h.part==='body'){S.map.sel=had?S.map.sel.filter(i=>i!==zn.id):S.map.sel.concat(zn.id);mapInvalidate();mapUI();return;}
  if(!had) S.map.sel=[zn.id];
  if((e.ctrlKey||e.altKey)&&h.part==='body'){S.map.sel=selZones().map(z0=>dupZone(z0).id);}
  S.map.group=zn.group;
  const zs=selZones(),orig=zs.map(z0=>({z:z0,lo:z0.lo,hi:z0.hi,vlo:z0.vlo,vhi:z0.vhi,root:z0.root,fl:z0.fadeLo,fh:z0.fadeHi,vl:z0.vfadeLo,vh:z0.vfadeHi}));
  const x0=p.x,y0=p.y,part=h.part,zk=S.map.zoom;
  MG.drag=true;
  const mv=ev=>{
    const q=pt(ev),dk=Math.round((q.x-x0)/zk),dv=Math.round(-(q.y-y0)/velH());
    if(part==='body'){
      const lo=Math.min.apply(null,orig.map(o=>o.lo)),hi=Math.max.apply(null,orig.map(o=>o.hi)),vlo=Math.min.apply(null,orig.map(o=>o.vlo)),vhi=Math.max.apply(null,orig.map(o=>o.vhi));
      const k=clamp(dk,-lo,127-hi),v=clamp(dv,-vlo,127-vhi);
      orig.forEach(o=>{o.z.lo=o.lo+k;o.z.hi=o.hi+k;o.z.vlo=o.vlo+v;o.z.vhi=o.vhi+v;});
    }else if(part==='root'){
      orig.forEach(o=>{o.z.root=clamp(o.root+dk,0,127);});
    }else if(part==='kfLo'){orig.forEach(o=>{o.z.fadeLo=clamp(o.fl+dk,0,o.hi-o.lo+1-o.z.fadeHi);});}
    else if(part==='kfHi'){orig.forEach(o=>{o.z.fadeHi=clamp(o.fh-dk,0,o.hi-o.lo+1-o.z.fadeLo);});}
    else if(part==='vfLo'){orig.forEach(o=>{o.z.vfadeLo=clamp(o.vl+dv,0,o.vhi-o.vlo+1-o.z.vfadeHi);});}
    else if(part==='vfHi'){orig.forEach(o=>{o.z.vfadeHi=clamp(o.vh-dv,0,o.vhi-o.vlo+1-o.z.vfadeLo);});}
    else{
      orig.forEach(o=>{
        if(part.indexOf('l')>=0) o.z.lo=clamp(o.lo+dk,0,o.hi);
        if(part.indexOf('r')>=0) o.z.hi=clamp(o.hi+dk,o.lo,127);
        if(part.indexOf('t')>=0) o.z.vhi=clamp(o.vhi+dv,o.vlo,127);
        if(part.indexOf('b')>=0) o.z.vlo=clamp(o.vlo+dv,0,o.vhi);
      });
    }
    touchMap();mapInvalidate();
    $('#mapInfo').textContent=orig.length>1?orig.length+' zones':noteName(zn.lo)+' – '+noteName(zn.hi)+'  ·  vel '+zn.vlo+'–'+zn.vhi;
  };
  drag(mv,()=>{MG.drag=null;mapInvalidate();mapUI();});
  mapInvalidate();mapUI();
});
mapCv.addEventListener('dblclick',e=>{
  const p=pt(e); if(hitAt(p.x,p.y)) return;
  const sm=sampleById(S.map.lastSample)||S.samples[S.samples.length-1];
  if(!sm){flash('Import or generate a sample first, then double-click to place it');return;}
  placeSample(sm.id,keyAt(p.x),velAt(p.y));
});
function placeSample(id,k,v){
  const sm=sampleById(id); if(!sm) return;
  const grp=S.map.group||S.groups[0]||'Group 1';
  if(S.groups.indexOf(grp)<0) S.groups.push(grp);
  const zn=addZoneFor(id,k,k,{group:grp});
  S.map.sel=[zn.id];S.map.lastSample=id;mapInvalidate();mapUI();
  return zn;
}
mapCv.addEventListener('wheel',e=>{
  e.preventDefault();
  if(e.ctrlKey||e.metaKey){setZoom(S.map.zoom*(e.deltaY<0?1.15:1/1.15),pt(e).x);return;}
  S.map.sx=clamp(S.map.sx+(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)?(e.deltaX||e.deltaY):e.deltaY),0,Math.max(0,128*S.map.zoom-MG.W));
  $('#mapScroll').value=S.map.sx;mapInvalidate();
},{passive:false});
$('#mapScroll').addEventListener('input',e=>{S.map.sx=+e.target.value;mapInvalidate();});
$('#mapZoom').addEventListener('input',e=>setZoom(+e.target.value));
/* drop samples (from the pool) or files (from the computer) on the grid */
mapCv.addEventListener('dragover',e=>{e.preventDefault();});
mapCv.addEventListener('drop',e=>{
  e.preventDefault(); const p=pt(e),sid=e.dataTransfer.getData('text/x-vsamp');
  if(sid){placeSample(sid,keyAt(p.x),velAt(p.y));return;}
  if(e.dataTransfer.files&&e.dataTransfer.files.length) importFiles(e.dataTransfer.files).then(ss=>{if(ss.length){autoMapSamples(ss);flash(ss.length+' sample'+(ss.length>1?'s':'')+' imported and mapped by note name');}});
});
/* piano: click plays, vertical position = velocity */
pianoCv.addEventListener('pointerdown',e=>{
  e.preventDefault(); let cur=-1;
  const play=ev=>{
    const r=pianoCv.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top,k=keyAt(x);
    if(k===cur) return; if(cur>=0){noteOff(cur);MAPN.delete(cur);}
    cur=k;MAPN.add(k);const vel=S.map.vel>0?S.map.vel:clamp(Math.round(30+y/(MG.pian.H-8)*97),1,127);
    noteOn(k,vel);mapInvalidate();$('#mapInfo').textContent=noteName(k)+'  ·  vel '+vel;
  };
  play(e);
  drag(play,()=>{if(cur>=0){noteOff(cur);MAPN.delete(cur);}cur=-1;mapInvalidate();});
});
function mapKey(e){
  const k=e.key,sel=selZones(),lk=k.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&lk==='d'){e.preventDefault();if(sel.length){S.map.sel=sel.map(z=>dupZone(z).id);mapInvalidate();mapUI();}return;}
  if((e.ctrlKey||e.metaKey)&&lk==='a'){e.preventDefault();S.map.sel=S.zones.filter(editable).map(z=>z.id);mapInvalidate();mapUI();return;}
  if(e.ctrlKey||e.metaKey) return;
  if(k==='Delete'||k==='Backspace'){if(sel.length){e.preventDefault();delZones(S.map.sel);mapInvalidate();mapUI();}return;}
  if(k==='Escape'){S.map.sel=[];mapInvalidate();mapUI();return;}
  if(k.indexOf('Arrow')===0&&sel.length){
    e.preventDefault();const dk=(k==='ArrowRight'?1:k==='ArrowLeft'?-1:0)*(e.shiftKey?12:1),dv=(k==='ArrowUp'?1:k==='ArrowDown'?-1:0)*(e.shiftKey?8:1);
    const lo=Math.min.apply(null,sel.map(z=>z.lo)),hi=Math.max.apply(null,sel.map(z=>z.hi)),vlo=Math.min.apply(null,sel.map(z=>z.vlo)),vhi=Math.max.apply(null,sel.map(z=>z.vhi));
    const a=clamp(dk,-lo,127-hi),b=clamp(dv,-vlo,127-vhi);
    sel.forEach(z=>{z.lo+=a;z.hi+=a;z.vlo+=b;z.vhi+=b;});touchMap();mapInvalidate();mapUI();return;
  }
  const m=KEYS[lk];
  if(m!==undefined&&!e.repeat){MAPN.add(m);noteOn(m,S.map.vel>0?S.map.vel:100);mapInvalidate();}
}
function mapKeyUp(m){MAPN.delete(m);mapInvalidate();}
