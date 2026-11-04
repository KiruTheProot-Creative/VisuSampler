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
async function buildVsamp(progress){
  const t0=performance.now(),L=S.lib,o=L.export,say=progress||(()=>{});
  say('Planning…');await tick();
  const set=await buildExportSet(o,say);
  const pack=new Pack(),warn=[];
  /* audio */
  const smeta=[];let i=0;
  for(const it of set.samples){
    i++;if(i%3===0){say('Packing audio '+i+' / '+set.samples.length);await tick();}
    const m=it.meta,bits=o.bits,e=await pack.add(encodePCM(it.ch,bits),{compress:o.compress});
    smeta.push({id:m.id,name:m.name,sr:m.sr,chn:it.ch.length,frames:it.ch[0].length,root:m.root,fine:m.fine||0,loop:m.loop||null,baked:!!m.baked,sm:m.baked?undefined:m.sm,bits,data:e});
  }
  /* images */
  say('Banner…');await tick();
  const banner=JSON.parse(JSON.stringify(L.banner)),bi={};
  const img=async(key,u8)=>{bi[key]=await pack.add(u8,{});};
  await img('wide',await bannerBlob('wide',1200,400));await img('tile',await bannerBlob('tile',512,512));await img('icon',await bannerBlob('icon',128,128));
  const layers={};
  for(const k of ['bgImg','logoImg','iconImg']){const a=banner[k]&&S.assets[banner[k]];if(a){const d=dataUrlBytes(a.mips[0].url);if(d){layers[k]={mime:d.mime,name:a.name,data:await pack.add(d.bytes,{})};}}}
  /* project images */
  const assets={};
  for(const id of Object.keys(S.assets)){if(id.indexOf('tex_')===0)continue;const d=dataUrlBytes(S.assets[id].mips[0].url);if(d)assets[id]={name:S.assets[id].name,w:S.assets[id].w,h:S.assets[id].h,mime:d.mime,data:await pack.add(d.bytes,{})};}
  const fonts={};
  for(const fam of Object.keys(S.fonts)){
    const f=S.fonts[fam];
    if(f.lic==='restricted'){warn.push('Font "'+fam+'" forbids embedding and was left out.');continue;}
    if(!f.buf){warn.push('Font "'+fam+'" could not be packed.');continue;}
    fonts[fam]={lic:f.lic,data:await pack.add(new Uint8Array(f.buf),{compress:true})};
  }
  const sn=snapshot();delete sn.samples;delete sn.zones;delete sn.lib;
  const est=estimate(o),dropped=set.stats.unusedSkipped;
  const lib={id:L.id,name:L.name,author:L.author,version:L.version,desc:L.desc,tags:L.tags,category:L.category,web:L.web,licence:L.licence,changelog:L.changelog,accent:L.accent};
  delete banner.bgImg;delete banner.logoImg;delete banner.iconImg;
  const manifest={format:'vsamp',formatVersion:1,created:new Date().toISOString(),app:'VisuMaker prototype 4',lib,
    banner:{settings:banner,images:bi,layers},
    project:sn,assets,fonts,samples:smeta,zones:set.zones,
    bake:{enabled:o.bake,mode:o.mode,step:set.stats.step,quality:o.quality,unison:o.bakeUni,keptOriginals:o.includeOrig,chunks:set.stats.chunks,zonesBaked:set.stats.zonesBaked,zonesLeftLive:set.stats.skipped},
    export:{bits:o.bits,compress:o.compress}};
  say('Writing file…');await tick();
  const bytes=writeVsamp(manifest,pack);
  const report={bytes:bytes.length,ms:Math.round(performance.now()-t0),samples:smeta.length,zones:set.zones.length,baked:set.stats.baked,chunks:set.stats.chunks,step:set.stats.step,
    zonesBaked:set.stats.zonesBaked,leftLive:set.stats.skipped,unusedSkipped:dropped,sourceBytes:est.before,warn,name:L.name};
  return{bytes,report,manifest};
}
const parseVsamp=bytes=>verifyVsamp(bytes);
async function downloadBytes(u8,name){
  /* the artifact viewer only allows a few extensions, so there the file is offered as name.vsamp.zip (rename it to .vsamp) */
  let d=null;try{d=window.claude&&await window.claude.use('downloads');}catch(e){}
  if(d){
    try{await d.save({filename:name+'.zip',data:new Blob([u8])});flash('Saved as '+name+'.zip. Rename it to '+name+' (it is not really a zip).');}
    catch(e){if(e&&e.code!=='declined')flash('Could not save: '+(e.message||e.code));}
    return;
  }
  const b=new Blob([u8],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}
