import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { downloadFile, type DownloadProgress } from './download';

/** llama.cpp 的发布页；每个 bNNNN 标签都带全平台预编译包 */
export const LLAMA_RELEASES_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=15';

export interface ReleaseAsset { name: string; url: string; size: number }

export interface RuntimeInfo {
  installed: boolean;
  /** llama-server 可执行文件路径 */
  path: string | null;
  /** 版本号（bNNNN） */
  version: string | null;
  /** managed = 编辑器下载的；system = PATH / Homebrew 里的；custom = 用户手动指定 */
  source: 'managed' | 'system' | 'custom' | null;
}

/** 按平台 / 架构挑选 llama.cpp 发布包的文件名规则 */
export function runtimeAssetPattern(platform: string, arch: string): RegExp | null {
  const a = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : null;
  if (!a) return null;
  if (platform === 'darwin') return new RegExp(`^llama-b\\d+-bin-macos-${a}\\.(tar\\.gz|zip)$`);
  if (platform === 'win32') return new RegExp(`^llama-b\\d+-bin-win-cpu-${a}\\.zip$`);
  if (platform === 'linux') return new RegExp(`^llama-b\\d+-bin-ubuntu-${a}\\.(tar\\.gz|zip)$`);
  return null;
}

export function pickRuntimeAsset(platform: string, arch: string, assets: { name: string }[]): string | null {
  const pattern = runtimeAssetPattern(platform, arch);
  if (!pattern) return null;
  return assets.find((a) => pattern.test(a.name))?.name ?? null;
}

/** GitHub 加速前缀（如 https://ghfast.top）：拼成 {prefix}/{原始地址} */
export function applyProxy(url: string, prefix: string): string {
  const p = (prefix || '').trim().replace(/\/+$/, '');
  return p ? `${p}/${url}` : url;
}

export async function fetchLatestRuntime(platform: string, arch: string, proxyPrefix = ''): Promise<{ tag: string; asset: ReleaseAsset }> {
  const resp = await fetch(LLAMA_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'iML-Markdown-Editor' },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`GitHub API 返回 ${resp.status}`);
  const releases: any[] = await resp.json();
  for (const r of releases) {
    if (!/^b\d+$/.test(r.tag_name)) continue;
    const name = pickRuntimeAsset(platform, arch, r.assets || []);
    if (!name) continue;
    const a = r.assets.find((x: any) => x.name === name);
    return { tag: r.tag_name, asset: { name, url: applyProxy(a.browser_download_url, proxyPrefix), size: a.size } };
  }
  throw new Error(`没有找到适合 ${platform}/${arch} 的 llama.cpp 发布包`);
}

function exec(cmd: string, args: string[], opts: { timeout?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeout ?? 120000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** 解压 tar.gz / zip；优先用系统自带的 bsdtar（macOS、Windows 10+ 都有） */
export async function extractArchive(archive: string, destDir: string): Promise<void> {
  await fs.promises.rm(destDir, { recursive: true, force: true });
  await fs.promises.mkdir(destDir, { recursive: true });
  const attempts: [string, string[]][] = [['tar', ['-xf', archive, '-C', destDir]]];
  if (archive.endsWith('.zip')) {
    if (process.platform === 'win32') {
      attempts.push(['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destDir}' -Force`]]);
    } else {
      attempts.push(['unzip', ['-o', '-q', archive, '-d', destDir]]);
    }
  }
  let lastErr: any;
  for (const [cmd, args] of attempts) {
    try {
      await exec(cmd, args);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`解压失败：${lastErr?.message || lastErr}`);
}

const SERVER_NAMES = process.platform === 'win32' ? ['llama-server.exe'] : ['llama-server'];

/** 在解压目录里找 llama-server（不同版本的包目录层级不同） */
export function findServerBinary(dir: string, depth = 0): string | null {
  if (depth > 4) return null;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isFile() && SERVER_NAMES.includes(e.name)) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findServerBinary(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * `llama-server --version` 的输出形如 "version: 0.4.0-dev (build 10936, commit abc)" 或老版本的 "version: 6000 (abc)"，
 * 统一成 b10936 这样的构建号
 */
export function parseVersionOutput(text: string): string | null {
  const m = /\(build (\d+)/i.exec(text) || /version:\s*(\d{3,})\b/i.exec(text) || /\bb(\d{3,})\b/.exec(text);
  if (m) return `b${m[1]}`;
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 40) : null;
}

const versionCache = new Map<string, string | null>();

export async function getServerVersion(bin: string): Promise<string | null> {
  if (versionCache.has(bin)) return versionCache.get(bin)!;
  let text = '';
  try {
    // 新下载的二进制第一次执行时 macOS 会先做安全扫描，可能要等十几秒
    const { stdout, stderr } = await exec(bin, ['--version'], { timeout: 90000 });
    text = `${stdout}\n${stderr}`;
  } catch (err: any) {
    text = `${err?.stdout || ''}\n${err?.stderr || ''}`;
  }
  const v = parseVersionOutput(text);
  versionCache.set(bin, v);
  return v;
}

/** PATH / Homebrew 里已经装好的 llama-server（brew install llama.cpp） */
export async function detectSystemServer(): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? []
    : ['/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server', '/usr/bin/llama-server', path.join(process.env.HOME || '', '.local/bin/llama-server')];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where' : 'which', ['llama-server'], { timeout: 5000 });
    const first = stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch { /* 没装 */ }
  return null;
}

interface ManagedRecord { tag: string; bin: string; installedAt: number }

function recordPath(rootDir: string) { return path.join(rootDir, 'current.json'); }

export function readManagedRuntime(rootDir: string): ManagedRecord | null {
  try {
    const rec: ManagedRecord = JSON.parse(fs.readFileSync(recordPath(rootDir), 'utf8'));
    if (rec?.bin && fs.existsSync(rec.bin)) return rec;
  } catch { /* 未安装 */ }
  return null;
}

/** 决定用哪个 llama-server：手动指定 > 编辑器托管 > 系统已安装 */
export async function resolveRuntime(rootDir: string, customPath?: string | null): Promise<RuntimeInfo> {
  if (customPath && fs.existsSync(customPath)) {
    return { installed: true, path: customPath, version: await getServerVersion(customPath), source: 'custom' };
  }
  const managed = readManagedRuntime(rootDir);
  if (managed) {
    return { installed: true, path: managed.bin, version: managed.tag || (await getServerVersion(managed.bin)), source: 'managed' };
  }
  const system = await detectSystemServer();
  if (system) {
    return { installed: true, path: system, version: await getServerVersion(system), source: 'system' };
  }
  return { installed: false, path: null, version: null, source: null };
}

export type InstallPhase = 'resolving' | 'downloading' | 'extracting' | 'warming' | 'done';

export interface InstallProgress extends Omit<Partial<DownloadProgress>, 'phase'> {
  phase: InstallPhase;
  tag?: string;
}

/** 下载最新的 llama.cpp 发布包到 rootDir 并解压；返回安装好的运行时信息 */
export async function installRuntime(opts: {
  rootDir: string;
  platform?: string;
  arch?: string;
  proxyPrefix?: string;
  signal?: AbortSignal;
  onProgress?: (p: InstallProgress) => void;
}): Promise<RuntimeInfo> {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  opts.onProgress?.({ phase: 'resolving' });
  const { tag, asset } = await fetchLatestRuntime(platform, arch, opts.proxyPrefix);

  const archive = path.join(opts.rootDir, 'downloads', asset.name);
  opts.onProgress?.({ phase: 'downloading', tag, received: 0, total: asset.size, speed: 0 });
  await downloadFile(asset.url, archive, {
    expectedSize: asset.size,
    signal: opts.signal,
    onProgress: (p) => opts.onProgress?.({ ...p, phase: 'downloading', tag }),
  });

  opts.onProgress?.({ phase: 'extracting', tag });
  const dir = path.join(opts.rootDir, tag);
  await extractArchive(archive, dir);
  const bin = findServerBinary(dir);
  if (!bin) throw new Error('下载的包里没有推理程序，换个版本再试');

  // 可执行权限 + 去掉 macOS 隔离属性（保险起见，Node 下载的文件本来就没有）
  const binDir = path.dirname(bin);
  for (const f of fs.readdirSync(binDir)) {
    try { fs.chmodSync(path.join(binDir, f), 0o755); } catch { /* ignore */ }
  }
  if (platform === 'darwin') {
    await exec('xattr', ['-dr', 'com.apple.quarantine', dir]).catch(() => {});
  }

  // 立刻跑一次 --version：把系统对新二进制的首次安全扫描（实测十几秒）放在安装阶段完成，之后启动模型就不用等
  opts.onProgress?.({ phase: 'warming', tag });
  versionCache.delete(bin);
  await getServerVersion(bin);

  const rec: ManagedRecord = { tag, bin, installedAt: Date.now() };
  fs.writeFileSync(recordPath(opts.rootDir), JSON.stringify(rec, null, 2), 'utf8');

  // 清理旧版本目录与安装包
  for (const e of fs.readdirSync(opts.rootDir)) {
    if (/^b\d+$/.test(e) && e !== tag) await fs.promises.rm(path.join(opts.rootDir, e), { recursive: true, force: true }).catch(() => {});
  }
  await fs.promises.rm(archive, { force: true }).catch(() => {});

  opts.onProgress?.({ phase: 'done', tag });
  return { installed: true, path: bin, version: tag, source: 'managed' };
}
