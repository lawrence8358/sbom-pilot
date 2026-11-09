import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOsvReport } from '../src/osv-report';

const options = { version: '2.7.1', source: 'sbom.cdx.json', findings: true };
const pkg = (groups: unknown[], vulnerabilities: unknown[] = [], name = 'fixture') => ({
  package: { name, version: '9.0.4', ecosystem: 'NuGet' }, groups, vulnerabilities,
});
const doc = (...packages: unknown[]) => ({ results: [{ packages }] });

test('report shows CVE aliases and qualitative severity in descending order, merging alias duplicates', () => {
  const markdown = renderOsvReport(doc(pkg([
    { ids: ['GHSA-medium'], max_severity: '5.9' },
    { ids: ['GHSA-high', 'CVE-2026-12345'], aliases: ['CVE-2026-12345', 'CVE-2026-12346'], max_severity: '7.5' },
    { ids: ['GHSA-critical'], max_severity: '9.8' },
    { ids: ['GHSA-unknown'], max_severity: '' },
  ], [{ id: 'GHSA-high', aliases: ['CVE-2026-12347', 'CVE-2026-12345'] }])), options);
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
  const markdown = renderOsvReport(doc(pkg(scores.map((max_severity, index) => ({ ids: [`ID-${index}`], max_severity })))), options);
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
  const markdown = renderOsvReport(doc(pkg([{ ids: ['GHSA-fixture'], max_severity: '7.5' }], [{ id: 'GHSA-fixture', affected }])), options);
  assert.ok(markdown.includes('9.0.21'));
  assert.ok(!markdown.includes('10.0.13'));
  assert.ok(!markdown.includes('999.0.0'));
});

test('external names cannot create HTML, links, extra table rows or Azure commands in report', () => {
  const markdown = renderOsvReport(doc(pkg([{ ids: ['GHSA-test'], max_severity: '7.5' }], [], '<img src=x onerror=alert(1)>|[evil](https://evil.test)\n##vso[task.complete]')),
    { ...options, source: '<script>|[source]' });
  assert.ok(!markdown.includes('<img'));
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[evil]('));
  assert.ok(!markdown.includes('##vso['));
  const row = markdown.split('\n').find(line => line.startsWith('| 🟠'))!;
  assert.equal(row.split('|').length, 11);
});

test('clean scan is explicit while malformed/partial JSON cannot masquerade as clean', () => {
  assert.match(renderOsvReport({ results: [] }, { ...options, findings: false }), /未發現已知弱點/);
  for (const value of [null, {}, { results: {} }, doc(pkg([], [{ id: 'GHSA-missing-group' }])), doc(pkg([{ max_severity: '9' }]))]) {
    assert.throws(() => renderOsvReport(value, options), /JSON/);
  }
  assert.throws(() => renderOsvReport({ results: [] }, options), /有弱點/);
});
