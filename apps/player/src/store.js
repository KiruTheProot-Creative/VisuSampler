/* remembers the libraries you added, in the browser's IndexedDB, so the browser is not empty next time */
const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('visuplayer',1);r.onupgradeneeded=()=>r.result.createObjectStore('libs',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const run=async(mode,fn)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction('libs',mode),st=tx.objectStore('libs'),rq=fn(st);tx.oncomplete=()=>{db.close();res(rq&&rq.result);};tx.onerror=()=>rej(tx.error);});};
export const saveLib=(id,bytes)=>run('readwrite',s=>s.put({id,bytes,added:Date.now()})).catch(()=>{});
export const removeLib=id=>run('readwrite',s=>s.delete(id)).catch(()=>{});
export const allLibs=()=>run('readonly',s=>s.getAll()).then(x=>x||[]).catch(()=>[]);
