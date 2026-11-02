import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { DotnetSdk } from './sdk';

const exists = async (path: string) => access(path).then(() => true, () => false);
const digest = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
export interface RestoreProject { projectPath: string; assetsPath: string; lockPath: string; hasLock: boolean }
interface RestoreGraph { projects?: Record<string, { restore?: { projectPath?: string; outputPath?: string; projectStyle?: string; restoreLockProperties?: { nuGetLockFilePath?: string } } }> }

/** NuGet evaluates imported properties, so custom lock/output paths remain effective. */
export async function inspectRestoreGraph(projectPath: string, sdk: DotnetSdk, run: ProcessRunner, tempDirectory: string): Promise<RestoreProject[]> {
  await mkdir(tempDirectory, { recursive: true });
  const graphPath = join(tempDirectory, `restore-${randomUUID()}.json`);
  try {
    await run({ executable: sdk.executable, args: ['msbuild', projectPath, '-t:GenerateRestoreGraphFile', `-p:RestoreGraphOutputPath=${graphPath}`, '-nologo', '-verbosity:quiet'], cwd: dirname(projectPath), env: sdk.env });
    const graph = JSON.parse(await readFile(graphPath, 'utf8')) as RestoreGraph;
    const result: RestoreProject[] = [];
    for (const entry of Object.values(graph.projects ?? {})) {
      const metadata = entry.restore;
      if (!metadata?.projectPath || !metadata.outputPath || metadata.projectStyle !== 'PackageReference') throw new Error('還原圖包含無法辨識或非 PackageReference 的專案。');
      const directory = dirname(metadata.projectPath);
      const customLock = metadata.restoreLockProperties?.nuGetLockFilePath;
      const lockPath = customLock ? (isAbsolute(customLock) ? customLock : resolve(directory, customLock)) : join(directory, 'packages.lock.json');
      const outputPath = isAbsolute(metadata.outputPath) ? metadata.outputPath : resolve(directory, metadata.outputPath);
      result.push({ projectPath: metadata.projectPath, assetsPath: join(outputPath, 'project.assets.json'), lockPath, hasLock: await exists(lockPath) });
    }
    if (!result.some(project => resolve(project.projectPath) === resolve(projectPath))) throw new Error('NuGet 還原圖未包含指定專案。');
    return result;
  } catch {
    throw new Error('.NET 還原資料評估失敗；請檢查 SDK-style 格式、SDK 相容性、ProjectReference、匯入 targets 及 NuGet 設定。');
  } finally { await rm(graphPath, { force: true }); }
}

export async function restoreDotnetProject(projectPath: string, sdk: DotnetSdk, run: ProcessRunner, tempDirectory: string): Promise<RestoreProject[]> {
  const projects = await inspectRestoreGraph(projectPath, sdk, run, tempDirectory);
  const locked = projects.filter(project => project.hasLock);
  const before = await Promise.all(locked.map(async project => [project.lockPath, await digest(project.lockPath)] as const));
  try {
    await run({ executable: sdk.executable, args: ['restore', projectPath, '--nologo', '--verbosity', 'quiet', ...(locked.length ? ['--locked-mode'] : [])], cwd: dirname(projectPath), env: sdk.env });
  } catch {
    throw new Error(`dotnet restore 失敗${locked.length ? '（已套用既有 lockfile 的 locked mode）' : ''}；請檢查 SDK/TFM、NuGet 來源與連線、依賴宣告及 lockfile 一致性。未轉印可能含認證的原始輸出。`);
  } finally {
    for (const [path, hash] of before) if (!await exists(path) || await digest(path) !== hash) throw new Error('dotnet restore 修改了既有 NuGet lockfile；請修正專案與鎖定資訊後重試。');
  }
  for (const project of projects) {
    try {
      const assets = JSON.parse(await readFile(project.assetsPath, 'utf8'));
      if (!assets.targets || typeof assets.targets !== 'object' || !assets.libraries || typeof assets.libraries !== 'object' || !assets.project?.restore?.projectPath || resolve(assets.project.restore.projectPath) !== resolve(project.projectPath)) throw new Error('invalid assets');
    } catch { throw new Error('dotnet restore 未產生有效的 project.assets.json；不會將缺少還原資料的掃描結果當作完整 SBOM。請檢查自訂還原輸出位置與專案設定。'); }
  }
  return projects;
}
