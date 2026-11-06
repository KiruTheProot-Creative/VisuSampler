// Graph element: envelope and filter follow their knobs, waveform shows the playing patch, scope and spectrum move with the sound.
import {openApp} from './_helper.mjs';
const app=await openApp({width:1500,height:900}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('button:has-text("Interface")');await p.waitForTimeout(300);
const kinds=['env','filter','wave','scope','spectrum'];
const ids=[];
for(let i=0;i<kinds.length;i++){
  await p.click('[data-act="add"][data-type="graph"]');await p.waitForTimeout(150);
  ids.push(await p.evaluate(([k,i])=>{const v=window.__vs,S=v.S,el=S.els[S.els.length-1];el.kind=k;el.x=20+(i%3)*280;el.y=20+Math.floor(i/3)*140;v.rerender();return el.id;},[kinds[i],i]));
}
/* link the envelope and filter to knobs */
const r1=await p.evaluate(ids=>{const v=window.__vs,S=v.S,T=n=>S.tags.find(t=>t.kind==='number'&&!t.sys);
  const nt=S.tags.filter(t=>t.kind==='number'&&!t.sys);const e=S.els.find(x=>x.id===ids[0]),f=S.els.find(x=>x.id===ids[1]);
  e.env={a:nt[0].id,d:nt[1].id,s:nt[2].id,r:nt[3].id};f.filt={type:'lp',cut:nt[0].id,res:nt[1].id};v.rerender();
  const px=id=>{const c=document.querySelector('.el[data-id="'+id+'"] canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]*3+d[i+2]*7;return s;};
  const a0=px(ids[0]),f0=px(ids[1]);v.setTag(nt[0],nt[0].value>.5?.1:.9);v.setTag(nt[2],nt[2].value>.5?.1:.9);
  return{env:a0!==px(ids[0]),filt:f0!==px(ids[1]),wave:px(ids[2])>0};},ids);
ok(r1.env,'the envelope curve follows its knobs');
ok(r1.filt,'the filter curve follows its cutoff knob');
ok(r1.wave,'the waveform draws the playing patch');
/* live: play a note and see scope/spectrum move */
await p.evaluate(()=>window.__visuStartAudio&&window.__visuStartAudio());await p.waitForTimeout(2500);
const snap=id=>p.evaluate(id=>{const c=document.querySelector('.el[data-id="'+id+'"] canvas');return c.toDataURL().length+':'+c.toDataURL().slice(-80);},id);
const s0=await snap(ids[3]),sp0=await snap(ids[4]);
await p.evaluate(()=>window.__vs.noteOn(60,110));await p.waitForTimeout(500);
const s1=await snap(ids[3]),sp1=await snap(ids[4]);

await p.evaluate(()=>window.__vs.noteOff(60));
ok(s0!==s1,'the oscilloscope moves while a note plays');
ok(sp0!==sp1,'the spectrum moves while a note plays');
/* inspector */
await p.click('.el[data-id="'+ids[1]+'"]');await p.waitForTimeout(200);
ok(await p.locator('#rbody [data-gk="filt.cut"]').count()===1,'the inspector offers the filter knobs');
/* export carries the waveform peaks for the player */
const ex=await p.evaluate(async()=>{const c=await window.__vs.buildVsamp();const g=c.manifest.project.graphPeaks||{};return Object.keys(g).length;});
ok(ex>0,'the library carries waveform peaks for the player ('+ex+' groups)');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
