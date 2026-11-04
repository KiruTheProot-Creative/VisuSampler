import {clamp,barBeats,fadeCurve} from './util.js';
import {resample,stretchAll,granularRender,wavetableRender} from './dsp.js';
import {smOf} from './modes.js';
/**
 * The engine reads everything through a context so it never touches globals:
 *   ctx.buffer(id)      -> {ch:[Float32Array], sr}
 *   ctx.sample(id)      -> sample meta ({id,name,root,fine,loop,sm,...})
 *   ctx.group(name)     -> group settings ({tune, interp, ...})
 *   ctx.defaultInterp   -> 'linear' | 'cubic' | ...
 *   ctx.bpm, ctx.sig    -> project tempo and time signature {n,d}
 *   ctx.tagValue(id)    -> 0..1 value of a tag (for wavetable position)
 */
export function zoneInterp(ctx,z){
  if(z.interp&&z.interp!=='inherit')return z.interp;
  const g=ctx.group(z.group);return g.interp&&g.interp!=='inherit'?g.interp:(ctx.defaultInterp||'linear');
}
export function zoneRatio(ctx,z,note,tuneExtra){
  const g=ctx.group(z.group),semis=(z.keytrack?note-z.root:0)+(z.tune+g.tune+(tuneExtra||0))/100;
  return Math.pow(2,semis/12);
}
/** Render one zone at one note to plain data: {ch, loop:{s,e}|null, sr}. Used live (device rate) and by the exporter (source rate, best quality). */
export function zoneData(ctx,z,note,vel,tuneExtra,startExtra,outSr,ker){
  const b=ctx.buffer(z.sample);if(!b)return null;
  const smp=ctx.sample(z.sample),sm=smOf(smp),md=sm.mode,mode=zoneInterp(ctx,z),g=ctx.group(z.group);
  const pitch=zoneRatio(ctx,z,note,tuneExtra),ratio0=pitch*b.sr/outSr,total=b.ch[0].length;
  if(md==='wavetable'){
    const semis=(z.keytrack?note-z.root:0)+(z.tune+g.tune+(tuneExtra||0))/100,f=440*Math.pow(2,(z.root-69+semis)/12);
    const tv=sm.wt.tag?ctx.tagValue&&ctx.tagValue(sm.wt.tag):null,pos=tv!=null?tv:sm.wt.pos/100;
    const r=wavetableRender(b,sm.wt,f,outSr,pos);
    return{ch:r.ch,loop:r.loop,sr:outSr};
  }
  const startMs=z.start+z.vstart*(vel/127)+(startExtra||0),st=clamp(Math.round(startMs/1000*b.sr),0,total-2);
  const endF=z.end>0?clamp(Math.round(z.end/1000*b.sr),st+64,total):total;
  let data,ratio=ratio0,L=z.loop,loopOut=null;
  if(md==='granular'){
    const gb=granularRender(b,sm.gr,pitch,(z.root*31+note)|0);
    data=gb;ratio=b.sr/outSr;
    const len=gb[0].length;L={on:true,s:Math.round(len*.45),e:len,xf:Math.round(b.sr*.4),xcurve:'power',pp:false};
  }else{
    data=b.ch.map(d=>d.subarray(st,endF));
    if(z.rev)data=data.map(d=>{const o=new Float32Array(d.length);for(let i=0;i<d.length;i++)o[i]=d[d.length-1-i];return o;});
  }
  let scale=1;
  if(md==='speedkeep'){
    const sk=sm.sk,od=sm.bars*barBeats(ctx.sig)*60/(total/b.sr),v=Math.max(.05,sk.speed/100*(sk.sync?ctx.bpm/od:1)),f=pitch/v;
    if(Math.abs(f-1)>.002){data=stretchAll(data,f,sk.grain,b.sr,sk.quality==='wsola');scale=f;}
  }
  const off=md==='granular'?0:st;
  if(L.on&&!z.rev&&(md==='granular'||L.e-L.s>64&&L.e<=endF)){
    const s0=Math.max(0,Math.round((L.s-off)*scale)),e0=Math.round((L.e-off)*scale),len=e0-s0,xf=Math.min(Math.round(L.xf*scale),s0,len>>1);
    if(e0>s0+16&&e0<=data[0].length){
      data=data.map(d=>{
        let c=new Float32Array(d.length);c.set(d);
        if(xf>0)for(let i=0;i<xf;i++){const t=(i+.5)/xf,gi=fadeCurve(t,L.xcurve),go=fadeCurve(1-t,L.xcurve);c[e0-xf+i]=d[e0-xf+i]*go+d[s0-xf+i]*gi;}
        c=c.subarray(0,e0);
        if(L.pp){const seg=c.subarray(s0,e0),o=new Float32Array(e0+len);o.set(c);for(let i=0;i<len;i++)o[e0+i]=seg[len-1-i];return o;}
        return c;
      });
      loopOut={s:s0,e:L.pp?e0+len:e0};
    }
  }
  const srcLen=data[0].length,outLen=Math.max(2,Math.ceil(srcLen/ratio)),outCh=data.map(d=>resample(d,ratio,mode,outLen,ker));
  return{ch:outCh,loop:loopOut?{s:Math.round(loopOut.s/ratio),e:Math.round(loopOut.e/ratio)}:null,sr:outSr};
}
