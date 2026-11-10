/* ---------- switching a module on and off from the interface ----------
   n.byTag = {tag, inv, tails}: the module plays while the tag is on (or off, when reversed).
   With tails, switching off closes the module's input and lets reverb and delay tails fade naturally.
   The engine does the switching, so it works the same in the Maker and in VisuPlayer. */
function fxTagOff(n){
  const b=n.byTag,t=b&&b.tag&&tagById(b.tag);if(!t)return false;
  return (t.value>=.5)===!!b.inv;
}
function fxByTagHTML(n){
  const b=n.byTag||{},opts=S.tags.filter(t=>!t.sys||t.name==='page');
  let h='<label class="f"><span>On / off by</span><select data-fn="bytag" aria-label="Tag that switches '+esc(n.name)+' on and off"><option value="">— always on —</option>'
    +opts.map(t=>'<option value="'+t.id+'"'+(b.tag===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>';
  if(b.tag)h+='<label class="f chk"><input type="checkbox" data-fn="byinv"'+(b.inv?' checked':'')+'><span>Reverse: on while the tag is off</span></label>'
    +'<label class="f chk"><input type="checkbox" data-fn="bytails"'+(b.tails?' checked':'')+'><span>Let tails ring out when switched off</span></label>'
    +'<p class="hint">Now '+(fxTagOff(n)?'off':'on')+'. '+(NODEFX?'Turn the macro knob past halfway to switch it on (automate it in your DAW).':'A Toggle button on this tag in the Interface tab switches it; buttons, rules and knobs (past halfway) all work.')+'</p>';
  else if(NODEFX)h+='<p class="hint">Pick a macro knob: the module plays while the knob is past halfway.</p>';
  else h+='<div class="chips"><button type="button" class="btn" data-fa="mkbybtn">Make an on/off button</button></div><p class="hint">Adds a Toggle button with a light to your interface and links this module to it.</p>';
  return sec('Switch from the interface',h);
}
const fxInspHTMLBy=fxInspHTML;
fxInspHTML=function(){
  const h=fxInspHTMLBy(),g=curG(),n=S.fx.sel&&nodeById(g,S.fx.sel);
  if(!n||FXT[n.type].kind!=='fx')return h;
  const i=h.lastIndexOf('<div class="chips"><button type="button" class="btn" data-fa="byp"');
  return i<0?h+fxByTagHTML(n):h.slice(0,i)+fxByTagHTML(n)+h.slice(i);
};
document.addEventListener('change',e=>{
  const t=e.target,k=t.dataset&&t.dataset.fn;if(k!=='bytag'&&k!=='byinv'&&k!=='bytails')return;
  const n=nodeById(curG(),S.fx.sel);if(!n)return;
  if(k==='bytag'){if(t.value)n.byTag=Object.assign({inv:false,tails:false},n.byTag||{},{tag:t.value});else delete n.byTag;}
  else if(n.byTag)n.byTag[k==='byinv'?'inv':'tails']=t.checked;
  fxRender();
});
document.addEventListener('click',e=>{
  if(!e.target.closest('[data-fa="mkbybtn"]'))return;
  const n=nodeById(curG(),S.fx.sel);if(!n)return;
  /* a new knob-style tag (on) and a toggle button with a light, placed in the middle of the page being edited */
  const t=mkTag(n.name+' on','number',{value:1,def:1});S.tags.push(t);
  n.byTag={tag:t.id,inv:false,tails:/reverb|delay|echo|shimmer|spring|verb/i.test(n.type)};
  const el=mk('button',{name:n.name+' on/off',label:n.name,tag:t.id,mode:'toggle',led:true});
  el.w=Math.max(72,Math.min(160,10+n.name.length*9));el.x=Math.round((S.canvas.w-el.w)/2);el.y=Math.round((S.canvas.h-el.h)/2);
  S.els.push(el);const node=document.createElement('div');node.className='el button';node.dataset.id=el.id;canvas.appendChild(node);nodes.set(el.id,node);renderEl(el);renderLayers();
  fxRender();flash('Button "'+n.name+'" added to the Interface tab. Move it where you like.');
});
/* the editor shows the module as bypassed while its tag has it off */
const fxRefreshBy=fxRefreshParams;
fxRefreshParams=function(){
  fxRefreshBy();if(S.view!=='fx')return;
  curG().nodes.forEach(n=>{if(!n.byTag)return;const el=$('#centerF .fxn[data-id="'+n.id+'"]');if(!el)return;const off=n.bypass||fxTagOff(n);el.classList.toggle('bypass',off);const led=el.querySelector('.pled');if(led)led.classList.toggle('on',!off);});
};
