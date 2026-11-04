/* ---------- sampler engine: own resampler (interpolation modes), loop crossfade, voices ---------- */
const INTERP=[['nearest','Nearest (lo-fi, gritty)'],['linear','Linear'],['cubic','Cubic (Hermite)'],['sinc','Sinc (windowed, cleanest)']];
const zoneData=(z,note,vel,tuneExtra,startExtra,outSr,ker)=>coreZoneData(CTX,z,note,vel,tuneExtra,startExtra,outSr,ker);
const zoneInterp=z=>coreZoneInterp(CTX,z);
const zoneRatio=(z,note,tuneExtra)=>coreZoneRatio(CTX,z,note,tuneExtra);
function renderZone(z,note,vel,tuneExtra,startExtra){
  const ctxSr=AU.ctx.sampleRate,sm=smOf(sampleById(z.sample)||{});
  const key=[z.id,S.map.ver,note,Math.round(tuneExtra||0),Math.round(startExtra||0),z.start+z.vstart*(vel/127)>0?Math.round(vel/8):0,S.bpm,S.sig.n,S.sig.d,sm.mode==='wavetable'&&sm.wt.tag?(tagById(sm.wt.tag)||{value:0}).value.toFixed(3):''].join('|');
  let hit=RENDER_CACHE.get(key); if(hit) return hit;
  const r=zoneData(z,note,vel,tuneExtra,startExtra,ctxSr); if(!r) return null;
  const ab=AU.ctx.createBuffer(r.ch.length,r.ch[0].length,ctxSr);
  r.ch.forEach((d,c)=>ab.copyToChannel(d,c));
  hit={buf:ab,loopS:r.loop?r.loop.s/ctxSr:0,loopE:r.loop?r.loop.e/ctxSr:0,loop:!!r.loop};
  RENDER_CACHE.set(key,hit);
  if(RENDER_CACHE.size>240) RENDER_CACHE.delete(RENDER_CACHE.keys().next().value);
  return hit;
}
/* ---- voices ---- */
const SV={list:[],bus:null,rr:{},last:{},held:new Map()};
function sampBus(){
  if(SV.bus&&SV.bus.context===AU.ctx) return SV.bus;
  SV.bus=AU.ctx.createGain(); SV.bus.gain.value=2.4; SV.bus.connect(AU.master); return SV.bus;
}
const groupActive=g=>{
  const cfg=gcfg(g); if(cfg.mute) return false;
  const anySolo=S.groups.some(n=>gcfg(n).solo); if(anySolo&&!cfg.solo) return false;
  if(!S.map.follow) return true;
  const l=curList(); if(!l||!l.groups||!l.groups.length) return true;
  return l.groups.indexOf(g)>=0;
};
function matching(note,vel,release){
  const anySolo=S.zones.some(z=>z.solo);
  return S.zones.filter(z=>!z.mute&&(!anySolo||z.solo)&&BUF.has(z.sample)&&groupActive(z.group)&&
    note>=z.lo&&note<=z.hi&&vel>=z.vlo&&vel<=z.vhi&&((gcfg(z.group).mode==='release')===!!release));
}
function pickRR(zs,release){
  const out=[],byG={};
  zs.forEach(z=>{(byG[z.group]=byG[z.group]||[]).push(z);});
  Object.keys(byG).forEach(g=>{
    const cfg=gcfg(g),arr=byG[g],seqs=Array.from(new Set(arr.map(z=>z.seq))).sort((a,b)=>a-b);
    if(cfg.mode==='rrcycle'&&seqs.length>1){
      const c=SV.rr[g]=(SV.rr[g]||0); const pick=seqs[c%seqs.length]; SV.rr[g]=c+1;
      out.push.apply(out,arr.filter(z=>z.seq===pick));
    }else if((cfg.mode==='rrrandom'||cfg.mode==='rrunique')&&seqs.length>1){
      let pool=seqs; if(cfg.mode==='rrunique'&&SV.last[g]!==undefined) pool=seqs.filter(s=>s!==SV.last[g]);
      const pick=pool[Math.floor(Math.random()*pool.length)]; SV.last[g]=pick;
      out.push.apply(out,arr.filter(z=>z.seq===pick));
    }else out.push.apply(out,arr);
  });
  return out;
}
const velGain=(vel,curve)=>Math.pow(vel/127,Math.max(.1,curve)*1.0);
function startVoice(z,note,vel,fromRelease){
  const c=AU.ctx,cfg=gcfg(z.group),sm=smOf(sampleById(z.sample)||{});
  const jt=(Math.random()*2-1)*z.hum.tune,jv=(Math.random()*2-1)*z.hum.vol,js=Math.random()*z.hum.start;
  const vs=uniVoices(sm),made=[];
  vs.forEach(u=>{
    const r=renderZone(z,note,vel,jt+u.tune,js+u.start); if(!r) return;
    const src=c.createBufferSource(); src.buffer=r.buf;
    if(r.loop&&!fromRelease){src.loop=true;src.loopStart=r.loopS;src.loopEnd=r.loopE;}
    const g=c.createGain(),pan=c.createStereoPanner?c.createStereoPanner():null;
    const amp=zoneFade(z,note,vel)*velGain(vel,cfg.velcurve)*Math.pow(10,(z.vol+cfg.vol+jv)/20)*u.gain;
    const now=c.currentTime,att=Math.max(.001,z.attack/1000);
    g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(amp,now+att);
    if(pan) pan.pan.value=clamp((z.pan+cfg.pan)/100+u.pan,-1,1);
    if(u.drift>0&&src.detune){let t=now;for(let k=0;k<14;k++){t+=.6;src.detune.linearRampToValueAtTime((Math.random()*2-1)*u.drift,t);}}
    const dest=z.group==='__preview'?sampBus():fxGroupIn(z.group);src.connect(g); if(pan){g.connect(pan);pan.connect(dest);}else g.connect(dest);
    src.start();
    const v={src,g,z,note,amp,t:now,dead:false,group:z.group};
    src.onended=()=>{v.dead=true;SV.list=SV.list.filter(x=>x!==v);updVoices();};
    SV.list.push(v); made.push(v);
  });
  S.map.hot[z.id]=performance.now();
  return made;
}
function stopVoice(v,rel){
  if(v.dead) return; v.dead=true; const c=AU.ctx,now=c.currentTime,t=Math.max(.005,(rel!==undefined?rel:v.z.release)/1000);
  try{v.g.gain.cancelScheduledValues(now);v.g.gain.setValueAtTime(v.g.gain.value,now);v.g.gain.linearRampToValueAtTime(0,now+t);v.src.stop(now+t+.02);}catch(e){}
}
function sampNoteOn(note,vel){
  const zs=pickRR(matching(note,vel,false),false); if(!zs.length) return false;
  const held=[];
  zs.forEach(z=>{
    const cfg=gcfg(z.group);
    if(cfg.choke>0) SV.list.forEach(v=>{if(!v.dead&&gcfg(v.group).choke===cfg.choke&&v.z!==z)stopVoice(v,25);});
    if(cfg.voices>0){const mine=SV.list.filter(v=>!v.dead&&v.group===z.group);while(mine.length>=cfg.voices){stopVoice(mine.shift(),30);}}
    const vs=startVoice(z,note,vel); if(vs) held.push.apply(held,vs);
  });
  SV.held.set(note,{voices:(SV.held.get(note)||{voices:[]}).voices.concat(held),vel,t:AU.ctx.currentTime});
  updVoices(); return true;
}
function sampNoteOff(note){
  const h=SV.held.get(note); if(!h) return;
  SV.held.delete(note);
  h.voices.forEach(v=>{if(!v.z.oneshot)stopVoice(v);});
  const held=(AU.ctx.currentTime-h.t);
  pickRR(matching(note,h.vel,true),true).forEach(z=>{startVoice(z,note,Math.max(1,Math.round(h.vel*Math.exp(-held*.6))),true);});
  updVoices();
}
function sampPanic(){SV.list.forEach(v=>stopVoice(v,40));SV.list=[];SV.held.clear();updVoices();}
function updVoices(){const e=$('#mapVoices');if(e)e.textContent=SV.list.filter(v=>!v.dead).length+' voices · no limit';}
/* dispatchers: the sampler plays when zones exist, otherwise the little synth does */
const hasSampler=()=>S.zones.length>0&&S.zones.some(z=>BUF.has(z.sample));
function noteOn(m,vel){
  if(!ensureAudio()) return; vel=vel||100; fxNoteOn(m,vel);
  if(hasSampler()&&sampNoteOn(m,vel)) return;
  if(!hasSampler()) synthOn(m);
}
function noteOff(m){fxNoteOff();sampNoteOff(m);synthOff(m);}
