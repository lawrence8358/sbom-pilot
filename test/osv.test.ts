import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, rename, copyFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { acquireOsvTool, osvAsset, osvChecksum, resolveOsvVersion, scanOsv, validateOsvVersion, type OsvDependencies, type OsvRequest } from '../src/osv';
import { runProcess, type ProcessRunner } from '../src/process';
import { readTaskConfig, validateConfig } from '../src/config';
import { runWorkflow, type WorkflowServices } from '../src/workflow';
import type { HttpResponse } from '../src/network/http';
import findingsFixture from './fixtures/osv-findings.json';

async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-osv-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const bytes = Buffer.from('fixture official binary');
const hash = createHash('sha256').update(bytes).digest('hex');
const help = '--format --lockfile --output-file';
const runner: ProcessRunner = async command => ({ stdout: command.args.includes('--version') ? 'osv-scanner version: 2.7.1\n' : help, stderr: '' });
const request = (root: string): OsvRequest => ({
  sbom: { path: join(root, 'custom.json'), componentCount: 1 }, version: '2.7.1',
  tempDirectory: root, cacheDirectory: join(root, 'cache'), env: {},
});
const response = (location: string): HttpResponse => ({ statusCode: 302, headers: { location }, body: Buffer.alloc(0) });

test('OSV inputs default on/latest, skip hidden version when off, and precede DT with help', async () => {
  const values = readTaskConfig(name => name === 'projectPath' ? 'root' : undefined);
  assert.equal(values.runOsv, true);
  assert.equal(values.osvVersion, 'latest');
  assert.equal(values.sbomFileName, 'sbom.cdx.json');
  const disabled = readTaskConfig(name => {
    if (name === 'osvVersion') throw new Error('hidden field read');
    return name === 'projectPath' ? 'root' : name === 'runOsv' ? 'false' : undefined;
  });
  assert.equal(disabled.osvVersion, undefined);
  assert.throws(() => readTaskConfig(name => name === 'projectPath' ? 'root' : name === 'runOsv' ? 'yes' : undefined), /true.*false/);
  const manifest = JSON.parse(await readFile('src/task.json', 'utf8'));
  const index = (name: string) => manifest.inputs.findIndex((input: { name: string }) => input.name === name);
  assert.ok(index('runOsv') < index('uploadToDt'));
  for (const name of ['runOsv', 'osvVersion']) assert.ok(manifest.inputs[index(name)].helpMarkDown.length > 50);
  assert.equal(manifest.inputs[index('runOsv')].defaultValue, 'true');
  assert.equal(manifest.inputs[index('sbomFileName')].defaultValue, values.sbomFileName);
});

test('latest resolves once to a stable official tag; explicit versions avoid resolution', async () => {
  let calls = 0;
  const result = await resolveOsvVersion('latest', async options => {
    calls++;
    assert.equal(options.url.href, 'https://github.com/google/osv-scanner/releases/latest');
    return response('https://github.com/google/osv-scanner/releases/tag/v2.7.1');
  });
  assert.equal(result, '2.7.1'); assert.equal(calls, 1);
  assert.equal(await resolveOsvVersion('v2.7.1', async () => { throw new Error('must not fetch'); }), '2.7.1');
  for (const location of ['https://evil.test/google/osv-scanner/releases/tag/v2.7.1', '/google/osv-scanner/releases/tag/v2.7.1-beta', '/other/repo/releases/tag/v2.7.1', '/google/osv-scanner/releases/tag/v2.7.1?bad=1']) {
    await assert.rejects(resolveOsvVersion('latest', async () => response(location)), /最新穩定版/);
  }
  let retries = 0;
  await assert.rejects(resolveOsvVersion('latest', async () => { retries++; return { statusCode: 503, headers: {}, body: Buffer.alloc(0) }; }), /最新穩定版/);
  assert.equal(retries, 3);
  for (const version of ['2.x', '../bad', '2.7.1-beta.1', '1.9.0', '2.7.1\n']) assert.throws(() => validateOsvVersion(version), /版本/);
});

test('official asset and checksum selection covers both architectures and rejects ambiguous hashes', () => {
  assert.equal(osvAsset('win32', 'x64'), 'osv-scanner_windows_amd64.exe');
  assert.equal(osvAsset('win32', 'arm64'), 'osv-scanner_windows_arm64.exe');
  assert.equal(osvAsset('linux', 'x64'), 'osv-scanner_linux_amd64');
  assert.equal(osvAsset('linux', 'arm64'), 'osv-scanner_linux_arm64');
  assert.throws(() => osvAsset('darwin', 'x64'), /Agent/);
  assert.throws(() => osvAsset('linux', 'ia32'), /Agent/);
  assert.equal(osvChecksum(`${hash}  file\r\n`, 'file'), hash);
  assert.throws(() => osvChecksum(`${hash}  file\n${hash}  file`, 'file'), /唯一/);
  assert.throws(() => osvChecksum(`${hash}  other`, 'file'), /唯一/);
});

test('verified per-version cache reuses without downloads and repairs corrupted bytes', () => fixture(async root => {
  let downloads = 0;
  const asset = osvAsset(process.platform, process.arch);
  const dependencies: OsvDependencies = { download: async url => {
    downloads++;
    assert.ok(url.includes('/download/v2.7.1/'));
    return url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}\n`) : bytes;
  } };
  const logs: string[] = [];
  const tool = await acquireOsvTool(request(root), runner, line => logs.push(line), dependencies);
  assert.equal(downloads, 2);
  assert.equal(await readFile(tool.executable, 'utf8'), bytes.toString());
  assert.deepEqual(await acquireOsvTool(request(root), runner, line => logs.push(line), dependencies), tool);
  assert.equal(downloads, 2);
  assert.ok(logs.some(line => line.includes('重用已驗證')));
  await writeFile(tool.executable, 'broken');
  await acquireOsvTool(request(root), runner, () => {}, dependencies);
  assert.equal(downloads, 4);
  assert.equal(await readFile(tool.executable, 'utf8'), bytes.toString());
}));

test('bad downloads are never executed or cached; incompatible actual version is rejected', () => fixture(async root => {
  let executions = 0;
  const asset = osvAsset(process.platform, process.arch);
  await assert.rejects(acquireOsvTool(request(root), async command => { executions++; return runner(command); }, () => {}, {
    download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${'0'.repeat(64)}  ${asset}`) : bytes,
  }), /SHA-256 不符/);
  assert.equal(executions, 0);
  await assert.rejects(acquireOsvTool(request(root), async () => ({ stdout: 'osv-scanner version: 2.7.0', stderr: '' }), () => {}, {
    download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes,
  }), /實際版本/);
}));

test('concurrent population only leaves a verified usable cache', () => fixture(async root => {
  const asset = osvAsset(process.platform, process.arch);
  const dependencies = { download: async (url: string) => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes };
  const results = await Promise.all([1, 2].map(() => acquireOsvTool(request(root), runner, () => {}, dependencies)));
  assert.equal(results[0].executable, results[1].executable);
  await acquireOsvTool(request(root), runner, () => {}, { download: async () => { throw new Error('must reuse'); } });
}));

test('delayed winner metadata is reused after a transient rename failure without republishing', () => fixture(async root => {
  const asset = osvAsset('win32', 'x64');
  let metadata: { source: string; target: string } | undefined;
  let attempts = 0;
  let downloads = 0;
  const logs: string[] = [];
  const tool = await acquireOsvTool(request(root), runner, line => logs.push(line), {
    platform: 'win32', arch: 'x64',
    download: async url => { downloads++; return url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes; },
    rename: async (source, target) => {
      attempts++;
      assert.equal(attempts, 1, 'completed winner must be reused without another publication');
      await copyFile(source, target);
      metadata = { source: `${source}.json`, target: `${target}.json` };
      throw Object.assign(new Error('locked'), { code: 'EPERM' });
    },
    sleep: async () => { assert.ok(metadata); await copyFile(metadata.source, metadata.target); },
  });
  assert.equal(downloads, 2);
  assert.equal(await readFile(tool.executable, 'utf8'), bytes.toString());
  assert.ok(logs.some(line => line.includes('重用已驗證')));
  await acquireOsvTool(request(root), runner, () => {}, {
    platform: 'win32', arch: 'x64', download: async () => { throw new Error('must reuse'); },
  });
}));

test('persistent transient publication failures use a verified private executable and preserve shared files', () => fixture(async root => {
  for (const platform of ['win32', 'linux']) {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      for (const lockMetadata of [false, true]) {
        const directory = join(root, `${platform}-${code}-${lockMetadata}`);
        const req = request(directory);
        const asset = osvAsset(platform, 'x64');
        const logs: string[] = [];
        const waits: number[] = [];
        let shared: string | undefined;
        let downloads = 0;
        const verified: string[] = [];
        const tool = await acquireOsvTool(req, async command => {
          assert.equal(await readFile(command.executable, 'utf8'), bytes.toString());
          if (command.args.includes('--version')) verified.push(command.executable);
          return runner(command);
        }, line => logs.push(line), {
          platform, arch: 'x64',
          download: async url => { downloads++; return url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes; },
          rename: async (source, target) => {
            if (lockMetadata && !String(target).endsWith('.json')) { await rename(source, target); return; }
            shared = String(target);
            await writeFile(target, 'other agent still publishing');
            throw Object.assign(new Error('locked'), { code });
          },
          sleep: async milliseconds => { waits.push(milliseconds); },
        });
        assert.equal(downloads, 2);
        assert.ok(waits.length > 1);
        assert.ok(waits.reduce((sum, value) => sum + value, 0) <= 2000);
        assert.ok(tool.executable.startsWith(`${req.tempDirectory}\\`) || tool.executable.startsWith(`${req.tempDirectory}/`));
        assert.ok(!tool.executable.startsWith(req.cacheDirectory));
        assert.equal(await readFile(tool.executable, 'utf8'), bytes.toString());
        assert.equal(verified.at(-1), tool.executable, 'returned executable must pass actual version verification');
        assert.equal(await readFile(shared!, 'utf8'), 'other agent still publishing');
        assert.ok(logs.some(line => /暫存/.test(line) && /快取/.test(line)));
        const cacheRoot = join(req.cacheDirectory, 'sbom-pilot-osv', req.version, `${platform}-x64`);
        assert.equal((await readdir(cacheRoot)).some(name => name.startsWith('.download-')), false);
        if (process.platform !== 'win32' && platform === 'linux') assert.equal((await stat(tool.executable)).mode & 0o111, 0o111);
      }
    }
  }
}));

test('temporary binary or metadata locks recover by publishing the cache without another download', () => fixture(async root => {
  for (const lockMetadata of [false, true]) {
    const req = request(join(root, String(lockMetadata)));
    const asset = osvAsset('win32', 'x64');
    let locked = true;
    let downloads = 0;
    const tool = await acquireOsvTool(req, runner, () => {}, {
      platform: 'win32', arch: 'x64',
      download: async url => { downloads++; return url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes; },
      rename: async (source, target) => {
        if (locked && String(target).endsWith('.json') === lockMetadata) throw Object.assign(new Error('locked'), { code: 'EBUSY' });
        await rename(source, target);
      },
      sleep: async () => { locked = false; },
    });
    assert.equal(downloads, 2);
    assert.ok(tool.executable.startsWith(req.cacheDirectory));
    await acquireOsvTool(req, runner, () => {}, { platform: 'win32', arch: 'x64', download: async () => { throw new Error('must reuse'); } });
  }
}));

test('non-transient publication errors fail immediately even when a winner completed', () => fixture(async root => {
  for (const code of ['ENOSPC', 'ENOENT', 'EIO']) {
    const asset = osvAsset('win32', 'x64');
    const failure = Object.assign(new Error('publication failed'), { code });
    let waits = 0;
    await assert.rejects(acquireOsvTool(request(join(root, code)), runner, () => {}, {
      platform: 'win32', arch: 'x64',
      download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes,
      rename: async (source, target) => {
        await copyFile(source, target);
        await copyFile(`${source}.json`, `${target}.json`);
        throw failure;
      },
      sleep: async () => { waits++; },
    }), error => error === failure);
    assert.equal(waits, 0);
  }
}));

test('private fallback still rejects an incompatible actual version', () => fixture(async root => {
  const asset = osvAsset('win32', 'x64');
  await assert.rejects(acquireOsvTool(request(root), async command => {
    if (command.executable.includes('osv-tool-')) return { stdout: 'osv-scanner version: 2.7.0', stderr: '' };
    return runner(command);
  }, () => {}, {
    platform: 'win32', arch: 'x64',
    download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes,
    rename: async () => { throw Object.assign(new Error('locked'), { code: 'EACCES' }); },
    sleep: async () => {},
  }), /實際版本/);
}));

test('single custom-named SBOM produces Markdown for no findings and findings, never hides technical exits', () => fixture(async root => {
  const req = request(root);
  const asset = osvAsset(process.platform, process.arch);
  await writeFile(req.sbom.path, '{"bomFormat":"CycloneDX","specVersion":"1.6"}');
  await acquireOsvTool(req, runner, () => {}, { download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes });
  for (const exitCode of [0, 1, 127, 128, 129]) {
    const logs: string[] = [];
    const run: ProcessRunner = async command => {
      if (command.args.includes('--version') || command.args.includes('--help')) return runner(command);
      const input = command.args.find(arg => arg.startsWith('--lockfile=:'))!.slice('--lockfile=:'.length);
      assert.equal(basename(input), 'sbom.cdx.json');
      assert.equal(await readFile(input, 'utf8'), await readFile(req.sbom.path, 'utf8'));
      assert.equal(command.args.includes('-r'), false);
      assert.equal(command.args.includes('--allow-no-lockfiles'), false);
      assert.deepEqual(command.acceptedExitCodes, [0, 1]);
      const output = command.args.find(arg => arg.startsWith('--output-file='))!.slice('--output-file='.length);
      assert.ok(command.args.includes('--format=json'));
      await writeFile(output, JSON.stringify(exitCode === 0 ? { results: [] } : { results: [{ packages: [{ package: { name: 'fixture', version: '1.0.0', ecosystem: 'npm' }, groups: [{ ids: ['GHSA-fixture'], aliases: ['CVE-2026-12345'], max_severity: '9.1' }] }] }] }));
      return { stdout: '', stderr: '', exitCode };
    };
    if (exitCode > 1) await assert.rejects(scanOsv(req, run, line => logs.push(line)), /未正常完成/);
    else {
      const report = await scanOsv(req, run, line => logs.push(line));
      assert.equal(basename(report.path), 'sbom.osv.md');
      assert.equal(report.findings, exitCode === 1);
      assert.deepEqual(report.findingList, exitCode === 1 ? [{
        severity: 'critical', ids: ['GHSA-fixture'], cves: ['CVE-2026-12345'], score: 9.1,
        ecosystem: 'npm', name: 'fixture', version: '1.0.0', fixed: [],
      }] : []);
      const markdown = await readFile(report.path, 'utf8');
      if (exitCode === 1) { assert.match(markdown, /危急 Critical/); assert.match(markdown, /CVE-2026-12345/); }
      assert.equal(logs.some(line => line.startsWith('##[warning]')), false);
    }
  }
  await assert.rejects(scanOsv(req, runner, () => {}), /ENOENT|Markdown/);
}));

test('scan exposes the complete sorted fixture list alongside the unchanged Markdown artifact without a duplicate warning', () => fixture(async root => {
  const req = request(root);
  const asset = osvAsset(process.platform, process.arch);
  await writeFile(req.sbom.path, '{}');
  await acquireOsvTool(req, runner, () => {}, { download: async url => url.endsWith('SHA256SUMS') ? Buffer.from(`${hash}  ${asset}`) : bytes });
  const logs: string[] = [];
  const report = await scanOsv(req, async command => {
    if (command.args.includes('--version') || command.args.includes('--help')) return runner(command);
    const output = command.args.find(arg => arg.startsWith('--output-file='))!.slice('--output-file='.length);
    await writeFile(output, JSON.stringify(findingsFixture));
    return { stdout: '', stderr: '', exitCode: 1 };
  }, line => logs.push(line));
  assert.deepEqual(report.findingList.map(row => [row.ids[0], row.severity]), [
    ['GHSA-9', 'critical'], ['GHSA-8', 'critical'], ['GHSA-7', 'high'], ['GHSA-6', 'high'],
    ['GHSA-5', 'medium'], ['GHSA-4', 'medium'], ['GHSA-3', 'low'], ['GHSA-2', 'low'],
    ['GHSA-1', 'none'], ['GHSA-0', 'unknown'],
  ]);
  assert.deepEqual(report.findingList[1], {
    severity: 'critical', ids: ['GHSA-8'], cves: ['CVE-2026-12345'], score: 9,
    ecosystem: 'NuGet', name: 'fixture', version: '9.0.4', fixed: ['9.0.21'],
  });
  assert.equal(await readFile(report.path, 'utf8'), await readFile('test/fixtures/osv-findings.md', 'utf8'));
  assert.equal(report.version, '2.7.1');
  assert.equal(report.findings, true);
  assert.equal(logs.some(line => line.startsWith('##[warning]')), false);
}));

test('process runner accepts only explicitly allowed finding exit and still rejects actual errors', async () => {
  const result = await runProcess({ executable: process.execPath, args: ['-e', 'process.exit(1)'], cwd: process.cwd(), acceptedExitCodes: [0, 1] });
  assert.equal(result.exitCode, 1);
  await assert.rejects(runProcess({ executable: process.execPath, args: ['-e', 'console.error("SECRET");process.exit(129)'], cwd: process.cwd(), acceptedExitCodes: [0, 1] }), error => error instanceof Error && /exit 129/.test(error.message) && !error.message.includes('SECRET'));
});

test('workflow publishes both files to custom artifact and preserves OSV, DT and artifact failures', () => fixture(async root => {
  const cfg = readTaskConfig(name => ({ projectPath: root, artifactName: 'Custom', sbomFileName: 'arbitrary.json', osvFailOn: 'warnOnly' })[name]);
  const events: string[] = [];
  const services: WorkflowServices = {
    log: () => {}, prepare: async () => ({ node: 'node', npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: {} }),
    installer: { install: async () => {} }, generate: async () => {}, validate: async path => ({ path, componentCount: 1 }),
    scanOsv: async req => { events.push('scan'); assert.equal(basename(req.sbom.path), 'arbitrary.json'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [{ severity: 'high', ids: ['OSV-1'], cves: [], ecosystem: 'npm', name: 'package', version: '1.0.0', fixed: [] }] }; },
    publish: async (sbom, name) => { events.push('sbom'); assert.equal(name, 'Custom'); assert.equal(basename(sbom.path), 'arbitrary.json'); },
    publishReport: async (report, name) => { events.push('report'); assert.equal(name, 'Custom'); assert.equal(basename(report.path), 'sbom.osv.md'); },
    publishSummary: async report => { events.push('summary'); assert.equal(basename(report.path), 'sbom.osv.md'); },
  };
  await runWorkflow(cfg, join(root, 'temp'), services);
  assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
  events.length = 0;
  await runWorkflow({ ...cfg, runOsv: false }, join(root, 'temp'), services);
  assert.deepEqual(events, ['sbom']);
  events.length = 0;
  const dt = { apiUrl: 'https://dt.invalid', projectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', apiKey: 'test', skipTlsCertificateCheck: false };
  await assert.rejects(runWorkflow({ ...cfg, uploadToDt: true, dt }, join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); throw new Error('scanner broken'); },
    upload: async () => { events.push('dt'); throw new Error('DT broken'); },
  }), error => error instanceof Error && /scanner broken/.test(error.message) && /DT broken/.test(error.message));
  assert.deepEqual(events, ['scan', 'dt', 'sbom']);
  events.length = 0;
  await assert.rejects(runWorkflow(cfg, join(root, 'temp'), { ...services, publish: async () => { events.push('sbom'); throw new Error('publication broken'); } }), /publication broken/);
  assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
  await assert.rejects(runWorkflow(cfg, join(root, 'temp'), { ...services, publishReport: async () => { throw new Error('report upload broken'); } }), /OSV 成品發佈.*report upload broken/);
  assert.equal(events.at(-1), 'summary', 'summary must still be attempted after artifact error');
  await assert.rejects(runWorkflow(cfg, join(root, 'temp'), { ...services, publishSummary: async () => { throw new Error('summary upload broken'); } }), /OSV 摘要發佈.*summary upload broken/);
  await assert.rejects(validateConfig({ ...cfg, osvVersion: '../bad' }), /OSV 版本/);
  assert.equal((await validateConfig({ ...cfg, runOsv: false, osvVersion: '../ignored' })).osvVersion, undefined);
}));
