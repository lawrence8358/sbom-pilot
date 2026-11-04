import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';
import JSZip from 'jszip';
import { hash, readJson, writeJson, filesAt, snapshot, verifyBuild, packagingConfig } from './packaging-state.mjs';

/** 展開 manifest 實際會分發的檔案，供封裝及交付再次核對每個位元組。 */
async function payloadFiles(manifest) {
  const paths = [...manifest.files.map(item => item.path), ...Object.values(manifest.content).map(item => item.path), ...Object.values(manifest.icons)];
  return [...new Set((await Promise.all(paths.map(filesAt))).flat())].sort();
}

/** 真正檢查archive的payload、identity/public、原生Task與所有Markdown相對連結。 */
export async function verifyArchive(path, manifest) {
  const zip = await JSZip.loadAsync(await readFile(path));
  for (const file of await payloadFiles(manifest)) {
    assert.ok(zip.file(file), `VSIX缺少${file}`);
    assert.equal(hash(await zip.file(file).async('nodebuffer')), hash(await readFile(file)), `VSIX內容不符目前輸入：${file}`);
  }
  const xml = await zip.file('extension.vsixmanifest').async('string');
  const identity = xml.match(/<Identity\b[^>]*>/)?.[0] ?? '';
  for (const [name, value] of Object.entries({ Publisher: manifest.publisher, Id: manifest.id, Version: manifest.version })) assert.ok(identity.includes(`${name}="${value}"`), `VSIX ${name} 不符。`);
  const flags = xml.match(/<GalleryFlags>([^<]*)<\/GalleryFlags>/)?.[1] ?? '';
  assert.equal(flags.split(/\s+/).includes('Public'), manifest.public, 'VSIX public狀態不符。');
  const vso = JSON.parse(await zip.file('extension.vsomanifest').async('string'));
  assert.deepEqual(vso.contributions, manifest.contributions);
  assert.deepEqual(vso.scopes, manifest.scopes ?? []);
  assert.deepEqual(vso.repository, manifest.repository);
  assert.ok((await zip.file('dist/icon.png').async('nodebuffer')).equals(await zip.file(manifest.icons.default).async('nodebuffer')));
  for (const [name, entry] of Object.entries(zip.files)) {
    assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), 'VSIX路徑不安全。');
    if (entry.dir || name.startsWith('dist/') || !name.endsWith('.md')) continue;
    for (const match of (await entry.async('string')).matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^[a-z][a-z\d+.-]*:|^\/\//i.test(link)) continue;
      const target = posix.normalize(posix.join(posix.dirname(name), decodeURIComponent(link)));
      assert.ok(zip.files[target], `VSIX連結失效：${name} → ${target}`);
    }
  }
  return zip;
}

/** 建立本機VSIX與來源收據；不包含上傳、分享或公開操作。 */
export async function packageExtension(options = {}) {
  const { manifest, mode } = await packagingConfig(options);
  const build = await verifyBuild();
  if (mode !== 'preview') {
    const inventory = await readJson('dist/licenses/manifest.json');
    if (inventory.some(item => item.upstreamNoticeMissing)) throw new Error('正式打包仍有上游 runtime 授權告示待確認，請先處理 dist/licenses/manifest.json 中的 upstreamNoticeMissing。');
  }
  const output = options.output ?? 'packages';
  await mkdir(output, { recursive: true });
  const temporary = '.packaging-manifest.json';
  await writeFile(temporary, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, ['node_modules/tfx-cli/_build/tfx-cli.js', 'extension', 'create', '--manifest-globs', temporary, '--output-path', output, '--no-prompt'], { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('本機 tfx 建立VSIX失敗。', { cause: result.error });
  } finally { await rm(temporary); }
  await verifyBuild();
  const vsix = join(output, `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`);
  await verifyArchive(vsix, manifest);
  const receipt = { schemaVersion: 1, mode, manifest, sources: build.sources, dist: build.dist, vsix: { file: vsix.replaceAll('\\', '/'), sha256: hash(await readFile(vsix)) } };
  const receiptPath = `${vsix}.provenance.json`;
  await writeJson(receiptPath, receipt);
  console.log(`PACKAGE ${mode}: ${vsix}`);
  return receiptPath;
}

/** 重新驗證身分、來源、dist、整個VSIX與payload；不接受僅同名存在的舊包。 */
async function matchingPackage(receiptPath, options) {
  const current = await packagingConfig(options);
  const receipt = await readJson(receiptPath);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.mode, current.mode, '封裝模式不符。');
  assert.deepEqual(receipt.manifest, current.manifest, '封裝身分／版本／manifest已變，請重新打包。');
  const build = await verifyBuild();
  assert.deepEqual(receipt.sources, build.sources, '封裝來源已變，請重新打包。');
  assert.deepEqual(receipt.dist, build.dist, '封裝dist已變，請重新打包。');
  assert.equal(hash(await readFile(receipt.vsix.file)), receipt.vsix.sha256, 'VSIX已被修改，請重新打包。');
  return { receipt, zip: await verifyArchive(receipt.vsix.file, current.manifest) };
}

/** 交付資料保留archive相對結構，包含有效manifest與雜湊，不執行遠端操作。 */
export async function createSubmission(receiptPath, options = {}) {
  if (options.local && !options.allowPreview) throw new Error('獨立submission只接受正式身分的匹配包；預覽請用packaging:preview。');
  const { receipt, zip } = await matchingPackage(receiptPath, options);
  const parent = join('packages', 'submission', receipt.mode);
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, `${receipt.manifest.publisher}.${receipt.manifest.id}-${receipt.manifest.version}-`));
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = join(output, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
  }
  const vsixName = posix.basename(receipt.vsix.file);
  const bytes = await readFile(receipt.vsix.file);
  assert.equal(hash(bytes), receipt.vsix.sha256, '整理期間VSIX已改動。');
  await writeFile(join(output, vsixName), bytes);
  await writeJson(join(output, 'vss-extension.json'), receipt.manifest);
  await writeJson(join(output, 'provenance.json'), receipt);
  await writeJson(join(output, 'listing.json'), {
    mode: receipt.mode, publisher: receipt.manifest.publisher, id: receipt.manifest.id, name: receipt.manifest.name, version: receipt.manifest.version, public: receipt.manifest.public,
    repository: receipt.manifest.repository?.uri ?? null, overview: receipt.manifest.content.details.path, icon: receipt.manifest.icons.default, hero: 'images/marketplace-hero.png',
    status: receipt.mode === 'preview' ? 'LOCAL PREVIEW ONLY — placeholder不可正式上架' : '僅本機準備，未上傳／未驗證Publisher權限或Repo公開性',
    unverified: ['Azure DevOps Services/Server 安裝、Classic/YAML、成品下載／非同步失敗傳播', 'arm64、企業feeds/Proxy/CA/client certificates'],
  });
  const files = await filesAt(output);
  const hashes = await snapshot(files);
  await writeFile(join(output, 'SHA256SUMS'), Object.entries(hashes).map(([file, digest]) => `${digest}  ${file.slice(output.length + 1).replaceAll('\\', '/')}`).join('\n') + '\n');
  console.log(`SUBMISSION ${receipt.mode}: ${output}`);
  return output;
}
