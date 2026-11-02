import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

if (process.platform !== 'win32') throw new Error('Framework smoke requires Windows and installed Visual Studio MSBuild >=17.8.');
const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
const root = resolve('.smoke/framework');
process.env.AGENT_TOOLSDIRECTORY ??= join(root, 'cache');
process.env.AGENT_TEMPDIRECTORY ??= join(root, 'temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { prepareTools } = await import('../.test-build/src/tools.js');
const { findMSBuild } = await import('../.test-build/src/dotnet/msbuild.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const toolTemp = join(root, 'tools'); await mkdir(toolTemp, { recursive: true });
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: toolTemp }, runProcess, console.log);
const msbuild = await findMSBuild(root, runProcess, tools.env);
console.log(`Framework smoke: Windows ${process.arch}, MSBuild ${msbuild.version}.`);
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const sourceConfig = repository => `<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources>${repository ? `<config><add key="repositoryPath" value="${repository}"/></config>` : ''}</configuration>`;
const classicProject = references => `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')"/><PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion><OutputType>Library</OutputType><OutputPath>bin\\Debug\\</OutputPath><AssemblyName>FrameworkProduct</AssemblyName><ProjectGuid>{52F4CE86-C95F-4D82-AD93-2B230B84FCAD}</ProjectGuid></PropertyGroup>${references}<Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets"/></Project>`;
const packageReference = version => `<ItemGroup><PackageReference Include="Microsoft.Extensions.Logging" Version="${version}"/></ItemGroup>`;
const config = projectPath => ({ environment: 'netframework', projectPath, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false });
const evidence = [];
let referenceLibraries;

for (const format of ['non-sdk-package-reference', 'packages-config', 'sdk-net48']) {
  const product = join(root, format === 'packages-config' ? 'packages-config-unicode' : format);
  const projectFolder = format === 'packages-config' ? '交付產品' : 'Product';
  const projectDirectory = join(product, projectFolder);
  await mkdir(projectDirectory, { recursive: true });
  const projectFile = join(projectDirectory, 'Product.csproj');
  const nugetConfig = join(product, 'NuGet.Config');
  const isPackagesConfig = format === 'packages-config';
  await writeFile(nugetConfig, sourceConfig(isPackagesConfig ? 'payloads' : undefined));
  if (format === 'sdk-net48') {
    await writeFile(projectFile, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net48</TargetFramework></PropertyGroup>${packageReference('6.0.0')}</Project>`);
    await writeFile(join(product, 'global.json'), '{"sdk":{"version":"10.0.101","rollForward":"disable"}}');
  } else if (isPackagesConfig) {
    assert.ok(referenceLibraries?.length, 'Run PackageReference fixture first to obtain a valid flattened legacy package list.');
    await writeFile(projectFile, classicProject('<ItemGroup><None Include="packages.config"/></ItemGroup>'));
    await writeFile(join(projectDirectory, 'packages.config'), `<packages>${referenceLibraries.map(([name, version]) => `<package id="${name}" version="${version}" targetFramework="net48"/>`).join('')}</packages>`);
    await writeFile(join(product, 'Product.sln'), `Microsoft Visual Studio Solution File, Format Version 12.00\n# Visual Studio Version 17\nProject("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Product", "${projectFolder}\\Product.csproj", "{52F4CE86-C95F-4D82-AD93-2B230B84FCAD}"\nEndProject\nGlobal\nEndGlobal\n`);
  } else {
    await writeFile(projectFile, classicProject(packageReference('6.0.0')));
    await writeFile(join(projectDirectory, 'Directory.Build.props'), '<Project><PropertyGroup><RestorePackagesWithLockFile>true</RestorePackagesWithLockFile><NuGetLockFilePath>locked.dependencies.json</NuGetLockFilePath></PropertyGroup></Project>');
    // Produce a legitimate pre-existing lock as source-controlled fixture input.
    await runProcess({ executable: msbuild.executable, args: [projectFile, '-t:Restore', '-nologo', '-v:quiet'], cwd: projectDirectory, env: tools.env });
  }
  const immutableFiles = [nugetConfig, projectFile, ...(isPackagesConfig ? [join(projectDirectory, 'packages.config')] : []), ...(format === 'non-sdk-package-reference' ? [join(projectDirectory, 'locked.dependencies.json')] : [])];
  const before = await Promise.all(immutableFiles.map(async path => [path, await hash(path)]));
  let published = 0;
  const services = { log: console.log, prepare: async () => ({ ...tools, env: { ...tools.env } }), publish: async () => { published++; } };
  const artifact = await runWorkflow(config(product), join(root, `run-${format}`), services);
  const bytes = await readFile(artifact.path); const bom = JSON.parse(bytes);
  const direct = bom.components.find(component => component.name === 'Microsoft.Extensions.Logging');
  const transitive = bom.components.find(component => component.name === 'Microsoft.Extensions.Logging.Abstractions');
  assert.ok(direct && transitive, `${format} omitted direct/transitive package`);
  assert.ok(bom.dependencies?.find(dependency => dependency.ref === direct['bom-ref'])?.dependsOn?.includes(transitive['bom-ref']), `${format} omitted the direct-to-transitive dependency edge`);
  assert.equal(bom.specVersion, '1.6'); assert.equal(published, 1);
  for (const [path, digest] of before) assert.equal(await hash(path), digest, `${format} changed an input`);
  if (format === 'non-sdk-package-reference') {
    const assets = JSON.parse(await readFile(join(projectDirectory, 'obj', 'project.assets.json'), 'utf8'));
    referenceLibraries = Object.entries(assets.libraries).filter(([, metadata]) => metadata.type === 'package').map(([identity]) => { const slash = identity.lastIndexOf('/'); return [identity.slice(0, slash), identity.slice(slash + 1)]; });
    await writeFile(projectFile, classicProject(packageReference('7.0.0')));
    await assert.rejects(runWorkflow(config(product), join(root, 'run-stale-lock'), services), /依賴安裝.*MSBuild\/NuGet 還原失敗/);
    assert.equal(published, 1);
    await writeFile(projectFile, classicProject(packageReference('6.0.0')));
    assert.equal(await hash(join(projectDirectory, 'locked.dependencies.json')), before.find(([path]) => path.endsWith('locked.dependencies.json'))[1]);
  }
  evidence.push({ format, platform: process.platform, arch: process.arch, msbuild: msbuild.version, node: tools.nodeVersion, cdxgen: tools.cdxgenVersion, specVersion: bom.specVersion, components: artifact.componentCount, direct: direct.name, transitive: transitive.name, dependencyEdges: true, inputsUnchanged: true, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`FRAMEWORK SMOKE PASS ${format}: ${artifact.componentCount} components, direct/transitive and graph evidence, inputs unchanged.`);
  await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
}

const failure = join(root, 'failure-targets'); await mkdir(failure, { recursive: true });
await writeFile(join(failure, 'NuGet.Config'), sourceConfig());
await writeFile(join(failure, 'Product.csproj'), classicProject('<Import Project="Missing.Web.Workload.targets"/>'));
let failedPublications = 0;
const services = { log: () => {}, prepare: async () => ({ ...tools, env: { ...tools.env } }), publish: async () => { failedPublications++; } };
await assert.rejects(runWorkflow(config(failure), join(root, 'run-failure-targets'), services), /依賴安裝.*workloads/);
await assert.rejects(runWorkflow(config(failure), join(root, 'run-failure-msbuild'), { ...services, prepare: async () => ({ ...tools, env: { ...tools.env, MSBUILD_EXE_PATH: join(root, 'missing', 'MSBuild.exe') } }) }), /依賴安裝.*預裝.*MSBuild/);
assert.equal(failedPublications, 0);
console.log('FRAMEWORK FAILURE PASS: missing MSBuild and missing imported workload targets fail before publication.');
console.log('Only local artifact adapters tested; real Azure DevOps installation/publication remains external validation.');
