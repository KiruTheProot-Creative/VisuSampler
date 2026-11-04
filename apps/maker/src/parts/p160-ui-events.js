/* ---------- inspector events ---------- */
rbody.addEventListener('toggle',e=>{const d=e.target;if(d&&d.dataset&&d.dataset.sec){if(d.open)closed.delete(d.dataset.sec);else closed.add(d.dataset.sec);}},true);
rbody.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.p){
    const k=t.dataset.p;
    if(k==='bg'){S.canvas.bg=t.value;layout();}
    else if(k==='light'){S.light=+t.value;t.nextElementSibling.textContent=t.value+'°';rerenderAll();}
    else if(k==='bpm'){const v=parseFloat(t.value);if(v>=40)setBpm(v);}
    else if(k==='sigN'||k==='sigD'){setSig($('[data-p="sigN"]',rbody).value,$('[data-p="sigD"]',rbody).value);}
    return;
  }
  if(t.classList.contains('tv')){const tag=tagById(t.closest('.tag').dataset.tid);if(tag)setTag(tag,parseFloat(t.value));return;}
  if(t.dataset.tk){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid),k=t.dataset.tk; if(!tag||k==='name'||tag.sys) return;
    if(k==='steps'){const a=t.value.split(',').map(s=>s.trim()).filter(Boolean);if(a.length<2)return;tag.steps=a;}
    else if(k==='min'||k==='max'||k==='dec'){const v=parseFloat(t.value);if(isNaN(v))return;tag[k]=v;}
    else tag[k]=t.value;
    if(k==='kind'||k==='basis') return;
    const c=stepCount(tag); if(c>1) tag.value=Math.round(tag.value*(c-1))/(c-1);
    onTag(tag); return;
  }
  const k=t.dataset.k,el=sel(); if(!k||!el) return;
  let v; if(t.type==='checkbox') v=t.checked; else if(t.type==='number'||t.type==='range') v=parseFloat(t.value); else v=t.value;
  if(typeof v==='number'&&isNaN(v)) return;
  el[k]=v;
  if(t.type==='range'&&t.nextElementSibling&&t.nextElementSibling.tagName==='OUTPUT') t.nextElementSibling.textContent=v;
  if(k==='name'){renderLayers();placeSel();return;}
  if(el.type==='knob'&&(k==='w'||k==='h')){el.w=el.h=Math.max(12,v);}
  if(el.type==='fader'&&k==='orient'){const w=el.w;el.w=el.h;el.h=w;}
  renderEl(el); placeSel();
});
rbody.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.p==='sigN'||t.dataset.p==='sigD'){renderRight();return;}
  if(t.dataset.tk==='name'){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid); if(!tag) return;
    const nn=t.value.replace(/[^A-Za-z0-9_]/g,'');
    if(!nn||nn==='bpm'||nn==='timesig'||S.tags.some(x=>x!==tag&&x.name===nn)){t.value=tag.name;flash('Tag names must be unique letters, numbers or _');return;}
    const old=tag.name; tag.name=nn; t.value=nn; renameInTexts(old,nn); rerenderAll(); return;
  }
  if(t.dataset.tk==='kind'||t.dataset.tk==='basis'){
    const row=t.closest('.tag'),tag=row&&tagById(row.dataset.tid); if(!tag) return;
    if(tag.kind==='steps'&&tag.steps.length<2) tag.steps=['A','B','C'];
    const c=stepCount(tag); if(c>1){tag.value=Math.round(tag.value*(c-1))/(c-1);tag.def=Math.round(tag.def*(c-1))/(c-1);}
    rerenderAll(); applyAudio(); renderRight(); return;
  }
  if(t.dataset.rb&&t.dataset.k){
    const el=sel();
    if(el&&el.type==='knob'&&(t.dataset.k==='w'||t.dataset.k==='h')){el.w=el.h=Math.max(12,parseFloat(t.value)||el.w);renderEl(el);placeSel();}
    renderRight();
  }
});
document.body.addEventListener('click',e=>{
  const lr=e.target.closest('.lr'); if(lr){select(lr.dataset.id);return;}
  const tb=e.target.closest('#rightD [data-tab]'); if(tb){S.tab=tb.dataset.tab;renderRight();return;}
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act,el=sel(),k=b.dataset.k;
  switch(act){
    case 'add': addEl(b.dataset.type); break;
    case 'addcomp': addComp(b.dataset.comp); break;
    case 'fwd': moveZ(1); break;
    case 'back': moveZ(-1); break;
    case 'dup': dupEl(); break;
    case 'del': delEl(); break;
    case 'pick': if(el) pickImage(id=>{el[k]=id;renderEl(el);renderRight();}); break;
    case 'clear': if(el){el[k]=null;renderEl(el);renderRight();} break;
    case 'mat': if(el){el.mat=b.dataset.v||null;renderEl(el);renderRight();} break;
    case 'lcdlook': if(el&&LOOKS[b.dataset.v]){Object.assign(el,LOOKS[b.dataset.v]);renderEl(el);renderRight();} break;
    case 'font': if(el) pickFont(fam=>{el.font=fam;renderEl(el);renderRight();flash('Font loaded: '+fam);}); break;
    case 'ins': {
      if(!el) break; const ta=$('textarea[data-k="text"]',rbody),tag=$('#insTag').value,fmt=$('#insFmt').value;
      if(!ta||!tag) break; const ins='{'+tag+'.'+fmt+'}',pos=ta.selectionStart==null?ta.value.length:ta.selectionStart;
      ta.value=ta.value.slice(0,pos)+ins+ta.value.slice(ta.selectionEnd==null?pos:ta.selectionEnd);
      el.text=ta.value; renderEl(el); break;
    }
    case 'addTag': {
      let i=1; while(tagByName('tag'+i)) i++;
      S.tags.push(mkTag('tag'+i,'number',{min:0,max:100,dec:0,value:.5,def:.5})); renderRight(); break;
    }
    case 'delTag': {
      const tag=tagById(b.closest('.tag').dataset.tid); if(!tag) break;
      if(tag.sys){flash('Built-in tags cannot be deleted');break;}
      S.tags.splice(S.tags.indexOf(tag),1); S.els.forEach(x=>{if(x.tag===tag.id)x.tag='';});
      rerenderAll(); applyAudio(); renderRight(); break;
    }
    case 'tagDef': {const tag=tagById(b.closest('.tag').dataset.tid);if(tag){tag.def=tag.value;flash('Default for '+tag.name+' updated');}break;}
    case 'copyJson': {
      const data=JSON.stringify({app:'VisuMaker designer draft',canvas:S.canvas,light:S.light,bpm:S.bpm,timesig:S.sig,banks:S.banks,groups:S.groups,lists:S.lists,tags:S.tags,elements:S.els,fx:S.fx.graphs,assets:Object.fromEntries(Object.entries(S.assets).map(a=>[a[0],{name:a[1].name,w:a[1].w,h:a[1].h}]))},null,2);
      const out=$('#jsonOut'); out.value=data; out.hidden=false;
      const fallback=()=>{out.select();flash('Copy was blocked here. The JSON is selected, press Ctrl+C.');};
      try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(()=>flash('Project JSON copied'),fallback); else fallback(); }catch(err){fallback();}
      break;
    }
  }
});
