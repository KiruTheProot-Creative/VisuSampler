import {
  resample,stretchCh,stretchAll,granularRender,wavetableRender,uniVoices,smDefaults,smOf,hash01,hann,MODES as CORE_MODES,
  detectTransients as coreDetectTransients,zoneData as coreZoneData,zoneInterp as coreZoneInterp,zoneRatio as coreZoneRatio,
  crc32,encodePCM,decodePCM,Pack,writeVsamp,readVsamp,verifyVsamp,fmtBytes,bytesPer,
  estimate as coreEstimate,chooseStep,zoneBakeReason as coreZoneBakeReason,buildExportSet as coreBuildExportSet
} from '../../packages/core/src/index.js';
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const dpr=()=>window.devicePixelRatio||1;
let uid=1; const nid=p=>p+(uid++);


/* ---------- state ---------- */
const BANK_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const bankLetter=i=>i<26?BANK_LETTERS[i]:BANK_LETTERS[Math.floor(i/26)-1]+BANK_LETTERS[i%26];
const S={canvas:{w:960,h:540,bg:'#26222e'},light:315,bpm:120,sig:{n:4,d:4},mode:'design',view:'design',zoom:'fit',snap:true,sel:null,tab:'props',z:1,
  els:[],tags:[],assets:{},fonts:{},groups:[],lists:[],banks:[],userPresets:[],prevSnap:null,
  fx:{scope:'master',view:'nodes',graphs:{},sel:null,cable:null,pan:{x:30,y:20},flow:false,an:null}};
const SYNC=[{l:'1/32',b:.125},{l:'1/16T',b:1/6},{l:'1/16',b:.25},{l:'1/8T',b:1/3},{l:'1/8',b:.5},{l:'1/8.',b:.75},{l:'1/4T',b:2/3},{l:'1/4',b:1},{l:'1/4.',b:1.5},{l:'1/2',b:2},{l:'1/1',b:4}];
const SYNC_BAR=[{l:'1/8 bar',b:.125},{l:'1/4 bar',b:.25},{l:'1/2 bar',b:.5},{l:'1 bar',b:1},{l:'2 bars',b:2},{l:'4 bars',b:4}];
const BUILTIN_FONTS=['Figtree','Unbounded','JetBrains Mono','Pacifico','VT323'];
const nodes=new Map();
const closed=new Set();
const RT={hover:null,down:null,load:1};
const canvas=$('#canvas'), vp=$('#viewport'), stageEl=$('#stage'), rbody=$('#rbody');
const pad2=n=>String(n).padStart(2,'0');
function defaultBanks(names){
  const n=names||['Pianos','Pads','Bass','Keys','Brass','Strings','FX','User'];
  return n.map((x,i)=>({letter:bankLetter(i),name:x}));
}

/* ---------- tags, lists, tokens ---------- */
const tagById=id=>S.tags.find(t=>t.id===id)||null;
const tagByName=n=>S.tags.find(t=>t.name===n)||null;
const bankTag=()=>tagByName('bank');
const listTag=()=>tagByName('list');
const syncList=t=>t.basis==='bar'?SYNC_BAR:SYNC;
function listsInBank(b){if(b===undefined)b=bankIdx();return S.lists.filter(l=>l.bank===b);}
function stepsOf(t){
  if(t.kind==='sync') return syncList(t).map(s=>s.l);
  if(t.kind==='list'){const a=listsInBank().map(l=>l.name);return a.length?a:['-'];}
  if(t.kind==='bank') return S.banks.map(b=>b.letter);
  return t.steps;
}
const stepCount=t=>t.kind==='number'?0:stepsOf(t).length;
function stepIdx(t){const n=stepsOf(t).length;return n<2?0:clamp(Math.round(t.value*(n-1)),0,n-1);}
const bankIdx=()=>{const t=bankTag();return t?stepIdx(t):0;};
const listIdx=()=>{const t=listTag();return t?stepIdx(t):0;};
const curList=()=>listsInBank()[listIdx()]||null;
const barBeats=sg=>sg.n*4/sg.d;
function syncBeats(t,sg){const s=syncList(t)[stepIdx(t)];return t.basis==='bar'?s.b*barBeats(sg):s.b;}
const msOfBeats=b=>b*60000/S.bpm;
function realOf(t){
  if(t.kind!=='number') return t.value;
  if(t.scale==='log'&&t.min>0&&t.max>0) return t.min*Math.pow(t.max/t.min,t.value);
  return t.min+(t.max-t.min)*t.value;
}
function realToNorm(t,r){
  if(t.max===t.min) return 0;
  if(t.scale==='log'&&t.min>0&&t.max>0&&r>0) return Math.log(r/t.min)/Math.log(t.max/t.min);
  return (r-t.min)/(t.max-t.min);
}
function numStr(t){
  const r=realOf(t);
  if(t.unit==='Hz'&&Math.abs(r)>=1000) return (r/1000).toFixed(2)+' kHz';
  return r.toFixed(t.dec)+(t.unit?(t.unit==='%'?'':' ')+t.unit:'');
}
const msStr=ms=>ms>=1000?(ms/1000).toFixed(2)+' s':Math.round(ms)+' ms';
function sigFrom(str){const m=String(str).split('/');return{n:Math.max(1,+m[0]||4),d:Math.max(1,+m[1]||4)};}
function fmtTag(t,fmt){
  fmt=(fmt||'number').trim();
  if(/^\d+\/\d+$/.test(fmt)) return t.kind==='sync'?msStr(msOfBeats(syncBeats(t,sigFrom(fmt)))):'-';
  switch(fmt.toLowerCase()){
    case 'percent': return Math.round(t.value*100)+'%';
    case 'number': case 'value': return t.kind==='number'?numStr(t):stepsOf(t)[stepIdx(t)];
    case 'name': case 'sync': return t.kind==='number'?'-':stepsOf(t)[stepIdx(t)];
    case 'ms': return t.kind==='sync'?msStr(msOfBeats(syncBeats(t,S.sig))):'-';
    case 'raw': return t.value.toFixed(3);
    default: return '?'+fmt;
  }
}
function loadStr(){return RT.load>=1?'READY':'LOADING '+Math.round(RT.load*100)+'%';}
function listToken(p){
  const bl=listsInBank(),idx=listIdx(),n=bl.length,letter=(S.banks[bankIdx()]||{letter:'?'}).letter;
  let i=idx; if(p.mid.indexOf('next')>=0&&n) i=(idx+1)%n; else if(p.mid.indexOf('prev')>=0&&n) i=(idx-1+n)%n;
  const l=bl[i],f=p.n===1?'name':p.fmt.toLowerCase();
  switch(f){
    case 'name': return l?l.name:'-';
    case 'number': return l?pad2(i+1):'--';
    case 'id': return letter+(l?pad2(i+1):'--');
    case 'count': return String(n);
    case 'bank': return letter;
    case 'loading': return loadStr();
    case 'groups': return l?String(l.groups.length):'0';
    default: return '?'+p.fmt;
  }
}
function bankToken(p){
  const b=S.banks[bankIdx()]||{letter:'?',name:''},f=p.n===1?'letter':p.fmt.toLowerCase();
  switch(f){
    case 'letter': return b.letter;
    case 'name': return b.name||b.letter;
    case 'count': return String(listsInBank().length);
    default: return '?'+p.fmt;
  }
}
function parseToken(inner){
  const s=inner.trim().replace(/[\[\]]/g,'').replace(/^display\./i,'').replace(/:/g,'.');
  if(/^\d+\/\d+$/.test(s)) return{sig:s,mid:[],n:1,fmt:'',name:''};
  const seg=s.split('.').filter(x=>x.length);
  return{name:seg[0]||'',mid:seg.slice(1,-1),fmt:seg.length>1?seg[seg.length-1]:'number',n:seg.length};
}
function expand(text){
  return esc(text).replace(/\{([^{}]*)\}/g,function(all,inner){
    const p=parseToken(inner);
    if(p.sig) return esc(msStr(msOfBeats(barBeats(sigFrom(p.sig)))));
    switch(p.name){
      case 'bpm': return String(Math.round(S.bpm));
      case 'timesig': return esc(p.fmt==='bar'||p.fmt==='ms'?msStr(msOfBeats(barBeats(S.sig))):p.fmt==='num'?String(S.sig.n):p.fmt==='den'?String(S.sig.d):S.sig.n+'/'+S.sig.d);
      case 'list': return esc(listToken(p));
      case 'bank': return esc(bankToken(p));
    }
    const t=tagByName(p.name);
    if(!t) return '<span class="bad">{'+p.name+'?}</span>';
    return esc(fmtTag(t,p.fmt));
  });
}
function renameInTexts(o,n){
  S.els.forEach(e=>{
    ['text','label'].forEach(k=>{
      if(typeof e[k]!=='string') return;
      e[k]=e[k].replace(/\{([^{}]*)\}/g,(all,inner)=>{
        const p=parseToken(inner);
        if(p.sig||p.name!==o) return all;
        return '{'+[n].concat(p.mid,p.n>1?[p.fmt]:[]).join('.')+'}';
      });
    });
  });
}
function usesTagText(name){
  const rx=new RegExp('\\{[^{}]*\\b'+name+'\\b');
  return S.els.filter(e=>(typeof e.text==='string'&&rx.test(e.text))||(typeof e.label==='string'&&rx.test(e.label))).length;
}
/* keep bank and list tags valid after the banks or lists change */
function restoreIdx(bi,li){
  const b=bankTag(),l=listTag(),nb=stepCount(b);
  if(b) b.value=nb>1?clamp(bi,0,nb-1)/(nb-1):0;
  const nl=l?stepCount(l):0;
  if(l) l.value=nl>1?clamp(li,0,nl-1)/(nl-1):0;
}

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


/* ---------- element factories ---------- */
const TYPE_NAMES={panel:'Panel',knob:'Knob',fader:'Fader',text:'Text',button:'Button',lcd:'Text panel',list:'List selector'};
const DEF={
  panel:()=>({w:240,h:160,fillMode:'solid',fill2:'#1f1b26',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover',fill:'#3a3445',round:true,radius:14,bevel:true,bevelSize:3,bevelDir:'out',shadow:true,shadowDist:6,shadowBlur:18,mat:null,matBlend:'overlay',matOpacity:.5,matMode:'tile',matScale:1}),
  knob:()=>({w:110,h:110,tag:'',lower:null,upper:null,ringMode:'auto',ringImg:null,ringColor:'#ff7eb6',ringFrom:'start',ringWidth:.09,start:-135,end:135,px:.5,py:.5,baseColor:'#4a4357',capColor:'#e9e4f2',ptrColor:'#ff7eb6',ptrStyle:'line',rules:[]}),
  fader:()=>({w:56,h:200,tag:'',orient:'v',lower:null,upper:null,handleLen:.14,fill:true,fillColor:'#ff7eb6',trackColor:'#17141d',handleColor:'#e9e4f2',rules:[]}),
  text:()=>({w:200,h:36,text:'Label',font:'Figtree',size:18,weight:'600',color:'#f3e9ff',align:'center',spacing:0,bevel:'none',shadow:false,glow:false,glowColor:'#ff7eb6'}),
  button:()=>({w:72,h:44,label:'Button',font:'Figtree',size:15,weight:'700',textColor:'#1c1d21',tag:'',mode:'momentary',value:0,color:'#b4bac4',radius:8,bevelSize:3,led:false,ledColor:'#ff9d2e',auto:true,hover:8,press:14,travel:1,preview:'auto',rules:[]}),
  lcd:()=>({w:320,h:84,text:'{list.id}  {list.name}',font:'Figtree',size:26,align:'left',fg:'#f2f2f2',bg:'#1d1d22',glow:0,screen:false,grid:true,gridAmt:.16,scan:false,radius:6,pad:12,fillMode:'solid',fill2:'#0e0e12',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover'}),
  list:()=>({w:360,h:200,rows:6,font:'VT323',size:0,fg:'#1f2a0f',bg:'#a3b865',selStyle:'invert',numbers:true,screen:true,grid:true,gridAmt:.16,radius:6,pad:10,glow:0,fillMode:'solid',fill2:'#6f8a3c',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover',rules:[]})
};
function mk(type,over){
  const n=S.els.filter(e=>e.type===type).length+1;
  const base={id:nid('e'),type,name:TYPE_NAMES[type]+' '+n,x:0,y:0};
  if(S.pages&&S.pages.length) base.page=S.pages[curPageIdx()].id;   /* new elements land on the page being edited */
  return Object.assign(base,DEF[type](),over||{});
}
function mkTag(name,kind,o){
  return Object.assign({id:nid('t'),name,kind,min:0,max:1,unit:'',scale:'linear',dec:1,steps:['A','B','C'],basis:'note',value:0,def:0,target:'none',sys:false},o||{});
}
const sysTags=()=>[mkTag('bank','bank',{sys:true}),mkTag('list','list',{sys:true})];
const LOOKS={
  plain:{bg:'#1d1d22',fg:'#f2f2f2',glow:0,screen:false,fillMode:'solid',font:'Figtree'},
  'green LCD':{bg:'#a3b865',fg:'#1f2a0f',glow:0,screen:true,fillMode:'solid',font:'VT323'},
  'amber LCD':{bg:'#1c1004',fg:'#ffb347',glow:6,screen:true,fillMode:'solid',font:'VT323'},
  'ice LCD':{bg:'#06161c',fg:'#8fe9ff',glow:6,screen:true,fillMode:'solid',font:'VT323'},
  dark:{bg:'#0b0b0d',fg:'#f2f2f2',glow:3,screen:false,fillMode:'solid',font:'JetBrains Mono'},
  glass:{bg:'#2a3442',fill2:'#121820',fg:'#dfeaff',glow:0,screen:false,fillMode:'gradient',gradLight:true,font:'Figtree'}
};
/* shared fill for panels, text panels and list selectors: solid, gradient (can follow the light) or an image */
function fillCss(el,key){
  const c=el[key],m=el.fillMode||'solid';
  if(m==='image'&&el.bgImg&&S.assets[el.bgImg]){
    const fit=el.bgFit||'cover',url=imgSrc(el.bgImg,Math.ceil(Math.max(el.w,el.h)*(S.z||1)*2));
    return 'background:'+c+' url(\''+url+'\') center/'+(fit==='stretch'?'100% 100%':fit==='tile'?'auto':fit)+' '+(fit==='tile'?'repeat':'no-repeat')+';';
  }
  if(m==='gradient'){const a=el.gradLight?(S.light+180)%360:(el.gradAngle||180);return 'background:linear-gradient('+a+'deg,'+c+','+(el.fill2||'#000')+');';}
  return 'background:'+c+';';
}
function addSample(){
  S.groups=['Felt Piano','Felt Hammers','Release Noise','String Pad','Warm Pad','Glass Pad','Choir Ah','Choir Oo','Bells','Sub Bass','Bass Pluck','Rhodes','Clav','Organ'];
  const L=(name,bank,groups,vals)=>({id:nid('l'),name,bank,groups,vals:vals||{}});
  S.lists=[
    L('Felt Piano',0,['Felt Piano','Release Noise'],{cutoff:.62,reverb:.25}),
    L('Felt + Strings',0,['Felt Piano','Release Noise','String Pad'],{cutoff:.55,reverb:.4}),
    L('Hammers Only',0,['Felt Hammers'],{cutoff:.8,reverb:.1}),
    L('Soft Close Felt',0,['Felt Piano'],{cutoff:.3,reverb:.15}),
    L('Warm Pad',1,['Warm Pad'],{cutoff:.4,reverb:.6}),
    L('Glass Pad',1,['Glass Pad','Bells'],{cutoff:.75,reverb:.7}),
    L('Choir Ah',1,['Choir Ah'],{cutoff:.6,reverb:.55}),
    L('Choir + Pad',1,['Choir Ah','Choir Oo','Warm Pad'],{cutoff:.5,reverb:.6}),
    L('Ice Bells',1,['Bells'],{cutoff:.85,reverb:.5}),
    L('Sub Bass',2,['Sub Bass'],{cutoff:.2,reverb:0}),
    L('Pluck Bass',2,['Bass Pluck'],{cutoff:.45,reverb:.05}),
    L('Bass + Sub',2,['Bass Pluck','Sub Bass'],{cutoff:.35,reverb:.05}),
    L('Rhodes',3,['Rhodes'],{cutoff:.7,reverb:.3}),
    L('Clav',3,['Clav'],{cutoff:.8,reverb:.1}),
    L('Organ',3,['Organ'],{cutoff:.65,reverb:.2})
  ];
}

/* ---------- geometry / light ---------- */
function lightVec(){const a=S.light*Math.PI/180;return{lx:Math.sin(a),ly:-Math.cos(a)};}
const f1=v=>v.toFixed(1);
function arc(a0,a1,r){
  if(Math.abs(a1-a0)<.05) return '';
  if(Math.abs(a1-a0)>=359.9) a1=a0+(a1>a0?359.9:-359.9);
  const p=a=>[50+r*Math.sin(a*Math.PI/180),50-r*Math.cos(a*Math.PI/180)];
  const [x0,y0]=p(a0),[x1,y1]=p(a1);
  return 'M'+x0.toFixed(2)+' '+y0.toFixed(2)+'A'+r+' '+r+' 0 '+(Math.abs(a1-a0)>180?1:0)+' '+(a1>a0?1:0)+' '+x1.toFixed(2)+' '+y1.toFixed(2);
}
function knobGeom(el,v){
  const ang=el.start+(el.end-el.start)*v;
  const base=el.ringFrom==='center'?(el.start+el.end)/2:el.start;
  return{ang,lo:Math.min(base,ang),hi:Math.max(base,ang)};
}
function ringMask(el,g){
  const a=g.lo-el.start,b=g.hi-el.start;
  return 'conic-gradient(from '+el.start+'deg,transparent '+a+'deg,#000 '+a+'deg,#000 '+b+'deg,transparent '+b+'deg)';
}
function faderMetrics(el){
  const vert=el.orient==='v',L=vert?el.h:el.w,C=vert?el.w:el.h,hl=Math.max(8,L*el.handleLen);
  return{vert,L,C,hl};
}


/* ---------- rendering of elements ---------- */
function panelCss(el){
  const {lx,ly}=lightVec(),sh=[];
  if(el.shadow) sh.push(f1(-lx*el.shadowDist)+'px '+f1(-ly*el.shadowDist)+'px '+el.shadowBlur+'px rgba(0,0,0,.5)');
  if(el.bevel){
    const d=el.bevelDir==='out'?1:-1,b=el.bevelSize;
    sh.push('inset '+f1(-lx*b*d)+'px '+f1(-ly*b*d)+'px '+b+'px rgba(255,255,255,.3)');
    sh.push('inset '+f1(lx*b*d)+'px '+f1(ly*b*d)+'px '+b+'px rgba(0,0,0,.45)');
  }
  return fillCss(el,'fill')+'border-radius:'+(el.round?el.radius:0)+'px;box-shadow:'+(sh.join(',')||'none')+';isolation:isolate;';
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
/* pages: an element shows on its own page, or on every page when "always show" is on */
function pageTag(){return S.tags.find(t=>t.name==='page'&&t.sys)||null;}
function curPageIdx(){const t=pageTag();return t?stepIdx(t):0;}
function elPageIdx(el){const i=(S.pages||[]).findIndex(p=>p.id===el.page);return i<0?0:i;}
function elShown(el){const P=S.pages||[];return P.length<2||!!el.always||elPageIdx(el)===curPageIdx();}
function showPage(){S.els.forEach(e=>{const n=nodes.get(e.id);if(n)n.style.display=elShown(e)?'':'none';});}
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
  if(!elShown(el)) n.style.display='none';
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
function valLcd(el){const n=nodes.get(el.id);if(!n)return;const s=n.querySelector('.lt span');if(s)s.innerHTML=expand(el.text);}
function valDisplay(el){
  if(el.type==='text') valText(el);
  else if(el.type==='lcd') valLcd(el);
  else if(el.type==='list'||el.type==='button') renderEl(el);
}
const refreshDisplays=()=>S.els.forEach(el=>{if(el.type==='text'||el.type==='lcd')valDisplay(el);else if(el.type==='list')renderEl(el);});

/* ---------- layout / canvas size ---------- */
function layout(){
  if(S.view!=='design') return;
  const W=S.canvas.w,H=S.canvas.h; let z;
  if(S.zoom==='fit'){
    const aw=stageEl.clientWidth-56,ah=stageEl.clientHeight-56;
    z=Math.max(.1,Math.min(aw/W,ah/H,1.5));
  }else z=parseFloat(S.zoom)/100;
  const prev=S.z; S.z=z;
  vp.style.width=(W*z)+'px'; vp.style.height=(H*z)+'px';
  canvas.style.cssText='width:'+W+'px;height:'+H+'px;background:'+S.canvas.bg+';transform:scale('+z+')';
  $('#zl').textContent=W+' × '+H+' px · '+Math.round(z*100)+'%';
  if(Math.abs(prev-z)>.001) rerenderAll();
  placeSel();
}
function setCanvas(w,h){
  const rw=Math.round(w),rh=Math.round(h);
  const cw=clamp(rw||S.canvas.w,200,1920),chh=clamp(rh||S.canvas.h,120,1080);
  const clamped=(rw!==cw)||(rh!==chh);
  S.canvas.w=cw; S.canvas.h=chh; $('#cw').value=cw; $('#ch').value=chh;
  if(clamped) flash('Canvas is limited to 1920 × 1080');
  layout();
}
let flashT=0;
function flash(t){
  const ms=[$('#msg'),$('#fxMsg'),$('#mapMsg'),$('#smMsg'),$('#exMsg')];
  ms.forEach(m=>{if(m)m.textContent=t;});
  clearTimeout(flashT);flashT=setTimeout(()=>{ms.forEach(m=>{if(m)m.textContent='';});},3800);
}


/* ---------- selection ---------- */
const sel=()=>S.els.find(e=>e.id===S.sel)||null;
function placeSel(){
  const sb=$('#selbox'),el=sel();
  if(!el||S.mode!=='design'){sb.hidden=true;return;}
  sb.hidden=false; const z=S.z;
  sb.style.left=(el.x*z)+'px'; sb.style.top=(el.y*z)+'px'; sb.style.width=(el.w*z)+'px'; sb.style.height=(el.h*z)+'px';
  $('#selTag').textContent=el.name+' · '+Math.round(el.w)+'×'+Math.round(el.h);
}
function select(id){
  S.sel=id; if(id&&S.tab!=='props') S.tab='props';
  renderLayers(); placeSel(); renderRight();
}
function renderLayers(){
  $('#layers').innerHTML=S.els.slice().reverse().map(e=>'<li><button type="button" class="lr'+(e.id===S.sel?' on':'')+'" data-id="'+e.id+'"><i class="ic '+e.type+'"></i><span>'+esc(e.name)+'</span><small>'+e.type+'</small></button></li>').join('');
  $('#layerCount').textContent='· '+S.els.length;
}


/* ---------- snapping, move, resize ---------- */
function snapTargets(except){
  const xs=[0,S.canvas.w/2,S.canvas.w],ys=[0,S.canvas.h/2,S.canvas.h];
  S.els.forEach(o=>{if(o===except)return;xs.push(o.x,o.x+o.w/2,o.x+o.w);ys.push(o.y,o.y+o.h/2,o.y+o.h);});
  return{xs,ys};
}
function snap1(vals,targets){
  const th=6/S.z;let best=null;
  for(const v of vals)for(const t of targets){const d=t-v;if(Math.abs(d)<=th&&(best===null||Math.abs(d)<Math.abs(best.d)))best={d,t};}
  return best;
}
function showGuides(gx,gy){
  const x=$('#gx'),y=$('#gy');
  x.hidden=gx===null||gx===undefined; y.hidden=gy===null||gy===undefined;
  if(!x.hidden) x.style.left=(gx*S.z)+'px';
  if(!y.hidden) y.style.top=(gy*S.z)+'px';
}
const hideGuides=()=>{$('#gx').hidden=true;$('#gy').hidden=true;};
function syncPosFields(){
  const el=sel(); if(!el||S.tab!=='props') return;
  ['x','y','w','h'].forEach(k=>{const i=$('[data-k="'+k+'"]',rbody);if(i&&document.activeElement!==i)i.value=Math.round(el[k]);});
}
function drag(mv,end){
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(end)end();};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
}
function startMove(e){
  const el=sel(); if(!el) return; e.preventDefault();
  const sx=e.clientX,sy=e.clientY,ox=el.x,oy=el.y;
  drag(ev=>{
    let nx=ox+(ev.clientX-sx)/S.z,ny=oy+(ev.clientY-sy)/S.z;
    if(S.snap&&!ev.altKey){
      const T=snapTargets(el),bx=snap1([nx,nx+el.w/2,nx+el.w],T.xs),by=snap1([ny,ny+el.h/2,ny+el.h],T.ys);
      if(bx) nx+=bx.d; if(by) ny+=by.d;
      showGuides(bx?bx.t:null,by?by.t:null);
    }else hideGuides();
    el.x=Math.round(nx); el.y=Math.round(ny); renderEl(el); placeSel(); syncPosFields();
  },hideGuides);
}
function startResize(e,dir){
  const el=sel(); if(!el) return; e.preventDefault(); e.stopPropagation();
  const sx=e.clientX,sy=e.clientY,o={x:el.x,y:el.y,w:el.w,h:el.h},sq=el.type==='knob';
  drag(ev=>{
    const dx=(ev.clientX-sx)/S.z,dy=(ev.clientY-sy)/S.z;
    let x=o.x,y=o.y,w=o.w,h=o.h;
    if(dir.includes('e')) w=o.w+dx;
    if(dir.includes('s')) h=o.h+dy;
    if(dir.includes('w')){x=o.x+dx;w=o.w-dx;}
    if(dir.includes('n')){y=o.y+dy;h=o.h-dy;}
    if(S.snap&&!ev.altKey&&!sq){
      const T=snapTargets(el);
      if(dir.includes('e')){const b=snap1([x+w],T.xs);if(b)w+=b.d;}
      if(dir.includes('w')){const b=snap1([x],T.xs);if(b){x+=b.d;w-=b.d;}}
      if(dir.includes('s')){const b=snap1([y+h],T.ys);if(b)h+=b.d;}
      if(dir.includes('n')){const b=snap1([y],T.ys);if(b){y+=b.d;h-=b.d;}}
    }
    if(w<12){if(dir.includes('w'))x-=12-w;w=12;}
    if(h<12){if(dir.includes('n'))y-=12-h;h=12;}
    if(sq){const m=Math.max(w,h);if(dir.includes('w'))x=o.x+o.w-m;if(dir.includes('n'))y=o.y+o.h-m;w=h=m;}
    el.x=Math.round(x);el.y=Math.round(y);el.w=Math.round(w);el.h=Math.round(h);
    renderEl(el);placeSel();syncPosFields();
  });
}


/* ---------- tags: change / audio ---------- */
function setTag(t,v){
  v=clamp(v,0,1); const n=stepCount(t);
  if(n>1) v=Math.round(v*(n-1))/(n-1); else if(t.kind!=='number') v=0;
  if(v===t.value) return;
  t.value=v;
  if(t.kind==='bank'){const lt=listTag();if(lt)lt.value=0;}
  onTag(t);
  if(t.kind==='bank'||t.kind==='list') listChanged();
  fireChange(t);
}
function onTag(t){
  if(t.sys&&t.name==='page') showPage();
  S.els.forEach(el=>{
    if(el.type==='knob'&&el.tag===t.id) valKnob(el);
    else if(el.type==='fader'&&el.tag===t.id) valFader(el);
    else valDisplay(el);
  });
  applyAudio(); updateTagUI(t); fxRefreshParams();
}
function setStep(t,i){const n=stepCount(t);setTag(t,n>1?i/(n-1):0);}
function stepBy(t,d){
  const n=stepCount(t);
  if(n>1) setStep(t,(stepIdx(t)+d+n)%n); else if(t.kind==='number') setTag(t,t.value+d*.05);
}
function fireChange(t){S.els.forEach(el=>{if(el.tag===t.id&&el.rules&&el.rules.length)fireEvent(el,'change');});}
let loadT=0,loadRaf=0;
function scheduleLoad(){
  RT.load=0; clearTimeout(loadT); cancelAnimationFrame(loadRaf); refreshDisplays();
  loadT=setTimeout(()=>{
    const t0=performance.now();
    const step=now=>{
      RT.load=Math.min(1,(now-t0)/700); refreshDisplays();
      if(RT.load<1) loadRaf=requestAnimationFrame(step);
      else S.els.forEach(el=>{if(el.rules&&el.rules.length)fireEvent(el,'load');});
    };
    loadRaf=requestAnimationFrame(step);
  },150);
}
function listChanged(){
  const l=curList();
  if(l&&l.vals) Object.keys(l.vals).forEach(k=>{const t=tagByName(k);if(t&&!t.sys)setTag(t,l.vals[k]);});
  scheduleLoad();
  S.els.forEach(el=>{if(el.type==='list'&&el.rules&&el.rules.length)fireEvent(el,'change');});
}
function updateTagUI(t){
  if(S.tab!=='tags') return;
  const row=$('[data-tid="'+t.id+'"]',rbody); if(!row) return;
  const tv=$('.tv',row); if(tv&&document.activeElement!==tv) tv.value=t.value;
  const tr=$('.tr',row); if(tr) tr.textContent=fmtTag(t,'number');
}
function setBpm(v){
  S.bpm=clamp(Math.round(v)||120,40,300);
  $('#bpm').value=S.bpm; const p=$('[data-p="bpm"]',rbody); if(p&&document.activeElement!==p) p.value=S.bpm;
  refreshDisplays(); fxRefreshParams();
}
function setSig(n,d){
  S.sig={n:clamp(parseInt(n,10)||4,1,32),d:[2,4,8,16].indexOf(parseInt(d,10))>=0?parseInt(d,10):4};
  syncSig(); refreshDisplays(); fxRefreshParams();
}
const AU={ctx:null,master:null,filter:null,v:new Map()};
function ensureAudio(){
  if(AU.ctx){if(AU.ctx.state==='suspended')AU.ctx.resume();return true;}
  try{
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
    const c=new AC(); AU.master=c.createGain(); AU.filter=c.createBiquadFilter(); AU.filter.type='lowpass';
    AU.filter.frequency.value=2000; AU.filter.connect(AU.master); AU.master.connect(c.destination); AU.ctx=c; applyAudio(); return true;
  }catch(e){return false;}
}
const drive=target=>S.tags.find(t=>t.target===target);
function waveType(){const w=drive('wave');if(!w)return 'sawtooth';return ['sawtooth','square','triangle','sine'][stepIdx(w)%4];}
function applyAudio(){
  if(!AU.ctx) return; const now=AU.ctx.currentTime;
  const c=drive('cutoff'); let f=2000; if(c) f=(c.kind==='number'&&c.unit==='Hz')?realOf(c):40*Math.pow(450,c.value);
  AU.filter.frequency.setTargetAtTime(clamp(f,20,20000),now,.02);
  const r=drive('resonance'); AU.filter.Q.setTargetAtTime(r?.5+r.value*16:.7,now,.02);
  const v=drive('volume'); let g=.8; if(v) g=(v.kind==='number'&&v.unit==='dB')?Math.pow(10,realOf(v)/20):v.value*v.value;
  AU.master.gain.setTargetAtTime(clamp(g,0,2)*.28,now,.02);
  const wt=waveType(); AU.v.forEach(x=>{x.o.type=wt;});
}
function synthOn(m){
  if(!ensureAudio()||AU.v.has(m)) return;
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
  o.type=waveType(); o.frequency.value=440*Math.pow(2,(m-69)/12); g.gain.value=0;
  o.connect(g); g.connect(AU.filter); o.start(); g.gain.setTargetAtTime(1,c.currentTime,.01); AU.v.set(m,{o,g});
}
function synthOff(m){
  const v=AU.v.get(m); if(!v) return; AU.v.delete(m);
  const c=AU.ctx; v.g.gain.setTargetAtTime(0,c.currentTime,.12); v.o.stop(c.currentTime+.9);
}


/* ---------- test mode interaction ---------- */
function btnDown(el,e){
  e.preventDefault(); RT.down=el.id; const t=tagById(el.tag);
  if(t){
    if(el.mode==='toggle') setTag(t,t.value>.5?0:1);
    else if(el.mode==='radio') setStep(t,el.value);
    else if(el.mode==='momentary'&&t.kind==='number') setTag(t,1);
  }
  fireEvent(el,'press'); renderEl(el);
  const hold=setTimeout(()=>fireEvent(el,'hold'),500);
  drag(()=>{},()=>{
    clearTimeout(hold); RT.down=null;
    if(t&&el.mode==='momentary'&&t.kind==='number') setTag(t,0);
    fireEvent(el,'release'); renderEl(el);
  });
}
function startTest(e){
  const n=e.target.closest('.el'); if(!n) return;
  const el=S.els.find(x=>x.id===n.dataset.id); if(!el) return;
  if(el.type==='button'){btnDown(el,e);return;}
  if(el.type==='list'){
    const r=e.target.closest('.lrow');
    if(r&&r.dataset.i!==undefined){e.preventDefault();const lt=listTag();if(lt)setStep(lt,+r.dataset.i);}
    return;
  }
  if(el.type!=='knob'&&el.type!=='fader') return;
  const t=tagById(el.tag); if(!t) return; e.preventDefault();
  if(el.type==='knob'){
    const sy=e.clientY,v0=t.value;
    drag(ev=>setTag(t,v0+(sy-ev.clientY)/(ev.shiftKey?800:220)));
  }else{
    const r=n.getBoundingClientRect(),{vert,L,hl}=faderMetrics(el);
    const setFrom=ev=>{const p=((vert?ev.clientY-r.top:ev.clientX-r.left)/S.z)-hl/2;const f=clamp(p/(L-hl),0,1);setTag(t,vert?1-f:f);};
    setFrom(e); drag(setFrom);
  }
}
canvas.addEventListener('pointerdown',e=>{
  if(S.mode==='test'){startTest(e);return;}
  const n=e.target.closest('.el');
  if(!n){select(null);return;}
  if(S.sel!==n.dataset.id) select(n.dataset.id);
  startMove(e);
});
stageEl.addEventListener('pointerdown',e=>{if(S.mode==='design'&&(e.target===stageEl||e.target===vp))select(null);});
$$('#selbox .hd').forEach(h=>h.addEventListener('pointerdown',e=>startResize(e,h.dataset.dir)));
function elOf(e){const n=e.target.closest&&e.target.closest('.el');return n?S.els.find(x=>x.id===n.dataset.id)||null:null;}
canvas.addEventListener('dblclick',e=>{
  if(S.mode!=='test') return;
  const el=elOf(e); if(!el) return;
  if(el.type==='button'){fireEvent(el,'doubleclick');return;}
  const t=tagById(el.tag);
  if(t&&(el.type==='knob'||el.type==='fader')) setTag(t,t.def);
});
canvas.addEventListener('wheel',e=>{
  if(S.mode!=='test') return;
  const el=elOf(e); if(!el) return;
  if(el.type==='list'){e.preventDefault();const lt=listTag();if(lt)stepBy(lt,Math.sign(e.deltaY));return;}
  const t=tagById(el.tag);
  if(!t||(el.type!=='knob'&&el.type!=='fader')) return;
  e.preventDefault(); const c=stepCount(t);
  setTag(t,t.value-Math.sign(e.deltaY)*(c>1?1/(c-1):.02));
},{passive:false});
canvas.addEventListener('pointerover',e=>{
  const n=e.target.closest&&e.target.closest('.el.button'),id=n?n.dataset.id:null;
  if(id===RT.hover) return;
  const old=RT.hover; RT.hover=id;
  [old,id].forEach(i=>{const el=i&&S.els.find(x=>x.id===i);if(el)renderEl(el);});
});
canvas.addEventListener('pointerleave',()=>{
  if(!RT.hover) return;
  const el=S.els.find(x=>x.id===RT.hover); RT.hover=null; if(el)renderEl(el);
});

/* ---------- test keyboard ---------- */
const KB={lo:48,hi:72};
const KEYS={a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72,o:73,l:74};
function buildKb(){
  const whites=[],blacks=[];
  for(let m=KB.lo;m<=KB.hi;m++){([1,3,6,8,10].includes(m%12)?blacks:whites).push(m);}
  const ww=100/whites.length;
  $('#kb').innerHTML=whites.map((m,i)=>'<button type="button" class="wk" data-m="'+m+'" style="left:'+i*ww+'%;width:'+ww+'%" aria-label="Note '+m+'"></button>').join('')
    +blacks.map(m=>{const wi=whites.filter(w=>w<m).length;return '<button type="button" class="bk" data-m="'+m+'" style="left:'+(wi*ww-ww*.3)+'%;width:'+ww*.6+'%" aria-label="Note '+m+'"></button>';}).join('');
}
$('#kb').addEventListener('pointerdown',e=>{
  const b=e.target.closest('[data-m]'); if(!b) return; e.preventDefault();
  const m=+b.dataset.m; noteOn(m); b.classList.add('on');
  const up=()=>{noteOff(m);b.classList.remove('on');window.removeEventListener('pointerup',up);};
  window.addEventListener('pointerup',up);
});
const typing=t=>t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT');
function keyBtn(m){return $('#kb [data-m="'+m+'"]');}
document.addEventListener('keydown',e=>{
  if(S.view==='sound'){if(!typing(e.target)){if(e.code==='Space'||((e.ctrlKey||e.metaKey)&&/^[zZ]$/.test(e.key)&&S.snd.focus==='sample'))smKey(e);else mapKey(e);}return;}
  if(S.view==='map'){if(!typing(e.target))mapKey(e);return;}
  if(S.view==='samples'){if(!typing(e.target))smKey(e);return;}
  if(S.view!=='design'){if(!typing(e.target)&&!e.ctrlKey&&!e.metaKey)fxKey(e);return;}
  if(typing(e.target)||e.ctrlKey||e.metaKey) {
    if((e.ctrlKey||e.metaKey)&&S.mode==='design'&&!typing(e.target)){
      const k=e.key.toLowerCase();
      if(k==='d'&&sel()){e.preventDefault();dupEl();}
      else if(k==='a'){e.preventDefault();setSel(S.els.filter(elShown).map(x=>x.id),S.sel);}
      else if(k==='g'&&sel()){e.preventDefault();if(e.shiftKey)ungroupSel();else groupSel();}
    }
    return;
  }
  if(S.mode==='test'){
    const m=KEYS[e.key.toLowerCase()];
    if(m!==undefined&&!e.repeat){noteOn(m,100);const b=keyBtn(m);if(b)b.classList.add('on');}
    return;
  }
  const el=sel(); if(!el) return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();delEl();}
  else if(e.key==='Escape') select(null);
  else if(e.key.startsWith('Arrow')){
    e.preventDefault(); const s=e.shiftKey?10:1;
    nudgeSel(e.key==='ArrowLeft'?-s:e.key==='ArrowRight'?s:0,e.key==='ArrowUp'?-s:e.key==='ArrowDown'?s:0);
  }
});
document.addEventListener('keyup',e=>{
  const m=KEYS[e.key.toLowerCase()];
  if(m!==undefined&&(S.mode==='test'||S.view==='map'||S.view==='samples'||S.view==='sound')&&!typing(e.target)){noteOff(m);mapKeyUp(m);smKeyUp(m);const b=keyBtn(m);if(b)b.classList.remove('on');}
});


/* ---------- element actions ---------- */
function addEl(type){
  const el=mk(type);
  el.x=Math.round((S.canvas.w-el.w)/2); el.y=Math.round((S.canvas.h-el.h)/2);
  S.els.push(el);
  const n=document.createElement('div'); n.className='el '+type; n.dataset.id=el.id; canvas.appendChild(n); nodes.set(el.id,n);
  renderEl(el); select(el.id);
}
function dupEl(){
  const el=sel(); if(!el) return;
  const c=JSON.parse(JSON.stringify(el)); c.id=nid('e'); c.name=el.name+' copy'; c.x+=16; c.y+=16;
  S.els.splice(S.els.indexOf(el)+1,0,c);
  const n=document.createElement('div'); n.className='el '+c.type; n.dataset.id=c.id; canvas.appendChild(n); nodes.set(c.id,n);
  rerenderAll(); select(c.id);
}
function delEl(){
  const el=sel(); if(!el) return;
  const n=nodes.get(el.id); if(n) n.remove(); nodes.delete(el.id);
  S.els.splice(S.els.indexOf(el),1); rerenderAll(); select(null);
}
function moveZ(d){
  const el=sel(); if(!el) return; const i=S.els.indexOf(el),j=i+d;
  if(j<0||j>=S.els.length) return;
  S.els.splice(i,1); S.els.splice(j,0,el); rerenderAll(); renderLayers();
}
function addComp(kind){
  if(kind!=='banks') return;
  const bt=bankTag(); if(!bt) return;
  const cnt=Math.min(8,S.banks.length),w=56,h=40,gap=6,total=cnt*w+(cnt-1)*gap;
  const x0=Math.round((S.canvas.w-total)/2),y0=Math.round((S.canvas.h-h)/2);
  let last=null;
  for(let i=0;i<cnt;i++){
    const el=mk('button',{name:'Bank '+S.banks[i].letter,label:'{bank.letter}',x:x0+i*(w+gap),y:y0,w,h,tag:bt.id,mode:'radio',value:i,led:true,size:18});
    el.label=S.banks[i].letter;
    S.els.push(el);
    const n=document.createElement('div'); n.className='el button'; n.dataset.id=el.id; canvas.appendChild(n); nodes.set(el.id,n);
    renderEl(el); last=el;
  }
  if(last) select(last.id);
  flash('Bank buttons added, bound to the bank tag');
}


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


/* ---------- inspector markup: core ---------- */
const sec=(title,body)=>'<details class="sec" data-sec="'+title+'"'+(closed.has(title)?'':' open')+'><summary>'+title+'</summary>'+body+'</details>';
const H={
  range:(l,k,mn,mx,st,v)=>'<label class="f"><span>'+l+'</span><input type="range" data-k="'+k+'" min="'+mn+'" max="'+mx+'" step="'+st+'" value="'+v+'"><output>'+v+'</output></label>',
  num:(l,k,v,mn,mx,st,rb)=>'<label class="f"><span>'+l+'</span><input type="number" data-k="'+k+'" value="'+Math.round(v)+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+' step="'+(st||1)+'"'+(rb?' data-rb="1"':'')+'></label>',
  color:(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="color" data-k="'+k+'" value="'+v+'"></label>',
  sel:(l,k,v,opts,rb)=>'<label class="f"><span>'+l+'</span><select data-k="'+k+'"'+(rb?' data-rb="1"':'')+'>'+opts.map(o=>{const a=Array.isArray(o)?o:[o,o];return '<option value="'+esc(a[0])+'"'+(String(a[0])===String(v)?' selected':'')+'>'+esc(a[1])+'</option>';}).join('')+'</select></label>',
  chk:(l,k,v,rb)=>'<label class="f chk"><input type="checkbox" data-k="'+k+'"'+(v?' checked':'')+(rb?' data-rb="1"':'')+'><span>'+l+'</span></label>',
  txt:(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="text" data-k="'+k+'" value="'+esc(v)+'"></label>',
  area:(l,k,v)=>'<label class="f col"><span>'+l+'</span><textarea data-k="'+k+'" rows="3">'+esc(v)+'</textarea></label>',
  img:(l,k,id,px,hint)=>{
    const a=id&&S.assets[id],m=a&&mipFor(id,px);
    return '<div class="f col"><span>'+l+'</span><div class="imgf">'
      +(a?'<img class="th" alt="" src="'+a.mips[0].url+'">':'<span class="th"></span>')
      +'<div class="imeta">'+(a?'<b>'+esc(a.name)+'</b><small>'+a.w+'×'+a.h+' px original'+(a.svg?' · vector':' · showing the '+m.s+' px size')+'</small>':'<b>Built-in</b><small>Drawn live, crisp at any size</small>')+'</div>'
      +'<div class="row"><button type="button" class="btn" data-act="pick" data-k="'+k+'">'+(a?'Replace':'Choose image')+'</button>'+(a?'<button type="button" class="btn" data-act="clear" data-k="'+k+'">Clear</button>':'')+'</div></div>'
      +(hint?'<p class="hint">'+hint+'</p>':'')+'</div>';
  }
};
const tagOpts=()=>[['','— none —']].concat(S.tags.map(t=>[t.id,t.name]));
function insRow(){
  return '<div class="ins"><select id="insTag" aria-label="Tag to insert">'+S.tags.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+'</option>').join('')+'</select><select id="insFmt" aria-label="Format">'+['number','percent','name','ms','id','number'].filter((v,i,a)=>a.indexOf(v)===i).map(f=>'<option>'+f+'</option>').join('')+'</select><button type="button" class="btn" data-act="ins">Insert live value</button></div>'
    +'<p class="hint">Typed by hand: <code>{cutoff.number}</code>, <code>{list.name}</code>, <code>{timesig}</code>. The colon form <code>{cutoff:number}</code> works too.</p>';
}
function propsHTML(){
  const el=sel();
  if(!el) return '<p class="empty">Nothing selected.<br>Click an element on the canvas or in Layers, or add one from the left.</p>';
  let h='<div class="phead"><input type="text" class="pname" data-k="name" value="'+esc(el.name)+'" aria-label="Element name"><span class="badge">'+el.type+'</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-act="fwd">Forward</button><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="dup">Duplicate</button><button type="button" class="btn danger" data-act="del">Delete</button></div>';
  h+=sec('Transform',H.num('X','x',el.x)+H.num('Y','y',el.y)+H.num('Width','w',el.w,12,1920,1,1)+H.num('Height','h',el.h,12,1080,1,1)+(el.type==='knob'?'<p class="hint">Knobs stay square when resized.</p>':''));
  const fn={knob:knobProps,fader:faderProps,panel:panelProps,text:textProps,button:buttonProps,lcd:lcdProps,list:listProps}[el.type];
  return h+fn(el);
}
function knobProps(el){
  const px=Math.ceil(Math.min(el.w,el.h)*S.z*dpr());
  let h=sec('Link',H.sel('Tag','tag',el.tag,tagOpts())+'<p class="hint">The tag drives rotation, ring and any text that shows its value.</p>');
  h+=sec('Layers',
    H.img('Lower · static','lower',el.lower,px)+H.img('Upper · moving','upper',el.upper,px)
    +H.sel('Ring','ringMode',el.ringMode,[['auto','Automatic fill'],['image','Custom image'],['none','No ring']],true)
    +(el.ringMode==='image'?H.img('Ring image','ringImg',el.ringImg,px,'Revealed along the sweep as the value rises.'):'')
    +(el.ringMode!=='none'?H.sel('Fill from','ringFrom',el.ringFrom,[['start','Start (normal)'],['center','Centre (pan, bipolar)']]):'')
    +(el.ringMode==='auto'?H.color('Ring colour','ringColor',el.ringColor)+H.range('Ring width','ringWidth',.03,.2,.01,el.ringWidth):''));
  h+=sec('Motion',H.range('Start angle','start',-360,360,1,el.start)+H.range('End angle','end',-360,360,1,el.end)
    +(el.upper?H.range('Pivot X','px',0,1,.01,el.px)+H.range('Pivot Y','py',0,1,.01,el.py):''));
  if(!el.lower||!el.upper) h+=sec('Built-in look',
    (!el.lower?H.color('Body colour','baseColor',el.baseColor):'')
    +(!el.upper?H.color('Cap colour','capColor',el.capColor)+H.sel('Pointer','ptrStyle',el.ptrStyle,[['line','Line'],['dot','Dot'],['none','None']])+H.color('Pointer colour','ptrColor',el.ptrColor):''));
  return h+eventsHTML(el);
}
function faderProps(el){
  const px=Math.ceil(Math.max(el.w,el.h)*S.z*dpr());
  let h=sec('Link',H.sel('Tag','tag',el.tag,tagOpts()));
  h+=sec('Layers',H.sel('Direction','orient',el.orient,[['v','Vertical'],['h','Horizontal']],true)
    +H.img('Lower · static','lower',el.lower,px)+H.img('Upper · moving','upper',el.upper,px)
    +H.range('Handle length','handleLen',.05,.5,.01,el.handleLen));
  if(!el.lower||!el.upper) h+=sec('Built-in look',
    (!el.lower?H.chk('Fill layer','fill',el.fill,true)+(el.fill?H.color('Fill colour','fillColor',el.fillColor):'')+H.color('Track colour','trackColor',el.trackColor):'')
    +(!el.upper?H.color('Handle colour','handleColor',el.handleColor):''));
  return h+eventsHTML(el);
}
function panelProps(el){
  const a=el.mat&&S.assets[el.mat];
  let h=fillSec(el,'fill','Colour')+sec('Edges',H.chk('Rounded edges','round',el.round,true)+(el.round?H.range('Rounding','radius',0,80,1,el.radius):''));
  h+=sec('Bevel and shadow',H.chk('Bevel','bevel',el.bevel,true)
    +(el.bevel?H.range('Bevel size','bevelSize',1,16,1,el.bevelSize)+H.sel('Direction','bevelDir',el.bevelDir,[['out','Outwards'],['in','Inwards']]):'')
    +H.chk('Drop shadow','shadow',el.shadow,true)
    +(el.shadow?H.range('Distance','shadowDist',0,40,1,el.shadowDist)+H.range('Blur','shadowBlur',0,60,1,el.shadowBlur):'')
    +'<p class="hint">Direction follows the project light angle.</p>');
  h+=sec('Material overlay','<div class="chips"><button type="button" class="btn'+(el.mat==='tex_noise'?' on':'')+'" data-act="mat" data-v="tex_noise">Noise</button><button type="button" class="btn'+(el.mat==='tex_brushed'?' on':'')+'" data-act="mat" data-v="tex_brushed">Brushed</button><button type="button" class="btn" data-act="pick" data-k="mat">Upload…</button><button type="button" class="btn" data-act="mat" data-v="">None</button></div>'
    +(a?'<p class="hint">'+esc(a.name)+' · '+a.w+'×'+a.h+' px. Any image works, it is converted to greyscale.</p>'
      +H.sel('Blend','matBlend',el.matBlend,['normal','multiply','overlay','soft-light','screen','hard-light'])
      +H.range('Opacity','matOpacity',0,1,.01,el.matOpacity)
      +H.sel('Mapping','matMode',el.matMode,[['tile','Tile'],['stretch','Stretch']],true)
      +(el.matMode==='tile'?H.range('Tile scale','matScale',.25,4,.05,el.matScale):''):''));
  return h;
}
function glyphCount(font){
  const set=new Set(); S.els.forEach(e=>{if(e.type==='text'&&e.font===font)for(const c of e.text)set.add(c);}); return set.size;
}
function textProps(el){
  const fonts=BUILTIN_FONTS.concat(Object.keys(S.fonts));
  const emb=S.fonts[el.font];
  const msg={ok:['ok','Embedding allowed. This font will travel inside the .vsamp.'],restricted:['bad','This font forbids embedding, so it will not be packed into the .vsamp.'],nosubset:['warn','Embeddable, but the font asks not to be subset, so the whole file is stored.'],unknown:['warn','Could not read the licence flag (WOFF is compressed). Check the font licence before shipping.']};
  let fi;
  if(emb){const m=msg[emb.lic];fi='<span class="chip '+m[0]+'">'+m[1]+'</span><p class="hint">'+(emb.size/1024).toFixed(0)+' KB source · '+glyphCount(el.font)+' glyphs used</p>';}
  else fi='<p class="hint">Preview font. On export only the glyphs you use are embedded in the .vsamp.</p>';
  let h=sec('Content',H.area('Text','text',el.text)+insRow());
  h+=sec('Font',H.sel('Font','font',el.font,fonts.map(f=>[f,f+(S.fonts[f]?' (embedded)':'')]),true)
    +'<button type="button" class="btn" data-act="font">Embed a font file…</button>'+fi
    +H.range('Size','size',8,160,1,el.size)+H.sel('Weight','weight',el.weight,[['400','Regular'],['500','Medium'],['600','Semibold'],['700','Bold']])
    +H.color('Colour','color',el.color)+H.sel('Align','align',el.align,['left','center','right'],true)+H.range('Letter spacing','spacing',-2,20,.5,el.spacing));
  h+=sec('Effects',H.sel('Bevel','bevel',el.bevel,[['none','None'],['outer-raised','Outer · raised'],['outer-sunken','Outer · sunken'],['inner-raised','Inner · raised'],['inner-sunken','Inner · sunken']])
    +H.chk('Drop shadow','shadow',el.shadow)+H.chk('Glow','glow',el.glow,true)+(el.glow?H.color('Glow colour','glowColor',el.glowColor):''));
  return h;
}

/* ---------- inspector markup: buttons, LCD, list, tags, project ---------- */
function looksRow(){
  return '<div class="chips">'+Object.keys(LOOKS).map(k=>'<button type="button" class="btn" data-act="lcdlook" data-v="'+k+'">'+k[0].toUpperCase()+k.slice(1)+'</button>').join('')+'</div>';
}
function buttonProps(el){
  let h=sec('Behaviour',H.sel('Mode','mode',el.mode,[['momentary','Momentary'],['toggle','Toggle'],['radio','Radio (picks a step)']],true)
    +H.sel('Tag','tag',el.tag,tagOpts())
    +(el.mode==='radio'?H.num('Step','value',el.value,0,999,1)+'<p class="hint">Step 0 is the first value (bank A on the bank tag).</p>':'')
    +(el.mode==='toggle'?'<p class="hint">Toggles the tag between 0 and 1.</p>':''));
  h+=sec('Label',H.txt('Label','label',el.label)+H.sel('Font','font',el.font,BUILTIN_FONTS)+H.range('Size','size',8,60,1,el.size)
    +H.sel('Weight','weight',el.weight,[['400','Regular'],['700','Bold']])+H.color('Text colour','textColor',el.textColor));
  h+=sec('Look',H.color('Colour','color',el.color)+H.range('Rounding','radius',0,40,1,el.radius)+H.range('Bevel size','bevelSize',1,10,1,el.bevelSize)
    +H.chk('LED','led',el.led,true)+((el.led||el.auto)?H.color('Lit colour','ledColor',el.ledColor):''));
  h+=sec('Automatic states',H.chk('Generate states','auto',el.auto,true)
    +(el.auto?H.range('Hover brighten','hover',0,30,1,el.hover)+H.range('Press darken','press',0,40,1,el.press)+H.range('Press travel','travel',0,4,.5,el.travel)
      +H.sel('Preview','preview',el.preview,[['auto','Live'],['normal','Normal'],['hover','Hover'],['down','Pressed'],['on','On']])
      +'<p class="hint">Pressed and On flip the bevel inward, so they follow the light angle. Pressed also darkens. On adds a lit tint.</p>':'<p class="hint">Off: the button keeps one look in every state.</p>'));
  return h+eventsHTML(el);
}
function fillSec(el,key,label){
  const m=el.fillMode||'solid';
  return sec('Fill',H.sel('Fill','fillMode',m,[['solid','Colour'],['gradient','Gradient'],['image','Image']],true)
    +H.color(m==='gradient'?'From':label||'Colour',key,el[key])
    +(m==='gradient'?H.color('To','fill2',el.fill2||'#000000')+H.chk('Follow the light angle','gradLight',el.gradLight!==false,true)+(el.gradLight===false?H.range('Angle','gradAngle',0,360,1,el.gradAngle||180):''):'')
    +(m==='image'?H.img('Image','bgImg',el.bgImg,Math.max(el.w,el.h),'PNG, JPG or SVG. Your own artwork works: a scanned screen, brushed metal, a photo.')
      +H.sel('Fit','bgFit',el.bgFit||'cover',[['cover','Fill (crop)'],['contain','Fit inside'],['stretch','Stretch'],['tile','Tile']]):''));
}
function lcdLook(el,extra){
  const scr=el.screen!==false;
  return sec('Look',looksRow()+H.color('Text colour','fg',el.fg)+H.range('Glow','glow',0,14,1,el.glow)+H.range('Rounding','radius',0,30,1,el.radius)+H.range('Padding','pad',0,40,1,el.pad))
    +fillSec(el,'bg','Background')
    +sec('LCD screen',H.chk('Screen effect (bezel and pixels)','screen',scr,true)
      +(scr?H.chk('Pixel grid','grid',el.grid,true)+(el.grid?H.range('Grid strength','gridAmt',.04,.5,.01,el.gridAmt):'')+(extra||''):''));
}
function lcdProps(el){
  return sec('Content',H.area('Text','text',el.text)+insRow())
    +sec('Text',H.sel('Font','font',el.font,BUILTIN_FONTS.concat(Object.keys(S.fonts))) +H.range('Size','size',8,120,1,el.size)+H.sel('Align','align',el.align,['left','center','right'],true))
    +lcdLook(el,H.chk('Scanlines','scan',el.scan));
}
function listProps(el){
  return sec('List',H.range('Visible rows','rows',2,16,1,el.rows)+H.chk('Show numbers (A01)','numbers',el.numbers)
    +H.sel('Selected row','selStyle',el.selStyle,[['invert','Inverted'],['arrow','Arrow'],['box','Outline']])
    +H.sel('Font','font',el.font,BUILTIN_FONTS.concat(Object.keys(S.fonts)))+H.range('Font size (0 = auto)','size',0,80,1,el.size)
    +'<p class="hint">Bound to the built-in list and bank tags, no setup needed. In Test mode click a row or scroll to choose. Edit the lists in the Lists tab.</p>')
    +lcdLook(el,H.chk('Scanlines','scan',el.scan))+eventsHTML(el);
}
function tagRow(t){
  const targets=[['none','Nothing'],['volume','Volume'],['cutoff','Filter cutoff'],['resonance','Filter resonance'],['wave','Waveform']];
  const opt=(arr,v)=>arr.map(a=>'<option value="'+a[0]+'"'+(a[0]===v?' selected':'')+'>'+a[1]+'</option>').join('');
  if(t.sys){
    return '<section class="tag sys" data-tid="'+t.id+'"><div class="t1"><span class="tname lock">'+t.name+'</span><span class="badge">built-in</span></div>'
      +'<p class="hint" style="margin:0 0 6px">'+(t.kind==='bank'?'The selected bank. Bank buttons and MIDI can drive it.':'The selected list in the current bank. The list selector, an encoder knob, and program change can drive it.')+'</p>'
      +'<div class="tprev"><input type="range" class="tv" min="0" max="1" step="0.001" value="'+t.value+'" aria-label="Test value"><output class="tr">'+esc(fmtTag(t,'name'))+'</output></div>'
      +'<div class="tuse"><span>Used by '+(S.els.filter(e=>e.tag===t.id||(t.kind==='list'&&e.type==='list')).length)+' elements</span></div></section>';
  }
  const kinds=[['number','Number'],['steps','Named steps'],['sync','Tempo sync']];
  let extra='';
  if(t.kind==='number') extra='<label>Min<input type="number" data-tk="min" value="'+t.min+'"></label><label>Max<input type="number" data-tk="max" value="'+t.max+'"></label>'
    +'<label>Unit<input type="text" data-tk="unit" value="'+esc(t.unit)+'" placeholder="Hz, dB, ms"></label><label>Decimals<input type="number" data-tk="dec" min="0" max="4" value="'+t.dec+'"></label>'
    +'<label class="wide">Scaling<select data-tk="scale"><option value="linear"'+(t.scale==='linear'?' selected':'')+'>Linear</option><option value="log"'+(t.scale==='log'?' selected':'')+'>Logarithmic (needs min above 0)</option></select></label>';
  else if(t.kind==='steps') extra='<label class="wide">Step names, comma separated<input type="text" data-tk="steps" value="'+esc(t.steps.join(', '))+'"></label>';
  else extra='<label class="wide">Counts in<select data-tk="basis" data-rb="1"><option value="note"'+(t.basis==='note'?' selected':'')+'>Note values (1/8, 1/4T …)</option><option value="bar"'+(t.basis==='bar'?' selected':'')+'>Fractions of a bar (follows the time signature)</option></select></label>';
  return '<section class="tag" data-tid="'+t.id+'"><div class="t1"><input type="text" class="tname" data-tk="name" value="'+esc(t.name)+'" aria-label="Tag name"><button type="button" class="x" data-act="delTag" title="Delete tag" aria-label="Delete tag">✕</button></div>'
    +'<div class="tgrid"><label>Type<select data-tk="kind" data-rb="1">'+opt(kinds,t.kind)+'</select></label><label>Drives audio<select data-tk="target">'+opt(targets,t.target)+'</select></label>'+extra+'</div>'
    +'<div class="tprev"><input type="range" class="tv" min="0" max="1" step="0.001" value="'+t.value+'" aria-label="Test value"><output class="tr">'+esc(fmtTag(t,'number'))+'</output></div>'
    +'<div class="tuse"><span>Used by '+(S.els.filter(e=>e.tag===t.id).length+usesTagText(t.name))+'</span><button type="button" class="btn" data-act="tagDef">Set default to this</button></div></section>';
}
function tagsHTML(){
  return '<p class="hint" style="margin-top:0">A tag is one value that knobs, faders, buttons, text, FX parameters and audio can all share. Add as many as you need.</p>'
    +'<p style="margin:0 0 10px"><button type="button" class="btn" data-act="addTag">+ New tag</button> <span class="muted">'+S.tags.length+' tags</span></p>'
    +S.tags.map(tagRow).join('')
    +sec('Text syntax','<div class="syn"><code>{tag.number}</code> real value and unit<br><code>{tag.percent}</code> 0 to 100%<br><code>{tag.name}</code> step name or note value<br><code>{tag.ms}</code> synced time at the current BPM<br><code>{tag.4/4}</code> same, in a pinned time signature<br><code>{list.name}</code> <code>{list.id}</code> <code>{list.number}</code><br><code>{list.next.name}</code> <code>{list.prev.name}</code><br><code>{list.count}</code> <code>{list.loading}</code><br><code>{bank.letter}</code> <code>{bank.name}</code><br><code>{timesig}</code> <code>{timesig.bar}</code> <code>{bpm}</code><br><code>{display.4/4}</code> one bar of 4/4 in ms</div><p class="hint">The older <code>{tag:format}</code> form is accepted too. Unknown tags show in red on the canvas.</p>');
}
function projectHTML(){
  const opts=(arr,v)=>arr.map(a=>'<option'+(a===v?' selected':'')+'>'+a+'</option>').join('');
  const nums=[];for(let i=1;i<=16;i++)nums.push(i);
  return sec('Canvas','<label class="f"><span>Background</span><input type="color" data-p="bg" value="'+S.canvas.bg+'"></label><p class="hint">Size is set in the bar above the canvas, up to 1920 × 1080.</p>')
    +sec('Lighting','<label class="f"><span>Light angle</span><input type="range" data-p="light" min="0" max="359" step="1" value="'+S.light+'"><output>'+S.light+'°</output></label><p class="hint">Every bevel, shadow, button state and bevelled text agrees on one light. 315° is from the top left.</p>')
    +sec('Tempo and time signature','<label class="f"><span>BPM</span><input type="number" data-p="bpm" min="40" max="300" value="'+S.bpm+'"></label>'
      +'<label class="f"><span>Time signature</span><span class="sigrow"><select data-p="sigN" aria-label="Beats per bar">'+opts(nums,S.sig.n)+'</select><b>/</b><select data-p="sigD" aria-label="Note value">'+opts([2,4,8,16],S.sig.d)+'</select></span></label>'
      +'<p class="hint">In the plugin both follow the host. Standalone they use these settings. One bar = '+msStr(msOfBeats(barBeats(S.sig)))+' now.</p>')
    +sec('Share','<div class="chips"><button type="button" class="btn" data-act="copyJson">Copy project JSON</button></div><textarea id="jsonOut" readonly hidden aria-label="Project JSON"></textarea><p class="hint">Images are listed by name and size only, not embedded.</p>');
}
function renderRight(){
  $$('#rightD .rtabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===S.tab)));
  $('#tagCount').textContent=S.tags.length;
  $('#listCount').textContent=S.lists.length;
  rbody.innerHTML=S.tab==='props'?propsHTML():S.tab==='tags'?tagsHTML():S.tab==='lists'?listsHTML():projectHTML();
}

/* ---------- multi selection, layer groups and moving layers ----------
   S.msel holds every selected element; S.sel stays the "main" one (the one clicked last).
   A layer group is a run of elements with the same el.grp, listed in S.lgroups. Groups are only for editing:
   the player ignores them, so nothing changes in how a library looks or plays. */
S.msel=[];S.lgroups=[];
const lgById=id=>S.lgroups.find(g=>g.id===id)||null;
function mselIds(){
  if(!S.sel){S.msel=[];return S.msel;}
  S.msel=S.msel.filter(id=>S.els.some(e=>e.id===id));
  if(S.msel.indexOf(S.sel)<0)S.msel=[S.sel];
  return S.msel;
}
const selEls=()=>{const ids=mselIds();return S.els.filter(e=>ids.indexOf(e.id)>=0);};
const grpMembers=gid=>S.els.filter(e=>e.grp===gid);
/* clicking a grouped element picks the whole group (Alt picks just the element) */
const withGroups=ids=>{const out=new Set(ids);ids.forEach(id=>{const e=S.els.find(x=>x.id===id);if(e&&e.grp)grpMembers(e.grp).forEach(m=>out.add(m.id));});return [...out];};
function setSel(ids,primary){
  ids=ids.filter((v,i)=>ids.indexOf(v)===i);
  S.msel=ids;S.sel=ids.length?(primary&&ids.indexOf(primary)>=0?primary:ids[ids.length-1]):null;
  if(S.sel&&S.tab!=='props')S.tab='props';
  renderLayers();placeSel();renderRight();
}
select=function(id){setSel(id?[id]:[],id);};
/* drop groups nobody is in, and keep each group's elements next to each other in the stacking order */
function tidyGroups(){
  S.lgroups=S.lgroups.filter(g=>S.els.some(e=>e.grp===g.id));
  S.els.forEach(e=>{if(e.grp&&!lgById(e.grp))delete e.grp;});
  for(const g of S.lgroups){
    const m=grpMembers(g.id);if(m.length<2)continue;
    const top=S.els.indexOf(m[m.length-1]),rest=S.els.filter(e=>e.grp!==g.id);
    let ins=0;for(let i=0;i<top;i++)if(S.els[i].grp!==g.id)ins++;
    rest.splice(ins,0,...m);S.els=rest;
  }
}
function groupSel(){
  const els=selEls();if(els.length<2){flash('Select two or more elements to group them');return;}
  const g={id:nid('g'),name:'Group '+(S.lgroups.length+1),open:true};S.lgroups.push(g);
  /* the group sits where its topmost element was */
  const top=S.els.indexOf(els[els.length-1]),rest=S.els.filter(e=>els.indexOf(e)<0);
  let ins=0;for(let i=0;i<top;i++)if(els.indexOf(S.els[i])<0)ins++;
  els.forEach(e=>{e.grp=g.id;});rest.splice(ins,0,...els);S.els=rest;
  tidyGroups();rerenderAll();setSel(els.map(e=>e.id),S.sel);flash(g.name+': '+els.length+' elements');
}
function ungroupSel(){
  const gs=new Set(selEls().map(e=>e.grp).filter(Boolean));if(!gs.size)return;
  S.els.forEach(e=>{if(gs.has(e.grp))delete e.grp;});tidyGroups();renderLayers();renderRight();
}
/* ---- moving, deleting, duplicating every selected element ---- */
function startMoveMulti(e){
  const els=selEls();if(!els.length)return;e.preventDefault();
  const sx=e.clientX,sy=e.clientY,o=els.map(el=>({el,x:el.x,y:el.y}));
  const bx0=Math.min(...els.map(el=>el.x)),by0=Math.min(...els.map(el=>el.y)),bw=Math.max(...els.map(el=>el.x+el.w))-bx0,bh=Math.max(...els.map(el=>el.y+el.h))-by0;
  let moved=false;
  drag(ev=>{
    let dx=(ev.clientX-sx)/S.z,dy=(ev.clientY-sy)/S.z;if(!moved&&Math.abs(dx)+Math.abs(dy)<.5)return;moved=true;
    if(S.snap&&!ev.altKey){
      const xs=[0,S.canvas.w/2,S.canvas.w],ys=[0,S.canvas.h/2,S.canvas.h];
      S.els.forEach(q=>{if(els.indexOf(q)>=0)return;xs.push(q.x,q.x+q.w/2,q.x+q.w);ys.push(q.y,q.y+q.h/2,q.y+q.h);});
      const nx=bx0+dx,ny=by0+dy,sxx=snap1([nx,nx+bw/2,nx+bw],xs),syy=snap1([ny,ny+bh/2,ny+bh],ys);
      if(sxx)dx+=sxx.d;if(syy)dy+=syy.d;showGuides(sxx?sxx.t:null,syy?syy.t:null);
    }else hideGuides();
    o.forEach(p=>{p.el.x=Math.round(p.x+dx);p.el.y=Math.round(p.y+dy);renderEl(p.el);});placeSel();syncPosFields();
  },hideGuides);
}
startMove=startMoveMulti;
delEl=function(){
  const els=selEls();if(!els.length)return;
  els.forEach(el=>{const n=nodes.get(el.id);if(n)n.remove();nodes.delete(el.id);});
  S.els=S.els.filter(e=>els.indexOf(e)<0);tidyGroups();rerenderAll();setSel([]);
};
dupEl=function(){
  const els=selEls();if(!els.length)return;
  /* a whole group duplicates into a new group; part of a group stays in it */
  const gmap={};els.forEach(e=>{if(e.grp&&!gmap[e.grp]&&grpMembers(e.grp).every(m=>els.indexOf(m)>=0)){const g=lgById(e.grp),ng={id:nid('g'),name:g.name+' copy',open:true};S.lgroups.push(ng);gmap[e.grp]=ng.id;}});
  const top=S.els.indexOf(els[els.length-1]),copies=els.map(el=>{const c=JSON.parse(JSON.stringify(el));c.id=nid('e');c.name=el.name+(els.length>1?'':' copy');c.x+=16;c.y+=16;if(c.grp&&gmap[c.grp])c.grp=gmap[c.grp];return c;});
  S.els.splice(top+1,0,...copies);
  copies.forEach(c=>{const n=document.createElement('div');n.className='el '+c.type;n.dataset.id=c.id;canvas.appendChild(n);nodes.set(c.id,n);});
  tidyGroups();rerenderAll();setSel(copies.map(c=>c.id));
};
moveZ=function(d){
  const ids=mselIds();if(!ids.length)return;
  const isSel=e=>ids.indexOf(e.id)>=0,a=S.els;
  if(d>0){for(let i=a.length-2;i>=0;i--)if(isSel(a[i])&&!isSel(a[i+1])){const t=a[i];a[i]=a[i+1];a[i+1]=t;}}
  else{for(let i=1;i<a.length;i++)if(isSel(a[i])&&!isSel(a[i-1])){const t=a[i];a[i]=a[i-1];a[i-1]=t;}}
  tidyGroups();rerenderAll();renderLayers();
};
function nudgeSel(dx,dy){selEls().forEach(el=>{el.x+=dx;el.y+=dy;renderEl(el);});placeSel();syncPosFields();}
/* ---- selection box: one box around everything, an outline on each element ---- */
const mselLayer=document.createElement('div');mselLayer.id='mselLayer';$('#viewport').insertBefore(mselLayer,$('#selbox'));
placeSel=function(){
  const sb=$('#selbox'),els=S.mode==='design'?selEls():[];
  mselLayer.innerHTML='';sb.classList.toggle('multi',els.length>1);
  if(!els.length){sb.hidden=true;return;}
  const z=S.z,x0=Math.min(...els.map(e=>e.x)),y0=Math.min(...els.map(e=>e.y)),x1=Math.max(...els.map(e=>e.x+e.w)),y1=Math.max(...els.map(e=>e.y+e.h));
  sb.hidden=false;sb.style.left=(x0*z)+'px';sb.style.top=(y0*z)+'px';sb.style.width=((x1-x0)*z)+'px';sb.style.height=((y1-y0)*z)+'px';
  if(els.length>1){
    els.forEach(e=>{const d=document.createElement('div');d.className='mselOne';d.style.cssText='left:'+(e.x*z)+'px;top:'+(e.y*z)+'px;width:'+(e.w*z)+'px;height:'+(e.h*z)+'px';mselLayer.appendChild(d);});
    const gs=new Set(els.map(e=>e.grp)),g=gs.size===1&&lgById([...gs][0]);
    $('#selTag').textContent=(g&&grpMembers(g.id).length===els.length?g.name+' · ':'')+els.length+' selected · '+Math.round(x1-x0)+'×'+Math.round(y1-y0);
  }else $('#selTag').textContent=els[0].name+' · '+Math.round(els[0].w)+'×'+Math.round(els[0].h);
};
/* ---- canvas: click, Shift/Ctrl-click, and a marquee from empty space ---- */
stageEl.addEventListener('pointerdown',e=>{
  if(S.mode!=='design'||S.view!=='design'||e.button!==0)return;
  if(e.target.closest('#selbox .hd'))return;
  let n=e.target.closest('#canvas .el');const add=e.shiftKey||e.ctrlKey||e.metaKey;
  /* a background that fills the whole canvas counts as empty space for dragging (a click still selects it) */
  let backdrop=null;
  if(n){const el=S.els.find(x=>x.id===n.dataset.id);if(el&&el.x<=1&&el.y<=1&&el.x+el.w>=S.canvas.w-1&&el.y+el.h>=S.canvas.h-1&&mselIds().indexOf(el.id)<0){backdrop=el;n=null;}}
  if(n){
    e.stopImmediatePropagation();
    const id=n.dataset.id,ids=e.altKey?[id]:withGroups([id]),cur=mselIds();
    if(add){const has=ids.every(i=>cur.indexOf(i)>=0);setSel(has?cur.filter(i=>ids.indexOf(i)<0):cur.concat(ids),has?null:id);if(has)return;}
    else if(e.altKey||!ids.every(i=>cur.indexOf(i)>=0))setSel(ids,id);   /* already selected: keep it, so the whole selection drags */
    else if(S.sel!==id){S.sel=id;renderLayers();renderRight();}
    startMoveMulti(e);return;
  }
  if(!backdrop&&!(e.target===stageEl||e.target===vp||e.target===canvas))return;
  e.preventDefault();e.stopImmediatePropagation();
  const r=canvas.getBoundingClientRect(),base=add?mselIds().slice():[],p0={x:(e.clientX-r.left)/S.z,y:(e.clientY-r.top)/S.z};
  const box=document.createElement('div');box.id='marquee';box.hidden=true;mselLayer.after(box);
  if(!add)setSel([]);
  let swept=false;
  drag(ev=>{
    const p1={x:(ev.clientX-r.left)/S.z,y:(ev.clientY-r.top)/S.z},x0=Math.min(p0.x,p1.x),y0=Math.min(p0.y,p1.y),x1=Math.max(p0.x,p1.x),y1=Math.max(p0.y,p1.y);
    if(x1-x0<3&&y1-y0<3)return;
    swept=true;box.hidden=false;box.style.cssText='left:'+(x0*S.z)+'px;top:'+(y0*S.z)+'px;width:'+((x1-x0)*S.z)+'px;height:'+((y1-y0)*S.z)+'px';
    const hit=S.els.filter(q=>elShown(q)&&q.x<x1&&q.x+q.w>x0&&q.y<y1&&q.y+q.h>y0).map(q=>q.id);
    setSel(base.concat(withGroups(hit)));
  },()=>{box.remove();if(!swept&&backdrop)setSel(add?base.concat([backdrop.id]):[backdrop.id],backdrop.id);});
},true);
/* ---- layers panel: groups as folders, Ctrl/Shift-click, drag to reorder or move into a group ---- */
renderLayers=function(){
  const ids=mselIds(),rows=S.els.slice().reverse().filter(e=>!S.layThisPage||elShown(e)),row=e=>'<li draggable="true" data-drag="'+e.id+'"><button type="button" class="lr'+(e.id===S.sel?' on':ids.indexOf(e.id)>=0?' msel':'')+'" data-id="'+e.id+'"><i class="ic '+e.type+'"></i><span>'+esc(e.name)+'</span><small>'+e.type+'</small></button></li>';
  let h='';
  for(let i=0;i<rows.length;){
    const e=rows[i],g=e.grp&&lgById(e.grp);
    if(!g){h+=row(e);i++;continue;}
    const run=[];while(i<rows.length&&rows[i].grp===g.id)run.push(rows[i++]);
    const allIn=run.every(m=>ids.indexOf(m.id)>=0);
    h+='<li class="lg'+(g.open?' open':'')+'" data-g="'+g.id+'"><div class="lgh'+(allIn?' on':'')+'" draggable="true" data-gdrag="'+g.id+'"><button type="button" class="lgt" data-gt="'+g.id+'" aria-label="'+(g.open?'Collapse':'Expand')+' '+esc(g.name)+'" aria-expanded="'+g.open+'">'+(g.open?'▾':'▸')+'</button><button type="button" class="lgn" data-gsel="'+g.id+'"><span>'+esc(g.name)+'</span><small>'+run.length+'</small></button></div>'
      +(g.open?'<ul>'+run.map(row).join('')+'</ul>':'')+'</li>';
  }
  $('#layers').innerHTML=h;$('#layerCount').textContent='· '+S.els.length;
};
$('#layers').addEventListener('click',e=>{
  const gt=e.target.closest('[data-gt]');if(gt){const g=lgById(gt.dataset.gt);if(g){g.open=!g.open;renderLayers();}e.stopPropagation();return;}
  const gs=e.target.closest('[data-gsel]');if(gs){const m=grpMembers(gs.dataset.gsel).map(x=>x.id);setSel(e.shiftKey||e.ctrlKey||e.metaKey?mselIds().concat(m):m);e.stopPropagation();return;}
  const lr=e.target.closest('.lr');if(!lr)return;e.stopPropagation();
  const id=lr.dataset.id,cur=mselIds();
  if(e.ctrlKey||e.metaKey){const has=cur.indexOf(id)>=0;setSel(has?cur.filter(i=>i!==id):cur.concat([id]),has?null:id);return;}
  if(e.shiftKey&&S.sel){const order=S.els.slice().reverse().map(x=>x.id),a=order.indexOf(S.sel),b=order.indexOf(id);setSel(cur.concat(order.slice(Math.min(a,b),Math.max(a,b)+1)),S.sel);return;}
  select(id);
},true);
let LDRAG=null;
$('#layers').addEventListener('dragstart',e=>{
  const gd=e.target.closest('[data-gdrag]'),ed=e.target.closest('[data-drag]');
  if(gd)LDRAG={grp:gd.dataset.gdrag,ids:grpMembers(gd.dataset.gdrag).map(x=>x.id)};
  else if(ed){const id=ed.dataset.drag,cur=mselIds();LDRAG={ids:cur.indexOf(id)>=0?cur.slice():[id]};}
  else return;
  e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','layers');}catch(err){}
});
function dropSpot(e){
  const t=e.target.closest('#layers [data-drag], #layers .lgh');if(!t||!LDRAG)return null;
  const r=t.getBoundingClientRect(),above=e.clientY<r.top+r.height/2;
  return{t,above,gh:t.classList.contains('lgh')?t.dataset.gdrag:null,id:t.dataset.drag||null};
}
const clearDrop=()=>$$('#layers .dropA,#layers .dropB').forEach(x=>x.classList.remove('dropA','dropB'));
$('#layers').addEventListener('dragover',e=>{const s=dropSpot(e);if(!s)return;e.preventDefault();clearDrop();s.t.classList.add(s.above?'dropA':'dropB');});
$('#layers').addEventListener('dragleave',e=>{if(!e.relatedTarget||!$('#layers').contains(e.relatedTarget))clearDrop();});
$('#layers').addEventListener('dragend',()=>{clearDrop();LDRAG=null;});
$('#layers').addEventListener('drop',e=>{
  const s=dropSpot(e);clearDrop();if(!s){LDRAG=null;return;}e.preventDefault();
  const mv=S.els.filter(x=>LDRAG.ids.indexOf(x.id)>=0);if(!mv.length){LDRAG=null;return;}
  let target,front,grp;   /* front: lands in front of target (above it in the list) */
  if(s.gh){
    const m=grpMembers(s.gh);
    if(LDRAG.grp||!s.above&&!lgById(s.gh).open){target=s.above?m[m.length-1]:m[0];front=s.above;grp=null;}
    else{target=m[m.length-1];front=true;grp=s.gh;}   /* onto a group header: join the group, at its top */
    if(LDRAG.grp===s.gh){LDRAG=null;return;}
  }else{
    target=S.els.find(x=>x.id===s.id);front=s.above;grp=target.grp||null;
    if(LDRAG.grp&&grp&&grp!==LDRAG.grp){const m=grpMembers(grp);target=front?m[m.length-1]:m[0];grp=null;}   /* a group never lands inside another */
    if(LDRAG.grp)grp=LDRAG.grp;
  }
  if(mv.indexOf(target)>=0){LDRAG=null;return;}
  const rest=S.els.filter(x=>mv.indexOf(x)<0),at=rest.indexOf(target)+(front?1:0);
  rest.splice(at,0,...mv);S.els=rest;
  if(!LDRAG.grp)mv.forEach(x=>{if(grp)x.grp=grp;else delete x.grp;});
  LDRAG=null;tidyGroups();rerenderAll();renderLayers();placeSel();renderRight();
});
/* ---- inspector for several elements: group, align, distribute ---- */
const propsHTMLOne=propsHTML;
propsHTML=function(){
  const els=selEls();if(els.length<2)return propsHTMLOne();
  const gs=new Set(els.map(e=>e.grp)),g=gs.size===1&&lgById([...gs][0]),whole=g&&grpMembers(g.id).length===els.length;
  let h='<div class="phead"><b class="pname">'+(whole?esc(g.name):els.length+' elements')+'</b><span class="badge">'+els.length+' selected</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-act="fwd">Forward</button><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="dup">Duplicate</button><button type="button" class="btn danger" data-act="del">Delete</button></div>';
  h+=sec('Group',whole?'<label class="f"><span>Name</span><input type="text" data-gname="'+g.id+'" value="'+esc(g.name)+'"></label><div class="chips"><button type="button" class="btn" data-mg="ungroup">Ungroup</button></div>'
    :'<div class="chips"><button type="button" class="btn" data-mg="group">Group them</button>'+([...gs].some(Boolean)?'<button type="button" class="btn" data-mg="ungroup">Ungroup</button>':'')+'</div><p class="hint">Ctrl+G groups, Ctrl+Shift+G ungroups. A group moves and selects as one; Alt-click picks one element inside it.</p>');
  const A=[['l','Left'],['c','Centre'],['r','Right'],['t','Top'],['m','Middle'],['b','Bottom']];
  h+=sec('Align','<div class="chips">'+A.map(a=>'<button type="button" class="btn" data-al="'+a[0]+'">'+a[1]+'</button>').join('')+'</div>'
    +(els.length>2?'<div class="chips"><button type="button" class="btn" data-al="dh">Space evenly across</button><button type="button" class="btn" data-al="dv">Space evenly down</button></div>':''));
  return h;
};
function alignSel(k){
  const els=selEls();if(els.length<2)return;
  const x0=Math.min(...els.map(e=>e.x)),y0=Math.min(...els.map(e=>e.y)),x1=Math.max(...els.map(e=>e.x+e.w)),y1=Math.max(...els.map(e=>e.y+e.h));
  if(k==='dh'||k==='dv'){
    const v=k==='dh',s=els.slice().sort((a,b)=>v?a.x-b.x:a.y-b.y),tot=s.reduce((a,e)=>a+(v?e.w:e.h),0),gap=((v?x1-x0:y1-y0)-tot)/(s.length-1);let p=v?x0:y0;
    s.forEach(e=>{if(v)e.x=Math.round(p);else e.y=Math.round(p);p+=(v?e.w:e.h)+gap;});
  }else els.forEach(e=>{
    if(k==='l')e.x=x0;if(k==='r')e.x=x1-e.w;if(k==='c')e.x=Math.round((x0+x1-e.w)/2);
    if(k==='t')e.y=y0;if(k==='b')e.y=y1-e.h;if(k==='m')e.y=Math.round((y0+y1-e.h)/2);
  });
  els.forEach(renderEl);placeSel();
}
rbody.addEventListener('click',e=>{
  const al=e.target.closest('[data-al]');if(al){alignSel(al.dataset.al);return;}
  const mg=e.target.closest('[data-mg]');if(mg){if(mg.dataset.mg==='group')groupSel();else ungroupSel();}
});
rbody.addEventListener('input',e=>{const t=e.target;if(!t.dataset.gname)return;const g=lgById(t.dataset.gname);if(g){g.name=t.value;renderLayers();placeSel();}});
/* ---- saved with the project ---- */
(function(){
  const s0=snapshot;snapshot=function(){const s=s0();s.lgroups=JSON.parse(JSON.stringify(S.lgroups));return s;};
  const r0=restore;restore=function(sn){r0(sn);S.lgroups=sn&&sn.lgroups?JSON.parse(JSON.stringify(sn.lgroups)):[];S.msel=[];tidyGroups();};
})();

/* ---------- pages (tabs inside one instrument) ----------
   S.pages lists the pages. The page being shown is a system tag named "page" whose steps are the page names,
   so a radio button on it works as a tab, rules can switch pages, and the player needs nothing new. */
S.pages=[];S.layThisPage=true;
function syncPageTag(){
  let t=pageTag();
  if(S.pages.length&&!t){t=mkTag('page','steps',{sys:true,steps:[]});S.tags.push(t);}
  if(!t)return;
  if(!S.pages.length){S.tags=S.tags.filter(x=>x!==t);S.els.forEach(e=>{if(e.tag===t.id)e.tag='';});return;}
  t.steps=S.pages.map(p=>p.name);const n=t.steps.length;t.value=n>1?Math.round(t.value*(n-1))/(n-1):0;t.def=0;
}
function pagesChanged(){syncPageTag();rerenderAll();showPage();refreshDisplays();mselIds();S.msel=S.msel.filter(id=>{const e=S.els.find(x=>x.id===id);return e&&elShown(e);});if(S.sel&&S.msel.indexOf(S.sel)<0)S.sel=S.msel[S.msel.length-1]||null;renderPageBar();renderLayers();placeSel();renderRight();}
function goPage(i){const t=pageTag();if(!t)return;setStep(t,i);}
function addPage(){
  const p={id:nid('pg'),name:'Page '+(S.pages.length+1)};S.pages.push(p);
  /* a background that fills the canvas belongs on every page */
  if(S.pages.length===1)S.els.forEach(e=>{if(e.x<=1&&e.y<=1&&e.x+e.w>=S.canvas.w-1&&e.y+e.h>=S.canvas.h-1)e.always=true;});
  pagesChanged();goPage(S.pages.length-1);
  flash(S.pages.length===1?'Page 1 holds everything so far. Add another page to start a second tab.':p.name+' added. Elements you add now go on it.');
}
function delPage(id){
  const i=S.pages.findIndex(p=>p.id===id);if(i<0)return;const name=S.pages[i].name;
  S.pages.splice(i,1);S.els.forEach(e=>{if(e.page===id)delete e.page;});pagesChanged();
  flash(name+' removed. Its elements moved to the first page.');
}
function renderPageBar(){
  const pb=$('#pageBar'),cur=curPageIdx();
  pb.innerHTML='<span class="muted">Pages</span>'+S.pages.map((p,i)=>'<button type="button" class="pgchip" data-pgo="'+i+'" aria-pressed="'+(i===cur)+'" title="Double-click to rename">'+esc(p.name)+'</button>').join('')
    +'<button type="button" class="pgchip add" data-pgadd="1" title="Add a page" aria-label="Add a page">+</button>';
  $('#layPage').hidden=S.pages.length<2;$('#layPage').setAttribute('aria-pressed',String(S.layThisPage));
}
$('#pageBar').addEventListener('click',e=>{
  if(e.target.closest('[data-pgadd]')){addPage();return;}
  const b=e.target.closest('[data-pgo]');if(b)goPage(+b.dataset.pgo);
});
$('#pageBar').addEventListener('dblclick',e=>{
  const b=e.target.closest('[data-pgo]');if(!b)return;const p=S.pages[+b.dataset.pgo];
  const inp=document.createElement('input');inp.type='text';inp.className='pgedit';inp.value=p.name;inp.setAttribute('aria-label','Page name');b.replaceWith(inp);inp.focus();inp.select();
  let done=false;const fin=ok=>{if(done)return;done=true;const v=inp.value.trim();if(ok&&v)p.name=v;pagesChanged();};
  inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')fin(true);else if(ev.key==='Escape')fin(false);ev.stopPropagation();});
  inp.addEventListener('blur',()=>fin(true));
});
$('#layPage').addEventListener('click',()=>{S.layThisPage=!S.layThisPage;renderPageBar();renderLayers();});
/* switching pages anywhere (tab buttons in Test, rules, the bar) keeps the editor in step */
const onTagPg=onTag;
onTag=function(t){onTagPg(t);if(t.sys&&t.name==='page'){renderPageBar();renderLayers();if(S.mode==='design'){S.msel=mselIds().filter(id=>{const x=S.els.find(q=>q.id===id);return x&&elShown(x);});if(S.sel&&S.msel.indexOf(S.sel)<0)S.sel=S.msel[S.msel.length-1]||null;placeSel();renderRight();}}};
/* ---- inspector: which page, always show, and "opens page" for buttons ---- */
function pageSecHTML(els){
  if(!S.pages.length)return sec('Page','<p class="hint">One page so far. Add pages with + above the canvas to make tabs.</p><div class="chips"><button type="button" class="btn" data-pgadd2="1">Add pages</button></div>');
  const ps=new Set(els.map(e=>S.pages[elPageIdx(e)].id)),pv=ps.size===1?[...ps][0]:'',al=els.every(e=>e.always),some=!al&&els.some(e=>e.always);
  let h='<label class="f"><span>Page</span><select data-pgset="1"'+(al?' disabled':'')+'>'+(pv?'':'<option value="" selected>Mixed</option>')+S.pages.map(p=>'<option value="'+p.id+'"'+(p.id===pv?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'
    +'<label class="f chk"><input type="checkbox" data-pgalways="1"'+(al?' checked':'')+'><span>Always show (on every page)'+(some?' · some are':'')+'</span></label>';
  const pt=pageTag();
  if(els.length===1&&els[0].type==='button'&&pt){
    const b=els[0],opens=b.tag===pt.id&&b.mode==='radio'?(S.pages[b.value]||{}).id||'':'';
    h+='<label class="f"><span>Opens page</span><select data-pgopen="1"><option value="">— nothing —</option>'+S.pages.map(p=>'<option value="'+p.id+'"'+(p.id===opens?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'
      +'<p class="hint">Makes this button a tab: clicking it shows that page, and its light shows when the page is open. Tab buttons usually want Always show.</p>';
  }
  return sec('Page',h);
}
const propsHTMLPg=propsHTML;
propsHTML=function(){
  const h=propsHTMLPg(),els=selEls();if(!els.length)return h;
  const i=h.indexOf('<div class="acts">'),j=i<0?-1:h.indexOf('</div>',i);
  return j<0?h+pageSecHTML(els):h.slice(0,j+6)+pageSecHTML(els)+h.slice(j+6);
};
rbody.addEventListener('change',e=>{
  const t=e.target,els=selEls();if(!els.length)return;
  if(t.dataset.pgset&&t.value){els.forEach(x=>{x.page=t.value;});pagesChanged();}
  else if(t.dataset.pgalways){els.forEach(x=>{x.always=t.checked;});pagesChanged();}
  else if(t.dataset.pgopen!=null&&t.dataset.pgopen!==undefined&&t.matches('[data-pgopen]')){
    const b=els[0],pt=pageTag(),i=S.pages.findIndex(p=>p.id===t.value);
    if(i<0){if(b.tag===pt.id)b.tag='';}else{b.tag=pt.id;b.mode='radio';b.value=i;b.led=true;}
    renderEl(b);renderRight();
  }
});
rbody.addEventListener('click',e=>{if(e.target.closest('[data-pgadd2]')){addPage();addPage();}});
/* ---- Project tab: rename, reorder and remove pages ---- */
const projectHTMLPg=projectHTML;
projectHTML=function(){
  return sec('Pages',(S.pages.length?S.pages.map((p,i)=>'<div class="pgrow"><input type="text" data-pgname="'+p.id+'" value="'+esc(p.name)+'" aria-label="Page '+(i+1)+' name">'
      +'<button type="button" class="btn" data-pgup="'+i+'"'+(i?'':' disabled')+' aria-label="Move '+esc(p.name)+' up">↑</button><button type="button" class="btn danger" data-pgdel="'+p.id+'" aria-label="Remove '+esc(p.name)+'">✕</button></div>').join(''):'<p class="hint">No pages: everything is on one screen.</p>')
    +'<div class="chips"><button type="button" class="btn" data-pgadd3="1">Add a page</button></div><p class="hint">Each page is a tab of the instrument. Elements with Always show appear on every page.</p>')+projectHTMLPg();
};
rbody.addEventListener('input',e=>{const t=e.target;if(!t.dataset.pgname)return;const p=S.pages.find(x=>x.id===t.dataset.pgname);if(p){p.name=t.value||p.name;syncPageTag();renderPageBar();refreshDisplays();}});
rbody.addEventListener('click',e=>{
  const a=e.target.closest('[data-pgadd3]'),d=e.target.closest('[data-pgdel]'),u=e.target.closest('[data-pgup]');
  if(a)addPage();
  else if(d)delPage(d.dataset.pgdel);
  else if(u){const i=+u.dataset.pgup;if(i>0){const cur=curPageIdx(),p=S.pages.splice(i,1)[0];S.pages.splice(i-1,0,p);
    S.els.forEach(x=>{const pt=pageTag();if(pt&&x.tag===pt.id&&x.mode==='radio'){if(x.value===i)x.value=i-1;else if(x.value===i-1)x.value=i;}});
    pagesChanged();goPage(cur===i?i-1:cur===i-1?i:cur);}}
});
/* ---- saved with the project ---- */
(function(){
  const s0=snapshot;snapshot=function(){const s=s0();s.pages=JSON.parse(JSON.stringify(S.pages));return s;};
  const r0=restore;restore=function(sn){r0(sn);S.pages=sn&&sn.pages?JSON.parse(JSON.stringify(sn.pages)):[];syncPageTag();};
})();
renderPageBar();

/* ---------- inspector events ---------- */
rbody.addEventListener('toggle',e=>{const d=e.target;if(d&&d.dataset&&d.dataset.sec){if(d.open)closed.delete(d.dataset.sec);else closed.add(d.dataset.sec);}},true);
rbody.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.p){
    const k=t.dataset.p;
    if(k==='bg'){S.canvas.bg=t.value;layout();}
    else if(k==='light'){S.light=+t.value;t.nextElementSibling.textContent=t.value+'°';rerenderAll();}
    else if(k==='bpm'){const v=parseFloat(t.value);if(v>=40)setBpm(v);}
    else if(k==='sigN'||k==='sigD'){setSig($('[data-p="sigN"]',rbody).value,$('[data-p="sigD"]',rbody).value);}
    return;
  }
  if(t.classList.contains('tv')){const tag=tagById(t.closest('.tag').dataset.tid);if(tag)setTag(tag,parseFloat(t.value));return;}
  if(t.dataset.tk){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid),k=t.dataset.tk; if(!tag||k==='name'||tag.sys) return;
    if(k==='steps'){const a=t.value.split(',').map(s=>s.trim()).filter(Boolean);if(a.length<2)return;tag.steps=a;}
    else if(k==='min'||k==='max'||k==='dec'){const v=parseFloat(t.value);if(isNaN(v))return;tag[k]=v;}
    else tag[k]=t.value;
    if(k==='kind'||k==='basis') return;
    const c=stepCount(tag); if(c>1) tag.value=Math.round(tag.value*(c-1))/(c-1);
    onTag(tag); return;
  }
  const k=t.dataset.k,el=sel(); if(!k||!el) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.type==='number'||t.type==='range') v=parseFloat(t.value); else v=t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  el[k]=v;
  if(t.type==='range'&&t.nextElementSibling&&t.nextElementSibling.tagName==='OUTPUT') t.nextElementSibling.textContent=v;
  if(k==='name'){renderLayers();placeSel();return;}
  if(el.type==='knob'&&(k==='w'||k==='h')){el.w=el.h=Math.max(12,v);}
  if(el.type==='fader'&&k==='orient'){const w=el.w;el.w=el.h;el.h=w;}
  renderEl(el); placeSel();
});
rbody.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.p==='sigN'||t.dataset.p==='sigD'){renderRight();return;}
  if(t.dataset.tk==='name'){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid); if(!tag) return;
    const nn=t.value.replace(/[^A-Za-z0-9_]/g,'');
    if(!nn||nn==='bpm'||nn==='timesig'||S.tags.some(x=>x!==tag&&x.name===nn)){t.value=tag.name;flash('Tag names must be unique letters, numbers or _');return;}
    const old=tag.name; tag.name=nn; t.value=nn; renameInTexts(old,nn); rerenderAll(); return;
  }
  if(t.dataset.tk==='kind'||t.dataset.tk==='basis'){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid); if(!tag) return;
    if(tag.kind==='steps'&&tag.steps.length<2) tag.steps=['A','B','C'];
    const c=stepCount(tag); if(c>1){tag.value=Math.round(tag.value*(c-1))/(c-1);tag.def=Math.round(tag.def*(c-1))/(c-1);}
    rerenderAll(); applyAudio(); renderRight(); return;
  }
  if(t.dataset.rb&&t.dataset.k){
    const el=sel();
    if(el&&el.type==='knob'&&(t.dataset.k==='w'||t.dataset.k==='h')){el.w=el.h=Math.max(12,parseFloat(t.value)||el.w);renderEl(el);placeSel();}
    renderRight();
  }
});
document.body.addEventListener('click',e=>{
  const lr=e.target.closest('.lr'); if(lr){select(lr.dataset.id);return;}
  const tb=e.target.closest('#rightD [data-tab]'); if(tb){S.tab=tb.dataset.tab;renderRight();return;}
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act,el=sel(),k=b.dataset.k;
  switch(act){
    case 'add': addEl(b.dataset.type); break;
    case 'addcomp': addComp(b.dataset.comp); break;
    case 'fwd': moveZ(1); break;
    case 'back': moveZ(-1); break;
    case 'dup': dupEl(); break;
    case 'del': delEl(); break;
    case 'pick': if(el) pickImage(id=>{el[k]=id;renderEl(el);renderRight();}); break;
    case 'clear': if(el){el[k]=null;renderEl(el);renderRight();} break;
    case 'mat': if(el){el.mat=b.dataset.v||null;renderEl(el);renderRight();} break;
    case 'lcdlook': if(el&&LOOKS[b.dataset.v]){Object.assign(el,LOOKS[b.dataset.v]);renderEl(el);renderRight();} break;
    case 'font': if(el) pickFont(fam=>{el.font=fam;renderEl(el);renderRight();flash('Font loaded: '+fam);}); break;
    case 'ins': {
      if(!el) break; const ta=$('textarea[data-k="text"]',rbody),tag=$('#insTag').value,fmt=$('#insFmt').value;
      if(!ta||!tag) break; const ins='{'+tag+'.'+fmt+'}',pos=ta.selectionStart==null?ta.value.length:ta.selectionStart;
      ta.value=ta.value.slice(0,pos)+ins+ta.value.slice(ta.selectionEnd==null?pos:ta.selectionEnd);
      el.text=ta.value; renderEl(el); break;
    }
    case 'addTag': {
      let i=1; while(tagByName('tag'+i)) i++;
      S.tags.push(mkTag('tag'+i,'number',{min:0,max:100,dec:0,value:.5,def:.5})); renderRight(); break;
    }
    case 'delTag': {
      const tag=tagById(b.closest('.tag').dataset.tid); if(!tag) break;
      if(tag.sys){flash('Built-in tags cannot be deleted');break;}
      S.tags.splice(S.tags.indexOf(tag),1); S.els.forEach(x=>{if(x.tag===tag.id)x.tag='';});
      rerenderAll(); applyAudio(); renderRight(); break;
    }
    case 'tagDef': {const tag=tagById(b.closest('.tag').dataset.tid);if(tag){tag.def=tag.value;flash('Default for '+tag.name+' updated');}break;}
    case 'copyJson': {
      const data=JSON.stringify({app:'VisuMaker designer draft',canvas:S.canvas,light:S.light,bpm:S.bpm,timesig:S.sig,banks:S.banks,groups:S.groups,lists:S.lists,tags:S.tags,elements:S.els,fx:S.fx.graphs,assets:Object.fromEntries(Object.entries(S.assets).map(a=>[a[0],{name:a[1].name,w:a[1].w,h:a[1].h}]))},null,2);
      const out=$('#jsonOut'); out.value=data; out.hidden=false;
      const fallback=()=>{out.select();flash('Copy was blocked here. The JSON is selected, press Ctrl+C.');};
      try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(()=>flash('Project JSON copied'),fallback); else fallback(); }catch(err){fallback();}
      break;
    }
  }
});

/* ---------- toolbar, modes ---------- */
function syncToolbar(){
  $('#cw').value=S.canvas.w; $('#ch').value=S.canvas.h; $('#zoom').value=S.zoom; $('#snap').checked=S.snap; $('#preset').value=''; $('#bpm').value=S.bpm;
  syncSig();
}
function syncSig(){
  const n=$('#sigN'),d=$('#sigD'); if(n) n.value=S.sig.n; if(d) d.value=S.sig.d;
}
$('#cw').addEventListener('change',()=>setCanvas(parseFloat($('#cw').value),S.canvas.h));
$('#ch').addEventListener('change',()=>setCanvas(S.canvas.w,parseFloat($('#ch').value)));
$('#preset').addEventListener('change',e=>{const v=e.target.value;if(v){const p=v.split('x');setCanvas(+p[0],+p[1]);}e.target.value='';});
$('#zoom').addEventListener('change',e=>{S.zoom=e.target.value;layout();});
$('#snap').addEventListener('change',e=>{S.snap=e.target.checked;});
$('#bpm').addEventListener('input',e=>{const v=parseFloat(e.target.value);if(v>=40)setBpm(v);});
$('#resetVals').addEventListener('click',()=>{S.tags.forEach(t=>{if(!t.sys)t.value=t.def;});rerenderAll();applyAudio();fxRefreshParams();if(S.tab==='tags')renderRight();});
$('#sigN').addEventListener('change',()=>setSig($('#sigN').value,$('#sigD').value));
$('#sigD').addEventListener('change',()=>setSig($('#sigN').value,$('#sigD').value));
function setMode(m){
  S.mode=m; stageEl.classList.toggle('design',m==='design'); stageEl.classList.toggle('test',m==='test');
  $('#mDesign').setAttribute('aria-pressed',String(m==='design')); $('#mTest').setAttribute('aria-pressed',String(m==='test'));
  $('#testbar').hidden=m!=='test'; hideGuides(); placeSel(); layout(); rerenderAll();
}
const VIEWS={design:['leftD','centerD','rightD'],fx:['leftF','centerF','rightF'],map:['leftM','centerM','rightM'],samples:['leftS','centerS','rightS'],sound:['leftM','centerN','rightN'],export:['leftX','centerX','rightX']};
function setView(v){
  S.view=v;
  const show=new Set(VIEWS[v]||[]);Object.keys(VIEWS).forEach(k=>VIEWS[k].forEach(id=>{$('#'+id).hidden=!show.has(id);}));
  $('#modeSeg').hidden=v!=='design';
  $$('#viewTabs [data-view]').forEach(b=>{b.classList.toggle('on',b.dataset.view===v);if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(v==='fx') fxRender(); else if(v==='map'){mapUI();mapStart();} else if(v==='samples'){if(!smSample()&&S.samples[0])S.smp.sel=S.samples[0].id;smPanelRender();smStart();smFit();} else if(v==='export'){exRender();} else if(v==='sound'){soundEnter();} else {layout();rerenderAll();}
}
$$('#viewTabs [data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#mDesign').addEventListener('click',()=>setMode('design'));
$('#mTest').addEventListener('click',()=>setMode('test'));
window.addEventListener('blur',()=>{AU.v.forEach((v,m)=>synthOff(m));sampPanic();$$('#kb .on').forEach(b=>b.classList.remove('on'));});


/* ---------- events: rules engine and form ---------- */
const EVENTS={button:['press','release','hold','doubleclick'],knob:['change'],fader:['change'],list:['change','load']};
const VERBS=[['set','set'],['add','add'],['sub','subtract'],['toggle','toggle'],['next','next'],['prev','previous'],['reset','reset'],['random','random']];
const NOVAL=['toggle','next','prev','reset','random'];
let evDepth=0;
function parseValue(t,text){
  text=String(text==null?'':text).trim(); if(!text) return null;
  if(t.kind!=='number'){
    const st=stepsOf(t),n=st.length,i=st.findIndex(s=>s.toLowerCase()===text.toLowerCase());
    if(i>=0) return n>1?i/(n-1):0;
    const k=parseInt(text,10); if(!isNaN(k)&&k>=1&&k<=n) return n>1?(k-1)/(n-1):0;
    return null;
  }
  let v=parseFloat(text.replace(',','.')); if(isNaN(v)) return null;
  if(/%$/.test(text)&&t.unit!=='%') return clamp(v/100,0,1);
  if(/khz$/i.test(text)) v*=1000;
  return clamp(realToNorm(t,v),0,1);
}
function parseDelta(t,text){
  text=String(text==null?'':text).trim(); if(!text) return null;
  const v=parseFloat(text.replace(',','.')); if(isNaN(v)) return null;
  if(t.kind!=='number'){const n=stepCount(t);return n>1?v/(n-1):0;}
  if(/%$/.test(text)&&t.unit!=='%') return v/100;
  return realToNorm(t,realOf(t)+v)-t.value;
}
function testCond(c){
  const t=tagByName(c.tag); if(!t) return false;
  const pv=parseValue(t,c.val); if(pv===null) return false;
  if(c.op==='is') return Math.abs(pv-t.value)<.0015;
  if(c.op==='not') return Math.abs(pv-t.value)>=.0015;
  return c.op==='above'?t.value>pv:t.value<pv;
}
function runAct(a){
  const t=tagByName(a.tag); if(!t) return;
  switch(a.verb){
    case 'set': {const v=parseValue(t,a.val);if(v!==null)setTag(t,v);break;}
    case 'add': case 'sub': {const d=parseDelta(t,a.val);if(d!==null)setTag(t,t.value+(a.verb==='add'?d:-d));break;}
    case 'toggle': setTag(t,t.value>=.5?0:1); break;
    case 'next': stepBy(t,1); break;
    case 'prev': stepBy(t,-1); break;
    case 'reset': setTag(t,t.def); break;
    case 'random': {const n=stepCount(t);setTag(t,n>1?Math.floor(Math.random()*n)/(n-1):Math.random());break;}
  }
}
function fireEvent(el,ev){
  if(!el.rules||!el.rules.length||evDepth>6) return;
  evDepth++;
  try{
    el.rules.forEach(r=>{
      if(r.when!==ev) return;
      if(r.cond&&!testCond(r.cond)) return;
      r.acts.forEach(runAct);
    });
  }finally{evDepth--;}
}
function actText(a){
  switch(a.verb){
    case 'set': return a.tag+' = '+(a.val||'?');
    case 'add': return a.tag+' + '+(a.val||'?');
    case 'sub': return a.tag+' - '+(a.val||'?');
    default: return a.tag+'.'+a.verb;
  }
}
function ruleText(r){
  const ops={is:'=',not:'!=',above:'>',below:'<'};
  return '{on.'+r.when+' -> '+(r.cond?'if '+r.cond.tag+' '+ops[r.cond.op]+' '+r.cond.val+' -> ':'')+r.acts.map(actText).join(' ; ')+'}';
}
const defTag=()=>S.tags.find(t=>!t.sys)||S.tags[0];
const defVal=name=>{const t=tagByName(name);return t&&t.kind!=='number'?stepsOf(t)[0]:'50%';};
function tagSelect(cur,rk,ri,ai){
  return '<select data-rk="'+rk+'" data-ri="'+ri+'"'+(ai!==undefined?' data-ai="'+ai+'"':'')+'>'+S.tags.map(t=>'<option'+(t.name===cur?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select>';
}
function valControl(a,rk,ri,ai,cur){
  const t=tagByName(a.tag||'');
  const attrs=' data-rk="'+rk+'" data-ri="'+ri+'"'+(ai!==undefined?' data-ai="'+ai+'"':'');
  if(t&&t.kind!=='number'&&(rk==='cval'||a.verb==='set')){
    return '<select'+attrs+'>'+stepsOf(t).map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select>';
  }
  return '<input type="text"'+attrs+' value="'+esc(cur||'')+'" placeholder="50% or 440 Hz">';
}
function ruleHTML(r,ri,evs){
  let h='<div class="rule"><div class="rh"><label>When <select data-rk="when" data-ri="'+ri+'">'+evs.map(e=>'<option'+(e===r.when?' selected':'')+'>'+e+'</option>').join('')+'</select></label><button type="button" class="x" data-ev="delRule" data-ri="'+ri+'" aria-label="Remove event" title="Remove event">✕</button></div>';
  if(r.cond){
    h+='<div class="rc"><span>If</span>'+tagSelect(r.cond.tag,'ctag',ri)+'<select data-rk="cop" data-ri="'+ri+'">'+[['is','is'],['not','is not'],['above','above'],['below','below']].map(o=>'<option value="'+o[0]+'"'+(o[0]===r.cond.op?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+valControl(r.cond,'cval',ri,undefined,r.cond.val)+'<button type="button" class="x" data-ev="noCond" data-ri="'+ri+'" aria-label="Remove condition" title="Remove condition">✕</button></div>';
  }else h+='<button type="button" class="lnk" data-ev="addCond" data-ri="'+ri+'">+ add condition</button>';
  r.acts.forEach((a,ai)=>{
    h+='<div class="ra"><select data-rk="verb" data-ri="'+ri+'" data-ai="'+ai+'">'+VERBS.map(v=>'<option value="'+v[0]+'"'+(v[0]===a.verb?' selected':'')+'>'+v[1]+'</option>').join('')+'</select>'+tagSelect(a.tag,'atag',ri,ai)+(NOVAL.indexOf(a.verb)>=0?'':'<span>'+(a.verb==='set'?'to':'by')+'</span>'+valControl(a,'val',ri,ai,a.val))+'<button type="button" class="x" data-ev="delAct" data-ri="'+ri+'" data-ai="'+ai+'" aria-label="Remove action" title="Remove action">✕</button></div>';
  });
  h+='<button type="button" class="lnk" data-ev="addAct" data-ri="'+ri+'">+ add action</button><code class="rtxt">'+esc(ruleText(r))+'</code></div>';
  return h;
}
function eventsHTML(el){
  const evs=EVENTS[el.type]; if(!evs) return '';
  if(!el.rules) el.rules=[];
  return sec('Events',el.rules.map((r,ri)=>ruleHTML(r,ri,evs)).join('')+'<button type="button" class="btn" data-ev="addRule">+ Add event</button><p class="hint">Rules run top to bottom in Test mode. The grey line is the same rule in short text syntax.</p>');
}
function applyRk(t,rk){
  const el=sel(); if(!el||!el.rules) return;
  const r=el.rules[+t.dataset.ri]; if(!r) return;
  const a=t.dataset.ai!==undefined?r.acts[+t.dataset.ai]:null;
  if(rk==='when') r.when=t.value;
  else if(rk==='ctag'&&r.cond){r.cond.tag=t.value;r.cond.val=defVal(t.value);}
  else if(rk==='cop'&&r.cond) r.cond.op=t.value;
  else if(rk==='cval'&&r.cond) r.cond.val=t.value;
  else if(a&&rk==='verb'){a.verb=t.value;a.val=a.verb==='set'?defVal(a.tag):'';}
  else if(a&&rk==='atag'){a.tag=t.value;a.val=a.verb==='set'?defVal(a.tag):'';}
  else if(a&&rk==='val') a.val=t.value;
}
rbody.addEventListener('change',e=>{
  const t=e.target,rk=t.dataset&&t.dataset.rk; if(!rk) return;
  applyRk(t,rk); renderRight();
});
rbody.addEventListener('input',e=>{
  const t=e.target; if(!t.dataset||t.tagName!=='INPUT'||(t.dataset.rk!=='val'&&t.dataset.rk!=='cval')) return;
  applyRk(t,t.dataset.rk);
  const el=sel(),rule=t.closest('.rule'),code=rule&&$('.rtxt',rule);
  if(code&&el) code.textContent=ruleText(el.rules[+t.dataset.ri]);
});
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-ev]'); if(!b) return;
  const el=sel(); if(!el||!el.rules) return;
  const ri=+b.dataset.ri,r=el.rules[ri],act=b.dataset.ev,dt=defTag();
  if(act==='addRule') el.rules.push({when:EVENTS[el.type][0],cond:null,acts:[{verb:'set',tag:dt.name,val:defVal(dt.name)}]});
  else if(act==='delRule') el.rules.splice(ri,1);
  else if(act==='addCond'&&r) r.cond={tag:dt.name,op:'is',val:defVal(dt.name)};
  else if(act==='noCond'&&r) r.cond=null;
  else if(act==='addAct'&&r) r.acts.push({verb:'set',tag:dt.name,val:defVal(dt.name)});
  else if(act==='delAct'&&r){r.acts.splice(+b.dataset.ai,1);}
  renderRight();
});

/* ---------- lists, banks and groups panel ---------- */
function listCard(l){
  const bi=bankIdx(),isCur=curList()===l;
  const nv=Object.keys(l.vals||{}).length;
  return '<div class="lcard'+(isCur?' cur':'')+'" data-lid="'+l.id+'"><div class="lc1"><input type="text" data-ls-name="list" data-id="'+l.id+'" value="'+esc(l.name)+'" aria-label="List name">'
    +'<select data-ls-bank data-id="'+l.id+'" aria-label="Bank">'+S.banks.map((b,i)=>'<option value="'+i+'"'+(i===l.bank?' selected':'')+'>'+b.letter+'</option>').join('')+'</select></div>'
    +'<div class="gchips">'+S.groups.map(g=>'<label class="gc"><input type="checkbox" data-ls-grp data-id="'+l.id+'" data-g="'+esc(g)+'"'+(l.groups.indexOf(g)>=0?' checked':'')+'><span>'+esc(g)+'</span></label>').join('')+'</div>'
    +'<div class="lc3"><button type="button" class="btn" data-ls="sel" data-id="'+l.id+'">'+(isCur?'Selected':'Select')+'</button><button type="button" class="btn" data-ls="saveVals" data-id="'+l.id+'" title="Store the current knob values with this list">Save knob values'+(nv?' ('+nv+')':'')+'</button><button type="button" class="btn danger" data-ls="delList" data-id="'+l.id+'">Delete</button></div></div>';
}
function listsHTML(){
  const bi=bankIdx(),b=S.banks[bi]||{letter:'?',name:''};
  let h='<p class="hint" style="margin-top:0">A sample list is a batch of groups, like a rompler patch. Banks hold lists. The list selector and bank buttons are bound to the built-in <b>list</b> and <b>bank</b> tags.</p>';
  h+=sec('Banks','<div class="banks">'+S.banks.map((x,i)=>'<button type="button" class="btn bkb'+(i===bi?' on':'')+'" data-ls="bank" data-i="'+i+'" title="'+esc(x.name||x.letter)+'">'+x.letter+'<small>'+S.lists.filter(l=>l.bank===i).length+'</small></button>').join('')+'<button type="button" class="btn bkb" data-ls="addBank" title="Add a bank" aria-label="Add a bank">+</button></div>'
    +'<label class="f"><span>Bank '+b.letter+' name</span><input type="text" data-ls-name="bank" value="'+esc(b.name)+'"></label>');
  h+=sec('Lists ('+S.lists.length+')',S.lists.map(listCard).join('')+'<button type="button" class="btn" data-ls="addList">+ New list in bank '+b.letter+'</button>');
  h+=sec('Sample groups ('+S.groups.length+')','<div class="gedit">'+S.groups.map((g,i)=>'<span class="gtag">'+esc(g)+'<button type="button" data-ls="delGroup" data-i="'+i+'" aria-label="Remove group '+esc(g)+'">✕</button></span>').join('')+'</div><div class="ins" style="margin-top:8px;grid-template-columns:1fr auto"><input type="text" id="newGroup" placeholder="New group name" aria-label="New group name"><button type="button" class="btn" data-ls="addGroup" style="grid-column:auto">Add</button></div><p class="hint">Groups come from the Mapping tab. These are example names.</p>');
  return h;
}
function listStructure(fn){
  const bi=bankIdx(),li=listIdx(),cur=curList();
  fn();
  const idx=cur?listsInBank(bankIdx()).indexOf(cur):-1;
  restoreIdx(bi,idx>=0?idx:li);
  refreshDisplays(); renderRight();
}
rbody.addEventListener('input',e=>{
  const t=e.target,d=t.dataset; if(!d) return;
  if(d.lsName==='list'){const l=S.lists.find(x=>x.id===d.id);if(l){l.name=t.value;refreshDisplays();}}
  else if(d.lsName==='bank'){const b=S.banks[bankIdx()];if(b){b.name=t.value;refreshDisplays();}}
});
rbody.addEventListener('change',e=>{
  const t=e.target,d=t.dataset; if(!d) return;
  if(d.lsBank!==undefined){
    const l=S.lists.find(x=>x.id===d.id); if(!l) return;
    listStructure(()=>{l.bank=+t.value;});
  }else if(d.lsGrp!==undefined){
    const l=S.lists.find(x=>x.id===d.id); if(!l) return;
    const i=l.groups.indexOf(d.g);
    if(t.checked&&i<0) l.groups.push(d.g); else if(!t.checked&&i>=0) l.groups.splice(i,1);
    refreshDisplays();
  }
});
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-ls]'); if(!b) return;
  const act=b.dataset.ls,l=S.lists.find(x=>x.id===b.dataset.id);
  if(act==='bank'){const bt=bankTag();if(bt)setStep(bt,+b.dataset.i);renderRight();}
  else if(act==='addBank') listStructure(()=>{S.banks.push({letter:bankLetter(S.banks.length),name:''});});
  else if(act==='addList') listStructure(()=>{S.lists.push({id:nid('l'),name:'New list '+(S.lists.length+1),bank:bankIdx(),groups:[],vals:{}});});
  else if(act==='delList'&&l) listStructure(()=>{S.lists.splice(S.lists.indexOf(l),1);});
  else if(act==='sel'&&l){
    const bt=bankTag(),lt=listTag(); if(!bt||!lt) return;
    setStep(bt,l.bank); setStep(lt,listsInBank(l.bank).indexOf(l)); renderRight();
  }else if(act==='saveVals'&&l){
    l.vals={}; S.tags.forEach(t=>{if(!t.sys)l.vals[t.name]=+t.value.toFixed(4);});
    flash('Saved '+Object.keys(l.vals).length+' knob values to '+l.name); renderRight();
  }else if(act==='addGroup'){
    const inp=$('#newGroup'),v=inp&&inp.value.trim();
    if(v&&S.groups.indexOf(v)<0){S.groups.push(v);renderRight();}
  }else if(act==='delGroup'){
    const g=S.groups[+b.dataset.i]; if(g===undefined) return;
    S.groups.splice(+b.dataset.i,1); S.lists.forEach(x=>{const k=x.groups.indexOf(g);if(k>=0)x.groups.splice(k,1);});
    renderRight();
  }
});

/* ---------- presets ---------- */
function baseProject(){
  addTexAssets();
  S.sel=null; S.msel=[]; S.lgroups=[]; S.pages=[]; S.els=[]; S.tags=sysTags(); S.groups=[]; S.lists=[]; S.banks=defaultBanks(['','','','','','','','']);
  S.fx.graphs={}; S.fx.scope='master'; S.fx.sel=null; S.fx.cable=null; S.fx.view='nodes';
  S.light=315; S.bpm=120; S.sig={n:4,d:4}; S.tab='props'; S.canvas={w:960,h:540,bg:'#26222e'};
  RT.load=1; RT.hover=null; RT.down=null; resetMapper();S.lib=defaultLib();S.build.last=null;S.build.report=null;S.build.verify=null;
}
const addEls=(type,o)=>{const e=mk(type,o);S.els.push(e);return e;};
function exampleFx(){
  const g=graphOf('master'); g.nodes.length=0; g.cables.length=0;
  const inp=fxNode('input',20,150),out=fxNode('output',1120,150);
  const dl=fxNode('delay',190,40,{name:'Delay'}),ra=fxNode('reverb',430,40,{name:'Reverb A'}),ds=fxNode('dist',670,0,{name:'Distortion'});
  const rb=fxNode('reverb',670,260,{name:'Reverb B'}),lim=fxNode('limiter',910,110,{name:'Limiter'}),lfo=fxNode('lfo',430,300,{name:'LFO'});
  ra.p.mix=100; ds.p.mix=100; rb.p.mix=60;
  const dt=tagByName('delay'),rv=tagByName('reverb');
  if(dt) dl.tag.time=dt.id;
  if(rv) rb.tag.mix=rv.id;
  g.nodes.push(inp,dl,ra,ds,rb,lim,lfo,out);
  g.cables.push(mkCable(inp,'out',dl,'in'),mkCable(dl,'mix',ra,'in'),mkCable(ra,'wet',ds,'in'),mkCable(ra,'dry',rb,'in'),
    mkCable(ds,'mix',lim,'in'),mkCable(rb,'mix',lim,'in'),mkCable(lim,'mix',out,'in'),mkCable(lfo,'out',ds,'p:drive'));
}
function buildBlank(){baseProject();}
function velvetTags(basis){
  return sysTags().concat([
    mkTag('cutoff','number',{min:20,max:20000,unit:'Hz',scale:'log',dec:0,value:.62,def:.62,target:'cutoff'}),
    mkTag('resonance','number',{min:0,max:1,dec:2,value:.25,def:.25,target:'resonance'}),
    mkTag('reverb','number',{min:0,max:100,unit:'%',dec:0,value:.3,def:.3}),
    mkTag('volume','number',{min:-60,max:6,unit:'dB',dec:1,value:.85,def:.85,target:'volume'}),
    mkTag('wave','steps',{steps:['Saw','Square','Triangle','Sine'],value:0,def:0,target:'wave'}),
    mkTag('delay','sync',{basis:basis||'note',value:.4,def:.4})
  ]);
}
function buildVelvet(){
  baseProject(); addSample(); S.banks=defaultBanks(); S.tags=velvetTags('note');
  const T=n=>tagByName(n).id;
  const label=(name,text,x,y,w,o)=>addEls('text',Object.assign({name,text,x,y,w,h:20,size:12,weight:'600',spacing:3,color:'#a79fb8'},o||{}));
  const read=(name,text,x,y,w,o)=>addEls('text',Object.assign({name,text,x,y,w,h:26,size:19,weight:'500',font:'JetBrains Mono',color:'#ffffff'},o||{}));
  addEls('panel',{name:'Background',x:0,y:0,w:960,h:540,fill:'#2b2733',round:false,bevel:false,shadow:false,mat:'tex_noise',matOpacity:.35});
  addEls('panel',{name:'Header',x:24,y:24,w:912,h:84,fill:'#3a3345',radius:16,mat:'tex_brushed',matOpacity:.22});
  addEls('text',{name:'Title',text:'Velvet Felt Piano',x:44,y:36,w:520,h:60,font:'Pacifico',size:40,weight:'400',align:'left',color:'#ffd3e8',bevel:'outer-raised',shadow:true});
  addEls('text',{name:'List readout',text:'{list.id}  {list.name}',x:580,y:44,w:332,h:52,size:22,align:'right',color:'#ffd3e8'});
  addEls('panel',{name:'Filter panel',x:24,y:128,w:440,h:282,fill:'#332e3d',radius:16,mat:'tex_brushed',matOpacity:.18});
  addEls('panel',{name:'Output panel',x:488,y:128,w:448,h:282,fill:'#332e3d',radius:16,mat:'tex_brushed',matOpacity:.18});
  label('Filter heading','FILTER',48,142,200,{size:13,weight:'700',spacing:4,align:'left',color:'#ff9cc8'});
  label('Output heading','OUTPUT',512,142,200,{size:13,weight:'700',spacing:4,align:'left',color:'#ff9cc8'});
  const kc=addEls('knob',{name:'Cutoff knob',x:64,y:176,w:130,h:130,tag:T('cutoff')});
  addEls('knob',{name:'Resonance knob',x:288,y:176,w:130,h:130,tag:T('resonance'),ringColor:'#7be3b4',ptrColor:'#7be3b4'});
  read('Cutoff readout','{cutoff.number}',54,314,150);
  read('Resonance readout','{resonance.percent}',278,314,150);
  label('Cutoff label','CUTOFF',54,346,150);
  label('Resonance label','RESONANCE',278,346,150);
  addEls('fader',{name:'Volume fader',x:524,y:172,w:56,h:184,tag:T('volume')});
  read('Volume readout','{volume.number}',500,360,104,{size:15,h:22});
  label('Volume label','VOLUME',500,384,104,{h:18});
  addEls('knob',{name:'Reverb knob',x:640,y:176,w:110,h:110,tag:T('reverb'),ringColor:'#ffcf70',ptrColor:'#ffcf70'});
  read('Reverb readout','{reverb.number}',630,294,130,{size:17});
  label('Reverb label','REVERB',630,324,130,{h:18});
  addEls('knob',{name:'Wave knob',x:790,y:176,w:110,h:110,tag:T('wave'),ringColor:'#c3a6ff',ptrColor:'#c3a6ff'});
  read('Wave readout','{wave.name}',780,294,130,{size:17});
  label('Wave label','WAVE',780,324,130,{h:18});
  addEls('panel',{name:'Delay panel',x:24,y:430,w:912,h:86,fill:'#332e3d',radius:16,mat:'tex_brushed',matOpacity:.18});
  addEls('knob',{name:'Delay knob',x:44,y:440,w:66,h:66,tag:T('delay'),ringColor:'#9ad0ff',ptrColor:'#9ad0ff'});
  addEls('text',{name:'Delay readout',text:'Delay  {delay.name}  ·  {delay.ms}',x:128,y:444,w:360,h:58,size:24,align:'left',color:'#ffffff'});
  addEls('text',{name:'Bar length',text:'{timesig} bar = {timesig.bar}  at  {bpm} BPM',x:500,y:444,w:416,h:58,size:18,weight:'500',align:'right',color:'#a79fb8'});
  demoSamples(); S.sel=kc.id; exampleFx(); S.lib.name='Velvet Felt';S.lib.author='You';
}
function buildRompler(){
  baseProject(); addSample(); S.banks=defaultBanks(); S.tags=velvetTags('bar'); S.canvas={w:1600,h:420,bg:'#6c7078'};
  const T=n=>tagByName(n).id,bt=T('bank'),silver='#b6bcc6';
  addEls('panel',{name:'Back plate',x:0,y:0,w:1600,h:420,fill:'#6e737b',round:false,bevel:false,shadow:false,mat:'tex_brushed',matOpacity:.5});
  addEls('panel',{name:'Face plate',x:12,y:12,w:1576,h:396,fill:'#9aa0aa',radius:12,bevelSize:4,shadowDist:4,shadowBlur:12,mat:'tex_brushed',matOpacity:.55});
  addEls('text',{name:'Title',text:'ROMPLER 88',x:40,y:24,w:320,h:34,font:'Unbounded',size:20,weight:'700',align:'left',color:'#2c2f35',bevel:'outer-sunken',spacing:2});
  addEls('text',{name:'Subtitle',text:'SAMPLE LIST PLAYER',x:40,y:54,w:320,h:16,size:10,weight:'600',spacing:4,align:'left',color:'#4a4e56'});
  addEls('panel',{name:'LCD bezel',x:28,y:76,w:584,h:252,fill:'#2b2d32',radius:10,bevelDir:'in',bevelSize:4,shadow:false});
  const ls=addEls('list',{name:'List selector',x:44,y:90,w:552,h:224,rows:7});
  for(let i=0;i<8;i++) addEls('button',{name:'Bank '+bankLetter(i),label:bankLetter(i),x:40+i*72,y:346,w:64,h:44,size:20,color:silver,tag:bt,mode:'radio',value:i,led:true});
  addEls('button',{name:'List up',label:'▲',x:632,y:90,w:64,h:44,size:18,color:silver,rules:[{when:'press',cond:null,acts:[{verb:'prev',tag:'list',val:''}]}]});
  addEls('button',{name:'List down',label:'▼',x:632,y:284,w:64,h:44,size:18,color:silver,rules:[{when:'press',cond:null,acts:[{verb:'next',tag:'list',val:''}]}]});
  addEls('lcd',{name:'Patch LCD',x:716,y:90,w:420,h:84,text:'{list.id}  {list.name}',size:34});
  addEls('lcd',{name:'Bank LCD',x:716,y:186,w:420,h:56,text:'{bank.letter}: {bank.name}   {list.number}/{list.count}',size:28});
  addEls('lcd',Object.assign({name:'Status LCD',x:716,y:254,w:420,h:60,text:'{bpm} BPM   {timesig}   {list.loading}',size:26},LOOKS.amber));
  addEls('lcd',Object.assign({name:'Delay LCD',x:716,y:326,w:420,h:64,text:'DLY {delay.name}  {delay.ms}',size:26},LOOKS.amber));
  const cols=[1170,1300,1430],ks=[['cutoff','CUTOFF','{cutoff.number}'],['resonance','RESONANCE','{resonance.percent}'],['delay','DELAY','{delay.name}'],['reverb','REVERB','{reverb.number}'],['wave','WAVE','{wave.name}'],['volume','VOLUME','{volume.number}']];
  ks.forEach((k,i)=>{
    const x=cols[i%3],y=i<3?70:222;
    addEls('knob',{name:k[1]+' knob',x,y,w:96,h:96,tag:T(k[0]),baseColor:'#2d3036',capColor:'#c4cad4',ptrColor:'#ff9d2e',ringColor:'#ff9d2e',ringWidth:.07});
    addEls('text',{name:k[1]+' label',text:k[1],x:x-10,y:y+100,w:116,h:16,size:10,weight:'700',spacing:3,color:'#2c2f35',bevel:'outer-sunken'});
    addEls('lcd',Object.assign({name:k[1]+' readout',text:k[2],x:x-4,y:y+118,w:104,h:22,size:17,align:'center',pad:4,radius:4},LOOKS.amber));
  });
  demoSamples(); S.sel=ls.id; exampleFx(); S.lib.name='Rompler Demo';S.lib.author='You';S.lib.category='Synth';
}
/* ---------- snapshots and the presets menu ---------- */
function snapshot(){
  return JSON.parse(JSON.stringify({canvas:S.canvas,light:S.light,bpm:S.bpm,sig:S.sig,els:S.els,tags:S.tags,groups:S.groups,lists:S.lists,banks:S.banks,fx:S.fx.graphs,samples:S.samples,zones:S.zones,gset:S.gset,mapgrp:S.map.group,lib:S.lib}));
}
function restore(sn){
  const c=JSON.parse(JSON.stringify(sn));
  S.canvas=c.canvas; S.light=c.light; S.bpm=c.bpm; S.sig=c.sig; S.els=c.els; S.tags=c.tags; S.groups=c.groups; S.lists=c.lists; S.banks=c.banks;
  S.samples=c.samples||[];S.zones=c.zones||[];S.gset=c.gset||{};S.map.group=c.mapgrp||null;S.map.sel=[];touchMap();if(c.lib)S.lib=c.lib;
  S.fx.graphs=c.fx; S.fx.scope='master'; S.fx.sel=null; S.fx.cable=null; S.sel=null; RT.load=1; RT.hover=null; RT.down=null;
}
function afterLoad(){
  syncToolbar(); layout(); mountAll(); renderLayers(); renderRight(); fxRender();
  if(S.view==='map'){mapUI();mapInvalidate();} if(S.view==='export')exRender(); if(S.view==='sound')soundEnter(true);
}
function loadPreset(key){
  S.prevSnap=snapshot();
  const u=S.userPresets.find(p=>p.id===key);
  if(u) restore(u.snap); else ({blank:buildBlank,velvet:buildVelvet,rompler:buildRompler})[key]();
  afterLoad(); $('#presetUndo').hidden=false; flash('Preset loaded. Undo preset brings the old project back.');
}
function presetMenuHTML(){
  const items=[['blank','Blank canvas','960 × 540, built-in tags only'],['velvet','Velvet Felt','Instrument UI, 960 × 540'],['rompler','Rompler','1600 × 420 rack: metal, LCDs, buttons, banks A–H']];
  let h=items.map(i=>'<button type="button" class="mi" data-pre="'+i[0]+'"><b>'+i[1]+'</b><small>'+i[2]+'</small></button>').join('');
  if(S.userPresets.length) h+='<div class="msep">Yours</div>'+S.userPresets.map(p=>'<button type="button" class="mi" data-pre="'+p.id+'"><b>'+esc(p.name)+'</b><small>Saved this session</small></button>').join('');
  return h+'<div class="msep">Save</div><div class="msave"><input type="text" id="preName" placeholder="Preset name" aria-label="Preset name"><button type="button" class="btn" data-pre="save">Save</button></div>';
}
function closeMenu(){$('#presetMenu').hidden=true;$('#presetBtn').setAttribute('aria-expanded','false');}
$('#presetBtn').addEventListener('click',()=>{
  const m=$('#presetMenu'),open=m.hidden;
  if(open) m.innerHTML=presetMenuHTML();
  m.hidden=!open; $('#presetBtn').setAttribute('aria-expanded',String(open));
});
$('#presetMenu').addEventListener('click',e=>{
  const b=e.target.closest('[data-pre]'); if(!b) return;
  if(b.dataset.pre==='save'){
    const inp=$('#preName'),name=inp.value.trim();
    if(!name){flash('Give the preset a name first');return;}
    S.userPresets.push({id:nid('u'),name,snap:snapshot()}); flash('Saved preset "'+name+'"'); closeMenu(); return;
  }
  closeMenu(); loadPreset(b.dataset.pre);
});
document.addEventListener('pointerdown',e=>{if(!$('#presetMenu').hidden&&!e.target.closest('.pre'))closeMenu();});
$('#presetUndo').addEventListener('click',()=>{
  if(!S.prevSnap) return; restore(S.prevSnap); S.prevSnap=null; $('#presetUndo').hidden=true; afterLoad(); flash('Previous project restored');
});

/* ---------- modular FX: model + analysis ---------- */
const AO=['dry','wet','mix'];
const FP=(k,label,min,max,unit,def,o)=>Object.assign({k,label,min,max,unit,def},o||{});
const FXT={
  input:{label:'Input',kind:'io',cat:'io',ins:[],outs:['out'],params:[],cpu:0,lat:0,hint:'Audio coming from the sampler voices.'},
  output:{label:'Output',kind:'io',cat:'io',ins:['in'],outs:[],params:[],cpu:0,lat:0,hint:'Audio going to the host.'},
  delay:{label:'Delay',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Echo. Time can sync to the project tempo and time signature.',
    params:[FP('time','Time',1,2000,'ms',350,{sync:1}),FP('fb','Feedback',0,95,'%',35),FP('tone','Tone',0,100,'%',60),FP('mix','Mix',0,100,'%',30)]},
  reverb:{label:'Reverb',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:4,lat:0,hint:'Room and hall tails.',
    params:[FP('size','Size',0,100,'%',60),FP('decay','Decay',0.1,12,'s',2.4),FP('damp','Damping',0,100,'%',40),FP('mix','Mix',0,100,'%',30)]},
  chorus:{label:'Chorus',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,hint:'Thickens the sound with a moving short delay.',
    params:[FP('rate','Rate',0.05,10,'Hz',0.8),FP('depth','Depth',0,100,'%',40),FP('mix','Mix',0,100,'%',50)]},
  phaser:{label:'Phaser',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,hint:'Sweeping notches.',
    params:[FP('rate','Rate',0.05,10,'Hz',0.4),FP('depth','Depth',0,100,'%',60),FP('fb','Feedback',0,95,'%',30),FP('mix','Mix',0,100,'%',50)]},
  dist:{label:'Distortion',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Saturation and drive.',
    params:[FP('drive','Drive',0,100,'%',30),FP('tone','Tone',0,100,'%',50),FP('mix','Mix',0,100,'%',100)]},
  filter:{label:'Filter',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Low-pass filter.',
    params:[FP('cutoff','Cutoff',20,20000,'Hz',8000),FP('res','Resonance',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  eq:{label:'EQ',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Three band tone control.',
    params:[FP('low','Low',-12,12,'dB',0),FP('mid','Mid',-12,12,'dB',0),FP('high','High',-12,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  comp:{label:'Compressor',kind:'fx',cat:'Dynamics',ins:['in','sc'],outs:AO,cpu:2,lat:0,hint:'Evens out level. The sc input is an optional sidechain.',
    params:[FP('thresh','Threshold',-60,0,'dB',-18),FP('ratio','Ratio',1,20,':1',3),FP('attack','Attack',0.1,100,'ms',10),FP('mix','Mix',0,100,'%',100)]},
  limiter:{label:'Limiter',kind:'fx',cat:'Dynamics',ins:['in'],outs:AO,cpu:2,lat:5,hint:'Catches peaks. Uses 5 ms of lookahead, so it adds latency.',
    params:[FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('mix','Mix',0,100,'%',100)]},
  lfo:{label:'LFO',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.2,lat:0,hint:'Slow wave. Drag from its out port to any parameter dot.',
    params:[FP('rate','Rate',0.05,20,'Hz',1),FP('depth','Depth',0,100,'%',100)]},
  env:{label:'Follower',kind:'mod',cat:'Modulators',ins:['in'],outs:['out'],cpu:.4,lat:0,hint:'Envelope follower: turns the loudness of its audio input into a control signal.',
    params:[FP('attack','Attack',1,200,'ms',10),FP('release','Release',10,2000,'ms',200),FP('gain','Gain',0,100,'%',70)]},
  macro:{label:'Macro',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:0,lat:0,hint:'Turns any tag (a knob, a button, the bank) into a control signal.',
    params:[FP('value','Value',0,100,'%',50)]}
};
const FX_CATS=['Time','Modulation','Tone','Dynamics','Modulators'];
const fxIsMod=n=>FXT[n.type].kind==='mod';
function graphOf(scope){
  scope=scope||S.fx.scope;
  if(!S.fx.graphs[scope]){
    const g={nodes:[],cables:[]}; S.fx.graphs[scope]=g;
    const a=fxNode('input',20,120),b=fxNode('output',620,120);
    g.nodes.push(a,b); g.cables.push(mkCable(a,'out',b,'in'));
  }
  return S.fx.graphs[scope];
}
const curG=()=>graphOf(S.fx.scope);
function fxNode(type,x,y,o){
  const d=FXT[type],n={id:nid('n'),type,x:Math.round(x),y:Math.round(y),bypass:false,name:(o&&o.name)||d.label,p:{},tag:{}};
  d.params.forEach(q=>{n.p[q.k]=q.def;});
  return n;
}
function mkCable(a,ap,b,bp){return{id:nid('c'),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:50};}
const nodeById=(g,id)=>g.nodes.find(n=>n.id===id)||null;
const isCtlPort=p=>p.indexOf('p:')===0;
function cableKind(g,c){const n=nodeById(g,c.from.n);return n&&fxIsMod(n)?'ctl':'audio';}
function portKind(n,p,dir){
  const d=FXT[n.type];
  if(dir==='out') return fxIsMod(n)?'ctl':(p==='out'?'mix':p);
  return isCtlPort(p)?'ctl':'in';
}
/* can an output port connect to an input port? */
function canConnect(g,a,ap,b,bp){
  if(a.id===b.id) return 'A node cannot feed itself.';
  const ctl=fxIsMod(a);
  if(ctl&&!isCtlPort(bp)) return 'Control signals go to parameter dots, not audio inputs.';
  if(!ctl&&isCtlPort(bp)) return 'Audio goes to audio inputs. Use an LFO, Follower or Macro for parameters.';
  if(!ctl&&FXT[b.type].ins.indexOf(bp)<0) return 'That input does not exist.';
  if(g.cables.some(c=>c.from.n===a.id&&c.from.p===ap&&c.to.n===b.id&&c.to.p===bp)) return 'Already connected.';
  return '';
}
function addCable(g,a,ap,b,bp){
  const why=canConnect(g,a,ap,b,bp); if(why) return why;
  if(isCtlPort(bp)) g.cables=g.cables.filter(c=>!(c.to.n===b.id&&c.to.p===bp));
  const c=mkCable(a,ap,b,bp); g.cables.push(c); return '';
}
function removeNode(g,id){g.nodes=g.nodes.filter(n=>n.id!==id);g.cables=g.cables.filter(c=>c.from.n!==id&&c.to.n!==id);}
/* ---- effective parameter value (tag binding + modulation) ---- */
const FXT0=performance.now();
const fxClock=()=>(performance.now()-FXT0)/1000;
function modOut(g,n,t){
  const v=n.p;
  if(n.type==='lfo') return lfoOut(g,n,t);
  if(n.type==='env') return FXA.follow[n.id]!=null?clamp(FXA.follow[n.id]*(v.gain/100)*3,0,1):0;
  if(n.type==='adsr') return .5+.5*adsrOut(v,t)*(v.depth/100);
  if(n.type==='midisrc') return midiSrcOut(v.src);
  if(n.type==='rand') return randOut(n,t);
  if(n.type==='macro'){const tg=n.tag.value&&tagById(n.tag.value);return tg?tg.value:v.value/100;}
  return 0;
}
function paramNorm(n,q){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg) return tg.value;
  return clamp((n.p[q.k]-q.min)/(q.max-q.min),0,1);
}
function paramReal(g,n,q,t,wantMod){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg&&q.sync&&tg.kind==='sync') return msOfBeats(syncBeats(tg,S.sig));
  let nm=paramNorm(n,q),mod=false;
  if(wantMod!==false) g.cables.forEach(c=>{
    if(c.to.n===n.id&&c.to.p==='p:'+q.k){const s=nodeById(g,c.from.n);if(s){nm+=(modOut(g,s,t)-.5)*2*(c.amt/100);mod=true;}}
  });
  nm=clamp(nm,0,1);
  return{v:q.min+nm*(q.max-q.min),mod};
}
function parReal(g,n,q,t){const r=paramReal(g,n,q,t);return typeof r==='number'?{v:r,mod:false,sync:true}:r;}
function fmtPar(q,v){
  if(q.unit==='Hz'&&v>=1000) return (v/1000).toFixed(2)+' kHz';
  const d=Math.abs(q.max-q.min)<=30?(Math.abs(v)<10?2:1):0;
  return v.toFixed(d)+(q.unit==='%'||q.unit===':1'?q.unit:' '+q.unit);
}
/* ---- analysis ---- */
function nodeTailMs(g,n,t){
  const dk=FXT[n.type].params.find(q=>q.k==='decay');if(dk&&n.type!=='reverb')return parReal(g,n,dk,t).v*1000;
  if(n.type==='gatedverb')return n.p.gate;
  if(n.type==='tapeecho'){const ms=n.p.time,fb=Math.min(.95,n.p.fb/100);return fb<=0?ms:Math.min(30000,ms*Math.ceil(Math.log(.001)/Math.log(fb)));}
  if(n.type==='reverb') return n.p.decay*1000;
  if(n.type==='delay'){
    const ms=parReal(g,n,FXT.delay.params[0],t).v,fb=Math.min(.95,n.p.fb/100);
    return fb<=0?ms:Math.min(30000,ms*Math.ceil(Math.log(.001)/Math.log(fb)));
  }
  return 0;
}
function fxAnalyze(g){
  const t=fxClock(),an={cycles:[],idle:[],cost:0,lat:0,tail:0,pdc:[],warn:[],ok:true,arr:{}};
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio');
  const out={},inn={};
  g.nodes.forEach(n=>{out[n.id]=[];inn[n.id]=[];});
  aud.forEach(c=>{if(out[c.from.n]&&inn[c.to.n]){out[c.from.n].push(c);inn[c.to.n].push(c);}});
  /* cycles */
  const col={},stack=[],back=new Set();
  const dfs=id=>{
    col[id]=1; stack.push(id);
    out[id].forEach(c=>{
      const to=c.to.n;
      if(col[to]===1){
        back.add(c.id);
        const cyc=stack.slice(stack.indexOf(to)),ok=cyc.some(x=>FXT[nodeById(g,x).type].fbOk);
        an.cycles.push({ids:cyc,ok});
      }else if(!col[to]) dfs(to);
    });
    stack.pop(); col[id]=2;
  };
  g.nodes.forEach(n=>{if(!col[n.id])dfs(n.id);});
  an.cycles.forEach(c=>{
    const names=c.ids.map(i=>nodeById(g,i).name).join(' → ');
    if(c.ok) an.warn.push({lvl:'note',t:'Feedback loop through a delay: '+names+'. Allowed, but watch the level.'});
    else{an.warn.push({lvl:'bad',t:'Loop with no delay in it: '+names+'. This would blow up, so the plugin will mute it.'});an.ok=false;}
  });
  /* reachability */
  const inp=g.nodes.filter(n=>n.type==='input'),reach=new Set();
  const q=inp.map(n=>n.id); q.forEach(i=>reach.add(i));
  while(q.length){const id=q.shift();out[id].forEach(c=>{if(!reach.has(c.to.n)){reach.add(c.to.n);q.push(c.to.n);}});}
  g.nodes.forEach(n=>{
    const d=FXT[n.type];
    if(d.kind==='fx'&&!reach.has(n.id)) an.idle.push(n.id);
    if(d.kind==='fx'&&reach.has(n.id)&&!out[n.id].length) an.warn.push({lvl:'warn',t:n.name+' has no outputs connected, so it does nothing.'});
  });
  if(an.idle.length) an.warn.push({lvl:'warn',t:an.idle.length+' effect'+(an.idle.length>1?'s are':' is')+' not reachable from Input and will not run.'});
  const outs=g.nodes.filter(n=>n.type==='output');
  if(!outs.some(o=>reach.has(o.id))){an.warn.push({lvl:'bad',t:'Nothing reaches the Output. The sound is silent.'});an.ok=false;}
  /* cost */
  g.nodes.forEach(n=>{if(!n.bypass&&(reach.has(n.id)||fxIsMod(n)))an.cost+=FXT[n.type].cpu;});
  /* latency, tails (back edges ignored) */
  const memo={};
  const arr=id=>{
    if(memo[id]) return memo[id];
    const n=nodeById(g,id),r=memo[id]={lat:0,tail:0}; /* seed to break recursion */
    let ml=0,mt=0;
    inn[id].forEach(c=>{if(back.has(c.id))return;const a=arr(c.from.n);ml=Math.max(ml,a.lat);mt=Math.max(mt,a.tail);});
    r.lat=ml+(n.bypass?0:FXT[n.type].lat); r.tail=mt+(n.bypass?0:nodeTailMs(g,n,t));
    return r;
  };
  g.nodes.forEach(n=>arr(n.id)); an.arr=memo;
  outs.forEach(o=>{if(reach.has(o.id)){an.lat=Math.max(an.lat,memo[o.id].lat);an.tail=Math.max(an.tail,memo[o.id].tail);}});
  /* delay compensation where branches meet */
  g.nodes.forEach(n=>{
    ['in','sc'].forEach(port=>{
      const cs=inn[n.id].filter(c=>c.to.p===port&&!back.has(c.id));
      if(cs.length<2) return;
      const mx=Math.max.apply(null,cs.map(c=>memo[c.from.n].lat));
      cs.forEach(c=>{const d=mx-memo[c.from.n].lat;if(d>0)an.pdc.push({cable:c.id,node:n.name,ms:d});});
    });
  });
  if(an.pdc.length) an.warn.push({lvl:'note',t:'Branches meet with different latency. The plugin adds delay compensation automatically ('+an.pdc.map(p=>'+'+p.ms+' ms before '+p.node).join(', ')+').'});
  if(an.cost>14) an.warn.push({lvl:'warn',t:'Heavy chain. This could be a lot for older computers.'});
  return an;
}
/* ---- stack view helpers ---- */
function chainOrder(g){
  const an=fxAnalyze(g),indeg={};
  const fx=g.nodes.filter(n=>FXT[n.type].kind==='fx');
  const ids=new Set(fx.map(n=>n.id));
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio'&&ids.has(c.from.n)&&ids.has(c.to.n));
  fx.forEach(n=>indeg[n.id]=0);
  aud.forEach(c=>indeg[c.to.n]++);
  const res=[],q=fx.filter(n=>!indeg[n.id]).sort((a,b)=>a.x-b.x);
  while(q.length){
    const n=q.shift(); res.push(n);
    aud.filter(c=>c.from.n===n.id).forEach(c=>{if(--indeg[c.to.n]===0)q.push(nodeById(g,c.to.n));});
  }
  fx.forEach(n=>{if(res.indexOf(n)<0)res.push(n);});
  return res;
}
function isStraight(g){
  const fx=g.nodes.filter(n=>FXT[n.type].kind==='fx');
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio');
  if(aud.length!==fx.length+1) return false;
  return aud.every(c=>c.from.p==='mix'||c.from.p==='out')&&fx.every(n=>aud.filter(c=>c.to.n===n.id).length===1&&aud.filter(c=>c.from.n===n.id).length===1);
}
/* rebuild straight audio chain in the given order; control cables stay */
function relinkChain(g,order){
  const inp=g.nodes.find(n=>n.type==='input'),out=g.nodes.find(n=>n.type==='output');
  g.cables=g.cables.filter(c=>cableKind(g,c)==='ctl');
  let prev=inp,pp='out';
  order.forEach((n,i)=>{g.cables.push(mkCable(prev,pp,n,'in'));prev=n;pp='mix';n.x=Math.round(200+i*210);n.y=90+(i%2)*40;});
  g.cables.push(mkCable(prev,pp,out,'in'));
  inp.x=20;inp.y=120;out.x=Math.round(200+order.length*210);out.y=120;
}

/* ---------- FX catalog: first release, retro and pedals (see docs/fx-modules.md) ----------
   Param flags: opts = labelled choices (stored as an index), stat = changing it rebuilds the node, ir = regenerates a reverb impulse. */
const OPT=(k,label,opts,def,o)=>FP(k,label,0,opts.length-1,'',def||0,Object.assign({opts,step:1},o||{}));
FX_CATS.splice(0,FX_CATS.length,'Routing','Time','Modulation','Tone','Dynamics','Retro','Pedals','Modulators');
const MIXP=FP('mix','Mix',0,100,'%',30);
Object.assign(FXT,{
  /* ---- routing ---- */
  mixer:{label:'Mixer',kind:'fx',cat:'Routing',raw:1,ins:['in1','in2','in3','in4'],outs:['out'],cpu:.2,lat:0,hint:'Sums up to four paths back together. Use it after a Splitter or a Crossover.',
    params:[FP('l1','Level 1',-60,6,'dB',0),FP('l2','Level 2',-60,6,'dB',0),FP('l3','Level 3',-60,6,'dB',0),FP('l4','Level 4',-60,6,'dB',0)]},
  util:{label:'Utility',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Gain, pan and stereo width.',
    params:[FP('gain','Gain',-60,12,'dB',0),FP('pan','Pan',-100,100,'',0),FP('width','Width',0,200,'%',100)]},
  xover:{label:'Crossover',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['low','mid','high'],cpu:.6,lat:0,hint:'Splits the sound into low, mid and high bands, so each band can get its own effects.',
    params:[FP('f1','Low / mid',40,2000,'Hz',250),FP('f2','Mid / high',500,16000,'Hz',3000)]},
  mssplit:{label:'Mid/Side split',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['mid','side'],cpu:.1,lat:0,hint:'Separates the centre from the sides. Join them again with Mid/Side join.',params:[]},
  msjoin:{label:'Mid/Side join',kind:'fx',cat:'Routing',raw:1,ins:['mid','side'],outs:['out'],cpu:.1,lat:0,hint:'Turns mid and side back into left and right.',params:[]},
  send:{label:'Send',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Passes the sound through and also sends a copy to a bus. Pick up the bus with a Return, usually in the Master chain.',
    params:[OPT('bus','Bus',['Bus 1','Bus 2','Bus 3','Bus 4'],0,{stat:1}),FP('level','Send level',-60,6,'dB',-6)]},
  ret:{label:'Return',kind:'fx',cat:'Routing',raw:1,ins:[],outs:['out'],cpu:.1,lat:0,hint:'Outputs everything sent to its bus from any chain.',
    params:[OPT('bus','Bus',['Bus 1','Bus 2','Bus 3','Bus 4'],0,{stat:1}),FP('level','Level',-60,6,'dB',0)]},
  /* ---- time ---- */
  conv:{label:'Convolution',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:5,lat:0,hint:'Puts the sound in a real room or through real gear. Pick an impulse file from your samples; it is packed into the library.',
    params:[FP('pre','Pre-delay',0,200,'ms',0),FP('len','Length',5,100,'%',100,{stat:1}),FP('mix','Mix',0,100,'%',30)],sample:'ir'},
  shimmer:{label:'Shimmer',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:5,lat:0,fbOk:1,hint:'Bright reverb that blooms an octave up. Lovely on pads.',
    params:[FP('decay','Decay',1,20,'s',6,{ir:1}),FP('shine','Shimmer',0,100,'%',50),FP('mix','Mix',0,100,'%',35)]},
  /* ---- modulation ---- */
  flanger:{label:'Flanger',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Jet-plane sweep from a very short moving delay.',
    params:[FP('rate','Rate',0.02,5,'Hz',0.25),FP('depth','Depth',0,100,'%',60),FP('fb','Feedback',-95,95,'%',50),MIXP]},
  trem:{label:'Tremolo / Auto-pan',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:.5,lat:0,hint:'Rhythmic volume or stereo movement.',
    params:[FP('rate','Rate',0.1,20,'Hz',5,{sync:1}),FP('depth','Depth',0,100,'%',60),OPT('shape','Shape',['Sine','Triangle','Square'],0,{stat:1}),OPT('mode','Mode',['Tremolo','Auto-pan'],0,{stat:1}),FP('mix','Mix',0,100,'%',100)]},
  rotary:{label:'Rotary speaker',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Spinning-speaker swirl. Switching the speed ramps up and down like the real thing.',
    params:[OPT('speed','Speed',['Slow','Fast'],0),FP('drive','Drive',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  vibrato:{label:'Vibrato',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:1,lat:0,fbOk:1,hint:'Pitch wobble with no dry sound mixed in.',
    params:[FP('rate','Rate',0.1,12,'Hz',5.5),FP('depth','Depth',0,100,'%',30),FP('mix','Mix',0,100,'%',100)]},
  /* ---- tone ---- */
  peq:{label:'Parametric EQ',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1.2,lat:0,hint:'Four bands: low shelf, two bells and a high shelf.',
    params:[FP('lf','Low freq',20,1000,'Hz',100),FP('lg','Low gain',-18,18,'dB',0),FP('m1f','Bell 1 freq',60,8000,'Hz',500),FP('m1g','Bell 1 gain',-18,18,'dB',0),FP('m1q','Bell 1 Q',0.2,12,'',1),
      FP('m2f','Bell 2 freq',200,16000,'Hz',2500),FP('m2g','Bell 2 gain',-18,18,'dB',0),FP('m2q','Bell 2 Q',0.2,12,'',1),FP('hf','High freq',1000,20000,'Hz',8000),FP('hg','High gain',-18,18,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  crush:{label:'Bitcrusher',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:.8,lat:0,hint:'Fewer bits and a lower sample rate, with no smoothing filter, so it aliases.',
    params:[FP('bits','Bits',1,16,'bit',8),FP('rate','Sample rate',500,48000,'Hz',11025),OPT('comp','Companding',['Off','µ-law'],0),FP('mix','Mix',0,100,'%',100)]},
  lofi:{label:'Lo-fi',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1.2,lat:0,fbOk:1,hint:'Worn, warbly, noisy: crackle, wow and flutter and hiss.',
    params:[FP('crackle','Crackle',0,100,'%',30),FP('wow','Wow and flutter',0,100,'%',30),FP('noise','Noise',0,100,'%',15),FP('tone','Tone',0,100,'%',60),FP('mix','Mix',0,100,'%',100)]},
  /* ---- dynamics ---- */
  transient:{label:'Transient shaper',kind:'fx',cat:'Dynamics',ins:['in'],outs:AO,cpu:1,lat:0,hint:'More or less punch at the start of each sound, more or less body after.',
    params:[FP('attack','Attack',-100,100,'%',30),FP('sustain','Sustain',-100,100,'%',0),FP('mix','Mix',0,100,'%',100)]},
  /* ---- retro ---- */
  morph:{label:'Morph Filter',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,hint:'One knob blends through vowel-like filter shapes (A, E, I, O, U). Inspired by the morphing filters of late-90s romplers. Put an LFO on Morph.',
    params:[FP('morph','Morph',0,100,'%',30),FP('shift','Shift',-12,12,'st',0),FP('res','Resonance',0,100,'%',60),FP('mix','Mix',0,100,'%',100)]},
  vintage:{label:'Vintage Sampler',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1,lat:0,hint:'The grit of old sampler converters: reduced bits and rate with no anti-alias filter, companding hiss and a dull output filter.',
    params:[OPT('model','Model',['8-bit companded','12-bit drum machine','12-bit studio','Custom'],1),FP('bits','Bits (custom)',4,16,'bit',12),FP('rate','Rate (custom)',4000,44100,'Hz',26040),
      FP('drive','Drive',0,100,'%',20),FP('age','Age',0,100,'%',30),FP('mix','Mix',0,100,'%',100)]},
  tapeecho:{label:'Tape Echo',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Warm tape delay: the repeats wobble, darken and saturate more with every pass. Push the feedback for runaway echoes.',
    params:[FP('time','Time',30,1200,'ms',330,{sync:1}),FP('fb','Feedback',0,110,'%',45),FP('wobble','Wobble',0,100,'%',35),FP('sat','Saturation',0,100,'%',40),FP('tone','Tone',0,100,'%',45),FP('mix','Mix',0,100,'%',30)]},
  bbd:{label:'BBD Chorus',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Dark, slightly noisy bucket-brigade chorus with the classic mode switch.',
    params:[OPT('mode','Mode',['I','II','I + II'],0),FP('noise','Hiss',0,100,'%',20),FP('mix','Mix',0,100,'%',50)]},
  ensemble:{label:'Ensemble',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Lush three-voice chorus from 70s string machines.',
    params:[FP('depth','Depth',0,100,'%',60),FP('mix','Mix',0,100,'%',60)]},
  tapemach:{label:'Tape Machine',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Tape saturation, low-end head bump, hiss and wow.',
    params:[FP('sat','Saturation',0,100,'%',35),FP('bump','Head bump',0,12,'dB',3),FP('hiss','Hiss',0,100,'%',10),FP('wow','Wow',0,100,'%',15),FP('age','Age',0,100,'%',25),FP('mix','Mix',0,100,'%',100)]},
  digiverb:{label:'80s Digital Reverb',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:4,lat:0,verb:'digital',hint:'Bright, grainy early-digital hall.',
    params:[FP('size','Size',0,100,'%',70,{ir:1}),FP('decay','Decay',0.3,10,'s',3,{ir:1}),FP('grit','Grit',0,100,'%',50,{ir:1}),FP('mix','Mix',0,100,'%',30)]},
  gatedverb:{label:'Gated Reverb',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:4,lat:0,verb:'gated',hint:'A big room that stops dead. The 80s drum sound.',
    params:[FP('gate','Gate time',80,800,'ms',300,{ir:1}),FP('size','Size',0,100,'%',80,{ir:1}),FP('mix','Mix',0,100,'%',40)]},
  spring:{label:'Spring Tank',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:3,lat:0,verb:'spring',hint:'Boingy spring reverb, as in guitar amps and dub.',
    params:[FP('decay','Decay',0.5,6,'s',2.2,{ir:1}),FP('drip','Drip',0,100,'%',50,{ir:1}),FP('mix','Mix',0,100,'%',30)]},
  vinyl:{label:'Vinyl',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1,lat:0,fbOk:1,hint:'Crackle, rumble, wear and turntable wow.',
    params:[FP('crackle','Crackle',0,100,'%',40),FP('rumble','Rumble',0,100,'%',20),FP('wear','Wear',0,100,'%',30),FP('wow','Wow',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  radio:{label:'Radio / Phone',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:.8,lat:0,hint:'Narrow, crunchy, a little noisy.',
    params:[OPT('band','Band',['AM radio','Telephone','Walkie-talkie'],0),FP('crunch','Crunch',0,100,'%',30),FP('noise','Noise',0,100,'%',15),FP('mix','Mix',0,100,'%',100)]},
  /* ---- pedals (same DSP, stomp-box look; the footswitch is bypass) ---- */
  pod:{label:'Overdrive',kind:'fx',cat:'Pedals',pedal:'#3f8a4a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Mid-hump overdrive pedal.',
    params:[FP('drive','Drive',0,100,'%',45),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  pfuzz:{label:'Fuzz',kind:'fx',cat:'Pedals',pedal:'#b05a2a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'60s germanium-style fuzz.',
    params:[FP('fuzz','Fuzz',0,100,'%',70),FP('tone','Tone',0,100,'%',45),FP('level','Level',-24,12,'dB',-6),FP('mix','Mix',0,100,'%',100)]},
  pwah:{label:'Wah',kind:'fx',cat:'Pedals',pedal:'#2a2a2a',ins:['in'],outs:AO,cpu:.6,lat:0,hint:'Link Pedal to the Expression source (MIDI CC 11), the mod wheel or a knob. Auto mode follows how hard you play.',
    params:[FP('pos','Pedal',0,100,'%',50),OPT('mode','Mode',['Manual','Auto'],0),FP('q','Peak',1,20,'',7),FP('mix','Mix',0,100,'%',100)]},
  pcomp:{label:'Comp Pedal',kind:'fx',cat:'Pedals',pedal:'#2a5aa0',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Squashy guitar compressor.',
    params:[FP('sustain','Sustain',0,100,'%',60),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  pvibe:{label:'Uni-Vibe',kind:'fx',cat:'Pedals',pedal:'#7a3a8a',ins:['in'],outs:AO,cpu:1.5,lat:0,hint:'Throbbing photocell-style vibe.',
    params:[FP('speed','Speed',0.3,10,'Hz',2),FP('intensity','Intensity',0,100,'%',70),FP('mix','Mix',0,100,'%',60)]},
  pvol:{label:'Volume Pedal',kind:'fx',cat:'Pedals',pedal:'#444',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Swells. Link Pedal to the Expression source.',
    params:[FP('pos','Pedal',0,100,'%',100)]},
  /* ---- modulators ---- */
  adsr:{label:'Envelope',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.1,lat:0,hint:'Starts on every note: attack, decay, sustain, release.',
    params:[FP('a','Attack',0,5000,'ms',10),FP('d','Decay',0,5000,'ms',300),FP('s','Sustain',0,100,'%',60),FP('r','Release',0,8000,'ms',400),FP('depth','Depth',0,100,'%',100)]},
  midisrc:{label:'MIDI source',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:0,lat:0,hint:'Velocity, key, mod wheel, expression (CC 11), aftertouch or pitch bend as a control signal.',
    params:[OPT('src','Source',['Velocity','Key','Mod wheel','Expression','Aftertouch','Pitch bend'],0)]},
  rand:{label:'Random',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.1,lat:0,hint:'Sample and hold: jumps to a new random value at the rate, smoothed if you like.',
    params:[FP('rate','Rate',0.1,30,'Hz',4),FP('smooth','Smooth',0,100,'%',20),FP('depth','Depth',0,100,'%',100)]}
});
/* upgrades to the original modules */
FXT.filter.label='Filter';FXT.filter.hint='Multi-mode filter: low-pass, high-pass, band-pass, notch or peak, 12 or 24 dB.';
FXT.filter.params=[OPT('type','Type',['Low-pass','High-pass','Band-pass','Notch','Peak'],0),FP('cutoff','Cutoff',20,20000,'Hz',8000),FP('res','Resonance',0,100,'%',20),
  OPT('slope','Slope',['12 dB','24 dB'],0,{stat:1}),FP('gain','Peak gain',-18,18,'dB',6),FP('mix','Mix',0,100,'%',100)];
FXT.dist.params=[OPT('type','Type',['Tube','Tape','Hard clip','Foldback','Fuzz','Soft clip','Bitcrush','Rectify','Sine shaper','Diode'],0,{stat:1}),FP('drive','Drive',0,100,'%',30),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)];
FXT.delay.params.splice(3,0,OPT('pp','Mode',['Stereo','Ping-pong','Tape','Diffuse'],0,{stat:1}));
FXT.delay.hint='Echo. Modes: stereo, ping-pong, tape (wobbly, warm repeats) and diffuse (repeats smear into a wash). Time can sync to the project tempo.';
FXT.reverb.hint='Room, hall, plate, ambience, cathedral, spring and shimmer tails.';
FXT.reverb.params=[OPT('type','Type',['Room','Hall','Plate','Ambience','Cathedral','Spring','Shimmer'],1,{ir:1}),FP('size','Size',0,100,'%',60,{ir:1}),FP('decay','Decay',0.1,12,'s',2.4,{ir:1}),FP('damp','Damping',0,100,'%',40,{ir:1}),FP('pre','Pre-delay',0,200,'ms',10),FP('mix','Mix',0,100,'%',30)];
FXT.comp.params=[OPT('mode','Mode',['Compressor','Limiter','OTT'],0),FP('thresh','Threshold',-60,0,'dB',-18),FP('ratio','Ratio',1,20,':1',3),FP('attack','Attack',0.1,100,'ms',10),FP('release','Release',10,1000,'ms',150),FP('makeup','Makeup',0,24,'dB',0),FP('mix','Mix',0,100,'%',100)];
FXT.comp.ins=['in'];FXT.comp.hint='Evens out level. Limiter mode catches peaks at the threshold. OTT squashes three bands up and down at once (ratio = depth, attack = speed).';
FXT.chorus.params.unshift(OPT('mode','Mode',['Chorus','Flanger','Ensemble'],0));FXT.chorus.hint='Thickens the sound. Modes: chorus, flanger (jet sweep) and ensemble (lush string-machine chorus).';
FXT.limiter.params=[FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('release','Release',10,500,'ms',60),FP('mix','Mix',0,100,'%',100)];
FXT.lfo.params=[FP('rate','Rate',0.02,20,'Hz',1,{sync:1}),OPT('shape','Shape',['Sine','Triangle','Saw','Square','Random steps'],0),FP('depth','Depth',0,100,'%',100),OPT('retrig','Restart on note',['Off','On'],0)];
FXT.env.hint='Envelope follower: turns how loud its audio input is into a control signal.';
['delay','chorus','phaser'].forEach(k=>{FXT[k].fbOk=1;});
/* value text for choice parameters */
const fmtPar0=fmtPar;
fmtPar=function(q,v){return q.opts?q.opts[clamp(Math.round(v),0,q.opts.length-1)]:fmtPar0(q,v);};

/* ---------- modular FX: view ---------- */
const PORT_LBL={out:'out',in:'in',sc:'side',dry:'dry',wet:'wet',mix:'mix',in1:'in 1',in2:'in 2',in3:'in 3',in4:'in 4',low:'low',mid:'mid',high:'high',side:'side'};
const portBtn=(n,p,dir,kind,extra)=>'<button type="button" class="port '+dir+' k-'+kind+'" data-n="'+n.id+'" data-p="'+p+'" data-dir="'+dir+'" aria-label="'+esc(n.name+' '+(PORT_LBL[p]||p)+' '+dir+'put')+'"'+(extra||'')+'></button>';
function parRowHTML(g,n,q,stack){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]),r=parReal(g,n,q,fxClock());
  const norm=tg?tg.value:paramNorm(n,q);
  const port=stack?'':portBtn(n,'p:'+q.k,'in','ctl');
  return '<div class="fxp'+(tg?' tagged':'')+(r.mod?' modd':'')+'" data-k="'+q.k+'">'+port
    +'<span class="pl">'+q.label+'</span>'
    +'<input type="range" class="pr" min="0" max="1000" value="'+Math.round(norm*1000)+'" data-pk="'+q.k+'" data-n="'+n.id+'"'+(tg?' disabled':'')+' aria-label="'+esc(n.name+' '+q.label)+'">'
    +'<output class="pv">'+fmtPar(q,r.v)+'</output></div>';
}
function nodeHTML(g,n,an){
  const d=FXT[n.type],cls=['fxn','k-'+d.kind];if(d.pedal||n.skin==='pedal')cls.push('pedal');
  if(n.bypass) cls.push('bypass'); if(an.idle.indexOf(n.id)>=0) cls.push('idle'); if(S.fx.sel===n.id) cls.push('sel');
  const rows=Math.max(d.ins.length,d.outs.length);let io='';
  for(let i=0;i<rows;i++){
    const a=d.ins[i],o=d.outs[i];
    io+='<div class="fxr"><span class="side l">'+(a?portBtn(n,a,'in','in')+'<i>'+PORT_LBL[a]+'</i>':'')+'</span><span class="side r">'+(o?'<i>'+PORT_LBL[o]+'</i>'+portBtn(n,o,'out',fxIsMod(n)?'ctl':(o==='out'?'mix':o)):'')+'</span></div>';
  }
  const hd='<div class="fxh" data-drag="1"><b>'+esc(n.name)+'</b>'
    +(d.kind==='io'?'':'<button type="button" class="fxb" data-fa="byp" data-id="'+n.id+'" title="Bypass" aria-label="Bypass '+esc(n.name)+'" aria-pressed="'+n.bypass+'">⏻</button><button type="button" class="fxb" data-fa="del" data-id="'+n.id+'" title="Remove" aria-label="Remove '+esc(n.name)+'">✕</button>')+'</div>';
  const ps=d.params.map(q=>parRowHTML(g,n,q,false)).join('')
    +(n.type==='macro'?'<div class="fxp"><span class="pl">Tag</span><select class="mtag" data-n="'+n.id+'" aria-label="Macro tag">'+tagOpts().map(o=>'<option value="'+o[0]+'"'+(o[0]===(n.tag.value||'')?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select></div>':'');
  const isPed=d.pedal||n.skin==='pedal',ped=isPed?'<div class="stomp"><span class="pled'+(n.bypass?'':' on')+'" aria-hidden="true"></span><button type="button" class="foot" data-fa="byp" data-id="'+n.id+'" aria-pressed="'+!n.bypass+'" aria-label="Footswitch '+esc(n.name)+'"></button></div>':'';
  const pst=isPed?';--ped:'+(d.pedal||'#555'):'';
  return '<div class="'+cls.join(' ')+'" data-id="'+n.id+'" style="left:'+n.x+'px;top:'+n.y+'px'+pst+'">'+hd+'<div class="fxio">'+io+'</div>'+(ps?'<div class="fxps">'+ps+'</div>':'')+ped+'</div>';
}
function portPos(pan,id,p,dir){
  const el=$('.port[data-n="'+id+'"][data-p="'+p+'"][data-dir="'+dir+'"]',$('#fxNodes')); if(!el) return null;
  const r=el.getBoundingClientRect();
  return{x:r.left+r.width/2-pan.left,y:r.top+r.height/2-pan.top};
}
const curvePath=(a,b)=>{const dx=Math.max(40,Math.abs(b.x-a.x)*.5);return 'M'+a.x.toFixed(1)+' '+a.y.toFixed(1)+' C'+(a.x+dx).toFixed(1)+' '+a.y.toFixed(1)+' '+(b.x-dx).toFixed(1)+' '+b.y.toFixed(1)+' '+b.x.toFixed(1)+' '+b.y.toFixed(1);};
function fxCables(){
  const g=curG(),an=S.fx.an||(S.fx.an=fxAnalyze(g)),pan=$('#fxPan').getBoundingClientRect(),back=new Set();
  an.cycles.forEach(c=>{for(let i=0;i<c.ids.length;i++){const a=c.ids[i],b=c.ids[(i+1)%c.ids.length];g.cables.forEach(k=>{if(k.from.n===a&&k.to.n===b)back.add(k.id);});}});
  let h='';
  g.cables.forEach(c=>{
    const a=portPos(pan,c.from.n,c.from.p,'out'),b=portPos(pan,c.to.n,c.to.p,'in'); if(!a||!b) return;
    const kind=cableKind(g,c)==='ctl'?'ctl':(c.from.p==='out'?'mix':c.from.p),d=curvePath(a,b);
    const pd=an.pdc.find(p=>p.cable===c.id);
    h+='<g class="cab k-'+kind+(S.fx.cable===c.id?' sel':'')+(back.has(c.id)?' fb':'')+(S.fx.flow?' flow':'')+'" data-cid="'+c.id+'"><path class="hit" d="'+d+'"/><path class="ln" d="'+d+'"/>'
      +(pd?'<text x="'+((a.x+b.x)/2).toFixed(0)+'" y="'+(((a.y+b.y)/2)-6).toFixed(0)+'" class="pdc">+'+pd.ms+' ms</text>':'')+'</g>';
  });
  $('#fxCables').innerHTML=h;
}
function fxReport(){
  const an=S.fx.an,g=curG(); if(!an) return;
  const pct=Math.min(100,Math.round(an.cost*5));
  const tl=an.tail>=1000?(an.tail/1000).toFixed(1)+' s':Math.round(an.tail)+' ms';
  const w=an.warn.length?an.warn.map(x=>'<li class="'+x.lvl+'">'+esc(x.t)+'</li>').join(''):'<li class="good">Looks good. No loops, nothing unreachable.</li>';
  $('#fxRep').innerHTML='<div class="rep"><div class="meter" role="img" aria-label="Estimated cost '+pct+' percent"><i style="width:'+pct+'%"></i></div>'
    +'<div class="stats"><div><small>Cost</small><b>~'+an.cost.toFixed(1)+' units</b></div><div><small>Latency</small><b>'+an.lat+' ms</b></div><div><small>Tail</small><b>'+tl+'</b></div><div><small>Nodes</small><b>'+g.nodes.length+'</b></div></div>'
    +'<ul class="warns">'+w+'</ul><p class="hint">Cost, latency and tails are estimates. The audio you hear is real.</p></div>';
}
function fxInspHTML(){
  const g=curG(),n=S.fx.sel&&nodeById(g,S.fx.sel),c=S.fx.cable&&g.cables.find(x=>x.id===S.fx.cable);
  if(c){
    const a=nodeById(g,c.from.n),b=nodeById(g,c.to.n),ctl=cableKind(g,c)==='ctl';
    return sec('Cable','<p class="hint" style="margin-top:0">'+esc(a.name)+' · '+(PORT_LBL[c.from.p]||c.from.p)+' → '+esc(b.name)+' · '+(ctl?c.to.p.slice(2):PORT_LBL[c.to.p])+'</p>'
      +(ctl?'<label class="f"><span>Amount</span><input type="range" data-fa="amt" min="0" max="100" value="'+c.amt+'"><output>'+c.amt+'%</output></label>':'')
      +'<div class="chips"><button type="button" class="btn" data-fa="insert">Insert effect here…</button><button type="button" class="btn danger" data-fa="delcab">Delete cable</button></div>');
  }
  if(!n) return '<p class="empty">Select a node or cable.<br>Double-click empty space to search and add.</p>';
  const d=FXT[n.type];
  let h='<div class="phead"><input type="text" class="pname" data-fn="name" value="'+esc(n.name)+'" aria-label="Node name"><span class="badge">'+d.label+'</span></div><p class="hint">'+d.hint+'</p>';
  if(d.sample){const cur=(n.s&&n.s.ir)||'';h+=sec('Impulse file','<label class="f"><span>Sample</span><select data-fn="ir" aria-label="Impulse sample"><option value="">— none —</option>'+S.samples.map(s=>'<option value="'+s.id+'"'+(s.id===cur?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label><p class="hint">Import the impulse (a recording of a room or a cabinet) in the Samples tab. It does not need to be mapped; it is packed into the library because this node uses it.</p>');}
  if(d.kind==='fx'&&!d.pedal)h+='<label class="f chk"><input type="checkbox" data-fn="skin"'+(n.skin==='pedal'?' checked':'')+'><span>Show as a pedal</span></label>';
  if(d.params.length){
    h+=sec('Link parameters to tags',d.params.map(q=>'<label class="f"><span>'+q.label+'</span><select data-fn="tag" data-k="'+q.k+'" aria-label="Tag for '+q.label+'"><option value="">— set by hand —</option>'+S.tags.filter(t=>t.kind!==undefined).map(t=>'<option value="'+t.id+'"'+(n.tag[q.k]===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>').join('')
      +'<p class="hint">A linked parameter follows the tag, so a knob in the designer can drive it. Tempo-sync tags set the delay time in ms.</p>');
  }
  if(d.kind!=='io') h+='<div class="chips"><button type="button" class="btn" data-fa="byp" data-id="'+n.id+'">'+(n.bypass?'Enable':'Bypass')+'</button><button type="button" class="btn danger" data-fa="del" data-id="'+n.id+'">Remove</button></div>';
  return h;
}
function fxScopeHTML(){
  const scopes=['master'].concat(S.groups);
  return '<p class="hint" style="margin-top:0">Each sample group can have its own chain, plus the master chain after everything.</p>'
    +scopes.map(s=>'<button type="button" class="scope'+(S.fx.scope===s?' on':'')+'" data-fa="scope" data-s="'+esc(s)+'">'+(s==='master'?'Master':esc(s))+(S.fx.graphs[s]?'<small>'+(S.fx.graphs[s].nodes.length-2)+' fx</small>':'')+'</button>').join('');
}
function fxPaletteHTML(){
  return FX_CATS.map(c=>'<div class="pcat">'+c+'</div><div class="chips">'+Object.keys(FXT).filter(k=>FXT[k].cat===c).map(k=>'<button type="button" class="btn" data-fa="add" data-t="'+k+'">+ '+FXT[k].label+'</button>').join('')+'</div>').join('');
}
function fxStackHTML(){
  const g=curG(),order=chainOrder(g),straight=isStraight(g);
  let h='<div class="stk">'+(straight?'':'<p class="note">This graph branches or has control cables, so the stack shows signal order only. Moving things here rebuilds a straight chain; control cables stay.</p>')
    +'<div class="stkend">Input</div>';
  order.forEach((n,i)=>{
    h+='<div class="stkc'+(n.bypass?' bypass':'')+'" data-id="'+n.id+'"><div class="stkh"><b>'+esc(n.name)+'</b><span class="grow"></span>'
      +'<button type="button" class="fxb" data-fa="sup" data-id="'+n.id+'"'+(i?'':' disabled')+' aria-label="Move up">▲</button><button type="button" class="fxb" data-fa="sdn" data-id="'+n.id+'"'+(i<order.length-1?'':' disabled')+' aria-label="Move down">▼</button>'
      +'<button type="button" class="fxb" data-fa="byp" data-id="'+n.id+'" aria-label="Bypass">⏻</button><button type="button" class="fxb" data-fa="del" data-id="'+n.id+'" aria-label="Remove">✕</button></div>'
      +'<div class="fxps">'+FXT[n.type].params.map(q=>parRowHTML(g,n,q,true)).join('')+'</div></div>';
  });
  h+='<div class="stkend">Output</div><div class="chips"><select id="stkAdd" aria-label="Effect to add">'+Object.keys(FXT).filter(k=>FXT[k].kind==='fx').map(k=>'<option value="'+k+'">'+FXT[k].label+'</option>').join('')+'</select><button type="button" class="btn" data-fa="sadd">Add to end</button>'+(straight?'':'<button type="button" class="btn" data-fa="sflat">Flatten to a chain</button>')+'</div></div>';
  return h;
}
function fxRender(){
  if(!$('#fxNodes')) return;
  const g=curG(); S.fx.an=fxAnalyze(g);
  const nodesView=S.fx.view==='nodes';
  $('#fxStage').hidden=!nodesView; $('#fxStack').hidden=nodesView;
  $('#fxVNodes').setAttribute('aria-pressed',String(nodesView)); $('#fxVStack').setAttribute('aria-pressed',String(!nodesView));
  $('#fxFlow').setAttribute('aria-pressed',String(S.fx.flow)); $('#fxScopeName').textContent=S.fx.scope==='master'?'Master chain':S.fx.scope;
  $('#fxScope').innerHTML=fxScopeHTML(); $('#fxPal').innerHTML=fxPaletteHTML();
  if(nodesView){
    $('#fxPan').style.transform='translate('+S.fx.pan.x+'px,'+S.fx.pan.y+'px)';
    $('#fxNodes').innerHTML=g.nodes.map(n=>nodeHTML(g,n,S.fx.an)).join('');
    fxCables();
  }else $('#fxStack').innerHTML=fxStackHTML();
  fxReport(); fxInspRender();
  fxTickStart();
}
function fxInspRender(){$('#fxInsp').innerHTML=fxInspHTML();}
/* live values only: no DOM rebuild */
function fxRefreshParams(){
  if(S.view!=='fx'||!$('#fxNodes')) return;
  const g=curG(),t=fxClock();
  $$('.fxp[data-k]',$('#centerF')).forEach(row=>{
    const host=row.closest('[data-id]'); if(!host) return;
    const n=nodeById(g,host.dataset.id); if(!n) return;
    const q=FXT[n.type].params.find(x=>x.k===row.dataset.k); if(!q) return;
    const r=parReal(g,n,q,t),tg=n.tag[q.k]&&tagById(n.tag[q.k]);
    const rng=$('.pr',row); if(rng&&document.activeElement!==rng) rng.value=Math.round((tg?tg.value:clamp((r.v-q.min)/(q.max-q.min),0,1))*1000);
    $('.pv',row).textContent=fmtPar(q,r.v); row.classList.toggle('modd',!!r.mod);
  });
  S.fx.an=fxAnalyze(g); fxReport();
}
let tickOn=false;
function fxTickStart(){
  if(tickOn||S.view!=='fx') return;
  tickOn=true; let last=0;
  const f=ts=>{
    if(S.view!=='fx'){tickOn=false;return;}
    if(S.fx.flow&&ts-last>60){last=ts;fxRefreshParams();}
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

/* ---------- modular FX: interaction ---------- */
let addCount=0;
function fxSelect(id,cab){
  S.fx.sel=id||null; S.fx.cable=cab||null;
  $$('#fxNodes .fxn').forEach(e=>e.classList.toggle('sel',e.dataset.id===S.fx.sel));
  $$('#fxCables .cab').forEach(e=>e.classList.toggle('sel',e.dataset.cid===S.fx.cable));
  fxInspRender();
}
function newNodeAt(type,x,y){
  const g=curG(),n=fxNode(type,x,y); g.nodes.push(n); return n;
}
function centerSpot(){
  const st=$('#fxStage'),o=(addCount++%6)*22;
  return{x:st.clientWidth/2-S.fx.pan.x-95+o,y:st.clientHeight/2-S.fx.pan.y-60+o};
}
function fxAddCenter(type){
  const p=centerSpot(),n=newNodeAt(type,p.x,p.y);
  S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash(n.name+' added. Drag from a port to wire it.');
}
function insertOnCable(cid,type,x,y){
  const g=curG(),c=g.cables.find(k=>k.id===cid); if(!c) return;
  const a=nodeById(g,c.from.n),b=nodeById(g,c.to.n);
  if(cableKind(g,c)!=='audio'||FXT[type].kind==='mod'){
    const n=newNodeAt(type,x,y); S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash('Control cables cannot be split, so the node was just added.'); return;
  }
  const n=newNodeAt(type,x,y);
  g.cables=g.cables.filter(k=>k!==c);
  g.cables.push(mkCable(a,c.from.p,n,'in'));
  g.cables.push(mkCable(n,FXT[type].outs.indexOf('mix')>=0?'mix':FXT[type].outs[0],b,c.to.p));
  S.fx.sel=n.id; S.fx.cable=null; fxRender(); flash('Inserted '+n.name+' into the cable.');
}
/* ---- search overlay ---- */
const SR={x:0,y:0,cab:null,list:[],i:0};
function srcFilter(q){
  q=q.trim().toLowerCase();
  return Object.keys(FXT).filter(k=>FXT[k].kind!=='io'&&(!q||(FXT[k].label+' '+FXT[k].cat+' '+FXT[k].hint).toLowerCase().indexOf(q)>=0));
}
function srcDraw(){
  SR.list=srcFilter($('#fxQ').value); SR.i=clamp(SR.i,0,Math.max(0,SR.list.length-1));
  $('#fxRes').innerHTML=SR.list.length?SR.list.map((k,i)=>'<li role="option" data-t="'+k+'" aria-selected="'+(i===SR.i)+'"><b>'+FXT[k].label+'</b><small>'+FXT[k].cat+'</small></li>').join(''):'<li class="none">Nothing matches</li>';
}
function openSearch(x,y,cab){
  const s=$('#fxSearch'),st=$('#fxStage').getBoundingClientRect();
  SR.x=x;SR.y=y;SR.cab=cab||null;SR.i=0;
  s.hidden=false; s.style.left=clamp(x+S.fx.pan.x,6,Math.max(6,st.width-260))+'px'; s.style.top=clamp(y+S.fx.pan.y,6,Math.max(6,st.height-280))+'px';
  $('#fxQ').value=''; srcDraw(); $('#fxQ').focus();
}
function closeSearch(){$('#fxSearch').hidden=true;}
function srcPick(type){
  if(!type) return; closeSearch();
  if(SR.cab) insertOnCable(SR.cab,type,SR.x,SR.y);
  else{const n=newNodeAt(type,SR.x,SR.y);S.fx.sel=n.id;S.fx.cable=null;fxRender();}
}
$('#fxQ').addEventListener('input',()=>{SR.i=0;srcDraw();});
$('#fxQ').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){SR.i=Math.min(SR.list.length-1,SR.i+1);srcDraw();e.preventDefault();}
  else if(e.key==='ArrowUp'){SR.i=Math.max(0,SR.i-1);srcDraw();e.preventDefault();}
  else if(e.key==='Enter'){srcPick(SR.list[SR.i]);e.preventDefault();}
  else if(e.key==='Escape'){closeSearch();e.preventDefault();}
});
$('#fxRes').addEventListener('click',e=>{const li=e.target.closest('[data-t]');if(li)srcPick(li.dataset.t);});
/* ---- pointer on the node stage ---- */
const fxStage=$('#fxStage');
function panPoint(ev){const r=$('#fxPan').getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
fxStage.addEventListener('pointerdown',e=>{
  const t=e.target;
  if(!$('#fxSearch').hidden&&!t.closest('#fxSearch')) closeSearch();
  const port=t.closest('.port');
  if(port&&port.dataset.dir==='out'){startWire(e,port);return;}
  if(port) return;
  if(t.closest('.fxb,input,select,textarea')) return;
  const hit=t.closest('.cab');
  if(hit){fxSelect(null,hit.dataset.cid);return;}
  const nd=t.closest('.fxn');
  if(nd){
    fxSelect(nd.dataset.id,null);
    if(t.closest('.fxh')) startNodeDrag(e,nd);
    return;
  }
  fxSelect(null,null);
  const sx=e.clientX,sy=e.clientY,ox=S.fx.pan.x,oy=S.fx.pan.y;
  fxStage.classList.add('panning');
  drag(ev=>{S.fx.pan.x=Math.round(ox+ev.clientX-sx);S.fx.pan.y=Math.round(oy+ev.clientY-sy);$('#fxPan').style.transform='translate('+S.fx.pan.x+'px,'+S.fx.pan.y+'px)';},()=>fxStage.classList.remove('panning'));
});
function startNodeDrag(e,nd){
  const n=nodeById(curG(),nd.dataset.id); if(!n) return; e.preventDefault();
  const sx=e.clientX,sy=e.clientY,ox=n.x,oy=n.y;
  drag(ev=>{
    n.x=Math.round(ox+ev.clientX-sx); n.y=Math.round(oy+ev.clientY-sy);
    nd.style.left=n.x+'px'; nd.style.top=n.y+'px'; fxCables();
  });
}
function startWire(e,port){
  e.preventDefault();
  const g=curG(),a=nodeById(g,port.dataset.n),ap=port.dataset.p; if(!a) return;
  fxStage.classList.add('wiring');
  $$('#fxNodes .port.in').forEach(p=>{const b=nodeById(g,p.dataset.n);p.classList.toggle('can',!!b&&!canConnect(g,a,ap,b,p.dataset.p));});
  const kind=fxIsMod(a)?'ctl':(ap==='out'?'mix':ap),tmp=$('#fxTemp');
  tmp.setAttribute('class','k-'+kind);
  const from=portPos($('#fxPan').getBoundingClientRect(),a.id,ap,'out');
  const upd=ev=>{const p=panPoint(ev);tmp.setAttribute('d',curvePath(from,p));};
  upd(e);
  drag(upd,()=>{});
  const fin=ev=>{
    window.removeEventListener('pointerup',fin);
    tmp.setAttribute('d',''); fxStage.classList.remove('wiring');
    $$('#fxNodes .port.can').forEach(p=>p.classList.remove('can'));
    const el=document.elementFromPoint(ev.clientX,ev.clientY);
    let tp=el&&el.closest('.port.in'),b,bp;
    if(tp){b=nodeById(g,tp.dataset.n);bp=tp.dataset.p;}
    else{
      const nd=el&&el.closest('.fxn');
      if(nd&&!fxIsMod(a)){b=nodeById(g,nd.dataset.id);bp='in';}
    }
    if(!b) return;
    const why=addCable(g,a,ap,b,bp);
    if(why){flash(why);return;}
    fxRender();
  };
  window.addEventListener('pointerup',fin);
}
fxStage.addEventListener('dblclick',e=>{
  if(e.target.closest('.fxn,.port,#fxSearch')) return;
  const hit=e.target.closest('.cab'),p=panPoint(e);
  openSearch(p.x-40,p.y-20,hit?hit.dataset.cid:null);
});
/* ---- parameter inputs ---- */
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('pr')){
    const g=curG(),n=nodeById(g,t.dataset.n),q=n&&FXT[n.type].params.find(x=>x.k===t.dataset.pk); if(!q) return;
    n.p[q.k]=q.min+(t.value/1000)*(q.max-q.min);if(q.opts)n.p[q.k]=Math.round(n.p[q.k]);
    const row=t.closest('.fxp');
    row.querySelector('.pv').textContent=fmtPar(q,parReal(g,n,q,fxClock()).v);
    S.fx.an=fxAnalyze(g); fxReport(); return;
  }
  if(t.dataset&&t.dataset.fn==='name'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return; n.name=t.value||FXT[n.type].label;
    const h=$('#fxNodes .fxn[data-id="'+n.id+'"] .fxh b'); if(h) h.textContent=n.name; return;
  }
  if(t.dataset&&t.dataset.fa==='amt'){
    const c=curG().cables.find(k=>k.id===S.fx.cable); if(!c) return; c.amt=+t.value; t.nextElementSibling.textContent=c.amt+'%'; fxRefreshParams();
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('mtag')){
    const n=nodeById(curG(),t.dataset.n); if(!n) return; if(t.value) n.tag.value=t.value; else delete n.tag.value; fxRefreshParams(); return;
  }
  if(t.dataset&&(t.dataset.fn==='ir'||t.dataset.fn==='skin')){
    const n=nodeById(curG(),S.fx.sel); if(!n) return;
    if(t.dataset.fn==='ir'){n.s=n.s||{};n.s.ir=t.value||null;}else n.skin=t.checked?'pedal':null;
    fxRender(); return;
  }
  if(t.dataset&&t.dataset.fn==='tag'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return;
    if(t.value) n.tag[t.dataset.k]=t.value; else delete n.tag[t.dataset.k];
    fxRender();
  }
});
/* ---- buttons ---- */
function fxAct(act,b){
  const g=curG(),id=b.dataset.id,n=id&&nodeById(g,id);
  switch(act){
    case 'add': fxAddCenter(b.dataset.t); break;
    case 'scope': S.fx.scope=b.dataset.s; S.fx.sel=null; S.fx.cable=null; S.fx.pan={x:30,y:20}; fxRender(); break;
    case 'byp': if(n){n.bypass=!n.bypass;fxRender();} break;
    case 'del': if(n&&FXT[n.type].kind!=='io'){removeNode(g,n.id);if(S.fx.sel===n.id)S.fx.sel=null;fxRender();} break;
    case 'delcab': g.cables=g.cables.filter(c=>c.id!==S.fx.cable); S.fx.cable=null; fxRender(); break;
    case 'insert': {
      const c=g.cables.find(k=>k.id===S.fx.cable); if(!c) break;
      const a=nodeById(g,c.from.n),bb=nodeById(g,c.to.n);
      openSearch(Math.round((a.x+bb.x)/2)+60,Math.round((a.y+bb.y)/2)+30,c.id); break;
    }
    case 'sup': case 'sdn': {
      const o=chainOrder(g),i=o.findIndex(x=>x.id===id),j=i+(act==='sup'?-1:1); if(i<0||j<0||j>=o.length) break;
      o.splice(j,0,o.splice(i,1)[0]); relinkChain(g,o); fxRender(); break;
    }
    case 'sadd': {const o=chainOrder(g),m=fxNode($('#stkAdd').value,0,0);g.nodes.push(m);o.push(m);relinkChain(g,o);fxRender();break;}
    case 'sflat': relinkChain(g,chainOrder(g)); fxRender(); flash('Flattened to a straight chain'); break;
  }
}
document.addEventListener('click',e=>{
  if(S.view!=='fx') return;
  const b=e.target.closest('[data-fa]'); if(!b||b.tagName==='INPUT'||b.tagName==='SELECT') return;
  fxAct(b.dataset.fa,b);
});
$('#fxVNodes').addEventListener('click',()=>{S.fx.view='nodes';fxRender();});
$('#fxVStack').addEventListener('click',()=>{S.fx.view='stack';fxRender();});
$('#fxFlow').addEventListener('click',()=>{S.fx.flow=!S.fx.flow;fxRender();flash(S.fx.flow?'Flow on: cables animate and modulators move.':'Flow off');});
$('#fxFit').addEventListener('click',()=>{S.fx.pan={x:30,y:20};fxRender();});
$('#fxAddBtn').addEventListener('click',()=>{const p=centerSpot();openSearch(p.x,p.y,null);});
/* keys, called from the global handler while the FX view is open */
function fxKey(e){
  if(!$('#fxSearch').hidden) return;
  const g=curG();
  if(e.key==='Delete'||e.key==='Backspace'){
    if(S.fx.cable){g.cables=g.cables.filter(c=>c.id!==S.fx.cable);S.fx.cable=null;fxRender();e.preventDefault();}
    else if(S.fx.sel){const n=nodeById(g,S.fx.sel);if(n&&FXT[n.type].kind!=='io'){removeNode(g,n.id);S.fx.sel=null;fxRender();e.preventDefault();}}
  }else if(e.key==='b'&&S.fx.sel){const n=nodeById(g,S.fx.sel);if(n&&FXT[n.type].kind!=='io'){n.bypass=!n.bypass;fxRender();}}
  else if(e.key==='a'||e.key==='/'){const p=centerSpot();openSearch(p.x,p.y,S.fx.cable);e.preventDefault();}
  else if(e.key==='Escape'){fxSelect(null,null);}
}

/* ---------- FX audio: turns the FX graphs into real Web Audio ----------
   voices -> group input -> [group graph] -> master input -> [master graph] -> sampler bus -> output
   The graph is rebuilt when its structure changes; parameters (including modulation) are applied about 60 times a second. */
const FXA={ctx:null,gin:{},gout:{},min:null,sig:'',scopes:{},follow:{},buses:[],wl:null,wlReady:false,noise:null,timer:0,last:0};
const FXM={vel:0,key:60,gate:false,tOn:-1,tOff:-1,mod:0,expr:1,at:0,bend:.5,lvlOn:0};
/* ---- modulator outputs (used by modOut) ---- */
function lfoOut(g,n,t){
  const v=n.p,r=paramReal(g,n,FXT.lfo.params[0],t,false),hz=typeof r==='number'?1000/Math.max(1,r):r.v;
  const tt=v.retrig&&FXM.tOn>=0?t-FXM.tOn:t,ph=(tt*hz)%1,sh=Math.round(v.shape);
  const w=sh===1?1-Math.abs(ph*4-2):sh===2?ph*2-1:sh===3?(ph<.5?1:-1):sh===4?hash01(Math.floor(tt*hz)+n.id.length)*2-1:Math.sin(2*Math.PI*ph);
  return .5+.5*w*(v.depth/100);
}
function adsrOut(v,t){
  if(FXM.tOn<0) return 0;
  const a=v.a/1000,d=v.d/1000,s=v.s/100,r=v.r/1000;
  const level=x=>x<a?(a>0?x/a:1):x<a+d?1-(1-s)*((x-a)/Math.max(1e-4,d)):s;
  if(FXM.gate) return level(t-FXM.tOn);
  const rel=t-FXM.tOff; return rel>=r?0:FXM.lvlOn*(1-rel/Math.max(1e-4,r));
}
function midiSrcOut(src){
  const s=Math.round(src);
  if(s===5) return FXM.bend;                         /* pitch bend is bipolar */
  const v=s===0?FXM.vel/127:s===1?FXM.key/127:s===2?FXM.mod:s===3?FXM.expr:FXM.at;
  return .5+.5*v;
}
const RND={};
function randOut(n,t){
  const v=n.p,step=Math.floor(t*v.rate),st=RND[n.id]||(RND[n.id]={cur:.5,step:-1,target:.5});
  if(step!==st.step){st.step=step;st.target=hash01(step*7.31+n.id.length*13);}
  const k=v.smooth>0?Math.min(1,(1/60)/(v.smooth/100/v.rate+1e-3)):1; st.cur+=(st.target-st.cur)*k;
  return .5+(st.cur-.5)*(v.depth/100);
}
function fxNoteOn(note,vel){FXM.vel=vel;FXM.key=note;FXM.gate=true;FXM.tOn=fxClock();}
function fxNoteOff(){const t=fxClock();FXM.lvlOn=1;FXM.gate=false;FXM.tOff=t;
  /* remember the level at release so the envelope releases from where it was */
  const g=Object.values(S.fx.graphs).flatMap(x=>x.nodes).find(n=>n.type==='adsr');
  if(g){const p=g.p,x=t-FXM.tOn,a=p.a/1000,d=p.d/1000,s=p.s/100;FXM.lvlOn=x<a?(a>0?x/a:1):x<a+d?1-(1-s)*((x-a)/Math.max(1e-4,d)):s;}}
/* ---- helpers ---- */
const dbg=db=>Math.pow(10,db/20);
const logF=(pct,lo,hi)=>lo*Math.pow(hi/lo,clamp(pct/100,0,1));
function setP(param,v,tc){if(!param||!isFinite(v))return;const c=FXA.ctx;try{param.setTargetAtTime(v,c.currentTime,tc||.02);}catch(e){}}
function noiseBuf(c){
  if(FXA.noise&&FXA.noise.sampleRate===c.sampleRate) return FXA.noise;
  const b=c.createBuffer(2,c.sampleRate*2,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  return FXA.noise=b;
}
function crackleBuf(c){
  const b=c.createBuffer(2,c.sampleRate*3,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i++){if(Math.random()<.00035){const a=(Math.random()*2-1)*(.3+Math.random()*.7),L=2+Math.floor(Math.random()*30);for(let k=0;k<L&&i+k<d.length;k++)d[i+k]+=a*Math.exp(-k/4)*(k%2?-1:1);}}}
  return b;
}
function loopSrc(c,buf){const s=c.createBufferSource();s.buffer=buf;s.loop=true;s.start();return s;}
function osc(c,type,hz){const o=c.createOscillator();o.type=type||'sine';o.frequency.value=hz||1;o.start();return o;}
function gainN(c,v){const g=c.createGain();g.gain.value=v==null?1:v;return g;}
function biq(c,type,f,q,gain){const b=c.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;if(gain!=null)b.gain.value=gain;return b;}
function chain(){for(let i=0;i<arguments.length-1;i++)arguments[i].connect(arguments[i+1]);return arguments[arguments.length-1];}
function shaperCurve(type,drive){
  const n=2048,c=new Float32Array(n),k=1+drive*30;
  for(let i=0;i<n;i++){
    const x=i/(n-1)*2-1;let y;
    if(type===0) y=Math.tanh(k*x+.2*k*x*x)/Math.tanh(k);                         /* tube: soft, slightly asymmetric */
    else if(type===1) y=Math.atan(k*x)/Math.atan(k);                              /* tape: smooth */
    else if(type===2) y=clamp(x*k,-1,1);                                          /* hard clip */
    else if(type===3){let z=x*(1+drive*6);while(Math.abs(z)>1)z=z>0?2-z:-2-z;y=z;} /* foldback */
    else if(type===4) y=Math.sign(x)*(1-Math.exp(-Math.abs(x)*k*2))*(x<0?.85:1);  /* fuzz: hard and gated-ish */
    else if(type===5){const z=clamp(x*k*.5,-1.5,1.5);y=z-z*z*z/6.75;}            /* soft clip */
    else if(type===6){const q=Math.max(2,32-drive*30);y=clamp(Math.round(x*k*.3*q)/q,-1,1);} /* bitcrush */
    else if(type===7){const z=Math.tanh(x*k*.5);y=.75*Math.abs(z)+.25*z;}        /* rectify */
    else if(type===8) y=Math.sin(x*(1+drive*8)*Math.PI/2);                        /* sine shaper */
    else y=x>=0?Math.tanh(x*k):Math.tanh(x*k*.25)*.6;                             /* diode */
    c[i]=y;
  }
  /* level compensation: drive adds grit, not a big volume jump */
  const m=n>>1,slope=Math.abs((c[m+1]-c[m-1])/(4/(n-1))),comp=1/Math.sqrt(Math.max(1,slope));
  for(let i=0;i<n;i++)c[i]*=comp;
  return c;
}
/* ---- reverb impulses ---- */
function makeIR(c,o){
  const sr=c.sampleRate,flav=o.flav||'hall',decay=Math.max(.1,o.decay||2),len=Math.min(sr*14,Math.floor(sr*(flav==='gated'?o.gate/1000+.05:decay*1.3)));
  const b=c.createBuffer(2,Math.max(256,len),sr),size=(o.size==null?60:o.size)/100;
  for(let ch=0;ch<2;ch++){
    const d=b.getChannelData(ch);let lp=0,hold=0;
    const damp=(o.damp==null?40:o.damp)/100,bright=flav==='plate'||flav==='digital'?.15:0;
    for(let i=0;i<d.length;i++){
      const t=i/sr;let env;
      if(flav==='gated') env=t<o.gate/1000?(.6+.4*Math.min(1,t*40)):Math.max(0,1-(t-o.gate/1000)*40);
      else env=Math.exp(-6.9*t/decay)*Math.min(1,t/(.002+.02*size));
      let x=Math.random()*2-1;
      if(flav==='digital'){if(i%Math.max(1,Math.round(1+(o.grit||50)/25))===0)hold=Math.round((Math.random()*2-1)*(8+(100-(o.grit||50))*.6))/(8+(100-(o.grit||50))*.6);x=hold;}
      const a=clamp(.15+damp*.8*Math.min(1,t/decay)-bright,.02,.98);lp=lp*a+x*(1-a);
      d[i]=(flav==='digital'?x*.5+lp*.5:lp)*env;
    }
    if(flav==='spring'){ /* boing: dispersive chirp echoes */
      const per=Math.floor(sr*(.028+ch*.003)),drip=(o.drip||50)/100;
      for(let e=0;e*per<d.length;e++){const amp=Math.exp(-6.9*e*per/sr/decay)*.8;for(let k=0;k<per&&e*per+k<d.length;k++){const tt=k/sr;d[e*per+k]+=amp*Math.sin(2*Math.PI*(400+drip*2200*Math.exp(-tt*120))*tt)*Math.exp(-tt*60);}}
    }
    if(flav==='room'||flav==='hall'||flav==='plate'){ /* a few early reflections */
      for(let r=0;r<8;r++){const p=Math.floor(sr*(.004+r*.006*(.5+size)+Math.random()*.003));if(p<d.length)d[p]+=(Math.random()<.5?-1:1)*.6*Math.exp(-r*.35);}
    }
  }
  return b;
}
/* ---- worklet for crushers (sample-and-hold + bits + companding) ---- */
const CRUSH_SRC=`class C extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'bits',defaultValue:12},{name:'rate',defaultValue:26040},{name:'comp',defaultValue:0},{name:'noise',defaultValue:0}]}
constructor(){super();this.ph=[0,0];this.h=[0,0];}
process(i,o,p){const inp=i[0],out=o[0];if(!inp||!inp.length)return true;const bits=p.bits[0],rate=p.rate[0],comp=p.comp[0]>.5,nz=p.noise[0],step=rate/sampleRate,q=Math.pow(2,Math.max(1,bits)-1),mu=255,lmu=Math.log(1+mu);
for(let c=0;c<out.length;c++){const x=inp[Math.min(c,inp.length-1)],y=out[c];for(let n=0;n<y.length;n++){this.ph[c]+=step;if(this.ph[c]>=1){this.ph[c]-=1;let v=x[n];if(comp){const s=v<0?-1:1;v=s*Math.log(1+mu*Math.min(1,Math.abs(v)))/lmu;v=Math.round(v*q)/q;v=s*(Math.pow(1+mu,Math.abs(v))-1)/mu;}else v=Math.round(v*q)/q;this.h[c]=v+(Math.random()*2-1)*nz;}y[n]=this.h[c];}}return true;}}
registerProcessor('vs-crush',C);`;
function loadWorklet(c){
  if(FXA.wl||!c.audioWorklet) return;
  FXA.wl=c.audioWorklet.addModule(URL.createObjectURL(new Blob([CRUSH_SRC],{type:'text/javascript'}))).then(()=>{FXA.wlReady=true;FXA.sig='';}).catch(()=>{FXA.wl=null;});
}
function crushNode(c){if(!FXA.wlReady)return null;try{return new AudioWorkletNode(c,'vs-crush',{outputChannelCount:[2]});}catch(e){return null;}}
/* ---- modules: each returns {in:{port:AudioNode}, wet:AudioNode | out:{port:AudioNode}, set(k,v), stop()} ---- */
const FXI={
  delay(c,n){
    const fb=n.p.pp>.5,dl=c.createDelay(5),lp=biq(c,'lowpass',8000,.5),fbG=gainN(c,.35),inp=gainN(c);
    if(!fb){chain(inp,dl,lp,fbG,dl);return{in:{in:inp},wet:lp,set(k,v){if(k==='time')setP(dl.delayTime,v/1000);if(k==='fb')setP(fbG.gain,Math.min(.95,v/100));if(k==='tone')setP(lp.frequency,logF(v,600,18000));}};}
    const dr=c.createDelay(5),lr=biq(c,'lowpass',8000,.5),fr=gainN(c,.35),sp=c.createChannelSplitter(2),mono=gainN(c,.5),mg=c.createChannelMerger(2);
    inp.connect(mono);chain(mono,dl,lp,fr,dr);chain(dr,lr,fbG,dl);lp.connect(mg,0,0);lr.connect(mg,0,1);
    return{in:{in:inp},wet:mg,set(k,v){if(k==='time'){setP(dl.delayTime,v/1000);setP(dr.delayTime,v/1000);}if(k==='fb'){setP(fbG.gain,Math.min(.95,v/100));setP(fr.gain,Math.min(.95,v/100));}if(k==='tone'){setP(lp.frequency,logF(v,600,18000));setP(lr.frequency,logF(v,600,18000));}}};
  },
  reverb(c,n){return verbNode(c,n,['room','hall','plate','room','hall','hall','hall'][Math.round(n.p.type)]||'hall');},
  digiverb(c,n){return verbNode(c,n,'digital');},
  gatedverb(c,n){return verbNode(c,n,'gated');},
  spring(c,n){return verbNode(c,n,'spring');},
  shimmer(c,n){
    const v=verbNode(c,n,'hall'),sh=c.createDelay(1),o1=osc(c,'sawtooth',3),og=gainN(c,.0),hp=biq(c,'highpass',900,.7),sg=gainN(c,0);
    /* octave-up by fast moving delay (cheap pitch shift), fed back into the reverb */
    o1.connect(og);og.connect(sh.delayTime);sh.delayTime.value=.05;chain(v.wet,hp,sh,sg,v.in.in);
    return{in:v.in,wet:v.wet,set(k,val){v.set(k,val);if(k==='shine'){setP(sg.gain,val/100*.35);setP(og.gain,-.0165);}},stop(){o1.stop();}};
  },
  conv(c,n){
    const inp=gainN(c),pre=c.createDelay(1),cv=c.createConvolver(),b=BUF.get(n.s&&n.s.ir);chain(inp,pre,cv);
    if(b){const len=Math.max(64,Math.round(b.ch[0].length*n.p.len/100)),ab=c.createBuffer(Math.min(2,b.ch.length),len,b.sr);for(let ch=0;ch<ab.numberOfChannels;ch++)ab.copyToChannel(b.ch[ch].subarray(0,len),ch);cv.buffer=ab;}
    return{in:{in:inp},wet:cv,set(k,v){if(k==='pre')setP(pre.delayTime,v/1000);}};
  },
  chorus(c,n){return modDelay(c,{base:.014,range:.007,fb:0,stereo:true});},
  flanger(c,n){return modDelay(c,{base:.0035,range:.003,fb:.5,stereo:true});},
  vibrato(c,n){return modDelay(c,{base:.006,range:.005,fb:0,stereo:false});},
  phaser(c,n){
    const inp=gainN(c),aps=[],o=osc(c,'sine',.4),og=gainN(c,300),fbG=gainN(c,.3),fd=c.createDelay(.01);let last=inp;
    for(let i=0;i<6;i++){const a=biq(c,'allpass',600+i*250,.6);og.connect(a.frequency);last.connect(a);last=a;aps.push(a);}
    o.connect(og);chain(last,fbG,fd,aps[0]);
    return{in:{in:inp},wet:last,set(k,v){if(k==='rate')setP(o.frequency,v);if(k==='depth')setP(og.gain,v*6);if(k==='fb')setP(fbG.gain,Math.min(.9,v/100));},stop(){o.stop();}};
  },
  trem(c,n){
    const inp=gainN(c),sh=['sine','triangle','square'][Math.round(n.p.shape)]||'sine',o=osc(c,sh,5),dg=gainN(c,.3);o.connect(dg);
    if(n.p.mode>.5){const p=c.createStereoPanner();inp.connect(p);dg.connect(p.pan);return{in:{in:inp},wet:p,set(k,v){if(k==='rate')setP(o.frequency,v>50?1000/v:v);if(k==='depth')setP(dg.gain,v/100);},stop(){o.stop();}};}
    const g=gainN(c,.7);inp.connect(g);dg.connect(g.gain);
    return{in:{in:inp},wet:g,set(k,v){if(k==='rate')setP(o.frequency,v>50?1000/v:v);if(k==='depth'){setP(dg.gain,v/200);setP(g.gain,1-v/200);}},stop(){o.stop();}};
  },
  rotary(c,n){
    const inp=gainN(c),sat=c.createWaveShaper(),lo=biq(c,'lowpass',800,.7),hi=biq(c,'highpass',800,.7),oh=osc(c,'sine',.8),ol=osc(c,'sine',.7);
    const dh=c.createDelay(.02),dlo=c.createDelay(.02),gh=gainN(c,.0008),gl=gainN(c,.0006),ph=c.createStereoPanner(),pl=c.createStereoPanner(),ah=gainN(c,.8),al=gainN(c,.9),ahm=gainN(c,.2),alm=gainN(c,.1),out=gainN(c);
    sat.curve=shaperCurve(0,.2);sat.oversample='2x';dh.delayTime.value=.004;dlo.delayTime.value=.004;
    chain(inp,sat);sat.connect(lo);sat.connect(hi);chain(hi,dh,ah,ph,out);chain(lo,dlo,al,pl,out);
    out.gain.value=.6;oh.connect(gh);gh.connect(dh.delayTime);ol.connect(gl);gl.connect(dlo.delayTime);oh.connect(ph.pan);ol.connect(pl.pan);oh.connect(ahm);ahm.connect(ah.gain);ol.connect(alm);alm.connect(al.gain);
    return{in:{in:inp},wet:out,set(k,v){if(k==='speed'){const f=v>.5;oh.frequency.setTargetAtTime(f?6.7:.8,c.currentTime,f?.6:1.4);ol.frequency.setTargetAtTime(f?5.9:.7,c.currentTime,f?1.6:2.6);}if(k==='drive'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(0,v/100);}},stop(){oh.stop();ol.stop();}};
  },
  filter(c,n){
    const inp=gainN(c),T=['lowpass','highpass','bandpass','notch','peaking'],a=biq(c,'lowpass',8000,1),fs=[a];let last=chain(inp,a);
    if(n.p.slope>.5){const b=biq(c,'lowpass',8000,.7);last=chain(a,b);fs.push(b);}
    return{in:{in:inp},wet:last,set(k,v){
      if(k==='type'){const t=T[Math.round(v)]||'lowpass';fs.forEach(f=>{if(f.type!==t)f.type=t;});}
      if(k==='cutoff')fs.forEach(f=>setP(f.frequency,v));if(k==='res')fs.forEach((f,i)=>setP(f.Q,i?.7:.5+v/100*18));if(k==='gain')fs.forEach(f=>setP(f.gain,v));}};
  },
  eq(c,n){const inp=gainN(c),l=biq(c,'lowshelf',250),m=biq(c,'peaking',1000,.8),h=biq(c,'highshelf',4000);chain(inp,l,m,h);
    return{in:{in:inp},wet:h,set(k,v){if(k==='low')setP(l.gain,v);if(k==='mid')setP(m.gain,v);if(k==='high')setP(h.gain,v);}};},
  peq(c,n){const inp=gainN(c),l=biq(c,'lowshelf',100),a=biq(c,'peaking',500,1),b=biq(c,'peaking',2500,1),h=biq(c,'highshelf',8000);chain(inp,l,a,b,h);
    const M={lf:l.frequency,lg:l.gain,m1f:a.frequency,m1g:a.gain,m1q:a.Q,m2f:b.frequency,m2g:b.gain,m2q:b.Q,hf:h.frequency,hg:h.gain};
    return{in:{in:inp},wet:h,set(k,v){if(M[k])setP(M[k],v);}};},
  dist(c,n){return shaperNode(c,n,Math.round(n.p.type),'drive');},
  pod(c,n){const s=shaperNode(c,n,0,'drive'),hump=biq(c,'peaking',720,1.2,7);s.pre(hump);return s;},
  pfuzz(c,n){return shaperNode(c,n,4,'fuzz');},
  crush(c,n){
    const inp=gainN(c),w=crushNode(c);if(!w){return{in:{in:inp},wet:inp,set(){}};}
    inp.connect(w);const P=w.parameters;
    return{in:{in:inp},wet:w,set(k,v){if(k==='bits')setP(P.get('bits'),v,.005);if(k==='rate')setP(P.get('rate'),v,.005);if(k==='comp')P.get('comp').value=v;}};
  },
  vintage(c,n){
    const inp=gainN(c),pre=c.createWaveShaper(),w=crushNode(c),lp=biq(c,'lowpass',12000,.6),hiss=gainN(c,0);
    pre.curve=shaperCurve(1,.1);inp.connect(pre);if(w){pre.connect(w);w.connect(lp);}else pre.connect(lp);
    const ns=loopSrc(c,noiseBuf(c));chain(ns,biq(c,'highpass',3000),hiss,lp);
    const MODELS=[[8,27778,1,7000],[12,26040,0,11000],[12,39062,0,15000]];
    const apply=()=>{const m=Math.round(n.p.model),M=MODELS[m]||[n.p.bits,n.p.rate,0,Math.min(18000,n.p.rate*.45)];
      if(w){setP(w.parameters.get('bits'),M[0],.005);setP(w.parameters.get('rate'),M[1],.005);w.parameters.get('comp').value=M[2];}
      setP(lp.frequency,M[3]*(1-n.p.age/250));setP(hiss.gain,(m===0?.004:.0015)*(.3+n.p.age/100));};
    return{in:{in:inp},wet:lp,set(k,v){if(k==='drive'&&Math.abs((pre._d||0)-v)>2){pre._d=v;pre.curve=shaperCurve(1,.05+v/100*.6);}apply();},stop(){ns.stop();}};
  },
  comp(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),mk=gainN(c);chain(inp,cp,mk);
    return{in:{in:inp},wet:mk,set(k,v){if(k==='thresh')setP(cp.threshold,v);if(k==='ratio')setP(cp.ratio,v);if(k==='attack')setP(cp.attack,v/1000);if(k==='release')setP(cp.release,v/1000);if(k==='makeup')setP(mk.gain,dbg(v));}};},
  pcomp(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),mk=gainN(c);cp.attack.value=.003;cp.release.value=.25;cp.knee.value=6;chain(inp,cp,mk);
    return{in:{in:inp},wet:mk,set(k,v){if(k==='sustain'){setP(cp.threshold,-10-v*.4);setP(cp.ratio,2+v/10);}if(k==='level')setP(mk.gain,dbg(v)*(1+n.p.sustain/60));}};},
  limiter(c,n){const inp=gainN(c),cp=c.createDynamicsCompressor(),out=gainN(c);cp.ratio.value=20;cp.knee.value=0;cp.attack.value=.001;chain(inp,cp,out);
    return{in:{in:inp},wet:out,set(k,v){if(k==='ceiling'){setP(cp.threshold,v-1);setP(out.gain,1);}if(k==='release')setP(cp.release,v/1000);}};},
  transient(c,n){
    /* fast and slow followers: (fast - slow) boosts attacks, slow alone shapes sustain */
    const inp=gainN(c),vca=gainN(c,1),abs=c.createWaveShaper();const cu=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/1023*2-1;cu[i]=Math.abs(x);}abs.curve=cu;
    const fast=biq(c,'lowpass',60,.5),slow=biq(c,'lowpass',6,.5),inv=gainN(c,-1),ga=gainN(c,0),gs=gainN(c,0);
    inp.connect(vca);inp.connect(abs);abs.connect(fast);abs.connect(slow);fast.connect(ga);slow.connect(inv);inv.connect(ga);slow.connect(gs);ga.connect(vca.gain);gs.connect(vca.gain);
    return{in:{in:inp},wet:vca,set(k,v){if(k==='attack')setP(ga.gain,v/100*6);if(k==='sustain')setP(gs.gain,v/100*2);}};
  },
  morph(c,n){
    const inp=gainN(c),out=gainN(c,1.4),VW=[[730,1090,2440],[530,1840,2480],[270,2290,3010],[570,840,2410],[300,870,2240]],bs=[0,1,2].map(i=>{const b=biq(c,'bandpass',VW[0][i],8);inp.connect(b);const g=gainN(c,[1,.7,.4][i]);b.connect(g);g.connect(out);return b;});
    const apply=()=>{const m=clamp(n.p.morph/100,0,1)*4,i=Math.min(3,Math.floor(m)),f=m-i,sh=Math.pow(2,n.p.shift/12);
      bs.forEach((b,j)=>{setP(b.frequency,(VW[i][j]*(1-f)+VW[i+1][j]*f)*sh,.01);setP(b.Q,2+n.p.res/100*16,.03);});};
    return{in:{in:inp},wet:out,set(){apply();}};
  },
  tapeecho(c,n){
    const inp=gainN(c),dl=c.createDelay(5),sat=c.createWaveShaper(),lp=biq(c,'lowpass',4000,.6),hp=biq(c,'highpass',120,.6),fbG=gainN(c,.45),o=osc(c,'sine',.55),o2=osc(c,'sine',6.3),og=gainN(c,0),og2=gainN(c,0);
    sat.curve=shaperCurve(1,.3);chain(inp,dl,sat,lp,hp,fbG,dl);o.connect(og);og.connect(dl.delayTime);o2.connect(og2);og2.connect(dl.delayTime);
    return{in:{in:inp},wet:hp,set(k,v){if(k==='time')setP(dl.delayTime,v/1000,.12);if(k==='fb')setP(fbG.gain,Math.min(1.08,v/100));if(k==='tone')setP(lp.frequency,logF(v,900,9000));
      if(k==='wobble'){setP(og.gain,v/100*.0035);setP(og2.gain,v/100*.0004);}if(k==='sat'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(1,.05+v/100*.7);}},stop(){o.stop();o2.stop();}};
  },
  bbd(c,n){
    const m=modDelay(c,{base:.009,range:.004,fb:0,stereo:true,shape:'triangle'}),lp=biq(c,'lowpass',7000,.5),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    m.wet.connect(lp);chain(ns,biq(c,'highpass',4000),hiss,lp);
    return{in:m.in,wet:lp,set(k,v){if(k==='mode'){const md=Math.round(v);m.set('rate',md===0?.5:md===1?.83:8);m.set('depth',md===2?10:md===1?70:50);}if(k==='noise')setP(hiss.gain,v/100*.006);},stop(){m.stop();ns.stop();}};
  },
  ensemble(c,n){
    const inp=gainN(c),out=c.createChannelMerger(2),os=[],gs=[];
    for(let i=0;i<3;i++){const d=c.createDelay(.05);d.delayTime.value=.01;const o=osc(c,'sine',.6+i*.07),g=gainN(c,.003),v=osc(c,'sine',6+i*.4),vg=gainN(c,.0004);
      o.connect(g);g.connect(d.delayTime);v.connect(vg);vg.connect(d.delayTime);inp.connect(d);d.connect(out,0,i%2);if(i===2)d.connect(out,0,1);os.push(o,v);gs.push(g);}
    return{in:{in:inp},wet:out,set(k,v){if(k==='depth')gs.forEach(g=>setP(g.gain,.0005+v/100*.005));},stop(){os.forEach(o=>o.stop());}};
  },
  tapemach(c,n){
    const inp=gainN(c),sat=c.createWaveShaper(),bump=biq(c,'lowshelf',90,null,3),lp=biq(c,'lowpass',16000,.6),d=c.createDelay(.05),o=osc(c,'sine',.5),og=gainN(c,0),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;sat.curve=shaperCurve(1,.2);chain(inp,sat,bump,d,lp);o.connect(og);og.connect(d.delayTime);chain(ns,biq(c,'highpass',2500),hiss,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='sat'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(1,.02+v/100*.6);}if(k==='bump')setP(bump.gain,v);if(k==='hiss')setP(hiss.gain,v/100*.008);
      if(k==='wow')setP(og.gain,v/100*.0025);if(k==='age')setP(lp.frequency,logF(100-v,3500,18000));},stop(){o.stop();ns.stop();}};
  },
  lofi(c,n){
    const inp=gainN(c),lp=biq(c,'lowpass',8000,.6),d=c.createDelay(.05),o=osc(c,'sine',.7),o2=osc(c,'sine',7),og=gainN(c,0),og2=gainN(c,0),cr=gainN(c,0),hiss=gainN(c,0),cs=loopSrc(c,crackleBuf(c)),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;chain(inp,d,lp);o.connect(og);og.connect(d.delayTime);o2.connect(og2);og2.connect(d.delayTime);chain(cs,cr,lp);chain(ns,biq(c,'bandpass',3000,.5),hiss,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='crackle')setP(cr.gain,v/100*.6);if(k==='wow'){setP(og.gain,v/100*.003);setP(og2.gain,v/100*.0003);}if(k==='noise')setP(hiss.gain,v/100*.02);if(k==='tone')setP(lp.frequency,logF(v,1200,16000));},stop(){o.stop();o2.stop();cs.stop();ns.stop();}};
  },
  vinyl(c,n){
    const inp=gainN(c),lp=biq(c,'lowpass',14000,.6),d=c.createDelay(.05),o=osc(c,'sine',.55),og=gainN(c,0),cr=gainN(c,0),rum=gainN(c,0),cs=loopSrc(c,crackleBuf(c)),ns=loopSrc(c,noiseBuf(c));
    d.delayTime.value=.01;chain(inp,d,lp);o.connect(og);og.connect(d.delayTime);chain(cs,cr,lp);chain(ns,biq(c,'lowpass',60,.7),rum,lp);
    return{in:{in:inp},wet:lp,set(k,v){if(k==='crackle')setP(cr.gain,v/100*.7);if(k==='rumble')setP(rum.gain,v/100*.3);if(k==='wear')setP(lp.frequency,logF(100-v,2500,18000));if(k==='wow')setP(og.gain,v/100*.002);},stop(){o.stop();cs.stop();ns.stop();}};
  },
  radio(c,n){
    const inp=gainN(c),hp=biq(c,'highpass',300,.7),lp=biq(c,'lowpass',3400,.7),sat=c.createWaveShaper(),hiss=gainN(c,0),ns=loopSrc(c,noiseBuf(c));
    sat.curve=shaperCurve(2,.2);chain(inp,hp,sat,lp);chain(ns,hiss,lp);
    const B=[[200,4500],[300,3400],[500,2600]];
    return{in:{in:inp},wet:lp,set(k,v){if(k==='band'){const b=B[Math.round(v)]||B[0];setP(hp.frequency,b[0]);setP(lp.frequency,b[1]);}if(k==='crunch'&&Math.abs((sat._d||0)-v)>2){sat._d=v;sat.curve=shaperCurve(2,.02+v/100*.5);}if(k==='noise')setP(hiss.gain,v/100*.03);},stop(){ns.stop();}};
  },
  pwah(c,n){
    const inp=gainN(c),bp=biq(c,'bandpass',800,7),out=gainN(c,2);chain(inp,bp,out);const an=c.createAnalyser();an.fftSize=512;inp.connect(an);const buf=new Float32Array(512);let env=0;
    return{in:{in:inp},wet:out,set(k,v){
      if(k==='q')setP(bp.Q,v);
      if(k==='pos'||k==='mode'){let p=n.p.pos/100;if(n.p.mode>.5){an.getFloatTimeDomainData(buf);let s=0;for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i];env=env*.7+Math.min(1,Math.sqrt(s/buf.length)*6)*.3;p=env;}
        setP(bp.frequency,logF(p*100,350,2400),.015);}}};
  },
  pvibe(c,n){
    const inp=gainN(c),o=osc(c,'sine',2),aps=[],gs=[];let last=inp;
    [180,520,1100,2600].forEach((f,i)=>{const a=biq(c,'allpass',f,.5),g=gainN(c,f*.6);o.connect(g);g.connect(a.frequency);last.connect(a);last=a;aps.push(a);gs.push(g);});
    const amp=gainN(c,1),ag=gainN(c,.15);o.connect(ag);ag.connect(amp.gain);last.connect(amp);
    return{in:{in:inp},wet:amp,set(k,v){if(k==='speed')setP(o.frequency,v);if(k==='intensity')gs.forEach((g,i)=>setP(g.gain,[180,520,1100,2600][i]*.8*v/100));},stop(){o.stop();}};
  },
  /* ---- routing (raw: they expose their own outputs) ---- */
  mixer(c,n){const out=gainN(c),g=[1,2,3,4].map(()=>{const x=gainN(c);x.connect(out);return x;});
    return{in:{in1:g[0],in2:g[1],in3:g[2],in4:g[3]},out:{out},set(k,v){const i=['l1','l2','l3','l4'].indexOf(k);if(i>=0)setP(g[i].gain,v<=-59?0:dbg(v));}};},
  util(c,n){
    const inp=gainN(c),sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),mid=gainN(c,.5),side=gainN(c,.5),sideW=gainN(c,1),inv=gainN(c,-1),l=gainN(c),r=gainN(c),pan=c.createStereoPanner(),out=gainN(c);
    inp.connect(sp);sp.connect(mid,0);sp.connect(mid,1);sp.connect(side,0);sp.connect(inv,1);inv.connect(side);side.connect(sideW);
    mid.connect(l);mid.connect(r);sideW.connect(l);const ni=gainN(c,-1);sideW.connect(ni);ni.connect(r);l.connect(mg,0,0);r.connect(mg,0,1);chain(mg,pan,out);
    return{in:{in:inp},out:{out},set(k,v){if(k==='gain')setP(out.gain,v<=-59?0:dbg(v));if(k==='pan')setP(pan.pan,v/100);if(k==='width')setP(sideW.gain,v/100);}};
  },
  xover(c,n){
    const inp=gainN(c),l1=biq(c,'lowpass',250,.707),l2=biq(c,'lowpass',250,.707),h1=biq(c,'highpass',250,.707),h2=biq(c,'highpass',250,.707),m1=biq(c,'lowpass',3000,.707),m2=biq(c,'lowpass',3000,.707),hh1=biq(c,'highpass',3000,.707),hh2=biq(c,'highpass',3000,.707);
    chain(inp,l1,l2);chain(inp,h1,h2);chain(h2,m1,m2);chain(h2,hh1,hh2);
    return{in:{in:inp},out:{low:l2,mid:m2,high:hh2},set(k,v){if(k==='f1')[l1,l2,h1,h2].forEach(f=>setP(f.frequency,v));if(k==='f2')[m1,m2,hh1,hh2].forEach(f=>setP(f.frequency,v));}};
  },
  mssplit(c,n){const inp=gainN(c),sp=c.createChannelSplitter(2),mid=gainN(c,.5),side=gainN(c,.5),inv=gainN(c,-1);inp.connect(sp);sp.connect(mid,0);sp.connect(mid,1);sp.connect(side,0);sp.connect(inv,1);inv.connect(side);
    return{in:{in:inp},out:{mid,side},set(){}};},
  msjoin(c,n){const m=gainN(c),s=gainN(c),mg=c.createChannelMerger(2),l=gainN(c),r=gainN(c),ni=gainN(c,-1);m.connect(l);m.connect(r);s.connect(l);s.connect(ni);ni.connect(r);l.connect(mg,0,0);r.connect(mg,0,1);
    return{in:{mid:m,side:s},out:{out:mg},set(){}};},
  send(c,n){const inp=gainN(c),lv=gainN(c,.5),bus=fxBus(c,Math.round(n.p.bus));inp.connect(lv);lv.connect(bus);return{in:{in:inp},out:{out:inp},set(k,v){if(k==='level')setP(lv.gain,v<=-59?0:dbg(v));},stop(){try{lv.disconnect();}catch(e){}}};},
  ret(c,n){const out=gainN(c),bus=fxBus(c,Math.round(n.p.bus));bus.connect(out);return{in:{},out:{out},set(k,v){if(k==='level')setP(out.gain,v<=-59?0:dbg(v));},stop(){try{bus.disconnect(out);}catch(e){}}};},
  pvol(c,n){const inp=gainN(c);return{in:{in:inp},out:{out:inp},set(k,v){if(k==='pos')setP(inp.gain,Math.pow(v/100,2),.01);}};},
  /* ---- the follower listens to audio ---- */
  env(c,n){const an=c.createAnalyser();an.fftSize=1024;return{in:{in:an},analyser:an,set(){}};}
};
function shaperNode(c,n,type,driveKey){
  const inp=gainN(c),pre=gainN(c),sh=c.createWaveShaper(),tone=biq(c,'lowpass',6000,.6),lvl=gainN(c);let head=null;
  sh.oversample='4x';sh.curve=shaperCurve(type,.3);chain(inp,pre,sh,tone,lvl);
  return{in:{in:inp},wet:lvl,pre(node){inp.disconnect();chain(inp,node,pre);head=node;},set(k,v){
    if(k===driveKey&&Math.abs((sh._d==null?-9:sh._d)-v)>1.5){sh._d=v;sh.curve=shaperCurve(type,v/100);}
    if(k==='tone')setP(tone.frequency,logF(v,800,16000));if(k==='level')setP(lvl.gain,dbg(v));}};
}
function modDelay(c,o){
  const inp=gainN(c),dl=c.createDelay(.1),dr=c.createDelay(.1),mg=c.createChannelMerger(2),ob=osc(c,o.shape||'sine',.8),gL=gainN(c,o.range*.5),gR=gainN(c,-o.range*.5),fL=gainN(c,o.fb),fR=gainN(c,o.fb);
  dl.delayTime.value=o.base;dr.delayTime.value=o.base;ob.connect(gL);gL.connect(dl.delayTime);
  inp.connect(dl);dl.connect(mg,0,0);dl.connect(fL);fL.connect(dl);
  if(o.stereo){ob.connect(gR);gR.connect(dr.delayTime);inp.connect(dr);dr.connect(mg,0,1);dr.connect(fR);fR.connect(dr);}else dl.connect(mg,0,1);
  return{in:{in:inp},wet:mg,set(k,v){if(k==='rate')setP(ob.frequency,v);if(k==='depth'){setP(gL.gain,o.range*v/100);setP(gR.gain,-o.range*v/100);}if(k==='fb'){setP(fL.gain,clamp(v/100,-.95,.95));setP(fR.gain,clamp(v/100,-.95,.95));}},stop(){ob.stop();}};
}
function verbNode(c,n,flav){
  const inp=gainN(c),pre=c.createDelay(1),cv=c.createConvolver(),out=gainN(c,1);chain(inp,pre,cv,out);let key='';
  const regen=()=>{const p=n.p,k=[flav,p.type,p.size,p.decay,p.damp,p.grit,p.gate,p.drip].map(x=>x==null?'':Math.round(x*10)).join('|');if(k===key)return;key=k;
    cv.buffer=makeIR(c,{flav,size:p.size,decay:p.decay,damp:p.damp,grit:p.grit,gate:p.gate,drip:p.drip});};
  regen();
  return{in:{in:inp},wet:out,set(k,v){if(k==='pre')setP(pre.delayTime,v/1000);if(FXT[n.type].params.some(q=>q.k===k&&q.ir)){clearTimeout(out._t);out._t=setTimeout(regen,180);}}};
}
function fxBus(c,i){
  if(FXA.buses.length&&FXA.buses[0].context!==c) FXA.buses=[];
  while(FXA.buses.length<=i) FXA.buses.push(gainN(c));
  return FXA.buses[i];
}
/* ---- building ---- */
function fxSig(){
  return JSON.stringify(Object.keys(S.fx.graphs).map(k=>{const g=S.fx.graphs[k];
    return[k,g.nodes.map(n=>[n.id,n.type,n.bypass,(n.s&&n.s.ir)||'',FXT[n.type].params.filter(q=>q.stat).map(q=>Math.round(n.p[q.k]))]),g.cables.filter(c=>cableKind(g,c)==='audio').map(c=>[c.from.n,c.from.p,c.to.n,c.to.p])];}))+'|'+FXA.wlReady;
}
function fxGroupIn(g){
  const c=AU.ctx;
  if(FXA.ctx!==c){FXA.ctx=c;FXA.gin={};FXA.gout={};FXA.min=null;FXA.sig='';FXA.scopes={};loadWorklet(c);}
  if(!FXA.min){FXA.min=gainN(c);}
  if(!FXA.gin[g]){FXA.gin[g]=gainN(c);FXA.sig='';}
  fxSync();
  return FXA.gin[g];
}
function teardownScope(sc){
  if(!sc) return;
  sc.nodes.forEach(x=>{try{x.impl&&x.impl.stop&&x.impl.stop();}catch(e){}x.all.forEach(a=>{try{a.disconnect();}catch(e){}});});
  try{sc.input.disconnect();}catch(e){}
}
function buildScope(c,key,inNode,outNode){
  const g=S.fx.graphs[key],sc={nodes:[],input:inNode,byId:{}};
  try{inNode.disconnect();}catch(e){}
  if(!g){inNode.connect(outNode);return sc;}
  g.nodes.forEach(n=>{
    const d=FXT[n.type];if(!d)return;
    if(n.type==='input'){sc.byId[n.id]={outs:{out:inNode},all:[]};return;}
    if(n.type==='output'){sc.byId[n.id]={ins:{in:outNode},all:[]};return;}
    if(d.kind==='mod'&&n.type!=='env') return;
    const make=FXI[n.type];if(!make) return;
    let impl;try{impl=make(c,n);}catch(e){console.warn('fx',n.type,e);return;}
    const ent={n,impl,ins:impl.in||{},outs:{},all:[],mixG:null,wetG:null,dryG:null};
    if(n.type==='env'){FXA.follow[n.id]=0;ent.analyser=impl.analyser;}
    else if(d.raw||impl.out){
      ent.outs=impl.out||{};
      if(n.bypass){const thru=gainN(c);Object.keys(ent.ins).forEach(p=>{ent.ins[p]=thru;});Object.keys(ent.outs).forEach(p=>{ent.outs[p]=thru;});ent.all.push(thru);}
    }else{
      const inp=impl.in.in,dry=gainN(c,1),wetG=gainN(c,.3),dryMix=gainN(c,.7),mix=gainN(c),wetOut=gainN(c,1);
      const head=gainN(c);head.connect(inp);head.connect(dry);
      impl.wet.connect(wetOut);dry.connect(dryMix);wetOut.connect(wetG);dryMix.connect(mix);wetG.connect(mix);
      if(n.bypass){wetG.gain.value=0;dryMix.gain.value=1;wetOut.gain.value=0;}
      ent.ins={in:head};ent.outs={dry,wet:wetOut,mix};ent.mixG={wet:wetG,dry:dryMix};ent.all.push(head,dry,wetG,dryMix,mix,wetOut);
    }
    sc.byId[n.id]=ent;sc.nodes.push(ent);
  });
  g.cables.forEach(cb=>{
    if(cableKind(g,cb)!=='audio') return;
    const a=sc.byId[cb.from.n],b=sc.byId[cb.to.n];if(!a||!b)return;
    const src=a.outs&&a.outs[cb.from.p],dst=b.ins&&b.ins[cb.to.p];
    if(src&&dst){try{src.connect(dst);}catch(e){}}
  });
  return sc;
}
function fxSync(){
  const c=AU.ctx;if(!c||!FXA.min) return;
  const sig=fxSig()+'|'+Object.keys(FXA.gin).join(',');
  if(sig===FXA.sig) return;
  FXA.sig=sig;
  Object.keys(FXA.scopes).forEach(k=>teardownScope(FXA.scopes[k]));FXA.scopes={};
  FXA.scopes.master=buildScope(c,'master',FXA.min,sampBus());
  Object.keys(FXA.gin).forEach(g=>{FXA.scopes['g:'+g]=buildScope(c,g,FXA.gin[g],FXA.min);});
  fxApplyParams(true);
  if(!FXA.timer) FXA.timer=setInterval(fxTick,16);
}
function fxApplyParams(all){
  const t=fxClock();
  Object.keys(FXA.scopes).forEach(sk=>{
    const key=sk==='master'?'master':sk.slice(2),g=S.fx.graphs[key];if(!g)return;
    FXA.scopes[sk].nodes.forEach(ent=>{
      const n=ent.n,d=FXT[n.type];if(!d)return;
      d.params.forEach(q=>{
        const r=paramReal(g,n,q,t);const v=typeof r==='number'?r:r.v;
        if(!all&&!r.mod&&ent['_'+q.k]===v)return;ent['_'+q.k]=v;
        if(q.k==='mix'&&ent.mixG&&!n.bypass){const m=clamp(v/100,0,1);setP(ent.mixG.wet.gain,m);setP(ent.mixG.dry.gain,1-m);return;}
        if(q.sync&&r.sync){ent.impl.set(q.k,v);return;}
        ent.impl.set&&ent.impl.set(q.k,v);
      });
      if(ent.analyser){const a=ent.analyser,b=ent._b||(ent._b=new Float32Array(a.fftSize));a.getFloatTimeDomainData(b);let s=0;for(let i=0;i<b.length;i++)s+=b[i]*b[i];
        const lv=Math.sqrt(s/b.length),p=n.p,cur=FXA.follow[n.id]||0,k=lv>cur?Math.min(1,16/Math.max(1,p.attack)):Math.min(1,16/Math.max(1,p.release));FXA.follow[n.id]=cur+(lv-cur)*k;}
      if(n.type==='pwah'&&n.p.mode>.5) ent.impl.set('pos',n.p.pos);
    });
  });
}
function fxTick(){
  if(!AU.ctx||AU.ctx.state!=='running') return;
  fxSync();fxApplyParams(false);
}
/* web MIDI for the maker: notes, mod wheel, expression, aftertouch, pitch bend */
if(navigator.requestMIDIAccess){
  navigator.requestMIDIAccess().then(a=>{
    const hook=()=>a.inputs.forEach(i=>{i.onmidimessage=m=>{
      const [s,d1,d2]=m.data,c=s&240;ensureAudio();
      if(c===144&&d2>0)noteOn(d1,d2);else if(c===128||(c===144&&d2===0))noteOff(d1);
      else if(c===176){if(d1===1)FXM.mod=d2/127;else if(d1===11)FXM.expr=d2/127;if(engineOn())ENG.node.port.postMessage({t:'cc',cc:d1,v:d2});}
      else if(c===208)FXM.at=d1/127;else if(c===224){FXM.bend=((d2<<7)|d1)/16383;if(engineOn())ENG.node.port.postMessage({t:'bend',v:FXM.bend});}
    };});
    hook();a.onstatechange=hook;
  }).catch(()=>{});
}

/* ---------- the shared engine: the Maker plays through the same C++ engine as the VST (compiled to WebAssembly) ----------
   apps/plugin/engine is the only engine source. GitHub builds it natively for the VST and as engine.wasm for this app.
   The project is handed to the engine as an in-memory .vsamp whenever it changes; notes, knobs and lists go over the worklet port.
   Only the sample editor's previews (and a fallback if engine.wasm cannot load) still use the old JS path. */
const ENG={node:null,out:null,starting:false,failed:'',loaded:false,sig:'',pendingSig:'',timer:0,voices:0,zones:0,lastList:-2};
const ENGINE_MODES=['sampler','slicer','speedkeep','granular','wavetable'];
const engineZone=z=>{const s=sampleById(z.sample);return !!s&&ENGINE_MODES.indexOf(smOf(s).mode)>=0;};
const engineOn=()=>!!(ENG.node&&ENG.loaded);
async function engineStart(){
  if(ENG.node||ENG.starting||ENG.failed||!AU.ctx||!AU.ctx.audioWorklet) return;
  ENG.starting=true;
  try{
    const base=new URL('../../packages/engine-wasm/',location.href);
    const bytes=await (await fetch(new URL('engine.wasm',base))).arrayBuffer(),module=await WebAssembly.compile(bytes);
    await AU.ctx.audioWorklet.addModule(new URL('src/worklet.js',base).href);
    const node=new AudioWorkletNode(AU.ctx,'visu-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module}});
    const out=AU.ctx.createGain();out.gain.value=2.4;node.connect(out);out.connect(AU.master);
    node.port.onmessage=({data:m})=>{
      if(m.t==='loaded'){ENG.loaded=!m.error;ENG.zones=m.zones;if(m.error)flash('Engine could not load the project: '+m.error);ENG.lastList=-2;engineSendState();}
      else if(m.t==='voices'){ENG.voices=m.n;updVoices();}
    };
    ENG.node=node;ENG.out=out;ENG.sig='';engineSync(true);
  }catch(err){ENG.failed=String(err&&err.message||err);console.warn('engine',err);}
  ENG.starting=false;
}
/* what decides that the engine needs the project again */
function engineSig(){
  return S.map.ver+'|'+S.samples.length+'|'+JSON.stringify([S.gset,S.fx.graphs,S.lists.map(l=>[l.bank,l.groups]),S.tags.map(t=>[t.id,t.name,t.kind,t.basis,t.steps]),S.map.interp,S.bpm,S.sig]);
}
/* a light .vsamp of the current project: float audio, no compression, no banner or images */
async function engineBytes(){
  const pack=new Pack(),keep=new Set(S.zones.map(z=>z.sample).concat(fxKeep())),smeta=[];
  for(const s of S.samples){
    if(!keep.has(s.id))continue;const b=BUF.get(s.id);if(!b)continue;
    smeta.push({id:s.id,name:s.name,sr:b.sr,chn:b.ch.length,frames:b.ch[0].length,root:s.root,fine:s.fine||0,loop:s.loop||null,sm:s.sm,bits:32,data:await pack.add(encodePCM(b.ch,32),{})});
  }
  const sn=snapshot();delete sn.samples;delete sn.zones;delete sn.lib;
  sn.interp=S.map.interp;{const cl=curList();sn.currentList=cl?S.lists.indexOf(cl):-1;}
  const fxRanges={};Object.keys(FXT).forEach(k=>{fxRanges[k]={};FXT[k].params.forEach(q=>{fxRanges[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0];});});
  const zones=JSON.parse(JSON.stringify(S.zones));
  const manifest={format:'vsamp',formatVersion:1,lib:{id:'maker-live',name:S.lib.name},banner:{images:{}},project:sn,fxRanges,features:[],samples:smeta,zones};
  return writeVsamp(manifest,pack);
}
let engBusy=false;
async function engineSync(force){
  if(!ENG.node) return;
  const sig=engineSig();
  if(!force&&(sig===ENG.sig||engBusy)) return;
  engBusy=true;ENG.sig=sig;
  try{const bytes=await engineBytes();ENG.node.port.postMessage({t:'load',bytes:bytes.buffer},[bytes.buffer]);}
  catch(err){console.warn('engine sync',err);}
  engBusy=false;
}
/* knob values and the chosen list follow what the Designer shows */
const engineListIndex=()=>{if(!S.map.follow&&S.view==='sound')return -1;const cl=curList();return cl?S.lists.indexOf(cl):-1;};
function engineSendState(){
  if(!engineOn()) return;
  S.tags.forEach(t=>{if(!t.sys)ENG.node.port.postMessage({t:'tag',name:t.name,v:t.value});});
  const i=engineListIndex();
  if(i!==ENG.lastList){ENG.lastList=i;ENG.node.port.postMessage({t:'list',i});}
}
setInterval(()=>{if(AU.ctx&&!ENG.node&&!ENG.starting&&!ENG.failed)engineStart();if(ENG.node)engineSync(false);},250);
const setTagE=setTag;
setTag=function(t,v){setTagE(t,v);if(engineOn()){ENG.node.port.postMessage({t:'tag',name:t.name,v:t.value});engineSendState();}};
setInterval(()=>engineSendState(),300);

/* ---------- mapper: model ---------- */
Object.assign(S,{samples:[],zones:[],gset:{},
  map:{zoom:13,sx:0,sel:[],group:null,snap:true,editAll:false,follow:true,vel:0,interp:'cubic',ver:1,hot:{},marq:null}});
const BUF=new Map(); /* sample id -> {ch:[Float32Array...],sr,peaks} */
const NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=n=>NN[((n%12)+12)%12]+(Math.floor(n/12)-2);
const isBlack=n=>[1,3,6,8,10].indexOf(n%12)>=0;
function parseNote(str){
  const m=/(^|[^A-Za-z])([A-Ga-g])([#b]?)(-?\d)(?!\d)/.exec(str); if(!m) return null;
  let n=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[m[2].toUpperCase()]+(m[3]==='#'?1:m[3]==='b'?-1:0);
  const v=(parseInt(m[4],10)+2)*12+n; return v>=0&&v<=127?v:null;
}
const GCOLORS=['#e5707e','#e5a35c','#d8c95a','#87c76a','#4fc3a6','#58a9e0','#8489e8','#b27be0','#e07bb8','#9aa4b0'];
const PREVG={mode:'normal',choke:0,vol:0,pan:0,tune:0,voices:0,interp:'inherit',velcurve:1,mute:false,solo:false,color:'#999'};
function gcfg(name){
  if(name==='__preview') return PREVG;
  if(!S.gset[name]){
    const i=Math.max(0,S.groups.indexOf(name));
    S.gset[name]={mode:'normal',choke:0,vol:0,pan:0,tune:0,voices:0,interp:'inherit',velcurve:1,mute:false,solo:false,color:GCOLORS[i%GCOLORS.length]};
  }
  return S.gset[name];
}
const zoneById=id=>S.zones.find(z=>z.id===id)||null;
const sampleById=id=>S.samples.find(s=>s.id===id)||null;
const selZones=()=>S.map.sel.map(zoneById).filter(Boolean);
function touchMap(){S.map.ver++;RENDER_CACHE.clear();}
const RENDER_CACHE=new Map();
function mkZone(o){
  return Object.assign({id:nid('z'),sample:null,group:S.map.group||S.groups[0]||'Group 1',lo:48,hi:60,vlo:0,vhi:127,root:60,tune:0,vol:0,pan:0,
    start:0,end:0,vstart:0,rev:false,keytrack:true,oneshot:false,attack:2,release:150,
    fadeLo:0,fadeHi:0,vfadeLo:0,vfadeHi:0,curve:'power',interp:'inherit',seq:1,mute:false,solo:false,hum:{tune:0,vol:0,start:0},
    loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},o||{});
}
function addZoneFor(sampleId,lo,hi,o){
  const s=sampleById(sampleId); if(!s) return null;
  const z=mkZone(Object.assign({sample:sampleId,lo,hi,root:s.root!=null?s.root:clamp(Math.round((lo+hi)/2),0,127),tune:s.fine||0,
    loop:{on:!!s.loop,s:s.loop?s.loop.s:0,e:s.loop?s.loop.e:s.frames,xf:s.loop?s.loop.xf:0,xcurve:'power',pp:false}},o||{}));
  if(!z.loop.e) z.loop.e=s.frames;
  S.zones.push(z); touchMap(); return z;
}
function dupZone(z){const c=JSON.parse(JSON.stringify(z));c.id=nid('z');S.zones.push(c);touchMap();return c;}
function delZones(ids){
  S.zones=S.zones.filter(z=>ids.indexOf(z.id)<0); S.map.sel=S.map.sel.filter(i=>ids.indexOf(i)<0); touchMap();
}
function peaksOf(ch,n){
  const out=new Float32Array(n*2),len=ch[0].length,step=len/n;
  for(let i=0;i<n;i++){
    let mn=1,mx=-1; const a=Math.floor(i*step),b=Math.max(a+1,Math.floor((i+1)*step));
    for(let c=0;c<ch.length;c++){const d=ch[c];for(let j=a;j<b&&j<len;j+=Math.max(1,(b-a)>64?Math.floor((b-a)/64):1)){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v;}}
    out[i*2]=mn;out[i*2+1]=mx;
  }
  return out;
}
/* naive autocorrelation pitch finder: returns {midi,cents} or null */
function detectPitch(id){
  const b=BUF.get(id); if(!b) return null;
  const d=b.ch[0],sr=b.sr,start=Math.floor(Math.min(d.length*.05,sr*.1)),N=Math.min(4096*2,d.length-start-1);
  if(N<2048) return null;
  const minLag=Math.floor(sr/2000),maxLag=Math.min(Math.floor(sr/25),N>>1);
  let best=0,bl=0;
  for(let lag=minLag;lag<maxLag;lag++){
    let s=0,e1=0,e2=0;
    for(let i=0;i<N-lag;i+=2){const a=d[start+i],c=d[start+i+lag];s+=a*c;e1+=a*a;e2+=c*c;}
    const r=s/Math.sqrt(e1*e2+1e-9); if(r>best){best=r;bl=lag;}
  }
  if(best<.6||!bl) return null;
  const f=sr/bl,m=69+12*Math.log2(f/440),mi=Math.round(m);
  return{midi:mi,cents:Math.round((m-mi)*100),conf:best};
}
function addBuffer(name,ch,sr){
  const id=nid('s'),frames=ch[0].length;
  BUF.set(id,{ch,sr,peaks:peaksOf(ch,600)});
  const guess=parseNote(name);
  const s={id,name,sr,frames,dur:frames/sr,chn:ch.length,root:guess,fine:0,loop:null};
  if(guess==null){const p=detectPitch(id);if(p){s.root=p.midi;s.fine=-p.cents;s.detected=true;}}
  if(s.root==null) s.root=60;
  S.samples.push(s); return s;
}
function importFiles(files,drop){
  ensureAudio(); if(!AU.ctx){flash('Audio is not available in this browser');return Promise.resolve([]);}
  const jobs=Array.from(files).filter(f=>/^audio\//.test(f.type)||/\.(wav|flac|ogg|mp3|aif|aiff|m4a)$/i.test(f.name)).map(f=>
    f.arrayBuffer().then(ab=>AU.ctx.decodeAudioData(ab)).then(buf=>{
      const ch=[];for(let c=0;c<Math.min(2,buf.numberOfChannels);c++)ch.push(new Float32Array(buf.getChannelData(c)));
      return addBuffer(f.name.replace(/\.[^.]+$/,''),ch,buf.sampleRate);
    }).catch(()=>{flash('Could not decode '+f.name);return null;}));
  return Promise.all(jobs).then(r=>r.filter(Boolean));
}
function resetMapper(){
  S.samples=[];S.zones=[];S.gset={};RENDER_CACHE.clear();
  Object.assign(S.map,{sel:[],group:null,sx:0,hot:{},marq:null});
}
/* zone gain from key/velocity fades */
const fadeCurve=(t,c)=>{t=clamp(t,0,1);return c==='linear'?t:c==='s'?t*t*(3-2*t):Math.sin(t*Math.PI/2);};
function zoneFade(z,note,vel){
  let g=1;
  if(z.fadeLo>0&&note<z.lo+z.fadeLo) g*=fadeCurve((note-z.lo+.5)/z.fadeLo,z.curve);
  if(z.fadeHi>0&&note>z.hi-z.fadeHi) g*=fadeCurve((z.hi-note+.5)/z.fadeHi,z.curve);
  if(z.vfadeLo>0&&vel<z.vlo+z.vfadeLo) g*=fadeCurve((vel-z.vlo+.5)/z.vfadeLo,z.curve);
  if(z.vfadeHi>0&&vel>z.vhi-z.vfadeHi) g*=fadeCurve((z.vhi-vel+.5)/z.vfadeHi,z.curve);
  return g;
}
/* overlap check: same group, same sequence, ranges overlap, and not a crossfade */
function zoneConflicts(){
  const bad=new Set();
  for(let i=0;i<S.zones.length;i++)for(let j=i+1;j<S.zones.length;j++){
    const a=S.zones[i],b=S.zones[j];
    if(a.group!==b.group||a.seq!==b.seq) continue;
    const ko=Math.min(a.hi,b.hi)-Math.max(a.lo,b.lo)+1,vo=Math.min(a.vhi,b.vhi)-Math.max(a.vlo,b.vlo)+1;
    if(ko<=0||vo<=0) continue;
    const fadeA=a.fadeLo+a.fadeHi+a.vfadeLo+a.vfadeHi,fadeB=b.fadeLo+b.fadeHi+b.vfadeLo+b.vfadeHi;
    if(fadeA>0||fadeB>0) continue;
    if(gcfg(a.group).mode!=='normal'&&gcfg(a.group).mode!=='release') continue;
    bad.add(a.id);bad.add(b.id);
  }
  return bad;
}

/* ---------- demo samples (synthesised, so the mapper is testable with no files) ---------- */
function synthPluck(midi,bright,dur,sr){
  const f=440*Math.pow(2,(midi-69)/12),n=Math.floor(dur*sr),d=new Float32Array(n);
  const H=Math.max(3,Math.min(14,Math.floor(5+bright*10)));
  for(let h=1;h<=H&&f*h<sr/2.2;h++){
    const amp=Math.pow(1/h,1.1+(1-bright)*1.4)*(h%2?1:.8),dec=1.2+2.6/(h*.7),ph=Math.random()*.2;
    for(let i=0;i<n;i++){const t=i/sr;d[i]+=amp*Math.sin(2*Math.PI*f*h*t+ph)*Math.exp(-t*dec);}
  }
  for(let i=0;i<220;i++) d[i]+=(Math.random()*2-1)*.4*(1-i/220)*bright;
  let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(d[i]));
  const g=.85/pk,a=Math.floor(sr*.002);for(let i=0;i<n;i++)d[i]*=g*(i<a?i/a:1);
  return d;
}
function synthPad(midi,dur,sr){
  const f=440*Math.pow(2,(midi-69)/12),n=Math.floor(dur*sr),d=new Float32Array(n);
  [-7,0,6].forEach(c=>{const ff=f*Math.pow(2,c/1200);for(let h=1;h<=6;h++){const amp=1/(h*h);for(let i=0;i<n;i++){const t=i/sr;d[i]+=amp*Math.sin(2*Math.PI*ff*h*t)*(.8+.2*Math.sin(2*Math.PI*.5*t+h));}}});
  const a=Math.floor(sr*.4);let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(d[i]));
  for(let i=0;i<n;i++)d[i]*=(.6/pk)*(i<a?i/a:1)*(i>n-sr*.3?(n-i)/(sr*.3):1);
  return d;
}
function synthThump(midi,sr){
  const n=Math.floor(sr*.35),d=new Float32Array(n),f=440*Math.pow(2,(midi-69)/12);
  for(let i=0;i<n;i++){const t=i/sr;d[i]=(Math.sin(2*Math.PI*f*t)*.7+(Math.random()*2-1)*.3)*Math.exp(-t*18);}
  return d;
}
function synthTick(sr){
  const n=Math.floor(sr*.12),d=new Float32Array(n);let lp=0;
  for(let i=0;i<n;i++){lp+=((Math.random()*2-1)-lp)*.35;d[i]=lp*.5*Math.exp(-i/sr*40);}
  return d;
}
function demoSamples(){
  const sr=44100,DC=n=>[n];
  ['Felt Piano','Felt Hammers','Release Noise','Warm Pad'].forEach(g=>{if(S.groups.indexOf(g)<0)S.groups.push(g);});
  const roots=[36,48,60,72],keyR=[[0,41],[42,53],[54,65],[66,127]];
  roots.forEach((r,i)=>{
    const soft=addBuffer('Felt_'+noteName(r)+'_soft',DC(synthPluck(r,.25,2.6,sr)),sr),hard=addBuffer('Felt_'+noteName(r)+'_hard',DC(synthPluck(r,.9,2.6,sr)),sr);
    addZoneFor(soft.id,keyR[i][0],keyR[i][1],{group:'Felt Piano',root:r,vlo:0,vhi:100,vfadeHi:36,release:420});
    addZoneFor(hard.id,keyR[i][0],keyR[i][1],{group:'Felt Piano',root:r,vlo:64,vhi:127,vfadeLo:36,release:420});
  });
  [0,3,5].forEach((o,i)=>{
    const s=addBuffer('Hammer_'+(i+1),DC(synthThump(48+o,sr)),sr);
    addZoneFor(s.id,0,127,{group:'Felt Hammers',root:48+o,seq:i+1,keytrack:true,release:80,oneshot:true});
  });
  const tick=addBuffer('Release_tick',DC(synthTick(sr)),sr);
  addZoneFor(tick.id,0,127,{group:'Release Noise',root:60,keytrack:false,oneshot:true,vlo:0,vhi:127,vol:-6});
  [[48,0,59],[60,60,71],[72,72,127]].forEach(p=>{
    const s=addBuffer('Pad_'+noteName(p[0]),DC(synthPad(p[0],4,sr)),sr);
    s.loop={s:Math.floor(sr*1.0),e:Math.floor(sr*3.2),xf:Math.floor(sr*.35)};
    addZoneFor(s.id,p[1],p[2],{group:'Warm Pad',root:p[0],fadeLo:p[1]?4:0,fadeHi:p[2]<127?4:0,attack:350,release:900});
  });
  gcfg('Felt Hammers').mode='rrcycle'; gcfg('Release Noise').mode='release'; gcfg('Warm Pad').interp='cubic';
  S.map.group='Felt Piano'; S.map.sel=[]; touchMap();
}

/* sample modes, unison, stretch, granular and wavetable now live in @visusampler/core */
const MODES_S=CORE_MODES;
const detectTransients=(s,sens)=>{const b=BUF.get(s.id);return b?coreDetectTransients(b.ch[0],b.sr,sens):[];};

/* engine context: how @visusampler/core reads this project */
const CTX={
  buffer:id=>BUF.get(id),
  sample:id=>sampleById(id),
  group:n=>gcfg(n),
  get defaultInterp(){return S.map.interp;},
  get bpm(){return S.bpm;},
  get sig(){return S.sig;},
  tagValue:id=>{const t=tagById(id);return t?t.value:null;}
};

/* ---------- sampler engine: own resampler (interpolation modes), loop crossfade, voices ---------- */
const INTERP=[['nearest','Nearest (lo-fi, gritty)'],['linear','Linear'],['cubic','Cubic (Hermite)'],['sinc','Sinc (windowed, cleanest)']];
const zoneData=(z,note,vel,tuneExtra,startExtra,outSr,ker)=>coreZoneData(CTX,z,note,vel,tuneExtra,startExtra,outSr,ker);
const zoneInterp=z=>coreZoneInterp(CTX,z);
const zoneRatio=(z,note,tuneExtra)=>coreZoneRatio(CTX,z,note,tuneExtra);
function renderZone(z,note,vel,tuneExtra,startExtra){
  const ctxSr=AU.ctx.sampleRate,sm=smOf(sampleById(z.sample)||{});
  const key=[z.id,S.map.ver,note,Math.round(tuneExtra||0),Math.round(startExtra||0),z.start+z.vstart*(vel/127)>0?Math.round(vel/8):0,S.bpm,S.sig.n,S.sig.d,sm.mode==='wavetable'&&sm.wt.tag?(tagById(sm.wt.tag)||{value:0}).value.toFixed(3):''].join('|');
  let hit=RENDER_CACHE.get(key); if(hit) return hit;
  const r=zoneData(z,note,vel,tuneExtra,startExtra,ctxSr); if(!r) return null;
  const ab=AU.ctx.createBuffer(r.ch.length,r.ch[0].length,ctxSr);
  r.ch.forEach((d,c)=>ab.copyToChannel(d,c));
  hit={buf:ab,loopS:r.loop?r.loop.s/ctxSr:0,loopE:r.loop?r.loop.e/ctxSr:0,loop:!!r.loop};
  RENDER_CACHE.set(key,hit);
  if(RENDER_CACHE.size>240) RENDER_CACHE.delete(RENDER_CACHE.keys().next().value);
  return hit;
}
/* ---- voices ---- */
const SV={list:[],bus:null,rr:{},last:{},held:new Map()};
function sampBus(){
  if(SV.bus&&SV.bus.context===AU.ctx) return SV.bus;
  SV.bus=AU.ctx.createGain(); SV.bus.gain.value=2.4; SV.bus.connect(AU.master); return SV.bus;
}
const groupActive=g=>{
  const cfg=gcfg(g); if(cfg.mute) return false;
  const anySolo=S.groups.some(n=>gcfg(n).solo); if(anySolo&&!cfg.solo) return false;
  if(!S.map.follow) return true;
  const l=curList(); if(!l||!l.groups||!l.groups.length) return true;
  return l.groups.indexOf(g)>=0;
};
function matching(note,vel,release){
  const anySolo=S.zones.some(z=>z.solo);
  return S.zones.filter(z=>!z.mute&&(!anySolo||z.solo)&&BUF.has(z.sample)&&groupActive(z.group)&&
    note>=z.lo&&note<=z.hi&&vel>=z.vlo&&vel<=z.vhi&&((gcfg(z.group).mode==='release')===!!release)&&(!engineOn()||!engineZone(z)));
}
function pickRR(zs,release){
  const out=[],byG={};
  zs.forEach(z=>{(byG[z.group]=byG[z.group]||[]).push(z);});
  Object.keys(byG).forEach(g=>{
    const cfg=gcfg(g),arr=byG[g],seqs=Array.from(new Set(arr.map(z=>z.seq))).sort((a,b)=>a-b);
    if(cfg.mode==='rrcycle'&&seqs.length>1){
      const c=SV.rr[g]=(SV.rr[g]||0); const pick=seqs[c%seqs.length]; SV.rr[g]=c+1;
      out.push.apply(out,arr.filter(z=>z.seq===pick));
    }else if((cfg.mode==='rrrandom'||cfg.mode==='rrunique')&&seqs.length>1){
      let pool=seqs; if(cfg.mode==='rrunique'&&SV.last[g]!==undefined) pool=seqs.filter(s=>s!==SV.last[g]);
      const pick=pool[Math.floor(Math.random()*pool.length)]; SV.last[g]=pick;
      out.push.apply(out,arr.filter(z=>z.seq===pick));
    }else out.push.apply(out,arr);
  });
  return out;
}
const velGain=(vel,curve)=>Math.pow(vel/127,Math.max(.1,curve)*1.0);
function startVoice(z,note,vel,fromRelease){
  const c=AU.ctx,cfg=gcfg(z.group),sm=smOf(sampleById(z.sample)||{});
  const jt=(Math.random()*2-1)*z.hum.tune,jv=(Math.random()*2-1)*z.hum.vol,js=Math.random()*z.hum.start;
  const vs=uniVoices(sm),made=[];
  vs.forEach(u=>{
    const r=renderZone(z,note,vel,jt+u.tune,js+u.start); if(!r) return;
    const src=c.createBufferSource(); src.buffer=r.buf;
    if(r.loop&&!fromRelease){src.loop=true;src.loopStart=r.loopS;src.loopEnd=r.loopE;}
    const g=c.createGain(),pan=c.createStereoPanner?c.createStereoPanner():null;
    const amp=zoneFade(z,note,vel)*velGain(vel,cfg.velcurve)*Math.pow(10,(z.vol+cfg.vol+jv)/20)*u.gain;
    const now=c.currentTime,att=Math.max(.001,z.attack/1000);
    g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(amp,now+att);
    if(pan) pan.pan.value=clamp((z.pan+cfg.pan)/100+u.pan,-1,1);
    if(u.drift>0&&src.detune){let t=now;for(let k=0;k<14;k++){t+=.6;src.detune.linearRampToValueAtTime((Math.random()*2-1)*u.drift,t);}}
    const dest=z.group==='__preview'?sampBus():fxGroupIn(z.group);src.connect(g); if(pan){g.connect(pan);pan.connect(dest);}else g.connect(dest);
    src.start();
    const v={src,g,z,note,amp,t:now,dead:false,group:z.group};
    src.onended=()=>{v.dead=true;SV.list=SV.list.filter(x=>x!==v);updVoices();};
    SV.list.push(v); made.push(v);
  });
  S.map.hot[z.id]=performance.now();
  return made;
}
function stopVoice(v,rel){
  if(v.dead) return; v.dead=true; const c=AU.ctx,now=c.currentTime,t=Math.max(.005,(rel!==undefined?rel:v.z.release)/1000);
  try{v.g.gain.cancelScheduledValues(now);v.g.gain.setValueAtTime(v.g.gain.value,now);v.g.gain.linearRampToValueAtTime(0,now+t);v.src.stop(now+t+.02);}catch(e){}
}
function sampNoteOn(note,vel){
  const zs=pickRR(matching(note,vel,false),false); if(!zs.length) return false;
  const held=[];
  zs.forEach(z=>{
    const cfg=gcfg(z.group);
    if(cfg.choke>0) SV.list.forEach(v=>{if(!v.dead&&gcfg(v.group).choke===cfg.choke&&v.z!==z)stopVoice(v,25);});
    if(cfg.voices>0){const mine=SV.list.filter(v=>!v.dead&&v.group===z.group);while(mine.length>=cfg.voices){stopVoice(mine.shift(),30);}}
    const vs=startVoice(z,note,vel); if(vs) held.push.apply(held,vs);
  });
  SV.held.set(note,{voices:(SV.held.get(note)||{voices:[]}).voices.concat(held),vel,t:AU.ctx.currentTime});
  updVoices(); return true;
}
function sampNoteOff(note){
  const h=SV.held.get(note); if(!h) return;
  SV.held.delete(note);
  h.voices.forEach(v=>{if(!v.z.oneshot)stopVoice(v);});
  const held=(AU.ctx.currentTime-h.t);
  pickRR(matching(note,h.vel,true),true).forEach(z=>{startVoice(z,note,Math.max(1,Math.round(h.vel*Math.exp(-held*.6))),true);});
  updVoices();
}
function sampPanic(){SV.list.forEach(v=>stopVoice(v,40));SV.list=[];SV.held.clear();updVoices();}
function updVoices(){const e=$('#mapVoices');if(e)e.textContent=(SV.list.filter(v=>!v.dead).length+(engineOn()?ENG.voices:0))+' voices · no limit'+(engineOn()?' · shared engine':'');}
/* dispatchers: the sampler plays when zones exist, otherwise the little synth does */
const hasSampler=()=>S.zones.length>0&&S.zones.some(z=>BUF.has(z.sample));
function noteOn(m,vel){
  if(!ensureAudio()) return; vel=vel||100; fxNoteOn(m,vel);
  if(engineOn()&&hasSampler()){
    ENG.node.port.postMessage({t:'on',n:m,v:vel});
    const now=performance.now();S.zones.forEach(z=>{if(engineZone(z)&&m>=z.lo&&m<=z.hi&&vel>=z.vlo&&vel<=z.vhi)S.map.hot[z.id]=now;});
    sampNoteOn(m,vel);return;
  }
  if(hasSampler()&&sampNoteOn(m,vel)) return;
  if(!hasSampler()) synthOn(m);
}
function noteOff(m){fxNoteOff();if(engineOn())ENG.node.port.postMessage({t:'off',n:m});sampNoteOff(m);synthOff(m);}

/* ---------- mapper: zone grid + piano ---------- */
const MG={W:600,H:300,dirty:true,conf:null,confVer:-1,down:new Set(),drag:null,run:false,pian:{H:54}};
const mapCv=$('#mapCanvas'),pianoCv=$('#mapPiano');
const mkx=k=>k*S.map.zoom-S.map.sx;
const velH=()=>MG.H/128;
const vely=v=>MG.H-v*velH();
const editable=z=>S.map.editAll||z.group===S.map.group;
function mapInvalidate(){MG.dirty=true;}
function mapSize(){
  const wrap=$('#mapWrap'),w=Math.max(200,wrap.clientWidth),h=Math.max(160,wrap.clientHeight),d=Math.min(2,dpr());
  MG.W=w;MG.H=h; mapCv.width=Math.round(w*d);mapCv.height=Math.round(h*d);mapCv.style.width=w+'px';mapCv.style.height=h+'px';
  pianoCv.width=Math.round(w*d);pianoCv.height=Math.round(MG.pian.H*d);pianoCv.style.width=w+'px';pianoCv.style.height=MG.pian.H+'px';
  const sc=$('#mapScroll'); const max=Math.max(0,128*S.map.zoom-w); S.map.sx=clamp(S.map.sx,0,max); sc.max=max; sc.value=S.map.sx; sc.disabled=max<=0;
  mapInvalidate();
}
function setZoom(z,anchorX){
  const old=S.map.zoom; z=clamp(z,3,40); if(z===old) return;
  const ax=anchorX==null?MG.W/2:anchorX,k=(S.map.sx+ax)/old; S.map.zoom=z; S.map.sx=k*z-ax; $('#mapZoom').value=z; mapSize();
}
const css=(n,f)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||f;
function mapDraw(){
  MG.dirty=false;
  if(MG.confVer!==S.map.ver){MG.conf=zoneConflicts();MG.confVer=S.map.ver;}
  const d=Math.min(2,dpr()),W=MG.W,H=MG.H,z=S.map.zoom,vh=velH(),ctx=mapCv.getContext('2d'),now=performance.now();
  ctx.setTransform(d,0,0,d,0,0);
  ctx.fillStyle='#363636';ctx.fillRect(0,0,W,H);
  const k0=Math.max(0,Math.floor(S.map.sx/z)),k1=Math.min(127,Math.ceil((S.map.sx+W)/z));
  for(let k=k0;k<=k1;k++){
    const x=mkx(k);
    if(isBlack(k)){ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x,0,z,H);}
    ctx.fillStyle=k%12===0?'rgba(255,255,255,.22)':'rgba(255,255,255,.06)';ctx.fillRect(x,0,1,H);
  }
  ctx.fillStyle='rgba(255,255,255,.1)';
  [32,64,96].forEach(v=>ctx.fillRect(0,vely(v),W,1));
  ctx.font='10px "JetBrains Mono",monospace';ctx.textBaseline='top';
  /* zones */
  const sel=new Set(S.map.sel);
  const pr=zz=>(sel.has(zz.id)?2:0)+(zz.group===S.map.group?1:0),order=S.zones.slice().sort((a,b)=>pr(a)-pr(b));
  order.forEach(zn=>{
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(x2<0||x1>W) return;
    const col=gcfg(zn.group).color,on=editable(zn),s=sel.has(zn.id),hot=now-(S.map.hot[zn.id]||0);
    ctx.globalAlpha=on?1:.28;
    ctx.fillStyle=col;ctx.globalAlpha*=s?.78:.5;ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.globalAlpha=on?1:.28;
    if(hot<500){ctx.fillStyle='rgba(255,255,255,'+(.7*(1-hot/500)).toFixed(2)+')';ctx.fillRect(x1,y1,x2-x1,y2-y1);}
    /* fades as shaded ramps */
    const shade='rgba(30,30,30,.62)';
    const gH=(xa,xb,rev)=>{const g=ctx.createLinearGradient(xa,0,xb,0);g.addColorStop(0,rev?'rgba(30,30,30,0)':shade);g.addColorStop(1,rev?shade:'rgba(30,30,30,0)');return g;};
    if(zn.fadeLo>0){ctx.fillStyle=gH(x1,x1+zn.fadeLo*z,false);ctx.fillRect(x1,y1,zn.fadeLo*z,y2-y1);}
    if(zn.fadeHi>0){ctx.fillStyle=gH(x2-zn.fadeHi*z,x2,true);ctx.fillRect(x2-zn.fadeHi*z,y1,zn.fadeHi*z,y2-y1);}
    const gV=(ya,yb)=>{const g=ctx.createLinearGradient(0,ya,0,yb);g.addColorStop(0,shade);g.addColorStop(1,'rgba(30,30,30,0)');return g;};
    if(zn.vfadeLo>0){const h=zn.vfadeLo*vh;ctx.fillStyle=gV(y2,y2-h);ctx.fillRect(x1,y2-h,x2-x1,h);}
    if(zn.vfadeHi>0){const h=zn.vfadeHi*vh;ctx.fillStyle=gV(y1,y1+h);ctx.fillRect(x1,y1,x2-x1,h);}
    const bad=MG.conf&&MG.conf.has(zn.id);
    ctx.strokeStyle=s?'#ffffff':bad?'#ff6a5e':col;ctx.lineWidth=s?2:1;
    if(bad&&!s)ctx.setLineDash([4,3]);ctx.strokeRect(x1+.5,y1+.5,x2-x1-1,y2-y1-1);ctx.setLineDash([]);
    /* root marker */
    const rx=mkx(zn.root)+z/2;
    if(rx>x1-1&&rx<x2+1){ctx.fillStyle=s?'#fff':'rgba(255,255,255,.75)';ctx.beginPath();ctx.moveTo(rx-4,y2);ctx.lineTo(rx+4,y2);ctx.lineTo(rx,y2-6);ctx.fill();}
    /* label */
    if(x2-x1>26&&y2-y1>12){
      ctx.save();ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);ctx.clip();ctx.fillStyle='#10161c';ctx.globalAlpha=on?.9:.4;
      const sm=sampleById(zn.sample);
      ctx.fillText((sm?sm.name:'—')+(zn.seq>1?'  #'+zn.seq:''),x1+4,y1+3+(zn.vfadeHi>0?0:0));
      if(zn.loop.on)ctx.fillText('∞',x2-12,y1+3);
      if(zn.mute)ctx.fillText('M',x2-12,y1+15);
      ctx.restore();
    }
    ctx.globalAlpha=1;
    if(s&&x2-x1>18){
      ctx.fillStyle='#fff';ctx.strokeStyle='#10161c';ctx.lineWidth=1;
      const hd=(x,y)=>{ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.stroke();};
      hd(x1+zn.fadeLo*z+(zn.fadeLo?0:6),y1+7);hd(x2-zn.fadeHi*z-(zn.fadeHi?0:6),y1+7);
      hd(x1+6,y2-zn.vfadeLo*vh-(zn.vfadeLo?0:7));hd(x2-6,y1+zn.vfadeHi*vh+(zn.vfadeHi?0:7));
    }
  });
  /* velocity labels */
  ctx.fillStyle='rgba(255,255,255,.55)';ctx.textBaseline='middle';
  [127,96,64,32,0].forEach(v=>ctx.fillText(String(v),3,clamp(vely(v)-(v===0?7:0),6,H-6)));
  if(S.map.marq){const m=S.map.marq;ctx.fillStyle='rgba(90,160,255,.18)';ctx.strokeStyle='#5aa0ff';ctx.lineWidth=1;ctx.fillRect(m.x1,m.y1,m.x2-m.x1,m.y2-m.y1);ctx.strokeRect(m.x1+.5,m.y1+.5,m.x2-m.x1,m.y2-m.y1);}
  pianoDraw();
}
function pianoDraw(){
  const d=Math.min(2,dpr()),W=MG.W,H=MG.pian.H,z=S.map.zoom,ctx=pianoCv.getContext('2d');
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#202020';ctx.fillRect(0,0,W,H);
  const k0=Math.max(0,Math.floor(S.map.sx/z)),k1=Math.min(127,Math.ceil((S.map.sx+W)/z)),now=performance.now();
  const cover=new Array(128).fill(null);
  S.zones.forEach(zn=>{if(!editable(zn))return;for(let k=zn.lo;k<=zn.hi;k++)cover[k]=gcfg(zn.group).color;});
  for(let k=k0;k<=k1;k++){
    const x=mkx(k),down=MAPN.has(k);
    if(!isBlack(k)){ctx.fillStyle=down?'#8fb4e0':'#e9e9e9';ctx.fillRect(x,0,z-1,H-8);}
    else{ctx.fillStyle=down?'#8fb4e0':'#101010';ctx.fillRect(x,0,z-1,(H-8)*.6);}
    if(cover[k]){ctx.fillStyle=cover[k];ctx.fillRect(x,H-6,z-1,6);}
    if(k%12===0&&z>=7){ctx.fillStyle='#222';ctx.font='9px "JetBrains Mono",monospace';ctx.textBaseline='bottom';ctx.fillText(noteName(k),x+2,H-9);}
  }
  /* black keys are drawn over whites so redraw them last */
  for(let k=k0;k<=k1;k++)if(isBlack(k)){const x=mkx(k);ctx.fillStyle=MAPN.has(k)?'#8fb4e0':'#101010';ctx.fillRect(x,0,z-1,(H-8)*.6);}
  Object.keys(S.map.hot).forEach(id=>{
    const age=now-S.map.hot[id];if(age>500)return;const zn=zoneById(id);if(!zn)return;
    ctx.fillStyle='rgba(255,255,255,'+(.5*(1-age/500)).toFixed(2)+')';
    ctx.fillRect(mkx(zn.lo),H-8,(zn.hi-zn.lo+1)*z,2);
  });
}
const MAPN=new Set();
function mapLoop(){
  if(!inMapView()){MG.run=false;return;}
  const now=performance.now();let hot=false;
  for(const id in S.map.hot){if(now-S.map.hot[id]<520)hot=true;else delete S.map.hot[id];}
  if(MG.dirty||hot) mapDraw();
  requestAnimationFrame(mapLoop);
}
let zoomInit=false;
function mapStart(){if(!zoomInit){zoomInit=true;S.map.zoom=clamp(($('#mapWrap').clientWidth||900)/128,3,40);$('#mapZoom').value=S.map.zoom;}mapSize();mapInvalidate();if(!MG.run){MG.run=true;requestAnimationFrame(mapLoop);}}
new ResizeObserver(()=>{if(inMapView())mapSize();}).observe($('#mapWrap'));
/* ---- hit testing ---- */
function hitAt(px,py){
  const z=S.map.zoom,vh=velH(),sel=new Set(S.map.sel);
  const near=(a,b,r)=>Math.abs(a-b)<=r;
  for(const zn of selZones()){
    if(!editable(zn)) continue;
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(x2-x1<=18) continue;
    const hs=[['kfLo',x1+zn.fadeLo*z+(zn.fadeLo?0:6),y1+7],['kfHi',x2-zn.fadeHi*z-(zn.fadeHi?0:6),y1+7],['vfLo',x1+6,y2-zn.vfadeLo*vh-(zn.vfadeLo?0:7)],['vfHi',x2-6,y1+zn.vfadeHi*vh+(zn.vfadeHi?0:7)]];
    for(const h of hs) if(near(px,h[1],7)&&near(py,h[2],7)) return{z:zn,part:h[0]};
  }
  const list=S.zones.slice().reverse().sort((a,b)=>(sel.has(b.id)?1:0)-(sel.has(a.id)?1:0));
  for(const zn of list){
    if(!editable(zn)) continue;
    const x1=mkx(zn.lo),x2=mkx(zn.hi+1),y1=vely(zn.vhi+1),y2=vely(zn.vlo);
    if(px<x1-3||px>x2+3||py<y1-3||py>y2+3) continue;
    const e=Math.min(5,Math.max(2,(x2-x1)/4)),ev=Math.min(5,Math.max(2,(y2-y1)/4));
    const l=px<=x1+e,r=px>=x2-e,t=py<=y1+ev,b=py>=y2-ev;
    if(sel.has(zn.id)&&near(px,mkx(zn.root)+z/2,6)&&py>=y2-12) return{z:zn,part:'root'};
    const part=(t?'t':b?'b':'')+(l?'l':r?'r':'');
    return{z:zn,part:part||'body'};
  }
  return null;
}
const CUR={body:'move',l:'ew-resize',r:'ew-resize',t:'ns-resize',b:'ns-resize',tl:'nwse-resize',br:'nwse-resize',tr:'nesw-resize',bl:'nesw-resize',root:'col-resize',kfLo:'ew-resize',kfHi:'ew-resize',vfLo:'ns-resize',vfHi:'ns-resize'};
function pt(e){const r=mapCv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
const keyAt=x=>clamp(Math.floor((x+S.map.sx)/S.map.zoom),0,127);
const velAt=y=>clamp(Math.floor((MG.H-y)/velH()),0,127);
mapCv.addEventListener('pointermove',e=>{
  if(MG.drag) return; const p=pt(e),h=hitAt(p.x,p.y);
  mapCv.style.cursor=h?CUR[h.part]:'crosshair';
  $('#mapInfo').textContent=noteName(keyAt(p.x))+'  ·  vel '+velAt(p.y)+(h?'  ·  '+(sampleById(h.z.sample)||{name:'?'}).name:'');
});
mapCv.addEventListener('pointerdown',e=>{
  if(e.button!==0) return; e.preventDefault(); mapCv.focus&&mapCv.focus();
  const p=pt(e),h=hitAt(p.x,p.y);
  if(!h){
    if(!e.shiftKey) S.map.sel=[];
    const base=S.map.sel.slice();
    MG.drag=true; const x0=p.x,y0=p.y;
    const mv=ev=>{const q=pt(ev);S.map.marq={x1:Math.min(x0,q.x),y1:Math.min(y0,q.y),x2:Math.max(x0,q.x),y2:Math.max(y0,q.y)};
      const m=S.map.marq,ids=S.zones.filter(zn=>editable(zn)&&mkx(zn.lo)<m.x2&&mkx(zn.hi+1)>m.x1&&vely(zn.vhi+1)<m.y2&&vely(zn.vlo)>m.y1).map(zn=>zn.id);
      S.map.sel=Array.from(new Set(base.concat(ids)));mapInvalidate();};
    drag(mv,()=>{S.map.marq=null;MG.drag=null;mapInvalidate();mapUI();});
    mapInvalidate();return;
  }
  const zn=h.z,had=S.map.sel.indexOf(zn.id)>=0;
  if(e.shiftKey&&h.part==='body'){S.map.sel=had?S.map.sel.filter(i=>i!==zn.id):S.map.sel.concat(zn.id);mapInvalidate();mapUI();return;}
  if(!had) S.map.sel=[zn.id];
  if((e.ctrlKey||e.altKey)&&h.part==='body'){S.map.sel=selZones().map(z0=>dupZone(z0).id);}
  S.map.group=zn.group;
  const zs=selZones(),orig=zs.map(z0=>({z:z0,lo:z0.lo,hi:z0.hi,vlo:z0.vlo,vhi:z0.vhi,root:z0.root,fl:z0.fadeLo,fh:z0.fadeHi,vl:z0.vfadeLo,vh:z0.vfadeHi}));
  const x0=p.x,y0=p.y,part=h.part,zk=S.map.zoom;
  MG.drag=true;
  const mv=ev=>{
    const q=pt(ev),dk=Math.round((q.x-x0)/zk),dv=Math.round(-(q.y-y0)/velH());
    if(part==='body'){
      const lo=Math.min.apply(null,orig.map(o=>o.lo)),hi=Math.max.apply(null,orig.map(o=>o.hi)),vlo=Math.min.apply(null,orig.map(o=>o.vlo)),vhi=Math.max.apply(null,orig.map(o=>o.vhi));
      const k=clamp(dk,-lo,127-hi),v=clamp(dv,-vlo,127-vhi);
      orig.forEach(o=>{o.z.lo=o.lo+k;o.z.hi=o.hi+k;o.z.vlo=o.vlo+v;o.z.vhi=o.vhi+v;});
    }else if(part==='root'){
      orig.forEach(o=>{o.z.root=clamp(o.root+dk,0,127);});
    }else if(part==='kfLo'){orig.forEach(o=>{o.z.fadeLo=clamp(o.fl+dk,0,o.hi-o.lo+1-o.z.fadeHi);});}
    else if(part==='kfHi'){orig.forEach(o=>{o.z.fadeHi=clamp(o.fh-dk,0,o.hi-o.lo+1-o.z.fadeLo);});}
    else if(part==='vfLo'){orig.forEach(o=>{o.z.vfadeLo=clamp(o.vl+dv,0,o.vhi-o.vlo+1-o.z.vfadeHi);});}
    else if(part==='vfHi'){orig.forEach(o=>{o.z.vfadeHi=clamp(o.vh-dv,0,o.vhi-o.vlo+1-o.z.vfadeLo);});}
    else{
      orig.forEach(o=>{
        if(part.indexOf('l')>=0) o.z.lo=clamp(o.lo+dk,0,o.hi);
        if(part.indexOf('r')>=0) o.z.hi=clamp(o.hi+dk,o.lo,127);
        if(part.indexOf('t')>=0) o.z.vhi=clamp(o.vhi+dv,o.vlo,127);
        if(part.indexOf('b')>=0) o.z.vlo=clamp(o.vlo+dv,0,o.vhi);
      });
    }
    touchMap();mapInvalidate();
    $('#mapInfo').textContent=orig.length>1?orig.length+' zones':noteName(zn.lo)+' – '+noteName(zn.hi)+'  ·  vel '+zn.vlo+'–'+zn.vhi;
  };
  drag(mv,()=>{MG.drag=null;mapInvalidate();mapUI();});
  mapInvalidate();mapUI();
});
mapCv.addEventListener('dblclick',e=>{
  const p=pt(e); if(hitAt(p.x,p.y)) return;
  const sm=sampleById(S.map.lastSample)||S.samples[S.samples.length-1];
  if(!sm){flash('Import or generate a sample first, then double-click to place it');return;}
  placeSample(sm.id,keyAt(p.x),velAt(p.y));
});
function placeSample(id,k,v){
  const sm=sampleById(id); if(!sm) return;
  const grp=S.map.group||S.groups[0]||'Group 1';
  if(S.groups.indexOf(grp)<0) S.groups.push(grp);
  const zn=addZoneFor(id,k,k,{group:grp});
  S.map.sel=[zn.id];S.map.lastSample=id;mapInvalidate();mapUI();
  return zn;
}
mapCv.addEventListener('wheel',e=>{
  e.preventDefault();
  if(e.ctrlKey||e.metaKey){setZoom(S.map.zoom*(e.deltaY<0?1.15:1/1.15),pt(e).x);return;}
  S.map.sx=clamp(S.map.sx+(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)?(e.deltaX||e.deltaY):e.deltaY),0,Math.max(0,128*S.map.zoom-MG.W));
  $('#mapScroll').value=S.map.sx;mapInvalidate();
},{passive:false});
$('#mapScroll').addEventListener('input',e=>{S.map.sx=+e.target.value;mapInvalidate();});
$('#mapZoom').addEventListener('input',e=>setZoom(+e.target.value));
/* drop samples (from the pool) or files (from the computer) on the grid */
mapCv.addEventListener('dragover',e=>{e.preventDefault();});
mapCv.addEventListener('drop',e=>{
  e.preventDefault(); const p=pt(e),sid=e.dataTransfer.getData('text/x-vsamp');
  if(sid){placeSample(sid,keyAt(p.x),velAt(p.y));return;}
  if(e.dataTransfer.files&&e.dataTransfer.files.length) importFiles(e.dataTransfer.files).then(ss=>{if(ss.length){autoMapSamples(ss);flash(ss.length+' sample'+(ss.length>1?'s':'')+' imported and mapped by note name');}});
});
/* piano: click plays, vertical position = velocity */
pianoCv.addEventListener('pointerdown',e=>{
  e.preventDefault(); let cur=-1;
  const play=ev=>{
    const r=pianoCv.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top,k=keyAt(x);
    if(k===cur) return; if(cur>=0){noteOff(cur);MAPN.delete(cur);}
    cur=k;MAPN.add(k);const vel=S.map.vel>0?S.map.vel:clamp(Math.round(30+y/(MG.pian.H-8)*97),1,127);
    noteOn(k,vel);mapInvalidate();$('#mapInfo').textContent=noteName(k)+'  ·  vel '+vel;
  };
  play(e);
  drag(play,()=>{if(cur>=0){noteOff(cur);MAPN.delete(cur);}cur=-1;mapInvalidate();});
});
function mapKey(e){
  const k=e.key,sel=selZones(),lk=k.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&lk==='d'){e.preventDefault();if(sel.length){S.map.sel=sel.map(z=>dupZone(z).id);mapInvalidate();mapUI();}return;}
  if((e.ctrlKey||e.metaKey)&&lk==='a'){e.preventDefault();S.map.sel=S.zones.filter(editable).map(z=>z.id);mapInvalidate();mapUI();return;}
  if(e.ctrlKey||e.metaKey) return;
  if(k==='Delete'||k==='Backspace'){if(sel.length){e.preventDefault();delZones(S.map.sel);mapInvalidate();mapUI();}return;}
  if(k==='Escape'){S.map.sel=[];mapInvalidate();mapUI();return;}
  if(k.indexOf('Arrow')===0&&sel.length){
    e.preventDefault();const dk=(k==='ArrowRight'?1:k==='ArrowLeft'?-1:0)*(e.shiftKey?12:1),dv=(k==='ArrowUp'?1:k==='ArrowDown'?-1:0)*(e.shiftKey?8:1);
    const lo=Math.min.apply(null,sel.map(z=>z.lo)),hi=Math.max.apply(null,sel.map(z=>z.hi)),vlo=Math.min.apply(null,sel.map(z=>z.vlo)),vhi=Math.max.apply(null,sel.map(z=>z.vhi));
    const a=clamp(dk,-lo,127-hi),b=clamp(dv,-vlo,127-vhi);
    sel.forEach(z=>{z.lo+=a;z.hi+=a;z.vlo+=b;z.vhi+=b;});touchMap();mapInvalidate();mapUI();return;
  }
  const m=KEYS[lk];
  if(m!==undefined&&!e.repeat){MAPN.add(m);noteOn(m,S.map.vel>0?S.map.vel:100);mapInvalidate();}
}
function mapKeyUp(m){MAPN.delete(m);mapInvalidate();}

/* ---------- mapper: left panel (groups + pool), zone inspector ---------- */
const MODES=[['normal','Normal (all matching zones play)'],['rrcycle','Round robin: cycle'],['rrrandom','Round robin: random'],['rrunique','Round robin: random, no repeat'],['release','Release trigger (plays on key up)']];
const GINT=[['inherit','Project default']].concat(INTERP);
const mopt=(arr,v)=>arr.map(a=>'<option value="'+esc(a[0])+'"'+(String(a[0])===String(v)?' selected':'')+'>'+esc(a[1])+'</option>').join('');
const nf=(l,attr,v,mn,mx,st,suffix)=>'<label class="f"><span>'+l+'</span><input type="number" '+attr+' value="'+(Math.round(v*1000)/1000)+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+' step="'+(st||1)+'">'+(suffix?'<em class="sfx">'+suffix+'</em>':'')+'</label>';
function newGroupName(){let i=S.groups.length+1;while(S.groups.indexOf('Group '+i)>=0)i++;return 'Group '+i;}
function mapLeftHTML(){
  const cur=S.map.group;
  let h='<h2>Groups</h2><div class="glist">'+S.groups.map(g=>{
    const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
    return '<div class="grow'+(g===cur?' on':'')+'" data-ma="grp" data-g="'+esc(g)+'"><i class="sw" style="background:'+c.color+'"></i><span class="gn">'+esc(g)+'</span><small>'+n+'</small>'
      +'<button type="button" class="ms'+(c.mute?' on':'')+'" data-ma="gmute" data-g="'+esc(g)+'" title="Mute group" aria-label="Mute '+esc(g)+'" aria-pressed="'+c.mute+'">M</button>'
      +'<button type="button" class="ms'+(c.solo?' on':'')+'" data-ma="gsolo" data-g="'+esc(g)+'" title="Solo group" aria-label="Solo '+esc(g)+'" aria-pressed="'+c.solo+'">S</button></div>';
  }).join('')+'</div><div class="chips"><button type="button" class="btn" data-ma="addgrp">+ Group</button>'
    +'<label class="chk"><input type="checkbox" data-mk="editAll"'+(S.map.editAll?' checked':'')+'> Edit all groups</label>'
    +'<label class="chk"><input type="checkbox" data-mk="follow"'+(S.map.follow?' checked':'')+'> Play only the current list\'s groups</label></div>';
  if(cur&&S.groups.indexOf(cur)>=0){
    const c=gcfg(cur);
    h+=sec('Group: '+cur,'<label class="f"><span>Name</span><input type="text" data-gname="1" value="'+esc(cur)+'"></label>'
      +'<label class="f"><span>Mode</span><select data-gk="mode">'+mopt(MODES,c.mode)+'</select></label>'
      +nf('Choke group','data-gk="choke"',c.choke,0,999,1)+'<p class="hint">Groups with the same choke number (above 0) cut each other off, like open and closed hi-hats.</p>'
      +nf('Voice limit','data-gk="voices"',c.voices,0,9999,1)+'<p class="hint">0 means unlimited. A limit steals the oldest voice.</p>'
      +nf('Volume','data-gk="vol"',c.vol,-48,24,.5,'dB')+nf('Pan','data-gk="pan"',c.pan,-100,100,1)+nf('Tune','data-gk="tune"',c.tune,-2400,2400,1,'cents')
      +'<label class="f"><span>Velocity curve</span><input type="range" data-gk="velcurve" min="0.2" max="2.5" step="0.05" value="'+c.velcurve+'"><output>'+c.velcurve+'</output></label>'
      +'<label class="f"><span>Interpolation</span><select data-gk="interp">'+mopt(GINT,c.interp)+'</select></label>'
      +'<label class="f"><span>Colour</span><input type="color" data-gk="color" value="'+c.color+'"></label>'
      +'<div class="chips"><button type="button" class="btn danger" data-ma="delgrp">Delete group and its zones</button></div>');
  }
  h+=sec('Sample pool ('+S.samples.length+')','<div class="chips"><button type="button" class="btn" data-ma="imp">Import audio…</button><button type="button" class="btn" data-ma="demo">Demo samples</button></div>'
    +'<p class="hint">Drag a sample onto the grid, or double-click the grid to place the last one you clicked. Dropping files from your computer onto the grid maps them by note name (C3, F#2…).</p>'
    +'<div class="pool">'+S.samples.map(s=>{
      const used=S.zones.some(z=>z.sample===s.id);
      return '<div class="prow'+(s.id===S.map.lastSample?' on':'')+(used?'':' unused')+'" draggable="true" data-ma="smp" data-s="'+s.id+'"><canvas width="64" height="22" data-pk="'+s.id+'" aria-hidden="true"></canvas>'
        +'<span class="pn" title="'+esc(s.name)+'">'+esc(s.name)+'</span><small>'+noteName(s.root)+' · '+s.dur.toFixed(1)+'s</small>'
        +'<button type="button" class="x" data-ma="smpdel" data-s="'+s.id+'" aria-label="Remove '+esc(s.name)+'">✕</button></div>';
    }).join('')+'</div>');
  return h;
}
function drawPeaks(cv,id,w,h,opts){
  const b=BUF.get(id); if(!b) return;
  const ctx=cv.getContext('2d'),p=b.peaks,n=p.length/2; ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle=(opts&&opts.col)||'#9ab7d8';
  for(let x=0;x<w;x++){const i=Math.min(n-1,Math.floor(x/w*n)),mn=p[i*2],mx=p[i*2+1];ctx.fillRect(x,h/2-mx*h/2,1,Math.max(1,(mx-mn)*h/2));}
}
function mapLeftRender(){
  const el=$('#leftM'); el.innerHTML=mapLeftHTML();
  $$('canvas[data-pk]',el).forEach(c=>drawPeaks(c,c.dataset.pk,c.width,c.height));
}
/* ---------- zone inspector ---------- */
function getPath(o,p){return p.split('.').reduce((a,k)=>a&&a[k],o);}
function setPath(o,p,v){const a=p.split('.'),l=a.pop();const t=a.reduce((x,k)=>x[k],o);t[l]=v;}
function zfield(label,key,v,o){
  o=o||{};
  return nf(label,'data-zk="'+key+'"'+(o.ms?' data-conv="ms"':''),v,o.min,o.max,o.step,o.sfx);
}
function zchk(label,key,v){return '<label class="f chk"><input type="checkbox" data-zk="'+key+'"'+(v?' checked':'')+'><span>'+label+'</span></label>';}
function zsel(label,key,v,opts){return '<label class="f"><span>'+label+'</span><select data-zk="'+key+'">'+mopt(opts,v)+'</select></label>';}
function mapRightHTML(){
  const zs=selZones();
  if(!zs.length){
    const bad=zoneConflicts().size;
    return '<div class="rep"><div class="stats"><div><small>Zones</small><b>'+S.zones.length+'</b></div><div><small>Samples</small><b>'+S.samples.length+'</b></div><div><small>Groups</small><b>'+S.groups.length+'</b></div><div><small>Conflicts</small><b>'+bad+'</b></div></div></div>'
      +'<p class="empty">No zone selected.<br>Click a zone, drag a box around several, or double-click the grid to place a sample.</p>'
      +sec('Cheat sheet','<div class="syn">Drag a zone to move it, its edges to resize.<br>Diamonds drag the crossfades.<br>The small triangle at the bottom is the root key.<br><kbd>Shift</kbd>-click adds to the selection.<br><kbd>Ctrl</kbd> or <kbd>Alt</kbd>-drag duplicates.<br><kbd>Ctrl</kbd>+wheel zooms, wheel scrolls.<br>Arrows nudge, <kbd>Shift</kbd>+arrows jump.<br><kbd>Del</kbd> removes. Red dashed zones overlap with no crossfade.</div>');
  }
  const z=zs[0],multi=zs.length>1,sm=sampleById(z.sample),sr=sm?sm.sr:44100;
  const msv=f=>f/sr*1000;
  let h='<div class="phead"><b class="pname2">'+(multi?zs.length+' zones':esc(sm?sm.name:'Zone'))+'</b><span class="badge">'+esc(z.group)+'</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-mz="dup">Duplicate</button><button type="button" class="btn danger" data-mz="del">Delete</button></div>';
  h+=sec('Sample',(multi?'':'<canvas id="zoneWave" width="300" height="76" aria-label="Sample waveform with loop markers"></canvas><p class="hint" id="waveHint">Drag the markers: start, loop start, loop end, and the crossfade.</p>')
    +'<label class="f"><span>Sample</span><select data-zk="sample">'+mopt(S.samples.map(s=>[s.id,s.name]),z.sample)+'</select></label>'
    +'<label class="f"><span>Group</span><select data-zk="group">'+mopt(S.groups.map(g=>[g,g]),z.group)+'</select></label>'
    +(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="detect">Detect pitch</button></div>'));
  h+=sec('Keys and velocity',zfield('Low key','lo',z.lo,{min:0,max:127,sfx:noteName(z.lo)})+zfield('High key','hi',z.hi,{min:0,max:127,sfx:noteName(z.hi)})
    +zfield('Low velocity','vlo',z.vlo,{min:0,max:127})+zfield('High velocity','vhi',z.vhi,{min:0,max:127})
    +zfield('Root key','root',z.root,{min:0,max:127,sfx:noteName(z.root)}));
  h+=sec('Crossfades',zfield('Key fade in','fadeLo',z.fadeLo,{min:0,max:127,sfx:'keys'})+zfield('Key fade out','fadeHi',z.fadeHi,{min:0,max:127,sfx:'keys'})
    +zfield('Velocity fade in','vfadeLo',z.vfadeLo,{min:0,max:127})+zfield('Velocity fade out','vfadeHi',z.vfadeHi,{min:0,max:127})
    +zsel('Fade curve','curve',z.curve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
    +'<p class="hint">Fades happen inside the zone. Overlap two zones by the same amount with an equal-power curve and the level stays even across the join.</p>');
  h+=sec('Pitch and interpolation',zfield('Tune','tune',z.tune,{min:-2400,max:2400,step:1,sfx:'cents'})+zchk('Follow the keyboard (key tracking)','keytrack',z.keytrack)
    +zsel('Interpolation','interp',z.interp,GINT)
    +'<p class="hint">This is how the sample is resampled when it is pitched. Nearest is gritty, linear is soft, cubic is clean, sinc is the cleanest and costs the most.</p>');
  h+=sec('Level',zfield('Volume','vol',z.vol,{min:-60,max:24,step:.5,sfx:'dB'})+zfield('Pan','pan',z.pan,{min:-100,max:100}));
  h+=sec('Start and loop',zfield('Start offset','start',z.start,{min:0,max:60000,step:1,sfx:'ms'})+zfield('End (0 = whole sample)','end',z.end,{min:0,max:600000,step:1,sfx:'ms'})+zfield('Velocity moves start','vstart',z.vstart,{min:0,max:5000,step:1,sfx:'ms'})
    +'<p class="hint">Soft notes start later in the sample, like a gentler attack.</p>'+zchk('Reverse','rev',z.rev)+zchk('Loop','loop.on',z.loop.on)
    +(z.loop.on?zfield('Loop start','loop.s',msv(z.loop.s),{min:0,step:1,sfx:'ms',ms:1})+zfield('Loop end','loop.e',msv(z.loop.e),{min:0,step:1,sfx:'ms',ms:1})
      +zfield('Loop crossfade','loop.xf',msv(z.loop.xf),{min:0,step:1,sfx:'ms',ms:1})+zsel('Loop fade curve','loop.xcurve',z.loop.xcurve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
      +zchk('Ping-pong (forward then backward)','loop.pp',z.loop.pp)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="findloop">Find a loop</button></div>'):''));
  h+=sec('Envelope',zfield('Attack','attack',z.attack,{min:0,max:10000,sfx:'ms'})+zfield('Release','release',z.release,{min:0,max:20000,sfx:'ms'})+zchk('One-shot (ignore key up)','oneshot',z.oneshot));
  h+=sec('Variation',zfield('Round robin position','seq',z.seq,{min:1,max:999})+'<p class="hint">Zones in a round-robin group with different positions take turns.</p>'
    +zfield('Random tune','hum.tune',z.hum.tune,{min:0,max:200,sfx:'cents'})+zfield('Random volume','hum.vol',z.hum.vol,{min:0,max:12,step:.5,sfx:'dB'})+zfield('Random start','hum.start',z.hum.start,{min:0,max:500,sfx:'ms'}));
  h+=sec('Mute / solo',zchk('Mute zone','mute',z.mute)+zchk('Solo zone','solo',z.solo));
  return h;
}
let waveZ=null;
function mapRightRender(){
  const el=$('#rightM'); const sc=$('#rbodyM'); sc.innerHTML=mapRightHTML();
  const zs=selZones(); waveZ=zs.length===1?zs[0]:null; drawZoneWave();
}
function mapUI(){mapLeftRender();mapRightRender();}
/* ---- waveform with draggable markers ---- */
function waveMetrics(){
  const cv=$('#zoneWave'); if(!cv||!waveZ) return null;
  const sm=sampleById(waveZ.sample),b=sm&&BUF.get(sm.id); if(!b) return null;
  return{cv,sm,b,W:cv.width,H:cv.height,total:b.ch[0].length};
}
function drawZoneWave(){
  const m=waveMetrics(); if(!m) return; const z=waveZ,{cv,W,H,total,sm}=m,ctx=cv.getContext('2d');
  ctx.fillStyle='#262626';ctx.fillRect(0,0,W,H);
  const fx=f=>f/total*W,L=z.loop;
  if(L.on){
    ctx.fillStyle='rgba(90,160,255,.18)';ctx.fillRect(fx(L.s),0,fx(L.e)-fx(L.s),H);
    if(L.xf>0){ctx.fillStyle='rgba(240,194,74,.28)';ctx.fillRect(fx(L.e-L.xf),0,fx(L.xf),H);ctx.fillRect(fx(L.s-L.xf),0,fx(L.xf),H);}
  }
  drawPeaks(cv,sm.id,W,H,{col:'#9ab7d8'});
  const line=(x,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x)-1,0,2,H);};
  line(fx(z.start/1000*sm.sr),'#8ac76a');
  if(L.on){line(fx(L.s),'#5aa0ff');line(fx(L.e),'#5aa0ff');}
  ctx.fillStyle='#ccc';ctx.font='9px "JetBrains Mono",monospace';ctx.textBaseline='top';
  ctx.fillText(sm.dur.toFixed(2)+' s',W-44,2);
}
document.addEventListener('pointerdown',e=>{
  const cv=e.target.closest&&e.target.closest('#zoneWave'); if(!cv||!waveZ) return;
  const m=waveMetrics(); if(!m) return; e.preventDefault();
  const r=cv.getBoundingClientRect(),sc=cv.width/r.width,z=waveZ,L=z.loop,{total,sm}=m;
  const toF=ev=>clamp(Math.round((ev.clientX-r.left)*sc/m.W*total),0,total);
  const px=(ev)=>(ev.clientX-r.left)*sc;
  const marks=[['start',z.start/1000*sm.sr]];
  if(L.on){marks.push(['ls',L.s],['le',L.e],['xf',L.e-L.xf]);}
  let best=null,bd=9;marks.forEach(mk=>{const d=Math.abs(px(e)-mk[1]/total*m.W);if(d<bd){bd=d;best=mk[0];}});
  if(!best){return;}
  const mv=ev=>{
    const f=toF(ev);
    if(best==='start') z.start=Math.round(f/sm.sr*1000);
    else if(best==='ls') L.s=Math.min(f,L.e-64);
    else if(best==='le') L.e=Math.max(f,L.s+64);
    else if(best==='xf') L.xf=clamp(L.e-f,0,Math.min(L.s,(L.e-L.s)>>1));
    touchMap();drawZoneWave();
  };
  drag(mv,()=>{mapRightRender();});
});
document.addEventListener('pointermove',e=>{
  const cv=e.target.closest&&e.target.closest('#zoneWave'); if(cv) cv.style.cursor='ew-resize';
});
/* ---- find loop: zero crossings with matching direction ---- */
function findLoop(z){
  const b=BUF.get(z.sample); if(!b) return false; const d=b.ch[0],n=d.length,sr=b.sr;
  const up=i=>d[i]<=0&&d[i+1]>0;
  const snap=(f,dir)=>{for(let k=0;k<4000;k++){const i=f+dir*k;if(i>0&&i<n-2&&up(i))return i;}return f;};
  const s=snap(Math.floor(n*.3),1),e=snap(Math.floor(n*.85),-1);
  if(e-s<sr*.1) return false;
  z.loop.on=true;z.loop.s=s;z.loop.e=e;z.loop.xf=Math.min(Math.floor(sr*.12),s,(e-s)>>1);
  return true;
}
/* ---- events: left panel ---- */
$('#leftM').addEventListener('click',e=>{
  const b=e.target.closest('[data-ma]'); if(!b) return; const a=b.dataset.ma,g=b.dataset.g;
  if(e.target.closest('input')) return;
  if(a==='grp'){if(e.target.closest('.ms'))return;S.map.group=g;if(e.detail>=2)S.map.sel=S.zones.filter(z=>z.group===g).map(z=>z.id);mapUI();mapInvalidate();}
  else if(a==='gmute'){gcfg(g).mute=!gcfg(g).mute;mapUI();}
  else if(a==='gsolo'){gcfg(g).solo=!gcfg(g).solo;mapUI();}
  else if(a==='addgrp'){const n=newGroupName();S.groups.push(n);gcfg(n);S.map.group=n;mapUI();mapInvalidate();}
  else if(a==='delgrp'){
    const n=S.map.group;if(!n)return;
    delZones(S.zones.filter(z=>z.group===n).map(z=>z.id));
    S.groups=S.groups.filter(x=>x!==n);S.lists.forEach(l=>{l.groups=(l.groups||[]).filter(x=>x!==n);});
    delete S.gset[n];S.map.group=S.groups[0]||null;mapUI();mapInvalidate();
  }
  else if(a==='smp'){if(e.target.closest('.x'))return;S.map.lastSample=b.dataset.s;mapLeftRender();}
  else if(a==='smpdel'){
    const id=b.dataset.s;delZones(S.zones.filter(z=>z.sample===id).map(z=>z.id));
    S.samples=S.samples.filter(s=>s.id!==id);BUF.delete(id);touchMap();mapUI();mapInvalidate();
  }
  else if(a==='imp'){$('#fileAudio').value='';$('#fileAudio').click();}
  else if(a==='demo'){ensureAudio();demoSamples();touchMap();mapUI();mapInvalidate();flash('Demo set loaded: piano with velocity layers, round-robin hammers, a looped pad and release noise');}
});
$('#leftM').addEventListener('dblclick',e=>{
  const gr=e.target.closest('.grow'); if(gr&&!e.target.closest('.ms')){S.map.group=gr.dataset.g;S.map.sel=S.zones.filter(z=>z.group===gr.dataset.g).map(z=>z.id);mapUI();mapInvalidate();return;}
  const r=e.target.closest('.prow'); if(!r) return;
  const sm=sampleById(r.dataset.s); if(!sm) return;
  placeSample(sm.id,clamp(sm.root,0,127),64);
});
$('#leftM').addEventListener('dragstart',e=>{
  const r=e.target.closest('.prow'); if(!r) return;
  e.dataTransfer.setData('text/x-vsamp',r.dataset.s);e.dataTransfer.effectAllowed='copy';
});
$('#leftM').addEventListener('input',e=>{
  const t=e.target,g=S.map.group;
  if(t.dataset.gk&&g){
    const c=gcfg(g),k=t.dataset.gk;
    c[k]=t.type==='number'||t.type==='range'?parseFloat(t.value)||0:t.value;
    if(t.type==='range'&&t.nextElementSibling)t.nextElementSibling.textContent=c[k];
    if(k==='color'){mapInvalidate();} else touchMap();
    if(k==='color'){const sw=$('.grow.on .sw',$('#leftM'));if(sw)sw.style.background=c.color;}
  }
});
$('#leftM').addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.mk){S.map[t.dataset.mk]=t.checked;mapInvalidate();return;}
  if(t.dataset.gname){
    const old=S.map.group,nn=t.value.trim();
    if(!nn||S.groups.indexOf(nn)>=0){t.value=old;flash('Group names must be unique');return;}
    S.groups[S.groups.indexOf(old)]=nn;S.gset[nn]=S.gset[old];delete S.gset[old];
    S.zones.forEach(z=>{if(z.group===old)z.group=nn;});
    S.lists.forEach(l=>{l.groups=(l.groups||[]).map(x=>x===old?nn:x);});
    S.map.group=nn;touchMap();mapUI();mapInvalidate();return;
  }
  if(t.dataset.gk==='mode'||t.dataset.gk==='interp'){touchMap();}
});
$('#fileAudio').addEventListener('change',()=>{
  importFiles($('#fileAudio').files).then(ss=>{if(ss.length){S.map.lastSample=ss[ss.length-1].id;mapUI();flash(ss.length+' sample'+(ss.length>1?'s':'')+' added to the pool. Use Auto-map or drag them in.');}});
});
/* ---- events: zone inspector ---- */
const STRUCT=['loop.on','sample','group','interp','lo','hi','root','vlo','vhi'];
$('#rbodyM').addEventListener('input',e=>{
  const t=e.target,key=t.dataset.zk; if(!key) return;
  const zs=selZones(); if(!zs.length) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.tagName==='SELECT'||t.type==='text') v=t.value; else{v=parseFloat(t.value);if(isNaN(v))return;}
  if(t.type==='checkbox'||t.tagName==='SELECT') return; /* handled on change */
  applyZ(zs,key,v,t.dataset.conv);
  const sfx=t.parentElement.querySelector('.sfx'); if(sfx&&(key==='lo'||key==='hi'||key==='root')) sfx.textContent=noteName(v);
});
$('#rbodyM').addEventListener('change',e=>{
  const t=e.target,key=t.dataset.zk; if(!key) return;
  const zs=selZones(); if(!zs.length) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.tagName==='SELECT') v=t.value; else v=parseFloat(t.value);
  if(typeof v==='number'&&isNaN(v)) return;
  applyZ(zs,key,v,t.dataset.conv); mapRightRender(); mapLeftRender();
});
function applyZ(zs,key,v,conv){
  zs.forEach(z=>{
    let val=v;
    if(conv==='ms'){const s=sampleById(z.sample);val=Math.round(v/1000*(s?s.sr:44100));}
    if(key==='lo') val=clamp(val,0,127);
    setPath(z,key,val);
    if(key==='lo'&&z.lo>z.hi) z.hi=z.lo; if(key==='hi'&&z.hi<z.lo) z.lo=z.hi;
    if(key==='vlo'&&z.vlo>z.vhi) z.vhi=z.vlo; if(key==='vhi'&&z.vhi<z.vlo) z.vlo=z.vhi;
    if(key==='sample'){const s=sampleById(val);if(s&&z.loop.e>s.frames)z.loop.e=s.frames;}
    if(key==='loop.on'&&val&&z.loop.e-z.loop.s<64){const s=sampleById(z.sample);if(s){z.loop.s=Math.floor(s.frames*.3);z.loop.e=Math.floor(s.frames*.9);}}
  });
  touchMap();mapInvalidate();drawZoneWave();
}
$('#rightM').addEventListener('click',e=>{
  const b=e.target.closest('[data-mz]'); if(!b) return; const a=b.dataset.mz,zs=selZones();
  if(a==='del'){delZones(S.map.sel);mapInvalidate();mapUI();}
  else if(a==='dup'){S.map.sel=zs.map(z=>dupZone(z).id);mapInvalidate();mapUI();}
  else if(a==='detect'&&zs[0]){
    const p=detectPitch(zs[0].sample);
    if(!p){flash('Could not find a clear pitch in that sample');return;}
    zs[0].root=p.midi;zs[0].tune=-p.cents;touchMap();mapInvalidate();mapRightRender();flash('Detected '+noteName(p.midi)+(p.cents?' ('+(p.cents>0?'+':'')+p.cents+' cents)':''));
  }
  else if(a==='findloop'&&zs[0]){if(findLoop(zs[0])){touchMap();mapRightRender();flash('Loop placed on matching zero crossings');}else flash('That sample is too short to loop');}
});

/* ---------- mapper: tools ---------- */
function ensureGroup(){
  let g=S.map.group; if(!g||S.groups.indexOf(g)<0){g=S.groups[0]||newGroupName();if(S.groups.indexOf(g)<0)S.groups.push(g);S.map.group=g;}
  gcfg(g); return g;
}
/* sort zones into root buckets and spread key ranges between neighbouring roots */
function spreadRoots(zs,lo,hi){
  const roots=Array.from(new Set(zs.map(z=>z.root))).sort((a,b)=>a-b);
  roots.forEach((r,i)=>{
    const a=i?Math.floor((roots[i-1]+r)/2)+1:lo,b=i<roots.length-1?Math.floor((r+roots[i+1])/2):hi;
    zs.filter(z=>z.root===r).forEach(z=>{z.lo=clamp(a,lo,hi);z.hi=clamp(Math.max(a,b),lo,hi);});
  });
}
function stackVel(zs){
  const n=zs.length; if(n<2) return;
  zs.sort((a,b)=>String(sampleName(a)).localeCompare(String(sampleName(b)),undefined,{numeric:true}));
  zs.forEach((z,i)=>{z.vlo=Math.round(i*128/n);z.vhi=Math.round((i+1)*128/n)-1;z.vfadeLo=0;z.vfadeHi=0;});
}
const sampleName=z=>(sampleById(z.sample)||{name:''}).name;
function autoMapSamples(ss){
  const grp=ensureGroup();
  const list=(ss&&ss.length?ss:S.samples.filter(s=>!S.zones.some(z=>z.sample===s.id)));
  if(!list.length){flash('Nothing unmapped in the pool');return 0;}
  const byRoot={};
  list.forEach(s=>{(byRoot[s.root]=byRoot[s.root]||[]).push(s);});
  const made=[];
  Object.keys(byRoot).forEach(r=>{const arr=byRoot[r];arr.forEach(s=>made.push(addZoneFor(s.id,0,127,{group:grp})));});
  spreadRoots(made,0,127);
  Object.keys(byRoot).forEach(r=>stackVel(made.filter(z=>z.root===+r)));
  S.map.sel=made.map(z=>z.id);touchMap();mapInvalidate();mapUI();
  return made.length;
}
function selOrGroup(){const s=selZones();return s.length?s:S.zones.filter(z=>z.group===S.map.group);}
$('#mapAuto').addEventListener('click',()=>{const n=autoMapSamples();if(n)flash('Auto-mapped '+n+' zone'+(n>1?'s':'')+' by root note, velocity layers stacked');});
$('#mapSpread').addEventListener('click',()=>{
  const zs=selOrGroup(); if(!zs.length){flash('Select some zones first');return;}
  const lo=Math.min.apply(null,zs.map(z=>z.lo)),hi=Math.max.apply(null,zs.map(z=>z.hi));
  spreadRoots(zs,lo,hi);touchMap();mapInvalidate();mapUI();flash('Keys spread between the root notes');
});
$('#mapStack').addEventListener('click',()=>{
  const zs=selZones(); if(zs.length<2){flash('Select two or more zones on the same keys');return;}
  stackVel(zs);touchMap();mapInvalidate();mapUI();flash('Velocity layers split evenly');
});
$('#mapFill').addEventListener('click',()=>{
  const zs=selOrGroup().slice().sort((a,b)=>a.lo-b.lo||a.vlo-b.vlo); if(zs.length<2){flash('Need at least two zones');return;}
  let n=0;
  zs.forEach(z=>{
    const nx=zs.filter(o=>o!==z&&o.lo>z.hi&&o.vlo<=z.vhi&&o.vhi>=z.vlo).sort((a,b)=>a.lo-b.lo)[0];
    if(nx&&nx.lo-1>z.hi){z.hi=nx.lo-1;n++;}
  });
  touchMap();mapInvalidate();mapUI();flash(n?'Closed '+n+' gap'+(n>1?'s':''):'No gaps between neighbours');
});
$('#mapXfade').addEventListener('click',()=>{
  const zs=selZones().slice(); if(zs.length<2){flash('Select the zones that should crossfade');return;}
  const N=clamp(parseInt($('#mapXf').value,10)||3,1,24);
  let n=0;
  /* neighbours in key space (touching ranges, overlapping velocity) */
  const byKey=zs.slice().sort((a,b)=>a.lo-b.lo);
  byKey.forEach(a=>{
    const b=byKey.find(o=>o!==a&&o.lo===a.hi+1&&o.vlo<=a.vhi&&o.vhi>=a.vlo);
    if(b){a.hi=clamp(a.hi+N,a.lo,127);b.lo=clamp(b.lo-N,0,b.hi);a.fadeHi=a.hi-b.lo+1;b.fadeLo=a.fadeHi;a.curve=b.curve='power';n++;}
  });
  /* neighbours in velocity space (same keys) */
  const V=N*4,byVel=zs.slice().sort((a,b)=>a.vlo-b.vlo);
  byVel.forEach(a=>{
    const b=byVel.find(o=>o!==a&&o.vlo===a.vhi+1&&o.lo<=a.hi&&o.hi>=a.lo);
    if(b){a.vhi=clamp(a.vhi+V,a.vlo,127);b.vlo=clamp(b.vlo-V,0,b.vhi);a.vfadeHi=a.vhi-b.vlo+1;b.vfadeLo=a.vfadeHi;a.curve=b.curve='power';n++;}
  });
  touchMap();mapInvalidate();mapUI();flash(n?'Created '+n+' equal-power crossfade'+(n>1?'s':''):'No touching neighbours in the selection');
});
$('#mapPanic').addEventListener('click',()=>sampPanic());
$('#mapInterp').addEventListener('change',e=>{S.map.interp=e.target.value;touchMap();flash('Project interpolation: '+e.target.selectedOptions[0].textContent);});
$('#mapVel').addEventListener('input',e=>{S.map.vel=+e.target.value;$('#mapVelOut').textContent=S.map.vel||'by key height';});

/* ---------- samples tab: waveform editor ---------- */
Object.assign(S,{smp:{sel:null,fpp:200,sx:0,a:null,b:null,tool:'select',dirty:true,play:null}});
const SM={W:600,H:260,run:false};
const smCv=$('#smCanvas');
const smSample=()=>sampleById(S.smp.sel);
const smBuf=()=>{const s=smSample();return s&&BUF.get(s.id);};
function smInvalidate(){S.smp.dirty=true;}
function smSize(){
  const wrap=$('#smWrap'),w=Math.max(200,wrap.clientWidth),h=Math.max(140,wrap.clientHeight),d=Math.min(2,dpr());
  SM.W=w;SM.H=h;smCv.width=Math.round(w*d);smCv.height=Math.round(h*d);smCv.style.width=w+'px';smCv.style.height=h+'px';
  smClampView();smInvalidate();
}
function smClampView(){
  const b=smBuf(); if(!b){S.smp.sx=0;return;}
  const n=b.ch[0].length;
  S.smp.fpp=clamp(S.smp.fpp,.05,Math.max(.05,n/SM.W*1.2));
  S.smp.sx=clamp(S.smp.sx,0,Math.max(0,n-SM.W*S.smp.fpp*.2));
  const sc=$('#smScroll');sc.max=n;sc.value=S.smp.sx;
}
function smFit(){const b=smBuf();if(!b)return;S.smp.fpp=b.ch[0].length/SM.W;S.smp.sx=0;smClampView();smInvalidate();}
const fx2x=f=>(f-S.smp.sx)/S.smp.fpp,x2f=x=>Math.round(S.smp.sx+x*S.smp.fpp);
function niceStep(sec){const p=Math.pow(10,Math.floor(Math.log10(sec))),m=sec/p;return(m<1.5?1:m<3.5?2:m<7.5?5:10)*p;}
function smDraw(){
  S.smp.dirty=false;
  const d=Math.min(2,dpr()),W=SM.W,H=SM.H,ctx=smCv.getContext('2d'),s=smSample(),b=smBuf();
  ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#303030';ctx.fillRect(0,0,W,H);
  if(!s||!b){ctx.fillStyle='#888';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('Pick a sample on the left, or import / generate some.',W/2,H/2);ctx.textAlign='left';return;}
  const n=b.ch[0].length,fpp=S.smp.fpp,sx=S.smp.sx,top=18,mid=top+(H-top)/2,half=(H-top)/2-4;
  /* ruler */
  const stepS=niceStep(60*fpp/b.sr);ctx.font='10px "JetBrains Mono",monospace';ctx.textBaseline='top';
  for(let t=Math.ceil(sx/b.sr/stepS)*stepS;t*b.sr<sx+W*fpp;t+=stepS){
    const x=fx2x(t*b.sr);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(x,top,1,H);ctx.fillStyle='#aaa';ctx.fillText(t.toFixed(stepS<1?2:1)+'s',x+3,3);
  }
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(0,mid,W,1);
  /* loop region */
  if(s.loop){
    const x1=fx2x(s.loop.s),x2=fx2x(s.loop.e);
    ctx.fillStyle='rgba(90,160,255,.16)';ctx.fillRect(x1,top,x2-x1,H);
    if(s.loop.xf>0){ctx.fillStyle='rgba(240,194,74,.25)';ctx.fillRect(fx2x(s.loop.e-s.loop.xf),top,s.loop.xf/fpp,H);ctx.fillRect(fx2x(s.loop.s-s.loop.xf),top,s.loop.xf/fpp,H);}
  }
  /* selection */
  if(S.smp.a!=null){const a=Math.min(S.smp.a,S.smp.b),c=Math.max(S.smp.a,S.smp.b);ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(fx2x(a),top,Math.max(1,(c-a)/fpp),H);}
  /* waveform */
  const stride=Math.max(1,Math.floor(fpp/24));
  ctx.fillStyle='#9ab7d8';
  for(let x=0;x<W;x++){
    const a=Math.floor(sx+x*fpp),e=Math.min(n,Math.floor(sx+(x+1)*fpp)+1); if(a>=n) break; if(a<0) continue;
    let mn=1,mx=-1;
    for(let c=0;c<b.ch.length;c++){const dd=b.ch[c];for(let j=a;j<e;j+=stride){const v=dd[j];if(v<mn)mn=v;if(v>mx)mx=v;}}
    ctx.fillRect(x,mid-mx*half,1,Math.max(1,(mx-mn)*half));
  }
  /* loop edges, slices, playhead */
  const line=(f,col,lab)=>{const x=fx2x(f);if(x<-2||x>W+2)return;ctx.fillStyle=col;ctx.fillRect(Math.round(x)-1,top,2,H);if(lab){ctx.font='10px "JetBrains Mono",monospace';ctx.fillText(lab,x+3,H-14);}};
  if(s.loop){line(s.loop.s,'#5aa0ff','L');line(s.loop.e,'#5aa0ff','E');}
  const sm=smOf(s);
  if(sm.mode==='slicer'||S.smp.tool==='slice') sm.slices.forEach((f,i)=>line(f,'#f08a3a',String(i+1)));
  if(sm.mode==='wavetable'){
    const fl=sm.wt.frame;ctx.fillStyle='rgba(255,255,255,.22)';
    for(let f=fl;f<n;f+=fl){const x=fx2x(f);if(x>0&&x<W&&fl/fpp>3)ctx.fillRect(Math.round(x),top,1,H);}
  }
  if(S.smp.play){const f=S.smp.play.from+(AU.ctx.currentTime-S.smp.play.t0)*b.sr;if(f<=S.smp.play.to)line(f,'#8ac76a');else S.smp.play=null;}
  $('#smInfo').textContent=(S.smp.a!=null?'Selection '+(Math.abs(S.smp.b-S.smp.a)/b.sr).toFixed(3)+' s  ·  ':'')+(n/b.sr).toFixed(2)+' s · '+b.sr+' Hz · '+b.ch.length+' ch';
}
function smLoop(){
  if(!inSmpView()){SM.run=false;return;}
  if(S.smp.dirty||S.smp.play) smDraw();
  requestAnimationFrame(smLoop);
}
function smStart(){smSize();smInvalidate();if(!SM.run){SM.run=true;requestAnimationFrame(smLoop);}}
new ResizeObserver(()=>{if(inSmpView())smSize();}).observe($('#smWrap'));
/* snap a position to the nearest rising zero crossing */
function zeroSnap(b,f,range){
  const d=b.ch[0],n=d.length;f=clamp(f,1,n-3);
  for(let k=0;k<range;k++){for(const sgn of[1,-1]){const i=f+sgn*k;if(i>0&&i<n-2&&d[i]<=0&&d[i+1]>0)return i;}}
  return f;
}
/* ---- pointer ---- */
function smPt(e){const r=smCv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function smHit(x){
  const s=smSample(); if(!s) return null; const sm=smOf(s),near=f=>Math.abs(fx2x(f)-x)<=6;
  if(s.loop){
    if(near(s.loop.s))return{k:'ls'};if(near(s.loop.e))return{k:'le'};if(near(s.loop.e-s.loop.xf)&&s.loop.xf>0)return{k:'xf'};
  }
  if(sm.mode==='slicer'||S.smp.tool==='slice'){for(let i=0;i<sm.slices.length;i++)if(near(sm.slices[i]))return{k:'slice',i};}
  return null;
}
smCv.addEventListener('pointermove',e=>{
  const p=smPt(e);if(S.smp.drag)return;const h=smHit(p.x);smCv.style.cursor=h?'ew-resize':(S.smp.tool==='slice'?'copy':'text');
});
smCv.addEventListener('pointerdown',e=>{
  const s=smSample(),b=smBuf(); if(!s||!b||e.button>1) return; e.preventDefault();
  const p=smPt(e),h=smHit(p.x),sm=smOf(s);
  if(h&&h.k==='slice'&&e.altKey){sm.slices.splice(h.i,1);touchMap();smInvalidate();smPanelRender();return;}
  if(h){
    S.smp.drag=true;
    drag(ev=>{
      const f=clamp(x2f(smPt(ev).x),0,b.ch[0].length);
      if(h.k==='ls')s.loop.s=Math.min(f,s.loop.e-64);
      else if(h.k==='le')s.loop.e=Math.max(f,s.loop.s+64);
      else if(h.k==='xf')s.loop.xf=clamp(s.loop.e-f,0,Math.min(s.loop.s,(s.loop.e-s.loop.s)>>1));
      else{sm.slices[h.i]=h.i===0?0:clamp(f,1,b.ch[0].length-1);}
      smInvalidate();
    },()=>{S.smp.drag=null;if(h.k==='slice'){sm.slices.sort((a,c)=>a-c);}touchMap();smPanelRender();smInvalidate();});
    return;
  }
  if(S.smp.tool==='slice'){
    const f=zeroSnap(b,x2f(p.x),Math.round(b.sr*.004));
    sm.slices.push(f);sm.slices.sort((a,c)=>a-c);touchMap();smInvalidate();smPanelRender();return;
  }
  const f0=clamp(x2f(p.x),0,b.ch[0].length);S.smp.a=f0;S.smp.b=f0;S.smp.drag=true;
  drag(ev=>{S.smp.b=clamp(x2f(smPt(ev).x),0,b.ch[0].length);smInvalidate();},()=>{
    S.smp.drag=null;if(Math.abs(S.smp.b-S.smp.a)<3){S.smp.a=S.smp.b=null;}
    else{const lo=Math.min(S.smp.a,S.smp.b),hi=Math.max(S.smp.a,S.smp.b);S.smp.a=e.shiftKey?lo:zeroSnap(b,lo,300);S.smp.b=e.shiftKey?hi:zeroSnap(b,hi,300);}
    smInvalidate();
  });
});
smCv.addEventListener('dblclick',()=>{const b=smBuf();if(!b)return;S.smp.a=0;S.smp.b=b.ch[0].length;smInvalidate();});
smCv.addEventListener('wheel',e=>{
  const b=smBuf(); if(!b) return; e.preventDefault();
  if(e.ctrlKey||e.metaKey){
    const x=smPt(e).x,f=x2f(x),k=e.deltaY<0?.8:1.25;S.smp.fpp*=k;S.smp.sx=f-x*S.smp.fpp;
  }else S.smp.sx+=(e.deltaX||e.deltaY)*S.smp.fpp*.6;
  smClampView();smInvalidate();
},{passive:false});
$('#smScroll').addEventListener('input',e=>{S.smp.sx=+e.target.value;smInvalidate();});
/* ---- preview playback ---- */
const PV={held:new Map()};
function previewZone(s){
  return mkZone({id:'prev_'+s.id,sample:s.id,group:'__preview',lo:0,hi:127,root:s.root,tune:s.fine||0,
    loop:{on:!!s.loop,s:s.loop?s.loop.s:0,e:s.loop?s.loop.e:s.frames,xf:s.loop?s.loop.xf:0,xcurve:'power',pp:false},release:200});
}
function previewOn(note){
  const s=smSample(); if(!s||!ensureAudio()) return;
  if(PV.held.has(note)) return;
  const z=previewZone(s),vs=startVoice(z,note,100);
  PV.held.set(note,vs||[]);updVoices();
}
function previewOff(note){const vs=PV.held.get(note);if(!vs)return;PV.held.delete(note);vs.forEach(v=>stopVoice(v));}
function previewStopAll(){PV.held.forEach(vs=>vs.forEach(v=>stopVoice(v,40)));PV.held.clear();sampPanic();S.smp.play=null;smInvalidate();}
function playRaw(){
  const s=smSample(),b=smBuf(); if(!s||!ensureAudio()) return;
  const a=S.smp.a!=null?Math.min(S.smp.a,S.smp.b):0,c=S.smp.a!=null?Math.max(S.smp.a,S.smp.b):b.ch[0].length;
  const buf=AU.ctx.createBuffer(b.ch.length,c-a,b.sr);b.ch.forEach((d,i)=>buf.copyToChannel(d.subarray(a,c),i));
  const src=AU.ctx.createBufferSource();src.buffer=buf;const g=AU.ctx.createGain();g.gain.value=.9;src.connect(g);g.connect(AU.master);
  src.start();S.smp.play={from:a,to:c,t0:AU.ctx.currentTime};
}
function smKey(e){
  if(e.ctrlKey||e.metaKey){
    if(e.key.toLowerCase()==='z'){e.preventDefault();smUndo();}
    return;
  }
  if(e.key===' '){e.preventDefault();playRaw();return;}
  if(e.key==='Escape'){S.smp.a=S.smp.b=null;smInvalidate();return;}
  const m=KEYS[e.key.toLowerCase()];
  if(m!==undefined&&!e.repeat){MAPN.add(m);previewOn(m);}
}
function smKeyUp(m){previewOff(m);}
/* ---- editing (destructive with undo + revert) ---- */
function remapPos(f,cutA,cutB){return f<=cutA?f:f>=cutB?f-(cutB-cutA):cutA;}
function editSample(s,fn,posFn){
  const b=BUF.get(s.id); if(!b) return;
  if(!b.orig) b.orig=b.ch.map(d=>d.slice());
  b.undo=b.undo||[];b.undo.push({ch:b.ch.map(d=>d.slice()),loop:s.loop&&Object.assign({},s.loop),slices:smOf(s).slices.slice(),zl:S.zones.filter(z=>z.sample===s.id).map(z=>[z.id,z.loop.s,z.loop.e,z.loop.xf])});
  if(b.undo.length>8)b.undo.shift();
  const nch=fn(b.ch.map(d=>d.slice()));
  b.ch=nch;b.peaks=peaksOf(nch,600);s.frames=nch[0].length;s.dur=s.frames/b.sr;
  if(posFn){
    if(s.loop){s.loop.s=posFn(s.loop.s);s.loop.e=posFn(s.loop.e);}
    smOf(s).slices=smOf(s).slices.map(posFn).filter((f,i,a)=>i===0||f>a[i-1]);
    S.zones.forEach(z=>{if(z.sample===s.id){z.loop.s=posFn(z.loop.s);z.loop.e=posFn(z.loop.e);}});
  }
  if(s.loop&&(s.loop.e>s.frames||s.loop.e-s.loop.s<64)) s.loop=null;
  S.zones.forEach(z=>{if(z.sample===s.id){z.loop.e=Math.min(z.loop.e||s.frames,s.frames);if(z.loop.s>=z.loop.e)z.loop.on=false;}});
  S.smp.a=S.smp.b=null;touchMap();smClampView();smInvalidate();smPanelRender();mapInvalidate();
}
function smUndo(){
  const s=smSample(),b=smBuf(); if(!s||!b||!b.undo||!b.undo.length){flash('Nothing to undo');return;}
  const u=b.undo.pop();b.ch=u.ch;b.peaks=peaksOf(b.ch,600);s.frames=b.ch[0].length;s.dur=s.frames/b.sr;
  s.loop=u.loop||null;smOf(s).slices=u.slices;
  u.zl.forEach(a=>{const z=zoneById(a[0]);if(z){z.loop.s=a[1];z.loop.e=a[2];z.loop.xf=a[3];}});
  touchMap();smClampView();smInvalidate();smPanelRender();flash('Undone');
}
function smRange(b){const n=b.ch[0].length;return S.smp.a!=null?[Math.min(S.smp.a,S.smp.b),Math.max(S.smp.a,S.smp.b)]:[0,n];}
function smOp(op,arg){
  const s=smSample(),b=smBuf(); if(!s||!b){flash('Pick a sample first');return;}
  const [a,c]=smRange(b),n=b.ch[0].length;
  if(op==='normalize') editSample(s,ch=>{let pk=0;ch.forEach(d=>{for(let i=a;i<c;i++)pk=Math.max(pk,Math.abs(d[i]));});if(pk>0){const g=.97/pk;ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=g;});}return ch;});
  else if(op==='gain'){const g=Math.pow(10,(arg||0)/20);editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=g;});return ch;});}
  else if(op==='fadein') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=(i-a)/Math.max(1,c-a);});return ch;});
  else if(op==='fadeout') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]*=1-(i-a)/Math.max(1,c-a);});return ch;});
  else if(op==='reverse') editSample(s,ch=>{ch.forEach(d=>{const seg=d.slice(a,c).reverse();d.set(seg,a);});return ch;});
  else if(op==='silence') editSample(s,ch=>{ch.forEach(d=>{for(let i=a;i<c;i++)d[i]=0;});return ch;});
  else if(op==='dc') editSample(s,ch=>{ch.forEach(d=>{let m=0;for(let i=a;i<c;i++)m+=d[i];m/=Math.max(1,c-a);for(let i=a;i<c;i++)d[i]-=m;});return ch;});
  else if(op==='trim'){if(S.smp.a==null){flash('Select the part to keep');return;}editSample(s,ch=>ch.map(d=>d.slice(a,c)),f=>clamp(f-a,0,c-a));}
  else if(op==='cut'){if(S.smp.a==null){flash('Select the part to cut');return;}if(c-a>=n-8){flash('That would remove everything');return;}
    editSample(s,ch=>ch.map(d=>{const o=new Float32Array(d.length-(c-a));o.set(d.subarray(0,a));o.set(d.subarray(c),a);return o;}),f=>remapPos(f,a,c));}
  else if(op==='revert'){
    if(!b.orig){flash('Nothing to revert');return;}
    b.ch=b.orig.map(d=>d.slice());b.undo=[];b.peaks=peaksOf(b.ch,600);s.frames=b.ch[0].length;s.dur=s.frames/b.sr;s.loop=null;smOf(s).slices=[];
    S.zones.forEach(z=>{if(z.sample===s.id&&z.loop.e>s.frames){z.loop.e=s.frames;}});
    touchMap();smClampView();smInvalidate();smPanelRender();flash('Reverted to the imported audio');
  }
}

/* ---------- samples tab: pool + inspector ---------- */
function synthWavetable(){
  const fl=2048,nf=8,d=new Float32Array(fl*nf);
  for(let f=0;f<nf;f++){
    const t=f/(nf-1);
    for(let i=0;i<fl;i++){
      const ph=i/fl;let v=0;
      for(let h=1;h<=40;h++){
        const saw=1/h,sq=h%2?1/h:0,tri=h%2?(((h-1)/2)%2?-1:1)/(h*h):0,sine=h===1?1:0;
        const w=t<.33?(1-t*3)*sine+t*3*tri:t<.66?(1-(t-.33)*3)*tri+(t-.33)*3*saw:(1-(t-.66)*3)*saw+(t-.66)*3*sq;
        v+=w*Math.sin(2*Math.PI*h*ph);
      }
      d[f*fl+i]=v;
    }
    let pk=0;for(let i=0;i<fl;i++)pk=Math.max(pk,Math.abs(d[f*fl+i]));for(let i=0;i<fl;i++)d[f*fl+i]*=.8/pk;
  }
  return d;
}
function synthBeat(sr){
  const bpm=100,beat=60/bpm,hits=[['k',0],['h',.5],['s',1],['h',1.5],['k',2],['k',2.5],['s',3],['h',3.5]],n=Math.floor(sr*beat*4),d=new Float32Array(n);
  hits.forEach(h=>{
    const o=Math.floor(h[1]*beat*sr);
    if(h[0]==='k'){const L=Math.floor(sr*.28);for(let i=0;i<L&&o+i<n;i++){const t=i/sr;d[o+i]+=Math.sin(2*Math.PI*(110*Math.exp(-t*14)+40)*t)*Math.exp(-t*11)*.95;}}
    else if(h[0]==='s'){const L=Math.floor(sr*.2);for(let i=0;i<L&&o+i<n;i++){const t=i/sr;d[o+i]+=((Math.random()*2-1)*.55+Math.sin(2*Math.PI*190*t)*.35)*Math.exp(-t*18);}}
    else{const L=Math.floor(sr*.07);let lp=0;for(let i=0;i<L&&o+i<n;i++){const t=i/sr,x=Math.random()*2-1;lp=x-lp*.7;d[o+i]+=lp*.22*Math.exp(-t*60);}}
  });
  return d;
}
function demoExtras(kind){
  const sr=44100;let s;
  if(kind==='wt'){s=addBuffer('Wavetable_Morph',[synthWavetable()],sr);s.root=60;s.fine=0;smOf(s).mode='wavetable';}
  else{s=addBuffer('Beat_Loop_100bpm',[synthBeat(sr)],sr);s.root=60;s.fine=0;const sm=smOf(s);sm.mode='slicer';sm.bars=1;sm.slices=detectTransients(s,60);}
  S.smp.sel=s.id;S.map.lastSample=s.id;return s;
}
function smLeftHTML(){
  return '<h2>Samples ('+S.samples.length+')</h2><div class="chips"><button type="button" class="btn" data-sa="imp">Import audio…</button><button type="button" class="btn" data-sa="demo">Demo set</button>'
    +'<button type="button" class="btn" data-sa="demowt">Demo wavetable</button><button type="button" class="btn" data-sa="demobeat">Demo beat</button></div>'
    +'<div class="pool pool2">'+S.samples.map(s=>{
      const sm=smOf(s),n=S.zones.filter(z=>z.sample===s.id).length;
      return '<div class="prow'+(s.id===S.smp.sel?' on':'')+'" data-sa="pick" data-s="'+s.id+'"><canvas width="64" height="22" data-pk="'+s.id+'" aria-hidden="true"></canvas><span class="pn" title="'+esc(s.name)+'">'+esc(s.name)+'</span>'
        +'<small>'+(sm.mode==='sampler'?'':sm.mode.slice(0,4)+' · ')+(sm.uni.on?'uni · ':'')+n+'z</small></div>';
    }).join('')+'</div>'
    +'<div class="chips"><button type="button" class="btn" data-sa="dup">Duplicate</button><button type="button" class="btn danger" data-sa="del">Remove</button></div>'
    +'<p class="hint">Tip: <kbd>Space</kbd> plays the raw sample or selection. The keys <kbd>A</kbd>–<kbd>K</kbd> play it through its mode and unison, so you hear exactly what the mapper will play.</p>';
}
function smLeftRender(){const el=$('#leftS');el.innerHTML=smLeftHTML();$$('canvas[data-pk]',el).forEach(c=>drawPeaks(c,c.dataset.pk,c.width,c.height));}
function sfield(label,key,v,o){o=o||{};return nf(label,'data-sk="'+key+'"'+(o.ms?' data-conv="ms"':''),v,o.min,o.max,o.step,o.sfx);}
function sselect(label,key,v,opts){return '<label class="f"><span>'+label+'</span><select data-sk="'+key+'">'+mopt(opts,v)+'</select></label>';}
function schk(label,key,v){return '<label class="f chk"><input type="checkbox" data-sk="'+key+'"'+(v?' checked':'')+'><span>'+label+'</span></label>';}
function smPanelHTML(){
  const s=smSample(); if(!s) return '<p class="empty">No sample selected.<br>Import audio, or press <b>Demo set</b>.</p>';
  const sm=smOf(s),b=BUF.get(s.id),sr=s.sr,md=sm.mode,u=sm.uni,used=S.zones.filter(z=>z.sample===s.id).length;
  const orig=sm.bars*barBeats(S.sig)*60/s.dur;
  let h='<div class="phead"><input type="text" class="pname" data-sk="s.name" value="'+esc(s.name)+'" aria-label="Sample name"><span class="badge">'+used+' zones</span></div>';
  h+=sec('Sample',sfield('Root key','s.root',s.root,{min:0,max:127,sfx:noteName(s.root)})+sfield('Fine tune','s.fine',s.fine||0,{min:-100,max:100,sfx:'cents'})
    +'<p class="hint">'+s.sr+' Hz · '+s.chn+' ch · '+s.dur.toFixed(2)+' s · '+s.frames.toLocaleString()+' frames</p><div class="chips"><button type="button" class="btn" data-sa="detect">Detect pitch</button></div>');
  h+=sec('Playback mode',sselect('Mode','sm.mode',md,MODES_S)+modeHTML(s,sm,orig));
  h+=sec('Sample unison',schk('Unison on','sm.uni.on',u.on)
    +(u.on?sselect('Type','sm.uni.mode',u.mode,[['detune','Detune (supersaw style)'],['octave','Octaves'],['fifth','Fifth and octave'],['chord','Custom chord']])
      +(u.mode==='chord'?'<label class="f"><span>Semitones</span><input type="text" data-sk="sm.uni.chord" value="'+esc(u.chord)+'"></label>':sfield('Voices','sm.uni.voices',u.voices,{min:1,step:1}))
      +sfield('Detune spread','sm.uni.detune',u.detune,{min:0,max:400,sfx:'cents'})+sfield('Stereo spread','sm.uni.spread',u.spread,{min:0,max:100,sfx:'%'})
      +(u.mode==='detune'?sfield('Centre blend','sm.uni.blend',u.blend,{min:0,max:100,sfx:'%'})+sselect('Spread curve','sm.uni.curve',u.curve,[['super','Supersaw (clustered)'],['linear','Even']]):'')
      +sfield('Random start','sm.uni.startRand',u.startRand,{min:0,max:200,sfx:'ms'})+sfield('Drift','sm.uni.drift',u.drift,{min:0,max:50,sfx:'cents'})
      +'<p class="hint">'+uniVoices(sm).length+' voices per note per zone'+(uniVoices(sm).length>32?'. That is a lot, expect heavy CPU use.':'.')+' Random start keeps the copies from combining into a hollow comb filter.</p>':'<p class="hint">Stack many copies of the sample, detuned and spread across the stereo field, like a supersaw but with your own recording.</p>'));
  h+=sec('Default loop',schk('Loop','loopOn',!!s.loop)+(s.loop?sfield('Loop start','s.loop.s',s.loop.s/sr*1000,{min:0,sfx:'ms',ms:1,step:1})+sfield('Loop end','s.loop.e',s.loop.e/sr*1000,{min:0,sfx:'ms',ms:1,step:1})
    +sfield('Crossfade','s.loop.xf',s.loop.xf/sr*1000,{min:0,sfx:'ms',ms:1,step:1})+'<div class="chips"><button type="button" class="btn" data-sa="findloop">Find a loop</button><button type="button" class="btn" data-sa="applyloop">Apply to its zones</button></div>':'')
    +'<p class="hint">New zones start with this loop. Drag the blue markers on the waveform.</p>');
  h+=sec('Edit (selection, or the whole sample)','<div class="chips">'+[['normalize','Normalize'],['fadein','Fade in'],['fadeout','Fade out'],['reverse','Reverse'],['silence','Silence'],['dc','Remove DC'],['trim','Trim to selection'],['cut','Cut selection']].map(o=>'<button type="button" class="btn" data-so="'+o[0]+'">'+o[1]+'</button>').join('')+'</div>'
    +'<label class="f"><span>Gain</span><input type="number" id="smGain" value="3" step="0.5"><em class="sfx">dB</em></label><div class="chips"><button type="button" class="btn" data-so="gain">Apply gain</button><button type="button" class="btn" data-so="undo">Undo</button><button type="button" class="btn danger" data-so="revert">Revert all</button></div>'
    +'<p class="hint">Drag on the waveform to select. Selections snap to zero crossings so cuts do not click (hold Shift to skip). '+(b&&b.undo?b.undo.length:0)+' undo steps.</p>');
  return h;
}
function modeHTML(s,sm,orig){
  const md=sm.mode;
  if(md==='speedkeep') return sfield('Speed','sm.sk.speed',sm.sk.speed,{min:10,max:400,sfx:'%'})+sfield('Grain size','sm.sk.grain',sm.sk.grain,{min:10,max:200,sfx:'ms'})
    +sselect('Quality','sm.sk.quality',sm.sk.quality,[['wsola','Clean (WSOLA)'],['ola','Fast (plain OLA)']])+schk('Follow the project tempo','sm.sk.sync',sm.sk.sync)
    +(sm.sk.sync?sfield('Bars in this sample','sm.bars',sm.bars,{min:.25,max:64,step:.25})+'<p class="hint">Original tempo: '+orig.toFixed(1)+' BPM, project: '+S.bpm+' BPM, so it plays at '+(S.bpm/orig*100).toFixed(0)+'% speed.</p>':'')
    +'<p class="hint">Playing higher or lower notes changes the pitch but not the speed. Speed changes the length but not the pitch.</p>';
  if(md==='slicer') return sfield('Sensitivity','sm.sens',sm.sens,{min:0,max:100,sfx:'%'})+'<div class="chips"><button type="button" class="btn" data-sa="detslices">Detect slices</button><button type="button" class="btn" data-sa="chop">Chop evenly</button><input type="number" id="smChop" value="8" min="2" max="256" style="width:56px" aria-label="Number of slices"><button type="button" class="btn" data-sa="clearslices">Clear</button></div>'
    +'<p class="hint">'+sm.slices.length+' slices. Use the Slice tool above, then click the waveform to add a marker. Drag markers to move them, Alt-click removes one.</p>'
    +'<label class="f"><span>First key</span><input type="number" id="smSliceKey" value="36" min="0" max="127"><em class="sfx">'+noteName(36)+'</em></label><div class="chips"><button type="button" class="btn" data-sa="mapslices">Map slices to keys</button></div>'
    +'<p class="hint">Each slice becomes a zone on its own key, in the group selected in the mapper.</p>';
  if(md==='wavetable') return sselect('Frame size','sm.wt.frame',sm.wt.frame,[256,512,1024,2048,4096].map(x=>[x,x+' samples']))
    +'<p class="hint">'+Math.floor(s.frames/sm.wt.frame)+' frames. The faint lines on the waveform show where each frame starts.</p>'
    +sfield('Position','sm.wt.pos',sm.wt.pos,{min:0,max:100,sfx:'%'})
    +'<label class="f"><span>Follow tag</span><select data-sk="sm.wt.tag"><option value="">— set by hand —</option>'+S.tags.map(t=>'<option value="'+t.id+'"'+(sm.wt.tag===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>'
    +schk('Sweep to another position','sweepOn',sm.wt.pos2>=0)+(sm.wt.pos2>=0?sfield('Sweep to','sm.wt.pos2',sm.wt.pos2,{min:0,max:100,sfx:'%'})+sfield('Sweep time','sm.wt.sweep',sm.wt.sweep,{min:50,max:20000,sfx:'ms'}):'');
  if(md==='granular') return sfield('Grain size','sm.gr.size',sm.gr.size,{min:10,max:500,sfx:'ms'})+sfield('Density','sm.gr.density',sm.gr.density,{min:1,max:200,sfx:'/s'})
    +sfield('Position','sm.gr.pos',sm.gr.pos,{min:0,max:100,sfx:'%'})+sfield('Position spread','sm.gr.spread',sm.gr.spread,{min:0,max:100,sfx:'%'})+sfield('Pitch jitter','sm.gr.jitter',sm.gr.jitter,{min:0,max:600,sfx:'cents'})
    +sselect('Grain shape','sm.gr.shape',sm.gr.shape,[['hann','Smooth (Hann)'],['tri','Triangle'],['rect','Flat with short fades']])+'<p class="hint">Plays a sustained cloud of tiny pieces from around the position. Great for pads and textures.</p>';
  return '<p class="hint">Plain sample playback: pitch and speed move together, with the interpolation you choose in the mapper.</p>';
}
function smPanelRender(){smLeftRender();$('#rbodyS').innerHTML=smPanelHTML();}
function selectSample(id){S.smp.sel=id;S.smp.a=S.smp.b=null;S.map.lastSample=id;smClampView();smFit();smPanelRender();smInvalidate();}
/* ---- events ---- */
$('#leftS').addEventListener('click',e=>{
  const b=e.target.closest('[data-sa]'); if(!b) return; const a=b.dataset.sa;
  if(a==='pick'){selectSample(b.dataset.s);}
  else if(a==='imp'){$('#fileAudio').value='';$('#fileAudio').click();}
  else if(a==='demo'){ensureAudio();demoSamples();touchMap();if(!S.smp.sel&&S.samples[0])S.smp.sel=S.samples[0].id;smPanelRender();smFit();flash('Demo set loaded');}
  else if(a==='demowt'){const s=demoExtras('wt');touchMap();smPanelRender();smFit();flash('Wavetable added. Play it with the keys A–K.');}
  else if(a==='demobeat'){const s=demoExtras('beat');touchMap();smPanelRender();smFit();flash('Beat loop added, '+smOf(s).slices.length+' slices found.');}
  else if(a==='dup'){
    const s=smSample(),bf=smBuf();if(!s)return;
    const n=addBuffer(s.name+' copy',bf.ch.map(d=>d.slice()),s.sr);n.root=s.root;n.fine=s.fine;n.loop=s.loop&&Object.assign({},s.loop);n.sm=JSON.parse(JSON.stringify(smOf(s)));selectSample(n.id);
  }
  else if(a==='del'){
    const s=smSample();if(!s)return;delZones(S.zones.filter(z=>z.sample===s.id).map(z=>z.id));
    S.samples=S.samples.filter(x=>x.id!==s.id);BUF.delete(s.id);S.smp.sel=S.samples[0]?S.samples[0].id:null;touchMap();smPanelRender();smFit();
  }
});
$('#fileAudio').addEventListener('change',()=>{if(S.view==='samples'||S.view==='sound'){setTimeout(()=>{if(!S.smp.sel&&S.samples.length)S.smp.sel=S.samples[S.samples.length-1].id;smPanelRender();smFit();},500);}});
$('#rightS').addEventListener('click',e=>{
  const so=e.target.closest('[data-so]');
  if(so){const o=so.dataset.so;if(o==='undo')smUndo();else if(o==='gain')smOp('gain',parseFloat($('#smGain').value)||0);else smOp(o);return;}
  const b=e.target.closest('[data-sa]'); if(!b) return; const a=b.dataset.sa,s=smSample(); if(!s) return; const sm=smOf(s);
  if(a==='detect'){const p=detectPitch(s.id);if(!p){flash('Could not find a clear pitch');return;}s.root=p.midi;s.fine=-p.cents;touchMap();smPanelRender();flash('Detected '+noteName(p.midi)+(p.cents?' ('+(p.cents>0?'+':'')+p.cents+' cents)':''));}
  else if(a==='findloop'){const z=mkZone({sample:s.id,loop:{on:false,s:0,e:s.frames,xf:0,xcurve:'power',pp:false}});if(findLoop(z)){s.loop={s:z.loop.s,e:z.loop.e,xf:z.loop.xf};touchMap();smPanelRender();smInvalidate();flash('Loop placed on zero crossings');}else flash('That sample is too short to loop');}
  else if(a==='applyloop'){
    S.zones.forEach(z=>{if(z.sample===s.id&&s.loop){z.loop.on=true;z.loop.s=s.loop.s;z.loop.e=s.loop.e;z.loop.xf=s.loop.xf;}});touchMap();flash('Loop applied to '+S.zones.filter(z=>z.sample===s.id).length+' zones');
  }
  else if(a==='detslices'){sm.slices=detectTransients(s,sm.sens);touchMap();smPanelRender();smInvalidate();flash(sm.slices.length+' slices found');}
  else if(a==='chop'){const n=clamp(parseInt($('#smChop').value,10)||8,2,256);sm.slices=[];for(let i=0;i<n;i++)sm.slices.push(Math.round(i*s.frames/n));touchMap();smPanelRender();smInvalidate();}
  else if(a==='clearslices'){sm.slices=[];touchMap();smPanelRender();smInvalidate();}
  else if(a==='mapslices'){mapSlices(s,clamp(parseInt($('#smSliceKey').value,10)||36,0,127));}
});
function mapSlices(s,key0){
  const sm=smOf(s); if(!sm.slices.length){flash('No slices yet. Detect or chop first.');return;}
  const grp=ensureGroup();
  delZones(S.zones.filter(z=>z.sample===s.id&&z.slice!==undefined).map(z=>z.id));
  const made=[];
  sm.slices.forEach((f,i)=>{
    const k=key0+i; if(k>127) return;
    const nx=sm.slices[i+1],z=addZoneFor(s.id,k,k,{group:grp,root:k,keytrack:false,oneshot:true,start:Math.round(f/s.sr*1000),end:nx?Math.round(nx/s.sr*1000):0,slice:i,release:30});
    z.loop.on=false;made.push(z);
  });
  S.map.sel=made.map(z=>z.id);touchMap();mapInvalidate();flash(made.length+' slices mapped from '+noteName(key0)+' in the "'+grp+'" group. Open the Mapping tab to play them.');
}
function smApply(t,v){
  const s=smSample(); if(!s) return;
  const sm=smOf(s),key=t.dataset.sk,root={s,sm};
  let val=v; if(t.dataset.conv==='ms') val=Math.round(v/1000*s.sr);
  if(key==='loopOn'){s.loop=v?(s.loop||{s:Math.floor(s.frames*.3),e:Math.floor(s.frames*.9),xf:Math.min(Math.floor(s.sr*.1),Math.floor(s.frames*.1))}):null;touchMap();smInvalidate();return;}
  if(key==='sweepOn'){sm.wt.pos2=v?100:-1;touchMap();smInvalidate();return;}
  setPath(root,key,val);
  if(key==='s.name'){return;}
  if(key==='sm.mode'&&val==='slicer'&&!sm.slices.length) sm.slices=detectTransients(s,sm.sens);
  touchMap();smInvalidate();
}
$('#rbodyS').addEventListener('input',e=>{
  const t=e.target; if(!t.dataset.sk) return;
  if(t.type==='checkbox'||t.tagName==='SELECT') return;
  let v=t.type==='number'||t.type==='range'?parseFloat(t.value):t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  smApply(t,v);
  const sfx=t.parentElement.querySelector('.sfx');if(sfx&&t.dataset.sk==='s.root')sfx.textContent=noteName(v);
});
$('#rbodyS').addEventListener('change',e=>{
  const t=e.target; if(!t.dataset.sk) return;
  let v=t.type==='checkbox'?t.checked:t.tagName==='SELECT'&&/^\d+$/.test(t.value)&&t.dataset.sk==='sm.wt.frame'?parseInt(t.value,10):t.type==='number'?parseFloat(t.value):t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  smApply(t,v);smPanelRender();smLeftRender();
});
/* toolbar */
$('#smToolSel').addEventListener('click',()=>{S.smp.tool='select';smToolSync();});
$('#smToolSlice').addEventListener('click',()=>{S.smp.tool='slice';smToolSync();});
function smToolSync(){$('#smToolSel').setAttribute('aria-pressed',String(S.smp.tool==='select'));$('#smToolSlice').setAttribute('aria-pressed',String(S.smp.tool==='slice'));smInvalidate();}
$('#smRaw').addEventListener('click',()=>playRaw());
$('#smProc').addEventListener('click',()=>{const s=smSample();if(!s)return;previewOff(s.root);previewOn(s.root);setTimeout(()=>previewOff(s.root),1800);});
$('#smStop').addEventListener('click',()=>previewStopAll());
$('#smFit').addEventListener('click',()=>smFit());
$('#smZoomSel').addEventListener('click',()=>{const b=smBuf();if(!b||S.smp.a==null)return;const a=Math.min(S.smp.a,S.smp.b),c=Math.max(S.smp.a,S.smp.b);S.smp.fpp=(c-a)/SM.W;S.smp.sx=a;smClampView();smInvalidate();});

/* ---------- Sound tab: samples, mapping, groups and lists in one calm view ----------
   It reuses the mapper (zone grid, zone inspector) and the sample editor (waveform, sample inspector):
   their parts are moved into this view, so all their existing behaviour keeps working. */
S.snd={focus:'zone',layout:'split',split:.56,lastSel:'',fold:{}};
function inMapView(){return S.view==='map'||S.view==='sound';}
function inSmpView(){return S.view==='samples'||(S.view==='sound'&&S.snd.layout!=='map');}
/* ---- move the existing pieces into the Sound view ---- */
(function(){
  const top=$('#snTop'),bot=$('#snBot');
  top.insertBefore($('#centerM .mapmain'),top.firstChild);
  bot.appendChild($('#centerS .mapmain'));
  $('#snAutoSlot').appendChild($('#mapAuto'));
  const tm=$('#snToolsMenu');
  const row=(label,...els)=>{const d=document.createElement('div');d.className='mrow';if(label){const s=document.createElement('span');s.className='ml';s.textContent=label;d.appendChild(s);}els.forEach(e=>d.appendChild(e));tm.appendChild(d);return d;};
  ['mapSpread','mapStack','mapFill'].forEach(id=>{const b=$('#'+id);b.className='mi';tm.appendChild(b);});
  const xf=$('#mapXfade');xf.className='mi';row('',xf,$('#mapXf').parentElement);
  const sep=()=>{const d=document.createElement('div');d.className='msep';tm.appendChild(d);};
  sep();row('',$('#mapInterp').parentElement);row('',$('#mapVel').parentElement);row('',$('#mapZoom').parentElement);
  sep();const pn=$('#mapPanic');pn.className='mi';tm.appendChild(pn);row('',$('#mapVoices'));
  $('#snTitle').after($('#mapMsg'));
  /* waveform bar */
  const ws=$('#snWaveSlot');[$('#smRaw'),$('#smProc'),$('#smStop')].forEach(b=>{b.classList.add('ghost');ws.appendChild(b);});
  $('#smRaw').textContent='▶ Play';$('#smProc').textContent='▶ As mapped';
  ws.appendChild($('#smMsg'));
  const em=$('#snEditMenu');
  const seg=$('#smToolSel').parentElement;const r1=document.createElement('div');r1.className='mrow';r1.innerHTML='<span class="ml">Click does</span>';r1.appendChild(seg);em.appendChild(r1);
  [$('#smFit'),$('#smZoomSel')].forEach(b=>{b.className='mi';em.appendChild(b);});
  const inf=document.createElement('div');inf.className='mrow';inf.appendChild($('#smInfo'));em.appendChild(inf);
  /* inspectors: zone and sample panels move into the Sound inspector */
  const rn=$('#rightN');
  [$('#rightM'),$('#rightS')].forEach(a=>{a.className='snins';a.hidden=true;const h=a.querySelector('h2');if(h)h.remove();rn.appendChild(a);});
  rn.insertBefore($('#rightM'),$('#snInsList'));
})();
/* ---- menus ---- */
function snMenu(btn,menu){
  btn.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;$$('.snmenu').forEach(m=>{m.hidden=true;});menu.hidden=!open;btn.setAttribute('aria-expanded',String(open));});
}
snMenu($('#snTools'),$('#snToolsMenu'));snMenu($('#snEdit'),$('#snEditMenu'));
document.addEventListener('click',e=>{if(!e.target.closest('.snmenu')&&!e.target.closest('#snTools,#snEdit'))$$('.snmenu').forEach(m=>{m.hidden=true;});});
$('#snToolsMenu').addEventListener('click',e=>{if(e.target.closest('button.mi'))$('#snToolsMenu').hidden=true;});
/* ---- layout: map / split / wave, and the draggable divider ---- */
function snLayout(l){
  if(l)S.snd.layout=l;l=S.snd.layout;
  $$('[data-lay]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lay===l)));
  $('#snTop').hidden=l==='wave';$('#snBot').hidden=l==='map';$('#snSplit').hidden=l!=='split';
  $('#snTop').style.flex=l==='split'?S.snd.split+' 1 0':'1 1 0';$('#snBot').style.flex=l==='split'?(1-S.snd.split)+' 1 0':'1 1 0';
  requestAnimationFrame(()=>{if(l!=='wave'){mapSize();mapStart();}if(l!=='map'){smStart();}});
}
$$('[data-lay]').forEach(b=>b.addEventListener('click',()=>snLayout(b.dataset.lay)));
$('#snSplit').addEventListener('pointerdown',e=>{
  const body=$('#snBody').getBoundingClientRect();$('#snSplit').setPointerCapture(e.pointerId);
  const mv=ev=>{S.snd.split=clamp((ev.clientY-body.top)/body.height,.18,.85);snLayout();};
  const up=()=>{$('#snSplit').removeEventListener('pointermove',mv);$('#snSplit').removeEventListener('pointerup',up);};
  $('#snSplit').addEventListener('pointermove',mv);$('#snSplit').addEventListener('pointerup',up);
});
$('#snSplit').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){S.snd.split=clamp(S.snd.split+(e.key==='ArrowUp'?-.05:.05),.18,.85);snLayout();e.preventDefault();}});
$('#snTop').addEventListener('dblclick',e=>{if(e.target.closest('.mapfoot'))snLayout(S.snd.layout==='map'?'split':'map');});
/* ---- tips on demand ---- */
$('#tipsBtn').addEventListener('click',()=>{const on=!document.body.classList.contains('tips');document.body.classList.toggle('tips',on);$('#tipsBtn').setAttribute('aria-pressed',String(on));});
/* ---- left column: lists, groups, samples ---- */
mapLeftHTML=function(){
  const cur=S.map.group,cl=curList(),f=S.snd.focus;
  const fo=S.snd.fold,sh=(t,add)=>'<div class="snh"><button type="button" class="snfold" data-fold="'+t+'" aria-expanded="'+!fo[t]+'">'+t+'</button>'+(add||'')+'</div>',body=(t,html)=>fo[t]?'':html;
  let h=sh('Lists','<button type="button" class="snadd" data-ls="addList" title="New list" aria-label="New list">+</button>');
  h+=body('Lists',S.lists.length?'<div class="snlist">'+S.lists.map(l=>'<button type="button" class="snrow'+(l===cl?' cur':'')+(f==='list'&&l===cl?' on':'')+'" data-sn="list" data-id="'+l.id+'"><span class="nm">'+esc(l.name)+'</span><small>'+((S.banks[l.bank]||{}).letter||'?')+(listsInBank(l.bank).indexOf(l)+1)+'</small></button>').join('')+'</div>'
    :'<p class="snnone">No lists. Everything plays.</p>');
  h+=sh('Groups','<button type="button" class="snadd" data-ma="addgrp" title="New group" aria-label="New group">+</button>');
  h+=body('Groups','<div class="snlist">'+S.groups.map(g=>{
    const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
    return '<div class="snrow grow'+(g===cur?' cur':'')+(f==='group'&&g===cur?' on':'')+(c.mute?' muted':'')+'" data-ma="grp" data-g="'+esc(g)+'" role="button" tabindex="0"><i class="sw" style="background:'+c.color+'"></i><span class="nm">'+esc(g)+'</span>'
      +'<button type="button" class="ms'+(c.mute?' on':'')+'" data-ma="gmute" data-g="'+esc(g)+'" title="Mute" aria-label="Mute '+esc(g)+'" aria-pressed="'+c.mute+'">M</button>'
      +'<button type="button" class="ms'+(c.solo?' on':'')+'" data-ma="gsolo" data-g="'+esc(g)+'" title="Solo" aria-label="Solo '+esc(g)+'" aria-pressed="'+c.solo+'">S</button><small>'+n+'</small></div>';
  }).join('')+'</div>');
  h+=sh('Samples','<button type="button" class="snadd" data-ma="imp" title="Import audio" aria-label="Import audio">+</button>');
  h+=body('Samples',S.samples.length?'<div class="snlist">'+S.samples.map(s=>{
      const used=S.zones.some(z=>z.sample===s.id);
      return '<div class="snrow prow'+(s.id===S.smp.sel?' cur':'')+(f==='sample'&&s.id===S.smp.sel?' on':'')+(used?'':' unused')+'" draggable="true" data-ma="smp" data-s="'+s.id+'" role="button" tabindex="0" title="Drag onto the map to make a zone"><span class="nm">'+esc(s.name)+'</span><small>'+noteName(s.root)+'</small></div>';
    }).join('')+'</div>'
    :'<p class="snnone">No samples yet.</p>');
  return h;
};
$('#leftM').addEventListener('click',e=>{
  if(S.view!=='sound') return;
  const fb=e.target.closest('[data-fold]');if(fb){const k=fb.dataset.fold;S.snd.fold[k]=!S.snd.fold[k];mapLeftRender();snShow();return;}
  const li=e.target.closest('[data-sn="list"]');
  if(li){const l=S.lists.find(x=>x.id===li.dataset.id);if(!l)return;const bt=bankTag(),lt=listTag();if(bt&&lt){setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}snFocus('list');return;}
  const b=e.target.closest('[data-ma]');if(!b||e.target.closest('.ms'))return;
  if(b.dataset.ma==='grp')snFocus('group');
  else if(b.dataset.ma==='smp'){S.smp.sel=b.dataset.s;S.smp.a=S.smp.b=null;smFit();smPanelRender();snFocus('sample');}
});
$('#leftM').addEventListener('keydown',e=>{if(S.view==='sound'&&(e.key==='Enter'||e.key===' ')&&e.target.closest('.snrow[role=button]')){e.preventDefault();e.target.click();}});
document.addEventListener('click',e=>{if(S.view==='sound'&&e.target.closest('[data-ls]'))setTimeout(()=>{if(e.target.closest('[data-ls="addList"]'))S.snd.focus='list';soundRefresh();},0);});
/* ---- focus decides what the inspector shows ---- */
function snFocus(f){S.snd.focus=f;S.snd.lastSel=selZones().map(z=>z.id).join(',');soundRefresh();}
const mapRightRender0=mapRightRender;
mapRightRender=function(){
  mapRightRender0();
  if(S.view!=='sound') return;
  const zs=selZones(),sig=zs.map(z=>z.id).join(','),changed=sig!==S.snd.lastSel;S.snd.lastSel=sig;
  if(zs.length&&(changed||S.snd.focus==='zone')){S.snd.focus='zone';if(zs[0].sample!==S.smp.sel&&sampleById(zs[0].sample)){S.smp.sel=zs[0].sample;S.smp.a=S.smp.b=null;smFit();smPanelRender();}}
  else if(!zs.length&&S.snd.focus==='zone'&&changed) S.snd.focus=S.map.group?'group':'zone';
  snShow();
};
function snShow(keepIns){
  const f=S.snd.focus;
  $('#rightM').hidden=f!=='zone';$('#rightS').hidden=f!=='sample';$('#snInsGroup').hidden=f!=='group';$('#snInsList').hidden=f!=='list';
  if(!keepIns){if(f==='group')$('#snInsGroup').innerHTML=snGroupHTML();
  if(f==='list')$('#snInsList').innerHTML=snListHTML();}
  const g=S.map.group,n=S.zones.filter(z=>z.group===g).length;
  $('#snTitle').textContent=g||'No group';$('#snSub').textContent=g?n+' zone'+(n===1?'':'s'):'';
  const s=smSample();$('#snWaveTitle').textContent=s?s.name:'No sample';$('#snWaveSub').textContent=s?s.dur.toFixed(2)+' s · '+noteName(s.root)+(smOf(s).mode!=='sampler'?' · '+smOf(s).mode:''):'';
  $('#snEmpty').hidden=S.samples.length>0||S.zones.length>0;
  $$('#leftM .snrow.on').forEach(r=>r.classList.remove('on'));
}
function soundRefresh(keepIns){mapLeftRender();if(keepIns){snShow(true);}else{if(S.view==='sound'){$('#rightM').hidden=true;}mapRightRender();if(S.snd.focus!=='zone')snShow();}mapInvalidate();smInvalidate();
  /* highlight the focused row */
  const f=S.snd.focus,sel=f==='list'?'[data-sn="list"].cur':f==='group'?'.grow.cur':f==='sample'?'.prow.cur':null;if(sel){const r=$('#leftM '+sel);if(r)r.classList.add('on');}}
function soundEnter(reset){
  if(reset){S.snd.focus='zone';S.snd.lastSel='';}
  if(!S.map.group&&S.groups.length)S.map.group=S.groups[0];
  if(!smSample()&&S.samples[0])S.smp.sel=S.samples[0].id;
  smPanelRender();soundRefresh();snLayout();
  requestAnimationFrame(()=>{mapSize();mapStart();smSize();smFit();smStart();});
}
/* ---- calmer zone inspector: the essentials, the rest under More ---- */
mapRightHTML=function(){
  const zs=selZones();
  if(!zs.length) return '<p class="empty">Click a zone on the map to edit it.<br>Drag a sample from the left onto the map to make one.</p>';
  const z=zs[0],multi=zs.length>1,sm=sampleById(z.sample),sr=sm?sm.sr:44100,msv=f=>f/sr*1000;
  let h='<div class="snhead"><b>'+(multi?zs.length+' zones':esc(sm?sm.name:'Zone'))+'</b><small>'+esc(z.group)+'</small></div>';
  h+=zfield('Root key','root',z.root,{min:0,max:127,sfx:noteName(z.root)})
    +zfield('Lowest key','lo',z.lo,{min:0,max:127,sfx:noteName(z.lo)})+zfield('Highest key','hi',z.hi,{min:0,max:127,sfx:noteName(z.hi)})
    +zfield('Softest','vlo',z.vlo,{min:0,max:127,sfx:'vel'})+zfield('Hardest','vhi',z.vhi,{min:0,max:127,sfx:'vel'})
    +zfield('Volume','vol',z.vol,{min:-60,max:24,step:.5,sfx:'dB'})+zfield('Pan','pan',z.pan,{min:-100,max:100,sfx:'L–R'})
    +zchk('Loop','loop.on',z.loop.on);
  const more=(t,b)=>'<details class="snmore" data-sec="z:'+t+'"'+(closed.has('z:'+t)?'':' open')+'><summary>'+t+'</summary><div>'+b+'</div></details>';
  h+='<div class="snmores">';
  if(z.loop.on) h+=more('Loop',zfield('Loop start','loop.s',msv(z.loop.s),{min:0,step:1,sfx:'ms',ms:1})+zfield('Loop end','loop.e',msv(z.loop.e),{min:0,step:1,sfx:'ms',ms:1})
      +zfield('Crossfade','loop.xf',msv(z.loop.xf),{min:0,step:1,sfx:'ms',ms:1})+zsel('Fade curve','loop.xcurve',z.loop.xcurve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
      +zchk('Ping-pong','loop.pp',z.loop.pp)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="findloop">Find a loop</button></div>'));
  h+=more('Sound',zfield('Tune','tune',z.tune,{min:-2400,max:2400,step:1,sfx:'cents'})+zsel('Interpolation','interp',z.interp,GINT)+zchk('Follow the keyboard','keytrack',z.keytrack)
      +zfield('Attack','attack',z.attack,{min:0,max:10000,sfx:'ms'})+zfield('Release','release',z.release,{min:0,max:20000,sfx:'ms'})+zchk('One-shot (ignore key up)','oneshot',z.oneshot)
      +'<p class="hint">Interpolation is how the sample is pitched: nearest is gritty, linear soft, cubic clean, sinc cleanest.</p>');
  h+=more('Start and end',zfield('Start','start',z.start,{min:0,max:60000,step:1,sfx:'ms'})+zfield('End (0 = whole)','end',z.end,{min:0,max:600000,step:1,sfx:'ms'})
      +zfield('Soft notes start later','vstart',z.vstart,{min:0,max:5000,step:1,sfx:'ms'})+zchk('Reverse','rev',z.rev));
  h+=more('Crossfades',zfield('Key fade in','fadeLo',z.fadeLo,{min:0,max:127,sfx:'keys'})+zfield('Key fade out','fadeHi',z.fadeHi,{min:0,max:127,sfx:'keys'})
      +zfield('Velocity fade in','vfadeLo',z.vfadeLo,{min:0,max:127})+zfield('Velocity fade out','vfadeHi',z.vfadeHi,{min:0,max:127})
      +zsel('Fade curve','curve',z.curve,[['power','Equal power'],['linear','Linear'],['s','S-curve']]));
  h+=more('Variation',zfield('Round robin position','seq',z.seq,{min:1,max:999})+zfield('Random tune','hum.tune',z.hum.tune,{min:0,max:200,sfx:'cents'})
      +zfield('Random volume','hum.vol',z.hum.vol,{min:0,max:12,step:.5,sfx:'dB'})+zfield('Random start','hum.start',z.hum.start,{min:0,max:500,sfx:'ms'}));
  h+=more('Sample and group','<label class="f"><span>Sample</span><select data-zk="sample">'+mopt(S.samples.map(s=>[s.id,s.name]),z.sample)+'</select></label>'
      +'<label class="f"><span>Group</span><select data-zk="group">'+mopt(S.groups.map(g=>[g,g]),z.group)+'</select></label>'
      +zchk('Mute zone','mute',z.mute)+zchk('Solo zone','solo',z.solo)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="detect">Detect pitch</button></div>'));
  h+='</div><div class="snacts"><button type="button" class="btn" data-mz="dup">Duplicate</button><button type="button" class="btn danger" data-mz="del">Delete</button></div>';
  return h;
};
/* sample inspector: keep the first two sections open, fold the rest */
['Sample unison','Default loop','Edit (selection, or the whole sample)'].forEach(t=>closed.add(t));
document.addEventListener('toggle',e=>{const d=e.target;if(d.classList&&d.classList.contains('snmore')){if(d.open)closed.delete(d.dataset.sec);else closed.add(d.dataset.sec);}},true);
['z:Loop','z:Sound','z:Start and end','z:Crossfades','z:Variation','z:Sample and group'].forEach(t=>closed.add(t));
/* ---- group inspector ---- */
function snGroupHTML(){
  const g=S.map.group;if(!g)return '<p class="empty">Pick a group on the left.</p>';
  const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
  return '<div class="snhead"><b>Group</b><small>'+n+' zones</small></div>'
    +'<label class="f"><span>Name</span><input type="text" data-sg="name" value="'+esc(g)+'"></label>'
    +'<label class="f"><span>Plays</span><select data-sg="mode">'+mopt(MODES,c.mode)+'</select></label>'
    +nf('Volume','data-sg="vol"',c.vol,-48,24,.5,'dB')+nf('Pan','data-sg="pan"',c.pan,-100,100,1,'L–R')+nf('Tune','data-sg="tune"',c.tune,-2400,2400,1,'cents')
    +snEnvHTML(c)
    +'<div class="snmores"><details class="snmore"><summary>More</summary><div>'
    +nf('Choke group','data-sg="choke"',c.choke,0,999,1)+'<p class="hint">Groups with the same choke number cut each other off, like open and closed hi-hats.</p>'
    +nf('Voice limit','data-sg="voices"',c.voices,0,9999,1)+'<p class="hint">0 means unlimited.</p>'
    +'<label class="f"><span>Velocity curve</span><input type="range" data-sg="velcurve" min="0.2" max="2.5" step="0.05" value="'+c.velcurve+'"></label>'
    +'<label class="f"><span>Interpolation</span><select data-sg="interp">'+mopt(GINT,c.interp)+'</select></label>'
    +'<label class="f"><span>Colour</span><input type="color" data-sg="color" value="'+c.color+'"></label>'
    +'</div></details></div><div class="snacts"><button type="button" class="btn" data-sga="selall">Select its zones</button><button type="button" class="btn danger" data-sga="del">Delete group</button></div>';
}
/* ---- per-note ADSR for the group (the engine runs one per note) ---- */
const ENV_DEF={on:false,a:5,d:300,s:100,r:300,tags:{}};
const envOf=c=>{const e=Object.assign({},ENV_DEF,c.env||{});e.tags=Object.assign({},e.tags||{});return e;};
function envSvg(e){
  const T=x=>Math.sqrt(Math.max(0,x)),a=T(e.a),d=T(e.d),r=T(e.r),hold=Math.max(12,(a+d+r)*.35),tot=a+d+hold+r||1,W=220,H=54,X=v=>4+v/tot*(W-8),Y=v=>H-4-v*(H-8),s=e.s/100;
  const pts=[[0,0],[a,1],[a+d,s],[a+d+hold,s],[tot,0]].map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' ');
  return '<svg class="envsvg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Envelope shape"><polyline points="'+pts+'"/></svg>';
}
function snEnvHTML(c){
  const e=envOf(c),knobs=[['','no knob']].concat(S.tags.filter(t=>!t.sys&&t.kind==='number').map(t=>[t.id,t.name]));
  const row=(k,l,mx,u)=>'<div class="envrow"><label class="f"><span>'+l+'</span><input type="number" data-se="'+k+'" min="0" max="'+mx+'" step="1" value="'+e[k]+'"'+(e.tags[k]?' disabled':'')+'><em class="sfx">'+u+'</em></label>'
    +'<select data-setag="'+k+'" aria-label="Knob for '+l+'">'+mopt(knobs,e.tags[k]||'')+'</select></div>';
  return '<div class="snenv"><label class="f chk"><input type="checkbox" data-se="on"'+(e.on?' checked':'')+'><span>Envelope (ADSR, one per note)</span></label>'
    +(e.on?envSvg(e)+row('a','Attack',10000,'ms')+row('d','Decay',10000,'ms')+row('s','Sustain',100,'%')+row('r','Release',10000,'ms')
      +'<p class="hint">Replaces the zones\' own attack and release in this group. A knob linked here sets 0–10 s (or 0–100 % for sustain), and held notes follow it live.</p>':'')+'</div>';
}
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,g=S.map.group;if(!g||!(t.dataset.se||t.dataset.setag))return;
  const c=gcfg(g),en=envOf(c);
  if(t.dataset.se==='on')en.on=t.checked;
  else if(t.dataset.se){const v=parseFloat(t.value);en[t.dataset.se]=isFinite(v)?Math.max(0,Math.min(+t.max,v)):ENV_DEF[t.dataset.se];}
  else{if(t.value)en.tags[t.dataset.setag]=t.value;else delete en.tags[t.dataset.setag];}
  c.env=en;touchMap();$('#snInsGroup').innerHTML=snGroupHTML();
});
$('#snInsGroup').addEventListener('input',e=>{
  const t=e.target,k=t.dataset.sg,g=S.map.group;if(!k||!g||k==='name')return;   /* envelope fields use data-se */
  const c=gcfg(g);c[k]=t.type==='number'||t.type==='range'?parseFloat(t.value)||0:t.value;
  if(k==='color'){mapInvalidate();mapLeftRender();}else touchMap();
});
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.sg,old=S.map.group;if(k!=='name'||!old)return;
  const nn=t.value.trim();if(!nn||S.groups.indexOf(nn)>=0){t.value=old;flash('Group names must be unique');return;}
  S.groups[S.groups.indexOf(old)]=nn;S.gset[nn]=S.gset[old];delete S.gset[old];
  S.zones.forEach(z=>{if(z.group===old)z.group=nn;});S.lists.forEach(l=>{l.groups=(l.groups||[]).map(x=>x===old?nn:x);});
  S.map.group=nn;touchMap();soundRefresh(true);
});
$('#snInsGroup').addEventListener('click',e=>{
  const b=e.target.closest('[data-sga]');if(!b)return;const n=S.map.group;if(!n)return;
  if(b.dataset.sga==='selall'){S.map.sel=S.zones.filter(z=>z.group===n).map(z=>z.id);mapUI();mapInvalidate();return;}
  delZones(S.zones.filter(z=>z.group===n).map(z=>z.id));
  S.groups=S.groups.filter(x=>x!==n);S.lists.forEach(l=>{l.groups=(l.groups||[]).filter(x=>x!==n);});
  delete S.gset[n];S.map.group=S.groups[0]||null;touchMap();soundRefresh();
});
/* ---- list inspector ---- */
function snListHTML(){
  const l=curList();if(!l)return '<p class="empty">No list selected.<br>Lists choose which groups play, like the patches of a rompler. Press + next to Lists to make one.</p>';
  return '<div class="snhead"><b>List</b><small>bank '+((S.banks[l.bank]||{}).letter||'?')+'</small></div>'
    +'<label class="f"><span>Name</span><input type="text" data-sl="name" value="'+esc(l.name)+'"></label>'
    +'<label class="f"><span>Bank</span><select data-sl="bank">'+S.banks.map((b,i)=>'<option value="'+i+'"'+(i===l.bank?' selected':'')+'>'+b.letter+(b.name?' · '+esc(b.name):'')+'</option>').join('')+'</select></label>'
    +'<div class="snsub">Groups it plays</div><div class="sngroups">'+(S.groups.length?S.groups.map(g=>'<label class="chk"><input type="checkbox" data-sl="grp" data-g="'+esc(g)+'"'+(l.groups.indexOf(g)>=0?' checked':'')+'><i class="sw" style="background:'+gcfg(g).color+'"></i>'+esc(g)+'</label>').join(''):'<span class="muted">No groups yet.</span>')+'</div>'
    +'<label class="f chk"><input type="checkbox" data-sl="follow"'+(S.map.follow?' checked':'')+'><span>Only play this list\'s groups while editing</span></label>'
    +'<div class="snmores"><details class="snmore"><summary>Saved knob values</summary><div><p class="hint" style="display:block">'+Object.keys(l.vals||{}).length+' values stored. Choosing this list in the player sets the knobs to them.</p><div class="chips"><button type="button" class="btn" data-ls="saveVals" data-id="'+l.id+'">Store the current knob values</button></div></div></details></div>'
    +'<div class="snacts"><button type="button" class="btn danger" data-ls="delList" data-id="'+l.id+'">Delete list</button></div>';
}
$('#snInsList').addEventListener('input',e=>{const t=e.target,l=curList();if(!l||t.dataset.sl!=='name')return;l.name=t.value;refreshDisplays();const r=$('#leftM [data-sn="list"].cur .nm');if(r)r.textContent=l.name;});
$('#snInsList').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.sl,l=curList();if(!k||!l||k==='name')return;
  if(k==='bank'){listStructure(()=>{l.bank=+t.value;});const bt=bankTag(),lt=listTag();if(bt&&lt){setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}}
  else if(k==='grp'){const i=l.groups.indexOf(t.dataset.g);if(t.checked&&i<0)l.groups.push(t.dataset.g);else if(!t.checked&&i>=0)l.groups.splice(i,1);refreshDisplays();}
  else if(k==='follow'){S.map.follow=t.checked;}
  soundRefresh(true);
});

/* ---------- how the library plays: mono / legato / glide, pitch-bend range, voice limit (the engine reads project.play) ---------- */
const PLAY_DEF={mono:false,legato:false,glide:0,bend:2,maxVoices:0,steal:'oldest'};
S.play=Object.assign({},PLAY_DEF);
const playOf=()=>Object.assign({},PLAY_DEF,S.play||{});
(function(){
  const d=document.createElement('div');d.id='snInsPlay';d.hidden=true;$('#snInsList').after(d);
  /* saved with the project and the library */
  const snap0=snapshot;snapshot=function(){const s=snap0();s.play=playOf();return s;};
  const rest0=restore;restore=function(sn){rest0(sn);S.play=Object.assign({},PLAY_DEF,sn&&sn.play||{});};
  const reset0=resetMapper;resetMapper=function(){reset0.apply(this,arguments);S.play=Object.assign({},PLAY_DEF);};
  /* the engine reloads when these change */
  const sig0=engineSig;engineSig=function(){return sig0()+'|'+JSON.stringify(playOf());};
})();
function playSummary(){const p=playOf();return (p.mono?(p.legato?'Mono, legato':'Mono'):'Poly')+(p.mono&&p.glide>0?' · glide '+p.glide+' ms':'')+' · bend ±'+p.bend;}
/* a row at the top of the Sound tab's left column */
const mapLeftHTMLPlay=mapLeftHTML;
mapLeftHTML=function(){
  const f=S.snd.focus;
  return '<div class="snh"><span>Playing</span></div><div class="snlist"><button type="button" class="snrow'+(f==='play'?' cur on':'')+'" data-sn="play"><span class="nm">'+esc(playSummary())+'</span></button></div>'+mapLeftHTMLPlay();
};
$('#leftM').addEventListener('click',e=>{if(S.view==='sound'&&e.target.closest('[data-sn="play"]'))snFocus('play');});
function snPlayHTML(){
  const p=playOf(),ck=(k,l,dis)=>'<label class="f chk"><input type="checkbox" data-pl="'+k+'"'+(p[k]?' checked':'')+(dis?' disabled':'')+'><span>'+l+'</span></label>';
  return '<div class="snhead"><b>Playing</b><small>whole library</small></div><div class="snins">'
    +ck('mono','Mono (one note at a time)')
    +ck('legato','Legato: a new key slides the held note instead of restarting it',!p.mono)
    +nf('Glide','data-pl="glide"',p.glide,0,5000,1,'ms')
    +nf('Pitch-bend range','data-pl="bend"',p.bend,0,48,1,'semitones')
    +nf('Voice limit','data-pl="maxVoices"',p.maxVoices,0,256,1,'0 = 256')
    +'<label class="f"><span>When full, steal</span><select data-pl="steal">'+mopt([['oldest','The oldest note'],['quietest','The quietest note']],p.steal)+'</select></label>'
    +'<p class="hint" style="display:block">Glide works in mono. Released notes are always stolen first. In the player a CPU guard also lowers the limit for a moment when the computer cannot keep up.</p></div>';
}
$('#snInsPlay').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.pl;if(!k)return;
  const p=playOf();
  if(t.type==='checkbox')p[k]=t.checked;else if(t.type==='number'){const v=parseFloat(t.value);p[k]=isFinite(v)?Math.max(+t.min||0,Math.min(+t.max||1e9,v)):PLAY_DEF[k];}else p[k]=t.value;
  if(!p.mono)p.legato=false;
  S.play=p;mapLeftRender();$('#snInsPlay').innerHTML=snPlayHTML();
});
const snShowPlay=snShow;
snShow=function(keepIns){
  snShowPlay(keepIns);const el=$('#snInsPlay'),on=S.snd.focus==='play';el.hidden=!on;
  if(on){$('#rightM').hidden=true;if(!keepIns||!el.innerHTML)el.innerHTML=snPlayHTML();}
};

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

/* ---------- export: optional bake. The planning and rendering live in @visusampler/core; this wires it to the project ---------- */
const fxKeep=()=>Object.values(S.fx.graphs).flatMap(g=>g.nodes).map(n=>n.s&&n.s.ir).filter(Boolean);
const PROJ=()=>({samples:S.samples,zones:S.zones,keep:fxKeep()});
const estimate=(o,step)=>coreEstimate(CTX,PROJ(),o,step);
const exStep=o=>chooseStep(CTX,PROJ(),o);
const zoneBakeReason=z=>coreZoneBakeReason(CTX,z);
const buildExportSet=(o,progress)=>coreBuildExportSet(CTX,PROJ(),o,progress);
const tick=()=>new Promise(r=>setTimeout(r,0));

/* ---------- the .vsamp container ----------
   8 bytes  magic "VSAMP\0" 0x01 0x00
   u32 LE   manifest length
   u32 LE   manifest CRC32
   manifest UTF-8 JSON
   blobs    audio, images and fonts, offsets in the manifest are relative to the start of this region */
function dataUrlBytes(url){
  const m=/^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);if(!m)return null;
  const bin=m[2]?atob(m[3]):decodeURIComponent(m[3]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return{mime:m[1],bytes:u};
}
/* what this library uses; the player warns about anything it cannot play yet */
function libraryFeatures(set){
  const f=new Set(),add=x=>f.add(x);
  S.samples.forEach(s=>{const sm=smOf(s);if(S.zones.some(z=>z.sample===s.id)){add(sm.mode);if(sm.uni.on)add('unison');}});
  set.zones.forEach(z=>{const g=gcfg(z.group);if(z.loop&&z.loop.on){add('loop');if(z.loop.pp)add('pingpong');}if(z.rev)add('reverse');if(z.vstart)add('velstart');
    if(z.fadeLo||z.fadeHi||z.vfadeLo||z.vfadeHi)add('crossfade');if(z.hum&&(z.hum.tune||z.hum.vol||z.hum.start))add('humanize');
    if(/^rr/.test(g.mode))add('rr');if(g.mode==='release')add('release');if(g.choke)add('choke');if(g.env&&g.env.on)add('envelope');if(g.voices)add('voicelimit');});
  if(S.lists.length)add('lists');if(S.els.length)add('ui');
  Object.values(S.fx.graphs).forEach(g=>g.nodes.forEach(n=>{if(FXT[n.type]&&FXT[n.type].kind!=='io')add('fx:'+n.type);}));
  return [...f].sort();
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
  sn.interp=S.map.interp;{const cl=curList();sn.currentList=cl?S.lists.indexOf(cl):-1;}
  /* parameter ranges of every FX module, so the player can apply knobs and modulation exactly like the Maker */
  const fxRanges={};Object.keys(FXT).forEach(k=>{const d=FXT[k];fxRanges[k]={};d.params.forEach(q=>{fxRanges[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0];});});
  const est=estimate(o),dropped=set.stats.unusedSkipped;
  const lib={id:L.id,name:L.name,author:L.author,version:L.version,desc:L.desc,tags:L.tags,category:L.category,web:L.web,licence:L.licence,changelog:L.changelog,accent:L.accent};
  delete banner.bgImg;delete banner.logoImg;delete banner.iconImg;
  const manifest={format:'vsamp',formatVersion:1,created:new Date().toISOString(),app:'VisuMaker prototype 4',lib,
    banner:{settings:banner,images:bi,layers},
    project:sn,fxRanges,features:libraryFeatures(set),assets,fonts,samples:smeta,zones:set.zones,
    bake:{enabled:o.bake,mode:o.mode,step:set.stats.step,quality:o.quality,unison:o.bakeUni,keptOriginals:o.includeOrig,chunks:set.stats.chunks,zonesBaked:set.stats.zonesBaked,zonesLeftLive:set.stats.skipped},
    export:{bits:o.bits,compress:o.compress}};
  say('Writing file…');await tick();
  const bytes=writeVsamp(manifest,pack);
  const report={bytes:bytes.length,ms:Math.round(performance.now()-t0),samples:smeta.length,zones:set.zones.length,baked:set.stats.baked,chunks:set.stats.chunks,step:set.stats.step,
    zonesBaked:set.stats.zonesBaked,leftLive:set.stats.skipped,unusedSkipped:dropped,sourceBytes:est.before,warn,name:L.name};
  return{bytes,report,manifest};
}
const parseVsamp=bytes=>verifyVsamp(bytes);
let LAST_DL=null;
async function downloadBytes(u8,name){
  LAST_DL={name,bytes:u8};
  /* the artifact viewer only allows a few extensions, so there the file is offered as name.vsamp.zip (rename it to .vsamp) */
  let d=null;try{d=window.claude&&await window.claude.use('downloads');}catch(e){}
  if(d){
    try{await d.save({filename:name+'.zip',data:new Blob([u8])});flash('Saved as '+name+'.zip. Rename it to '+name+' (it is not really a zip).');}
    catch(e){if(e&&e.code!=='declined')flash('Could not save: '+(e.message||e.code));}
    return;
  }
  const b=new Blob([u8],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}

/* ---------- export tab ---------- */
const xtxt=(l,k,v,ph)=>'<label class="f"><span>'+l+'</span><input type="text" data-lk="'+k+'" value="'+esc(v)+'"'+(ph?' placeholder="'+ph+'"':'')+'></label>';
const xnum=(l,k,v,mn,mx,st,sfx)=>nf(l,'data-lk="'+k+'"',v,mn,mx,st,sfx);
const xsel=(l,k,v,o)=>'<label class="f"><span>'+l+'</span><select data-lk="'+k+'">'+mopt(o,v)+'</select></label>';
const xchk=(l,k,v)=>'<label class="f chk"><input type="checkbox" data-lk="'+k+'"'+(v?' checked':'')+'><span>'+l+'</span></label>';
const xcol=(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="color" data-lk="'+k+'" value="'+v+'"></label>';
function imgRow(label,key,id){
  const a=id&&S.assets[id];
  return '<div class="imgrow"><span>'+label+'</span>'+(a?'<img alt="" src="'+a.mips[0].url+'"><small>'+esc(a.name)+'</small>':'<small class="muted">none</small>')
    +'<button type="button" class="btn" data-xa="pick" data-k="'+key+'">'+(a?'Change':'Choose')+'</button>'+(a?'<button type="button" class="btn" data-xa="clear" data-k="'+key+'">Remove</button>':'')+'</div>';
}
function exLeftHTML(){
  const L=S.lib,B=L.banner;
  let h='<h2>Library</h2><div class="pad">';
  h+=sec('Library info',xtxt('Name','lib.name',L.name)+xtxt('Author','lib.author',L.author)+xtxt('Version','lib.version',L.version)
    +xsel('Category','lib.category',L.category,['Keys','Strings','Brass','Winds','Drums','Percussion','Synth','Pads','Guitars','Vocals','FX','Other'].map(x=>[x,x]))
    +xtxt('Tags','lib.tags',L.tags,'felt, soft, cinematic')+xtxt('Website','lib.web',L.web,'https://')
    +'<label class="f col"><span>Description</span><textarea data-lk="lib.desc" rows="3">'+esc(L.desc)+'</textarea></label>'
    +'<label class="f col"><span>Licence / credits</span><textarea data-lk="lib.licence" rows="2">'+esc(L.licence)+'</textarea></label>'
    +'<label class="f col"><span>Changelog</span><textarea data-lk="lib.changelog" rows="2">'+esc(L.changelog)+'</textarea></label>'
    +xcol('Accent colour','lib.accent',L.accent)
    +'<p class="hint">ID '+esc(L.id.slice(0,8))+'… stays the same between versions, so VisuPlayer can tell an update from a different library.</p>');
  h+=sec('Banner background',xsel('Style','lib.banner.bgMode',B.bgMode,[['gradient','Gradient'],['color','Solid colour'],['image','Image']])
    +(B.bgMode==='image'?imgRow('Image','bgImg',B.bgImg)+xnum('Focus left–right','lib.banner.focusX',B.focusX,0,100,1,'%')+xnum('Focus up–down','lib.banner.focusY',B.focusY,0,100,1,'%')
      :xcol(B.bgMode==='gradient'?'From':'Colour','lib.banner.bgColor',B.bgColor)+(B.bgMode==='gradient'?xcol('To','lib.banner.bgColor2',B.bgColor2):''))
    +xnum('Darken','lib.banner.darken',B.darken,0,90,1,'%')
    +'<p class="hint">The background moves a little when you hover the tile in the explorer. Its focus point decides what stays in view when it is cropped to wide, square or icon.</p>');
  h+=sec('Banner logo',imgRow('Logo (PNG or SVG with a transparent background)','logoImg',B.logoImg)+imgRow('Separate icon logo (optional)','iconImg',B.iconImg)
    +xchk('Show the library name when there is no logo','lib.banner.showName',B.showName)
    +xnum('Size, wide','lib.banner.scaleWide',B.scaleWide,10,100,1,'%')+xnum('Size, tile','lib.banner.scaleTile',B.scaleTile,10,100,1,'%')+xnum('Size, icon','lib.banner.scaleIcon',B.scaleIcon,10,100,1,'%')
    +xsel('Wide banner position','lib.banner.posWide',B.posWide,[['left','Left'],['center','Centre']])
    +'<p class="hint">The logo is placed automatically for each format, so you only make two images.</p>');
  return h+'</div>';
}
function exCenterHTML(){
  const L=S.lib;
  const gs=new Set(S.zones.map(z=>z.group));
  const rows=[['Samples',S.samples.length],['Zones',S.zones.length],['Groups',gs.size],['Lists',S.lists.length],['Banks',S.banks.length],['Elements',S.els.length],['FX graphs',Object.keys(S.fx.graphs||{}).length],['Tags',S.tags.length],['Fonts',Object.keys(S.fonts).length]];
  return '<div class="exgrid">'
    +'<section><h3>Wide banner <small>1200 × 400 · library page header</small></h3><canvas id="bnWide" class="bnc"></canvas></section>'
    +'<section class="exrow"><div><h3>Explorer tile <small>hover me</small></h3><div class="extile" id="exTile"><canvas id="bnEx" class="bnc"></canvas><div class="exmeta"><b>'+esc(L.name||'Untitled')+'</b><span>'+esc(L.author||'Unknown author')+' · v'+esc(L.version)+'</span><span class="muted">'+esc(L.category)+'</span></div></div></div>'
    +'<div><h3>Tile <small>512 × 512</small></h3><canvas id="bnTile" class="bnc sq"></canvas></div><div><h3>Icon <small>128 × 128</small></h3><canvas id="bnIcon" class="bnc ic"></canvas></div></section>'
    +'<section><h3>What goes in the file</h3><div class="chips">'+rows.map(r=>'<span class="chip ok">'+r[0]+' <b>'+r[1]+'</b></span>').join('')+'</div></section></div>';
}
function exSizeHTML(){
  const o=S.lib.export,e=estimate(o),ratio=e.before?e.after/e.before:1,bps=bytesPer(o.bits);
  let h='<div class="sizebox"><div class="sizebig">'+fmtBytes(e.after)+'</div><div class="muted">'+(o.bake?'with baking, from '+fmtBytes(e.before)+' ('+(ratio<1.05&&ratio>.95?'about the same':'×'+ratio.toFixed(2))+')':'before compression, '+o.bits+(o.bits===32?'-bit float':'-bit'))+'</div>';
  if(o.bake){h+='<div class="muted">'+e.zonesBaked+' zones baked into '+e.chunks+' samples, one every '+e.step+' key'+(e.step>1?'s':'')+(e.skipped.filter(x=>!x.soft).length?', '+e.skipped.filter(x=>!x.soft).length+' stay live':'')+'</div>';}
  if(e.over)h+='<div class="chip bad">Over your budget even at one sample per 24 keys. Try Smart, or lower the bit depth.</div>';
  const gk=Object.keys(e.perGroup),mx=Math.max.apply(null,gk.map(k=>e.perGroup[k]).concat([1]));
  h+='<div class="gbars">'+gk.map(k=>'<div class="gb"><span>'+esc(k)+'</span><i style="width:'+Math.max(2,e.perGroup[k]/mx*100)+'%"></i><em>'+fmtBytes(e.perGroup[k])+'</em></div>').join('')+'</div></div>';
  return h;
}
function exChecks(){
  const o=S.lib.export,L=S.lib,out=[];
  if(!L.name.trim()||L.name==='Untitled Library')out.push(['warn','Give the library a name.']);
  if(!S.zones.length)out.push(['bad','Nothing is mapped yet. The library would have no sound.']);
  const keep=fxKeep(),un=S.samples.filter(s=>!S.zones.some(z=>z.sample===s.id)&&keep.indexOf(s.id)<0).length;
  if(un)out.push(['warn',un+' sample'+(un>1?'s are':' is')+' not mapped. '+(o.includeUnused?'They will be included.':'They are left out of the file.')]);
  if(!L.banner.logoImg&&L.banner.bgMode!=='image')out.push(['warn','No logo or background image yet. The banner will show only the name.']);
  Object.keys(S.fonts).forEach(f=>{const x=S.fonts[f];if(x.lic==='restricted')out.push(['warn','Font "'+f+'" forbids embedding. It is left out.']);});
  if(o.bake){const ev=estimate(o).skipped.filter(x=>!x.soft);if(ev.length)out.push(['ok',ev.length+' zone'+(ev.length>1?'s':'')+' can not be baked ('+[...new Set(ev.map(x=>x.why))].join('; ')+') and stay live.']);}
  if(!out.length)out.push(['ok','Everything looks ready.']);
  return out;
}
function exRightHTML(){
  const o=S.lib.export,b=S.build;
  let h='<h2>Build</h2><div class="pad" id="exBuildBody">';
  h+=sec('Bake interpolation',xchk('Bake interpolation into the samples','lib.export.bake',o.bake)
    +'<p class="hint">'+(o.bake?'Baked libraries are lighter on CPU but larger on disk. Baking happens only in the exported file; your project never changes.':'Off. The player works out pitch changes live, and the file stays as small as your recordings. Baked libraries are lighter on CPU but larger on disk.')+'</p>'
    +(o.bake?xsel('Which notes','lib.export.mode',o.mode,[['smart','Smart: only notes far from the root'],['full','Full: every note']])
      +xchk('Pick the step to fit a size budget','lib.export.budgetOn',o.budgetOn)
      +(o.budgetOn?xnum('Size budget','lib.export.budgetMB',o.budgetMB,5,8000,10,'MB')+'<p class="hint">Chosen step: one baked sample every <b>'+exStep(o)+'</b> keys.</p>':xnum('One sample every','lib.export.step',o.step,1,24,1,'keys'))
      +xsel('Quality','lib.export.quality',o.quality,[['linear','Fast (linear)'],['cubic','Good (cubic)'],['sinc','Best (sinc)']])
      +xchk('Bake sample unison too','lib.export.bakeUni',o.bakeUni)+xchk('Keep the original samples as well','lib.export.includeOrig',o.includeOrig)
      +'<p class="hint">Smart keeps ±2 semitones around each root live, so the sound near the recording stays exactly as recorded. Loops, granular, wavetable, slicer and tempo-synced zones are never baked.</p>':''));
  h+=sec('File',xsel('Bit depth','lib.export.bits',o.bits,[[16,'16-bit (smallest)'],[24,'24-bit'],[32,'32-bit float (largest)']])
    +xchk('Compress the audio','lib.export.compress',o.compress)+xchk('Include samples that are not mapped','lib.export.includeUnused',o.includeUnused));
  h+=sec('Size',exSizeHTML());
  h+=sec('Checks','<ul class="checks">'+exChecks().map(c=>'<li class="'+c[0]+'">'+esc(c[1])+'</li>').join('')+'</ul>');
  h+='<div class="buildbar"><button type="button" class="btn primary" data-xa="build"'+(b.busy?' disabled':'')+'>'+(b.busy?'Building…':'Build .vsamp')+'</button>'
    +'<button type="button" class="btn" data-xa="verify"'+(b.last&&!b.busy?'':' disabled')+'>Verify</button>'
    +(window.visuDesktop?'<button type="button" class="btn primary" data-xa="tovst"'+(b.last&&!b.busy?'':' disabled')+'>Send to VisuPlayer</button>'
      :'<button type="button" class="btn" data-xa="download"'+(b.last&&!b.busy?'':' disabled')+'>Download</button>')+'</div>'
    +(window.visuDesktop?'<p class="hint keep">Send to VisuPlayer saves the library into Documents\\VisuSampler\\Libraries, where the VST finds it. <button type="button" class="btn ghost" data-xa="folder">Open folder</button></p>':'');
  h+='<div class="buildlog" id="exLog" role="status">'+(b.progress?esc(b.progress):'')+'</div>'+exReportHTML();
  return h+'</div>';
}
function exReportHTML(){
  const r=S.build.report;if(!r)return'';
  let h='<div class="report"><b>'+esc(r.name)+'.vsamp</b> · '+fmtBytes(r.bytes)+' · built in '+(r.ms/1000).toFixed(1)+' s<br>'+r.samples+' samples, '+r.zones+' zones'+(r.chunks?', '+r.chunks+' baked (every '+r.step+' keys)':'')+(r.unusedSkipped?', '+r.unusedSkipped+' unused left out':'')+(r.leftLive?', '+r.leftLive+' zones left live':'')+'.';
  (r.warn||[]).forEach(w=>{h+='<br><span class="chip warn">'+esc(w)+'</span>';});
  if(S.build.verify)h+='<br>'+(S.build.verify.ok?'<span class="chip ok">Verified: '+S.build.verify.info.blobs+' blocks, all checksums match, audio decodes.</span>':'<span class="chip bad">'+esc(S.build.verify.errors.join(' '))+'</span>');
  return h+'</div>';
}
function exRender(){
  $('#leftX').innerHTML=exLeftHTML();$('#centerX').querySelector('#exMain').innerHTML=exCenterHTML();$('#rightX').innerHTML=exRightHTML();
  bannerRedraw();exTileBind();
}
function exRightRefresh(){$('#rightX').innerHTML=exRightHTML();}
function exTileBind(){
  const t=$('#exTile');if(!t)return;
  t.addEventListener('mousemove',e=>{const r=t.getBoundingClientRect();EXPAR.x=((e.clientX-r.left)/r.width-.5)*2;EXPAR.y=((e.clientY-r.top)/r.height-.5)*2;drawBanner($('#bnEx'),'tile',FMT.tile.w,FMT.tile.h,EXPAR);});
  t.addEventListener('mouseleave',()=>{EXPAR.x=EXPAR.y=0;drawBanner($('#bnEx'),'tile',FMT.tile.w,FMT.tile.h,EXPAR);});
}
function exApply(t){
  const v=t.type==='checkbox'?t.checked:t.type==='number'||t.type==='range'?parseFloat(t.value):t.dataset.lk==='lib.export.bits'?parseInt(t.value,10):t.value;
  if(typeof v==='number'&&isNaN(v))return false;
  setPath({lib:S.lib},t.dataset.lk,v);return true;
}
const exWatch=()=>{S.build.verify=null;};
['#leftX','#rightX'].forEach(sel=>{
  $(sel).addEventListener('input',e=>{
    const t=e.target;if(!t.dataset.lk||t.type==='checkbox'||t.tagName==='SELECT')return;
    if(!exApply(t))return;bannerRedraw();
    if(sel==='#rightX'){const b=$('#rightX').querySelector('details[data-sec="Size"]');if(b){const keep=[...b.children].filter(c=>c.tagName!=='SUMMARY');keep.forEach(c=>c.remove());b.insertAdjacentHTML('beforeend',exSizeHTML());}}
  });
  $(sel).addEventListener('change',e=>{
    const t=e.target;if(!t.dataset.lk)return;if(!exApply(t))return;
    if(sel==='#leftX'){const k=t.dataset.lk;if(k==='lib.banner.bgMode'||k==='lib.name'||k==='lib.author'||k==='lib.version'||k==='lib.category'){const sc=$('#leftX').scrollTop;if(k==='lib.banner.bgMode')$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;}$('#exMain').innerHTML=exCenterHTML();exTileBind();bannerRedraw();}
    else{const sc=$('#rightX').scrollTop;exRightRefresh();$('#rightX').scrollTop=sc;}
  });
});
$('#leftX').addEventListener('click',e=>{
  const b=e.target.closest('[data-xa]');if(!b)return;const k=b.dataset.k;
  if(b.dataset.xa==='pick')pickImage(id=>{S.lib.banner[k]=id;IMGC.delete(id);const sc=$('#leftX').scrollTop;$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;bannerRedraw();});
  else if(b.dataset.xa==='clear'){S.lib.banner[k]=null;const sc=$('#leftX').scrollTop;$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;bannerRedraw();}
});
async function exBuild(){
  if(S.build.busy)return;S.build.busy=true;S.build.verify=null;exRightRefresh();
  const say=t=>{S.build.progress=t;const l=$('#exLog');if(l)l.textContent=t;};
  try{
    ensureAudio();
    const r=await buildVsamp(say);S.build.last=r;S.build.report=r.report;S.build.progress='Done.';
    const v=await parseVsamp(r.bytes);S.build.verify=v;
    flash(v.ok?'Built and verified: '+fmtBytes(r.bytes.length):'Built, but the check found problems');
  }catch(err){S.build.progress='Build failed: '+(err&&err.message||err);console.error(err);}
  S.build.busy=false;exRightRefresh();
}
$('#rightX').addEventListener('click',async e=>{
  const b=e.target.closest('[data-xa]');if(!b)return;const a=b.dataset.xa;
  if(a==='build')exBuild();
  else if(a==='verify'&&S.build.last){S.build.verify=await parseVsamp(S.build.last.bytes);exRightRefresh();}
  else if(a==='tovst'&&S.build.last&&window.visuDesktop){
    try{const file=await window.visuDesktop.saveLibrary(S.lib.name.trim()||'library',S.build.last.bytes);flash('Sent to VisuPlayer: '+file+'. Open the library browser in the VST to play it.');}
    catch(err){flash('Could not save: '+(err&&err.message||err));}
  }
  else if(a==='folder'&&window.visuDesktop){window.visuDesktop.openLibraryFolder();}
  else if(a==='download'&&S.build.last){downloadBytes(S.build.last.bytes,(S.lib.name.trim().replace(/[^\w\-. ]+/g,'')||'library')+'.vsamp');}
});

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

/* ---------- init ---------- */
buildKb();
buildVelvet();
S.tab='props';
syncToolbar(); layout(); mountAll(); renderLayers(); renderRight();
new ResizeObserver(()=>{if(S.view==='design')layout();}).observe(vp);
setView('sound');
if(window.__VSTEST) window.__vs={S,rerender:()=>{rerenderAll();placeSel();},ensureAudio,renderZone,touchMap,noteOn,noteOff,addBuffer,autoMapSamples,zoneConflicts,AU,SV,smOf,zoneData,uniVoices,BUF,sampleById,demoExtras,mapSlices,smOp,mkZone,detectTransients,smSample,previewOn,previewOff,PV,estimate,buildVsamp,parseVsamp,exRender,exBuild,bannerRedraw,crc32,fmtBytes,saveProject,openProject,restore,snapshot,FXT,FXA,graphOf,fxNode,mkCable,fxRender,sampBus,sampPanic,mapLeftRender,soundEnter,ENG};

})();
