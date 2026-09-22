export {};

import type { LocalState, LocalModelConfig, CustomModel, ServerState } from '../../electron/localModel/index';
export type { LocalState, LocalModelConfig, CustomModel, ServerState, LocalModelEntry, InstallState } from '../../electron/localModel/index';

import type { SemanticState, SemanticHit, AskSource } from '../../electron/semantic/index';
import type { HistoryEntry } from '../../electron/history';
import type { ResourceState, ServiceId } from '../../electron/localModel/scheduler';
import type { ImageGenState } from '../../electron/imageGen/index';
import type { OrphanImage } from '../../electron/assets';
export type { SemanticState, SemanticHit, EmbedModelEntry, AskSource } from '../../electron/semantic/index';
export type { HistoryEntry } from '../../electron/history';
import type { AsrState } from '../../electron/asr/index';
import type { PipelineEvent } from '../../electron/asr/pipeline';
export type { AsrState } from '../../electron/asr/index';
import type { UpdateInfo } from '../../electron/update';
export type { UpdateInfo } from '../../electron/update';
/** 识别进程发回来的事件：临时文字、定稿、出错、收尾完成 */
export type AsrEvent = PipelineEvent | { type: 'error'; message: string } | { type: 'done' } | { type: 'fed'; samples: number };
export type { OrphanImage } from '../../electron/assets';

export interface TagCount { tag: string; count: number }
export interface TaggedNote { path: string; title: string; tags: string[]; mtime: number }

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  reply: string;
  endpoint: string;
  model: string;
}

export interface SearchSnippet {
  before: string;
  match: string;
  after: string;
}
export interface SearchResult {
  path: string;
  title: string;
  count: number;
  score: number;
  snippets: SearchSnippet[];
}
export interface BacklinkResult {
  path: string;
  title: string;
  snippets: SearchSnippet[];
}
export interface NoteTasks {
  path: string;
  title: string;
  mtime: number;
  tasks: import('../../electron/shared/tasks').NoteTask[];
}
/** 未链接提及的一处：offset / length 指向那篇笔记原文里的那个词 */
export interface MentionSnippet extends SearchSnippet {
  offset: number;
  length: number;
}
export interface MentionResult {
  path: string;
  title: string;
  snippets: MentionSnippet[];
}

declare global {
  interface Window {
    api: {
      dialog: {
        open: (options?: any) => Promise<string[] | null>;
        save: (options?: any) => Promise<string | null>;
      };
      fs: {
        readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string; filePath?: string }>;
        writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string; filePath?: string }>;
        readDir: (dirPath: string) => Promise<{ success: boolean; files?: any[]; error?: string; path?: string }>;
        saveImage: (activeFilePath: string, fileName: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; bytes?: number; error?: string }>;
        saveRecording: (noteDir: string, fileName: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; bytes?: number; error?: string }>;
        copyRecording: (noteDir: string, srcPath: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
        rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }>;
        copy: (sourcePath: string, targetPath: string) => Promise<{ success: boolean; sourcePath?: string; targetPath?: string; error?: string }>;
        delete: (path: string) => Promise<{ success: boolean; path?: string; permanently?: boolean; error?: string }>;
        exists: (path: string) => Promise<boolean>;
        mkdir: (dirPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      };
      export: {
        pdf: (htmlContent: string, defaultPath: string, filePath: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
        html: (htmlContent: string, defaultPath: string, filePath: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
        /** 渲染层生成好的文件（Word 文档）交给主进程问路径、写盘 */
        saveFile: (defaultName: string, bytes: Uint8Array, filterName: string, extension: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
        /** 长图；很长的笔记会分成几张，paths 是全部文件 */
        image: (htmlContent: string, defaultPath: string, filePath: string) => Promise<{ success: boolean; path?: string; paths?: string[]; canceled?: boolean; error?: string }>;
        /** 用系统默认应用打开 / 在访达里选中一个刚导出的文件；只认这次运行里导出过的路径 */
        open: (filePath: string) => Promise<boolean>;
        reveal: (filePath: string) => Promise<boolean>;
      };
      ai: {
        getConfig: () => Promise<any>;
        saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
        chat: (messages: any[], onStream: (chunk: string) => void, requestId: string, maxTokens?: number, temperature?: number) => Promise<string>;
        stop: (requestId: string) => void;
        generateImage: (params: { prompt: string; config: any }) => Promise<{ url: string }[]>;
        listModels: (params: { endpoint: string; apiKey: string; protocol: string }) => Promise<string[]>;
        testConnection: (config: { protocol: string; endpoint: string; apiKey: string; model: string }) => Promise<ConnectionTestResult>;
      };
      local: {
        getState: () => Promise<LocalState>;
        installRuntime: (draft?: Partial<LocalModelConfig>) => Promise<boolean>;
        cancelInstall: () => Promise<boolean>;
        pickRuntime: () => Promise<string | null>;
        clearRuntimePath: () => Promise<boolean>;
        downloadModel: (id: string, draft?: Partial<LocalModelConfig>) => Promise<boolean>;
        cancelDownload: (id: string) => Promise<boolean>;
        deleteModel: (id: string) => Promise<void>;
        importModel: () => Promise<CustomModel | null>;
        start: (draft?: Partial<LocalModelConfig>) => Promise<ServerState>;
        stop: () => Promise<void>;
        switchBack: (target: string) => Promise<boolean>;
        getLogs: () => Promise<string[]>;
        test: (draft?: Partial<LocalModelConfig>) => Promise<ConnectionTestResult>;
        openModelsFolder: () => Promise<boolean>;
        onState: (callback: (state: LocalState) => void) => () => void;
        onLog: (callback: (line: string) => void) => () => void;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
        showItemInFolder: (path: string) => Promise<void>;
      };
      library: {
        watch: (dirPath: string) => Promise<boolean>;
        findOrphanImages: (extraTexts?: string[]) => Promise<OrphanImage[]>;
        trashImages: (paths: string[]) => Promise<{ trashed: number; failed: string[] }>;
      };
      history: {
        list: (filePath: string) => Promise<HistoryEntry[]>;
        read: (filePath: string, id: string) => Promise<string | null>;
      };
      web: {
        fetchTitle: (url: string) => Promise<string | null>;
      };
      asr: {
        getState: () => Promise<AsrState>;
        install: () => Promise<boolean>;
        cancelInstall: () => Promise<boolean>;
        uninstall: () => Promise<AsrState>;
        requestMicAccess: () => Promise<AsrState>;
        openMicSettings: () => Promise<boolean>;
        openScreenSettings: () => Promise<boolean>;
        onSystemPcm: (callback: (buf: ArrayBuffer) => void) => () => void;
        start: (opts?: { speakers?: boolean; source?: 'mic' | 'file' | 'system' }) => Promise<AsrState>;
        installSpeaker: () => Promise<boolean>;
        cancelSpeakerInstall: () => Promise<boolean>;
        uninstallSpeaker: () => Promise<AsrState>;
        stop: () => Promise<AsrState>;
        sendPcm: (samples: Float32Array) => void;
        setUnsaved: (state: { recording: boolean } | null) => void;
        saveDraftAudio: (buffer: ArrayBuffer) => Promise<{ path: string; bytes: number } | null>;
        getDraftAudio: () => Promise<{ path: string; bytes: number } | null>;
        clearDraft: () => Promise<boolean>;
        copyDraftAudio: (noteDir: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
        onState: (callback: (state: AsrState) => void) => () => void;
        onEvent: (callback: (event: AsrEvent) => void) => () => void;
      };
      semantic: {
        getState: () => Promise<SemanticState>;
        setEnabled: (enabled: boolean) => Promise<SemanticState>;
        setModel: (modelId: string) => Promise<SemanticState>;
        downloadModel: (id: string) => Promise<boolean>;
        cancelDownload: (id: string) => Promise<boolean>;
        deleteModel: (id: string) => Promise<boolean>;
        rebuild: () => Promise<boolean>;
        search: (query: string, limit?: number) => Promise<SemanticHit[]>;
        related: (filePath: string, limit?: number) => Promise<SemanticHit[]>;
        /** 「问你的笔记」：为一个问题找出最相关的几块原文；检索本身出错会抛出来 */
        retrieve: (question: string, limit?: number) => Promise<AskSource[]>;
        onState: (callback: (state: SemanticState) => void) => () => void;
      };
      search: {
        query: (query: string, limit?: number) => Promise<SearchResult[]>;
        status: () => Promise<{ root: string | null; count: number; building: boolean }>;
        listNotes: () => Promise<{ path: string; title: string; aliases?: string[] }[]>;
        /** 传库里笔记的路径：按它的文件名 / 一级标题 / 别名找链接；传别的当成一个名字 */
        backlinks: (nameOrPath: string) => Promise<BacklinkResult[]>;
        unlinkedMentions: (filePath: string) => Promise<MentionResult[]>;
        /** 全库待办：有待办的笔记连同它的待办，最近改过的在前；默认只要没勾的 */
        tasks: (includeDone?: boolean) => Promise<NoteTasks[]>;
        /** `![[截图.png]]`：按文件名在整个笔记库里找图片 / 音频，返回绝对路径 */
        findAttachment: (name: string, fromDir?: string | null) => Promise<string | null>;
        /** 用系统默认应用打开库里的一个附件（PDF 卡片上的「打开」）；不是库里的附件返回 false */
        openAttachment: (filePath: string) => Promise<boolean>;
        tags: () => Promise<TagCount[]>;
        notesByTag: (tag: string) => Promise<TaggedNote[]>;
      };
      capture: {
        status: () => Promise<{ enabled: boolean; shortcut: string; registered: boolean }>;
        show: () => Promise<boolean>;
      };
      events: {
        on: (channel: string, callback: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      };
      clipboard?: {
        writeHtml: (html: string, text: string) => Promise<boolean>;
      };
      image: {
        getState: () => Promise<ImageGenState>;
        install: () => Promise<boolean>;
        cancelInstall: () => Promise<boolean>;
        delete: () => Promise<ImageGenState>;
        start: () => Promise<ImageGenState>;
        stop: () => Promise<ImageGenState>;
        cancelGeneration: () => Promise<boolean>;
        onState: (cb: (state: ImageGenState) => void) => () => void;
      };
      resources: {
        getState: () => Promise<ResourceState>;
        start: (id: ServiceId) => Promise<ResourceState>;
        stop: (id: ServiceId) => Promise<ResourceState>;
        setConfig: (patch: { idleMinutes?: Partial<Record<ServiceId, number>>; exclusiveImage?: boolean }) => Promise<ResourceState>;
        onState: (cb: (state: ResourceState) => void) => () => void;
        onNotice: (cb: (text: string) => void) => () => void;
      };
      app: {
        checkUpdates: () => Promise<UpdateInfo>;
        platform: string;
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        getSettings: () => Promise<any>;
        saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
        openImageConfig: () => void;
        openSettings: () => void;
        consumePendingOpenFiles: () => Promise<string[]>;
        clearSession: () => void;
        /** 本机装了哪些同步盘，以及把笔记库放进去的话会是哪个目录（只检测，不建目录） */
        consumePendingUrls: () => Promise<import('../../electron/shared/appUrl').AppUrlAction[]>;
        detectSyncFolders: () => Promise<{ id: string; name: string; root: string; libraryPath: string; libraryExists: boolean }[]>;
        /** 应用默认的笔记库目录（文稿/iML Notes）及其是否存在 */
        homeLibraryPath: () => Promise<{ path: string; exists: boolean }>;
        previewSettings: (settings: any) => void;
        revertSettings: () => void;
        getWhatsNewState: () => Promise<{ current: string; lastSeen: string | null }>;
        markWhatsNewSeen: () => Promise<boolean>;
      };
      appVersion: string;
    };
  }
}
