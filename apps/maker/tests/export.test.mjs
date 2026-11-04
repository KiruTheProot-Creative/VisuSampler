import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');
await p.click('[data-view="export"]');await p.waitForTimeout(300);
const r=await p.evaluate(async()=>{
  const v=window.__vs,S=v.S,o=S.lib.export,out={};v.ensureAudio();
  const a=await v.buildVsamp();out.offOk=(await v.parseVsamp(a.bytes)).ok;out.offSize=a.bytes.length;
  o.bake=true;o.mode='smart';o.step=3;o.quality='cubic';
  const e=v.estimate(o),c=await v.buildVsamp(),pc=await v.parseVsamp(c.bytes);
  out.onOk=pc.ok;out.onSize=c.bytes.length;out.chunks=c.report.chunks;out.est=e.chunks;out.zonesUntouched=S.zones.length;
  const bad=c.bytes.slice();bad[bad.length-5]^=255;out.corrupt=(await v.parseVsamp(bad)).ok;
  return out;
});
console.log(JSON.stringify(r));
ok(r.offOk&&r.onOk,'built files verify');ok(r.onSize>r.offSize*5,'baking makes the file bigger');ok(r.chunks===r.est,'estimate chunks match build');ok(r.corrupt===false,'corruption is caught');ok(r.zonesUntouched===15,'project not changed by baking');
await p.click('[data-xa="build"]');await p.waitForTimeout(500);
console.log(app.errs.join('\n')||'NO PAGE ERRORS');ok(app.errs.length===0,'no page errors');
console.log(fails.length?fails.join('\n'):'ALL OK');await app.close();process.exit(fails.length?1:0);
