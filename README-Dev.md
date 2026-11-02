# 開發與驗證

作者 Lawrence Shen；MIT 授權。維護環境使用 Node >=24（測試機 Node 24.22.1 / npm 11.19.1），Task bundle 目標為 Node 20，由 `Node20_1` handler 執行。掃描用 Node >=24 由 Task 獨立準備，兩者版本不得混為一談。

```powershell
npm ci
npm test
npm run build
npm run test:smoke
npm run test:options-smoke
npm run test:smoke:pnpm
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
| `src/install/contracts.ts` | `DependencyInstaller`；第四個 options 提供暫存目錄與 logger，保留原有三參數注入 |
| `src/install/javascript.ts` | npm／pnpm 預設分派、鎖檔內容檢查；可注入 Yarn adapter |
| `src/install/project.ts` | 宣告／鎖檔／pnpm workspace 辨識與固定 fallback |
| `src/install/manager.ts` | 隔離準備精確版本、封裝雜湊與 Node engine 驗證、JS／原生 bin 啟動、清理 |
| `src/install/npm.ts`、`pnpm.ts` | npm ci／pnpm frozen 安裝；不額外改變專案腳本政策 |
| `src/scan.ts` | CLI 參數與掃描，禁止重複 install |
| `src/validation.ts` | 官方 Schema 驗證後回傳 `ValidatedSbom` |

官方 CycloneDX 1.6 schema 及其依賴直接封裝，不在執行時向外下載 schema。Azure SDK 需要語言資源及平台檔案，建置保留完整 production SDK dependency tree；其餘程式以 esbuild 打包。

`src/config.ts` 的 `readTaskConfig(InputReader)` 共用 Classic/YAML 的 runtime 契約，`src/azure-inputs.ts` 保留 SDK vault 不儲存的明確空字串。`src/tool-options.ts` 集中穩定 cdxgen13.x／Node>=24 政策及實際套件、CLI 版本／必要旗標驗證。只附官方1.6 schema，不把 cdxgen 可產出的其他 spec 宣稱為本 Task 已支援。

2026-11-02 ticket02 選項驗證：`npm test`15/15 通過；涵蓋實際 Azure SDK 空值解析、所有四組授權／快取開關、Node/cdxgen 不相容、官方 schema、真實 npm ci。`npm run test:options-smoke` 以 Node24.22.2/cdxgen13.6.0 在含空白的工具與專案路徑執行，無自訂排除為26組件，`**/_Design{,Front}/**` 排除兩個設計目錄後為23組件，兩份皆通過官方1.6 schema；不相容 Node20／cdxgen12 在下載前被拒絕。授權／快取開關有實際子程序環境值測試，不宣稱單獨開關必定改變每個專案的組件數。未驗證的 liveAzure 仍見下節。

2026-11-02 ticket 03 Windows x64 實測：Node 工具 24.22.2、cdxgen 13.6.0；pnpm 10.34.2 workspace 產生通過官方 Schema 的 24 個 library components，Vue/lodash 存在、chalk 開發依賴排除；shared/web-product 出現在 metadata 的 workspace components，依賴圖有 workspace 與外部依賴邊。manifest 不同步的真實 frozen install 失敗且鎖檔 SHA-256 不變。pnpm 12.16.1 原生入口可安裝並掃描 is-number，支援該版多段 YAML 鎖檔；指定 npm 10.9.2 可獨立於 Node 內建 npm 準備並執行 ci。`test:smoke:pnpm` 可重現上述流程；使用本機成品 adapter，不代表 Azure Agent 發佈或 Linux／arm64 已驗證。

workspace smoke 同時揭露 ajv-formats-draft2019 的 IRI scheme 白名單誤拒合法 `git+https`。handler 對 ASCII IRI-reference 使用 URI-reference 語法驗證，Unicode 則保留原國際格式驗證器；官方 Schema 未修改。回歸測試接受 git+https／Unicode URL，並拒絕 ASCII URL 的空白及無效百分號編碼。

## 來源與已知驗證邊界

- npm registry 實際查證 `@cdxgen/cdxgen@13.6.0` 可取得，engines Node >=24、CLI `bin/cdxgen.js`。原始碼：[固定 tag](https://github.com/cdxgen/cdxgen/tree/v13.6.0)。
- [CycloneDX 1.6 schema](https://github.com/CycloneDX/specification/tree/1.6/schema) 隨套件附 Apache-2.0 授權。
- [Build Artifact logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact) 由 Agent 非同步執行；[Agent StepsRunner](https://github.com/microsoft/azure-pipelines-agent/blob/v3.238.0/src/Agent.Worker/StepsRunner.cs) 等待 async commands 並合併失敗結果，handler 不宣稱同步上傳完成。
- 尚待：實際 VSIX 安裝、Classic/YAML、Server/Services、Linux 與 arm64、真正 Agent 成品失敗傳播、企業 Proxy/CA。manifest 最低 Agent 不代表 Server 配對已驗證。
- 工具下載使用原生 fetch，尚未套用 Azure Agent ProxyUrl/CA 設定。npm 保留 Agent 與 Repo 設定，但本階段未交付 Task 管理私有來源認證。來源認證不得放 CLI arguments，也不得把含秘密的 child stdout/stderr 寫到日誌。
