import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { readTaskConfig } from '../src/config';
import { runWorkflow, type WorkflowServices } from '../src/workflow';
import type { OsvTabReport } from '../src/shared/osv-tab-contract';
import type { OsvFinding } from '../src/osv-report';

const product: OsvFinding = { severity: 'low', score: 2, ecosystem: 'npm', name: '產品', version: '1', ids: ['OSV-product'], cves: [], fixed: ['2'], published: '2026-01-01', modified: '2026-11-01' };
const dev: OsvFinding = { ...product, severity: 'high', score: 8, name: '建置工具', ids: ['OSV-dev'] };

async function fixture(action: (root: string, services: WorkflowServices, attachments: OsvTabReport[], artifacts: string[], summaries: string[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-tab-'));
  const attachments: OsvTabReport[] = [], artifacts: string[] = [], summaries: string[] = [];
  const services = {
    log: () => {},
    prepare: async () => ({ node: 'node', npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: {} }),
    installer: { install: async () => {} }, generate: async () => {},
    validate: async (path: string) => ({ path, componentCount: 1 }),
    scanOsv: async (request: { variant?: 'product' | 'full' }) => ({ path: `${request.variant}.md`, version: '2.7.1', findings: true, findingList: request.variant === 'product' ? [product] : [product, dev] }),
    publish: async (sbom: { path: string }) => { artifacts.push(basename(sbom.path)); },
    publishReport: async (report: { path: string }) => { artifacts.push(report.path); },
    publishSummary: async () => { summaries.push('legacy'); },
    publishTabReport: async (report: OsvTabReport) => { attachments.push(JSON.parse(JSON.stringify(report))); },
  };
  try { await action(root, services, attachments, artifacts, summaries); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('workflow publishes one contract attachment with full threshold verdict and development extras instead of an Extensions summary', () => fixture(async (root, services, attachments, artifacts, summaries) => {
  const config = readTaskConfig(name => ({ projectPath: root, sbomFileName: 'PrimeX.JSON', osvFailOn: 'high', uploadToDt: 'true', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]);
  const start = Date.now();
  await assert.rejects(runWorkflow(config, root, services), /失敗門檻/);
  assert.equal(attachments.length, 1);
  const report = attachments[0];
  assert.ok(Date.parse(report.generatedAt) >= start && Date.parse(report.generatedAt) <= Date.now());
  assert.match(report.generatedAt, /(?:Z|[+-]\d\d:\d\d)$/);
  assert.deepEqual({ ...report, generatedAt: 'time' }, {
    schemaVersion: 1, generatedAt: 'time', scannerVersion: '2.7.1', threshold: 'high', exceeded: true, dtSkipped: true,
    sboms: { product: 'PrimeX.JSON', full: 'PrimeX-dev.json' },
    product: { status: 'completed', findings: [product] }, devExtra: { status: 'completed', findings: [dev] },
  });
  assert.deepEqual(artifacts, ['PrimeX.JSON', 'PrimeX-dev.json', 'product.md', 'full.md']);
  assert.deepEqual(summaries, []);
}));

for (const failed of [['product'], ['full'], ['product', 'full']]) for (const threshold of ['high', 'warnOnly'] as const) {
  test(`${failed.join('+')} OSV failure at ${threshold} attaches honest failed section states and preserves the successful product data`, () => fixture(async (root, services, attachments) => {
    const config = readTaskConfig(name => ({ projectPath: root, osvFailOn: threshold })[name]);
    await assert.rejects(runWorkflow(config, root, {
      ...services,
      scanOsv: async request => {
        if (failed.includes(request.variant!)) throw new Error(`${request.variant} failed`);
        return { path: `${request.variant}.md`, version: '2.7.1', findings: true, findingList: request.variant === 'product' ? [product] : [product, dev] };
      },
    }), error => {
      assert.ok(error instanceof Error);
      for (const variant of failed) assert.ok(error.message.includes(`${variant} failed`));
      return true;
    });
    assert.equal(attachments.length, 1);
    assert.deepEqual(attachments[0].product, failed.includes('product') ? { status: 'failed', findings: [] } : { status: 'completed', findings: [product] });
    // 差集需要兩份結果；任一份失敗時不能宣稱開發套件沒有額外弱點。
    assert.deepEqual(attachments[0].devExtra, { status: 'failed', findings: [] });
    assert.equal(attachments[0].scannerVersion, failed.length === 2 ? undefined : '2.7.1');
    assert.equal(attachments[0].exceeded, !failed.includes('full') && threshold === 'high');
    assert.equal(attachments[0].dtSkipped, false, 'DT 未啟用，不能宣稱略過上傳');
  }));
}

for (const threshold of ['high', 'warnOnly'] as const) {
  test(`technical failure at ${threshold} reports DT skip independently of exceeded findings`, () => fixture(async (root, services, attachments) => {
    const config = readTaskConfig(name => ({ projectPath: root, osvFailOn: threshold, uploadToDt: 'true', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]);
    let uploads = 0;
    await assert.rejects(runWorkflow(config, root, {
      ...services, upload: async () => { uploads++; },
      scanOsv: async () => { throw new Error('scanner broken'); },
    }), /scanner broken/);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].exceeded, false);
    assert.equal(attachments[0].dtSkipped, threshold === 'high');
    assert.equal(uploads, threshold === 'high' ? 0 : 1);
  }));
}

test('attachment failure is aggregated with scan and artifact failures after all four publications are attempted', () => fixture(async (root, services, _attachments, artifacts) => {
  const config = readTaskConfig(name => ({ projectPath: root, osvFailOn: 'high' })[name]);
  await assert.rejects(runWorkflow(config, root, {
    ...services,
    publish: async sbom => { artifacts.push(basename(sbom.path)); throw new Error('artifact broken'); },
    publishTabReport: async () => { throw new Error('attachment broken'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /失敗門檻/);
    assert.equal((error.message.match(/artifact broken/g) ?? []).length, 2);
    assert.match(error.message, /OSV 頁籤附件發佈.*attachment broken/);
    return true;
  });
  assert.deepEqual(artifacts, ['sbom.cdx.json', 'sbom.cdx-dev.json', 'product.md', 'full.md']);
}));

test('disabled OSV still attaches disabled sections without scanning or publishing Markdown', () => fixture(async (root, services, attachments, artifacts, summaries) => {
  await runWorkflow(readTaskConfig(name => ({ projectPath: root, runOsv: 'false' })[name]), root, {
    ...services, scanOsv: async () => { throw new Error('disabled scanner must not run'); },
  });
  assert.equal(attachments.length, 1);
  assert.deepEqual(attachments[0].product, { status: 'disabled', findings: [] });
  assert.deepEqual(attachments[0].devExtra, { status: 'disabled', findings: [] });
  assert.equal(attachments[0].threshold, undefined);
  assert.equal(attachments[0].scannerVersion, undefined);
  assert.equal(attachments[0].exceeded, false);
  assert.equal(attachments[0].dtSkipped, false);
  assert.deepEqual(artifacts, ['sbom.cdx.json', 'sbom.cdx-dev.json']);
  assert.deepEqual(summaries, []);
}));
