import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderOsvReport } from '../src/osv-tab/render';
import type { OsvTabReport } from '../src/shared/osv-tab-contract';

const report: OsvTabReport = {
  schemaVersion: 1,
  generatedAt: '2026-11-11T17:02:03Z',
  scannerVersion: '2.7.1',
  threshold: 'high',
  exceeded: true,
  dtSkipped: true,
  sboms: { product: '產品.cdx.json', full: '產品.cdx-dev.json' },
  product: {
    status: 'completed',
    findings: [
      {
        severity: 'high',
        score: 7.5,
        ecosystem: 'npm',
        name: '產品套件📦',
        version: '1.0.0',
        fixed: ['1.0.1', '2.0.0'],
        ids: ['GHSA-product'],
        cves: ['CVE-2026-12345'],
        published: '2026-01-02',
        modified: '2026-11-10',
      },
    ],
  },
  devExtra: {
    status: 'completed',
    findings: [
      {
        severity: 'unknown',
        ecosystem: 'NuGet',
        name: '開發工具',
        version: '3.0.0',
        fixed: [],
        ids: ['GHSA-dev'],
        cves: [],
      },
    ],
  },
};

test('tab renders the contract verdict, UTC+8 time and two eight-column finding sections', () => {
  const document = new JSDOM('<main></main>').window.document;
  const root = document.querySelector('main')!;
  renderOsvReport(root, report);
  assert.match(root.textContent!, /已達到或超過.*高/);
  assert.match(root.textContent!, /已略過 DT 上傳/);
  assert.match(root.textContent!, /2026-11-12 01:02:03.*UTC\+8/);
  assert.match(root.textContent!, /OSV Scanner.*2\.7\.1/);
  assert.deepEqual(
    [...root.querySelectorAll('h2')].map((node) => node.textContent),
    ['一、產品 SBOM 弱點', '二、開發套件額外弱點'],
  );
  const tables = root.querySelectorAll('table');
  assert.equal(tables.length, 2);
  assert.deepEqual(
    [...tables[0].querySelectorAll('th')].map((node) => node.textContent),
    ['等級', 'CVSS', '套件', '目前版本', '建議升級', '弱點編號', '發佈日期', '最後修改'],
  );
  const cells = tables[0].querySelectorAll('tbody td');
  assert.equal(cells.length, 8);
  assert.equal(cells[1].textContent, '7.5');
  assert.equal(cells[2].children[0].textContent, '產品套件📦');
  assert.equal(cells[2].children[1].textContent, 'npm');
  assert.equal(cells[3].textContent, '1.0.0');
  assert.match(cells[4].textContent!, /1\.0\.1.*2\.0\.0/);
  assert.deepEqual(
    [...cells[5].querySelectorAll('a')].map((link) => [link.textContent, link.href]),
    [
      ['CVE-2026-12345', 'https://www.cve.org/CVERecord?id=CVE-2026-12345'],
      ['GHSA-product', 'https://osv.dev/vulnerability/GHSA-product'],
    ],
  );
  assert.equal(cells[6].textContent, '2026-01-02');
  assert.equal(cells[7].textContent, '2026-11-10');
  const devCells = tables[1].querySelectorAll('tbody td');
  for (const index of [1, 4, 6, 7]) assert.equal(devCells[index].textContent, '未提供');
  assert.match(devCells[5].textContent!, /（無 CVE，僅 GHSA）/);
  assert.equal(devCells[5].querySelector('a')!.href, 'https://osv.dev/vulnerability/GHSA-dev');
});

test('untrusted report text stays literal and links stay on the two HTTPS authorities', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>📦';
  const value = structuredClone(report);
  value.scannerVersion = hostile;
  value.product.findings[0] = {
    ...value.product.findings[0],
    name: hostile,
    ecosystem: hostile,
    version: hostile,
    fixed: [hostile],
    ids: ['https://evil.test/a', 'javascript:alert(1)', hostile],
    cves: [hostile],
  };
  renderOsvReport(root, value);
  assert.equal(root.querySelectorAll('img, script, iframe, [onerror]').length, 0);
  assert.ok(root.textContent!.includes(hostile));
  for (const link of root.querySelectorAll('a')) {
    assert.ok(['https://osv.dev', 'https://www.cve.org'].includes(new URL(link.href).origin));
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('unknown schemas and malformed attachments show an explicit error instead of a safe verdict', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const invalid: unknown[] = [
    null,
    {},
    { ...report, schemaVersion: 2 },
    { ...report, generatedAt: 'bad-date' },
    { ...report, threshold: 'none' },
    { ...report, product: { status: 'completed', findings: [{}] } },
    {
      ...report,
      product: { status: 'completed', findings: [{ ...report.product.findings[0], score: 11 }] },
    },
  ];
  for (const value of invalid) {
    renderOsvReport(root, value);
    assert.match(
      root.querySelector('[role="alert"]')?.textContent ?? '',
      /不支援.*版本|資料格式不正確/,
    );
    assert.equal(root.querySelectorAll('table, .verdict').length, 0);
  }
});

test('disabled and failed scans do not claim to pass, while warnOnly and passing scans keep their verdict', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const value = structuredClone(report);
  value.exceeded = false;
  value.dtSkipped = false;
  renderOsvReport(root, value);
  assert.match(root.querySelector('.verdict')!.textContent!, /未達到.*高/);
  value.threshold = 'warnOnly';
  renderOsvReport(root, value);
  assert.match(root.querySelector('.verdict')!.textContent!, /僅警告/);
  value.product = { status: 'disabled', findings: [] };
  value.devExtra = { status: 'disabled', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /本次未執行 OSV 弱點掃描/);
  assert.doesNotMatch(root.textContent!, /未達到/);
  value.product = report.product;
  value.devExtra = { status: 'failed', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /掃描失敗.*無法判定/);
  assert.doesNotMatch(root.textContent!, /未達到/);
  assert.equal(root.querySelectorAll('h2').length, 2);
});
