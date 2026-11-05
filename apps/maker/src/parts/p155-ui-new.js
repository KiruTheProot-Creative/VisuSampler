/* ---------- inspector markup: buttons, LCD, list, tags, project ---------- */
function looksRow(){
  return '<div class="chips">'+Object.keys(LOOKS).map(k=>'<button type="button" class="btn" data-act="lcdlook" data-v="'+k+'">'+k[0].toUpperCase()+k.slice(1)+'</button>').join('')+'</div>';
}
function buttonProps(el){
  let h=sec('Behaviour',H.sel('Mode','mode',el.mode,[['momentary','Momentary'],['toggle','Toggle'],['radio','Radio (picks a step)']],true)
    +H.sel('Tag','tag',el.tag,tagOpts())
    +(el.mode==='radio'?H.num('Step','value',el.value,0,999,1)+'<p class="hint">Step 0 is the first value (bank A on the bank tag).</p>':'')
    +(el.mode==='toggle'?'<p class="hint">Toggles the tag between 0 and 1.</p>':''));
  h+=sec('Label',H.txt('Label','label',el.label)+H.sel('Font','font',el.font,BUILTIN_FONTS)+H.range('Size','size',8,60,1,el.size)
    +H.sel('Weight','weight',el.weight,[['400','Regular'],['700','Bold']])+H.color('Text colour','textColor',el.textColor));
  h+=sec('Look',H.color('Colour','color',el.color)+H.range('Rounding','radius',0,40,1,el.radius)+H.range('Bevel size','bevelSize',1,10,1,el.bevelSize)
    +H.chk('LED','led',el.led,true)+((el.led||el.auto)?H.color('Lit colour','ledColor',el.ledColor):''));
  h+=sec('Automatic states',H.chk('Generate states','auto',el.auto,true)
    +(el.auto?H.range('Hover brighten','hover',0,30,1,el.hover)+H.range('Press darken','press',0,40,1,el.press)+H.range('Press travel','travel',0,4,.5,el.travel)
      +H.sel('Preview','preview',el.preview,[['auto','Live'],['normal','Normal'],['hover','Hover'],['down','Pressed'],['on','On']])
      +'<p class="hint">Pressed and On flip the bevel inward, so they follow the light angle. Pressed also darkens. On adds a lit tint.</p>':'<p class="hint">Off: the button keeps one look in every state.</p>'));
  return h+eventsHTML(el);
}
function fillSec(el,key,label){
  const m=el.fillMode||'solid';
  return sec('Fill',H.sel('Fill','fillMode',m,[['solid','Colour'],['gradient','Gradient'],['image','Image']],true)
    +H.color(m==='gradient'?'From':label||'Colour',key,el[key])
    +(m==='gradient'?H.color('To','fill2',el.fill2||'#000000')+H.chk('Follow the light angle','gradLight',el.gradLight!==false,true)+(el.gradLight===false?H.range('Angle','gradAngle',0,360,1,el.gradAngle||180):''):'')
    +(m==='image'?H.img('Image','bgImg',el.bgImg,Math.max(el.w,el.h),'PNG, JPG or SVG. Your own artwork works: a scanned screen, brushed metal, a photo.')
      +H.sel('Fit','bgFit',el.bgFit||'cover',[['cover','Fill (crop)'],['contain','Fit inside'],['stretch','Stretch'],['tile','Tile']]):''));
}
function lcdLook(el,extra){
  const scr=el.screen!==false;
  return sec('Look',looksRow()+H.color('Text colour','fg',el.fg)+H.range('Glow','glow',0,14,1,el.glow)+H.range('Rounding','radius',0,30,1,el.radius)+H.range('Padding','pad',0,40,1,el.pad))
    +fillSec(el,'bg','Background')
    +sec('LCD screen',H.chk('Screen effect (bezel and pixels)','screen',scr,true)
      +(scr?H.chk('Pixel grid','grid',el.grid,true)+(el.grid?H.range('Grid strength','gridAmt',.04,.5,.01,el.gridAmt):'')+(extra||''):''));
}
function lcdProps(el){
  return sec('Content',H.area('Text','text',el.text)+insRow())
    +sec('Text',H.sel('Font','font',el.font,BUILTIN_FONTS.concat(Object.keys(S.fonts))) +H.range('Size','size',8,120,1,el.size)+H.sel('Align','align',el.align,['left','center','right'],true))
    +lcdLook(el,H.chk('Scanlines','scan',el.scan));
}
function listProps(el){
  return sec('List',H.range('Visible rows','rows',2,16,1,el.rows)+H.chk('Show numbers (A01)','numbers',el.numbers)
    +H.sel('Selected row','selStyle',el.selStyle,[['invert','Inverted'],['arrow','Arrow'],['box','Outline']])
    +H.sel('Font','font',el.font,BUILTIN_FONTS.concat(Object.keys(S.fonts)))+H.range('Font size (0 = auto)','size',0,80,1,el.size)
    +'<p class="hint">Bound to the built-in list and bank tags, no setup needed. In Test mode click a row or scroll to choose. Edit the lists in the Lists tab.</p>')
    +lcdLook(el,H.chk('Scanlines','scan',el.scan))+eventsHTML(el);
}
function tagRow(t){
  const targets=[['none','Nothing'],['volume','Volume'],['cutoff','Filter cutoff'],['resonance','Filter resonance'],['wave','Waveform']];
  const opt=(arr,v)=>arr.map(a=>'<option value="'+a[0]+'"'+(a[0]===v?' selected':'')+'>'+a[1]+'</option>').join('');
  if(t.sys){
    return '<section class="tag sys" data-tid="'+t.id+'"><div class="t1"><span class="tname lock">'+t.name+'</span><span class="badge">built-in</span></div>'
      +'<p class="hint" style="margin:0 0 6px">'+(t.kind==='bank'?'The selected bank. Bank buttons and MIDI can drive it.':'The selected list in the current bank. The list selector, an encoder knob, and program change can drive it.')+'</p>'
      +'<div class="tprev"><input type="range" class="tv" min="0" max="1" step="0.001" value="'+t.value+'" aria-label="Test value"><output class="tr">'+esc(fmtTag(t,'name'))+'</output></div>'
      +'<div class="tuse"><span>Used by '+(S.els.filter(e=>e.tag===t.id||(t.kind==='list'&&e.type==='list')).length)+' elements</span></div></section>';
  }
  const kinds=[['number','Number'],['steps','Named steps'],['sync','Tempo sync']];
  let extra='';
  if(t.kind==='number') extra='<label>Min<input type="number" data-tk="min" value="'+t.min+'"></label><label>Max<input type="number" data-tk="max" value="'+t.max+'"></label>'
    +'<label>Unit<input type="text" data-tk="unit" value="'+esc(t.unit)+'" placeholder="Hz, dB, ms"></label><label>Decimals<input type="number" data-tk="dec" min="0" max="4" value="'+t.dec+'"></label>'
    +'<label class="wide">Scaling<select data-tk="scale"><option value="linear"'+(t.scale==='linear'?' selected':'')+'>Linear</option><option value="log"'+(t.scale==='log'?' selected':'')+'>Logarithmic (needs min above 0)</option></select></label>';
  else if(t.kind==='steps') extra='<label class="wide">Step names, comma separated<input type="text" data-tk="steps" value="'+esc(t.steps.join(', '))+'"></label>';
  else extra='<label class="wide">Counts in<select data-tk="basis" data-rb="1"><option value="note"'+(t.basis==='note'?' selected':'')+'>Note values (1/8, 1/4T …)</option><option value="bar"'+(t.basis==='bar'?' selected':'')+'>Fractions of a bar (follows the time signature)</option></select></label>';
  return '<section class="tag" data-tid="'+t.id+'"><div class="t1"><input type="text" class="tname" data-tk="name" value="'+esc(t.name)+'" aria-label="Tag name"><button type="button" class="x" data-act="delTag" title="Delete tag" aria-label="Delete tag">✕</button></div>'
    +'<div class="tgrid"><label>Type<select data-tk="kind" data-rb="1">'+opt(kinds,t.kind)+'</select></label><label>Drives audio<select data-tk="target">'+opt(targets,t.target)+'</select></label>'+extra+'</div>'
    +'<div class="tprev"><input type="range" class="tv" min="0" max="1" step="0.001" value="'+t.value+'" aria-label="Test value"><output class="tr">'+esc(fmtTag(t,'number'))+'</output></div>'
    +'<div class="tuse"><span>Used by '+(S.els.filter(e=>e.tag===t.id).length+usesTagText(t.name))+'</span><button type="button" class="btn" data-act="tagDef">Set default to this</button></div></section>';
}
function tagsHTML(){
  return '<p class="hint" style="margin-top:0">A tag is one value that knobs, faders, buttons, text, FX parameters and audio can all share. Add as many as you need.</p>'
    +'<p style="margin:0 0 10px"><button type="button" class="btn" data-act="addTag">+ New tag</button> <span class="muted">'+S.tags.length+' tags</span></p>'
    +S.tags.map(tagRow).join('')
    +sec('Text syntax','<div class="syn"><code>{tag.number}</code> real value and unit<br><code>{tag.percent}</code> 0 to 100%<br><code>{tag.name}</code> step name or note value<br><code>{tag.ms}</code> synced time at the current BPM<br><code>{tag.4/4}</code> same, in a pinned time signature<br><code>{list.name}</code> <code>{list.id}</code> <code>{list.number}</code><br><code>{list.next.name}</code> <code>{list.prev.name}</code><br><code>{list.count}</code> <code>{list.loading}</code><br><code>{bank.letter}</code> <code>{bank.name}</code><br><code>{timesig}</code> <code>{timesig.bar}</code> <code>{bpm}</code><br><code>{display.4/4}</code> one bar of 4/4 in ms</div><p class="hint">The older <code>{tag:format}</code> form is accepted too. Unknown tags show in red on the canvas.</p>');
}
function projectHTML(){
  const opts=(arr,v)=>arr.map(a=>'<option'+(a===v?' selected':'')+'>'+a+'</option>').join('');
  const nums=[];for(let i=1;i<=16;i++)nums.push(i);
  return sec('Canvas','<label class="f"><span>Background</span><input type="color" data-p="bg" value="'+S.canvas.bg+'"></label><p class="hint">Size is set in the bar above the canvas, up to 1920 × 1080.</p>')
    +sec('Lighting','<label class="f"><span>Light angle</span><input type="range" data-p="light" min="0" max="359" step="1" value="'+S.light+'"><output>'+S.light+'°</output></label><p class="hint">Every bevel, shadow, button state and bevelled text agrees on one light. 315° is from the top left.</p>')
    +sec('Tempo and time signature','<label class="f"><span>BPM</span><input type="number" data-p="bpm" min="40" max="300" value="'+S.bpm+'"></label>'
      +'<label class="f"><span>Time signature</span><span class="sigrow"><select data-p="sigN" aria-label="Beats per bar">'+opts(nums,S.sig.n)+'</select><b>/</b><select data-p="sigD" aria-label="Note value">'+opts([2,4,8,16],S.sig.d)+'</select></span></label>'
      +'<p class="hint">In the plugin both follow the host. Standalone they use these settings. One bar = '+msStr(msOfBeats(barBeats(S.sig)))+' now.</p>')
    +sec('Share','<div class="chips"><button type="button" class="btn" data-act="copyJson">Copy project JSON</button></div><textarea id="jsonOut" readonly hidden aria-label="Project JSON"></textarea><p class="hint">Images are listed by name and size only, not embedded.</p>');
}
function renderRight(){
  $$('#rightD .rtabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===S.tab)));
  $('#tagCount').textContent=S.tags.length;
  $('#listCount').textContent=S.lists.length;
  rbody.innerHTML=S.tab==='props'?propsHTML():S.tab==='tags'?tagsHTML():S.tab==='lists'?listsHTML():projectHTML();
}
