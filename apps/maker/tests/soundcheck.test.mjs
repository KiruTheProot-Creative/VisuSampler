// Records what the shared engine actually plays in the Maker (the AudioWorklet), and checks that knobs change the SOUND:
// group envelope attack, group pan and tune, an FX module switched by a button. (A knob change that never reaches the
// engine thread once went unnoticed because only parameters were checked.)
import {openApp} from './_helper.mjs';
const app=await openApp(),p=app.p,fails=[];
const ok=(c,m)=>{console.log((c?'ok  ':'FAIL ')+m);if(!c)fails.push(m);};
await p.evaluate(()=>window.__visuStartAudio());await p.waitForTimeout(2500);
const r=await p.evaluate(async()=>{
  const v=window.__vs,S=v.S,E=v.ENG,ac=v.AU.ctx,wait=ms=>new Promise(r=>setTimeout(r,ms));
  /* a held, looped zone: the demo pad */
  const z=S.zones.find(z=>z.loop&&z.loop.on),g=z.group,note=z.root;
  S.zones.forEach(x=>{if(x.group!==g)x.mute=true;});S.lists=[];
  const mk=(name,val)=>{const t={id:'tk'+name,name,kind:'number',min:0,max:1,unit:'',scale:'linear',dec:1,steps:[],basis:'note',value:val,def:val,target:'none',sys:false};S.tags.push(t);return t;};
  const atk=mk('chk attack',0),pan=mk('chk pan',.5),tune=mk('chk tune',.5),fxon=mk('chk dist',0),mac=mk('chk macro',1);
  const c=S.gset[g];c.env={on:true,a:5,d:300,s:100,r:200,tags:{a:atk.id}};c.links={pan:{tag:pan.id,from:-100,to:100},tune:{tag:tune.id,from:-12,to:12}};
  S.fx.graphs={};const G=v.graphOf('master'),inp=G.nodes[0],out=G.nodes[1],d=v.fxNode('dist',200,100);d.p.drive=80;d.byTag={tag:fxon.id,inv:false,tails:false};
  /* a macro on a knob sweeps a low-pass from 40 Hz (knob at 0) to fully open (knob at 1) */
  const f=v.fxNode('filter',400,100);f.p.cutoff=40;f.p.res=0;f.p.mix=100;const m=v.fxNode('macro',400,300);m.tag={value:mac.id};
  G.nodes.push(d,f,m);G.cables=[v.mkCable(inp,'out',d,'in'),v.mkCable(d,'mix',f,'in'),v.mkCable(f,'mix',out,'in'),v.mkCable(m,'out',f,'p:cutoff')];
  v.touchMap();await wait(1500);
  const rec=ms=>new Promise(res=>{const sp=ac.createScriptProcessor(2048,2,2),L=[],R=[];sp.onaudioprocess=e=>{L.push(new Float32Array(e.inputBuffer.getChannelData(0)));R.push(new Float32Array(e.inputBuffer.getChannelData(1)));};
    E.out.connect(sp);sp.connect(ac.destination);setTimeout(()=>{sp.disconnect();E.out.disconnect(sp);const cat=a=>{const all=new Float32Array(a.reduce((x,c)=>x+c.length,0));let o=0;a.forEach(c=>{all.set(c,o);o+=c.length;});return all;};res({l:cat(L),r:cat(R)});},ms);});
  const rms=(a,f,t)=>{let s=0;t=Math.min(t,a.length);for(let i=f;i<t;i++)s+=a[i]*a[i];return Math.sqrt(s/Math.max(1,t-f));};
  const play=async ms=>{const pr=rec(ms);v.noteOn(note,100);const x=await pr;v.noteOff(note);await wait(700);return x;};
  const sr=ac.sampleRate,early=x=>rms(x.l,0,Math.round(sr*.25)),mid=x=>rms(x.l,Math.round(sr*.3),Math.round(sr*.7)),midR=x=>rms(x.r,Math.round(sr*.3),Math.round(sr*.7));
  /* pitch from the autocorrelation peak (the pad is rich, so zero crossings mislead): returns the period in samples */
  const zc=a=>{const st=Math.round(sr*.35),N=4096;let best=0,lag=0;
    for(let L=40;L<1600;L++){let c=0,e1=0,e2=0;for(let i=0;i<N;i+=2){const x=a[st+i],y=a[st+i+L];c+=x*y;e1+=x*x;e2+=y*y;}const r=c/Math.sqrt(e1*e2+1e-12);if(r>best+.02){best=r;lag=L;}}
    return lag;};
  const o={};
  let x=await play(900);o.fastEarly=early(x);o.base=mid(x);o.baseZc=zc(x.l);
  v.setTag(atk,.8);x=await play(900);o.slowEarly=early(x);v.setTag(atk,0);
  v.setTag(pan,0);x=await play(900);o.panL=mid(x);o.panR=midR(x);v.setTag(pan,.5);
  v.setTag(tune,1);x=await play(900);o.upZc=zc(x.l);v.setTag(tune,.5);
  v.setTag(fxon,1);x=await play(900);o.distOn=mid(x);v.setTag(fxon,0);
  v.setTag(mac,0);x=await play(900);o.macroShut=mid(x);v.setTag(mac,1);
  o.err=E.lastErr||'';return o;});
console.log(JSON.stringify(r));
ok(r.err==='','no errors in the engine thread '+r.err);
ok(r.slowEarly<r.fastEarly*.3,'a knob on the group attack fades the sound in ('+r.slowEarly.toFixed(4)+' vs '+r.fastEarly.toFixed(4)+')');
ok(r.panR<r.panL*.05,'a knob on the group pan moves the sound to the left ('+r.panR.toFixed(4)+' right vs '+r.panL.toFixed(4)+' left)');
ok(Math.abs(r.baseZc/r.upZc-2)<.15,'a knob on the group tune raises the pitch an octave (period '+r.baseZc+' -> '+r.upZc+' samples)');
ok(r.distOn>r.base*1.3,'a button switches a distortion on ('+r.base.toFixed(4)+' -> '+r.distOn.toFixed(4)+')');
ok(r.macroShut<r.base*.3,'a macro on a knob closes a filter ('+r.base.toFixed(4)+' open -> '+r.macroShut.toFixed(4)+' shut)');
ok(app.errs.length===0,'no page errors '+app.errs.join(' | '));
console.log(fails.length?'FAILED '+fails.length:'ALL OK');await app.close();process.exit(fails.length?1:0);
