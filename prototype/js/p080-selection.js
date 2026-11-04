/* ---------- selection ---------- */
const sel=()=>S.els.find(e=>e.id===S.sel)||null;
function placeSel(){
  const sb=$('#selbox'),el=sel();
  if(!el||S.mode!=='design'){sb.hidden=true;return;}
  sb.hidden=false; const z=S.z;
  sb.style.left=(el.x*z)+'px'; sb.style.top=(el.y*z)+'px'; sb.style.width=(el.w*z)+'px'; sb.style.height=(el.h*z)+'px';
  $('#selTag').textContent=el.name+' · '+Math.round(el.w)+'×'+Math.round(el.h);
}
function select(id){
  S.sel=id; if(id&&S.tab!=='props') S.tab='props';
  renderLayers(); placeSel(); renderRight();
}
function renderLayers(){
  $('#layers').innerHTML=S.els.slice().reverse().map(e=>'<li><button type="button" class="lr'+(e.id===S.sel?' on':'')+'" data-id="'+e.id+'"><i class="ic '+e.type+'"></i><span>'+esc(e.name)+'</span><small>'+e.type+'</small></button></li>').join('');
  $('#layerCount').textContent='· '+S.els.length;
}

