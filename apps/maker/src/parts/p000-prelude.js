const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const dpr=()=>window.devicePixelRatio||1;
let uid=1; const nid=p=>p+(uid++);


/* NodeFX (apps/maker/nodefx.html) builds the Effects editor alone into the NodeFX plugin; the Maker never sets this */
const NODEFX=!!window.__NODEFX;
/* follow the pointer until it is let go */
function drag(mv,end){
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(end)end();};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
}
