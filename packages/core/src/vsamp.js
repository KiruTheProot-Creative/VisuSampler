import {clamp,bytesPer} from './util.js';
export const MAGIC=[0x56,0x53,0x41,0x4d,0x50,0,1,0];
export const FORMAT_VERSION=1;
const CRCT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRCT[(c^u8[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
/** Interleaved little-endian PCM. bits: 16, 24 or 32 (float). */
export function encodePCM(ch,bits){
  const n=ch[0].length,c=ch.length,bps=bytesPer(bits),out=new Uint8Array(n*c*bps),dv=new DataView(out.buffer);
  for(let i=0;i<n;i++)for(let k=0;k<c;k++){
    const v=clamp(ch[k][i],-1,1),o=(i*c+k)*bps;
    if(bits===16)dv.setInt16(o,Math.round(v*(v<0?32768:32767)),true);
    else if(bits===24){const q=Math.round(v*(v<0?8388608:8388607));out[o]=q&255;out[o+1]=(q>>8)&255;out[o+2]=(q>>16)&255;}
    else dv.setFloat32(o,ch[k][i],true);
  }
  return out;
}
export function decodePCM(u8,chn,bits){
  const bps=bytesPer(bits),n=Math.floor(u8.length/(bps*chn)),ch=[];for(let k=0;k<chn;k++)ch.push(new Float32Array(n));
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
  async add(u8,{compress=false}={}){
    let enc='raw',data=u8;
    if(compress){const d=await deflate(u8);if(d&&d.length<u8.length*.95){data=d;enc='deflate';}}
    const e={off:this.size,len:data.length,raw:u8.length,crc:crc32(data),enc};
    this.parts.push(data);this.size+=data.length;return e;
  }
}
/** Put manifest + blobs into one file. */
export function writeVsamp(manifest,pack){
  const mj=new TextEncoder().encode(JSON.stringify(manifest)),out=new Uint8Array(16+mj.length+pack.size),dv=new DataView(out.buffer);
  out.set(MAGIC,0);dv.setUint32(8,mj.length,true);dv.setUint32(12,crc32(mj),true);out.set(mj,16);
  let p=16+mj.length;for(const d of pack.parts){out.set(d,p);p+=d.length;}
  return out;
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
/** Every blob reference in a manifest, with a readable label. */
export function listBlobs(m){
  const all=[];
  m.samples.forEach(s=>all.push(['audio '+s.name,s.data]));
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
  if(m.samples[0]){try{const s=m.samples[0],ch=decodePCM(await r.blob(s.data),s.chn,s.bits);if(ch[0].length!==s.frames)out.errors.push('Decoded length differs from the manifest.');}catch(e){out.errors.push('Could not decode audio.');}}
  out.info={blobs:all.length,samples:m.samples.length,zones:m.zones.length,bytes:bytes.length};
  out.manifest=m;out.ok=out.errors.length===0;return out;
}
