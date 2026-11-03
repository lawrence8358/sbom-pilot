import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { match } from 'azure-pipelines-task-lib/task';

export interface DotnetProject {
  path: string;
  directory: string;
  sdkStyle: boolean;
}

/** 在排除規則內探索實際 .NET 專案檔，保留各專案自己的 SDK 還原目錄。 */
export async function discoverDotnetProjects(
  root: string,
  excludes: string[] = [],
): Promise<DotnetProject[]> {
  const paths: string[] = [];
  const ignored = new Set(['.git', 'node_modules', 'bin', 'obj', '.yarn', '.pnpm-store']);
  /** 遞迴收集未排除的專案檔並略過生成目錄與符號連結，避免重複或越界探索。 */
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
      } else if (entry.isFile() && /\.(?:cs|fs|vb)proj$/i.test(entry.name)) {
        paths.push(path);
      }
    }
  }
  await visit(root);
  const excluded = new Set(
    excludes.length
      ? match(
          paths.map((path) => relative(root, path).replaceAll('\\', '/')),
          excludes,
          undefined,
          { nobrace: false, dot: true, nocase: process.platform === 'win32' },
        )
      : [],
  );
  const projects: DotnetProject[] = [];
  for (const path of paths) {
    if (excluded.has(relative(root, path).replaceAll('\\', '/'))) {
      continue;
    }
    const xml = (await readFile(path, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
    const sdkStyle =
      /<Project\b[^>]*\bSdk\s*=/i.test(xml) ||
      /<(?:Sdk|Import)\b[^>]*\b(?:Name|Sdk)\s*=\s*["']Microsoft\.NET\.Sdk/i.test(xml);
    projects.push({ path, directory: dirname(path), sdkStyle });
  }
  return projects.sort((a, b) => a.path.localeCompare(b.path));
}
