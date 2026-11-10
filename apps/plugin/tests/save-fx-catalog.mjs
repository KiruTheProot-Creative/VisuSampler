// Saves golden/fx-catalog.json from VisuMaker's own module catalog (FXT): every module's parameter ranges (the same
// arrays the Maker exports as fxRanges) and its defaults. The engine tests and NodeFX's factory presets
// (nodefx/presets/make-presets.mjs) read it. Run after changing a module in the Maker: node save-fx-catalog.mjs
import {writeFileSync} from 'node:fs';
import {openApp} from '../../maker/tests/_helper.mjs';
const app=await openApp({width:1200,height:800});
const cat=await app.p.evaluate(()=>{
  const FXT=window.__vs.FXT,ranges={},defs={};
  Object.keys(FXT).forEach(k=>{const d=FXT[k];ranges[k]={};const p={};
    d.params.forEach(q=>{ranges[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0,q.log?1:0,q.unit==='Hz'?1:0];p[q.k]=q.def;});
    defs[k]={kind:d.kind,ins:d.ins,outs:d.outs,raw:!!d.raw,p};});
  return{ranges,defs};
});
await app.close();
const out=new URL('./golden/fx-catalog.json',import.meta.url);
writeFileSync(out,JSON.stringify(cat));
console.log('saved',Object.keys(cat.ranges).length,'modules to',out.pathname);
