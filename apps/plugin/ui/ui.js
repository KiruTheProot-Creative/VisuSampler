/* VisuPlayer plugin window: library browser first, then play mode. All audio and files are handled by the plugin. */
import {call,on} from './bridge.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NOTE=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],noteName=n=>NOTE[((n%12)+12)%12]+(Math.floor(n/12)-2);
const fmtBytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';
let libs=[],folder='',cur=null,st={},filterTab='category',query='',base=48,imgV=1;const filters=new Set();
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),3500);}
const tagsOf=L=>String(L.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
/* banner images are served by the plugin; the test page can point them elsewhere */
const img=(L,k)=>window.__visuImageUrl?window.__visuImageUrl(L.id,k):'lib/'+encodeURIComponent(L.id)+'/'+k+'.png?v='+imgV;
/* ---------- browser ---------- */
function art(L){
  return L.hasTile?'<img alt="" draggable="false" src="'+img(L,'tile')+'">':'<div class="fallback" style="background:linear-gradient(135deg,'+esc(L.accent||'#4f7db8')+',#10161f)">'+esc(L.name)+'</div>';
}
function visible(){
  const q=query.trim().toLowerCase();
  return libs.filter(L=>{
    if(filters.size){const have=new Set([L.category,...tagsOf(L)].map(x=>String(x).toLowerCase()));for(const f of filters)if(!have.has(f.toLowerCase()))return false;}
    if(q){const hay=[L.name,L.author,L.category,L.tags,L.desc].join(' ').toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false;}
    return true;
  });
}
function renderChips(){
  const vals=new Map();
  libs.forEach(L=>{(filterTab==='category'?[L.category]:tagsOf(L)).filter(Boolean).forEach(v=>vals.set(v,(vals.get(v)||0)+1));});
  const list=[...vals.keys()].sort((a,b)=>a.localeCompare(b));
  $('#chips').innerHTML=list.length?list.map(v=>'<button type="button" class="fchip" aria-pressed="'+filters.has(v)+'" data-f="'+esc(v)+'">'+esc(v)+'</button>').join(''):'<span class="muted">Nothing to filter yet.</span>';
  document.querySelectorAll('[data-ft]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ft===filterTab)));
}
function renderGrid(){
  const v=visible();
  $('#grid').innerHTML=v.map(L=>'<div class="tile" role="button" tabindex="0" data-id="'+esc(L.id)+'" aria-label="Open '+esc(L.name)+'"><div class="art">'+art(L)+'</div><div class="name" title="'+esc(L.name+' · '+(L.author||''))+'">'+esc(L.name)+'</div></div>').join('')
    +'<button type="button" class="tile add" id="tileAdd"><div class="art"><span>+</span></div><div class="name">Add library</div></button>';
  $('#count').textContent='Show '+v.length+' librar'+(v.length===1?'y':'ies')+(v.length!==libs.length?' of '+libs.length:'');
  $('#emptyBox').hidden=libs.length>0;$('#grid').hidden=libs.length===0;$('#qClear').hidden=!query;
  $('#folderPath').textContent=folder?'Library folder: '+folder:'';
}
function renderBrowse(){renderChips();renderGrid();}
$('#grid').addEventListener('mousemove',e=>{
  const a=e.target.closest('.art');if(!a||!a.firstElementChild||a.parentElement.classList.contains('add'))return;
  const r=a.getBoundingClientRect(),x=((e.clientX-r.left)/r.width-.5)*2,y=((e.clientY-r.top)/r.height-.5)*2;
  a.firstElementChild.style.transform='scale(1.08) translate('+(-x*2.4).toFixed(2)+'%,'+(-y*2.4).toFixed(2)+'%)';
});
$('#grid').addEventListener('mouseout',e=>{const a=e.target.closest('.art');if(a&&a.firstElementChild)a.firstElementChild.style.transform='';});
$('#grid').addEventListener('click',e=>{
  if(e.target.closest('#tileAdd')){addLibrary();return;}
  const t=e.target.closest('.tile[data-id]');if(t)open(t.dataset.id);
});
$('#grid').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const t=e.target.closest('.tile[data-id]');if(t){e.preventDefault();open(t.dataset.id);}}});
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;const f=b.dataset.f;filters.has(f)?filters.delete(f):filters.add(f);renderBrowse();});
document.querySelectorAll('[data-ft]').forEach(b=>b.addEventListener('click',()=>{filterTab=b.dataset.ft;renderChips();}));
$('#q').addEventListener('input',e=>{query=e.target.value;renderGrid();});
$('#qClear').addEventListener('click',()=>{$('#q').value='';query='';renderGrid();$('#q').focus();});
function setLibs(d){libs=(d&&d.libs)||[];folder=(d&&d.folder)||'';imgV++;libs.sort((a,b)=>a.name.localeCompare(b.name));renderBrowse();if(cur){const n=libs.find(l=>l.id===cur.id);if(n){cur=n;}}}
async function addLibrary(){const r=await call('addLibrary');if(r&&r.added)toast('Added '+r.added+' librar'+(r.added===1?'y':'ies'));}
$('#btnAdd').onclick=addLibrary;$('#btnAdd2').onclick=addLibrary;
$('#btnFolder').onclick=()=>call('openFolder');
/* ---------- play mode ---------- */
function setModeTitle(){}
function setMode(m){
  document.body.dataset.mode=m;const p=m==='play';
  if(!p)hideUI();
  $('#browse').hidden=p;$('#play').hidden=!p;$('#btnBack').hidden=!p;$('#voices').hidden=!p;$('#btnAdd').hidden=p;$('#btnFolder').hidden=p;if(!p)$('#btnAbout').hidden=true;
  $('#curTitle').textContent=p&&cur?cur.name:'';
}
async function open(id){
  const L=libs.find(x=>x.id===id);if(!L)return;
  cur=L;renderDetail();setMode('play');$('#detail').classList.add('loading');
  const r=await call('loadLibrary',id);
  if(r&&r.error){toast('Could not load '+L.name+': '+r.error);}
}
async function leave(){call('scopeOn',false);releaseAll();hideUI();await call('unload');cur=null;st={};setMode('browse');}
$('#btnBack').onclick=leave;
addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!ctxOpen&&document.body.dataset.mode==='play')leave();});
function renderDetail(){
  const m=cur;if(!m)return;const tags=tagsOf(m),lists=st.lists||[];
  const wide=m.hasWide?'<img class="wide" alt="'+esc(m.name)+' banner" src="'+img(m,'wide')+'">':'<div class="wide fb" style="background:linear-gradient(135deg,'+esc(m.accent||'#4f7db8')+',#10161f)">'+esc(m.name)+'</div>';
  const bad=(st.unsupported||[]).length?'<div class="status warn">This library uses features this VisuPlayer version cannot play yet: '+esc(st.unsupported.join(', '))+'.</div>':'';
  $('#detail').innerHTML=wide+'<div class="cols"><div><h1>'+esc(m.name)+'</h1><div class="byline">'+esc(m.author||'Unknown author')+' · version '+esc(m.version)+' · '+esc(m.category||'')+'</div>'
    +'<div class="status" id="status">'+esc(st.text||'Loading…')+'</div>'+bad
    +(lists.length?'<div class="lists" role="group" aria-label="Sound list">'+lists.map((l,i)=>'<button type="button" data-list="'+i+'" aria-pressed="'+(i===st.list)+'">'+esc(l.name)+'</button>').join('')+'</div>':'')
    +'<div class="chips">'+tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+'</div>'
    +(m.desc?'<p>'+esc(m.desc)+'</p>':'')
    +(m.changelog?'<div class="card"><h3>Changelog</h3><pre class="lic">'+esc(m.changelog)+'</pre></div>':'')+(m.licence?'<div class="card"><h3>Licence and credits</h3><pre class="lic">'+esc(m.licence)+'</pre></div>':'')+'</div>'
    +'<div><div class="card"><h3>Contents</h3><dl><dt>File size</dt><dd>'+fmtBytes(m.size||0)+'</dd>'+(st.zones!=null?'<dt>Zones</dt><dd>'+st.zones+'</dd><dt>Groups</dt><dd>'+st.groups+'</dd>':'')+'</dl></div></div></div>';
  $('#detail').classList.toggle('loading',!!st.loading);
}
$('#detail').addEventListener('click',e=>{const b=e.target.closest('[data-list]');if(b){call('setList',+b.dataset.list);st.list=+b.dataset.list;renderDetail();if(uiReady)frame.contentWindow.postMessage({t:'list',index:st.list},'*');}});
/* ---------- keyboard ---------- */
let LO=36;const HI=96,isBlack=n=>[1,3,6,8,10].includes(n%12),down=new Set(),keyNote=new Map();
function buildPiano(){
  const p=$('#piano'),whites=[];for(let n=LO;n<=HI;n++)if(!isBlack(n))whites.push(n);
  const w=100/whites.length;let h='';
  whites.forEach((n,i)=>{h+='<div class="wk" data-n="'+n+'" style="left:'+i*w+'%;width:'+w+'%">'+(n%12===0?'<i>'+noteName(n)+'</i>':'')+'</div>';});
  for(let n=LO;n<=HI;n++)if(isBlack(n)){const i=whites.indexOf(n-1);h+='<div class="bk" data-n="'+n+'" style="left:'+((i+1)*w-w*.3)+'%;width:'+w*.6+'%"></div>';}
  p.innerHTML=h;
}
function lit(n,on){const e=$('#piano [data-n="'+n+'"]');if(e)e.classList.toggle('on',on);}
function on_(n,v){if(down.has(n))return;down.add(n);lit(n,true);call('noteOn',n,v||100);}
function off(n){if(!down.delete(n))return;lit(n,false);call('noteOff',n);}
function releaseAll(){[...down].forEach(off);}
let mouseN=null;
$('#piano').addEventListener('pointerdown',e=>{const k=e.target.closest('[data-n]');if(!k)return;e.preventDefault();try{$('#piano').setPointerCapture(e.pointerId);}catch(_){}mouseN=+k.dataset.n;const r=k.getBoundingClientRect();on_(mouseN,60+Math.round((e.clientY-r.top)/r.height*67));});
$('#piano').addEventListener('pointermove',e=>{if(mouseN==null)return;const k=document.elementFromPoint(e.clientX,e.clientY),el=k&&k.closest('[data-n]');if(el&&+el.dataset.n!==mouseN){off(mouseN);mouseN=+el.dataset.n;on_(mouseN,90);}});
['pointerup','pointercancel'].forEach(t=>$('#piano').addEventListener(t,()=>{if(mouseN!=null){off(mouseN);mouseN=null;}}));
const keyMap={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16};
addEventListener('keydown',e=>{
  if(document.body.dataset.mode!=='play'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(k==='z'){base=Math.max(24,base-12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k==='x'){base=Math.min(96,base+12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k in keyMap){const n=base+keyMap[k];keyNote.set(k,n);on_(n,100);}
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(keyNote.has(k)){off(keyNote.get(k));keyNote.delete(k);}});
const setVol=v=>{$('#vol').value=v;$('#vol2').value=v;call('setVolume',v);};
$('#vol').oninput=e=>setVol(+e.target.value);$('#vol2').oninput=e=>setVol(+e.target.value);
$('#btnPanic').onclick=()=>{releaseAll();call('panic');};
/* ---------- events from the plugin ---------- */
on('libraries',d=>setLibs(d));
on('status',d=>{const was=st;st=d||{};
  if(uiReady&&st.list!=null&&st.list>=0&&st.list!==was.list&&st.currentId===was.currentId)frame.contentWindow.postMessage({t:'list',index:st.list},'*');   /* e.g. a keyswitch */
  markKeyswitches();
  if(st.currentId&&!st.loading&&(was.loading||was.currentId!==st.currentId||!uiFor))showUI();
  if(st.currentId&&(!cur||cur.id!==st.currentId)){const L=libs.find(x=>x.id===st.currentId);if(L){cur=L;setMode('play');}}
  if(cur&&document.body.dataset.mode==='play')renderDetail();});
let hostTempo=null;
on('tempo',d=>{hostTempo=d;if(uiReady&&d)frame.contentWindow.postMessage({t:'tempo',bpm:d.bpm,n:d.n,d:d.d},'*');});
on('scope',d=>{if(uiReady&&d)frame.contentWindow.postMessage({t:'scope',d:d.d,sr:d.sr},'*');});
on('meter',d=>{$('#voices').textContent=(d&&d.voices||0)+' voices';});
on('volume',v=>{$('#vol').value=v;$('#vol2').value=v;});
/* knobs moved by DAW automation or a MIDI controller: the interface follows */
on('tags',d=>{if(uiReady&&d)frame.contentWindow.postMessage({t:'tags',values:d},'*');});
on('mappings',d=>{maps=d||{};if(ctxOpen)ctxRender();});
/* right-click a knob: its automation slot, and MIDI learn */
let maps={},ctxOpen=null;
const ctxEl=document.createElement('div');ctxEl.className='ctxmenu';ctxEl.hidden=true;ctxEl.setAttribute('role','menu');document.body.appendChild(ctxEl);
function ctxClose(){if(ctxOpen&&maps.__learning===ctxOpen.name)call('midiCancel');ctxOpen=null;ctxEl.hidden=true;}
function ctxRender(){
  const m=ctxOpen,mp=maps[m.name]||{},learning=maps.__learning===m.name;
  ctxEl.innerHTML='<div class="ctxh">'+esc(m.name)+'</div>'
    +'<div class="ctxi muted">'+(mp.slot?'DAW automation: '+esc(m.name)+' (slot '+mp.slot+')':'Not automatable (more than 64 knobs)')+'</div>'
    +(mp.slot?(learning?'<button type="button" class="ctxi on" data-c="cancel">Move a knob on your MIDI controller… (click to stop)</button>'
      :'<button type="button" class="ctxi" data-c="learn">'+(mp.cc!=null?'MIDI: CC '+mp.cc+' · learn again':'MIDI learn')+'</button>'
        +(mp.cc!=null?'<button type="button" class="ctxi" data-c="forget">Forget CC '+mp.cc+'</button>':'')):'');
}
async function ctxMenu(m){
  const r=frame.getBoundingClientRect();ctxOpen=m;maps=await call('getMappings')||{};ctxRender();ctxEl.hidden=false;
  const x=Math.min(r.left+m.x,innerWidth-ctxEl.offsetWidth-6),y=Math.min(r.top+m.y,innerHeight-ctxEl.offsetHeight-6);
  ctxEl.style.left=Math.max(4,x)+'px';ctxEl.style.top=Math.max(4,y)+'px';
}
ctxEl.addEventListener('click',async e=>{
  const b=e.target.closest('[data-c]');if(!b||!ctxOpen)return;const c=b.dataset.c,n=ctxOpen.name;
  if(c==='learn')maps=await call('midiLearn',n)||maps;else if(c==='cancel'){maps=await call('midiCancel')||maps;}else if(c==='forget')maps=await call('midiForget',n)||maps;
  ctxRender();
});
addEventListener('pointerdown',e=>{if(ctxOpen&&!ctxEl.contains(e.target))ctxClose();},true);
addEventListener('keydown',e=>{if(e.key==='Escape'&&ctxOpen){e.preventDefault();e.stopImmediatePropagation();ctxClose();}},true);   /* Escape closes only the menu, it does not leave play mode */
/* ---------- the library's own interface (drawn by runtime.html with the Designer's code) ---------- */
let uiFor=null,uiReady=false,uiMsg=null;
const frame=$('#uiFrame');
function hideUI(){$('#presetBox').hidden=true;preMenuClose();uiFor=null;uiReady=false;uiMsg=null;frame.hidden=true;frame.removeAttribute('src');$('#stage').classList.remove('hasui','about');$('#btnAbout').hidden=true;}
async function showUI(){
  const r=await call('getInterface');if(!r||!r.manifest)return;
  let m;try{m=JSON.parse(r.manifest);}catch(e){return;}
  const p=m.project||{};if(!p.els||!p.els.length){hideUI();return;}
  const url=window.__visuAssetUrl||((kind,key)=>'cur/'+kind+'/'+encodeURIComponent(key));
  const assets={},fonts={};
  Object.keys(m.assets||{}).forEach(id=>{const a=m.assets[id];assets[id]={name:a.name,w:a.w,h:a.h,mime:a.mime,url:url('asset',id)};});
  Object.keys(m.fonts||{}).forEach(f=>{fonts[f]=url('font',f);});
  uiFor=r.id;call('scopeOn',!!(p.els||[]).some(e=>e.type==='graph'&&(e.kind==='scope'||e.kind==='spectrum')));uiMsg={t:'load',project:p,assets,fonts,list:r.list,listB:r.listB,patch:r.patch,patchB:r.patchB,tags:r.tags||{}};
  $('#stage').classList.add('hasui');$('#btnAbout').hidden=false;frame.hidden=false;$('#presetBox').hidden=false;presetsRefresh();
  uiReady=false;frame.src='runtime.html?'+Date.now();
}
addEventListener('message',e=>{
  if(e.source!==frame.contentWindow)return;const m=e.data||{};
  if(m.t==='ready'){uiReady=true;if(uiMsg)frame.contentWindow.postMessage(uiMsg,'*');if(hostTempo)frame.contentWindow.postMessage({t:'tempo',bpm:hostTempo.bpm,n:hostTempo.n,d:hostTempo.d},'*');}
  else if(m.t==='list'&&m.index>=0){if(st.list!==m.index){st.list=m.index;call('setList',m.index);}}
  else if(m.t==='patch'&&m.index>=0){call('setPatch',m.layer|0,m.index);}
  else if(m.t==='listB'&&m.index!=null){if(st.listB!==m.index){st.listB=m.index;call('setListB',m.index);}}
  else if(m.t==='tag'){call('setTag',m.name,m.value);}
  else if(m.t==='ctx'){ctxMenu(m);}
});
$('#btnAbout').onclick=()=>{const on=!$('#stage').classList.contains('about');$('#stage').classList.toggle('about',on);$('#btnAbout').setAttribute('aria-pressed',String(on));};
buildPiano();
(async()=>{
  setLibs(await call('getLibraries'));
  const s=await call('getState');if(s){$('#vol').value=s.volume;$('#vol2').value=s.volume;st=s.status||{};if(s.status&&s.status.currentId){const L=libs.find(x=>x.id===s.status.currentId);if(L){cur=L;renderDetail();setMode('play');if(!st.loading)showUI();}}}
})().catch(e=>{console.warn(e);renderBrowse();});
window.__ui={get libs(){return libs;},open,leave};

/* ---- user presets: your own knob settings for this library ---- */
let pre={names:[],current:''};
async function presetsRefresh(){pre=await call('getPresets')||{names:[],current:''};$('#preName').textContent=pre.current||'Library default';}
function preMenuClose(){$('#preMenu').hidden=true;$('#preBtn').setAttribute('aria-expanded','false');}
function preMenuRender(saving){
  const m=$('#preMenu');
  m.innerHTML='<button type="button" class="pmi'+(pre.current?'':' on')+'" data-p="">Library default</button>'
    +pre.names.map(n=>'<div class="pmrow"><button type="button" class="pmi'+(n===pre.current?' on':'')+'" data-p="'+esc(n)+'">'+esc(n)+'</button><button type="button" class="pmx" data-del="'+esc(n)+'" aria-label="Delete '+esc(n)+'" title="Delete">&#10005;</button></div>').join('')
    +'<div class="pmsep"></div>'
    +(saving?'<form class="pmsave" id="preForm"><input id="preNew" type="text" maxlength="80" placeholder="Preset name" aria-label="Preset name" value="'+esc(pre.current||'')+'"><button type="submit" class="btn">Save</button></form>'
      :'<button type="button" class="pmi" data-save="1">Save as…</button>'+(pre.current?'<button type="button" class="pmi" data-over="1">Save “'+esc(pre.current)+'”</button>':''));
  if(saving){const i=$('#preNew');i.focus();i.select();}
}
async function presetApply(name){
  const r=await call('loadPreset',name);if(!r)return;pre.current=r.name||'';$('#preName').textContent=pre.current||'Library default';
  if(uiReady){frame.contentWindow.postMessage({t:'tags',values:r.values||{}},'*');if(r.list!=null&&r.list>=0)frame.contentWindow.postMessage({t:'list',index:r.list},'*');if(r.listB!=null&&r.listB>=0)frame.contentWindow.postMessage({t:'listB',index:r.listB},'*');[r.patch,r.patchB].forEach((x,l)=>{if(x!=null&&x>=0)frame.contentWindow.postMessage({t:'patch',layer:l,index:x},'*');});}
  if(r.list!=null&&r.list>=0)st.list=r.list;if(r.listB!=null&&r.listB>=0)st.listB=r.listB;
}
$('#preBtn').addEventListener('click',async()=>{const m=$('#preMenu');if(!m.hidden){preMenuClose();return;}await presetsRefresh();preMenuRender(false);m.hidden=false;$('#preBtn').setAttribute('aria-expanded','true');});
$('#preMenu').addEventListener('click',async e=>{
  const d=e.target.closest('[data-del]');if(d){pre=await call('deletePreset',d.dataset.del)||pre;$('#preName').textContent=pre.current||'Library default';preMenuRender(false);return;}
  if(e.target.closest('[data-save]')){preMenuRender(true);return;}
  const o=e.target.closest('[data-over]');if(o){pre=await call('savePreset',pre.current)||pre;toast('Saved “'+pre.current+'”');preMenuClose();return;}
  const b=e.target.closest('[data-p]');if(b){await presetApply(b.dataset.p);preMenuClose();}
});
$('#preMenu').addEventListener('submit',async e=>{
  e.preventDefault();const n=$('#preNew').value.trim();if(!n)return;
  pre=await call('savePreset',n)||pre;$('#preName').textContent=pre.current||'Library default';toast(pre.ok===false?'Could not save the preset':'Saved “'+pre.current+'”');preMenuClose();
});
const preStep=async d=>{await presetsRefresh();const all=[''].concat(pre.names),i=Math.max(0,all.indexOf(pre.current||''));await presetApply(all[(i+d+all.length)%all.length]);};
$('#prePrev').addEventListener('click',()=>preStep(-1));$('#preNext').addEventListener('click',()=>preStep(1));
addEventListener('pointerdown',e=>{if(!$('#preMenu').hidden&&!e.target.closest('#presetBox'))preMenuClose();},true);

/* keyswitch keys (notes that pick a list) are coloured on the keyboard, with the list name */
const $$=(q,r)=>[...(r||document).querySelectorAll(q)];
function markKeyswitches(){
  const ks=(st.lists||[]).map(l=>l.ks).filter(n=>n!=null),lo=Math.min(36,...ks.map(n=>Math.floor(n/12)*12));
  if(lo!==LO){LO=Math.max(0,lo);buildPiano();}   /* low keyswitches: the keyboard reaches down to them */
  $$('#piano .ks').forEach(k=>{k.classList.remove('ks','kson');k.removeAttribute('title');});
  (st.lists||[]).forEach((l,i)=>{if(l.ks==null)return;const k=$('#piano [data-n="'+l.ks+'"]');if(!k)return;k.classList.add('ks');if(i===st.list)k.classList.add('kson');k.title='Keyswitch: '+l.name;});
}
