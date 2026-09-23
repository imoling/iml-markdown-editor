import { vi } from 'vitest';

// Mermaid 依赖浏览器绘图能力，测试里一律替换成空实现
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })), run: vi.fn(), parse: vi.fn() },
}));

/** 内存文件系统：测试 store 的文件相关逻辑时用它顶替 Electron 的 IPC 桥 */
export function createMockApi(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  const dirs = new Set<string>();
  for (const p of files.keys()) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') || '/');
  }
  const api = {
    files,
    dirs,
    fs: {
      readFile: vi.fn(async (p: string) =>
        files.has(p) ? { success: true, content: files.get(p), filePath: p } : { success: false, error: 'ENOENT' }),
      writeFile: vi.fn(async (p: string, content: string) => { files.set(p, content); return { success: true, filePath: p }; }),
      readDir: vi.fn(async (dir: string) => {
        if (!dirs.has(dir)) return { success: false, error: 'ENOENT' };
        const prefix = dir.endsWith('/') ? dir : dir + '/';
        const names = new Set<string>();
        const out: { name: string; path: string; isDirectory: boolean }[] = [];
        for (const p of [...files.keys(), ...dirs]) {
          if (!p.startsWith(prefix) || p === dir) continue;
          const rest = p.slice(prefix.length);
          const name = rest.split('/')[0];
          if (names.has(name)) continue;
          names.add(name);
          out.push({ name, path: prefix + name, isDirectory: dirs.has(prefix + name) });
        }
        return { success: true, files: out, path: dir };
      }),
      exists: vi.fn(async (p: string) => files.has(p) || dirs.has(p)),
      mkdir: vi.fn(async (p: string) => { dirs.add(p); return { success: true, path: p }; }),
      rename: vi.fn(async (a: string, b: string) => {
        if (files.has(a)) { files.set(b, files.get(a)!); files.delete(a); }
        if (dirs.has(a)) { dirs.delete(a); dirs.add(b); }
        return { success: true, oldPath: a, newPath: b };
      }),
      copy: vi.fn(async (a: string, b: string) => {
        if (files.has(b)) return { success: false, error: 'exists' };
        files.set(b, files.get(a) ?? '');
        return { success: true };
      }),
      delete: vi.fn(async (p: string) => { files.delete(p); dirs.delete(p); return { success: true, path: p }; }),
      saveImage: vi.fn(),
      saveRecording: vi.fn(async () => ({ success: true, path: 'assets/rec.webm' })),
      copyRecording: vi.fn(async (_dir: string, _src: string, name: string) => ({ success: true, path: `assets/${name}` })),
    },
    dialog: { open: vi.fn(async () => null), save: vi.fn(async () => null) },
    export: { pdf: vi.fn(), html: vi.fn(), image: vi.fn(), saveFile: vi.fn(), open: vi.fn(async () => true), reveal: vi.fn(async () => true) },
    clipboard: { writeHtml: vi.fn(async () => true) },
    image: { getState: vi.fn(async () => ({ supported: true, runtime: { installed: false, version: 'x', path: null }, files: [], installedBytes: 0, totalBytes: 0, ready: false, install: null, server: { status: 'stopped', pid: null, port: null, startedAt: null, error: null }, lastLog: '', models: [], modelId: 'z-image-turbo-q4k', lastRun: null })), setModel: vi.fn(), install: vi.fn(), cancelInstall: vi.fn(), delete: vi.fn(), start: vi.fn(), stop: vi.fn(), cancelGeneration: vi.fn(), onState: vi.fn(() => () => {}), onProgress: vi.fn(() => () => {}) },
    resources: { getState: vi.fn(async () => ({ totalBytes: 0, availableBytes: 0, exclusiveApplies: false, services: [], config: { idleMinutes: { chat: 15, embed: 10, asr: 0, image: 5 }, exclusiveImage: true } })), start: vi.fn(), stop: vi.fn(), setConfig: vi.fn(), onState: vi.fn(() => () => {}), onNotice: vi.fn(() => () => {}) },
    ai: { getConfig: vi.fn(async () => ({})), saveConfig: vi.fn(async () => ({ success: true })), chat: vi.fn(), stop: vi.fn(), generateImage: vi.fn(), listModels: vi.fn(), testConnection: vi.fn() },
    local: {
      getState: vi.fn(async () => null), installRuntime: vi.fn(), cancelInstall: vi.fn(), pickRuntime: vi.fn(), clearRuntimePath: vi.fn(),
      downloadModel: vi.fn(), cancelDownload: vi.fn(), deleteModel: vi.fn(), importModel: vi.fn(), start: vi.fn(), stop: vi.fn(), switchBack: vi.fn(),
      getLogs: vi.fn(async () => []), test: vi.fn(), openModelsFolder: vi.fn(), onState: vi.fn(() => () => {}), onLog: vi.fn(() => () => {}),
    },
    shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
    library: { watch: vi.fn(async () => true), findOrphanImages: vi.fn(async () => []), trashImages: vi.fn(async () => ({ trashed: 0, failed: [] })) },
    history: { list: vi.fn(async () => []), read: vi.fn(async () => null) },
    web: { fetchTitle: vi.fn(async () => null) },
    asr: {
      getState: vi.fn(async () => null), install: vi.fn(), cancelInstall: vi.fn(), uninstall: vi.fn(), installSpeaker: vi.fn(), cancelSpeakerInstall: vi.fn(), uninstallSpeaker: vi.fn(), requestMicAccess: vi.fn(), openMicSettings: vi.fn(), openScreenSettings: vi.fn(async () => true), onSystemPcm: vi.fn(() => () => {}), start: vi.fn(), stop: vi.fn(),
      sendPcm: vi.fn(), setUnsaved: vi.fn(), saveDraftAudio: vi.fn(async () => null), getDraftAudio: vi.fn(async () => null), clearDraft: vi.fn(async () => true), copyDraftAudio: vi.fn(async () => ({ success: true, path: 'assets/rec.webm' })), onState: vi.fn(() => () => {}), onEvent: vi.fn(() => () => {}),
    },
    semantic: {
      getState: vi.fn(async () => null), setEnabled: vi.fn(), setModel: vi.fn(), downloadModel: vi.fn(), cancelDownload: vi.fn(), deleteModel: vi.fn(),
      rebuild: vi.fn(), search: vi.fn(async () => []), related: vi.fn(async () => []), retrieve: vi.fn(async () => []), onState: vi.fn(() => () => {}),
    },
    search: { query: vi.fn(async () => []), status: vi.fn(async () => ({ root: null, count: 0, building: false })), listNotes: vi.fn(async () => []), backlinks: vi.fn(async () => []), unlinkedMentions: vi.fn(async () => []), tasks: vi.fn(async () => []), findAttachment: vi.fn(async () => null), openAttachment: vi.fn(async () => true), tags: vi.fn(async () => []), notesByTag: vi.fn(async () => []) },
    capture: { status: vi.fn(async () => ({ enabled: true, shortcut: 'Control+Alt+N', registered: true })), show: vi.fn(async () => true) },
    events: { on: vi.fn(), send: vi.fn() },
    app: {
      checkUpdates: vi.fn(async () => ({ success: false })),
      platform: 'darwin',
      minimize: vi.fn(), maximize: vi.fn(), close: vi.fn(),
      getSettings: vi.fn(async () => ({})),
      saveSettings: vi.fn(async () => ({ success: true })),
      openImageConfig: vi.fn(), openSettings: vi.fn(), previewSettings: vi.fn(), revertSettings: vi.fn(),
      consumePendingOpenFiles: vi.fn(async () => []),
      clearSession: vi.fn(),
      detectSyncFolders: vi.fn(async () => []),
      homeLibraryPath: vi.fn(async () => ({ path: '/home/Documents/iML Notes', exists: true })),
      consumePendingUrls: vi.fn(async () => []),
      getWhatsNewState: vi.fn(async () => ({ current: '26.1.0', lastSeen: '26.1.0' })),
      markWhatsNewSeen: vi.fn(async () => true),
    },
    appVersion: '26.1.0',
  };
  return api;
}

// 主进程模块的测试跑在 node 环境里，没有 window
if (typeof window !== 'undefined') (window as any).api = createMockApi();
