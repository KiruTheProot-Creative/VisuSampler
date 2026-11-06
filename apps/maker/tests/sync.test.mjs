// "Sync to tempo" for effects and the per-note LFO: note values that follow the tempo.
import {openApp} from './_helper.mjs';
const app=await openApp({width:1500,height:900}),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('button:has-text("Effects")');await p.waitForTimeout(500);
/* a phaser in the master chain */
const nid=await p.evaluate(()=>{const S=window.__vs.S,g=S.fx.graphs.master;const n={id:'nSync1',type:'phaser',x:300,y:300,bypass:false,name:'Phaser',p:{rate:.4,depth:60,fb:30,mix:50},tag:{}};g.nodes.push(n);S.fx.sel=n.id;return n.id;});
await p.click('button:has-text("Sound")');await p.waitForTimeout(200);await p.click('button:has-text("Effects")');await p.waitForTimeout(400);
await p.click('#fxNodes .fxn[data-id="'+nid+'"] .fxh').catch(()=>{});await p.waitForTimeout(300);
ok(await p.locator('#fxInsp [data-fn="sync"]').count()===1,'effects with a rate or time offer "Sync to tempo"');
await p.locator('#fxInsp [data-fn="sync"]').check();await p.waitForTimeout(300);
const pv=()=>p.evaluate(id=>{const r=document.querySelector('.fxn[data-id="'+id+'"] .fxp[data-k="rate"] .pv');return r?r.textContent:'';},nid);
const a=await pv();
ok(/^1\/|bar/.test(a),'the rate shows a note value: '+a);
await p.evaluate(()=>{window.__vs.S.bpm=60;});await p.click('button:has-text("Sound")');await p.waitForTimeout(150);await p.click('button:has-text("Effects")');await p.waitForTimeout(300);
const b=await pv();
const hz=s=>parseFloat((s.split('·')[1]||'').trim());
ok(a.split('·')[0]===b.split('·')[0]&&Math.abs(hz(a)/hz(b)-2)<.05,'at half the tempo the same note is half as fast ('+a+' → '+b+')');
await p.evaluate(id=>{const r=document.querySelector('.fxn[data-id="'+id+'"] .fxp[data-k="rate"] .pr');r.value=1000;r.dispatchEvent(new Event('input',{bubbles:true}));},nid);await p.waitForTimeout(150);
const c=await pv();ok(c.indexOf('1/64')===0,'the slider at the top is the fastest note: '+c);
const ex=await p.evaluate(async id=>{const v=window.__vs;const m=(await v.buildVsamp()).manifest;const n=m.project.fx.master.nodes.find(x=>x.id===id);return{sync:n.sync,ps:n.ps&&n.ps.rate,hz:m.fxRanges.phaser.rate[5],syncFlag:m.fxRanges.phaser.rate[3]};},nid);
ok(ex.sync===true&&ex.ps===1&&ex.hz===1&&ex.syncFlag===1,'the library carries the sync setting for the player '+JSON.stringify(ex));
/* per-note LFO */
await p.click('button:has-text("Sound")');await p.waitForTimeout(400);
await p.evaluate(()=>{const v=window.__vs,S=v.S;S.map.group=S.groups[0];S.snd.focus='group';const c=S.gset[S.groups[0]];c.vlfo={on:true,shape:'sine',rate:5,delay:0,cut:0,pitch:50,vol:0};});
await p.click('#leftM .grow[data-g]');await p.waitForTimeout(300);
await p.locator('#snInsGroup [data-vl="sync"]').check();await p.waitForTimeout(250);
ok(await p.locator('#snInsGroup select[data-vl="note"]').count()===1,'the per-note LFO can sync to a note value');
await p.selectOption('#snInsGroup select[data-vl="note"]','7');await p.waitForTimeout(200);
const lv=await p.evaluate(()=>{const S=window.__vs.S,g=S.map.group;return S.gset[g].vlfo;});
ok(lv.sync===true&&lv.note===7,'the LFO keeps its note (1/8)');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
await app.close();console.log(fails.length?'FAILED '+fails.length:'ALL OK');process.exit(fails.length?1:0);
