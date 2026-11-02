# SBOM Pilot

在 Azure Pipelines 加入一個 **SBOM Pilot — Generate & Upload SBOM** Task，即可準備工具並還原專案依賴，產生 CycloneDX 1.6 JSON，並要求 Agent 發佈名稱為 `SBOM` 的 Build Artifact。

本階段提供 Vue/npm、pnpm 與 Yarn Classic／現代 Yarn 專案及 workspace、SDK-style .NET Core、Windows .NET Framework、.NET Core 前後端合併及選用的 Dependency-Track（DT）上傳，使用公開 npm/NuGet 來源。私有來源認證將於後續版本交付。`--required-only` 固定啟用，代表 cdxgen 的 required scope 篩選，不能視為已逐項核對實際部署成品。Yarn workspace 實測會保留部分被上游標為 required 的開發依賴，詳見 [Yarn 支援及限制](docs/yarn.md)。

## 前置條件及支援範圍

| 項目 | 本階段範圍 |
| --- | --- |
| Pipeline | Classic Build、YAML Build；不支援 Classic Release |
| Agent OS | Windows / Linux x64、arm64 為設計目標；目前實測紀錄見開發文件 |
| Task handler | 同一入口提供 `Node20_1`／`Node24`，bundle 目標為 Node20；manifest 最低 Agent `3.238.0` 是保守候選門檻，尚非真實 Server 相容性保證 |
| 掃描工具 | 自動準備最新符合 `24.x` 的 Node；獨立安裝固定 `@cdxgen/cdxgen@13.6.0`，不使用全域 cdxgen |
| npm／pnpm／Yarn | 優先使用 `packageManager` 精確版本及有效的 Yarn 專案執行檔；隔離準備工具，無宣告使用固定 fallback，詳見[管理器說明](docs/package-managers.md) |
| 網路 | Agent 可存取 nodejs.org、npm registry 與專案依賴／授權資訊來源；首次執行需要下載 |
| Server / Services | 使用兩者皆提供的 Build Artifact logging command；尚待真實 Server / Services 安裝與端到端驗證，未宣稱特定最低 Server 支援 |

Vue 模式需提交 manifest 與且僅一種管理器的 lockfile：npm 使用 `package-lock.json` 或 `npm-shrinkwrap.json`，pnpm 使用 `pnpm-lock.yaml`，Yarn 使用 `yarn.lock`。Task 執行對應管理器的嚴格安裝；缺少或不同步的 lockfile 會失敗，不會自動產生或修正。Repo 的來源設定與所選管理器版本的安裝腳本規則仍生效；本階段不提供秘密認證欄位。原生套件所需編譯工具仍需 Agent 提供。.NET Core 的還原與選用鎖檔政策見下方 .NET Core 模式。

pnpm workspace 請指定包含 `pnpm-workspace.yaml` 與鎖檔的共同根目錄。可直接使用[可執行範例](examples/pnpm-workspace/package.json)，YAML 將 `projectPath` 設為 `$(Build.SourcesDirectory)/examples/pnpm-workspace`；不需額外 Corepack、pnpm 或 install Task。版本與衝突診斷見[管理器說明](docs/package-managers.md)。

Yarn workspace 也指定共同根目錄；[Classic 範例](examples/yarn-classic-workspace/package.json)使用 node_modules，[現代 Yarn 範例](examples/yarn-modern-workspace/package.json)預設 PnP，亦實測 node-modules 佈局。Task 保留 `.yarnrc`／`.yarnrc.yml`，不需另外加入 Corepack 或 Yarn install Task。

工具下載與 DT 連線會套用 Agent Proxy／CA 設定，並有請求逾時與回應大小界限；子工具透過環境變數取得 Proxy 與 CA。Agent 的 regex bypass 與子工具的 `NO_PROXY` 規則不同，Windows NuGet 仍需系統信任憑證；企業環境完整流程仍待實測。詳見[相容矩陣與驗收步驟](docs/compatibility.md)。

## 安裝

由維護者依 [開發說明](README-Dev.md) 產生 VSIX，於組織或 Collection 的擴充功能管理介面上傳並安裝。`npm run package:dev` 產生明確標示 `(Local Development)`、Publisher 為 `local-dev-placeholder` 的測試套件，此名稱不是正式 Marketplace 身分。公開 Publisher 與專案網址尚未填入，不提供捏造的 Marketplace 連結。

實際組織／Server 的安裝流程與權限依管理政策而定。此版本尚未完成真實環境 VSIX 安裝驗證，請先在測試環境試用。

## YAML 快速開始

安裝擴充功能後，使用包含 Vue 專案與 lockfile 的 Repo：

```yaml
steps:
  - checkout: self
  - task: SbomPilot@0
    displayName: 產生交付產品 SBOM
    inputs:
      environment: vue
      projectPath: '$(Build.SourcesDirectory)'
      nodeVersion: '24.x'
      specVersion: '1.6'
      uploadToDt: false
      fetchLicense: true
      noCache: true
```

## Classic Build 快速開始

在 Classic Build 編輯器選擇 Agent job → Add task，搜尋 **SBOM Pilot**，設定「開發環境」為 Vue（npm／pnpm／Yarn），專案路徑為包含 lockfile 的專案或 workspace 根目錄，保持「推送到 DT」關閉後儲存並執行。不需另加 NodeTool、套件安裝或 cdxgen Task。

工作成功且 Agent 完成上傳後，在 Build 結果的成品頁選擇 `SBOM`，下載 `bom.json`。上傳由 Agent 非同步執行；Task 日誌的「已排入佇列」不代表伺服器已完成接收，上傳失敗會由 Agent 回報工作失敗。

## 參數

| 欄位（YAML） | 預設 | 說明 |
| --- | --- | --- |
| `environment` | `vue` | `vue`（Vue/npm／pnpm／Yarn）、`dotnet`（.NET Core）、`netframework`（.NET Framework，限 Windows）或 `combined`（.NET Core 前後端合併） |
| `projectPath` | `$(Build.SourcesDirectory)` | 專案根目錄 |
| `nodeVersion` | `24.x` | 最新符合 semver 範圍的 Node，必須 >=24 |
| `excludes` | 見下列規則 | 相對根目錄 glob，逗號分隔，保留花括號內逗號；明確設定空字串代表不加自訂排除 |
| `specVersion` | `1.6` | 固定以附帶的官方 1.6 JSON Schema 驗證 |
| `uploadToDt` | `false` | 啟用後上傳到既有 DT 專案；關閉不讀取或驗證 DT 欄位 |
| `dtApiUrl` | `http://localhost:8081` | 啟用 DT 時必填；服務根網址，可包含反向代理路徑，Task 附加 `/api/v1/bom`；localhost 指 Agent |
| `dtProjectUuid` | 無 | 啟用 DT 時必填；既有 DT 專案 UUID |
| `dtApiKey` | 無 | 啟用 DT 時必填；由 Secret Pipeline Variable 傳入 |
| `skipDtTlsCertificateCheck` | `false` | 啟用 DT 時的進階選項；僅略過 DT HTTPS 憑證驗證 |
| `cdxgenVersion` | `13.6.0` | 進階精確版本覆寫，限 `@cdxgen/cdxgen` 13.x 穩定版；留空使用預設。實際套件版本、Node engines 與必要 CLI 選項會驗證，其他 major／預發版會於工具下載前失敗 |
| `fetchLicense` | `true` | `FETCH_LICENSE`；可能需要額外網路存取 |
| `noCache` | `true` | `CDXGEN_NO_CACHE`；不影響 npm 或 Node 工具快取 |

共通排除規則：

```text
**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**
```

輸出與工具路徑由 Task 管理。有效 SBOM 保留在 Agent 暫存空間直到工作清理，避免與非同步成品上傳競爭；不會將掃描工具目錄發佈為成品。

掃描欄位不受 DT 開關影響。Classic 與 YAML 都接受 `true`／`false`（不分大小寫），錯誤的 `yes`、`0` 或空白布林值會失敗。`fetchLicense` 與 `noCache` 可以獨立關閉；關閉授權補充不會刪除 lockfile 原本已有的授權資料，也不承諾完全不連線。關閉快取停用選項只允許 cdxgen metadata 快取，不變更 npm registry、npm 快取或 Agent Node 工具快取。

若需清除預填排除規則，YAML 使用 `excludes: ''`；Classic 清空該欄位。cdxgen 自身的內建忽略規則（例如 `.git`）仍適用。路徑可包含空白，不需在欄位值內再加引號。

## 選用 DT 上傳

先在 DT 建立交付產品對應的專案，並取得該專案 UUID 及可上傳 BOM 的 API Key。Task 只使用此既有 UUID，不自動建立或以名稱推定其他專案。

在 Pipeline Variables 建立名為 `dtApiKey` 的秘密變數並啟用保密，再加入設定：

```yaml
- task: SbomPilot@0
  inputs:
    environment: vue
    projectPath: '$(Build.SourcesDirectory)'
    uploadToDt: true
    dtApiUrl: 'https://<dt-service-host>'
    dtProjectUuid: '<existing-project-uuid>'
    dtApiKey: '$(dtApiKey)'
    skipDtTlsCertificateCheck: false
```

Classic Build 勾選「推送到 DT」後才顯示 DT 欄位，API Key 同樣填秘密變數參照。掃描路徑、排除規則與 Spec Version 一律保留。

Task 用 HTTP PUT 將已驗證 SBOM 的原始位元組以 Base64 傳至 `/api/v1/bom`；成品仍保留同一份檔案。API 回傳接受 token 時只記錄「DT 已接受上傳」，不等待背景匯入或弱點分析。這個訊息不代表 DT 已完成匯入。

每次請求最多 30 秒，暫時網路錯誤及 HTTP 408、429、500、502、503、504 最多嘗試三次；401／403 等錯誤不重試，不跟隨重新導向。重試可能再次提交已被 DT 接受但回應遺失的 SBOM。日誌不包含 Key、token 或伺服器回應內容。

DT 上傳失敗時仍要求 Agent 發佈有效 `SBOM` 成品，最後 Task 失敗。成品上傳由 Agent 非同步執行，仍需檢查工作結果及成品頁。TLS 預設驗證；略過選項只作用於 DT 目的連線，不更改 Proxy、Node/npm/cdxgen 的 TLS 設定。企業 Proxy／自訂 CA 的完整 Pipeline 驗證仍待完成。

## 疑難排解

- **缺少 lockfile／npm ci 失敗**：在本機使用相同 npm 版本修正 manifest 與 lockfile 後提交。確認 registry 可達及安裝腳本可在 Agent 執行。為避免洩漏來源 token，Task 不轉印原始子程序輸出。
- **工具準備失敗**：確認 nodejs.org 與 npm registry 可達、Agent 的暫存／工具快取可寫、Node 範圍 >=24。Linux 需有 tar；Windows 解壓使用 PowerShell。
- **SBOM 驗證失敗**：檢查 cdxgen 版本覆寫；檔案即使存在，未通過 CycloneDX Schema 也不會發佈。
- **成品不見／發佈失敗**：確認使用 Build 工作、查看 Agent 上傳階段錯誤及工作結果；Classic Release 不支援此成品命令。
- **管理器／鎖檔矛盾**：清除其他管理器的競爭鎖檔，並確認 `packageManager` 宣告的是精確版本。Task 不會自行猜測或改用其他工具；指定版本須能在所選 Node 執行。
- **DT 401／403／404**：確認 Key 上傳權限、既有 Project UUID、服務根網址及 Agent 可達性。localhost 指 Agent；不會自動指向另台 DT 主機。
- **DT TLS 失敗**：預設要求有效憑證；進階略過檢查只對 DT 生效。未完成自訂 CA／Proxy 實測前，請先在測試環境驗證連線。

MIT License · Copyright © 2026 Lawrence Shen。第三方授權見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## .NET Core 前後端合併模式

Classic Build 選擇「.NET Core 前後端合併」，`projectPath` 指向同時包含前端與後端的共同根目錄。根目錄可直接是 pnpm workspace；也可在子目錄放置 npm／pnpm／Yarn 專案或 workspace。Task 從各 workspace 擁有的根目錄進行嚴格安裝，再還原 SDK-style .NET Core 後端，以一次遞迴 dotnet/js 掃描產生一份 SBOM。可直接使用[共同根目錄範例](examples/combined-product/package.json)：

```yaml
- task: SbomPilot@0
  displayName: 產生前後端交付產品 SBOM
  inputs:
    environment: combined
    projectPath: '$(Build.SourcesDirectory)/examples/combined-product'
    excludes: '**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**'
    specVersion: '1.6'
    uploadToDt: false
```

Classic 與 YAML 都只需一個共同根目錄，不需另填前端／後端路徑。排除規則共用並相對該根目錄，可加入產品特有的 `frontend/prototypes/**,backend/Tests/**`；前端仍須有一致的管理器宣告與鎖檔，後端沿用 SDK 與選用 NuGet 鎖檔政策。啟用 DT 時仍對應同一個既有交付產品 UUID。詳見[根目錄規則、限制與可重跑的 Windows／Linux 驗證](docs/combined.md)。

## .NET Core 模式

傳統格式、packages.config 或 Windows Framework 設定請使用 [.NET Framework 模式](docs/framework.md)。該模式按格式使用 Task 準備的 SDK，或 Agent 預裝的 Visual Studio MSBuild；不需要選用 NuGet lockfile。

在 Classic Build 選擇「.NET Core」，專案路徑指向包含 SDK-style `.csproj`、`.fsproj` 或 `.vbproj` 的目錄；YAML 使用同一 Task：

```yaml
steps:
  - task: SbomPilot@0
    inputs:
      environment: dotnet
      projectPath: '$(Build.SourcesDirectory)'
      specVersion: '1.6'
      uploadToDt: false
```

Task 從每個專案的實際還原目錄向上尋找 `global.json`，支援註解及完整 `sdk.version`，由 .NET host 套用 `rollForward` 與 `allowPrerelease`。沒有 SDK 版本宣告時採固定 SDK **10.0.101**，不從 TargetFramework 猜測 SDK feature band。建議在 Repo 提交 `global.json` 以固定專案政策：

```json
{ "sdk": { "version": "10.0.101", "rollForward": "disable" } }
```

相容 SDK 已安裝時驗證後使用；缺少時以 Microsoft 官方 `dotnet-install` 腳本安裝至 Task 工具快取，設定子程序的 PATH／DOTNET_ROOT，不需要額外 UseDotNet 或 restore Task。Agent 仍須具備 SDK 所需原生程式庫、Windows PowerShell 或 Linux bash，並能存取 dot.net、builds.dotnet.microsoft.com 與有效 NuGet 來源。腳本不會安裝 Visual Studio workloads。`global.json sdk.paths` 目前會明確拒絕；跨專案 SDK 政策、特殊 workloads 或自訂 SDK 無法解析時，請依錯誤檢查專案格式及 Agent 條件。

依賴還原使用 SDK 內建 NuGet，保留分層 `NuGet.Config`。Task 先以 NuGet 還原圖取得實際輸出及 lockfile 路徑，再執行 `dotnet restore`；已有 lockfile 才啟用 locked mode 並驗證內容不變。沒有選用 NuGet 鎖檔的合法專案可正常執行，不需要 npm lockfile。每個專案及其 ProjectReference 必須有有效 `project.assets.json`，否則停止，不將只有直接套件的結果當作完整依賴清單。

`.NET` 有一項必要的排除規則轉換：預設 `**/obj/**` 送給掃描器時轉為 `**/obj/!(project.assets.json)`，繼續排除編譯產物，保留經還原驗證的依賴資料。欄位預設值不變；其他自訂 glob 不會改寫。自訂規則若遮蔽必要 assets，或還原資料位於掃描根目錄外，Task 會失敗並要求調整。排除整個非交付專案時，請使用相對該專案目錄的規則。

Windows x64 已以 SDK 6.0.428、9.0.316、10.0.101 實測公開 NuGet、間接依賴、關係及 CycloneDX 1.6；Linux x64 Ubuntu 容器亦已用 SDK 10.0.101 實際還原及掃描。實際 Server／Services 安裝及原生成品上傳仍待獨立驗證。詳見 [開發紀錄](README-Dev.md)。傳統非 SDK-style 專案目前不適用此模式。
