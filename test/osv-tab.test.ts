import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderOsvReport } from '../src/osv-tab/render';
import type { OsvTabReport } from '../src/shared/osv-tab-contract';
import { applyHostTheme } from '../src/osv-tab/theme';

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
  assert.match(root.textContent!, /超過失敗門檻.*高/);
  assert.match(root.textContent!, /已略過 DT 上傳/);
  assert.match(root.textContent!, /2026-11-12 01:02:03.*UTC\+8/);
  assert.match(root.textContent!, /OSV Scanner.*2\.7\.1/);
  assert.deepEqual(
    [...root.querySelectorAll('h2')].map((node) => node.textContent),
    ['一、產品 SBOM 弱點', '二、開發套件額外弱點'],
  );
  const tables = root.querySelectorAll('.osv-section table');
  assert.equal(tables.length, 2);
  assert.deepEqual(
    [...tables[0].querySelectorAll('th')].map((node) =>
      node.childNodes[0].nodeType === 3
        ? node.textContent
        : node.querySelector('button')!.firstChild!.textContent,
    ),
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
  assert.equal(devCells[1].textContent, '—');
  for (const index of [4, 6, 7]) assert.equal(devCells[index].textContent, '未提供');
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
    ['範圍', 'SBOM', '受影響套件', '弱點', '危急', '高', '中', '低', '無', '未知'],
  );
  assert.deepEqual(
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((n) => n.textContent),
    ),
    [
      ['產品', '產品.cdx.json', '1', '2', '1', '1', '0', '0', '0', '0'],
      ['開發套件額外', '產品.cdx-full.json', '4', '4', '0', '0', '1', '1', '1', '1'],
      ['完整合計', '', '4', '6', '1', '1', '1', '1', '1', '1'],
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
    ['危急 0', '高 1', '中 0', '低 0', '無 0', '未知 1', '全部顯示'],
  );
  const high = buttons[1];
  const unknown = buttons[5];
  assert.equal(high.getAttribute('aria-pressed'), 'true');
  high.click();
  assert.equal(high.getAttribute('aria-pressed'), 'false');
  assert.match(root.querySelector('.osv-section .shown-count')!.textContent!, /顯示 0 ／ 1 筆/);
  assert.match(root.querySelector('.osv-section')!.textContent!, /目前篩選條件下沒有弱點。/);
  assert.equal(root.querySelectorAll('.osv-section tbody tr').length, 1);
  unknown.click();
  assert.equal(root.querySelectorAll('.osv-section tbody tr').length, 0);
  high.click();
  assert.equal(root.querySelectorAll('.osv-section tbody tr').length, 1);
  assert.match(root.querySelectorAll('.osv-section')[1].textContent!, /顯示 0 ／ 1 筆/);
  buttons[6].click();
  assert.equal(root.querySelectorAll('.osv-section tbody tr').length, 2);
  assert.ok(buttons.slice(0, 6).every((n) => n.getAttribute('aria-pressed') === 'true'));
  assert.equal(root.querySelector('table[aria-label="弱點總覽"]')!.textContent, overview);
  assert.ok(filters.compareDocumentPosition(root.querySelector('.osv-section')!) & 4);
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
  const section = root.querySelector('.osv-section')!;
  const names = () =>
    [...section.querySelectorAll('tbody tr')].map((row) => row.children[2].firstChild!.textContent);
  assert.deepEqual(names(), ['Beta', 'Echo', 'Alpha', 'Charlie', 'Delta']);
  assert.equal(
    section.querySelector('th[aria-sort="descending"]')!.querySelector('button')!.firstChild!
      .textContent,
    'CVSS',
  );
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
      (n) => n.firstChild!.textContent === label,
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
    root
      .querySelectorAll('.osv-section')[1]
      .querySelector('th[aria-sort="descending"]')!
      .querySelector('button')!.firstChild!.textContent,
    'CVSS',
  );
  const filters = [...root.querySelectorAll<HTMLButtonElement>('.severity-filters button')];
  filters.find((n) => n.textContent === '高 1')!.click();
  assert.deepEqual(names(), ['Alpha', 'Echo', 'Delta', 'Charlie']);
  filters[6].click();
  assert.deepEqual(names(), ['Alpha', 'Beta', 'Echo', 'Delta', 'Charlie']);
  assert.deepEqual(value, original);
});

test('empty, disabled and failed sections show distinct messages and never imply zero findings for incomplete scans', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const value = structuredClone(report);
  value.product.findings = [];
  value.developmentExtra.findings = [];
  renderOsvReport(root, value);
  assert.equal(root.querySelectorAll('.osv-section').length, 2);
  assert.match(root.querySelectorAll('.osv-section')[0].textContent!, /產品 SBOM 未發現已知弱點。/);
  assert.match(root.querySelectorAll('.osv-section')[1].textContent!, /開發套件無額外弱點。/);
  assert.doesNotMatch(root.textContent!, /目前篩選條件下/);
  for (const status of ['disabled', 'failed'] as const) {
    value.product = { status, findings: [] };
    value.developmentExtra = { status, findings: [] };
    renderOsvReport(root, value);
    for (const section of root.querySelectorAll('.osv-section')) {
      assert.match(
        section.textContent!,
        status === 'disabled' ? /本次未執行 OSV 弱點掃描/ : /OSV 弱點掃描失敗，詳見建置日誌/,
      );
      assert.equal(section.querySelector('table'), null);
      assert.doesNotMatch(section.textContent!, /顯示 0|未發現|無額外/);
    }
    assert.equal(root.querySelectorAll('table[aria-label="弱點總覽"] td.num').length, 24);
    assert.ok(
      [...root.querySelectorAll('table[aria-label="弱點總覽"] td.num')].every(
        (n) => n.textContent === '未完成',
      ),
    );
  }
  value.product = report.product;
  renderOsvReport(root, value);
  assert.match(root.querySelector('.osv-section')!.textContent!, /產品套件📦/);
  assert.match(
    root.querySelectorAll('.osv-section')[1].textContent!,
    /OSV 弱點掃描失敗，詳見建置日誌/,
  );
  assert.doesNotMatch(root.querySelector('.verdict')!.textContent!, /未達到|未超過失敗門檻/);
});

test('untrusted report text stays literal and links stay on the two HTTPS authorities', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>📦';
  const value = structuredClone(report);
  value.scannerVersion = hostile;
  value.sboms = { product: hostile, full: hostile };
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
  for (const link of root.querySelectorAll<HTMLAnchorElement>('.osv-section a')) {
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
  assert.match(root.querySelector('.verdict')!.textContent!, /未超過失敗門檻.*高/);
  value.threshold = 'warnOnly';
  renderOsvReport(root, value);
  assert.match(root.querySelector('.verdict')!.textContent!, /僅警告/);
  value.product = { status: 'disabled', findings: [] };
  value.developmentExtra = { status: 'disabled', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /本次未執行 OSV 弱點掃描/);
  assert.doesNotMatch(root.textContent!, /未達到|未超過失敗門檻/);
  value.product = report.product;
  value.developmentExtra = { status: 'failed', findings: [] };
  renderOsvReport(root, value);
  assert.match(root.textContent!, /掃描失敗.*無法判定/);
  assert.doesNotMatch(root.textContent!, /未達到|未超過失敗門檻/);
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
  assert.match(verdict, /超過失敗門檻「高」/);
  assert.match(verdict, /產品 SBOM 掃描失敗/);
  assert.doesNotMatch(verdict, /無法判定完整結果/);
});

test('design structure includes the card, icons, metadata, dots, section context and trusted footer', () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  renderOsvReport(root, report);
  const card = root.querySelector('.osv-card')!;
  assert.equal(card.parentElement, root);
  assert.equal(root.querySelector('nav'), null);
  assert.equal(card.querySelector('.title-row h1')!.textContent, 'OSV 弱點報告');
  assert.equal(card.querySelector('.title-row svg')!.getAttribute('aria-hidden'), 'true');
  assert.equal(
    card.querySelector('.title-row path')!.getAttribute('d'),
    'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z',
  );
  assert.match(card.querySelector('.verdict-pill.is-fail')!.textContent!, /超過失敗門檻「高」/);
  assert.equal(card.querySelector('.is-fail path')!.getAttribute('d'), 'M6 6l12 12M18 6L6 18');
  assert.equal(card.querySelectorAll('.metadata > span').length, 2);
  assert.deepEqual(
    [...card.querySelectorAll('.osv-overview thead .severity-dot')].map((n) => n.className),
    ['critical', 'high', 'medium', 'low', 'none', 'unknown'].map(
      (s) => `severity-dot severity-${s}`,
    ),
  );
  assert.equal(card.querySelectorAll('.osv-overview td.zero-count').length, 14);
  assert.deepEqual(
    [...card.querySelectorAll('.section-heading code')].map((n) => n.textContent),
    ['產品.cdx.json', '產品.cdx-full.json'],
  );
  assert.deepEqual(
    [...card.querySelectorAll('.shown-count')].map((n) => n.textContent),
    ['顯示 1 ／ 1 筆', '顯示 1 ／ 1 筆'],
  );
  assert.deepEqual(
    [...card.querySelectorAll('.section-note')].map((n) => n.textContent),
    [
      '部署到正式環境的套件，請優先處理。',
      '只出現在完整 SBOM（含開發套件）、產品 SBOM 未列的項目；影響建置與開發工具鏈，不隨產品部署。',
    ],
  );
  assert.equal(card.querySelector('.no-cve')!.textContent, '（無 CVE，僅 GHSA）');
  const table = card.querySelector('.osv-section .osv-table')!;
  assert.deepEqual(
    [...table.querySelectorAll('.sort-arrow')].map((n) => n.textContent),
    ['↕', '▼', '↕', '↕', '↕'],
  );
  const scoreSort = table.querySelector<HTMLButtonElement>('th.num button')!;
  scoreSort.click();
  assert.equal(scoreSort.querySelector('.sort-arrow')!.textContent, '▲');
  assert.equal(scoreSort.parentElement!.getAttribute('aria-sort'), 'ascending');
  const footer = card.querySelector('.report-footer')!;
  assert.match(footer.textContent!, /OSV弱點報告-產品.md、OSV弱點報告-完整.md/);
  assert.match(footer.textContent!, /published／modified（UTC 日期）/);
  assert.deepEqual(
    [...footer.querySelectorAll('a')].map((n) => [n.textContent, n.href, n.rel]),
    [
      ['OSV Scanner', 'https://google.github.io/osv-scanner/output/', 'noopener noreferrer'],
      [
        'FIRST CVSS',
        'https://www.first.org/cvss/v3.1/specification-document#Qualitative-Severity-Rating-Scale',
        'noopener noreferrer',
      ],
    ],
  );
  renderOsvReport(root, { ...report, exceeded: false });
  assert.match(root.querySelector('.verdict-pill.is-pass')!.textContent!, /未超過失敗門檻「高」/);
  assert.equal(root.querySelector('.is-pass svg')!.getAttribute('aria-hidden'), 'true');
});

test('theme follows host background brightness before the system preference', () => {
  const dom = new JSDOM('<body></body>');
  const document = dom.window.document;
  const root = document.documentElement;
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  for (const [color, expected] of [
    ['#1b1a19', 'dark'],
    ['#fff', 'light'],
    ['rgb(37, 36, 35)', 'dark'],
    ['rgba(248, 248, 248, 1)', 'light'],
  ]) {
    root.style.setProperty('--background-color', color);
    applyHostTheme(document);
    assert.equal(root.dataset.theme, expected);
  }
  root.style.removeProperty('--background-color');
  document.body.style.backgroundColor = 'rgb(255, 255, 255)';
  applyHostTheme(document);
  assert.equal(root.dataset.theme, 'light');
  document.body.style.backgroundColor = 'transparent';
  applyHostTheme(document);
  assert.equal(root.dataset.theme, 'dark');
  Object.defineProperty(dom.window, 'matchMedia', { value: undefined });
  applyHostTheme(document);
  assert.equal(root.dataset.theme, 'light');
});
