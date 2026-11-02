import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectJavaScriptProject } from '../src/install/project';
import { javascriptInstaller } from '../src/install/javascript';
import type { ProcessRunner, Command } from '../src/process';
import type { ToolContext } from '../src/tools';

const classicLock = '# yarn lockfile v1\n';
const modernLock = '__metadata:\n  version: 8\n  cacheKey: 10c0\n';
const tools: ToolContext = { node: process.execPath, npmCli: 'bundled-npm.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: { PRESERVED_SETTING: 'yes' } };
async function fixture(action: (root: string, temp: string) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), 'sbom-yarn-'));
  const root = join(base, 'project'), temp = join(base, 'tools');
  await mkdir(root); await mkdir(temp);
  try { await action(root, temp); } finally { await rm(base, { recursive: true, force: true }); }
}
async function project(root: string, modern: boolean, version?: string) {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', ...(version ? { packageManager: version } : {}) }));
  await writeFile(join(root, 'yarn.lock'), modern ? modernLock : classicLock);
}

test('Yarn chooses generation-specific pinned fallbacks and rejects declaration/lock conflicts', () => fixture(async root => {
  await project(root, false);
  assert.equal((await inspectJavaScriptProject(root)).version, '1.22.22');
  await project(root, true);
  assert.equal((await inspectJavaScriptProject(root)).version, '4.18.1');
  await project(root, true, 'yarn@1.22.22');
  await assert.rejects(inspectJavaScriptProject(root), /世代互相矛盾/);
  await project(root, false, 'yarn@4.18.1');
  await assert.rejects(inspectJavaScriptProject(root), /世代互相矛盾/);
  await project(root, true, 'pnpm@10.34.2');
  await assert.rejects(inspectJavaScriptProject(root), /互相矛盾/);
  await project(root, true, 'yarn@4.18.1');
  await writeFile(join(root, 'package-lock.json'), '{}');
  await assert.rejects(inspectJavaScriptProject(root), /lockfile/);
}));

test('unrecognized or migratable modern lock requires exact declaration', () => fixture(async root => {
  await project(root, true);
  await writeFile(join(root, 'yarn.lock'), '__metadata:\n  version: 6\n');
  await assert.rejects(inspectJavaScriptProject(root), /fallback/);
  await writeFile(join(root, 'package.json'), '{"packageManager":"yarn@3.8.7"}');
  assert.equal((await inspectJavaScriptProject(root)).version, '3.8.7');
  await writeFile(join(root, 'yarn.lock'), `${classicLock}${modernLock}`);
  await assert.rejects(inspectJavaScriptProject(root), /同時宣告/);
  await rm(join(root, 'yarn.lock'));
  await assert.rejects(inspectJavaScriptProject(root), /lockfile/);
}));

test('Yarn workspace child resolves owning root and rejects competing child locks', () => fixture(async root => {
  await project(root, true, 'yarn@4.18.1');
  await writeFile(join(root, 'package.json'), '{"name":"fixture","private":true,"workspaces":["packages/*"],"packageManager":"yarn@4.18.1"}');
  const child = join(root, 'packages', 'app'); await mkdir(child, { recursive: true });
  await writeFile(join(child, 'package.json'), '{"name":"app"}');
  assert.equal((await inspectJavaScriptProject(child)).root, root);
  await writeFile(join(child, 'yarn.lock'), modernLock);
  await assert.rejects(inspectJavaScriptProject(child), /子目錄.*lockfile/);
}));

function fakeRunner(root: string, version: string, calls: Command[], binary = 'fixture yarn binary', failInstall = false): ProcessRunner {
  return async command => {
    calls.push(command);
    if (command.cwd !== root && command.args.includes('ci')) {
      const packageName = version.startsWith('1.') ? 'yarn' : '@yarnpkg/cli-dist';
      const packageRoot = join(command.cwd, 'node_modules', packageName);
      await mkdir(join(packageRoot, 'bin'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ version, engines: { node: '>=18' }, bin: { yarn: 'bin/yarn.js' } }));
      await writeFile(join(packageRoot, 'bin/yarn.js'), binary);
    }
    if (command.args.includes('--version')) return { stdout: version, stderr: '' };
    if (command.cwd === root && failInstall) throw new Error('TOKEN_MUST_NOT_ESCAPE');
    return { stdout: '', stderr: '' };
  };
}

for (const [version, modern, strictFlag] of [['1.22.22', false, '--frozen-lockfile'], ['4.18.1', true, '--immutable']] as const) {
  test(`Yarn ${version} preserves config/environment and selects ${strictFlag}`, () => fixture(async (root, temp) => {
    await project(root, modern, `yarn@${version}`);
    const configPath = join(root, modern ? '.yarnrc.yml' : '.yarnrc');
    const configuration = modern ? 'nodeLinker: pnp\nenableScripts: false\n' : 'registry "https://registry.npmjs.org"\n';
    await writeFile(configPath, configuration);
    const calls: Command[] = [];
    await javascriptInstaller.install(root, tools, fakeRunner(root, version, calls), { tempDirectory: temp });
    const install = calls.find(command => command.cwd === root && command.args.includes('install'))!;
    assert.ok(install.args.includes(strictFlag));
    assert.ok(!install.args.includes('--ignore-scripts'));
    assert.equal(install.env?.PRESERVED_SETTING, 'yes');
    assert.equal(install.env?.YARN_IGNORE_PATH, '1');
    assert.equal(tools.env.YARN_IGNORE_PATH, undefined);
    assert.equal(await readFile(configPath, 'utf8'), configuration);
    assert.deepEqual(await readdir(temp), []);
    await assert.rejects(javascriptInstaller.install(root, tools, fakeRunner(root, version, [], 'fixture', true), { tempDirectory: temp }), error => error instanceof Error && error.message.includes(strictFlag) && !error.message.includes('TOKEN_MUST_NOT_ESCAPE'));
  }));
}

test('modern packageManager hashes the distributed CLI binary before running it', () => fixture(async (root, temp) => {
  const binary = 'fixture yarn binary', hash = createHash('sha224').update(binary).digest('hex');
  await project(root, true, `yarn@4.18.1+sha224.${hash}`);
  const calls: Command[] = [];
  await javascriptInstaller.install(root, tools, fakeRunner(root, '4.18.1', calls, binary), { tempDirectory: temp });
  assert.ok(!calls.some(command => command.args.includes('pack')));
  assert.ok(calls.some(command => command.cwd === root && command.args.includes('--immutable')));
  const wrongCalls: Command[] = [];
  await assert.rejects(javascriptInstaller.install(root, tools, fakeRunner(root, '4.18.1', wrongCalls, 'different binary'), { tempDirectory: temp }), /準備或嚴格安裝失敗/);
  assert.ok(!wrongCalls.some(command => command.args.includes('--version')));
}));

test('yarnPath version is probed and conflicting exact declaration fails before install', () => fixture(async (root, temp) => {
  await project(root, true);
  await writeFile(join(root, '.yarnrc.yml'), 'yarnPath: .yarn/releases/yarn.cjs\n');
  await mkdir(join(root, '.yarn/releases'), { recursive: true });
  await writeFile(join(root, '.yarn/releases/yarn.cjs'), 'local binary');
  assert.equal((await inspectJavaScriptProject(root)).reason, 'project-binary');
  const calls: Command[] = [];
  await javascriptInstaller.install(root, tools, fakeRunner(root, '3.8.7', calls), { tempDirectory: temp });
  assert.ok(calls.every(command => command.args[0].endsWith('yarn.cjs')));
  await writeFile(join(root, 'package.json'), '{"packageManager":"yarn@4.18.1"}');
  await assert.rejects(javascriptInstaller.install(root, tools, fakeRunner(root, '3.8.7', []), { tempDirectory: temp }), /準備或嚴格安裝失敗/);
  await writeFile(join(root, '.yarnrc'), 'yarn-path "different.cjs"\n');
  await assert.rejects(inspectJavaScriptProject(root), /互相矛盾/);
}));

test('Classic Corepack sha1 suffix is accepted and wrong-length hashes rejected', () => fixture(async root => {
  await project(root, false, `yarn@1.22.22+sha1.${'a'.repeat(40)}`);
  assert.ok((await inspectJavaScriptProject(root)).integrity?.startsWith('sha1-'));
  await project(root, false, 'yarn@1.22.22+sha1.a');
  await assert.rejects(inspectJavaScriptProject(root), /雜湊長度/);
}));
