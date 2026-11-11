import { taskLogIssue } from './command-log';
import type { OsvFinding } from './osv-report';

const labels = {
  critical: '危急',
  high: '高',
  medium: '中',
  low: '低',
  none: '無',
  unknown: '未知',
};
const issueLimit = 50;

/** 將既有門檻分組轉為逐筆弱點 issue，透過 workflow 共用日誌送給 Agent。 */
export function logOsvIssues(
  groups: { exceeded: readonly OsvFinding[]; below: readonly OsvFinding[] },
  log: (message: string) => void,
): void {
  for (const [type, findings] of [
    ['error', groups.exceeded],
    ['warning', groups.below],
  ] as const) {
    const severityOrder = Object.keys(labels);
    const sorted = [...findings].sort(
      (left, right) => severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity),
    );
    for (const finding of sorted.slice(0, issueLimit)) {
      const links = finding.ids.map((id) => `https://osv.dev/${encodeURIComponent(id)}`).join('、');
      log(
        taskLogIssue(
          type,
          `OSV：套件 '${finding.name}' ${finding.version}（${finding.ecosystem}）具有已知的 ${labels[finding.severity]} 嚴重性弱點 ${finding.ids.join('、')}（${finding.cves.join('、') || '未提供'}），修復版本 ${finding.fixed.join('、') || '未提供'}，${links}`,
        ),
      );
    }
    if (sorted.length > issueLimit) {
      log(taskLogIssue(type, `另有 ${sorted.length - issueLimit} 筆，詳見 OSV 弱點報告`));
    }
  }
}
