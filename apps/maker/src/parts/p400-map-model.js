/* ---------- mapper: model ---------- */
Object.assign(S,{samples:[],zones:[],gset:{},
  map:{zoom:13,sx:0,sel:[],group:null,snap:true,editAll:false,follow:true,vel:0,interp:'cubic',ver:1,hot:{},marq:null}});
const BUF=new Map(); /* sample id -> {ch:[Float32Array...],sr,peaks} */
const NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=n=>NN[((n%12)+12)%12]+(Math.floor(n/12)-2);
const isBlack=n=>[1,3,6,8,10].indexOf(n%12)>=0;
function parseNote(str){
  const m=/(^|[^A-Za-z])([A-Ga-g])([#b]?)(-?\d)(?!\d)/.exec(str); if(!m) return null;
  let n=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[m[2].toUpperCase()]+(m[3]==='#'?1:m[3]==='b'?-1:0);
  const v=(parseInt(m[4],10)+2)*12+n; return v>=0&&v<=127?v:null;
}
const GCOLORS=['#e5707e','#e5a35c','#d8c95a','#87c76a','#4fc3a6','#58a9e0','#8489e8','#b27be0','#e07bb8','#9aa4b0'];
const PREVG={mode:'normal',choke:0,vol:0,pan:0,tune:0,voices:0,interp:'inherit',velcurve:1,mute:false,solo:false,color:'#999'};
function gcfg(name){
  if(name==='__preview') return PREVG;
  if(!S.gset[name]){
    const i=Math.max(0,S.groups.indexOf(name));
    S.gset[name]={mode:'normal',choke:0,vol:0,pan:0,tune:0,voices:0,interp:'inherit',velcurve:1,mute:false,solo:false,color:GCOLORS[i%GCOLORS.length]};
  }
  return S.gset[name];
}
const zoneById=id=>S.zones.find(z=>z.id===id)||null;
const sampleById=id=>S.samples.find(s=>s.id===id)||null;
const selZones=()=>S.map.sel.map(zoneById).filter(Boolean);
function touchMap(){S.map.ver++;RENDER_CACHE.clear();}
const RENDER_CACHE=new Map();
function mkZone(o){
  return Object.assign({id:nid('z'),sample:null,group:S.map.group||S.groups[0]||'Group 1',lo:48,hi:60,vlo:0,vhi:127,root:60,tune:0,vol:0,pan:0,
    start:0,end:0,vstart:0,rev:false,keytrack:true,oneshot:false,trig:'start',attack:2,release:150,
    fadeLo:0,fadeHi:0,vfadeLo:0,vfadeHi:0,curve:'power',interp:'inherit',seq:1,mute:false,solo:false,hum:{tune:0,vol:0,start:0},
    loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},o||{});
}
function addZoneFor(sampleId,lo,hi,o){
  const s=sampleById(sampleId); if(!s) return null;
  const z=mkZone(Object.assign({sample:sampleId,lo,hi,root:s.root!=null?s.root:clamp(Math.round((lo+hi)/2),0,127),tune:s.fine||0,
    loop:{on:!!s.loop,s:s.loop?s.loop.s:0,e:s.loop?s.loop.e:s.frames,xf:s.loop?s.loop.xf:0,xcurve:'power',pp:false}},o||{}));
  if(!z.loop.e) z.loop.e=s.frames;
  S.zones.push(z); touchMap(); return z;
}
function dupZone(z){const c=JSON.parse(JSON.stringify(z));c.id=nid('z');S.zones.push(c);touchMap();return c;}
function delZones(ids){
  S.zones=S.zones.filter(z=>ids.indexOf(z.id)<0); S.map.sel=S.map.sel.filter(i=>ids.indexOf(i)<0); touchMap();
}
function peaksOf(ch,n){
  const out=new Float32Array(n*2),len=ch[0].length,step=len/n;
  for(let i=0;i<n;i++){
    let mn=1,mx=-1; const a=Math.floor(i*step),b=Math.max(a+1,Math.floor((i+1)*step));
    for(let c=0;c<ch.length;c++){const d=ch[c];for(let j=a;j<b&&j<len;j+=Math.max(1,(b-a)>64?Math.floor((b-a)/64):1)){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v;}}
    out[i*2]=mn;out[i*2+1]=mx;
  }
  return out;
}
/* naive autocorrelation pitch finder: returns {midi,cents} or null */
function detectPitch(id){
  const b=BUF.get(id); if(!b) return null;
  const d=b.ch[0],sr=b.sr,start=Math.floor(Math.min(d.length*.05,sr*.1)),N=Math.min(4096*2,d.length-start-1);
  if(N<2048) return null;
  const minLag=Math.floor(sr/2000),maxLag=Math.min(Math.floor(sr/25),N>>1);
  let best=0,bl=0;
  for(let lag=minLag;lag<maxLag;lag++){
    let s=0,e1=0,e2=0;
    for(let i=0;i<N-lag;i+=2){const a=d[start+i],c=d[start+i+lag];s+=a*c;e1+=a*a;e2+=c*c;}
    const r=s/Math.sqrt(e1*e2+1e-9); if(r>best){best=r;bl=lag;}
  }
  if(best<.6||!bl) return null;
  const f=sr/bl,m=69+12*Math.log2(f/440),mi=Math.round(m);
  return{midi:mi,cents:Math.round((m-mi)*100),conf:best};
}
function addBuffer(name,ch,sr){
  const id=nid('s'),frames=ch[0].length;
  BUF.set(id,{ch,sr,peaks:peaksOf(ch,600)});
  const guess=parseNote(name);
  const s={id,name,sr,frames,dur:frames/sr,chn:ch.length,root:guess,fine:0,loop:null};
  if(guess==null){const p=detectPitch(id);if(p){s.root=p.midi;s.fine=-p.cents;s.detected=true;}}
  if(s.root==null) s.root=60;
  S.samples.push(s); return s;
}
function importFiles(files,drop){
  ensureAudio(); if(!AU.ctx){flash('Audio is not available in this browser');return Promise.resolve([]);}
  const jobs=Array.from(files).filter(f=>/^audio\//.test(f.type)||/\.(wav|flac|ogg|mp3|aif|aiff|m4a)$/i.test(f.name)).map(f=>
    f.arrayBuffer().then(ab=>AU.ctx.decodeAudioData(ab)).then(buf=>{
      const ch=[];for(let c=0;c<Math.min(2,buf.numberOfChannels);c++)ch.push(new Float32Array(buf.getChannelData(c)));
      return addBuffer(f.name.replace(/\.[^.]+$/,''),ch,buf.sampleRate);
    }).catch(()=>{flash('Could not decode '+f.name);return null;}));
  return Promise.all(jobs).then(r=>r.filter(Boolean));
}
function resetMapper(){
  S.samples=[];S.zones=[];S.gset={};RENDER_CACHE.clear();
  Object.assign(S.map,{sel:[],group:null,sx:0,hot:{},marq:null});
}
/* zone gain from key/velocity fades */
const fadeCurve=(t,c)=>{t=clamp(t,0,1);return c==='linear'?t:c==='s'?t*t*(3-2*t):Math.sin(t*Math.PI/2);};
function zoneFade(z,note,vel){
  let g=1;
  if(z.fadeLo>0&&note<z.lo+z.fadeLo) g*=fadeCurve((note-z.lo+.5)/z.fadeLo,z.curve);
  if(z.fadeHi>0&&note>z.hi-z.fadeHi) g*=fadeCurve((z.hi-note+.5)/z.fadeHi,z.curve);
  if(z.vfadeLo>0&&vel<z.vlo+z.vfadeLo) g*=fadeCurve((vel-z.vlo+.5)/z.vfadeLo,z.curve);
  if(z.vfadeHi>0&&vel>z.vhi-z.vfadeHi) g*=fadeCurve((z.vhi-vel+.5)/z.vfadeHi,z.curve);
  return g;
}
/* overlap check: same group, same sequence, ranges overlap, and not a crossfade */
function zoneConflicts(){
  const bad=new Set();
  for(let i=0;i<S.zones.length;i++)for(let j=i+1;j<S.zones.length;j++){
    const a=S.zones[i],b=S.zones[j];
    if(a.group!==b.group||a.seq!==b.seq) continue;
    const ko=Math.min(a.hi,b.hi)-Math.max(a.lo,b.lo)+1,vo=Math.min(a.vhi,b.vhi)-Math.max(a.vlo,b.vlo)+1;
    if(ko<=0||vo<=0) continue;
    const fadeA=a.fadeLo+a.fadeHi+a.vfadeLo+a.vfadeHi,fadeB=b.fadeLo+b.fadeHi+b.vfadeLo+b.vfadeHi;
    if(fadeA>0||fadeB>0) continue;
    if(gcfg(a.group).mode!=='normal'&&gcfg(a.group).mode!=='release') continue;
    bad.add(a.id);bad.add(b.id);
  }
  return bad;
}
