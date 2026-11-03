import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ProcessRunner } from '../process';
import type { RestoreProject } from './restore';
import { validRestoreAssets } from './assets';
import { withNuGetCredentials, type NuGetCredential } from './credentials';
import { withFrameworkSourceReader } from './sources';
import { evaluateFrameworkProject, verifyFrameworkTargets, type MSBuildTool } from './msbuild';

/** 確認評估後的鎖檔或路徑是否存在，供傳統 NuGet 還原決定保留政策。 */
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** 計算既有設定／鎖檔的 SHA-256，以便還原完成或失敗後核對內容不變。 */
const hash = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
interface GraphRestore {
  projectPath: string;
  projectStyle: string;
  outputPath?: string;
  configFilePaths?: string[];
  sources?: Record<string, unknown>;
  packagesConfigPath?: string;
  restoreLockProperties?: { nuGetLockFilePath?: string };
}
export interface FrameworkRestoreResult {
  assets: RestoreProject[];
  packageFiles: string[];
}

/** 向上尋找真正參照此專案的 solution，不跨共同根目錄猜測 packages 位置。 */
export async function findSolutionDirectory(
  projectPath: string,
  root: string,
): Promise<string | undefined> {
  let directory = dirname(resolve(projectPath));
  const boundary = resolve(root);

  for (;;) {
    const projectRelative = relative(directory, projectPath).replaceAll('\\', '/').toLowerCase();

    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (!file.isFile() || !/\.sln$/i.test(file.name)) {
        continue;
      }

      const content = await readFile(join(directory, file.name), 'utf8');
      const references = [...content.matchAll(/^Project\([^\r\n]*?=\s*"[^"]*",\s*"([^"]+)"/gm)];

      if (
        references.some(
          (reference) =>
            reference[1].replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase() ===
            projectRelative,
        )
      ) {
        return directory;
      }
    }

    if (directory === boundary) {
      return undefined;
    }

    const parent = dirname(directory);

    if (parent === directory || relative(boundary, parent).startsWith('..')) {
      return undefined;
    }

    directory = parent;
  }
}

// 設定優先序、環境展開、XML 及 NuGet 版本正規化皆交給與還原工具相同的 Microsoft 組件。
const packageMetadataScript = `param([string]$InputFile)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$payload = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
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

/** 交由 MSBuild 隨附 NuGet 組件解析 repositoryPath 與套件清單，並在 finally 移除輔助檔。 */
async function packageFiles(
  metadata: GraphRestore,
  projectDirectory: string,
  solutionDirectory: string | undefined,
  restoreRepositoryPath: string,
  nugetTargets: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  tempDirectory: string,
): Promise<string[]> {
  if (!metadata.packagesConfigPath || !Array.isArray(metadata.configFilePaths)) {
    throw new Error('packages.config 還原圖缺少必要的來源設定／清單路徑。');
  }

  const token = randomUUID();
  const input = join(tempDirectory, `packages-${token}.json`);
  const script = join(tempDirectory, `packages-${token}.ps1`);

  try {
    await writeFile(
      input,
      JSON.stringify({
        assemblyDirectory: dirname(resolve(nugetTargets)),
        configFiles: metadata.configFilePaths,
        restoreRepositoryPath,
        solutionDirectory,
        projectDirectory,
        packagesConfigPath: metadata.packagesConfigPath,
      }),
    );
    await writeFile(script, packageMetadataScript);

    const output = await run({
      executable: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-InputFile',
        input,
      ],
      cwd: projectDirectory,
      env: tool.env,
      timeoutMs: 60_000,
    });
    const result = JSON.parse(output.stdout);

    if (
      !Array.isArray(result.files) ||
      result.files.some((path: unknown) => typeof path !== 'string')
    ) {
      throw new Error('Invalid package metadata');
    }

    return [metadata.packagesConfigPath, ...result.files];
  } catch {
    throw new Error(
      '無法判定 packages.config 的套件位置或清單格式；請在掃描根目錄內提供包含該專案的 .sln，或在 NuGet.Config 設定 repositoryPath，並確認 Visual Studio 的 NuGet 元件完整。',
    );
  } finally {
    await rm(input, { force: true });
    await rm(script, { force: true });
  }
}

/** 用實際 MSBuild 評估完整還原圖，驗證支援格式與入口專案後刪除暫存 graph。 */
async function readFrameworkGraph(
  projectPath: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  tempDirectory: string,
  common: string[],
): Promise<GraphRestore[]> {
  const cwd = dirname(projectPath);
  const graphPath = join(tempDirectory, `framework-${randomUUID()}.json`);

  try {
    await run({
      executable: tool.executable,
      args: [
        projectPath,
        '-target:GenerateRestoreGraphFile',
        `-p:RestoreGraphOutputPath=${graphPath}`,
        '-nologo',
        '-verbosity:quiet',
        ...common,
      ],
      cwd,
      env: tool.env,
    });

    const graph = JSON.parse(await readFile(graphPath, 'utf8'));
    const metadata: GraphRestore[] = Object.values(graph.projects ?? {}).map(
      (entry: any) => entry.restore,
    );

    if (
      !metadata.length ||
      metadata.some(
        (entry) =>
          !entry?.projectPath ||
          !['PackageReference', 'PackagesConfig'].includes(entry.projectStyle),
      )
    ) {
      throw new Error('Unsupported restore format');
    }
    if (!metadata.some((entry) => resolve(entry.projectPath) === resolve(projectPath))) {
      throw new Error('Project missing from graph');
    }

    return metadata;
  } catch {
    throw new Error(
      '傳統專案的 NuGet Restore graph 評估失敗；請檢查 MSBuild/NuGet Restore targets、ProjectReference 與所需 Visual Studio workloads。',
    );
  } finally {
    await rm(graphPath, { force: true });
  }
}

/** 確認 PackageReference assets 與 packages.config 的實際 nupkg 完整，避免發佈缺少間接依賴的結果。 */
async function verifyRestoredInputs(assets: RestoreProject[], configs: string[]): Promise<void> {
  for (const project of assets) {
    if (!(await validRestoreAssets(project.assetsPath, project.projectPath))) {
      throw new Error(
        '非 SDK-style PackageReference 未產生有效 project.assets.json；不會發佈缺少間接依賴資料的 SBOM。',
      );
    }
  }
  for (const path of configs) {
    try {
      if (!(await stat(path)).isFile()) {
        throw new Error('not a file');
      }
      if (/\.nupkg$/i.test(path)) {
        const bytes = await readFile(path);

        if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
          throw new Error('Invalid package archive');
        }
      }
    } catch {
      throw new Error(
        'packages.config 還原後缺少有效 .nupkg 套件資料；請檢查 repositoryPath、套件快取及來源設定。',
      );
    }
  }
}

/** 協調傳統專案評估、還原、鎖檔保留及 targeting pack 檢查；私有認證只作用於最終 restore。 */
export async function restoreFrameworkProject(
  projectPath: string,
  root: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  tempDirectory: string,
  credentials?: NuGetCredential[],
): Promise<FrameworkRestoreResult> {
  const cwd = dirname(projectPath);
  const properties = await evaluateFrameworkProject(projectPath, tool, run, cwd);
  const solutionDirectory =
    properties.RestoreSolutionDirectory || (await findSolutionDirectory(projectPath, root));
  const common = [
    '-p:RestorePackagesConfig=true',
    '-p:RestoreUseSkipNonexistentTargets=false',
    ...(solutionDirectory ? [`-p:SolutionDir=${solutionDirectory}${sep}`] : []),
  ];

  await mkdir(tempDirectory, { recursive: true });

  const metadata = await readFrameworkGraph(projectPath, tool, run, tempDirectory, common);

  const assets: RestoreProject[] = [];
  const configs: string[] = [];

  for (const entry of metadata) {
    if (entry.projectStyle === 'PackageReference') {
      if (!entry.outputPath) {
        throw new Error('PackageReference 缺少評估後的還原輸出位置。');
      }

      const lock = entry.restoreLockProperties?.nuGetLockFilePath ?? 'packages.lock.json';
      const lockPath = isAbsolute(lock) ? lock : resolve(dirname(entry.projectPath), lock);

      assets.push({
        projectPath: entry.projectPath,
        assetsPath: join(
          resolve(dirname(entry.projectPath), entry.outputPath),
          'project.assets.json',
        ),
        lockPath,
        hasLock: await exists(lockPath),
      });
    } else {
      const entryProperties =
        resolve(entry.projectPath) === resolve(projectPath)
          ? properties
          : await evaluateFrameworkProject(
              entry.projectPath,
              tool,
              run,
              dirname(entry.projectPath),
            );
      const entrySolution =
        entryProperties.RestoreSolutionDirectory ||
        (await findSolutionDirectory(entry.projectPath, root));

      configs.push(
        ...(await packageFiles(
          entry,
          dirname(entry.projectPath),
          entrySolution,
          entryProperties.RestoreRepositoryPath,
          entryProperties.NuGetRestoreTargets,
          tool,
          run,
          tempDirectory,
        )),
      );
    }
  }

  const preserved = [
    ...new Set([
      ...configs.filter((path) => /\.config$/i.test(path)),
      ...assets.filter((project) => project.hasLock).map((project) => project.lockPath),
    ]),
  ];
  const hashes = await Promise.all(
    preserved.map(async (path) => [path, await hash(path)] as const),
  );

  try {
    /** 以評估後的 MSBuild 參數執行還原，只有既有鎖檔存在時要求 locked mode。 */
    const restore = (env: NodeJS.ProcessEnv) =>
      run({
        executable: tool.executable,
        args: [
          projectPath,
          '-target:Restore',
          '-nologo',
          '-verbosity:quiet',
          ...common,
          ...(assets.some((project) => project.hasLock) ? ['-p:RestoreLockedMode=true'] : []),
        ],
        cwd,
        env,
      });

    if (credentials?.length) {
      await withFrameworkSourceReader(
        properties.NuGetRestoreTargets,
        tool,
        run,
        tempDirectory,
        (read) => withNuGetCredentials(credentials, metadata, read, tool.env, restore),
      );
    } else {
      await restore(tool.env);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NuGet 認證')) {
      throw error;
    }

    throw new Error(
      'MSBuild/NuGet 還原失敗；請檢查來源／認證／連線、既有 lockfile 一致性、packages.config 套件版本及專案所需 workloads。未轉印可能含認證的原始輸出。',
    );
  } finally {
    for (const [path, before] of hashes) {
      if (!(await exists(path)) || (await hash(path)) !== before) {
        throw new Error(
          '還原修改了既有 packages.config 或 NuGet lockfile；請修正專案鎖定資訊後重試。',
        );
      }
    }
  }

  await verifyRestoredInputs(assets, configs);
  await verifyFrameworkTargets(projectPath, properties.TargetFrameworkVersion, tool, run, cwd);

  return { assets, packageFiles: [...new Set(configs)] };
}
