import * as tl from 'azure-pipelines-task-lib/task';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readTaskConfig } from './config';
import { runWorkflow } from './workflow';

async function main(): Promise<void> {
  let tempDirectory: string | undefined;
  try {
    if (!tl.getVariable('Build.BuildId') || tl.getVariable('Release.ReleaseId')) throw new Error('此 Task 需要 Classic Build 或 YAML Build 工作；Classic Release 不支援 Build Artifact 上傳。');
    const config = readTaskConfig(name => tl.getInput(name));
    const agentTemp = tl.getVariable('Agent.TempDirectory');
    if (!agentTemp) throw new Error('缺少 Agent.TempDirectory。');
    tempDirectory = await mkdtemp(join(agentTemp, 'sbom-pilot-'));
    await runWorkflow(config, tempDirectory, {
      log: message => console.log(message),
      publish: async sbom => {
        // Agent processes this command asynchronously and reports upload failures.
        // Keep the file alive until job cleanup: deleting it in finally races the Agent.
        tl.uploadArtifact('SBOM', sbom.path, 'SBOM');
        console.log('SBOM Build Artifact 上傳已排入 Agent 佇列；請由工作結果及成品頁確認完成。');
      },
    });
    tl.setResult(tl.TaskResult.Succeeded, 'SBOM 已產生並驗證，成品上傳已排入佇列。');
  } catch (error) {
    tl.setResult(tl.TaskResult.Failed, error instanceof Error ? error.message : 'SBOM Pilot 執行失敗。');
  } finally {
    // Remove tool/auth space, retaining only the validated artifact for Agent upload.
    if (tempDirectory) await rm(join(tempDirectory, 'cdxgen'), { recursive: true, force: true });
  }
}
void main();
