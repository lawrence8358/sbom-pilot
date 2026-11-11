import { taskLogIssue } from './logging-command';
import { osvFindingIdentity, osvSeverityLabels, type OsvFinding } from './osv-report';
import type { OsvFindingGroups } from './osv-threshold';

const issueLimit = 50;

/** 將既有門檻分組轉為逐筆弱點 issue，透過 workflow 共用日誌送給 Agent。 */
export function logOsvIssues(
  groups: OsvFindingGroups,
  log: (message: string) => void,
  devExtra: OsvFinding[] = [],
): void {
  const developmentIds = new Set(devExtra.map(osvFindingIdentity));

  for (const [type, findings] of [
    ['error', groups.exceeded],
    ['warning', groups.below],
  ] as const) {
    for (const finding of findings.slice(0, issueLimit)) {
      const links = finding.ids.map((id) => `https://osv.dev/${encodeURIComponent(id)}`).join('、');
      log(
        taskLogIssue(
          type,
          `OSV：${developmentIds.has(osvFindingIdentity(finding)) ? '開發套件' : '套件'} '${finding.name}' ${finding.version}（${finding.ecosystem}）具有已知的 ${osvSeverityLabels[finding.severity]} 嚴重性弱點 ${finding.ids.join('、')}（${finding.cves.join('、') || '未提供'}），修復版本 ${finding.fixed.join('、') || '未提供'}，${links}`,
        ),
      );
    }
    if (findings.length > issueLimit) {
      log(taskLogIssue(type, `另有 ${findings.length - issueLimit} 筆，詳見 OSV 弱點報告`));
    }
  }
}
