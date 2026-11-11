import type {
  OsvSeverity,
  OsvTabFinding,
  OsvTabReport,
  OsvTabSection,
} from '../shared/osv-tab-contract';
import { parseOsvTabReport } from './validate';

import {
  osvThresholdLabels as labels,
  osvSeverityOrder as severities,
} from '../shared/osv-tab-contract';

type SortKey = 'severity' | 'score' | 'name' | 'published' | 'modified';

/** 缺漏值固定排最後；同值保留附件順序，不改動契約清單。 */
function compareFindings(
  a: OsvTabFinding,
  b: OsvTabFinding,
  key: SortKey,
  descending: boolean,
): number {
  const left = key === 'severity' ? -severities.indexOf(a.severity) : a[key];
  const right = key === 'severity' ? -severities.indexOf(b.severity) : b[key];
  if (left === undefined || left === '') return right === undefined || right === '' ? 0 : 1;
  if (right === undefined || right === '') return -1;
  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'zh-Hant');
  return descending ? -order : order;
}

/** 依契約清單統計，完整合計的套件跨區去重，弱點保留逐筆計數。 */
function overview(root: HTMLElement, report: OsvTabReport): void {
  const wrapper = append(root, 'div');
  wrapper.className = 'table-scroll';
  const table = append(wrapper, 'table');
  table.className = 'osv-table osv-overview';
  table.setAttribute('aria-label', '弱點總覽');
  const header = append(append(table, 'thead'), 'tr');
  for (const label of ['範圍', 'SBOM', '受影響套件', '弱點', ...severities.map((s) => labels[s])]) {
    const cell = append(header, 'th');
    cell.scope = 'col';
    const severity = severities.find((s) => labels[s] === label);
    if (severity) severityLabel(cell, severity);
    else cell.textContent = label;
    if (header.children.length > 2) cell.className = 'num';
  }
  const body = append(table, 'tbody');
  const groups: [string, OsvTabSection[]][] = [
    ['產品', [report.product]],
    ['開發套件額外', [report.developmentExtra]],
    ['完整合計', [report.product, report.developmentExtra]],
  ];
  for (const [label, sections] of groups) {
    const row = append(body, 'tr');
    append(row, 'th', label).scope = 'row';
    append(
      append(row, 'td'),
      'code',
      sections.length === 2
        ? ''
        : sections[0] === report.product
          ? report.sboms.product
          : report.sboms.full,
    );
    const findings = sections.flatMap((s) => s.findings);
    const packages = new Set(findings.map((f) => JSON.stringify([f.ecosystem, f.name, f.version])));
    const counts = [
      packages.size,
      findings.length,
      ...severities.map((s) => findings.filter((f) => f.severity === s).length),
    ];
    for (const [index, count] of counts.entries()) {
      const cell = append(
        row,
        'td',
        sections.every((s) => s.status === 'completed') ? String(count) : '未完成',
      );
      cell.className = 'num';
      if (index >= 1) cell.classList.add('count');
      if (count === 0 && cell.textContent === '0') cell.classList.add('zero-count');
    }
  }
}

/** 所有外部文字皆透過文字節點寫入，避免 HTML 注入。 */
function append<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = parent.ownerDocument.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}

/** 使用內建色點搭配文字，未知風險以空心環區分。 */
function severityLabel(parent: HTMLElement, severity: OsvSeverity): void {
  const label = append(parent, 'span');
  label.className = 'severity-label';
  const dot = append(label, 'span');
  dot.className = `severity-dot severity-${severity}`;
  dot.setAttribute('aria-hidden', 'true');
  label.append(parent.ownerDocument.createTextNode(labels[severity]));
}

/** SVG 路徑只採用內建常數，外部字串不參與圖示屬性。 */
function icon(parent: HTMLElement, kind: 'shield' | 'fail' | 'pass'): void {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = parent.ownerDocument.createElementNS(ns, 'svg');
  const size = kind === 'shield' ? '28' : '16';
  for (const [key, value] of Object.entries({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': kind === 'shield' ? '1.8' : '2.4',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(key, value);
  const paths =
    kind === 'shield'
      ? ['M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z', 'M9 12l2 2 4-4']
      : [kind === 'fail' ? 'M6 6l12 12M18 6L6 18' : 'M5 12l4 4L19 6'];
  for (const d of paths) {
    const path = parent.ownerDocument.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  parent.append(svg);
}

/** 以固定 UTC+8 偏移顯示時間，不受瀏覽器所在時區影響。 */
function generatedTime(value: string): string {
  return (
    new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') +
    '（UTC+8）'
  );
}

/** 將弱點識別碼編碼到固定官方網址，不採用資料提供的任意連結。 */
function identifier(parent: HTMLElement, id: string, cve: boolean): void {
  const line = append(parent, 'div');
  const link = append(line, 'a', id);
  link.href = cve
    ? `https://www.cve.org/CVERecord?id=${encodeURIComponent(id)}`
    : `https://osv.dev/vulnerability/${encodeURIComponent(id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

/** 將一筆弱點分成八欄，保留套件生態系與各識別碼的獨立呈現。 */
function findingRow(body: HTMLElement, finding: OsvTabFinding): void {
  const row = append(body, 'tr');
  severityLabel(append(row, 'td'), finding.severity);
  append(row, 'td', finding.score === undefined ? '—' : finding.score.toFixed(1)).className = 'num';
  const pkg = append(row, 'td');
  append(pkg, 'div', finding.name).className = 'package-name';
  append(pkg, 'div', finding.ecosystem).className = 'ecosystem';
  append(row, 'td', finding.version || '未提供');
  append(row, 'td', finding.fixed.join('、') || '未提供').className = 'fix';
  const ids = append(row, 'td');
  if (!finding.cves.length) append(ids, 'div', '（無 CVE，僅 GHSA）').className = 'no-cve';
  for (const id of finding.cves) identifier(ids, id, true);
  for (const id of finding.ids) identifier(ids, id, false);
  append(row, 'td', finding.published || '未提供');
  append(row, 'td', finding.modified || '未提供');
}

/** 固定呈現產品與開發套件區塊，讓後續互動可在各自表格擴充。 */
function section(
  root: HTMLElement,
  title: string,
  value: OsvTabSection,
  selected: Set<OsvSeverity>,
  emptyMessage: string,
  sbom: string,
  note: string,
): () => void {
  const container = append(root, 'div');
  container.className = 'osv-section';
  const heading = append(container, 'div');
  heading.className = 'section-heading';
  append(heading, 'h2', title);
  append(heading, 'code', sbom);
  const shown = append(heading, 'span');
  shown.className = 'shown-count';
  append(container, 'p', note).className = 'section-note';
  if (value.status !== 'completed') {
    append(
      container,
      'p',
      value.status === 'failed' ? 'OSV 弱點掃描失敗，詳見建置日誌' : '本次未執行 OSV 弱點掃描',
    );
    return () => {};
  }
  const wrapper = append(container, 'div');
  wrapper.className = 'table-scroll';
  const table = append(wrapper, 'table');
  table.className = 'osv-table';
  table.setAttribute('aria-label', title);
  const header = append(append(table, 'thead'), 'tr');
  let sortKey: SortKey = 'score';
  let descending = true;
  const sortable: [HTMLTableCellElement, SortKey][] = [];
  for (const [label, key] of [
    ['等級', 'severity'],
    ['CVSS', 'score'],
    ['套件', 'name'],
    ['目前版本', undefined],
    ['建議升級', undefined],
    ['弱點編號', undefined],
    ['發佈日期', 'published'],
    ['最後修改', 'modified'],
  ] as const) {
    const cell = append(header, 'th');
    cell.scope = 'col';
    if (key === 'score') cell.className = 'num';
    if (!key) {
      cell.textContent = label;
      continue;
    }
    sortable.push([cell, key]);
    const button = append(cell, 'button', label);
    button.className = 'osv-sort';
    const arrow = append(button, 'span');
    arrow.className = 'sort-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.addEventListener('click', () => {
      descending = key === sortKey ? !descending : key === 'severity' || key === 'score';
      sortKey = key;
      refresh();
    });
  }
  const body = append(table, 'tbody');
  const empty = append(container, 'p');
  empty.className = 'empty-state';

  /** 更新明細與可及排序狀態，保留表頭按鈕及其鍵盤焦點。 */
  const refresh = (): void => {
    const findings = value.findings
      .filter((f) => selected.has(f.severity))
      .sort((a, b) => compareFindings(a, b, sortKey, descending));
    for (const [cell, key] of sortable) {
      cell.querySelector('.sort-arrow')!.textContent =
        key === sortKey ? (descending ? '▼' : '▲') : '↕';
      cell.setAttribute(
        'aria-sort',
        key === sortKey ? (descending ? 'descending' : 'ascending') : 'none',
      );
    }
    shown.textContent = `顯示 ${findings.length} ／ ${value.findings.length} 筆`;
    body.replaceChildren();
    for (const finding of findings) findingRow(body, finding);
    wrapper.hidden = findings.length === 0;
    empty.hidden = findings.length > 0;
    empty.textContent = value.findings.length === 0 ? emptyMessage : '目前篩選條件下沒有弱點。';
  };
  refresh();
  return refresh;
}

/** 保留完整 SBOM 已確定的超標判定，其他未完成狀態不得呈現為已通過。 */
function verdict(report: OsvTabReport): string {
  const statuses = [report.product.status, report.developmentExtra.status];
  const threshold = `OSV 失敗門檻：${report.threshold ? labels[report.threshold] : '未提供'}`;
  if (report.exceeded) {
    return `超過失敗門檻「${report.threshold ? labels[report.threshold] : '未提供'}」${report.threshold === 'unknown' ? '（含全部弱點）' : ''}${report.product.status === 'failed' ? '；產品 SBOM 掃描失敗，無法區分開發套件額外弱點' : ''}`;
  }
  if (statuses.includes('failed')) return `掃描失敗，無法判定完整結果；${threshold}`;
  if (statuses.includes('disabled')) return `本次未執行 OSV 弱點掃描；${threshold}`;
  if (report.threshold === 'warnOnly') return `未達到 ${threshold}`;
  return `未超過失敗門檻「${report.threshold ? labels[report.threshold] : '未提供'}」`;
}

/** 將附件契約呈現為頁籤內可閱讀的報告。 */
export function renderOsvReport(root: HTMLElement, value: unknown): void {
  root.replaceChildren();
  let report: OsvTabReport;
  try {
    report = parseOsvTabReport(value);
  } catch (error) {
    append(root, 'p', (error as Error).message).setAttribute('role', 'alert');
    return;
  }
  root.classList.add('osv-root');
  const card = append(root, 'section');
  card.className = 'osv-card';
  const title = append(card, 'div');
  title.className = 'title-row';
  icon(title, 'shield');
  append(title, 'h1', 'OSV 弱點報告');
  const status = append(card, 'div');
  status.className = 'verdict';
  const pill = append(status, 'span');
  const completed = [report.product, report.developmentExtra].every(
    (s) => s.status === 'completed',
  );
  pill.className = `verdict-pill ${report.exceeded ? 'is-fail' : completed ? 'is-pass' : 'is-incomplete'}`;
  icon(pill, report.exceeded || !completed ? 'fail' : 'pass');
  pill.append(root.ownerDocument.createTextNode(verdict(report)));
  for (const [label, text] of [
    ['報告產生時間 ', generatedTime(report.generatedAt)],
    ['OSV Scanner ', report.scannerVersion || '未提供'],
  ]) {
    const item = append(status, 'span', label);
    item.className = 'metadata';
    append(item, 'span', text);
  }
  if (report.dtSkipped) append(status, 'span', '已略過 DT 上傳').className = 'metadata';
  overview(card, report);
  const selected = new Set(severities);
  const filters = append(card, 'div');
  filters.className = 'severity-filters';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '等級篩選');
  append(filters, 'span', '篩選等級').className = 'filter-label';
  const buttons = severities.map((severity) => {
    const count = [report.product, report.developmentExtra]
      .flatMap((s) => (s.status === 'completed' ? s.findings : []))
      .filter((f) => f.severity === severity).length;
    const button = append(filters, 'button');
    button.className = 'osv-chip';
    severityLabel(button, severity);
    button.append(root.ownerDocument.createTextNode(` ${count}`));
    button.type = 'button';
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
      if (selected.has(severity)) selected.delete(severity);
      else selected.add(severity);
      refresh();
    });
    return button;
  });
  const all = append(filters, 'button', '全部顯示');
  all.type = 'button';
  all.className = 'osv-chip reset-filter';
  const sections = [
    section(
      card,
      '一、產品 SBOM 弱點',
      report.product,
      selected,
      '產品 SBOM 未發現已知弱點。',
      report.sboms.product,
      '部署到正式環境的套件，請優先處理。',
    ),
    section(
      card,
      '二、開發套件額外弱點',
      report.developmentExtra,
      selected,
      '開發套件無額外弱點。',
      report.sboms.full,
      '只出現在完整 SBOM（含開發套件）、產品 SBOM 未列的項目；影響建置與開發工具鏈，不隨產品部署。',
    ),
  ];

  /** 同步多選按鈕與兩區明細，不改變總覽統計。 */
  const refresh = (): void => {
    buttons.forEach((button, index) =>
      button.setAttribute('aria-pressed', String(selected.has(severities[index]))),
    );
    sections.forEach((update) => update());
  };
  all.addEventListener('click', () => {
    severities.forEach((severity) => selected.add(severity));
    refresh();
  });
  footer(card);
}

/** 說明連結採用固定來源網址，與外部弱點資料的連結分開。 */
function footer(card: HTMLElement): void {
  const p = append(
    card,
    'p',
    '依 OSV 群組最大 CVSS 由高至低排序：危急 ≥9.0、高 ≥7.0、中 ≥4.0、低 >0、無 =0，缺少評分為未知。發佈日期與最後修改取自 OSV 記錄的 published／modified（UTC 日期）。建議升級依目前版本所屬分支列出，請確認適用版本。完整報告見成品 OSV弱點報告-產品.md、OSV弱點報告-完整.md。資料來源：',
  );
  p.className = 'report-footer';
  const scanner = append(p, 'a', 'OSV Scanner');
  scanner.href = 'https://google.github.io/osv-scanner/output/';
  p.append(card.ownerDocument.createTextNode('；分級依 '));
  const cvss = append(p, 'a', 'FIRST CVSS');
  cvss.href =
    'https://www.first.org/cvss/v3.1/specification-document#Qualitative-Severity-Rating-Scale';
  p.append(card.ownerDocument.createTextNode('。'));
  for (const link of [scanner, cvss]) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
}
