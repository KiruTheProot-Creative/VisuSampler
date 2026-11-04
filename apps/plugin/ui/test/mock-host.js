/* A stand-in for the plugin, for testing the window in a normal browser. It reads real .vsamp files with the JS core. */
import {readVsamp} from '../../../../packages/core/src/index.js';
const calls=[];const listeners=new Map();let state={volume:.8,status:{text:'No library loaded'}},libs=[],imgs={};
const emit=(ev,data)=>(listeners.get(ev)||[]).forEach(fn=>fn(data));
async function loadLibs(urls){
  for(const u of urls){
    const bytes=new Uint8Array(await (await fetch(u)).arrayBuffer()),{manifest:m,blob}=readVsamp(bytes),L=m.lib;
    const id=L.id+'~'+libs.length;
    for(const k of ['tile','wide']){const r=m.banner.images[k];if(r)imgs[id+'/'+k]=URL.createObjectURL(new Blob([await blob(r)],{type:'image/png'}));}
    libs.push({id,name:L.name+(libs.length?' '+libs.length:''),author:L.author,version:L.version,category:libs.length%2?'Keys':L.category,tags:L.tags,desc:L.desc,licence:L.licence,changelog:L.changelog,accent:L.accent,hasTile:!!imgs[id+'/tile'],hasWide:!!imgs[id+'/wide'],size:bytes.length,_m:m});
  }
}
const fns={
  getLibraries:()=>({folder:'/home/test/Documents/VisuSampler/Libraries',libs:libs.map(({_m,...x})=>x)}),
  getState:()=>state,
  loadLibrary:id=>{const L=libs.find(l=>l.id===id);if(!L)return{error:'library not found'};
    const m=L._m;state.status={text:'Loading…',loading:true,currentId:id};emit('status',state.status);
    setTimeout(()=>{state.status={text:m.zones.length+' zones ready',loading:false,currentId:id,zones:m.zones.length,groups:new Set(m.zones.map(z=>z.group)).size,
      lists:(m.project.lists||[]).map(l=>({name:l.name,bank:l.bank})),list:0,unsupported:id.endsWith('~1')?['granular']:[]};emit('status',state.status);},50);return true;},
  unload:()=>{state.status={text:'No library loaded'};return true;},
  setList:i=>{state.status.list=i;return true;},setVolume:v=>{state.volume=v;return true;},
  noteOn:(n,v)=>true,noteOff:n=>true,panic:()=>true,openFolder:()=>true,addLibrary:()=>({added:0})
};
window.__JUCE__={initialisationData:{__juce__functions:Object.keys(fns)},backend:{
  addEventListener(ev,fn){if(!listeners.has(ev))listeners.set(ev,[]);listeners.get(ev).push(fn);},
  emitEvent(ev,payload){if(ev!=='__juce__invoke')return;const {name,params,resultId}=payload;calls.push([name,...params]);
    Promise.resolve(fns[name]?fns[name](...params):undefined).then(result=>setTimeout(()=>emit('__juce__complete',{promiseId:resultId,result}),5));}
}};
window.__mock={calls,emit,libs,state};
window.__visuImageUrl=(id,k)=>imgs[id+'/'+k]||'';
await loadLibs(['../../../../examples/rompler-demo.vsamp','../../../../examples/rompler-demo.vsamp','../../../../examples/rompler-demo.vsamp']);
await import('../ui.js');
