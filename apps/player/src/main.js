import {openLibrary} from './library.js';
import {Engine} from './engine.js';
import {saveLib,removeLib,allLibs} from './store.js';
import {noteName,fmtBytes} from '../../../packages/core/src/index.js';
const $=s=>document.querySelector(s),eng=new Engine();
let libs=[],cur=null,filterTab='category';const filters=new Set();let query='',base=48;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),3500);}
const tagsOf=L=>String(L.lib.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
/* ---------- browser ---------- */
function art(L){
  return L.images.tile?'<img alt="" draggable="false" src="'+L.images.tile+'">':'<div class="fallback" style="background:linear-gradient(135deg,'+esc(L.lib.accent||'#4f7db8')+',#10161f)">'+esc(L.lib.name)+'</div>';
}
function visible(){
  const q=query.trim().toLowerCase();
  return libs.filter(L=>{
    if(filters.size){const have=new Set([L.lib.category,...tagsOf(L)].map(x=>String(x).toLowerCase()));for(const f of filters)if(!have.has(f.toLowerCase()))return false;}
    if(q){const hay=[L.lib.name,L.lib.author,L.lib.category,L.lib.tags,L.lib.desc].join(' ').toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false;}
    return true;
  });
}
function renderChips(){
  const vals=new Map();
  libs.forEach(L=>{(filterTab==='category'?[L.lib.category]:tagsOf(L)).filter(Boolean).forEach(v=>vals.set(v,(vals.get(v)||0)+1));});
  const list=[...vals.keys()].sort((a,b)=>a.localeCompare(b));
  $('#chips').innerHTML=list.length?list.map(v=>'<button type="button" class="fchip" aria-pressed="'+filters.has(v)+'" data-f="'+esc(v)+'">'+esc(v)+'</button>').join(''):'<span class="muted">Nothing to filter yet.</span>';
  document.querySelectorAll('[data-ft]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ft===filterTab)));
}
function renderGrid(){
  const v=visible();
  $('#grid').innerHTML=v.map(L=>'<div class="tile" role="button" tabindex="0" data-id="'+esc(L.lib.id)+'" aria-label="Open '+esc(L.lib.name)+'"><div class="art">'+art(L)+'</div><div class="name" title="'+esc(L.lib.name+' · '+(L.lib.author||''))+'">'+esc(L.lib.name)+'</div><button type="button" class="rm" data-rm="'+esc(L.lib.id)+'" title="Remove from this list" aria-label="Remove '+esc(L.lib.name)+'">&times;</button></div>').join('')
    +'<button type="button" class="tile add" id="tileAdd"><div class="art"><span>+</span></div><div class="name">Add library</div></button>';
  $('#count').textContent='Show '+v.length+' librar'+(v.length===1?'y':'ies')+(v.length!==libs.length?' of '+libs.length:'');
  $('#emptyBox').hidden=libs.length>0;$('#grid').hidden=libs.length===0;
  $('#qClear').hidden=!query;
}
function renderBrowse(){renderChips();renderGrid();}
$('#grid').addEventListener('mousemove',e=>{
  const a=e.target.closest('.art');if(!a||!a.firstElementChild||a.parentElement.classList.contains('add'))return;
  const r=a.getBoundingClientRect(),x=((e.clientX-r.left)/r.width-.5)*2,y=((e.clientY-r.top)/r.height-.5)*2;
  a.firstElementChild.style.transform='scale(1.08) translate('+(-x*2.4).toFixed(2)+'%,'+(-y*2.4).toFixed(2)+'%)';
});
$('#grid').addEventListener('mouseout',e=>{const a=e.target.closest('.art');if(a&&a.firstElementChild)a.firstElementChild.style.transform='';});
$('#grid').addEventListener('click',e=>{
  if(e.target.closest('#tileAdd')){$('#btnOpen').click();return;}
  const rm=e.target.closest('[data-rm]');if(rm){e.stopPropagation();removeFromList(rm.dataset.rm);return;}
  const t=e.target.closest('.tile[data-id]');if(t)play(t.dataset.id);
});
$('#grid').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const t=e.target.closest('.tile[data-id]');if(t){e.preventDefault();play(t.dataset.id);}}});
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;const f=b.dataset.f;filters.has(f)?filters.delete(f):filters.add(f);renderBrowse();});
document.querySelectorAll('[data-ft]').forEach(b=>b.addEventListener('click',()=>{filterTab=b.dataset.ft;renderChips();}));
$('#q').addEventListener('input',e=>{query=e.target.value;renderGrid();});
$('#qClear').addEventListener('click',()=>{$('#q').value='';query='';renderGrid();$('#q').focus();});
async function removeFromList(id){libs=libs.filter(L=>L.lib.id!==id);await removeLib(id);renderBrowse();toast('Removed from the list. The file itself is untouched.');}
/* ---------- adding libraries ---------- */
async function addFile(bytes,name,quiet){
  try{
    const L=await openLibrary(bytes),i=libs.findIndex(x=>x.lib.id===L.lib.id);
    if(i>=0)libs[i]=L;else libs.push(L);
    libs.sort((a,b)=>a.lib.name.localeCompare(b.lib.name));
    await saveLib(L.lib.id,bytes);renderBrowse();if(!quiet)toast((i>=0?'Updated ':'Added ')+L.lib.name);return L;
  }catch(err){toast('Could not open '+(name||'file')+': '+err.message);console.error(err);}
}
async function fromFiles(list){for(const f of list)await addFile(new Uint8Array(await f.arrayBuffer()),f.name);}
$('#btnOpen').onclick=()=>{$('#fileIn').value='';$('#fileIn').click();};
$('#btnAdd2').onclick=()=>$('#btnOpen').click();
$('#fileIn').onchange=()=>fromFiles($('#fileIn').files);
$('#btnDemo').onclick=async()=>{try{const r=await fetch('examples/rompler-demo.vsamp');if(!r.ok)throw new Error(r.status);await addFile(new Uint8Array(await r.arrayBuffer()),'demo');}catch(e){toast('Demo library not found');}};
let dc=0;
addEventListener('dragenter',e=>{e.preventDefault();dc++;$('#drop').hidden=false;});addEventListener('dragleave',()=>{if(--dc<=0){dc=0;$('#drop').hidden=true;}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dc=0;$('#drop').hidden=true;fromFiles(e.dataTransfer.files);});
/* ---------- play mode ---------- */
function setMode(m){
  document.body.dataset.mode=m;const p=m==='play';
  $('#browse').hidden=p;$('#play').hidden=!p;$('#btnBack').hidden=!p;$('#voices').hidden=!p;$('#btnPanic').hidden=!p;$('#btnOpen').hidden=p;$('#curTitle').textContent=p&&cur?cur.lib.name:'';
  if(p)document.documentElement.style.setProperty('--kh',$('#keysBar').offsetHeight+'px');
}
async function play(id){
  const L=libs.find(x=>x.lib.id===id);if(!L)return;
  $('#grid').classList.add('busy');
  try{
    await L.load();cur=L;eng.load(L);renderDetail(L);setMode('play');eng.ensure();
  }catch(err){toast('Could not load '+L.lib.name+': '+err.message);console.error(err);}
  $('#grid').classList.remove('busy');
}
function leave(){eng.panic();[...down].forEach(n=>{down.delete(n);lit(n,false);});cur=null;setMode('browse');}
$('#btnBack').onclick=leave;
addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.dataset.mode==='play')leave();});
function renderDetail(L){
  const m=L.lib,tags=tagsOf(L),b=L.bake||{};
  const wide=L.images.wide?'<img class="wide" alt="'+esc(m.name)+' banner" src="'+L.images.wide+'">':'<div class="wide fb" style="background:linear-gradient(135deg,'+esc(m.accent||'#4f7db8')+',#10161f)">'+esc(m.name)+'</div>';
  $('#detail').innerHTML=wide+'<div class="cols"><div><h1>'+esc(m.name)+'</h1><div class="byline">'+esc(m.author||'Unknown author')+' · version '+esc(m.version)+' · '+esc(m.category||'')+'</div>'
    +'<div class="chips">'+tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+(b.enabled?'<span class="chip warn">Baked, every '+b.step+' keys</span>':'<span class="chip ok">Live interpolation</span>')+'</div>'
    +(m.desc?'<p>'+esc(m.desc)+'</p>':'')+(m.web?'<p><a href="'+esc(m.web)+'" target="_blank" rel="noopener noreferrer">'+esc(m.web)+'</a></p>':'')
    +(m.changelog?'<div class="card"><h3>Changelog</h3><pre class="lic">'+esc(m.changelog)+'</pre></div>':'')+(m.licence?'<div class="card"><h3>Licence and credits</h3><pre class="lic">'+esc(m.licence)+'</pre></div>':'')+'</div>'
    +'<div><div class="card"><h3>Contents</h3><dl><dt>File size</dt><dd>'+fmtBytes(L.bytes)+'</dd><dt>Samples</dt><dd>'+L.manifest.samples.length+'</dd><dt>Zones</dt><dd>'+L.zones.length+'</dd><dt>Groups</dt><dd>'+L.groups.length+'</dd><dt>Audio</dt><dd>'+L.manifest.samples[0].bits+'-bit</dd></dl></div>'
    +'<div class="card"><h3>Groups</h3><div class="chips">'+L.groups.map(g=>'<span class="chip">'+esc(g)+'</span>').join('')+'</div></div></div></div>';
}
/* ---- keyboard ---- */
const LO=36,HI=96,isBlack=n=>[1,3,6,8,10].includes(n%12),down=new Set(),keyNote=new Map();
function buildPiano(){
  const p=$('#piano'),whites=[];for(let n=LO;n<=HI;n++)if(!isBlack(n))whites.push(n);
  const w=100/whites.length;let h='';
  whites.forEach((n,i)=>{h+='<div class="wk" data-n="'+n+'" style="left:'+i*w+'%;width:'+w+'%">'+(n%12===0?'<i>'+noteName(n)+'</i>':'')+'</div>';});
  for(let n=LO;n<=HI;n++)if(isBlack(n)){const i=whites.indexOf(n-1);h+='<div class="bk" data-n="'+n+'" style="left:'+((i+1)*w-w*.3)+'%;width:'+w*.6+'%"></div>';}
  p.innerHTML=h;
}
function lit(n,on){const e=$('#piano [data-n="'+n+'"]');if(e)e.classList.toggle('on',on);}
function on(n,v){if(down.has(n))return;down.add(n);lit(n,true);eng.noteOn(n,v||100);vc();}
function off(n){if(!down.delete(n))return;lit(n,false);eng.noteOff(n);vc();}
function vc(){$('#voices').textContent=eng.active+' voices';}
setInterval(vc,500);
let mouseN=null;
$('#piano').addEventListener('pointerdown',e=>{const k=e.target.closest('[data-n]');if(!k)return;e.preventDefault();try{$('#piano').setPointerCapture(e.pointerId);}catch(_){}mouseN=+k.dataset.n;const r=k.getBoundingClientRect();on(mouseN,60+Math.round((e.clientY-r.top)/r.height*67));});
$('#piano').addEventListener('pointermove',e=>{if(mouseN==null)return;const k=document.elementFromPoint(e.clientX,e.clientY),el=k&&k.closest('[data-n]');if(el&&+el.dataset.n!==mouseN){off(mouseN);mouseN=+el.dataset.n;on(mouseN,90);}});
['pointerup','pointercancel'].forEach(t=>$('#piano').addEventListener(t,()=>{if(mouseN!=null){off(mouseN);mouseN=null;}}));
const KM='awsedftgyhujkolpò;'.split('').slice(0,17);
const keyMap={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15,';':16};
addEventListener('keydown',e=>{
  if(document.body.dataset.mode!=='play'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(k==='z'){base=Math.max(24,base-12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k==='x'){base=Math.min(96,base+12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k in keyMap){const n=base+keyMap[k];keyNote.set(k,n);on(n,100);}
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(keyNote.has(k)){off(keyNote.get(k));keyNote.delete(k);}});
const setVol=v=>{eng.volume=v;$('#vol').value=v;$('#vol2').value=v;};
$('#vol').oninput=e=>setVol(+e.target.value);$('#vol2').oninput=e=>setVol(+e.target.value);
$('#btnPanic').onclick=()=>{eng.panic();[...down].forEach(n=>{down.delete(n);lit(n,false);});};
/* MIDI keyboards */
if(navigator.requestMIDIAccess)navigator.requestMIDIAccess().then(a=>{
  const hook=()=>{let n=0;a.inputs.forEach(i=>{n++;i.onmidimessage=m=>{const [s,d1,d2]=m.data,c=s&240;if(c===144&&d2>0)on(d1,d2);else if(c===128||c===144)off(d1);else if(c===176&&d1===123)$('#btnPanic').click();};});$('#midi').textContent='MIDI: '+(n?n+' device'+(n>1?'s':''):'not connected');};
  hook();a.onstatechange=hook;
}).catch(()=>{});


buildPiano();
(async()=>{for(const r of await allLibs())await addFile(r.bytes,'saved library',true);renderBrowse();})();
renderBrowse();
window.__player={eng,get libs(){return libs;},addFile,play,leave};
