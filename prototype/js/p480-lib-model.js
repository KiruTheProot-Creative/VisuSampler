/* ---------- library info + two-layer banner ---------- */
const uuid4=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
function defaultLib(){
  return{id:uuid4(),name:'Untitled Library',author:'',version:'1.0.0',desc:'',tags:'',category:'Keys',web:'',licence:'',changelog:'',accent:'#4f7db8',
    banner:{bgMode:'gradient',bgColor:'#2b3a52',bgColor2:'#0f1620',bgImg:null,focusX:50,focusY:50,darken:25,logoImg:null,iconImg:null,showName:true,
      scaleWide:55,scaleTile:64,scaleIcon:80,posWide:'left'},
    export:{bake:false,mode:'smart',step:3,budgetOn:false,budgetMB:400,quality:'sinc',bakeUni:true,bits:16,compress:true,includeUnused:false,includeOrig:false}};
}
Object.assign(S,{lib:defaultLib(),build:{last:null,busy:false,report:null,progress:''}});
const IMGC=new Map();
function imgOf(id){
  if(!id||!S.assets[id]) return null;
  let e=IMGC.get(id);
  if(!e){
    const im=new Image();e={im,ok:false};
    im.onload=()=>{e.ok=true;if(S.view==='export')bannerRedraw();};
    im.src=fullUrl(id);IMGC.set(id,e);
  }
  return e.ok?e.im:null;
}
const FMT={wide:{w:900,h:300},tile:{w:300,h:300},icon:{w:96,h:96}};
function drawBanner(cv,fmt,w,h,par){
  const L=S.lib,B=L.banner,ctx=cv.getContext('2d');
  cv.width=w;cv.height=h;ctx.clearRect(0,0,w,h);
  /* background layer */
  if(B.bgMode==='image'&&imgOf(B.bgImg)){
    const im=imgOf(B.bgImg),sc=Math.max(w/im.naturalWidth,h/im.naturalHeight)*(par?1.06:1);
    const dw=im.naturalWidth*sc,dh=im.naturalHeight*sc;
    let x=(w-dw)*B.focusX/100,y=(h-dh)*B.focusY/100;
    if(par){x+=par.x*w*.025;y+=par.y*h*.025;}
    ctx.drawImage(im,x,y,dw,dh);
  }else if(B.bgMode==='color'){ctx.fillStyle=B.bgColor;ctx.fillRect(0,0,w,h);}
  else{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,B.bgColor);g.addColorStop(1,B.bgColor2);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
  if(B.darken>0){ctx.fillStyle='rgba(0,0,0,'+(B.darken/100).toFixed(2)+')';ctx.fillRect(0,0,w,h);}
  /* logo layer */
  const sc=(fmt==='wide'?B.scaleWide:fmt==='tile'?B.scaleTile:B.scaleIcon)/100;
  const logoId=fmt==='icon'&&B.iconImg?B.iconImg:B.logoImg,logo=imgOf(logoId);
  const box=fmt==='wide'?{w:w*sc*.7,h:h*sc}:{w:w*sc,h:h*sc};
  const left=fmt==='wide'&&B.posWide==='left';
  const cx=left?w*.07+box.w/2:w/2,cy=h/2;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=Math.max(2,h*.03);ctx.shadowOffsetY=Math.max(1,h*.01);
  if(logo){
    const k=Math.min(box.w/logo.naturalWidth,box.h/logo.naturalHeight),dw=logo.naturalWidth*k,dh=logo.naturalHeight*k;
    ctx.drawImage(logo,cx-dw/2,cy-dh/2,dw,dh);
  }else if(B.showName){
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    const txt=fmt==='icon'?(L.name.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'?'):L.name;
    let fs=Math.min(box.h*.5,h*.34);ctx.font='700 '+fs+'px "Unbounded","Figtree",sans-serif';
    while(ctx.measureText(txt).width>box.w&&fs>8){fs-=2;ctx.font='700 '+fs+'px "Unbounded","Figtree",sans-serif';}
    ctx.textAlign=left?'left':'center';ctx.fillText(txt,left?cx-box.w/2:cx,cy);
  }
  ctx.restore();
  /* accent line */
  ctx.fillStyle=L.accent;ctx.fillRect(0,h-Math.max(2,h*.012),w,Math.max(2,h*.012));
}
function bannerRedraw(){
  if(!$('#bnWide')) return;
  drawBanner($('#bnWide'),'wide',FMT.wide.w,FMT.wide.h);drawBanner($('#bnTile'),'tile',FMT.tile.w,FMT.tile.h);drawBanner($('#bnIcon'),'icon',FMT.icon.w,FMT.icon.h);
  const ex=$('#bnEx'); if(ex) drawBanner(ex,'tile',FMT.tile.w,FMT.tile.h,EXPAR);
}
const EXPAR={x:0,y:0};
function bannerBlob(fmt,w,h){
  const c=document.createElement('canvas');drawBanner(c,fmt,w,h);
  return new Promise(res=>c.toBlob(b=>b.arrayBuffer().then(ab=>res(new Uint8Array(ab))),'image/png'));
}
