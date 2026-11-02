import type { JavaScriptAdapter } from './contracts';

export const pnpmAdapter: JavaScriptAdapter = {
  async install(project, command, tools, run) {
    await run({ executable: command.executable, args: [...command.args, 'install', '--frozen-lockfile'], cwd: project.root, env: command.env ?? tools.env });
  },
};
