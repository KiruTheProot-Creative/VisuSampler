/* ---------- save and reopen a whole project (.vmproj) ----------
   Same container as .vsamp, but it keeps everything needed to keep editing:
   full-quality audio (32-bit float, edits included), all images and fonts, the layout, tags, FX, mapping and library info. */
function bytesToDataUrl(u8,mime){
  let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
  return 'data:'+mime+';base64,'+btoa(s);
}
let PROJ_FILE=null;   /* desktop app: the file this project came from / was saved to (Save writes back to it) */
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
/* Audio is stored as plain 32-bit float: deflate only won ~8% on real recordings and made saving many times slower.
   (Older projects with deflated audio still open: every blob says how it is stored.) */
async function projectParts(){
  const pack=new Pack(),sn=snapshot(),audio={},assets={},fonts={};
  for(const s of S.samples){const b=BUF.get(s.id);if(!b)continue;const pc=pcmPart(b);audio[s.id]={sr:b.sr,chn:b.ch.length,bits:32,data:await pack.add(pc.u8,{crc:pc.crc})};}
  for(const id of Object.keys(S.assets)){
    if(id.indexOf('tex_')===0)continue;const d=dataUrlBytes(fullUrl(id));
    if(d)assets[id]={name:S.assets[id].name,svg:!!S.assets[id].svg,mime:d.mime,data:await pack.add(d.bytes,{})};
  }
  for(const fam of Object.keys(S.fonts)){const f=S.fonts[fam];if(f.buf)fonts[fam]={size:f.size,lic:f.lic,data:await pack.add(new Uint8Array(f.buf),{compress:true})};}
  const manifest={format:'visumaker-project',formatVersion:1,created:new Date().toISOString(),snapshot:sn,audio,assets,fonts};
  if(typeof insProjectWrite==='function')await insProjectWrite(manifest,pack,sn);   /* the other instruments of a library */
  return vsampParts(manifest,pack);
}
function joinParts(parts){const out=new Uint8Array(parts.reduce((n,d)=>n+d.length,0));let p=0;for(const d of parts){out.set(d,p);p+=d.length;}return out;}
let projBusy=false;
async function saveProject(saveAs){
  if(projBusy)return null;projBusy=true;
  try{
    ensureAudio();
    const parts=await projectParts(),name=(S.lib.name.trim().replace(/[^\w\-. ]+/g,'')||'project');
    const D=window.visuDesktop;
    if(D&&D.saveProject){   /* the desktop app writes the pieces one after another: no whole-file copy */
      const file=await D.saveProject(name,parts,PROJ_FILE,!!saveAs);
      if(file){PROJ_FILE=file;flash('Saved to '+file);}
      return file;
    }
    const bytes=joinParts(parts);await downloadBytes(bytes,name+'.vmproj');
    return bytes;
  }finally{projBusy=false;}
}
const loadImage=url=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('image'));im.src=url;});
async function openProject(bytes,file){
  const {manifest:m,blob}=readVsamp(bytes);
  if(m.format!=='visumaker-project')throw new Error(m.format==='vsamp'?'That is a finished library (.vsamp). Open a .vmproj project here.':'Not a VisuMaker project.');
  /* images, fonts and audio all unpack at the same time */
  const assets={},fonts={},bufs=new Map();
  await Promise.all([
    ...Object.keys(m.assets||{}).map(async id=>{const a=m.assets[id],url=bytesToDataUrl(await blob(a.data),a.mime),im=await loadImage(url);assets[id]=buildAsset(a.name,im,a.svg,url);}),
    ...Object.keys(m.fonts||{}).map(async fam=>{
      try{const buf=(await blob(m.fonts[fam].data)).slice().buffer,ff=new FontFace(fam,buf.slice(0));await ff.load();document.fonts.add(ff);fonts[fam]={size:m.fonts[fam].size,lic:m.fonts[fam].lic,buf};}catch(e){}
    }),
    ...Object.keys(m.audio||{}).map(async id=>{const a=m.audio[id],ch=decodePCM(await blob(a.data),a.chn,a.bits);bufs.set(id,{ch,sr:a.sr,peaks:peaksOf(ch,600)});
      if(a.bits===32&&a.data.enc!=='deflate')pcmKnownCrc(ch,a.data.crc);})   /* checked on reading: saving and the engine reuse it */
  ]);
  /* everything read fine: now replace the current project */
  sampPanic();previewStopAll&&previewStopAll();
  Object.keys(S.assets).forEach(k=>{if(k.indexOf('tex_')!==0)delete S.assets[k];});Object.assign(S.assets,assets);
  S.fonts=fonts;IMGC.clear();BUF.clear();bufs.forEach((v,k)=>BUF.set(k,v));
  restore(m.snapshot);
  if(typeof insProjectRead==='function')await insProjectRead(m,blob);   /* a library: its other instruments */
  let mx=uid;JSON.stringify([m.snapshot,m.instruments||null]).replace(/"[a-z]+(\d+)"/g,(_,n)=>{mx=Math.max(mx,+n+1);return'';});uid=mx;
  S.smp.sel=null;S.smp.a=S.smp.b=null;S.build.last=null;S.build.report=null;S.build.verify=null;S.prevSnap=null;
  PROJ_FILE=file||null;
  afterLoad();setView(S.view);
  flash('Opened project "'+S.lib.name+'"');
}
async function saveClick(saveAs){flash('Saving…');await nextFrame();try{await saveProject(saveAs);}catch(e){flash('Could not save: '+e.message);}}
async function openBytes(bytes,file){
  if(typeof autoD==='function'&&autoD()&&projDirty()&&!confirm('Open '+(file?file.split(/[\\/]/).pop():'this project')+'? Your unsaved changes to "'+S.lib.name+'" will be lost (the last backup stays until the next one).'))return;
  flash('Opening…');await nextFrame();try{await openProject(bytes,file);}catch(e){flash('Could not open: '+e.message);}}
async function openClick(){
  const D=window.visuDesktop;
  if(D&&D.openProject){const r=await D.openProject();if(r)await openBytes(r.bytes,r.file);return;}
  $('#fileProj').value='';$('#fileProj').click();
}
$('#projSave').addEventListener('click',e=>saveClick(e.shiftKey));
$('#projOpen').addEventListener('click',openClick);
$('#fileProj').addEventListener('change',async()=>{
  const f=$('#fileProj').files[0];if(!f)return;
  await openBytes(new Uint8Array(await f.arrayBuffer()),null);
});
/* Ctrl+S saves (to the same file in the desktop app), Ctrl+Shift+S asks where, Ctrl+O opens */
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();
  if(k==='s'){e.preventDefault();e.stopPropagation();saveClick(e.shiftKey);}
  else if(k==='o'&&!e.shiftKey){e.preventDefault();e.stopPropagation();openClick();}
},true);
