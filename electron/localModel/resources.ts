/**
 * 「本机资源」面板的后端：把调度器的状态推给窗口，收面板上的启停和设置；配置存成 userData 里的一个小 JSON
 */
import { ipcMain, BrowserWindow } from 'electron';
import { scheduler, loadSchedulerConfig, saveSchedulerConfig, type SchedulerConfig, type ServiceId } from './scheduler';

export function setupResources(configFile: string) {
  scheduler.setConfig(loadSchedulerConfig(configFile));
  scheduler.on('config', (config: SchedulerConfig) => saveSchedulerConfig(configFile, config));

  let timer: ReturnType<typeof setTimeout> | null = null;
  const broadcast = () => {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        const state = await scheduler.getState();
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('resources:state', state);
      } catch (err) { console.warn('[resources] broadcast failed:', err); }
    }, 80);
  };
  scheduler.on('change', broadcast);
  // 空闲自动停的通知：状态栏提示一句，别悄悄没了
  scheduler.on('stopped', ({ ids, reason }: { ids: ServiceId[]; reason: string }) => {
    if (reason !== 'idle') return;
    const labels = ids.map((id) => scheduler.get(id)?.label || id).join('、');
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('resources:notice', `${labels}空闲了一阵，已自动停掉，下次用时会重新启动`);
  });

  ipcMain.handle('resources:getState', () => scheduler.getState());
  ipcMain.handle('resources:start', async (_e, id: ServiceId) => { await scheduler.start(id); return scheduler.getState(); });
  ipcMain.handle('resources:stop', async (_e, id: ServiceId) => { await scheduler.stop(id); return scheduler.getState(); });
  ipcMain.handle('resources:setConfig', (_e, patch: Partial<SchedulerConfig>) => { scheduler.setConfig(patch || {}); return scheduler.getState(); });
  scheduler.startSweeping();
}
