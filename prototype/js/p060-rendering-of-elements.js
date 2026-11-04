/* ---------- rendering of elements ---------- */
function panelCss(el){
  const {lx,ly}=lightVec(),sh=[];
  if(el.shadow) sh.push(f1(-lx*el.shadowDist)+'px '+f1(-ly*el.shadowDist)+'px '+el.shadowBlur+'px rgba(0,0,0,.5)');
  if(el.bevel){
    const d=el.bevelDir==='out'?1:-1,b=el.bevelSize;
    sh.push('inset '+f1(-lx*b*d)+'px '+f1(-ly*b*d)+'px '+b+'px rgba(255,255,255,.3)');
    sh.push('inset '+f1(lx*b*d)+'px '+f1(ly*b*d)+'px '+b+'px rgba(0,0,0,.45)');
  }
  return 'background:'+el.fill+';border-radius:'+(el.round?el.radius:0)+'px;box-shadow:'+(sh.join(',')||'none')+';isolation:isolate;';
}
function panelHTML(el){
  const a=el.mat&&S.assets[el.mat]; if(!a) return '';
  const tile=el.matMode==='tile';
  const px=Math.ceil((tile?Math.max(a.w,a.h)*el.matScale:Math.max(el.w,el.h))*S.z*dpr());
  const size=tile?(a.w*el.matScale)+'px '+(a.h*el.matScale)+'px':'100% 100%';
  return '<div style="background-image:url(\''+imgSrc(el.mat,px)+'\');background-size:'+size+';background-repeat:'+(tile?'repeat':'no-repeat')+';mix-blend-mode:'+el.matBlend+';opacity:'+el.matOpacity+';filter:grayscale(1);border-radius:inherit"></div>';
}
function knobHTML(el){
  const t=tagById(el.tag),v=t?t.value:.5,side=Math.min(el.w,el.h),g=knobGeom(el,v),px=Math.ceil(side*S.z*dpr());
  const sw=el.ringWidth*100,bi=el.ringMode==='none'?4:Math.round(sw+4);
  let h='<div class="kn" style="width:'+side+'px;height:'+side+'px">';
  if(el.lower&&S.assets[el.lower]) h+='<img class="ly" draggable="false" alt="" src="'+imgSrc(el.lower,px)+'">';
  else h+='<div class="pc" style="left:'+bi+'%;top:'+bi+'%;right:'+bi+'%;bottom:'+bi+'%;background:radial-gradient(circle at 34% 28%,color-mix(in srgb,'+el.baseColor+' 72%,#fff),'+el.baseColor+' 55%,color-mix(in srgb,'+el.baseColor+' 60%,#000));box-shadow:0 '+(side*.035)+'px '+(side*.07)+'px rgba(0,0,0,.55)"></div>';
  if(el.ringMode==='auto'){
    const r=50-sw/2;
    h+='<svg class="ly" viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-width="'+sw+'"><path d="'+arc(el.start,el.end,r)+'" stroke="'+el.ringColor+'" opacity=".2"/><path class="rf" d="'+arc(g.lo,g.hi,r)+'" stroke="'+el.ringColor+'"/></svg>';
  }else if(el.ringMode==='image'&&el.ringImg&&S.assets[el.ringImg]){
    const m=ringMask(el,g);
    h+='<div class="ly ringimg" style="background:url(\''+imgSrc(el.ringImg,px)+'\') center/contain no-repeat;-webkit-mask-image:'+m+';mask-image:'+m+'"></div>';
  }
  if(el.upper&&S.assets[el.upper]){
    h+='<img class="ly cap" draggable="false" alt="" src="'+imgSrc(el.upper,px)+'" style="transform:rotate('+g.ang+'deg);transform-origin:'+(el.px*100)+'% '+(el.py*100)+'%">';
  }else{
    const ci=el.lower?20:bi+8;
    h+='<div class="pc cap" style="left:'+ci+'%;top:'+ci+'%;right:'+ci+'%;bottom:'+ci+'%;transform:rotate('+g.ang+'deg);background:radial-gradient(circle at 36% 30%,color-mix(in srgb,'+el.capColor+' 80%,#fff),'+el.capColor+' 60%,color-mix(in srgb,'+el.capColor+' 70%,#000))"><i class="ptr '+el.ptrStyle+'" style="background:'+el.ptrColor+'"></i></div>';
  }
  return h+'</div>';
}
function faderHTML(el){
  const t=tagById(el.tag),v=t?t.value:.5,{vert,L,C,hl}=faderMetrics(el),px=Math.ceil(Math.max(el.w,el.h)*S.z*dpr());
  const pos=(vert?1-v:v)*(L-hl);
  let h='<div class="fd '+(vert?'v':'h')+'" style="width:100%;height:100%">';
  if(el.lower&&S.assets[el.lower]) h+='<img class="fly" draggable="false" alt="" src="'+imgSrc(el.lower,px)+'">';
  else{
    const tw=Math.max(4,C*.26),off=(C-tw)/2;
    h+=vert
      ?'<div class="trk" style="left:'+off+'px;width:'+tw+'px;top:'+hl/2+'px;bottom:'+hl/2+'px;background:'+el.trackColor+'"></div>'
      :'<div class="trk" style="top:'+off+'px;height:'+tw+'px;left:'+hl/2+'px;right:'+hl/2+'px;background:'+el.trackColor+'"></div>';
    if(el.fill) h+=vert
      ?'<div class="fl" style="left:'+off+'px;width:'+tw+'px;bottom:'+hl/2+'px;height:'+v*(L-hl)+'px;background:'+el.fillColor+'"></div>'
      :'<div class="fl" style="top:'+off+'px;height:'+tw+'px;left:'+hl/2+'px;width:'+v*(L-hl)+'px;background:'+el.fillColor+'"></div>';
  }
  const place=vert?'left:0;width:100%;top:'+pos+'px;height:'+hl+'px':'top:0;height:100%;left:'+pos+'px;width:'+hl+'px';
  if(el.upper&&S.assets[el.upper]) h+='<img class="hdl" draggable="false" alt="" src="'+imgSrc(el.upper,px)+'" style="'+place+'">';
  else h+='<div class="hdl proc" style="'+place+';background:linear-gradient('+(vert?'180deg':'90deg')+',color-mix(in srgb,'+el.handleColor+' 70%,#fff),'+el.handleColor+',color-mix(in srgb,'+el.handleColor+' 65%,#000))"><i></i></div>';
  return h+'</div>';
}
function textCss(el){
  const {lx,ly}=lightVec(),s=Math.max(1,Math.round(el.size/26)),c=el.color,f=[];
  let css="font-family:'"+el.font+"',Figtree,sans-serif;font-size:"+el.size+'px;font-weight:'+el.weight+';text-align:'+el.align+';letter-spacing:'+el.spacing+'px;color:'+c+';white-space:pre-wrap;line-height:1.15;';
  let shad='';
  if(el.bevel==='outer-raised') shad=f1(lx*s)+'px '+f1(ly*s)+'px 0 rgba(255,255,255,.35),'+f1(-lx*s)+'px '+f1(-ly*s)+'px 0 rgba(0,0,0,.55)';
  else if(el.bevel==='outer-sunken') shad=f1(-lx*s)+'px '+f1(-ly*s)+'px 0 rgba(255,255,255,.3),'+f1(lx*s)+'px '+f1(ly*s)+'px 0 rgba(0,0,0,.6)';
  else if(el.bevel==='inner-raised'||el.bevel==='inner-sunken'){
    const ang=S.light+(el.bevel==='inner-sunken'?180:0);
    css+='background:linear-gradient('+ang+'deg,color-mix(in srgb,'+c+' 45%,#000),'+c+' 50%,color-mix(in srgb,'+c+' 55%,#fff));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;';
  }
  if(shad) css+='text-shadow:'+shad+';';
  if(el.shadow) f.push('drop-shadow('+f1(-lx*3)+'px '+f1(-ly*3)+'px 3px rgba(0,0,0,.6))');
  if(el.glow) f.push('drop-shadow(0 0 7px '+el.glowColor+')');
  if(f.length) css+='filter:'+f.join(' ')+';';
  return css;
}
function renderEl(el){
  const n=nodes.get(el.id); if(!n) return;
  let css='left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;z-index:'+(S.els.indexOf(el)+1)+';';
  if(el.type==='panel'){n.style.cssText=css+panelCss(el);n.innerHTML=panelHTML(el);}
  else if(el.type==='knob'){n.style.cssText=css;n.innerHTML=knobHTML(el);}
  else if(el.type==='fader'){n.style.cssText=css;n.innerHTML=faderHTML(el);}
  else if(el.type==='button'){const st=btnState(el);n.style.cssText=css+btnFace(el,st);n.innerHTML=buttonHTML(el,st);}
  else if(el.type==='lcd'){n.style.cssText=css+lcdCss(el);n.innerHTML=lcdHTML(el);}
  else if(el.type==='list'){n.style.cssText=css+lcdCss(el);n.innerHTML=listHTML(el);}
  else{
    const j={left:'flex-start',center:'center',right:'flex-end'}[el.align]||'center';
    n.style.cssText=css+'justify-content:'+j+';';
    n.innerHTML='<div class="tx" style="'+textCss(el)+'">'+expand(el.text)+'</div>';
  }
}
function valKnob(el){
  const n=nodes.get(el.id); if(!n) return;
  const t=tagById(el.tag),g=knobGeom(el,t?t.value:.5);
  const cap=n.querySelector('.cap'); if(cap) cap.style.transform='rotate('+g.ang+'deg)';
  const rf=n.querySelector('.rf'); if(rf) rf.setAttribute('d',arc(g.lo,g.hi,50-el.ringWidth*50));
  const ri=n.querySelector('.ringimg'); if(ri){const m=ringMask(el,g);ri.style.webkitMaskImage=m;ri.style.maskImage=m;}
}
function valFader(el){
  const n=nodes.get(el.id); if(!n) return;
  const t=tagById(el.tag),v=t?t.value:.5,{vert,L,hl}=faderMetrics(el),pos=(vert?1-v:v)*(L-hl);
  const hd=n.querySelector('.hdl'); if(hd){if(vert) hd.style.top=pos+'px'; else hd.style.left=pos+'px';}
  const fl=n.querySelector('.fl'); if(fl){if(vert) fl.style.height=v*(L-hl)+'px'; else fl.style.width=v*(L-hl)+'px';}
}
function valText(el){const n=nodes.get(el.id);if(!n)return;const tx=n.querySelector('.tx');if(tx)tx.innerHTML=expand(el.text);}
const rerenderAll=()=>S.els.forEach(renderEl);
function mountAll(){
  canvas.innerHTML=''; nodes.clear();
  S.els.forEach(e=>{
    const n=document.createElement('div'); n.className='el '+e.type; n.dataset.id=e.id;
    canvas.appendChild(n); nodes.set(e.id,n); renderEl(e);
  });
  placeSel();
}

