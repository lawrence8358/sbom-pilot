import type { TaskConfig } from './config';
import type { ToolContext } from './tools';
import type { ProcessRunner } from './process';
import { rm } from 'node:fs/promises';

export interface ScanRequest { config: TaskConfig; tools: ToolContext; outputPath: string }
export type SbomGenerator = (request: ScanRequest, run: ProcessRunner) => Promise<void>;
export function scanArguments(request: ScanRequest): string[] {
  return [request.tools.cdxgenCli, request.config.projectPath, '-r', '-t', request.config.environment === 'dotnet' ? 'dotnet' : 'js',
    '--required-only', '--spec-version', request.config.specVersion, '--install-deps', 'false',
    ...request.config.excludes.flatMap(pattern => ['--exclude', pattern]), '-o', request.outputPath];
}
export const generateSbom: SbomGenerator = async (request, run) => {
  await rm(request.outputPath, { force: true });
  await run({ executable: request.tools.node, args: scanArguments(request), cwd: request.config.projectPath,
    env: { ...request.tools.env, FETCH_LICENSE: String(request.config.fetchLicense), CDXGEN_NO_CACHE: String(request.config.noCache) } });
};
