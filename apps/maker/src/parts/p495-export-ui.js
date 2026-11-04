/* ---------- export tab ---------- */
const xtxt=(l,k,v,ph)=>'<label class="f"><span>'+l+'</span><input type="text" data-lk="'+k+'" value="'+esc(v)+'"'+(ph?' placeholder="'+ph+'"':'')+'></label>';
const xnum=(l,k,v,mn,mx,st,sfx)=>nf(l,'data-lk="'+k+'"',v,mn,mx,st,sfx);
const xsel=(l,k,v,o)=>'<label class="f"><span>'+l+'</span><select data-lk="'+k+'">'+mopt(o,v)+'</select></label>';
const xchk=(l,k,v)=>'<label class="f chk"><input type="checkbox" data-lk="'+k+'"'+(v?' checked':'')+'><span>'+l+'</span></label>';
const xcol=(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="color" data-lk="'+k+'" value="'+v+'"></label>';
function imgRow(label,key,id){
  const a=id&&S.assets[id];
  return '<div class="imgrow"><span>'+label+'</span>'+(a?'<img alt="" src="'+a.mips[0].url+'"><small>'+esc(a.name)+'</small>':'<small class="muted">none</small>')
    +'<button type="button" class="btn" data-xa="pick" data-k="'+key+'">'+(a?'Change':'Choose')+'</button>'+(a?'<button type="button" class="btn" data-xa="clear" data-k="'+key+'">Remove</button>':'')+'</div>';
}
function exLeftHTML(){
  const L=S.lib,B=L.banner;
  let h='<h2>Library</h2><div class="pad">';
  h+=sec('Library info',xtxt('Name','lib.name',L.name)+xtxt('Author','lib.author',L.author)+xtxt('Version','lib.version',L.version)
    +xsel('Category','lib.category',L.category,['Keys','Strings','Brass','Winds','Drums','Percussion','Synth','Pads','Guitars','Vocals','FX','Other'].map(x=>[x,x]))
    +xtxt('Tags','lib.tags',L.tags,'felt, soft, cinematic')+xtxt('Website','lib.web',L.web,'https://')
    +'<label class="f col"><span>Description</span><textarea data-lk="lib.desc" rows="3">'+esc(L.desc)+'</textarea></label>'
    +'<label class="f col"><span>Licence / credits</span><textarea data-lk="lib.licence" rows="2">'+esc(L.licence)+'</textarea></label>'
    +'<label class="f col"><span>Changelog</span><textarea data-lk="lib.changelog" rows="2">'+esc(L.changelog)+'</textarea></label>'
    +xcol('Accent colour','lib.accent',L.accent)
    +'<p class="hint">ID '+esc(L.id.slice(0,8))+'… stays the same between versions, so VisuPlayer can tell an update from a different library.</p>');
  h+=sec('Banner background',xsel('Style','lib.banner.bgMode',B.bgMode,[['gradient','Gradient'],['color','Solid colour'],['image','Image']])
    +(B.bgMode==='image'?imgRow('Image','bgImg',B.bgImg)+xnum('Focus left–right','lib.banner.focusX',B.focusX,0,100,1,'%')+xnum('Focus up–down','lib.banner.focusY',B.focusY,0,100,1,'%')
      :xcol(B.bgMode==='gradient'?'From':'Colour','lib.banner.bgColor',B.bgColor)+(B.bgMode==='gradient'?xcol('To','lib.banner.bgColor2',B.bgColor2):''))
    +xnum('Darken','lib.banner.darken',B.darken,0,90,1,'%')
    +'<p class="hint">The background moves a little when you hover the tile in the explorer. Its focus point decides what stays in view when it is cropped to wide, square or icon.</p>');
  h+=sec('Banner logo',imgRow('Logo (PNG or SVG with a transparent background)','logoImg',B.logoImg)+imgRow('Separate icon logo (optional)','iconImg',B.iconImg)
    +xchk('Show the library name when there is no logo','lib.banner.showName',B.showName)
    +xnum('Size, wide','lib.banner.scaleWide',B.scaleWide,10,100,1,'%')+xnum('Size, tile','lib.banner.scaleTile',B.scaleTile,10,100,1,'%')+xnum('Size, icon','lib.banner.scaleIcon',B.scaleIcon,10,100,1,'%')
    +xsel('Wide banner position','lib.banner.posWide',B.posWide,[['left','Left'],['center','Centre']])
    +'<p class="hint">The logo is placed automatically for each format, so you only make two images.</p>');
  return h+'</div>';
}
function exCenterHTML(){
  const L=S.lib;
  const gs=new Set(S.zones.map(z=>z.group));
  const rows=[['Samples',S.samples.length],['Zones',S.zones.length],['Groups',gs.size],['Lists',S.lists.length],['Banks',S.banks.length],['Elements',S.els.length],['FX graphs',Object.keys(S.fx.graphs||{}).length],['Tags',S.tags.length],['Fonts',Object.keys(S.fonts).length]];
  return '<div class="exgrid">'
    +'<section><h3>Wide banner <small>1200 × 400 · library page header</small></h3><canvas id="bnWide" class="bnc"></canvas></section>'
    +'<section class="exrow"><div><h3>Explorer tile <small>hover me</small></h3><div class="extile" id="exTile"><canvas id="bnEx" class="bnc"></canvas><div class="exmeta"><b>'+esc(L.name||'Untitled')+'</b><span>'+esc(L.author||'Unknown author')+' · v'+esc(L.version)+'</span><span class="muted">'+esc(L.category)+'</span></div></div></div>'
    +'<div><h3>Tile <small>512 × 512</small></h3><canvas id="bnTile" class="bnc sq"></canvas></div><div><h3>Icon <small>128 × 128</small></h3><canvas id="bnIcon" class="bnc ic"></canvas></div></section>'
    +'<section><h3>What goes in the file</h3><div class="chips">'+rows.map(r=>'<span class="chip ok">'+r[0]+' <b>'+r[1]+'</b></span>').join('')+'</div></section></div>';
}
function exSizeHTML(){
  const o=S.lib.export,e=estimate(o),ratio=e.before?e.after/e.before:1,bps=bytesPer(o.bits);
  let h='<div class="sizebox"><div class="sizebig">'+fmtBytes(e.after)+'</div><div class="muted">'+(o.bake?'with baking, from '+fmtBytes(e.before)+' ('+(ratio<1.05&&ratio>.95?'about the same':'×'+ratio.toFixed(2))+')':'before compression, '+o.bits+(o.bits===32?'-bit float':'-bit'))+'</div>';
  if(o.bake){h+='<div class="muted">'+e.zonesBaked+' zones baked into '+e.chunks+' samples, one every '+e.step+' key'+(e.step>1?'s':'')+(e.skipped.filter(x=>!x.soft).length?', '+e.skipped.filter(x=>!x.soft).length+' stay live':'')+'</div>';}
  if(e.over)h+='<div class="chip bad">Over your budget even at one sample per 24 keys. Try Smart, or lower the bit depth.</div>';
  const gk=Object.keys(e.perGroup),mx=Math.max.apply(null,gk.map(k=>e.perGroup[k]).concat([1]));
  h+='<div class="gbars">'+gk.map(k=>'<div class="gb"><span>'+esc(k)+'</span><i style="width:'+Math.max(2,e.perGroup[k]/mx*100)+'%"></i><em>'+fmtBytes(e.perGroup[k])+'</em></div>').join('')+'</div></div>';
  return h;
}
function exChecks(){
  const o=S.lib.export,L=S.lib,out=[];
  if(!L.name.trim()||L.name==='Untitled Library')out.push(['warn','Give the library a name.']);
  if(!S.zones.length)out.push(['bad','Nothing is mapped yet. The library would have no sound.']);
  const keep=fxKeep(),un=S.samples.filter(s=>!S.zones.some(z=>z.sample===s.id)&&keep.indexOf(s.id)<0).length;
  if(un)out.push(['warn',un+' sample'+(un>1?'s are':' is')+' not mapped. '+(o.includeUnused?'They will be included.':'They are left out of the file.')]);
  if(!L.banner.logoImg&&L.banner.bgMode!=='image')out.push(['warn','No logo or background image yet. The banner will show only the name.']);
  Object.keys(S.fonts).forEach(f=>{const x=S.fonts[f];if(x.lic==='restricted')out.push(['warn','Font "'+f+'" forbids embedding. It is left out.']);});
  if(o.bake){const ev=estimate(o).skipped.filter(x=>!x.soft);if(ev.length)out.push(['ok',ev.length+' zone'+(ev.length>1?'s':'')+' can not be baked ('+[...new Set(ev.map(x=>x.why))].join('; ')+') and stay live.']);}
  if(!out.length)out.push(['ok','Everything looks ready.']);
  return out;
}
function exRightHTML(){
  const o=S.lib.export,b=S.build;
  let h='<h2>Build</h2><div class="pad" id="exBuildBody">';
  h+=sec('Bake interpolation',xchk('Bake interpolation into the samples','lib.export.bake',o.bake)
    +'<p class="hint">'+(o.bake?'Baked libraries are lighter on CPU but larger on disk. Baking happens only in the exported file; your project never changes.':'Off. The player works out pitch changes live, and the file stays as small as your recordings. Baked libraries are lighter on CPU but larger on disk.')+'</p>'
    +(o.bake?xsel('Which notes','lib.export.mode',o.mode,[['smart','Smart: only notes far from the root'],['full','Full: every note']])
      +xchk('Pick the step to fit a size budget','lib.export.budgetOn',o.budgetOn)
      +(o.budgetOn?xnum('Size budget','lib.export.budgetMB',o.budgetMB,5,8000,10,'MB')+'<p class="hint">Chosen step: one baked sample every <b>'+exStep(o)+'</b> keys.</p>':xnum('One sample every','lib.export.step',o.step,1,24,1,'keys'))
      +xsel('Quality','lib.export.quality',o.quality,[['linear','Fast (linear)'],['cubic','Good (cubic)'],['sinc','Best (sinc)']])
      +xchk('Bake sample unison too','lib.export.bakeUni',o.bakeUni)+xchk('Keep the original samples as well','lib.export.includeOrig',o.includeOrig)
      +'<p class="hint">Smart keeps ±2 semitones around each root live, so the sound near the recording stays exactly as recorded. Loops, granular, wavetable, slicer and tempo-synced zones are never baked.</p>':''));
  h+=sec('File',xsel('Bit depth','lib.export.bits',o.bits,[[16,'16-bit (smallest)'],[24,'24-bit'],[32,'32-bit float (largest)']])
    +xchk('Compress the audio','lib.export.compress',o.compress)+xchk('Include samples that are not mapped','lib.export.includeUnused',o.includeUnused));
  h+=sec('Size',exSizeHTML());
  h+=sec('Checks','<ul class="checks">'+exChecks().map(c=>'<li class="'+c[0]+'">'+esc(c[1])+'</li>').join('')+'</ul>');
  h+='<div class="buildbar"><button type="button" class="btn primary" data-xa="build"'+(b.busy?' disabled':'')+'>'+(b.busy?'Building…':'Build .vsamp')+'</button>'
    +'<button type="button" class="btn" data-xa="verify"'+(b.last&&!b.busy?'':' disabled')+'>Verify</button>'
    +'<button type="button" class="btn" data-xa="download"'+(b.last&&!b.busy?'':' disabled')+'>Download</button></div>';
  h+='<div class="buildlog" id="exLog" role="status">'+(b.progress?esc(b.progress):'')+'</div>'+exReportHTML();
  return h+'</div>';
}
function exReportHTML(){
  const r=S.build.report;if(!r)return'';
  let h='<div class="report"><b>'+esc(r.name)+'.vsamp</b> · '+fmtBytes(r.bytes)+' · built in '+(r.ms/1000).toFixed(1)+' s<br>'+r.samples+' samples, '+r.zones+' zones'+(r.chunks?', '+r.chunks+' baked (every '+r.step+' keys)':'')+(r.unusedSkipped?', '+r.unusedSkipped+' unused left out':'')+(r.leftLive?', '+r.leftLive+' zones left live':'')+'.';
  (r.warn||[]).forEach(w=>{h+='<br><span class="chip warn">'+esc(w)+'</span>';});
  if(S.build.verify)h+='<br>'+(S.build.verify.ok?'<span class="chip ok">Verified: '+S.build.verify.info.blobs+' blocks, all checksums match, audio decodes.</span>':'<span class="chip bad">'+esc(S.build.verify.errors.join(' '))+'</span>');
  return h+'</div>';
}
function exRender(){
  $('#leftX').innerHTML=exLeftHTML();$('#centerX').querySelector('#exMain').innerHTML=exCenterHTML();$('#rightX').innerHTML=exRightHTML();
  bannerRedraw();exTileBind();
}
function exRightRefresh(){$('#rightX').innerHTML=exRightHTML();}
function exTileBind(){
  const t=$('#exTile');if(!t)return;
  t.addEventListener('mousemove',e=>{const r=t.getBoundingClientRect();EXPAR.x=((e.clientX-r.left)/r.width-.5)*2;EXPAR.y=((e.clientY-r.top)/r.height-.5)*2;drawBanner($('#bnEx'),'tile',FMT.tile.w,FMT.tile.h,EXPAR);});
  t.addEventListener('mouseleave',()=>{EXPAR.x=EXPAR.y=0;drawBanner($('#bnEx'),'tile',FMT.tile.w,FMT.tile.h,EXPAR);});
}
function exApply(t){
  const v=t.type==='checkbox'?t.checked:t.type==='number'||t.type==='range'?parseFloat(t.value):t.dataset.lk==='lib.export.bits'?parseInt(t.value,10):t.value;
  if(typeof v==='number'&&isNaN(v))return false;
  setPath({lib:S.lib},t.dataset.lk,v);return true;
}
const exWatch=()=>{S.build.verify=null;};
['#leftX','#rightX'].forEach(sel=>{
  $(sel).addEventListener('input',e=>{
    const t=e.target;if(!t.dataset.lk||t.type==='checkbox'||t.tagName==='SELECT')return;
    if(!exApply(t))return;bannerRedraw();
    if(sel==='#rightX'){const b=$('#rightX').querySelector('details[data-sec="Size"]');if(b){const keep=[...b.children].filter(c=>c.tagName!=='SUMMARY');keep.forEach(c=>c.remove());b.insertAdjacentHTML('beforeend',exSizeHTML());}}
  });
  $(sel).addEventListener('change',e=>{
    const t=e.target;if(!t.dataset.lk)return;if(!exApply(t))return;
    if(sel==='#leftX'){const k=t.dataset.lk;if(k==='lib.banner.bgMode'||k==='lib.name'||k==='lib.author'||k==='lib.version'||k==='lib.category'){const sc=$('#leftX').scrollTop;if(k==='lib.banner.bgMode')$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;}$('#exMain').innerHTML=exCenterHTML();exTileBind();bannerRedraw();}
    else{const sc=$('#rightX').scrollTop;exRightRefresh();$('#rightX').scrollTop=sc;}
  });
});
$('#leftX').addEventListener('click',e=>{
  const b=e.target.closest('[data-xa]');if(!b)return;const k=b.dataset.k;
  if(b.dataset.xa==='pick')pickImage(id=>{S.lib.banner[k]=id;IMGC.delete(id);const sc=$('#leftX').scrollTop;$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;bannerRedraw();});
  else if(b.dataset.xa==='clear'){S.lib.banner[k]=null;const sc=$('#leftX').scrollTop;$('#leftX').innerHTML=exLeftHTML();$('#leftX').scrollTop=sc;bannerRedraw();}
});
async function exBuild(){
  if(S.build.busy)return;S.build.busy=true;S.build.verify=null;exRightRefresh();
  const say=t=>{S.build.progress=t;const l=$('#exLog');if(l)l.textContent=t;};
  try{
    ensureAudio();
    const r=await buildVsamp(say);S.build.last=r;S.build.report=r.report;S.build.progress='Done.';
    const v=await parseVsamp(r.bytes);S.build.verify=v;
    flash(v.ok?'Built and verified: '+fmtBytes(r.bytes.length):'Built, but the check found problems');
  }catch(err){S.build.progress='Build failed: '+(err&&err.message||err);console.error(err);}
  S.build.busy=false;exRightRefresh();
}
$('#rightX').addEventListener('click',async e=>{
  const b=e.target.closest('[data-xa]');if(!b)return;const a=b.dataset.xa;
  if(a==='build')exBuild();
  else if(a==='verify'&&S.build.last){S.build.verify=await parseVsamp(S.build.last.bytes);exRightRefresh();}
  else if(a==='download'&&S.build.last){downloadBytes(S.build.last.bytes,(S.lib.name.trim().replace(/[^\w\-. ]+/g,'')||'library')+'.vsamp');}
});
