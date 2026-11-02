import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';

async function main() {
  const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);
  await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
  const base = resolve('.smoke/npm-auth');
  process.env.AGENT_TOOLSDIRECTORY ??= resolve('.smoke/cache');
  process.env.AGENT_TEMPDIRECTORY ??= join(base, 'temp');
  await mkdir(base, { recursive: true });
  await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
  await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
  const { prepareTools } = await import('../.test-build/src/tools.js');
  const { runProcess } = await import('../.test-build/src/process.js');
  const { runWorkflow } = await import('../.test-build/src/workflow.js');
  const { withPackageManager } = await import('../.test-build/src/install/manager.js');
  const { withNpmAuthentication, checkProjectAuthentication } = await import('../.test-build/src/install/npm-auth.js');
  const { projectCredentialEnvironment } = await import('../.test-build/src/install/npm-credentials.js');
  const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
  const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: process.env.AGENT_TEMPDIRECTORY }, runProcess, console.log);
  // Synthetic credentials are generated for this process and never written to fixtures.
  const token = `fixture-bearer-${createHash('sha256').update(String(Date.now())).digest('hex')}`;
  const username = 'fixture-user', password = `fixture-password-${process.pid}`;
  const basic = Buffer.from(`${username}:${password}`).toString('base64');
  const secretValues = [token, password, `${username}:${password}`, basic, Buffer.from(password).toString('base64'), 'invalid-fixture-token', 'invalid-fixture-password', Buffer.from(`${username}:invalid-fixture-password`).toString('base64')];
  const safe = text => secretValues.every(secret => !String(text).includes(secret));
  const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const log = message => { if (!safe(message)) throw new Error('Secret found in Task log'); console.log(message); };
  const packages = new Map();
  for (const [scope, name, dependencies] of [['public', 'helper', {}], ['private', 'demo', { '@public/helper': '1.0.0' }], ['basic', 'demo', { '@public/helper': '1.0.0' }]]) {
    const directory = join(base, 'package-sources', scope);
    await mkdir(directory, { recursive: true });
    const manifest = { name: `@${scope}/${name}`, version: '1.0.0', license: 'MIT', main: 'index.js', dependencies };
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(directory, 'index.js'), scope === 'public' ? 'module.exports = 42;\n' : "module.exports = require('@public/helper');\n");
    const packed = JSON.parse((await runProcess({ executable: tools.node, args: [tools.npmCli, 'pack', '--json', '--ignore-scripts'], cwd: directory, env: tools.env })).stdout)[0];
    const bytes = await readFile(join(directory, packed.filename));
    packages.set(scope, { manifest, bytes, filename: packed.filename, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, shasum: createHash('sha1').update(bytes).digest('hex') });
  }
  let origin, phase = 'author', counts = [], publicLeaks = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname, scope = path.split('/')[1];
    const pkg = packages.get(scope);
    if (!pkg) { response.writeHead(404).end(); return; }
    const authorization = request.headers.authorization;
    const authenticated = scope === 'private' ? authorization === `Bearer ${token}` : scope === 'basic' ? authorization === `Basic ${basic}` : authorization === undefined;
    if (scope === 'public' && authorization !== undefined) publicLeaks++;
    const tarball = path.includes('/files/');
    counts.push({ phase, scope, authenticated, tarball });
    if (!authenticated) { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' }).end('Fixture credentials required'); return; }
    if (tarball) { response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(pkg.bytes); return; }
    const manifest = { ...pkg.manifest, _id: `${pkg.manifest.name}@1.0.0`, dist: { tarball: `${origin}/${scope}/files/${pkg.filename}`, integrity: pkg.integrity, shasum: pkg.shasum } };
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: pkg.manifest.name, 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': manifest }, time: { created: '2020-01-01T00:00:00.000Z', modified: '2020-01-01T00:00:00.000Z', '1.0.0': '2020-01-01T00:00:00.000Z' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const evidence = [];
  try {
    const requested = process.argv.find(arg => arg.startsWith('--scenarios='))?.split('=')[1]?.split(',');
    const scenarios = requested ?? ['npm', 'pnpm10', 'pnpm12', 'yarn-classic', 'yarn-pnp', 'yarn-node-modules', 'combined'];
    assert.ok(scenarios.every(name => ['npm', 'pnpm10', 'pnpm12', 'yarn-classic', 'yarn-pnp', 'yarn-node-modules', 'combined'].includes(name)), 'Unknown scenario');
    for (const name of scenarios) {
      const project = join(base, `product-${name}`), state = join(base, `state-${name}`), cache = join(state, 'cache');
      assert.equal(resolve(project, '..'), base); assert.equal(resolve(state, '..'), base);
      await rm(project, { recursive: true, force: true });
      await rm(state, { recursive: true, force: true });
      await mkdir(join(project, 'packages/web'), { recursive: true }); await mkdir(state, { recursive: true });
      const manager = name.startsWith('pnpm') ? 'pnpm' : name.startsWith('yarn') ? 'yarn' : 'npm';
      const version = name === 'pnpm10' ? '10.34.2' : name === 'pnpm12' ? '12.16.1' : name === 'yarn-classic' ? '1.22.22' : manager === 'yarn' ? '4.18.1' : '11.19.1';
      const modern = manager === 'yarn' && version !== '1.22.22';
      const lockPath = join(project, manager === 'npm' ? 'package-lock.json' : manager === 'pnpm' ? 'pnpm-lock.yaml' : 'yarn.lock');
      const credential = [
        { registry: `${origin}/private/`, token, environment: { NPM_TOKEN: 'token' } },
        { registry: `${origin}/basic/`, username, password, environment: { FEED_USER: 'username', FEED_PASSWORD_B64: 'passwordBase64', FEED_AUTH_B64: 'basicBase64', FEED_IDENT: 'basic' } },
      ];
      await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'private-fixture-product', version: '1.0.0', private: true, packageManager: `${manager}@${version}`, workspaces: ['packages/*'] }));
      await writeFile(join(project, 'packages/web/package.json'), JSON.stringify({ name: '@fixture/web', version: '1.0.0', dependencies: { '@private/demo': '1.0.0', '@basic/demo': '1.0.0', '@public/helper': '1.0.0' } }));
      await writeFile(join(project, 'packages/web/index.js'), "const a = require('@private/demo'); const b = require('@basic/demo'); console.log(a + b);\n");
      const scopedKey = scope => `//127.0.0.1:${server.address().port}/${scope}/`;
      const npmrc = `@private:registry=${origin}/private/\n@basic:registry=${origin}/basic/\n${scopedKey('private')}:_authToken=\${NPM_TOKEN}\n${scopedKey('basic')}:username=\${FEED_USER}\n${scopedKey('basic')}:_password=\${FEED_PASSWORD_B64}\nfetch-retries=0\n`;
      if (modern) {
        await writeFile(join(project, '.yarnrc.yml'), stringify({ nodeLinker: name === 'yarn-pnp' ? 'pnp' : 'node-modules', enableGlobalCache: false, cacheFolder: join(cache, 'yarn'), unsafeHttpWhitelist: ['127.0.0.1'], npmScopes: { private: { npmRegistryServer: `${origin}/private/`, npmAuthToken: '${NPM_TOKEN}', npmAlwaysAuth: false }, basic: { npmRegistryServer: `${origin}/basic/`, npmAuthIdent: '${FEED_IDENT}', npmAlwaysAuth: false }, public: { npmRegistryServer: `${origin}/public/` } } }));
      } else await writeFile(join(project, '.npmrc'), npmrc);
      if (manager === 'pnpm') await writeFile(join(project, 'pnpm-workspace.yaml'), stringify({ packages: ['packages/*'], storeDir: join(cache, 'pnpm'), minimumReleaseAge: 0 }));
      const originalUserconfig = join(state, 'user.npmrc'), originalAuth = join(state, 'auth.ini');
      await writeFile(originalUserconfig, `@public:registry=${origin}/public/\nfetch-retries=0\n`);
      await writeFile(originalAuth, '# Separate trusted auth file, no registry routing\n');
      const scopedTools = { ...tools, env: { ...tools.env, NPM_CONFIG_USERCONFIG: originalUserconfig, ...(name === 'pnpm12' ? { PNPM_CONFIG_NPMRC_AUTH_FILE: originalAuth } : {}), NPM_CONFIG_CACHE: join(cache, 'npm'), YARN_CACHE_FOLDER: join(cache, 'classic') } };
      // Modern Yarn rejects Classic-only env options, so keep its cache path in RC.
      if (modern) delete scopedTools.env.YARN_CACHE_FOLDER;
      const selected = { root: project, manager, version, reason: 'declaration', lockPath, ...(manager === 'yarn' ? { yarn: { generation: modern ? 'modern' : 'classic' } } : {}) };
      const authorOptions = { tempDirectory: join(state, 'author-tools'), npmCredentials: credential, log };
      const mapped = projectCredentialEnvironment(scopedTools.env, credential);
      await checkProjectAuthentication(selected, mapped, authorOptions);
      phase = 'author'; counts = [];
      await withPackageManager(selected, scopedTools, runProcess, { ...authorOptions, projectEnvironment: mapped }, async command => {
        await withNpmAuthentication(selected, command, scopedTools.env, authorOptions, async authenticated => {
          const args = manager === 'npm' ? ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'] : manager === 'pnpm' ? ['install', '--lockfile-only'] : ['install'];
          // Fixture authoring only. Workflow remains frozen/immutable.
          await runProcess({ executable: authenticated.executable, args: [...authenticated.args, ...args], cwd: project, env: { ...authenticated.env, ...(modern ? { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' } : {}) } });
        });
      });
      if (name === 'combined') await cp('examples/combined-product/backend', join(project, 'backend'), { recursive: true });
      const files = ['package.json', 'packages/web/package.json', 'packages/web/index.js', manager === 'yarn' ? modern ? '.yarnrc.yml' : '.npmrc' : '.npmrc', ...(manager === 'pnpm' ? ['pnpm-workspace.yaml'] : []), lockPath];
      const snapshots = await Promise.all(files.map(async path => [path.startsWith(project) ? path : join(project, path), await hash(path.startsWith(project) ? path : join(project, path))]));
      snapshots.push([originalUserconfig, await hash(originalUserconfig)], [originalAuth, await hash(originalAuth)]);
      const cleanInstall = async () => {
        await rm(cache, { recursive: true, force: true });
        for (const path of ['node_modules', 'packages/web/node_modules', '.pnp.cjs', '.pnp.loader.mjs', '.yarn/install-state.gz', '.yarn/unplugged']) await rm(join(project, path), { recursive: true, force: true });
      };
      let scans = 0, publications = 0;
      const run = async command => {
        if (command.args[0] === tools.cdxgenCli && command.args.includes('-o')) {
          scans++;
          if (Object.values(command.env ?? {}).some(value => secretValues.includes(value))) throw new Error('Task credential leaked into scanner environment');
          assert.ok(command.args.includes('--required-only')); assert.equal(command.args[command.args.indexOf('--install-deps') + 1], 'false');
          assert.deepEqual(command.args.filter((_, index) => command.args[index - 1] === '-t'), name === 'combined' ? ['dotnet', 'js'] : ['js']);
        }
        if (command.cwd !== project && command.cwd.includes('sbom-manager-')) {
          if (Object.values(command.env ?? {}).some(value => secretValues.includes(value))) throw new Error('Task credential leaked into manager provisioning');
        }
        return runProcess(command);
      };
      const config = { environment: name === 'combined' ? 'combined' : 'vue', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false, npmCredentials: credential };
      const services = { run, log, prepare: async () => ({ ...scopedTools, env: { ...scopedTools.env } }), publish: async () => { publications++; } };
      await cleanInstall(); phase = 'success'; counts = [];
      const result = await runWorkflow(config, join(state, 'success'), services);
      assert.ok(!(await readdir(join(state, 'success'))).some(name => name.startsWith('sbom-npm-auth-') || name.startsWith('sbom-manager-')), 'Success auth/manager temp cleanup failed');
      const bytes = await readFile(result.path), bom = JSON.parse(bytes);
      if (!safe(bytes.toString())) throw new Error('Secret found in artifact');
      assert.equal(scans, 1); assert.equal(publications, 1);
      const all = [...bom.components, ...(bom.metadata?.component?.components ?? [])];
      const component = (group, name) => all.find(component => component.group === group && component.name === name);
      for (const group of ['@private', '@basic']) {
        const from = component(group, 'demo'), to = component('@public', 'helper');
        assert.ok(from && to, 'Private/public components missing');
        assert.ok(bom.dependencies?.some(dependency => dependency.ref === from['bom-ref'] && dependency.dependsOn?.includes(to['bom-ref'])), 'Private -> public dependency edge missing');
      }
      for (const scope of ['private', 'basic', 'public']) assert.ok(counts.some(request => request.phase === 'success' && request.scope === scope && request.authenticated && request.tarball), 'Authenticated/private or unauthenticated/public tarball fetch not observed');
      if (name === 'combined') {
        const from = all.find(component => component.name === 'Microsoft.Extensions.Logging'), to = all.find(component => component.name === 'Microsoft.Extensions.Logging.Abstractions');
        assert.ok(from && to && bom.dependencies.some(dependency => dependency.ref === from['bom-ref'] && dependency.dependsOn?.includes(to['bom-ref'])), 'Combined backend edge missing');
      }
      for (const failure of ['wrong', 'missing']) {
        await cleanInstall(); phase = failure; counts = [];
        const bad = failure === 'missing' ? undefined : credential.map(entry => entry.token ? { ...entry, token: 'invalid-fixture-token' } : { ...entry, password: 'invalid-fixture-password' });
        let error;
        try { await runWorkflow({ ...config, npmCredentials: bad }, join(state, failure), services); } catch (caught) { error = caught; }
        assert.ok(error instanceof Error && safe(error.message) && error.message.includes('依賴安裝'), 'Wrong/missing auth must fail safely in install stage');
        assert.equal(scans, 1, 'Auth failure must stop before scan'); assert.equal(publications, 1, 'Auth failure must not publish');
        if (failure === 'wrong') assert.ok(counts.some(request => !request.authenticated && request.scope !== 'public'), 'Wrong credentials must reach protected fixture and be rejected');
        const remaining = await readdir(join(state, failure));
        assert.ok(!remaining.some(name => name.startsWith('sbom-npm-auth-') || name.startsWith('sbom-manager-')), 'Auth/manager temp cleanup failed');
      }
      for (const [path, before] of snapshots) assert.equal(await hash(path), before, 'Repository/source settings or lock changed');
      assert.equal(publicLeaks, 0, 'Private credential sent to unrelated public registry path');
      const checkGenerated = async directory => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) await checkGenerated(path);
          else if (entry.isFile() && !safe((await readFile(path)).toString())) throw new Error('Secret found in generated fixture/settings/diagnostic files');
        }
      };
      await checkGenerated(project); await checkGenerated(state);
      evidence.push({ scenario: name, platform: process.platform, arch: process.arch, node: tools.nodeVersion, cdxgen: tools.cdxgenVersion, manager, version, components: result.componentCount, specVersion: bom.specVersion, authenticatedBearerAndBasicTarballs: true, publicTarballWithoutAuthorization: true, frontendEdges: ['@private/demo -> @public/helper', '@basic/demo -> @public/helper'], combinedBackendEdge: name === 'combined' ? 'Microsoft.Extensions.Logging -> Microsoft.Extensions.Logging.Abstractions' : undefined, scans, localArtifacts: publications, wrongAndMissingAuthFailedBeforeScan: true, repoAndUserSettingsAndLocksUnchanged: true, cleanup: true, artifactSha256: createHash('sha256').update(bytes).digest('hex') });
      await writeFile(join(base, 'evidence.json'), JSON.stringify(evidence, null, 2));
      log(`PRIVATE REGISTRY PASS ${name}: ${result.componentCount} schema-valid components, Bearer+Basic/private-public edges, strict install, wrong/missing failure, cleanup and unchanged settings/locks.`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
  }
  log('Only a synthetic local registry and local artifact adapter tested; no company credentials, live Azure publication or enterprise registry compatibility claim.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Private registry smoke failed'); process.exitCode = 1; });
