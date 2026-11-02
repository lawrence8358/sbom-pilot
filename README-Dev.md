# 開發與驗證

作者 Lawrence Shen；MIT 授權。維護環境使用 Node >=24（測試機 Node 24.22.1 / npm 11.19.1），Task bundle 目標為 Node20，同一入口提供 `Node20_1` 與 `Node24` handler。掃描用 Node >=24 由 Task 獨立準備，兩者版本不得混為一談。

```powershell
npm ci
npm test
npm run build
npm run test:smoke
npm run test:options-smoke
npm run test:smoke:pnpm
npm run test:smoke:yarn
npm run package:dev
npm run test:package
```

`npm test` 使用 Node 內建 test runner，驗證 schema、階段失敗、npm lockfile、掃描旗標與子程序秘密輸出抑制。`test:smoke` 下載實際 Node/cdxgen、建立公開 Vue/npm 範例、執行 npm ci、產生真實 SBOM 並驗證 Vue 存在、開發套件 chalk 不在 required-only 結果中，lockfile SHA-256 未變。資料位於忽略的 `.smoke/`；只模擬成品 adapter，沒有冒充 Azure Server 端到端發佈。

VSIX 位於 `packages/`；本機打包使用 `local-dev-placeholder` 且 `public:false`。正式打包必須填入實際已確認的身分與公開網址：

```powershell
$env:SBOM_PILOT_PUBLISHER = '<actual-publisher-id>'
$env:SBOM_PILOT_REPOSITORY_URL = 'https://<public-repository-url>'
npm run package:release
```

請勿把範例佔位值用於公開發佈。打包不會推送或發佈 Marketplace。`package.json`、`src/task.json`、`vss-extension.json` 的版本需同步修改；Task major 變更影響 YAML `@0` 使用方式。

`test:package` 直接檢查已產生的 dist 與實際 VSIX，複製／解壓到 Repo 之外，驗證入口啟動、秘密遮罩、manifest、runtime 授權清單及告示路徑；兩者 handler 位元組必須一致。可指定多個執行檔：`node scripts/verify-package.mjs --node <absolute-node20-path> --node <absolute-node24-path>`。Windows 開發驗證可先執行 `npm test`、`node scripts/acquire-handler.mjs 20`，下載有官方 SHA-256 校驗的 Node20；這不會替真實 Agent 安裝 handler。

建置從 esbuild metafile 與實際 SDK dependency tree 產生 `dist/licenses/manifest.json`，涵蓋 YAML、jsonc-parser、國際格式驗證、Proxy agent 及所有 runtime 依賴。上游缺少完整告示時保留原始 metadata 並標記 `upstreamNoticeMissing`；正式打包會拒絕未解決項目。詳見 [第三方資源](THIRD-PARTY-NOTICES.md)。

ticket11 最終本機驗證：Windows Node24完整67/67測試；Windows實際 dist／VSIX 在 Node20.20.2、24.22.1 啟動與告示檢查通過。Linux bookworm Node24.22.2 的 fresh npm ci、67/67測試、建置、打包與套件檢查通過；Node20.20.2 另通過16項HTTP／DT／網路／UTF-8子程序測試與實際套件檢查。runtime清單共106筆（含巢狀版本），18筆為bundle；只剩nodejs-file-downloader4.13.0的原始ISC完整告示未取得。`npm audit --omit=dev`記錄3個moderate條目，均來自task-lib/tool-lib的minimatch上游相依，無相容修正版；沒有high/critical，未強制覆寫至會破壞SDK API的major。

## 模組

2026-11-02 本機 Windows x64 驗證：`npm test`、`npm run build`、`npm run package:dev` 通過，開發 VSIX 為 `local-dev-placeholder.sbom-pilot-0.1.0.vsix`。`npm run test:smoke` 透過全新 Node 工具快取下載並校驗 Node 24.22.2，實際安裝及執行 cdxgen 13.6.0，Vue 3.5.13 範例產生通過官方 1.6 schema 的 23 組件 SBOM；Vue 存在、開發專用 chalk 5.3.0 排除、lockfile hash 不變。未設定正式 Publisher／URL 的 release 包裝已驗證會拒絕。VSIX 安裝與 Agent 發佈未在本機模擬成通過。

| 檔案 | 責任／擴充介面 |
| --- | --- |
| `src/index.ts` | Azure input/result 與 Artifact adapter；只保留 SBOM 到 Agent 清理 |
| `src/config.ts` | 參數驗證與排除規則解析 |
| `src/workflow.ts` | `runWorkflow`；`WorkflowServices` 注入工具、install、scan、validate、upload、publish |
| `src/process.ts` | `ProcessRunner(Command)`，無 shell、執行逾時、抑制來源秘密輸出 |
| `src/tools.ts` | `ToolContext`、Node 解析／SHA-256 校驗／快取、隔離 cdxgen 準備 |
| `src/install/contracts.ts` | `DependencyInstaller`；第四個 options 提供暫存目錄與 logger，保留原有三參數注入 |
| `src/install/javascript.ts` | npm／pnpm／Yarn 預設分派、鎖檔內容檢查與可注入 adapter |
| `src/install/project.ts` | 宣告／鎖檔／pnpm workspace 辨識與固定 fallback |
| `src/install/manager.ts` | 隔離準備精確版本、封裝雜湊與 Node engine 驗證、JS／原生 bin 啟動、清理 |
| `src/install/npm.ts`、`pnpm.ts` | npm ci／pnpm frozen 安裝；不額外改變專案腳本政策 |
| `src/install/yarn-project.ts`、`yarn.ts` | Yarn 世代／專案入口／fallback 辨識，Classic frozen+integrity 與現代 immutable |
| `src/scan.ts` | CLI 參數與掃描，禁止重複 install |
| `src/validation.ts` | 官方 Schema 驗證後回傳 `ValidatedSbom` |
| `src/dt/config.ts` | 僅啟用時驗證 URL／UUID／Key／TLS 選項 |
| `src/dt/transport.ts` | 可注入 `DtTransport`；原生 HTTP(S)、總請求逾時、回應大小界限、無 redirect |
| `src/dt/upload.ts` | 同一 SBOM 位元組的 JSON PUT、有限重試、接受 token 邊界 |
| `src/azure-secret-inputs.ts` | SDK 初始化前僅於記憶體擷取 Key；Adapter 先遮罩，不用 getInput 讀取秘密 |

官方 CycloneDX 1.6 schema 及其依賴直接封裝，不在執行時向外下載 schema。Azure SDK 需要語言資源及平台檔案，建置保留完整 production SDK dependency tree；其餘程式以 esbuild 打包。

`src/config.ts` 的 `readTaskConfig(InputReader)` 共用 Classic/YAML 的 runtime 契約，`src/azure-inputs.ts` 保留 SDK vault 不儲存的明確空字串。`src/tool-options.ts` 集中穩定 cdxgen13.x／Node>=24 政策及實際套件、CLI 版本／必要旗標驗證。只附官方1.6 schema，不把 cdxgen 可產出的其他 spec 宣稱為本 Task 已支援。

2026-11-02 ticket02 選項驗證：`npm test`15/15 通過；涵蓋實際 Azure SDK 空值解析、所有四組授權／快取開關、Node/cdxgen 不相容、官方 schema、真實 npm ci。`npm run test:options-smoke` 以 Node24.22.2/cdxgen13.6.0 在含空白的工具與專案路徑執行，無自訂排除為26組件，`**/_Design{,Front}/**` 排除兩個設計目錄後為23組件，兩份皆通過官方1.6 schema；不相容 Node20／cdxgen12 在下載前被拒絕。授權／快取開關有實際子程序環境值測試，不宣稱單獨開關必定改變每個專案的組件數。未驗證的 liveAzure 仍見下節。

2026-11-02 ticket 03 Windows x64 實測：Node 工具 24.22.2、cdxgen 13.6.0；pnpm 10.34.2 workspace 產生通過官方 Schema 的 24 個 library components，Vue/lodash 存在、chalk 開發依賴排除；shared/web-product 出現在 metadata 的 workspace components，依賴圖有 workspace 與外部依賴邊。manifest 不同步的真實 frozen install 失敗且鎖檔 SHA-256 不變。pnpm 12.16.1 原生入口可安裝並掃描 is-number，支援該版多段 YAML 鎖檔；指定 npm 10.9.2 可獨立於 Node 內建 npm 準備並執行 ci。`test:smoke:pnpm` 可重現上述流程；使用本機成品 adapter，不代表 Azure Agent 發佈或 Linux／arm64 已驗證。

workspace smoke 同時揭露 ajv-formats-draft2019 的 IRI scheme 白名單誤拒合法 `git+https`。handler 對 ASCII IRI-reference 使用 URI-reference 語法驗證，Unicode 則保留原國際格式驗證器；官方 Schema 未修改。回歸測試接受 git+https／Unicode URL，並拒絕 ASCII URL 的空白及無效百分號編碼。

2026-11-02 ticket 04：`npm test` 35/35 通過。`npm run test:smoke:yarn` 實測 Classic 1.22.22 node_modules、Yarn 4.18.1 PnP／node-modules，皆以 Node 24.22.2／cdxgen 13.6.0 產生官方 1.6 Schema 有效的 6 組件 SBOM；workspace 與間接依賴圖、實際模組載入、專案腳本、鎖檔／設定不變、錯誤 manifest 失敗均驗證。Corepack Classic SHA-1 封裝、現代 SHA-224 CLI 及本機 yarnPath 亦有真實驗證。上游 required scope 會保留 workspace 開發專用 chalk，此限制詳見 [Yarn 說明](docs/yarn.md)，沒有另做排除或宣稱開發依賴全面消失。

`test:smoke:yarn -- --refresh-fixtures` 是維護者明確更新範例鎖檔的模式，在 `.smoke/` 隔離撰寫後將 lockfile 複製回範例；正常 smoke 與 Task 都只使用提交的鎖檔，不更新它們。新增依賴／設定後請檢查並提交範例鎖檔；不要把大型快取或專案安裝結果加入版本庫。

## 來源與已知驗證邊界

- npm registry 實際查證 `@cdxgen/cdxgen@13.6.0` 可取得，engines Node >=24、CLI `bin/cdxgen.js`。原始碼：[固定 tag](https://github.com/cdxgen/cdxgen/tree/v13.6.0)。
- DT JSON PUT 契約：[官方 CI/CD 文件](https://docs.dependencytrack.org/usage/cicd/)、[4.13.6 BomResource](https://github.com/DependencyTrack/dependency-track/blob/4.13.6/src/main/java/org/dependencytrack/resources/v1/BomResource.java)。只接受既有 UUID，回傳接受 token 即結束，不查詢 token 或分析狀態。原生傳輸最多三次、每次30秒，Proxy/CA 可注入 `DtTransport` 延伸。
- ticket08 本機驗證：真實 loopback HTTP／HTTPS server 涵蓋接受上傳、401不重試、503／429有限重試、總請求逾時、不跟隨redirect、無效接受token／過大回應、憑證預設拒絕／單次略過；workflow DT失敗仍交付同一檔案給artifactadapter；實際 esbuild bundle 在 `SYSTEM_DEBUG=true` 下驗證秘密先註冊遮罩且沒有 SDK `dtApiKey=` debug輸出。這些是本機協定與adapter證據，不代表真實DT匯入或Azure成品已驗證。
- [CycloneDX 1.6 schema](https://github.com/CycloneDX/specification/tree/1.6/schema) 隨套件附 Apache-2.0 授權。
- [Build Artifact logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 由 Agent 非同步執行；[Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 等待 async commands 並合併失敗結果，handler 不宣稱同步上傳完成。
- 尚待：實際 VSIX 安裝、Classic/YAML、Server/Services、arm64、真正 Agent 成品失敗傳播與企業 Proxy/CA 完整流程。Windows/Linux 本機 runtime／協定／封裝驗證已完成；manifest 最低 Agent 不代表 Server 配對已驗證。完整矩陣與手動步驟見 [相容性](docs/compatibility.md)。
- 工具下載與 DT 共用 `src/network/http.ts`，套用 Agent Proxy/CA/client certificate、總請求逾時及回應大小界限；DT 不跟隨 redirect，下載最多五次且禁止 HTTPS 降級。子工具保留 Repo 來源設定並接收 Proxy／CA 環境，但尚未交付 Task 管理私有來源認證。來源認證不得放 CLI arguments，也不得把含秘密的 child stdout/stderr 寫到日誌。

## .NET Core：開發與驗證

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

## .NET Framework：開發與驗證

使用說明與格式矩陣見 [Framework 文件](docs/framework.md)。本版支援底線為 Visual Studio MSBuild >=17.8；其原因是使用公開的 structured property evaluation，而非聲稱 MSBuild 從該版才支援 packages.config。

`src/dotnet/msbuild.ts` 尋找及驗證 Agent 的 MSBuild、評估專案所需 targets 與 reference assemblies。`src/dotnet/framework.ts` 透過相同 NuGet restore graph 判斷 PackageReference／PackagesConfig，讀取實際 outputPath、lockfile、config 路徑，並使用已安裝的 NuGet.Configuration／NuGet.Versioning 解析有效 repositoryPath 與套件檔名。暫存 PowerShell helper 明確使用 UTF-8，不把完整還原圖或含秘密的工具輸出送到日誌。

```powershell
npm test
npm run test:smoke:framework
npm run build
npm run package:dev
```

新增七項 Framework 測試；與已整合的 .NET Core、Yarn、DT 測試合計 61 項通過。真實 smoke 不編造 Azure 發佈證據，只以本機 artifact adapter 接收經嚴格 1.6 Schema 驗證的檔案。

2026-11-02 Windows x64 實測：Visual Studio 2022 Enterprise MSBuild 17.14.51（原始工具版本 17.14.51.32402）、SDK-style net48 使用 SDK 10.0.101、Node 24.22.2、cdxgen 13.6.0。SDK-style net48、非 SDK-style PackageReference、packages.config 每個流程皆產生 14 個組件，保有 Microsoft.Extensions.Logging → Microsoft.Extensions.Logging.Abstractions 的明確依賴邊。驗證 NuGet.Config、csproj、packages.config、既有 lockfile 的 SHA-256 不變；非 SDK 專案 stale lock 失敗且不發佈。packages.config 使用 Unicode 專案目錄與相對 repositoryPath；另以真實 MSBuild 確認只有明確 repositoryPath、沒有 solution 的還原亦可執行。缺少 MSBuild 與缺少 Import workload targets 都在發佈前失敗。

可重用的私有來源接點：`restoreFrameworkProject(projectPath, root, MSBuildTool, run, tempDirectory)` 接收 `MSBuildTool.env`，回傳 `{ assets: RestoreProject[], packageFiles: string[] }`。`frameworkInstaller.install(root, tools, run, options)` 保留 child-only 認證環境，並將驗證後的 `dotnetAssets`／`dotnetPackageFiles` 傳給共用掃描器。認證功能應注入該環境，不用 RestoreConfigFile 取代 Repo 設定。套件／設定／lockfile 的檔案檢查不能因包裝 installer 而繞過。

本機精簡證據位於忽略的 `.smoke/framework/evidence.json`，包含各格式版本、組件數與 SBOM hash。此驗證不等於所有 Visual Studio workloads 已支援；Linux Framework 為不適用，arm64 與實際 Services／Server 安裝、Classic UI、成品下載仍待外部驗證。

Microsoft 來源：[NuGet/MSBuild restore](https://learn.microsoft.com/en-us/nuget/reference/msbuild-targets#restoring-packagereference-and-packagesconfig-projects-with-msbuild)、[repositoryPath](https://learn.microsoft.com/en-us/nuget/reference/nuget-config-file#config-section)、[vswhere 尋找 MSBuild](https://github.com/microsoft/vswhere/wiki/Find-MSBuild)。
