import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  dialog: {
    open: (options?: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:open', options),
    save: (options?: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:save', options),
  },
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    saveImage: (activeFilePath: string, fileName: string, buffer: ArrayBuffer) => ipcRenderer.invoke('fs:saveImage', activeFilePath, fileName, buffer),
  },
  export: {
    pdf: (htmlContent: string, defaultPath: string) => ipcRenderer.invoke('export:pdf', htmlContent, defaultPath),
    word: (htmlContent: string, defaultPath: string) => ipcRenderer.invoke('export:word', htmlContent, defaultPath),
  },
  events: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    }
  },
  appVersion: process.env.npm_package_version || '1.0.0'
});
