import {readVsamp,decodePCM} from '../../../packages/core/src/index.js';
const DEF_GROUP={mode:'normal',choke:0,vol:0,pan:0,tune:0,voices:0,interp:'inherit',velcurve:1,mute:false,solo:false};
/** Open a .vsamp: decode audio, banner images and fonts, and build the engine context the core needs. */
/** Quick open for the browser: header info and banner images only. Call lib.load() before playing to decode the audio. */
export async function openLibrary(bytes){
  const {manifest:m,blob}=readVsamp(bytes);
  if(m.format!=='vsamp')throw new Error(m.format==='visumaker-project'?'This is a VisuMaker project. Export it as a .vsamp library first.':'Not a library file.');
  const url=async ref=>ref?URL.createObjectURL(new Blob([await blob(ref)],{type:'image/png'})):null;
  const images={wide:await url(m.banner.images.wide),tile:await url(m.banner.images.tile),icon:await url(m.banner.images.icon)};
  const gset=(m.project&&m.project.gset)||{},proj=m.project||{};
  const L={manifest:m,lib:m.lib,images,ctx:null,zones:m.zones,bytes:bytes.length,raw:bytes,groups:[...new Set(m.zones.map(z=>z.group))],bake:m.bake,
    async load(){
      if(L.ctx)return L;
      const buffers=new Map(),metas=new Map();
      for(const s of m.samples){
        buffers.set(s.id,{ch:decodePCM(await blob(s.data),s.chn,s.bits),sr:s.sr});
        metas.set(s.id,{id:s.id,name:s.name,sr:s.sr,chn:s.chn,frames:s.frames,root:s.root,fine:s.fine,loop:s.loop,sm:s.sm});
      }
      for(const fam of Object.keys(m.fonts||{})){try{const ff=new FontFace(fam,await blob(m.fonts[fam].data));await ff.load();document.fonts.add(ff);}catch(e){}}
      L.ctx={buffer:id=>buffers.get(id),sample:id=>metas.get(id),group:n=>gset[n]||(gset[n]=Object.assign({},DEF_GROUP)),defaultInterp:'linear',bpm:proj.bpm||120,sig:proj.sig||{n:4,d:4},tagValue:()=>null};
      return L;
    }};
  return L;
}
