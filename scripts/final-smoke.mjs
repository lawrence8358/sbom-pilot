// Final acceptance runs the unchanged handler extracted from the actual VSIX.
// Loopback feeds and logging-command consumption are local probes, not Azure.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import JSZip from 'jszip';

const repository = process.cwd(), root = await mkdtemp(join(tmpdir(), 'sbom-final-'));
const evidenceDirectory = resolve(process.env.SBOM_FINAL_EVIDENCE || '.smoke/final-delivery');
await mkdir(evidenceDirectory, { recursive: true });
const cache = process.env.AGENT_TOOLSDIRECTORY || join(evidenceDirectory, 'cache');
await mkdir(cache, { recursive: true });
const evidence = { platform: `${process.platform}/${process.arch}`, handler: process.version, cache, root, cases: [], liveAzure: 'UNVERIFIED' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const npmCli = process.env.npm_execpath || (process.platform === 'win32' ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : '/usr/local/lib/node_modules/npm/bin/npm-cli.js');
const password = randomBytes(24).toString('hex'), username = 'final-fixture';
const token = randomBytes(24).toString('hex'), dtKey = randomBytes(24).toString('hex');
const basic = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const secrets = [password, token, dtKey, `${username}:${password}`, basic, Buffer.from(`${username}:${password}`).toString('base64')];
function safe(value) { for (const secret of secrets) assert.ok(!value.includes(secret), 'Secret in output, arguments, or product'); }
async function run(executable, args, cwd, env = {}, timeoutMs = 20 * 60_000) {
  safe(JSON.stringify(args));
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: false });
    let stdout = '', stderr = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-8 * 1024 * 1024); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8 * 1024 * 1024); });
    const timer = setTimeout(() => { child.kill(); fail(new Error('Final smoke child timeout')); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); fail(error); });
    child.on('exit', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
  });
}
async function checked(...args) {
  const result = await run(...args);
  if (result.code !== 0) throw new Error(`Fixture preparation failed (${result.code}); raw output suppressed`);
  return result;
}
const requests = [], dtBodies = [], npmPackages = new Map(), nugetPackages = new Map();
let base;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, base).pathname;
  if (path.endsWith('/api/v1/bom')) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    assert.equal(request.headers['x-api-key'], dtKey);
    const body = JSON.parse(Buffer.concat(chunks)); assert.equal(body.autoCreate, false);
    dtBodies.push({ path, bytes: Buffer.from(body.bom, 'base64') });
    if (path.startsWith('/fail/')) { response.writeHead(403); response.end(JSON.stringify({ error: dtKey })); }
    else { response.writeHead(202, { 'Content-Type': 'application/json' }); response.end('{"token":"d40ce445-3566-49d5-bd8d-2601d73cf0d4"}'); }
    return;
  }
  const privateRoute = path.startsWith('/private/'), authorized = request.headers.authorization === (path.includes('/npm/') ? `Bearer ${token}` : basic);
  requests.push({ path, authorized, hasAuth: !!request.headers.authorization });
  if (privateRoute && !authorized) { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="final-fixture"' }); response.end(); return; }
  if (path.startsWith('/public/') && request.headers.authorization) { response.writeHead(400); response.end(); return; }
  const send = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
  if (path.includes('/npm/')) {
    const suffix = decodeURIComponent(path.split('/npm/')[1]);
    for (const [name, pkg] of npmPackages) {
      if (suffix === name) return send({ name, 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { name, version: '1.0.0', dependencies: pkg.dependencies, dist: { tarball: `${base}/${pkg.private ? 'private' : 'public'}/npm/${name}/package.tgz`, integrity: pkg.integrity } } } });
      if (suffix === `${name}/package.tgz`) { response.end(pkg.bytes); return; }
    }
  }
  if (path.endsWith('/nuget/index.json')) return send({ version: '3.0.0', resources: [{ '@id': `${base}/${privateRoute ? 'private' : 'public'}/nuget/flat/`, '@type': 'PackageBaseAddress/3.0.0' }] });
  const match = path.match(/\/nuget\/flat\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (match && nugetPackages.has(match[1]) && privateRoute === (match[1] === 'pilot.private')) {
    if (match[2] === 'index.json') return send({ versions: ['1.0.0'] });
    if (match[3]?.endsWith('.nupkg')) { response.end(nugetPackages.get(match[1])); return; }
  }
  response.writeHead(404); response.end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done)); base = `http://127.0.0.1:${server.address().port}`;
try {
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  const file = process.argv.find(arg => arg.startsWith('--vsix='))?.slice(7) ?? `packages/local-dev-placeholder.sbom-pilot-${version}.vsix`;
  const vsixBytes = await readFile(file); evidence.vsixSha256 = digest(vsixBytes);
  const zip = await JSZip.loadAsync(vsixBytes), unpacked = join(root, 'vsix');
  for (const [name, entry] of Object.entries(zip.files)) {
    const target = resolve(unpacked, name); assert.ok(target.startsWith(`${unpacked}${sep}`));
    if (entry.dir) await mkdir(target, { recursive: true });
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, await entry.async('nodebuffer')); }
  }
  const entry = join(unpacked, Object.keys(zip.files).find(name => name.endsWith('dist/index.js')));
  assert.deepEqual(await readFile(entry), await readFile('dist/index.js'));
  const { validateSbom } = await import('../.test-build/src/validation.js');
  for (const [name, privatePackage, dependencies] of [['pilot-public', false, {}], ['@pilot/private', true, { 'pilot-public': '1.0.0' }]]) {
    const source = join(root, `tar-${privatePackage}`), packageDirectory = join(source, 'package');
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', license: 'MIT', dependencies }));
    await writeFile(join(packageDirectory, 'index.js'), privatePackage ? "module.exports=require('pilot-public');" : 'module.exports=42;');
    const archive = join(source, 'package.tgz'); await checked('tar', ['-czf', archive, '-C', source, 'package'], root);
    const bytes = await readFile(archive);
    npmPackages.set(name, { private: privatePackage, dependencies, bytes, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` });
  }
  for (const [name, dependency] of [['Pilot.Private', 'Pilot.Public'], ['Pilot.Public', undefined]]) {
    const pkg = new JSZip();
    pkg.file(`${name}.nuspec`, `<?xml version="1.0"?><package><metadata><id>${name}</id><version>1.0.0</version><authors>SBOM Pilot fixture</authors><description>Final packaged acceptance</description>${dependency ? `<dependencies><dependency id="${dependency}" version="[1.0.0]"/></dependencies>` : ''}</metadata></package>`);
    pkg.file('lib/netstandard2.0/_._', ''); nugetPackages.set(name.toLowerCase(), await pkg.generateAsync({ type: 'nodebuffer' }));
  }
  const npmCredential = JSON.stringify([{ registry: `${base}/private/npm/`, token }]);
  const nugetCredential = JSON.stringify([{ source: 'Private', url: `${base}/private/nuget/index.json`, username, password }]);
  async function javascript(product, isPrivate) {
    await mkdir(product, { recursive: true });
    await writeFile(join(product, 'package.json'), JSON.stringify({ name: 'final-product', version: '1.0.0', private: true, dependencies: { [isPrivate ? '@pilot/private' : 'pilot-public']: '1.0.0' } }));
    await writeFile(join(product, 'main.js'), `require('${isPrivate ? '@pilot/private' : 'pilot-public'}');`);
    const config = `registry=${base}/public/npm/\n@pilot:registry=${base}/private/npm/\n`;
    await writeFile(join(product, '.npmrc'), config);
    const auth = join(root, 'author.npmrc');
    await writeFile(auth, `//127.0.0.1:${server.address().port}/private/npm/:_authToken=${token}\n`);
    try { await checked(process.execPath, [npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], product, { NPM_CONFIG_USERCONFIG: auth }); }
    finally { await rm(auth, { force: true }); }
  }
  // Framework-neutral fixture: real Angular packages from the primary npm registry.
  // Exact version facts: https://registry.npmjs.org/@angular%2fcore/20.3.0
  async function angular(product, manager) {
    await mkdir(product, { recursive: true });
    const version = manager === 'yarn' ? '4.18.1' : manager === 'pnpm' ? '12.16.1' : '11.19.1';
    await writeFile(join(product, 'package.json'), JSON.stringify({ name: 'angular-delivery-fixture', version: '1.0.0', private: true, packageManager: `${manager}@${version}`, dependencies: { '@angular/core': '20.3.0', rxjs: '7.8.2', tslib: '2.8.1' } }));
    await writeFile(join(product, 'main.ts'), "import { Component } from '@angular/core'; import { of } from 'rxjs'; of(Component);\n");
    let executable = process.execPath, prefix = [npmCli];
    if (manager !== 'npm') {
      const directory = join(root, `author-${manager}`); await mkdir(directory);
      const pkg = manager === 'yarn' ? '@yarnpkg/cli-dist' : 'pnpm';
      await checked(process.execPath, [npmCli, 'install', '--prefix', directory, '--no-audit', '--no-fund', ...(manager === 'yarn' ? ['--ignore-scripts'] : []), `${pkg}@${version}`], root);
      const packageRoot = join(directory, 'node_modules', pkg);
      const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
      let cli = join(packageRoot, typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[manager]);
      if (/\.(?:c?js|mjs)$/.test(cli)) prefix = [cli];
      else { executable = cli; prefix = []; }
    }
    if (manager === 'yarn') await writeFile(join(product, '.yarnrc.yml'), 'nodeLinker: pnp\n');
    await checked(executable, [...prefix, 'install', ...(manager === 'npm' ? ['--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'] : [])], product);
  }
  async function dotnet(product, format = 'dotnet') {
    const directory = join(product, '交付產品'); await mkdir(directory, { recursive: true });
    const refs = '<ItemGroup><PackageReference Include="Pilot.Private" Version="1.0.0"/></ItemGroup>';
    const sdk = ['dotnet', 'sdk-net48'].includes(format);
    const classic = items => `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')"/><PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion><OutputType>Library</OutputType><OutputPath>bin\\Debug\\</OutputPath><AssemblyName>Product</AssemblyName></PropertyGroup>${items}<Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets"/></Project>`;
    await writeFile(join(directory, 'Product.csproj'), sdk ? `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${format === 'dotnet' ? 'net10.0' : 'net48'}</TargetFramework><NuGetAudit>false</NuGetAudit></PropertyGroup>${refs}</Project>` : classic(format === 'packages-config' ? '<ItemGroup><None Include="packages.config"/></ItemGroup>' : refs));
    if (format === 'packages-config') await writeFile(join(directory, 'packages.config'), '<packages><package id="Pilot.Private" version="1.0.0" targetFramework="net48"/><package id="Pilot.Public" version="1.0.0" targetFramework="net48"/></packages>');
    if (sdk) await writeFile(join(product, 'global.json'), '{"sdk":{"version":"10.0.101","rollForward":"disable"}}');
    await writeFile(join(product, 'NuGet.Config'), `<configuration><packageSources><clear/><add key="Private" value="${base}/private/nuget/index.json" allowInsecureConnections="true"/><add key="Public" value="${base}/public/nuget/index.json" allowInsecureConnections="true"/></packageSources><packageSourceMapping><clear/><packageSource key="Private"><package pattern="Pilot.Private"/></packageSource><packageSource key="Public"><package pattern="Pilot.Public"/></packageSource></packageSourceMapping>${format === 'packages-config' ? '<config><add key="repositoryPath" value="payloads"/></config>' : ''}</configuration>`);
  }
  const probe = join(root, 'artifact-failure.cjs');
  await writeFile(probe, `const Module=require('module');const original=Module._load;Module._load=function(id,...args){const value=original.call(this,id,...args);if(id==='azure-pipelines-task-lib/task')value.uploadArtifact=()=>{throw new Error('Local artifact adapter injection');};return value;};`);
  async function sourceDigest(file) {
    const bytes = await readFile(file);
    // Yarn's normal install formats workspace manifests. Assert their values,
    // while lockfiles and source configuration must stay byte-identical.
    return digest(basename(file) === 'package.json' ? JSON.stringify(JSON.parse(bytes)) : bytes);
  }
  async function hashes(directory, values = []) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', 'obj', 'bin', '.yarn', 'payloads'].includes(item.name)) continue;
      const file = join(directory, item.name);
      if (item.isDirectory()) await hashes(file, values);
      else if (/(?:\.json|\.ya?ml|\.lock|\.npmrc|\.Config|\.csproj|packages\.config)$/.test(item.name)) values.push([file, await sourceDigest(file)]);
    }
    return values;
  }
  async function scenario(name, environment, product, { dt = false, npmAuth = false, nugetAuth = false, failArtifact = false, osv = false, handler = process.execPath, expected = [] } = {}) {
    const temp = join(root, `temp-${name}`); await mkdir(temp);
    const before = await hashes(product), dtStart = dtBodies.length, requestStart = requests.length;
    const result = await run(handler, [...(failArtifact ? ['--require', probe] : []), entry], root, {
      BUILD_BUILDID: '12', RELEASE_RELEASEID: '', SYSTEM_DEBUG: 'true', AGENT_TEMPDIRECTORY: temp, AGENT_TOOLSDIRECTORY: cache,
      INPUT_RUNOSV: osv ? undefined : 'false', INPUT_OSVVERSION: 'latest', INPUT_ENVIRONMENT: environment, INPUT_PROJECTPATH: product, INPUT_NODEVERSION: '24.x', INPUT_CDXGENVERSION: '13.6.0', INPUT_SPECVERSION: '1.6',
      INPUT_UPLOADTODT: dt ? 'true' : 'false', INPUT_DTAPIURL: `${base}/${dt || 'accepted'}`, INPUT_DTPROJECTUUID: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', INPUT_DTAPIKEY: dtKey,
      INPUT_NPMCREDENTIALS: npmAuth ? npmCredential : '', INPUT_NUGETCREDENTIALS: nugetAuth ? nugetCredential : '', INPUT_FETCHLICENSE: 'false', INPUT_NOCACHE: 'true',
      NUGET_PACKAGES: join(root, `nuget-${name}`), NUGET_HTTP_CACHE_PATH: join(root, `nuget-http-${name}`),
    });
    const output = `${result.stdout}${result.stderr}`, redacted = output.split(/\r?\n/).filter(line => !line.startsWith('##vso[task.setsecret]')).join('\n'); safe(redacted);
    await writeFile(join(evidenceDirectory, `${name}.log`), redacted);
    const sections = redacted.split(/\r?\n/).filter(line => line.startsWith('##[section]'));
    assert.deepEqual(sections, [
      '##[section]開始驗證工作設定',
      '##[section]開始準備 Node.js 執行環境',
      '##[section]開始安裝 SBOM 掃描工具（cdxgen）',
      '##[section]開始安裝／還原專案依賴',
      '##[section]開始產生 SBOM（cdxgen）',
      '##[section]開始驗證 SBOM（CycloneDX）',
      ...(osv ? ['##[section]開始準備 OSV Scanner（版本與工具快取）', '##[section]開始 OSV 弱點掃描'] : []),
      ...(dt ? ['##[section]開始上傳 SBOM 至 Dependency-Track（DT）'] : []),
      '##[section]開始發佈 SBOM 成品（Azure Pipelines）',
      ...(osv ? ['##[section]開始發佈 OSV 弱點報告（Azure Pipelines）'] : []),
      ...(osv ? ['##[section]開始發佈 OSV 報告至 CI 摘要'] : []),
    ]);
    const commands = redacted.split(/\r?\n/).filter(line => line.startsWith('[command] ')).map(line => JSON.parse(line.slice(10)));
    assert.ok(commands.length >= 6, 'Actual Task command diagnostics missing');
    const scans = commands.filter(command => command.argv.includes('--required-only'));
    assert.equal(scans.length, 1, 'Exactly one real scanner command must be visible');
    const scan = scans[0];
    assert.equal(scan.cwd, product); assert.ok(scan.executable); assert.equal(scan.argv[1], product);
    assert.equal(scan.argv[scan.argv.indexOf('--spec-version') + 1], '1.6');
    assert.equal(scan.argv[scan.argv.indexOf('--install-deps') + 1], 'false');
    assert.deepEqual(scan.scan, { FETCH_LICENSE: 'false', CDXGEN_NO_CACHE: 'true' });
    assert.ok(scan.argv.includes('**/_Design{,Front}/**')); assert.ok(!scan.argv.includes('--api-key'));
    if (dt) {
      const http = redacted.split(/\r?\n/).filter(line => line.startsWith('[http] ')).map(line => JSON.parse(line.slice(7)));
      assert.deepEqual(http, [{ method: 'PUT', url: `${base}/${dt}/api/v1/bom`, headers: { 'X-Api-Key': '***' } }]);
    }
    assert.equal(result.code, 0);
    const failed = dt === 'fail' || failArtifact;
    assert.match(output, failed ? /task.complete result=Failed/ : /task.complete result=Succeeded/, `Handler outcome wrong: ${name}; see redacted evidence log`);
    const artifacts = [...output.matchAll(/##vso\[artifact.upload[^\]]*\]([^\r\n]+)/g)];
    assert.equal(artifacts.length, failArtifact ? 0 : osv ? 2 : 1);
    const runs = (await readdir(temp)).filter(file => file.startsWith('sbom-pilot-')); assert.equal(runs.length, 1);
    const bomFile = join(temp, runs[0], 'sbom', 'sbom.cdx.json'), bytes = await readFile(bomFile), bom = JSON.parse(bytes); safe(bytes.toString());
    await validateSbom(bomFile, '1.6');
    await writeFile(join(evidenceDirectory, `${name}.bom.json`), bytes);
    for (const dependency of expected) assert.ok(bom.components?.some(item => item.name === dependency), `Missing ${dependency}`);
    if (name.startsWith('angular-')) {
      assert.ok(!bom.components.some(item => item.name === 'vue'));
      const angularCore = bom.components.find(item => item.name === 'core' && item.group === '@angular');
      const tslib = bom.components.filter(item => item.name === 'tslib');
      assert.ok(angularCore && tslib.length, 'Angular and its real runtime dependency must be present');
      assert.ok(bom.dependencies.some(item => item.ref === angularCore['bom-ref'] && tslib.some(target => item.dependsOn.includes(target['bom-ref']))), 'Angular → tslib dependency edge missing');
    }
    if (name === 'pnpm') assert.ok(!bom.components?.some(item => item.name === 'chalk'), 'Fixed cdxgen required scope must exclude this pnpm fixture dev-only chalk');
    assert.ok(bom.dependencies?.some(item => item.dependsOn?.length), 'Real dependency edges missing');
    if (dt) { assert.equal(dtBodies.length, dtStart + 1); assert.deepEqual(dtBodies.at(-1).bytes, bytes); }
    else assert.equal(dtBodies.length, dtStart);
    if (!failArtifact) {
      const data = artifacts[0][1].replaceAll('%0D', '\r').replaceAll('%0A', '\n').replaceAll('%AZP25', '%');
      assert.deepEqual(await readFile(data), bytes, 'Queued artifact must remain readable after handler exits');
      if (osv) {
        assert.ok(artifacts.every(match => match[0].includes('artifactname=SBOM;')));
        const reportPath = artifacts[1][1].replaceAll('%0D', '\r').replaceAll('%0A', '\n').replaceAll('%AZP25', '%');
        assert.equal(basename(reportPath), 'sbom.osv.md');
        const report = await readFile(reportPath, 'utf8'); safe(report); assert.ok(report.trim().length);
        assert.match(report, /風險等級.*CVE/);
        const summaries = [...output.matchAll(/##vso\[task\.uploadsummary\]([^\r\n]+)/g)];
        assert.equal(summaries.length, 1);
        assert.equal(summaries[0][1], artifacts[1][1], 'summary and artifact must use the same retained report');
        await writeFile(join(evidenceDirectory, `${name}.osv.md`), report);
      }
    }
    for (const [file, value] of before) assert.equal(await sourceDigest(file), value, `Source config/lock mutated: ${file}`);
    const calls = requests.slice(requestStart);
    if (npmAuth) assert.ok(calls.some(call => call.path.includes('/private/npm/') && call.path.endsWith('package.tgz') && call.authorized));
    if (nugetAuth) assert.ok(calls.some(call => call.path.includes('/private/nuget/') && call.path.endsWith('.nupkg') && call.authorized));
    assert.ok(!calls.some(call => call.path.startsWith('/public/') && call.hasAuth), 'Private credential reached public feed');
    const item = { name, environment, dt: dt || 'off', osv, artifact: failArtifact ? 'local adapter failure injected; no upload command' : osv ? 'two uploads to same artifact, retained SBOM and Markdown report' : 'one upload command, retained identical valid file', sha256: digest(bytes), components: bom.components.length, requests: calls.length, visibleCommands: commands.length, visibleScan: scan, handler: (await checked(handler, ['--version'], root)).stdout.trim() };
    evidence.cases.push(item); await writeFile(join(evidenceDirectory, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`FINAL PASS ${name}: ${item.components} components; ${item.sha256}`);
  }
  const selected = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8).split(',') || (process.platform === 'win32' ? ['npm', 'pnpm', 'yarn', 'dotnet', 'combined', 'non-sdk-package-reference', 'packages-config', 'sdk-net48', 'artifact-failure'] : ['npm', 'combined', 'artifact-failure']);
  for (const name of selected) {
    console.log(`FINAL START ${name}; actual extracted VSIX handler; ${process.platform}`);
    const product = join(root, `交付 frontend ${name}`);
    if (name.startsWith('angular-')) {
      await angular(product, name.slice(8));
      await scenario(name, 'javascript', product, { dt: 'accepted', expected: ['core', 'rxjs', 'tslib'], handler: process.env.SBOM_FINAL_NODE20 || process.execPath });
    } else if (['pnpm', 'yarn'].includes(name)) {
      await cp(join(repository, 'examples', name === 'pnpm' ? 'pnpm-workspace' : 'yarn-modern-workspace'), product, { recursive: true });
      await scenario(name, 'vue', product, { dt: 'accepted', expected: name === 'pnpm' ? ['vue', 'lodash'] : ['is-odd', 'is-number'] });
    } else if (['dotnet', 'non-sdk-package-reference', 'packages-config', 'sdk-net48'].includes(name)) {
      await dotnet(product, name); await scenario(name, name === 'dotnet' ? 'dotnet' : 'netframework', product, { dt: name === 'dotnet' ? 'fail' : false, nugetAuth: true, expected: ['Pilot.Private', 'Pilot.Public'] });
    } else if (name === 'combined') {
      await dotnet(product); await javascript(join(product, 'frontend'), true);
      await scenario(name, 'combined', product, { dt: 'accepted', npmAuth: true, nugetAuth: true, expected: ['private', 'pilot-public', 'Pilot.Private', 'Pilot.Public'] });
    } else {
      await javascript(product, false);
      await scenario(name, 'vue', product, { osv: name === 'osv', failArtifact: name === 'artifact-failure', expected: ['pilot-public'], handler: process.env.SBOM_FINAL_NODE20 || process.execPath });
    }
  }
  const inventory = JSON.parse(await readFile(join(dirname(entry), 'licenses/manifest.json')));
  assert.ok(!inventory.some(item => item.upstreamNoticeMissing || item.name === 'nodejs-file-downloader' || item.name === 'azure-pipelines-tool-lib'));
  evidence.attributions = inventory.length;
  evidence.complete = true; await writeFile(join(evidenceDirectory, 'evidence.json'), JSON.stringify(evidence, null, 2));
} finally {
  await new Promise(done => server.close(done));
  if (process.env.SBOM_FINAL_KEEP_FIXTURES === '1') console.log(`Synthetic fixtures retained for diagnosis: ${root}`);
  else await rm(root, { recursive: true, force: true });
}
