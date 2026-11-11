import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';

const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { prepareTools } = await import('../.test-build/src/tools.js');
const { findMSBuild } = await import('../.test-build/src/dotnet/msbuild.js');
const { prepareDotnetSdk } = await import('../.test-build/src/dotnet/sdk.js');
const { restoreDotnetProject } = await import('../.test-build/src/dotnet/restore.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const root = resolve('.smoke/nuget-auth');
await mkdir(root, { recursive: true });
process.env.AGENT_TOOLSDIRECTORY ??= join(root, 'tools-cache');
process.env.AGENT_TEMPDIRECTORY ??= join(root, 'agent-temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const toolsDirectory = join(root, 'scan-tools'); await mkdir(toolsDirectory, { recursive: true });
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: toolsDirectory }, runProcess, console.log);
const username = `pilot-${randomBytes(8).toString('hex')}`, password = randomBytes(24).toString('hex');
const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const requests = [];
const packages = new Map();
for (const [id, dependency] of [['Pilot.Private', 'Pilot.Public'], ['Pilot.Public', undefined]]) {
  const zip = new JSZip();
  zip.file(`${id}.nuspec`, `<?xml version="1.0"?><package><metadata><id>${id}</id><version>1.0.0</version><authors>SBOM Pilot fixture</authors><description>Local authentication test package</description>${dependency ? `<dependencies><dependency id="${dependency}" version="[1.0.0]"/></dependencies>` : ''}</metadata></package>`);
  zip.file('lib/netstandard2.0/_._', '');
  packages.set(id.toLowerCase(), await zip.generateAsync({ type: 'nodebuffer' }));
}
let base;
const server = createServer((request, response) => {
  const path = new URL(request.url, base).pathname;
  const [, scope, ...parts] = path.split('/');
  const authorized = request.headers.authorization === expected;
  requests.push({ scope, path, authorized, hasAuth: !!request.headers.authorization });
  if (scope === 'private' && !authorized) { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SBOM Pilot fixture"' }); response.end(); return; }
  if (scope === 'public' && request.headers.authorization) { response.writeHead(400); response.end(); return; }
  if (scope === 'evil') { response.writeHead(401); response.end(); return; }
  const send = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
  if (parts.join('/') === 'index.json') return send({ version: '3.0.0', resources: [{ '@id': `${base}/${scope}/flat/`, '@type': 'PackageBaseAddress/3.0.0' }] });
  const [, id, version, file] = parts;
  if (parts[0] === 'flat' && packages.has(id) && ((scope === 'private') === (id === 'pilot.private'))) {
    if (version === 'index.json') return send({ versions: ['1.0.0'] });
    if (version === '1.0.0' && file?.endsWith('.nupkg')) { response.setHeader('Content-Type', 'application/octet-stream'); response.end(packages.get(id)); return; }
    if (version === '1.0.0' && file?.endsWith('.nuspec')) { response.end(''); return; }
  }
  response.writeHead(404); response.end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
base = `http://127.0.0.1:${server.address().port}`;
const credential = { source: 'Private', url: `${base}/private/index.json`, username, password };
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const classic = items => `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')"/><PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion><OutputType>Library</OutputType><OutputPath>bin\\Debug\\</OutputPath><AssemblyName>Product</AssemblyName></PropertyGroup>${items}<Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets"/></Project>`;
const settings = (privateUrl = credential.url, repository = false) => `<configuration><packageSources><clear/><add key="Public" value="${base}/public/index.json" allowInsecureConnections="true"/><add key="Private" value="${privateUrl}" allowInsecureConnections="true"/><add key="Disabled" value="${base}/evil/index.json" allowInsecureConnections="true"/></packageSources><disabledPackageSources><add key="Disabled" value="true"/></disabledPackageSources><packageSourceMapping><clear/><packageSource key="Private"><package pattern="Pilot.Private"/></packageSource><packageSource key="Public"><package pattern="Pilot.Public"/></packageSource></packageSourceMapping>${repository ? '<config><add key="repositoryPath" value="payloads"/></config>' : ''}</configuration>`;
const evidence = [];
const secretValues = [username, password, `${username}:${password}`, expected, Buffer.from(`${username}:${password}`).toString('base64')];
const assertNoSecrets = value => { for (const secret of secretValues) assert.ok(!value.includes(secret), 'Secret escaped into logs, commands, files or artifact'); };
async function checkFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await checkFiles(path);
    else assertNoSecrets((await readFile(path)).toString());
    assert.ok(!entry.name.startsWith('nuget-settings-'), 'Temporary settings helper not cleaned');
  }
}
const requested = process.argv.find(value => value.startsWith('--formats='))?.slice(10).split(',');
const formats = requested ?? (process.platform === 'win32' ? ['dotnet', 'non-sdk-package-reference', 'packages-config', 'sdk-net48'] : ['dotnet']);
try {
  for (const format of formats) {
    const product = join(root, format), projectDirectory = join(product, '交付產品');
    await rm(product, { recursive: true, force: true }); await mkdir(projectDirectory, { recursive: true });
    const project = join(projectDirectory, 'Product.csproj');
    const refs = '<ItemGroup><PackageReference Include="Pilot.Private" Version="1.0.0"/></ItemGroup>';
    const sdk = ['dotnet', 'sdk-net48'].includes(format);
    await writeFile(project, sdk ? `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${format === 'dotnet' ? 'net10.0' : 'net48'}</TargetFramework><NuGetAudit>false</NuGetAudit></PropertyGroup>${refs}</Project>` : classic(format === 'packages-config' ? '<ItemGroup><None Include="packages.config"/></ItemGroup>' : refs));
    const configFile = join(product, 'NuGet.Config');
    await writeFile(configFile, settings(credential.url, format === 'packages-config'));
    const immutable = [project, configFile];
    if (sdk) { const global = join(product, 'global.json'); await writeFile(global, '{"sdk":{"version":"10.0.101","rollForward":"disable"}}'); immutable.push(global); }
    if (format === 'packages-config') {
      const file = join(projectDirectory, 'packages.config');
      await writeFile(file, '<packages><package id="Pilot.Private" version="1.0.0" targetFramework="net48"/><package id="Pilot.Public" version="1.0.0" targetFramework="net48"/></packages>'); immutable.push(file);
    }
    const layer = join(projectDirectory, 'NuGet.Config');
    await writeFile(layer, `<configuration><packageSources><add key="LayerDisabled" value="${base}/evil/index.json" allowInsecureConnections="true"/></packageSources><disabledPackageSources><add key="LayerDisabled" value="true"/></disabledPackageSources></configuration>`);
    immutable.push(layer);
    let published = 0;
    const logs = [];
    const env = { ...tools.env, NUGET_PACKAGES: join(root, `packages-${format}`), NUGET_HTTP_CACHE_PATH: join(root, `http-${format}`), NUGET_ENHANCED_MAX_NETWORK_TRY_COUNT: '1', NUGET_ENHANCED_NETWORK_RETRY_DELAY_MILLISECONDS: '1' };
    if (format !== 'packages-config') {
      const props = join(projectDirectory, 'Directory.Build.props');
      await writeFile(props, '<Project><PropertyGroup><RestorePackagesWithLockFile>true</RestorePackagesWithLockFile><NuGetAudit>false</NuGetAudit></PropertyGroup></Project>');
      const authorEnv = { ...env, NuGetPackageSourceCredentials_Private: `Username=${username};Password=${password};ValidAuthenticationTypes=Basic` };
      if (sdk) await runProcess({ executable: 'dotnet', args: ['restore', project, '--nologo', '--verbosity', 'quiet'], cwd: projectDirectory, env: authorEnv });
      else {
        const msbuild = await findMSBuild(product, runProcess, env);
        await runProcess({ executable: msbuild.executable, args: [project, '-target:Restore', '-nologo', '-verbosity:quiet'], cwd: projectDirectory, env: authorEnv });
      }
      delete authorEnv.NuGetPackageSourceCredentials_Private;
      immutable.push(props, join(projectDirectory, 'packages.lock.json'));
    }
    const before = await Promise.all(immutable.map(async file => [file, await hash(file)]));
    for (const path of [env.NUGET_PACKAGES, env.NUGET_HTTP_CACHE_PATH, join(projectDirectory, 'obj')]) await rm(path, { recursive: true, force: true });
    const config = { environment: format === 'dotnet' ? 'dotnet' : 'netframework', projectPath: product, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, runOsv: false, uploadToDt: false, nugetCredentials: [credential] };
    let restoreCalls = 0;
    const run = async command => {
      assertNoSecrets(JSON.stringify(command.args));
      const auth = command.env?.NuGetPackageSourceCredentials_Private;
      const restoring = command.args[0] === 'restore' || command.args.includes('-target:Restore');
      if (auth) { assert.ok(restoring, 'Credential entered a non-restore child'); restoreCalls++; }
      return runProcess(command);
    };
    const services = { log: message => { logs.push(message); console.log(message); }, run, publishTabReport: async () => {}, prepare: async () => ({ ...tools, env: { ...env } }), publish: async artifact => { await readFile(artifact.path); published++; } };
    const start = requests.length;
    const artifact = await runWorkflow(config, join(root, `run-${format}`), services);
    const bytes = await readFile(artifact.path), bom = JSON.parse(bytes);
    const direct = bom.components?.find(component => component.name === 'Pilot.Private');
    const transitive = bom.components?.find(component => component.name === 'Pilot.Public');
    assert.ok(direct && transitive, `${format}: private/public components absent`);
    assert.ok(bom.dependencies?.find(edge => edge.ref === direct['bom-ref'])?.dependsOn?.includes(transitive['bom-ref']), `${format}: private-to-public edge absent`);
    assert.equal(bom.specVersion, '1.6'); assert.equal(published, 1); assert.ok(restoreCalls);
    const observed = requests.slice(start);
    assert.ok(observed.some(item => item.scope === 'private' && item.authorized && item.path.endsWith('.nupkg')));
    assert.ok(observed.some(item => item.scope === 'public' && !item.hasAuth && item.path.endsWith('.nupkg')));
    assert.ok(!observed.some(item => item.scope === 'evil' || item.scope === 'public' && item.hasAuth));
    for (const missing of [false, true]) {
      for (const path of [env.NUGET_PACKAGES, env.NUGET_HTTP_CACHE_PATH, join(product, 'payloads'), join(projectDirectory, 'obj')]) await rm(path, { recursive: true, force: true });
      const first = requests.length;
      await assert.rejects(runWorkflow({ ...config, nugetCredentials: missing ? undefined : [{ ...credential, password: 'synthetic-incorrect-password' }] }, join(root, `run-${format}-${missing ? 'missing' : 'bad'}`), services), /依賴安裝/);
      assert.equal(published, 1); assert.ok(requests.slice(first).some(item => item.scope === 'private' && !item.authorized));
      assert.ok(!requests.slice(first).some(item => item.authorized));
    }
    for (const [file, digest] of before) assert.equal(await hash(file), digest);
    assertNoSecrets(logs.join('\n')); assertNoSecrets(bytes.toString());
    await checkFiles(product);
    for (const suffix of ['', '-bad', '-missing']) await checkFiles(join(root, `run-${format}${suffix}`));
    evidence.push({ format, platform: process.platform, sdk: sdk ? '10.0.101' : undefined, node: tools.nodeVersion, cdxgen: tools.cdxgenVersion, components: artifact.componentCount, schema: '1.6', privatePublicEdge: true, publicAnonymous: true, badAndMissingAuthFailed: true, inputsUnchanged: true, existingLockUnchanged: format !== 'packages-config', layeredSettings: true, childOnlyCredentials: true, noSecretsOrHelpers: true, localArtifact: true, sha256: createHash('sha256').update(bytes).digest('hex') });
    await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`NUGET AUTH PASS ${format}: schema, edge, artifact, bad/missing credentials, source isolation and cleanup.`);
  }
  // A single restore closure with a hostile same-name source must fail before any HTTP credential use.
  const conflict = join(root, 'closure-conflict'); await mkdir(join(conflict, 'app'), { recursive: true }); await mkdir(join(conflict, 'library'), { recursive: true });
  await writeFile(join(conflict, 'global.json'), '{"sdk":{"version":"10.0.101","rollForward":"disable"}}');
  await writeFile(join(conflict, 'NuGet.Config'), settings());
  await writeFile(join(conflict, 'library', 'NuGet.Config'), settings(`${base}/evil/index.json`));
  const project = join(conflict, 'app', 'App.csproj');
  await writeFile(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><ProjectReference Include="../library/Library.csproj"/></ItemGroup></Project>');
  await writeFile(join(conflict, 'library', 'Library.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Pilot.Private" Version="1.0.0"/></ItemGroup></Project>');
  const temp = join(root, 'run-closure-conflict'); await mkdir(temp, { recursive: true });
  const sdk = await prepareDotnetSdk(join(conflict, 'app'), runProcess, { cacheDirectory: process.env.AGENT_TOOLSDIRECTORY, tempDirectory: temp, env: tools.env });
  const first = requests.length;
  await assert.rejects(restoreDotnetProject(project, sdk, runProcess, temp, [credential]), /同名來源/);
  assert.ok(!requests.slice(first).some(item => item.hasAuth)); await checkFiles(temp);
  console.log('NUGET AUTH PASS ProjectReference same-name/different-URL rejection before credential use.');
} finally { await new Promise(done => server.close(done)); }
console.log('Local artifact adapters only; live Azure installation/artifact upload and company feed/proxy acceptance remain external.');
