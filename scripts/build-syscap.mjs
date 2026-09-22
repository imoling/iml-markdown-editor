// 编译系统声音捕获的小工具（macOS 专用，Swift + ScreenCaptureKit）→ build/bin/syscap（arm64 + x86_64 通用二进制）。
// 别的平台、或没装 Xcode 命令行工具的机器上直接跳过；源码比产物新才重编。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'electron/asr/native/syscap.swift');
const outDir = join(root, 'build/bin');
const out = join(outDir, 'syscap');

if (process.platform !== 'darwin') { console.log('[syscap] 不是 macOS，跳过'); process.exit(0); }
if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs && !process.argv.includes('--force')) { console.log('[syscap] 已是最新'); process.exit(0); }
if (spawnSync('xcrun', ['-f', 'swiftc'], { stdio: 'ignore' }).status !== 0) { console.log('[syscap] 没有 swiftc（装 Xcode 命令行工具：xcode-select --install），跳过；转写的「系统声音」在这台机器的开发模式里不可用'); process.exit(0); }
mkdirSync(outDir, { recursive: true });
const build = (arch) => {
  const file = `${out}-${arch}`;
  execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos13.0`, '-framework', 'ScreenCaptureKit', '-framework', 'AVFoundation', '-framework', 'CoreMedia', '-o', file, src], { stdio: 'inherit' });
  return file;
};
const slices = ['arm64', 'x86_64'].map(build);
execFileSync('lipo', ['-create', ...slices, '-output', out], { stdio: 'inherit' });
for (const s of slices) spawnSync('rm', ['-f', s]);
console.log(`[syscap] 已编译 → ${out}`);
