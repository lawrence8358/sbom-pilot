# 開發與驗證

作者 Lawrence Shen；MIT 授權。維護環境使用 Node >=24（測試機 Node 24.22.1 / npm 11.19.1），Task bundle 目標為 Node 20，由 `Node20_1` handler 執行。掃描用 Node >=24 由 Task 獨立準備，兩者版本不得混為一談。

```powershell
npm ci
npm test
npm run build
npm run test:smoke
npm run package:dev
```

`npm test` 使用 Node 內建 test runner，驗證 schema、階段失敗、npm lockfile、掃描旗標與子程序秘密輸出抑制。`test:smoke` 下載實際 Node/cdxgen、建立公開 Vue/npm 範例、執行 npm ci、產生真實 SBOM 並驗證 Vue 存在、開發套件 chalk 不在 required-only 結果中，lockfile SHA-256 未變。資料位於忽略的 `.smoke/`；只模擬成品 adapter，沒有冒充 Azure Server 端到端發佈。

VSIX 位於 `packages/`；本機打包使用 `local-dev-placeholder` 且 `public:false`。正式打包必須填入實際已確認的身分與公開網址：

```powershell
$env:SBOM_PILOT_PUBLISHER = '<actual-publisher-id>'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://<public-repository-url>'
npm run package:release
```

請勿把範例佔位值用於公開發佈。打包不會推送或發佈 Marketplace。`package.json`、`src/task.json`、`vss-extension.json` 的版本需同步修改；Task major 變更影響 YAML `@0` 使用方式。

## 模組

2026-11-02 本機 Windows x64 驗證：`npm test`、`npm run build`、`npm run package:dev` 通過，開發 VSIX 為 `local-dev-placeholder.sbom-pilot-0.1.0.vsix`。`npm run test:smoke` 透過全新 Node 工具快取下載並校驗 Node 24.22.2，實際安裝及執行 cdxgen 13.6.0，Vue 3.5.13 範例產生通過官方 1.6 schema 的 23 組件 SBOM；Vue 存在、開發專用 chalk 5.3.0 排除、lockfile hash 不變。未設定正式 Publisher／URL 的 release 包裝已驗證會拒絕。VSIX 安裝與 Agent 發佈未在本機模擬成通過。

| 檔案 | 責任／擴充介面 |
| --- | --- |
| `src/index.ts` | Azure input/result 與 Artifact adapter；只保留 SBOM 到 Agent 清理 |
| `src/config.ts` | 參數驗證與排除規則解析 |
| `src/workflow.ts` | `runWorkflow`；`WorkflowServices` 注入工具、install、scan、validate、upload、publish |
| `src/process.ts` | `ProcessRunner(Command)`，無 shell、執行逾時、抑制來源秘密輸出 |
| `src/tools.ts` | `ToolContext`、Node 解析／SHA-256 校驗／快取、隔離 cdxgen 準備 |
| `src/install/npm.ts` | `DependencyInstaller`、嚴格 npm ci；其他管理器/.NET 使用獨立 adapter |
| `src/scan.ts` | CLI 參數與掃描，禁止重複 install |
| `src/validation.ts` | 官方 Schema 驗證後回傳 `ValidatedSbom` |

官方 CycloneDX 1.6 schema 及其依賴直接封裝，不在執行時向外下載 schema。Azure SDK 需要語言資源及平台檔案，建置保留完整 production SDK dependency tree；其餘程式以 esbuild 打包。

## 來源與已知驗證邊界

- npm registry 實際查證 `@cdxgen/cdxgen@13.6.0` 可取得，engines Node >=24、CLI `bin/cdxgen.js`。原始碼：[固定 tag](https://github.com/cdxgen/cdxgen/tree/v13.6.0)。
- [CycloneDX 1.6 schema](https://github.com/CycloneDX/specification/tree/1.6/schema) 隨套件附 Apache-2.0 授權。
- [Build Artifact logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 由 Agent 非同步執行；[Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 等待 async commands 並合併失敗結果，handler 不宣稱同步上傳完成。
- 尚待：實際 VSIX 安裝、Classic/YAML、Server/Services、Linux 與 arm64、真正 Agent 成品失敗傳播、企業 Proxy/CA。manifest 最低 Agent 不代表 Server 配對已驗證。
- 工具下載使用原生 fetch，尚未套用 Azure Agent ProxyUrl/CA 設定。npm 保留 Agent 與 Repo 設定，但本階段未交付 Task 管理私有來源認證。來源認證不得放 CLI arguments，也不得把含秘密的 child stdout/stderr 寫到日誌。

## 現代 .NET：開發與驗證

`src/dotnet/projects.ts` 辨識 SDK-style 專案並保留排除規則；`sdk.ts` 讀取 JSONC `global.json`、驗證 host 選擇及使用官方腳本準備缺少的 SDK；`restore.ts` 透過 NuGet `GenerateRestoreGraphFile` 評估匯入屬性中的 outputPath/nuGetLockFilePath，執行 restore 並驗證 lockfile/依賴資料。`src/install/dotnet.ts` 是 workflow adapter。

供後續傳統專案、合併產品及 NuGet 認證使用的介面：

- `prepareDotnetSdk(cwd, run, { cacheDirectory, tempDirectory, env, log? })` 回傳 `{ executable, version, env, policy }`，不修改父程序環境。
- `inspectRestoreGraph(projectPath, sdk, run, tempDirectory)`／`restoreDotnetProject(...)` 回傳 `RestoreProject[]`，含 `projectPath`、`assetsPath`、`lockPath`、`hasLock`；所有 child 認證可經 `sdk.env` 注入，不需替換 Repo 的 NuGet.Config。
- `dotnetInstaller.install(root, tools, run, { tempDirectory?, log?, excludes? })` 接入共用流程，將 SDK 子程序環境與 `dotnetAssets` 放入該次 workflow 的 ToolContext。自訂 installer 若包裝它，需保留這兩項資訊。
- `scanExcludes` 只將既定 obj 預設規則轉換為可讀取 assets 的規則；`generateSbom` 會拒絕其他排除造成的資料缺口。合併模式仍應使用一次 cdxgen 掃描，無需合併多份 BOM。

```powershell
npm test
npm run test:dotnet
npm run test:smoke:dotnet
# 選用：下載完整 SDK 到 Task 自有快取，會增加網路與磁碟用量
$env:SBOM_PILOT_TEST_SDK_DOWNLOAD = '1'
npm run test:smoke:dotnet
```

本分支新增九項 .NET 測試。`test:dotnet` 需要先由 `npm test` 編譯；整合分支的一般測試發現流程由工單 03 維護。`.smoke/dotnet/evidence.json` 記錄本機版本、組件數及 SBOM SHA-256，不提交掃描產物或完整日誌。

2026-11-02 Windows x64 真實公開 NuGet 驗證：SDK 6.0.428（含註解的 global.json／disable，無 NuGet lockfile）、9.0.316（宣告 9.0.300/latestFeature，由 Directory.Build.props 匯入自訂 custom-obj 與 locks/product.lock.json）及 10.0.101（無宣告，固定 fallback）皆完成還原與一次 cdxgen 掃描。前兩者各 8 組件，SDK10 為 6 組件；均包含直接 Microsoft.Extensions.Logging 與間接 Microsoft.Extensions.Logging.Abstractions 及依賴關係，通過附帶官方 CycloneDX 1.6 Schema。SDK9 鎖檔 hash 不變，改動套件版本後 locked mode 失敗且不發佈。Node 24.22.2、cdxgen 13.6.0；此測試關閉授權補充以隔離 NuGet 還原行為。

最初實測確認原封不動的 obj 排除會使 cdxgen 只讀 csproj 而遺漏間接套件，因此加入上述 metadata 例外與回歸測試。對照上游固定版 [managedBom](https://github.com/cdxgen/cdxgen/blob/v13.6.0/lib/cli/managedBom.js) 及 [檔案列舉](https://github.com/cdxgen/cdxgen/blob/v13.6.0/lib/core/fs.js)。SDK 規則與鎖檔行為參考 [global.json](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json)、[官方安裝腳本](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-install-script)、[NuGet lockfiles](https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files#locking-dependencies)。

Windows x64 亦以缺少可用 host 的子程序環境實測：從 https://dot.net/v1/dotnet-install.ps1 取得 Microsoft 官方腳本，下載 SDK 10.0.101 至 Task 自有快取，驗證 `.complete` 與 `dotnet --version`，再以該 SDK 完成真實 restore／SBOM。這項測試不安裝全域工具，也不修改機器 PATH。

尚未驗證：Linux .NET 執行、arm64、真正 Azure DevOps VSIX 安裝及 Artifact 發佈、企業 Proxy／自訂 CA、特殊 workloads／自訂 SDK 與私有 NuGet。
