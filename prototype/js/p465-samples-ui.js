/* ---------- samples tab: pool + inspector ---------- */
function synthWavetable(){
  const fl=2048,nf=8,d=new Float32Array(fl*nf);
  for(let f=0;f<nf;f++){
    const t=f/(nf-1);
    for(let i=0;i<fl;i++){
      const ph=i/fl;let v=0;
      for(let h=1;h<=40;h++){
        const saw=1/h,sq=h%2?1/h:0,tri=h%2?(((h-1)/2)%2?-1:1)/(h*h):0,sine=h===1?1:0;
        const w=t<.33?(1-t*3)*sine+t*3*tri:t<.66?(1-(t-.33)*3)*tri+(t-.33)*3*saw:(1-(t-.66)*3)*saw+(t-.66)*3*sq;
        v+=w*Math.sin(2*Math.PI*h*ph);
      }
      d[f*fl+i]=v;
    }
    let pk=0;for(let i=0;i<fl;i++)pk=Math.max(pk,Math.abs(d[f*fl+i]));for(let i=0;i<fl;i++)d[f*fl+i]*=.8/pk;
  }
  return d;
}
function synthBeat(sr){
  const bpm=100,beat=60/bpm,hits=[['k',0],['h',.5],['s',1],['h',1.5],['k',2],['k',2.5],['s',3],['h',3.5]],n=Math.floor(sr*beat*4),d=new Float32Array(n);
  hits.forEach(h=>{
    const o=Math.floor(h[1]*beat*sr);
    if(h[0]==='k'){const L=Math.floor(sr*.28);for(let i=0;i<L&&o+i<n;i++){const t=i/sr;d[o+i]+=Math.sin(2*Math.PI*(110*Math.exp(-t*14)+40)*t)*Math.exp(-t*11)*.95;}}
    else if(h[0]==='s'){const L=Math.floor(sr*.2);for(let i=0;i<L&&o+i<n;i++){const t=i/sr;d[o+i]+=((Math.random()*2-1)*.55+Math.sin(2*Math.PI*190*t)*.35)*Math.exp(-t*18);}}
    else{const L=Math.floor(sr*.07);let lp=0;for(let i=0;i<L&&o+i<n;i++){const t=i/sr,x=Math.random()*2-1;lp=x-lp*.7;d[o+i]+=lp*.22*Math.exp(-t*60);}}
  });
  return d;
}
function demoExtras(kind){
  const sr=44100;let s;
  if(kind==='wt'){s=addBuffer('Wavetable_Morph',[synthWavetable()],sr);s.root=60;s.fine=0;smOf(s).mode='wavetable';}
  else{s=addBuffer('Beat_Loop_100bpm',[synthBeat(sr)],sr);s.root=60;s.fine=0;const sm=smOf(s);sm.mode='slicer';sm.bars=1;sm.slices=detectTransients(s,60);}
  S.smp.sel=s.id;S.map.lastSample=s.id;return s;
}
function smLeftHTML(){
  return '<h2>Samples ('+S.samples.length+')</h2><div class="chips"><button type="button" class="btn" data-sa="imp">Import audio…</button><button type="button" class="btn" data-sa="demo">Demo set</button>'
    +'<button type="button" class="btn" data-sa="demowt">Demo wavetable</button><button type="button" class="btn" data-sa="demobeat">Demo beat</button></div>'
    +'<div class="pool pool2">'+S.samples.map(s=>{
      const sm=smOf(s),n=S.zones.filter(z=>z.sample===s.id).length;
      return '<div class="prow'+(s.id===S.smp.sel?' on':'')+'" data-sa="pick" data-s="'+s.id+'"><canvas width="64" height="22" data-pk="'+s.id+'" aria-hidden="true"></canvas><span class="pn" title="'+esc(s.name)+'">'+esc(s.name)+'</span>'
        +'<small>'+(sm.mode==='sampler'?'':sm.mode.slice(0,4)+' · ')+(sm.uni.on?'uni · ':'')+n+'z</small></div>';
    }).join('')+'</div>'
    +'<div class="chips"><button type="button" class="btn" data-sa="dup">Duplicate</button><button type="button" class="btn danger" data-sa="del">Remove</button></div>'
    +'<p class="hint">Tip: <kbd>Space</kbd> plays the raw sample or selection. The keys <kbd>A</kbd>–<kbd>K</kbd> play it through its mode and unison, so you hear exactly what the mapper will play.</p>';
}
function smLeftRender(){const el=$('#leftS');el.innerHTML=smLeftHTML();$$('canvas[data-pk]',el).forEach(c=>drawPeaks(c,c.dataset.pk,c.width,c.height));}
function sfield(label,key,v,o){o=o||{};return nf(label,'data-sk="'+key+'"'+(o.ms?' data-conv="ms"':''),v,o.min,o.max,o.step,o.sfx);}
function sselect(label,key,v,opts){return '<label class="f"><span>'+label+'</span><select data-sk="'+key+'">'+mopt(opts,v)+'</select></label>';}
function schk(label,key,v){return '<label class="f chk"><input type="checkbox" data-sk="'+key+'"'+(v?' checked':'')+'><span>'+label+'</span></label>';}
function smPanelHTML(){
  const s=smSample(); if(!s) return '<p class="empty">No sample selected.<br>Import audio, or press <b>Demo set</b>.</p>';
  const sm=smOf(s),b=BUF.get(s.id),sr=s.sr,md=sm.mode,u=sm.uni,used=S.zones.filter(z=>z.sample===s.id).length;
  const orig=sm.bars*barBeats(S.sig)*60/s.dur;
  let h='<div class="phead"><input type="text" class="pname" data-sk="s.name" value="'+esc(s.name)+'" aria-label="Sample name"><span class="badge">'+used+' zones</span></div>';
  h+=sec('Sample',sfield('Root key','s.root',s.root,{min:0,max:127,sfx:noteName(s.root)})+sfield('Fine tune','s.fine',s.fine||0,{min:-100,max:100,sfx:'cents'})
    +'<p class="hint">'+s.sr+' Hz · '+s.chn+' ch · '+s.dur.toFixed(2)+' s · '+s.frames.toLocaleString()+' frames</p><div class="chips"><button type="button" class="btn" data-sa="detect">Detect pitch</button></div>');
  h+=sec('Playback mode',sselect('Mode','sm.mode',md,MODES_S)+modeHTML(s,sm,orig));
  h+=sec('Sample unison',schk('Unison on','sm.uni.on',u.on)
    +(u.on?sselect('Type','sm.uni.mode',u.mode,[['detune','Detune (supersaw style)'],['octave','Octaves'],['fifth','Fifth and octave'],['chord','Custom chord']])
      +(u.mode==='chord'?'<label class="f"><span>Semitones</span><input type="text" data-sk="sm.uni.chord" value="'+esc(u.chord)+'"></label>':sfield('Voices','sm.uni.voices',u.voices,{min:1,step:1}))
      +sfield('Detune spread','sm.uni.detune',u.detune,{min:0,max:400,sfx:'cents'})+sfield('Stereo spread','sm.uni.spread',u.spread,{min:0,max:100,sfx:'%'})
      +(u.mode==='detune'?sfield('Centre blend','sm.uni.blend',u.blend,{min:0,max:100,sfx:'%'})+sselect('Spread curve','sm.uni.curve',u.curve,[['super','Supersaw (clustered)'],['linear','Even']]):'')
      +sfield('Random start','sm.uni.startRand',u.startRand,{min:0,max:200,sfx:'ms'})+sfield('Drift','sm.uni.drift',u.drift,{min:0,max:50,sfx:'cents'})
      +'<p class="hint">'+uniVoices(sm).length+' voices per note per zone'+(uniVoices(sm).length>32?'. That is a lot, expect heavy CPU use.':'.')+' Random start keeps the copies from combining into a hollow comb filter.</p>':'<p class="hint">Stack many copies of the sample, detuned and spread across the stereo field, like a supersaw but with your own recording.</p>'));
  h+=sec('Default loop',schk('Loop','loopOn',!!s.loop)+(s.loop?sfield('Loop start','s.loop.s',s.loop.s/sr*1000,{min:0,sfx:'ms',ms:1,step:1})+sfield('Loop end','s.loop.e',s.loop.e/sr*1000,{min:0,sfx:'ms',ms:1,step:1})
    +sfield('Crossfade','s.loop.xf',s.loop.xf/sr*1000,{min:0,sfx:'ms',ms:1,step:1})+'<div class="chips"><button type="button" class="btn" data-sa="findloop">Find a loop</button><button type="button" class="btn" data-sa="applyloop">Apply to its zones</button></div>':'')
    +'<p class="hint">New zones start with this loop. Drag the blue markers on the waveform.</p>');
  h+=sec('Edit (selection, or the whole sample)','<div class="chips">'+[['normalize','Normalize'],['fadein','Fade in'],['fadeout','Fade out'],['reverse','Reverse'],['silence','Silence'],['dc','Remove DC'],['trim','Trim to selection'],['cut','Cut selection']].map(o=>'<button type="button" class="btn" data-so="'+o[0]+'">'+o[1]+'</button>').join('')+'</div>'
    +'<label class="f"><span>Gain</span><input type="number" id="smGain" value="3" step="0.5"><em class="sfx">dB</em></label><div class="chips"><button type="button" class="btn" data-so="gain">Apply gain</button><button type="button" class="btn" data-so="undo">Undo</button><button type="button" class="btn danger" data-so="revert">Revert all</button></div>'
    +'<p class="hint">Drag on the waveform to select. Selections snap to zero crossings so cuts do not click (hold Shift to skip). '+(b&&b.undo?b.undo.length:0)+' undo steps.</p>');
  return h;
}
function modeHTML(s,sm,orig){
  const md=sm.mode;
  if(md==='speedkeep') return sfield('Speed','sm.sk.speed',sm.sk.speed,{min:10,max:400,sfx:'%'})+sfield('Grain size','sm.sk.grain',sm.sk.grain,{min:10,max:200,sfx:'ms'})
    +sselect('Quality','sm.sk.quality',sm.sk.quality,[['wsola','Clean (WSOLA)'],['ola','Fast (plain OLA)']])+schk('Follow the project tempo','sm.sk.sync',sm.sk.sync)
    +(sm.sk.sync?sfield('Bars in this sample','sm.bars',sm.bars,{min:.25,max:64,step:.25})+'<p class="hint">Original tempo: '+orig.toFixed(1)+' BPM, project: '+S.bpm+' BPM, so it plays at '+(S.bpm/orig*100).toFixed(0)+'% speed.</p>':'')
    +'<p class="hint">Playing higher or lower notes changes the pitch but not the speed. Speed changes the length but not the pitch.</p>';
  if(md==='slicer') return sfield('Sensitivity','sm.sens',sm.sens,{min:0,max:100,sfx:'%'})+'<div class="chips"><button type="button" class="btn" data-sa="detslices">Detect slices</button><button type="button" class="btn" data-sa="chop">Chop evenly</button><input type="number" id="smChop" value="8" min="2" max="256" style="width:56px" aria-label="Number of slices"><button type="button" class="btn" data-sa="clearslices">Clear</button></div>'
    +'<p class="hint">'+sm.slices.length+' slices. Use the Slice tool above, then click the waveform to add a marker. Drag markers to move them, Alt-click removes one.</p>'
    +'<label class="f"><span>First key</span><input type="number" id="smSliceKey" value="36" min="0" max="127"><em class="sfx">'+noteName(36)+'</em></label><div class="chips"><button type="button" class="btn" data-sa="mapslices">Map slices to keys</button></div>'
    +'<p class="hint">Each slice becomes a zone on its own key, in the group selected in the mapper.</p>';
  if(md==='wavetable') return sselect('Frame size','sm.wt.frame',sm.wt.frame,[256,512,1024,2048,4096].map(x=>[x,x+' samples']))
    +'<p class="hint">'+Math.floor(s.frames/sm.wt.frame)+' frames. The faint lines on the waveform show where each frame starts.</p>'
    +sfield('Position','sm.wt.pos',sm.wt.pos,{min:0,max:100,sfx:'%'})
    +'<label class="f"><span>Follow tag</span><select data-sk="sm.wt.tag"><option value="">— set by hand —</option>'+S.tags.map(t=>'<option value="'+t.id+'"'+(sm.wt.tag===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>'
    +schk('Sweep to another position','sweepOn',sm.wt.pos2>=0)+(sm.wt.pos2>=0?sfield('Sweep to','sm.wt.pos2',sm.wt.pos2,{min:0,max:100,sfx:'%'})+sfield('Sweep time','sm.wt.sweep',sm.wt.sweep,{min:50,max:20000,sfx:'ms'}):'');
  if(md==='granular') return sfield('Grain size','sm.gr.size',sm.gr.size,{min:10,max:500,sfx:'ms'})+sfield('Density','sm.gr.density',sm.gr.density,{min:1,max:200,sfx:'/s'})
    +sfield('Position','sm.gr.pos',sm.gr.pos,{min:0,max:100,sfx:'%'})+sfield('Position spread','sm.gr.spread',sm.gr.spread,{min:0,max:100,sfx:'%'})+sfield('Pitch jitter','sm.gr.jitter',sm.gr.jitter,{min:0,max:600,sfx:'cents'})
    +sselect('Grain shape','sm.gr.shape',sm.gr.shape,[['hann','Smooth (Hann)'],['tri','Triangle'],['rect','Flat with short fades']])+'<p class="hint">Plays a sustained cloud of tiny pieces from around the position. Great for pads and textures.</p>';
  return '<p class="hint">Plain sample playback: pitch and speed move together, with the interpolation you choose in the mapper.</p>';
}
function smPanelRender(){smLeftRender();$('#rbodyS').innerHTML=smPanelHTML();}
function selectSample(id){S.smp.sel=id;S.smp.a=S.smp.b=null;S.map.lastSample=id;smClampView();smFit();smPanelRender();smInvalidate();}
/* ---- events ---- */
$('#leftS').addEventListener('click',e=>{
  const b=e.target.closest('[data-sa]'); if(!b) return; const a=b.dataset.sa;
  if(a==='pick'){selectSample(b.dataset.s);}
  else if(a==='imp'){$('#fileAudio').value='';$('#fileAudio').click();}
  else if(a==='demo'){ensureAudio();demoSamples();touchMap();if(!S.smp.sel&&S.samples[0])S.smp.sel=S.samples[0].id;smPanelRender();smFit();flash('Demo set loaded');}
  else if(a==='demowt'){const s=demoExtras('wt');touchMap();smPanelRender();smFit();flash('Wavetable added. Play it with the keys A–K.');}
  else if(a==='demobeat'){const s=demoExtras('beat');touchMap();smPanelRender();smFit();flash('Beat loop added, '+smOf(s).slices.length+' slices found.');}
  else if(a==='dup'){
    const s=smSample(),bf=smBuf();if(!s)return;
    const n=addBuffer(s.name+' copy',bf.ch.map(d=>d.slice()),s.sr);n.root=s.root;n.fine=s.fine;n.loop=s.loop&&Object.assign({},s.loop);n.sm=JSON.parse(JSON.stringify(smOf(s)));selectSample(n.id);
  }
  else if(a==='del'){
    const s=smSample();if(!s)return;delZones(S.zones.filter(z=>z.sample===s.id).map(z=>z.id));
    S.samples=S.samples.filter(x=>x.id!==s.id);BUF.delete(s.id);S.smp.sel=S.samples[0]?S.samples[0].id:null;touchMap();smPanelRender();smFit();
  }
});
$('#fileAudio').addEventListener('change',()=>{if(S.view==='samples'){setTimeout(()=>{if(!S.smp.sel&&S.samples.length)S.smp.sel=S.samples[S.samples.length-1].id;smPanelRender();smFit();},500);}});
$('#rightS').addEventListener('click',e=>{
  const so=e.target.closest('[data-so]');
  if(so){const o=so.dataset.so;if(o==='undo')smUndo();else if(o==='gain')smOp('gain',parseFloat($('#smGain').value)||0);else smOp(o);return;}
  const b=e.target.closest('[data-sa]'); if(!b) return; const a=b.dataset.sa,s=smSample(); if(!s) return; const sm=smOf(s);
  if(a==='detect'){const p=detectPitch(s.id);if(!p){flash('Could not find a clear pitch');return;}s.root=p.midi;s.fine=-p.cents;touchMap();smPanelRender();flash('Detected '+noteName(p.midi)+(p.cents?' ('+(p.cents>0?'+':'')+p.cents+' cents)':''));}
  else if(a==='findloop'){const z=mkZone({sample:s.id,loop:{on:false,s:0,e:s.frames,xf:0,xcurve:'power',pp:false}});if(findLoop(z)){s.loop={s:z.loop.s,e:z.loop.e,xf:z.loop.xf};touchMap();smPanelRender();smInvalidate();flash('Loop placed on zero crossings');}else flash('That sample is too short to loop');}
  else if(a==='applyloop'){
    S.zones.forEach(z=>{if(z.sample===s.id&&s.loop){z.loop.on=true;z.loop.s=s.loop.s;z.loop.e=s.loop.e;z.loop.xf=s.loop.xf;}});touchMap();flash('Loop applied to '+S.zones.filter(z=>z.sample===s.id).length+' zones');
  }
  else if(a==='detslices'){sm.slices=detectTransients(s,sm.sens);touchMap();smPanelRender();smInvalidate();flash(sm.slices.length+' slices found');}
  else if(a==='chop'){const n=clamp(parseInt($('#smChop').value,10)||8,2,256);sm.slices=[];for(let i=0;i<n;i++)sm.slices.push(Math.round(i*s.frames/n));touchMap();smPanelRender();smInvalidate();}
  else if(a==='clearslices'){sm.slices=[];touchMap();smPanelRender();smInvalidate();}
  else if(a==='mapslices'){mapSlices(s,clamp(parseInt($('#smSliceKey').value,10)||36,0,127));}
});
function mapSlices(s,key0){
  const sm=smOf(s); if(!sm.slices.length){flash('No slices yet. Detect or chop first.');return;}
  const grp=ensureGroup();
  delZones(S.zones.filter(z=>z.sample===s.id&&z.slice!==undefined).map(z=>z.id));
  const made=[];
  sm.slices.forEach((f,i)=>{
    const k=key0+i; if(k>127) return;
    const nx=sm.slices[i+1],z=addZoneFor(s.id,k,k,{group:grp,root:k,keytrack:false,oneshot:true,start:Math.round(f/s.sr*1000),end:nx?Math.round(nx/s.sr*1000):0,slice:i,release:30});
    z.loop.on=false;made.push(z);
  });
  S.map.sel=made.map(z=>z.id);touchMap();mapInvalidate();flash(made.length+' slices mapped from '+noteName(key0)+' in the "'+grp+'" group. Open the Mapping tab to play them.');
}
function smApply(t,v){
  const s=smSample(); if(!s) return;
  const sm=smOf(s),key=t.dataset.sk,root={s,sm};
  let val=v; if(t.dataset.conv==='ms') val=Math.round(v/1000*s.sr);
  if(key==='loopOn'){s.loop=v?(s.loop||{s:Math.floor(s.frames*.3),e:Math.floor(s.frames*.9),xf:Math.min(Math.floor(s.sr*.1),Math.floor(s.frames*.1))}):null;touchMap();smInvalidate();return;}
  if(key==='sweepOn'){sm.wt.pos2=v?100:-1;touchMap();smInvalidate();return;}
  setPath(root,key,val);
  if(key==='s.name'){return;}
  if(key==='sm.mode'&&val==='slicer'&&!sm.slices.length) sm.slices=detectTransients(s,sm.sens);
  touchMap();smInvalidate();
}
$('#rbodyS').addEventListener('input',e=>{
  const t=e.target; if(!t.dataset.sk) return;
  if(t.type==='checkbox'||t.tagName==='SELECT') return;
  let v=t.type==='number'||t.type==='range'?parseFloat(t.value):t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  smApply(t,v);
  const sfx=t.parentElement.querySelector('.sfx');if(sfx&&t.dataset.sk==='s.root')sfx.textContent=noteName(v);
});
$('#rbodyS').addEventListener('change',e=>{
  const t=e.target; if(!t.dataset.sk) return;
  let v=t.type==='checkbox'?t.checked:t.tagName==='SELECT'&&/^\d+$/.test(t.value)&&t.dataset.sk==='sm.wt.frame'?parseInt(t.value,10):t.type==='number'?parseFloat(t.value):t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  smApply(t,v);smPanelRender();smLeftRender();
});
/* toolbar */
$('#smToolSel').addEventListener('click',()=>{S.smp.tool='select';smToolSync();});
$('#smToolSlice').addEventListener('click',()=>{S.smp.tool='slice';smToolSync();});
function smToolSync(){$('#smToolSel').setAttribute('aria-pressed',String(S.smp.tool==='select'));$('#smToolSlice').setAttribute('aria-pressed',String(S.smp.tool==='slice'));smInvalidate();}
$('#smRaw').addEventListener('click',()=>playRaw());
$('#smProc').addEventListener('click',()=>{const s=smSample();if(!s)return;previewOff(s.root);previewOn(s.root);setTimeout(()=>previewOff(s.root),1800);});
$('#smStop').addEventListener('click',()=>previewStopAll());
$('#smFit').addEventListener('click',()=>smFit());
$('#smZoomSel').addEventListener('click',()=>{const b=smBuf();if(!b||S.smp.a==null)return;const a=Math.min(S.smp.a,S.smp.b),c=Math.max(S.smp.a,S.smp.b);S.smp.fpp=(c-a)/SM.W;S.smp.sx=a;smClampView();smInvalidate();});
