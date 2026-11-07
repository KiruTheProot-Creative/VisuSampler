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
/* edits send no audio again: the engine keeps what it has (this was the Sound-tab lag with many samples) */
await p.evaluate(()=>{const E=window.__vs.ENG,port=E.node.port,o=port.postMessage.bind(port);window.__loads=[];port.postMessage=(m,t)=>{if(m.t==='load')window.__loads.push(m.bytes.byteLength);return o(m,t);};
  window.__vs.ENG.lastLoaded=null;});
const full=await p.evaluate(async()=>(await window.__vs.engineBytes()).length);
await p.evaluate(()=>{const v=window.__vs;v.S.zones[0].vol=-3;v.touchMap();});await p.waitForTimeout(1500);
let L=await p.evaluate(()=>window.__loads);
ok(L.length===1&&L[0]<full/4,'a zone edit sends the project without its audio ('+L[0]+' of '+full+' bytes)');
st=await p.evaluate(()=>window.__visuEngine());
ok(st.zones===z0-1&&!st.loadError,'the engine reloaded with the audio it already had ('+st.zones+' zones'+(st.loadError?', '+st.loadError:'')+')');
await p.evaluate(()=>window.__vs.noteOn(60,110));await p.waitForTimeout(400);
st=await p.evaluate(()=>window.__visuEngine());await p.evaluate(()=>window.__vs.noteOff(60));
ok(st.voices>0,'and it still plays ('+st.voices+' voices)');
/* new audio in a sample (an edit in the sample editor) is sent again */
await p.evaluate(()=>{const v=window.__vs,z=v.S.zones[0],b=v.BUF.get(z.sample);b.ch=b.ch.map(c=>c.slice().reverse());v.touchMap();window.__loads=[];});await p.waitForTimeout(1500);
L=await p.evaluate(()=>window.__loads);st=await p.evaluate(()=>window.__visuEngine());
ok(L.length===1&&L[0]>4096&&!st.loadError,'changed audio is sent again ('+L[0]+' bytes'+(st.loadError?', '+st.loadError:'')+')');
/* if the engine lacks audio (it restarted, say), the Maker sends everything again */
await p.evaluate(()=>{window.__vs.ENG.node.port.postMessage({t:'unload'});window.__vs.S.zones[0].vol=-4;window.__vs.touchMap();window.__loads=[];});await p.waitForTimeout(2200);
L=await p.evaluate(()=>window.__loads);st=await p.evaluate(()=>window.__visuEngine());
ok(L.length>=2&&L[L.length-1]>=full*.9&&st.zones===z0-1&&!st.loadError,'missing audio is noticed and everything is sent again ('+L.join(', ')+')');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
