import {hash01} from './util.js';
export const MODES=[['sampler','Sampler (pitch and speed together)'],['speedkeep','Speed-keeping (time machine)'],['slicer','Slicer (beat machine)'],['wavetable','Wavetable'],['granular','Granular']];
export function smDefaults(){
  return{mode:'sampler',
    sk:{speed:100,grain:50,quality:'wsola',sync:false,bars:2},
    gr:{size:90,density:28,pos:45,spread:15,jitter:0,shape:'hann'},
    wt:{frame:2048,pos:0,pos2:-1,sweep:2500,tag:''},
    uni:{on:false,voices:5,detune:30,spread:70,blend:60,curve:'super',startRand:14,drift:0,mode:'detune',chord:'0,7,12'},
    slices:[],sens:50,bars:2};
}
/** Fill in missing mode settings on a sample (mutates and returns sample.sm). */
export function smOf(s){
  if(!s.sm)s.sm=smDefaults();
  else{const d=smDefaults();Object.keys(d).forEach(k=>{if(s.sm[k]===undefined)s.sm[k]=d[k];else if(typeof d[k]==='object'&&!Array.isArray(d[k]))s.sm[k]=Object.assign({},d[k],s.sm[k]);});}
  return s.sm;
}
/** Sample unison: deterministic voice offsets so rendered voices can be cached. Returns [{tune(cents),pan,gain,start(ms),drift}]. */
export function uniVoices(sm){
  const u=sm.uni;if(!u.on)return[{tune:0,pan:0,gain:1,start:0,drift:0}];
  const out=[];
  if(u.mode==='detune'){
    const n=Math.max(1,Math.round(u.voices));
    for(let i=0;i<n;i++){
      const t=n===1?0:(i/(n-1))*2-1,a=Math.abs(t);
      const d=u.curve==='linear'?t*u.detune/2:Math.sign(t)*Math.pow(a,1.7)*u.detune/2;
      const cw=(1-a)*(u.blend/100)+a*(1-u.blend/100)+.12;
      out.push({tune:d,pan:(i%2?1:-1)*a*u.spread/100,gain:cw,start:hash01(i+3)*u.startRand,drift:u.drift});
    }
  }else{
    const semis=u.mode==='octave'?[0,12,-12,24,-24,7]:u.mode==='fifth'?[0,7,12,19,-12]:String(u.chord).split(',').map(x=>parseFloat(x)).filter(x=>!isNaN(x));
    const n=Math.max(1,Math.round(u.mode==='chord'?semis.length:u.voices));
    for(let i=0;i<n;i++){
      const s=semis[i%semis.length],w=(i%2?1:-1)*(n>1?(i/(n-1)):0);
      out.push({tune:s*100+(i%2?1:-1)*u.detune*.12,pan:w*u.spread/100,gain:1,start:hash01(i+9)*u.startRand,drift:u.drift});
    }
  }
  const norm=1/Math.sqrt(out.reduce((a,v)=>a+v.gain*v.gain,0));
  out.forEach(v=>{v.gain*=norm*(out.length>1?1.15:1);});
  return out;
}
