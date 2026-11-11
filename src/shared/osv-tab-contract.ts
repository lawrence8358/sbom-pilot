export const OSV_TAB_ATTACHMENT_TYPE = 'sbom-pilot.osv-report';
export const OSV_TAB_CONTRIBUTION_ID = 'osv-report-tab';

export const osvRatings = [
  { severity: 'critical', label: '危急', name: 'Critical', icon: '🔴', minimum: 9 },
  { severity: 'high', label: '高', name: 'High', icon: '🟠', minimum: 7 },
  { severity: 'medium', label: '中', name: 'Medium', icon: '🟡', minimum: 4 },
  { severity: 'low', label: '低', name: 'Low', icon: '🔵', minimum: 0.1 },
  { severity: 'none', label: '無', name: 'None', icon: '⚪', minimum: 0 },
  { severity: 'unknown', label: '未知', name: 'Unknown', icon: '⚪', minimum: -1 },
] as const;
export type OsvSeverity = (typeof osvRatings)[number]['severity'];
export const osvSeverityOrder: readonly OsvSeverity[] = osvRatings.map((item) => item.severity);
export const osvSeverityLabels = Object.fromEntries(
  osvRatings.map((item) => [item.severity, item.label]),
) as Record<OsvSeverity, string>;

// 沿用 osvFailOn 的合法值；無風險不是可選擇的失敗門檻。
export const osvFailOnValues = [
  'critical',
  'high',
  'medium',
  'low',
  'unknown',
  'warnOnly',
] as const;
export type OsvThreshold = (typeof osvFailOnValues)[number];
export const osvThresholdLabels = { ...osvSeverityLabels, warnOnly: '僅警告' } as const;

export interface OsvTabFinding {
  severity: OsvSeverity;
  score?: number;
  ecosystem: string;
  name: string;
  version: string;
  fixed: string[];
  ids: string[];
  cves: string[];
  published?: string;
  modified?: string;
}

export interface OsvTabSection {
  status: 'completed' | 'failed' | 'disabled';
  findings: OsvTabFinding[];
}

export interface OsvTabReport {
  schemaVersion: 1;
  generatedAt: string;
  scannerVersion?: string;
  threshold?: OsvThreshold;
  exceeded: boolean;
  dtSkipped: boolean;
  sboms: { product: string; full: string };
  product: OsvTabSection;
  developmentExtra: OsvTabSection;
}
