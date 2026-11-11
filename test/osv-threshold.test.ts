import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTaskConfig, validateConfig } from '../src/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflow, type WorkflowServices } from '../src/workflow';
import type { OsvFinding, OsvSeverity } from '../src/osv-report';
import type { OsvFailOn } from '../src/osv-threshold';

// 透過 workflow 的服務邊界觀察 DT、成品及摘要，避免執行外部工具或網路請求。
async function workflowFixture(action: (root: string, services: WorkflowServices, events: string[], logs: string[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'sbom-threshold-'));
  const events: string[] = [], logs: string[] = [];
  const services: WorkflowServices = {
    log: message => { logs.push(message); },
    prepare: async () => ({ node: 'node', npmCli: 'npm', cdxgenCli: 'cdxgen', nodeVersion: '24.22.2', cdxgenVersion: '13.6.0', env: {} }),
    installer: { install: async () => {} }, generate: async () => {},
    validate: async path => ({ path, componentCount: 1 }),
    scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [finding('high')] }; },
    upload: async () => { events.push('dt'); },
    publish: async () => { events.push('sbom'); },
    publishReport: async () => { events.push('report'); },
    publishSummary: async () => { events.push('summary'); },
  };
  try { await action(root, services, events, logs); } finally { await rm(root, { recursive: true, force: true }); }
}

// 建立具有指定風險等級的單筆弱點，讓測試只關注門檻行為。
function finding(severity: OsvSeverity): OsvFinding {
  return { severity, ids: ['OSV-1'], cves: [], ecosystem: 'npm', name: 'package', version: '1.0.0', fixed: [] };
}

// 使用公開設定解析介面建立啟用 DT 的有效工作設定。
function dtConfig(root: string) {
  return readTaskConfig(name => ({ projectPath: root, uploadToDt: 'true', dtApiUrl: 'https://dt.invalid', dtProjectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', dtApiKey: 'fixture' })[name]);
}

test('OSV 失敗門檻預設未知，接受六個固定值並拒絕其他輸入', () => {
  assert.equal(readTaskConfig(name => name === 'projectPath' ? 'root' : undefined).osvFailOn, 'unknown');
  for (const value of ['critical', 'high', 'medium', 'low', 'unknown', 'warnOnly']) {
    assert.equal(readTaskConfig(name => ({ projectPath: 'root', osvFailOn: value })[name]).osvFailOn, value);
  }
  for (const value of ['', ' ', 'none', 'HIGH', 'warning', 'invalid']) {
    assert.throws(() => readTaskConfig(name => ({ projectPath: 'root', osvFailOn: value })[name]), /OSV 失敗門檻.*osvFailOn/);
  }
});

test('預設門檻阻擋 DT、保留三項發佈，並在錯誤及 log 說明超標數量', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow(dtConfig(root), join(root, 'temp'), services), /OSV 弱點達到失敗門檻『未知』：高 1；已略過 DT 上傳。/);
  assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
  assert.ok(logs.some(message => /失敗門檻『未知』：高 1；已略過 DT 上傳。/.test(message)));
}));

test('OSV 技術失敗時阻擋 DT、保留有效 SBOM 並說明略過原因', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow(dtConfig(root), join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); throw new Error('scanner broken'); },
  }), /OSV 弱點掃描.*scanner broken/);
  assert.deepEqual(events, ['scan', 'sbom']);
  assert.ok(logs.some(message => /OSV.*失敗.*已略過 DT 上傳/.test(message)));
}));

// 預期阻擋集合直接取自規格，逐一驗證等於門檻、低於門檻、無與未知的邊界。
const thresholdCases: [OsvFailOn, OsvSeverity[]][] = [
  ['critical', ['critical']],
  ['high', ['critical', 'high']],
  ['medium', ['critical', 'high', 'medium']],
  ['low', ['critical', 'high', 'medium', 'low']],
  ['unknown', ['critical', 'high', 'medium', 'low', 'none', 'unknown']],
  ['warnOnly', []],
];
for (const [threshold, blockedSeverities] of thresholdCases) {
  for (const severity of ['critical', 'high', 'medium', 'low', 'none', 'unknown'] as const) {
    test(`OSV 門檻 ${threshold} 遇到 ${severity} 時依風險邊界決定 DT 與工作結果`, () => workflowFixture(async (root, services, events) => {
      const cfg = { ...dtConfig(root), osvFailOn: threshold };
      const completion = runWorkflow(cfg, join(root, 'temp'), {
        ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [finding(severity)] }; },
      });
      if (blockedSeverities.includes(severity)) {
        await assert.rejects(completion, /OSV 弱點達到失敗門檻.*已略過 DT 上傳/);
        assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
      } else {
        assert.equal((await completion).componentCount, 1);
        assert.deepEqual(events, ['scan', 'dt', 'sbom', 'report', 'summary']);
      }
    }));
  }
}

test('僅計算超標弱點並依危急到低風險彙整，與三項發佈錯誤全部回報', () => workflowFixture(async (root, services, events) => {
  const cfg = { ...dtConfig(root), osvFailOn: 'high' as const };
  await assert.rejects(runWorkflow(cfg, join(root, 'temp'), {
    ...services,
    scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: ['low', 'high', 'unknown', 'critical', 'high', 'none', 'medium', 'high'].map(value => finding(value as OsvSeverity)) }; },
    publish: async () => { events.push('sbom'); throw new Error('SBOM broken'); },
    publishReport: async () => { events.push('report'); throw new Error('report broken'); },
    publishSummary: async () => { events.push('summary'); throw new Error('summary broken'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'OSV 弱點達到失敗門檻『高』：危急 1、高 3；已略過 DT 上傳。；[成品發佈] SBOM broken；[OSV 成品發佈] report broken；[OSV 摘要發佈] summary broken');
    return true;
  });
  assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
}));

test('未知門檻的錯誤數量包含無與未知，DT 未啟用仍因超標失敗且不宣稱略過 DT', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), uploadToDt: false }, join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [finding('unknown'), finding('none')] }; },
  }), /OSV 弱點達到失敗門檻『未知』：無 1、未知 1。$/);
  assert.deepEqual(events, ['scan', 'sbom', 'report', 'summary']);
  assert.ok(!logs.some(message => message.includes('已略過 DT 上傳')));
}));

test('僅警告模式下 OSV 技術失敗仍上傳 DT，並保留 DT 與 SBOM 錯誤', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), osvFailOn: 'warnOnly' }, join(root, 'temp'), {
    ...services,
    scanOsv: async () => { events.push('scan'); throw new Error('scanner broken'); },
    upload: async () => { events.push('dt'); throw new Error('DT broken'); },
    publish: async () => { events.push('sbom'); throw new Error('SBOM broken'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, '[OSV 弱點掃描] scanner broken；[DT 上傳] DT broken；[成品發佈] SBOM broken');
    return true;
  });
  assert.deepEqual(events, ['scan', 'dt', 'sbom']);
  assert.ok(!logs.some(message => message.includes('已略過 DT 上傳')));
}));

test('未啟用 OSV 時忽略非法門檻並照常上傳 DT 及發佈 SBOM', () => workflowFixture(async (root, services, events) => {
  await runWorkflow(Object.assign({}, dtConfig(root), { runOsv: false, osvFailOn: 'bad' }), join(root, 'temp'), services);
  assert.deepEqual(events, ['dt', 'sbom']);
}));

test('沒有弱點時未知門檻正常完成，DT 與三項發佈照常執行', () => workflowFixture(async (root, services, events) => {
  await runWorkflow(dtConfig(root), join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: false, findingList: [] }; },
  });
  assert.deepEqual(events, ['scan', 'dt', 'sbom', 'report', 'summary']);
}));

test('Task 公開 OSV 失敗門檻選單、預設、顯示條件及 CVSS 邊界說明', async () => {
  const manifest = JSON.parse(await readFile('src/task.json', 'utf8'));
  const input = manifest.inputs.find((item: { name: string }) => item.name === 'osvFailOn');
  assert.ok(input, '缺少 osvFailOn 輸入');
  assert.equal(input.type, 'pickList');
  assert.equal(input.label, 'OSV 失敗門檻');
  assert.equal(input.defaultValue, 'unknown');
  assert.equal(input.visibleRule, 'runOsv = true');
  assert.deepEqual(input.options, { critical: '危急', high: '高', medium: '中', low: '低', unknown: '未知', warnOnly: '僅警告' });
  assert.ok(manifest.inputs.indexOf(input) < manifest.inputs.findIndex((item: { name: string }) => item.name === 'uploadToDt'));
  for (const text of ['9.0', '7.0', '4.0', '>0', '=0', '未知', '僅警告', 'DT', 'SBOM', '摘要']) assert.ok(input.helpMarkDown.includes(text), text);
  assert.doesNotMatch(manifest.inputs.find((item: { name: string }) => item.name === 'runOsv').helpMarkDown, /發現弱點只警告/);
});

test('OSV 失敗門檻在工作流程驗證時套用預設並拒絕非法值，停用 OSV 時不讀取門檻', async () => {
  const cfg = readTaskConfig(name => name === 'projectPath' ? process.cwd() : undefined);
  assert.equal((await validateConfig({ ...cfg, osvFailOn: undefined })).osvFailOn, 'unknown');
  await assert.rejects(validateConfig(Object.assign({}, cfg, { osvFailOn: 'bad' })), /OSV 失敗門檻.*osvFailOn/);
  const disabled = readTaskConfig(name => {
    if (name === 'osvFailOn') throw new Error('不應讀取隱藏門檻');
    return ({ projectPath: process.cwd(), runOsv: 'false' })[name];
  });
  assert.equal(disabled.osvFailOn, undefined);
  assert.equal((await validateConfig(Object.assign({}, disabled, { osvFailOn: 'bad' }))).osvFailOn, undefined);
});
