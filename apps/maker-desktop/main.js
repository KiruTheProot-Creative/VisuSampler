// VisuMaker desktop: serves the web app from a private app:// scheme (so ES modules load) in one window.
const {app,BrowserWindow,protocol,net,shell,Menu,ipcMain,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const os=require('node:os');const {spawn}=require('node:child_process');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const WWW=path.join(__dirname,'www');
/* Which build this is (build.json is written by the release workflow; a local run says "dev") */
const BUILD=(()=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,'build.json'),'utf8'));}catch(e){return{build:'dev',date:''};}})();
const VERSION=app.getVersion(),BUILD_ID=BUILD.build||'dev',TITLE='VisuMaker '+VERSION+' ('+BUILD_ID+')';
/* Log file for bug reports: Documents/VisuSampler/Logs/VisuMaker.log (the old one is kept once, as VisuMaker.old.log, past 1 MB) */
const logDir=()=>path.join(app.getPath('documents'),'VisuSampler','Logs'),logFile=()=>path.join(logDir(),'VisuMaker.log');
let logReady=false;
function log(level,msg){
  try{
    if(!logReady){fs.mkdirSync(logDir(),{recursive:true});const f=logFile();if(fs.existsSync(f)&&fs.statSync(f).size>1<<20)fs.renameSync(f,path.join(logDir(),'VisuMaker.old.log'));logReady=true;}
    const d=new Date(),t=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+d.toTimeString().slice(0,8);
    fs.appendFileSync(logFile(),t+'  '+String(level).toUpperCase().padEnd(5)+' '+String(msg).replace(/\s+$/,'')+'\n');
  }catch(e){}
}
process.on('uncaughtException',e=>{log('error','main process: '+(e&&e.stack||e));});
/* a project double-clicked in Explorer (or dropped on the app icon) */
const argProject=argv=>argv.slice(1).find(a=>/\.vmproj$/i.test(a)&&fs.existsSync(a))||null;
let pendingOpen=argProject(process.argv);
function createWindow(){
  const win=new BrowserWindow({width:1500,height:900,minWidth:1100,minHeight:640,backgroundColor:'#262626',title:TITLE,
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
  win.on('page-title-updated',e=>e.preventDefault());   /* keep the version in the title */
  win.webContents.on('console-message',(...a)=>{   /* warnings and errors from the page go into the log */
    const d=a[0]&&a[0].message!==undefined?a[0]:{level:a[1],message:a[2],lineNumber:a[3],sourceId:a[4]};
    const lv=typeof d.level==='number'?['debug','info','warn','error'][d.level]||'info':String(d.level);
    if(lv==='warn'||lv==='warning'||lv==='error')log(lv==='error'?'error':'warn','page: '+d.message+(d.sourceId?' ('+String(d.sourceId).split('/').pop()+':'+d.lineNumber+')':''));
  });
  win.webContents.on('render-process-gone',(_e,d)=>log('error','the page stopped: '+d.reason+' (exit code '+d.exitCode+')'));
  win.on('unresponsive',()=>log('warn','the window stopped responding'));
  win.on('responsive',()=>log('info','the window responds again'));
  /* closing with unsaved changes: the page holds the close back, and we ask */
  win.webContents.on('will-prevent-unload',e=>{
    if(process.argv.includes('--smoke')){e.preventDefault();return;}
    const c=dialog.showMessageBoxSync(win,{type:'warning',title:'VisuMaker',message:'Save the changes to your project before closing?',
      detail:'If you close without saving, the last backup is kept and offered the next time you start VisuMaker.',
      buttons:['Save','Close without saving','Cancel'],defaultId:0,cancelId:2,noLink:true});
    if(c===0)win.webContents.send('visu:saveThenClose');   /* the page saves, then closes itself */
    else if(c===1)e.preventDefault();                       /* close anyway */
  });
}
/* Autosave: one backup of the open project in the app's own folder, offered back after a crash or a close without saving. */
const autoDir=()=>path.join(app.getPath('userData'),'autosave'),autoFile=()=>path.join(autoDir(),'backup.vmproj'),autoMeta=()=>path.join(autoDir(),'backup.json');
app.whenReady().then(()=>{
  protocol.handle('app',req=>{
    const p=decodeURIComponent(new URL(req.url).pathname),file=path.normalize(path.join(WWW,p));
    if(!file.startsWith(WWW))return new Response('not found',{status:404});
    return net.fetch(pathToFileURL(file).toString());
  });
  /* Export to VisuPlayer: the VST reads Documents/VisuSampler/Libraries */
  const libDir=()=>path.join(app.getPath('documents'),'VisuSampler','Libraries');
  /* ext: vsins (one instrument) or vslib (a library of instruments). An older .vsamp of the same name is replaced
     by the new .vsins, so the player does not list it twice. */
  ipcMain.handle('visu:saveLibrary',async(_e,name,bytes,ext)=>{
    const safe=String(name||'library').replace(/[<>:"/\\|?*\x00-\x1f]+/g,'').trim()||'library',x=ext==='vslib'?'vslib':'vsins';
    fs.mkdirSync(libDir(),{recursive:true});
    const file=path.join(libDir(),safe+'.'+x),tmp=file+'.saving';
    await fs.promises.writeFile(tmp,Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));await fs.promises.rename(tmp,file);
    if(x==='vsins'){const old=path.join(libDir(),safe+'.vsamp');if(fs.existsSync(old))await fs.promises.rm(old,{force:true});}
    log('info','sent to VisuPlayer: '+file);
    return file;
  });
  ipcMain.handle('visu:libraryFolder',()=>libDir());
  /* version, log and the project to open */
  ipcMain.handle('visu:info',()=>({version:VERSION,build:BUILD_ID,date:BUILD.date||'',os:os.type()+' '+os.release()+' ('+os.arch()+')',electron:process.versions.electron,logFile:logFile()}));
  ipcMain.on('visu:log',(_e,level,msg)=>log(level==='error'||level==='warn'?level:'info',String(msg).slice(0,4000)));
  ipcMain.handle('visu:openLogs',()=>{fs.mkdirSync(logDir(),{recursive:true});return shell.openPath(logDir());});
  ipcMain.handle('visu:takeOpenRequest',async()=>{const f=pendingOpen;pendingOpen=null;if(!f)return null;
    try{return{file:f,bytes:new Uint8Array(await fs.promises.readFile(f))};}catch(err){log('error','could not read '+f+': '+err.message);return null;}});
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
    log('info','saved '+file);
    return file;
  });
  ipcMain.handle('visu:autosave',async(e,parts,meta)=>{
    await fs.promises.mkdir(autoDir(),{recursive:true});
    const tmp=autoFile()+'.saving',fh=await fs.promises.open(tmp,'w');
    try{for(const d of parts)await fh.write(Buffer.from(d.buffer,d.byteOffset,d.byteLength));}finally{await fh.close();}
    await fs.promises.rename(tmp,autoFile());
    await fs.promises.writeFile(autoMeta(),JSON.stringify(Object.assign({},meta,{time:Date.now()})));
    return true;
  });
  ipcMain.handle('visu:autosaveInfo',async()=>{
    try{const m=JSON.parse(await fs.promises.readFile(autoMeta(),'utf8')),st=await fs.promises.stat(autoFile());return Object.assign(m,{size:st.size});}catch(err){return null;}
  });
  ipcMain.handle('visu:autosaveRead',async()=>new Uint8Array(await fs.promises.readFile(autoFile())));
  ipcMain.handle('visu:autosaveClear',async()=>{for(const f of [autoMeta(),autoFile()])await fs.promises.rm(f,{force:true});return true;});
  ipcMain.handle('visu:openProject',async e=>{
    const r=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{title:'Open project',filters:projFilter,properties:['openFile']});
    if(r.canceled||!r.filePaths[0])return null;
    log('info','open '+r.filePaths[0]);
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
      if(m.t==='loaded'&&m.error&&m.error!=='keepMiss')log('warn','the audio helper could not load the project: '+m.error);
      if(m.t==='devices'&&m.current)log(m.error?'warn':'info','audio device: '+[m.current.type,m.current.device,m.current.rate+' Hz',m.current.buffer+' samples',(m.current.latencyMs!=null?m.current.latencyMs+' ms':'')].join(' · ')+(m.error?' ('+m.error+')':''));
      naTell(m);}});
    NA.proc.on('exit',code=>{NA.proc=null;if(code)log('warn','the audio helper stopped (exit code '+code+')');naTell({t:'exit',code});});
    NA.proc.on('error',err=>{NA.proc=null;log('error','the audio helper could not run: '+(err.message||err));naTell({t:'exit',code:-1,error:String(err.message||err)});});
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
  log('info','---- '+TITLE+' started · '+os.type()+' '+os.release()+' '+os.arch()+' · Electron '+process.versions.electron+(pendingOpen?' · opening '+pendingOpen:''));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('will-quit',()=>log('info','closed'));
/* one VisuMaker at a time: double-clicking another project while it runs opens it in the running one */
if(!process.argv.includes('--smoke')){
  if(!app.requestSingleInstanceLock())app.quit();
  else app.on('second-instance',(_e,argv)=>{
    const w=BrowserWindow.getAllWindows()[0];if(!w)return;if(w.isMinimized())w.restore();w.focus();
    const f=argProject(argv);if(f){pendingOpen=f;w.webContents.send('visu:openRequest');}
  });
}
