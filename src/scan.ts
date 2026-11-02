import type { TaskConfig } from './config';
import type { ToolContext } from './tools';
import type { ProcessRunner } from './process';
import { rm } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';

export interface ScanRequest { config: TaskConfig; tools: ToolContext; outputPath: string }
export type SbomGenerator = (request: ScanRequest, run: ProcessRunner) => Promise<void>;
export function scanExcludes(request: ScanRequest): string[] {
  // obj holds both unwanted build output and the verified NuGet dependency graph.
  // Keep only this graph readable; excluding it silently reduces cdxgen to direct refs.
  return request.config.excludes.map(pattern => (request.config.environment === 'dotnet' || request.tools.dotnetAssets?.length) && pattern === '**/obj/**'
    ? '**/obj/!(project.assets.json)' : pattern);
}
export function scanArguments(request: ScanRequest): string[] {
  return [request.tools.cdxgenCli, request.config.projectPath, '-r', '-t', request.config.environment === 'dotnet' ? 'dotnet' : 'js',
    '--required-only', '--spec-version', request.config.specVersion, '--install-deps', 'false',
    ...scanExcludes(request).flatMap(pattern => ['--exclude', pattern]), '-o', request.outputPath];
}
export const generateSbom: SbomGenerator = async (request, run) => {
  if (request.tools.dotnetAssets?.length) {
    const inputs = request.tools.dotnetAssets.map(path => relative(request.config.projectPath, path).replaceAll('\\', '/'));
    if (inputs.some(path => path === '..' || path.startsWith('../') || isAbsolute(path))) throw new Error('.NET 還原資料位於掃描根目錄外；請將專案及其還原輸出納入共同根目錄，避免遺漏間接依賴。');
    if (match(inputs, scanExcludes(request), undefined, { nobrace: false, dot: true, nocase: process.platform === 'win32' }).length) throw new Error('排除規則遮蔽必要的 .NET project.assets.json；請保留還原資料可讀，才能產生間接依賴及關係。');
  }
  await rm(request.outputPath, { force: true });
  await run({ executable: request.tools.node, args: scanArguments(request), cwd: request.config.projectPath,
    env: { ...request.tools.env, FETCH_LICENSE: String(request.config.fetchLicense), CDXGEN_NO_CACHE: String(request.config.noCache) } });
};
