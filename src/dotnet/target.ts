import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';
import type { DotnetInstallOptions } from '../install/dotnet';
import type { ProcessRunner } from '../process';
import type { ToolContext } from '../tools';
import { discoverDotnetProjects } from './projects';
import { inspectRestoreGraph, restoreDotnetProject } from './restore';
import { prepareDotnetSdk } from './sdk';

/** 保留方案或專案作為單次還原目標，並以還原圖限制後續掃描輸入。 */
export async function restoreSelectedDotnetTarget(
  root: string,
  target: string,
  tools: ToolContext,
  run: ProcessRunner,
  options: DotnetInstallOptions,
): Promise<void> {
  const tempDirectory = options.tempDirectory ?? tools.env.AGENT_TEMPDIRECTORY;

  if (!tempDirectory) throw new Error('.NET 工具準備需要 Task 暫存目錄。');
  const sdk = await prepareDotnetSdk(dirname(target), run, {
    cacheDirectory: tools.env.AGENT_TOOLSDIRECTORY ?? join(tempDirectory, 'tools'),
    tempDirectory: join(tempDirectory, 'dotnet'),
    env: { ...tools.env },
    log: options.log,
  });
  const graph = await inspectRestoreGraph(target, sdk, run, join(tempDirectory, 'dotnet'));
  const discovered = await discoverDotnetProjects(root);

  /** 統一路徑大小寫比對，保留 Windows 的實體專案識別。 */
  const key = (path: string) =>
    process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

  /** 將允許輸入轉為相對 glob，拒絕超出掃描邊界的參照或自訂輸出。 */
  const withinRoot = (path: string) => {
    const local = relative(root, path).replaceAll('\\', '/');
    if (!local || local === '..' || local.startsWith('../') || isAbsolute(local)) {
      throw new Error(
        '.NET 方案參照或還原資料位於掃描根目錄外；請使用包含所有專案與輸出的共同根目錄。',
      );
    }
    return local;
  };

  for (const project of graph) {
    withinRoot(project.projectPath);
    withinRoot(project.assetsPath);
    if (
      !discovered.some((found) => key(found.path) === key(project.projectPath) && found.sdkStyle)
    ) {
      throw new Error('.NET Core 方案包含傳統或無法辨識的專案；請使用 SDK-style 專案。');
    }
  }
  const excluded = new Set(
    match(
      graph.map((project) => withinRoot(project.projectPath)),
      options.excludes ?? [],
      undefined,
      { nobrace: false, dot: true, nocase: process.platform === 'win32' },
    ),
  );
  const selected = graph.filter((project) => !excluded.has(withinRoot(project.projectPath)));

  if (!selected.length) throw new Error('排除規則遮蔽方案的全部 .NET 專案，沒有可掃描的還原資料。');

  options.log?.(
    `.NET Core：以選取的方案／專案執行單次還原（還原圖 ${graph.length} 個專案；掃描 ${selected.length} 個）。`,
  );
  await restoreDotnetProject(
    target,
    sdk,
    run,
    join(tempDirectory, 'dotnet'),
    options.nugetCredentials,
    graph,
  );
  tools.env = { ...tools.env, ...sdk.env };
  tools.dotnetAssets = selected.map((project) => project.assetsPath);

  /** 路徑以 glob 字元跳脫，避免名稱中的括號／逗號擴大掃描範圍。 */
  const literal = (path: string) => withinRoot(path).replace(/([*?\[\]{}(),!+@])/g, '\\$1');

  tools.dotnetScanIncludes = [
    ...new Set(
      selected.flatMap((project) => [literal(project.projectPath), literal(project.assetsPath)]),
    ),
    '**/*.props',
  ];
  options.log?.(
    `.NET 單次還原完成（SDK ${sdk.version}）；已驗證還原圖的 project.assets.json，掃描限指定方案／專案及其參照。`,
  );
}
