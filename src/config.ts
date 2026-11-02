import { realpath, stat } from 'node:fs/promises';
import { CDXGEN_VERSION, SUPPORTED_SPEC_VERSIONS, validateToolOptions } from './tool-options';
import { DEFAULT_DT_URL, validateDtConfig, type DtConfig } from './dt/config';

export const DEFAULT_EXCLUDES = '**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**';
export interface TaskConfig {
  environment: string;
  projectPath: string;
  nodeVersion: string;
  cdxgenVersion: string;
  specVersion: string;
  excludes: string[];
  fetchLicense: boolean;
  noCache: boolean;
  uploadToDt: boolean;
  dt?: DtConfig;
}
export function parseExcludes(value: string): string[] {
  const result: string[] = [];
  let depth = 0, start = 0, escaped = false, inClass = false;
  for (let index = 0; index < value.length; index++) {
    if (escaped) { escaped = false; continue; }
    if (value[index] === '\\') { escaped = true; continue; }
    if (value[index] === '[') { inClass = true; continue; }
    if (value[index] === ']' && inClass) { inClass = false; continue; }
    if (inClass) continue;
    if (value[index] === '{') depth++;
    if (value[index] === '}') depth--;
    if (depth < 0) throw new Error('排除規則的花括號不成對。');
    if (value[index] === ',' && depth === 0) { result.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (depth !== 0) throw new Error('排除規則的花括號不成對。');
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}
export type InputReader = (name: string) => string | undefined;
export function readTaskConfig(read: InputReader): TaskConfig {
  const text = (name: string, fallback?: string): string => {
    const value = read(name);
    if (value === undefined && fallback !== undefined) return fallback;
    if (value === undefined || !value.trim() || value.includes('\0')) throw new Error(`參數 ${name} 必須提供有效值。`);
    return value.trim();
  };
  const boolean = (name: string, fallback: boolean): boolean => {
    const value = read(name);
    if (value === undefined) return fallback;
    if (/^true$/i.test(value.trim())) return true;
    if (/^false$/i.test(value.trim())) return false;
    throw new Error(`參數 ${name} 必須是 true 或 false。`);
  };
  const excludes = read('excludes');
  const uploadToDt = boolean('uploadToDt', false);
  return {
    environment: text('environment', 'vue'), projectPath: text('projectPath'),
    nodeVersion: text('nodeVersion', '24.x'), cdxgenVersion: read('cdxgenVersion')?.trim() || CDXGEN_VERSION,
    specVersion: text('specVersion', '1.6'), excludes: parseExcludes(excludes === undefined ? DEFAULT_EXCLUDES : excludes),
    fetchLicense: boolean('fetchLicense', true), noCache: boolean('noCache', true), uploadToDt,
    dt: uploadToDt ? validateDtConfig({ apiUrl: text('dtApiUrl', DEFAULT_DT_URL), projectUuid: text('dtProjectUuid'), apiKey: text('dtApiKey'), skipTlsCertificateCheck: boolean('skipDtTlsCertificateCheck', false) }) : undefined,
  };
}
export async function validateConfig(config: TaskConfig): Promise<TaskConfig> {
  if (!['win32', 'linux'].includes(process.platform)) throw new Error('目前僅支援 Windows 與 Linux Agent。');
  if (!['vue', 'dotnet'].includes(config.environment)) throw new Error('此版本提供 Vue 與現代 .NET 模式；其他模式尚未交付。');
  for (const name of ['fetchLicense', 'noCache', 'uploadToDt'] as const) {
    if (typeof config[name] !== 'boolean') throw new Error(`參數 ${name} 必須是布林值。`);
  }
  if (!SUPPORTED_SPEC_VERSIONS.includes(config.specVersion as '1.6')) throw new Error('此版本僅驗證 CycloneDX 1.6。');
  validateToolOptions(config.nodeVersion, config.cdxgenVersion);
  if (!Array.isArray(config.excludes) || config.excludes.some(value => typeof value !== 'string' || value.includes('\0'))) throw new Error('排除規則必須是 glob 字串清單。');
  const projectPath = await realpath(config.projectPath);
  if (!(await stat(projectPath)).isDirectory()) throw new Error('專案路徑必須是目錄。');
  return { ...config, projectPath, dt: config.uploadToDt ? validateDtConfig(config.dt) : undefined };
}
