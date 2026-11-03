import type { JavaScriptAdapter } from './contracts';

export const pnpmAdapter: JavaScriptAdapter = {
  /** 以指定 pnpm 版本執行 frozen-lockfile 安裝，沿用驗證後的專案環境。 */
  async install(project, command, tools, run) {
    await run({
      executable: command.executable,
      args: [...command.args, 'install', '--frozen-lockfile'],
      cwd: project.root,
      env: command.env ?? tools.env,
    });
  },
};
