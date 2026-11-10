// NodeFX: the Effects editor as an effect plugin (nodefx.html with a stand-in for the plugin).
// Only the chain editor shows; macros, Mix and Output talk to the plugin; the chain is sent when it changes (and only
// stored when boxes just move); parameter moves go straight to the plugin; presets list, load, step, save, delete.
import {openApp} from './_helper.mjs';
const factory={id:'f:Basics/Echo',name:'Echo',bank:'Basics',factory:true},calls=[];
const app=await openApp({width:1500,height:900},{page:'nodefx.html',
  expose:{__nfxLog:(name,json)=>{calls.push([name,JSON.parse(json)]);return true;}},
  init:()=>{
    const store={rack:null,presets:[{id:'f:Basics/Echo',name:'Echo',bank:'Basics',factory:true},{id:'f:Guitar/Crunch',name:'Crunch',bank:'Guitar',factory:true}],user:{}};
    const echo={v:1,graph:{nodes:[{id:'i',type:'input',x:40,y:150,bypass:false,name:'Input',p:{},tag:{}},{id:'d',type:'delay',x:300,y:150,bypass:false,name:'Delay',p:{time:350,fb:35,tone:60,mix:30},tag:{time:'m1'}},{id:'o',type:'output',x:620,y:150,bypass:false,name:'Output',p:{},tag:{}}],
      cables:[{id:'c1',from:{n:'i',p:'out'},to:{n:'d',p:'in'},amt:50},{id:'c2',from:{n:'d',p:'mix'},to:{n:'o',p:'in'},amt:50}]},tags:[{id:'m1',name:'Time',value:.5}],mix:.8};
    const crunch={v:1,graph:{nodes:[{id:'i',type:'input',x:40,y:150,bypass:false,name:'Input',p:{},tag:{}},{id:'a',type:'amp',x:300,y:150,bypass:false,name:'Amp',p:{amp:1,gain:60},tag:{}},{id:'o',type:'output',x:620,y:150,bypass:false,name:'Output',p:{},tag:{}}],
      cables:[{id:'c1',from:{n:'i',p:'out'},to:{n:'a',p:'in'},amt:50},{id:'c2',from:{n:'a',p:'mix'},to:{n:'o',p:'in'},amt:50}]},tags:[{id:'m1',name:'Gain',value:.6}]};
    window.__nfxMock=(name,a)=>{
      window.__nfxLog(name,JSON.stringify(a));
      if(name==='getRack')return store.rack;
      if(name==='setRack'){store.rack=a[0];return true;}
      if(name==='listPresets')return store.presets.concat(Object.values(store.user));
      if(name==='loadPreset')return a[0]==='f:Basics/Echo'?JSON.stringify(echo):a[0]==='f:Guitar/Crunch'?JSON.stringify(crunch):(store.user[a[0]]&&store.user[a[0]].json);
      if(name==='savePreset'){const id='u:'+a[1]+'/'+a[0];store.user[id]={id,name:a[0],bank:a[1],factory:false,json:a[2]};return{id};}
      if(name==='deletePreset'){delete store.user[a[0]];return true;}
      return true;};
  }});
const p=app.p,fails=[];const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.waitForTimeout(1500);
const vis=sel=>p.evaluate(s=>{const e=document.querySelector(s);return!!e&&e.offsetParent!==null;},sel);
ok(await p.evaluate(()=>document.body.classList.contains('nodefx')&&document.title==='NodeFX'),'NodeFX mode is on');
ok(!(await vis('#viewTabs'))&&!(await vis('#insBtn'))&&!(await vis('#fxScope'))&&(await vis('#fxStage'))&&(await vis('#fxPal')),'only the chain editor shows (no tabs, instruments or group chains), with the module list');
ok((await p.textContent('#nfxPName')).includes('Echo'),'the first factory preset loads when there is no saved chain ('+(await p.textContent('#nfxPName'))+')');
ok(await p.locator('.nfxk[data-i]').count()===8&&(await p.textContent('.nfxn[data-i="0"]'))==='Time','8 macro knobs; the preset named its first one "Time"');
const lastRack=()=>calls.filter(c=>c[0]==='setRack').pop();
const r1=lastRack();
ok(r1&&r1[1][1]===true&&JSON.parse(r1[1][0]).graph.nodes.some(n=>n.type==='delay')&&JSON.parse(r1[1][0]).fxRanges.delay.time[1]===2000,'the chain (with parameter ranges) goes to the plugin, rebuilt');
/* a macro */
const k=await (await p.$('.nfxk[data-i="0"]')).boundingBox();
await p.mouse.move(k.x+k.width/2,k.y+k.height/2);await p.mouse.down();await p.mouse.move(k.x+k.width/2,k.y-30,{steps:4});await p.mouse.up();
const m=calls.filter(c=>c[0]==='setMacro').pop();
ok(m&&m[1][0]===0&&m[1][1]>.6,'dragging a macro sends it to the plugin ('+(m&&m[1][1].toFixed(2))+')');
/* host automation moves the knob */
await p.evaluate(()=>window.__nfxEvents.macros({v:[.1,.2,.3,0,0,0,0,0]}));
ok(await p.evaluate(()=>window.__vs.nfxMacroTags()[2].value)===.3&&(await p.textContent('.nfxm[data-i="2"] .nfxv'))==='30%','DAW automation moves the knobs');
/* Mix / Output */
await p.focus('.nfxk[data-g="out"]');await p.keyboard.press('ArrowDown');
const g=calls.filter(c=>c[0]==='setGlobal').pop();
ok(g&&g[1][0]==='out'&&g[1][1]<0,'Output knob sends a level ('+(g&&g[1][1].toFixed(1))+' dB)');
/* moving a box only stores the layout; changing a module rebuilds */
const n0=calls.filter(c=>c[0]==='setRack').length;
await p.evaluate(()=>{const g=window.__vs.graphOf('master');g.nodes.find(n=>n.type==='delay').x+=40;});await p.waitForTimeout(400);
const mv=calls.filter(c=>c[0]==='setRack').slice(n0);
ok(mv.length===1&&mv[0][1][1]===false,'moving a box stores the layout without rebuilding the sound');
await p.evaluate(()=>{const v=window.__vs,g=v.graphOf('master');const d=g.nodes.find(n=>n.type==='delay'),o=g.nodes.find(n=>n.type==='output');const r=v.fxNode('reverb',460,260);g.nodes.push(r);
  g.cables=g.cables.filter(c=>c.to.n!==o.id);g.cables.push(v.mkCable(d,'mix',r,'in'),v.mkCable(r,'mix',o,'in'));v.fxRender();});
await p.waitForTimeout(400);
const rb=lastRack();ok(rb[1][1]===true&&JSON.parse(rb[1][0]).graph.nodes.some(n=>n.type==='reverb'),'adding a module rebuilds the chain in the plugin');
/* a parameter drag: straight to the plugin, no rebuild */
const n1=calls.filter(c=>c[0]==='setRack').length;
await p.evaluate(()=>{const v=window.__vs,g=v.graphOf('master'),d=g.nodes.find(n=>n.type==='delay');v.fxParam(d,v.FXT.delay.params.find(q=>q.k==='fb'),()=>{d.p.fb=60;});});
await p.waitForTimeout(400);
const sp=calls.filter(c=>c[0]==='setParam').pop();
ok(sp&&sp[1][1]==='fb'&&sp[1][2]===60&&calls.filter(c=>c[0]==='setRack').slice(n1).every(c=>c[1][1]===false),'moving a parameter goes straight to the plugin, without rebuilding');
/* presets: menu, next, save, delete */
await p.click('#nfxPName');await p.waitForTimeout(200);
ok(await p.locator('#nfxMenu [data-p]').count()===2&&/Factory · Basics/.test(await p.textContent('#nfxMenu')),'the preset menu lists the factory presets by bank');
await p.fill('#nfxSaveName','My Echo');await p.fill('#nfxSaveBank','Mine');await p.click('[data-nfx="save"]');await p.waitForTimeout(300);
const sv=calls.filter(c=>c[0]==='savePreset').pop();const svj=sv&&JSON.parse(sv[1][2]);
ok(sv&&sv[1][0]==='My Echo'&&sv[1][1]==='Mine'&&svj.graph.nodes.some(n=>n.type==='reverb')&&svj.tags.length===8&&svj.out===undefined,'Save preset stores the chain and macros (not the output level)');
ok((await p.textContent('#nfxPName')).includes('Mine / My Echo'),'the preset bar shows it');
await p.click('#nfxNext');await p.waitForTimeout(400);
ok((await p.textContent('#nfxPName')).includes('Echo')&&!(await p.textContent('#nfxPName')).includes('My'),'▶ steps to the next preset (wraps around)');
await p.click('#nfxNext');await p.waitForTimeout(400);
ok(await p.evaluate(()=>{const a=window.__vs.graphOf('master').nodes.find(n=>n.type==='amp');return a&&a.p.treble!=null&&a.p.mix===100;}),'parameters a preset leaves out start at their defaults');
ok((await p.textContent('#nfxPName')).includes('Crunch')&&await p.evaluate(()=>window.__vs.graphOf('master').nodes.some(n=>n.type==='amp'))&&(await p.textContent('.nfxn[data-i="0"]'))==='Gain','loading a preset brings its chain and macro names');
p.once('dialog',d=>d.accept());
await p.click('#nfxPName');await p.waitForTimeout(200);await p.click('[data-del="u:Mine/My Echo"]');await p.waitForTimeout(300);
ok(calls.some(c=>c[0]==='deletePreset'&&c[1][0]==='u:Mine/My Echo')&&await p.locator('#nfxMenu [data-p]').count()===2,'a user preset can be deleted');
await p.keyboard.press('Escape');
await p.screenshot({path:'/tmp/claude-0/-home-claude/a30fc208-8447-5909-8f35-21df8f80b96b/scratchpad/nodefx.png'});
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED':'ALL OK');await app.close();process.exit(fails.length?1:0);
