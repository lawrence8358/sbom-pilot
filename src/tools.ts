import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { createHash } from 'node:crypto';
import { satisfies, valid, validRange, rcompare } from 'semver';
import * as toolLib from 'azure-pipelines-tool-lib/tool';
import type { ProcessRunner } from './process';
import { validateToolOptions, validateCdxgenPackage, parseCdxgenVersion, validateCdxgenHelp } from './tool-options';
export { CDXGEN_VERSION } from './tool-options';

export interface ToolContext {
  node: string;
  npmCli: string;
  cdxgenCli: string;
  nodeVersion: string;
  cdxgenVersion: string;
  env: NodeJS.ProcessEnv;
  /** Verified restore inputs that cdxgen must be able to read for dependency edges. */
  dotnetAssets?: string[];
  /** Verified packages.config and restored nupkg inputs for traditional projects. */
  dotnetPackageFiles?: string[];
}
export interface ToolRequest { nodeVersion: string; cdxgenVersion: string; tempDirectory: string }
export type ToolPreparer = (request: ToolRequest, run: ProcessRunner, log: (message: string) => void) => Promise<ToolContext>;

export async function fetchBytes(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error('HTTP download failed');
      return Buffer.from(await response.arrayBuffer());
    } catch {
      if (attempt === 2) throw new Error('工具下載失敗；請檢查 Agent 網路、Proxy 與下載來源。');
    }
  }
  throw new Error('工具下載失敗。');
}
export function selectNodeVersion(versions: string[], range: string): string {
  if (!validRange(range)) throw new Error('Node.js 版本必須是有效的 semver 範圍。');
  const version = versions.filter(version => valid(version) && satisfies(version, range)).sort(rcompare)[0];
  if (!version || !satisfies(version, '>=24')) throw new Error('找不到相容 Node.js，cdxgen 需要 Node >=24。');
  return version.replace(/^v/, '');
}
export const prepareTools: ToolPreparer = async (request, run, log) => {
  validateToolOptions(request.nodeVersion, request.cdxgenVersion);
  if (!['x64', 'arm64'].includes(process.arch)) throw new Error('工具準備僅支援 x64/arm64 Agent。');
  const versions = JSON.parse((await fetchBytes('https://nodejs.org/dist/index.json')).toString()) as { version: string }[];
  const nodeVersion = selectNodeVersion(versions.map(item => item.version), request.nodeVersion);
  let nodeRoot = toolLib.findLocalTool('sbom-pilot-node', nodeVersion, process.arch);
  if (!nodeRoot) {
    const platform = process.platform === 'win32' ? 'win' : 'linux';
    const folder = `node-v${nodeVersion}-${platform}-${process.arch}`;
    const archive = `${folder}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const base = `https://nodejs.org/dist/v${nodeVersion}`;
    const [bytes, checksum] = await Promise.all([fetchBytes(`${base}/${archive}`), fetchBytes(`${base}/SHASUMS256.txt`)]);
    const expected = checksum.toString().split('\n').find(line => line.trim().endsWith(` ${archive}`))?.split(/\s+/)[0];
    if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node.js 下載的 SHA-256 不符。');
    const archivePath = join(request.tempDirectory, archive);
    await writeFile(archivePath, bytes);
    const extracted = process.platform === 'win32' ? await toolLib.extractZip(archivePath) : await toolLib.extractTar(archivePath);
    nodeRoot = await toolLib.cacheDir(join(extracted, folder), 'sbom-pilot-node', nodeVersion, process.arch);
  }
  const node = join(nodeRoot, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const npmCli = join(nodeRoot, process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js');
  const env = { ...process.env, PATH: `${dirname(node)}${delimiter}${process.env.PATH ?? ''}` };
  const actualNode = (await run({ executable: node, args: ['--version'], cwd: request.tempDirectory, env, timeoutMs: 30_000 })).stdout.trim();
  if (actualNode !== `v${nodeVersion}`) throw new Error('實際 Node.js runtime 版本與選定版本不符；請檢查 Agent 工具快取。');
  log(`Node.js ${nodeVersion}（掃描工具 runtime；Task handler 使用獨立 Node20_1）。`);
  // Isolated installation: never use an arbitrary global cdxgen or write into the repo.
  // A fresh install avoids trusting an incomplete tool cache after cancelled jobs.
  const cdxgenRoot = join(request.tempDirectory, 'cdxgen');
  await mkdir(cdxgenRoot, { recursive: true });
  await writeFile(join(cdxgenRoot, 'package.json'), JSON.stringify({ private: true }));
  await run({ executable: node, args: [npmCli, 'install', '--prefix', cdxgenRoot, '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', '--omit=optional', '--fetch-retries=2', '--fetch-timeout=60000', `@cdxgen/cdxgen@${request.cdxgenVersion}`], cwd: cdxgenRoot, env });
  const cdxgenCli = join(cdxgenRoot, 'node_modules/@cdxgen/cdxgen/bin/cdxgen.js');
  await access(cdxgenCli);
  const pkg = JSON.parse(await readFile(join(cdxgenRoot, 'node_modules/@cdxgen/cdxgen/package.json'), 'utf8'));
  validateCdxgenPackage(pkg, request.cdxgenVersion, nodeVersion);
  const versionOutput = (await run({ executable: node, args: [cdxgenCli, '--version'], cwd: cdxgenRoot, env, timeoutMs: 120_000 })).stdout;
  const actual = parseCdxgenVersion(versionOutput);
  if (actual !== request.cdxgenVersion) throw new Error('cdxgen CLI 版本驗證失敗。');
  const help = await run({ executable: node, args: [cdxgenCli, '--help'], cwd: cdxgenRoot, env, timeoutMs: 120_000 });
  validateCdxgenHelp(`${help.stdout}\n${help.stderr}`);
  log(`cdxgen ${actual}（固定 npm 套件；自動安裝依賴將關閉）。`);
  return { node, npmCli, cdxgenCli, nodeVersion, cdxgenVersion: actual, env };
};
