/** 依 Agent 資料區規則跳脫百分比與換行，保留屬性區以外的分隔字元。 */
export function escapeLoggingCommandData(value: string): string {
  return value.replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** 建立 issue 指令，固定屬性並將外部字串限制在訊息資料區。 */
export function taskLogIssue(type: 'error' | 'warning', message: string): string {
  return `##vso[task.logissue type=${type};]${escapeLoggingCommandData(message)}`;
}
