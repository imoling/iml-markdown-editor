export {};

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
      };
      export: {
        pdf: (htmlContent: string, defaultPath: string, filePath: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      };
      ai: {
        getConfig: () => Promise<any>;
        saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
        chat: (messages: any[], onStream: (chunk: string) => void, requestId: string) => Promise<string>;
        stop: (requestId: string) => void;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
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
      };
      appVersion: string;
    };
  }
}
