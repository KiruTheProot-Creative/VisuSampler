/* ---------- save and reopen a whole project (.vmproj) ----------
   Same container as .vsamp, but it keeps everything needed to keep editing:
   full-quality audio (32-bit float, edits included), all images and fonts, the layout, tags, FX, mapping and library info. */
function bytesToDataUrl(u8,mime){
  let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
  return 'data:'+mime+';base64,'+btoa(s);
}
async function saveProject(){
  ensureAudio();
  const pack=new Pack(),sn=snapshot(),audio={},assets={},fonts={};
  for(const s of S.samples){const b=BUF.get(s.id);if(!b)continue;audio[s.id]={sr:b.sr,chn:b.ch.length,bits:32,data:await pack.add(encodePCM(b.ch,32),{compress:true})};}
  for(const id of Object.keys(S.assets)){
    if(id.indexOf('tex_')===0)continue;const d=dataUrlBytes(fullUrl(id));
    if(d)assets[id]={name:S.assets[id].name,svg:!!S.assets[id].svg,mime:d.mime,data:await pack.add(d.bytes,{})};
  }
  for(const fam of Object.keys(S.fonts)){const f=S.fonts[fam];if(f.buf)fonts[fam]={size:f.size,lic:f.lic,data:await pack.add(new Uint8Array(f.buf),{compress:true})};}
  const manifest={format:'visumaker-project',formatVersion:1,created:new Date().toISOString(),snapshot:sn,audio,assets,fonts};
  const bytes=writeVsamp(manifest,pack),name=(S.lib.name.trim().replace(/[^\w\-. ]+/g,'')||'project');
  await downloadBytes(bytes,name+'.vmproj');
  return bytes;
}
const loadImage=url=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('image'));im.src=url;});
async function openProject(bytes){
  const {manifest:m,blob}=readVsamp(bytes);
  if(m.format!=='visumaker-project')throw new Error(m.format==='vsamp'?'That is a finished library (.vsamp). Open a .vmproj project here.':'Not a VisuMaker project.');
  const assets={};
  for(const id of Object.keys(m.assets||{})){
    const a=m.assets[id],u8=await blob(a.data),url=bytesToDataUrl(u8,a.mime),im=await loadImage(url);
    assets[id]=buildAsset(a.name,im,a.svg,url);
  }
  const fonts={};
  for(const fam of Object.keys(m.fonts||{})){
    try{const buf=(await blob(m.fonts[fam].data)).slice().buffer,ff=new FontFace(fam,buf.slice(0));await ff.load();document.fonts.add(ff);fonts[fam]={size:m.fonts[fam].size,lic:m.fonts[fam].lic,buf};}catch(e){}
  }
  const bufs=new Map();
  for(const id of Object.keys(m.audio||{})){const a=m.audio[id],ch=decodePCM(await blob(a.data),a.chn,a.bits);bufs.set(id,{ch,sr:a.sr,peaks:peaksOf(ch,600)});}
  /* everything read fine: now replace the current project */
  sampPanic();previewStopAll&&previewStopAll();
  Object.keys(S.assets).forEach(k=>{if(k.indexOf('tex_')!==0)delete S.assets[k];});Object.assign(S.assets,assets);
  S.fonts=fonts;IMGC.clear();BUF.clear();bufs.forEach((v,k)=>BUF.set(k,v));
  restore(m.snapshot);
  let mx=uid;JSON.stringify(m.snapshot).replace(/"[a-z]+(\d+)"/g,(_,n)=>{mx=Math.max(mx,+n+1);return'';});uid=mx;
  S.smp.sel=null;S.smp.a=S.smp.b=null;S.build.last=null;S.build.report=null;S.build.verify=null;S.prevSnap=null;
  afterLoad();setView(S.view);
  flash('Opened project "'+S.lib.name+'"');
}
$('#projSave').addEventListener('click',()=>saveProject().catch(e=>flash('Could not save: '+e.message)));
$('#projOpen').addEventListener('click',()=>{$('#fileProj').value='';$('#fileProj').click();});
$('#fileProj').addEventListener('change',async()=>{
  const f=$('#fileProj').files[0];if(!f)return;
  try{await openProject(new Uint8Array(await f.arrayBuffer()));}catch(e){flash('Could not open: '+e.message);}
});
