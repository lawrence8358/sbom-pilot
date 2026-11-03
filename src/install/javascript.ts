import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { ToolContext } from '../tools';
import type {
  DependencyInstaller,
  InstallOptions,
  JavaScriptAdapter,
  JavaScriptManager,
  JavaScriptProject,
} from './contracts';
import { inspectJavaScriptProject } from './project';
import { withPackageManager } from './manager';
import { npmAdapter } from './npm';
import { pnpmAdapter } from './pnpm';
import { yarnAdapter } from './yarn';
import { checkProjectAuthentication, withNpmAuthentication } from './npm-auth';
import { projectCredentialEnvironment } from './npm-credentials';

/** 預檢認證並準備正確管理器，再執行嚴格安裝；finally 核對鎖檔位元組不變。 */
export async function installJavaScriptProject(
  project: JavaScriptProject,
  tools: ToolContext,
  run: ProcessRunner,
  options: InstallOptions = {},
  adapters: Partial<Record<JavaScriptManager, JavaScriptAdapter>> = {
    npm: npmAdapter,
    pnpm: pnpmAdapter,
    yarn: yarnAdapter,
  },
): Promise<void> {
  const adapter = adapters[project.manager];

  if (!adapter) {
    throw new Error('此套件管理器 adapter 尚未交付。');
  }

  /** 計算所選 lockfile 的摘要，讓成功與失敗安裝都能偵測鎖檔被修改或移除。 */
  const digest = async () =>
    createHash('sha256')
      .update(await readFile(project.lockPath))
      .digest('hex');
  const before = await digest();

  try {
    const projectEnvironment = projectCredentialEnvironment(tools.env, options.npmCredentials);

    await checkProjectAuthentication(project, projectEnvironment, options);
    await withPackageManager(project, tools, run, { ...options, projectEnvironment }, (command) =>
      withNpmAuthentication(project, command, tools.env, options, (authenticated) =>
        adapter.install(project, authenticated, tools, run),
      ),
    );
  } finally {
    let after;

    try {
      after = await digest();
    } catch {
      throw new Error('安裝過程移除了 lockfile；請檢查專案安裝腳本。');
    }

    if (before !== after) {
      throw new Error('安裝過程修改了 lockfile；請檢查專案安裝腳本。');
    }
  }
}

export const javascriptInstaller: DependencyInstaller = {
  /** 從指定根目錄辨識管理器與 workspace，再進入共用嚴格安裝流程。 */
  async install(root, tools, run, options) {
    await installJavaScriptProject(await inspectJavaScriptProject(root), tools, run, options);
  },
};
