/* ---------- tags: change / audio ---------- */
function setTag(t,v){
  v=clamp(v,0,1); const n=stepCount(t);
  if(n>1) v=Math.round(v*(n-1))/(n-1); else if(t.kind!=='number') v=0;
  if(v===t.value) return;
  t.value=v;
  if(t.kind==='bank'){const lt=t.layer?tagByName('listB'):listTag();if(lt)lt.value=0;}
  onTag(t);
  if((t.kind==='bank'||t.kind==='list')&&t.layer){listChangedB();}
  else if(t.kind==='bank'||t.kind==='list') listChanged();
  fireChange(t);
}
function onTag(t){
  if(t.sys&&t.name==='page') showPage();
  S.els.forEach(el=>{
    if(el.type==='knob'&&el.tag===t.id) valKnob(el);
    else if(el.type==='fader'&&el.tag===t.id) valFader(el);
    else valDisplay(el);
  });
  applyAudio(); updateTagUI(t); fxRefreshParams();
}
function setStep(t,i){const n=stepCount(t);setTag(t,n>1?i/(n-1):0);}
function stepBy(t,d){
  const n=stepCount(t);
  if(n>1) setStep(t,(stepIdx(t)+d+n)%n); else if(t.kind==='number') setTag(t,t.value+d*.05);
}
function fireChange(t){S.els.forEach(el=>{if(el.tag===t.id&&el.rules&&el.rules.length)fireEvent(el,'change');});}
let loadT=0,loadRaf=0;
function scheduleLoad(){
  RT.load=0; clearTimeout(loadT); cancelAnimationFrame(loadRaf); refreshDisplays();
  loadT=setTimeout(()=>{
    const t0=performance.now();
    const step=now=>{
      RT.load=Math.min(1,(now-t0)/700); refreshDisplays();
      if(RT.load<1) loadRaf=requestAnimationFrame(step);
      else S.els.forEach(el=>{if(el.rules&&el.rules.length)fireEvent(el,'load');});
    };
    loadRaf=requestAnimationFrame(step);
  },150);
}
function listChanged(){
  const l=curList();
  if(l&&l.vals) Object.keys(l.vals).forEach(k=>{const t=tagByName(k);if(t&&!t.sys)setTag(t,l.vals[k]);});
  scheduleLoad();
  S.els.forEach(el=>{if(el.type==='list'&&el.rules&&el.rules.length)fireEvent(el,'change');});
}
/* layer B changed: displays update and the engine hears about it; the list's stored knob values belong to layer A */
function listChangedB(){
  refreshDisplays();if(typeof engineSendState==='function')engineSendState();if(typeof reportListB==='function')reportListB();
  S.els.forEach(el=>{if(el.type==='list'&&el.layer&&el.rules&&el.rules.length)fireEvent(el,'change');});
}
function updateTagUI(t){
  if(S.tab!=='tags') return;
  const row=$('[data-tid="'+t.id+'"]',rbody); if(!row) return;
  const tv=$('.tv',row); if(tv&&document.activeElement!==tv) tv.value=t.value;
  const tr=$('.tr',row); if(tr) tr.textContent=fmtTag(t,'number');
}
function setBpm(v){
  S.bpm=clamp(Math.round(v)||120,40,300);
  $('#bpm').value=S.bpm; const p=$('[data-p="bpm"]',rbody); if(p&&document.activeElement!==p) p.value=S.bpm;
  refreshDisplays(); fxRefreshParams();
}
function setSig(n,d){
  S.sig={n:clamp(parseInt(n,10)||4,1,32),d:[2,4,8,16].indexOf(parseInt(d,10))>=0?parseInt(d,10):4};
  syncSig(); refreshDisplays(); fxRefreshParams();
}
const AU={ctx:null,master:null,filter:null,v:new Map()};
function ensureAudio(){
  if(AU.ctx){if(AU.ctx.state==='suspended')AU.ctx.resume();return true;}
  try{
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
    const c=new AC(); AU.master=c.createGain(); AU.filter=c.createBiquadFilter(); AU.filter.type='lowpass';
    AU.filter.frequency.value=2000; AU.filter.connect(AU.master); AU.master.connect(c.destination); AU.ctx=c; applyAudio(); return true;
  }catch(e){return false;}
}
const drive=target=>S.tags.find(t=>t.target===target);
function waveType(){const w=drive('wave');if(!w)return 'sawtooth';return ['sawtooth','square','triangle','sine'][stepIdx(w)%4];}
function applyAudio(){
  if(!AU.ctx) return; const now=AU.ctx.currentTime;
  const c=drive('cutoff'); let f=2000; if(c) f=(c.kind==='number'&&c.unit==='Hz')?realOf(c):40*Math.pow(450,c.value);
  AU.filter.frequency.setTargetAtTime(clamp(f,20,20000),now,.02);
  const r=drive('resonance'); AU.filter.Q.setTargetAtTime(r?.5+r.value*16:.7,now,.02);
  const v=drive('volume'); let g=.8; if(v) g=(v.kind==='number'&&v.unit==='dB')?Math.pow(10,realOf(v)/20):v.value*v.value;
  AU.master.gain.setTargetAtTime(clamp(g,0,2)*.28,now,.02);
  const wt=waveType(); AU.v.forEach(x=>{x.o.type=wt;});
}
function synthOn(m){
  if(!ensureAudio()||AU.v.has(m)) return;
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
  o.type=waveType(); o.frequency.value=440*Math.pow(2,(m-69)/12); g.gain.value=0;
  o.connect(g); g.connect(AU.filter); o.start(); g.gain.setTargetAtTime(1,c.currentTime,.01); AU.v.set(m,{o,g});
}
function synthOff(m){
  const v=AU.v.get(m); if(!v) return; AU.v.delete(m);
  const c=AU.ctx; v.g.gain.setTargetAtTime(0,c.currentTime,.12); v.o.stop(c.currentTime+.9);
}

