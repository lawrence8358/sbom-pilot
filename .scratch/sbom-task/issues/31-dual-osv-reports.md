# 31: 雙份 OSV 弱點報告，失敗門檻改看完整 SBOM

Type: task
Status: resolved
Blocked by: 29

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 11–15；ADR 0003。

## 要建立的行為

產品 SBOM 與完整 SBOM 都執行 OSV 掃描，兩份 OSV 弱點報告分別以 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md` 發佈到成品。每筆弱點帶有發佈日期與最後修改日期，並可分辨哪些是「開發套件額外」的弱點。OSV 失敗門檻與 Warnings／Errors issue 改以完整 SBOM 的結果判定，因此開發套件的弱點也會擋 DT 並讓 Task 失敗。Extensions 摘要暫時保留（內容為產品報告），由 32 移除。

## 驗收

- [x] OSV 工具每次執行只解析／下載一次，兩次掃描共用。
- [x] 兩份報告皆以 UTF-8 寫出並發佈到同一個 Build Artifact，檔名為 `OSV弱點報告-產品.md`、`OSV弱點報告-完整.md`。
- [x] 逐筆弱點新增 published／modified（取匹配記錄中最早 published、最晚 modified，UTC 日期 `YYYY-MM-DD`，缺漏為空），報告明細列出兩欄，缺漏顯示「未提供」。
- [x] 開發套件額外弱點 = 完整 SBOM 弱點扣除「生態系 + 套件名稱 + 版本 + 排序後 OSV ID 集合」與產品 SBOM 相同者；同套件不同版本、同版本不同弱點都算額外。
- [x] 門檻判定與 issue 輸出使用完整 SBOM 的弱點清單；開發套件額外弱點的 issue 訊息標示「開發套件」。
- [x] 只有開發套件弱點超標時也略過 DT 並讓 Task 失敗。
- [x] 產品或完整任一次 OSV 技術失敗都加入錯誤清單，並依既有規則（門檻非「僅警告」時略過 DT）處理。
- [x] Extensions 摘要暫時只附產品報告，行為與現在相同。
- [x] OSV 報告 fixture 測試涵蓋日期擷取與差集；workflow 假服務測試涵蓋門檻、技術失敗與成品發佈。

## Comments

- 2026-11-12：已整合到 main（`7144d6e`，由 `feature/full-sbom` 快轉合併）；本機 npm test 256/256、test:packaging 2/2；primeeagle 建置 2752–2755 實機驗證，0.3.4 頁籤依設計稿正常顯示。
