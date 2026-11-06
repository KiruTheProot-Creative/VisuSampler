/* ---------- Audio settings (desktop app): native audio on the sound card, driver, device, buffer size ----------
   Smaller buffers = less delay between key and sound, but more work for the computer (crackles when it is too small). */
(function(){
  const o=$('#projOpen');if(!o)return;
  const b=document.createElement('button');b.type='button';b.className='btn';b.id='audioSetBtn';b.textContent='Audio';b.title='Audio settings: sound card, buffer size, delay';
  o.before(b);
  const dlg=document.createElement('dialog');dlg.id='audioSet';dlg.className='audioset';dlg.setAttribute('aria-labelledby','audioSetH');document.body.appendChild(dlg);
  b.addEventListener('click',()=>{audioSettingsRender();if(!dlg.open)dlg.showModal();if(ENG.native&&ENG.node)ENG.node.port.postMessage({t:'devices'});});
  dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
  dlg.addEventListener('change',e=>{
    const t=e.target,k=t.dataset.as;if(!k)return;
    if(k==='mode'){AUDIO_PREF.mode=t.value;saveAudioPref();audioSettingsRender();flash(t.value==='browser'?'Browser audio is used after a restart of VisuMaker.':'Native audio starts after a restart of VisuMaker.');return;}
    const d=ENG.devices||{},cur=d.current||{};
    const want={type:k==='type'?t.value:cur.type,device:k==='device'?t.value:(k==='type'?'':cur.device),rate:k==='rate'?+t.value:cur.rate,buffer:k==='buffer'?+t.value:cur.buffer};
    Object.assign(AUDIO_PREF,want);saveAudioPref();
    if(ENG.native&&ENG.node)ENG.node.port.postMessage(Object.assign({t:'setDevice'},want));
  });
})();
function audioSettingsRender(){
  const dlg=$('#audioSet');if(!dlg)return;
  const desk=!!window.visuNative,nat=ENG.native,d=ENG.devices,cur=(d&&d.current)||ENG.dev||{};
  const sel=(k,lab,opts,v)=>'<label class="f"><span>'+lab+'</span><select data-as="'+k+'">'+opts.map(x=>'<option value="'+esc(String(x[0]))+'"'+(String(x[0])===String(v)?' selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></label>';
  let h='<h2 id="audioSetH">Audio</h2>';
  if(!desk)h+='<p class="hint">In the browser, VisuMaker plays through the browser\'s audio. The desktop app can use the sound card directly (less delay).</p>';
  else{
    h+=sel('mode','Play through',[['native','The sound card (native, low delay)'],['browser','The browser\'s audio (fallback)']],AUDIO_PREF.mode==='browser'?'browser':'native');
    if(nat&&d){
      const types=d.types||[],ty=types.find(x=>x.name===cur.type)||{devices:[]};
      h+=sel('type','Driver',types.map(x=>[x.name,x.name]),cur.type)+sel('device','Output',ty.devices.map(x=>[x,x]),cur.device)
        +sel('buffer','Buffer size',(d.buffers||[]).map(x=>[x,x+' samples ('+(x/(cur.rate||48000)*1000).toFixed(1)+' ms)']),cur.buffer)
        +sel('rate','Sample rate',(d.rates||[]).map(x=>[x,x+' Hz']),cur.rate);
      if(d.error)h+='<p class="hint err">'+esc(d.error)+'</p>';
    }else if(nat)h+='<p class="hint">Asking the sound card…</p>';
    else if(AUDIO_PREF.mode!=='browser')h+='<p class="hint">Native audio is not running'+(ENG.nativeLost?' (it could not start, so the browser\'s audio plays)':'')+'. It starts with the first note.</p>';
  }
  const lat=audioLatencyMs();
  h+='<p class="lat">'+(lat!=null?'Delay from key to sound: about <b>'+lat+' ms</b>':'Play a note to start the audio.')+'</p>'
    +'<p class="hint">"Windows Audio (Low Latency Mode)" with 128 samples is a good start. Go smaller for less delay, bigger if you hear crackles.</p>'
    +'<div class="row"><button type="button" class="btn" onclick="this.closest(\'dialog\').close()">Close</button></div>';
  dlg.innerHTML=h;
}
