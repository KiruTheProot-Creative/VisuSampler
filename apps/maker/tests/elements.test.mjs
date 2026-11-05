// Designer: Dropdown and Image elements, in the Maker and in the player's runtime
import {openApp} from './_helper.mjs';
import {fileURLToPath} from 'node:url';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const st=(f,a)=>p.evaluate(f,a);
await p.click('[data-view="design"]');await p.waitForTimeout(300);
/* a Steps tag with three choices, and a dropdown on it */
await st(()=>{const S=window.__vs.S;S.tags.push({id:'tdd',name:'filter type',kind:'steps',min:0,max:1,unit:'',scale:'linear',dec:1,steps:['Low-pass','High-pass','Band-pass'],basis:'note',value:0,def:0,target:'none',sys:false});});
await p.click('[data-act="add"][data-type="dropdown"]');await p.waitForTimeout(150);
const dd=await st(()=>window.__vs.S.sel);
await p.selectOption('#rbody [data-k="tag"]','tdd');await p.waitForTimeout(150);
ok((await p.textContent('#canvas .el[data-id="'+dd+'"] .ddv'))==='Low-pass','the dropdown shows the tag\'s current choice');
await p.click('#mTest');await p.waitForTimeout(150);
await p.click('#canvas .el[data-id="'+dd+'"]');await p.waitForTimeout(150);
ok(await p.locator('#canvas .ddmenu .ddi').count()===3,'clicking it in Test mode opens a menu with the three choices');
await p.click('#canvas .ddmenu .ddi[data-i="2"]');await p.waitForTimeout(150);
ok(await st(()=>window.__vs.S.tags.find(t=>t.id==='tdd').value)===1&&(await p.textContent('#canvas .el[data-id="'+dd+'"] .ddv'))==='Band-pass','picking a choice sets the tag and closes the menu');
ok(await p.locator('#canvas .ddmenu').count()===0,'the menu closes after a pick');
await p.hover('#canvas .el[data-id="'+dd+'"]');await p.mouse.wheel(0,-100);await p.waitForTimeout(150);
ok((await p.textContent('#canvas .el[data-id="'+dd+'"] .ddv'))==='High-pass','scrolling over it steps through the choices');
await p.click('#canvas .el[data-id="'+dd+'"]');await p.keyboard.press('Escape');await p.waitForTimeout(100);
ok(await p.locator('#canvas .ddmenu').count()===0,'Escape closes the menu');
await p.click('#mDesign');await p.waitForTimeout(150);
/* image element from a file */
const png=fileURLToPath(new URL('./a1.png',import.meta.url));
const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-act="addimg"]')]);await chooser.setFiles(png);await p.waitForTimeout(600);
const im=await st(()=>{const S=window.__vs.S,e=S.els.find(x=>x.id===S.sel),a=e&&S.assets[e.img];return e&&{type:e.type,w:e.w,h:e.h,aw:a&&a.w,ah:a&&a.h,cw:S.canvas.w};});
ok(im&&im.type==='image'&&Math.abs(im.w/im.h-im.aw/im.ah)<.02&&im.w<=im.cw,'Image… places the picture with its own shape ('+(im&&im.w)+'×'+(im&&im.h)+')');
ok(/url\(/.test(await st(()=>getComputedStyle(document.querySelector('#canvas .el[data-id="'+window.__vs.S.sel+'"]')).backgroundImage)),'the image is drawn');
await p.click('#rbody [data-act="imgnat"]');await p.waitForTimeout(100);
ok(await st(()=>{const S=window.__vs.S,e=S.els.find(x=>x.id===S.sel),a=S.assets[e.img];return e.w===a.w&&e.h===a.h;}),'Original size sets the picture\'s own size');
/* the player's runtime draws both and the dropdown works there too */
const project=await st(()=>{const s=window.__vs.snapshot();return{canvas:s.canvas,els:s.els,tags:s.tags,lists:[],banks:s.banks,groups:[],pages:[]};});
const p2=await app.b.newPage();const errs2=[];p2.on('pageerror',e=>errs2.push(e.message));
await p2.goto(p.url().replace('/apps/maker/','/apps/plugin/ui/runtime.html'));await p2.waitForTimeout(300);
await p2.evaluate(pr=>window.postMessage({t:'load',project:pr,assets:{},fonts:{}},'*'),project);await p2.waitForTimeout(400);
await p2.click('.el[data-id="'+dd+'"]');await p2.waitForTimeout(150);
await p2.click('.ddmenu .ddi[data-i="0"]');await p2.waitForTimeout(150);
ok((await p2.textContent('.el[data-id="'+dd+'"] .ddv'))==='Low-pass'&&errs2.length===0,'the player draws the dropdown and it works there '+errs2.join(' | '));
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
