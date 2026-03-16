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

export interface NavigationRequest {
  heading: HeadingNode;
  timestamp: number;
}

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
  sidebarTab: 'catalog' | 'files' | 'ai';
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
  zoom: number;
  
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
  setSidebarTab: (tab: 'catalog' | 'files' | 'ai') => void;
  refreshWorkspace: () => Promise<void>;
  openFile: () => Promise<void>;
  openDirectory: () => Promise<void>;
  tabToClose: string | null;
  setTabToClose: (id: string | null) => void;
  saveActiveFile: (saveAs?: boolean) => Promise<boolean>;
  checkUpdates: () => Promise<void>;
  setUpdateStatus: (status: Partial<AppState['updateStatus']>) => void;
  setAIStatus: (status: Partial<AppState['aiStatus']>) => void;
  setZoom: (zoom: number) => void;
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
  sidebarTab: 'files',
  expandedPaths: [],
  navigationRequest: null,
  tabToClose: null,
  updateStatus: { show: false, loading: false, latestVersion: null, error: null },
  aiStatus: { generating: false, onStop: null },
  zoom: 100,
  
  setTabToClose: (id: string | null) => set({ tabToClose: id }),
  
  toggleMode: () => set((state) => ({ 
    mode: state.mode === 'word' ? 'markdown' : 'word' 
  })),
  
  setActiveTab: async (id: string | null) => {
    set({ activeTabId: id });
    
    if (id && !id.startsWith('new-') && !id.startsWith('ai-gen-')) {
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
  setSidebarTab: (tab: 'catalog' | 'files' | 'ai') => set({ sidebarTab: tab }),
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

  saveActiveFile: async (saveAs = false) => {
    const { activeTabId, tabs } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;

    let filePath = activeTab.id;
    const isTempFile = filePath.startsWith('new-') || filePath.startsWith('ai-gen-');

    if (isTempFile || saveAs) {
      const result = await window.api.dialog.save({
        defaultPath: isTempFile ? (activeTab.title === '未命名' ? 'untitled.md' : `${activeTab.title}.md`) : filePath,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      if (!result) return false;
      filePath = result;
    }

    const saveResult = await window.api.fs.writeFile(filePath, activeTab.content);
    if (saveResult.success) {
      if (isTempFile || saveAs) {
        await get().updateTabId(activeTab.id, filePath, filePath.split(/[/\\]/).pop() || 'Untitled');
        get().setActiveTab(filePath);
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
  
  setZoom: (zoom: number) => set({ zoom }),

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
  }
}));
