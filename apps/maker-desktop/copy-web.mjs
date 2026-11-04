// Copies the web app into www/ with the same folder layout, so the app's relative imports keep working.
import {cpSync,rmSync,mkdirSync} from 'node:fs';
const root=new URL('../../',import.meta.url),www=new URL('./www/',import.meta.url);
rmSync(www,{recursive:true,force:true});mkdirSync(www,{recursive:true});
for(const f of ['apps/maker/index.html','apps/maker/app.js'])cpSync(new URL(f,root),new URL(f,www));
cpSync(new URL('packages/core/src/',root),new URL('packages/core/src/',www),{recursive:true});
console.log('copied web app into www/');
