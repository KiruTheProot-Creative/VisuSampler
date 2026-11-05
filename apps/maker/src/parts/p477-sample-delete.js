/* ---------- deleting samples (Sound tab) ----------
   "Delete sample" in the sample inspector, the Delete key on a focused sample, and "Remove unused" in the Samples list.
   Deleting asks once more (click again / press Delete again), because it also removes the zones that play the sample. */
const SDEL={arm:'',t:0};
function deleteSamples(ids){
  ids=ids.filter(id=>S.samples.some(s=>s.id===id));if(!ids.length)return 0;
  const zs=S.zones.filter(z=>ids.indexOf(z.sample)>=0).map(z=>z.id);if(zs.length)delZones(zs);
  S.samples=S.samples.filter(s=>ids.indexOf(s.id)<0);ids.forEach(id=>BUF.delete(id));
  /* a convolution that used one of them as its impulse goes back to none */
  Object.values(S.fx.graphs).forEach(g=>g.nodes.forEach(n=>{if(n.s&&ids.indexOf(n.s.ir)>=0)n.s.ir=null;}));
  if(ids.indexOf(S.smp.sel)>=0){S.smp.sel=S.samples[0]?S.samples[0].id:null;S.smp.a=S.smp.b=null;}
  SDEL.arm='';touchMap();smPanelRender();smFit();smInvalidate();if(S.view==='sound')soundRefresh();
  return ids.length;
}
const usedBy=id=>S.zones.filter(z=>z.sample===id).length;
const unusedSamples=()=>S.samples.filter(s=>!usedBy(s.id)&&!Object.values(S.fx.graphs).some(g=>g.nodes.some(n=>n.s&&n.s.ir===s.id)));
/* ask once more: the first click (or key press) arms, the second within 4 s deletes */
function armDelete(key){const now=performance.now();if(SDEL.arm===key&&now-SDEL.t<4000)return true;SDEL.arm=key;SDEL.t=now;setTimeout(()=>{if(SDEL.arm===key&&performance.now()-SDEL.t>=4000){SDEL.arm='';smPanelRender();if(S.view==='sound')mapLeftRender();}},4100);return false;}
function deleteSampleAsk(s){
  if(!s)return;const n=usedBy(s.id);
  if(armDelete('s:'+s.id)){deleteSamples([s.id]);flash('Deleted "'+s.name+'"'+(n?' and its '+n+' zone'+(n>1?'s':''):''));return;}
  flash('Click Delete again to remove "'+s.name+'"'+(n?' and the '+n+' zone'+(n>1?'s':'')+' that play it':'')+'.');smPanelRender();
}
/* inspector: Duplicate and Delete under the name */
const smPanelHTMLDel=smPanelHTML;
smPanelHTML=function(){
  const h=smPanelHTMLDel(),s=smSample();if(!s)return h;
  const armed=SDEL.arm==='s:'+s.id,n=usedBy(s.id);
  const row='<div class="chips sdel"><button type="button" class="btn" data-sdx="dup">Duplicate</button><button type="button" class="btn danger" data-sdx="del">'
    +(armed?(n?'Really delete it and '+n+' zone'+(n>1?'s':'')+'?':'Really delete?'):'Delete sample')+'</button></div>';
  const i=h.indexOf('</div>');return i<0?row+h:h.slice(0,i+6)+row+h.slice(i+6);
};
$('#rightS').addEventListener('click',e=>{
  const b=e.target.closest('[data-sdx]');if(!b)return;const s=smSample();if(!s)return;
  if(b.dataset.sdx==='del')deleteSampleAsk(s);
  else{const bf=BUF.get(s.id);if(!bf)return;const n=addBuffer(s.name+' copy',bf.ch.map(d=>d.slice()),s.sr);n.root=s.root;n.fine=s.fine;n.loop=s.loop&&Object.assign({},s.loop);n.sm=JSON.parse(JSON.stringify(smOf(s)));selectSample(n.id);if(S.view==='sound')soundRefresh();}
});
/* Samples list in the Sound tab: "Remove unused" when some samples play nowhere */
const mapLeftHTMLDel=mapLeftHTML;
mapLeftHTML=function(){
  let h=mapLeftHTMLDel();const un=unusedSamples();if(!un.length||S.snd.fold.Samples)return h;
  const armed=SDEL.arm==='unused',btn='<button type="button" class="snclean'+(armed?' armed':'')+'" data-sdu="1" title="Delete the samples that no zone plays">'+(armed?'Really remove '+un.length+'?':'Remove '+un.length+' unused')+'</button>';
  const k=h.indexOf('data-fold="Samples"');if(k<0)return h;const e=h.indexOf('</div>',k);
  return h.slice(0,e)+btn+h.slice(e);
};
$('#leftM').addEventListener('click',e=>{
  if(!e.target.closest('[data-sdu]')||S.view!=='sound')return;e.stopPropagation();
  const un=unusedSamples();if(!un.length)return;
  if(armDelete('unused')){const names=un.map(s=>s.name);deleteSamples(un.map(s=>s.id));flash('Removed '+names.length+' unused sample'+(names.length>1?'s':'')+': '+names.slice(0,3).join(', ')+(names.length>3?'…':''));}
  else{flash('Click again to delete '+un.length+' sample'+(un.length>1?'s':'')+' that no zone plays.');mapLeftRender();}
},true);
/* Delete key on a focused sample (Sound tab). Zones keep their own Delete. */
document.addEventListener('keydown',e=>{
  if(S.view!=='sound'||S.snd.focus!=='sample'||typing(e.target)||(e.key!=='Delete'&&e.key!=='Backspace'))return;
  e.preventDefault();e.stopImmediatePropagation();deleteSampleAsk(smSample());
},true);
