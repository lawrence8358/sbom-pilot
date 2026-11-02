import { inspectJavaScriptProject } from './project';
import { installJavaScriptProject } from './javascript';
import type { DependencyInstaller, JavaScriptAdapter } from './contracts';
export type { DependencyInstaller, InstallOptions } from './contracts';

export async function inspectNpmProject(root: string): Promise<void> {
  if ((await inspectJavaScriptProject(root)).manager !== 'npm') throw new Error('此專案使用其他套件管理器，並非 npm。');
}
export const npmAdapter: JavaScriptAdapter = {
  async install(project, command, tools, run) {
    await run({ executable: command.executable, args: [...command.args, 'ci', '--no-audit', '--no-fund', '--fetch-retries=2', '--fetch-timeout=60000'], cwd: project.root, env: tools.env });
  },
};
export const npmInstaller: DependencyInstaller = {
  async install(root, tools, run, options) {
    const project = await inspectJavaScriptProject(root);
    if (project.manager !== 'npm') throw new Error('此專案使用其他套件管理器，並非 npm。');
    await installJavaScriptProject(project, tools, run, options);
  },
};
