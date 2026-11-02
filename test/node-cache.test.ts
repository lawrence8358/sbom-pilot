import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireNodeCache, nodePaths, validateNodeTar } from '../src/node-cache';

test('Node cache publishes complete verified tools atomically under concurrent writers and reuses them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilot-cache-'));
  const options = { directory, version: '24.22.2', arch: 'x64' };
  let arrivals = 0, release!: () => void;
  const barrier = new Promise<void>(done => { release = done; });
  const populate = async (stage: string) => {
    for (const file of Object.values(nodePaths(stage))) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, 'verified'); }
    if (++arrivals === 2) release();
    await barrier;
  };
  const verify = async (root: string) => { assert.equal(await readFile(nodePaths(root).node, 'utf8'), 'verified'); };
  try {
    const roots = await Promise.all([acquireNodeCache(options, populate, verify), acquireNodeCache(options, populate, verify)]);
    assert.equal(roots[0], roots[1]);
    assert.equal(await acquireNodeCache(options, async () => { assert.fail('Warm cache downloaded again'); }, verify), roots[0]);
    assert.deepEqual((await readdir(dirname(roots[0]))).sort(), ['x64']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Node cache never publishes verification failure or trusts incomplete destinations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilot-cache-'));
  const options = { directory, version: '24.22.2', arch: 'x64' };
  try {
    await assert.rejects(acquireNodeCache(options, async () => {}, async () => { throw new Error('Bad version'); }), /Bad version/);
    const parent = join(directory, 'sbom-pilot-node', options.version);
    assert.deepEqual(await readdir(parent), []);
    await mkdir(join(parent, 'x64')); await writeFile(join(parent, 'x64', 'partial'), 'preserve');
    await assert.rejects(acquireNodeCache(options, async () => { assert.fail(); }, async () => {}), /不完整/);
    assert.equal(await readFile(join(parent, 'x64', 'partial'), 'utf8'), 'preserve');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function tarEntry(name: string, type = '0', link = '') {
  const data = Buffer.alloc(512); data.write(name); data.write('00000000000\0', 124); data.write(type, 156); data.write(link, 157); return data;
}
test('Node tar accepts distribution-local npm links, rejects traversal, escaping links and writes below links', () => {
  const folder = 'node-v24.22.2-linux-x64';
  assert.doesNotThrow(() => validateNodeTar(Buffer.concat([tarEntry(`${folder}/bin/node`), tarEntry(`${folder}/bin/npm`, '2', '../lib/node_modules/npm/bin/npm-cli.js')]), folder));
  for (const entries of [
    [tarEntry(`${folder}/../escape`)], [tarEntry('/absolute')],
    [tarEntry(`${folder}/bin/npm`, '2', '../../../outside')],
    [tarEntry(`${folder}/alias`, '2', 'bin'), tarEntry(`${folder}/alias/node`)],
    [tarEntry(`${folder}/device`, '3')],
  ]) assert.throws(() => validateNodeTar(Buffer.concat(entries), folder));
});
