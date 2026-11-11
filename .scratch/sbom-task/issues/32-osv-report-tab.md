# 32: 「OSV 弱點報告」頁籤最小版

Type: task
Status: ready-for-agent
Blocked by: 31

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 16–18、20–21、23–28、31–33、35、39。

## 要建立的行為

建置結果頁新增名為「OSV 弱點報告」的頁籤，只在執行過 SBOM Pilot 的建置出現。頁籤讀取 Task 上傳的結構化隱藏附件，顯示判定行（是否超過門檻、門檻名稱、報告產生時間 UTC+8、OSV Scanner 版本）以及「一、產品 SBOM 弱點」「二、開發套件額外弱點」兩個區塊的 8 欄表格，表格有框線與內距並跟隨 Azure DevOps 主題。Extensions 頁籤不再出現 OSV 報告。日誌與 Task 結果訊息印出直達此頁籤的連結。版面依預覽 https://claude.ai/artifact/9CVRQ5fCGwx7teFMnwA3Lv。

## 驗收

- [ ] Task 移除 `tl.uploadSummary`，改以自訂類型的建置附件上傳結構化 JSON（含 `schemaVersion`、判定、門檻、報告產生時間、OSV Scanner 版本、兩份 SBOM 檔名、產品弱點、開發套件額外弱點、OSV 執行狀態）；附件不出現在成品清單；上傳失敗加入錯誤清單。
- [ ] 擴充套件新增建置結果頁籤元件（`supportsTasks` 為 SBOM Pilot Task ID）與 `vso.build` scope，使用 azure-devops-extension-sdk／api 讀取本建置附件，不使用 React。
- [ ] 明細 8 欄：等級、CVSS、套件（名稱與生態系兩行）、目前版本、建議升級、弱點編號（CVE 與 GHSA／OSV ID 同欄各自連結）、發佈日期、最後修改；無 CVE 時顯示「（無 CVE，僅 GHSA）」。
- [ ] 表格框線、內距、整列 hover；顏色使用 Azure DevOps 主題變數，深色／淺色皆清楚。
- [ ] 外部字串以文字節點或跳脫輸出；連結只允許 `https://osv.dev/`、`https://www.cve.org/`；惡意套件名稱不被當成 HTML。
- [ ] 中文、emoji 與符號無亂碼。
- [ ] 日誌與 Task 結果訊息印出 `…/_build/results?buildId=…&view=<publisher>.<extension>.<tab contribution id>`，Team Project 名稱 URL 編碼。
- [ ] DOM 測試（例如 jsdom）以 JSON fixture 驗證兩個區塊、無 CVE 標示與跳脫；workflow 測試驗證附件上傳一次且不再呼叫 uploadSummary；封裝測試驗證 tab 元件與 scopes。

## Comments
