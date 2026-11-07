// Gives the Maker page its desktop abilities: save a library into VisuPlayer's folder, find or open that folder, save and open projects,
// and native audio (VisuMakerAudio plays the project on the sound card with the VST's engine).
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('visuDesktop',{
  saveLibrary:(name,bytes)=>ipcRenderer.invoke('visu:saveLibrary',name,bytes),
  libraryFolder:()=>ipcRenderer.invoke('visu:libraryFolder'),
  openLibraryFolder:()=>ipcRenderer.invoke('visu:openLibraryFolder'),
  saveProject:(name,bytes,file,saveAs)=>ipcRenderer.invoke('visu:saveProject',name,bytes,file,saveAs),
  openProject:()=>ipcRenderer.invoke('visu:openProject')
});
contextBridge.exposeInMainWorld('visuNative',{
  start:()=>ipcRenderer.invoke('visu:nativeStart'),
  stop:()=>ipcRenderer.invoke('visu:nativeStop'),
  send:m=>ipcRenderer.send('visu:nativeSend',m),
  on:cb=>{ipcRenderer.removeAllListeners('visu:native');ipcRenderer.on('visu:native',(_e,m)=>cb(m));}
});
