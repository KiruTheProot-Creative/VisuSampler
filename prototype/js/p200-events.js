/* ---------- events: rules engine and form ---------- */
const EVENTS={button:['press','release','hold','doubleclick'],knob:['change'],fader:['change'],list:['change','load']};
const VERBS=[['set','set'],['add','add'],['sub','subtract'],['toggle','toggle'],['next','next'],['prev','previous'],['reset','reset'],['random','random']];
const NOVAL=['toggle','next','prev','reset','random'];
let evDepth=0;
function parseValue(t,text){
  text=String(text==null?'':text).trim(); if(!text) return null;
  if(t.kind!=='number'){
    const st=stepsOf(t),n=st.length,i=st.findIndex(s=>s.toLowerCase()===text.toLowerCase());
    if(i>=0) return n>1?i/(n-1):0;
    const k=parseInt(text,10); if(!isNaN(k)&&k>=1&&k<=n) return n>1?(k-1)/(n-1):0;
    return null;
  }
  let v=parseFloat(text.replace(',','.')); if(isNaN(v)) return null;
  if(/%$/.test(text)&&t.unit!=='%') return clamp(v/100,0,1);
  if(/khz$/i.test(text)) v*=1000;
  return clamp(realToNorm(t,v),0,1);
}
function parseDelta(t,text){
  text=String(text==null?'':text).trim(); if(!text) return null;
  const v=parseFloat(text.replace(',','.')); if(isNaN(v)) return null;
  if(t.kind!=='number'){const n=stepCount(t);return n>1?v/(n-1):0;}
  if(/%$/.test(text)&&t.unit!=='%') return v/100;
  return realToNorm(t,realOf(t)+v)-t.value;
}
function testCond(c){
  const t=tagByName(c.tag); if(!t) return false;
  const pv=parseValue(t,c.val); if(pv===null) return false;
  if(c.op==='is') return Math.abs(pv-t.value)<.0015;
  if(c.op==='not') return Math.abs(pv-t.value)>=.0015;
  return c.op==='above'?t.value>pv:t.value<pv;
}
function runAct(a){
  const t=tagByName(a.tag); if(!t) return;
  switch(a.verb){
    case 'set': {const v=parseValue(t,a.val);if(v!==null)setTag(t,v);break;}
    case 'add': case 'sub': {const d=parseDelta(t,a.val);if(d!==null)setTag(t,t.value+(a.verb==='add'?d:-d));break;}
    case 'toggle': setTag(t,t.value>=.5?0:1); break;
    case 'next': stepBy(t,1); break;
    case 'prev': stepBy(t,-1); break;
    case 'reset': setTag(t,t.def); break;
    case 'random': {const n=stepCount(t);setTag(t,n>1?Math.floor(Math.random()*n)/(n-1):Math.random());break;}
  }
}
function fireEvent(el,ev){
  if(!el.rules||!el.rules.length||evDepth>6) return;
  evDepth++;
  try{
    el.rules.forEach(r=>{
      if(r.when!==ev) return;
      if(r.cond&&!testCond(r.cond)) return;
      r.acts.forEach(runAct);
    });
  }finally{evDepth--;}
}
function actText(a){
  switch(a.verb){
    case 'set': return a.tag+' = '+(a.val||'?');
    case 'add': return a.tag+' + '+(a.val||'?');
    case 'sub': return a.tag+' - '+(a.val||'?');
    default: return a.tag+'.'+a.verb;
  }
}
function ruleText(r){
  const ops={is:'=',not:'!=',above:'>',below:'<'};
  return '{on.'+r.when+' -> '+(r.cond?'if '+r.cond.tag+' '+ops[r.cond.op]+' '+r.cond.val+' -> ':'')+r.acts.map(actText).join(' ; ')+'}';
}
const defTag=()=>S.tags.find(t=>!t.sys)||S.tags[0];
const defVal=name=>{const t=tagByName(name);return t&&t.kind!=='number'?stepsOf(t)[0]:'50%';};
function tagSelect(cur,rk,ri,ai){
  return '<select data-rk="'+rk+'" data-ri="'+ri+'"'+(ai!==undefined?' data-ai="'+ai+'"':'')+'>'+S.tags.map(t=>'<option'+(t.name===cur?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select>';
}
function valControl(a,rk,ri,ai,cur){
  const t=tagByName(a.tag||'');
  const attrs=' data-rk="'+rk+'" data-ri="'+ri+'"'+(ai!==undefined?' data-ai="'+ai+'"':'');
  if(t&&t.kind!=='number'&&(rk==='cval'||a.verb==='set')){
    return '<select'+attrs+'>'+stepsOf(t).map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select>';
  }
  return '<input type="text"'+attrs+' value="'+esc(cur||'')+'" placeholder="50% or 440 Hz">';
}
function ruleHTML(r,ri,evs){
  let h='<div class="rule"><div class="rh"><label>When <select data-rk="when" data-ri="'+ri+'">'+evs.map(e=>'<option'+(e===r.when?' selected':'')+'>'+e+'</option>').join('')+'</select></label><button type="button" class="x" data-ev="delRule" data-ri="'+ri+'" aria-label="Remove event" title="Remove event">✕</button></div>';
  if(r.cond){
    h+='<div class="rc"><span>If</span>'+tagSelect(r.cond.tag,'ctag',ri)+'<select data-rk="cop" data-ri="'+ri+'">'+[['is','is'],['not','is not'],['above','above'],['below','below']].map(o=>'<option value="'+o[0]+'"'+(o[0]===r.cond.op?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+valControl(r.cond,'cval',ri,undefined,r.cond.val)+'<button type="button" class="x" data-ev="noCond" data-ri="'+ri+'" aria-label="Remove condition" title="Remove condition">✕</button></div>';
  }else h+='<button type="button" class="lnk" data-ev="addCond" data-ri="'+ri+'">+ add condition</button>';
  r.acts.forEach((a,ai)=>{
    h+='<div class="ra"><select data-rk="verb" data-ri="'+ri+'" data-ai="'+ai+'">'+VERBS.map(v=>'<option value="'+v[0]+'"'+(v[0]===a.verb?' selected':'')+'>'+v[1]+'</option>').join('')+'</select>'+tagSelect(a.tag,'atag',ri,ai)+(NOVAL.indexOf(a.verb)>=0?'':'<span>'+(a.verb==='set'?'to':'by')+'</span>'+valControl(a,'val',ri,ai,a.val))+'<button type="button" class="x" data-ev="delAct" data-ri="'+ri+'" data-ai="'+ai+'" aria-label="Remove action" title="Remove action">✕</button></div>';
  });
  h+='<button type="button" class="lnk" data-ev="addAct" data-ri="'+ri+'">+ add action</button><code class="rtxt">'+esc(ruleText(r))+'</code></div>';
  return h;
}
function eventsHTML(el){
  const evs=EVENTS[el.type]; if(!evs) return '';
  if(!el.rules) el.rules=[];
  return sec('Events',el.rules.map((r,ri)=>ruleHTML(r,ri,evs)).join('')+'<button type="button" class="btn" data-ev="addRule">+ Add event</button><p class="hint">Rules run top to bottom in Test mode. The grey line is the same rule in short text syntax.</p>');
}
function applyRk(t,rk){
  const el=sel(); if(!el||!el.rules) return;
  const r=el.rules[+t.dataset.ri]; if(!r) return;
  const a=t.dataset.ai!==undefined?r.acts[+t.dataset.ai]:null;
  if(rk==='when') r.when=t.value;
  else if(rk==='ctag'&&r.cond){r.cond.tag=t.value;r.cond.val=defVal(t.value);}
  else if(rk==='cop'&&r.cond) r.cond.op=t.value;
  else if(rk==='cval'&&r.cond) r.cond.val=t.value;
  else if(a&&rk==='verb'){a.verb=t.value;a.val=a.verb==='set'?defVal(a.tag):'';}
  else if(a&&rk==='atag'){a.tag=t.value;a.val=a.verb==='set'?defVal(a.tag):'';}
  else if(a&&rk==='val') a.val=t.value;
}
rbody.addEventListener('change',e=>{
  const t=e.target,rk=t.dataset&&t.dataset.rk; if(!rk) return;
  applyRk(t,rk); renderRight();
});
rbody.addEventListener('input',e=>{
  const t=e.target; if(!t.dataset||t.tagName!=='INPUT'||(t.dataset.rk!=='val'&&t.dataset.rk!=='cval')) return;
  applyRk(t,t.dataset.rk);
  const el=sel(),rule=t.closest('.rule'),code=rule&&$('.rtxt',rule);
  if(code&&el) code.textContent=ruleText(el.rules[+t.dataset.ri]);
});
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-ev]'); if(!b) return;
  const el=sel(); if(!el||!el.rules) return;
  const ri=+b.dataset.ri,r=el.rules[ri],act=b.dataset.ev,dt=defTag();
  if(act==='addRule') el.rules.push({when:EVENTS[el.type][0],cond:null,acts:[{verb:'set',tag:dt.name,val:defVal(dt.name)}]});
  else if(act==='delRule') el.rules.splice(ri,1);
  else if(act==='addCond'&&r) r.cond={tag:dt.name,op:'is',val:defVal(dt.name)};
  else if(act==='noCond'&&r) r.cond=null;
  else if(act==='addAct'&&r) r.acts.push({verb:'set',tag:dt.name,val:defVal(dt.name)});
  else if(act==='delAct'&&r){r.acts.splice(+b.dataset.ai,1);}
  renderRight();
});
