import type { TaskConfig } from './config';
import type { ToolContext } from './tools';
import type { ProcessRunner } from './process';
import { rm } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';

export interface ScanRequest {
  config: TaskConfig;
  tools: ToolContext;
  outputPath: string;
}
export type SbomGenerator = (request: ScanRequest, run: ProcessRunner) => Promise<void>;

/** 只轉換必要的 obj/assets 例外，保留還原依賴圖而不靜默改寫其他自訂 glob。 */
export function scanExcludes(request: ScanRequest): string[] {
  // obj 同時含編譯產物與已驗證的 NuGet 依賴圖；僅保留依賴圖可讀，
  // 否則 cdxgen 可能靜默退化成只有直接參照的結果。
  return request.config.excludes.map((pattern) =>
    (['dotnet', 'combined'].includes(request.config.environment) ||
      request.tools.dotnetAssets?.length) &&
    pattern === '**/obj/**'
      ? '**/obj/!(project.assets.json)'
      : pattern,
  );
}

/** 組合一次遞迴 required-only 掃描參數，固定規格並禁止 cdxgen 再次安裝依賴。 */
export function scanArguments(request: ScanRequest): string[] {
  const types =
    request.config.environment === 'combined'
      ? ['dotnet', 'js']
      : [['dotnet', 'netframework'].includes(request.config.environment) ? 'dotnet' : 'js'];

  return [
    request.tools.cdxgenCli,
    request.config.projectPath,
    '-r',
    ...types.flatMap((type) => ['-t', type]),
    '--required-only',
    '--spec-version',
    request.config.specVersion,
    '--install-deps',
    'false',
    ...scanExcludes(request).flatMap((pattern) => ['--exclude', pattern]),
    '-o',
    request.outputPath,
  ];
}

/** 確認必要還原資料在掃描範圍內且未被排除，移除舊輸出後執行單次掃描。 */
export const generateSbom: SbomGenerator = async (request, run) => {
  if (request.tools.dotnetAssets?.length || request.tools.dotnetPackageFiles?.length) {
    const inputs = [
      ...(request.tools.dotnetAssets ?? []),
      ...(request.tools.dotnetPackageFiles ?? []),
    ].map((path) => relative(request.config.projectPath, path).replaceAll('\\', '/'));

    if (inputs.some((path) => path === '..' || path.startsWith('../') || isAbsolute(path))) {
      throw new Error(
        '.NET 還原資料位於掃描根目錄外；請將專案及其還原輸出納入共同根目錄，避免遺漏間接依賴。',
      );
    }
    if (
      match(inputs, scanExcludes(request), undefined, {
        nobrace: false,
        dot: true,
        nocase: process.platform === 'win32',
      }).length
    ) {
      throw new Error(
        '排除規則遮蔽必要的 .NET project.assets.json／packages.config／nupkg；請保留還原資料可讀，才能產生間接依賴及關係。',
      );
    }
  }

  await rm(request.outputPath, { force: true });
  await run({
    executable: request.tools.node,
    args: scanArguments(request),
    cwd: request.config.projectPath,
    env: {
      ...request.tools.env,
      FETCH_LICENSE: String(request.config.fetchLicense),
      CDXGEN_NO_CACHE: String(request.config.noCache),
    },
  });
};
