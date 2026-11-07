// VisuMaker desktop: serves the web app from a private app:// scheme (so ES modules load) in one window.
const {app,BrowserWindow,protocol,net,shell,Menu,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const os=require('node:os');const {spawn}=require('node:child_process');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const WWW=path.join(__dirname,'www');
function createWindow(){
  const win=new BrowserWindow({width:1500,height:900,minWidth:1100,minHeight:640,backgroundColor:'#262626',title:'VisuMaker 0.0.1',
    webPreferences:{contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.js')}});
  const q=[process.argv.includes('--worklet-file')?'wfile=1':'',process.argv.includes('--smoke-native')?'nodev=1':''].filter(Boolean).join('&');   /* nodev: CI machines have no sound card */
  win.loadURL('app://local/apps/maker/index.html'+(q?'?'+q:''));
  /* --smoke: start the audio, wait, and report whether the shared engine runs (used by the Windows build check) */
  if(process.argv.includes('--smoke'))win.webContents.once('did-finish-load',async()=>{
    try{
      await win.webContents.executeJavaScript('window.__visuStartAudio()',true);
      await new Promise(r=>setTimeout(r,8000));
      const st=JSON.parse(await win.webContents.executeJavaScript('JSON.stringify(window.__visuEngine())',true));
      console.log('VISU-ENGINE '+JSON.stringify(st));
      /* --smoke-native: the native audio must be the one running (VisuMakerAudio started and loaded the project) */
      const wantNative=process.argv.includes('--smoke-native');
      app.exit(st.on&&(!wantNative||st.native)?0:1);
    }catch(e){console.log('VISU-ENGINE error '+e.message);app.exit(2);}
  });
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return{action:'deny'};});
}
app.whenReady().then(()=>{
  protocol.handle('app',req=>{
    const p=decodeURIComponent(new URL(req.url).pathname),file=path.normalize(path.join(WWW,p));
    if(!file.startsWith(WWW))return new Response('not found',{status:404});
    return net.fetch(pathToFileURL(file).toString());
  });
  /* Export to VisuPlayer: the VST reads Documents/VisuSampler/Libraries */
  const libDir=()=>path.join(app.getPath('documents'),'VisuSampler','Libraries');
  ipcMain.handle('visu:saveLibrary',async(_e,name,bytes)=>{
    const safe=String(name||'library').replace(/[<>:"/\\|?*\x00-\x1f]+/g,'').trim()||'library';
    fs.mkdirSync(libDir(),{recursive:true});
    const file=path.join(libDir(),safe+'.vsamp');fs.writeFileSync(file,Buffer.from(bytes));
    return file;
  });
  ipcMain.handle('visu:libraryFolder',()=>libDir());
  /* Projects: Save writes straight back to the file it came from (a dialog only the first time, or for Save as).
     It writes a temp file next to it and renames it over, so a crash mid-save never leaves half a project. */
  const projFilter=[{name:'VisuMaker project',extensions:['vmproj']}];
  ipcMain.handle('visu:saveProject',async(e,name,bytes,file,saveAs)=>{
    if(!file||saveAs){
      const safe=String(name||'project').replace(/[<>:"/\\|?*\x00-\x1f]+/g,'').trim()||'project';
      const r=await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender),{title:'Save project',defaultPath:file||path.join(app.getPath('documents'),safe+'.vmproj'),filters:projFilter});
      if(r.canceled||!r.filePath)return null;file=r.filePath;
    }
    const tmp=file+'.saving',fh=await fs.promises.open(tmp,'w');
    try{for(const d of (Array.isArray(bytes)?bytes:[bytes]))await fh.write(Buffer.from(d.buffer,d.byteOffset,d.byteLength));}finally{await fh.close();}
    await fs.promises.rename(tmp,file);
    return file;
  });
  ipcMain.handle('visu:openProject',async e=>{
    const r=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{title:'Open project',filters:projFilter,properties:['openFile']});
    if(r.canceled||!r.filePaths[0])return null;
    return{file:r.filePaths[0],bytes:new Uint8Array(await fs.promises.readFile(r.filePaths[0]))};
  });
  /* ---- native audio: VisuMakerAudio(.exe) plays the project with the VST's engine on the sound card ----
     The page talks to it with the AudioWorklet's messages; a project to load is written to a temp file first
     (the helper reads it into memory, so later loads can reuse audio it already has). */
  const NA={proc:null,win:null,buf:'',files:[],n:0,dir:path.join(os.tmpdir(),'VisuMaker')};
  const naExe=()=>process.env.VISU_NATIVE_AUDIO||(app.isPackaged?path.join(process.resourcesPath,'native','VisuMakerAudio'+(process.platform==='win32'?'.exe':'')):path.join(__dirname,'native','VisuMakerAudio'+(process.platform==='win32'?'.exe':'')));
  const naTell=m=>{if(NA.win&&!NA.win.isDestroyed())NA.win.webContents.send('visu:native',m);};
  const naClean=keep=>{NA.files=NA.files.filter(f=>{if(f===keep)return true;try{fs.unlinkSync(f);}catch(e){return true;}return false;});};
  ipcMain.handle('visu:nativeStart',e=>{
    NA.win=BrowserWindow.fromWebContents(e.sender);
    if(NA.proc)return{ok:true};
    const exe=naExe();if(!fs.existsSync(exe))return{ok:false,error:'VisuMakerAudio is missing ('+exe+')'};
    try{NA.proc=spawn(exe,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});}catch(err){return{ok:false,error:String(err.message||err)};}
    NA.proc.stdout.setEncoding('utf8');
    NA.proc.stdout.on('data',d=>{NA.buf+=d;let i;while((i=NA.buf.indexOf('\n'))>=0){const line=NA.buf.slice(0,i).trim();NA.buf=NA.buf.slice(i+1);if(!line)continue;
      let m;try{m=JSON.parse(line);}catch(err){continue;}
      if(m.t==='loaded'&&!m.error&&NA.current)naClean(NA.current);
      naTell(m);}});
    NA.proc.on('exit',code=>{NA.proc=null;naTell({t:'exit',code});});
    NA.proc.on('error',err=>{NA.proc=null;naTell({t:'exit',code:-1,error:String(err.message||err)});});
    NA.proc.stdin.on('error',()=>{});
    return{ok:true};
  });
  ipcMain.on('visu:nativeSend',(_e,m)=>{
    if(!NA.proc||!m)return;
    if(m.t==='load'&&m.bytes){
      fs.mkdirSync(NA.dir,{recursive:true});
      const f=path.join(NA.dir,'engine-'+process.pid+'-'+(++NA.n)+'.vsamp');
      try{fs.writeFileSync(f,Buffer.from(m.bytes));}catch(err){naTell({t:'loaded',error:'could not write a temp file: '+err.message,zones:0});return;}
      NA.files.push(f);NA.current=f;m={t:'load',path:f};
    }
    NA.proc.stdin.write(JSON.stringify(m)+'\n');
  });
  ipcMain.handle('visu:nativeStop',()=>{if(NA.proc){try{NA.proc.stdin.end();}catch(e){}NA.proc=null;}return true;});
  app.on('will-quit',()=>{if(NA.proc){try{NA.proc.stdin.end();}catch(e){}}setTimeout(()=>naClean(null),0);});
  ipcMain.handle('visu:openLibraryFolder',()=>{fs.mkdirSync(libDir(),{recursive:true});return shell.openPath(libDir());});
  if(process.platform!=='darwin')Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
