import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateReleaseIdentity } from './release-identity.mjs';

// 建置快照與隔離CLI fixture共用來源輸入；fixture另加自己的工具相依。
export const PACKAGING_SOURCE_ROOTS = ['src', 'scripts', 'test', 'docs', 'examples', 'images', 'marketplace', 'package.json', 'package-lock.json', 'tsconfig.json', 'vss-extension.json', 'README.md', 'README-Dev.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', '.gitattributes', '.gitignore'];

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

/** 只遍歷實體檔案；新增、刪除及內容更動都會改變快照，不追蹤外部連結。 */
export async function filesAt(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`包裝輸入不可是符號連結：${path}`);
  if (info.isFile()) return [path.replaceAll('\\', '/')];
  if (!info.isDirectory()) throw new Error(`包裝輸入不是一般檔案：${path}`);
  const nested = await Promise.all((await readdir(path)).sort().map(name => filesAt(join(path, name))));
  return nested.flat();
}

/** 以檔名及位元組雜湊記錄建置／文件／素材輸入，排除產物與本機派工紀錄。 */
export async function sourceSnapshot() {
  return snapshot((await Promise.all(PACKAGING_SOURCE_ROOTS.map(filesAt))).flat());
}

export async function snapshot(files) {
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async path => [path, hash(await readFile(path))])));
}

export const distSnapshot = async () => snapshot(await filesAt('dist'));

/** 建置前後來源必須一致；此收據把目前 dist 與實際建置來源綁定。 */
export async function recordBuild(sources) {
  assert.deepEqual(await sourceSnapshot(), sources, '建置期間來源已更動，請重新 build。');
  await mkdir('packages', { recursive: true });
  await writeJson('packages/build-provenance.json', { schemaVersion: 1, sources, dist: await distSnapshot() });
}

/** 不能用舊 build 搭配新文件／程式或修改過的 dist 產生正式封裝。 */
export async function verifyBuild() {
  const receipt = await readJson('packages/build-provenance.json').catch(() => { throw new Error('缺少建置收據，請先 npm run build。'); });
  assert.equal(receipt.schemaVersion, 1, '不支援的建置收據。');
  assert.deepEqual(await sourceSnapshot(), receipt.sources, '來源已更動，請重新 build。');
  assert.deepEqual(await distSnapshot(), receipt.dist, 'dist 已更動，請重新 build。');
  return receipt;
}

/** 檢查實際 PNG、最小尺寸及指定的檔案上限；橫幅不套用圖示大小限制。 */
export async function pngSize(path, maxBytes = Infinity) {
  const bytes = await readFile(path);
  assert.ok(bytes.length <= maxBytes, `PNG 超過 ${maxBytes / 1024} KB 上限：${path}（${bytes.length} bytes），請縮小圖片後重新打包。`);
  assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR', `無效 PNG：${path}`);
  const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  assert.ok(size.width >= 128 && size.height >= 128, `PNG 至少128×128：${path}`);
  return size;
}

/** 先驗證正式身分，再檢查同步版本、鎖定工具、專用overview及一次性素材。 */
export async function packagingConfig({ local = false, privatePackage = false } = {}) {
  const identity = local ? undefined : validateReleaseIdentity(process.env.SBOM_PILOT_PUBLISHER, process.env.SBOM_PILOT_REPOSITORY_URL);
  assert.ok(!(local && privatePackage), 'placeholder預覽與實際publisher私有包不可混用。');
  const [manifest, pkg, lock, task, tool] = await Promise.all(['vss-extension.json', 'package.json', 'package-lock.json', 'src/task.json', 'node_modules/tfx-cli/package.json'].map(readJson));
  const version = `${task.version.Major}.${task.version.Minor}.${task.version.Patch}`;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.id, 'sbom-pilot');
  for (const actual of [manifest.version, pkg.version, lock.version, lock.packages[''].version]) assert.equal(actual, version, 'package／lock／Task／extension 版本必須同步。');
  assert.equal(pkg.devDependencies['tfx-cli'], '0.24.2', '使用鎖定的本機 tfx0.24.2。');
  assert.equal(tool.version, pkg.devDependencies['tfx-cli']);
  assert.equal(lock.packages['node_modules/tfx-cli'].version, tool.version);
  assert.equal(manifest.icons?.default, 'images/extension-icon.png');
  assert.equal(manifest.content?.details?.path, 'marketplace/overview.md');
  assert.ok(!manifest.screenshots?.some(item => item.path === 'images/marketplace-hero.png'), 'hero是插畫，不是UI截圖。');
  const icon = await pngSize(manifest.icons.default, 1024 * 1024);
  assert.equal(icon.width, icon.height, '圖示必須正方形。');
  await pngSize('images/marketplace-hero.png');
  const overview = await readFile(manifest.content.details.path, 'utf8');
  assert.match(overview, /marketplace-hero\.png/);
  assert.match(overview, /UNVERIFIED/);
  manifest.publisher = local ? 'local-dev-placeholder' : identity.publisher;
  manifest.public = !local && !privatePackage;
  if (local) {
    manifest.name += ' (Local Development Preview)';
    delete manifest.repository;
  } else manifest.repository = { type: 'git', uri: identity.repository };
  const mode = local ? 'preview' : privatePackage ? 'private' : 'public';
  return { manifest, mode };
}
