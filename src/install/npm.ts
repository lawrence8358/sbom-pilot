import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';

export interface DependencyInstaller { install(root: string, tools: ToolContext, run: ProcessRunner): Promise<void> }
const exists = async (path: string) => access(path).then(() => true, () => false);

export async function inspectNpmProject(root: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.packageManager && !/^npm@\d+\.\d+\.\d+(?:[-+].*)?$/.test(manifest.packageManager)) {
    throw new Error('此版本僅支援 npm，packageManager 必須宣告 npm 的精確版本。');
  }
  for (const file of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
    if (await exists(join(root, file))) throw new Error('偵測到其他套件管理器 lockfile；此版本僅支援單一 npm lockfile。');
  }
  const locks = await Promise.all(['package-lock.json', 'npm-shrinkwrap.json'].map(async file => ({ file, present: await exists(join(root, file)) })));
  if (locks.filter(lock => lock.present).length !== 1) throw new Error('必須有且僅有一份 package-lock.json 或 npm-shrinkwrap.json；請先提交 npm lockfile。');
}
export const npmInstaller: DependencyInstaller = {
  async install(root, tools, run) {
    await inspectNpmProject(root);
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const lockName = await exists(join(root, 'npm-shrinkwrap.json')) ? 'npm-shrinkwrap.json' : 'package-lock.json';
    const lockPath = join(root, lockName);
    const before = createHash('sha256').update(await readFile(lockPath)).digest('hex');
    const actualVersion = (await run({ executable: tools.node, args: [tools.npmCli, '--version'], cwd: root, env: tools.env })).stdout.trim();
    if (manifest.packageManager && manifest.packageManager.split('@')[1].split('+')[0] !== actualVersion) {
      throw new Error('packageManager 宣告的 npm 版本與此 Node 內建版本不同；此階段請使用相符的 Node 版本，版本安裝 adapter 將於後續工單提供。');
    }
    try {
      await run({ executable: tools.node, args: [tools.npmCli, 'ci', '--no-audit', '--no-fund', '--fetch-retries=2', '--fetch-timeout=60000'], cwd: root, env: tools.env });
    } catch {
      throw new Error('npm ci 安裝失敗；lockfile 可能與 package.json 不一致，或來源／安裝腳本失敗。請在本機修正並提交 lockfile。未轉印可能含來源認證的輸出。');
    } finally {
      const after = createHash('sha256').update(await readFile(lockPath)).digest('hex');
      if (before !== after) throw new Error('安裝過程修改了 lockfile；請檢查專案安裝腳本。');
    }
  },
};
