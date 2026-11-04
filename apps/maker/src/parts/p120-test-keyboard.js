/* ---------- test keyboard ---------- */
const KB={lo:48,hi:72};
const KEYS={a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72,o:73,l:74};
function buildKb(){
  const whites=[],blacks=[];
  for(let m=KB.lo;m<=KB.hi;m++){([1,3,6,8,10].includes(m%12)?blacks:whites).push(m);}
  const ww=100/whites.length;
  $('#kb').innerHTML=whites.map((m,i)=>'<button type="button" class="wk" data-m="'+m+'" style="left:'+i*ww+'%;width:'+ww+'%" aria-label="Note '+m+'"></button>').join('')
    +blacks.map(m=>{const wi=whites.filter(w=>w<m).length;return '<button type="button" class="bk" data-m="'+m+'" style="left:'+(wi*ww-ww*.3)+'%;width:'+ww*.6+'%" aria-label="Note '+m+'"></button>';}).join('');
}
$('#kb').addEventListener('pointerdown',e=>{
  const b=e.target.closest('[data-m]'); if(!b) return; e.preventDefault();
  const m=+b.dataset.m; noteOn(m); b.classList.add('on');
  const up=()=>{noteOff(m);b.classList.remove('on');window.removeEventListener('pointerup',up);};
  window.addEventListener('pointerup',up);
});
const typing=t=>t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT');
function keyBtn(m){return $('#kb [data-m="'+m+'"]');}
document.addEventListener('keydown',e=>{
  if(S.view==='map'){if(!typing(e.target))mapKey(e);return;}
  if(S.view==='samples'){if(!typing(e.target))smKey(e);return;}
  if(S.view!=='design'){if(!typing(e.target)&&!e.ctrlKey&&!e.metaKey)fxKey(e);return;}
  if(typing(e.target)||e.ctrlKey||e.metaKey) {
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&S.mode==='design'&&!typing(e.target)&&sel()){e.preventDefault();dupEl();}
    return;
  }
  if(S.mode==='test'){
    const m=KEYS[e.key.toLowerCase()];
    if(m!==undefined&&!e.repeat){noteOn(m,100);const b=keyBtn(m);if(b)b.classList.add('on');}
    return;
  }
  const el=sel(); if(!el) return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();delEl();}
  else if(e.key==='Escape') select(null);
  else if(e.key.startsWith('Arrow')){
    e.preventDefault(); const s=e.shiftKey?10:1;
    if(e.key==='ArrowLeft') el.x-=s; if(e.key==='ArrowRight') el.x+=s;
    if(e.key==='ArrowUp') el.y-=s; if(e.key==='ArrowDown') el.y+=s;
    renderEl(el); placeSel(); syncPosFields();
  }
});
document.addEventListener('keyup',e=>{
  const m=KEYS[e.key.toLowerCase()];
  if(m!==undefined&&(S.mode==='test'||S.view==='map'||S.view==='samples')&&!typing(e.target)){noteOff(m);mapKeyUp(m);smKeyUp(m);const b=keyBtn(m);if(b)b.classList.remove('on');}
});

