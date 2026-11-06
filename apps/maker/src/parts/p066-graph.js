/* ---------- Graph element: waveform, oscilloscope, spectrum, envelope or filter curve ----------
   Drawn on a canvas. Envelope and filter redraw when their knobs move; scope and spectrum run live from the output
   (the Maker reads its audio engine, the player gets the plugin's output from the host page as {t:'scope'} messages);
   waveform shows the sample of the patch that plays now (peaks come with the library as project.graphPeaks). */
const GRAPH={time:null,pull:null,spec:new Map(),raf:0};
const GRAPH_LIVE=k=>k==='scope'||k==='spectrum';
function graphCss(el){
  return 'border-radius:'+(el.radius||0)+'px;overflow:hidden;background:'+(el.bgOn===false?'transparent':el.bg)+';'
    +(el.border?'box-shadow:inset 0 0 0 1px '+el.borderColor+';':'');
}
function graphHTML(){return '<canvas class="gc" style="width:100%;height:100%;display:block"></canvas>';}
/* the tag value 0..1 of a linked knob, or null */
const gTag=id=>{const t=id&&tagById(id);return t?t.value:null;};
function graphCanvas(el){
  const n=nodes.get(el.id),cv=n&&n.querySelector('canvas.gc');if(!cv)return null;
  const k=Math.min(3,(window.devicePixelRatio||1)*(S.z||1)),W=Math.max(1,Math.round(el.w*k)),H=Math.max(1,Math.round(el.h*k));
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  const c=cv.getContext('2d');c.setTransform(k,0,0,k,0,0);c.clearRect(0,0,el.w,el.h);return c;
}
function graphGrid(c,el,xs,ys){
  if(!el.grid)return;c.strokeStyle=el.gridColor;c.lineWidth=1;c.beginPath();
  (xs||[.25,.5,.75]).forEach(x=>{const X=Math.round(x*el.w)+.5;c.moveTo(X,0);c.lineTo(X,el.h);});
  (ys||[.25,.5,.75]).forEach(y=>{const Y=Math.round(y*el.h)+.5;c.moveTo(0,Y);c.lineTo(el.w,Y);});c.stroke();
}
/* stroke a list of [x,y] points, with an optional fill down to `base` */
function graphPath(c,el,pts,base){
  if(!pts.length)return;
  if(el.fillOn&&base!=null){c.beginPath();c.moveTo(pts[0][0],base);pts.forEach(p=>c.lineTo(p[0],p[1]));c.lineTo(pts[pts.length-1][0],base);c.closePath();
    c.globalAlpha=el.fillAmt;c.fillStyle=el.fill;c.fill();c.globalAlpha=1;}
  c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));
  c.lineJoin='round';c.lineCap='round';c.lineWidth=el.lineW;c.strokeStyle=el.line;
  if(el.glow){c.shadowColor=el.line;c.shadowBlur=el.glow;}c.stroke();c.shadowBlur=0;
}
const PAD=el=>Math.max(1,el.lineW/2+1);
function drawEnv(c,el){
  const ms=t=>t*t*10000,g=el.env||{},v=(k,d)=>{const x=gTag(g[k]);return x==null?d:x;};
  const a=ms(v('a',.1)),d=ms(v('d',.3)),s=v('s',.7),r=ms(v('r',.3));
  const total=Math.max(1,a+d+r),hold=.22,usable=1-hold,p=PAD(el),w=el.w-2*p,h=el.h-2*p;
  /* each stage gets at least a little room so even a 0 ms attack is visible as a corner */
  const fa=.04+(usable-.12)*(a/total),fd=.04+(usable-.12)*(d/total),fr=.04+(usable-.12)*(r/total);
  const X=f=>p+f*w,Y=y=>p+(1-y)*h,pts=[[X(0),Y(0)]];
  const curve=(x0,y0,x1,y1,exp)=>{for(let i=1;i<=16;i++){const t=i/16,e=exp?1-Math.pow(1-t,2.2):t;pts.push([X(x0+(x1-x0)*t),Y(y0+(y1-y0)*e)]);}};
  curve(0,0,fa,1,false);curve(fa,1,fa+fd,s,true);pts.push([X(fa+fd+hold),Y(s)]);curve(fa+fd+hold,s,fa+fd+hold+fr,0,true);
  graphGrid(c,el,[fa,fa+fd,fa+fd+hold],[.5]);graphPath(c,el,pts,Y(0));
}
function drawFilter(c,el){
  const f=el.filt||{},ct=gTag(f.cut),rt=gTag(f.res);
  const fc=ct==null?(f.hz||2000):20*Math.pow(1000,ct),res=rt==null?(f.resv||0):rt,q=.5*Math.pow(40,res),type=f.type||'lp';
  const p=PAD(el),w=el.w-2*p,h=el.h-2*p,top=18,bot=-36,pts=[];
  for(let i=0;i<=160;i++){
    const fr=20*Math.pow(1000,i/160),x=fr/fc,re=1-x*x,im=x/q,den=re*re+im*im;
    let m=type==='hp'?(x*x*x*x)/den:type==='bp'?(im*im)/den:type==='notch'?(re*re)/den:1/den;
    if(type==='lp24')m=m*m;
    const db=Math.max(bot,Math.min(top,10*Math.log10(Math.max(1e-9,m))));
    pts.push([p+i/160*w,p+(top-db)/(top-bot)*h]);
  }
  graphGrid(c,el,[Math.log(100/20)/Math.log(1000),Math.log(1000/20)/Math.log(1000),Math.log(10000/20)/Math.log(1000)],[top/(top-bot)]);
  graphPath(c,el,pts,el.h);
}
/* the group that plays now on a layer: its patch, the first group of its list, or the first group */
function graphGroup(B){
  if(typeof curPatch==='function'&&patchModeOn()){const g=curPatch(B);if(g)return g;}
  const l=B?curListB():curList();if(l&&l.groups&&l.groups.length)return l.groups[0];
  return S.groups[0]||null;
}
function drawWave(c,el){
  const g=graphGroup(el.layer===1),pk=g&&((GRAPH.peaksOf&&GRAPH.peaksOf(g))||(S.graphPeaks&&S.graphPeaks[g]));
  const p=PAD(el),w=el.w-2*p,h=el.h-2*p,mid=p+h/2;graphGrid(c,el,[],[.5]);
  if(!pk||!pk.length){c.fillStyle=el.line;c.globalAlpha=.5;c.font='12px Figtree,sans-serif';c.textAlign='center';c.fillText(g?'no audio yet':'no patch',el.w/2,el.h/2+4);c.globalAlpha=1;return;}
  const n=pk.length/2,top=[],bot=[];
  for(let i=0;i<n;i++){const x=p+i/(n-1)*w;top.push([x,mid-pk[i*2+1]*h/2]);bot.push([x,mid-pk[i*2]*h/2]);}
  c.beginPath();top.forEach((q,i)=>i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));for(let i=bot.length-1;i>=0;i--)c.lineTo(bot[i][0],bot[i][1]);c.closePath();
  c.globalAlpha=el.fillOn?el.fillAmt:0;c.fillStyle=el.fill;c.fill();c.globalAlpha=1;
  c.lineWidth=el.lineW;c.strokeStyle=el.line;if(el.glow){c.shadowColor=el.line;c.shadowBlur=el.glow;}c.stroke();c.shadowBlur=0;
}
function drawScope(c,el){
  const d=GRAPH.time,p=PAD(el),w=el.w-2*p,h=el.h-2*p,mid=p+h/2;graphGrid(c,el,[],[.5]);
  if(!d||!d.length){graphPath(c,el,[[p,mid],[p+w,mid]],null);return;}
  const n=Math.min(d.length>>1,Math.max(64,Math.round(el.span||512)));let s=0;
  for(let i=1;i<d.length-n;i++)if(d[i-1]<0&&d[i]>=0){s=i;break;}   /* start on a rising zero crossing so the picture stands still */
  const gain=el.gain||1,pts=[];for(let i=0;i<n;i++)pts.push([p+i/(n-1)*w,mid-Math.max(-1,Math.min(1,d[s+i]*gain))*h/2]);
  graphPath(c,el,pts,el.fillOn?mid:null);
}
function fftMag(x){   /* magnitude spectrum of a power-of-two block (Hann window) */
  const n=x.length,re=new Float32Array(n),im=new Float32Array(n);
  for(let i=0;i<n;i++)re[i]=x[i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const u=i+k,v=u+len/2,tr=re[v]*cr-im[v]*ci,ti=re[v]*ci+im[v]*cr;
      re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}}
  const m=new Float32Array(n/2);for(let i=0;i<n/2;i++)m[i]=Math.hypot(re[i],im[i])*4/n;return m;
}
function drawSpectrum(c,el){
  const d=GRAPH.time,p=PAD(el),w=el.w-2*p,h=el.h-2*p,bins=Math.max(16,Math.min(256,Math.round(el.bars||96))),top=0,bot=-78;
  graphGrid(c,el,[Math.log(100/20)/Math.log(1000),Math.log(1000/20)/Math.log(1000),Math.log(10000/20)/Math.log(1000)],[.33,.66]);
  let prev=GRAPH.spec.get(el.id);if(!prev||prev.length!==bins){prev=new Float32Array(bins).fill(bot);GRAPH.spec.set(el.id,prev);}
  if(d&&d.length>=512){
    let N=1;while(N*2<=d.length&&N<4096)N*=2;const m=fftMag(d.subarray(d.length-N)),sr=GRAPH.sr||48000;
    for(let b=0;b<bins;b++){
      const f0=20*Math.pow(1000,b/bins),f1=20*Math.pow(1000,(b+1)/bins),i0=Math.max(1,Math.floor(f0/sr*N)),i1=Math.max(i0+1,Math.ceil(f1/sr*N));
      let mx=0;for(let i=i0;i<i1&&i<m.length;i++)if(m[i]>mx)mx=m[i];
      const db=Math.max(bot,20*Math.log10(mx+1e-9)),sm=el.smooth==null?.7:el.smooth;
      prev[b]=db>prev[b]?db:prev[b]*sm+db*(1-sm);
    }
  }else for(let b=0;b<bins;b++)prev[b]=prev[b]*.9+bot*.1;
  const y=v=>p+(top-Math.min(top,v))/(top-bot)*h;
  if(el.style==='bars'){
    const bw=w/bins;c.fillStyle=el.line;if(el.glow){c.shadowColor=el.line;c.shadowBlur=el.glow;}
    for(let b=0;b<bins;b++){const Y=y(prev[b]);c.fillRect(p+b*bw+.5,Y,Math.max(1,bw-1.5),p+h-Y);}c.shadowBlur=0;
  }else{const pts=[];for(let b=0;b<bins;b++)pts.push([p+(b+.5)/bins*w,y(prev[b])]);graphPath(c,el,pts,p+h);}
}
function drawGraph(el){
  const c=graphCanvas(el);if(!c)return;
  ({env:drawEnv,filter:drawFilter,wave:drawWave,scope:drawScope,spectrum:drawSpectrum}[el.kind]||drawEnv)(c,el);
}
/* live graphs: one animation loop while any is on show */
function graphLoop(){
  GRAPH.raf=0;const live=S.els.filter(e=>e.type==='graph'&&GRAPH_LIVE(e.kind)&&elShown(e));if(!live.length)return;
  if(GRAPH.pull){const d=GRAPH.pull();if(d)GRAPH.time=d;}
  live.forEach(drawGraph);GRAPH.raf=requestAnimationFrame(graphLoop);
}
function graphWake(){if(!GRAPH.raf&&S.els.some(e=>e.type==='graph'&&GRAPH_LIVE(e.kind)))GRAPH.raf=requestAnimationFrame(graphLoop);}
