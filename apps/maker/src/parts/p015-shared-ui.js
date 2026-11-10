/* ---------- small helpers the Maker and NodeFX share: status messages, inspector sections, tag lists ---------- */
let flashT=0;
function flash(t){
  const ms=[$('#msg'),$('#fxMsg'),$('#mapMsg'),$('#smMsg'),$('#exMsg')];
  ms.forEach(m=>{if(m)m.textContent=t;});
  clearTimeout(flashT);flashT=setTimeout(()=>{ms.forEach(m=>{if(m)m.textContent='';});},3800);
}
const sec=(title,body)=>'<details class="sec" data-sec="'+title+'"'+(closed.has(title)?'':' open')+'><summary>'+title+'</summary>'+body+'</details>';
const tagOpts=()=>[['','— none —']].concat(S.tags.map(t=>[t.id,t.name]));
