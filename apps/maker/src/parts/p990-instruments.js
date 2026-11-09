/* ---------- several instruments in one project (a library, exported as .vslib) ----------
   The project always edits one instrument: everything in S (samples, zones, groups, interface, effects, knobs) is that
   instrument. The others wait in INS.list as a snapshot plus their own audio, which is taken out of BUF so nothing of
   theirs shows. Switching stores the current one and brings the other back. Library details (S.lib), images and fonts
   belong to the whole project. A project with one instrument is saved exactly as before. */
const INS={list:[],cur:null,n:0};
const insCur=()=>INS.list.find(i=>i.id===INS.cur)||null;
function insHash(s){let a=0x811c9dc5,b=0x01000193;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,0x5bd1e995)^(b>>>15);}return(a>>>0).toString(36)+(b>>>0).toString(36);}
/* An instrument's token for "has the project changed": the hash of its state, or "unchanged since it was opened"
   (its state hash was not known then). The token of the one being edited comes from the undo state. */
function insToken(i){
  if(i.id!==INS.cur)return i.key||('L'+i.id);
  const h=HIST.last?insHash(HIST.last.key):'';
  return(i.key==null&&i.arrival===h)?'L'+i.id:h;
}
function insKeyNow(){
  if(INS.list.length<2)return'';
  return'#'+INS.list.map(insToken).join(',')+'#'+insHash(JSON.stringify(INS.list.map(i=>[i.id,i.name,i.bank,i.desc])));
}
function insInit(name){INS.n=1;INS.list=[{id:'ins1',name:name||(S.lib&&S.lib.name)||'Instrument 1',bank:'',desc:'',snap:null,bufs:null,key:null,arrival:null}];INS.cur='ins1';insUI();}
function insStash(){
  const i=insCur();if(!i)return;
  histCheck();const h=HIST.last?insHash(HIST.last.key):null;
  i.key=(i.key==null&&i.arrival===h)?null:h;
  i.snap=snapshot();i.bufs={};
  for(const s of S.samples){const b=BUF.get(s.id);if(b){i.bufs[s.id]={ch:b.ch,sr:b.sr,peaks:b.peaks};BUF.delete(s.id);}}
  BUF.clear();   /* also audio no sample uses any more (older presets, deleted samples: undo keeps its own copies) */
}
function insBring(i){
  const lib=S.lib,view=S.view;
  if(i.bufs)for(const id of Object.keys(i.bufs)){const x=i.bufs[id];BUF.set(id,{ch:x.ch,sr:x.sr,peaks:x.peaks});}
  if(i.snap)restore(i.snap);
  S.lib=lib;i.snap=null;i.bufs=null;
  S.smp.sel=S.samples[0]?S.samples[0].id:null;S.sel=null;S.msel=[];
  RENDER_CACHE.clear();afterLoad();setView(view);
  histClear();i.arrival=HIST.last?insHash(HIST.last.key):null;
}
function insSwitch(id){
  if(id===INS.cur)return;const t=INS.list.find(i=>i.id===id);if(!t)return;
  if(typeof sampPanic==='function')sampPanic();
  insStash();INS.cur=id;insBring(t);insUI();
  flash('Now editing "'+t.name+'"');
}
/* switch without the message and menu refresh (the library export walks through every instrument) */
function insVisit(id){const t=INS.list.find(i=>i.id===id);if(!t||id===INS.cur)return;insStash();INS.cur=id;insBring(t);insUI();}
function insNewId(){let id;do{id='ins'+(++INS.n);}while(INS.list.some(i=>i.id===id));return id;}
function insAdd(){
  insStash();const lib=S.lib,canvas=Object.assign({},S.canvas);
  baseProject();S.lib=lib;S.canvas=canvas;
  const i={id:insNewId(),name:'Instrument '+(INS.list.length+1),bank:(insCur()||{}).bank||'',desc:'',snap:null,bufs:null,key:null,arrival:null};
  const at=INS.list.indexOf(insCur());INS.list.splice(at+1,0,i);INS.cur=i.id;
  RENDER_CACHE.clear();afterLoad();setView(S.view);histClear();i.key='new';   /* a new instrument is a change */
  insUI();flash('New instrument "'+i.name+'": add samples in the Sound tab');return i;
}
function insDuplicate(){
  const src=insCur();if(!src)return;
  histCheck();const snap=snapshot(),bufs={};
  for(const s of S.samples){const b=BUF.get(s.id);if(b)bufs[s.id]={ch:b.ch,sr:b.sr,peaks:b.peaks};}
  insStash();
  const i={id:insNewId(),name:src.name+' copy',bank:src.bank,desc:src.desc,snap,bufs,key:'new',arrival:null};
  INS.list.splice(INS.list.indexOf(src)+1,0,i);INS.cur=i.id;insBring(i);i.key='new';insUI();
  flash('Duplicated as "'+i.name+'"');return i;
}
function insDelete(){
  if(INS.list.length<2){flash('A library needs at least one instrument');return false;}
  const i=insCur();if(!confirm('Delete the instrument "'+i.name+'" with its samples, interface and effects? (Undo cannot bring it back.)'))return false;
  const at=INS.list.indexOf(i);
  for(const s of S.samples)BUF.delete(s.id);
  INS.list.splice(at,1);const t=INS.list[Math.min(at,INS.list.length-1)];INS.cur=t.id;insBring(t);
  INS.deleted=(INS.deleted||0)+1;insUI();flash('Deleted "'+i.name+'"');return true;
}
function insMove(d){
  const i=insCur(),at=INS.list.indexOf(i),to=at+d;if(!i||to<0||to>=INS.list.length)return;
  INS.list.splice(at,1);INS.list.splice(to,0,i);insUI();
}
/* ---------- the picker in the top bar ---------- */
function insBanks(){const b=[];INS.list.forEach(i=>{if(!b.includes(i.bank))b.push(i.bank);});return b;}
function insListHTML(){
  const banks=insBanks();let h='';
  for(const b of banks){
    if(banks.length>1||b)h+='<div class="insbank">'+esc(b||'No bank')+'</div>';
    h+=INS.list.filter(i=>i.bank===b).map(i=>'<button type="button" class="mi insit" data-ins="'+esc(i.id)+'"'+(i.id===INS.cur?' aria-current="true"':'')+'>'+esc(i.name)+'</button>').join('');
  }
  return h;
}
function insActsHTML(){
  const c=insCur();
  return'<button type="button" class="btn" data-ia="add" title="A new, empty instrument in this library">+ New</button>'
    +'<button type="button" class="btn" data-ia="dup" title="A copy of this instrument, samples included">Duplicate</button>'
    +'<button type="button" class="btn" data-ia="up" title="Move up"'+(INS.list.indexOf(c)===0?' disabled':'')+' aria-label="Move up">▲</button>'
    +'<button type="button" class="btn" data-ia="down" title="Move down"'+(INS.list.indexOf(c)===INS.list.length-1?' disabled':'')+' aria-label="Move down">▼</button>'
    +'<button type="button" class="btn danger" data-ia="del"'+(INS.list.length<2?' disabled':'')+'>Delete</button>';
}
function insMenuHTML(){
  const c=insCur(),banks=insBanks();
  let h='<div class="msep">Instruments in this library</div><div class="inslist">'+insListHTML();
  h+='</div><div class="insacts">'+insActsHTML()+'</div>';
  return h+'<div class="msep">This instrument</div><div class="insform">'
    +'<label>Name<input type="text" id="insNameIn" value="'+esc(c?c.name:'')+'" maxlength="80"></label>'
    +'<label>Bank<input type="text" id="insBankIn" value="'+esc(c?c.bank:'')+'" list="insBankList" placeholder="e.g. 01. Pads" maxlength="60"></label>'
    +'<datalist id="insBankList">'+banks.filter(Boolean).map(b=>'<option value="'+esc(b)+'">').join('')+'</datalist>'
    +'<label>Description<input type="text" id="insDescIn" value="'+esc(c?c.desc:'')+'" maxlength="300" placeholder="Shown in VisuPlayer\'s list"></label></div>';
}
function insUI(){
  const c=insCur(),b=$('#insBtn');if(!b)return;
  $('#insName').textContent=c?c.name:'';
  b.title=INS.list.length>1?'Instrument '+(INS.list.indexOf(c)+1)+' of '+INS.list.length+' in this library: switch, add or rename':'Instruments: add more to make a library (.vslib)';
  $('#insCount').textContent=INS.list.length>1?INS.list.length:'';
  const m=$('#insMenu');   /* an open menu: refresh the list and buttons, never the fields being typed in */
  if(m&&!m.hidden&&m.querySelector('.inslist')){const fa=document.activeElement,fk=fa&&fa.dataset&&(fa.dataset.ia||fa.dataset.ins);
    m.querySelector('.inslist').innerHTML=insListHTML();m.querySelector('.insacts').innerHTML=insActsHTML();
    $('#insBankList').innerHTML=insBanks().filter(Boolean).map(b=>'<option value="'+esc(b)+'">').join('');
    if(fk){const t=m.querySelector('[data-ia="'+fk+'"],[data-ins="'+fk+'"]');if(t&&!t.disabled)t.focus();}}
  if(typeof autoDot==='function')autoDot();
}
function insMenuClose(){const m=$('#insMenu');if(m){m.hidden=true;$('#insBtn').setAttribute('aria-expanded','false');}}
$('#insBtn').addEventListener('click',()=>{
  const m=$('#insMenu'),open=m.hidden;if(open)m.innerHTML=insMenuHTML();
  m.hidden=!open;$('#insBtn').setAttribute('aria-expanded',String(open));
  if(open){const cur=m.querySelector('[aria-current]');if(cur)cur.focus();}
});
$('#insMenu').addEventListener('click',e=>{
  const it=e.target.closest('[data-ins]');if(it){insMenuClose();insSwitch(it.dataset.ins);return;}
  const a=e.target.closest('[data-ia]');if(!a||a.disabled)return;
  const k=a.dataset.ia;
  if(k==='add'){insMenuClose();insAdd();}else if(k==='dup'){insMenuClose();insDuplicate();}
  else if(k==='del'){insMenuClose();insDelete();}else if(k==='up')insMove(-1);else if(k==='down')insMove(1);
});
$('#insMenu').addEventListener('input',e=>{
  const c=insCur();if(!c)return;
  if(e.target.id==='insNameIn'){c.name=e.target.value.trim()||'Untitled';$('#insName').textContent=c.name;if(typeof autoDot==='function')autoDot();}
  if(e.target.id==='insBankIn'){c.bank=e.target.value.trim();if(typeof autoDot==='function')autoDot();}
  if(e.target.id==='insDescIn'){c.desc=e.target.value.trim();if(typeof autoDot==='function')autoDot();}
});
$('#insMenu').addEventListener('change',e=>{if(e.target.id==='insBankIn'||e.target.id==='insNameIn')insUI();});
$('#insMenu').addEventListener('keydown',e=>{if(e.key==='Escape'){insMenuClose();$('#insBtn').focus();}else if(e.key==='Enter'&&e.target.tagName==='INPUT'){insUI();}});
document.addEventListener('pointerdown',e=>{if(!$('#insMenu').hidden&&!e.target.closest('.insw'))insMenuClose();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#insMenu').hidden){insMenuClose();$('#insBtn').focus();}});

/* ---------- saving and opening (called by p496) ---------- */
async function insProjectWrite(manifest,pack,currentSnapshot){
  if(INS.list.length<2)return;   /* one instrument: the project file is exactly as before */
  const out=[];
  for(const i of INS.list){
    const e={id:i.id,name:i.name,bank:i.bank,desc:i.desc};
    if(i.id===INS.cur)e.current=true;
    else{
      e.snapshot=i.snap;e.audio={};
      for(const sid of Object.keys(i.bufs||{})){const b=i.bufs[sid],pc=pcmPart(b);e.audio[sid]={sr:b.sr,chn:b.ch.length,bits:32,data:await pack.add(pc.u8,{crc:pc.crc})};}
    }
    out.push(e);
  }
  manifest.instruments=out;
}
async function insProjectRead(m,blob){
  if(!Array.isArray(m.instruments)||m.instruments.length<2){insInit(S.lib&&S.lib.name);return;}
  const list=[];let cur=null,n=0;
  for(const e of m.instruments){
    const i={id:String(e.id||('ins'+(list.length+1))),name:e.name||'Untitled',bank:e.bank||'',desc:e.desc||'',snap:null,bufs:null,key:null,arrival:null};
    if(e.current&&!cur)cur=i.id;
    else{
      i.snap=e.snapshot||null;i.bufs={};
      await Promise.all(Object.keys(e.audio||{}).map(async sid=>{const a=e.audio[sid],ch=decodePCM(await blob(a.data),a.chn,a.bits);
        i.bufs[sid]={ch,sr:a.sr,peaks:peaksOf(ch,600)};if(a.bits===32&&a.data.enc!=='deflate')pcmKnownCrc(ch,a.data.crc);}));
    }
    const k=+String(i.id).replace(/\D+/g,'');if(k>n)n=k;
    list.push(i);
  }
  INS.list=list;INS.cur=cur||list[0].id;INS.n=n;
  const c=insCur();c.snap=null;c.bufs=null;
  histCheck();c.arrival=HIST.last?insHash(HIST.last.key):null;
  insUI();
}
/* insInit() runs from p999, once everything it touches exists */
