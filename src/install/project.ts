import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { valid } from 'semver';
import { parse, parseAllDocuments } from 'yaml';
import type { JavaScriptManager, JavaScriptProject } from './contracts';
import { inspectYarnProject } from './yarn-project';

export const NPM_FALLBACK_VERSION = '11.19.1';
export const PNPM_FALLBACK_VERSION = '10.34.2';
/** 檢查 manifest、鎖檔與 workspace 標記，供管理器辨識使用。 */
export const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export interface PackageManagerDeclaration {
  manager: JavaScriptManager;
  version: string;
  integrity?: string;
}
/** 比較管理器、精確版本及雙方已宣告雜湊，判定 workspace 宣告是否互相矛盾。 */
export const declarationsConflict = (a: PackageManagerDeclaration, b: PackageManagerDeclaration) =>
  a.manager !== b.manager ||
  a.version !== b.version ||
  Boolean(a.integrity && b.integrity && a.integrity !== b.integrity);
/** 解析精確 packageManager 與 Corepack 雜湊格式，拒絕範圍、自訂 URL 及不符長度的雜湊。 */
export async function readPackageManagerDeclaration(
  root: string,
): Promise<PackageManagerDeclaration | undefined> {
  if (!(await exists(join(root, 'package.json')))) {
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    throw new Error('package.json 不是有效 JSON。');
  }
  if (manifest.packageManager === undefined) {
    return;
  }
  const match =
    typeof manifest.packageManager === 'string' &&
    manifest.packageManager.match(
      /^(npm|pnpm|yarn)@(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\+(sha(?:1|224|256|384|512))\.([a-fA-F0-9]+))?$/,
    );
  if (!match || !valid(match[2])) {
    throw new Error(
      'packageManager 必須宣告 npm、pnpm 或 Yarn 的精確 semver 版本；不接受範圍或自訂 URL。',
    );
  }
  const integrity = match[3]
    ? `${match[3]}-${Buffer.from(match[4], 'hex').toString('base64')}`
    : undefined;
  if (match[3] && match[4].length !== (match[3] === 'sha1' ? 40 : Number(match[3].slice(3)) / 4)) {
    throw new Error('packageManager 的完整性雜湊長度不正確。');
  }
  return { manager: match[1] as JavaScriptManager, version: match[2], integrity };
}

/** 向上尋找管理器擁有的 workspace 根目錄，遇 Git 根或檔案系統根即停止。 */
async function workspaceRoot(requested: string): Promise<string> {
  let current = resolve(requested);
  while (true) {
    if (await exists(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    if (
      (await exists(join(current, 'yarn.lock'))) &&
      (await exists(join(current, 'package.json')))
    ) {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'));
      } catch {
        throw new Error('package.json 不是有效 JSON。');
      }
      if (Array.isArray(manifest.workspaces) || Array.isArray(manifest.workspaces?.packages)) {
        return current;
      }
    }
    if ((await exists(join(current, '.git'))) || dirname(current) === current) {
      return resolve(requested);
    }
    current = dirname(current);
  }
}

/** 共用受支援及競爭鎖檔政策，讓單專案與 combined workspace 使用相同候選。 */
export const lockCandidates: readonly (readonly [string, JavaScriptManager | 'unsupported'])[] = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'unsupported'],
  ['bun.lockb', 'unsupported'],
];

/** 先拒絕 workspace 子鎖檔，再要求根目錄只有一種受支援的鎖檔。 */
async function findUniqueLock(
  root: string,
  requested: string,
): Promise<{ file: string; manager: JavaScriptManager }> {
  for (let child = resolve(requested); child !== root; child = dirname(child)) {
    if (
      (await Promise.all(lockCandidates.map(([file]) => exists(join(child, file))))).some(Boolean)
    ) {
      throw new Error('workspace 子目錄具有獨立 lockfile；請先統一 workspace 根目錄的鎖定資訊。');
    }
  }
  const locks = (
    await Promise.all(
      lockCandidates.map(async ([file, manager]) => ({
        file,
        manager,
        present: await exists(join(root, file)),
      })),
    )
  ).filter((lock) => lock.present);
  if (locks.length !== 1) {
    throw new Error('必須有且僅有一份 lockfile；偵測到缺少或其他套件管理器的競爭 lockfile。');
  }
  const lock = locks[0];
  if (lock.manager === 'unsupported') {
    throw new Error('此 lockfile 的套件管理器尚未支援。');
  }
  return { file: lock.file, manager: lock.manager };
}

/** 檢查 pnpm workspace 與鎖檔管理器一致，且 packages 為合法路徑清單。 */
async function validatePnpmWorkspace(root: string, manager: JavaScriptManager): Promise<void> {
  if (!(await exists(join(root, 'pnpm-workspace.yaml')))) {
    return;
  }
  if (manager !== 'pnpm') {
    throw new Error('pnpm workspace 與其他套件管理器 lockfile 互相矛盾。');
  }
  try {
    const workspace = parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'));
    if (
      workspace !== null &&
      (typeof workspace !== 'object' ||
        Array.isArray(workspace) ||
        (workspace.packages !== undefined &&
          (!Array.isArray(workspace.packages) ||
            !workspace.packages.every((entry: unknown) => typeof entry === 'string'))))
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('pnpm-workspace.yaml 必須是有效 YAML；packages 若有設定，必須是路徑清單。');
  }
}

/** 驗證所有 pnpm YAML 文件版本一致；未宣告管理器時只接受已驗證的固定 fallback 格式。 */
async function selectPnpmVersion(
  root: string,
  file: string,
  declaredVersion?: string,
): Promise<string> {
  let lockVersion, documentCount;
  try {
    const documents = parseAllDocuments(await readFile(join(root, file), 'utf8'));
    if (!documents.length || documents.some((document) => document.errors.length)) {
      throw new Error();
    }
    const versions = documents.map((document) => String(document.toJSON()?.lockfileVersion));
    if (new Set(versions).size !== 1) {
      throw new Error();
    }
    lockVersion = versions[0];
    documentCount = documents.length;
  } catch {
    throw new Error('pnpm-lock.yaml 不是有效 YAML。');
  }
  if (lockVersion === 'undefined') {
    throw new Error('pnpm lockfile 缺少 lockfileVersion。');
  }
  if (declaredVersion) {
    return declaredVersion;
  }
  if (documentCount !== 1 || (lockVersion !== '9.0' && lockVersion !== '9')) {
    throw new Error(
      '此 pnpm lockfile 格式沒有已驗證的 fallback；請以 packageManager 宣告精確 pnpm 版本。',
    );
  }
  return PNPM_FALLBACK_VERSION;
}

/** 依 workspace、宣告及唯一鎖檔決定管理器，保持衝突檢查順序並回傳可安裝專案資訊。 */
export async function inspectJavaScriptProject(requested: string): Promise<JavaScriptProject> {
  const root = await workspaceRoot(requested);
  const declared = await readPackageManagerDeclaration(root);
  const childDeclared =
    root !== resolve(requested) ? await readPackageManagerDeclaration(requested) : undefined;
  if (childDeclared && (!declared || declarationsConflict(childDeclared, declared))) {
    throw new Error(
      'workspace 根目錄與子專案的 packageManager 宣告互相矛盾；請統一於 workspace 根目錄宣告。',
    );
  }
  if (
    !(await exists(join(root, 'package.json'))) &&
    !(await exists(join(root, 'pnpm-workspace.yaml')))
  ) {
    throw new Error('找不到 package.json；請指定專案或 workspace 根目錄。');
  }
  const lock = await findUniqueLock(root, requested);
  if (declared && declared.manager !== lock.manager) {
    throw new Error('packageManager 與 lockfile 的套件管理器互相矛盾。');
  }
  await validatePnpmWorkspace(root, lock.manager);
  if (lock.manager === 'yarn') {
    return {
      root,
      manager: 'yarn',
      ...(await inspectYarnProject(root, declared?.version)),
      integrity: declared?.integrity,
      lockPath: join(root, lock.file),
    };
  }
  const version =
    lock.manager === 'pnpm'
      ? await selectPnpmVersion(root, lock.file, declared?.version)
      : (declared?.version ?? NPM_FALLBACK_VERSION);
  return {
    root,
    manager: lock.manager,
    version,
    reason: declared ? 'declaration' : 'fallback',
    integrity: declared?.integrity,
    lockPath: join(root, lock.file),
  };
}
