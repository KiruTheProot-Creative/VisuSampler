// FX: switch a module on and off from the interface (tag-linked bypass), and macros on knobs
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('[data-view="fx"]');await p.waitForTimeout(300);
const id=await p.evaluate(()=>{const v=window.__vs,S=v.S;S.fx.scope='master';const g=v.graphOf('master'),n=v.fxNode('delay',300,120);g.nodes.push(n);S.fx.sel=n.id;S.fx.cable=null;v.fxRender();return n.id;});
await p.waitForTimeout(150);
ok(await p.locator('#fxInsp [data-fn=bytag]').count()===1,'effects offer "On / off by" a tag');
const els0=await p.evaluate(()=>window.__vs.S.els.length);
await p.click('#fxInsp [data-fa=mkbybtn]');await p.waitForTimeout(150);
const st=await p.evaluate(id=>{const v=window.__vs,S=v.S,n=v.graphOf('master').nodes.find(x=>x.id===id),t=S.tags.find(x=>x.id===n.byTag.tag),b=S.els[S.els.length-1];
  return{tag:!!t,tails:n.byTag.tails,btn:b.type==='button'&&b.tag===t.id&&b.mode==='toggle'&&b.led,count:S.els.length};},id);
ok(st.tag&&st.btn&&st.count===els0+1,'"Make an on/off button" adds a toggle button with a light, linked to the module');
ok(st.tails,'delays and reverbs let their tails ring out by default');
/* switching the tag off shows the module as bypassed */
await p.evaluate(id=>{const v=window.__vs,S=v.S,n=v.graphOf('master').nodes.find(x=>x.id===id),t=S.tags.find(x=>x.id===n.byTag.tag);v.setTag(t,0);},id);
await p.waitForTimeout(100);
ok(await p.evaluate(id=>document.querySelector('#centerF .fxn[data-id="'+id+'"]').classList.contains('bypass'),id),'turning the button off shows the module as bypassed');
await p.check('#fxInsp [data-fn=byinv]');await p.waitForTimeout(100);
ok(!(await p.evaluate(id=>document.querySelector('#centerF .fxn[data-id="'+id+'"]').classList.contains('bypass'),id)),'Reverse flips it');
/* macro cables start at 100 % and can go negative */
const amt=await p.evaluate(()=>{const v=window.__vs,g=v.graphOf('master'),m=v.fxNode('macro',100,300),f=v.fxNode('filter',300,300);g.nodes.push(m,f);const c=v.mkCable(m,'out',f,'p:cutoff');g.cables.push(c);v.S.fx.cable=c.id;v.S.fx.sel=null;v.fxRender();return c.amt;});
await p.waitForTimeout(100);
ok(amt===100,'a cable from a macro starts at 100 %');
ok(await p.getAttribute('#fxInsp [data-fa=amt]','min')==='-100','cable amounts can be negative');
ok(await p.evaluate(()=>window.__vs.FXT.filter.params.find(q=>q.k==='cutoff').log===1),'cutoff moves on a log scale');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
