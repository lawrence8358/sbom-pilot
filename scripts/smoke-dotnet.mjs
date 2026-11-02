import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
const root = resolve('.smoke/dotnet');
process.env.AGENT_TOOLSDIRECTORY ??= join(root, 'cache');
process.env.AGENT_TEMPDIRECTORY ??= join(root, 'temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { prepareTools } = await import('../.test-build/src/tools.js');
const { prepareDotnetSdk } = await import('../.test-build/src/dotnet/sdk.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const toolTemp = join(root, 'scan-tools');
await mkdir(toolTemp, { recursive: true });
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: toolTemp }, runProcess, console.log);
const evidence = [];

for (const scenario of [
  { name: 'sdk6-no-lock', sdk: '6.0.428', tfm: 'net6.0', policy: '{ // SDK 6 exact policy\n "sdk": { "version": "6.0.428", "rollForward": "disable" } }' },
  { name: 'sdk9-custom-locked', sdk: '9.0.316', tfm: 'net9.0', policy: '{"sdk":{"version":"9.0.300","rollForward":"latestFeature","allowPrerelease":false}}', locked: true },
  { name: 'sdk10-fallback', sdk: '10.0.101', tfm: 'net10.0' },
]) {
  const project = join(root, scenario.name);
  await mkdir(project, { recursive: true });
  const projectFile = join(project, 'Product.csproj');
  const projectXml = version => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${scenario.tfm}</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.Extensions.Logging" Version="${version}" /></ItemGroup></Project>`;
  await writeFile(projectFile, projectXml('6.0.0'));
  // Fixture-local configuration avoids inherited feeds; production does not replace NuGet.Config.
  await writeFile(join(project, 'NuGet.Config'), '<configuration><packageSources><clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>');
  if (scenario.policy) await writeFile(join(project, 'global.json'), scenario.policy);
  if (scenario.locked) {
    await mkdir(join(project, 'locks'), { recursive: true });
    await writeFile(join(project, 'Directory.Build.props'), '<Project><PropertyGroup><BaseIntermediateOutputPath>custom-obj/</BaseIntermediateOutputPath><RestorePackagesWithLockFile>true</RestorePackagesWithLockFile><NuGetLockFilePath>locks/product.lock.json</NuGetLockFilePath></PropertyGroup></Project>');
    await runProcess({ executable: 'dotnet', args: ['restore', projectFile, '--verbosity', 'quiet'], cwd: project });
  }
  const lockPath = join(project, 'locks', 'product.lock.json');
  const hashLock = async () => createHash('sha256').update(await readFile(lockPath)).digest('hex');
  const before = scenario.locked ? await hashLock() : undefined;
  const config = { environment: 'dotnet', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false };
  let publications = 0;
  const logs = [];
  const services = { log: message => { logs.push(message); console.log(message); }, prepare: async () => ({ ...tools, env: { ...tools.env } }), publish: async () => { publications++; } };
  const result = await runWorkflow(config, join(root, `run-${scenario.name}`), services);
  assert.ok(logs.some(message => message.includes(`SDK ${scenario.sdk}`)), 'Expected selected SDK in logs');
  assert.equal(publications, 1);
  const bytes = await readFile(result.path);
  const bom = JSON.parse(bytes);
  assert.ok(bom.components.some(component => component.name === 'Microsoft.Extensions.Logging'), 'Direct package missing');
  assert.ok(bom.components.some(component => component.name === 'Microsoft.Extensions.Logging.Abstractions'), 'Transitive package missing');
  assert.ok(bom.dependencies?.some(dependency => dependency.dependsOn?.length), 'Dependency edges missing');
  if (scenario.locked) {
    assert.equal(await hashLock(), before);
    await writeFile(projectFile, projectXml('7.0.0'));
    await assert.rejects(runWorkflow(config, join(root, 'run-stale-lock'), services), /依賴安裝.*locked mode/);
    assert.equal(publications, 1, 'Stale lock must not publish');
    assert.equal(await hashLock(), before);
    await writeFile(projectFile, projectXml('6.0.0'));
  } else {
    await assert.rejects(readFile(join(project, 'packages.lock.json')), { code: 'ENOENT' });
  }
  evidence.push({ scenario: scenario.name, platform: process.platform, arch: process.arch, sdk: scenario.sdk, node: tools.nodeVersion, cdxgen: tools.cdxgenVersion, specVersion: bom.specVersion, components: result.componentCount, direct: 'Microsoft.Extensions.Logging', transitive: 'Microsoft.Extensions.Logging.Abstractions', artifactSha256: createHash('sha256').update(bytes).digest('hex'), lockedUnchanged: scenario.locked || undefined });
  console.log(`DOTNET SMOKE PASS ${scenario.name}: ${result.componentCount} components; direct/transitive packages, dependency edges and schema verified.`);
}

// Opt-in acquisition test downloads a complete SDK into task-owned cache.
if (process.env.SBOM_PILOT_TEST_SDK_DOWNLOAD === '1') {
  const project = join(root, 'sdk10-fallback');
  const sdk = await prepareDotnetSdk(project, runProcess, { cacheDirectory: join(root, 'download-cache'), tempDirectory: join(root, 'download-temp'), env: { ...process.env, DOTNET_HOST_PATH: join(root, 'missing-host', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet') }, log: console.log });
  assert.equal(sdk.version, '10.0.101');
  assert.ok(sdk.executable.startsWith(join(root, 'download-cache')));
  const acquired = await runWorkflow({ environment: 'dotnet', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false }, join(root, 'run-acquired-sdk'), {
    log: console.log, prepare: async () => ({ ...tools, env: { ...tools.env, ...sdk.env } }), publish: async () => {},
  });
  const acquiredBom = JSON.parse(await readFile(acquired.path, 'utf8'));
  assert.ok(acquiredBom.components.some(component => component.name === 'Microsoft.Extensions.Logging.Abstractions'));
  evidence.push({ scenario: 'official-sdk-acquisition', platform: process.platform, arch: process.arch, sdk: sdk.version, hostVerified: true, restoredAndScanned: true, components: acquired.componentCount });
  console.log('DOTNET SDK ACQUISITION PASS: official script installed SDK in task-owned cache, host verified, real restore and SBOM passed.');
}
await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log('Only local artifact adapter tested; real Azure DevOps publication and Linux .NET execution require separate evidence.');
