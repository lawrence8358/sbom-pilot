import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { acquireOsvTool, scanOsv } = require('../.test-build/src/osv.js');
const { validateSbom } = require('../.test-build/src/validation.js');
const { runProcess } = require('../.test-build/src/process.js');
const { childNetworkEnvironment } = require('../.test-build/src/network/settings.js');
const base = resolve('.smoke/21', `${process.platform}-${process.arch}`);
await mkdir(base, { recursive: true });
const tempDirectory = await mkdtemp(join(base, 'run-'));
const options = {
  version: process.env.OSV_SMOKE_VERSION || 'latest', tempDirectory,
  cacheDirectory: join(base, 'tools'), env: await childNetworkEnvironment({ ...process.env }, tempDirectory),
};
const logs = [];
const log = message => { logs.push(message); console.log(message); };
const tool = await acquireOsvTool(options, runProcess, log);
const before = await stat(tool.executable);
const outcomes = [];
for (const [name, packageName, version, findings] of [
  ['vulnerable', 'lodash', '4.17.15', true],
  ['clean', 'sbom-pilot-synthetic-no-advisories-fixture', '1.0.0', false],
]) {
  const directory = join(tempDirectory, name);
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'custom-name.json');
  await writeFile(path, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
    components: [{ type: 'library', name: packageName, version, purl: `pkg:npm/${packageName}@${version}` }],
  }));
  const sbom = await validateSbom(path, '1.6');
  const report = await scanOsv({ ...options, version: tool.version, tempDirectory: directory, sbom }, runProcess, log);
  const contents = await readFile(report.path, 'utf8');
  assert.equal(report.findings, findings);
  if (findings) assert.match(contents, /lodash|OSV URL/);
  else assert.ok(contents.trim().length);
  outcomes.push({ name, version: report.version, findings: report.findings, path: report.path,
    sha256: createHash('sha256').update(contents).digest('hex') });
}
assert.equal((await stat(tool.executable)).mtimeMs, before.mtimeMs, 'warm cache must not be rewritten');
assert.ok(logs.filter(line => line.includes('重用已驗證')).length >= 2);
const evidence = { platform: process.platform, arch: process.arch, node: process.versions.node,
  version: tool.version, cacheReused: true, outcomes, liveAzure: false };
await writeFile(join(base, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
