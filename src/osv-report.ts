import { valid, gte, lt } from 'semver';

type RecordValue = Record<string, unknown>;
export type OsvSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
export interface OsvFinding {
  severity: OsvSeverity;
  ids: string[];
  cves: string[];
  score?: number;
  ecosystem: string;
  name: string;
  version: string;
  fixed: string[];
}
const ratings = [
  { severity: 'critical', name: '危急 Critical', icon: '🔴', minimum: 9 },
  { severity: 'high', name: '高 High', icon: '🟠', minimum: 7 },
  { severity: 'medium', name: '中 Medium', icon: '🟡', minimum: 4 },
  { severity: 'low', name: '低 Low', icon: '🔵', minimum: 0.1 },
  { severity: 'none', name: '無 None', icon: '⚪', minimum: 0 },
  { severity: 'unknown', name: '未知 Unknown', icon: '⚪', minimum: -1 },
] as const;

/** 驗證 JSON 物件形狀，避免上游不相容資料被視為無弱點。 */
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OSV JSON 報告格式不相容，預期物件。');
  }

  return value as RecordValue;
}

/** 取得可省略的物件清單，非陣列時明確拒絕而不吞掉掃描結果。 */
function records(value: unknown): RecordValue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('OSV JSON 報告格式不相容，預期清單。');

  return value.map(record);
}

/** 只取字串別名，移除重複值並保留穩定順序。 */
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];
}

/** 安全顯示套件與來源名稱，不允許外部資料插入 Markdown 欄位或 HTML。 */
function cell(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/`/g, '&#96;')
    .replace(/\\/g, '&#92;')
    .replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ');
}

/** 使用 OSV 已計算的群組最大 CVSS 分數，不自行猜測或重新計算 vector。 */
function score(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return;
  const number = Number(value);

  return number >= 0 && number <= 10 ? number : undefined;
}

/** 依 CVSS 定性界線標示嚴重程度，缺少分數時保留未知。 */
function rating(value: number | undefined) {
  return ratings.find((item) => (value ?? -1) >= item.minimum)!;
}

/** 依匹配套件挑出修復事件；可判定的 SemVer 範圍只列目前版本所屬分支。 */
function fixedVersions(
  vulnerabilities: RecordValue[],
  name: string,
  ecosystem: string,
  version: string,
): string[] {
  const fixes = new Set<string>();

  for (const vulnerability of vulnerabilities) {
    for (const affected of records(vulnerability.affected)) {
      if (affected.package === undefined) continue;
      const pkg = record(affected.package);

      if (pkg.name !== name || pkg.ecosystem !== ecosystem) continue;

      for (const range of records(affected.ranges)) {
        let introduced = '0';

        for (const event of records(range.events)) {
          if (typeof event.introduced === 'string') introduced = event.introduced;
          if (typeof event.fixed !== 'string') continue;

          const comparable =
            (range.type === 'SEMVER' || ecosystem === 'NuGet') &&
            valid(version) &&
            valid(event.fixed) &&
            (introduced === '0' || valid(introduced));

          if (
            !comparable ||
            ((introduced === '0' || gte(version, introduced)) && lt(version, event.fixed))
          ) {
            fixes.add(event.fixed);
          }
        }
      }
    }
  }

  return [...fixes].sort();
}

/** 將 OSV 別名群組轉為每個套件／版本一列，避免 GHSA 與 CVE 重複計數。 */
function reportRows(value: unknown): OsvFinding[] {
  const document = record(value);
  if (!Array.isArray(document.results))
    throw new Error('OSV JSON 缺少 results，不能產生弱點報告。');
  const rows: OsvFinding[] = [];

  for (const result of records(document.results)) {
    for (const entry of records(result.packages)) {
      const pkg = record(entry.package);
      if (
        typeof pkg.name !== 'string' ||
        typeof pkg.version !== 'string' ||
        typeof pkg.ecosystem !== 'string'
      ) {
        throw new Error('OSV JSON 缺少套件名稱、版本或生態系。');
      }
      const vulnerabilities = records(entry.vulnerabilities);
      const groups = records(entry.groups);
      if (vulnerabilities.length && !groups.length)
        throw new Error('OSV JSON 缺少弱點群組，不能確認嚴重程度與 CVE 對應。');

      for (const group of groups) {
        const ids = strings(group.ids);
        if (!ids.length) throw new Error('OSV JSON 弱點群組缺少識別碼。');
        const matching = vulnerabilities.filter(
          (item) => typeof item.id === 'string' && ids.includes(item.id),
        );
        const aliases = [
          ...ids,
          ...strings(group.aliases),
          ...matching.flatMap((item) => strings(item.aliases)),
        ];

        const cvss = score(group.max_severity);

        rows.push({
          severity: rating(cvss).severity,
          ids,
          cves: [...new Set(aliases.filter((id) => /^CVE-\d{4}-\d{4,}$/.test(id)))].sort(),
          score: cvss,
          ecosystem: pkg.ecosystem,
          name: pkg.name,
          version: pkg.version,
          fixed: fixedVersions(matching, pkg.name, pkg.ecosystem, pkg.version),
        });
      }
    }
  }

  return rows.sort(
    (left, right) =>
      (right.score ?? -1) - (left.score ?? -1) ||
      left.name.localeCompare(right.name) ||
      left.ids[0].localeCompare(right.ids[0]),
  );
}

/** 由同一次解析與排序產生逐筆弱點清單及 Markdown 成品。 */
export function createOsvReport(
  value: unknown,
  options: { version: string; source: string; findings: boolean },
): { markdown: string; findingList: OsvFinding[] } {
  const rows = reportRows(value);
  if (options.findings && !rows.length)
    throw new Error('OSV 回報有弱點，但 JSON 未包含可呈現的弱點項目。');
  const packageCount = new Set(
    rows.map((row) => JSON.stringify([row.ecosystem, row.name, row.version])),
  ).size;
  const counts = ratings
    .map(
      (item) =>
        `${item.icon} **${item.name}：${rows.filter((row) => rating(row.score) === item).length}**`,
    )
    .join(' ｜ ');
  const lines = [
    '# OSV 弱點報告',
    '',
    `OSV Scanner：${cell(options.version)} ｜ SBOM：${cell(options.source)}`,
    '',
    rows.length
      ? `受影響套件／版本：**${packageCount}** ｜ 套件弱點項目：**${rows.length}**（相同弱點的別名合併計算）`
      : '**未發現已知弱點。**',
    '',
    counts,
    '',
    '| 風險等級 | CVSS | CVE | OSV URL | Ecosystem | Package | Version | Fixed Version | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const level = rating(row.score);
    const cves = row.cves.length
      ? row.cves
          .map((id) => `[${id}](https://www.cve.org/CVERecord?id=${encodeURIComponent(id)})`)
          .join('<br>')
      : '未提供';
    const nonCveIds = row.ids.filter((id) => !row.cves.includes(id));
    const links = (nonCveIds.length ? nonCveIds : row.ids)
      .map((id) => `[${cell(id)}](https://osv.dev/${encodeURIComponent(id)})`)
      .join('<br>');

    lines.push(
      `| ${level.icon} **${level.name}** | ${row.score?.toFixed(1) ?? '未知'} | ${cves} | ${links} | ${cell(row.ecosystem)} | ${cell(row.name)} | ${cell(row.version)} | ${row.fixed.length ? row.fixed.map(cell).join('<br>') : '未提供'} | ${cell(options.source)} |`,
    );
  }

  lines.push(
    '',
    '依 OSV 群組最大 CVSS 分數由高至低排序；危急 ≥9.0、高 ≥7.0、中 ≥4.0、低 >0、無 =0，缺少評分標為未知。',
    'CVE 僅取 OSV 提供的識別碼與別名；沒有對應編號時標為未提供。修復版本依套件分支資料列出，請確認適用的升級分支。',
    '評分與資料來源：[OSV Scanner](https://google.github.io/osv-scanner/output/)；定性分級依 [FIRST CVSS](https://www.first.org/cvss/v3.1/specification-document#Qualitative-Severity-Rating-Scale)。',
    '',
  );

  return { markdown: lines.join('\n'), findingList: rows };
}

/** 保留既有 JSON 轉 Markdown 介面與報告內容。 */
export function renderOsvReport(
  value: unknown,
  options: { version: string; source: string; findings: boolean },
): string {
  return createOsvReport(value, options).markdown;
}
