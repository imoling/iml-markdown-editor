import { create } from 'zustand';
import { extractHeadings } from '../utils/markdown';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
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
  sidebarTab: 'catalog' | 'files';
  expandedPaths: string[];
  
  // Actions
  toggleMode: () => void;
  setActiveTab: (id: string | null) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setWorkspace: (path: string, name: string, files: FileNode[]) => void;
  updateFileNode: (path: string, updates: Partial<FileNode>) => void;
  updateTabId: (oldId: string, newId: string, newTitle: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  revealInSidebar: (path: string) => Promise<void>;
  
  // UI Actions
  toggleSidebar: () => void;
  toggleToolbar: () => void;
  toggleStatusBar: () => void;
  setOutline: (headings: HeadingNode[]) => void;
  addToRecent: (path: string) => void;
  createNewFile: () => void;
  toggleFind: () => void;
  toggleReplace: () => void;
  setSidebarTab: (tab: 'catalog' | 'files') => void;
  refreshWorkspace: () => Promise<void>;
  openFile: () => Promise<void>;
  openDirectory: () => Promise<void>;
  saveActiveFile: (saveAs?: boolean) => Promise<void>;
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
  sidebarTab: 'catalog',
  expandedPaths: [],
  
  toggleMode: () => set((state) => ({ 
    mode: state.mode === 'word' ? 'markdown' : 'word' 
  })),
  
  setActiveTab: (id) => {
    set({ activeTabId: id });
    if (id && (id.includes('/') || id.includes('\\'))) {
      get().revealInSidebar(id);
    }
  },
  
  openTab: (tab) => set((state) => {
    const exists = state.tabs.find((t) => t.id === tab.id);
    if (!exists) {
      return { 
        tabs: [...state.tabs, tab],
        activeTabId: tab.id
      };
    }
    return { activeTabId: tab.id };
  }),
  
  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    const newActiveId = state.activeTabId === id 
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      : state.activeTabId;
    
    if (newTabs.length === 0) {
      return { tabs: [], activeTabId: null, outline: [] };
    }

    return { 
      tabs: newTabs,
      activeTabId: newActiveId
    };
  }),

  updateTabId: (oldId, newId, newTitle) => set((state) => ({
    tabs: state.tabs.map(t => t.id === oldId ? { ...t, id: newId, title: newTitle, isDirty: false } : t),
    activeTabId: state.activeTabId === oldId ? newId : state.activeTabId
  })),

  setWorkspace: (path, name, files) => set({ 
    workspacePath: path, 
    workspaceName: name, 
    fileTree: files,
    expandedPaths: [path] 
  }),

  updateFileNode: (path, updates) => set((state) => {
    const updateRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === path) return { ...node, ...updates };
        if (node.children) return { ...node, children: updateRecursive(node.children) };
        return node;
      });
    };
    return { fileTree: updateRecursive(state.fileTree) };
  }),

  setExpanded: (path, expanded) => set((state) => ({
    expandedPaths: expanded 
      ? [...new Set([...state.expandedPaths, path])]
      : state.expandedPaths.filter(p => p !== path)
  })),

  revealInSidebar: async (path) => {
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

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleToolbar: () => set((state) => ({ toolbarVisible: !state.toolbarVisible })),
  toggleStatusBar: () => set((state) => ({ statusBarVisible: !state.statusBarVisible })),
  
  setOutline: (outline) => set({ outline }),
  
  addToRecent: (path) => set((state) => ({
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
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
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
    if (!activeTab) return;

    let filePath = activeTab.id;
    const isNewFile = filePath.startsWith('new-');

    if (isNewFile || saveAs) {
      const result = await window.api.dialog.save({
        defaultPath: isNewFile ? 'untitled.md' : filePath,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      if (!result) return;
      filePath = result;
    }

    const saveResult = await window.api.fs.writeFile(filePath, activeTab.content);
    if (saveResult.success) {
      if (isNewFile || saveAs) {
        get().updateTabId(activeTab.id, filePath, filePath.split(/[/\\]/).pop() || 'Untitled');
        
        const { workspacePath } = get();
        if (workspacePath) {
          get().refreshWorkspace();
        } else {
          const dirPath = filePath.substring(0, filePath.lastIndexOf(filePath.includes('/') ? '/' : '\\'));
          const readResult = await window.api.fs.readDir(dirPath);
          if (readResult.success && readResult.files) {
            get().setWorkspace(dirPath, dirPath.split(/[/\\]/).pop() || 'Workspace', readResult.files);
          }
        }
      } else {
        set((state) => ({
          tabs: state.tabs.map(t => t.id === filePath ? { ...t, isDirty: false } : t)
        }));
      }
    }
  }
}));
