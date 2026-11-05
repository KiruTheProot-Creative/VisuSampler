import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const vis=sel=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&!e.closest('[hidden]')&&e.offsetParent!==null;},sel);
ok(await p.evaluate(()=>window.__vs.S.view)==='sound','opens on the Sound tab');
ok(await vis('#mapCanvas')&&await vis('#smCanvas'),'map and waveform both visible');
/* group focus */
await p.click('#leftM .grow >> nth=1');await p.waitForTimeout(150);
ok(await vis('#snInsGroup .snhead'),'clicking a group shows the group inspector');
/* rename group through inspector */
const oldName=await p.evaluate(()=>window.__vs.S.map.group);
await p.fill('#snInsGroup [data-sg=name]','Renamed Group');await p.press('#snInsGroup [data-sg=name]','Enter');await p.waitForTimeout(150);
ok(await p.evaluate(o=>{const S=window.__vs.S;return S.groups.includes('Renamed Group')&&!S.groups.includes(o)&&S.zones.every(z=>z.group!==o);},oldName),'renaming a group updates zones');
/* per-note envelope on the group */
await p.check('#snInsGroup [data-se=on]');await p.waitForTimeout(150);
ok(await vis('#snInsGroup .envsvg')&&await vis('#snInsGroup [data-se=a]'),'turning on the envelope shows A, D, S, R and its shape');
await p.fill('#snInsGroup [data-se=a]','450');await p.press('#snInsGroup [data-se=a]','Tab');await p.waitForTimeout(100);
const knobId=await p.evaluate(()=>{const t=window.__vs.S.tags.find(x=>!x.sys&&x.kind==='number');return t?t.id:'';});
if(knobId){await p.selectOption('#snInsGroup [data-setag=s]',knobId);await p.waitForTimeout(100);}
ok(await p.evaluate(k=>{const S=window.__vs.S,e=S.gset[S.map.group].env;return e&&e.on&&e.a===450&&(!k||e.tags.s===k);},knobId),'envelope settings and the knob link are stored on the group');
ok(knobId===''||await p.evaluate(()=>document.querySelector('#snInsGroup [data-se=s]').disabled),'a linked value is driven by its knob');
/* sample focus */
await p.click('#leftM .prow >> nth=3');await p.waitForTimeout(150);
ok(await vis('#rightS [data-sk="sm.mode"]'),'clicking a sample shows the sample inspector');
ok(await p.evaluate(()=>document.querySelector('#snWaveTitle').textContent===window.__vs.S.samples[3].name),'waveform follows the sample');
/* lists: add, rename, toggle a group */
const n0=await p.evaluate(()=>window.__vs.S.lists.length);
await p.click('#leftM [data-ls=addList]');await p.waitForTimeout(200);
ok(await p.evaluate(()=>window.__vs.S.lists.length)===n0+1,'+ adds a list');
await p.click('#leftM [data-sn=list] >> nth=0');await p.waitForTimeout(150);
ok(await vis('#snInsList [data-sl=name]'),'clicking a list shows the list inspector');
await p.fill('#snInsList [data-sl=name]','My List');await p.waitForTimeout(100);
const g0=await p.evaluate(()=>window.__vs.S.groups[0]);
const before=await p.evaluate(g=>{const S=window.__vs.S,l=S.lists[0];return l.groups.includes(g);},g0);
await p.click('#snInsList [data-sl=grp] >> nth=0');await p.waitForTimeout(150);
ok(await p.evaluate(([g,b])=>{const l=window.__vs.S.lists[0];return l.name==='My List'&&l.groups.includes(g)!==b;},[g0,before]),'list name and groups edit');
/* play settings: mono, glide, bend range */
await p.click('#leftM [data-sn=play]');await p.waitForTimeout(150);
ok(await vis('#snInsPlay [data-pl=mono]'),'Playing row shows the play settings');
await p.check('#snInsPlay [data-pl=mono]');await p.waitForTimeout(100);
await p.fill('#snInsPlay [data-pl=glide]','120');await p.press('#snInsPlay [data-pl=glide]','Tab');
await p.fill('#snInsPlay [data-pl=bend]','12');await p.press('#snInsPlay [data-pl=bend]','Tab');await p.waitForTimeout(100);
ok(await p.evaluate(()=>{const s=window.__vs.snapshot().play;return s.mono===true&&s.glide===120&&s.bend===12;}),'mono, glide and bend range are saved with the project');
ok((await p.textContent('#leftM [data-sn=play]')).includes('glide 120'),'the row sums up the settings');
/* layouts and fold */
await p.click('[data-lay=map]');await p.waitForTimeout(150);ok(!(await vis('#smCanvas'))&&await vis('#mapCanvas'),'Map layout hides the waveform');
await p.click('[data-lay=wave]');await p.waitForTimeout(150);ok(await vis('#smCanvas')&&!(await vis('#mapCanvas')),'Wave layout hides the map');
await p.click('[data-lay=split]');await p.waitForTimeout(150);
await p.click('#leftM [data-fold=Lists]');await p.waitForTimeout(100);ok(await p.locator('#leftM [data-sn=list]').count()===0,'sections fold');
/* tips toggle */
ok(!(await p.evaluate(()=>document.body.classList.contains('tips'))),'tips hidden by default');
await p.click('#tipsBtn');ok(await p.evaluate(()=>document.body.classList.contains('tips')),'Tips button shows explanations');
/* zone focus via map click, then play */
await p.evaluate(()=>{const S=window.__vs.S;S.map.sel=[S.zones[0].id];window.__vs.mapLeftRender();});await p.evaluate(()=>{window.__vs.soundEnter();});
await p.waitForTimeout(150);
ok(await p.evaluate(()=>{const S=window.__vs.S;return S.snd.focus==='zone'&&S.smp.sel===S.zones[0].sample;}),'selecting a zone shows it and its sample');
/* empty project */
await p.click('#presetBtn');await p.click('[data-pre="blank"]');await p.waitForTimeout(250);
ok(await vis('#snEmpty'),'empty project shows the drop prompt');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
