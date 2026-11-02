import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findMSBuild, evaluateFrameworkProject, type MSBuildTool } from '../src/dotnet/msbuild';
import { findSolutionDirectory, restoreFrameworkProject } from '../src/dotnet/framework';
import { generateSbom, scanArguments } from '../src/scan';
import { validateConfig, type TaskConfig } from '../src/config';
import type { ProcessRunner, Command } from '../src/process';
import type { ToolContext } from '../src/tools';

async function fixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sbom-framework-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const result = (stdout = '') => ({ stdout, stderr: '' });

test('Framework platform and MSBuild prerequisites fail clearly before invoking restore', () => fixture(async root => {
  await assert.rejects(findMSBuild(root, async () => result(), {}, 'linux'), /Windows Agent/);
  await assert.rejects(findMSBuild(root, async () => result(), { MSBUILD_EXE_PATH: join(root, 'missing.exe') }, 'win32'), /預裝.*MSBuild/);
  const executable = join(root, 'MSBuild.exe'); await writeFile(executable, 'fixture');
  await assert.rejects(findMSBuild(root, async () => result('16.11.0'), { MSBUILD_EXE_PATH: executable }, 'win32'), /17.8/);
  assert.equal((await findMSBuild(root, async () => result('17.14.51.32402'), { MSBUILD_EXE_PATH: executable }, 'win32')).version, '17.14.51');
}));

test('structured MSBuild project evaluation reports missing workloads without child output leaks', () => fixture(async root => {
  const tool: MSBuildTool = { executable: 'MSBuild.exe', version: '17.14.51', env: {} };
  await assert.rejects(evaluateFrameworkProject('Product.csproj', tool, async () => { throw new Error('SECRET raw output'); }, root), error => error instanceof Error && /workloads/.test(error.message) && !error.message.includes('SECRET'));
}));

test('solution context is derived from an actual project reference, not an unrelated solution', () => fixture(async root => {
  const project = join(root, 'Product', 'Product.csproj'); await mkdir(dirname(project));
  await writeFile(join(root, 'Other.sln'), 'Project("{TYPE}") = "Other", "Other\\Other.csproj", "{GUID}"');
  assert.equal(await findSolutionDirectory(project, root), undefined);
  await writeFile(join(root, 'Product.sln'), 'Project("{TYPE}") = "Product", "Product\\Product.csproj", "{GUID}"');
  assert.equal(await findSolutionDirectory(project, root), root);
}));

async function restoreFixture(root: string, style: string, options: { lock?: boolean; failRestore?: boolean; missingPayload?: boolean; changeConfig?: boolean; missingTargets?: boolean } = {}): Promise<{ run: ProcessRunner; calls: Command[]; project: string; tool: MSBuildTool; config: string }> {
  const project = join(root, 'Product.csproj');
  const config = join(root, 'packages.config');
  const lock = join(root, 'custom.lock.json');
  const asset = join(root, 'custom-obj', 'project.assets.json');
  const archive = join(root, 'repository', 'Package.1.0.0', 'Package.1.0.0.nupkg');
  await writeFile(project, '<Project />'); await writeFile(config, '<packages />');
  if (options.lock) await writeFile(lock, 'lock bytes');
  const calls: Command[] = [];
  const tool: MSBuildTool = { executable: 'MSBuild.exe', version: '17.14.51', env: { NuGetPackageSourceCredentials_Feed: 'Username=user;Password=secret' } };
  const run: ProcessRunner = async command => {
    calls.push(command);
    assert.equal(command.env?.NuGetPackageSourceCredentials_Feed, tool.env.NuGetPackageSourceCredentials_Feed);
    if (command.args.some(argument => argument.startsWith('-getProperty:'))) return result(JSON.stringify({ Properties: { NuGetRestoreTargets: join(root, 'NuGet.targets'), RestoreRepositoryPath: '', RestoreSolutionDirectory: '', TargetFrameworkVersion: 'v4.8', TargetFrameworkIdentifier: '.NETFramework' } }));
    if (command.executable === 'powershell.exe') return result(JSON.stringify({ repositoryPath: join(root, 'repository'), files: [archive] }));
    if (command.args.includes('-target:GenerateRestoreGraphFile')) {
      const graph = command.args.find(value => value.startsWith('-p:RestoreGraphOutputPath='))!.slice('-p:RestoreGraphOutputPath='.length);
      await writeFile(graph, JSON.stringify({ projects: { [project]: { restore: { projectPath: project, projectStyle: style, outputPath: dirname(asset), restoreLockProperties: { nuGetLockFilePath: lock }, configFilePaths: [], packagesConfigPath: config } } } }));
    }
    if (command.args.includes('-target:Restore')) {
      if (options.failRestore) throw new Error('SECRET source/token');
      await mkdir(dirname(asset), { recursive: true });
      await writeFile(asset, JSON.stringify({ targets: {}, libraries: {}, project: { restore: { projectPath: project } } }));
      if (!options.missingPayload) { await mkdir(dirname(archive), { recursive: true }); await writeFile(archive, Buffer.from([0x50, 0x4b, 0x03, 0x04])); }
      if (options.changeConfig) await writeFile(config, '<packages changed="true"/>');
    }
    if (options.missingTargets && command.args.includes('-target:GetReferenceAssemblyPaths')) throw new Error('missing targeting pack');
    return result();
  };
  return { run, calls, project, tool, config };
}

test('traditional PackageReference preserves custom existing lock and evaluated assets using MSBuild', () => fixture(async root => {
  const f = await restoreFixture(root, 'PackageReference', { lock: true });
  const restored = await restoreFrameworkProject(f.project, root, f.tool, f.run, join(root, 'temp'));
  assert.equal(restored.assets[0].hasLock, true);
  assert.equal(restored.assets[0].assetsPath, join(root, 'custom-obj', 'project.assets.json'));
  assert.ok(f.calls.find(command => command.args.includes('-target:Restore'))!.args.includes('-p:RestoreLockedMode=true'));
  assert.equal(await readFile(join(root, 'custom.lock.json'), 'utf8'), 'lock bytes');
}));

test('packages.config uses built-in NuGet, verifies restored payload and needs no optional lock', () => fixture(async root => {
  const f = await restoreFixture(root, 'PackagesConfig');
  const restored = await restoreFrameworkProject(f.project, root, f.tool, f.run, join(root, 'temp'));
  assert.equal(restored.assets.length, 0);
  assert.equal(restored.packageFiles.length, 2);
  const restore = f.calls.find(command => command.args.includes('-target:Restore'))!;
  assert.ok(restore.args.includes('-p:RestorePackagesConfig=true'));
  assert.equal(restore.args.includes('-p:RestoreLockedMode=true'), false);
}));

test('restore failure, missing packages, modified config and targeting pack failure are explicit', () => fixture(async root => {
  for (const [name, options, expected] of [
    ['restore', { failRestore: true }, /MSBuild\/NuGet 還原失敗/],
    ['payload', { missingPayload: true }, /缺少有效 .nupkg/],
    ['changed', { changeConfig: true }, /修改了既有/],
    ['targets', { missingTargets: true }, /Targeting Pack/],
  ] as const) {
    const directory = join(root, name); await mkdir(directory);
    const f = await restoreFixture(directory, 'PackagesConfig', options);
    await assert.rejects(restoreFrameworkProject(f.project, directory, f.tool, f.run, join(directory, 'temp')), error => error instanceof Error && expected.test(error.message) && !error.message.includes('SECRET'));
  }
}));

test('Framework scanner requires traditional dependency inputs and uses shared required-only contract', () => fixture(async root => {
  const config: TaskConfig = { environment: 'netframework', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: ['packages/**'], fetchLicense: false, noCache: true, uploadToDt: false };
  const tools: ToolContext = { node: process.execPath, npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: {}, dotnetPackageFiles: [join(root, 'packages', 'Package.nupkg')] };
  const request = { config, tools, outputPath: join(root, 'bom.json') };
  const args = scanArguments(request);
  assert.equal(args[args.indexOf('-t') + 1], 'dotnet');
  assert.ok(args.includes('--required-only'));
  await assert.rejects(generateSbom(request, async () => result()), /排除規則遮蔽/);
  if (process.platform === 'win32') assert.equal((await validateConfig({ ...config, excludes: [] })).environment, 'netframework');
  else await assert.rejects(validateConfig(config), /Windows Agent/);
}));
