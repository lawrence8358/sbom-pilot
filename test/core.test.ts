import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExcludes, readTaskConfig, validateConfig, DEFAULT_EXCLUDES, type TaskConfig } from '../src/config';
import { npmInstaller, inspectNpmProject } from '../src/install/npm';
import { scanArguments } from '../src/scan';
import { runWorkflow } from '../src/workflow';
import { validateSbom } from '../src/validation';
import { runProcess, type ProcessRunner } from '../src/process';
import { selectNodeVersion, type ToolContext } from '../src/tools';
import { validateToolOptions, validateCdxgenPackage, parseCdxgenVersion, validateCdxgenHelp } from '../src/tool-options';

const config = (projectPath: string): TaskConfig => ({ environment: 'vue', projectPath, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: true, noCache: true, runOsv: false, uploadToDt: false });
const tools: ToolContext = { node: process.execPath, npmCli: 'npm-cli.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.1', cdxgenVersion: '13.6.0', env: process.env };
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-pilot-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('glob brace comma is retained, malformed braces rejected', () => {
  assert.deepEqual(parseExcludes('**/_Design{,Front}/**, src/**'), ['**/_Design{,Front}/**', 'src/**']);
  assert.throws(() => parseExcludes('a{,b'), /花括號/);
  assert.deepEqual(parseExcludes(' , **/{a,{b,c}}/** ,, dir with spaces/**, '), ['**/{a,{b,c}}/**', 'dir with spaces/**']);
  assert.deepEqual(parseExcludes('foo[{},]/**,bar\\{x\\,y\\}/**'), ['foo[{},]/**', 'bar\\{x\\,y\\}/**']);
  assert.deepEqual(parseExcludes(' , , '), []);
  assert.throws(() => parseExcludes('a}'), /花括號/);
});
test('runtime input parsing applies defaults, keeps blank excludes and rejects invalid YAML booleans', () => {
  const defaults = readTaskConfig(name => name === 'projectPath' ? ' path with spaces ' : undefined);
  assert.equal(defaults.projectPath, 'path with spaces');
  assert.equal(defaults.fetchLicense, true);
  assert.equal(defaults.noCache, true);
  assert.equal(defaults.uploadToDt, false);
  assert.equal(defaults.nodeVersion, '24.x');
  assert.equal(defaults.specVersion, '1.6');
  assert.equal(readTaskConfig(name => name === 'projectPath' ? 'root' : name === 'cdxgenVersion' ? '' : undefined).cdxgenVersion, '13.6.0');
  const values: Record<string, string> = { projectPath: 'root', excludes: '', fetchLicense: 'FALSE', noCache: ' false ' };
  const parsed = readTaskConfig(name => values[name]);
  assert.deepEqual(parsed.excludes, []);
  assert.equal(parsed.fetchLicense, false);
  assert.equal(parsed.noCache, false);
  for (const value of ['yes', '0', '', 'truthy']) {
    assert.throws(() => readTaskConfig(name => name === 'projectPath' ? 'root' : name === 'fetchLicense' ? value : undefined), /true.*false/);
  }
});
test('actual Azure SDK adapter preserves explicit blank input after SDK vault loading', () => fixture(async root => {
  await runProcess({ executable: process.execPath,
    args: ['-e', "const {readAzureInput}=require('./.test-build/src/azure-inputs');if(readAzureInput('excludes')!=='')process.exit(2);if(readAzureInput('nodeVersion')!=='24.x')process.exit(3)"],
    cwd: process.cwd(), env: { ...process.env, AGENT_TEMPDIRECTORY: root, INPUT_EXCLUDES: '', INPUT_NODEVERSION: '24.x' },
  });
}));
test('tool overrides reject old package names, prereleases and incompatible runtime before install', () => {
  assert.doesNotThrow(() => validateToolOptions('24.x', '13.6.0'));
  for (const version of ['12.0.0', '14.0.0', '13.x', '13.6.0-beta.1', 'latest']) assert.throws(() => validateToolOptions('24.x', version), /13.x/);
  assert.throws(() => validateToolOptions('20.x', '13.6.0'), /Node/);
  assert.throws(() => validateToolOptions('latest', '13.6.0'), /Node/);
  assert.throws(() => validateCdxgenPackage({ version: '13.6.0', engines: { node: '>=26' } }, '13.6.0', '24.22.2'), /engines/);
  assert.throws(() => validateCdxgenPackage({ version: '13.5.0', engines: { node: '>=24' } }, '13.6.0', '24.22.2'), /版本/);
  assert.equal(parseCdxgenVersion('\u001b[1mCycloneDX Generator 13.6.0\u001b[0m\nRuntime: Node.js, Version: 24.22.2'), '13.6.0');
  assert.equal(parseCdxgenVersion('Runtime Node24.22.2'), undefined);
  assert.throws(() => validateCdxgenHelp('--required-only --install-deps --spec-version --exclude-type --recurse --type --output'), /exclude/);
});
test('unsupported spec and malformed runtime types fail before any tool preparation', () => fixture(async root => {
  await assert.rejects(validateConfig({ ...config(root), specVersion: '1.7' }), /1.6/);
  await assert.rejects(validateConfig({ ...config(root), noCache: 'true' as unknown as boolean }), /布林/);
  await assert.rejects(validateSbom('does-not-exist', '../../1.6'), /1.6/);
}));
test('scan options set each environment switch independently without changing parent configuration', () => fixture(async root => {
  const { generateSbom } = await import('../src/scan');
  const captured: { env?: NodeJS.ProcessEnv; args: string[] }[] = [];
  const syntheticTools = { ...tools, env: { PATH: 'fixture-path', npm_config_registry: 'https://example.invalid' } };
  const run: ProcessRunner = async command => { captured.push(command); return { stdout: '', stderr: '' }; };
  for (const fetchLicense of [true, false]) for (const noCache of [true, false]) {
    await generateSbom({ config: { ...config(root), fetchLicense, noCache, excludes: [] }, tools: syntheticTools, outputPath: join(root, 'bom.json') }, run);
    const command = captured.at(-1)!;
    assert.equal(command.env?.FETCH_LICENSE, String(fetchLicense));
    assert.equal(command.env?.CDXGEN_NO_CACHE, String(noCache));
    assert.equal(command.env?.PATH, syntheticTools.env.PATH);
    assert.equal(command.env?.npm_config_registry, syntheticTools.env.npm_config_registry);
    assert.equal(command.args.includes('--exclude'), false);
    assert.equal(command.args[1], root);
  }
}));
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
    if (command.args.includes('--version')) return { stdout: '11.19.1', stderr: '' };
    args = command.args; return { stdout: '', stderr: '' };
  };
  await npmInstaller.install(root, tools, run);
  assert.equal(args[1], 'ci');
  assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3}');
  await assert.rejects(npmInstaller.install(root, tools, async command => {
    if (command.args.includes('--version')) return { stdout: '11.19.1', stderr: '' };
    throw new Error('https://user:SECRET@example.invalid');
  }), error => error instanceof Error && !error.message.includes('SECRET') && /npm ci/.test(error.message));
}));
test('real npm ci succeeds on a locked empty project and fails on manifest mismatch without rewriting lockfile', () => fixture(async root => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run tests via npm test');
  const npmVersion = (await runProcess({ executable: process.execPath, args: [npmCli, '--version'], cwd: root })).stdout.trim();
  const runtime = { ...tools, nodeVersion: process.versions.node, npmCli, env: { ...process.env, npm_config_offline: 'true' } };
  // This offline install test uses its actual host npm. Handler Node20 runs the
  // production workflow with a separately prepared Node24; do not pretend the
  // test host itself is that scanner runtime or try provisioning npm11 offline.
  const manifest = { name: 'fixture-product', version: '1.0.0', packageManager: `npm@${npmVersion}` };
  const lock = JSON.stringify({ name: 'fixture-product', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture-product', version: '1.0.0' } } });
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'package-lock.json'), lock);
  await npmInstaller.install(root, runtime, runProcess);
  await writeFile(join(root, 'package.json'), JSON.stringify({ ...manifest, dependencies: { vue: '3.5.13' } }));
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
  const services = { log: () => {}, publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => {} }, generate: async () => {}, validate: async (path: string) => ({ path, componentCount: 1 }), publish: async () => { published++; throw new Error('upload failed'); } };
  await assert.rejects(runWorkflow(config(root), root, services), /成品發佈/);
  assert.equal(published, 2);
  await assert.rejects(runWorkflow(config(root), root, { ...services, validate: async () => { throw new Error('bad BOM'); } }), /SBOM 驗證/);
  assert.equal(published, 2);
}));
test('workflow reports installation failure and publishes no invalid artifact', () => fixture(async root => {
  let published = false;
  await assert.rejects(runWorkflow(config(root), root, { log: () => {}, publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => { throw new Error('install failed'); } }, publish: async () => { published = true; } }), /依賴安裝/);
  assert.equal(published, false);
}));
test('child runner reports exit and timeout without exposing child output', async () => {
  await assert.rejects(runProcess({ executable: process.execPath, args: ['-e', 'console.error("SECRET");process.exit(2)'], cwd: process.cwd() }), error => error instanceof Error && !error.message.includes('SECRET') && /exit 2/.test(error.message));
  await assert.rejects(runProcess({ executable: process.execPath, args: ['-e', 'setTimeout(()=>{},10000)'], cwd: process.cwd(), timeoutMs: 30 }), /逾時/);
});

test('frontend scans disable Babel while backend scans retain their existing options', () => {
  for (const environment of ['javascript', 'vue', 'combined', 'dotnet', 'netframework'] as const) {
    const args = scanArguments({ config: { ...config('project'), environment }, tools, outputPath: 'bom.json' });
    assert.equal(args.includes('--no-babel'), ['javascript', 'vue', 'combined'].includes(environment), environment);
    assert.ok(args.includes('--required-only'));
    assert.equal(args[args.indexOf('--install-deps') + 1], 'false');
  }
});
