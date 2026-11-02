import { access, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';
import { parse } from 'yaml';
import { inspectJavaScriptProject } from './project';
import type { JavaScriptProject } from './contracts';

const exists = async (path: string) => access(path).then(() => true, () => false);
const lockNames = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const localPath = (root: string, path: string) => relative(root, path).replaceAll('\\', '/');
const matches = (paths: string[], patterns: string[]) => match(paths, patterns, undefined, { nobrace: false, dot: true, nocase: process.platform === 'win32' });
const within = (root: string, path: string) => { const value = relative(root, path); return value !== '..' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(value); };

async function manifest(directory: string): Promise<any> {
  try { return JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); }
  catch { throw new Error('JavaScript package.json 不是有效 JSON；請檢查共同根目錄內的前端專案。'); }
}

async function workspacePatterns(project: JavaScriptProject): Promise<string[] | undefined> {
  if (await exists(join(project.root, 'pnpm-workspace.yaml'))) {
    const settings = parse(await readFile(join(project.root, 'pnpm-workspace.yaml'), 'utf8'));
    return settings?.packages ?? ['**'];
  }
  if (!await exists(join(project.root, 'package.json'))) return;
  const settings = await manifest(project.root);
  const patterns = Array.isArray(settings.workspaces) ? settings.workspaces : settings.workspaces?.packages;
  if (patterns === undefined) return;
  if (!Array.isArray(patterns) || patterns.some((pattern: unknown) => typeof pattern !== 'string')) throw new Error('workspaces 必須是路徑 glob 清單。');
  return patterns;
}

/** One install per owning workspace, otherwise one per independent locked project. */
export async function discoverJavaScriptProjects(root: string, excludes: string[] = []): Promise<JavaScriptProject[]> {
  const base = resolve(root), directories = new Set<string>();
  const ignored = new Set(['.git', 'node_modules', 'bin', 'obj', '.yarn', '.pnpm-store']);
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) await visit(path); }
      else if (entry.isFile() && (entry.name === 'package.json' || entry.name === 'pnpm-workspace.yaml')) {
        if (!excludes.length || !matches([localPath(base, path)], excludes).length) directories.add(directory);
      }
    }
  }
  await visit(base);
  const projects: JavaScriptProject[] = [];
  const owners: { project: JavaScriptProject; patterns: string[]; declaration?: string }[] = [];
  for (const directory of [...directories].sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length || a.localeCompare(b))) {
    const owner = owners.find(owner => within(owner.project.root, directory) && matches([localPath(owner.project.root, directory)], owner.patterns).length);
    if (owner) {
      if ((await Promise.all(lockNames.map(name => exists(join(directory, name))))).some(Boolean)) throw new Error('workspace 子專案有獨立 lockfile；請統一根目錄鎖檔或修正 workspace 範圍。');
      const declared = await exists(join(directory, 'package.json')) ? (await manifest(directory)).packageManager : undefined;
      if (declared !== undefined && declared !== owner.declaration) throw new Error('workspace 根目錄與子專案 packageManager 宣告互相矛盾。');
      continue;
    }
    const project = await inspectJavaScriptProject(directory);
    if (!within(base, project.root)) throw new Error('前端 workspace 根目錄位於共同掃描根目錄外；請選擇同時涵蓋前後端及 workspace 的根目錄。');
    if (resolve(project.root) !== resolve(directory)) throw new Error('前端子目錄不在已辨識的 workspace 成員中；請修正 workspace 清單、排除規則或專案根目錄。');
    projects.push(project);
    const patterns = await workspacePatterns(project);
    if (patterns) owners.push({ project, patterns, declaration: await exists(join(project.root, 'package.json')) ? (await manifest(project.root)).packageManager : undefined });
  }
  if (!projects.length) throw new Error('合併模式找不到前端 package.json／pnpm workspace；請選擇同時包含前後端的共同根目錄。');
  return projects;
}
