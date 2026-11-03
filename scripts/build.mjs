import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const check = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
// jsonc-parser's UMD entry passes require through a factory, hiding relative
// imports from the bundler. Its published ESM entry bundles those imports safely.
const bundled = await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: 'dist/index.js', external: ['azure-pipelines-task-lib'], alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' }, metafile: true });
// Keep the real SDK entry in its own package directory: __dirname and resource
// lookup retain SDK semantics. Bundle its proven runtime closure, excluding the
// unused mock-test harness and its downloader dependency, rather than stubbing it.
const sdkRoot = 'dist/node_modules/azure-pipelines-task-lib';
await mkdir(sdkRoot, { recursive: true });
for (const entry of await readdir('node_modules/azure-pipelines-task-lib', { withFileTypes: true })) {
  if (entry.name === 'node_modules' || /\.(?:js|ts)$/.test(entry.name)) continue;
  await cp(`node_modules/azure-pipelines-task-lib/${entry.name}`, `${sdkRoot}/${entry.name}`, { recursive: true });
}
const sdk = await build({ entryPoints: ['node_modules/azure-pipelines-task-lib/task.js'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: `${sdkRoot}/task.js`, metafile: true });
// Every literal import must resolve to a Node builtin or into this bundle. The
// SDK's remaining dynamic require loads user-specified resource JSON only.
const { isBuiltin } = await import('node:module');
for (const output of Object.values(sdk.metafile.outputs)) for (const dependency of output.imports) {
  if (!dependency.external || !isBuiltin(dependency.path)) throw new Error(`Unexpected SDK runtime import: ${dependency.path}`);
}
await cp('src/task.json', 'dist/task.json');
await cp('src/schemas', 'dist/schemas', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await cp('THIRD-PARTY-NOTICES.md', 'dist/THIRD-PARTY-NOTICES.md');
await mkdir('dist/licenses', { recursive: true });
const bundledRoots = new Set([...Object.keys(bundled.metafile.inputs), ...Object.keys(sdk.metafile.inputs)].filter(path => path.startsWith('node_modules/')).map(path => {
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
await writeFile('dist/licenses/manifest.json', JSON.stringify(attributions.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), null, 2));
await writeFile('dist/licenses/runtime-inputs.json', JSON.stringify({ handler: Object.keys(bundled.metafile.inputs), sdk: Object.keys(sdk.metafile.inputs) }, null, 2));
