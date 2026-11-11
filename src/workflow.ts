import { commandRedactor, diagnosticJson, withCommandLogging } from './command-log';
import { basename, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { validateConfig, type TaskConfig, type DtSbomVariant } from './config';
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
import { createOsvScanner, type OsvScanner, type OsvReport } from './osv';
import { partitionOsvFindings, osvThresholdMessage } from './osv-threshold';
import { taskLogIssue } from './logging-command';
import { logOsvIssues } from './osv-issues';
import { developmentExtraFindings, osvFindingIdentity, type OsvFinding } from './osv-report';
import type { OsvTabReport } from './shared/osv-tab-contract';

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
  scanOsv?: OsvScanner;
  publishReport?: (report: OsvReport, artifactName: string) => Promise<void>;
  publishTabReport?: (report: OsvTabReport, outputPath: string) => Promise<void>;
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

/** 共用一次還原產生並驗證兩份 SBOM；依完整 OSV 門檻阻擋 DT，發佈成品後彙整錯誤。 */
export async function runWorkflow(
  input: TaskConfig,
  tempDirectory: string,
  services: WorkflowServices,
): Promise<ValidatedSbom> {
  services.log('##[section]開始驗證工作設定');
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

  // 工具與依賴準備完成後，兩份掃描共用同一份還原資料。
  const tools = await stage('工具準備', () =>
    (services.prepare ?? prepareTools)(
      { nodeVersion: config.nodeVersion, cdxgenVersion: config.cdxgenVersion, tempDirectory },
      run,
      services.log,
    ),
  );

  services.log('##[section]開始安裝／還原專案依賴');
  await stage('依賴安裝', () => installDependencies(config, tools, run, tempDirectory, services));

  // 產品與完整 SBOM 只在必要套件篩選及輸出路徑上有差異。
  const outputPath = join(tempDirectory, 'sbom', config.sbomFileName!);
  const fullFileName = config.fullSbomFileName;
  const outputs: {
    variant: DtSbomVariant;
    label: string;
    outputPath: string;
    requiredOnly: boolean;
    artifact: string;
  }[] = [
    {
      variant: 'product',
      label: '產品 SBOM',
      outputPath,
      requiredOnly: true,
      artifact: `${config.artifactName}/${config.sbomFileName}`,
    },
    {
      variant: 'full',
      label: '完整 SBOM',
      outputPath: join(tempDirectory, 'sbom', fullFileName),
      requiredOnly: false,
      artifact: `${config.artifactName}/${fullFileName}`,
    },
  ];

  await mkdir(join(tempDirectory, 'sbom'), { recursive: true });
  services.log('##[section]開始產生 SBOM（cdxgen）');
  services.log(
    commandRedactor(config)(
      `掃描設定：${diagnosticJson({
        environment: config.environment,
        scanRoot: config.projectPath,
        restoreTarget: config.dotnetTarget,
        outputs,
        specVersion: config.specVersion,
        installDeps: false,
        fetchLicense: config.fetchLicense,
        noCache: config.noCache,
        excludes: scanExcludes({ config, tools, outputPath }),
        scopedToRestoreGraph: Boolean(tools.dotnetScanIncludes?.length),
      })}`,
    ),
  );
  const sboms: {
    variant: DtSbomVariant;
    label: string;
    sbom: ValidatedSbom;
    report?: OsvReport;
  }[] = [];
  for (const output of outputs) {
    const { label, variant } = output;
    await stage(`SBOM 產生（${label}）`, () =>
      (services.generate ?? generateSbom)({ config, tools, ...output }, run),
    );
    services.log(`##[section]開始驗證 SBOM（CycloneDX，${label}）`);
    const validated = await stage(`SBOM 驗證（${label}）`, () =>
      (services.validate ?? validateSbom)(output.outputPath, config.specVersion),
    );
    services.log(
      `${label} CycloneDX ${config.specVersion} 驗證通過；組件數：${validated.componentCount}。`,
    );
    sboms.push({ variant, label, sbom: validated });
  }
  const product = sboms.find((item) => item.variant === 'product')!;
  const full = sboms.find((item) => item.variant === 'full')!;

  // OSV／門檻／DT 各自保留錯誤，仍嘗試發佈有效 SBOM 及已完成的報告。
  const errors: unknown[] = [];
  let developmentExtra: OsvFinding[] = [];
  let dtBlocked = false;
  let exceededThreshold = false;

  if (config.runOsv) {
    const threshold = config.osvFailOn!;

    /** 同次工作流程的兩份 SBOM 共用一次工具取得，測試可注入掃描服務。 */
    const scan = services.scanOsv ?? createOsvScanner();

    for (const entry of sboms) {
      const { variant, label, sbom: validated } = entry;
      try {
        entry.report = await stage(`OSV 弱點掃描（${label}）`, () =>
          scan(
            {
              sbom: validated,
              variant,
              version: config.osvVersion!,
              tempDirectory,
              cacheDirectory:
                process.env.AGENT_TOOLSDIRECTORY || join(tempDirectory, 'tools-cache'),
              env: tools.env,
            },
            run,
            services.log,
          ),
        );
      } catch (error) {
        errors.push(error);
        if (variant === 'product') {
          services.log(taskLogIssue('warning', '產品 SBOM 弱點掃描失敗，無法區分開發套件額外弱點'));
        }
        if (threshold !== 'warnOnly') {
          dtBlocked = true;
          if (config.uploadToDt)
            services.log(`${label} OSV 弱點掃描失敗且門檻非「僅警告」；已略過 DT 上傳。`);
        }
      }
    }
    const report = full.report;
    if (report) {
      const groups = partitionOsvFindings(report.findingList, threshold);
      const { exceeded } = groups;
      developmentExtra = product.report
        ? developmentExtraFindings(product.report.findingList, report.findingList)
        : [];
      logOsvIssues(groups, services.log, new Set(developmentExtra.map(osvFindingIdentity)));
      if (exceeded.length) {
        exceededThreshold = true;
        dtBlocked = true;
        const message = osvThresholdMessage(exceeded, threshold, Boolean(config.uploadToDt));
        services.log(message);
        errors.push(new Error(message));
      }
    }
  } else {
    services.log('OSV 弱點掃描未啟用，略過工具準備與掃描。');
  }

  if (config.uploadToDt && !dtBlocked) {
    services.log('##[section]開始上傳 SBOM 至 Dependency-Track（DT）');
    const selected = sboms.find((item) => item.variant === config.dtSbomVariant)!;
    const dtSbom = selected.sbom;
    services.log(`DT 上傳版本：${selected.label}（${basename(dtSbom.path)}）。`);
    try {
      await stage('DT 上傳', () =>
        services.upload
          ? services.upload(dtSbom)
          : uploadToDependencyTrack(dtSbom, config.dt!, services.log),
      );
    } catch (error) {
      errors.push(error);
    }
  } else if (!config.uploadToDt) {
    services.log('DT 上傳未啟用，略過此階段。');
  }

  // 成品請求結束後才傳遞先前 OSV／門檻／DT 錯誤，不能吞掉任一失敗。
  services.log('##[section]開始發佈 SBOM 成品（Azure Pipelines）');
  for (const { sbom: validated, label } of sboms) {
    try {
      await stage(`成品發佈（${label}）`, () => services.publish(validated, config.artifactName!));
    } catch (error) {
      errors.push(error);
    }
  }

  for (const { report, label } of sboms) {
    if (!report) continue;
    services.log('##[section]開始發佈 OSV 弱點報告（Azure Pipelines）');
    try {
      await stage(`OSV 成品發佈（${label}）`, async () => {
        if (!services.publishReport) throw new Error('缺少 OSV 報告成品發佈介面。');
        await services.publishReport(report, config.artifactName!);
      });
    } catch (error) {
      errors.push(error);
    }
  }

  // 頁籤附件與下載成品分開發佈，先前階段失敗仍保留可用的掃描資料。
  services.log('##[section]開始發佈 OSV 弱點報告頁籤資料');
  try {
    await stage('OSV 頁籤附件發佈', async () => {
      if (!services.publishTabReport) throw new Error('缺少 OSV 頁籤附件發佈介面。');
      await services.publishTabReport(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          scannerVersion: full.report?.version ?? product.report?.version,
          threshold: config.runOsv ? config.osvFailOn : undefined,
          exceeded: exceededThreshold,
          dtSkipped: Boolean(config.uploadToDt && dtBlocked),
          sboms: { product: config.sbomFileName!, full: fullFileName },
          product: {
            status: !config.runOsv ? 'disabled' : product.report ? 'completed' : 'failed',
            findings: product.report?.findingList ?? [],
          },
          developmentExtra: {
            // 差集依賴兩份成功結果，不能把比較失敗當成沒有額外弱點。
            status: !config.runOsv
              ? 'disabled'
              : product.report && full.report
                ? 'completed'
                : 'failed',
            findings: developmentExtra,
          },
        },
        join(tempDirectory, 'osv-tab-report.json'),
      );
    });
  } catch (error) {
    errors.push(error);
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new Error(
      errors.map((error) => (error instanceof Error ? error.message : '執行失敗')).join('；'),
    );

  return product.sbom;
}
