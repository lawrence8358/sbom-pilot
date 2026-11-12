# 30: DT 上傳版本開關

Type: task
Status: resolved
Blocked by: 29

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 8–10；ADR 0003。

## 要建立的行為

新增「DT 上傳版本」下拉選單（完整 SBOM（含開發套件）／產品 SBOM），預設完整，只在勾選推送到 DT 時顯示。DT 專案只收到選定的那一份 SBOM。

## 驗收

- [x] task.json 新增 pickList，固定英文值 `full`／`product`，中文標籤，預設 `full`，`visibleRule: uploadToDt = true`。
- [x] 只在啟用 DT 時讀取與驗證；不合法值明確失敗；未啟用 DT 時忽略。
- [x] 預設上傳完整 SBOM；選產品 SBOM 時上傳產品 SBOM；每次只上傳一份。
- [x] DT 日誌寫出上傳的是哪一份。
- [x] workflow 假服務測試與設定測試涵蓋預設、兩種選項與不合法值；封裝測試同步更新。

## Comments

- 2026-11-12：已整合到 main（`7144d6e`，由 `feature/full-sbom` 快轉合併）；本機 npm test 256/256、test:packaging 2/2；primeeagle 建置 2752–2755 實機驗證，0.3.4 頁籤依設計稿正常顯示。
