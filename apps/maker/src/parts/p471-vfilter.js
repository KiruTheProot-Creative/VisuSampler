/* ---- per-note filter and LFO for the group (the engine runs one per note) ----
   The filter has its own envelope; velocity, key and the envelope move the cutoff in semitones.
   The LFO starts with each note and can wobble the cutoff, the pitch (vibrato) and the volume (tremolo). */
const VF_DEF={on:false,type:'lp12',cutoff:8000,res:0,key:0,vel:0,env:0,a:5,d:300,s:0,r:300,tags:{}};
const VL_DEF={on:false,shape:'sine',rate:5,delay:0,cut:0,pitch:0,vol:0};
const VF_TYPES=[['lp12','Low-pass 12 dB'],['lp24','Low-pass 24 dB'],['hp','High-pass'],['bp','Band-pass'],['notch','Notch']];
const vfOf=c=>{const f=Object.assign({},VF_DEF,c.vfilter||{});f.tags=Object.assign({},f.tags||{});return f;};
const vlOf=c=>Object.assign({},VL_DEF,c.vlfo||{});
function snVfHTML(c){
  const f=vfOf(c),l=vlOf(c),knobs=[['','no knob']].concat(S.tags.filter(t=>!t.sys&&t.kind==='number').map(t=>[t.id,t.name]));
  const num=(k,lab,mn,mx,st,u,o,attr)=>'<label class="f"><span>'+lab+'</span><input type="number" '+attr+'="'+k+'" min="'+mn+'" max="'+mx+'" step="'+st+'" value="'+o[k]+'"'+(attr==='data-vf'&&f.tags[k]?' disabled':'')+'><em class="sfx">'+u+'</em></label>';
  const knobRow=(k,lab,mn,mx,st,u)=>'<div class="envrow">'+num(k,lab,mn,mx,st,u,f,'data-vf')+'<select data-vftag="'+k+'" aria-label="Knob for '+lab+'">'+mopt(knobs,f.tags[k]||'')+'</select></div>';
  let h='<div class="snenv snvf"><label class="f chk"><input type="checkbox" data-vf="on"'+(f.on?' checked':'')+'><span>Filter (one per note)</span></label>';
  if(f.on){
    h+='<label class="f"><span>Type</span><select data-vf="type">'+mopt(VF_TYPES,f.type)+'</select></label>'
      +knobRow('cutoff','Cutoff',20,20000,1,'Hz')+knobRow('res','Resonance',0,100,1,'%')
      +num('key','Key tracking',0,100,1,'%',f,'data-vf')+num('vel','Velocity',-96,96,1,'st',f,'data-vf')
      +'<p class="hint">Velocity: how far the hardest note moves the cutoff. Key tracking at 100 % moves it with the keys (from C4).</p>'
      +num('env','Envelope amount',-96,96,1,'st',f,'data-vf')
      +(f.env?envSvg({a:f.a,d:f.d,s:f.s,r:f.r})+num('a','Attack',0,10000,1,'ms',f,'data-vf')+num('d','Decay',0,10000,1,'ms',f,'data-vf')+num('s','Sustain',0,100,1,'%',f,'data-vf')+num('r','Release',0,10000,1,'ms',f,'data-vf'):'')
      +'<p class="hint">A knob on cutoff sweeps 20 Hz – 20 kHz, on resonance 0–100 %; held notes follow it live.</p>';
  }
  h+='</div><div class="snenv snvl"><label class="f chk"><input type="checkbox" data-vl="on"'+(l.on?' checked':'')+'><span>LFO (one per note)</span></label>';
  if(l.on){
    h+='<label class="f"><span>Shape</span><select data-vl="shape">'+mopt([['sine','Sine'],['tri','Triangle']],l.shape)+'</select></label>'
      +num('rate','Rate',.01,40,.1,'Hz',l,'data-vl')+num('delay','Fade in',0,10000,1,'ms',l,'data-vl')
      +num('pitch','To pitch',0,1200,1,'cents',l,'data-vl')+num('vol','To volume',0,100,1,'%',l,'data-vl')
      +(f.on?num('cut','To cutoff',0,96,1,'st',l,'data-vl'):'')
      +'<p class="hint">Starts fresh with every note. Pitch makes vibrato, volume makes tremolo'+(f.on?', cutoff makes the filter wobble':'')+'.</p>';
  }
  return h+'</div>';
}
$('#snInsGroup').addEventListener('change',e=>{
  const t=e.target,g=S.map.group;if(!g||!(t.dataset.vf||t.dataset.vftag||t.dataset.vl))return;
  const c=gcfg(g);
  if(t.dataset.vl){const l=vlOf(c),k=t.dataset.vl;
    if(k==='on')l.on=t.checked;else if(k==='shape')l[k]=t.value;else{const v=parseFloat(t.value);l[k]=isFinite(v)?Math.max(+t.min,Math.min(+t.max,v)):VL_DEF[k];}
    c.vlfo=l;}
  else{const f=vfOf(c),k=t.dataset.vf;
    if(t.dataset.vftag){if(t.value)f.tags[t.dataset.vftag]=t.value;else delete f.tags[t.dataset.vftag];}
    else if(k==='on')f.on=t.checked;else if(k==='type')f.type=t.value;
    else{const v=parseFloat(t.value);f[k]=isFinite(v)?Math.max(+t.min,Math.min(+t.max,v)):VF_DEF[k];}
    c.vfilter=f;}
  touchMap();$('#snInsGroup').innerHTML=snGroupHTML();
});
