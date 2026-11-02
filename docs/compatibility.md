# 執行相容性與驗收

本頁區分來源支持的候選組合、本機驗證與真實 Azure DevOps 驗收。**Services／Server 的 VSIX 安裝、Classic／YAML UI、成品下載及 Agent 上傳失敗傳播目前均為 UNVERIFIED**；未提供實際組織／Server 環境，不宣稱最低 Server 已確認。

## Handler 與平台

同一 `index.js` 以 Node20 為 bundle 目標，manifest 提供 `Node20_1`／`Node24`、`visibility:["Build"]`、最低 Agent3.238.0。Agent 必須先能啟動 handler，Task 下載的掃描 Node24 不能修復啟動前缺少 handler 的問題。Classic Release 不適用 Build Artifact 流程。

| 組合 | Handler／工具 | 證據與狀態 |
| --- | --- | --- |
| Windows x64 本機 | Handler Node20.20.2／24.22.1 | dist 與實際 VSIX 在 Repo 外啟動、秘密遮罩、manifest 與告示檢查通過；Node20 HTTP／DT／Proxy／CA 15/15 測試通過 |
| Linux x64 Debian bookworm 容器 | Node24.22.2 | fresh npm ci；最終67/67測試、建置、tfx0.24.2打包、隔離 dist／VSIX 檢查通過 |
| Linux x64 Debian bookworm 容器 | Node20.20.2 | HTTP／DT／Proxy／CA／UTF-8子程序16/16測試、隔離 dist／VSIX 檢查通過 |
| Linux x64 Ubuntu24.04.3 SDK 容器 | Node24.22.2／SDK10.0.101 | fresh npm ci、76/76測試；真實 .NET Core restore＋獨立／pnpm 合併掃描通過，詳見[可重跑命令及結果](combined.md) |
| Azure DevOps Services | 由實際 Agent 選擇 Node20_1／Node24 | UNVERIFIED；需記錄服務日期、Agent、OS、handler 與下載成品 |
| Server2022.2／Agent3.238.0 | Node20_1 來源候選 | 官方配對表及 tagged Agent 原始碼支持此候選；VSIX 安裝、Windows／Linux、Classic／YAML 均 UNVERIFIED |
| Server2020.1.2／2019.1.2 官方 Agent3.225.0 | 低於本 manifest 門檻 | 不列為支援組合，不從其他 Agent 版本推定可用 |
| arm64 | Windows／Linux 工具下載設計目標 | UNVERIFIED |
| .NET Framework／Linux | 不適用 | .NET Framework 僅 Windows，需預裝 VS Build Tools／workloads |

本機掃描既有證據見 README-Dev：Windows/Linux npm 最小流程、Windows npm/pnpm/Yarn、.NET Core SDK6/9/10、Windows .NET Framework；新增[前後端合併與 Linux .NET Core 真實還原／掃描](combined.md)。Debian 容器列為入口／協定檢查，Ubuntu SDK 容器列另有實際 NuGet 與合併掃描證據；均為本機測試環境。

合併模式新增後，Windows 完整測試為76/76（既有67加9項合併測試）；Node20另有先前分段UTF-8 stdout/stderr回歸檢查。子程序以串流解碼保存跨 data event 的中文字元，避免 JSON 或專案路徑被替換字元破壞。

Linux Node24 image ID：`sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`；Node20：`sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5`。

[官方 Server／Agent 配對表](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/v4-agent?view=azure-devops#does-azure-devops-server-support-the-4x-agent) 指定2022.2配3.238.0；[Agent v3.238.0](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/Handlers/NodeHandler.cs) 含 Node20_1。此為保守來源候選，不能替代安裝測試。[Task schema](https://github.com/microsoft/azure-pipelines-task-lib/blob/master/tasks.schema.json) 允許兩個 handler；[runner 政策](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/nodejs-runners?view=azure-devops) 會變動，公開發佈前需再查證。

## Proxy、CA 與逾時

工具下載與 DT 套用 Agent.ProxyUrl／Username／Password、regex bypass、CAInfo 與 client certificate；另遵循 HTTP_PROXY／HTTPS_PROXY／NO_PROXY。原生連線使用 CONNECT Proxy，認證只出現在 Proxy header，DT Key 只出現在目的服務 header，不放 CLI arguments 或錯誤文字。總請求逾時涵蓋 CONNECT 等待，回應有大小界限；DT TLS 略過只作用於 DT 目的連線，HTTPS Proxy 本身仍驗證憑證，沒有修改 NODE_TLS_REJECT_UNAUTHORIZED。

下載每個請求最多120秒、最多三次嘗試，每次最多五個 redirect，拒絕 HTTPS→HTTP 降級；每個回應上限256MiB。DT 每次30秒／最多三次，回應上限64KiB，完全不跟隨 redirect。

子工具取得 generic http_proxy／https_proxy（保留已存在值）、合併系統根憑證與 Agent CA 的 NODE_EXTRA_CA_CERTS，並在未指定時提供 SSL_CERT_FILE／CURL_CA_BUNDLE。不改寫 Repo 的 registry／feed 設定。Agent regex bypass 無法無損轉成各工具 NO_PROXY：使用者需在 Agent 提供等效 NO_PROXY；不會猜測並擴大繞過範圍。Client certificate 自動套用僅涵蓋原生連線，子工具依各自來源／憑證設定；Windows NuGet 仍需 Windows 信任存放區。企業網路完整流程、client certificate 的真實伺服器組合仍待驗證。這些限制不能靠全域略過 TLS 解決。

## 真實環境手動驗收

每個待驗證 Services／Server 組合各執行 Windows、Linux，分別使用 Classic Build 與 YAML；.NET Framework 的 Linux 列為不適用。先記錄 Server 年版／Update、Agent 完整版本、OS／架構、VSIX SHA-256、Task 版本、選用 handler、Node/cdxgen 實際版本。未知欄位保留 UNVERIFIED。

1. 執行 `npm ci`、`npm test`、`npm run package:dev`、`npm run test:package`。Windows 以 `Get-FileHash packages/local-dev-placeholder.sbom-pilot-0.1.0.vsix -Algorithm SHA256` 記錄套件；Linux 用 `sha256sum`。僅安裝標示 Local Development 的測試擴充功能，正式 Publisher／公開網址與上游告示仍未完成。
2. 在測試組織／Collection 擴充功能管理頁上傳同一個 VSIX 並安裝。記錄安裝結果及版本。Classic Build 搜尋 SBOM Pilot，確認 Vue、.NET Core、.NET Framework 選項；DT 關閉時 DT 欄位隱藏，而 projectPath、excludes、specVersion 仍顯示；開啟時要求 URL／UUID／Key。Classic Release 不應列出本 Task。
3. 建立最小 Vue/npm 測試 Repo：package.json 含 `name:host-test-product`、`version:1.0.0`、`private:true`、dependencies.vue=`3.5.13`、devDependencies.chalk=`5.3.0`；main.js 內容 `import { createApp } from 'vue'; createApp({});`。在開發端執行 npm install 並提交 package.json、package-lock.json、main.js。Agent 保留必要 handler，但使用空的 SBOM Pilot 工具快取，讓單一 Task 自行準備掃描工具。
4. Classic Build 加一個 SBOM Pilot，Vue、Repo 根目錄、Node24.x、Spec1.6、DT關閉；不加 NodeTool／npm／cdxgen Task。YAML 使用下方相同值。確認工具實際版本、required-only、Schema 驗證及組件數；缺 lockfile／不同步各跑一次並確認失敗。

```yaml
trigger: none
pool:
  name: '<test-agent-pool>'
steps:
  - checkout: self
  - task: SbomPilot@0
    inputs:
      environment: vue
      projectPath: '$(Build.SourcesDirectory)'
      nodeVersion: '24.x'
      specVersion: '1.6'
      uploadToDt: false
      fetchLicense: true
      noCache: true
```

5. 從 Build 結果下載 SBOM/bom.json，以官方1.6 Schema 驗證。從 Agent.TempDirectory 的本次 `sbom-pilot-*/sbom/bom.json` 計算 SHA-256，與下載檔案比對；Windows用Get-FileHash，Linux用sha256sum。確認 Vue 與依賴關係、記錄 chalk 的 required scope 結果；不得將 scope 結果宣稱為實際部署逐項核對。
6. 設定既有 DT UUID 及 Secret Pipeline Variable Key。成功時僅應記錄「已接受上傳」，不等待匯入。改用無效 Key／不可達測試端點再跑，Task 必須失敗，但有效成品仍可下載且 hash 一致。檢查 debug、成功與重試日誌沒有明文 Key／Proxy 密碼。
7. 在隔離的測試 Agent／Proxy 阻擋此次 Build Artifact 容器上傳請求（依 Agent diagnostics 確認其實際 URL），保留其他還原／工具來源可達，再跑原 Task。確認產生有效 SBOM 後 Agent 上傳失敗，最終步驟 Failed；測試時不可設定 continueOnError。另可用不存在檔案的 artifact.upload logging command 診斷 Agent，但此探針不能當作 SBOM Pilot 本身發佈失敗已驗收。
8. 企業情境另跑 authenticated Proxy、bypass、內部 CA、DT預設TLS／略過的矩陣。記錄具體憑證與 Proxy 類型但不保存秘密。完成後將實際結果／hash／版本填回驗證紀錄；沒有執行的列保持 UNVERIFIED。

Build Artifact 的 logging command 由 Agent 非同步處理；handler 的「已排入佇列」不是完成確認。[官方成品命令](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 與 [Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 支持此設計，實際下載與失敗結果仍需上述 live 驗證。

## 私有 npm 來源追加驗證

2026-11-03：Windows x64 完整私有來源七種情境，以及 Ubuntu24.04.3 x64／Node24.22.2／SDK10.0.101 容器的 npm、原生pnpm12、YarnPnP、合併產品，均實際下載 Bearer／Basic 私有套件與無認證公開套件並驗證依賴邊／1.6Schema／本機成品。Windows與Linux各91/91測試；錯誤／缺認證、來源隔離、清理及設定／鎖檔不變亦通過。完整命令與限制見[私有 npm 文件](npm-auth.md)；此紀錄追加於上方先前入口／協定與合併驗證，liveAzure及企業環境狀態不變。
