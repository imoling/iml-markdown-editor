export {};

export interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
  author?: string;
  defaultTheme?: string;
  defaultColor?: string;
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
        saveImage: (activeFilePath: string, fileName: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>;
        rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }>;
        copy: (sourcePath: string, targetPath: string) => Promise<{ success: boolean; sourcePath?: string; targetPath?: string; error?: string }>;
        delete: (path: string) => Promise<{ success: boolean; path?: string; permanently?: boolean; error?: string }>;
      };
      export: {
        pdf: (htmlContent: string, defaultPath: string, filePath: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      };
      ai: {
        getConfig: () => Promise<any>;
        saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
        chat: (messages: any[], onStream: (chunk: string) => void, requestId: string, maxTokens?: number) => Promise<string>;
        stop: (requestId: string) => void;
        webSearch: (query: string) => Promise<string>;
        fetchUrl: (url: string) => Promise<string>;
        openSearchConfig: () => void;
        getCoverImages: (params: { query: string; vibe: string; config: any }) => Promise<{ url: string; localPath: string }[]>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      wechat: {
        getTrends: () => Promise<string>;
        getHotTopics: () => Promise<{ title: string; source: string }[]>;
        getConfig: () => Promise<{ accounts: WechatAccount[] }>;
        saveConfig: (config: { accounts: WechatAccount[] }) => Promise<{ success: boolean; error?: string }>;
        publish: (markdown: string, options?: { theme?: string; color?: string; accountId?: string; coverLocalPath?: string }) => Promise<{ success: boolean; output: string }>;
        publishHtml: (html: string, options?: { title?: string; abstract?: string; accountId?: string; coverLocalPath?: string; inlineImageDataUrls?: string[] }) => Promise<{ success: boolean; mediaId: string }>;
      };
      events: {
        on: (channel: string, callback: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      };
      app: {
        version: string;
        checkUpdates: () => Promise<{ success: boolean; latestVersion?: string; releaseUrl?: string; error?: string }>;
        platform: string;
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        getSettings: () => Promise<any>;
        saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
        openWechatConfig: () => void;
        openImageConfig: () => void;
        openSettings: () => void;
        previewSettings: (settings: any) => void;
        revertSettings: () => void;
      };
      appVersion: string;
    };
  }
}
