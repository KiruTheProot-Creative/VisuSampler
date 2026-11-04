// VisuMaker desktop: serves the web app from a private app:// scheme (so ES modules load) in one window.
const {app,BrowserWindow,protocol,net,shell,Menu}=require('electron');
const path=require('node:path');const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const WWW=path.join(__dirname,'www');
function createWindow(){
  const win=new BrowserWindow({width:1500,height:900,minWidth:1100,minHeight:640,backgroundColor:'#262626',title:'VisuMaker',
    webPreferences:{contextIsolation:true,sandbox:true}});
  win.loadURL('app://local/apps/maker/index.html');
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return{action:'deny'};});
}
app.whenReady().then(()=>{
  protocol.handle('app',req=>{
    const p=decodeURIComponent(new URL(req.url).pathname),file=path.normalize(path.join(WWW,p));
    if(!file.startsWith(WWW))return new Response('not found',{status:404});
    return net.fetch(pathToFileURL(file).toString());
  });
  if(process.platform!=='darwin')Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
