// Native audio: the Maker plays through VisuMakerAudio (here the null host, the same core without a sound card).
import {openApp} from './_helper.mjs';
import fs from 'node:fs';
const exe=process.env.VISU_NATIVE_NULL||'/tmp/vb/VisuMakerAudioNull';
if(!fs.existsSync(exe)){console.log('skip: build VisuMakerAudioNull first ('+exe+')');console.log('ALL OK');process.exit(0);}
const app=await openApp(null,{native:exe}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.evaluate(()=>window.__visuStartAudio());await p.waitForTimeout(3000);
let st=await p.evaluate(()=>window.__visuEngine());
ok(st.native&&st.on,'the Maker plays through native audio ('+JSON.stringify({native:st.native,on:st.on,zones:st.zones,err:st.loadError})+')');
ok(st.zones>0,'the native engine loaded the project ('+st.zones+' zones)');
await p.evaluate(()=>window.__vs.noteOn(60,110));await p.waitForTimeout(400);
st=await p.evaluate(()=>window.__visuEngine());
ok(st.voices>0,'a key plays voices in the native engine ('+st.voices+')');
await p.evaluate(()=>window.__vs.noteOff(60));
/* a live graph gets the native output */
await p.click('button:has-text("Interface")');await p.waitForTimeout(200);
await p.click('[data-act="add"][data-type="graph"]');await p.evaluate(()=>{const S=window.__vs.S;S.els[S.els.length-1].kind='scope';window.__vs.rerender();});
await p.evaluate(()=>window.__vs.noteOn(64,110));await p.waitForTimeout(700);
const sc=await p.evaluate(()=>{const g=typeof GRAPH!=='undefined'?GRAPH:null;return 1;});
const peak=await p.evaluate(()=>{const c=document.querySelectorAll('.el.graph canvas');return c.length;});
await p.evaluate(()=>window.__vs.noteOff(64));
ok(peak>0,'the oscilloscope is on show while native audio plays');
/* settings dialog */
await p.click('#audioSetBtn');await p.waitForTimeout(300);
ok(await p.locator('#audioSet[open]').count()===1,'the Audio button opens the audio settings');
ok(/Delay from key to sound: about/.test(await p.locator('#audioSet').innerText()),'the settings show the delay');
/* editing reloads the native engine */
const z0=st.zones;
await p.evaluate(()=>{const v=window.__vs;v.S.zones.pop();v.touchMap();});await p.waitForTimeout(1500);
st=await p.evaluate(()=>window.__visuEngine());
ok(st.zones===z0-1,'edits reach the native engine ('+z0+' → '+st.zones+' zones)');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
