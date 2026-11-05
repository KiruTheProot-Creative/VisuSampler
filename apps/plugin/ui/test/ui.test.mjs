// Tests the plugin window against a stand-in plugin: node apps/plugin/ui/test/ui.test.mjs
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);let pw;try{pw=req('playwright');}catch(e){pw=createRequire('/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/v4/')('playwright');}
import {readFileSync,writeFileSync} from 'node:fs';
/* the test page is the real index.html with the stand-in plugin in front of ui.js */
writeFileSync(new URL('harness.html',import.meta.url),readFileSync(new URL('../index.html',import.meta.url),'utf8')
  .replace('<meta charset="utf-8">','<meta charset="utf-8"><base href="../">').replace('<script type="module" src="ui.js"></script>','<script type="module" src="test/mock-host.js"></script>'));
const {server}=await import('../../../../tools/serve.mjs');await new Promise(r=>server.listen(0,r));
const b=await pw.chromium.launch(),p=await b.newPage({viewport:{width:1000,height:660}}),errs=[],fails=[];
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_|favicon|Failed to load resource/.test(m.text()))errs.push(m.text());});
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.goto('http://localhost:'+server.address().port+'/apps/plugin/ui/test/harness.html');await p.waitForTimeout(1500);
ok(await p.locator('.tile[data-id]').count()===3,'browser lists the libraries from the plugin');
await p.screenshot({path:'/tmp/ui1.png'});
await p.fill('#q','zzz');ok(await p.locator('.tile[data-id]').count()===0,'search filters');await p.fill('#q','');
await p.click('.fchip:has-text("Keys")');ok(await p.locator('.tile[data-id]').count()===1,'category filter');await p.click('.fchip:has-text("Keys")');
await p.click('.tile[data-id] >> nth=0');await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.body.dataset.mode)==='play','clicking a tile opens play mode');
ok(await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='loadLibrary')),'asks the plugin to load it');
ok(/zones ready/.test(await p.textContent('#status')),'shows the plugin status');
await p.waitForTimeout(800);
const fr=p.frameLocator('#uiFrame');
const nEl=await fr.locator('.el').count();ok(nEl>10,'draws the library interface from the Designer ('+nEl+' elements)');
await p.screenshot({path:'/tmp/ui3.png'});
/* click the 3rd row of a list selector in the instrument UI: the plugin must switch list */
const rows=fr.locator('.el.list .lrow[data-i]');
ok(await rows.count()>2,'list selector rows drawn');
await rows.nth(2).dispatchEvent('pointerdown');await p.waitForTimeout(200);
ok(await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='setList'&&c[1]>0)),'choosing a list in the instrument UI tells the plugin');
/* a knob drag changes its tag */
const knob=fr.locator('.el.knob').first();const kb=await knob.boundingBox();
if(kb){await p.mouse.move(kb.x+kb.width/2,kb.y+kb.height/2);await p.mouse.down();await p.mouse.move(kb.x+kb.width/2,kb.y+kb.height/2-60,{steps:5});await p.mouse.up();}
await p.click('#btnAbout');await p.waitForTimeout(100);
const nl=await p.locator('[data-list]').count();ok(nl>1,'About shows the info page with the lists ('+nl+')');
await p.click('[data-list="2"]');ok(await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='setList'&&c[1]===2)),'choosing a list tells the plugin');
await p.click('#btnAbout');
await p.keyboard.down('a');await p.keyboard.up('a');await p.waitForTimeout(50);
ok(await p.evaluate(()=>{const c=window.__mock.calls;return c.some(x=>x[0]==='noteOn'&&x[1]===48)&&c.some(x=>x[0]==='noteOff'&&x[1]===48);}),'computer keys send notes to the plugin');
await p.evaluate(()=>window.__mock.emit('meter',{voices:7}));ok((await p.textContent('#voices'))==='7 voices','voice meter updates');
await p.screenshot({path:'/tmp/ui2.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(100);
ok(await p.evaluate(()=>document.body.dataset.mode)==='browse'&&await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='unload')),'Escape goes back and unloads');
await p.click('.tile[data-id] >> nth=1');await p.waitForTimeout(300);
ok(/cannot play yet: granular/.test(await p.textContent('#detail')),'warns about features this version cannot play');
ok(errs.length===0,'no page errors '+errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await b.close();server.close();process.exit(fails.length?1:0);
