import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import type { JavaScriptProject } from './contracts';

export const YARN_CLASSIC_FALLBACK_VERSION = '1.22.22';
export const YARN_MODERN_FALLBACK_VERSION = '4.18.1';
const exists = async (path: string) => access(path).then(() => true, () => false);

export async function inspectYarnProject(root: string, declaredVersion?: string): Promise<Pick<JavaScriptProject, 'version' | 'reason' | 'yarn'>> {
  const lock = await readFile(join(root, 'yarn.lock'), 'utf8');
  let generation: 'classic' | 'modern', metadataVersion: string | undefined;
  if (/^# yarn lockfile v1\s*$/m.test(lock)) {
    if (/^__metadata:/m.test(lock)) throw new Error('Yarn lockfile 同時宣告 Classic 與現代格式。');
    generation = 'classic';
  }
  else {
    let parsed;
    try { parsed = parse(lock); } catch { throw new Error('yarn.lock 不是有效 Yarn lockfile。'); }
    if (!parsed?.__metadata || !Number.isInteger(Number(parsed.__metadata.version))) throw new Error('無法辨識 Yarn lockfile 世代；請提交有效鎖檔。');
    generation = 'modern'; metadataVersion = String(parsed.__metadata.version);
  }
  if (declaredVersion && (Number(declaredVersion.split('.')[0]) === 1) !== (generation === 'classic')) throw new Error('Yarn packageManager 版本與 lockfile 世代互相矛盾。');
  let modernPath: string | undefined, classicPath: string | undefined;
  let modernPathDefined = false, ignorePath: boolean | undefined;
  for (let directory = resolve(root); ; directory = dirname(directory)) {
    if (await exists(join(directory, '.yarnrc.yml'))) {
      let config;
      try { config = parse(await readFile(join(directory, '.yarnrc.yml'), 'utf8')); }
      catch { throw new Error('.yarnrc.yml 不是有效 YAML。'); }
      if (ignorePath === undefined && typeof config?.ignorePath === 'boolean') ignorePath = config.ignorePath;
      if (!modernPathDefined && config?.yarnPath !== undefined) {
        modernPathDefined = true;
        if (config.yarnPath !== null) {
          if (typeof config.yarnPath !== 'string' || !config.yarnPath.trim() || config.yarnPath.includes('${')) throw new Error('yarnPath 必須是明確的本機 JavaScript 路徑。');
          modernPath = resolve(directory, config.yarnPath);
        }
      }
    }
    if (!classicPath && await exists(join(directory, '.yarnrc'))) {
      const content = await readFile(join(directory, '.yarnrc'), 'utf8');
      const paths = [...content.matchAll(/^\s*(?:yarn-path|"yarn-path")\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:#.*)?$/gm)];
      if (paths.length > 1) throw new Error('.yarnrc 包含多個 yarn-path 宣告。');
      if (paths.length) classicPath = resolve(directory, paths[0][1] ?? paths[0][2] ?? paths[0][3]);
    }
    if (await exists(join(directory, '.git')) || dirname(directory) === directory) break;
  }
  if (modernPath && classicPath && modernPath !== classicPath) throw new Error('Yarn 設定的 yarnPath 與 yarn-path 互相矛盾。');
  const path = ignorePath ? undefined : modernPath ?? classicPath;
  if (path && !/\.(?:c?js|mjs)$/i.test(path)) throw new Error('目前 yarnPath 僅支援本機 JavaScript 發行檔。');
  if (!declaredVersion && !path && generation === 'modern' && metadataVersion !== '10') throw new Error('此現代 Yarn lockfile 沒有已驗證 fallback；請宣告精確 packageManager 或 yarnPath。');
  return {
    version: declaredVersion ?? (generation === 'classic' ? YARN_CLASSIC_FALLBACK_VERSION : YARN_MODERN_FALLBACK_VERSION),
    reason: declaredVersion ? 'declaration' : path ? 'project-binary' : 'fallback',
    yarn: { generation, path },
  };
}
