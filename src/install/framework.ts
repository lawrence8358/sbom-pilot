import { join } from 'node:path';
import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';
import { discoverDotnetProjects } from '../dotnet/projects';
import { findMSBuild } from '../dotnet/msbuild';
import { restoreFrameworkProject } from '../dotnet/framework';
import { prepareDotnetSdk } from '../dotnet/sdk';
import { restoreDotnetProject } from '../dotnet/restore';
import type { DotnetInstallOptions } from './dotnet';

export const frameworkInstaller = {
  async install(root: string, tools: ToolContext, run: ProcessRunner, options: DotnetInstallOptions = {}): Promise<void> {
    if (process.platform !== 'win32') throw new Error('.NET Framework 模式僅支援 Windows Agent。');
    const projects = await discoverDotnetProjects(root, options.excludes);
    if (!projects.length) throw new Error('找不到可還原的 .NET Framework 專案；請指定包含 csproj/fsproj/vbproj 的根目錄。');
    const temp = options.tempDirectory ?? tools.env.AGENT_TEMPDIRECTORY;
    if (!temp) throw new Error('.NET Framework 流程需要 Task 暫存目錄。');
    const env = { ...tools.env };
    const msbuild = projects.some(project => !project.sdkStyle) ? await findMSBuild(root, run, env) : undefined;
    if (msbuild) options.log?.(`Visual Studio MSBuild ${msbuild.version}（Agent 預裝；使用內建 NuGet Restore）。`);
    const assets = new Set<string>();
    const packageFiles = new Set<string>();
    for (const project of projects) {
      if (project.sdkStyle) {
        const sdk = await prepareDotnetSdk(project.directory, run, { cacheDirectory: env.AGENT_TOOLSDIRECTORY ?? join(temp, 'tools'), tempDirectory: join(temp, 'dotnet'), env, log: options.log });
        const restored = await restoreDotnetProject(project.path, sdk, run, join(temp, 'dotnet'));
        restored.forEach(item => assets.add(item.assetsPath));
        tools.env = { ...tools.env, ...sdk.env };
      } else {
        const restored = await restoreFrameworkProject(project.path, root, msbuild!, run, join(temp, 'framework'));
        restored.assets.forEach(item => assets.add(item.assetsPath));
        restored.packageFiles.forEach(path => packageFiles.add(path));
      }
      options.log?.('.NET Framework 依賴還原完成；已驗證實際 assets／套件資料。');
    }
    tools.dotnetAssets = [...assets];
    tools.dotnetPackageFiles = [...packageFiles];
  },
};
