import { build } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const check = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const bundled = await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: 'dist/index.js', external: ['azure-pipelines-task-lib', 'azure-pipelines-tool-lib'], metafile: true });
await cp('src/task.json', 'dist/task.json');
await cp('src/schemas', 'dist/schemas', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await cp('THIRD-PARTY-NOTICES.md', 'dist/THIRD-PARTY-NOTICES.md');
await mkdir('dist/licenses', { recursive: true });
const bundledRoots = new Set(Object.keys(bundled.metafile.inputs).filter(path => path.startsWith('node_modules/')).map(path => {
  const parts = path.split('/');
  return parts.slice(0, parts[1].startsWith('@') ? 3 : 2).join('/');
}));
for (const source of bundledRoots) {
  const { readdir } = await import('node:fs/promises');
  const license = (await readdir(source)).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
  const licenseFile = license ?? ((await readFile(`${source}/README.md`, 'utf8')).includes('Permission is hereby granted') ? 'README.md' : undefined);
  if (!licenseFile) throw new Error(`License missing for ${source}`);
  await cp(`${source}/${licenseFile}`, `dist/licenses/${source.replaceAll('/', '_')}.txt`);
}
// Azure SDKs load resource files and platform helpers at runtime. Preserve their
// complete production dependency tree rather than flattening away those assets.
const copied = new Set();
async function copyDependency(name) {
  if (copied.has(name)) return;
  copied.add(name);
  const root = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  await cp(root, `dist/node_modules/${name}`, { recursive: true });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyDependency(dependency);
}
await copyDependency('azure-pipelines-task-lib');
await copyDependency('azure-pipelines-tool-lib');
