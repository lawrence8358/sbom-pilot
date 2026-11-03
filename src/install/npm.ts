import { inspectJavaScriptProject } from './project';
import { installJavaScriptProject } from './javascript';
import type { DependencyInstaller, JavaScriptAdapter } from './contracts';
export type { DependencyInstaller, InstallOptions } from './contracts';

/** 確認指定根目錄經共用辨識後確實使用 npm，保留舊 npm 呼叫介面。 */
export async function inspectNpmProject(root: string): Promise<void> {
  if ((await inspectJavaScriptProject(root)).manager !== 'npm') {
    throw new Error('此專案使用其他套件管理器，並非 npm。');
  }
}
export const npmAdapter: JavaScriptAdapter = {
  /** 以驗證後的 npm 指令執行 ci，沿用專案認證環境且不自動修正鎖檔。 */
  async install(project, command, tools, run) {
    await run({
      executable: command.executable,
      args: [
        ...command.args,
        'ci',
        '--no-audit',
        '--no-fund',
        '--fetch-retries=2',
        '--fetch-timeout=60000',
      ],
      cwd: project.root,
      env: command.env ?? tools.env,
    });
  },
};
export const npmInstaller: DependencyInstaller = {
  /** 確認 npm 專案後委派共用安裝流程，保留認證、鎖檔及清理檢查。 */
  async install(root, tools, run, options) {
    const project = await inspectJavaScriptProject(root);
    if (project.manager !== 'npm') {
      throw new Error('此專案使用其他套件管理器，並非 npm。');
    }
    await installJavaScriptProject(project, tools, run, options);
  },
};
