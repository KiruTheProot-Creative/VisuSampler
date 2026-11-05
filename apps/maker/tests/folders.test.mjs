// The easy way to make patch libraries: folders with patches in the Sound tab, a ready-made patch browser and a second patch slot.
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
/* a blank project starts with folders and patches */
await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Presets/.test(x.textContent));b&&b.click();});await p.waitForTimeout(200);
await p.evaluate(()=>{const v=window.__vs;v.S.lists=[];});
await p.click('button:has-text("Sound")');await p.waitForTimeout(500);
await p.click('#leftM [data-sn="play"]');await p.waitForTimeout(200);
await p.selectOption('#snInsPlay [data-pl="patchMode"]','group');await p.waitForTimeout(300);
ok(await p.locator('#leftM .snlist.tree').count()===1,'the Sound tab shows the folder tree');
await p.click('#leftM [data-fa="addFolder"]');await p.waitForTimeout(200);
await p.click('#leftM [data-fa="addFolder"]');await p.waitForTimeout(200);
const fids=await p.evaluate(()=>window.__vs.S.lists.map(l=>l.id));
await p.click('#leftM .frow[data-id="'+fids[0]+'"] [data-fa="addPatch"]');await p.waitForTimeout(200);
await p.click('#leftM .frow[data-id="'+fids[0]+'"] [data-fa="addPatch"]');await p.waitForTimeout(200);
let st=await p.evaluate(()=>window.__vs.S.lists.map(l=>l.groups.length));
ok(st[0]===2&&st[1]===0,'+ on a folder makes a new patch inside it ('+st+')');
const g1=await p.evaluate(()=>window.__vs.S.lists[0].groups[1]);
await p.dragAndDrop('#leftM .grow.tree[data-g="'+g1+'"]','#leftM .frow[data-id="'+fids[1]+'"]');await p.waitForTimeout(300);
st=await p.evaluate(()=>window.__vs.S.lists.map(l=>l.groups.join('+')));
ok(st[0].indexOf(g1)<0&&st[1]===g1,'dragging a patch onto a folder moves it ('+st.join(' | ')+')');
await p.click('#leftM .grow.tree[data-g="'+g1+'"]');await p.waitForTimeout(200);
const heard=await p.evaluate(()=>window.__vs.expand('{folder} {patch}'));
ok(heard.indexOf(g1)>0,'clicking a patch picks its folder and patch: '+heard);
/* rename by double-click */
await p.dblclick('#leftM .grow.tree[data-g="'+g1+'"] [data-ren]');await p.waitForTimeout(150);
await p.keyboard.press('Control+A');await p.keyboard.type('My Soft Pad');await p.keyboard.press('Enter');await p.waitForTimeout(250);
ok(await p.evaluate(()=>window.__vs.S.groups.indexOf('My Soft Pad')>=0&&window.__vs.S.lists[1].groups[0]==='My Soft Pad'),'double-click renames a patch everywhere');
/* right-click: take out of the folder */
await p.click('#leftM .grow.tree[data-g="My Soft Pad"]',{button:'right'});await p.waitForTimeout(150);
await p.click('.fmenu [data-fm="out"]');await p.waitForTimeout(250);
ok(await p.evaluate(()=>window.__vs.S.lists[1].groups.length===0)&&await p.locator('#leftM .frow.loose').count()===1,'right-click > take out leaves it under "Not in a folder"');
/* interface: patch browser and second slot */
await p.click('button:has-text("Interface")');await p.waitForTimeout(300);
await p.click('[data-comp="browser"]');await p.waitForTimeout(200);
await p.click('[data-comp="slotB"]');await p.waitForTimeout(200);
const r=await p.evaluate(()=>{const v=window.__vs,S=v.S;
  const acts=S.els.filter(e=>e.rules&&e.rules.length).map(e=>e.rules[0].acts[0].verb+' '+e.rules[0].acts[0].tag);
  return{acts,layerB:!!S.tags.find(t=>t.name==='patchB'),mix:!!S.tags.find(t=>t.name==='Patch mix'),links:S.play.layers.map(l=>l.links.vol&&l.links.vol.from+'>'+l.links.vol.to).join(' ')};});
ok(['prev list','next list','prev patch','next patch','prev listB','next listB','prev patchB','next patchB'].every(a=>r.acts.indexOf(a)>=0),'both browsers come wired to their folder and patch ('+r.acts.length+' buttons)');
ok(r.layerB&&r.mix&&r.links==='0>-60 -60>0','the second slot switches on side B and an A/B mix knob ('+r.links+')');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
