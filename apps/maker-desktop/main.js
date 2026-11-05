// VisuMaker desktop: serves the web app from a private app:// scheme (so ES modules load) in one window.
const {app,BrowserWindow,protocol,net,shell,Menu,ipcMain}=require('electron');
const fs=require('node:fs');
const path=require('node:path');const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const WWW=path.join(__dirname,'www');
function createWindow(){
  const win=new BrowserWindow({width:1500,height:900,minWidth:1100,minHeight:640,backgroundColor:'#262626',title:'VisuMaker',
    webPreferences:{contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.js')}});
  win.loadURL('app://local/apps/maker/index.html'+(process.argv.includes('--worklet-file')?'?wfile=1':''));
  /* --smoke: start the audio, wait, and report whether the shared engine runs (used by the Windows build check) */
  if(process.argv.includes('--smoke'))win.webContents.once('did-finish-load',async()=>{
    try{
      await win.webContents.executeJavaScript('window.__visuStartAudio()',true);
      await new Promise(r=>setTimeout(r,8000));
      const st=JSON.parse(await win.webContents.executeJavaScript('JSON.stringify(window.__visuEngine())',true));
      console.log('VISU-ENGINE '+JSON.stringify(st));
      app.exit(st.on?0:1);
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
  ipcMain.handle('visu:openLibraryFolder',()=>{fs.mkdirSync(libDir(),{recursive:true});return shell.openPath(libDir());});
  if(process.platform!=='darwin')Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
