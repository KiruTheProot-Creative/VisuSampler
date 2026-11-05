// Undo / redo across the Designer, the Sound tab and Effects
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const st=(f,a)=>p.evaluate(f,a);
await p.waitForTimeout(1800);
ok(await p.locator('#histUndo').isDisabled(),'nothing to undo at the start');
/* Designer: add an element, move it, then undo both */
await p.click('[data-view="design"]');await p.waitForTimeout(300);
const n0=await st(()=>window.__vs.S.els.length);
await p.click('[data-act="add"][data-type="knob"]');await p.waitForTimeout(300);
const id=await st(()=>window.__vs.S.sel);
await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.waitForTimeout(300);
const x1=await st(id=>window.__vs.S.els.find(e=>e.id===id).x,id);
await p.keyboard.press('Control+z');await p.waitForTimeout(300);
ok(await st(([id,x1])=>{const e=window.__vs.S.els.find(e=>e.id===id);return e&&e.x<x1;},[id,x1]),'Ctrl+Z undoes the nudge');
await p.keyboard.press('Control+z');await p.waitForTimeout(300);
ok(await st(()=>window.__vs.S.els.length)===n0,'and then the new knob');
await p.keyboard.press('Control+y');await p.waitForTimeout(300);
ok(await st(()=>window.__vs.S.els.length)===n0+1&&await p.locator('#canvas .el[data-id="'+id+'"]').count()===1,'Ctrl+Y brings the knob back, drawn on the canvas');
/* typing a name is one step */
await p.click('#canvas .el[data-id="'+id+'"]');await p.fill('#rbody .pname','Big Knob');await p.waitForTimeout(900);
await p.click('#histUndo');await p.waitForTimeout(300);
ok(await st(id=>window.__vs.S.els.find(e=>e.id===id).name!=='Big Knob',id),'the Undo button undoes a typed name');
await p.click('#histRedo');await p.waitForTimeout(300);
ok(await st(id=>window.__vs.S.els.find(e=>e.id===id).name==='Big Knob',id),'the Redo button brings it back');
/* turning knobs in Test mode is playing, not editing */
const u0=await st(()=>window.__vs.HIST.undo.length);
await st(()=>{const S=window.__vs.S,t=S.tags.find(t=>!t.sys&&t.kind==='number');window.__vs.setTag(t,.13);});await p.waitForTimeout(400);
await p.click('#viewport');await p.waitForTimeout(300);
ok(await st(()=>window.__vs.HIST.undo.length)===u0,'moving a knob value does not add an undo step');
/* Sound tab: delete a sample, then undo brings it and its zones back, with audio */
await p.click('[data-view="sound"]');await p.waitForTimeout(300);
const before=await st(()=>{const v=window.__vs,S=v.S,s=S.samples.find(x=>S.zones.some(z=>z.sample===x.id));window.__sid=s.id;return{n:S.samples.length,z:S.zones.length};});
await st(()=>{window.__vs.deleteSamples([window.__sid]);});await p.waitForTimeout(400);await p.click('#viewport').catch(()=>{});await p.waitForTimeout(200);
ok(await st(()=>window.__vs.S.samples.length)===before.n-1,'sample deleted');
await p.keyboard.press('Control+z');await p.waitForTimeout(500);
ok(await st(b=>{const S=window.__vs.S;return S.samples.length===b.n&&S.zones.length===b.z&&!!window.__vs.BUF.get(window.__sid);},before),'undo brings the sample, its zones and its audio back');
/* audio edit: reverse, then undo restores the audio */
await st(()=>{const v=window.__vs,S=v.S;S.smp.sel=window.__sid;window.__ch0=v.BUF.get(window.__sid).ch[0];v.smOp('reverse');});await p.waitForTimeout(400);await p.click('#viewport').catch(()=>{});await p.waitForTimeout(300);
ok(await st(()=>window.__vs.BUF.get(window.__sid).ch[0]!==window.__ch0),'audio edited');
await p.keyboard.press('Control+z');await p.waitForTimeout(500);
ok(await st(()=>window.__vs.BUF.get(window.__sid).ch[0]===window.__ch0),'undo restores the audio before the edit');
/* Effects: add a module, undo */
await p.click('[data-view="fx"]');await p.waitForTimeout(300);
const fx0=await st(()=>{const g=window.__vs.graphOf('master');return g.nodes.length;});
await st(()=>{const v=window.__vs,g=v.graphOf('master');g.nodes.push(v.fxNode('delay',300,100));v.fxRender();});await p.click('#viewport').catch(()=>{});await p.waitForTimeout(400);
await p.keyboard.press('Control+z');await p.waitForTimeout(500);
ok(await st(()=>window.__vs.graphOf('master').nodes.length)===fx0&&await st(()=>window.__vs.S.view)==='fx','undo removes the new effect and stays in Effects');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
