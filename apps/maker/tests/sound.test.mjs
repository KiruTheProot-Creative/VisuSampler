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
/* knobs on the group */
if(knobId){
  await p.evaluate(()=>{const d=document.querySelector('#snInsGroup .snlinks');if(d)d.open=true;});
  await p.selectOption('#snInsGroup [data-gl=vol]',knobId);await p.waitForTimeout(100);
  await p.fill('#snInsGroup [data-glt=vol]','-24');await p.press('#snInsGroup [data-glt=vol]','Tab');await p.waitForTimeout(100);
  ok(await p.evaluate(k=>{const S=window.__vs.S,l=S.gset[S.map.group].links.vol;return l.tag===k&&l.from===0&&l.to===-24;},knobId),'a knob can drive the group volume, with its range');
}
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
/* visual loop editor: drag the loop end and the whole loop on the waveform */
await p.evaluate(()=>{const v=window.__vs,S=v.S;const z=S.zones.find(z=>z.loop&&z.loop.on);S.map.sel=[z.id];S.map.group=z.group;S.view='sound';v.soundEnter();});
await p.waitForTimeout(300);await p.click('#loopBar [data-lp=fit]');await p.waitForTimeout(200);
const lz=()=>p.evaluate(()=>{const S=window.__vs.S;return Object.assign({},S.zones.find(x=>x.id===S.map.sel[0]).loop);});
const fx=f=>p.evaluate(f=>{const S=window.__vs.S,r=document.querySelector('#smCanvas').getBoundingClientRect();return r.left+(f-S.smp.sx)/S.smp.fpp;},f);
const cy=await p.evaluate(()=>{const r=document.querySelector('#smCanvas').getBoundingClientRect();return{top:r.top,mid:r.top+r.height*.45};});
const L0=await lz();ok((await p.textContent('#loopBar')).includes('zone'),'the waveform edits the selected zone\'s loop');
let x=await fx(L0.e);await p.mouse.move(x,cy.mid);await p.mouse.down();await p.mouse.move(x-60,cy.mid,{steps:5});await p.mouse.up();await p.waitForTimeout(150);
const L1=await lz();
ok(L1.e<L0.e-100&&L1.s===L0.s,'dragging E shortens the loop');
ok(await p.evaluate(e=>{const S=window.__vs.S,z=S.zones.find(x=>x.id===S.map.sel[0]),d=window.__vs.BUF.get(z.sample).ch[0];return d[e]<=0&&d[e+1]>0;},L1.e),'the loop end lands on a zero crossing');
x=await fx((L1.s+L1.e)/2);await p.mouse.move(x,cy.top+8);await p.mouse.down();await p.mouse.move(x+80,cy.top+8,{steps:5});await p.mouse.up();await p.waitForTimeout(150);
const L2=await lz();
ok(L2.s>L1.s&&Math.abs((L2.e-L2.s)-(L1.e-L1.s))<4000,'dragging the bar in the ruler moves the whole loop');
ok(['smooth','small bump','click'].includes(await p.evaluate(()=>window.__vs.S.smp.seam)),'the seam view judges the join');
await p.click('#loopBar [data-lp=on]');await p.waitForTimeout(100);
ok(!(await lz()).on,'the loop can be switched off from the bar');
await p.click('#loopBar [data-lp=on]');
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
