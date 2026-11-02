import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const check = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
// jsonc-parser's UMD entry passes require through a factory, hiding relative
// imports from the bundler. Its published ESM entry bundles those imports safely.
const bundled = await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: 'dist/index.js', external: ['azure-pipelines-task-lib', 'azure-pipelines-tool-lib'], alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' }, metafile: true });
await cp('src/task.json', 'dist/task.json');
await cp('src/schemas', 'dist/schemas', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await cp('THIRD-PARTY-NOTICES.md', 'dist/THIRD-PARTY-NOTICES.md');
await mkdir('dist/licenses', { recursive: true });
const bundledRoots = new Set(Object.keys(bundled.metafile.inputs).filter(path => path.startsWith('node_modules/')).map(path => {
  const parts = path.split('/');
  const offset = parts.lastIndexOf('node_modules');
  return parts.slice(0, offset + (parts[offset + 1].startsWith('@') ? 3 : 2)).join('/');
}));
const attributions = [];
for (const source of bundledRoots) {
  const pkg = JSON.parse(await readFile(`${source}/package.json`, 'utf8'));
  const license = (await readdir(source)).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
  const licenseFile = license ?? ((await readFile(`${source}/README.md`, 'utf8')).includes('Permission is hereby granted') ? 'README.md' : undefined);
  if (!licenseFile) throw new Error(`License missing for ${source}`);
  await cp(`${source}/${licenseFile}`, `dist/licenses/${source.replaceAll('/', '_')}.txt`);
  attributions.push({ name: pkg.name, version: pkg.version, license: pkg.license, kind: 'bundled', licenseFile: `licenses/${source.replaceAll('/', '_')}.txt` });
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
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.name.startsWith('@')) { await inventory(path); continue; }
    let pkg;
    try { pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8')); } catch { continue; }
    const files = await readdir(path);
    const license = files.find(file => /^licen[sc]e(?:\.|$)/i.test(file));
    const readmeLicense = !license && files.includes('README.md') && (await readFile(`${path}/README.md`, 'utf8')).includes('Permission is hereby granted');
    if (!license && !readmeLicense) throw new Error(`External runtime license missing: ${pkg.name}`);
    attributions.push({ name: pkg.name, version: pkg.version, license: pkg.license, kind: 'external', licenseFile: `${path.replace(/^dist\//, '')}/${license || 'README.md'}` });
    if (files.includes('node_modules')) await inventory(`${path}/node_modules`);
  }
}
await inventory('dist/node_modules');
await writeFile('dist/licenses/manifest.json', JSON.stringify(attributions.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), null, 2));
