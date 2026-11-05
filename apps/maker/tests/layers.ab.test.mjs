// Layer B: a second patch from the same banks and lists, chosen on its own, playing together with patch A.
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('[data-view="sound"], #tabSound, button:has-text("Sound")').catch(()=>{});await p.waitForTimeout(600);
await p.click('#leftM [data-sn="play"]');await p.waitForTimeout(300);
ok(await p.locator('#snInsPlay [data-pl="layerB"]').count()===1,'the Playing inspector offers layer B');
await p.locator('#snInsPlay [data-pl="layerB"]').check();await p.waitForTimeout(300);
const r1=await p.evaluate(()=>{const v=window.__vs,S=v.S;return{tags:S.tags.filter(t=>t.layer).map(t=>t.name),a:v.curList()&&v.curList().name,b:v.curListB()&&v.curListB().name,txt:v.expand('{list.id} {list.name} | {listB.id} {listB.name} | {bankB}'),layerB:S.play.layerB};});
ok(r1.layerB&&r1.tags.join()==='bankB,listB','switching it on makes the bankB and listB tags ('+r1.tags+')');
ok(r1.a&&r1.b&&r1.a!==r1.b,'B starts on the next patch after A ('+r1.a+' / '+r1.b+')');
ok(/\| A\d\d /.test(r1.txt)&&r1.txt.indexOf(r1.b)>0,'texts show patch B: '+r1.txt);
const r2=await p.evaluate(()=>{const v=window.__vs;const a0=v.curList().name,b0=v.curListB().name;v.fireAct('listB','next');return{a0,b0,a1:v.curList().name,b1:v.curListB().name};});
ok(r2.a1===r2.a0&&r2.b1!==r2.b0,'next on listB changes only patch B ('+r2.b0+' -> '+r2.b1+', A stays '+r2.a1+')');
/* layer knobs */
await p.evaluate(()=>document.querySelectorAll("#snInsPlay details.snlinks").forEach(d=>d.open=true));
await p.selectOption('#snInsPlay [data-ly="1:link:vol"]',{index:1});await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelectorAll("#snInsPlay details.snlinks").forEach(d=>d.open=true));
await p.locator('#snInsPlay [data-ly="0:envon:"]').check();await p.waitForTimeout(200);
const r3=await p.evaluate(()=>{const S=window.__vs.S;return JSON.stringify(S.play.layers);});
ok(/"vol":\{"from":-60,"to":0,"tag":/.test(r3)&&/"on":true/.test(r3),'layer knobs and envelope are stored: '+r3.slice(0,120));
/* saved into the library */
const r4=await p.evaluate(async()=>{const v=window.__vs;const c=await v.buildVsamp();const m=c.manifest;return{f:m.features,b:m.project.currentListB,pl:!!m.project.play.layerB};});
ok(r4.pl&&r4.b>=0&&r4.f.indexOf('layers')>=0,'the library carries layer B ('+r4.b+', features '+r4.f.filter(x=>x==='layers')+')');
/* engine hears it */
await p.evaluate(()=>window.__visuStartAudio&&window.__visuStartAudio());await p.waitForTimeout(2500);
const lb=await p.evaluate(()=>window.__vs.ENG.lastListB);
ok(lb>=0,'the engine is told which list layer B plays ('+lb+')');
/* off again */
await p.locator('#snInsPlay [data-pl="layerB"]').uncheck();await p.waitForTimeout(300);
const r5=await p.evaluate(()=>({n:window.__vs.S.tags.filter(t=>t.layer).length,t:window.__vs.expand('{listB.name}')}));
ok(r5.n===0&&r5.t==='-','switching it off removes the tags');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
