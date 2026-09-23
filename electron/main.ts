import { app, BrowserWindow, ipcMain, nativeImage, Menu, shell, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { setupFileSystemIPC } from './ipc/fileSystem';
import { SearchIndex } from './searchIndex';
import { setupLocalModel, ensureBuiltinEndpoint, builtinNotReadyHint, isBuiltinService, isLocalServerActive, stopServer as stopLocalServer } from './localModel';
import { scheduler } from './localModel/scheduler';
import { setupResources } from './localModel/resources';
import { setupImageGen, generateLocalImage, stopImageServer } from './imageGen';
import { setupSemantic, syncSemanticIndex, stopSemanticServer, isSemanticServerActive } from './semantic';
import { setupAsr, stopAsr, confirmDiscardTranscript, forgetUnsavedTranscript } from './asr';
import { describeRelease } from './update';
import { NoteHistory } from './history';
import { setupQuickCapture } from './capture';
import { syncFolderCandidates, labelCloudStorageDir, SYNC_LIBRARY_NAME } from './shared/syncFolders';
import { parseAppUrl, appUrlFromArgv, APP_URL_SCHEME, AppUrlAction } from './shared/appUrl';
import { registerAssetScheme, handleAssetProtocol, findOrphanImages, filterTrashable, fetchPageTitle } from './assets';
import { AI_DISABLED } from './shared/uiText';

const isDev = process.env.NODE_ENV === 'development';

// macOS 菜单栏 App 名称来自 app.getName()，必须在 ready 前设置
app.name = 'iML Markdown Editor';
app.setName('iML Markdown Editor');

// 冒烟测试：IML_SMOKE_USERDATA 指向临时目录，配置 / 运行时 / 模型都不碰用户的真实数据
if (isDev && process.env.IML_SMOKE_USERDATA) app.setPath('userData', process.env.IML_SMOKE_USERDATA);
// 冒烟测试：IML_SMOKE_FAKE_MIC=/path/to.wav 把一段 WAV 当麦克风输入（循环播放去掉 %noloop），无人值守也能测实时转写。
// 沙箱不让假设备读文件，所以要一并关掉 —— 只在开发模式、且显式给了这个变量时才会走到这里
if (isDev && process.env.IML_SMOKE_FAKE_MIC) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.IML_SMOKE_FAKE_MIC}%noloop`);
}

// 笔记里的本地图片走 iml-asset://（必须在 ready 之前登记协议）
registerAssetScheme();

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

// ── 敏感字段落盘加密：macOS 走钥匙串、Windows 走 DPAPI（Electron safeStorage）──
// 磁盘上只存 <field>Enc（base64 密文）；读出来时还原成明文给渲染进程用。老配置里的明文在下次保存时自动转成密文。
const SECRET_SUFFIX = 'Enc';

function encryptSecrets(obj: any, fields: string[]) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const field of fields) {
    const value = out[field];
    if (typeof value === 'string' && value && safeStorage.isEncryptionAvailable()) {
      out[field + SECRET_SUFFIX] = safeStorage.encryptString(value).toString('base64');
      delete out[field];
    } else if (!value) {
      delete out[field];
      delete out[field + SECRET_SUFFIX];
    }
  }
  return out;
}

function decryptSecrets(obj: any, fields: string[]) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const field of fields) {
    const enc = out[field + SECRET_SUFFIX];
    if (typeof enc === 'string' && enc) {
      try {
        out[field] = safeStorage.decryptString(Buffer.from(enc, 'base64'));
      } catch (err) {
        console.warn(`[safeStorage] 无法解密 ${field}，需要重新填写`, err);
        out[field] = '';
      }
      delete out[field + SECRET_SUFFIX];
    }
  }
  return out;
}

const AI_CONFIG_SECRETS = ['apiKey', 'searchApiKey'];

function getConfig() {
  const { configPath } = getPaths();
  try {
    if (fs.existsSync(configPath)) {
      return decryptSecrets(JSON.parse(fs.readFileSync(configPath, 'utf8')), AI_CONFIG_SECRETS);
    }
  } catch (err) {
    console.error('Failed to read config:', err);
  }
  return {};
}

function saveConfig(config: any) {
  const { configPath } = getPaths();
  try {
    fs.writeFileSync(configPath, JSON.stringify(encryptSecrets(config, AI_CONFIG_SECRETS), null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save config:', err);
    return { success: false, error: '写入文件失败' };
  }
}

let quickCapture: ReturnType<typeof setupQuickCapture> | null = null;

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
      if (settings.imageGenConfig) settings.imageGenConfig = decryptSecrets(settings.imageGenConfig, ['apiKey']);
    }
  } catch (err) {
    console.error('Failed to read settings:', err);
  }

  // 冒烟测试：IML_SMOKE_LIBRARY 指向一个临时笔记库，不碰用户真实设置
  if (isDev && process.env.IML_SMOKE_LIBRARY) settings.defaultLibraryPath = process.env.IML_SMOKE_LIBRARY;

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

/** 拼写检查默认关：中文笔记里满屏红色波浪线弊大于利，需要的人在设置里打开 */
function applySpellcheck(enabled: boolean) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.session.setSpellCheckerEnabled(enabled);
  }
}

function saveAppSettings(settings: any) {
  const { userDataPath } = getPaths();
  const settingsPath = path.join(userDataPath, 'app-settings.json');
  try {
    // 合并写入：各个设置入口只传自己管的字段，不能把别人的字段（如图片生成配置里的 API Key）冲掉
    let existing: any = {};
    try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || {}; } catch { /* 首次保存 */ }
    const merged = { ...existing, ...(settings || {}) };
    if (settings?.imageGenConfig) merged.imageGenConfig = encryptSecrets(settings.imageGenConfig, ['apiKey']);
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save settings:', err);
    return { success: false, error: '写入设置失败' };
  }
}

// Global state
let mainWindow: BrowserWindow | null = null;
// 通过「打开方式」/ 命令行传入、等待渲染进程拉取的文件路径队列
const pendingOpenFiles: string[] = [];

function isOpenableDocument(p: string): boolean {
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(p) && fs.existsSync(p);
}

/** 从命令行参数里找出要打开的文档；相对路径按启动时的工作目录解析 */
function documentFromArgv(argv: string[], cwd: string): string | undefined {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-'))
    .map((a) => path.resolve(cwd, a))
    .find(isOpenableDocument);
}

/**
 * 把系统传入的文件交给渲染进程。只走一条路：入队，再发一个不带参数的 'open-file' 提醒；
 * 渲染进程在初始化完成和收到提醒时都会主动拉取队列。
 * 不依赖「渲染进程是否已注册监听」之类的状态位，页面刷新、初始化异常等情况下文件也不会丢。
 */
function openFileFromOS(filePath: string) {
  pendingOpenFiles.push(filePath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-file');
  } else if (app.isReady()) {
    // macOS 下所有窗口关闭后应用仍驻留；此时双击文件必须重新建窗口，否则「能启动却不显示」
    createWindow();
  }
}

// ── iml:// 链接（Raycast、快捷指令、浏览器书签调起应用）──
// 和上面的文件一样走「入队 + 提醒，渲染进程来拉」：应用还没起来时点的链接也不会丢。
const pendingAppUrls: AppUrlAction[] = [];

function openAppUrl(raw: string) {
  const action = parseAppUrl(raw);
  if (!action) { console.warn('[url] ignored:', String(raw).slice(0, 120)); return; }
  pendingAppUrls.push(action);
  const quiet = action.action === 'capture'; // 追加一句话不该把窗口带到前面，用户此刻在别的软件里
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!quiet) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    mainWindow.webContents.send('app-url');
  } else if (app.isReady()) {
    createWindow();
  }
}

ipcMain.handle('app:consumePendingUrls', () => {
  const urls = [...pendingAppUrls];
  pendingAppUrls.length = 0;
  return urls;
});

// macOS：链接经 open-url 事件进来，应用还没 ready 时也可能触发，所以在最外层注册
app.on('open-url', (event, url) => {
  event.preventDefault();
  openAppUrl(url);
});

// 版本号与待打开文件队列不依赖 ready，尽早注册：preload 同步读版本号时句柄必须已经挂上
ipcMain.on('app:version', (event) => {
  // 冒烟测试：IML_SMOKE_VERSION=26.1.0 让应用以为自己是旧版本，用来看真实的「发现新版本」提醒
  event.returnValue = (isDev && process.env.IML_SMOKE_VERSION) || app.getVersion();
});
ipcMain.handle('app:consumePendingOpenFiles', () => {
  const files = [...pendingOpenFiles];
  pendingOpenFiles.length = 0;
  return files;
});

/** 按协议拼请求头；本地服务（Ollama / LM Studio / llama.cpp）无需 Key，留空时不发送 Authorization */
function buildAuthHeaders(protocol: 'openai' | 'anthropic', apiKey: string): Record<string, string> {
  if (protocol === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

// macOS：通过 Finder 双击或「打开方式」触发（可能早于 ready）
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileFromOS(filePath);
});

// Windows / Linux：文件路径通过命令行参数传入；二次启动交给已运行的实例
if (process.platform !== 'darwin') {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv, workingDirectory) => {
      const file = documentFromArgv(argv, workingDirectory);
      const url = appUrlFromArgv(argv);
      if (url) {
        openAppUrl(url);
      } else if (file) {
        openFileFromOS(file);
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    const initialFile = documentFromArgv(process.argv, process.cwd());
    if (initialFile) pendingOpenFiles.push(initialFile);
    const initialUrl = appUrlFromArgv(process.argv);
    if (initialUrl) { const action = parseAppUrl(initialUrl); if (action) pendingAppUrls.push(action); }
  }
}
const aiAbortControllers = new Map<string, AbortController>();
// 笔记库目录监听
let libraryWatcher: fs.FSWatcher | null = null;
let libraryChangeTimer: ReturnType<typeof setTimeout> | null = null;
const libraryChanged = new Set<string>();
// 笔记库全文索引
const searchIndex = new SearchIndex();

function createWindow() {
  // 冒烟测试：IML_SMOKE_OFFSCREEN=1 时用离屏渲染（不显示窗口，按定时器出帧），显示器休眠、无人值守时也能截图；
  // IML_SMOKE_SIZE=1440x900 指定窗口大小
  const smokeOffscreen = isDev && process.env.IML_SMOKE_OFFSCREEN === '1';
  const [smokeW, smokeH] = (isDev ? process.env.IML_SMOKE_SIZE || '' : '').split('x').map((n) => Number(n));

  mainWindow = new BrowserWindow({
    width: smokeW > 0 ? smokeW : 1024,
    height: smokeH > 0 ? smokeH : 768,
    show: !smokeOffscreen,
    minWidth: 800,
    minHeight: 600,
    title: 'iML Markdown Editor',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    vibrancy: 'sidebar', 
    visualEffectState: 'active',
    backgroundColor: '#00000000', 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      ...(smokeOffscreen ? { offscreen: true } : {}),
    },
    icon: path.join(__dirname, '../assets/logo.png'),
  });
  if (smokeOffscreen) mainWindow.webContents.setFrameRate(30);
  mainWindow.webContents.session.setSpellCheckerEnabled(!!getAppSettings().spellcheck);

  if (isDev) {
    // 开发模式：把渲染进程的控制台输出转发到终端，方便在命令行里看到 React / 编辑器的报错
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer:${level === 3 ? 'error' : 'warn'}] ${message} (${sourceId}:${line})`);
    });
    // 冒烟测试：IML_SMOKE_SHOT=/path.png 时，页面加载完成 6 秒后把窗口内容截图存盘（不需要系统的屏幕录制权限）
    const shotPath = process.env.IML_SMOKE_SHOT;
    if (process.env.IML_SMOKE_OPEN && isOpenableDocument(process.env.IML_SMOKE_OPEN)) pendingOpenFiles.push(process.env.IML_SMOKE_OPEN);
    if (shotPath) {
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            // 可选：先在页面里跑一段脚本（点开某个面板、输入文字），再截图
            if (process.env.IML_SMOKE_SCRIPT) {
              await mainWindow!.webContents.executeJavaScript(process.env.IML_SMOKE_SCRIPT).catch((e) => console.warn('[smoke] script failed:', e));
              await new Promise((r) => setTimeout(r, 1500));
            }
            // IML_SMOKE_RECT=x,y,w,h（CSS 像素）只截窗口的一块区域
            const rectEnv = (process.env.IML_SMOKE_RECT || '').split(',').map((n) => Number(n));
            const rect = rectEnv.length === 4 && rectEnv.every((n) => Number.isFinite(n)) ? { x: rectEnv[0], y: rectEnv[1], width: rectEnv[2], height: rectEnv[3] } : undefined;
            const image = await mainWindow!.webContents.capturePage(rect);
            fs.writeFileSync(shotPath, image.toPNG());
            console.log(`[smoke] screenshot saved to ${shotPath}`);
            console.log(`[smoke] windows: ${BrowserWindow.getAllWindows().map((w) => JSON.stringify(w.getTitle())).join(', ')}`);
          } catch (err) {
            console.warn('[smoke] capture failed:', err);
          }
        }, 6000);
      });
    }
    // 尝试载入 5173，如果失败则尝试 5174 (Vite 默认备选端口)
    // 冒烟：IML_SMOKE_QUERY=ai-config 时主窗口直接加载对应的独立窗口页面，方便截图
    const smokeQuery = process.env.IML_SMOKE_QUERY ? `?window=${process.env.IML_SMOKE_QUERY}` : '';
    mainWindow.loadURL(`http://localhost:5173${smokeQuery}`).catch(() => {
      mainWindow?.loadURL(`http://localhost:5174${smokeQuery}`);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 有还没放进笔记的转写时，关窗口之前问一句（macOS 上关窗口不等于退出，但渲染进程一样会没）
  mainWindow.on('close', (event) => { if (!confirmDiscardTranscript(mainWindow)) event.preventDefault(); });
  mainWindow.on('closed', () => {
    forgetUnsavedTranscript();
    mainWindow = null;
  });
}

/**
 * 配置 / 关于 / 快捷键都是主窗口里的浮层，不再新开 BrowserWindow：
 * 多开窗口会让 Dock 与调度中心里出现好几个同名窗口。主窗口不在时先建出来再打开。
 */
function openDialogInMain(id: 'about' | 'shortcuts' | 'ai-config' | 'image-config' | 'semantic-config' | 'transcribe-config' | 'settings' | 'resources') {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    mainWindow?.webContents.once('did-finish-load', () => {
      setTimeout(() => mainWindow?.webContents.send('dialog:open', id), 300);
    });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('dialog:open', id);
}

function setupAppMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      // macOS App 菜单（名称由 app.setName() 控制，label 在此不显示）
      label: 'iML Markdown Editor',
      submenu: [
        { label: '关于 iML Markdown Editor', click: () => openDialogInMain('about') },
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
        {
          label: '快速打开笔记…',
          accelerator: 'Cmd+T',
          click: () => mainWindow?.webContents.send('dialog:open', 'quick-open'),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'Cmd+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        { type: 'separator' },
        {
          label: '版本历史…',
          accelerator: 'Cmd+Shift+H',
          click: () => mainWindow?.webContents.send('dialog:open', 'history'),
        },
        {
          label: '导出为 PDF…',
          accelerator: 'Cmd+P',
          click: () => mainWindow?.webContents.send('menu:export', 'pdf'),
        },
        {
          label: '导出为 HTML…',
          accelerator: 'Cmd+Shift+E',
          click: () => mainWindow?.webContents.send('menu:export', 'html'),
        },
        { label: '导出为 Word…', click: () => mainWindow?.webContents.send('menu:export', 'docx') },
        { label: '导出为长图…', click: () => mainWindow?.webContents.send('menu:export', 'image') },
        { label: '复制为公众号格式…', click: () => mainWindow?.webContents.send('dialog:open', 'wechat-copy') },
        { type: 'separator' },
        // 标签页是渲染进程管的，但 Cmd+W 得在这里占住：否则 role:'close' 会拿走它去关窗口
        {
          label: '关闭标签页',
          accelerator: 'Cmd+W',
          click: () => mainWindow?.webContents.send('menu:close-tab'),
        },
        {
          label: '关闭其他标签页',
          accelerator: 'Alt+Cmd+W',
          click: () => mainWindow?.webContents.send('menu:close-other-tabs'),
        },
        {
          label: '关闭已保存的标签页',
          click: () => mainWindow?.webContents.send('menu:close-saved-tabs'),
        },
        {
          label: '关闭全部标签页',
          click: () => mainWindow?.webContents.send('menu:close-all-tabs'),
        },
        {
          label: '重开刚关的标签页',
          accelerator: 'Cmd+Shift+T',
          click: () => mainWindow?.webContents.send('menu:reopen-tab'),
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口', accelerator: 'Cmd+Shift+W' },
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
      // 命令面板放在「视图」最上面：和窗口里那套菜单的位置一致
      submenu: [
        {
          label: '命令面板…',
          accelerator: 'Cmd+Shift+P',
          click: () => mainWindow?.webContents.send('dialog:open', 'command-palette'),
        },
        { type: 'separator' as const },
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
          label: '问你的笔记',
          accelerator: 'Cmd+J',
          click: () => mainWindow?.webContents.send('menu:ask-notes'),
        },
        { type: 'separator' },
        // 与应用内的「智能」菜单保持一致：按功能命名，每项打开该功能的设置
        {
          label: '写作助手…',
          accelerator: 'Cmd+Shift+M',
          click: () => openDialogInMain('ai-config'),
        },
        {
          label: '相关笔记…',
          click: () => openDialogInMain('semantic-config'),
        },
        {
          label: '实时转写…',
          click: () => openDialogInMain('transcribe-config'),
        },
        { type: 'separator' },
        {
          label: 'AI 配图…',
          click: () => openDialogInMain('image-config'),
        },
        { type: 'separator' },
        {
          label: '本机资源…',
          click: () => openDialogInMain('resources'),
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
          click: () => openDialogInMain('shortcuts'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  // 只有打包后的正式应用才去登记 iml:// ：开发时登记的话，系统会把这个协议绑到通用的 Electron 程序上
  if (app.isPackaged) app.setAsDefaultProtocolClient(APP_URL_SCHEME);
  // 冒烟测试：IML_SMOKE_URL 模拟系统递进来一个链接
  if (isDev && process.env.IML_SMOKE_URL) { const action = parseAppUrl(process.env.IML_SMOKE_URL); if (action) pendingAppUrls.push(action); }

  // 0. 本地图片协议
  try {
    handleAssetProtocol();
  } catch (err) {
    console.error('Failed to register asset protocol:', err);
  }

  // 1. 注册核心 IPC 句柄
  const history = new NoteHistory(path.join(getPaths().userDataPath, 'history'));
  try {
    setupFileSystemIPC({ history });
  } catch (err) {
    console.error('Failed to setup FileSystem IPC:', err);
  }

  // 快速捕获：全局快捷键 + 小输入窗，把一句话追加到今天的日记
  try {
    quickCapture = setupQuickCapture({ getSettings: getAppSettings, getMainWindow: () => mainWindow, history, smokeHidden: isDev && process.env.IML_SMOKE_OFFSCREEN === '1' });
  } catch (err) {
    console.error('Failed to setup quick capture:', err);
  }

  // 版本历史
  ipcMain.handle('history:list', (_event, filePath: string) => history.list(String(filePath || '')));
  ipcMain.handle('history:read', (_event, filePath: string, id: string) => history.read(String(filePath || ''), String(id || '')));
  
  // AI Config IPC
  ipcMain.handle('ai:getConfig', () => getConfig());
  // semantic 字段由语义索引模块自己维护；配置弹窗里那份可能是打开时的旧值，保存时以磁盘上的为准
  ipcMain.handle('ai:saveConfig', (_event, config) => saveConfig({ ...config, semantic: getConfig().semantic }));

  // 本机模型（编辑器托管的 llama-server）：硬件信息、运行时安装、模型下载、进程管理
  try {
    setupLocalModel({ getConfig, saveConfig });
  } catch (err) {
    console.error('Failed to setup local model IPC:', err);
  }

  // 语义索引（本机嵌入模型）：相关笔记与语义搜索
  try {
    setupSemantic({ getConfig, saveConfig, searchIndex, isAiEnabled: () => getAppSettings().aiEnabled !== false });
  } catch (err) {
    console.error('Failed to setup semantic index:', err);
  }

  // 实时转写：下载识别组件、托管识别进程、转发音频与文字
  try {
    setupAsr({ isAiEnabled: () => getAppSettings().aiEnabled !== false });
    setupResources(path.join(app.getPath('userData'), 'resources.json'));
    setupImageGen();
  } catch (err) {
    console.error('Failed to setup transcription:', err);
  }

  // 被信号结束（终端 Ctrl+C、系统关机时的 SIGTERM）也走正常退出流程，否则 before-quit 不触发，子进程会变成孤儿
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => app.quit());

  // 退出时带走托管的子进程（对话服务 + 嵌入服务）
  let quitting = false;
  app.on('before-quit', (event) => {
    // 先问、再收拾：用户选「回去保存」的话，识别进程和模型服务都得原样留着
    if (!confirmDiscardTranscript(mainWindow)) { event.preventDefault(); return; }
    stopAsr();   // 识别进程是 utilityProcess，同步杀掉即可
    if (quitting || (!isLocalServerActive() && !isSemanticServerActive())) return;
    quitting = true;
    event.preventDefault();
    Promise.allSettled([stopLocalServer(), stopSemanticServer(), stopImageServer()]).finally(() => app.quit());
  });

  // 测试连接：按表单里的（未保存的）配置发一条极短的对话，返回耗时
  ipcMain.handle('ai:testConnection', async (_event, cfg: { protocol?: string; endpoint?: string; apiKey?: string; model?: string }) => {
    const endpoint = (cfg?.endpoint || '').replace(/\/$/, '');
    if (!endpoint) throw new Error('请先填写服务地址');
    const protocol: 'openai' | 'anthropic' = cfg?.protocol === 'anthropic' ? 'anthropic' : 'openai';
    const apiKey = cfg?.apiKey || '';
    if (protocol === 'anthropic' && !apiKey) throw new Error('Anthropic 协议需要 API Key');
    const model = cfg?.model || (protocol === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o');
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const url = protocol === 'anthropic' ? `${endpoint}/messages` : `${endpoint}/chat/completions`;
      const body = protocol === 'anthropic'
        ? { model, max_tokens: 16, messages: [{ role: 'user', content: '用一个词回答：你好' }] }
        : { model, max_tokens: 16, messages: [{ role: 'user', content: '用一个词回答：你好' }], stream: false };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(protocol, apiKey) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error?.message || data.message || `HTTP ${resp.status}`);
      const reply = protocol === 'anthropic'
        ? String(data.content?.map((c: any) => c.text || '').join('') || '')
        : String(data.choices?.[0]?.message?.content || '');
      return { ok: true, latencyMs: Date.now() - started, reply: reply.trim(), endpoint, model };
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('连接超时（30 秒）');
      throw new Error(err.message || String(err));
    } finally {
      clearTimeout(timer);
    }
  });

  // ── 笔记库目录监听：外部（同步盘 / 其他编辑器）改动 → 通知渲染进程刷新树、重载未修改的标签页 ──
  ipcMain.handle('library:watch', (_event, dirPath: string) => {
    if (libraryWatcher) {
      libraryWatcher.close();
      libraryWatcher = null;
    }
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    try {
      libraryWatcher = fs.watch(dirPath, { recursive: true }, (_type, filename) => {
        if (!filename) return;
        const rel = filename.toString();
        // 用户的 CSS 片段在隐藏目录里，单独通知一声：保存它就立刻生效
        if (/^\.iml[\\/]snippets\.css$/.test(rel)) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('snippets:changed'); return; }
        // 隐藏文件（.DS_Store、同步盘的临时文件等）不触发
        if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) return;
        libraryChanged.add(path.join(dirPath, rel));
        if (libraryChangeTimer) clearTimeout(libraryChangeTimer);
        libraryChangeTimer = setTimeout(async () => {
          const paths = [...libraryChanged];
          libraryChanged.clear();
          await searchIndex.refresh(paths).catch(() => {});
          void syncSemanticIndex();
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:changed', paths);
        }, 400);
      });
      libraryWatcher.on('error', (err) => console.warn('[library:watch]', err));
      // 监听开始的同时后台建索引
      // 建完要说一声：日记月历、快速打开这些都是挂载时问一次 listNotes，冷启动时索引还没建好，不吭声它们就一直是空的
      searchIndex.build(dirPath).then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:indexed', searchIndex.status());
        return syncSemanticIndex();
      }).catch((err) => console.warn('[search] index build failed:', err));
      return true;
    } catch (err) {
      console.warn('[library:watch] failed:', err);
      return false;
    }
  });

  // ── 全文搜索 ──
  ipcMain.handle('search:query', (_event, query: string, limit?: number) => searchIndex.search(String(query || ''), limit));
  ipcMain.handle('search:status', () => searchIndex.status());
  ipcMain.handle('search:listNotes', () => searchIndex.listNotes());
  ipcMain.handle('search:backlinks', (_event, nameOrPath: string) => searchIndex.backlinks(String(nameOrPath || '')));
  // 用系统默认应用打开笔记库里的附件（嵌入的 PDF 卡片上的「打开」）。只认库里的、已经进了索引的附件，别的路径一律不开
  ipcMain.handle('search:openAttachment', async (_event, filePath: string) => {
    const target = searchIndex.knownAttachment(String(filePath || ''));
    if (!target) return false;
    return (await shell.openPath(target)) === '';
  });
  ipcMain.handle('search:findAttachment', (_event, name: string, fromDir?: string | null) => searchIndex.findAttachment(String(name || ''), fromDir ? String(fromDir) : null));
  ipcMain.handle('search:tasks', (_event, includeDone?: boolean) => searchIndex.listTasks(!!includeDone));
  ipcMain.handle('search:unlinkedMentions', (_event, filePath: string) => searchIndex.unlinkedMentions(String(filePath || '')));
  ipcMain.handle('search:tags', () => searchIndex.listTags());
  ipcMain.handle('search:notesByTag', (_event, tag: string) => searchIndex.notesByTag(String(tag || '')));

  // ── 图片整理：找出没有任何笔记引用的图片；确认后移入废纸篓（可恢复）──
  ipcMain.handle('library:findOrphanImages', (_event, extraTexts?: string[]) => {
    const root = searchIndex.status().root;
    if (!root) return [];
    return findOrphanImages(root, Array.isArray(extraTexts) ? extraTexts.map(String) : []);
  });
  ipcMain.handle('library:trashImages', async (_event, paths: string[]) => {
    const root = searchIndex.status().root;
    if (!root || !Array.isArray(paths)) return { trashed: 0, failed: [] as string[] };
    const failed: string[] = [];
    let trashed = 0;
    for (const p of filterTrashable(root, paths)) {
      try { await shell.trashItem(p); trashed++; } catch { failed.push(p); }
    }
    return { trashed, failed };
  });

  // 粘贴链接时取网页标题
  ipcMain.handle('web:fetchTitle', (_event, url: string) => fetchPageTitle(String(url || '')));

  // 本机装了哪些同步盘：设置里给出「一键把笔记库放进去」。只看、不建目录——用户选了才建
  ipcMain.handle('app:detectSyncFolders', () => {
    const home = app.getPath('home');
    const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    const found: { id: string; name: string; root: string; libraryPath: string; libraryExists: boolean }[] = [];
    const add = (id: string, name: string, root: string) => {
      if (found.some((f) => f.id === id) || !isDir(root)) return;
      const libraryPath = path.join(root, SYNC_LIBRARY_NAME);
      found.push({ id, name, root, libraryPath, libraryExists: isDir(libraryPath) });
    };
    for (const c of syncFolderCandidates(process.platform)) add(c.id, c.name, path.join(home, ...c.rel));
    if (process.platform === 'darwin') {
      const cloudStorage = path.join(home, 'Library', 'CloudStorage');
      let dirs: string[] = [];
      try { dirs = fs.readdirSync(cloudStorage); } catch { dirs = []; }
      for (const dir of dirs) {
        if (dir.startsWith('.')) continue;
        const { id, name } = labelCloudStorageDir(dir);
        add(id, name, path.join(cloudStorage, dir));
      }
    }
    return found;
  });

  // 应用默认的笔记库目录（文稿/iML Notes）：从同步盘「改回原来的目录」时的兜底
  ipcMain.handle('app:homeLibraryPath', () => {
    const p = path.join(app.getPath('documents'), 'iML Notes');
    let exists = false;
    try { exists = fs.statSync(p).isDirectory(); } catch { exists = false; }
    return { path: p, exists };
  });

  // 设置窗口请求清空会话 → 由主窗口执行（会话只存在于主窗口的 localStorage）
  ipcMain.on('app:clearSession', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('session:clear');
  });

  // 拉取模型列表：兼容 OpenAI /models 与 Anthropic /models；本地 Ollama / LM Studio 无需 Key
  ipcMain.handle('ai:listModels', async (_event, { endpoint, apiKey, protocol }: { endpoint: string; apiKey: string; protocol: string }) => {
    const base = (endpoint || '').replace(/\/$/, '');
    if (!base) throw new Error('请先填写服务地址');
    const headers = buildAuthHeaders(protocol === 'anthropic' ? 'anthropic' : 'openai', apiKey || '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(`${base}/models`, { headers, signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: any = await resp.json();
      const list: any[] = Array.isArray(data) ? data : (data.data || data.models || []);
      return list.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('连接超时，确认服务已启动、地址填对了');
      throw new Error(`拿不到模型列表：${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  });
  
  // 新特性介绍：记录用户最后看过哪个版本的介绍（单独一个小文件，不随设置整体覆盖）
  const whatsNewPath = () => path.join(getPaths().userDataPath, 'whats-new.json');
  ipcMain.handle('app:getWhatsNewState', () => {
    let lastSeen: string | null = null;
    try { lastSeen = JSON.parse(fs.readFileSync(whatsNewPath(), 'utf8')).lastSeenVersion || null; } catch { /* 首次安装 */ }
    return { current: app.getVersion(), lastSeen };
  });
  ipcMain.handle('app:markWhatsNewSeen', () => {
    try { fs.writeFileSync(whatsNewPath(), JSON.stringify({ lastSeenVersion: app.getVersion(), seenAt: Date.now() }), 'utf8'); } catch (err) { console.warn('[whats-new] write failed', err); }
    return true;
  });

  // App Settings IPC
  ipcMain.handle('app:getSettings', () => getAppSettings());
  ipcMain.handle('app:saveSettings', (_event, settings) => {
    const result = saveAppSettings(settings);
    if (result.success) applySpellcheck(!!getAppSettings().spellcheck);
    // 快速捕获的开关或快捷键变了：重新注册全局快捷键
    if (result.success && settings && 'quickCapture' in settings) quickCapture?.apply();
    // AI 总开关：关掉就把嵌入服务停了；重新打开则补上期间落下的索引
    if (result.success && settings && 'aiEnabled' in settings) {
      if (settings.aiEnabled === false) void stopSemanticServer();
      else void syncSemanticIndex();
    }
    if (result.success && mainWindow) {
      mainWindow.webContents.send('settings:changed', settings);
    }
    return result;
  });

  // 2. 环境设置
  // Create standard macOS menu
  setupAppMenu();

  // 仅开发模式手动设置 Dock 图标；打包后由 .icns 提供。
  // 运行时用满幅 logo.png 覆盖会丢掉 macOS 图标的标准留白，导致 Dock 里比其他应用图标大一圈。
  if (isDev && process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(path.join(process.cwd(), 'assets/icon-mac.png'));
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

  // temperature：整理纪要、问笔记这类「照着材料写」的任务传一个低温度，小模型才守规矩；不传就用服务端默认值（写作要有变化）
  ipcMain.on('ai:chat', async (event, { messages, requestId, maxTokens, temperature }) => {
    const sampling = typeof temperature === 'number' ? { temperature } : {};
    let localWork = false;
    // 界面上的 AI 入口已经随总开关隐藏；这里再兜一道，保证关掉之后真的不发请求
    if (getAppSettings().aiEnabled === false) {
      event.sender.send(`ai:chat-error-${requestId}`, AI_DISABLED);
      return;
    }
    const config = getConfig();
    let apiKey: string = config.apiKey || '';
    let endpoint = (config.endpoint || '').replace(/\/$/, '');
    let model = config.model || 'gpt-4o';
    let protocol: 'openai' | 'anthropic' = config.protocol || 'openai';

    // 本机模型：请求只发往 127.0.0.1 上由编辑器托管的 llama-server；没启动就先拉起来
    if (isBuiltinService(config)) {
      const hint = builtinNotReadyHint();
      if (hint) {
        event.sender.send(`ai:chat-error-${requestId}`, hint);
        return;
      }
      try {
        const local = await ensureBuiltinEndpoint();
        scheduler.beginWork('chat');
        localWork = true;
        endpoint = local.endpoint;
        model = local.model;
        protocol = 'openai';
        apiKey = '';
      } catch (err: any) {
        event.sender.send(`ai:chat-error-${requestId}`, `本机模型：${err?.message || err}`);
        return;
      }
    }

    if (!endpoint) {
      event.sender.send(`ai:chat-error-${requestId}`, '请先到「智能 → 写作助手」填写服务地址');
      return;
    }
    if (protocol === 'anthropic' && !apiKey) {
      event.sender.send(`ai:chat-error-${requestId}`, 'Anthropic 协议需要 API Key，到「智能 → 写作助手」里填');
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
          headers: { 'Content-Type': 'application/json', ...buildAuthHeaders('anthropic', apiKey) },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens || 8192,
            ...sampling,
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
          headers: { 'Content-Type': 'application/json', ...buildAuthHeaders('openai', apiKey) },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...sampling,
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || errorData.message || `模型服务返回错误（${response.status}）`;
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
        event.sender.send(`ai:chat-error-${requestId}`, `网络错误：${err.message}`);
      }
    } finally {
      aiAbortControllers.delete(requestId);
      if (localWork) scheduler.endWork('chat');
    }
  });

  ipcMain.on('open-about', () => openDialogInMain('about'));
  ipcMain.on('open-shortcuts', () => openDialogInMain('shortcuts'));
  ipcMain.on('open-ai-config', () => openDialogInMain('ai-config'));
  ipcMain.on('open:image-config', () => openDialogInMain('image-config'));
  ipcMain.on('open:settings', () => openDialogInMain('settings'));

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
      
      return describeRelease(await response.json(), process.platform, process.arch);
    } catch (err: any) {
      console.error('Update check failed:', err);
      return { success: false, error: '连不上更新服务器，检查一下网络' };
    }
  });

  // ── AI 图片生成（插入图片对话框 / AI 气泡「AI 配图」模式）──────────────────
  ipcMain.handle(
    'ai:generateImage',
    async (event, { prompt, config: cfg }: { prompt: string; config: any }): Promise<{ url: string }[]> => {
      function bufToDataUrl(buf: Buffer, mimeType: string): string {
        return `data:${mimeType};base64,${buf.toString('base64')}`;
      }

      /**
       * 服务商报错统一成一句人话。原始回包写进日志，不糊到界面上：
       * 状态栏那一行放不下 200 字的 JSON，看见了也不知道该做什么
       */
      function providerError(who: string, what: string, raw?: unknown): Error {
        if (raw) console.warn(`[image] ${who} 原始回包：`, String(raw).slice(0, 600));
        return new Error(`${who}${what}`);
      }

      /** 按文件头认图片格式；认不出来按 PNG（data URL 的 MIME 决定落盘时的扩展名） */
      function sniffImageMime(buf: Buffer): string {
        if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
        if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
        if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
        if (buf.length >= 6 && /^GIF8[79]a/.test(buf.toString('ascii', 0, 6))) return 'image/gif';
        return 'image/png';
      }

      function assertAsciiHeader(value: string, label: string) {
        for (let i = 0; i < value.length; i++) {
          if (value.charCodeAt(i) > 127) {
            throw new Error(`${label} 里有中文或特殊字符（第 ${i + 1} 个字），请检查是不是复制多了`);
          }
        }
      }

      // 提前校验 Header 值，避免 Node http 遇到非 ASCII 时抛出难懂的错误
      assertAsciiHeader(cfg.apiKey || '', 'API Key');
      if (cfg.endpoint) assertAsciiHeader(cfg.endpoint, '端点 URL');

      const results: { url: string }[] = [];

      if (cfg.provider === 'local') {
        // 本机生图：走调度（24 GB 以下先停对话模型）、按需起 sd-server
        for (const url of await generateLocalImage(prompt, cfg, event.sender)) results.push({ url });
      } else if (cfg.provider === 'agnes-cn' || cfg.provider === 'agnes') {
        // Agnes：OpenAI 兼容的 /images/generations；国内站与国际站只是域名不同（与写作助手里的 Base URL 同源）
        const site = cfg.provider === 'agnes-cn' ? '国内站' : '国际站';
        const base = cfg.provider === 'agnes-cn' ? 'https://api.agnes-ai.cn/v1' : 'https://apihub.agnes-ai.com/v1';
        const model = cfg.model || 'agnes-image-2.0-flash';
        const { status, text: rawText } = await nodePost(
          `${base}/images/generations`,
          JSON.stringify({ model, prompt, n: 1 }),
          { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        );
        let data: any = null;
        try { data = JSON.parse(rawText); } catch { /* 下面按状态码报错 */ }
        if (status < 200 || status >= 300) throw providerError(`Agnes ${site}`, `拒绝了请求（HTTP ${status}）${data?.error?.message ? `：${data.error.message}` : ''}`, rawText);
        if (!data) throw providerError(`Agnes ${site}`, '返回的内容看不懂，检查一下服务地址', rawText);
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        // 回执按 OpenAI 形状为主（data[].url / b64_json），也认几种见过的变体
        const items: any[] = Array.isArray(data.data) ? data.data : Array.isArray(data.output) ? data.output : Array.isArray(data.results) ? data.results : [];
        for (const item of items) {
          const b64 = item?.b64_json || item?.base64;
          const url = typeof item === 'string' ? item : item?.url || item?.image_url;
          if (b64) results.push({ url: bufToDataUrl(Buffer.from(b64, 'base64'), 'image/png') });
          else if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            const buf = await nodeGetBuffer(url);
            results.push({ url: bufToDataUrl(buf, sniffImageMime(buf)) });
          }
        }
        if (results.length === 0) throw providerError(`Agnes ${site}`, `没有返回图片（${model}），换个模型或稍后再试`, rawText);
      } else if (cfg.provider === 'gemini' || cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash') {
        // 未指定模型时默认走 Imagen，与「图片生成配置」界面默认高亮的选项一致
        const useImagen = cfg.provider === 'gemini-imagen'
          || (cfg.provider !== 'gemini-flash' && (!cfg.model || cfg.model.includes('imagen')));
        const model = cfg.model || (useImagen ? 'imagen-4.0-generate-001' : 'gemini-2.0-flash-exp-image-generation');
        if (useImagen) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${cfg.apiKey}`;
          const { status, text: rawText } = await nodePost(url, JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '16:9' },
          }), { 'Content-Type': 'application/json' });
          if (status < 200 || status >= 300 || !rawText) throw providerError('Gemini Imagen', `拒绝了请求（HTTP ${status}）`, rawText);
          let data: any;
          try { data = JSON.parse(rawText); } catch { throw providerError('Gemini Imagen', '返回的内容看不懂', rawText); }
          if (!data.predictions?.length) throw providerError('Gemini Imagen', data.error?.message ? `：${data.error.message}` : '没有返回图片，换个模型或稍后再试', rawText);
          for (const pred of data.predictions) {
            const b64 = pred.bytesBase64Encoded;
            if (!b64) continue;
            results.push({ url: bufToDataUrl(Buffer.from(b64, 'base64'), 'image/png') });
          }
        } else {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
          const { status, text: rawText } = await nodePost(url, JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 1.0 },
          }), { 'Content-Type': 'application/json' });
          if (status < 200 || status >= 300) throw providerError('Gemini Flash', `拒绝了请求（HTTP ${status}）`, rawText);
          let data: any;
          try { data = JSON.parse(rawText); } catch { throw providerError('Gemini Flash', '返回的内容看不懂', rawText); }
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
          const parts: any[] = data.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/jpeg';
              results.push({ url: bufToDataUrl(Buffer.from(part.inlineData.data, 'base64'), mime) });
              break;
            }
          }
          if (results.length === 0) throw providerError('Gemini Flash', `没有返回图片（${model}），换个模型或稍后再试`);
        }
      } else if (cfg.provider === 'minimax') {
        const { status, text: rawText } = await nodePost(
          'https://api.minimaxi.com/v1/image_generation',
          JSON.stringify({ model: cfg.model || 'image-01', prompt, response_format: 'url', n: 1, aspect_ratio: '16:9', prompt_optimizer: false }),
          { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        );
        if (status < 200 || status >= 300) throw providerError('MiniMax', `拒绝了请求（HTTP ${status}）`, rawText);
        let data: any;
        try { data = JSON.parse(rawText); } catch { throw providerError('MiniMax', '返回的内容看不懂', rawText); }
        if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
          throw new Error(data.base_resp.status_msg || `MiniMax 错误码 ${data.base_resp.status_code}`);
        }
        const imageUrls: string[] = data.data?.image_urls || [];
        if (imageUrls.length === 0) throw providerError('MiniMax', '没有返回图片，换个模型或稍后再试', rawText);
        for (const imageUrl of imageUrls) {
          results.push({ url: bufToDataUrl(await nodeGetBuffer(imageUrl), 'image/jpeg') });
        }
      } else if (cfg.provider === 'volcengine') {
        const model = cfg.model || 'doubao-seedream-5-0-260128';
        const { status, text: rawText } = await nodePost(
          'https://ark.cn-beijing.volces.com/api/v3/images/generations',
          JSON.stringify({ model, prompt, size: '2560x1440', n: 1, response_format: 'url' }),
          { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        );
        if (status < 200 || status >= 300) throw providerError('火山引擎', `拒绝了请求（HTTP ${status}）`, rawText);
        let data: any;
        try { data = JSON.parse(rawText); } catch { throw providerError('火山引擎', '返回的内容看不懂', rawText); }
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        const items: any[] = data.data || [];
        if (items.length === 0) throw providerError('火山引擎', '没有返回图片，换个模型或稍后再试', rawText);
        for (const item of items) {
          if (item.b64_json) {
            results.push({ url: bufToDataUrl(Buffer.from(item.b64_json, 'base64'), 'image/png') });
          } else if (item.url) {
            results.push({ url: bufToDataUrl(await nodeGetBuffer(item.url), 'image/png') });
          }
        }
      } else if (cfg.provider === 'custom' && cfg.endpoint) {
        const { text: rawText } = await nodePost(
          cfg.endpoint,
          JSON.stringify({ model: cfg.model, prompt, n: 1 }),
          { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        );
        let data: any;
        try { data = JSON.parse(rawText); } catch { throw providerError('这个接口', '返回的内容看不懂，检查一下服务地址', rawText); }
        const imgs: any[] = data.data || data.images || data.output || [];
        for (const img of imgs) {
          const b64 = img.b64_json || img.base64;
          if (b64) {
            results.push({ url: bufToDataUrl(Buffer.from(b64, 'base64'), 'image/png') });
          } else if (img.url) {
            results.push({ url: bufToDataUrl(await nodeGetBuffer(img.url), 'image/png') });
          }
        }
      } else {
        throw new Error(`还没选好配图服务，到「智能 → AI 配图」里选一个并填 Key`);
      }

      if (results.length === 0) {
        throw new Error('没有生成出图片，检查 API Key 或换个模型');
      }
      return results;
    },
  );

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

// 全局快捷键是系统级的，退出时要还回去
app.on('will-quit', () => quickCapture?.dispose());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
