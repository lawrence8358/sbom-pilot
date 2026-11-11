# 34: 0.3.1 發佈與實機驗收

Type: task
Status: ready-for-agent
Blocked by: 30, 32, 33

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 36–38；ADR 0003。

## 要建立的行為

完整 SBOM、DT 上傳版本、雙份 OSV 報告與「OSV 弱點報告」頁籤以 0.3.1 發佈。文件讓升級中的使用者知道行為改變、還原方式與管理員需要重新同意權限，並在 primeeagle 實機驗收。

## 驗收

- [ ] Task 與擴充套件版本升為 0.3.1，封裝測試通過。
- [ ] README、README-Dev、task.json 說明更新；release notes 寫明 DT 預設改為完整 SBOM、開發套件弱點也會擋建置、還原方式（DT 上傳版本選產品 SBOM；門檻調整或選「僅警告」），以及新增 `vso.build` 權限需組織管理員重新同意。
- [ ] 在 primeeagle 以暫時管線實跑：成品含 4 個檔且中文檔名下載解壓正常；頁籤只在 SBOM Pilot 建置出現、深淺主題正常無亂碼；直達連結停在頁籤；Extensions 不再有 OSV 報告。
- [ ] 驗收後刪除暫時管線與分支，並記錄結果於本工單 Comments。

## Comments
