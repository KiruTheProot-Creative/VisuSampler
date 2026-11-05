/* ---------- pages (tabs inside one instrument) ----------
   S.pages lists the pages. The page being shown is a system tag named "page" whose steps are the page names,
   so a radio button on it works as a tab, rules can switch pages, and the player needs nothing new. */
S.pages=[];S.layThisPage=true;
function syncPageTag(){
  let t=pageTag();
  if(S.pages.length&&!t){t=mkTag('page','steps',{sys:true,steps:[]});S.tags.push(t);}
  if(!t)return;
  if(!S.pages.length){S.tags=S.tags.filter(x=>x!==t);S.els.forEach(e=>{if(e.tag===t.id)e.tag='';});return;}
  t.steps=S.pages.map(p=>p.name);const n=t.steps.length;t.value=n>1?Math.round(t.value*(n-1))/(n-1):0;t.def=0;
}
function pagesChanged(){syncPageTag();rerenderAll();showPage();refreshDisplays();mselIds();S.msel=S.msel.filter(id=>{const e=S.els.find(x=>x.id===id);return e&&elShown(e);});if(S.sel&&S.msel.indexOf(S.sel)<0)S.sel=S.msel[S.msel.length-1]||null;renderPageBar();renderLayers();placeSel();renderRight();}
function goPage(i){const t=pageTag();if(!t)return;setStep(t,i);}
function addPage(){
  const p={id:nid('pg'),name:'Page '+(S.pages.length+1)};S.pages.push(p);
  /* a background that fills the canvas belongs on every page */
  if(S.pages.length===1)S.els.forEach(e=>{if(e.x<=1&&e.y<=1&&e.x+e.w>=S.canvas.w-1&&e.y+e.h>=S.canvas.h-1)e.always=true;});
  pagesChanged();goPage(S.pages.length-1);
  flash(S.pages.length===1?'Page 1 holds everything so far. Add another page to start a second tab.':p.name+' added. Elements you add now go on it.');
}
function delPage(id){
  const i=S.pages.findIndex(p=>p.id===id);if(i<0)return;const name=S.pages[i].name;
  S.pages.splice(i,1);S.els.forEach(e=>{if(e.page===id)delete e.page;});pagesChanged();
  flash(name+' removed. Its elements moved to the first page.');
}
function renderPageBar(){
  const pb=$('#pageBar'),cur=curPageIdx();
  pb.innerHTML='<span class="muted">Pages</span>'+S.pages.map((p,i)=>'<button type="button" class="pgchip" data-pgo="'+i+'" aria-pressed="'+(i===cur)+'" title="Double-click to rename">'+esc(p.name)+'</button>').join('')
    +'<button type="button" class="pgchip add" data-pgadd="1" title="Add a page" aria-label="Add a page">+</button>';
  $('#layPage').hidden=S.pages.length<2;$('#layPage').setAttribute('aria-pressed',String(S.layThisPage));
}
$('#pageBar').addEventListener('click',e=>{
  if(e.target.closest('[data-pgadd]')){addPage();return;}
  const b=e.target.closest('[data-pgo]');if(b)goPage(+b.dataset.pgo);
});
$('#pageBar').addEventListener('dblclick',e=>{
  const b=e.target.closest('[data-pgo]');if(!b)return;const p=S.pages[+b.dataset.pgo];
  const inp=document.createElement('input');inp.type='text';inp.className='pgedit';inp.value=p.name;inp.setAttribute('aria-label','Page name');b.replaceWith(inp);inp.focus();inp.select();
  let done=false;const fin=ok=>{if(done)return;done=true;const v=inp.value.trim();if(ok&&v)p.name=v;pagesChanged();};
  inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')fin(true);else if(ev.key==='Escape')fin(false);ev.stopPropagation();});
  inp.addEventListener('blur',()=>fin(true));
});
$('#layPage').addEventListener('click',()=>{S.layThisPage=!S.layThisPage;renderPageBar();renderLayers();});
/* switching pages anywhere (tab buttons in Test, rules, the bar) keeps the editor in step */
const onTagPg=onTag;
onTag=function(t){onTagPg(t);if(t.sys&&t.name==='page'){renderPageBar();renderLayers();if(S.mode==='design'){S.msel=mselIds().filter(id=>{const x=S.els.find(q=>q.id===id);return x&&elShown(x);});if(S.sel&&S.msel.indexOf(S.sel)<0)S.sel=S.msel[S.msel.length-1]||null;placeSel();renderRight();}}};
/* ---- inspector: which page, always show, and "opens page" for buttons ---- */
function pageSecHTML(els){
  if(!S.pages.length)return sec('Page','<p class="hint">One page so far. Add pages with + above the canvas to make tabs.</p><div class="chips"><button type="button" class="btn" data-pgadd2="1">Add pages</button></div>');
  const ps=new Set(els.map(e=>S.pages[elPageIdx(e)].id)),pv=ps.size===1?[...ps][0]:'',al=els.every(e=>e.always),some=!al&&els.some(e=>e.always);
  let h='<label class="f"><span>Page</span><select data-pgset="1"'+(al?' disabled':'')+'>'+(pv?'':'<option value="" selected>Mixed</option>')+S.pages.map(p=>'<option value="'+p.id+'"'+(p.id===pv?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'
    +'<label class="f chk"><input type="checkbox" data-pgalways="1"'+(al?' checked':'')+'><span>Always show (on every page)'+(some?' · some are':'')+'</span></label>';
  const pt=pageTag();
  if(els.length===1&&els[0].type==='button'&&pt){
    const b=els[0],opens=b.tag===pt.id&&b.mode==='radio'?(S.pages[b.value]||{}).id||'':'';
    h+='<label class="f"><span>Opens page</span><select data-pgopen="1"><option value="">— nothing —</option>'+S.pages.map(p=>'<option value="'+p.id+'"'+(p.id===opens?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'
      +'<p class="hint">Makes this button a tab: clicking it shows that page, and its light shows when the page is open. Tab buttons usually want Always show.</p>';
  }
  return sec('Page',h);
}
const propsHTMLPg=propsHTML;
propsHTML=function(){
  const h=propsHTMLPg(),els=selEls();if(!els.length)return h;
  const i=h.indexOf('<div class="acts">'),j=i<0?-1:h.indexOf('</div>',i);
  return j<0?h+pageSecHTML(els):h.slice(0,j+6)+pageSecHTML(els)+h.slice(j+6);
};
rbody.addEventListener('change',e=>{
  const t=e.target,els=selEls();if(!els.length)return;
  if(t.dataset.pgset&&t.value){els.forEach(x=>{x.page=t.value;});pagesChanged();}
  else if(t.dataset.pgalways){els.forEach(x=>{x.always=t.checked;});pagesChanged();}
  else if(t.dataset.pgopen!=null&&t.dataset.pgopen!==undefined&&t.matches('[data-pgopen]')){
    const b=els[0],pt=pageTag(),i=S.pages.findIndex(p=>p.id===t.value);
    if(i<0){if(b.tag===pt.id)b.tag='';}else{b.tag=pt.id;b.mode='radio';b.value=i;b.led=true;}
    renderEl(b);renderRight();
  }
});
rbody.addEventListener('click',e=>{if(e.target.closest('[data-pgadd2]')){addPage();addPage();}});
/* ---- Project tab: rename, reorder and remove pages ---- */
const projectHTMLPg=projectHTML;
projectHTML=function(){
  return sec('Pages',(S.pages.length?S.pages.map((p,i)=>'<div class="pgrow"><input type="text" data-pgname="'+p.id+'" value="'+esc(p.name)+'" aria-label="Page '+(i+1)+' name">'
      +'<button type="button" class="btn" data-pgup="'+i+'"'+(i?'':' disabled')+' aria-label="Move '+esc(p.name)+' up">↑</button><button type="button" class="btn danger" data-pgdel="'+p.id+'" aria-label="Remove '+esc(p.name)+'">✕</button></div>').join(''):'<p class="hint">No pages: everything is on one screen.</p>')
    +'<div class="chips"><button type="button" class="btn" data-pgadd3="1">Add a page</button></div><p class="hint">Each page is a tab of the instrument. Elements with Always show appear on every page.</p>')+projectHTMLPg();
};
rbody.addEventListener('input',e=>{const t=e.target;if(!t.dataset.pgname)return;const p=S.pages.find(x=>x.id===t.dataset.pgname);if(p){p.name=t.value||p.name;syncPageTag();renderPageBar();refreshDisplays();}});
rbody.addEventListener('click',e=>{
  const a=e.target.closest('[data-pgadd3]'),d=e.target.closest('[data-pgdel]'),u=e.target.closest('[data-pgup]');
  if(a)addPage();
  else if(d)delPage(d.dataset.pgdel);
  else if(u){const i=+u.dataset.pgup;if(i>0){const cur=curPageIdx(),p=S.pages.splice(i,1)[0];S.pages.splice(i-1,0,p);
    S.els.forEach(x=>{const pt=pageTag();if(pt&&x.tag===pt.id&&x.mode==='radio'){if(x.value===i)x.value=i-1;else if(x.value===i-1)x.value=i;}});
    pagesChanged();goPage(cur===i?i-1:cur===i-1?i:cur);}}
});
/* ---- saved with the project ---- */
(function(){
  const s0=snapshot;snapshot=function(){const s=s0();s.pages=JSON.parse(JSON.stringify(S.pages));return s;};
  const r0=restore;restore=function(sn){r0(sn);S.pages=sn&&sn.pages?JSON.parse(JSON.stringify(sn.pages)):[];syncPageTag();};
})();
renderPageBar();
