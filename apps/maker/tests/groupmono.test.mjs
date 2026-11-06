// A group (patch) can play its own way: poly, mono or legato with its own glide.
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('button:has-text("Sound")');await p.waitForTimeout(500);
await p.click('#leftM .grow[data-g]');await p.waitForTimeout(300);
const g=await p.evaluate(()=>window.__vs.S.map.group);
ok(await p.locator('#snInsGroup select[data-gpm="mode"]').count()===1,'the group inspector has "Plays"');
await p.selectOption('#snInsGroup select[data-gpm="mode"]','legato');await p.waitForTimeout(200);
await p.fill('#snInsGroup input[data-gpm="glide"]','120');await p.locator('#snInsGroup input[data-gpm="glide"]').dispatchEvent('change');await p.waitForTimeout(200);
const r=await p.evaluate(async g=>{const v=window.__vs;const c=v.S.gset[g].play;const m=(await v.buildVsamp()).manifest;return{c,f:m.features.indexOf('groupmono')>=0,saved:m.project.gset[g].play};},g);
ok(r.c.mode==='legato'&&r.c.glide===120,'legato with 120 ms glide is stored '+JSON.stringify(r.c));
ok(r.f&&r.saved&&r.saved.mode==='legato','the library carries it');
await p.selectOption('#snInsGroup select[data-gpm="mode"]','');await p.waitForTimeout(200);
ok(await p.evaluate(g=>!window.__vs.S.gset[g].play,g),'"Like the Playing settings" removes it again');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
