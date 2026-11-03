import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ProcessRunner } from './process';

const marker = '.sbom-pilot-complete.json';
export interface NodeCacheOptions {
  directory: string;
  version: string;
  arch: string;
}

/** 驗證工具快取版本與架構，建立含平台的完整標記身分。 */
function identity(options: NodeCacheOptions) {
  if (!/^\d+\.\d+\.\d+$/.test(options.version) || !['x64', 'arm64'].includes(options.arch)) {
    throw new Error('Node 工具快取版本或架構無效。');
  }
  return { version: options.version, arch: options.arch, platform: process.platform };
}
/** 依平台回傳 Node 與 npm 真正入口，不採用任意全域 npm。 */
export function nodePaths(root: string) {
  return {
    node: join(root, process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    npmCli: join(
      root,
      process.platform === 'win32'
        ? 'node_modules/npm/bin/npm-cli.js'
        : 'lib/node_modules/npm/bin/npm-cli.js',
    ),
  };
}
/** 核對快取標記及必要入口為實體檔案，任何缺失都視為未完成。 */
async function complete(root: string, options: NodeCacheOptions): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(join(root, marker), 'utf8'));
    if (JSON.stringify(value) !== JSON.stringify(identity(options))) {
      return false;
    }
    for (const file of Object.values(nodePaths(root))) {
      if (!(await lstat(file)).isFile()) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** 在目的地旁建立暫存安裝目錄，驗證後原子公開；並行輸家驗證勝出快取，不刪不完整目的地。 */
export async function acquireNodeCache(
  options: NodeCacheOptions,
  populate: (stage: string) => Promise<void>,
  verify: (root: string) => Promise<void>,
): Promise<string> {
  identity(options);
  const root = join(options.directory, 'sbom-pilot-node', options.version, options.arch);
  if (await complete(root, options)) {
    await verify(root);
    return root;
  }
  try {
    await access(root);
    // 相容讀取舊 tool-lib 建立的完整快取，仍需驗證實際入口與版本。
    await access(`${root}.complete`);
    for (const file of Object.values(nodePaths(root))) {
      if (!(await lstat(file)).isFile()) {
        throw new Error();
      }
    }
    await verify(root);
    return root;
  } catch {
    if (
      await access(root).then(
        () => true,
        () => false,
      )
    ) {
      throw new Error('Node 工具快取不完整或版本驗證失敗；請清理該版本快取後重試。');
    }
  }
  await mkdir(dirname(root), { recursive: true });
  const stage = await mkdtemp(join(dirname(root), '.node-install-'));
  try {
    await populate(stage);
    await verify(stage);
    await writeFile(join(stage, marker), JSON.stringify(identity(options)));
    try {
      await rename(stage, root);
    } catch (error) {
      if (!(await complete(root, options))) {
        throw error;
      }
    }
    if (!(await complete(root, options))) {
      throw new Error('Node 工具快取完成標記無效。');
    }
    await verify(root);
    return root;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

/** 拒絕 traversal、絕對路徑與其他發行根目錄的壓縮項目，回傳安全正規化路徑。 */
function safeEntry(name: string, folder: string): string {
  if (
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').includes('..')
  ) {
    throw new Error('Node 壓縮檔包含不安全路徑。');
  }
  const normalized = posix.normalize(name).replace(/\/$/, '');
  if (normalized !== folder && !normalized.startsWith(`${folder}/`)) {
    throw new Error('Node 壓縮檔路徑超出預期根目錄。');
  }
  return normalized;
}
interface TarRecord {
  header: Buffer;
  body: Buffer;
  type: string;
}
interface TarOverrides {
  longName?: string;
  longLink?: string;
  extended: Record<string, string>;
}
interface TarPaths {
  links: string[];
  paths: string[];
  targets: string[];
}

/** 讀取 tar 的 NUL 結尾 UTF-8 欄位，供標準 header 與 GNU 長名稱使用。 */
function tarString(data: Buffer): string {
  return data.toString('utf8').split('\0')[0];
}

/** 逐筆解讀 tar header 與對齊長度，拒絕無效八進位大小及截斷內容。 */
function* tarRecords(tar: Buffer): Generator<TarRecord> {
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      return;
    }
    const sizeText = tarString(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/.test(sizeText)) {
      throw new Error('Node tar 長度無效。');
    }
    const size = parseInt(sizeText, 8);
    const start = offset + 512,
      end = start + size;
    if (end > tar.length) {
      throw new Error('Node tar 檔案不完整。');
    }
    yield { header, body: tar.subarray(start, end), type: String.fromCharCode(header[156] || 48) };
    offset = start + Math.ceil(size / 512) * 512;
  }
}

/** 依 PAX 記錄長度解析擷取屬性，只允許既有白名單，避免繞過路徑預檢。 */
function paxAttributes(body: Buffer): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;
  while (index < body.length) {
    const space = body.indexOf(32, index),
      length = Number(body.subarray(index, space).toString());
    if (
      space < index ||
      !Number.isSafeInteger(length) ||
      length <= space - index + 1 ||
      index + length > body.length
    ) {
      throw new Error('Node tar PAX 資料無效。');
    }
    const field = body.subarray(space + 1, index + length - 1).toString('utf8'),
      equal = field.indexOf('=');
    if (equal < 1) {
      throw new Error('Node tar PAX 資料無效。');
    }
    if (
      ![
        'path',
        'linkpath',
        'mtime',
        'atime',
        'ctime',
        'uid',
        'gid',
        'uname',
        'gname',
        'charset',
        'hdrcharset',
        'comment',
      ].includes(field.slice(0, equal))
    ) {
      throw new Error('Node tar PAX 包含不支援的擷取屬性。');
    }
    attributes[field.slice(0, equal)] = field.slice(equal + 1);
    index += length;
  }
  return attributes;
}

/** 套用 GNU／PAX 覆寫並收集安全項目及連結，保留原始目標供交叉連結檢查。 */
function recordTarPath(
  record: TarRecord,
  overrides: TarOverrides,
  paths: TarPaths,
  folder: string,
): void {
  const { header, type } = record;
  if (!['0', '1', '2', '5'].includes(type)) {
    throw new Error('Node tar 包含不支援的項目類型。');
  }
  const prefix = tarString(header.subarray(345, 500));
  const name = safeEntry(
    overrides.extended.path ||
      overrides.longName ||
      `${prefix ? `${prefix}/` : ''}${tarString(header.subarray(0, 100))}`,
    folder,
  );
  paths.paths.push(name);
  if (type !== '1' && type !== '2') {
    return;
  }
  const target =
    overrides.extended.linkpath || overrides.longLink || tarString(header.subarray(157, 257));
  if (!target || target.includes('\\') || target.startsWith('/') || /^[A-Za-z]:/.test(target)) {
    throw new Error('Node tar 連結無效。');
  }
  safeEntry(
    posix.normalize(type === '2' ? posix.join(posix.dirname(name), target) : target),
    folder,
  );
  // 保留未正規化目標，後續才能檢查中間路徑是否穿越另一連結。
  paths.targets.push(type === '2' ? `${posix.dirname(name)}/${target}` : target);
  paths.links.push(name);
}

/** 拒絕空壓縮檔、穿越連結的項目及連結再穿越連結，避免原生 tar 寫到預檢範圍外。 */
function validateTarLinks({ paths, links, targets }: TarPaths): void {
  if (!paths.length || paths.some((path) => links.some((link) => path.startsWith(`${link}/`)))) {
    throw new Error('Node tar 包含空內容或穿越連結的路徑。');
  }
  for (const target of targets) {
    const segments: string[] = [];
    for (const segment of target.split('/')) {
      if (segment === '..') {
        segments.pop();
      } else if (segment && segment !== '.') {
        segments.push(segment);
      }
      if (links.includes(segments.join('/'))) {
        throw new Error('Node tar 連結不能穿越另一個連結。');
      }
    }
  }
}

/** 協調 tar 記錄、單筆覆寫及整體連結驗證，完成預檢後才允許作業系統解壓。 */
export function validateNodeTar(tar: Buffer, folder: string): void {
  const paths: TarPaths = { links: [], paths: [], targets: [] };
  let overrides: TarOverrides = { extended: {} };
  for (const record of tarRecords(tar)) {
    if (record.type === 'L') {
      overrides.longName = tarString(record.body).replace(/\n$/, '');
    } else if (record.type === 'K') {
      overrides.longLink = tarString(record.body).replace(/\n$/, '');
    } else if (record.type === 'x') {
      Object.assign(overrides.extended, paxAttributes(record.body));
    } else {
      recordTarPath(record, overrides, paths, folder);
      overrides = { extended: {} };
    }
  }
  validateTarLinks(paths);
}

const unzipScript = `param([string]$Archive,[string]$Destination,[string]$Folder)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
  [long]$total = 0
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    $total += $entry.Length
    if (
      $total -gt 536870912 -or
      $name.Contains('\\') -or
      $name.StartsWith('/') -or
      $name.Contains(':') -or
      ($name.Split('/') -contains '..') -or
      (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960 -or
      -not ($name -eq $Folder -or $name.StartsWith($Folder + '/'))
    ) {
      throw 'Unsafe Node ZIP entry'
    }
  }
  [System.IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
} finally {
  $zip.Dispose()
}
`;

/** Windows 先驗證 ZIP、Linux 先驗證 tar，再以原生工具擷取並清除輔助腳本。 */
export async function extractNodeArchive(
  archive: string,
  bytes: Buffer,
  destination: string,
  folder: string,
  tempDirectory: string,
  run: ProcessRunner,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  if (process.platform === 'win32') {
    const script = join(tempDirectory, 'extract-node.ps1');
    await writeFile(script, unzipScript);
    try {
      await run({
        executable: 'powershell.exe',
        args: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          archive,
          destination,
          folder,
        ],
        cwd: tempDirectory,
        timeoutMs: 120_000,
      });
    } finally {
      await rm(script, { force: true });
    }
  } else {
    validateNodeTar(gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }), folder);
    await run({
      executable: 'tar',
      args: ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', destination],
      cwd: tempDirectory,
      timeoutMs: 120_000,
    });
  }
}
