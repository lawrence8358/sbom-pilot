import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { readSdkPolicy, prepareDotnetSdk, FALLBACK_DOTNET_SDK, type DotnetSdk } from '../src/dotnet/sdk';
import { discoverDotnetProjects } from '../src/dotnet/projects';
import { restoreDotnetProject } from '../src/dotnet/restore';
import { scanArguments } from '../src/scan';
import { runWorkflow } from '../src/workflow';
import type { ProcessRunner, Command } from '../src/process';
import type { ToolContext } from '../src/tools';

async function fixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sbom-dotnet-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const response = (stdout = '') => ({ stdout, stderr: '' });
const tools: ToolContext = { node: process.execPath, npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: { ...process.env } };

test('nearest JSONC global.json is used; full SDK policy is validated', () => fixture(async root => {
  const nested = join(root, 'a', 'b');
  await mkdir(nested, { recursive: true });
  await writeFile(join(root, 'global.json'), '{ "sdk": { "version": "6.0.428", "rollForward": "disable" } }');
  await writeFile(join(root, 'a', 'global.json'), '{ // SDK policy\n "sdk": { "version": "9.0.300", /* comment */ "rollForward": "latestFeature", "allowPrerelease": false, }, }');
  assert.deepEqual(await readSdkPolicy(nested), { path: join(root, 'a', 'global.json'), version: '9.0.300', rollForward: 'latestFeature', allowPrerelease: false });
  await writeFile(join(root, 'a', 'global.json'), '{"sdk":{"version":"9.0.x"}}');
  await assert.rejects(readSdkPolicy(nested), /完整 SDK/);
  await writeFile(join(root, 'a', 'global.json'), '{"sdk":{"paths":["$host$"]}}');
  await assert.rejects(readSdkPolicy(nested), /sdk.paths/);
}));

test('SDK host owns rollForward from restore cwd; no install when compatible host exists', () => fixture(async root => {
  await writeFile(join(root, 'global.json'), '{"sdk":{"version":"9.0.300","rollForward":"latestFeature"}}');
  const calls: Command[] = [];
  const installRoot = join(root, 'installed');
  const run: ProcessRunner = async command => {
    calls.push(command);
    assert.equal(command.cwd, root);
    return response(command.args[0] === '--list-sdks' ? `9.0.316 [${join(installRoot, 'sdk')}]` : '9.0.316\n');
  };
  const sdk = await prepareDotnetSdk(root, run, { cacheDirectory: join(root, 'cache'), tempDirectory: join(root, 'temp'), env: { PATH: 'original' }, download: async () => { throw new Error('must not download'); } });
  assert.equal(sdk.version, '9.0.316');
  assert.equal(sdk.env.DOTNET_ROOT, installRoot);
  assert.equal(calls.length, 3);
}));

test('missing SDK uses exact official install script in task cache and validates selected SDK', () => fixture(async root => {
  await writeFile(join(root, 'global.json'), '{"sdk":{"version":"6.0.428","rollForward":"disable"}}');
  const calls: Command[] = [];
  let installed = false;
  const run: ProcessRunner = async command => {
    calls.push(command);
    if (command.executable === 'dotnet') throw new Error('missing SDK');
    if (['powershell.exe', 'bash'].includes(command.executable)) { installed = true; return response(); }
    assert.equal(installed, true);
    return response('6.0.428');
  };
  let url = '';
  const sdk = await prepareDotnetSdk(root, run, { cacheDirectory: join(root, 'cache'), tempDirectory: join(root, 'temp'), env: { PATH: 'original' }, download: async value => { url = value; return Buffer.from('# official script fixture'); } });
  assert.match(url, /^https:\/\/dot\.net\/v1\/dotnet-install\.(ps1|sh)$/);
  assert.equal(sdk.version, '6.0.428');
  assert.match(sdk.executable, /sbom-pilot-dotnet/);
  const install = calls.find(command => ['powershell.exe', 'bash'].includes(command.executable))!;
  assert.ok(install.args.includes('6.0.428'));
  assert.ok(install.args.includes(process.platform === 'win32' ? '-NoPath' : '--no-path'));
  assert.equal(await readFile(join(dirname(sdk.executable), '.complete'), 'utf8'), '6.0.428');
}));

test('no global SDK declaration uses a fixed SDK instead of guessing from TFM', () => fixture(async root => {
  const run: ProcessRunner = async command => response(command.args[0] === '--list-sdks' ? `${FALLBACK_DOTNET_SDK} [${join(root, 'sdk')}]` : FALLBACK_DOTNET_SDK);
  assert.equal((await prepareDotnetSdk(root, run, { cacheDirectory: root, tempDirectory: root, env: {} })).version, FALLBACK_DOTNET_SDK);
}));

test('project discovery ignores generated/excluded projects and detects legacy formats', () => fixture(async root => {
  await mkdir(join(root, 'obj'), { recursive: true });
  await mkdir(join(root, '_DesignFront'), { recursive: true });
  await writeFile(join(root, 'Product.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />');
  await writeFile(join(root, 'Legacy.vbproj'), '<Project><!-- <Project Sdk="Microsoft.NET.Sdk" /> --></Project>');
  await writeFile(join(root, 'obj', 'Generated.csproj'), '<Project />');
  await writeFile(join(root, '_DesignFront', 'Excluded.csproj'), '<Project />');
  const projects = await discoverDotnetProjects(root, ['**/_Design{,Front}/**']);
  assert.deepEqual(projects.map(project => [basename(project.path), project.sdkStyle]), [['Legacy.vbproj', false], ['Product.csproj', true]]);
}));

test('NuGet evaluated custom paths and existing locks drive restore; absent optional locks are allowed', () => fixture(async root => {
  const projectPath = join(root, 'Product.csproj');
  const lockPath = join(root, 'custom-lock.json');
  const outputPath = join(root, 'custom-obj');
  await mkdir(outputPath);
  await writeFile(lockPath, 'existing lock bytes');
  const sdk: DotnetSdk = { executable: 'dotnet', version: '9.0.316', env: {}, policy: {} };
  const restores: Command[] = [];
  const run: ProcessRunner = async command => {
    if (command.args[0] === 'msbuild') {
      const graphPath = command.args.find(value => value.startsWith('-p:RestoreGraphOutputPath='))!.slice('-p:RestoreGraphOutputPath='.length);
      await writeFile(graphPath, JSON.stringify({ projects: { [projectPath]: { restore: { projectPath, outputPath, projectStyle: 'PackageReference', restoreLockProperties: { nuGetLockFilePath: 'custom-lock.json' } } } } }));
    } else {
      restores.push(command);
      await writeFile(join(outputPath, 'project.assets.json'), JSON.stringify({ targets: {}, libraries: {}, project: { restore: { projectPath } } }));
    }
    return response();
  };
  assert.equal((await restoreDotnetProject(projectPath, sdk, run, join(root, 'temp')))[0].assetsPath, join(outputPath, 'project.assets.json'));
  assert.ok(restores[0].args.includes('--locked-mode'));
  await rm(lockPath);
  await restoreDotnetProject(projectPath, sdk, run, join(root, 'temp'));
  assert.equal(restores[1].args.includes('--locked-mode'), false);
}));

test('missing restore assets and changed existing lock fail before SBOM generation', () => fixture(async root => {
  const projectPath = join(root, 'Product.csproj');
  const lockPath = join(root, 'packages.lock.json');
  const sdk: DotnetSdk = { executable: 'dotnet', version: '9.0.316', env: {}, policy: {} };
  let changeLock = false;
  const run: ProcessRunner = async command => {
    if (command.args[0] === 'msbuild') {
      await writeFile(command.args.find(value => value.startsWith('-p:RestoreGraphOutputPath='))!.slice('-p:RestoreGraphOutputPath='.length), JSON.stringify({ projects: { [projectPath]: { restore: { projectPath, outputPath: join(root, 'obj'), projectStyle: 'PackageReference' } } } }));
    } else if (changeLock) await writeFile(lockPath, 'changed');
    return response();
  };
  await assert.rejects(restoreDotnetProject(projectPath, sdk, run, join(root, 'temp')), /project.assets.json/);
  await writeFile(lockPath, 'original'); changeLock = true;
  await assert.rejects(restoreDotnetProject(projectPath, sdk, run, join(root, 'temp')), /修改了既有/);
}));

test('dotnet workflow uses common validation/publication and scan contract', () => fixture(async root => {
  const config = { environment: 'dotnet', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: [], fetchLicense: false, noCache: true, uploadToDt: false };
  const args = scanArguments({ config, tools, outputPath: 'bom.json' });
  assert.equal(args[args.indexOf('-t') + 1], 'dotnet');
  assert.ok(args.includes('--required-only'));
  assert.ok(args.includes('1.6'));
  let published = false;
  await runWorkflow(config, root, { log: () => {}, prepare: async () => ({ ...tools }), installer: { install: async () => {} }, generate: async () => {}, validate: async path => ({ path, componentCount: 2 }), publish: async () => { published = true; } });
  assert.equal(published, true);
  await assert.rejects(runWorkflow(config, root, { log: () => {}, prepare: async () => ({ ...tools }), installer: { install: async () => { throw new Error('SDK incompatible'); } }, publish: async () => {} }), /依賴安裝.*SDK incompatible/);
}));
