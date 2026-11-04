import {openLibrary} from './library.js';
import {Engine} from './engine.js';
import {noteName,fmtBytes} from '../../../packages/core/src/index.js';
const $=s=>document.querySelector(s),eng=new Engine(),libs=[];let cur=-1,base=48;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),3500);}
function art(L,cls){
  return L.images.tile?'<img alt="" src="'+L.images.tile+'">':'<div class="fallback" style="background:linear-gradient(135deg,'+esc(L.lib.accent||'#4f7db8')+',#10161f)">'+esc(L.lib.name)+'</div>';
}
function renderTiles(){
  $('#tiles').innerHTML=libs.map((L,i)=>'<button type="button" class="tile'+(i===cur?' on':'')+'" data-i="'+i+'"><div class="art">'+art(L)+'</div><div class="meta"><b>'+esc(L.lib.name)+'</b><span>'+esc(L.lib.author||'Unknown author')+' · v'+esc(L.lib.version)+'</span><span class="muted">'+esc(L.lib.category||'')+'</span></div></button>').join('');
  $('#emptyHint').hidden=libs.length>0;
}
$('#tiles').addEventListener('mousemove',e=>{
  const a=e.target.closest('.art');if(!a)return;const r=a.getBoundingClientRect(),x=((e.clientX-r.left)/r.width-.5)*2,y=((e.clientY-r.top)/r.height-.5)*2,im=a.firstElementChild;
  im.style.transform='scale(1.06) translate('+(-x*2.2).toFixed(2)+'%,'+(-y*2.2).toFixed(2)+'%)';
});
$('#tiles').addEventListener('mouseout',e=>{const a=e.target.closest('.art');if(a)a.firstElementChild.style.transform='';});
$('#tiles').addEventListener('click',e=>{const t=e.target.closest('.tile');if(t)select(+t.dataset.i);});
function select(i){
  cur=i;const L=libs[i];eng.load(L);renderTiles();
  const m=L.lib,tags=String(m.tags||'').split(',').map(x=>x.trim()).filter(Boolean),b=L.bake||{};
  const wide=L.images.wide?'<img class="wide" alt="'+esc(m.name)+' banner" src="'+L.images.wide+'">':'<div class="wide fb" style="background:linear-gradient(135deg,'+esc(m.accent||'#4f7db8')+',#10161f)">'+esc(m.name)+'</div>';
  $('#detail').innerHTML=wide+'<div class="cols"><div><h1>'+esc(m.name)+'</h1><div class="byline">'+esc(m.author||'Unknown author')+' · version '+esc(m.version)+' · '+esc(m.category||'')+'</div>'
    +'<div class="chips">'+tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+(b.enabled?'<span class="chip warn">Baked, every '+b.step+' keys</span>':'<span class="chip ok">Live interpolation</span>')+'</div>'
    +(m.desc?'<p>'+esc(m.desc)+'</p>':'')+(m.web?'<p><a href="'+esc(m.web)+'" target="_blank" rel="noopener noreferrer">'+esc(m.web)+'</a></p>':'')
    +(m.changelog?'<div class="card"><h3>Changelog</h3><pre class="lic">'+esc(m.changelog)+'</pre></div>':'')+(m.licence?'<div class="card"><h3>Licence and credits</h3><pre class="lic">'+esc(m.licence)+'</pre></div>':'')+'</div>'
    +'<div><div class="card"><h3>Contents</h3><dl><dt>File size</dt><dd>'+fmtBytes(L.bytes)+'</dd><dt>Samples</dt><dd>'+L.manifest.samples.length+'</dd><dt>Zones</dt><dd>'+L.zones.length+'</dd><dt>Groups</dt><dd>'+L.groups.length+'</dd><dt>Audio</dt><dd>'+L.manifest.samples[0].bits+'-bit</dd></dl></div>'
    +'<div class="card"><h3>Groups</h3><div class="chips">'+L.groups.map(g=>'<span class="chip">'+esc(g)+'</span>').join('')+'</div></div></div></div>';
  $('#stageEmpty').hidden=true;$('#detail').hidden=false;$('#keysBar').hidden=false;document.documentElement.style.setProperty('--kh',$('#keysBar').offsetHeight+'px');
}
async function addFile(bytes,name){
  try{const L=await openLibrary(bytes);libs.push(L);select(libs.length-1);toast('Opened '+L.lib.name);}
  catch(err){toast('Could not open '+(name||'file')+': '+err.message);console.error(err);}
}
async function fromFile(f){addFile(new Uint8Array(await f.arrayBuffer()),f.name);}
$('#btnOpen').onclick=()=>{$('#fileIn').value='';$('#fileIn').click();};
$('#fileIn').onchange=()=>{const f=$('#fileIn').files[0];if(f)fromFile(f);};
$('#btnDemo').onclick=async()=>{try{const r=await fetch('examples/rompler-demo.vsamp');if(!r.ok)throw new Error(r.status);addFile(new Uint8Array(await r.arrayBuffer()),'demo');}catch(e){toast('Demo library not found');}};
let dc=0;
addEventListener('dragenter',e=>{e.preventDefault();dc++;$('#drop').hidden=false;});addEventListener('dragleave',()=>{if(--dc<=0){dc=0;$('#drop').hidden=true;}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dc=0;$('#drop').hidden=true;const f=e.dataTransfer.files[0];if(f)fromFile(f);});
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
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(k==='z'){base=Math.max(24,base-12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k==='x'){base=Math.min(96,base+12);$('#oct').textContent='Octave '+noteName(base);return;}
  if(k in keyMap){const n=base+keyMap[k];keyNote.set(k,n);on(n,100);}
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(keyNote.has(k)){off(keyNote.get(k));keyNote.delete(k);}});
$('#vol').oninput=e=>{eng.volume=+e.target.value;};
$('#btnPanic').onclick=()=>{eng.panic();[...down].forEach(n=>{down.delete(n);lit(n,false);});};
/* MIDI keyboards */
if(navigator.requestMIDIAccess)navigator.requestMIDIAccess().then(a=>{
  const hook=()=>{let n=0;a.inputs.forEach(i=>{n++;i.onmidimessage=m=>{const [s,d1,d2]=m.data,c=s&240;if(c===144&&d2>0)on(d1,d2);else if(c===128||c===144)off(d1);else if(c===176&&d1===123)$('#btnPanic').click();};});$('#midi').textContent='MIDI: '+(n?n+' device'+(n>1?'s':''):'not connected');};
  hook();a.onstatechange=hook;
}).catch(()=>{});
buildPiano();renderTiles();
window.__player={eng,libs,addFile,select};
