import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import type { JavaScriptProject } from './contracts';

export const YARN_CLASSIC_FALLBACK_VERSION = '1.22.22';
export const YARN_MODERN_FALLBACK_VERSION = '4.18.1';
/** 檢查各層 Yarn 設定與 Git 標記，保留最近設定的擁有權。 */
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

interface YarnLockFormat {
  generation: 'classic' | 'modern';
  metadataVersion?: string;
}
interface YarnPathState {
  modernPath?: string;
  classicPath?: string;
  modernPathDefined: boolean;
  ignorePath?: boolean;
}

/** 辨識 Classic／現代 Yarn 鎖檔及 metadata，拒絕混合或無法辨識的格式。 */
function inspectLockFormat(lock: string): YarnLockFormat {
  if (/^# yarn lockfile v1\s*$/m.test(lock)) {
    if (/^__metadata:/m.test(lock)) {
      throw new Error('Yarn lockfile 同時宣告 Classic 與現代格式。');
    }
    return { generation: 'classic' };
  }
  let parsed;
  try {
    parsed = parse(lock);
  } catch {
    throw new Error('yarn.lock 不是有效 Yarn lockfile。');
  }
  if (!parsed?.__metadata || !Number.isInteger(Number(parsed.__metadata.version))) {
    throw new Error('無法辨識 Yarn lockfile 世代；請提交有效鎖檔。');
  }
  return { generation: 'modern', metadataVersion: String(parsed.__metadata.version) };
}

/** 只採用最近明定的 yarnPath／ignorePath，驗證本機路徑且保留 null 阻止繼承的語意。 */
async function applyModernPath(directory: string, state: YarnPathState): Promise<void> {
  let config;
  try {
    config = parse(await readFile(join(directory, '.yarnrc.yml'), 'utf8'));
  } catch {
    throw new Error('.yarnrc.yml 不是有效 YAML。');
  }
  if (state.ignorePath === undefined && typeof config?.ignorePath === 'boolean') {
    state.ignorePath = config.ignorePath;
  }
  if (state.modernPathDefined || config?.yarnPath === undefined) {
    return;
  }
  state.modernPathDefined = true;
  if (config.yarnPath === null) {
    return;
  }
  if (
    typeof config.yarnPath !== 'string' ||
    !config.yarnPath.trim() ||
    config.yarnPath.includes('${')
  ) {
    throw new Error('yarnPath 必須是明確的本機 JavaScript 路徑。');
  }
  state.modernPath = resolve(directory, config.yarnPath);
}

/** 解析 Classic yarn-path 並以設定所在目錄解析相對路徑，拒絕同檔多筆宣告。 */
async function readClassicPath(directory: string): Promise<string | undefined> {
  const content = await readFile(join(directory, '.yarnrc'), 'utf8');
  const paths = [
    ...content.matchAll(
      /^\s*(?:yarn-path|"yarn-path")\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:#.*)?$/gm,
    ),
  ];
  if (paths.length > 1) {
    throw new Error('.yarnrc 包含多個 yarn-path 宣告。');
  }
  if (paths.length) {
    return resolve(directory, paths[0][1] ?? paths[0][2] ?? paths[0][3]);
  }
}

/** 按目錄層級讀取 Yarn 執行檔政策，保留 ignorePath 與 Git 根停止規則。 */
async function resolveYarnPath(
  root: string,
  generation: YarnLockFormat['generation'],
): Promise<string | undefined> {
  const state: YarnPathState = { modernPathDefined: false };
  for (let directory = resolve(root); ; directory = dirname(directory)) {
    if (generation === 'modern' && (await exists(join(directory, '.yarnrc.yml')))) {
      await applyModernPath(directory, state);
    }
    if (
      generation === 'classic' &&
      !state.classicPath &&
      (await exists(join(directory, '.yarnrc')))
    ) {
      state.classicPath = await readClassicPath(directory);
    }
    if ((await exists(join(directory, '.git'))) || dirname(directory) === directory) {
      break;
    }
  }
  return state.ignorePath ? undefined : (state.modernPath ?? state.classicPath);
}

/** 綜合鎖檔世代、精確版本與專案執行檔，僅在已驗證格式採用固定 fallback。 */
export async function inspectYarnProject(
  root: string,
  declaredVersion?: string,
): Promise<Pick<JavaScriptProject, 'version' | 'reason' | 'yarn'>> {
  const { generation, metadataVersion } = inspectLockFormat(
    await readFile(join(root, 'yarn.lock'), 'utf8'),
  );
  if (
    declaredVersion &&
    (Number(declaredVersion.split('.')[0]) === 1) !== (generation === 'classic')
  ) {
    throw new Error('Yarn packageManager 版本與 lockfile 世代互相矛盾。');
  }
  const path = await resolveYarnPath(root, generation);
  if (path && !/\.(?:c?js|mjs)$/i.test(path)) {
    throw new Error('目前 yarnPath 僅支援本機 JavaScript 發行檔。');
  }
  if (!declaredVersion && !path && generation === 'modern' && metadataVersion !== '10') {
    throw new Error(
      '此現代 Yarn lockfile 沒有已驗證 fallback；請宣告精確 packageManager 或 yarnPath。',
    );
  }
  return {
    version:
      declaredVersion ??
      (generation === 'classic' ? YARN_CLASSIC_FALLBACK_VERSION : YARN_MODERN_FALLBACK_VERSION),
    reason: declaredVersion ? 'declaration' : path ? 'project-binary' : 'fallback',
    yarn: { generation, path },
  };
}
