import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, cp, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const compiled = spawnSync(process.execPath, ['scripts/test.mjs'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const base = resolve('.smoke/yarn');
process.env.AGENT_TOOLSDIRECTORY = resolve('.smoke/cache');
process.env.AGENT_TEMPDIRECTORY = join(base, 'temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const { prepareTools } = await import('../.test-build/src/tools.js');
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { withPackageManager } = await import('../.test-build/src/install/manager.js');
const { javascriptInstaller } = await import('../.test-build/src/install/javascript.js');
const { inspectJavaScriptProject } = await import('../.test-build/src/install/project.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: process.env.AGENT_TEMPDIRECTORY }, runProcess, console.log);
const config = root => ({ environment: 'vue', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, runOsv: false, uploadToDt: false });
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const exists = async path => access(path).then(() => true, () => false);

if (process.argv.includes('--refresh-fixtures')) {
  // Explicit fixture authoring only. The Task path below always freezes locks.
  for (const [generation, version] of [['classic', '1.22.22'], ['modern', '4.18.1']]) {
    const source = resolve(`examples/yarn-${generation}-workspace`), author = join(base, `author-${generation}`);
    await cp(source, author, { recursive: true });
    const lockPath = join(author, 'yarn.lock');
    if (!await exists(lockPath)) await writeFile(lockPath, '');
    await withPackageManager({ root: author, manager: 'yarn', version, reason: 'declaration', lockPath, yarn: { generation } }, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY, log: console.log }, async command => {
      await runProcess({ executable: command.executable, args: [...command.args, 'install'], cwd: author, env: { ...command.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' } });
      await cp(lockPath, join(source, 'yarn.lock'));
      if (generation === 'modern') {
        const hash = createHash('sha224').update(await readFile(command.args[0])).digest('hex');
        const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
        manifest.packageManager = `yarn@${version}+sha224.${hash}`;
        await writeFile(join(source, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        await cp(command.args[0], join(base, 'local-yarn.cjs'));
      }
    });
  }
}

for (const layout of ['classic', 'modern-pnp', 'modern-node-modules']) {
  const modern = layout !== 'classic', source = `examples/yarn-${modern ? 'modern' : 'classic'}-workspace`, project = join(base, layout);
  await cp(source, project, { recursive: true });
  const rcPath = join(project, modern ? '.yarnrc.yml' : '.yarnrc');
  if (layout === 'modern-node-modules') await writeFile(rcPath, (await readFile(rcPath, 'utf8')).replace('nodeLinker: pnp', 'nodeLinker: node-modules'));
  const before = await digest(join(project, 'yarn.lock')), rcBefore = await readFile(rcPath, 'utf8');
  const result = await runWorkflow(config(project), join(base, `${layout}-run`), { log: console.log, prepare: async () => tools, publish: async sbom => console.log(`Local artifact adapter received ${sbom.componentCount} validated components; live Agent publication not tested.`) });
  const bom = JSON.parse(await readFile(result.path, 'utf8'));
  for (const name of ['is-odd', 'is-number']) if (!bom.components.some(component => component.name === name)) throw new Error(`${layout} missing ${name}`);
  for (const name of ['shared', 'web-product']) if (!bom.components.some(component => component.name === name && component.group === '@example')) throw new Error(`${layout} missing workspace ${name}`);
  const chalk = bom.components.find(component => component.name === 'chalk');
  if (chalk && chalk.scope !== 'required') throw new Error(`${layout} retained a non-required development component`);
  console.log(`${layout}: workspace dev-only chalk ${chalk ? 'retained because cdxgen marked it required' : 'excluded by cdxgen required scope'}.`);
  if (!bom.dependencies?.some(dependency => dependency.dependsOn?.length)) throw new Error(`${layout} graph empty`);
  for (const [from, to] of [['pkg:npm/@example/web-product@1.0.0', 'pkg:npm/@example/shared@1.0.0'], ['pkg:npm/@example/shared@1.0.0', 'pkg:npm/is-odd@3.0.1'], ['pkg:npm/is-odd@3.0.1', 'pkg:npm/is-number@6.0.0']]) {
    if (!bom.dependencies.some(dependency => dependency.ref === from && dependency.dependsOn?.includes(to))) throw new Error(`${layout} expected workspace/transitive edge missing`);
  }
  if (before !== await digest(join(project, 'yarn.lock')) || rcBefore !== await readFile(rcPath, 'utf8')) throw new Error(`${layout} lock/config changed`);
  if (!await exists(join(project, 'install-marker.txt'))) throw new Error(`${layout} project install script did not run`);
  if (!await exists(join(project, modern && layout === 'modern-pnp' ? '.pnp.cjs' : 'node_modules'))) throw new Error(`${layout} installation layout missing`);
  await runProcess({ executable: tools.node, args: [...(layout === 'modern-pnp' ? ['--require', join(project, '.pnp.cjs')] : []), join(project, 'packages/web/index.js')], cwd: project, env: tools.env });
  const manifestPath = join(project, 'packages/web/package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, dependencies: { ...manifest.dependencies, 'left-pad': '1.3.0' } }));
  let failed = false;
  try { await javascriptInstaller.install(project, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY }); } catch { failed = true; }
  if (!failed || before !== await digest(join(project, 'yarn.lock'))) throw new Error(`${layout} stale manifest was not rejected unchanged`);
  await writeFile(manifestPath, JSON.stringify(manifest));
  console.log(`${layout.toUpperCase()} PASS: ${bom.components.length} components; dependencies/graph, observed required scope, scripts, runtime layout, strict failure and unchanged lock/config.`);
}

// Reuse a verified distributed bundle to exercise repository yarnPath selection.
{
  const project = join(base, 'modern-pnp'), rc = join(project, '.yarnrc.yml');
  await withPackageManager(await inspectJavaScriptProject(project), tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY }, async command => {
    await cp(command.args[0], join(base, 'local-yarn.cjs'));
  });
  await writeFile(rc, `${await readFile(rc, 'utf8')}\nyarnPath: ${JSON.stringify(join(base, 'local-yarn.cjs').replaceAll('\\', '/'))}\n`);
  await javascriptInstaller.install(project, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY, log: console.log });
  console.log('YARNPATH PASS: repository selected binary version and hash verified, immutable install succeeded.');
}
