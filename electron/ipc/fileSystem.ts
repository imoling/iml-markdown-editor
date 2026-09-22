import { ipcMain, dialog, BrowserWindow, shell, nativeImage, clipboard } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NoteHistory } from '../history';
import { assetFileName, IMAGE_EXT_RE, AUDIO_EXT_RE } from '../assets';
import { planTiles, planRanges, maxImageHeight, numberedPath } from '../shared/imageTiles';
import { BRAND_CSS, brandFooterHtml, brandBand } from '../shared/imageBrand';
import { exportDocument } from '../shared/exportDoc';

/** 长图：固定成手机上好读的宽度，四周留白；滚动条不能截进图里 */
const IMAGE_CSS_WIDTH = 750;
const IMAGE_SCALE = 2;
const IMAGE_VIEW_HEIGHT = 4000;
const IMAGE_EXTRA_CSS = `
  html, body { margin: 0; background: #fff; }
  body { width: ${IMAGE_CSS_WIDTH}px; max-width: none; box-sizing: border-box; padding: 40px 44px 48px; }
  ::-webkit-scrollbar { display: none; }
${BRAND_CSS}`;

/** 角标里的小 logo：应用图标缩到 40 像素（图里显示 20 个 CSS 像素 × 2 倍），转成 data: 地址内联。取不到就不放图 */
let brandLogoDataUrl: string | null | undefined;
function brandLogo(): string | null {
  if (brandLogoDataUrl === undefined) {
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/logo.png'));
      brandLogoDataUrl = icon.isEmpty() ? null : icon.resize({ width: 40, height: 40 }).toDataURL();
    } catch {
      brandLogoDataUrl = null;
    }
  }
  return brandLogoDataUrl;
}

/**
 * 保存到哪。正式使用时问用户；开发时的冒烟测试（IML_SMOKE_EXPORT_DIR）直接存进指定目录——系统的保存对话框没法自动化。
 */
async function askSavePath(window: BrowserWindow, defaultName: string, filter: { name: string; extensions: string[] }): Promise<string | null> {
  const smokeDir = process.env.NODE_ENV === 'development' ? process.env.IML_SMOKE_EXPORT_DIR : '';
  if (smokeDir) return path.join(smokeDir, path.basename(defaultName));
  const res = await dialog.showSaveDialog(window, { defaultPath: defaultName, filters: [filter] });
  return res.canceled || !res.filePath ? null : res.filePath;
}

/**
 * 这次运行里导出过的文件。状态栏提示上的「打开 / 在访达中显示」只认这里面的路径——渲染层不能拿任意路径来让系统打开。
 */
const exportedFiles = new Set<string>();
function rememberExported(...files: string[]) {
  for (const f of files) exportedFiles.add(path.normalize(f));
}
/** 打开导出的文件（系统默认应用）或在访达 / 资源管理器里选中它。冒烟测试时不真开，记到导出目录的 .opened.log 里供脚本核对 */
async function openExported(target: string, how: 'open' | 'reveal'): Promise<boolean> {
  const file = path.normalize(String(target || ''));
  if (!exportedFiles.has(file)) return false;
  const smokeDir = process.env.NODE_ENV === 'development' ? process.env.IML_SMOKE_EXPORT_DIR : '';
  if (smokeDir) { await fs.promises.appendFile(path.join(smokeDir, '.opened.log'), `${how} ${file}\n`); return true; }
  if (how === 'reveal') { shell.showItemInFolder(file); return true; }
  return (await shell.openPath(file)) === '';
}


const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff' };

/** 单文件 HTML：把本地图片读进来内联成 data URL，拷到哪里都能看 */
async function inlineLocalImages(html: string, baseDir: string): Promise<string> {
  const srcs = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)) srcs.add(m[1]);
  let out = html;
  for (const src of srcs) {
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    let rel = src.replace(/&amp;/g, '&');
    try { rel = decodeURI(rel); } catch { /* 保持原样 */ }
    if (/^file:\/\//i.test(rel)) rel = rel.replace(/^file:\/\//i, '');
    const abs = path.isAbsolute(rel) ? rel : path.join(baseDir, rel);
    if (!IMAGE_EXT_RE.test(abs)) continue;
    try {
      const stat = await fs.promises.stat(abs);
      if (stat.size > 12 * 1024 * 1024) continue;
      const mime = MIME[path.extname(abs).slice(1).toLowerCase()] || 'application/octet-stream';
      const data = (await fs.promises.readFile(abs)).toString('base64');
      out = out.split(`src="${src}"`).join(`src="data:${mime};base64,${data}"`);
    } catch { /* 找不到的图片保持原地址 */ }
  }
  return out;
}

export interface FileSystemDeps {
  history?: NoteHistory;
}

export function setupFileSystemIPC(deps: FileSystemDeps = {}) {
  const { history } = deps;
  // Open dialog to select an existing file or directory
  ipcMain.handle('dialog:open', async (event, options?: Electron.OpenDialogOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    // 冒烟测试：系统的文件选择框自动化点不了，IML_SMOKE_PICK=/path/to/file 让它直接「选中」这个文件（只在开发模式生效）
    if (process.env.NODE_ENV === 'development' && process.env.IML_SMOKE_PICK) return [process.env.IML_SMOKE_PICK];

    const result = await dialog.showOpenDialog(window, {
      ...options,
      properties: options?.properties || ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths;
  });

  // Save dialog
  ipcMain.handle('dialog:save', async (event, options?: Electron.SaveDialogOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showSaveDialog(window, {
      ...options,
      filters: options?.filters || [{ name: 'Markdown', extensions: ['md'] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  // Read file content
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const normalizedPath = path.normalize(filePath);
      const content = await fs.promises.readFile(normalizedPath, 'utf-8');
      return { success: true, content, filePath: normalizedPath };
    } catch (error: any) {
      console.error('Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  // Save an image buffer to disk relative to the active file
  ipcMain.handle('fs:saveImage', async (_, activeFilePath: string, fileName: string, buffer: ArrayBuffer) => {
    try {
      let dirPath: string;
      if (activeFilePath.startsWith('new-')) {
        dirPath = process.cwd();
      } else {
        dirPath = path.dirname(path.normalize(activeFilePath));
      }
      
      const assetsDir = path.join(dirPath, 'assets');
      if (!fs.existsSync(assetsDir)) {
         await fs.promises.mkdir(assetsDir, { recursive: true });
      }
      
      // 剪贴板截图统一叫 image.png：换成时间戳名；空格等字符换掉，Markdown 地址里不用转义
      const safeName = assetFileName(fileName);
      let uniqueName = safeName;
      let counter = 1;
      while (fs.existsSync(path.join(assetsDir, uniqueName))) {
        const ext = path.extname(safeName);
        const nameWithoutExt = path.basename(safeName, ext);
        uniqueName = `${nameWithoutExt}-${counter}${ext}`;
        counter++;
      }
      
      const fullPath = path.join(assetsDir, uniqueName);
      const data = Buffer.from(buffer);
      await fs.promises.writeFile(fullPath, data);
      // Return relative path for markdown
      return { success: true, path: `assets/${uniqueName}`, bytes: data.length };
    } catch (error: any) {
      console.error('Error saving image:', error);
      return { success: false, error: error.message };
    }
  });

  // 实时转写的录音：存到笔记旁边的 assets/。同一场转写再存一次是覆盖（停了又继续录，录音变长了），所以不加序号
  ipcMain.handle('fs:saveRecording', async (_, noteDir: string, fileName: string, buffer: ArrayBuffer) => {
    try {
      const safeName = path.basename(fileName).replace(/[\\/:*?"<>|#%()[\]\s]+/g, '-');
      if (!path.isAbsolute(noteDir) || !AUDIO_EXT_RE.test(safeName)) return { success: false, error: '录音的保存位置不对' };
      const assetsDir = path.join(path.normalize(noteDir), 'assets');
      await fs.promises.mkdir(assetsDir, { recursive: true });
      const data = Buffer.from(buffer);
      await fs.promises.writeFile(path.join(assetsDir, safeName), data);
      return { success: true, path: `assets/${safeName}`, bytes: data.length };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 转写一段已有的录音：把原文件拷到笔记旁边的 assets/，笔记里的播放器才有一个跟着笔记走的相对地址。
  // 在主进程里直接拷，不让上百 MB 的音频从渲染进程的内存里过一遍
  ipcMain.handle('fs:copyRecording', async (_, noteDir: string, srcPath: string, fileName: string) => {
    try {
      const safeName = path.basename(fileName).replace(/[\\/:*?"<>|#%()[\]\s]+/g, '-');
      if (!path.isAbsolute(noteDir) || !path.isAbsolute(srcPath) || !AUDIO_EXT_RE.test(safeName) || !AUDIO_EXT_RE.test(srcPath)) return { success: false, error: '录音的保存位置不对' };
      const assetsDir = path.join(path.normalize(noteDir), 'assets');
      await fs.promises.mkdir(assetsDir, { recursive: true });
      const dest = path.join(assetsDir, safeName);
      if (path.resolve(dest) !== path.resolve(srcPath)) await fs.promises.copyFile(srcPath, dest);
      return { success: true, path: `assets/${safeName}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Write file content
  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      const normalizedPath = path.normalize(filePath);
      // 版本历史：覆盖前先给磁盘上的现状留底，写完再记新版本。历史出任何问题都不能挡住保存
      await history?.beforeOverwrite(normalizedPath, content).catch((err) => console.warn('[history] beforeOverwrite failed:', err));
      await fs.promises.writeFile(normalizedPath, content, 'utf-8');
      await history?.record(normalizedPath, content, 'save').catch((err) => console.warn('[history] record failed:', err));
      return { success: true, filePath: normalizedPath };
    } catch (error: any) {
      console.error('Error writing file:', error);
      return { success: false, error: error.message };
    }
  });

  // Export to PDF
  ipcMain.handle('export:pdf', async (event, htmlContent: string, defaultPath: string, activeFilePath: string) => {
    try {
       const window = BrowserWindow.fromWebContents(event.sender);
       if (!window) return { success: false, error: 'No window found' };
       
       const target = await askSavePath(window, defaultPath.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.pdf', { name: 'PDF Document', extensions: ['pdf'] });
       if (!target) return { success: false, canceled: true };
       
       const dirPath = !activeFilePath.startsWith('new-') ? path.dirname(activeFilePath) : os.homedir();
       const baseHref = `file:///${dirPath.replace(/\\/g, '/').replace(/^\//, '')}/`;

       const printWindow = new BrowserWindow({ 
         show: false, 
         webPreferences: { 
           nodeIntegration: false, 
           contextIsolation: true 
         } 
       });
       
       // data: 页面是不透明来源，加载不了 file:// 图片；写成临时文件再用 file:// 打开，<base> 指向笔记所在目录
       const tmpFile = path.join(os.tmpdir(), `iml-export-${Date.now()}.html`);
       await fs.promises.writeFile(tmpFile, exportDocument(htmlContent, path.basename(defaultPath), baseHref), 'utf8');
       try {
         await printWindow.loadFile(tmpFile);
       } finally {
         fs.promises.unlink(tmpFile).catch(() => {});
       }
       
       // 图片、字体到位了再打印（公式的字体是内联在页面里的，也要等它解码完）；最多等 6 秒，坏掉的图不能把导出卡死
       await printWindow.webContents.executeJavaScript(`Promise.race([
         Promise.all([document.fonts ? document.fonts.ready : null, ...Array.from(document.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))]),
         new Promise((r) => setTimeout(r, 6000)),
       ]).then(() => true)`).catch(() => {});

       const pdfBuffer = await printWindow.webContents.printToPDF({
          printBackground: true,
          margins: { top: 1, bottom: 1, left: 1, right: 1 }
       });
       
       await fs.promises.writeFile(target, pdfBuffer);
       printWindow.close();
       rememberExported(target);
       return { success: true, path: target };
    } catch (error: any) {
      console.error("PDF Export Error:", error);
      return { success: false, error: error.message };
    }
  });


  // 渲染层已经生成好的文件（Word 文档）：问用户存哪，写盘
  ipcMain.handle('export:saveFile', async (event, defaultName: string, bytes: Uint8Array, filterName: string, extension: string) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { success: false, error: 'No window found' };
      const ext = String(extension || '').replace(/[^a-z0-9]/gi, '');
      const target = await askSavePath(window, String(defaultName || '未命名').replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.' + ext, { name: String(filterName || ext), extensions: [ext] });
      if (!target) return { success: false, canceled: true };
      await fs.promises.writeFile(target, Buffer.from(bytes));
      rememberExported(target);
      return { success: true, path: target };
    } catch (error: any) {
      console.error('Save export error:', error);
      return { success: false, error: error.message };
    }
  });

  // 导出为长图（PNG）：发群里、发朋友圈用。隐藏的离屏窗口里排好版，一块一块截下来再拼成一张
  ipcMain.handle('export:image', async (event, htmlContent: string, defaultPath: string, activeFilePath: string) => {
    let shotWindow: BrowserWindow | null = null;
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { success: false, error: 'No window found' };
      const target = await askSavePath(window, defaultPath.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.png', { name: 'PNG 图片', extensions: ['png'] });
      if (!target) return { success: false, canceled: true };

      const dirPath = !activeFilePath.startsWith('new-') ? path.dirname(activeFilePath) : os.homedir();
      const baseHref = `file:///${dirPath.replace(/\\/g, '/').replace(/^\//, '')}/`;
      // 先按「每个点 1 个像素」开窗口，加载完量出真实比例后再调整（见下面）
      shotWindow = new BrowserWindow({
        show: false, width: IMAGE_CSS_WIDTH * IMAGE_SCALE, height: IMAGE_VIEW_HEIGHT * IMAGE_SCALE, useContentSize: true, enableLargerThanScreen: true, frame: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: true },
      });
      const tmpFile = path.join(os.tmpdir(), `iml-export-${Date.now()}.html`);
      await fs.promises.writeFile(tmpFile, exportDocument(htmlContent + brandFooterHtml(brandLogo()), path.basename(defaultPath), baseHref, IMAGE_EXTRA_CSS), 'utf8');
      try { await shotWindow.loadFile(tmpFile); } finally { fs.promises.unlink(tmpFile).catch(() => {}); }
      const wc = shotWindow.webContents;
      // 成品要固定 1500 像素宽（750 排版 × 2 倍），不能取决于用户的屏幕：
      // 离屏窗口每个点截出几个像素，Retina 屏是 2、普通屏是 1。先截一小块量出这个比例，再反推窗口大小和页面缩放
      const probe = await wc.capturePage({ x: 0, y: 0, width: 20, height: 20 });
      const density = Math.max(0.5, probe.getSize().width / 20);
      const zoom = IMAGE_SCALE / density;
      shotWindow.setContentSize(Math.round((IMAGE_CSS_WIDTH * IMAGE_SCALE) / density), Math.round((IMAGE_VIEW_HEIGHT * IMAGE_SCALE) / density));
      wc.setZoomFactor(zoom);
      // 图片、字体都到位了再量高度，不然量出来的偏矮；最多等 6 秒，坏掉的图不能把导出卡死
      const measured: { docHeight: number; footerTop: number; cuts: number[] } = await wc.executeJavaScript(`Promise.race([
        Promise.all([document.fonts ? document.fonts.ready : null, ...Array.from(document.images).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))]),
        new Promise((r) => setTimeout(r, 6000)),
      ]).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        // 量正文的实际高度，不能用 scrollHeight：页面比窗口矮时 scrollHeight 是窗口的高度（4000），
        // 短笔记导出来就是一张下面大片空白的长图
        const docHeight = Math.ceil(Math.max(document.documentElement.getBoundingClientRect().height, document.body.getBoundingClientRect().bottom + window.scrollY));
        const brand = document.querySelector('.export-brand');
        const box = brand ? brand.getBoundingClientRect() : null;
        // 分张时可以切的位置：段落、列表项、表格行、代码块这些的底边（文档坐标）
        const cuts = Array.from(document.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, tr, hr, img, figure, blockquote, .callout, .note-embed, .math-block'), (el) => Math.floor(el.getBoundingClientRect().bottom + window.scrollY)).sort((a, b) => a - b);
        // 角标连同它上面的留白（margin-top）一起算进那一条，拼到别的图末尾时正文和角标之间才有同样的距离
        r({ docHeight, cuts, footerTop: box ? Math.floor(box.top + window.scrollY - parseFloat(getComputedStyle(brand).marginTop)) : docHeight });
      }))))`);
      const { docHeight } = measured;
      const band = brandBand(docHeight, measured.footerTop);

      // 截一次页面、按这次截图自己的比例把某一段裁出来（实际像素和 CSS 像素可能不是整数倍关系：系统缩放）
      const captureBand = async (scrollTo: number, topInShot: number, cssHeight: number) => {
        await wc.executeJavaScript(`new Promise((r) => { window.scrollTo(0, ${scrollTo}); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))); })`);
        const shot = await wc.capturePage();
        const size = shot.getSize();
        const ratio = size.height / IMAGE_VIEW_HEIGHT;
        const cropped = shot.crop({ x: 0, y: Math.round(topInShot * ratio), width: size.width, height: Math.max(1, Math.round(cssHeight * ratio)) });
        return { bitmap: cropped.toBitmap(), ...cropped.getSize() };
      };

      // 每张图末尾都要拼上角标那一条，分张时给它留出高度；切在段落边界上，别把一行字切成两半
      const ranges = planRanges(docHeight, maxImageHeight(IMAGE_CSS_WIDTH, IMAGE_SCALE) - band.height, measured.cuts.filter((c) => c < band.top));
      const groups = ranges.map((range) => planTiles(docHeight, IMAGE_VIEW_HEIGHT, range.top, range.top + range.height));
      // 角标那一条单独截一次：最后一张图里它本来就在，前面几张拼到末尾
      const brandScroll = Math.max(0, docHeight - IMAGE_VIEW_HEIGHT);
      const brandStrip = groups.length > 1 && band.height > 0 ? await captureBand(brandScroll, band.top - brandScroll, band.height) : null;
      const saved: string[] = [];
      for (let g = 0; g < groups.length; g++) {
        const strips: Buffer[] = [];
        let width = 0;
        let height = 0;
        for (const tile of groups[g]) {
          const piece = await captureBand(tile.scrollTo, tile.offsetInShot, tile.height);
          if (!strips.length && g > 0) {
            // 后面几张的开头补一段和第一张页顶一样的留白（40 CSS 像素），不然正文顶着图的上边
            const pad = Math.round((piece.height / tile.height) * 40);
            strips.push(Buffer.alloc(piece.width * pad * 4, 0xff));
            height += pad;
          }
          width = piece.width;
          height += piece.height;
          strips.push(piece.bitmap);
        }
        if (brandStrip && g < groups.length - 1 && brandStrip.width === width) {
          strips.push(brandStrip.bitmap);
          height += brandStrip.height;
        }
        // 各块宽度一样，原始位图首尾相接就是一张竖着拼好的图
        const whole = nativeImage.createFromBitmap(Buffer.concat(strips), { width, height });
        const file = numberedPath(target, g, groups.length);
        await fs.promises.writeFile(file, whole.toPNG());
        saved.push(file);
      }
      rememberExported(...saved);
      return { success: true, path: saved[0], paths: saved };
    } catch (error: any) {
      console.error('Image Export Error:', error);
      return { success: false, error: error.message };
    } finally {
      if (shotWindow && !shotWindow.isDestroyed()) shotWindow.destroy();
    }
  });

  // Export to a single-file HTML（图片内联）
  ipcMain.handle('export:html', async (event, htmlContent: string, defaultPath: string, activeFilePath: string) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { success: false, error: 'No window found' };
      const target = await askSavePath(window, defaultPath.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') + '.html', { name: 'HTML', extensions: ['html'] });
      if (!target) return { success: false, canceled: true };
      const dirPath = !activeFilePath.startsWith('new-') ? path.dirname(activeFilePath) : os.homedir();
      const body = await inlineLocalImages(htmlContent, dirPath);
      await fs.promises.writeFile(target, exportDocument(body, path.basename(target, '.html')), 'utf8');
      rememberExported(target);
      return { success: true, path: target };
    } catch (error: any) {
      console.error('HTML Export Error:', error);
      return { success: false, error: error.message };
    }
  });

  // 状态栏「已导出」提示上的两个按钮
  ipcMain.handle('export:open', (_event, target: string) => openExported(target, 'open'));
  // 富文本进剪贴板（复制为公众号格式）：主进程写，不挑窗口焦点
  ipcMain.handle('clipboard:writeHtml', (_event, html: string, text: string) => { clipboard.write({ html: String(html || ''), text: String(text || '') }); return true; });
  ipcMain.handle('export:reveal', (_event, target: string) => openExported(target, 'reveal'));

  // Read directory
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    try {
      const normalizedPath = path.normalize(dirPath);
      const dirents = await fs.promises.readdir(normalizedPath, { withFileTypes: true });
      // 带上修改 / 创建时间：文件树可以按时间排序。个别文件 stat 失败（权限、刚被删）不影响整个目录
      const files = await Promise.all(dirents.map(async (dirent) => {
        const full = path.join(dirPath, dirent.name);
        let mtime = 0;
        let ctime = 0;
        try { const st = await fs.promises.stat(path.normalize(full)); mtime = st.mtimeMs; ctime = st.birthtimeMs || st.ctimeMs; } catch { /* 留 0 */ }
        return { name: dirent.name, path: full, isDirectory: dirent.isDirectory(), mtime, ctime };
      }));
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      return { success: true, files, path: dirPath };
    } catch (error: any) {
      console.error('Error reading directory:', error);
      return { success: false, error: error.message };
    }
  });

  // 是否存在（新建笔记 / 文件夹时去重用）
  ipcMain.handle('fs:exists', async (_, targetPath: string) => fs.existsSync(path.normalize(targetPath)));

  // 新建文件夹
  ipcMain.handle('fs:mkdir', async (_, dirPath: string) => {
    try {
      const normalized = path.normalize(dirPath);
      if (fs.existsSync(normalized)) return { success: false, error: 'Target already exists' };
      await fs.promises.mkdir(normalized, { recursive: true });
      return { success: true, path: normalized };
    } catch (error: any) {
      console.error('Error creating directory:', error);
      return { success: false, error: error.message };
    }
  });

  // 在访达 / 资源管理器中显示
  ipcMain.handle('shell:showItemInFolder', async (_, targetPath: string) => {
    shell.showItemInFolder(path.normalize(targetPath));
  });

  // Rename or move file/directory
  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    try {
      const normalizedOld = path.normalize(oldPath);
      const normalizedNew = path.normalize(newPath);
      if (fs.existsSync(normalizedNew)) {
        return { success: false, error: 'Target already exists' };
      }
      await fs.promises.rename(normalizedOld, normalizedNew);
      await history?.rename(normalizedOld, normalizedNew).catch((err) => console.warn('[history] rename failed:', err));
      return { success: true, oldPath: normalizedOld, newPath: normalizedNew };
    } catch (error: any) {
      console.error('Error renaming:', error);
      return { success: false, error: error.message };
    }
  });

  // Copy file
  ipcMain.handle('fs:copy', async (_, sourcePath: string, targetPath: string) => {
    try {
      const normalizedSource = path.normalize(sourcePath);
      const normalizedTarget = path.normalize(targetPath);
      if (fs.existsSync(normalizedTarget)) {
        return { success: false, error: 'Target already exists' };
      }
      await fs.promises.copyFile(normalizedSource, normalizedTarget);
      return { success: true, sourcePath: normalizedSource, targetPath: normalizedTarget };
    } catch (error: any) {
      console.error('Error copying file:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete file or directory (move to trash)
  ipcMain.handle('fs:delete', async (_, targetPath: string) => {
    try {
      const normalizedTarget = path.normalize(targetPath);
      await shell.trashItem(normalizedTarget);
      return { success: true, path: normalizedTarget };
    } catch (error: any) {
      console.error('Error deleting (trash):', error);
      // Fallback to unlink/rm if trash fails
      try {
        const stat = await fs.promises.stat(targetPath);
        if (stat.isDirectory()) {
          await fs.promises.rm(targetPath, { recursive: true, force: true });
        } else {
          await fs.promises.unlink(targetPath);
        }
        return { success: true, path: targetPath, permanently: true };
      } catch (fallbackError: any) {
        return { success: false, error: fallbackError.message };
      }
    }
  });
}
