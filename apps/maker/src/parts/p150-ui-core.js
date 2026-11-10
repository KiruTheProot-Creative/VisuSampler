/* ---------- inspector markup: core ---------- */
const H={
  range:(l,k,mn,mx,st,v)=>'<label class="f"><span>'+l+'</span><input type="range" data-k="'+k+'" min="'+mn+'" max="'+mx+'" step="'+st+'" value="'+v+'"><output>'+v+'</output></label>',
  num:(l,k,v,mn,mx,st,rb)=>'<label class="f"><span>'+l+'</span><input type="number" data-k="'+k+'" value="'+Math.round(v)+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+' step="'+(st||1)+'"'+(rb?' data-rb="1"':'')+'></label>',
  color:(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="color" data-k="'+k+'" value="'+v+'"></label>',
  sel:(l,k,v,opts,rb)=>'<label class="f"><span>'+l+'</span><select data-k="'+k+'"'+(rb?' data-rb="1"':'')+'>'+opts.map(o=>{const a=Array.isArray(o)?o:[o,o];return '<option value="'+esc(a[0])+'"'+(String(a[0])===String(v)?' selected':'')+'>'+esc(a[1])+'</option>';}).join('')+'</select></label>',
  chk:(l,k,v,rb)=>'<label class="f chk"><input type="checkbox" data-k="'+k+'"'+(v?' checked':'')+(rb?' data-rb="1"':'')+'><span>'+l+'</span></label>',
  txt:(l,k,v)=>'<label class="f"><span>'+l+'</span><input type="text" data-k="'+k+'" value="'+esc(v)+'"></label>',
  area:(l,k,v)=>'<label class="f col"><span>'+l+'</span><textarea data-k="'+k+'" rows="3">'+esc(v)+'</textarea></label>',
  img:(l,k,id,px,hint)=>{
    const a=id&&S.assets[id],m=a&&mipFor(id,px);
    return '<div class="f col"><span>'+l+'</span><div class="imgf">'
      +(a?'<img class="th" alt="" src="'+a.mips[0].url+'">':'<span class="th"></span>')
      +'<div class="imeta">'+(a?'<b>'+esc(a.name)+'</b><small>'+a.w+'×'+a.h+' px original'+(a.svg?' · vector':' · showing the '+m.s+' px size')+'</small>':'<b>Built-in</b><small>Drawn live, crisp at any size</small>')+'</div>'
      +'<div class="row"><button type="button" class="btn" data-act="pick" data-k="'+k+'">'+(a?'Replace':'Choose image')+'</button>'+(a?'<button type="button" class="btn" data-act="clear" data-k="'+k+'">Clear</button>':'')+'</div></div>'
      +(hint?'<p class="hint">'+hint+'</p>':'')+'</div>';
  }
};
function insRow(){
  return '<div class="ins"><select id="insTag" aria-label="Tag to insert">'+S.tags.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+'</option>').join('')+'</select><select id="insFmt" aria-label="Format">'+['number','percent','name','ms','id','number'].filter((v,i,a)=>a.indexOf(v)===i).map(f=>'<option>'+f+'</option>').join('')+'</select><button type="button" class="btn" data-act="ins">Insert live value</button></div>'
    +'<p class="hint">Typed by hand: <code>{cutoff.number}</code>, <code>{list.name}</code>, <code>{timesig}</code>. The colon form <code>{cutoff:number}</code> works too.</p>';
}
function propsHTML(){
  const el=sel();
  if(!el) return '<p class="empty">Nothing selected.<br>Click an element on the canvas or in Layers, or add one from the left.</p>';
  let h='<div class="phead"><input type="text" class="pname" data-k="name" value="'+esc(el.name)+'" aria-label="Element name"><span class="badge">'+el.type+'</span></div>'
    +'<div class="acts"><button type="button" class="btn" data-act="fwd">Forward</button><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="dup">Duplicate</button><button type="button" class="btn danger" data-act="del">Delete</button></div>';
  h+=sec('Transform',H.num('X','x',el.x)+H.num('Y','y',el.y)+H.num('Width','w',el.w,12,1920,1,1)+H.num('Height','h',el.h,12,1080,1,1)+(el.type==='knob'?'<p class="hint">Knobs stay square when resized.</p>':''));
  const fn={knob:knobProps,fader:faderProps,panel:panelProps,text:textProps,button:buttonProps,lcd:lcdProps,list:listProps,dropdown:dropdownProps,image:imageProps,graph:graphProps}[el.type];
  return h+fn(el);
}
function knobProps(el){
  const px=Math.ceil(Math.min(el.w,el.h)*S.z*dpr());
  let h=sec('Link',H.sel('Tag','tag',el.tag,tagOpts())+'<p class="hint">The tag drives rotation, ring and any text that shows its value.</p>');
  h+=sec('Layers',
    H.img('Lower · static','lower',el.lower,px)+H.img('Upper · moving','upper',el.upper,px)
    +H.sel('Ring','ringMode',el.ringMode,[['auto','Automatic fill'],['image','Custom image'],['none','No ring']],true)
    +(el.ringMode==='image'?H.img('Ring image','ringImg',el.ringImg,px,'Revealed along the sweep as the value rises.'):'')
    +(el.ringMode!=='none'?H.sel('Fill from','ringFrom',el.ringFrom,[['start','Start (normal)'],['center','Centre (pan, bipolar)']]):'')
    +(el.ringMode==='auto'?H.color('Ring colour','ringColor',el.ringColor)+H.range('Ring width','ringWidth',.03,.2,.01,el.ringWidth):''));
  h+=sec('Motion',H.range('Start angle','start',-360,360,1,el.start)+H.range('End angle','end',-360,360,1,el.end)
    +(el.upper?H.range('Pivot X','px',0,1,.01,el.px)+H.range('Pivot Y','py',0,1,.01,el.py):''));
  if(!el.lower||!el.upper) h+=sec('Built-in look',
    (!el.lower?H.color('Body colour','baseColor',el.baseColor):'')
    +(!el.upper?H.color('Cap colour','capColor',el.capColor)+H.sel('Pointer','ptrStyle',el.ptrStyle,[['line','Line'],['dot','Dot'],['none','None']])+H.color('Pointer colour','ptrColor',el.ptrColor):''));
  return h+eventsHTML(el);
}
function faderProps(el){
  const px=Math.ceil(Math.max(el.w,el.h)*S.z*dpr());
  let h=sec('Link',H.sel('Tag','tag',el.tag,tagOpts()));
  h+=sec('Layers',H.sel('Direction','orient',el.orient,[['v','Vertical'],['h','Horizontal']],true)
    +H.img('Lower · static','lower',el.lower,px)+H.img('Upper · moving','upper',el.upper,px)
    +H.range('Handle length','handleLen',.05,.5,.01,el.handleLen));
  if(!el.lower||!el.upper) h+=sec('Built-in look',
    (!el.lower?H.chk('Fill layer','fill',el.fill,true)+(el.fill?H.color('Fill colour','fillColor',el.fillColor):'')+H.color('Track colour','trackColor',el.trackColor):'')
    +(!el.upper?H.color('Handle colour','handleColor',el.handleColor):''));
  return h+eventsHTML(el);
}
function panelProps(el){
  const a=el.mat&&S.assets[el.mat];
  let h=fillSec(el,'fill','Colour')+sec('Edges',H.chk('Rounded edges','round',el.round,true)+(el.round?H.range('Rounding','radius',0,80,1,el.radius):''));
  h+=sec('Bevel and shadow',H.chk('Bevel','bevel',el.bevel,true)
    +(el.bevel?H.range('Bevel size','bevelSize',1,16,1,el.bevelSize)+H.sel('Direction','bevelDir',el.bevelDir,[['out','Outwards'],['in','Inwards']]):'')
    +H.chk('Drop shadow','shadow',el.shadow,true)
    +(el.shadow?H.range('Distance','shadowDist',0,40,1,el.shadowDist)+H.range('Blur','shadowBlur',0,60,1,el.shadowBlur):'')
    +'<p class="hint">Direction follows the project light angle.</p>');
  h+=sec('Material overlay','<div class="chips"><button type="button" class="btn'+(el.mat==='tex_noise'?' on':'')+'" data-act="mat" data-v="tex_noise">Noise</button><button type="button" class="btn'+(el.mat==='tex_brushed'?' on':'')+'" data-act="mat" data-v="tex_brushed">Brushed</button><button type="button" class="btn" data-act="pick" data-k="mat">Upload…</button><button type="button" class="btn" data-act="mat" data-v="">None</button></div>'
    +(a?'<p class="hint">'+esc(a.name)+' · '+a.w+'×'+a.h+' px. Any image works, it is converted to greyscale.</p>'
      +H.sel('Blend','matBlend',el.matBlend,['normal','multiply','overlay','soft-light','screen','hard-light'])
      +H.range('Opacity','matOpacity',0,1,.01,el.matOpacity)
      +H.sel('Mapping','matMode',el.matMode,[['tile','Tile'],['stretch','Stretch']],true)
      +(el.matMode==='tile'?H.range('Tile scale','matScale',.25,4,.05,el.matScale):''):''));
  return h;
}
function glyphCount(font){
  const set=new Set(); S.els.forEach(e=>{if(e.type==='text'&&e.font===font)for(const c of e.text)set.add(c);}); return set.size;
}
function textProps(el){
  const fonts=BUILTIN_FONTS.concat(Object.keys(S.fonts));
  const emb=S.fonts[el.font];
  const msg={ok:['ok','Embedding allowed. This font will travel inside the instrument file.'],restricted:['bad','This font forbids embedding, so it will not be packed into the instrument file.'],nosubset:['warn','Embeddable, but the font asks not to be subset, so the whole file is stored.'],unknown:['warn','Could not read the licence flag (WOFF is compressed). Check the font licence before shipping.']};
  let fi;
  if(emb){const m=msg[emb.lic];fi='<span class="chip '+m[0]+'">'+m[1]+'</span><p class="hint">'+(emb.size/1024).toFixed(0)+' KB source · '+glyphCount(el.font)+' glyphs used</p>';}
  else fi='<p class="hint">Preview font. On export only the glyphs you use are embedded in the instrument file.</p>';
  let h=sec('Content',H.area('Text','text',el.text)+insRow());
  h+=sec('Font',H.sel('Font','font',el.font,fonts.map(f=>[f,f+(S.fonts[f]?' (embedded)':'')]),true)
    +'<button type="button" class="btn" data-act="font">Embed a font file…</button>'+fi
    +H.range('Size','size',8,160,1,el.size)+H.sel('Weight','weight',el.weight,[['400','Regular'],['500','Medium'],['600','Semibold'],['700','Bold']])
    +H.color('Colour','color',el.color)+H.sel('Align','align',el.align,['left','center','right'],true)+H.range('Letter spacing','spacing',-2,20,.5,el.spacing));
  h+=sec('Effects',H.sel('Bevel','bevel',el.bevel,[['none','None'],['outer-raised','Outer · raised'],['outer-sunken','Outer · sunken'],['inner-raised','Inner · raised'],['inner-sunken','Inner · sunken']])
    +H.chk('Drop shadow','shadow',el.shadow)+H.chk('Glow','glow',el.glow,true)+(el.glow?H.color('Glow colour','glowColor',el.glowColor):''));
  return h;
}
