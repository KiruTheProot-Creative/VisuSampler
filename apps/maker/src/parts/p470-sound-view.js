/* ---------- Sound tab: samples, mapping, groups and lists in one calm view ----------
   It reuses the mapper (zone grid, zone inspector) and the sample editor (waveform, sample inspector):
   their parts are moved into this view, so all their existing behaviour keeps working. */
S.snd={focus:'zone',layout:'split',split:.56,lastSel:'',fold:{}};
function inMapView(){return S.view==='map'||S.view==='sound';}
function inSmpView(){return S.view==='samples'||(S.view==='sound'&&S.snd.layout!=='map');}
/* ---- move the existing pieces into the Sound view ---- */
(function(){
  const top=$('#snTop'),bot=$('#snBot');
  top.insertBefore($('#centerM .mapmain'),top.firstChild);
  bot.appendChild($('#centerS .mapmain'));
  $('#snAutoSlot').appendChild($('#mapAuto'));
  const tm=$('#snToolsMenu');
  const row=(label,...els)=>{const d=document.createElement('div');d.className='mrow';if(label){const s=document.createElement('span');s.className='ml';s.textContent=label;d.appendChild(s);}els.forEach(e=>d.appendChild(e));tm.appendChild(d);return d;};
  ['mapSpread','mapStack','mapFill'].forEach(id=>{const b=$('#'+id);b.className='mi';tm.appendChild(b);});
  const xf=$('#mapXfade');xf.className='mi';row('',xf,$('#mapXf').parentElement);
  const sep=()=>{const d=document.createElement('div');d.className='msep';tm.appendChild(d);};
  sep();row('',$('#mapInterp').parentElement);row('',$('#mapVel').parentElement);row('',$('#mapZoom').parentElement);
  sep();const pn=$('#mapPanic');pn.className='mi';tm.appendChild(pn);row('',$('#mapVoices'));
  $('#snTitle').after($('#mapMsg'));
  /* waveform bar */
  const ws=$('#snWaveSlot');[$('#smRaw'),$('#smProc'),$('#smStop')].forEach(b=>{b.classList.add('ghost');ws.appendChild(b);});
  $('#smRaw').textContent='▶ Play';$('#smProc').textContent='▶ As mapped';
  ws.appendChild($('#smMsg'));
  const em=$('#snEditMenu');
  const seg=$('#smToolSel').parentElement;const r1=document.createElement('div');r1.className='mrow';r1.innerHTML='<span class="ml">Click does</span>';r1.appendChild(seg);em.appendChild(r1);
  [$('#smFit'),$('#smZoomSel')].forEach(b=>{b.className='mi';em.appendChild(b);});
  const inf=document.createElement('div');inf.className='mrow';inf.appendChild($('#smInfo'));em.appendChild(inf);
  /* inspectors: zone and sample panels move into the Sound inspector */
  const rn=$('#rightN');
  [$('#rightM'),$('#rightS')].forEach(a=>{a.className='snins';a.hidden=true;const h=a.querySelector('h2');if(h)h.remove();rn.appendChild(a);});
  rn.insertBefore($('#rightM'),$('#snInsList'));
})();
/* ---- menus ---- */
function snMenu(btn,menu){
  btn.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;$$('.snmenu').forEach(m=>{m.hidden=true;});menu.hidden=!open;btn.setAttribute('aria-expanded',String(open));});
}
snMenu($('#snTools'),$('#snToolsMenu'));snMenu($('#snEdit'),$('#snEditMenu'));
document.addEventListener('click',e=>{if(!e.target.closest('.snmenu')&&!e.target.closest('#snTools,#snEdit'))$$('.snmenu').forEach(m=>{m.hidden=true;});});
$('#snToolsMenu').addEventListener('click',e=>{if(e.target.closest('button.mi'))$('#snToolsMenu').hidden=true;});
/* ---- layout: map / split / wave, and the draggable divider ---- */
function snLayout(l){
  if(l)S.snd.layout=l;l=S.snd.layout;
  $$('[data-lay]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lay===l)));
  $('#snTop').hidden=l==='wave';$('#snBot').hidden=l==='map';$('#snSplit').hidden=l!=='split';
  $('#snTop').style.flex=l==='split'?S.snd.split+' 1 0':'1 1 0';$('#snBot').style.flex=l==='split'?(1-S.snd.split)+' 1 0':'1 1 0';
  requestAnimationFrame(()=>{if(l!=='wave'){mapSize();mapStart();}if(l!=='map'){smStart();}});
}
$$('[data-lay]').forEach(b=>b.addEventListener('click',()=>snLayout(b.dataset.lay)));
$('#snSplit').addEventListener('pointerdown',e=>{
  const body=$('#snBody').getBoundingClientRect();$('#snSplit').setPointerCapture(e.pointerId);
  const mv=ev=>{S.snd.split=clamp((ev.clientY-body.top)/body.height,.18,.85);snLayout();};
  const up=()=>{$('#snSplit').removeEventListener('pointermove',mv);$('#snSplit').removeEventListener('pointerup',up);};
  $('#snSplit').addEventListener('pointermove',mv);$('#snSplit').addEventListener('pointerup',up);
});
$('#snSplit').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){S.snd.split=clamp(S.snd.split+(e.key==='ArrowUp'?-.05:.05),.18,.85);snLayout();e.preventDefault();}});
$('#snTop').addEventListener('dblclick',e=>{if(e.target.closest('.mapfoot'))snLayout(S.snd.layout==='map'?'split':'map');});
/* ---- tips on demand ---- */
$('#tipsBtn').addEventListener('click',()=>{const on=!document.body.classList.contains('tips');document.body.classList.toggle('tips',on);$('#tipsBtn').setAttribute('aria-pressed',String(on));});
/* ---- left column: lists, groups, samples ---- */
mapLeftHTML=function(){
  const cur=S.map.group,cl=curList(),f=S.snd.focus;
  const fo=S.snd.fold,sh=(t,add)=>'<div class="snh"><button type="button" class="snfold" data-fold="'+t+'" aria-expanded="'+!fo[t]+'">'+t+'</button>'+(add||'')+'</div>',body=(t,html)=>fo[t]?'':html;
  let h=sh('Lists','<button type="button" class="snadd" data-ls="addList" title="New list" aria-label="New list">+</button>');
  h+=body('Lists',S.lists.length?'<div class="snlist">'+S.lists.map(l=>'<button type="button" class="snrow'+(l===cl?' cur':'')+(f==='list'&&l===cl?' on':'')+'" data-sn="list" data-id="'+l.id+'"><span class="nm">'+esc(l.name)+'</span><small>'+((S.banks[l.bank]||{}).letter||'?')+(listsInBank(l.bank).indexOf(l)+1)+'</small></button>').join('')+'</div>'
    :'<p class="snnone">No lists. Everything plays.</p>');
  h+=sh('Groups','<button type="button" class="snadd" data-ma="addgrp" title="New group" aria-label="New group">+</button>');
  h+=body('Groups','<div class="snlist">'+S.groups.map(g=>{
    const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
    return '<div class="snrow grow'+(g===cur?' cur':'')+(f==='group'&&g===cur?' on':'')+(c.mute?' muted':'')+'" data-ma="grp" data-g="'+esc(g)+'" role="button" tabindex="0"><i class="sw" style="background:'+c.color+'"></i><span class="nm">'+esc(g)+'</span>'
      +'<button type="button" class="ms'+(c.mute?' on':'')+'" data-ma="gmute" data-g="'+esc(g)+'" title="Mute" aria-label="Mute '+esc(g)+'" aria-pressed="'+c.mute+'">M</button>'
      +'<button type="button" class="ms'+(c.solo?' on':'')+'" data-ma="gsolo" data-g="'+esc(g)+'" title="Solo" aria-label="Solo '+esc(g)+'" aria-pressed="'+c.solo+'">S</button><small>'+n+'</small></div>';
  }).join('')+'</div>');
  h+=sh('Samples','<button type="button" class="snadd" data-ma="imp" title="Import audio" aria-label="Import audio">+</button>');
  h+=body('Samples',S.samples.length?'<div class="snlist">'+S.samples.map(s=>{
      const used=S.zones.some(z=>z.sample===s.id);
      return '<div class="snrow prow'+(s.id===S.smp.sel?' cur':'')+(f==='sample'&&s.id===S.smp.sel?' on':'')+(used?'':' unused')+'" draggable="true" data-ma="smp" data-s="'+s.id+'" role="button" tabindex="0" title="Drag onto the map to make a zone"><span class="nm">'+esc(s.name)+'</span><small>'+noteName(s.root)+'</small></div>';
    }).join('')+'</div>'
    :'<p class="snnone">No samples yet.</p>');
  return h;
};
$('#leftM').addEventListener('click',e=>{
  if(S.view!=='sound') return;
  const fb=e.target.closest('[data-fold]');if(fb){const k=fb.dataset.fold;S.snd.fold[k]=!S.snd.fold[k];mapLeftRender();snShow();return;}
  const li=e.target.closest('[data-sn="list"]');
  if(li){const l=S.lists.find(x=>x.id===li.dataset.id);if(!l)return;const bt=bankTag(),lt=listTag();if(bt&&lt){setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}snFocus('list');return;}
  const b=e.target.closest('[data-ma]');if(!b||e.target.closest('.ms'))return;
  if(b.dataset.ma==='grp')snFocus('group');
  else if(b.dataset.ma==='smp'){S.smp.sel=b.dataset.s;S.smp.a=S.smp.b=null;smFit();smPanelRender();snFocus('sample');}
});
$('#leftM').addEventListener('keydown',e=>{if(S.view==='sound'&&(e.key==='Enter'||e.key===' ')&&e.target.closest('.snrow[role=button]')){e.preventDefault();e.target.click();}});
document.addEventListener('click',e=>{if(S.view==='sound'&&e.target.closest('[data-ls]'))setTimeout(()=>{if(e.target.closest('[data-ls="addList"]'))S.snd.focus='list';soundRefresh();},0);});
/* ---- focus decides what the inspector shows ---- */
function snFocus(f){S.snd.focus=f;S.snd.lastSel=selZones().map(z=>z.id).join(',');soundRefresh();}
const mapRightRender0=mapRightRender;
mapRightRender=function(){
  mapRightRender0();
  if(S.view!=='sound') return;
  const zs=selZones(),sig=zs.map(z=>z.id).join(','),changed=sig!==S.snd.lastSel;S.snd.lastSel=sig;
  if(zs.length&&(changed||S.snd.focus==='zone')){S.snd.focus='zone';if(zs[0].sample!==S.smp.sel&&sampleById(zs[0].sample)){S.smp.sel=zs[0].sample;S.smp.a=S.smp.b=null;smFit();smPanelRender();}}
  else if(!zs.length&&S.snd.focus==='zone'&&changed) S.snd.focus=S.map.group?'group':'zone';
  snShow();
};
function snShow(keepIns){
  const f=S.snd.focus;
  $('#rightM').hidden=f!=='zone';$('#rightS').hidden=f!=='sample';$('#snInsGroup').hidden=f!=='group';$('#snInsList').hidden=f!=='list';
  if(!keepIns){if(f==='group')$('#snInsGroup').innerHTML=snGroupHTML();
  if(f==='list')$('#snInsList').innerHTML=snListHTML();}
  const g=S.map.group,n=S.zones.filter(z=>z.group===g).length;
  $('#snTitle').textContent=g||'No group';$('#snSub').textContent=g?n+' zone'+(n===1?'':'s'):'';
  const s=smSample();$('#snWaveTitle').textContent=s?s.name:'No sample';$('#snWaveSub').textContent=s?s.dur.toFixed(2)+' s · '+noteName(s.root)+(smOf(s).mode!=='sampler'?' · '+smOf(s).mode:''):'';
  $('#snEmpty').hidden=S.samples.length>0||S.zones.length>0;
  $$('#leftM .snrow.on').forEach(r=>r.classList.remove('on'));
}
function soundRefresh(keepIns){mapLeftRender();if(keepIns){snShow(true);}else{if(S.view==='sound'){$('#rightM').hidden=true;}mapRightRender();if(S.snd.focus!=='zone')snShow();}mapInvalidate();smInvalidate();
  /* highlight the focused row */
  const f=S.snd.focus,sel=f==='list'?'[data-sn="list"].cur':f==='group'?'.grow.cur':f==='sample'?'.prow.cur':null;if(sel){const r=$('#leftM '+sel);if(r)r.classList.add('on');}}
function soundEnter(reset){
  if(reset){S.snd.focus='zone';S.snd.lastSel='';}
  if(!S.map.group&&S.groups.length)S.map.group=S.groups[0];
  if(!smSample()&&S.samples[0])S.smp.sel=S.samples[0].id;
  smPanelRender();soundRefresh();snLayout();
  requestAnimationFrame(()=>{mapSize();mapStart();smSize();smFit();smStart();});
}
/* ---- calmer zone inspector: the essentials, the rest under More ---- */
mapRightHTML=function(){
  const zs=selZones();
  if(!zs.length) return '<p class="empty">Click a zone on the map to edit it.<br>Drag a sample from the left onto the map to make one.</p>';
  const z=zs[0],multi=zs.length>1,sm=sampleById(z.sample),sr=sm?sm.sr:44100,msv=f=>f/sr*1000;
  let h='<div class="snhead"><b>'+(multi?zs.length+' zones':esc(sm?sm.name:'Zone'))+'</b><small>'+esc(z.group)+'</small></div>';
  h+=zfield('Root key','root',z.root,{min:0,max:127,sfx:noteName(z.root)})
    +zfield('Lowest key','lo',z.lo,{min:0,max:127,sfx:noteName(z.lo)})+zfield('Highest key','hi',z.hi,{min:0,max:127,sfx:noteName(z.hi)})
    +zfield('Softest','vlo',z.vlo,{min:0,max:127,sfx:'vel'})+zfield('Hardest','vhi',z.vhi,{min:0,max:127,sfx:'vel'})
    +zfield('Volume','vol',z.vol,{min:-60,max:24,step:.5,sfx:'dB'})+zfield('Pan','pan',z.pan,{min:-100,max:100,sfx:'L–R'})
    +zchk('Loop','loop.on',z.loop.on);
  const more=(t,b)=>'<details class="snmore" data-sec="z:'+t+'"'+(closed.has('z:'+t)?'':' open')+'><summary>'+t+'</summary><div>'+b+'</div></details>';
  h+='<div class="snmores">';
  if(z.loop.on) h+=more('Loop',zfield('Loop start','loop.s',msv(z.loop.s),{min:0,step:1,sfx:'ms',ms:1})+zfield('Loop end','loop.e',msv(z.loop.e),{min:0,step:1,sfx:'ms',ms:1})
      +zfield('Crossfade','loop.xf',msv(z.loop.xf),{min:0,step:1,sfx:'ms',ms:1})+zsel('Fade curve','loop.xcurve',z.loop.xcurve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
      +zchk('Ping-pong','loop.pp',z.loop.pp)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="findloop">Find a loop</button></div>'));
  h+=more('Sound',zfield('Tune','tune',z.tune,{min:-2400,max:2400,step:1,sfx:'cents'})+zsel('Interpolation','interp',z.interp,GINT)+zchk('Follow the keyboard','keytrack',z.keytrack)
      +zfield('Attack','attack',z.attack,{min:0,max:10000,sfx:'ms'})+zfield('Release','release',z.release,{min:0,max:20000,sfx:'ms'})+zchk('One-shot (ignore key up)','oneshot',z.oneshot)
      +'<p class="hint">Interpolation is how the sample is pitched: nearest is gritty, linear soft, cubic clean, sinc cleanest.</p>');
  h+=more('Start and end',zfield('Start','start',z.start,{min:0,max:60000,step:1,sfx:'ms'})+zfield('End (0 = whole)','end',z.end,{min:0,max:600000,step:1,sfx:'ms'})
      +zfield('Soft notes start later','vstart',z.vstart,{min:0,max:5000,step:1,sfx:'ms'})+zchk('Reverse','rev',z.rev));
  h+=more('Crossfades',zfield('Key fade in','fadeLo',z.fadeLo,{min:0,max:127,sfx:'keys'})+zfield('Key fade out','fadeHi',z.fadeHi,{min:0,max:127,sfx:'keys'})
      +zfield('Velocity fade in','vfadeLo',z.vfadeLo,{min:0,max:127})+zfield('Velocity fade out','vfadeHi',z.vfadeHi,{min:0,max:127})
      +zsel('Fade curve','curve',z.curve,[['power','Equal power'],['linear','Linear'],['s','S-curve']]));
  h+=more('Variation',zfield('Round robin position','seq',z.seq,{min:1,max:999})+zfield('Random tune','hum.tune',z.hum.tune,{min:0,max:200,sfx:'cents'})
      +zfield('Random volume','hum.vol',z.hum.vol,{min:0,max:12,step:.5,sfx:'dB'})+zfield('Random start','hum.start',z.hum.start,{min:0,max:500,sfx:'ms'}));
  h+=more('Sample and group','<label class="f"><span>Sample</span><select data-zk="sample">'+mopt(S.samples.map(s=>[s.id,s.name]),z.sample)+'</select></label>'
      +'<label class="f"><span>Group</span><select data-zk="group">'+mopt(S.groups.map(g=>[g,g]),z.group)+'</select></label>'
      +zchk('Mute zone','mute',z.mute)+zchk('Solo zone','solo',z.solo)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="detect">Detect pitch</button></div>'));
  h+='</div><div class="snacts"><button type="button" class="btn" data-mz="dup">Duplicate</button><button type="button" class="btn danger" data-mz="del">Delete</button></div>';
  return h;
};
/* sample inspector: keep the first two sections open, fold the rest */
['Sample unison','Default loop','Edit (selection, or the whole sample)'].forEach(t=>closed.add(t));
document.addEventListener('toggle',e=>{const d=e.target;if(d.classList&&d.classList.contains('snmore')){if(d.open)closed.delete(d.dataset.sec);else closed.add(d.dataset.sec);}},true);
['z:Loop','z:Sound','z:Start and end','z:Crossfades','z:Variation','z:Sample and group'].forEach(t=>closed.add(t));
/* ---- group inspector ---- */
function snGroupHTML(){
  const g=S.map.group;if(!g)return '<p class="empty">Pick a group on the left.</p>';
  const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
  return '<div class="snhead"><b>Group</b><small>'+n+' zones</small></div>'
    +'<label class="f"><span>Name</span><input type="text" data-sg="name" value="'+esc(g)+'"></label>'
    +'<label class="f"><span>Plays</span><select data-sg="mode">'+mopt(MODES,c.mode)+'</select></label>'
    +nf('Volume','data-sg="vol"',c.vol,-48,24,.5,'dB')+nf('Pan','data-sg="pan"',c.pan,-100,100,1,'L–R')+nf('Tune','data-sg="tune"',c.tune,-2400,2400,1,'cents')
    +snLinksHTML(c)+snEnvHTML(c)
    +'<div class="snmores"><details class="snmore"><summary>More</summary><div>'
    +nf('Choke group','data-sg="choke"',c.choke,0,999,1)+'<p class="hint">Groups with the same choke number cut each other off, like open and closed hi-hats.</p>'
    +nf('Voice limit','data-sg="voices"',c.voices,0,9999,1)+'<p class="hint">0 means unlimited.</p>'
    +'<label class="f"><span>Velocity curve</span><input type="range" data-sg="velcurve" min="0.2" max="2.5" step="0.05" value="'+c.velcurve+'"></label>'
    +'<label class="f"><span>Interpolation</span><select data-sg="interp">'+mopt(GINT,c.interp)+'</select></label>'
    +'<label class="f"><span>Colour</span><input type="color" data-sg="color" value="'+c.color+'"></label>'
    +'</div></details></div><div class="snacts"><button type="button" class="btn" data-sga="selall">Select its zones</button><button type="button" class="btn danger" data-sga="del">Delete group</button></div>';
}
/* ---- per-note ADSR for the group (the engine runs one per note) ---- */
const ENV_DEF={on:false,a:5,d:300,s:100,r:300,tags:{}};
const envOf=c=>{const e=Object.assign({},ENV_DEF,c.env||{});e.tags=Object.assign({},e.tags||{});return e;};
function envSvg(e){
  const T=x=>Math.sqrt(Math.max(0,x)),a=T(e.a),d=T(e.d),r=T(e.r),hold=Math.max(12,(a+d+r)*.35),tot=a+d+hold+r||1,W=220,H=54,X=v=>4+v/tot*(W-8),Y=v=>H-4-v*(H-8),s=e.s/100;
  const pts=[[0,0],[a,1],[a+d,s],[a+d+hold,s],[tot,0]].map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' ');
  return '<svg class="envsvg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Envelope shape"><polyline points="'+pts+'"/></svg>';
}
/* ---- knobs on the group: volume, pan, tune and fine tune follow a tag live ---- */
const GLINKS=[['vol','Volume','dB',0,-60],['pan','Pan','L–R',-100,100],['tune','Semitones','st',-12,12],['fine','Fine tune','cents',-100,100]];
function snLinksHTML(c){
  const L=c.links||{},knobs=[['','no knob']].concat(S.tags.filter(t=>!t.sys&&t.kind==='number').map(t=>[t.id,t.name]));
  return '<details class="snlinks"'+(Object.keys(L).length?' open':'')+'><summary>Knobs on this group</summary>'+GLINKS.map(([k,l,u])=>{
    const x=L[k];
    return '<div class="envrow"><span class="lk">'+l+'</span><select data-gl="'+k+'" aria-label="Knob for '+l+'">'+mopt(knobs,x?x.tag:'')+'</select></div>'
      +(x?'<div class="glrange"><label>from <input type="number" data-glf="'+k+'" value="'+x.from+'" step="1"></label><label>to <input type="number" data-glt="'+k+'" value="'+x.to+'" step="1"></label><em class="sfx">'+u+'</em></div>':'');
  }).join('')+'<p class="hint">The knob moves the value from one end to the other, live while notes play, and replaces the fixed value above. Volume fades with equal power; −60 dB is silent. For a two-layer mix, give layer A 0 → −60 and layer B −60 → 0 on the same knob.</p></details>';
}
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,g=S.map.group,k=t.dataset.gl||t.dataset.glf||t.dataset.glt;if(!g||!k)return;
  const c=gcfg(g),L=Object.assign({},c.links||{}),d=GLINKS.find(x=>x[0]===k);
  if(t.dataset.gl){if(t.value)L[k]=Object.assign({from:d[3],to:d[4]},L[k]||{},{tag:t.value});else delete L[k];}
  else if(L[k]){const v=parseFloat(t.value);if(isFinite(v))L[k][t.dataset.glf?'from':'to']=v;}
  c.links=L;touchMap();$('#snInsGroup').innerHTML=snGroupHTML();
});
function snEnvHTML(c){
  const e=envOf(c),knobs=[['','no knob']].concat(S.tags.filter(t=>!t.sys&&t.kind==='number').map(t=>[t.id,t.name]));
  const row=(k,l,mx,u)=>'<div class="envrow"><label class="f"><span>'+l+'</span><input type="number" data-se="'+k+'" min="0" max="'+mx+'" step="1" value="'+e[k]+'"'+(e.tags[k]?' disabled':'')+'><em class="sfx">'+u+'</em></label>'
    +'<select data-setag="'+k+'" aria-label="Knob for '+l+'">'+mopt(knobs,e.tags[k]||'')+'</select></div>';
  return '<div class="snenv"><label class="f chk"><input type="checkbox" data-se="on"'+(e.on?' checked':'')+'><span>Envelope (ADSR, one per note)</span></label>'
    +(e.on?envSvg(e)+row('a','Attack',10000,'ms')+row('d','Decay',10000,'ms')+row('s','Sustain',100,'%')+row('r','Release',10000,'ms')
      +'<p class="hint">Replaces the zones\' own attack and release in this group. A knob linked here sets 0–10 s (or 0–100 % for sustain), and held notes follow it live.</p>':'')+'</div>';
}
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,g=S.map.group;if(!g||!(t.dataset.se||t.dataset.setag))return;
  const c=gcfg(g),en=envOf(c);
  if(t.dataset.se==='on')en.on=t.checked;
  else if(t.dataset.se){const v=parseFloat(t.value);en[t.dataset.se]=isFinite(v)?Math.max(0,Math.min(+t.max,v)):ENV_DEF[t.dataset.se];}
  else{if(t.value)en.tags[t.dataset.setag]=t.value;else delete en.tags[t.dataset.setag];}
  c.env=en;touchMap();$('#snInsGroup').innerHTML=snGroupHTML();
});
$('#snInsGroup').addEventListener('input',e=>{
  const t=e.target,k=t.dataset.sg,g=S.map.group;if(!k||!g||k==='name')return;   /* envelope fields use data-se */
  const c=gcfg(g);c[k]=t.type==='number'||t.type==='range'?parseFloat(t.value)||0:t.value;
  if(k==='color'){mapInvalidate();mapLeftRender();}else touchMap();
});
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.sg,old=S.map.group;if(k!=='name'||!old)return;
  const nn=t.value.trim();if(!nn||S.groups.indexOf(nn)>=0){t.value=old;flash('Group names must be unique');return;}
  S.groups[S.groups.indexOf(old)]=nn;S.gset[nn]=S.gset[old];delete S.gset[old];
  S.zones.forEach(z=>{if(z.group===old)z.group=nn;});S.lists.forEach(l=>{l.groups=(l.groups||[]).map(x=>x===old?nn:x);});
  S.map.group=nn;touchMap();soundRefresh(true);
});
$('#snInsGroup').addEventListener('click',e=>{
  const b=e.target.closest('[data-sga]');if(!b)return;const n=S.map.group;if(!n)return;
  if(b.dataset.sga==='selall'){S.map.sel=S.zones.filter(z=>z.group===n).map(z=>z.id);mapUI();mapInvalidate();return;}
  delZones(S.zones.filter(z=>z.group===n).map(z=>z.id));
  S.groups=S.groups.filter(x=>x!==n);S.lists.forEach(l=>{l.groups=(l.groups||[]).filter(x=>x!==n);});
  delete S.gset[n];S.map.group=S.groups[0]||null;touchMap();soundRefresh();
});
/* ---- list inspector ---- */
const KSL={learn:null};
function snListHTML(){
  const l=curList();if(!l)return '<p class="empty">No list selected.<br>Lists choose which groups play, like the patches of a rompler. Press + next to Lists to make one.</p>';
  return '<div class="snhead"><b>List</b><small>bank '+((S.banks[l.bank]||{}).letter||'?')+'</small></div>'
    +'<label class="f"><span>Name</span><input type="text" data-sl="name" value="'+esc(l.name)+'"></label>'
    +'<label class="f"><span>Bank</span><select data-sl="bank">'+S.banks.map((b,i)=>'<option value="'+i+'"'+(i===l.bank?' selected':'')+'>'+b.letter+(b.name?' · '+esc(b.name):'')+'</option>').join('')+'</select></label>'
    +'<div class="snsub">Groups it plays</div><div class="sngroups">'+(S.groups.length?S.groups.map(g=>'<label class="chk"><input type="checkbox" data-sl="grp" data-g="'+esc(g)+'"'+(l.groups.indexOf(g)>=0?' checked':'')+'><i class="sw" style="background:'+gcfg(g).color+'"></i>'+esc(g)+'</label>').join(''):'<span class="muted">No groups yet.</span>')+'</div>'
    +'<div class="snsub">Keyswitch</div><div class="ksrow"><span class="ksnote">'+(l.ks!=null&&l.ks>=0?noteName(l.ks)+' <small>('+l.ks+')</small>':'none')+'</span>'
      +'<button type="button" class="btn'+(KSL.learn===l.id?' on':'')+'" data-ls="ksLearn" data-id="'+l.id+'">'+(KSL.learn===l.id?'Play a key…':'Set by playing a key')+'</button>'
      +(l.ks!=null&&l.ks>=0?'<button type="button" class="btn" data-ls="ksClear" data-id="'+l.id+'">Clear</button>':'')+'</div>'
      +'<p class="hint" style="display:block">Playing this key picks the list (for articulations like legato, staccato, pizzicato). The key itself makes no sound. Keys below your mapped range work best.</p>'
    +'<label class="f chk"><input type="checkbox" data-sl="follow"'+(S.map.follow?' checked':'')+'><span>Only play this list\'s groups while editing</span></label>'
    +'<div class="snmores"><details class="snmore"><summary>Saved knob values</summary><div><p class="hint" style="display:block">'+Object.keys(l.vals||{}).length+' values stored. Choosing this list in the player sets the knobs to them.</p><div class="chips"><button type="button" class="btn" data-ls="saveVals" data-id="'+l.id+'">Store the current knob values</button></div></div></details></div>'
    +'<div class="snacts"><button type="button" class="btn danger" data-ls="delList" data-id="'+l.id+'">Delete list</button></div>';
}
$('#snInsList').addEventListener('input',e=>{const t=e.target,l=curList();if(!l||t.dataset.sl!=='name')return;l.name=t.value;refreshDisplays();const r=$('#leftM [data-sn="list"].cur .nm');if(r)r.textContent=l.name;});
$('#snInsList').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.sl,l=curList();if(!k||!l||k==='name')return;
  if(k==='bank'){listStructure(()=>{l.bank=+t.value;});const bt=bankTag(),lt=listTag();if(bt&&lt){setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}}
  else if(k==='grp'){const i=l.groups.indexOf(t.dataset.g);if(t.checked&&i<0)l.groups.push(t.dataset.g);else if(!t.checked&&i>=0)l.groups.splice(i,1);refreshDisplays();}
  else if(k==='follow'){S.map.follow=t.checked;}
  soundRefresh(true);
});
