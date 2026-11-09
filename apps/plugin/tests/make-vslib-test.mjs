// Makes tests/golden/lib.vslib: a library with two banks holding three of the test instruments (one of them streams),
// so engine_test can check that each instrument inside plays exactly like its own file.
import {readFileSync,writeFileSync} from 'node:fs';
import {writeVslib} from '../../../packages/core/src/index.js';
const dir=new URL('./golden/',import.meta.url),f=n=>new Uint8Array(readFileSync(new URL(n,dir)));
const tile=new Uint8Array([0x89,0x50,0x4e,0x47,1,2,3,4]);   // not a real picture: only checks that banner images survive
const bytes=await writeVslib({
  lib:{id:'testlib',name:'Test Library',author:'VisuSampler tests',version:'1.0.0'},
  images:{tile},
  banks:[
    {name:'01. Keys',instruments:[{id:'golden',name:'Golden',bytes:f('golden.vsamp')},{id:'fxplay',name:'FX Play',desc:'macros and bypass',bytes:f('fx-play.vsamp')}]},
    {name:'02. Long',instruments:[{id:'stream',name:'Streaming',bytes:f('stream.vsamp')}]}
  ]});
writeFileSync(new URL('lib.vslib',dir),bytes);
console.log('lib.vslib:',bytes.length,'bytes');
