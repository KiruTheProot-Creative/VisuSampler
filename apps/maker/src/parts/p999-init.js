/* ---------- init ---------- */
buildKb();
buildVelvet();
S.tab='props';
syncToolbar(); layout(); mountAll(); renderLayers(); renderRight();
new ResizeObserver(()=>{if(S.view==='design')layout();}).observe(vp);
setView('design');
if(window.__VSTEST) window.__vs={S,ensureAudio,renderZone,touchMap,noteOn,noteOff,addBuffer,autoMapSamples,zoneConflicts,AU,SV,smOf,zoneData,uniVoices,BUF,sampleById,demoExtras,mapSlices,smOp,mkZone,detectTransients,smSample,previewOn,previewOff,PV,estimate,buildVsamp,parseVsamp,exRender,exBuild,bannerRedraw,crc32,fmtBytes,saveProject,openProject,restore,snapshot};
