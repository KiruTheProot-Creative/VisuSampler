/* ---------- folders and patches (patch mode "group") ----------
   The Sound tab's left column shows lists as folders with their groups (the patches) inside, like a file explorer.
   Click a patch to hear it, drag a patch onto a folder to move it there (hold Ctrl to put it in both),
   drag it onto another patch to change the order, double-click a name to rename, right-click for more. Banks stay hidden. */
S.snd.ffold=S.snd.ffold||{};
const groupRowHTML=(g,extra,num)=>{
  const c=gcfg(g),n=S.zones.filter(z=>z.group===g).length,cur=S.map.group,f=S.snd.focus;
  return '<div class="snrow grow tree'+(g===cur?' cur':'')+(f==='group'&&g===cur?' on':'')+(c.mute?' muted':'')+'" data-ma="grp" data-g="'+esc(g)+'" '+extra+' draggable="true" role="button" tabindex="0">'
    +(num?'<small class="pn">'+num+'</small>':'')+'<i class="sw" style="background:'+c.color+'"></i><span class="nm" data-ren="group">'+esc(g)+'</span>'
    +'<button type="button" class="ms'+(c.mute?' on':'')+'" data-ma="gmute" data-g="'+esc(g)+'" title="Mute" aria-label="Mute '+esc(g)+'" aria-pressed="'+c.mute+'">M</button>'
    +'<button type="button" class="ms'+(c.solo?' on':'')+'" data-ma="gsolo" data-g="'+esc(g)+'" title="Solo" aria-label="Solo '+esc(g)+'" aria-pressed="'+c.solo+'">S</button><small>'+n+'</small></div>';
};
const foldersSorted=()=>S.lists.slice().sort((a,b)=>a.bank-b.bank||S.lists.indexOf(a)-S.lists.indexOf(b));
function folderTreeHTML(sh,body){
  const cl=curList(),fo=S.snd.ffold;
  let h=sh('Folders','<button type="button" class="snadd" data-fa="addFolder" title="New folder" aria-label="New folder">+</button>');
  let b='<div class="snlist tree">';
  foldersSorted().forEach(l=>{
    const open=!fo[l.id];
    b+='<div class="snrow frow'+(l===cl?' cur':'')+'" data-sn="list" data-id="'+l.id+'" data-drop="'+l.id+'" role="button" tabindex="0">'
      +'<button type="button" class="ffold" data-ffold="'+l.id+'" aria-expanded="'+open+'" aria-label="'+(open?'Close':'Open')+' '+esc(l.name)+'">'+(open?'▾':'▸')+'</button>'
      +'<span class="nm" data-ren="folder">'+esc(l.name)+'</span><button type="button" class="snadd" data-fa="addPatch" data-id="'+l.id+'" title="New patch in this folder" aria-label="New patch in '+esc(l.name)+'">+</button><small>'+l.groups.length+'</small></div>';
    if(open)b+=l.groups.length?l.groups.map((g,i)=>groupRowHTML(g,'data-from="'+l.id+'" data-pi="'+i+'"',pad2(i+1))).join(''):'<p class="snnone tree">Empty. Drag patches here.</p>';
  });
  const loose=S.groups.filter(g=>!S.lists.some(l=>l.groups.indexOf(g)>=0));
  if(loose.length||!S.lists.length){
    b+='<div class="snrow frow loose" data-drop="" role="presentation"><span class="nm">Not in a folder</span><button type="button" class="snadd" data-fa="addPatch" data-id="" title="New patch" aria-label="New patch">+</button><small>'+loose.length+'</small></div>';
    b+=loose.map(g=>groupRowHTML(g,'data-from=""','')).join('');
  }
  h+=body('Folders',b+'</div>');
  return h;
}
/* choosing a patch in the tree also picks its folder and patch, so you hear it */
function pickPatch(lid,i){
  const l=S.lists.find(x=>x.id===lid);if(!l)return;
  const bt=bankTag(),lt=listTag();if(bt&&lt){setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}
  const pt=patchTag(0);if(pt)setStep(pt,i);
}
function renameGroup(old,nn){
  nn=(nn||'').trim();if(!nn||nn===old)return false;if(S.groups.indexOf(nn)>=0){flash('Group names must be unique');return false;}
  S.groups[S.groups.indexOf(old)]=nn;S.gset[nn]=S.gset[old];delete S.gset[old];
  S.zones.forEach(z=>{if(z.group===old)z.group=nn;});S.lists.forEach(l=>{l.groups=(l.groups||[]).map(x=>x===old?nn:x);});
  if(S.map.group===old)S.map.group=nn;touchMap();refreshDisplays();return true;
}
function deleteGroup(n){
  delZones(S.zones.filter(z=>z.group===n).map(z=>z.id));
  S.groups=S.groups.filter(x=>x!==n);S.lists.forEach(l=>{l.groups=(l.groups||[]).filter(x=>x!==n);});
  delete S.gset[n];if(S.map.group===n)S.map.group=S.groups[0]||null;touchMap();refreshDisplays();
}
$('#leftM').addEventListener('click',e=>{
  if(S.view!=='sound'||!patchModeOn())return;
  const ff=e.target.closest('[data-ffold]');if(ff){e.stopPropagation();S.snd.ffold[ff.dataset.ffold]=!S.snd.ffold[ff.dataset.ffold];soundRefresh(true);return;}
  const fa=e.target.closest('[data-fa]');
  if(fa){e.stopPropagation();
    if(fa.dataset.fa==='addFolder'){const l={id:nid('l'),name:'Folder '+(S.lists.length+1),bank:0,groups:[],vals:{}};S.lists.push(l);refreshDisplays();pickPatch(l.id,0);S.snd.focus='list';soundRefresh();return;}
    if(fa.dataset.fa==='addPatch'){const n=newGroupName();S.groups.push(n);gcfg(n);S.map.group=n;const l=S.lists.find(x=>x.id===fa.dataset.id);if(l){l.groups.push(n);pickPatch(l.id,l.groups.length-1);}touchMap();S.snd.focus='group';soundRefresh();return;}
  }
  const r=e.target.closest('.grow.tree');if(r&&!e.target.closest('.ms')&&r.dataset.from)pickPatch(r.dataset.from,+r.dataset.pi);
},true);
/* double-click a name to rename it (the first click may redraw the row, so the second click starts it) */
$('#leftM').addEventListener('click',e=>{
  if(e.detail!==2||S.view!=='sound'||!patchModeOn())return;const nm=e.target.closest('[data-ren]');if(!nm)return;
  e.preventDefault();e.stopPropagation();startRename(nm);
},true);
function startRename(nm){
  if(!nm||!nm.isConnected)return;
  const row=nm.closest('.snrow'),isF=nm.dataset.ren==='folder',old=isF?(S.lists.find(l=>l.id===row.dataset.id)||{}).name:row.dataset.g;if(old==null)return;
  const inp=document.createElement('input');inp.type='text';inp.value=old;inp.className='renin';inp.setAttribute('aria-label','New name');nm.replaceWith(inp);inp.focus();inp.select();
  let done=false;const fin=ok=>{if(done)return;done=true;
    if(ok){if(isF){const l=S.lists.find(x=>x.id===row.dataset.id);const v=inp.value.trim();if(l&&v){l.name=v;refreshDisplays();}}else renameGroup(old,inp.value);}
    soundRefresh(true);snShow();};
  inp.addEventListener('keydown',k=>{if(k.key==='Enter')fin(true);else if(k.key==='Escape')fin(false);k.stopPropagation();});
  inp.addEventListener('blur',()=>fin(true));inp.addEventListener('change',()=>fin(true));
}
/* drag patches between folders */
let dragPatch=null;
$('#leftM').addEventListener('dragstart',e=>{
  const r=e.target.closest&&e.target.closest('.grow.tree');if(!r||!patchModeOn())return;
  dragPatch={g:r.dataset.g,from:r.dataset.from};e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain',r.dataset.g);
});
const dropTarget=e=>dragPatch&&e.target.closest&&(e.target.closest('[data-drop]')||e.target.closest('.grow.tree'));
$('#leftM').addEventListener('dragover',e=>{const t=dropTarget(e);if(!t)return;e.preventDefault();e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';
  $$('#leftM .dropon').forEach(x=>{if(x!==t)x.classList.remove('dropon');});t.classList.add('dropon');});
$('#leftM').addEventListener('dragleave',e=>{const t=e.target.closest&&e.target.closest('.dropon');if(t&&!t.contains(e.relatedTarget))t.classList.remove('dropon');});
$('#leftM').addEventListener('drop',e=>{
  const t=dropTarget(e);if(!t)return;e.preventDefault();e.stopPropagation();
  const {g,from}=dragPatch;dragPatch=null;
  let to,at=-1;
  if(t.classList.contains('grow')){to=t.dataset.from;at=t.dataset.pi!=null?+t.dataset.pi:-1;}else to=t.dataset.drop;
  const src=S.lists.find(l=>l.id===from),dst=S.lists.find(l=>l.id===to);
  if(src&&!e.ctrlKey&&src!==dst)src.groups=src.groups.filter(x=>x!==g);
  if(dst){const i=dst.groups.indexOf(g);if(i>=0){dst.groups.splice(i,1);if(at>i)at--;}if(at<0||at>dst.groups.length)dst.groups.push(g);else dst.groups.splice(at,0,g);}
  else if(!to&&!e.ctrlKey)S.lists.forEach(l=>{l.groups=l.groups.filter(x=>x!==g);});
  touchMap();refreshDisplays();soundRefresh(true);
});
$('#leftM').addEventListener('dragend',()=>{dragPatch=null;$$('#leftM .dropon').forEach(x=>x.classList.remove('dropon'));});
/* right-click: rename, take out of the folder, delete */
let fmenu=null;
const fmenuClose=()=>{if(fmenu){fmenu.remove();fmenu=null;}};
$('#leftM').addEventListener('contextmenu',e=>{
  if(S.view!=='sound'||!patchModeOn())return;const r=e.target.closest('.grow.tree,.frow[data-id]');if(!r)return;
  e.preventDefault();fmenuClose();
  const isF=r.classList.contains('frow'),items=isF?[['ren','Rename folder'],['delf','Delete folder (keeps its patches)']]
    :[['ren','Rename patch']].concat(r.dataset.from?[['out','Take out of this folder']]:[]).concat([['dup','Duplicate patch'],['delg','Delete patch and its zones']]);
  fmenu=document.createElement('div');fmenu.className='ctxmenu fmenu';fmenu.setAttribute('role','menu');
  fmenu.innerHTML=items.map(([k,l])=>'<button type="button" role="menuitem" data-fm="'+k+'"'+(k.indexOf('del')===0?' class="danger"':'')+'>'+l+'</button>').join('');
  document.body.appendChild(fmenu);fmenu.style.left=Math.min(e.clientX,innerWidth-230)+'px';fmenu.style.top=Math.min(e.clientY,innerHeight-fmenu.offsetHeight-8)+'px';
  fmenu.querySelector('button').focus();
  fmenu.addEventListener('click',ev=>{const k=ev.target.closest('[data-fm]');if(!k)return;const a=k.dataset.fm;fmenuClose();
    if(a==='ren'){startRename(r.querySelector('[data-ren]'));return;}
    if(a==='out'){const l=S.lists.find(x=>x.id===r.dataset.from);if(l)l.groups=l.groups.filter(x=>x!==r.dataset.g);}
    else if(a==='delf'){const l=S.lists.find(x=>x.id===r.dataset.id);if(l)listStructure(()=>{S.lists.splice(S.lists.indexOf(l),1);});}
    else if(a==='delg')deleteGroup(r.dataset.g);
    else if(a==='dup'){const g=r.dataset.g;let n=g+' copy',i=2;while(S.groups.indexOf(n)>=0)n=g+' copy '+(i++);
      S.groups.splice(S.groups.indexOf(g)+1,0,n);S.gset[n]=JSON.parse(JSON.stringify(gcfg(g)));
      S.zones.filter(z=>z.group===g).forEach(z=>{const c=JSON.parse(JSON.stringify(z));c.id=nid('z');c.group=n;S.zones.push(c);});
      const l=S.lists.find(x=>x.id===r.dataset.from);if(l)l.groups.splice(l.groups.indexOf(g)+1,0,n);S.map.group=n;}
    touchMap();refreshDisplays();soundRefresh();
  });
});
document.addEventListener('pointerdown',e=>{if(fmenu&&!fmenu.contains(e.target))fmenuClose();},true);
document.addEventListener('keydown',e=>{if(fmenu&&e.key==='Escape'){e.preventDefault();e.stopPropagation();fmenuClose();}},true);
