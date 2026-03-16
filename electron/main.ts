import { app, BrowserWindow, ipcMain, nativeImage, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupFileSystemIPC } from './ipc/fileSystem';

const isDev = process.env.NODE_ENV === 'development';

// Simple file-based store - defer initialization
let _userDataPath: string;
let _configPath: string;

function getPaths() {
  if (!_userDataPath) {
    _userDataPath = app.getPath('userData');
    _configPath = path.join(_userDataPath, 'ai-config.json');
  }
  return { userDataPath: _userDataPath, configPath: _configPath };
}

function getConfig() {
  const { configPath } = getPaths();
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read config:', err);
  }
  return {};
}

function saveConfig(config: any) {
  const { configPath } = getPaths();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save config:', err);
    return { success: false, error: '写入文件失败' };
  }
}

// Global state
let mainWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
let shortcutsWindow: BrowserWindow | null = null;
let modelConfigWindow: BrowserWindow | null = null;
const aiAbortControllers = new Map<string, AbortController>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'sidebar', 
    visualEffectState: 'active',
    backgroundColor: '#00000000', 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    // 尝试载入 5173，如果失败则尝试 5174 (Vite 默认备选端口)
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadURL('http://localhost:5174');
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (aboutWindow) aboutWindow.close();
    if (shortcutsWindow) shortcutsWindow.close();
    if (modelConfigWindow) modelConfigWindow.close();
  });
}

function getSubWindowPosition(width: number, height: number) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    return {
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + (bounds.height - height) / 2)
    };
  }
  return { x: undefined, y: undefined };
}

function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  const width = 420;
  const height = 540;
  const pos = getSubWindowPosition(width, height);

  aboutWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: false, minimizable: false, maximizable: false,
    title: '关于', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'window', visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    aboutWindow.loadURL('http://localhost:5173?window=about');
  } else {
    aboutWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'about' } });
  }

  aboutWindow.on('closed', () => { aboutWindow = null; });
}

function createShortcutsWindow() {
  if (shortcutsWindow) {
    shortcutsWindow.focus();
    return;
  }

  const width = 500;
  const height = 650;
  const pos = getSubWindowPosition(width, height);

  shortcutsWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '快捷键说明',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden', vibrancy: 'window',
    visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    shortcutsWindow.loadURL('http://localhost:5173?window=shortcuts');
  } else {
    shortcutsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'shortcuts' } });
  }

  shortcutsWindow.on('closed', () => { shortcutsWindow = null; });
}

function createModelConfigWindow() {
  if (modelConfigWindow) {
    modelConfigWindow.focus();
    return;
  }

  const width = 500;
  const height = 650;
  const pos = getSubWindowPosition(width, height);

  modelConfigWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '模型配置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden', vibrancy: 'window',
    visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    modelConfigWindow.loadURL('http://localhost:5173?window=ai-config');
  } else {
    modelConfigWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'ai-config' } });
  }

  modelConfigWindow.on('closed', () => { modelConfigWindow = null; });
}

app.whenReady().then(() => {
  // Set name within ready state
  if (isDev) {
    app.name = 'iML Markdown Editor';
  }
  app.setName('iML Markdown Editor');

  setupFileSystemIPC();
  
  // AI Config IPC
  ipcMain.handle('ai:getConfig', () => getConfig());
  ipcMain.handle('ai:saveConfig', (_event, config) => saveConfig(config));

  // Create standard macOS menu
  if (process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'iML Markdown Editor',
        submenu: [
          { label: '关于', click: () => createAboutWindow() },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏' },
          { role: 'hideOthers', label: '隐藏其他' },
          { role: 'unhide', label: '全部显示' },
          { type: 'separator' },
          { role: 'quit', label: '退出' }
        ]
      },
      {
        label: '文件',
        submenu: [{ role: 'close', label: '关闭窗口' }]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'forceReload', label: '强制重新加载' },
          { role: 'toggleDevTools', label: '开发者工具' },
          { type: 'separator' },
          { role: 'resetZoom', label: '重置缩放' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '切换全屏' }
        ]
      },
      {
        label: '智能',
        submenu: [
          {
            label: '模型配置',
            enabled: true,
            accelerator: 'Cmd+Shift+M',
            click: () => createModelConfigWindow()
          }
        ]
      },
      { role: 'windowMenu', label: '窗口' },
      {
        role: 'help',
        label: '帮助',
        submenu: [
          {
            label: '快捷键说明',
            accelerator: 'Cmd+/',
            click: () => createShortcutsWindow()
          },
          { type: 'separator' },
          { label: '关于', click: () => createAboutWindow() }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  if (process.platform === 'darwin' && app.dock) {
    const rootPath = isDev ? process.cwd() : app.getAppPath();
    const pngPath = path.join(rootPath, 'assets/logo.png');
    const icnsPath = path.join(rootPath, 'assets/logo.icns');
    let iconPath = fs.existsSync(pngPath) ? pngPath : icnsPath;
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  createWindow();
  
  // AI Stop request
  ipcMain.on('ai:stop', (_event, requestId: string) => {
    const controller = aiAbortControllers.get(requestId);
    if (controller) {
      controller.abort();
      aiAbortControllers.delete(requestId);
      console.log(`[AI] Request ${requestId} aborted by user`);
    }
  });

  ipcMain.on('ai:chat', async (event, { messages, requestId }) => {
    const config = getConfig();
    const apiKey = config.apiKey;
    const endpoint = config.endpoint;
    const model = config.model || 'gpt-4o';

    if (!apiKey || !endpoint) {
      event.sender.send(`ai:chat-error-${requestId}`, '请检查模型配置 (API Key 或 Endpoint 缺失)');
      return;
    }

    const controller = new AbortController();
    aiAbortControllers.set(requestId, controller);

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        event.sender.send(`ai:chat-error-${requestId}`, errorData.error?.message || `API 请求失败: ${response.status}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        event.sender.send(`ai:chat-error-${requestId}`, '无法获取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let lineBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          event.sender.send(`ai:chat-done-${requestId}`, fullContent);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        lineBuffer += chunk;
        
        const lines = lineBuffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        lineBuffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                event.sender.send(`ai:chat-chunk-${requestId}`, content);
              }
            } catch (e) {
              // Ignore partial JSON (should be handled by lineBuffer now, but defensive)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        event.sender.send(`ai:chat-error-${requestId}`, 'REQUEST_ABORTED');
      } else {
        event.sender.send(`ai:chat-error-${requestId}`, `网络错误: ${err.message}`);
      }
    } finally {
      aiAbortControllers.delete(requestId);
    }
  });

  ipcMain.on('open-about', () => createAboutWindow());
  ipcMain.on('open-shortcuts', () => createShortcutsWindow());
  ipcMain.on('open-ai-config', () => createModelConfigWindow());
  ipcMain.handle('open-url', async (_event, url: string) => { shell.openExternal(url); });
  
  // App Update Check IPC
  ipcMain.handle('app:checkUpdates', async () => {
    try {
      const response = await fetch('https://api.github.com/repos/imoling/iml-markdown-editor/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'iML-Markdown-Editor'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) return { success: false, error: '未发现任何发布版本' };
        throw new Error(`GitHub API returned ${response.status}`);
      }
      
      const data: any = await response.json();
      return {
        success: true,
        latestVersion: data.tag_name.replace(/^v/, ''),
        releaseUrl: data.html_url
      };
    } catch (err: any) {
      console.error('Update check failed:', err);
      return { success: false, error: '无法连接到更新服务器，请检查网络设置' };
    }
  });

  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
