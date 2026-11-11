export const OSV_TAB_ATTACHMENT_TYPE = 'sbom-pilot.osv-report';
export const OSV_TAB_CONTRIBUTION_ID = 'osv-report-tab';

export type OsvSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
// 沿用 osvFailOn 的合法值；無風險不是可選擇的失敗門檻。
export type OsvThreshold = Exclude<OsvSeverity, 'none'> | 'warnOnly';

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
  devExtra: OsvTabSection;
}
