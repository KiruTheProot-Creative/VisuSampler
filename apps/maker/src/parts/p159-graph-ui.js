/* ---------- Graph element: inspector, the Maker's live audio and the waveform peaks ---------- */
const GKINDS=[['env','Envelope (ADSR from knobs)'],['filter','Filter curve (from knobs)'],['wave','Waveform of the patch'],['scope','Oscilloscope (live output)'],['spectrum','Spectrum (live output)']];
function graphProps(el){
  const num=S.tags.filter(t=>!t.sys&&t.kind==='number'),opts=[['','— fixed —']].concat(num.map(t=>[t.id,t.name]));
  const gsel=(l,path,v,o)=>'<label class="f"><span>'+l+'</span><select data-gk="'+path+'">'+o.map(a=>'<option value="'+esc(a[0])+'"'+(String(a[0])===String(v==null?'':v)?' selected':'')+'>'+esc(a[1])+'</option>').join('')+'</select></label>';
  const gnum=(l,path,v,mn,mx,st)=>'<label class="f"><span>'+l+'</span><input type="number" data-gk="'+path+'" value="'+v+'" min="'+mn+'" max="'+mx+'" step="'+st+'"></label>';
  let what='';
  if(el.kind==='env'){const g=el.env||{};what=gsel('Attack knob','env.a',g.a,opts)+gsel('Decay knob','env.d',g.d,opts)+gsel('Sustain knob','env.s',g.s,opts)+gsel('Release knob','env.r',g.r,opts)
    +'<p class="hint">Pick the knobs that set your envelope: the curve follows them, the same way the sound does.</p>';}
  else if(el.kind==='filter'){const f=el.filt||{};what=gsel('Type','filt.type',f.type||'lp',[['lp','Low-pass 12 dB'],['lp24','Low-pass 24 dB'],['hp','High-pass'],['bp','Band-pass'],['notch','Notch']])
    +gsel('Cutoff knob','filt.cut',f.cut,opts)+(f.cut?'':gnum('Cutoff (Hz)','filt.hz',f.hz||2000,20,20000,1))
    +gsel('Resonance knob','filt.res',f.res,opts)+(f.res?'':gnum('Resonance (0–1)','filt.resv',f.resv||0,0,1,.01))
    +'<p class="hint">A knob on cutoff sweeps 20 Hz – 20 kHz, like the per-note filter.</p>';}
  else if(el.kind==='wave')what=(layerBOn()?H.sel('Side','layer',el.layer||0,[[0,'A'],[1,'B']]):'')+'<p class="hint">Shows the sample of the patch that plays now and changes with it.</p>';
  else if(el.kind==='scope')what=H.range('Time shown (samples)','span',128,2048,32,el.span||512)+H.range('Zoom','gain',.5,8,.1,el.gain||1)+'<p class="hint">Moves with the sound while you play (in Test mode and in the player).</p>';
  else what=H.sel('Draw as','style',el.style||'line',[['line','Line'],['bars','Bars']])+H.range('Bands','bars',16,256,1,el.bars||64)+H.range('Fall time','smooth',0,.97,.01,el.smooth==null?.7:el.smooth)
    +'<p class="hint">20 Hz on the left to 20 kHz on the right.</p>';
  return sec('Graph',H.sel('Shows','kind',el.kind,GKINDS,true)+what)
    +sec('Line',H.color('Colour','line',el.line)+H.range('Width','lineW',.5,8,.5,el.lineW)+H.range('Glow','glow',0,30,1,el.glow)
      +H.chk('Fill under the line','fillOn',el.fillOn,true)+(el.fillOn?H.color('Fill colour','fill',el.fill)+H.range('Fill strength','fillAmt',0,1,.01,el.fillAmt):''))
    +sec('Background',H.chk('Background','bgOn',el.bgOn!==false,true)+(el.bgOn!==false?H.color('Colour','bg',el.bg):'')
      +H.chk('Grid','grid',el.grid)+H.chk('Border','border',el.border,true)+(el.border?H.color('Border colour','borderColor',el.borderColor):'')+H.range('Rounding','radius',0,40,1,el.radius));
}
rbody.addEventListener('change',e=>{
  const t=e.target,path=t.dataset.gk,el=sel();if(!path||!el||el.type!=='graph')return;
  const [o,k]=path.split('.');el[o]=Object.assign({},el[o]||{});
  const v=t.type==='number'?parseFloat(t.value):t.value;
  if(v===''||(typeof v==='number'&&isNaN(v)))delete el[o][k];else el[o][k]=v;
  renderEl(el);renderRight();
});
/* the Maker feeds live graphs from its audio engine */
GRAPH.pull=()=>{
  const E=typeof ENG!=='undefined'?ENG:null;if(!E||E.native||!E.out||!E.out.context)return null;
  if(!GRAPH.an||GRAPH.an.context!==E.out.context){GRAPH.an=E.out.context.createAnalyser();GRAPH.an.fftSize=4096;E.out.connect(GRAPH.an);GRAPH.buf=new Float32Array(4096);GRAPH.sr=E.out.context.sampleRate;}
  GRAPH.an.getFloatTimeDomainData(GRAPH.buf);return GRAPH.buf;
};
/* waveform peaks of a group: its zone nearest middle C */
function groupPeaks(g,n){
  const zs=S.zones.filter(z=>z.group===g&&!z.mute);if(!zs.length)return null;
  zs.sort((a,b)=>Math.abs((a.lo+a.hi)/2-60)-Math.abs((b.lo+b.hi)/2-60));
  const b=BUF.get(zs[0].sample);if(!b||!b.ch)return null;return peaksOf(b.ch,n||300);
}
GRAPH.peaksOf=g=>groupPeaks(g,300);
/* native audio sends its output for live graphs only while one is on show */
GRAPH.wantScope=on=>{if(!ENG.native||!ENG.node||ENG.scopeSent===on)return;ENG.scopeSent=on;ENG.node.port.postMessage({t:'scope',on});};
