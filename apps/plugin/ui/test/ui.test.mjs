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
/* a library (.vslib): one tile; its instruments by bank in the side panel; play mode steps through them */
{ok(await p.locator('.tile[data-lib]').count()===1&&/3 instruments/.test(await p.textContent('.tile[data-lib] .badge')),'a library is one tile showing how many instruments it holds');
 ok(/1 library · 6 instruments/.test(await p.textContent('#count')),'the count says libraries and instruments ('+(await p.textContent('#count'))+')');
 await p.click('.tile[data-lib]');await p.waitForTimeout(100);
 const banks=await p.$$eval('#bside h3',h=>h.map(x=>x.textContent)),ins=await p.$$eval('#bside .ins',b=>b.map(x=>x.textContent));
 ok(!(await p.locator('#bside').isHidden())&&JSON.stringify(banks)==='["01. Keys","02. Long"]'&&JSON.stringify(ins)==='["Golden","FX Play","Streaming"]','clicking it lists its instruments bank by bank ('+banks.join(', ')+' / '+ins.join(', ')+')');
 ok(await p.evaluate(()=>document.activeElement&&document.activeElement.classList.contains('ins')),'focus moves to the first instrument');
 await p.fill('#q','stream');await p.waitForTimeout(50);
 ok(/1 of 3/.test(await p.textContent('.tile[data-lib] .badge'))&&(await p.$$eval('#bside .ins',b=>b.map(x=>x.textContent))).join()==='Streaming','search finds instruments inside a library');
 await p.fill('#q','');
 await p.click('#bside .ins >> nth=0');await p.waitForTimeout(300);
 ok((await p.textContent('#curTitle'))==='Test Library · Golden'&&!(await p.locator('#insNav').isHidden()),'an instrument opens in play mode, titled with its library, with previous/next');
 await p.click('#insNext');await p.waitForTimeout(300);
 ok((await p.textContent('#curTitle'))==='Test Library · FX Play'&&await p.evaluate(()=>window.__mock.calls.filter(c=>c[0]==='loadLibrary').pop()[1])==='testlib/fxplay','next loads the library\'s next instrument');
 await p.click('#insPrev');await p.click('#insPrev');await p.waitForTimeout(300);
 ok((await p.textContent('#curTitle'))==='Test Library · Streaming','previous wraps around to the last one');
 await p.click('#btnBack');await p.waitForTimeout(150);
 ok(!(await p.locator('#bside').isHidden())&&(await p.locator('#bside .ins').count())===3,'back in the browser, the library\'s list is still open');
 await p.screenshot({path:'/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/browser.png'});
 await p.click('#sideClose');ok(await p.locator('#bside').isHidden(),'the list closes');}
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
const kb0=await fr.locator('.el.knob').first().boundingBox();if(kb0){await p.mouse.move(kb0.x+kb0.width/2,kb0.y+kb0.height/2);await p.mouse.down();await p.mouse.move(kb0.x+kb0.width/2,kb0.y+kb0.height/2-50,{steps:4});await p.mouse.up();}
ok(await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='setTag')),'turning a knob in the instrument tells the plugin');
/* a knob drag changes its tag */
const knob=fr.locator('.el.knob').first();const kb=await knob.boundingBox();
if(kb){await p.mouse.move(kb.x+kb.width/2,kb.y+kb.height/2);await p.mouse.down();await p.mouse.move(kb.x+kb.width/2,kb.y+kb.height/2-60,{steps:5});await p.mouse.up();}
/* right-click a knob: automation slot and MIDI learn; DAW automation moves the knob */
await p.evaluate(()=>{window.__mock.state.maps={Cutoff:{slot:1,cc:null}};});
const kbc=await fr.locator('.el.knob:visible').first().boundingBox();
await p.mouse.click(kbc.x+kbc.width/2,kbc.y+kbc.height/2,{button:'right'});await p.waitForTimeout(250);
ok(await p.locator('.ctxmenu:not([hidden])').count()===1,'right-clicking a knob opens its menu');
const ctxName=await p.textContent('.ctxmenu .ctxh');
await p.evaluate(n=>{window.__mock.state.maps[n]={slot:3,cc:null};},ctxName);await p.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));await p.waitForTimeout(100);
ok(await p.locator('.ctxmenu[hidden]').count()===1,'a click elsewhere closes the menu');
await p.mouse.click(kbc.x+kbc.width/2,kbc.y+kbc.height/2,{button:'right'});await p.waitForTimeout(250);
ok(/slot 3/.test(await p.textContent('.ctxmenu')),'the menu shows the DAW automation slot ('+(await p.textContent('.ctxmenu'))+' / '+ctxName+')');
await p.click('.ctxmenu [data-c="learn"]');await p.waitForTimeout(100);
ok(await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='midiLearn'))&&/Move a knob/.test(await p.textContent('.ctxmenu')),'MIDI learn waits for a controller');
await p.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await p.waitForTimeout(100);
ok(await p.locator('.ctxmenu[hidden]').count()===1&&await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='midiCancel')),'Escape closes the menu and stops learning');
const before=await fr.locator('.el.knob:visible').first().evaluate(n=>n.querySelector('.cap').style.transform);
await p.evaluate(n=>window.__mock.emit('tags',{[n]:.25}),ctxName);await p.waitForTimeout(200);
const after=await fr.locator('.el.knob:visible').first().evaluate(n=>n.querySelector('.cap').style.transform);
ok(before!==after,'DAW automation turns the knob in the interface ('+before+' -> '+after+')');
const echoed=await p.evaluate(n=>window.__mock.calls.filter(c=>c[0]==='setTag'&&c[1]===n&&Math.abs(c[2]-.25)<1e-6).length,ctxName);
ok(echoed===0,'and it is not sent back to the plugin');
/* presets: save your knob settings, change a knob, load the preset back */
ok(await p.locator('#presetBox:not([hidden])').count()===1&&(await p.textContent('#preName'))==='Library default','the preset menu shows in play mode, starting at the library default');
const capOf=()=>fr.locator('.el.knob:visible').first().evaluate(n=>n.querySelector('.cap').style.transform);
await p.evaluate(n=>window.__mock.emit('tags',{[n]:.8}),ctxName);await p.waitForTimeout(150);
await p.evaluate(n=>{window.__mock.state.tags=Object.assign({},window.__mock.state.tags,{[n]:.8});},ctxName);
const cap1=await capOf();
await p.click('#preBtn');await p.click('#preMenu [data-save]');await p.fill('#preNew','Bright');await p.press('#preNew','Enter');await p.waitForTimeout(150);
ok((await p.textContent('#preName'))==='Bright'&&await p.evaluate(()=>window.__mock.calls.some(c=>c[0]==='savePreset'&&c[1]==='Bright')),'Save as… stores a preset under its name');
await p.evaluate(n=>window.__mock.emit('tags',{[n]:.1}),ctxName);await p.waitForTimeout(150);
await p.click('#preBtn');await p.click('#preMenu [data-p="Bright"]');await p.waitForTimeout(200);
ok(await capOf()===cap1,'loading the preset puts the knob back ('+cap1+')');
await p.click('#preBtn');await p.click('#preMenu [data-p=""]');await p.waitForTimeout(200);
ok((await p.textContent('#preName'))==='Library default'&&await capOf()!==cap1,'Library default brings back the library\'s own values');
await p.click('#preNext');await p.waitForTimeout(200);
ok((await p.textContent('#preName'))==='Bright','the arrows step through the presets');
await p.click('#preBtn');await p.click('#preMenu [data-del="Bright"]');await p.waitForTimeout(150);
ok(await p.locator('#preMenu [data-p="Bright"]').count()===0,'a preset can be deleted');
await p.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
/* keyswitch keys show on the keyboard, and a keyswitch changes the list in the interface */
await p.evaluate(()=>{const st=Object.assign({},window.__mock.state.status,{lists:[{name:'Legato',bank:0,ks:24},{name:'Staccato',bank:0,ks:25},{name:'Pizz',bank:0}],list:0});window.__mock.state.status=st;window.__mock.emit('status',st);});
await p.waitForTimeout(150);
ok(await p.locator('#piano [data-n="24"].ks.kson').count()===1&&await p.locator('#piano [data-n="25"].ks').count()===1,'keyswitch keys are coloured on the keyboard (it reaches down to them)');
await p.evaluate(()=>{const st=Object.assign({},window.__mock.state.status,{list:1});window.__mock.state.status=st;window.__mock.emit('status',st);});await p.waitForTimeout(150);
ok(await p.locator('#piano [data-n="25"].kson').count()===1,'the active keyswitch is marked');
await p.click('#btnCommunity');await p.waitForTimeout(50);
ok(await p.evaluate(()=>window.__mock.state.community===1),'the Discord button asks the player to open the KCS server');
/* pitch and mod wheels next to the keyboard */
{const bx=await (await p.$('#wheels .whl[data-wk="bend"]')).boundingBox();
 await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await p.mouse.down();await p.mouse.move(bx.x+bx.width/2,bx.y-20,{steps:5});
 const upv=await p.evaluate(()=>window.__mock.state.bend);await p.mouse.up();await p.waitForTimeout(50);
 ok(upv>.9&&await p.evaluate(()=>window.__mock.state.bend)===.5,'pitch wheel: drag up bends ('+upv+'), letting go springs back');
 const mx=await (await p.$('#wheels .whl[data-wk="mod"]')).boundingBox();
 await p.mouse.move(mx.x+mx.width/2,mx.y+mx.height-4);await p.mouse.down();await p.mouse.move(mx.x+mx.width/2,mx.y+mx.height/2,{steps:5});await p.mouse.up();
 const mv=await p.evaluate(()=>window.__mock.state.mod);ok(mv>.3&&mv<.8,'mod wheel: drag sets it and it stays ('+mv.toFixed(2)+')');
 await p.evaluate(()=>window.__mock.emit('wheels',{bend:.25,mod:.9}));await p.waitForTimeout(50);
 const cs=await p.evaluate(()=>[getComputedStyle(document.querySelector('#wheels [data-wk="bend"]')).getPropertyValue('--v'),getComputedStyle(document.querySelector('#wheels [data-wk="mod"]')).getPropertyValue('--v')]);
 ok(Math.abs(parseFloat(cs[0])-.25)<.01&&Math.abs(parseFloat(cs[1])-.9)<.01,'a MIDI keyboard\'s wheels move them on screen');
 await p.screenshot({path:'/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/pwheels.png'});}
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
