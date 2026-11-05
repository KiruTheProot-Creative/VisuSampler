/* ---------- presets ---------- */
function baseProject(){
  addTexAssets();
  S.sel=null; S.msel=[]; S.lgroups=[]; S.els=[]; S.tags=sysTags(); S.groups=[]; S.lists=[]; S.banks=defaultBanks(['','','','','','','','']);
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
