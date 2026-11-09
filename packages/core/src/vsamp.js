import {clamp,bytesPer} from './util.js';
export const MAGIC=[0x56,0x53,0x41,0x4d,0x50,0,1,0];
export const FORMAT_VERSION=1;
const LE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
/* CRC-32 (zlib's), slicing by 8: eight table lookups per 8 bytes instead of one per byte */
const CRCT=(()=>{const t=new Int32Array(256*8);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}
  for(let n=0;n<256;n++){let c=t[n];for(let k=1;k<8;k++){c=t[c&255]^(c>>>8);t[k*256+n]=c;}}return t;})();
export function crc32(u8){
  const T=CRCT,n=u8.length;let c=-1,i=0;
  if(n>=16){
    const a=(4-(u8.byteOffset&3))&3;for(;i<a;i++)c=T[(c^u8[i])&255]^(c>>>8);
    const w=new Int32Array(u8.buffer,u8.byteOffset+i,(n-i)>>3<<1),wl=w.length;   // little-endian words (every platform the Maker runs on)
    for(let j=0;j<wl;j+=2){const x=w[j]^c,y=w[j+1];
      c=T[1792+(x&255)]^T[1536+((x>>>8)&255)]^T[1280+((x>>>16)&255)]^T[1024+(x>>>24)]^T[768+(y&255)]^T[512+((y>>>8)&255)]^T[256+((y>>>16)&255)]^T[y>>>24];}
    i+=wl<<2;
  }
  for(;i<n;i++)c=T[(c^u8[i])&255]^(c>>>8);
  return(c^-1)>>>0;
}
/** Interleaved little-endian PCM. bits: 16, 24 or 32 (float). */
export function encodePCM(ch,bits){
  const n=ch[0].length,c=ch.length,bps=bytesPer(bits),out=new Uint8Array(n*c*bps),dv=new DataView(out.buffer);
  if(bits===32&&LE){const f=new Float32Array(out.buffer);if(c===1)f.set(ch[0]);else if(c===2){const l=ch[0],r=ch[1];for(let i=0,j=0;i<n;i++,j+=2){f[j]=l[i];f[j+1]=r[i];}}else for(let k=0;k<c;k++){const d=ch[k];for(let i=0,o=k;i<n;i++,o+=c)f[o]=d[i];}return out;}
  if(bits===16&&LE){const q=new Int16Array(out.buffer);for(let k=0;k<c;k++){const d=ch[k];for(let i=0,o=k;i<n;i++,o+=c){const v=d[i],w=v>1?1:v<-1?-1:v;q[o]=Math.round(w*(w<0?32768:32767));}}return out;}
  for(let i=0;i<n;i++)for(let k=0;k<c;k++){
    const v=clamp(ch[k][i],-1,1),o=(i*c+k)*bps;
    if(bits===16)dv.setInt16(o,Math.round(v*(v<0?32768:32767)),true);
    else if(bits===24){const q=Math.round(v*(v<0?8388608:8388607));out[o]=q&255;out[o+1]=(q>>8)&255;out[o+2]=(q>>16)&255;}
    else dv.setFloat32(o,ch[k][i],true);
  }
  return out;
}
export function decodePCM(u8,chn,bits){
  const bps=bytesPer(bits),n=Math.floor(u8.length/(bps*chn)),ch=[];
  if(bits===32&&LE){   // float: copy straight out (one aligned copy, then de-interleave)
    const f=(u8.byteOffset&3)?new Float32Array(u8.slice(0,n*chn*4).buffer):new Float32Array(u8.buffer,u8.byteOffset,n*chn);
    if(chn===1)return[f.slice(0,n)];
    if(chn===2){const l=new Float32Array(n),r=new Float32Array(n);for(let i=0,j=0;i<n;i++,j+=2){l[i]=f[j];r[i]=f[j+1];}return[l,r];}
    for(let k=0;k<chn;k++){const d=new Float32Array(n);for(let i=0,o=k;i<n;i++,o+=chn)d[i]=f[o];ch.push(d);}return ch;
  }
  for(let k=0;k<chn;k++)ch.push(new Float32Array(n));
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  for(let i=0;i<n;i++)for(let k=0;k<chn;k++){
    const o=(i*chn+k)*bps;
    ch[k][i]=bits===16?dv.getInt16(o,true)/32768:bits===24?(((u8[o]|(u8[o+1]<<8)|(u8[o+2]<<16))<<8)>>8)/8388608:dv.getFloat32(o,true);
  }
  return ch;
}
async function pipe(u8,Stream,fmt){return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream(fmt))).arrayBuffer());}
export const deflate=async u8=>typeof CompressionStream==='undefined'?null:pipe(u8,CompressionStream,'deflate-raw');
export const inflate=u8=>pipe(u8,DecompressionStream,'deflate-raw');
/** Collects blobs and hands back the manifest reference for each. */
export class Pack{
  constructor(){this.parts=[];this.size=0;}
  /** crc: the CRC of u8 when the caller already knows it (only used when u8 is stored as it is) */
  async add(u8,{compress=false,crc=null}={}){
    let enc='raw',data=u8;
    if(compress){const d=await deflate(u8);if(d&&d.length<u8.length*.95){data=d;enc='deflate';}}
    const e={off:this.size,len:data.length,raw:u8.length,crc:enc==='raw'&&crc!=null?crc:crc32(data),enc};
    this.parts.push(data);this.size+=data.length;return e;
  }
}
/** Put manifest + blobs into one file. */
export function writeVsamp(manifest,pack){
  const parts=vsampParts(manifest,pack),out=new Uint8Array(parts.reduce((n,d)=>n+d.length,0));
  let p=0;for(const d of parts){out.set(d,p);p+=d.length;}
  return out;
}
/** The same file as a list of pieces to write one after another (no copy of the whole file in memory). */
export function vsampParts(manifest,pack){
  const mj=new TextEncoder().encode(JSON.stringify(manifest)),head=new Uint8Array(16+mj.length),dv=new DataView(head.buffer);
  head.set(MAGIC,0);dv.setUint32(8,mj.length,true);dv.setUint32(12,crc32(mj),true);head.set(mj,16);
  return[head,...pack.parts];
}
/** Open a file. Throws on a bad header or manifest. Returns {manifest, blob(ref)->Promise<Uint8Array>} (blob checks its CRC). */
export function readVsamp(bytes){
  if(bytes.length<16)throw new Error('File is too short.');
  for(let i=0;i<5;i++)if(bytes[i]!==MAGIC[i])throw new Error('Not a .vsamp file (wrong header).');
  if(bytes[6]>FORMAT_VERSION)throw new Error('This file was made by a newer version (format '+bytes[6]+').');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ml=dv.getUint32(8,true),mc=dv.getUint32(12,true);
  if(16+ml>bytes.length)throw new Error('Manifest runs past the end of the file.');
  const mj=bytes.subarray(16,16+ml);
  if(crc32(mj)!==mc)throw new Error('Manifest checksum does not match.');
  let manifest;try{manifest=JSON.parse(new TextDecoder().decode(mj));}catch(e){throw new Error('Manifest is not valid JSON.');}
  const base=16+ml;
  const blob=async e=>{
    if(base+e.off+e.len>bytes.length)throw new Error('blob outside file');
    const d=bytes.subarray(base+e.off,base+e.off+e.len);
    if(crc32(d)!==e.crc)throw new Error('checksum mismatch');
    return e.enc==='deflate'?inflate(d):d;
  };
  return{manifest,blob};
}
/** A sample's audio bytes: one blob (data), or chunks that each unpack on their own (chunks), so players can stream. */
export async function sampleAudio(r,s){
  if(!s.chunks)return r.blob(s.data);
  const parts=[];let n=0;for(const c of s.chunks){const d=await r.blob(c);parts.push(d);n+=d.length;}
  const out=new Uint8Array(n);let o=0;for(const d of parts){out.set(d,o);o+=d.length;}return out;
}
/** Every blob reference in a manifest, with a readable label. */
export function listBlobs(m){
  const all=[];
  m.samples.forEach(s=>{if(s.chunks)s.chunks.forEach((c,i)=>all.push(['audio '+s.name+' part '+(i+1),c]));else all.push(['audio '+s.name,s.data]);});
  Object.keys(m.banner.images||{}).forEach(k=>all.push(['banner '+k,m.banner.images[k]]));
  Object.keys(m.banner.layers||{}).forEach(k=>all.push(['layer '+k,m.banner.layers[k].data]));
  Object.keys(m.assets||{}).forEach(k=>all.push(['image '+k,m.assets[k].data]));
  Object.keys(m.fonts||{}).forEach(k=>all.push(['font '+k,m.fonts[k].data]));
  return all;
}
/** Full check: header, manifest CRC, every blob CRC and size, zone->sample links, and one decoded sample. Never throws. */
export async function verifyVsamp(bytes){
  const out={ok:false,errors:[],info:{}};
  let r;try{r=readVsamp(bytes);}catch(e){out.errors.push(e.message);return out;}
  const m=r.manifest,all=listBlobs(m);
  for(const a of all){try{const d=await r.blob(a[1]);if(d.length!==a[1].raw)out.errors.push(a[0]+': wrong size after unpacking.');}catch(e){out.errors.push(a[0]+': '+e.message+'.');}}
  const ids=new Set(m.samples.map(s=>s.id));
  m.zones.forEach(z=>{if(!ids.has(z.sample))out.errors.push('A zone points at a missing sample.');});
  if(m.samples[0]){try{const s=m.samples[0],ch=decodePCM(await sampleAudio(r,s),s.chn,s.bits);if(ch[0].length!==s.frames)out.errors.push('Decoded length differs from the manifest.');}catch(e){out.errors.push('Could not decode audio.');}}
  out.info={blobs:all.length,samples:m.samples.length,zones:m.zones.length,bytes:bytes.length};
  out.manifest=m;out.ok=out.errors.length===0;return out;
}

/* ---------- libraries (.vslib): several instruments in one file ----------
   The same container as an instrument (.vsins, formerly .vsamp); its manifest says format "vslib" and lists banks of
   instruments. Each instrument is a complete .vsins file stored as one blob, so a player can open just that one
   (and stream from it) without reading the others. */
export const VSLIB_FORMAT_VERSION=1;
/**
 * @param {{lib:object, images?:{wide?:Uint8Array,tile?:Uint8Array,icon?:Uint8Array},
 *          banks:{name:string, instruments:{id:string,name:string,desc?:string,bytes:Uint8Array}[]}[]}} o
 * @returns {Promise<Uint8Array[]>} the file in pieces (write them one after another)
 */
export async function vslibParts(o){
  const pack=new Pack(),images={},ids=new Set();
  for(const k of ['wide','tile','icon'])if(o.images&&o.images[k])images[k]=await pack.add(o.images[k],{});
  const banks=[];
  for(const b of o.banks||[]){
    const ins=[];
    for(const i of b.instruments||[]){
      if(!i.id||ids.has(i.id))throw new Error('Every instrument needs its own id ('+i.id+').');ids.add(i.id);
      const head=readVsamp(i.bytes).manifest;   // checks it is a whole instrument file
      if(head.format!=='vsamp')throw new Error('"'+i.name+'" is not an instrument file.');
      ins.push({id:i.id,name:i.name||head.lib&&head.lib.name||'Untitled',desc:i.desc||'',data:await pack.add(i.bytes,{})});
    }
    banks.push({name:b.name||'',instruments:ins});
  }
  if(!ids.size)throw new Error('A library needs at least one instrument.');
  const manifest={format:'vslib',formatVersion:VSLIB_FORMAT_VERSION,lib:o.lib||{},banner:{images},banks};
  return vsampParts(manifest,pack);
}
export async function writeVslib(o){
  const parts=await vslibParts(o),out=new Uint8Array(parts.reduce((n,d)=>n+d.length,0));
  let p=0;for(const d of parts){out.set(d,p);p+=d.length;}return out;
}
/** A .vslib's instruments: [{id,name,desc,bank,bytes}] (bytes: the instrument's .vsins, checked) */
export async function readVslib(bytes){
  const r=readVsamp(bytes);
  if(r.manifest.format!=='vslib')throw new Error('Not a library (.vslib) file.');
  const out=[];
  for(const b of r.manifest.banks||[])for(const i of b.instruments||[])out.push({id:i.id,name:i.name,desc:i.desc||'',bank:b.name||'',bytes:await r.blob(i.data)});
  return{manifest:r.manifest,instruments:out};
}
