import {zoneData,uniVoices,smOf,fadeCurve,clamp} from '../../../packages/core/src/index.js';
const dB=x=>Math.pow(10,x/20);
/** Plays an opened library with the Web Audio API. Zones are rendered by the core at the device rate and cached. */
export class Engine{
  constructor(){this.ctx=null;this.lib=null;this.cache=new Map();this.voices=new Map();this.rr=new Map();this.master=null;}
  ensure(){
    if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.8;
      this.comp=this.ctx.createDynamicsCompressor();this.master.connect(this.comp).connect(this.ctx.destination);}
    if(this.ctx.state==='suspended')this.ctx.resume();
  }
  load(lib){this.panic();this.lib=lib;this.cache.clear();this.rr.clear();}
  set volume(v){if(this.master)this.master.gain.value=v;}
  zoneGain(z,note,vel){
    let g=1;
    if(z.fadeLo>0&&note<z.lo+z.fadeLo)g*=fadeCurve((note-z.lo+.5)/z.fadeLo,z.curve);
    if(z.fadeHi>0&&note>z.hi-z.fadeHi)g*=fadeCurve((z.hi-note+.5)/z.fadeHi,z.curve);
    if(z.vfadeLo>0&&vel<z.vlo+z.vfadeLo)g*=fadeCurve((vel-z.vlo+.5)/z.vfadeLo,z.curve);
    if(z.vfadeHi>0&&vel>z.vhi-z.vfadeHi)g*=fadeCurve((z.vhi-vel+.5)/z.vfadeHi,z.curve);
    return g;
  }
  matching(note,vel,release){
    const L=this.lib,ctx=L.ctx,anySolo=L.groups.some(g=>ctx.group(g).solo);
    const hit=L.zones.filter(z=>!z.mute&&note>=z.lo&&note<=z.hi&&vel>=z.vlo&&vel<=z.vhi&&(ctx.group(z.group).mode==='release')===!!release
      &&!ctx.group(z.group).mute&&(!anySolo||ctx.group(z.group).solo));
    /* round robin: one zone per group per hit */
    const byGroup=new Map();hit.forEach(z=>{(byGroup.get(z.group)||byGroup.set(z.group,[]).get(z.group)).push(z);});
    const out=[];
    byGroup.forEach((zs,gname)=>{
      const mode=ctx.group(gname).mode;
      if(mode==='rrcycle'||mode==='rrrandom'||mode==='rrunique'){
        const seqs=[...new Set(zs.map(z=>z.seq||0))].sort((a,b)=>a-b);
        let pick;
        if(mode==='rrcycle'){const n=(this.rr.get(gname)||0);pick=seqs[n%seqs.length];this.rr.set(gname,n+1);}
        else{const last=this.rr.get(gname);let c=seqs.filter(s=>s!==last);if(!c.length)c=seqs;pick=c[Math.floor(Math.random()*c.length)];this.rr.set(gname,pick);}
        zs.filter(z=>(z.seq||0)===pick).forEach(z=>out.push(z));
      }else zs.forEach(z=>out.push(z));
    });
    return out;
  }
  render(z,note,vel,u){
    const sr=this.ctx.sampleRate,velBucket=z.vstart?Math.round(vel/8):0,key=[z.id,note,Math.round(u.tune),Math.round(u.start),velBucket].join('|');
    let hit=this.cache.get(key);if(hit)return hit;
    const r=zoneData(this.lib.ctx,z,note,vel,u.tune,u.start,sr);if(!r)return null;
    const ab=this.ctx.createBuffer(r.ch.length,r.ch[0].length,sr);r.ch.forEach((d,c)=>ab.copyToChannel(d,c));
    hit={buf:ab,loop:r.loop&&{s:r.loop.s/sr,e:r.loop.e/sr}};this.cache.set(key,hit);
    if(this.cache.size>400)this.cache.delete(this.cache.keys().next().value);
    return hit;
  }
  start(z,note,vel,release){
    const c=this.ctx,g=this.lib.ctx.group(z.group),smp=this.lib.ctx.sample(z.sample),sm=smOf(smp),vs=uniVoices(sm),now=c.currentTime,made=[];
    const curve=g.velcurve||1,vg=Math.pow(vel/127,curve),amp=dB((z.vol||0)+(g.vol||0))*vg*this.zoneGain(z,note,vel);
    const att=(z.attack||0)/1000;
    vs.forEach(u=>{
      const r=this.render(z,note,vel,u);if(!r)return;
      const src=c.createBufferSource();src.buffer=r.buf;
      if(r.loop&&!z.oneshot){src.loop=true;src.loopStart=r.loop.s;src.loopEnd=r.loop.e;}
      else if(r.loop){src.loop=true;src.loopStart=r.loop.s;src.loopEnd=r.loop.e;}
      const gn=c.createGain();gn.gain.setValueAtTime(att>0?0:1,now);if(att>0)gn.gain.linearRampToValueAtTime(1,now+att);
      const pn=c.createStereoPanner?c.createStereoPanner():null;
      if(pn)pn.pan.value=clamp((z.pan||0)/100+(g.pan||0)/100+u.pan,-1,1);
      const lv=c.createGain();lv.gain.value=amp*u.gain;
      src.connect(gn);gn.connect(lv);(pn?lv.connect(pn).connect(this.master):lv.connect(this.master));
      src.start(now);made.push({src,gn,rel:Math.max(.01,(z.release==null?80:z.release)/1000),oneshot:!!z.oneshot&&!r.loop});
    });
    return made;
  }
  stopVoices(vs,fast){
    const now=this.ctx.currentTime;
    vs.forEach(v=>{
      const t=fast?.03:v.rel;v.gn.gain.cancelScheduledValues(now);v.gn.gain.setValueAtTime(v.gn.gain.value,now);v.gn.gain.linearRampToValueAtTime(0,now+t);
      try{v.src.stop(now+t+.02);}catch(e){}
    });
  }
  noteOn(note,vel){
    if(!this.lib)return;this.ensure();vel=clamp(Math.round(vel),1,127);
    this.noteOff(note,true);
    const zs=this.matching(note,vel,false),all=[];
    zs.forEach(z=>{
      const g=this.lib.ctx.group(z.group);
      if(g.choke){for(const [k,list] of this.voices){list.forEach(e=>{if(e.group===z.group&&e.choke){this.stopVoices(e.v,true);}});}}
      const v=this.start(z,note,vel);if(v&&v.length)all.push({v,group:z.group,choke:g.choke,oneshot:v.every(x=>x.oneshot)});
    });
    if(all.length)this.voices.set(note,all);
  }
  noteOff(note,silent){
    const list=this.voices.get(note);
    if(list){list.forEach(e=>{if(!e.oneshot)this.stopVoices(e.v,silent===true);});this.voices.delete(note);}
    if(silent===true||!this.lib)return;
    this.matching(note,100,true).forEach(z=>{const v=this.start(z,note,100);if(v)setTimeout(()=>this.stopVoices(v,false),4000);});
  }
  panic(){for(const [,list] of this.voices)list.forEach(e=>this.stopVoices(e.v,true));this.voices.clear();}
  get active(){let n=0;this.voices.forEach(l=>l.forEach(e=>n+=e.v.length));return n;}
}
