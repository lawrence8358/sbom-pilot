# SBOM Pilot

[Marketplace 產品介紹](marketplace/overview.md) · [包裝與上架操作](docs/marketplace.md)

在 Azure Pipelines 加入一個 **SBOM Pilot — Generate & Upload SBOM** Task，即可準備工具、安裝／還原依賴，並產生交付產品的 CycloneDX 1.6 JSON。結果以名稱為 `SBOM` 的 Build Artifact 提供，也可選擇上傳到既有 Dependency-Track（DT）專案。

## 支援與前置條件

- 使用 **Classic Build 或 YAML Build**；Classic Release 不適用。
- Agent 使用 Windows 或 Linux。.NET Framework 只適用 Windows；目前實測為 x64，arm64 尚待驗證。Task 提供 `Node20_1`／`Node24` handler，manifest 最低 Agent 為 `3.238.0`；特定 Server／Agent 配對仍須依[相容矩陣](docs/compatibility.md)驗收。
- Agent 的暫存目錄與工具快取可寫，並能存取 nodejs.org、npm registry、有效套件來源及所需授權資訊來源。Linux 需有 tar／bash；Windows 需有 PowerShell。
- JavaScript 專案提交 manifest 與**一種管理器的一份一致 lockfile**；workspace 指向共同根目錄。原生套件的編譯工具由 Agent 提供。
- .NET Core 可由 Task 準備 SDK；傳統 .NET Framework 另需 Agent 預裝 MSBuild >=17.8、NuGet Restore targets、相符 targeting pack／workloads。

不需另加 NodeTool、Corepack、UseDotNet、套件安裝或 Authenticate Task。首次執行會下載工具；這不是離線掃描工具。

## 安裝

由維護者依[開發說明](README-Dev.md)產生 VSIX，在組織或 Collection 的擴充功能管理介面上傳並安裝。權限與操作位置依 Azure DevOps 管理政策而定。

`package:dev`／`packaging:preview` 產生 Publisher 為 `local-dev-placeholder` 的本機測試套件。**上傳市集請使用 `packaging:package` 產出的 `LawrenceShen.sbom-pilot-<version>.vsix`**；正式 Publisher 為 `LawrenceShen`，[公開專案](https://github.com/lawrence8358/sbom-pilot)已提供。設定方式與實際上傳路徑見[上架說明](docs/marketplace.md)。目前尚未確認市集安裝成功，真實 Services／Server 安裝與成品下載仍待環境驗收；[版本內容](CHANGELOG.md)與[驗收狀態](docs/compatibility.md)另有記錄。

## 第一次執行

安裝擴充功能後，對含有效 npm lockfile 的 JavaScript／TypeScript 前端專案（例如 Angular 或 Vue）使用：

```yaml
steps:
  - checkout: self
  - task: SbomPilot@0
    displayName: 產生交付產品 SBOM
    inputs:
      environment: javascript
      projectPath: '$(Build.SourcesDirectory)'
      uploadToDt: false
```

其餘欄位使用預設值即可。若專案位於子目錄，將 `projectPath` 改為該專案或 workspace 根目錄，例如 `$(Build.SourcesDirectory)/frontend`。

Classic Build：在 Agent job 選擇 **Add task → SBOM Pilot**，設定「開發環境」與「專案路徑」，保持「推送到 DT」關閉，儲存並執行。欄位與 YAML 相同。

工作成功且 Agent 完成上傳後，在 Build 結果的成品頁選擇 **SBOM**，下載 `bom.json`。Task 日誌的「已排入佇列」表示已要求 Agent 上傳；請以工作結果及成品頁確認完成。Agent 非同步上傳失敗時會回報工作失敗。

## 選擇開發環境

四種模式共用同一個 Task，只需調整 `environment` 與 `projectPath`：

| `environment` | 何時選用 | 專案路徑與依賴準備 |
| --- | --- | --- |
| `javascript` | JavaScript／TypeScript 前端（例如 Angular、Vue），npm、pnpm 或 Yarn | 指向專案或 workspace 根目錄；以對應管理器嚴格安裝 |
| `dotnet` | SDK-style .NET Core | 指向含 csproj／fsproj／vbproj 的目錄，或選擇 .sln／.slnx／專案檔，以檔案所在目錄遞迴還原及掃描 |
| `netframework` | Windows .NET Framework | SDK-style、非 SDK PackageReference、packages.config；依格式使用 SDK 或 Agent 的 MSBuild |
| `combined` | 前後端共同作為一個交付產品 | 指向前後端共同根目錄；先安裝各前端根目錄、再還原 .NET Core，最後一次遞迴掃描產生一份 SBOM |

### JavaScript／TypeScript：npm／pnpm／Yarn

Task 依 `package.json`、workspace 設定與鎖檔工作，不要求 Vue、Angular 或其他框架標記；同樣適用一般 JavaScript／TypeScript 套件專案。舊 YAML `environment: vue` 仍是 `javascript` 的相容別名，並非第五種模式。

npm 使用 `package-lock.json` 或 `npm-shrinkwrap.json`，pnpm 使用 `pnpm-lock.yaml`，Yarn 使用 `yarn.lock`。缺少鎖檔、競爭鎖檔或 manifest 不一致會失敗，不會自動修正。優先採用 `packageManager` 的精確版本及有效的 Yarn 專案執行檔；無宣告時使用固定 fallback。安裝腳本沿用所選管理器政策。

pnpm workspace 指向含 `pnpm-workspace.yaml` 與鎖檔的共同根目錄；Yarn workspace 也指定共同根目錄，保留 `.yarnrc`／`.yarnrc.yml`、PnP／node-modules 設定。

範例：[pnpm workspace](examples/pnpm-workspace/package.json)、[Yarn Classic](examples/yarn-classic-workspace/package.json)、[Yarn PnP](examples/yarn-modern-workspace/package.json)。版本、嚴格安裝及衝突規則見[管理器文件](docs/package-managers.md)與 [Yarn 文件](docs/yarn.md)。

### .NET Core

```yaml
- task: SbomPilot@0
  inputs:
    environment: dotnet
    projectPath: '$(Build.SourcesDirectory)/backend'
```

自 **0.1.1** 起，.NET Core／.NET Framework 的 `projectPath` 也接受 `.sln`、`.slnx`、`.csproj`、`.fsproj`、`.vbproj`。例如 Classic 可直接選擇 `PrimeEagleX.Backend.sln`，YAML 可填 `$(Build.SourcesDirectory)/PrimeEagleX.Backend.sln`。檔案會轉成其所在目錄，沿用遞迴還原與掃描並套用排除規則；掃描範圍包含該目錄下的專案，不依 solution 成員過濾。要縮小範圍，請指定適當子目錄或排除規則。

Task 從實際還原目錄向上讀取 `global.json`，支援註解、完整 `sdk.version`、`rollForward` 與 `allowPrerelease`；沒有版本宣告時使用固定 SDK **10.0.101**。建議提交明確政策：

```json
{ "sdk": { "version": "10.0.101", "rollForward": "disable" } }
```

相容 SDK 已存在時直接驗證使用，缺少時以 Microsoft 官方安裝腳本準備至工具快取。保留分層 NuGet.Config；已有 NuGet lockfile 才開啟 locked mode，沒有選用鎖檔的合法專案仍可執行。所有 ProjectReference 必須產生有效 assets。`global.json sdk.paths` 目前不支援；特殊 workload、自訂 SDK／targets 需具備可評估的 Agent 條件。

### .NET Framework

```yaml
- task: SbomPilot@0
  inputs:
    environment: netframework
    projectPath: '$(Build.SourcesDirectory)'
```

限 Windows。SDK-style 沿用 SDK 政策；非 SDK PackageReference 與 packages.config 使用 Agent 的 Visual Studio MSBuild。Task 不安裝整套 Visual Studio；packages.config 須可由 solution 或 `repositoryPath` 判定套件位置，不要求新增 NuGet lockfile。完整條件與範例見 [.NET Framework 文件](docs/framework.md)。

### .NET Core 前後端合併

```yaml
- task: SbomPilot@0
  inputs:
    environment: combined
    projectPath: '$(Build.SourcesDirectory)/product'
```

共同根目錄可含獨立前端或 workspace，以及 SDK-style .NET Core 後端。不需另填前後端路徑；共用排除規則、單次遞迴掃描、一份 SBOM，啟用 DT 時對應同一個交付產品 UUID。傳統 .NET Framework 使用獨立的 `netframework` 模式。參考[合併範例](examples/combined-product/package.json)及[根目錄規則](docs/combined.md)。

## 常用設定

| 欄位 | 預設 | 說明 |
| --- | --- | --- |
| `environment` | `javascript` | 上述四種模式 |
| `projectPath` | `$(Build.SourcesDirectory)` | 專案／workspace／合併產品共同根目錄；.NET Core／.NET Framework 可選 solution／專案檔，掃描其所在目錄；可含空白，不需在欄位值內加引號 |
| `nodeVersion` | `24.x` | 最新符合 semver 範圍的掃描 Node，須 >=24；與 Agent handler 分別管理 |
| `specVersion` | `1.6` | 以隨附官方 CycloneDX 1.6 Schema 驗證 |
| `excludes` | 下列規則 | 相對根目錄的 glob，以逗號分隔，保留花括號內的逗號 |
| `fetchLicense` | `true` | 補充授權資料，可能額外連線；關閉不刪除鎖檔已有授權，也不保證完全不連線 |
| `noCache` | `true` | 停用 cdxgen metadata 快取；不變更 npm 或 Agent 工具快取 |
| `uploadToDt` | `false` | 上傳到既有 DT 專案；關閉時不讀取或驗證 DT 欄位 |

預設排除規則：

```text
**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**
```

YAML 使用 `excludes: ''` 或在 Classic 清空欄位，可取消自訂排除；cdxgen 內建忽略仍適用。.NET 掃描僅將預設 `**/obj/**` 轉為 `**/obj/!(project.assets.json)`，保留已驗證的間接依賴資料；其他自訂 glob 不改寫。遮蔽必要 assets、或資料超出掃描根目錄時會明確失敗。

布林欄位接受 `true`／`false`（不分大小寫），不接受 `yes`、`0` 或空白。輸出與工具路徑由 Task 管理；有效 SBOM 保留到 Agent 工作清理，供非同步成品上傳讀取。

## 私有來源與進階設定

認證值一律存入 **Secret Pipeline Variables**，欄位只填 `$(variableName)`，不把明文寫進 YAML。公開與私有來源可並存，不需建立新 Service Connection 或額外 Authenticate Task。

| 欄位 | 預設 | 格式與用途 |
| --- | --- | --- |
| `npmCredentials` | 空白 | registry URL 與 token 或 username/password，另可明確映射既有認證變數；[完整格式](docs/npm-auth.md) |
| `nugetCredentials` | 空白 | 每筆 source、url、username、password；驗證整個還原範圍的來源身分；[完整格式](docs/nuget-auth.md) |
| `cdxgenVersion` | `13.6.0` | 精確的 `@cdxgen/cdxgen` 13.x 穩定版；空白用預設，其他 major／預發版會拒絕，實際 Node engines／CLI 亦須相容 |
| `dtApiUrl` | `http://localhost:8081` | DT 開啟時必填，服務根網址可含反向代理路徑；localhost 指 Agent |
| `dtProjectUuid` | 無 | DT 開啟時必填，既有專案 UUID，不自動建立專案 |
| `dtApiKey` | 無 | DT 開啟時必填，以 Secret Variable 傳入 |
| `skipDtTlsCertificateCheck` | `false` | 只略過 DT 目的 HTTPS 憑證驗證，不改變其他工具／Proxy 的 TLS |

工具下載與 DT 連線使用 Agent Proxy／CA，子工具取得相應環境設定。Agent regex bypass 與子工具 `NO_PROXY` 規則不同，Windows NuGet 仍需系統 CA 信任。企業環境驗收步驟見[相容性文件](docs/compatibility.md)。

### 選用 DT 上傳

先在 DT 建立交付產品專案，取得 UUID 與可上傳 BOM 的 Key，並將 Key 存為秘密變數 `dtApiKey`：

```yaml
- task: SbomPilot@0
  inputs:
    environment: javascript
    projectPath: '$(Build.SourcesDirectory)'
    uploadToDt: true
    dtApiUrl: 'https://<dt-service-host>'
    dtProjectUuid: '<existing-project-uuid>'
    dtApiKey: '$(dtApiKey)'
```

Classic 勾選「推送到 DT」後顯示對應欄位。Task 將已驗證 SBOM 原始位元組以 Base64 PUT 到 `/api/v1/bom`；成品保留同一份檔案。**DT 接受上傳即完成此階段，不等待背景匯入或弱點分析。**

請求最多30秒，暫時網路錯誤及 HTTP408／429／500／502／503／504 最多嘗試3次；401／403不重試、不跟隨重新導向。重試可能再次提交已接受但回應遺失的資料。DT 失敗時仍要求 Agent 發佈有效 SBOM，最後 Task 失敗；仍須核對工作結果及成品頁。

## 核對執行命令

每個工具子程序開始前，Task 會以單行 `[command]` JSON 顯示實際 `executable`、完整 `argv` 清單與 `cwd`。JSON 保留空參數、空白、引號、Unicode 與 glob 的參數邊界；控制字元以跳脫表示，`#` 寫成 `\u0023`，避免 Azure Agent 將顯示內容當成日誌控制命令；`JSON.parse` 可還原非秘密原值。執行仍使用原始參數及 `shell: false`，日誌不是可直接貼入 shell 的命令字串。掃描時另列 `FETCH_LICENSE`／`CDXGEN_NO_CACHE`，可核對 `--required-only`、`--spec-version`、`--exclude` 與 `--install-deps false`。

已知 DT、npm、NuGet 及代理帳密、常見編碼、URL userinfo 與認證旗標值會在 Task 輸出前改為 `***`；遮罩來源包含已驗證的 Task 認證設定及相關子程序／代理認證；其餘參數與路徑會顯示。Task 不列印整份環境或原始子程序 stdout／stderr。Agent 的 setsecret 控制命令仍用於提前登錄遮罩。

掃描與 DT 上傳分開：`[http]` 顯示實際 `PUT` 目的 URL 和 `X-Api-Key: ***`，對應原始需求的獨立 REST 上傳，不會假造 cdxgen `--api-key` 命令。原始範例的 `-p true` 是 cdxgen 的 [SBOM tree table 顯示選項](https://github.com/cdxgen/cdxgen/blob/v13.6.0/bin/cdxgen.js#L249-L253)；本 Task 提供有效成品與組件摘要，不轉印該子程序表格。

## 問題排查與結果限制

| 現象 | 先檢查 |
| --- | --- |
| 找不到管理器／lockfile 衝突 | 專案或 workspace 根目錄、唯一鎖檔、精確 packageManager；用相同版本在本機修正並提交，Task 不猜測或改寫 |
| 私有來源失敗 | URL 路徑、Secret Variable 格式／權限、既有設定優先序；[npm](docs/npm-auth.md)／[NuGet](docs/nuget-auth.md)另列來源隔離規則 |
| 工具準備失敗 | 下載來源、Proxy／CA、可寫暫存與快取、Node >=24；不完整快取需依錯誤修復 |
| .NET 還原失敗 | global.json、SDK／TFM、鎖檔、ProjectReference、MSBuild／targeting pack／workloads，以及 NuGet.Config |
| SBOM 驗證失敗 | cdxgen 版本與必要 assets；檔案存在但未通過 Schema 不會發佈 |
| 成品不見 | 確認為 Build 工作，查看 Agent 上傳及工作結果；Classic Release 不支援 |
| DT 401／403／404／TLS 失敗 | Key 權限、UUID、服務根網址、Agent 可達性與 CA；略過 TLS 僅作用於 DT |

為避免洩漏來源認證，Task 不轉印原始子程序輸出。`--required-only` 固定啟用，代表 cdxgen 的 required scope，並非逐項核對實際部署成品；Yarn workspace 可能保留上游標記為 required 的部分開發依賴，詳見 [Yarn 限制](docs/yarn.md)。

[相容矩陣與手動驗收](docs/compatibility.md)區分本機／容器證據及尚未驗證的 Azure、企業網路與 arm64 項目。[開發說明](README-Dev.md)提供建置、測試、架構與發佈準備。

MIT License · Copyright © 2026 Lawrence Shen。第三方授權見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
