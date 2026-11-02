import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const compiled = spawnSync(process.execPath, ['scripts/test.mjs'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const base = resolve('.smoke/pnpm');
process.env.AGENT_TOOLSDIRECTORY = resolve('.smoke/cache');
process.env.AGENT_TEMPDIRECTORY = join(base, 'temp');
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
const { prepareTools } = await import('../.test-build/src/tools.js');
const { runProcess } = await import('../.test-build/src/process.js');
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { withPackageManager } = await import('../.test-build/src/install/manager.js');
const { javascriptInstaller } = await import('../.test-build/src/install/javascript.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const tools = await prepareTools({ nodeVersion: '24.x', cdxgenVersion: '13.6.0', tempDirectory: process.env.AGENT_TEMPDIRECTORY }, runProcess, console.log);
const config = root => ({ environment: 'vue', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: false, noCache: true, uploadToDt: false });
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const publish = async sbom => console.log(`Local artifact adapter: validated ${sbom.componentCount} components; live Agent publication not tested.`);

const workspace = join(base, 'workspace-product');
await cp('examples/pnpm-workspace', workspace, { recursive: true });
const lockPath = join(workspace, 'pnpm-lock.yaml');
const before = await digest(lockPath);
const result = await runWorkflow(config(workspace), join(base, 'workspace-run'), { log: console.log, prepare: async () => tools, publish });
const bom = JSON.parse(await readFile(result.path, 'utf8'));
for (const name of ['vue', 'lodash']) {
  if (!bom.components.some(component => component.name === name)) throw new Error(`Workspace BOM missing ${name}`);
}
if (!bom.metadata?.component?.components?.some(component => component.group === '@example' && component.name === 'shared')) throw new Error('Workspace shared application missing');
if (bom.components.some(component => component.name === 'chalk')) throw new Error('Dev-only chalk unexpectedly included');
if (!bom.dependencies?.some(dependency => dependency.dependsOn?.length)) throw new Error('Workspace graph has no edges');
if (before !== await digest(lockPath)) throw new Error('Workspace lock changed');
const manifestPath = join(workspace, 'packages/web/package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(manifestPath, JSON.stringify({ ...manifest, dependencies: { ...manifest.dependencies, 'is-number': '7.0.0' } }));
let failed = false;
try { await javascriptInstaller.install(workspace, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY }); } catch { failed = true; }
if (!failed || before !== await digest(lockPath)) throw new Error('Stale workspace lock did not fail unchanged');
console.log(`WORKSPACE PASS: ${bom.components.length} components, Vue/lodash/shared present, chalk excluded, dependency edges present; stale manifest rejected, lock unchanged.`);

// A fresh standalone fixture validates the pnpm 12 native executable path.
const standalone = join(base, 'native-product');
await mkdir(standalone, { recursive: true });
const nativeIntegrity = JSON.parse((await runProcess({ executable: tools.node, args: [tools.npmCli, 'view', 'pnpm@12.16.1', 'dist.integrity', '--json'], cwd: process.env.AGENT_TEMPDIRECTORY, env: tools.env })).stdout);
if (!nativeIntegrity.startsWith('sha512-')) throw new Error('Unexpected pnpm registry integrity');
const nativeHash = Buffer.from(nativeIntegrity.slice(7), 'base64').toString('hex');
await writeFile(join(standalone, 'package.json'), JSON.stringify({ name: 'example-native-pnpm-product', version: '1.0.0', private: true, packageManager: `pnpm@12.16.1+sha512.${nativeHash}`, dependencies: { 'is-number': '7.0.0' } }));
await writeFile(join(standalone, 'index.js'), "const isNumber = require('is-number'); console.log(isNumber(1));\n");
await withPackageManager({ root: standalone, manager: 'pnpm', version: '12.16.1', reason: 'declaration', lockPath: join(standalone, 'pnpm-lock.yaml') }, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY, log: console.log }, async command => {
  // Fixture authoring only; the Task itself always uses frozen installation.
  await runProcess({ executable: command.executable, args: [...command.args, 'install', '--lockfile-only'], cwd: standalone, env: tools.env });
});
const nativeBefore = await digest(join(standalone, 'pnpm-lock.yaml'));
const nativeResult = await runWorkflow(config(standalone), join(base, 'native-run'), { log: console.log, prepare: async () => tools, publish });
const nativeBom = JSON.parse(await readFile(nativeResult.path, 'utf8'));
if (!nativeBom.components.some(component => component.name === 'is-number') || nativeBefore !== await digest(join(standalone, 'pnpm-lock.yaml'))) throw new Error('Native pnpm dependency missing or lock changed');
console.log('NATIVE PNPM PASS: 12.16.1 hash verified, installed and scanned standalone dependency, lock unchanged.');

const npmRoot = join(base, 'declared-npm-product');
await mkdir(npmRoot, { recursive: true });
await writeFile(join(npmRoot, 'package.json'), '{"name":"example-declared-npm-product","version":"1.0.0","packageManager":"npm@10.9.2"}');
await writeFile(join(npmRoot, 'package-lock.json'), JSON.stringify({ name: 'example-declared-npm-product', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'example-declared-npm-product', version: '1.0.0' } } }));
await javascriptInstaller.install(npmRoot, tools, runProcess, { tempDirectory: process.env.AGENT_TEMPDIRECTORY, log: console.log });
console.log('DECLARED NPM PASS: npm 10.9.2 prepared independently of bundled npm and ran strict ci.');
