import type {
  OsvSeverity,
  OsvTabFinding,
  OsvTabReport,
  OsvTabSection,
} from '../shared/osv-tab-contract';
import { parseOsvTabReport } from './validate';

const labels = {
  critical: '危急',
  high: '高',
  medium: '中',
  low: '低',
  none: '無',
  unknown: '未知',
  warnOnly: '僅警告',
};

const severities: OsvSeverity[] = ['critical', 'high', 'medium', 'low', 'none', 'unknown'];

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
  table.setAttribute('aria-label', '弱點總覽');
  const header = append(append(table, 'thead'), 'tr');
  for (const label of ['範圍', '受影響套件', '弱點數', ...severities.map((s) => labels[s])]) {
    append(header, 'th', label).scope = 'col';
  }
  const body = append(table, 'tbody');
  const groups: [string, OsvTabSection[]][] = [
    ['產品 SBOM', [report.product]],
    ['開發套件額外', [report.devExtra]],
    ['完整合計', [report.product, report.devExtra]],
  ];
  for (const [label, sections] of groups) {
    const row = append(body, 'tr');
    append(row, 'th', label).scope = 'row';
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
      if (index >= 2 && count === 0 && cell.textContent === '0') cell.className = 'zero-count';
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
  append(row, 'td', labels[finding.severity]);
  append(row, 'td', finding.score === undefined ? '未提供' : String(finding.score));
  const pkg = append(row, 'td');
  append(pkg, 'div', finding.name);
  append(pkg, 'div', finding.ecosystem).className = 'ecosystem';
  append(row, 'td', finding.version || '未提供');
  append(row, 'td', finding.fixed.join('、') || '未提供');
  const ids = append(row, 'td');
  if (!finding.cves.length) append(ids, 'div', '（無 CVE，僅 GHSA）');
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
): () => void {
  const container = append(root, 'section');
  const heading = append(container, 'h2', title);
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
    if (!key) {
      cell.textContent = label;
      continue;
    }
    sortable.push([cell, key]);
    const button = append(cell, 'button', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      descending = key === sortKey ? !descending : key === 'severity' || key === 'score';
      sortKey = key;
      refresh();
    });
  }
  const body = append(table, 'tbody');
  const empty = append(container, 'p');

  /** 更新明細與可及排序狀態，保留表頭按鈕及其鍵盤焦點。 */
  const refresh = (): void => {
    const findings = value.findings
      .filter((f) => selected.has(f.severity))
      .sort((a, b) => compareFindings(a, b, sortKey, descending));
    for (const [cell, key] of sortable) {
      cell.setAttribute(
        'aria-sort',
        key === sortKey ? (descending ? 'descending' : 'ascending') : 'none',
      );
    }
    heading.textContent = `${title}（顯示 ${findings.length} ／ ${value.findings.length} 筆）`;
    body.replaceChildren();
    for (const finding of findings) findingRow(body, finding);
    wrapper.hidden = findings.length === 0;
    empty.hidden = findings.length > 0;
    empty.textContent = value.findings.length === 0 ? emptyMessage : '目前篩選條件下沒有弱點。';
  };
  refresh();
  return refresh;
}

/** 狀態優先於門檻結果，避免未完成的掃描被呈現為已通過。 */
function verdict(report: OsvTabReport): string {
  const statuses = [report.product.status, report.devExtra.status];
  const threshold = `OSV 失敗門檻：${report.threshold ? labels[report.threshold] : '未提供'}`;
  if (statuses.includes('failed')) return `掃描失敗，無法判定完整結果；${threshold}`;
  if (statuses.includes('disabled')) return `本次未執行 OSV 弱點掃描；${threshold}`;
  return `${report.exceeded ? '已達到或超過' : '未達到'} ${threshold}`;
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
  append(root, 'h1', 'OSV 弱點報告');
  append(
    root,
    'p',
    `報告產生時間：${generatedTime(report.generatedAt)}；OSV Scanner：${report.scannerVersion || '未提供'}`,
  );
  append(root, 'p', `${verdict(report)}${report.dtSkipped ? '；已略過 DT 上傳' : ''}`).className =
    'verdict';
  overview(root, report);
  const selected = new Set(severities);
  const filters = append(root, 'div');
  filters.className = 'severity-filters';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '等級篩選');
  const all = append(filters, 'button', '全部顯示');
  all.type = 'button';
  const buttons = severities.map((severity) => {
    const count = [report.product, report.devExtra]
      .flatMap((s) => (s.status === 'completed' ? s.findings : []))
      .filter((f) => f.severity === severity).length;
    const button = append(filters, 'button', `${labels[severity]}（${count}）`);
    button.type = 'button';
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
      if (selected.has(severity)) selected.delete(severity);
      else selected.add(severity);
      refresh();
    });
    return button;
  });
  const sections = [
    section(root, '一、產品 SBOM 弱點', report.product, selected, '產品 SBOM 未發現已知弱點。'),
    section(root, '二、開發套件額外弱點', report.devExtra, selected, '開發套件無額外弱點。'),
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
}
