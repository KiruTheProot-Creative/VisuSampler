/* ---------- buttons, LCD, list selector ---------- */
const mixc=(a,b,p)=>'color-mix(in srgb,'+b+' '+p+'%,'+a+')';
function btnOn(el){
  const t=tagById(el.tag); if(!t) return false;
  if(el.mode==='toggle') return t.value>.5;
  if(el.mode==='radio') return stepIdx(t)===el.value;
  return false;
}
function btnState(el){
  if(S.mode==='design'&&el.preview&&el.preview!=='auto') return el.preview;
  if(RT.down===el.id) return 'down';
  if(btnOn(el)) return 'on';
  if(RT.hover===el.id) return 'hover';
  return 'normal';
}
function btnFace(el,st){
  const {lx,ly}=lightVec(),b=el.bevelSize,inward=(st==='down'||st==='on'),d=inward?-1:1;
  let c=el.color;
  if(el.auto){
    if(st==='hover') c=mixc(c,'#ffffff',el.hover);
    else if(st==='down') c=mixc(c,'#000000',el.press);
    else if(st==='on') c=mixc(c,el.ledColor,14);
  }
  const sh=[];
  if(!inward) sh.push(f1(-lx*b)+'px '+f1(-ly*b)+'px '+(b*2)+'px rgba(0,0,0,.5)');
  else sh.push('0 0 1px rgba(0,0,0,.55)');
  sh.push('inset '+f1(-lx*b*d)+'px '+f1(-ly*b*d)+'px '+b+'px rgba(255,255,255,.38)');
  sh.push('inset '+f1(lx*b*d)+'px '+f1(ly*b*d)+'px '+b+'px rgba(0,0,0,.5)');
  const bg=inward?c:'linear-gradient(180deg,'+mixc(c,'#ffffff',9)+','+c+')';
  return 'background:'+bg+';border-radius:'+el.radius+'px;box-shadow:'+sh.join(',')+';';
}
function buttonHTML(el,st){
  const {lx,ly}=lightVec(),tr=(st==='down'&&el.auto)?el.travel:0;
  let h='<span class="bl" style="font-family:\''+el.font+'\',Figtree,sans-serif;font-size:'+el.size+'px;font-weight:'+el.weight+';color:'+el.textColor+';transform:translate('+f1(-lx*tr)+'px,'+f1(-ly*tr)+'px)">'+expand(el.label)+'</span>';
  if(el.led){
    const lit=st==='on';
    h+='<i class="led" style="background:'+(lit?el.ledColor:'#3a1c1c')+';box-shadow:'+(lit?'0 0 8px 2px '+el.ledColor:'inset 0 1px 2px rgba(0,0,0,.6)')+'"></i>';
  }
  return h;
}
function lcdCss(el){
  const {lx,ly}=lightVec(),scr=el.screen!==false;
  const sh=scr?'box-shadow:inset '+f1(-lx*4)+'px '+f1(-ly*4)+'px 8px rgba(0,0,0,.55),inset '+f1(lx*2)+'px '+f1(ly*2)+'px 3px rgba(255,255,255,.12),'+f1(lx)+'px '+f1(ly)+'px 0 rgba(255,255,255,.28);'
    :(el.bevel===false?'':'box-shadow:inset '+f1(-lx*2)+'px '+f1(-ly*2)+'px 2px rgba(255,255,255,.08),inset '+f1(lx*2)+'px '+f1(ly*2)+'px 3px rgba(0,0,0,.35);');
  return fillCss(el,'bg')+'border-radius:'+el.radius+'px;'+sh+'overflow:hidden;';
}
function lcdOverlay(el,cell){
  let h='';if(el.screen===false)return h;
  if(el.grid) h+='<div class="ov" style="background-image:linear-gradient(to right,rgba(0,0,0,'+el.gridAmt+') 1px,transparent 1px),linear-gradient(to bottom,rgba(0,0,0,'+el.gridAmt+') 1px,transparent 1px);background-size:'+cell+'px '+cell+'px"></div>';
  if(el.scan) h+='<div class="ov" style="background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)"></div>';
  return h;
}
function lcdHTML(el){
  const cell=Math.max(2,Math.round(el.size/9));
  const j={left:'flex-start',center:'center',right:'flex-end'}[el.align]||'flex-start';
  return '<div class="lt" style="justify-content:'+j+';padding:0 '+el.pad+'px;font-family:\''+el.font+'\',monospace;font-size:'+el.size+'px;color:'+el.fg+';text-align:'+el.align+';'+(el.glow?'text-shadow:0 0 '+el.glow+'px '+el.fg+';':'')+'"><span>'+expand(el.text)+'</span></div>'+lcdOverlay(el,cell);
}
function listHTML(el){
  const bl=listsInBank(),idx=listIdx(),rows=Math.max(1,el.rows),rh=(el.h-el.pad*2)/rows,fs=el.size||Math.max(8,Math.floor(rh*.8));
  const off=clamp(idx-Math.floor(rows/2),0,Math.max(0,bl.length-rows));
  const letter=(S.banks[bankIdx()]||{letter:'?'}).letter;
  let h='<div class="ls" style="padding:'+el.pad+'px;font-family:\''+el.font+'\',monospace;font-size:'+fs+'px;color:'+el.fg+';'+(el.glow?'text-shadow:0 0 '+el.glow+'px '+el.fg+';':'')+'">';
  if(!bl.length) h+='<div class="lrow" style="height:'+rh+'px;justify-content:center;opacity:.7">- '+letter+' EMPTY -</div>';
  else for(let r=0;r<rows;r++){
    const i=off+r,l=bl[i];
    if(!l){h+='<div class="lrow" style="height:'+rh+'px"></div>';continue;}
    const on=i===idx; let st='height:'+rh+'px;';
    if(on&&el.selStyle==='invert') st+='background:'+el.fg+';color:'+el.bg+';';
    else if(on&&el.selStyle==='box') st+='box-shadow:inset 0 0 0 1px '+el.fg+';';
    const arrow=el.selStyle==='arrow'?(on?'▶ ':'   '):'';
    h+='<div class="lrow" data-i="'+i+'" style="'+st+'">'+arrow+(el.numbers?letter+pad2(i+1)+' ':'')+esc(l.name)+'</div>';
  }
  return h+'</div>'+lcdOverlay(el,Math.max(2,Math.round(fs/9)));
}
/* ---- dropdown: shows the chosen step of its tag; opens a menu in Test mode and in the player ---- */
function ddSteps(el){const t=tagById(el.tag);if(!t||t.kind==='number')return{t,steps:[],i:-1};const steps=stepsOf(t);return{t,steps,i:stepIdx(t)};}
function dropdownCss(el){
  const {lx,ly}=lightVec(),sh=el.bevel===false?'':'box-shadow:inset '+f1(-lx*2)+'px '+f1(-ly*2)+'px 2px rgba(255,255,255,.1),inset '+f1(lx*2)+'px '+f1(ly*2)+'px 3px rgba(0,0,0,.4),'+f1(-lx*2)+'px '+f1(-ly*2)+'px 5px rgba(0,0,0,.45);';
  return fillCss(el,'bg')+'border-radius:'+el.radius+'px;'+sh+'overflow:hidden;';
}
function dropdownHTML(el){
  const d=ddSteps(el),label=d.i>=0?d.steps[d.i]:(d.t?'—':'no tag');
  return '<div class="dd" style="padding:0 '+el.pad+'px;font-family:\''+el.font+'\',Figtree,sans-serif;font-size:'+el.size+'px;font-weight:'+(el.weight||'600')+';color:'+el.fg+'">'
    +'<span class="ddv">'+esc((el.prefix||'')+label)+'</span><i class="dda" style="border-top-color:'+el.arrowColor+'"></i></div>';
}
/* ---- image: a picture of your own on the interface ---- */
function imageCss(el){
  const a=el.img&&S.assets[el.img];let css='opacity:'+(el.opacity==null?1:el.opacity)+';border-radius:'+(el.radius||0)+'px;overflow:hidden;';
  if(a){const fit=el.fit||'contain',url=imgSrc(el.img,Math.ceil(Math.max(el.w,el.h)*(S.z||1)*2));css+='background:url(\''+url+'\') center/'+(fit==='stretch'?'100% 100%':fit)+' no-repeat;';}
  else css+='background:repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 8px,transparent 8px 16px);outline:1px dashed rgba(255,255,255,.35);';
  const fl=(el.flipX?-1:1)+','+(el.flipY?-1:1);if(el.flipX||el.flipY)css+='transform:scale('+fl+');';
  if(el.shadow){const {lx,ly}=lightVec();css+='filter:drop-shadow('+f1(-lx*4)+'px '+f1(-ly*4)+'px 6px rgba(0,0,0,.55));overflow:visible;';}
  return css;
}
function valLcd(el){const n=nodes.get(el.id);if(!n)return;const s=n.querySelector('.lt span');if(s)s.innerHTML=expand(el.text);}
function valDisplay(el){
  if(el.type==='text') valText(el);
  else if(el.type==='lcd') valLcd(el);
  else if(el.type==='list'||el.type==='button'||el.type==='dropdown') renderEl(el);
}
const refreshDisplays=()=>S.els.forEach(el=>{if(el.type==='text'||el.type==='lcd')valDisplay(el);else if(el.type==='list'||el.type==='dropdown')renderEl(el);});
