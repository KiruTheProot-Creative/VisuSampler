/* ---------- FX audio: turns the FX graphs into real Web Audio ----------
   voices -> group input -> [group graph] -> master input -> [master graph] -> sampler bus -> output
   The graph is rebuilt when its structure changes; parameters (including modulation) are applied about 60 times a second. */
const FXA={ctx:null,gin:{},gout:{},min:null,sig:'',scopes:{},follow:{},buses:[],wl:null,wlReady:false,noise:null,timer:0,last:0};
const FXM={vel:0,key:60,gate:false,tOn:-1,tOff:-1,mod:0,expr:1,at:0,bend:.5,lvlOn:0};
/* ---- modulator outputs (used by modOut) ---- */
function lfoOut(g,n,t){
  const v=n.p,r=paramReal(g,n,FXT.lfo.params[0],t,false),hz=typeof r==='number'?1000/Math.max(1,r):r.v;
  const tt=v.retrig&&FXM.tOn>=0?t-FXM.tOn:t,ph=(tt*hz)%1,sh=Math.round(v.shape);
  const w=sh===1?1-Math.abs(ph*4-2):sh===2?ph*2-1:sh===3?(ph<.5?1:-1):sh===4?hash01(Math.floor(tt*hz)+n.id.length)*2-1:Math.sin(2*Math.PI*ph);
  return .5+.5*w*(v.depth/100);
}
function adsrOut(v,t){
  if(FXM.tOn<0) return 0;
  const a=v.a/1000,d=v.d/1000,s=v.s/100,r=v.r/1000;
  const level=x=>x<a?(a>0?x/a:1):x<a+d?1-(1-s)*((x-a)/Math.max(1e-4,d)):s;
  if(FXM.gate) return level(t-FXM.tOn);
  const rel=t-FXM.tOff; return rel>=r?0:FXM.lvlOn*(1-rel/Math.max(1e-4,r));
}
function midiSrcOut(src){
  const s=Math.round(src);
  if(s===5) return FXM.bend;                         /* pitch bend is bipolar */
  const v=s===0?FXM.vel/127:s===1?FXM.key/127:s===2?FXM.mod:s===3?FXM.expr:FXM.at;
  return .5+.5*v;
}
const RND={};
function randOut(n,t){
  const v=n.p,step=Math.floor(t*v.rate),st=RND[n.id]||(RND[n.id]={cur:.5,step:-1,target:.5});
  if(step!==st.step){st.step=step;st.target=hash01(step*7.31+n.id.length*13);}
  const k=v.smooth>0?Math.min(1,(1/60)/(v.smooth/100/v.rate+1e-3)):1; st.cur+=(st.target-st.cur)*k;
  return .5+(st.cur-.5)*(v.depth/100);
}
function fxNoteOn(note,vel){FXM.vel=vel;FXM.key=note;FXM.gate=true;FXM.tOn=fxClock();}
function fxNoteOff(){const t=fxClock();FXM.lvlOn=1;FXM.gate=false;FXM.tOff=t;
  /* remember the level at release so the envelope releases from where it was */
  const g=Object.values(S.fx.graphs).flatMap(x=>x.nodes).find(n=>n.type==='adsr');
  if(g){const p=g.p,x=t-FXM.tOn,a=p.a/1000,d=p.d/1000,s=p.s/100;FXM.lvlOn=x<a?(a>0?x/a:1):x<a+d?1-(1-s)*((x-a)/Math.max(1e-4,d)):s;}}
/* ---- helpers ---- */
const dbg=db=>Math.pow(10,db/20);
const logF=(pct,lo,hi)=>lo*Math.pow(hi/lo,clamp(pct/100,0,1));
function setP(param,v,tc){if(!param||!isFinite(v))return;const c=FXA.ctx;try{param.setTargetAtTime(v,c.currentTime,tc||.02);}catch(e){}}
function noiseBuf(c){
  if(FXA.noise&&FXA.noise.sampleRate===c.sampleRate) return FXA.noise;
  const b=c.createBuffer(2,c.sampleRate*2,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  return FXA.noise=b;
}
function crackleBuf(c){
  const b=c.createBuffer(2,c.sampleRate*3,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i++){if(Math.random()<.00035){const a=(Math.random()*2-1)*(.3+Math.random()*.7),L=2+Math.floor(Math.random()*30);for(let k=0;k<L&&i+k<d.length;k++)d[i+k]+=a*Math.exp(-k/4)*(k%2?-1:1);}}}
  return b;
}
function loopSrc(c,buf){const s=c.createBufferSource();s.buffer=buf;s.loop=true;s.start();return s;}
function osc(c,type,hz){const o=c.createOscillator();o.type=type||'sine';o.frequency.value=hz||1;o.start();return o;}
function gainN(c,v){const g=c.createGain();g.gain.value=v==null?1:v;return g;}
function biq(c,type,f,q,gain){const b=c.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;}
function chain(){for(let i=0;i<arguments.length-1;i++)arguments[i].connect(arguments[i+1]);return arguments[arguments.length-1];}
function shaperCurve(type,drive){
  const n=2048,c=new Float32Array(n),k=1+drive*30;
  for(let i=0;i<n;i++){
    const x=i/(n-1)*2-1;let y;
    if(type===0) y=Math.tanh(k*x+.2*k*x*x)/Math.tanh(k);                         /* tube: soft, slightly asymmetric */
    else if(type===1) y=Math.atan(k*x)/Math.atan(k);                              /* tape: smooth */
    else if(type===2) y=clamp(x*k,-1,1);                                          /* hard clip */
    else if(type===3){let z=x*(1+drive*6);while(Math.abs(z)>1)z=z>0?2-z:-2-z;y=z;} /* foldback */
    else if(type===4) y=Math.sign(x)*(1-Math.exp(-Math.abs(x)*k*2))*(x<0?.85:1);  /* fuzz: hard and gated-ish */
    else if(type===5){const z=clamp(x*k*.5,-1.5,1.5);y=z-z*z*z/6.75;}            /* soft clip */
    else if(type===6){const q=Math.max(2,32-drive*30);y=clamp(Math.round(x*k*.3*q)/q,-1,1);} /* bitcrush */
    else if(type===7){const z=Math.tanh(x*k*.5);y=.75*Math.abs(z)+.25*z;}        /* rectify */
    else if(type===8) y=Math.sin(x*(1+drive*8)*Math.PI/2);                        /* sine shaper */
    else y=x>=0?Math.tanh(x*k):Math.tanh(x*k*.25)*.6;                             /* diode */
    c[i]=y;
  }
  /* level compensation: drive adds grit, not a big volume jump */
  const m=n>>1,slope=Math.abs((c[m+1]-c[m-1])/(4/(n-1))),comp=1/Math.sqrt(Math.max(1,slope));
  for(let i=0;i<n;i++)c[i]*=comp;
  return c;
}
/* ---- reverb impulses ---- */
function makeIR(c,o){
  const sr=c.sampleRate,flav=o.flav||'hall',decay=Math.max(.1,o.decay||2),len=Math.min(sr*14,Math.floor(sr*(flav==='gated'?o.gate/1000+.05:decay*1.3)));
  const b=c.createBuffer(2,Math.max(256,len),sr),size=(o.size==null?60:o.size)/100;
  for(let ch=0;ch<2;ch++){
    const d=b.getChannelData(ch);let lp=0,hold=0;
    const damp=(o.damp==null?40:o.damp)/100,bright=flav==='plate'||flav==='digital'?.15:0;
    for(let i=0;i<d.length;i++){
      const t=i/sr;let env;
      if(flav==='gated') env=t<o.gate/1000?(.6+.4*Math.min(1,t*40)):Math.max(0,1-(t-o.gate/1000)*40);
      else env=Math.exp(-6.9*t/decay)*Math.min(1,t/(.002+.02*size));
      let x=Math.random()*2-1;
      if(flav==='digital'){if(i%Math.max(1,Math.round(1+(o.grit||50)/25))===0)hold=Math.round((Math.random()*2-1)*(8+(100-(o.grit||50))*.6))/(8+(100-(o.grit||50))*.6);x=hold;}
      const a=clamp(.15+damp*.8*Math.min(1,t/decay)-bright,.02,.98);lp=lp*a+x*(1-a);
      d[i]=(flav==='digital'?x*.5+lp*.5:lp)*env;
    }
    if(flav==='spring'){ /* boing: dispersive chirp echoes */
      const per=Math.floor(sr*(.028+ch*.003)),drip=(o.drip||50)/100;
      for(let e=0;e*per<d.length;e++){const amp=Math.exp(-6.9*e*per/sr/decay)*.8;for(let k=0;k<per&&e*per+k<d.length;k++){const tt=k/sr;d[e*per+k]+=amp*Math.sin(2*Math.PI*(400+drip*2200*Math.exp(-tt*120))*tt)*Math.exp(-tt*60);}}
    }
    if(flav==='room'||flav==='hall'||flav==='plate'){ /* a few early reflections */
      for(let r=0;r<8;r++){const p=Math.floor(sr*(.004+r*.006*(.5+size)+Math.random()*.003));if(p<d.length)d[p]+=(Math.random()<.5?-1:1)*.6*Math.exp(-r*.35);}
    }
  }
  return b;
}
/* ---- worklet for crushers (sample-and-hold + bits + companding) ---- */
const CRUSH_SRC=`class C extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'bits',defaultValue:12},{name:'rate',defaultValue:26040},{name:'comp',defaultValue:0},{name:'noise',defaultValue:0}]}
constructor(){super();this.ph=[0,0];this.h=[0,0];}
process(i,o,p){const inp=i[0],out=o[0];if(!inp||!inp.length)return true;const bits=p.bits[0],rate=p.rate[0],comp=p.comp[0]>.5,nz=p.noise[0],step=rate/sampleRate,q=Math.pow(2,Math.max(1,bits)-1),mu=255,lmu=Math.log(1+mu);
for(let c=0;c<out.length;c++){const x=inp[Math.min(c,inp.length-1)],y=out[c];for(let n=0;n<y.length;n++){this.ph[c]+=step;if(this.ph[c]>=1){this.ph[c]-=1;let v=x[n];if(comp){const s=v<0?-1:1;v=s*Math.log(1+mu*Math.min(1,Math.abs(v)))/lmu;v=Math.round(v*q)/q;v=s*(Math.pow(1+mu,Math.abs(v))-1)/mu;}else v=Math.round(v*q)/q;this.h[c]=v+(Math.random()*2-1)*nz;}y[n]=this.h[c];}}return true;}}
registerProcessor('vs-crush',C);`;
function loadWorklet(c){
  if(FXA.wl||!c.audioWorklet) return;
  FXA.wl=c.audioWorklet.addModule(URL.createObjectURL(new Blob([CRUSH_SRC],{type:'text/javascript'}))).then(()=>{FXA.wlReady=true;FXA.sig='';}).catch(()=>{FXA.wl=null;});
}
function crushNode(c){if(!FXA.wlReady)return null;try{return new AudioWorkletNode(c,'vs-crush',{outputChannelCount:[2]});}catch(e){return null;}}
/* ---- modules: each returns {in:{port:AudioNode}, wet:AudioNode | out:{port:AudioNode}, set(k,v), stop()} ---- */
const FXI={
  delay(c,n){
    const fb=n.p.pp>.5,dl=c.createDelay(5),lp=biq(c,'lowpass',8000,.5),fbG=gainN(c,.35),inp=gainN(c);
    if(!fb){chain(inp,dl,lp,fbG,dl);return{in:{in:inp},wet:lp,set(k,v){if(k==='time')setP(dl.delayTime,v/1000);if(k==='fb')setP(fbG.gain,Math.min(.95,v/100));if(k==='tone')setP(lp.frequency,logF(v,600,18000));}};}
    const dr=c.createDelay(5),lr=biq(c,'lowpass',8000,.5),fr=gainN(c,.35),sp=c.createChannelSplitter(2),mono=gainN(c,.5),mg=c.createChannelMerger(2);
    inp.connect(mono);chain(mono,dl,lp,fr,dr);chain(dr,lr,fbG,dl);lp.connect(mg,0,0);lr.connect(mg,0,1);
    return{in:{in:inp},wet:mg,set(k,v){if(k==='time'){setP(dl.delayTime,v/1000);setP(dr.delayTime,v/1000);}if(k==='fb'){setP(fbG.gain,Math.min(.95,v/100));setP(fr.gain,Math.min(.95,v/100));}if(k==='tone'){setP(lp.frequency,logF(v,600,18000));setP(lr.frequency,logF(v,600,18000));}}};
  },
  reverb(c,n){return verbNode(c,n,['room','hall','plate','room','hall','hall','hall'][Math.round(n.p.type)]||'hall');},
  digiverb(c,n){return verbNode(c,n,'digital');},
  gatedverb(c,n){return verbNode(c,n,'gated');},
  spring(c,n){return verbNode(c,n,'spring');},
  shimmer(c,n){
    const v=verbNode(c,n,'hall'),sh=c.createDelay(1),o1=osc(c,'sawtooth',3),og=gainN(c,.0),hp=biq(c,'highpass',900,.7),sg=gainN(c,0);
    /* octave-up by fast moving delay (cheap pitch shift), fed back into the reverb */
    o1.connect(og);og.connect(sh.delayTime);sh.delayTime.value=.05;chain(v.wet,hp,sh,sg,v.in.in);
    return{in:v.in,wet:v.wet,set(k,val){v.set(k,val);if(k==='shine'){setP(sg.gain,val/100*.35);setP(og.gain,-.0165);}},stop(){o1.stop();}};
  },
  conv(c,n){
    const inp=gainN(c),pre=c.createDelay(1),cv=c.createConvolver(),b=BUF.get(n.s&&n.s.ir);chain(inp,pre,cv);
    if(b){const len=Math.max(64,Math.round(b.ch[0].length*n.p.len/100)),ab=c.createBuffer(Math.min(2,b.ch.length),len,b.sr);for(let ch=0;ch<ab.numberOfChannels;ch++)ab.copyToChannel(b.ch[ch].subarray(0,len),ch);cv.buffer=ab;}
    return{in:{in:inp},wet:cv,set(k,v){if(k==='pre')setP(pre.delayTime,v/1000);}};
  },
  chorus(c,n){return modDelay(c,{base:.014,range:.007,fb:0,stereo:true});},
  flanger(c,n){return modDelay(c,{base:.0035,range:.003,fb:.5,stereo:true});},
  vibrato(c,n){return modDelay(c,{base:.006,range:.005,fb:0,stereo:false});},
  phaser(c,n){
    const inp=gainN(c),aps=[],o=osc(c,'sine',.4),og=gainN(c,300),fbG=gainN(c,.3),fd=c.createDelay(.01);let last=inp;
    for(let i=0;i<6;i++){const a=biq(c,'allpass',600+i*250,.6);og.connect(a.frequency);last.connect(a);last=a;aps.push(a);}
    o.connect(og);chain(last,fbG,fd,aps[0]);
    return{in:{in:inp},wet:last,set(k,v){if(k==='rate')setP(o.frequency,v);if(k==='depth')setP(og.gain,v*6);if(k==='fb')setP(fbG.gain,Math.min(.9,v/100));},stop(){o.stop();}};
  },
  trem(c,n){
    const inp=gainN(c),sh=['sine','triangle','square'][Math.round(n.p.shape)]||'sine',o=osc(c,sh,5),dg=gainN(c,.3);o.connect(dg);
    if(n.p.mode>.5){const p=c.createStereoPanner();inp.connect(p);dg.connect(p.pan);return{in:{in:inp},wet:p,set(k,v){if(k==='rate')setP(o.frequency,v>50?1000/v:v);if(k==='depth')setP(dg.gain,v/100);},stop(){o.stop();}};}
    const g=gainN(c,.7);inp.connect(g);dg.connect(g.gain);
    return{in:{in:inp},wet:g,set(k,v){if(k==='rate')setP(o.frequency,v>50?1000/v:v);if(k==='depth'){setP(dg.gain,v/200);setP(g.gain,1-v/200);}},stop(){o.stop();}};
  },
  rotary(c,n){
    const inp=gainN(c),sat=c.createWaveShaper(),lo=biq(c,'lowpass',800,.7),hi=biq(c,'highpass',800,.7),oh=osc(c,'sine',.8),ol=osc(c,'sine',.7);
    const dh=c.createDelay(.02),dlo=c.createDelay(.02),gh=gainN(c,.0008),gl=gainN(c,.0006),ph=c.createStereoPanner(),pl=c.createStereoPanner(),ah=gainN(c,.8),al=gainN(c,.9),ahm=gainN(c,.2),alm=gainN(c,.1),out=gainN(c);
    sat.curve=shaperCurve(0,.2);sat.oversample='2x';dh.delayTime.value=.004;dlo.delayTime.value=.004;
    chain(inp,sat);sat.connect(lo);sat.connect(hi);chain(hi,dh,ah,ph,out);chain(lo,dlo,al,pl,out);
    out.gain.value=.6;oh.connect(gh);gh.connect(dh.delayTime);ol.connect(gl);gl.connect(dlo.delayTime);oh.connect(ph.pan);ol.connect(pl.pan);oh.connect(ahm);ahm.connect(ah.gain);ol.connect(alm);alm.connect(al.gain);
    return{in:{in:inp},wet:out,set(k,v){if(k==='speed'){const f=v>.5;oh.frequency.setTargetAtTime(f?6.7:.8,c.currentTime,f?.6:1.4);ol.frequency.setTargetAtTime(f?5.9:.7,c.currentTime,f?1.6:2.6);}if(k==='drive'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(0,v/100);}},stop(){oh.stop();ol.stop();}};
  },
  filter(c,n){
    const inp=gainN(c),T=['lowpass','highpass','bandpass','notch','peaking'],a=biq(c,'lowpass',8000,1),fs=[a];let last=chain(inp,a);
    if(n.p.slope>.5){const b=biq(c,'lowpass',8000,.7);last=chain(a,b);fs.push(b);}
    return{in:{in:inp},wet:last,set(k,v){
      if(k==='type'){const t=T[Math.round(v)]||'lowpass';fs.forEach(f=>{if(f.type!==t)f.type=t;});}
      if(k==='cutoff')fs.forEach(f=>setP(f.frequency,v));if(k==='res')fs.forEach((f,i)=>setP(f.Q,i?.7:.5+v/100*18));if(k==='gain')fs.forEach(f=>setP(f.gain,v));}};
  },
  eq(c,n){const inp=gainN(c),l=biq(c,'lowshelf',250),m=biq(c,'peaking',1000,.8),h=biq(c,'highshelf',4000);chain(inp,l,m,h);
    return{in:{in:inp},wet:h,set(k,v){if(k==='low')setP(l.gain,v);if(k==='mid')setP(m.gain,v);if(k==='high')setP(h.gain,v);}};},
  peq(c,n){const inp=gainN(c),l=biq(c,'lowshelf',100),a=biq(c,'peaking',500,1),b=biq(c,'peaking',2500,1),h=biq(c,'highshelf',8000);chain(inp,l,a,b,h);
    const M={lf:l.frequency,lg:l.gain,m1f:a.frequency,m1g:a.gain,m1q:a.Q,m2f:b.frequency,m2g:b.gain,m2q:b.Q,hf:h.frequency,hg:h.gain};
    return{in:{in:inp},wet:h,set(k,v){if(M[k])setP(M[k],v);}};},
  dist(c,n){return shaperNode(c,n,Math.round(n.p.type),'drive');},
  pod(c,n){const s=shaperNode(c,n,0,'drive'),hump=biq(c,'peaking',720,1.2,7);s.pre(hump);return s;},
  pfuzz(c,n){return shaperNode(c,n,4,'fuzz');},
  crush(c,n){
    const inp=gainN(c),w=crushNode(c);if(!w){return{in:{in:inp},wet:inp,set(){}};}
    inp.connect(w);const P=w.parameters;
    return{in:{in:inp},wet:w,set(k,v){if(k==='bits')setP(P.get('bits'),v,.005);if(k==='rate')setP(P.get('rate'),v,.005);if(k==='comp')P.get('comp').value=v;}};
  },
  vintage(c,n){
    const inp=gainN(c),pre=c.createWaveShaper(),w=crushNode(c),lp=biq(c,'lowpass',12000,.6),hiss=gainN(c,0);
    pre.curve=shaperCurve(1,.1);inp.connect(pre);if(w){pre.connect(w);w.connect(lp);}else pre.connect(lp);
    const ns=loopSrc(c,noiseBuf(c));chain(ns,biq(c,'highpass',3000),hiss,lp);
    const MODELS=[[8,27778,1,7000],[12,26040,0,11000],[12,39062,0,15000]];
    const apply=()=>{const m=Math.round(n.p.model),M=MODELS[m]||[n.p.bits,n.p.rate,0,Math.min(18000,n.p.rate*.45)];
      if(w){setP(w.parameters.get('bits'),M[0],.005);setP(w.parameters.get('rate'),M[1],.005);w.parameters.get('comp').value=M[2];}
      setP(lp.frequency,M[3]*(1-n.p.age/250));setP(hiss.gain,(m===0?.004:.0015)*(.3+n.p.age/100));};
    return{in:{in:inp},wet:lp,set(k,v){if(k==='drive'&&Math.abs((pre._d||0)-v)>2){pre._d=v;pre.curve=shaperCurve(1,.05+v/100*.6);}apply();},stop(){ns.stop();}};
  },
  comp(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),mk=gainN(c);chain(inp,cp,mk);
    return{in:{in:inp},wet:mk,set(k,v){if(k==='thresh')setP(cp.threshold,v);if(k==='ratio')setP(cp.ratio,v);if(k==='attack')setP(cp.attack,v/1000);if(k==='release')setP(cp.release,v/1000);if(k==='makeup')setP(mk.gain,dbg(v));}};},
  pcomp(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),mk=gainN(c);cp.attack.value=.003;cp.release.value=.25;cp.knee.value=6;chain(inp,cp,mk);
    return{in:{in:inp},wet:mk,set(k,v){if(k==='sustain'){setP(cp.threshold,-10-v*.4);setP(cp.ratio,2+v/10);}if(k==='level')setP(mk.gain,dbg(v)*(1+n.p.sustain/60));}};},
  limiter(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),out=gainN(c);cp.ratio.value=20;cp.knee.value=0;cp.attack.value=.001;chain(inp,cp,out);
    return{in:{in:inp},wet:out,set(k,v){if(k==='ceiling'){setP(cp.threshold,v-1);setP(out.gain,1);}if(k==='release')setP(cp.release,v/1000);}};},
  transient(c,n){
    /* fast and slow followers: (fast - slow) boosts attacks, slow alone shapes sustain */
    const inp=gainN(c),vca=gainN(c,1),abs=c.createWaveShaper();const cu=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/1023*2-1;cu[i]=Math.abs(x);}abs.curve=cu;
    const fast=biq(c,'lowpass',60,.5),slow=biq(c,'lowpass',6,.5),inv=gainN(c,-1),ga=gainN(c,0),gs=gainN(c,0);
    inp.connect(vca);inp.connect(abs);abs.connect(fast);abs.connect(slow);fast.connect(ga);slow.connect(inv);inv.connect(ga);slow.connect(gs);ga.connect(vca.gain);gs.connect(vca.gain);
    return{in:{in:inp},wet:vca,set(k,v){if(k==='attack')setP(ga.gain,v/100*6);if(k==='sustain')setP(gs.gain,v/100*2);}};
  },
  morph(c,n){
    const inp=gainN(c),out=gainN(c,1.4),VW=[[730,1090,2440],[530,1840,2480],[270,2290,3010],[570,840,2410],[300,870,2240]],bs=[0,1,2].map(i=>{const b=biq(c,'bandpass',VW[0][i],8);inp.connect(b);const g=gainN(c,[1,.7,.4][i]);b.connect(g);g.connect(out);return b;});
    const apply=()=>{const m=clamp(n.p.morph/100,0,1)*4,i=Math.min(3,Math.floor(m)),f=m-i,sh=Math.pow(2,n.p.shift/12);
      bs.forEach((b,j)=>{setP(b.frequency,(VW[i][j]*(1-f)+VW[i+1][j]*f)*sh,.01);setP(b.Q,2+n.p.res/100*16,.03);});};
    return{in:{in:inp},wet:out,set(){apply();}};
  },
  tapeecho(c,n){
    const inp=gainN(c),dl=c.createDelay(5),sat=c.createWaveShaper(),lp=biq(c,'lowpass',4000,.6),hp=biq(c,'highpass',120,.6),fbG=gainN(c,.45),o=osc(c,'sine',.55),o2=osc(c,'sine',6.3),og=gainN(c,0),og2=gainN(c,0);
    sat.curve=shaperCurve(1,.3);chain(inp,dl,sat,lp,hp,fbG,dl);o.connect(og);og.connect(dl.delayTime);o2.connect(og2);og2.connect(dl.delayTime);
    return{in:{in:inp},wet:hp,set(k,v){if(k==='time')setP(dl.delayTime,v/1000,.12);if(k==='fb')setP(fbG.gain,Math.min(1.08,v/100));if(k==='tone')setP(lp.frequency,logF(v,900,9000));
      if(k==='wobble'){setP(og.gain,v/100*.0035);setP(og2.gain,v/100*.0004);}if(k==='sat'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(1,.05+v/100*.7);}},stop(){o.stop();o2.stop();}};
  },
  bbd(c,n){
    const m=modDelay(c,{base:.009,range:.004,fb:0,stereo:true,shape:'triangle'}),lp=biq(c,'lowpass',7000,.5),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    m.wet.connect(lp);chain(ns,biq(c,'highpass',4000),hiss,lp);
    return{in:m.in,wet:lp,set(k,v){if(k==='mode'){const md=Math.round(v);m.set('rate',md===0?.5:md===1?.83:8);m.set('depth',md===2?10:md===1?70:50);}if(k==='noise')setP(hiss.gain,v/100*.006);},stop(){m.stop();ns.stop();}};
  },
  ensemble(c,n){
    const inp=gainN(c),out=c.createChannelMerger(2),os=[],gs=[];
    for(let i=0;i<3;i++){const d=c.createDelay(.05);d.delayTime.value=.01;const o=osc(c,'sine',.6+i*.07),g=gainN(c,.003),v=osc(c,'sine',6+i*.4),vg=gainN(c,.0004);
      o.connect(g);g.connect(d.delayTime);v.connect(vg);vg.connect(d.delayTime);inp.connect(d);d.connect(out,0,i%2);if(i===2)d.connect(out,0,1);os.push(o,v);gs.push(g);}
    return{in:{in:inp},wet:out,set(k,v){if(k==='depth')gs.forEach(g=>setP(g.gain,.0005+v/100*.005));},stop(){os.forEach(o=>o.stop());}};
  },
  tapemach(c,n){
    const inp=gainN(c),sat=c.createWaveShaper(),bump=biq(c,'lowshelf',90,null,3),lp=biq(c,'lowpass',16000,.6),d=c.createDelay(.05),o=osc(c,'sine',.5),og=gainN(c,0),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;sat.curve=shaperCurve(1,.2);chain(inp,sat,bump,d,lp);o.connect(og);og.connect(d.delayTime);chain(ns,biq(c,'highpass',2500),hiss,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='sat'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(1,.02+v/100*.6);}if(k==='bump')setP(bump.gain,v);if(k==='hiss')setP(hiss.gain,v/100*.008);
      if(k==='wow')setP(og.gain,v/100*.0025);if(k==='age')setP(lp.frequency,logF(100-v,3500,18000));},stop(){o.stop();ns.stop();}};
  },
  lofi(c,n){
    const inp=gainN(c),lp=biq(c,'lowpass',8000,.6),d=c.createDelay(.05),o=osc(c,'sine',.7),o2=osc(c,'sine',7),og=gainN(c,0),og2=gainN(c,0),cr=gainN(c,0),hiss=gainN(c,0),cs=loopSrc(c,crackleBuf(c)),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;chain(inp,d,lp);o.connect(og);og.connect(d.delayTime);o2.connect(og2);og2.connect(d.delayTime);chain(cs,cr,lp);chain(ns,biq(c,'bandpass',3000,.5),hiss,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='crackle')setP(cr.gain,v/100*.6);if(k==='wow'){setP(og.gain,v/100*.003);setP(og2.gain,v/100*.0003);}if(k==='noise')setP(hiss.gain,v/100*.02);if(k==='tone')setP(lp.frequency,logF(v,1200,16000));},stop(){o.stop();o2.stop();cs.stop();ns.stop();}};
  },
  vinyl(c,n){
    const inp=gainN(c),lp=biq(c,'lowpass',14000,.6),d=c.createDelay(.05),o=osc(c,'sine',.55),og=gainN(c,0),cr=gainN(c,0),rum=gainN(c,0),cs=loopSrc(c,crackleBuf(c)),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;chain(inp,d,lp);o.connect(og);og.connect(d.delayTime);chain(cs,cr,lp);chain(ns,biq(c,'lowpass',60,.7),rum,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='crackle')setP(cr.gain,v/100*.7);if(k==='rumble')setP(rum.gain,v/100*.3);if(k==='wear')setP(lp.frequency,logF(100-v,2500,18000));if(k==='wow')setP(og.gain,v/100*.002);},stop(){o.stop();cs.stop();ns.stop();}};
  },
  radio(c,n){
    const inp=gainN(c),hp=biq(c,'highpass',300,.7),lp=biq(c,'lowpass',3400,.7),sat=c.createWaveShaper(),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    sat.curve=shaperCurve(2,.2);chain(inp,hp,sat,lp);chain(ns,hiss,lp);
    const B=[[200,4500],[300,3400],[500,2600]];
    return{in:{in:inp},wet:lp,set(k,v){if(k==='band'){const b=B[Math.round(v)]||B[0];setP(hp.frequency,b[0]);setP(lp.frequency,b[1]);}if(k==='crunch'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(2,.02+v/100*.5);}if(k==='noise')setP(hiss.gain,v/100*.03);},stop(){ns.stop();}};
  },
  pwah(c,n){
    const inp=gainN(c),bp=biq(c,'bandpass',800,7),out=gainN(c,2);chain(inp,bp,out);const an=c.createAnalyser();an.fftSize=512;inp.connect(an);const buf=new Float32Array(512);let env=0;
    return{in:{in:inp},wet:out,set(k,v){
      if(k==='q')setP(bp.Q,v);
      if(k==='pos'||k==='mode'){let p=n.p.pos/100;if(n.p.mode>.5){an.getFloatTimeDomainData(buf);let s=0;for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i];env=env*.7+Math.min(1,Math.sqrt(s/buf.length)*6)*.3;p=env;}
        setP(bp.frequency,logF(p*100,350,2400),.015);}}};
  },
  pvibe(c,n){
    const inp=gainN(c),o=osc(c,'sine',2),aps=[],gs=[];let last=inp;
    [180,520,1100,2600].forEach((f,i)=>{const a=biq(c,'allpass',f,.5),g=gainN(c,f*.6);o.connect(g);g.connect(a.frequency);last.connect(a);last=a;aps.push(a);gs.push(g);});
    const amp=gainN(c,1),ag=gainN(c,.15);o.connect(ag);ag.connect(amp.gain);last.connect(amp);
    return{in:{in:inp},wet:amp,set(k,v){if(k==='speed')setP(o.frequency,v);if(k==='intensity')gs.forEach((g,i)=>setP(g.gain,[180,520,1100,2600][i]*.8*v/100));},stop(){o.stop();}};
  },
  /* ---- routing (raw: they expose their own outputs) ---- */
  mixer(c,n){const out=gainN(c),g=[1,2,3,4].map(()=>{const x=gainN(c);x.connect(out);return x;});
    return{in:{in1:g[0],in2:g[1],in3:g[2],in4:g[3]},out:{out},set(k,v){const i=['l1','l2','l3','l4'].indexOf(k);if(i>=0)setP(g[i].gain,v<=-59?0:dbg(v));}};},
  util(c,n){
    const inp=gainN(c),sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),mid=gainN(c,.5),side=gainN(c,.5),sideW=gainN(c,1),inv=gainN(c,-1),l=gainN(c),r=gainN(c),pan=c.createStereoPanner(),out=gainN(c);
    inp.connect(sp);sp.connect(mid,0);sp.connect(mid,1);sp.connect(side,0);sp.connect(inv,1);inv.connect(side);side.connect(sideW);
    mid.connect(l);mid.connect(r);sideW.connect(l);const ni=gainN(c,-1);sideW.connect(ni);ni.connect(r);l.connect(mg,0,0);r.connect(mg,0,1);chain(mg,pan,out);
    return{in:{in:inp},out:{out},set(k,v){if(k==='gain')setP(out.gain,v<=-59?0:dbg(v));if(k==='pan')setP(pan.pan,v/100);if(k==='width')setP(sideW.gain,v/100);}};
  },
  xover(c,n){
    const inp=gainN(c),l1=biq(c,'lowpass',250,.707),l2=biq(c,'lowpass',250,.707),h1=biq(c,'highpass',250,.707),h2=biq(c,'highpass',250,.707),m1=biq(c,'lowpass',3000,.707),m2=biq(c,'lowpass',3000,.707),hh1=biq(c,'highpass',3000,.707),hh2=biq(c,'highpass',3000,.707);
    chain(inp,l1,l2);chain(inp,h1,h2);chain(h2,m1,m2);chain(h2,hh1,hh2);
    return{in:{in:inp},out:{low:l2,mid:m2,high:hh2},set(k,v){if(k==='f1')[l1,l2,h1,h2].forEach(f=>setP(f.frequency,v));if(k==='f2')[m1,m2,hh1,hh2].forEach(f=>setP(f.frequency,v));}};
  },
  mssplit(c,n){const inp=gainN(c),sp=c.createChannelSplitter(2),mid=gainN(c,.5),side=gainN(c,.5),inv=gainN(c,-1);inp.connect(sp);sp.connect(mid,0);sp.connect(mid,1);sp.connect(side,0);sp.connect(inv,1);inv.connect(side);
    return{in:{in:inp},out:{mid,side},set(){}};},
  msjoin(c,n){const m=gainN(c),s=gainN(c),mg=c.createChannelMerger(2),l=gainN(c),r=gainN(c),ni=gainN(c,-1);m.connect(l);m.connect(r);s.connect(l);s.connect(ni);ni.connect(r);l.connect(mg,0,0);r.connect(mg,0,1);
    return{in:{mid:m,side:s},out:{out:mg},set(){}};},
  send(c,n){const inp=gainN(c),lv=gainN(c,.5),bus=fxBus(c,Math.round(n.p.bus));inp.connect(lv);lv.connect(bus);return{in:{in:inp},out:{out:inp},set(k,v){if(k==='level')setP(lv.gain,v<=-59?0:dbg(v));},stop(){try{lv.disconnect();}catch(e){}}};},
  ret(c,n){const out=gainN(c),bus=fxBus(c,Math.round(n.p.bus));bus.connect(out);return{in:{},out:{out},set(k,v){if(k==='level')setP(out.gain,v<=-59?0:dbg(v));},stop(){try{bus.disconnect(out);}catch(e){}}};},
  pvol(c,n){const inp=gainN(c);return{in:{in:inp},out:{out:inp},set(k,v){if(k==='pos')setP(inp.gain,Math.pow(v/100,2),.01);}};},
  /* ---- the follower listens to audio ---- */
  env(c,n){const an=c.createAnalyser();an.fftSize=1024;return{in:{in:an},analyser:an,set(){}};}
};
function shaperNode(c,n,type,driveKey){
  const inp=gainN(c),pre=gainN(c),sh=c.createWaveShaper(),tone=biq(c,'lowpass',6000,.6),lvl=gainN(c);let head=null;
  sh.oversample='4x';sh.curve=shaperCurve(type,.3);chain(inp,pre,sh,tone,lvl);
  return{in:{in:inp},wet:lvl,pre(node){inp.disconnect();chain(inp,node,pre);head=node;},set(k,v){
    if(k===driveKey&&Math.abs((sh._d==null?-9:sh._d)-v)>1.5){sh._d=v;sh.curve=shaperCurve(type,v/100);}
    if(k==='tone')setP(tone.frequency,logF(v,800,16000));if(k==='level')setP(lvl.gain,dbg(v));}};
}
function modDelay(c,o){
  const inp=gainN(c),dl=c.createDelay(.1),dr=c.createDelay(.1),mg=c.createChannelMerger(2),ob=osc(c,o.shape||'sine',.8),gL=gainN(c,o.range*.5),gR=gainN(c,-o.range*.5),fL=gainN(c,o.fb),fR=gainN(c,o.fb);
  dl.delayTime.value=o.base;dr.delayTime.value=o.base;ob.connect(gL);gL.connect(dl.delayTime);
  inp.connect(dl);dl.connect(mg,0,0);dl.connect(fL);fL.connect(dl);
  if(o.stereo){ob.connect(gR);gR.connect(dr.delayTime);inp.connect(dr);dr.connect(mg,0,1);dr.connect(fR);fR.connect(dr);}else dl.connect(mg,0,1);
  return{in:{in:inp},wet:mg,set(k,v){if(k==='rate')setP(ob.frequency,v);if(k==='depth'){setP(gL.gain,o.range*v/100);setP(gR.gain,-o.range*v/100);}if(k==='fb'){setP(fL.gain,clamp(v/100,-.95,.95));setP(fR.gain,clamp(v/100,-.95,.95));}},stop(){ob.stop();}};
}
function verbNode(c,n,flav){
  const inp=gainN(c),pre=c.createDelay(1),cv=c.createConvolver(),out=gainN(c,1);chain(inp,pre,cv,out);let key='';
  const regen=()=>{const p=n.p,k=[flav,p.type,p.size,p.decay,p.damp,p.grit,p.gate,p.drip].map(x=>x==null?'':Math.round(x*10)).join('|');if(k===key)return;key=k;
    cv.buffer=makeIR(c,{flav,size:p.size,decay:p.decay,damp:p.damp,grit:p.grit,gate:p.gate,drip:p.drip});};
  regen();
  return{in:{in:inp},wet:out,set(k,v){if(k==='pre')setP(pre.delayTime,v/1000);if(FXT[n.type].params.some(q=>q.k===k&&q.ir)){clearTimeout(out._t);out._t=setTimeout(regen,180);}}};
}
function fxBus(c,i){
  if(FXA.buses.length&&FXA.buses[0].context!==c) FXA.buses=[];
  while(FXA.buses.length<=i) FXA.buses.push(gainN(c));
  return FXA.buses[i];
}
/* ---- building ---- */
function fxSig(){
  return JSON.stringify(Object.keys(S.fx.graphs).map(k=>{const g=S.fx.graphs[k];
    return[k,g.nodes.map(n=>[n.id,n.type,n.bypass,(n.s&&n.s.ir)||'',FXT[n.type].params.filter(q=>q.stat).map(q=>Math.round(n.p[q.k]))]),g.cables.filter(c=>cableKind(g,c)==='audio').map(c=>[c.from.n,c.from.p,c.to.n,c.to.p])];}))+'|'+FXA.wlReady;
}
function fxGroupIn(g){
  const c=AU.ctx;
  if(FXA.ctx!==c){FXA.ctx=c;FXA.gin={};FXA.gout={};FXA.min=null;FXA.sig='';FXA.scopes={};loadWorklet(c);}
  if(!FXA.min){FXA.min=gainN(c);}
  if(!FXA.gin[g]){FXA.gin[g]=gainN(c);FXA.sig='';}
  fxSync();
  return FXA.gin[g];
}
function teardownScope(sc){
  if(!sc) return;
  sc.nodes.forEach(x=>{try{x.impl&&x.impl.stop&&x.impl.stop();}catch(e){}x.all.forEach(a=>{try{a.disconnect();}catch(e){}});});
  try{sc.input.disconnect();}catch(e){}
}
function buildScope(c,key,inNode,outNode){
  const g=S.fx.graphs[key],sc={nodes:[],input:inNode,byId:{}};
  try{inNode.disconnect();}catch(e){}
  if(!g){inNode.connect(outNode);return sc;}
  g.nodes.forEach(n=>{
    const d=FXT[n.type];if(!d)return;
    if(n.type==='input'){sc.byId[n.id]={outs:{out:inNode},all:[]};return;}
    if(n.type==='output'){sc.byId[n.id]={ins:{in:outNode},all:[]};return;}
    if(d.kind==='mod'&&n.type!=='env') return;
    const make=FXI[n.type];if(!make) return;
    let impl;try{impl=make(c,n);}catch(e){console.warn('fx',n.type,e);return;}
    const ent={n,impl,ins:impl.in||{},outs:{},all:[],mixG:null,wetG:null,dryG:null};
    if(n.type==='env'){FXA.follow[n.id]=0;ent.analyser=impl.analyser;}
    else if(d.raw||impl.out){
      ent.outs=impl.out||{};
      if(n.bypass){const thru=gainN(c);Object.keys(ent.ins).forEach(p=>{ent.ins[p]=thru;});Object.keys(ent.outs).forEach(p=>{ent.outs[p]=thru;});ent.all.push(thru);}
    }else{
      const inp=impl.in.in,dry=gainN(c,1),wetG=gainN(c,.3),dryMix=gainN(c,.7),mix=gainN(c),wetOut=gainN(c,1);
      const head=gainN(c);head.connect(inp);head.connect(dry);
      impl.wet.connect(wetOut);dry.connect(dryMix);wetOut.connect(wetG);dryMix.connect(mix);wetG.connect(mix);
      if(n.bypass){wetG.gain.value=0;dryMix.gain.value=1;wetOut.gain.value=0;}
      ent.ins={in:head};ent.outs={dry,wet:wetOut,mix};ent.mixG={wet:wetG,dry:dryMix};ent.all.push(head,dry,wetG,dryMix,mix,wetOut);
    }
    sc.byId[n.id]=ent;sc.nodes.push(ent);
  });
  g.cables.forEach(cb=>{
    if(cableKind(g,cb)!=='audio') return;
    const a=sc.byId[cb.from.n],b=sc.byId[cb.to.n];if(!a||!b)return;
    const src=a.outs&&a.outs[cb.from.p],dst=b.ins&&b.ins[cb.to.p];
    if(src&&dst){try{src.connect(dst);}catch(e){}}
  });
  return sc;
}
function fxSync(){
  const c=AU.ctx;if(!c||!FXA.min) return;
  const sig=fxSig()+'|'+Object.keys(FXA.gin).join(',');
  if(sig===FXA.sig) return;
  FXA.sig=sig;
  Object.keys(FXA.scopes).forEach(k=>teardownScope(FXA.scopes[k]));FXA.scopes={};
  FXA.scopes.master=buildScope(c,'master',FXA.min,sampBus());
  Object.keys(FXA.gin).forEach(g=>{FXA.scopes['g:'+g]=buildScope(c,g,FXA.gin[g],FXA.min);});
  fxApplyParams(true);
  if(!FXA.timer) FXA.timer=setInterval(fxTick,16);
}
function fxApplyParams(all){
  const t=fxClock();
  Object.keys(FXA.scopes).forEach(sk=>{
    const key=sk==='master'?'master':sk.slice(2),g=S.fx.graphs[key];if(!g)return;
    FXA.scopes[sk].nodes.forEach(ent=>{
      const n=ent.n,d=FXT[n.type];if(!d)return;
      d.params.forEach(q=>{
        const r=paramReal(g,n,q,t);const v=typeof r==='number'?r:r.v;
        if(!all&&!r.mod&&ent['_'+q.k]===v)return;ent['_'+q.k]=v;
        if(q.k==='mix'&&ent.mixG&&!n.bypass){const m=clamp(v/100,0,1);setP(ent.mixG.wet.gain,m);setP(ent.mixG.dry.gain,1-m);return;}
        if(q.sync&&r.sync){ent.impl.set(q.k,v);return;}
        ent.impl.set&&ent.impl.set(q.k,v);
      });
      if(ent.analyser){const a=ent.analyser,b=ent._b||(ent._b=new Float32Array(a.fftSize));a.getFloatTimeDomainData(b);let s=0;for(let i=0;i<b.length;i++)s+=b[i]*b[i];
        const lv=Math.sqrt(s/b.length),p=n.p,cur=FXA.follow[n.id]||0,k=lv>cur?Math.min(1,16/Math.max(1,p.attack)):Math.min(1,16/Math.max(1,p.release));FXA.follow[n.id]=cur+(lv-cur)*k;}
      if(n.type==='pwah'&&n.p.mode>.5) ent.impl.set('pos',n.p.pos);
    });
  });
}
function fxTick(){
  if(!AU.ctx||AU.ctx.state!=='running') return;
  fxSync();fxApplyParams(false);
}
/* web MIDI for the maker: notes, mod wheel, expression, aftertouch, pitch bend */
if(navigator.requestMIDIAccess){
  navigator.requestMIDIAccess().then(a=>{
    const hook=()=>a.inputs.forEach(i=>{i.onmidimessage=m=>{
      const [s,d1,d2]=m.data,c=s&240;ensureAudio();
      if(c===144&&d2>0)noteOn(d1,d2);else if(c===128||(c===144&&d2===0))noteOff(d1);
      else if(c===176){if(d1===1)FXM.mod=d2/127;else if(d1===11)FXM.expr=d2/127;if(engineOn())ENG.node.port.postMessage({t:'cc',cc:d1,v:d2});}
      else if(c===208)FXM.at=d1/127;else if(c===224){FXM.bend=((d2<<7)|d1)/16383;if(engineOn())ENG.node.port.postMessage({t:'bend',v:FXM.bend});}
    };});
    hook();a.onstatechange=hook;
  }).catch(()=>{});
}
