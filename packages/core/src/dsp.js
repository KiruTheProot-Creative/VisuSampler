import {clamp,hash01,hann} from './util.js';
export const INTERP=['nearest','linear','cubic','sinc'];
const lanczos=(x,a)=>{if(x===0)return 1;if(x<=-a||x>=a)return 0;const px=Math.PI*x;return a*Math.sin(px)*Math.sin(px/a)/(px*px);};
/** Read `src` at step `ratio` (2 = one octave up) into `outLen` frames. `ker` sets the sinc kernel width. */
export function resample(src,ratio,mode,outLen,ker){
  const out=new Float32Array(outLen),n=src.length,at=i=>i<0||i>=n?0:src[i];
  if(mode==='nearest'){for(let o=0;o<outLen;o++)out[o]=at(Math.round(o*ratio));return out;}
  if(mode==='linear'){for(let o=0;o<outLen;o++){const p=o*ratio,i=Math.floor(p),f=p-i;out[o]=at(i)*(1-f)+at(i+1)*f;}return out;}
  if(mode==='cubic'){
    for(let o=0;o<outLen;o++){const p=o*ratio,i=Math.floor(p),t=p-i,a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);out[o]=b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
    return out;
  }
  const KA=ker||4,fc=ratio>1?1/ratio:1,A=Math.min(32,Math.ceil(KA*Math.max(1,ratio)));
  for(let o=0;o<outLen;o++){
    const p=o*ratio,i=Math.floor(p);let s=0;
    for(let k=i-A+1;k<=i+A;k++){const w=lanczos((p-k)*fc,KA);if(w)s+=at(k)*w*fc;}
    out[o]=s;
  }
  return out;
}
/** Time-stretch one channel by factor f (output length = input length * f). WSOLA picks the best-matching grain so it does not flutter. */
export function stretchCh(d,f,grain,wsola){
  const n=d.length,outLen=Math.max(2,Math.round(n*f)),out=new Float32Array(outLen),wsum=new Float32Array(outLen);
  const hop=grain>>2,win=new Float32Array(grain);for(let i=0;i<grain;i++)win[i]=hann((i+.5)/grain);
  const sh=Math.max(1,Math.round(hop/f)),search=wsola?Math.min(grain>>1,Math.round(hop*.9)):0;
  let prevTail=0;
  for(let o=0,k=0;o<outLen;o+=hop,k++){
    let p=Math.round(k*sh);
    if(search&&k>0){
      let best=-1e9,bo=0;
      for(let off=-search;off<=search;off+=4){
        const q=p+off;if(q<0||q+hop>=n)continue;
        let c=0;for(let i=0;i<hop;i+=4)c+=d[q+i]*d[prevTail+i];
        if(c>best){best=c;bo=off;}
      }
      p+=bo;
    }
    if(p<0)p=0;if(p+grain>n+grain)break;
    for(let i=0;i<grain&&o+i<outLen;i++){const v=p+i<n?d[p+i]:0;out[o+i]+=v*win[i];wsum[o+i]+=win[i];}
    prevTail=Math.min(n-hop-1,Math.max(0,p+hop));
  }
  for(let i=0;i<outLen;i++)if(wsum[i]>1e-4)out[i]/=wsum[i];
  return out;
}
export function stretchAll(chs,f,grainMs,sr,wsola){
  const g=Math.max(256,Math.round(grainMs/1000*sr/2)*2);
  return chs.map(d=>stretchCh(d,f,g,wsola));
}
/** Granular cloud rendered to a looping 4 s buffer at the source rate. */
export function granularRender(b,gr,pitchRatio,seed){
  const sr=b.sr,len=Math.round(sr*4),n=b.ch[0].length,out=b.ch.map(()=>new Float32Array(len));
  const gl=Math.max(64,Math.round(gr.size/1000*sr)),step=Math.max(1,Math.round(sr/Math.max(1,gr.density)));
  let k=0;
  for(let o=-gl;o<len;o+=step,k++){
    const r1=hash01(seed*977+k),r2=hash01(seed*313+k*7),jit=Math.pow(2,((r2*2-1)*gr.jitter)/1200),rate=pitchRatio*jit;
    const p0=clamp(gr.pos/100*n+(r1*2-1)*gr.spread/100*n,0,Math.max(0,n-2));
    for(let c=0;c<out.length;c++){
      const d=b.ch[c],dst=out[c];
      for(let i=0;i<gl;i++){
        const oi=o+i;if(oi<0||oi>=len)continue;
        const p=p0+i*rate,ip=Math.floor(p);if(ip>=n-1)break;
        const f=p-ip,v=d[ip]*(1-f)+d[ip+1]*f,t=i/gl;
        dst[oi]+=v*(gr.shape==='tri'?1-Math.abs(2*t-1):gr.shape==='rect'?(t<.1?t*10:t>.9?(1-t)*10:1):hann(t));
      }
    }
  }
  const norm=Math.sqrt(step/gl)*1.4;
  out.forEach(d=>{for(let i=0;i<len;i++)d[i]*=norm;});
  return out;
}
/** Wavetable: single-cycle frames pitched by building an exact whole number of cycles. Returns {ch, loop}. */
export function wavetableRender(b,wt,f,outSr,pos){
  const src=b.ch[0],fl=Math.max(32,wt.frame|0),nf=Math.max(1,Math.floor(src.length/fl));
  const tab=(fi,ph)=>{const base=fi*fl,x=ph*fl,i=Math.floor(x),t=x-i,g=k=>src[base+((i+k)%fl+fl)%fl]||0;const a=g(-1),b0=g(0),c=g(1),d=g(2);return b0+.5*t*(c-a+t*(2*a-5*b0+4*c-d+t*(3*(b0-c)+d-a)));};
  const frameAt=p=>{const x=clamp(p,0,1)*(nf-1),i=Math.floor(x);return[i,Math.min(nf-1,i+1),x-i];};
  const P=outSr/f;let k=1,L=Math.round(P);
  for(k=1;k<=16;k++){L=Math.round(k*P);if(Math.abs(L/(k*P)-1)<.0004)break;}
  const cyc=L/k,sweep=wt.pos2>=0&&wt.sweep>0,sweepFrames=sweep?Math.round(wt.sweep/1000*outSr):0;
  const total=sweep?Math.max(L*2,Math.ceil(sweepFrames/cyc)*Math.round(cyc))+L:L,out=new Float32Array(total);
  const p2=wt.pos2>=0?wt.pos2/100:pos;
  for(let n=0;n<total;n++){
    const isHold=sweep&&n>=total-L,c0=Math.floor(n/cyc),ph=(n-c0*cyc)/cyc;
    const t=sweep?(isHold?1:clamp(n/Math.max(1,sweepFrames),0,1)):0,pp=pos+(p2-pos)*t,fa=frameAt(pp);
    out[n]=tab(fa[0],ph)*(1-fa[2])+tab(fa[1],ph)*fa[2];
  }
  let pk=0;for(let i=0;i<total;i++)pk=Math.max(pk,Math.abs(out[i]));if(pk>0)for(let i=0;i<total;i++)out[i]*=.8/pk;
  const fade=Math.min(64,L>>3);for(let i=0;i<fade;i++)out[i]*=i/fade;
  return{ch:[out],loop:{s:total-L,e:total}};
}
/** Find where a slicer should cut: energy rise between short windows. `sens` is 0..100. Returns frame positions. */
export function detectTransients(ch0,sr,sens){
  const d=ch0,hop=Math.max(128,Math.round(sr*.004)),n=Math.floor(d.length/hop)-1,env=new Float32Array(n+1);
  let mx=0;
  for(let i=0;i<n;i++){let e=0;for(let j=0;j<hop*3;j+=2){const v=d[i*hop+j]||0;e+=v*v;}env[i]=Math.sqrt(e/(hop*1.5));if(env[i]>mx)mx=env[i];}
  const floor=mx*(.22*(1-sens/100)+.012),ratio=1.6+(1-sens/100)*1.4,minGap=Math.round(.06*sr/hop),out=[0];let last=0;
  for(let i=3;i<n;i++){
    const prev=(env[i-1]+env[i-2]+env[i-3])/3;
    if(env[i]>floor&&env[i]>prev*ratio&&env[i]>=env[i+1]*.6&&i-last>=minGap){
      let f=i*hop;for(let k=0;k<hop*3&&f>0;k+=2){if(Math.abs(d[f-1])<.02*mx)break;f-=2;}
      if(f-out[out.length-1]>sr*.03){out.push(Math.max(0,f));last=i;}
    }
  }
  return out;
}
