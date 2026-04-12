import { create } from 'zustand';
import { extractHeadings } from '../utils/outline';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface Tab {
  id: string; // filePath
  title: string;
  content: string;
  isDirty: boolean;
  mode: 'word' | 'markdown';
}

export interface HeadingNode {
  level: number;
  text: string;
  id: string;
}

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  gradient: string;
  shadow: string;
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    id: 'indigo',
    name: '经典靛紫',
    primary: '#6366F1',
    secondary: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    shadow: 'rgba(99, 102, 241, 0.2)',
  },
  {
    id: 'ocean',
    name: '深海极客',
    primary: '#0EA5E9',
    secondary: '#6366F1',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    shadow: 'rgba(14, 165, 233, 0.2)',
  },
  {
    id: 'mint',
    name: '清新薄荷',
    primary: '#10B981',
    secondary: '#3B82F6',
    gradient: 'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',
    shadow: 'rgba(16, 185, 129, 0.2)',
  },
  {
    id: 'rose',
    name: '落日玫瑰',
    primary: '#F43F5E',
    secondary: '#FB923C',
    gradient: 'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',
    shadow: 'rgba(244, 63, 94, 0.2)',
  },
  {
    id: 'obsidian',
    name: '曜石黑金',
    primary: '#334155',
    secondary: '#94A3B8',
    gradient: 'linear-gradient(135deg, #334155 0%, #94A3B8 100%)',
    shadow: 'rgba(51, 65, 85, 0.2)',
  }
];

export interface NavigationRequest {
  heading: HeadingNode;
  timestamp: number;
}

// ── SKILL 写作运行时状态 ──
export type SkillStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface CoverImage {
  url: string;
  localPath: string;
}

export interface SkillStepRun {
  stepId: string;
  status: SkillStepStatus;
  output: string;
  outlineItems?: string[];
  selectedItemIndex?: number;
  coverImages?: CoverImage[];
  selectedCoverIndex?: number;
  sectionOutputs?: Record<string, string>;
  /** polish 步骤选中的功能项 ID 列表 */
  polishOptions?: string[];
  /** publish 步骤：选中的主题和颜色 */
  publishTheme?: string;
  publishColor?: string;
  /** publish 步骤：发布状态 */
  publishStatus?: 'idle' | 'publishing' | 'success' | 'error';
  publishError?: string;
  /** illustrations 步骤：每张图的已生成图片 */
  illustrationImages?: Record<string, { url: string; localPath: string }>;
  /** illustrations 步骤：每张图的生成中状态 */
  illustrationLoading?: Record<string, boolean>;
  error?: string;
  updatedAt: number;
}

export interface SkillRun {
  id: string;
  skillId: string;
  vibe: string;
  webContext?: string;
  steps: SkillStepRun[];
  currentStepIndex: number;
  tabId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageGenConfig {
  source: 'crawl' | 'generate';
  provider: 'gemini' | 'gemini-imagen' | 'gemini-flash' | 'volcengine' | 'minimax' | 'custom';
  apiKey: string;
  model: string;
  endpoint: string;
}

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  source: 'crawl',
  provider: 'gemini-imagen',
  apiKey: '',
  model: '',
  endpoint: '',
};

export interface AppState {
  mode: 'word' | 'markdown';
  activeTabId: string | null;
  tabs: Tab[];
  workspacePath: string | null;
  workspaceName: string | null;
  fileTree: FileNode[];
  sidebarVisible: boolean;
  toolbarVisible: boolean;
  statusBarVisible: boolean;
  recentFiles: string[];
  outline: HeadingNode[];
  findVisible: boolean;
  replaceVisible: boolean;
  sidebarTab: 'catalog' | 'files' | 'notes';
  sidebarWidth: number;
  aiPanelVisible: boolean;
  aiPanelWidth: number;
  expandedPaths: string[];
  navigationRequest: NavigationRequest | null;
  updateStatus: {
    show: boolean;
    loading: boolean;
    latestVersion: string | null;
    error: string | null;
  };
  aiStatus: {
    generating: boolean;
    onStop: (() => void) | null;
  };
  skillRuns: Record<string, SkillRun>;
  activeSkillRunId: string | null;
  zoom: number;
  theme: ThemeConfig;
  isSettingsModalOpen: boolean;
  isWechatConfigOpen: boolean;
  isImageConfigOpen: boolean;
  appearanceMode: 'light' | 'dark' | 'system' | 'eye-protection';
  startupBehavior: 'restore' | 'dashboard';
  autoSave: boolean;
  defaultLibraryPath: string;
  starredFiles: string[];
  imageGenConfig: ImageGenConfig;

  // File Management State
  selectedNodePath: string | null;
  renamingPath: string | null;
  contextMenu: { visible: boolean; x: number; y: number; node: FileNode | null };

  // Actions
  toggleMode: () => void;
  setActiveTab: (id: string | null) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  setWorkspace: (path: string, name: string, files: FileNode[]) => void;
  updateFileNode: (path: string, updates: Partial<FileNode>) => void;
  updateTabId: (oldId: string, newId: string, newTitle: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  revealInSidebar: (path: string) => Promise<void>;
  scrollToHeading: (heading: HeadingNode) => void;
  
  // UI Actions
  toggleSidebar: () => void;
  toggleToolbar: () => void;
  toggleStatusBar: () => void;
  setOutline: (headings: HeadingNode[]) => void;
  addToRecent: (path: string) => void;
  createNewFile: () => void;
  toggleFind: () => void;
  toggleReplace: () => void;
  setSidebarTab: (tab: 'catalog' | 'files' | 'notes') => void;
  setSidebarWidth: (width: number) => void;
  toggleAIPanel: () => void;
  setAIPanelWidth: (width: number) => void;
  refreshWorkspace: () => Promise<void>;
  openFileByPath: (filePath: string) => Promise<void>;
  openFile: () => Promise<void>;
  openDirectory: () => Promise<void>;
  tabToClose: string | null;
  setTabToClose: (id: string | null) => void;
  saveActiveFile: (saveAs?: boolean, isAutoSave?: boolean) => Promise<boolean>;
  checkUpdates: () => Promise<void>;
  autoCheckUpdates: () => Promise<void>;
  setUpdateStatus: (status: Partial<AppState['updateStatus']>) => void;
  setAIStatus: (status: Partial<AppState['aiStatus']>) => void;
  upsertSkillRun: (run: SkillRun) => void;
  updateSkillStepRun: (runId: string, stepId: string, patch: Partial<SkillStepRun>) => void;
  setActiveSkillRun: (id: string | null) => void;
  deleteSkillRun: (id: string) => void;
  setZoom: (zoom: number) => void;
  setTheme: (themeId: string) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setWechatConfigOpen: (open: boolean) => void;
  setImageConfigOpen: (open: boolean) => void;
  setAppearanceMode: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => void;
  setStartupBehavior: (behavior: 'restore' | 'dashboard') => void;
  setAutoSave: (autoSave: boolean) => void;
  setDefaultLibraryPath: (path: string) => void;
  loadSession: () => Promise<boolean>;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  applyAppearance: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => void;
  toggleStar: (path: string) => void;
  setImageGenConfig: (config: Partial<ImageGenConfig>) => void;

  // File Management Actions
  setSelectedNodePath: (path: string | null) => void;
  setRenamingPath: (path: string | null) => void;
  setContextMenu: (contextMenu: Partial<AppState['contextMenu']>) => void;
  renameFile: (oldPath: string, newName: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<boolean>;
  duplicateFile: (path: string) => Promise<boolean>;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'word',
  activeTabId: null,
  tabs: [],
  workspacePath: null,
  workspaceName: null,
  fileTree: [],
  sidebarVisible: true,
  toolbarVisible: true,
  statusBarVisible: true,
  recentFiles: [],
  outline: [],
  findVisible: false,
  replaceVisible: false,
  sidebarTab: 'notes',
  sidebarWidth: 240,
  aiPanelVisible: false,
  aiPanelWidth: 400,
  expandedPaths: [],
  navigationRequest: null,
  tabToClose: null,
  
  // File Management Default State
  selectedNodePath: null,
  renamingPath: null,
  contextMenu: { visible: false, x: 0, y: 0, node: null },
  
  updateStatus: { show: false, loading: false, latestVersion: null, error: null },
  aiStatus: { generating: false, onStop: null },
  skillRuns: {},
  activeSkillRunId: null,
  zoom: 100,
  theme: THEME_PRESETS[0],
  isSettingsModalOpen: false,
  isWechatConfigOpen: false,
  isImageConfigOpen: false,
  appearanceMode: 'light',
  startupBehavior: 'restore',
  autoSave: true,
  defaultLibraryPath: '',
  starredFiles: [],
  imageGenConfig: DEFAULT_IMAGE_GEN_CONFIG,

  toggleStar: (path: string) => set((state) => ({
    starredFiles: state.starredFiles.includes(path)
      ? state.starredFiles.filter(p => p !== path)
      : [...state.starredFiles, path]
  })),

  setImageGenConfig: (config: Partial<ImageGenConfig>) => {
    set((state) => ({ imageGenConfig: { ...state.imageGenConfig, ...config } }));
    get().saveSettings();
  },

  setTabToClose: (id: string | null) => set({ tabToClose: id }),
  
  toggleMode: () => set((state) => ({ 
    mode: state.mode === 'word' ? 'markdown' : 'word' 
  })),
  
  setActiveTab: async (id: string | null) => {
    set({ activeTabId: id });
    
    if (id && !id.startsWith('new-') && !id.startsWith('ai-gen-')) {
      get().addToRecent(id);
      const sep = id.includes('/') ? '/' : '\\';
      const lastSepIndex = id.lastIndexOf(sep);
      if (lastSepIndex !== -1) {
        const dirPath = id.substring(0, lastSepIndex);
        const dirName = dirPath.split(sep).pop() || 'Workspace';
        
        if (get().workspacePath !== dirPath) {
          try {
            const result = await window.api.fs.readDir(dirPath);
            if (result.success && result.files) {
              set({ 
                workspacePath: dirPath, 
                workspaceName: dirName, 
                fileTree: result.files,
                expandedPaths: [...new Set([...get().expandedPaths, dirPath])]
              });
            }
          } catch (error) {
            console.error('Failed to auto-switch workspace:', error);
          }
        }
      }
    } else if (id && (id.startsWith('new-') || id.startsWith('ai-gen-'))) {
      set({ workspacePath: null, workspaceName: null, fileTree: [] });
    }

    if (id && (id.includes('/') || id.includes('\\'))) {
      get().revealInSidebar(id);
    }
  },
  
  openTab: (tab: Tab) => {
    const state = get();
    const exists = state.tabs.find((t) => t.id === tab.id);
    if (!exists) {
      set({ tabs: [...state.tabs, tab] });
    }
    get().setActiveTab(tab.id);
  },
  
  closeTab: (id: string) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    const newActiveId = state.activeTabId === id 
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      : state.activeTabId;
    
    if (newTabs.length === 0) {
      return { tabs: [], activeTabId: null, outline: [], workspacePath: null, workspaceName: null, fileTree: [] };
    }

    return { 
      tabs: newTabs,
      activeTabId: newActiveId
    };
  }),

  updateTabContent: (id: string, content: string) => set((state) => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, content, isDirty: true } : t)
  })),

  updateTabId: (oldId: string, newId: string, newTitle: string) => set((state) => {
    const newTabs = state.tabs.map(t => t.id === oldId ? { ...t, id: newId, title: newTitle, isDirty: false } : t);
    const newState = {
      tabs: newTabs,
      activeTabId: state.activeTabId === oldId ? newId : state.activeTabId
    };
    return newState;
  }),

  setWorkspace: (path: string, name: string, files: FileNode[]) => set({ 
    workspacePath: path, 
    workspaceName: name, 
    fileTree: files,
    expandedPaths: [path] 
  }),

  updateFileNode: (path: string, updates: Partial<FileNode>) => set((state) => {
    const updateRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === path) return { ...node, ...updates };
        if (node.children) return { ...node, children: updateRecursive(node.children) };
        return node;
      });
    };
    return { fileTree: updateRecursive(state.fileTree) };
  }),

  setExpanded: (path: string, expanded: boolean) => set((state) => ({
    expandedPaths: expanded 
      ? [...new Set([...state.expandedPaths, path])]
      : state.expandedPaths.filter(p => p !== path)
  })),

  revealInSidebar: async (path: string) => {
    const parts = path.split(/[/\\]/);
    let currentPath = '';
    const newExpanded = [...get().expandedPaths];
    
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (i === 0 ? '' : path.includes('/') ? '/' : '\\') + parts[i];
        if (!newExpanded.includes(currentPath)) {
            newExpanded.push(currentPath);
        }
    }
    
    set({ expandedPaths: [...new Set(newExpanded)] });
  },

  scrollToHeading: (heading: HeadingNode) => set({ 
    navigationRequest: { heading, timestamp: Date.now() } 
  }),

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleToolbar: () => set((state) => ({ toolbarVisible: !state.toolbarVisible })),
  toggleStatusBar: () => set((state) => ({ statusBarVisible: !state.statusBarVisible })),
  
  setOutline: (outline: HeadingNode[]) => set({ outline }),
  
  addToRecent: (path: string) => set((state) => ({
    recentFiles: [path, ...state.recentFiles.filter(p => p !== path)].slice(0, 10)
  })),

  createNewFile: () => {
    const id = `new-${Date.now()}.md`;
    get().openTab({
      id,
      title: '未命名',
      content: '',
      isDirty: false,
      mode: 'word'
    });
  },

  toggleFind: () => set((state) => ({ findVisible: !state.findVisible, replaceVisible: false })),
  toggleReplace: () => set((state) => ({ replaceVisible: !state.replaceVisible, findVisible: false })),
  setSidebarTab: (tab: 'catalog' | 'files' | 'notes') => {
    const { sidebarTab, sidebarVisible } = get();
    if (sidebarVisible && sidebarTab === tab) {
      set({ sidebarVisible: false });
    } else {
      set({ sidebarTab: tab, sidebarVisible: true });
    }
  },
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(600, Math.max(240, width)) }),
  toggleAIPanel: () => set((s) => ({ aiPanelVisible: !s.aiPanelVisible })),
  setAIPanelWidth: (width) => set({ aiPanelWidth: Math.min(600, Math.max(240, width)) }),
  refreshWorkspace: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;

    try {
      const result = await window.api.fs.readDir(workspacePath);
      if (result.success && result.files) {
        set({ fileTree: result.files });
      }
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    }
  },

  openFileByPath: async (filePath: string) => {
    const existing = get().tabs.find(t => t.id === filePath);
    if (existing) { get().setActiveTab(filePath); return; }
    const readResult = await window.api.fs.readFile(filePath);
    if (readResult.success) {
      get().openTab({
        id: filePath,
        title: filePath.split(/[/\\]/).pop() || 'Untitled',
        content: readResult.content || '',
        isDirty: false,
        mode: 'word',
      });
      get().addToRecent(filePath);
    }
  },

  openFile: async () => {
    const result = await window.api.dialog.open({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    });

    if (result && result.length > 0) {
      const filePath = result[0];
      const readResult = await window.api.fs.readFile(filePath);
      if (readResult.success) {
        get().openTab({
          id: filePath,
          title: filePath.split(/[/\\]/).pop() || 'Untitled',
          content: readResult.content || '',
          isDirty: false,
          mode: 'word'
        });
        get().addToRecent(filePath);
      }
    }
  },

  openDirectory: async () => {
    const result = await window.api.dialog.open({
      properties: ['openDirectory']
    });

    if (result && result.length > 0) {
      const dirPath = result[0];
      const readResult = await window.api.fs.readDir(dirPath);
      if (readResult.success && readResult.files) {
        get().setWorkspace(dirPath, dirPath.split(/[/\\]/).pop() || 'Workspace', readResult.files);
      }
    }
  },

  saveActiveFile: async (saveAs = false, isAutoSave = false) => {
    const { activeTabId, tabs } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;

    let filePath = activeTab.id;
    const isTempFile = filePath.startsWith('new-') || filePath.startsWith('ai-gen-');

    if (isTempFile || saveAs) {
      if (isTempFile && isAutoSave) {
        // 完全无感静默创建新文件
        const date = new Date();
        const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
        
        let titleStr = timeStr;
        const firstLine = activeTab.content.split('\n').find(l => l.trim().length > 0);
        if (firstLine) {
          const cleanTitle = firstLine.replace(/^#+\s*/, '').replace(/[\\/:*?"<>|]/g, '').trim().substring(0, 30);
          if (cleanTitle) titleStr = cleanTitle;
        }
        
        const targetDir = get().workspacePath || get().defaultLibraryPath;
        filePath = `${targetDir}${targetDir.includes('\\\\') ? '\\\\' : '/'}${titleStr}.md`;

        // 简易去重防碰撞（若同名加上时间戳）
        try {
          const exists = await window.api.fs.readFile(filePath);
          if (exists.success) {
            filePath = `${targetDir}${targetDir.includes('\\\\') ? '\\\\' : '/'}${titleStr} ${timeStr}.md`;
          }
        } catch(e) {}
      } else {
        const result = await window.api.dialog.save({
          defaultPath: isTempFile ? (activeTab.title === '未命名' ? 'untitled.md' : `${activeTab.title}.md`) : filePath,
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (!result) return false;
        filePath = result;
      }
    }

    const saveResult = await window.api.fs.writeFile(filePath, activeTab.content);
    if (saveResult.success) {
      if (isTempFile || saveAs) {
        await get().updateTabId(activeTab.id, filePath, filePath.split(/[\\\\/]/).pop() || 'Untitled');
        get().setActiveTab(filePath);
        if (get().workspacePath && filePath.startsWith(get().workspacePath!)) {
          get().refreshWorkspace();
        }
      } else {
        set((state) => ({
          tabs: state.tabs.map(t => t.id === filePath ? { ...t, isDirty: false } : t)
        }));
      }
      return true;
    }
    return false;
  },

  setUpdateStatus: (status: Partial<AppState['updateStatus']>) => set((state) => ({
    updateStatus: { ...state.updateStatus, ...status }
  })),

  setAIStatus: (status: Partial<AppState['aiStatus']>) => set((state) => ({
    aiStatus: { ...state.aiStatus, ...status }
  })),

  upsertSkillRun: (run: SkillRun) => set((state) => ({
    skillRuns: { ...state.skillRuns, [run.id]: { ...run, updatedAt: Date.now() } }
  })),

  updateSkillStepRun: (runId, stepId, patch) => set((state) => {
    const run = state.skillRuns[runId];
    if (!run) return {};
    const exists = run.steps.some(s => s.stepId === stepId);
    const now = Date.now();
    const steps = exists
      ? run.steps.map(s => s.stepId === stepId ? { ...s, ...patch, updatedAt: now } : s)
      // 步骤不存在时（旧 run 遇到新增步骤）：追加
      : [...run.steps, { stepId, status: 'pending' as const, output: '', updatedAt: now, ...patch }];
    return {
      skillRuns: {
        ...state.skillRuns,
        [runId]: { ...run, steps, updatedAt: now }
      }
    };
  }),

  setActiveSkillRun: (id) => set({ activeSkillRunId: id }),

  deleteSkillRun: (id) => set((state) => {
    const next = { ...state.skillRuns };
    delete next[id];
    return {
      skillRuns: next,
      activeSkillRunId: state.activeSkillRunId === id ? null : state.activeSkillRunId
    };
  }),
  
  setZoom: (zoom: number) => set({ zoom }),
  
  setTheme: (themeId: string) => {
    const theme = THEME_PRESETS.find(t => t.id === themeId) || THEME_PRESETS[0];
    set({ theme });
    
    // 动态应用 CSS 变量到 Root
    const root = document.documentElement;
    root.style.setProperty('--color-brand-indigo', theme.primary);
    root.style.setProperty('--color-brand-purple', theme.secondary);
    root.style.setProperty('--brand-gradient', theme.gradient);
    root.style.setProperty('--brand-shadow', theme.shadow);
    root.style.setProperty('--brand-glow', theme.shadow.replace('0.2', '0.4'));
    root.style.setProperty('--color-accent-indigo', theme.primary);
    root.style.setProperty('--color-accent-blue', theme.secondary);
  },

  setSettingsModalOpen: (open: boolean) => set({ isSettingsModalOpen: open }),
  setWechatConfigOpen: (open: boolean) => set({ isWechatConfigOpen: open }),
  setImageConfigOpen: (open: boolean) => set({ isImageConfigOpen: open }),
  
  setAppearanceMode: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => {
    set({ appearanceMode: mode });
    get().applyAppearance(mode);
    get().saveSettings();
  },

  setStartupBehavior: (behavior: 'restore' | 'dashboard') => {
    set({ startupBehavior: behavior });
    get().saveSettings();
  },

  setAutoSave: (autoSave: boolean) => {
    set({ autoSave });
    get().saveSettings();
  },

  setDefaultLibraryPath: (path: string) => {
    set({ defaultLibraryPath: path });
    get().saveSettings();
  },

  applyAppearance: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => {
    if (mode === 'eye-protection') {
      document.documentElement.setAttribute('data-theme', 'eye-protection');
      return;
    }
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  },

  loadSession: async () => {
    try {
      const sessionStr = localStorage.getItem('iml_session');
      let restoredWorkspace = false;
      
      if (sessionStr) {
        const session = JSON.parse(sessionStr);

        // 恢复 Workspace
        if (session.workspacePath) {
          const readResult = await window.api.fs.readDir(session.workspacePath);
          if (readResult.success && readResult.files) {
            set({ 
              workspacePath: session.workspacePath, 
              workspaceName: session.workspacePath.split(/[/\\]/).pop() || 'Workspace', 
              fileTree: readResult.files,
              expandedPaths: session.expandedPaths || [session.workspacePath]
            });
            restoredWorkspace = true;
          }
        }

        // 恢复 Starred Files
        if (session.starredFiles) {
          set({ starredFiles: session.starredFiles });
        }

        // 恢复 Recent Files
        if (session.recentFiles) {
          set({ recentFiles: session.recentFiles });
        }

        // 恢复 SKILL 写作进度
        if (session.skillRuns) {
          // 将所有 running 状态视为中断 → 重置为 pending，避免恢复后看起来卡住
          const cleaned: Record<string, SkillRun> = {};
          for (const [k, run] of Object.entries(session.skillRuns as Record<string, SkillRun>)) {
            cleaned[k] = {
              ...run,
              steps: run.steps.map(s =>
                s.status === 'running' ? { ...s, status: 'pending' as SkillStepStatus } : s
              )
            };
          }
          set({ skillRuns: cleaned });
        }
        if (session.activeSkillRunId) {
          set({ activeSkillRunId: session.activeSkillRunId });
        }

        // 恢复 Tabs
        const tabsToRestore = session.tabs || [];
        if (tabsToRestore.length > 0) {
          const initialTabs = tabsToRestore.map((t: any) => ({ ...t, content: '' }));
          set({ tabs: initialTabs, activeTabId: session.activeTabId });

          for (const tab of tabsToRestore) {
            if (!tab.id.startsWith('new-') && !tab.id.startsWith('ai-gen-')) {
              try {
                 const result = await window.api.fs.readFile(tab.id);
                 if (result.success && result.content !== undefined) {
                    const loadedContent = result.content || '';
                    set(state => ({
                      tabs: state.tabs.map(t => 
                        t.id === tab.id 
                          ? { ...t, content: loadedContent, isDirty: tab.isDirty } 
                          : t
                      )
                    }));
                 } else {
                    set(state => ({ tabs: state.tabs.filter(t => t.id !== tab.id) }));
                 }
              } catch (e) {
                 set(state => ({ tabs: state.tabs.filter(t => t.id !== tab.id) }));
              }
            }
          }
          
          const currentTabs = get().tabs;
          if (currentTabs.length > 0 && !currentTabs.find(t => t.id === get().activeTabId)) {
             set({ activeTabId: currentTabs[currentTabs.length - 1].id });
          } else if (currentTabs.length === 0) {
             set({ activeTabId: null });
          }
        }
      }
      return restoredWorkspace;
    } catch (e) {
      console.error('Failed to load session:', e);
      return false;
    }
  },

  loadSettings: async () => {
    try {
      const settings = await window.api.app.getSettings();
      if (settings) {
        set({
          appearanceMode: settings.appearanceMode || 'light',
          startupBehavior: settings.startupBehavior || 'restore',
          autoSave: settings.autoSave ?? true,
          defaultLibraryPath: settings.defaultLibraryPath || '',
          imageGenConfig: settings.imageGenConfig || DEFAULT_IMAGE_GEN_CONFIG,
        });
        if (settings.themeId) get().setTheme(settings.themeId);
        get().applyAppearance(settings.appearanceMode || 'light');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async () => {
    const { appearanceMode, startupBehavior, autoSave, defaultLibraryPath, imageGenConfig, theme } = get();
    await window.api.app.saveSettings({
      appearanceMode, startupBehavior, autoSave, defaultLibraryPath, imageGenConfig,
      themeId: theme?.id,
    });
  },

  setSelectedNodePath: (path) => set({ selectedNodePath: path }),
  setRenamingPath: (path) => set({ renamingPath: path }),
  setContextMenu: (cm) => set((state) => ({ contextMenu: { ...state.contextMenu, ...cm } })),

  renameFile: async (oldPath: string, newName: string) => {
    try {
      const sep = oldPath.includes('\\') ? '\\' : '/';
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf(sep));
      const newPath = `${parentDir}${sep}${newName}`;
      
      const result = await window.api.fs.rename(oldPath, newPath);
      if (result.success) {
        set((state) => {
          const newTabs = state.tabs.map(t => t.id === oldPath ? { ...t, id: newPath, title: newName.replace(/\.md$/i, '') } : t);
          return {
            tabs: newTabs,
            activeTabId: state.activeTabId === oldPath ? newPath : state.activeTabId,
            renamingPath: null,
            selectedNodePath: state.selectedNodePath === oldPath ? newPath : state.selectedNodePath,
            starredFiles: state.starredFiles.map(p => p === oldPath ? newPath : p)
          };
        });
        await get().refreshWorkspace();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Rename failed:', e);
      return false;
    }
  },

  deleteFile: async (path: string) => {
    try {
      const result = await window.api.fs.delete(path);
      if (result.success) {
        get().closeTab(path);
        set((state) => ({
          selectedNodePath: state.selectedNodePath === path ? null : state.selectedNodePath,
          starredFiles: state.starredFiles.filter(p => p !== path)
        }));
        await get().refreshWorkspace();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Delete failed:', e);
      return false;
    }
  },

  duplicateFile: async (oldPath: string) => {
    try {
      const extMatch = oldPath.match(/\.([^.]+)$/);
      const ext = extMatch ? `.${extMatch[1]}` : '';
      const basePath = extMatch ? oldPath.substring(0, oldPath.length - ext.length) : oldPath;
      
      let newPath = `${basePath} 副本${ext}`;
      let counter = 1;
      // Loop is handled by UI ideally, but backend can also handle duplicates.
      // For now just try append " 副本"
      
      const result = await window.api.fs.copy(oldPath, newPath);
      if (!result.success) {
        // Retry with number
        newPath = `${basePath} 副本 2${ext}`;
        await window.api.fs.copy(oldPath, newPath);
      }
      await get().refreshWorkspace();
      return true;
    } catch (e) {
      console.error('Duplicate failed:', e);
      return false;
    }
  },

  checkUpdates: async () => {
    set({ updateStatus: { show: true, loading: true, latestVersion: null, error: null } });
    
    try {
      const result = await window.api.app.checkUpdates();
      if (!result.success) {
        throw new Error(result.error);
      }
      
      set({
        updateStatus: {
          show: true,
          loading: false,
          latestVersion: result.latestVersion || null,
          error: null
        }
      });
    } catch (err: any) {
      set({
        updateStatus: {
          show: true,
          loading: false,
          latestVersion: null,
          error: err.message || '检查更新失败'
        }
      });
    }
  },

  autoCheckUpdates: async () => {
    // Only set loading if we want to show it, but for autoCheck we do it silently
    try {
      const result = await window.api.app.checkUpdates();
      if (result.success && result.latestVersion) {
        const currentVersion = window.api.appVersion || '1.6.0';
        if (result.latestVersion !== currentVersion) {
          set({
            updateStatus: {
              show: true,
              loading: false,
              latestVersion: result.latestVersion,
              error: null
            }
          });
        }
      }
    } catch (err) {
      console.error('Auto update check failed:', err);
    }
  }
}));

useAppStore.subscribe((state, prevState) => {
  const shouldSave =
    state.tabs !== prevState.tabs ||
    state.activeTabId !== prevState.activeTabId ||
    state.workspacePath !== prevState.workspacePath ||
    state.expandedPaths !== prevState.expandedPaths ||
    state.starredFiles !== prevState.starredFiles ||
    state.recentFiles !== prevState.recentFiles ||
    state.skillRuns !== prevState.skillRuns ||
    state.activeSkillRunId !== prevState.activeSkillRunId;

  if (shouldSave) {
    const sessionToSave = {
      workspacePath: state.workspacePath,
      expandedPaths: state.expandedPaths,
      activeTabId: state.activeTabId,
      starredFiles: state.starredFiles,
      recentFiles: state.recentFiles,
      tabs: state.tabs.map(t => ({
        id: t.id,
        title: t.title,
        isDirty: t.isDirty,
        mode: t.mode
      })),
      skillRuns: state.skillRuns,
      activeSkillRunId: state.activeSkillRunId
    };
    localStorage.setItem('iml_session', JSON.stringify(sessionToSave));
  }
});
