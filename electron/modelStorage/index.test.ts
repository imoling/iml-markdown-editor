import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const env = vi.hoisted(() => ({ userData: '', handlers: new Map<string, (...args: any[]) => any>(), sent: [] as { channel: string; state: any }[] }));
vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => any) => { env.handlers.set(channel, fn); } },
  shell: { openPath: async () => '' },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (channel: string, state: any) => env.sent.push({ channel, state }) } }] },
}));

import { changeStorage, getStorageState, initModelStorage, modelStorageRoot, setupModelStorage, storageDir } from './index';

let base: string;
let target: string;
let calls: string[];
let settings: Record<string, unknown>;
let busy: string | null;
let saveOk: boolean;

const write = (root: string, rel: string, content: string | Buffer) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; };

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-storage-'));
  env.userData = path.join(base, 'userdata');
  target = path.join(base, 'disk');
  env.sent.length = 0;
  calls = [];
  settings = {};
  busy = null;
  saveOk = true;
  write(env.userData, 'local-model/models/chat.gguf', Buffer.alloc(40_000, 1));
  write(env.userData, 'local-model/runtime/b100/llama-server', 'bin');
  write(env.userData, 'local-model/runtime/current.json', JSON.stringify({ tag: 'b100', bin: path.join(env.userData, 'local-model/runtime/b100/llama-server'), installedAt: 1 }));
  write(env.userData, 'asr/models/a.onnx', Buffer.alloc(10_000, 2));
  initModelStorage('');
  setupModelStorage({
    saveSetting: (modelStoragePath) => { calls.push(`save:${modelStoragePath}`); if (saveOk) settings.modelStoragePath = modelStoragePath; return saveOk ? { success: true } : { success: false, error: '写入设置失败' }; },
    busyReason: () => busy,
    stopServices: async () => { calls.push('stop'); return async () => { calls.push('resume'); }; },
    refresh: () => { calls.push('refresh'); },
  });
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('模型存放位置', () => {
  it('默认在应用数据目录里；设置里的值是空的、或者就是默认位置，都算默认', async () => {
    expect(modelStorageRoot()).toBe(env.userData);
    expect(storageDir('asr')).toBe(path.join(env.userData, 'asr'));
    initModelStorage(env.userData + path.sep);
    expect((await getStorageState()).isDefault).toBe(true);
    initModelStorage(`  ${target}  `);
    expect(await getStorageState()).toMatchObject({ path: target, isDefault: false, available: false, usedBytes: 0, defaultPath: env.userData });
  });

  it('换位置：先停模型，再搬，存设置，最后才让原来开着的回来；各模块被叫去重新看磁盘', async () => {
    const before = (await getStorageState()).usedBytes;
    const result = await changeStorage(target);
    expect(result).toMatchObject({ ok: true, state: { path: target, isDefault: false, available: true, moving: null } });
    expect(result.error).toBeUndefined();
    expect(calls).toEqual(['stop', `save:${target}`, 'refresh', 'resume']);
    expect(settings.modelStoragePath).toBe(target);
    expect(modelStorageRoot()).toBe(target);
    expect(fs.existsSync(path.join(target, 'local-model/models/chat.gguf'))).toBe(true);
    expect(fs.existsSync(path.join(env.userData, 'local-model'))).toBe(false);
    expect(fs.existsSync(path.join(env.userData, 'asr'))).toBe(false);
    // 运行组件的登记跟着换了位置
    expect(JSON.parse(fs.readFileSync(path.join(target, 'local-model/runtime/current.json'), 'utf8')).bin).toBe(path.join(target, 'local-model/runtime/b100/llama-server'));
    // 界面收到过「正在搬」，最后一条是搬完的状态
    const states = env.sent.filter((s) => s.channel === 'storage:state').map((s) => s.state);
    expect(states[0].moving).toEqual({ movedBytes: 0, totalBytes: before });
    expect(states[states.length - 1]).toMatchObject({ path: target, moving: null });
  });

  it('回到默认位置：设置里存的是空，不是一条写死的路径（换了电脑、换了用户名也还对）', async () => {
    await changeStorage(target);
    calls = [];
    const result = await changeStorage(null);
    expect(result).toMatchObject({ ok: true, state: { path: env.userData, isDefault: true } });
    expect(calls).toEqual(['stop', 'save:', 'refresh', 'resume']);
    expect(fs.existsSync(path.join(env.userData, 'local-model/models/chat.gguf'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'local-model'))).toBe(false);
  });

  it('有模型正在下载 / 正在用：不搬，也不去停任何东西', async () => {
    busy = '对话模型正在下载';
    const result = await changeStorage(target);
    expect(result).toMatchObject({ ok: false, error: '对话模型正在下载，等它完成再换位置', state: { path: env.userData } });
    expect(calls).toEqual([]);
    expect(fs.existsSync(path.join(target, 'local-model'))).toBe(false);
  });

  it('新位置不行（原地、在存模型的文件夹里面）：不停模型，直接说原因', async () => {
    expect(await changeStorage(env.userData)).toMatchObject({ ok: false, error: '已经在这个位置了' });
    expect(await changeStorage(path.join(env.userData, 'local-model', 'models'))).toMatchObject({ ok: false, error: '不能放进现在存模型的文件夹里面，换一个位置' });
    expect(calls).toEqual([]);
  });

  it('搬过去了但设置没存上：撤回来，位置不变，原来开着的照样回来', async () => {
    saveOk = false;
    const result = await changeStorage(target);
    expect(result).toMatchObject({ ok: false, error: '写入设置失败', state: { path: env.userData, isDefault: true } });
    expect(calls).toEqual(['stop', `save:${target}`, 'refresh', 'resume']);
    expect(modelStorageRoot()).toBe(env.userData);
    expect(fs.readFileSync(path.join(env.userData, 'local-model/models/chat.gguf')).length).toBe(40_000);
    expect(fs.existsSync(path.join(target, 'local-model'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(env.userData, 'local-model/runtime/current.json'), 'utf8')).bin).toBe(path.join(env.userData, 'local-model/runtime/b100/llama-server'));
  });

  it('界面那边走的是同一条路', async () => {
    expect([...env.handlers.keys()].sort()).toEqual(['storage:change', 'storage:getState', 'storage:reveal']);
    const result = await env.handlers.get('storage:change')!({}, target);
    expect(result.ok).toBe(true);
    expect(await env.handlers.get('storage:getState')!({})).toMatchObject({ path: target });
    // 传来的不是字符串（界面出了错）：当成回默认位置，而不是拿去拼路径
    expect((await env.handlers.get('storage:change')!({}, { evil: true })).state.path).toBe(env.userData);
  });
});
