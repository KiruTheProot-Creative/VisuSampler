/* ---------- export: optional bake. The planning and rendering live in @visusampler/core; this wires it to the project ---------- */
const fxKeep=()=>Object.values(S.fx.graphs).flatMap(g=>g.nodes).map(n=>n.s&&n.s.ir).filter(Boolean);
const PROJ=()=>({samples:S.samples,zones:S.zones,keep:fxKeep()});
const estimate=(o,step)=>coreEstimate(CTX,PROJ(),o,step);
const exStep=o=>chooseStep(CTX,PROJ(),o);
const zoneBakeReason=z=>coreZoneBakeReason(CTX,z);
const buildExportSet=(o,progress)=>coreBuildExportSet(CTX,PROJ(),o,progress);
const tick=()=>new Promise(r=>setTimeout(r,0));
