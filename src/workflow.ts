import { commandRedactor, diagnosticJson, withCommandLogging } from './command-log';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { validateConfig, type TaskConfig } from './config';
import { prepareTools, type ToolPreparer, type ToolContext } from './tools';
import type { DependencyInstaller } from './install/contracts';
import { javascriptInstaller } from './install/javascript';
import { dotnetInstaller } from './install/dotnet';
import { frameworkInstaller } from './install/framework';
import { combinedInstaller } from './install/combined';
import { generateSbom, scanExcludes, type SbomGenerator } from './scan';
import { validateSbom, type SbomValidator, type ValidatedSbom } from './validation';
import { runProcess, type ProcessRunner } from './process';
import { uploadToDependencyTrack } from './dt/upload';

export type ArtifactPublisher = (sbom: ValidatedSbom, artifactName: string) => Promise<void>;
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
  /** 將安全原始錯誤加上工作階段名稱，讓使用者定位失敗位置。 */
  constructor(
    public stage: string,
    cause: unknown,
  ) {
    super(`[${stage}] ${cause instanceof Error ? cause.message : '執行失敗'}`);
  }
}

/** 執行單一階段並統一包裝錯誤，不改變成功結果或吞掉失敗。 */
async function stage<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new StageError(name, error);
  }
}

/** 依開發環境派送依賴安裝，保留注入 installer 優先序及各路徑專用的認證／sourceRoot 設定。 */
async function installDependencies(
  config: TaskConfig,
  tools: ToolContext,
  run: ProcessRunner,
  tempDirectory: string,
  services: WorkflowServices,
): Promise<void> {
  const common = {
    tempDirectory,

    /** 各安裝路徑共用已約束為安全摘要的日誌輸出。 */
    log: services.log,
  };

  if (services.installer) {
    return services.installer.install(config.projectPath, tools, run, {
      ...common,
      npmCredentials: config.npmCredentials,
      nugetCredentials: config.nugetCredentials,
      sourceRoot: config.projectPath,
    });
  }
  if (config.environment === 'dotnet') {
    return dotnetInstaller.install(config.projectPath, tools, run, {
      ...common,
      excludes: config.excludes,
      nugetCredentials: config.nugetCredentials,
      target: config.dotnetTarget,
    });
  }
  if (config.environment === 'netframework') {
    return frameworkInstaller.install(config.projectPath, tools, run, {
      ...common,
      excludes: config.excludes,
      nugetCredentials: config.nugetCredentials,
    });
  }
  if (config.environment === 'combined') {
    return combinedInstaller.install(config.projectPath, tools, run, {
      ...common,
      excludes: config.excludes,
      npmCredentials: config.npmCredentials,
      nugetCredentials: config.nugetCredentials,
    });
  }

  return javascriptInstaller.install(config.projectPath, tools, run, {
    ...common,
    npmCredentials: config.npmCredentials,
    sourceRoot: config.projectPath,
  });
}

/** 依序準備、還原、單次掃描及驗證；DT 失敗先保留錯誤，發佈有效成品後再讓 Task 失敗。 */
export async function runWorkflow(
  input: TaskConfig,
  tempDirectory: string,
  services: WorkflowServices,
): Promise<ValidatedSbom> {
  const config = await stage('參數驗證', () => validateConfig(input));

  if (['dotnet', 'netframework'].includes(config.environment)) {
    services.log(
      config.dotnetTarget
        ? '.NET Core 已保留選取的方案／專案，將執行單次還原並依還原圖限制掃描範圍。'
        : '.NET 專案路徑已解析為掃描根目錄；目錄模式會遞迴探索專案並套用排除規則。',
    );
  }

  /** 選用測試注入或正式子程序執行器，所有後續階段共用相同執行介面。 */
  const run = withCommandLogging(services.run ?? runProcess, services.log, commandRedactor(config));

  await mkdir(tempDirectory, { recursive: true });

  // 工具與依賴準備完成後，才開始產生唯一一份掃描輸出。
  const tools = await stage('工具準備', () =>
    (services.prepare ?? prepareTools)(
      { nodeVersion: config.nodeVersion, cdxgenVersion: config.cdxgenVersion, tempDirectory },
      run,
      services.log,
    ),
  );

  await stage('依賴安裝', () => installDependencies(config, tools, run, tempDirectory, services));

  // 只掃描一次，再驗證同一份檔案；上傳與成品不能各自重建 BOM。
  const outputPath = join(tempDirectory, 'sbom', config.sbomFileName!);

  await mkdir(join(tempDirectory, 'sbom'), { recursive: true });
  services.log('##[section]開始產生 SBOM（cdxgen）');
  services.log(
    commandRedactor(config)(
      `掃描設定：${diagnosticJson({
        environment: config.environment,
        scanRoot: config.projectPath,
        restoreTarget: config.dotnetTarget,
        requiredOnly: true,
        specVersion: config.specVersion,
        installDeps: false,
        fetchLicense: config.fetchLicense,
        noCache: config.noCache,
        excludes: scanExcludes({ config, tools, outputPath }),
        scopedToRestoreGraph: Boolean(tools.dotnetScanIncludes?.length),
        artifact: `${config.artifactName}/${config.sbomFileName}`,
      })}`,
    ),
  );
  await stage('SBOM 產生', () =>
    (services.generate ?? generateSbom)({ config, tools, outputPath }, run),
  );

  const sbom = await stage('SBOM 驗證', () =>
    (services.validate ?? validateSbom)(outputPath, config.specVersion),
  );

  services.log(`CycloneDX ${config.specVersion} 驗證通過；組件數：${sbom.componentCount}。`);

  // DT 失敗先保留，仍讓有效成品排入 Agent 上傳佇列。
  let uploadError: unknown;

  if (config.uploadToDt) {
    try {
      await stage('DT 上傳', () =>
        services.upload
          ? services.upload(sbom)
          : uploadToDependencyTrack(sbom, config.dt!, services.log),
      );
    } catch (error) {
      uploadError = error;
    }
  }

  // 成品請求結束後才傳遞先前 DT 錯誤，不能吞掉任一失敗。
  await stage('成品發佈', () => services.publish(sbom, config.artifactName!));

  if (uploadError) {
    throw uploadError;
  }

  return sbom;
}
