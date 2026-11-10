// Makes tests/golden/rack-*.json: NodeFX chains (the editor's format) for engine_test's checks of FxRack.
import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./golden/',import.meta.url),cat=JSON.parse(readFileSync(new URL('fx-catalog.json',dir),'utf8'));
let k=0;
const node=(type,p,o)=>Object.assign({id:'n'+(++k),type,x:0,y:0,bypass:false,name:type,p:Object.assign({},cat.defs[type]?cat.defs[type].p:{},p||{}),tag:{}},o||{});
const cable=(a,ap,b,bp)=>({id:'c'+(++k),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:50});
const rack=(name,nodes,cables,tags)=>({name,graph:{nodes,cables},fxRanges:cat.ranges,tags:tags||[]});
const out={};
{const i=node('input'),o=node('output'),d=node('delay',{time:100,fb:0,mix:100},{id:'dly'});out.delay=rack('Delay 100 ms',[i,o,d],[cable(i,'out',d,'in'),cable(d,'wet',o,'in')]);}
{const i=node('input'),o=node('output'),f=node('filter',{cutoff:20000,res:0,mix:100},{tag:{cutoff:'m1'}});
 out.macro=rack('Macro on cutoff',[i,o,f],[cable(i,'out',f,'in'),cable(f,'mix',o,'in')],[{id:'m1',name:'Tone',kind:'number',def:1,value:1}]);}
{const i=node('input'),o=node('output'),a=node('amp',{gain:85,mix:100}),u=node('util',{gain:6,pan:0,width:100});
 out.amp=rack('Amp feedback',[i,o,a,u],[cable(i,'out',a,'in'),cable(a,'mix',u,'in'),cable(u,'out',a,'in'),cable(a,'mix',o,'in')]);}
{const i=node('input'),o=node('output'),z=node('nosuchfx');out.unknown=rack('Unknown module',[i,o,z],[cable(i,'out',z,'in'),cable(z,'mix',o,'in')]);}
{const i=node('input'),o=node('output');out.thru=rack('Empty',[i,o],[cable(i,'out',o,'in')]);}
for(const n of Object.keys(out))writeFileSync(new URL('rack-'+n+'.json',dir),JSON.stringify(out[n]));
console.log('NodeFX test racks:',Object.keys(out).join(', '));
