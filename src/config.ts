import { realpath, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CDXGEN_VERSION, SUPPORTED_SPEC_VERSIONS, validateToolOptions } from './tool-options';
import { DEFAULT_DT_URL, validateDtConfig, type DtConfig } from './dt/config';
import { validateOsvVersion } from './osv';
import { validateOsvFailOn, type OsvFailOn } from './osv-threshold';
import {
  parseNpmCredentials,
  validateNpmCredentials,
  type NpmCredential,
} from './install/npm-credentials';

import {
  parseNuGetCredentials,
  validateNuGetCredentials,
  type NuGetCredential,
} from './dotnet/credentials';

export const DEFAULT_EXCLUDES =
  '**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**';
export const dtSbomVariantValues = ['full', 'product'] as const;
export type DtSbomVariant = (typeof dtSbomVariantValues)[number];

/** 驗證 DT 要上傳的 SBOM 類型，預設完整 SBOM。 */
export function validateDtSbomVariant(value: unknown = 'full'): DtSbomVariant {
  if (typeof value !== 'string' || !dtSbomVariantValues.some((option) => option === value)) {
    throw new Error('參數 dtSbomVariant 必須是 full 或 product。');
  }

  return value as DtSbomVariant;
}

export interface TaskConfig {
  environment: string;
  projectPath: string;
  dotnetTarget?: string;
  artifactName?: string;
  sbomFileName?: string;
  runOsv?: boolean;
  osvVersion?: string;
  osvFailOn?: OsvFailOn;
  nodeVersion: string;
  cdxgenVersion: string;
  specVersion: string;
  excludes: string[];
  fetchLicense: boolean;
  noCache: boolean;
  uploadToDt: boolean;
  dtSbomVariant?: DtSbomVariant;
  dt?: DtConfig;
  npmCredentials?: NpmCredential[];
  nugetCredentials?: NuGetCredential[];
}

/** 依花括號與字元類別切分排除規則，保留 glob 內的逗號並拒絕不成對語法。 */
export function parseExcludes(value: string): string[] {
  const result: string[] = [];
  let depth = 0,
    start = 0,
    escaped = false,
    inClass = false;

  for (let index = 0; index < value.length; index++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (value[index] === '\\') {
      escaped = true;
      continue;
    }
    if (value[index] === '[') {
      inClass = true;
      continue;
    }
    if (value[index] === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (inClass) {
      continue;
    }
    if (value[index] === '{') {
      depth++;
    }
    if (value[index] === '}') {
      depth--;
    }
    if (depth < 0) {
      throw new Error('排除規則的花括號不成對。');
    }
    if (value[index] === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (depth !== 0) {
    throw new Error('排除規則的花括號不成對。');
  }

  result.push(value.slice(start).trim());

  return result.filter(Boolean);
}
export type InputReader = (name: string) => string | undefined;

/** 將 Classic／YAML 文字輸入轉成共用設定，套用預設並只在啟用時讀取 OSV 與 DT 欄位。 */
export function readTaskConfig(read: InputReader): TaskConfig {
  /** 讀取必要文字並拒絕空白或 NUL，僅對未提供的值採用預設。 */
  const text = (name: string, fallback?: string): string => {
    const value = read(name);

    if (value === undefined && fallback !== undefined) {
      return fallback;
    }
    if (value === undefined || !value.trim() || value.includes('\0')) {
      throw new Error(`參數 ${name} 必須提供有效值。`);
    }

    return value.trim();
  };

  /** 嚴格解析 true／false，避免 YAML 的其他布林寫法被誤當有效輸入。 */
  const boolean = (name: string, fallback: boolean): boolean => {
    const value = read(name);

    if (value === undefined) {
      return fallback;
    }
    if (/^true$/i.test(value.trim())) {
      return true;
    }
    if (/^false$/i.test(value.trim())) {
      return false;
    }

    throw new Error(`參數 ${name} 必須是 true 或 false。`);
  };
  const excludes = read('excludes');
  const uploadToDt = boolean('uploadToDt', false);
  const runOsv = boolean('runOsv', true);

  return {
    environment: text('environment', 'javascript'),
    projectPath: text('projectPath'),
    artifactName: read('artifactName')?.trim() || 'SBOM',
    sbomFileName: read('sbomFileName')?.trim() || 'sbom.cdx.json',
    runOsv,
    osvVersion: runOsv ? read('osvVersion')?.trim() || 'latest' : undefined,
    osvFailOn: runOsv ? validateOsvFailOn(read('osvFailOn')?.trim() || 'unknown') : undefined,
    nodeVersion: text('nodeVersion', '24.x'),
    cdxgenVersion: read('cdxgenVersion')?.trim() || CDXGEN_VERSION,
    specVersion: text('specVersion', '1.6'),
    excludes: parseExcludes(excludes === undefined ? DEFAULT_EXCLUDES : excludes),
    fetchLicense: boolean('fetchLicense', true),
    noCache: boolean('noCache', true),
    uploadToDt,
    dtSbomVariant: uploadToDt
      ? validateDtSbomVariant(read('dtSbomVariant')?.trim() || 'full')
      : 'full',
    dt: uploadToDt
      ? validateDtConfig({
          apiUrl: text('dtApiUrl', DEFAULT_DT_URL),
          projectUuid: text('dtProjectUuid'),
          apiKey: text('dtApiKey'),
          skipTlsCertificateCheck: boolean('skipDtTlsCertificateCheck', false),
        })
      : undefined,
    npmCredentials: parseNpmCredentials(read('npmCredentials')),
    nugetCredentials: parseNuGetCredentials(read('nugetCredentials')),
  };
}

/** 在下載工具前驗證模式、版本、路徑與認證格式，回傳實體專案根目錄。 */
export async function validateConfig(config: TaskConfig): Promise<TaskConfig> {
  if (!['win32', 'linux'].includes(process.platform)) {
    throw new Error('目前僅支援 Windows 與 Linux Agent。');
  }
  if (!['javascript', 'vue', 'dotnet', 'netframework', 'combined'].includes(config.environment)) {
    throw new Error(
      '此版本提供 JavaScript／TypeScript、.NET Core、.NET Framework 與 .NET Core 前後端合併模式。',
    );
  }
  if (config.environment === 'netframework' && process.platform !== 'win32') {
    throw new Error('.NET Framework 模式僅支援 Windows Agent。');
  }

  for (const name of ['fetchLicense', 'noCache', 'uploadToDt'] as const) {
    if (typeof config[name] !== 'boolean') {
      throw new Error(`參數 ${name} 必須是布林值。`);
    }
  }

  if (!SUPPORTED_SPEC_VERSIONS.includes(config.specVersion as '1.6')) {
    throw new Error('此版本僅驗證 CycloneDX 1.6。');
  }

  validateToolOptions(config.nodeVersion, config.cdxgenVersion);

  const runOsv = config.runOsv ?? true;
  if (typeof runOsv !== 'boolean') throw new Error('參數 runOsv 必須是布林值。');
  const osvVersion = runOsv ? validateOsvVersion(config.osvVersion ?? 'latest') : undefined;
  const osvFailOn = runOsv ? validateOsvFailOn(config.osvFailOn) : undefined;
  const dtSbomVariant = config.uploadToDt ? validateDtSbomVariant(config.dtSbomVariant) : 'full';

  const artifactName = config.artifactName ?? 'SBOM';
  const sbomFileName = config.sbomFileName ?? 'sbom.cdx.json';

  for (const [label, value] of [
    ['成品名稱', artifactName],
    ['SBOM 檔名', sbomFileName],
  ]) {
    if (
      !value ||
      value.length > 128 ||
      /[<>:"/\\|?*+%{}\x00-\x1f\x7f]/.test(value) ||
      /[. ]$/.test(value) ||
      /^\s|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
    ) {
      throw new Error(`${label}必須是安全的單一名稱，不可包含路徑、控制字元或保留名稱。`);
    }
  }
  if (!/\.json$/i.test(sbomFileName)) {
    throw new Error('SBOM 檔名必須以 .json 結尾；輸出格式為 CycloneDX JSON。');
  }

  if (
    !Array.isArray(config.excludes) ||
    config.excludes.some((value) => typeof value !== 'string' || value.includes('\0'))
  ) {
    throw new Error('排除規則必須是 glob 字串清單。');
  }

  let projectPath = await realpath(
    config.environment === 'dotnet' && config.dotnetTarget
      ? config.dotnetTarget
      : config.projectPath,
  );
  const projectStat = await stat(projectPath);
  let dotnetTarget: string | undefined;

  if (!projectStat.isDirectory()) {
    if (
      ['dotnet', 'netframework'].includes(config.environment) &&
      projectStat.isFile() &&
      /\.(?:slnx?|csproj|fsproj|vbproj)$/i.test(projectPath)
    ) {
      if (config.environment === 'dotnet') dotnetTarget = projectPath;
      projectPath = dirname(projectPath);
    } else {
      throw new Error(
        ['dotnet', 'netframework'].includes(config.environment)
          ? '專案路徑必須是目錄或 .sln／.slnx／.csproj／.fsproj／.vbproj 檔案。'
          : '專案路徑必須是目錄。',
      );
    }
  }

  return {
    ...config,
    environment: config.environment === 'vue' ? 'javascript' : config.environment,
    projectPath,
    dotnetTarget,
    artifactName,
    sbomFileName,
    runOsv,
    osvVersion,
    osvFailOn,
    dtSbomVariant,
    dt: config.uploadToDt ? validateDtConfig(config.dt) : undefined,
    nugetCredentials:
      config.nugetCredentials === undefined
        ? undefined
        : validateNuGetCredentials(config.nugetCredentials),
    npmCredentials:
      config.npmCredentials === undefined
        ? undefined
        : validateNpmCredentials(config.npmCredentials),
  };
}
