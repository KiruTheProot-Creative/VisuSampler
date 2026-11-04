/* ---------- mapper: tools ---------- */
function ensureGroup(){
  let g=S.map.group; if(!g||S.groups.indexOf(g)<0){g=S.groups[0]||newGroupName();if(S.groups.indexOf(g)<0)S.groups.push(g);S.map.group=g;}
  gcfg(g); return g;
}
/* sort zones into root buckets and spread key ranges between neighbouring roots */
function spreadRoots(zs,lo,hi){
  const roots=Array.from(new Set(zs.map(z=>z.root))).sort((a,b)=>a-b);
  roots.forEach((r,i)=>{
    const a=i?Math.floor((roots[i-1]+r)/2)+1:lo,b=i<roots.length-1?Math.floor((r+roots[i+1])/2):hi;
    zs.filter(z=>z.root===r).forEach(z=>{z.lo=clamp(a,lo,hi);z.hi=clamp(Math.max(a,b),lo,hi);});
  });
}
function stackVel(zs){
  const n=zs.length; if(n<2) return;
  zs.sort((a,b)=>String(sampleName(a)).localeCompare(String(sampleName(b)),undefined,{numeric:true}));
  zs.forEach((z,i)=>{z.vlo=Math.round(i*128/n);z.vhi=Math.round((i+1)*128/n)-1;z.vfadeLo=0;z.vfadeHi=0;});
}
const sampleName=z=>(sampleById(z.sample)||{name:''}).name;
function autoMapSamples(ss){
  const grp=ensureGroup();
  const list=(ss&&ss.length?ss:S.samples.filter(s=>!S.zones.some(z=>z.sample===s.id)));
  if(!list.length){flash('Nothing unmapped in the pool');return 0;}
  const byRoot={};
  list.forEach(s=>{(byRoot[s.root]=byRoot[s.root]||[]).push(s);});
  const made=[];
  Object.keys(byRoot).forEach(r=>{const arr=byRoot[r];arr.forEach(s=>made.push(addZoneFor(s.id,0,127,{group:grp})));});
  spreadRoots(made,0,127);
  Object.keys(byRoot).forEach(r=>stackVel(made.filter(z=>z.root===+r)));
  S.map.sel=made.map(z=>z.id);touchMap();mapInvalidate();mapUI();
  return made.length;
}
function selOrGroup(){const s=selZones();return s.length?s:S.zones.filter(z=>z.group===S.map.group);}
$('#mapAuto').addEventListener('click',()=>{const n=autoMapSamples();if(n)flash('Auto-mapped '+n+' zone'+(n>1?'s':'')+' by root note, velocity layers stacked');});
$('#mapSpread').addEventListener('click',()=>{
  const zs=selOrGroup(); if(!zs.length){flash('Select some zones first');return;}
  const lo=Math.min.apply(null,zs.map(z=>z.lo)),hi=Math.max.apply(null,zs.map(z=>z.hi));
  spreadRoots(zs,lo,hi);touchMap();mapInvalidate();mapUI();flash('Keys spread between the root notes');
});
$('#mapStack').addEventListener('click',()=>{
  const zs=selZones(); if(zs.length<2){flash('Select two or more zones on the same keys');return;}
  stackVel(zs);touchMap();mapInvalidate();mapUI();flash('Velocity layers split evenly');
});
$('#mapFill').addEventListener('click',()=>{
  const zs=selOrGroup().slice().sort((a,b)=>a.lo-b.lo||a.vlo-b.vlo); if(zs.length<2){flash('Need at least two zones');return;}
  let n=0;
  zs.forEach(z=>{
    const nx=zs.filter(o=>o!==z&&o.lo>z.hi&&o.vlo<=z.vhi&&o.vhi>=z.vlo).sort((a,b)=>a.lo-b.lo)[0];
    if(nx&&nx.lo-1>z.hi){z.hi=nx.lo-1;n++;}
  });
  touchMap();mapInvalidate();mapUI();flash(n?'Closed '+n+' gap'+(n>1?'s':''):'No gaps between neighbours');
});
$('#mapXfade').addEventListener('click',()=>{
  const zs=selZones().slice(); if(zs.length<2){flash('Select the zones that should crossfade');return;}
  const N=clamp(parseInt($('#mapXf').value,10)||3,1,24);
  let n=0;
  /* neighbours in key space (touching ranges, overlapping velocity) */
  const byKey=zs.slice().sort((a,b)=>a.lo-b.lo);
  byKey.forEach(a=>{
    const b=byKey.find(o=>o!==a&&o.lo===a.hi+1&&o.vlo<=a.vhi&&o.vhi>=a.vlo);
    if(b){a.hi=clamp(a.hi+N,a.lo,127);b.lo=clamp(b.lo-N,0,b.hi);a.fadeHi=a.hi-b.lo+1;b.fadeLo=a.fadeHi;a.curve=b.curve='power';n++;}
  });
  /* neighbours in velocity space (same keys) */
  const V=N*4,byVel=zs.slice().sort((a,b)=>a.vlo-b.vlo);
  byVel.forEach(a=>{
    const b=byVel.find(o=>o!==a&&o.vlo===a.vhi+1&&o.lo<=a.hi&&o.hi>=a.lo);
    if(b){a.vhi=clamp(a.vhi+V,a.vlo,127);b.vlo=clamp(b.vlo-V,0,b.vhi);a.vfadeHi=a.vhi-b.vlo+1;b.vfadeLo=a.vfadeHi;a.curve=b.curve='power';n++;}
  });
  touchMap();mapInvalidate();mapUI();flash(n?'Created '+n+' equal-power crossfade'+(n>1?'s':''):'No touching neighbours in the selection');
});
$('#mapPanic').addEventListener('click',()=>sampPanic());
$('#mapInterp').addEventListener('change',e=>{S.map.interp=e.target.value;touchMap();flash('Project interpolation: '+e.target.selectedOptions[0].textContent);});
$('#mapVel').addEventListener('input',e=>{S.map.vel=+e.target.value;$('#mapVelOut').textContent=S.map.vel||'by key height';});
