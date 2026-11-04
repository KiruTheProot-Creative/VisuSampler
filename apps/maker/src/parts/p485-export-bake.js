/* ---------- export: optional bake. The planning and rendering live in @visusampler/core; this wires it to the project ---------- */
const PROJ=()=>({samples:S.samples,zones:S.zones});
const estimate=(o,step)=>coreEstimate(CTX,PROJ(),o,step);
const exStep=o=>chooseStep(CTX,PROJ(),o);
const zoneBakeReason=z=>coreZoneBakeReason(CTX,z);
const buildExportSet=(o,progress)=>coreBuildExportSet(CTX,PROJ(),o,progress);
const tick=()=>new Promise(r=>setTimeout(r,0));
