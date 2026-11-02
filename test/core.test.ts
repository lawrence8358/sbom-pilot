import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExcludes, DEFAULT_EXCLUDES, type TaskConfig } from '../src/config';
import { npmInstaller, inspectNpmProject } from '../src/install/npm';
import { scanArguments } from '../src/scan';
import { runWorkflow } from '../src/workflow';
import { validateSbom } from '../src/validation';
import { runProcess, type ProcessRunner } from '../src/process';
import { selectNodeVersion, type ToolContext } from '../src/tools';

const config = (projectPath: string): TaskConfig => ({ environment: 'vue', projectPath, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: true, noCache: true, uploadToDt: false });
const tools: ToolContext = { node: process.execPath, npmCli: 'npm-cli.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.1', cdxgenVersion: '13.6.0', env: process.env };
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-pilot-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('glob brace comma is retained, malformed braces rejected', () => {
  assert.deepEqual(parseExcludes('**/_Design{,Front}/**, src/**'), ['**/_Design{,Front}/**', 'src/**']);
  assert.throws(() => parseExcludes('a{,b'), /花括號/);
});
test('latest compatible Node selection excludes incompatible runtime', () => {
  assert.equal(selectNodeVersion(['v24.1.0', 'v24.22.1', 'v26.0.0'], '24.x'), '24.22.1');
  assert.throws(() => selectNodeVersion(['v20.1.0'], '20.x'), /Node/);
});
test('npm missing or competing lockfile fails before running install', () => fixture(async root => {
  await writeFile(join(root, 'package.json'), '{}');
  await assert.rejects(inspectNpmProject(root), /lockfile/);
  await writeFile(join(root, 'package-lock.json'), '{}');
  await writeFile(join(root, 'yarn.lock'), '');
  await assert.rejects(inspectNpmProject(root), /其他套件管理器/);
}));
test('npm uses ci, preserves lockfile and suppresses credential-bearing errors', () => fixture(async root => {
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  let args: string[] = [];
  const run: ProcessRunner = async command => {
    if (command.args.includes('--version')) return { stdout: '11.0.0', stderr: '' };
    args = command.args; return { stdout: '', stderr: '' };
  };
  await npmInstaller.install(root, tools, run);
  assert.equal(args[1], 'ci');
  assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3}');
  await assert.rejects(npmInstaller.install(root, tools, async command => {
    if (command.args.includes('--version')) return { stdout: '11.0.0', stderr: '' };
    throw new Error('https://user:SECRET@example.invalid');
  }), error => error instanceof Error && !error.message.includes('SECRET') && /npm ci/.test(error.message));
}));
test('real npm ci succeeds on a locked empty project and fails on manifest mismatch without rewriting lockfile', () => fixture(async root => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run tests via npm test');
  const runtime = { ...tools, npmCli, env: { ...process.env, npm_config_offline: 'true' } };
  const lock = JSON.stringify({ name: 'fixture-product', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture-product', version: '1.0.0' } } });
  await writeFile(join(root, 'package.json'), '{"name":"fixture-product","version":"1.0.0"}');
  await writeFile(join(root, 'package-lock.json'), lock);
  await npmInstaller.install(root, runtime, runProcess);
  await writeFile(join(root, 'package.json'), '{"name":"fixture-product","version":"1.0.0","dependencies":{"vue":"3.5.13"}}');
  await assert.rejects(npmInstaller.install(root, runtime, runProcess), /npm ci/);
  assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), lock);
}));
test('scan freezes install and enables required scope and spec 1.6', () => {
  const args = scanArguments({ config: config('project'), tools, outputPath: 'bom.json' });
  assert.ok(args.includes('--required-only'));
  assert.equal(args[args.indexOf('--install-deps') + 1], 'false');
  assert.equal(args[args.indexOf('--spec-version') + 1], '1.6');
  assert.ok(args.includes('**/_Design{,Front}/**'));
});
test('real CycloneDX schema rejects wrong structure and invalid component, accepts valid BOM', () => fixture(async root => {
  const path = join(root, 'bom.json');
  await writeFile(path, '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[{"type":"library"}]}');
  await assert.rejects(validateSbom(path, '1.6'), /Schema/);
  await writeFile(path, '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[{"type":"library","name":"vue","version":"3.5.0"}]}');
  assert.equal((await validateSbom(path, '1.6')).componentCount, 1);
  await writeFile(path, 'not json');
  await assert.rejects(validateSbom(path, '1.6'), /JSON/);
}));
test('workflow validates before publication; publish failure fails stage', () => fixture(async root => {
  let published = 0;
  const services = { log: () => {}, prepare: async () => tools, installer: { install: async () => {} }, generate: async () => {}, validate: async (path: string) => ({ path, componentCount: 1 }), publish: async () => { published++; throw new Error('upload failed'); } };
  await assert.rejects(runWorkflow(config(root), root, services), /成品發佈/);
  assert.equal(published, 1);
  await assert.rejects(runWorkflow(config(root), root, { ...services, validate: async () => { throw new Error('bad BOM'); } }), /SBOM 驗證/);
  assert.equal(published, 1);
}));
test('workflow reports installation failure and publishes no invalid artifact', () => fixture(async root => {
  let published = false;
  await assert.rejects(runWorkflow(config(root), root, { log: () => {}, prepare: async () => tools, installer: { install: async () => { throw new Error('install failed'); } }, publish: async () => { published = true; } }), /依賴安裝/);
  assert.equal(published, false);
}));
test('child runner reports exit and timeout without exposing child output', async () => {
  await assert.rejects(runProcess({ executable: process.execPath, args: ['-e', 'console.error("SECRET");process.exit(2)'], cwd: process.cwd() }), error => error instanceof Error && !error.message.includes('SECRET') && /exit 2/.test(error.message));
  await assert.rejects(runProcess({ executable: process.execPath, args: ['-e', 'setTimeout(()=>{},10000)'], cwd: process.cwd(), timeoutMs: 30 }), /逾時/);
});
