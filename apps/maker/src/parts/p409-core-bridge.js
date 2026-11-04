/* engine context: how @visusampler/core reads this project */
const CTX={
  buffer:id=>BUF.get(id),
  sample:id=>sampleById(id),
  group:n=>gcfg(n),
  get defaultInterp(){return S.map.interp;},
  get bpm(){return S.bpm;},
  get sig(){return S.sig;},
  tagValue:id=>{const t=tagById(id);return t?t.value:null;}
};
