# 32: Task 上傳頁籤資料並移除 Extensions 摘要

Type: task
Status: ready-for-agent
Blocked by: 31, 35

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 18、32、35 的 Task 端。

## 要建立的行為

Task 依工單 35 定義的資料契約產生 `OsvTabReport`，以自訂類型 `sbom-pilot.osv-report` 的建置附件上傳，讓「OSV 弱點報告」頁籤顯示本次結果；Extensions 頁籤不再出現 OSV 報告。日誌與 Task 結果訊息印出直達此頁籤的連結。

## 驗收

- [ ] Task 移除 `tl.uploadSummary`，改以 `tl.addAttachment` 上傳契約 JSON；附件不出現在成品清單；上傳失敗加入錯誤清單。
- [ ] JSON 內容與 31 的結果一致：判定、門檻、是否略過 DT、報告產生時間、OSV Scanner 版本、兩份 SBOM 檔名、產品弱點、開發套件額外弱點、各區塊狀態（任一次 OSV 失敗時對應區塊為 failed）。
- [ ] 日誌與 Task 結果訊息印出 `…/_build/results?buildId=…&view=<publisher>.<extension>.<tab contribution id>`，Team Project 名稱 URL 編碼。
- [ ] workflow 假服務測試驗證附件上傳一次、內容符合契約、不再呼叫 uploadSummary、上傳失敗被回報。
