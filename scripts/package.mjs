import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateReleaseIdentity } from './release-identity.mjs';

const local = process.argv.includes('--local');
const manifest = JSON.parse(await readFile('vss-extension.json', 'utf8'));
const publisher = process.env.SBOM_PILOT_PUBLISHER;
const repository = process.env.SBOM_PILOT_REPOSITORY_URL;
const identity = local ? undefined : validateReleaseIdentity(publisher, repository);
if (!local) {
  const inventory = JSON.parse(await readFile('dist/licenses/manifest.json', 'utf8'));
  if (inventory.some(item => item.upstreamNoticeMissing)) throw new Error('正式打包仍有上游 runtime 授權告示待確認，請先處理 dist/licenses/manifest.json 中的 upstreamNoticeMissing。');
}
manifest.publisher = local ? 'local-dev-placeholder' : publisher;
manifest.public = !local;
if (local) manifest.name += ' (Local Development)';
else manifest.repository = { type: 'git', uri: identity.repository };
await mkdir('packages', { recursive: true });
const path = '.packaging-manifest.json';
await writeFile(path, JSON.stringify(manifest, null, 2));
try {
  const result = spawnSync(process.execPath, ['node_modules/tfx-cli/_build/tfx-cli.js', 'extension', 'create', '--manifest-globs', path, '--output-path', 'packages', '--no-prompt'], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally { await rm(path, { force: true }); }
