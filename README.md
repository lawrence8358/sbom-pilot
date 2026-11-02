# SBOM Pilot

在 Azure Pipelines 加入一個 **SBOM Pilot — Generate & Upload SBOM** Task，即可準備 Node.js 與 cdxgen、依 npm／pnpm lockfile 安裝依賴，產生 CycloneDX 1.6 JSON，並要求 Agent 發佈名稱為 `SBOM` 的 Build Artifact。

本階段提供 Vue/npm、pnpm 單專案／workspace 與公開 npm 來源。DT 上傳、Yarn、.NET、私有來源認證及合併交付產品將於後續版本交付。`--required-only` 固定啟用，代表 cdxgen 的 required scope 篩選，不能視為已逐項核對實際部署成品。

## 前置條件及支援範圍

| 項目 | 本階段範圍 |
| --- | --- |
| Pipeline | Classic Build、YAML Build；不支援 Classic Release |
| Agent OS | Windows / Linux x64、arm64 為設計目標；目前實測紀錄見開發文件 |
| Task handler | Agent 需具備 `Node20_1`；manifest 最低 Agent `3.232.1` 是 handler 門檻，不代表所有 Server 與該 Agent 配對已驗證 |
| 掃描工具 | 自動準備最新符合 `24.x` 的 Node；獨立安裝固定 `@cdxgen/cdxgen@13.6.0`，不使用全域 cdxgen |
| npm／pnpm | 優先使用 `packageManager` 精確版本；不同於內建 npm 的版本由 Task 隔離準備；無宣告使用固定 fallback，詳見[管理器說明](docs/package-managers.md) |
| 網路 | Agent 可存取 nodejs.org、npm registry 與專案依賴／授權資訊來源；首次執行需要下載 |
| Server / Services | 使用兩者皆提供的 Build Artifact logging command；尚待真實 Server / Services 安裝與端到端驗證，未宣稱特定最低 Server 支援 |

專案需提交 manifest 與且僅一種管理器的 lockfile：npm 使用 `package-lock.json` 或 `npm-shrinkwrap.json`，pnpm 使用 `pnpm-lock.yaml`。Task 執行 `npm ci` 或 `pnpm install --frozen-lockfile`；缺少或不同步的 lockfile 會失敗，不會自動產生或修正。Repo 的來源設定與所選管理器版本的安裝腳本規則仍生效；本階段不提供秘密認證欄位。原生套件所需編譯工具仍需 Agent 提供。

pnpm workspace 請指定包含 `pnpm-workspace.yaml` 與鎖檔的共同根目錄。可直接使用[可執行範例](examples/pnpm-workspace/package.json)，YAML 將 `projectPath` 設為 `$(Build.SourcesDirectory)/examples/pnpm-workspace`；不需額外 Corepack、pnpm 或 install Task。版本與衝突診斷見[管理器說明](docs/package-managers.md)。

原生下載目前使用 Node HTTPS fetch；尚未驗證 Agent Proxy／自訂 CA，企業網路環境請先驗證可達性，詳細限制見 [開發說明](README-Dev.md)。

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

在 Classic Build 編輯器選擇 Agent job → Add task，搜尋 **SBOM Pilot**，設定「開發環境」為 Vue（npm／pnpm），專案路徑為包含 lockfile 的專案或 workspace 根目錄，保持「推送到 DT」關閉後儲存並執行。不需另加 NodeTool、npm、pnpm 或 cdxgen Task。

工作成功且 Agent 完成上傳後，在 Build 結果的成品頁選擇 `SBOM`，下載 `bom.json`。上傳由 Agent 非同步執行；Task 日誌的「已排入佇列」不代表伺服器已完成接收，上傳失敗會由 Agent 回報工作失敗。

## 參數

| 欄位（YAML） | 預設 | 說明 |
| --- | --- | --- |
| `environment` | `vue` | Vue/npm 或 pnpm；依宣告與 lockfile 辨識 |
| `projectPath` | `$(Build.SourcesDirectory)` | 專案根目錄 |
| `nodeVersion` | `24.x` | 最新符合 semver 範圍的 Node，必須 >=24 |
| `excludes` | 見下列規則 | 相對根目錄 glob，逗號分隔，保留花括號內逗號 |
| `specVersion` | `1.6` | 固定以附帶的官方 1.6 JSON Schema 驗證 |
| `uploadToDt` | `false` | 此階段設定 true 會清楚失敗；關閉不需要 DT 設定 |
| `cdxgenVersion` | `13.6.0` | 進階精確版本覆寫；非預設版本需另行驗證相容性 |
| `fetchLicense` | `true` | `FETCH_LICENSE`；可能需要額外網路存取 |
| `noCache` | `true` | `CDXGEN_NO_CACHE`；不影響 npm 或 Node 工具快取 |

共通排除規則：

```text
**/_Design{,Front}/**,**/bin/**,**/obj/**,**/node_modules/**,**/dist/**
```

輸出與工具路徑由 Task 管理。有效 SBOM 保留在 Agent 暫存空間直到工作清理，避免與非同步成品上傳競爭；不會將掃描工具目錄發佈為成品。

## 疑難排解

- **缺少 lockfile／npm ci 失敗**：在本機使用相同 npm 版本修正 manifest 與 lockfile 後提交。確認 registry 可達及安裝腳本可在 Agent 執行。為避免洩漏來源 token，Task 不轉印原始子程序輸出。
- **工具準備失敗**：確認 nodejs.org 與 npm registry 可達、Agent 的暫存／工具快取可寫、Node 範圍 >=24。Linux 需有 tar；Windows 解壓使用 PowerShell。
- **SBOM 驗證失敗**：檢查 cdxgen 版本覆寫；檔案即使存在，未通過 CycloneDX Schema 也不會發佈。
- **成品不見／發佈失敗**：確認使用 Build 工作、查看 Agent 上傳階段錯誤及工作結果；Classic Release 不支援此成品命令。
- **管理器／鎖檔矛盾**：清除其他管理器的競爭鎖檔，並確認 `packageManager` 宣告的是精確版本。Task 不會自行猜測或改用其他工具；指定版本須能在所選 Node 執行。

MIT License · Copyright © 2026 Lawrence Shen。第三方授權見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
