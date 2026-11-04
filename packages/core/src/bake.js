import {clamp,bytesPer,noteName} from './util.js';
import {smOf,smDefaults,uniVoices} from './modes.js';
import {zoneData} from './zone.js';
/*
  Bake: render the interpolation (and optionally tuning, loops, unison) into extra samples at export time,
  so the player does less work. Off by default, because it makes files bigger.
  Everything works on a `project` = {samples, zones} plus an engine context (see zone.js) and export options:
  {bake, mode:'smart'|'full', step, budgetOn, budgetMB, quality, bakeUni, bits, includeUnused, includeOrig}
*/
export const fmtBytes=n=>n>=1048576?(n/1048576).toFixed(n>=1.07e8?0:1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';
export function zoneBakeReason(ctx,z){
  const s=ctx.sample(z.sample);if(!s)return'sample missing';
  const sm=smOf(s);
  if(sm.mode!=='sampler'&&sm.mode!=='speedkeep')return'mode '+sm.mode+' is rendered live';
  if(!z.keytrack)return'does not follow the keyboard';
  if(z.vstart>0)return'start depends on velocity';
  if(sm.mode==='speedkeep'&&sm.sk.sync)return'follows the host tempo';
  return'';
}
/** Which keys get their own baked sample. "smart" keeps root +-2 semitones live. */
export function bakePlan(z,o,step){
  const keep=o.mode==='smart'?[Math.max(z.lo,z.root-2),Math.min(z.hi,z.root+2)]:null,segs=[];
  if(keep&&keep[0]<=keep[1]){if(z.lo<keep[0])segs.push([z.lo,keep[0]-1]);if(keep[1]<z.hi)segs.push([keep[1]+1,z.hi]);}
  else segs.push([z.lo,z.hi]);
  const chunks=[];
  segs.forEach(sg=>{for(let a=sg[0];a<=sg[1];a+=step){const b=Math.min(sg[1],a+step-1);chunks.push({lo:a,hi:b,note:Math.round((a+b)/2)});}});
  return{chunks,keep:keep&&keep[0]<=keep[1]?keep:null};
}
function effFrames(z,s){const st=Math.round(z.start/1000*s.sr),en=z.end>0?Math.round(z.end/1000*s.sr):s.frames;return Math.max(64,Math.min(en,s.frames)-st);}
function chunkFrames(z,s,note){
  const sm=smOf(s),n=effFrames(z,s);
  if(sm.mode==='speedkeep')return Math.round(n/Math.max(.05,sm.sk.speed/100));
  return Math.round(n/Math.pow(2,((note-z.root)/12)+z.tune/1200));
}
export function chooseStep(ctx,project,o){
  if(!o.budgetOn)return o.step;
  const target=o.budgetMB*1048576;
  for(let st=1;st<=24;st++)if(estimate(ctx,project,o,st).after<=target)return st;
  return 24;
}
/** Predict the size before building. Sizes are before compression. */
export function estimate(ctx,project,o,stepOverride){
  const step=stepOverride||chooseStep(ctx,project,o),bps=bytesPer(o.bits),res={before:0,after:0,perGroup:{},zonesBaked:0,chunks:0,skipped:[],step,over:false};
  const used=new Set(project.zones.map(z=>z.sample).concat(project.keep||[])),raw=s=>s.frames*s.chn*bps,firstGroup=id=>{const z=project.zones.find(x=>x.sample===id);return z?z.group:'(unused)';};
  const add=(g,n)=>{res.perGroup[g]=(res.perGroup[g]||0)+n;res.after+=n;};
  project.samples.forEach(s=>{if(o.includeUnused||used.has(s.id))res.before+=raw(s);});
  if(!o.bake){project.samples.forEach(s=>{if(o.includeUnused||used.has(s.id))add(firstGroup(s.id),raw(s));});return res;}
  const need=new Set();
  project.zones.forEach(z=>{
    const s=ctx.sample(z.sample);if(!s)return;
    const why=zoneBakeReason(ctx,z);if(why){need.add(s.id);res.skipped.push({z,why});return;}
    const plan=bakePlan(z,o,step);if(plan.keep||o.includeOrig)need.add(s.id);
    const sm=smOf(s),uni=sm.uni.on&&o.bakeUni&&!z.loop.on,ch=uni?2:s.chn;
    plan.chunks.forEach(c=>{add(z.group,chunkFrames(z,s,c.note)*ch*bps);res.chunks++;});
    if(sm.uni.on&&z.loop.on&&o.bakeUni)res.skipped.push({z,why:'unison on a looping zone stays live',soft:true});
    res.zonesBaked++;
  });
  need.forEach(id=>{const s=ctx.sample(id);if(s)add(firstGroup(id),raw(s));});
  if(o.includeUnused)project.samples.forEach(s=>{if(!used.has(s.id))add('(unused)',raw(s));});
  if(o.budgetOn&&res.after>o.budgetMB*1048576)res.over=true;
  return res;
}
function mixUnison(ctx,z,note,sm,sr,ker){
  const vs=uniVoices(sm),outs=vs.map(u=>zoneData(ctx,z,note,100,u.tune,0,sr,ker));
  const len=Math.max(...outs.map(d=>d.ch[0].length)),L=new Float32Array(len),R=new Float32Array(len);
  outs.forEach((d,i)=>{
    const u=vs[i],th=(clamp(u.pan,-1,1)+1)*Math.PI/4,gl=Math.cos(th)*1.4142*u.gain,gr=Math.sin(th)*1.4142*u.gain,a=d.ch[0],b=d.ch[1]||d.ch[0];
    for(let k=0;k<a.length;k++){L[k]+=a[k]*gl;R[k]+=b[k]*gr;}
  });
  return{ch:[L,R],loop:null};
}
const yieldNow=()=>new Promise(r=>setTimeout(r,0));
const clone=x=>JSON.parse(JSON.stringify(x));
/**
 * Produce the final samples and zones for the file. The project is never changed.
 * project.keep: extra sample ids to pack even though no zone uses them (for example convolution impulses).
 * Returns {samples:[{meta,ch}], zones, stats}.  `progress(text)` is optional.
 */
export async function buildExportSet(ctx,project,o,progress){
  const step=chooseStep(ctx,project,o),zones=[],samples=new Map(),stats={chunks:0,zonesBaked:0,step,skipped:0,baked:0};
  const used=new Set(project.zones.map(z=>z.sample).concat(project.keep||[])),need=new Set(),cache=new Map();let n=0,idc=1;
  for(const z of project.zones){
    n++;if(progress&&n%2===0){progress('Rendering zones '+n+' / '+project.zones.length);await yieldNow();}
    const s=ctx.sample(z.sample),b=s&&ctx.buffer(z.sample);if(!s||!b)continue;
    const why=o.bake?zoneBakeReason(ctx,z):'bake off';
    if(why){zones.push(clone(z));need.add(s.id);if(o.bake)stats.skipped++;continue;}
    const plan=bakePlan(z,o,step),sm=smOf(s),uni=sm.uni.on&&o.bakeUni&&!z.loop.on;
    if(plan.keep||o.includeOrig)need.add(s.id);
    if(plan.keep){const k=clone(z);k.lo=plan.keep[0];k.hi=plan.keep[1];if(k.lo>z.lo)k.fadeLo=0;if(k.hi<z.hi)k.fadeHi=0;zones.push(k);}
    for(let ci=0;ci<plan.chunks.length;ci++){
      const c=plan.chunks[ci],zc=clone(z);zc.interp=o.quality;zc.lo=c.lo;zc.hi=c.hi;
      const key=[z.sample,c.note,z.tune,ctx.group(z.group).tune,z.start,z.end,z.rev,JSON.stringify(z.loop),uni,z.root].join('|');
      let r=cache.get(key);
      if(!r){const ker=o.quality==='sinc'?8:undefined;r=uni?mixUnison(ctx,zc,c.note,sm,s.sr,ker):zoneData(ctx,zc,c.note,100,0,0,s.sr,ker);cache.set(key,r);if(ci%4===3)await yieldNow();}
      const id='baked'+(idc++),meta={id,name:s.name+' @'+noteName(c.note),sr:s.sr,chn:r.ch.length,frames:r.ch[0].length,root:c.note,fine:0,loop:r.loop?{s:r.loop.s,e:r.loop.e,xf:0}:null,baked:true};
      samples.set(id,{meta,ch:r.ch});
      zc.sample=id;zc.root=c.note;zc.tune=0;zc.keytrack=true;zc.start=0;zc.end=0;zc.vstart=0;zc.rev=false;zc.id='bz'+id;
      zc.loop=r.loop?{on:true,s:r.loop.s,e:r.loop.e,xf:0,xcurve:'power',pp:false}:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false};
      zc.fadeLo=ci===0&&c.lo===z.lo?z.fadeLo:0;zc.fadeHi=ci===plan.chunks.length-1&&c.hi===z.hi?z.fadeHi:0;
      zones.push(zc);stats.chunks++;stats.baked++;
    }
    stats.zonesBaked++;
  }
  project.samples.forEach(s=>{
    const b=ctx.buffer(s.id);if(!b)return;
    if(need.has(s.id)||(!o.bake&&used.has(s.id))||(o.includeUnused&&!used.has(s.id)))samples.set(s.id,{meta:clone(s),ch:b.ch});
  });
  stats.unusedSkipped=project.samples.filter(s=>!used.has(s.id)&&!o.includeUnused).length;
  return{samples:[...samples.values()],zones,stats};
}
