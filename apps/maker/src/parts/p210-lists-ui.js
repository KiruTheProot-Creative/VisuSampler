/* ---------- lists, banks and groups panel ---------- */
function listCard(l){
  const bi=bankIdx(),isCur=curList()===l;
  const nv=Object.keys(l.vals||{}).length;
  return '<div class="lcard'+(isCur?' cur':'')+'" data-lid="'+l.id+'"><div class="lc1"><input type="text" data-ls-name="list" data-id="'+l.id+'" value="'+esc(l.name)+'" aria-label="List name">'
    +'<select data-ls-bank data-id="'+l.id+'" aria-label="Bank">'+S.banks.map((b,i)=>'<option value="'+i+'"'+(i===l.bank?' selected':'')+'>'+b.letter+'</option>').join('')+'</select></div>'
    +'<div class="gchips">'+S.groups.map(g=>'<label class="gc"><input type="checkbox" data-ls-grp data-id="'+l.id+'" data-g="'+esc(g)+'"'+(l.groups.indexOf(g)>=0?' checked':'')+'><span>'+esc(g)+'</span></label>').join('')+'</div>'
    +'<div class="lc3"><button type="button" class="btn" data-ls="sel" data-id="'+l.id+'">'+(isCur?'Selected':'Select')+'</button><button type="button" class="btn" data-ls="saveVals" data-id="'+l.id+'" title="Store the current knob values with this list">Save knob values'+(nv?' ('+nv+')':'')+'</button><button type="button" class="btn danger" data-ls="delList" data-id="'+l.id+'">Delete</button></div></div>';
}
function listsHTML(){
  const bi=bankIdx(),b=S.banks[bi]||{letter:'?',name:''};
  let h='<p class="hint" style="margin-top:0">A sample list is a batch of groups, like a rompler patch. Banks hold lists. The list selector and bank buttons are bound to the built-in <b>list</b> and <b>bank</b> tags.</p>';
  h+=sec('Banks','<div class="banks">'+S.banks.map((x,i)=>'<button type="button" class="btn bkb'+(i===bi?' on':'')+'" data-ls="bank" data-i="'+i+'" title="'+esc(x.name||x.letter)+'">'+x.letter+'<small>'+S.lists.filter(l=>l.bank===i).length+'</small></button>').join('')+'<button type="button" class="btn bkb" data-ls="addBank" title="Add a bank" aria-label="Add a bank">+</button></div>'
    +'<label class="f"><span>Bank '+b.letter+' name</span><input type="text" data-ls-name="bank" value="'+esc(b.name)+'"></label>');
  h+=sec('Lists ('+S.lists.length+')',S.lists.map(listCard).join('')+'<button type="button" class="btn" data-ls="addList">+ New list in bank '+b.letter+'</button>');
  h+=sec('Sample groups ('+S.groups.length+')','<div class="gedit">'+S.groups.map((g,i)=>'<span class="gtag">'+esc(g)+'<button type="button" data-ls="delGroup" data-i="'+i+'" aria-label="Remove group '+esc(g)+'">✕</button></span>').join('')+'</div><div class="ins" style="margin-top:8px;grid-template-columns:1fr auto"><input type="text" id="newGroup" placeholder="New group name" aria-label="New group name"><button type="button" class="btn" data-ls="addGroup" style="grid-column:auto">Add</button></div><p class="hint">Groups come from the Mapping tab. These are example names.</p>');
  return h;
}
function listStructure(fn){
  const bi=bankIdx(),li=listIdx(),cur=curList();
  fn();
  const idx=cur?listsInBank(bankIdx()).indexOf(cur):-1;
  restoreIdx(bi,idx>=0?idx:li);
  refreshDisplays(); renderRight();
}
rbody.addEventListener('input',e=>{
  const t=e.target,d=t.dataset; if(!d) return;
  if(d.lsName==='list'){const l=S.lists.find(x=>x.id===d.id);if(l){l.name=t.value;refreshDisplays();}}
  else if(d.lsName==='bank'){const b=S.banks[bankIdx()];if(b){b.name=t.value;refreshDisplays();}}
});
rbody.addEventListener('change',e=>{
  const t=e.target,d=t.dataset; if(!d) return;
  if(d.lsBank!==undefined){
    const l=S.lists.find(x=>x.id===d.id); if(!l) return;
    listStructure(()=>{l.bank=+t.value;});
  }else if(d.lsGrp!==undefined){
    const l=S.lists.find(x=>x.id===d.id); if(!l) return;
    const i=l.groups.indexOf(d.g);
    if(t.checked&&i<0) l.groups.push(d.g); else if(!t.checked&&i>=0) l.groups.splice(i,1);
    refreshDisplays();
  }
});
document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-ls]'); if(!b) return;
  const act=b.dataset.ls,l=S.lists.find(x=>x.id===b.dataset.id);
  if(act==='ksLearn'&&l){KSL.learn=KSL.learn===l.id?null:l.id;if(KSL.learn)flash('Play the key that should pick "'+l.name+'"');if(S.view==='sound')snShow();return;}
  if(act==='ksClear'&&l){l.ks=null;if(S.view==='sound')snShow();return;}
  if(act==='bank'){const bt=bankTag();if(bt)setStep(bt,+b.dataset.i);renderRight();}
  else if(act==='addBank') listStructure(()=>{S.banks.push({letter:bankLetter(S.banks.length),name:''});});
  else if(act==='addList') listStructure(()=>{S.lists.push({id:nid('l'),name:'New list '+(S.lists.length+1),bank:bankIdx(),groups:[],vals:{}});});
  else if(act==='delList'&&l) listStructure(()=>{S.lists.splice(S.lists.indexOf(l),1);});
  else if(act==='sel'&&l){
    const bt=bankTag(),lt=listTag(); if(!bt||!lt) return;
    setStep(bt,l.bank); setStep(lt,listsInBank(l.bank).indexOf(l)); renderRight();
  }else if(act==='saveVals'&&l){
    l.vals={}; S.tags.forEach(t=>{if(!t.sys)l.vals[t.name]=+t.value.toFixed(4);});
    flash('Saved '+Object.keys(l.vals).length+' knob values to '+l.name); renderRight();
  }else if(act==='addGroup'){
    const inp=$('#newGroup'),v=inp&&inp.value.trim();
    if(v&&S.groups.indexOf(v)<0){S.groups.push(v);renderRight();}
  }else if(act==='delGroup'){
    const g=S.groups[+b.dataset.i]; if(g===undefined) return;
    S.groups.splice(+b.dataset.i,1); S.lists.forEach(x=>{const k=x.groups.indexOf(g);if(k>=0)x.groups.splice(k,1);});
    renderRight();
  }
});
