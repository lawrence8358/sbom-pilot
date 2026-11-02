import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { parseNpmCredentials } from '../src/install/npm-credentials';
import { checkProjectAuthentication, withNpmAuthentication } from '../src/install/npm-auth';
import type { JavaScriptProject } from '../src/install/contracts';

const TOKEN = 'synthetic-private-registry-token', PASSWORD = 'synthetic-private-password';
const credentials = [{ registry: 'https://registry.example.test/team/', token: TOKEN }];
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-npm-auth-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const project = (root: string, manager: JavaScriptProject['manager'] = 'npm', version = '11.19.1'): JavaScriptProject => ({ root: join(root, 'project'), manager, version, reason: 'declaration', lockPath: '', ...(manager === 'yarn' ? { yarn: { generation: Number(version.split('.')[0]) === 1 ? 'classic' : 'modern' } as const } : {}) });

test('npm credentials validate exact URL identities and token/basic forms with secret-safe errors', () => {
  assert.deepEqual(parseNpmCredentials(undefined), undefined);
  assert.deepEqual(parseNpmCredentials('  '), undefined);
  assert.deepEqual(parseNpmCredentials(JSON.stringify([{ registry: 'https://REGISTRY.example.test/team', token: TOKEN }])), credentials);
  assert.deepEqual(parseNpmCredentials(JSON.stringify([{ registry: 'https://registry.example.test', username: 'user', password: PASSWORD }]))?.[0].registry, 'https://registry.example.test/');
  for (const input of [TOKEN, '{}', '[null]', JSON.stringify([{ ...credentials[0], password: PASSWORD }]), JSON.stringify([{ ...credentials[0], registry: `https://user:${PASSWORD}@registry.example.test/` }]), JSON.stringify([{ ...credentials[0], token: `${TOKEN}\nunsafe` }]), JSON.stringify([credentials[0], { ...credentials[0], registry: 'http://registry.example.test/team' }])]) {
    assert.throws(() => parseNpmCredentials(input), error => error instanceof Error && !error.message.includes(TOKEN) && !error.message.includes(PASSWORD));
  }
});

test('temporary scoped npm auth preserves user settings and parent env, cleans after success and failure', () => fixture(async root => {
  await mkdir(project(root).root);
  const original = join(root, 'original.npmrc');
  await writeFile(original, 'registry=https://registry.npmjs.org/\nfetch-retries=1\n');
  const env = { npm_config_userconfig: original, UNRELATED: 'preserved' };
  for (const fail of [false, true]) {
    let path = '';
    const action = withNpmAuthentication(project(root), { executable: process.execPath, args: [], env }, env, { tempDirectory: join(root, 'temp'), npmCredentials: credentials }, async command => {
      path = command.env!.NPM_CONFIG_USERCONFIG!;
      assert.ok(path.startsWith(join(root, 'temp')));
      const rc = await readFile(path, 'utf8');
      assert.match(rc, /fetch-retries=1/);
      assert.match(rc, /\/\/registry\.example\.test\/team\/:_authToken=\$\{SBOM_PILOT_NPM_/);
      assert.ok(!rc.includes(TOKEN));
      assert.ok(Object.values(command.env!).includes(TOKEN));
      assert.equal(command.env!.UNRELATED, 'preserved');
      if (fail) throw new Error(TOKEN);
    });
    if (fail) await assert.rejects(action, error => error instanceof Error && !error.message.includes(TOKEN)); else await action;
    await assert.rejects(readFile(path), { code: 'ENOENT' });
    assert.deepEqual(env, { npm_config_userconfig: original, UNRELATED: 'preserved' });
  }
  assert.equal(await readFile(original, 'utf8'), 'registry=https://registry.npmjs.org/\nfetch-retries=1\n');
}));

test('pnpm12 explicitly selects trusted auth file, pnpm10 keeps ordinary userconfig and basic encoding', () => fixture(async root => {
  await mkdir(project(root).root);
  for (const version of ['10.34.2', '12.16.1']) {
    await withNpmAuthentication(project(root, 'pnpm', version), { executable: process.execPath, args: [] }, {}, { tempDirectory: join(root, 'temp'), npmCredentials: [{ registry: credentials[0].registry, username: 'user', password: PASSWORD }] }, async command => {
      const path = command.env!.NPM_CONFIG_USERCONFIG!;
      assert.equal(command.env!.PNPM_CONFIG_NPMRC_AUTH_FILE, version.startsWith('12') ? path : undefined);
      assert.ok(Object.values(command.env!).includes(Buffer.from(`user:${PASSWORD}`).toString('base64')));
      assert.match(await readFile(path, 'utf8'), /:_auth=\$\{SBOM_PILOT_NPM_/);
    });
  }
}));

test('auth locates inherited child HOME settings and rejects project credential precedence/undefined Yarn placeholders precisely', () => fixture(async root => {
  await mkdir(project(root).root);
  const childHome = join(root, 'child-home');
  await mkdir(childHome);
  await writeFile(join(childHome, '.npmrc'), 'fetch-retries=5\n');
  await withNpmAuthentication(project(root), { executable: process.execPath, args: [] }, { HOME: childHome }, { tempDirectory: join(root, 'temp'), npmCredentials: credentials }, async command => {
    assert.match(await readFile(command.env!.NPM_CONFIG_USERCONFIG!, 'utf8'), /fetch-retries=5/);
  });
  const npmrc = '//registry.example.test/team/:_authToken=${MISSING_TOKEN}\n';
  await writeFile(join(project(root).root, '.npmrc'), npmrc);
  await assert.rejects(checkProjectAuthentication(project(root), {}, { npmCredentials: credentials }), /不能覆寫/);
  await checkProjectAuthentication(project(root, 'pnpm', '12.16.1'), {}, { npmCredentials: credentials });
  await writeFile(join(project(root).root, '.yarnrc.yml'), 'npmScopes:\n  private:\n    npmAuthToken: ${MISSING_TOKEN}\n');
  await assert.rejects(checkProjectAuthentication(project(root, 'yarn', '4.18.1'), {}, { npmCredentials: credentials }), /未提供的環境變數/);
  assert.equal(await readFile(join(project(root).root, '.npmrc'), 'utf8'), npmrc);
}));

test('modern Yarn temporary plugin only changes exact registry auth while preserving scope routing and existing plugins', () => fixture(async root => {
  await mkdir(project(root).root);
  const env = { YARN_PLUGINS: '/existing/plugin.cjs' };
  await withNpmAuthentication(project(root, 'yarn', '4.18.1'), { executable: process.execPath, args: [] }, env, { tempDirectory: join(root, 'temp'), npmCredentials: credentials }, async command => {
    const [existing, plugin] = command.env!.YARN_PLUGINS!.split(';');
    assert.equal(existing, env.YARN_PLUGINS);
    const source = await readFile(plugin, 'utf8');
    assert.ok(!source.includes(TOKEN));
    const privateScope = new Map<string, unknown>([['npmRegistryServer', credentials[0].registry], ['npmAuthToken', 'old'], ['npmMinimalAgeGate', 42]]);
    const unrelatedScope = new Map<string, unknown>([['npmRegistryServer', 'https://registry.example.test/unrelated/'], ['npmAuthToken', 'untouched']]);
    const config = new Map<string, any>([['npmRegistryServer', 'https://registry.npmjs.org'], ['npmRegistries', new Map()], ['npmScopes', new Map([['private', privateScope], ['other', unrelatedScope]])]]);
    const module = { exports: {} as any };
    runInNewContext(source, { module, process: { env: command.env }, URL, Map });
    module.exports.factory().hooks.validateProject({ configuration: config });
    assert.equal(privateScope.get('npmAuthToken'), TOKEN);
    assert.equal(privateScope.get('npmRegistryServer'), credentials[0].registry);
    assert.equal(privateScope.get('npmMinimalAgeGate'), 42);
    assert.equal(unrelatedScope.get('npmAuthToken'), 'untouched');
    assert.equal(config.get('npmRegistries').size, 1);
    assert.equal(config.get('npmRegistries').get(credentials[0].registry.slice(0, -1)).get('npmAlwaysAuth'), true);
  });
  assert.deepEqual(await readdir(join(root, 'temp')), []);
  assert.deepEqual(env, { YARN_PLUGINS: '/existing/plugin.cjs' });
}));

test('auth files cannot be placed inside project and no-credential route creates no config', () => fixture(async root => {
  await mkdir(project(root).root);
  let calls = 0;
  await assert.rejects(withNpmAuthentication(project(root), { executable: process.execPath, args: [] }, {}, { tempDirectory: join(project(root).root, '..hidden'), npmCredentials: credentials }, async () => { calls++; }), /專案外/);
  const command = { executable: process.execPath, args: [] };
  await withNpmAuthentication(project(root), command, {}, {}, async actual => { assert.equal(actual, command); calls++; });
  assert.equal(calls, 1);
}));

test('actual bundled entrypoint masks JSON and credential encodings before SDK debug, never reads secret input', () => fixture(async root => {
  const input = JSON.stringify([...credentials, { registry: 'https://basic.example.test/', username: 'synthetic-user', password: PASSWORD }]);
  const bundle = resolve('.test-build/npm-auth-entrypoint.js');
  await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: bundle, external: ['azure-pipelines-task-lib', 'azure-pipelines-tool-lib'], alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' } });
  const result = spawnSync(process.execPath, [bundle], { env: { ...process.env, SYSTEM_DEBUG: 'true', BUILD_BUILDID: '1', AGENT_TEMPDIRECTORY: root, INPUT_NPMCREDENTIALS: input, INPUT_ENVIRONMENT: 'unsupported', INPUT_PROJECTPATH: root }, encoding: 'utf8' });
  const lines = `${result.stdout}${result.stderr}`.split(/\r?\n/), debug = lines.findIndex(line => line.includes('task.debug'));
  for (const value of [TOKEN, PASSWORD, Buffer.from(PASSWORD).toString('base64'), Buffer.from(`synthetic-user:${PASSWORD}`).toString('base64')]) {
    const matches = lines.map((line, index) => ({ line, index })).filter(item => item.line.includes(value));
    assert.ok(matches.length);
    assert.ok(matches.every(item => item.index < debug && item.line.startsWith('##vso[task.setsecret]')));
  }
  assert.ok(lines.every(line => !/npmCredentials=/.test(line)));
}));
