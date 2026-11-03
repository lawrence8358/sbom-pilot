import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireNodeCache, extractNodeArchive, nodePaths, validateNodeTar } from '../src/node-cache';
import { runProcess } from '../src/process';
import { gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import fs = require('node:fs/promises');

async function populateNode(root: string): Promise<void> {
  for (const file of Object.values(nodePaths(root))) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'verified');
  }
}

test('initial cache read racing atomic publication rechecks and verifies the complete new-format winner', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pilot-initial-race-'));
  const options = { directory, version: '24.22.2', arch: 'x64' };
  const root = join(directory, 'sbom-pilot-node', options.version, options.arch);
  const originalRead = fs.readFile;
  let raced = false, verified = 0;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (!raced && String(args[0]) === join(root, '.sbom-pilot-complete.json')) {
      raced = true;
      await populateNode(root);
      await writeFile(join(root, '.sbom-pilot-complete.json'), JSON.stringify({ version: options.version, arch: options.arch, platform: process.platform }));
      throw Object.assign(new Error('Read began before winner publication'), { code: 'ENOENT' });
    }
    return originalRead(...args);
  });
  try {
    const result = await acquireNodeCache(options, async () => assert.fail('Complete winner must be reused'), async path => {
      assert.equal(path, root); assert.equal(await readFile(nodePaths(path).node, 'utf8'), 'verified'); verified++;
    });
    assert.equal(result, root); assert.equal(verified, 1); assert.ok(raced);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Windows publication retries transient locks and stops after five attempts on permanent failure', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  const directory = await mkdtemp(join(tmpdir(), 'pilot-rename-'));
  const originalRename = fs.rename;
  let attempts = 0, permanent = false;
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    attempts++;
    if (permanent || attempts < 3) throw Object.assign(new Error('Synthetic Windows lock'), { code: 'EPERM' });
    return originalRename(...args);
  });
  try {
    const options = { directory, version: '24.22.2', arch: 'x64' };
    const root = await acquireNodeCache(options, populateNode, async path => { assert.equal(await readFile(nodePaths(path).node, 'utf8'), 'verified'); });
    assert.equal(attempts, 3); assert.ok(await readFile(join(root, '.sbom-pilot-complete.json')));
    permanent = true; attempts = 0;
    const failed = { ...options, version: '24.22.3' };
    await assert.rejects(acquireNodeCache(failed, populateNode, async () => {}), (error: NodeJS.ErrnoException) => error.code === 'EPERM');
    assert.equal(attempts, 5);
    assert.deepEqual(await readdir(join(directory, 'sbom-pilot-node', failed.version)), []);
    assert.equal(await readFile(nodePaths(root).node, 'utf8'), 'verified');
  } finally { Object.defineProperty(process, 'platform', descriptor); await rm(directory, { recursive: true, force: true }); }
});

test('publication never retries over an incomplete destination created by another writer', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pilot-occupied-'));
  let attempts = 0;
  t.mock.method(fs, 'rename', async (_stage: Parameters<typeof fs.rename>[0], destination: Parameters<typeof fs.rename>[1]) => {
    attempts++; await mkdir(destination); await writeFile(join(String(destination), 'partial'), 'other writer');
    throw Object.assign(new Error('Occupied'), { code: 'EPERM' });
  });
  try {
    const options = { directory, version: '24.22.2', arch: 'x64' };
    await assert.rejects(acquireNodeCache(options, populateNode, async () => {}));
    const parent = join(directory, 'sbom-pilot-node', options.version);
    assert.equal(attempts, 1); assert.deepEqual(await readdir(parent), ['x64']);
    assert.equal(await readFile(join(parent, 'x64', 'partial'), 'utf8'), 'other writer');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
    [tarEntry(`${folder}/alias`, '2', '.'), tarEntry(`${folder}/second`, '2', 'alias/../escape')],
    [tarEntry(`${folder}/device`, '3')],
  ]) assert.throws(() => validateNodeTar(Buffer.concat(entries), folder));
});

test('native extraction rejects traversal before any file escapes the staging directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilot-extract-')), folder = 'node-v24.22.2-linux-x64';
  try {
    const zip = new JSZip(); zip.file(`${folder}/../escape.txt`, 'unsafe');
    const bytes = process.platform === 'win32' ? await zip.generateAsync({ type: 'nodebuffer' }) : gzipSync(tarEntry(`${folder}/../escape.txt`));
    const archive = join(root, process.platform === 'win32' ? 'unsafe.zip' : 'unsafe.tar.gz'); await writeFile(archive, bytes);
    await assert.rejects(extractNodeArchive(archive, bytes, join(root, 'stage'), folder, root, runProcess));
    assert.deepEqual((await readdir(root)).sort(), ['stage', process.platform === 'win32' ? 'unsafe.zip' : 'unsafe.tar.gz'].sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});
