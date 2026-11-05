/* ---------- samples tab: waveform editor ---------- */
Object.assign(S,{smp:{sel:null,fpp:200,sx:0,a:null,b:null,tool:'select',dirty:true,play:null}});
const SM={W:600,H:260,run:false};
const smCv=$('#smCanvas');
const smSample=()=>sampleById(S.smp.sel);
const smBuf=()=>{const s=smSample();return s&&BUF.get(s.id);};
function smInvalidate(){S.smp.dirty=true;}
/* ---- which loop the waveform edits: the selected zones' loop (what plays) in the Sound tab, else the sample's default loop ---- */
function loopZones(){const s=smSample();if(!s||S.view!=='sound')return [];return selZones().filter(z=>z.sample===s.id);}
function loopView(){
  const s=smSample();if(!s)return null;const zs=loopZones();
  if(zs.length){const L=zs[0].loop;return{zone:true,zs,on:!!L.on,s:L.s,e:L.e||s.frames,xf:L.xf||0,pp:!!L.pp,curve:L.xcurve||'power'};}
  return s.loop?{zone:false,on:true,s:s.loop.s,e:s.loop.e,xf:s.loop.xf||0,pp:false,curve:'power'}:{zone:false,on:false,s:0,e:s.frames,xf:0,pp:false,curve:'power'};
}
function loopSet(p){
  const s=smSample();if(!s)return;const zs=loopZones();
  if(zs.length)zs.forEach(z=>{Object.assign(z.loop,p);});
  else{const cur=s.loop||{s:0,e:s.frames,xf:0};const n=Object.assign({},cur,p);if(p.on===false)s.loop=null;else{delete n.on;s.loop=n;}}
}
function smSize(){
  const wrap=$('#smWrap'),w=Math.max(200,wrap.clientWidth),h=Math.max(140,wrap.clientHeight),d=Math.min(2,dpr());
  SM.W=w;SM.H=h;smCv.width=Math.round(w*d);smCv.height=Math.round(h*d);smCv.style.width=w+'px';smCv.style.height=h+'px';
  smClampView();smInvalidate();
}
function smClampView(){
  const b=smBuf(); if(!b){S.smp.sx=0;return;}
  const n=b.ch[0].length;
  S.smp.fpp=clamp(S.smp.fpp,.05,Math.max(.05,n/SM.W*1.2));
  S.smp.sx=clamp(S.smp.sx,0,Math.max(0,n-SM.W*S.smp.fpp*.2));
  const sc=$('#smScroll');sc.max=n;sc.value=S.smp.sx;
}
function smFit(){const b=smBuf();if(!b)return;S.smp.fpp=b.ch[0].length/SM.W;S.smp.sx=0;smClampView();smInvalidate();}
const fx2x=f=>(f-S.smp.sx)/S.smp.fpp,x2f=x=>Math.round(S.smp.sx+x*S.smp.fpp);
function niceStep(sec){const p=Math.pow(10,Math.floor(Math.log10(sec))),m=sec/p;return(m<1.5?1:m<3.5?2:m<7.5?5:10)*p;}
function smDraw(){
  S.smp.dirty=false;
  const d=Math.min(2,dpr()),W=SM.W,H=SM.H,ctx=smCv.getContext('2d'),s=smSample(),b=smBuf();
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#303030';ctx.fillRect(0,0,W,H);
  if(!s||!b){ctx.fillStyle='#888';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('Pick a sample on the left, or import / generate some.',W/2,H/2);ctx.textAlign='left';return;}
  const n=b.ch[0].length,fpp=S.smp.fpp,sx=S.smp.sx,top=18,mid=top+(H-top)/2,half=(H-top)/2-4;
  /* ruler */
  const stepS=niceStep(60*fpp/b.sr);ctx.font='10px "JetBrains Mono",monospace';ctx.textBaseline='top';
  for(let t=Math.ceil(sx/b.sr/stepS)*stepS;t*b.sr<sx+W*fpp;t+=stepS){
    const x=fx2x(t*b.sr);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(x,top,1,H);ctx.fillStyle='#aaa';ctx.fillText(t.toFixed(stepS<1?2:1)+'s',x+3,3);
  }
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(0,mid,W,1);
  /* loop region (with a bar in the ruler to drag the whole loop) */
  const LV=loopView();
  if(LV&&LV.on){
    const x1=fx2x(LV.s),x2=fx2x(LV.e);
    ctx.fillStyle='rgba(90,160,255,.16)';ctx.fillRect(x1,top,x2-x1,H);
    ctx.fillStyle=S.smp.loopHot?'rgba(90,160,255,.75)':'rgba(90,160,255,.45)';ctx.fillRect(x1,0,x2-x1,top-2);
    if(LV.xf>0){ctx.fillStyle='rgba(240,194,74,.25)';ctx.fillRect(fx2x(LV.e-LV.xf),top,LV.xf/fpp,H);ctx.fillRect(fx2x(LV.s-LV.xf),top,LV.xf/fpp,H);}
  }
  /* selection */
  if(S.smp.a!=null){const a=Math.min(S.smp.a,S.smp.b),c=Math.max(S.smp.a,S.smp.b);ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(fx2x(a),top,Math.max(1,(c-a)/fpp),H);}
  /* waveform */
  const stride=Math.max(1,Math.floor(fpp/24));
  ctx.fillStyle='#9ab7d8';
  for(let x=0;x<W;x++){
    const a=Math.floor(sx+x*fpp),e=Math.min(n,Math.floor(sx+(x+1)*fpp)+1); if(a>=n) break; if(a<0) continue;
    let mn=1,mx=-1;
    for(let c=0;c<b.ch.length;c++){const dd=b.ch[c];for(let j=a;j<e;j+=stride){const v=dd[j];if(v<mn)mn=v;if(v>mx)mx=v;}}
    ctx.fillRect(x,mid-mx*half,1,Math.max(1,(mx-mn)*half));
  }
  /* loop edges, slices, playhead */
  const line=(f,col,lab)=>{const x=fx2x(f);if(x<-2||x>W+2)return;ctx.fillStyle=col;ctx.fillRect(Math.round(x)-1,top,2,H);if(lab){ctx.font='10px "JetBrains Mono",monospace';ctx.fillText(lab,x+3,H-14);}};
  if(LV&&LV.on){line(LV.s,'#5aa0ff','L');line(LV.e,'#5aa0ff','E');if(LV.xf>0)line(LV.e-LV.xf,'#f0c24a','X');}
  const sm=smOf(s);
  if(sm.mode==='slicer'||S.smp.tool==='slice') sm.slices.forEach((f,i)=>line(f,'#f08a3a',String(i+1)));
  if(sm.mode==='wavetable'){
    const fl=sm.wt.frame;ctx.fillStyle='rgba(255,255,255,.22)';
    for(let f=fl;f<n;f+=fl){const x=fx2x(f);if(x>0&&x<W&&fl/fpp>3)ctx.fillRect(Math.round(x),top,1,H);}
  }
  if(S.smp.play){const f=S.smp.play.from+(AU.ctx.currentTime-S.smp.play.t0)*b.sr;if(f<=S.smp.play.to)line(f,'#8ac76a');else S.smp.play=null;}
  if(LV&&LV.on&&S.view==='sound')loopSeam(ctx,b,LV,W,H);
  $('#smInfo').textContent=(S.smp.a!=null?'Selection '+(Math.abs(S.smp.b-S.smp.a)/b.sr).toFixed(3)+' s  ·  ':'')+(n/b.sr).toFixed(2)+' s · '+b.sr+' Hz · '+b.ch.length+' ch';
}
function smLoop(){
  if(!inSmpView()){SM.run=false;return;}
  if(S.smp.dirty||S.smp.play) smDraw();
  requestAnimationFrame(smLoop);
}
function smStart(){smSize();smInvalidate();if(!SM.run){SM.run=true;requestAnimationFrame(smLoop);}}
new ResizeObserver(()=>{if(inSmpView())smSize();}).observe($('#smWrap'));
/* snap a position to the nearest rising zero crossing */
function zeroSnap(b,f,range){
  const d=b.ch[0],n=d.length;f=clamp(f,1,n-3);
  for(let k=0;k<range;k++){for(const sgn of[1,-1]){const i=f+sgn*k;if(i>0&&i<n-2&&d[i]<=0&&d[i+1]>0)return i;}}
  return f;
}
/* ---- pointer ---- */
function smPt(e){const r=smCv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function smHit(x,y){
  const s=smSample(); if(!s) return null; const sm=smOf(s),near=f=>Math.abs(fx2x(f)-x)<=6;
  const LV=loopView();
  if(LV&&LV.on){
    if(near(LV.s))return{k:'ls'};if(near(LV.e))return{k:'le'};if(LV.xf>0&&near(LV.e-LV.xf))return{k:'xf'};
    if(y!=null&&y<16&&x>fx2x(LV.s)&&x<fx2x(LV.e))return{k:'lmove'};
  }
  if(sm.mode==='slicer'||S.smp.tool==='slice'){for(let i=0;i<sm.slices.length;i++)if(near(sm.slices[i]))return{k:'slice',i};}
  return null;
}
smCv.addEventListener('pointermove',e=>{
  const p=smPt(e);if(S.smp.drag)return;const h=smHit(p.x,p.y);smCv.style.cursor=h?(h.k==='lmove'?'grab':'ew-resize'):(S.smp.tool==='slice'?'copy':'text');
  const hot=!!h&&h.k==='lmove';if(hot!==!!S.smp.loopHot){S.smp.loopHot=hot;smInvalidate();}
});
smCv.addEventListener('pointerdown',e=>{
  const s=smSample(),b=smBuf(); if(!s||!b||e.button>1) return; e.preventDefault();
  const p=smPt(e),h=smHit(p.x,p.y),sm=smOf(s);
  if(h&&h.k==='slice'&&e.altKey){sm.slices.splice(h.i,1);touchMap();smInvalidate();smPanelRender();return;}
  if(h){
    S.smp.drag=true;const L0=loopView(),f0=x2f(p.x),n=b.ch[0].length;
    /* loop points land on rising zero crossings (hold Shift for free placement) */
    const zs=(f,ev)=>S.smp.loopSnap!==false&&!ev.shiftKey?zeroSnap(b,f,Math.max(32,Math.round(S.smp.fpp*8))):f;
    drag(ev=>{
      const f=clamp(x2f(smPt(ev).x),0,n);
      if(h.k==='ls')loopSet({s:clamp(zs(f,ev),0,L0.e-64)});
      else if(h.k==='le')loopSet({e:clamp(zs(f,ev),L0.s+64,n)});
      else if(h.k==='xf')loopSet({xf:clamp(L0.e-f,0,Math.min(L0.s,(L0.e-L0.s)>>1))});
      else if(h.k==='lmove'){const len=L0.e-L0.s,ns=clamp(zs(L0.s+(f-f0),ev),0,n-len);loopSet({s:ns,e:ns+len,xf:Math.min(L0.xf,ns,len>>1)});}
      else{sm.slices[h.i]=h.i===0?0:clamp(f,1,n-1);}
      smInvalidate();
    },()=>{S.smp.drag=null;if(h.k==='slice'){sm.slices.sort((a,c)=>a-c);}touchMap();smPanelRender();smInvalidate();loopUI();if(h.k!=='slice'&&loopZones().length)mapRightRender();});
    return;
  }
  if(S.smp.tool==='slice'){
    const f=zeroSnap(b,x2f(p.x),Math.round(b.sr*.004));
    sm.slices.push(f);sm.slices.sort((a,c)=>a-c);touchMap();smInvalidate();smPanelRender();return;
  }
  const f0=clamp(x2f(p.x),0,b.ch[0].length);S.smp.a=f0;S.smp.b=f0;S.smp.drag=true;
  drag(ev=>{S.smp.b=clamp(x2f(smPt(ev).x),0,b.ch[0].length);smInvalidate();},()=>{
    S.smp.drag=null;if(Math.abs(S.smp.b-S.smp.a)<3){S.smp.a=S.smp.b=null;}
    else{const lo=Math.min(S.smp.a,S.smp.b),hi=Math.max(S.smp.a,S.smp.b);S.smp.a=e.shiftKey?lo:zeroSnap(b,lo,300);S.smp.b=e.shiftKey?hi:zeroSnap(b,hi,300);}
    smInvalidate();
  });
});
smCv.addEventListener('dblclick',()=>{const b=smBuf();if(!b)return;S.smp.a=0;S.smp.b=b.ch[0].length;smInvalidate();});
smCv.addEventListener('wheel',e=>{
  const b=smBuf(); if(!b) return; e.preventDefault();
  if(e.ctrlKey||e.metaKey){
    const x=smPt(e).x,f=x2f(x),k=e.deltaY<0?.8:1.25;S.smp.fpp*=k;S.smp.sx=f-x*S.smp.fpp;
  }else S.smp.sx+=(e.deltaX||e.deltaY)*S.smp.fpp*.6;
  smClampView();smInvalidate();
},{passive:false});
$('#smScroll').addEventListener('input',e=>{S.smp.sx=+e.target.value;smInvalidate();});
/* ---- preview playback ---- */
const PV={held:new Map()};
function previewZone(s){
  return mkZone({id:'prev_'+s.id,sample:s.id,group:'__preview',lo:0,hi:127,root:s.root,tune:s.fine||0,
    loop:{on:!!s.loop,s:s.loop?s.loop.s:0,e:s.loop?s.loop.e:s.frames,xf:s.loop?s.loop.xf:0,xcurve:'power',pp:false},release:200});
}
function previewOn(note){
  const s=smSample(); if(!s||!ensureAudio()) return;
  if(PV.held.has(note)) return;
  const z=previewZone(s),vs=startVoice(z,note,100);
  PV.held.set(note,vs||[]);updVoices();
}
function previewOff(note){const vs=PV.held.get(note);if(!vs)return;PV.held.delete(note);vs.forEach(v=>stopVoice(v));}
function previewStopAll(){PV.held.forEach(vs=>vs.forEach(v=>stopVoice(v,40)));PV.held.clear();sampPanic();S.smp.play=null;smInvalidate();}
function playRaw(){
  const s=smSample(),b=smBuf(); if(!s||!ensureAudio()) return;
  const a=S.smp.a!=null?Math.min(S.smp.a,S.smp.b):0,c=S.smp.a!=null?Math.max(S.smp.a,S.smp.b):b.ch[0].length;
  const buf=AU.ctx.createBuffer(b.ch.length,c-a,b.sr);b.ch.forEach((d,i)=>buf.copyToChannel(d.subarray(a,c),i));
  const src=AU.ctx.createBufferSource();src.buffer=buf;const g=AU.ctx.createGain();g.gain.value=.9;src.connect(g);g.connect(AU.master);
  src.start();S.smp.play={from:a,to:c,t0:AU.ctx.currentTime};
}
function smKey(e){
  if(e.ctrlKey||e.metaKey){
    if(e.key.toLowerCase()==='z'){e.preventDefault();smUndo();}
    return;
  }
  if(e.key===' '){e.preventDefault();playRaw();return;}
  if(e.key==='Escape'){S.smp.a=S.smp.b=null;smInvalidate();return;}
  const m=KEYS[e.key.toLowerCase()];
  if(m!==undefined&&!e.repeat){MAPN.add(m);previewOn(m);}
}
function smKeyUp(m){previewOff(m);}
/* ---- editing (destructive with undo + revert) ---- */
function remapPos(f,cutA,cutB){return f<=cutA?f:f>=cutB?f-(cutB-cutA):cutA;}
function editSample(s,fn,posFn){
  const b=BUF.get(s.id); if(!b) return;
  if(!b.orig) b.orig=b.ch.map(d=>d.slice());
  b.undo=b.undo||[];b.undo.push({ch:b.ch.map(d=>d.slice()),loop:s.loop&&Object.assign({},s.loop),slices:smOf(s).slices.slice(),zl:S.zones.filter(z=>z.sample===s.id).map(z=>[z.id,z.loop.s,z.loop.e,z.loop.xf])});
  if(b.undo.length>8)b.undo.shift();
  const nch=fn(b.ch.map(d=>d.slice()));
  b.ch=nch;b.peaks=peaksOf(nch,600);s.frames=nch[0].length;s.dur=s.frames/b.sr;
  if(posFn){
    if(s.loop){s.loop.s=posFn(s.loop.s);s.loop.e=posFn(s.loop.e);}
    smOf(s).slices=smOf(s).slices.map(posFn).filter((f,i,a)=>i===0||f>a[i-1]);
    S.zones.forEach(z=>{if(z.sample===s.id){z.loop.s=posFn(z.loop.s);z.loop.e=posFn(z.loop.e);}});
  }
  if(s.loop&&(s.loop.e>s.frames||s.loop.e-s.loop.s<64)) s.loop=null;
  S.zones.forEach(z=>{if(z.sample===s.id){z.loop.e=Math.min(z.loop.e||s.frames,s.frames);if(z.loop.s>=z.loop.e)z.loop.on=false;}});
  S.smp.a=S.smp.b=null;touchMap();smClampView();smInvalidate();smPanelRender();mapInvalidate();
}
function smUndo(){
  const s=smSample(),b=smBuf(); if(!s||!b||!b.undo||!b.undo.length){flash('Nothing to undo');return;}
  const u=b.undo.pop();b.ch=u.ch;b.peaks=peaksOf(b.ch,600);s.frames=b.ch[0].length;s.dur=s.frames/b.sr;
  s.loop=u.loop||null;smOf(s).slices=u.slices;
  u.zl.forEach(a=>{const z=zoneById(a[0]);if(z){z.loop.s=a[1];z.loop.e=a[2];z.loop.xf=a[3];}});
  touchMap();smClampView();smInvalidate();smPanelRender();flash('Undone');
}
function smRange(b){const n=b.ch[0].length;return S.smp.a!=null?[Math.min(S.smp.a,S.smp.b),Math.max(S.smp.a,S.smp.b)]:[0,n];}
function smOp(op,arg){
  const s=smSample(),b=smBuf(); if(!s||!b){flash('Pick a sample first');return;}
  const [a,c]=smRange(b),n=b.ch[0].length;
  if(op==='normalize') editSample(s,ch=>{let pk=0;ch.forEach(d=>{for(let i=a;i<c;i++)pk=Math.max(pk,Math.abs(d[i]));});if(pk>0){const g=.97/pk;ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=g;});}return ch;});
  else if(op==='gain'){const g=Math.pow(10,(arg||0)/20);editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=g;});return ch;});}
  else if(op==='fadein') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=(i-a)/Math.max(1,c-a);});return ch;});
  else if(op==='fadeout') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=1-(i-a)/Math.max(1,c-a);});return ch;});
  else if(op==='reverse') editSample(s,ch=>{ch.forEach(d=>{const seg=d.slice(a,c).reverse();d.set(seg,a);});return ch;});
  else if(op==='silence') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]=0;});return ch;});
  else if(op==='dc') editSample(s,ch=>{ch.forEach(d=>{let m=0;for(let i=a;i<c;i++)m+=d[i];m/=Math.max(1,c-a);for(let i=a;i<c;i++)d[i]-=m;});return ch;});
  else if(op==='trim'){if(S.smp.a==null){flash('Select the part to keep');return;}editSample(s,ch=>ch.map(d=>d.slice(a,c)),f=>clamp(f-a,0,c-a));}
  else if(op==='cut'){if(S.smp.a==null){flash('Select the part to cut');return;}if(c-a>=n-8){flash('That would remove everything');return;}
    editSample(s,ch=>ch.map(d=>{const o=new Float32Array(d.length-(c-a));o.set(d.subarray(0,a));o.set(d.subarray(c),a);return o;}),f=>remapPos(f,a,c));}
  else if(op==='revert'){
    if(!b.orig){flash('Nothing to revert');return;}
    b.ch=b.orig.map(d=>d.slice());b.undo=[];b.peaks=peaksOf(b.ch,600);s.frames=b.ch[0].length;s.dur=s.frames/b.sr;s.loop=null;smOf(s).slices=[];
    S.zones.forEach(z=>{if(z.sample===s.id&&z.loop.e>s.frames){z.loop.e=s.frames;}});
    touchMap();smClampView();smInvalidate();smPanelRender();flash('Reverted to the imported audio');
  }
}
