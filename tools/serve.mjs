/* Tiny static server for local use: node tools/serve.mjs  ->  http://localhost:5173/apps/maker/ (serves the repo root so pages can import packages/core) */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=+process.env.PORT||5173;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.vsamp':'application/octet-stream'};
export const server=http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
  const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
});
if(import.meta.url===`file://${process.argv[1]}`)server.listen(port,()=>console.log('VisuMaker: http://localhost:'+port+'/apps/maker/'));
