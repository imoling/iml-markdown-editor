import fs from 'fs';
import path from 'path';

/** 启动脚本：转给应用本体跑命令行。VS Code 里的终端带着 ELECTRON_RUN_AS_NODE，不清掉应用会被当成 node 启动 */
export function cliWrapper(exe: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return `@echo off\r\nset ELECTRON_RUN_AS_NODE=\r\n"${exe}" --cli %*\r\n`;
  return `#!/bin/sh\nunset ELECTRON_RUN_AS_NODE\nexec "${exe.replace(/(["\\$`])/g, '\\$1')}" --cli "$@"\n`;
}

export function cliPath(home: string, platform: NodeJS.Platform): string {
  return path.join(home, '.local', 'bin', platform === 'win32' ? 'iml.cmd' : 'iml');
}

export async function installCli(exe: string, home: string, platform: NodeJS.Platform): Promise<string> {
  const target = cliPath(home, platform);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, cliWrapper(exe, platform), { mode: 0o755 });
  return target;
}
