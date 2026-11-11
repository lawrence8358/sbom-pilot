import { dtApiKeyInput, npmCredentialsInput, nugetCredentialsInput } from './azure-secret-inputs';
import * as tl from 'azure-pipelines-task-lib/task';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTaskConfig } from './config';
import { readAzureInput } from './azure-inputs';
import { runWorkflow } from './workflow';
import { OSV_TAB_ATTACHMENT_TYPE, OSV_TAB_CONTRIBUTION_ID } from './shared/osv-tab-contract';
import extension from '../vss-extension.json';

/** 從擴充套件資訊與建置變數推導頁籤連結，保留地端集合路徑並編碼專案名稱。 */
function osvTabUrl(): string | undefined {
  const collection = tl.getVariable('System.CollectionUri');
  const project = tl.getVariable('System.TeamProject');
  const build = tl.getVariable('Build.BuildId');
  const tab = extension.contributions.find((item) => item.id === OSV_TAB_CONTRIBUTION_ID);
  if (!collection || !project || !build || !tab) return;

  const contribution = `${extension.publisher}.${extension.id}.${tab.id}`;

  return `${collection.replace(/\/+$/, '')}/${encodeURIComponent(project)}/_build/results?buildId=${encodeURIComponent(build)}&view=${encodeURIComponent(contribution)}`;
}

/** 銜接 Azure Build 輸入、工作流程與結果；finally 清理掃描工具但保留待 Agent 上傳的 SBOM。 */
async function main(): Promise<void> {
  let tempDirectory: string | undefined;
  let resultLink = '';

  try {
    if (dtApiKeyInput) {
      tl.setSecret(dtApiKeyInput);
    }
    if (!tl.getVariable('Build.BuildId') || tl.getVariable('Release.ReleaseId')) {
      throw new Error(
        '此 Task 需要 Classic Build 或 YAML Build 工作；Classic Release 不支援 Build Artifact 上傳。',
      );
    }
    const reportUrl = osvTabUrl();
    if (reportUrl) {
      resultLink = ` OSV 弱點報告：${reportUrl}`;
      console.log(`OSV 弱點報告：${reportUrl}`);
    }

    const config = readTaskConfig((name) =>
      name === 'dtApiKey'
        ? dtApiKeyInput
        : name === 'npmCredentials'
          ? npmCredentialsInput
          : name === 'nugetCredentials'
            ? nugetCredentialsInput
            : readAzureInput(name),
    );
    const agentTemp = tl.getVariable('Agent.TempDirectory');

    if (!agentTemp) {
      throw new Error('缺少 Agent.TempDirectory。');
    }

    tempDirectory = await mkdtemp(join(agentTemp, 'sbom-pilot-'));
    await runWorkflow(config, tempDirectory, {
      /** 將工作流程的安全階段摘要寫入 Pipeline 日誌，不轉印子程序原始輸出。 */
      log: (message) => console.log(message),

      /** 排入 Agent 的 Build Artifact 上傳請求，保留檔案到工作清理以避免非同步讀取競爭。 */
      publish: async (sbom, artifactName) => {
        // Agent 非同步處理上傳並回報錯誤；檔案保留到工作清理，不能在 finally 提前刪除。
        tl.uploadArtifact(artifactName, sbom.path, artifactName);
        console.log('SBOM Build Artifact 上傳已排入 Agent 佇列；請由工作結果及成品頁確認完成。');
      },

      /** 將已完成的 Markdown 報告發佈到相同成品，保留檔案直到 Agent 完成非同步讀取。 */
      publishReport: async (report, artifactName) => {
        tl.uploadArtifact(artifactName, report.path, artifactName);
        console.log('OSV 弱點報告上傳已排入 Agent 佇列；請由工作結果及成品頁確認完成。');
      },

      /** 以 UTF-8 寫出頁籤契約附件，保留到工作清理以供 Agent 非同步讀取。 */
      publishTabReport: async (report, path) => {
        await writeFile(path, JSON.stringify(report), 'utf8');
        tl.addAttachment(OSV_TAB_ATTACHMENT_TYPE, 'osv-report', path);
        console.log('OSV 弱點報告頁籤附件已排入 Agent 佇列。');
      },
    });
    tl.setResult(tl.TaskResult.Succeeded, `SBOM 已產生並驗證，成品上傳已排入佇列。${resultLink}`);
  } catch (error) {
    tl.setResult(
      tl.TaskResult.Failed,
      `${error instanceof Error ? error.message : 'SBOM Pilot 執行失敗。'}${resultLink}`,
    );
  } finally {
    // 清理掃描工具暫存，保留已驗證成品供 Agent 非同步讀取。
    if (tempDirectory) {
      await rm(join(tempDirectory, 'cdxgen'), { recursive: true, force: true });
    }
  }
}
void main();
