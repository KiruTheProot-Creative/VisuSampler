// Makes tests/golden/stream.vsamp (raw audio chunks) and stream-z.vsamp (packed chunks): long samples the player streams from disk.
import {writeFileSync} from 'node:fs';
import {Pack,encodePCM,writeVsamp} from '../../../packages/core/src/index.js';
const SR=48000,CH=32768,dir=new URL('./golden/',import.meta.url);
/* 12 s, stereo, a slow sweep plus a deterministic noise bed, so any wrong frame shows */
const N=SR*12,L=new Float32Array(N),R=new Float32Array(N);let ph=0,seed=7;
for(let i=0;i<N;i++){const f=110+440*i/N;ph+=f/SR;seed=(seed*1103515245+12345)>>>0;const n=((seed>>>8)/16777216-.5)*.1;L[i]=Math.sin(2*Math.PI*ph)*.5+n;R[i]=Math.sin(2*Math.PI*ph*1.5)*.4-n;}
const zone=o=>Object.assign({vlo:1,vhi:127,tune:0,vol:0,pan:0,start:0,end:0,vstart:0,rev:false,keytrack:true,oneshot:false,attack:0,release:30,fadeLo:0,fadeHi:0,vfadeLo:0,vfadeHi:0,curve:'power',seq:0,group:'G',loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},o);
for(const [file,compress,bits] of [['stream.vsamp',false,16],['stream-z.vsamp',true,24]]){
  const pack=new Pack(),chunks=[];
  for(let a=0;a<N;a+=CH)chunks.push(await pack.add(encodePCM([L.subarray(a,Math.min(N,a+CH)),R.subarray(a,Math.min(N,a+CH))],bits),{compress}));
  const samples=[{id:'long',name:'long',sr:SR,chn:2,frames:N,root:60,fine:0,loop:null,bits,chunkFrames:CH,chunks}];
  const zones=[zone({id:'z1',sample:'long',lo:0,hi:79,root:60}),zone({id:'z2',sample:'long',lo:80,hi:127,root:84,start:3000})];
  const manifest={format:'vsamp',formatVersion:1,lib:{id:'stream',name:'Stream test'},banner:{images:{}},project:{gset:{G:{mode:'normal'}},bpm:120},samples,zones};
  writeFileSync(new URL(file,dir),writeVsamp(manifest,pack));
}
/* stream-loop.vsamp: looped zones (crossfade, ping-pong) on the long sample stream too; a loop that starts inside the
   in-memory head keeps its sample fully in memory */
{ const pack=new Pack(),chunks=[],chunks2=[];
  for(let a=0;a<N;a+=CH)chunks.push(await pack.add(encodePCM([L.subarray(a,Math.min(N,a+CH)),R.subarray(a,Math.min(N,a+CH))],16),{compress:false}));
  for(let a=0;a<N;a+=CH)chunks2.push(await pack.add(encodePCM([L.subarray(a,Math.min(N,a+CH)),R.subarray(a,Math.min(N,a+CH))],16),{compress:false}));
  const samples=[{id:'long',name:'long',sr:SR,chn:2,frames:N,root:60,fine:0,loop:null,bits:16,chunkFrames:CH,chunks},
                 {id:'early',name:'early',sr:SR,chn:2,frames:N,root:60,fine:0,loop:null,bits:16,chunkFrames:CH,chunks:chunks2}];
  const zones=[zone({id:'z1',sample:'long',lo:0,hi:63,root:60,loop:{on:true,s:SR*2.5,e:SR*4,xf:4800,xcurve:'power',pp:false}}),
               zone({id:'z2',sample:'long',lo:64,hi:90,root:72,loop:{on:true,s:SR*1.5,e:SR*2.25,xf:2400,xcurve:'linear',pp:true}}),
               zone({id:'z3',sample:'early',lo:91,hi:127,root:96,loop:{on:true,s:2000,e:9000,xf:500,xcurve:'s',pp:false}})];
  const manifest={format:'vsamp',formatVersion:1,lib:{id:'streamloop',name:'Stream loop test'},banner:{images:{}},project:{gset:{G:{mode:'normal'}},bpm:120},samples,zones};
  writeFileSync(new URL('stream-loop.vsamp',dir),writeVsamp(manifest,pack)); }
console.log('stream test libraries written');
