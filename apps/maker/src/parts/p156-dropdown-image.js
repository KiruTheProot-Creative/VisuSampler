/* ---------- Dropdown and Image elements: inspector, adding, dropping image files on the canvas ---------- */
function dropdownProps(el){
  const steppy=S.tags.filter(t=>t.kind!=='number'),t=tagById(el.tag),d=ddSteps(el);
  return sec('Link',H.sel('Tag','tag',el.tag,[['','— none —']].concat(steppy.map(x=>[x.id,x.name+(x.sys?' (built in)':'')])),true)
      +(t?'<p class="hint">'+d.steps.length+' choices: '+esc(d.steps.slice(0,6).join(', '))+(d.steps.length>6?'…':'')+'. Make a tag of type Steps in the Tags tab for your own choices (filter type, mode, page…).</p>'
        :'<p class="hint">Pick a tag with steps. Its step names become the menu: a Steps tag, a tempo-sync tag, the bank, the list, or the page tag.</p>'))
    +sec('Text',H.sel('Font','font',el.font,BUILTIN_FONTS.concat(Object.keys(S.fonts)))+H.range('Size','size',8,60,1,el.size)
      +H.sel('Weight','weight',el.weight||'600',[['400','Regular'],['600','Semibold'],['700','Bold']])+H.txt('Before the value','prefix',el.prefix||'')+H.color('Text colour','fg',el.fg))
    +sec('Look',H.range('Rounding','radius',0,30,1,el.radius)+H.range('Padding','pad',0,40,1,el.pad)+H.chk('Bevel','bevel',el.bevel!==false)+H.color('Arrow','arrowColor',el.arrowColor))
    +fillSec(el,'bg','Background')
    +sec('Open menu',H.color('Background','menuBg',el.menuBg)+H.color('Text','menuFg',el.menuFg)+H.color('Highlight','menuHi',el.menuHi)+H.range('Rows before scrolling','menuRows',3,16,1,el.menuRows||8)
      +'<p class="hint">In Test mode (and in the player) click to open, click a choice, or scroll over it to step through.</p>')
    +eventsHTML(el);
}
function imageProps(el){
  const a=el.img&&S.assets[el.img];
  return sec('Image',H.img('Image','img',el.img,Math.max(el.w,el.h),'PNG, JPG or SVG.')
      +H.sel('Fit','fit',el.fit||'contain',[['contain','Fit inside'],['cover','Fill (crop)'],['stretch','Stretch']])
      +(a?'<div class="chips"><button type="button" class="btn" data-act="imgnat">Original size ('+a.w+'×'+a.h+')</button><button type="button" class="btn" data-act="imgaspect">Fix aspect</button></div>':''))
    +sec('Look',H.range('Opacity','opacity',0,1,.01,el.opacity==null?1:el.opacity)+H.range('Rounding','radius',0,200,1,el.radius||0)
      +H.chk('Shadow (follows the light)','shadow',!!el.shadow)+H.chk('Flip horizontally','flipX',!!el.flipX)+H.chk('Flip vertically','flipY',!!el.flipY));
}
/* place an image element from an asset, sized to its shape, centred (or at a point) */
function addImageEl(id,at){
  const a=S.assets[id];if(!a)return;
  const k=Math.min(1,S.canvas.w*.6/a.w,S.canvas.h*.6/a.h),w=Math.max(12,Math.round(a.w*k)),h=Math.max(12,Math.round(a.h*k));
  const el=mk('image',{img:id,w,h,name:(a.name||'Image').replace(/\.[a-z0-9]+$/i,'')});
  el.x=Math.round(at?at.x-w/2:(S.canvas.w-w)/2);el.y=Math.round(at?at.y-h/2:(S.canvas.h-h)/2);
  S.els.push(el);const n=document.createElement('div');n.className='el image';n.dataset.id=el.id;canvas.appendChild(n);nodes.set(el.id,n);renderEl(el);select(el.id);
}
function readImageFile(f,cb){
  const rd=new FileReader();
  rd.onload=()=>{const img=new Image();img.onload=()=>{const id=nid('a');S.assets[id]=buildAsset(f.name,img,/svg/.test(f.type),rd.result);cb(id);};img.onerror=()=>flash('Could not read '+f.name);img.src=rd.result;};
  rd.readAsDataURL(f);
}
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-act="addimg"],[data-act="imgnat"],[data-act="imgaspect"]');if(!b)return;
  const el=sel(),a=b.dataset.act;
  if(a==='addimg'){pickImage(id=>addImageEl(id));return;}
  const as=el&&el.img&&S.assets[el.img];if(!as)return;
  if(a==='imgnat'){el.w=as.w;el.h=as.h;}else{el.h=Math.max(12,Math.round(el.w*as.h/as.w));}
  renderEl(el);placeSel();renderRight();
});
/* drop image files straight onto the canvas */
stageEl.addEventListener('dragover',e=>{if(S.view==='design'&&S.mode==='design'&&e.dataTransfer&&[...e.dataTransfer.items||[]].some(i=>i.kind==='file'&&/^image\//.test(i.type))){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
stageEl.addEventListener('drop',e=>{
  if(S.view!=='design'||S.mode!=='design')return;const files=[...(e.dataTransfer&&e.dataTransfer.files)||[]].filter(f=>/^image\//.test(f.type));if(!files.length)return;
  e.preventDefault();const r=canvas.getBoundingClientRect();let k=0;
  files.forEach(f=>readImageFile(f,id=>{addImageEl(id,{x:(e.clientX-r.left)/S.z+k*20,y:(e.clientY-r.top)/S.z+k*20});k++;}));
});
