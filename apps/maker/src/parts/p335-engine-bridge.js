/* ---------- the shared engine: the Maker plays through the same C++ engine as the VST (compiled to WebAssembly) ----------
   apps/plugin/engine is the only engine source. GitHub builds it natively for the VST and as engine.wasm for this app.
   The project is handed to the engine as an in-memory .vsamp whenever it changes; notes, knobs and lists go over the worklet port.
   Only the sample editor's previews (and a fallback if engine.wasm cannot load) still use the old JS path. */
const ENG={node:null,out:null,starting:false,failed:'',loaded:false,sig:'',pendingSig:'',timer:0,voices:0,zones:0,lastList:-2};
const ENGINE_MODES=['sampler','slicer','speedkeep','granular','wavetable'];
const engineZone=z=>{const s=sampleById(z.sample);return !!s&&ENGINE_MODES.indexOf(smOf(s).mode)>=0;};
const engineOn=()=>!!(ENG.node&&ENG.loaded);
async function engineStart(){
  if(ENG.node||ENG.starting||ENG.failed||!AU.ctx||!AU.ctx.audioWorklet) return;
  ENG.starting=true;
  try{
    const base=new URL('../../packages/engine-wasm/',location.href);
    const bytes=await (await fetch(new URL('engine.wasm',base))).arrayBuffer(),module=await WebAssembly.compile(bytes);
    await AU.ctx.audioWorklet.addModule(new URL('src/worklet.js',base).href);
    const node=new AudioWorkletNode(AU.ctx,'visu-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module}});
    const out=AU.ctx.createGain();out.gain.value=2.4;node.connect(out);out.connect(AU.master);
    node.port.onmessage=({data:m})=>{
      if(m.t==='loaded'){ENG.loaded=!m.error;ENG.zones=m.zones;if(m.error)flash('Engine could not load the project: '+m.error);ENG.lastList=-2;engineSendState();}
      else if(m.t==='voices'){ENG.voices=m.n;updVoices();}
    };
    ENG.node=node;ENG.out=out;ENG.sig='';engineSync(true);
  }catch(err){ENG.failed=String(err&&err.message||err);console.warn('engine',err);}
  ENG.starting=false;
}
/* what decides that the engine needs the project again */
function engineSig(){
  return S.map.ver+'|'+S.samples.length+'|'+JSON.stringify([S.gset,S.fx.graphs,S.lists.map(l=>[l.bank,l.groups]),S.tags.map(t=>[t.id,t.name,t.kind,t.basis,t.steps]),S.map.interp,S.bpm,S.sig]);
}
/* a light .vsamp of the current project: float audio, no compression, no banner or images */
async function engineBytes(){
  const pack=new Pack(),keep=new Set(S.zones.map(z=>z.sample).concat(fxKeep())),smeta=[];
  for(const s of S.samples){
    if(!keep.has(s.id))continue;const b=BUF.get(s.id);if(!b)continue;
    smeta.push({id:s.id,name:s.name,sr:b.sr,chn:b.ch.length,frames:b.ch[0].length,root:s.root,fine:s.fine||0,loop:s.loop||null,sm:s.sm,bits:32,data:await pack.add(encodePCM(b.ch,32),{})});
  }
  const sn=snapshot();delete sn.samples;delete sn.zones;delete sn.lib;
  sn.interp=S.map.interp;{const cl=curList();sn.currentList=cl?S.lists.indexOf(cl):-1;}
  const fxRanges={};Object.keys(FXT).forEach(k=>{fxRanges[k]={};FXT[k].params.forEach(q=>{fxRanges[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0];});});
  const zones=JSON.parse(JSON.stringify(S.zones));
  const manifest={format:'vsamp',formatVersion:1,lib:{id:'maker-live',name:S.lib.name},banner:{images:{}},project:sn,fxRanges,features:[],samples:smeta,zones};
  return writeVsamp(manifest,pack);
}
let engBusy=false;
async function engineSync(force){
  if(!ENG.node) return;
  const sig=engineSig();
  if(!force&&(sig===ENG.sig||engBusy)) return;
  engBusy=true;ENG.sig=sig;
  try{const bytes=await engineBytes();ENG.node.port.postMessage({t:'load',bytes:bytes.buffer},[bytes.buffer]);}
  catch(err){console.warn('engine sync',err);}
  engBusy=false;
}
/* knob values and the chosen list follow what the Designer shows */
const engineListIndex=()=>{if(!S.map.follow&&S.view==='sound')return -1;const cl=curList();return cl?S.lists.indexOf(cl):-1;};
function engineSendState(){
  if(!engineOn()) return;
  S.tags.forEach(t=>{if(!t.sys)ENG.node.port.postMessage({t:'tag',name:t.name,v:t.value});});
  const i=engineListIndex();
  if(i!==ENG.lastList){ENG.lastList=i;ENG.node.port.postMessage({t:'list',i});}
}
setInterval(()=>{if(AU.ctx&&!ENG.node&&!ENG.starting&&!ENG.failed)engineStart();if(ENG.node)engineSync(false);},250);
const setTagE=setTag;
setTag=function(t,v){setTagE(t,v);if(engineOn()){ENG.node.port.postMessage({t:'tag',name:t.name,v:t.value});engineSendState();}};
setInterval(()=>engineSendState(),300);
