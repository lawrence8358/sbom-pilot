import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTaskConfig, validateConfig } from '../src/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflow, type WorkflowServices } from '../src/workflow';
import { createOsvReport, type OsvFinding, type OsvSeverity } from '../src/osv-report';
import type { OsvFailOn } from '../src/osv-threshold';
import { commandFromString } from 'azure-pipelines-task-lib/taskcommand';

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

test('OSV threshold defaults to unknown, accepts six fixed values and rejects invalid inputs', () => {
  assert.equal(readTaskConfig(name => name === 'projectPath' ? 'root' : undefined).osvFailOn, 'unknown');
  for (const value of ['critical', 'high', 'medium', 'low', 'unknown', 'warnOnly']) {
    assert.equal(readTaskConfig(name => ({ projectPath: 'root', osvFailOn: value })[name]).osvFailOn, value);
  }
  for (const value of ['none', 'HIGH', 'warning', 'invalid']) {
    assert.throws(() => readTaskConfig(name => ({ projectPath: 'root', osvFailOn: value })[name]), /OSV 失敗門檻.*osvFailOn/);
  }
});

test('empty YAML OSV threshold inputs default to unknown', () => {
  for (const value of ['', ' ', '\t']) {
    assert.equal(readTaskConfig(name => ({ projectPath: 'root', osvFailOn: value })[name]).osvFailOn, 'unknown');
  }
});

test('default threshold blocks DT, preserves all publications and reports exceeded counts', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow(dtConfig(root), join(root, 'temp'), services), /OSV 弱點達到失敗門檻『未知』：高 1；已略過 DT 上傳。/);
  assert.deepEqual(events, ['scan', 'sbom', 'sbom', 'report', 'summary']);
  assert.ok(logs.some(message => /失敗門檻『未知』：高 1；已略過 DT 上傳。/.test(message)));
}));

test('workflow emits error issues with remediation details for findings at the threshold', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), osvFailOn: 'high' }, join(root, 'temp'), {
    ...services,
    scanOsv: async () => ({ path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [{
      ...finding('high'), name: 'Microsoft.Bcl.Memory', version: '9.0.4', ecosystem: 'NuGet',
      ids: ['GHSA-xxxx'], cves: ['CVE-2026-12345'], fixed: ['9.0.5'],
    }] }),
  }), /OSV 弱點達到失敗門檻/);
  assert.deepEqual(logs.filter(line => line.startsWith('##vso[task.logissue ')), [
    "##vso[task.logissue type=error;]OSV：套件 'Microsoft.Bcl.Memory' 9.0.4（NuGet）具有已知的 高 嚴重性弱點 GHSA-xxxx（CVE-2026-12345），修復版本 9.0.5，https://osv.dev/GHSA-xxxx",
  ]);
}));

test('warning-only issues preserve descending report severity and show missing CVE and fixes', () => workflowFixture(async (root, services, events, logs) => {
  const { findingList } = createOsvReport({ results: [{ packages: [{
    package: { name: 'package', version: '1.0.0', ecosystem: 'npm' },
    groups: ['', '0', '1', '4', '7', '9'].map(max_severity => ({ ids: ['OSV-1'], max_severity })),
  }] }] }, { version: '2.7.1', source: 'sbom.cdx.json', findings: true });
  const snapshot = structuredClone(findingList);
  await runWorkflow({ ...dtConfig(root), osvFailOn: 'warnOnly' }, join(root, 'temp'), {
    ...services, scanOsv: async () => ({ path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList }),
  });
  const issues = logs.filter(line => line.startsWith('##vso[task.logissue '));
  assert.deepEqual(issues.map(line => line.match(/已知的 (\S+) 嚴重性/)?.[1]), ['危急', '高', '中', '低', '無', '未知']);
  for (const line of issues) {
    assert.ok(line.startsWith('##vso[task.logissue type=warning;]'));
    assert.match(line, /OSV-1（未提供），修復版本 未提供，https:\/\/osv.dev\/OSV-1$/);
  }
  assert.deepEqual(findingList, snapshot, 'issue 排序不能修改報告清單');
  assert.deepEqual(events, ['dt', 'sbom', 'sbom', 'report', 'summary']);
}));

test('errors and warnings each retain the 50 highest risks with overflow summaries and a complete report', () => workflowFixture(async (root, services, events, logs) => {
  const findingList = [
    { ...finding('critical'), ids: ['CRITICAL'] },
    ...Array.from({ length: 51 }, (_, index) => ({ ...finding('high'), ids: [`HIGH-${index}`] })),
    { ...finding('medium'), ids: ['MEDIUM'] },
    ...Array.from({ length: 52 }, (_, index) => ({ ...finding('unknown'), ids: [`UNKNOWN-${index}`] })),
  ];
  await assert.rejects(runWorkflow({ ...dtConfig(root), osvFailOn: 'high' }, join(root, 'temp'), {
    ...services,
    scanOsv: async () => ({ path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList }),
    publishReport: async report => { events.push('report'); assert.deepEqual(report.findingList, findingList); assert.equal(report.findingList.length, 105); },
    publishSummary: async report => { events.push('summary'); assert.deepEqual(report.findingList, findingList); },
  }), /危急 1、高 51/);
  const issues = logs.filter(line => line.startsWith('##vso[task.logissue '));
  const errors = issues.filter(line => line.startsWith('##vso[task.logissue type=error;]'));
  const warnings = issues.filter(line => line.startsWith('##vso[task.logissue type=warning;]'));
  assert.equal(errors.length, 51);
  assert.equal(warnings.length, 51);
  assert.match(errors[0], /CRITICAL/);
  assert.match(errors[49], /HIGH-48（/);
  assert.equal(errors[50], '##vso[task.logissue type=error;]另有 2 筆，詳見 OSV 弱點報告');
  assert.match(warnings[0], /MEDIUM/);
  assert.match(warnings[49], /UNKNOWN-48（/);
  assert.equal(warnings[50], '##vso[task.logissue type=warning;]另有 3 筆，詳見 OSV 弱點報告');
  assert.deepEqual(issues, [...errors, ...warnings]);
  assert.deepEqual(events, ['sbom', 'sbom', 'report', 'summary']);
}));

test('external newlines, percent signs and command delimiters remain within one issue message', () => workflowFixture(async (root, services, events, logs) => {
  const external = "a;]\r\n##vso[task.complete result=Succeeded;]%0A%AZP25";
  await runWorkflow({ ...dtConfig(root), osvFailOn: 'warnOnly' }, join(root, 'temp'), {
    ...services,
    scanOsv: async () => ({ path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [{
      ...finding('low'), name: external, version: external, ecosystem: external,
      ids: [external, 'OSV-2'], cves: [external, 'CVE-2026-12345'], fixed: [external, '2.0.0'],
    }] }),
  });
  const issues = logs.filter(line => line.startsWith('##vso[task.logissue '));
  assert.equal(issues.length, 1);
  assert.doesNotMatch(issues[0], /[\r\n]/);
  assert.match(issues[0], /%0D%0A/);
  assert.match(issues[0], /%AZP250A%AZP25AZP25/);
  const parsed = commandFromString(issues[0]);
  assert.equal(parsed.command, 'task.logissue');
  assert.deepEqual(parsed.properties, { type: 'warning' });
  assert.equal(parsed.message, `OSV：套件 '${external}' ${external}（${external}）具有已知的 低 嚴重性弱點 ${external}、OSV-2（${external}、CVE-2026-12345），修復版本 ${external}、2.0.0，https://osv.dev/a%3B%5D%0D%0A%23%23vso%5Btask.complete%20result%3DSucceeded%3B%5D%250A%25AZP25、https://osv.dev/OSV-2`);
}));

test('exactly 50 findings per type produce no overflow summary', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), osvFailOn: 'high' }, join(root, 'temp'), {
    ...services, scanOsv: async () => ({ path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true,
      findingList: [...Array.from({ length: 50 }, () => finding('high')), ...Array.from({ length: 50 }, () => finding('low'))],
    }),
  }), /高 50/);
  const issues = logs.filter(line => line.startsWith('##vso[task.logissue '));
  assert.equal(issues.filter(line => line.startsWith('##vso[task.logissue type=error;]')).length, 50);
  assert.equal(issues.filter(line => line.startsWith('##vso[task.logissue type=warning;]')).length, 50);
  assert.ok(issues.every(line => !line.includes('另有')));
}));

test('OSV technical failure blocks DT, preserves the valid SBOM and logs the skip reason', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow(dtConfig(root), join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); throw new Error('scanner broken'); },
  }), /OSV 弱點掃描.*scanner broken/);
  assert.deepEqual(events, ['scan', 'sbom', 'sbom']);
  assert.ok(logs.some(message => /OSV.*失敗.*已略過 DT 上傳/.test(message)));
  assert.ok(!logs.some(message => message.startsWith('##vso[task.logissue ')));
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
    test(`OSV threshold ${threshold} handles ${severity} at the specified risk boundary`, () => workflowFixture(async (root, services, events, logs) => {
      const cfg = { ...dtConfig(root), osvFailOn: threshold };
      const completion = runWorkflow(cfg, join(root, 'temp'), {
        ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [finding(severity)] }; },
      });
      if (blockedSeverities.includes(severity)) {
        await assert.rejects(completion, /OSV 弱點達到失敗門檻.*已略過 DT 上傳/);
        assert.deepEqual(events, ['scan', 'sbom', 'sbom', 'report', 'summary']);
      } else {
        assert.equal((await completion).componentCount, 1);
        assert.deepEqual(events, ['scan', 'dt', 'sbom', 'sbom', 'report', 'summary']);
      }
      const issues = logs.filter(line => line.startsWith('##vso[task.logissue '));
      assert.equal(issues.length, 1);
      assert.ok(issues[0].startsWith(`##vso[task.logissue type=${blockedSeverities.includes(severity) ? 'error' : 'warning'};]`));
    }));
  }
}

test('only exceeded findings are counted in descending risk order alongside all publication failures', () => workflowFixture(async (root, services, events) => {
  const cfg = { ...dtConfig(root), osvFailOn: 'high' as const };
  await assert.rejects(runWorkflow(cfg, join(root, 'temp'), {
    ...services,
    scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: ['low', 'high', 'unknown', 'critical', 'high', 'none', 'medium', 'high'].map(value => finding(value as OsvSeverity)) }; },
    publish: async () => { events.push('sbom'); throw new Error('SBOM broken'); },
    publishReport: async () => { events.push('report'); throw new Error('report broken'); },
    publishSummary: async () => { events.push('summary'); throw new Error('summary broken'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'OSV 弱點達到失敗門檻『高』：危急 1、高 3；已略過 DT 上傳。；[成品發佈] SBOM broken；[成品發佈] SBOM broken；[OSV 成品發佈] report broken；[OSV 摘要發佈] summary broken');
    return true;
  });
  assert.deepEqual(events, ['scan', 'sbom', 'sbom', 'report', 'summary']);
}));

test('unknown threshold counts zero and unknown scores without claiming disabled DT was skipped', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), uploadToDt: false }, join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: true, findingList: [finding('unknown'), finding('none')] }; },
  }), /OSV 弱點達到失敗門檻『未知』：無 1、未知 1。$/);
  assert.deepEqual(events, ['scan', 'sbom', 'sbom', 'report', 'summary']);
  assert.ok(!logs.some(message => message.includes('已略過 DT 上傳')));
}));

test('warning-only mode attempts DT after OSV failure and preserves DT and SBOM errors', () => workflowFixture(async (root, services, events, logs) => {
  await assert.rejects(runWorkflow({ ...dtConfig(root), osvFailOn: 'warnOnly' }, join(root, 'temp'), {
    ...services,
    scanOsv: async () => { events.push('scan'); throw new Error('scanner broken'); },
    upload: async () => { events.push('dt'); throw new Error('DT broken'); },
    publish: async () => { events.push('sbom'); throw new Error('SBOM broken'); },
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, '[OSV 弱點掃描] scanner broken；[DT 上傳] DT broken；[成品發佈] SBOM broken；[成品發佈] SBOM broken');
    return true;
  });
  assert.deepEqual(events, ['scan', 'dt', 'sbom', 'sbom']);
  assert.ok(!logs.some(message => message.includes('已略過 DT 上傳')));
  assert.ok(!logs.some(message => message.startsWith('##vso[task.logissue ')));
}));

test('disabled OSV ignores invalid thresholds and still uploads DT and publishes SBOM', () => workflowFixture(async (root, services, events, logs) => {
  await runWorkflow(Object.assign({}, dtConfig(root), { runOsv: false, osvFailOn: 'bad' }), join(root, 'temp'), services);
  assert.deepEqual(events, ['dt', 'sbom', 'sbom']);
  assert.ok(!logs.some(message => message.startsWith('##vso[task.logissue ')));
}));

test('unknown threshold succeeds without findings and retains DT and all publications', () => workflowFixture(async (root, services, events, logs) => {
  await runWorkflow(dtConfig(root), join(root, 'temp'), {
    ...services, scanOsv: async () => { events.push('scan'); return { path: join(root, 'sbom.osv.md'), version: '2.7.1', findings: false, findingList: [] }; },
  });
  assert.deepEqual(events, ['scan', 'dt', 'sbom', 'sbom', 'report', 'summary']);
  assert.ok(!logs.some(message => message.startsWith('##vso[task.logissue ')));
}));

test('task exposes the OSV threshold options, default, visibility and CVSS boundaries', async () => {
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

test('workflow validation defaults and validates the threshold while disabled OSV ignores it', async () => {
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
