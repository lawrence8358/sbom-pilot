# 開發與驗證

作者 Lawrence Shen；MIT 授權。維護環境使用 Node >=24（測試機 Node 24.22.1 / npm 11.19.1），Task bundle 目標為 Node 20，由 `Node20_1` handler 執行。掃描用 Node >=24 由 Task 獨立準備，兩者版本不得混為一談。

```powershell
npm ci
npm test
npm run build
npm run test:smoke
npm run test:options-smoke
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
| `src/dt/config.ts` | 僅啟用時驗證 URL／UUID／Key／TLS 選項 |
| `src/dt/transport.ts` | 可注入 `DtTransport`；原生 HTTP(S)、總請求逾時、回應大小界限、無 redirect |
| `src/dt/upload.ts` | 同一 SBOM 位元組的 JSON PUT、有限重試、接受 token 邊界 |
| `src/azure-secret-inputs.ts` | SDK 初始化前僅於記憶體擷取 Key；Adapter 先遮罩，不用 getInput 讀取秘密 |

官方 CycloneDX 1.6 schema 及其依賴直接封裝，不在執行時向外下載 schema。Azure SDK 需要語言資源及平台檔案，建置保留完整 production SDK dependency tree；其餘程式以 esbuild 打包。

`src/config.ts` 的 `readTaskConfig(InputReader)` 共用 Classic/YAML 的 runtime 契約，`src/azure-inputs.ts` 保留 SDK vault 不儲存的明確空字串。`src/tool-options.ts` 集中穩定 cdxgen13.x／Node>=24 政策及實際套件、CLI 版本／必要旗標驗證。只附官方1.6 schema，不把 cdxgen 可產出的其他 spec 宣稱為本 Task 已支援。

2026-11-02 ticket02 選項驗證：`npm test`15/15 通過；涵蓋實際 Azure SDK 空值解析、所有四組授權／快取開關、Node/cdxgen 不相容、官方 schema、真實 npm ci。`npm run test:options-smoke` 以 Node24.22.2/cdxgen13.6.0 在含空白的工具與專案路徑執行，無自訂排除為26組件，`**/_Design{,Front}/**` 排除兩個設計目錄後為23組件，兩份皆通過官方1.6 schema；不相容 Node20／cdxgen12 在下載前被拒絕。授權／快取開關有實際子程序環境值測試，不宣稱單獨開關必定改變每個專案的組件數。未驗證的 liveAzure 仍見下節。

## 來源與已知驗證邊界

- npm registry 實際查證 `@cdxgen/cdxgen@13.6.0` 可取得，engines Node >=24、CLI `bin/cdxgen.js`。原始碼：[固定 tag](https://github.com/cdxgen/cdxgen/tree/v13.6.0)。
- DT JSON PUT 契約：[官方 CI/CD 文件](https://docs.dependencytrack.org/usage/cicd/)、[4.13.6 BomResource](https://github.com/DependencyTrack/dependency-track/blob/4.13.6/src/main/java/org/dependencytrack/resources/v1/BomResource.java)。只接受既有 UUID，回傳接受 token 即結束，不查詢 token 或分析狀態。原生傳輸最多三次、每次30秒，Proxy/CA 可注入 `DtTransport` 延伸。
- ticket08 本機驗證：真實 loopback HTTP／HTTPS server 涵蓋接受上傳、401不重試、503／429有限重試、總請求逾時、不跟隨redirect、無效接受token／過大回應、憑證預設拒絕／單次略過；workflow DT失敗仍交付同一檔案給artifactadapter；實際 esbuild bundle 在 `SYSTEM_DEBUG=true` 下驗證秘密先註冊遮罩且沒有 SDK `dtApiKey=` debug輸出。這些是本機協定與adapter證據，不代表真實DT匯入或Azure成品已驗證。
- [CycloneDX 1.6 schema](https://github.com/CycloneDX/specification/tree/1.6/schema) 隨套件附 Apache-2.0 授權。
- [Build Artifact logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 由 Agent 非同步執行；[Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 等待 async commands 並合併失敗結果，handler 不宣稱同步上傳完成。
- 尚待：實際 VSIX 安裝、Classic/YAML、Server/Services、Linux 與 arm64、真正 Agent 成品失敗傳播、企業 Proxy/CA。manifest 最低 Agent 不代表 Server 配對已驗證。
- 工具下載使用原生 fetch，尚未套用 Azure Agent ProxyUrl/CA 設定。npm 保留 Agent 與 Repo 設定，但本階段未交付 Task 管理私有來源認證。來源認證不得放 CLI arguments，也不得把含秘密的 child stdout/stderr 寫到日誌。
