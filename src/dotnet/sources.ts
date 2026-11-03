import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProcessRunner } from '../process';
import type { DotnetSdk } from './sdk';
import type { MSBuildTool } from './msbuild';
import type { EffectiveNuGetSource, NuGetRestoreSettings, NuGetSourceReader } from './credentials';

// 兩種 helper 都使用還原工具自己的 NuGet.Configuration 與 graph 評估後路徑，
// 只輸出來源身分，不輸出帳密。
const sourceProgram = `using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.Json;
using NuGet.Configuration;

// 只讀取來源身分，不取得、解密或輸出認證值。
var paths = JsonSerializer.Deserialize<string[]>(File.ReadAllText(args[0]))!;
var settings = Settings.LoadSettingsGivenConfigPaths(paths);
var provider = new PackageSourceProvider(settings);
var regular = provider.LoadPackageSources().Select(s => new {
    name = s.Name,
    url = s.Source,
    enabled = s.IsEnabled,
    audit = false
});
var audits = typeof(PackageSourceProvider)
    .GetMethod("LoadAuditSources", Type.EmptyTypes)
    ?.Invoke(provider, null) as IEnumerable<PackageSource> ?? Enumerable.Empty<PackageSource>();
Console.Write(JsonSerializer.Serialize(regular.Concat(audits.Select(s => new {
    name = s.Name,
    url = s.Source,
    enabled = s.IsEnabled,
    audit = true
}))));
`;
const frameworkScript = `param([string]$AssemblyDirectory, [string]$InputFile)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
foreach ($name in @('NuGet.Common.dll', 'NuGet.Configuration.dll')) {
  [Reflection.Assembly]::LoadFrom((Join-Path $AssemblyDirectory $name)) | Out-Null
}
$paths = [string[]](Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json)
$settings = [NuGet.Configuration.Settings]::LoadSettingsGivenConfigPaths($paths)
$provider = New-Object NuGet.Configuration.PackageSourceProvider($settings)
$sources = @($provider.LoadPackageSources() | ForEach-Object {
  [pscustomobject]@{
    name = $_.Name
    url = $_.Source
    enabled = $_.IsEnabled
    audit = $false
  }
})
$method = $provider.GetType().GetMethod('LoadAuditSources', [Type[]]@())
if ($method) {
  $sources += @($method.Invoke($provider, @()) | ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      url = $_.Source
      enabled = $_.IsEnabled
      audit = $true
    }
  })
}
ConvertTo-Json -InputObject $sources -Compress
`;
/** 跳脫產生 helper 專案時的 XML 路徑屬性，避免特殊字元改變組件參照。 */
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** 驗證官方 NuGet helper 的來源身分輸出，只接受名稱、URL 及啟用狀態。 */
function decode(output: string): EffectiveNuGetSource[] {
  const sources = JSON.parse(output);
  if (
    !Array.isArray(sources) ||
    sources.some(
      (source) =>
        typeof source.name !== 'string' ||
        typeof source.url !== 'string' ||
        typeof source.enabled !== 'boolean',
    )
  ) {
    throw new Error('Invalid NuGet sources');
  }
  return sources;
}

/** 離線編譯使用所選 SDK NuGet 組件的來源讀取器；不傳入帳密，結束後移除 helper。 */
export async function withSdkSourceReader<T>(
  sdk: DotnetSdk,
  run: ProcessRunner,
  temp: string,
  action: (read: NuGetSourceReader) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(temp, 'nuget-settings-'));
  try {
    const listed = await run({
      executable: sdk.executable,
      args: ['--list-sdks'],
      cwd: directory,
      env: sdk.env,
    });
    const line = listed.stdout
      .split(/\r?\n/)
      .map((line) => /^(\S+)\s+\[(.+)\]$/.exec(line.trim()))
      .find((match) => match?.[1] === sdk.version);
    if (!line) {
      throw new Error('SDK assemblies missing');
    }
    const assemblies = join(line[2], sdk.version);
    const major = Number(sdk.version.split('.')[0]);
    if (major < 6) {
      throw new Error('Unsupported SDK');
    }
    await writeFile(
      join(directory, 'global.json'),
      JSON.stringify({ sdk: { version: sdk.version, rollForward: 'disable' } }),
    );
    await writeFile(
      join(directory, 'NuGet.Config'),
      '<configuration><packageSources><clear /></packageSources></configuration>',
    );
    await writeFile(join(directory, 'Program.cs'), sourceProgram);
    await writeFile(
      join(directory, 'Settings.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${major}.0</TargetFramework><EnableDefaultItems>true</EnableDefaultItems><NuGetAudit>false</NuGetAudit></PropertyGroup><ItemGroup><Reference Include="NuGet.Configuration"><HintPath>${xml(join(assemblies, 'NuGet.Configuration.dll'))}</HintPath></Reference><Reference Include="NuGet.Common"><HintPath>${xml(join(assemblies, 'NuGet.Common.dll'))}</HintPath></Reference></ItemGroup></Project>`,
    );
    await run({
      executable: sdk.executable,
      args: [
        'build',
        join(directory, 'Settings.csproj'),
        '--nologo',
        '--verbosity',
        'quiet',
        '--configfile',
        join(directory, 'NuGet.Config'),
      ],
      cwd: directory,
      env: sdk.env,
    });
    const executable = join(directory, 'bin', 'Debug', `net${major}.0`, 'Settings.dll');
    return await action(async (project) => {
      const input = join(directory, 'paths.json');
      await writeFile(input, JSON.stringify(project.configFilePaths));
      const output = await run({
        executable: sdk.executable,
        args: [executable, input],
        cwd: dirname(project.projectPath),
        env: sdk.env,
      });
      return decode(output.stdout);
    });
  } catch (error) {
    // 保留呼叫端的安全來源／還原診斷；helper 錯誤不能包含子程序原始輸出。
    if (
      error instanceof Error &&
      /^(NuGet 認證|dotnet restore|MSBuild\/NuGet|還原修改)/.test(error.message)
    ) {
      throw error;
    }
    throw new Error(
      'NuGet 認證來源評估失敗；請確認所選 SDK 的 NuGet.Configuration 元件及設定完整。',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** 以 MSBuild 隨附 NuGet 組件讀取 graph 指定的設定檔，不改寫階層或讀出秘密。 */
export async function withFrameworkSourceReader<T>(
  nugetTargets: string,
  tool: MSBuildTool,
  run: ProcessRunner,
  temp: string,
  action: (read: NuGetSourceReader) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(temp, 'nuget-settings-'));
  try {
    const script = join(directory, 'Settings.ps1');
    await writeFile(script, frameworkScript);
    return await action(async (project: NuGetRestoreSettings) => {
      const input = join(directory, 'paths.json');
      await writeFile(input, JSON.stringify(project.configFilePaths));
      try {
        const result = await run({
          executable: 'powershell.exe',
          args: [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-AssemblyDirectory',
            dirname(nugetTargets),
            '-InputFile',
            input,
          ],
          cwd: dirname(project.projectPath),
          env: tool.env,
          timeoutMs: 60_000,
        });
        return decode(result.stdout);
      } catch {
        throw new Error(
          'NuGet 認證來源評估失敗；請確認 Visual Studio 的 NuGet.Configuration 元件及設定完整。',
        );
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
