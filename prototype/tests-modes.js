const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}),p=await b.newPage({viewport:{width:1500,height:860}});
const errs=[],fails=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|net::|Failed to load/.test(m.text()))errs.push('CONSOLE '+m.text());});
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.addInitScript(()=>{window.__VSTEST=1;});
await p.goto('file://'+process.cwd()+'/visumaker-designer-4.html');await p.waitForTimeout(500);
await p.click('[data-view=samples]');await p.waitForTimeout(300);
await p.screenshot({path:'a1.png'});
const r=await p.evaluate(()=>{
  const v=window.__vs;v.ensureAudio();const out={};
  const s=v.S.samples.find(s=>s.name==='Felt_C2_hard');const z=v.S.zones.find(z=>z.sample===s.id);
  const chk=d=>d.ch.every(c=>{for(let i=0;i<c.length;i+=7)if(!isFinite(c[i]))return false;return true;});
  const run=(name,fn)=>{const t=performance.now();const d=v.zoneData(z,z.root+5,100,0,0,44100);out[name]=[d.ch[0].length,chk(d),!!d.loop,Math.round(performance.now()-t)];};
  const sm=v.smOf(s);
  run('sampler',0);
  sm.mode='speedkeep';sm.sk.speed=100;run('speedkeep',0);
  sm.sk.speed=50;run('speedkeep50',0);
  sm.sk.quality='ola';run('ola',0);sm.sk.quality='wsola';
  sm.mode='granular';run('granular',0);
  sm.mode='slicer';run('slicer',0);
  sm.mode='sampler';
  const w=v.demoExtras('wt');v.smOf(w).mode='wavetable';const zw=v.mkZone({id:'zw',sample:w.id,group:'Felt Piano',root:60,lo:0,hi:127});
  const dw=v.zoneData(zw,64,100,0,0,44100);out.wavetable=[dw.ch[0].length,chk(dw),!!dw.loop];
  v.smOf(w).wt.pos2=100;const dw2=v.zoneData(zw,64,100,0,0,44100);out.wtsweep=[dw2.ch[0].length,chk(dw2),dw2.loop&&dw2.loop.e-dw2.loop.s];
  const bt=v.demoExtras('beat');out.slices=v.smOf(bt).slices.length;
  sm.uni.on=true;sm.uni.voices=7;out.uni=v.uniVoices(sm).length;sm.uni.mode='chord';sm.uni.chord='0,4,7,12';out.chord=v.uniVoices(sm).length;sm.uni.on=false;
  return out;});
console.log(JSON.stringify(r));
ok(r.speedkeep[1]&&r.granular[1]&&r.wavetable[1]&&r.sampler[1],'all modes render finite audio');
ok(r.speedkeep50[0]>r.speedkeep[0]*1.5,'speedkeep 50% roughly doubles length');
ok(r.slices>=4&&r.slices<=10,'beat slices detected: '+r.slices);
ok(r.uni===7&&r.chord===4,'unison voice counts');
// voices from unison
await p.evaluate(()=>{const v=window.__vs,s=v.S.samples.find(s=>s.name==='Felt_C2_hard');const sm=v.smOf(s);sm.uni.on=true;sm.uni.voices=6;sm.uni.mode='detune';v.touchMap();v.S.map.follow=false;v.noteOn(50,120);});
await p.waitForTimeout(250);
const vc=await p.evaluate(()=>window.__vs.SV.list.filter(v=>!v.dead).length);ok(vc>=6,'unison plays '+vc+' voices');
await p.evaluate(()=>window.__vs.noteOff(50));
// map slices
await p.evaluate(()=>{const v=window.__vs;const bt=v.S.samples.find(s=>s.name.indexOf('Beat')===0);v.mapSlices(bt,36);});
ok(await p.evaluate(()=>window.__vs.S.zones.filter(z=>z.slice!==undefined).length)>=4,'slices mapped to zones');
// edit ops
const res=await p.evaluate(()=>{const v=window.__vs;const s=v.S.samples.find(s=>s.name.indexOf('Beat')===0);v.S.smp.sel=s.id;const n0=s.frames;
  v.S.smp.a=1000;v.S.smp.b=5000;v.smOp('cut');const n1=s.frames;v.smOp('normalize');v.smOp('reverse');v.smOp('revert');return[n0,n1,s.frames];});
ok(res[1]===res[0]-4000&&res[2]===res[0],'cut removes selection and revert restores ('+res+')');
// UI: switch to samples tab & click things
await p.click('[data-sa=demobeat]');await p.waitForTimeout(200);
await p.click('#smToolSlice');
const cv=await p.$('#smCanvas'),bb=await cv.boundingBox();await p.mouse.click(bb.x+300,bb.y+100);await p.waitForTimeout(100);
await p.selectOption('[data-sk="sm.mode"]','granular');await p.waitForTimeout(150);
await p.screenshot({path:'a2.png'});
console.log(errs.join('\n')||'NO PAGE ERRORS');console.log(fails.length?fails.join('\n'):'ALL OK');await b.close();})();
