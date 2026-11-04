/* Loads engine.wasm (the C++ engine) and wraps its C interface. Works in Node, the browser and an AudioWorklet. */
function importsFor(module){
  /* the standalone build may import a few WASI/env functions it never really needs here; give it harmless stubs */
  const imports={};
  for(const im of WebAssembly.Module.imports(module)){
    if(im.kind!=='function')continue;
    (imports[im.module]||(imports[im.module]={}))[im.name]=im.name==='proc_exit'?code=>{throw new Error('engine exited '+code);}:()=>0;
  }
  return imports;
}
export function instantiateSync(module){return wrap(new WebAssembly.Instance(module,importsFor(module)));}
export async function instantiate(bytesOrModule){
  const module=bytesOrModule instanceof WebAssembly.Module?bytesOrModule:await WebAssembly.compile(bytesOrModule);
  return wrap(await WebAssembly.instantiate(module,importsFor(module)));
}
function wrap(inst){
  const x=inst.exports;if(x._initialize)x._initialize();
  const str=p=>{const m=new Uint8Array(x.memory.buffer);let e=p;while(m[e])e++;return new TextDecoder().decode(m.subarray(p,e));};
  let maxFrames=0;
  return{
    exports:x,
    prepare(sampleRate,frames=512){maxFrames=frames;x.visu_prepare(sampleRate,frames);},
    /** Loads a .vsamp. Returns null on success, or the error text. */
    load(bytes){const p=x.visu_alloc(bytes.length);new Uint8Array(x.memory.buffer,p,bytes.length).set(bytes);return x.visu_load(p,bytes.length)?null:str(x.visu_error());},
    unload(){x.visu_unload();},
    noteOn(n,v){x.visu_note_on(n,v);},noteOff(n){x.visu_note_off(n);},sustain(d){x.visu_sustain(d?1:0);},allOff(){x.visu_all_off();},
    setList(i){x.visu_set_list(i);},setGain(g){x.visu_set_gain(g);},
    /** Renders n frames (n <= the frames given to prepare). The returned arrays are views and are only valid until the next call. */
    render(n){x.visu_render(n);return[new Float32Array(x.memory.buffer,x.visu_left(),n),new Float32Array(x.memory.buffer,x.visu_right(),n)];},
    get voices(){return x.visu_voices();},get zones(){return x.visu_zones();},get unsupportedZones(){return x.visu_unsupported_zones();}
  };
}
