/* ---------- init ---------- */
buildKb();
buildVelvet();
S.tab='props';
syncToolbar(); layout(); mountAll(); renderLayers(); renderRight();
new ResizeObserver(()=>{if(S.view==='design')layout();}).observe(vp);
setView('sound');
if(window.__VSTEST) window.__vs={S,buildAsset:(a,b,c,d)=>buildAsset(a,b,c,d),nid:p=>nid(p),mk:(t,o)=>mk(t,o),mkTag:(a,b,c)=>mkTag(a,b,c),loadPreset:k=>loadPreset(k),setPatchMode:(p,m)=>setPatchMode(p,m),playOf:()=>playOf(),gcfg:g=>gcfg(g),addBuffer:(n,c,r)=>addBuffer(n,c,r),addZoneFor:(s,lo,hi,o)=>addZoneFor(s,lo,hi,o),spreadRoots:(z,a,b)=>spreadRoots(z,a,b),setStep:(t,i)=>setStep(t,i),listsInBank:b=>listsInBank(b),curList:()=>curList(),snShow:()=>snShow(),HIST,deleteSamples:ids=>deleteSamples(ids),smOp:(o,a)=>smOp(o,a),ENG,engineBytes:()=>engineBytes(),setTag:(t,v)=>setTag(t,v),rerender:()=>{rerenderAll();placeSel();},ensureAudio,renderZone,touchMap,noteOn,noteOff,addBuffer,autoMapSamples,zoneConflicts,AU,SV,smOf,zoneData,uniVoices,BUF,sampleById,demoExtras,mapSlices,smOp,mkZone,detectTransients,smSample,previewOn,previewOff,PV,estimate,buildVsamp,parseVsamp,exRender,exBuild,bannerRedraw,crc32,fmtBytes,saveProject,openProject,restore,snapshot,FXT,FXA,graphOf,fxNode,mkCable,fxRender,sampBus,sampPanic,mapLeftRender,soundEnter,ENG,expand:s=>expand(s),curListB:()=>curListB(),patchToken:(s)=>expand(s),curPatch:B=>curPatch(B),fireAct:(name,verb)=>{const t=tagByName(name);if(verb==="next")stepBy(t,1);else stepBy(t,-1);}};
