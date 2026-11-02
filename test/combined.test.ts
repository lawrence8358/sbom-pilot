import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverJavaScriptProjects } from '../src/install/javascript-projects';
import { installCombinedProject } from '../src/install/combined';
import { runWorkflow } from '../src/workflow';
import { scanArguments, scanExcludes } from '../src/scan';
import { DEFAULT_EXCLUDES, parseExcludes, type TaskConfig } from '../src/config';
import type { ToolContext } from '../src/tools';
import type { ProcessRunner, Command } from '../src/process';

const tools: ToolContext = { node: process.execPath, npmCli: 'npm-cli.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: { PATH: 'original' } };
const config = (root: string): TaskConfig => ({ environment: 'combined', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false });
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-combined-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function manifest(directory: string, value: Record<string, unknown> = {}) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', ...value }));
}

test('original common-root pnpm workspace installs once despite member manifests', () => fixture(async root => {
  await manifest(root, { packageManager: 'pnpm@10.34.2' });
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'frontend/*'\n");
  await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  await manifest(join(root, 'frontend/web'));
  await manifest(join(root, 'frontend/shared'));
  await manifest(join(root, 'node_modules/generated'), { packageManager: 'invalid' });
  const projects = await discoverJavaScriptProjects(root);
  assert.deepEqual(projects.map(project => [project.root, project.manager]), [[root, 'pnpm']]);
}));

test('npm workspace and independent Yarn project keep their own locked install roots', () => fixture(async root => {
  const npm = join(root, 'frontend/npm'), yarn = join(root, 'frontend/yarn');
  await manifest(npm, { workspaces: ['packages/*'] });
  await writeFile(join(npm, 'package-lock.json'), '{}');
  await manifest(join(npm, 'packages/app'));
  await manifest(yarn, { packageManager: 'yarn@4.18.1', workspaces: ['packages/*'] });
  await writeFile(join(yarn, 'yarn.lock'), '__metadata:\n  version: 10\n');
  await manifest(join(yarn, 'packages/app'));
  assert.deepEqual((await discoverJavaScriptProjects(root)).map(project => [project.root, project.manager]), [[npm, 'npm'], [yarn, 'yarn']]);
}));

test('workspace declarations compare manager/version and only conflicting supplied hashes', () => fixture(async root => {
  const hash = 'a'.repeat(128), child = join(root, 'packages/app');
  await manifest(root, { packageManager: `pnpm@10.34.2+sha512.${hash}` });
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  await manifest(child, { packageManager: 'pnpm@10.34.2' });
  assert.equal((await discoverJavaScriptProjects(root)).length, 1);
  await manifest(child, { packageManager: `pnpm@10.34.2+sha512.${'b'.repeat(128)}` });
  await assert.rejects(discoverJavaScriptProjects(root), /互相矛盾/);
  await manifest(child, { packageManager: 'pnpm@10.34.1' });
  await assert.rejects(discoverJavaScriptProjects(root), /互相矛盾/);
}));

test('shared brace exclusions apply relative to common root before manifest parsing', () => fixture(async root => {
  await manifest(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package-lock.json'), '{}');
  for (const directory of ['_Design', '_DesignFront', 'backend/obj']) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, 'package.json'), 'invalid JSON');
  }
  assert.equal((await discoverJavaScriptProjects(root, parseExcludes(DEFAULT_EXCLUDES))).length, 1);
}));

test('workspace lock/declaration conflicts fail before any dependency installer', () => fixture(async root => {
  await manifest(root, { workspaces: ['packages/*'], packageManager: 'npm@11.19.1' });
  await writeFile(join(root, 'package-lock.json'), '{}');
  await manifest(join(root, 'packages/app'), { packageManager: 'yarn@4.18.1' });
  let installed = false;
  const installer = { install: async () => { installed = true; } };
  await assert.rejects(installCombinedProject(root, { ...tools }, async () => ({ stdout: '', stderr: '' }), {}, { javascript: installer, dotnet: installer }), /互相矛盾/);
  assert.equal(installed, false);
}));

test('combined common root cannot restore a frontend workspace outside its product boundary', () => fixture(async outer => {
  await manifest(outer, { packageManager: 'pnpm@10.34.2' });
  await writeFile(join(outer, 'pnpm-workspace.yaml'), "packages:\n  - 'product/*'\n");
  await writeFile(join(outer, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  const root = join(outer, 'product');
  await manifest(join(root, 'frontend'));
  await assert.rejects(discoverJavaScriptProjects(root), /共同掃描根目錄外/);
}));

test('combined preparation restores each JavaScript root then backend with same exclusion contract', () => fixture(async root => {
  for (const name of ['web-a', 'web-b']) {
    await manifest(join(root, name));
    await writeFile(join(root, name, 'package-lock.json'), '{}');
  }
  const calls: string[] = [], excludes = ['**/_Design{,Front}/**'];
  const context = { ...tools, env: { ...tools.env } };
  await installCombinedProject(root, context, async () => ({ stdout: '', stderr: '' }), { excludes }, {
    javascript: { install: async directory => { calls.push(directory); } },
    dotnet: { install: async (directory, selected, _run, options) => {
      calls.push(directory); assert.equal(options?.excludes, excludes);
      selected.dotnetAssets = [join(root, 'backend/obj/project.assets.json')];
      selected.env = { ...selected.env, DOTNET_ROOT: 'selected-sdk' };
    } },
  });
  assert.deepEqual(calls, [join(root, 'web-a'), join(root, 'web-b'), root]);
  assert.equal(context.env.DOTNET_ROOT, 'selected-sdk');
  assert.equal(context.dotnetAssets?.length, 1);
}));

test('combined scan uses one recursive invocation with dotnet/js and readable restore metadata', () => {
  const request = { config: config('common root'), tools, outputPath: 'one-bom.json' };
  const args = scanArguments(request);
  assert.deepEqual(args.filter((_, index) => args[index - 1] === '-t'), ['dotnet', 'js']);
  assert.equal(args.filter(value => value === '-o').length, 1);
  assert.ok(args.includes('-r') && args.includes('--required-only'));
  assert.equal(args[args.indexOf('--install-deps') + 1], 'false');
  assert.ok(scanExcludes(request).includes('**/obj/!(project.assets.json)'));
  assert.ok(scanExcludes(request).includes('**/_Design{,Front}/**'));
});

test('default combined workflow prepares frontend/backend and publishes exactly one validated BOM', () => fixture(async root => {
  await manifest(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package-lock.json'), '{}');
  const backend = join(root, 'backend'); await mkdir(backend);
  const projectPath = join(backend, 'Product.csproj'), assetsPath = join(backend, 'obj/project.assets.json');
  await writeFile(projectPath, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>');
  const calls: Command[] = [];
  const runner: ProcessRunner = async command => {
    calls.push(command);
    if (command.args[0] === tools.npmCli && command.args.includes('--version')) return { stdout: '11.19.1', stderr: '' };
    if (command.args[0] === '--version') return { stdout: '10.0.101', stderr: '' };
    if (command.args[0] === '--list-sdks') return { stdout: `10.0.101 [${join(root, 'sdk/sdk')}]`, stderr: '' };
    const graphOutput = command.args.find(value => value.startsWith('-p:RestoreGraphOutputPath='));
    if (graphOutput) await writeFile(graphOutput.slice('-p:RestoreGraphOutputPath='.length), JSON.stringify({ projects: { [projectPath]: { restore: { projectPath, outputPath: join(backend, 'obj'), projectStyle: 'PackageReference' } } } }));
    if (command.args[0] === 'restore') {
      await mkdir(join(backend, 'obj'), { recursive: true });
      await writeFile(assetsPath, JSON.stringify({ targets: {}, libraries: {}, project: { restore: { projectPath } } }));
    }
    if (command.args[0] === tools.cdxgenCli) await writeFile(command.args[command.args.indexOf('-o') + 1], JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [{ type: 'library', name: 'frontend-fixture' }, { type: 'library', name: 'backend-fixture' }] }));
    return { stdout: '', stderr: '' };
  };
  let published = 0;
  const result = await runWorkflow(config(root), join(root, 'temp'), { log: () => {}, run: runner, prepare: async () => ({ ...tools, env: { ...tools.env } }), publish: async sbom => { published++; assert.equal(sbom.componentCount, 2); } });
  assert.equal(published, 1);
  assert.equal(calls.filter(command => command.args[0] === tools.cdxgenCli).length, 1);
  assert.equal(calls.filter(command => command.args[0] === 'restore').length, 1);
  assert.equal(calls.filter(command => command.args.includes('ci')).length, 1);
  assert.equal(JSON.parse(await readFile(result.path, 'utf8')).components.length, 2);
}));
