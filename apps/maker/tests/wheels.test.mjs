// Pitch and mod wheels: dragging sends pitch bend / controller 1 to the engine, the pitch wheel springs back,
// the mod wheel stays, keys and double-click work, and a MIDI keyboard's wheels move them on screen.
import {openApp} from './_helper.mjs';
const app=await openApp({width:1500,height:860}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');await p.waitForTimeout(300);
await p.click('[data-view=sound]');await p.waitForTimeout(400);
await p.evaluate(()=>window.__vs.ensureAudio&&window.__vs.ensureAudio());
await p.waitForFunction(()=>window.__visuEngine&&window.__visuEngine().on,null,{timeout:20000}).catch(()=>{});
ok(await p.evaluate(()=>window.__visuEngine().on),'the engine runs');
await p.evaluate(()=>{const port=window.__vs.ENG.node.port,o=port.postMessage.bind(port);window.__sent=[];port.postMessage=(m,t)=>{if(m.t==='bend'||m.t==='cc')window.__sent.push(m);return o(m,t);};});
const wh=async(sel)=>(await p.$(sel)).boundingBox();
const val=k=>p.evaluate(k=>window.__vs.WH[k],k);
ok((await p.$$('#mapWheels .whl')).length===2&&(await p.$$('#kbWheels .whl')).length===2,'wheels next to the Sound tab piano and the Test keyboard');
/* pitch: drag up, it bends; let go, it springs back */
let b=await wh('#mapWheels .whl[data-wk="bend"]');
await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y-30,{steps:6});
const up=await val('bend');const sentUp=await p.evaluate(()=>window.__sent.filter(m=>m.t==='bend').pop());
ok(up>.9&&sentUp&&sentUp.v>.9,'dragging the pitch wheel up bends up ('+up.toFixed(2)+')');
ok(await p.evaluate(()=>window.__vs.S.view)&&await p.evaluate(()=>document.querySelector('#kbWheels .whl[data-wk="bend"]').classList.contains('moved')),'both pitch wheels show it');
await p.mouse.up();await p.waitForTimeout(100);
const back=await p.evaluate(()=>window.__sent.filter(m=>m.t==='bend').pop());
ok((await val('bend'))===.5&&back.v===.5,'letting go springs back to the middle, and the engine hears it');
await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height+40,{steps:6});
ok((await val('bend'))<.1,'dragging down bends down');await p.mouse.up();
/* mod: drag up, it stays */
b=await wh('#mapWheels .whl[data-wk="mod"]');
await p.mouse.move(b.x+b.width/2,b.y+b.height-4);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2-4,{steps:5});await p.mouse.up();
const mv=await val('mod'),mcc=await p.evaluate(()=>window.__sent.filter(m=>m.t==='cc'&&m.cc===1).pop());
ok(mv>.2&&mv<.9&&mcc&&mcc.v===Math.round(mv*127),'the mod wheel sends controller 1 and stays where it is let go ('+mv.toFixed(2)+' = '+(mcc&&mcc.v)+')');
/* keys and double-click */
await p.focus('#mapWheels .whl[data-wk="mod"]');await p.keyboard.press('PageUp');
ok((await val('mod'))===1,'PageUp: mod wheel all the way up');
await p.dblclick('#mapWheels .whl[data-wk="mod"]');
ok((await val('mod'))===0,'double-click resets the mod wheel');
await p.focus('#mapWheels .whl[data-wk="bend"]');await p.keyboard.down('ArrowUp');
const kb=await val('bend');await p.keyboard.up('ArrowUp');
ok(kb>.5&&(await val('bend'))===.5,'arrow keys bend, and it springs back when the key is let go');
ok(await p.evaluate(()=>document.querySelector('#mapWheels .whl[data-wk="mod"]').getAttribute('aria-valuenow'))==='0','screen readers get the value');
/* a MIDI keyboard's wheels move the ones on screen (the same handler a MIDI input calls) */
const shown=await p.evaluate(()=>{const v=window.__vs;v.wheelShow('bend',12000/16383);v.wheelShow('mod',100/127);return[getComputedStyle(document.querySelector('#kbWheels .whl[data-wk="mod"]')).getPropertyValue('--v')];});
ok(Math.abs(parseFloat(shown[0])-100/127)<.01,'MIDI moves the wheels on screen');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
