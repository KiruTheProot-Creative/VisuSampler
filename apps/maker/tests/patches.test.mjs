// Patch mode "group": a list is a folder of groups, each group one patch; samples that play on key release.
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('button:has-text("Sound")').catch(()=>{});await p.waitForTimeout(600);
await p.click('#leftM [data-sn="play"]');await p.waitForTimeout(300);
await p.selectOption('#snInsPlay [data-pl="patchMode"]','group');await p.waitForTimeout(300);
const r1=await p.evaluate(()=>{const v=window.__vs,S=v.S;const l=v.curList();return{mode:S.play.patchMode,tag:!!S.tags.find(t=>t.name==='patch'),groups:l.groups,cur:v.curPatch(0),txt:v.expand('{list.name}: {patch.number} {patch.name} / {patch.count}')};});
ok(r1.mode==='group'&&r1.tag,'switching to "one group" makes the patch tag');
ok(r1.cur===r1.groups[0]&&r1.txt.lastIndexOf(r1.groups[0])>0,'the first group of the list is the patch: '+r1.txt);
const r2=await p.evaluate(()=>{const v=window.__vs;v.fireAct('patch','next');return{cur:v.curPatch(0),txt:v.expand('{patch.number} {patch.name}')};});
ok(r2.cur===r1.groups[1]||r1.groups.length<2,'next on patch steps to the next group: '+r2.txt);
const r3=await p.evaluate(()=>{const v=window.__vs,S=v.S;v.fireAct('list','next');return{cur:v.curPatch(0),l:v.curList().groups[0],n:v.expand('{patch.number}')};});
ok(r3.cur===r3.l&&r3.n==='01','a new list starts on its first patch ('+r3.cur+')');
/* layer B gets its own patch */
await p.locator('#snInsPlay [data-pl="layerB"]').check();await p.waitForTimeout(300);
const r4=await p.evaluate(()=>{const v=window.__vs,S=v.S;return{b:!!S.tags.find(t=>t.name==='patchB'),a:v.curPatch(0),pb:v.curPatch(1),txt:v.expand('{patchB.name}')};});
ok(r4.b&&r4.pb&&r4.txt===r4.pb,'layer B has its own patch: '+r4.a+' / '+r4.pb);
/* engine and export */
await p.evaluate(()=>window.__visuStartAudio&&window.__visuStartAudio());await p.waitForTimeout(2500);
const r5=await p.evaluate(async()=>{const v=window.__vs;const c=await v.buildVsamp();return{lp:v.ENG.lastPatch,f:c.manifest.features,pm:c.manifest.project.play.patchMode,cp:c.manifest.project.currentPatch};});
ok(r5.lp[0]>=0&&r5.lp[1]>=0,'the engine is told each layer\'s patch ('+r5.lp+')');
ok(r5.pm==='group'&&r5.f.indexOf('grouppatches')>=0,'the library is saved in group mode');
/* a sample that plays on release */
const r6=await p.evaluate(async()=>{const v=window.__vs,S=v.S;S.zones[0].trig='release';v.touchMap();const c=await v.buildVsamp();return c.manifest.features.indexOf('releasetrigger')>=0&&c.manifest.zones.some(z=>z.trig==='release');});
ok(r6,'a zone set to play on release is exported');
await p.click('#leftM [data-sn="play"]');await p.waitForTimeout(200);
await p.selectOption('#snInsPlay [data-pl="patchMode"]','list');await p.waitForTimeout(300);
const r7=await p.evaluate(()=>window.__vs.S.tags.filter(t=>t.kind==='patch').length);
ok(r7===0,'back to whole lists removes the patch tags');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
