import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { validRestoreAssets } from './assets';
import { createHash, randomUUID } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { DotnetSdk } from './sdk';
import {
  withNuGetCredentials,
  type NuGetCredential,
  type NuGetRestoreSettings,
} from './credentials';
import { withSdkSourceReader } from './sources';

/** 檢查評估後的 NuGet 鎖檔是否存在，讓未選用鎖檔的合法專案仍可還原。 */
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** 計算 NuGet lockfile 的 SHA-256，核對還原前後位元組一致。 */
const digest = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
export interface RestoreProject {
  projectPath: string;
  assetsPath: string;
  lockPath: string;
  hasLock: boolean;
  configFilePaths?: string[];
  sources?: Record<string, unknown>;
}
interface RestoreGraph {
  projects?: Record<
    string,
    {
      restore?: {
        projectPath?: string;
        outputPath?: string;
        projectStyle?: string;
        configFilePaths?: string[];
        sources?: Record<string, unknown>;
        restoreLockProperties?: { nuGetLockFilePath?: string };
      };
    }
  >;
}

/** 由 NuGet 評估匯入屬性、輸出及自訂鎖檔路徑，驗證整個 graph 後清除暫存檔。 */
export async function inspectRestoreGraph(
  projectPath: string,
  sdk: DotnetSdk,
  run: ProcessRunner,
  tempDirectory: string,
): Promise<RestoreProject[]> {
  await mkdir(tempDirectory, { recursive: true });
  const graphPath = join(tempDirectory, `restore-${randomUUID()}.json`);

  try {
    await run({
      executable: sdk.executable,
      args: [
        'msbuild',
        projectPath,
        '-t:GenerateRestoreGraphFile',
        `-p:RestoreGraphOutputPath=${graphPath}`,
        '-nologo',
        '-verbosity:quiet',
      ],
      cwd: dirname(projectPath),
      env: sdk.env,
    });

    const graph = JSON.parse(await readFile(graphPath, 'utf8')) as RestoreGraph;
    const result: RestoreProject[] = [];

    for (const entry of Object.values(graph.projects ?? {})) {
      const metadata = entry.restore;

      if (
        !metadata?.projectPath ||
        !metadata.outputPath ||
        metadata.projectStyle !== 'PackageReference'
      ) {
        throw new Error('還原圖包含無法辨識或非 PackageReference 的專案。');
      }

      const directory = dirname(metadata.projectPath);
      const customLock = metadata.restoreLockProperties?.nuGetLockFilePath;
      const lockPath = customLock
        ? isAbsolute(customLock)
          ? customLock
          : resolve(directory, customLock)
        : join(directory, 'packages.lock.json');
      const outputPath = isAbsolute(metadata.outputPath)
        ? metadata.outputPath
        : resolve(directory, metadata.outputPath);

      result.push({
        projectPath: metadata.projectPath,
        assetsPath: join(outputPath, 'project.assets.json'),
        lockPath,
        hasLock: await exists(lockPath),
        configFilePaths: metadata.configFilePaths,
        sources: metadata.sources,
      });
    }

    if (!result.some((project) => resolve(project.projectPath) === resolve(projectPath))) {
      throw new Error('NuGet 還原圖未包含指定專案。');
    }

    return result;
  } catch {
    throw new Error(
      '.NET 還原資料評估失敗；請檢查 SDK-style 格式、SDK 相容性、ProjectReference、匯入 targets 及 NuGet 設定。',
    );
  } finally {
    await rm(graphPath, { force: true });
  }
}

/** 依 SDK 與完整還原圖執行 restore，保留既有鎖檔並驗證每個專案的 assets。 */
export async function restoreDotnetProject(
  projectPath: string,
  sdk: DotnetSdk,
  run: ProcessRunner,
  tempDirectory: string,
  credentials?: NuGetCredential[],
): Promise<RestoreProject[]> {
  // 先固定完整還原圖與既有鎖檔，之後才允許認證進入 restore 子程序。
  const projects = await inspectRestoreGraph(projectPath, sdk, run, tempDirectory);
  const locked = projects.filter((project) => project.hasLock);
  const before = await Promise.all(
    locked.map(async (project) => [project.lockPath, await digest(project.lockPath)] as const),
  );

  try {
    /** 執行指定專案的 dotnet restore，使用傳入的單次子程序環境及既有鎖檔政策。 */
    const restore = (env: NodeJS.ProcessEnv) =>
      run({
        executable: sdk.executable,
        args: [
          'restore',
          projectPath,
          '--nologo',
          '--verbosity',
          'quiet',
          ...(locked.length ? ['--locked-mode'] : []),
        ],
        cwd: dirname(projectPath),
        env,
      });

    if (credentials?.length) {
      await withSdkSourceReader(sdk, run, tempDirectory, (read) =>
        withNuGetCredentials(
          credentials,
          projects as NuGetRestoreSettings[],
          read,
          sdk.env,
          restore,
        ),
      );
    } else {
      await restore(sdk.env);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NuGet 認證')) {
      throw error;
    }

    throw new Error(
      `dotnet restore 失敗${locked.length ? '（已套用既有 lockfile 的 locked mode）' : ''}；請檢查 SDK/TFM、NuGet 來源與連線、依賴宣告及 lockfile 一致性。未轉印可能含認證的原始輸出。`,
    );
  } finally {
    for (const [path, hash] of before) {
      if (!(await exists(path)) || (await digest(path)) !== hash) {
        throw new Error('dotnet restore 修改了既有 NuGet lockfile；請修正專案與鎖定資訊後重試。');
      }
    }
  }

  // 還原成功仍須確認實際 assets；命令成功不能代替間接依賴完整性。
  for (const project of projects) {
    if (!(await validRestoreAssets(project.assetsPath, project.projectPath))) {
      throw new Error(
        'dotnet restore 未產生有效的 project.assets.json；不會將缺少還原資料的掃描結果當作完整 SBOM。請檢查自訂還原輸出位置與專案設定。',
      );
    }
  }

  return projects;
}
