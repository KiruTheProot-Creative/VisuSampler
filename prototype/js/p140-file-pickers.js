/* ---------- file pickers ---------- */
let pendingImg=null,pendingFont=null;
function pickImage(cb){pendingImg=cb;$('#fileImg').value='';$('#fileImg').click();}
$('#fileImg').addEventListener('change',()=>{
  const f=$('#fileImg').files[0]; if(!f||!pendingImg) return;
  const rd=new FileReader();
  rd.onload=()=>{
    const img=new Image();
    img.onload=()=>{const id=nid('a');S.assets[id]=buildAsset(f.name,img,/svg/.test(f.type),rd.result);const cb=pendingImg;pendingImg=null;cb(id);};
    img.onerror=()=>flash('Could not read that image');
    img.src=rd.result;
  };
  rd.readAsDataURL(f);
});
function fontLicense(buf){
  try{
    const dv=new DataView(buf),tag=dv.getUint32(0);
    if(tag===0x774F4646||tag===0x774F4632) return 'unknown';
    const n=dv.getUint16(4);
    for(let i=0;i<n;i++){
      const o=12+i*16;
      if(dv.getUint32(o)===0x4F532F32){
        const fs=dv.getUint16(dv.getUint32(o+8)+8);
        if(fs&2) return 'restricted';
        if(fs&0x100) return 'nosubset';
        return 'ok';
      }
    }
    return 'unknown';
  }catch(err){return 'unknown';}
}
function pickFont(cb){pendingFont=cb;$('#fileFont').value='';$('#fileFont').click();}
$('#fileFont').addEventListener('change',()=>{
  const f=$('#fileFont').files[0]; if(!f||!pendingFont) return;
  f.arrayBuffer().then(buf=>{
    const fam=f.name.replace(/\.[^.]+$/,'').replace(/['"\\]/g,'').slice(0,40)||'Custom font';
    const lic=fontLicense(buf);
    const ff=new FontFace(fam,buf.slice(0));
    return ff.load().then(()=>{document.fonts.add(ff);S.fonts[fam]={size:buf.byteLength,lic,buf};const cb=pendingFont;pendingFont=null;cb(fam);});
  }).catch(()=>flash('Could not load that font file'));
});

