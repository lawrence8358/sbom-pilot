import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, basename } from 'node:path';
import { valid, prerelease, major } from 'semver';
import { downloadBytes, sendHttpRequest } from './network/http';
import type { ProcessRunner } from './process';
import type { ValidatedSbom } from './validation';
import { createOsvReport, type OsvFinding } from './osv-report';

const repository = 'https://github.com/google/osv-scanner';
export interface OsvReport {
  path: string;
  version: string;
  findings: boolean;
  findingList: OsvFinding[];
}
export interface OsvRequest {
  sbom: ValidatedSbom;
  version: string;
  tempDirectory: string;
  cacheDirectory: string;
  env: NodeJS.ProcessEnv;
}
export type OsvScanner = (
  request: OsvRequest,
  run: ProcessRunner,
  log: (message: string) => void,
) => Promise<OsvReport>;
export interface OsvTool {
  executable: string;
  version: string;
  outputFlag: string;
}
interface CacheEntry {
  version: string;
  asset: string;
  sha256: string;
}
export interface OsvDependencies {
  download?: typeof downloadBytes;
  request?: typeof sendHttpRequest;
  platform?: string;
  arch?: string;
}

/** 限制版本為 latest 或官方穩定精確版本，拒絕路徑與預覽版。 */
export function validateOsvVersion(value: string): string {
  if (value === 'latest') return value;

  const version = value.replace(/^v/, '');

  if (valid(version) !== version || prerelease(version) || major(version) < 2) {
    throw new Error('OSV 版本必須是 latest 或 >=2 的穩定精確版本，例如 2.7.1。');
  }

  return version;
}

/** 由官方 Latest 轉址取得單次執行的固定 tag，避開 GitHub REST 共用配額。 */
export async function resolveOsvVersion(value: string, request = sendHttpRequest): Promise<string> {
  const selected = validateOsvVersion(value);

  if (selected !== 'latest') return selected;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request({
        url: new URL(`${repository}/releases/latest`),
        method: 'GET',
        headers: { 'User-Agent': 'SBOM-Pilot' },
        rejectUnauthorized: true,
        timeoutMs: 30_000,
        maxResponseBytes: 1024 * 1024,
      });

      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const target = new URL(response.headers.location, repository);
        const match = target.pathname.match(
          /^\/google\/osv-scanner\/releases\/tag\/v(\d+\.\d+\.\d+)$/,
        );

        if (target.origin === 'https://github.com' && !target.search && !target.hash && match) {
          return validateOsvVersion(match[1]);
        }
      }
      if (![408, 429, 500, 502, 503, 504].includes(response.statusCode)) break;
    } catch {
      // 有限重試後使用安全摘要，不回顯網路／Proxy 原始錯誤。
    }
  }

  throw new Error('無法解析官方 OSV 最新穩定版；請檢查 GitHub 連線或指定精確版本。');
}

/** 以支援的作業系統與架構選擇官方檔名，禁止其他平台誤用 binary。 */
export function osvAsset(platform: string, arch: string): string {
  if (!['win32', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error('OSV 掃描僅支援 Windows／Linux x64／arm64 Agent。');
  }

  return `osv-scanner_${platform === 'win32' ? 'windows' : 'linux'}_${arch === 'x64' ? 'amd64' : 'arm64'}${platform === 'win32' ? '.exe' : ''}`;
}

/** 對檔案內容計算 SHA-256，供下載與每次快取重用驗證。 */
function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** 只接受對應 asset 唯一的官方 checksum，拒絕缺少或重複項目。 */
export function osvChecksum(contents: string, asset: string): string {
  const hashes = contents
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^([a-f\d]{64})\s+\*?(\S+)$/i))
    .filter((match) => match?.[2] === asset)
    .map((match) => match![1].toLowerCase());

  if (hashes.length !== 1) throw new Error('OSV 官方 SHA-256 清單缺少唯一的對應檔案。');

  return hashes[0];
}

/** 核對快取為實體檔案且身分與內容 hash 一致，缺失或損壞時允許重新下載。 */
async function validCache(
  executable: string,
  expected: Omit<CacheEntry, 'sha256'>,
): Promise<boolean> {
  try {
    const entry: CacheEntry = JSON.parse(await readFile(`${executable}.json`, 'utf8'));

    return (
      entry.version === expected.version &&
      entry.asset === expected.asset &&
      /^[a-f\d]{64}$/.test(entry.sha256) &&
      (await lstat(executable)).isFile() &&
      sha256(await readFile(executable)) === entry.sha256
    );
  } catch {
    return false;
  }
}

/** 執行官方版本與必要旗標檢查，保留舊版 output 與新版 output-file 相容性。 */
async function verifyTool(
  executable: string,
  version: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  run: ProcessRunner,
): Promise<string> {
  const result = await run({ executable, args: ['--version'], cwd, env, timeoutMs: 30_000 });
  const actual = result.stdout.match(
    /osv-scanner\s+(?:version:\s*)?v?(\d+\.\d+\.\d+)(?=\s|$)/i,
  )?.[1];

  if (actual !== version) throw new Error('OSV 執行檔的實際版本與選定版本不符。');

  const help = await run({
    executable,
    args: ['scan', 'source', '--help'],
    cwd,
    env,
    timeoutMs: 30_000,
  });
  const text = `${help.stdout}\n${help.stderr}`;

  for (const option of ['--format', '--lockfile']) {
    if (!text.includes(option)) throw new Error(`OSV CLI 不相容，缺少 ${option}。`);
  }
  if (text.includes('--output-file')) return '--output-file';
  if (/--output(?=[\s=,])/.test(text)) return '--output';

  throw new Error('OSV CLI 不相容，缺少報告檔案輸出選項。');
}

/** 取得一次解析的官方版本；重用驗證快取，否則下載相同 tag 的 binary／checksum 後原子替換。 */
export async function acquireOsvTool(
  options: Pick<OsvRequest, 'version' | 'tempDirectory' | 'cacheDirectory' | 'env'>,
  run: ProcessRunner,
  log: (message: string) => void,
  dependencies: OsvDependencies = {},
): Promise<OsvTool> {
  const platform = dependencies.platform ?? process.platform;
  const arch = dependencies.arch ?? process.arch;
  const asset = osvAsset(platform, arch);
  const version = await resolveOsvVersion(options.version, dependencies.request);
  const root = join(options.cacheDirectory, 'sbom-pilot-osv', version, `${platform}-${arch}`);
  const executable = join(root, asset);
  const identity = { version, asset };

  log(`OSV Scanner ${version}（${platform}/${arch}；要求 ${options.version}）。`);
  await mkdir(options.tempDirectory, { recursive: true });

  if (await validCache(executable, identity)) {
    const outputFlag = await verifyTool(
      executable,
      version,
      options.tempDirectory,
      options.env,
      run,
    );

    log('重用已驗證的 OSV 工具快取，略過下載與安裝。');

    return { executable, version, outputFlag };
  }

  await mkdir(root, { recursive: true });
  const stage = await mkdtemp(join(root, '.download-'));

  try {
    /** 選用測試下載介面或正式共用傳輸，兩者均下載同一固定 tag。 */
    const download = dependencies.download ?? downloadBytes;
    const base = `${repository}/releases/download/v${version}`;
    const [bytes, checksums] = await Promise.all([
      download(`${base}/${asset}`),
      download(`${base}/osv-scanner_SHA256SUMS`),
    ]);
    const expected = osvChecksum(checksums.toString('utf8'), asset);

    if (sha256(bytes) !== expected) throw new Error('OSV 下載的 SHA-256 不符。');

    const staged = join(stage, asset);
    await writeFile(staged, bytes, { mode: 0o755 });
    if (platform !== 'win32') await chmod(staged, 0o755);
    const outputFlag = await verifyTool(staged, version, options.tempDirectory, options.env, run);
    await writeFile(`${staged}.json`, JSON.stringify({ ...identity, sha256: expected }));

    try {
      await rename(staged, executable);
      await rename(`${staged}.json`, `${executable}.json`);
    } catch (error) {
      // 同版本並行工作可能先完成；只接受驗證通過的勝出快取，不刪除對方檔案。
      if (!(await validCache(executable, identity))) throw error;
    }
    if (!(await validCache(executable, identity))) throw new Error('OSV 工具快取寫入驗證失敗。');

    log('OSV 官方執行檔已下載，SHA-256 與實際版本驗證通過。');

    return { executable, version, outputFlag };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

/** 只掃描本次有效 SBOM 的標準檔名複本；區分弱點與技術失敗，檢查 Markdown 產物。 */
export const scanOsv: OsvScanner = async (request, run, log) => {
  log('##[section]開始準備 OSV Scanner（版本與工具快取）');
  const tool = await acquireOsvTool(request, run, log);
  const inputRoot = join(request.tempDirectory, 'osv-input');
  const outputRoot = join(request.tempDirectory, 'osv-report');
  await mkdir(inputRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  const input = join(inputRoot, 'sbom.cdx.json');
  const path = join(outputRoot, 'sbom.osv.md');
  const jsonPath = join(outputRoot, 'osv.raw.json');
  await copyFile(request.sbom.path, input);
  await rm(path, { force: true });
  await rm(jsonPath, { force: true });
  log('##[section]開始 OSV 弱點掃描');
  const result = await run({
    executable: tool.executable,
    args: [
      'scan',
      'source',
      '--format=json',
      `${tool.outputFlag}=${jsonPath}`,
      `--lockfile=:${input}`,
    ],
    cwd: inputRoot,
    env: request.env,
    acceptedExitCodes: [0, 1],
  });

  if (![0, 1].includes(result.exitCode ?? 0)) throw new Error('OSV 掃描未正常完成。');
  const details = await lstat(jsonPath);
  if (!details.isFile() || details.size === 0 || details.size > 64 * 1024 * 1024) {
    throw new Error('OSV 未產生有效的 JSON 掃描結果。');
  }
  const findings = result.exitCode === 1;
  let report: ReturnType<typeof createOsvReport>;

  try {
    report = createOsvReport(JSON.parse(await readFile(jsonPath, 'utf8')), {
      version: tool.version,
      source: basename(request.sbom.path),
      findings,
    });
  } catch {
    throw new Error('OSV JSON 無法產生完整的 Markdown 報告，請確認掃描器版本及輸出格式。');
  }
  await writeFile(path, report.markdown);

  if (!findings) log('OSV 掃描完成，未發現已知弱點。');

  return { path, version: tool.version, findings, findingList: report.findingList };
};
