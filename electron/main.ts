import { app, BrowserWindow, ipcMain, nativeImage, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupFileSystemIPC } from './ipc/fileSystem';

const isDev = process.env.NODE_ENV === 'development';

// Set name early
if (isDev) {
  app.name = 'iML Markdown Editor';
}
app.setName('iML Markdown Editor');

let mainWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
let shortcutsWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar', // macOS vibrancy
    visualEffectState: 'active',
    backgroundColor: '#00000000', // transparent for vibrancy
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Use PNG for window icon (more compatible during development)
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (aboutWindow) aboutWindow.close();
    if (shortcutsWindow) shortcutsWindow.close();
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
    width,
    height,
    x: pos.x,
    y: pos.y,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '关于',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    aboutWindow.loadURL('http://localhost:5173?window=about');
  } else {
    aboutWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'about' } });
  }

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
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
    width,
    height,
    x: pos.x,
    y: pos.y,
    resizable: true,
    title: '快捷键说明',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(process.cwd(), 'assets/logo.png'),
  });

  if (isDev) {
    shortcutsWindow.loadURL('http://localhost:5173?window=shortcuts');
  } else {
    shortcutsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'shortcuts' } });
  }

  shortcutsWindow.on('closed', () => {
    shortcutsWindow = null;
  });
}

app.whenReady().then(() => {
  setupFileSystemIPC();
  
  // Create standard macOS menu
  if (process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'iML Markdown Editor',
        submenu: [
          { 
            label: '关于',
            click: () => createAboutWindow()
          },
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
        submenu: [
          { role: 'close', label: '关闭窗口' }
        ]
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
            enabled: false,
            accelerator: 'Cmd+Shift+M',
            click: () => {
              // Future: show model config
            }
          }
        ]
      },
      {
        role: 'windowMenu',
        label: '窗口'
      },
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
          {
            label: '关于',
            click: () => createAboutWindow()
          }
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
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  }

  createWindow();

  ipcMain.on('open-about', () => {
    createAboutWindow();
  });

  ipcMain.on('open-shortcuts', () => {
    createShortcutsWindow();
  });

  ipcMain.handle('open-url', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
