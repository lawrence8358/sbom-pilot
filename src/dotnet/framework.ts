import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { RestoreProject } from './restore';
import { evaluateFrameworkProject, verifyFrameworkTargets, type MSBuildTool } from './msbuild';

const exists = async (path: string) => access(path).then(() => true, () => false);
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
interface GraphRestore {
  projectPath: string; projectStyle: string; outputPath?: string; configFilePaths?: string[];
  packagesConfigPath?: string; restoreLockProperties?: { nuGetLockFilePath?: string };
}
export interface FrameworkRestoreResult { assets: RestoreProject[]; packageFiles: string[] }

/** Identify a real containing solution instead of guessing a packages directory. */
export async function findSolutionDirectory(projectPath: string, root: string): Promise<string | undefined> {
  let directory = dirname(resolve(projectPath));
  const boundary = resolve(root);
  for (;;) {
    const projectRelative = relative(directory, projectPath).replaceAll('\\', '/').toLowerCase();
    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (!file.isFile() || !/\.sln$/i.test(file.name)) continue;
      const content = await readFile(join(directory, file.name), 'utf8');
      const references = [...content.matchAll(/^Project\([^\r\n]*?=\s*"[^"]*",\s*"([^"]+)"/gm)];
      if (references.some(reference => reference[1].replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase() === projectRelative)) return directory;
    }
    if (directory === boundary) return undefined;
    const parent = dirname(directory);
    if (parent === directory || relative(boundary, parent).startsWith('..')) return undefined;
    directory = parent;
  }
}

// Delegate configuration precedence, environment expansion, XML parsing and NuGet
// version normalization to the same Microsoft libraries as the restore engine.
const packageMetadataScript = `param([string]$InputFile)
$ErrorActionPreference = 'Stop'
$payload = Get-Content -LiteralPath $InputFile -Raw | ConvertFrom-Json
$assemblies = [string]$payload.assemblyDirectory
foreach ($name in @('NuGet.Common.dll','NuGet.Configuration.dll','NuGet.Versioning.dll')) {
  [Reflection.Assembly]::LoadFrom((Join-Path $assemblies $name)) | Out-Null
}
$settings = [NuGet.Configuration.Settings]::LoadSettingsGivenConfigPaths([string[]]$payload.configFiles)
$repository = [string]$payload.restoreRepositoryPath
if (-not $repository) { $repository = [NuGet.Configuration.SettingsUtility]::GetRepositoryPath($settings) }
if (-not $repository -and $payload.solutionDirectory) { $repository = Join-Path ([string]$payload.solutionDirectory) 'packages' }
if (-not $repository) { throw 'Cannot determine packages.config repository. Supply a containing solution or repositoryPath.' }
if (-not [IO.Path]::IsPathRooted($repository)) { $repository = Join-Path ([string]$payload.projectDirectory) $repository }
$repository = [IO.Path]::GetFullPath($repository)
$xmlSettings = New-Object System.Xml.XmlReaderSettings
$xmlSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$xmlSettings.XmlResolver = $null
$reader = [System.Xml.XmlReader]::Create([string]$payload.packagesConfigPath, $xmlSettings)
try {
  $document = New-Object System.Xml.XmlDocument
  $document.XmlResolver = $null
  $document.Load($reader)
} finally { $reader.Dispose() }
if ($document.DocumentElement.LocalName -ne 'packages') { throw 'Invalid packages.config root' }
$files = @()
foreach ($package in $document.SelectNodes('/packages/package')) {
  $id = [string]$package.GetAttribute('id')
  if ($id -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid package id' }
  $version = [NuGet.Versioning.NuGetVersion]::Parse([string]$package.GetAttribute('version')).ToNormalizedString()
  $identity = $id + '.' + $version
  $files += Join-Path (Join-Path $repository $identity) ($identity + '.nupkg')
}
[pscustomobject]@{ repositoryPath = $repository; files = @($files) } | ConvertTo-Json -Compress
`;

async function packageFiles(metadata: GraphRestore, projectDirectory: string, solutionDirectory: string | undefined, restoreRepositoryPath: string, nugetTargets: string, tool: MSBuildTool, run: ProcessRunner, tempDirectory: string): Promise<string[]> {
  if (!metadata.packagesConfigPath || !Array.isArray(metadata.configFilePaths)) throw new Error('packages.config 還原圖缺少必要的來源設定／清單路徑。');
  const token = randomUUID();
  const input = join(tempDirectory, `packages-${token}.json`);
  const script = join(tempDirectory, `packages-${token}.ps1`);
  try {
    await writeFile(input, JSON.stringify({ assemblyDirectory: dirname(resolve(nugetTargets)), configFiles: metadata.configFilePaths, restoreRepositoryPath, solutionDirectory, projectDirectory, packagesConfigPath: metadata.packagesConfigPath }));
    await writeFile(script, packageMetadataScript);
    const output = await run({ executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-InputFile', input], cwd: projectDirectory, env: tool.env, timeoutMs: 60_000 });
    const result = JSON.parse(output.stdout);
    if (!Array.isArray(result.files) || result.files.some((path: unknown) => typeof path !== 'string')) throw new Error('Invalid package metadata');
    return [metadata.packagesConfigPath, ...result.files];
  } catch { throw new Error('無法判定 packages.config 的套件位置或清單格式；請在掃描根目錄內提供包含該專案的 .sln，或在 NuGet.Config 設定 repositoryPath，並確認 Visual Studio 的 NuGet 元件完整。'); }
  finally { await rm(input, { force: true }); await rm(script, { force: true }); }
}

/** Public/private feeds share this route: pass credentials only through tool.env. */
export async function restoreFrameworkProject(projectPath: string, root: string, tool: MSBuildTool, run: ProcessRunner, tempDirectory: string): Promise<FrameworkRestoreResult> {
  const cwd = dirname(projectPath);
  const properties = await evaluateFrameworkProject(projectPath, tool, run, cwd);
  const solutionDirectory = properties.RestoreSolutionDirectory || await findSolutionDirectory(projectPath, root);
  const common = ['-p:RestorePackagesConfig=true', '-p:RestoreUseSkipNonexistentTargets=false', ...(solutionDirectory ? [`-p:SolutionDir=${solutionDirectory}${sep}`] : [])];
  await mkdir(tempDirectory, { recursive: true });
  const graphPath = join(tempDirectory, `framework-${randomUUID()}.json`);
  let metadata: GraphRestore[];
  try {
    await run({ executable: tool.executable, args: [projectPath, '-target:GenerateRestoreGraphFile', `-p:RestoreGraphOutputPath=${graphPath}`, '-nologo', '-verbosity:quiet', ...common], cwd, env: tool.env });
    const graph = JSON.parse(await readFile(graphPath, 'utf8'));
    metadata = Object.values(graph.projects ?? {}).map((entry: any) => entry.restore);
    if (!metadata.length || metadata.some(entry => !entry?.projectPath || !['PackageReference', 'PackagesConfig'].includes(entry.projectStyle))) throw new Error('Unsupported restore format');
    if (!metadata.some(entry => resolve(entry.projectPath) === resolve(projectPath))) throw new Error('Project missing from graph');
  } catch { throw new Error('傳統專案的 NuGet Restore graph 評估失敗；請檢查 MSBuild/NuGet Restore targets、ProjectReference 與所需 Visual Studio workloads。'); }
  finally { await rm(graphPath, { force: true }); }

  const assets: RestoreProject[] = [];
  const configs: string[] = [];
  for (const entry of metadata) {
    if (entry.projectStyle === 'PackageReference') {
      if (!entry.outputPath) throw new Error('PackageReference 缺少評估後的還原輸出位置。');
      const lock = entry.restoreLockProperties?.nuGetLockFilePath ?? 'packages.lock.json';
      const lockPath = isAbsolute(lock) ? lock : resolve(dirname(entry.projectPath), lock);
      assets.push({ projectPath: entry.projectPath, assetsPath: join(resolve(dirname(entry.projectPath), entry.outputPath), 'project.assets.json'), lockPath, hasLock: await exists(lockPath) });
    } else configs.push(...await packageFiles(entry, dirname(entry.projectPath), solutionDirectory, properties.RestoreRepositoryPath, properties.NuGetRestoreTargets, tool, run, tempDirectory));
  }
  const preserved = [...new Set([...configs.filter(path => /\.config$/i.test(path)), ...assets.filter(project => project.hasLock).map(project => project.lockPath)])];
  const hashes = await Promise.all(preserved.map(async path => [path, await hash(path)] as const));
  try {
    await run({ executable: tool.executable, args: [projectPath, '-target:Restore', '-nologo', '-verbosity:quiet', ...common, ...(assets.some(project => project.hasLock) ? ['-p:RestoreLockedMode=true'] : [])], cwd, env: tool.env });
  } catch { throw new Error('MSBuild/NuGet 還原失敗；請檢查來源／認證／連線、既有 lockfile 一致性、packages.config 套件版本及專案所需 workloads。未轉印可能含認證的原始輸出。'); }
  finally {
    for (const [path, before] of hashes) if (!await exists(path) || await hash(path) !== before) throw new Error('還原修改了既有 packages.config 或 NuGet lockfile；請修正專案鎖定資訊後重試。');
  }
  for (const project of assets) {
    try {
      const content = JSON.parse(await readFile(project.assetsPath, 'utf8'));
      if (!content.targets || !content.libraries || resolve(content.project?.restore?.projectPath ?? '') !== resolve(project.projectPath)) throw new Error('Invalid assets');
    } catch { throw new Error('非 SDK-style PackageReference 未產生有效 project.assets.json；不會發佈缺少間接依賴資料的 SBOM。'); }
  }
  for (const path of configs) {
    try {
      if (!(await stat(path)).isFile()) throw new Error('not a file');
      if (/\.nupkg$/i.test(path)) {
        const bytes = await readFile(path);
        if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid package archive');
      }
    } catch { throw new Error('packages.config 還原後缺少有效 .nupkg 套件資料；請檢查 repositoryPath、套件快取及來源設定。'); }
  }
  await verifyFrameworkTargets(projectPath, properties.TargetFrameworkVersion, tool, run, cwd);
  return { assets, packageFiles: [...new Set(configs)] };
}
