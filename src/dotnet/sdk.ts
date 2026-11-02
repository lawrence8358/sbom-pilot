import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { valid } from 'semver';
import { fetchBytes } from '../tools';
import type { ProcessRunner } from '../process';

export const FALLBACK_DOTNET_SDK = '10.0.101';
const policies = ['patch', 'feature', 'minor', 'major', 'latestPatch', 'latestFeature', 'latestMinor', 'latestMajor', 'disable'];
const exists = async (path: string) => access(path).then(() => true, () => false);

export interface SdkPolicy { path?: string; version?: string; rollForward?: string; allowPrerelease?: boolean }
export interface DotnetSdk { executable: string; version: string; env: NodeJS.ProcessEnv; policy: SdkPolicy }
export interface SdkOptions {
  cacheDirectory: string;
  tempDirectory: string;
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  download?: (url: string) => Promise<Buffer>;
}

export async function readSdkPolicy(cwd: string): Promise<SdkPolicy> {
  let directory = resolve(cwd);
  for (;;) {
    const path = join(directory, 'global.json');
    if (await exists(path)) {
      const errors: ParseError[] = [];
      const document = parse(await readFile(path, 'utf8'), errors, { allowTrailingComma: true, disallowComments: false });
      if (errors.length || !document || typeof document !== 'object' || Array.isArray(document)) throw new Error('global.json 格式無效；請修正 JSON/JSONC。');
      const sdk = document.sdk;
      if (sdk === undefined) return { path };
      if (!sdk || typeof sdk !== 'object' || Array.isArray(sdk)) throw new Error('global.json sdk 必須是物件。');
      if (sdk.paths !== undefined) throw new Error('目前尚不支援 global.json sdk.paths；請使用一般 SDK 安裝位置與 sdk.version 宣告。');
      if (sdk.version !== undefined && (typeof sdk.version !== 'string' || !valid(sdk.version) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(sdk.version))) throw new Error('global.json sdk.version 必須是完整 SDK 版本，例如 10.0.101；不能使用萬用字元。');
      if (sdk.rollForward !== undefined && !policies.includes(sdk.rollForward)) throw new Error('global.json sdk.rollForward 不受支援。');
      if (sdk.allowPrerelease !== undefined && typeof sdk.allowPrerelease !== 'boolean') throw new Error('global.json sdk.allowPrerelease 必須是布林值。');
      if (!sdk.version && sdk.rollForward && sdk.rollForward !== 'latestMajor') throw new Error('global.json rollForward 除 latestMajor 外必須同時宣告 sdk.version。');
      return { path, version: sdk.version, rollForward: sdk.rollForward, allowPrerelease: sdk.allowPrerelease };
    }
    const parent = dirname(directory);
    if (parent === directory) return {};
    directory = parent;
  }
}

function sdkEnvironment(env: NodeJS.ProcessEnv, directory?: string): NodeJS.ProcessEnv {
  return {
    ...env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1',
    ...(directory ? { DOTNET_ROOT: directory, DOTNET_HOST_PATH: join(directory, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'), PATH: `${directory}${delimiter}${env.PATH ?? env.Path ?? ''}` } : {}),
  };
}

async function selectedVersion(executable: string, cwd: string, env: NodeJS.ProcessEnv, run: ProcessRunner): Promise<string | undefined> {
  try {
    const version = (await run({ executable, args: ['--version'], cwd, env, timeoutMs: 60_000 })).stdout.trim();
    return valid(version) ? version : undefined;
  } catch { return undefined; }
}

/** Host selection, from the exact restore cwd, owns roll-forward and prerelease rules. */
export async function prepareDotnetSdk(cwd: string, run: ProcessRunner, options: SdkOptions): Promise<DotnetSdk> {
  const policy = await readSdkPolicy(cwd);
  const requested = policy.version ?? FALLBACK_DOTNET_SDK;
  const baseEnv = sdkEnvironment(options.env);
  const systemExecutable = options.env.DOTNET_HOST_PATH || 'dotnet';
  const installed = await selectedVersion(systemExecutable, cwd, baseEnv, run);
  if (installed && (policy.version || installed === requested || policy.rollForward === 'latestMajor')) {
    // --list-sdks exposes the installation directory without relying on PATH guesses.
    const listed = (await run({ executable: systemExecutable, args: ['--list-sdks'], cwd, env: baseEnv, timeoutMs: 60_000 })).stdout;
    const location = listed.split(/\r?\n/).find(line => line.startsWith(`${installed} [`))?.match(/\[(.+)\]\s*$/)?.[1];
    const directory = location ? dirname(location) : undefined;
    const executable = directory ? join(directory, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet') : systemExecutable;
    const env = sdkEnvironment(options.env, directory);
    if (await selectedVersion(executable, cwd, env, run) !== installed) throw new Error('.NET SDK 的實際 host 選擇不一致；請檢查 DOTNET_ROOT、global.json 與 Agent SDK 配置。');
    options.log?.(`.NET SDK ${installed}（由還原目錄套用 ${policy.path ? 'global.json' : 'Task 固定預設'}）。`);
    return { executable, version: installed, env, policy };
  }

  if (!['x64', 'arm64'].includes(process.arch)) throw new Error('.NET SDK 自動準備僅支援 x64/arm64。');
  const cache = join(resolve(options.cacheDirectory), 'sbom-pilot-dotnet', `${process.platform}-${process.arch}`, requested);
  const executableName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
  const executable = join(cache, executableName);
  let env = sdkEnvironment(options.env, cache);
  if (await exists(join(cache, '.complete')) && await selectedVersion(executable, cwd, env, run)) {
    const version = (await selectedVersion(executable, cwd, env, run))!;
    options.log?.(`.NET SDK ${version}（Task 工具快取）。`);
    return { executable, version, env, policy };
  }
  if (await exists(cache)) throw new Error('.NET SDK 工具快取不完整；請清理該版本的 sbom-pilot-dotnet 快取後重試。');
  await mkdir(dirname(cache), { recursive: true });
  await mkdir(options.tempDirectory, { recursive: true });
  const staging = await mkdtemp(join(dirname(cache), `.install-${requested}-`));
  const extension = process.platform === 'win32' ? 'ps1' : 'sh';
  const script = join(options.tempDirectory, `dotnet-install.${extension}`);
  try {
    await writeFile(script, await (options.download ?? fetchBytes)(`https://dot.net/v1/dotnet-install.${extension}`));
    options.log?.(`準備 .NET SDK ${requested}；不需要額外 UseDotNet Task。`);
    await run({
      executable: process.platform === 'win32' ? 'powershell.exe' : 'bash',
      args: process.platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Version', requested, '-InstallDir', staging, '-Architecture', process.arch, '-NoPath']
        : [script, '--version', requested, '--install-dir', staging, '--architecture', process.arch, '--no-path'],
      cwd: options.tempDirectory, env: baseEnv, timeoutMs: 15 * 60_000,
    });
    const stagingEnv = sdkEnvironment(options.env, staging);
    const version = await selectedVersion(join(staging, executableName), cwd, stagingEnv, run);
    if (!version || (!policy.version && version !== requested)) throw new Error('安裝後未能依 global.json 選到相容的 .NET SDK。');
    await writeFile(join(staging, '.complete'), version);
    try { await rename(staging, cache); }
    catch (error) { if (!await exists(join(cache, '.complete'))) throw error; }
    env = sdkEnvironment(options.env, cache);
    const selected = await selectedVersion(executable, cwd, env, run);
    if (!selected) throw new Error('.NET SDK 快取完成後的版本驗證失敗。');
    options.log?.(`.NET SDK ${selected}（Task 自行準備，已驗證 host 選擇）。`);
    return { executable, version: selected, env, policy };
  } catch {
    throw new Error(`.NET SDK ${requested} 準備或版本驗證失敗；請檢查 global.json、下載來源、Proxy、OS 所需原生程式庫及 Agent 執行權限。`);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(script, { force: true });
  }
}
