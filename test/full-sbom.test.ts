import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { readTaskConfig } from '../src/config';
import { runWorkflow } from '../src/workflow';
import type { Command } from '../src/process';
import type { ToolContext } from '../src/tools';

const tools: ToolContext = { node: process.execPath, npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: {} };
async function fixture(action: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sbom-full-')));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('one dependency installation produces, validates and publishes product and full SBOM with matching scan settings', () => fixture(async root => {
  const config = readTaskConfig(name => ({ projectPath: root, runOsv: 'false' })[name]);
  const commands: Command[] = [];
  const publications: string[][] = [];
  const logs: string[] = [];
  let installs = 0;
  const result = await runWorkflow(config, root, {
    log: message => logs.push(message), publishTabReport: async () => {}, prepare: async () => tools,
    installer: { install: async () => { installs++; } },
    run: async command => {
      commands.push(command);
      const full = !command.args.includes('--required-only');
      await writeFile(command.args[command.args.indexOf('-o') + 1], JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: full ? [{ type: 'library', name: 'build-tool' }] : [] }));
      return { stdout: '', stderr: '' };
    },
    publish: async (sbom, artifact) => { publications.push([basename(sbom.path), artifact, String(sbom.componentCount)]); },
  });
  assert.equal(installs, 1);
  assert.equal(commands.length, 2);
  const product = commands.find(command => command.args.includes('--required-only'))!;
  const full = commands.find(command => !command.args.includes('--required-only'))!;
  assert.ok(product && full);
  const commonArgs = (command: Command) => command.args.slice(0, -2).filter(arg => arg !== '--required-only');
  assert.deepEqual(commonArgs(product), commonArgs(full));
  assert.equal(product.args[product.args.indexOf('--install-deps') + 1], 'false');
  assert.deepEqual(full.env, product.env);
  assert.equal(full.cwd, product.cwd);
  assert.deepEqual(publications, [['sbom.cdx.json', 'SBOM', '0'], ['sbom.cdx-dev.json', 'SBOM', '1']]);
  assert.equal(basename(result.path), 'sbom.cdx.json');
  for (const [name, count] of [['產品 SBOM', '0'], ['完整 SBOM', '1']]) assert.ok(logs.some(line => line.includes(name) && line.includes(`組件數：${count}`)));
  const settings = JSON.parse(logs.find(line => line.startsWith('掃描設定：'))!.slice('掃描設定：'.length));
  assert.deepEqual(settings.outputs, [
    { variant: 'product', label: '產品 SBOM', outputPath: join(root, 'sbom', 'sbom.cdx.json'), requiredOnly: true, artifact: 'SBOM/sbom.cdx.json' },
    { variant: 'full', label: '完整 SBOM', outputPath: join(root, 'sbom', 'sbom.cdx-dev.json'), requiredOnly: false, artifact: 'SBOM/sbom.cdx-dev.json' },
  ]);
}));

test('artifact inputs show no editor defaults while missing and blank inputs retain runtime fallbacks', async () => {
  const manifest = JSON.parse(await readFile('src/task.json', 'utf8'));
  for (const [field, fallback] of [['artifactName', 'SBOM'], ['sbomFileName', 'sbom.cdx.json']]) {
    const input = manifest.inputs.find((input: { name: string }) => input.name === field);
    assert.equal(Object.hasOwn(input, 'defaultValue'), false);
    assert.ok(input.helpMarkDown.includes(`未填時使用 ${fallback}`));
    for (const value of [undefined, '', '  ']) {
      const config = readTaskConfig(name => name === 'projectPath' ? 'root' : name === field ? value : undefined);
      assert.equal(config[field as 'artifactName' | 'sbomFileName'], fallback);
    }
  }
});

for (const [product, full] of [['sbom.cdx.json', 'sbom.cdx-dev.json'], ['PrimeX.json', 'PrimeX-dev.json'], ['PrimeX.JSON', 'PrimeX-dev.json'], ['A.json.JSON', 'A.json-dev.json']]) {
  test(`filename ${product} publishes ${full}, OSV scans both and DT defaults to the full SBOM`, () => fixture(async root => {
    const input = readTaskConfig(name => ({ projectPath: root, sbomFileName: product, artifactName: 'Custom', uploadToDt: 'true', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]);
    const published: string[][] = [], scanned: string[] = [], uploaded: string[] = [];
    const result = await runWorkflow(input, root, {
      log: () => {}, publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => {} },
      generate: async request => { await writeFile(request.outputPath, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] })); },
      scanOsv: async request => { scanned.push(basename(request.sbom.path)); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: false, findingList: [] }; },
      upload: async sbom => { uploaded.push(basename(sbom.path)); },
      publish: async (sbom, name) => { published.push([basename(sbom.path), name]); },
      publishReport: async () => {},
    });
    assert.equal(basename(result.path), product);
    assert.deepEqual(published, [[product, 'Custom'], [full, 'Custom']]);
    assert.deepEqual(scanned, [product, full]);
    assert.deepEqual(uploaded, [full]);
  }));
}

test('DT can explicitly upload the product SBOM and its variant input is visible only when DT is enabled', async () => fixture(async root => {
  const input = readTaskConfig(name => ({ projectPath: root, runOsv: 'false', uploadToDt: 'true', dtSbomVariant: 'product', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]);
  const uploaded: string[] = [];
  const logs: string[] = [];
  await runWorkflow(input, root, {
    log: message => logs.push(message), publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => {} },
    generate: async request => { await writeFile(request.outputPath, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] })); },
    upload: async sbom => { uploaded.push(basename(sbom.path)); }, publish: async () => {},
  });
  assert.deepEqual(uploaded, ['sbom.cdx.json']);
  assert.ok(logs.includes('DT 上傳版本：產品 SBOM（sbom.cdx.json）。'));
  const manifest = JSON.parse(await readFile('src/task.json', 'utf8'));
  const variant = manifest.inputs.find((input: { name: string }) => input.name === 'dtSbomVariant');
  assert.ok(variant);
  assert.deepEqual(variant.options, { full: '完整 SBOM（含開發套件）', product: '產品 SBOM' });
  assert.equal(variant.label, 'DT 上傳版本');
  assert.equal(variant.defaultValue, 'full');
  assert.equal(variant.visibleRule, 'uploadToDt = true');
  assert.throws(() => readTaskConfig(name => ({ projectPath: 'root', uploadToDt: 'true', dtSbomVariant: 'invalid', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]), /dtSbomVariant/);
}));

for (const variant of ['product', 'full']) for (const failure of ['generation', 'validation']) {
  test(`${variant} SBOM ${failure} failure fails the task before OSV, DT or artifact publication`, () => fixture(async root => {
    const input = readTaskConfig(name => ({ projectPath: root })[name]);
    const events: string[] = [];
    await assert.rejects(runWorkflow(input, root, {
      log: () => {}, publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => {} },
      generate: async request => {
        const selected = basename(request.outputPath) === (variant === 'product' ? 'sbom.cdx.json' : 'sbom.cdx-dev.json');
        if (selected && failure === 'generation') throw new Error('generator broken');
        await writeFile(request.outputPath, selected && failure === 'validation' ? '{"bomFormat":"invalid"}' : JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] }));
      },
      scanOsv: async () => { events.push('osv'); throw new Error('unexpected'); },
      upload: async () => { events.push('dt'); }, publish: async () => { events.push('publish'); },
    }), new RegExp(`SBOM ${failure === 'generation' ? '產生' : '驗證'}（${variant === 'product' ? '產品' : '完整'} SBOM）`));
    assert.deepEqual(events, []);
  }));
}

test('each SBOM publication is attempted and both publication errors are preserved', () => fixture(async root => {
  const published: string[] = [];
  await assert.rejects(runWorkflow(readTaskConfig(name => ({ projectPath: root, runOsv: 'false' })[name]), root, {
    log: () => {}, publishTabReport: async () => {}, prepare: async () => tools, installer: { install: async () => {} }, generate: async () => {},
    validate: async path => ({ path, componentCount: 0 }),
    publish: async sbom => { published.push(basename(sbom.path)); throw new Error(`failed ${basename(sbom.path)}`); },
  }), /failed sbom.cdx.json.*failed sbom.cdx-dev.json/);
  assert.deepEqual(published, ['sbom.cdx.json', 'sbom.cdx-dev.json']);
}));
