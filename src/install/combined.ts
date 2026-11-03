import type { ProcessRunner } from '../process';
import type { ToolContext } from '../tools';
import type { DependencyInstaller, InstallOptions } from './contracts';
import { javascriptInstaller } from './javascript';
import { dotnetInstaller, type DotnetInstallOptions } from './dotnet';
import { discoverJavaScriptProjects } from './javascript-projects';

export interface CombinedInstallOptions extends InstallOptions {
  excludes?: string[];
}
export interface CombinedInstallers {
  javascript: DependencyInstaller;
  dotnet: {
    install(
      root: string,
      tools: ToolContext,
      run: ProcessRunner,
      options?: DotnetInstallOptions,
    ): Promise<void>;
  };
}

/** 先安裝各前端擁有的 workspace 根目錄再還原 .NET Core，讓後續只掃描一次共同產品。 */
export async function installCombinedProject(
  root: string,
  tools: ToolContext,
  run: ProcessRunner,
  options: CombinedInstallOptions = {},
  installers: CombinedInstallers = { javascript: javascriptInstaller, dotnet: dotnetInstaller },
): Promise<void> {
  const projects = await discoverJavaScriptProjects(root, options.excludes);

  options.log?.(
    `合併交付產品：辨識 ${projects.length} 個 JavaScript 安裝根目錄；workspace 成員不重複安裝。`,
  );

  for (const project of projects) {
    await installers.javascript.install(project.root, tools, run, { ...options, sourceRoot: root });
  }

  // 只將已驗證 SDK 環境與 assets 留在本次工具資訊，不保留來源秘密。
  await installers.dotnet.install(root, tools, run, options);
}
export const combinedInstaller = {
  /** 以統一 installer 介面公開前後端安裝順序，不額外建立另一套工作流程。 */
  install: installCombinedProject,
};
