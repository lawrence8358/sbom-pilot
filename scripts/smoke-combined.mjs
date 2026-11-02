import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
const base = resolve('.smoke/combined');
process.env.AGENT_TOOLSDIRECTORY ??= resolve('.smoke/cache');
process.env.AGENT_TEMPDIRECTORY ??= join(base, 'temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const { prepareTools } = await import('../.test-build/src/tools.js');
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: process.env.AGENT_TEMPDIRECTORY }, runProcess, console.log);
const requested = process.argv.find(arg => arg.startsWith('--scenarios='))?.split('=')[1];
const scenarios = requested?.split(',') ?? ['pnpm', 'npm', 'yarn-classic', 'yarn-modern-pnp', 'yarn-modern-node-modules', 'dotnet'];
const allowed = new Set(['pnpm', 'npm', 'yarn-classic', 'yarn-modern-pnp', 'yarn-modern-node-modules', 'dotnet']);
assert.ok(scenarios.every(scenario => allowed.has(scenario)), 'Unknown smoke scenario');
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const evidence = [];
const sdk = (await runProcess({ executable: 'dotnet', args: ['--version'], cwd: base })).stdout.trim();

for (const scenario of scenarios) {
  const project = join(base, `product-${scenario}`), runDirectory = join(base, `run-${scenario}`);
  // Only remove generated smoke children whose absolute parent is this smoke base.
  assert.equal(resolve(project, '..'), base);
  await rm(project, { recursive: true, force: true });
  await mkdir(project, { recursive: true });
  let frontend = project, lock;
  if (scenario === 'pnpm') {
    await cp('examples/combined-product', project, { recursive: true });
    lock = join(project, 'pnpm-lock.yaml');
  } else {
    await cp('examples/combined-product/backend', join(project, 'backend'), { recursive: true });
    if (scenario === 'npm') {
      frontend = join(project, 'frontend');
      await mkdir(frontend, { recursive: true });
      await writeFile(join(frontend, 'package.json'), JSON.stringify({ name: 'combined-npm-web', version: '1.0.0', packageManager: 'npm@11.19.1', dependencies: { 'is-odd': '3.0.1' }, devDependencies: { chalk: '5.3.0' } }));
      await writeFile(join(frontend, 'index.js'), "const isOdd = require('is-odd'); console.log(isOdd(3));\n");
      // Fixture authoring only; the workflow under test always uses strict npm ci.
      await runProcess({ executable: tools.node, args: [tools.npmCli, 'install', '--package-lock-only', '--ignore-scripts'], cwd: frontend, env: tools.env });
      lock = join(frontend, 'package-lock.json');
    } else if (scenario.startsWith('yarn-')) {
      frontend = join(project, 'frontend');
      const modern = scenario !== 'yarn-classic';
      await cp(`examples/yarn-${modern ? 'modern' : 'classic'}-workspace`, frontend, { recursive: true });
      if (scenario === 'yarn-modern-node-modules') {
        const rc = join(frontend, '.yarnrc.yml');
        await writeFile(rc, (await readFile(rc, 'utf8')).replace('nodeLinker: pnp', 'nodeLinker: node-modules'));
      }
      lock = join(frontend, 'yarn.lock');
    }
  }
  for (const directory of ['_Design', '_DesignFront']) {
    const excluded = join(project, directory);
    await mkdir(excluded, { recursive: true });
    await writeFile(join(excluded, 'package.json'), JSON.stringify({ name: 'excluded-design-component', version: '1.0.0', dependencies: { 'left-pad': '1.3.0' } }));
    await writeFile(join(excluded, 'Excluded.csproj'), '<invalid-project />');
  }
  const before = lock ? await digest(lock) : undefined;
  let scans = 0, restores = 0, publications = 0;
  const run = async command => {
    if (command.args[0] === tools.cdxgenCli && command.args.includes('-o')) {
      scans++;
      assert.ok(command.args.includes('-r'));
      assert.ok(command.args.includes('--required-only'));
      assert.equal(command.args[command.args.indexOf('--install-deps') + 1], 'false');
      const types = command.args.filter((_, index) => command.args[index - 1] === '-t');
      assert.deepEqual(types, scenario === 'dotnet' ? ['dotnet'] : ['dotnet', 'js']);
    }
    if (command.args[0] === 'restore') restores++;
    return runProcess(command);
  };
  const config = { environment: scenario === 'dotnet' ? 'dotnet' : 'combined', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false };
  const services = { run, log: console.log, prepare: async () => ({ ...tools, env: { ...tools.env } }), publish: async () => { publications++; } };
  const result = await runWorkflow(config, runDirectory, services);
  const bytes = await readFile(result.path), bom = JSON.parse(bytes);
  const components = [...bom.components, ...(bom.metadata?.component?.components ?? [])];
  const component = name => components.find(component => component.name === name);
  const edge = (from, to) => {
    assert.ok(component(from), `Missing ${from}`);
    assert.ok(component(to), `Missing ${to}`);
    assert.ok(bom.dependencies?.some(dependency => dependency.ref === component(from)['bom-ref'] && dependency.dependsOn?.includes(component(to)['bom-ref'])), `Missing ${from} -> ${to} dependency edge`);
  };
  edge('Microsoft.Extensions.Logging', 'Microsoft.Extensions.Logging.Abstractions');
  if (scenario === 'pnpm') {
    assert.ok(component('vue'), 'Missing Vue frontend');
    assert.ok(component('shared'), 'Missing workspace application');
    edge('shared', 'lodash');
  } else if (scenario !== 'dotnet') {
    edge('is-odd', 'is-number');
    if (scenario.startsWith('yarn-')) edge('shared', 'is-odd');
  }
  assert.ok(!component('excluded-design-component') && !component('left-pad'), 'Shared exclusions leaked design dependencies');
  assert.equal(scans, 1, 'Must invoke scanner once');
  assert.equal(restores, 1, 'Must really restore backend once');
  assert.equal(publications, 1, 'Must publish one validated artifact');
  if (lock) assert.equal(await digest(lock), before, 'Frontend lock changed');
  const chalk = component('chalk');
  if (['pnpm', 'npm'].includes(scenario)) assert.ok(!chalk, 'npm/pnpm dev-only chalk unexpectedly retained');
  if (chalk) assert.equal(chalk.scope, 'required', 'Retained chalk must have upstream required scope');
  evidence.push({ scenario, platform: process.platform, arch: process.arch, hostNode: process.version, sdk, scanNode: tools.nodeVersion, cdxgen: tools.cdxgenVersion, specVersion: bom.specVersion, components: result.componentCount, scans, restores, localArtifactPublications: publications, artifactSha256: createHash('sha256').update(bytes).digest('hex'), lockUnchanged: lock ? true : undefined, backendEdge: 'Microsoft.Extensions.Logging -> Microsoft.Extensions.Logging.Abstractions', frontendEdge: scenario === 'dotnet' ? undefined : scenario === 'pnpm' ? 'shared -> lodash' : 'is-odd -> is-number', devOnlyChalk: chalk ? 'retained upstream required scope' : 'absent' });
  await writeFile(join(base, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`COMBINED SMOKE PASS ${scenario}: ${result.componentCount} components, frontend/backend edges, shared exclusions, one scan/artifact, unchanged lock verified.`);
  if (scenario === 'pnpm') {
    const manifestPath = join(project, 'packages/web/package.json'), original = await readFile(manifestPath, 'utf8'), manifest = JSON.parse(original);
    await writeFile(manifestPath, JSON.stringify({ ...manifest, dependencies: { ...manifest.dependencies, 'left-pad': '1.3.0' } }));
    const previousScans = scans, previousPublications = publications;
    await assert.rejects(runWorkflow(config, join(base, 'run-stale-pnpm'), services), /依賴安裝/);
    assert.equal(scans, previousScans, 'Stale lock must fail before scanning');
    assert.equal(publications, previousPublications, 'Stale lock must not publish');
    assert.equal(await digest(lock), before);
    await writeFile(manifestPath, original);
    console.log('STRICT LOCK PASS: stale pnpm workspace rejected before scan/publication and lock unchanged.');
  }
}
console.log('Only local artifact adapters exercised. Live Azure Build Artifact publication/DT import are separate external gates. Linux .NET Framework is not applicable.');
