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
  sboms: { product: '產品.cdx.json', full: '產品.cdx-full.json' },
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
  developmentExtra: {
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
    ['一、產品 SBOM 弱點（顯示 1 ／ 1 筆）', '二、開發套件額外弱點（顯示 1 ／ 1 筆）'],
  );
  const tables = root.querySelectorAll('section table');
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

test('overview counts affected package versions once and sums all six severity levels', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const value = structuredClone(report);
  const base = value.product.findings[0];
  value.product.findings.push({ ...base, severity: 'critical', ids: ['GHSA-second'] });
  value.developmentExtra.findings = [
    { ...base, severity: 'medium', ids: ['GHSA-extra'] },
    { ...base, version: '2.0.0', severity: 'low' },
    { ...base, ecosystem: 'NuGet', severity: 'none' },
    { ...base, name: '其他套件', severity: 'unknown' },
  ];
  renderOsvReport(root, value);
  const table = root.querySelector('table[aria-label="弱點總覽"]')!;
  assert.ok(table);
  assert.deepEqual(
    [...table.querySelectorAll('thead th')].map((n) => n.textContent),
    ['範圍', '受影響套件', '弱點數', '危急', '高', '中', '低', '無', '未知'],
  );
  assert.deepEqual(
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((n) => n.textContent),
    ),
    [
      ['產品 SBOM', '1', '2', '1', '1', '0', '0', '0', '0'],
      ['開發套件額外', '4', '4', '0', '0', '1', '1', '1', '1'],
      ['完整合計', '4', '6', '1', '1', '1', '1', '1', '1'],
    ],
  );
  assert.equal(table.querySelectorAll('td.zero-count').length, 6);
  assert.equal(root.querySelector('.verdict')!.nextElementSibling, table.parentElement);
});

test('severity buttons toggle multiple levels, restore all and keep the overview unchanged', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  renderOsvReport(root, report);
  const overview = root.querySelector('table[aria-label="弱點總覽"]')!.textContent;
  const filters = root.querySelector('[role="group"][aria-label="等級篩選"]')!;
  assert.ok(filters);
  const buttons = [...filters.querySelectorAll('button')];
  assert.deepEqual(
    buttons.map((n) => n.textContent),
    ['全部顯示', '危急（0）', '高（1）', '中（0）', '低（0）', '無（0）', '未知（1）'],
  );
  const high = buttons[2];
  const unknown = buttons[6];
  assert.equal(high.getAttribute('aria-pressed'), 'true');
  high.click();
  assert.equal(high.getAttribute('aria-pressed'), 'false');
  assert.match(root.querySelector('section h2')!.textContent!, /顯示 0 ／ 1 筆/);
  assert.match(root.querySelector('section')!.textContent!, /目前篩選條件下沒有弱點。/);
  assert.equal(root.querySelectorAll('section tbody tr').length, 1);
  unknown.click();
  assert.equal(root.querySelectorAll('section tbody tr').length, 0);
  high.click();
  assert.equal(root.querySelectorAll('section tbody tr').length, 1);
  assert.match(root.querySelectorAll('section')[1].textContent!, /顯示 0 ／ 1 筆/);
  buttons[0].click();
  assert.equal(root.querySelectorAll('section tbody tr').length, 2);
  assert.ok(buttons.slice(1).every((n) => n.getAttribute('aria-pressed') === 'true'));
  assert.equal(root.querySelector('table[aria-label="弱點總覽"]')!.textContent, overview);
  assert.ok(filters.compareDocumentPosition(root.querySelector('section')!) & 4);
});

test('each section sorts by CVSS, severity, package and UTC dates with missing values last', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const value = structuredClone(report);
  const base = value.product.findings[0];
  value.product.findings = [
    {
      ...base,
      name: 'Alpha',
      severity: 'medium',
      score: 5,
      published: '2025-01-01',
      modified: '2026-01-01',
    },
    {
      ...base,
      name: 'Beta',
      severity: 'high',
      score: 9,
      published: '2024-01-01',
      modified: '2025-01-01',
    },
    {
      ...base,
      name: 'Charlie',
      severity: 'low',
      score: 0,
      published: undefined,
      modified: undefined,
    },
    {
      ...base,
      name: 'Delta',
      severity: 'unknown',
      score: undefined,
      published: '2026-01-01',
      modified: '2024-01-01',
    },
    {
      ...base,
      name: 'Echo',
      severity: 'critical',
      score: 9,
      published: '2024-01-01',
      modified: '2025-01-01',
    },
  ];
  const original = structuredClone(value);
  renderOsvReport(root, value);
  const section = root.querySelector('section')!;
  const names = () =>
    [...section.querySelectorAll('tbody tr')].map((row) => row.children[2].firstChild!.textContent);
  assert.deepEqual(names(), ['Beta', 'Echo', 'Alpha', 'Charlie', 'Delta']);
  assert.equal(section.querySelector('th[aria-sort="descending"]')!.textContent, 'CVSS');
  for (const [label, first, second] of [
    [
      'CVSS',
      ['Charlie', 'Alpha', 'Beta', 'Echo', 'Delta'],
      ['Beta', 'Echo', 'Alpha', 'Charlie', 'Delta'],
    ],
    [
      '等級',
      ['Echo', 'Beta', 'Alpha', 'Charlie', 'Delta'],
      ['Delta', 'Charlie', 'Alpha', 'Beta', 'Echo'],
    ],
    [
      '套件',
      ['Alpha', 'Beta', 'Charlie', 'Delta', 'Echo'],
      ['Echo', 'Delta', 'Charlie', 'Beta', 'Alpha'],
    ],
    [
      '發佈日期',
      ['Beta', 'Echo', 'Alpha', 'Delta', 'Charlie'],
      ['Delta', 'Alpha', 'Beta', 'Echo', 'Charlie'],
    ],
    [
      '最後修改',
      ['Delta', 'Beta', 'Echo', 'Alpha', 'Charlie'],
      ['Alpha', 'Beta', 'Echo', 'Delta', 'Charlie'],
    ],
  ] as const) {
    const button = [...section.querySelectorAll<HTMLButtonElement>('th button')].find(
      (n) => n.textContent === label,
    )!;
    assert.ok(button, label);
    assert.equal(button.getAttribute('type'), 'button');
    button.focus();
    button.click();
    assert.equal(root.ownerDocument.activeElement, button);
    assert.deepEqual(names(), first, label);
    assert.equal(
      section.querySelectorAll('th[aria-sort="ascending"], th[aria-sort="descending"]').length,
      1,
    );
    const direction = button.parentElement!.getAttribute('aria-sort');
    assert.equal(direction, label === '等級' ? 'descending' : 'ascending');
    button.click();
    assert.deepEqual(names(), second, label);
    assert.notEqual(button.parentElement!.getAttribute('aria-sort'), direction);
  }
  assert.equal(
    root.querySelectorAll('section')[1].querySelector('th[aria-sort="descending"]')!.textContent,
    'CVSS',
  );
  const filters = [...root.querySelectorAll<HTMLButtonElement>('.severity-filters button')];
  filters.find((n) => n.textContent === '高（1）')!.click();
  assert.deepEqual(names(), ['Alpha', 'Echo', 'Delta', 'Charlie']);
  filters[0].click();
  assert.deepEqual(names(), ['Alpha', 'Beta', 'Echo', 'Delta', 'Charlie']);
  assert.deepEqual(value, original);
});

test('empty, disabled and failed sections show distinct messages and never imply zero findings for incomplete scans', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const value = structuredClone(report);
  value.product.findings = [];
  value.developmentExtra.findings = [];
  renderOsvReport(root, value);
  assert.equal(root.querySelectorAll('section').length, 2);
  assert.match(root.querySelectorAll('section')[0].textContent!, /產品 SBOM 未發現已知弱點。/);
  assert.match(root.querySelectorAll('section')[1].textContent!, /開發套件無額外弱點。/);
  assert.doesNotMatch(root.textContent!, /目前篩選條件下/);
  for (const status of ['disabled', 'failed'] as const) {
    value.product = { status, findings: [] };
    value.developmentExtra = { status, findings: [] };
    renderOsvReport(root, value);
    for (const section of root.querySelectorAll('section')) {
      assert.match(
        section.textContent!,
        status === 'disabled' ? /本次未執行 OSV 弱點掃描/ : /OSV 弱點掃描失敗，詳見建置日誌/,
      );
      assert.equal(section.querySelector('table'), null);
      assert.doesNotMatch(section.textContent!, /顯示 0|未發現|無額外/);
    }
    assert.equal(root.querySelectorAll('table[aria-label="弱點總覽"] td').length, 24);
    assert.ok(
      [...root.querySelectorAll('table[aria-label="弱點總覽"] td')].every(
        (n) => n.textContent === '未完成',
      ),
    );
  }
  value.product = report.product;
  renderOsvReport(root, value);
  assert.match(root.querySelector('section')!.textContent!, /產品套件📦/);
  assert.match(root.querySelectorAll('section')[1].textContent!, /OSV 弱點掃描失敗，詳見建置日誌/);
  assert.doesNotMatch(root.querySelector('.verdict')!.textContent!, /未達到/);
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
  value.developmentExtra = { status: 'disabled', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /本次未執行 OSV 弱點掃描/);
  assert.doesNotMatch(root.textContent!, /未達到/);
  value.product = report.product;
  value.developmentExtra = { status: 'failed', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /掃描失敗.*無法判定/);
  assert.doesNotMatch(root.textContent!, /未達到/);
  assert.equal(root.querySelectorAll('h2').length, 2);
});

test('product scan failure preserves the exceeded full SBOM verdict', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  renderOsvReport(root, {
    ...report,
    product: { status: 'failed', findings: [] },
    developmentExtra: { status: 'failed', findings: [] },
  });
  const verdict = root.querySelector('.verdict')!.textContent!;
  assert.match(verdict, /超過失敗門檻『高』/);
  assert.match(verdict, /產品 SBOM 掃描失敗/);
  assert.doesNotMatch(verdict, /無法判定完整結果/);
});
