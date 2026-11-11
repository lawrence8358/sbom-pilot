import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import findingsFixture from './fixtures/osv-findings.json';
import { createOsvReport } from '../src/osv-report';

const options = { version: '2.7.1', source: 'sbom.cdx.json', findings: true };
const pkg = (groups: unknown[], vulnerabilities: unknown[] = [], name = 'fixture') => ({
  package: { name, version: '9.0.4', ecosystem: 'NuGet' }, groups, vulnerabilities,
});
const doc = (...packages: unknown[]) => ({ results: [{ packages }] });

test('report returns the grouped finding with package, risk, aliases and matching fixes', () => {
  const value = doc(pkg([{ ids: ['GHSA-fixture', 'CVE-2026-12345'], max_severity: '7.5' }], [{
    id: 'GHSA-fixture', aliases: ['CVE-2026-12345'], affected: [{
      package: { name: 'fixture', ecosystem: 'NuGet' },
      ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '9.0.0' }, { fixed: '9.0.21' }] }],
    }],
  }]));
  const report = createOsvReport(value, options);
  assert.deepEqual(report.findingList, [{
    severity: 'high', ids: ['GHSA-fixture', 'CVE-2026-12345'], cves: ['CVE-2026-12345'],
    score: 7.5, ecosystem: 'NuGet', name: 'fixture', version: '9.0.4', fixed: ['9.0.21'],
  }]);
});

test('finding list matches every unchanged Markdown row at severity boundaries including zero and unknown', () => {
  const report = createOsvReport(findingsFixture, { ...options, source: 'custom.json' });
  assert.equal(report.markdown, readFileSync('test/fixtures/osv-findings.md', 'utf8'));
  assert.deepEqual(report.findingList.map(row => [row.ids[0], row.severity]), [
    ['GHSA-9', 'critical'], ['GHSA-8', 'critical'], ['GHSA-7', 'high'], ['GHSA-6', 'high'],
    ['GHSA-5', 'medium'], ['GHSA-4', 'medium'], ['GHSA-3', 'low'], ['GHSA-2', 'low'],
    ['GHSA-1', 'none'], ['GHSA-0', 'unknown'],
  ]);
  const rows = report.markdown.split('\n').filter(line => /^\| [🔴🟠🟡🔵⚪]/u.test(line));
  assert.equal(rows.length, report.findingList.length);
  for (const [index, finding] of report.findingList.entries()) {
    assert.ok(rows[index].includes(`[${finding.ids[0]}]`));
    assert.ok(rows[index].includes(`| ${finding.ecosystem} | ${finding.name} | ${finding.version} |`));
  }
});

test('report shows CVE aliases and qualitative severity in descending order, merging alias duplicates', () => {
  const markdown = createOsvReport(doc(pkg([
    { ids: ['GHSA-medium'], max_severity: '5.9' },
    { ids: ['GHSA-high', 'CVE-2026-12345'], aliases: ['CVE-2026-12345', 'CVE-2026-12346'], max_severity: '7.5' },
    { ids: ['GHSA-critical'], max_severity: '9.8' },
    { ids: ['GHSA-unknown'], max_severity: '' },
  ], [{ id: 'GHSA-high', aliases: ['CVE-2026-12347', 'CVE-2026-12345'] }])), options).markdown;
  assert.ok(markdown.indexOf('[GHSA-critical]') < markdown.indexOf('[GHSA-high]'));
  assert.ok(markdown.indexOf('[GHSA-high]') < markdown.indexOf('[GHSA-medium]'));
  assert.ok(markdown.indexOf('[GHSA-medium]') < markdown.indexOf('[GHSA-unknown]'));
  for (const suffix of ['12345', '12346', '12347']) assert.ok(markdown.includes(`CVE-2026-${suffix}`));
  assert.equal(markdown.match(/\[CVE-2026-12345\]/g)?.length, 1);
  assert.match(markdown, /套件弱點項目：\*\*4\*\*/);
  assert.match(markdown, /高 High：1/);
  assert.match(markdown, /未知 Unknown：1/);
  assert.match(markdown, /\| 未提供 \|/);
});

test('report applies severity boundaries including zero and preserves missing/invalid scores as unknown', () => {
  const scores = ['10', '9.0', '8.9', '7', '6.9', '4', '3.9', '0.1', '0', '', '-1', '11', 'high'];
  const markdown = createOsvReport(doc(pkg(scores.map((max_severity, index) => ({ ids: [`ID-${index}`], max_severity })))), options).markdown;
  for (const summary of ['危急 Critical：2', '高 High：2', '中 Medium：2', '低 Low：2', '無 None：1', '未知 Unknown：4']) {
    assert.ok(markdown.includes(summary), summary);
  }
});

test('fixes match the affected package and its current NuGet branch', () => {
  const affected = [
    { ranges: [{ type: 'GIT', events: [{ fixed: 'abcdef123456' }] }] },
    { package: { name: 'fixture', ecosystem: 'NuGet' }, ranges: [{ type: 'ECOSYSTEM', events: [
      { introduced: '9.0.0' }, { fixed: '9.0.21' }, { introduced: '10.0.0' }, { fixed: '10.0.13' },
    ] }] },
    { package: { name: 'other', ecosystem: 'NuGet' }, ranges: [{ events: [{ fixed: '999.0.0' }] }] },
  ];
  const markdown = createOsvReport(doc(pkg([{ ids: ['GHSA-fixture'], max_severity: '7.5' }], [{ id: 'GHSA-fixture', affected }])), options).markdown;
  assert.ok(markdown.includes('9.0.21'));
  assert.ok(!markdown.includes('10.0.13'));
  assert.ok(!markdown.includes('999.0.0'));
});

test('external names cannot create HTML, links, extra table rows or Azure commands in report', () => {
  const markdown = createOsvReport(doc(pkg([{ ids: ['GHSA-test'], max_severity: '7.5' }], [], '<img src=x onerror=alert(1)>|[evil](https://evil.test)\n##vso[task.complete]')),
    { ...options, source: '<script>|[source]' }).markdown;
  assert.ok(!markdown.includes('<img'));
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[evil]('));
  assert.ok(!markdown.includes('##vso['));
  const row = markdown.split('\n').find(line => line.startsWith('| 🟠'))!;
  assert.equal(row.split('|').length, 11);
});

test('clean scan is explicit while malformed/partial JSON cannot masquerade as clean', () => {
  assert.match(createOsvReport({ results: [] }, { ...options, findings: false }).markdown, /未發現已知弱點/);
  for (const value of [null, {}, { results: {} }, doc(pkg([], [{ id: 'GHSA-missing-group' }])), doc(pkg([{ max_severity: '9' }]))]) {
    assert.throws(() => createOsvReport(value, options).markdown, /JSON/);
  }
  assert.throws(() => createOsvReport({ results: [] }, options).markdown, /有弱點/);
});
