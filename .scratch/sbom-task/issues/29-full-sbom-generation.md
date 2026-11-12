# 29: 產生並發佈完整 SBOM

Type: task
Status: resolved
Blocked by: None (can start immediately)

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 1–7。

## 要建立的行為

每次執行在同一次依賴安裝後，以 cdxgen 產生產品 SBOM 與完整 SBOM，兩份都通過 CycloneDX 驗證並發佈到同一個 Build Artifact。產品 SBOM 檔名為 `sbomFileName`；完整 SBOM 不加 `--required-only`，檔名在 `sbomFileName` 最後的 `.json` 前加 `-full`。「成品名稱」「SBOM 檔名」在 Task 編輯器中不再帶預設值，未填時執行仍使用 `SBOM`、`sbom.cdx.json`。本張完成後，DT 上傳與 OSV 掃描暫時維持只處理產品 SBOM。

## 驗收

- [x] 依賴安裝只執行一次；cdxgen 執行兩次，一次帶 `--required-only`（產品 SBOM），一次不帶（完整 SBOM），其餘參數相同。
- [x] 完整 SBOM 檔名推導：`sbom.cdx.json` → `sbom.cdx-full.json`、`PrimeX.json` → `PrimeX-full.json`，`.JSON` 大小寫不分；推導後與產品 SBOM 同名時明確失敗。
- [x] 兩份 SBOM 都以既有 validator 驗證，日誌各自寫出組件數；任一份產生或驗證失敗 Task 就失敗。
- [x] 兩份 SBOM 都發佈到同一個 Build Artifact。
- [x] 掃描設定日誌列出兩份輸出與各自的 requiredOnly。
- [x] `artifactName`、`sbomFileName` 移除 task.json 預設值，說明文字改寫；未填時執行保底不變。
- [x] DT 上傳與 OSV 掃描行為不變（仍使用產品 SBOM）。
- [x] workflow 假服務測試與設定測試涵蓋上述案例；封裝測試同步更新。

## Comments

- 2026-11-12：已整合到 main（`7144d6e`，由 `feature/full-sbom` 快轉合併）；本機 npm test 256/256、test:packaging 2/2；primeeagle 建置 2752–2755 實機驗證，0.3.4 頁籤依設計稿正常顯示。
