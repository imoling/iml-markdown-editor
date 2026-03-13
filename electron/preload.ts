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
    pdf: (htmlContent: string, defaultPath: string, filePath: string) => ipcRenderer.invoke('export:pdf', htmlContent, defaultPath, filePath),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('ai:saveConfig', config),
    chat: (messages: any[], onStream: (chunk: string) => void) => {
      const requestId = Math.random().toString(36).substring(7);
      
      const chunkListener = (_event: any, content: string) => onStream(content);
      
      ipcRenderer.on(`ai:chat-chunk-${requestId}`, chunkListener);
      
      return new Promise((resolve, reject) => {
        ipcRenderer.once(`ai:chat-done-${requestId}`, (_event, fullContent) => {
          ipcRenderer.removeListener(`ai:chat-chunk-${requestId}`, chunkListener);
          resolve(fullContent);
        });
        
        ipcRenderer.once(`ai:chat-error-${requestId}`, (_event, error) => {
          ipcRenderer.removeListener(`ai:chat-chunk-${requestId}`, chunkListener);
          reject(new Error(error));
        });
        
        ipcRenderer.send('ai:chat', { messages, requestId });
      });
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('open-url', url),
  },
  events: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    }
  },
  app: {
    version: process.env.npm_package_version || '1.0.0',
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  },
  appVersion: process.env.npm_package_version || '1.0.0'
});
