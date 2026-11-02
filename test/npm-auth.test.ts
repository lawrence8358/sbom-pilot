import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { parseNpmCredentials, projectCredentialEnvironment, type NpmCredential } from '../src/install/npm-credentials';
import { checkProjectAuthentication, withNpmAuthentication } from '../src/install/npm-auth';
import type { JavaScriptProject } from '../src/install/contracts';
import { installJavaScriptProject } from '../src/install/javascript';
import type { ProcessRunner } from '../src/process';
import type { ToolContext } from '../src/tools';

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

test('explicit environment aliases validate credential forms, collisions and process controls without mutating inherited env', () => {
  const input = [...credentials.map(credential => ({ ...credential, environment: { NODE_AUTH_TOKEN: 'token' } })), { registry: 'https://basic.example.test/', username: 'user', password: PASSWORD, environment: { FEED_PASSWORD: 'password', FEED_PASSWORD_B64: 'passwordBase64', FEED_IDENT: 'basic', FEED_AUTH_B64: 'basicBase64' } }];
  const parsed = parseNpmCredentials(JSON.stringify(input))!;
  const inherited = { NODE_AUTH_TOKEN: 'old', PATH: 'preserved' }, actual = projectCredentialEnvironment(inherited, parsed);
  assert.equal(actual.NODE_AUTH_TOKEN, TOKEN);
  assert.equal(actual.FEED_PASSWORD, PASSWORD);
  assert.equal(actual.FEED_PASSWORD_B64, Buffer.from(PASSWORD).toString('base64'));
  assert.equal(actual.FEED_IDENT, `user:${PASSWORD}`);
  assert.equal(actual.FEED_AUTH_B64, Buffer.from(`user:${PASSWORD}`).toString('base64'));
  assert.deepEqual(inherited, { NODE_AUTH_TOKEN: 'old', PATH: 'preserved' });
  for (const environment of [{ NODE_OPTIONS: 'token' }, { PATH: 'token' }, { NPM_CONFIG_REGISTRY: 'token' }, { YARN_NPM_AUTH_TOKEN: 'token' }, { FEED_TOKEN: 'password' }, { FEED_TOKEN: 'invented' }]) assert.throws(() => parseNpmCredentials(JSON.stringify([{ ...credentials[0], environment }])));
  assert.throws(() => parseNpmCredentials(JSON.stringify([input[0], { ...input[1], environment: { NODE_AUTH_TOKEN: 'password' } }])));
});

test('mapped project placeholders work only at their matching source/auth slot; unrelated routing and global auth are rejected', () => fixture(async root => {
  await mkdir(project(root).root);
  const mapped: NpmCredential[] = [{ ...credentials[0], environment: { NODE_AUTH_TOKEN: 'token' } }];
  const env = projectCredentialEnvironment({}, mapped), options = { npmCredentials: mapped };
  await writeFile(join(project(root).root, '.npmrc'), '//registry.example.test/team/:_authToken=${NODE_AUTH_TOKEN}\n');
  await checkProjectAuthentication(project(root), env, options);
  await checkProjectAuthentication(project(root, 'pnpm', '10.34.2'), env, options);
  await checkProjectAuthentication(project(root, 'yarn', '1.22.22'), env, options);
  for (const rc of ['//unrelated.example.test/:_authToken=${NODE_AUTH_TOKEN}', 'registry=https://unrelated.example.test/${NODE_AUTH_TOKEN}', '//registry.example.test/team/:_password=${NODE_AUTH_TOKEN}']) {
    await writeFile(join(project(root).root, '.npmrc'), rc);
    await assert.rejects(checkProjectAuthentication(project(root), env, options), /無法安全對應/);
  }
  const rc = 'npmScopes:\n  private:\n    npmRegistryServer: https://registry.example.test/team/\n    npmAuthToken: ${NODE_AUTH_TOKEN}\n';
  await writeFile(join(project(root).root, '.yarnrc.yml'), rc);
  await checkProjectAuthentication(project(root, 'yarn', '4.18.1'), env, options);
  await writeFile(join(project(root).root, '.yarnrc.yml'), rc.replace('https://registry.example.test/team/', 'https://unrelated.example.test/'));
  await assert.rejects(checkProjectAuthentication(project(root, 'yarn', '4.18.1'), env, options), /無法安全對應/);
  await writeFile(join(project(root).root, '.yarnrc.yml'), 'npmAuthToken: ${NODE_AUTH_TOKEN}\n');
  await assert.rejects(checkProjectAuthentication(project(root, 'yarn', '4.18.1'), env, options), /無法安全對應/);
}));

test('placeholder mappings precede manager config/version init and install, while binary provisioning keeps original tool env', () => fixture(async root => {
  const selected = project(root, 'yarn', '4.18.1');
  await mkdir(selected.root);
  selected.lockPath = join(selected.root, 'yarn.lock');
  await writeFile(selected.lockPath, '__metadata:\n  version: 10\n');
  await writeFile(join(selected.root, '.yarnrc.yml'), 'npmScopes:\n  private:\n    npmRegistryServer: https://registry.example.test/team/\n    npmAuthToken: ${NODE_AUTH_TOKEN}\n');
  const tools: ToolContext = { node: process.execPath, npmCli: 'npm-cli.js', cdxgenCli: '', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: { PRESERVED: 'yes' } };
  let provisions = 0, versions = 0, installs = 0;
  const run: ProcessRunner = async command => {
    assert.ok(command.args.every(argument => !argument.includes(TOKEN)));
    if (command.cwd !== selected.root) {
      provisions++;
      assert.equal(command.env?.NODE_AUTH_TOKEN, undefined);
      if (command.args.includes('ci')) {
        const packageRoot = join(command.cwd, 'node_modules/@yarnpkg/cli-dist');
        await mkdir(join(packageRoot, 'bin'), { recursive: true });
        await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ version: '4.18.1', bin: { yarn: 'bin/yarn.js' } }));
        await writeFile(join(packageRoot, 'bin/yarn.js'), 'fixture binary');
      }
    } else {
      assert.equal(command.env?.NODE_AUTH_TOKEN, TOKEN);
      if (command.args.includes('--version')) versions++;
      else { installs++; assert.ok(command.env?.YARN_PLUGINS); }
    }
    return { stdout: command.args.includes('--version') ? '4.18.1' : '', stderr: '' };
  };
  await installJavaScriptProject(selected, tools, run, { tempDirectory: join(root, 'temp'), npmCredentials: [{ ...credentials[0], environment: { NODE_AUTH_TOKEN: 'token' } }] });
  assert.ok(provisions >= 2); assert.equal(versions, 1); assert.equal(installs, 1);
  assert.equal(tools.env.NODE_AUTH_TOKEN, undefined);
  assert.deepEqual(await readdir(join(root, 'temp')), []);
}));

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
      if (version.startsWith('12')) assert.match(await readFile(command.env!.PNPM_CONFIG_NPMRC_AUTH_FILE!, 'utf8'), /:_auth=\$\{SBOM_PILOT_NPM_/);
      else assert.equal(command.env!.PNPM_CONFIG_NPMRC_AUTH_FILE, undefined);
      assert.ok(Object.values(command.env!).includes(Buffer.from(`user:${PASSWORD}`).toString('base64')));
      assert.match(await readFile(path, 'utf8'), /:_auth=\$\{SBOM_PILOT_NPM_/);
    });
  }
}));

test('pnpm12 preserves user-level routing/settings separately from an inherited dedicated auth file', () => fixture(async root => {
  await mkdir(project(root).root);
  const userconfig = join(root, 'user.npmrc'), auth = join(root, 'auth.ini');
  const userBytes = '@public:registry=https://public.example.test/\nfetch-retries=7\n', authBytes = '//other.example.test/:_authToken=${EXISTING_TOKEN}\n';
  await writeFile(userconfig, userBytes); await writeFile(auth, authBytes);
  const env = { NPM_CONFIG_USERCONFIG: userconfig, PNPM_CONFIG_NPMRC_AUTH_FILE: auth, EXISTING_TOKEN: 'preserved-existing' };
  await withNpmAuthentication(project(root, 'pnpm', '12.16.1'), { executable: process.execPath, args: [] }, env, { tempDirectory: join(root, 'temp'), npmCredentials: credentials }, async command => {
    const user = await readFile(command.env!.NPM_CONFIG_USERCONFIG!, 'utf8'), dedicated = await readFile(command.env!.PNPM_CONFIG_NPMRC_AUTH_FILE!, 'utf8');
    assert.ok(user.startsWith(userBytes)); assert.ok(dedicated.startsWith(authBytes));
    assert.notEqual(command.env!.NPM_CONFIG_USERCONFIG, command.env!.PNPM_CONFIG_NPMRC_AUTH_FILE);
    assert.equal(command.env!.EXISTING_TOKEN, 'preserved-existing');
  });
  assert.equal(await readFile(userconfig, 'utf8'), userBytes); assert.equal(await readFile(auth, 'utf8'), authBytes);
  assert.deepEqual(await readdir(join(root, 'temp')), []);
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
  for (const value of [TOKEN, PASSWORD, `synthetic-user:${PASSWORD}`, Buffer.from(PASSWORD).toString('base64'), Buffer.from(`synthetic-user:${PASSWORD}`).toString('base64')]) {
    const matches = lines.map((line, index) => ({ line, index })).filter(item => item.line.includes(value));
    assert.ok(matches.length);
    assert.ok(matches.every(item => item.index < debug && item.line.startsWith('##vso[task.setsecret]')));
  }
  assert.ok(lines.every(line => !/npmCredentials=/.test(line)));
}));
