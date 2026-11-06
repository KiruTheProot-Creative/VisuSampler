// Moving effect modules or their sliders must not reload the whole project into the engine.
import {openApp} from './_helper.mjs';
const app=await openApp({width:1500,height:900}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.evaluate(()=>window.__visuStartAudio());await p.waitForTimeout(3000);
await p.click('button:has-text("Effects")');await p.waitForTimeout(500);
const cnt=()=>p.evaluate(()=>window.__vs.ENG.loads||0);
await p.evaluate(()=>{const E=window.__vs.ENG,pm=E.node.port.postMessage.bind(E.node.port);E.loads=0;E.node.port.postMessage=(m,t)=>{if(m.t==='load')E.loads++;return pm(m,t);};});
/* drag a module around for a second */
const node=p.locator('#fxNodes .fxn .fxh').first();const bb=await node.boundingBox();
await p.mouse.move(bb.x+20,bb.y+8);await p.mouse.down();
for(let i=0;i<30;i++){await p.mouse.move(bb.x+20+i*4,bb.y+8+i*2);await p.waitForTimeout(30);}
await p.mouse.up();await p.waitForTimeout(600);
ok(await cnt()===0,'dragging a module does not reload the engine ('+await cnt()+' reloads)');
/* move a slider */
const moved=await p.evaluate(()=>{const r=document.querySelector('#fxNodes .fxp .pr');if(!r)return false;for(let v=100;v<=900;v+=100){r.value=v;r.dispatchEvent(new Event('input',{bubbles:true}));}return true;});
await p.waitForTimeout(600);
ok(moved&&await cnt()===0,'moving an effect slider changes the engine live, without a reload ('+await cnt()+' reloads)');
/* a real change still reloads */
await p.evaluate(()=>{const v=window.__vs;v.S.zones.pop();v.touchMap();});await p.waitForTimeout(800);
ok(await cnt()>=1,'other edits still reach the engine');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
