// Gives the Maker page exactly three desktop abilities: save a library into VisuPlayer's folder, and find or open that folder.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('visuDesktop',{
  saveLibrary:(name,bytes)=>ipcRenderer.invoke('visu:saveLibrary',name,bytes),
  libraryFolder:()=>ipcRenderer.invoke('visu:libraryFolder'),
  openLibraryFolder:()=>ipcRenderer.invoke('visu:openLibraryFolder')
});
