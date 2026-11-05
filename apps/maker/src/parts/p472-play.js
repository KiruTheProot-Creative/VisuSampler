/* ---------- how the library plays: mono / legato / glide, pitch-bend range, voice limit (the engine reads project.play) ---------- */
const PLAY_DEF={mono:false,legato:false,glide:0,bend:2,maxVoices:0,steal:'oldest',patchMode:'list'};
S.play=Object.assign({},PLAY_DEF);
const playOf=()=>Object.assign({},PLAY_DEF,S.play||{});
(function(){
  const d=document.createElement('div');d.id='snInsPlay';d.hidden=true;$('#snInsList').after(d);
  /* saved with the project and the library */
  const snap0=snapshot;snapshot=function(){const s=snap0();s.play=playOf();return s;};
  const rest0=restore;restore=function(sn){rest0(sn);S.play=Object.assign({},PLAY_DEF,sn&&sn.play||{});};
  const reset0=resetMapper;resetMapper=function(){reset0.apply(this,arguments);S.play=Object.assign({},PLAY_DEF);};
  /* the engine reloads when these change */
  const sig0=engineSig;engineSig=function(){return sig0()+'|'+JSON.stringify(playOf());};
})();
function playSummary(){const p=playOf();return (p.mono?(p.legato?'Mono, legato':'Mono'):'Poly')+(p.mono&&p.glide>0?' · glide '+p.glide+' ms':'')+' · bend ±'+p.bend;}
/* a row at the top of the Sound tab's left column */
const mapLeftHTMLPlay=mapLeftHTML;
mapLeftHTML=function(){
  const f=S.snd.focus;
  return '<div class="snh"><span>Playing</span></div><div class="snlist"><button type="button" class="snrow'+(f==='play'?' cur on':'')+'" data-sn="play"><span class="nm">'+esc(playSummary())+'</span></button></div>'+mapLeftHTMLPlay();
};
$('#leftM').addEventListener('click',e=>{if(S.view==='sound'&&e.target.closest('[data-sn="play"]'))snFocus('play');});
function snPlayHTML(){
  const p=playOf(),ck=(k,l,dis)=>'<label class="f chk"><input type="checkbox" data-pl="'+k+'"'+(p[k]?' checked':'')+(dis?' disabled':'')+'><span>'+l+'</span></label>';
  return '<div class="snhead"><b>Playing</b><small>whole library</small></div><div class="snins">'
    +ck('mono','Mono (one note at a time)')
    +ck('legato','Legato: a new key slides the held note instead of restarting it',!p.mono)
    +nf('Glide','data-pl="glide"',p.glide,0,5000,1,'ms')
    +nf('Pitch-bend range','data-pl="bend"',p.bend,0,48,1,'semitones')
    +nf('Voice limit','data-pl="maxVoices"',p.maxVoices,0,256,1,'0 = 256')
    +'<label class="f"><span>When full, steal</span><select data-pl="steal">'+mopt([['oldest','The oldest note'],['quietest','The quietest note']],p.steal)+'</select></label>'
    +'<p class="hint" style="display:block">Glide works in mono. Released notes are always stolen first. In the player a CPU guard also lowers the limit for a moment when the computer cannot keep up.</p>'
    +'<div class="snenv"><label class="f"><span>A patch is</span><select data-pl="patchMode">'+mopt([['list','A whole list (its groups play together)'],['group','One group of a list (a list is a folder)']],patchModeOn()?'group':'list')+'</select></label>'
    +(patchModeOn()?'<p class="hint">Lists are folders: choosing a list picks the folder, and the tag <b>patch</b> picks one of its groups. Buttons with next/previous on patch step through them; texts show {patch.name} and {patch.number}. Samples set to play on key release go in the same group.</p>':'<p class="hint">Each list is one patch and all its groups play together.</p>')+'</div>'
    +layersHTML()+'</div>';
}
$('#snInsPlay').addEventListener('change',e=>{
  const t=e.target,k=t.dataset.pl;if(!k)return;
  const p=playOf();
  if(t.type==='checkbox')p[k]=t.checked;else if(t.type==='number'){const v=parseFloat(t.value);p[k]=isFinite(v)?Math.max(+t.min||0,Math.min(+t.max||1e9,v)):PLAY_DEF[k];}else p[k]=t.value;
  if(!p.mono)p.legato=false;
  if(k==='layerB')setLayerB(p,t.checked);
  if(k==='patchMode')setPatchMode(p,t.value);
  S.play=p;mapLeftRender();$('#snInsPlay').innerHTML=snPlayHTML();
});
const snShowPlay=snShow;
snShow=function(keepIns){
  snShowPlay(keepIns);const el=$('#snInsPlay'),on=S.snd.focus==='play';el.hidden=!on;
  if(on){$('#rightM').hidden=true;if(!keepIns||!el.innerHTML)el.innerHTML=snPlayHTML();}
};
