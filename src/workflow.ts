import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { validateConfig, type TaskConfig } from './config';
import { prepareTools, type ToolPreparer } from './tools';
import type { DependencyInstaller } from './install/contracts';
import { javascriptInstaller } from './install/javascript';
import { dotnetInstaller } from './install/dotnet';
import { frameworkInstaller } from './install/framework';
import { combinedInstaller } from './install/combined';
import { generateSbom, type SbomGenerator } from './scan';
import { validateSbom, type SbomValidator, type ValidatedSbom } from './validation';
import { runProcess, type ProcessRunner } from './process';
import { uploadToDependencyTrack } from './dt/upload';

export type ArtifactPublisher = (sbom: ValidatedSbom) => Promise<void>;
export type SbomUploader = (sbom: ValidatedSbom) => Promise<void>;
export interface WorkflowServices {
  log: (message: string) => void;
  publish: ArtifactPublisher;
  run?: ProcessRunner;
  prepare?: ToolPreparer;
  installer?: DependencyInstaller;
  generate?: SbomGenerator;
  validate?: SbomValidator;
  upload?: SbomUploader;
}
export class StageError extends Error {
  constructor(public stage: string, cause: unknown) {
    super(`[${stage}] ${cause instanceof Error ? cause.message : '執行失敗'}`);
  }
}
async function stage<T>(name: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) { throw new StageError(name, error); }
}
export async function runWorkflow(input: TaskConfig, tempDirectory: string, services: WorkflowServices): Promise<ValidatedSbom> {
  const config = await stage('參數驗證', () => validateConfig(input));
  const run = services.run ?? runProcess;
  await mkdir(tempDirectory, { recursive: true });
  const tools = await stage('工具準備', () => (services.prepare ?? prepareTools)({ nodeVersion: config.nodeVersion, cdxgenVersion: config.cdxgenVersion, tempDirectory }, run, services.log));
  await stage('依賴安裝', () => services.installer
    ? services.installer.install(config.projectPath, tools, run, { tempDirectory, log: services.log, npmCredentials: config.npmCredentials, nugetCredentials: config.nugetCredentials, sourceRoot: config.projectPath })
    : config.environment === 'dotnet'
      ? dotnetInstaller.install(config.projectPath, tools, run, { tempDirectory, log: services.log, excludes: config.excludes, nugetCredentials: config.nugetCredentials })
      : config.environment === 'netframework'
        ? frameworkInstaller.install(config.projectPath, tools, run, { tempDirectory, log: services.log, excludes: config.excludes, nugetCredentials: config.nugetCredentials })
        : config.environment === 'combined'
          ? combinedInstaller.install(config.projectPath, tools, run, { tempDirectory, log: services.log, excludes: config.excludes, npmCredentials: config.npmCredentials, nugetCredentials: config.nugetCredentials })
          : javascriptInstaller.install(config.projectPath, tools, run, { tempDirectory, log: services.log, npmCredentials: config.npmCredentials, sourceRoot: config.projectPath }));
  const outputPath = join(tempDirectory, 'sbom', 'bom.json');
  await mkdir(join(tempDirectory, 'sbom'), { recursive: true });
  await stage('SBOM 產生', () => (services.generate ?? generateSbom)({ config, tools, outputPath }, run));
  const sbom = await stage('SBOM 驗證', () => (services.validate ?? validateSbom)(outputPath, config.specVersion));
  services.log(`CycloneDX ${config.specVersion} 驗證通過；組件數：${sbom.componentCount}。`);
  let uploadError: unknown;
  if (config.uploadToDt) {
    try {
      await stage('DT 上傳', () => services.upload ? services.upload(sbom) : uploadToDependencyTrack(sbom, config.dt!, services.log));
    } catch (error) { uploadError = error; }
  }
  await stage('成品發佈', () => services.publish(sbom));
  if (uploadError) throw uploadError;
  return sbom;
}
