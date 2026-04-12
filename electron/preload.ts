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
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    copy: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('fs:copy', sourcePath, targetPath),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
  },
  export: {
    pdf: (htmlContent: string, defaultPath: string, filePath: string) => ipcRenderer.invoke('export:pdf', htmlContent, defaultPath, filePath),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('ai:saveConfig', config),
    chat: (messages: any[], onStream: (chunk: string) => void, requestId: string, maxTokens?: number) => {
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
        ipcRenderer.send('ai:chat', { messages, requestId, maxTokens });
      });
    },
    stop: (requestId: string) => ipcRenderer.send('ai:stop', requestId),
    webSearch: (query: string) => ipcRenderer.invoke('ai:webSearch', query),
    fetchUrl: (url: string) => ipcRenderer.invoke('ai:fetchUrl', url),
    openSearchConfig: () => ipcRenderer.send('open-search-config'),
    getCoverImages: (params: any) => ipcRenderer.invoke('ai:getCoverImages', params),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('open-url', url),
  },
  wechat: {
    getTrends: () => ipcRenderer.invoke('wechat:getTrends'),
    getHotTopics: () => ipcRenderer.invoke('wechat:getHotTopics'),
    getConfig: () => ipcRenderer.invoke('wechat:getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('wechat:saveConfig', config),
    publish: (markdown: string, options?: { theme?: string; color?: string; accountId?: string; coverLocalPath?: string }) =>
      ipcRenderer.invoke('wechat:publish', { markdown, ...options }),
    publishHtml: (html: string, options?: { title?: string; abstract?: string; accountId?: string; coverLocalPath?: string; inlineImageDataUrls?: string[] }) =>
      ipcRenderer.invoke('wechat:publishHtml', { html, ...options }),
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
    version: '1.9.0',
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
    platform: process.platform,
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('app:saveSettings', settings),
    openWechatConfig: () => ipcRenderer.send('open:wechat-config'),
    openImageConfig: () => ipcRenderer.send('open:image-config'),
    openSettings: () => ipcRenderer.send('open:settings'),
    previewSettings: (settings: any) => ipcRenderer.send('settings:preview', settings),
    revertSettings: () => ipcRenderer.send('settings:revert'),
  },
  appVersion: '1.9.0'
});
