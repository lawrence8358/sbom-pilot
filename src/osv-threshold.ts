import { osvSeverityOrder, osvSeverityLabels, type OsvFinding } from './osv-report';

import {
  osvFailOnValues,
  osvThresholdLabels as labels,
  type OsvThreshold,
} from './shared/osv-tab-contract';
export { osvFailOnValues } from './shared/osv-tab-contract';
export type OsvFailOn = OsvThreshold;
export interface OsvFindingGroups {
  exceeded: readonly OsvFinding[];
  below: readonly OsvFinding[];
}

/** 嚴格驗證 OSV 失敗門檻，只對未提供的設定採用未知預設。 */
export function validateOsvFailOn(value: unknown = 'unknown'): OsvFailOn {
  if (typeof value !== 'string' || !osvFailOnValues.some((option) => option === value)) {
    throw new Error(
      'OSV 失敗門檻參數 osvFailOn 必須是 critical、high、medium、low、unknown 或 warnOnly。',
    );
  }

  return value as OsvFailOn;
}

/** 依 OSV 失敗門檻分組並保留報告順序，僅警告時所有弱點均未達門檻。 */
export function partitionOsvFindings(
  findings: readonly OsvFinding[],
  threshold: OsvFailOn,
): OsvFindingGroups {
  const exceeded: OsvFinding[] = [],
    below: OsvFinding[] = [];

  for (const finding of findings) {
    if (
      threshold !== 'warnOnly' &&
      osvSeverityOrder.indexOf(finding.severity) <= osvSeverityOrder.indexOf(threshold)
    ) {
      exceeded.push(finding);
    } else {
      below.push(finding);
    }
  }

  return { exceeded, below };
}

/** 彙整各等級超標筆數，僅在確實略過 DT 上傳時附加說明。 */
export function osvThresholdMessage(
  exceeded: readonly OsvFinding[],
  threshold: OsvFailOn,
  dtSkipped: boolean,
): string {
  const counts = osvSeverityOrder
    .map((severity) => {
      const count = exceeded.filter((finding) => finding.severity === severity).length;
      return count ? `${labels[severity]} ${count}` : '';
    })
    .filter(Boolean)
    .join('、');

  return `OSV 弱點達到失敗門檻『${labels[threshold]}』：${counts}${dtSkipped ? '；已略過 DT 上傳' : ''}。`;
}
