const STREAM_CHUNK=32768;   /* frames per audio chunk in exported libraries */
/* ---------- the .vsamp container ----------
   8 bytes  magic "VSAMP\0" 0x01 0x00
   u32 LE   manifest length
   u32 LE   manifest CRC32
   manifest UTF-8 JSON
   blobs    audio, images and fonts, offsets in the manifest are relative to the start of this region */
function dataUrlBytes(url){
  const m=/^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);if(!m)return null;
  const bin=m[2]?atob(m[3]):decodeURIComponent(m[3]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return{mime:m[1],bytes:u};
}
/* what this library uses; the player warns about anything it cannot play yet */
function libraryFeatures(set){
  const f=new Set(),add=x=>f.add(x);
  S.samples.forEach(s=>{const sm=smOf(s);if(S.zones.some(z=>z.sample===s.id)){add(sm.mode);if(sm.uni.on)add('unison');}});
  set.zones.forEach(z=>{const g=gcfg(z.group);if(z.loop&&z.loop.on){add('loop');if(z.loop.pp)add('pingpong');}if(z.rev)add('reverse');if(z.vstart)add('velstart');
    if(z.fadeLo||z.fadeHi||z.vfadeLo||z.vfadeHi)add('crossfade');if(z.hum&&(z.hum.tune||z.hum.vol||z.hum.start))add('humanize');
    if(/^rr/.test(g.mode))add('rr');if(g.mode==='release')add('release');if(g.choke)add('choke');if(g.env&&g.env.on)add('envelope');if(g.links&&Object.keys(g.links).length)add('grouplinks');if((g.vfilter&&g.vfilter.on)||(g.vlfo&&g.vlfo.on))add('vfilter');if(g.voices)add('voicelimit');});if(layerBOn())add('layers');if(patchModeOn())add('grouppatches');if(set.zones.some(z=>z.trig==='release'))add('releasetrigger');if(S.groups.some(g=>S.gset[g]&&S.gset[g].play&&S.gset[g].play.mode))add('groupmono');
  if(S.lists.length)add('lists');if(S.els.length)add('ui');
  Object.values(S.fx.graphs).forEach(g=>g.nodes.forEach(n=>{if(FXT[n.type]&&FXT[n.type].kind!=='io')add('fx:'+n.type);}));
  return [...f].sort();
}
/* opt.instrument: {id,name,desc} when the project is a library: the file gets the instrument's own name and id
   (library id + instrument id). opt.onlyUsed: pack only the images and fonts this instrument uses. */
async function buildVsamp(progress,opt){
  opt=opt||{};const t0=performance.now(),L=S.lib,o=L.export,say=progress||(()=>{});
  say('Planning…');await tick();
  const set=await buildExportSet(o,say);
  const pack=new Pack(),warn=[];
  /* audio */
  const smeta=[];let i=0;
  for(const it of set.samples){
    i++;if(i%3===0){say('Packing audio '+i+' / '+set.samples.length);await tick();}
    /* audio in chunks that unpack on their own: VisuPlayer keeps only the start of a sample in memory and streams the rest */
    const m=it.meta,bits=o.bits,n=it.ch[0].length,chunks=[];
    for(let a=0;a<n;a+=STREAM_CHUNK)chunks.push(await pack.add(encodePCM(it.ch.map(d=>d.subarray(a,Math.min(n,a+STREAM_CHUNK))),bits),{compress:o.compress}));
    smeta.push({id:m.id,name:m.name,sr:m.sr,chn:it.ch.length,frames:n,root:m.root,fine:m.fine||0,loop:m.loop||null,baked:!!m.baked,sm:m.baked?undefined:m.sm,bits,chunkFrames:STREAM_CHUNK,chunks});
  }
  /* images */
  say('Banner…');await tick();
  const banner=JSON.parse(JSON.stringify(L.banner)),bi={};
  const img=async(key,u8)=>{bi[key]=await pack.add(u8,{});};
  await img('wide',await bannerBlob('wide',1200,400));await img('tile',await bannerBlob('tile',512,512));await img('icon',await bannerBlob('icon',128,128));
  const layers={};
  for(const k of ['bgImg','logoImg','iconImg']){const a=banner[k]&&S.assets[banner[k]];if(a){const d=dataUrlBytes(fullUrl(banner[k]));if(d){layers[k]={mime:d.mime,name:a.name,data:await pack.add(d.bytes,{})};}}}
  /* project images */
  const assets={},usedIn=opt.onlyUsed?JSON.stringify(snapshot()):null;
  for(const id of Object.keys(S.assets)){if(id.indexOf('tex_')===0)continue;if(usedIn&&usedIn.indexOf('"'+id+'"')<0&&!Object.values(L.banner||{}).includes(id))continue;const d=dataUrlBytes(fullUrl(id));if(d)assets[id]={name:S.assets[id].name,w:S.assets[id].w,h:S.assets[id].h,mime:d.mime,data:await pack.add(d.bytes,{})};}
  const fonts={};
  for(const fam of Object.keys(S.fonts)){
    const f=S.fonts[fam];
    if(usedIn&&usedIn.indexOf(fam)<0)continue;   /* a library's instrument: only the fonts it uses */
    if(f.lic==='restricted'){warn.push('Font "'+fam+'" forbids embedding and was left out.');continue;}
    if(!f.buf){warn.push('Font "'+fam+'" could not be packed.');continue;}
    fonts[fam]={lic:f.lic,data:await pack.add(new Uint8Array(f.buf),{compress:true})};
  }
  const sn=snapshot();delete sn.samples;delete sn.zones;delete sn.lib;
  sn.interp=S.map.interp;{const cl=curList();sn.currentList=cl?S.lists.indexOf(cl):-1;const cb=curListB();sn.currentListB=cb?S.lists.indexOf(cb):-1;sn.currentPatch=patchIdx(0);sn.currentPatchB=patchIdx(1);if(sn.play)sn.play.patchMode=patchModeOn()?'group':'list';}
  if(S.els.some(e=>e.type==='graph'&&e.kind==='wave')){sn.graphPeaks={};S.groups.forEach(g=>{const p=groupPeaks(g,200);if(p)sn.graphPeaks[g]=Array.from(p,v=>Math.round(v*1000)/1000);});}   /* waveform graphs in the player */
  /* parameter ranges of every FX module, so the player can apply knobs and modulation exactly like the Maker */
  const fxRanges={};Object.keys(FXT).forEach(k=>{const d=FXT[k];fxRanges[k]={};d.params.forEach(q=>{fxRanges[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0,q.log?1:0,q.unit==='Hz'?1:0];});});
  const est=estimate(o),dropped=set.stats.unusedSkipped;
  const lib={id:L.id,name:L.name,author:L.author,version:L.version,desc:L.desc,tags:L.tags,category:L.category,web:L.web,licence:L.licence,changelog:L.changelog,accent:L.accent};
  if(opt.instrument){lib.id=L.id+'-'+opt.instrument.id;lib.name=opt.instrument.name;if(opt.instrument.desc)lib.desc=opt.instrument.desc;lib.library=L.name;}
  delete banner.bgImg;delete banner.logoImg;delete banner.iconImg;
  const manifest={format:'vsamp',formatVersion:1,created:new Date().toISOString(),app:'VisuMaker prototype 4',lib,
    banner:{settings:banner,images:bi,layers},
    project:sn,fxRanges,features:libraryFeatures(set),assets,fonts,samples:smeta,zones:set.zones,
    bake:{enabled:o.bake,mode:o.mode,step:set.stats.step,quality:o.quality,unison:o.bakeUni,keptOriginals:o.includeOrig,chunks:set.stats.chunks,zonesBaked:set.stats.zonesBaked,zonesLeftLive:set.stats.skipped},
    export:{bits:o.bits,compress:o.compress}};
  say('Writing file…');await tick();
  const bytes=writeVsamp(manifest,pack);
  const report={bytes:bytes.length,ms:Math.round(performance.now()-t0),samples:smeta.length,zones:set.zones.length,baked:set.stats.baked,chunks:set.stats.chunks,step:set.stats.step,
    zonesBaked:set.stats.zonesBaked,leftLive:set.stats.skipped,unusedSkipped:dropped,sourceBytes:est.before,warn,name:lib.name,kind:'vsins'};
  return{bytes,report,manifest};
}
/* The whole project as a library (.vslib): every instrument is built like a single export and stored inside. */
async function buildLibrary(progress){
  const say=progress||(()=>{}),t0=performance.now(),L=S.lib,start=INS.cur,banks=[],warn=[];let samples=0,zones=0;
  try{
    for(let k=0;k<INS.list.length;k++){
      const i=INS.list[k];
      if(i.id!==INS.cur)insVisit(i.id);
      const r=await buildVsamp(t=>say(i.name+' ('+(k+1)+' / '+INS.list.length+'): '+t),{instrument:{id:i.id,name:i.name,desc:i.desc},onlyUsed:true});
      samples+=r.report.samples;zones+=r.report.zones;r.report.warn.forEach(w=>warn.push(i.name+': '+w));
      let b=banks.find(x=>x.name===i.bank);if(!b){b={name:i.bank,instruments:[]};banks.push(b);}
      b.instruments.push({id:i.id,name:i.name,desc:i.desc,bytes:r.bytes});
    }
  }finally{if(INS.cur!==start)insVisit(start);}
  say('Banner and writing the library…');await tick();
  const images={wide:await bannerBlob('wide',1200,400),tile:await bannerBlob('tile',512,512),icon:await bannerBlob('icon',128,128)};
  const lib={id:L.id,name:L.name,author:L.author,version:L.version,desc:L.desc,tags:L.tags,category:L.category,web:L.web,licence:L.licence,changelog:L.changelog,accent:L.accent};
  const bytes=await writeVslib({lib,images,banks});
  const report={bytes:bytes.length,ms:Math.round(performance.now()-t0),samples,zones,instruments:INS.list.length,banks:banks.length,warn,name:L.name,kind:'vslib',chunks:0,unusedSkipped:0,leftLive:0};
  return{bytes,report};
}
const parseVsamp=bytes=>verifyVsamp(bytes);
let LAST_DL=null;
async function downloadBytes(u8,name){
  LAST_DL={name,bytes:u8};
  /* the artifact viewer only allows a few extensions, so there the file is offered as name.vsamp.zip (rename it to .vsamp) */
  let d=null;try{d=window.claude&&await window.claude.use('downloads');}catch(e){}
  if(d){
    try{await d.save({filename:name+'.zip',data:new Blob([u8])});flash('Saved as '+name+'.zip. Rename it to '+name+' (it is not really a zip).');}
    catch(e){if(e&&e.code!=='declined')flash('Could not save: '+(e.message||e.code));}
    return;
  }
  const b=new Blob([u8],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}
