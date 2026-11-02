import type { ProcessRunner } from '../process';
import type { ToolContext } from '../tools';
import type { DependencyInstaller, InstallOptions } from './contracts';
import { javascriptInstaller } from './javascript';
import { dotnetInstaller, type DotnetInstallOptions } from './dotnet';
import { discoverJavaScriptProjects } from './javascript-projects';

export interface CombinedInstallOptions extends InstallOptions { excludes?: string[] }
export interface CombinedInstallers {
  javascript: DependencyInstaller;
  dotnet: { install(root: string, tools: ToolContext, run: ProcessRunner, options?: DotnetInstallOptions): Promise<void> };
}
export async function installCombinedProject(root: string, tools: ToolContext, run: ProcessRunner, options: CombinedInstallOptions = {}, installers: CombinedInstallers = { javascript: javascriptInstaller, dotnet: dotnetInstaller }): Promise<void> {
  const projects = await discoverJavaScriptProjects(root, options.excludes);
  options.log?.(`合併交付產品：辨識 ${projects.length} 個 JavaScript 安裝根目錄；workspace 成員不重複安裝。`);
  for (const project of projects) await installers.javascript.install(project.root, tools, run, options);
  // Propagates verified SDK child environment and assets into this workflow's tools.
  await installers.dotnet.install(root, tools, run, options);
}
export const combinedInstaller = { install: installCombinedProject };
