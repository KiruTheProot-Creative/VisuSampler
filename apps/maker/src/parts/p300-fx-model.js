/* ---------- modular FX: model + analysis ---------- */
const AO=['dry','wet','mix'];
const FP=(k,label,min,max,unit,def,o)=>Object.assign({k,label,min,max,unit,def},o||{});
const FXT={
  input:{label:'Input',kind:'io',cat:'io',ins:[],outs:['out'],params:[],cpu:0,lat:0,hint:'Audio coming from the sampler voices.'},
  output:{label:'Output',kind:'io',cat:'io',ins:['in'],outs:[],params:[],cpu:0,lat:0,hint:'Audio going to the host.'},
  delay:{label:'Delay',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Echo. Time can sync to the project tempo and time signature.',
    params:[FP('time','Time',1,2000,'ms',350,{sync:1}),FP('fb','Feedback',0,95,'%',35),FP('tone','Tone',0,100,'%',60),FP('mix','Mix',0,100,'%',30)]},
  reverb:{label:'Reverb',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:4,lat:0,hint:'Room and hall tails.',
    params:[FP('size','Size',0,100,'%',60),FP('decay','Decay',0.1,12,'s',2.4),FP('damp','Damping',0,100,'%',40),FP('mix','Mix',0,100,'%',30)]},
  chorus:{label:'Chorus',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,hint:'Thickens the sound with a moving short delay.',
    params:[FP('rate','Rate',0.05,10,'Hz',0.8),FP('depth','Depth',0,100,'%',40),FP('mix','Mix',0,100,'%',50)]},
  phaser:{label:'Phaser',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,hint:'Sweeping notches.',
    params:[FP('rate','Rate',0.05,10,'Hz',0.4),FP('depth','Depth',0,100,'%',60),FP('fb','Feedback',0,95,'%',30),FP('mix','Mix',0,100,'%',50)]},
  dist:{label:'Distortion',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Saturation and drive.',
    params:[FP('drive','Drive',0,100,'%',30),FP('tone','Tone',0,100,'%',50),FP('mix','Mix',0,100,'%',100)]},
  filter:{label:'Filter',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Low-pass filter.',
    params:[FP('cutoff','Cutoff',20,20000,'Hz',8000),FP('res','Resonance',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  eq:{label:'EQ',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Three band tone control.',
    params:[FP('low','Low',-12,12,'dB',0),FP('mid','Mid',-12,12,'dB',0),FP('high','High',-12,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  comp:{label:'Compressor',kind:'fx',cat:'Dynamics',ins:['in','sc'],outs:AO,cpu:2,lat:0,hint:'Evens out level. The sc input is an optional sidechain.',
    params:[FP('thresh','Threshold',-60,0,'dB',-18),FP('ratio','Ratio',1,20,':1',3),FP('attack','Attack',0.1,100,'ms',10),FP('mix','Mix',0,100,'%',100)]},
  limiter:{label:'Limiter',kind:'fx',cat:'Dynamics',ins:['in'],outs:AO,cpu:2,lat:5,hint:'Catches peaks. Uses 5 ms of lookahead, so it adds latency.',
    params:[FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('mix','Mix',0,100,'%',100)]},
  lfo:{label:'LFO',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.2,lat:0,hint:'Slow wave. Drag from its out port to any parameter dot.',
    params:[FP('rate','Rate',0.05,20,'Hz',1),FP('depth','Depth',0,100,'%',100)]},
  env:{label:'Follower',kind:'mod',cat:'Modulators',ins:['in'],outs:['out'],cpu:.4,lat:0,hint:'Envelope follower: turns the loudness of its audio input into a control signal.',
    params:[FP('attack','Attack',1,200,'ms',10),FP('release','Release',10,2000,'ms',200),FP('gain','Gain',0,100,'%',70)]},
  macro:{label:'Macro',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:0,lat:0,hint:'Turns any tag (a knob, a button, the bank) into a control signal.',
    params:[FP('value','Value',0,100,'%',50)]}
};
const FX_CATS=['Time','Modulation','Tone','Dynamics','Modulators'];
const fxIsMod=n=>FXT[n.type].kind==='mod';
function graphOf(scope){
  scope=scope||S.fx.scope;
  if(!S.fx.graphs[scope]){
    const g={nodes:[],cables:[]}; S.fx.graphs[scope]=g;
    const a=fxNode('input',20,120),b=fxNode('output',620,120);
    g.nodes.push(a,b); g.cables.push(mkCable(a,'out',b,'in'));
  }
  return S.fx.graphs[scope];
}
const curG=()=>graphOf(S.fx.scope);
function fxNode(type,x,y,o){
  const d=FXT[type],n={id:nid('n'),type,x:Math.round(x),y:Math.round(y),bypass:false,name:(o&&o.name)||d.label,p:{},tag:{}};
  d.params.forEach(q=>{n.p[q.k]=q.def;});
  return n;
}
function mkCable(a,ap,b,bp){return{id:nid('c'),from:{n:a.id,p:ap},to:{n:b.id,p:bp},amt:50};}
const nodeById=(g,id)=>g.nodes.find(n=>n.id===id)||null;
const isCtlPort=p=>p.indexOf('p:')===0;
function cableKind(g,c){const n=nodeById(g,c.from.n);return n&&fxIsMod(n)?'ctl':'audio';}
function portKind(n,p,dir){
  const d=FXT[n.type];
  if(dir==='out') return fxIsMod(n)?'ctl':(p==='out'?'mix':p);
  return isCtlPort(p)?'ctl':'in';
}
/* can an output port connect to an input port? */
function canConnect(g,a,ap,b,bp){
  if(a.id===b.id) return 'A node cannot feed itself.';
  const ctl=fxIsMod(a);
  if(ctl&&!isCtlPort(bp)) return 'Control signals go to parameter dots, not audio inputs.';
  if(!ctl&&isCtlPort(bp)) return 'Audio goes to audio inputs. Use an LFO, Follower or Macro for parameters.';
  if(!ctl&&FXT[b.type].ins.indexOf(bp)<0) return 'That input does not exist.';
  if(g.cables.some(c=>c.from.n===a.id&&c.from.p===ap&&c.to.n===b.id&&c.to.p===bp)) return 'Already connected.';
  return '';
}
function addCable(g,a,ap,b,bp){
  const why=canConnect(g,a,ap,b,bp); if(why) return why;
  if(isCtlPort(bp)) g.cables=g.cables.filter(c=>!(c.to.n===b.id&&c.to.p===bp));
  const c=mkCable(a,ap,b,bp); g.cables.push(c); return '';
}
function removeNode(g,id){g.nodes=g.nodes.filter(n=>n.id!==id);g.cables=g.cables.filter(c=>c.from.n!==id&&c.to.n!==id);}
/* ---- effective parameter value (tag binding + modulation) ---- */
const FXT0=performance.now();
const fxClock=()=>(performance.now()-FXT0)/1000;
function modOut(g,n,t){
  const v=n.p;
  if(n.type==='lfo') return lfoOut(g,n,t);
  if(n.type==='env') return FXA.follow[n.id]!=null?clamp(FXA.follow[n.id]*(v.gain/100)*3,0,1):0;
  if(n.type==='adsr') return .5+.5*adsrOut(v,t)*(v.depth/100);
  if(n.type==='midisrc') return midiSrcOut(v.src);
  if(n.type==='rand') return randOut(n,t);
  if(n.type==='macro'){const tg=n.tag.value&&tagById(n.tag.value);return tg?tg.value:v.value/100;}
  return 0;
}
function paramNorm(n,q){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg) return tg.value;
  return clamp((n.p[q.k]-q.min)/(q.max-q.min),0,1);
}
function paramReal(g,n,q,t,wantMod){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]);
  if(tg&&q.sync&&tg.kind==='sync') return msOfBeats(syncBeats(tg,S.sig));
  let nm=paramNorm(n,q),mod=false;
  if(wantMod!==false) g.cables.forEach(c=>{
    if(c.to.n===n.id&&c.to.p==='p:'+q.k){const s=nodeById(g,c.from.n);if(s){nm+=(modOut(g,s,t)-.5)*2*(c.amt/100);mod=true;}}
  });
  nm=clamp(nm,0,1);
  return{v:q.min+nm*(q.max-q.min),mod};
}
function parReal(g,n,q,t){const r=paramReal(g,n,q,t);return typeof r==='number'?{v:r,mod:false,sync:true}:r;}
function fmtPar(q,v){
  if(q.unit==='Hz'&&v>=1000) return (v/1000).toFixed(2)+' kHz';
  const d=Math.abs(q.max-q.min)<=30?(Math.abs(v)<10?2:1):0;
  return v.toFixed(d)+(q.unit==='%'||q.unit===':1'?q.unit:' '+q.unit);
}
/* ---- analysis ---- */
function nodeTailMs(g,n,t){
  const dk=FXT[n.type].params.find(q=>q.k==='decay');if(dk&&n.type!=='reverb')return parReal(g,n,dk,t).v*1000;
  if(n.type==='gatedverb')return n.p.gate;
  if(n.type==='tapeecho'){const ms=n.p.time,fb=Math.min(.95,n.p.fb/100);return fb<=0?ms:Math.min(30000,ms*Math.ceil(Math.log(.001)/Math.log(fb)));}
  if(n.type==='reverb') return n.p.decay*1000;
  if(n.type==='delay'){
    const ms=parReal(g,n,FXT.delay.params[0],t).v,fb=Math.min(.95,n.p.fb/100);
    return fb<=0?ms:Math.min(30000,ms*Math.ceil(Math.log(.001)/Math.log(fb)));
  }
  return 0;
}
function fxAnalyze(g){
  const t=fxClock(),an={cycles:[],idle:[],cost:0,lat:0,tail:0,pdc:[],warn:[],ok:true,arr:{}};
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio');
  const out={},inn={};
  g.nodes.forEach(n=>{out[n.id]=[];inn[n.id]=[];});
  aud.forEach(c=>{if(out[c.from.n]&&inn[c.to.n]){out[c.from.n].push(c);inn[c.to.n].push(c);}});
  /* cycles */
  const col={},stack=[],back=new Set();
  const dfs=id=>{
    col[id]=1; stack.push(id);
    out[id].forEach(c=>{
      const to=c.to.n;
      if(col[to]===1){
        back.add(c.id);
        const cyc=stack.slice(stack.indexOf(to)),ok=cyc.some(x=>FXT[nodeById(g,x).type].fbOk);
        an.cycles.push({ids:cyc,ok});
      }else if(!col[to]) dfs(to);
    });
    stack.pop(); col[id]=2;
  };
  g.nodes.forEach(n=>{if(!col[n.id])dfs(n.id);});
  an.cycles.forEach(c=>{
    const names=c.ids.map(i=>nodeById(g,i).name).join(' → ');
    if(c.ok) an.warn.push({lvl:'note',t:'Feedback loop through a delay: '+names+'. Allowed, but watch the level.'});
    else{an.warn.push({lvl:'bad',t:'Loop with no delay in it: '+names+'. This would blow up, so the plugin will mute it.'});an.ok=false;}
  });
  /* reachability */
  const inp=g.nodes.filter(n=>n.type==='input'),reach=new Set();
  const q=inp.map(n=>n.id); q.forEach(i=>reach.add(i));
  while(q.length){const id=q.shift();out[id].forEach(c=>{if(!reach.has(c.to.n)){reach.add(c.to.n);q.push(c.to.n);}});}
  g.nodes.forEach(n=>{
    const d=FXT[n.type];
    if(d.kind==='fx'&&!reach.has(n.id)) an.idle.push(n.id);
    if(d.kind==='fx'&&reach.has(n.id)&&!out[n.id].length) an.warn.push({lvl:'warn',t:n.name+' has no outputs connected, so it does nothing.'});
  });
  if(an.idle.length) an.warn.push({lvl:'warn',t:an.idle.length+' effect'+(an.idle.length>1?'s are':' is')+' not reachable from Input and will not run.'});
  const outs=g.nodes.filter(n=>n.type==='output');
  if(!outs.some(o=>reach.has(o.id))){an.warn.push({lvl:'bad',t:'Nothing reaches the Output. The sound is silent.'});an.ok=false;}
  /* cost */
  g.nodes.forEach(n=>{if(!n.bypass&&(reach.has(n.id)||fxIsMod(n)))an.cost+=FXT[n.type].cpu;});
  /* latency, tails (back edges ignored) */
  const memo={};
  const arr=id=>{
    if(memo[id]) return memo[id];
    const n=nodeById(g,id),r=memo[id]={lat:0,tail:0}; /* seed to break recursion */
    let ml=0,mt=0;
    inn[id].forEach(c=>{if(back.has(c.id))return;const a=arr(c.from.n);ml=Math.max(ml,a.lat);mt=Math.max(mt,a.tail);});
    r.lat=ml+(n.bypass?0:FXT[n.type].lat); r.tail=mt+(n.bypass?0:nodeTailMs(g,n,t));
    return r;
  };
  g.nodes.forEach(n=>arr(n.id)); an.arr=memo;
  outs.forEach(o=>{if(reach.has(o.id)){an.lat=Math.max(an.lat,memo[o.id].lat);an.tail=Math.max(an.tail,memo[o.id].tail);}});
  /* delay compensation where branches meet */
  g.nodes.forEach(n=>{
    ['in','sc'].forEach(port=>{
      const cs=inn[n.id].filter(c=>c.to.p===port&&!back.has(c.id));
      if(cs.length<2) return;
      const mx=Math.max.apply(null,cs.map(c=>memo[c.from.n].lat));
      cs.forEach(c=>{const d=mx-memo[c.from.n].lat;if(d>0)an.pdc.push({cable:c.id,node:n.name,ms:d});});
    });
  });
  if(an.pdc.length) an.warn.push({lvl:'note',t:'Branches meet with different latency. The plugin adds delay compensation automatically ('+an.pdc.map(p=>'+'+p.ms+' ms before '+p.node).join(', ')+').'});
  if(an.cost>14) an.warn.push({lvl:'warn',t:'Heavy chain. This could be a lot for older computers.'});
  return an;
}
/* ---- stack view helpers ---- */
function chainOrder(g){
  const an=fxAnalyze(g),indeg={};
  const fx=g.nodes.filter(n=>FXT[n.type].kind==='fx');
  const ids=new Set(fx.map(n=>n.id));
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio'&&ids.has(c.from.n)&&ids.has(c.to.n));
  fx.forEach(n=>indeg[n.id]=0);
  aud.forEach(c=>indeg[c.to.n]++);
  const res=[],q=fx.filter(n=>!indeg[n.id]).sort((a,b)=>a.x-b.x);
  while(q.length){
    const n=q.shift(); res.push(n);
    aud.filter(c=>c.from.n===n.id).forEach(c=>{if(--indeg[c.to.n]===0)q.push(nodeById(g,c.to.n));});
  }
  fx.forEach(n=>{if(res.indexOf(n)<0)res.push(n);});
  return res;
}
function isStraight(g){
  const fx=g.nodes.filter(n=>FXT[n.type].kind==='fx');
  const aud=g.cables.filter(c=>cableKind(g,c)==='audio');
  if(aud.length!==fx.length+1) return false;
  return aud.every(c=>c.from.p==='mix'||c.from.p==='out')&&fx.every(n=>aud.filter(c=>c.to.n===n.id).length===1&&aud.filter(c=>c.from.n===n.id).length===1);
}
/* rebuild straight audio chain in the given order; control cables stay */
function relinkChain(g,order){
  const inp=g.nodes.find(n=>n.type==='input'),out=g.nodes.find(n=>n.type==='output');
  g.cables=g.cables.filter(c=>cableKind(g,c)==='ctl');
  let prev=inp,pp='out';
  order.forEach((n,i)=>{g.cables.push(mkCable(prev,pp,n,'in'));prev=n;pp='mix';n.x=Math.round(200+i*210);n.y=90+(i%2)*40;});
  g.cables.push(mkCable(prev,pp,out,'in'));
  inp.x=20;inp.y=120;out.x=Math.round(200+order.length*210);out.y=120;
}
