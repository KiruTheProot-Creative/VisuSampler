/* ---------- layers: patch A and patch B play at the same time ----------
   Both pick from the same banks and lists. Layer A is the usual bank/list; layer B has its own tags bankB and listB
   ({listB.name}, {listB.id}, {bankB} in texts; next/previous on listB in buttons). Each layer has its own knobs on
   volume, pan, semitones and fine tune, and its own envelope, applied on top of the groups (project.play.layers). */
const LAYER_DEF=()=>({links:{},env:{on:false,a:5,d:300,s:100,r:300,tags:{}}});
const layerOf=(p,i)=>{const L=(p.layers&&p.layers[i])||LAYER_DEF();return{links:Object.assign({},L.links||{}),env:Object.assign({},LAYER_DEF().env,L.env||{},{tags:Object.assign({},(L.env&&L.env.tags)||{})})};};
function setLayerB(p,on){
  p.layerB=on;
  let b=tagByName('bankB'),l=tagByName('listB');
  if(on){
    if(!b){b=mkTag('bankB','bank',{sys:true,layer:1});S.tags.push(b);}
    if(!l){l=mkTag('listB','list',{sys:true,layer:1});S.tags.push(l);}
    /* start B on the next list after A, so both are heard */
    const a=curList();if(a){const i=S.lists.indexOf(a),nx=S.lists[(i+1)%S.lists.length];b.value=0;setStep(b,nx.bank);setStep(l,listsInBank(nx.bank).indexOf(nx));}
  }else S.tags=S.tags.filter(t=>t!==b&&t!==l);
  syncPatchTags();
  p.layers=[layerOf(p,0),layerOf(p,1)];
  if(typeof renderRight==='function'&&S.view!=='sound')renderRight();
  refreshDisplays();
}
/* patch mode: tags patch (and patchB with layer B) exist only in "group" mode */
function syncPatchTags(){
  const want=S.play&&S.play.patchMode==='group';
  [['patch',0],['patchB',1]].forEach(([n,l])=>{
    let t=tagByName(n);const need=want&&(l===0||!!tagByName('listB'));
    if(need&&!t){t=mkTag(n,'patch',{sys:true,layer:l});S.tags.push(t);if(l){const g=patchGroupsOf(1);if(g.length>1)t.value=1/(g.length-1);}}
    if(!need&&t)S.tags=S.tags.filter(x=>x!==t);
  });
}
function setPatchMode(p,mode){p.patchMode=mode;S.play=p;syncPatchTags();if(typeof renderRight==='function'&&S.view!=='sound')renderRight();refreshDisplays();if(typeof engineSendState==='function')engineSendState();}
const LYLINK=[['vol','Volume','dB',0,-60],['pan','Pan','L–R',-100,100],['tune','Semitones','st',-12,12],['fine','Fine tune','cents',-100,100]];
function layersHTML(){
  const p=playOf(),on=layerBOn();
  let h='<div class="snenv"><label class="f chk"><input type="checkbox" data-pl="layerB"'+(on?' checked':'')+'><span>Layer B: a second patch at the same time</span></label>';
  if(!on)return h+'<p class="hint">Patch A and patch B pick from the same banks and lists, and a key plays both.</p></div>';
  const knobs=[['','no knob']].concat(S.tags.filter(t=>!t.sys&&t.kind==='number').map(t=>[t.id,t.name]));
  h+='<p class="hint">Layer B uses the tags <b>bankB</b> and <b>listB</b>: buttons with next/previous on listB, and texts like {listB.id} {listB.name}. The knobs below work on everything a layer plays, on top of the groups\' own settings.</p></div>';
  for(let i=0;i<2;i++){
    const L=layerOf(p,i),e=L.env,nm=i?'B':'A';
    h+='<details class="snlinks"'+(Object.keys(L.links).length||e.on?' open':'')+'><summary>Layer '+nm+' knobs</summary>'
      +LYLINK.map(([k,l,u])=>{const x=L.links[k];
        return '<div class="envrow"><span class="lk">'+l+'</span><select data-ly="'+i+':link:'+k+'" aria-label="Layer '+nm+' knob for '+l+'">'+mopt(knobs,x?x.tag:'')+'</select></div>'
          +(x?'<div class="glrange"><label>from <input type="number" data-ly="'+i+':from:'+k+'" value="'+x.from+'" step="1"></label><label>to <input type="number" data-ly="'+i+':to:'+k+'" value="'+x.to+'" step="1"></label><em class="sfx">'+u+'</em></div>':'');}).join('')
      +'<label class="f chk"><input type="checkbox" data-ly="'+i+':envon:"'+(e.on?' checked':'')+'><span>Envelope for layer '+nm+' (replaces the groups\' envelopes)</span></label>'
      +(e.on?[['a','Attack',10000,'ms'],['d','Decay',10000,'ms'],['s','Sustain',100,'%'],['r','Release',10000,'ms']].map(([k,l,mx,u])=>
        '<div class="envrow"><label class="f"><span>'+l+'</span><input type="number" data-ly="'+i+':env:'+k+'" min="0" max="'+mx+'" step="1" value="'+e[k]+'"'+(e.tags[k]?' disabled':'')+'><em class="sfx">'+u+'</em></label>'
        +'<select data-ly="'+i+':envtag:'+k+'" aria-label="Layer '+nm+' knob for '+l+'">'+mopt(knobs,e.tags[k]||'')+'</select></div>').join(''):'')
      +'</details>';
  }
  return h;
}
$('#snInsPlay').addEventListener('change',e=>{
  const t=e.target;if(!t.dataset.ly)return;
  const [i,kind,k]=t.dataset.ly.split(':'),p=playOf(),ls=[layerOf(p,0),layerOf(p,1)],L=ls[+i],d=LYLINK.find(x=>x[0]===k);
  if(kind==='link'){const sw=+i===1&&k==='vol';   /* B's volume defaults the other way round: one knob crossfades A and B */
    if(t.value)L.links[k]=Object.assign({from:sw?d[4]:d[3],to:sw?d[3]:d[4]},L.links[k]||{},{tag:t.value});else delete L.links[k];}
  else if(kind==='from'||kind==='to'){const v=parseFloat(t.value);if(L.links[k]&&isFinite(v))L.links[k][kind]=v;}
  else if(kind==='envon')L.env.on=t.checked;
  else if(kind==='env'){const v=parseFloat(t.value);L.env[k]=isFinite(v)?Math.max(0,Math.min(+t.max,v)):LAYER_DEF().env[k];}
  else if(kind==='envtag'){if(t.value)L.env.tags[k]=t.value;else delete L.env.tags[k];}
  p.layers=ls;S.play=p;$('#snInsPlay').innerHTML=snPlayHTML();
});
