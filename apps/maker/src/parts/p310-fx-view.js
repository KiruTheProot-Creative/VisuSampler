/* ---------- modular FX: view ---------- */
const PORT_LBL={out:'out',in:'in',sc:'side',dry:'dry',wet:'wet',mix:'mix',in1:'in 1',in2:'in 2',in3:'in 3',in4:'in 4',low:'low',mid:'mid',high:'high',side:'side'};
const portBtn=(n,p,dir,kind,extra)=>'<button type="button" class="port '+dir+' k-'+kind+'" data-n="'+n.id+'" data-p="'+p+'" data-dir="'+dir+'" aria-label="'+esc(n.name+' '+(PORT_LBL[p]||p)+' '+dir+'put')+'"'+(extra||'')+'></button>';
function parRowHTML(g,n,q,stack){
  const tg=n.tag[q.k]&&tagById(n.tag[q.k]),r=parReal(g,n,q,fxClock());
  const norm=tg?tg.value:paramNorm(n,q);
  const port=stack?'':portBtn(n,'p:'+q.k,'in','ctl');
  return '<div class="fxp'+(tg?' tagged':'')+(r.mod?' modd':'')+'" data-k="'+q.k+'">'+port
    +'<span class="pl">'+q.label+'</span>'
    +'<input type="range" class="pr" min="0" max="1000" value="'+Math.round(norm*1000)+'" data-pk="'+q.k+'" data-n="'+n.id+'"'+(tg?' disabled':'')+' aria-label="'+esc(n.name+' '+q.label)+'">'
    +'<output class="pv">'+fmtPar(q,r.v)+'</output></div>';
}
function nodeHTML(g,n,an){
  const d=FXT[n.type],cls=['fxn','k-'+d.kind];if(d.pedal||n.skin==='pedal')cls.push('pedal');
  if(n.bypass) cls.push('bypass'); if(an.idle.indexOf(n.id)>=0) cls.push('idle'); if(S.fx.sel===n.id) cls.push('sel');
  const rows=Math.max(d.ins.length,d.outs.length);let io='';
  for(let i=0;i<rows;i++){
    const a=d.ins[i],o=d.outs[i];
    io+='<div class="fxr"><span class="side l">'+(a?portBtn(n,a,'in','in')+'<i>'+PORT_LBL[a]+'</i>':'')+'</span><span class="side r">'+(o?'<i>'+PORT_LBL[o]+'</i>'+portBtn(n,o,'out',fxIsMod(n)?'ctl':(o==='out'?'mix':o)):'')+'</span></div>';
  }
  const hd='<div class="fxh" data-drag="1"><b>'+esc(n.name)+'</b>'
    +(d.kind==='io'?'':'<button type="button" class="fxb" data-fa="byp" data-id="'+n.id+'" title="Bypass" aria-label="Bypass '+esc(n.name)+'" aria-pressed="'+n.bypass+'">⏻</button><button type="button" class="fxb" data-fa="del" data-id="'+n.id+'" title="Remove" aria-label="Remove '+esc(n.name)+'">✕</button>')+'</div>';
  const ps=d.params.map(q=>parRowHTML(g,n,q,false)).join('')
    +(n.type==='macro'?'<div class="fxp"><span class="pl">Tag</span><select class="mtag" data-n="'+n.id+'" aria-label="Macro tag">'+tagOpts().map(o=>'<option value="'+o[0]+'"'+(o[0]===(n.tag.value||'')?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select></div>':'');
  const isPed=d.pedal||n.skin==='pedal',ped=isPed?'<div class="stomp"><span class="pled'+(n.bypass?'':' on')+'" aria-hidden="true"></span><button type="button" class="foot" data-fa="byp" data-id="'+n.id+'" aria-pressed="'+!n.bypass+'" aria-label="Footswitch '+esc(n.name)+'"></button></div>':'';
  const pst=isPed?';--ped:'+(d.pedal||'#555'):'';
  return '<div class="'+cls.join(' ')+'" data-id="'+n.id+'" style="left:'+n.x+'px;top:'+n.y+'px'+pst+'">'+hd+'<div class="fxio">'+io+'</div>'+(ps?'<div class="fxps">'+ps+'</div>':'')+ped+'</div>';
}
function portPos(pan,id,p,dir){
  const el=$('.port[data-n="'+id+'"][data-p="'+p+'"][data-dir="'+dir+'"]',$('#fxNodes')); if(!el) return null;
  const r=el.getBoundingClientRect();
  return{x:r.left+r.width/2-pan.left,y:r.top+r.height/2-pan.top};
}
const curvePath=(a,b)=>{const dx=Math.max(40,Math.abs(b.x-a.x)*.5);return 'M'+a.x.toFixed(1)+' '+a.y.toFixed(1)+' C'+(a.x+dx).toFixed(1)+' '+a.y.toFixed(1)+' '+(b.x-dx).toFixed(1)+' '+b.y.toFixed(1)+' '+b.x.toFixed(1)+' '+b.y.toFixed(1);};
function fxCables(){
  const g=curG(),an=S.fx.an||(S.fx.an=fxAnalyze(g)),pan=$('#fxPan').getBoundingClientRect(),back=new Set();
  an.cycles.forEach(c=>{for(let i=0;i<c.ids.length;i++){const a=c.ids[i],b=c.ids[(i+1)%c.ids.length];g.cables.forEach(k=>{if(k.from.n===a&&k.to.n===b)back.add(k.id);});}});
  let h='';
  g.cables.forEach(c=>{
    const a=portPos(pan,c.from.n,c.from.p,'out'),b=portPos(pan,c.to.n,c.to.p,'in'); if(!a||!b) return;
    const kind=cableKind(g,c)==='ctl'?'ctl':(c.from.p==='out'?'mix':c.from.p),d=curvePath(a,b);
    const pd=an.pdc.find(p=>p.cable===c.id);
    h+='<g class="cab k-'+kind+(S.fx.cable===c.id?' sel':'')+(back.has(c.id)?' fb':'')+(S.fx.flow?' flow':'')+'" data-cid="'+c.id+'"><path class="hit" d="'+d+'"/><path class="ln" d="'+d+'"/>'
      +(pd?'<text x="'+((a.x+b.x)/2).toFixed(0)+'" y="'+(((a.y+b.y)/2)-6).toFixed(0)+'" class="pdc">+'+pd.ms+' ms</text>':'')+'</g>';
  });
  $('#fxCables').innerHTML=h;
}
function fxReport(){
  const an=S.fx.an,g=curG(); if(!an) return;
  const pct=Math.min(100,Math.round(an.cost*5));
  const tl=an.tail>=1000?(an.tail/1000).toFixed(1)+' s':Math.round(an.tail)+' ms';
  const w=an.warn.length?an.warn.map(x=>'<li class="'+x.lvl+'">'+esc(x.t)+'</li>').join(''):'<li class="good">Looks good. No loops, nothing unreachable.</li>';
  $('#fxRep').innerHTML='<div class="rep"><div class="meter" role="img" aria-label="Estimated cost '+pct+' percent"><i style="width:'+pct+'%"></i></div>'
    +'<div class="stats"><div><small>Cost</small><b>~'+an.cost.toFixed(1)+' units</b></div><div><small>Latency</small><b>'+an.lat+' ms</b></div><div><small>Tail</small><b>'+tl+'</b></div><div><small>Nodes</small><b>'+g.nodes.length+'</b></div></div>'
    +'<ul class="warns">'+w+'</ul><p class="hint">Cost, latency and tails are estimates. The audio you hear is real.</p></div>';
}
function fxInspHTML(){
  const g=curG(),n=S.fx.sel&&nodeById(g,S.fx.sel),c=S.fx.cable&&g.cables.find(x=>x.id===S.fx.cable);
  if(c){
    const a=nodeById(g,c.from.n),b=nodeById(g,c.to.n),ctl=cableKind(g,c)==='ctl';
    return sec('Cable','<p class="hint" style="margin-top:0">'+esc(a.name)+' · '+(PORT_LBL[c.from.p]||c.from.p)+' → '+esc(b.name)+' · '+(ctl?c.to.p.slice(2):PORT_LBL[c.to.p])+'</p>'
      +(ctl?'<label class="f"><span>Amount</span><input type="range" data-fa="amt" min="0" max="100" value="'+c.amt+'"><output>'+c.amt+'%</output></label>':'')
      +'<div class="chips"><button type="button" class="btn" data-fa="insert">Insert effect here…</button><button type="button" class="btn danger" data-fa="delcab">Delete cable</button></div>');
  }
  if(!n) return '<p class="empty">Select a node or cable.<br>Double-click empty space to search and add.</p>';
  const d=FXT[n.type];
  let h='<div class="phead"><input type="text" class="pname" data-fn="name" value="'+esc(n.name)+'" aria-label="Node name"><span class="badge">'+d.label+'</span></div><p class="hint">'+d.hint+'</p>';
  if(d.sample){const cur=(n.s&&n.s.ir)||'';h+=sec('Impulse file','<label class="f"><span>Sample</span><select data-fn="ir" aria-label="Impulse sample"><option value="">— none —</option>'+S.samples.map(s=>'<option value="'+s.id+'"'+(s.id===cur?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label><p class="hint">Import the impulse (a recording of a room or a cabinet) in the Samples tab. It does not need to be mapped; it is packed into the library because this node uses it.</p>');}
  if(d.kind==='fx'&&!d.pedal)h+='<label class="f chk"><input type="checkbox" data-fn="skin"'+(n.skin==='pedal'?' checked':'')+'><span>Show as a pedal</span></label>';
  if(d.params.length){
    h+=sec('Link parameters to tags',d.params.map(q=>'<label class="f"><span>'+q.label+'</span><select data-fn="tag" data-k="'+q.k+'" aria-label="Tag for '+q.label+'"><option value="">— set by hand —</option>'+S.tags.filter(t=>t.kind!==undefined).map(t=>'<option value="'+t.id+'"'+(n.tag[q.k]===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>').join('')
      +'<p class="hint">A linked parameter follows the tag, so a knob in the designer can drive it. Tempo-sync tags set the delay time in ms.</p>');
  }
  if(d.kind!=='io') h+='<div class="chips"><button type="button" class="btn" data-fa="byp" data-id="'+n.id+'">'+(n.bypass?'Enable':'Bypass')+'</button><button type="button" class="btn danger" data-fa="del" data-id="'+n.id+'">Remove</button></div>';
  return h;
}
function fxScopeHTML(){
  const scopes=['master'].concat(S.groups);
  return '<p class="hint" style="margin-top:0">Each sample group can have its own chain, plus the master chain after everything.</p>'
    +scopes.map(s=>'<button type="button" class="scope'+(S.fx.scope===s?' on':'')+'" data-fa="scope" data-s="'+esc(s)+'">'+(s==='master'?'Master':esc(s))+(S.fx.graphs[s]?'<small>'+(S.fx.graphs[s].nodes.length-2)+' fx</small>':'')+'</button>').join('');
}
function fxPaletteHTML(){
  return FX_CATS.map(c=>'<div class="pcat">'+c+'</div><div class="chips">'+Object.keys(FXT).filter(k=>FXT[k].cat===c).map(k=>'<button type="button" class="btn" data-fa="add" data-t="'+k+'">+ '+FXT[k].label+'</button>').join('')+'</div>').join('');
}
function fxStackHTML(){
  const g=curG(),order=chainOrder(g),straight=isStraight(g);
  let h='<div class="stk">'+(straight?'':'<p class="note">This graph branches or has control cables, so the stack shows signal order only. Moving things here rebuilds a straight chain; control cables stay.</p>')
    +'<div class="stkend">Input</div>';
  order.forEach((n,i)=>{
    h+='<div class="stkc'+(n.bypass?' bypass':'')+'" data-id="'+n.id+'"><div class="stkh"><b>'+esc(n.name)+'</b><span class="grow"></span>'
      +'<button type="button" class="fxb" data-fa="sup" data-id="'+n.id+'"'+(i?'':' disabled')+' aria-label="Move up">▲</button><button type="button" class="fxb" data-fa="sdn" data-id="'+n.id+'"'+(i<order.length-1?'':' disabled')+' aria-label="Move down">▼</button>'
      +'<button type="button" class="fxb" data-fa="byp" data-id="'+n.id+'" aria-label="Bypass">⏻</button><button type="button" class="fxb" data-fa="del" data-id="'+n.id+'" aria-label="Remove">✕</button></div>'
      +'<div class="fxps">'+FXT[n.type].params.map(q=>parRowHTML(g,n,q,true)).join('')+'</div></div>';
  });
  h+='<div class="stkend">Output</div><div class="chips"><select id="stkAdd" aria-label="Effect to add">'+Object.keys(FXT).filter(k=>FXT[k].kind==='fx').map(k=>'<option value="'+k+'">'+FXT[k].label+'</option>').join('')+'</select><button type="button" class="btn" data-fa="sadd">Add to end</button>'+(straight?'':'<button type="button" class="btn" data-fa="sflat">Flatten to a chain</button>')+'</div></div>';
  return h;
}
function fxRender(){
  if(!$('#fxNodes')) return;
  const g=curG(); S.fx.an=fxAnalyze(g);
  const nodesView=S.fx.view==='nodes';
  $('#fxStage').hidden=!nodesView; $('#fxStack').hidden=nodesView;
  $('#fxVNodes').setAttribute('aria-pressed',String(nodesView)); $('#fxVStack').setAttribute('aria-pressed',String(!nodesView));
  $('#fxFlow').setAttribute('aria-pressed',String(S.fx.flow)); $('#fxScopeName').textContent=S.fx.scope==='master'?'Master chain':S.fx.scope;
  $('#fxScope').innerHTML=fxScopeHTML(); $('#fxPal').innerHTML=fxPaletteHTML();
  if(nodesView){
    $('#fxPan').style.transform='translate('+S.fx.pan.x+'px,'+S.fx.pan.y+'px)';
    $('#fxNodes').innerHTML=g.nodes.map(n=>nodeHTML(g,n,S.fx.an)).join('');
    fxCables();
  }else $('#fxStack').innerHTML=fxStackHTML();
  fxReport(); fxInspRender();
  fxTickStart();
}
function fxInspRender(){$('#fxInsp').innerHTML=fxInspHTML();}
/* live values only: no DOM rebuild */
function fxRefreshParams(){
  if(S.view!=='fx'||!$('#fxNodes')) return;
  const g=curG(),t=fxClock();
  $$('.fxp[data-k]',$('#centerF')).forEach(row=>{
    const host=row.closest('[data-id]'); if(!host) return;
    const n=nodeById(g,host.dataset.id); if(!n) return;
    const q=FXT[n.type].params.find(x=>x.k===row.dataset.k); if(!q) return;
    const r=parReal(g,n,q,t),tg=n.tag[q.k]&&tagById(n.tag[q.k]);
    const rng=$('.pr',row); if(rng&&document.activeElement!==rng) rng.value=Math.round((tg?tg.value:clamp((r.v-q.min)/(q.max-q.min),0,1))*1000);
    $('.pv',row).textContent=fmtPar(q,r.v); row.classList.toggle('modd',!!r.mod);
  });
  S.fx.an=fxAnalyze(g); fxReport();
}
let tickOn=false;
function fxTickStart(){
  if(tickOn||S.view!=='fx') return;
  tickOn=true; let last=0;
  const f=ts=>{
    if(S.view!=='fx'){tickOn=false;return;}
    if(S.fx.flow&&ts-last>60){last=ts;fxRefreshParams();}
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
