import { contextBridge, ipcRenderer } from 'electron';

// 版本号由主进程从 package.json 读取，避免多处硬编码
const appVersion: string = ipcRenderer.sendSync('app:version');

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
    saveRecording: (noteDir: string, fileName: string, buffer: ArrayBuffer) => ipcRenderer.invoke('fs:saveRecording', noteDir, fileName, buffer),
    copyRecording: (noteDir: string, srcPath: string, fileName: string) => ipcRenderer.invoke('fs:copyRecording', noteDir, srcPath, fileName),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    copy: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('fs:copy', sourcePath, targetPath),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
    exists: (path: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', path),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
  },
  export: {
    pdf: (htmlContent: string, defaultPath: string, filePath: string) => ipcRenderer.invoke('export:pdf', htmlContent, defaultPath, filePath),
    html: (htmlContent: string, defaultPath: string, filePath: string) => ipcRenderer.invoke('export:html', htmlContent, defaultPath, filePath),
    image: (htmlContent: string, defaultPath: string, filePath: string) => ipcRenderer.invoke('export:image', htmlContent, defaultPath, filePath),
    saveFile: (defaultName: string, bytes: Uint8Array, filterName: string, extension: string) => ipcRenderer.invoke('export:saveFile', defaultName, bytes, filterName, extension),
    open: (filePath: string): Promise<boolean> => ipcRenderer.invoke('export:open', filePath),
    reveal: (filePath: string): Promise<boolean> => ipcRenderer.invoke('export:reveal', filePath),
  },
  // 富文本进剪贴板由主进程写：不挑焦点、不要用户手势（复制为公众号格式）
  clipboard: {
    writeHtml: (html: string, text: string): Promise<boolean> => ipcRenderer.invoke('clipboard:writeHtml', html, text),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('ai:saveConfig', config),
    chat: (messages: any[], onStream: (chunk: string) => void, requestId: string, maxTokens?: number, temperature?: number) => {
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
        ipcRenderer.send('ai:chat', { messages, requestId, maxTokens, temperature });
      });
    },
    stop: (requestId: string) => ipcRenderer.send('ai:stop', requestId),
    generateImage: (params: { prompt: string; config: any }) => ipcRenderer.invoke('ai:generateImage', params),
    listModels: (params: { endpoint: string; apiKey: string; protocol: string }): Promise<string[]> => ipcRenderer.invoke('ai:listModels', params),
    testConnection: (config: any) => ipcRenderer.invoke('ai:testConnection', config),
  },
  // 本机模型：编辑器托管的 llama-server 与 GGUF 模型
  local: {
    getState: () => ipcRenderer.invoke('local:getState'),
    installRuntime: (draft?: any) => ipcRenderer.invoke('local:installRuntime', draft),
    cancelInstall: () => ipcRenderer.invoke('local:cancelInstall'),
    pickRuntime: () => ipcRenderer.invoke('local:pickRuntime'),
    clearRuntimePath: () => ipcRenderer.invoke('local:clearRuntimePath'),
    downloadModel: (id: string, draft?: any) => ipcRenderer.invoke('local:downloadModel', id, draft),
    cancelDownload: (id: string) => ipcRenderer.invoke('local:cancelDownload', id),
    deleteModel: (id: string) => ipcRenderer.invoke('local:deleteModel', id),
    importModel: () => ipcRenderer.invoke('local:importModel'),
    start: (draft?: any) => ipcRenderer.invoke('local:start', draft),
    stop: () => ipcRenderer.invoke('local:stop'),
    switchBack: (target: string) => ipcRenderer.invoke('local:switchBack', target),
    getLogs: (): Promise<string[]> => ipcRenderer.invoke('local:getLogs'),
    test: (draft?: any) => ipcRenderer.invoke('local:test', draft),
    openModelsFolder: () => ipcRenderer.invoke('local:openModelsFolder'),
    onState: (callback: (state: any) => void) => {
      const listener = (_event: any, state: any) => callback(state);
      ipcRenderer.on('local:state', listener);
      return () => ipcRenderer.removeListener('local:state', listener);
    },
    onLog: (callback: (line: string) => void) => {
      const listener = (_event: any, line: string) => callback(line);
      ipcRenderer.on('local:log', listener);
      return () => ipcRenderer.removeListener('local:log', listener);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('open-url', url),
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  },
  library: {
    watch: (dirPath: string): Promise<boolean> => ipcRenderer.invoke('library:watch', dirPath),
    findOrphanImages: (extraTexts?: string[]) => ipcRenderer.invoke('library:findOrphanImages', extraTexts),
    trashImages: (paths: string[]) => ipcRenderer.invoke('library:trashImages', paths),
  },
  history: {
    list: (filePath: string) => ipcRenderer.invoke('history:list', filePath),
    read: (filePath: string, id: string): Promise<string | null> => ipcRenderer.invoke('history:read', filePath, id),
  },
  web: {
    fetchTitle: (url: string): Promise<string | null> => ipcRenderer.invoke('web:fetchTitle', url),
  },
  // 实时转写：识别组件的下载、识别进程的启停、音频块上行与文字下行
  asr: {
    getState: () => ipcRenderer.invoke('asr:getState'),
    install: () => ipcRenderer.invoke('asr:install'),
    cancelInstall: () => ipcRenderer.invoke('asr:cancelInstall'),
    uninstall: () => ipcRenderer.invoke('asr:uninstall'),
    requestMicAccess: () => ipcRenderer.invoke('asr:requestMicAccess'),
    openMicSettings: () => ipcRenderer.invoke('asr:openMicSettings'),
    start: (opts?: { speakers?: boolean; source?: 'mic' | 'file' }) => ipcRenderer.invoke('asr:start', opts),
    installSpeaker: () => ipcRenderer.invoke('asr:installSpeaker'),
    cancelSpeakerInstall: () => ipcRenderer.invoke('asr:cancelSpeakerInstall'),
    uninstallSpeaker: () => ipcRenderer.invoke('asr:uninstallSpeaker'),
    stop: () => ipcRenderer.invoke('asr:stop'),
    sendPcm: (samples: Float32Array) => ipcRenderer.send('asr:pcm', samples),
    setUnsaved: (state: { recording: boolean } | null) => ipcRenderer.send('asr:unsaved', state),
    saveDraftAudio: (buffer: ArrayBuffer) => ipcRenderer.invoke('asr:saveDraftAudio', buffer),
    getDraftAudio: () => ipcRenderer.invoke('asr:getDraftAudio'),
    clearDraft: () => ipcRenderer.invoke('asr:clearDraft'),
    copyDraftAudio: (noteDir: string, fileName: string) => ipcRenderer.invoke('asr:copyDraftAudio', noteDir, fileName),
    onState: (callback: (state: any) => void) => {
      const listener = (_event: any, state: any) => callback(state);
      ipcRenderer.on('asr:state', listener);
      return () => ipcRenderer.removeListener('asr:state', listener);
    },
    onEvent: (callback: (event: any) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('asr:event', listener);
      return () => ipcRenderer.removeListener('asr:event', listener);
    },
  },
  // 语义索引：本机嵌入模型、相关笔记、语义搜索
  semantic: {
    getState: () => ipcRenderer.invoke('semantic:getState'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('semantic:setEnabled', enabled),
    setModel: (modelId: string) => ipcRenderer.invoke('semantic:setModel', modelId),
    downloadModel: (id: string) => ipcRenderer.invoke('semantic:downloadModel', id),
    cancelDownload: (id: string) => ipcRenderer.invoke('semantic:cancelDownload', id),
    deleteModel: (id: string) => ipcRenderer.invoke('semantic:deleteModel', id),
    rebuild: () => ipcRenderer.invoke('semantic:rebuild'),
    search: (query: string, limit?: number) => ipcRenderer.invoke('semantic:search', query, limit),
    related: (filePath: string, limit?: number) => ipcRenderer.invoke('semantic:related', filePath, limit),
    retrieve: (question: string, limit?: number) => ipcRenderer.invoke('semantic:retrieve', question, limit),
    onState: (callback: (state: any) => void) => {
      const listener = (_event: any, state: any) => callback(state);
      ipcRenderer.on('semantic:state', listener);
      return () => ipcRenderer.removeListener('semantic:state', listener);
    },
  },
  search: {
    query: (query: string, limit?: number) => ipcRenderer.invoke('search:query', query, limit),
    status: () => ipcRenderer.invoke('search:status'),
    listNotes: () => ipcRenderer.invoke('search:listNotes'),
    backlinks: (nameOrPath: string) => ipcRenderer.invoke('search:backlinks', nameOrPath),
    unlinkedMentions: (filePath: string) => ipcRenderer.invoke('search:unlinkedMentions', filePath),
    tasks: (includeDone?: boolean) => ipcRenderer.invoke('search:tasks', includeDone),
    findAttachment: (name: string, fromDir?: string | null): Promise<string | null> => ipcRenderer.invoke('search:findAttachment', name, fromDir),
    openAttachment: (filePath: string): Promise<boolean> => ipcRenderer.invoke('search:openAttachment', filePath),
    tags: () => ipcRenderer.invoke('search:tags'),
    notesByTag: (tag: string) => ipcRenderer.invoke('search:notesByTag', tag),
  },
  capture: {
    /** 快速捕获的开关、快捷键，以及快捷键有没有注册上 */
    status: () => ipcRenderer.invoke('capture:status'),
    /** 立刻弹出小输入窗（设置里的「试一下」） */
    show: () => ipcRenderer.invoke('capture:show'),
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
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
    platform: process.platform,
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('app:saveSettings', settings),
    openImageConfig: () => ipcRenderer.send('open:image-config'),
    openSettings: () => ipcRenderer.send('open:settings'),
    consumePendingOpenFiles: (): Promise<string[]> => ipcRenderer.invoke('app:consumePendingOpenFiles'),
    clearSession: () => ipcRenderer.send('app:clearSession'),
    detectSyncFolders: () => ipcRenderer.invoke('app:detectSyncFolders'),
    homeLibraryPath: (): Promise<{ path: string; exists: boolean }> => ipcRenderer.invoke('app:homeLibraryPath'),
    /** 取走系统递进来、还没处理的 iml:// 链接（已经解析、校验过） */
    consumePendingUrls: () => ipcRenderer.invoke('app:consumePendingUrls'),
    previewSettings: (settings: any) => ipcRenderer.send('settings:preview', settings),
    revertSettings: () => ipcRenderer.send('settings:revert'),
    getWhatsNewState: (): Promise<{ current: string; lastSeen: string | null }> => ipcRenderer.invoke('app:getWhatsNewState'),
    markWhatsNewSeen: () => ipcRenderer.invoke('app:markWhatsNewSeen'),
  },
  appVersion,
});
