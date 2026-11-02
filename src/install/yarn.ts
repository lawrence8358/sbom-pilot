import type { JavaScriptAdapter } from './contracts';

export const yarnAdapter: JavaScriptAdapter = {
  async install(project, command, tools, run) {
    const classic = Number((command.version ?? project.version).split('.')[0]) === 1;
    await run({ executable: command.executable, args: [...command.args, 'install', ...(classic ? ['--frozen-lockfile', '--non-interactive'] : ['--immutable'])], cwd: project.root, env: command.env ?? tools.env });
    // Classic's frozen install can silently accept new workspace dependencies.
    // Its own integrity check detects patterns missing from the committed lock.
    if (classic) await run({ executable: command.executable, args: [...command.args, 'check', '--integrity', '--non-interactive'], cwd: project.root, env: command.env ?? tools.env });
  },
};
