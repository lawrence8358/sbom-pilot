import type { JavaScriptAdapter } from './contracts';

export const yarnAdapter: JavaScriptAdapter = {
  /** 執行 Classic frozen 或現代 immutable 安裝；Classic 另以原生完整性檢查補足 workspace 鎖檔漏洞。 */
  async install(project, command, tools, run) {
    const classic = Number((command.version ?? project.version).split('.')[0]) === 1;
    await run({
      executable: command.executable,
      args: [
        ...command.args,
        'install',
        ...(classic ? ['--frozen-lockfile', '--non-interactive'] : ['--immutable']),
      ],
      cwd: project.root,
      env: command.env ?? tools.env,
    });
    // Classic frozen install 可能接受 workspace 新依賴；
    // 再用原生完整性檢查找出鎖檔缺少的依賴模式。
    if (classic) {
      await run({
        executable: command.executable,
        args: [...command.args, 'check', '--integrity', '--non-interactive'],
        cwd: project.root,
        env: command.env ?? tools.env,
      });
    }
  },
};
