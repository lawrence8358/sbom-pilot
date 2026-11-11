import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { readTaskConfig, validateConfig } from '../src/config';
import { runWorkflow } from '../src/workflow';
import type { ToolContext } from '../src/tools';

async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-project-path-'));
  try { await action(await realpath(root)); }
  finally { await rm(root, { recursive: true, force: true }); }
}

const config = (projectPath: string, environment = 'dotnet') =>
  readTaskConfig(name => ({ projectPath, environment, fetchLicense: 'false', runOsv: 'false' })[name]);

test('.NET file paths resolve to their containing scan directory, including relative paths and spaces', () => fixture(async root => {
  const directory = join(root, 'Product with spaces');
  await mkdir(directory);
  for (const environment of ['dotnet', ...(process.platform === 'win32' ? ['netframework'] : [])]) {
    for (const extension of ['sln', 'slnx', 'csproj', 'fsproj', 'vbproj', 'SLN']) {
      const file = join(directory, `Product.${extension}`);
      await writeFile(file, 'fixture');
      for (const input of [file, relative(process.cwd(), file)]) {
        const validated = await validateConfig(config(input, environment));
        assert.equal(validated.projectPath, directory);
        if (environment === 'dotnet') {
          assert.equal(validated.dotnetTarget, await realpath(file));
          assert.equal((await validateConfig(validated)).dotnetTarget, await realpath(file));
        }
      }
    }
  }
}));

test('directory paths remain directories and unsupported file inputs still fail before tool preparation', () => fixture(async root => {
  const directory = join(root, 'directory.sln');
  await mkdir(directory);
  assert.equal((await validateConfig(config(directory))).projectPath, directory);
  const file = join(root, 'Product.sln');
  await writeFile(file, 'fixture');
  for (const environment of ['javascript', 'vue', 'combined']) {
    await assert.rejects(validateConfig(config(file, environment)), /目錄/);
  }
  const text = join(root, 'readme.txt');
  await writeFile(text, 'fixture');
  await assert.rejects(validateConfig(config(text)), /目錄.*\.sln/);
  await assert.rejects(validateConfig(config(join(root, 'missing.sln'))), { code: 'ENOENT' });
}));

test('Classic solution filename reaches installation and the actual scanner as a directory and publishes a validated BOM', () => fixture(async root => {
  const solution = join(root, 'PrimeEagleX.Backend.sln');
  await writeFile(solution, 'Microsoft Visual Studio Solution File, Format Version 12.00');
  let installed = 0, scanned = 0, published = 0;
  const logs: string[] = [];
  const tools: ToolContext = { node: process.execPath, npmCli: 'npm-cli.js', cdxgenCli: 'cdxgen.js', nodeVersion: '24.22.1', cdxgenVersion: '13.6.0', env: process.env };
  const result = await runWorkflow(config(relative(process.cwd(), solution)), join(root, 'temp'), {
    log: message => logs.push(message),
    prepare: async () => tools,
    installer: { install: async directory => { assert.equal(directory, root); installed++; } },
    run: async command => {
      assert.equal(command.cwd, root);
      assert.equal(command.args[1], root);
      assert.ok(command.args.includes('-r'));
      const output = command.args[command.args.indexOf('-o') + 1];
      await writeFile(output, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, components: [{ type: 'library', name: 'fixture', version: '1.0.0' }] }));
      scanned++;
      return { stdout: '', stderr: '' };
    },
    publish: async sbom => { assert.equal(sbom.componentCount, 1); published++; },
  });
  assert.equal(result.componentCount, 1);
  assert.deepEqual([installed, scanned, published], [1, 2, 2]);
  assert.ok(logs.some(message => message.includes('單次還原') && message.includes('還原圖')));
}));
