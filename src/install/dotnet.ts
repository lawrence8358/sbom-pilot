import type { NuGetCredential } from '../dotnet/credentials';
import { join } from 'node:path';
import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';
import { discoverDotnetProjects } from '../dotnet/projects';
import { prepareDotnetSdk } from '../dotnet/sdk';
import { restoreDotnetProject } from '../dotnet/restore';

export interface DotnetInstallOptions {
  tempDirectory?: string;
  log?: (message: string) => void;
  excludes?: string[];
  nugetCredentials?: NuGetCredential[];
}

export const dotnetInstaller = {
  /** 逐一依各專案 SDK 政策還原並收集驗證後 assets，只將非秘密 SDK 環境交給掃描。 */
  async install(
    root: string,
    tools: ToolContext,
    run: ProcessRunner,
    options: DotnetInstallOptions = {},
  ): Promise<void> {
    const projects = await discoverDotnetProjects(root, options.excludes);

    if (!projects.length) {
      throw new Error('找不到 .csproj/.fsproj/.vbproj；請指定包含 SDK-style .NET 專案的根目錄。');
    }
    if (projects.some((project) => !project.sdkStyle)) {
      throw new Error(
        '.NET Core 模式包含傳統或無法辨識的專案格式；請使用 .NET Framework 模式或將專案轉為 SDK-style。',
      );
    }

    const tempDirectory = options.tempDirectory ?? tools.env.AGENT_TEMPDIRECTORY;

    if (!tempDirectory) {
      throw new Error('.NET 工具準備需要 Task 暫存目錄。');
    }

    const cacheDirectory = tools.env.AGENT_TOOLSDIRECTORY ?? join(tempDirectory, 'tools');
    const originalEnv = { ...tools.env };
    let scanEnv: NodeJS.ProcessEnv | undefined;
    const assets = new Set<string>();

    for (const project of projects) {
      const sdk = await prepareDotnetSdk(project.directory, run, {
        cacheDirectory,
        tempDirectory: join(tempDirectory, 'dotnet'),
        env: originalEnv,
        log: options.log,
      });

      for (const restored of await restoreDotnetProject(
        project.path,
        sdk,
        run,
        join(tempDirectory, 'dotnet'),
        options.nugetCredentials,
      )) {
        assets.add(restored.assetsPath);
      }

      scanEnv ??= sdk.env;
      options.log?.(`.NET 還原完成（SDK ${sdk.version}）；已驗證 project.assets.json。`);
    }

    // 這份工具資訊僅屬本次工作流程，SDK 變更只傳給子指令。
    tools.env = { ...tools.env, ...scanEnv };
    tools.dotnetAssets = [...assets];
  },
};
