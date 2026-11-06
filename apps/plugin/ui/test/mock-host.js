/* A stand-in for the plugin, for testing the window in a normal browser. It reads real .vsamp files with the JS core. */
import {readVsamp} from '../../../../packages/core/src/index.js';
const calls=[];const listeners=new Map();let state={volume:.8,status:{text:'No library loaded'}},libs=[],imgs={};
const emit=(ev,data)=>(listeners.get(ev)||[]).forEach(fn=>fn(data));
async function loadLibs(urls){
  for(const u of urls){
    const bytes=new Uint8Array(await (await fetch(new URL(u,import.meta.url))).arrayBuffer()),{manifest:m,blob}=readVsamp(bytes),L=m.lib;
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
  getInterface:()=>{const L=libs.find(l=>l.id===state.status.currentId);return L?{manifest:JSON.stringify(L._m),id:L.id,list:0,tags:state.tags||{}}:null;},
  unload:()=>{state.status={text:'No library loaded'};return true;},
  setList:i=>{state.status.list=i;return true;},setListB:i=>{state.status.listB=i;return true;},scopeOn:on=>{state.scope=on;return true;},setPatch:(l,i)=>{state.status['patch'+(l?'B':'')]=i;return true;},setVolume:v=>{state.volume=v;return true;},
  getPresets:()=>({names:Object.keys(state.presets||{}).sort(),current:state.preset||''}),
  savePreset:n=>{(state.presets=state.presets||{})[n]={values:Object.assign({},state.tags||{}),list:state.status.list||0};state.preset=n;return{names:Object.keys(state.presets).sort(),current:n,ok:true};},
  loadPreset:n=>{const p=n?(state.presets||{})[n]:{values:{cutoff:.5},list:0};if(!p)return null;state.preset=n;state.tags=Object.assign({},p.values);return{values:p.values,list:p.list,name:n};},
  deletePreset:n=>{if(state.presets)delete state.presets[n];if(state.preset===n)state.preset='';return{names:Object.keys(state.presets||{}).sort(),current:state.preset||''};},
  getMappings:()=>Object.assign({},state.maps||{}),
  midiLearn:n=>{state.maps=state.maps||{};state.maps.__learning=n;return Object.assign({},state.maps);},
  midiCancel:()=>{if(state.maps)delete state.maps.__learning;return Object.assign({},state.maps||{});},
  midiForget:n=>{if(state.maps&&state.maps[n])state.maps[n].cc=null;return Object.assign({},state.maps||{});},
  noteOn:(n,v)=>true,noteOff:n=>true,panic:()=>true,setTag:(n,v)=>{(state.tags=state.tags||{})[n]=v;return true;},openFolder:()=>true,addLibrary:()=>({added:0})
};
window.__JUCE__={initialisationData:{__juce__functions:Object.keys(fns)},backend:{
  addEventListener(ev,fn){if(!listeners.has(ev))listeners.set(ev,[]);listeners.get(ev).push(fn);},
  emitEvent(ev,payload){if(ev!=='__juce__invoke')return;const {name,params,resultId}=payload;calls.push([name,...params]);
    Promise.resolve(fns[name]?fns[name](...params):undefined).then(result=>setTimeout(()=>emit('__juce__complete',{promiseId:resultId,result}),5));}
}};
window.__mock={calls,emit,libs,state};
window.__visuImageUrl=(id,k)=>imgs[id+'/'+k]||'';
window.__visuAssetUrl=(kind,key)=>'about:blank#'+kind+'/'+key;
await loadLibs(['../../../../examples/rompler-demo.vsamp','../../../../examples/rompler-demo.vsamp','../../../../examples/rompler-demo.vsamp']);
await import('../ui.js');
