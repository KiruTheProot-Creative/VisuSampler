/* ---------- mapper: left panel (groups + pool), zone inspector ---------- */
const MODES=[['normal','Normal (all matching zones play)'],['rrcycle','Round robin: cycle'],['rrrandom','Round robin: random'],['rrunique','Round robin: random, no repeat'],['release','Release trigger (plays on key up)']];
const GINT=[['inherit','Project default']].concat(INTERP);
const mopt=(arr,v)=>arr.map(a=>'<option value="'+esc(a[0])+'"'+(String(a[0])===String(v)?' selected':'')+'>'+esc(a[1])+'</option>').join('');
const nf=(l,attr,v,mn,mx,st,suffix)=>'<label class="f"><span>'+l+'</span><input type="number" '+attr+' value="'+(Math.round(v*1000)/1000)+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+' step="'+(st||1)+'">'+(suffix?'<em class="sfx">'+suffix+'</em>':'')+'</label>';
function newGroupName(){let i=S.groups.length+1;while(S.groups.indexOf('Group '+i)>=0)i++;return 'Group '+i;}
function mapLeftHTML(){
  const cur=S.map.group;
  let h='<h2>Groups</h2><div class="glist">'+S.groups.map(g=>{
    const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length;
    return '<div class="grow'+(g===cur?' on':'')+'" data-ma="grp" data-g="'+esc(g)+'"><i class="sw" style="background:'+c.color+'"></i><span class="gn">'+esc(g)+'</span><small>'+n+'</small>'
      +'<button type="button" class="ms'+(c.mute?' on':'')+'" data-ma="gmute" data-g="'+esc(g)+'" title="Mute group" aria-label="Mute '+esc(g)+'" aria-pressed="'+c.mute+'">M</button>'
      +'<button type="button" class="ms'+(c.solo?' on':'')+'" data-ma="gsolo" data-g="'+esc(g)+'" title="Solo group" aria-label="Solo '+esc(g)+'" aria-pressed="'+c.solo+'">S</button></div>';
  }).join('')+'</div><div class="chips"><button type="button" class="btn" data-ma="addgrp">+ Group</button>'
    +'<label class="chk"><input type="checkbox" data-mk="editAll"'+(S.map.editAll?' checked':'')+'> Edit all groups</label>'
    +'<label class="chk"><input type="checkbox" data-mk="follow"'+(S.map.follow?' checked':'')+'> Play only the current list\'s groups</label></div>';
  if(cur&&S.groups.indexOf(cur)>=0){
    const c=gcfg(cur);
    h+=sec('Group: '+cur,'<label class="f"><span>Name</span><input type="text" data-gname="1" value="'+esc(cur)+'"></label>'
      +'<label class="f"><span>Mode</span><select data-gk="mode">'+mopt(MODES,c.mode)+'</select></label>'
      +nf('Choke group','data-gk="choke"',c.choke,0,999,1)+'<p class="hint">Groups with the same choke number (above 0) cut each other off, like open and closed hi-hats.</p>'
      +nf('Voice limit','data-gk="voices"',c.voices,0,9999,1)+'<p class="hint">0 means unlimited. A limit steals the oldest voice.</p>'
      +nf('Volume','data-gk="vol"',c.vol,-48,24,.5,'dB')+nf('Pan','data-gk="pan"',c.pan,-100,100,1)+nf('Tune','data-gk="tune"',c.tune,-2400,2400,1,'cents')
      +'<label class="f"><span>Velocity curve</span><input type="range" data-gk="velcurve" min="0.2" max="2.5" step="0.05" value="'+c.velcurve+'"><output>'+c.velcurve+'</output></label>'
      +'<label class="f"><span>Interpolation</span><select data-gk="interp">'+mopt(GINT,c.interp)+'</select></label>'
      +'<label class="f"><span>Colour</span><input type="color" data-gk="color" value="'+c.color+'"></label>'
      +'<div class="chips"><button type="button" class="btn danger" data-ma="delgrp">Delete group and its zones</button></div>');
  }
  h+=sec('Sample pool ('+S.samples.length+')','<div class="chips"><button type="button" class="btn" data-ma="imp">Import audio…</button><button type="button" class="btn" data-ma="demo">Demo samples</button></div>'
    +'<p class="hint">Drag a sample onto the grid, or double-click the grid to place the last one you clicked. Dropping files from your computer onto the grid maps them by note name (C3, F#2…).</p>'
    +'<div class="pool">'+S.samples.map(s=>{
      const used=S.zones.some(z=>z.sample===s.id);
      return '<div class="prow'+(s.id===S.map.lastSample?' on':'')+(used?'':' unused')+'" draggable="true" data-ma="smp" data-s="'+s.id+'"><canvas width="64" height="22" data-pk="'+s.id+'" aria-hidden="true"></canvas>'
        +'<span class="pn" title="'+esc(s.name)+'">'+esc(s.name)+'</span><small>'+noteName(s.root)+' · '+s.dur.toFixed(1)+'s</small>'
        +'<button type="button" class="x" data-ma="smpdel" data-s="'+s.id+'" aria-label="Remove '+esc(s.name)+'">✕</button></div>';
    }).join('')+'</div>');
  return h;
}
function drawPeaks(cv,id,w,h,opts){
  const b=BUF.get(id); if(!b) return;
  const ctx=cv.getContext('2d'),p=b.peaks,n=p.length/2; ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle=(opts&&opts.col)||'#9ab7d8';
  for(let x=0;x<w;x++){const i=Math.min(n-1,Math.floor(x/w*n)),mn=p[i*2],mx=p[i*2+1];ctx.fillRect(x,h/2-mx*h/2,1,Math.max(1,(mx-mn)*h/2));}
}
function mapLeftRender(){
  const el=$('#leftM'); el.innerHTML=mapLeftHTML();
  $$('canvas[data-pk]',el).forEach(c=>drawPeaks(c,c.dataset.pk,c.width,c.height));
}
/* ---------- zone inspector ---------- */
function getPath(o,p){return p.split('.').reduce((a,k)=>a&&a[k],o);}
function setPath(o,p,v){const a=p.split('.'),l=a.pop();const t=a.reduce((x,k)=>x[k],o);t[l]=v;}
function zfield(label,key,v,o){
  o=o||{};
  return nf(label,'data-zk="'+key+'"'+(o.ms?' data-conv="ms"':''),v,o.min,o.max,o.step,o.sfx);
}
function zchk(label,key,v){return '<label class="f chk"><input type="checkbox" data-zk="'+key+'"'+(v?' checked':'')+'><span>'+label+'</span></label>';}
function zsel(label,key,v,opts){return '<label class="f"><span>'+label+'</span><select data-zk="'+key+'">'+mopt(opts,v)+'</select></label>';}
function mapRightHTML(){
  const zs=selZones();
  if(!zs.length){
    const bad=zoneConflicts().size;
    return '<div class="rep"><div class="stats"><div><small>Zones</small><b>'+S.zones.length+'</b></div><div><small>Samples</small><b>'+S.samples.length+'</b></div><div><small>Groups</small><b>'+S.groups.length+'</b></div><div><small>Conflicts</small><b>'+bad+'</b></div></div></div>'
      +'<p class="empty">No zone selected.<br>Click a zone, drag a box around several, or double-click the grid to place a sample.</p>'
      +sec('Cheat sheet','<div class="syn">Drag a zone to move it, its edges to resize.<br>Diamonds drag the crossfades.<br>The small triangle at the bottom is the root key.<br><kbd>Shift</kbd>-click adds to the selection.<br><kbd>Ctrl</kbd> or <kbd>Alt</kbd>-drag duplicates.<br><kbd>Ctrl</kbd>+wheel zooms, wheel scrolls.<br>Arrows nudge, <kbd>Shift</kbd>+arrows jump.<br><kbd>Del</kbd> removes. Red dashed zones overlap with no crossfade.</div>');
  }
  const z=zs[0],multi=zs.length>1,sm=sampleById(z.sample),sr=sm?sm.sr:44100;
  const msv=f=>f/sr*1000;
  let h='<div class="phead"><b class="pname2">'+(multi?zs.length+' zones':esc(sm?sm.name:'Zone'))+'</b><span class="badge">'+esc(z.group)+'</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-mz="dup">Duplicate</button><button type="button" class="btn danger" data-mz="del">Delete</button></div>';
  h+=sec('Sample',(multi?'':'<canvas id="zoneWave" width="300" height="76" aria-label="Sample waveform with loop markers"></canvas><p class="hint" id="waveHint">Drag the markers: start, loop start, loop end, and the crossfade.</p>')
    +'<label class="f"><span>Sample</span><select data-zk="sample">'+mopt(S.samples.map(s=>[s.id,s.name]),z.sample)+'</select></label>'
    +'<label class="f"><span>Group</span><select data-zk="group">'+mopt(S.groups.map(g=>[g,g]),z.group)+'</select></label>'
    +(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="detect">Detect pitch</button></div>'));
  h+=sec('Keys and velocity',zfield('Low key','lo',z.lo,{min:0,max:127,sfx:noteName(z.lo)})+zfield('High key','hi',z.hi,{min:0,max:127,sfx:noteName(z.hi)})
    +zfield('Low velocity','vlo',z.vlo,{min:0,max:127})+zfield('High velocity','vhi',z.vhi,{min:0,max:127})
    +zfield('Root key','root',z.root,{min:0,max:127,sfx:noteName(z.root)}));
  h+=sec('Crossfades',zfield('Key fade in','fadeLo',z.fadeLo,{min:0,max:127,sfx:'keys'})+zfield('Key fade out','fadeHi',z.fadeHi,{min:0,max:127,sfx:'keys'})
    +zfield('Velocity fade in','vfadeLo',z.vfadeLo,{min:0,max:127})+zfield('Velocity fade out','vfadeHi',z.vfadeHi,{min:0,max:127})
    +zsel('Fade curve','curve',z.curve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
    +'<p class="hint">Fades happen inside the zone. Overlap two zones by the same amount with an equal-power curve and the level stays even across the join.</p>');
  h+=sec('Pitch and interpolation',zfield('Tune','tune',z.tune,{min:-2400,max:2400,step:1,sfx:'cents'})+zchk('Follow the keyboard (key tracking)','keytrack',z.keytrack)
    +zsel('Interpolation','interp',z.interp,GINT)
    +'<p class="hint">This is how the sample is resampled when it is pitched. Nearest is gritty, linear is soft, cubic is clean, sinc is the cleanest and costs the most.</p>');
  h+=sec('Level',zfield('Volume','vol',z.vol,{min:-60,max:24,step:.5,sfx:'dB'})+zfield('Pan','pan',z.pan,{min:-100,max:100}));
  h+=sec('Start and loop',zfield('Start offset','start',z.start,{min:0,max:60000,step:1,sfx:'ms'})+zfield('End (0 = whole sample)','end',z.end,{min:0,max:600000,step:1,sfx:'ms'})+zfield('Velocity moves start','vstart',z.vstart,{min:0,max:5000,step:1,sfx:'ms'})
    +'<p class="hint">Soft notes start later in the sample, like a gentler attack.</p>'+zchk('Reverse','rev',z.rev)+zchk('Loop','loop.on',z.loop.on)
    +(z.loop.on?zfield('Loop start','loop.s',msv(z.loop.s),{min:0,step:1,sfx:'ms',ms:1})+zfield('Loop end','loop.e',msv(z.loop.e),{min:0,step:1,sfx:'ms',ms:1})
      +zfield('Loop crossfade','loop.xf',msv(z.loop.xf),{min:0,step:1,sfx:'ms',ms:1})+zsel('Loop fade curve','loop.xcurve',z.loop.xcurve,[['power','Equal power'],['linear','Linear'],['s','S-curve']])
      +zchk('Ping-pong (forward then backward)','loop.pp',z.loop.pp)+(multi?'':'<div class="chips"><button type="button" class="btn" data-mz="findloop">Find a loop</button></div>'):''));
  h+=sec('Envelope',zfield('Attack','attack',z.attack,{min:0,max:10000,sfx:'ms'})+zfield('Release','release',z.release,{min:0,max:20000,sfx:'ms'})+zchk('One-shot (ignore key up)','oneshot',z.oneshot));
  h+=sec('Variation',zfield('Round robin position','seq',z.seq,{min:1,max:999})+'<p class="hint">Zones in a round-robin group with different positions take turns.</p>'
    +zfield('Random tune','hum.tune',z.hum.tune,{min:0,max:200,sfx:'cents'})+zfield('Random volume','hum.vol',z.hum.vol,{min:0,max:12,step:.5,sfx:'dB'})+zfield('Random start','hum.start',z.hum.start,{min:0,max:500,sfx:'ms'}));
  h+=sec('Mute / solo',zchk('Mute zone','mute',z.mute)+zchk('Solo zone','solo',z.solo));
  return h;
}
let waveZ=null;
function mapRightRender(){
  const el=$('#rightM'); const sc=$('#rbodyM'); sc.innerHTML=mapRightHTML();
  const zs=selZones(); waveZ=zs.length===1?zs[0]:null; drawZoneWave();
}
function mapUI(){mapLeftRender();mapRightRender();}
/* ---- waveform with draggable markers ---- */
function waveMetrics(){
  const cv=$('#zoneWave'); if(!cv||!waveZ) return null;
  const sm=sampleById(waveZ.sample),b=sm&&BUF.get(sm.id); if(!b) return null;
  return{cv,sm,b,W:cv.width,H:cv.height,total:b.ch[0].length};
}
function drawZoneWave(){
  const m=waveMetrics(); if(!m) return; const z=waveZ,{cv,W,H,total,sm}=m,ctx=cv.getContext('2d');
  ctx.fillStyle='#262626';ctx.fillRect(0,0,W,H);
  const fx=f=>f/total*W,L=z.loop;
  if(L.on){
    ctx.fillStyle='rgba(90,160,255,.18)';ctx.fillRect(fx(L.s),0,fx(L.e)-fx(L.s),H);
    if(L.xf>0){ctx.fillStyle='rgba(240,194,74,.28)';ctx.fillRect(fx(L.e-L.xf),0,fx(L.xf),H);ctx.fillRect(fx(L.s-L.xf),0,fx(L.xf),H);}
  }
  drawPeaks(cv,sm.id,W,H,{col:'#9ab7d8'});
  const line=(x,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x)-1,0,2,H);};
  line(fx(z.start/1000*sm.sr),'#8ac76a');
  if(L.on){line(fx(L.s),'#5aa0ff');line(fx(L.e),'#5aa0ff');}
  ctx.fillStyle='#ccc';ctx.font='9px "JetBrains Mono",monospace';ctx.textBaseline='top';
  ctx.fillText(sm.dur.toFixed(2)+' s',W-44,2);
}
document.addEventListener('pointerdown',e=>{
  const cv=e.target.closest&&e.target.closest('#zoneWave'); if(!cv||!waveZ) return;
  const m=waveMetrics(); if(!m) return; e.preventDefault();
  const r=cv.getBoundingClientRect(),sc=cv.width/r.width,z=waveZ,L=z.loop,{total,sm}=m;
  const toF=ev=>clamp(Math.round((ev.clientX-r.left)*sc/m.W*total),0,total);
  const px=(ev)=>(ev.clientX-r.left)*sc;
  const marks=[['start',z.start/1000*sm.sr]];
  if(L.on){marks.push(['ls',L.s],['le',L.e],['xf',L.e-L.xf]);}
  let best=null,bd=9;marks.forEach(mk=>{const d=Math.abs(px(e)-mk[1]/total*m.W);if(d<bd){bd=d;best=mk[0];}});
  if(!best){return;}
  const mv=ev=>{
    const f=toF(ev);
    if(best==='start') z.start=Math.round(f/sm.sr*1000);
    else if(best==='ls') L.s=Math.min(f,L.e-64);
    else if(best==='le') L.e=Math.max(f,L.s+64);
    else if(best==='xf') L.xf=clamp(L.e-f,0,Math.min(L.s,(L.e-L.s)>>1));
    touchMap();drawZoneWave();
  };
  drag(mv,()=>{mapRightRender();});
});
document.addEventListener('pointermove',e=>{
  const cv=e.target.closest&&e.target.closest('#zoneWave'); if(cv) cv.style.cursor='ew-resize';
});
/* ---- find loop: zero crossings with matching direction ---- */
function findLoop(z){
  const b=BUF.get(z.sample); if(!b) return false; const d=b.ch[0],n=d.length,sr=b.sr;
  const up=i=>d[i]<=0&&d[i+1]>0;
  const snap=(f,dir)=>{for(let k=0;k<4000;k++){const i=f+dir*k;if(i>0&&i<n-2&&up(i))return i;}return f;};
  const s=snap(Math.floor(n*.3),1),e=snap(Math.floor(n*.85),-1);
  if(e-s<sr*.1) return false;
  z.loop.on=true;z.loop.s=s;z.loop.e=e;z.loop.xf=Math.min(Math.floor(sr*.12),s,(e-s)>>1);
  return true;
}
/* ---- events: left panel ---- */
$('#leftM').addEventListener('click',e=>{
  const b=e.target.closest('[data-ma]'); if(!b) return; const a=b.dataset.ma,g=b.dataset.g;
  if(e.target.closest('input')) return;
  if(a==='grp'){if(e.target.closest('.ms'))return;S.map.group=g;if(e.detail>=2)S.map.sel=S.zones.filter(z=>z.group===g).map(z=>z.id);mapUI();mapInvalidate();}
  else if(a==='gmute'){gcfg(g).mute=!gcfg(g).mute;mapUI();}
  else if(a==='gsolo'){gcfg(g).solo=!gcfg(g).solo;mapUI();}
  else if(a==='addgrp'){const n=newGroupName();S.groups.push(n);gcfg(n);S.map.group=n;mapUI();mapInvalidate();}
  else if(a==='delgrp'){
    const n=S.map.group;if(!n)return;
    delZones(S.zones.filter(z=>z.group===n).map(z=>z.id));
    S.groups=S.groups.filter(x=>x!==n);S.lists.forEach(l=>{l.groups=(l.groups||[]).filter(x=>x!==n);});
    delete S.gset[n];S.map.group=S.groups[0]||null;mapUI();mapInvalidate();
  }
  else if(a==='smp'){if(e.target.closest('.x'))return;S.map.lastSample=b.dataset.s;mapLeftRender();}
  else if(a==='smpdel'){
    const id=b.dataset.s;delZones(S.zones.filter(z=>z.sample===id).map(z=>z.id));
    S.samples=S.samples.filter(s=>s.id!==id);BUF.delete(id);touchMap();mapUI();mapInvalidate();
  }
  else if(a==='imp'){$('#fileAudio').value='';$('#fileAudio').click();}
  else if(a==='demo'){ensureAudio();demoSamples();touchMap();mapUI();mapInvalidate();flash('Demo set loaded: piano with velocity layers, round-robin hammers, a looped pad and release noise');}
});
$('#leftM').addEventListener('dblclick',e=>{
  const gr=e.target.closest('.grow'); if(gr&&!e.target.closest('.ms')){S.map.group=gr.dataset.g;S.map.sel=S.zones.filter(z=>z.group===gr.dataset.g).map(z=>z.id);mapUI();mapInvalidate();return;}
  const r=e.target.closest('.prow'); if(!r) return;
  const sm=sampleById(r.dataset.s); if(!sm) return;
  placeSample(sm.id,clamp(sm.root,0,127),64);
});
$('#leftM').addEventListener('dragstart',e=>{
  const r=e.target.closest('.prow'); if(!r) return;
  e.dataTransfer.setData('text/x-vsamp',r.dataset.s);e.dataTransfer.effectAllowed='copy';
});
$('#leftM').addEventListener('input',e=>{
  const t=e.target,g=S.map.group;
  if(t.dataset.gk&&g){
    const c=gcfg(g),k=t.dataset.gk;
    c[k]=t.type==='number'||t.type==='range'?parseFloat(t.value)||0:t.value;
    if(t.type==='range'&&t.nextElementSibling)t.nextElementSibling.textContent=c[k];
    if(k==='color'){mapInvalidate();} else touchMap();
    if(k==='color'){const sw=$('.grow.on .sw',$('#leftM'));if(sw)sw.style.background=c.color;}
  }
});
$('#leftM').addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.mk){S.map[t.dataset.mk]=t.checked;mapInvalidate();return;}
  if(t.dataset.gname){
    const old=S.map.group,nn=t.value.trim();
    if(!nn||S.groups.indexOf(nn)>=0){t.value=old;flash('Group names must be unique');return;}
    S.groups[S.groups.indexOf(old)]=nn;S.gset[nn]=S.gset[old];delete S.gset[old];
    S.zones.forEach(z=>{if(z.group===old)z.group=nn;});
    S.lists.forEach(l=>{l.groups=(l.groups||[]).map(x=>x===old?nn:x);});
    S.map.group=nn;touchMap();mapUI();mapInvalidate();return;
  }
  if(t.dataset.gk==='mode'||t.dataset.gk==='interp'){touchMap();}
});
$('#fileAudio').addEventListener('change',()=>{
  importFiles($('#fileAudio').files).then(ss=>{if(ss.length){S.map.lastSample=ss[ss.length-1].id;mapUI();flash(ss.length+' sample'+(ss.length>1?'s':'')+' added to the pool. Use Auto-map or drag them in.');}});
});
/* ---- events: zone inspector ---- */
const STRUCT=['loop.on','sample','group','interp','lo','hi','root','vlo','vhi'];
$('#rbodyM').addEventListener('input',e=>{
  const t=e.target,key=t.dataset.zk; if(!key) return;
  const zs=selZones(); if(!zs.length) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.tagName==='SELECT'||t.type==='text') v=t.value; else{v=parseFloat(t.value);if(isNaN(v))return;}
  if(t.type==='checkbox'||t.tagName==='SELECT') return; /* handled on change */
  applyZ(zs,key,v,t.dataset.conv);
  const sfx=t.parentElement.querySelector('.sfx'); if(sfx&&(key==='lo'||key==='hi'||key==='root')) sfx.textContent=noteName(v);
});
$('#rbodyM').addEventListener('change',e=>{
  const t=e.target,key=t.dataset.zk; if(!key) return;
  const zs=selZones(); if(!zs.length) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.tagName==='SELECT') v=t.value; else v=parseFloat(t.value);
  if(typeof v==='number'&&isNaN(v)) return;
  applyZ(zs,key,v,t.dataset.conv); mapRightRender(); mapLeftRender();
});
function applyZ(zs,key,v,conv){
  zs.forEach(z=>{
    let val=v;
    if(conv==='ms'){const s=sampleById(z.sample);val=Math.round(v/1000*(s?s.sr:44100));}
    if(key==='lo') val=clamp(val,0,127);
    setPath(z,key,val);
    if(key==='lo'&&z.lo>z.hi) z.hi=z.lo; if(key==='hi'&&z.hi<z.lo) z.lo=z.hi;
    if(key==='vlo'&&z.vlo>z.vhi) z.vhi=z.vlo; if(key==='vhi'&&z.vhi<z.vlo) z.vlo=z.vhi;
    if(key==='sample'){const s=sampleById(val);if(s&&z.loop.e>s.frames)z.loop.e=s.frames;}
    if(key==='loop.on'&&val&&z.loop.e-z.loop.s<64){const s=sampleById(z.sample);if(s){z.loop.s=Math.floor(s.frames*.3);z.loop.e=Math.floor(s.frames*.9);}}
  });
  touchMap();mapInvalidate();drawZoneWave();
}
$('#rightM').addEventListener('click',e=>{
  const b=e.target.closest('[data-mz]'); if(!b) return; const a=b.dataset.mz,zs=selZones();
  if(a==='del'){delZones(S.map.sel);mapInvalidate();mapUI();}
  else if(a==='dup'){S.map.sel=zs.map(z=>dupZone(z).id);mapInvalidate();mapUI();}
  else if(a==='detect'&&zs[0]){
    const p=detectPitch(zs[0].sample);
    if(!p){flash('Could not find a clear pitch in that sample');return;}
    zs[0].root=p.midi;zs[0].tune=-p.cents;touchMap();mapInvalidate();mapRightRender();flash('Detected '+noteName(p.midi)+(p.cents?' ('+(p.cents>0?'+':'')+p.cents+' cents)':''));
  }
  else if(a==='findloop'&&zs[0]){if(findLoop(zs[0])){touchMap();mapRightRender();flash('Loop placed on matching zero crossings');}else flash('That sample is too short to loop');}
});
