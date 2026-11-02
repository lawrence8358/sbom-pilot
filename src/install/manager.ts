import { mkdtemp, readFile, writeFile, access, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { satisfies, valid } from 'semver';
import { createHash } from 'node:crypto';
import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';
import type { InstallOptions, JavaScriptProject, ManagerCommand } from './contracts';

export async function withPackageManager(project: JavaScriptProject, tools: ToolContext, run: ProcessRunner, options: InstallOptions, action: (command: ManagerCommand) => Promise<void>): Promise<void> {
  let directory: string | undefined;
  try {
    const modernYarn = project.manager === 'yarn' && project.yarn?.generation === 'modern';
    const managerEnv = project.manager === 'yarn' ? { ...tools.env, YARN_IGNORE_PATH: '1' } : tools.env;
    const verifyBinaryHash = async (path: string) => {
      if (!project.integrity) return;
      const [algorithm, expected] = project.integrity.split('-');
      if (createHash(algorithm).update(await readFile(path)).digest('base64') !== expected) throw new Error('Yarn 執行檔完整性雜湊不符。');
    };
    const verifyCommand = async (command: ManagerCommand) => {
      const actual = (await run({ ...command, args: [...command.args, '--version'], cwd: project.root, env: managerEnv })).stdout.trim();
      if (!valid(actual) || (project.reason !== 'project-binary' && actual !== project.version)) throw new Error('套件管理器實際版本與宣告不同。');
      if (project.manager === 'yarn' && project.yarn && ((Number(actual.split('.')[0]) === 1) !== (project.yarn.generation === 'classic'))) throw new Error('Yarn 執行檔版本與鎖檔世代矛盾。');
      options.log?.(`${project.manager} ${actual}（${project.reason === 'declaration' ? '專案宣告' : project.reason === 'project-binary' ? '專案 yarnPath' : '固定 fallback'}）。`);
      await action({ ...command, env: managerEnv, version: actual });
    };
    if (project.manager === 'yarn' && project.yarn?.path) {
      if (project.integrity && !modernYarn) throw new Error('Classic yarnPath 無法以 npm 封裝雜湊驗證；請改用標準套件發行或移除 yarnPath。');
      if (modernYarn) await verifyBinaryHash(project.yarn.path);
      await verifyCommand({ executable: tools.node, args: [project.yarn.path] });
      return;
    }
    if (project.manager === 'npm' && !project.integrity) {
      const actual = (await run({ executable: tools.node, args: [tools.npmCli, '--version'], cwd: project.root, env: tools.env })).stdout.trim();
      if (actual === project.version) {
        options.log?.(`npm ${actual}（${project.reason === 'declaration' ? '專案宣告' : '固定 fallback'}）。`);
        await action({ executable: tools.node, args: [tools.npmCli] });
        return;
      }
    }
    const base = options.tempDirectory ?? tmpdir();
    await mkdir(base, { recursive: true });
    directory = await mkdtemp(join(base, 'sbom-manager-'));
    const packageName = project.manager === 'yarn' && Number(project.version.split('.')[0]) > 1 ? '@yarnpkg/cli-dist' : project.manager;
    let packageSpec = project.version;
    if (project.integrity && !modernYarn) {
      const packed = await run({ executable: tools.node, args: [tools.npmCli, 'pack', `${packageName}@${project.version}`, '--json', '--ignore-scripts', '--fetch-retries=2', '--fetch-timeout=60000'], cwd: directory, env: tools.env });
      const filename = JSON.parse(packed.stdout)?.[0]?.filename;
      if (typeof filename !== 'string' || resolve(directory, filename) !== join(directory, filename) || filename.includes('/') || filename.includes('\\')) throw new Error('套件管理器封裝路徑不合法。');
      const archive = join(directory, filename);
      const [algorithm, expected] = project.integrity.split('-');
      if (createHash(algorithm).update(await readFile(archive)).digest('base64') !== expected) throw new Error('套件管理器的完整性雜湊不符。');
      packageSpec = `file:${archive}`;
    }
    await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, dependencies: { [packageName]: packageSpec } }));
    await run({ executable: tools.node, args: [tools.npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=2', '--fetch-timeout=60000'], cwd: directory, env: tools.env });
    // npm ci verifies lock integrity. pnpm 12 requires its installer and optional native binary.
    await run({ executable: tools.node, args: [tools.npmCli, 'ci', '--engine-strict', ...(modernYarn ? ['--ignore-scripts'] : []), '--no-audit', '--no-fund', '--fetch-retries=2', '--fetch-timeout=60000'], cwd: directory, env: tools.env });
    const packageRoot = join(directory, 'node_modules', packageName);
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.version !== project.version || (manifest.engines?.node && !satisfies(tools.nodeVersion, manifest.engines.node))) throw new Error('套件管理器版本或 Node 相容性驗證失敗。');
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[project.manager];
    if (typeof bin !== 'string') throw new Error('套件管理器缺少執行入口。');
    let executable = resolve(packageRoot, bin);
    if (!executable.startsWith(`${resolve(packageRoot)}${sep}`)) throw new Error('套件管理器執行入口不合法。');
    try { await access(executable); } catch {
      if (process.platform !== 'win32') throw new Error('找不到套件管理器執行檔。');
      executable += '.exe'; await access(executable);
    }
    const command = /\.(?:c?js|mjs)$/i.test(executable) ? { executable: tools.node, args: [executable] } : { executable, args: [] };
    if (modernYarn) await verifyBinaryHash(executable);
    await verifyCommand(command);
  } catch {
    throw new Error(`${project.manager} ${project.version} 準備或嚴格安裝失敗（${project.manager === 'npm' ? 'npm ci' : project.yarn?.generation === 'modern' ? '--immutable' : '--frozen-lockfile'}）；請檢查 Node 相容性、lockfile、來源與安裝腳本。未轉印可能含認證的子程序輸出。`);
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
