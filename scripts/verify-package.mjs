import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const nodes = process.argv.slice(2).filter((_, index) => process.argv[index + 1] === '--node');
if (!nodes.length) nodes.push(process.execPath);
const root = await mkdtemp(join(tmpdir(), 'sbom-shipped-'));
try {
  const standalone = join(root, 'standalone');
  await cp('dist', standalone, { recursive: true });
  const version = JSON.parse(await readFile('vss-extension.json', 'utf8')).version;
  const file = `local-dev-placeholder.sbom-pilot-${version}.vsix`;
  const archive = await JSZip.loadAsync(await readFile(join('packages', file)));
  // Check local Markdown links in shipped user/developer docs against the VSIX,
  // including nested example/config files. Marketplace must not depend on an
  // unpublished repository URL to make these relative links work.
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !/^(?:README(?:-Dev)?\.md|CHANGELOG\.md|THIRD-PARTY-NOTICES\.md|docs\/[^/]+\.md)$/.test(name)) continue;
    const contents = await entry.async('string');
    for (const match of contents.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z\d+.-]*:|^\/\//i.test(target)) continue;
      const path = resolve('/', dirname(name), decodeURIComponent(target)).replaceAll('\\', '/').replace(/^[A-Za-z]:/, '').replace(/^\//, '');
      assert.ok(archive.files[path], `Broken packaged link ${name} -> ${target}`);
    }
  }
  const unpacked = join(root, 'vsix');
  for (const [name, entry] of Object.entries(archive.files)) {
    const target = resolve(unpacked, name);
    assert.ok(target.startsWith(`${unpacked}${sep}`), 'Unsafe archive path');
    if (entry.dir) await mkdir(target, { recursive: true });
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, await entry.async('nodebuffer')); }
  }
  const taskEntry = Object.keys(archive.files).find(name => name.endsWith('dist/index.js'));
  assert.ok(taskEntry, 'VSIX task entry missing');
  const entries = [join(standalone, 'index.js'), join(unpacked, taskEntry)];
  assert.deepEqual(await readFile(entries[0]), await readFile(entries[1]), 'VSIX handler differs from current dist; rebuild the package');
  for (const entry of entries) {
    const manifest = JSON.parse(await readFile(join(dirname(entry), 'task.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.execution).sort(), ['Node20_1', 'Node24']);
    const frontend = manifest.inputs.find(input => input.name === 'environment');
    assert.equal(frontend.defaultValue, 'javascript');
    assert.match(frontend.options.javascript, /JavaScript.*TypeScript.*Angular.*Vue/);
    assert.deepEqual(Object.keys(frontend.options), ['javascript', 'dotnet', 'netframework', 'combined']);
    assert.deepEqual(manifest.visibility, ['Build']); assert.equal(manifest.minimumAgentVersion, '3.238.0');
    const licenses = JSON.parse(await readFile(join(dirname(entry), 'licenses/manifest.json'), 'utf8'));
    for (const name of ['yaml', 'jsonc-parser', 'ajv', 'ajv-formats-draft2019', 'smtp-address-parser', 'https-proxy-agent', 'agent-base']) assert.ok(licenses.some(item => item.name === name), `Attribution missing: ${name}`);
    for (const item of licenses) await readFile(join(dirname(entry), item.licenseFile));
    assert.ok(!licenses.some(item => item.upstreamNoticeMissing || ['nodejs-file-downloader', 'azure-pipelines-tool-lib'].includes(item.name)));
    for (const binary of nodes) {
      // Probe the SDK's genuine dynamic resource loader, minimatch and Q-backed
      // process runner from the shipped closure, outside host node_modules.
      const sdk = join(dirname(entry), 'node_modules/azure-pipelines-task-lib');
      const probe = spawnSync(binary, ['-e', `
        const assert=require('node:assert/strict'),path=require('node:path');
        const root=process.argv[1],tl=require(path.join(root,'task.js'));
        tl.setResourcePath(path.join(root,'lib.json'));
        assert.match(tl.loc('LIB_InputRequired','fixture'),/fixture/);
        assert.equal(tl.getInput('probe'),'value');assert.equal(tl.getVariable('Build.BuildId'),'12');
        assert.ok(tl.findMatch(root,['**/task.js']).some(file=>file.endsWith('task.js')));
        tl.exec(process.execPath,['-e','process.stdout.write("sdk-exec-ok")'],{silent:true}).then(code=>{assert.equal(code,0)},()=>process.exitCode=1);
      `, sdk], { cwd: root, encoding: 'utf8', env: { ...process.env, INPUT_PROBE: 'value', BUILD_BUILDID: '12' } });
      assert.equal(probe.error, undefined); assert.equal(probe.status, 0, `SDK runtime resource/process probe failed: ${probe.stderr}`);
      const key = 'synthetic-shipped-package-key';
      const npmToken = 'synthetic-shipped-npm-token', npmPassword = 'synthetic-shipped-npm-password';
      const nugetPassword = 'synthetic-shipped-nuget-password', nugetUser = 'nuget-fixture-user';
      const nugetCredentials = JSON.stringify([{ source: 'Private', url: 'https://nuget.example.test/v3/index.json', username: nugetUser, password: nugetPassword }]);
      assert.ok(manifest.inputs.some(input => input.name === 'nugetCredentials' && input.required === false));
      const npmCredentials = JSON.stringify([{ registry: 'https://private.example.test/', token: npmToken }, { registry: 'https://basic.example.test/', username: 'fixture-user', password: npmPassword }]);
      const result = spawnSync(binary, [entry], { cwd: root, encoding: 'utf8', env: {
        ...process.env, SYSTEM_DEBUG: 'true', BUILD_BUILDID: '1', RELEASE_RELEASEID: '', AGENT_TEMPDIRECTORY: root,
        INPUT_ENVIRONMENT: 'unsupported', INPUT_PROJECTPATH: root, INPUT_UPLOADTODT: 'true', INPUT_DTAPIKEY: key, INPUT_NPMCREDENTIALS: npmCredentials, INPUT_NUGETCREDENTIALS: nugetCredentials,
        INPUT_DTPROJECTUUID: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4',
      } });
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      assert.equal(result.error, undefined); assert.equal(result.status, 0);
      assert.match(output, /參數驗證/); assert.doesNotMatch(output, /Cannot find module|SyntaxError|Unhandled/);
      const secrets = output.split(/\r?\n/).filter(line => line.includes(key));
      assert.equal(secrets.length, 1); assert.match(secrets[0], /^##vso\[task.setsecret\]/);
      const lines = output.split(/\r?\n/), firstDebug = lines.findIndex(line => line.includes('task.debug'));
      for (const secret of [nugetPassword, nugetUser, `${nugetUser}:${nugetPassword}`, Buffer.from(nugetPassword).toString('base64'), Buffer.from(`${nugetUser}:${nugetPassword}`).toString('base64'), npmToken, npmPassword, `fixture-user:${npmPassword}`, Buffer.from(npmPassword).toString('base64'), Buffer.from(`fixture-user:${npmPassword}`).toString('base64')]) {
        const matches = lines.map((line, index) => ({ line, index })).filter(item => item.line.includes(secret));
        assert.ok(matches.length && matches.every(item => item.index < firstDebug && item.line.startsWith('##vso[task.setsecret]')), 'Shipped credentials must be registered before SDK debug only');
      }
      assert.doesNotMatch(output, /npmCredentials=|nugetCredentials=/);
      const version = spawnSync(binary, ['--version'], { encoding: 'utf8' }).stdout.trim();
      console.log(`SHIPPED PASS ${entry.includes(`${sep}vsix${sep}`) ? 'VSIX' : 'dist'} ${process.platform}/${process.arch} ${version}; startup, secret mask, manifest and licenses`);
    }
  }
} finally { await rm(root, { recursive: true, force: true }); }
