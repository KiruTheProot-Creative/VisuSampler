// Makes factoryPresets.json, NodeFX's built-in presets, from the effect catalog (tests/golden/fx-catalog.json, saved
// from VisuMaker), so every module has all its parameters. Each preset: {bank, name, state:{v, graph, tags, mix}}.
// Macros are tags m1..m8; a parameter linked to one follows it over its whole range (log for frequencies).
import {readFileSync,writeFileSync} from 'node:fs';
const cat=JSON.parse(readFileSync(new URL('../../tests/golden/fx-catalog.json',import.meta.url),'utf8'));
const NOTES=['1/64','1/32T','1/32','1/16T','1/16','1/16D','1/8T','1/8','1/8D','1/4T','1/4','1/4D','1/2T','1/2','1/2D','1 bar','2 bars','4 bars'];
const presets=[];
function preset(bank,name,build){
  let k=0,x=40;const nodes=[],cables=[],macros=[];
  const id=()=>'n'+(++k);
  const g={
    node(type,p,o){if(!cat.defs[type])throw new Error('no module '+type);const n=Object.assign({id:id(),type,x:0,y:0,bypass:false,name:o&&o.name||type,p:Object.assign({},cat.defs[type].p,p||{}),tag:{}},o||{});delete n.at;nodes.push(n);return n;},
    wire(a,ap,b,bp,amt){cables.push({id:'c'+(++k),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:amt==null?50:amt});},
    /* a macro knob on a parameter, starting where the parameter is */
    macro(name,n,param,o){
      o=o||{};let m=macros.find(x=>x.name===name);
      if(!m){m={id:'m'+(macros.length+1),name,value:0};macros.push(m);}
      n.tag[param]=m.id;
      const r=cat.ranges[n.type][param],min=r[0],max=r[1],log=r[4],sync=r[3]&&n.sync;
      const v=o.note!=null?NOTES.indexOf(o.note)/(NOTES.length-1):log?Math.log(n.p[param]/min)/Math.log(max/min):(n.p[param]-min)/(max-min);
      if(o.note!=null&&NOTES.indexOf(o.note)<0)throw new Error('note '+o.note);
      m.value=Math.round(Math.min(1,Math.max(0,v))*1000)/1000;return m;
    },
    sync(n,param,note){n.sync=true;n.ps=Object.assign({},n.ps||{},{[param]:NOTES.indexOf(note)/(NOTES.length-1)});}
  };
  const io=build(g);
  /* lay the boxes out left to right (the chain's order), modulators underneath */
  const fx=nodes.filter(n=>cat.defs[n.type].kind!=='mod'&&!['input','output'].includes(n.type)),mods=nodes.filter(n=>cat.defs[n.type].kind==='mod');
  const inN={id:id(),type:'input',x:40,y:200,bypass:false,name:'Input',p:{},tag:{}},outN={id:id(),type:'output',x:0,y:200,bypass:false,name:'Output',p:{},tag:{}};
  let col=0;const rows={};fx.forEach(n=>{const c=n.col!=null?n.col:col++;n.x=260+c*240;rows[c]=(rows[c]||0);n.y=n.row!=null?80+n.row*230:120+rows[c]*230;rows[c]++;delete n.col;delete n.row;});
  outN.x=260+Math.max(col,...fx.map(n=>Math.round((n.x-260)/240)+1))*240;
  mods.forEach((n,i)=>{n.x=260+i*240;n.y=420;});
  nodes.unshift(inN);nodes.push(outN);
  (io.from||[]).forEach(([n,p])=>g.wire(inN,'out',n,p||'in'));
  (io.to||[]).forEach(([n,p])=>g.wire(n,p||'mix',outN,'in'));
  if(!io.from&&!io.to)g.wire(inN,'out',outN,'in');
  const tags=[];for(let i=0;i<8;i++){const m=macros[i];tags.push({id:'m'+(i+1),name:m?m.name:'Macro '+(i+1),kind:'number',def:m?m.value:0,value:m?m.value:0});}
  presets.push({bank,name,state:{v:1,name,bank,graph:{nodes,cables},tags,mix:io.mix!=null?io.mix:1}});
}
const chain=(g,list)=>{for(let i=1;i<list.length;i++)g.wire(list[i-1],cat.defs[list[i-1].type].outs.includes('mix')?'mix':'out',list[i],'in');return{from:[[list[0]]],to:[[list[list.length-1],cat.defs[list[list.length-1].type].outs.includes('mix')?'mix':'out']]};};

/* ---------------- Basics ---------------- */
preset('Basics','Init',()=>({}));
preset('Basics','Echo',g=>{const d=g.node('delay',{fb:40,tone:55,mix:30},{name:'Echo'});g.sync(d,'time','1/8D');
  g.macro('Time',d,'time',{note:'1/8D'});g.macro('Feedback',d,'fb');g.macro('Tone',d,'tone');g.macro('Echo mix',d,'mix');return chain(g,[d]);});
preset('Basics','Ping-Pong 1/4',g=>{const d=g.node('delay',{fb:45,tone:50,pp:1,mix:28},{name:'Ping-pong'});g.sync(d,'time','1/4');
  g.macro('Time',d,'time',{note:'1/4'});g.macro('Feedback',d,'fb');g.macro('Echo mix',d,'mix');return chain(g,[d]);});
preset('Basics','Big Hall',g=>{const r=g.node('reverb',{type:2,size:85,decay:4.5,damp:35,pre:25,mix:30},{name:'Hall'});
  g.macro('Size',r,'size');g.macro('Decay',r,'decay');g.macro('Damping',r,'damp');g.macro('Reverb mix',r,'mix');return chain(g,[r]);});
preset('Basics','Small Room',g=>{const r=g.node('reverb',{type:0,size:35,decay:0.8,damp:50,pre:5,mix:22},{name:'Room'});
  g.macro('Size',r,'size');g.macro('Decay',r,'decay');g.macro('Reverb mix',r,'mix');return chain(g,[r]);});
/* no macro on threshold or makeup: the compressor makes up its own gain, so those could add over 30 dB */
preset('Basics','Glue Bus',g=>{const c=g.node('comp',{thresh:-18,ratio:2.5,attack:20,release:200,makeup:0,mix:80},{name:'Glue'}),l=g.node('limiter',{ceiling:-0.5},{name:'Limiter'});
  g.macro('Squash',c,'ratio');g.macro('Attack',c,'attack');g.macro('Glue mix',c,'mix');return chain(g,[c,l]);});
preset('Basics','Tone Shaper',g=>{const e=g.node('peq',{lf:90,lg:2,m1f:400,m1g:-2,m2f:3000,m2g:1.5,hf:10000,hg:2},{name:'EQ'});
  g.macro('Low',e,'lg');g.macro('Low mids',e,'m1g');g.macro('Presence',e,'m2g');g.macro('Air',e,'hg');return chain(g,[e]);});
preset('Basics','Filter Sweep',g=>{const f=g.node('filter',{type:0,cutoff:1200,res:45,slope:1},{name:'Low-pass'}),l=g.node('lfo',{rate:0.25,shape:0,depth:100},{name:'Sweep'});
  g.wire(l,'out',f,'p:cutoff',60);g.macro('Cutoff',f,'cutoff');g.macro('Resonance',f,'res');g.macro('Sweep rate',l,'rate');return chain(g,[f]);});
preset('Basics','Wide Chorus',g=>{const c=g.node('chorus',{mode:1,rate:0.6,depth:45,mix:50},{name:'Chorus'}),u=g.node('util',{width:140},{name:'Width'});
  g.macro('Rate',c,'rate');g.macro('Depth',c,'depth');g.macro('Width',u,'width');g.macro('Chorus mix',c,'mix');return chain(g,[c,u]);});
preset('Basics','Auto-Pan',g=>{const t=g.node('trem',{rate:2,depth:70,shape:0,mode:1},{name:'Auto-pan'});
  g.macro('Rate',t,'rate');g.macro('Depth',t,'depth');return chain(g,[t]);});
/* ---------------- Guitar ---------------- */
preset('Guitar','Clean Combo',g=>{const c=g.node('pcomp',{sustain:45},{name:'Compressor pedal'}),a=g.node('amp',{amp:1,gain:22,bass:1,mid:0,treble:2,mic:0},{name:'Combo 1x12'}),s=g.node('spring',{decay:2,drip:40,mix:22},{name:'Spring'});
  g.macro('Gain',a,'gain');g.macro('Bass',a,'bass');g.macro('Treble',a,'treble');g.macro('Spring',s,'mix');return chain(g,[c,a,s]);});
preset('Guitar','Crunch Stack',g=>{const o=g.node('pod',{drive:40,tone:55},{name:'Overdrive'}),a=g.node('amp',{amp:2,gain:62,bass:2,mid:3,treble:1,mic:1},{name:'Stack 4x12'}),d=g.node('delay',{fb:25,tone:40,mix:14},{name:'Slap'});g.sync(d,'time','1/16');
  g.macro('Drive',o,'drive');g.macro('Gain',a,'gain');g.macro('Mid',a,'mid');g.macro('Slap',d,'mix');return chain(g,[o,a,d]);});
preset('Guitar','Fuzz Wall',g=>{const f=g.node('pfuzz',{fuzz:85,tone:40,level:-10},{name:'Fuzz'}),a=g.node('amp',{amp:2,gain:50,bass:3,mid:-2,treble:0,volume:-9,mic:0},{name:'Stack 4x12'}),r=g.node('reverb',{type:1,size:60,decay:2,mix:18},{name:'Room'});
  g.macro('Fuzz',f,'fuzz');g.macro('Tone',f,'tone');g.macro('Gain',a,'gain');g.macro('Room',r,'mix');return chain(g,[f,a,r]);});
preset('Guitar','Funk Wah',g=>{const w=g.node('pwah',{mode:1,q:9},{name:'Auto-wah'}),c=g.node('pcomp',{sustain:55},{name:'Compressor pedal'}),a=g.node('amp',{amp:1,gain:30,treble:3,mic:0},{name:'Combo 1x12'});
  g.macro('Wah Q',w,'q');g.macro('Squash',c,'sustain');g.macro('Gain',a,'gain');return chain(g,[w,c,a]);});
preset('Guitar','Vibe & Trem',g=>{const v=g.node('pvibe',{speed:1.6,intensity:65,mix:60},{name:'Vibe'}),t=g.node('trem',{rate:5,depth:45,shape:1,mode:0},{name:'Tremolo'}),a=g.node('amp',{amp:1,gain:25,mic:2},{name:'Combo, room mic'}),s=g.node('spring',{decay:2.6,drip:55,mix:28},{name:'Spring'});
  g.macro('Vibe speed',v,'speed');g.macro('Trem rate',t,'rate');g.macro('Trem depth',t,'depth');g.macro('Spring',s,'mix');return chain(g,[v,t,a,s]);});
preset('Guitar','Feedback Howl',g=>{const a=g.node('amp',{amp:0,gain:78,bass:2,mid:4,treble:1,mic:0},{name:'Mini amp'}),u=g.node('util',{gain:-22},{name:'Feedback'}),c=g.node('comp',{thresh:-14,ratio:4,attack:0.5},{name:'Comp'});
  g.wire(a,'mix',u,'in');g.wire(u,'out',a,'in');g.wire(a,'mix',c,'in');
  g.macro('Gain',a,'gain');g.macro('Feedback',u,'gain');return{from:[[a]],to:[[c,'mix']]};});
/* ---------------- Weird ---------------- */
preset('Weird','Shimmer Clouds',g=>{const s=g.node('shimmer',{decay:9,shine:70,mix:45},{name:'Shimmer'}),r=g.node('reverb',{type:2,size:95,decay:8,damp:20,mix:35},{name:'Hall'});
  g.macro('Shine',s,'shine');g.macro('Decay',s,'decay');g.macro('Clouds',r,'mix');return chain(g,[s,r]);});
preset('Weird','Broken Radio',g=>{const r=g.node('radio',{band:1,crunch:55,noise:20},{name:'Radio'}),c=g.node('crush',{bits:7,rate:9000,mix:60},{name:'Crusher'}),l=g.node('lofi',{crackle:35,wow:40,noise:10,tone:45},{name:'Lo-fi'});
  g.macro('Crunch',r,'crunch');g.macro('Bits',c,'bits');g.macro('Wow',l,'wow');return chain(g,[r,c,l]);});
preset('Weird','Tape Memories',g=>{const t=g.node('tapemach',{sat:45,wow:30,hiss:15,age:50},{name:'Tape'}),e=g.node('tapeecho',{fb:50,wobble:55,sat:45,tone:40,mix:30},{name:'Tape echo'}),v=g.node('vinyl',{crackle:30,rumble:15,wear:40,wow:25},{name:'Vinyl'});g.sync(e,'time','1/4D');
  g.macro('Age',t,'age');g.macro('Echo time',e,'time',{note:'1/4D'});g.macro('Wobble',e,'wobble');g.macro('Crackle',v,'crackle');return chain(g,[t,e,v]);});
preset('Weird','Rotary Spin',g=>{const r=g.node('rotary',{speed:1,drive:30},{name:'Rotary'});g.macro('Speed',r,'speed');g.macro('Drive',r,'drive');return chain(g,[r]);});
preset('Weird','Glitch Box',g=>{const c=g.node('crush',{bits:6,rate:6000,mix:80},{name:'Crusher'}),q=g.node('rand',{rate:8,smooth:0,depth:100},{name:'Random'}),v=g.node('gatedverb',{gate:250,size:85,mix:35},{name:'Gated verb'});
  g.wire(q,'out',c,'p:rate',70);g.macro('Bits',c,'bits');g.macro('Glitch rate',q,'rate');g.macro('Gate',v,'gate');return chain(g,[c,v]);});
preset('Weird','Talking Vowels',g=>{const m=g.node('morph',{morph:40,shift:0,res:75},{name:'Vowels'}),u=g.node('util',{gain:9},{name:'Level'}),l=g.node('lfo',{rate:0.7,shape:1,depth:100},{name:'Talk'});
  g.wire(l,'out',m,'p:morph',80);g.macro('Vowel',m,'morph');g.macro('Talk speed',l,'rate');g.macro('Resonance',m,'res');return chain(g,[m,u]);});
preset('Weird','Hellforge Lite',g=>{
  const p1=g.node('pfuzz',{fuzz:75,level:-6},{name:'Fuzz',col:0,row:0}),p2=g.node('phaser',{rate:0.3,depth:70,fb:45,mix:45},{name:'Phaser',col:1,row:0});
  const a=g.node('amp',{amp:0,gain:70,mid:4},{name:'Mini amp',col:0,row:1}),u=g.node('util',{gain:-20},{name:'Feedback',col:1,row:1});
  const mx=g.node('mixer',{l1:-3,l2:-6},{name:'Mixer',col:2,row:0}),c=g.node('comp',{thresh:-22,ratio:4,attack:15,mix:70},{name:'Bus comp',col:3,row:0}),lim=g.node('limiter',{ceiling:-1},{name:'Limiter',col:4,row:0});
  g.wire(p1,'mix',p2,'in');g.wire(p2,'mix',mx,'in1');g.wire(a,'mix',u,'in');g.wire(u,'out',a,'in');g.wire(a,'mix',mx,'in2');g.wire(mx,'out',c,'in');g.wire(c,'mix',lim,'in');
  g.macro('Fuzz',p1,'fuzz');g.macro('Feedback',u,'gain');g.macro('Pedals',mx,'l1');g.macro('Amp',mx,'l2');g.macro('Glue',c,'mix');
  return{from:[[p1],[a]],to:[[lim,'mix']]};});
writeFileSync(new URL('factoryPresets.json',import.meta.url),JSON.stringify(presets));
/* for engine_test: every preset with the parameter ranges, as the editor sends them */
writeFileSync(new URL('../../tests/golden/nodefx-factory.json',import.meta.url),JSON.stringify({fxRanges:cat.ranges,presets}));
console.log(presets.length+' factory presets:',[...new Set(presets.map(p=>p.bank))].map(b=>b+' ('+presets.filter(p=>p.bank===b).length+')').join(', '));
