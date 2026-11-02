import { realpath, stat } from 'node:fs/promises';

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
}
export function parseExcludes(value: string): string[] {
  const result: string[] = [];
  let depth = 0, start = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '{') depth++;
    if (value[index] === '}') depth--;
    if (depth < 0) throw new Error('排除規則的花括號不成對。');
    if (value[index] === ',' && depth === 0) { result.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (depth !== 0) throw new Error('排除規則的花括號不成對。');
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}
export async function validateConfig(config: TaskConfig): Promise<TaskConfig> {
  if (!['win32', 'linux'].includes(process.platform)) throw new Error('目前僅支援 Windows 與 Linux Agent。');
  if (!['vue', 'dotnet'].includes(config.environment)) throw new Error('此版本提供 Vue 與現代 .NET 模式；其他模式尚未交付。');
  if (config.uploadToDt) throw new Error('此版本尚未提供 DT 上傳，請關閉推送到 DT。');
  if (config.specVersion !== '1.6') throw new Error('此版本僅驗證 CycloneDX 1.6。');
  const projectPath = await realpath(config.projectPath);
  if (!(await stat(projectPath)).isDirectory()) throw new Error('專案路徑必須是目錄。');
  return { ...config, projectPath };
}
