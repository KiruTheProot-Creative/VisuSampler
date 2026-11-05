/* AudioWorklet that plays a library with the WebAssembly engine.
   new AudioWorkletNode(ctx,'visu-engine',{numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module}})
   port messages: {t:'load',bytes} {t:'on',n,v} {t:'off',n} {t:'sustain',d} {t:'alloff'} {t:'list',i} {t:'gain',g}
   it posts {t:'loaded',error,zones,unsupportedZones} and {t:'voices',n} */
import {instantiateSync} from './engine.js';
class VisuEngine extends AudioWorkletProcessor{
  constructor(o){
    super();this.e=instantiateSync(o.processorOptions.module);this.e.prepare(sampleRate,128);this.lastV=-1;this.tick=0;
    this.port.onmessage=({data:m})=>{try{this.handle(m);}catch(err){this.port.postMessage({t:'error',error:String(err&&err.message||err)});}};
  }
  handle(m){const e=this.e;
      if(m.t==='load'){const err=e.load(new Uint8Array(m.bytes));this.port.postMessage({t:'loaded',error:err,zones:e.zones,unsupportedZones:e.unsupportedZones});}
      else if(m.t==='on')e.noteOn(m.n,m.v);else if(m.t==='off')e.noteOff(m.n);else if(m.t==='sustain')e.sustain(m.d);
      else if(m.t==='alloff')e.allOff();else if(m.t==='list')e.setList(m.i);else if(m.t==='gain')e.setGain(m.g);else if(m.t==='tag')e.setTag(m.name,m.v);else if(m.t==='cc')e.controller(m.cc,m.v);else if(m.t==='bend')e.pitchBend(m.v);else if(m.t==='unload')e.unload();
  }
  process(_,outputs){
    const out=outputs[0],n=out[0].length,[l,r]=this.e.render(n);out[0].set(l);if(out[1])out[1].set(r);
    if(++this.tick%20===0){const v=this.e.voices;if(v!==this.lastV){this.lastV=v;this.port.postMessage({t:'voices',n:v});}}
    return true;
  }
}
registerProcessor('visu-engine',VisuEngine);
