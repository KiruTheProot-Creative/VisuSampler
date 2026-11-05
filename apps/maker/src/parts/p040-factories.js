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
