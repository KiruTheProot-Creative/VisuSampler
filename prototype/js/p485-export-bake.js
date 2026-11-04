/* ---------- export: optional bake (interpolation baked into the samples) ---------- */
const bytesPer=bits=>bits===24?3:bits===32?4:2;
const fmtBytes=n=>n>=1048576?(n/1048576).toFixed(n>=1.07e8?0:1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';
function zoneBakeReason(z){
  const s=sampleById(z.sample); if(!s) return 'sample missing';
  const sm=smOf(s);
  if(sm.mode!=='sampler'&&sm.mode!=='speedkeep') return 'mode '+sm.mode+' is rendered live';
  if(!z.keytrack) return 'does not follow the keyboard';
  if(z.vstart>0) return 'start depends on velocity';
  if(sm.mode==='speedkeep'&&sm.sk.sync) return 'follows the host tempo';
  return '';
}
function bakePlan(z,o,step){
  const keep=o.mode==='smart'?[Math.max(z.lo,z.root-2),Math.min(z.hi,z.root+2)]:null;
  const segs=[];
  if(keep&&keep[0]<=keep[1]){if(z.lo<keep[0])segs.push([z.lo,keep[0]-1]);if(keep[1]<z.hi)segs.push([keep[1]+1,z.hi]);}
  else segs.push([z.lo,z.hi]);
  const chunks=[];
  segs.forEach(sg=>{for(let a=sg[0];a<=sg[1];a+=step){const b=Math.min(sg[1],a+step-1);chunks.push({lo:a,hi:b,note:Math.round((a+b)/2)});}});
  return{chunks,keep:keep&&keep[0]<=keep[1]?keep:null};
}
function effFrames(z,s){
  const sm=smOf(s),st=Math.round(z.start/1000*s.sr),en=z.end>0?Math.round(z.end/1000*s.sr):s.frames;
  return Math.max(64,Math.min(en,s.frames)-st);
}
function chunkFrames(z,s,note){
  const sm=smOf(s),n=effFrames(z,s);
  if(sm.mode==='speedkeep') return Math.round(n/Math.max(.05,sm.sk.speed/100));
  return Math.round(n/Math.pow(2,((note-z.root)/12)+z.tune/1200));
}
function exStep(o){
  if(!o.budgetOn) return o.step;
  const target=o.budgetMB*1048576;
  for(let st=1;st<=24;st++){const e=estimate(o,st);if(e.after<=target) return st;}
  return 24;
}
function estimate(o,stepOverride){
  const step=stepOverride||exStep(o),bps=bytesPer(o.bits),res={before:0,after:0,perGroup:{},zonesBaked:0,chunks:0,skipped:[],step,over:false};
  const origUsed=new Set(S.zones.map(z=>z.sample));
  const rawBytes=s=>s.frames*s.chn*bps;
  S.samples.forEach(s=>{if(o.includeUnused||origUsed.has(s.id))res.before+=rawBytes(s);});
  const origNeeded=new Set(),add=(g,n)=>{res.perGroup[g]=(res.perGroup[g]||0)+n;res.after+=n;};
  if(!o.bake){
    S.samples.forEach(s=>{if(o.includeUnused||origUsed.has(s.id)){const z=S.zones.find(x=>x.sample===s.id);add(z?z.group:'(unused)',rawBytes(s));}});
    return res;
  }
  S.zones.forEach(z=>{
    const s=sampleById(z.sample); if(!s) return;
    const why=zoneBakeReason(z);
    if(why){origNeeded.add(s.id);res.skipped.push({z,why});return;}
    const plan=bakePlan(z,o,step);if(plan.keep||o.includeOrig)origNeeded.add(s.id);
    const sm=smOf(s),uni=sm.uni.on&&o.bakeUni&&!z.loop.on,ch=uni?2:s.chn;
    plan.chunks.forEach(c=>{add(z.group,chunkFrames(z,s,c.note)*ch*bps);res.chunks++;});
    if(sm.uni.on&&z.loop.on&&o.bakeUni) res.skipped.push({z,why:'unison on a looping zone stays live',soft:true});
    res.zonesBaked++;
  });
  origNeeded.forEach(id=>{const s=sampleById(id);if(s){const z=S.zones.find(x=>x.sample===id);add(z?z.group:'(unused)',rawBytes(s));}});
  if(o.includeUnused) S.samples.forEach(s=>{if(!origUsed.has(s.id))add('(unused)',rawBytes(s));});
  if(o.budgetOn&&res.after>o.budgetMB*1048576) res.over=true;
  return res;
}
function mixUnison(z,note,sm,sr,ker){
  const vs=uniVoices(sm),outs=vs.map(u=>zoneData(z,note,100,u.tune,0,sr,ker));
  const len=Math.max.apply(null,outs.map(d=>d.ch[0].length)),L=new Float32Array(len),R=new Float32Array(len);
  outs.forEach((d,i)=>{
    const u=vs[i],th=(clamp(u.pan,-1,1)+1)*Math.PI/4,gl=Math.cos(th)*1.4142*u.gain,gr=Math.sin(th)*1.4142*u.gain;
    const a=d.ch[0],b=d.ch[1]||d.ch[0];
    for(let k=0;k<a.length;k++){L[k]+=a[k]*gl;R[k]+=b[k]*gr;}
  });
  return{ch:[L,R],loop:null};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
/* produces the final sample set and zone list for the file */
async function buildExportSet(o,progress){
  const step=exStep(o),zones=[],samples=new Map(),baked=[];
  const origUsed=new Set(S.zones.map(z=>z.sample)),stats={chunks:0,zonesBaked:0,step,skipped:0};
  const needOrig=new Set(),cache=new Map();
  const total=S.zones.length;let done=0;
  for(const z of S.zones){
    done++;if(progress&&done%2===0){progress('Rendering zones '+done+' / '+total);await tick();}
    const s=sampleById(z.sample),b=s&&BUF.get(z.sample); if(!s||!b) continue;
    const why=o.bake?zoneBakeReason(z):'bake off';
    if(why){zones.push(JSON.parse(JSON.stringify(z)));needOrig.add(s.id);if(o.bake)stats.skipped++;continue;}
    const plan=bakePlan(z,o,step),sm=smOf(s),uni=sm.uni.on&&o.bakeUni&&!z.loop.on;
    if(plan.keep||o.includeOrig){needOrig.add(s.id);}
    if(plan.keep){const k=JSON.parse(JSON.stringify(z));k.lo=plan.keep[0];k.hi=plan.keep[1];if(k.lo>z.lo)k.fadeLo=0;if(k.hi<z.hi)k.fadeHi=0;zones.push(k);}
    plan.chunks.forEach(()=>{});
    for(let ci=0;ci<plan.chunks.length;ci++){
      const c=plan.chunks[ci],zc=JSON.parse(JSON.stringify(z));
      zc.interp=o.quality;zc.lo=c.lo;zc.hi=c.hi;
      const key=[z.sample,c.note,z.tune,gcfg(z.group).tune,z.start,z.end,z.rev,JSON.stringify(z.loop),uni,z.root].join('|');
      let r=cache.get(key);
      if(!r){
        const ker=o.quality==='sinc'?8:undefined;
        r=uni?mixUnison(zc,c.note,sm,s.sr,ker):zoneData(zc,c.note,100,0,0,s.sr,ker);
        cache.set(key,r);
        if(ci%4===3){await tick();}
      }
      const id=nid('s'),name=s.name+' @'+noteName(c.note);
      const meta={id,name,sr:s.sr,chn:r.ch.length,frames:r.ch[0].length,root:c.note,fine:0,loop:r.loop?{s:r.loop.s,e:r.loop.e,xf:0}:null,baked:true,sm:smDefaults()};
      samples.set(id,{meta,ch:r.ch});baked.push(meta);
      zc.sample=id;zc.root=c.note;zc.tune=0;zc.keytrack=true;zc.start=0;zc.end=0;zc.vstart=0;zc.rev=false;zc.id=nid('z');
      zc.loop=r.loop?{on:true,s:r.loop.s,e:r.loop.e,xf:0,xcurve:'power',pp:false}:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false};
      zc.fadeLo=ci===0&&c.lo===z.lo?z.fadeLo:0;zc.fadeHi=ci===plan.chunks.length-1&&c.hi===z.hi?z.fadeHi:0;
      zones.push(zc);stats.chunks++;
    }
    stats.zonesBaked++;
  }
  S.samples.forEach(s=>{
    const b=BUF.get(s.id);if(!b)return;
    if(needOrig.has(s.id)||(!o.bake&&origUsed.has(s.id))||o.includeUnused&&!origUsed.has(s.id)){
      samples.set(s.id,{meta:JSON.parse(JSON.stringify(s)),ch:b.ch});
    }
  });
  const unused=S.samples.filter(s=>!origUsed.has(s.id)&&!o.includeUnused).length;
  return{samples:Array.from(samples.values()),zones,stats:Object.assign(stats,{unusedSkipped:unused,baked:baked.length})};
}
