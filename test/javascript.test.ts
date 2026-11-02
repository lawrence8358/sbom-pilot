import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { inspectJavaScriptProject, PNPM_FALLBACK_VERSION } from '../src/install/project';
import { javascriptInstaller } from '../src/install/javascript';
import type { ToolContext } from '../src/tools';
import type { ProcessRunner, Command } from '../src/process';

const tools: ToolContext = { node: process.execPath, npmCli: 'bundled-npm.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.1', cdxgenVersion: '13.6.0', env: { TEST_PRESERVED: 'yes' } };
async function fixture(action: (root: string, temp: string) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), 'sbom-pnpm-'));
  const root = join(base, 'project'), temp = join(base, 'tools');
  await mkdir(root); await mkdir(temp);
  try { await action(root, temp); } finally { await rm(base, { recursive: true, force: true }); }
}
async function project(root: string, manager?: string) {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture-product', version: '1.0.0', ...(manager ? { packageManager: manager } : {}) }));
  await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
}

test('pnpm detects pinned fallback or exact declaration; rejects ambiguity before execution', () => fixture(async root => {
  await project(root);
  assert.equal((await inspectJavaScriptProject(root)).version, PNPM_FALLBACK_VERSION);
  await project(root, 'pnpm@12.16.1');
  assert.equal((await inspectJavaScriptProject(root)).version, '12.16.1');
  await project(root, 'npm@11.19.1');
  await assert.rejects(inspectJavaScriptProject(root), /互相矛盾/);
  await project(root, 'pnpm@^10');
  await assert.rejects(inspectJavaScriptProject(root), /精確/);
  await project(root, 'pnpm@10.34.2');
  await writeFile(join(root, 'package-lock.json'), '{}');
  await assert.rejects(inspectJavaScriptProject(root), /lockfile/);
}));

test('workspace child installs from owning root and rejects competing child lock/declaration', () => fixture(async root => {
  await project(root, 'pnpm@10.34.2');
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  const child = join(root, 'packages', 'app'); await mkdir(child, { recursive: true });
  await writeFile(join(child, 'package.json'), '{"name":"app"}');
  assert.equal((await inspectJavaScriptProject(child)).root, root);
  await writeFile(join(child, 'package-lock.json'), '{}');
  await assert.rejects(inspectJavaScriptProject(child), /子目錄.*lockfile/);
  await rm(join(child, 'package-lock.json'));
  await writeFile(join(child, 'package.json'), '{"packageManager":"npm@11.19.1"}');
  await assert.rejects(inspectJavaScriptProject(child), /互相矛盾/);
}));

test('unknown pnpm lock fallback and missing lock fail rather than upgrading format', () => fixture(async root => {
  await project(root);
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0');
  await assert.rejects(inspectJavaScriptProject(root), /fallback/);
  await rm(join(root, 'pnpm-lock.yaml'));
  await assert.rejects(inspectJavaScriptProject(root), /lockfile/);
}));

function fakeManager(root: string, version: string, manager: 'pnpm' | 'npm', native: boolean, calls: Command[], failInstall = false): ProcessRunner {
  return async command => {
    calls.push(command);
    if (command.cwd !== root && command.args.includes('ci')) {
      const packageRoot = join(command.cwd, 'node_modules', manager);
      await mkdir(join(packageRoot, 'bin'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ version, bin: { [manager]: native ? manager : `bin/${manager}.cjs` }, engines: { node: '>=18' } }));
      await writeFile(join(packageRoot, native ? manager : `bin/${manager}.cjs`), '');
    }
    if (command.args.includes('--version')) return { stdout: command.args[0] === tools.npmCli ? '11.19.1' : version, stderr: '' };
    if (command.cwd === root && failInstall) throw new Error('https://user:TOP_SECRET@example.invalid');
    return { stdout: '', stderr: '' };
  };
}

for (const [version, native] of [['10.34.2', false], ['12.16.1', true]] as const) {
  test(`pnpm ${version} resolves actual ${native ? 'native' : 'JS'} bin and freezes project install`, () => fixture(async (root, temp) => {
    await project(root, `pnpm@${version}`);
    const calls: Command[] = [], logs: string[] = [];
    const before = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8');
    await javascriptInstaller.install(root, tools, fakeManager(root, version, 'pnpm', native, calls), { tempDirectory: temp, log: message => logs.push(message) });
    const install = calls.find(call => call.cwd === root && call.args.includes('--frozen-lockfile'))!;
    assert.ok(install);
    assert.equal(install.executable === tools.node, !native);
    assert.equal(install.env, tools.env);
    assert.ok(!install.args.includes('--ignore-scripts'));
    assert.match(logs.join(''), new RegExp(version.replaceAll('.', '\\.')));
    assert.equal(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'), before);
    assert.deepEqual(await readdir(temp), []);
  }));
}

test('declared npm differing from bundled version is provisioned and used for ci', () => fixture(async (root, temp) => {
  await writeFile(join(root, 'package.json'), '{"packageManager":"npm@10.9.2"}');
  await writeFile(join(root, 'package-lock.json'), '{}');
  const calls: Command[] = [];
  await javascriptInstaller.install(root, tools, fakeManager(root, '10.9.2', 'npm', false, calls), { tempDirectory: temp });
  const install = calls.find(call => call.cwd === root && call.args.includes('ci'))!;
  assert.ok(install.args[0].endsWith('npm.cjs'));
  assert.notEqual(install.args[0], tools.npmCli);
  assert.deepEqual(await readdir(temp), []);
}));

test('pnpm install errors suppress secret output and always clean temporary tool data', () => fixture(async (root, temp) => {
  await project(root, 'pnpm@10.34.2');
  await assert.rejects(javascriptInstaller.install(root, tools, fakeManager(root, '10.34.2', 'pnpm', false, [], true), { tempDirectory: temp }), error => error instanceof Error && /frozen-lockfile/.test(error.message) && !error.message.includes('TOP_SECRET'));
  assert.deepEqual(await readdir(temp), []);
}));

test('packageManager integrity suffix verifies packed bytes before any tool lifecycle runs', () => fixture(async (root, temp) => {
  const archive = Buffer.from('fixture archive'), hash = createHash('sha224').update(archive).digest('hex');
  await project(root, `pnpm@10.34.2+sha224.${hash}`);
  let installed = false;
  await assert.rejects(javascriptInstaller.install(root, tools, async command => {
    if (command.args.includes('pack')) {
      await writeFile(join(command.cwd, 'pnpm.tgz'), Buffer.from('wrong bytes'));
      return { stdout: '[{"filename":"pnpm.tgz"}]', stderr: '' };
    }
    installed = true; return { stdout: '', stderr: '' };
  }, { tempDirectory: temp }), /準備或嚴格安裝失敗/);
  assert.equal(installed, false);
  assert.deepEqual(await readdir(temp), []);
}));

test('script-mutated lockfile fails even when manager exits successfully', () => fixture(async (root, temp) => {
  await project(root, 'pnpm@10.34.2');
  const run = fakeManager(root, '10.34.2', 'pnpm', false, []);
  await assert.rejects(javascriptInstaller.install(root, tools, async command => {
    const result = await run(command);
    if (command.cwd === root && command.args.includes('--frozen-lockfile')) await writeFile(join(root, 'pnpm-lock.yaml'), 'modified');
    return result;
  }, { tempDirectory: temp }), /修改了 lockfile/);
}));
