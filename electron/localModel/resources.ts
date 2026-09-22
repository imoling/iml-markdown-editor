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
  const notify = (text: string) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('resources:notice', text); };
  const labelsOf = (ids: ServiceId[]) => ids.map((id) => scheduler.get(id)?.label || id).join('、');
  scheduler.on('stopped', ({ ids, reason, target }: { ids: ServiceId[]; reason: string; target?: ServiceId }) => {
    if (reason === 'idle') notify(`${labelsOf(ids)}空闲了一阵，已自动停掉，下次用时会重新启动`);
    else if (reason === 'capacity') {
      const back = ids.filter((id) => scheduler.get(id)?.restorable);
      if (back.length) notify(`为了给${scheduler.get(target!)?.label || '刚才那件事'}腾内存，先停掉了${labelsOf(back)}，完事会自动回来`);
    }
  });
  // 让位的回来了：说一声，不然用户会以为还停着
  scheduler.on('restored', ({ ids }: { ids: ServiceId[] }) => notify(`${labelsOf(ids)}已经回来了`));

  ipcMain.handle('resources:getState', () => scheduler.getState());
  ipcMain.handle('resources:start', async (_e, id: ServiceId) => { await scheduler.start(id); return scheduler.getState(); });
  ipcMain.handle('resources:stop', async (_e, id: ServiceId) => { await scheduler.stop(id); return scheduler.getState(); });
  ipcMain.handle('resources:setConfig', (_e, patch: Partial<SchedulerConfig>) => { scheduler.setConfig(patch || {}); return scheduler.getState(); });
  scheduler.startSweeping();
}
