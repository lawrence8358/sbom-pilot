import { access, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';
import { parse } from 'yaml';
import {
  declarationsConflict,
  inspectJavaScriptProject,
  readPackageManagerDeclaration,
} from './project';
import type { JavaScriptProject } from './contracts';

/** 檢查 workspace 宣告與鎖檔是否存在，協助判定前端安裝擁有權。 */
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const lockNames = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];
/** 將路徑轉為相對共同根目錄的斜線格式，供跨平台 glob 比對。 */
const localPath = (root: string, path: string) => relative(root, path).replaceAll('\\', '/');
/** 以 Azure glob 規則比對路徑，保留花括號與隱藏檔並遵循平台大小寫。 */
const matches = (paths: string[], patterns: string[]) =>
  match(paths, patterns, undefined, {
    nobrace: false,
    dot: true,
    nocase: process.platform === 'win32',
  });
/** 判斷路徑是否位於共同根目錄內，避免採用外部 workspace。 */
const within = (root: string, path: string) => {
  const value = relative(root, path);
  return (
    value !== '..' &&
    !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(value)
  );
};

/** 讀取前端 package.json，解析失敗時只提示檔案責任而不轉印內容。 */
async function manifest(directory: string): Promise<any> {
  try {
    return JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch {
    throw new Error('JavaScript package.json 不是有效 JSON；請檢查共同根目錄內的前端專案。');
  }
}

/** 讀取 pnpm／npm／Yarn workspace 成員規則，驗證為可比對的 glob 清單。 */
async function workspacePatterns(project: JavaScriptProject): Promise<string[] | undefined> {
  if (await exists(join(project.root, 'pnpm-workspace.yaml'))) {
    const settings = parse(await readFile(join(project.root, 'pnpm-workspace.yaml'), 'utf8'));
    return settings?.packages ?? ['**'];
  }
  if (!(await exists(join(project.root, 'package.json')))) {
    return;
  }
  const settings = await manifest(project.root);
  const patterns = Array.isArray(settings.workspaces)
    ? settings.workspaces
    : settings.workspaces?.packages;
  if (patterns === undefined) {
    return;
  }
  if (
    !Array.isArray(patterns) ||
    patterns.some((pattern: unknown) => typeof pattern !== 'string')
  ) {
    throw new Error('workspaces 必須是路徑 glob 清單。');
  }
  return patterns;
}

/** 依 workspace 擁有權整理安裝根目錄，拒絕子鎖檔／宣告衝突，避免重複安裝成員。 */
export async function discoverJavaScriptProjects(
  root: string,
  excludes: string[] = [],
): Promise<JavaScriptProject[]> {
  const base = resolve(root),
    directories = new Set<string>();
  const ignored = new Set(['.git', 'node_modules', 'bin', 'obj', '.yarn', '.pnpm-store']);
  /** 收集未排除的前端宣告目錄，跳過符號連結及生成目錄，保留共同根目錄範圍。 */
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          await visit(path);
        }
      } else if (
        entry.isFile() &&
        (entry.name === 'package.json' || entry.name === 'pnpm-workspace.yaml')
      ) {
        if (!excludes.length || !matches([localPath(base, path)], excludes).length) {
          directories.add(directory);
        }
      }
    }
  }
  await visit(base);
  const projects: JavaScriptProject[] = [];
  const owners: { project: JavaScriptProject; patterns: string[] }[] = [];
  for (const directory of [...directories].sort(
    (a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length || a.localeCompare(b),
  )) {
    const owner = owners.find(
      (owner) =>
        within(owner.project.root, directory) &&
        matches([localPath(owner.project.root, directory)], owner.patterns).length,
    );
    if (owner) {
      if (
        (await Promise.all(lockNames.map((name) => exists(join(directory, name))))).some(Boolean)
      ) {
        throw new Error('workspace 子專案有獨立 lockfile；請統一根目錄鎖檔或修正 workspace 範圍。');
      }
      const declared = await readPackageManagerDeclaration(directory);
      if (declared && declarationsConflict(declared, owner.project)) {
        throw new Error('workspace 根目錄與子專案 packageManager 宣告互相矛盾。');
      }
      continue;
    }
    const project = await inspectJavaScriptProject(directory);
    if (!within(base, project.root)) {
      throw new Error(
        '前端 workspace 根目錄位於共同掃描根目錄外；請選擇同時涵蓋前後端及 workspace 的根目錄。',
      );
    }
    if (resolve(project.root) !== resolve(directory)) {
      throw new Error(
        '前端子目錄不在已辨識的 workspace 成員中；請修正 workspace 清單、排除規則或專案根目錄。',
      );
    }
    projects.push(project);
    const patterns = await workspacePatterns(project);
    if (patterns) {
      owners.push({ project, patterns });
    }
  }
  if (!projects.length) {
    throw new Error(
      '合併模式找不到前端 package.json／pnpm workspace；請選擇同時包含前後端的共同根目錄。',
    );
  }
  return projects;
}
