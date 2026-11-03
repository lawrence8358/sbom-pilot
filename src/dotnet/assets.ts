import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** 僅接受 JSON 物件；排除 null 與陣列，避免 truthiness 誤判還原資料結構。 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 核對 assets 的必要物件與實際專案身分；讀取或解析失敗回傳 false，由各還原路徑提供診斷。 */
export async function validRestoreAssets(path: string, projectPath: string): Promise<boolean> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (
      !record(value) ||
      !record(value.targets) ||
      !record(value.libraries) ||
      !record(value.project) ||
      !record(value.project.restore)
    )
      return false;
    const actual = value.project.restore.projectPath;
    return (
      typeof actual === 'string' && actual.length > 0 && resolve(actual) === resolve(projectPath)
    );
  } catch {
    return false;
  }
}
