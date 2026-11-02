import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { ToolContext } from '../tools';
import type { DependencyInstaller, InstallOptions, JavaScriptAdapter, JavaScriptManager, JavaScriptProject } from './contracts';
import { inspectJavaScriptProject } from './project';
import { withPackageManager } from './manager';
import { npmAdapter } from './npm';
import { pnpmAdapter } from './pnpm';

export async function installJavaScriptProject(project: JavaScriptProject, tools: ToolContext, run: ProcessRunner, options: InstallOptions = {}, adapters: Partial<Record<JavaScriptManager, JavaScriptAdapter>> = { npm: npmAdapter, pnpm: pnpmAdapter }): Promise<void> {
  const adapter = adapters[project.manager];
  if (!adapter) throw new Error('此套件管理器 adapter 尚未交付。');
  const digest = async () => createHash('sha256').update(await readFile(project.lockPath)).digest('hex');
  const before = await digest();
  try {
    await withPackageManager(project, tools, run, options, command => adapter.install(project, command, tools, run));
  } finally {
    let after;
    try { after = await digest(); } catch { throw new Error('安裝過程移除了 lockfile；請檢查專案安裝腳本。'); }
    if (before !== after) throw new Error('安裝過程修改了 lockfile；請檢查專案安裝腳本。');
  }
}

export const javascriptInstaller: DependencyInstaller = {
  async install(root, tools, run, options) {
    await installJavaScriptProject(await inspectJavaScriptProject(root), tools, run, options);
  },
};
