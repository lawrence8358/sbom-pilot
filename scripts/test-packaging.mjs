import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { hash, PACKAGING_SOURCE_ROOTS } from './packaging-state.mjs';

/** 真正執行CLI於隔離的合成身分fixture；不使用或覆寫工作目錄的正式產物。 */
test('Marketplace CLI creates private/public bundles and rejects stale, mismatched and tampered packages', { timeout: 180_000 }, async () => {
  await mkdir('.smoke', { recursive: true });
  const fixture = await mkdtemp(resolve('.smoke', 'marketplace-SYNTHETIC-'));
  const sourceRoots = [...PACKAGING_SOURCE_ROOTS, 'node_modules'];
  for (const path of sourceRoots) await cp(path, join(fixture, path), { recursive: true });
  await writeFile(join(fixture, 'SYNTHETIC-FIXTURE.txt'), '僅供包裝測試：Publisher與Repo皆為合成字串，不可當正式交付或上傳。\n');
  const env = { ...process.env, SBOM_PILOT_PUBLISHER: 'sbom-fixture-only', SBOM_PILOT_REPOSITORY_URL: 'https://github.com/sbom-fixture-only/synthetic-never-publish' };
  const run = (args, success = true, environment = env) => {
    const result = spawnSync(process.execPath, args, { cwd: fixture, env: environment, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.error, undefined);
    if (success) assert.equal(result.status, 0, result.stderr + result.stdout);
    else assert.notEqual(result.status, 0, '原應拒絕此包裝輸入。');
    return result;
  };
  const rejected = run(['scripts/packaging.mjs', 'package'], false, { ...env, SBOM_PILOT_PUBLISHER: '', SBOM_PILOT_REPOSITORY_URL: '' });
  assert.match(rejected.stderr, /正式打包需設定實際/);
  assert.ok(!(await readdir(fixture)).includes('dist'), '身分失敗應早於build。');
  run(['scripts/packaging.mjs', 'package', '--private']);
  const privatePath = join(fixture, 'packages/private/sbom-fixture-only.sbom-pilot-0.1.0.vsix');
  const privateBytes = await readFile(privatePath);
  const privateZip = await JSZip.loadAsync(privateBytes);
  const privateXml = await privateZip.file('extension.vsixmanifest').async('string');
  assert.match(privateXml, /Publisher="sbom-fixture-only"/);
  assert.doesNotMatch(privateXml.match(/<GalleryFlags>([^<]*)<\/GalleryFlags>/)?.[1] ?? '', /Public/);
  const bundle = join(fixture, 'packages/submission/private', (await readdir(join(fixture, 'packages/submission/private')))[0]);
  const listing = JSON.parse(await readFile(join(bundle, 'listing.json'), 'utf8'));
  assert.equal(listing.public, false);
  assert.equal(listing.mode, 'private');
  assert.equal(JSON.parse(await readFile(join(bundle, 'vss-extension.json'), 'utf8')).publisher, listing.publisher);
  for (const line of (await readFile(join(bundle, 'SHA256SUMS'), 'utf8')).trim().split('\n')) {
    const [digest, path] = line.split('  ');
    assert.equal(hash(await readFile(join(bundle, path))), digest, `交付SHA256不符：${path}`);
  }
  for (const path of ['src/command-log.ts', 'scripts/build.mjs', 'package-lock.json', 'vss-extension.json', 'docs/marketplace.md', 'images/extension-icon.png', 'marketplace/overview.md', 'dist/index.js']) {
    const target = join(fixture, path), original = await readFile(target);
    await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
    run(['scripts/packaging.mjs', 'submission', '--private'], false);
    await writeFile(target, original);
  }
  await writeFile(privatePath, Buffer.concat([privateBytes, Buffer.from('tamper')]));
  const tamper = run(['scripts/packaging.mjs', 'submission', '--private'], false);
  assert.match(tamper.stderr, /VSIX已被修改/);
  await writeFile(privatePath, privateBytes);
  run(['scripts/packaging.mjs', 'submission', '--private']);
  // 新build本身有效，也不能把其來源收據套給之前的VSIX。
  const readme = join(fixture, 'README.md'), readmeBytes = await readFile(readme);
  await writeFile(readme, Buffer.concat([readmeBytes, Buffer.from('\n')]));
  run(['scripts/build.mjs']);
  const stalePackage = run(['scripts/packaging.mjs', 'submission', '--private'], false);
  assert.match(stalePackage.stderr, /封裝來源已變/);
  await writeFile(readme, readmeBytes);
  run(['scripts/build.mjs']);
  // 即使sidecar的VSIX hash被一併改寫，archive實際payload仍須匹配來源。
  const receiptPath = `${privatePath}.provenance.json`, receiptBytes = await readFile(receiptPath);
  const tamperedZip = await JSZip.loadAsync(privateBytes);
  tamperedZip.file('marketplace/overview.md', 'tampered overview');
  const tamperedBytes = await tamperedZip.generateAsync({ type: 'nodebuffer' });
  const tamperedReceipt = JSON.parse(receiptBytes.toString());
  tamperedReceipt.vsix.sha256 = hash(tamperedBytes);
  await writeFile(privatePath, tamperedBytes);
  await writeFile(receiptPath, JSON.stringify(tamperedReceipt));
  const payloadMismatch = run(['scripts/packaging.mjs', 'submission', '--private'], false);
  assert.match(payloadMismatch.stderr, /VSIX內容不符目前輸入/);
  await writeFile(privatePath, privateBytes);
  await writeFile(receiptPath, receiptBytes);
  run(['scripts/packaging.mjs', 'submission'], false);
  run(['scripts/packaging.mjs', 'submission', '--preview'], false);
  run(['scripts/packaging.mjs', 'package']);
  const publicPath = join(fixture, 'packages/public/sbom-fixture-only.sbom-pilot-0.1.0.vsix');
  const publicZip = await JSZip.loadAsync(await readFile(publicPath));
  assert.match(await publicZip.file('extension.vsixmanifest').async('string'), /<GalleryFlags>[^<]*Public/);
  const publicReceipt = JSON.parse(await readFile(`${publicPath}.provenance.json`, 'utf8'));
  assert.equal(publicReceipt.manifest.public, true);
  assert.equal(publicReceipt.manifest.repository.uri, env.SBOM_PILOT_REPOSITORY_URL);
  run(['scripts/packaging.mjs', 'submission']);
  // 同名檔仍存在，但另一模式的收據不可當作目前public包。
  const publicReceiptBytes = await readFile(`${publicPath}.provenance.json`);
  await cp(`${privatePath}.provenance.json`, `${publicPath}.provenance.json`);
  const mismatch = run(['scripts/packaging.mjs', 'submission'], false);
  assert.match(mismatch.stderr, /封裝模式不符/);
  await writeFile(`${publicPath}.provenance.json`, publicReceiptBytes);
  const generated = await publicZip.file('extension.vsomanifest').async('string');
  assert.deepEqual(JSON.parse(generated).scopes, []);
  console.log(`SYNTHETIC FIXTURE ONLY: ${fixture}`);
});
