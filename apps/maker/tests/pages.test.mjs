// Designer: pages (tabs inside one instrument), always show, tab buttons
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const st=(f,a)=>p.evaluate(f,a);
const shown=id=>st(id=>{const n=document.querySelector('#canvas .el[data-id="'+id+'"]');return !!n&&getComputedStyle(n).display!=='none';},id);
await p.click('[data-view="design"]');await p.waitForTimeout(300);
const first=await st(()=>window.__vs.S.els[3].id);
ok(await st(()=>window.__vs.S.pages.length)===0&&await shown(first),'no pages: everything shows');
await p.click('#pageBar [data-pgadd]');await p.click('#pageBar [data-pgadd]');await p.waitForTimeout(150);
ok(await st(()=>window.__vs.S.pages.length)===2,'+ adds pages');
ok(!(await shown(first)),'page 2 starts empty: page 1 elements are hidden');
await p.click('[data-act="add"][data-type="knob"]');await p.waitForTimeout(100);
const knob=await st(()=>window.__vs.S.sel);
ok(await st(id=>{const S=window.__vs.S;return S.els.find(e=>e.id===id).page===S.pages[1].id;},knob),'a new element lands on the page being edited');
await p.click('#pageBar [data-pgo="0"]');await p.waitForTimeout(100);
ok(await shown(first)&&!(await shown(knob)),'switching to page 1 shows its elements and hides page 2');
/* always show */
await p.click('#layers [data-id="'+first+'"]');await p.waitForTimeout(100);
await p.check('#rbody [data-pgalways]');await p.waitForTimeout(100);
await p.click('#pageBar [data-pgo="1"]');await p.waitForTimeout(100);
ok(await shown(first),'Always show keeps an element on every page');
/* a tab button */
await p.click('#pageBar [data-pgo="0"]');await p.click('[data-act="add"][data-type="button"]');await p.waitForTimeout(100);
const btn=await st(()=>window.__vs.S.sel);
const pid=await st(()=>window.__vs.S.pages[1].id);
await p.selectOption('#rbody [data-pgopen]',pid);await p.check('#rbody [data-pgalways]');await p.waitForTimeout(100);
ok(await st(id=>{const S=window.__vs.S,b=S.els.find(e=>e.id===id),t=S.tags.find(x=>x.name==='page'&&x.sys);return b.tag===t.id&&b.mode==='radio'&&b.value===1;},btn),'Opens page makes the button a tab');
await p.click('#mTest');await p.waitForTimeout(150);
await p.click('#canvas .el[data-id="'+btn+'"]');await p.waitForTimeout(200);
ok(await shown(knob)&&!(await shown(await st(()=>window.__vs.S.els[4].id))),'clicking the tab in Test shows its page');
ok((await p.getAttribute('#pageBar [data-pgo="1"]','aria-pressed'))==='true','the page bar follows');
await p.click('#mDesign');await p.waitForTimeout(100);
/* layers list follows the page */
ok(await p.locator('#layers [data-id="'+first+'"]').count()===1&&await p.locator('#layers [data-id="'+await st(()=>window.__vs.S.els[4].id)+'"]').count()===0,'Layers lists only this page (plus Always show)');
/* rename in the Project tab, then saved */
await p.click('#rightD [data-tab="proj"]');await p.fill('#rbody [data-pgname="'+pid+'"]','FX + Control');await p.waitForTimeout(100);
ok((await p.textContent('#pageBar [data-pgo="1"]'))==='FX + Control','pages can be renamed');
ok(await st(()=>{const s=window.__vs.snapshot();return s.pages.length===2&&s.pages[1].name==='FX + Control'&&s.tags.some(t=>t.name==='page'&&t.steps[1]==='FX + Control');}),'pages are saved with the project');
await p.screenshot({path:'/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/pages.png'});
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
