// Designer: multi selection, layer groups, moving layers
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const st=(f,a)=>p.evaluate(f,a);
await p.click('[data-view="design"]');await p.waitForTimeout(300);
await p.keyboard.press('Escape');
const n0=await st(()=>window.__vs.S.els.length);
for(const t of ['knob','knob','button'])await p.click('[data-act="add"][data-type="'+t+'"]');
await p.waitForTimeout(150);
const ids=await st(()=>window.__vs.S.els.slice(-3).map(e=>e.id));
/* spread them out so they can be clicked */
await st(ids=>{const S=window.__vs.S;ids.forEach((id,i)=>{const e=S.els.find(x=>x.id===id);e.x=60+i*140;e.y=60;e.w=e.h=80;});window.__vs.rerender();},ids);
await p.waitForTimeout(100);
const click=(id,mods)=>p.click('#canvas .el[data-id="'+id+'"]',{modifiers:mods||[],position:{x:20,y:20}});
await click(ids[0]);await click(ids[1],['Shift']);
ok(await st(()=>window.__vs.S.msel.length)===2,'Shift-click adds to the selection');
ok(await p.locator('#rbody [data-al="l"]').count()===1,'several selected: the inspector offers Align');
/* move both together */
const before=await st(ids=>ids.map(id=>window.__vs.S.els.find(e=>e.id===id).x),ids);
const box=await p.locator('#canvas .el[data-id="'+ids[1]+'"]').boundingBox();
await p.mouse.move(box.x+20,box.y+20);await p.mouse.down();await p.mouse.move(box.x+60,box.y+50,{steps:6});await p.mouse.up();
const after=await st(ids=>ids.map(id=>window.__vs.S.els.find(e=>e.id===id).x),ids);
ok(after[0]-before[0]>15&&after[0]-before[0]===after[1]-before[1]&&after[2]===before[2],'dragging moves every selected element together');
/* group with Ctrl+G */
await p.keyboard.press('Control+g');await p.waitForTimeout(150);
ok(await st(ids=>{const S=window.__vs.S,a=S.els.find(e=>e.id===ids[0]),b=S.els.find(e=>e.id===ids[1]);return a.grp&&a.grp===b.grp&&S.lgroups.length===1;},ids),'Ctrl+G groups them');
ok(await p.locator('#layers .lg .lgh').count()===1,'the group shows as a folder in Layers');
/* clicking one member picks the whole group, Alt picks one */
await p.keyboard.press('Escape');await click(ids[0]);
ok(await st(()=>window.__vs.S.msel.length)===2,'clicking a grouped element selects the group');
await click(ids[0],['Alt']);
ok(await st(()=>window.__vs.S.msel.length)===1,'Alt-click picks just one element');
/* rename the group */
await click(ids[0]);await p.fill('#rbody [data-gname]','Knobs');await p.waitForTimeout(100);
ok((await p.textContent('#layers .lgn span'))==='Knobs','the group can be renamed');
/* marquee selects everything it touches */
await p.keyboard.press('Escape');
const cv=await p.locator('#canvas').boundingBox();
await p.mouse.move(cv.x+3,cv.y+3);await p.mouse.down();await p.mouse.move(cv.x+cv.width-3,cv.y+cv.height-3,{steps:6});await p.mouse.up();
ok(await st(()=>window.__vs.S.msel.length)===await st(()=>window.__vs.S.els.length),'dragging across empty space selects everything inside');
/* drag the button row into the group in Layers */
await p.keyboard.press('Escape');

const src=p.locator('#layers [data-drag="'+ids[2]+'"]'),dst=p.locator('#layers .lgh');
await src.dragTo(dst,{targetPosition:{x:30,y:4}});await p.waitForTimeout(150);
ok(await st(ids=>{const S=window.__vs.S;return S.els.find(e=>e.id===ids[2]).grp===S.els.find(e=>e.id===ids[0]).grp;},ids),'dropping a layer onto a group puts it in the group');
const order=await st(()=>window.__vs.S.els.map(e=>e.id));
ok(order.indexOf(ids[2])===order.length-1,'and it lands at the top of the group');
/* drag it back out, behind the layer under the group */
const under=await st(()=>{const S=window.__vs.S;return S.els[S.els.length-4].id;});
await p.locator('#layers [data-drag="'+ids[2]+'"]').dragTo(p.locator('#layers [data-drag="'+under+'"]'),{targetPosition:{x:30,y:22}});await p.waitForTimeout(150);
ok(await st(([id,u])=>{const S=window.__vs.S,e=S.els.find(x=>x.id===id);return !e.grp&&S.els.indexOf(e)===S.els.findIndex(x=>x.id===u)-1;},[ids[2],under]),'dragging a layer out of the group and behind another works');
/* a click on the full-size background still selects it */
await p.keyboard.press('Escape');await p.mouse.click(cv.x+5,cv.y+5);
ok(await st(()=>{const S=window.__vs.S;return S.msel.length===1&&S.sel===S.els[0].id;}),'clicking the background selects it');
/* duplicate the whole group, then delete the selection */
await click(ids[0]);await p.keyboard.press('Control+d');await p.waitForTimeout(150);
ok(await st(()=>window.__vs.S.lgroups.length)===2&&await st(()=>window.__vs.S.msel.length)===2,'duplicating a group makes a new group');
await p.keyboard.press('Delete');await p.waitForTimeout(100);
ok(await st(()=>window.__vs.S.lgroups.length)===1,'deleting it removes the copy and its group');
/* saved with the project */
ok(await st(()=>{const s=window.__vs.snapshot();return s.lgroups.length===1&&s.lgroups[0].name==='Knobs';}),'groups are saved with the project');
await p.screenshot({path:'/tmp/layers.png'});
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
