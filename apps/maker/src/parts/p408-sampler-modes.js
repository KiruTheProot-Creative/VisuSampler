/* sample modes, unison, stretch, granular and wavetable now live in @visusampler/core */
const MODES_S=CORE_MODES;
const detectTransients=(s,sens)=>{const b=BUF.get(s.id);return b?coreDetectTransients(b.ch[0],b.sr,sens):[];};
