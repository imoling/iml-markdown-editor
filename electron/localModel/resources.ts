/**
 * 「本机资源」面板的后端：把调度器的状态推给窗口，收面板上的启停和设置。
 * 两份存档都在 userData 里：resources.json 是用户的设置，resources-usage.json 是各模型实测占了多少内存
 * （下次算内存预算直接用实测值，不再靠文件大小猜）
 */
import { ipcMain, BrowserWindow } from 'electron';
import { scheduler, loadSchedulerConfig, saveSchedulerConfig, loadUsageMemo, saveUsageMemo, type SchedulerConfig, type ServiceId } from './scheduler';

export function setupResources(configFile: string) {
  scheduler.setConfig(loadSchedulerConfig(configFile));
  scheduler.on('config', (config: SchedulerConfig) => saveSchedulerConfig(configFile, config));

  const usageFile = configFile.replace(/\.json$/, '') + '-usage.json';
  scheduler.loadUsage(loadUsageMemo(usageFile));
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  scheduler.on('usage', () => {
    if (saveTimer) return;   // 攒一攒再写盘；写的是到点那一刻的全量，不是触发这次的那份
    saveTimer = setTimeout(() => { saveTimer = null; saveUsageMemo(usageFile, scheduler.usage()); }, 5000);
    (saveTimer as any).unref?.();
  });

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
  const groupsOf = (ids: ServiceId[]) => [...new Set(ids.map((id) => scheduler.leaderOf(id)))].map((l) => scheduler.groupLabel(l)).join('、');
  scheduler.on('stopped', ({ ids, reason, target }: { ids: ServiceId[]; reason: string; target?: ServiceId }) => {
    if (reason === 'idle') notify(`${groupsOf(ids)}空闲了一阵，已自动停掉，下次用时会重新启动`);
    else if (reason === 'capacity') {
      const back = ids.filter((id) => scheduler.get(id)?.restorable);
      if (back.length) notify(`为了给${scheduler.groupLabel(target!)}腾内存，先停掉了${groupsOf(back)}，完事会自动回来`);
    }
  });
  // 让位的回来了：说一声，不然用户会以为还停着
  scheduler.on('restored', ({ ids }: { ids: ServiceId[] }) => notify(`${groupsOf(ids)}已经回来了`));
  // 要用的那个正忙：说清楚在等谁，别让人以为卡住了
  scheduler.on('waiting', ({ label, target }: { label: string | null; target: ServiceId }) => {
    if (label) notify(`${label}正在忙，等它干完再给${scheduler.groupLabel(target)}腾地方…`);
  });

  ipcMain.handle('resources:getState', () => scheduler.getState());
  ipcMain.handle('resources:start', async (_e, id: ServiceId) => { await scheduler.start(id); return scheduler.getState(); });
  ipcMain.handle('resources:stop', async (_e, id: ServiceId) => { await scheduler.stop(id); return scheduler.getState(); });
  ipcMain.handle('resources:setConfig', (_e, patch: Partial<SchedulerConfig>) => { scheduler.setConfig(patch || {}); return scheduler.getState(); });
  scheduler.startSweeping();
}
