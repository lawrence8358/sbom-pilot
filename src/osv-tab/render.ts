import type { OsvTabFinding, OsvTabReport, OsvTabSection } from '../shared/osv-tab-contract';
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
function section(root: HTMLElement, title: string, value: OsvTabSection): void {
  const container = append(root, 'section');
  append(container, 'h2', title);
  if (value.status !== 'completed') {
    append(
      container,
      'p',
      value.status === 'failed' ? '掃描失敗，無法提供完整弱點清單。' : '本次未執行 OSV 弱點掃描。',
    );
    return;
  }
  const wrapper = append(container, 'div');
  wrapper.className = 'table-scroll';
  const table = append(wrapper, 'table');
  table.setAttribute('aria-label', title);
  const header = append(append(table, 'thead'), 'tr');
  for (const label of [
    '等級',
    'CVSS',
    '套件',
    '目前版本',
    '建議升級',
    '弱點編號',
    '發佈日期',
    '最後修改',
  ]) {
    append(header, 'th', label).scope = 'col';
  }
  const body = append(table, 'tbody');
  for (const finding of value.findings) findingRow(body, finding);
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
  append(root, 'p', `${verdict(report)}${report.dtSkipped ? '；已略過 DT 上傳' : ''}`).className =
    'verdict';
  append(
    root,
    'p',
    `報告產生時間：${generatedTime(report.generatedAt)}；OSV Scanner：${report.scannerVersion || '未提供'}`,
  );
  section(root, '一、產品 SBOM 弱點', report.product);
  section(root, '二、開發套件額外弱點', report.devExtra);
}
