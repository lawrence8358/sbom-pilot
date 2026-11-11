import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
// npm test compiles the testable modules and places the pinned schemas beside them.
const compiled = spawnSync(process.execPath, ['scripts/test.mjs'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const root = resolve('.smoke');
process.env.AGENT_TOOLSDIRECTORY = join(root, 'cache');
process.env.AGENT_TEMPDIRECTORY = join(root, 'temp');
await mkdir(process.env.AGENT_TEMPDIRECTORY, { recursive: true });
await mkdir(process.env.AGENT_TOOLSDIRECTORY, { recursive: true });
const { runWorkflow } = await import('../.test-build/src/workflow.js');
const { runProcess } = await import('../.test-build/src/process.js');
const { DEFAULT_EXCLUDES, parseExcludes } = await import('../.test-build/src/config.js');
const project = join(root, 'vue-product');
await mkdir(project, { recursive: true });
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'example-vue-product', version: '1.0.0', private: true, dependencies: { vue: '3.5.13' }, devDependencies: { chalk: '5.3.0' } }, null, 2));
await writeFile(join(project, 'main.js'), "import { createApp } from 'vue'; createApp({});\n");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run test:smoke');
await runProcess({ executable: process.execPath, args: [npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: project });
const lockPath = join(project, 'package-lock.json');
const hash = async () => createHash('sha256').update(await readFile(lockPath)).digest('hex');
const before = await hash();
const result = await runWorkflow({ environment: 'vue', projectPath: project, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: parseExcludes(DEFAULT_EXCLUDES), fetchLicense: true, noCache: true, runOsv: false, uploadToDt: false }, join(root, 'run'), {
  log: console.log,
  publishTabReport: async () => {},
  publish: async sbom => { console.log(`Local artifact adapter received validated SBOM (${sbom.componentCount} components). Live Agent publication not tested here.`); },
});
if (before !== await hash()) throw new Error('Lockfile changed');
const bom = JSON.parse(await readFile(result.path, 'utf8'));
if (!bom.components.some(component => component.name === 'vue')) throw new Error('Vue missing from BOM');
if (bom.components.some(component => component.name === 'chalk')) throw new Error('Dev-only chalk unexpectedly included');
console.log(`SMOKE PASS ${result.path}; Vue present, dev-only chalk excluded, lockfile unchanged.`);
