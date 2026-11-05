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
/* UTF-8 by hand: an AudioWorklet has no TextEncoder or TextDecoder */
function utf8(s){
  const out=[];
  for(const ch of String(s)){let c=ch.codePointAt(0);
    if(c<0x80)out.push(c);else if(c<0x800)out.push(0xc0|c>>6,0x80|c&63);
    else if(c<0x10000)out.push(0xe0|c>>12,0x80|c>>6&63,0x80|c&63);else out.push(0xf0|c>>18,0x80|c>>12&63,0x80|c>>6&63,0x80|c&63);}
  return Uint8Array.from(out);
}
function fromUtf8(b){
  let s='';for(let i=0;i<b.length;){const c=b[i++];
    if(c<0x80)s+=String.fromCharCode(c);
    else if(c<0xe0)s+=String.fromCharCode((c&31)<<6|b[i++]&63);
    else if(c<0xf0){const c2=b[i++],c3=b[i++];s+=String.fromCharCode((c&15)<<12|(c2&63)<<6|c3&63);}
    else{const c2=b[i++],c3=b[i++],c4=b[i++];s+=String.fromCodePoint((c&7)<<18|(c2&63)<<12|(c3&63)<<6|c4&63);}}
  return s;
}
function wrap(inst){
  const x=inst.exports;if(x._initialize)x._initialize();
  const str=p=>{const m=new Uint8Array(x.memory.buffer);let e=p;while(m[e])e++;return fromUtf8(m.subarray(p,e));};
  let maxFrames=0;
  return{
    exports:x,
    prepare(sampleRate,frames=512){maxFrames=frames;x.visu_prepare(sampleRate,frames);},
    /** Loads a .vsamp. Returns null on success, or the error text. */
    load(bytes){const p=x.visu_alloc(bytes.length);new Uint8Array(x.memory.buffer,p,bytes.length).set(bytes);return x.visu_load(p,bytes.length)?null:str(x.visu_error());},
    unload(){x.visu_unload();},
    noteOn(n,v){x.visu_note_on(n,v);},noteOff(n){x.visu_note_off(n);},sustain(d){x.visu_sustain(d?1:0);},allOff(){x.visu_all_off();},
    setList(i){x.visu_set_list(i);},setListB(i){if(x.visu_set_list_b)x.visu_set_list_b(i);},setGain(g){x.visu_set_gain(g);},
    setTag(name,v){const b=utf8(name+'\0'),p=x.visu_alloc(b.length);new Uint8Array(x.memory.buffer,p,b.length).set(b);return !!x.visu_set_tag(p,v);},
    controller(cc,v){x.visu_controller(cc,v);},pitchBend(v){x.visu_pitch_bend(v);},
    /** Renders n frames (n <= the frames given to prepare). The returned arrays are views and are only valid until the next call. */
    render(n){x.visu_render(n);return[new Float32Array(x.memory.buffer,x.visu_left(),n),new Float32Array(x.memory.buffer,x.visu_right(),n)];},
    get voices(){return x.visu_voices();},get zones(){return x.visu_zones();},get unsupportedZones(){return x.visu_unsupported_zones();}
  };
}
