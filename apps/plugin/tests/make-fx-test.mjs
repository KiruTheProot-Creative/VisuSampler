// Makes tests/golden/fx.vsamp: one sample group per FX module (each on its own key), plus routing and modulation cases.
// fx-catalog.json is the Maker's module catalog (ranges and defaults), saved from the Maker.
import {readFileSync,writeFileSync} from 'node:fs';
import {Pack,encodePCM,writeVsamp} from '../../../packages/core/src/index.js';
const SR=48000,dir=new URL('./golden/',import.meta.url),cat=JSON.parse(readFileSync(new URL('fx-catalog.json',dir),'utf8'));
const saw=(f,sec)=>{const d=new Float32Array(Math.round(SR*sec));for(let i=0;i<d.length;i++){const t=i/SR,ph=(t*f)%1;d[i]=(ph*2-1)*.4*Math.min(1,t*40)*Math.exp(-t*1.2);}return d;};
const ir=new Float32Array(SR*.4);for(let i=0;i<ir.length;i++)ir[i]=(Math.random()*2-1)*Math.exp(-i/SR*12);ir[0]=1;
const samples=[{id:'s',name:'saw',ch:[saw(110,1.2)]},{id:'ir',name:'room-ir',ch:[ir]}];
let nid=1;const node=(type,o)=>{const d=cat.defs[type];return Object.assign({id:'n'+(nid++),type,x:0,y:0,bypass:false,name:type,p:Object.assign({},d?d.p:{}),tag:{}},o||{});};
const cable=(a,ap,b,bp,amt)=>({id:'c'+(nid++),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:amt==null?50:amt});
const graphs={},zones=[],groups=[],cases=[];
const FX=Object.keys(cat.defs).filter(k=>cat.defs[k].kind==='fx');
let key=24;
for(const t of FX){
  if(['ret','mixer','msjoin'].includes(t))continue;
  const g='g_'+t;groups.push(g);const i=node('input'),o=node('output'),n=node(t);
  if(t==='conv')n.s={ir:'ir'};
  if('mix' in n.p)n.p.mix=100;
  const d=cat.defs[t],outP=d.raw?d.outs[0]:'mix',inP=d.ins[0];
  const nodes=[i,o,n],cables=[cable(i,'out',n,inP),cable(n,outP,o,'in')];
  if(t==='mssplit'){const j=node('msjoin');nodes.push(j);cables.length=1;cables.push(cable(n,'mid',j,'mid'),cable(n,'side',j,'side'),cable(j,'out',o,'in'));}
  if(t==='xover'){cables.push(cable(n,'mid',o,'in'),cable(n,'high',o,'in'));}
  graphs[g]={nodes,cables};
  zones.push({id:'z_'+t,sample:'s',group:g,lo:key,hi:key,root:key,vlo:1,vhi:127});cases.push({key,module:t});key++;
}
/* send in a group chain, return in the master chain */
{const g='g_sendret';groups.push(g);const i=node('input'),o=node('output'),s=node('send',{p:{bus:1,level:0}}),m=node('util',{p:{gain:-60,pan:0,width:100}});
 graphs[g]={nodes:[i,o,s,m],cables:[cable(i,'out',s,'in'),cable(s,'out',m,'in'),cable(m,'out',o,'in')]};
 zones.push({id:'z_sr',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'sendreturn'});key++;}
/* LFO on a filter cutoff, and a knob (tag) on a second filter's cutoff */
{const g='g_lfo';groups.push(g);const i=node('input'),o=node('output'),f=node('filter',{p:Object.assign({},cat.defs.filter.p,{cutoff:2000,res:60})}),l=node('lfo',{p:{rate:4,shape:0,depth:100,retrig:0}});
 graphs[g]={nodes:[i,o,f,l],cables:[cable(i,'out',f,'in'),cable(f,'mix',o,'in'),cable(l,'out',f,'p:cutoff',80)]};
 zones.push({id:'z_lfo',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'lfo-mod'});key++;}
{const g='g_tag';groups.push(g);const i=node('input'),o=node('output'),f=node('filter',{p:Object.assign({},cat.defs.filter.p,{cutoff:8000}),tag:{cutoff:'t_cut'}});
 graphs[g]={nodes:[i,o,f],cables:[cable(i,'out',f,'in'),cable(f,'mix',o,'in')]};
 zones.push({id:'z_tag',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'tag'});key++;}
/* a macro on a knob sweeps a filter, and a knob bypasses a delay (cut off, or letting its echoes ring out) */
{const g='g_macro';groups.push(g);const i=node('input'),o=node('output'),f=node('filter',{p:Object.assign({},cat.defs.filter.p,{cutoff:20,res:0})}),m=node('macro',{tag:{value:'t_cut'}});
 graphs[g]={nodes:[i,o,f,m],cables:[cable(i,'out',f,'in'),cable(f,'mix',o,'in'),cable(m,'out',f,'p:cutoff',100)]};
 zones.push({id:'z_macro',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'macro'});key++;}
for(const tails of [false,true]){const g='g_byp'+(tails?'t':'');groups.push(g);const i=node('input'),o=node('output'),d=node('delay',{p:Object.assign({},cat.defs.delay.p,{time:120,fb:60,mix:100}),byTag:{tag:'t_cut',inv:false,tails}});
 graphs[g]={nodes:[i,o,d],cables:[cable(i,'out',d,'in'),cable(d,'mix',o,'in')]};
 zones.push({id:'z_byp'+(tails?'t':''),sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:tails?'bypass-tails':'bypass'});key++;}
/* "Sync to tempo" on a delay: 1/4 note (index 10 of the 18 note values), only the echo comes out */
{const g='g_sync';groups.push(g);const i=node('input'),o=node('output'),d=node('delay',{id:'dsync',p:Object.assign({},cat.defs.delay.p,{time:120,fb:0,mix:100}),sync:true,ps:{time:10/17}});
 graphs[g]={nodes:[i,o,d],cables:[cable(i,'out',d,'in'),cable(d,'wet',o,'in')]};
 zones.push({id:'z_sync',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'sync'});key++;}
/* feedback loop through a delay must stay stable */
{const g='g_loop';groups.push(g);const i=node('input'),o=node('output'),d=node('delay',{p:Object.assign({},cat.defs.delay.p,{fb:0,mix:100})}),f=node('filter');
 graphs[g]={nodes:[i,o,d,f],cables:[cable(i,'out',d,'in'),cable(d,'wet',f,'in'),cable(f,'mix',d,'in'),cable(d,'mix',o,'in')]};
 zones.push({id:'z_loop',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'feedback'});key++;}
/* an amp fed back into itself (a mic in front of its own speaker): howls, but stays bounded */
{const g='g_ampfb';groups.push(g);const i=node('input'),o=node('output'),a=node('amp',{p:Object.assign({},cat.defs.amp.p,{gain:85,mix:100})}),u=node('util',{p:{gain:6,pan:0,width:100}});
 graphs[g]={nodes:[i,o,a,u],cables:[cable(i,'out',a,'in'),cable(a,'mix',u,'in'),cable(u,'out',a,'in'),cable(a,'mix',o,'in')]};
 zones.push({id:'z_ampfb',sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:'feedback-amp'});key++;}
/* every mode of the multi-mode modules (the EmulonX set) */
for(const [t,k,count] of [['reverb','type',7],['delay','pp',4],['dist','type',10],['comp','mode',3],['chorus','mode',3]])
  for(let m=0;m<count;m++){
    const g='g_'+t+m;groups.push(g);const i=node('input'),o=node('output'),n=node(t);n.p[k]=m;if('mix' in n.p)n.p.mix=100;
    graphs[g]={nodes:[i,o,n],cables:[cable(i,'out',n,'in'),cable(n,'mix',o,'in')]};
    zones.push({id:'z_'+t+m,sample:'s',group:g,lo:key,hi:key,root:key});cases.push({key,module:t+':'+k+'='+m});key++;
  }
{const mi=node('input'),mo=node('output'),r=node('ret',{p:{bus:1,level:0}});graphs.master={nodes:[mi,mo,r],cables:[cable(mi,'out',mo,'in'),cable(r,'out',mo,'in')]};}
const full=z=>Object.assign({vlo:1,vhi:127,tune:0,vol:0,pan:0,start:0,end:0,vstart:0,rev:false,keytrack:true,oneshot:false,attack:0,release:50,fadeLo:0,fadeHi:0,vfadeLo:0,vfadeHi:0,curve:'power',seq:1,loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},z);
const pack=new Pack(),smeta=[];
for(const s of samples)smeta.push({id:s.id,name:s.name,sr:SR,chn:1,frames:s.ch[0].length,root:60,fine:0,loop:null,bits:32,data:await pack.add(encodePCM(s.ch,32),{compress:true})});
const project={bpm:120,sig:{n:4,d:4},fx:graphs,gset:{},lists:[],banks:[],els:[],tags:[{id:'t_cut',name:'cut',kind:'number',value:.9,def:.9,steps:[]}],interp:'linear'};
const manifest={format:'vsamp',formatVersion:1,lib:{id:'fxtest',name:'FX test'},banner:{images:{}},project,fxRanges:cat.ranges,features:[],samples:smeta,zones:zones.map(full)};
writeFileSync(new URL('fx.vsamp',dir),writeVsamp(manifest,pack));
writeFileSync(new URL('fx-cases.json',dir),JSON.stringify(cases));
/* fx-play.vsamp: only the macro and bypass cases, so nothing else in the chains (crackle, hiss) colours the measurements */
{const keep=['g_macro','g_byp','g_bypt','g_sync','g_ampfb'],g2={master:{nodes:[node('input'),node('output')],cables:[]}};g2.master.cables=[cable(g2.master.nodes[0],'out',g2.master.nodes[1],'in')];
 keep.forEach(k=>{g2[k]=graphs[k];});
 const m2=Object.assign({},manifest,{lib:{id:'fxplay',name:'FX play test'},project:Object.assign({},project,{fx:g2}),zones:zones.filter(z=>keep.includes(z.group)).map(full)});
 writeFileSync(new URL('fx-play.vsamp',dir),writeVsamp(m2,pack));}
console.log('fx test library:',cases.length,'cases');
