import { app, BrowserWindow, ipcMain, nativeImage, Menu, shell, net } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { execFile, exec } from 'child_process';
import { setupFileSystemIPC } from './ipc/fileSystem';

const isDev = process.env.NODE_ENV === 'development';

// macOS 菜单栏 App 名称来自 app.getName()，必须在 ready 前设置
app.name = 'iML Markdown Editor';
app.setName('iML Markdown Editor');

// ── Node.js 原生 HTTP helpers（不经过 Chromium WebIDL，不校验 ByteString）──────
function nodePost(
  url: string,
  body: string | Buffer,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': bodyBuf.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function nodeGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return nodeGetBuffer(res.headers.location).then(resolve, reject);
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

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

// ── WeChat 多账号配置 ────────────────────────────────────────────────────────
function getWechatConfigPath() {
  return path.join(getPaths().userDataPath, 'wechat-config.json');
}

function getWechatConfig() {
  const p = getWechatConfigPath();
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return { accounts: [] };
}

function saveWechatConfig(config: any) {
  try {
    fs.writeFileSync(getWechatConfigPath(), JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function getAppSettings() {
  const { userDataPath } = getPaths();
  const settingsPath = path.join(userDataPath, 'app-settings.json');
  let settings: any = {
    appearanceMode: 'light',
    startupBehavior: 'restore',
    autoSave: true
  };
  
  try {
    if (fs.existsSync(settingsPath)) {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
    }
  } catch (err) {
    console.error('Failed to read settings:', err);
  }

  if (!settings.defaultLibraryPath) {
    try {
      const defaultLib = path.join(app.getPath('documents'), 'iML Notes');
      if (!fs.existsSync(defaultLib)) {
        fs.mkdirSync(defaultLib, { recursive: true });
      }
      settings.defaultLibraryPath = defaultLib;
    } catch (e) {
      console.error('Failed to init default library path:', e);
    }
  }

  return settings;
}

function saveAppSettings(settings: any) {
  const { userDataPath } = getPaths();
  const settingsPath = path.join(userDataPath, 'app-settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save settings:', err);
    return { success: false, error: '写入设置失败' };
  }
}

// Global state
let mainWindow: BrowserWindow | null = null;
// 存储启动时通过 open-file 传入的文件路径（macOS 在窗口创建前可能先触发）
let pendingOpenFile: string | null = null;

// macOS：通过 Finder 双击或"打开方式"触发
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-file', filePath);
    mainWindow.focus();
  } else {
    pendingOpenFile = filePath;
  }
});
let aboutWindow: BrowserWindow | null = null;
let shortcutsWindow: BrowserWindow | null = null;
let modelConfigWindow: BrowserWindow | null = null;
let searchConfigWindow: BrowserWindow | null = null;
let wechatConfigWindow: BrowserWindow | null = null;
let imageConfigWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const aiAbortControllers = new Map<string, AbortController>();

function createWindow() {
// ... (omitting for brevity, but I need to find the right insertion point)

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
    icon: path.join(__dirname, '../assets/logo.png'),
  });

  if (isDev) {
    // 尝试载入 5173，如果失败则尝试 5174 (Vite 默认备选端口)
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadURL('http://localhost:5174');
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 页面加载完成后，发送启动时挂起的文件路径
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenFile) {
      mainWindow?.webContents.send('open-file', pendingOpenFile);
      pendingOpenFile = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (aboutWindow) aboutWindow.close();
    if (shortcutsWindow) shortcutsWindow.close();
    if (modelConfigWindow) modelConfigWindow.close();
    if (wechatConfigWindow) wechatConfigWindow.close();
    if (imageConfigWindow) imageConfigWindow.close();
    if (settingsWindow) settingsWindow.close();
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
    icon: path.join(__dirname, '../assets/logo.png'),
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
    icon: path.join(__dirname, '../assets/logo.png'),
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
    icon: path.join(__dirname, '../assets/logo.png'),
  });

  if (isDev) {
    modelConfigWindow.loadURL('http://localhost:5173?window=ai-config');
  } else {
    modelConfigWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'ai-config' } });
  }

  modelConfigWindow.on('closed', () => { modelConfigWindow = null; });
}

function createSearchConfigWindow() {
  if (searchConfigWindow) {
    searchConfigWindow.focus();
    return;
  }

  const width = 500;
  const height = 450;
  const pos = getSubWindowPosition(width, height);

  searchConfigWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '联网配置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden', vibrancy: 'window',
    visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, '../assets/logo.png'),
  });

  if (isDev) {
    searchConfigWindow.loadURL('http://localhost:5173?window=search-config');
  } else {
    searchConfigWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'search-config' } });
  }

  searchConfigWindow.on('closed', () => { searchConfigWindow = null; });
}

function createWechatConfigWindow() {
  if (wechatConfigWindow) { wechatConfigWindow.focus(); return; }
  const width = 520, height = 640;
  const pos = getSubWindowPosition(width, height);
  wechatConfigWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '微信公众号配置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'window', visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, '../assets/logo.png'),
  });
  if (isDev) {
    wechatConfigWindow.loadURL('http://localhost:5173?window=wechat-config');
  } else {
    wechatConfigWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'wechat-config' } });
  }
  wechatConfigWindow.on('closed', () => { wechatConfigWindow = null; });
}

function createImageConfigWindow() {
  if (imageConfigWindow) { imageConfigWindow.focus(); return; }
  const width = 500, height = 680;
  const pos = getSubWindowPosition(width, height);
  imageConfigWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '图片生成配置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'window', visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, '../assets/logo.png'),
  });
  if (isDev) {
    imageConfigWindow.loadURL('http://localhost:5173?window=image-config');
  } else {
    imageConfigWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'image-config' } });
  }
  imageConfigWindow.on('closed', () => { imageConfigWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  const width = 520, height = 680;
  const pos = getSubWindowPosition(width, height);
  settingsWindow = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    resizable: true, title: '全局设置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'window', visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, '../assets/logo.png'),
  });
  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173?window=settings');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'settings' } });
  }
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function setupAppMenu() {
  if (process.platform !== 'darwin') return;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      // macOS App 菜单（名称由 app.setName() 控制，label 在此不显示）
      label: 'iML Markdown Editor',
      submenu: [
        { label: '关于 iML Markdown Editor', click: () => createAboutWindow() },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 iML Markdown Editor' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 iML Markdown Editor' },
      ],
    },
    {
      label: '文件',
      submenu: [
        {
          label: '新建文档',
          accelerator: 'Cmd+N',
          click: () => mainWindow?.webContents.send('menu:new-file'),
        },
        {
          label: '打开文件…',
          accelerator: 'Cmd+O',
          click: () => mainWindow?.webContents.send('menu:open-file'),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'Cmd+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
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
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        ...(isDev ? [
          { role: 'reload' as const, label: '重新加载' },
          { role: 'forceReload' as const, label: '强制重新加载' },
          { role: 'toggleDevTools' as const, label: '开发者工具' },
          { type: 'separator' as const },
        ] : []),
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '智能',
      submenu: [
        {
          label: '模型配置',
          accelerator: 'Cmd+Shift+M',
          click: () => createModelConfigWindow(),
        },
        {
          label: '联网搜索配置',
          click: () => createSearchConfigWindow(),
        },
        { type: 'separator' },
        {
          label: '微信公众号配置',
          click: () => createWechatConfigWindow(),
        },
        {
          label: '图片生成配置',
          click: () => createImageConfigWindow(),
        },
      ],
    },
    { role: 'windowMenu', label: '窗口' },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: '快捷键说明',
          accelerator: 'Cmd+/',
          click: () => createShortcutsWindow(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  // 1. 注册核心 IPC 句柄
  try {
    setupFileSystemIPC();
  } catch (err) {
    console.error('Failed to setup FileSystem IPC:', err);
  }
  
  // AI Config IPC
  ipcMain.handle('ai:getConfig', () => getConfig());
  ipcMain.handle('ai:saveConfig', (_event, config) => saveConfig(config));
  
  // App Settings IPC
  ipcMain.handle('app:getSettings', () => getAppSettings());
  ipcMain.handle('app:saveSettings', (_event, settings) => {
    const result = saveAppSettings(settings);
    if (result.success && mainWindow) {
      mainWindow.webContents.send('settings:changed', settings);
    }
    return result;
  });

  // 抓取网页正文（去除脚本/样式/标签，保留可读文本）
  ipcMain.handle('ai:fetchUrl', async (_event, url: string) => {
    const resp = await net.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iMLBot/1.0)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000); // 最多 8000 字符
    return text;
  });

  // Web Search IPC (Tavily) - Moved to main process to avoid CORS and improve security
  ipcMain.handle('ai:webSearch', async (_event, query: string) => {
    const config = getConfig();
    const apiKey = config.searchApiKey;
    if (!apiKey) throw new Error('未配置 Tavily API Key');

    console.log(`[DEBUG] AI Web Search initiated for query: "${query}"`);

    try {
      const response = await net.fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: 'advanced',
          max_results: 5
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ERROR] Tavily API returned ${response.status}: ${errorText}`);
        throw new Error(`搜索失败: ${response.status} - ${errorText}`);
      }
      
      const data: any = await response.json();
      console.log(`[DEBUG] Tavily API returned ${data.results?.length || 0} results.`);
      
      return data.results.map((r: any) => 
        `标题: ${r.title}\n链接: ${r.url}\n内容: ${r.content}`
      ).join('\n\n');
    } catch (err: any) {
      console.error('[ERROR] Main process web search error:', err);
      throw err;
    }
  });

  // 2. 环境设置
  app.name = 'iML Markdown Editor';
app.setName('iML Markdown Editor');

  // Create standard macOS menu
  setupAppMenu();

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

  ipcMain.on('ai:chat', async (event, { messages, requestId, maxTokens }) => {
    const config = getConfig();
    const apiKey = config.apiKey;
    const endpoint = (config.endpoint || '').replace(/\/$/, '');
    const model = config.model || 'gpt-4o';
    const protocol: 'openai' | 'anthropic' = config.protocol || 'openai';

    if (!apiKey || !endpoint) {
      event.sender.send(`ai:chat-error-${requestId}`, '请检查模型配置 (API Key 或 Endpoint 缺失)');
      return;
    }

    const controller = new AbortController();
    aiAbortControllers.set(requestId, controller);

    try {
      let response: Response;

      if (protocol === 'anthropic') {
        // ── Anthropic Messages API ────────────────────────────────────────
        const systemMsg = messages.find((m: any) => m.role === 'system');
        const chatMessages = messages.filter((m: any) => m.role !== 'system');
        const url = `${endpoint}/messages`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens || 8192,
            ...(systemMsg ? { system: systemMsg.content } : {}),
            messages: chatMessages,
            stream: true,
          }),
          signal: controller.signal,
        });
      } else {
        // ── OpenAI-compatible (default) ───────────────────────────────────
        response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || errorData.message || `API 请求失败: ${response.status}`;
        event.sender.send(`ai:chat-error-${requestId}`, msg);
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
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          event.sender.send(`ai:chat-done-${requestId}`, fullContent);
          break;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { currentEvent = ''; continue; }

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              let content = '';

              if (protocol === 'anthropic') {
                // content_block_delta → text_delta
                if (currentEvent === 'content_block_delta' && json.delta?.type === 'text_delta') {
                  content = json.delta.text || '';
                }
              } else {
                content = json.choices?.[0]?.delta?.content || '';
              }

              if (content) {
                fullContent += content;
                event.sender.send(`ai:chat-chunk-${requestId}`, content);
              }
            } catch (_) { /* partial JSON, skip */ }
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
  ipcMain.on('open-search-config', () => createSearchConfigWindow());
  ipcMain.on('open:wechat-config', () => createWechatConfigWindow());
  ipcMain.on('open:image-config', () => createImageConfigWindow());
  ipcMain.on('open:settings', () => createSettingsWindow());

  // Forward settings preview/revert from settings window to main window
  ipcMain.on('settings:preview', (_event, settings) => {
    if (mainWindow) mainWindow.webContents.send('settings:preview', settings);
  });
  ipcMain.on('settings:revert', () => {
    if (mainWindow) mainWindow.webContents.send('settings:revert');
  });

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

  // ── WeChat 账号配置 IPC ──────────────────────────────────────────────────
  ipcMain.handle('wechat:getConfig', () => getWechatConfig());
  ipcMain.handle('wechat:saveConfig', (_event, config: any) => saveWechatConfig(config));

  // ── WeChat 热榜芯片（无需 API Key：GitHub Trending + HN）──────────────────
  ipcMain.handle('wechat:getHotTopics', async (): Promise<{ title: string; source: string }[]> => {
    const AI_KW =
      /\b(ai|llm|gpt|claude|gemini|llama|mistral|deepseek|openai|anthropic|agent|ml|model|neural|transformer|copilot|cursor|vibe|rag|mcp|inference|fine.tun|embedding|vector|diffusion|stable.diff|midjourney|sora|multimodal|nvidia|hugging.face)\b/i;

    const results: { title: string; source: string }[] = [];

    // 1. GitHub Trending（HTML 解析，无需 Auth）
    try {
      const res = await fetch('https://github.com/trending?since=daily', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      const html = await res.text();
      const repoMatches = [...html.matchAll(/<h2 class="h3 lh-condensed">\s*<a[^>]*href="\/([^"\/]+\/[^"]+?)"\s*>/g)];
      const descMatches = [...html.matchAll(/class="col-9 color-fg-muted my-1 pr-4">\s*([^<]{4,200?}?)\s*</g)];

      repoMatches.slice(0, 25).forEach((m, i) => {
        const fullPath = m[1]; // "owner/repo"
        const repoName = fullPath.split('/')[1] || fullPath;
        const desc = (descMatches[i]?.[1] || '').trim();
        const combined = `${fullPath} ${desc}`;
        if (AI_KW.test(combined)) {
          // 把 kebab-case 转为可读标签
          const label = repoName.replace(/-/g, ' ');
          results.push({ title: label, source: 'GitHub' });
        }
      });
    } catch (e) {
      console.warn('[WARN] GitHub trending 抓取失败', e);
    }

    // 2. Hacker News Top（Firebase 官方 API，无需 Auth，过滤 AI 相关）
    try {
      const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const ids: number[] = await idsRes.json();
      const top30 = ids.slice(0, 30);
      const items = await Promise.allSettled(
        top30.map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json()),
        ),
      );
      items
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<any>).value)
        .filter((item) => item?.title && AI_KW.test(item.title))
        .slice(0, 8)
        .forEach((item) => results.push({ title: item.title, source: 'HN' }));
    } catch (e) {
      console.warn('[WARN] HN API 调用失败', e);
    }

    return results;
  });

  // ── WeChat 热点多源搜索 IPC ──────────────────────────────────────────────
  ipcMain.handle('wechat:getTrends', async () => {
    const config = getConfig();
    const apiKey = config.searchApiKey;
    if (!apiKey) throw new Error('未配置 Tavily API Key，请先在"联网配置"中添加');

    const queries = [
      'X Twitter AI technology LLM agent trending hot topics latest',
      'Hacker News AI machine learning trending discussion',
      'AI 大模型 技术热点 最新进展 应用落地 中国',
    ];

    const results = await Promise.allSettled(
      queries.map((q) =>
        fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, query: q, search_depth: 'advanced', max_results: 4 }),
        })
          .then((r) => r.json())
          .then((d: any) =>
            (d.results || [])
              .map((r: any) => `标题: ${r.title}\n链接: ${r.url}\n内容: ${r.content}`)
              .join('\n\n'),
          ),
      ),
    );

    const combined = results
      .map((r, i) => {
        const label = ['X/Twitter', 'Hacker News', '国内 AI 动态'][i];
        if (r.status === 'fulfilled' && r.value) return `【${label}】\n${r.value}`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (!combined) throw new Error('所有搜索源均无结果，请检查网络或 Tavily API Key');
    return combined;
  });

  // ── 封面图：网络爬取 or AI 生成 ──
  ipcMain.handle(
    'ai:getCoverImages',
    async (
      _,
      { query, vibe, config }: { query: string; vibe: string; config: any },
    ): Promise<{ url: string; localPath: string }[]> => {
      const tmpDir = app.getPath('temp');

      function bufToDataUrl(buf: Buffer, mimeType: string): string {
        return `data:${mimeType};base64,${buf.toString('base64')}`;
      }

      async function crawl(searchQuery: string): Promise<{ url: string; localPath: string }[]> {
        const q = encodeURIComponent(`${searchQuery} 技术 科技`);
        const res = await net.fetch(`https://www.bing.com/images/search?q=${q}&form=HDRSC2&first=1&count=20`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });
        const html = await res.text();
        const murls = [...html.matchAll(/"murl":"([^"]+)"/g)]
          .map((m) => {
            try { return decodeURIComponent(m[1]); } catch { return m[1]; }
          })
          .filter((u) => u.startsWith('http'));
        const results: { url: string; localPath: string }[] = [];
        for (let i = 0; i < murls.length && results.length < 3; i++) {
          try {
            const imgRes = await net.fetch(murls[i]);
            if (!imgRes.ok) continue;
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get('content-type') || 'image/jpeg';
            const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
            const localPath = path.join(tmpDir, `iml-cover-${Date.now()}-${i}.${ext}`);
            fs.writeFileSync(localPath, buf);
            results.push({ url: bufToDataUrl(buf, ct.split(';')[0] || 'image/jpeg'), localPath });
          } catch { /* skip */ }
        }
        return results;
      }

      function assertAsciiHeader(value: string, label: string) {
        for (let i = 0; i < value.length; i++) {
          if (value.charCodeAt(i) > 127) {
            throw new Error(`${label} 包含非 ASCII 字符（位置 ${i}，字符"${value[i]}"），HTTP Header 不支持中文，请检查配置`);
          }
        }
      }

      async function generateImages(prompt: string, cfg: any): Promise<{ url: string; localPath: string }[]> {
        // 提前校验 Header 值，避免 Electron net.fetch 遇到非 ASCII 时 crash
        assertAsciiHeader(cfg.apiKey || '', 'API Key');
        if (cfg.endpoint) assertAsciiHeader(cfg.endpoint, '端点 URL');

        // rawPrompt=true 时直接使用原始 prompt（AIPalette 通用图片生成），否则追加 cover 专用描述
        const stylePrompt = cfg.rawPrompt
          ? prompt
          : `${prompt}, professional tech article cover image, modern clean design, technology theme, suitable for WeChat official account, high quality, 16:9 aspect ratio, no text overlay`;
        const results: { url: string; localPath: string }[] = [];

        if (cfg.provider === 'gemini' || cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash') {
          const useImagen = cfg.provider === 'gemini-imagen'
            || (cfg.provider !== 'gemini-flash' && (cfg.model || '').includes('imagen'));
          const model = cfg.model || (useImagen ? 'imagen-4.0-generate-001' : 'gemini-2.0-flash-exp-image-generation');
          if (useImagen) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${cfg.apiKey}`;
            const { status, text: rawText } = await nodePost(url, JSON.stringify({
              instances: [{ prompt: stylePrompt }],
              parameters: { sampleCount: 1, aspectRatio: '16:9' },
            }), { 'Content-Type': 'application/json' });
            if (status < 200 || status >= 300 || !rawText) throw new Error(`Gemini Imagen HTTP ${status}（${model}）: ${rawText || '(empty)'}`);
            let data: any;
            try { data = JSON.parse(rawText); } catch { throw new Error(`Gemini Imagen 非 JSON（${status}）: ${rawText.slice(0, 200)}`); }
            if (!data.predictions?.length) throw new Error(data.error?.message || `Imagen 未返回图片: ${rawText.slice(0, 200)}`);
            for (let i = 0; i < data.predictions.length; i++) {
              const b64 = data.predictions[i].bytesBase64Encoded;
              if (!b64) continue;
              const buf = Buffer.from(b64, 'base64');
              const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.png`);
              fs.writeFileSync(localPath, buf);
              results.push({ url: bufToDataUrl(buf, 'image/png'), localPath });
            }
          } else {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
            const { status, text: rawText } = await nodePost(url, JSON.stringify({
              contents: [{ parts: [{ text: stylePrompt }] }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 1.0 },
            }), { 'Content-Type': 'application/json' });
            if (status < 200 || status >= 300) throw new Error(`Gemini Flash HTTP ${status}: ${rawText.slice(0, 300)}`);
            let data: any;
            try { data = JSON.parse(rawText); } catch { throw new Error(`Gemini Flash 非 JSON: ${rawText.slice(0, 200)}`); }
            if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
            const parts: any[] = data.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                const mime = part.inlineData.mimeType || 'image/jpeg';
                const buf = Buffer.from(part.inlineData.data, 'base64');
                const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-0.${mime.includes('png') ? 'png' : 'jpg'}`);
                fs.writeFileSync(localPath, buf);
                results.push({ url: bufToDataUrl(buf, mime), localPath });
                break;
              }
            }
            if (results.length === 0) throw new Error(`Gemini Flash 未返回图片（${model}）`);
          }
        } else if (cfg.provider === 'minimax') {
          const { status, text: rawText } = await nodePost(
            'https://api.minimaxi.com/v1/image_generation',
            JSON.stringify({ model: cfg.model || 'image-01', prompt: stylePrompt, response_format: 'url', n: 1, aspect_ratio: '16:9', prompt_optimizer: false }),
            { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          );
          if (status < 200 || status >= 300) throw new Error(`MiniMax HTTP ${status}: ${rawText.slice(0, 300)}`);
          let data: any;
          try { data = JSON.parse(rawText); } catch { throw new Error(`MiniMax 返回非 JSON: ${rawText.slice(0, 200)}`); }
          console.log('[MiniMax] base_resp:', JSON.stringify(data.base_resp), '| key prefix:', (cfg.apiKey || '').slice(0, 10));
          if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
            throw new Error(data.base_resp.status_msg || `MiniMax 错误码 ${data.base_resp.status_code}`);
          }
          const imageUrls: string[] = data.data?.image_urls || [];
          if (imageUrls.length === 0) throw new Error(`MiniMax 未返回图片: ${rawText.slice(0, 200)}`);
          for (let i = 0; i < imageUrls.length; i++) {
            const buf = await nodeGetBuffer(imageUrls[i]);
            const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.jpg`);
            fs.writeFileSync(localPath, buf);
            results.push({ url: bufToDataUrl(buf, 'image/jpeg'), localPath });
          }
        } else if (cfg.provider === 'volcengine') {
          const model = cfg.model || 'doubao-seedream-5-0-260128';
          const { status, text: rawText } = await nodePost(
            'https://ark.cn-beijing.volces.com/api/v3/images/generations',
            JSON.stringify({ model, prompt: stylePrompt, size: '2560x1440', n: 1, response_format: 'url' }),
            { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          );
          if (status < 200 || status >= 300) throw new Error(`火山引擎 HTTP ${status}: ${rawText.slice(0, 300)}`);
          let data: any;
          try { data = JSON.parse(rawText); } catch { throw new Error(`火山引擎返回非 JSON: ${rawText.slice(0, 200)}`); }
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
          const items: any[] = data.data || [];
          if (items.length === 0) throw new Error(`火山引擎未返回图片: ${rawText.slice(0, 200)}`);
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.b64_json) {
              const buf = Buffer.from(item.b64_json, 'base64');
              const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.png`);
              fs.writeFileSync(localPath, buf);
              results.push({ url: bufToDataUrl(buf, 'image/png'), localPath });
            } else if (item.url) {
              const buf = await nodeGetBuffer(item.url);
              const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.png`);
              fs.writeFileSync(localPath, buf);
              results.push({ url: bufToDataUrl(buf, 'image/png'), localPath });
            }
          }
        } else if (cfg.provider === 'custom' && cfg.endpoint) {
          const { text: rawText } = await nodePost(
            cfg.endpoint,
            JSON.stringify({ model: cfg.model, prompt: stylePrompt, n: 1 }),
            { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          );
          let data: any;
          try { data = JSON.parse(rawText); } catch { throw new Error(`Custom 端点返回非 JSON: ${rawText.slice(0, 200)}`); }
          const imgs: any[] = data.data || data.images || data.output || [];
          for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            const b64 = img.b64_json || img.base64;
            if (b64) {
              const buf = Buffer.from(b64, 'base64');
              const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.png`);
              fs.writeFileSync(localPath, buf);
              results.push({ url: bufToDataUrl(buf, 'image/png'), localPath });
            } else if (img.url) {
              const buf = await nodeGetBuffer(img.url);
              const localPath = path.join(tmpDir, `iml-cover-gen-${Date.now()}-${i}.png`);
              fs.writeFileSync(localPath, buf);
              results.push({ url: bufToDataUrl(buf, 'image/png'), localPath });
            }
          }
        } else {
          throw new Error(`未知图片生成提供商「${cfg.provider || '(未配置)'}」，请在「图片生成配置」中选择提供商并填入 API Key`);
        }

        if (results.length === 0) {
          throw new Error('图片生成未返回结果，请检查 API Key 是否正确，或尝试更换模型');
        }
        return results;
      }

      if (config.source === 'generate') {
        return generateImages(query || vibe, config);
      }
      return crawl(query || vibe);
    },
  );

  // ── WeChat 发布 IPC ──────────────────────────────────────────────────────
  ipcMain.handle('wechat:publish', async (_event, { markdown, theme = 'default', color, accountId, coverLocalPath }: { markdown: string; theme?: string; color?: string; accountId?: string; coverLocalPath?: string }) => {
    // 0. 从应用配置中取账号凭据，写入临时 .env 供脚本读取
    const wechatCfg = getWechatConfig();
    const account = accountId
      ? wechatCfg.accounts?.find((a: any) => a.id === accountId)
      : wechatCfg.accounts?.[0];
    if (!account?.appId || !account?.appSecret) {
      throw new Error('未找到公众号 API 凭据，请先在"微信公众号配置"中添加账号');
    }
    // 写临时 .env（脚本从此路径读取凭据）
    const tmpEnvDir = path.join(app.getPath('temp'), 'iml-wechat-env');
    if (!fs.existsSync(tmpEnvDir)) fs.mkdirSync(tmpEnvDir, { recursive: true });
    const tmpEnvFile = path.join(tmpEnvDir, '.env');
    fs.writeFileSync(tmpEnvFile, `WECHAT_APP_ID=${account.appId}\nWECHAT_APP_SECRET=${account.appSecret}\n`, 'utf8');

    // 1. 找 bun 可执行文件（Electron 子进程 PATH 可能残缺，优先绝对路径）
    const home = app.getPath('home');
    const bunCandidates = [
      path.join(home, '.bun', 'bin', 'bun'),
      '/opt/homebrew/bin/bun',
      '/usr/local/bin/bun',
      '/usr/bin/bun',
    ];
    const bunFromDisk = bunCandidates.find((p) => fs.existsSync(p));
    const bunPath = await new Promise<string>((resolve) => {
      if (bunFromDisk) { resolve(bunFromDisk); return; }
      // fallback: 用 shell 查（macOS 需要 -l 加载 .zshrc）
      exec('/bin/zsh -l -c "which bun"', (err, stdout) => {
        resolve(!err && stdout.trim() ? stdout.trim() : 'bun');
      });
    });

    // 2. 找 baoyu-post-to-wechat 脚本
    const scriptCandidates = [
      path.join(home, '.claude', 'skills', 'baoyu-post-to-wechat', 'scripts', 'wechat-api.ts'),
      path.join(home, '.claude', 'plugins', 'cache', 'anthropic-agent-skills', 'baoyu-post-to-wechat'),
    ];
    // 支持 glob 风格的带版本号目录
    let scriptPath = scriptCandidates[0];
    for (const candidate of scriptCandidates) {
      if (candidate.includes('cache')) {
        // 扫描版本号子目录
        try {
          const parent = path.dirname(candidate);
          const grandParent = path.dirname(parent);
          if (fs.existsSync(grandParent)) {
            const entries = fs.readdirSync(grandParent);
            for (const entry of entries) {
              const p = path.join(grandParent, entry, 'skills', 'baoyu-post-to-wechat', 'scripts', 'wechat-api.ts');
              if (fs.existsSync(p)) { scriptPath = p; break; }
            }
          }
        } catch (_) { /* ignore */ }
      } else if (fs.existsSync(candidate)) {
        scriptPath = candidate;
        break;
      }
    }

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`找不到 baoyu-post-to-wechat 脚本：${scriptPath}\n请确保已安装 baoyu-post-to-wechat skill`);
    }

    // 3. 写 markdown 到临时文件
    const tmpDir = app.getPath('temp');
    const tmpFile = path.join(tmpDir, `wechat-draft-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, markdown, 'utf8');

    // 4. 构建参数（账号偏好优先）
    const resolvedTheme = account.defaultTheme || theme;
    const resolvedColor = account.defaultColor || color;
    const finalArgs = [scriptPath, tmpFile, '--theme', resolvedTheme, '--no-cite'];
    if (resolvedColor) finalArgs.push('--color', resolvedColor);
    if (account.author) finalArgs.push('--author', account.author);
    if (coverLocalPath && fs.existsSync(coverLocalPath)) finalArgs.push('--cover', coverLocalPath);

    // 5. 执行（cwd 设为临时 env 目录，让脚本能找到 .env）
    return new Promise((resolve, reject) => {
      execFile(bunPath, finalArgs, {
        timeout: 120000,
        cwd: tmpEnvDir,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${path.dirname(bunPath)}:${process.env.PATH || '/usr/bin:/bin'}`,
        },
      }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
        try { fs.unlinkSync(tmpEnvFile); } catch (_) { /* ignore */ }
        if (err) {
          const detail = [stderr, stdout].filter(Boolean).join('\n').trim();
          reject(new Error(detail || err.message));
        } else {
          resolve({ success: true, output: stdout });
        }
      });
    });
  });

  // ── WeChat 直接发布 HTML（绕过 baoyu 脚本，支持插图上传）──────────────────
  ipcMain.handle('wechat:publishHtml', async (_event, {
    html,
    title,
    abstract,
    accountId,
    coverLocalPath,
    inlineImageDataUrls,
  }: {
    html: string;
    title?: string;
    abstract?: string;
    accountId?: string;
    coverLocalPath?: string;
    inlineImageDataUrls?: string[];
  }) => {
    const wechatCfg = getWechatConfig();
    const account = accountId
      ? wechatCfg.accounts?.find((a: any) => a.id === accountId)
      : wechatCfg.accounts?.[0];
    if (!account?.appId || !account?.appSecret) {
      throw new Error('未找到公众号 API 凭据，请先在"微信公众号配置"中添加账号');
    }

    // 1. 获取 access_token
    const tokenBuf = await nodeGetBuffer(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appId}&secret=${account.appSecret}`,
    );
    const tokenData = JSON.parse(tokenBuf.toString('utf8'));
    if (!tokenData.access_token) {
      throw new Error(`获取 access_token 失败：${tokenBuf.toString('utf8')}`);
    }
    const token: string = tokenData.access_token;

    // 辅助：multipart 上传本地图片文件
    async function uploadLocalImage(filePath: string, endpoint: string): Promise<string> {
      const imageBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      };
      const mime = mimeMap[ext] || 'image/jpeg';
      const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
      const partHeader = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="image.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`,
      );
      const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([partHeader, imageBuffer, partFooter]);
      const resp = await nodePost(endpoint, body, {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      });
      return resp.text;
    }

    // 2. 上传封面为永久素材 → thumb_media_id
    let thumbMediaId = '';
    if (coverLocalPath && fs.existsSync(coverLocalPath)) {
      const coverResp = await uploadLocalImage(
        coverLocalPath,
        `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`,
      );
      const coverData = JSON.parse(coverResp);
      if (!coverData.media_id) throw new Error(`封面上传失败：${coverResp}`);
      thumbMediaId = coverData.media_id;
    }

    // 3. 将 HTML 中的 data: URL 图片上传至微信图床并替换
    let processedHtml = html;
    const dataUrlMatches = [...html.matchAll(/<img[^>]+src="(data:image\/([^;]+);base64,([^"]+))"[^>]*>/gi)];
    for (const m of dataUrlMatches) {
      const [, fullDataUrl, ext, base64Data] = m;
      try {
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const tmpPath = path.join(app.getPath('temp'), `wechat-inline-${Date.now()}.${ext}`);
        fs.writeFileSync(tmpPath, imageBuffer);
        const uploadResp = await uploadLocalImage(
          tmpPath,
          `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`,
        );
        try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
        const uploadData = JSON.parse(uploadResp);
        if (uploadData.url) {
          processedHtml = processedHtml.replace(fullDataUrl, uploadData.url);
        }
      } catch (_) { /* 保留原 data URL，不中断整体流程 */ }
    }

    // 4. 确定文章标题（优先用调用方传入的，兜底从 HTML h1 提取）
    const resolvedTitle = title?.trim() ||
      (() => {
        const m = processedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        return m ? m[1].replace(/<[^>]+>/g, '').trim() : '未命名文章';
      })();

    // 5. 上传文档中手动插入的图片，拼到正文末尾
    if (inlineImageDataUrls?.length) {
      for (const dataUrl of inlineImageDataUrls) {
        try {
          const matched = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/s);
          if (!matched) continue;
          const [, ext, base64Data] = matched;
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const tmpPath = path.join(app.getPath('temp'), `wechat-inline-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
          fs.writeFileSync(tmpPath, imageBuffer);
          const uploadResp = await uploadLocalImage(
            tmpPath,
            `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`,
          );
          try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
          const uploadData = JSON.parse(uploadResp);
          if (uploadData.url) {
            processedHtml += `<section style="text-align:center;margin:20px 0;"><img src="${uploadData.url}" style="max-width:100%;border-radius:4px;"/></section>`;
          }
        } catch (_) { /* 单张失败不中断整体 */ }
      }
    }

    // 6. 提交草稿
    const draftBody = JSON.stringify({
      articles: [{
        title: resolvedTitle,
        author: account.author || '',
        digest: abstract?.trim() || '',
        content: processedHtml,
        thumb_media_id: thumbMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      }],
    });
    const draftResp = await nodePost(
      `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`,
      draftBody,
      { 'Content-Type': 'application/json; charset=utf-8' },
    );
    const draftData = JSON.parse(draftResp.text);
    if (!draftData.media_id) {
      throw new Error(`草稿创建失败：${draftResp.text}`);
    }
    return { success: true, mediaId: draftData.media_id };
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
