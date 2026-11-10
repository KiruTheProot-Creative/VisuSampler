import {hash01} from '../../packages/core/src/util.js';
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const dpr=()=>window.devicePixelRatio||1;
let uid=1; const nid=p=>p+(uid++);


/* NodeFX (apps/maker/nodefx.html) builds the Effects editor alone into the NodeFX plugin; the Maker never sets this */
const NODEFX=!!window.__NODEFX;
/* follow the pointer until it is let go */
function drag(mv,end){
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(end)end();};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
}

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

/* ---------- small helpers the Maker and NodeFX share: status messages, inspector sections, tag lists ---------- */
let flashT=0;
function flash(t){
  const ms=[$('#msg'),$('#fxMsg'),$('#mapMsg'),$('#smMsg'),$('#exMsg')];
  ms.forEach(m=>{if(m)m.textContent=t;});
  clearTimeout(flashT);flashT=setTimeout(()=>{ms.forEach(m=>{if(m)m.textContent='';});},3800);
}
const sec=(title,body)=>'<details class="sec" data-sec="'+title+'"'+(closed.has(title)?'':' open')+'><summary>'+title+'</summary>'+body+'</details>';
const tagOpts=()=>[['','— none —']].concat(S.tags.map(t=>[t.id,t.name]));

/* ---------- tags, lists, tokens ---------- */
const tagById=id=>S.tags.find(t=>t.id===id)||null;
const tagByName=n=>S.tags.find(t=>t.name===n)||null;
const bankTag=()=>tagByName('bank');
const listTag=()=>tagByName('list');
/* layer B: a second patch picked from the same banks and lists, playing at the same time (tags bankB and listB) */
const layerBOn=()=>!!tagByName('listB');   /* the tags exist while layer B is switched on */
const bankTagB=()=>layerBOn()?tagByName('bankB'):null;
const listTagB=()=>layerBOn()?tagByName('listB'):null;
/* patch mode "group": a list is a folder of groups and each group in it is one patch (tags patch and patchB) */
const patchModeOn=()=>!!tagByName('patch');
const patchTag=B=>patchModeOn()?tagByName(B?'patchB':'patch'):null;
const syncList=t=>t.basis==='bar'?SYNC_BAR:SYNC;
function listsInBank(b){if(b===undefined)b=bankIdx();return S.lists.filter(l=>l.bank===b);}
function stepsOf(t){
  if(t.kind==='sync') return syncList(t).map(s=>s.l);
  if(t.kind==='list'){const a=listsInBank(t.layer?bankIdxB():undefined).map(l=>l.name);return a.length?a:['-'];}
  if(t.kind==='bank') return S.banks.map(b=>b.letter);
  if(t.kind==='patch'){const a=patchGroupsOf(t.layer);return a.length?a:['-'];}
  return t.steps;
}
const stepCount=t=>t.kind==='number'?0:stepsOf(t).length;
function stepIdx(t){const n=stepsOf(t).length;return n<2?0:clamp(Math.round(t.value*(n-1)),0,n-1);}
const bankIdx=()=>{const t=bankTag();return t?stepIdx(t):0;};
const listIdx=()=>{const t=listTag();return t?stepIdx(t):0;};
const curList=()=>listsInBank()[listIdx()]||null;
const bankIdxB=()=>{const t=bankTagB();return t?stepIdx(t):0;};
const listIdxB=()=>{const t=listTagB();return t?stepIdx(t):0;};
/* the groups a layer browses: those of its list, or every group when there are no lists */
function patchGroupsOf(B){if(!S.lists.length)return S.groups.slice();const l=B?curListB():curList();return l?(l.groups||[]).slice():[];}
const curPatch=B=>{const t=patchTag(B);if(!t)return null;return patchGroupsOf(B)[stepIdx(t)]||null;};
const patchIdx=B=>{const t=patchTag(B);return t?stepIdx(t):0;};
function patchToken(p,B){
  const gs=patchGroupsOf(B),n=gs.length,idx=patchIdx(B);
  let i=idx;if(p.mid.indexOf('next')>=0&&n)i=(idx+1)%n;else if(p.mid.indexOf('prev')>=0&&n)i=(idx-1+n)%n;
  const g=gs[i],f=p.n===1?'name':p.fmt.toLowerCase();
  switch(f){case 'name':return g||'-';case 'number':return g?pad2(i+1):'--';case 'count':return String(n);default:return '?'+p.fmt;}
}
const curListB=()=>layerBOn()&&listTagB()?listsInBank(bankIdxB())[listIdxB()]||null:null;
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
function listToken(p,B){
  const bi=B?bankIdxB():bankIdx(),bl=listsInBank(bi),idx=B?listIdxB():listIdx(),n=bl.length,letter=(S.banks[bi]||{letter:'?'}).letter;
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
function bankToken(p,B){
  const bi=B?bankIdxB():bankIdx(),b=S.banks[bi]||{letter:'?',name:''},f=p.n===1?'letter':p.fmt.toLowerCase();
  switch(f){
    case 'letter': return b.letter;
    case 'name': return b.name||b.letter;
    case 'count': return String(listsInBank(bi).length);
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
      case 'folder': return esc(listToken(p));
      case 'folderB': return layerBOn()?esc(listToken(p,1)):'-';
      case 'patch': return patchModeOn()?esc(patchToken(p,0)):'-';
      case 'patchB': return patchModeOn()&&layerBOn()?esc(patchToken(p,1)):'-';
      case 'listB': return layerBOn()?esc(listToken(p,1)):'-';
      case 'bankB': return layerBOn()?esc(bankToken(p,1)):'-';
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

/* ---------- element factories ---------- */
const TYPE_NAMES={panel:'Panel',knob:'Knob',fader:'Fader',text:'Text',button:'Button',lcd:'Text panel',list:'List selector',dropdown:'Dropdown',image:'Image',graph:'Graph'};
const DEF={
  panel:()=>({w:240,h:160,fillMode:'solid',fill2:'#1f1b26',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover',fill:'#3a3445',round:true,radius:14,bevel:true,bevelSize:3,bevelDir:'out',shadow:true,shadowDist:6,shadowBlur:18,mat:null,matBlend:'overlay',matOpacity:.5,matMode:'tile',matScale:1}),
  knob:()=>({w:110,h:110,tag:'',lower:null,upper:null,ringMode:'auto',ringImg:null,ringColor:'#ff7eb6',ringFrom:'start',ringWidth:.09,start:-135,end:135,px:.5,py:.5,baseColor:'#4a4357',capColor:'#e9e4f2',ptrColor:'#ff7eb6',ptrStyle:'line',rules:[]}),
  fader:()=>({w:56,h:200,tag:'',orient:'v',lower:null,upper:null,handleLen:.14,fill:true,fillColor:'#ff7eb6',trackColor:'#17141d',handleColor:'#e9e4f2',rules:[]}),
  text:()=>({w:200,h:36,text:'Label',font:'Figtree',size:18,weight:'600',color:'#f3e9ff',align:'center',spacing:0,bevel:'none',shadow:false,glow:false,glowColor:'#ff7eb6'}),
  button:()=>({w:72,h:44,label:'Button',font:'Figtree',size:15,weight:'700',textColor:'#1c1d21',tag:'',mode:'momentary',value:0,color:'#b4bac4',radius:8,bevelSize:3,led:false,ledColor:'#ff9d2e',auto:true,hover:8,press:14,travel:1,preview:'auto',rules:[]}),
  lcd:()=>({w:320,h:84,text:'{list.id}  {list.name}',font:'Figtree',size:26,align:'left',fg:'#f2f2f2',bg:'#1d1d22',glow:0,screen:false,grid:true,gridAmt:.16,scan:false,radius:6,pad:12,fillMode:'solid',fill2:'#0e0e12',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover'}),
  dropdown:()=>({w:200,h:34,tag:'',font:'Figtree',size:15,weight:'600',fg:'#f2f2f2',bg:'#2a2730',fillMode:'solid',fill2:'#141218',gradAngle:180,gradLight:true,bgImg:null,bgFit:'cover',
    radius:6,pad:10,bevel:true,arrowColor:'#ff7eb6',menuBg:'#1d1b22',menuFg:'#f2f2f2',menuHi:'#ff7eb6',menuRows:8,prefix:'',rules:[]}),
  graph:()=>({w:260,h:120,kind:'env',bg:'#121216',bgOn:true,radius:8,border:true,borderColor:'#2e2e36',grid:true,gridColor:'rgba(255,255,255,.07)',
    line:'#ff7eb6',lineW:2,glow:6,fillOn:true,fill:'#ff7eb6',fillAmt:.18,env:{},filt:{type:'lp',hz:2000,resv:0},layer:0,span:512,gain:1,bars:64,style:'line',smooth:.7}),
  image:()=>({w:200,h:150,img:null,fit:'contain',opacity:1,radius:0,shadow:false,flipX:false,flipY:false}),
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
  limiter:{label:'Limiter',kind:'fx',cat:'Dynamics',ins:['in'],outs:AO,cpu:2,lat:2,hint:'Brick wall: nothing ever gets past the Ceiling. It looks 2 ms ahead (that much latency, which NodeFX reports to your DAW). Classic is the older, softer fast compressor.',
    params:[FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('mix','Mix',0,100,'%',100)]},
  lfo:{label:'LFO',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.2,lat:0,hint:'Slow wave. Drag from its out port to any parameter dot.',
    params:[FP('rate','Rate',0.05,20,'Hz',1),FP('depth','Depth',0,100,'%',100)]},
  env:{label:'Follower',kind:'mod',cat:'Modulators',ins:['in'],outs:['out'],cpu:.4,lat:0,hint:'Envelope follower: turns the loudness of its audio input into a control signal.',
    params:[FP('attack','Attack',1,200,'ms',10),FP('release','Release',10,2000,'ms',200),FP('gain','Gain',0,100,'%',70)]},
  macro:{label:'Macro',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:0,lat:0,hint:'Turns a tag (a knob, a button, the bank) into a control: drag its out to a parameter\'s dot. With the knob at 0 the parameter stays as you set it, so set it where the knob should start; the cable amount is how far the knob reaches (negative turns it down).',
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
/* a module saved before one of its settings existed gets the value that keeps its old sound (q.old, e.g. Oversampling
   off), or else the default. New modules get the defaults (fxNode). The engine does the same with a missing setting. */
function fxFillParams(n){const d=FXT[n.type];if(!d)return;n.p=n.p||{};n.tag=n.tag||{};d.params.forEach(q=>{if(n.p[q.k]==null)n.p[q.k]=q.old!=null?q.old:q.def;});}
function fxNode(type,x,y,o){
  const d=FXT[type],n={id:nid('n'),type,x:Math.round(x),y:Math.round(y),bypass:false,name:(o&&o.name)||d.label,p:{},tag:{}};
  d.params.forEach(q=>{n.p[q.k]=q.def;});
  return n;
}
function mkCable(a,ap,b,bp){return{id:nid('c'),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:a.type==='macro'?100:50};}
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
/* frequency-like parameters move on a log scale, so a knob spends its travel evenly across what you hear */
const qLog=q=>!!q.log&&q.min>0;
const normOf=(q,v)=>qLog(q)?clamp(Math.log(Math.max(q.min,v)/q.min)/Math.log(q.max/q.min),0,1):clamp((v-q.min)/(q.max-q.min),0,1);
const realOfNorm=(q,nm)=>qLog(q)?q.min*Math.pow(q.max/q.min,nm):q.min+nm*(q.max-q.min);
function paramNorm(n,q){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg) return tg.value;
  return normOf(q,n.p[q.k]);
}
function paramReal(g,n,q,t,wantMod){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg&&q.sync&&tg.kind==='sync'){const ms=msOfBeats(syncBeats(tg,S.sig));return q.unit==='Hz'?1000/Math.max(1,ms):ms;}   /* a rate gets one cycle per note value */
  let nm=paramNorm(n,q),mod=false;
  if(wantMod!==false) g.cables.forEach(c=>{
    if(c.to.n===n.id&&c.to.p==='p:'+q.k){const s=nodeById(g,c.from.n);if(s){
      /* a macro adds its knob on top of the parameter (0 = the parameter as set); other modulators swing both ways */
      nm+=s.type==='macro'?modOut(g,s,t)*(c.amt/100):(modOut(g,s,t)-.5)*2*(c.amt/100);mod=true;}}
  });
  nm=clamp(nm,0,1);
  return{v:realOfNorm(q,nm),mod};
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
/* what does not change the sound (layout, names): left out when deciding whether a chain must be rebuilt */
const ENGINE_SIG_SKIP={x:1,y:1,name:1,skin:1,open:1,collapsed:1};

/* ---------- what the modulators put out: shown live in the Effects editor (and played by the old JS path) ----------
   FXA holds the Web Audio FX state (p330); FXM what the keyboard plays. */
const FXA={ctx:null,gin:{},gout:{},min:null,sig:'',scopes:{},follow:{},buses:[],wl:null,wlReady:false,noise:null,timer:0,last:0};
const FXM={vel:0,key:60,gate:false,tOn:-1,tOff:-1,mod:0,expr:1,at:0,bend:.5,lvlOn:0};
/* ---- modulator outputs (used by modOut) ---- */
function lfoOut(g,n,t){
  const v=n.p,r=paramReal(g,n,FXT.lfo.params[0],t,false),hz=typeof r==='number'?r:r.v;
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
  ring:{label:'Ring mod',kind:'fx',cat:'Modulation',ins:['in','carrier'],outs:AO,cpu:.5,lat:0,hint:'The sound times a carrier tone, as on the CS-80: bells, metal, robot voices. Sweep bends the carrier with every note played (Attack, then Decay); Speed and Depth wobble it. Patch any signal into carrier to use it instead of the built-in tone.',
    params:[FP('freq','Freq',1,5000,'Hz',440,{log:1}),OPT('wave','Wave',['Sine','Square','Triangle'],0,{stat:1}),FP('sweep','Sweep',-48,48,'st',0),FP('attack','Attack',0,5000,'ms',0),FP('decay','Decay',1,5000,'ms',600),FP('speed','Speed',0,20,'Hz',0),FP('depth','Depth',0,24,'st',0),FP('mix','Mix',0,100,'%',100)]},
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
  amp:{label:'Amp & Mic',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'A guitar amp and speaker, picked up by a microphone. Cable something from further down back into it and it howls (it limits itself, so it never runs away).',
    params:[OPT('amp','Amp',['Mini practice amp','Combo 1x12','Stack 4x12'],0),FP('gain','Gain',0,100,'%',55),FP('bass','Bass',-12,12,'dB',0),FP('mid','Mid',-12,12,'dB',0),FP('treble','Treble',-12,12,'dB',0),
      FP('volume','Volume',-24,12,'dB',0),OPT('mic','Mic',['Close, on the cone','Close, off axis','In the room'],0),OPT('os','Oversampling',['Off','4× (cleaner)'],1,{stat:1,old:0}),FP('mix','Mix',0,100,'%',100)]},
  /* ---- pedals (same DSP, stomp-box look; the footswitch is bypass) ---- */
  pod:{label:'Overdrive',kind:'fx',cat:'Pedals',pedal:'#3f8a4a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Mid-hump overdrive pedal.',
    params:[FP('drive','Drive',0,100,'%',45),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),OPT('os','Oversampling',['Off','4× (cleaner)'],1,{stat:1,old:0}),FP('mix','Mix',0,100,'%',100)]},
  pfuzz:{label:'Fuzz',kind:'fx',cat:'Pedals',pedal:'#b05a2a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'60s germanium-style fuzz.',
    params:[FP('fuzz','Fuzz',0,100,'%',70),FP('tone','Tone',0,100,'%',45),FP('level','Level',-24,12,'dB',-6),OPT('os','Oversampling',['Off','4× (cleaner)'],1,{stat:1,old:0}),FP('mix','Mix',0,100,'%',100)]},
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
FXT.dist.params=[OPT('type','Type',['Tube','Tape','Hard clip','Foldback','Fuzz','Soft clip','Bitcrush','Rectify','Sine shaper','Diode'],0,{stat:1}),FP('drive','Drive',0,100,'%',30),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),OPT('os','Oversampling',['Off','4× (cleaner)'],1,{stat:1,old:0}),FP('mix','Mix',0,100,'%',100)];
FXT.delay.params.splice(3,0,OPT('pp','Mode',['Stereo','Ping-pong','Tape','Diffuse'],0,{stat:1}));
FXT.delay.hint='Echo. Modes: stereo, ping-pong, tape (wobbly, warm repeats) and diffuse (repeats smear into a wash). Time can sync to the project tempo.';
FXT.reverb.hint='Room, hall, plate, ambience, cathedral, spring and shimmer tails.';
FXT.reverb.params=[OPT('type','Type',['Room','Hall','Plate','Ambience','Cathedral','Spring','Shimmer'],1,{ir:1}),FP('size','Size',0,100,'%',60,{ir:1}),FP('decay','Decay',0.1,12,'s',2.4,{ir:1}),FP('damp','Damping',0,100,'%',40,{ir:1}),FP('pre','Pre-delay',0,200,'ms',10),FP('mix','Mix',0,100,'%',30)];
FXT.comp.params=[OPT('mode','Mode',['Compressor','Limiter','OTT'],0),FP('thresh','Threshold',-60,0,'dB',-18),FP('ratio','Ratio',1,20,':1',3),FP('attack','Attack',0.1,100,'ms',10),FP('release','Release',10,1000,'ms',150),FP('makeup','Makeup',0,24,'dB',0),FP('mix','Mix',0,100,'%',100)];
FXT.comp.ins=['in'];FXT.comp.hint='Evens out level. Limiter mode catches peaks at the threshold. OTT squashes three bands up and down at once (ratio = depth, attack = speed).';
FXT.chorus.params.unshift(OPT('mode','Mode',['Chorus','Flanger','Ensemble'],0));FXT.chorus.hint='Thickens the sound. Modes: chorus, flanger (jet sweep) and ensemble (lush string-machine chorus).';
FXT.limiter.params=[OPT('brick','Mode',['Classic (fast compressor)','Brick wall'],1,{stat:1,old:0}),FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('release','Release',10,500,'ms',60),FP('mix','Mix',0,100,'%',100)];
FXT.lfo.params=[FP('rate','Rate',0.02,20,'Hz',1,{sync:1}),OPT('shape','Shape',['Sine','Triangle','Saw','Square','Random steps'],0),FP('depth','Depth',0,100,'%',100),OPT('retrig','Restart on note',['Off','On'],0)];
FXT.env.hint='Envelope follower: turns how loud its audio input is into a control signal.';
['delay','chorus','phaser'].forEach(k=>{FXT[k].fbOk=1;});
/* value text for choice parameters */
const fmtPar0=fmtPar;
fmtPar=function(q,v){return q.opts?q.opts[clamp(Math.round(v),0,q.opts.length-1)]:fmtPar0(q,v);};

/* Hz parameters with a wide range follow the ear (log scale) for knobs, macros and modulation */
Object.values(FXT).forEach(d=>(d.params||[]).forEach(q=>{if(q.unit==='Hz'&&q.min>0&&q.max/q.min>=50&&!q.opts)q.log=1;}));

/* ---- "Sync to tempo" (an effect setting): its time and rate parameters step through note values at the tempo ----
   In the player the tempo is the DAW's; in the Maker it is the project's BPM. Same list as the engine (Fx.cpp kNote). */
Object.values(FXT).forEach(d=>(d.params||[]).forEach(q=>{if(q.k==='rate'&&q.unit==='Hz'&&!q.opts)q.sync=1;}));
const NOTE_SYNC=[['1/64',.0625],['1/32T',1/12],['1/32',.125],['1/16T',1/6],['1/16',.25],['1/8T',1/3],['1/16.',.375],['1/8',.5],['1/4T',2/3],['1/8.',.75],['1/4',1],['1/2T',4/3],['1/4.',1.5],['1/2',2],['1/2.',3],['1 bar',-1],['2 bars',-2],['4 bars',-4]];
const noteBeatsOf=i=>{const b=NOTE_SYNC[i][1];return b>0?b:-b*barBeats(S.sig);};
const fxSynced=(n,q)=>!!(n&&n.sync&&q.sync);
const fxHasSync=n=>FXT[n.type].params.some(q=>q.sync);
/* which note a synced parameter is on (rates count from slow to fast, so turning up still means faster) */
function syncIdx(n,q,nm){const i=clamp(Math.round(nm*(NOTE_SYNC.length-1)),0,NOTE_SYNC.length-1);return q.unit==='Hz'?NOTE_SYNC.length-1-i:i;}
const syncValue=(q,i)=>{const sec=noteBeatsOf(i)*60/Math.max(1,S.bpm||120);return q.unit==='Hz'?1/sec:sec*1000;};
/* a synced parameter starts on the note closest to where it was */
function fxSyncInit(n){
  n.ps=n.ps||{};
  FXT[n.type].params.forEach(q=>{if(!q.sync||n.ps[q.k]!=null)return;
    let best=0,bd=1e9;for(let i=0;i<NOTE_SYNC.length;i++){const v=syncValue(q,i),d=Math.abs(Math.log(v/Math.max(1e-6,n.p[q.k])));if(d<bd){bd=d;best=i;}}
    const ix=q.unit==='Hz'?NOTE_SYNC.length-1-best:best;n.ps[q.k]=ix/(NOTE_SYNC.length-1);});
}
{const pn0=paramNorm;paramNorm=function(n,q){if(fxSynced(n,q)&&!(n.tag[q.k]&&tagById(n.tag[q.k])))return n.ps&&n.ps[q.k]!=null?n.ps[q.k]:.5;return pn0(n,q);};}
{const pr0=paramReal;paramReal=function(g,n,q,t,wantMod){
  if(!fxSynced(n,q))return pr0(g,n,q,t,wantMod);
  let nm=paramNorm(n,q),mod=false;
  if(wantMod!==false)g.cables.forEach(c=>{if(c.to.n===n.id&&c.to.p==='p:'+q.k){const s=nodeById(g,c.from.n);if(s){nm+=s.type==='macro'?modOut(g,s,t)*(c.amt/100):(modOut(g,s,t)-.5)*2*(c.amt/100);mod=true;}}});
  const i=syncIdx(n,q,clamp(nm,0,1));return{v:syncValue(q,i),mod,note:NOTE_SYNC[i][0]};
};}
const fmtParR=(q,r)=>r&&r.note?r.note+' · '+fmtPar(q,r.v):fmtPar(q,r.v);

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
    +'<output class="pv">'+fmtParR(q,r)+'</output></div>';
}
function nodeHTML(g,n,an){
  const d=FXT[n.type],cls=['fxn','k-'+d.kind];if(d.pedal||n.skin==='pedal')cls.push('pedal');
  if(n.bypass||fxTagOff(n)) cls.push('bypass'); if(an.idle.indexOf(n.id)>=0) cls.push('idle'); if(S.fx.sel===n.id) cls.push('sel');
  const rows=Math.max(d.ins.length,d.outs.length);let io='';
  for(let i=0;i<rows;i++){
    const a=d.ins[i],o=d.outs[i];
    io+='<div class="fxr"><span class="side l">'+(a?portBtn(n,a,'in','in')+'<i>'+PORT_LBL[a]+'</i>':'')+'</span><span class="side r">'+(o?'<i>'+PORT_LBL[o]+'</i>'+portBtn(n,o,'out',fxIsMod(n)?'ctl':(o==='out'?'mix':o)):'')+'</span></div>';
  }
  const hd='<div class="fxh" data-drag="1"><b>'+esc(n.name)+'</b>'
    +(d.kind==='io'?'':'<button type="button" class="fxb" data-fa="byp" data-id="'+n.id+'" title="Bypass" aria-label="Bypass '+esc(n.name)+'" aria-pressed="'+n.bypass+'">⏻</button><button type="button" class="fxb" data-fa="del" data-id="'+n.id+'" title="Remove" aria-label="Remove '+esc(n.name)+'">✕</button>')+'</div>';
  const ps=d.params.map(q=>parRowHTML(g,n,q,false)).join('')
    +(n.type==='macro'?'<div class="fxp"><span class="pl">Tag</span><select class="mtag" data-n="'+n.id+'" aria-label="Macro tag">'+tagOpts().map(o=>'<option value="'+o[0]+'"'+(o[0]===(n.tag.value||'')?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select></div>':'');
  const isPed=d.pedal||n.skin==='pedal',ped=isPed?'<div class="stomp"><span class="pled'+(n.bypass||fxTagOff(n)?'':' on')+'" aria-hidden="true"></span><button type="button" class="foot" data-fa="byp" data-id="'+n.id+'" aria-pressed="'+!n.bypass+'" aria-label="Footswitch '+esc(n.name)+'"></button></div>':'';
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
      +(ctl?'<label class="f"><span>Amount</span><input type="range" data-fa="amt" min="-100" max="100" value="'+c.amt+'"><output>'+c.amt+'%</output></label>':'')
      +'<div class="chips"><button type="button" class="btn" data-fa="insert">Insert effect here…</button><button type="button" class="btn danger" data-fa="delcab">Delete cable</button></div>');
  }
  if(!n) return '<p class="empty">Select a node or cable.<br>Double-click empty space to search and add.</p>';
  const d=FXT[n.type];
  let h='<div class="phead"><input type="text" class="pname" data-fn="name" value="'+esc(n.name)+'" aria-label="Node name"><span class="badge">'+d.label+'</span></div><p class="hint">'+d.hint+'</p>';
  if(d.sample){const cur=(n.s&&n.s.ir)||'';h+=sec('Impulse file','<label class="f"><span>Sample</span><select data-fn="ir" aria-label="Impulse sample"><option value="">— none —</option>'+S.samples.map(s=>'<option value="'+s.id+'"'+(s.id===cur?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label><p class="hint">Import the impulse (a recording of a room or a cabinet) in the Samples tab. It does not need to be mapped; it is packed into the library because this node uses it.</p>');}
  if(fxHasSync(n))h+='<label class="f chk"><input type="checkbox" data-fn="sync"'+(n.sync?' checked':'')+'><span>Sync to tempo</span></label>'
    +'<p class="hint">'+(n.sync?'Time and rate step through note values (1/64 to 4 bars, with dotted and triplet ones) at the tempo: the DAW\'s in the player, '+(S.bpm||120)+' BPM here. A knob linked to them steps through the notes too.':'Turn on to set time and rate in note values that follow the song\'s tempo.')+'</p>';
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
  Object.values(S.fx.graphs||{}).forEach(gr=>{if(gr&&gr.nodes)gr.nodes.forEach(fxFillParams);});
  const g=curG(); S.fx.an=fxAnalyze(g);
  const nodesView=S.fx.view==='nodes';
  $('#fxStage').hidden=!nodesView; $('#fxStack').hidden=nodesView;
  $('#fxVNodes').setAttribute('aria-pressed',String(nodesView)); $('#fxVStack').setAttribute('aria-pressed',String(!nodesView));
  $('#fxFlow').setAttribute('aria-pressed',String(S.fx.flow)); $('#fxScopeName').textContent=typeof NODEFX!=='undefined'&&NODEFX?'Chain':S.fx.scope==='master'?'Master chain':S.fx.scope;
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
    const rng=$('.pr',row); if(rng&&document.activeElement!==rng) rng.value=Math.round((tg?tg.value:normOf(q,r.v))*1000);
    $('.pv',row).textContent=fmtParR(q,r); row.classList.toggle('modd',!!r.mod);
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
    engineFxParam(n,q,()=>{
      if(fxSynced(n,q)){n.ps=n.ps||{};n.ps[q.k]=t.value/1000;}
      else{n.p[q.k]=realOfNorm(q,t.value/1000);if(q.opts)n.p[q.k]=Math.round(n.p[q.k]);}
    });
    const row=t.closest('.fxp');
    row.querySelector('.pv').textContent=fmtParR(q,parReal(g,n,q,fxClock()));
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
  if(t.dataset&&t.dataset.fn==='sync'){
    const n=nodeById(curG(),S.fx.sel); if(!n) return; n.sync=t.checked; if(n.sync)fxSyncInit(n); fxRender(); return;
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

/* ---------- switching a module on and off from the interface ----------
   n.byTag = {tag, inv, tails}: the module plays while the tag is on (or off, when reversed).
   With tails, switching off closes the module's input and lets reverb and delay tails fade naturally.
   The engine does the switching, so it works the same in the Maker and in VisuPlayer. */
function fxTagOff(n){
  const b=n.byTag,t=b&&b.tag&&tagById(b.tag);if(!t)return false;
  return (t.value>=.5)===!!b.inv;
}
function fxByTagHTML(n){
  const b=n.byTag||{},opts=S.tags.filter(t=>!t.sys||t.name==='page');
  let h='<label class="f"><span>On / off by</span><select data-fn="bytag" aria-label="Tag that switches '+esc(n.name)+' on and off"><option value="">— always on —</option>'
    +opts.map(t=>'<option value="'+t.id+'"'+(b.tag===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>';
  if(b.tag)h+='<label class="f chk"><input type="checkbox" data-fn="byinv"'+(b.inv?' checked':'')+'><span>Reverse: on while the tag is off</span></label>'
    +'<label class="f chk"><input type="checkbox" data-fn="bytails"'+(b.tails?' checked':'')+'><span>Let tails ring out when switched off</span></label>'
    +'<p class="hint">Now '+(fxTagOff(n)?'off':'on')+'. '+(NODEFX?'Turn the macro knob past halfway to switch it on (automate it in your DAW).':'A Toggle button on this tag in the Interface tab switches it; buttons, rules and knobs (past halfway) all work.')+'</p>';
  else if(NODEFX)h+='<p class="hint">Pick a macro knob: the module plays while the knob is past halfway.</p>';
  else h+='<div class="chips"><button type="button" class="btn" data-fa="mkbybtn">Make an on/off button</button></div><p class="hint">Adds a Toggle button with a light to your interface and links this module to it.</p>';
  return sec('Switch from the interface',h);
}
const fxInspHTMLBy=fxInspHTML;
fxInspHTML=function(){
  const h=fxInspHTMLBy(),g=curG(),n=S.fx.sel&&nodeById(g,S.fx.sel);
  if(!n||FXT[n.type].kind!=='fx')return h;
  const i=h.lastIndexOf('<div class="chips"><button type="button" class="btn" data-fa="byp"');
  return i<0?h+fxByTagHTML(n):h.slice(0,i)+fxByTagHTML(n)+h.slice(i);
};
document.addEventListener('change',e=>{
  const t=e.target,k=t.dataset&&t.dataset.fn;if(k!=='bytag'&&k!=='byinv'&&k!=='bytails')return;
  const n=nodeById(curG(),S.fx.sel);if(!n)return;
  if(k==='bytag'){if(t.value)n.byTag=Object.assign({inv:false,tails:false},n.byTag||{},{tag:t.value});else delete n.byTag;}
  else if(n.byTag)n.byTag[k==='byinv'?'inv':'tails']=t.checked;
  fxRender();
});
document.addEventListener('click',e=>{
  if(!e.target.closest('[data-fa="mkbybtn"]'))return;
  const n=nodeById(curG(),S.fx.sel);if(!n)return;
  /* a new knob-style tag (on) and a toggle button with a light, placed in the middle of the page being edited */
  const t=mkTag(n.name+' on','number',{value:1,def:1});S.tags.push(t);
  n.byTag={tag:t.id,inv:false,tails:/reverb|delay|echo|shimmer|spring|verb/i.test(n.type)};
  const el=mk('button',{name:n.name+' on/off',label:n.name,tag:t.id,mode:'toggle',led:true});
  el.w=Math.max(72,Math.min(160,10+n.name.length*9));el.x=Math.round((S.canvas.w-el.w)/2);el.y=Math.round((S.canvas.h-el.h)/2);
  S.els.push(el);const node=document.createElement('div');node.className='el button';node.dataset.id=el.id;canvas.appendChild(node);nodes.set(el.id,node);renderEl(el);renderLayers();
  fxRender();flash('Button "'+n.name+'" added to the Interface tab. Move it where you like.');
});
/* the editor shows the module as bypassed while its tag has it off */
const fxRefreshBy=fxRefreshParams;
fxRefreshParams=function(){
  fxRefreshBy();if(S.view!=='fx')return;
  curG().nodes.forEach(n=>{if(!n.byTag)return;const el=$('#centerF .fxn[data-id="'+n.id+'"]');if(!el)return;const off=n.bypass||fxTagOff(n);el.classList.toggle('bypass',off);const led=el.querySelector('.pled');if(led)led.classList.toggle('on',!off);});
};

/* ---------- NodeFX: what the Effects editor gets from the rest of VisuMaker, in the plugin ----------
   nodefx.html carries only the Effects editor (build.py lists its parts). These few stand in for the Maker's
   tabs, interface and project undo, which the plugin has none of. */
/* one view only */
function setView(){S.view='fx';fxRender();}
/* a macro knob moved: the editor shows the parameters that follow it */
function setTag(t,v){
  v=clamp(v,0,1);if(v===t.value)return;t.value=v;
  if(typeof fxRefreshParams==='function')fxRefreshParams();
}
/* parameter moves: replaced by the plugin's setParam in nfxStart */
function engineFxParam(n,q,fn){fn();}
/* no interface page to put elements on */
function renderEl(){}
function renderLayers(){}
function curPageIdx(){return 0;}
const imgSrc=()=>'';
/* undo / redo for the chain (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y): modules, cables, settings and macro names.
   Quick edits in a row (a knob being dragged) are one step. */
const NH={undo:[],redo:[],cur:null,at:0,restoring:false};
function nfxSnapshot(){return JSON.stringify({g:graphOf('master'),m:nfxMacroTags().map(t=>t.name)});}
function histClear(){NH.undo=[];NH.redo=[];NH.cur=nfxSnapshot();NH.at=0;}
function nfxHistTick(){
  if(NH.restoring)return;const s=nfxSnapshot();
  if(NH.cur==null){NH.cur=s;return;}
  if(s===NH.cur)return;
  const now=Date.now();
  if(now-NH.at>700){NH.undo.push(NH.cur);if(NH.undo.length>200)NH.undo.shift();}
  NH.redo=[];NH.cur=s;NH.at=now;
}
function nfxHistGo(from,to){
  nfxHistTick();if(!from.length)return false;
  to.push(NH.cur);const s=from.pop();NH.cur=s;NH.at=0;NH.restoring=true;
  try{
    const o=JSON.parse(s);S.fx.graphs={master:o.g};S.fx.sel=null;S.fx.cable=null;
    nfxMacroTags().forEach((t,i)=>{if(o.m[i])t.name=o.m[i];});
    $('#nfxMacros').innerHTML=nfxMacrosHTML();fxRender();nfxSync(false);
  }finally{NH.restoring=false;}
  return true;
}
const nfxUndo=()=>nfxHistGo(NH.undo,NH.redo),nfxRedo=()=>nfxHistGo(NH.redo,NH.undo);
document.addEventListener('keydown',e=>{
  const t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'))return;
  if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();
  if(k==='z'&&!e.shiftKey){e.preventDefault();if(!nfxUndo())flash('Nothing to undo');}
  else if((k==='z'&&e.shiftKey)||k==='y'){e.preventDefault();if(!nfxRedo())flash('Nothing to redo');}
});

/* ---------- NodeFX: the Effects editor as an effect plugin ----------
   Built into nodefx.html (build.py) with only the parts the Effects editor needs, never into the Maker. Only the Effects view shows (one chain, from the plugin's
   input to its output); 8 macro knobs (tags m1..m8) sit at the bottom, a preset bar at the top. The page never
   plays audio itself: the chain goes to the plugin (setRack), parameter moves go straight to it (setParam).
   Native functions (NodeFXEditor.cpp): getRack, setRack(json, rebuild), setParam, setMacro, setGlobal,
   listPresets, loadPreset, savePreset, deletePreset, openPresetFolder, openCommunity. Events: macros, globals. */
const NFX={macros:8,last:'',lastLayout:'',name:'Init',bank:'',mix:1,out:0,presets:[],cur:null,busy:false};
const nfxB=()=>window.__JUCE__&&window.__JUCE__.backend;
let nfxNext=1;const nfxPending=new Map();
function nfxCall(name,...params){
  const B=nfxB();if(!B)return Promise.resolve(window.__nfxMock?window.__nfxMock(name,params):null);
  if(!nfxCall.l){nfxCall.l=1;B.addEventListener('__juce__complete',({promiseId,result})=>{const p=nfxPending.get(promiseId);if(p){nfxPending.delete(promiseId);p(result);}});}
  const id=nfxNext++;return new Promise(res=>{nfxPending.set(id,res);B.emitEvent('__juce__invoke',{name,params,resultId:id});});
}
function nfxOn(ev,fn){const B=nfxB();if(B)B.addEventListener(ev,fn);else(window.__nfxEvents=window.__nfxEvents||{})[ev]=fn;}
/* the chain the plugin plays: graph, the ranges every module's parameters span, macro tags */
function nfxRanges(){const r={};Object.keys(FXT).forEach(k=>{r[k]={};FXT[k].params.forEach(q=>{r[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0,q.log?1:0,q.unit==='Hz'?1:0];});});return r;}
function nfxMacroTags(){return S.tags.filter(t=>/^m\d+$/.test(t.id));}
function nfxState(){
  return{v:1,name:NFX.name,bank:NFX.bank,graph:graphOf('master'),fxRanges:nfxRanges(),
    tags:nfxMacroTags().map(t=>({id:t.id,name:t.name,kind:'number',def:t.def,value:t.value})),mix:NFX.mix,out:NFX.out};
}
function nfxSig(){return JSON.stringify(graphOf('master'),function(k,v){return ENGINE_SIG_SKIP[k]&&this&&this.type&&this.id?undefined:v;})+'|'+JSON.stringify(nfxMacroTags().map(t=>[t.id,t.name]));}
/* every few frames: a changed chain is rebuilt in the plugin; moved boxes are only stored (they sound the same) */
function nfxSync(force){
  if(NFX.busy)return;const sig=nfxSig(),lay=JSON.stringify(graphOf('master'));
  if(!force&&sig===NFX.last&&lay===NFX.lastLayout)return;
  const rebuild=force||sig!==NFX.last;NFX.last=sig;NFX.lastLayout=lay;
  nfxCall('setRack',JSON.stringify(nfxState()),rebuild);
  nfxPresetLabel();
}
/* the macro knobs (tags m1..m8) */
function nfxMakeTags(names,values){
  S.tags=S.tags.filter(t=>!/^m\d+$/.test(t.id));
  for(let i=0;i<NFX.macros;i++){
    const t=mkTag((names&&names[i])||('Macro '+(i+1)),'number',{min:0,max:100,unit:'%',dec:0,value:values&&values[i]!=null?values[i]:0,def:0});
    t.id='m'+(i+1);S.tags.push(t);
  }
}
function nfxMacrosHTML(){
  return nfxMacroTags().map((t,i)=>'<div class="nfxm" data-i="'+i+'"><div class="nfxk" role="slider" tabindex="0" aria-label="'+esc(t.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(t.value*100)+'" data-i="'+i+'" style="--v:'+t.value+'"><i></i></div>'
    +'<button type="button" class="nfxn" data-i="'+i+'" title="Double-click to rename">'+esc(t.name)+'</button><span class="nfxv">'+Math.round(t.value*100)+'%</span></div>').join('');
}
function nfxShowMacro(i){
  const t=nfxMacroTags()[i],el=$('.nfxk[data-i="'+i+'"]');if(!t||!el)return;
  el.style.setProperty('--v',t.value);el.setAttribute('aria-valuenow',Math.round(t.value*100));
  const v=el.parentNode.querySelector('.nfxv');if(v)v.textContent=Math.round(t.value*100)+'%';
}
function nfxSetMacro(i,v,fromHost){
  const t=nfxMacroTags()[i];if(!t)return;v=clamp(v,0,1);if(Math.abs(v-t.value)<1e-6&&!fromHost)return;
  setTag(t,v);nfxShowMacro(i);if(!fromHost)nfxCall('setMacro',i,v);
}
function nfxKnob(host,get,set,reset){   /* drag up/down, arrows, double-click resets */
  host.addEventListener('pointerdown',e=>{
    const k=e.target.closest('[role="slider"]');if(!k)return;e.preventDefault();k.focus();
    const y0=e.clientY,v0=get(k),fine=e.shiftKey?.25:1;try{k.setPointerCapture(e.pointerId);}catch(_){}
    const mv=ev=>set(k,v0+(y0-ev.clientY)/180*fine);
    const up=()=>{k.removeEventListener('pointermove',mv);k.removeEventListener('pointerup',up);};
    k.addEventListener('pointermove',mv);k.addEventListener('pointerup',up);
  });
  host.addEventListener('dblclick',e=>{const k=e.target.closest('[role="slider"]');if(k)reset(k);});
  host.addEventListener('keydown',e=>{const k=e.target.closest('[role="slider"]');if(!k)return;const s=e.shiftKey?.01:.05;
    let d=null;if(e.key==='ArrowUp'||e.key==='ArrowRight')d=s;else if(e.key==='ArrowDown'||e.key==='ArrowLeft')d=-s;
    else if(e.key==='Home'){e.preventDefault();reset(k);return;}if(d==null)return;e.preventDefault();set(k,get(k)+d);});
}
/* Mix and Output (not saved in presets: they stay as you set them) */
const NFX_G={mix:{label:'Mix',fmt:v=>Math.round(v*100)+'%',norm:v=>v,real:n=>n,def:1},out:{label:'Output',fmt:v=>(v>0?'+':'')+v.toFixed(1)+' dB',norm:v=>(v+24)/36,real:n=>n*36-24,def:0}};
function nfxGlobalsHTML(){return Object.keys(NFX_G).map(k=>'<div class="nfxm g"><div class="nfxk" role="slider" tabindex="0" aria-label="'+NFX_G[k].label+'" data-g="'+k+'" style="--v:'+NFX_G[k].norm(NFX[k])+'"><i></i></div><span class="nfxn static">'+NFX_G[k].label+'</span><span class="nfxv" data-gv="'+k+'">'+NFX_G[k].fmt(NFX[k])+'</span></div>').join('');}
function nfxShowGlobal(k){const el=$('.nfxk[data-g="'+k+'"]');if(el)el.style.setProperty('--v',NFX_G[k].norm(NFX[k]));const v=$('[data-gv="'+k+'"]');if(v)v.textContent=NFX_G[k].fmt(NFX[k]);}
function nfxSetGlobal(k,real,fromHost){NFX[k]=k==='mix'?clamp(real,0,1):clamp(real,-24,12);nfxShowGlobal(k);if(!fromHost)nfxCall('setGlobal',k,NFX[k]);}
/* presets */
function nfxPresetLabel(){const b=$('#nfxPName');if(b)b.textContent=(NFX.bank?NFX.bank+' / ':'')+NFX.name;}
async function nfxRefreshPresets(){NFX.presets=(await nfxCall('listPresets'))||[];return NFX.presets;}
function nfxApply(st){
  if(!st||!st.graph)return false;
  NFX.busy=true;
  try{
    const g=JSON.parse(JSON.stringify(st.graph));
    /* parameters a preset does not have (saved before a module had them) start at their defaults */
    (g.nodes||[]).forEach(fxFillParams);
    S.fx.graphs={master:g};S.fx.scope='master';
    const tg=st.tags||[];nfxMakeTags(tg.map(t=>t.name),tg.map(t=>t.value!=null?t.value:t.def));
    NFX.name=st.name||'Untitled';NFX.bank=st.bank||'';
    if(st.mix!=null&&st.globals!==false)NFX.mix=st.mix;
    $('#nfxMacros').innerHTML=nfxMacrosHTML();nfxShowGlobal('mix');
    S.fx.sel=null;fxRender();histClear();
  }finally{NFX.busy=false;}
  nfxSync(true);return true;
}
async function nfxLoadPreset(p){
  const st=await nfxCall('loadPreset',p.id);
  if(!st){flash('Could not load "'+p.name+'"');return;}
  const s=typeof st==='string'?JSON.parse(st):st;s.name=p.name;s.bank=p.bank;s.globals=false;
  NFX.cur=p.id;nfxApply(s);nfxMenuClose();flash('Preset: '+p.name);
}
async function nfxStep(d){
  const ps=await nfxRefreshPresets();if(!ps.length)return;
  let i=ps.findIndex(p=>p.id===NFX.cur);i=i<0?(d>0?0:ps.length-1):(i+d+ps.length)%ps.length;nfxLoadPreset(ps[i]);
}
function nfxMenuHTML(){
  const banks=[];NFX.presets.forEach(p=>{const k=(p.factory?'Factory · ':'')+(p.bank||'');let b=banks.find(x=>x.k===k);if(!b){b={k,items:[]};banks.push(b);}b.items.push(p);});
  return'<div class="nfxlist">'+(banks.length?banks.map(b=>'<div class="insbank">'+esc(b.k||'My presets')+'</div>'+b.items.map(p=>'<div class="nfxrow"><button type="button" class="mi" data-p="'+esc(p.id)+'"'+(p.id===NFX.cur?' aria-current="true"':'')+'>'+esc(p.name)+'</button>'
      +(p.factory?'':'<button type="button" class="x" data-del="'+esc(p.id)+'" aria-label="Delete preset '+esc(p.name)+'" title="Delete">✕</button>')+'</div>').join('')).join(''):'<p class="hint">No presets yet.</p>')+'</div>'
    +'<div class="msep">Save the current chain</div><div class="insform"><label>Name<input type="text" id="nfxSaveName" value="'+esc(NFX.name)+'" maxlength="80"></label>'
    +'<label>Bank<input type="text" id="nfxSaveBank" value="'+esc(NFX.cur&&NFX.presets.find(p=>p.id===NFX.cur&&p.factory)?'':NFX.bank)+'" placeholder="e.g. Guitar" maxlength="60"></label>'
    +'<div class="insacts"><button type="button" class="btn primary" data-nfx="save">Save preset</button><button type="button" class="btn ghost" data-nfx="folder">Open folder</button><button type="button" class="btn ghost" data-nfx="init">New empty chain</button></div></div>';
}
function nfxMenuClose(){const m=$('#nfxMenu');if(m){m.hidden=true;$('#nfxPName').setAttribute('aria-expanded','false');}}
async function nfxMenuOpen(){await nfxRefreshPresets();const m=$('#nfxMenu');m.innerHTML=nfxMenuHTML();m.hidden=false;$('#nfxPName').setAttribute('aria-expanded','true');const c=m.querySelector('[aria-current]')||m.querySelector('[data-p]');if(c)c.focus();}
async function nfxSave(){
  const name=($('#nfxSaveName').value||'').trim(),bank=($('#nfxSaveBank').value||'').trim();
  if(!name){flash('Give the preset a name');return;}
  NFX.name=name;NFX.bank=bank;const st=nfxState();delete st.out;
  const r=await nfxCall('savePreset',name,bank,JSON.stringify(st));
  if(r&&r.error){flash('Could not save: '+r.error);return;}
  NFX.cur=r&&r.id||null;nfxPresetLabel();nfxSync(false);await nfxRefreshPresets();nfxMenuClose();flash('Saved preset "'+name+'"');
}
function nfxInitChain(){const a=fxNode('input',40,160),b=fxNode('output',620,160);nfxApply({name:'Init',bank:'',graph:{nodes:[a,b],cables:[mkCable(a,'out',b,'in')]},tags:[]});NFX.cur=null;nfxMenuClose();}
/* page set-up */
function nfxDom(){
  document.body.classList.add('nodefx');document.title='NodeFX';
  const top=$('.top');
  const logo=$('.logo',top);if(logo)logo.innerHTML='Node<em>FX</em>';
  const bar=document.createElement('div');bar.className='nfxbar';
  bar.innerHTML='<button type="button" class="btn pnav" id="nfxPrev" aria-label="Previous preset">◀</button>'
    +'<div class="nfxpw"><button type="button" class="btn" id="nfxPName" aria-haspopup="true" aria-expanded="false" aria-controls="nfxMenu" title="Presets: load, save, organise"></button><div class="menu insmenu" id="nfxMenu" hidden role="dialog" aria-label="Presets"></div></div>'
    +'<button type="button" class="btn pnav" id="nfxNext" aria-label="Next preset">▶</button>';
  logo.after(bar);
  const strip=document.createElement('section');strip.className='nfxstrip';strip.setAttribute('aria-label','Macro knobs');
  strip.innerHTML='<div class="nfxmacros" id="nfxMacros"></div><div class="nfxglobals" id="nfxGlobals">'+nfxGlobalsHTML()+'</div>';
  $('.app').append(strip);
  const sn=$('#fxScopeName');if(sn)sn.textContent='Chain';
  const lh=$('#fxLiveHint');if(lh)lh.textContent='Your DAW track plays through this chain: Input is the track, Output goes back to it. Link parameters to the macro knobs below to automate them.';
  $('#nfxPrev').onclick=()=>nfxStep(-1);$('#nfxNext').onclick=()=>nfxStep(1);
  $('#nfxPName').onclick=()=>{$('#nfxMenu').hidden?nfxMenuOpen():nfxMenuClose();};
  $('#nfxMenu').addEventListener('click',async e=>{
    const p=e.target.closest('[data-p]');if(p){const it=NFX.presets.find(x=>x.id===p.dataset.p);if(it)nfxLoadPreset(it);return;}
    const d=e.target.closest('[data-del]');if(d){const it=NFX.presets.find(x=>x.id===d.dataset.del);if(it&&confirm('Delete the preset "'+it.name+'"?')){await nfxCall('deletePreset',it.id);if(NFX.cur===it.id)NFX.cur=null;await nfxMenuOpen();}return;}
    const a=e.target.closest('[data-nfx]');if(!a)return;
    if(a.dataset.nfx==='save')nfxSave();else if(a.dataset.nfx==='folder')nfxCall('openPresetFolder');else if(a.dataset.nfx==='init')nfxInitChain();
  });
  $('#nfxMenu').addEventListener('keydown',e=>{if(e.key==='Escape'){nfxMenuClose();$('#nfxPName').focus();}else if(e.key==='Enter'&&e.target.tagName==='INPUT')nfxSave();});
  document.addEventListener('pointerdown',e=>{if(!$('#nfxMenu').hidden&&!e.target.closest('.nfxpw'))nfxMenuClose();});
  const mac=$('#nfxMacros');
  nfxKnob(mac,k=>nfxMacroTags()[+k.dataset.i].value,(k,v)=>nfxSetMacro(+k.dataset.i,v),k=>nfxSetMacro(+k.dataset.i,0));
  mac.addEventListener('dblclick',e=>{   /* rename a macro: its name shows in the DAW too */
    const b=e.target.closest('.nfxn[data-i]');if(!b)return;const i=+b.dataset.i,t=nfxMacroTags()[i];
    const inp=document.createElement('input');inp.type='text';inp.value=t.name;inp.maxLength=24;inp.className='nfxren';inp.setAttribute('aria-label','Name of macro '+(i+1));b.replaceWith(inp);inp.focus();inp.select();
    const done=ok=>{if(ok){const v=inp.value.trim();if(v)t.name=v;}$('#nfxMacros').innerHTML=nfxMacrosHTML();if(ok){nfxCall('setMacroName',i,t.name);fxRender();}};
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')done(true);else if(ev.key==='Escape')done(false);});inp.addEventListener('blur',()=>done(true));
  });
  const gl=$('#nfxGlobals');
  nfxKnob(gl,k=>NFX_G[k.dataset.g].norm(NFX[k.dataset.g]),(k,n)=>nfxSetGlobal(k.dataset.g,NFX_G[k.dataset.g].real(clamp(n,0,1))),k=>nfxSetGlobal(k.dataset.g,NFX_G[k.dataset.g].def));
}
async function nfxStart(){
  nfxDom();
  delete FXT.conv;   /* convolution needs an impulse-response sample, and NodeFX has none */
  delete FXT.adsr;delete FXT.midisrc;   /* they follow played notes, and an effect gets none */
  /* parameter moves go straight to the plugin; the chain itself is synced below */
  engineFxParam=function(n,q,fn){fn();const synced=typeof fxSynced==='function'&&fxSynced(n,q);nfxCall('setParam',n.id,q.k,synced?n.ps[q.k]:n.p[q.k],!!synced);NFX.last=nfxSig();};
  nfxOn('macros',d=>{if(d&&Array.isArray(d.v))d.v.forEach((v,i)=>{const t=nfxMacroTags()[i];if(t&&Math.abs(t.value-v)>1e-4)nfxSetMacro(i,v,true);});});
  nfxOn('globals',d=>{if(!d)return;if(d.mix!=null)nfxSetGlobal('mix',+d.mix,true);if(d.out!=null)nfxSetGlobal('out',+d.out,true);});
  nfxMakeTags();
  const st=await nfxCall('getRack');let s=st&&(typeof st==='string'?JSON.parse(st):st);
  if(s&&s.out!=null)NFX.out=s.out;
  if(!s||!s.graph){const ps=await nfxRefreshPresets();const first=ps.find(p=>p.factory);if(first){await nfxLoadPreset(first);s=null;}else nfxInitChain();}
  else{NFX.cur=s.preset||null;nfxApply(s);}
  nfxShowGlobal('out');setView('fx');fxRender();histClear();
  document.body.classList.add('nfx-ready');   /* shown only now: the page never flashes half built */
  setInterval(()=>{nfxSync(false);nfxHistTick();},150);
}

/* ---------- NodeFX: start-up ---------- */
S.view='fx';
nfxStart().catch(e=>{console.error('NodeFX start',e);flash('NodeFX could not start: '+(e&&e.message||e));}).finally(()=>document.body.classList.add('nfx-ready'));
setTimeout(()=>document.body.classList.add('nfx-ready'),4000);   /* never stays hidden, even when the plugin does not answer */
if(window.__VSTEST) window.__vs={S,NFX,NH,nfxState,nfxApply,nfxSync,nfxMacroTags,nfxSetMacro,nfxUndo,nfxRedo,nfxHistTick,
  graphOf:s=>graphOf(s),fxNode:(t,x,y)=>fxNode(t,x,y),mkCable:(a,ap,b,bp)=>mkCable(a,ap,b,bp),fxRender:()=>fxRender(),FXT,
  fxParam:(n,q,fn)=>engineFxParam(n,q,fn)};

})();
