export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const hash01=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export const hann=t=>.5-.5*Math.cos(2*Math.PI*t);
export const barBeats=sg=>sg.n*4/sg.d;
export const fadeCurve=(t,c)=>{t=clamp(t,0,1);return c==='linear'?t:c==='s'?t*t*(3-2*t):Math.sin(t*Math.PI/2);};
export const bytesPer=bits=>bits===24?3:bits===32?4:2;
export const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
/* middle C is C3 = 60, like most samplers */
export const noteName=n=>NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-2);
