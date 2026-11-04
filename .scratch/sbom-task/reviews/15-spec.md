# 工單15 Spec／security 增量審查

範圍：`d296f56...7ddf4a0`；未讀 Standards 報告，不含16。

- **P2：命令診斷可注入 Azure logging command。** `src/command-log.ts:132–136、169–170` 僅跳脫控制字元，保留 `##vso[`。本機 runner probe 的 cwd `D:/source/##vso[task.setvariable variable=REVIEW_PROBE;]untrusted` 原樣進入 console；可控 argv 亦同，例如專案檔名經 `src/dotnet/restore.ts:145–152` 傳入。[官方 Agent parser](https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Microsoft.VisualStudio.Services.Agent/Command.cs#L38-L53) 用 `IndexOf` 搜尋整行任意位置，JSON 前綴無法阻擋；不需換行即可改 Pipeline 變數。這違反安全診斷目的，應中和顯示內容中的控制命令前綴，保留原 argv。

其餘未發現增量規格缺陷：generic／舊 vue 同流程、原始 Command 不變、DT 原生 PUT，與114測試及 Angular 三管理器解包證據一致。未重跑下載；真實 Azure、公開發布與企業環境仍未驗收。
