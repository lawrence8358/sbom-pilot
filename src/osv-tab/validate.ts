import {
  osvSeverityOrder as severities,
  osvFailOnValues as thresholds,
  type OsvTabReport,
} from '../shared/osv-tab-contract';

/** 附件必須是一般物件，不能把陣列或空值當成報告欄位。 */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 檢查外部提供的文字清單，避免渲染到一半才因欄位型別失敗。 */
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** 日期欄位允許缺漏，提供時則必須是有效的 UTC 日曆日期。 */
function optionalDate(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** 驗證一筆弱點的必要欄位、風險數值及可選日期。 */
function finding(value: unknown): boolean {
  return (
    record(value) &&
    severities.some((severity) => severity === value.severity) &&
    ['ecosystem', 'name', 'version'].every((key) => typeof value[key] === 'string') &&
    ['fixed', 'ids', 'cves'].every((key) => strings(value[key])) &&
    (value.score === undefined ||
      (typeof value.score === 'number' &&
        Number.isFinite(value.score) &&
        value.score >= 0 &&
        value.score <= 10)) &&
    optionalDate(value.published) &&
    optionalDate(value.modified)
  );
}

/** 驗證兩個區塊皆有明確狀態與逐筆清單，不推測缺漏資料。 */
function section(value: unknown): boolean {
  return (
    record(value) &&
    ['completed', 'failed', 'disabled'].includes(String(value.status)) &&
    Array.isArray(value.findings) &&
    value.findings.every(finding)
  );
}

/** 在呈現前驗證版本與資料形狀，避免壞附件被誤顯示為安全報告。 */
export function parseOsvTabReport(value: unknown): OsvTabReport {
  if (record(value) && value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    throw new Error('不支援此 OSV 弱點報告版本，請更新擴充套件。');
  }
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.generatedAt,
    ) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    (value.scannerVersion !== undefined && typeof value.scannerVersion !== 'string') ||
    (value.threshold !== undefined &&
      !thresholds.some((threshold) => threshold === value.threshold)) ||
    typeof value.exceeded !== 'boolean' ||
    typeof value.dtSkipped !== 'boolean' ||
    !record(value.sboms) ||
    typeof value.sboms.product !== 'string' ||
    typeof value.sboms.full !== 'string' ||
    !section(value.product) ||
    !section(value.developmentExtra)
  ) {
    throw new Error('OSV 弱點報告資料格式不正確，請檢查建置附件。');
  }
  return value as unknown as OsvTabReport;
}
