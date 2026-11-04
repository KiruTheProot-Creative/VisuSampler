// The WebAssembly build must sound exactly like the native engine: same golden vectors as apps/plugin/tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {instantiate} from '../src/engine.js';
const wasmUrl=new URL('../engine.wasm',import.meta.url),golden=new URL('../../../apps/plugin/tests/golden/',import.meta.url);
const have=existsSync(wasmUrl);
test('engine.wasm matches the golden vectors',{skip:!have&&'engine.wasm not built yet'},async()=>{
  const g=JSON.parse(readFileSync(new URL('golden.json',golden),'utf8')),bytes=new Uint8Array(readFileSync(new URL('golden.vsamp',golden)));
  for(const c of g.cases){
    const e=await instantiate(readFileSync(wasmUrl));e.prepare(44100,4096);e.setGain(1);
    assert.equal(e.load(bytes),null);e.noteOn(c.note,c.vel);
    const [L,R]=e.render(c.frames);let err=0;
    for(let i=0;i<c.frames;i++)err=Math.max(err,Math.abs(L[i]-c.L[i]),Math.abs(R[i]-c.R[i]));
    assert.ok(err<3e-4,c.zone+' note '+c.note+' max error '+err);
  }
});
test('engine.wasm plays the demo library and refuses junk',{skip:!have&&'engine.wasm not built yet'},async()=>{
  const e=await instantiate(readFileSync(wasmUrl));e.prepare(48000,512);
  assert.match(e.load(new Uint8Array(40)),/Not a \.vsamp/);
  assert.equal(e.load(new Uint8Array(readFileSync(new URL('../../../examples/rompler-demo.vsamp',import.meta.url)))),null);
  assert.equal(e.zones,15);
  e.noteOn(50,100);e.noteOn(62,120);let pk=0;
  for(let b=0;b<10;b++){const [L]=e.render(512);for(const v of L){assert.ok(Number.isFinite(v));pk=Math.max(pk,Math.abs(v));}}
  assert.ok(pk>.01,'audible '+pk);assert.ok(e.voices>=2);
});
