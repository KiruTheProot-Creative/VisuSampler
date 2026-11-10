import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.click('#presetBtn');await p.click('[data-pre="rompler"]');
await p.click('[data-view="fx"]');await p.waitForTimeout(300);
/* every effect module, one at a time, in the master chain: must make finite, audible sound */
const res=await p.evaluate(async()=>{
  const v=window.__vs,S=v.S;v.ensureAudio();const out={};
  const types=Object.keys(v.FXT).filter(k=>v.FXT[k].kind==='fx'&&!['ret','mixer','msjoin'].includes(k));
  await new Promise(r=>setTimeout(r,2500));/* the shared engine loads */
  const ac=v.AU.ctx,an=ac.createAnalyser();an.fftSize=2048;v.AU.master.connect(an);const buf=new Float32Array(2048);
  const s=S.samples[0];
  for(const t of types){
    S.fx.graphs={};const g=v.graphOf('master'),inp=g.nodes[0],o=g.nodes[1];g.cables=[];
    const n=v.fxNode(t,200,100);if(t==='conv'){n.s={ir:s.id};}
    g.nodes.push(n);const outPort=v.FXT[t].raw?v.FXT[t].outs[0]:'mix',inPort=v.FXT[t].ins[0];
    g.cables.push(v.mkCable(inp,'out',n,inPort),v.mkCable(n,outPort,o,'in'));
    if(t==='xover'){g.cables.push(v.mkCable(n,'high',o,'in'),v.mkCable(n,'mid',o,'in'));}
    if(t==='mssplit'){const j=v.fxNode('msjoin',400,100);g.nodes.push(j);g.cables=g.cables.filter(c=>c.to.n!==o.id);g.cables.push(v.mkCable(n,'mid',j,'mid'),v.mkCable(n,'side',j,'side'),v.mkCable(j,'out',o,'in'));}
    await new Promise(r=>setTimeout(r,700));/* the engine picks up the new chain */
    v.noteOn(53,110);await new Promise(r=>setTimeout(r,420));
    let pk=0,fin=true;for(let k=0;k<6;k++){an.getFloatTimeDomainData(buf);for(const x of buf){if(!isFinite(x))fin=false;pk=Math.max(pk,Math.abs(x));}await new Promise(r=>setTimeout(r,30));}
    v.noteOff(53);v.sampPanic();await new Promise(r=>setTimeout(r,60));
    out[t]={pk:+pk.toFixed(3),fin,nodes:1};
  }
  /* sends: group chain sends to bus 1, master returns it */
  S.fx.graphs={};const gm=v.graphOf('master'),r=v.fxNode('ret',200,200);gm.nodes.push(r);gm.cables.push(v.mkCable(r,'out',gm.nodes[1],'in'));
  const grp=S.zones[0].group,gg=v.graphOf(grp),snd=v.fxNode('send',200,100);gg.nodes.push(snd);gg.cables=[v.mkCable(gg.nodes[0],'out',snd,'in')];
  await new Promise(r=>setTimeout(r,700));v.noteOn(S.zones[0].lo,110);await new Promise(r=>setTimeout(r,400));let pk=0;an.getFloatTimeDomainData(buf);for(const x of buf)pk=Math.max(pk,Math.abs(x));v.noteOff(S.zones[0].lo);v.sampPanic();
  out.__send={pk:+pk.toFixed(3)};
  /* LFO modulation is tested in the engine's own tests (apps/plugin/tests) */
  return out;
});
for(const [k,r] of Object.entries(res)){
  if(k==='__send') ok(r.pk>.01,'send to bus, return in master: peak '+r.pk);
  else ok(r.fin&&r.pk>.005&&r.pk<8&&r.nodes>0,k+': peak '+r.pk+(r.fin?'':' NOT FINITE'));
}
await p.click('[data-view="fx"]');await p.evaluate(()=>{const v=window.__vs,S=v.S;S.fx.graphs={};const g=v.graphOf('master'),a=v.fxNode('pod',220,60),b=v.fxNode('pwah',470,60),c=v.fxNode('tapeecho',720,60);g.nodes.push(a,b,c);g.cables=[v.mkCable(g.nodes[0],'out',a,'in'),v.mkCable(a,'mix',b,'in'),v.mkCable(b,'mix',c,'in'),v.mkCable(c,'mix',g.nodes[1],'in')];g.nodes[1].x=980;v.fxRender();});
await p.waitForTimeout(300);await p.screenshot({path:'/tmp/fx1.png'});
await p.click('.fxn.pedal .foot');await p.waitForTimeout(150);
ok(await p.evaluate(()=>window.__vs.S.fx.graphs.master.nodes.find(n=>n.type==='pod').bypass===true),'footswitch toggles bypass');
/* new settings: new modules get them on; modules saved before they existed keep their old sound */
const up=await p.evaluate(()=>{const v=window.__vs,g=v.S.fx.graphs.master;
  const fresh=v.fxNode('dist',100,100),lim=v.fxNode('limiter',100,200);
  const old=v.fxNode('amp',100,300);delete old.p.os;const oldLim=v.fxNode('limiter',100,400);delete oldLim.p.brick;
  g.nodes.push(fresh,lim,old,oldLim);v.fxRender();
  return{fresh:fresh.p.os,lim:lim.p.brick,old:old.p.os,oldLim:oldLim.p.brick,opts:v.FXT.dist.params.find(q=>q.k==='os').opts};});
ok(up.fresh===1&&up.lim===1,'new Distortion modules are oversampled and new Limiters are brick walls');
ok(up.old===0&&up.oldLim===0,'modules saved before those settings existed keep their old sound (Oversampling off, classic Limiter)');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
