import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type RequestListener } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { uploadToDependencyTrack } from '../src/dt/upload';
import { readTaskConfig, type TaskConfig } from '../src/config';
import { validateDtConfig, type DtConfig } from '../src/dt/config';
import { runWorkflow } from '../src/workflow';
import type { ToolContext } from '../src/tools';

const PROJECT = 'd40ce445-3566-49d5-bd8d-2601d73cf0d4';
const TOKEN = '01d006ca-5135-4c79-9eeb-4fca84590138';
const KEY = 'synthetic-test-key-never-log';
const config = (url: string): DtConfig => ({ apiUrl: url, projectUuid: PROJECT, apiKey: KEY, skipTlsCertificateCheck: false });
const policy = { timeoutMs: 250, maxAttempts: 3, retryDelayMs: 0 };
const validContents = '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[{"name":"vue","type":"library"}]}';
async function fixture(action: (root: string, sbom: { path: string; componentCount: number }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-dt-'));
  const path = join(root, 'bom.json');
  await writeFile(path, validContents);
  try { await action(root, { path, componentCount: 1 }); } finally { await rm(root, { recursive: true, force: true }); }
}
async function serve(handler: RequestListener, action: (url: string) => Promise<void>, tls?: { key: string; cert: string }) {
  const server: Server = tls ? createTlsServer(tls, handler) : createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try { await action(`${tls ? 'https' : 'http'}://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
test('DT fields are only read when enabled; required fields, UUID, URL and TLS boolean validate', () => {
  const disabled = readTaskConfig(name => {
    if (name.startsWith('dt') || name === 'skipDtTlsCertificateCheck') throw new Error('DT fields must be ignored');
    return name === 'projectPath' ? 'root' : undefined;
  });
  assert.equal(disabled.dt, undefined);
  const values: Record<string, string> = { projectPath: 'root', uploadToDt: 'true', dtProjectUuid: PROJECT, dtApiKey: KEY };
  const enabled = readTaskConfig(name => values[name]);
  assert.equal(enabled.dt?.apiUrl, 'http://localhost:8081');
  assert.equal(enabled.dt?.skipTlsCertificateCheck, false);
  for (const missing of ['dtProjectUuid', 'dtApiKey']) {
    assert.throws(() => readTaskConfig(name => name === missing ? undefined : values[name]), /必須/);
  }
  for (const url of ['ftp://host', 'http://user:password@host', 'https://host?key=x', 'https://host#fragment']) assert.throws(() => validateDtConfig(config(url)), /URL/);
  assert.throws(() => validateDtConfig({ ...config('http://host'), projectUuid: 'bad' }), /UUID/);
  assert.throws(() => readTaskConfig(name => name === 'skipDtTlsCertificateCheck' ? 'yes' : values[name]), /true.*false/);
});
test('HTTP accepts exact validated SBOM bytes for existing UUID and does not poll or create projects', () => fixture(async (_root, sbom) => {
  let count = 0;
  const logs: string[] = [];
  await serve((request, response) => {
    count++;
    assert.equal(request.method, 'PUT');
    assert.equal(request.url, '/prefix/api/v1/bom');
    assert.equal(request.headers['x-api-key'], KEY);
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const data = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(data.project, PROJECT);
      assert.equal(data.autoCreate, false);
      assert.equal(data.projectName, undefined);
      assert.equal(Buffer.from(data.bom, 'base64').toString(), validContents);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token: TOKEN }));
    });
  }, async url => uploadToDependencyTrack(sbom, config(`${url}/prefix/`), line => logs.push(line), { policy }));
  assert.equal(count, 1);
  assert.match(logs.join(''), /已接受上傳/);
  assert.equal(logs.join('').includes(KEY), false);
  assert.equal(logs.join('').includes(TOKEN), false);
}));
test('HTTP authentication failure is terminal and secret-bearing body never reaches errors or logs', () => fixture(async (_root, sbom) => {
  let count = 0;
  const logs: string[] = [];
  await serve((_request, response) => { count++; response.writeHead(401).end(`server echoed ${KEY}`); }, async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), line => logs.push(line), { policy }), error => error instanceof Error && /401/.test(error.message) && !error.message.includes(KEY));
  });
  assert.equal(count, 1);
  assert.equal(logs.join('').includes(KEY), false);
}));
test('transient HTTP responses retry finitely and acceptance stops further requests', () => fixture(async (_root, sbom) => {
  let count = 0;
  await serve((_request, response) => {
    count++;
    if (count < 3) response.writeHead(503).end(KEY);
    else response.writeHead(202).end(JSON.stringify({ token: TOKEN }));
  }, async url => uploadToDependencyTrack(sbom, config(url), () => {}, { policy }));
  assert.equal(count, 3);
  count = 0;
  await serve((_request, response) => { count++; response.writeHead(429).end(KEY); }, async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /429/);
  });
  assert.equal(count, 3);
}));
test('total request timeout bounds retries and never leaks server data', () => fixture(async (_root, sbom) => {
  let count = 0;
  const start = Date.now();
  await serve((_request, _response) => { count++; }, async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy: { ...policy, timeoutMs: 40, maxAttempts: 2 } }), /逾時/);
  });
  assert.equal(count, 2);
  assert.ok(Date.now() - start < 2000);
}));
test('unexpected transport exceptions never expose key-bearing messages', () => fixture(async (_root, sbom) => {
  let calls = 0;
  await assert.rejects(uploadToDependencyTrack(sbom, config('http://127.0.0.1'), () => {}, {
    policy: { ...policy, maxAttempts: 1 },
    transport: async () => { calls++; throw new Error(`X-Api-Key: ${KEY}`); },
  }), error => error instanceof Error && !error.message.includes(KEY) && /傳輸失敗/.test(error.message));
  assert.equal(calls, 1);
}));
test('redirects are not followed, malformed acceptance and oversized responses fail safely', () => fixture(async (_root, sbom) => {
  let count = 0;
  await serve((_request, response) => { count++; response.writeHead(302, { Location: 'http://127.0.0.1:1/steal' }).end(KEY); }, async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /302/);
  });
  assert.equal(count, 1);
  await serve((_request, response) => response.writeHead(200).end(`{"token":"${KEY}"}`), async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /接受 token/);
  });
  await serve((_request, response) => response.writeHead(200).end('x'.repeat(65 * 1024)), async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /大小限制/);
  });
}));
test('workflow attempts artifact publication after DT error and returns failure; disabled DT makes no request', () => fixture(async (root, sbom) => {
  const tools: ToolContext = { node: process.execPath, npmCli: '', cdxgenCli: '', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: process.env };
  const input: TaskConfig = { environment: 'vue', projectPath: root, nodeVersion: '24.x', cdxgenVersion: '13.6.0', specVersion: '1.6', excludes: [], fetchLicense: true, noCache: true, uploadToDt: true, dt: config('http://127.0.0.1:1') };
  let uploaded = 0, published = 0;
  const logs: string[] = [];
  const services = { log: (message: string) => { logs.push(message); }, prepare: async () => tools, installer: { install: async () => {} }, generate: async () => {}, validate: async () => sbom,
    upload: async (actual: typeof sbom) => { uploaded++; assert.equal(logs.at(-1), '##[section]開始上傳 SBOM 至 Dependency-Track（DT）'); assert.equal(actual.path, sbom.path); throw new Error('DT rejected'); },
    publish: async (actual: typeof sbom) => { published++; assert.equal(logs.at(-1), '##[section]開始發佈 SBOM 成品（Azure Pipelines）'); assert.equal(await readFile(actual.path, 'utf8'), validContents); },
  };
  await assert.rejects(runWorkflow(input, join(root, 'run'), services), /DT 上傳.*DT rejected/);
  assert.equal(uploaded, 1); assert.equal(published, 1);
  assert.deepEqual(logs.filter(line => line.startsWith('##[section]')), [
    '##[section]開始驗證工作設定', '##[section]開始安裝／還原專案依賴',
    '##[section]開始產生 SBOM（cdxgen）', '##[section]開始驗證 SBOM（CycloneDX）',
    '##[section]開始上傳 SBOM 至 Dependency-Track（DT）', '##[section]開始發佈 SBOM 成品（Azure Pipelines）',
  ]);
  logs.length = 0;
  await runWorkflow({ ...input, uploadToDt: false }, join(root, 'off'), services);
  assert.equal(uploaded, 1); assert.equal(published, 2);
  assert.ok(!logs.some(line => line.includes('開始上傳 SBOM 至')));
  assert.ok(logs.includes('DT 上傳未啟用，略過此階段。'));
  await assert.rejects(runWorkflow(input, join(root, 'publish-failed'), { ...services, publish: async () => { throw new Error('artifact failed'); } }), /成品發佈/);
  const { upload: _injectedUpload, ...defaultServices } = services;
  const beforeDefaultUpload = published;
  await serve((_request, response) => response.writeHead(401).end(KEY), async url => {
    await assert.rejects(runWorkflow({ ...input, dt: config(url) }, join(root, 'default-uploader'), defaultServices), /DT 上傳.*401/);
  });
  assert.equal(published, beforeDefaultUpload + 1);
}));
test('self-signed TLS is rejected by default and explicit skip applies only to DT request', () => fixture(async (_root, sbom) => {
  const key = await readFile('test/fixtures/localhost.key.pem', 'utf8');
  const cert = await readFile('test/fixtures/localhost.cert.pem', 'utf8');
  let accepted = 0;
  const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  await serve((_request, response) => { accepted++; response.writeHead(200).end(JSON.stringify({ token: TOKEN })); }, async url => {
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /TLS 憑證/);
    assert.equal(accepted, 0);
    await uploadToDependencyTrack(sbom, { ...config(url), skipTlsCertificateCheck: true }, () => {}, { policy });
    assert.equal(accepted, 1);
    assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, original);
    await assert.rejects(uploadToDependencyTrack(sbom, config(url), () => {}, { policy }), /TLS 憑證/);
  }, { key, cert });
}));
test('actual bundled debug entrypoint registers API key without SDK input-value logging', () => fixture(async root => {
  const bundle = resolve('.test-build/dt-entrypoint.js');
  await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: bundle, external: ['azure-pipelines-task-lib', 'azure-pipelines-tool-lib'], alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' } });
  const result = spawnSync(process.execPath, [bundle], { env: { ...process.env, SYSTEM_DEBUG: 'true', BUILD_BUILDID: '1', AGENT_TEMPDIRECTORY: root, INPUT_DTAPIKEY: KEY, INPUT_UPLOADTODT: 'true', INPUT_DTPROJECTUUID: PROJECT, INPUT_ENVIRONMENT: 'unsupported', INPUT_PROJECTPATH: root }, encoding: 'utf8' });
  const lines = `${result.stdout}${result.stderr}`.split(/\r?\n/);
  const keyLines = lines.filter(line => line.includes(KEY));
  assert.equal(keyLines.length, 1);
  assert.match(keyLines[0], /^##vso\[task.setsecret\]/);
  assert.equal(lines.some(line => /dtApiKey=/.test(line)), false);
  assert.ok(lines.some(line => /參數驗證/.test(line)));
}));
