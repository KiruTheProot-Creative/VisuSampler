/* ---------- sampler modes: speed-keeping, granular, wavetable, unison ---------- */
const MODES_S=[['sampler','Sampler (pitch and speed together)'],['speedkeep','Speed-keeping (time machine)'],['slicer','Slicer (beat machine)'],['wavetable','Wavetable'],['granular','Granular']];
function smDefaults(){
  return{mode:'sampler',
    sk:{speed:100,grain:50,quality:'wsola',sync:false,bars:2},
    gr:{size:90,density:28,pos:45,spread:15,jitter:0,shape:'hann'},
    wt:{frame:2048,pos:0,pos2:-1,sweep:2500,tag:''},
    uni:{on:false,voices:5,detune:30,spread:70,blend:60,curve:'super',startRand:14,drift:0,mode:'detune',chord:'0,7,12'},
    slices:[],sens:50,bars:2};
}
function smOf(s){ if(!s.sm) s.sm=smDefaults(); else{const d=smDefaults();Object.keys(d).forEach(k=>{if(s.sm[k]===undefined)s.sm[k]=d[k];else if(typeof d[k]==='object'&&!Array.isArray(d[k]))s.sm[k]=Object.assign({},d[k],s.sm[k]);});} return s.sm; }
const hash01=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const hann=t=>.5-.5*Math.cos(2*Math.PI*t);
/* time-stretch by factor f (output length = input length * f). WSOLA picks the best-matching grain start so it does not flutter. */
function stretchCh(d,f,grain,wsola){
  const n=d.length,outLen=Math.max(2,Math.round(n*f)),out=new Float32Array(outLen),wsum=new Float32Array(outLen);
  const hop=grain>>2,win=new Float32Array(grain);for(let i=0;i<grain;i++)win[i]=hann((i+.5)/grain);
  const sh=Math.max(1,Math.round(hop/f)),search=wsola?Math.min(grain>>1,Math.round(hop*.9)):0;
  let prevTail=0;
  for(let o=0,k=0;o<outLen;o+=hop,k++){
    let p=Math.round(k*sh);
    if(search&&k>0){
      /* find offset whose start best matches the natural continuation of the previous grain */
      const target=prevTail; let best=-1e9,bo=0;
      for(let off=-search;off<=search;off+=4){
        const q=p+off; if(q<0||q+hop>=n) continue;
        let c=0; for(let i=0;i<hop;i+=4) c+=d[q+i]*d[target+i];
        if(c>best){best=c;bo=off;}
      }
      p+=bo;
    }
    if(p<0)p=0; if(p+grain>n+grain) break;
    for(let i=0;i<grain&&o+i<outLen;i++){const v=p+i<n?d[p+i]:0;out[o+i]+=v*win[i];wsum[o+i]+=win[i];}
    prevTail=Math.min(n-hop-1,Math.max(0,p+hop));
  }
  for(let i=0;i<outLen;i++) if(wsum[i]>1e-4) out[i]/=wsum[i];
  return out;
}
function stretchAll(chs,f,grainMs,sr,wsola){
  const g=Math.max(256,Math.round(grainMs/1000*sr/2)*2);
  return chs.map(d=>stretchCh(d,f,g,wsola));
}
/* granular cloud rendered to a looping 4 s buffer at the source rate; pitch is applied here */
function granularRender(b,gr,pitchRatio,seed){
  const sr=b.sr,len=Math.round(sr*4),n=b.ch[0].length;
  const out=b.ch.map(()=>new Float32Array(len));
  const gl=Math.max(64,Math.round(gr.size/1000*sr)),step=Math.max(1,Math.round(sr/Math.max(1,gr.density)));
  let k=0;
  for(let o=-gl;o<len;o+=step,k++){
    const r1=hash01(seed*977+k),r2=hash01(seed*313+k*7),jit=Math.pow(2,((r2*2-1)*gr.jitter)/1200);
    const rate=pitchRatio*jit;
    const p0=clamp(gr.pos/100*n+(r1*2-1)*gr.spread/100*n,0,Math.max(0,n-2));
    for(let c=0;c<out.length;c++){
      const d=b.ch[c],dst=out[c];
      for(let i=0;i<gl;i++){
        const oi=o+i; if(oi<0||oi>=len) continue;
        const p=p0+i*rate,ip=Math.floor(p); if(ip>=n-1) break;
        const f=p-ip,v=d[ip]*(1-f)+d[ip+1]*f,t=i/gl;
        dst[oi]+=v*(gr.shape==='tri'?1-Math.abs(2*t-1):gr.shape==='rect'?(t<.1?t*10:t>.9?(1-t)*10:1):hann(t));
      }
    }
  }
  const norm=Math.sqrt(step/gl)*1.0;
  out.forEach(d=>{for(let i=0;i<len;i++)d[i]*=norm*1.4;});
  return out;
}
/* wavetable: single-cycle frames, pitched by building an exact whole number of cycles */
function wavetableRender(b,wt,f,outSr,pos){
  const src=b.ch[0],fl=Math.max(32,wt.frame|0),nf=Math.max(1,Math.floor(src.length/fl));
  const tab=(fi,ph)=>{ /* cubic read inside one frame, wraps */
    const base=fi*fl,x=ph*fl,i=Math.floor(x),t=x-i,g=k=>src[base+((i+k)%fl+fl)%fl]||0;
    const a=g(-1),b0=g(0),c=g(1),d=g(2);return b0+.5*t*(c-a+t*(2*a-5*b0+4*c-d+t*(3*(b0-c)+d-a)));
  };
  const frameAt=p=>{const x=clamp(p,0,1)*(nf-1),i=Math.floor(x);return[i,Math.min(nf-1,i+1),x-i];};
  const P=outSr/f; let k=1,L=Math.round(P);
  for(k=1;k<=16;k++){L=Math.round(k*P);if(Math.abs(L/(k*P)-1)<.0004)break;}
  const cyc=L/k,sweep=wt.pos2>=0&&wt.sweep>0,sweepFrames=sweep?Math.round(wt.sweep/1000*outSr):0;
  const total=sweep?Math.max(L*2,Math.ceil(sweepFrames/cyc)*Math.round(cyc))+L:L,out=new Float32Array(total);
  const p2=wt.pos2>=0?wt.pos2/100:pos;
  for(let n=0;n<total;n++){
    const isHold=sweep&&n>=total-L,c0=Math.floor(n/cyc),ph=((n-c0*cyc)/cyc);
    const t=sweep?(isHold?1:clamp(n/Math.max(1,sweepFrames),0,1)):0,pp=pos+(p2-pos)*t,fa=frameAt(pp);
    out[n]=tab(fa[0],ph)*(1-fa[2])+tab(fa[1],ph)*fa[2];
  }
  let pk=0;for(let i=0;i<total;i++)pk=Math.max(pk,Math.abs(out[i]));if(pk>0)for(let i=0;i<total;i++)out[i]*=.8/pk;
  const fade=Math.min(64,L>>3);for(let i=0;i<fade;i++)out[i]*=i/fade; /* soft start */
  return{ch:[out],loop:{s:total-L,e:total}};
}
/* unison voices for a sample: offsets are deterministic so rendered voices can be cached */
function uniVoices(sm){
  const u=sm.uni; if(!u.on) return [{tune:0,pan:0,gain:1,start:0,drift:0}];
  const out=[];
  if(u.mode==='detune'){
    const n=Math.max(1,Math.round(u.voices));
    for(let i=0;i<n;i++){
      const t=n===1?0:(i/(n-1))*2-1,a=Math.abs(t);
      const d=u.curve==='linear'?t*u.detune/2:Math.sign(t)*Math.pow(a,1.7)*u.detune/2;
      const cw=(1-a)*(u.blend/100)+a*(1-u.blend/100)+.12;
      out.push({tune:d,pan:(i%2?1:-1)*a*u.spread/100,gain:cw,start:hash01(i+3)*u.startRand,drift:u.drift});
    }
  }else{
    const semis=u.mode==='octave'?[0,12,-12,24,-24,7]:u.mode==='fifth'?[0,7,12,19,-12]:String(u.chord).split(',').map(x=>parseFloat(x)).filter(x=>!isNaN(x));
    const n=Math.max(1,Math.round(u.mode==='chord'?semis.length:u.voices));
    for(let i=0;i<n;i++){
      const s=semis[i%semis.length]+(i>=semis.length?(Math.floor(i/semis.length))*0:0),w=(i%2?1:-1)*(n>1?(i/(n-1)):0);
      out.push({tune:s*100+(i%2?1:-1)*u.detune*.12,pan:w*u.spread/100,gain:1,start:hash01(i+9)*u.startRand,drift:u.drift});
    }
  }
  const norm=1/Math.sqrt(out.reduce((a,v)=>a+v.gain*v.gain,0));
  out.forEach(v=>{v.gain*=norm*(out.length>1?1.15:1);});
  return out;
}
/* transient detection for the slicer: energy rise between short windows */
function detectTransients(s,sens){
  const b=BUF.get(s.id); if(!b) return [];
  const d=b.ch[0],hop=Math.max(128,Math.round(b.sr*.004)),n=Math.floor(d.length/hop)-1,env=new Float32Array(n+1);
  let mx=0;
  for(let i=0;i<n;i++){let e=0;for(let j=0;j<hop*3;j+=2){const v=d[i*hop+j]||0;e+=v*v;}env[i]=Math.sqrt(e/(hop*1.5));if(env[i]>mx)mx=env[i];}
  const floor=mx*(.22*(1-sens/100)+.012),ratio=1.6+(1-sens/100)*1.4,minGap=Math.round(.06*b.sr/hop),out=[0];let last=0;
  for(let i=3;i<n;i++){
    const prev=(env[i-1]+env[i-2]+env[i-3])/3;
    if(env[i]>floor&&env[i]>prev*ratio&&env[i]>=env[i+1]*.6&&i-last>=minGap){
      let f=i*hop;for(let k=0;k<hop*3&&f>0;k+=2){if(Math.abs(d[f-1])<.02*mx)break;f-=2;}
      if(f-out[out.length-1]>b.sr*.03){out.push(Math.max(0,f));last=i;}
    }
  }
  return out;
}
