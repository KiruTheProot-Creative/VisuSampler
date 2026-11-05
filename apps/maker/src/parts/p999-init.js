/* ---------- init ---------- */
buildKb();
buildVelvet();
S.tab='props';
syncToolbar(); layout(); mountAll(); renderLayers(); renderRight();
new ResizeObserver(()=>{if(S.view==='design')layout();}).observe(vp);
setView('sound');
if(window.__VSTEST) window.__vs={S,ENG,engineBytes:()=>engineBytes(),setTag:(t,v)=>setTag(t,v),rerender:()=>{rerenderAll();placeSel();},ensureAudio,renderZone,touchMap,noteOn,noteOff,addBuffer,autoMapSamples,zoneConflicts,AU,SV,smOf,zoneData,uniVoices,BUF,sampleById,demoExtras,mapSlices,smOp,mkZone,detectTransients,smSample,previewOn,previewOff,PV,estimate,buildVsamp,parseVsamp,exRender,exBuild,bannerRedraw,crc32,fmtBytes,saveProject,openProject,restore,snapshot,FXT,FXA,graphOf,fxNode,mkCable,fxRender,sampBus,sampPanic,mapLeftRender,soundEnter,ENG};
