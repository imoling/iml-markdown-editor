import { ipcMain, dialog, BrowserWindow } from 'electron';
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
    
    // For simplicity, handle reading the first file if it's a file request
    // or return the path if it's a directory
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
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { success: true, content, filePath };
    } catch (error: any) {
      console.error('Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  // Save an image buffer to disk relative to the active file
  ipcMain.handle('fs:saveImage', async (_, activeFilePath: string, fileName: string, buffer: ArrayBuffer) => {
    try {
      const dirPath = path.dirname(activeFilePath);
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
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true, filePath };
    } catch (error: any) {
      console.error('Error writing file:', error);
      return { success: false, error: error.message };
    }
  });

  // Export to PDF
  ipcMain.handle('export:pdf', async (event, htmlContent: string, defaultPath: string) => {
    try {
       const window = BrowserWindow.fromWebContents(event.sender);
       if (!window) return { success: false, error: 'No window found' };
       
       const savePath = await dialog.showSaveDialog(window, {
         defaultPath: defaultPath.replace('.md', '.pdf'),
         filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
       });
       
       if (savePath.canceled || !savePath.filePath) return { success: false, canceled: true };
       
       // Create hidden window to render and print
       const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
       
       // Load HTML data
       const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
         <html>
           <head>
             <style>
               body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; }
               img { max-width: 100%; border-radius: 8px; }
               pre { background: #f6f8fa; padding: 16px; border-radius: 6px; }
               code { font-family: 'Menlo', 'Monaco', monospace; }
             </style>
           </head>
           <body>${htmlContent}</body>
         </html>
       `);
       
       await printWindow.loadURL(dataUri);
       const pdfBuffer = await printWindow.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
       });
       
       await fs.promises.writeFile(savePath.filePath, pdfBuffer);
       printWindow.close();
       
       return { success: true, path: savePath.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Export to DOCX
  ipcMain.handle('export:word', async (event, htmlContent: string, defaultPath: string) => {
     try {
       const window = BrowserWindow.fromWebContents(event.sender);
       if (!window) return { success: false, error: 'No window found' };
       
       const savePath = await dialog.showSaveDialog(window, {
         defaultPath: defaultPath.replace('.md', '.docx'),
         filters: [{ name: 'Word Document', extensions: ['docx'] }]
       });
       
       if (savePath.canceled || !savePath.filePath) return { success: false, canceled: true };
       
       const HTMLtoDOCX = require('html-to-docx');
       const docxBuffer = await HTMLtoDOCX(htmlContent, null, {
         table: { row: { cantSplit: true } },
         footer: true,
         pageNumber: true,
       });
       
       await fs.promises.writeFile(savePath.filePath, docxBuffer);
       return { success: true, path: savePath.filePath };
     } catch (error: any) {
       console.error("DOCX Export Error:", error);
       return { success: false, error: error.message };
     }
  });

  // Read directory (simple implementation for Phase 4)
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    try {
      const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const files = dirents.map(dirent => ({
        name: dirent.name,
        path: path.join(dirPath, dirent.name),
        isDirectory: dirent.isDirectory()
      }));
      // Sort: Directories first, then alphabetical
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
}
