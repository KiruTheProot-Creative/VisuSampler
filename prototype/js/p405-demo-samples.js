/* ---------- demo samples (synthesised, so the mapper is testable with no files) ---------- */
function synthPluck(midi,bright,dur,sr){
  const f=440*Math.pow(2,(midi-69)/12),n=Math.floor(dur*sr),d=new Float32Array(n);
  const H=Math.max(3,Math.min(14,Math.floor(5+bright*10)));
  for(let h=1;h<=H&&f*h<sr/2.2;h++){
    const amp=Math.pow(1/h,1.1+(1-bright)*1.4)*(h%2?1:.8),dec=1.2+2.6/(h*.7),ph=Math.random()*.2;
    for(let i=0;i<n;i++){const t=i/sr;d[i]+=amp*Math.sin(2*Math.PI*f*h*t+ph)*Math.exp(-t*dec);}
  }
  for(let i=0;i<220;i++) d[i]+=(Math.random()*2-1)*.4*(1-i/220)*bright;
  let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(d[i]));
  const g=.85/pk,a=Math.floor(sr*.002);for(let i=0;i<n;i++)d[i]*=g*(i<a?i/a:1);
  return d;
}
function synthPad(midi,dur,sr){
  const f=440*Math.pow(2,(midi-69)/12),n=Math.floor(dur*sr),d=new Float32Array(n);
  [-7,0,6].forEach(c=>{const ff=f*Math.pow(2,c/1200);for(let h=1;h<=6;h++){const amp=1/(h*h);for(let i=0;i<n;i++){const t=i/sr;d[i]+=amp*Math.sin(2*Math.PI*ff*h*t)*(.8+.2*Math.sin(2*Math.PI*.5*t+h));}}});
  const a=Math.floor(sr*.4);let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(d[i]));
  for(let i=0;i<n;i++)d[i]*=(.6/pk)*(i<a?i/a:1)*(i>n-sr*.3?(n-i)/(sr*.3):1);
  return d;
}
function synthThump(midi,sr){
  const n=Math.floor(sr*.35),d=new Float32Array(n),f=440*Math.pow(2,(midi-69)/12);
  for(let i=0;i<n;i++){const t=i/sr;d[i]=(Math.sin(2*Math.PI*f*t)*.7+(Math.random()*2-1)*.3)*Math.exp(-t*18);}
  return d;
}
function synthTick(sr){
  const n=Math.floor(sr*.12),d=new Float32Array(n);let lp=0;
  for(let i=0;i<n;i++){lp+=((Math.random()*2-1)-lp)*.35;d[i]=lp*.5*Math.exp(-i/sr*40);}
  return d;
}
function demoSamples(){
  const sr=44100,DC=n=>[n];
  ['Felt Piano','Felt Hammers','Release Noise','Warm Pad'].forEach(g=>{if(S.groups.indexOf(g)<0)S.groups.push(g);});
  const roots=[36,48,60,72],keyR=[[0,41],[42,53],[54,65],[66,127]];
  roots.forEach((r,i)=>{
    const soft=addBuffer('Felt_'+noteName(r)+'_soft',DC(synthPluck(r,.25,2.6,sr)),sr),hard=addBuffer('Felt_'+noteName(r)+'_hard',DC(synthPluck(r,.9,2.6,sr)),sr);
    addZoneFor(soft.id,keyR[i][0],keyR[i][1],{group:'Felt Piano',root:r,vlo:0,vhi:100,vfadeHi:36,release:420});
    addZoneFor(hard.id,keyR[i][0],keyR[i][1],{group:'Felt Piano',root:r,vlo:64,vhi:127,vfadeLo:36,release:420});
  });
  [0,3,5].forEach((o,i)=>{
    const s=addBuffer('Hammer_'+(i+1),DC(synthThump(48+o,sr)),sr);
    addZoneFor(s.id,0,127,{group:'Felt Hammers',root:48+o,seq:i+1,keytrack:true,release:80,oneshot:true});
  });
  const tick=addBuffer('Release_tick',DC(synthTick(sr)),sr);
  addZoneFor(tick.id,0,127,{group:'Release Noise',root:60,keytrack:false,oneshot:true,vlo:0,vhi:127,vol:-6});
  [[48,0,59],[60,60,71],[72,72,127]].forEach(p=>{
    const s=addBuffer('Pad_'+noteName(p[0]),DC(synthPad(p[0],4,sr)),sr);
    s.loop={s:Math.floor(sr*1.0),e:Math.floor(sr*3.2),xf:Math.floor(sr*.35)};
    addZoneFor(s.id,p[1],p[2],{group:'Warm Pad',root:p[0],fadeLo:p[1]?4:0,fadeHi:p[2]<127?4:0,attack:350,release:900});
  });
  gcfg('Felt Hammers').mode='rrcycle'; gcfg('Release Noise').mode='release'; gcfg('Warm Pad').interp='cubic';
  S.map.group='Felt Piano'; S.map.sel=[]; touchMap();
}
