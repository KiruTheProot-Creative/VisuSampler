import test from 'node:test';
import assert from 'node:assert/strict';
import {resample,stretchCh,wavetableRender,detectTransients,smDefaults,smOf,uniVoices,zoneData,crc32,encodePCM,decodePCM,Pack,writeVsamp,readVsamp,verifyVsamp,
  estimate,buildExportSet,bakePlan,noteName} from '../src/index.js';

const SR=44100;
const sine=(f,sec,sr=SR)=>{const d=new Float32Array(Math.round(sr*sec));for(let i=0;i<d.length;i++)d[i]=Math.sin(2*Math.PI*f*i/sr)*.5;return d;};
const mkZone=o=>Object.assign({id:'z1',sample:'a',group:'G',lo:48,hi:59,vlo:1,vhi:127,root:53,tune:0,vol:0,pan:0,start:0,end:0,vstart:0,rev:false,keytrack:true,fadeLo:0,fadeHi:0,
  loop:{on:false,s:0,e:0,xf:0,xcurve:'power',pp:false}},o||{});
function project(){
  const ch=[sine(220,1)],samples=[{id:'a',name:'Sine',sr:SR,chn:1,frames:ch[0].length,root:53,fine:0}];
  const bufs=new Map([['a',{ch,sr:SR}]]);
  const ctx={buffer:id=>bufs.get(id),sample:id=>samples.find(s=>s.id===id),group:()=>({tune:0,interp:'inherit'}),defaultInterp:'linear',bpm:120,sig:{n:4,d:4},tagValue:()=>null};
  return{ctx,samples,zones:[mkZone()],bufs};
}
const rms=d=>Math.sqrt(d.reduce((a,v)=>a+v*v,0)/d.length);

test('noteName uses C3 = 60',()=>{assert.equal(noteName(60),'C3');assert.equal(noteName(69),'A3');});
test('crc32 known value',()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xCBF43926);});
test('resample: octave up halves the length and doubles the pitch',()=>{
  const out=resample(sine(220,1),2,'sinc',Math.ceil(SR/2));
  let zc=0;for(let i=1;i<out.length;i++)if(out[i-1]<0&&out[i]>=0)zc++;
  assert.ok(Math.abs(zc-220)<4,'zero crossings '+zc);
});
test('stretch: factor 2 doubles the length',()=>{assert.equal(stretchCh(sine(220,.5),2,2048,true).length,SR);});
test('pcm round trip for 16, 24 and 32 bit',()=>{
  const ch=[sine(100,.05)];
  for(const bits of[16,24,32]){const back=decodePCM(encodePCM(ch,bits),1,bits)[0];let e=0;for(let i=0;i<back.length;i++)e=Math.max(e,Math.abs(back[i]-ch[0][i]));assert.ok(e<(bits===16?1e-4:1e-6),bits+' err '+e);}
});
test('wavetable: loop is a whole number of cycles',()=>{
  const fl=256,src=new Float32Array(fl*4);for(let f=0;f<4;f++)for(let i=0;i<fl;i++)src[f*fl+i]=Math.sin(2*Math.PI*i/fl)*.8;
  const r=wavetableRender({ch:[src],sr:SR},{frame:fl,pos:0,pos2:-1,sweep:0},330,SR,0);
  assert.ok(r.loop.e-r.loop.s>0&&r.ch[0].length===r.loop.e);
});
test('transients: finds the clicks',()=>{
  const d=new Float32Array(SR*2);[0,.5,1,1.5].forEach(t=>{for(let i=0;i<2000;i++)d[Math.floor(t*SR)+i]=(Math.random()*2-1)*Math.exp(-i/300);});
  assert.equal(detectTransients(d,SR,60).length,4);
});
test('unison: voice count, balanced gain',()=>{
  const sm=smDefaults();sm.uni.on=true;sm.uni.voices=7;
  const v=uniVoices(sm);assert.equal(v.length,7);assert.ok(Math.abs(v.reduce((a,x)=>a+x.gain*x.gain,0)-1.15**2)<1e-9);
  assert.equal(uniVoices(smDefaults()).length,1);
});
test('zoneData: playing an octave above root halves the length',()=>{
  const {ctx}=project(),a=zoneData(ctx,mkZone(),53,100,0,0,SR),b=zoneData(ctx,mkZone({hi:70}),65,100,0,0,SR);
  assert.ok(Math.abs(b.ch[0].length*2-a.ch[0].length)<3);
});
test('zoneData: loop crossfade keeps the loop inside the buffer',()=>{
  const {ctx}=project(),z=mkZone({loop:{on:true,s:10000,e:30000,xf:2000,xcurve:'power',pp:false}}),r=zoneData(ctx,z,53,100,0,0,SR);
  assert.ok(r.loop&&r.loop.e<=r.ch[0].length);
});
test('.vsamp: build, read back, verify, and catch corruption',async()=>{
  const pack=new Pack(),ch=[sine(220,.3)],ref=await pack.add(encodePCM(ch,16),{compress:true});
  const manifest={format:'vsamp',formatVersion:1,banner:{images:{}},samples:[{id:'a',name:'Sine',sr:SR,chn:1,frames:ch[0].length,bits:16,data:ref}],zones:[{sample:'a'}]};
  const bytes=writeVsamp(manifest,pack),v=await verifyVsamp(bytes);
  assert.ok(v.ok,v.errors.join());assert.equal(ref.enc,'deflate');
  const bad=bytes.slice();bad[bad.length-3]^=255;assert.equal((await verifyVsamp(bad)).ok,false);
  const bad2=bytes.slice();bad2[2]=0;assert.throws(()=>readVsamp(bad2));
  const bad3=bytes.slice();bad3[20]^=1;assert.equal((await verifyVsamp(bad3)).ok,false);
});
test('bake: plan keeps root +-2 live in smart mode',()=>{
  const p=bakePlan(mkZone(),{mode:'smart'},3);
  assert.deepEqual(p.keep,[51,55]);assert.ok(p.chunks.every(c=>c.hi<51||c.lo>55));
  assert.equal(bakePlan(mkZone(),{mode:'full'},4).chunks.length,3);
});
test('bake: estimate matches what is built (before compression)',async()=>{
  const {ctx,samples,zones}=project(),o={bake:true,mode:'full',step:3,budgetOn:false,quality:'cubic',bakeUni:true,bits:16,includeUnused:false,includeOrig:false};
  const proj={samples,zones},e=estimate(ctx,proj,o),set=await buildExportSet(ctx,proj,o);
  const real=set.samples.reduce((a,s)=>a+s.ch[0].length*s.ch.length*2,0);
  assert.ok(Math.abs(real-e.after)/e.after<.01,real+' vs '+e.after);
  assert.equal(set.zones.length,4);assert.ok(set.zones.every(z=>z.keytrack&&z.tune===0));
  assert.equal(zones.length,1,'project untouched');
});
test('bake off: file holds the originals only',async()=>{
  const {ctx,samples,zones}=project(),o={bake:false,mode:'smart',step:3,quality:'sinc',bakeUni:true,bits:16,includeUnused:false,includeOrig:false};
  const set=await buildExportSet(ctx,{samples,zones},o);assert.equal(set.samples.length,1);assert.equal(set.zones.length,1);
});
test('bake: size budget picks a bigger step',()=>{
  const {ctx,samples,zones}=project(),proj={samples,zones},base={bake:true,mode:'full',step:1,quality:'linear',bakeUni:true,bits:16,budgetOn:true,includeUnused:false,includeOrig:false};
  const big=estimate(ctx,proj,Object.assign({},base,{budgetOn:false})).after;
  const st=estimate(ctx,proj,Object.assign({},base,{budgetMB:big/1048576*.4})).step;assert.ok(st>1);
});
test('the example library made by the prototype opens and verifies in core',async()=>{
  const {readFileSync}=await import('node:fs');
  const bytes=new Uint8Array(readFileSync(new URL('../../../apps/player/examples/rompler-demo.vsamp',import.meta.url)));
  const v=await verifyVsamp(bytes);assert.ok(v.ok,v.errors.join());assert.equal(v.manifest.lib.name,'Rompler Demo');
});
