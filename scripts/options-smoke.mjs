import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const compiled = spawnSync(process.execPath, ['scripts/test.mjs'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const root = resolve('.smoke/options with spaces');
process.env.AGENT_TOOLSDIRECTORY = resolve('.smoke/cache');
process.env.AGENT_TEMPDIRECTORY = resolve('.smoke/temp');
await mkdir(root, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
const { runProcess } = await import('../.test-build/src/process.js');
const { prepareTools } = await import('../.test-build/src/tools.js');
const { generateSbom } = await import('../.test-build/src/scan.js');
const { validateSbom } = await import('../.test-build/src/validation.js');
const { parseExcludes, validateConfig } = await import('../.test-build/src/config.js');
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: root }, runProcess, console.log);
const project = join(root, 'sample product');
for (const [directory, dependency, version] of [['.', 'vue', '3.5.13'], ['_Design', 'is-number', '7.0.0'], ['_DesignFront', 'is-odd', '3.0.1']]) {
  const cwd = join(project, directory);
  await mkdir(cwd, { recursive: true });
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: `sample-${dependency}`, version: '1.0.0', private: true, dependencies: { [dependency]: version } }));
  await writeFile(join(cwd, 'main.js'), `import item from '${dependency}'; console.log(item);\n`);
  await runProcess({ executable: tools.node, args: [tools.npmCli, 'install', '--package-lock-only', '--no-audit', '--no-fund'], cwd, env: tools.env });
}
const config = { environment: 'vue', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: [], fetchLicense: false, noCache: false, uploadToDt: false };
for (const [label, excludes, fetchLicense, noCache] of [['all', [], false, false], ['excluded', parseExcludes(' , **/_Design{,Front}/**, ,'), true, true]]) {
  const outputPath = join(root, `${label}.json`);
  await generateSbom({ config: { ...config, excludes, fetchLicense, noCache }, tools, outputPath }, runProcess);
  const validated = await validateSbom(outputPath, '1.6');
  const bom = JSON.parse(await readFile(outputPath, 'utf8'));
  const names = bom.components.map(component => component.name);
  assert.ok(names.includes('vue'), `${label}: Vue must remain`);
  assert.equal(names.includes('is-odd'), label === 'all', `${label}: _DesignFront component`);
  // is-number is also transitive to is-odd, and should disappear with both dirs.
  assert.equal(names.includes('is-number'), label === 'all', `${label}: _Design component`);
  console.log(`OPTIONS ${label}: ${validated.componentCount} schema-valid components; FETCH_LICENSE=${fetchLicense}; CDXGEN_NO_CACHE=${noCache}`);
}
await assert.rejects(validateConfig({ ...config, nodeVersion: '20.x' }), /Node/);
await assert.rejects(validateConfig({ ...config, cdxgenVersion: '12.0.0' }), /13.x/);
console.log('OPTIONS SMOKE PASS: brace glob excludes both design dirs, blank excludes retains both, path spaces preserved, incompatible overrides rejected.');
