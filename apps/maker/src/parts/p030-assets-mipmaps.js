/* ---------- assets / mipmaps ---------- */
function mipFor(id,px){
  const a=S.assets[id]; if(!a) return null;
  for(const k of a.mips){ if(k.s>=px) return k; }
  return a.mips[a.mips.length-1];
}
/* mips are sorted small to large: the last one is the full-size original */
const fullUrl=id=>{const a=S.assets[id];return a?a.mips[a.mips.length-1].url:'';};
const imgSrc=(id,px)=>{const m=mipFor(id,px);return m?m.url:'';};
function buildAsset(name,img,isSvg,dataUrl){
  const w=img.naturalWidth||256,h=img.naturalHeight||256;
  const mips=[{s:Math.max(w,h),url:dataUrl}];
  if(!isSvg){
    let src=img,cw=w,ch=h;
    while(Math.max(cw,ch)>40){
      cw=Math.max(1,Math.round(cw/2)); ch=Math.max(1,Math.round(ch/2));
      const c=document.createElement('canvas'); c.width=cw; c.height=ch;
      const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(src,0,0,cw,ch);
      mips.push({s:Math.max(cw,ch),url:c.toDataURL('image/png')}); src=c;
    }
  }
  mips.sort((a,b)=>a.s-b.s);
  return {name,w,h,mips,svg:!!isSvg};
}
function makeTexture(kind){
  const n=256,c=document.createElement('canvas'); c.width=c.height=n;
  const x=c.getContext('2d'),d=x.createImageData(n,n);
  for(let i=0;i<n*n;i++){
    let v;
    if(kind==='noise') v=Math.random()*255;
    else{const row=(i/n)|0,r=Math.sin(row*12.9898)*43758.5453,f=r-Math.floor(r);v=105+f*80+(Math.random()-.5)*26;}
    v=clamp(v,0,255); d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=v; d.data[i*4+3]=255;
  }
  x.putImageData(d,0,0); return c.toDataURL('image/png');
}
let TEX=null;
function addTexAssets(){
  if(!TEX) TEX={noise:makeTexture('noise'),brushed:makeTexture('brushed')};
  S.assets.tex_noise={name:'Noise (built-in)',w:256,h:256,mips:[{s:256,url:TEX.noise}]};
  S.assets.tex_brushed={name:'Brushed (built-in)',w:256,h:256,mips:[{s:256,url:TEX.brushed}]};
}

