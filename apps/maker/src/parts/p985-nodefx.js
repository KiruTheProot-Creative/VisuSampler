/* ---------- NodeFX: the Effects editor as an effect plugin ----------
   nodefx.html is this page with window.__NODEFX set. Only the Effects view shows (one chain, from the plugin's
   input to its output); 8 macro knobs (tags m1..m8) sit at the bottom, a preset bar at the top. The page never
   plays audio itself: the chain goes to the plugin (setRack), parameter moves go straight to it (setParam).
   Native functions (NodeFXEditor.cpp): getRack, setRack(json, rebuild), setParam, setMacro, setGlobal,
   listPresets, loadPreset, savePreset, deletePreset, openPresetFolder, openCommunity. Events: macros, globals. */
const NODEFX=!!window.__NODEFX;
const NFX={macros:8,last:'',lastLayout:'',name:'Init',bank:'',mix:1,out:0,presets:[],cur:null,busy:false};
const nfxB=()=>window.__JUCE__&&window.__JUCE__.backend;
let nfxNext=1;const nfxPending=new Map();
function nfxCall(name,...params){
  const B=nfxB();if(!B)return Promise.resolve(window.__nfxMock?window.__nfxMock(name,params):null);
  if(!nfxCall.l){nfxCall.l=1;B.addEventListener('__juce__complete',({promiseId,result})=>{const p=nfxPending.get(promiseId);if(p){nfxPending.delete(promiseId);p(result);}});}
  const id=nfxNext++;return new Promise(res=>{nfxPending.set(id,res);B.emitEvent('__juce__invoke',{name,params,resultId:id});});
}
function nfxOn(ev,fn){const B=nfxB();if(B)B.addEventListener(ev,fn);else(window.__nfxEvents=window.__nfxEvents||{})[ev]=fn;}
/* the chain the plugin plays: graph, the ranges every module's parameters span, macro tags */
function nfxRanges(){const r={};Object.keys(FXT).forEach(k=>{r[k]={};FXT[k].params.forEach(q=>{r[k][q.k]=[q.min,q.max,q.opts?1:0,q.sync?1:0,q.log?1:0,q.unit==='Hz'?1:0];});});return r;}
function nfxMacroTags(){return S.tags.filter(t=>/^m\d+$/.test(t.id));}
function nfxState(){
  return{v:1,name:NFX.name,bank:NFX.bank,graph:graphOf('master'),fxRanges:nfxRanges(),
    tags:nfxMacroTags().map(t=>({id:t.id,name:t.name,kind:'number',def:t.def,value:t.value})),mix:NFX.mix,out:NFX.out};
}
function nfxSig(){return JSON.stringify(graphOf('master'),function(k,v){return ENGINE_SIG_SKIP[k]&&this&&this.type&&this.id?undefined:v;})+'|'+JSON.stringify(nfxMacroTags().map(t=>[t.id,t.name]));}
/* every few frames: a changed chain is rebuilt in the plugin; moved boxes are only stored (they sound the same) */
function nfxSync(force){
  if(NFX.busy)return;const sig=nfxSig(),lay=JSON.stringify(graphOf('master'));
  if(!force&&sig===NFX.last&&lay===NFX.lastLayout)return;
  const rebuild=force||sig!==NFX.last;NFX.last=sig;NFX.lastLayout=lay;
  nfxCall('setRack',JSON.stringify(nfxState()),rebuild);
  nfxPresetLabel();
}
/* the macro knobs (tags m1..m8) */
function nfxMakeTags(names,values){
  S.tags=S.tags.filter(t=>!/^m\d+$/.test(t.id));
  for(let i=0;i<NFX.macros;i++){
    const t=mkTag((names&&names[i])||('Macro '+(i+1)),'number',{min:0,max:100,unit:'%',dec:0,value:values&&values[i]!=null?values[i]:0,def:0});
    t.id='m'+(i+1);S.tags.push(t);
  }
}
function nfxMacrosHTML(){
  return nfxMacroTags().map((t,i)=>'<div class="nfxm" data-i="'+i+'"><div class="nfxk" role="slider" tabindex="0" aria-label="'+esc(t.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(t.value*100)+'" data-i="'+i+'" style="--v:'+t.value+'"><i></i></div>'
    +'<button type="button" class="nfxn" data-i="'+i+'" title="Double-click to rename">'+esc(t.name)+'</button><span class="nfxv">'+Math.round(t.value*100)+'%</span></div>').join('');
}
function nfxShowMacro(i){
  const t=nfxMacroTags()[i],el=$('.nfxk[data-i="'+i+'"]');if(!t||!el)return;
  el.style.setProperty('--v',t.value);el.setAttribute('aria-valuenow',Math.round(t.value*100));
  const v=el.parentNode.querySelector('.nfxv');if(v)v.textContent=Math.round(t.value*100)+'%';
}
function nfxSetMacro(i,v,fromHost){
  const t=nfxMacroTags()[i];if(!t)return;v=clamp(v,0,1);if(Math.abs(v-t.value)<1e-6&&!fromHost)return;
  setTag(t,v);nfxShowMacro(i);if(!fromHost)nfxCall('setMacro',i,v);
}
function nfxKnob(host,get,set,reset){   /* drag up/down, arrows, double-click resets */
  host.addEventListener('pointerdown',e=>{
    const k=e.target.closest('[role="slider"]');if(!k)return;e.preventDefault();k.focus();
    const y0=e.clientY,v0=get(k),fine=e.shiftKey?.25:1;try{k.setPointerCapture(e.pointerId);}catch(_){}
    const mv=ev=>set(k,v0+(y0-ev.clientY)/180*fine);
    const up=()=>{k.removeEventListener('pointermove',mv);k.removeEventListener('pointerup',up);};
    k.addEventListener('pointermove',mv);k.addEventListener('pointerup',up);
  });
  host.addEventListener('dblclick',e=>{const k=e.target.closest('[role="slider"]');if(k)reset(k);});
  host.addEventListener('keydown',e=>{const k=e.target.closest('[role="slider"]');if(!k)return;const s=e.shiftKey?.01:.05;
    let d=null;if(e.key==='ArrowUp'||e.key==='ArrowRight')d=s;else if(e.key==='ArrowDown'||e.key==='ArrowLeft')d=-s;
    else if(e.key==='Home'){e.preventDefault();reset(k);return;}if(d==null)return;e.preventDefault();set(k,get(k)+d);});
}
/* Mix and Output (not saved in presets: they stay as you set them) */
const NFX_G={mix:{label:'Mix',fmt:v=>Math.round(v*100)+'%',norm:v=>v,real:n=>n,def:1},out:{label:'Output',fmt:v=>(v>0?'+':'')+v.toFixed(1)+' dB',norm:v=>(v+24)/36,real:n=>n*36-24,def:0}};
function nfxGlobalsHTML(){return Object.keys(NFX_G).map(k=>'<div class="nfxm g"><div class="nfxk" role="slider" tabindex="0" aria-label="'+NFX_G[k].label+'" data-g="'+k+'" style="--v:'+NFX_G[k].norm(NFX[k])+'"><i></i></div><span class="nfxn static">'+NFX_G[k].label+'</span><span class="nfxv" data-gv="'+k+'">'+NFX_G[k].fmt(NFX[k])+'</span></div>').join('');}
function nfxShowGlobal(k){const el=$('.nfxk[data-g="'+k+'"]');if(el)el.style.setProperty('--v',NFX_G[k].norm(NFX[k]));const v=$('[data-gv="'+k+'"]');if(v)v.textContent=NFX_G[k].fmt(NFX[k]);}
function nfxSetGlobal(k,real,fromHost){NFX[k]=k==='mix'?clamp(real,0,1):clamp(real,-24,12);nfxShowGlobal(k);if(!fromHost)nfxCall('setGlobal',k,NFX[k]);}
/* presets */
function nfxPresetLabel(){const b=$('#nfxPName');if(b)b.textContent=(NFX.bank?NFX.bank+' / ':'')+NFX.name;}
async function nfxRefreshPresets(){NFX.presets=(await nfxCall('listPresets'))||[];return NFX.presets;}
function nfxApply(st){
  if(!st||!st.graph)return false;
  NFX.busy=true;
  try{
    const g=JSON.parse(JSON.stringify(st.graph));
    /* parameters a preset does not have (saved before a module had them) start at their defaults */
    (g.nodes||[]).forEach(n=>{const d=FXT[n.type];n.p=n.p||{};n.tag=n.tag||{};if(d)d.params.forEach(q=>{if(n.p[q.k]==null)n.p[q.k]=q.def;});});
    S.fx.graphs={master:g};S.fx.scope='master';
    const tg=st.tags||[];nfxMakeTags(tg.map(t=>t.name),tg.map(t=>t.value!=null?t.value:t.def));
    NFX.name=st.name||'Untitled';NFX.bank=st.bank||'';
    if(st.mix!=null&&st.globals!==false)NFX.mix=st.mix;
    $('#nfxMacros').innerHTML=nfxMacrosHTML();nfxShowGlobal('mix');
    S.fx.sel=null;fxRender();if(typeof histClear==='function')histClear();
  }finally{NFX.busy=false;}
  nfxSync(true);return true;
}
async function nfxLoadPreset(p){
  const st=await nfxCall('loadPreset',p.id);
  if(!st){flash('Could not load "'+p.name+'"');return;}
  const s=typeof st==='string'?JSON.parse(st):st;s.name=p.name;s.bank=p.bank;s.globals=false;
  NFX.cur=p.id;nfxApply(s);nfxMenuClose();flash('Preset: '+p.name);
}
async function nfxStep(d){
  const ps=await nfxRefreshPresets();if(!ps.length)return;
  let i=ps.findIndex(p=>p.id===NFX.cur);i=i<0?(d>0?0:ps.length-1):(i+d+ps.length)%ps.length;nfxLoadPreset(ps[i]);
}
function nfxMenuHTML(){
  const banks=[];NFX.presets.forEach(p=>{const k=(p.factory?'Factory · ':'')+(p.bank||'');let b=banks.find(x=>x.k===k);if(!b){b={k,items:[]};banks.push(b);}b.items.push(p);});
  return'<div class="nfxlist">'+(banks.length?banks.map(b=>'<div class="insbank">'+esc(b.k||'My presets')+'</div>'+b.items.map(p=>'<div class="nfxrow"><button type="button" class="mi" data-p="'+esc(p.id)+'"'+(p.id===NFX.cur?' aria-current="true"':'')+'>'+esc(p.name)+'</button>'
      +(p.factory?'':'<button type="button" class="x" data-del="'+esc(p.id)+'" aria-label="Delete preset '+esc(p.name)+'" title="Delete">✕</button>')+'</div>').join('')).join(''):'<p class="hint">No presets yet.</p>')+'</div>'
    +'<div class="msep">Save the current chain</div><div class="insform"><label>Name<input type="text" id="nfxSaveName" value="'+esc(NFX.name)+'" maxlength="80"></label>'
    +'<label>Bank<input type="text" id="nfxSaveBank" value="'+esc(NFX.cur&&NFX.presets.find(p=>p.id===NFX.cur&&p.factory)?'':NFX.bank)+'" placeholder="e.g. Guitar" maxlength="60"></label>'
    +'<div class="insacts"><button type="button" class="btn primary" data-nfx="save">Save preset</button><button type="button" class="btn ghost" data-nfx="folder">Open folder</button><button type="button" class="btn ghost" data-nfx="init">New empty chain</button></div></div>';
}
function nfxMenuClose(){const m=$('#nfxMenu');if(m){m.hidden=true;$('#nfxPName').setAttribute('aria-expanded','false');}}
async function nfxMenuOpen(){await nfxRefreshPresets();const m=$('#nfxMenu');m.innerHTML=nfxMenuHTML();m.hidden=false;$('#nfxPName').setAttribute('aria-expanded','true');const c=m.querySelector('[aria-current]')||m.querySelector('[data-p]');if(c)c.focus();}
async function nfxSave(){
  const name=($('#nfxSaveName').value||'').trim(),bank=($('#nfxSaveBank').value||'').trim();
  if(!name){flash('Give the preset a name');return;}
  NFX.name=name;NFX.bank=bank;const st=nfxState();delete st.out;
  const r=await nfxCall('savePreset',name,bank,JSON.stringify(st));
  if(r&&r.error){flash('Could not save: '+r.error);return;}
  NFX.cur=r&&r.id||null;nfxPresetLabel();nfxSync(false);await nfxRefreshPresets();nfxMenuClose();flash('Saved preset "'+name+'"');
}
function nfxInitChain(){const a=fxNode('input',40,160),b=fxNode('output',620,160);nfxApply({name:'Init',bank:'',graph:{nodes:[a,b],cables:[mkCable(a,'out',b,'in')]},tags:[]});NFX.cur=null;nfxMenuClose();}
/* page set-up */
function nfxDom(){
  document.body.classList.add('nodefx');document.title='NodeFX';
  const top=$('.top');
  const logo=$('.logo',top);if(logo)logo.innerHTML='Node<em>FX</em>';
  const bar=document.createElement('div');bar.className='nfxbar';
  bar.innerHTML='<button type="button" class="btn pnav" id="nfxPrev" aria-label="Previous preset">◀</button>'
    +'<div class="nfxpw"><button type="button" class="btn" id="nfxPName" aria-haspopup="true" aria-expanded="false" aria-controls="nfxMenu" title="Presets: load, save, organise"></button><div class="menu insmenu" id="nfxMenu" hidden role="dialog" aria-label="Presets"></div></div>'
    +'<button type="button" class="btn pnav" id="nfxNext" aria-label="Next preset">▶</button>';
  logo.after(bar);
  const strip=document.createElement('section');strip.className='nfxstrip';strip.setAttribute('aria-label','Macro knobs');
  strip.innerHTML='<div class="nfxmacros" id="nfxMacros"></div><div class="nfxglobals" id="nfxGlobals">'+nfxGlobalsHTML()+'</div>';
  $('.app').append(strip);
  const sn=$('#fxScopeName');if(sn)sn.textContent='Chain';
  const lh=$('#fxLiveHint');if(lh)lh.textContent='Your DAW track plays through this chain: Input is the track, Output goes back to it. Link parameters to the macro knobs below to automate them.';
  $('#nfxPrev').onclick=()=>nfxStep(-1);$('#nfxNext').onclick=()=>nfxStep(1);
  $('#nfxPName').onclick=()=>{$('#nfxMenu').hidden?nfxMenuOpen():nfxMenuClose();};
  $('#nfxMenu').addEventListener('click',async e=>{
    const p=e.target.closest('[data-p]');if(p){const it=NFX.presets.find(x=>x.id===p.dataset.p);if(it)nfxLoadPreset(it);return;}
    const d=e.target.closest('[data-del]');if(d){const it=NFX.presets.find(x=>x.id===d.dataset.del);if(it&&confirm('Delete the preset "'+it.name+'"?')){await nfxCall('deletePreset',it.id);if(NFX.cur===it.id)NFX.cur=null;await nfxMenuOpen();}return;}
    const a=e.target.closest('[data-nfx]');if(!a)return;
    if(a.dataset.nfx==='save')nfxSave();else if(a.dataset.nfx==='folder')nfxCall('openPresetFolder');else if(a.dataset.nfx==='init')nfxInitChain();
  });
  $('#nfxMenu').addEventListener('keydown',e=>{if(e.key==='Escape'){nfxMenuClose();$('#nfxPName').focus();}else if(e.key==='Enter'&&e.target.tagName==='INPUT')nfxSave();});
  document.addEventListener('pointerdown',e=>{if(!$('#nfxMenu').hidden&&!e.target.closest('.nfxpw'))nfxMenuClose();});
  const mac=$('#nfxMacros');
  nfxKnob(mac,k=>nfxMacroTags()[+k.dataset.i].value,(k,v)=>nfxSetMacro(+k.dataset.i,v),k=>nfxSetMacro(+k.dataset.i,0));
  mac.addEventListener('dblclick',e=>{   /* rename a macro: its name shows in the DAW too */
    const b=e.target.closest('.nfxn[data-i]');if(!b)return;const i=+b.dataset.i,t=nfxMacroTags()[i];
    const inp=document.createElement('input');inp.type='text';inp.value=t.name;inp.maxLength=24;inp.className='nfxren';inp.setAttribute('aria-label','Name of macro '+(i+1));b.replaceWith(inp);inp.focus();inp.select();
    const done=ok=>{if(ok){const v=inp.value.trim();if(v)t.name=v;}$('#nfxMacros').innerHTML=nfxMacrosHTML();if(ok){nfxCall('setMacroName',i,t.name);fxRender();}};
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')done(true);else if(ev.key==='Escape')done(false);});inp.addEventListener('blur',()=>done(true));
  });
  const gl=$('#nfxGlobals');
  nfxKnob(gl,k=>NFX_G[k.dataset.g].norm(NFX[k.dataset.g]),(k,n)=>nfxSetGlobal(k.dataset.g,NFX_G[k.dataset.g].real(clamp(n,0,1))),k=>nfxSetGlobal(k.dataset.g,NFX_G[k.dataset.g].def));
}
async function nfxStart(){
  nfxDom();
  delete FXT.conv;   /* convolution needs an impulse-response sample, and NodeFX has none */
  delete FXT.adsr;delete FXT.midisrc;   /* they follow played notes, and an effect gets none */
  /* parameter moves go straight to the plugin; the chain itself is synced below */
  engineFxParam=function(n,q,fn){fn();const synced=typeof fxSynced==='function'&&fxSynced(n,q);nfxCall('setParam',n.id,q.k,synced?n.ps[q.k]:n.p[q.k],!!synced);NFX.last=nfxSig();};
  nfxOn('macros',d=>{if(d&&Array.isArray(d.v))d.v.forEach((v,i)=>{const t=nfxMacroTags()[i];if(t&&Math.abs(t.value-v)>1e-4)nfxSetMacro(i,v,true);});});
  nfxOn('globals',d=>{if(!d)return;if(d.mix!=null)nfxSetGlobal('mix',+d.mix,true);if(d.out!=null)nfxSetGlobal('out',+d.out,true);});
  nfxMakeTags();
  const st=await nfxCall('getRack');let s=st&&(typeof st==='string'?JSON.parse(st):st);
  if(s&&s.out!=null)NFX.out=s.out;
  if(!s||!s.graph){const ps=await nfxRefreshPresets();const first=ps.find(p=>p.factory);if(first){await nfxLoadPreset(first);s=null;}else nfxInitChain();}
  else{NFX.cur=s.preset||null;nfxApply(s);}
  nfxShowGlobal('out');setView('fx');fxRender();
  setInterval(()=>nfxSync(false),150);
}
