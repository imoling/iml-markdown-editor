import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';

export function setupFileSystemIPC() {
  // Open dialog to select an existing file or directory
  ipcMain.handle('dialog:open', async (event, options?: Electron.OpenDialogOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

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
      
      // Ensure unique filename
      let uniqueName = fileName;
      let counter = 1;
      while (fs.existsSync(path.join(assetsDir, uniqueName))) {
        const ext = path.extname(fileName);
        const nameWithoutExt = path.basename(fileName, ext);
        uniqueName = `${nameWithoutExt}-${counter}${ext}`;
        counter++;
      }
      
      const fullPath = path.join(assetsDir, uniqueName);
      await fs.promises.writeFile(fullPath, Buffer.from(buffer));
      // Return relative path for markdown
      return { success: true, path: `assets/${uniqueName}` };
    } catch (error: any) {
      console.error('Error saving image:', error);
      return { success: false, error: error.message };
    }
  });

  // Write file content
  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      const normalizedPath = path.normalize(filePath);
      await fs.promises.writeFile(normalizedPath, content, 'utf-8');
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
       
       const savePath = await dialog.showSaveDialog(window, {
         defaultPath: defaultPath.replace('.md', '.pdf'),
         filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
       });
       
       if (savePath.canceled || !savePath.filePath) return { success: false, canceled: true };
       
       const dirPath = !activeFilePath.startsWith('new-') ? path.dirname(activeFilePath) : process.cwd();
       const baseHref = `file:///${dirPath.replace(/\\/g, '/')}/`;

       const printWindow = new BrowserWindow({ 
         show: false, 
         webPreferences: { 
           nodeIntegration: false, 
           contextIsolation: true 
         } 
       });
       
       const fullHtml = `
         <html>
           <head>
             <meta charset="utf-8">
             <base href="${baseHref}">
             <style>
               body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
               img { max-width: 100%; border-radius: 8px; margin: 10px 0; display: block; }
               pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
               code { font-family: 'Menlo', 'Monaco', monospace; font-size: 0.9em; }
               table { border-collapse: collapse; width: 100%; margin: 20px 0; }
               th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
               th { background-color: #f8f9fa; }
               h1, h2, h3 { color: #111; margin-top: 1.5em; }
             </style>
           </head>
           <body>${htmlContent}</body>
         </html>
       `;
       
       await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml));
       
       // Wait for images
       await new Promise(resolve => setTimeout(resolve, 800));

       const pdfBuffer = await printWindow.webContents.printToPDF({
          printBackground: true,
          margins: { top: 1, bottom: 1, left: 1, right: 1 }
       });
       
       await fs.promises.writeFile(savePath.filePath, pdfBuffer);
       printWindow.close();
       
       return { success: true, path: savePath.filePath };
    } catch (error: any) {
      console.error("PDF Export Error:", error);
      return { success: false, error: error.message };
    }
  });


  // Read directory
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    try {
      const normalizedPath = path.normalize(dirPath);
      const dirents = await fs.promises.readdir(normalizedPath, { withFileTypes: true });
      const files = dirents.map(dirent => ({
        name: dirent.name,
        path: path.join(dirPath, dirent.name),
        isDirectory: dirent.isDirectory()
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

  // Rename or move file/directory
  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    try {
      const normalizedOld = path.normalize(oldPath);
      const normalizedNew = path.normalize(newPath);
      if (fs.existsSync(normalizedNew)) {
        return { success: false, error: 'Target already exists' };
      }
      await fs.promises.rename(normalizedOld, normalizedNew);
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
