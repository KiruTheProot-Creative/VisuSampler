// HyperSynth's panel (apps/plugin/hypersynth/ui/hypersynth.html) as the plugin shows it: the page and its fonts served
// by name on JUCE's origin, with a stand-in for the plugin (window.__JUCE__) that answers like HyperSynthEditor.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from './_helper.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),hs=path.join(root,'apps/plugin/hypersynth');
const files=new Map([['hypersynth.html',path.join(hs,'ui/hypersynth.html')],['fxcatalog.js',path.join(hs,'ui/fxcatalog.js')],['Unbounded.ttf',path.join(root,'assets/fonts/Unbounded.ttf')],['JetBrainsMono.ttf',path.join(root,'assets/fonts/JetBrainsMono.ttf')]]);
const defs=JSON.parse(fs.readFileSync(path.join(root,'apps/plugin/tests/golden/hypersynth-params.json'),'utf8'));
const tables=JSON.parse(fs.readFileSync(path.join(root,'apps/plugin/tests/golden/hypersynth-tables.json'),'utf8'));
const factory=JSON.parse(fs.readFileSync(path.join(hs,'presets/factoryPresets.json'),'utf8'));
const fails=[],errs=[],missing=[];const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
const b=await chromium.launch(),p=await b.newPage({viewport:{width:1440,height:792}});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://juce.backend')return r.abort();
  const f=files.get(u.pathname.split('/').pop()||'hypersynth.html');if(!f){missing.push(u.pathname);return r.fulfill({status:404,body:''});}
  return r.fulfill({status:200,contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'font/ttf',body:fs.readFileSync(f)});});
await p.addInitScript(([defs,factory,tables])=>{
  const vals=defs.map(d=>d.def),ls={};window.__calls=[];window.__notes=[];
  const idx=id=>defs.findIndex(d=>d.id===id);
  const answer=(name,a)=>{
    if(name==='getState')return{defs,values:vals.slice(),name:'Init',category:'Basics',version:'test'};
    if(name==='setParam'){const i=idx(a[0]);if(i>=0)vals[i]=a[1];return true;}
    if(name==='note'){window.__notes.push(a);return true;}
    if(name==='listPresets')return factory.map(f=>({id:'f:'+f.category+'/'+f.name,name:f.name,category:f.category,factory:true}));
    if(name==='loadPreset'){const f=factory.find(f=>'f:'+f.category+'/'+f.name===a[0]);defs.forEach((d,i)=>{vals[i]=f.params[d.id]!=null?f.params[d.id]:d.def;});return{name:f.name,category:f.category,values:vals.slice()};}
    if(name==='tablePreviews')return tables;
    if(name==='initSound'){window.__before=vals.slice();defs.forEach((d,i)=>{vals[i]=d.def;});return{name:'Init',category:'Basics',values:vals.slice()};}
    if(name==='undoInit'){if(!window.__before)return{error:'nothing to undo'};window.__before.forEach((v,i)=>{vals[i]=v;});window.__before=null;return{name:'CS Brass',category:'Brass',values:vals.slice()};}
    if(name==='samplePreview')return window.__smp&&a[0]===0&&a[1]===2?window.__smp:null;
    if(name==='importSample'){window.__smp={name:'Choir Ah',seconds:2.5,ch:2,peaks:Array.from({length:600},(_,i)=>(i%2?-1:1)*Math.abs(Math.sin(i/40))*.8)};
      vals[idx('l1.o3.mode')]=2;vals[idx('l1.o3.smp.root')]=57;return{name:'Choir Ah',how:'root A3 found',preview:window.__smp,values:vals.slice()};}
    if(name==='getFx')return window.__fx||null;
    if(name==='getMods')return window.__mods||{routes:[],shapes:[[0,0,0,.5,1,0,1,0,0],[0,0,0,.5,1,0,1,0,0],[0,0,0,.5,1,0,1,0,0],[0,0,0,.5,1,0,1,0,0]],names:['Macro 1','Macro 2','Macro 3','Macro 4']};
    if(name==='setMods'){window.__routes=JSON.parse(JSON.stringify(a[0]));return true;}
    if(name==='setLfoShape'){(window.__shapes=window.__shapes||{})[a[0]]=a[1].slice();return true;}
    if(name==='setMacroName'){(window.__mnames=window.__mnames||{})[a[0]]=a[1];return true;}
    if(name==='setFx'){window.__fx=a[0];window.__fxBuilds=(window.__fxBuilds||0)+(a[1]?1:0);return true;}
    if(name==='fxParam'){(window.__fxParams=window.__fxParams||[]).push(a);return true;}
    if(name==='tablePreview')return window.__custom&&a[0]===0&&a[1]===1?window.__custom:null;
    if(name==='importTable'){   // like the plugin: OSC 2 of layer I gets a 2-frame table, Wavetable mode, CUSTOM source
      const fr=[0,1].map(f=>Array.from({length:128},(_,i)=>Math.sin(2*Math.PI*i/128)*(f?.5:1)+(f?.5*Math.sin(6*Math.PI*i/128):0)));
      window.__custom={name:'My Growl',count:2,frames:fr};vals[idx('l1.o2.mode')]=0;vals[idx('l1.o2.wtsrc')]=1;
      return{name:'My Growl',how:'single cycles of a 110 Hz sound',preview:window.__custom,values:vals.slice()};}
    if(name==='savePreset')return{id:'u:'+a[1]+'/'+a[0]+'.hsyn'};
    return true;};
  window.__vals=vals;
  window.__JUCE__={backend:{addEventListener:(n,f)=>{(ls[n]=ls[n]||[]).push(f);},removeEventListener:()=>{},
    emitEvent:(n,d)=>{if(n!=='__juce__invoke')return;window.__calls.push([d.name,d.params]);const result=answer(d.name,d.params);setTimeout(()=>(ls.__juce__complete||[]).forEach(f=>f({promiseId:d.resultId,result})),2);}},
    __fire:(n,e)=>(ls[n]||[]).forEach(f=>f(e))};
},[defs,factory,tables]);
await p.goto('https://juce.backend/hypersynth.html');await p.waitForTimeout(800);
ok(missing.length===0,'everything the panel loads is built into the plugin'+(missing.length?' (missing '+missing.join()+')':''));
ok(errs.length===0,'no script errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
const st=await p.evaluate(()=>({knobs:document.querySelectorAll('.kn[data-id]').length,sliders:document.querySelectorAll('.sl[data-id]').length,keys:document.querySelectorAll('#keys [data-key]').length,
  name:document.querySelector('#lcdMain').textContent,scale:window.__hsScale}));
ok(st.knobs>=25&&st.sliders===13&&st.keys===61,`the panel is built (${st.knobs} knobs, ${st.sliders} sliders, ${st.keys} keys)`);
ok(Math.abs(st.scale-0.9)<0.01,'it scales to the window ('+st.scale.toFixed(2)+')');
/* a knob: drag up sets the parameter in the plugin */
const box=await p.locator('.kn[data-id="l1.lp.cut"] .dial').boundingBox();
await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2,box.y-60,{steps:6});await p.mouse.up();
const cut=await p.evaluate(()=>window.__vals[window.__hs.idx['l1.lp.cut']]);
const calls=await p.evaluate(()=>window.__calls.map(c=>c[0]));
ok(cut!==12000&&calls.includes('gesture'),'dragging LP CUT changes the plugin parameter, inside an automation gesture ('+Math.round(cut)+' Hz)');
const lcd=await p.evaluate(()=>document.querySelector('#lcdTop').textContent);
ok(/LOW-PASS CUTOFF/.test(lcd),'the screen above shows what is being changed ('+lcd+')');
/* layer II edits the other layer */
await p.click('.tab[data-tab="l2"]');
const l2=await p.evaluate(()=>document.querySelector('.kn[data-l="LP CUT"]').dataset.id);
ok(l2==='l2.lp.cut','the LAYER II tab edits layer II ('+l2+')');
/* oscillator mode: click cycles through the ready modes, the knobs follow */
await p.click('.tab[data-tab="l1"]');await p.click('[data-mode="0"]');
const m1=await p.evaluate(()=>({mode:document.querySelector('[data-mode="0"]').textContent,a:document.querySelector('.kn[data-k="0"][data-slot="a"]').dataset.id}));
ok(m1.mode==='FM'&&m1.a==='l1.o1.ratio','clicking the mode switches OSC 1 to FM, its knobs to RATIO / FM AMT');
/* wavetables: OSC 2 to Wavetable, the factory tables are drawn, a sound is imported */
await p.click('#stabs a[data-s="o1"]');for(let i=0;i<4&&(await p.textContent('[data-mode="1"]'))!=='WAVETABLE';i++)await p.click('[data-mode="1"]');
const wt=await p.evaluate(()=>({mode:document.querySelector('[data-mode="1"]').textContent,bar:document.querySelector('#wtbar').classList.contains('show'),name:document.querySelector('#wtName').textContent,tabs:window.__hs.tabs.length}));
ok(wt.mode==='WAVETABLE'&&wt.bar&&wt.name==='Basic Shapes'&&wt.tabs===tables.length,`OSC 2 in Wavetable mode shows its table on the screen (${JSON.stringify(wt)})`);
await p.evaluate(()=>window.__JUCE__.__fire('values',{i:[window.__hs.idx['l1.o2.table']],v:[16]}));
const t16=await p.evaluate(()=>document.querySelector('#wtName').textContent);
ok(t16==='Resonant Saw','all '+tables.length+' factory tables can be chosen and drawn (table 17: '+t16+')');
await p.click('#wtImp');await p.waitForTimeout(150);
const im=await p.evaluate(()=>({name:document.querySelector('#wtName').textContent,cus:document.querySelector('#wtCus').classList.contains('on'),lcd:document.querySelector('#lcdTop').textContent}));
ok(/My Growl · 2 frames/.test(im.name)&&im.cus&&/IMPORTED · 2 FRAMES/.test(im.lcd),'IMPORT… brings a sound in as a custom table ('+JSON.stringify(im)+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-wavetable.png')});
await p.click('#wtFac');const fac=await p.evaluate(()=>({src:window.__vals[window.__hs.idx['l1.o2.wtsrc']],name:document.querySelector('#wtName').textContent}));
await p.click('#wtCus');const back=await p.evaluate(()=>window.__vals[window.__hs.idx['l1.o2.wtsrc']]);
ok(fac.src===0&&!/My Growl/.test(fac.name)&&back===1,'FACTORY / CUSTOM switch between the two, the import stays ('+JSON.stringify(fac)+')');
ok(errs.length===0,'still no script errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
/* modulation: drag LFO 1 onto LP CUT, a ring appears; right-click shows its amount; the LFO is drawn on the screen */
const drop=async(fromSel,toSel)=>{const a=await p.locator(fromSel).boundingBox(),b=await p.locator(toSel).boundingBox();
  await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await p.mouse.up();await p.waitForTimeout(60);};
await drop('.src[data-src="lfo1"]','.kn[data-id="l1.lp.cut"] .dial');
const md1=await p.evaluate(()=>({routes:window.__routes,ring:!!document.querySelector('.kn[data-id="l1.lp.cut"] svg.ring path'),lcd:document.querySelector('#lcdTop').textContent}));
ok(md1.routes&&md1.routes.length===1&&md1.routes[0].src==='lfo1'&&md1.routes[0].dst==='l1.lp.cut'&&md1.ring&&/LFO 1 →/.test(md1.lcd),'dragging LFO 1 onto LP CUT modulates it, the knob shows a ring ('+JSON.stringify(md1)+')');
await drop('.src[data-src="vel"]','.kn[data-id="l1.lp.cut"] .dial');await drop('.mname[data-src="macro2"]','.sl[data-id="l1.aenv.r"] .track');
await drop('.src[data-src="env1"]','.kn[data-id="l1.lp.type"]').catch(()=>{});
const m2=await p.evaluate(()=>({n:window.__routes.length,dsts:window.__routes.map(r=>r.src+'>'+r.dst).join(' '),rings:document.querySelectorAll('.kn[data-id="l1.lp.cut"] svg.ring path').length}));
ok(m2.n===3&&m2.rings===2&&/macro2>l1.aenv.r/.test(m2.dsts),'more sources stack up as rings; macros drag too, onto sliders as well ('+JSON.stringify(m2)+')');
const kb2=await p.locator('.kn[data-id="l1.lp.cut"] .dial').boundingBox();
await p.mouse.click(kb2.x+kb2.width/2,kb2.y+kb2.height/2,{button:'right'});await p.waitForTimeout(80);
const pop=await p.evaluate(()=>({rows:document.querySelectorAll('#modPop .mrow').length}));
const bar=await p.locator('#modPop .mrow >> nth=0 >> .amt').boundingBox();
await p.mouse.move(bar.x+bar.width*.5,bar.y+bar.height/2);await p.mouse.down();await p.mouse.move(bar.x+bar.width*.95,bar.y+bar.height/2,{steps:4});await p.mouse.up();await p.waitForTimeout(60);
const amt=await p.evaluate(()=>window.__routes.find(r=>r.src==='lfo1').amt);
await p.click('#modPop .mrow >> nth=-1 >> [data-rm]');const left=await p.evaluate(()=>window.__routes.length);
ok(pop.rows===2&&amt>.8&&left===2,'right-click a knob: its routes, drag an amount (LFO 1 now '+amt+'), remove one');
await p.mouse.click(5,5);
/* the LFO editor: click LFO 1 opens it; dragging the line makes it a drawn shape; a double-click adds a point */
await p.click('.src[data-src="lfo1"]');await p.waitForTimeout(60);
const ed=await p.evaluate(()=>({tab:document.querySelector('#stabs a.on').dataset.s,sel:document.querySelector('#modSel button.on').dataset.ms,flds:[...document.querySelectorAll('#fields .fld span')].map(x=>x.textContent).join(',')}));
ok(ed.tab==='mod'&&ed.sel==='lfo1'&&ed.flds==='RATE,SYNC,MODE,SHAPE,PHASE,FADE','clicking LFO 1 shows it on the screen ('+JSON.stringify(ed)+')');
const cv=await p.locator('#scr').boundingBox(),cx=f=>cv.x+cv.width*(24+704*f)/752,cy=f=>cv.y+cv.height*(330-278*f)/380;
await p.mouse.move(cx(.25),cy(1));await p.mouse.down();await p.mouse.move(cx(.3),cy(.6),{steps:4});await p.mouse.up();await p.waitForTimeout(60);
await p.mouse.dblclick(cx(.8),cy(.9));await p.waitForTimeout(60);
const sh=await p.evaluate(()=>({shape:window.__vals[window.__hs.idx['lfo1.shape']],pts:window.__shapes&&window.__shapes[0]}));
ok(sh.shape===7&&sh.pts&&sh.pts.length/3===6,'editing turns the sine into a drawn shape you can change and add points to ('+(sh.pts?sh.pts.length/3:0)+' points)');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-lfo.png')});
/* envelopes drag on the screen */
await p.click('.src[data-src="env1"]');await p.waitForTimeout(40);
const d0=await p.evaluate(()=>window.__vals[window.__hs.idx['env1.d']]);
const dh=await p.evaluate(()=>{const h=envHandles('env1',1).find(h=>h.k==='ds');return[h.x,h.y];});
await p.mouse.move(cv.x+cv.width*dh[0]/752,cv.y+cv.height*dh[1]/380);await p.mouse.down();await p.mouse.move(cv.x+cv.width*dh[0]/752+40,cv.y+cv.height*dh[1]/380+20,{steps:4});await p.mouse.up();
const e1=await p.evaluate(()=>({d:window.__vals[window.__hs.idx['env1.d']],s:window.__vals[window.__hs.idx['env1.s']]}));
ok(e1.d>d0*1.5&&e1.s<.4,'dragging the envelope on the screen sets decay and sustain ('+JSON.stringify(e1)+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-env.png')});
/* macros rename */
await p.dblclick('.mname[data-src="macro1"]');await p.keyboard.type('Bright');await p.keyboard.press('Enter');
const mn=await p.evaluate(()=>({sent:window.__mnames&&window.__mnames[0],shown:document.querySelector('.mname[data-src="macro1"] .nm').textContent}));
ok(mn.sent==='Bright'&&mn.shown==='Bright','a macro can be renamed ('+JSON.stringify(mn)+')');
/* the matrix */
await p.click('#stabs a[data-s="matrix"]');const mx=await p.evaluate(()=>document.querySelectorAll('#matrix .mrow').length);
ok(mx===2,'the MATRIX screen lists every route ('+mx+')');await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-matrix.png')});
await p.click('#stabs a[data-s="o0"]');
ok(errs.length===0,'no script errors with modulation'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
/* Spectrum and Sample modes, warps, INIT */
await p.click('#stabs a[data-s="o2"]');
for(let i=0;i<6&&(await p.textContent('[data-mode="2"]'))!=='SPECTRUM';i++)await p.click('[data-mode="2"]');
const sp=await p.evaluate(()=>({mode:document.querySelector('[data-mode="2"]').textContent,flds:[...document.querySelectorAll('#fields .fld span')].map(x=>x.textContent).join(','),
  knobs:[...document.querySelectorAll('.osc[data-k="2"] .kn span')].map(x=>x.textContent).slice(0,2).join(',')}));
ok(sp.mode==='SPECTRUM'&&/PARTS,STRETCH,FORMANT,F\.AMT,WARP,AMOUNT/.test(sp.flds)&&sp.knobs==='TILT,ODD/EVEN','OSC 3 plays Spectrum: TILT and ODD/EVEN on the panel, partials, stretch and formant on the screen ('+JSON.stringify(sp)+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-spectrum.png')});
await p.click('[data-mode="2"]');
const s0=await p.evaluate(()=>({mode:document.querySelector('[data-mode="2"]').textContent,bar:document.querySelector('#smpbar').classList.contains('show')}));
await p.click('#smpImp');await p.waitForTimeout(120);
const s1=await p.evaluate(()=>({name:document.querySelector('#smpName').textContent,root:window.__vals[window.__hs.idx['l1.o3.smp.root']],lcd:document.querySelector('#lcdTop').textContent,
  flds:[...document.querySelectorAll('#fields .fld span')].map(x=>x.textContent).join(',')}));
ok(s0.mode==='SAMPLE'&&s0.bar&&s1.name==='Choir Ah'&&s1.root===57&&/ROOT A3/.test(s1.lcd)&&/LOOP,L\.START,L\.END/.test(s1.flds),'Sample mode: IMPORT… loads a sound, its root key is set, loop settings on the screen ('+JSON.stringify(s1)+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-sample.png')});
await p.click('#stabs a[data-s="o0"]');
const wf=await p.evaluate(()=>[...document.querySelectorAll('#fields .fld')].map(f=>f.dataset.id).filter(x=>/warp/.test(x)).join(','));
ok(wf==='l1.o1.warp,l1.o1.warpAmt','every oscillator has WARP and AMOUNT ('+wf+')');
const mode0=await p.evaluate(()=>window.__vals[window.__hs.idx['l1.o3.mode']]);const window_def=defs.find(d=>d.id==='l1.o3.mode').def;
await p.click('#init');await p.waitForTimeout(80);
const ini=await p.evaluate(()=>({btn:document.querySelector('#init').textContent,mode:window.__vals[window.__hs.idx['l1.o3.mode']],top:document.querySelector('#lcdTop').textContent}));
await p.click('#init');await p.waitForTimeout(80);
const und=await p.evaluate(()=>({btn:document.querySelector('#init').textContent,mode:window.__vals[window.__hs.idx['l1.o3.mode']],main:document.querySelector('#lcdMain').textContent}));
ok(mode0===2&&ini.btn==='UNDO'&&ini.mode===window_def&&/INIT/.test(ini.top)&&und.btn==='INIT'&&und.mode===2&&/is back/.test(und.main),'INIT starts from scratch in one click, and UNDO brings the sound back ('+JSON.stringify({ini,und})+')');
await p.click('#init');await p.waitForTimeout(80);
ok(errs.length===0,'no script errors with the new modes'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
/* the FX tab: modules from NodeFX's catalogue, patched like NodeFX */
await p.click('.tab[data-tab="fx"]');await p.waitForTimeout(100);
const fx0=await p.evaluate(()=>({shown:!document.querySelector('#fxView').hidden,synth:getComputedStyle(document.querySelector('#synthView')).display,lib:document.querySelectorAll('.fxadd').length,mods:[...document.querySelectorAll('.fxm b')].map(b=>b.textContent),cables:document.querySelectorAll('#fxCables path.hit').length}));
ok(fx0.shown&&fx0.synth==='none'&&fx0.lib>=45&&fx0.mods.join()==='SYNTH,OUTPUT'&&fx0.cables===1,'the FX tab shows NodeFX\'s modules and the chain SYNTH → OUTPUT ('+JSON.stringify(fx0)+')');
await p.click('.fxadd[data-t="ring"]');await p.click('.fxadd[data-t="reverb"]');await p.waitForTimeout(80);
const fx1=await p.evaluate(()=>{const g=JSON.parse(window.__fx).graph,nm=id=>g.nodes.find(n=>n.id===id).type;return{chain:g.cables.map(c=>nm(c.from.n)+'.'+c.from.p+'>'+nm(c.to.n)+'.'+c.to.p).sort().join(' '),builds:window.__fxBuilds};});
ok(fx1.chain==='input.out>ring.in reverb.mix>output.in ring.mix>reverb.in'&&fx1.builds>=2,'clicking Ring mod, then Reverb, adds them to the end of the chain ('+fx1.chain+')');
/* a knob on the reverb */
const rk=await p.locator('.fxm:has(b:text-is("REVERB")) .fxk[data-k="mix"] .dial').boundingBox();
await p.mouse.move(rk.x+rk.width/2,rk.y+rk.height/2);await p.mouse.down();await p.mouse.move(rk.x+rk.width/2,rk.y-50,{steps:5});await p.mouse.up();await p.waitForTimeout(400);
const fx2=await p.evaluate(()=>({sent:(window.__fxParams||[]).slice(-1)[0],stored:JSON.parse(window.__fx).graph.nodes.find(n=>n.type==='reverb').p.mix,lcd:document.querySelector('#lcdTop').textContent}));
ok(fx2.sent&&fx2.sent[1]==='mix'&&fx2.sent[2]>30&&fx2.stored===fx2.sent[2],'turning the reverb\'s MIX plays at once and is stored ('+JSON.stringify(fx2)+')');
/* an LFO patched onto the ring mod's frequency, by dragging a cable */
await p.click('.fxadd[data-t="lfo"]');await p.waitForTimeout(60);
const lo=await p.locator('.fxm:has(b:text-is("LFO")) .jack[data-dir="out"]').boundingBox(),rf=await p.locator('.fxm:has(b:text-is("RING MOD")) .jack.pj').first().boundingBox();
await p.mouse.move(lo.x+lo.width/2,lo.y+lo.height/2);await p.mouse.down();await p.mouse.move(rf.x+rf.width/2,rf.y+rf.height/2,{steps:8});await p.mouse.up();await p.waitForTimeout(80);
const fx3=await p.evaluate(()=>{const g=JSON.parse(window.__fx).graph;const c=g.cables.find(c=>c.to.p.indexOf('p:')===0);return{to:c&&c.to.p,from:c&&g.nodes.find(n=>n.id===c.from.n).type,dashed:document.querySelectorAll('#fxCables path.ctl').length,modded:document.querySelectorAll('.fxk.modded').length};});
ok(fx3.from==='lfo'&&/^p:/.test(fx3.to)&&fx3.dashed===1&&fx3.modded===1,'dragging from the LFO onto a knob\'s amber jack modulates it ('+JSON.stringify(fx3)+')');
/* a loop is refused */
const ro=await p.locator('.fxm:has(b:text-is("REVERB")) .jack[data-p="wet"]').boundingBox(),ri=await p.locator('.fxm:has(b:text-is("RING MOD")) .jack[data-p="in"]').boundingBox();
const before=await p.evaluate(()=>JSON.parse(window.__fx).graph.cables.length);
await p.mouse.move(ro.x+ro.width/2,ro.y+ro.height/2);await p.mouse.down();await p.mouse.move(ri.x+ri.width/2,ri.y+ri.height/2,{steps:8});await p.mouse.up();await p.waitForTimeout(80);
const fx4=await p.evaluate(()=>({n:JSON.parse(window.__fx).graph.cables.length,lcd:document.querySelector('#lcdMain').textContent}));
ok(fx4.n===before&&/back into itself/.test(fx4.lcd),'a cable that would loop the sound back is refused ('+fx4.lcd+' '+fx4.n+'/'+before+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-fx.png')});
fs.writeFileSync(path.join(root,'apps/plugin/tests/golden/hypersynth-fx.json'),JSON.stringify(JSON.parse(await p.evaluate(()=>window.__fx)),null,1));
/* a cable clicked comes out */
const hit=await p.evaluate(()=>{const g=JSON.parse(window.__fx).graph,ring=g.nodes.find(n=>n.type==='ring');return g.cables.find(c=>c.from.n===ring.id).id;});
await p.evaluate(id=>document.querySelector(`#fxCables path.hit[data-c="${id}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true})),hit);await p.waitForTimeout(60);
const fx5=await p.evaluate(id=>!JSON.parse(window.__fx).graph.cables.some(c=>c.id===id),hit);
ok(fx5,'clicking a cable pulls it out');
/* Ctrl + wheel does not zoom the page */
const zoomed=await p.evaluate(()=>{const e=new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('#panel').dispatchEvent(e);return e.defaultPrevented;});
ok(zoomed,'Ctrl + mouse wheel cannot zoom the panel');
await p.click('.tab[data-tab="l1"]');
ok(errs.length===0,'no script errors on the FX tab'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
/* keyboard */
const kb=await p.locator('#keys .wk[data-key="60"]').boundingBox();
await p.mouse.move(kb.x+kb.width/2,kb.y+kb.height*.8);await p.mouse.down();await p.waitForTimeout(80);await p.mouse.up();
const notes=await p.evaluate(()=>window.__notes);
ok(notes.length>=2&&notes[0][0]===60&&notes[0][2]===true&&notes[1][2]===false,'the keyboard plays middle C (note on, then off)');
/* presets */
await p.click('#lcd');await p.waitForTimeout(150);
await p.click('.pitem:has-text("CS Brass")');await p.waitForTimeout(150);
const ps=await p.evaluate(()=>({name:document.querySelector('#lcdMain').textContent,cut:window.__hs.vals[window.__hs.idx['l1.lp.cut']],items:document.querySelectorAll('.pitem').length}));
ok(ps.name==='CS Brass'&&ps.cut===600&&ps.items===factory.length,'the preset browser lists '+ps.items+' presets and loads CS Brass ('+JSON.stringify(ps)+')');
await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-browser.png')});await p.click('#pClose');await p.click('#stabs a[data-s="filter"]');await p.waitForTimeout(100);await p.screenshot({path:path.join(os.tmpdir(),'hypersynth-ui.png')});
/* the host moves a parameter (automation): the knob follows */
await p.evaluate(()=>window.__JUCE__.__fire('values',{i:[window.__hs.idx['master']],v:[-24]}));
const rot=await p.evaluate(()=>document.querySelector('.kn[data-id="master"] .cap').style.transform);
ok(/rotate\(-[0-9]/.test(rot),'automation from the DAW moves the knob ('+rot+')');
await b.close();
console.log(fails.length?fails.length+' FAILED':'ALL OK');process.exit(fails.length?1:0);
