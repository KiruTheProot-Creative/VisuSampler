/* ---------- visual loop editor (Sound tab) ----------
   The waveform edits the loop of the selected zones (the loop that plays), or the sample's default loop when no zone is picked.
   Drag L / E (they land on zero crossings), the yellow X for the crossfade, or the blue bar in the ruler to move the whole loop.
   The seam view shows the join exactly as it will play, crossfade included. */
const fadeC=(t,c)=>{t=clamp(t,0,1);return c==='linear'?t:c==='s'?t*t*(3-2*t):Math.sin(t*Math.PI/2);};
function seamData(b,L,N){
  const d=b.ch[0],n=d.length,out=new Float32Array(N*2),xf=Math.min(L.xf,L.s,(L.e-L.s)>>1);
  for(let k=0;k<N;k++){
    const i=L.e-N+k;let v=i>=0&&i<n?d[i]:0;
    if(xf>0&&i>=L.e-xf){const j=i-(L.e-xf),t=(j+.5)/xf,o=L.s-xf+j;v=v*fadeC(1-t,L.curve)+(o>=0&&o<n?d[o]:0)*fadeC(t,L.curve);}
    out[k]=v;
  }
  for(let k=0;k<N;k++){const i=L.pp?L.e-1-k:L.s+k;out[N+k]=i>=0&&i<n?d[i]:0;}
  return out;
}
function seamVerdict(v,N){
  let pk=1e-4;for(let i=0;i<v.length;i++)pk=Math.max(pk,Math.abs(v[i]));
  const jump=Math.abs(v[N]-v[N-1]),slopeA=v[N-1]-v[N-2],slopeB=v[N+1]-v[N],typ=(Math.abs(slopeA)+Math.abs(slopeB))/2+pk*.01;
  return jump<=typ*2.2?'smooth':jump<=typ*6?'small bump':'click';
}
function loopSeam(ctx,b,L,W,H){
  const bw=Math.min(280,W*.42),bh=Math.min(92,H*.42),y0=H-bh-8,N=Math.max(32,Math.round(b.sr*.005));
  /* sit in the bottom corner that hides no loop marker */
  const marks=[fx2x(L.s),fx2x(L.e),fx2x(L.e-L.xf)],free=x=>marks.every(m=>m<x-4||m>x+bw+4),x0=free(W-bw-8)||!free(8)?W-bw-8:8;
  const v=seamData(b,L,N),verdict=seamVerdict(v,N);
  let pk=1e-4;for(let i=0;i<v.length;i++)pk=Math.max(pk,Math.abs(v[i]));
  ctx.fillStyle='rgba(20,20,22,.88)';ctx.fillRect(x0,y0,bw,bh);ctx.strokeStyle='#555';ctx.strokeRect(x0+.5,y0+.5,bw-1,bh-1);
  const mid=y0+bh/2+6,amp=(bh-22)/2/pk;
  ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(x0,mid,bw,1);
  ctx.setLineDash([3,3]);ctx.strokeStyle='#5aa0ff';ctx.beginPath();ctx.moveTo(x0+bw/2,y0+14);ctx.lineTo(x0+bw/2,y0+bh);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#cfe0f4';ctx.lineWidth=1.3;ctx.beginPath();
  for(let i=0;i<v.length;i++){const x=x0+i/(v.length-1)*bw,y=mid-v[i]*amp;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
  ctx.stroke();ctx.lineWidth=1;
  ctx.font='10px "JetBrains Mono",monospace';ctx.textBaseline='top';ctx.fillStyle='#aaa';ctx.fillText('…E | L…  seam'+(L.pp?' (ping-pong)':''),x0+6,y0+3);
  ctx.fillStyle=verdict==='smooth'?'#7fd18b':verdict==='small bump'?'#f0c24a':'#ff8a6a';ctx.textAlign='right';ctx.fillText(verdict,x0+bw-6,y0+3);ctx.textAlign='left';
  S.smp.seam=verdict;
}
/* ---- loop bar above the waveform ---- */
(function(){const bar=document.createElement('span');bar.id='loopBar';bar.className='loopbar';$('#snWaveSlot').before(bar);})();
const LOOPH={note:null};
function loopUI(){
  const bar=$('#loopBar');if(!bar)return;const s=smSample();
  if(!s||S.view!=='sound'){bar.innerHTML='';return;}
  const L=loopView(),zs=loopZones(),who=zs.length?(zs.length===1?'zone':zs.length+' zones'):'sample default';
  bar.innerHTML='<span class="muted">Loop · '+who+'</span>'
    +'<button type="button" class="btn ghost" data-lp="on" aria-pressed="'+L.on+'">'+(L.on?'On':'Off')+'</button>'
    +(L.on?'<button type="button" class="btn ghost" data-lp="snap" aria-pressed="'+(S.smp.loopSnap!==false)+'" title="Loop points land on zero crossings (hold Shift to place freely)">Snap</button>'
      +'<button type="button" class="btn ghost" data-lp="fit" title="Zoom to the loop">Zoom</button>':'')
    +'<button type="button" class="btn ghost" data-lp="find" title="Look for a loop that joins smoothly">Find</button>'
    +(zs.length&&L.on?'<button type="button" class="btn ghost" data-lp="hear" aria-pressed="'+(LOOPH.note!=null)+'" title="Hold the zone\'s root note so you hear the loop">▶ Hear</button>':'');
}
$('#loopBar').addEventListener('click',e=>{
  const b=e.target.closest('[data-lp]');if(!b)return;const s=smSample(),bf=smBuf();if(!s||!bf)return;
  const a=b.dataset.lp,L=loopView(),zs=loopZones();
  if(a==='on'){
    if(L.on)loopSet({on:false});
    else{const ok=L.e-L.s>=64&&L.e<=s.frames;loopSet(ok?{on:true}:{on:true,s:Math.floor(s.frames*.3),e:Math.floor(s.frames*.9),xf:Math.min(Math.floor(bf.sr*.1),Math.floor(s.frames*.1))});}
    touchMap();
  }else if(a==='snap'){S.smp.loopSnap=S.smp.loopSnap===false;}
  else if(a==='fit'){const len=L.e-L.s;S.smp.fpp=Math.max(.05,len*1.4/SM.W);S.smp.sx=Math.max(0,L.s-len*.2);smClampView();}
  else if(a==='find'){
    if(zs.length){let n=0;zs.forEach(z=>{if(findLoop(z))n++;});flash(n?'Found a loop for '+n+' zone'+(n>1?'s':''):'No smooth loop found');}
    else{const z=mkZone({sample:s.id,loop:{on:false,s:0,e:s.frames,xf:0,xcurve:'power',pp:false}});if(findLoop(z)){s.loop={s:z.loop.s,e:z.loop.e,xf:z.loop.xf};flash('Found a loop');}else flash('No smooth loop found');}
    touchMap();
  }else if(a==='hear'){
    if(LOOPH.note!=null){noteOff(LOOPH.note);LOOPH.note=null;}
    else{ensureAudio();LOOPH.note=zs[0].root;noteOn(LOOPH.note,100);}
  }
  smInvalidate();loopUI();if(zs.length&&a!=='hear'&&a!=='snap'&&a!=='fit')mapRightRender();else if(!zs.length&&a!=='hear')smPanelRender();
});
const snShowLoop=snShow;
snShow=function(keepIns){snShowLoop(keepIns);loopUI();smInvalidate();};
