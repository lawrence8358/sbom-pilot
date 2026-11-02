import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { valid } from 'semver';
import { parse } from 'yaml';
import type { JavaScriptManager, JavaScriptProject } from './contracts';

export const NPM_FALLBACK_VERSION = '11.19.1';
export const PNPM_FALLBACK_VERSION = '10.34.2';
export const exists = async (path: string) => access(path).then(() => true, () => false);

async function declaration(root: string): Promise<{ manager: JavaScriptManager; version: string; integrity?: string } | undefined> {
  if (!await exists(join(root, 'package.json'))) return;
  let manifest;
  try { manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
  catch { throw new Error('package.json 不是有效 JSON。'); }
  if (manifest.packageManager === undefined) return;
  const match = typeof manifest.packageManager === 'string' && manifest.packageManager.match(/^(npm|pnpm|yarn)@(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\+(sha(?:224|256|384|512))\.([a-fA-F0-9]+))?$/);
  if (!match || !valid(match[2])) throw new Error('packageManager 必須宣告 npm、pnpm 或 Yarn 的精確 semver 版本；不接受範圍或自訂 URL。');
  const integrity = match[3] ? `${match[3]}-${Buffer.from(match[4], 'hex').toString('base64')}` : undefined;
  if (match[3] && match[4].length !== Number(match[3].slice(3)) / 4) throw new Error('packageManager 的完整性雜湊長度不正確。');
  return { manager: match[1] as JavaScriptManager, version: match[2], integrity };
}

async function workspaceRoot(requested: string): Promise<string> {
  let current = resolve(requested);
  while (true) {
    if (await exists(join(current, 'pnpm-workspace.yaml'))) return current;
    if (await exists(join(current, '.git')) || dirname(current) === current) return resolve(requested);
    current = dirname(current);
  }
}

export async function inspectJavaScriptProject(requested: string): Promise<JavaScriptProject> {
  const root = await workspaceRoot(requested);
  const declared = await declaration(root);
  const childDeclared = root !== resolve(requested) ? await declaration(requested) : undefined;
  if (childDeclared && (!declared || childDeclared.manager !== declared.manager || childDeclared.version !== declared.version || childDeclared.integrity !== declared.integrity)) {
    throw new Error('workspace 根目錄與子專案的 packageManager 宣告互相矛盾；請統一於 workspace 根目錄宣告。');
  }
  if (!await exists(join(root, 'package.json')) && !await exists(join(root, 'pnpm-workspace.yaml'))) throw new Error('找不到 package.json；請指定專案或 workspace 根目錄。');
  const candidates: [string, JavaScriptManager | 'unsupported'][] = [
    ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'unsupported'], ['bun.lockb', 'unsupported'],
  ];
  for (let child = resolve(requested); child !== root; child = dirname(child)) {
    if ((await Promise.all(candidates.map(([file]) => exists(join(child, file))))).some(Boolean)) throw new Error('workspace 子目錄具有獨立 lockfile；請先統一 workspace 根目錄的鎖定資訊。');
  }
  const locks = (await Promise.all(candidates.map(async ([file, manager]) => ({ file, manager, present: await exists(join(root, file)) })))).filter(lock => lock.present);
  if (locks.length !== 1) throw new Error('必須有且僅有一份 lockfile；偵測到缺少或其他套件管理器的競爭 lockfile。');
  const lock = locks[0];
  if (lock.manager === 'unsupported') throw new Error('此 lockfile 的套件管理器尚未支援。');
  if (declared && declared.manager !== lock.manager) throw new Error('packageManager 與 lockfile 的套件管理器互相矛盾。');
  if (await exists(join(root, 'pnpm-workspace.yaml'))) {
    if (lock.manager !== 'pnpm') throw new Error('pnpm workspace 與其他套件管理器 lockfile 互相矛盾。');
    try {
      const workspace = parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'));
      if (workspace !== null && (typeof workspace !== 'object' || Array.isArray(workspace) || (workspace.packages !== undefined && (!Array.isArray(workspace.packages) || !workspace.packages.every((entry: unknown) => typeof entry === 'string'))))) throw new Error();
    } catch { throw new Error('pnpm-workspace.yaml 必須是有效 YAML；packages 若有設定，必須是路徑清單。'); }
  }
  let version = declared?.version;
  if (!version && lock.manager === 'npm') version = NPM_FALLBACK_VERSION;
  if (lock.manager === 'pnpm') {
    let lockVersion;
    try { lockVersion = String(parse(await readFile(join(root, lock.file), 'utf8'))?.lockfileVersion); }
    catch { throw new Error('pnpm-lock.yaml 不是有效 YAML。'); }
    if (lockVersion === 'undefined') throw new Error('pnpm lockfile 缺少 lockfileVersion。');
    if (!version) {
      if (lockVersion !== '9.0' && lockVersion !== '9') throw new Error('此 pnpm lockfile 格式沒有已驗證的 fallback；請以 packageManager 宣告精確 pnpm 版本。');
      version = PNPM_FALLBACK_VERSION;
    }
  }
  if (!version) throw new Error('Yarn adapter 尚未交付；請使用已支援的套件管理器。');
  return { root, manager: lock.manager, version, reason: declared ? 'declaration' : 'fallback', integrity: declared?.integrity, lockPath: join(root, lock.file) };
}
