import { app } from 'electron';
import { runCli } from './cli/commands';

// 程序入口：带 --cli 就只跑命令行（不开窗口、不抢单实例锁、跑完就退），否则才加载应用本体
const at = process.argv.indexOf('--cli');
if (at === -1) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./main');
} else {
  app.setName('iML Markdown Editor'); // 设置文件在哪由应用名决定，和 main.ts 一致
  app.dock?.hide();
  void runCli(process.argv.slice(at + 1), { userData: app.getPath('userData') }).then(({ code, out, err }) => {
    if (out) process.stdout.write(out);
    if (err) process.stderr.write(err);
    app.exit(code);
  }, (error) => {
    process.stderr.write(`${error?.message || error}\n`);
    app.exit(1);
  });
}
