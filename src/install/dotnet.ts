import { join } from 'node:path';
import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';
import { discoverDotnetProjects } from '../dotnet/projects';
import { prepareDotnetSdk } from '../dotnet/sdk';
import { restoreDotnetProject } from '../dotnet/restore';

export interface DotnetInstallOptions { tempDirectory?: string; log?: (message: string) => void; excludes?: string[] }

export const dotnetInstaller = {
  async install(root: string, tools: ToolContext, run: ProcessRunner, options: DotnetInstallOptions = {}): Promise<void> {
    const projects = await discoverDotnetProjects(root, options.excludes);
    if (!projects.length) throw new Error('找不到 .csproj/.fsproj/.vbproj；請指定包含 SDK-style .NET 專案的根目錄。');
    if (projects.some(project => !project.sdkStyle)) throw new Error('現代 .NET 模式包含傳統或無法辨識的專案格式；請使用 .NET Framework 模式或將專案轉為 SDK-style。');
    const tempDirectory = options.tempDirectory ?? tools.env.AGENT_TEMPDIRECTORY;
    if (!tempDirectory) throw new Error('.NET 工具準備需要 Task 暫存目錄。');
    const cacheDirectory = tools.env.AGENT_TOOLSDIRECTORY ?? join(tempDirectory, 'tools');
    const originalEnv = { ...tools.env };
    let scanEnv: NodeJS.ProcessEnv | undefined;
    const assets = new Set<string>();
    for (const project of projects) {
      const sdk = await prepareDotnetSdk(project.directory, run, { cacheDirectory, tempDirectory: join(tempDirectory, 'dotnet'), env: originalEnv, log: options.log });
      for (const restored of await restoreDotnetProject(project.path, sdk, run, join(tempDirectory, 'dotnet'))) assets.add(restored.assetsPath);
      scanEnv ??= sdk.env;
      options.log?.(`.NET 還原完成（SDK ${sdk.version}）；已驗證 project.assets.json。`);
    }
    // This ToolContext belongs to a single workflow; propagate only to child commands.
    tools.env = { ...tools.env, ...scanEnv };
    tools.dotnetAssets = [...assets];
  },
};
