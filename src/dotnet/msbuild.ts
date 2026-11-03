import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { gte } from 'semver';
import type { ProcessRunner } from '../process';

export interface MSBuildTool {
  executable: string;
  version: string;
  env: NodeJS.ProcessEnv;
}
/** 檢查 Agent 宣告或 vswhere 找到的工具路徑，避免啟動不存在的 MSBuild。 */
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** 定位並驗證 Agent 預裝 MSBuild >=17.8；缺少時提示必要條件，不自動安裝 Visual Studio。 */
export async function findMSBuild(
  cwd: string,
  run: ProcessRunner,
  env: NodeJS.ProcessEnv,
  platform = process.platform,
): Promise<MSBuildTool> {
  if (platform !== 'win32') {
    throw new Error('.NET Framework 模式僅支援 Windows Agent。');
  }
  let executable = env.MSBUILD_EXE_PATH;
  if (!executable) {
    const vswhere = join(
      env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)',
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe',
    );
    if (await exists(vswhere)) {
      try {
        executable = (
          await run({
            executable: vswhere,
            args: [
              '-latest',
              '-products',
              '*',
              '-requires',
              'Microsoft.Component.MSBuild',
              '-find',
              'MSBuild\\**\\Bin\\MSBuild.exe',
            ],
            cwd,
            env,
            timeoutMs: 30_000,
          })
        ).stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
      } catch {
        /* 交由後續必要條件檢查給出明確診斷。 */
      }
    }
  }
  if (!executable || !(await exists(executable))) {
    throw new Error(
      '找不到 Agent 預裝的 Visual Studio MSBuild；請安裝 Visual Studio 2022／Build Tools（MSBuild >=17.8）及專案所需 workloads，或設定 MSBUILD_EXE_PATH。Task 不會安裝整套 Visual Studio。',
    );
  }
  let version: string | undefined;
  try {
    version = (
      await run({ executable, args: ['-version', '-nologo'], cwd, env, timeoutMs: 30_000 })
    ).stdout
      .trim()
      .match(/^(\d+\.\d+\.\d+)(?:\.\d+)?$/)?.[1];
  } catch {
    /* 回報必要條件，不轉印原始工具輸出。 */
  }
  if (!version || !gte(version, '17.8.0')) {
    throw new Error(
      '需要可執行的 Visual Studio MSBuild >=17.8；此版本以 structured property evaluation 保留傳統專案設定。請更新 Agent 的 Visual Studio 2022／Build Tools。',
    );
  }
  return { executable, version, env: { ...env } };
}

export interface FrameworkProperties {
  NuGetRestoreTargets: string;
  RestoreRepositoryPath: string;
  RestoreSolutionDirectory: string;
  TargetFrameworkVersion: string;
  TargetFrameworkIdentifier: string;
}

/** 以結構化屬性評估取得真正的 NuGet targets／Framework 設定，不從專案文字猜測。 */
export async function evaluateFrameworkProject(
  projectPath: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  cwd: string,
): Promise<FrameworkProperties> {
  try {
    const output = await run({
      executable: tool.executable,
      args: [
        projectPath,
        '-nologo',
        '-getProperty:NuGetRestoreTargets,RestoreRepositoryPath,RestoreSolutionDirectory,TargetFrameworkVersion,TargetFrameworkIdentifier',
      ],
      cwd,
      env: tool.env,
    });
    const properties = JSON.parse(output.stdout).Properties as FrameworkProperties;
    if (
      !properties ||
      typeof properties.NuGetRestoreTargets !== 'string' ||
      !properties.NuGetRestoreTargets
    ) {
      throw new Error('NuGet targets unavailable');
    }
    if (
      properties.TargetFrameworkIdentifier !== '.NETFramework' ||
      !/^v\d+(?:\.\d+){1,3}$/.test(properties.TargetFrameworkVersion)
    ) {
      throw new Error('Framework not declared');
    }
    return properties;
  } catch {
    throw new Error(
      '傳統 .NET 專案的 MSBuild/targets 評估失敗；請確認 TargetFrameworkVersion、NuGet Restore targets，及 csproj Import 所需的 Visual Studio workloads（例如 WebApplications targets）。',
    );
  }
}

/** 要求 MSBuild 解析 Framework reference assemblies，缺少 targeting pack／workloads 時明確失敗。 */
export async function verifyFrameworkTargets(
  projectPath: string,
  framework: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  cwd: string,
): Promise<void> {
  try {
    await run({
      executable: tool.executable,
      args: [projectPath, '-target:GetReferenceAssemblyPaths', '-nologo', '-verbosity:quiet'],
      cwd,
      env: tool.env,
    });
  } catch {
    throw new Error(
      `缺少或無法解析 .NET Framework ${framework} reference assemblies／專案 targets；請在 Agent 安裝相符 Developer/Targeting Pack 與 Visual Studio workloads。`,
    );
  }
}
