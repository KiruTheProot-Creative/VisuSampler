// Makes tests/golden/golden.vsamp and golden.json with the JS core, so the C++ engine can be checked against it.
// Run: node apps/plugin/tests/make-golden.mjs
import {writeFileSync} from 'node:fs';
import {Pack,encodePCM,writeVsamp,zoneData} from '../../../packages/core/src/index.js';
const SR=44100,out=new URL('./golden/',import.meta.url);
const sine=(f,sec,a=.5)=>{const d=new Float32Array(Math.round(SR*sec));for(let i=0;i<d.length;i++)d[i]=Math.sin(2*Math.PI*f*i/SR)*a+Math.sin(2*Math.PI*f*3.01*i/SR)*a*.2;return d;};
const mk=o=>Object.assign({id:'z',group:'G',lo:0,hi:127,vlo:1,vhi:127,root:57,tune:0,vol:0,pan:0,start:0,end:0,vstart:0,rev:false,keytrack:true,oneshot:false,attack:0,release:80,
  fadeLo:0,fadeHi:0,vfadeLo:0,vfadeHi:0,curve:'power',seq:0,loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},o);
const samples=[{id:'m',name:'mono',sr:SR,chn:1,frames:0,root:57,fine:0,ch:[sine(220,.5)]},{id:'st',name:'stereo',sr:SR,chn:2,frames:0,root:57,fine:0,ch:[sine(220,.5),sine(330,.5,.4)]}];
samples.forEach(s=>s.frames=s.ch[0].length);
const zones=[
  mk({id:'lin',sample:'m',lo:40,hi:49,interp:'linear'}),
  mk({id:'cub',sample:'m',lo:50,hi:59,interp:'cubic'}),
  mk({id:'sinc',sample:'m',lo:60,hi:69,interp:'sinc'}),
  mk({id:'loop',sample:'m',lo:70,hi:79,interp:'cubic',loop:{on:true,s:4000,e:15000,xf:1500,xcurve:'power',pp:false}}),
  mk({id:'ster',sample:'st',lo:80,hi:89,interp:'linear'}),
  mk({id:'start',sample:'m',lo:90,hi:99,interp:'linear',start:50,end:300,tune:37}),
];
const ctx={buffer:id=>{const s=samples.find(x=>x.id===id);return{ch:s.ch,sr:SR};},sample:id=>samples.find(s=>s.id===id),group:()=>({tune:0,interp:'inherit'}),defaultInterp:'linear',bpm:120,sig:{n:4,d:4},tagValue:()=>null};
const pack=new Pack(),smeta=[];
for(const s of samples){smeta.push({id:s.id,name:s.name,sr:SR,chn:s.chn,frames:s.frames,root:s.root,fine:0,loop:null,bits:32,data:await pack.add(encodePCM(s.ch,32),{compress:true})});}
const manifest={format:'vsamp',formatVersion:1,lib:{id:'golden',name:'Golden é中',version:'1.0.0',accent:'#123456'},banner:{images:{}},project:{gset:{G:{mode:'normal',interp:'inherit',velcurve:1}},bpm:120},samples:smeta,zones};
writeFileSync(new URL('golden.vsamp',out),writeVsamp(manifest,pack));
const N=3000,cases=[],r6=v=>Math.round(v*1e6)/1e6;
for(const [zid,note] of [['lin',45],['lin',40],['cub',55],['cub',59],['sinc',65],['sinc',60],['loop',75],['ster',85],['start',95]]){
  const z=zones.find(x=>x.id===zid),d=zoneData(ctx,z,note,127,0,0,SR);
  const pan=z.pan===0&&d.ch.length===1?Math.cos(Math.PI/4):1;
  const L=Array.from(d.ch[0].subarray(0,N),v=>r6(v*pan)),R=d.ch.length>1?Array.from(d.ch[1].subarray(0,N),r6):L;
  cases.push({zone:zid,note,vel:127,frames:Math.min(N,d.ch[0].length),L,R});
}
writeFileSync(new URL('golden.json',out),JSON.stringify({sampleRate:SR,cases}));
console.log('wrote golden for',cases.length,'cases');
