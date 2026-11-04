/* ---------- the .vsamp container ----------
   8 bytes  magic "VSAMP\0" 0x01 0x00
   u32 LE   manifest length
   u32 LE   manifest CRC32
   manifest UTF-8 JSON
   blobs    audio, images and fonts, offsets in the manifest are relative to the start of this region */
const MAGIC=[0x56,0x53,0x41,0x4d,0x50,0,1,0];
const CRCT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRCT[(c^u8[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function encodePCM(ch,bits){
  const n=ch[0].length,c=ch.length,bps=bytesPer(bits),out=new Uint8Array(n*c*bps),dv=new DataView(out.buffer);
  for(let i=0;i<n;i++)for(let k=0;k<c;k++){
    const v=clamp(ch[k][i],-1,1),o=(i*c+k)*bps;
    if(bits===16)dv.setInt16(o,Math.round(v*(v<0?32768:32767)),true);
    else if(bits===24){const q=Math.round(v*(v<0?8388608:8388607));out[o]=q&255;out[o+1]=(q>>8)&255;out[o+2]=(q>>16)&255;}
    else dv.setFloat32(o,ch[k][i],true);
  }
  return out;
}
function decodePCM(u8,chn,bits){
  const bps=bytesPer(bits),n=Math.floor(u8.length/(bps*chn)),ch=[];for(let k=0;k<chn;k++)ch.push(new Float32Array(n));
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  for(let i=0;i<n;i++)for(let k=0;k<chn;k++){
    const o=(i*chn+k)*bps;
    ch[k][i]=bits===16?dv.getInt16(o,true)/32768:bits===24?(((u8[o]|(u8[o+1]<<8)|(u8[o+2]<<16))<<8)>>8)/8388608:dv.getFloat32(o,true);
  }
  return ch;
}
async function pipeBytes(u8,Stream,fmt){
  const s=new Blob([u8]).stream().pipeThrough(new Stream(fmt));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const deflateB=async u8=>(typeof CompressionStream==='undefined')?null:pipeBytes(u8,CompressionStream,'deflate-raw');
const inflateB=u8=>pipeBytes(u8,DecompressionStream,'deflate-raw');
function dataUrlBytes(url){
  const m=/^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);if(!m)return null;
  const bin=m[2]?atob(m[3]):decodeURIComponent(m[3]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return{mime:m[1],bytes:u};
}
function Pack(){this.parts=[];this.size=0;}
Pack.prototype.add=async function(u8,opts){
  opts=opts||{};let enc='raw',data=u8;
  if(opts.compress){const d=await deflateB(u8);if(d&&d.length<u8.length*.95){data=d;enc='deflate';}}
  const e={off:this.size,len:data.length,raw:u8.length,crc:crc32(data),enc};
  this.parts.push(data);this.size+=data.length;return e;
};
function joinFile(manifestObj,pack){
  const mj=new TextEncoder().encode(JSON.stringify(manifestObj)),total=16+mj.length+pack.size,out=new Uint8Array(total),dv=new DataView(out.buffer);
  out.set(MAGIC,0);dv.setUint32(8,mj.length,true);dv.setUint32(12,crc32(mj),true);out.set(mj,16);
  let p=16+mj.length;pack.parts.forEach(d=>{out.set(d,p);p+=d.length;});return out;
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
  for(const k of ['bgImg','logoImg','iconImg']){const a=banner[k]&&S.assets[banner[k]];if(a){const d=dataUrlBytes(fullUrl(banner[k]));if(d){layers[k]={mime:d.mime,name:a.name,data:await pack.add(d.bytes,{})};}}}
  /* project images */
  const assets={};
  for(const id of Object.keys(S.assets)){if(id.indexOf('tex_')===0)continue;const d=dataUrlBytes(fullUrl(id));if(d)assets[id]={name:S.assets[id].name,w:S.assets[id].w,h:S.assets[id].h,mime:d.mime,data:await pack.add(d.bytes,{})};}
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
  const bytes=joinFile(manifest,pack);
  const report={bytes:bytes.length,ms:Math.round(performance.now()-t0),samples:smeta.length,zones:set.zones.length,baked:set.stats.baked,chunks:set.stats.chunks,step:set.stats.step,
    zonesBaked:set.stats.zonesBaked,leftLive:set.stats.skipped,unusedSkipped:dropped,sourceBytes:est.before,warn,name:L.name};
  return{bytes,report,manifest};
}
async function parseVsamp(bytes){
  const out={ok:false,errors:[],info:{}};
  if(bytes.length<16){out.errors.push('File is too short.');return out;}
  for(let i=0;i<5;i++)if(bytes[i]!==MAGIC[i]){out.errors.push('Not a .vsamp file (wrong header).');return out;}
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ml=dv.getUint32(8,true),mc=dv.getUint32(12,true);
  if(16+ml>bytes.length){out.errors.push('Manifest runs past the end of the file.');return out;}
  const mj=bytes.subarray(16,16+ml);
  if(crc32(mj)!==mc){out.errors.push('Manifest checksum does not match.');return out;}
  let m;try{m=JSON.parse(new TextDecoder().decode(mj));}catch(e){out.errors.push('Manifest is not valid JSON.');return out;}
  const base=16+ml,blob=async e=>{
    if(base+e.off+e.len>bytes.length)throw new Error('blob outside file');
    const d=bytes.subarray(base+e.off,base+e.off+e.len);if(crc32(d)!==e.crc)throw new Error('checksum');
    return e.enc==='deflate'?await inflateB(d):d;
  };
  out.manifest=m;out.blob=blob;
  const all=[];
  m.samples.forEach(s=>all.push(['audio '+s.name,s.data]));
  Object.keys(m.banner.images).forEach(k=>all.push(['banner '+k,m.banner.images[k]]));
  Object.keys(m.banner.layers||{}).forEach(k=>all.push(['layer '+k,m.banner.layers[k].data]));
  Object.keys(m.assets||{}).forEach(k=>all.push(['image '+k,m.assets[k].data]));
  Object.keys(m.fonts||{}).forEach(k=>all.push(['font '+k,m.fonts[k].data]));
  let bad=0;
  for(const a of all){try{const d=await blob(a[1]);if(d.length!==a[1].raw){bad++;out.errors.push(a[0]+': wrong size after unpacking.');}}catch(e){bad++;out.errors.push(a[0]+': '+e.message+' check failed.');}}
  const zs=new Set(m.samples.map(s=>s.id));
  m.zones.forEach(z=>{if(!zs.has(z.sample)){bad++;out.errors.push('A zone points at a missing sample.');}});
  /* decode one to prove it plays */
  if(m.samples[0]){try{const s=m.samples[0],u=await blob(s.data),ch=decodePCM(u,s.chn,s.bits);if(ch[0].length!==s.frames)out.errors.push('Decoded length differs from the manifest.');}catch(e){out.errors.push('Could not decode audio.');}}
  out.info={blobs:all.length,samples:m.samples.length,zones:m.zones.length,bytes:bytes.length};
  out.ok=out.errors.length===0;return out;
}
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
