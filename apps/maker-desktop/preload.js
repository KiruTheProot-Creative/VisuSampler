// Gives the Maker page its desktop abilities: save a library into VisuPlayer's folder, find or open that folder, save and open projects, autosave,
// and native audio (VisuMakerAudio plays the project on the sound card with the VST's engine).
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('visuDesktop',{
  saveLibrary:(name,bytes)=>ipcRenderer.invoke('visu:saveLibrary',name,bytes),
  libraryFolder:()=>ipcRenderer.invoke('visu:libraryFolder'),
  openLibraryFolder:()=>ipcRenderer.invoke('visu:openLibraryFolder'),
  saveProject:(name,bytes,file,saveAs)=>ipcRenderer.invoke('visu:saveProject',name,bytes,file,saveAs),
  openProject:()=>ipcRenderer.invoke('visu:openProject'),
  /* autosave (a backup of the open project, offered back after a crash) */
  autosave:(parts,meta)=>ipcRenderer.invoke('visu:autosave',parts,meta),
  autosaveInfo:()=>ipcRenderer.invoke('visu:autosaveInfo'),
  autosaveRead:()=>ipcRenderer.invoke('visu:autosaveRead'),
  autosaveClear:()=>ipcRenderer.invoke('visu:autosaveClear'),
  /* version, log file, a project to open from Explorer */
  info:()=>ipcRenderer.invoke('visu:info'),
  log:(level,msg)=>ipcRenderer.send('visu:log',level,msg),
  openLogs:()=>ipcRenderer.invoke('visu:openLogs'),
  takeOpenRequest:()=>ipcRenderer.invoke('visu:takeOpenRequest'),
  onOpenRequest:cb=>{ipcRenderer.removeAllListeners('visu:openRequest');ipcRenderer.on('visu:openRequest',()=>cb());},
  onSaveThenClose:cb=>{ipcRenderer.removeAllListeners('visu:saveThenClose');ipcRenderer.on('visu:saveThenClose',()=>cb());}
});
contextBridge.exposeInMainWorld('visuNative',{
  start:()=>ipcRenderer.invoke('visu:nativeStart'),
  stop:()=>ipcRenderer.invoke('visu:nativeStop'),
  send:m=>ipcRenderer.send('visu:nativeSend',m),
  on:cb=>{ipcRenderer.removeAllListeners('visu:native');ipcRenderer.on('visu:native',(_e,m)=>cb(m));}
});
