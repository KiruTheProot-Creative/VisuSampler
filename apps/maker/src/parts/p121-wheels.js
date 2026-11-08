/* ---------- pitch and mod wheels (next to the Sound tab's piano and the Test-mode keyboard) ----------
   Drag up and down like the wheels on a keyboard. The pitch wheel springs back to the middle when let go, the mod
   wheel stays where it is left. Arrow keys move them, double-click resets. A MIDI keyboard's own wheels move them
   too (p330). Both go to the engine as MIDI would: pitch bend, and controller 1 (mod wheel). */
const WH={bend:.5,mod:0,drag:null};
const WHEEL_DEF={bend:{label:'Pitch',aria:'Pitch bend',center:.5},mod:{label:'Mod',aria:'Mod wheel',center:0}};
function wheelHTML(){
  return Object.keys(WHEEL_DEF).map(k=>'<div class="whcol"><div class="whl" data-wk="'+k+'" role="slider" tabindex="0" aria-label="'+WHEEL_DEF[k].aria+'" aria-valuemin="0" aria-valuemax="127"'
    +' title="'+WHEEL_DEF[k].aria+(k==='bend'?': drag, springs back when let go':': drag, stays where you leave it')+' · double-click resets"><i></i></div><span>'+WHEEL_DEF[k].label+'</span></div>').join('');
}
function wheelShow(k,v){
  WH[k]=v;
  $$('.whl[data-wk="'+k+'"]').forEach(el=>{
    el.style.setProperty('--v',v);
    el.setAttribute('aria-valuenow',k==='bend'?Math.round((v-.5)*2*100):Math.round(v*127));
    el.setAttribute('aria-valuetext',k==='bend'?(Math.abs(v-.5)<.004?'centre':(v>.5?'up ':'down ')+Math.round(Math.abs(v-.5)*200)+'%'):Math.round(v*127)+' of 127');
    el.classList.toggle('moved',Math.abs(v-WHEEL_DEF[k].center)>.004);
  });
}
function wheelSend(k,v){
  v=clamp(v,0,1);if(k==='bend'&&Math.abs(v-.5)<.008)v=.5;   /* a small dead zone keeps the middle exactly in tune */
  if(v===WH[k]&&WH.drag!==k)return;
  wheelShow(k,v);
  if(typeof ensureAudio==='function')ensureAudio();
  if(k==='bend'){FXM.bend=v;if(engineOn())ENG.node.port.postMessage({t:'bend',v});}
  else{FXM.mod=v;if(engineOn())ENG.node.port.postMessage({t:'cc',cc:1,v:Math.round(v*127)});}
}
function wheelsMount(host){
  if(!host||host.dataset.wheels)return;host.dataset.wheels='1';host.innerHTML=wheelHTML();
  host.addEventListener('pointerdown',e=>{
    const el=e.target.closest('.whl');if(!el)return;e.preventDefault();el.focus();
    const k=el.dataset.wk,r=el.getBoundingClientRect(),y0=e.clientY,v0=WH[k];
    WH.drag=k;el.classList.add('drag');try{el.setPointerCapture(e.pointerId);}catch(_){}
    const mv=ev=>wheelSend(k,v0+(y0-ev.clientY)/Math.max(30,r.height-8));
    const up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
      WH.drag=null;el.classList.remove('drag');if(k==='bend')wheelSend('bend',.5);};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  });
  host.addEventListener('dblclick',e=>{const el=e.target.closest('.whl');if(el)wheelSend(el.dataset.wk,WHEEL_DEF[el.dataset.wk].center);});
  host.addEventListener('keydown',e=>{
    const el=e.target.closest('.whl');if(!el)return;const k=el.dataset.wk,step=e.shiftKey?.01:.05;
    let v=null;
    if(e.key==='ArrowUp'||e.key==='ArrowRight')v=WH[k]+step;else if(e.key==='ArrowDown'||e.key==='ArrowLeft')v=WH[k]-step;
    else if(e.key==='Home')v=WHEEL_DEF[k].center;else if(e.key==='PageUp')v=1;else if(e.key==='PageDown')v=0;
    if(v==null)return;e.preventDefault();e.stopPropagation();wheelSend(k,v);
  });
  host.addEventListener('keyup',e=>{const el=e.target.closest('.whl');if(el&&el.dataset.wk==='bend'&&/^Arrow/.test(e.key))wheelSend('bend',.5);});   /* the pitch wheel springs back */
  wheelShow('bend',WH.bend);wheelShow('mod',WH.mod);
}
wheelsMount($('#mapWheels'));wheelsMount($('#kbWheels'));
