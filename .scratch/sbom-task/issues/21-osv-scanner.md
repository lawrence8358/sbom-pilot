# 21: OSV 弱點掃描、工具快取與成品報告

Type: task
Status: ready-for-human
Blocked by: 20

## 規格

使用者透過 grill-with-docs 確認 Q1–Q4，詳細規格與來源見 [OSV spec](../../osv-scanner/spec.md)。

## 驗收

- 所有模式新增預設啟用的 OSV 掃描，取消時不準備 OSV。
- 官方 latest 或精確版本，Node 下載官方 binary 並核對 SHA-256；同 Agent 同版本快取重用。
- 本次 SBOM 掃描產生 Markdown sbom.osv.md，與 SBOM 同一 Build Artifact。
- 發現弱點警告；技術失敗讓 Task 失敗但保留有效 SBOM；不遮蔽 DT 錯誤。
- 預設 sbom.cdx.json，保留自訂檔名；文件、範例、相關驗證同步更新。
- 報告增加每列風險等級、CVE 編號及由高到低排序；沒有評分／CVE 明示未知／未提供，不猜測。
- 同份報告附至CI執行結果的Extensions Markdown Summary，可直接查看；成品仍保留。
- 完成受影響單元測試、真工具 Windows／Linux smoke 與本機封裝驗證；無真 Azure 執行不宣稱雲端已驗收。

## Comments

- 2026-11-09：使用者確認完整方案並要求相同 Agent 的既有版本不要反覆安裝。僅本機實作與封裝，未收到本輪公開發布指令。
- 使用者要求撤回本機提交；已 mixed reset 回原7dd8827、所有檔案保留為未提交變更。後續不 commit、merge、push 或發布，除非使用者另外要求。

## Answer

本機實作、文件、136單元、Windows/Linux真OSV與封裝驗證及獨立審查完成；交付保留未提交狀態，未發布。完整結果與限制見 [21驗證](../reviews/21-osv-scanner.md)。
