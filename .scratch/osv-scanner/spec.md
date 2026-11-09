# OSV 弱點掃描與成品報告

Status: ready-for-agent

## 使用者需求

- 參考 `差異/Backend Template - SBOM.yml` 的 OSV Scanner 安裝、掃描及 Build Artifact 發佈流程。
- 調查 Google OSV Scanner 是否可透過 npm install 安裝，以解決目前固定 Windows PowerShell／exe 的限制。
- SBOM Pilot 新增預設勾選的 OSV 掃描功能，將報告推上成品；報告參考 `差異/sbom.osv.md`。
- 本次明確呼叫 grill-with-docs，先調查並確認設計，再實作。

## 已查證的現況

- 開始時分支 main、HEAD 7dd8827；使用者提供的 `差異/` 是既有未追蹤資料，保留原檔。
- 已執行 `node scripts/resume.mjs`，原工單 01–20 均已整合，本次為追加需求。
- 參考 YAML 固定 v2.3.3、Windows amd64 exe，輸出 Markdown `sbom.osv.md`，與 SBOM 一起使用 PublishBuildArtifacts 發佈。
- 參考 YAML 使用 `ignoreLASTEXITCODE: true`；此設定未區分發現弱點與掃描器執行錯誤。
- 現有 Task 已自行準備 Node／cdxgen、產生並驗證一份 SBOM，以 Agent artifact.upload 發佈；成品名稱可設定，預設 SBOM。
- 現有 DT 上傳錯誤會先保留，仍嘗試發佈有效 SBOM，最後回報 Task 失敗。
- 現有支援平台為 Windows／Linux；macOS 不在目前完整 Task 的支援範圍。

## 已確認決策

- Q1：所有模式共用預設啟用的 OSV 掃描；取消勾選時略過 OSV 安裝與掃描。
- Q2：發現弱點只警告並發佈報告；安裝、連線或報告產生失敗則讓 Task 失敗，仍先發佈已驗證的 SBOM。
- Q3：採用 Task Node.js 下載官方執行檔並驗證 SHA-256；使用者要求雲端與地端 CI Agent 都能定期維持最新版本。
- 追加：預設 SBOM 檔名由 `bom.json` 改為 `sbom.cdx.json`，相關文件一併調整；保留自訂檔名能力。
- Q4：同意每次解析官方 latest，並可指定精確版本；追加要求同一 Agent 已安裝過相同版本時重用，避免反覆下載安裝。
- 追加：報告需每列明示風險等級與 CVE 並依風險排序；缺評分／CVE 分別顯示未知／未提供。
- 追加：同一份報告除成品外，附到此次 CI 執行結果的 Markdown Summary，直接查看而不需下載。
- 使用者要求撤回本機提交，已還原 HEAD 7dd8827、保留所有檔案修改；後續不自行 commit、merge、push 或發布。

## 版本與快取方案

- OSV 版本欄位預設 latest，每次執行解析官方最新穩定版；同一次執行固定解析到的版本、驗證 SHA-256 並記錄。可指定精確版本以重現。解析／下載失敗回報錯誤，不默默退回舊版。
- 使用官方 `/releases/latest` 的轉址解析 tag，避免依賴未認證 GitHub REST API 的共用 IP 配額。latest 指上游標記為 Latest 的正式 release，不自行猜測最高 SemVer。
- Agent.ToolsDirectory 保存依版本／OS／架構區分的 OSV 快取；每次重用前驗證 SHA-256 與實際版本。損壞／不完整快取重新取得，完整快取不重複下載。Agent 沒有持久工具目錄時使用此次暫存目錄。
- 雲端臨時 Agent 換機後通常無前次本機快取；同一台地端或持久 Agent 能跨執行重用。不宣稱不同雲端 VM 共用快取。

## 官方調查

- 官方安裝方式列出預編譯執行檔、Homebrew、Scoop、Go 與 Docker，未列出官方 npm 安裝方式：[Installation](https://google.github.io/osv-scanner/installation/)。
- OSV V2 的掃描結束碼區分無弱點（0）、有弱點（1）、一般錯誤（127）與未找到套件（128）；實作需明確處理，不能一律忽略非零結束碼：[Output / Return Codes](https://google.github.io/osv-scanner/output/#return-codes)。
- OSV 的 SBOM 辨識依檔名，實作需確保現有可自訂 sbomFileName 的功能仍能正確指定 CycloneDX 輸入。
- 沿用 Agent 的 Build Artifact 上傳機制：[Microsoft logging commands](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact)。
- 官方提供 Markdown 格式，包含 OSV URL、CVSS、Ecosystem、Package、Version、Fixed Version 與 Source，符合使用者提供的報告範例：[Output](https://google.github.io/osv-scanner/output/)。
- 補充：原始碼另定義 API 錯誤為 129，屬執行失敗；不能只攔截 127／128：[exit code 實作](https://github.com/google/osv-scanner/blob/v2.7.1/cmd/osv-scanner/internal/cmd/run.go)。
- 已核對 v2.7.1 的命令介面；實際版本策略依 Q4，不將此調查版本默認為固定預設。v2.3.3／v2.7.1 均提供 Windows／Linux x64／arm64 發行檔與 CycloneDX 1.6 測試資料：[Release](https://github.com/google/osv-scanner/releases/tag/v2.7.1)、[1.6 fixture](https://github.com/google/osv-scanner/blob/v2.7.1/cmd/osv-scanner/scan/source/testdata/sbom-insecure/alpine-zlib-16.cdx.json)。
- 依追加風險／CVE 需求，命令為 `scan source --format=json --output-file=<jsonPath> --lockfile=:<scanPath>/sbom.cdx.json`，只掃一次，再產自訂 Markdown。明確 parser 對照未提供 CycloneDX，故自訂檔名以獨立暫存複本命名 `sbom.cdx.json` 掃描，保留原 SBOM 檔名與內容。v2.3.3 使用舊 `--output`；不可混用不同版本旗標。
- 風險分級使用官方 JSON `groups.max_severity` 最大 CVSS 分數，CVE 由群組 ids／aliases 及對應弱點 aliases 取得；不另查詢或猜測 CVE，不自行重算 CVSS vector：[官方模型](https://github.com/google/osv-scanner/blob/v2.7.1/pkg/models/results.go)、[分數產生](https://github.com/google/osv-scanner/blob/v2.7.1/internal/grouper/build.go)。
- CI 顯示使用 UTF-8 Markdown `task.uploadsummary`，官方入口為 Extensions 頁籤，實際介面依 Services／Server 版本不同；不宣稱能固定插入使用者截圖 Summary 首頁：[官方 UploadSummary](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#uploadsummary-add-some-markdown-content-to-the-build-summary)。
- 不加 `--allow-no-lockfiles`，避免空掃描轉為成功。

## 驗收範圍

- YAML／Classic 的 OSV 勾選框預設 true，所有開發環境共用；false 時不下載或啟動 OSV。
- 只掃描本次驗證通過的 SBOM；預設與自訂成品名稱、SBOM 檔名均支援。
- 無弱點與有弱點兩種成功掃描都產生可下載的 Markdown 報告；有弱點明確警告，Task 不因此失敗。
- OSV 安裝、連線、無法解析／找不到套件、逾時或報告產生失敗會讓 Task 失敗，但仍嘗試發佈有效 SBOM。
- OSV／DT 的錯誤不能彼此遮蔽，也不能略過有效 SBOM 的成品發佈。
- SBOM 與 `sbom.osv.md` 發佈到相同 Build Artifact；檔案保留供 Agent 非同步上傳。
- 同一份 `sbom.osv.md` 另附至 CI Markdown Summary；成品／摘要失敗互不阻止另一方嘗試，均保留錯誤。
- 驗證 OSV Windows／Linux 平台選擇、SHA-256 下載校驗、結束碼政策、關閉開關、自訂名稱與失敗後成品保留；本機驗證與真實 Azure 發佈證據分開記錄。

## 預計沿用的輸入／輸出

- 輸入使用本次產生且驗證通過的最終 SBOM，避免遞迴掃描暫存資料夾造成範圍漂移。
- Markdown 報告 `sbom.osv.md` 與 SBOM 放在同一個使用者指定的 Build Artifact。
- Task 版本依使用者追加要求升為 0.2.0（原本機候選為 0.1.4）；本輪僅本機實作、測試與封裝，不發布市集或遠端 Git。
- Classic 的 OSV 勾選框與版本欄位放在 DT 勾選框上方，附完整設定說明。
