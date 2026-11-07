import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { createHash } from 'node:crypto';
import { satisfies, valid, validRange, rcompare } from 'semver';
import { acquireNodeCache, extractNodeArchive, nodePaths } from './node-cache';
import type { ProcessRunner } from './process';
import {
  validateToolOptions,
  validateCdxgenPackage,
  parseCdxgenVersion,
  validateCdxgenHelp,
} from './tool-options';
import { downloadBytes } from './network/http';
import { childNetworkEnvironment } from './network/settings';
export { CDXGEN_VERSION } from './tool-options';

export interface ToolContext {
  node: string;
  npmCli: string;
  cdxgenCli: string;
  nodeVersion: string;
  cdxgenVersion: string;
  env: NodeJS.ProcessEnv;
  /** 已驗證的還原輸入，掃描器必須可讀才能保留依賴邊。 */
  dotnetAssets?: string[];
  /** 指定方案／專案時，僅允許掃描已驗證還原圖的輸入。 */
  dotnetScanIncludes?: string[];
  /** 傳統專案已驗證的 packages.config 與還原 nupkg。 */
  dotnetPackageFiles?: string[];
}
export interface ToolRequest {
  nodeVersion: string;
  cdxgenVersion: string;
  tempDirectory: string;
}
export type ToolPreparer = (
  request: ToolRequest,
  run: ProcessRunner,
  log: (message: string) => void,
) => Promise<ToolContext>;

/** 透過共用有界網路下載工具內容，沿用 Agent Proxy／CA 與重新導向限制。 */
export async function fetchBytes(url: string): Promise<Buffer> {
  return downloadBytes(url);
}

/** 在官方發行清單選最新符合範圍的穩定 Node，確保滿足 cdxgen 的 >=24 要求。 */
export function selectNodeVersion(versions: string[], range: string): string {
  if (!validRange(range)) {
    throw new Error('Node.js 版本必須是有效的 semver 範圍。');
  }

  const version = versions
    .filter((version) => valid(version) && satisfies(version, range))
    .sort(rcompare)[0];

  if (!version || !satisfies(version, '>=24')) {
    throw new Error('找不到相容 Node.js，cdxgen 需要 Node >=24。');
  }

  return version.replace(/^v/, '');
}

/** 驗證官方 Node checksum／快取並隔離安裝固定 cdxgen，確認版本與 CLI 後回傳非秘密工具環境。 */
export const prepareTools: ToolPreparer = async (request, run, log) => {
  log('##[section]開始準備 Node.js 執行環境');
  validateToolOptions(request.nodeVersion, request.cdxgenVersion);

  if (!['x64', 'arm64'].includes(process.arch)) {
    throw new Error('工具準備僅支援 x64/arm64 Agent。');
  }

  const versions = JSON.parse(
    (await fetchBytes('https://nodejs.org/dist/index.json')).toString(),
  ) as { version: string }[];
  const nodeVersion = selectNodeVersion(
    versions.map((item) => item.version),
    request.nodeVersion,
  );
  const nodeRoot = await acquireNodeCache(
    {
      directory: process.env.AGENT_TOOLSDIRECTORY || join(request.tempDirectory, 'tools-cache'),
      version: nodeVersion,
      arch: process.arch,
    },
    async (stage) => {
      const platform = process.platform === 'win32' ? 'win' : 'linux';
      const folder = `node-v${nodeVersion}-${platform}-${process.arch}`;
      const archive = `${folder}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
      const base = `https://nodejs.org/dist/v${nodeVersion}`;
      const [bytes, checksum] = await Promise.all([
        fetchBytes(`${base}/${archive}`),
        fetchBytes(`${base}/SHASUMS256.txt`),
      ]);
      const expected = checksum
        .toString()
        .split('\n')
        .find((line) => line.trim().endsWith(` ${archive}`))
        ?.split(/\s+/)[0];

      if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) {
        throw new Error('Node.js 下載的 SHA-256 不符。');
      }

      const archivePath = join(request.tempDirectory, archive);
      await writeFile(archivePath, bytes);
      const extracted = await mkdtemp(join(request.tempDirectory, 'node-extract-'));

      try {
        await extractNodeArchive(archivePath, bytes, extracted, folder, request.tempDirectory, run);
        // 暫存與工具快取可能在不同磁碟，複製時仍須保留 npm 相對連結。
        await cp(join(extracted, folder), stage, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
        });
      } finally {
        await rm(extracted, { recursive: true, force: true });
        await rm(archivePath, { force: true });
      }
    },
    async (root) => {
      const paths = nodePaths(root);
      await access(paths.npmCli);

      if (
        (
          await run({
            executable: paths.node,
            args: ['--version'],
            cwd: request.tempDirectory,
            timeoutMs: 30_000,
          })
        ).stdout.trim() !== `v${nodeVersion}`
      ) {
        throw new Error('Node 工具快取的實際版本與選定版本不符。');
      }
    },
  );
  const { node, npmCli } = nodePaths(nodeRoot);
  const env = await childNetworkEnvironment(
    { ...process.env, PATH: `${dirname(node)}${delimiter}${process.env.PATH ?? ''}` },
    request.tempDirectory,
  );
  const actualNode = (
    await run({
      executable: node,
      args: ['--version'],
      cwd: request.tempDirectory,
      env,
      timeoutMs: 30_000,
    })
  ).stdout.trim();

  if (actualNode !== `v${nodeVersion}`) {
    throw new Error('實際 Node.js runtime 版本與選定版本不符；請檢查 Agent 工具快取。');
  }

  log(
    `Node.js ${nodeVersion}（掃描工具 runtime；Task handler Node ${process.versions.node}，分別管理）。`,
  );

  // cdxgen 安裝在隔離目錄，不使用任意全域工具或寫回來源。
  // 每次重新安裝，避免信任上次工作取消後留下的不完整目錄。
  log('##[section]開始安裝 SBOM 掃描工具（cdxgen）');
  const cdxgenRoot = join(request.tempDirectory, 'cdxgen');

  await mkdir(cdxgenRoot, { recursive: true });
  await writeFile(join(cdxgenRoot, 'package.json'), JSON.stringify({ private: true }));
  await run({
    executable: node,
    args: [
      npmCli,
      'install',
      '--prefix',
      cdxgenRoot,
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--omit=optional',
      '--fetch-retries=2',
      '--fetch-timeout=60000',
      `@cdxgen/cdxgen@${request.cdxgenVersion}`,
    ],
    cwd: cdxgenRoot,
    env,
  });

  const cdxgenCli = join(cdxgenRoot, 'node_modules/@cdxgen/cdxgen/bin/cdxgen.js');

  await access(cdxgenCli);
  const pkg = JSON.parse(
    await readFile(join(cdxgenRoot, 'node_modules/@cdxgen/cdxgen/package.json'), 'utf8'),
  );

  validateCdxgenPackage(pkg, request.cdxgenVersion, nodeVersion);

  const versionOutput = (
    await run({
      executable: node,
      args: [cdxgenCli, '--version'],
      cwd: cdxgenRoot,
      env,
      timeoutMs: 120_000,
    })
  ).stdout;
  const actual = parseCdxgenVersion(versionOutput);

  if (actual !== request.cdxgenVersion) {
    throw new Error('cdxgen CLI 版本驗證失敗。');
  }

  const help = await run({
    executable: node,
    args: [cdxgenCli, '--help'],
    cwd: cdxgenRoot,
    env,
    timeoutMs: 120_000,
  });

  validateCdxgenHelp(`${help.stdout}\n${help.stderr}`);
  log(`cdxgen ${actual}（固定 npm 套件；自動安裝依賴將關閉）。`);

  return { node, npmCli, cdxgenCli, nodeVersion, cdxgenVersion: actual, env };
};
